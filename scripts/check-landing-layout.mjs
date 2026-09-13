import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const candidates = [
  process.env.CHROME_BIN,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const browserPath = candidates.find(existsSync);
if (!browserPath) throw new Error("Chrome or Edge is required for the landing layout check.");

const url = process.env.LANDING_URL || "http://127.0.0.1:3000";
const debugPort = 9334;
const profilePath = await mkdtemp(join(tmpdir(), "kwik112-landing-"));
const outputPath = join(process.cwd(), "artifacts", "landing");
await mkdir(outputPath, { recursive: true });

const browser = spawn(browserPath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-allow-origins=*",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profilePath}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let browserErrors = "";
browser.stderr.on("data", (chunk) => { browserErrors += chunk.toString(); });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getTarget() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch {}
    await delay(100);
  }
  throw new Error(`Could not connect to browser: ${browserErrors.trim()}`);
}

const target = await getTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let commandId = 1;
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const command = pending.get(message.id);
  if (!command) return;
  pending.delete(message.id);
  if (message.error) command.reject(new Error(message.error.message));
  else command.resolve(message.result);
});
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = commandId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function inspect(width, height, name) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await send("Page.navigate", { url });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await send("Runtime.evaluate", {
      returnByValue: true,
      expression: "document.readyState === 'complete' && Boolean(document.querySelector('main > section h1'))",
    });
    if (ready.result.value) break;
    if (attempt === 39) throw new Error(`${name} did not finish rendering ${url}`);
    await delay(150);
  }
  const result = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const sections = [...document.querySelectorAll('main > section')];
      const hero = sections[0]?.getBoundingClientRect();
      const heading = document.querySelector('h1')?.getBoundingClientRect();
      const buttons = [...document.querySelectorAll('a')].filter((a) => a.textContent?.toLowerCase().includes('demo call'));
      const clipped = [...document.querySelectorAll('main *')].filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.right > document.documentElement.clientWidth + 1;
      }).length;
      return {
        sections: sections.length,
        h1Visible: Boolean(heading && heading.width && heading.height),
        heroHeight: Math.round(hero?.height || 0),
        demoCallLinks: buttons.length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        clippedElements: clipped,
      };
    })()`,
  });
  const values = result.result.value;
  if (values.sections !== 5 || !values.h1Visible || values.heroHeight < height * 0.8 || values.demoCallLinks < 2 || values.horizontalOverflow || values.clippedElements) {
    throw new Error(`${name} layout failed: ${JSON.stringify(values)}`);
  }
  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(outputPath, `${name}.png`), Buffer.from(screenshot.data, "base64"));
  if (name.startsWith("desktop")) {
    const metrics = await send("Page.getLayoutMetrics");
    const { width: contentWidth, height: contentHeight } = metrics.cssContentSize;
    const fullScreenshot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: contentWidth, height: contentHeight, scale: 1 },
    });
    await writeFile(join(outputPath, `${name}-full.png`), Buffer.from(fullScreenshot.data, "base64"));
  }
  console.log(`${name} layout passed: ${JSON.stringify(values)}`);
}

try {
  await inspect(1440, 1000, "desktop-1440x1000");
  await inspect(390, 844, "mobile-390x844");
} finally {
  await send("Browser.close").catch(() => undefined);
  await new Promise((resolve) => browser.exitCode !== null ? resolve() : browser.once("exit", resolve));
  socket.close();
  await rm(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
