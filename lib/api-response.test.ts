import assert from 'node:assert/strict';
import test from 'node:test';

import { readApiJson } from './api-response.ts';

test('readApiJson replaces a non-JSON server failure with an actionable error', async () => {
  const response = new Response('Internal Server Error', {
    status: 500,
    headers: { 'Content-Type': 'text/plain' },
  });

  await assert.rejects(
    readApiJson(response, 'Call triage'),
    /Call triage is temporarily unavailable \(500\)\. Please try again\./,
  );
});

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import * as triage from './triage.ts';
import * as demo from './demo.ts';
import { JUDGE_CALLER_PRESETS } from './personas.ts';

// Run the real builder without Next's alias resolver or an external model.
function callBuilder() {
  const source = ts.transpileModule(readFileSync('app/api/calls/_buildCall.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: any = {};
  new Function('require', 'exports', source)((id: string) => {
    if (id === '@/lib/triage') return { ...triage, triageTranscript: async (text: string) => triage.localTriage(text) };
    if (id === '@/lib/demo') return demo;
    throw new Error(`Unexpected builder dependency: ${id}`);
  }, exports);
  return exports.buildCall;
}

test('local call assembly never contacts a remote geocoder for named or missing locations', async () => {
  const buildCall = callBuilder(); const previousFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response('[]', { status: 200 }); };
  try {
    await buildCall({ phoneNumber: 'test', transcript: 'A person has no pulse.' }, 'local');
    await buildCall({ phoneNumber: 'test', transcript: 'A person has no pulse near Unlisted Example Market.' }, 'local');
    assert.equal(requests, 0);
  } finally { globalThis.fetch = previousFetch; }
});

test('model-mode call assembly skips geocoding unknown-location placeholders', async () => {
  const buildCall = callBuilder(); const previousFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response('[]', { status: 200 }); };
  try {
    const call = await buildCall({ phoneNumber: 'test', transcript: 'A person has no pulse.' }, 'model');
    assert.equal(requests, 0); assert.equal(call.caller_location.latitude, undefined);
  } finally { globalThis.fetch = previousFetch; }
});

test('golden scripted callers have approximate offline neighborhood locations', async () => {
  const buildCall = callBuilder(); const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Network unavailable'); };
  try {
    for (const preset of JUDGE_CALLER_PRESETS) {
      const call = await buildCall({ phoneNumber: 'test', transcript: preset.lines, prosodySource: 'simulated' }, 'local');
      assert.ok(Number.isFinite(call.caller_location.latitude), preset.id);
      assert.ok(Number.isFinite(call.caller_location.longitude), preset.id);
      assert.ok(call.caller_location.accuracy_radius >= 1200, 'neighborhood uncertainty must remain visible');
      assert.ok(call.caller_location.confidence <= 0.75, 'not a precise gate or GPS fix');
      assert.equal(call.caller_location.source, 'caller');
    }
  } finally { globalThis.fetch = previousFetch; }
});
