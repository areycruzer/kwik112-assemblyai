import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  type ReducerState,
  buildSessionUpdate,
  buildToolResult,
  bytesToBase64,
  floatToPcm16,
  reduceAgentEvent,
  resampleLinear,
  ToolResultQueue,
} from './assembly-voice.ts';

test('floatToPcm16 clamps to the int16 range', () => {
  const pcm = floatToPcm16([0, 0.5, -0.5, 2, -2]);
  assert.equal(pcm[0], 0);
  assert.equal(pcm[1], 16383); // 0.5 * 0x7fff truncates toward zero
  assert.equal(pcm[2], -16384);
  assert.equal(pcm[3], 32767);
  assert.equal(pcm[4], -32768);
});

test('resampleLinear halves length at a 2:1 ratio and preserves level', () => {
  const out = resampleLinear([0, 0.5, 1, 0.5, 0, 0.5], 48_000, 24_000);
  assert.equal(out.length, 3);
  // positions 0, 2, 4 of the input land on exact samples
  assert.ok(Math.abs(out[0]) < 1e-6);
  assert.ok(Math.abs(out[1] - 1) < 1e-6);
  assert.ok(Math.abs(out[2]) < 1e-6);
});

test('resampleLinear is identity when rates match', () => {
  const out = resampleLinear([1, 2, 3], 24_000, 24_000);
  assert.deepEqual(Array.from(out), [1, 2, 3]);
});

test('bytesToBase64 round-trips', () => {
  const bytes = new Uint8Array([104, 105, 33]);
  const b64 = bytesToBase64(bytes);
  assert.equal(Buffer.from(b64, 'base64').toString(), 'hi!');
});

test('buildSessionUpdate: inline config shape', () => {
  const msg = buildSessionUpdate({
    system_prompt: 'You are a demo call-taker.',
    greeting: 'Hello',
    voice: 'anna',
    keyterms: ['saans', 'Shalimar Bagh'],
    tools: [
      {
        type: 'function',
        function: { name: 'propose_incident_update', description: 'x', parameters: { type: 'object' } },
      },
    ],
  });
  assert.equal(msg.type, 'session.update');
  assert.equal(msg.session.system_prompt, 'You are a demo call-taker.');
  assert.equal(msg.session.greeting, 'Hello');
  assert.deepEqual(msg.session.output, { voice: 'anna' });
  assert.deepEqual(msg.session.input, { keyterms: ['saans', 'Shalimar Bagh'] });
  assert.equal((msg.session.tools as unknown[]).length, 1);
});

test('reducer: user partial replaces, user final commits', () => {
  let s: ReducerState = { lastEventType: null, agentText: '' };
  const p = reduceAgentEvent(s, { type: 'transcript.user.delta', text: 'meri mummy' });
  assert.equal(p.action?.kind, 'user_partial');
  assert.equal((p.action as any).text, 'meri mummy');
  const f = reduceAgentEvent(p.state, { type: 'transcript.user', text: 'meri mummy ko saans nahi aa rahi' });
  assert.equal(f.action?.kind, 'user_final');
});

test('reducer: agent deltas append within a reply and reset on new reply_id', () => {
  let s: ReducerState = { lastEventType: null, agentText: '' };
  s = reduceAgentEvent(s, { type: 'transcript.agent.delta', delta: 'Okay.', reply_id: 'r1' }).state;
  const mid = reduceAgentEvent(s, { type: 'transcript.agent.delta', delta: 'Where', reply_id: 'r1' });
  assert.equal((mid.action as any).text, 'Okay. Where');
  const fresh = reduceAgentEvent(mid.state, { type: 'transcript.agent.delta', delta: 'Stay', reply_id: 'r2' });
  assert.equal((fresh.action as any).text, 'Stay');
});

test('reducer: barge-in, audio, done, tool call, ended, error', () => {
  const base: ReducerState = { lastEventType: null, agentText: '' };
  assert.equal(reduceAgentEvent(base, { type: 'input.speech.started' }).action?.kind, 'barge_in');
  assert.equal(reduceAgentEvent(base, { type: 'reply.audio', data: 'QQ==' }).action?.kind, 'agent_audio');
  assert.equal(reduceAgentEvent(base, { type: 'reply.done', status: 'interrupted' }).action?.kind, 'reply_done');
  const tc = reduceAgentEvent(base, { type: 'tool.call', tool_call_id: 't1', name: 'n', arguments: { a: 1 } });
  assert.equal(tc.action?.kind, 'tool_call');
  assert.equal((tc.action as any).toolCallId, 't1');
  assert.equal(reduceAgentEvent(base, { type: 'session.ended' }).action?.kind, 'ended');
  const err = reduceAgentEvent(base, { type: 'session.error', code: 'x', message: 'boom' });
  assert.equal((err.action as any).message, 'boom');
});

test('tool result queue: results flush only when reply.done is the latest event', () => {
  const q = new ToolResultQueue();
  q.observe('tool.call');
  q.push('t1', { recorded: true });
  assert.equal(q.size, 1);
  // An unrelated event after the push blocks the flush…
  q.observe('transcript.user');
  assert.deepEqual(q.observe('reply.done'), [{ tool_call_id: 't1', output: { recorded: true } }]);
  assert.equal(q.size, 0);
  // …and a result pushed after reply.done waits for the next one.
  q.push('t2', 42);
  assert.deepEqual(q.observe('transcript.agent'), []);
  assert.equal(q.size, 1);
});

test('buildToolResult shape', () => {
  assert.deepEqual(buildToolResult('t1', { ok: true }), {
    type: 'tool.result',
    tool_call_id: 't1',
    output: { ok: true },
  });
});
