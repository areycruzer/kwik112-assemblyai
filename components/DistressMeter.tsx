import { distressColor } from '@/lib/design/symbols';
import { cn } from '@/lib/utils';
import { Meter } from '@/components/ui/panel';

/**
 * DistressMeter — the Kwik 112 prosody reading for a caller or unit.
 *
 * The critical distinction, mirrored from `buildSymbol`: a `level` of `null` or
 * `undefined` means prosody was NEVER measured — a coverage gap — and renders as
 * an em-dash in `--ink-3`. A `level` of `0` is a real measurement (measured
 * calm) and renders as a ramp-coloured bar with the value, exactly like any
 * other number. Zero is a measurement; absence is a gap; conflating them defeats
 * the feature.
 */
export function DistressMeter({
  level,
  compact,
}: {
  level: number | null | undefined;
  compact?: boolean;
}) {
  // Absence — never measured. An em-dash, not a zero bar.
  if (level == null) {
    return (
      <span className={cn('text-ink-3', compact ? 'text-sm' : 'text-base')} aria-label="No distress reading">
        &mdash;
      </span>
    );
  }

  const clamped = Math.min(100, Math.max(0, level));
  const rounded = Math.round(clamped);
  // Runtime-computed ramp colour: the single sanctioned inline-style exception.
  const color = distressColor(clamped);

  if (compact) {
    return (
      <span className="inline-flex items-center gap-2" aria-label={`Distress ${rounded}`}>
        <span className="inline-block w-12">
          <Meter value={clamped} max={100} color={color} />
        </span>
        <span className="tnum text-sm text-ink-2">{rounded}</span>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="label">Distress</span>
        <span className="tnum text-sm text-ink">{rounded}</span>
      </div>
      <Meter value={clamped} max={100} color={color} />
    </div>
  );
}
