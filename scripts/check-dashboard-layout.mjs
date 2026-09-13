import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function findBrowserBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.EDGE_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/microsoft-edge',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return 'google-chrome';
}

// Point the check at a running dev/prod server. Defaults to the conventional
// port, but a worktree or CI run often serves elsewhere, so allow an override.
const DASHBOARD_URL =
  process.env.DASHBOARD_URL || 'http://127.0.0.1:3000/dashboard';

const browserPath = findBrowserBinary();
const debugPort = 9333;
const profilePath = await mkdtemp(join(tmpdir(), 'kwik112-layout-'));

const browser = spawn(
  browserPath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

let browserErrorOutput = '';
browser.stderr.on('data', (chunk) => {
  browserErrorOutput += chunk.toString();
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getDebugTarget() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page;
    } catch {
      // Browser has not opened its debugging port yet.
    }
    await delay(100);
  }
  throw new Error(`Could not connect to headless browser: ${browserErrorOutput.trim()}`);
}

const target = await getDebugTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextCommandId = 1;
const pendingCommands = new Map();

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const command = pendingCommands.get(message.id);
  if (!command) return;
  pendingCommands.delete(message.id);
  if (message.error) command.reject(new Error(message.error.message));
  else command.resolve(message.result);
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

function send(method, params = {}) {
  const id = nextCommandId;
  nextCommandId += 1;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pendingCommands.set(id, { resolve, reject }));
}

async function inspectViewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: DASHBOARD_URL });
  await delay(2500);

  const evaluation = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const header = document.querySelector('body > div > header');
      const primary = header?.children[0];
      const actions = header?.children[1];
      const secondary = header?.nextElementSibling;
      if (!header || !primary || !actions || !secondary) {
        return { error: 'Dashboard chrome landmarks are missing' };
      }

      const headerRect = header.getBoundingClientRect();
      const primaryRect = primary.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const secondaryRect = secondary.getBoundingClientRect();
      const visible = (rect) => rect.width > 0 && rect.height > 0;

      return {
        headerOverflow: header.scrollWidth > header.clientWidth + 1,
        secondaryOverflow: secondary.scrollWidth > secondary.clientWidth + 1,
        horizontalCollision:
          visible(primaryRect) && visible(actionsRect) && primaryRect.right > actionsRect.left + 1,
        verticalClipping:
          primaryRect.top < headerRect.top - 1 ||
          primaryRect.bottom > headerRect.bottom + 1 ||
          actionsRect.top < headerRect.top - 1 ||
          actionsRect.bottom > headerRect.bottom + 1,
        headerHeight: Math.round(headerRect.height),
        secondaryHeight: Math.round(secondaryRect.height),
      };
    })()`,
  });

  const liveCallEvaluation = await send('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `(async () => {
      window.dispatchEvent(new CustomEvent('kwik-live-call', { detail: {
        version: 1,
        state: 'update',
        callId: 'layout-check',
        at: new Date().toISOString(),
        transcript: [
          { role: 'assistant', text: 'What is your exact location?', timestamp: new Date().toISOString() },
          { role: 'user', text: 'Sample Metro Gate 1, public entrance.', timestamp: new Date().toISOString() },
        ],
        detectedLanguage: 'hi',
        prosodySource: 'simulated',
        grade: {
          incidentType: 'medical_emergency', incidentSubtype: 'cardiac event',
          severity: 'critical', severityScore: 100, priorityCode: 'P1',
          location: { address: 'Sample Metro Gate 1' }, summary: 'Caller reports no pulse.',
          method: 'keyword',
        },
      }}));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const strip = document.querySelector('[aria-label="Live 112 call"]');
      const body = strip?.nextElementSibling;
      if (!strip || !body) return { error: 'Live call strip landmarks are missing' };
      const stripRect = strip.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      return {
        stripOverflow: strip.scrollWidth > strip.clientWidth + 1,
        stripWidth: Math.round(stripRect.width),
        bodyStartsAfterStrip: bodyRect.top >= stripRect.bottom - 1,
      };
    })()`,
  });

  return { ...evaluation.result.value, ...liveCallEvaluation.result.value };
}

try {
  for (const viewport of [
    { width: 1918, height: 916 },
    { width: 1536, height: 900 },
    { width: 1280, height: 800 },
    { width: 768, height: 900 },
    { width: 375, height: 844 },
  ]) {
    const result = await inspectViewport(viewport.width, viewport.height);
    if (result.error) throw new Error(result.error);
    if (result.headerOverflow || result.secondaryOverflow || result.horizontalCollision || result.verticalClipping || result.stripOverflow || !result.bodyStartsAfterStrip) {
      throw new Error(`${viewport.width}px layout failed: ${JSON.stringify(result)}`);
    }
    console.log(`${viewport.width}px layout passed: ${JSON.stringify(result)}`);
  }
} finally {
  await send('Browser.close').catch(() => undefined);
  await new Promise((resolve) => {
    if (browser.exitCode !== null) resolve();
    else browser.once('exit', resolve);
  });
  socket.close();
  await rm(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
