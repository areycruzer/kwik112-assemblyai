import assert from 'node:assert/strict';
import test from 'node:test';

import * as voiceLaunch from './voice-launch.ts';

const { shouldAutoLaunchVoiceStation, VOICE_STATION_HREF } = voiceLaunch;

test('landing voice-station URL carries an explicit launch intent', () => {
  const url = new URL(VOICE_STATION_HREF, 'https://example.test');

  assert.equal(shouldAutoLaunchVoiceStation(url.search, url.hash), true);
});

test('voice station opens from either the launch query or canonical hash', () => {
  assert.equal(shouldAutoLaunchVoiceStation('?startCall=1', ''), true);
  assert.equal(shouldAutoLaunchVoiceStation('', '#voice-station'), true);
  assert.equal(shouldAutoLaunchVoiceStation('?startCall=0', '#monitoring'), false);
  assert.equal(shouldAutoLaunchVoiceStation('?unrelated=1', ''), false);
});

test('live calls receive a short bootstrap and a complete emergency pre-intake prompt', () => {
  const buildConnectSettings = (
    voiceLaunch as typeof voiceLaunch & {
      emergencyVoiceConnectSettings?: () => { type?: string; systemPrompt: string };
    }
  ).emergencyVoiceConnectSettings;
  const buildSessionSettings = (
    voiceLaunch as typeof voiceLaunch & {
      emergencyVoiceSessionSettings?: () => { type?: string; systemPrompt: string };
    }
  ).emergencyVoiceSessionSettings;

  assert.equal(typeof buildConnectSettings, 'function');
  assert.equal(typeof buildSessionSettings, 'function');

  const connectSettings = buildConnectSettings!();
  const sessionSettings = buildSessionSettings!();
  const bootstrap = connectSettings.systemPrompt;
  const prompt = sessionSettings.systemPrompt;

  assert.equal(connectSettings.type, 'session_settings');
  assert.equal(sessionSettings.type, 'session_settings');
  assert.ok(bootstrap.length <= 1000, 'connection bootstrap must stay within Hume’s limit');
  assert.match(bootstrap, /calm emergency voice operator/i);
  assert.match(prompt, /calm 112 emergency operator/i);
  assert.match(prompt, /listen/i);
  assert.match(prompt, /one question at a time/i);
  assert.match(prompt, /emergency type/i);
  assert.match(prompt, /exact location/i);
  assert.match(prompt, /injur/i);
  assert.match(prompt, /conscious|consciousness/i);
  assert.match(prompt, /breathing/i);
  assert.match(prompt, /severe bleeding/i);
  assert.match(prompt, /never give advice/i);
  assert.match(prompt, /Help is on the way/i);
  assert.match(prompt, /language and emotion/i);
  assert.match(prompt, /Hindi|Hinglish/i);
  assert.match(prompt, /never invent[\s\S]*ETA/i);
});

test('station auto-opens once per session, never for returning operators', async () => {
  const { shouldAutoOpenStationOnce } = await import('./voice-launch.ts');
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  // First visit in a fresh session: opens, and marks the session.
  assert.equal(shouldAutoOpenStationOnce(storage), true);
  // Every later navigation in the same session: never again.
  assert.equal(shouldAutoOpenStationOnce(storage), false);
  assert.equal(shouldAutoOpenStationOnce(storage), false);
  // Unavailable storage (SSR, blocked): never auto-open.
  assert.equal(shouldAutoOpenStationOnce(null), false);
  assert.equal(shouldAutoOpenStationOnce(undefined), false);
});
