/**
 * ForecastModule — incident analytics computed from the live board (Task 16).
 *
 * HONESTY PASS. The previous version presented fabricated numbers as measured
 * production telemetry: a Redis cluster latency figure, a PostgreSQL archive
 * with a made-up count of indexed incidents, an invented LSTM prediction
 * accuracy and correlation coefficient, and a named third-party trial
 * attribution — none of which exist. All of that is deleted, not restyled.
 * Every figure below is computed from the `calls` array, and the one projection
 * series is a transparent moving average of the observed hourly volume,
 * explicitly marked SAMPLE DATA — never a trained model.
 */

'use client';

import { useMemo } from 'react';

import type { EmergencyCall, Severity } from '@/lib/types';
import { Chip } from '@/components/ui/panel';
import { cn } from '@/lib/utils';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

/** Severity → token bar colour class. */
function severityBar(severity: Severity): string {
  if (severity === 'critical') return 'bg-critical';
  if (severity === 'high') return 'bg-mild';
  return 'bg-safe';
}

export default function ForecastModule({ calls }: { calls: EmergencyCall[] }) {
  const stats = useMemo(() => {
    const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const byType = new Map<string, number>();
    const byHour = new Array<number>(24).fill(0);

    // Triage provenance. Read the structured `triage_engine` ('local' | 'model')
    // the builder emits. `triage_method` is never the literal 'model' — it is
    // `${provider}:${model}` on the model path and 'keyword' on the local path —
    // so the old `method === 'model'` test left Model-graded permanently zero.
    // Fall back to deriving the engine from `triage_method` for calls stored
    // before the field existed; calls with neither are counted separately.
    let model = 0;
    let local = 0;
    let unrecorded = 0;

    for (const call of calls) {
      if (call.severity && call.severity in bySeverity) bySeverity[call.severity] += 1;

      const type = call.incident_type || 'other';
      byType.set(type, (byType.get(type) ?? 0) + 1);

      const t = Date.parse(call.created_at);
      if (!Number.isNaN(t)) byHour[new Date(t).getHours()] += 1;

      const engine =
        call.triage_engine ??
        (call.triage_method ? (call.triage_method === 'keyword' ? 'local' : 'model') : undefined);
      if (engine === 'model') model += 1;
      else if (engine === 'local') local += 1;
      else unrecorded += 1;
    }

    const types = [...byType.entries()].sort((a, b) => b[1] - a[1]);

    // Projection: a 3-hour trailing moving average of the observed hourly
    // volume. A pure function of the real bars — illustrative smoothing, NOT a
    // forecast from any trained model. Carries a SAMPLE DATA chip below.
    const projection = byHour.map((_, i) => {
      const window = byHour.slice(Math.max(0, i - 2), i + 1);
      return window.reduce((s, v) => s + v, 0) / window.length;
    });

    const maxHour = Math.max(1, ...byHour, ...projection);

    return {
      total: calls.length,
      bySeverity,
      types,
      byHour,
      projection,
      maxHour,
      model,
      local,
      unrecorded,
    };
  }, [calls]);

  const severityMax = Math.max(1, ...SEVERITY_ORDER.map((s) => stats.bySeverity[s]));
  const typeMax = Math.max(1, ...stats.types.map(([, n]) => n));

  return (
    <div className="h-full overflow-y-auto bg-ground p-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold text-ink">Incident analytics</h1>
          <p className="mt-0.5 text-sm text-ink-3">
            Every figure is computed from the current board. Nothing here is measured production
            telemetry.
          </p>
        </div>

        {/* Computed stat row */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total incidents" value={stats.total} tone="text-ink" />
          <Stat label="Critical" value={stats.bySeverity.critical} tone="text-critical-bright" />
          <Stat label="Model-graded" value={stats.model} tone="text-accent" />
          <Stat label="Local-rules-graded" value={stats.local} tone="text-mild" />
        </div>

        {/* Hourly volume chart + projection */}
        <section className="rounded-md border border-rule-strong bg-panel">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-3 py-2">
            <span className="label">Incidents by hour of created_at</span>
            <div className="flex items-center gap-3 text-2xs">
              <span className="inline-flex items-center gap-1.5 text-ink-3">
                <span className="h-2 w-2 rounded-none bg-accent" aria-hidden />
                Actual
              </span>
              <span className="inline-flex items-center gap-1.5 text-ink-3">
                <span className="inline-block h-0 w-3 border-t-2 border-dashed border-mild" aria-hidden />
                Projection
              </span>
              <Chip tone="mild">Sample data</Chip>
            </div>
          </div>
          <div className="p-3">
            <HourlyChart byHour={stats.byHour} projection={stats.projection} max={stats.maxHour} />
            <p className="mt-2 text-2xs text-ink-4">
              Projection is a 3-hour trailing moving average of the observed volume — illustrative
              smoothing only, not a trained forecasting model.
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* By severity */}
          <section className="rounded-md border border-rule-strong bg-panel">
            <div className="border-b border-rule px-3 py-2">
              <span className="label">Incidents by severity</span>
            </div>
            <div className="flex flex-col gap-2 p-3">
              {SEVERITY_ORDER.map((sev) => (
                <BarRow
                  key={sev}
                  label={sev}
                  value={stats.bySeverity[sev]}
                  max={severityMax}
                  barClass={severityBar(sev)}
                />
              ))}
            </div>
          </section>

          {/* By type */}
          <section className="rounded-md border border-rule-strong bg-panel">
            <div className="border-b border-rule px-3 py-2">
              <span className="label">Incidents by type</span>
            </div>
            <div className="flex flex-col gap-2 p-3">
              {stats.types.length === 0 ? (
                <p className="text-sm text-ink-3">No incidents on the board.</p>
              ) : (
                stats.types.map(([type, n]) => (
                  <BarRow key={type} label={type} value={n} max={typeMax} barClass="bg-accent" />
                ))
              )}
            </div>
          </section>
        </div>

        {/* Triage split */}
        <section className="rounded-md border border-rule-strong bg-panel">
          <div className="border-b border-rule px-3 py-2">
            <span className="label">Triage split (local rules vs model)</span>
          </div>
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
            <Stat label="Local rules (keyword)" value={stats.local} tone="text-mild" small />
            <Stat label="Model refinement" value={stats.model} tone="text-accent" small />
            <Stat label="Not recorded" value={stats.unrecorded} tone="text-ink-2" small />
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: number;
  tone: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-[6px] border border-rule bg-ground px-3 py-2.5">
      <span className="label block">{label}</span>
      <span className={cn('tnum font-semibold', small ? 'text-lg' : 'text-xl', tone)}>{value}</span>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  barClass,
}: {
  label: string;
  value: number;
  max: number;
  barClass: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-sm capitalize text-ink-2" title={label}>
        {label.replace(/_/g, ' ')}
      </span>
      <div className="h-2 flex-1 rounded-none bg-rule">
        <div className={cn('h-full rounded-none', barClass)} style={{ width: `${pct}%` }} />
      </div>
      <span className="tnum w-8 shrink-0 text-right text-sm text-ink">{value}</span>
    </div>
  );
}

/**
 * HourlyChart — 24 actual-volume bars scaled to the data's real maximum (never a
 * hardcoded ceiling), with the projection drawn as a dashed polyline over them.
 */
function HourlyChart({
  byHour,
  projection,
  max,
}: {
  byHour: number[];
  projection: number[];
  max: number;
}) {
  const W = 720;
  const H = 220;
  const padL = 8;
  const padR = 8;
  const padTop = 10;
  const padBottom = 26;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;
  const slotW = plotW / 24;
  const barW = slotW * 0.6;

  const centre = (i: number) => padL + i * slotW + slotW / 2;
  const yFor = (v: number) => padTop + plotH - (v / max) * plotH;

  const projPoints = projection.map((v, i) => `${centre(i)},${yFor(v)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label="Incidents by hour with projection">
      {/* baseline */}
      <line x1={padL} y1={padTop + plotH} x2={W - padR} y2={padTop + plotH} stroke="var(--rule)" strokeWidth={1} />

      {/* actual bars */}
      {byHour.map((v, i) => {
        const h = (v / max) * plotH;
        return (
          <rect
            key={i}
            x={centre(i) - barW / 2}
            y={padTop + plotH - h}
            width={barW}
            height={h}
            fill="var(--accent)"
          />
        );
      })}

      {/* projection line (dashed) */}
      <polyline
        points={projPoints}
        fill="none"
        stroke="var(--mild)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />

      {/* hour labels every 3 hours */}
      {byHour.map((_, i) =>
        i % 3 === 0 ? (
          <text
            key={`l${i}`}
            x={centre(i)}
            y={H - 8}
            textAnchor="middle"
            fontSize={10}
            fill="var(--ink-4)"
          >
            {String(i).padStart(2, '0')}
          </text>
        ) : null,
      )}
    </svg>
  );
}
