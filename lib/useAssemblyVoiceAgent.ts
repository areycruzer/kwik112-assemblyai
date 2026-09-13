'use client';

/**
 * useAssemblyVoiceAgent — browser client for the AssemblyAI Voice Agent API.
 *
 * Thin by design: all protocol logic lives in the pure lib/assembly-voice.ts.
 * This hook owns the three stateful browser things — the microphone, the
 * speaker, and the WebSocket — plus the session lifecycle rule that a call is
 * only over once `session.ended` arrives (or the socket closes).
 *
 * Protocol and DSP approach follow the public Voice Agent API docs; the
 * worklets below are written for this project (24 kHz PCM16 wire format,
 * linear-interpolation capture resampler, ring-buffer playback with a
 * barge-in flush).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssemblyAction, AssemblySessionConfig, ReducerState } from './assembly-voice.ts';
import {
  CAPTURE_WORKLET_SOURCE,
  PLAYBACK_WORKLET_SOURCE,
  ToolResultQueue,
  buildSessionUpdate,
  buildToolResult,
  bytesToBase64,
  reduceAgentEvent,
  WIRE_RATE,
} from './assembly-voice.ts';

export type AgentStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'ended' | 'error';

interface StartOptions {
  config: AssemblySessionConfig;
  /** Handle a client tool call; return the result payload (sync or async). */
  onToolCall?: (name: string, args: unknown) => unknown | Promise<unknown>;
}

function blobUrl(code: string): string {
  return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
}

export function useAssemblyVoiceAgent(onAction: (action: AssemblyAction) => void) {
  const [status, setStatus] = useState<AgentStatus>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackRef = useRef<AudioWorkletNode | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const captureNodeRef = useRef<AudioWorkletNode | null>(null);
  const reducerRef = useRef<ReducerState>({ lastEventType: null, agentText: '' });
  const toolQueueRef = useRef(new ToolResultQueue());
  const onToolCallRef = useRef<StartOptions['onToolCall']>(undefined);
  const tokenRef = useRef<string>('');

  const hardCleanup = useCallback(() => {
    try { captureNodeRef.current?.disconnect(); } catch {}
    try { playbackRef.current?.disconnect(); } catch {}
    micRef.current?.getTracks().forEach((t) => t.stop());
    void captureCtxRef.current?.close().catch(() => {});
    void playbackCtxRef.current?.close().catch(() => {});
    captureNodeRef.current = null; playbackRef.current = null;
    micRef.current = null; captureCtxRef.current = null; playbackCtxRef.current = null;
  }, []);

  useEffect(() => () => {
    try { wsRef.current?.close(); } catch {}
    hardCleanup();
  }, [hardCleanup]);

  const dispatch = useCallback((action: AssemblyAction) => {
    if (action.kind === 'ready') setStatus('listening');
    else if (action.kind === 'reply_started') setStatus('speaking');
    else if (action.kind === 'reply_done' || action.kind === 'barge_in') setStatus('listening');
    else if (action.kind === 'ended') setStatus('ended');
    else if (action.kind === 'error') setStatus('error');
    onAction(action);
  }, [onAction]);

  const send = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const flushToolResults = useCallback(() => {
    // Caller only invokes this after reply.done was the latest event.
    // Safety: re-check via queue state by sending whatever observe returned upstream.
  }, []);

  const start = useCallback(async ({ config, onToolCall }: StartOptions) => {
    onToolCallRef.current = onToolCall;
    setStatus('connecting');
    try {
      const res = await fetch('/api/assemblyai/token', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.token) throw new Error(data.error || 'Could not mint an AssemblyAI token.');
      tokenRef.current = data.token;

      const url = new URL('wss://agents.assemblyai.com/v1/ws');
      url.searchParams.set('token', tokenRef.current);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        send(buildSessionUpdate(config));
      };

      ws.onmessage = ({ data: raw }) => {
        let msg: any;
        try { msg = JSON.parse(raw); } catch { return; }
        const { state, action } = reduceAgentEvent(reducerRef.current, msg);
        reducerRef.current = state;

        // Audio and barge-in are handled here, inside the hook.
        if (msg.type === 'reply.audio' && typeof msg.data === 'string') {
          const bin = atob(msg.data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          playbackRef.current?.port.postMessage(bytes.buffer, [bytes.buffer]);
        }
        if (msg.type === 'input.speech.started' || (msg.type === 'reply.done' && msg.status === 'interrupted')) {
          playbackRef.current?.port.postMessage('stop');
        }

        // Client tools answer only once reply.done is the latest event.
        if (msg.type === 'tool.call' && msg.tool_call_id) {
          void Promise.resolve(
            onToolCallRef.current?.(msg.name, msg.arguments) ?? { error: 'no handler' }
          ).then((output) => {
            toolQueueRef.current.push(msg.tool_call_id, output);
          });
        }
        if (msg.type === 'reply.done') {
          const flushed = toolQueueRef.current.observe('reply.done');
          for (const item of flushed) send(buildToolResult(item.tool_call_id, item.output));
        } else if (typeof msg.type === 'string') {
          toolQueueRef.current.observe(msg.type);
        }

        if (msg.type === 'session.ended') {
          ws.close();
        }
        if (action) dispatch(action);
      };

      ws.onclose = () => {
        if (status !== 'error') setStatus((s) => (s === 'ended' ? s : 'ended'));
        dispatch({ kind: 'ended' });
        hardCleanup();
      };
      ws.onerror = () => {
        setStatus('error');
        dispatch({ kind: 'error', message: 'Voice agent connection failed.' });
      };

      // Audio contexts in the click handler's task so Safari will start them.
      const captureCtx = new AudioContext({ sampleRate: WIRE_RATE });
      const playbackCtx = new AudioContext({ sampleRate: WIRE_RATE });
      captureCtxRef.current = captureCtx;
      playbackCtxRef.current = playbackCtx;
      await Promise.all([captureCtx.resume(), playbackCtx.resume()]);

      const captureUrl = blobUrl(CAPTURE_WORKLET_SOURCE);
      const playbackUrl = blobUrl(PLAYBACK_WORKLET_SOURCE);
      await Promise.all([
        captureCtx.audioWorklet.addModule(captureUrl),
        playbackCtx.audioWorklet.addModule(playbackUrl),
      ]);
      URL.revokeObjectURL(captureUrl);
      URL.revokeObjectURL(playbackUrl);

      const playback = new AudioWorkletNode(playbackCtx, 'kwik-playback');
      playback.connect(playbackCtx.destination);
      playbackRef.current = playback;

      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micRef.current = mic;
      const capture = new AudioWorkletNode(captureCtx, 'kwik-capture');
      captureNodeRef.current = capture;
      captureCtx.createMediaStreamSource(mic).connect(capture);
      capture.port.onmessage = ({ data }) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const bytes = new Uint8Array(data);
        send({ type: 'input.audio', audio: bytesToBase64(bytes) });
      };
    } catch (error) {
      setStatus('error');
      dispatch({ kind: 'error', message: error instanceof Error ? error.message : 'Could not start the voice agent.' });
      hardCleanup();
    }
  }, [dispatch, hardCleanup, send, status]);

  const stop = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      send({ type: 'session.end' });
      // If the server never confirms, close anyway — the API resumes idle
      // sessions for ~30s otherwise, which keeps billing.
      setTimeout(() => { try { ws.close(); } catch {} }, 4_000);
    }
    hardCleanup();
  }, [hardCleanup, send]);

  return { status, start, stop };
}
