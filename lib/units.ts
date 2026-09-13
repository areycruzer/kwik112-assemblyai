/**
 * @module units
 * @description The responder fleet, lifted verbatim out of `EmergencyMap` so
 *              the situational map and the unit-roster module read the same
 *              source of truth and can never disagree about where a unit is or
 *              what it is doing. Add units here, not in a component.
 *
 *              The fleet is Delhi's, not a US city's. Kwik 112 sits on India's
 *              ERSS/Dial 112 stack, so the roster carries the appliances a Delhi
 *              control room actually dispatches — Delhi Police PCR vans, Delhi
 *              Fire Service tenders and a hydraulic platform, CATS ambulances —
 *              rather than the "Cruiser / Engine / Ladder / Medic" callsigns of
 *              American CAD, which no Indian dispatcher or judge would recognise.
 *
 *              Every unit also names the agency that owns it. The callsign alone
 *              does not carry that: an internal callsign like "Zebra 11" is what
 *              a control room says on the radio, but on screen it reads as a
 *              codeword, not as an Indian police vehicle. "PCR Van 11 · Delhi
 *              Police" needs no decoding.
 *
 *              Self-contained: it imports nothing from the rest of the project,
 *              so a plain `node --test` (or any component) can consume it
 *              without dragging in Leaflet or the design layer.
 */

export interface TacticalUnit {
  id: string;
  callsign: string;
  type: 'police' | 'fire' | 'ems';
  /** The service that owns the unit, spelled out — "Delhi Police", "CATS Delhi". */
  agency: string;
  lat: number;
  lng: number;
  status: 'available' | 'en-route' | 'on-scene' | 'busy';
  speed: string;
  assignedCallId?: string;
  capabilities?: Array<'police' | 'fire' | 'ems' | 'rescue' | 'als'>;
}

interface IncidentResponseContext {
  id: string;
  incident_type?: string;
  incident_subtype?: string;
  chief_complaint?: string;
  ai_summary?: string;
  severity?: string;
  dispatch_plan?: {
    units: Array<{ service: 'ems' | 'fire' | 'police' | 'rescue' | 'civic' }>;
  };
}

/**
 * Delhi's First Responder Fleet.
 *
 * The console is a single-city command desk, because that is what a 112
 * dispatcher works: one control room, one fleet, one geography they know by
 * heart. An earlier version scattered incidents across nine cities, which made
 * every ETA and every coverage check meaningless — a Kolkata collapse assured
 * against a Delhi appliance projected a fifty-hour arrival. The demo is Delhi
 * end to end, and the fleet is spread across its districts so proximity is a
 * real question rather than a formality.
 *
 * Naming follows the real services, in the words they use themselves:
 *   - PCR Van            → Delhi Police's Police Control Room response vehicle.
 *   - Fire / Rescue Tender, Hydraulic Platform → Delhi Fire Service's pumping,
 *     technical-rescue and aerial appliances. The platform is what reaches a
 *     fourth floor.
 *   - Ambulance / ALS    → CATS, the Centralised Accident & Trauma Services.
 *     The bike ambulance is DFS/CATS's first-responder motorcycle, which is how
 *     a paramedic reaches a patient inside Chandni Chowk's lanes at all.
 */
export const TACTICAL_UNITS: TacticalUnit[] = [
  // ---- Delhi Police · PCR vans -------------------------------------------
  { id: 'PCR-11', callsign: 'PCR Van 11', agency: 'Delhi Police', type: 'police', capabilities: ['police'], lat: 28.7180, lng: 77.1100, status: 'available', speed: '0 km/h' },
  // Rolling at 12 km/h but uncommitted — on patrol. Movement is not commitment:
  // see the status invariant below.
  { id: 'PCR-24', callsign: 'PCR Van 24', agency: 'Delhi Police', type: 'police', capabilities: ['police'], lat: 28.6850, lng: 77.1200, status: 'available', speed: '12 km/h' },
  { id: 'PCR-32', callsign: 'PCR Van 32', agency: 'Delhi Police', type: 'police', capabilities: ['police'], lat: 28.6800, lng: 77.2200, status: 'available', speed: '0 km/h' },
  { id: 'PCR-45', callsign: 'PCR Van 45', agency: 'Delhi Police', type: 'police', capabilities: ['police'], lat: 28.6315, lng: 77.2167, status: 'available', speed: '28 km/h' },
  { id: 'PCR-58', callsign: 'PCR Van 58', agency: 'Delhi Police', type: 'police', capabilities: ['police'], lat: 28.5510, lng: 77.2520, status: 'available', speed: '0 km/h' },
  { id: 'PCR-63', callsign: 'PCR Van 63', agency: 'Delhi Police', type: 'police', capabilities: ['police'], lat: 28.6480, lng: 77.3130, status: 'available', speed: '0 km/h' },

  // ---- Delhi Fire Service ------------------------------------------------
  { id: 'DFS-204', callsign: 'Fire Tender 204', agency: 'Delhi Fire Service', type: 'fire', capabilities: ['fire'], lat: 28.6920, lng: 77.0850, status: 'available', speed: '48 km/h' },
  { id: 'DFS-211', callsign: 'Fire Tender 211', agency: 'Delhi Fire Service', type: 'fire', capabilities: ['fire'], lat: 28.7162, lng: 77.1125, status: 'available', speed: '0 km/h' },
  { id: 'DFS-206', callsign: 'Hydraulic Platform 206', agency: 'Delhi Fire Service', type: 'fire', capabilities: ['fire', 'rescue'], lat: 28.7241, lng: 77.1262, status: 'available', speed: '0 km/h' },
  { id: 'DFS-218', callsign: 'Fire Tender 218', agency: 'Delhi Fire Service', type: 'fire', capabilities: ['fire'], lat: 28.6540, lng: 77.2290, status: 'available', speed: '0 km/h' },
  { id: 'DFS-225', callsign: 'Rescue Tender 225', agency: 'Delhi Fire Service', type: 'fire', capabilities: ['fire', 'rescue'], lat: 28.6350, lng: 77.2770, status: 'available', speed: '0 km/h' },
  { id: 'DFS-233', callsign: 'Fire Tender 233', agency: 'Delhi Fire Service', type: 'fire', capabilities: ['fire'], lat: 28.5680, lng: 77.2050, status: 'available', speed: '0 km/h' },

  // ---- CATS · Centralised Accident & Trauma Services ---------------------
  { id: 'CATS-302', callsign: 'Ambulance 302', agency: 'CATS Delhi', type: 'ems', capabilities: ['ems', 'als'], lat: 28.7250, lng: 77.1350, status: 'available', speed: '0 km/h' },
  { id: 'CATS-309', callsign: 'ALS Ambulance 309', agency: 'CATS Delhi', type: 'ems', capabilities: ['ems', 'als'], lat: 28.7400, lng: 77.0900, status: 'available', speed: '0 km/h' },
  { id: 'CATS-317', callsign: 'Ambulance 317', agency: 'CATS Delhi', type: 'ems', capabilities: ['ems'], lat: 28.5690, lng: 77.2430, status: 'available', speed: '0 km/h' },
  { id: 'CATS-324', callsign: 'ALS Ambulance 324', agency: 'CATS Delhi', type: 'ems', capabilities: ['ems', 'als'], lat: 28.5672, lng: 77.2100, status: 'available', speed: '0 km/h' },
  { id: 'CATS-331', callsign: 'Ambulance 331', agency: 'CATS Delhi', type: 'ems', capabilities: ['ems'], lat: 28.6180, lng: 77.2250, status: 'available', speed: '22 km/h' },
  { id: 'CATS-BRA-07', callsign: 'Bike Ambulance 07', agency: 'CATS Delhi', type: 'ems', capabilities: ['ems'], lat: 28.6560, lng: 77.2310, status: 'available', speed: '0 km/h' },
];

/* ---- STATUS INVARIANT -----------------------------------------------------
 * A unit is 'en-route', 'on-scene' or 'busy' only when it is committed to a
 * call — i.e. only when it carries an `assignedCallId`. `applyUnitReservations`
 * maintains that when a dispatcher assigns one; the seed data above has to
 * respect it too.
 *
 * DFS-204 used to be seeded 'en-route' with nothing to be en route TO, and
 * three separate parts of the console believed it: the roster showed EN ROUTE
 * beside a button offering to dispatch it, the map drew it dimmed as though
 * committed, and — worst — `assessDispatch` filters candidates on
 * `status === 'available'`, so a working fire tender was silently excluded
 * from fire coverage. `no seeded unit is committed without a call` pins it.
 * ------------------------------------------------------------------------- */

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * @description Great-circle distance between two lat/lng points, in kilometres,
 *              via the haversine formula. Used to read a unit's distance to the
 *              currently selected incident; the caller shows an em-dash when no
 *              incident is selected rather than passing a fabricated coordinate.
 */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* ---- ETA ------------------------------------------------------------------
 * A dispatcher picks a unit on projected arrival time, not on raw distance: the
 * nearest appliance is not the fastest one when it is parked and another is
 * already rolling. So the roster shows both, and this is where the arrival
 * figure is derived.
 * ------------------------------------------------------------------------- */

/**
 * Running-speed assumption, km/h, for a unit that is currently stationary — at
 * a station or standing by. These are blue-light averages through Delhi traffic,
 * not free-flow limits: a tender is heavy and slow to clear junctions, a PCR van
 * filters through them fastest. They are an assumption, and the UI labels the
 * number an ETA (an estimate) rather than a promise.
 */
const DISPATCH_SPEED_KMH: Record<TacticalUnit['type'], number> = {
  police: 34,
  fire: 26,
  ems: 30,
};

/** @description Read the leading number out of a `"48 km/h"` speed string. */
export function speedKmh(speed: string | undefined): number {
  const match = /-?\d+(\.\d+)?/.exec(speed ?? '');
  const value = match ? Number(match[0]) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * @description Minutes until this unit reaches a point `distanceKm` away.
 *
 *              The projection runs at whichever is faster: the unit's measured
 *              speed, or its service's dispatch assumption. Measured speed alone
 *              is wrong in both directions — a parked unit reads 0 km/h and would
 *              never arrive, and a unit crawling through a jam at 12 km/h would
 *              be projected slower than an identical unit sitting at the station,
 *              when in fact it is closer and will run under blue light the moment
 *              it is assigned. Taking the faster of the two says: this unit
 *              responds at its service's normal speed, unless it is already
 *              beating it.
 *
 *              Rounded up — a dispatcher under-promising by a minute is safe,
 *              over-promising is not — and floored at 1, since a unit that is
 *              not already on scene cannot arrive in zero minutes.
 */
export function etaMinutes(unit: Pick<TacticalUnit, 'type' | 'speed'>, distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  const kmh = Math.max(speedKmh(unit.speed), DISPATCH_SPEED_KMH[unit.type]);
  return Math.max(1, Math.ceil((distanceKm / kmh) * 60));
}

/**
 * @description The ETA as shown to the operator, or an em-dash when there is no
 *              incident selected to measure to. Absence is a real state and is
 *              never dressed up as a zero.
 */
export function etaLabel(
  unit: Pick<TacticalUnit, 'type' | 'speed'>,
  distanceKm: number | null,
): string {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return '—';
  const minutes = etaMinutes(unit, distanceKm);
  return minutes === 0 ? 'On scene' : `${minutes} min`;
}

/* ---- LOCAL COVER ----------------------------------------------------------
 * The roster and the map show the units that could actually respond, which is a
 * question of geography, not of the whole fleet. On a Delhi-only fleet this is a
 * guard rather than a filter — see LOCAL_COVER_RADIUS_KM.
 * ------------------------------------------------------------------------- */

/**
 * How far a unit can be and still count as local cover, in km.
 *
 * Delhi NCR spans roughly 50 km end to end, so 80 km holds the whole command
 * desk's own geography while still excluding anything outside it. With a
 * single-city fleet this filters nothing on a normal call — and that is the
 * point of keeping it: a live call placed from outside Delhi (the voice intake
 * accepts any location) would otherwise be assured against appliances hours
 * away and told they were local.
 */
export const LOCAL_COVER_RADIUS_KM = 80;

export interface LocalFleet {
  /** Units that can respond, nearest first. */
  units: TacticalUnit[];
  /**
   * True when nothing was in range and these are simply the nearest units in
   * the country. That is a mutual-aid situation and the UI has to say so —
   * silently showing a 400 km appliance as though it were local is how a
   * dispatcher ends up promising an arrival that cannot happen.
   */
  mutualAid: boolean;
  radiusKm: number;
}

/**
 * @description The units worth showing for an incident at this point: those
 *              within `radiusKm`, nearest first.
 *
 *              Never returns an empty roster. An incident outside every covered
 *              region falls back to the nearest `fallbackCount` units with
 *              `mutualAid` set, because "no units" and "no units nearby" are
 *              different answers and only one of them is true.
 */
export function localFleet(
  units: readonly TacticalUnit[],
  lat: number,
  lng: number,
  radiusKm: number = LOCAL_COVER_RADIUS_KM,
  fallbackCount = 3,
): LocalFleet {
  const byDistance = units
    .map((unit) => ({ unit, km: haversineKm(unit.lat, unit.lng, lat, lng) }))
    .sort((a, b) => a.km - b.km);

  const inRange = byDistance.filter((entry) => entry.km <= radiusKm);
  if (inRange.length > 0) {
    return { units: inRange.map((e) => e.unit), mutualAid: false, radiusKm };
  }
  return {
    units: byDistance.slice(0, fallbackCount).map((e) => e.unit),
    mutualAid: byDistance.length > 0,
    radiusKm,
  };
}

/* ---- ROUTE FALLBACK -------------------------------------------------------
 * The situational map draws a responder vector from a unit to the selected
 * incident. assessDispatch can only nominate a unit when the call carries a
 * service-level dispatch plan, and most demo/stored calls carry none - so
 * without a fallback the vector silently never drew for them, which read as
 * "the distance feature is broken". These helpers pick the unit a dispatcher
 * would eyeball: the nearest available appliance of the right service.
 * ------------------------------------------------------------------------- */

/**
 * @description The service that would lead the response to an incident type,
 *              or null when the type says nothing (route from the nearest unit
 *              of any service instead). Deliberately duplicates the keyword
 *              logic of `glyphForIncidentType` rather than importing it: this
 *              module stays import-free so `node --test` can load it bare.
 */
export function serviceForIncidentType(incidentType?: string): TacticalUnit['type'] | null {
  if (!incidentType) return null;
  const t = incidentType.toLowerCase();
  if (t.includes('fire')) return 'fire';
  if (t.includes('medical') || t.includes('cardiac') || t.includes('health')) return 'ems';
  // A collision's first need is the casualty, so the ambulance leads.
  if (t.includes('accident') || t.includes('traffic') || t.includes('collision')) return 'ems';
  if (t.includes('crime') || t.includes('violen') || t.includes('robbery')) return 'police';
  // Flood and waterlogging rescue is fire-service work in Indian cities.
  if (t.includes('flood') || t.includes('water') || t.includes('drown')) return 'fire';
  if (t.includes('public_safety') || t.includes('utility') || t.includes('civic')) return 'fire';
  return null;
}

function unitTypeForResponseService(
  service: 'ems' | 'fire' | 'police' | 'rescue' | 'civic',
): TacticalUnit['type'] | null {
  if (service === 'ems' || service === 'fire' || service === 'police') return service;
  if (service === 'rescue' || service === 'civic') return 'fire';
  return null;
}

/** Return the relevant fleet for an incident, ordered for dispatch. */
export function responseUnitsForIncident(
  units: readonly TacticalUnit[],
  call: IncidentResponseContext | null,
  point: { lat: number; lng: number } | null,
): TacticalUnit[] {
  if (!call) return [...units];

  const descriptor = [
    call.incident_type,
    call.incident_subtype,
    call.chief_complaint,
    call.ai_summary,
  ]
    .filter(Boolean)
    .join(' ');
  const leadService = serviceForIncidentType(descriptor);
  const serviceOrder: TacticalUnit['type'][] = [];
  const addService = (service: TacticalUnit['type'] | null) => {
    if (service && !serviceOrder.includes(service)) serviceOrder.push(service);
  };

  addService(leadService);
  for (const requirement of call.dispatch_plan?.units ?? []) {
    addService(unitTypeForResponseService(requirement.service));
  }

  const relevant = serviceOrder.length
    ? units.filter((unit) => serviceOrder.includes(unit.type))
    : [...units];
  const candidates = relevant.length ? relevant : [...units];

  return candidates.sort((a, b) => {
    const byService = serviceOrder.indexOf(a.type) - serviceOrder.indexOf(b.type);
    if (byService !== 0) return byService;

    const availabilityRank = (unit: TacticalUnit) => {
      if (unit.assignedCallId === call.id) return 0;
      if (unit.status === 'available' && !unit.assignedCallId) return 1;
      return 2;
    };
    const byAvailability = availabilityRank(a) - availabilityRank(b);
    if (byAvailability !== 0) return byAvailability;

    if (leadService === 'ems' && call.severity === 'critical') {
      const alsRank = (unit: TacticalUnit) =>
        unit.type === 'ems' && (unit.capabilities ?? []).includes('als') ? 0 : 1;
      const byAls = alsRank(a) - alsRank(b);
      if (byAls !== 0) return byAls;
    }

    if (point) {
      const byEta =
        etaMinutes(a, haversineKm(a.lat, a.lng, point.lat, point.lng)) -
        etaMinutes(b, haversineKm(b.lat, b.lng, point.lat, point.lng));
      if (byEta !== 0) return byEta;
    }

    return a.id.localeCompare(b.id);
  });
}

/**
 * @description The nearest unit worth drawing a vector from: available (or
 *              already assigned to this call), preferring the requested
 *              service and falling back to any service rather than to nothing.
 *              Returns null only when no unit qualifies at all.
 */
export function nearestAvailableUnit(
  units: readonly TacticalUnit[],
  lat: number,
  lng: number,
  service?: TacticalUnit['type'] | null,
  forCallId?: string,
): TacticalUnit | null {
  const usable = units.filter(
    (unit) =>
      (unit.status === 'available' || (forCallId && unit.assignedCallId === forCallId)) &&
      (!unit.assignedCallId || unit.assignedCallId === forCallId),
  );
  const pool = service ? usable.filter((unit) => unit.type === service) : usable;
  const candidates = pool.length > 0 ? pool : usable;
  let best: TacticalUnit | null = null;
  let bestKm = Infinity;
  for (const unit of candidates) {
    const km = haversineKm(unit.lat, unit.lng, lat, lng);
    if (km < bestKm) {
      bestKm = km;
      best = unit;
    }
  }
  return best;
}
