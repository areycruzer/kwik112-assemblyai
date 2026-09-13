/**
 * Kwik 112 Mission Kanban Pipeline
 *
 * A five-stage incident pipeline rebuilt on the Kwik 112 design system:
 * flat `--panel` surfaces, 1px rules, signal-coloured accents, and no glow or
 * blur.
 *
 * A card carries five facts and nothing else: priority, what happened (symbol
 * and subtype), when it came in, where it is, and how confident the triage was.
 * It used to also print the full AI summary paragraph and a distress meter,
 * which turned a five-column board into a wall of prose. The reading happens in
 * the incident panel; the board is for moving work between stages.
 *
 * The card itself is the "open this incident" control: clicking anywhere on it
 * switches to the map and opens the incident in the emergency panel. A separate
 * "Open in map" button used to sit in the actions row, which meant the obvious
 * gesture - clicking the card - did nothing at all.
 *
 * Two hard-won behaviours are preserved verbatim:
 *   - `stageOf` maps a call to EXACTLY ONE stage, so no incident can render in
 *     two columns at once.
 *   - The stage-move buttons stay in the DOM: drag alone is not keyboard
 *     reachable and the board must be operable without a mouse. They are merely
 *     hidden until the card is hovered or one of them is focused - see the
 *     card's actions row for how that is done without leaving the tab order.
 */

'use client';

import { useState } from 'react';
import { CallStatus, EmergencyCall } from '@/lib/types';
import { Chip, type ChipTone } from '@/components/ui/panel';
import { Symbol } from '@/components/ui/symbol';
import { glyphForIncidentType, type IncidentGlyph } from '@/lib/design/symbols';
import { getTimeElapsed } from '@/lib/mock-data';
import { severityTone, priorityCode, distressOf } from '@/lib/incident';
import { MapPin, Shield, MoveRight, MoveLeft, Filter, Layers } from 'lucide-react';

interface IncidentKanbanBoardProps {
  calls: EmergencyCall[];
  onSelectCallAndNavigateToMap: (callId: string) => void;
  onUpdateCallStatus: (callId: string, newStatus: CallStatus) => void;
  onOpenWorkflow: (call: EmergencyCall) => void;
}

interface ColumnDef {
  id: string;
  title: string;
  subtitle: string;
  /** Token background class for the 3px stage accent strip and the count pill. */
  accentBg: string;
  countTone: ChipTone;
}

const KANBAN_COLUMNS: ColumnDef[] = [
  {
    id: 'triage',
    title: '1 · Incoming / AI triage',
    subtitle: 'Live speech stream & geolocation lock',
    accentBg: 'bg-critical',
    countTone: 'critical',
  },
  {
    id: 'approval',
    title: '2 · Recommendation & handoff',
    subtitle: 'Awaiting operator authorization',
    accentBg: 'bg-mild',
    countTone: 'mild',
  },
  {
    id: 'dispatched',
    title: '3 · Units dispatched / en route',
    subtitle: 'Active pathfinding & fleet GPS',
    accentBg: 'bg-accent',
    countTone: 'accent',
  },
  {
    id: 'on_scene',
    title: '4 · On scene / mitigation',
    subtitle: 'Responders deployed at coordinates',
    accentBg: 'bg-accent-dim',
    countTone: 'accent',
  },
  {
    id: 'resolved',
    title: '5 · Resolved / closed',
    subtitle: 'Handoff completed & audit logged',
    accentBg: 'bg-safe',
    countTone: 'safe',
  },
];

const STAGE_ORDER = ['triage', 'approval', 'dispatched', 'on_scene', 'resolved'];

/** @description The call status each pipeline stage corresponds to. */
const STATUS_FOR_STAGE: Record<string, CallStatus> = {
  triage: 'pending',
  approval: 'active',
  dispatched: 'dispatched',
  on_scene: 'on_scene',
  resolved: 'resolved',
};

const PRIORITY_FILTERS = ['all', 'critical', 'high', 'medium', 'low'] as const;

/**
 * Real per-card confidence as a whole-percent string, or null when ungraded.
 * The figure is the stored one - 0.89 shows as 89%, never nudged to a
 * rounder-looking 90% - because a dispatcher weighing whether to trust an AI
 * grade is entitled to the number the model actually produced.
 */
function confidenceOf(call: EmergencyCall): string | null {
  const value = call.ai_confidence ?? call.ai_triage?.confidence;
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : null;
}

export default function IncidentKanbanBoard({
  calls,
  onSelectCallAndNavigateToMap,
  onUpdateCallStatus,
  onOpenWorkflow,
}: IncidentKanbanBoardProps) {
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [draggedCallId, setDraggedCallId] = useState<string | null>(null);

  /**
   * @description Map a call to exactly one pipeline stage. Returning a single
   *              stage per call is what stops an incident rendering in two
   *              columns at once, which the previous per-column predicates could
   *              do for any call whose `status` and `call_status` disagreed.
   */
  const stageOf = (call: EmergencyCall): string => {
    switch ((call.status || 'pending').toLowerCase()) {
      case 'resolved':
      case 'completed':
      case 'closed':
        return 'resolved';
      case 'on_scene':
      case 'mitigating':
        return 'on_scene';
      case 'dispatched':
      case 'en-route':
        return 'dispatched';
      case 'active':
      case 'awaiting_approval':
      case 'pending_approval':
        return 'approval';
      default:
        return 'triage';
    }
  };

  const getCallsForColumn = (column: ColumnDef) =>
    calls.filter((call) => {
      if (filterPriority !== 'all' && call.severity !== filterPriority) return false;
      return stageOf(call) === column.id;
    });

  const handleDragStart = (e: React.DragEvent, callId: string) => {
    e.dataTransfer.setData('text/plain', callId);
    setDraggedCallId(callId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    const callId = e.dataTransfer.getData('text/plain') || draggedCallId;
    if (callId) {
      onUpdateCallStatus(callId, STATUS_FOR_STAGE[targetColumnId] ?? 'pending');
    }
    setDraggedCallId(null);
  };

  /**
   * @description Keyboard- and click-reachable equivalent of dragging a card to
   *              the next column. Drag-and-drop alone leaves the pipeline
   *              unusable for anyone not using a mouse.
   */
  const advanceStage = (call: EmergencyCall) => {
    const current = STAGE_ORDER.indexOf(stageOf(call));
    const next = STAGE_ORDER[Math.min(current + 1, STAGE_ORDER.length - 1)];
    if (next && next !== STAGE_ORDER[current]) {
      onUpdateCallStatus(call.id, STATUS_FOR_STAGE[next]);
    }
  };

  /**
   * @description The mirror of `advanceStage`: move a card one stage backward.
   *              Drag can drop a card into any column including earlier ones, so
   *              without this, correcting a mis-drag or reopening a wrongly
   *              resolved incident was mouse-only.
   */
  const regressStage = (call: EmergencyCall) => {
    const current = STAGE_ORDER.indexOf(stageOf(call));
    const prev = STAGE_ORDER[Math.max(current - 1, 0)];
    if (prev && prev !== STAGE_ORDER[current]) {
      onUpdateCallStatus(call.id, STATUS_FOR_STAGE[prev]);
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-ground text-ink">
      {/* Sub-header & priority filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule bg-panel px-6 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-rule-strong bg-panel-raised text-accent">
            <Layers className="h-4 w-4" aria-hidden />
          </span>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-wide text-ink">
              Mission Kanban Pipeline
            </h2>
            <span className="text-2xs text-ink-4">
              Drag cards or advance them to move a stage
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="label flex items-center gap-1">
            <Filter className="h-3 w-3" aria-hidden /> Priority
          </span>
          {PRIORITY_FILTERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setFilterPriority(p)}
              aria-pressed={filterPriority === p}
              className={
                'rounded-full px-2.5 py-0.5 text-2xs font-medium uppercase tracking-wide transition-colors ' +
                (filterPriority === p
                  ? 'bg-accent/15 text-accent'
                  : 'bg-panel-raised text-ink-3 hover:text-ink')
              }
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Five-column board. Columns flex to fill the width but never shrink
          below a readable floor; when five of them cannot fit the viewport the
          row scrolls horizontally rather than crushing each column. */}
      <div className="flex flex-1 gap-3 overflow-x-auto overflow-y-hidden p-4">
        {KANBAN_COLUMNS.map((column) => {
          const colCalls = getCallsForColumn(column);

          return (
            <div
              key={column.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
              className="flex h-full min-w-[240px] flex-1 flex-col overflow-hidden rounded-md border border-rule-strong bg-panel"
            >
              {/* Column header */}
              <div className="border-b border-rule">
                <div className={'h-[3px] w-full ' + column.accentBg} aria-hidden />
                <div className="space-y-1 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink">{column.title}</span>
                    <Chip tone={column.countTone}>{colCalls.length}</Chip>
                  </div>
                  <p className="text-2xs text-ink-4">{column.subtitle}</p>
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 space-y-2.5 overflow-y-auto p-2">
                {colCalls.length === 0 ? (
                  <div className="flex h-28 items-center justify-center rounded-[6px] border border-dashed border-rule p-3 text-center text-2xs text-ink-4">
                    No incidents in this stage
                  </div>
                ) : (
                  colCalls.map((call) => {
                    const glyph: IncidentGlyph = glyphForIncidentType(call.incident_type);
                    const subtype =
                      call.incident_subtype || call.incident_type || 'Unclassified incident';
                    const address = call.caller_location?.address;
                    const confidence = confidenceOf(call);

                    return (
                      <div
                        key={call.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, call.id)}
                        onClick={() => onSelectCallAndNavigateToMap(call.id)}
                        className="group flex cursor-pointer flex-col gap-2 rounded-[6px] border border-rule bg-panel-raised p-3 transition-colors hover:border-accent active:cursor-grabbing"
                      >
                        {/* Priority and symbol lead on the left, elapsed time
                            closes on the right - the two things scanned down a
                            column, pinned to opposite edges so they line up
                            across the whole stack. */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2">
                            <Chip tone={severityTone(call.severity)}>{priorityCode(call)}</Chip>
                            <Symbol
                              spec={{
                                kind: 'incident',
                                glyph,
                                severity: call.severity,
                                distress: distressOf(call),
                                size: 20,
                              }}
                              className="mt-0.5 shrink-0"
                            />
                            {/* The subtype is the single most important field on
                                the card, and it doubles as the card's accessible
                                control: the surrounding div's onClick serves a
                                pointer, this serves a keyboard and a screen
                                reader. Making the div itself role="button" would
                                nest the action buttons below inside a button,
                                which is invalid and unreadable to assistive tech.

                                It wraps to at most two lines instead of
                                truncating to a few characters; a very long subtype
                                is clamped so one card cannot grow unbounded. */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectCallAndNavigateToMap(call.id);
                              }}
                              title="Open this incident on the situational map"
                              className="line-clamp-2 break-words text-left text-sm font-semibold capitalize leading-snug text-ink transition-colors hover:text-accent"
                            >
                              {subtype}
                            </button>
                          </div>
                          <span className="tnum shrink-0 text-2xs text-ink-3">
                            {getTimeElapsed(call.created_at)}
                          </span>
                        </div>

                        {address && (
                          <div className="flex items-start gap-1.5 text-xs text-ink-3">
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                            <span className="break-words">{address}</span>
                          </div>
                        )}

                        <div className="tnum text-2xs text-ink-4">
                          Confidence <span className="text-ink-3">{confidence ?? '\u2014'}</span>
                        </div>

                        {/* Actions. Opening the incident is no longer one of
                            them - the card is that control - so what is left is
                            the decision timeline, plus the stage arrows, which
                            stay hidden because a five-column board showed ten of
                            them at once and they read as clutter, not controls.

                            The arrows hide by collapsing their container to zero
                            width, NOT with `hidden` or `display:none`: a
                            zero-width overflow-hidden button is still focusable,
                            so `group-focus-within` expands the container the
                            moment a keyboard user tabs to it. Dragging is
                            mouse-only, so dropping these from the tab order would
                            leave the pipeline unusable without a mouse.

                            Every button here stops propagation: they sit inside
                            the card, and without it each would also fire the
                            card's own "open on the map" click. */}
                        <div className="flex items-center gap-1.5 border-t border-rule pt-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenWorkflow(call);
                            }}
                            title="Review the AI decision timeline"
                            aria-label={`Review the decision timeline for ${subtype}`}
                            className="flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-[4px] border border-rule-strong bg-panel px-2 py-1.5 text-2xs font-medium uppercase tracking-wide text-ink-2 transition-colors hover:border-accent hover:text-accent"
                          >
                            <Shield className="h-3 w-3 shrink-0" aria-hidden />
                            <span>AI timeline</span>
                          </button>

                          <div className="flex w-0 shrink-0 items-center gap-1.5 overflow-hidden opacity-0 transition-all duration-150 group-hover:w-auto group-hover:opacity-100 group-focus-within:w-auto group-focus-within:opacity-100">
                            {stageOf(call) !== 'triage' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  regressStage(call);
                                }}
                                className="flex shrink-0 items-center justify-center rounded-[4px] border border-rule-strong bg-panel px-2 py-1.5 text-ink-2 transition-colors hover:border-mild hover:text-mild"
                                title="Move back to the previous pipeline stage"
                                aria-label={`Move ${subtype} back to the previous stage`}
                              >
                                <MoveLeft className="h-3 w-3" aria-hidden />
                              </button>
                            )}

                            {stageOf(call) !== 'resolved' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  advanceStage(call);
                                }}
                                className="flex shrink-0 items-center justify-center rounded-[4px] border border-rule-strong bg-panel px-2 py-1.5 text-ink-2 transition-colors hover:border-safe hover:text-safe"
                                title="Advance to the next pipeline stage"
                                aria-label={`Advance ${subtype} to the next stage`}
                              >
                                <MoveRight className="h-3 w-3" aria-hidden />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
