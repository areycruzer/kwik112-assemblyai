# Kwik 112 — UI revamp and Kwik 112 feature layer

Date: 2026-08-29
Status: approved for planning

## 1. Goal

Replace the current dispatch console's visual system and information architecture,
and change one behaviour: triage must stop blocking on the model.

The existing UI reads as a game HUD — neon glow, stacked backdrop blur, ad-hoc
type sizes from `text-[9px]` to `text-lg`, six competing accent hues, and
aggressive truncation of the exact content an operator needs. It is also
structurally flat: one screen with modals bolted on.

## 2. Product framing

**Kwik 112** is the core CAD platform: incident monitoring, dispatch,
pathfinding, call history, forecasting, alerting.

**Kwik 112** is a feature layer on top of it: emotion-aware voice intake for
India's 112 service. It opens a Hume EVI session, reads caller distress from
prosody, and feeds that signal into triage and into the operator's view.

This framing is load-bearing for the design. "Pulse" is the caller's emotional
vital sign, so distress is presented as a first-class signal across the platform
rather than a panel. Branding: `KWIK 112` is the product; `KWIK 112` badges
the intake module specifically.

### 2.1 Honesty consequence

Only calls captured through Kwik 112 carry prosody. Mock and legacy calls show
`—` for distress. That contrast is the demonstration of what the feature adds and
must not be smoothed over by inventing values, which is what the current build
does (a hardcoded 92/86/78/45 on every incident regardless of source).

## 3. Design system

**Revised 2026-08-29 after inspecting the real product.** The first draft of this
section inferred a "NATO/ICS doctrine" palette from a written description of NATO
symbology. That was wrong. The values below are extracted from Kwik 112's own
Figma component library export (`ComponentsLibraryDispatch.svg`, 3054x3867) by
counting every hex literal, and corroborated against their product screenshots.

Their scheme is **neutral grey surfaces with vivid saturated signal colour** —
not the blue-tinted, desaturated military tones originally specified.

### 3.1 Colour

Surfaces:

| Token | Value | Use |
|---|---|---|
| `--ground` | `#1E1E1E` | Page background |
| `--panel` | `#2D2D2D` | Panel background (their most-used value) |
| `--panel-raised` | `#373636` | Nested / hovered / selected panel |
| `--rule` | `#3B3B3B` | Hairline divider |
| `--rule-strong` | `#4B4B4B` | Panel border |
| `--deep` | `#171717` | Deepest wells, map surround |

Text:

| Token | Value | Use |
|---|---|---|
| `--ink` | `#F2F2F2` | Primary text |
| `--ink-2` | `#B0B0B0` | Secondary text |
| `--ink-3` | `#9F9F9F` | Labels, metadata |
| `--ink-4` | `#808080` | Disabled, placeholder |

Signal — vivid on purpose, and the only saturated colour on screen:

| Token | Value | Meaning |
|---|---|---|
| `--accent` | `#69D2FF` | Interactive: links, active state, "See more", focus |
| `--accent-dim` | `#49B5E2` | Accent hover / secondary |
| `--accent-bright` | `#13E3FF` | Live indicator |
| `--safe` | `#47FF85` | SAFE severity, READY status |
| `--mild` | `#FABC1F` | MILD severity, BUSY status |
| `--mild-dim` | `#C0931F` | Mild on filled backgrounds |
| `--critical` | `#F40000` | CRITICAL severity |
| `--critical-bright` | `#FF4E4E` | Critical hover / emphasis |
| `--critical-soft` | `#FF859B` | Critical text on dark red fill |
| `--critical-bg` | `#611717` | Filled background behind critical text |

Severity maps to three named levels, matching their labels exactly: **CRITICAL**,
**MILD**, **SAFE**. Our four-priority model (P1-P4) maps onto them as
P1 → CRITICAL, P2 → MILD, P3/P4 → SAFE.

Distress ramp (Kwik 112): `#47FF85` (calm) → `#FABC1F` → `#F40000` (peak).

### 3.2 Typography

A single geometric sans throughout — **Inter**, with a system fallback stack.
There is no monospace anywhere in their design; the earlier IBM Plex Sans + Mono
pairing is dropped.

- Scale: 10, 11, 12, 14, 16, 20, 28px.
- Weights: 400 body, 500 labels, 600 names and headings, 700 section titles.
- Uppercase labels (`RCO`, `SAFE`, `EMERGENCY DASHBOARD`) at 10-11px with
  `0.06em` letter-spacing.
- `font-variant-numeric: tabular-nums` on figures in columns or updating in place.
- Metadata lines set the label in `--ink-3` and the value in `--ink` at the same
  size, bolded — e.g. "Total calls: **44** | Line: **PA3241**".

### 3.3 Surface rules

- Panels: 6px radius, `--panel` fill, 1px `--rule-strong` border.
- Chips and status pills: **fully rounded** (999px), filled background at low
  alpha with the signal colour as text. This replaces the earlier square,
  1px-bordered chip.
- Status pills carry a leading filled dot in the signal colour.
- Buttons and inputs: 4px radius.
- **No `box-shadow` glow, no `backdrop-filter`.** Vivid colour comes from the
  hue, not from bloom.
- Spacing on a 4px grid.
- Focus: 2px `--accent` outline, 2px offset.

## 4. Symbology

**Revised.** MIL-STD-2525 frames are dropped. Their map uses a far simpler and
more legible convention, and matching it matters more than matching the doctrine
they cite in prose.

- **Incidents are filled triangles** in the severity colour, point up, with the
  incident name set beside the marker in `--ink` on a dark plate.
- **Units are filled circles** in the service colour with a small glyph.
- **Selection** adds a 1px `--accent` ring, not a scale transform.
- **Distress ring (Kwik 112)** is retained as an arc around the triangle,
  coloured from the distress ramp, and drawn only when prosody exists. Absent
  entirely when never measured, so absence stays visually distinct from calm.

`buildSymbol(spec): string` keeps its signature and its escaping contract — only
the geometry changes. All text interpolated into the SVG passes through the
module's `esc()`.

## 5. Information architecture

**Revised.** Their layout is four columns with floating modules over the map, not
the three-tier stack originally specified.

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

- **Icon rail** — narrow, icon-only, one per module.
- **Incident panel** — `Emergencies` / `Alerts` tabs, a search field, a filter
  dropdown, a three-cell stat row (Total / Critical / Resolved), then the list.
- **Map** — full-bleed **satellite imagery**. The existing code already carries an
  Esri `World_Imagery` layer behind an unused toggle; that becomes the default.
- **Floating modules** — draggable cards over the map's right side, each with a
  drag grip, collapse and close controls, a view-toggle and sort row, rows with
  status pills and pin controls, and a `See more` footer in `--accent`.

### 5.1 Modules and drag-and-drop

Restored to scope. It is one of the product's signature demonstrated
interactions, not a flourish.

- Modules are draggable by their grip, and can be collapsed, closed, and pinned.
- A drop target renders as a dashed 2px `--accent` border with `Drop here`
  centred in `--accent`.
- A **Modules Panel** lists closed modules so they can be restored.
- Layout persists per operator in `localStorage` under `dispatch_module_layout`.
- Keyboard parity is required: every module exposes collapse, close and move
  actions as buttons, so the board is operable without a pointer.

### 5.2 Kwik 112

Kwik 112 remains the emotion-aware voice intake and is not a rail module. It is
the primary action in the top bar, badged `KWIK 112`, opening over the board.

## 6. Modules

### 6.1 Monitoring

The three-tier layout above. Incident queue rows carry: severity chip, symbol,
incident type, full AI summary, address, age, distress bar (or `—`), and triage
source.

### 6.2 Alerts

Alerts are **derived from call state by a pure function**, never seeded. Rules in
`lib/alerts.ts`:

| Code | Condition | Severity |
|---|---|---|
| `LOCATION_UNRESOLVED` | No latitude/longitude on the call | high |
| `P1_UNASSIGNED` | `severity === 'critical'` and status not dispatched/on_scene/resolved and age > 90s | critical |
| `MODEL_ESCALATED` | Refinement raised severity above the local grade | medium |
| `LOW_CONFIDENCE` | `ai_confidence < 0.5` | medium |
| `STALE_INCIDENT` | Not resolved and age > 30 min | low |

Acknowledgement is stored in `localStorage` under
`dispatch_alert_acks` keyed `${callId}:${code}`, and acknowledged alerts move to
a collapsed section rather than disappearing.

### 6.3 History

The existing call log, rebuilt on the new primitives: full-width table, tabular
numerals, no truncation of summary or address, sortable by age and severity,
filterable by severity and free text.

### 6.4 Forecast

The existing analytics modal, subject to the honesty pass in §9. Becomes a
module rather than a full-screen modal.

### 6.5 Incident timeline

Replaces `IncidentWorkflowOverlay`, which currently hardcodes four fire/EMS
recommendations regardless of which incident is open and never resets its state
between incidents.

Three decision points, per the reference:

1. **INTAKE** — AI classification (type, severity, location). Operator confirms
   or amends.
2. **DISPATCH** — AI proposed units. Operator authorises, edits, or overrides
   with a reason.
3. **RESOLUTION** — AI drafted closure summary. Operator signs off.

Each point records: what the AI proposed, what the operator did, a timestamp, and
an override reason where the operator diverged. All content derives from the open
call (`ai_summary`, `recommended_units`, `severity`, `immediate_threats`). State
persists per call in `localStorage` under `dispatch_timeline`.

## 7. Instant triage

### 7.1 Rationale

The reference benchmarked Mistral, GPT-4 and a custom model, found the large
models marginally more accurate but 230% slower, and shipped the faster one:
*"It is better to correct wrong information than to falsely expect perfect
answers in a life-or-death situation."*

Our GLM path takes 10–15s on the free tier and has been measured timing out. The
operator currently watches a spinner for that entire period.

### 7.2 Design

Split the single blocking request into two:

- `POST /api/calls/create` runs **local rules only** and returns immediately
  (measured in milliseconds). Response carries `triage_method: 'keyword'` and
  `refinable: true`.
- `POST /api/calls/refine` accepts `{ callId, transcript, emotions }`, runs the
  model, and returns the enriched call plus `changed: string[]` naming the fields
  the model altered.

Client sequence: publish the local call so it appears on the board at once →
immediately request refinement → merge the result and republish with
`isUpdate: true`.

### 7.3 States and failure

- While refinement is in flight the incident carries a `REFINING` chip.
- On success, changed fields flash once (500ms) and the source badge flips from
  `local rules` to the model id. Under `prefers-reduced-motion: reduce` the flash
  is replaced by a persistent left border on the changed row, so the information
  survives without the animation.
- On failure or timeout the local grade stands, the badge stays `local rules`,
  and **no error modal is shown**. Refinement is enrichment; its failure must not
  interrupt the operator.
- The model may only raise severity, never lower it. This constraint already
  exists in `lib/triage.ts` and is preserved.

## 8. Density

Acting on the reference's finding that *"over-optimized UX can be a disease"*,
and that dispatchers are trained on dense multi-screen workflows:

- Incident rows show the **full** AI summary. `line-clamp-2` is removed from
  summaries.
- Transcripts render in full, scrollable, never truncated.
- Addresses wrap rather than `truncate`.
- `truncate` survives only where a value is genuinely an identifier that cannot
  wrap (e.g. a chat group id in a status line).
- `select-none` is scoped to chrome. It currently sits on the dashboard root and
  prevents an operator copying an address or phone number.

## 9. Honesty rules

Carried forward from the audit and extended to the new surfaces.

- No fabricated telemetry. The forecast module's "Redis Cluster: Active (0.8ms
  latency, 10k ops/sec)", "PostgreSQL Archive: Syncing (24,810 historic incidents
  indexed)", "R² = 0.94" and "Measured via LAPD & Berkeley trial benchmarks" are
  either computed from `calls` or explicitly labelled `SAMPLE DATA`.
- Named third-party attributions are removed unless true.
- Distress renders `—` where there is no prosody.
- The triage source badge always names the engine that actually graded the call.
- Location confidence reflects what the coordinate represents; a district
  centroid is capped at 75% with its accuracy radius shown.
- Where the chart legend promises a series, that series is plotted. The forecast
  chart currently promises "Dotted = LSTM Forecast" and never draws it.

## 10. File plan

New:

- `lib/design/symbols.ts` — `buildSymbol`, escaped SVG strings
- `lib/alerts.ts` — derivation rules, acknowledgement storage
- `lib/timeline.ts` — decision-point state and persistence
- `components/ui/panel.tsx` — `Panel`, `PanelHeader`, `DataRow`, `Chip`
- `components/ui/symbol.tsx` — React wrapper over `buildSymbol`
- `components/DistressMeter.tsx` — shared distress rendering, handles the absent case
- `components/ModuleRail.tsx`
- `components/UnitRoster.tsx`
- `components/AlertsModule.tsx`
- `components/IncidentTimeline.tsx`
- `app/api/calls/refine/route.ts`

Rewritten:

- `app/globals.css` — token layer, font imports, surface rules
- `app/layout.tsx` — fonts, metadata, branding
- `app/dashboard/page.tsx` — module rail, three-tier layout
- `app/dashboard/calls/[id]/page.tsx`
- `app/api/calls/create/route.ts` — local-only path
- `components/EmergencyMap.tsx` — symbology, distress rings
- `components/IncidentKanbanBoard.tsx`
- `components/StartEmergencyCall.tsx` — Kwik 112 branding, optimistic flow
- `components/CallHistoryOverlay.tsx` → history module
- `components/DataManagementDashboard.tsx` → forecast module
- `components/MiniLocationMap.tsx`

Deleted (dead or replaced):

- `components/IncidentWorkflowOverlay.tsx` — replaced by `IncidentTimeline`
- `components/DemoCallSimulator.tsx` — unreferenced, 347 lines
- `lib/hume-websocket.ts` — unreferenced, 327 lines, and its browser
  `WebSocket(url, {headers})` call could never have worked
- `test-hume-config.js` — duplicates `chat-summary`, holds rotated keys
- `hume-evi-next-js-starter/` — a second vendored Next.js app, excluded from
  `tsconfig`, imported by nothing, and the source of the build's duplicate
  lockfile warning

## 11. Out of scope

Explicitly not in this change:

- Multi-operator layout sync. Module layout persists per browser only.
- Module resizing. Modules drag, collapse, close and pin; they do not resize.
- Authentication. Still absent; tracked separately as a deployment blocker.
- Hume webhook signature verification. Tracked separately.
- Replacing `localStorage` with a database.

## 12. Verification

The change is done when, against a production build driven in a browser:

1. `grep -r` over `app/` and `components/` returns no `shadow-[0_0_`, no
   `backdrop-blur`, and no arbitrary `text-[Npx]` outside the six-step scale.
2. A scripted call shows a graded result in under one second, then upgrades in
   place with the badge changing from `local rules` to the model id.
3. Killing network access to the model leaves the local grade standing with no
   error modal.
4. An incident's full AI summary is readable in the queue without truncation.
5. Alerts appear for a call with unresolved location and clear on acknowledgement.
6. The incident timeline shows the open incident's own units and summary, and
   resets when a different incident is opened.
7. Distress shows a value for a Kwik 112 call and `—` for a mock call.
8. `tsc --noEmit` and `next build` are clean.
9. The XSS payload that previously executed still renders inert after the
   symbology rewrite.
10. The map renders satellite imagery by default, with incident triangles and
    their name labels legible against it.
11. A module can be dragged to a new position, closed, and restored from the
    Modules Panel, and the layout survives a reload.
12. Every module action reachable by drag is also reachable by keyboard.
