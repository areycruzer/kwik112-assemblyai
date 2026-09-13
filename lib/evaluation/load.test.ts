import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCorpus } from './load.ts';

const validCase = {
  id: 'dev-en-fire-01', split: 'development', language: 'en', tags: ['critical'],
  transcript: 'There is a fire and two people are trapped at 17 Park Road.',
  expected: { incident_type: 'fire', severity: 'critical', location_required: true,
    expected_location_terms: ['17 park road'] },
};

test('accepts a valid synthetic corpus', () => {
  const corpus = validateCorpus({
    version: '1.0.0',
    synthetic: true,
    cases: [validCase],
  });
  assert.equal(corpus.cases.length, 1);
});

test('rejects duplicate ids and non-synthetic data', () => {
  const item = {
    id: 'same', split: 'held_out', language: 'en', tags: [], transcript: 'Noise complaint.',
    expected: { incident_type: 'public_safety', severity: 'low', location_required: false },
  };
  assert.throws(() => validateCorpus({ version: '1', synthetic: false, cases: [item, item] }));
});

test('rejects malformed values and missing location terms', () => {
  for (const corpus of [
    { version: '', synthetic: true, cases: [validCase] },
    { version: '1', synthetic: true, cases: [] },
    { version: '1', synthetic: true, cases: [{ ...validCase, split: 'test' }] },
    { version: '1', synthetic: true, cases: [{ ...validCase, language: 'ta' }] },
    { version: '1', synthetic: true, cases: [{ ...validCase, tags: ['unknown'] }] },
    { version: '1', synthetic: true, cases: [{ ...validCase, expected: { ...validCase.expected, incident_type: 'other' } }] },
    { version: '1', synthetic: true, cases: [{ ...validCase, expected: { ...validCase.expected, severity: 'urgent' } }] },
    { version: '1', synthetic: true, cases: [{ ...validCase, transcript: '  ' }] },
    { version: '1', synthetic: true, cases: [{ ...validCase, expected: { ...validCase.expected, expected_location_terms: [] } }] },
  ]) assert.throws(() => validateCorpus(corpus));
});

test('enforces the full held-out corpus minimums only when requested', () => {
  assert.equal(validateCorpus({ version: '1', synthetic: true, cases: [validCase] }).cases.length, 1);
  assert.throws(() => validateCorpus({ version: '1', synthetic: true, cases: [validCase] }, { enforceMinimums: true }));
});
