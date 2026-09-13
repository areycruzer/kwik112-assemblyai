'use client';

import { Symbol } from '@/components/ui/symbol';
import { Chip, type ChipTone } from '@/components/ui/panel';
import { cn } from '@/lib/utils';
import {
  etaLabel,
  haversineKm,
  responseUnitsForIncident,
  type TacticalUnit,
} from '@/lib/units';
import type { EmergencyCall } from '@/lib/types';
import { unitRosterAccessibleLabel } from '@/lib/dashboard-presentation';

interface UnitRosterProps {
  units: TacticalUnit[];
  selectedCall: EmergencyCall | null;
  selectedUnitId: string | null;
  onSelectUnit: (unitId: string) => void;
}

const STATUS_META: Record<TacticalUnit['status'], { tone: ChipTone; label: string }> = {
  available: { tone: 'safe', label: 'Ready' },
  'en-route': { tone: 'accent', label: 'En route' },
  'on-scene': { tone: 'mild', label: 'On scene' },
  busy: { tone: 'mild', label: 'Busy' },
};

function incidentPoint(call: EmergencyCall | null): { lat: number; lng: number } | null {
  const location = call?.caller_location;
  if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
    return null;
  }
  return { lat: location.latitude, lng: location.longitude };
}

/**
 * Distance from a unit to the selected incident, or null when no incident is
 * selected. Null is a real state — there is nothing to measure to — and the row
 * renders it as an em-dash rather than as a zero.
 */
function distanceToIncident(
  unit: TacticalUnit,
  point: { lat: number; lng: number } | null,
): number | null {
  if (!point) return null;
  return haversineKm(unit.lat, unit.lng, point.lat, point.lng);
}

export function UnitRoster({
  units,
  selectedCall,
  selectedUnitId,
  onSelectUnit,
}: UnitRosterProps) {
  const point = incidentPoint(selectedCall);

  /**
   * Show only services requested by this incident. The lead service comes
   * first, then requested support, with dispatchable units ordered by ETA.
   */
  const ordered = responseUnitsForIncident(units, selectedCall, point);

  return (
    <ul className="flex flex-col gap-1.5">
      {ordered.map((unit) => {
        const status = STATUS_META[unit.status];
        const selected = unit.id === selectedUnitId;
        // Distance, current speed and projected arrival are shown together: the
        // nearest unit is not the fastest one when a further unit is already
        // rolling, so a dispatcher needs all three to pick correctly.
        const distanceKm = distanceToIncident(unit, point);
        const distance = distanceKm === null ? '—' : `${distanceKm.toFixed(1)} km`;
        const eta = etaLabel(unit, distanceKm);
        return (
          <li key={unit.id}>
            <button
              type="button"
              onClick={() => onSelectUnit(unit.id)}
              aria-pressed={selected}
              aria-label={unitRosterAccessibleLabel(
                unit,
                distance,
                distanceKm === null ? undefined : eta,
              )}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-[6px] border px-2.5 py-2 text-left transition-colors',
                selected
                  ? 'border-accent bg-accent/10'
                  : 'border-rule bg-panel hover:border-rule-strong',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Symbol
                  spec={{ kind: 'unit', glyph: unit.type, service: unit.type, size: 24 }}
                  className="shrink-0"
                />
                <span className="min-w-0 leading-tight">
                  {/* The appliance's own name, wrapped rather than truncated:
                      "Hydraulic Platform 206" clipped to "Hydraulic Platform …"
                      loses the only part that identifies the vehicle. */}
                  <span className={cn('block text-sm font-semibold', selected ? 'text-accent' : 'text-ink')}>
                    {unit.callsign}
                  </span>
                  {/* The owning service, spelled out. This is the line that makes
                      the roster legible as an Indian one — "Delhi Fire Service",
                      not "FIRE" — and it costs nothing an operator needed. It
                      wraps rather than truncates: clipped, it dropped the unit id
                      that cross-references the map label. */}
                  <span className="mt-0.5 block text-2xs text-ink-4">
                    {unit.agency} · {unit.id}
                    {unit.assignedCallId ? ` · Assigned ${unit.assignedCallId}` : ''}
                  </span>
                </span>
              </span>

              <span className="flex shrink-0 flex-col items-end gap-1">
                <Chip tone={status.tone} dot>{status.label}</Chip>
                {/* ETA leads: it is the figure the dispatch decision turns on.
                    Distance and current speed sit under it as the workings. */}
                <span className="tnum text-xs font-semibold text-ink-2">
                  <span className="font-normal text-ink-4">ETA </span>
                  {eta}
                </span>
                <span className="tnum text-2xs text-ink-4">
                  {distance} · {unit.speed}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
