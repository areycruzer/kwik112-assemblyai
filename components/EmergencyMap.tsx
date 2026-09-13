/**
 * Situational map — satellite basemap with pin/disc symbology.
 *
 * The basemap is Esri World_Imagery (bright satellite), the far more legible
 * reference-product choice over the near-featureless dark canvas. Incidents are
 * map pins carrying a glyph for what happened — a heart, a flame, a car — in
 * the severity colour; units are bare glyphs in their service colour. Both are
 * built by `buildSymbol` and mounted through Leaflet `divIcon`. A pin is drawn
 * larger than a unit glyph on purpose: the incident is what the operator is
 * looking for, and a frameless unit glyph fills far more of its box than a pin
 * fills of its own, so equal nominal sizes read as units dominating the map.
 *
 * Markers carry no printed name. Every marker used to trail a name plate, which
 * on a busy sector stacked into a wall of text over the geography the operator
 * is trying to read. The names live on hover instead, as tooltips, so the map
 * stays a map and identification is one pointer-move away.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { EmergencyCall } from '@/lib/types';
import { getTimeElapsed } from '@/lib/mock-data';
import { escapeHtml } from '@/lib/utils';
import {
  buildSymbol,
  glyphForIncidentType,
  incidentSymbolSize,
  SYMBOL_ANCHOR,
} from '@/lib/design/symbols';
import { priorityCode, distressOf } from '@/lib/incident';
import { TACTICAL_UNITS, nearestAvailableUnit, serviceForIncidentType, type TacticalUnit } from '@/lib/units';
import { assessDispatch } from '@/lib/dispatch-assurance';

interface EmergencyMapProps {
  calls: EmergencyCall[];
  units?: TacticalUnit[];
  selectedCallId: string | null;
  onMarkerClick: (callId: string) => void;
  onDispatchUnit?: (unitId: string, callId: string) => void;
  /** Roster-selected unit: drawn with a 1px accent ring, like a selected incident. */
  selectedUnitId?: string | null;
  /**
   * Whether the responder fleet is drawn. Owned by the dashboard, not by this
   * map: the fleet on the map and the roster panel are one thing an operator
   * turns on, so a single control in the command bar drives both. A second
   * toggle living on the map could disagree with the panel beside it.
   */
  showUnits: boolean;
  /** Changes whenever a sibling panel resizes the map container. */
  layoutRevision?: string | number | boolean;
}

// Esri World_Imagery: bright satellite imagery, keyless, attribution required.
const SATELLITE_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTRIBUTION =
  'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

/** Read a design token from :root so Leaflet-set colours match the JSX layer. */
function cssToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * @description Give a marker its hover name, without disturbing one already on
 *              screen.
 *
 *              The marker effects re-run on every data refresh, and the obvious
 *              `unbindTooltip()` + `bindTooltip()` there destroys the open
 *              tooltip the operator is reading — the name flickers out from
 *              under the pointer roughly once a second. Binding once and then
 *              only pushing new content when the text actually differs keeps an
 *              open tooltip open, and still tracks a changed priority code or
 *              callsign.
 */
function bindHoverName(marker: any, html: string, offsetY: number): void {
  const existing = marker.getTooltip();
  if (!existing) {
    marker.bindTooltip(html, {
      direction: 'top',
      offset: [0, offsetY],
      className: 'kwik-map-tooltip',
      opacity: 1,
    });
    return;
  }
  if (existing.getContent() !== html) existing.setContent(html);
}

export default function EmergencyMap({
  calls,
  units = TACTICAL_UNITS,
  selectedCallId,
  onMarkerClick,
  selectedUnitId = null,
  showUnits,
  layoutRevision,
}: EmergencyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const incidentMarkersRef = useRef<Map<string, any>>(new Map());
  const unitMarkersRef = useRef<Map<string, any>>(new Map());
  const routePolylineRef = useRef<any>(null);
  // Leaflet loads asynchronously. Effects that draw onto the map key off this so
  // they re-run once it exists, rather than relying on a poll to retry them.
  // Without this reactive gate the marker effects run before the map exists,
  // bail out, and never re-run — every marker silently vanishes.
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const frame = requestAnimationFrame(() => mapRef.current?.invalidateSize({ pan: false }));
    return () => cancelAnimationFrame(frame);
  }, [layoutRevision, mapReady]);

  // First Responder Fleet — the shared roster, so the map markers and the
  // roster module can never disagree. Lifted to lib/units.ts (Task 11).
  const tacticalUnits = units;

  // Initialize the map with the satellite basemap.
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current || mapRef.current) return;

    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;

      leafletRef.current = L.default;

      try {
        const map = L.default.map(containerRef.current, {
          center: [28.7041, 77.1025],
          zoom: 13,
          zoomControl: false,
          // SVG renderer, deliberately. preferCanvas crashes when the map is
          // torn down mid-animation - switching Board <-> Map unmounts this
          // component, and a setView animation still in flight leaves the
          // canvas renderer's frame callbacks running against a destroyed
          // context ("Cannot read properties of undefined (reading 'save')"),
          // taking the responder vector with it. Canvas pays off at thousands
          // of vector layers; this map draws about two dozen.
          preferCanvas: false,
        });

        // Bright satellite imagery. The attribution control is left on: Esri's
        // terms require it, and a prior version stripping it was a regression.
        L.default
          .tileLayer(SATELLITE_TILE_URL, { maxZoom: 18, attribution: SATELLITE_ATTRIBUTION })
          .addTo(map);

        mapRef.current = map;
        setMapReady(true);

        // Force resize calculation once the container has laid out.
        setTimeout(() => {
          map.invalidateSize();
        }, 200);

        L.default.control.zoom({ position: 'bottomright' }).addTo(map);
      } catch (error) {
        console.error('Error initializing situational map:', error);
      }
    });

    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      isMounted = false;
      window.removeEventListener('resize', handleResize);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      incidentMarkersRef.current.clear();
      unitMarkersRef.current.clear();
      routePolylineRef.current = null;
      routeCasingRef.current = null;
      routeCacheRef.current.clear();
      setMapReady(false);
    };
  }, []);

  // Invalidate map size whenever the selection changes or the view re-renders.
  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 100);
    }
  }, [selectedCallId]);

  /**
   * The unit the responder vector leaves from, in order of authority: the
   * roster-selected unit, the dispatch plan's first assignment, then the
   * nearest available unit of the service this incident type calls for.
   *
   * Derived here rather than inside the route effect because the unit-marker
   * effect needs it too: a route drawn from a hidden marker starts from
   * nowhere, so the responding unit stays on the map even when the fleet layer
   * is off.
   */
  const routeUnitId = useMemo(() => {
    if (!selectedCallId) return null;
    const call = calls.find((c) => c.id === selectedCallId);
    const location = call?.caller_location;
    if (!call || !location?.latitude || !location?.longitude) return null;
    if (selectedUnitId) return selectedUnitId;
    const planned = assessDispatch(call, tacticalUnits).assignments[0]?.unit_id;
    if (planned) return planned;
    return (
      nearestAvailableUnit(
        tacticalUnits,
        location.latitude,
        location.longitude,
        serviceForIncidentType(call.incident_type),
        call.id,
      )?.id ?? null
    );
  }, [selectedCallId, selectedUnitId, calls, tacticalUnits]);

  // Render incident markers as severity-coloured pins built by `buildSymbol`.
  //
  // Depends only on `calls`, `selectedCallId`, `onMarkerClick`, and `mapReady`.
  // The parent memoises `onMarkerClick` and only changes the `calls` identity
  // when the data actually changed, so this must not gain unstable deps or it
  // would rebuild every marker (and re-open the popup) on each poll tick.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    const currentCallIds = new Set<string>();

    calls.forEach((call) => {
      const location = call.caller_location;
      if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;

      currentCallIds.add(call.id);
      const isSelected = selectedCallId === call.id;
      const label = call.incident_subtype || call.incident_type || 'Incident';

      // buildSymbol escapes its own interpolated values (label, glyph, kind)
      // internally, so its SVG string is safe to embed directly. `label` names
      // the pin for assistive tech; without `plate` nothing is drawn beside it,
      // and the name is surfaced on hover below instead.
      const svg = buildSymbol({
        kind: 'incident',
        glyph: glyphForIncidentType(call.incident_type),
        severity: call.severity,
        distress: distressOf(call),
        label,
        selected: isSelected,
        // Size ranks priority independently of colour, so a P1 reads first even
        // in greyscale or to a colour-blind operator.
        size: incidentSymbolSize(call.severity),
      });

      // A pin marks its coordinate with its tip, not its centre. The symbol is
      // authored in a 24-unit box, so the tip scales with the rendered size —
      // hard-coding the old centre anchor would float every pin above its
      // incident by half a marker.
      const incidentSize = incidentSymbolSize(call.severity);
      const icon = L.divIcon({
        className: 'kwik-map-marker',
        html: svg,
        iconSize: [incidentSize, incidentSize],
        iconAnchor: [
          (SYMBOL_ANCHOR.incident.x / 24) * incidentSize,
          (SYMBOL_ANCHOR.incident.y / 24) * incidentSize,
        ],
      });

      let marker = incidentMarkersRef.current.get(call.id);
      if (!marker) {
        marker = L.marker([location.latitude, location.longitude], { icon }).addTo(mapRef.current!);
        marker.on('click', () => onMarkerClick(call.id));
        incidentMarkersRef.current.set(call.id, marker);
      } else {
        marker.setLatLng([location.latitude, location.longitude]);
        marker.setIcon(icon);
      }

      // The name, on hover only. `label` is caller-derived incident text, so it
      // goes through escapeHtml like every other string bound into map markup.
      const tooltipHtml =
        `<span class="tnum text-ink-3">${escapeHtml(priorityCode(call))}</span> ${escapeHtml(label)}`;
      // Lift the tooltip clear of the pin's own height, which now varies.
      bindHoverName(marker, tooltipHtml, -Math.round(incidentSize * 0.85));

      // Every interpolated value below is caller-derived — incident text on this
      // platform is LLM-transcribed caller speech, and a hostile
      // `caller_location.address` has executed in a real browser before — so each
      // one must pass through escapeHtml. See lib/utils#escapeHtml.
      // Four facts, and only four: what, how urgent, where, when. The popup used
      // to also carry the AI summary paragraph and repeat the grade a second
      // time as a severity word — "CODE 2" in the corner and "HIGH" at the foot
      // are the same grade said twice, and an operator reading a map is picking
      // a marker, not reading a case file. The full narrative is one click away
      // in the incident panel, which is where it belongs.
      const popupHtml = `
        <div class="min-w-[190px] space-y-1.5">
          <div class="flex items-center justify-between gap-3 border-b border-rule pb-1.5">
            <span class="text-sm font-semibold capitalize text-ink">${escapeHtml(call.incident_subtype || call.incident_type)}</span>
            <span class="tnum shrink-0 text-xs font-semibold text-ink-2">${escapeHtml(priorityCode(call))}</span>
          </div>
          <div class="text-xs text-ink-2">
            <span class="break-words">${escapeHtml(location.address || 'Triangulated coordinate')}</span>
          </div>
          <div class="tnum text-2xs text-ink-4">${escapeHtml(getTimeElapsed(call.created_at))}</div>
        </div>
      `;

      marker.bindPopup(popupHtml, { className: 'kwik-map-popup' });

      if (isSelected) {
        marker.openPopup();
      }
    });

    incidentMarkersRef.current.forEach((marker, id) => {
      if (!currentCallIds.has(id)) {
        marker.remove();
        incidentMarkersRef.current.delete(id);
      }
    });
  }, [calls, selectedCallId, onMarkerClick, mapReady]);

  // Render the first-responder fleet as service-coloured discs built by
  // `buildSymbol`.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;

    // With the fleet layer off, one unit still shows: the one the responder
    // vector is drawn from. A line that begins at empty terrain reads as a
    // glitch, and the operator asking "how far is the unit" is asking about
    // exactly this marker.
    const visibleUnits = showUnits
      ? tacticalUnits
      : tacticalUnits.filter((unit) => unit.id === routeUnitId);

    const visibleIds = new Set(visibleUnits.map((unit) => unit.id));
    unitMarkersRef.current.forEach((marker, id) => {
      if (!visibleIds.has(id)) {
        marker.remove();
        unitMarkersRef.current.delete(id);
      }
    });

    visibleUnits.forEach((unit) => {
      const svg = buildSymbol({
        kind: 'unit',
        glyph: unit.type,
        service: unit.type,
        label: `${unit.callsign} (${unit.id})`,
        selected: unit.id === selectedUnitId,
        // Anything not 'available' is already committed; dimming says so on the
        // marker instead of making the operator open the roster to find out.
        dimmed: unit.status !== 'available',
        size: 30,
      });

      // A unit is a frameless glyph, so it sits centred on its coordinate —
      // read from the same table the pin's tip comes from rather than
      // re-derived here, so the two can never drift apart.
      const unitSize = 30;
      const icon = L.divIcon({
        className: 'kwik-map-marker',
        html: svg,
        iconSize: [unitSize, unitSize],
        iconAnchor: [
          (SYMBOL_ANCHOR.unit.x / 24) * unitSize,
          (SYMBOL_ANCHOR.unit.y / 24) * unitSize,
        ],
      });

      let marker = unitMarkersRef.current.get(unit.id);
      if (!marker) {
        marker = L.marker([unit.lat, unit.lng], { icon }).addTo(mapRef.current!);
        unitMarkersRef.current.set(unit.id, marker);
      } else {
        marker.setLatLng([unit.lat, unit.lng]);
        marker.setIcon(icon);
      }

      // Callsign and id on hover, replacing the plate that used to ride beside
      // every unit.
      bindHoverName(
        marker,
        `${escapeHtml(unit.callsign)} <span class="text-ink-3">${escapeHtml(unit.id)}</span>`,
        -16,
      );

      // Unit fields are internal mock data, but escaping stays uniform so no
      // string built here is ever a markup sink.
      marker.bindPopup(
        `
        <div class="min-w-[180px] space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-semibold text-ink">${escapeHtml(unit.id)} · ${escapeHtml(unit.callsign)}</span>
            <span class="label">${escapeHtml(unit.status)}</span>
          </div>
          <div class="text-xs text-ink-3">
            <span>${escapeHtml(unit.agency)}</span> · Speed <span class="tnum text-ink-2">${escapeHtml(unit.speed)}</span>
          </div>
        </div>
      `,
        { className: 'kwik-map-popup' },
      );
    });
  }, [tacticalUnits, showUnits, mapReady, selectedUnitId, routeUnitId]);

  // Responder vector to the selected incident. The geometry follows actual
  // roads: OSRM (the OpenStreetMap routing engine, public demo server, no key)
  // returns the driving route, drawn Google-Maps style as a cased polyline.
  // The straight dashed line is the instant fallback while the road route
  // loads, so the map never depends on a third-party service to show a
  // dispatch vector; if the router stays unreachable, the dashed line remains
  // and says so in its tooltip.
  //
  // Which unit the vector leaves from, in order: the roster-selected unit, the
  // dispatch plan's first assignment, and finally the nearest available unit
  // of the service the incident type calls for. The last rung matters most:
  // demo and stored calls mostly carry no dispatch plan, and without it the
  // vector silently never drew for them.
  const routeCacheRef = useRef<Map<string, [number, number][]>>(new Map());
  // In-flight OSRM lookups, shared across effect re-runs. The previous version
  // aborted the fetch in the effect's cleanup, so every re-run (fleet
  // hydration, a reservation event, a poll tick) killed the request and
  // restarted it - under churn the road route never landed and the dashed
  // fallback simply stayed. A re-run now finds the pending promise and awaits
  // the same fetch instead of murdering it.
  const routePendingRef = useRef<Map<string, Promise<[number, number][] | null>>>(new Map());
  // The route the map should currently be showing; a resolving fetch draws
  // only if it still matches, so a stale route can never paint over a new one.
  const routeKeyRef = useRef<string | null>(null);
  // Centre once per selected incident, not on every effect re-run - re-running
  // setView yanked the map back under an operator who had panned away.
  const centredCallRef = useRef<string | null>(null);
  const routeCasingRef = useRef<any>(null);

  /** One OSRM attempt with a hard timeout - the demo server sometimes hangs. */
  const fetchOsrmAttempt = (
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<any> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    return fetch(
      `https://router.project-osrm.org/route/v1/driving/` +
        `${from.lng},${from.lat};${to.lng},${to.lat}` +
        `?overview=full&geometries=geojson`,
      { signal: controller.signal },
    )
      .then((response) => {
        // A non-OK answer (the public server rate-limits with 429) used to be
        // swallowed as success-with-no-data, which left the dashed line up
        // with no retry and no explanation. It is a failure; treat it as one.
        if (!response.ok) throw new Error(`OSRM ${response.status}`);
        return response.json();
      })
      .finally(() => clearTimeout(timer));
  };

  const fetchRoadRoute = (
    key: string,
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<[number, number][] | null> => {
    const pending = routePendingRef.current.get(key);
    if (pending) return pending;

    const promise = fetchOsrmAttempt(from, to)
      // One retry after a beat: the demo server's rate limiter usually admits
      // the second call, and a single retry cannot pile up because the whole
      // lookup is deduplicated through routePendingRef.
      .catch(() => new Promise((r) => setTimeout(r, 1500)).then(() => fetchOsrmAttempt(from, to)))
      .then((data) => {
        const coordinates = data?.routes?.[0]?.geometry?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
        // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
        const latlngs = coordinates.map(
          (coord: [number, number]) => [coord[1], coord[0]] as [number, number],
        );
        routeCacheRef.current.set(key, latlngs);
        return latlngs;
      })
      .catch(() => null)
      .finally(() => {
        routePendingRef.current.delete(key);
      });

    routePendingRef.current.set(key, promise);
    return promise;
  };

  useEffect(() => {
    if (!mapReady || !mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    const map = mapRef.current;

    const clearRoute = () => {
      if (routePolylineRef.current) {
        routePolylineRef.current.remove();
        routePolylineRef.current = null;
      }
      if (routeCasingRef.current) {
        routeCasingRef.current.remove();
        routeCasingRef.current = null;
      }
    };

    clearRoute();
    routeKeyRef.current = null;
    if (!selectedCallId) return;

    const selectedCall = calls.find((c) => c.id === selectedCallId);
    if (!selectedCall || !selectedCall.caller_location) return;

    const targetLat = selectedCall.caller_location.latitude;
    const targetLng = selectedCall.caller_location.longitude;
    if (!targetLat || !targetLng) return;

    const routeUnit = tacticalUnits.find((unit) => unit.id === routeUnitId);
    if (!routeUnit) return;

    const accent = cssToken('--accent', '#69D2FF');
    const casingColor = cssToken('--deep', '#0A1526');

    const drawRoadRoute = (latlngs: [number, number][]) => {
      clearRoute();
      routeCasingRef.current = L.polyline(latlngs, {
        color: casingColor,
        weight: 7,
        opacity: 0.85,
      }).addTo(map);
      routePolylineRef.current = L.polyline(latlngs, {
        color: accent,
        weight: 3.5,
        opacity: 0.95,
      })
        .addTo(map)
        .bindTooltip('Estimated road route (OSRM driving profile)');
    };

    const key =
      `${routeUnit.id}:` +
      `${routeUnit.lat.toFixed(5)},${routeUnit.lng.toFixed(5)}:` +
      `${targetLat.toFixed(5)},${targetLng.toFixed(5)}`;
    routeKeyRef.current = key;

    if (centredCallRef.current !== selectedCallId) {
      centredCallRef.current = selectedCallId;
      // Frame the whole vector, not just the incident: centring on the incident
      // alone can push the responding unit — and therefore the route the
      // operator asked for — off the edge of the viewport.
      //
      // But fitBounds derives its zoom from the container's pixel size, and
      // this effect can run in the same frame the Board -> Map switch remounts
      // the map, before the container has laid out. Fitting against a
      // zero-ish size asks Leaflet to fit Delhi into no pixels, and it answers
      // with the minimum zoom — the whole world. So the fit is deferred a
      // frame, re-measured, and only used once the container is genuinely
      // big enough to trust; otherwise we fall back to a fixed-zoom setView on
      // the incident, which needs no measurement to be correct.
      const bounds = L.latLngBounds(
        [routeUnit.lat, routeUnit.lng],
        [targetLat, targetLng],
      ).pad(0.28);

      map.setView([targetLat, targetLng], 14, { animate: false });

      requestAnimationFrame(() => {
        const live = mapRef.current;
        if (!live || routeKeyRef.current !== key) return;
        live.invalidateSize({ pan: false });
        const size = live.getSize();
        // A settled map region is hundreds of pixels on both axes. Anything
        // smaller means layout has not happened yet, and the setView above is
        // already showing the incident correctly.
        if (size.x >= 240 && size.y >= 240) {
          live.fitBounds(bounds, { animate: true, maxZoom: 15 });
        }
      });
    }

    const cached = routeCacheRef.current.get(key);
    if (cached) {
      drawRoadRoute(cached);
      return () => {
        routeKeyRef.current = null;
        clearRoute();
      };
    }

    // Straight-line estimate first - zero-latency feedback while OSRM answers.
    routePolylineRef.current = L.polyline(
      [
        [routeUnit.lat, routeUnit.lng],
        [targetLat, targetLng],
      ],
      { color: accent, weight: 3, opacity: 0.85, dashArray: '6, 8' },
    )
      .addTo(map)
      .bindTooltip('Straight-line estimate - road route loading…');

    fetchRoadRoute(key, { lat: routeUnit.lat, lng: routeUnit.lng }, { lat: targetLat, lng: targetLng })
      .then((latlngs) => {
        // Only the route the map still wants may draw; anything else is stale.
        if (routeKeyRef.current !== key || !mapRef.current) return;
        if (latlngs) {
          drawRoadRoute(latlngs);
        } else if (routePolylineRef.current) {
          // Both attempts failed. The dashed line stays - it is an honest
          // straight-line estimate - but it stops claiming to be loading.
          routePolylineRef.current.bindTooltip(
            'Direct line - road route unavailable right now',
          );
        }
      });

    return () => {
      routeKeyRef.current = null;
      clearRoute();
    };
  }, [selectedCallId, routeUnitId, calls, tacticalUnits, mapReady]);

  return (
    <div className="relative h-full min-h-[450px] w-full flex-1 overflow-hidden bg-deep">
      {/* Map surface. The inline background beats Leaflet's own
          `.leaflet-container { background:#ddd }` rule, so no light-grey flash
          shows through while tiles load. */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-0 h-full min-h-[450px] w-full"
        style={{ width: '100%', height: '100%', backgroundColor: 'var(--deep)' }}
      />

      {/* Situational HUD (top-left). A "Units (n)" toggle used to sit under this
          strip. It duplicated the command bar's Response units control and could
          contradict it — fleet hidden on the map while the roster listing that
          same fleet sat open beside it. One control now drives both. */}
      <div className="pointer-events-auto absolute left-4 top-4 z-[400] flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-[6px] border border-rule-strong bg-deep/85 px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-safe" aria-hidden />
          <span className="label text-ink-2">Situational map</span>
          <span className="tnum text-2xs text-ink-4">
            {calls.length} incidents
            {showUnits ? ` · ${tacticalUnits.length} units` : ''}
          </span>
        </div>
      </div>

      {/* A "Responder vector active" badge used to sit here. It restated what
          the drawn route already shows, carried no figure and no control, and
          took the top-right corner of the map to do it. */}

      {/* Legend (bottom-left). */}
      <div className="absolute bottom-4 left-4 z-[400] flex items-center gap-3 rounded-[6px] border border-rule-strong bg-deep/85 px-3 py-2 text-2xs text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-critical" aria-hidden />
          P1 Critical
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-mild" aria-hidden />
          P2 High
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-safe" aria-hidden />
          P3 / P4
        </span>
      </div>
    </div>
  );
}
