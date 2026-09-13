import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TACTICAL_UNITS,
  etaLabel,
  etaMinutes,
  haversineKm,
  localFleet,
  LOCAL_COVER_RADIUS_KM,
  nearestAvailableUnit,
  responseUnitsForIncident,
  serviceForIncidentType,
  speedKmh,
} from './units.ts';

test('the fleet is an Indian one, with no American CAD callsigns left', () => {
  // Kwik 112 runs on India's ERSS stack; "Cruiser / Engine / Ladder / Medic"
  // are US nomenclature and were the single loudest wrong note on the console.
  const callsigns = TACTICAL_UNITS.map((u) => u.callsign).join(' | ');
  for (const foreign of ['Cruiser', 'Engine ', 'Ladder', 'Medic', 'Air Rescue', 'Interceptor']) {
    assert.ok(!callsigns.includes(foreign), `${foreign} is not an Indian appliance name`);
  }

  // Each service is named the way its own Delhi agency names it.
  const byType = (type: string) => TACTICAL_UNITS.filter((u) => u.type === type);
  assert.ok(byType('police').every((u) => /PCR/.test(u.callsign)));
  assert.ok(byType('fire').every((u) => /Tender|Hydraulic Platform/.test(u.callsign)));
  assert.ok(byType('ems').every((u) => /Ambulance/.test(u.callsign)));

  // And every unit names the agency that owns it, spelled out. This is what
  // makes the roster legible as Indian at a glance: a callsign on its own reads
  // as a codeword, "Delhi Fire Service" does not.
  for (const unit of TACTICAL_UNITS) {
    assert.ok(unit.agency.trim().length > 0, `${unit.id} must name its agency`);
  }

  // The Delhi units keep their specific agencies; the fleet is no longer
  // single-agency, because it is no longer single-city.
  const delhi = TACTICAL_UNITS.filter((u) => /^(PCR|DFS|CATS)-/.test(u.id));
  assert.equal(delhi.find((u) => u.type === 'police')?.agency, 'Delhi Police');
  assert.equal(delhi.find((u) => u.type === 'fire')?.agency, 'Delhi Fire Service');
  assert.equal(delhi.find((u) => u.type === 'ems')?.agency, 'CATS Delhi');

  // Ids stay unique and service-prefixed, since dispatch reservations key on them.
  assert.equal(new Set(TACTICAL_UNITS.map((u) => u.id)).size, TACTICAL_UNITS.length);
});

test('speedKmh reads the number out of a speed string, and treats absence as zero', () => {
  assert.equal(speedKmh('48 km/h'), 48);
  assert.equal(speedKmh('0 km/h'), 0);
  assert.equal(speedKmh(undefined), 0);
  assert.equal(speedKmh('unknown'), 0);
});

test('a unit already beating its service speed is projected at its own speed', () => {
  // 12 km at a measured 48 km/h — well above the fire dispatch assumption — is
  // 15 minutes.
  assert.equal(etaMinutes({ type: 'fire', speed: '48 km/h' }, 12), 15);
});

test('a stationary unit falls back to its service dispatch speed, not to zero', () => {
  // Dividing by a measured 0 km/h would give Infinity; each service has an
  // assumed running speed instead. A tender is slower than a PCR van, so the
  // same distance must project a longer fire ETA.
  const distance = 10;
  const police = etaMinutes({ type: 'police', speed: '0 km/h' }, distance);
  const fire = etaMinutes({ type: 'fire', speed: '0 km/h' }, distance);
  assert.ok(Number.isFinite(police) && police > 0);
  assert.ok(fire > police, 'a heavy appliance must not be projected faster than a PCR van');
});

test('a unit crawling in traffic is not projected slower than one at the station', () => {
  // The bug this pins: projecting purely on measured speed made a PCR van
  // stuck at 12 km/h look 3x further out than an identical van parked at a
  // station, which is backwards — it is closer, and it runs blue-light once
  // assigned.
  const crawling = etaMinutes({ type: 'police', speed: '12 km/h' }, 3.8);
  const parked = etaMinutes({ type: 'police', speed: '0 km/h' }, 3.8);
  assert.equal(crawling, parked);
  assert.ok(crawling < 10, `expected a single-digit ETA over 3.8 km, got ${crawling}`);
});

test('ETA rounds up and never reads as an instant arrival', () => {
  // 0.05 km at 34 km/h is ~5 seconds; rounding down would print "0 min" and
  // promise the operator an arrival that has not happened.
  assert.equal(etaMinutes({ type: 'police', speed: '0 km/h' }, 0.05), 1);
});

test('with no incident selected the ETA is an em-dash, never a fabricated number', () => {
  assert.equal(etaLabel({ type: 'ems', speed: '0 km/h' }, null), '—');
  assert.equal(etaLabel({ type: 'ems', speed: '30 km/h' }, 15), '30 min');
});

test('haversine measures the distance between two Delhi coordinates', () => {
  const km = haversineKm(28.7041, 77.1025, 28.7241, 77.1262);
  assert.ok(km > 2 && km < 4, `expected a few km across Rohini, got ${km}`);
  assert.equal(haversineKm(28.7041, 77.1025, 28.7041, 77.1025), 0);
});

test('incident types map to the service that would lead the response', () => {
  assert.equal(serviceForIncidentType('fire'), 'fire');
  assert.equal(serviceForIncidentType('medical_emergency'), 'ems');
  assert.equal(serviceForIncidentType('traffic_collision'), 'ems');
  assert.equal(serviceForIncidentType('crime'), 'police');
  assert.equal(serviceForIncidentType('flood_rescue'), 'fire');
  // An unknown type nominates no service, so the caller routes from the
  // nearest unit of any kind rather than guessing a wrong one.
  assert.equal(serviceForIncidentType('something else'), null);
  assert.equal(serviceForIncidentType(undefined), null);
});

test('nearestAvailableUnit prefers the requested service over raw distance', () => {
  // Around the Rohini fixture: the nearest EMS unit is further than several
  // police/fire units, but a cardiac call must still route from an ambulance.
  const cardiac = nearestAvailableUnit(TACTICAL_UNITS, 28.7041, 77.1025, 'ems');
  assert.ok(cardiac, 'a unit must be found');
  assert.equal(cardiac!.type, 'ems');
});

test('every response unit belongs to the Delhi command area', () => {
  for (const unit of TACTICAL_UNITS) {
    assert.match(unit.agency, /Delhi/);
    assert.ok(unit.lat >= 28.4 && unit.lat <= 28.9, `${unit.id} latitude is outside Delhi`);
    assert.ok(unit.lng >= 76.8 && unit.lng <= 77.35, `${unit.id} longitude is outside Delhi`);
  }
});

test('a cardiac arrest roster starts with ambulances and hides unrelated fire units', () => {
  const ordered = responseUnitsForIncident(
    TACTICAL_UNITS,
    {
      id: 'cardiac-1',
      incident_type: 'other',
      incident_subtype: 'cardiac arrest',
      severity: 'critical',
      dispatch_plan: {
        units: [
          { service: 'ems' },
          { service: 'police' },
        ],
      },
    },
    { lat: 28.7049, lng: 77.1324 },
  );

  assert.equal(ordered[0]?.type, 'ems');
  assert.ok(ordered.slice(0, TACTICAL_UNITS.filter((unit) => unit.type === 'ems').length).every((unit) => unit.type === 'ems'));
  assert.ok(!ordered.some((unit) => unit.type === 'fire'));
});

test('an incident without a dispatch plan shows only its lead service', () => {
  const ordered = responseUnitsForIncident(
    TACTICAL_UNITS,
    { id: 'medical-1', incident_type: 'medical_emergency' },
    { lat: 28.7049, lng: 77.1324 },
  );

  assert.ok(ordered.length > 0);
  assert.ok(ordered.every((unit) => unit.type === 'ems'));
});

test('nearestAvailableUnit falls back to any service rather than to nothing', () => {
  // Ask for EMS from a fleet that has none: a vector from the nearest police
  // van beats a map with no vector at all - the whole bug this guards was the
  // vector silently not drawing.
  const noEms = TACTICAL_UNITS.filter((u) => u.type !== 'ems');
  const unit = nearestAvailableUnit(noEms, 28.7041, 77.1025, 'ems');
  assert.ok(unit, 'must fall back to some unit');
  assert.notEqual(unit!.type, 'ems');
});

test('nearestAvailableUnit skips units reserved for other calls', () => {
  const fleet = TACTICAL_UNITS.map((u) =>
    u.type === 'ems' ? { ...u, assignedCallId: 'other-call' } : u,
  );
  const unit = nearestAvailableUnit(fleet, 28.7041, 77.1025, 'ems', 'my-call');
  assert.ok(unit);
  // Every EMS unit is spoken for by another call, so the fallback pool wins.
  assert.notEqual(unit!.type, 'ems');

  // But a unit reserved for THIS call is fair game - it is the response.
  const mine = TACTICAL_UNITS.map((u) =>
    u.id === 'CATS-302' ? { ...u, status: 'busy' as const, assignedCallId: 'my-call' } : u,
  );
  const own = nearestAvailableUnit(mine, 28.725, 77.135, 'ems', 'my-call');
  assert.equal(own?.id, 'CATS-302');
});

test('no seeded unit is committed without a call to be committed to', () => {
  // 'en-route' means en route to something. A unit seeded into a committed
  // status with no `assignedCallId` is a contradiction the whole console then
  // acts on: the roster labels it EN ROUTE next to a button offering to
  // dispatch it, the map dims it as unavailable, and assessDispatch — which
  // filters on `status === 'available'` — drops it from coverage entirely.
  const COMMITTED = ['en-route', 'on-scene', 'busy'];
  for (const unit of TACTICAL_UNITS) {
    if (COMMITTED.includes(unit.status)) {
      assert.ok(
        unit.assignedCallId,
        `${unit.id} is seeded '${unit.status}' with no assignedCallId`,
      );
    }
  }

  // Movement is not commitment: a unit can be rolling and still available, and
  // that combination is what exercises the measured-speed ETA path.
  const rollingButFree = TACTICAL_UNITS.filter(
    (u) => u.status === 'available' && speedKmh(u.speed) > 0,
  );
  assert.ok(rollingButFree.length > 0, 'keep at least one moving, uncommitted unit');
});

/**
 * The Delhi districts the demo dispatches to, mirroring the incident
 * coordinates in lib/mock-data. Repeated here rather than imported because
 * mock-data's own imports are not extension-qualified and will not load under
 * `node --test`.
 */
const SERVICE_AREAS: ReadonlyArray<{ name: string; lat: number; lng: number }> = [
  { name: 'Rohini', lat: 28.7196, lng: 77.1186 },
  { name: 'Shalimar Bagh', lat: 28.7049, lng: 77.1324 },
  { name: 'Pitampura', lat: 28.6892, lng: 77.1310 },
  { name: 'Chandni Chowk', lat: 28.6562, lng: 77.2300 },
  { name: 'Anand Vihar', lat: 28.6469, lng: 77.3157 },
  { name: 'Seelampur', lat: 28.6742, lng: 77.2673 },
  { name: 'India Gate', lat: 28.6129, lng: 77.2295 },
  { name: 'Nehru Place', lat: 28.5494, lng: 77.2501 },
  { name: 'Moti Bagh', lat: 28.5772, lng: 77.1745 },
  { name: 'Lajpat Nagar', lat: 28.5677, lng: 77.2433 },
  { name: 'Gandhi Nagar', lat: 28.6560, lng: 77.2760 },
  { name: 'Chhatarpur', lat: 28.5065, lng: 77.1750 },
];

test('every district the console serves is reachable by every service', () => {
  // The bug this pins: incidents once spanned nine cities against a Delhi-only
  // fleet, so a collapse was assured against an appliance 1,300 km away and the
  // console reported a 3,039-minute ETA in earnest. The demo is one city now,
  // and every corner of it has to be inside a workable response time.
  for (const city of SERVICE_AREAS) {
    for (const service of ['police', 'fire', 'ems'] as const) {
      const nearest = nearestAvailableUnit(TACTICAL_UNITS, city.lat, city.lng, service);
      assert.ok(nearest, `${city.name} has no ${service} unit at all`);
      assert.equal(nearest!.type, service, `${city.name} has no local ${service} unit`);
      const km = haversineKm(nearest!.lat, nearest!.lng, city.lat, city.lng);
      assert.ok(
        km < 25,
        `nearest ${service} unit to ${city.name} is ${km.toFixed(0)} km away`,
      );
      // And the arrival it projects has to be a number a dispatcher can act on.
      const minutes = etaMinutes(nearest!, km);
      assert.ok(minutes <= 60, `${city.name} ${service} ETA is ${minutes} min`);
    }
  }
});

test('technical rescue is covered across the city, not only its north-west', () => {
  // A `rescue` request with no capable unit reports as uncovered, and building
  // collapse is exactly the incident that asks for one.
  for (const city of SERVICE_AREAS) {
    const capable = TACTICAL_UNITS.filter(
      (u) =>
        (u.capabilities ?? []).includes('rescue') &&
        haversineKm(u.lat, u.lng, city.lat, city.lng) < 25,
    );
    assert.ok(capable.length > 0, `${city.name} has no rescue-capable appliance`);
  }
});

test('a Delhi incident sees the Delhi fleet, wherever in the city it is', () => {
  // With one city the radius filters nothing on a normal call, which is the
  // correct behaviour: a command desk works its whole fleet. What must not
  // happen is a district falling outside its own cover.
  for (const area of SERVICE_AREAS) {
    const local = localFleet(TACTICAL_UNITS, area.lat, area.lng);
    assert.equal(local.mutualAid, false, `${area.name} should have local cover`);
    assert.equal(
      local.units.length,
      TACTICAL_UNITS.length,
      `${area.name} should see the whole city fleet`,
    );
    for (const unit of local.units) {
      const km = haversineKm(unit.lat, unit.lng, area.lat, area.lng);
      assert.ok(km <= LOCAL_COVER_RADIUS_KM, `${unit.id} is ${km.toFixed(0)} km from ${area.name}`);
    }
  }
});

test('a call from outside the city falls back to mutual aid, never to nothing', () => {
  // The voice intake accepts any location, so a call can arrive from well
  // outside Delhi. "No units" and "no units nearby" are different answers, and
  // the radius exists to stop the second being reported as the first.
  const adrift = localFleet(TACTICAL_UNITS, 15.0, 87.0);
  assert.equal(adrift.mutualAid, true);
  assert.ok(adrift.units.length > 0, 'the roster must never be empty');
  assert.ok(adrift.units.length <= 3);
});
