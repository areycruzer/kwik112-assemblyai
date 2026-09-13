# Codex and AI-agent contribution log

This project was built by a two-person team working with Codex and coding agents
throughout. This log records what the AI agents actually did, so the
"meaningfully involved" requirement is verifiable rather than claimed. The team supplied the product requirements and approved direction. Agent-generated
implementation and checks are documented below; this log does not establish that
every prompt or result received independent human review.

## Architecture and safety core (Aug 2026, Round 1)

- Codex scaffolded the deterministic multilingual triage engine
  (`lib/triage-local.ts`) from the team's rules design: English/Hindi/Hinglish
  keyword grading with per-phrase severity floors.
- Codex implemented the no-downgrade refinement path (`lib/triage.ts`):
  the model may only escalate; the floor is enforced in code, with regression
  tests and prompt-injection cases in the committed suite.
- Codex built the evaluation harness (`lib/evaluation/`) and ran the versioned
  corpus splits that produced the committed held-out results.

## Round 2 hardening (7–8 Sep 2026)

- A coding agent diagnosed and fixed a production-breaking render loop in the
  live voice path: an npm audit fix had silently bumped `@humeai/voice-react`
  0.2.7 → 0.2.14, whose provider enters a render-phase update loop under
  React 19 the moment a live EVI session connects. Verified with a
  controlled repro in a real Chromium (1,193 "Maximum update depth" crashes
  on the pre-fix build, zero after), then fixed by upgrading to the current
  0.3 line and making the station's unmount cleanup ref-stable.
- The same agent traced silent model-path timeouts to GLM 4.5's default
  reasoning mode and the OpenAI SDK's handling of the `thinking` parameter,
  measured both against the live API, and documented the fix in `lib/llm.ts`.
- Emotion influence was capped at severity-band boundaries
  (`severityBandCeiling`) so prosody can never, by itself, turn a high into a
  critical — with a committed test.
- Road-following dispatch routes (OSRM) replaced the synthetic straight-line
  vector, with an offline-safe dashed fallback.

## This package (8 Sep 2026)

- Landing expansion, `/benchmark`, `/transcript`, `/for-judges`, `llms.txt`
  upgrade, MIT license, and this CI workflow were implemented by a coding
  agent from the team's written plan; the plan and every diff were
  human-reviewed before merge.

## Model usage

- GLM 4.5 Flash (BigModel, free tier) is the primary refinement provider,
  chosen and retained for measured latency at zero cost; any
  OpenAI-compatible provider works via `OPENAI_API_KEY` (+ `OPENAI_BASE_URL`).
- Codex and coding agents (OpenAI Codex, ZCode/Claude) wrote and debugged
  code throughout; Hume EVI provides voice and prosody.

## Final sweep (8 September 2026)

Codex audited source, reproduced a deployed roster path that reserved a unit before checkpoints, and corrected it with human confirmation, exact unit receipts, dispatch amendments, lifecycle propagation, and storage-failure reconciliation. Behavioral regressions also cover cross-tab acknowledgements, timed alerts, muted arrivals, and recovery of a later-arriving call detail.

The triage review found that a severity-only floor could erase required response services. The correction retains local and model-recognized service requirements, bounds unsupported model location/count fields, and keeps local call creation independent of remote geocoding. This is lexical grounding, not general factual verification. Scripted Delhi locations use approximate neighborhood pins.

Independent agent reviews caught multi-service, replacement-dispatch, persistence, and mixed-hazard regressions before integration. The final reviewed suite passed 254 tests and TypeScript checking. Critical recall remained 9/9 on 30 synthetic development regression cases; the final ledger references source commit 503326b. No clinical effectiveness or field ranking was verified.

Browser checks verified an already-open second console received a scripted call and an acknowledgement reduced the first console badge from 6 to 5. Mobile judge pages were inspected at 375px. A live deployed Hume attempt timed out without a caller exchange; no successful live conversation is claimed. The video still needs owner trimming and caption verification. Runtime architecture remains browser-local; Web Locks improve coordination but localStorage is not a transactional production database.
