import { readFile } from 'node:fs/promises';
import type { EvaluationCase, EvaluationCorpus } from './types.ts';

const SPLITS = new Set(['development', 'held_out']);
const LANGUAGES = new Set(['en', 'hi', 'hinglish']);
const TAGS = new Set([
  'critical', 'non_emergency', 'missing_location', 'ambiguous_location',
  'noisy_transcript', 'prompt_injection', 'calm_critical',
]);
const INCIDENT_TYPES = new Set(['fire', 'medical_emergency', 'crime', 'accident', 'public_safety']);
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

type UnknownRecord = Record<string, unknown>;

const fail = (message: string): never => { throw new Error(`Invalid evaluation corpus: ${message}`); };
const record = (value: unknown, label: string): UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as UnknownRecord;
};
const string = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string`);
  return value as string;
};
const allowed = (value: unknown, values: Set<string>, label: string): string => {
  const item = string(value, label);
  if (!values.has(item)) fail(`${label} is not allowed`);
  return item;
};
const strings = (value: unknown, label: string, required = false): string[] | undefined => {
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value) || (required && value.length === 0)) fail(`${label} must be a non-empty string array`);
  return (value as unknown[]).map((item, index) => string(item, `${label}[${index}]`));
};

export function validateCorpus(value: unknown, options: { enforceMinimums?: boolean } = {}): EvaluationCorpus {
  const corpus = record(value, 'corpus');
  const version = string(corpus.version, 'version');
  if (corpus.synthetic !== true) fail('synthetic must be true');
  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) fail('cases must be a non-empty array');
  const rawCases = corpus.cases as unknown[];

  const ids = new Set<string>();
  const cases = rawCases.map((value, index): EvaluationCase => {
    const item = record(value, `cases[${index}]`);
    const id = string(item.id, `cases[${index}].id`);
    if (ids.has(id)) fail(`duplicate id ${id}`);
    ids.add(id);

    const tagsValue = item.tags;
    if (!Array.isArray(tagsValue)) fail(`cases[${index}].tags must be an array`);
    const tags = (tagsValue as unknown[]).map((tag, tagIndex) => allowed(tag, TAGS, `cases[${index}].tags[${tagIndex}]`)) as EvaluationCase['tags'];
    const expected = record(item.expected, `cases[${index}].expected`);
    if (typeof expected.location_required !== 'boolean') fail(`cases[${index}].expected.location_required must be boolean`);
    const locationRequired = expected.location_required as boolean;
    const locationTerms = strings(expected.expected_location_terms, `cases[${index}].expected.expected_location_terms`, locationRequired);
    const threatTerms = strings(expected.required_threat_terms, `cases[${index}].expected.required_threat_terms`);

    return {
      id,
      split: allowed(item.split, SPLITS, `cases[${index}].split`) as EvaluationCase['split'],
      language: allowed(item.language, LANGUAGES, `cases[${index}].language`) as EvaluationCase['language'],
      tags,
      transcript: string(item.transcript, `cases[${index}].transcript`),
      expected: {
        incident_type: allowed(expected.incident_type, INCIDENT_TYPES, `cases[${index}].expected.incident_type`),
        severity: allowed(expected.severity, SEVERITIES, `cases[${index}].expected.severity`) as EvaluationCase['expected']['severity'],
        location_required: locationRequired,
        ...(locationTerms ? { expected_location_terms: locationTerms } : {}),
        ...(threatTerms ? { required_threat_terms: threatTerms } : {}),
      },
    };
  });

  if (options.enforceMinimums) {
    const heldOut = cases.filter((item) => item.split === 'held_out').length;
    if (cases.length < 60) fail('must contain at least 60 cases');
    if (heldOut < 30) fail('must contain at least 30 held_out cases');
  }
  return { version, synthetic: true, cases };
}

export async function loadCorpus(path: string): Promise<EvaluationCorpus> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  return validateCorpus(parsed, { enforceMinimums: true });
}
