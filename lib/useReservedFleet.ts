'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  applyUnitReservations,
  RESERVATIONS_CHANGED_EVENT,
} from './dispatch-reservations';
import type { TacticalUnit } from './units';

export function useReservedFleet(
  fleet: readonly TacticalUnit[],
  currentCallId: string,
): TacticalUnit[] {
  const [hydratedVersion, setHydratedVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setHydratedVersion((version) => version + 1);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'dispatch_unit_reservations') refresh();
    };

    refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener(RESERVATIONS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(RESERVATIONS_CHANGED_EVENT, refresh);
    };
  }, []);

  return useMemo(
    () =>
      hydratedVersion === 0
        ? fleet.map((unit) => ({ ...unit }))
        : applyUnitReservations(fleet, currentCallId),
    [currentCallId, fleet, hydratedVersion],
  );
}
