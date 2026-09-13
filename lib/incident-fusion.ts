import type { CallStatus, EmergencyCall, Location, Severity } from './types.ts';
import { haversineKm } from './units.ts';

export interface FusionEvidence {
  call_ids: [string, string];
  distance_meters: number;
  time_delta_minutes: number;
  shared_terms: string[];
  reasons: string[];
}

export interface FusionSuggestion {
  key: string;
  primary_call_id: string;
  related_call_ids: string[];
  confidence: number;
  evidence: FusionEvidence[];
  fused_intelligence: {
    severity: Severity;
    severity_score: number;
    persons_involved: number;
    immediate_threats: string[];
    location: Location;
    corroborating_call_count: number;
  };
}

export type FusionDecisionAction = 'linked' | 'kept_separate';

export interface FusionDecision {
  key: string;
  primary_call_id: string;
  related_call_ids: string[];
  action: FusionDecisionAction;
  at: string;
  confidence: number;
  evidence: FusionEvidence[];
  fused_intelligence: FusionSuggestion['fused_intelligence'];
}

export type FusionDecisionMap = Record<string, FusionDecision>;

export const FUSION_STORAGE_KEY = 'kwik112_incident_fusion_decisions';

interface FusionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const CLOSED_STATUSES = new Set(['resolved', 'completed', 'closed']);
const RESPONSE_STATUSES = new Set<CallStatus>([
  'dispatched',
  'en-route',
  'on_scene',
  'mitigating',
]);
const MAX_DISTANCE_METERS = 750;
const MAX_TIME_DELTA_MINUTES = 10;
const MIN_CONFIDENCE = 0.75;
const SEVERITY_RANK: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};
const STOP_WORDS = new Set([
  'the', 'and', 'near', 'at', 'in', 'is', 'a', 'an', 'hai', 'mein', 'me',
  'sector', 'delhi', 'call', 'caller', 'emergency', 'report', 'reported',
  // Type words are already compared separately and are not corroborating evidence.
  'fire', 'aag', 'blaze', 'flames', 'smoke', 'burning', 'accident', 'traffic',
  'crash', 'collision', 'medical', 'crime', 'incident',
]);

function canonicalIncidentType(type: EmergencyCall['incident_type']): string {
  const normalized = String(type ?? '').toLowerCase().trim();
  if (normalized === 'medical_emergency') return 'medical';
  if (normalized === 'traffic') return 'accident';
  return normalized;
}

function validPoint(call: EmergencyCall): { lat: number; lng: number } | null {
  const lat = call.caller_location?.latitude;
  const lng = call.caller_location?.longitude;
  if (
    typeof lat !== 'number' ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    typeof lng !== 'number' ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}

function termsFor(call: EmergencyCall): Set<string> {
  const text = [
    call.ai_summary,
    call.chief_complaint,
    call.incident_subtype,
    call.caller_location?.address,
    ...(call.immediate_threats ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const terms = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(terms.filter((term) => term.length >= 3 && !STOP_WORDS.has(term)));
}

function sharedTerms(a: EmergencyCall, b: EmergencyCall): string[] {
  const aTerms = termsFor(a);
  return [...termsFor(b)].filter((term) => aTerms.has(term)).sort();
}

function pairEvidence(a: EmergencyCall, b: EmergencyCall): { confidence: number; evidence: FusionEvidence } | null {
  if (
    CLOSED_STATUSES.has(String(a.status).toLowerCase()) ||
    CLOSED_STATUSES.has(String(b.status).toLowerCase()) ||
    canonicalIncidentType(a.incident_type) === '' ||
    canonicalIncidentType(a.incident_type) !== canonicalIncidentType(b.incident_type)
  ) {
    return null;
  }

  const aPoint = validPoint(a);
  const bPoint = validPoint(b);
  const aTime = Date.parse(a.created_at);
  const bTime = Date.parse(b.created_at);
  if (!aPoint || !bPoint || !Number.isFinite(aTime) || !Number.isFinite(bTime)) return null;

  const distanceMeters = haversineKm(aPoint.lat, aPoint.lng, bPoint.lat, bPoint.lng) * 1000;
  const timeDeltaMinutes = Math.abs(aTime - bTime) / 60_000;
  if (distanceMeters > MAX_DISTANCE_METERS || timeDeltaMinutes > MAX_TIME_DELTA_MINUTES) {
    return null;
  }

  const shared = sharedTerms(a, b);
  if (shared.length === 0) return null;
  const confidence = Math.min(
    0.99,
    0.5 +
      0.25 * (1 - distanceMeters / MAX_DISTANCE_METERS) +
      0.15 * (1 - timeDeltaMinutes / MAX_TIME_DELTA_MINUTES) +
      Math.min(0.1, shared.length * 0.04),
  );
  if (confidence < MIN_CONFIDENCE) return null;

  return {
    confidence: Number(confidence.toFixed(2)),
    evidence: {
      call_ids: [a.id, b.id],
      distance_meters: Math.round(distanceMeters),
      time_delta_minutes: Number(timeDeltaMinutes.toFixed(1)),
      shared_terms: shared.slice(0, 6),
      reasons: [
        'same incident type',
        `${Math.round(distanceMeters)} m apart`,
        `${timeDeltaMinutes.toFixed(1)} min apart`,
        ...(shared.length > 0 ? [`shared terms: ${shared.slice(0, 3).join(', ')}`] : []),
      ],
    },
  };
}

function suggestionKey(callIds: string[]): string {
  return [...callIds].sort().join('::');
}

function fusedIntelligence(calls: EmergencyCall[]): FusionSuggestion['fused_intelligence'] {
  const ordered = [...calls].sort(
    (a, b) =>
      SEVERITY_RANK[(b.severity as Severity) ?? 'low'] -
        SEVERITY_RANK[(a.severity as Severity) ?? 'low'] ||
      (b.severity_score ?? 0) - (a.severity_score ?? 0),
  );
  const highest = ordered[0];
  const bestLocation = [...calls].sort(
    (a, b) =>
      (b.caller_location?.confidence ?? b.location_confidence ?? 0) -
      (a.caller_location?.confidence ?? a.location_confidence ?? 0),
  )[0]?.caller_location ?? {};
  const threats: string[] = [];
  for (const call of calls) {
    for (const threat of call.immediate_threats ?? []) {
      if (!threats.some((item) => item.toLowerCase() === threat.toLowerCase())) threats.push(threat);
    }
  }

  return {
    severity: (highest?.severity as Severity) ?? 'low',
    severity_score: Math.max(...calls.map((call) => call.severity_score ?? 0)),
    persons_involved: Math.max(0, ...calls.map((call) => call.persons_involved ?? 0)),
    immediate_threats: threats,
    location: bestLocation,
    corroborating_call_count: calls.length,
  };
}

export function findFusionSuggestions(calls: readonly EmergencyCall[]): FusionSuggestion[] {
  const uniqueCalls: EmergencyCall[] = [];
  const seenCallIds = new Set<string>();
  for (const call of calls) {
    if (!seenCallIds.has(call.id)) {
      seenCallIds.add(call.id);
      uniqueCalls.push(call);
    }
  }

  const orderedCalls = uniqueCalls.sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
  );
  const grouped = new Set<string>();
  const suggestions: FusionSuggestion[] = [];

  for (const primary of orderedCalls) {
    if (grouped.has(primary.id)) continue;
    const related: EmergencyCall[] = [];
    const matches: Array<{ confidence: number; evidence: FusionEvidence }> = [];
    for (const candidate of orderedCalls) {
      if (candidate.id === primary.id || grouped.has(candidate.id)) continue;
      const match = pairEvidence(primary, candidate);
      if (!match) continue;
      related.push(candidate);
      matches.push(match);
    }
    if (related.length === 0) continue;

    const group = [primary, ...related];
    for (const call of group) grouped.add(call.id);
    const ids = group.map((call) => call.id);
    const confidence = matches.reduce((total, match) => total + match.confidence, 0) / matches.length;
    suggestions.push({
      key: suggestionKey(ids),
      primary_call_id: primary.id,
      related_call_ids: related.map((call) => call.id),
      confidence: Number(confidence.toFixed(2)),
      evidence: matches.map((match) => match.evidence),
      fused_intelligence: fusedIntelligence(group),
    });
  }

  return suggestions
    .sort((a, b) => b.confidence - a.confidence || a.key.localeCompare(b.key));
}

export function recordFusionDecision(
  decisions: FusionDecisionMap,
  suggestion: FusionSuggestion,
  action: FusionDecisionAction,
  at = new Date().toISOString(),
): FusionDecisionMap {
  return {
    ...decisions,
    [suggestion.key]: {
      key: suggestion.key,
      primary_call_id: suggestion.primary_call_id,
      related_call_ids: [...suggestion.related_call_ids],
      action,
      at,
      confidence: suggestion.confidence,
      evidence: suggestion.evidence.map((item) => ({
        ...item,
        call_ids: [...item.call_ids] as [string, string],
        shared_terms: [...item.shared_terms],
        reasons: [...item.reasons],
      })),
      fused_intelligence: {
        ...suggestion.fused_intelligence,
        immediate_threats: [...suggestion.fused_intelligence.immediate_threats],
        location: { ...suggestion.fused_intelligence.location },
      },
    },
  };
}

export function fusionDecisionFor(
  callId: string,
  decisions: FusionDecisionMap,
  exactSuggestionKey?: string,
): FusionDecision | undefined {
  if (exactSuggestionKey) return decisions[exactSuggestionKey];
  return Object.values(decisions)
    .filter(
      (decision) =>
        decision.primary_call_id === callId || decision.related_call_ids.includes(callId),
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
}

export function linkedPrimaryFor(callId: string, decisions: FusionDecisionMap): string | null {
  const decision = fusionDecisionFor(callId, decisions);
  if (decision?.action === 'linked' && decision.related_call_ids.includes(callId)) {
    return decision.primary_call_id;
  }
  return null;
}

export function isSeparateDispatchTransitionBlocked(
  callId: string,
  nextStatus: CallStatus,
  decisions: FusionDecisionMap,
): boolean {
  return RESPONSE_STATUSES.has(nextStatus) && linkedPrimaryFor(callId, decisions) !== null;
}

function validDecision(value: unknown): value is FusionDecision {
  if (!value || typeof value !== 'object') return false;
  const decision = value as Partial<FusionDecision>;
  const evidenceValid =
    Array.isArray(decision.evidence) &&
    decision.evidence.every((item) =>
      Boolean(item) &&
      Array.isArray(item.call_ids) &&
      item.call_ids.length === 2 &&
      item.call_ids.every((id) => typeof id === 'string') &&
      typeof item.distance_meters === 'number' &&
      Number.isFinite(item.distance_meters) &&
      typeof item.time_delta_minutes === 'number' &&
      Number.isFinite(item.time_delta_minutes) &&
      Array.isArray(item.shared_terms) &&
      item.shared_terms.every((term) => typeof term === 'string') &&
      Array.isArray(item.reasons) &&
      item.reasons.every((reason) => typeof reason === 'string'),
    );
  const fused = decision.fused_intelligence;
  const fusedValid =
    Boolean(fused) &&
    typeof fused === 'object' &&
    ['low', 'medium', 'high', 'critical'].includes(fused!.severity) &&
    typeof fused!.severity_score === 'number' &&
    Number.isFinite(fused!.severity_score) &&
    typeof fused!.persons_involved === 'number' &&
    Number.isFinite(fused!.persons_involved) &&
    Array.isArray(fused!.immediate_threats) &&
    fused!.immediate_threats.every((threat) => typeof threat === 'string') &&
    Boolean(fused!.location) &&
    typeof fused!.location === 'object' &&
    typeof fused!.corroborating_call_count === 'number' &&
    Number.isFinite(fused!.corroborating_call_count);
  return (
    typeof decision.key === 'string' &&
    typeof decision.primary_call_id === 'string' &&
    Array.isArray(decision.related_call_ids) &&
    decision.related_call_ids.every((id) => typeof id === 'string') &&
    (decision.action === 'linked' || decision.action === 'kept_separate') &&
    typeof decision.at === 'string' &&
    Number.isFinite(Date.parse(decision.at)) &&
    typeof decision.confidence === 'number' &&
    decision.confidence >= 0 &&
    decision.confidence <= 1 &&
    evidenceValid &&
    fusedValid
  );
}

export function readFusionDecisions(storage?: FusionStorage): FusionDecisionMap {
  const source = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!source) return {};
  try {
    const parsed = JSON.parse(source.getItem(FUSION_STORAGE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce<FusionDecisionMap>((valid, [key, decision]) => {
      if (validDecision(decision)) valid[key] = decision;
      return valid;
    }, {});
  } catch {
    return {};
  }
}

export function writeFusionDecisions(decisions: FusionDecisionMap, storage?: FusionStorage): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!target) return;
  target.setItem(FUSION_STORAGE_KEY, JSON.stringify(decisions));
}
