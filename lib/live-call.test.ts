import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KWIK_LIVE_CALL_EVENT,
  buildLiveCallPayload,
} from './live-call.ts';
import * as liveCall from './live-call.ts';

test('builds a versioned start payload with an explicit ungraded state', () => {
  const payload = buildLiveCallPayload({
    state: 'start',
    callId: 'call-112',
    transcript: [],
    detectedLanguage: null,
    prosodySource: 'absent',
    at: '2026-09-07T10:00:00.000Z',
  });

  assert.equal(KWIK_LIVE_CALL_EVENT, 'kwik-live-call');
  assert.deepEqual(payload, {
    version: 1,
    state: 'start',
    callId: 'call-112',
    at: '2026-09-07T10:00:00.000Z',
    transcript: [],
    detectedLanguage: null,
    prosodySource: 'absent',
    grade: null,
  });
});

test('grades finalized caller turns locally in update and end payloads', () => {
  const transcript = [
    {
      role: 'user' as const,
      text: 'Mere papa ki pulse nahi hai. Hum Sample Metro Gate 1 par hain.',
      timestamp: '2026-09-07T10:00:01.000Z',
    },
    {
      role: 'assistant' as const,
      text: 'Kya woh normal breathing kar rahe hain?',
      timestamp: '2026-09-07T10:00:02.000Z',
    },
  ];

  for (const state of ['update', 'end'] as const) {
    const payload = buildLiveCallPayload({
      state,
      callId: 'call-112',
      transcript,
      detectedLanguage: 'hi',
      prosodySource: 'measured',
      at: '2026-09-07T10:00:03.000Z',
    });

    assert.equal(payload.grade?.incidentType, 'medical_emergency');
    assert.equal(payload.grade?.severity, 'critical');
    assert.equal(payload.grade?.priorityCode, 'P1');
    assert.equal(payload.grade?.location.address, 'Sample Metro Gate 1');
    assert.equal(payload.grade?.method, 'keyword');
  }
});

test('does not let dispatcher words create a false caller grade', () => {
  const payload = buildLiveCallPayload({
    state: 'update',
    callId: 'call-quiet',
    transcript: [
      {
        role: 'assistant',
        text: 'Is there a fire, severe bleeding, or anyone with no pulse?',
        timestamp: '2026-09-07T10:00:01.000Z',
      },
      {
        role: 'user',
        text: 'No, I am reporting a broken water pipe near my house.',
        timestamp: '2026-09-07T10:00:02.000Z',
      },
    ],
    detectedLanguage: 'en',
    prosodySource: 'measured',
    at: '2026-09-07T10:00:03.000Z',
  });

  assert.equal(payload.grade?.incidentType, 'public_safety');
  assert.equal(payload.grade?.severity, 'low');
});

test('applies the local medical floor to a tourist reporting heat stroke', () => {
  const payload = buildLiveCallPayload({
    state: 'update',
    callId: 'call-john',
    transcript: [
      {
        role: 'user',
        text: 'My friend has heat stroke, is confused, vomiting, and can barely stand at India Gate.',
        timestamp: '2026-09-07T10:00:01.000Z',
      },
    ],
    detectedLanguage: 'en',
    prosodySource: 'simulated',
    at: '2026-09-07T10:00:02.000Z',
  });

  assert.equal(payload.grade?.incidentType, 'medical_emergency');
  assert.equal(payload.grade?.severity, 'high');
  assert.equal(payload.grade?.priorityCode, 'P2');
});

test('transcript fingerprint changes only when finalized turn content changes', () => {
  const fingerprint = (
    liveCall as typeof liveCall & {
      liveCallTranscriptFingerprint: (
        transcript: Parameters<typeof buildLiveCallPayload>[0]['transcript'],
      ) => string;
    }
  ).liveCallTranscriptFingerprint;
  const first = [
    {
      role: 'user' as const,
      text: 'Fire near Gate 2.',
      timestamp: '2026-09-07T10:00:01.000Z',
    },
  ];

  assert.equal(typeof fingerprint, 'function');
  assert.equal(
    fingerprint(first),
    fingerprint([{ ...first[0], timestamp: '2026-09-07T10:00:09.000Z' }]),
  );
  assert.notEqual(
    fingerprint(first),
    fingerprint([
      ...first,
      {
        role: 'assistant',
        text: 'What is the exact location?',
        timestamp: '2026-09-07T10:00:02.000Z',
      },
    ]),
  );
});
