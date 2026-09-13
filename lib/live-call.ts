import type { IncidentType, Location, PriorityCode, Severity } from './types.ts';
import { localTriage, priorityFromSeverity, scoreOf } from './triage-local.ts';

export const KWIK_LIVE_CALL_EVENT = 'kwik-live-call' as const;

export type KwikLiveCallState = 'start' | 'update' | 'end';
export type KwikLiveCallProsodySource = 'measured' | 'simulated' | 'absent';

export interface KwikLiveCallTurn {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  emotions?: Record<string, number>;
}
export interface KwikLiveCallGrade {
  incidentType: IncidentType;
  incidentSubtype: string;
  severity: Severity;
  severityScore: number;
  priorityCode: PriorityCode;
  location: Location;
  summary: string;
  method: 'keyword';
}

interface KwikLiveCallBase {
  version: 1;
  callId: string;
  at: string;
  transcript: readonly KwikLiveCallTurn[];
  detectedLanguage: string | null;
  prosodySource: KwikLiveCallProsodySource;
}

export type KwikLiveCallPayload =
  | (KwikLiveCallBase & { state: 'start'; grade: null })
  | (KwikLiveCallBase & { state: 'update' | 'end'; grade: KwikLiveCallGrade | null });

export interface BuildLiveCallPayloadInput {
  state: KwikLiveCallState;
  callId: string;
  at: string;
  transcript: readonly KwikLiveCallTurn[];
  detectedLanguage: string | null;
  prosodySource: KwikLiveCallProsodySource;
}

function gradeCallerTurns(transcript: readonly KwikLiveCallTurn[]): KwikLiveCallGrade | null {
  const callerTranscript = transcript
    .filter((turn) => turn.role === 'user')
    .map((turn) => turn.text.trim())
    .filter(Boolean)
    .join(' ');
  if (!callerTranscript) return null;

  const triage = localTriage(callerTranscript);
  return {
    incidentType: triage.extraction.incident_type,
    incidentSubtype: triage.extraction.incident_subtype,
    severity: triage.extraction.severity,
    severityScore: scoreOf(triage),
    priorityCode: priorityFromSeverity(triage.extraction.severity),
    location: { ...triage.extraction.location },
    summary: triage.extraction.summary,
    method: 'keyword',
  };
}

export function buildLiveCallPayload(input: BuildLiveCallPayloadInput): KwikLiveCallPayload {
  const base: KwikLiveCallBase = {
    version: 1,
    callId: input.callId,
    at: input.at,
    transcript: input.transcript.map((turn) => ({
      ...turn,
      ...(turn.emotions ? { emotions: { ...turn.emotions } } : {}),
    })),
    detectedLanguage: input.detectedLanguage,
    prosodySource: input.prosodySource,
  };

  if (input.state === 'start') return { ...base, state: 'start', grade: null };
  return {
    ...base,
    state: input.state,
    grade: gradeCallerTurns(input.transcript),
  };
}

export function liveCallTranscriptFingerprint(transcript: readonly KwikLiveCallTurn[]): string {
  return JSON.stringify(transcript.map(({ role, text }) => [role, text]));
}
