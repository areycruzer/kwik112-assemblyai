import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyTimeline,
  recordDecision,
  currentPoint,
  isComplete,
  readTimeline,
  writeTimeline,
  DECISION_POINTS,
  type DecisionRecord,
} from './timeline.ts';

test('a fresh timeline starts at INTAKE and is incomplete', () => {
  const t = emptyTimeline('c1');
  assert.equal(currentPoint(t), 'INTAKE');
  assert.equal(isComplete(t), false);
  assert.deepEqual([...DECISION_POINTS], ['INTAKE', 'DISPATCH', 'RESOLUTION']);
});

test('recording advances to the next point', () => {
  let t = emptyTimeline('c1');
  t = recordDecision(t, { point: 'INTAKE', action: 'confirmed', at: '2026-08-29T12:00:00Z' });
  assert.equal(currentPoint(t), 'DISPATCH');
});

test('completing every point marks the timeline complete', () => {
  let t = emptyTimeline('c1');
  for (const point of DECISION_POINTS) {
    t = recordDecision(t, { point, action: 'confirmed', at: '2026-08-29T12:00:00Z' });
  }
  assert.equal(isComplete(t), true);
  assert.equal(currentPoint(t), null);
});

test('recording the same point twice replaces rather than duplicates', () => {
  let t = emptyTimeline('c1');
  t = recordDecision(t, { point: 'INTAKE', action: 'confirmed', at: '2026-08-29T12:00:00Z' });
  t = recordDecision(t, {
    point: 'INTAKE', action: 'overridden', at: '2026-08-29T12:05:00Z', note: 'wrong address',
  });
  assert.equal(t.records.length, 1);
  assert.equal(t.records[0].action, 'overridden');
  assert.equal(t.records[0].note, 'wrong address');
});

test('recordDecision does not mutate its input', () => {
  const t = emptyTimeline('c1');
  const next = recordDecision(t, { point: 'INTAKE', action: 'confirmed', at: 'x' });
  assert.equal(t.records.length, 0);
  assert.equal(next.records.length, 1);
});

test('recorded decisions preserve the exact proposal snapshot used by the operator', () => {
  const proposal = {
    heading: 'Dispatch Medic 302',
    body: 'Projected inside the configured response target.',
    items: ['Medic 302 · ETA 4 min · ON TARGET'],
  };
  const next = recordDecision(emptyTimeline('c1'), {
    point: 'DISPATCH',
    action: 'confirmed',
    at: '2026-09-05T00:00:00Z',
    proposal,
  });

  assert.deepEqual(next.records[0]?.proposal, proposal);
});

// --- FINDING 1: the "note required on override" invariant ---

test('recording an override without a note throws', () => {
  const t = emptyTimeline('c1');
  // Simulate an untyped record (e.g. parsed from localStorage) reaching the guard.
  const bad = { point: 'DISPATCH', action: 'overridden', at: 'x' } as unknown as DecisionRecord;
  assert.throws(() => recordDecision(t, bad), /note/i);
});

test('recording an override with a whitespace-only note throws', () => {
  const t = emptyTimeline('c1');
  const bad = {
    point: 'DISPATCH', action: 'overridden', at: 'x', note: '   ',
  } as unknown as DecisionRecord;
  assert.throws(() => recordDecision(t, bad), /note/i);
});

test('a rejected override leaves the prior timeline untouched', () => {
  let t = emptyTimeline('c1');
  t = recordDecision(t, { point: 'INTAKE', action: 'confirmed', at: '2026-08-29T12:00:00Z' });
  const before = t;
  const bad = { point: 'DISPATCH', action: 'overridden', at: 'x' } as unknown as DecisionRecord;
  assert.throws(() => recordDecision(t, bad), /note/i);
  // The guard runs before any new state is constructed: the input is unchanged
  // and still holds exactly the one record it had.
  assert.equal(before.records.length, 1);
  assert.equal(before.records[0].point, 'INTAKE');
});

test('recording a valid override with a note succeeds', () => {
  let t = emptyTimeline('c1');
  t = recordDecision(t, {
    point: 'DISPATCH', action: 'overridden', at: 'x', note: 'unit already committed',
  });
  assert.equal(t.records.length, 1);
  assert.equal(t.records[0].action, 'overridden');
});

// --- FINDING 3: canonical ordering regardless of recording order ---

test('recording points out of order still sorts INTAKE first', () => {
  let t = emptyTimeline('c1');
  t = recordDecision(t, { point: 'RESOLUTION', action: 'confirmed', at: 'x' });
  t = recordDecision(t, { point: 'INTAKE', action: 'confirmed', at: 'x' });
  assert.equal(t.records[0].point, 'INTAKE');
  assert.equal(t.records[1].point, 'RESOLUTION');
});

test('currentPoint returns the earliest skipped point', () => {
  let t = emptyTimeline('c1');
  t = recordDecision(t, { point: 'DISPATCH', action: 'confirmed', at: 'x' });
  assert.equal(currentPoint(t), 'INTAKE');
});

// --- FINDING 2: persistence layer coverage ---

const TIMELINE_STORAGE_KEY = 'dispatch_timeline';

type MutableGlobal = { window?: unknown };

/** Install a minimal fake `window.localStorage` backed by `store`. */
function installFakeWindow(store: Record<string, string> = {}): Record<string, string> {
  const localStorage = {
    getItem: (key: string): string | null => (key in store ? store[key] : null),
    setItem: (key: string, value: string): void => {
      store[key] = String(value);
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      for (const key of Object.keys(store)) delete store[key];
    },
  };
  (globalThis as unknown as MutableGlobal).window = { localStorage };
  return store;
}

function removeFakeWindow(): void {
  delete (globalThis as unknown as MutableGlobal).window;
}

test('persistence: round-trips a written timeline', () => {
  installFakeWindow();
  try {
    let t = emptyTimeline('c1');
    t = recordDecision(t, { point: 'INTAKE', action: 'confirmed', at: '2026-08-29T12:00:00Z' });
    writeTimeline(t);
    const read = readTimeline('c1');
    assert.deepEqual(read.records, t.records);
    assert.equal(read.callId, 'c1');
  } finally {
    removeFakeWindow();
  }
});

test('persistence: reading a different call never returns another call records', () => {
  installFakeWindow();
  try {
    let c1 = emptyTimeline('c1');
    c1 = recordDecision(c1, { point: 'INTAKE', action: 'confirmed', at: 'x' });
    writeTimeline(c1);
    const c2 = readTimeline('c2');
    assert.deepEqual(c2.records, []);
    assert.equal(c2.callId, 'c2');
  } finally {
    removeFakeWindow();
  }
});

test('persistence: writing one call does not destroy another call records', () => {
  installFakeWindow();
  try {
    let c1 = emptyTimeline('c1');
    c1 = recordDecision(c1, { point: 'INTAKE', action: 'confirmed', at: 'x' });
    writeTimeline(c1);

    let c2 = emptyTimeline('c2');
    c2 = recordDecision(c2, { point: 'DISPATCH', action: 'confirmed', at: 'y' });
    writeTimeline(c2);

    const readC1 = readTimeline('c1');
    assert.equal(readC1.records.length, 1);
    assert.equal(readC1.records[0].point, 'INTAKE');
  } finally {
    removeFakeWindow();
  }
});

test('persistence: reading an unknown call returns an empty timeline', () => {
  installFakeWindow();
  try {
    const t = readTimeline('never-written');
    assert.deepEqual(t.records, []);
    assert.equal(t.callId, 'never-written');
  } finally {
    removeFakeWindow();
  }
});

test('persistence: corrupt stored value (invalid JSON) yields an empty timeline', () => {
  installFakeWindow({ [TIMELINE_STORAGE_KEY]: 'not json at all {' });
  try {
    let t: ReturnType<typeof readTimeline> | undefined;
    assert.doesNotThrow(() => {
      t = readTimeline('c1');
    });
    assert.deepEqual(t!.records, []);
  } finally {
    removeFakeWindow();
  }
});

test('persistence: corrupt stored value (top-level array) yields an empty timeline', () => {
  installFakeWindow({ [TIMELINE_STORAGE_KEY]: '[1, 2, 3]' });
  try {
    let t: ReturnType<typeof readTimeline> | undefined;
    assert.doesNotThrow(() => {
      t = readTimeline('c1');
    });
    assert.deepEqual(t!.records, []);
  } finally {
    removeFakeWindow();
  }
});

test('persistence: corrupt stored value (a string) yields an empty timeline', () => {
  installFakeWindow({ [TIMELINE_STORAGE_KEY]: '"just a string"' });
  try {
    let t: ReturnType<typeof readTimeline> | undefined;
    assert.doesNotThrow(() => {
      t = readTimeline('c1');
    });
    assert.deepEqual(t!.records, []);
  } finally {
    removeFakeWindow();
  }
});

test('persistence: per-call value that is not an array yields an empty timeline', () => {
  installFakeWindow({ [TIMELINE_STORAGE_KEY]: JSON.stringify({ c1: { not: 'an array' } }) });
  try {
    let t: ReturnType<typeof readTimeline> | undefined;
    assert.doesNotThrow(() => {
      t = readTimeline('c1');
    });
    assert.deepEqual(t!.records, []);
  } finally {
    removeFakeWindow();
  }
});

test('persistence: malformed proposal snapshots are discarded without losing the decision', () => {
  installFakeWindow({
    [TIMELINE_STORAGE_KEY]: JSON.stringify({
      c1: [
        {
          point: 'DISPATCH',
          action: 'confirmed',
          at: 'x',
          proposal: { heading: 42, body: null, items: 'not-an-array' },
        },
      ],
    }),
  });
  try {
    const read = readTimeline('c1');
    assert.equal(read.records.length, 1);
    assert.equal(read.records[0]?.proposal, undefined);
  } finally {
    removeFakeWindow();
  }
});

test('persistence: a corrupt top-level array is replaced rather than swallowing writes', () => {
  installFakeWindow({ [TIMELINE_STORAGE_KEY]: '[1, 2, 3]' });
  try {
    let t = emptyTimeline('c1');
    t = recordDecision(t, { point: 'INTAKE', action: 'confirmed', at: 'x' });
    writeTimeline(t);
    // The write must survive: readAll should have rejected the array store and
    // written a fresh plain object, not assigned a key onto the array (which
    // JSON.stringify would drop).
    const read = readTimeline('c1');
    assert.equal(read.records.length, 1);
    assert.equal(read.records[0].point, 'INTAKE');
  } finally {
    removeFakeWindow();
  }
});

test('persistence: SSR no-op when window is undefined', () => {
  // Ensure no window is present for this test.
  removeFakeWindow();
  const t = readTimeline('c1');
  assert.deepEqual(t.records, []);
  assert.equal(t.callId, 'c1');

  let staged = emptyTimeline('c1');
  staged = recordDecision(staged, { point: 'INTAKE', action: 'confirmed', at: 'x' });
  assert.doesNotThrow(() => writeTimeline(staged));
});

test('required decision points gate dispatch and resolution statuses', async () => {
  const { requiredDecisionPoints } = await import('./timeline.ts');
  // Queue organization implies no checkpoint.
  assert.deepEqual(requiredDecisionPoints('incoming'), []);
  assert.deepEqual(requiredDecisionPoints('triage'), []);
  // Reaching a dispatch-stage status requires both human decisions.
  assert.deepEqual(requiredDecisionPoints('dispatched'), ['INTAKE', 'DISPATCH']);
  assert.deepEqual(requiredDecisionPoints('on_scene'), ['INTAKE', 'DISPATCH']);
  // Closing a call requires the full chain.
  assert.deepEqual(requiredDecisionPoints('resolved'), ['INTAKE', 'DISPATCH', 'RESOLUTION']);
});
