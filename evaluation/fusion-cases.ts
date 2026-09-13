import type { FusionEvaluationCase } from '../lib/evaluation/fusion.ts';
import type { EmergencyCall, IncidentType } from '../lib/types.ts';

type Event = { type: IncidentType; place: string; clue: string };

const START = Date.parse('2026-09-05T10:00:00.000Z');

function call(
  id: string,
  event: Event,
  minute: number,
  latitude: number,
  longitude: number,
  alternateReport = false,
): EmergencyCall {
  const createdAt = new Date(START + minute * 60_000).toISOString();
  return {
    id,
    caller_number: `synthetic-${id}`,
    status: 'active',
    call_status: 'in-progress',
    incident_type: event.type,
    severity: 'high',
    severity_score: 82,
    ai_summary: alternateReport
      ? `Caller reports ${event.clue} near ${event.place}`
      : `${event.clue} reported at ${event.place}`,
    caller_location: { address: event.place, latitude, longitude, confidence: 0.85 },
    created_at: createdAt,
    updated_at: createdAt,
  };
}

const duplicates: Event[] = [
  { type: 'fire', place: 'Lajpat Nagar Central Market', clue: 'garment showroom smoke' },
  { type: 'accident', place: 'ITO Tilak Bridge', clue: 'blue bus collision' },
  { type: 'medical_emergency', place: 'Rajiv Chowk Gate Six', clue: 'unconscious commuter' },
  { type: 'crime', place: 'Karol Bagh Ajmal Khan Road', clue: 'jewellery shop robbery' },
  { type: 'public_safety', place: 'Yamuna Bank Metro', clue: 'fallen electric cable' },
  { type: 'fire', place: 'Rohini Sector Eleven', clue: 'balcony cylinder blast' },
  { type: 'accident', place: 'Dhaula Kuan Flyover', clue: 'white cab overturned' },
  { type: 'medical_emergency', place: 'Kashmere Gate Platform Four', clue: 'elderly passenger collapsed' },
  { type: 'crime', place: 'Saket Select City Walk', clue: 'knife assault' },
  { type: 'public_safety', place: 'Nehru Place Tower B', clue: 'lift passengers trapped' },
  { type: 'fire', place: 'Okhla Phase Two Warehouse', clue: 'chemical drum flames' },
  { type: 'accident', place: 'Moolchand Underpass', clue: 'motorcycle truck crash' },
  { type: 'medical_emergency', place: 'AIIMS Gate Two', clue: 'child breathing difficulty' },
  { type: 'crime', place: 'Janakpuri District Centre', clue: 'armed cash snatching' },
  { type: 'public_safety', place: 'Mayur Vihar Pocket One', clue: 'building wall collapse' },
  { type: 'fire', place: 'Chandni Chowk Dariba Lane', clue: 'textile store blaze' },
  { type: 'accident', place: 'Punjabi Bagh Ring Road', clue: 'school van collision' },
  { type: 'medical_emergency', place: 'New Delhi Railway Station', clue: 'platform cardiac arrest' },
  { type: 'crime', place: 'Vasant Kunj Block D', clue: 'apartment break in' },
  { type: 'public_safety', place: 'Dwarka Sector Ten', clue: 'open gas pipeline leak' },
];

const separate: Array<[Event, Event]> = [
  [{ type: 'fire', place: 'Okhla Shed Alpha', clue: 'plastic drums burning' }, { type: 'fire', place: 'Kalkaji House Zulu', clue: 'kitchen chimney smoking' }],
  [{ type: 'accident', place: 'Ashram Point', clue: 'orange auto crash' }, { type: 'accident', place: 'Nizamuddin Turn', clue: 'silver scooter crash' }],
  [{ type: 'medical_emergency', place: 'Clinic Maple', clue: 'adult seizure' }, { type: 'medical_emergency', place: 'School Cedar', clue: 'student fainted' }],
  [{ type: 'crime', place: 'Lane Quartz', clue: 'phone snatching' }, { type: 'crime', place: 'Colony Amber', clue: 'home burglary' }],
  [{ type: 'public_safety', place: 'Tower Indigo', clue: 'broken balcony railing' }, { type: 'public_safety', place: 'Park Saffron', clue: 'uncovered drain' }],
  [{ type: 'fire', place: 'Factory Nimbus', clue: 'generator sparks' }, { type: 'fire', place: 'Hostel Coral', clue: 'mattress smoking' }],
  [{ type: 'accident', place: 'Crossing Falcon', clue: 'delivery cycle hit' }, { type: 'accident', place: 'Junction Lotus', clue: 'tractor tyre burst' }],
  [{ type: 'medical_emergency', place: 'Temple Onyx', clue: 'visitor choking' }, { type: 'medical_emergency', place: 'Office Pearl', clue: 'worker dizzy' }],
  [{ type: 'crime', place: 'Arcade Copper', clue: 'wallet theft' }, { type: 'crime', place: 'Residency Silver', clue: 'vehicle vandalism' }],
  [{ type: 'public_safety', place: 'Alley Comet', clue: 'tree branch hanging' }, { type: 'public_safety', place: 'Plaza Orchid', clue: 'glass panel loose' }],
];

const duplicateCases: FusionEvaluationCase[] = duplicates.map((event, index) => ({
  id: `duplicate-${String(index + 1).padStart(2, '0')}`,
  expected_link: true,
  calls: [
    call(`dup-${index}-a`, event, index * 2, 28.61, 77.21),
    call(`dup-${index}-b`, event, index * 2 + 2, 28.6108, 77.2107, true),
  ],
}));

const separateCases: FusionEvaluationCase[] = separate.map(([first, second], index) => ({
  id: `nearby-separate-${String(index + 1).padStart(2, '0')}`,
  expected_link: false,
  calls: [
    call(`sep-${index}-a`, first, index, 28.62, 77.22),
    call(`sep-${index}-b`, second, index + 1, 28.6203, 77.2203),
  ],
}));

const boundaryCases: FusionEvaluationCase[] = Array.from({ length: 10 }, (_, index) => {
  const event: Event = {
    type: index % 2 === 0 ? 'fire' : 'accident',
    place: `Boundary Landmark ${index}`,
    clue: `distinct witness marker ${index}`,
  };
  const outsideDistance = index < 5;
  return {
    id: `boundary-negative-${String(index + 1).padStart(2, '0')}`,
    expected_link: false,
    calls: [
      call(`bound-${index}-a`, event, 0, 28.63, 77.23),
      call(
        `bound-${index}-b`,
        event,
        outsideDistance ? 2 : 11,
        outsideDistance ? 28.64 : 28.6302,
        outsideDistance ? 77.24 : 77.2302,
        true,
      ),
    ],
  };
});

export const fusionCases: FusionEvaluationCase[] = [
  ...duplicateCases,
  ...separateCases,
  ...boundaryCases,
];
