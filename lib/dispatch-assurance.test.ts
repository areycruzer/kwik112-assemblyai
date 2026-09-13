import test from 'node:test';
import assert from 'node:assert/strict';

import { assessDispatch } from './dispatch-assurance.ts';
import type { EmergencyCall } from './types.ts';
import { TACTICAL_UNITS, type TacticalUnit } from './units.ts';

function call(overrides: Partial<EmergencyCall> = {}): EmergencyCall {
  return {
    id: 'call-1',
    caller_number: '+91112',
    status: 'triage',
    call_status: 'in-progress',
    severity: 'critical',
    caller_location: {
      latitude: 28.7196,
      longitude: 77.1186,
      confidence: 0.9,
    },
    dispatch_plan: {
      priority_code: 'P1',
      eta_risk: 'high',
      operator_confirmation_required: true,
      units: [{ service: 'ems', unit: 'ALS Ambulance', reason: 'Critical medical response' }],
    },
    created_at: '2026-09-05T00:00:00.000Z',
    updated_at: '2026-09-05T00:00:00.000Z',
    ...overrides,
  };
}

const fleet: TacticalUnit[] = [
  { id: 'EMS-FAR', callsign: 'Medic Far', agency: 'CATS Delhi', type: 'ems', capabilities: ['ems', 'als'], lat: 28.80, lng: 77.20, status: 'available', speed: '0 km/h' },
  { id: 'EMS-BUSY', callsign: 'Medic Busy', agency: 'CATS Delhi', type: 'ems', capabilities: ['ems', 'als'], lat: 28.72, lng: 77.12, status: 'busy', speed: '0 km/h' },
  { id: 'EMS-NEAR', callsign: 'Medic Near', agency: 'CATS Delhi', type: 'ems', capabilities: ['ems', 'als'], lat: 28.721, lng: 77.119, status: 'available', speed: '0 km/h' },
];

test('assigns the nearest available matching unit and evaluates the P1 target', () => {
  const result = assessDispatch(call(), fleet);

  assert.equal(result.status, 'on_target');
  assert.equal(result.target_minutes, 8);
  assert.equal(result.assignments[0]?.unit_id, 'EMS-NEAR');
  assert.equal(result.assignments[0]?.requested_service, 'ems');
  assert.ok((result.assignments[0]?.eta_minutes ?? 99) <= 8);
  assert.equal(result.dispatch_ready, true);
});

test('blocks dispatch when incident coordinates are missing', () => {
  const result = assessDispatch(
    call({ caller_location: { address: 'Sector 16, Rohini', confidence: 0.9 } }),
    fleet,
  );

  assert.equal(result.status, 'location_required');
  assert.equal(result.dispatch_ready, false);
  assert.deepEqual(result.assignments, []);
  assert.match(result.reason, /coordinates/i);
});

test('requires operator location verification when confidence is below fifty percent', () => {
  const result = assessDispatch(
    call({
      caller_location: {
        latitude: 28.7196,
        longitude: 77.1186,
        confidence: 0.3,
      },
    }),
    fleet,
  );

  assert.equal(result.status, 'location_required');
  assert.equal(result.dispatch_ready, false);
  assert.match(result.reason, /verify/i);
});

test('rejects coordinates outside valid latitude and longitude bounds', () => {
  const result = assessDispatch(
    call({
      caller_location: {
        latitude: 128.7196,
        longitude: 277.1186,
        confidence: 0.9,
      },
    }),
    fleet,
  );

  assert.equal(result.status, 'location_required');
  assert.equal(result.dispatch_ready, false);
  assert.match(result.reason, /coordinates/i);
});

test('marks a distant unit at risk when its ETA exceeds the priority target', () => {
  const result = assessDispatch(call(), [fleet[0]]);

  assert.equal(result.status, 'at_risk');
  assert.equal(result.assignments[0]?.status, 'at_risk');
  assert.ok((result.assignments[0]?.eta_minutes ?? 0) > result.target_minutes);
  assert.equal(result.dispatch_ready, true);
});

test('reports a coverage gap when no requested service is available', () => {
  const result = assessDispatch(
    call({
      dispatch_plan: {
        priority_code: 'P1',
        eta_risk: 'high',
        operator_confirmation_required: true,
        units: [{ service: 'fire', unit: 'Fire Engine', reason: 'Active structure fire' }],
      },
    }),
    fleet,
  );

  assert.equal(result.status, 'no_coverage');
  assert.equal(result.dispatch_ready, false);
  assert.deepEqual(result.uncovered_services, ['fire']);
});

test('does not claim an incident is on target when no dispatch plan exists', () => {
  const result = assessDispatch(call({ dispatch_plan: undefined }), fleet);

  assert.equal(result.status, 'plan_required');
  assert.equal(result.dispatch_ready, false);
  assert.match(result.reason, /plan/i);
});

test('reference fleet covers fire, rescue, and EMS with separate physical units', () => {
  const result = assessDispatch(
    call({
      dispatch_plan: {
        priority_code: 'P1',
        eta_risk: 'high',
        operator_confirmation_required: true,
        units: [
          { service: 'fire', unit: 'Fire Engine', reason: 'Suppress active fire' },
          { service: 'rescue', unit: 'Rescue Ladder', reason: 'Reach trapped occupants' },
          { service: 'ems', unit: 'ALS Ambulance', reason: 'Treat smoke exposure' },
        ],
      },
    }),
    TACTICAL_UNITS,
  );

  assert.equal(result.status, 'on_target');
  assert.equal(result.assignments.length, 3);
  assert.equal(new Set(result.assignments.map((item) => item.unit_id)).size, 3);
  assert.deepEqual(result.uncovered_services, []);
});

test('does not recommend a unit already assigned to another incident', () => {
  const result = assessDispatch(call(), [
    { ...fleet[2], assignedCallId: 'call-elsewhere' },
    fleet[0],
  ]);

  assert.equal(result.assignments[0]?.unit_id, 'EMS-FAR');
});

test('matches rescue and ALS requirements to capable units, not merely service type', () => {
  const capabilityFleet = [
    { id: 'FIRE-NEAR', callsign: 'Engine Near', agency: 'Delhi Fire Service', type: 'fire', capabilities: ['fire'], lat: 28.720, lng: 77.119, status: 'available', speed: '0 km/h' },
    { id: 'RESCUE-FAR', callsign: 'Ladder Far', agency: 'Delhi Fire Service', type: 'fire', capabilities: ['fire', 'rescue'], lat: 28.730, lng: 77.130, status: 'available', speed: '0 km/h' },
    { id: 'BLS-NEAR', callsign: 'BLS Near', agency: 'CATS Delhi', type: 'ems', capabilities: ['ems'], lat: 28.720, lng: 77.119, status: 'available', speed: '0 km/h' },
    { id: 'ALS-FAR', callsign: 'ALS Far', agency: 'CATS Delhi', type: 'ems', capabilities: ['ems', 'als'], lat: 28.730, lng: 77.130, status: 'available', speed: '0 km/h' },
  ] as unknown as TacticalUnit[];
  const result = assessDispatch(
    call({
      dispatch_plan: {
        priority_code: 'P1',
        eta_risk: 'high',
        operator_confirmation_required: true,
        units: [
          { service: 'rescue', unit: 'Rescue Ladder', reason: 'Reach trapped occupants' },
          { service: 'ems', unit: 'Advanced Life Support Ambulance', reason: 'Critical care' },
        ],
      },
    }),
    capabilityFleet,
  );

  assert.deepEqual(
    result.assignments.map((assignment) => assignment.unit_id),
    ['RESCUE-FAR', 'ALS-FAR'],
  );
});

test('allocates constrained rescue capability before flexible fire coverage', () => {
  const result = assessDispatch(
    call({
      caller_location: { latitude: 28.7241, longitude: 77.1262, confidence: 0.9 },
      dispatch_plan: {
        priority_code: 'P1',
        eta_risk: 'high',
        operator_confirmation_required: true,
        units: [
          { service: 'fire', unit: 'Fire Engine', reason: 'Suppress active fire' },
          { service: 'rescue', unit: 'Rescue Ladder', reason: 'Reach trapped occupants' },
        ],
      },
    }),
    TACTICAL_UNITS,
  );

  assert.equal(result.status, 'on_target');
  assert.equal(result.assignments.find((item) => item.requested_service === 'rescue')?.unit_id, 'DFS-206');
  assert.equal(result.assignments.find((item) => item.requested_service === 'fire')?.unit_id, 'DFS-211');
});

test('a call with no explicit priority code is assured against its severity', () => {
  // The regression this pins, in the exact shape it shipped: the console's
  // demo and stored calls carry neither a dispatch plan nor a `priority_code`,
  // and the old `?? 'P3'` fallback then measured a critical incident against
  // P3's 30-minute target while every other view labelled it P1. Response
  // assurance exists to catch a late response; on the wrong clock it cannot.
  const bare = (overrides: Partial<EmergencyCall>) =>
    assessDispatch(
      call({ priority_code: undefined, dispatch_plan: undefined, ...overrides }),
      TACTICAL_UNITS,
    );

  const critical = bare({ severity: 'critical' });
  assert.equal(critical.priority_code, 'P1');
  assert.equal(critical.target_minutes, 8);

  const high = bare({ severity: 'high' });
  assert.equal(high.priority_code, 'P2');
  assert.equal(high.target_minutes, 15);

  const low = bare({ severity: 'low' });
  assert.equal(low.priority_code, 'P3');
  assert.equal(low.target_minutes, 30);

  // An explicit code still wins over the severity derivation.
  assert.equal(bare({ severity: 'critical', priority_code: 'P3' }).priority_code, 'P3');

  // And a legacy "Code N" grade is normalised the way the console displays it.
  const legacy = bare({ severity: 'low', priority_code: 'Code 3' });
  assert.equal(legacy.priority_code, 'P1');
  assert.equal(legacy.target_minutes, 8);
});
