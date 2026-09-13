/**
 * AlertsModule - operational alerts derived from live call state.
 *
 * The module presents alerts as an operator action queue: what is wrong, why it
 * matters, and the next move. Acknowledgements persist in localStorage and feed
 * the rail badge through `onAckChange`.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  ChevronRight,
  Clock3,
  Gauge,
  MapPin,
  RadioTower,
  type LucideIcon,
} from 'lucide-react';

import type { EmergencyCall } from '@/lib/types';
import {
  ACK_STORAGE_KEY,
  acknowledge,
  deriveAlerts,
  readAcknowledged,
  type Alert,
  type AlertInput,
} from '@/lib/alerts';
import { Chip, type ChipTone } from '@/components/ui/panel';
import { cn } from '@/lib/utils';

function severityTone(severity: Alert['severity']): ChipTone {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'mild';
  if (severity === 'medium') return 'safe';
  return 'neutral';
}

const SEVERITY_RANK: Record<Alert['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const ALERT_META: Record<Alert['code'], { icon: LucideIcon; label: string; tone: string }> = {
  LOCATION_UNRESOLVED: {
    icon: MapPin,
    label: 'Location',
    tone: 'text-mild bg-mild/10',
  },
  P1_UNASSIGNED: {
    icon: RadioTower,
    label: 'Dispatch',
    tone: 'text-critical bg-critical/10',
  },
  MODEL_ESCALATED: {
    icon: Bot,
    label: 'Review',
    tone: 'text-safe bg-safe/10',
  },
  LOW_CONFIDENCE: {
    icon: Gauge,
    label: 'Verify',
    tone: 'text-safe bg-safe/10',
  },
  STALE_INCIDENT: {
    icon: Clock3,
    label: 'Follow-up',
    tone: 'text-ink-2 bg-ink-2/10',
  },
};

export default function AlertsModule({
  calls,
  now,
  onSelectCall,
  onAckChange,
}: {
  calls: EmergencyCall[];
  now: number;
  onSelectCall?: (id: string) => void;
  onAckChange?: () => void;
}) {
  const [acks, setAcks] = useState<Set<string>>(new Set());

  useEffect(() => {
    setAcks(readAcknowledged());
    const sync = (event: StorageEvent) => {
      if (event.key === null || event.key === ACK_STORAGE_KEY) setAcks(readAcknowledged());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const alerts = useMemo(() => {
    const input: AlertInput[] = calls.map((c) => ({
      id: c.id,
      severity: c.severity,
      status: c.status,
      created_at: c.created_at,
      ai_confidence: c.ai_confidence,
      caller_location: c.caller_location,
      model_escalated: c.model_escalated,
    }));
    return deriveAlerts(input, now).sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    );
  }, [calls, now]);

  const callsById = useMemo(() => {
    const map = new Map<string, EmergencyCall>();
    for (const call of calls) map.set(call.id, call);
    return map;
  }, [calls]);

  const open = alerts.filter((a) => !acks.has(a.key));
  const acknowledged = alerts.filter((a) => acks.has(a.key));
  const criticalOpen = open.filter((a) => a.severity === 'critical').length;
  const highOpen = open.filter((a) => a.severity === 'high').length;

  const handleAck = useCallback(
    (key: string) => {
      acknowledge(key);
      setAcks((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      onAckChange?.();
    },
    [onAckChange],
  );

  return (
    <div className="h-full overflow-y-auto bg-ground p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-ink">Operational alerts</h1>
              <p className="mt-0.5 text-sm text-ink-3">
                Live risks that need an operator decision before they can clear.
              </p>
            </div>
            <span className="tnum shrink-0 text-lg font-semibold text-mild">{open.length}</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <SummaryTile label="Urgent now" value={criticalOpen} tone="critical" />
            <SummaryTile label="Routing risk" value={highOpen} tone="mild" />
            <SummaryTile label="Acknowledged" value={acknowledged.length} tone="neutral" />
          </div>
        </div>

        <section className="rounded-md border border-rule-strong bg-panel">
          <div className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2">
            <div>
              <span className="label">Open action queue</span>
              <p className="mt-0.5 text-2xs text-ink-4">
                Each item shows what is wrong, why it matters, and the next operator move.
              </p>
            </div>
            <span className="tnum text-sm font-semibold text-mild">{open.length}</span>
          </div>
          <div className="p-2">
            {open.length === 0 ? (
              <p className="p-3 text-sm text-ink-3">No open alerts.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {open.map((alert) => (
                  <AlertRow
                    key={alert.key}
                    alert={alert}
                    incident={callsById.get(alert.callId)}
                    onSelectCall={onSelectCall}
                    onAck={() => handleAck(alert.key)}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {acknowledged.length > 0 && (
          <section className="rounded-md border border-rule-strong bg-panel">
            <div className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2">
              <span className="label">Acknowledged</span>
              <span className="tnum text-2xs text-ink-4">{acknowledged.length}</span>
            </div>
            <div className="p-2">
              <ul className="flex flex-col gap-2">
                {acknowledged.map((alert) => (
                  <AlertRow
                    key={alert.key}
                    alert={alert}
                    incident={callsById.get(alert.callId)}
                    onSelectCall={onSelectCall}
                    acknowledged
                  />
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'critical' | 'mild' | 'neutral';
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[6px] border border-rule bg-panel px-3 py-2">
      <span className="label">{label}</span>
      <span
        className={cn(
          'tnum text-lg font-semibold',
          tone === 'critical'
            ? 'text-critical-bright'
            : tone === 'mild'
              ? 'text-mild'
              : 'text-ink-3',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function AlertRow({
  alert,
  incident,
  onSelectCall,
  onAck,
  acknowledged,
}: {
  alert: Alert;
  incident?: EmergencyCall;
  onSelectCall?: (id: string) => void;
  onAck?: () => void;
  acknowledged?: boolean;
}) {
  const meta = ALERT_META[alert.code];
  const Icon = meta.icon;
  const incidentName = incident?.incident_subtype || incident?.incident_type || `Incident ${alert.callId}`;

  return (
    <li
      className={cn(
        'grid gap-3 rounded-[6px] border border-rule bg-ground p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]',
        !acknowledged && alert.severity === 'critical' && 'border-critical/45 bg-critical/5',
        acknowledged && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px]',
            meta.tone,
          )}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex flex-col gap-1 sm:hidden">
          <Chip tone={severityTone(alert.severity)}>{alert.severity}</Chip>
          <span className="label">{meta.label}</span>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={severityTone(alert.severity)} className="hidden sm:inline-flex">
            {alert.severity}
          </Chip>
          <span className="hidden text-2xs font-semibold uppercase tracking-wide text-ink-4 sm:inline">
            {meta.label}
          </span>
          <p className="min-w-0 text-sm font-semibold text-ink">{alert.title}</p>
        </div>

        <p className="mt-1 text-sm font-medium capitalize text-ink-2">{incidentName}</p>

        <div className="mt-2 grid gap-1 text-sm text-ink-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
          <p>{alert.message}</p>
          <p>{alert.impact}</p>
        </div>

        {incident?.caller_location?.address && (
          <p className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-ink-4">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{incident.caller_location.address}</span>
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:justify-end">
        {onSelectCall && (
          <button
            type="button"
            onClick={() => onSelectCall(alert.callId)}
            className="inline-flex h-8 items-center gap-1 rounded-[4px] border border-rule px-2.5 text-2xs font-medium uppercase tracking-wide text-ink-2 transition-colors hover:border-rule-strong hover:text-ink"
          >
            Incident
            <ChevronRight className="h-3 w-3" aria-hidden />
          </button>
        )}
        {!acknowledged && onAck && (
          <button
            type="button"
            onClick={onAck}
            className="h-8 rounded-[4px] bg-accent px-2.5 text-2xs font-semibold uppercase tracking-wide text-deep transition-colors hover:bg-accent-dim"
          >
            Ack
          </button>
        )}
      </div>
    </li>
  );
}
