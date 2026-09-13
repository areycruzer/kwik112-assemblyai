import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HINGLISH_DEMO_LINES,
  HINGLISH_DEMO_LOCATION,
  demoAuditRows,
  deriveDemoStep,
} from './demo.ts';

const call = {
  id: 'demo-1',
  caller_number: '+910000000000',
  status: 'active',
  call_status: 'completed',
  incident_type: 'medical_emergency',
  incident_subtype: 'cardiac arrest',
  severity: 'critical',
  prosody_source: 'simulated',
  triage_method: 'keyword',
  created_at: '2026-09-05T10:00:00.000Z',
  updated_at: '2026-09-05T10:00:03.000Z',
} as const;

test('demo remains at preflight until intake starts', () => {
  assert.equal(deriveDemoStep({ call: null, records: [], intakeStarted: false }), 'preflight');
  assert.equal(deriveDemoStep({ call: null, records: [], intakeStarted: true }), 'live_call');
});

test('created call advances through triage, approval, dispatch, and audit', () => {
  assert.equal(deriveDemoStep({ call, records: [], intakeStarted: true }), 'ai_triage');
  assert.equal(
    deriveDemoStep({
      call,
      records: [{ point: 'INTAKE' }],
      intakeStarted: true,
    }),
    'human_approval',
  );
  assert.equal(
    deriveDemoStep({
      call: { ...call, status: 'dispatched' },
      records: [
        { point: 'INTAKE' },
        { point: 'DISPATCH' },
      ],
      intakeStarted: true,
    }),
    'dispatch',
  );
  assert.equal(
    deriveDemoStep({
      call: { ...call, status: 'dispatched' },
      records: [
        { point: 'INTAKE' },
        { point: 'DISPATCH' },
        { point: 'RESOLUTION' },
      ],
      intakeStarted: true,
    }),
    'audit',
  );
});

test('Hinglish fallback alternates caller and dispatcher with synthetic provenance', () => {
  assert.deepEqual(HINGLISH_DEMO_LINES.map((line) => line.role), [
    'user', 'assistant', 'user', 'assistant', 'user', 'assistant',
  ]);
  assert.match(HINGLISH_DEMO_LINES[0].text, /papa.*respond nahi/i);
  assert.match(HINGLISH_DEMO_LINES[2].text, /Sample Metro Gate 1/i);
  assert.ok(HINGLISH_DEMO_LINES.filter((line) => line.role === 'user').every((line) => line.emotions));
  assert.deepEqual(HINGLISH_DEMO_LOCATION, {
    latitude: 28.6304,
    longitude: 77.2177,
    city: 'New Delhi',
  });
});

test('scripted assistant asks one question at a time and never claims dispatch', () => {
  const assistantLines = HINGLISH_DEMO_LINES.filter((line) => line.role === 'assistant');

  for (const line of assistantLines) {
    assert.ok((line.text.match(/\?/g) ?? []).length <= 1, line.text);
    assert.doesNotMatch(line.text, /dispatch|ambulance (?:arrange|bhej|send)/i);
  }
});

test('audit rows name the scripted caller and triage provenance without implying measurement', () => {
  const rows = demoAuditRows(call, [
    { point: 'INTAKE', action: 'confirmed', at: '2026-09-05T10:01:00.000Z' },
  ]);
  assert.deepEqual(rows.slice(0, 3), [
    { label: 'Incident', value: '#demo-1 · cardiac arrest · CRITICAL' },
    { label: 'Call path', value: 'Scripted caller · browser speech' },
    { label: 'Prosody', value: 'Simulated — not a measured signal' },
  ]);
  assert.ok(rows.some((row) => row.label === 'Triage' && row.value === 'Local safety rules'));
  assert.ok(rows.some((row) => row.label === 'Human decisions' && /1 of 3/.test(row.value)));
});
