import type { AIExtraction, Severity } from '../types.ts';

export type EvaluationLanguage = 'en' | 'hi' | 'hinglish';
export type EvaluationTag =
  | 'critical'
  | 'non_emergency'
  | 'missing_location'
  | 'ambiguous_location'
  | 'noisy_transcript'
  | 'prompt_injection'
  | 'calm_critical';

export interface EvaluationCase {
  id: string;
  split: 'development' | 'held_out';
  language: EvaluationLanguage;
  tags: EvaluationTag[];
  transcript: string;
  expected: {
    incident_type: AIExtraction['incident_type'];
    severity: Severity;
    location_required: boolean;
    expected_location_terms?: string[];
    required_threat_terms?: string[];
  };
}

export interface EvaluationCorpus {
  version: string;
  synthetic: true;
  cases: EvaluationCase[];
}

export interface EvaluationPrediction {
  incident_type: AIExtraction['incident_type'];
  severity: Severity;
  location_text?: string;
  threat_text?: string[];
  method: string;
  latency_ms: number;
  fell_back: boolean;
}

export interface CaseEvaluation {
  case_id: string;
  split: EvaluationCase['split'];
  language: EvaluationLanguage;
  tags: EvaluationTag[];
  expected: EvaluationCase['expected'];
  predicted: EvaluationPrediction;
  type_match: boolean;
  severity_match: boolean;
  critical_true_positive: boolean;
  critical_false_negative: boolean;
  under_triage: boolean;
  over_triage: boolean;
  location_match: boolean | null;
  threat_match: boolean | null;
  exceptions: string[];
}

export interface MetricSlice {
  cases: number;
  type_accuracy: number | null;
  severity_accuracy: number | null;
  critical_recall: number | null;
}

export interface EvaluationMetrics extends MetricSlice {
  critical_true_positives: number;
  critical_false_negatives: number;
  under_triage_count: number;
  under_triage_rate: number | null;
  over_triage_count: number;
  over_triage_rate: number | null;
  location_cases: number;
  location_accuracy: number | null;
  threat_cases: number;
  threat_accuracy: number | null;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  fallback_count: number;
  method_counts: Record<string, number>;
  by_language: Record<EvaluationLanguage, MetricSlice>;
}

export interface EvaluationRun {
  metadata: {
    benchmark_version: string;
    split: 'development' | 'held_out' | 'all';
    mode: 'local' | 'hybrid';
    evaluated_at: string;
    provider: string;
    model: string | null;
    commit: string | null;
    node_version: string;
    case_count: number;
    model_attempted: boolean;
  };
  metrics: EvaluationMetrics;
  cases: CaseEvaluation[];
}
