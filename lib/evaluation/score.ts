import type {
  CaseEvaluation,
  EvaluationCase,
  EvaluationLanguage,
  EvaluationMetrics,
  EvaluationPrediction,
  EvaluationRun,
  MetricSlice,
} from './types.ts';

const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const;

const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

export function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

const normalize = (value: string): string => value.toLowerCase().trim();

function metricSlice(cases: CaseEvaluation[]): MetricSlice {
  const criticalCases = cases.filter((item) => item.expected.severity === 'critical');
  return {
    cases: cases.length,
    type_accuracy: ratio(cases.filter((item) => item.type_match).length, cases.length),
    severity_accuracy: ratio(cases.filter((item) => item.severity_match).length, cases.length),
    critical_recall: ratio(
      criticalCases.filter((item) => item.critical_true_positive).length,
      criticalCases.length,
    ),
  };
}

export function compareCase(
  evaluationCase: EvaluationCase,
  prediction: EvaluationPrediction,
): CaseEvaluation {
  const type_match = evaluationCase.expected.incident_type === prediction.incident_type;
  const severity_match = evaluationCase.expected.severity === prediction.severity;
  const critical_true_positive =
    evaluationCase.expected.severity === 'critical' && prediction.severity === 'critical';
  const critical_false_negative =
    evaluationCase.expected.severity === 'critical' && prediction.severity !== 'critical';
  const under_triage =
    SEVERITY_RANK[prediction.severity] < SEVERITY_RANK[evaluationCase.expected.severity];
  const over_triage =
    SEVERITY_RANK[prediction.severity] > SEVERITY_RANK[evaluationCase.expected.severity];
  const expectedTerms = evaluationCase.expected.expected_location_terms ?? [];
  const normalizedLocation = normalize(prediction.location_text ?? '');
  const missingLocationTerms = expectedTerms.filter((term) => !normalizedLocation.includes(normalize(term)));
  const location_match = evaluationCase.expected.location_required
    ? missingLocationTerms.length === 0
    : null;
  const expectedThreatTerms = evaluationCase.expected.required_threat_terms ?? [];
  const normalizedThreats = normalize((prediction.threat_text ?? []).join(' '));
  const missingThreatTerms = expectedThreatTerms.filter((term) => !normalizedThreats.includes(normalize(term)));
  const threat_match = expectedThreatTerms.length > 0 ? missingThreatTerms.length === 0 : null;
  const exceptions: string[] = [];

  if (!type_match) exceptions.push('type_mismatch');
  if (!severity_match) exceptions.push('severity_mismatch');
  if (critical_false_negative) exceptions.push('critical_false_negative');
  if (location_match === false) {
    exceptions.push(`missing_location_terms: ${missingLocationTerms.join(', ')}`);
  }
  if (threat_match === false) {
    exceptions.push(`missing_threat_terms: ${missingThreatTerms.join(', ')}`);
  }
  if (prediction.fell_back) exceptions.push('fallback');

  return {
    case_id: evaluationCase.id,
    split: evaluationCase.split,
    language: evaluationCase.language,
    tags: evaluationCase.tags,
    expected: evaluationCase.expected,
    predicted: prediction,
    type_match,
    severity_match,
    critical_true_positive,
    critical_false_negative,
    under_triage,
    over_triage,
    location_match,
    threat_match,
    exceptions,
  };
}

export function aggregateMetrics(cases: CaseEvaluation[]): EvaluationMetrics {
  const base = metricSlice(cases);
  const locationCases = cases.filter((item) => item.location_match !== null);
  const threatCases = cases.filter((item) => item.threat_match !== null);
  const byLanguage = (['en', 'hi', 'hinglish'] as EvaluationLanguage[]).reduce(
    (slices, language) => {
      slices[language] = metricSlice(cases.filter((item) => item.language === language));
      return slices;
    },
    {} as Record<EvaluationLanguage, MetricSlice>,
  );
  const method_counts = cases.reduce<Record<string, number>>((counts, item) => {
    counts[item.predicted.method] = (counts[item.predicted.method] ?? 0) + 1;
    return counts;
  }, {});

  return {
    ...base,
    critical_true_positives: cases.filter((item) => item.critical_true_positive).length,
    critical_false_negatives: cases.filter((item) => item.critical_false_negative).length,
    under_triage_count: cases.filter((item) => item.under_triage).length,
    under_triage_rate: ratio(cases.filter((item) => item.under_triage).length, cases.length),
    over_triage_count: cases.filter((item) => item.over_triage).length,
    over_triage_rate: ratio(cases.filter((item) => item.over_triage).length, cases.length),
    location_cases: locationCases.length,
    location_accuracy: ratio(
      locationCases.filter((item) => item.location_match === true).length,
      locationCases.length,
    ),
    threat_cases: threatCases.length,
    threat_accuracy: ratio(
      threatCases.filter((item) => item.threat_match === true).length,
      threatCases.length,
    ),
    latency_p50_ms: percentile(cases.map((item) => item.predicted.latency_ms), 0.5),
    latency_p95_ms: percentile(cases.map((item) => item.predicted.latency_ms), 0.95),
    fallback_count: cases.filter((item) => item.predicted.fell_back).length,
    method_counts,
    by_language: byLanguage,
  };
}

const display = (value: number | null): string => (value === null ? 'n/a' : value.toFixed(3));
const cell = (value: string | null): string => (value ?? '').replaceAll('|', '\\|');

export function formatMarkdownReport(run: EvaluationRun): string {
  const { metadata, metrics } = run;
  const metadataRows = [
    ['Benchmark version', metadata.benchmark_version],
    ['Split', metadata.split],
    ['Mode', metadata.mode],
    ['Evaluated at', metadata.evaluated_at],
    ['Provider', metadata.provider],
    ['Model', metadata.model],
    ['Commit', metadata.commit],
    ['Node version', metadata.node_version],
    ['Case count', String(metadata.case_count)],
    ['Model attempted', String(metadata.model_attempted)],
  ];
  const methodRows = Object.entries(metrics.method_counts).sort(([left], [right]) => left.localeCompare(right));
  const exceptionRows = run.cases.filter((item) => item.exceptions.length > 0);

  return [
    '# Evaluation Report',
    '',
    '## Metadata',
    '',
    '| Field | Value |',
    '| --- | --- |',
    ...metadataRows.map(([field, value]) => `| ${field} | ${cell(value)} |`),
    '',
    '## Primary metrics',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Cases | ${metrics.cases} |`,
    `| Type accuracy | ${display(metrics.type_accuracy)} |`,
    `| Severity accuracy | ${display(metrics.severity_accuracy)} |`,
    `| Critical recall | ${display(metrics.critical_recall)} |`,
    `| Critical true positives | ${metrics.critical_true_positives} |`,
    `| Critical false negatives | ${metrics.critical_false_negatives} |`,
    `| Under-triage | ${metrics.under_triage_count} (${display(metrics.under_triage_rate)}) |`,
    `| Over-triage | ${metrics.over_triage_count} (${display(metrics.over_triage_rate)}) |`,
    `| Location accuracy | ${display(metrics.location_accuracy)} (${metrics.location_cases} cases) |`,
    `| Threat accuracy | ${display(metrics.threat_accuracy)} (${metrics.threat_cases} cases) |`,
    `| Latency p50 (ms) | ${display(metrics.latency_p50_ms)} |`,
    `| Latency p95 (ms) | ${display(metrics.latency_p95_ms)} |`,
    `| Fallback count | ${metrics.fallback_count} |`,
    '',
    '## Language slices',
    '',
    '| Language | Cases | Type accuracy | Severity accuracy | Critical recall |',
    '| --- | --- | --- | --- | --- |',
    ...(['en', 'hi', 'hinglish'] as EvaluationLanguage[]).map((language) => {
      const slice = metrics.by_language[language];
      return `| ${language} | ${slice.cases} | ${display(slice.type_accuracy)} | ${display(slice.severity_accuracy)} | ${display(slice.critical_recall)} |`;
    }),
    '',
    '## Method counts',
    '',
    '| Method | Cases |',
    '| --- | --- |',
    ...methodRows.map(([method, count]) => `| ${cell(method)} | ${count} |`),
    '',
    '## Exceptions',
    '',
    '| Case ID | Exceptions |',
    '| --- | --- |',
    ...exceptionRows.map((item) => `| ${cell(item.case_id)} | ${cell(item.exceptions.join(', '))} |`),
  ].join('\n');
}
