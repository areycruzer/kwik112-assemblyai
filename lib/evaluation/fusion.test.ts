import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateFusionCases, type FusionEvaluationCase } from './fusion.ts';
import type { EmergencyCall } from '../types.ts';

function call(id: string, overrides: Partial<EmergencyCall> = {}): EmergencyCall {
  return {
    id,
    caller_number: `+91${id}`,
    status: 'active',
    call_status: 'in-progress',
    incident_type: 'fire',
    severity: 'high',
    severity_score: 80,
    ai_summary: 'Shop fire at Lajpat Nagar central market',
    caller_location: { address: 'Lajpat Nagar central market', latitude: 28.5677, longitude: 77.2433 },
    created_at: '2026-09-05T10:00:00.000Z',
    updated_at: '2026-09-05T10:00:00.000Z',
    ...overrides,
  };
}

test('fusion evaluation reports precision, recall, false links, and missed links', () => {
  const cases: FusionEvaluationCase[] = [
    { id: 'duplicate', expected_link: true, calls: [call('a'), call('b')] },
    {
      id: 'different-incidents',
      expected_link: false,
      calls: [
        call('c', {
          ai_summary: 'Warehouse fire at Okhla phase two',
          caller_location: { address: 'Okhla phase two', latitude: 28.5677, longitude: 77.2433 },
        }),
        call('d', {
          ai_summary: 'Kitchen fire at Kalkaji block C',
          caller_location: { address: 'Kalkaji block C', latitude: 28.5677, longitude: 77.2433 },
        }),
      ],
    },
  ];

  const result = evaluateFusionCases(cases);

  assert.equal(result.metrics.true_positives, 1);
  assert.equal(result.metrics.false_positives, 0);
  assert.equal(result.metrics.true_negatives, 1);
  assert.equal(result.metrics.false_negatives, 0);
  assert.equal(result.metrics.precision, 1);
  assert.equal(result.metrics.recall, 1);
  assert.equal(result.metrics.false_link_rate, 0);
  assert.equal(result.metrics.missed_link_rate, 0);
  assert.equal(result.metrics.duplicate_dispatches_preventable, 1);
});

test('fusion evaluation rejects malformed cases instead of inflating metrics', () => {
  assert.throws(
    () => evaluateFusionCases([{ id: 'bad', expected_link: true, calls: [call('only')] } as never]),
    /exactly two calls/,
  );
});
