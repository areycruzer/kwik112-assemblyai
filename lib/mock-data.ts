/**
 * Kwik 112 Mock Data
 * Sample emergency calls for demo and development
 */

import type { EmergencyCall, TranscriptSegment } from './types.ts';

/**
 * Mock emergency calls focusing on Delhi NCR coordinates
 * Provides deterministic incidents for map pin placement
 */
export const mockCalls: EmergencyCall[] = [
  {
    id: 'delhi-1',
    caller_number: '+919876543210',
    status: 'triage',
    call_status: 'in-progress',
    incident_type: 'fire',
    incident_subtype: 'apartment fire',
    severity: 'critical',
    severity_score: 95,
    caller_location: {
      address: 'Plot 92, Pocket C, Sector 16, Rohini, Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.7196,
      longitude: 77.1186,
      confidence: 0.92
    },
    top_emotion: 'distress',
    emotion_intensity: 0.87,
    caller_condition: 'panicked',
    ai_summary: 'High-rise apartment fire with two residents trapped on the fourth floor. Heavy smoke visible across Sector 16, Rohini.',
    ai_confidence: 0.94,
    persons_involved: 2,
    immediate_threats: ['active flames', 'trapped occupants', 'heavy smoke'],
    dispatch_plan: {
      priority_code: 'P1',
      eta_risk: 'high',
      operator_confirmation_required: true,
      units: [
        {
          service: 'fire',
          unit: 'Fire Engine',
          reason: 'Fire response: apartment fire, active flames, trapped occupants',
        },
        {
          service: 'rescue',
          unit: 'Rescue Ladder',
          reason: 'Rescue support for callers trapped above ground level',
        },
        {
          service: 'ems',
          unit: 'Advanced Life Support Ambulance',
          reason: 'Medical standby for smoke exposure and trapped occupants',
        },
      ],
    },
    operator_questions: [
      'Is anyone trapped inside or exposed to smoke?',
      'Which floor is the fire on right now?',
      'Are stairs or lifts blocked?',
      'Are you currently in a safe place?',
    ],
    safety_audit: {
      local_severity: 'critical',
      model_severity: 'critical',
      final_severity: 'critical',
      local_score: 90,
      model_score: 95,
      final_score: 95,
      downgrade_blocked: false,
      reason: 'Final severity accepted because it did not fall below the local safety floor.',
    },
    created_at: new Date(Date.now() - 30 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 10 * 1000).toISOString(),
    ai_recommendation: {
      action_type: 'dispatch_multiple',
      primary_unit: 'Fire Engine 7',
      support_units: ['Ladder Truck 3', 'Medic 12', 'Battalion Chief 2'],
      priority_code: 'Code 3',
      special_instructions: 'Active structure fire with trapped occupants. Request immediate response. Stage EMS for potential victims.',
      rationale: 'Critical life safety situation requiring immediate fire suppression and rescue operations.',
      alternative_actions: ['Request mutual aid if Engine 7 unavailable'],
      confidence: 0.96,
      approval_required: false,
      estimated_response_time: '3-4 minutes'
    }
  },
  {
    id: 'delhi-1b',
    caller_number: '+919810001112',
    status: 'active',
    call_status: 'in-progress',
    incident_type: 'fire',
    incident_subtype: 'apartment fire',
    severity: 'high',
    severity_score: 86,
    caller_location: {
      address: 'Sector 16 Market, Pocket C, Rohini, Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.7204,
      longitude: 77.1192,
      confidence: 0.84,
    },
    top_emotion: 'fear',
    emotion_intensity: 0.8,
    caller_condition: 'distressed',
    ai_summary: 'Rohini Sector 16 market ke paas apartment se heavy smoke aur flames dikh rahi hain; log balcony mein phanse hain.',
    ai_confidence: 0.88,
    persons_involved: 3,
    immediate_threats: ['heavy smoke', 'people on balcony'],
    created_at: new Date(Date.now() - 45 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 20 * 1000).toISOString(),
  },
  {
    id: 'delhi-2',
    caller_number: '+919812345678',
    status: 'active',
    call_status: 'in-progress',
    incident_type: 'accident',
    incident_subtype: 'multiple vehicle collision',
    severity: 'high',
    severity_score: 82,
    caller_location: {
      address: 'Outer Ring Road, Pitampura Metro Crossing, Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.7049,
      longitude: 77.1324,
      confidence: 0.89
    },
    top_emotion: 'concern',
    emotion_intensity: 0.75,
    caller_condition: 'distressed',
    ai_summary: 'Three-vehicle pileup blocking Outer Ring Road. One passenger unconscious, traffic backing up rapidly.',
    ai_confidence: 0.9,
    persons_involved: 4,
    immediate_threats: ['blocked roadway', 'potential fuel leak'],
    created_at: new Date(Date.now() - 90 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 40 * 1000).toISOString()
  },
  {
    id: 'delhi-3',
    caller_number: '+919711223344',
    status: 'dispatched',
    call_status: 'in-progress',
    incident_type: 'medical_emergency',
    incident_subtype: 'cardiac arrest',
    severity: 'critical',
    severity_score: 91,
    caller_location: {
      address: 'E-5, Shalimar Bagh West, Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.7124,
      longitude: 77.1621,
      confidence: 0.86
    },
    top_emotion: 'panic',
    emotion_intensity: 0.88,
    caller_condition: 'distressed',
    ai_summary: 'Elderly male collapsed during morning walk. Bystander initiated CPR near Shalimar Bagh Community Park.',
    ai_confidence: 0.93,
    persons_involved: 1,
    immediate_threats: ['cardiac arrest', 'crowd forming'],
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 50 * 1000).toISOString()
  },
  {
    id: 'delhi-4',
    caller_number: '+919900112233',
    status: 'on_scene',
    call_status: 'in-progress',
    incident_type: 'crime',
    incident_subtype: 'armed robbery',
    severity: 'high',
    severity_score: 78,
    caller_location: {
      address: 'Rithala Metro Station, Exit Gate 2, Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.7210,
      longitude: 77.1074,
      confidence: 0.84
    },
    top_emotion: 'fear',
    emotion_intensity: 0.81,
    caller_condition: 'distressed',
    ai_summary: 'Caller witnessed armed robbery outside Rithala metro station. Suspects fleeing towards Bhagwan Mahavir Marg.',
    ai_confidence: 0.88,
    persons_involved: 3,
    immediate_threats: ['armed suspects', 'crowd panic'],
    created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 80 * 1000).toISOString()
  },
  {
    id: 'delhi-5',
    caller_number: '+919922334455',
    status: 'resolved',
    call_status: 'completed',
    incident_type: 'public_safety',
    incident_subtype: 'gas leak',
    severity: 'medium',
    severity_score: 64,
    caller_location: {
      address: 'Pocket 4 Market, Sector 24, Rohini, Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.7302,
      longitude: 77.1061,
      confidence: 0.88
    },
    top_emotion: 'anxiety',
    emotion_intensity: 0.69,
    caller_condition: 'distressed',
    ai_summary: 'Strong smell of LPG near food stalls in Pocket 4 Market. Nearby shops being evacuated.',
    ai_confidence: 0.86,
    persons_involved: 10,
    immediate_threats: ['flammable vapors', 'crowd congestion'],
    created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString()
  },
  {
    id: 'delhi-6',
    caller_number: '+919845678901',
    status: 'active',
    call_status: 'in-progress',
    incident_type: 'medical_emergency',
    incident_subtype: 'breathing difficulty',
    severity: 'high',
    severity_score: 76,
    caller_location: {
      address: 'Connaught Place, Block A, Central Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.6315,
      longitude: 77.2167,
      confidence: 0.91
    },
    top_emotion: 'panic',
    emotion_intensity: 0.82,
    caller_condition: 'panicked',
    ai_summary: 'Young woman experiencing severe asthma attack in crowded shopping area. Unable to locate inhaler.',
    ai_confidence: 0.89,
    persons_involved: 1,
    immediate_threats: ['respiratory distress', 'crowd interference'],
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 55 * 1000).toISOString()
  },
  {
    id: 'delhi-7',
    caller_number: '+919765432109',
    status: 'dispatched',
    call_status: 'in-progress',
    incident_type: 'accident',
    incident_subtype: 'pedestrian hit',
    severity: 'critical',
    severity_score: 88,
    caller_location: {
      address: 'NH-44, Near Chhatarpur Temple, South Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.5065,
      longitude: 77.1750,
      confidence: 0.87
    },
    top_emotion: 'distress',
    emotion_intensity: 0.91,
    caller_condition: 'panicked',
    ai_summary: 'Pedestrian struck by speeding vehicle near Chhatarpur Temple. Victim bleeding heavily and unconscious.',
    ai_confidence: 0.92,
    persons_involved: 1,
    immediate_threats: ['severe bleeding', 'high-speed traffic', 'head injury'],
    created_at: new Date(Date.now() - 75 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 35 * 1000).toISOString()
  },
  {
    id: 'delhi-9',
    caller_number: '+919823456789',
    status: 'triage',
    call_status: 'in-progress',
    incident_type: 'fire',
    incident_subtype: 'commercial building fire',
    severity: 'critical',
    severity_score: 93,
    caller_location: {
      address: 'Bhagirath Palace Market, Chandni Chowk, Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.6562,
      longitude: 77.23,
      confidence: 0.90
    },
    top_emotion: 'panic',
    emotion_intensity: 0.89,
    caller_condition: 'panicked',
    ai_summary: 'Major fire outbreak in textile shop at Bhagirath Palace. Multiple shop owners trapped, heavy smoke spreading rapidly.',
    ai_confidence: 0.95,
    persons_involved: 8,
    immediate_threats: ['active flames', 'trapped occupants', 'structural collapse risk', 'toxic smoke'],
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 45 * 1000).toISOString()
  },
  {
    id: 'delhi-10',
    caller_number: '+919880123456',
    status: 'dispatched',
    call_status: 'in-progress',
    incident_type: 'accident',
    incident_subtype: 'bus accident',
    severity: 'critical',
    severity_score: 89,
    caller_location: {
      address: 'Anand Vihar ISBT, Road No. 56, Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.6469,
      longitude: 77.3157,
      confidence: 0.88
    },
    top_emotion: 'distress',
    emotion_intensity: 0.86,
    caller_condition: 'distressed',
    ai_summary: 'DTC bus overturned at Anand Vihar ISBT. Multiple passengers injured, children crying inside vehicle.',
    ai_confidence: 0.91,
    persons_involved: 35,
    immediate_threats: ['overturned vehicle', 'trapped passengers', 'fuel leak', 'traffic chaos'],
    created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
  },
  {
    id: 'delhi-11',
    caller_number: '+919830567890',
    status: 'on_scene',
    call_status: 'in-progress',
    incident_type: 'public_safety',
    incident_subtype: 'building collapse',
    severity: 'critical',
    severity_score: 97,
    caller_location: {
      address: 'Gali No. 12, Old Seelampur, North East Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.6742,
      longitude: 77.2673,
      confidence: 0.85
    },
    top_emotion: 'panic',
    emotion_intensity: 0.94,
    caller_condition: 'panicked',
    ai_summary: 'Partial collapse of old residential building in Old Seelampur. Multiple families trapped under debris, screams heard.',
    ai_confidence: 0.93,
    persons_involved: 15,
    immediate_threats: ['structural collapse', 'trapped victims', 'further collapse risk', 'dust inhalation'],
    created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 90 * 1000).toISOString()
  },
  {
    id: 'delhi-12',
    caller_number: '+919840234567',
    status: 'active',
    call_status: 'in-progress',
    incident_type: 'medical_emergency',
    incident_subtype: 'heatstroke',
    severity: 'high',
    severity_score: 79,
    caller_location: {
      address: 'India Gate Lawns, Kartavya Path, Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.6129,
      longitude: 77.2295,
      confidence: 0.89
    },
    top_emotion: 'concern',
    emotion_intensity: 0.74,
    caller_condition: 'distressed',
    ai_summary: 'Tourist collapsed on India Gate lawns due to heatstroke. High body temperature, disoriented and vomiting.',
    ai_confidence: 0.88,
    persons_involved: 1,
    immediate_threats: ['heat exhaustion', 'dehydration', 'crowd gathering'],
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 70 * 1000).toISOString()
  },
  {
    id: 'delhi-13',
    caller_number: '+919949876543',
    status: 'resolved',
    call_status: 'completed',
    incident_type: 'crime',
    incident_subtype: 'chain snatching',
    severity: 'medium',
    severity_score: 58,
    caller_location: {
      address: 'Nehru Place Market, Outer Ring Road, Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.5494,
      longitude: 77.2501,
      confidence: 0.86
    },
    top_emotion: 'fear',
    emotion_intensity: 0.68,
    caller_condition: 'distressed',
    ai_summary: 'Two men on a motorcycle snatched a gold chain from an elderly woman near Nehru Place Market. Suspects heading towards Outer Ring Road.',
    ai_confidence: 0.84,
    persons_involved: 3,
    immediate_threats: ['armed suspects on vehicle', 'injury to victim'],
    created_at: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 60 * 1000).toISOString()
  },
  {
    id: 'delhi-14',
    caller_number: '+919922567890',
    status: 'active',
    call_status: 'in-progress',
    incident_type: 'accident',
    incident_subtype: 'two-wheeler accident',
    severity: 'high',
    severity_score: 73,
    caller_location: {
      address: 'Ring Road, Near Moti Bagh Flyover, Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.5772,
      longitude: 77.1745,
      confidence: 0.87
    },
    top_emotion: 'concern',
    emotion_intensity: 0.71,
    caller_condition: 'distressed',
    ai_summary: 'Motorcycle collision with auto-rickshaw. Rider thrown off vehicle, visible head injury, bleeding from leg.',
    ai_confidence: 0.86,
    persons_involved: 2,
    immediate_threats: ['head trauma', 'active bleeding', 'traffic obstruction'],
    created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 90 * 1000).toISOString()
  },
  {
    id: 'delhi-8',
    caller_number: '+919811234567',
    status: 'dispatched',
    call_status: 'in-progress',
    incident_type: 'public_safety',
    incident_subtype: 'electric hazard',
    severity: 'high',
    severity_score: 81,
    caller_location: {
      address: 'Sarojini Nagar Market, Block C, South Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.5744,
      longitude: 77.1932,
      confidence: 0.90
    },
    top_emotion: 'anxiety',
    emotion_intensity: 0.78,
    caller_condition: 'distressed',
    ai_summary: 'Live electric wire fallen across main market street after transformer explosion. Sparking wire blocking pedestrian path.',
    ai_confidence: 0.89,
    persons_involved: 50,
    immediate_threats: ['live electrical wire', 'electrocution risk', 'dense crowd', 'fire hazard'],
    created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
  },
  {
    id: 'delhi-15',
    caller_number: '+919879123456',
    status: 'triage',
    call_status: 'in-progress',
    incident_type: 'medical_emergency',
    incident_subtype: 'allergic reaction',
    severity: 'critical',
    severity_score: 85,
    caller_location: {
      address: 'Lajpat Nagar Central Market, Near Food Stalls, Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.5677,
      longitude: 77.2433,
      confidence: 0.88
    },
    top_emotion: 'panic',
    emotion_intensity: 0.85,
    caller_condition: 'panicked',
    ai_summary: 'Child experiencing severe allergic reaction to food. Face swelling rapidly, difficulty breathing, turning pale.',
    ai_confidence: 0.91,
    persons_involved: 1,
    immediate_threats: ['anaphylaxis', 'airway obstruction', 'respiratory failure'],
    created_at: new Date(Date.now() - 80 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 1000).toISOString()
  },
  {
    id: 'delhi-16',
    caller_number: '+919829345678',
    status: 'on_scene',
    call_status: 'in-progress',
    incident_type: 'fire',
    incident_subtype: 'market fire',
    severity: 'high',
    severity_score: 80,
    caller_location: {
      address: 'Gandhi Nagar Cloth Market, Gali No. 4, Delhi',
      city: 'New Delhi',
      state: 'Delhi',
      latitude: 28.656,
      longitude: 77.276,
      confidence: 0.89
    },
    top_emotion: 'distress',
    emotion_intensity: 0.83,
    caller_condition: 'panicked',
    ai_summary: 'Fire started in jewelry shop spreading to adjacent stores. Narrow lanes making evacuation difficult, tourists trapped.',
    ai_confidence: 0.87,
    persons_involved: 20,
    immediate_threats: ['spreading fire', 'narrow escape routes', 'trapped shoppers', 'valuable inventory'],
    created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
  }
];

/**
 * Mock transcript for demo call
 */
export const mockTranscript: TranscriptSegment[] = [
  {
    id: 't1',
    call_id: 'delhi-1',
    speaker: 'assistant',
    text: 'This is emergency services. What is your emergency?',
    timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    segment_order: 1
  },
  {
    id: 't2',
    call_id: 'delhi-1',
    speaker: 'user',
    text: 'Oh my god! There is fire on the fourth floor in Sector 16 Rohini!',
    emotions: {
      distress: 0.92,
      fear: 0.88,
      panic: 0.85,
      anxiety: 0.78
    },
    top_emotion: 'distress',
    emotion_intensity: 0.92,
    timestamp: new Date(Date.now() - 119 * 1000).toISOString(),
    segment_order: 2
  },
  {
    id: 't3',
    call_id: '1',
    speaker: 'assistant',
    text: 'I understand this is very scary. I\'m here to help you. What is your exact location?',
    timestamp: new Date(Date.now() - 115 * 1000).toISOString(),
    segment_order: 3
  },
  {
    id: 't4',
    call_id: 'delhi-1',
    speaker: 'user',
    text: 'It is Plot 92 Pocket C Sector 16 Rohini, New Delhi! Please hurry!',
    emotions: {
      distress: 0.89,
      fear: 0.82,
      urgency: 0.90,
      panic: 0.80
    },
    top_emotion: 'urgency',
    emotion_intensity: 0.90,
    timestamp: new Date(Date.now() - 110 * 1000).toISOString(),
    segment_order: 4
  },
  {
    id: 't5',
    call_id: '1',
    speaker: 'assistant',
    text: 'Thank you. Are you safe right now? Are you outside the building?',
    timestamp: new Date(Date.now() - 105 * 1000).toISOString(),
    segment_order: 5
  },
  {
    id: 't6',
    call_id: 'delhi-1',
    speaker: 'user',
    text: 'Yes, we are outside but two neighbours are trapped inside with smoke everywhere!',
    emotions: {
      distress: 0.87,
      fear: 0.85,
      concern: 0.83,
      anxiety: 0.75
    },
    top_emotion: 'distress',
    emotion_intensity: 0.87,
    timestamp: new Date(Date.now() - 100 * 1000).toISOString(),
    segment_order: 6
  },
  {
    id: 't7',
    call_id: 'delhi-1',
    speaker: 'assistant',
    text: 'Units are heading to Plot 92 Pocket C Sector 16 Rohini right now. Stay outside and keep everyone away from the smoke.',
    timestamp: new Date(Date.now() - 95 * 1000).toISOString(),
    segment_order: 7
  }
];

/**
 * Get formatted time elapsed string
 */
export function getTimeElapsed(timestamp: string): string {
  const parsed = new Date(timestamp).getTime();
  // An unparseable/missing timestamp yields NaN; render an em-dash rather than
  // "NaN hrs ago".
  if (Number.isNaN(parsed)) return '—';
  const diff = Date.now() - parsed;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'Abhi abhi';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hr ago';
  return `${hours} hrs ago`;
}

/**
 * Get severity color class
 */
export function getSeverityColor(severity?: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500 text-white';
    case 'high':
      return 'bg-orange-500 text-white';
    case 'medium':
      return 'bg-yellow-500 text-black';
    case 'low':
      return 'bg-green-500 text-white';
    default:
      return 'bg-gray-500 text-white';
  }
}

/**
 * Get emotion emoji
 */
export function getEmotionEmoji(emotion?: string): string {
  switch (emotion?.toLowerCase()) {
    case 'distress':
    case 'panic':
      return '😰';
    case 'fear':
      return '😨';
    case 'anxiety':
    case 'concern':
      return '😟';
    case 'anger':
    case 'frustration':
      return '😠';
    case 'calm':
      return '😌';
    default:
      return '😐';
  }
}
