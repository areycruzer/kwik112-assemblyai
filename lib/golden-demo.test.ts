import test from 'node:test';
import assert from 'node:assert/strict';
import * as personas from './personas.ts';
import { buildLiveCallPayload } from './live-call.ts';

const golden = personas as typeof personas & {
  GOLDEN_DEMO_CONTRACT: { callId: string; attackText: string; auditText: string; gradeText: string };
  GOLDEN_CALLER_PRESET: { id: string; lines: Array<{ role: 'user' | 'assistant'; text: string; emotions?: Record<string, number> }> };
  goldenAttackEvidence: (lines: Array<{ role: 'user' | 'assistant'; text: string; timestamp: string }>) => string | null;
};

test('golden caller holds a real critical local grade across a simulated LOW injection', () => {
  assert.ok(golden.GOLDEN_CALLER_PRESET, 'golden persona exists');
  const { lines } = golden.GOLDEN_CALLER_PRESET;
  const transcript = lines.map(line => ({ ...line, timestamp: '2026-09-08T12:00:00.000Z' }));
  const before = buildLiveCallPayload({ state: 'update', callId: golden.GOLDEN_DEMO_CONTRACT.callId, at: transcript[0].timestamp, transcript: transcript.slice(0, -1), detectedLanguage: 'hi', prosodySource: 'simulated' });
  const after = buildLiveCallPayload({ state: 'end', callId: golden.GOLDEN_DEMO_CONTRACT.callId, at: transcript[0].timestamp, transcript, detectedLanguage: 'hi', prosodySource: 'simulated' });
  assert.equal(before.grade?.severity, 'critical');
  assert.equal(after.grade?.severity, 'critical');
  assert.equal(after.grade?.priorityCode, 'P1');
  assert.equal(after.prosodySource, 'simulated');
  assert.equal(golden.GOLDEN_DEMO_CONTRACT.gradeText, 'P1 · CRITICAL');
  assert.equal(lines.at(-1)?.text, golden.GOLDEN_DEMO_CONTRACT.attackText);
  assert.equal(golden.goldenAttackEvidence(transcript), golden.GOLDEN_DEMO_CONTRACT.auditText);
  assert.equal(golden.goldenAttackEvidence(transcript.slice(0, -1)), null);
  assert.equal(golden.goldenAttackEvidence([transcript.at(-1)!]), null, 'no false held-grade evidence without a crisis');
  assert.equal(personas.selectJudgeCallerPreset('golden').id, 'golden');
});

import { prepareGoldenDemo } from './golden-prep.ts';

test('golden prep seeds two lower-priority simulated calls and preserves unrelated storage', () => {
  const values = new Map<string, string>([['unrelated-preference', 'keep'], ['dispatch_timeline', 'stale']]);
  const storage = { setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => { values.delete(key); } };
  const calls = prepareGoldenDemo(storage, Date.parse('2026-09-08T12:00:00Z'));
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.severity === 'low' && call.prosody_source === 'simulated'));
  assert.ok(calls.some(call => call.flags?.includes('POSSIBLE_PRANK_PROSODY_MISMATCH')));
  assert.equal(values.get('unrelated-preference'), 'keep');
  assert.equal(values.has('dispatch_timeline'), false);
  assert.deepEqual(JSON.parse(values.get('kwik_emergency_calls')!), calls);
});
