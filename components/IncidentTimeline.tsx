/**
 * IncidentTimeline — the per-incident human-in-the-loop decision timeline.
 *
 * Replaces the old workflow overlay, which had two real defects that must not
 * survive:
 *   1. It hardcoded four fire/EMS recommendations regardless of the open
 *      incident, so a water-main rupture was told to "Deploy Priority 1 Fire &
 *      EMS Units". Here every proposal is derived from the OPEN call.
 *   2. Its state never reset between incidents, so approvals leaked from A to B.
 *      Here state loads via `readTimeline(call.id)` in an effect keyed on the
 *      call id, so opening a different incident resets the view.
 *
 * Roster selections are proposals. Only a human DISPATCH confirmation reserves
 * those same units and persists their receipt; RESOLUTION returns them to fleet.
 *
 * The three decision points (INTAKE → DISPATCH → RESOLUTION) come from
 * `lib/timeline.ts`; this component renders them and records operator decisions
 * through `recordDecision`/`writeTimeline`. An override REQUIRES a note — the
 * submit is disabled with a clear message until one is entered, so the operator
 * never reaches the throw `recordDecision` raises for a note-less override.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HTMLAttributes } from 'react';
import { EmergencyCall } from '@/lib/types';
import { Chip, type ChipTone } from '@/components/ui/panel';
import { Symbol } from '@/components/ui/symbol';
import { glyphForIncidentType, type IncidentGlyph } from '@/lib/design/symbols';
import { recommendedUnits, standardResponseUnits } from '@/lib/incident';
import { assessDispatch } from '@/lib/dispatch-assurance';
import { linkedPrimaryFor, readFusionDecisions } from '@/lib/incident-fusion';
import { TACTICAL_UNITS, etaLabel, haversineKm, type TacticalUnit } from '@/lib/units';
import { readUnitReservations, releaseUnits, reserveUnits } from '@/lib/dispatch-reservations';
import { useReservedFleet } from '@/lib/useReservedFleet';
import { useDialogFocus } from '@/lib/useDialogFocus';
import {
  DECISION_POINTS,
  type DecisionPoint,
  type DecisionRecord,
  type DecisionProposalSnapshot,
  type TimelineState,
  readTimeline,
  writeTimeline,
  recordDecision,
  currentPoint,
  isComplete,
  emptyTimeline,
} from '@/lib/timeline';
import { X, Check, Pencil, AlertTriangle } from 'lucide-react';

interface IncidentTimelineProps {
  open: boolean;
  onClose: () => void;
  call: EmergencyCall | null;
  linkedPrimaryCallId?: string | null;
  selectedUnitId?: string;
}

type DecisionAction = 'confirmed' | 'amended' | 'overridden';

type Proposal = DecisionProposalSnapshot;

const POINT_LABELS: Record<DecisionPoint, string> = {
  INTAKE: 'Intake',
  DISPATCH: 'Dispatch',
  RESOLUTION: 'Resolution',
};

const POINT_CAPTIONS: Record<DecisionPoint, string> = {
  INTAKE: 'Classification & severity grade',
  DISPATCH: 'Recommended responding units',
  RESOLUTION: 'Close-out & remaining threats',
};

const ACTION_TONE: Record<DecisionAction, ChipTone> = {
  confirmed: 'safe',
  amended: 'mild',
  overridden: 'critical',
};

const ACTION_LABEL: Record<DecisionAction, string> = {
  confirmed: 'Confirmed',
  amended: 'Amended',
  overridden: 'Overridden',
};

/**
 * Build each decision point's proposal from the OPEN call. Nothing here is
 * hardcoded to a service: a utility incident yields its own summary, units, and
 * threats, never fire/EMS boilerplate.
 */
/** Projected arrival for a unit against this call, or an em-dash with no fix. */
function etaForCall(unit: TacticalUnit, call: EmergencyCall): string {
  const point = call.caller_location;
  if (typeof point?.latitude !== 'number' || typeof point?.longitude !== 'number') return '—';
  return etaLabel(unit, haversineKm(unit.lat, unit.lng, point.latitude, point.longitude));
}

function proposalFor(
  point: DecisionPoint,
  call: EmergencyCall,
  fleet: readonly TacticalUnit[] = TACTICAL_UNITS,
  linkedPrimaryCallId?: string | null,
  selectedUnitIds?: readonly string[],
): Proposal {
  const summary =
    call.ai_summary || call.chief_complaint || 'No AI summary captured for this incident.';

  switch (point) {
    case 'INTAKE': {
      const subtype = call.incident_subtype || call.incident_type || 'Unclassified incident';
      const severity = call.severity ? call.severity.toUpperCase() : 'UNGRADED';
      return {
        heading: `Classify as ${subtype} · ${severity}`,
        body: summary,
        items: [],
      };
    }
    case 'DISPATCH': {
      if (linkedPrimaryCallId) {
        return {
          heading: `Use shared response from #${linkedPrimaryCallId}`,
          body: 'Operator-linked duplicate call. Separate unit dispatch is blocked to prevent double allocation.',
          items: [`Primary incident #${linkedPrimaryCallId}`],
        };
      }
      if (selectedUnitIds?.length) {
        return {
          heading: `Confirm dispatch of ${selectedUnitIds.length} selected unit${selectedUnitIds.length === 1 ? '' : 's'}`,
          body: 'Units remain proposals until you confirm this DISPATCH checkpoint.',
          items: selectedUnitIds.map((id) => {
            const unit = fleet.find((candidate) => candidate.id === id);
            return unit ? `${unit.callsign} (${unit.id}) · ETA ${etaForCall(unit, call)}` : `${id} · unavailable`;
          }),
        };
      }

      const assurance = assessDispatch(call, fleet);
      const units = assurance.assignments.map(
        (assignment) =>
          `${assignment.callsign} (${assignment.unit_id}) · ETA ${assignment.eta_minutes} min · ${assignment.status === 'on_target' ? 'ON TARGET' : 'AT RISK'}`,
      );

      if (units.length > 0) {
        return {
          heading:
            assurance.status === 'no_coverage'
              ? 'Escalate uncovered services before dispatch'
              : assurance.status === 'at_risk'
                ? 'Response target at risk · dispatch or escalate now'
                : `Dispatch within configured ${assurance.target_minutes}-minute target`,
          body: assurance.reason,
          items: units,
        };
      }

      // A missing location is a real precondition and stays a precondition.
      if (assurance.status === 'location_required') {
        return {
          heading: 'Verify location before dispatch',
          body: assurance.reason,
          items: [],
        };
      }

      // Everything else used to surface as "Create a service-level dispatch
      // plan" with the assurance module's own error as the body — a missing
      // precondition wearing an AI PROPOSAL heading, on every call that had no
      // stored plan, which is nearly all of them. A building collapse with
      // families trapped deserves a proposal, so propose the response a control
      // room sends to this kind of incident and let the operator pick the
      // appliances.
      const onFile = recommendedUnits(call);
      const standard = onFile.length > 0 ? onFile : standardResponseUnits(call);
      return {
        heading: standard.length > 0
          ? 'Assign the standard response for this incident type'
          : 'No unit recommendation on file',
        body: standard.length > 0
          ? 'No units are assigned yet. This is what a control room sends to this kind of incident — assign the appliances in the response roster, then confirm.'
          : 'No unit recommendation was produced for this incident. Dispatch on operator judgment, then record the decision.',
        items: standard,
      };
    }
    case 'RESOLUTION': {
      // A close-out check, not a re-read of the intake narrative. This used to
      // repeat `summary` verbatim, so the same paragraph appeared twice on one
      // screen and the step said nothing about what resolving actually does.
      const threats = call.immediate_threats ?? [];
      const stillCommitted = fleet.filter((unit) => unit.assignedCallId === call.id);
      return {
        heading: threats.length
          ? 'Resolve once these threats are cleared'
          : 'Resolve and close the incident',
        body:
          'Closing returns this incident\u2019s units to the fleet and completes its decision record. ' +
          (threats.length
            ? 'Confirm each threat below is cleared first.'
            : 'No outstanding threats were recorded on this incident.'),
        items: [
          ...threats.map((threat) => `Threat cleared: ${threat}`),
          ...stillCommitted.map((unit) => `Release ${unit.callsign} (${unit.id})`),
        ],
      };
    }
  }
}

export default function IncidentTimeline({
  open,
  onClose,
  call,
  linkedPrimaryCallId,
  selectedUnitId,
}: IncidentTimelineProps) {
  const callId = call?.id ?? null;

  const [timeline, setTimeline] = useState<TimelineState>(() => emptyTimeline(callId ?? ''));
  const [action, setAction] = useState<DecisionAction>('confirmed');
  const [note, setNote] = useState('');
  const [reservationError, setReservationError] = useState('');
  const submitting = useRef(false);

  // Initial focus, Tab trap, Escape-to-close, and focus restore — from the one
  // shared hook the voice station also uses, so the two dialogs cannot diverge.
  const { dialogRef, onKeyDown } = useDialogFocus(open, onClose);

  /**
   * Load this incident's timeline whenever the OPEN call changes. Keying on the
   * call id is what resets the view between incidents: opening B after deciding
   * on A shows B's own (empty) timeline, never A's leaked approvals.
   */
  useEffect(() => {
    if (!open || !callId) return;
    setTimeline(readTimeline(callId));
    setAction('confirmed');
    setNote('');
    setReservationError('');
    setAmendedSelection(null);
    const sync = (event: StorageEvent) => {
      if (event.key === null || event.key === 'dispatch_timeline') {
        setTimeline(readTimeline(callId));
        setAction('confirmed');
        setNote('');
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [callId, open]);

  const [amendedSelection, setAmendedSelection] = useState<string | null>(null);
  const dispatchAmendment = Boolean(selectedUnitId && selectedUnitId !== amendedSelection &&
    timeline.records.some((record) => record.point === 'DISPATCH') &&
    !timeline.records.some((record) => record.point === 'RESOLUTION') &&
    !['resolved', 'completed', 'closed'].includes(call?.status ?? ''));
  const pending = dispatchAmendment ? 'DISPATCH' : currentPoint(timeline);
  const complete = useMemo(() => isComplete(timeline), [timeline]);
  const decidedByPoint = useMemo(() => {
    const map = new Map<DecisionPoint, DecisionRecord>();
    for (const r of timeline.records) map.set(r.point, r);
    return map;
  }, [timeline]);

  const overrideMissingNote = action === 'overridden' && note.trim() === '';
  const operationalFleet = useReservedFleet(TACTICAL_UNITS, call?.id ?? '');
  const dispatchUnitIds = useMemo(() => {
    if (!call) return [];
    const assigned = operationalFleet.filter((unit) => unit.assignedCallId === call.id).map((unit) => unit.id);
    if (selectedUnitId) {
      const suggested = assessDispatch(call, operationalFleet).assignments.map((assignment) => assignment.unit_id);
      let proposed = [...new Set([...assigned, selectedUnitId, ...suggested])];
      // Keep the explicit selection and existing commitments. Remove a default
      // choice only when the existing capability rules confirm full coverage.
      for (const id of suggested) {
        if (id === selectedUnitId || assigned.includes(id)) continue;
        const remaining = proposed.filter((candidate) => candidate !== id);
        const coverage = assessDispatch(call, operationalFleet.filter((unit) => remaining.includes(unit.id)));
        if (coverage.status === 'on_target' || coverage.status === 'at_risk') proposed = remaining;
      }
      return proposed;
    }
    if (assigned.length) return assigned;
    return assessDispatch(call, operationalFleet).assignments.map((assignment) => assignment.unit_id);
  }, [call, operationalFleet, selectedUnitId]);
  const dispatchAssurance = useMemo(
    () => call ? assessDispatch(call, operationalFleet.filter((unit) => dispatchUnitIds.includes(unit.id))) : null,
    [call, operationalFleet, dispatchUnitIds],
  );

  const duplicateDispatchBlocked = pending === 'DISPATCH' && Boolean(linkedPrimaryCallId);

  /**
   * What stops a dispatch being confirmed. `dispatch_ready === false` used to
   * cover this, but it is false whenever the call carries no stored plan —
   * which is nearly every call — so the step was unconfirmable by default and
   * an operator could only ever get past it by overriding. Overriding is for
   * departing from the recommendation, not for routine work.
   *
   * What actually blocks a dispatch is: no units chosen, no location to send
   * them to, or a service nobody can cover.
   */
  const dispatchBlockReason = (() => {
    if (pending !== 'DISPATCH') return null;
    if (dispatchAssurance?.status === 'location_required') {
      return 'Verify the incident location before dispatch, or choose Override and document why.';
    }
    if (dispatchUnitIds.some((id) => !operationalFleet.some((unit) => unit.id === id && (unit.status === 'available' || unit.assignedCallId === call?.id)))) {
      return 'A selected unit is unavailable. Select another unit or document an override.';
    }
    if (dispatchUnitIds.length === 0) {
      return 'Assign units in the response roster before confirming dispatch, or choose Override and document why.';
    }
    if (dispatchAssurance?.status === 'no_coverage') {
      return 'A requested service has no available unit. Escalate for mutual aid, or choose Override and document why.';
    }
    return null;
  })();

  const blockedConfirmation =
    duplicateDispatchBlocked || (Boolean(dispatchBlockReason) && action !== 'overridden');

  const submit = useCallback(async () => {
    if (!pending || !call || blockedConfirmation || submitting.current) return;
    submitting.current = true;
    try {
      const commit = async () => {
        const latest = readTimeline(call.id);
        if (JSON.stringify(latest) !== JSON.stringify(timeline) || (!dispatchAmendment && currentPoint(latest) !== pending)) {
          setTimeline(latest);
          setReservationError('This checkpoint changed in another console. Review the current decision before continuing.');
          return;
        }
        if (action === 'overridden' && !note.trim()) return;
        if (pending === 'DISPATCH' && linkedPrimaryFor(call.id, readFusionDecisions())) {
          setReservationError('This call is now linked to a primary incident. Separate dispatch is blocked.');
          return;
        }
        const beforeUnits = Object.entries(readUnitReservations()).filter(([, owner]) => owner === call.id).map(([id]) => id);
        const beforeRaw = localStorage.getItem('kwik_emergency_calls');
        const beforeCalls: EmergencyCall[] = beforeRaw ? JSON.parse(beforeRaw) : [];
        const beforeCall = Array.isArray(beforeCalls) ? beforeCalls.find((entry) => entry.id === call.id) : undefined;
        let callWritten = false;
        try {
          const trimmed = note.trim();
          const proposal = proposalFor(pending, call, operationalFleet, linkedPrimaryCallId, dispatchUnitIds);

          if (pending === 'DISPATCH' && action !== 'overridden') {
            const reservation = await reserveUnits(call.id, dispatchUnitIds);
            if (!reservation.ok) {
              setReservationError(
                `Unit reservation changed. Recheck: ${reservation.conflicts.join(', ')}.`,
              );
              return;
            }
          }

          if (pending === 'RESOLUTION' && action !== 'overridden') {
            await releaseUnits(call.id);
            if (Object.values(readUnitReservations()).includes(call.id)) throw new Error('Unit release failed');
          }

          let record: DecisionRecord;
          if (action === 'overridden') {
            // Guarded by the disabled submit, but never build the record without a
            // note: `recordDecision` throws otherwise.
            if (trimmed === '') return;
            record = { point: pending, action: 'overridden', at: new Date().toISOString(), note: trimmed, proposal };
          } else {
            record = {
              point: pending,
              action: dispatchAmendment ? 'amended' : action,
              at: new Date().toISOString(),
              ...(dispatchAmendment ? { note: [latest.records.find((entry) => entry.point === 'DISPATCH')?.note, `Dispatch amendment: previously ${latest.records.find((entry) => entry.point === 'DISPATCH')?.proposal?.items.join('; ') || 'no recorded units'}; now ${proposal.items.join('; ')}.`, trimmed].filter(Boolean).join(' ') } : trimmed ? { note: trimmed } : {}),
              proposal,
            };
          }
          const next = recordDecision(latest, record);
          writeTimeline(next);
          if (JSON.stringify(readTimeline(call.id)) !== JSON.stringify(next)) throw new Error('Timeline write failed');
          if (action !== 'overridden' && (pending === 'DISPATCH' || pending === 'RESOLUTION')) {
            const raw = localStorage.getItem('kwik_emergency_calls');
            const parsed = raw ? JSON.parse(raw) : [];
            const stored: EmergencyCall[] = Array.isArray(parsed) ? parsed : [];
            const existing = stored.find((entry) => entry.id === call.id) ?? call;
            const at = record.at;
            const updated: EmergencyCall = {
              ...existing,
              status: pending === 'DISPATCH' ? 'dispatched' : 'resolved',
              updated_at: at,
              ...(pending === 'DISPATCH' ? { dispatch_time: at } : { resolved_at: at }),
            };
            localStorage.setItem('kwik_emergency_calls', JSON.stringify([updated, ...stored.filter((entry) => entry.id !== call.id)]));
            callWritten = true;
            window.dispatchEvent(new CustomEvent('kwik-call-updated', { detail: { call: updated, isUpdate: true } }));
          }
          setTimeline(next);
          if (pending === 'DISPATCH') setAmendedSelection(selectedUnitId ?? null);
          setAction('confirmed');
          setNote('');
          setReservationError('');
        } catch {
          // Restore only this incident's entries; unrelated callers and unit
          // reservations may have changed while the browser lock was awaited.
          writeTimeline(latest);
          await releaseUnits(call.id);
          const restored = await reserveUnits(call.id, beforeUnits);
          let callRestored = !callWritten;
          if (callWritten) {
            try {
              const current: EmergencyCall[] = JSON.parse(localStorage.getItem('kwik_emergency_calls') ?? '[]');
              const others = current.filter((entry) => entry.id !== call.id);
              localStorage.setItem('kwik_emergency_calls', JSON.stringify(beforeCall ? [beforeCall, ...others] : others));
              callRestored = true;
            } catch { /* The error below explicitly requires reconciliation. */ }
          }
          const restoredIds = Object.entries(readUnitReservations()).filter(([, owner]) => owner === call.id).map(([id]) => id).sort();
          const rollbackOk = restored.ok && callRestored && JSON.stringify(restoredIds) === JSON.stringify([...beforeUnits].sort()) && JSON.stringify(readTimeline(call.id)) === JSON.stringify(latest);
          setTimeline(readTimeline(call.id));
          setReservationError(rollbackOk
            ? 'Could not persist this decision. Previous checkpoint and fleet state restored; retry when storage is available.'
            : 'Storage failed and the previous state could not be fully restored. Reconcile this incident’s timeline, status, and fleet before another dispatch.');
        }

      };
      if (typeof navigator !== 'undefined' && navigator.locks) {
        await navigator.locks.request(`dispatch-timeline-${call.id}`, { mode: 'exclusive' }, commit);
      } else {
        await commit();
      }
    } catch {
      setReservationError('Could not persist the decision. Reopen the workflow and verify the stored record before retrying.');
    } finally {
      submitting.current = false;
    }
  }, [action, blockedConfirmation, call, dispatchUnitIds, dispatchAmendment, linkedPrimaryCallId, note, operationalFleet, pending, selectedUnitId, timeline]);

  if (!open || !call) return null;

  const glyph: IncidentGlyph = glyphForIncidentType(call.incident_type);
  const subtype = call.incident_subtype || call.incident_type || 'Unclassified incident';
  const titleId = 'incident-timeline-title';

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-deep/80 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-rule-strong bg-panel text-ink outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <Symbol
              spec={{ kind: 'incident', glyph, severity: call.severity, size: 28 }}
              className="mt-0.5 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="label">Decision timeline</span>
                <span className="tnum text-2xs text-ink-4">#{call.id}</span>
              </div>
              <h2 id={titleId} className="truncate text-md font-semibold capitalize text-ink">
                {subtype}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close decision timeline"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-rule-strong bg-panel-raised text-ink-3 transition-colors hover:border-accent hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Progress summary */}
        <div className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2">
          <span className="text-xs text-ink-3">
            {complete
              ? 'All decision points recorded.'
              : dispatchAmendment ? 'Awaiting: Dispatch amendment — review the revised unit set' : `Awaiting: ${POINT_LABELS[pending as DecisionPoint]}`}
          </span>
          <span className="tnum text-2xs uppercase tracking-wide text-ink-4">
            {timeline.records.length} / {DECISION_POINTS.length} decided
          </span>
        </div>

        {/* Decision points */}
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {DECISION_POINTS.map((point) => {
            const record = dispatchAmendment && point === 'DISPATCH' ? undefined : decidedByPoint.get(point);
            const proposal = record?.proposal ?? proposalFor(point, call, operationalFleet, linkedPrimaryCallId, dispatchUnitIds);
            const isCurrent = point === pending;
            const isDecided = Boolean(record);
            const isUpcoming = !isDecided && !isCurrent;

            return (
              <DecisionStepRow
                key={point}
                aria-labelledby={`tl-${point}`}
                className={
                  'rounded-[6px] border p-2.5 ' +
                  (isCurrent
                    ? 'border-accent bg-panel-raised'
                    : isUpcoming
                    ? 'border-rule bg-panel opacity-60'
                    : 'border-rule bg-panel')
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span id={`tl-${point}`} className="text-sm font-semibold text-ink">
                      {POINT_LABELS[point]}
                    </span>
                    <span className="text-2xs text-ink-4">{POINT_CAPTIONS[point]}</span>
                  </div>
                  {isDecided && record ? (
                    <Chip tone={ACTION_TONE[record.action]} dot>
                      {ACTION_LABEL[record.action]}
                    </Chip>
                  ) : isUpcoming ? (
                    <span className="text-2xs uppercase tracking-wide text-ink-4">
                      Pending
                    </span>
                  ) : (
                    <Chip tone="accent">Awaiting decision</Chip>
                  )}
                </div>

                {/* Recommendation — derived from this call */}
                {!isUpcoming && (
                <div className="mt-2 rounded-[4px] bg-deep/35 p-2">
                  <p className="label mb-1">Recommendation</p>
                  <p className="text-sm font-medium text-ink">{proposal.heading}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{proposal.body}</p>
                  {proposal.items.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {proposal.items.map((item) => (
                        <Chip
                          key={item}
                          tone={point === 'RESOLUTION' ? 'critical' : 'accent'}
                        >
                          {item}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
                )}

                {/* Recorded decision detail */}
                {isDecided && record?.note && (
                  <p className="mt-2 text-xs text-ink-3">
                    <span className="label">Note</span> {record.note}
                  </p>
                )}

                {/* Operator controls, only for the current point */}
                {isCurrent && (
                  <div className="mt-3 space-y-2 border-t border-rule pt-3">
                    <div className="flex flex-wrap gap-2">
                      {(['confirmed', 'amended', 'overridden'] as DecisionAction[]).map((a) => {
                        const Icon =
                          a === 'confirmed' ? Check : a === 'amended' ? Pencil : AlertTriangle;
                        const selected = action === a;
                        return (
                          <button
                            key={a}
                            type="button"
                            onClick={() => setAction(a)}
                            aria-pressed={selected}
                            className={
                              'flex items-center gap-1.5 rounded-[4px] border px-2.5 py-1.5 text-xs font-medium transition-colors ' +
                              (selected
                                ? 'border-accent bg-accent/15 text-accent'
                                : 'border-rule-strong bg-panel text-ink-2 hover:border-accent hover:text-ink')
                            }
                          >
                            <Icon className="h-3 w-3" aria-hidden />
                            {ACTION_LABEL[a]}
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <label
                        htmlFor={`tl-note-${point}`}
                        className="label mb-1 block"
                      >
                        {action === 'overridden'
                          ? 'Override justification (required)'
                          : 'Note (optional)'}
                      </label>
                      <textarea
                        id={`tl-note-${point}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder={
                          action === 'overridden'
                            ? 'State why the Recommendation is being overridden…'
                            : 'Add an operator note…'
                        }
                        aria-invalid={overrideMissingNote}
                        className="w-full resize-y rounded-[4px] border border-rule-strong bg-deep/40 px-2.5 py-2 text-sm text-ink placeholder:text-ink-4 focus:border-accent focus:outline-none"
                      />
                    </div>

                    {overrideMissingNote && (
                      <p className="flex items-center gap-1.5 text-xs text-critical-bright" role="alert">
                        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                        An override requires a justification note before it can be recorded.
                      </p>
                    )}

                    {blockedConfirmation && (
                      <p className="flex items-center gap-1.5 text-xs text-critical-bright" role="alert">
                        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                        {duplicateDispatchBlocked
                          ? `Separate dispatch is blocked because this call shares response with #${linkedPrimaryCallId}.`
                          : dispatchBlockReason}
                      </p>
                    )}

                    {reservationError && (
                      <p className="flex items-center gap-1.5 text-xs text-critical-bright" role="alert">
                        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                        {reservationError}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={submit}
                      disabled={overrideMissingNote || blockedConfirmation}
                      className={
                        'w-full rounded-[4px] border px-3 py-2 text-sm font-semibold transition-colors ' +
                        (overrideMissingNote || blockedConfirmation
                          ? 'cursor-not-allowed border-rule bg-panel text-ink-4'
                          : 'border-accent bg-accent/15 text-accent hover:bg-accent/25')
                      }
                    >
                      Record {ACTION_LABEL[action].toLowerCase()} decision
                    </button>
                  </div>
                )}
              </DecisionStepRow>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DecisionStepRow({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section {...props} className={className}>
      {children}
    </section>
  );
}
