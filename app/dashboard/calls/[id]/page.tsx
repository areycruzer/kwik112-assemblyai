/**
 * Incident detail page — the full dossier for a single incident.
 *
 * Rebuilt on the design system (Task 18). It shows the FULL transcript
 * untruncated, the real prosody emotion values (or an em-dash where prosody was
 * never captured), the real stored confidence, the human-in-the-loop timeline
 * state for this incident, and the satellite locator map. It is reached from a
 * queue row's "Open detail" affordance and from the history module.
 */

'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, AlertTriangle, MapPin } from 'lucide-react';

import { EmergencyCall } from '@/lib/types';
import { mockCalls, getTimeElapsed } from '@/lib/mock-data';
import { glyphForIncidentType, type IncidentGlyph } from '@/lib/design/symbols';
import {
  DECISION_POINTS,
  currentPoint,
  readTimeline,
  type DecisionRecord,
  type TimelineState,
} from '@/lib/timeline';
import { cn } from '@/lib/utils';

import { Symbol } from '@/components/ui/symbol';
import { Panel, DataRow, Chip, Meter, type ChipTone } from '@/components/ui/panel';
import { DistressMeter } from '@/components/DistressMeter';
import { ResponseAssurancePanel } from '@/components/ResponseAssurancePanel';
import { IncidentFusionPanel } from '@/components/IncidentFusionPanel';
import {
  FUSION_STORAGE_KEY,
  findFusionSuggestions,
  fusionDecisionFor,
  linkedPrimaryFor,
  readFusionDecisions,
  type FusionDecision,
  type FusionSuggestion,
} from '@/lib/incident-fusion';
import {
  severityTone,
  priorityCode,
  distressOf,
  triageSource,
  recommendedUnits,
  confidencePercent,
} from '@/lib/incident';

// Leaflet needs the DOM; render the locator client-side only.
const MiniLocationMap = dynamic(() => import('@/components/MiniLocationMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-deep">
      <span className="label">Initializing locator…</span>
    </div>
  ),
});

interface PageProps {
  params: Promise<{ id: string }>;
}

/** A stored transcript segment. Real calls carry `{ text, role, timestamp }`. */
interface StoredSegment {
  text?: string;
  role?: string;
  speaker?: string;
  timestamp?: string;
}

function normalizeSegments(transcript: unknown): StoredSegment[] {
  if (!Array.isArray(transcript)) return [];
  return transcript.filter(
    (s): s is StoredSegment => !!s && typeof s === 'object' && typeof (s as StoredSegment).text === 'string',
  );
}

/** A caller/agent label for a transcript segment. */
function speakerLabel(segment: StoredSegment): string {
  const role = segment.role ?? segment.speaker;
  return role === 'assistant' ? 'Kwik 112 agent' : 'Caller';
}

const ACTION_TONE: Record<string, ChipTone> = {
  confirmed: 'safe',
  amended: 'mild',
  overridden: 'critical',
};

export default function CallDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const callId = resolvedParams.id;

  const [call, setCall] = useState<EmergencyCall | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [timeline, setTimeline] = useState<TimelineState | null>(null);
  const [fusion, setFusion] = useState<FusionSuggestion>();
  const [fusionDecision, setFusionDecision] = useState<FusionDecision>();
  const [linkedPrimaryCallId, setLinkedPrimaryCallId] = useState<string | null>(null);

  // Load the call, its fusion context, and its timeline. Runs on mount, on
  // every cross-tab storage write (calls, timeline, fusion decisions — so a
  // dispatch recorded in the console tab appears here instantly), and on a
  // 3-second fallback poll for same-tab changes the storage event cannot see.
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      if (cancelled) return;
      let found: EmergencyCall | undefined;
      try {
        const stored = localStorage.getItem('kwik_emergency_calls');
        const all = stored ? JSON.parse(stored) : [];
        const combined = [...(Array.isArray(all) ? all : []), ...mockCalls];
        found = combined.find((c) => c?.id === callId);
        const suggestion = findFusionSuggestions(combined).find((candidate) =>
          [candidate.primary_call_id, ...candidate.related_call_ids].includes(callId),
        );
        const decisions = readFusionDecisions();
        setFusion(suggestion);
        setFusionDecision(fusionDecisionFor(callId, decisions, suggestion?.key));
        setLinkedPrimaryCallId(linkedPrimaryFor(callId, decisions));
      } catch (e) {
        console.error(e);
        found = mockCalls.find((c) => c.id === callId);
      }
      if (found) {
        setNotFound(false);
        setCall(found);
        setTimeline(readTimeline(callId));
      } else {
        setNotFound(true);
      }
    };

    load();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === 'kwik_emergency_calls' ||
        event.key === 'dispatch_timeline' ||
        event.key === FUSION_STORAGE_KEY
      ) {
        load();
      }
    };
    window.addEventListener('storage', onStorage);
    const poll = window.setInterval(load, 3000);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
      window.clearInterval(poll);
    };
  }, [callId]);

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ground text-ink">
        <p className="text-md font-semibold">Incident #{callId} not found</p>
        <p className="text-sm text-ink-3">It may have been resolved and cleared from storage.</p>
        <Link
          href="/dashboard"
          className="mt-2 inline-flex items-center gap-1.5 rounded-[4px] bg-accent px-3 py-2 text-sm font-semibold text-deep hover:bg-accent-dim"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Return to command desk
        </Link>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground text-ink-3">
        <span className="label">Retrieving incident #{callId}…</span>
      </div>
    );
  }

  const glyph: IncidentGlyph = glyphForIncidentType(call.incident_type);
  const subtype = call.incident_subtype || call.incident_type || 'Unclassified incident';
  const location = call.caller_location;
  const confidence =
    confidencePercent(location?.confidence) ?? confidencePercent(call.location_confidence);
  const accuracyRadius =
    typeof location?.accuracy_radius === 'number' ? location.accuracy_radius : undefined;
  const gradeConfidence = confidencePercent(call.ai_confidence ?? call.ai_triage?.confidence);
  const threats = call.immediate_threats ?? [];
  const units = recommendedUnits(call);
  const segments = normalizeSegments(call.transcript);
  const emotions = call.ai_triage?.emotion_analysis?.top_emotions ?? [];
  const summary =
    call.ai_summary ||
    call.ai_triage?.summary ||
    call.chief_complaint ||
    'No AI triage summary is available for this incident yet.';
  const nextPoint = timeline ? currentPoint(timeline) : null;
  const recordByPoint = new Map<string, DecisionRecord>(
    (timeline?.records ?? []).map((r) => [r.point, r]),
  );

  return (
    <div className="flex min-h-screen flex-col bg-ground text-ink">
      {/* ---- HEADER -------------------------------------------------------- */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-rule-strong bg-deep px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-[4px] border border-rule bg-panel px-2.5 py-1.5 text-2xs font-medium uppercase tracking-wide text-ink-2 hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Command desk
          </Link>
          <span className="h-5 w-px bg-rule" aria-hidden />
          <Symbol
            spec={{ kind: 'incident', glyph, severity: call.severity, distress: distressOf(call), size: 26 }}
            className="shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="label">Incident dossier</span>
              <Chip tone={severityTone(call.severity)} dot>
                {priorityCode(call)}
              </Chip>
            </div>
            <h1 className="truncate text-md font-semibold capitalize text-ink">
              {subtype} <span className="text-ink-4">#{call.id}</span>
            </h1>
          </div>
        </div>
        <div className="hidden shrink-0 flex-col items-end sm:flex">
          <span className="label">Reported</span>
          <span className="tnum text-sm text-ink-2">{getTimeElapsed(call.created_at)}</span>
        </div>
      </header>

      {/* ---- BODY ---------------------------------------------------------- */}
      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-12">
        {/* LEFT — telemetry + transcript */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          <Panel title="Caller & location">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <DataRow label="Caller" value={call.caller_number || '—'} mono />
                <DataRow label="Language" value={call.language || '—'} />
                <DataRow label="Triage source" value={triageSource(call)} />
                <DataRow label="Status" value={<span className="uppercase">{call.status || 'active'}</span>} />
              </div>
              <div className="border-t border-rule pt-3">
                <span className="label flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-accent" aria-hidden />
                  Triangulated address
                </span>
                <p className="mt-1 break-words text-sm text-ink">
                  {location?.address || 'Location pending verification'}
                </p>
                <p className="mt-1 text-xs text-ink-3">
                  Confidence: <span className="text-ink-2">{confidence ?? 'pending'}</span>
                  {accuracyRadius != null && (
                    <>
                      {' · '}Accuracy: <span className="tnum text-ink-2">±{accuracyRadius} m</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </Panel>

          <Panel title={gradeConfidence ? `AI triage summary · ${gradeConfidence} confidence` : 'AI triage summary'}>
            <p className="text-sm leading-relaxed text-ink-2">{summary}</p>

            {threats.length > 0 && (
              <div className="mt-3 border-t border-rule pt-3">
                <span className="label flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-mild" aria-hidden />
                  Immediate threats
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {threats.map((threat) => (
                    <Chip key={threat} tone="critical">
                      {threat}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 border-t border-rule pt-3">
              <span className="label">Recommended units</span>
              <div className="mt-1.5">
                {units.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {units.map((unit) => (
                      <Chip key={unit} tone="accent">
                        {unit}
                      </Chip>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-ink-3">No units recommended yet.</span>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Response assurance">
            <ResponseAssurancePanel call={call} linkedPrimaryCallId={linkedPrimaryCallId} />
          </Panel>

          {(fusion || fusionDecision) && (
            <Panel title="Possible same incident — human review required">
              <IncidentFusionPanel
                callId={call.id}
                suggestion={fusion}
                decision={fusionDecision}
              />
            </Panel>
          )}

          <Panel
            title="Full transcript"
            action={<span className="tnum text-2xs text-ink-4">{segments.length} segments</span>}
          >
            {segments.length > 0 ? (
              <ol className="flex flex-col gap-3">
                {segments.map((segment, index) => {
                  const isCaller = (segment.role ?? segment.speaker) !== 'assistant';
                  return (
                    <li key={index} className="flex flex-col gap-1">
                      <span
                        className={cn(
                          'text-2xs font-medium uppercase tracking-wide',
                          isCaller ? 'text-accent' : 'text-ink-3',
                        )}
                      >
                        {speakerLabel(segment)}
                      </span>
                      {/* Full text, deliberately unclamped. */}
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">
                        {segment.text}
                      </p>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-ink-3">
                No transcript stored. A full turn-by-turn transcript is captured only for calls
                taken through the live Kwik 112 voice station.
              </p>
            )}
          </Panel>
        </div>

        {/* RIGHT — locator, prosody, timeline */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Panel title="Incident locator" className="overflow-hidden">
            <div className="-m-3 h-64">
              {location?.latitude != null && location?.longitude != null ? (
                <MiniLocationMap
                  latitude={location.latitude}
                  longitude={location.longitude}
                  accuracyRadius={accuracyRadius}
                  address={location.address}
                  severity={call.severity}
                  incidentType={call.incident_type}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-deep text-ink-4">
                  <span className="label">Awaiting a positional fix</span>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Prosody · emotion breakdown">
            <div className="mb-3">
              <DistressMeter level={distressOf(call)} />
            </div>
            {emotions.length > 0 ? (
              <div className="flex flex-col gap-2.5 border-t border-rule pt-3">
                {emotions.map((e) => {
                  const pct = Math.round(Math.min(100, Math.max(0, e.intensity * 100)));
                  return (
                    <div key={e.emotion} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm capitalize text-ink-2">{e.emotion}</span>
                        <span className="tnum text-sm text-ink">{pct}</span>
                      </div>
                      <Meter value={pct} max={100} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="border-t border-rule pt-3 text-xs text-ink-4">
                No prosody captured. Emotion values appear for calls taken through the live 112
                Kwik 112 voice station; a seeded or keyword-graded call shows an em-dash.
              </p>
            )}
          </Panel>

          <Panel title="Decision timeline">
            <ol className="flex flex-col gap-2">
              {DECISION_POINTS.map((point) => {
                const record = recordByPoint.get(point);
                const isNext = point === nextPoint;
                return (
                  <li
                    key={point}
                    className="flex items-center justify-between gap-2 rounded-[6px] border border-rule bg-panel-raised px-2.5 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-ink">{point}</span>
                      {record?.proposal && (
                        <>
                          <span className="mt-0.5 text-xs text-ink-2">
                            {record.proposal.heading}
                          </span>
                          {record.proposal.items.map((item) => (
                            <span key={item} className="tnum mt-0.5 text-2xs text-ink-3">
                              {item}
                            </span>
                          ))}
                        </>
                      )}
                      {record?.note && (
                        <span className="mt-0.5 break-words text-xs text-ink-3">{record.note}</span>
                      )}
                    </div>
                    {record ? (
                      <Chip tone={ACTION_TONE[record.action] ?? 'neutral'}>{record.action}</Chip>
                    ) : isNext ? (
                      <Chip tone="accent">awaiting</Chip>
                    ) : (
                      <span className="text-2xs uppercase tracking-wide text-ink-4">pending</span>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 text-2xs text-ink-4">
              {nextPoint
                ? `Next operator decision: ${nextPoint}.`
                : 'All decision points recorded for this incident.'}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
