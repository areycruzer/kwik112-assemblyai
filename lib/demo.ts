import type { EmergencyCall } from './types.ts';
import type { DecisionRecord } from './timeline.ts';

export const DEMO_STEPS = [
  { id: 'preflight', label: 'Preflight' },
  { id: 'live_call', label: 'Live call' },
  { id: 'ai_triage', label: 'AI triage' },
  { id: 'human_approval', label: 'Human approval' },
  { id: 'dispatch', label: 'Dispatch' },
  { id: 'audit', label: 'Audit' },
] as const;

export type DemoStep = (typeof DEMO_STEPS)[number]['id'];

export interface DemoLine {
  role: 'user' | 'assistant';
  text: string;
  emotions?: Record<string, number>;
}

export const HINGLISH_DEMO_LOCATION = {
  latitude: 28.6304,
  longitude: 77.2177,
  city: 'New Delhi',
} as const;

export const HINGLISH_DEMO_LINES: readonly DemoLine[] = [
  {
    role: 'user',
    text: 'Mere papa respond nahi kar rahe, saans bhi nahi aa rahi. Please jaldi help bhejiye.',
    emotions: { Panic: 0.96, Distress: 0.94, Fear: 0.91 },
  },
  {
    role: 'assistant',
    text: 'Help is being arranged. Stay with me. Aapki exact location kya hai?',
  },
  {
    role: 'user',
    text: 'Hum Sample Metro Gate 1 ke public entrance par hain.',
    emotions: { Distress: 0.9, Anxiety: 0.84, Fear: 0.76 },
  },
  {
    role: 'assistant',
    text: 'Location confirm: Sample Metro Gate 1. Kya woh bilkul unresponsive hain aur normal breathing nahi hai?',
  },
  {
    role: 'user',
    text: 'Haan, bilkul unresponsive hain. Pulse bhi feel nahi ho rahi.',
    emotions: { Panic: 0.93, Distress: 0.96, Desperation: 0.88 },
  },
  {
    role: 'assistant',
    text: 'Help is being arranged. Stay with me. Main aapko agla safe step bataunga.',
  },
];

export function deriveDemoStep({
  call,
  records,
  intakeStarted,
}: {
  call: Pick<EmergencyCall, 'status'> | null;
  records: readonly Pick<DecisionRecord, 'point'>[];
  intakeStarted: boolean;
}): DemoStep {
  if (!call) return intakeStarted ? 'live_call' : 'preflight';
  const decided = new Set(records.map((record) => record.point));
  if (decided.has('RESOLUTION')) return 'audit';
  if (decided.has('DISPATCH') || ['dispatched', 'en-route', 'on_scene', 'mitigating'].includes(call.status)) {
    return 'dispatch';
  }
  if (decided.has('INTAKE')) return 'human_approval';
  return 'ai_triage';
}

export interface DemoAuditRow {
  label: string;
  value: string;
}

export function demoAuditRows(
  call: Pick<
    EmergencyCall,
    | 'id'
    | 'incident_subtype'
    | 'incident_type'
    | 'severity'
    | 'prosody_source'
    | 'triage_method'
    | 'dispatched_units'
  >,
  records: readonly Pick<DecisionRecord, 'point' | 'action' | 'at'>[],
): DemoAuditRow[] {
  const synthetic = call.prosody_source === 'simulated';
  const method = call.triage_method || 'keyword';
  return [
    {
      label: 'Incident',
      value: `#${call.id} · ${call.incident_subtype || call.incident_type || 'unclassified'} · ${(call.severity || 'ungraded').toUpperCase()}`,
    },
    { label: 'Call path', value: synthetic ? 'Scripted caller · browser speech' : 'Live Hume EVI voice call' },
    {
      label: 'Prosody',
      value: synthetic ? 'Simulated — not a measured signal' : 'Measured by Hume EVI',
    },
    {
      label: 'Triage',
      value: method === 'keyword' ? 'Local safety rules' : `Model refinement · ${method}`,
    },
    {
      label: 'Human decisions',
      value: `${records.length} of 3 recorded${records.length ? ` · ${records.map((record) => `${record.point}:${record.action}`).join(', ')}` : ''}`,
    },
    {
      label: 'Selected units',
      value: call.dispatched_units?.length ? call.dispatched_units.join(', ') : 'Recorded through dispatch reservation',
    },
  ];
}
