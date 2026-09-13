# Final sweep implementation plan

**Goal:** Verify the frozen Kwik 112 build, correct demonstrated defects, and produce an evidence-based shipping report.

**Architecture:** Preserve the current product and existing uncommitted redesign. Inspect source and reproduce failures before making minimal corrections. Keep benchmark results unchanged unless triage changes require a fresh committed run.

**Spec:** User attachment `pasted-text.txt`, final sweep and ship directive, received 2026-09-08.

**Constraints:** No features or provider switches. Synthetic test data only. No secrets in output. One fix per commit. Never assert a ranking, perfect score, live success, or video compliance without evidence.

- [ ] Inspect every requested source directory, judge copy, source citations, and existing changes; record defects and exact locations.
- [ ] Run unit tests, local evaluation, production build, raw HTML and route checks; preserve command output in `artifacts/final-sweep`.
- [ ] Correct confirmed copy and runtime defects individually; record old/new copy and verification.
- [ ] Exercise scripted intake, checkpoints, cross-tab calls and alert acknowledgements, detail refresh, and live voice in the browser where tools permit.
- [ ] Check judge-facing pages at desktop and 375px, including accessible names and dialog focus.
- [ ] Verify raw deployed HTML and final deployment where available; report local and deployed states separately.
- [ ] Write R1–R8 report with scores supported by evidence and explicit remaining manual items.

Execution is inline under the user's explicit instruction to complete the work autonomously. No feature design or separate approval checkpoint is needed for confirmed fixes.
