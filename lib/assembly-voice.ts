/**
 * AssemblyAI Voice Agent — pure client core.
 *
 * Protocol per the public Voice Agent API docs
 * (https://www.assemblyai.com/docs/voice-agents/voice-agent-api):
 *   up:   session.update { session }, input.audio { audio: base64 pcm16 },
 *         session.end, tool.result
 *   down: session.ready, input.speech.started, reply.started,
 *         reply.audio { data }, reply.done { status },
 *         transcript.user.delta { text: full-so-far },
 *         transcript.agent.delta { delta: append, reply_id },
 *         transcript.user { text }, transcript.agent { text, reply_id },
 *         tool.call { tool_call_id, name, arguments },
 *         session.ended, session.error { code, message }
 *
 * Everything here is pure and unit-tested; the React hook and the audio
 * worklets in useAssemblyVoiceAgent.ts stay thin over this module.
 */

export const WIRE_RATE = 24_000;

// ── audio helpers ───────────────────────────────────────────────────────────

/** Clamp float [-1,1] samples to Int16 PCM. */
export function floatToPcm16(samples: Float32Array | number[]): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

/** Linear-interpolation resample (stateless; the worklet keeps streaming state). */
export function resampleLinear(input: Float32Array | number[], inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate || input.length === 0) {
    return Float32Array.from(input);
  }
  const ratio = inputRate / outputRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Chunked base64 for bytes (avoids call-stack limits on large frames). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');
}

// ── wire messages ───────────────────────────────────────────────────────────

export interface AssemblyToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface AssemblySessionConfig {
  system_prompt: string;
  greeting?: string;
  /** Voice Agent API inline sessions take a bare voice id string
   *  (the REST agent API uses { voice_id }; session.update does not). */
  voice?: string;
  keyterms?: string[];
  tools?: AssemblyToolDef[];
  turn_detection?: Record<string, unknown>;
}

/** The inline-config form of session.update (agent defined in-repo, not via dashboard). */
export function buildSessionUpdate(config: AssemblySessionConfig) {
  const session: Record<string, unknown> = {
    system_prompt: config.system_prompt,
  };
  if (config.greeting !== undefined) session.greeting = config.greeting;
  if (config.voice) session.output = { voice: config.voice };
  if (config.keyterms?.length) session.input = { keyterms: config.keyterms };
  if (config.tools?.length) session.tools = config.tools;
  if (config.turn_detection) session.turn_detection = config.turn_detection;
  return { type: 'session.update' as const, session };
}

// ── event reducer ───────────────────────────────────────────────────────────

export type AssemblyAction =
  | { kind: 'ready'; sessionId?: string }
  | { kind: 'user_partial'; text: string }
  | { kind: 'user_final'; text: string }
  | { kind: 'agent_partial'; text: string; replyId?: string }
  | { kind: 'agent_final'; text: string; replyId?: string }
  | { kind: 'agent_audio'; base64: string }
  | { kind: 'barge_in' }
  | { kind: 'reply_done'; status: string }
  | { kind: 'reply_started' }
  | { kind: 'tool_call'; toolCallId: string; name: string; args: unknown }
  | { kind: 'ended' }
  | { kind: 'error'; code?: string; message: string };

export interface ReducerState {
  lastEventType: string | null;
  liveReplyId?: string;
  agentText: string;
}

/**
 * Maps one wire event to at most one station action. `transcript.agent.delta`
 * carries only the next word with a reply_id: a new reply_id resets the
 * accumulated agent text; the same reply_id appends.
 */
export function reduceAgentEvent(state: ReducerState, msg: any): { state: ReducerState; action: AssemblyAction | null } {
  const next: ReducerState = { ...state, lastEventType: msg?.type ?? null };
  switch (msg?.type) {
    case 'session.ready':
      return { state: next, action: { kind: 'ready', sessionId: msg.session_id } };
    case 'input.speech.started':
      return { state: next, action: { kind: 'barge_in' } };
    case 'reply.started':
      return { state: next, action: { kind: 'reply_started' } };
    case 'reply.audio':
      return { state: next, action: { kind: 'agent_audio', base64: msg.data } };
    case 'reply.done':
      return { state: next, action: { kind: 'reply_done', status: msg.status } };
    case 'transcript.user.delta':
      return { state: next, action: { kind: 'user_partial', text: msg.text } };
    case 'transcript.user':
      return { state: next, action: { kind: 'user_final', text: msg.text } };
    case 'transcript.agent.delta': {
      const rid = msg.reply_id;
      if (rid && rid !== state.liveReplyId) {
        const s = { ...next, liveReplyId: rid, agentText: msg.delta };
        return { state: s, action: { kind: 'agent_partial', text: msg.delta, replyId: rid } };
      }
      const text = state.agentText + (state.agentText ? ' ' : '') + msg.delta;
      const s = { ...next, agentText: text };
      return { state: s, action: { kind: 'agent_partial', text, replyId: rid } };
    }
    case 'transcript.agent':
      return { state: { ...next, agentText: msg.text }, action: { kind: 'agent_final', text: msg.text, replyId: msg.reply_id } };
    case 'tool.call':
      return {
        state: next,
        action: { kind: 'tool_call', toolCallId: msg.tool_call_id, name: msg.name, args: msg.arguments },
      };
    case 'session.ended':
      return { state: next, action: { kind: 'ended' } };
    case 'session.error':
      return { state: next, action: { kind: 'error', code: msg.code, message: msg.message ?? 'session error' } };
    default:
      return { state: next, action: null };
  }
}

// ── client-tool result queue ────────────────────────────────────────────────

/**
 * Client tools may only answer once `reply.done` is the latest event received
 * (protocol constraint). Results queued earlier are flushed when reply.done
 * arrives; anything still queued at session end is dropped with the session.
 */
export class ToolResultQueue {
  private pending: Array<{ tool_call_id: string; output: unknown }> = [];
  private lastEventType: string | null = null;

  observe(eventType: string): Array<{ tool_call_id: string; output: unknown }> {
    this.lastEventType = eventType;
    if (eventType === 'reply.done') {
      const flushed = this.pending;
      this.pending = [];
      return flushed;
    }
    return [];
  }

  push(toolCallId: string, output: unknown): number {
    this.pending.push({ tool_call_id: toolCallId, output });
    return this.pending.length;
  }

  get size(): number {
    return this.pending.length;
  }
}

export function buildToolResult(toolCallId: string, output: unknown) {
  return { type: 'tool.result' as const, tool_call_id: toolCallId, output };
}
