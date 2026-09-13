'use client';

import { GitMerge, Link2, Unlink } from 'lucide-react';
import { Chip } from '@/components/ui/panel';
import type {
  FusionDecision,
  FusionDecisionAction,
  FusionSuggestion,
} from '@/lib/incident-fusion';

export function IncidentFusionPanel({
  callId,
  suggestion,
  decision,
  onDecision,
}: {
  callId: string;
  suggestion?: FusionSuggestion;
  decision?: FusionDecision;
  onDecision?: (action: FusionDecisionAction) => void;
}) {
  if (!suggestion && !decision) return null;

  const primaryCallId = suggestion?.primary_call_id ?? decision!.primary_call_id;
  const relatedCallIds = suggestion?.related_call_ids ?? decision!.related_call_ids;
  const evidence = suggestion?.evidence ?? decision!.evidence;
  const fused = suggestion?.fused_intelligence ?? decision!.fused_intelligence;
  const confidence = suggestion?.confidence ?? decision!.confidence;
  const allIds = [primaryCallId, ...relatedCallIds];
  const relatedIds = allIds.filter((id) => id !== callId);
  const closest = [...evidence].sort(
    (a, b) => a.distance_meters - b.distance_meters,
  )[0];

  return (
    <div className="rounded-[6px] border border-accent/60 bg-accent/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <GitMerge className="h-4 w-4 text-accent" aria-hidden />
          Possible same incident — human review required
        </span>
        <Chip tone={decision?.action === 'linked' ? 'safe' : decision ? 'neutral' : 'accent'}>
          {decision
            ? decision.action === 'linked'
              ? 'Linked by operator'
              : 'Kept separate'
            : `${Math.round(confidence * 100)}% similarity`}
        </Chip>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-3">
        {allIds.length} callers may describe the same physical incident. Related:{' '}
        <span className="tnum text-ink-2">{relatedIds.map((id) => `#${id}`).join(', ')}</span>
      </p>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Metric label="Nearest" value={closest ? `${closest.distance_meters} m` : '—'} />
        <Metric label="Time gap" value={closest ? `${closest.time_delta_minutes} min` : '—'} />
        <Metric label="Callers" value={String(fused.corroborating_call_count)} />
      </div>

      <div className="mt-2 rounded-[4px] border border-rule bg-ground px-2 py-1.5 text-xs text-ink-3">
        Review preview: <span className="uppercase text-ink">{fused.severity}</span>
        {' · '}up to {fused.persons_involved} people
        {fused.immediate_threats.length > 0 && ` · ${fused.immediate_threats.join(', ')}`}
      </div>

      {closest?.reasons.length ? (
        <p className="mt-2 text-2xs text-ink-4">
          Why these calls may match: {closest.reasons.join(' · ')}
        </p>
      ) : null}

      {decision ? (
        <p className="tnum mt-2 text-2xs text-ink-4">
          Decision recorded {new Date(decision.at).toLocaleString()} · primary #{primaryCallId}
        </p>
      ) : onDecision && suggestion ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onDecision('linked')}
            className="inline-flex items-center gap-1.5 rounded-[4px] bg-accent px-2.5 py-1.5 text-xs font-semibold text-deep hover:bg-accent-bright"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden /> Link incidents
          </button>
          <button
            type="button"
            onClick={() => onDecision('kept_separate')}
            className="inline-flex items-center gap-1.5 rounded-[4px] border border-rule-strong bg-panel px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:text-ink"
          >
            <Unlink className="h-3.5 w-3.5" aria-hidden /> Keep separate
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[4px] border border-rule bg-panel px-2 py-1.5">
      <span className="label block">{label}</span>
      <span className="tnum text-sm text-ink">{value}</span>
    </div>
  );
}
