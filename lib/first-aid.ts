import type { IncidentType, Severity } from './types.ts';

export interface PreArrivalGuidanceInput {
  incidentType?: IncidentType;
  severity: Severity;
}

export interface PreArrivalGuidance {
  id: string;
  audience: 'dispatcher-read';
  title: string;
  instructions: readonly string[];
  caution: string;
}

const CAUTION =
  'Read only instructions that fit the reported situation, keep the caller safe, and follow dispatcher protocol.';

const INSTRUCTIONS: Record<string, readonly string[]> = {
  medical_urgent: [
    'Put the phone on speaker if you can do so safely.',
    'If the person is unresponsive and not breathing normally, begin chest compressions if you are able and follow the dispatcher step by step.',
    'Send someone for an AED if one is nearby, but do not leave the person alone to search for one.',
  ],
  medical_stable: [
    'Keep the person in a safe position and watch for any change in responsiveness or breathing.',
    'Do not give food, drink, or medicine unless a qualified clinician or dispatcher directs it.',
  ],
  fire: [
    'Leave by the nearest safe exit and use stairs rather than a lift.',
    'Stay low if smoke is present, move to fresh air, and do not re-enter the building.',
    'Keep clear of doors, cylinders, wires, and anything that may spread the hazard.',
  ],
  accident: [
    'Move away from traffic, fuel, fire, or unstable vehicles if you can do so safely.',
    'Do not move an injured person unless there is an immediate danger where they are.',
    'Do not remove a helmet; keep the person still and report changes in breathing or alertness.',
  ],
  crime: [
    'Move to a safe place if possible and do not confront, follow, or approach the suspect.',
    'Keep out of sight and silence the phone if sound could increase the danger.',
    'Describe what you can observe from safety; do not try to recover property or weapons.',
  ],
  public_safety: [
    'Keep people away from the reported hazard and do not touch wires, leaks, or damaged equipment.',
    'Move upwind or to a safer area if there is smoke, gas, or a strong chemical smell.',
  ],
  other: [
    'Move away from any immediate hazard if you can do so safely.',
    'Stay on the line, describe changes, and follow dispatcher instructions.',
  ],
};

function canonicalType(incidentType: IncidentType | undefined): string {
  if (incidentType === 'medical') return 'medical_emergency';
  if (incidentType === 'traffic') return 'accident';
  if (incidentType === 'utility') return 'public_safety';
  return incidentType ?? 'other';
}

export function selectPreArrivalGuidance({
  incidentType,
  severity,
}: PreArrivalGuidanceInput): PreArrivalGuidance {
  const type = canonicalType(incidentType);
  const urgent = severity === 'critical' || severity === 'high';
  const instructionKey =
    type === 'medical_emergency'
      ? urgent ? 'medical_urgent' : 'medical_stable'
      : Object.prototype.hasOwnProperty.call(INSTRUCTIONS, type) ? type : 'other';
  const guidanceType = type === 'medical_emergency' ? 'medical' : type;

  return {
    id: `${guidanceType}-${severity}`,
    audience: 'dispatcher-read',
    title: urgent ? 'Immediate safety guidance' : 'Pre-arrival safety guidance',
    instructions: INSTRUCTIONS[instructionKey],
    caution: CAUTION,
  };
}
