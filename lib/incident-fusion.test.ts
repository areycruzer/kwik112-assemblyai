import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findFusionSuggestions,
  fusionDecisionFor,
  linkedPrimaryFor,
  isSeparateDispatchTransitionBlocked,
  readFusionDecisions,
  recordFusionDecision,
  writeFusionDecisions,
} from './incident-fusion.ts';
import type { EmergencyCall } from './types.ts';
import type { FusionDecisionMap } from './incident-fusion.ts';

function call(id: string, overrides: Partial<EmergencyCall> = {}): EmergencyCall {
  return {
    id,
    caller_number: `+91${id}`,
    status: 'active',
    call_status: 'in-progress',
    incident_type: 'fire',
    severity: 'high',
    severity_score: 80,
    persons_involved: 2,
    immediate_threats: ['heavy smoke'],
    ai_summary: 'Apartment fire near Sector 16 Rohini market.',
    caller_location: {
      address: 'Sector 16, Rohini, Delhi',
      latitude: 28.7196,
      longitude: 77.1186,
      confidence: 0.9,
    },
    created_at: '2026-09-05T10:00:00.000Z',
    updated_at: '2026-09-05T10:00:00.000Z',
    ...overrides,
  };
}

test('suggests fusion for nearby same-type calls within ten minutes', () => {
  const suggestions = findFusionSuggestions([
    call('a'),
    call('b', {
      ai_summary: 'Bahut dhuaan hai, Rohini Sector 16 apartment mein aag lagi hai.',
      caller_location: {
        address: 'Rohini Sector 16 market, Delhi',
        latitude: 28.7205,
        longitude: 77.1194,
        confidence: 0.85,
      },
      created_at: '2026-09-05T10:04:00.000Z',
    }),
  ]);

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.primary_call_id, 'a');
  assert.deepEqual(suggestions[0]?.related_call_ids, ['b']);
  assert.ok((suggestions[0]?.confidence ?? 0) >= 0.75);
  assert.ok((suggestions[0]?.evidence[0]?.distance_meters ?? 9999) < 750);
});

test('does not fuse nearby calls with incompatible incident types', () => {
  const suggestions = findFusionSuggestions([
    call('fire'),
    call('crime', { incident_type: 'crime', ai_summary: 'Armed robbery at Sector 16 market.' }),
  ]);

  assert.deepEqual(suggestions, []);
});

test('requires corroborating shared text even when type, time, and coordinates match', () => {
  const suggestions = findFusionSuggestions([
    call('a', {
      ai_summary: 'Flames above warehouse alpha.',
      immediate_threats: [],
      caller_location: { address: 'Warehouse Alpha', latitude: 28.7, longitude: 77.1 },
    }),
    call('b', {
      ai_summary: 'Smoke beside tower zulu.',
      immediate_threats: [],
      caller_location: { address: 'Tower Zulu', latitude: 28.7, longitude: 77.1 },
    }),
  ]);

  assert.deepEqual(suggestions, []);
});

test('fusion requires type AND distance AND time AND a shared caller detail', () => {
  const base = call('base');
  const valid = call('valid', { created_at: '2026-09-05T10:03:00.000Z' });
  assert.equal(findFusionSuggestions([base, valid]).length, 1);

  const mismatches: EmergencyCall[] = [
    call('type', { incident_type: 'crime' }),
    call('distance', { caller_location: { address: 'Sector 16, Rohini, Delhi', latitude: 28.8, longitude: 77.2 } }),
    call('time', { created_at: '2026-09-05T10:11:00.000Z' }),
    call('detail', {
      ai_summary: 'Warehouse blaze at an unrelated place.',
      immediate_threats: [],
      incident_subtype: 'structure fire',
      caller_location: { address: 'Warehouse Zulu', latitude: 28.7196, longitude: 77.1186 },
    }),
  ];

  for (const mismatch of mismatches) {
    assert.deepEqual(findFusionSuggestions([base, mismatch]), [], mismatch.id);
  }
});

test('fusion evidence copy names every satisfied gate for operator review', () => {
  const suggestion = findFusionSuggestions([
    call('a'),
    call('b', { created_at: '2026-09-05T10:04:00.000Z' }),
  ])[0]!;
  const reasons = suggestion.evidence[0]?.reasons.join(' ') ?? '';

  assert.match(reasons, /same incident type/i);
  assert.match(reasons, /m apart/i);
  assert.match(reasons, /min apart/i);
  assert.match(reasons, /shared terms/i);
});

test('does not treat a generic accident subtype as corroborating evidence', () => {
  const suggestions = findFusionSuggestions([
    call('a', {
      incident_type: 'accident',
      ai_summary: 'Car crash near Alpha Road',
      immediate_threats: [],
      caller_location: { address: 'Alpha Road', latitude: 28.7, longitude: 77.1 },
    }),
    call('b', {
      incident_type: 'accident',
      ai_summary: 'Bus crash near Beta Street',
      immediate_threats: [],
      caller_location: { address: 'Beta Street', latitude: 28.7, longitude: 77.1 },
    }),
  ]);

  assert.deepEqual(suggestions, []);
});

test('does not fuse same-type calls outside distance or time boundaries', () => {
  const suggestions = findFusionSuggestions([
    call('base'),
    call('far', {
      caller_location: { latitude: 28.80, longitude: 77.20, confidence: 0.9 },
    }),
    call('old', { created_at: '2026-09-05T09:40:00.000Z' }),
  ]);

  assert.deepEqual(suggestions, []);
});

test('does not treat two records with the same call id as separate callers', () => {
  assert.deepEqual(findFusionSuggestions([call('same'), call('same')]), []);
});

test('does not transitively fuse a call outside the primary distance boundary', () => {
  const suggestions = findFusionSuggestions([
    call('a', { caller_location: { latitude: 28.7, longitude: 77.1 } }),
    call('b', { caller_location: { latitude: 28.7, longitude: 77.1043 } }),
    call('c', { caller_location: { latitude: 28.7, longitude: 77.1086 } }),
  ]);

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.primary_call_id, 'a');
  assert.deepEqual(suggestions[0]?.related_call_ids, ['b']);
});

test('fused intelligence preserves highest severity and avoids double-counting victims', () => {
  const [suggestion] = findFusionSuggestions([
    call('a', { persons_involved: 2, immediate_threats: ['heavy smoke'] }),
    call('b', {
      severity: 'critical',
      severity_score: 96,
      persons_involved: 4,
      immediate_threats: ['trapped occupants'],
      created_at: '2026-09-05T10:02:00.000Z',
    }),
  ]);

  assert.equal(suggestion?.fused_intelligence.severity, 'critical');
  assert.equal(suggestion?.fused_intelligence.severity_score, 96);
  assert.equal(suggestion?.fused_intelligence.persons_involved, 4);
  assert.deepEqual(suggestion?.fused_intelligence.immediate_threats, [
    'heavy smoke',
    'trapped occupants',
  ]);
});

test('only an approved link blocks the related incident from separate dispatch', () => {
  const [suggestion] = findFusionSuggestions([call('a'), call('b')]);
  assert.ok(suggestion);

  let decisions: FusionDecisionMap = {};
  decisions = recordFusionDecision(decisions, suggestion!, 'kept_separate', '2026-09-05T10:05:00.000Z');
  assert.equal(linkedPrimaryFor('b', decisions), null);

  decisions = recordFusionDecision(decisions, suggestion!, 'linked', '2026-09-05T10:06:00.000Z');
  assert.equal(linkedPrimaryFor('b', decisions), 'a');
  assert.equal(linkedPrimaryFor('a', decisions), null);
  assert.equal(fusionDecisionFor('a', decisions)?.action, 'linked');
  assert.equal(fusionDecisionFor('b', decisions)?.action, 'linked');
  assert.equal(decisions[suggestion!.key]?.confidence, suggestion!.confidence);
  assert.deepEqual(decisions[suggestion!.key]?.evidence, suggestion!.evidence);
  assert.deepEqual(
    decisions[suggestion!.key]?.fused_intelligence,
    suggestion!.fused_intelligence,
  );
});

test('persists only valid operator fusion decisions', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const suggestion = findFusionSuggestions([call('a'), call('b')])[0]!;
  const decisions = recordFusionDecision({}, suggestion, 'linked', '2026-09-05T10:02:00.000Z');

  writeFusionDecisions(decisions, storage);
  assert.deepEqual(readFusionDecisions(storage), decisions);

  values.set('kwik112_incident_fusion_decisions', JSON.stringify({
    valid: decisions[suggestion.key],
    invalid: { action: 'auto_linked', primary_call_id: 7 },
    malformed_snapshot: {
      ...decisions[suggestion.key],
      evidence: ['not evidence'],
      fused_intelligence: {},
    },
  }));
  assert.deepEqual(readFusionDecisions(storage), { valid: decisions[suggestion.key] });
});

test('latest overlapping operator decision wins for every affected call', () => {
  const ab = findFusionSuggestions([call('a'), call('b')])[0]!;
  const abc = findFusionSuggestions([call('a'), call('b'), call('c')])[0]!;
  let decisions = recordFusionDecision({}, ab, 'kept_separate', '2026-09-05T10:02:00.000Z');
  decisions = recordFusionDecision(decisions, abc, 'linked', '2026-09-05T10:03:00.000Z');

  assert.equal(fusionDecisionFor('b', decisions)?.key, abc.key);
  assert.equal(fusionDecisionFor('b', decisions, ab.key)?.key, ab.key);
  assert.equal(linkedPrimaryFor('b', decisions), 'a');
});

test('linked related calls cannot bypass dispatch through board status transitions', () => {
  const suggestion = findFusionSuggestions([call('a'), call('b')])[0]!;
  const decisions = recordFusionDecision({}, suggestion, 'linked');

  assert.equal(isSeparateDispatchTransitionBlocked('b', 'dispatched', decisions), true);
  assert.equal(isSeparateDispatchTransitionBlocked('b', 'en-route', decisions), true);
  assert.equal(isSeparateDispatchTransitionBlocked('b', 'on_scene', decisions), true);
  assert.equal(isSeparateDispatchTransitionBlocked('b', 'resolved', decisions), false);
  assert.equal(isSeparateDispatchTransitionBlocked('a', 'dispatched', decisions), false);
});
