/**
 * @module incident
 * @description Shared, call-derived display helpers used across the console
 *              (queue, kanban, history, map, and the detail page).
 *
 *              A NORMAL project module: it uses ordinary imports and carries no
 *              `node --test` suite. It exists because these helpers were
 *              previously copy-pasted into four or five views, and the copies
 *              had already drifted — the map read a low incident as `P4` while
 *              every other view read `P3`, and an early `distressOf` returned a
 *              number for a never-measured call. One definition each, here, is
 *              what stops that recurring.
 */

import type { EmergencyCall } from '@/lib/types';
import { recommendUnits } from '@/lib/unit-recommendation';
import type { ChipTone } from '@/components/ui/panel';

/** Severity → the design system's three-tone chip scale. */
export function severityTone(severity?: string): ChipTone {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'mild';
  if (severity === 'medium' || severity === 'low') return 'safe';
  return 'neutral';
}

/**
 * Two priority schemes exist in stored data. `PriorityCode` permits both the
 * P-scale and a legacy "Code N" scale, and `RESPONSE_TARGET_MINUTES` in
 * dispatch-assurance treats them as the same three grades — Code 3 and P1 both
 * carry the 8-minute target, Code 2 and P2 the 15-minute one, Code 1 and P3 the
 * 30-minute one. Nothing was translating them for display, so the same grade
 * surfaced as "P2" in the incident queue and "CODE 2" on the map, which reads
 * as two different things to the one person who has to act on it.
 */
const LEGACY_PRIORITY_CODES: Record<string, string> = {
  'Code 3': 'P1',
  'Code 2': 'P2',
  'Code 1': 'P3',
};

/**
 * The priority code a call carries, or one derived from its severity, always on
 * the P-scale. Every view reads its grade through here, so they cannot disagree.
 */
export function priorityCode(call: EmergencyCall): string {
  const stored = call.priority_code;
  if (stored) return LEGACY_PRIORITY_CODES[stored] ?? stored;
  return call.severity === 'critical' ? 'P1' : call.severity === 'high' ? 'P2' : 'P3';
}

/**
 * The measured distress reading, or null when prosody was never captured. Zero
 * is a real measurement; absence is a coverage gap. Consumers render the gap as
 * an em-dash (or draw no distress ring) rather than inventing a value.
 */
export function distressOf(call: EmergencyCall): number | null {
  const level = call.ai_triage?.emotion_analysis?.distress_level;
  return typeof level === 'number' ? level : null;
}

/**
 * Where this call's grade came from. Three prosody states are kept distinct:
 *   - measured  → a live Hume EVI reading: "Kwik 112 voice".
 *   - simulated → a scripted demo curve: "Scripted call". Never dressed up as a
 *                 live measurement, which is the whole point of the flag.
 *   - absent    → no prosody at all (distress_level null): falls through to the
 *                 triage/manual attribution below.
 * A distress reading present with no `prosody_source` predates the flag and is
 * treated as measured, preserving prior behaviour for older stored calls.
 */
export function triageSource(call: EmergencyCall): string {
  if (call.ai_triage?.emotion_analysis?.distress_level != null) {
    return call.prosody_source === 'simulated' ? 'Scripted call' : 'Kwik 112 voice';
  }
  if (call.ai_confidence != null || call.ai_triage?.confidence != null) return 'AI triage';
  return 'Manual intake';
}

/** The recommended responding units drawn from real fields, never invented. */
export function recommendedUnits(call: EmergencyCall): string[] {
  if (call.recommended_units?.length) return call.recommended_units;
  const rec = call.ai_recommendation;
  if (rec && typeof rec === 'object') {
    const units = [rec.primary_unit, ...(rec.support_units ?? [])].filter(Boolean) as string[];
    if (units.length) return units;
  }
  return [];
}

/**
 * @description The standard response for this incident type, derived rather
 *              than read off the call.
 *
 *              Kept separate from `recommendedUnits` above, which is contracted
 *              to report only what the call actually carries. This is the
 *              fallback a console shows while a call is still unplanned: every
 *              cardiac arrest wants an ALS ambulance whether or not anyone has
 *              filled in a dispatch plan yet, and the UI labels it a standard
 *              response so it is never mistaken for a decision already made.
 */
export function standardResponseUnits(call: EmergencyCall): string[] {
  const type = call.incident_type;
  if (!type) return [];
  return recommendUnits(type, (call.severity ?? 'low') as Parameters<typeof recommendUnits>[1]);
}

/** A 0–1 fraction as a whole-percent string, or null when absent. */
export function confidencePercent(value?: number): string | null {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : null;
}

/**
 * The language the caller actually spoke, as detected by Hume EVI and stored on
 * the call, or null when none was detected. Absence is a real state — a scripted
 * demo detects nothing — so consumers render an em-dash rather than a guess,
 * exactly as a never-measured distress reading renders an em-dash.
 */
export function spokenLanguage(call: EmergencyCall): string | null {
  const language = call.language?.trim();
  return language ? language : null;
}
