# S0 — Discord eligibility question (post in the AssemblyAI hackathon channel)

Hi team — quick eligibility question before we invest the next two weeks.

Our team has a pre-existing open-source emergency-call dispatcher console
(github.com/areycruzer/kwik-112 — deterministic triage rules, human-checkpoint
dispatch flow, evaluation harness) that was built for and submitted to an
earlier hackathon. For this event we are building the **entire voice-AI core
fresh on AssemblyAI** inside the window: the Voice Agent API call-taker,
keyterm biasing from our triage lexicon, mid-session prompt steering, a
client-side escalate-only severity tool, and an LLM Gateway benchmark run.

Concretely: the repo starts with one clearly-labeled import commit of the
pre-existing console (disclosed as prior work), and every AssemblyAI commit
after it is dated inside the event window.

Is that eligible under the originality rules, given that the *core AI-powered
functionality* is built during the event on top of disclosed pre-existing
non-AI scaffolding? Happy to restructure if not — we'd rather ask first.
