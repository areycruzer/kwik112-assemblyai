# Kwik 112 UI Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dispatch console's visual system and information architecture with the real Kwik 112 design language — neutral grey surfaces, vivid signal colour, a satellite basemap, labelled triangle markers, and floating draggable modules — reframe the product as Kwik 112 with Kwik 112 as its emotion-aware voice intake layer, and stop triage blocking on the model.

**Architecture:** A design-token layer plus four self-contained pure modules (symbology, alerts, timeline, distress) that carry unit tests, consumed by React components that are verified in a browser. Triage splits into an instant local-rules `create` and an enriching `refine`, merged client-side.

**Tech Stack:** Next.js 15.5.4 (App Router, Turbopack), React 19, TypeScript 5, Tailwind v4, Leaflet 1.9, Hume EVI (`@humeai/voice-react` 0.2.7), GLM via the OpenAI-compatible client, `node --test` for unit tests.

**Source spec:** `docs/superpowers/specs/2026-08-29-kwik-112-ui-revamp-design.md`

## Global Constraints

- Surface tokens, verbatim: `--ground #1E1E1E`, `--panel #2D2D2D`, `--panel-raised #373636`, `--rule #3B3B3B`, `--rule-strong #4B4B4B`, `--deep #171717`.
- Text tokens, verbatim: `--ink #F2F2F2`, `--ink-2 #B0B0B0`, `--ink-3 #9F9F9F`, `--ink-4 #808080`.
- Signal tokens, verbatim — vivid on purpose, and the only saturated colour on screen: `--accent #69D2FF`, `--accent-dim #49B5E2`, `--accent-bright #13E3FF`, `--safe #47FF85`, `--mild #FABC1F`, `--mild-dim #C0931F`, `--critical #F40000`, `--critical-bright #FF4E4E`, `--critical-soft #FF859B`, `--critical-bg #611717`.
- Severity maps to three named levels: CRITICAL `#F40000`, MILD `#FABC1F`, SAFE `#47FF85`. The four-priority model maps on: P1 → CRITICAL, P2 → MILD, P3/P4 → SAFE.
- Type scale is exactly 10, 11, 12, 14, 16, 20, 28px. No other font sizes anywhere.
- Typeface is **Inter** with a system fallback stack. There is no monospace anywhere.
- Border radius: panels 6px; chips and status pills fully rounded (999px); buttons and inputs 4px. Borders 1px. Spacing on a 4px grid.
- **No `box-shadow` glow and no `backdrop-filter` anywhere in `app/` or `components/`.**
- `font-variant-numeric: tabular-nums` on every figure in a column or updating in place.
- Every interactive element has a visible focus state: 2px `--accent` outline, 2px offset.
- Branding: product is `KWIK 112`; `KWIK 112` badges the voice intake only.
- Distress renders `—` when a call carries no prosody. Never invent a value.
- The triage source badge always names the engine that graded the call.
- All text interpolated into an SVG or HTML string passes through `escapeHtml` from `lib/utils.ts`.
- Pure modules under `lib/` are self-contained: they define their own input interfaces and import nothing from other project files, so `node --test` can run them without a resolver.
- Unit tests import with an explicit `.ts` extension (enabled by `allowImportingTsExtensions` in Task 1).

## How to read this plan

Tasks 1–6 and 19 carry **complete code and complete tests** — these are the logic and configuration where precision matters.

Tasks 7–18 are React UI. They specify exact files, exact prop interfaces, the token and class rules to apply, and **browser verification steps**, with full code for the non-obvious parts (symbol rendering, optimistic merge, alert derivation display). Routine JSX composition is specified by contract rather than transcribed line by line — the interfaces are exact, so the implementer cannot drift.

Where a task says "verify in browser", the workflow is: `npm run build`, start the preview server, drive it, and check the stated condition. Do not mark the task done on a passing build alone.

---

## Phase A — Foundation (Tasks 1–5)

### Task 1: Test harness and design tokens

**Files:**
- Modify: `tsconfig.json`
- Modify: `package.json`
- Rewrite: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties listed in Global Constraints, available to every component. `npm test` runs `node --test "lib/**/*.test.ts"`.

- [ ] **Step 1: Enable `.ts` extension imports so tests can resolve modules**

In `tsconfig.json`, add one line inside `compilerOptions`, after `"resolveJsonModule": true,`:

```json
    "allowImportingTsExtensions": true,
```

- [ ] **Step 2: Add the test script**

In `package.json`, replace the `scripts` block with:

```json
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build --turbopack",
    "start": "next start",
    "test": "node --test \"lib/**/*.test.ts\""
  },
```

- [ ] **Step 3: Verify the harness runs before any test exists**

Run: `npm test`
Expected: exits 0 with `# tests 0`. If it errors, stop and fix before continuing.

- [ ] **Step 4: Rewrite the token layer**

Replace the whole of `app/globals.css` with:

```css
/* Must precede @import "tailwindcss": Tailwind v4 expands into real rules,
   and Lightning CSS drops any @import that follows a rule. */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

@import "tailwindcss";

/* Kwik 112 design system.
   Neutral grey surfaces with vivid saturated signal colour, extracted from the
   product's own Figma component library. Flat surfaces, 1px rules, no glow,
   no blur. */
:root {
  --ground: #1E1E1E;
  --panel: #2D2D2D;
  --panel-raised: #373636;
  --rule: #3B3B3B;
  --rule-strong: #4B4B4B;
  --deep: #171717;

  --ink: #F2F2F2;
  --ink-2: #B0B0B0;
  --ink-3: #9F9F9F;
  --ink-4: #808080;

  --accent: #69D2FF;
  --accent-dim: #49B5E2;
  --accent-bright: #13E3FF;

  --safe: #47FF85;
  --mild: #FABC1F;
  --mild-dim: #C0931F;
  --critical: #F40000;
  --critical-bright: #FF4E4E;
  --critical-soft: #FF859B;
  --critical-bg: #611717;

  --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

@theme inline {
  --color-ground: var(--ground);
  --color-panel: var(--panel);
  --color-panel-raised: var(--panel-raised);
  --color-rule: var(--rule);
  --color-rule-strong: var(--rule-strong);
  --color-deep: var(--deep);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-ink-3: var(--ink-3);
  --color-ink-4: var(--ink-4);
  --color-accent: var(--accent);
  --color-accent-dim: var(--accent-dim);
  --color-accent-bright: var(--accent-bright);
  --color-safe: var(--safe);
  --color-mild: var(--mild);
  --color-mild-dim: var(--mild-dim);
  --color-critical: var(--critical);
  --color-critical-bright: var(--critical-bright);
  --color-critical-soft: var(--critical-soft);
  --color-critical-bg: var(--critical-bg);
  --font-sans: var(--font-sans);

  /* The only permitted type scale. */
  --text-2xs: 10px;
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 14px;
  --text-md: 16px;
  --text-lg: 20px;
  --text-xl: 28px;
}

* { box-sizing: border-box; }

html, body {
  background: var(--ground);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* Every figure that sits in a column or updates in place. */
.tnum, table { font-variant-numeric: tabular-nums; }

/* Uppercase labels. */
.label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-3);
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Leaflet: satellite basemap. The tiles render at their true colour so the
   imagery stays legible under the triangle markers and their name plates. */
.leaflet-container { background: var(--deep); font-family: var(--font-sans); }
.leaflet-control-attribution {
  background: rgba(23, 23, 23, 0.8) !important;
  color: var(--ink-3) !important;
  font-size: 9px !important;
}
.leaflet-control-attribution a { color: var(--ink-2) !important; }
.leaflet-popup-content-wrapper,
.leaflet-popup-tip {
  background: var(--panel);
  color: var(--ink);
  border: 1px solid var(--rule-strong);
  border-radius: 6px;
  box-shadow: none;
}
.leaflet-popup-content { margin: 0; padding: 8px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Update the shell and branding**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kwik 112 — Emergency Command Platform",
  description:
    "AI-assisted emergency dispatch: incident monitoring, unit dispatch, pathfinding, and Kwik 112 emotion-aware voice intake.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ground text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
```

Note: the Geist font imports are removed; Inter now arrives via the CSS `@import` in `globals.css`.

- [ ] **Step 6: Verify build and fonts**

Run: `npx tsc --noEmit && npm run build`
Expected: both exit 0.

Then start the preview and confirm in the browser console:

```js
getComputedStyle(document.body).fontFamily
```

Expected: a string beginning `"Inter"`.

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json package.json app/globals.css app/layout.tsx
git commit -m "feat: add Kwik 112 design tokens and node test harness"
```

---

### Task 2: Symbology module

**Files:**
- Create: `lib/design/symbols.ts`
- Test: `lib/design/symbols.test.ts`

**Interfaces:**
- Consumes: nothing. Self-contained by design.
- Produces:
  - `type SymbolKind = 'incident' | 'unit'`
  - `type IncidentGlyph = 'fire' | 'medical' | 'crime' | 'traffic' | 'utility' | 'unknown'`
  - `type UnitService = 'police' | 'fire' | 'ems'`
  - `interface SymbolSpec { kind: SymbolKind; glyph: IncidentGlyph | UnitService; severity?: 'critical' | 'high' | 'medium' | 'low'; service?: UnitService; distress?: number | null; label?: string; size?: number; selected?: boolean }`
  - `buildSymbol(spec: SymbolSpec): string` — returns an SVG string
  - `severityColor(severity?: string): string`
  - `distressColor(level: number): string`
  - `glyphForIncidentType(incidentType?: string): IncidentGlyph`

- [ ] **Step 1: Write the failing tests**

Create `lib/design/symbols.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSymbol,
  severityColor,
  distressColor,
  glyphForIncidentType,
} from './symbols.ts';

test('severity maps to the documented signal colours', () => {
  assert.equal(severityColor('critical'), '#F40000'); // CRITICAL
  assert.equal(severityColor('high'), '#FABC1F');     // MILD (P2)
  assert.equal(severityColor('medium'), '#47FF85');   // SAFE (P3)
  assert.equal(severityColor('low'), '#47FF85');      // SAFE (P4)
  assert.equal(severityColor(undefined), '#9F9F9F');  // ungraded → neutral ink
});

test('incident type maps onto a known glyph, unknown falls through', () => {
  assert.equal(glyphForIncidentType('fire'), 'fire');
  assert.equal(glyphForIncidentType('medical_emergency'), 'medical');
  assert.equal(glyphForIncidentType('accident'), 'traffic');
  assert.equal(glyphForIncidentType('crime'), 'crime');
  assert.equal(glyphForIncidentType('public_safety'), 'utility');
  assert.equal(glyphForIncidentType('something we never saw'), 'unknown');
  assert.equal(glyphForIncidentType(undefined), 'unknown');
});

test('distress colour ramps calm to peak', () => {
  assert.equal(distressColor(0), '#47FF85');
  assert.equal(distressColor(100), '#F40000');
  // Midpoint sits between the two endpoints, not equal to either.
  const mid = distressColor(50);
  assert.notEqual(mid, '#47FF85');
  assert.notEqual(mid, '#F40000');
  assert.match(mid, /^#[0-9A-F]{6}$/i);
});

test('an incident renders a filled triangle in its severity colour', () => {
  const svg = buildSymbol({ kind: 'incident', glyph: 'fire', severity: 'critical' });
  assert.match(svg, /<svg/);
  assert.match(svg, /data-kind="incident"/);
  assert.match(svg, /#F40000/);
  // Incident frame is an upward-pointing filled triangle.
  assert.match(svg, /<polygon/);
});

test('a unit renders a filled circle in its service colour', () => {
  const svg = buildSymbol({ kind: 'unit', glyph: 'police', service: 'police' });
  assert.match(svg, /data-kind="unit"/);
  assert.match(svg, /#69D2FF/);
  // Unit frame is a filled circle.
  assert.match(svg, /<circle/);
});

test('the distress ring appears only when prosody exists', () => {
  const withProsody = buildSymbol({
    kind: 'incident', glyph: 'medical', severity: 'high', distress: 70,
  });
  assert.match(withProsody, /data-distress="70"/);

  const noProsody = buildSymbol({
    kind: 'incident', glyph: 'medical', severity: 'high', distress: null,
  });
  assert.doesNotMatch(noProsody, /data-distress/);

  // Zero distress is a measurement and must still draw, so absence is
  // visually distinct from calm.
  const calm = buildSymbol({
    kind: 'incident', glyph: 'medical', severity: 'high', distress: 0,
  });
  assert.match(calm, /data-distress="0"/);
});

test('labels are escaped so a symbol can never inject markup', () => {
  const svg = buildSymbol({
    kind: 'incident',
    glyph: 'fire',
    severity: 'critical',
    label: '<img src=x onerror="alert(1)">',
  });
  assert.doesNotMatch(svg, /<img/);
  assert.match(svg, /&lt;img/);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module './symbols.ts'`.

- [ ] **Step 3: Implement the module**

Create `lib/design/symbols.ts`:

```ts
/**
 * @module design/symbols
 * @description Incident and unit symbols, emitted as SVG strings so the same
 *              function can feed both React components and Leaflet `divIcon`,
 *              which only accepts markup. Incidents are filled triangles in the
 *              severity colour; units are filled circles in the service colour.
 *
 *              Self-contained on purpose: it imports nothing from the rest of
 *              the project so `node --test` can run it without a resolver.
 */

export type SymbolKind = 'incident' | 'unit';
export type IncidentGlyph = 'fire' | 'medical' | 'crime' | 'traffic' | 'utility' | 'unknown';
export type UnitService = 'police' | 'fire' | 'ems';

export interface SymbolSpec {
  kind: SymbolKind;
  glyph: IncidentGlyph | UnitService;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  service?: UnitService;
  /** 0-100 from Kwik 112 prosody. `null`/`undefined` means never measured. */
  distress?: number | null;
  label?: string;
  size?: number;
  selected?: boolean;
}

// Severity collapses onto the product's three named levels: P1 → CRITICAL,
// P2 → MILD, P3/P4 → SAFE.
const SEVERITY_COLORS: Record<string, string> = {
  critical: '#F40000',
  high: '#FABC1F',
  medium: '#47FF85',
  low: '#47FF85',
};

const SERVICE_COLORS: Record<UnitService, string> = {
  police: '#69D2FF',
  fire: '#F40000',
  ems: '#47FF85',
};

/** Ungraded / unknown — neutral --ink-3, never a fabricated severity. */
const UNKNOWN = '#9F9F9F';

export function severityColor(severity?: string): string {
  if (!severity) return UNKNOWN;
  return SEVERITY_COLORS[severity] ?? UNKNOWN;
}

/** @description Escape text bound for an SVG/HTML string context. */
function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** @description Calm to peak distress: safe green -> mild amber -> signal red. */
export function distressColor(level: number): string {
  const l = Math.min(100, Math.max(0, level));
  if (l <= 50) return mix('#47FF85', '#FABC1F', l / 50);
  return mix('#FABC1F', '#F40000', (l - 50) / 50);
}

export function glyphForIncidentType(incidentType?: string): IncidentGlyph {
  if (!incidentType) return 'unknown';
  const t = incidentType.toLowerCase();
  if (t.includes('fire')) return 'fire';
  if (t.includes('medical') || t.includes('cardiac') || t.includes('health')) return 'medical';
  if (t.includes('accident') || t.includes('traffic') || t.includes('collision')) return 'traffic';
  if (t.includes('crime') || t.includes('violen') || t.includes('robbery')) return 'crime';
  if (t.includes('public_safety') || t.includes('utility') || t.includes('civic')) return 'utility';
  return 'unknown';
}

/** Inner glyph paths, drawn in a 24x24 user space centred on (12,12). */
const GLYPH_PATHS: Record<string, string> = {
  fire: 'M12 6c1.5 2.2 3.4 3.3 3.4 5.6a3.4 3.4 0 0 1-6.8 0C8.6 9.3 10.5 8.2 12 6z',
  medical: 'M11 7h2v3h3v2h-3v3h-2v-3H8v-2h3V7z',
  crime: 'M8 8l8 8M16 8l-8 8',
  traffic: 'M8 14h8M9 14v-3l1.5-2h3L15 11v3M9.5 16v-1M14.5 16v-1',
  utility: 'M12 7v5M12 15h.01M8 16h8',
  unknown: 'M10 10a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.4M12 16h.01',
  police: 'M12 7l3 1.5v3c0 2-1.3 3.4-3 4-1.7-.6-3-2-3-4v-3L12 7z',
  ems: 'M11 8h2v2h2v2h-2v2h-2v-2H9v-2h2V8z',
};

/**
 * @description Build an incident or unit symbol as an SVG string.
 *              Frame shape encodes entity kind (filled triangle = incident,
 *              filled circle = unit), fill encodes severity or service, and the
 *              inner glyph encodes type. When a `label` is given it is set beside
 *              the marker in --ink on a dark plate. A distress ring is drawn only
 *              when prosody exists; selection adds a 1px accent ring.
 */
export function buildSymbol(spec: SymbolSpec): string {
  const size = spec.size ?? 28;
  const color =
    spec.kind === 'unit'
      ? SERVICE_COLORS[spec.service ?? (spec.glyph as UnitService)] ?? UNKNOWN
      : severityColor(spec.severity);

  const hasDistress = typeof spec.distress === 'number';
  const glyph = GLYPH_PATHS[spec.glyph] ?? GLYPH_PATHS.unknown;

  // Incidents are filled triangles (point up); units are filled circles.
  const frame =
    spec.kind === 'incident'
      ? `<polygon points="12,3 21,20 3,20" fill="${color}" stroke="${color}" stroke-width="1" />`
      : `<circle cx="12" cy="12" r="9" fill="${color}" stroke="${color}" stroke-width="1" />`;

  // Distress ring: an arc swept proportional to the measurement.
  let ring = '';
  if (hasDistress) {
    const level = Math.min(100, Math.max(0, spec.distress as number));
    const r = 11;
    const circumference = 2 * Math.PI * r;
    const dash = (level / 100) * circumference;
    ring =
      `<circle cx="12" cy="12" r="${r}" fill="none" stroke="${distressColor(level)}" ` +
      `stroke-width="1.5" stroke-linecap="butt" ` +
      `stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}" ` +
      `transform="rotate(-90 12 12)" opacity="0.9" />`;
  }

  // Selection is a 1px --accent ring, never a scale transform.
  const selection = spec.selected
    ? `<circle cx="12" cy="12" r="11.25" fill="none" stroke="#69D2FF" stroke-width="1" />`
    : '';

  // Name label beside the marker, in --ink on a dark plate.
  let plate = '';
  let viewW = 24;
  if (spec.label) {
    const plateW = Math.max(24, spec.label.length * 6 + 12);
    viewW = 28 + plateW;
    plate =
      `<rect x="28" y="6" width="${plateW}" height="12" rx="2" fill="#171717" stroke="#3B3B3B" stroke-width="1" />` +
      `<text x="${28 + plateW / 2}" y="15" text-anchor="middle" font-size="9" font-weight="500" fill="#F2F2F2">${esc(spec.label)}</text>`;
  }

  const title = spec.label ? `<title>${esc(spec.label)}</title>` : '';
  const width = Math.round(size * (viewW / 24));

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} 24" width="${width}" height="${size}" ` +
    `data-kind="${esc(spec.kind)}"${hasDistress ? ` data-distress="${Math.round(spec.distress as number)}"` : ''} ` +
    `role="img" aria-label="${esc(spec.label ?? spec.glyph)}">` +
    title +
    selection +
    ring +
    frame +
    `<path d="${glyph}" fill="none" stroke="#1E1E1E" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />` +
    plate +
    `</svg>`
  );
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test`
Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/design/symbols.ts lib/design/symbols.test.ts
git commit -m "feat: add triangle/circle incident and unit symbology module"
```

---

### Task 3: Alerts module

**Files:**
- Create: `lib/alerts.ts`
- Test: `lib/alerts.test.ts`

**Interfaces:**
- Consumes: nothing. Self-contained.
- Produces:
  - `interface AlertInput { id: string; severity?: string; status?: string; created_at: string; ai_confidence?: number; caller_location?: { latitude?: number; longitude?: number }; model_escalated?: boolean }`
  - `type AlertCode = 'LOCATION_UNRESOLVED' | 'P1_UNASSIGNED' | 'MODEL_ESCALATED' | 'LOW_CONFIDENCE' | 'STALE_INCIDENT'`
  - `interface Alert { key: string; callId: string; code: AlertCode; severity: 'critical' | 'high' | 'medium' | 'low'; message: string }`
  - `deriveAlerts(calls: AlertInput[], nowMs: number): Alert[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/alerts.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAlerts, type AlertInput } from './alerts.ts';

const NOW = Date.parse('2026-08-29T12:00:00.000Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

function call(over: Partial<AlertInput> = {}): AlertInput {
  return {
    id: 'c1',
    severity: 'medium',
    status: 'active',
    created_at: ago(10),
    ai_confidence: 0.9,
    caller_location: { latitude: 28.6, longitude: 77.2 },
    ...over,
  };
}

test('a call with no coordinates raises LOCATION_UNRESOLVED', () => {
  const alerts = deriveAlerts([call({ caller_location: {} })], NOW);
  assert.equal(alerts.filter((a) => a.code === 'LOCATION_UNRESOLVED').length, 1);
});

test('a placed call raises no location alert', () => {
  const alerts = deriveAlerts([call()], NOW);
  assert.equal(alerts.filter((a) => a.code === 'LOCATION_UNRESOLVED').length, 0);
});

test('a critical call unassigned beyond 90s raises P1_UNASSIGNED', () => {
  const late = deriveAlerts([call({ severity: 'critical', created_at: ago(120) })], NOW);
  assert.equal(late.filter((a) => a.code === 'P1_UNASSIGNED').length, 1);

  const fresh = deriveAlerts([call({ severity: 'critical', created_at: ago(30) })], NOW);
  assert.equal(fresh.filter((a) => a.code === 'P1_UNASSIGNED').length, 0);
});

test('a dispatched critical call does not raise P1_UNASSIGNED', () => {
  const alerts = deriveAlerts(
    [call({ severity: 'critical', status: 'dispatched', created_at: ago(600) })],
    NOW,
  );
  assert.equal(alerts.filter((a) => a.code === 'P1_UNASSIGNED').length, 0);
});

test('low model confidence raises LOW_CONFIDENCE', () => {
  const alerts = deriveAlerts([call({ ai_confidence: 0.3 })], NOW);
  assert.equal(alerts.filter((a) => a.code === 'LOW_CONFIDENCE').length, 1);
});

test('an escalation flag raises MODEL_ESCALATED', () => {
  const alerts = deriveAlerts([call({ model_escalated: true })], NOW);
  assert.equal(alerts.filter((a) => a.code === 'MODEL_ESCALATED').length, 1);
});

test('an unresolved call older than 30 minutes goes stale', () => {
  const alerts = deriveAlerts([call({ created_at: ago(2000) })], NOW);
  assert.equal(alerts.filter((a) => a.code === 'STALE_INCIDENT').length, 1);
});

test('a resolved call raises nothing', () => {
  const alerts = deriveAlerts(
    [call({ status: 'resolved', created_at: ago(9999), caller_location: {}, ai_confidence: 0.1 })],
    NOW,
  );
  assert.deepEqual(alerts, []);
});

test('keys are stable and unique per call and code', () => {
  const alerts = deriveAlerts([call({ id: 'x1', caller_location: {}, ai_confidence: 0.2 })], NOW);
  const keys = alerts.map((a) => a.key);
  assert.deepEqual([...new Set(keys)], keys);
  assert.ok(keys.every((k) => k.startsWith('x1:')));
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module './alerts.ts'`.

- [ ] **Step 3: Implement the module**

Create `lib/alerts.ts`:

```ts
/**
 * @module alerts
 * @description Derives operational alerts from live call state. Alerts are
 *              computed, never seeded, so what an operator sees always reflects
 *              the board rather than a fixture.
 *
 *              Self-contained: it declares the shape it needs rather than
 *              importing EmergencyCall, which keeps it unit-testable and
 *              decoupled from the wider type surface.
 */

export interface AlertInput {
  id: string;
  severity?: string;
  status?: string;
  created_at: string;
  ai_confidence?: number;
  caller_location?: { latitude?: number; longitude?: number };
  /** Set when model refinement graded the call above the local rules. */
  model_escalated?: boolean;
}

export type AlertCode =
  | 'LOCATION_UNRESOLVED'
  | 'P1_UNASSIGNED'
  | 'MODEL_ESCALATED'
  | 'LOW_CONFIDENCE'
  | 'STALE_INCIDENT';

export interface Alert {
  key: string;
  callId: string;
  code: AlertCode;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
}

const CLOSED_STATUSES = new Set(['resolved', 'completed', 'closed']);
const ASSIGNED_STATUSES = new Set(['dispatched', 'en-route', 'on_scene', 'mitigating']);

const P1_GRACE_SECONDS = 90;
const STALE_SECONDS = 30 * 60;
const LOW_CONFIDENCE = 0.5;

/** @description Compute every open alert for the given calls. */
export function deriveAlerts(calls: AlertInput[], nowMs: number): Alert[] {
  const alerts: Alert[] = [];

  for (const call of calls) {
    const status = (call.status ?? '').toLowerCase();
    // A closed incident cannot need operator attention.
    if (CLOSED_STATUSES.has(status)) continue;

    const ageSeconds = (nowMs - Date.parse(call.created_at)) / 1000;
    const push = (code: AlertCode, severity: Alert['severity'], message: string) =>
      alerts.push({ key: `${call.id}:${code}`, callId: call.id, code, severity, message });

    const loc = call.caller_location;
    if (typeof loc?.latitude !== 'number' || typeof loc?.longitude !== 'number') {
      push('LOCATION_UNRESOLVED', 'high', 'No coordinates resolved — responders cannot be routed.');
    }

    if (
      call.severity === 'critical' &&
      !ASSIGNED_STATUSES.has(status) &&
      ageSeconds > P1_GRACE_SECONDS
    ) {
      push(
        'P1_UNASSIGNED',
        'critical',
        `Critical incident unassigned for ${Math.floor(ageSeconds)}s.`,
      );
    }

    if (call.model_escalated) {
      push('MODEL_ESCALATED', 'medium', 'Model refinement raised severity above the local grade.');
    }

    if (typeof call.ai_confidence === 'number' && call.ai_confidence < LOW_CONFIDENCE) {
      push(
        'LOW_CONFIDENCE',
        'medium',
        `Triage confidence ${Math.round(call.ai_confidence * 100)}% — verify before dispatch.`,
      );
    }

    if (ageSeconds > STALE_SECONDS) {
      push('STALE_INCIDENT', 'low', `Open for ${Math.floor(ageSeconds / 60)} minutes.`);
    }
  }

  return alerts;
}

const ACK_STORAGE_KEY = 'dispatch_alert_acks';

/** @description Read acknowledged alert keys. Browser only; returns empty on the server. */
export function readAcknowledged(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(ACK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

/** @description Mark one alert acknowledged. */
export function acknowledge(key: string): void {
  if (typeof window === 'undefined') return;
  const acks = readAcknowledged();
  acks.add(key);
  try {
    window.localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify([...acks]));
  } catch {
    /* storage unavailable; acknowledgement is best-effort */
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test`
Expected: `# fail 0`, with the 9 alert tests passing alongside Task 2's.

- [ ] **Step 5: Commit**

```bash
git add lib/alerts.ts lib/alerts.test.ts
git commit -m "feat: derive operational alerts from live call state"
```

---

### Task 4: Decision timeline module

**Files:**
- Create: `lib/timeline.ts`
- Test: `lib/timeline.test.ts`

**Interfaces:**
- Consumes: nothing. Self-contained.
- Produces:
  - `type DecisionPoint = 'INTAKE' | 'DISPATCH' | 'RESOLUTION'`
  - `type DecisionRecord` — discriminated union; `note: string` is REQUIRED on the `overridden` arm
  - `interface TimelineState { callId: string; records: DecisionRecord[] }`
  - `DECISION_POINTS: readonly DecisionPoint[]`
  - `emptyTimeline(callId: string): TimelineState`
  - `recordDecision(state: TimelineState, record: DecisionRecord): TimelineState`
  - `currentPoint(state: TimelineState): DecisionPoint | null` — the next undecided point, `null` when complete
  - `isComplete(state: TimelineState): boolean`
  - `readTimeline(callId: string): TimelineState`
  - `writeTimeline(state: TimelineState): void`

- [ ] **Step 1: Write the failing tests**

Create `lib/timeline.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyTimeline,
  recordDecision,
  currentPoint,
  isComplete,
  DECISION_POINTS,
} from './timeline.ts';

test('a fresh timeline starts at INTAKE and is incomplete', () => {
  const t = emptyTimeline('c1');
  assert.equal(currentPoint(t), 'INTAKE');
  assert.equal(isComplete(t), false);
  assert.deepEqual([...DECISION_POINTS], ['INTAKE', 'DISPATCH', 'RESOLUTION']);
});

test('recording advances to the next point', () => {
  let t = emptyTimeline('c1');
  t = recordDecision(t, { point: 'INTAKE', action: 'confirmed', at: '2026-08-29T12:00:00Z' });
  assert.equal(currentPoint(t), 'DISPATCH');
});

test('completing every point marks the timeline complete', () => {
  let t = emptyTimeline('c1');
  for (const point of DECISION_POINTS) {
    t = recordDecision(t, { point, action: 'confirmed', at: '2026-08-29T12:00:00Z' });
  }
  assert.equal(isComplete(t), true);
  assert.equal(currentPoint(t), null);
});

test('recording the same point twice replaces rather than duplicates', () => {
  let t = emptyTimeline('c1');
  t = recordDecision(t, { point: 'INTAKE', action: 'confirmed', at: '2026-08-29T12:00:00Z' });
  t = recordDecision(t, {
    point: 'INTAKE', action: 'overridden', at: '2026-08-29T12:05:00Z', note: 'wrong address',
  });
  assert.equal(t.records.length, 1);
  assert.equal(t.records[0].action, 'overridden');
  assert.equal(t.records[0].note, 'wrong address');
});

test('recordDecision does not mutate its input', () => {
  const t = emptyTimeline('c1');
  const next = recordDecision(t, { point: 'INTAKE', action: 'confirmed', at: 'x' });
  assert.equal(t.records.length, 0);
  assert.equal(next.records.length, 1);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module './timeline.ts'`.

- [ ] **Step 3: Implement the module**

Create `lib/timeline.ts`:

```ts
/**
 * @module timeline
 * @description The three human-in-the-loop decision points an operator passes
 *              through on every incident. Each point records what the AI
 *              proposed and what the operator actually did, so the audit trail
 *              reflects decisions rather than assumptions.
 *
 *              Self-contained so it can be unit tested without a resolver.
 */

export type DecisionPoint = 'INTAKE' | 'DISPATCH' | 'RESOLUTION';

export const DECISION_POINTS: readonly DecisionPoint[] = ['INTAKE', 'DISPATCH', 'RESOLUTION'];

/** A discriminated union so the compiler requires a justification note on an
 *  override. `recordDecision` also guards at runtime, because the compiler
 *  cannot protect records parsed back out of localStorage. */
export type DecisionRecord =
  | { point: DecisionPoint; action: 'confirmed' | 'amended'; at: string; note?: string }
  | { point: DecisionPoint; action: 'overridden'; at: string; note: string };

export interface TimelineState {
  callId: string;
  records: DecisionRecord[];
}

export function emptyTimeline(callId: string): TimelineState {
  return { callId, records: [] };
}

/** @description Add or replace the record for one decision point. */
export function recordDecision(state: TimelineState, record: DecisionRecord): TimelineState {
  const records = state.records.filter((r) => r.point !== record.point);
  records.push(record);
  // Keep records in canonical point order so the UI can render them directly.
  records.sort((a, b) => DECISION_POINTS.indexOf(a.point) - DECISION_POINTS.indexOf(b.point));
  return { callId: state.callId, records };
}

/** @description The next point awaiting an operator decision, or null when done. */
export function currentPoint(state: TimelineState): DecisionPoint | null {
  const decided = new Set(state.records.map((r) => r.point));
  return DECISION_POINTS.find((p) => !decided.has(p)) ?? null;
}

export function isComplete(state: TimelineState): boolean {
  return currentPoint(state) === null;
}

const TIMELINE_STORAGE_KEY = 'dispatch_timeline';

type TimelineMap = Record<string, DecisionRecord[]>;

function readAll(): TimelineMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(TIMELINE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as TimelineMap) : {};
  } catch {
    return {};
  }
}

export function readTimeline(callId: string): TimelineState {
  const all = readAll();
  return { callId, records: Array.isArray(all[callId]) ? all[callId] : [] };
}

export function writeTimeline(state: TimelineState): void {
  if (typeof window === 'undefined') return;
  const all = readAll();
  all[state.callId] = state.records;
  try {
    window.localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable; the in-memory state still drives this session */
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/timeline.ts lib/timeline.test.ts
git commit -m "feat: add human-in-the-loop decision timeline state"
```

---

### Task 5: UI primitives

**Files:**
- Create: `components/ui/panel.tsx`
- Create: `components/ui/symbol.tsx`
- Create: `components/DistressMeter.tsx`

**Interfaces:**
- Consumes: `buildSymbol`, `severityColor`, `distressColor` from `lib/design/symbols.ts`; `cn` from `lib/utils.ts`.
- Produces:
  - `<Panel title?: string; action?: ReactNode; className?: string; children>` — 6px-radius panel, 1px `--rule-strong` border, `--panel` background, optional header row with a `.label` title.
  - `<DataRow label: string; value: ReactNode; mono?: boolean>` — label left in `.label`, value right, `tabular-nums` when `mono`.
  - `<Chip tone: 'critical'|'mild'|'safe'|'accent'|'neutral'; dot?: boolean; children>` — fully-rounded (999px) filled pill: the signal colour as text over that same colour at low alpha, 10px uppercase, no border. A status pill (`dot`) carries a leading filled dot in the signal colour.
  - `<Meter value: number; max?: number; color?: string; label?: string>` — 4px bar, no radius.
  - `<Symbol spec: SymbolSpec; className?: string>` — renders `buildSymbol` output via `dangerouslySetInnerHTML`; safe because `buildSymbol` escapes all text.
  - `<DistressMeter level: number | null | undefined; compact?: boolean>` — renders the ramp bar with the numeric value, or an `—` in `--ink-3` when `level` is null/undefined.

- [ ] **Step 1: Implement the primitives**

Create `components/ui/panel.tsx` exporting `Panel`, `DataRow`, `Chip`, `Meter` exactly as specified above. Rules the implementation must follow:

- Panels use a 6px radius (`rounded-md` / `rounded-[6px]`); chips and status pills are fully rounded (`rounded-full`); buttons and inputs 4px.
- Borders `border border-[var(--rule-strong)]`.
- Panel background `bg-[var(--panel)]`; nested/selected `bg-[var(--panel-raised)]`.
- Header uses the `.label` class from `globals.css`.
- Chips are filled pills — the signal colour as text over that colour at low alpha, no border, with an optional leading dot for status pills. Tone colours come from the `--safe`/`--mild`/`--critical`/`--accent` tokens; no literal hex in the component.
- No `shadow-*`, no `backdrop-blur-*`.

Create `components/ui/symbol.tsx`:

```tsx
'use client';

import { buildSymbol, type SymbolSpec } from '@/lib/design/symbols';

/**
 * @description Renders a symbol built by `buildSymbol`. Using
 *              dangerouslySetInnerHTML is safe here specifically because
 *              buildSymbol escapes every interpolated value; do not pass raw
 *              markup through this component by any other route.
 */
export function Symbol({ spec, className }: { spec: SymbolSpec; className?: string }) {
  return (
    <span
      className={className}
      aria-hidden={spec.label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: buildSymbol(spec) }}
    />
  );
}
```

Create `components/DistressMeter.tsx`. It must render `—` in `--ink-3` when `level` is `null` or `undefined`, and a ramp-coloured bar plus the rounded percentage otherwise. Zero is a measurement and renders as a bar, not a dash.

- [ ] **Step 2: Verify the primitives typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Verify no forbidden styles crept in**

Run:

```bash
grep -rnE "shadow-\[0_0_|backdrop-blur|text-\[[0-9]+px\]" components/ui components/DistressMeter.tsx
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/ui/panel.tsx components/ui/symbol.tsx components/DistressMeter.tsx
git commit -m "feat: add Kwik 112 UI primitives and distress meter"
```

---

## Phase B — Behaviour (Task 6)

### Task 6: Instant triage

**Files:**
- Modify: `lib/triage.ts` (export a local-only entry point)
- Modify: `app/api/calls/create/route.ts`
- Create: `app/api/calls/refine/route.ts`
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: `triageTranscript`, `keywordTriage`, `applyEscalations`, `scoreOf`, `severityFromScore`, `recommendUnits`, `priorityFromSeverity` from `lib/triage.ts`.
- Produces:
  - `localTriage(transcript: string): TriageResult` in `lib/triage.ts` — the keyword path with escalations applied, no network.
  - `POST /api/calls/create` → `{ success: true, call: EmergencyCall, triage_method: 'keyword', refinable: true }`, returning in under 1s.
  - `POST /api/calls/refine` accepting `{ callId, phoneNumber, transcript, emotions, callDurationSeconds }` → `{ success: true, call: EmergencyCall, triage_method: string, changed: string[] }`.
  - `EmergencyCall` gains `refinable?: boolean`, `model_escalated?: boolean`, `triage_method?: string`.

- [ ] **Step 1: Add the local-only export to `lib/triage.ts`**

Add after `triageTranscript`:

```ts
/**
 * @description Grade a transcript with local rules only. No network, so this
 *              returns in microseconds and is what the operator sees first.
 */
export function localTriage(transcript: string): TriageResult {
  const clean = transcript.trim();
  return applyEscalations(keywordTriage(clean), clean);
}
```

- [ ] **Step 2: Extend the call type**

In `lib/types.ts`, add these fields to `EmergencyCall`:

```ts
  /** True while a local-rules grade is awaiting model refinement. */
  refinable?: boolean;
  /** Set when refinement graded the call above the local rules. */
  model_escalated?: boolean;
  /** Names the engine that produced the current grade. */
  triage_method?: string;
```

- [ ] **Step 3: Make `create` local-only**

In `app/api/calls/create/route.ts`, replace the `await triageTranscript(...)` call with `localTriage(...)`, import `localTriage` instead of `triageTranscript`, and add `refinable: true` and `triage_method: 'keyword'` to the returned call. Everything else — emotion ranking, location resolution, unit recommendation — stays exactly as it is.

- [ ] **Step 4: Create the refine route**

Create `app/api/calls/refine/route.ts`. It must:

1. Accept `{ callId, phoneNumber, transcript, emotions, callDurationSeconds }`.
2. Build the call exactly as `create` does, but using `await triageTranscript(...)` instead of `localTriage(...)`.
3. Compute `changed` by comparing the model result against a `localTriage` run over the same transcript, checking these fields: `severity`, `severity_score`, `incident_subtype`, `caller_location.address`, `ai_summary`.
4. Set `model_escalated: true` when the model's severity score exceeds the local one.
5. Set `refinable: false` and `triage_method` to the value returned by the triage result.
6. Return `{ success: true, call, triage_method, changed }`.

To avoid duplicating the call-assembly logic between the two routes, extract it into a shared local helper module `app/api/calls/_buildCall.ts` exporting:

```ts
export async function buildCall(input: BuildCallInput, mode: 'local' | 'model'): Promise<EmergencyCall>
```

Both routes then call it. This is a deliberate extraction — the previous build had `/api/triage/extract` drift into a divergent second copy of the triage logic, and that must not recur.

- [ ] **Step 5: Verify create returns fast and refine enriches**

Build and start the server, then run (this worktree runs on **3001**; port 3000
is occupied by a separate server from the main checkout):

```bash
time curl -s -X POST http://localhost:3001/api/calls/create -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+910000000000","transcript":[{"role":"user","text":"My father collapsed at Connaught Place New Delhi, chest pain, no pulse."}]}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); c=d['call']; print(d['triage_method'], c['severity'], c['severity_score'], d['refinable'])"
```

Expected: prints `keyword critical 95 True` in **under 1 second**.

Then:

```bash
curl -s -X POST http://localhost:3001/api/calls/refine -H "Content-Type: application/json" \
  -d '{"callId":"t1","phoneNumber":"+910000000000","transcript":[{"role":"user","text":"My father collapsed at Flat 402 Royal Palms, Connaught Place, New Delhi, chest pain, no pulse."}]}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['triage_method'], d['changed'], d['call']['caller_location']['address'])"
```

Expected: `triage_method` names the model (`glm:glm-4.5-flash`), `changed` is non-empty, and the address is the precise one the model extracted.

- [ ] **Step 6: Verify the fallback**

Temporarily set `GLM_API_KEY=` (empty) in `.env.local`, restart, and re-run the refine command.
Expected: returns 200 with `triage_method` of `keyword` and the local grade intact — **no 5xx**. Restore the key afterwards.

- [ ] **Step 7: Commit**

```bash
git add lib/triage.ts lib/types.ts app/api/calls/create/route.ts app/api/calls/refine/route.ts app/api/calls/_buildCall.ts
git commit -m "feat: return local triage instantly and refine with the model separately"
```

---

## Phase C — Interface (Tasks 7–18)

Each task in this phase ends with a browser verification. Build, start the preview, and check the stated condition before marking done.

### Task 7: Top bar, icon rail, incident panel, and four-column shell

**Files:**
- Create: `components/ModuleRail.tsx` (the icon rail)
- Rewrite: `app/dashboard/page.tsx` (shell only; map content lands in Task 9, incident-list content in Task 8)

**Interfaces:**
- Consumes: `Panel`, `Chip` from `components/ui/panel.tsx`.
- Produces:
  - `type ModuleId = 'monitoring' | 'alerts' | 'history' | 'forecast'`
  - `<ModuleRail active: ModuleId; onSelect: (id: ModuleId) => void; alertCount: number>`
  - The dashboard renders a four-column body, per spec §5:

```
TOP BAR    KWIK 112 · environment telemetry · clock · LIVE · region
+------+-------------------+---------------------------+
| icon | INCIDENT PANEL    |  MAP (satellite)          |
| rail |  tabs: Emergencies|   labelled triangle       |
|      |        / Alerts   |   markers, unit circles,   |
|      |  search + filter  |   route vectors            |
|      |  stat row         |                            |
|      |  incident list    |   [ floating modules ]     |
+------+-------------------+---------------------------+
```

Requirements:
- Top bar shows `KWIK 112` in `--ink` at 16px semibold, the region/station name in `--ink-3`, environment telemetry, a live clock with `tabular-nums`, a `LIVE` indicator in `--accent-bright`, and the `KWIK 112` action button.
- Icon rail is 72px wide, icon-only with a 10px label, active item marked by a 2px left border in `--accent`. Alerts shows its unacknowledged count.
- Incident panel carries `Emergencies` / `Alerts` tabs, a search field, a filter dropdown, a three-cell stat row (Total / Critical / Resolved) — each a `.label` over a 20px `tabular-nums` figure — then the incident list.
- Map is full-bleed satellite imagery filling the remaining width (Task 9). The floating module board (Task 11b) sits over the map's right side.
- Preserve the existing `loadCalls` fingerprint polling, `mergeCalls` dedupe, and `handleUpdateCallStatus` single-call persistence exactly. **Do not reintroduce writing the merged list back to storage** — that caused the queue to double on every status change.
- Remove `select-none` from the dashboard root. It currently prevents an operator copying an address or phone number. Apply it only to the top bar and icon rail, which are chrome.

- [ ] **Step 1: Implement `ModuleRail`**
- [ ] **Step 2: Rewrite the dashboard shell around it**
- [ ] **Step 3: Verify** — `npm run build`, open `/dashboard`. Expect: icon rail visible with four modules, top bar reading `KWIK 112`, the incident panel showing `Emergencies` / `Alerts` tabs and a stat row with real counts, and a full-bleed satellite map to its right. Switching tabs and rail modules changes the panel.
- [ ] **Step 4: Verify the doubling regression has not returned**

In the browser console:

```js
localStorage.removeItem('kwik_emergency_calls'); location.reload();
```

Then advance three incidents a stage and run:

```js
JSON.parse(localStorage.getItem('kwik_emergency_calls')).length
```

Expected: `3`, not `48`. Queue count stays 16.

- [ ] **Step 5: Commit**

```bash
git add components/ModuleRail.tsx app/dashboard/page.tsx
git commit -m "feat: add icon rail and four-column dashboard shell"
```

---

### Task 8: Incident queue with density pass

**Files:**
- Modify: `app/dashboard/page.tsx` (incident panel list)

**Interfaces:**
- Consumes: `Symbol`, `Chip`, `DistressMeter`, `glyphForIncidentType`.

Requirements:
- Each row: severity chip, `<Symbol>`, incident subtype, **full** `ai_summary` (no `line-clamp`), wrapped address, age, `<DistressMeter>`, triage source.
- A row awaiting refinement shows a `REFINING` chip.
- Rows are `<button>` elements, not clickable `<div>`s, so they are keyboard reachable.
- Search filters on summary, subtype, and address.

- [ ] **Step 1: Implement**
- [ ] **Step 2: Verify** — the full apartment-fire summary ("High-rise apartment fire with two residents trapped on the fourth floor. Heavy smoke visible across Sector 16, Rohini.") is readable in the queue without truncation, and mock calls show `—` for distress.
- [ ] **Step 3: Verify keyboard access** — Tab to a row and press Enter; the incident is selected.
- [ ] **Step 4: Commit** — `git commit -m "feat: rebuild incident queue with full summaries and distress"`

---

### Task 9: Situation map with satellite basemap and triangle symbology

**Files:**
- Rewrite: `components/EmergencyMap.tsx`

Requirements:
- Basemap defaults to the Esri `World_Imagery` **satellite** layer. `EmergencyMap.tsx` already carries that layer behind an unused "Satellite" toggle, so this is a default swap, not a new integration: make satellite the default and retire the now-dead toggle plumbing.
- Markers use `buildSymbol` via `L.divIcon({ html })`. Incidents get filled triangles with their name label and distress rings where prosody exists; units get filled circles.
- Keep the `mapReady` state gate added previously — without it the marker effect races Leaflet's async load and no markers render.
- Keep `escapeHtml` on every popup value.
- Keep the Esri satellite attribution.
- Popups use `--panel` styling from `globals.css`, not inline colours.

- [ ] **Step 1: Implement**
- [ ] **Step 2: Verify symbols render** — console: `document.querySelectorAll('.leaflet-marker-icon svg[data-kind]').length` returns 21 (16 incidents + 5 units).
- [ ] **Step 3: Verify the XSS fix survives the rewrite**

```js
localStorage.setItem('kwik_emergency_calls', JSON.stringify([{
  id:'xss', caller_number:'+910000000000', status:'active', call_status:'in-progress',
  severity:'critical', incident_type:'fire',
  incident_subtype:'<img src=x onerror="window.__X=true">',
  created_at:new Date().toISOString(), updated_at:new Date().toISOString(),
  caller_location:{ address:'<img src=x onerror="window.__X=true">', latitude:28.7196, longitude:77.1186 }
}])); location.reload();
```

After reload: `window.__X` must be `undefined`. Clear storage afterwards.

- [ ] **Step 4: Verify no marker churn** — with a popup open, count recreations over 10s with a `MutationObserver`. Expected: 0.
- [ ] **Step 5: Commit** — `git commit -m "feat: render map on satellite basemap with triangle symbology"`

---

### Task 10: Incident detail panel

**Files:**
- Modify: `app/dashboard/page.tsx` (incident detail, shown in the incident panel when a row is selected)

Requirements:
- Shows: symbol, subtype, priority chip, caller number, location with confidence and accuracy radius, `ai_summary` in full, immediate threats as chips, recommended units, distress meter, triage source badge.
- Confidence renders as the stored value; a district centroid shows 75% with its radius, never 100%.
- Opens the Task 13 timeline via a single primary action.

- [ ] **Step 1: Implement**
- [ ] **Step 2: Verify** — selecting the Rohini fire shows its own summary and threats, not another incident's.
- [ ] **Step 3: Commit** — `git commit -m "feat: rebuild incident detail panel"`

---

### Task 11: Unit roster (floating module)

**Files:**
- Create: `components/UnitRoster.tsx`
- Modify: `components/EmergencyMap.tsx` (lift unit data out)
- Create: `lib/units.ts` (shared unit list, so map and roster agree)

Requirements:
- The roster is one of the floating modules on the board (Task 11b), not a fixed tier — it registers with the module board and inherits drag, collapse, close and pin.
- `lib/units.ts` exports `TACTICAL_UNITS` and the `TacticalUnit` interface, moved verbatim out of `EmergencyMap`.
- Roster body is a table: symbol, callsign, service, status pill, assignment, distance to selected incident (computed with the haversine formula; show `—` when nothing is selected).
- Selecting a row highlights that unit on the map.

- [ ] **Step 1: Implement**
- [ ] **Step 2: Verify** — five units listed, distances change when a different incident is selected, and the module drags, collapses, and closes.
- [ ] **Step 3: Commit** — `git commit -m "feat: add responder unit roster module"`

---

### Task 11b: Floating draggable module board

Restored to scope per spec §5.1 — the earlier design placed draggable modules out of scope, and the revised spec brings them back as one of the product's signature demonstrated interactions.

**Files:**
- Create: `components/ModuleBoard.tsx` — the draggable container, drop targets, and Modules Panel
- Create: `lib/moduleLayout.ts` — layout state, pure reducers, and `localStorage` persistence
- Modify: `app/dashboard/page.tsx` (mount the board over the map's right side)

**Interfaces:**
- Consumes: `Panel`, `Chip` from `components/ui/panel.tsx`.
- Produces:
  - `interface ModulePlacement { id: string; order: number; collapsed: boolean; closed: boolean; pinned: boolean }`
  - `type ModuleLayout = ModulePlacement[]`
  - `DEFAULT_LAYOUT: ModuleLayout`
  - `readLayout(): ModuleLayout` / `writeLayout(layout: ModuleLayout): void` — persisted in `localStorage` under `dispatch_module_layout`; browser-only, returning the default on the server or on parse failure.
  - Pure, non-mutating reducers: `moveModule(layout, id, toOrder)`, `collapseModule(layout, id, next)`, `closeModule(layout, id)`, `restoreModule(layout, id)`, `pinModule(layout, id, next)`.
  - `<ModuleBoard modules: Record<string, { title: string; node: ReactNode }>>` — renders open modules in layout order, the drop target during a drag, and a Modules Panel of closed modules.

Requirements:
- Each module card header carries, as real `<button>` elements: a drag grip, a collapse toggle, a pin toggle, and a close button. Cards use the 6px-radius panel styling and a `See more` footer in `--accent`.
- Modules are draggable by the grip. While a drag is in flight, each valid slot renders a drop target: a dashed **2px `--accent`** border with `Drop here` centred in `--accent`.
- A **Modules Panel** lists every closed module so it can be restored to its previous order.
- A pinned module cannot be dragged or closed until unpinned; its controls reflect that state.
- **Keyboard parity is required:** every action reachable by drag is also reachable without a pointer. The grip button responds to Enter/Space to pick up, arrow keys to move, and Enter to drop; collapse, pin, close, and restore are ordinary buttons. The board must be fully operable from the keyboard alone.
- Layout (order, collapsed, closed, pinned) persists per operator in `localStorage` under `dispatch_module_layout` and is restored on load. Persistence is per browser only; multi-operator sync stays out of scope.
- No `box-shadow` glow and no `backdrop-filter`; the drag affordance is the dashed `--accent` border, not a shadow.

- [ ] **Step 1: Implement `lib/moduleLayout.ts`** — the placement type, `DEFAULT_LAYOUT`, the pure reducers, and `readLayout`/`writeLayout` over `dispatch_module_layout`.
- [ ] **Step 2: Implement `ModuleBoard` and mount it over the map's right side**
- [ ] **Step 3: Verify drag, close, restore, and reload**

Open `/dashboard`, then in the browser console confirm the key exists after a change:

```js
localStorage.getItem('dispatch_module_layout')
```

Drag a module to a new slot (the `Drop here` target must appear during the drag), close it (it must move into the Modules Panel), restore it from the panel, then reload. Expected: the restored module returns to its previous order and the post-drag layout survives the reload.

- [ ] **Step 4: Verify keyboard parity** — with a pointer unused, Tab to a module grip, press Enter/Space to pick up, arrow to a new slot, Enter to drop; Tab to the collapse, pin, and close buttons and operate each; restore the closed module from the Modules Panel. Every drag action must be reachable this way.
- [ ] **Step 5: Commit**

```bash
git add components/ModuleBoard.tsx lib/moduleLayout.ts app/dashboard/page.tsx
git commit -m "feat: add floating draggable module board with keyboard parity"
```

---

### Task 12: Kanban rebuild

**Files:**
- Rewrite: `components/IncidentKanbanBoard.tsx`

Requirements:
- Keep `stageOf` returning exactly one stage per call — the earlier per-column predicates could place one incident in two columns.
- Keep the `advanceStage` button; drag alone is not keyboard reachable.
- Cards carry the symbol, real per-card confidence, real per-card distress (or `—`), and the full summary.
- No glow on hover; use a 1px `--accent` border instead.

- [ ] **Step 1: Implement**
- [ ] **Step 2: Verify** — all five columns populated, no card appears twice, advance button moves a card and persists one entry.
- [ ] **Step 3: Commit** — `git commit -m "feat: rebuild kanban board on the new design system"`

---

### Task 13: Incident timeline

**Files:**
- Create: `components/IncidentTimeline.tsx`
- Delete: `components/IncidentWorkflowOverlay.tsx`
- Modify: `app/dashboard/page.tsx` (swap the import)

**Interfaces:**
- Consumes: `readTimeline`, `writeTimeline`, `recordDecision`, `currentPoint`, `isComplete`, `DECISION_POINTS` from `lib/timeline.ts`.
- Produces: `<IncidentTimeline open: boolean; onClose: () => void; call: EmergencyCall | null>`

Requirements:
- Three decision points rendered as a vertical sequence, each showing the AI proposal **derived from the open call** (`ai_summary`, `incident_subtype`, `severity` for INTAKE; `recommended_units` for DISPATCH; `ai_summary` plus threats for RESOLUTION).
- Each point offers Confirm / Amend / Override. Override requires a note before it can be submitted.
- State loads via `readTimeline(call.id)` in an effect keyed on `call.id`, so opening a different incident **resets the view**. The old overlay leaked approvals between incidents; this must not.
- `role="dialog"`, `aria-modal="true"`, an accessible name, Escape closes, and focus moves into the dialog on open.

- [ ] **Step 1: Implement**
- [ ] **Step 2: Verify per-incident state** — confirm INTAKE on incident A, close, open incident B. B must show INTAKE undecided.
- [ ] **Step 3: Verify accessibility** — Escape closes; Tab cycles inside the dialog.
- [ ] **Step 4: Commit** — `git commit -m "feat: replace workflow overlay with per-incident decision timeline"`

---

### Task 14: Alerts module

**Files:**
- Create: `components/AlertsModule.tsx`

**Interfaces:**
- Consumes: `deriveAlerts`, `readAcknowledged`, `acknowledge` from `lib/alerts.ts`.

Requirements:
- Open alerts listed severity-first; acknowledged ones collapse into a separate section rather than vanishing.
- Each row: severity chip, code, message, incident link, ACK button.
- The rail badge count equals the number of unacknowledged alerts.

- [ ] **Step 1: Implement**
- [ ] **Step 2: Verify** — a call with no coordinates raises `LOCATION_UNRESOLVED`; acknowledging moves it and decrements the rail badge; the state survives reload.
- [ ] **Step 3: Commit** — `git commit -m "feat: add alerts module"`

---

### Task 15: History module

**Files:**
- Rewrite: `components/CallHistoryOverlay.tsx` → rename to `components/HistoryModule.tsx`

Requirements:
- Renders in the main region, not as a full-screen overlay.
- Full-width table, `tabular-nums`, no truncation of summary or address.
- Sortable by age and severity; filterable by severity and free text.
- Rows are `<button>` or have `role="button"` with `tabIndex`.

- [ ] **Step 1: Implement**
- [ ] **Step 2: Verify** — sorting by age reorders correctly; full summaries visible.
- [ ] **Step 3: Commit** — `git commit -m "feat: rebuild call history as a module"`

---

### Task 16: Forecast module and honesty pass

**Files:**
- Rewrite: `components/DataManagementDashboard.tsx` → rename to `components/ForecastModule.tsx`

Requirements — this task is as much about removing claims as adding UI:
- Delete `"Redis Cluster: Active (0.8ms latency, 10k ops/sec)"`, `"PostgreSQL Archive: Syncing (24,810 historic incidents indexed)"`, `"R² = 0.94"`, and `"Measured via LAPD & Berkeley trial benchmarks"`.
- Every panel is either computed from `calls` or carries a `SAMPLE DATA` chip.
- The chart legend promises a `predicted` series — either plot it or remove it from the legend. Plot it.
- Replace the hardcoded `/160` bar scale with the actual maximum of the data.
- Compute what is genuinely computable from `calls`: incidents by severity, by type, by hour of `created_at`, and the local-vs-model triage split.

- [ ] **Step 1: Implement**
- [ ] **Step 2: Verify** — `grep -rn "24,810\|LAPD\|R² = 0.94\|0.8ms" components/` returns nothing.
- [ ] **Step 3: Verify** the predicted series is drawn.
- [ ] **Step 4: Commit** — `git commit -m "feat: rebuild forecast module with honest metrics"`

---

### Task 17: Kwik 112 voice station and optimistic client flow

**Files:**
- Rewrite: `components/StartEmergencyCall.tsx`

Requirements:
- Rebranded `KWIK 112` — the badge belongs here and nowhere else.
- Retain the working EVI flow: token fetch, `connect({ auth: { type: 'accessToken', value }, configId })`, prosody from `models.prosody.scores`, interim-transcript filtering, `explainVoiceError`, and the scripted fallback.
- **New optimistic sequence** on call end:

```ts
// 1. Local grade, returns in milliseconds.
const created = await fetch('/api/calls/create', { ... }).then(r => r.json());
publishCall(created.call);          // appears on the board at once
setResult(created.call);
setTriageMethod(created.triage_method);
setPhase('done');

// 2. Enrich in the background. Failure is silent by design.
if (created.refinable) {
  setRefining(true);
  try {
    const refined = await fetch('/api/calls/refine', { ... }).then(r => r.json());
    if (refined?.call) {
      publishCall(refined.call);    // republish; dashboard merges by id
      setResult(refined.call);
      setTriageMethod(refined.triage_method);
      setChanged(refined.changed ?? []);
    }
  } catch {
    // Local grade stands. No modal, no error state.
  } finally {
    setRefining(false);
  }
}
```

- While refining, show a `REFINING` chip. On completion, changed fields flash once for 500ms; under `prefers-reduced-motion: reduce` they instead take a persistent 2px `--accent` left border.
- The badge shows the engine that actually graded the call, via the existing `describeTriageMethod`.

- [ ] **Step 1: Implement**
- [ ] **Step 2: Verify speed** — run a scripted call; a graded result must appear in **under 1 second**, with the badge reading `local rules`.
- [ ] **Step 3: Verify upgrade** — within ~15s the badge changes to `glm-4.5-flash` and changed fields highlight.
- [ ] **Step 4: Verify silent failure** — set `GLM_API_KEY=` empty, restart, run a scripted call. The local grade must stand with no error modal.
- [ ] **Step 5: Commit** — `git commit -m "feat: show triage instantly and refine in place"`

---

### Task 18: Incident detail page

**Files:**
- Rewrite: `app/dashboard/calls/[id]/page.tsx`
- Rewrite: `components/MiniLocationMap.tsx`
- Modify: queue rows to link here (the page is currently unreachable — nothing links to it)

`MiniLocationMap` needs the same treatment as the main map: keyless Esri basemap,
the `buildSymbol` incident marker rather than its bespoke red dot, panel-styled
overlay, and the accuracy radius drawn from `caller_location.accuracy_radius`
rather than a hardcoded 50m.

Requirements:
- Same design system. Shows the full transcript untruncated, real emotion values or `—`, real confidence, the timeline state, and the map.
- Reachable from a queue row and from history.

- [ ] **Step 1: Implement**
- [ ] **Step 2: Verify** — clicking a queue row's detail affordance navigates and shows that incident.
- [ ] **Step 3: Commit** — `git commit -m "feat: rebuild incident detail page and make it reachable"`

---

## Phase D — Cleanup (Tasks 19–20)

### Task 19: Remove dead code

**Files:**
- Delete: `components/DemoCallSimulator.tsx`
- Delete: `lib/hume-websocket.ts`
- Delete: `test-hume-config.js`
- Delete: `hume-evi-next-js-starter/`
- Delete: `scripts/check-dashboard-content.mjs`
- Modify: `package.json` (drop unused dependencies)

Rationale for each: `DemoCallSimulator` (347 lines) is imported by nothing; `lib/hume-websocket.ts` (327 lines) is imported by nothing and its browser `new WebSocket(url, { headers })` call could never have worked, since browsers read the second argument as subprotocols; `test-hume-config.js` duplicates `/api/hume/chat-summary` and carries rotated keys; `hume-evi-next-js-starter/` is a second vendored Next.js app excluded from `tsconfig`, imported by nothing, and the source of the build's duplicate-lockfile warning; `check-dashboard-content.mjs` greps source for UI strings that this revamp deliberately changes, so it would fail by design and asserts nothing about behaviour.

- [ ] **Step 1: Confirm each file is genuinely unreferenced**

```bash
grep -rn "DemoCallSimulator\|hume-websocket\|check-dashboard-content" app components lib scripts
```

Expected: no output outside the files being deleted.

- [ ] **Step 2: Delete**

```bash
git rm -r components/DemoCallSimulator.tsx lib/hume-websocket.ts test-hume-config.js hume-evi-next-js-starter scripts/check-dashboard-content.mjs
```

- [ ] **Step 3: Remove now-unused dependencies**

Remove from `package.json`: `@supabase/supabase-js`, `leaflet.heat`, `@types/leaflet.heat`, `react-virtualized`, `@types/react-virtualized`, `date-fns`, `remeda`, `server-only`, `@radix-ui/react-toggle`, `hume`.

Keep `@humeai/voice-react` (the voice station uses it) and `openai` (the GLM client uses it).

- [ ] **Step 4: Verify nothing broke**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all exit 0, and the duplicate-lockfile warning is gone from the build output.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dead code and unused dependencies"
```

---

### Task 20: Final verification against the spec

Run every criterion from spec §12 and record the result.

- [ ] **Step 1: No forbidden styles**

```bash
grep -rnE "shadow-\[0_0_|backdrop-blur|text-\[[0-9]+px\]" app components
```

Expected: no output.

- [ ] **Step 2: Instant triage** — a scripted call shows a grade in under 1s, then upgrades with the badge changing.

- [ ] **Step 3: Silent model failure** — with `GLM_API_KEY` empty, the local grade stands and no error modal appears.

- [ ] **Step 4: Density** — an incident's full AI summary is readable in the queue.

- [ ] **Step 5: Alerts** — a call with unresolved location raises an alert that clears on acknowledgement.

- [ ] **Step 6: Timeline isolation** — confirming a point on incident A leaves incident B undecided.

- [ ] **Step 7: Distress honesty** — a Kwik 112 call shows a value; a mock call shows `—`.

- [ ] **Step 8: Build health**

```bash
npm test && npx tsc --noEmit && npm run build
```

Expected: all exit 0.

- [ ] **Step 9: XSS** — the payload from Task 9 Step 3 leaves `window.__X` undefined.

- [ ] **Step 10: Satellite basemap** — the map renders satellite imagery by default, with incident triangles and their name labels legible against it.

- [ ] **Step 11: Module board** — a module can be dragged to a new position, closed, and restored from the Modules Panel, and the layout survives a reload.

- [ ] **Step 12: Keyboard parity** — every module action reachable by drag is also reachable by keyboard.

- [ ] **Step 13: Commit**

```bash
git commit --allow-empty -m "chore: verify revamp against design spec"
```
