import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractJsonObject, resolveLlm } from './llm.ts';

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  const keys = ['GLM_API_KEY', 'OPENAI_API_KEY', 'ASSEMBLYAI_API_KEY', 'LLM_PROVIDER', 'ASSEMBLYAI_LLM_MODEL'];
  for (const k of keys) { saved[k] = process.env[k]; }
  for (const k of keys) { delete process.env[k]; }
  try {
    for (const [k, v] of Object.entries(env)) { if (v !== undefined) process.env[k] = v; }
    fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
  }
}

test('extractJsonObject: plain object', () => {
  assert.deepEqual(extractJsonObject('{"a":1}'), { a: 1 });
});

test('extractJsonObject: fenced json block', () => {
  assert.deepEqual(extractJsonObject('```json\n{"a": 2}\n```'), { a: 2 });
});

test('extractJsonObject: prose-wrapped object', () => {
  assert.deepEqual(extractJsonObject('Here is the result: {"severity":"critical"} done.'), { severity: 'critical' });
});

test('extractJsonObject: garbage returns null, never throws', () => {
  assert.equal(extractJsonObject('no json here'), null);
  assert.equal(extractJsonObject('{"broken":'), null);
});

test('resolveLlm: forced assemblyai uses the gateway with jsonMode off', () => {
  withEnv({ ASSEMBLYAI_API_KEY: 'k', GLM_API_KEY: 'g', LLM_PROVIDER: 'assemblyai' }, () => {
    const cfg = resolveLlm();
    assert.equal(cfg.provider, 'assemblyai');
    assert.equal(cfg.model, 'qwen3.5-4b-32k-fast');
    assert.equal(cfg.jsonMode, false);
    assert.ok(cfg.client);
  });
});

test('resolveLlm: auto still prefers GLM when both keys exist', () => {
  withEnv({ ASSEMBLYAI_API_KEY: 'k', GLM_API_KEY: 'g' }, () => {
    assert.equal(resolveLlm().provider, 'glm');
  });
});

test('resolveLlm: assemblyai is the auto fallback when it is the only key', () => {
  withEnv({ ASSEMBLYAI_API_KEY: 'k' }, () => {
    assert.equal(resolveLlm().provider, 'assemblyai');
  });
});

test('resolveLlm: ASSEMBLYAI_LLM_MODEL overrides the default', () => {
  withEnv({ ASSEMBLYAI_API_KEY: 'k', ASSEMBLYAI_LLM_MODEL: 'other-model' }, () => {
    assert.equal(resolveLlm().model, 'other-model');
  });
});

test('token route: fail-closed without a key, key never leaves the server', () => {
  const src = readFileSync('app/api/assemblyai/token/route.ts', 'utf8');
  assert.match(src, /503/);
  assert.match(src, /ASSEMBLYAI_API_KEY/);
  assert.ok(!/return NextResponse\.json\(\{[^}]*apiKey/.test(src));
});
