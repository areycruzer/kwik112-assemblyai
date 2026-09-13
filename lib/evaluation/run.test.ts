import test from 'node:test';
import assert from 'node:assert/strict';
import { runEvaluation } from './run.ts';
import type { EvaluationCorpus } from './types.ts';

const corpus: EvaluationCorpus = {
  version: 'test', synthetic: true,
  cases: [{
    id: 'held-critical', split: 'held_out', language: 'en', tags: ['critical'],
    transcript: 'No pulse at Test Metro Gate 1.',
    expected: { incident_type: 'medical_emergency', severity: 'critical',
      location_required: true, expected_location_terms: ['test metro', 'gate 1'] },
  }],
};

test('local mode never calls the model dependency', async () => {
  let modelCalls = 0;
  const run = await runEvaluation({ corpus, split: 'held_out', mode: 'local',
    now: () => 100, commit: async () => null,
    local: () => ({ method: 'keyword', labels: [], flags: [], extraction: {
      incident_type: 'medical_emergency', incident_subtype: 'cardiac event', severity: 'critical',
      location: { address: 'Test Metro Gate 1', confidence: 0.9 },
      persons_involved: { count: 1, injuries: true, descriptions: [] }, immediate_threats: ['No pulse'],
      time_sensitive_factors: [], vehicles_involved: [], weapons_mentioned: [],
      caller_condition: 'unclear', summary: 'No pulse.', confidence_score: 0.8,
      missing_critical_info: [],
      recommended_questions: [],
    }}),
    hybrid: async () => { modelCalls += 1; throw new Error('must not run'); },
  });
  assert.equal(modelCalls, 0);
  assert.equal(run.metrics.critical_recall, 1);
});

test('hybrid mode records keyword return as fallback without aborting', async () => {
  const localResult = {
    method: 'keyword', labels: [], flags: [], extraction: {
      incident_type: 'medical_emergency' as const, incident_subtype: 'cardiac event',
      severity: 'critical' as const, location: { confidence: 0 },
      persons_involved: { count: 1, injuries: true, descriptions: [] }, immediate_threats: ['No pulse'],
      time_sensitive_factors: [], vehicles_involved: [], weapons_mentioned: [],
      caller_condition: 'unclear' as const, summary: 'No pulse.', confidence_score: 0.45,
      missing_critical_info: [],
      recommended_questions: [],
    },
  };
  const run = await runEvaluation({ corpus, split: 'held_out', mode: 'hybrid',
    now: (() => { let value = 0; return () => value += 5; })(), commit: async () => null,
    local: () => localResult, hybrid: async () => localResult,
  });
  assert.equal(run.metrics.fallback_count, 1);
  assert.equal(run.cases[0].predicted.fell_back, true);
});

test('hybrid failure falls back to local triage without aborting', async () => {
  const localResult = {
    method: 'keyword', labels: [], flags: [], extraction: {
      incident_type: 'medical_emergency' as const, incident_subtype: 'cardiac event',
      severity: 'critical' as const, location: { city: 'Test Metro' },
      persons_involved: { count: 1, injuries: true, descriptions: [] }, immediate_threats: ['No pulse'],
      time_sensitive_factors: [], vehicles_involved: [], weapons_mentioned: [],
      caller_condition: 'unclear' as const, summary: 'No pulse.', confidence_score: 0.45,
      missing_critical_info: [], recommended_questions: [],
    },
  };
  const run = await runEvaluation({ corpus, split: 'held_out', mode: 'hybrid',
    commit: async () => null, local: () => localResult,
    hybrid: async () => { throw new Error('provider unavailable'); },
  });
  assert.equal(run.metrics.fallback_count, 1);
  assert.equal(run.cases[0].predicted.fell_back, true);
  assert.equal(run.cases[0].predicted.location_text, 'Test Metro');
});

test('hybrid timeout falls back to the local prediction without aborting', async () => {
  const localResult = {
    method: 'keyword', labels: [], flags: [], extraction: {
      incident_type: 'medical_emergency' as const, incident_subtype: 'cardiac event',
      severity: 'critical' as const, location: { address: 'Test Metro Gate 1', confidence: 0.9 },
      persons_involved: { count: 1, injuries: true, descriptions: [] }, immediate_threats: ['No pulse'],
      time_sensitive_factors: [], vehicles_involved: [], weapons_mentioned: [],
      caller_condition: 'unclear' as const, summary: 'No pulse.', confidence_score: 0.8,
      missing_critical_info: [], recommended_questions: [],
    },
  };
  const run = await runEvaluation({ corpus, split: 'held_out', mode: 'hybrid',
    commit: async () => null, local: () => localResult,
    hybrid: async () => { throw new Error('timeout after 1ms'); },
  });
  assert.equal(run.metrics.fallback_count, 1);
  assert.equal(run.cases[0].predicted.fell_back, true);
  assert.equal(run.cases[0].predicted.incident_type, 'medical_emergency');
  assert.equal(run.cases[0].predicted.severity, 'critical');
  assert.equal(run.cases[0].predicted.location_text, 'Test Metro Gate 1');
});
