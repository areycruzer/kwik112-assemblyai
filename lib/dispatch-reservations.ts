import type { TacticalUnit } from './units.ts';

const STORAGE_KEY = 'dispatch_unit_reservations';
const LOCK_KEY = 'dispatch-unit-reservations-write';
export const RESERVATIONS_CHANGED_EVENT = 'dispatch-reservations-changed';

export type UnitReservationMap = Record<string, string>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function readUnitReservations(): UnitReservationMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!isPlainObject(parsed)) return {};

    const reservations: UnitReservationMap = {};
    for (const [unitId, callId] of Object.entries(parsed)) {
      if (unitId.trim() !== '' && typeof callId === 'string' && callId.trim() !== '') {
        reservations[unitId] = callId;
      }
    }
    return reservations;
  } catch {
    return {};
  }
}

export function applyUnitReservations(
  fleet: readonly TacticalUnit[],
  currentCallId: string,
): TacticalUnit[] {
  const reservations = readUnitReservations();
  return fleet.map((unit) => {
    const assignedCallId = unit.assignedCallId ?? reservations[unit.id];
    if (!assignedCallId) return { ...unit };
    return {
      ...unit,
      assignedCallId,
      status: assignedCallId === currentCallId ? 'en-route' : 'busy',
    };
  });
}

function notifyReservationChange(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(RESERVATIONS_CHANGED_EVENT));
  }
}

function commitReservation(
  callId: string,
  unitIds: readonly string[],
): { ok: boolean; conflicts: string[] } {
  const reservations = readUnitReservations();
  const uniqueUnitIds = [...new Set(unitIds)];
  const conflicts = uniqueUnitIds.filter(
    (unitId) => reservations[unitId] && reservations[unitId] !== callId,
  );

  if (conflicts.length > 0) return { ok: false, conflicts };

  for (const unitId of uniqueUnitIds) reservations[unitId] = callId;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
      notifyReservationChange();
    } catch {
      return { ok: false, conflicts: uniqueUnitIds };
    }
  }
  return { ok: true, conflicts: [] };
}

export async function reserveUnits(
  callId: string,
  unitIds: readonly string[],
): Promise<{ ok: boolean; conflicts: string[] }> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(LOCK_KEY, { mode: 'exclusive' }, () =>
      commitReservation(callId, unitIds),
    );
  }
  return commitReservation(callId, unitIds);
}

function commitRelease(callId: string): void {
  if (typeof window === 'undefined') return;
  const reservations = readUnitReservations();
  for (const [unitId, ownerCallId] of Object.entries(reservations)) {
    if (ownerCallId === callId) delete reservations[unitId];
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
    notifyReservationChange();
  } catch {
    /* The persisted state remains unchanged when browser storage is unavailable. */
  }
}

function commitReleaseUnit(callId: string, unitId: string): void {
  if (typeof window === 'undefined') return;
  const reservations = readUnitReservations();
  // Only the owning call may stand a unit down. Without the ownership check a
  // second dispatcher could recall an appliance already rolling on someone
  // else's incident.
  if (reservations[unitId] !== callId) return;
  delete reservations[unitId];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
    notifyReservationChange();
  } catch {
    /* The persisted state remains unchanged when browser storage is unavailable. */
  }
}

/**
 * @description Stand one unit down from a call, leaving the call's other units
 *              assigned. `releaseUnits` clears the whole incident; recalling a
 *              single appliance needed its own door.
 */
export async function releaseUnit(callId: string, unitId: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request(LOCK_KEY, { mode: 'exclusive' }, () =>
      commitReleaseUnit(callId, unitId),
    );
    return;
  }
  commitReleaseUnit(callId, unitId);
}

export async function releaseUnits(callId: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request(LOCK_KEY, { mode: 'exclusive' }, () =>
      commitRelease(callId),
    );
    return;
  }
  commitRelease(callId);
}
