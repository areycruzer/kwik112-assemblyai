/**
 * @module design/symbols
 * @description Incident and unit symbols, emitted as SVG strings so the same
 *              function can feed both React components and Leaflet `divIcon`,
 *              which only accepts markup.
 *
 *              Shape encodes entity kind, and the two kinds are deliberately
 *              nothing alike: an incident is a **map pin** — a glyph carried
 *              inside a severity-coloured teardrop, because it marks a place
 *              something happened — while a unit is a **bare glyph** in its
 *              service colour, no frame at all, because a responder is a thing
 *              that moves, not a place. Boxing both in a rounded outline was the
 *              first version and it failed the only test that matters: at map
 *              size a dispatcher could not tell a unit from an incident.
 *
 *              The glyph itself says what the thing is — a heart for a medical
 *              call, a flame for a fire, a car for a collision — because an
 *              operator reads a picture faster than a colour code, and a
 *              screenful of identical shapes in three shades of red says nothing
 *              at a glance.
 *
 *              Glyphs are FILLED silhouettes, not hairline strokes: at the 18-34px
 *              these render at, a 1.4px stroke on a saturated fill turns to mush.
 *              (The one exception is `water`, which is waves — lines by nature.)
 *              Every glyph is authored in a 24x24 space and fitted to its frame by
 *              `placeGlyph`, so adding one only means adding a path and its bbox.
 *
 *              Self-contained on purpose: it imports nothing from the rest of
 *              the project so `node --test` can run it without a resolver.
 */

export type SymbolKind = 'incident' | 'unit';
export type IncidentGlyph =
  | 'fire'
  | 'medical'
  | 'crime'
  | 'traffic'
  | 'utility'
  | 'water'
  | 'unknown';
export type UnitService = 'police' | 'fire' | 'ems';

export interface SymbolSpec {
  kind: SymbolKind;
  glyph: IncidentGlyph | UnitService;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  service?: UnitService;
  /** 0-100 from Kwik 112 prosody. `null`/`undefined` means never measured. */
  distress?: number | null;
  /**
   * The symbol's accessible name and `<title>`. It does NOT draw anything on the
   * symbol by itself — see `plate`.
   */
  label?: string;
  /**
   * Draw the `label` as a name plate beside the mark. Off by default: on a map,
   * a plate on every marker turns a busy sector into a wall of text and hides
   * the geography underneath. `EmergencyMap` leaves it off and surfaces the same
   * name on hover instead.
   */
  plate?: boolean;
  /**
   * Render the symbol at reduced opacity. Used for a responder that is not
   * available - already committed to another incident, or out of service. A
   * dispatcher scanning the map for "who can I send" needs that answered by the
   * marker itself; before this, a committed unit and a free one were pixel-
   * identical and the only way to tell them apart was to open the roster.
   */
  dimmed?: boolean;
  size?: number;
  selected?: boolean;
}

// Severity collapses onto the product's three named levels: P1 → CRITICAL,
// P2 → MILD, P3/P4 → SAFE.
const SEVERITY_COLORS: Record<string, string> = {
  critical: '#F40000',
  high: '#FABC1F',
  medium: '#47FF85',
  low: '#47FF85',
};

/**
 * The body a low-priority incident is drawn in. A P3 used to be painted in the
 * same full-chroma safe green as everything else in the palette, which made the
 * least urgent marker on the map one of the loudest - seventeen incidents all
 * shouting equally. A muted body with a coloured glyph keeps the grade readable
 * while letting the P1s be the only saturated things on screen.
 */
const MUTED_BODY = '#242424';

const SERVICE_COLORS: Record<UnitService, string> = {
  police: '#69D2FF',
  fire: '#F40000',
  ems: '#47FF85',
};

/** Ungraded / unknown — neutral --ink-3, never a fabricated severity. */
const UNKNOWN = '#9F9F9F';

/** Outline + glyph ink. Near-black reads on every fill in the palette above. */
const INK = '#0B0B0B';
/** --accent. Selection is a thicker accent outline, never a scale transform. */
const ACCENT = '#69D2FF';
/**
 * The resting rim, drawn around every symbol in off-white (--ink's bright end).
 * A light rim plus a soft shadow is what lets a saturated mark sit on busy
 * satellite imagery without shouting — the "sticker" treatment every mapping
 * product converges on — and it reads equally well on the console's dark
 * panels. The old near-black outlines just thickened each mark's own darkness.
 */
const RIM = '#F2F2F2';

/**
 * @description How an incident pin is painted: body fill and inner glyph.
 *
 *              This is the console's visual hierarchy, and it is deliberately
 *              NOT "every severity gets its own bright colour". Saturation is
 *              the strongest pre-attentive channel there is, so it is spent only
 *              where it earns attention: P1 is solid signal red, P2 solid amber,
 *              and everything below is a graphite chip carrying a coloured mark.
 *              Read down a screen of seventeen incidents, the two P1s are the
 *              only things that shout.
 */
export function incidentPaint(severity?: string): { body: string; glyph: string } {
  if (severity === 'critical') return { body: SEVERITY_COLORS.critical, glyph: INK };
  if (severity === 'high') return { body: SEVERITY_COLORS.high, glyph: INK };
  if (severity === 'medium' || severity === 'low') {
    return { body: MUTED_BODY, glyph: SEVERITY_COLORS.medium };
  }
  // Ungraded: neutral body, dark mark. Never a fabricated severity colour.
  return { body: UNKNOWN, glyph: INK };
}

/**
 * @description Rendered pixel size for an incident pin, by severity.
 *
 *              Size is the second half of the hierarchy above, and it works
 *              where colour cannot: it survives greyscale, colour-blindness and
 *              a glance from across a control room. A P1 is half again the area
 *              of a P3, so the eye lands on it first without any colour being
 *              read at all.
 */
export function incidentSymbolSize(severity?: string): number {
  if (severity === 'critical') return 48;
  if (severity === 'high') return 40;
  return 34;
}

export function severityColor(severity?: string): string {
  if (!severity) return UNKNOWN;
  return SEVERITY_COLORS[severity] ?? UNKNOWN;
}

/** @description Escape text bound for an SVG/HTML string context. */
function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** @description Calm to peak distress: safe green -> mild amber -> signal red. */
export function distressColor(level: number): string {
  const l = Math.min(100, Math.max(0, level));
  if (l <= 50) return mix('#47FF85', '#FABC1F', l / 50);
  return mix('#FABC1F', '#F40000', (l - 50) / 50);
}

export function glyphForIncidentType(incidentType?: string): IncidentGlyph {
  if (!incidentType) return 'unknown';
  const t = incidentType.toLowerCase();
  if (t.includes('fire')) return 'fire';
  if (t.includes('medical') || t.includes('cardiac') || t.includes('health')) return 'medical';
  if (t.includes('accident') || t.includes('traffic') || t.includes('collision')) return 'traffic';
  if (t.includes('crime') || t.includes('violen') || t.includes('robbery')) return 'crime';
  // Monsoon waterlogging and drowning are ordinary Indian 112 traffic and read
  // nothing like a power-line fault, so they get their own mark.
  if (t.includes('flood') || t.includes('water') || t.includes('drown')) return 'water';
  if (t.includes('public_safety') || t.includes('utility') || t.includes('civic')) return 'utility';
  return 'unknown';
}

/* ---- GLYPHS ---------------------------------------------------------------
 * Each glyph is a filled silhouette in a 24x24 space plus the bounding box its
 * ink actually occupies, `[minX, minY, width, height]`. `placeGlyph` uses the
 * box to centre and scale it inside a frame, so a glyph whose ink sits off the
 * nominal centre (a heart, a pin) still lands optically centred.
 *
 * Holes (a windscreen, the bar of an exclamation) are ordinary sub-paths and
 * are punched out by `fill-rule="evenodd"`, so winding direction never matters.
 * ------------------------------------------------------------------------- */

interface Glyph {
  d: string;
  box: [number, number, number, number];
  /**
   * Draw the path as a stroke of this width (in the glyph's own 24x24 units)
   * instead of filling it. Only for marks that are lines by nature — waves —
   * where a filled ribbon would need hand-authored outlines and still read worse.
   */
  stroke?: number;
}

const GLYPHS: Record<string, Glyph> = {
  /** Medical / cardiac — a heart. */
  medical: {
    d:
      'M12 20.8C7.6 17.7 3.5 14 3.5 10.3 3.5 7.6 5.6 5.5 8.3 5.5c1.6 0 3 .8 3.7 2 ' +
      '.7-1.2 2.1-2 3.7-2 2.7 0 4.8 2.1 4.8 4.8 0 3.7-4.1 7.4-8.5 10.5Z',
    box: [3.5, 5.5, 17, 15.3],
  },
  /** Fire — a flame with a tongue notched out of its left flank. */
  fire: {
    d:
      'M12 2.2c3.3 3 5.4 5.8 5.4 8.9a5.4 5.4 0 0 1-10.8 0c0-1.5.5-2.6 1.3-3.6' +
      '.2 1 .8 1.7 1.6 2.1.6-3 1.3-5.2 2.5-7.4Z',
    box: [6.6, 2.2, 10.8, 14.3],
  },
  /**
   * Water — flooding, waterlogging, drowning. Waves, not a droplet: a droplet
   * set inside the pin just repeats the pin's own outline, and at map size the
   * two silhouettes collapse into one red blob.
   */
  water: {
    d:
      'M3.5 8.6c1.7-2.1 3.4-2.1 5.1 0s3.4 2.1 5.1 0 3.4-2.1 5.1 0' +
      'M3.5 13.1c1.7-2.1 3.4-2.1 5.1 0s3.4 2.1 5.1 0 3.4-2.1 5.1 0' +
      'M3.5 17.6c1.7-2.1 3.4-2.1 5.1 0s3.4 2.1 5.1 0 3.4-2.1 5.1 0',
    // Box grown by half a stroke on each side: a stroked path's ink reaches
    // past its geometry, and without that the waves overshot the pin head.
    box: [2.3, 5.3, 17.7, 15.4],
    stroke: 2.4,
  },
  /** Road traffic — a car in profile, windscreen and wheels punched out. */
  traffic: {
    d:
      'M4.8 12.1 6.7 7.1c.25-.65.87-1.08 1.57-1.08h7.46c.7 0 1.32.43 1.57 1.08l1.9 5' +
      'c.33.22.55.6.55 1.03v4.05c0 .5-.4.9-.9.9h-.9c-.5 0-.9-.4-.9-.9v-.9H6.95v.9' +
      'c0 .5-.4.9-.9.9h-.9c-.5 0-.9-.4-.9-.9v-4.05c0-.43.22-.81.55-1.03Z' +
      'M7.9 11.2h8.2l-1.25-3.3c-.06-.16-.2-.26-.37-.26H9.52c-.17 0-.31.1-.37.26Z' +
      'M7.6 14.9a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z' +
      'M16.4 14.9a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z',
    box: [4.25, 6.02, 15.5, 12],
  },
  /** Crime — a shield with an alert bar punched through it. */
  crime: {
    d:
      'M12 2.6 4.6 5.5v5.3c0 4.6 3.15 8.9 7.4 10 4.25-1.1 7.4-5.4 7.4-10V5.5Z' +
      'M11.1 6.9h1.8v6.1h-1.8Z' +
      'M11.1 14.4h1.8v1.9h-1.8Z',
    box: [4.6, 2.6, 14.8, 18.2],
  },
  /** Utility / civic — a power bolt (line down, transformer, gas, outage). */
  utility: {
    d:
      'M13.4 2.6 6.6 12.6c-.2.3 0 .7.4.7h3.6l-1.4 7.5c-.1.5.6.8.9.4l6.9-10' +
      'c.2-.3 0-.7-.4-.7h-3.6l1.3-7.5c.1-.5-.6-.8-.9-.4Z',
    box: [6.4, 2.4, 11.2, 18.9],
  },
  /** Ungraded / unclassified — a question mark, never a fabricated category. */
  unknown: {
    d:
      'M11 17.4h2v2h-2Z' +
      'M12 4.6c-2.4 0-4.3 1.9-4.3 4.3h2c0-1.3 1-2.3 2.3-2.3s2.3 1 2.3 2.3' +
      'c0 .8-.4 1.3-1.2 1.9-1 .8-1.8 1.6-1.8 3.2v.7h2v-.7c0-.8.4-1.2 1.2-1.8' +
      // Leading space is load-bearing: without it this line's "1" fuses with
      // the previous line's "-1.8" into "-1.81" and the browser rejects the
      // whole path. `every glyph path is well formed` pins this.
      ' 1-.8 1.8-1.7 1.8-3.3 0-2.4-1.9-4.3-4.3-4.3Z',
    box: [7.7, 4.6, 8.6, 14.8],
  },

  /* Unit services. A PCR van gets a shield, a fire tender a flame (`fire`
     above, shared), a CATS ambulance the medical cross. Three silhouettes an
     operator can tell apart with the colour removed. */
  police: {
    d: 'M12 2.6 4.6 5.5v5.3c0 4.6 3.15 8.9 7.4 10 4.25-1.1 7.4-5.4 7.4-10V5.5Z',
    box: [4.6, 2.6, 14.8, 18.2],
  },
  /**
   * The fire SERVICE, as distinct from the fire HAZARD above. A tender used to
   * carry the same flame the fire incident carries, in the same signal red, so
   * a red flame on the map meant either "there is a fire here" or "the fire
   * brigade is here" and the operator had to work out which from the frame
   * alone. A helmet is unmistakably the service, and collides with nothing.
   */
  fireUnit: {
    d:
      'M12 4.6c-4.2 0-7.6 3.3-7.9 7.4h15.8C19.6 7.9 16.2 4.6 12 4.6Z' +
      'M2.6 12h18.8c.6 0 1.1.5 1.1 1.1v1.9c0 .6-.5 1.1-1.1 1.1H2.6' +
      'c-.6 0-1.1-.5-1.1-1.1v-1.9C1.5 12.5 2 12 2.6 12Z' +
      'M11 6.8h2v4.2h-2Z',
    box: [1.5, 4.6, 21, 11.5],
  },
  ems: {
    d: 'M10.3 4.6h3.4v5.7h5.7v3.4h-5.7v5.7h-3.4v-5.7H4.6v-3.4h5.7Z',
    box: [4.6, 4.6, 14.8, 14.8],
  },
};

/** The pin an incident is drawn as. Its tip is (12, 21.9) in the 24x24 space. */
const PIN_PATH = 'M12 21.9C10.4 19.4 4.3 14.9 4.3 9.9a7.7 7.7 0 1 1 15.4 0c0 5-6.1 9.5-7.7 12Z';
/** Where the pin's head sits, so ring and glyph centre on it, not on the tail. */
const PIN_HEAD_Y = 9.9;

/**
 * The point in the 24x24 symbol space that should sit over the map coordinate:
 * the pin's tip for an incident, the disc's centre for a unit. `EmergencyMap`
 * scales this to build Leaflet's `iconAnchor`, which is why it is exported
 * rather than re-derived (and re-guessed) at the call site.
 */
export const SYMBOL_ANCHOR: Record<SymbolKind, { x: number; y: number }> = {
  incident: { x: 12, y: 21.9 },
  unit: { x: 12, y: 12 },
};

const round = (v: number) => Number(v.toFixed(3));

/**
 * @description Centre a 24x24 glyph on (cx, cy) and scale it so its longest ink
 *              dimension is `side`. Fitting by the glyph's own bounding box —
 *              not by the nominal 24x24 canvas — is what keeps a wide car and a
 *              tall bolt looking the same visual weight inside the same frame.
 */
function placeGlyph(
  glyph: Glyph,
  cx: number,
  cy: number,
  side: number,
  ink: string,
  outline?: string,
  outlineWidth = 2.2,
): string {
  const [minX, minY, w, h] = glyph.box;
  const scale = side / Math.max(w, h);
  const tx = cx - scale * (minX + w / 2);
  const ty = cy - scale * (minY + h / 2);

  // A unit has no frame to separate it from the map, so its glyph carries its
  // own dark keyline. `paint-order="stroke"` lays that keyline down *under* the
  // fill, so the outline reads as a halo around the shape instead of eating
  // half its width — which is what keeps a bare glyph legible over satellite
  // imagery. A framed incident glyph passes no outline and is unaffected.
  const paint = glyph.stroke
    ? `fill="none" stroke="${ink}" stroke-width="${glyph.stroke}" stroke-linecap="round"`
    : `fill="${ink}" fill-rule="evenodd"` +
      (outline ? ` stroke="${outline}" stroke-width="${outlineWidth}" stroke-linejoin="round" paint-order="stroke"` : '');

  // A line glyph cannot use paint-order — there is no fill to lay the keyline
  // under — so it gets an explicit wider pass drawn first instead.
  const haloPass =
    outline && glyph.stroke
      ? `<path d="${glyph.d}" fill="none" stroke="${outline}" stroke-width="${glyph.stroke + outlineWidth}" ` +
        `stroke-linecap="round" stroke-linejoin="round" />`
      : '';

  return (
    `<g transform="translate(${round(tx)} ${round(ty)}) scale(${round(scale)})">` +
    haloPass +
    `<path d="${glyph.d}" ${paint} />` +
    `</g>`
  );
}

/**
 * @description Build an incident or unit symbol as an SVG string.
 *              An incident is a severity-coloured pin around an ink glyph; a
 *              unit is the bare glyph in its service colour, keylined so it
 *              reads without a frame. A `label` names the symbol for assistive
 *              tech; it is only *drawn*, on a dark plate beside the mark, when
 *              `plate` is also set. A distress ring is drawn only when prosody
 *              exists; selection turns the pin's outline (or the unit's
 *              keyline) to --accent.
 */
export function buildSymbol(spec: SymbolSpec): string {
  const size = spec.size ?? 28;
  const isIncident = spec.kind === 'incident';
  const paint = incidentPaint(spec.severity);
  const color = isIncident
    ? paint.body
    : SERVICE_COLORS[spec.service ?? (spec.glyph as UnitService)] ?? UNKNOWN;

  const hasDistress = typeof spec.distress === 'number';
  // 'fire' means two different things depending on the kind: the hazard (a
  // flame, on an incident pin) and the service (a helmet, on a tender).
  const glyphKey = !isIncident && spec.glyph === 'fire' ? 'fireUnit' : spec.glyph;
  const glyph = GLYPHS[glyphKey] ?? GLYPHS.unknown;

  // Everything hangs off the symbol's optical centre: the pin's head for an
  // incident, the middle of the box for a bare unit glyph.
  const centreY = isIncident ? PIN_HEAD_Y : 12;
  // A unit glyph has no frame taking up room, so it fills nearly the whole box —
  // which is what makes a unit read as bigger and flatter than a pin of the same
  // nominal size, and is half of what tells the two kinds apart.
  const glyphSide = isIncident ? 11.4 : 19.5;
  const ringRadius = isIncident ? 9.2 : 10.2;

  // Selection recolours the existing rim rather than adding a ring, which
  // keeps a selected symbol inside the 24-unit box so nothing clips at the edge
  // of the viewBox. A selected pin trades its white rim for --accent; a
  // selected unit trades it for bold ink, because --accent IS the police
  // service colour — an accent keyline on a PCR van is blue on blue, and
  // selection would be invisible for exactly one of the three services.
  const strokeColor = spec.selected ? (isIncident ? ACCENT : INK) : RIM;
  const strokeWidth = spec.selected ? 2.4 : 1.4;

  // Incidents get a pin; units get no frame at all. A selected unit's keyline
  // thickens as well as darkening, since its silhouette has no frame to carry
  // the state.
  const unitKeylineWidth = spec.selected ? 3 : 2.2;
  const frame = isIncident
    ? `<path d="${PIN_PATH}" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linejoin="round" />`
    : '';

  // Distress ring. Drawn only when prosody was actually measured. A measured
  // reading always paints a dim background track so that a measured-calm marker
  // (distress 0) reads differently from one that was never measured (null):
  // the first shows the track, the second shows no ring at all. The coloured
  // progress arc is then swept over the track proportional to the measurement.
  let ring = '';
  if (hasDistress) {
    const level = Math.min(100, Math.max(0, spec.distress as number));
    const circumference = 2 * Math.PI * ringRadius;
    // Dim full track, in the module's existing rule colour, low opacity.
    ring =
      `<circle cx="12" cy="${centreY}" r="${ringRadius}" fill="none" stroke="#3B3B3B" ` +
      `stroke-width="1.5" opacity="0.35" />`;
    // Coloured progress arc, only when there is something to sweep.
    if (level > 0) {
      const dash = (level / 100) * circumference;
      ring +=
        `<circle cx="12" cy="${centreY}" r="${ringRadius}" fill="none" stroke="${distressColor(level)}" ` +
        `stroke-width="1.5" stroke-linecap="butt" ` +
        `stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}" ` +
        `transform="rotate(-90 12 ${centreY})" opacity="0.9" />`;
    }
  }

  // Name label beside the marker, in --ink on a dark plate, vertically centred
  // on the frame so the plate reads level with the pin head / disc.
  let plate = '';
  let viewW = 24;
  if (spec.label && spec.plate) {
    const plateW = Math.max(24, spec.label.length * 6 + 12);
    const plateY = centreY - 6;
    viewW = 28 + plateW;
    plate =
      `<rect x="26" y="${plateY}" width="${plateW}" height="12" rx="3" fill="#171717" stroke="#3B3B3B" stroke-width="1" />` +
      `<text x="${26 + plateW / 2}" y="${plateY + 8.9}" text-anchor="middle" font-size="9" font-weight="500" fill="#F2F2F2">${esc(spec.label)}</text>`;
  }

  const title = spec.label ? `<title>${esc(spec.label)}</title>` : '';
  const width = Math.round(size * (viewW / 24));

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewW} 24" width="${width}" height="${size}" ` +
    `data-kind="${esc(spec.kind)}"${hasDistress ? ` data-distress="${Math.round(spec.distress as number)}"` : ''} ` +
    `${spec.dimmed ? 'opacity="0.5" ' : ''}` +
    `role="img" aria-label="${esc(spec.label ?? spec.glyph)}">` +
    title +
    ring +
    frame +
    // Inside a pin the glyph is ink on the severity fill; standing alone it IS
    // the symbol, so it takes the service colour and carries its own keyline.
    (isIncident
      ? placeGlyph(glyph, 12, centreY, glyphSide, paint.glyph)
      : placeGlyph(glyph, 12, centreY, glyphSide, color, strokeColor, unitKeylineWidth)) +
    plate +
    `</svg>`
  );
}
