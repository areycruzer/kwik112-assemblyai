# S0 — Discord eligibility question

**Server:** https://discord.com/invite/lablabai (join, then post in the
AssemblyAI Voice Agent Hackathon channel — event channels appear after
registering on the hackathon page).

---

Hi team! Quick eligibility question before we commit the next two weeks 🙂

Our team has a pre-existing open-source emergency-call dispatcher console
(https://github.com/areycruzer/kwik-112 — deterministic triage rules, human
checkpoint dispatch flow, evaluation harness) that was built for and submitted
to an earlier hackathon. For THIS event we're building the entire voice-AI
core fresh on AssemblyAI inside the window: a Voice Agent API call-taker
(Hindi/Hinglish/English), keyterm biasing generated from our triage lexicon,
mid-session prompt steering, a client-side escalate-only severity tool, and a
benchmark run through the LLM Gateway.

Concretely: our new repo starts with one clearly-labelled import commit of the
pre-existing console (disclosed as prior work), and every AssemblyAI commit
after it is dated inside the event window.

Two questions:
1. Is that eligible, given the core AI-powered functionality is built during
   the event on top of disclosed pre-existing non-AI scaffolding?
2. Side question — our fresh AssemblyAI account currently only has access to
   `qwen3.5-4b-32k-fast` on the LLM Gateway (GPT/Gemini/Claude models return
   "account does not have access"). Do hackathon participants get broader
   gateway model access or credits?

Happy to restructure if the answer to (1) is no — we'd rather ask first. Thanks!
