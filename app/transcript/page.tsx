import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Youtube } from "lucide-react";

export const metadata: Metadata = {
  alternates: { canonical: "/transcript" },
  title: "Demo recording script — Kwik 112",
  description:
    "Recording script for the independent Kwik 112 browser demonstration: Hindi, Hinglish, and English intake, a deterministic safety floor, and human dispatch.",
};

const VIDEO_URL = "https://youtu.be/JdzAXL08_24";

const narration = "Every Indian already knows how to use it: dial 112.\nThe caller needs no app or screen.\n\nKwik 112 asks one short question at a time:\nlocation, immediate danger, what happened, and how many people.\n\nBuilt on the AssemblyAI Voice Agent API: speech-to-text,\nthe agent's reply, turn-taking, and a mid-call tool reach\nthe console live, in Hindi, Hinglish, or English.\n\nThe local rules grade is immediate. The agent may propose\na higher severity through its tool, but can never lower\nthe deterministic floor.\n\nA human confirms intake, reads conservative guidance,\nselects units, and makes every dispatch decision.\n\nTranscript source, triage engine, override notes,\nunits, and resolution remain auditable.\n\nHeld-out local benchmark: critical recall 100%, 9 of 9;\nthe full case-level breakdown is published on the benchmark page.\n\nSynthetic corpus, no live 112 integration.\nHuman dispatch stays in command.";

export default function TranscriptPage() {
  return (
    <main className="min-h-screen bg-[#f4f5f2] text-[#151817]">
      <section className="bg-[#171717] py-14 text-white">
        <div className="mx-auto max-w-[820px] px-5 md:px-8">
          <p className="text-xs font-semibold uppercase text-[#78dcff]">Demo companion</p>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Demo recording script</h1>
          <p className="mt-3 text-sm text-[#c3cbc7]">Independent synthetic-data demonstration; not an official 112 service. This is the repository recording script, not a verified word-for-word transcript of the uploaded video. Owner caption verification remains pending.</p>
          <a href={VIDEO_URL} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-10 items-center gap-2 rounded-[6px] bg-[#f40000] px-4 text-sm font-bold text-white hover:bg-[#d90000]">
            <Youtube className="h-4 w-4" aria-hidden /> Watch the demo video
          </a>
        </div>
      </section>
      <section className="border-b border-[#ccd1cc] bg-white py-12">
        <div className="mx-auto max-w-[820px] px-5 md:px-8">
          <h2 className="text-xs font-semibold uppercase text-[#c71920]">Repository narration</h2>
          <p className="mt-6 whitespace-pre-line text-sm leading-7 text-[#3d4946]">{narration}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-[6px] border border-[#cfd4cf] bg-white px-4 text-sm font-semibold hover:bg-[#eef0ed]">Back to overview</Link>
            <Link href="/for-judges" className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-[#087b91] px-4 text-sm font-bold text-white hover:bg-[#06626f]">For judges <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
        </div>
      </section>
    </main>
  );
}
