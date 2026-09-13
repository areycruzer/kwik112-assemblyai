/**
 * Kwik 112 Type Definitions
 * Central type definitions for the emergency dispatch system
 */

// ============================================================================
// Call Types
// ============================================================================

export type CallStatus = 'active' | 'processing' | 'pending' | 'pending_approval' | 'triage' | 'incoming' | 'awaiting_approval' | 'dispatched' | 'en-route' | 'on_scene' | 'mitigating' | 'resolved' | 'completed' | 'closed';
export type CallTwilioStatus = 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'ended' | 'failed' | 'no-answer';
export type IncidentType = 'fire' | 'medical_emergency' | 'accident' | 'crime' | 'public_safety' | 'medical' | 'traffic' | 'utility' | 'other' | string;
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type CallerCondition = 'calm' | 'distressed' | 'injured' | 'panicked' | 'unclear';
export type PriorityCode = 'P1' | 'P2' | 'P3' | 'P4' | 'Code 3' | 'Code 2' | 'Code 1';

export interface Location {
  address?: string;
  cross_streets?: string[];
  landmarks?: string[];
  city?: string;
  state?: string;
  zip_code?: string;
  latitude?: number;
  longitude?: number;
  confidence?: number;
  accuracy_radius?: number;
  source?: 'gps' | 'network' | 'manual' | 'caller' | string;
}

// Removed: NetworkLocation interface - no longer using network-based location services

export interface EmergencyCall {
  id: string;
  caller_number: string;
  status: CallStatus;
  call_status: CallTwilioStatus;
  language?: string;
  
  // Twilio data
  twilio_call_sid?: string;
  twilio_recording_url?: string;
  call_duration?: number;
  
  // Location data
  caller_location?: Location;
  verified_location?: Location;
  location_confidence?: number;
  
  // Incident data
  incident_type?: IncidentType;
  incident_subtype?: string;
  chief_complaint?: string;
  severity?: Severity;
  severity_score?: number;
  
  // Emotion data
  top_emotion?: string;
  emotion_intensity?: number;
  caller_condition?: CallerCondition;
  emotion_data?: any[]; // Array of emotion frames from Hume
  
  // AI triage results
  ai_summary?: string;
  ai_confidence?: number;
  ai_triage?: {
    severity?: Severity;
    confidence?: number;
    summary?: string;
    incident_type?: IncidentType;
    priority_code?: PriorityCode;
    persons_involved?: number;
    flags?: string[];
    emotion_analysis?: {
      top_emotions?: Array<{ emotion: string; intensity: number }>;
      /** Measured 0–100 distress, or null when no prosody was captured. Zero is
       *  a real measurement (measured calm); null is a coverage gap. */
      distress_level?: number | null;
    };
  };
  ai_recommendation?: AIRecommendation | string;
  persons_involved?: number;
  immediate_threats?: string[];
  
  // GPT Analysis results
  labels?: string[]; // Emergency category labels (e.g., ["MEDICAL_EMERGENCY", "HIGH_PRIORITY"])
  flags?: string[]; // Critical flags (e.g., ["LIFE_THREATENING", "WEAPONS_INVOLVED"])
  recommended_units?: string[]; // Units to dispatch (e.g., ["Fire Engine 7", "Ambulance 12"])
  dispatch_plan?: DispatchPlan;
  operator_questions?: string[];
  safety_audit?: SafetyAudit;
  special_instructions?: string; // Special instructions for responders
  analysis?: any; // Full GPT analysis object
  
  // Transcript
  transcript?: any[];
  
  // Dispatch data
  dispatched_units?: string[];
  dispatch_time?: string;
  dispatcher_id?: string;
  priority_code?: PriorityCode;
  
  // Triage provenance
  /** True while a local-rules grade is awaiting model refinement. */
  refinable?: boolean;
  /** Set when refinement graded the call above the local rules. */
  model_escalated?: boolean;
  /** Names the engine that produced the current grade (human-readable, e.g.
   *  'keyword' or 'glm:glm-4.5-flash'). */
  triage_method?: string;
  /** Structured provenance for analytics: 'local' when keyword rules graded the
   *  call, 'model' when the language model did. Derived from `triage_method`
   *  so a 'model'-mode build that fell back to keyword rules reads as 'local'. */
  triage_engine?: 'local' | 'model';
  /** Where the prosody behind `distress_level` came from. 'measured' is a live
   *  Hume EVI reading; 'simulated' is a scripted demo curve. Absent (undefined)
   *  means no prosody at all — the same coverage gap that leaves
   *  `distress_level` null. Kept distinct so a scripted curve is never passed
   *  off as a live measurement. */
  prosody_source?: 'measured' | 'simulated';

  // Metadata
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

// ============================================================================
// AI Types
// ============================================================================

export interface AIRecommendation {
  action_type: 'dispatch_fire' | 'dispatch_police' | 'dispatch_ems' | 'dispatch_multiple' | 'escalate_to_supervisor' | 'request_more_info';
  primary_unit: string;
  support_units: string[];
  priority_code: PriorityCode;
  special_instructions: string;
  rationale: string;
  alternative_actions: string[];
  confidence: number;
  approval_required: boolean;
  estimated_response_time: string;
}

export interface AIExtraction {
  incident_type: IncidentType;
  incident_subtype: string;
  severity: Severity;
  location: Location;
  persons_involved: {
    count: number;
    injuries: boolean;
    descriptions: string[];
  };
  immediate_threats: string[];
  time_sensitive_factors: string[];
  vehicles_involved: string[];
  weapons_mentioned: string[];
  caller_condition: CallerCondition;
  summary: string;
  confidence_score: number;
  missing_critical_info: string[];
  recommended_questions: string[];
}

export interface DispatchPlan {
  priority_code: PriorityCode;
  units: Array<{
    service: 'ems' | 'fire' | 'police' | 'rescue' | 'civic';
    unit: string;
    reason: string;
  }>;
  eta_risk: 'high' | 'medium' | 'low';
  operator_confirmation_required: boolean;
}

export interface SafetyAudit {
  local_severity: Severity;
  model_severity: Severity;
  final_severity: Severity;
  local_score: number;
  model_score: number;
  final_score: number;
  downgrade_blocked: boolean;
  reason: string;
}

// ============================================================================
// Transcript & Emotion Types
// ============================================================================

export interface TranscriptSegment {
  id: string;
  call_id: string;
  speaker: 'user' | 'assistant';
  text: string;
  emotions?: EmotionData;
  top_emotion?: string;
  emotion_intensity?: number;
  timestamp: string;
  segment_order: number;
}

export interface EmotionData {
  [emotion: string]: number; // emotion name -> intensity (0-1)
}

export interface EmotionUpdate {
  id: string;
  call_id: string;
  timestamp: string;
  emotions: EmotionData;
  top_emotion: string;
  intensity: number;
  distress_level?: number;
  calm_level?: number;
  fear_level?: number;
  anger_level?: number;
}

// ============================================================================
// Hume EVI Types
// ============================================================================

export interface HumeConversation {
  id: string;
  call_id: string;
  hume_conversation_id: string;
  hume_config_id: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  message_count?: number;
  conversation_summary?: string;
  extracted_location?: string;
  extracted_emergency_type?: string;
  full_transcript?: any;
  created_at: string;
}

export interface HumeMessageEvent {
  type: 'evi:conversation:started' | 'evi:message:user' | 'evi:message:assistant' | 'evi:emotion:update' | 'evi:conversation:ended';
  conversationId?: string;
  text?: string;
  emotions?: EmotionData;
  topEmotion?: string;
  intensity?: number;
  timestamp: string;
  duration?: number;
  messageCount?: number;
  summary?: string;
  extractedData?: any;
  transcript?: any[];
}

export interface DispatchAction {
  id: string;
  call_id: string;
  dispatcher_id?: string;
  action_type: 'dispatch' | 'escalate' | 'request_info' | 'cancel' | 'override';
  units_dispatched: string[];
  priority_code?: PriorityCode;
  special_instructions?: string;
  approved_ai_recommendation: boolean;
  override_reason?: string;
  confidence_at_dispatch?: number;
  created_at: string;
  estimated_arrival?: string;
  actual_arrival?: string;
  outcome?: 'successful' | 'false_alarm' | 'duplicate' | 'escalated';
  outcome_notes?: string;
}

// ============================================================================
// UI Component Types
// ============================================================================

export interface MapMarker {
  id: string;
  position: [number, number]; // [lat, lng]
  severity: Severity;
  incident_type: IncidentType;
  title: string;
  address: string;
  time_elapsed: string;
  caller_number_last4: string;
  top_emotion?: string;
  emotion_intensity?: number;
  call: EmergencyCall;
}

export interface CallQueueFilter {
  severity?: Severity[];
  incident_type?: IncidentType[];
  status?: CallStatus[];
  search?: string;
}

export interface CallQueueSort {
  field: 'time' | 'severity' | 'distance' | 'emotion';
  direction: 'asc' | 'desc';
}

// ============================================================================
// Dashboard Stats Types
// ============================================================================

export interface DashboardStats {
  total_calls: number;
  critical_calls: number;
  active_calls: number;
  resolved_today: number;
  avg_response_time: number; // seconds
  avg_severity_score: number;
}


