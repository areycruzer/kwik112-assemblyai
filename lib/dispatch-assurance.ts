import type { DispatchPlan, EmergencyCall, PriorityCode } from './types.ts';
import { haversineKm, type TacticalUnit } from './units.ts';

export type DispatchAssuranceStatus =
  | 'on_target'
  | 'at_risk'
  | 'no_coverage'
  | 'location_required'
  | 'plan_required';

type RequestedService = DispatchPlan['units'][number]['service'];

export interface DispatchAssignment {
  requested_service: RequestedService;
  unit_id: string;
  callsign: string;
  distance_km: number;
  eta_minutes: number;
  target_minutes: number;
  status: 'on_target' | 'at_risk';
  rationale: string;
}

export interface DispatchAssurance {
  status: DispatchAssuranceStatus;
  priority_code: PriorityCode;
  target_minutes: number;
  dispatch_ready: boolean;
  operator_confirmation_required: boolean;
  assignments: DispatchAssignment[];
  uncovered_services: RequestedService[];
  reason: string;
}

const RESPONSE_TARGET_MINUTES: Record<string, number> = {
  P1: 8,
  'Code 3': 8,
  P2: 15,
  'Code 2': 15,
  P3: 30,
  'Code 1': 30,
  P4: 45,
};

const AVERAGE_RESPONSE_SPEED_KMH: Record<TacticalUnit['type'], number> = {
  police: 38,
  fire: 32,
  ems: 35,
};

function unitTypeFor(service: RequestedService): TacticalUnit['type'] | null {
  if (service === 'ems' || service === 'fire' || service === 'police') return service;
  // Technical rescue is normally delivered by the fire-and-rescue fleet. A
  // separate physical unit is still required because assigned ids are removed
  // from subsequent candidate pools.
  if (service === 'rescue') return 'fire';
  return null;
}

function requiredCapability(requirement: DispatchPlan['units'][number]): NonNullable<TacticalUnit['capabilities']>[number] | null {
  if (requirement.service === 'rescue') return 'rescue';
  if (
    requirement.service === 'ems' &&
    /advanced life support|\bals\b/i.test(requirement.unit)
  ) {
    return 'als';
  }
  return unitTypeFor(requirement.service);
}

function estimateEtaMinutes(distanceKm: number, type: TacticalUnit['type']): number {
  const roadAdjustedKm = distanceKm * 1.25;
  const travelMinutes = (roadAdjustedKm / AVERAGE_RESPONSE_SPEED_KMH[type]) * 60;
  return Math.max(2, Math.ceil(1.5 + travelMinutes));
}

/**
 * @description The priority this call is held to, on the P-scale.
 *
 *              Must agree with `priorityCode()` in lib/incident.ts, which is
 *              what every other view shows. It cannot import it — this module
 *              stays dependency-light so `node --test` can load it bare — so
 *              the derivation is repeated here and pinned by a test that a
 *              critical call gets the P1 target.
 *
 *              The bug this replaces: an unqualified `?? 'P3'` fallback. Almost
 *              no stored call carries an explicit `priority_code`, so a P1
 *              cardiac arrest — shown as P1 everywhere else on the console —
 *              was silently assured against P3's 30-minute target instead of
 *              P1's 8. Response assurance exists to catch a late response; it
 *              was measuring against the wrong clock for nearly every call.
 */
function effectivePriority(call: EmergencyCall): PriorityCode {
  const stored = call.dispatch_plan?.priority_code ?? call.priority_code;
  if (stored) {
    // Legacy "Code N" grades map onto the P-scale; see LEGACY_PRIORITY_CODES
    // in lib/incident.ts, which normalises the same pairs for display.
    if (stored === 'Code 3') return 'P1';
    if (stored === 'Code 2') return 'P2';
    if (stored === 'Code 1') return 'P3';
    return stored;
  }
  if (call.severity === 'critical') return 'P1';
  if (call.severity === 'high') return 'P2';
  return 'P3';
}

export function assessDispatch(
  call: EmergencyCall,
  fleet: readonly TacticalUnit[],
): DispatchAssurance {
  const priorityCode = effectivePriority(call);
  const targetMinutes = RESPONSE_TARGET_MINUTES[priorityCode] ?? 30;
  const location = call.caller_location;
  const base = {
    priority_code: priorityCode,
    target_minutes: targetMinutes,
    operator_confirmation_required:
      call.dispatch_plan?.operator_confirmation_required ?? true,
  };

  if (
    typeof location?.latitude !== 'number' ||
    !Number.isFinite(location.latitude) ||
    location.latitude < -90 ||
    location.latitude > 90 ||
    typeof location.longitude !== 'number' ||
    !Number.isFinite(location.longitude) ||
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    return {
      ...base,
      status: 'location_required',
      dispatch_ready: false,
      assignments: [],
      uncovered_services: [],
      reason: 'Incident coordinates are required before a field unit can be assigned safely.',
    };
  }

  const locationConfidence = location.confidence ?? call.location_confidence;
  if (typeof locationConfidence === 'number' && locationConfidence < 0.5) {
    return {
      ...base,
      status: 'location_required',
      dispatch_ready: false,
      assignments: [],
      uncovered_services: [],
      reason: 'Operator must verify the incident location before dispatch because confidence is below 50%.',
    };
  }

  const requested = call.dispatch_plan?.units ?? [];
  if (requested.length === 0) {
    return {
      ...base,
      status: 'plan_required',
      dispatch_ready: false,
      assignments: [],
      uncovered_services: [],
      reason: 'A service-level dispatch plan is required before response assurance can be calculated.',
    };
  }

  const indexedAssignments: Array<{ index: number; assignment: DispatchAssignment }> = [];
  const uncoveredServices: RequestedService[] = [];
  const assignedUnitIds = new Set<string>();

  const orderedRequirements = requested
    .map((requirement, index) => {
      const unitType = unitTypeFor(requirement.service);
      const capability = requiredCapability(requirement);
      const candidates = unitType
        ? fleet
            .filter(
              (unit) =>
                unit.type === unitType &&
                (unit.status === 'available' || unit.assignedCallId === call.id) &&
                (!unit.assignedCallId || unit.assignedCallId === call.id) &&
                (unit.capabilities ?? [unit.type]).includes(capability ?? unit.type),
            )
            .map((unit) => ({
              unit,
              distanceKm: haversineKm(
                unit.lat,
                unit.lng,
                location.latitude as number,
                location.longitude as number,
              ),
            }))
            .sort(
              (a, b) =>
                a.distanceKm - b.distanceKm || a.unit.id.localeCompare(b.unit.id),
            )
        : [];
      return { requirement, index, candidates };
    })
    // Allocate scarce capabilities first. This prevents a flexible ladder/ALS
    // unit from being consumed by a generic request that another unit can fill.
    .sort(
      (a, b) => a.candidates.length - b.candidates.length || a.index - b.index,
    );

  for (const { requirement, index, candidates } of orderedRequirements) {
    const nearest = candidates.find(({ unit }) => !assignedUnitIds.has(unit.id));
    if (!nearest) {
      if (!uncoveredServices.includes(requirement.service)) {
        uncoveredServices.push(requirement.service);
      }
      continue;
    }

    assignedUnitIds.add(nearest.unit.id);
    const distanceKm = Number(nearest.distanceKm.toFixed(1));
    const etaMinutes = estimateEtaMinutes(nearest.distanceKm, nearest.unit.type);
    indexedAssignments.push({
      index,
      assignment: {
        requested_service: requirement.service,
        unit_id: nearest.unit.id,
        callsign: nearest.unit.callsign,
        distance_km: distanceKm,
        eta_minutes: etaMinutes,
        target_minutes: targetMinutes,
        status: etaMinutes <= targetMinutes ? 'on_target' : 'at_risk',
        rationale: `${nearest.unit.callsign} is the nearest available ${requirement.service} unit (${distanceKm.toFixed(1)} km).`,
      },
    });
  }

  const assignments = indexedAssignments
    .sort((a, b) => a.index - b.index)
    .map(({ assignment }) => assignment);

  if (uncoveredServices.length > 0) {
    return {
      ...base,
      status: 'no_coverage',
      dispatch_ready: false,
      assignments,
      uncovered_services: uncoveredServices,
      reason: `No available unit covers: ${uncoveredServices.join(', ')}. Escalate for mutual aid.`,
    };
  }

  const atRisk = assignments.some((assignment) => assignment.status === 'at_risk');
  return {
    ...base,
    status: atRisk ? 'at_risk' : 'on_target',
    dispatch_ready: assignments.length > 0,
    assignments,
    uncovered_services: [],
    reason: atRisk
      ? `At least one recommended unit exceeds the ${targetMinutes}-minute response target.`
      : `All recommended units are projected within the ${targetMinutes}-minute response target.`,
  };
}
