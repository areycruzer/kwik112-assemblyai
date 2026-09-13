/**
 * @module alerts
 * @description Derives operational alerts from live call state. Alerts are
 *              computed, never seeded, so what an operator sees always reflects
 *              the board rather than a fixture.
 *
 *              Self-contained: it declares the shape it needs rather than
 *              importing EmergencyCall, which keeps it unit-testable and
 *              decoupled from the wider type surface.
 */

export interface AlertInput {
  id: string;
  severity?: string;
  status?: string;
  created_at: string;
  ai_confidence?: number;
  caller_location?: { latitude?: number; longitude?: number };
  /** Set when model refinement graded the call above the local rules. */
  model_escalated?: boolean;
}

export type AlertCode =
  | 'LOCATION_UNRESOLVED'
  | 'P1_UNASSIGNED'
  | 'MODEL_ESCALATED'
  | 'LOW_CONFIDENCE'
  | 'STALE_INCIDENT';

export interface Alert {
  key: string;
  callId: string;
  code: AlertCode;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  impact: string;
}

const CLOSED_STATUSES = new Set(['resolved', 'completed', 'closed']);
const ASSIGNED_STATUSES = new Set(['dispatched', 'en-route', 'on_scene', 'mitigating']);

const P1_GRACE_SECONDS = 90;
const STALE_SECONDS = 30 * 60;
const LOW_CONFIDENCE = 0.5;

/** @description Compute every open alert for the given calls. */
/**
 * @description An elapsed time an operator can act on.
 *
 *              Alert text used to carry raw machine units — "unassigned for
 *              660s", "open for 194 minutes" — leaving the reader to divide by
 *              sixty in their head, on the screen whose whole job is to convey
 *              urgency at a glance.
 */
function humanDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'an unknown time';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

export function deriveAlerts(calls: AlertInput[], nowMs: number): Alert[] {
  const alerts: Alert[] = [];

  for (const call of calls) {
    const status = (call.status ?? '').toLowerCase();
    // Normalise severity the same way as status so callers do not have to
    // pre-lowercase it: a 'Critical' from any source still fires P1_UNASSIGNED.
    const severity = (call.severity ?? '').toLowerCase();
    // A closed incident cannot need operator attention.
    if (CLOSED_STATUSES.has(status)) continue;

    // Fail open on an undeterminable age: a missing/empty/unparseable
    // created_at yields NaN, which would make every `age > threshold` test
    // false and silently suppress P1_UNASSIGNED and STALE_INCIDENT. In a
    // dispatch system that means an operator is never told about a critical
    // incident, so we treat an unknown age as past every grace period —
    // the alert fires rather than vanishing.
    const parsedAge = (nowMs - Date.parse(call.created_at)) / 1000;
    const ageSeconds = Number.isNaN(parsedAge) ? Infinity : parsedAge;
    const push = (
      code: AlertCode,
      severity: Alert['severity'],
      title: string,
      message: string,
      impact: string,
    ) =>
      alerts.push({
        key: `${call.id}:${code}`,
        callId: call.id,
        code,
        severity,
        title,
        message,
        impact,
      });

    const loc = call.caller_location;
    // Finiteness, not `typeof`: NaN is typeof 'number' but not a usable
    // coordinate, so a NaN lat/long must still count as unresolved. `0` is a
    // legitimate coordinate (equator / prime meridian) and stays resolved.
    if (!Number.isFinite(loc?.latitude) || !Number.isFinite(loc?.longitude)) {
      push(
        'LOCATION_UNRESOLVED',
        'high',
        'Location not routable',
        'No coordinates resolved.',
        'Get usable coordinates before sending responders.',
      );
    }

    if (
      severity === 'critical' &&
      !ASSIGNED_STATUSES.has(status) &&
      ageSeconds > P1_GRACE_SECONDS
    ) {
      push(
        'P1_UNASSIGNED',
        'critical',
        'No response unit assigned',
        `Unassigned for ${humanDuration(ageSeconds)}.`,
        'Dispatch attention needed for this critical incident.',
      );
    }

    if (call.model_escalated) {
      push(
        'MODEL_ESCALATED',
        'medium',
        'Severity raised by model',
        'Model refinement raised severity above the local grade.',
        'Review the escalation before committing dispatch decisions.',
      );
    }

    if (typeof call.ai_confidence === 'number' && call.ai_confidence < LOW_CONFIDENCE) {
      push(
        'LOW_CONFIDENCE',
        'medium',
        'Low triage confidence',
        `Triage confidence ${Math.round(call.ai_confidence * 100)}% — verify before dispatch.`,
        'Confirm key details before relying on the automated grade.',
      );
    }

    if (ageSeconds > STALE_SECONDS) {
      push(
        'STALE_INCIDENT',
        'low',
        'Resolution overdue',
        `Open for ${humanDuration(ageSeconds)} with no resolution.`,
        'Check whether the incident still needs operator follow-up.',
      );
    }
  }

  return alerts;
}

export const ACK_STORAGE_KEY = 'dispatch_alert_acks';

/** @description Read acknowledged alert keys. Browser only; returns empty on the server. */
export function readAcknowledged(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(ACK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

/** @description Mark one alert acknowledged. */
export function acknowledge(key: string): void {
  if (typeof window === 'undefined') return;
  const acks = readAcknowledged();
  acks.add(key);
  try {
    window.localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify([...acks]));
  } catch {
    /* storage unavailable; acknowledgement is best-effort */
  }
}
