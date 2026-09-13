# Kwik 112 Round 2 video package

**Maximum runtime:** 1:55. Record against the local or verified deployed build. Do not add a deployment or hosted-video URL until it exists.

## Shot list

| Time | Picture |
| --- | --- |
| 0:00–0:08 | Landing, then Place a test call |
| 0:08–0:30 | Play Ramesh; show audible Hinglish turns |
| 0:30–0:44 | LIVE 112 CALL strip |
| 0:44–0:58 | Incident appears, then refine state |
| 0:58–1:16 | INTAKE and DISPATCH checkpoints; guidance and units |
| 1:16–1:29 | Audit receipt |
| 1:29–1:46 | Benchmark report and terminal command |
| 1:46–1:55 | Landing close and scope facts |

## Canonical narration

Every Indian already knows how to use it: dial 112.
The caller needs no app or screen.

Kwik 112 asks one short question at a time:
location, immediate danger, what happened, and how many people.

Transcript, language, SIMULATED prosody provenance,
and the current rules grade reach the console during the call.

The local grade is immediate. Optional structured refinement
may escalate severity, but cannot downgrade the deterministic floor.

A human confirms intake, reads conservative guidance,
selects units, and makes every dispatch decision.

Transcript source, prosody provenance, triage engine,
override notes, units, and resolution remain auditable.

Held-out local benchmark: critical recall 100%, 9 of 9;
type and severity 60%; under-triage 23.3%; over-triage 16.7%;
p50 about 0.042ms and p95 about 5.219ms.

Synthetic corpus, no live 112 integration. Codex assisted implementation
and review; the OpenAI SDK supports optional structured refinement.
Human dispatch stays in command.

`docs/kwik-112-round2-narration.txt` is the narration source. The README transcript and `public/kwik-112-round2.vtt` must remain verbatim aligned with it; `npm run check:raw-html` enforces that contract.
