import type { EmergencyCall } from './types.ts';

const DELHI_NAME = /\b(?:new\s+delhi|delhi)\b/i;
const DELHI_LOCALITY = /\b(?:moolchand|bhagirath\s+palace|chandni\s+chowk|shalimar\s+bagh)\b/i;

/** Keep this single-city console limited to incidents inside Delhi. */
export function isDelhiIncident(call: EmergencyCall): boolean {
  const location = call.caller_location;
  if (!location) return false;

  if (location.state?.trim()) return DELHI_NAME.test(location.state);
  if (location.city?.trim()) return DELHI_NAME.test(location.city);
  if (
    location.address?.trim() &&
    (DELHI_NAME.test(location.address) || DELHI_LOCALITY.test(location.address))
  ) {
    return true;
  }

  const { latitude, longitude } = location;
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    latitude >= 28.4 &&
    latitude <= 28.9 &&
    longitude >= 76.8 &&
    longitude <= 77.35
  );
}

export function filterDelhiIncidents(calls: readonly EmergencyCall[]): EmergencyCall[] {
  return calls.filter(isDelhiIncident);
}

export function scopedIncidentSelection(
  currentId: string | null,
  calls: readonly EmergencyCall[],
): string | null {
  if (currentId && calls.some((call) => call.id === currentId)) return currentId;
  return calls[0]?.id ?? null;
}
