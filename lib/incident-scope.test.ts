import assert from 'node:assert/strict';
import test from 'node:test';

import type { EmergencyCall } from './types.ts';
import { JUDGE_CALLER_PRESETS } from './personas.ts';
import { localTriage } from './triage-local.ts';
import {
  filterDelhiIncidents,
  isDelhiIncident,
  scopedIncidentSelection,
} from './incident-scope.ts';

function call(id: string, location: EmergencyCall['caller_location']): EmergencyCall {
  return {
    id,
    caller_number: '+91 00000 00000',
    status: 'active',
    call_status: 'in-progress',
    caller_location: location,
    created_at: '2026-09-08T10:00:00.000Z',
    updated_at: '2026-09-08T10:00:00.000Z',
  };
}

test('Delhi scope removes incidents explicitly located in other states', () => {
  const delhi = call('delhi', {
    address: 'Shalimar Bagh Community Park gate, Delhi',
    city: 'New Delhi',
    state: 'Delhi',
  });
  const jaipur = call('jaipur', {
    address: 'Johari Bazaar, Jaipur',
    city: 'Jaipur',
    state: 'Rajasthan',
  });
  const mumbai = call('mumbai', {
    address: 'Andheri East, Mumbai',
    city: 'Mumbai',
    state: 'Maharashtra',
  });

  assert.equal(isDelhiIncident(delhi), true);
  assert.deepEqual(filterDelhiIncidents([jaipur, delhi, mumbai]), [delhi]);
});

test('Delhi coordinates keep a locally reported incident when city text is absent', () => {
  assert.equal(
    isDelhiIncident(call('gps-delhi', { latitude: 28.7049, longitude: 77.1324, source: 'gps' })),
    true,
  );
});

test('selection moves off an incident removed by the Delhi scope', () => {
  const first = call('delhi-1', { city: 'New Delhi', state: 'Delhi' });
  const second = call('delhi-2', { city: 'Delhi', state: 'Delhi' });

  assert.equal(scopedIncidentSelection('removed-jaipur', [first, second]), 'delhi-1');
  assert.equal(scopedIncidentSelection('delhi-2', [first, second]), 'delhi-2');
  assert.equal(scopedIncidentSelection('removed-jaipur', []), null);
});

test('all scripted Delhi calls survive the city scope without geocoding', () => {
  for (const preset of JUDGE_CALLER_PRESETS) {
    const transcript = preset.lines
      .filter((line) => line.role === 'user')
      .map((line) => line.text)
      .join(' ');
    const location = localTriage(transcript).extraction.location;

    assert.equal(isDelhiIncident(call(preset.id, location)), true, preset.name);
  }
});
