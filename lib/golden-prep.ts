import type { EmergencyCall } from './types.ts';
import { localTriage, prankMismatchFlag, priorityFromSeverity, scoreOf } from './triage-local.ts';

/** Recording fixtures, graded by the same local rules as incoming calls. */
export function goldenBackgroundCalls(now = Date.now()): EmergencyCall[] {
  return [
    { id: 'golden-background-review', text: 'At Rohini Delhi. I called to ask a general question.', title: 'POSSIBLE_PRANK · human review', emotion: 'amusement' },
    { id: 'golden-background-routine', text: 'At Rohini Delhi. Requesting general information.', title: 'Routine information · LOW', emotion: 'neutral' },
  ].map((seed, index) => {
    const result = localTriage(seed.text);
    const flag = prankMismatchFlag(result.extraction.severity, 5, seed.emotion);
    const at = new Date(now - (index + 1) * 20000).toISOString();
    return {
      id: seed.id, caller_number: '+91 00000 00000', status: 'triage', call_status: 'completed',
      created_at: at, updated_at: at, severity: result.extraction.severity,
      severity_score: scoreOf(result), priority_code: priorityFromSeverity(result.extraction.severity),
      incident_type: result.extraction.incident_type, incident_subtype: seed.title,
      ai_summary: seed.text, ai_confidence: 0.8, triage_method: 'keyword', triage_engine: 'local',
      prosody_source: 'simulated', distress_level: 5, top_emotion: seed.emotion,
      flags: [...result.flags, ...(flag ? [flag] : [])], labels: result.labels,
      caller_location: { address: 'Rohini, Delhi (approximate demo location)', city: 'New Delhi', latitude: 28.7196, longitude: 77.1186, confidence: 0.6, accuracy_radius: 1200, source: 'caller' },
      transcript: [{ role: 'user', text: seed.text, timestamp: at }],
    } as EmergencyCall;
  });
}

/** Only the named demo stores are reset. Other origin data is untouched. */
export function prepareGoldenDemo(storage: Pick<Storage, 'setItem' | 'removeItem'>, now = Date.now()) {
  const calls = goldenBackgroundCalls(now);
  for (const key of ['dispatch_alert_acks', 'dispatch_timeline', 'dispatch_unit_reservations', 'kwik112_incident_fusion_decisions']) storage.removeItem(key);
  storage.setItem('kwik_emergency_calls', JSON.stringify(calls));
  return calls;
}
