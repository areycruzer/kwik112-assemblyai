import { findFusionSuggestions } from '../incident-fusion.ts';
import type { EmergencyCall } from '../types.ts';

export interface FusionEvaluationCase {
  id: string;
  expected_link: boolean;
  calls: [EmergencyCall, EmergencyCall];
}

export interface FusionCaseResult {
  id: string;
  expected_link: boolean;
  predicted_link: boolean;
  confidence: number | null;
}

export interface FusionEvaluationResult {
  metrics: {
    cases: number;
    true_positives: number;
    false_positives: number;
    true_negatives: number;
    false_negatives: number;
    precision: number | null;
    recall: number | null;
    false_link_rate: number | null;
    missed_link_rate: number | null;
    duplicate_dispatches_preventable: number;
  };
  cases: FusionCaseResult[];
}

const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

export function evaluateFusionCases(cases: readonly FusionEvaluationCase[]): FusionEvaluationResult {
  const ids = new Set<string>();
  const results = cases.map((evaluationCase) => {
    if (!evaluationCase || typeof evaluationCase.id !== 'string' || evaluationCase.id.trim() === '') {
      throw new Error('Fusion evaluation case id must be a non-empty string');
    }
    if (ids.has(evaluationCase.id)) throw new Error(`Duplicate fusion evaluation case id: ${evaluationCase.id}`);
    ids.add(evaluationCase.id);
    if (typeof evaluationCase.expected_link !== 'boolean') {
      throw new Error(`Fusion evaluation case ${evaluationCase.id} must have expected_link`);
    }
    if (!Array.isArray(evaluationCase.calls) || evaluationCase.calls.length !== 2) {
      throw new Error(`Fusion evaluation case ${evaluationCase.id} must contain exactly two calls`);
    }
    if (evaluationCase.calls[0].id === evaluationCase.calls[1].id) {
      throw new Error(`Fusion evaluation case ${evaluationCase.id} must contain distinct call ids`);
    }

    const suggestion = findFusionSuggestions(evaluationCase.calls)[0];
    return {
      id: evaluationCase.id,
      expected_link: evaluationCase.expected_link,
      predicted_link: Boolean(suggestion),
      confidence: suggestion?.confidence ?? null,
    };
  });

  const truePositives = results.filter((item) => item.expected_link && item.predicted_link).length;
  const falsePositives = results.filter((item) => !item.expected_link && item.predicted_link).length;
  const trueNegatives = results.filter((item) => !item.expected_link && !item.predicted_link).length;
  const falseNegatives = results.filter((item) => item.expected_link && !item.predicted_link).length;

  return {
    metrics: {
      cases: results.length,
      true_positives: truePositives,
      false_positives: falsePositives,
      true_negatives: trueNegatives,
      false_negatives: falseNegatives,
      precision: ratio(truePositives, truePositives + falsePositives),
      recall: ratio(truePositives, truePositives + falseNegatives),
      false_link_rate: ratio(falsePositives, falsePositives + trueNegatives),
      missed_link_rate: ratio(falseNegatives, truePositives + falseNegatives),
      duplicate_dispatches_preventable: truePositives,
    },
    cases: results,
  };
}
