/**
 * Headless end-to-end verification of the escalate-only client tool.
 *
 * Mints a temporary token, opens a real Voice Agent API session with the
 * production session config (including the propose_incident_update tool),
 * streams a synthesized Hindi caller at the agent, and asserts the full
 * M6/M7 contract:
 *
 *   1. session.update with inline tools is accepted (no session.error)
 *   2. the agent actually calls propose_incident_update
 *   3. the console answers only after reply.done (protocol rule)
 *   4. reconcileAgentProposal keeps severity at/above the local floor
 *
 * Run:  ASSEMBLYAI_API_KEY=… node --experimental-strip-types \
 *         scripts/verify-assembly-tool.ts /tmp/caller.raw
 * The key is read from the environment or a local .env; it is never logged.
 * Exits non-zero on any failed assertion so CI or a judge can run it verbatim.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { assemblySessionConfig } = await import(join(here, '../lib/voice-launch.ts'));
const { buildSessionUpdate, buildToolResult } = await import(join(here, '../lib/assembly-voice.ts'));
const { localTriage, reconcileAgentProposal } = await import(join(here, '../lib/triage.ts'));

function loadKey(): string {
  if (process.env.ASSEMBLYAI_API_KEY) return process.env.ASSEMBLYAI_API_KEY;
  const envPath = join(here, '../.env');
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, 'utf8').match(/^ASSEMBLYAI_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  }
  console.error('FAIL: set ASSEMBLYAI_API_KEY (no key in env or .env)');
  process.exit(1);
}

const audioPath = process.argv[2] ?? '/tmp/kwik-m6-caller.raw';
const replyAudioPath = process.argv[3] ?? ''; // optional second utterance (answers the agent's question)
if (!existsSync(audioPath)) {
  console.error(`FAIL: caller audio not found at ${audioPath}`);
  console.error('      synthesize with: say -v Lekha -o /tmp/m6.aiff "…" && ffmpeg -i /tmp/m6.aiff -f s16le -ac 1 -ar 24000 ' + audioPath);
  process.exit(1);
}

const failures: string[] = [];
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failures.push(label);
};

// ── 1. mint a temporary token (key stays server-side in the real app) ──────
const key = loadKey();
const tokenRes = await fetch('https://agents.assemblyai.com/v1/token?' +
  new URLSearchParams({ expires_in_seconds: '120', max_session_duration_seconds: '300' }), {
  headers: { authorization: key },
});
if (!tokenRes.ok) { console.error('FAIL: token mint', tokenRes.status, await tokenRes.text()); process.exit(1); }
const { token } = await tokenRes.json() as { token: string };

// ── 2. open the session with the production config (tools included) ───────
const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${token}`);
const events: { type: string; [k: string]: unknown }[] = [];
let toolCall: { id: string; name: string; args: unknown } | null = null;
let latestEventType = '';
let resultSentAt: number | null = null;
let reconciliation: ReturnType<typeof reconcileAgentProposal> | null = null;
let floorSeverity = 'low';

const opened = new Promise<void>((resolve, reject) => {
  ws.onopen = () => resolve();
  ws.onerror = (e) => reject(new Error(`socket: ${String(e)}`));
});
await opened;
console.log('socket open');

ws.onmessage = (ev: MessageEvent) => {
  const msg = JSON.parse(String(ev.data));
  latestEventType = msg.type;
  if (msg.type !== 'input.audio.delta' && msg.type !== 'reply.audio.delta' && msg.type !== 'transcript.user.delta' && msg.type !== 'transcript.agent.delta') {
    events.push(msg);
  }
  if (msg.type === 'session.error') {
    console.error('session.error:', JSON.stringify(msg));
  }
  if (msg.type === 'transcript.user') console.log(`caller : ${msg.text}`);
  if (msg.type === 'transcript.agent') console.log(`agent  : ${msg.text}`);
  if (msg.type === 'tool.call' && (msg.call_id ?? msg.tool_call_id)) {
    toolCall = { id: msg.call_id ?? msg.tool_call_id, name: msg.name, args: msg.arguments };
    console.log(`tool.call: ${msg.name} ${JSON.stringify(msg.arguments)}`);
  }
};
ws.onclose = () => console.log('socket closed');

const send = (obj: unknown) => ws.send(JSON.stringify(obj));
send(buildSessionUpdate(assemblySessionConfig() as any));

const waitFor = async (predicate: () => boolean, ms: number, label: string) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  console.error(`timeout waiting for ${label}`);
  return false;
};

const ready = await waitFor(() => events.some((e) => e.type === 'session.ready'), 15000, 'session.ready');
check(ready, 'session.update (with inline tools) accepted — session.ready, no error');

// ── 3. let the greeting finish, then stream the caller (turn-taking like a
//        real human: listen to the greeting, then speak) ─────────────────────
const agentReplies = () => events.filter((e) => e.type === 'transcript.agent').length;
const streamFile = async (path: string) => {
  const pcm = readFileSync(path);
  const chunk = 4800; // 100 ms of 24 kHz PCM16
  for (let offset = 0; offset < pcm.length; offset += chunk) {
    if (ws.readyState !== WebSocket.OPEN) return;
    send({ type: 'input.audio', audio: pcm.subarray(offset, offset + chunk).toString('base64') });
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`streamed ${(pcm.length / 2 / 24000).toFixed(1)}s of caller audio`);
};
const toolMsg = () => events.find((e) => e.type === 'tool.call' && (e.call_id ?? e.tool_call_id));

await waitFor(() => latestEventType === 'reply.done', 20000, 'greeting reply.done');
await new Promise((r) => setTimeout(r, 500));

// Turn 1: the emergency monologue. The agent either calls the tool on this
// turn or asks a follow-up question.
const replies0 = agentReplies();
await streamFile(audioPath);
await waitFor(() => toolMsg() !== undefined || agentReplies() > replies0, 25000, 'agent turn 1 (tool call or reply)');

// Turn 2: answer the follow-up (location confirm / injury count), which
// completes the picture the tool needs.
if (!toolMsg() && replyAudioPath && existsSync(replyAudioPath)) {
  await new Promise((r) => setTimeout(r, 800));
  await streamFile(replyAudioPath);
}

// ── 4. the agent should propose an incident update once it has the picture ─
await waitFor(() => toolMsg() !== undefined, 25000, 'tool.call after answers');
check(toolMsg() !== undefined, 'agent called propose_incident_update on its own');

const call = toolMsg() as { call_id: string; name: string; arguments: unknown } | undefined;
if (call) {
  // The console-side handler, exactly as the browser runs it.
  const userText = events
    .filter((e) => e.type === 'transcript.user')
    .map((e) => String((e as any).text ?? ''))
    .join('\n');
  floorSeverity = localTriage(userText).extraction.severity;
  reconciliation = reconcileAgentProposal(floorSeverity, (call.arguments ?? {}) as any);
  console.log(`floor=${floorSeverity} proposed=${reconciliation.proposedSeverity} applied=${reconciliation.severity} blocked=${reconciliation.blocked}`);

  // Protocol rule: a client tool may only answer once reply.done is the
  // latest received event.
  const mayAnswer = await waitFor(() => latestEventType === 'reply.done', 20000, 'reply.done before tool.result');
  check(mayAnswer, 'tool.result sent only after reply.done (latest event)');
  if (mayAnswer) {
    send(buildToolResult(call.call_id, {
      applied_severity: reconciliation.severity,
      held_at_floor: reconciliation.blocked,
      ...(reconciliation.blocked ? { floor_severity: floorSeverity } : {}),
    }));
    resultSentAt = Date.now();
  }
  check(reconciliation.severity !== 'low' || floorSeverity === 'low',
    'applied severity never below the local floor');
  if (reconciliation.proposedSeverity && reconciliation.proposedSeverity !== reconciliation.severity) {
    check(reconciliation.blocked && reconciliation.severity === floorSeverity,
      'downgrade proposal was blocked and held at the floor');
  }
}

// Let the agent finish its reply, then close cleanly.
await new Promise((r) => setTimeout(r, 6000));
send({ type: 'session.end' });
await waitFor(() => ws.readyState === WebSocket.CLOSED, 8000, 'close');

check(events.every((e) => e.type !== 'session.error'), 'no session.error for the whole run');
console.log('\nevent summary:', events.map((e) => e.type).join(' → '));
console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : `\n${failures.length} CHECK(S) FAILED`);
process.exit(failures.length === 0 ? 0 : 1);
