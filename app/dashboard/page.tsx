/**
 * Kwik 112 — Tactical CAD console.
 *
 * Four-column shell: command bar across the top, then an icon module rail, the
 * incident panel (queue + detail), and a full-bleed satellite map. "Kwik 112"
 * badges only the emotion-aware voice-intake action in the command bar.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  MapPin,
  Radio,
  Search,
  Shield,
  Bell,
  BellOff,
  X,
} from 'lucide-react';

import { CallStatus, EmergencyCall } from '@/lib/types';
import { mockCalls, getTimeElapsed } from '@/lib/mock-data';
import { glyphForIncidentType, type IncidentGlyph } from '@/lib/design/symbols';
import { ACK_STORAGE_KEY, deriveAlerts, readAcknowledged, type AlertInput } from '@/lib/alerts';
import { prepareGoldenDemo } from '@/lib/golden-prep';
import {
  severityTone,
  priorityCode,
  distressOf,
  triageSource,
  recommendedUnits,
  confidencePercent,
  spokenLanguage,
  standardResponseUnits,
} from '@/lib/incident';
import { cn } from '@/lib/utils';
import {
  compactIncidentSummary,
  dashboardHeaderMetrics,
  dashboardRegionVisibility,
  defaultMobileIncidentOpen,
  defaultUnitPanelOpen,
  mobileNavigationInset,
  nextLiveCallPayload,
  presentLiveCall,
  sortIncidentQueue,
} from '@/lib/dashboard-presentation';
import { KWIK_LIVE_CALL_EVENT, type KwikLiveCallPayload } from '@/lib/live-call';
import { selectPreArrivalGuidance } from '@/lib/first-aid';
import { shouldAutoLaunchVoiceStation, shouldAutoOpenStationOnce } from '@/lib/voice-launch';

import { Symbol } from '@/components/ui/symbol';
import { Chip, DataRow } from '@/components/ui/panel';
import { DistressMeter } from '@/components/DistressMeter';
import { ModuleRail, type ModuleId } from '@/components/ModuleRail';
import { UnitRoster } from '@/components/UnitRoster';
import { TACTICAL_UNITS, etaLabel, haversineKm, localFleet } from '@/lib/units';
import { releaseUnit } from '@/lib/dispatch-reservations';
import { useReservedFleet } from '@/lib/useReservedFleet';
import { assessDispatch, type DispatchAssignment } from '@/lib/dispatch-assurance';
import { IncidentFusionPanel } from '@/components/IncidentFusionPanel';
import {
  findFusionSuggestions,
  fusionDecisionFor,
  isSeparateDispatchTransitionBlocked,
  linkedPrimaryFor,
  type FusionDecision,
  type FusionDecisionAction,
  type FusionSuggestion,
} from '@/lib/incident-fusion';
import { readTimeline, requiredDecisionPoints } from '@/lib/timeline';
import { useFusionDecisions } from '@/lib/useFusionDecisions';
import {
  isDelhiIncident,
  scopedIncidentSelection,
} from '@/lib/incident-scope';

import StartEmergencyCall from '@/components/StartEmergencyCall';
import IncidentTimeline from '@/components/IncidentTimeline';
import AlertsModule from '@/components/AlertsModule';
import HistoryModule from '@/components/HistoryModule';
import ForecastModule from '@/components/ForecastModule';
import IncidentKanbanBoard from '@/components/IncidentKanbanBoard';

// Leaflet needs the DOM; render the map client-side only.
const EmergencyMap = dynamic(() => import('@/components/EmergencyMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-deep">
      <p className="label">Initializing situational map…</p>
    </div>
  ),
});

type SeverityFilter = 'all' | 'critical' | 'high' | 'other';
type PanelView = 'queue' | 'detail';
type MainView = 'map' | 'board';

/**
 * A call still awaiting a model grade shows a REFINING chip. The server marks
 * exactly this state with `refinable: true` on the local-rules grade and clears
 * it (`false`) once refinement lands, so read that flag directly. The old
 * both-confidences-null test never fired: keyword triage always sets a 0.45
 * confidence, so the chip was dead code.
 */
function awaitingRefinement(call: EmergencyCall): boolean {
  return call.refinable === true;
}

// Unlocated calls stay visible so an operator can establish their location.
function visibleIncident(call: EmergencyCall): boolean {
  if (!call || !call.id) return false;
  const location = call.caller_location;
  const unknown = !location?.city?.trim() && !location?.state?.trim() &&
    !(Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude));
  return unknown || isDelhiIncident(call);
}

export default function DashboardPage() {
  const [goldenMode, setGoldenMode] = useState(false);
  const goldenModeRef = useRef(false);
  const goldenPrepared = useRef(false);
  useEffect(() => {
    if (goldenPrepared.current || new URLSearchParams(window.location.search).get('demo') !== 'golden') return;
    goldenPrepared.current = true;
    goldenModeRef.current = true;
    prepareGoldenDemo(localStorage);
    setGoldenMode(true);
    setVoiceLaunchSignal((value) => value + 1);
  }, []);
  const [calls, setCalls] = useState<EmergencyCall[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const [activeModule, setActiveModule] = useState<ModuleId>('monitoring');
  const [panelView, setPanelView] = useState<PanelView>('queue');
  const [mainView, setMainView] = useState<MainView>('map');
  const [unitPanelOpen, setUnitPanelOpen] = useState(false);
  const [mobileIncidentOpen, setMobileIncidentOpen] = useState(false);
  const [mobileNavInset, setMobileNavInset] = useState(0);
  const [regionVisibility, setRegionVisibility] = useState({
    showModuleRail: true,
    showIncidentSidebar: true,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [liveCall, setLiveCall] = useState<KwikLiveCallPayload | null>(null);

  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [workflowProposal, setWorkflowProposal] = useState<{ callId: string; unitId: string } | null>(null);
  const [voiceLaunchSignal, setVoiceLaunchSignal] = useState(0);
  const consumedLaunchLocation = useRef<string | null>(null);
  // Bumped when an alert is acknowledged so the alert memo (and therefore the
  // rail badge) recomputes against the freshly-persisted acknowledgement set.
  const [ackVersion, setAckVersion] = useState(0);

  const [now, setNow] = useState(0);
  const clock = now ? new Date(now).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  const { decisions: fusionDecisions, decide: decideFusion } = useFusionDecisions();

  // Live clock, tabular so the digits do not jitter.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const syncLayout = () => {
      setRegionVisibility(dashboardRegionVisibility(window.innerWidth));
      setMobileNavInset(mobileNavigationInset(window.innerWidth));
    };
    setUnitPanelOpen(defaultUnitPanelOpen(window.innerWidth));
    setMobileIncidentOpen(defaultMobileIncidentOpen(window.innerWidth));
    syncLayout();
    window.addEventListener('resize', syncLayout);
    return () => window.removeEventListener('resize', syncLayout);
  }, []);

  useEffect(() => {
    const launchFromLocation = () => {
      const locationKey = `${window.location.search}${window.location.hash}`;
      if (consumedLaunchLocation.current === locationKey) return;
      consumedLaunchLocation.current = locationKey;

      if (
        shouldAutoLaunchVoiceStation(window.location.search, window.location.hash) ||
        shouldAutoOpenStationOnce(window.sessionStorage)
      ) {
        setVoiceLaunchSignal((value) => value + 1);
      }
    };

    launchFromLocation();
    window.addEventListener('popstate', launchFromLocation);
    window.addEventListener('hashchange', launchFromLocation);
    return () => {
      window.removeEventListener('popstate', launchFromLocation);
      window.removeEventListener('hashchange', launchFromLocation);
    };
  }, []);

  // Reading the selection through a ref keeps `loadCalls` stable, so the poll
  // interval below is not torn down and rebuilt on every selection change.
  const selectedCallIdRef = useRef<string | null>(null);
  selectedCallIdRef.current = selectedCallId;

  /** @description Stored calls shadow their mock counterpart instead of joining it. */
  const mergeCalls = (stored: EmergencyCall[]): EmergencyCall[] => {
    const byId = new Map<string, EmergencyCall>();
    for (const call of [...stored, ...(goldenModeRef.current ? [] : mockCalls)].filter(visibleIncident)) {
      if (call && call.id && !byId.has(call.id)) byId.set(call.id, call);
    }
    return [...byId.values()];
  };

  const readStored = (): EmergencyCall[] => {
    try {
      const raw = localStorage.getItem('kwik_emergency_calls');
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) {
      console.error('Error reading stored calls:', e);
      return [];
    }
  };

  /**
   * @description Poll storage, but only push new state when something actually
   *              changed. Handing React a fresh array every five seconds makes
   *              the Leaflet effects tear down and rebuild every marker and
   *              re-centre the map under the operator.
   */
  const callsFingerprint = useRef<string>('');

  const loadCalls = useCallback(() => {
    const merged = mergeCalls(readStored());
    const fingerprint = merged.map((c) => `${c.id}:${c.status}:${c.updated_at}`).join('|');

    if (fingerprint !== callsFingerprint.current) {
      callsFingerprint.current = fingerprint;
      setCalls(merged);
    }

    const nextSelection = scopedIncidentSelection(selectedCallIdRef.current, merged);
    if (nextSelection !== selectedCallIdRef.current) {
      setSelectedCallId(nextSelection);
    }
  }, []);

  useEffect(() => {
    loadCalls();
    const interval = setInterval(loadCalls, 5000);
    return () => clearInterval(interval);
  }, [loadCalls]);

  useEffect(() => {
    const handleCallUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ call: EmergencyCall; isUpdate: boolean }>).detail;
      loadCalls();
      if (detail && !detail.isUpdate && visibleIncident(detail.call)) {
        setSelectedCallId(detail.call.id);
      }
    };
    window.addEventListener('kwik-call-updated', handleCallUpdated);
    return () => window.removeEventListener('kwik-call-updated', handleCallUpdated);
  }, [loadCalls]);

  // Cross-tab propagation: localStorage writes in another tab fire a `storage`
  // event here. Without this, a call created or acknowledged in a second
  // console tab only appeared after the 5-second poll — and acknowledgements
  // never propagated at all, leaving the other tab's alert badge stale.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'kwik_emergency_calls') loadCalls();
      if (event.key === null || event.key === ACK_STORAGE_KEY) setAckVersion((v) => v + 1);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [loadCalls]);

  useEffect(() => {
    const handleLiveCall = (event: Event) => {
      const payload = (event as CustomEvent<KwikLiveCallPayload>).detail;
      if (payload) setLiveCall((current) => nextLiveCallPayload(current, payload));
    };
    window.addEventListener(KWIK_LIVE_CALL_EVENT, handleLiveCall);
    return () => window.removeEventListener(KWIK_LIVE_CALL_EVENT, handleLiveCall);
  }, []);

  /**
   * @description Persist only the changed call. Writing the whole merged list
   *              back would push the mock seed into storage, where the next poll
   *              would merge it with `mockCalls` again and double the queue.
   *
   *              Checkpoint guard: moving a call into a dispatch-stage or
   *              resolution-stage status requires the corresponding human
   *              decision records. The Kanban drag and every other direct
   *              status write route through this handler, so the
   *              three-checkpoint promise cannot be bypassed by dragging a
   *              card across the board.
   */
  const handleUpdateCallStatus = useCallback((callId: string, newStatus: CallStatus) => {
    if (isSeparateDispatchTransitionBlocked(callId, newStatus, fusionDecisions)) {
      setSelectedCallId(callId);
      setPanelView('detail');
      setMainView('map');
      return;
    }

    const requiredPoints = requiredDecisionPoints(newStatus);
    if (requiredPoints.length) {
      const timeline = readTimeline(callId);
      const recorded = new Set(
        timeline.records.map((r) => ('point' in r ? r.point : null)).filter(Boolean),
      );
      const missing = requiredPoints.filter((point) => !recorded.has(point));
      if (missing.length) {
        console.warn(
          `Blocked status change to "${newStatus}": missing human checkpoint decision(s) ` +
            `${missing.join(', ')} for call ${callId}. Record them in the incident timeline.`,
        );
        setSelectedCallId(callId);
        setPanelView('detail');
        setWorkflowOpen(true);
        return;
      }
    }

    setCalls((prev) => {
      const target = prev.find((c) => c.id === callId);
      if (!target) return prev;

      const updated: EmergencyCall = {
        ...target,
        status: newStatus,
        updated_at: new Date().toISOString(),
      };

      try {
        const stored = readStored().filter((c) => c.id !== callId);
        localStorage.setItem('kwik_emergency_calls', JSON.stringify([updated, ...stored]));
      } catch (e) {
        console.error('Error persisting call status:', e);
      }

      const next = prev.map((c) => (c.id === callId ? updated : c));
      callsFingerprint.current = next
        .map((c) => `${c.id}:${c.status}:${c.updated_at}`)
        .join('|');
      return next;
    });
  }, [fusionDecisions]);

  /**
   * Open an incident from the board: switch the main area to the map AND put
   * the emergency panel on that incident's detail. Without the third line this
   * selected the call and moved to the map while the panel still showed the
   * queue, so the incident the operator just clicked was nowhere on screen.
   */
  const handleSelectCallAndNavigateToMap = useCallback((callId: string) => {
    setSelectedCallId(callId);
    setMainView('map');
    setPanelView('detail');
  }, []);

  // Stable identities keep the Leaflet marker effect from re-running (and
  // re-opening the popup) on every one-second clock tick.
  const handleMarkerClick = useCallback((id: string) => setSelectedCallId(id), []);
  const handleSelectUnit = useCallback(
    (id: string) => setSelectedUnitId((prev) => (prev === id ? null : id)),
    [],
  );
  /* ---- NEW CRITICAL CALL ------------------------------------------------
   * A P1 used to arrive in total silence: no sound, no announcement, no
   * movement — it simply appeared somewhere in the queue. A console whose job
   * is to be watched has to be able to interrupt the person watching it.
   * ---------------------------------------------------------------------- */
  const [announcement, setAnnouncement] = useState('');
  const [arrivedCriticalIds, setArrivedCriticalIds] = useState<string[]>([]);
  const [soundOn, setSoundOn] = useState(false);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const audioContextRef = useRef<AudioContext | null>(null);
  /**
   * Null until the first batch of calls lands. Opening the console must not
   * announce the seventeen incidents already on the board — only what arrives
   * while someone is watching.
   */
  const seenCallIds = useRef<Set<string> | null>(null);

  /** Two short notes through Web Audio, so there is no asset to ship or fail to load. */
  const playAlertTone = useCallback(() => {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = audioContextRef.current ?? new Ctor();
      audioContextRef.current = ctx;
      // Autoplay policy suspends a context created before a gesture; the sound
      // toggle is that gesture, and this resumes what it unlocked.
      void ctx.resume?.();
      [0, 0.18].forEach((offset, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = index === 0 ? 880 : 1174;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.18);
      });
    } catch {
      // Audio is a courtesy. The live region and the row highlight carry the
      // alert on their own, so a blocked or unavailable context changes nothing
      // that matters.
    }
  }, []);

  useEffect(() => {
    if (calls.length === 0) return;
    if (seenCallIds.current === null) {
      seenCallIds.current = new Set(calls.map((call) => call.id));
      return;
    }
    const seen = seenCallIds.current;
    const arrived = calls.filter((call) => !seen.has(call.id));
    if (arrived.length === 0) return;
    for (const call of arrived) seen.add(call.id);

    const critical = arrived.filter((call) => (call.severity ?? '').toLowerCase() === 'critical');
    if (critical.length === 0) return;

    setArrivedCriticalIds(critical.map((call) => call.id));
    setAnnouncement(
      critical.length === 1
        ? `New critical incident: ${critical[0].incident_subtype || critical[0].incident_type || 'unclassified'}` +
          `${critical[0].caller_location?.address ? ` at ${critical[0].caller_location.address}` : ''}.`
        : `${critical.length} new critical incidents.`,
    );
    if (soundOnRef.current) playAlertTone();

    // The highlight is an arrival cue, not a status. It clears itself so a row
    // sitting unactioned does not keep flashing for the rest of the shift.
    const settle = setTimeout(() => setArrivedCriticalIds([]), 12000);
    return () => clearTimeout(settle);
  }, [calls, playAlertTone]);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      const next = !on;
      // Turning it on IS the user gesture the autoplay policy wants, so unlock
      // the context here rather than at the next incident — otherwise the first
      // critical call after enabling sound would still be silent.
      if (next) {
        try {
          const Ctor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (Ctor) {
            audioContextRef.current = audioContextRef.current ?? new Ctor();
            void audioContextRef.current.resume?.();
          }
        } catch {
          /* Left silent; the visual alert is unaffected. */
        }
      }
      return next;
    });
  }, []);

  const handleDispatchUnit = useCallback(() => setWorkflowOpen(true), []);

  /**
   * Notifying a unit. Selecting a row in the roster used to be the end of the
   * interaction - it highlighted the marker and nothing else - so a dispatcher
   * could see the nearest ambulance and its ETA with no way to actually send
   * it. Reserving the unit against the call is what "notify" means here: it
   * flips the unit to en-route for this incident and busy for every other, and
   * the incident's Dispatch section lists it with its projected arrival.
   */
  const [dispatchNotice, setDispatchNotice] = useState<string | null>(null);
  const [dispatchFailed, setDispatchFailed] = useState(false);

  /**
   * Both actions below run inside a try/catch that reports rather than throws.
   * An unhandled rejection in a click handler surfaces as a full-page error
   * overlay and leaves the React tree dead — every other control on the console
   * then renders but does nothing, which reads as "the whole app broke" when
   * one reservation write failed. Storage can be unavailable (private mode, a
   * quota, a blocked origin) and `navigator.locks` is not everywhere, so this
   * is a real path, not a theoretical one. A dispatcher must never lose the
   * incident queue because a unit could not be reserved.
   */
  const runDispatchAction = useCallback(
    async (action: () => Promise<string>) => {
      try {
        setDispatchNotice(await action());
        setDispatchFailed(false);
      } catch (error) {
        console.error('Dispatch action failed:', error);
        setDispatchNotice('Could not update this unit. The dispatch was not recorded.');
        setDispatchFailed(true);
      }
    },
    [],
  );

  const handleNotifyUnit = useCallback(
    (unitId: string, callId: string, _callsign: string) => {
      setWorkflowProposal({ callId, unitId });
      setSelectedCallId(callId);
      setPanelView('detail');
      setWorkflowOpen(true);
    },
    [],
  );

  const handleRecallUnit = useCallback(
    (unitId: string, callId: string, callsign: string) =>
      runDispatchAction(async () => {
        await releaseUnit(callId, unitId);
        return `${callsign} stood down`;
      }),
    [runDispatchAction],
  );

  // The notice belongs to one unit-and-incident pairing; changing either makes
  // it stale, so it clears rather than describing a selection that is gone.
  useEffect(() => {
    setDispatchNotice(null);
    setDispatchFailed(false);
  }, [selectedUnitId, selectedCallId]);
  const handleOpenWorkflow = useCallback((call: EmergencyCall) => {
    setWorkflowProposal(null);
    setSelectedCallId(call.id);
    setWorkflowOpen(true);
  }, []);

  const selectCall = useCallback((callId: string) => {
    setSelectedCallId(callId);
    setPanelView('detail');
  }, []);

  const selectedCall = calls.find((c) => c.id === selectedCallId) || calls[0];
  const fusionSuggestions = useMemo(() => findFusionSuggestions(calls), [calls]);
  const fusionByCall = useMemo(() => {
    const index = new Map<string, FusionSuggestion>();
    for (const suggestion of fusionSuggestions) {
      index.set(suggestion.primary_call_id, suggestion);
      for (const id of suggestion.related_call_ids) index.set(id, suggestion);
    }
    return index;
  }, [fusionSuggestions]);
  const selectedFusion = selectedCall ? fusionByCall.get(selectedCall.id) : undefined;
  const selectedFusionDecision = selectedCall
    ? fusionDecisionFor(selectedCall.id, fusionDecisions, selectedFusion?.key)
    : undefined;
  const selectedLinkedPrimary = selectedCall
    ? linkedPrimaryFor(selectedCall.id, fusionDecisions)
    : null;
  const operationalUnits = useReservedFleet(TACTICAL_UNITS, selectedCall?.id ?? '');

  /**
   * The units on screen for the open incident: local cover only. On the
   * single-city fleet this excludes nothing, and that is the point of keeping
   * it — the voice intake geocodes whatever place the caller names, so a call
   * from outside Delhi must show its units as the mutual aid they would be,
   * not as though they were down the road.
   *
   * A unit committed to THIS call stays visible wherever it came from: mutual
   * aid has to remain recallable, and a unit you cannot see is a unit you
   * cannot stand down.
   */
  const localCover = useMemo(() => {
    const point = selectedCall?.caller_location;
    if (typeof point?.latitude !== 'number' || typeof point?.longitude !== 'number') {
      return { units: operationalUnits, mutualAid: false, radiusKm: 0, excluded: 0 };
    }
    const local = localFleet(operationalUnits, point.latitude, point.longitude);
    const shown = new Set(local.units.map((unit) => unit.id));
    const committed = operationalUnits.filter(
      (unit) => unit.assignedCallId === selectedCall?.id && !shown.has(unit.id),
    );
    const units = [...local.units, ...committed];
    // Only claim a radius when one actually excluded something. On the
    // single-city fleet nothing is filtered, and announcing a filter that did
    // nothing is its own small lie.
    return { ...local, units, excluded: operationalUnits.length - units.length };
  }, [operationalUnits, selectedCall]);

  const visibleUnits = localCover.units;

  // Everything the dispatch action bar needs about the current pairing.
  const selectedUnit = visibleUnits.find((unit) => unit.id === selectedUnitId) ?? null;
  const selectedUnitAssignedHere =
    !!selectedUnit && !!selectedCall && selectedUnit.assignedCallId === selectedCall.id;
  const selectedUnitCommittedElsewhere =
    !!selectedUnit && !!selectedUnit.assignedCallId && !selectedUnitAssignedHere;
  const selectedUnitEta = (() => {
    const point = selectedCall?.caller_location;
    if (!selectedUnit || typeof point?.latitude !== 'number' || typeof point?.longitude !== 'number') {
      return '—';
    }
    return etaLabel(
      selectedUnit,
      haversineKm(selectedUnit.lat, selectedUnit.lng, point.latitude, point.longitude),
    );
  })();

  // Primary figures appear once, in the command bar.
  // Operational alerts are derived from call state, then reduced by whatever the
  // operator has already acknowledged. The count feeds the rail's Alerts badge.
  const alerts = useMemo(() => {
    const input: AlertInput[] = calls.map((c) => ({
      id: c.id,
      severity: c.severity,
      status: c.status,
      created_at: c.created_at,
      ai_confidence: c.ai_confidence,
      caller_location: c.caller_location,
      model_escalated: c.model_escalated,
    }));
    const acknowledged = readAcknowledged();
    return deriveAlerts(input, now).filter((a) => !acknowledged.has(a.key));
    // `calls` identity only changes when the fingerprint changes, so this is stable
    // between polls that see no real change. `ackVersion` forces a recompute the
    // moment an alert is acknowledged, so the rail badge decrements immediately.
  }, [calls, ackVersion, now]);

  const headerMetrics = dashboardHeaderMetrics(calls, alerts.length);

  // Ordered, not merely filtered: open before closed, then by priority, then
  // oldest first within a grade. See `compareIncidentsForQueue`. Memoised
  // because the header clock re-renders this component every second.
  const filteredCalls = useMemo(() => sortIncidentQueue(calls.filter((call) => {
    const haystack = [
      call.ai_summary,
      call.chief_complaint,
      call.incident_subtype,
      call.incident_type,
      call.caller_location?.address,
    ]
      .join(' ')
      .toLowerCase();
    const matchesSearch = haystack.includes(searchQuery.toLowerCase());

    const matchesSeverity =
      severityFilter === 'all'
        ? true
        : severityFilter === 'critical'
        ? call.severity === 'critical'
        : severityFilter === 'high'
        ? call.severity === 'high'
        : call.severity === 'medium' || call.severity === 'low';

    return matchesSearch && matchesSeverity;
  })), [calls, searchQuery, severityFilter]);

  // Every rail module now renders in the main region (no full-screen overlays).
  // Selecting one is a pure activeModule switch, consistent across Monitoring,
  // Alerts, History and Forecast.
  const handleModuleSelect = useCallback((id: ModuleId) => {
    setActiveModule(id);
    setPanelView('queue');
    setMobileIncidentOpen(false);
  }, []);

  // Alerts / History link to an incident: jump to it on the map with its detail
  // open, back in the monitoring module.
  const handleModuleSelectCall = useCallback((id: string) => {
    setSelectedCallId(id);
    setActiveModule('monitoring');
    setMainView('map');
    setPanelView('detail');
  }, []);

  // Acknowledging an alert must recompute the derived alert set so the rail
  // badge decrements immediately.
  const handleAlertAck = useCallback(() => setAckVersion((v) => v + 1), []);

  // In Board view the incident queue panel is redundant — the kanban already
  // shows every incident, grouped by stage — so it is collapsed to give the five
  // columns the full width. The icon rail stays. Only the Monitoring module owns
  // the main area's map/board switch, so this only applies there.
  const boardActive = activeModule === 'monitoring' && mainView === 'board';

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-ground text-ink">
      <noscript>
        <div className="space-y-3 border-b border-mild bg-deep p-5 text-sm leading-6 text-ink">
          <p>
            <strong>Kwik 112 dispatch console (synthetic PSAP simulation).</strong> JavaScript is
            required for the voice call station, incident map, and dispatch controls. This is an
            independent demonstration — not an official 112 service — and every incident on the
            board is synthetic.
          </p>
          <p>
            <strong>What this console does:</strong> a caller places a 112 call (Hindi, Hinglish,
            or English); deterministic rules grade severity in microseconds — a floor the optional
            model refinement may raise but never lower; a human dispatcher records INTAKE,
            DISPATCH, and RESOLUTION decisions, and every override requires a written note. A
            sample graded card reads: <em>cardiac arrest, CRITICAL (P1), location &quot;Sector 16
            Market, Rohini, Delhi&quot;, triage source: local rules, prosody: absent</em>.
          </p>
          <p>
            Evidence without JavaScript: <a href="/for-judges" className="underline">judge guide</a> ·{' '}
            <a href="/benchmark" className="underline">held-out benchmark</a> ·{' '}
            <a href="/transcript" className="underline">video transcript</a>.
          </p>
        </div>
      </noscript>
      {/* ---- COMMAND BAR ---------------------------------------------------- */}
      <header className="flex h-14 shrink-0 select-none items-center justify-between gap-4 border-b border-rule-strong bg-deep px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-rule-strong bg-panel text-accent">
              <Radio className="h-4 w-4" aria-hidden />
            </span>
            <div className="leading-tight">
              <div className="text-md font-semibold tracking-wide text-ink">KWIK 112</div>
              <div className="hidden text-2xs text-ink-3 lg:block">Synthetic PSAP simulation · independent demo</div>
            </div>
          </div>

          {/* Environment telemetry — real board figures only. */}
          <div className="hidden items-center gap-4 border-l border-rule pl-4 lg:flex">
            {headerMetrics.map((metric) => (
              <div key={metric.label} className="leading-tight">
                <div className="label">{metric.label}</div>
                <div
                  className={cn(
                    'tnum text-sm',
                    metric.tone === 'critical'
                      ? 'text-critical-bright'
                      : metric.tone === 'warning'
                        ? 'text-mild'
                        : 'text-ink-2',
                  )}
                >
                  {metric.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Response units lives in the command bar, where an operator looks
              for it. It is only offered for the Monitoring map, which is the
              only view that owns a roster panel. */}
          {activeModule === 'monitoring' && mainView === 'map' && (
            <button
              type="button"
              aria-expanded={unitPanelOpen}
              aria-controls="response-units-panel"
              onClick={() => setUnitPanelOpen((open) => !open)}
              className={cn(
                'hidden items-center gap-1.5 rounded-[4px] border px-2.5 py-1.5 text-xs font-medium transition-colors sm:inline-flex',
                unitPanelOpen
                  ? 'border-accent bg-accent/10 text-accent-bright'
                  : 'border-rule bg-panel text-ink-2 hover:border-rule-strong hover:text-ink',
              )}
            >
              <Shield className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden lg:inline">Response </span>units
            </button>
          )}

          {/* Sound is off until asked for: a console that starts making noise on
              load gets muted permanently, and the click that enables it is also
              the gesture the browser autoplay policy requires. */}
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            title={soundOn ? 'Alert sound on for new critical calls' : 'Alert sound off'}
            aria-label={soundOn ? 'Turn alert sound off' : 'Turn alert sound on for new critical calls'}
            className={cn(
              'hidden items-center justify-center rounded-[4px] border px-2 py-1.5 transition-colors sm:inline-flex',
              soundOn
                ? 'border-accent bg-accent/10 text-accent-bright'
                : 'border-rule bg-panel text-ink-3 hover:border-rule-strong hover:text-ink',
            )}
          >
            {soundOn ? <Bell className="h-3.5 w-3.5" aria-hidden /> : <BellOff className="h-3.5 w-3.5" aria-hidden />}
          </button>

          {/* Main-area view switch keeps the map and the incident board reachable.
              Only meaningful for the Monitoring module, which owns the main area. */}
          <div
            className={cn(
              'items-center gap-1 rounded-[4px] border border-rule bg-panel p-0.5',
              activeModule === 'monitoring' ? 'hidden md:flex' : 'hidden',
            )}
          >
            {(['map', 'board'] as MainView[]).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setMainView(view)}
                className={cn(
                  'rounded-[4px] px-2.5 py-1 text-2xs font-medium uppercase tracking-wide transition-colors',
                  mainView === view
                    ? 'bg-panel-raised text-ink'
                    : 'text-ink-3 hover:text-ink-2',
                )}
              >
                {view === 'map' ? 'Map' : 'Board'}
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-2 rounded-[4px] border border-rule bg-panel px-2.5 py-1.5 sm:flex">
            <span className="tnum text-sm text-ink">{clock}</span>
            <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-accent-bright">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-bright" aria-hidden />
              Live
            </span>
          </div>

          {/* KWIK 112 — the emotion-aware voice-intake action. */}
          <div id="voice-station" className="flex items-center gap-2">
            <StartEmergencyCall
              launchSignal={voiceLaunchSignal}
              initialScriptId={goldenMode ? 'golden' : 'hinglish-five-minute'}
              onCallCreated={(id) => {
                setSelectedCallId(id);
                setMainView('map');
                setPanelView('detail');
              }}
            />
          </div>
        </div>
      </header>

      {goldenMode && (
        <div className="shrink-0 border-b border-rule bg-panel px-4 py-3 text-xs text-ink" aria-label="Golden recording controls">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <strong>GOLDEN DEMO · SIMULATED · Independent demonstration</strong>
            <a className="font-bold text-accent underline" href="/dashboard?demo=golden">Reset recording</a>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
            <span>Background: POSSIBLE_PRANK · human review | Routine LOW</span>
            {calls.find((call) => call.id === 'golden-demo-call') ? (() => {
              const golden = calls.find((call) => call.id === 'golden-demo-call')!;
              return <>
                <strong className="text-critical-bright">{golden.severity?.toUpperCase()} · {golden.priority_code}</strong>
                <span>{golden.caller_location?.address} · caller words / approximate gazetteer · ±1,200m</span>
                {golden.flags?.includes('GOLDEN_CALLER_INJECTION_IGNORED') && <strong className="text-accent">Injected LOW request ignored by local rules</strong>}
                <button className="rounded border border-accent px-3 py-1 font-bold text-accent" onClick={() => handleOpenWorkflow(golden)}>Human checkpoints</button>
              </>;
            })() : <span>Play the golden caller; pause before the attack.</span>}
          </div>
        </div>
      )}

      {liveCall && liveCall.state !== 'end' && <LiveCallStrip payload={liveCall} />}

      {/* ---- BODY: RAIL · INCIDENT PANEL · MAIN ---------------------------- */}
      <div className="relative flex min-h-0 flex-1 pb-14 sm:pb-0">
        {regionVisibility.showModuleRail && (
          <ModuleRail active={activeModule} onSelect={handleModuleSelect} alertCount={alerts.length} />
        )}

        {/* Incident panel — hidden in Board view so the kanban gets full width. */}
        {!boardActive && (regionVisibility.showIncidentSidebar || mobileIncidentOpen) && (
        <aside
          style={{ bottom: mobileNavInset }}
          className="absolute inset-x-0 top-0 z-[650] flex w-full shrink-0 flex-col border-r border-rule-strong bg-ground sm:static sm:w-[320px]"
        >
          {/* Incident panel header */}
          <div className="flex shrink-0 items-center justify-between border-b border-rule-strong px-3 py-2.5">
            <span className="text-sm font-medium text-ink">Emergencies</span>
            <button
              type="button"
              onClick={() => setMobileIncidentOpen(false)}
              className="rounded-[4px] border border-rule px-2 py-1 text-2xs font-medium uppercase tracking-wide text-ink-2 sm:hidden"
            >
              View map
            </button>
          </div>

          {panelView === 'detail' && selectedCall ? (
            <IncidentDetail
              call={selectedCall}
              fusion={selectedFusion}
              fusionDecision={selectedFusionDecision}
              linkedPrimaryCallId={selectedLinkedPrimary}
              onFusionDecision={(action) => selectedFusion && decideFusion(selectedFusion, action)}
              onDispatchSuggestedUnit={handleNotifyUnit}
              onBack={() => setPanelView('queue')}
              onOpenTimeline={() => {
                setWorkflowProposal(null);
                setSelectedCallId(selectedCall.id);
                setWorkflowOpen(true);
              }}
            />
          ) : (
            <>
              {/* Search + filter */}
              <div className="shrink-0 space-y-2 border-b border-rule-strong p-2.5">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
                    aria-hidden
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search summary, type, address…"
                    aria-label="Search incidents"
                    className="w-full rounded-[4px] border border-rule bg-panel py-1.5 pl-8 pr-2.5 text-sm text-ink placeholder:text-ink-4 focus:border-accent focus:outline-none"
                  />
                </div>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
                  aria-label="Filter by severity"
                  className="w-full rounded-[4px] border border-rule bg-panel px-2.5 py-1.5 text-sm text-ink-2 focus:border-accent focus:outline-none"
                >
                  <option value="all">All severities</option>
                  <option value="critical">Critical (P1)</option>
                  <option value="high">High (P2)</option>
                  <option value="other">Medium / Low</option>
                </select>
              </div>

              {/* Incident queue */}
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {filteredCalls.length === 0 ? (
                  <p className="p-3 text-sm text-ink-3">No incidents match the current filter.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {filteredCalls.map((call) => (
                      <li key={call.id}>
                        <IncidentRow
                          call={call}
                          arrived={arrivedCriticalIds.includes(call.id)}
                          fusion={fusionByCall.get(call.id)}
                          fusionDecision={fusionDecisionFor(
                            call.id,
                            fusionDecisions,
                            fusionByCall.get(call.id)?.key,
                          )}
                          selected={selectedCall?.id === call.id}
                          onSelect={() => selectCall(call.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </aside>
        )}

        {/* Main area: the active rail module. Monitoring is the map / incident
            board; Alerts, History and Forecast each render here in the main
            region (never as full-screen overlays). */}
        <main className="relative min-w-0 flex-1 bg-deep">
          {activeModule === 'alerts' ? (
            <AlertsModule
              calls={calls}
              now={now}
              onSelectCall={handleModuleSelectCall}
              onAckChange={handleAlertAck}
            />
          ) : activeModule === 'history' ? (
            <HistoryModule calls={calls} onSelectCall={handleModuleSelectCall} />
          ) : activeModule === 'forecast' ? (
            <ForecastModule calls={calls} />
          ) : mainView === 'map' ? (
            <div className="relative flex h-full min-h-0 overflow-hidden">
              <div className="relative min-w-0 flex-1">
                <EmergencyMap
                  calls={calls}
                  units={visibleUnits}
                  selectedCallId={selectedCall?.id || null}
                  onMarkerClick={handleMarkerClick}
                  onDispatchUnit={handleDispatchUnit}
                  selectedUnitId={selectedUnitId}
                  // One control, one meaning: Response units puts the fleet on
                  // the map and opens the roster beside it, together.
                  showUnits={unitPanelOpen}
                  layoutRevision={unitPanelOpen}
                />
                {!unitPanelOpen && (
                  <div className="absolute bottom-4 right-4 z-[550] flex flex-col items-end gap-2 sm:hidden">
                    <button
                      type="button"
                      onClick={() => setMobileIncidentOpen(true)}
                      className="rounded-[4px] border border-rule-strong bg-deep/95 px-3 py-2 text-xs font-medium text-ink"
                    >
                      Incidents
                    </button>
                    {/* Small screens only: the command-bar toggle is hidden
                        below `sm`, so this is the roster's way in there. */}
                    <button
                      type="button"
                      aria-expanded={unitPanelOpen}
                      aria-controls="response-units-panel"
                      onClick={() => setUnitPanelOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-[4px] border border-accent bg-deep/95 px-3 py-2 text-xs font-medium text-accent-bright"
                    >
                      <Shield className="h-3.5 w-3.5" aria-hidden />
                      Response units
                    </button>
                  </div>
                )}
              </div>

              {unitPanelOpen && (
                <aside
                  id="response-units-panel"
                  aria-label="Response units"
                  className="absolute inset-y-0 right-0 z-[600] flex w-[280px] shrink-0 flex-col border-l border-rule-strong bg-ground shadow-2xl xl:static xl:z-auto xl:shadow-none"
                >
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-rule-strong px-3 py-2.5">
                    <div>
                      <h2 className="text-sm font-semibold text-ink">Response units</h2>
                      {/* Say why the list is short. Filtering the fleet
                          silently would leave a dispatcher wondering where the
                          rest of it went. */}
                      <p className="mt-0.5 text-2xs text-ink-4">
                        {!selectedCall?.caller_location?.address
                          ? 'Select an incident to compare distance'
                          : localCover.mutualAid
                            ? `No local cover — nearest units to ${selectedCall.caller_location.address}`
                            : localCover.excluded > 0
                              ? `Within ${localCover.radiusKm} km of ${selectedCall.caller_location.address}`
                              : `Nearest to ${selectedCall.caller_location.address}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Close response units"
                      onClick={() => setUnitPanelOpen(false)}
                      className="rounded-[4px] p-1 text-ink-3 transition-colors hover:bg-panel hover:text-ink"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    <UnitRoster
                      units={visibleUnits}
                      selectedCall={selectedCall ?? null}
                      selectedUnitId={selectedUnitId}
                      onSelectUnit={handleSelectUnit}
                    />
                  </div>

                  {/* Dispatch action. Appears only once both halves of the
                      decision exist - a unit to send and an incident to send it
                      to - so it never offers an action that cannot be taken. */}
                  {selectedUnit && selectedCall && (
                    <div className="shrink-0 border-t border-rule-strong bg-panel p-2.5">
                      <p className="text-2xs text-ink-4">
                        <span className="text-ink-2">{selectedUnit.callsign}</span>
                        {' → '}
                        <span className="capitalize text-ink-2">
                          {selectedCall.incident_subtype || selectedCall.incident_type || 'incident'}
                        </span>
                      </p>
                      {selectedUnitAssignedHere ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleRecallUnit(selectedUnit.id, selectedCall.id, selectedUnit.callsign)
                          }
                          className="mt-2 w-full rounded-[4px] border border-rule-strong bg-ground px-3 py-2 text-xs font-semibold text-ink-2 transition-colors hover:border-mild hover:text-mild"
                        >
                          Stand down
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            handleNotifyUnit(selectedUnit.id, selectedCall.id, selectedUnit.callsign)
                          }
                          disabled={selectedUnitCommittedElsewhere}
                          className={cn(
                            'mt-2 w-full rounded-[4px] px-3 py-2 text-xs font-semibold transition-colors',
                            selectedUnitCommittedElsewhere
                              ? 'cursor-not-allowed border border-rule bg-ground text-ink-4'
                              : 'bg-accent text-deep hover:bg-accent-dim',
                          )}
                        >
                          {selectedUnitCommittedElsewhere
                            ? 'Committed elsewhere'
                            : `Notify & dispatch · ETA ${selectedUnitEta}`}
                        </button>
                      )}
                      {dispatchNotice && (
                        <p
                          role="status"
                          className={cn(
                            'mt-1.5 text-2xs',
                            dispatchFailed ? 'text-critical-bright' : 'text-accent-bright',
                          )}
                        >
                          {dispatchNotice}
                        </p>
                      )}
                    </div>
                  )}
                </aside>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col overflow-hidden">
              <IncidentKanbanBoard
                calls={calls}
                onSelectCallAndNavigateToMap={handleSelectCallAndNavigateToMap}
                onUpdateCallStatus={handleUpdateCallStatus}
                onOpenWorkflow={handleOpenWorkflow}
              />
            </div>
          )}
        </main>
      </div>

      {/* ---- OVERLAYS ------------------------------------------------------ */}

      {/* Spoken announcement of a new critical call. Assertive because a P1 is
          exactly the interruption a screen-reader user must not have to wait
          for; `aria-atomic` so the whole sentence is read, not just the words
          that changed.

          Deliberately last in the shell, not next to the header. A live region
          is read wherever it sits, and scripts/check-dashboard-layout measures
          `header.nextElementSibling` as the dashboard body — parking a 1px
          hidden node there does not fail the check, it silently redirects it at
          something that can never overflow. */}
      <p aria-live="assertive" aria-atomic="true" className="visually-hidden">
        {announcement}
      </p>
      <IncidentTimeline
        open={workflowOpen}
        onClose={() => { setWorkflowOpen(false); setWorkflowProposal(null); }}
        call={selectedCall ?? null}
        linkedPrimaryCallId={selectedLinkedPrimary}
        selectedUnitId={workflowProposal?.callId === selectedCall?.id ? workflowProposal?.unitId : undefined}
      />
    </div>
  );
}

/* ---- INCIDENT QUEUE ROW (Task 8) ------------------------------------------ */

function IncidentRow({
  call,
  fusion,
  fusionDecision,
  selected,
  arrived,
  onSelect,
}: {
  call: EmergencyCall;
  fusion?: FusionSuggestion;
  fusionDecision?: FusionDecision;
  selected: boolean;
  /** Just landed and critical — draw attention to it for a few seconds. */
  arrived?: boolean;
  onSelect: () => void;
}) {
  const glyph: IncidentGlyph = glyphForIncidentType(call.incident_type);
  const subtype = call.incident_subtype || call.incident_type || 'Unclassified incident';
  const address = call.caller_location?.address;

  return (
    <div
      className={cn(
        'flex flex-col rounded-[6px] border bg-panel transition-colors',
        selected ? 'border-accent' : 'border-rule hover:border-rule-strong',
        arrived && 'incident-arrived',
      )}
    >
      {/* Selecting the body opens the incident in the in-panel detail view. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex w-full flex-col gap-2 p-3 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Chip tone={severityTone(call.severity)}>{priorityCode(call)}</Chip>
            <Symbol
              spec={{ kind: 'incident', glyph, severity: call.severity, distress: distressOf(call), size: 20 }}
              className="shrink-0"
            />
            <span className="text-sm font-semibold capitalize text-ink">{subtype}</span>
          </div>
          <span className="tnum shrink-0 text-2xs text-ink-3">{getTimeElapsed(call.created_at)}</span>
        </div>

        {/* Full AI summary — deliberately unclamped for trained dispatchers. */}
        <p className="line-clamp-2 text-sm leading-relaxed text-ink-2">
          {compactIncidentSummary(
            call.ai_summary || call.chief_complaint || 'Emergency call in progress; details pending.',
          )}
        </p>

        {address && (
          <div className="flex items-start gap-1.5 text-xs text-ink-3">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {/* Address wraps rather than truncating. */}
            <span className="break-words">{address}</span>
          </div>
        )}
      </button>

      <div className="flex items-center justify-between gap-2 border-t border-rule px-3 py-2">
        <DistressMeter level={distressOf(call)} compact />
        <div className="flex items-center gap-1.5">
          {awaitingRefinement(call) && <Chip tone="mild">Refining</Chip>}
          {(fusion || fusionDecision) && (
            <Chip tone={fusionDecision?.action === 'linked' ? 'safe' : 'accent'}>
              {fusionDecision?.action === 'linked'
                ? 'Calls linked'
                : 'Review possible duplicate'}
            </Chip>
          )}
          <span className="text-2xs uppercase tracking-wide text-ink-4">{triageSource(call)}</span>
          {/* Genuine detail affordance — navigates to the full incident dossier. */}
          <Link
            href={`/dashboard/calls/${call.id}`}
            aria-label={`Open full detail for ${subtype}`}
            className="inline-flex items-center gap-0.5 rounded-[4px] px-1.5 py-1 text-2xs font-medium uppercase tracking-wide text-accent hover:text-accent-bright"
          >
            View
            <ChevronRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}

function LiveCallStrip({ payload }: { payload: KwikLiveCallPayload }) {
  const presentation = presentLiveCall(payload);

  return (
    <section
      aria-label="Live 112 call"
      className="grid min-h-16 shrink-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-b border-accent/50 bg-panel px-3 py-2 sm:min-h-14 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-4"
    >
      <div className="flex items-center gap-2 self-start sm:self-center">
        <span className="h-2 w-2 shrink-0 rounded-full bg-critical-bright" aria-hidden />
        <h2 className="whitespace-nowrap text-xs font-bold text-ink">ACTIVE 112 CALL</h2>
      </div>
      <div className="min-w-0 overflow-hidden">
        {presentation.turns.length ? (
          <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:gap-3">
            {presentation.turns.map((turn, index) => (
              <p key={`${turn.speaker}-${index}`} className="truncate text-xs text-ink-2">
                <span className="font-semibold text-ink-3">{turn.speaker}:</span> {turn.text}
              </p>
            ))}
          </div>
        ) : (
          <p className="truncate text-xs text-ink-3">Listening for caller transcript…</p>
        )}
      </div>
      <div className="col-span-2 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink-3 sm:col-span-1 sm:mt-0 sm:justify-end">
        <span>Language: {presentation.language}</span>
        <span>Prosody: {presentation.prosody}</span>
        {presentation.emotion ? <span>Caller emotion: {presentation.emotion}</span> : null}
        <span className="font-semibold text-ink">{presentation.grade}</span>
      </div>
    </section>
  );
}

/* ---- INCIDENT DETAIL PANEL (Task 10) -------------------------------------- */

function IncidentDetail({
  call,
  fusion,
  fusionDecision,
  linkedPrimaryCallId,
  onFusionDecision,
  onDispatchSuggestedUnit,
  onBack,
  onOpenTimeline,
}: {
  call: EmergencyCall;
  fusion?: FusionSuggestion;
  fusionDecision?: FusionDecision;
  linkedPrimaryCallId?: string | null;
  onFusionDecision: (action: FusionDecisionAction) => void;
  onDispatchSuggestedUnit: (unitId: string, callId: string, callsign: string) => void;
  onBack: () => void;
  onOpenTimeline: () => void;
}) {
  const glyph: IncidentGlyph = glyphForIncidentType(call.incident_type);
  const subtype = call.incident_subtype || call.incident_type || 'Unclassified incident';
  const location = call.caller_location;
  // Confidence is shown from the stored reading; a district-centroid fix keeps
  // its own value (e.g. 75%) and is never rounded up to 100%.
  const confidence =
    confidencePercent(location?.confidence) ?? confidencePercent(call.location_confidence);
  const accuracyRadius =
    typeof location?.accuracy_radius === 'number' ? `±${location.accuracy_radius} m` : null;
  const threats = call.immediate_threats ?? [];
  const units = recommendedUnits(call);
  const standardResponse = units.length === 0 && !call.dispatch_plan ? standardResponseUnits(call) : [];
  const dispatchPlan = call.dispatch_plan;
  // Units a dispatcher has actually sent from the roster, with the arrival the
  // roster projected. This is what closes the loop: pressing Dispatch there has
  // to be visible here, or the operator cannot tell whether it worked.
  const incidentFleet = useReservedFleet(TACTICAL_UNITS, call.id);
  const dispatchAssurance = assessDispatch(call, incidentFleet);
  const assignedUnits = incidentFleet
    .filter((unit) => unit.assignedCallId === call.id)
    .map((unit) => {
      const point = call.caller_location;
      const km =
        typeof point?.latitude === 'number' && typeof point?.longitude === 'number'
          ? haversineKm(unit.lat, unit.lng, point.latitude, point.longitude)
          : null;
      return { unit, eta: etaLabel(unit, km), distance: km === null ? null : `${km.toFixed(1)} km` };
    });
  const safetyAudit = call.safety_audit;
  const confidenceGrade = confidencePercent(call.ai_confidence ?? call.ai_triage?.confidence);
  const guidance = selectPreArrivalGuidance({
    incidentType: call.incident_type,
    severity: call.severity ?? 'low',
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-rule-strong px-2.5 py-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-1 text-2xs font-medium uppercase tracking-wide text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to queue
        </button>
      </div>

      <div className="flex flex-col gap-4 p-3.5">
        <IncidentFusionPanel
          callId={call.id}
          suggestion={fusion}
          decision={fusionDecision}
          onDecision={onFusionDecision}
        />
        {/* Header: symbol, subtype, priority */}
        <div className="flex items-start gap-3">
          <Symbol
            spec={{ kind: 'incident', glyph, severity: call.severity, distress: distressOf(call), size: 28 }}
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-md font-semibold capitalize text-ink">{subtype}</h2>
            {/* The priority code alone. "P1" and "CRITICAL" are the same fact
                said twice, and the chip already carries the severity colour. */}
            <div className="mt-1 flex items-center gap-2">
              <Chip tone={severityTone(call.severity)} dot>
                {priorityCode(call)}
              </Chip>
              {call.severity == null && (
                <span className="text-2xs uppercase tracking-wide text-ink-4">ungraded</span>
              )}
            </div>
          </div>
        </div>

        <SectionHeading>Where and caller</SectionHeading>

        {/* Caller identity and spoken language */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Caller">
            <span className="tnum text-sm text-ink">{call.caller_number || '—'}</span>
          </Field>
          <Field label="Spoken language">
            <span className="text-sm text-ink">{spokenLanguage(call) ?? '—'}</span>
          </Field>
        </div>

        <Field label="Triage source">
          <span className="text-sm text-ink">{triageSource(call)}</span>
        </Field>

        {/* Location with confidence + accuracy radius */}
        <Field label="Location">
          <span className="block break-words text-sm text-ink">
            {location?.address || 'Location pending verification'}
          </span>
          <span className="mt-1 block text-xs text-ink-3">
            Confidence: <span className="text-ink-2">{confidence ?? 'pending'}</span>
            {accuracyRadius && (
              <>
                {' · '}Accuracy: <span className="text-ink-2">{accuracyRadius}</span>
              </>
            )}
          </span>
        </Field>

        <SectionHeading>What happened</SectionHeading>

        <Field label={confidenceGrade ? `AI summary · ${confidenceGrade} confidence` : 'AI summary'}>
          <p className="text-sm leading-relaxed text-ink-2">
            {call.ai_summary ||
              call.ai_triage?.summary ||
              call.chief_complaint ||
              'No AI triage summary is available for this incident yet.'}
          </p>
        </Field>

        {threats.length > 0 && (
          <Field label="Threats">
            <div className="flex flex-wrap gap-1.5">
              {threats.map((threat) => (
                <Chip key={threat} tone="critical">{threat}</Chip>
              ))}
            </div>
          </Field>
        )}

        {/* Voice stress, only when prosody was actually measured. This used to
            be a bordered panel on every call, and on the many calls with no
            reading it was a large empty box whose only content was a sentence
            saying it was empty. Absence is still visible where it costs
            nothing: the map pin simply draws no distress ring. */}
        {distressOf(call) != null && (
          <Field label="Voice stress">
            <DistressMeter level={distressOf(call)} />
          </Field>
        )}

        {/* Safety audit */}
        {safetyAudit && (
          <details className="rounded-[6px] border border-rule bg-panel">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink">
              Why this priority?
            </summary>
            <div className="border-t border-rule p-2">
              <div className="grid grid-cols-3 gap-2">
                <DataRow label="Local" value={`${safetyAudit.local_severity} / ${safetyAudit.local_score}`} mono />
                <DataRow label="Model" value={`${safetyAudit.model_severity} / ${safetyAudit.model_score}`} mono />
                <DataRow label="Final" value={`${safetyAudit.final_severity} / ${safetyAudit.final_score}`} mono />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Chip tone={safetyAudit.downgrade_blocked ? 'critical' : 'safe'}>
                  {safetyAudit.downgrade_blocked ? 'Downgrade blocked' : 'No unsafe downgrade'}
                </Chip>
                <span className="text-xs text-ink-3">{safetyAudit.reason}</span>
              </div>
            </div>
          </details>
        )}

        <SectionHeading>Recommended response</SectionHeading>

        {/* The instructions only. The card used to repeat its own heading
            ("Immediate safety guidance") directly under a field label that
            already said what it was, and close with a standing caution about
            following protocol - neither of which is read to the caller, and
            both of which pushed the actual words down the panel. */}
        <Field label="Pre-arrival guidance (dispatcher reads)">
          <ul className="flex list-disc flex-col gap-1.5 rounded-[6px] border border-mild/40 bg-mild/5 p-2.5 pl-6 text-xs leading-relaxed text-ink-2">
            {guidance.instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ul>
        </Field>

        {/* Dispatch: who is going, and whether they arrive inside the response
            target. These were two separate headings that, on an unplanned call,
            both said "nothing yet" one after the other. They answer one
            question and now sit under one label. */}
        <Field label="Dispatch">
          <DispatchSuggestedUnitsPanel
            call={call}
            assurance={dispatchAssurance}
            assignedUnits={assignedUnits}
            fallbackUnits={dispatchPlan ? [] : units.length > 0 ? units : standardResponse}
            linkedPrimaryCallId={linkedPrimaryCallId}
            onDispatchUnit={onDispatchSuggestedUnit}
          />
        </Field>


        {/* Primary action → incident timeline (Task 13 overlay) */}
        <button
          type="button"
          onClick={onOpenTimeline}
          className="flex w-full items-center justify-center gap-2 rounded-[4px] bg-accent px-3 py-2.5 text-sm font-semibold text-deep transition-colors hover:bg-accent-dim"
        >
          Open incident timeline
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function DispatchSuggestedUnitsPanel({
  call,
  assurance,
  assignedUnits,
  fallbackUnits,
  linkedPrimaryCallId,
  onDispatchUnit,
}: {
  call: EmergencyCall;
  assurance: ReturnType<typeof assessDispatch>;
  assignedUnits: Array<{ unit: (typeof TACTICAL_UNITS)[number]; eta: string; distance: string | null }>;
  fallbackUnits: string[];
  linkedPrimaryCallId?: string | null;
  onDispatchUnit: (unitId: string, callId: string, callsign: string) => void;
}) {
  if (linkedPrimaryCallId) {
    return (
      <div className="rounded-[6px] border border-accent bg-accent/5 p-2.5">
        <Chip tone="accent">Shared response #{linkedPrimaryCallId}</Chip>
      </div>
    );
  }

  if (assurance.assignments.length > 0) {
    const statusTone = assurance.status === 'on_target' ? 'safe' : assurance.status === 'at_risk' ? 'mild' : 'critical';

    return (
      <div className="rounded-[6px] border border-rule bg-panel p-2">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Chip tone={statusTone}>
            {assurance.status === 'on_target' ? 'On target' : assurance.status === 'at_risk' ? 'At risk' : 'Check needed'}
          </Chip>
          <Chip tone="accent">{assurance.priority_code} target {assurance.target_minutes} min</Chip>
        </div>
        <div className="flex flex-col gap-1.5">
          {assurance.assignments.map((assignment) => (
            <SuggestedDispatchRow
              key={`${assignment.requested_service}-${assignment.unit_id}`}
              callId={call.id}
              assignment={assignment}
              assigned={assignedUnits.some(({ unit }) => unit.id === assignment.unit_id)}
              onDispatchUnit={onDispatchUnit}
            />
          ))}
        </div>
        {assurance.uncovered_services.length > 0 && (
          <p className="mt-2 text-xs font-medium text-critical-bright">
            Mutual aid needed: {assurance.uncovered_services.join(', ')}
          </p>
        )}
      </div>
    );
  }

  if (assignedUnits.length > 0) {
    return (
      <div className="flex flex-col gap-1.5 rounded-[6px] border border-rule bg-panel p-2">
        {assignedUnits.map(({ unit, eta, distance }) => (
          <div key={unit.id} className="flex items-center justify-between gap-2 rounded-[4px] bg-ground px-2 py-1.5">
            <span className="min-w-0 text-sm font-medium text-ink">{unit.callsign}</span>
            <span className="shrink-0 text-2xs font-semibold text-accent-bright">
              En route · ETA {eta}{distance ? ` · ${distance}` : ''}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (fallbackUnits.length > 0) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {fallbackUnits.map((unit) => (
          <Chip key={unit} tone="neutral">{unit}</Chip>
        ))}
      </div>
    );
  }

  if (assurance.status === 'location_required') {
    return <span className="text-sm text-critical-bright">Verify location before dispatch.</span>;
  }

  return <span className="text-sm text-ink-3">No units suggested yet.</span>;
}

function SuggestedDispatchRow({
  callId,
  assignment,
  assigned,
  onDispatchUnit,
}: {
  callId: string;
  assignment: DispatchAssignment;
  assigned: boolean;
  onDispatchUnit: (unitId: string, callId: string, callsign: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-[4px] border border-rule bg-ground px-2 py-1.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">{assignment.callsign}</div>
        <div className="tnum mt-0.5 text-2xs text-ink-4">
          {assignment.requested_service} · {assignment.distance_km.toFixed(1)} km · ETA {assignment.eta_minutes} min
        </div>
      </div>
      {assigned ? (
        <span className="shrink-0 rounded-[4px] border border-safe/40 bg-safe/10 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-safe">
          En route
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onDispatchUnit(assignment.unit_id, callId, assignment.callsign)}
          className={cn(
            'shrink-0 rounded-[4px] px-2.5 py-1.5 text-xs font-semibold text-deep transition-colors',
            assignment.status === 'on_target' ? 'bg-safe hover:bg-safe/80' : 'bg-mild hover:bg-mild/80',
          )}
        >
          Dispatch
        </button>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-rule pb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">
      {children}
    </h3>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label flex items-center gap-1.5">
        {label === 'Threats' && <AlertTriangle className="h-3 w-3 text-mild" aria-hidden />}
        {label}
      </span>
      {children}
    </div>
  );
}
