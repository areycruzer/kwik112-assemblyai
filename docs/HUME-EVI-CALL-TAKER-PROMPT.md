# Hume EVI Call-Taker Prompt

The live Hume session receives the repository-owned prompt in `lib/voice-launch.ts`.
Use `EMERGENCY_VOICE_SYSTEM_PROMPT` as the exact configuration prompt. The short
`EMERGENCY_VOICE_BOOTSTRAP_PROMPT` is sent first because Hume recommends keeping
the connection bootstrap below 1,000 characters.

The prompt is intentionally kept in source so changes are reviewed and tested with
the Hume session settings sent by the voice station.
