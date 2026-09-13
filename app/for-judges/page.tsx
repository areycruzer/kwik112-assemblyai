import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardCheck, Headphones, Mic, Timer } from "lucide-react";
import { VOICE_STATION_HREF } from "@/lib/voice-launch";

export const metadata: Metadata = {
  alternates: { canonical: "/for-judges" },
  title: "For judges — evaluate Kwik 112 in 120 seconds",
  description:
    "Three one-click paths to evaluate Kwik 112: place a call, open the console, reproduce the benchmark. No login, no credentials, no setup.",
};

const paths = [
  {
    icon: Mic,
    time: "~60 seconds",
    title: "1. Place a 112 call",
    copy: "Opens the voice station. Play a scripted caller (Ramesh — Hinglish accident, John — English market fire, or Sharma ji — Hinglish cardiac arrest) or start a live demo call in Hindi, Hinglish, or English. Watch the transcript, emotion telemetry, and instant rules grade appear as the caller speaks.",
    cta: "Place a test call",
    href: VOICE_STATION_HREF,
  },
  {
    icon: ClipboardCheck,
    time: "~2 minutes",
    title: "2. Dispatch like an operator",
    copy: "Open the console. Pick an incident, read the safety audit ('Why this priority?'), run the three human checkpoints (INTAKE → DISPATCH → RESOLUTION), try to override without a written note — it will refuse. Multi-caller fusion flags duplicate calls for human approval.",
    cta: "Open the console",
    href: "/dashboard",
  },
  {
    icon: Timer,
    time: "~3 minutes",
    title: "3. Reproduce the benchmark",
    copy: "Run one command against the versioned corpus. The results page renders the committed measurements with explanatory copy; latency varies by machine and run.",
    cta: "See the held-out results",
    href: "/benchmark",
  },
];

const realOrMock: [string, string, string][] = [
  ["Live Hume EVI voice sessions", "Real, optional", "Browser audio streams to Hume EVI with the configured call-taker prompt; per-utterance model estimates of prosody are labelled MEASURED"],
  ["Scripted callers", "Simulated", "Demo personas with synthetic emotion frames, labelled Scripted call in the UI — never dressed up as measurements"],
  ["Triage engine", "Real", "Deterministic multilingual rules run locally in milliseconds; committed test suite covers the no-downgrade floor and injection cases"],
  ["Model refinement", "Real, optional", "LLM enrichment that may only escalate severity; falls back silently to the local grade on any failure"],
  ["Incidents, units, ETAs", "Synthetic", "A simulated Delhi fleet; ETAs use a simulated road-adjusted travel model and say so in the interface"],
  ["Audit trail", "Session-local demo", "Browser-local decisions persist across reloads and browser sessions until storage is cleared; no shared production record store"],
];

export default function ForJudgesPage() {
  return (
    <main className="min-h-screen bg-[#f4f5f2] text-[#151817]">
      <section className="bg-[#171717] py-14 text-white">
        <div className="mx-auto max-w-[980px] px-5 md:px-8">
          <p className="text-xs font-semibold uppercase text-[#78dcff]">Reviewer guide</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Evaluate Kwik 112 in 120 seconds</h1>
          <p className="mt-3 text-sm leading-6 text-[#e5e9e6]">Ring-time middleware, demonstrated in a browser: the citizen keeps the dial pad; the dispatcher receives a pre-graded call. Built with Codex. Optional refinement uses GLM 4.5 Flash; an OpenAI model path is supported. No live 112 integration.</p>
          <p className="mt-2 text-xs text-[#fabc1f]">Independent synthetic-data demonstration — not an official 112, ERSS, government, or C-DAC service.</p>
          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-[#e5e9e6]">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#47ff85]" aria-hidden /> No login</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#47ff85]" aria-hidden /> No credentials</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#47ff85]" aria-hidden /> No setup</span>
          </p>
        </div>
      </section>

      <section className="border-b border-[#ccd1cc] bg-white py-12">
        <div className="mx-auto max-w-[980px] px-5 md:px-8">
          <div className="grid gap-5 md:grid-cols-3">
            {paths.map(({ icon: Icon, time, title, copy, cta, href }) => (
              <div key={title} className="flex flex-col rounded border border-[#cfd4cf] bg-[#fafbfa] p-6">
                <Icon className="h-6 w-6 text-[#087b91]" aria-hidden />
                <p className="mt-4 font-mono text-xs font-bold text-[#c71920]">{time}</p>
                <h2 className="mt-1 text-lg font-bold">{title}</h2>
                <p className="mt-2 flex-1 text-sm leading-6 text-[#555e59]">{copy}</p>
                <Link href={href} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-[6px] bg-[#087b91] px-4 text-sm font-bold text-white hover:bg-[#06626f]">{cta} <ArrowRight className="h-4 w-4" aria-hidden /></Link>
              </div>
            ))}
          </div>

          <h2 className="mt-14 text-lg font-bold">Problem</h2>
          <p className="mt-2 text-sm leading-6 text-[#555e59]">The problem is a busy intake queue, not a missing citizen app. These sources describe different places, periods, and measures; vehicle response time is not telephone ring time.</p>
          <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-6 text-[#555e59]">
            <li>Telangana reporting puts genuine emergencies at about 0.28% of roughly 16 lakh daily calls across the combined 112/Dial 100 system. <a className="font-semibold text-[#087b91] underline" href="https://the420.in/telangana-emergency-calls-ai-tools-erss-dial-112-genuine-calls-dispatch-2026/">25 June 2026 report, citing police data</a>.</li>
            <li>The MHA NERS guidelines target an average answer speed below 15 seconds. Separately, a Telangana DGP statement reports a national emergency response average around 18 minutes. These are different stages of response. <a className="font-semibold text-[#087b91] underline" href="https://www.mha.gov.in/sites/default/files/2022-08/NERSGuideline_2100815%5B1%5D.pdf">MHA guidelines, 2015, page 20</a>; <a className="font-semibold text-[#087b91] underline" href="https://www.newindianexpress.com/amp/story/states/telangana/2026/Aug/06/telangana-police-launch-30-faster-ai-driven-emergency-response-system-dial-112">DGP report, 6 August 2026</a>.</li>
            <li>Delhi reported roughly 10,000 blank calls out of 15,672 daily calls shortly after the 112 launch. The report also describes IVR filtering already in place. <a className="font-semibold text-[#087b91] underline" href="https://timesofindia.indiatimes.com/city/delhi/112-number-gets-10000-blank-calls-a-day-thanks-to-phones-power-button/articleshow/71383219.cms">1 October 2019 report</a>.</li>
            <li>SaveLIFE Foundation v. Union of India, W.P.(C) 726/2024, order dated 26 May 2026 (2026 INSC 567), directs integration of 100, 101, 102, 108, 1033 and 1091 into 112 within three months. As of this review, that stated window has closed; this is a calendar inference, not proof of nationwide implementation. <a className="font-semibold text-[#087b91] underline" href="https://api.sci.gov.in/supremecourt/2024/49959/49959_2024_3_60_71558_FinalOrder_26-May-2026.pdf">Official order, 26 May 2026</a>.</li>
          </ul>

          <h2 className="mt-10 text-lg font-bold">Working build</h2>
          <p className="mt-2 text-sm leading-6 text-[#555e59]">No login, no credentials, no setup: place a call above, watch the transcript, emotion telemetry, and deterministic grade appear live, then run the three human checkpoints. Every number on /benchmark regenerates from the repository with one command.</p>

          <h2 className="mt-10 text-lg font-bold">Usability</h2>
          <p className="mt-2 text-sm leading-6 text-[#555e59]">The proposed citizen interface is the dial pad: a keypad phone on a voice-capable 2G network, no app, URL, reading, or data plan. Hindi, Hinglish, and English today. This browser demonstration emulates that call; it is not connected to the telephone network. The dispatcher receives a pre-graded card.</p>

          <h2 className="mt-10 text-lg font-bold">Product thinking</h2>
          <p className="mt-2 text-sm leading-6 text-[#555e59]">The AI may escalate severity but can never lower the deterministic floor — enforced in code with regression and prompt-injection tests, not a prompt promise. Emotion can sharpen priority inside a severity band but never cross a band boundary.</p>
          <p className="mt-2 text-sm leading-6 text-[#555e59]">A calm caller reporting no pulse must still grade critical. Possible prank prosody is an annotation for human review, never proof of a prank, a downgrade, or automatic removal from the queue. The intended deployment sits before C-DAC NG112 call handling; this build demonstrates that boundary without claiming an integration.</p>

          <h2 className="mt-10 text-lg font-bold">End-to-end thinking</h2>
          <p className="mt-2 text-sm leading-6 text-[#555e59]">Voice intake → instant rules grade → optional escalate-only refinement → three human checkpoints with written-note overrides → unit reservation, road-following routes, and a session-local audit trail. Every value carries provenance: local rules / model / fallback; measured / simulated / absent.</p>

          <h2 className="mt-10 text-lg font-bold">Honesty</h2>
          <p className="mt-2 text-sm leading-6 text-[#555e59]">100% critical recall (9/9; Wilson 95% lower bound 0.70), 60% type accuracy (18/30), 60% severity accuracy (18/30), 23.3% under-triage (7/30), and 16.7% over-triage (5/30). This is a development regression suite, not clinical or field evidence. Reproduce via <code>npm run evaluate:local</code>; CI repeats the critical-recall gate. The model cannot dispatch, and the small corpus cannot establish real-world safety.</p>

          <h2 className="mt-10 text-lg font-bold">Prior art and the accountable grading boundary</h2>
          <p className="mt-2 text-sm leading-6 text-[#555e59]">VANKI proved translation belongs on the 112 line. We start where that ends: after the words are understood, something still has to decide how dangerous the call is — and must never quietly decide it is less dangerous than it looks.</p>
          <p className="mt-2 text-sm leading-6 text-[#555e59]">Bengaluru&apos;s VANKI supports multilingual emergency communication; Telangana&apos;s TG-ERSS also reports automated handling and filtering. We credit those deployed systems. The cited reports do not publish an executable severity floor or reproducible grading corpus; that is the evidence Kwik makes inspectable, not a claim that nobody else has safety controls. <a className="font-semibold text-[#087b91] underline" href="https://timesofindia.indiatimes.com/city/bengaluru/first-in-india-ai-powered-namma-112-goes-multilingual/amp_articleshow/130620599.cms">VANKI, 30 April 2026</a>; <a className="font-semibold text-[#087b91] underline" href="https://www.newindianexpress.com/amp/story/states/telangana/2026/Aug/06/telangana-police-launch-30-faster-ai-driven-emergency-response-system-dial-112">TG-ERSS, 6 August 2026</a>.</p>

          <h2 className="mt-10 text-lg font-bold">Why keep a model away from dispatch authority?</h2>
          <p className="mt-2 text-sm leading-6 text-[#555e59]">A Danish randomized trial found no significant improvement in dispatcher cardiac-arrest recognition in its primary comparison. That is why Kwik grades with rules first and requires human dispatch decisions, rather than treating AI assistance as proven clinical benefit. <a className="font-semibold text-[#087b91] underline" href="https://pubmed.ncbi.nlm.nih.gov/33404620/">Blomberg et al., 2021 randomized trial</a>. The human-oversight principles of <a className="font-semibold text-[#087b91] underline" href="https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng">EU AI Act Article 14</a> inform the design; this demonstration claims no certification or regulatory compliance.</p>

          <h2 className="mt-12 text-lg font-bold">What is real, simulated, or synthetic — in one table</h2>
          <p className="mt-2 text-sm text-[#555e59]">Every capability of this build, labelled. The same provenance labels appear inside the product interface.</p>
          <div className="mt-5 overflow-x-auto border border-[#cfd4cf]">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead className="bg-[#202422] text-white">
                <tr><th className="w-2/5 p-4 text-xs uppercase">Capability</th><th className="w-28 p-4 text-xs uppercase">Status</th><th className="p-4 text-xs uppercase">Detail</th></tr>
              </thead>
              <tbody>
                {realOrMock.map(([capability, status, detail]) => (
                  <tr key={capability} className="border-t border-[#cfd4cf]">
                    <th className="p-4 text-sm font-bold">{capability}</th>
                    <td className="p-4"><span className="rounded border border-[#087b91]/40 bg-[#e8f1f3] px-2 py-0.5 text-xs font-bold text-[#087b91]">{status}</span></td>
                    <td className="p-4 text-sm text-[#555e59]">{detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-14 text-lg font-bold">Built with Codex — the provider stack, disclosed</h2>
          <p className="mt-3 max-w-[760px] text-sm leading-6 text-[#555e59]">
            Codex and coding agents implemented and reviewed the core of this build: the deterministic
            triage engine and its no-downgrade floor (with regression and prompt-injection tests), the
            evaluation harness behind every number on <Link href="/benchmark" className="font-semibold text-[#087b91] hover:underline">/benchmark</Link>,
            the live voice pipeline (a production render-loop was diagnosed and fixed via controlled
            repro in real Chromium), and this judge package. The dated, commit-linked log is{" "}
            <a href="https://github.com/areycruzer/kwik-112/blob/main/CODEX_LOG.md" target="_blank" rel="noreferrer" className="font-semibold text-[#087b91] hover:underline">CODEX_LOG.md</a> in the repository.
          </p>
          <div className="mt-4 overflow-x-auto border border-[#cfd4cf]">
            <table className="w-full min-w-[600px] border-collapse text-left">
              <thead className="bg-[#202422] text-white">
                <tr><th className="w-40 p-3 text-xs uppercase">Layer</th><th className="p-3 text-xs uppercase">Provider</th><th className="p-3 text-xs uppercase">Why</th></tr>
              </thead>
              <tbody>
                <tr className="border-t border-[#cfd4cf]"><th className="p-3 text-sm">Build tooling</th><td className="p-3 text-sm">Codex + coding agents (OpenAI)</td><td className="p-3 text-sm text-[#555e59]">Implementation and adversarial review; the safety floor is code, not a prompt</td></tr>
                <tr className="border-t border-[#cfd4cf]"><th className="p-3 text-sm">Voice + prosody</th><td className="p-3 text-sm">Hume EVI</td><td className="p-3 text-sm text-[#555e59]">Live multilingual call-taker with per-utterance emotion measurement</td></tr>
                <tr className="border-t border-[#cfd4cf]"><th className="p-3 text-sm">Refinement model</th><td className="p-3 text-sm">GLM 4.5 Flash (free tier); any OpenAI-compatible provider via <code>OPENAI_API_KEY</code></td><td className="p-3 text-sm text-[#555e59]">Measured latency at zero cost for the public demo; the deterministic grader is provider-independent — refinement may only escalate</td></tr>
                <tr className="border-t border-[#cfd4cf]"><th className="p-3 text-sm">Routing</th><td className="p-3 text-sm">OSRM (OpenStreetMap)</td><td className="p-3 text-sm text-[#555e59]">Road-following dispatch routes with a straight-line offline fallback</td></tr>
              </tbody>
            </table>
          </div>

          <h2 className="mt-14 text-lg font-bold">Boundaries</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[#555e59]">
            <li>Kwik 112 is an independent demonstration. It is not an official 112, ERSS, Government of India, or C-DAC service, and it contacts no emergency infrastructure.</li>
            <li>Use synthetic scenarios only. A live call sends microphone audio to Hume; optional refinement sends transcript text to the configured model provider, and address lookup may send location text to a geocoder. Do not enter real personal data. The AI never dispatches; human overrides require a written note.</li>
            <li>The benchmark is a 30-case versioned synthetic corpus with a held-out split — a safety-oriented engineering measurement, not clinical evidence.</li>
          </ul>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-[6px] border border-[#cfd4cf] bg-white px-4 text-sm font-semibold hover:bg-[#eef0ed]">Back to overview</Link>
            <Link href="/transcript" className="inline-flex h-10 items-center gap-2 rounded-[6px] border border-[#cfd4cf] bg-white px-4 text-sm font-semibold hover:bg-[#eef0ed]"><Headphones className="h-4 w-4" aria-hidden /> Video transcript</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
