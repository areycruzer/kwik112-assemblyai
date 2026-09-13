import test from 'node:test';
import assert from 'node:assert/strict';

import { getTimeElapsed, mockCalls } from './mock-data.ts';

test('fresh timestamps read as abhi abhi instead of old incident copy', () => {
  assert.equal(getTimeElapsed(new Date(Date.now() - 20 * 1000).toISOString()), 'Abhi abhi');
});

test('seeded open demo incidents are recent enough for an active control room', () => {
  const oldestOpenAgeMs = Math.max(
    ...mockCalls
      .filter((call) => call.status !== 'resolved')
      .map((call) => Date.now() - Date.parse(call.created_at)),
  );

  assert.ok(oldestOpenAgeMs <= 5 * 60 * 1000);
});
