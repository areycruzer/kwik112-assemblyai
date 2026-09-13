import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gauge } from "lucide-react";
import results from "../../evaluation/results/local-held_out-latest.json";

export const metadata: Metadata = {
  alternates: { canonical: "/benchmark" },
  title: "Benchmark — Kwik 112 held-out triage evaluation",
  description:
    "Reproducible held-out results for the Kwik 112 deterministic triage engine: 100% critical recall (9/9), 60% type and severity accuracy, p50 latency ~0.042ms.",
};

const m = results.metrics as unknown as Record<string, number>;
const meta = results.metadata as unknown as Record<string, string | number | boolean | null>;

const rows: [string, string, string][] = [
  ["Critical recall", `${Math.round(m.critical_recall * 100)}%`, `${m.critical_true_positives}/${m.critical_true_positives + m.critical_false_negatives} critical cases retained — Wilson 95% lower bound 0.70`],
  ["Type accuracy", `${Math.round(m.type_accuracy * 100)}%`, `${m.cases} held-out synthetic calls, corpus v${meta.benchmark_version}`],
  ["Severity accuracy", `${Math.round(m.severity_accuracy * 100)}%`, `${m.cases} held-out synthetic calls`],
  ["Under-triage", `${(m.under_triage_rate * 100).toFixed(1)}%`, `${m.under_triage_count}/${m.cases} calls graded below the reference severity`],
  ["Over-triage", `${(m.over_triage_rate * 100).toFixed(1)}%`, `${m.over_triage_count}/${m.cases} calls graded above the reference severity`],
  ["Location accuracy", `${Math.round(m.location_accuracy * 100)}%`, `${m.location_cases} cases with a reference location`],
  ["Threat detection", `${Math.round(m.threat_accuracy * 100)}%`, `${m.threat_cases} cases with weapon or entrapment threats`],
];

export default function BenchmarkPage() {
  return (
    <main className="min-h-screen bg-[#f4f5f2] text-[#151817]">
      <section className="bg-[#171717] py-14 text-white">
        <div className="mx-auto max-w-[900px] px-5 md:px-8">
          <p className="text-xs font-semibold uppercase text-[#78dcff]">Held-out evidence</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Triage benchmark, reproduced from the repository</h1>
          <p className="mt-3 max-w-[720px] text-sm font-semibold text-[#fabc1f]">This 30-case set is the development regression suite: the rules were tuned against development cases and this held-out split tracks them. A larger, freshly blinded corpus is the next planned measurement — treat these as engineering numbers, not field results.</p>
          <p className="mt-4 max-w-[720px] text-sm leading-6 text-[#c3cbc7]">
            The measured results below come from <code className="rounded bg-black/40 px-1.5 py-0.5 text-white">npm run evaluate:local</code> on the
            versioned synthetic corpus in <code className="rounded bg-black/40 px-1.5 py-0.5 text-white">evaluation/cases.json</code>. Explanatory copy and
            the Wilson interval are reported separately. Local engine timing excludes voice, model, geocoding, and routing latency and varies by machine.
          </p>
          <p className="mt-3 text-xs text-[#c3cbc7]">Independent synthetic-data demonstration; not an official 112, ERSS, government, or C-DAC service.</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#a9b4ae]">
            <span>Corpus v{String(meta.benchmark_version)} · split: {String(meta.split)} · mode: {String(meta.mode)}</span>
            <span>Evaluated {new Date(String(meta.evaluated_at)).toISOString().slice(0, 10)} at the code state of commit {String(meta.commit).slice(0, 7)}. CI re-runs the critical-recall gate on pushes; inspect the workflow run and its commit before treating a badge as current proof.</span>
            <span className="inline-flex items-center gap-1"><Gauge className="h-3.5 w-3.5" aria-hidden /> latency p50 {m.latency_p50_ms.toFixed(3)}ms · p95 {m.latency_p95_ms.toFixed(2)}ms</span>
          </div>
        </div>
      </section>

      <section className="border-b border-[#ccd1cc] bg-white py-12">
        <div className="mx-auto max-w-[900px] px-5 md:px-8">
          <h2 className="text-lg font-bold">Results</h2>
          <p className="mt-3 text-sm text-[#555e59]">Location accuracy checks expected text terms, not coordinate accuracy or successful geocoding. Threat detection checks the three labeled threat cases; it is not general threat recall.</p>
          <div className="mt-5 overflow-x-auto border border-[#cfd4cf]">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead className="bg-[#202422] text-white">
                <tr>
                  <th className="w-1/3 p-4 text-xs uppercase">Metric</th>
                  <th className="w-24 p-4 text-xs uppercase">Value</th>
                  <th className="p-4 text-xs uppercase">Denominator</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([metric, value, note]) => (
                  <tr key={metric} className="border-t border-[#cfd4cf]">
                    <th className="p-4 text-sm font-bold">{metric}</th>
                    <td className="p-4 text-lg font-bold text-[#087b91]">{value}</td>
                    <td className="p-4 text-sm text-[#555e59]">{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-12 text-lg font-bold">Context: human and protocol baselines</h2>
          <p className="mt-3 text-sm leading-6 text-[#555e59]">
            Published US field-triage guidance targets under-triage at 5% or less while accepting 25–35% over-triage; a systematic review observed real-world
            ranges of 1.6–72% under-triage and 9.9–87.4% over-triage. A Copenhagen study of 108,607 emergency calls found human dispatchers recognized
            out-of-hospital cardiac arrest with 72.5% sensitivity. Kwik 112&apos;s 30-case held-out result is reported directly and does not claim clinical
            equivalence from a small synthetic corpus.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-[#08677a]">
            <a href="https://pubmed.ncbi.nlm.nih.gov/35475939/" target="_blank" rel="noreferrer" className="hover:underline">2022 field-triage guideline</a>
            <a href="https://pubmed.ncbi.nlm.nih.gov/35191799/" target="_blank" rel="noreferrer" className="hover:underline">Over/under-triage systematic review</a>
            <a href="https://pubmed.ncbi.nlm.nih.gov/30664917/" target="_blank" rel="noreferrer" className="hover:underline">Dispatcher OHCA recognition (Blomberg 2019)</a>
          </div>

          <h2 className="mt-12 text-lg font-bold">Reproduce it yourself</h2>
          <pre className="mt-3 overflow-x-auto rounded border border-[#cfd4cf] bg-[#202422] p-4 text-xs leading-6 text-[#e5e9e6]"><code>git clone https://github.com/areycruzer/kwik-112{"\n"}cd kwik-112{"\n"}npm install{"\n"}npm run evaluate:local   # regenerates every number above</code></pre>
          <p className="mt-3 text-sm text-[#555e59]">
            Raw machine-readable output:{" "}
            <a href="https://github.com/areycruzer/kwik-112/blob/main/evaluation/results/local-held_out-latest.json" target="_blank" rel="noreferrer" className="font-semibold text-[#087b91] hover:underline">
              local-held_out-latest.json
            </a>{" "}
            (committed to the repository).
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-[6px] border border-[#cfd4cf] bg-white px-4 text-sm font-semibold hover:bg-[#eef0ed]">Back to overview</Link>
            <Link href="/for-judges" className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-[#087b91] px-4 text-sm font-bold text-white hover:bg-[#06626f]">For judges <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
        </div>
      </section>
    </main>
  );
}
