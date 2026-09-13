/**
 * Shared call assembly for the dispatch board.
 *
 * Both `POST /api/calls/create` (local rules, instant) and
 * `POST /api/calls/refine` (model enrichment) build an `EmergencyCall` from the
 * same finished conversation. This module is that single assembly point: the
 * only thing the two routes vary is the `mode` — `'local'` grades with keyword
 * rules only, `'model'` awaits the language model. Keeping one builder is
 * deliberate; a previous build let a second route drift into a divergent copy
 * of the triage logic and the two disagreed on live calls.
 */

import { EmergencyCall, Location } from '@/lib/types';
import { HINGLISH_DEMO_LOCATION } from '@/lib/demo';
import {
  EmotionFrame,
  buildOperatorQuestions,
  buildSafetyAudit,
  distressLevel,
  localTriage,
  priorityFromSeverity,
  rankEmotions,
  recommendDispatchPlan,
  recommendUnits,
  prankMismatchFlag,
  scoreOf,
  severityBandCeiling,
  severityFromScore,
  triageTranscript,
} from '@/lib/triage';

export interface BuildCallInput {
  /** Reuse an existing call id so a refinement republishes over the same
   *  incident rather than spawning a second card on the board. */
  callId?: string;
  phoneNumber: string;
  transcript?: unknown;
  emotions?: unknown;
  chatGroupId?: string;
  conversationId?: string;
  callDurationSeconds?: number;
  reportedLocation?: { latitude?: number; longitude?: number };
  /** Provenance of the emotion frames. 'measured' is a live Hume EVI capture;
   *  'simulated' is a scripted demo curve. Only meaningful when frames actually
   *  arrive — with no prosody the call stays in the "absent" state regardless. */
  prosodySource?: 'measured' | 'simulated';
  /** Language Hume EVI detected in the caller's speech, as an ISO-ish code
   *  (`en`, `hi`, `ta`, …). Absent on scripted demos and on any call where EVI
   *  reported nothing — a call that detected no language stays in the "absent"
   *  state (language undefined) rather than being labelled with a guess. */
  detectedLanguage?: string;
}

/** Hume returns language codes; the console shows readable names. Common Indian
 *  languages plus English are mapped; anything unmapped falls through to the raw
 *  code so an unexpected value still displays rather than vanishing. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  bn: 'Bengali',
  mr: 'Marathi',
  gu: 'Gujarati',
  kn: 'Kannada',
  ml: 'Malayalam',
  pa: 'Punjabi',
  ur: 'Urdu',
};

/** @description Readable name for a detected language code, or undefined when
 *               nothing was detected — never a fabricated default. */
function readableLanguage(code: string | undefined): string | undefined {
  if (typeof code !== 'string') return undefined;
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  return LANGUAGE_NAMES[trimmed.toLowerCase()] ?? trimmed;
}

interface IncomingSegment {
  text?: string;
  role?: string;
  speaker?: string;
  timestamp?: string;
  emotions?: EmotionFrame;
}

/** @description Accept transcript as an array of segments or a newline string. */
function normalizeTranscript(input: unknown): Array<{
  text: string;
  role: string;
  timestamp: string;
  segment_index: number;
  emotions?: EmotionFrame;
}> {
  const rows: IncomingSegment[] = Array.isArray(input)
    ? (input as IncomingSegment[])
    : typeof input === 'string'
    ? input.split('\n').map((text) => ({ text }))
    : [];

  return rows
    .map((segment, index) => ({
      text: typeof segment?.text === 'string' ? segment.text.trim() : '',
      role: segment?.role === 'assistant' || segment?.speaker === 'assistant' ? 'assistant' : 'user',
      timestamp: segment?.timestamp ?? new Date().toISOString(),
      segment_index: index,
      emotions: segment?.emotions,
    }))
    .filter((segment) => segment.text.length > 0);
}

/**
 * @description Resolve a location without inventing one. When we cannot place
 *              the address we return it unplotted rather than dropping a pin on
 *              a coordinate nobody reported.
 */
const KNOWN_PLACES: Array<[RegExp, { latitude: number; longitude: number; city: string }]> = [
  [/\bsample metro gate 1\b/i, HINGLISH_DEMO_LOCATION],
  // Approximate neighborhood references: existing mock incidents delhi-3/delhi-9.
  [/\bshalimar bagh\b/i, { latitude: 28.7124, longitude: 77.1621, city: 'New Delhi' }],
  [/\b(?:bhagirath palace|chandni chowk)\b/i, { latitude: 28.6562, longitude: 77.23, city: 'New Delhi' }],
  // BEE station registry names Moolchand Metro at 28.564337,77.234100.
  // https://www.beeindia.gov.in/WriteReadData/RTF1984/RTF-PDF-e1b78a871e013df5_1776149188.pdf
  // Rounded reference only; the 1200 m caller-location radius is not a gate fix.
  [/\bmoolchand\b/i, { latitude: 28.5643, longitude: 77.2341, city: 'New Delhi' }],
  [/\bgreater noida\b/i, { latitude: 28.4744, longitude: 77.503, city: 'Greater Noida' }],
  [/\bnoida\b/i, { latitude: 28.5355, longitude: 77.391, city: 'Noida' }],
  [/\brohini\b/i, { latitude: 28.7196, longitude: 77.1186, city: 'New Delhi' }],
  [/\bconnaught place\b/i, { latitude: 28.6304, longitude: 77.2177, city: 'New Delhi' }],
  [/\bnehru place\b/i, { latitude: 28.5492, longitude: 77.253, city: 'New Delhi' }],
  [/\bpitampura\b/i, { latitude: 28.7049, longitude: 77.1324, city: 'New Delhi' }],
  [/\bgurgaon|gurugram\b/i, { latitude: 28.4595, longitude: 77.0266, city: 'Gurugram' }],
  [/\bmumbai\b/i, { latitude: 19.076, longitude: 72.8777, city: 'Mumbai' }],
  [/\bbengaluru|bangalore\b/i, { latitude: 12.9716, longitude: 77.5946, city: 'Bengaluru' }],
  [/\bkolkata\b/i, { latitude: 22.5726, longitude: 88.3639, city: 'Kolkata' }],
  [/\bchennai\b/i, { latitude: 13.0827, longitude: 80.2707, city: 'Chennai' }],
  [/\bhyderabad\b/i, { latitude: 17.385, longitude: 78.4867, city: 'Hyderabad' }],
  [/\bpune\b/i, { latitude: 18.5204, longitude: 73.8567, city: 'Pune' }],
  [/\bnew delhi|\bdelhi\b/i, { latitude: 28.6139, longitude: 77.209, city: 'New Delhi' }],
];

/**
 * @description Pull a recognisable place out of what the caller actually said.
 *              Without this, keyword-only triage produces a call with no
 *              coordinates, which never reaches the map.
 */
function placeFromTranscript(text: string): { phrase: string; place: (typeof KNOWN_PLACES)[number][1] } | null {
  for (const [pattern, place] of KNOWN_PLACES) {
    const match = text.match(pattern);
    if (match) return { phrase: match[0], place };
  }
  return null;
}

/**
 * Spoken-address geocoding via Nominatim (OpenStreetMap). Used only when the
 * caller's words name a place the local gazetteer cannot pin: the address is
 * "named but not placeable" during model refinement only. An identified
 * User-Agent, process-local cache and timeout bound individual requests; there
 * is no app-wide rate limit across processes, so policy compliance is not
 * guaranteed by these safeguards. A miss retains the unplaced caller address.
 */
const geocodeCache = new Map<string, { latitude: number; longitude: number; city?: string; accuracyRadius: number } | null>();

const NOMINATIM_TIMEOUT_MS = 2500;

async function geocodeSpokenAddress(address: string): Promise<{ latitude: number; longitude: number; city?: string; accuracyRadius: number } | null> {
  const key = address.trim().toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;

  const url =
    'https://nominatim.openstreetmap.org/search?q=' +
    encodeURIComponent(address + ', India') +
    '&format=json&limit=1&countrycodes=in';

  let result: { latitude: number; longitude: number; city?: string; accuracyRadius: number } | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Kwik112-demo/1.0 (independent emergency-dispatch demonstration; repo: github.com/areycruzer/kwik-112)' },
      cache: 'no-store',
    });
    if (response.ok) {
      const data = (await response.json()) as Array<{ lat: string; lon: string; type?: string; address?: Record<string, string> }>;
      const top = data?.[0];
      if (top) {
        const lat = Number(top.lat);
        const lon = Number(top.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          // A station/suburb/postcode hit is a neighbourhood fix, not a doorway.
          const coarse = /^(postcode|county|state|country)$/.test(top.type || '');
          result = {
            latitude: lat,
            longitude: lon,
            city: top.address?.city || top.address?.town || top.address?.suburb || undefined,
            accuracyRadius: coarse ? 2500 : 400,
          };
        }
      }
    }
  } catch {
    result = null;
  } finally {
    clearTimeout(timer);
  }
  geocodeCache.set(key, result);
  return result;
}

function resolveLocation(
  address: string | undefined,
  reported: { latitude?: number; longitude?: number } | undefined,
  modelConfidence: number,
  transcriptText = ''
): Location {
  const trimmed = address?.trim();

  // A coordinate the caller's device actually reported always wins.
  if (typeof reported?.latitude === 'number' && typeof reported?.longitude === 'number') {
    return {
      address: trimmed || 'Device-reported position',
      latitude: reported.latitude,
      longitude: reported.longitude,
      confidence: 0.95,
      source: 'gps',
    };
  }

  if (trimmed) {
    for (const [pattern, place] of KNOWN_PLACES) {
      if (pattern.test(trimmed)) {
        return {
          address: trimmed,
          city: place.city,
          latitude: place.latitude,
          longitude: place.longitude,
          // The pin is a district centroid, not the doorway. A model that says
          // it is 100% sure of the address is still only telling us the
          // district it recognised, so the displayed confidence is capped to
          // reflect what the coordinate actually represents.
          confidence: Math.min(Math.max(modelConfidence, 0.55), 0.75),
          accuracy_radius: 1200,
          source: 'caller',
        };
      }
    }
    // Named but not placeable: keep the words, refuse to invent a pin.
    return { address: trimmed, confidence: Math.min(modelConfidence, 0.3), source: 'caller' };
  }

  // No structured address, so fall back to a place name spoken in the call.
  const spoken = placeFromTranscript(transcriptText);
  if (spoken) {
    return {
      address: `Near ${spoken.phrase} (from caller audio)`,
      city: spoken.place.city,
      latitude: spoken.place.latitude,
      longitude: spoken.place.longitude,
      confidence: 0.45,
      accuracy_radius: 1200,
      source: 'caller',
    };
  }

  return { address: 'Location not yet established', confidence: 0, source: 'caller' };
}

/**
 * @description Assemble an `EmergencyCall` from a finished conversation.
 *
 *              `mode: 'local'` grades with keyword rules only and returns in
 *              without network I/O — this is what the operator sees when the
 *              call ends, marked `refinable: true`. `mode: 'model'` awaits the
 *              language model (with the same local-rule fallback baked into
 *              `triageTranscript`) and returns the enriched grade, marked
 *              `refinable: false`.
 *
 *              Everything else — emotion ranking, distress boost, location
 *              resolution, unit recommendation, the assembled object — is
 *              identical across both modes by construction.
 */
export async function buildCall(input: BuildCallInput, mode: 'local' | 'model'): Promise<EmergencyCall> {
  const {
    callId: providedId,
    phoneNumber,
    transcript,
    emotions,
    conversationId,
    callDurationSeconds,
    reportedLocation,
  } = input;

  const segments = normalizeTranscript(transcript);
  const callerText = segments
    .filter((s) => s.role === 'user')
    .map((s) => s.text)
    .join(' ');
  const fullText = segments.map((s) => `${s.role.toUpperCase()}: ${s.text}`).join('\n');

  // Emotion frames may arrive standalone or attached to segments.
  const frames: EmotionFrame[] = [
    ...(Array.isArray(emotions) ? emotions : []),
    ...segments.map((s) => s.emotions).filter(Boolean),
  ].filter((f): f is EmotionFrame => Boolean(f) && typeof f === 'object');

  const ranked = rankEmotions(frames);
  // `distressLevel` returns 0 for an empty frame array — a real number, not
  // absence. A scripted call (and any /create without an `emotions` array)
  // captures no prosody, so publishing a measured distress of 0 would paint a
  // green "measured calm" bar and claim the call came through the voice station.
  // Only emit a measurement when frames actually exist; otherwise it is null.
  const hasProsody = frames.length > 0;
  const distress = hasProsody ? distressLevel(ranked) : null;
  // Only tag provenance when a measurement actually exists. With no prosody the
  // call is in the "absent" state (distress null) and carries no source flag, so
  // measured / simulated / absent stay three distinct states. A live capture
  // defaults to 'measured'; a scripted demo must opt in with 'simulated'.
  const prosodySource: 'measured' | 'simulated' | undefined = hasProsody
    ? input.prosodySource === 'simulated'
      ? 'simulated'
      : 'measured'
    : undefined;

  const triageInput = callerText || fullText;
  const triage = mode === 'model' ? await triageTranscript(triageInput) : localTriage(triageInput);
  const baseScore = scoreOf(triage);

  // Emotion evidence can nudge severity up, never down, and never across a
  // severity-band boundary. Prosody on Indian-language speech is the least
  // reliable signal in this pipeline (published cross-lingual collapse), so it
  // may sharpen priority inside the band the deterministic rules chose, but it
  // may not, by itself, turn a high into a critical. With no prosody the boost
  // is a no-op, so severity is unaffected by the null case.
  const distressBoost = distress ?? 0;
  const severityScore = Math.min(
    severityBandCeiling(baseScore),
    Math.round(Math.max(baseScore, baseScore + distressBoost * 0.2)),
  );
  const severity = severityFromScore(severityScore);

  // Measured prosody that is composed and undistressed on a low/medium-grade
  // incident is the prank signature — surfaced to the operator as a flag,
  // never as a severity change (see prankMismatchFlag for the guardrails).
  const prankFlag = prankMismatchFlag(severity, distress, ranked[0]?.emotion);
  if (prankFlag && !triage.flags.includes(prankFlag)) triage.flags.push(prankFlag);
  const top = ranked[0];

  const location = resolveLocation(
    triage.extraction.location?.address,
    reportedLocation,
    triage.extraction.location?.confidence ?? 0,
    callerText || fullText
  );

  // The caller named a place the gazetteer could not pin — ask the open web
  // (Nominatim) for its coordinates before giving up. A hit upgrades the card
  // from "unresolved location" to a map pin with honest neighbourhood-level
  // accuracy and its own provenance label; a miss keeps the previous
  // low-confidence behaviour, and the operator still sees the spoken words.
  if (mode === 'model' && location.source === 'caller' && typeof location.latitude !== 'number' &&
      location.address && location.address !== 'Location not yet established') {
    const geocoded = await geocodeSpokenAddress(location.address);
    if (geocoded) {
      location.latitude = geocoded.latitude;
      location.longitude = geocoded.longitude;
      location.city = geocoded.city ?? location.city;
      location.accuracy_radius = geocoded.accuracyRadius;
      location.confidence = 0.65;
      location.source = 'geocoded';
    }
  }
  const operatorQuestions = buildOperatorQuestions(triage);

  const callId =
    providedId ||
    (typeof conversationId === 'string' && conversationId
      ? conversationId
      : `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

  const now = new Date().toISOString();

  const call: EmergencyCall = {
    id: callId,
    caller_number: phoneNumber,
    status: 'active',
    call_status: 'completed',
    // The language the caller actually spoke, as detected by Hume EVI. Undefined
    // when nothing was detected (scripted demos, or EVI reporting none) — the
    // console shows an em-dash for that absence rather than a guessed default.
    language: readableLanguage(input.detectedLanguage),
    call_duration: typeof callDurationSeconds === 'number' ? callDurationSeconds : undefined,

    caller_location: location,
    location_confidence: location.confidence,

    incident_type: triage.extraction.incident_type,
    incident_subtype: triage.extraction.incident_subtype,
    chief_complaint: triage.extraction.summary,
    severity,
    severity_score: severityScore,

    top_emotion: top?.emotion,
    emotion_intensity: top?.intensity,
    caller_condition: triage.extraction.caller_condition,
    emotion_data: frames,

    ai_summary: triage.extraction.summary,
    ai_confidence: triage.extraction.confidence_score,
    ai_triage: {
      severity,
      confidence: triage.extraction.confidence_score,
      summary: triage.extraction.summary,
      incident_type: triage.extraction.incident_type,
      priority_code: priorityFromSeverity(severity),
      persons_involved: triage.extraction.persons_involved.count,
      flags: triage.flags,
      emotion_analysis: {
        top_emotions: ranked.slice(0, 8),
        // null, not 0, when no prosody was captured — see `hasProsody` above.
        distress_level: distress,
      },
    },
    persons_involved: triage.extraction.persons_involved.count,
    immediate_threats: triage.extraction.immediate_threats,

    labels: triage.labels,
    flags: triage.flags,
    recommended_units: recommendUnits(triage.extraction.incident_type, severity),
    dispatch_plan: recommendDispatchPlan(triage),
    operator_questions: operatorQuestions,
    safety_audit: triage.safetyAudit ?? buildSafetyAudit(triage, triage, triage),
    special_instructions: operatorQuestions.join(' '),

    transcript: segments,
    priority_code: priorityFromSeverity(severity),

    // Triage provenance. `create` (local) is refinable; `refine` (model) is not.
    refinable: mode === 'local',
    triage_method: triage.method,
    // Structured provenance for analytics. `triage.method` is 'keyword' on the
    // local path and `${provider}:${model}` on the model path — never the literal
    // 'model' — so derive the engine from it rather than from `mode`, which lets a
    // 'model'-mode build that fell back to keyword rules read honestly as 'local'.
    triage_engine: triage.method === 'keyword' ? 'local' : 'model',
    // Prosody provenance. Undefined when no frames arrived (absent state).
    prosody_source: prosodySource,

    created_at: now,
    updated_at: now,
  };

  return call;
}
