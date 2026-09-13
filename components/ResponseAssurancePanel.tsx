'use client';

import type { EmergencyCall } from '@/lib/types';
import { assessDispatch } from '@/lib/dispatch-assurance';
import { TACTICAL_UNITS, type TacticalUnit } from '@/lib/units';
import { useReservedFleet } from '@/lib/useReservedFleet';
import { Chip, type ChipTone } from '@/components/ui/panel';

const STATUS_LABEL = {
  on_target: 'ON TARGET',
  at_risk: 'AT RISK',
  no_coverage: 'NO COVERAGE',
  location_required: 'LOCATION REQUIRED',
  plan_required: 'PLAN REQUIRED',
} as const;

export function ResponseAssurancePanel({
  call,
  fleet = TACTICAL_UNITS,
  linkedPrimaryCallId,
}: {
  call: EmergencyCall;
  fleet?: readonly TacticalUnit[];
  linkedPrimaryCallId?: string | null;
}) {
  const operationalFleet = useReservedFleet(fleet, call.id);
  const assurance = assessDispatch(call, operationalFleet);
  const statusTone: ChipTone =
    assurance.status === 'on_target'
      ? 'safe'
      : assurance.status === 'at_risk'
        ? 'mild'
        : 'critical';

  if (linkedPrimaryCallId) {
    return (
      <div className="rounded-[6px] border border-accent bg-accent/5 p-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="accent">SHARED RESPONSE</Chip>
          <Chip tone="critical">Separate dispatch blocked</Chip>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-2">
          This caller is linked to primary incident{' '}
          <span className="tnum font-semibold">#{linkedPrimaryCallId}</span>. Units and response
          assurance are controlled from the primary incident to prevent duplicate dispatch.
        </p>
      </div>
    );
  }

  // A call with no dispatch plan yet renders nothing at all. This panel exists
  // to check a plan against the clock; with no plan there is nothing to check,
  // and the Dispatch section above already shows the standard response for the
  // incident type. Earlier versions printed a notice here saying assurance
  // could not be calculated - a paragraph whose whole content was its own
  // absence, on almost every call on the console.
  if (assurance.status === 'plan_required') return null;

  return (
    <div className="rounded-[6px] border border-rule bg-panel p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={statusTone}>{STATUS_LABEL[assurance.status]}</Chip>
        <Chip tone="accent">
          {assurance.priority_code} · {assurance.target_minutes} min target
        </Chip>
        {/* "Dispatch ready" is the unremarkable case and does not need a chip
            of its own; only a block is worth calling out. */}
        {!assurance.dispatch_ready && <Chip tone="critical">Dispatch blocked</Chip>}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-3">{assurance.reason}</p>

      {assurance.assignments.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {assurance.assignments.map((assignment) => (
            <div
              key={`${assignment.requested_service}-${assignment.unit_id}`}
              className="rounded-[4px] border border-rule bg-ground px-2 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">
                  {assignment.callsign}
                  <span className="tnum ml-1.5 text-2xs font-normal text-ink-4">
                    {assignment.unit_id}
                  </span>
                </span>
                <Chip tone={assignment.status === 'on_target' ? 'safe' : 'mild'}>
                  Est. arrival {assignment.eta_minutes} min
                </Chip>
              </div>
              <p className="mt-1 text-xs text-ink-3">
                {assignment.requested_service} · {assignment.distance_km.toFixed(1)} km ·{' '}
                {assignment.rationale}
              </p>
            </div>
          ))}
        </div>
      )}

      {assurance.uncovered_services.length > 0 && (
        <p className="mt-2 text-xs font-medium text-critical-bright">
          Mutual aid required: {assurance.uncovered_services.join(', ')}
        </p>
      )}
      <p className="mt-2 text-2xs text-ink-4">simulated travel model</p>
    </div>
  );
}
