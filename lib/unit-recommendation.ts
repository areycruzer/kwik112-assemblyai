/**
 * @module unit-recommendation
 * @description The standard response for an incident type: which services a
 *              control room sends before anyone has looked at the call.
 *
 *              This lived inside `lib/triage`, which is server-side — it pulls
 *              in the logger and the LLM client — so the console could not ask
 *              for the same answer without dragging both into the browser
 *              bundle. The console needs it because a call that has not been
 *              planned yet still has an obvious answer to "who goes to a
 *              cardiac arrest", and printing "No units recommended yet" instead
 *              of saying so helps nobody.
 *
 *              Self-contained on purpose: it imports nothing at runtime, so
 *              `node --test` and any client component can both load it.
 */

import type { Severity } from './types.ts';

/**
 * Service-level response by incident type. These are unit *roles*, not the
 * physical appliances in `lib/units` — "ALS Ambulance" is the thing to send,
 * "Ambulance 302" is the one that goes. Response assurance is what turns the
 * first into the second.
 */
const STANDARD_RESPONSE: Record<string, string[]> = {
  fire: ['Fire Engine', 'Rescue Ladder', 'ALS Ambulance'],
  medical_emergency: ['ALS Ambulance', 'Nearest Patrol Assist'],
  accident: ['ALS Ambulance', 'Highway Patrol', 'Rescue Tender'],
  crime: ['Police Patrol', 'Supervisor Escalation'],
  // Building collapse, gas leak, waterlogging, downed power lines — in Indian
  // cities these are fire-and-rescue work first. This bucket used to summon a
  // municipal van and a police patrol, so a building collapse with families
  // trapped under debris was proposed no rescue appliance at all.
  public_safety: ['Fire & Rescue Tender', 'Municipal Response Unit', 'Police Patrol'],
};

/**
 * @description The units a given incident type and severity call for.
 *              A critical grade puts advanced life support at the front of the
 *              list whatever the incident type: the one thing that cannot wait
 *              for a second opinion is a patient who is dying.
 */
export function recommendUnits(type: string, severity: Severity): string[] {
  const units = STANDARD_RESPONSE[type] ?? ['Nearest Available Unit', 'Field Supervisor'];
  return severity === 'critical' ? ['Advanced Life Support Ambulance', ...units] : units;
}
