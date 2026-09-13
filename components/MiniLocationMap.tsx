/**
 * MiniLocationMap — the incident locator on the detail page.
 *
 * Reworked to match the main situational map (EmergencyMap): the keyless Esri
 * World_Imagery satellite basemap, the shared `buildSymbol` incident marker
 * (severity-coloured triangle) instead of a bespoke red dot, a panel-styled
 * overlay in design tokens, and an accuracy radius drawn from the call's own
 * `caller_location.accuracy_radius` rather than a hardcoded 50 m. It imports
 * `leaflet/dist/leaflet.css`; it renders no popups, so it needs none of the
 * popup cascade fixes the main map carries.
 */

'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';

import { buildSymbol, glyphForIncidentType } from '@/lib/design/symbols';
import type { Severity } from '@/lib/types';

// Esri World_Imagery: bright satellite imagery, keyless, attribution required —
// the same constant and attribution the main map uses (see EmergencyMap).
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

interface MiniLocationMapProps {
  latitude: number;
  longitude: number;
  /** From `caller_location.accuracy_radius`. Absent → no radius is drawn. */
  accuracyRadius?: number;
  address?: string;
  severity?: Severity;
  incidentType?: string;
}

export default function MiniLocationMap({
  latitude,
  longitude,
  accuracyRadius,
  address,
  severity,
  incidentType,
}: MiniLocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current || mapRef.current) return;

    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;

      try {
        const map = L.default.map(containerRef.current, {
          center: [latitude, longitude],
          zoom: 15,
          zoomControl: false,
          dragging: false,
          scrollWheelZoom: false,
          preferCanvas: true,
        });

        // Bright satellite imagery. Attribution stays on: Esri's terms require it.
        L.default
          .tileLayer(SATELLITE_TILE_URL, { maxZoom: 18, attribution: SATELLITE_ATTRIBUTION })
          .addTo(map);

        // The shared incident symbol — a severity-coloured pin.
        const svg = buildSymbol({
          kind: 'incident',
          glyph: glyphForIncidentType(incidentType),
          severity,
          size: 34,
        });
        const icon = L.default.divIcon({
          className: 'kwik-map-marker',
          html: svg,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        L.default.marker([latitude, longitude], { icon }).addTo(map);

        // Accuracy radius drawn only when the call actually carries one. The
        // colour comes from the --accent token, never a hardcoded hex.
        if (typeof accuracyRadius === 'number' && accuracyRadius > 0) {
          const accent = cssToken('--accent', '#69D2FF');
          L.default
            .circle([latitude, longitude], {
              radius: accuracyRadius,
              color: accent,
              fillColor: accent,
              fillOpacity: 0.12,
              weight: 1.5,
              dashArray: '4, 4',
            })
            .addTo(map);
        }

        mapRef.current = map;
        setTimeout(() => map.invalidateSize(), 150);
      } catch (error) {
        console.error('Error initializing mini map:', error);
      }
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [latitude, longitude, accuracyRadius, severity, incidentType]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-deep">
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ width: '100%', height: '100%', backgroundColor: 'var(--deep)' }}
      />
      <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[400] flex items-center gap-1.5 rounded-[6px] border border-rule-strong bg-deep/85 px-2 py-1 text-2xs text-ink-2">
        <MapPin className="h-3 w-3 shrink-0 text-accent" aria-hidden />
        <span className="truncate">
          {address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}
        </span>
        {typeof accuracyRadius === 'number' && accuracyRadius > 0 && (
          <span className="tnum shrink-0 text-ink-4">±{accuracyRadius} m</span>
        )}
      </div>
    </div>
  );
}
