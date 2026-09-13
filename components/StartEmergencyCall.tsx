/**
 * Kwik 112 — Live Voice Station
 *
 * Opens a real Hume EVI voice session, streams the caller's speech and prosody
 * in real time, then grades the finished conversation. A scripted mode runs the
 * same backend pipeline without a microphone.
 *
 * On call end the flow is optimistic: `POST /api/calls/create` grades with local
 * rules and returns in milliseconds, so a graded incident hits the board at
 * once; `POST /api/calls/refine` then upgrades it in place with the model. The
 * refinement is pure enrichment — if it is slow or fails, the local grade stands
 * and the operator is never interrupted by an error.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VoiceProvider, useVoice } from '@humeai/voice-react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Radio,
  Sparkles,
  X,
  Loader2,
  AlertTriangle,
  Play,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { EmergencyCall } from '@/lib/types';
import { Chip, Meter } from '@/components/ui/panel';
import { distressColor } from '@/lib/design/symbols';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { cn } from '@/lib/utils';
import {
  JUDGE_CALLER_PRESETS,
  GOLDEN_CALLER_PRESET,
  GOLDEN_DEMO_CONTRACT,
  goldenAttackEvidence,
  selectJudgeCallerPreset,
} from '@/lib/personas';
import {
  KWIK_LIVE_CALL_EVENT,
  buildLiveCallPayload,
  liveCallTranscriptFingerprint,
  type KwikLiveCallProsodySource,
  type KwikLiveCallState,
} from '@/lib/live-call';
import {
  emergencyVoiceConnectSettings,
  emergencyVoiceSessionSettings,
} from '@/lib/voice-launch';
import { readApiJson } from '@/lib/api-response';

interface StartEmergencyCallProps {
  onCallCreated?: (callId: string) => void;
  launchSignal?: number;
  initialScriptId?: string;
}

interface TranscriptLine {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  emotions?: Record<string, number>;
}

const VOICE_CONNECT_TIMEOUT_MS = 15000;

function createLiveCallId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `kwik-live-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @description Name the engine that actually graded the call. The operator must
 *              be able to tell a model verdict from a local-rule verdict, so this
 *              reads the method the server reported rather than assuming. The
 *              keyword path reads as `local rules`; a model path reads as its id.
 */
function describeTriageMethod(method: string): string {
  if (!method) return 'unknown';
  if (method === 'keyword') return 'local rules';
  const [provider, model] = method.split(':');
  if (provider === 'glm') return model || 'GLM';
  if (provider === 'openai') return model || 'OpenAI';
  return method;
}

/**
 * @description Turn a raw socket or getUserMedia failure into something an
 *              operator can act on. A blocked microphone is by far the most
 *              common cause and has a concrete remedy.
 */
function explainVoiceError(reason?: string): string {
  const raw = reason?.trim();
  if (!raw) return 'The voice session could not start. Run a scripted call instead, or try again.';
  if (/timed out|taking too long/i.test(raw)) {
    return 'The live voice session is taking too long to open. Run a scripted call now, or try live again after checking microphone permission.';
  }
  if (/permission|denied|notallowed|microphone|audio/i.test(raw)) {
    return 'Microphone access was blocked. Allow the mic for this site in your browser, then try again, or run a scripted call, which needs no microphone.';
  }
  if (/token|auth|401|403/i.test(raw)) {
    return 'Hume rejected the session credentials. Check HUME_API_KEY and HUME_SECRET_KEY on the server.';
  }
  return raw;
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

/**
 * @description Persist a triaged call and tell the dashboard about it.
 *
 * A create (`isUpdate: false`) writes the call wholesale. A model refinement
 * (`isUpdate: true`) arrives 10–25s later and MUST NOT clobber operator-owned
 * lifecycle state: by then the operator may have dragged the incident to a later
 * pipeline stage (persisting a new `status`), and the original `created_at`
 * anchors incident age and the two age-based alert rules. So an update merges —
 * operator-owned fields are taken from the stored record and only triage-derived
 * fields come from the refined call. The `kwik-call-updated` event carries the
 * real `isUpdate` flag so the dashboard does not steal the operator's selection.
 */
function publishCall(
  call: EmergencyCall,
  { isUpdate }: { isUpdate: boolean } = { isUpdate: false },
) {
  let record = call;
  try {
    const stored = localStorage.getItem('kwik_emergency_calls');
    const existing: EmergencyCall[] = stored ? JSON.parse(stored) : [];
    const prior = existing.find((c) => c.id === call.id);

    if (isUpdate && prior) {
      // Overwrite only triage-derived fields; preserve everything the operator
      // or the board owns — pipeline status, the original age anchor, and any
      // dispatch bookkeeping.
      record = {
        ...call,
        status: prior.status,
        created_at: prior.created_at,
        dispatched_units: prior.dispatched_units ?? call.dispatched_units,
        dispatch_time: prior.dispatch_time ?? call.dispatch_time,
        dispatcher_id: prior.dispatcher_id ?? call.dispatcher_id,
        resolved_at: prior.resolved_at ?? call.resolved_at,
      };
    }

    const deduped = existing.filter((c) => c.id !== call.id);
    localStorage.setItem('kwik_emergency_calls', JSON.stringify([record, ...deduped]));
  } catch (error) {
    logger.error('Could not persist call', { error });
  }
  window.dispatchEvent(
    new CustomEvent('kwik-call-updated', { detail: { call: record, isUpdate } }),
  );
}

function CallStation({
  onClose,
  onCallCreated,
  initialScriptId,
}: {
  onClose: () => void;
  onCallCreated?: (callId: string) => void;
  initialScriptId?: string;
}) {
  // micFft intentionally NOT destructured: the Hume SDK's live audio analyser
  // can enter a render-phase update loop in suspended/throttled WebViews when
  // the component subscribes to it, which freezes the whole station. The mic
  // level meter is cosmetic; live transcription and prosody do not need it.
  const {
    connect,
    disconnect,
    sendSessionSettings,
    status,
    messages,
    chatMetadata,
    isMuted,
    mute,
    unmute,
  } = useVoice();

  const [phase, setPhase] = useState<
    'idle' | 'connecting' | 'live' | 'scripted' | 'triaging' | 'done' | 'error'
  >('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [phone, setPhone] = useState('+91 98102 34512');
  const [result, setResult] = useState<EmergencyCall | null>(null);
  const [triageMethod, setTriageMethod] = useState<string>('');
  const [refining, setRefining] = useState(false);
  const [changed, setChanged] = useState<string[]>([]);
  const [scriptId, setScriptId] = useState(() => selectJudgeCallerPreset(initialScriptId).id);
  const [goldenAttackReady, setGoldenAttackReady] = useState(false);
  const [goldenEvidence, setGoldenEvidence] = useState<string | null>(null);
  const goldenContinueRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === 'golden') setScriptId('golden');
  }, []);
  const [scriptedLines, setScriptedLines] = useState<TranscriptLine[]>([]);
  // Prosody frames revealed by the scripted timer, so the emotion panel animates
  // during a demo the way it does off the live socket.
  const [scriptedFrames, setScriptedFrames] = useState<Record<string, number>[]>([]);
  // Which kind of session produced the readings on screen. Drives the MEASURED
  // vs SIMULATED labelling of the emotion panel — the two must never be confused.
  const [sessionKind, setSessionKind] = useState<'live' | 'scripted' | null>(null);
  const [scriptedLanguage, setScriptedLanguage] = useState<string | undefined>();
  const startedAt = useRef<number>(0);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const liveCallIdRef = useRef<string | null>(null);
  const lastLiveFingerprintRef = useRef('');
  const liveCallEndedRef = useRef(false);
  const handledVoiceErrorRef = useRef(false);
  const connectionAttemptRef = useRef(0);
  // Outstanding scripted-playback timers, cleared on unmount / close / restart so
  // a demo left mid-playback cannot fire into an unmounted component.
  const scriptTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearScriptTimers = useCallback(() => {
    scriptTimersRef.current.forEach((t) => clearTimeout(t));
    scriptTimersRef.current = [];
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, []);

  // Cancel timers and invalidate any token/connect continuation on unmount.
  // `disconnect` is read through a ref so this cleanup runs exactly once on
  // true unmount: depending on the SDK function directly re-runs the cleanup
  // whenever the VoiceProvider re-renders (its context identity changes during
  // connection status transitions), which cancels the in-flight EVI connect.
  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;
  const clearScriptTimersRef = useRef(clearScriptTimers);
  clearScriptTimersRef.current = clearScriptTimers;
  useEffect(() => () => {
    connectionAttemptRef.current += 1;
    clearScriptTimersRef.current();
    void disconnectRef.current();
  }, []);

  /** Derive the transcript, prosody frames, and detected language from the live
   *  EVI socket. Hume tags each finalized user message with the language it heard
   *  ("Detected language of the message text"); the call's language is the value
   *  seen most often across those messages. */
  const { lines, frames, detectedLanguage, interimText } = useMemo(() => {
    const out: TranscriptLine[] = [];
    const emotionFrames: Record<string, number>[] = [];
    const languageCounts: Record<string, string | number> = {};
    // EVI streams provisional transcripts (interim: true) while the caller is
    // still speaking; the finalized user_message supersedes them. Shown as the
    // live "ghost" line, but never graded — only finalized turns feed triage.
    let liveInterim = '';

    for (const message of messages) {
      if (message.type === 'user_message') {
        // Interim transcripts get refined; only keep finalized ones.
        if ((message as any).interim) {
          const partial = message.message?.content ?? '';
          if (partial.trim()) liveInterim = partial;
          continue;
        }
        liveInterim = '';
        const scores = (message as any).models?.prosody?.scores as
          | Record<string, number>
          | undefined;
        if (scores) emotionFrames.push(scores);
        const lang = (message as any).language;
        if (typeof lang === 'string' && lang.trim()) {
          const key = lang.trim();
          languageCounts[key] = ((languageCounts[key] as number) ?? 0) + 1;
        }
        out.push({
          role: 'user',
          text: message.message?.content ?? '',
          timestamp: new Date().toISOString(),
          emotions: scores,
        });
      } else if (message.type === 'assistant_message') {
        liveInterim = '';
        out.push({
          role: 'assistant',
          text: message.message?.content ?? '',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // The most frequently detected non-empty language across the call. Undefined
    // when EVI reported none — never invented.
    let language: string | undefined;
    let bestCount = 0;
    for (const [lang, count] of Object.entries(languageCounts)) {
      if ((count as number) > bestCount) {
        bestCount = count as number;
        language = lang;
      }
    }

    return {
      lines: out.filter((l) => l.text.trim()),
      frames: emotionFrames,
      detectedLanguage: language,
      interimText: liveInterim,
    };
  }, [messages]);

  // The HUD shows whichever transcript this session produced.
  const displayLines = lines.length ? lines : scriptedLines;

  // Live socket frames win; otherwise fall back to the scripted demo frames.
  const activeFrames = frames.length ? frames : scriptedFrames;

  /** Top five emotions from the most recent utterance (live or scripted). */
  const liveEmotions = useMemo(() => {
    const latest = activeFrames[activeFrames.length - 1];
    if (!latest) return [];
    return Object.entries(latest)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([emotion, intensity]) => ({ emotion, intensity }));
  }, [activeFrames]);

  useEffect(() => {
    if (phase !== 'live' && phase !== 'scripted') return;
    const timer = setInterval(() => setDuration(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
    // interimText too, so the panel follows the live ghost line mid-sentence.
  }, [displayLines.length, interimText]);

  const publishLiveCallEvent = useCallback((
    state: KwikLiveCallState,
    transcript: readonly TranscriptLine[],
    prosodySource: KwikLiveCallProsodySource,
    language?: string,
  ) => {
    const callId = liveCallIdRef.current;
    if (!callId || (liveCallEndedRef.current && state !== 'start')) return;
    if (state === 'end') liveCallEndedRef.current = true;

    window.dispatchEvent(new CustomEvent(KWIK_LIVE_CALL_EVENT, {
      detail: buildLiveCallPayload({
        state,
        callId,
        at: new Date().toISOString(),
        transcript,
        detectedLanguage: language ?? null,
        prosodySource,
      }),
    }));
  }, []);

  const beginLiveCallEvent = useCallback((
    prosodySource: KwikLiveCallProsodySource,
    language?: string,
    fixedCallId?: string,
  ) => {
    liveCallIdRef.current = fixedCallId ?? createLiveCallId();
    lastLiveFingerprintRef.current = '';
    liveCallEndedRef.current = false;
    publishLiveCallEvent('start', [], prosodySource, language);
  }, [publishLiveCallEvent]);

  useEffect(() => {
    if (phase !== 'live' && phase !== 'scripted') return;
    const transcript = phase === 'live' ? lines : scriptedLines;
    if (!transcript.length) return;
    const fingerprint = liveCallTranscriptFingerprint(transcript);
    if (fingerprint === lastLiveFingerprintRef.current) return;
    lastLiveFingerprintRef.current = fingerprint;
    publishLiveCallEvent(
      'update',
      transcript,
      phase === 'live' ? 'measured' : 'simulated',
      phase === 'live' ? detectedLanguage : scriptedLanguage,
    );
  }, [phase, lines, scriptedLines, detectedLanguage, scriptedLanguage, publishLiveCallEvent]);

  useEffect(() => {
    if (status.value !== 'error') {
      handledVoiceErrorRef.current = false;
      return;
    }
    if (!handledVoiceErrorRef.current) {
      handledVoiceErrorRef.current = true;
      if (sessionKind === 'live') {
        publishLiveCallEvent('end', lines, 'measured', detectedLanguage);
      }
      setErrorText(explainVoiceError(status.reason));
      setSessionKind(null);
      setPhase('error');
    }
  }, [status, sessionKind, lines, detectedLanguage, publishLiveCallEvent]);

  const closeStation = useCallback(() => {
    connectionAttemptRef.current += 1;
    if (sessionKind === 'live') {
      publishLiveCallEvent('end', lines, 'measured', detectedLanguage);
      void disconnect();
    } else if (sessionKind === 'scripted') {
      publishLiveCallEvent('end', scriptedLines, 'simulated', scriptedLanguage);
    }
    clearScriptTimers();
    onClose();
  }, [
    sessionKind,
    lines,
    detectedLanguage,
    scriptedLines,
    scriptedLanguage,
    disconnect,
    clearScriptTimers,
    onClose,
    publishLiveCallEvent,
  ]);

  // Initial focus into the dialog, a Tab trap, Escape-to-close, and focus
  // restored to the trigger on close — the same behaviour IncidentTimeline uses,
  // from the one shared hook so the two dialogs cannot diverge.
  const { dialogRef, onKeyDown } = useDialogFocus(true, closeStation);

  const startLiveCall = useCallback(async () => {
    const attempt = connectionAttemptRef.current + 1;
    connectionAttemptRef.current = attempt;
    setErrorText(null);
    clearScriptTimers();
    setScriptedLines([]);
    setScriptedFrames([]);
    setSessionKind('live');
    setPhase('connecting');
    try {
      const res = await withTimeout(
        fetch('/api/hume/token', { cache: 'no-store' }),
        VOICE_CONNECT_TIMEOUT_MS,
        'The live voice session timed out while requesting credentials.',
      );
      const data = await res.json();
      if (!res.ok || !data.accessToken) {
        throw new Error(data.error || 'Could not get a Hume access token.');
      }
      if (attempt !== connectionAttemptRef.current) return;
      await withTimeout(
        connect({
          auth: { type: 'accessToken', value: data.accessToken },
          configId: data.configId ?? undefined,
          sessionSettings: emergencyVoiceConnectSettings(),
        }),
        VOICE_CONNECT_TIMEOUT_MS,
        'The live voice session timed out while opening the microphone.',
      );
      if (attempt !== connectionAttemptRef.current) {
        await disconnect();
        return;
      }
      sendSessionSettings(emergencyVoiceSessionSettings());
      startedAt.current = Date.now();
      setDuration(0);
      beginLiveCallEvent('measured', detectedLanguage);
      setPhase('live');
      logger.info('EVI session connected');
    } catch (error) {
      if (attempt !== connectionAttemptRef.current) return;
      void disconnect();
      setErrorText(
        explainVoiceError(error instanceof Error ? error.message : undefined)
      );
      setSessionKind(null);
      setPhase('error');
    }
  }, [
    connect,
    disconnect,
    sendSessionSettings,
    clearScriptTimers,
    beginLiveCallEvent,
    detectedLanguage,
  ]);

  /**
   * Optimistic triage. Local rules grade the call and it appears on the board at
   * once; the model then refines it in place. Refinement failure is silent by
   * design — the local grade is a valid, life-safe grade on its own.
   */
  const triageAndPublish = useCallback(
    async (
      callerNumber: string,
      payloadLines: TranscriptLine[],
      emotionFrames: Record<string, number>[],
      seconds: number,
      prosodySource: 'measured' | 'simulated',
      // The language Hume detected in the caller's speech. Undefined on scripted
      // demos — a scripted call detected nothing, so it carries no language.
      detectedLanguage?: string,
      golden = false,
    ) => {
      setPhase('triaging');
      setChanged([]);
      setRefining(false);

      // 1. Local grade, returns in milliseconds.
      let created: any;
      try {
        const res = await fetch('/api/calls/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: callerNumber,
            transcript: payloadLines,
            emotions: emotionFrames,
            prosodySource,
            detectedLanguage,
            chatGroupId: chatMetadata?.chatGroupId,
            conversationId: golden ? GOLDEN_DEMO_CONTRACT.callId : chatMetadata?.chatId,
            callDurationSeconds: seconds,
          }),
        });
        created = await readApiJson<any>(res, 'Call triage');
        if (!created.call) throw new Error('Call triage returned an incomplete response. Please try again.');
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : 'Triage failed.');
        setPhase('error');
        return;
      }

      if (golden) {
        const evidence = goldenAttackEvidence(payloadLines);
        created.call.refinable = false;
        created.call.flags = [...(created.call.flags ?? []), 'SIMULATED_PROMPT_INJECTION', ...(evidence ? ['GOLDEN_CALLER_INJECTION_IGNORED'] : [])];
        if (evidence && created.call.safety_audit) {
          created.call.safety_audit.reason += ` ${evidence}. Simulated caller instruction; no model downgrade verdict was generated.`;
        }
      }
      publishCall(created.call);
      setResult(created.call);
      setTriageMethod(created.triage_method ?? created.call.triage_method ?? '');
      setPhase('done');
      onCallCreated?.(created.call.id);

      // 2. Enrich in the background. Failure is silent by design.
      if (created.refinable && !golden) {
        setRefining(true);
        try {
          const res = await fetch('/api/calls/refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callId: created.call.id,
              phoneNumber: callerNumber,
              transcript: payloadLines,
              emotions: emotionFrames,
              prosodySource,
              detectedLanguage,
              chatGroupId: chatMetadata?.chatGroupId,
              conversationId: chatMetadata?.chatId,
              callDurationSeconds: seconds,
            }),
          });
          const refined = await readApiJson<any>(res, 'Call refinement');
          if (refined?.call) {
            publishCall(refined.call, { isUpdate: true }); // republish; merge over the stored record
            setResult(refined.call);
            setTriageMethod(refined.triage_method ?? refined.call.triage_method ?? '');
            setChanged(Array.isArray(refined.changed) ? refined.changed : []);
          }
        } catch {
          // Local grade stands. No modal, no error state.
        } finally {
          setRefining(false);
        }
      }
    },
    [chatMetadata, onCallCreated]
  );

  const endLiveCall = useCallback(async () => {
    const seconds = Math.floor((Date.now() - startedAt.current) / 1000);
    await disconnect();
    publishLiveCallEvent('end', lines, 'measured', detectedLanguage);
    if (lines.length === 0) {
      setErrorText('The call ended before anything was said, so there is nothing to triage.');
      setPhase('error');
      return;
    }
    await triageAndPublish(phone, lines, frames, seconds, 'measured', detectedLanguage);
  }, [disconnect, lines, frames, detectedLanguage, phone, triageAndPublish, publishLiveCallEvent]);

  /**
   * Run a scripted caller through the same backend triage as a live call, but
   * reveal the transcript and its prosody one line at a time on a timer so the
   * emotion panel ANIMATES during playback instead of everything landing at once.
   * The frames are clearly labelled SIMULATED and the created call is flagged
   * `prosody_source: 'simulated'` — never dressed up as a live measurement.
   */
  const SCRIPT_STEP_MS = 2500;
  const runScript = useCallback(() => {
    const script = selectJudgeCallerPreset(scriptId);
    const language = script.speechLanguage.split('-')[0];
    const golden = script.id === 'golden';
    setGoldenAttackReady(false);
    setGoldenEvidence(null);
    goldenContinueRef.current = null;

    clearScriptTimers();
    setPhone(script.phone);
    setErrorText(null);
    setResult(null);
    setChanged([]);
    setScriptedLines([]);
    setScriptedFrames([]);
    setSessionKind('scripted');
    setScriptedLanguage(language);
    startedAt.current = Date.now();
    setDuration(0);
    beginLiveCallEvent('simulated', language, golden ? GOLDEN_DEMO_CONTRACT.callId : undefined);
    setPhase('scripted');

    const built: TranscriptLine[] = script.lines.map((line) => ({
      role: line.role ?? 'user',
      text: line.text,
      timestamp: new Date().toISOString(),
      emotions: line.emotions,
    }));
    // Accumulated as the timer fires, so the payload handed to triage matches
    // exactly what the panel showed.
    const collectedFrames: Record<string, number>[] = [];

    const playback = golden ? built.slice(0, -1) : built;
    playback.forEach((line, index) => {
      const timer = setTimeout(() => {
        setScriptedLines((prev) => [...prev, line]);
        if (!golden && typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(line.text);
          utterance.lang = script.speechLanguage;
          utterance.rate = line.role === 'assistant' ? 0.92 : 1.02;
          utterance.pitch = line.role === 'assistant' ? 0.92 : 1.08;
          window.speechSynthesis.speak(utterance);
        }
        if (line.emotions) {
          collectedFrames.push(line.emotions);
          setScriptedFrames((prev) => [...prev, line.emotions as Record<string, number>]);
        }
      }, index * (golden ? 3000 : SCRIPT_STEP_MS));
      scriptTimersRef.current.push(timer);
    });

    if (golden) {
      goldenContinueRef.current = () => {
        goldenContinueRef.current = null;
        setGoldenAttackReady(false);
        const attack = built[built.length - 1];
        setScriptedLines(built);
        if (attack.emotions) {
          collectedFrames.push(attack.emotions);
          setScriptedFrames((previous) => [...previous, attack.emotions!]);
        }
        const evidence = goldenAttackEvidence(built);
        setGoldenEvidence(evidence);
        publishLiveCallEvent('update', built, 'simulated', language);
        const finish = setTimeout(() => {
          const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
          publishLiveCallEvent('end', built, 'simulated', language);
          void triageAndPublish(script.phone, built, collectedFrames, seconds, 'simulated', language, true);
        }, 2000);
        scriptTimersRef.current.push(finish);
      };
      scriptTimersRef.current.push(setTimeout(() => setGoldenAttackReady(true), GOLDEN_DEMO_CONTRACT.pauseAtMs));
      return;
    }

    // Once the last line has played, grade the call through the same pipeline a
    // live call uses.
    const finishTimer = setTimeout(() => {
      const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
      publishLiveCallEvent('end', built, 'simulated', language);
      void triageAndPublish(script.phone, built, collectedFrames, seconds, 'simulated', language);
    }, built.length * SCRIPT_STEP_MS);
    scriptTimersRef.current.push(finishTimer);
  }, [scriptId, triageAndPublish, clearScriptTimers, beginLiveCallEvent, publishLiveCallEvent]);

  const reset = () => {
    clearScriptTimers();
    setPhase('idle');
    setGoldenAttackReady(false);
    setGoldenEvidence(null);
    goldenContinueRef.current = null;
    setResult(null);
    setErrorText(null);
    setDuration(0);
    setScriptedLines([]);
    setScriptedFrames([]);
    setSessionKind(null);
    setScriptedLanguage(undefined);
    setChanged([]);
    setRefining(false);
  };

  const mmss = `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`;
  const goldenGrade = useMemo(() => scriptId === 'golden' ? buildLiveCallPayload({
    state: 'update', callId: GOLDEN_DEMO_CONTRACT.callId, at: '', transcript: scriptedLines,
    detectedLanguage: 'hi', prosodySource: 'simulated',
  }).grade : null, [scriptId, scriptedLines]);
  const micLevel = 0;
  const didChange = (field: string) => changed.includes(field);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Kwik 112 call station"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[2500] flex items-center justify-center bg-deep/80 p-4 text-ink outline-none"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-md border border-rule-strong bg-panel">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-rule-strong bg-deep px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-critical/30 bg-critical/15 p-2 text-critical">
              <Radio className={cn('h-5 w-5', phase === 'live' && 'animate-pulse')} />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h2 className="text-md font-bold tracking-wide text-ink">Place a 112 call</h2>
                <Chip tone="critical" dot>
                  Kwik 112
                </Chip>
              </div>
              <p className="text-xs text-ink-3">Independent synthetic demo · not an official 112 service</p>
            </div>
          </div>
          <button
            onClick={closeStation}
            aria-label="Close voice station"
            className="rounded-md p-1.5 text-ink-3 hover:bg-panel-raised hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-12">
          {/* Controls */}
          <div className="space-y-4 lg:col-span-5">
            {phase === 'idle' || phase === 'error' ? (
              <>
                <button
                  onClick={startLiveCall}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-critical px-3 py-3 text-xs font-bold uppercase tracking-wide text-ink hover:bg-critical-bright"
                >
                  <Phone className="h-4 w-4" />
                  Start live demo call
                </button>
                <p className="text-center text-2xs text-ink-4">Hindi · Hinglish · English</p>

                <div className="space-y-2 border-t border-rule pt-3">
                  <span className="label block">Play a scripted caller</span>
                  <p className="text-xs leading-relaxed text-ink-4">
                    No microphone or network voice session needed. Browser speech uses the same triage pipeline.
                  </p>
                  <select
                    value={scriptId}
                    onChange={(e) => setScriptId(selectJudgeCallerPreset(e.target.value).id)}
                    aria-label="Scripted caller"
                    className="w-full rounded-md border border-rule-strong bg-deep px-3 py-2 text-sm text-ink-2 focus:border-accent focus:outline-none"
                  >
                    {[GOLDEN_CALLER_PRESET, ...JUDGE_CALLER_PRESETS].map((s) => (
                      <option key={s.id} value={s.id} className="bg-deep">
                        {s.name} - {s.description}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={runScript}
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-rule-strong bg-panel-raised px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-2 hover:text-ink"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Play scripted caller
                  </button>
                </div>
              </>
            ) : null}

            {phase === 'connecting' && (
              <div className="flex items-center gap-2 py-3 text-xs text-accent">
                <Loader2 className="h-4 w-4 animate-spin" />
                Opening secure voice session…
              </div>
            )}

            {phase === 'live' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={endLiveCall}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md border border-critical/30 bg-panel-raised px-3 py-3 text-xs font-bold uppercase tracking-wide text-ink hover:bg-critical"
                  >
                    <PhoneOff className="h-4 w-4" />
                    End call &amp; triage
                  </button>
                  <button
                    onClick={() => (isMuted ? unmute() : mute())}
                    aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                    className="rounded-md border border-rule-strong bg-panel-raised px-3 py-3 hover:bg-panel"
                  >
                    {isMuted ? <MicOff className="h-4 w-4 text-critical" /> : <Mic className="h-4 w-4 text-safe" />}
                  </button>
                </div>
                <Meter value={micLevel * 100} max={100} color="var(--safe)" />
              </div>
            )}

            {phase === 'scripted' && (
              <div className="flex items-center gap-2 rounded-md border border-mild/30 bg-mild/15 px-3 py-3 text-xs font-medium text-mild">
                <Loader2 className="h-4 w-4 animate-spin" />
                Playing simulated caller — emotion values are demo data, not measured.
              </div>
            )}

            {scriptId === 'golden' && sessionKind === 'scripted' && (
              <div className="space-y-2 rounded-md border border-accent/40 bg-accent/10 p-3 text-xs" aria-live="polite">
                <p className="font-bold text-accent">{GOLDEN_DEMO_CONTRACT.provenanceText}</p>
                {goldenGrade && <Chip tone="critical">{goldenGrade.priorityCode} · {goldenGrade.severity.toUpperCase()}</Chip>}
                {goldenAttackReady && <button type="button" onClick={() => goldenContinueRef.current?.()} className="w-full rounded-md bg-accent px-3 py-3 font-bold text-deep">Continue attack</button>}
                {goldenEvidence && <><p className="font-bold text-critical-soft">{goldenEvidence}</p><p>CRITICAL held. Simulated caller instruction; no model verdict was generated.</p></>}
                {!goldenEvidence && !goldenAttackReady && phase === 'scripted' && <p>Local rules are grading the caller. Attack pauses at 12 seconds.</p>}
              </div>
            )}

            {phase === 'triaging' && (
              <div className="flex items-center gap-2 py-3 text-xs text-accent">
                <Loader2 className="h-4 w-4 animate-spin" />
                Grading the transcript…
              </div>
            )}

            {errorText && (
              <div className="flex items-start gap-2 rounded-md border border-critical/30 bg-critical/15 p-3 text-xs leading-relaxed text-critical-soft">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-2">
                  <p>{errorText}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={runScript}
                      className="inline-flex items-center gap-1.5 rounded-[4px] bg-critical px-2.5 py-1.5 font-semibold text-ink"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden />
                      Play {selectJudgeCallerPreset(scriptId).name} now
                    </button>
                    <button onClick={reset} className="text-2xs underline">
                      Try live again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-2 rounded-md border border-rule-strong bg-deep p-3.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-safe">Triage complete</span>
                  <div className="flex items-center gap-1.5">
                    {refining && (
                      <Chip tone="accent" dot>
                        Refining
                      </Chip>
                    )}
                    <Chip tone="neutral">{describeTriageMethod(triageMethod)}</Chip>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-ink-2">
                  <div className={cn('flex justify-between py-0.5', didChange('severity') && 'refine-flash')}>
                    <span className="text-ink-4">Priority</span>
                    <span className="font-bold text-ink">
                      {result.priority_code} · {result.severity}
                    </span>
                  </div>
                  <div className={cn('flex justify-between py-0.5', didChange('severity_score') && 'refine-flash')}>
                    <span className="text-ink-4">Score</span>
                    <span className="tnum text-ink">{result.severity_score}/100</span>
                  </div>
                  <div className={cn('flex justify-between py-0.5', didChange('incident_subtype') && 'refine-flash')}>
                    <span className="text-ink-4">Incident</span>
                    <span className="text-right text-ink">{result.incident_subtype}</span>
                  </div>
                  <div className={cn('flex justify-between gap-3 py-0.5', didChange('caller_location.address') && 'refine-flash')}>
                    <span className="text-ink-4">Location</span>
                    <span className="text-right text-ink">{result.caller_location?.address}</span>
                  </div>
                </div>
                <p
                  className={cn(
                    'border-t border-rule pt-2 leading-relaxed text-ink-2',
                    didChange('ai_summary') && 'refine-flash'
                  )}
                >
                  {result.ai_summary}
                </p>
                <button
                  onClick={closeStation}
                  className="w-full rounded-md bg-accent px-3 py-2 text-xs font-medium uppercase tracking-wide text-deep hover:bg-accent-bright"
                >
                  View on dispatch board
                </button>
              </div>
            )}
          </div>

          {/* Live HUD */}
          <div className="flex flex-col gap-4 rounded-md border border-rule-strong bg-deep p-5 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-3 w-3 rounded-full',
                    phase === 'live'
                      ? 'animate-ping bg-critical'
                      : phase === 'scripted'
                      ? 'animate-ping bg-mild'
                      : 'bg-ink-4',
                  )}
                />
                <span className="text-sm font-bold uppercase tracking-wide text-ink">
                  {phase === 'live'
                    ? `Live call · ${mmss}`
                    : phase === 'scripted'
                    ? `Simulated call · ${mmss}`
                    : phase === 'done'
                    ? 'Call ended'
                    : 'Ready'}
                </span>
              </div>
              <span className="text-2xs text-ink-4">
                {chatMetadata?.chatGroupId ? `group ${chatMetadata.chatGroupId.slice(0, 8)}` : 'no session'}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  Emotion telemetry
                </span>
                {/* MEASURED vs SIMULATED — two visually distinct states so a
                    scripted curve is never mistaken for a real Hume reading. */}
                {sessionKind === 'scripted' ? (
                  <Chip tone="mild" dot>
                    SIMULATED · demo values
                  </Chip>
                ) : sessionKind === 'live' ? (
                  <Chip tone="safe" dot>
                    MEASURED · live Hume EVI
                  </Chip>
                ) : (
                  <span className="text-ink-4">no source yet</span>
                )}
              </div>

              {liveEmotions.length ? (
                <div className="grid grid-cols-5 gap-2">
                  {liveEmotions.map(({ emotion, intensity }) => (
                    <div
                      key={emotion}
                      className="space-y-1 rounded-md border border-rule bg-panel p-2 text-center"
                    >
                      <span className="block truncate text-2xs text-ink-3" title={emotion}>
                        {emotion}
                      </span>
                      <Meter value={intensity * 100} max={100} color={distressColor(intensity * 100)} />
                      <span className="tnum text-2xs font-bold text-ink">{Math.round(intensity * 100)}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-[58px] items-center justify-center rounded-md border border-rule bg-panel text-2xs text-ink-4">
                  Emotion telemetry appears once the caller speaks
                </div>
              )}
            </div>

            <div
              ref={transcriptRef}
              className="max-h-[280px] min-h-[200px] flex-1 space-y-2 overflow-y-auto rounded-md border border-rule bg-panel p-3 text-sm"
            >
              {displayLines.length === 0 && !(phase === 'live' && interimText.trim()) ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-xs text-ink-4">
                  {phase === 'live'
                    ? 'Connected. Speak into the microphone — the transcript appears here.'
                    : 'Start a live demo call or play a scripted caller to see the transcript.'}
                </div>
              ) : (
                <>
                  {displayLines.map((line, i) => (
                    <div
                      key={i}
                      className={cn('flex gap-2', line.role === 'user' ? 'text-mild' : 'text-accent')}
                    >
                      <span className="shrink-0 text-2xs font-bold uppercase">
                        [{line.role === 'user' ? 'caller' : 'ai'}]
                      </span>
                      <div className="min-w-0">
                        <p className="leading-relaxed">{line.text}</p>
                        {/* Prosody measured by Hume on this exact utterance —
                            top three only, labelled, never summarized away. */}
                        {line.role === 'user' && line.emotions ? (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {Object.entries(line.emotions)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 3)
                              .map(([emotion, intensity]) => (
                                <span
                                  key={emotion}
                                  title={sessionKind === 'scripted' ? 'Simulated prosody for scripted playback; not measured' : 'Measured by Hume EVI prosody on this utterance'}
                                  className="rounded border border-rule bg-deep px-1 py-px text-2xs text-ink-3"
                                >
                                  {emotion} {Math.round(intensity * 100)}%
                                </span>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {/* Live ghost line: provisional transcript while the caller is
                      still mid-sentence. Replaced by the finalized turn above. */}
                  {phase === 'live' && interimText.trim() ? (
                    <div className="flex gap-2 text-ink-3">
                      <span className="shrink-0 text-2xs font-bold uppercase">[caller]</span>
                      <p className="leading-relaxed italic">
                        {interimText}
                        <span className="animate-pulse">▍</span>
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StartEmergencyCall({
  onCallCreated,
  launchSignal = 0,
  initialScriptId,
}: StartEmergencyCallProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (launchSignal > 0) setIsOpen(true);
  }, [launchSignal]);

  return (
    <>
      <button
        type="button"
        aria-label="Start 112 voice call"
        onClick={() => setIsOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-critical px-2.5 py-2 text-xs font-bold uppercase tracking-wide text-ink transition-transform hover:scale-105 hover:bg-critical-bright lg:gap-2 lg:px-3.5"
      >
        <Phone className="h-4 w-4 shrink-0" aria-hidden />
        <span className="lg:hidden">112 call</span>
        <span className="hidden lg:inline">Start 112 voice call</span>
      </button>

      {isOpen && (
        <VoiceProvider>
          <CallStation
            onClose={() => setIsOpen(false)}
            onCallCreated={onCallCreated}
            initialScriptId={initialScriptId}
          />
        </VoiceProvider>
      )}
    </>
  );
}
