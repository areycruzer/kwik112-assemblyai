import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Panel — a flat 6px-radius surface with a 1px `--rule-strong` border and a
 * `--panel` background. No shadow, no blur; the design system is deliberately
 * flat. An optional header row carries a `.label` title on the left and an
 * arbitrary `action` node on the right.
 */
export function Panel({
  title,
  action,
  className,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-md border border-rule-strong bg-panel text-ink',
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2">
          {title ? <span className="label">{title}</span> : <span />}
          {action}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

/**
 * DataRow — a `.label` on the left and a value on the right. When `mono` is set
 * the value renders with tabular numerals so figures line up in a column.
 */
export function DataRow({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1', className)}>
      <span className="label">{label}</span>
      <span className={cn('text-sm text-ink', mono && 'tnum')}>{value}</span>
    </div>
  );
}

export type ChipTone = 'critical' | 'mild' | 'safe' | 'accent' | 'neutral';

// Fully-rounded filled pills: the signal colour as text over that same colour
// at low alpha, no border. Class names are spelled out in full (never
// interpolated) so Tailwind's scanner emits every variant. The low-alpha fill
// uses the plain `bg-<tone>/15` opacity modifier: Tailwind v4 emits a
// progressive-enhancement pair for these `@theme inline` tokens (a fully-opaque
// fallback plus an `@supports` colour-mix rule carrying the alpha), so the
// modifier renders the correct low-alpha fill in every modern browser.
// The optional status dot uses the solid signal colour.
const CHIP_TONES: Record<ChipTone, { pill: string; dot: string }> = {
  critical: {
    pill: 'text-critical bg-critical/15',
    dot: 'bg-critical',
  },
  mild: {
    pill: 'text-mild bg-mild/15',
    dot: 'bg-mild',
  },
  safe: {
    pill: 'text-safe bg-safe/15',
    dot: 'bg-safe',
  },
  accent: {
    pill: 'text-accent bg-accent/15',
    dot: 'bg-accent',
  },
  neutral: {
    pill: 'text-ink-2 bg-ink-2/12',
    dot: 'bg-ink-3',
  },
};

/**
 * Chip — a fully-rounded (999px) filled pill in 10px uppercase type, no border.
 * A status pill (`dot`) carries a leading filled dot in the signal colour.
 */
export function Chip({
  tone,
  dot,
  children,
  className,
}: {
  tone: ChipTone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const t = CHIP_TONES[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium uppercase tracking-wide',
        t.pill,
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} aria-hidden />}
      {children}
    </span>
  );
}

/**
 * Meter — a 4px-tall bar with no radius. The fill colour is computed by the
 * caller and passed through as an inline style (the one sanctioned place for a
 * runtime colour), defaulting to the accent token. An optional `.label` sits
 * above the track.
 */
export function Meter({
  value,
  max = 100,
  color,
  label,
  className,
}: {
  value: number;
  max?: number;
  color?: string;
  label?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && <span className="label">{label}</span>}
      <div className="h-1 w-full rounded-none bg-rule">
        <div
          className="h-full rounded-none"
          style={{ width: `${pct}%`, backgroundColor: color ?? 'var(--accent)' }}
        />
      </div>
    </div>
  );
}
