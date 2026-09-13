import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compactIncidentSummary,
  compareIncidentsForQueue,
  sortIncidentQueue,
  dashboardHeaderMetrics,
  dashboardRegionVisibility,
  defaultMobileIncidentOpen,
  defaultUnitPanelOpen,
  mobileNavigationInset,
  nextLiveCallPayload,
  incidentActionChecklist,
  presentLiveCall,
  unitRosterAccessibleLabel,
} from './dashboard-presentation.ts';
import type { KwikLiveCallPayload } from './live-call.ts';
import type { EmergencyCall } from './types.ts';

const calls = [
  { severity: 'critical' },
  { severity: 'high' },
  { severity: 'critical' },
] as EmergencyCall[];

test('dashboard header exposes each operational count once', () => {
  assert.deepEqual(dashboardHeaderMetrics(calls, 4), [
    { label: 'Incidents', value: 3, tone: 'default' },
    { label: 'Critical', value: 2, tone: 'critical' },
    { label: 'Open alerts', value: 4, tone: 'warning' },
  ]);
});

test('queue summary stays compact while preserving the full first words', () => {
  const summary = 'A very long emergency summary '.repeat(10).trim();
  const compact = compactIncidentSummary(summary, 80);

  assert.ok(compact.length <= 80);
  assert.match(compact, /^A very long emergency summary/);
  assert.match(compact, /…$/);
  assert.equal(compact.includes('  '), false);
});

test('short queue summaries remain unchanged', () => {
  assert.equal(compactIncidentSummary('  Fire near Demo Chowk.  '), 'Fire near Demo Chowk.');
});

test('unit panel starts closed on tablet and open on wide desktop', () => {
  assert.equal(defaultUnitPanelOpen(768), false);
  assert.equal(defaultUnitPanelOpen(1279), false);
  assert.equal(defaultUnitPanelOpen(1280), true);
  assert.equal(defaultUnitPanelOpen(1536), true);
});

test('phone layout reserves the full content width for the map', () => {
  assert.deepEqual(dashboardRegionVisibility(390), {
    showModuleRail: true,
    showIncidentSidebar: false,
  });
  assert.deepEqual(dashboardRegionVisibility(768), {
    showModuleRail: true,
    showIncidentSidebar: true,
  });
  assert.equal(defaultMobileIncidentOpen(390), true);
  assert.equal(defaultMobileIncidentOpen(768), false);
  assert.equal(mobileNavigationInset(390), 56);
  assert.equal(mobileNavigationInset(768), 0);
});

test('unit roster accessible label includes operational context', () => {
  const unit = {
    id: 'CATS-302',
    callsign: 'Ambulance 302',
    agency: 'CATS Delhi',
    speed: '42 km/h',
    status: 'available' as const,
  };

  assert.equal(
    unitRosterAccessibleLabel(unit, '1.7 km', '4 min'),
    'Ambulance 302, CATS Delhi unit CATS-302, Ready, 1.7 km away, speed 42 km/h, ETA 4 min',
  );

  // With no incident selected there is no ETA to announce, and the label must
  // simply stop rather than read out an em-dash or a fabricated arrival time.
  assert.equal(
    unitRosterAccessibleLabel(unit, '—'),
    'Ambulance 302, CATS Delhi unit CATS-302, Ready, — away, speed 42 km/h',
  );
});

test('live call presentation exposes recent turns and deterministic provenance', () => {
  const payload: KwikLiveCallPayload = {
    version: 1,
    state: 'update',
    callId: 'live-112',
    at: '2026-09-07T10:00:03.000Z',
    transcript: [
      { role: 'user', text: 'First caller detail', timestamp: '2026-09-07T10:00:00.000Z' },
      { role: 'assistant', text: 'What is your location?', timestamp: '2026-09-07T10:00:01.000Z' },
      { role: 'user', text: 'Sample Metro Gate 1', timestamp: '2026-09-07T10:00:02.000Z' },
    ],
    detectedLanguage: 'hi',
    prosodySource: 'measured',
    grade: {
      incidentType: 'medical_emergency',
      incidentSubtype: 'cardiac event',
      severity: 'critical',
      severityScore: 100,
      priorityCode: 'P1',
      location: { address: 'Sample Metro Gate 1' },
      summary: 'Caller reports no pulse.',
      method: 'keyword',
    },
  };

  assert.deepEqual(presentLiveCall(payload, 2), {
    turns: [
      { speaker: 'Dispatcher', text: 'What is your location?' },
      { speaker: 'Caller', text: 'Sample Metro Gate 1' },
    ],
    language: 'HI',
    prosody: 'Measured',
    grade: 'Current grade: CRITICAL (rules)',
    emotion: null,
  });
});

test('live call presentation surfaces the latest measured caller emotion', () => {
  const payload: KwikLiveCallPayload = {
    version: 1,
    state: 'update',
    callId: 'live-112',
    at: '2026-09-07T10:00:03.000Z',
    transcript: [
      {
        role: 'user',
        text: 'meri patni behosh hai',
        timestamp: '2026-09-07T10:00:00.000Z',
        emotions: { Distress: 0.7, Fear: 0.6 },
      },
      { role: 'assistant', text: 'Location batayein?', timestamp: '2026-09-07T10:00:01.000Z' },
      {
        role: 'user',
        text: 'saans nahi aa rahi',
        timestamp: '2026-09-07T10:00:02.000Z',
        emotions: { Distress: 0.86, Panic: 0.81, Calmness: 0.02 },
      },
    ],
    detectedLanguage: 'hi',
    prosodySource: 'measured',
    grade: null,
  };

  // The LAST caller turn with prosody wins, top emotion first.
  assert.equal(presentLiveCall(payload).emotion, 'Distress 86%');
});

test('live call presentation identifies a caller that has not produced a grade', () => {
  const payload: KwikLiveCallPayload = {
    version: 1,
    state: 'start',
    callId: 'live-112',
    at: '2026-09-07T10:00:00.000Z',
    transcript: [],
    detectedLanguage: null,
    prosodySource: 'absent',
    grade: null,
  };

  assert.deepEqual(presentLiveCall(payload), {
    turns: [],
    language: 'Detecting',
    prosody: 'Absent',
    grade: 'Waiting for caller',
    emotion: null,
  });
});

test('live call presentation names simulated scripted calls explicitly', () => {
  const payload: KwikLiveCallPayload = {
    version: 1,
    state: 'update',
    callId: 'scripted-112',
    at: '2026-09-07T10:00:03.000Z',
    transcript: [{ role: 'user', text: 'meri wife behosh hai', timestamp: '2026-09-07T10:00:00.000Z' }],
    detectedLanguage: 'hi',
    prosodySource: 'simulated',
    grade: null,
  };

  assert.equal(presentLiveCall(payload).prosody, 'Scripted call');
});

function livePayload(
  state: KwikLiveCallPayload['state'],
  callId: string,
  at: string,
): KwikLiveCallPayload {
  const base = {
    version: 1,
    state,
    callId,
    at,
    transcript: [],
    detectedLanguage: null,
    prosodySource: 'absent',
    grade: null,
  } as const;
  return base as KwikLiveCallPayload;
}

test('valid events progress one live call and preserve the accepted end tombstone', () => {
  const start = livePayload('start', 'call-a', '2026-09-07T10:00:00.000Z');
  const update = livePayload('update', 'call-a', '2026-09-07T10:00:01.000Z');
  const end = livePayload('end', 'call-a', '2026-09-07T10:00:01.000Z');

  assert.equal(nextLiveCallPayload(null, start), start);
  assert.equal(nextLiveCallPayload(start, update), update);
  assert.equal(nextLiveCallPayload(update, end), end);
});

test('an end tombstone rejects every same-call event and different-call non-start events', () => {
  const end = livePayload('end', 'call-a', '2026-09-07T10:00:03.000Z');
  const lateUpdate = livePayload('update', 'call-a', '2026-09-07T10:00:02.000Z');
  const lateStart = livePayload('start', 'call-a', '2026-09-07T10:00:01.000Z');
  const laterUpdate = livePayload('update', 'call-a', '2026-09-07T10:00:05.000Z');
  const laterStart = livePayload('start', 'call-a', '2026-09-07T10:00:06.000Z');
  const otherUpdate = livePayload('update', 'call-b', '2026-09-07T10:00:04.000Z');

  assert.equal(nextLiveCallPayload(end, lateUpdate), end);
  assert.equal(nextLiveCallPayload(end, lateStart), end);
  assert.equal(nextLiveCallPayload(end, laterUpdate), end);
  assert.equal(nextLiveCallPayload(end, laterStart), end);
  assert.equal(nextLiveCallPayload(end, otherUpdate), end);
});

test('a newer valid new-call start replaces an end tombstone', () => {
  const end = livePayload('end', 'call-a', '2026-09-07T10:00:03.000Z');
  const nextStart = livePayload('start', 'call-b', '2026-09-07T10:00:04.000Z');

  assert.equal(nextLiveCallPayload(end, nextStart), nextStart);
});

test('stale starts and updates cannot roll back the current call', () => {
  const current = livePayload('update', 'call-a', '2026-09-07T10:00:02.000Z');
  const staleStart = livePayload('start', 'call-a', '2026-09-07T10:00:00.000Z');
  const staleUpdate = livePayload('update', 'call-a', '2026-09-07T10:00:01.000Z');

  assert.equal(nextLiveCallPayload(current, staleStart), current);
  assert.equal(nextLiveCallPayload(current, staleUpdate), current);
});

test('an older same-call end cannot clear the active call', () => {
  const current = livePayload('update', 'call-a', '2026-09-07T10:00:02.000Z');
  const staleEnd = livePayload('end', 'call-a', '2026-09-07T10:00:01.000Z');

  assert.equal(nextLiveCallPayload(current, staleEnd), current);
});

test('interleaved sessions only switch on a newer start event', () => {
  const current = livePayload('update', 'call-a', '2026-09-07T10:00:02.000Z');
  const otherUpdate = livePayload('update', 'call-b', '2026-09-07T10:00:03.000Z');
  const otherEnd = livePayload('end', 'call-b', '2026-09-07T10:00:04.000Z');
  const staleOtherStart = livePayload('start', 'call-b', '2026-09-07T10:00:01.000Z');
  const newerOtherStart = livePayload('start', 'call-b', '2026-09-07T10:00:05.000Z');

  assert.equal(nextLiveCallPayload(current, otherUpdate), current);
  assert.equal(nextLiveCallPayload(current, otherEnd), current);
  assert.equal(nextLiveCallPayload(current, staleOtherStart), current);
  assert.equal(nextLiveCallPayload(current, newerOtherStart), newerOtherStart);
});

test('invalid timestamps cannot displace a valid current session', () => {
  const current = livePayload('update', 'call-a', '2026-09-07T10:00:02.000Z');

  for (const state of ['start', 'update', 'end'] as const) {
    const incoming = livePayload(state, state === 'start' ? 'call-b' : 'call-a', 'not-a-date');
    assert.equal(nextLiveCallPayload(current, incoming), current);
  }
});

test('a valid event recovers deterministically from an invalid current timestamp', () => {
  const current = livePayload('update', 'call-a', 'not-a-date');
  const sameCallUpdate = livePayload('update', 'call-a', '2026-09-07T10:00:03.000Z');
  const newerStart = livePayload('start', 'call-b', '2026-09-07T10:00:04.000Z');
  const unknownUpdate = livePayload('update', 'call-b', 'also-not-a-date');

  assert.equal(nextLiveCallPayload(current, sameCallUpdate), sameCallUpdate);
  assert.equal(nextLiveCallPayload(current, newerStart), newerStart);
  assert.equal(nextLiveCallPayload(current, unknownUpdate), current);
});

/** A queue fixture: only the fields the ordering actually reads. */
function queueCall(over: Partial<EmergencyCall> & { id: string }): EmergencyCall {
  return {
    caller_number: '+91112',
    status: 'pending',
    severity: 'high',
    created_at: '2026-09-08T10:00:00.000Z',
    updated_at: '2026-09-08T10:00:00.000Z',
    ...over,
  } as EmergencyCall;
}

test('the queue puts critical incidents above everything else', () => {
  // The defect this pins: the queue rendered in array order, so a P1 cardiac
  // arrest sat below two P2s on the console's highest-traffic surface.
  const ordered = sortIncidentQueue([
    queueCall({ id: 'p2-a', severity: 'high' }),
    queueCall({ id: 'p2-b', severity: 'high' }),
    queueCall({ id: 'p1', severity: 'critical' }),
    queueCall({ id: 'p3', severity: 'medium' }),
  ]).map((c) => c.id);

  assert.equal(ordered[0], 'p1');
  assert.equal(ordered[ordered.length - 1], 'p3');
});

test('within one grade the longest-waiting caller comes first', () => {
  // Two P1s are equally urgent by grade; the one closer to breaching its
  // response target is the one to work.
  const ordered = sortIncidentQueue([
    queueCall({ id: 'newer', severity: 'critical', created_at: '2026-09-08T10:09:00.000Z' }),
    queueCall({ id: 'older', severity: 'critical', created_at: '2026-09-08T10:01:00.000Z' }),
  ]).map((c) => c.id);

  assert.deepEqual(ordered, ['older', 'newer']);
});

test('a resolved incident sinks below open work, whatever its grade', () => {
  const ordered = sortIncidentQueue([
    queueCall({ id: 'closed-p1', severity: 'critical', status: 'resolved' }),
    queueCall({ id: 'open-p3', severity: 'low' }),
  ]).map((c) => c.id);

  assert.deepEqual(ordered, ['open-p3', 'closed-p1']);
});

test('an ungraded incident ranks below graded work but above closed work', () => {
  const ordered = sortIncidentQueue([
    queueCall({ id: 'closed', severity: 'critical', status: 'closed' }),
    queueCall({ id: 'ungraded', severity: undefined }),
    queueCall({ id: 'graded', severity: 'low' }),
  ]).map((c) => c.id);

  assert.deepEqual(ordered, ['graded', 'ungraded', 'closed']);
});

test('an incident with an unreadable timestamp surfaces, never sinks', () => {
  // We cannot tell how long this caller has been waiting. On a dispatch queue
  // the safe reading of "unknown" is "possibly the longest" — burying it is the
  // one outcome that must not happen.
  const ordered = sortIncidentQueue([
    queueCall({ id: 'known', severity: 'critical', created_at: '2026-09-08T10:00:00.000Z' }),
    queueCall({ id: 'broken', severity: 'critical', created_at: 'not-a-date' }),
  ]).map((c) => c.id);

  assert.equal(ordered[0], 'broken');
});

test('queue order is stable, so the list does not reshuffle on a re-render', () => {
  const calls = [
    queueCall({ id: 'b', severity: 'high' }),
    queueCall({ id: 'a', severity: 'high' }),
  ];
  assert.deepEqual(sortIncidentQueue(calls).map((c) => c.id), ['a', 'b']);
  assert.equal(compareIncidentsForQueue(calls[0], calls[0]), 0);
  // And sorting does not mutate the caller's array.
  assert.deepEqual(calls.map((c) => c.id), ['b', 'a']);
});

test('incident action checklist blocks dispatch until location is routable', () => {
  const checklist = incidentActionChecklist(
    queueCall({
      id: 'loc-missing',
      severity: 'critical',
      incident_type: 'medical_emergency',
      caller_location: { address: 'Near Gate 2' },
      operator_questions: ['Is the patient breathing normally?'],
    }),
  );

  assert.equal(checklist.nextAction, 'Verify routable location');
  assert.deepEqual(
    checklist.items.map((item) => [item.id, item.state]),
    [
      ['location', 'blocked'],
      ['incident', 'done'],
      ['injuries', 'needs_action'],
      ['response', 'needs_action'],
      ['unit', 'blocked'],
      ['decision', 'needs_action'],
    ],
  );
});

test('incident action checklist recognizes dispatched units and resolved decisions', () => {
  const checklist = incidentActionChecklist(
    queueCall({
      id: 'resolved',
      severity: 'high',
      status: 'resolved',
      incident_type: 'fire',
      caller_location: {
        address: 'Johari Bazaar, Jaipur',
        latitude: 26.9239,
        longitude: 75.8267,
      },
      persons_involved: 2,
      dispatch_plan: {
        priority_code: 'P2',
        eta_risk: 'low',
        operator_confirmation_required: false,
        units: [{ service: 'fire', unit: 'Engine 1', reason: 'Nearest fire engine' }],
      },
      dispatched_units: ['Engine 1'],
    }),
  );

  assert.equal(checklist.nextAction, 'Monitor or close incident');
  assert.equal(checklist.items.every((item) => item.state === 'done'), true);
});
