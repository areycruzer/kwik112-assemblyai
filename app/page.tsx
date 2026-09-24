import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, AudioLines, Check, ExternalLink, Github, Headphones, ShieldCheck } from "lucide-react";
import { VOICE_STATION_HREF } from "@/lib/voice-launch";
import styles from "./landing.module.css";

export const metadata = {
  title: "KWIK 112 | AI-assisted emergency dispatch simulation",
  description: "Train on multilingual emergency calls with instant triage, live situational awareness, and human-controlled dispatch.",
  alternates: { canonical: "/" },
};

const flow = [
  ["01", "Receive", "A caller speaks naturally in Hindi, Hinglish, or English."],
  ["02", "Understand", "Transcript, location, injuries, and voice cues reach the desk."],
  ["03", "Grade", "Deterministic rules assign an immediate safety-first priority."],
  ["04", "Refine", "Model review may escalate severity, but never downgrade it."],
  ["05", "Dispatch", "A human selects the response and sends units en route."],
  ["06", "Audit", "Evidence, overrides, units, and decisions remain traceable."],
];

const callers = [
  { number: "01", name: "Ramesh", language: "Hinglish", incident: "Motorcycle collision", detail: "A panicked bystander near Moolchand Metro reports two injured riders." },
  { number: "02", name: "Sharma ji", language: "Hindi / Hinglish", incident: "Cardiac arrest", detail: "A distressed family caller reports no breathing and no pulse in Shalimar Bagh." },
  { number: "03", name: "John", language: "English", incident: "Commercial fire", detail: "A market caller reports smoke, trapped people, and collapse risk in Chandni Chowk." },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "KWIK 112",
  applicationCategory: "Emergency dispatch decision-support software",
  operatingSystem: "Web",
  isAccessibleForFree: true,
  description: "An independent multilingual AI voice call-taker simulation and auditable decision console for human emergency dispatchers.",
};

export default function Home() {
  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="KWIK 112 home">
          <AudioLines aria-hidden />
          <strong>KWIK 112</strong>
          <span>Synthetic dispatch simulation</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="#workflow">Workflow</a>
          <a href="#evidence">Evidence</a>
          <Link href="/for-judges">For judges</Link>
        </nav>
        <Link href={VOICE_STATION_HREF} className={styles.headerCta}>Start live demo call <ArrowRight aria-hidden /></Link>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <Image src="/screenshots/dashboard-command-center.png" alt="KWIK 112 dispatcher console showing a cardiac arrest incident on the Delhi situational map" fill priority sizes="100vw" className={styles.heroImage} />
        <div className={styles.heroShade} />
        <div className={styles.heroContent}>
          <p className={styles.liveLabel}><span /> Live emergency simulation</p>
          <h1 id="hero-title">KWIK 112</h1>
          <p className={styles.heroStatement}>Use the ring time.<br />Prepare the human response.</p>
          <p className={styles.heroCopy}>Proposed middleware for the 112 queue. Hindi, Hinglish, and English intake; a safety floor the model cannot lower. The citizen would dial from a keypad phone on 2G—no app, URL, or reading. This browser demo emulates that call.</p>
          <p className={styles.heroDisclosure}>Built on the AssemblyAI Voice Agent API; optional severity refinement runs through the AssemblyAI LLM Gateway. Independent synthetic demonstration, not an official 112 service.</p>
          <div className={styles.heroActions}>
            <Link id="place-a-call" href={VOICE_STATION_HREF} className={styles.primaryButton}><Headphones aria-hidden /> Start live demo call <ArrowRight aria-hidden /></Link>
            <Link href="/dashboard" className={styles.secondaryButton}>Open dispatch console <ArrowRight aria-hidden /></Link>
          </div>
        </div>
        <a href="#evidence" className={styles.scrollCue} aria-label="Scroll to evidence"><ArrowDown aria-hidden /></a>
      </section>

      <section id="evidence" className={styles.evidence} aria-labelledby="evidence-title">
        <div className={styles.sectionInner}>
          <div className={styles.evidenceIntro}>
            <p className={styles.kicker}>Measured, not implied</p>
            <h2 id="evidence-title">Safety starts before dispatch.</h2>
          </div>
          <dl className={styles.metrics}>
            <div><dt>Critical recall</dt><dd>100%</dd><p>9/9 held-out cases · Wilson 95% LB 0.70</p></div>
            <div><dt>Threat detection</dt><dd>100%</dd><p>3 of 3 held-out cases</p></div>
            <div><dt>Local triage latency</dt><dd>0.042<span> ms</span></dd><p>Median on the benchmark</p></div>
          </dl>
          <p className={styles.evidenceNote}>Development regression suite, 30 synthetic calls: 100% critical recall (9/9) — no critical call missed — with location text 100% (25/25). The full case-level breakdown, including type/severity accuracy and under- and over-triage, is published unedited. Local p95 5.219ms; timings exclude providers and vary by run. <Link href="/benchmark">Inspect the committed results</Link> · <a href="https://github.com/areycruzer/kwik112-assemblyai/tree/main/evaluation/results">Raw evidence</a>.</p>
          <ul className={styles.problemSources} aria-label="Sourced emergency intake context">
            <li><strong>0.28% genuine</strong> of about 16 lakh daily combined 112/Dial 100 calls in Telangana. <a href="https://the420.in/telangana-emergency-calls-ai-tools-erss-dial-112-genuine-calls-dispatch-2026/">25 June 2026 report</a>.</li>
            <li><strong>Under 15 seconds</strong> is the MHA answer-speed target; the reported national response average is about 18 minutes. Different stages, not measured ring time. <a href="https://www.mha.gov.in/sites/default/files/2022-08/NERSGuideline_2100815%5B1%5D.pdf">MHA, 2015, p20</a>; <a href="https://www.newindianexpress.com/amp/story/states/telangana/2026/Aug/06/telangana-police-launch-30-faster-ai-driven-emergency-response-system-dial-112">DGP report, 6 August 2026</a>.</li>
            <li><strong>10,000 of 15,672</strong> daily Delhi calls were reported blank; IVR filtering was already in place. <a href="https://timesofindia.indiatimes.com/city/delhi/112-number-gets-10000-blank-calls-a-day-thanks-to-phones-power-button/articleshow/71383219.cms">1 October 2019 report</a>.</li>
            <li><strong>A merged queue:</strong> SaveLIFE Foundation v. Union of India, W.P.(C) 726/2024, 2026 INSC 567, ordered six helplines integrated into 112 within three months. The window has closed by calendar inference; implementation is not established here. <a href="https://api.sci.gov.in/supremecourt/2024/49959/49959_2024_3_60_71558_FinalOrder_26-May-2026.pdf">Order, 26 May 2026</a>.</li>
          </ul>
        </div>
      </section>

      <section id="workflow" className={styles.workflow} aria-labelledby="workflow-title">
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.kicker}>From call to closure</p><h2 id="workflow-title">One operational thread. Six decisions.</h2></div>
            <p>Every stage adds context without taking control away from the dispatcher.</p>
          </div>
          <ol className={styles.flow}>
            {flow.map(([number, title, copy]) => <li key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></li>)}
          </ol>
        </div>
      </section>

      <section className={styles.callers} aria-labelledby="callers-title">
        <div className={styles.sectionInner}>
          <div className={styles.callersGrid}>
            <div className={styles.callersIntro}>
              <p className={styles.kicker}>Three scripted calls</p>
              <h2 id="callers-title">Hear the pressure. Watch the incident form.</h2>
              <p>Each scripted performance carries a distinct language and emergency through the incident pipeline. Its emotion frames are simulated; live calls run on the AssemblyAI Voice Agent API. Fleet and ETAs are synthetic.</p>
              <Link href={VOICE_STATION_HREF} className={styles.textLink}>Open voice station <ArrowRight aria-hidden /></Link>
            </div>
            <div className={styles.callerList}>
              {callers.map((caller) => (
                <Link key={caller.name} href={VOICE_STATION_HREF} className={styles.callerRow}>
                  <span className={styles.callerNumber}>{caller.number}</span>
                  <span className={styles.callerIdentity}><strong>{caller.name}</strong><small>{caller.language}</small></span>
                  <span className={styles.callerIncident}><strong>{caller.incident}</strong><small>{caller.detail}</small></span>
                  <ArrowRight aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.finalSection} aria-labelledby="final-title">
        <div className={styles.sectionInner}>
          <div className={styles.proofGrid}>
            <div className={styles.proofLead}><p className={styles.kicker}>Built for scrutiny</p><h2 id="final-title">Conservative by code. Accountable by design.</h2></div>
            <div className={styles.safetyCopy}><ShieldCheck aria-hidden /><p>Deterministic triage sets a safety floor. A calm report of no pulse remains critical. Emotion stays within its severity band; possible prank cues are annotations, never automatic rejection. Humans record INTAKE, DISPATCH, and RESOLUTION; overrides need notes. The browser-local audit persists until storage is cleared.</p></div>
            <ul className={styles.proofList}>
              <li><Check aria-hidden /><span><strong>30</strong> held-out synthetic calls</span></li>
              <li><Check aria-hidden /><span><strong>0</strong> autonomous dispatch decisions</span></li>
              <li><Check aria-hidden /><span><strong>1</strong> auditable incident timeline</span></li>
            </ul>
          </div>
          <div className={styles.finalCta}>
            <div><p className={styles.kicker}>The fastest way to understand it</p><h2>Place the call. See the response.</h2></div>
            <div className={styles.finalActions}>
              <Link href={VOICE_STATION_HREF} className={styles.primaryButton}><Headphones aria-hidden /> Start live demo call <ArrowRight aria-hidden /></Link>
              <Link href="/benchmark" className={styles.darkLink}>View benchmark <ArrowRight aria-hidden /></Link>
            </div>
          </div>
          <p className={styles.disclaimer}>Independent simulation. Not an official 112, ERSS, government, or C-DAC service. It does not connect to emergency infrastructure. <a href="https://pubmed.ncbi.nlm.nih.gov/35475939/" target="_blank" rel="noreferrer">Safety context <ExternalLink aria-hidden /></a></p>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <p><strong>KWIK 112</strong><span>Independent AI-assisted emergency dispatch simulation.</span></p>
          <nav aria-label="Footer navigation">
            <Link href="/for-judges">For judges</Link>
            <Link href="/transcript">Transcript</Link>
            <Link href="/llms.txt">Crawler guide</Link>
            <a href="https://github.com/areycruzer/kwik112-assemblyai" target="_blank" rel="noreferrer"><Github aria-hidden /> GitHub</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
