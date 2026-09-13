import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSymbol,
  severityColor,
  distressColor,
  glyphForIncidentType,
  incidentPaint,
  incidentSymbolSize,
  SYMBOL_ANCHOR,
} from './symbols.ts';

/** The opening of the incident pin's path, used to assert a unit has no pin. */
const PIN_PATH_START = 'M12 21\.9C10\.4 19\.4';

test('severity maps to the documented signal colours', () => {
  assert.equal(severityColor('critical'), '#F40000'); // CRITICAL
  assert.equal(severityColor('high'), '#FABC1F');     // MILD (P2)
  assert.equal(severityColor('medium'), '#47FF85');   // SAFE (P3)
  assert.equal(severityColor('low'), '#47FF85');      // SAFE (P4)
  assert.equal(severityColor(undefined), '#9F9F9F');  // ungraded → neutral ink
});

test('incident type maps onto a known glyph, unknown falls through', () => {
  assert.equal(glyphForIncidentType('fire'), 'fire');
  assert.equal(glyphForIncidentType('medical_emergency'), 'medical');
  assert.equal(glyphForIncidentType('accident'), 'traffic');
  assert.equal(glyphForIncidentType('crime'), 'crime');
  assert.equal(glyphForIncidentType('public_safety'), 'utility');
  assert.equal(glyphForIncidentType('waterlogging'), 'water');
  assert.equal(glyphForIncidentType('flood_rescue'), 'water');
  assert.equal(glyphForIncidentType('something we never saw'), 'unknown');
  assert.equal(glyphForIncidentType(undefined), 'unknown');
});

test('distress colour ramps calm to peak', () => {
  assert.equal(distressColor(0), '#47FF85');
  assert.equal(distressColor(100), '#F40000');
  // Midpoint sits between the two endpoints, not equal to either.
  const mid = distressColor(50);
  assert.notEqual(mid, '#47FF85');
  assert.notEqual(mid, '#F40000');
  assert.match(mid, /^#[0-9A-F]{6}$/i);
});

test('an incident renders a map pin in its severity colour, never a triangle', () => {
  const svg = buildSymbol({ kind: 'incident', glyph: 'fire', severity: 'critical' });
  assert.match(svg, /<svg/);
  assert.match(svg, /data-kind="incident"/);
  assert.match(svg, /#F40000/);

  // The frame is a pin, not a polygon. Operators reported the old triangles as
  // unreadable — every incident looked like the same red wedge — so the shape
  // is pinned here: a regression back to <polygon> must fail this test.
  assert.doesNotMatch(svg, /<polygon/);
  const m = svg.match(/<path d="(M12 21\.9[^"]*)" fill="#F40000"/);
  assert.ok(m, 'incident frame must be the pin <path> filled in the severity colour');
  // The pin's tip is its anchor point and sits at the bottom of the 24-unit box.
  assert.equal(SYMBOL_ANCHOR.incident.y, 21.9);
  assert.equal(SYMBOL_ANCHOR.unit.y, 12);
});

test('each incident type draws its own glyph, so colour is not the only cue', () => {
  const glyphOf = (glyph: Parameters<typeof buildSymbol>[0]['glyph']) => {
    const svg = buildSymbol({ kind: 'incident', glyph, severity: 'critical' });
    const m = svg.match(/<g transform="[^"]*"><path d="([^"]+)"/);
    assert.ok(m, `glyph ${String(glyph)} must render an inner path`);
    return m![1];
  };

  // Every incident glyph is a distinct silhouette. A cardiac call and a fire
  // call painted the same critical red must still look like different things.
  const drawn = ['medical', 'fire', 'water', 'traffic', 'crime', 'utility', 'unknown'].map(
    (g) => glyphOf(g as Parameters<typeof buildSymbol>[0]['glyph']),
  );
  assert.equal(new Set(drawn).size, drawn.length, 'no two incident glyphs may share a path');

  // And the medical glyph really is the heart, not the old generic cross.
  assert.match(
    buildSymbol({ kind: 'incident', glyph: 'medical', severity: 'critical' }),
    /M12 20\.8C7\.6 17\.7/,
  );
});

test('an unrecognised glyph falls back to the unknown mark rather than vanishing', () => {
  const svg = buildSymbol({
    kind: 'incident',
    // A stored call can carry a type nobody has mapped yet.
    glyph: 'not-a-real-glyph' as Parameters<typeof buildSymbol>[0]['glyph'],
    severity: 'low',
  });
  assert.match(svg, /<g transform="[^"]*"><path d="M11 17\.4h2v2h-2Z/);
});

test('a measured-calm marker is visually distinct from a never-measured one', () => {
  // Measured and calm (distress 0): a dim background track ring is painted, but
  // no coloured progress arc. The track is what makes "measured" visible.
  const calm = buildSymbol({
    kind: 'incident', glyph: 'medical', severity: 'high', distress: 0,
  });
  assert.match(calm, /stroke="#3B3B3B"/); // the dim track ring
  assert.doesNotMatch(calm, /stroke-dasharray/); // no coloured progress arc at 0

  // Never measured (null): NO ring markup at all. The incident frame is a
  // <polygon>, so a total absence of <circle> proves no ring was drawn — the
  // two markers differ in rendered SVG, not merely in a data attribute.
  const never = buildSymbol({
    kind: 'incident', glyph: 'medical', severity: 'high', distress: null,
  });
  assert.doesNotMatch(never, /<circle/);
  assert.doesNotMatch(never, /stroke="#3B3B3B"/);

  // The two are genuinely different renderings.
  assert.notEqual(calm, never);
});

test('a measured mid-value marker draws both the track and the coloured arc', () => {
  const mid = buildSymbol({
    kind: 'incident', glyph: 'medical', severity: 'high', distress: 70,
  });
  assert.match(mid, /stroke="#3B3B3B"/); // dim background track
  assert.match(mid, /stroke-dasharray/); // coloured progress arc over it
});

test('a unit is a bare glyph in its service colour, with no frame around it', () => {
  const svg = buildSymbol({ kind: 'unit', glyph: 'police', service: 'police' });
  assert.match(svg, /data-kind="unit"/);

  // The service colour is on the glyph itself, not on a disc behind it. A frame
  // came back once and made units indistinguishable from incident pins at map
  // size, so its absence is pinned here.
  assert.doesNotMatch(svg, /<circle/);
  assert.doesNotMatch(svg, new RegExp(PIN_PATH_START));
  assert.match(svg, /<path d="[^"]+" fill="#69D2FF"/);

  // A frameless glyph sits straight on satellite imagery, so it carries its
  // own off-white rim, laid under the fill rather than over it.
  assert.match(svg, /paint-order="stroke"/);
  assert.match(svg, /stroke="#F2F2F2"/);
});

test('a selected unit takes a bold ink keyline, because accent is the police colour', () => {
  // Two constraints meet here. The resting rim is off-white on every symbol,
  // so selection must be something else — and it cannot be --accent (#69D2FF),
  // because that is also the police service colour: an accent keyline on a
  // selected PCR van is blue on blue, invisible for exactly one of the three
  // services. Bold ink is visible against all three fills and against the
  // white-rimmed neighbours.
  const police = buildSymbol({ kind: 'unit', glyph: 'police', service: 'police', selected: true });
  assert.match(police, /stroke="#0B0B0B"/);
  assert.doesNotMatch(police, /stroke="#69D2FF"/);
  assert.doesNotMatch(police, /<circle/);
  // And it is genuinely a different rendering from the unselected van.
  assert.notEqual(police, buildSymbol({ kind: 'unit', glyph: 'police', service: 'police' }));

  // A pin's selected rim IS --accent: its fill is a severity colour, never the
  // accent, so blue-on-blue cannot happen there.
  const pin = buildSymbol({ kind: 'incident', glyph: 'fire', severity: 'critical', selected: true });
  assert.match(pin, /stroke="#69D2FF"/);

  // At rest, both kinds wear the off-white rim.
  const restingPin = buildSymbol({ kind: 'incident', glyph: 'fire', severity: 'critical' });
  assert.match(restingPin, /stroke="#F2F2F2"/);
});

test('a unit glyph is drawn larger than the glyph inside an incident pin', () => {
  // Size is the other half of telling the kinds apart: a unit has no frame
  // eating its box, so at the same nominal size its mark is visibly bigger.
  //
  // The comparison has to be like-for-like. A scale factor is relative to the
  // glyph's OWN bounding box, so comparing the scale of one glyph against a
  // differently-proportioned one measures nothing (a wide, short helmet needs
  // less scaling than a tall flame to reach the same extent). The police
  // shield and the crime shield are the same path and the same box, so their
  // scales are directly comparable - and any drift in the frameless-unit
  // sizing rule still shows up here.
  const scaleOf = (svg: string) => {
    const m = svg.match(/scale\(([\d.]+)\)/);
    assert.ok(m, 'glyph must carry a scale transform');
    return Number(m![1]);
  };
  const unit = buildSymbol({ kind: 'unit', glyph: 'police', service: 'police' });
  const incident = buildSymbol({ kind: 'incident', glyph: 'crime', severity: 'critical' });
  assert.ok(
    scaleOf(unit) > scaleOf(incident) * 1.4,
    'a frameless unit glyph must be substantially larger than a pinned one',
  );
});

test('the fire service and the fire hazard no longer draw the same mark', () => {
  // Both are signal red. When both were a flame, a red flame meant either
  // "there is a fire here" or "the brigade is here", and only the frame said
  // which - the single worst ambiguity on the map.
  const pathOf = (svg: string) => svg.match(/<g transform="[^"]*"><path d="([^"]+)"/)![1];
  const hazard = pathOf(buildSymbol({ kind: 'incident', glyph: 'fire', severity: 'critical' }));
  const service = pathOf(buildSymbol({ kind: 'unit', glyph: 'fire', service: 'fire' }));
  assert.notEqual(hazard, service);

  // The unit is the helmet, and no incident glyph may claim it.
  const incidentGlyphs = (['medical', 'fire', 'water', 'traffic', 'crime', 'utility', 'unknown'] as const)
    .map((glyph) => pathOf(buildSymbol({ kind: 'incident', glyph, severity: 'critical' })));
  assert.ok(!incidentGlyphs.includes(service), 'the helmet must be unique to the fire service');
});

test('priority drives both size and saturation, so P1 outranks P3 twice over', () => {
  // Colour alone is a weak hierarchy: it dies in greyscale and for a
  // colour-blind operator. Size carries the same ranking independently.
  assert.ok(incidentSymbolSize('critical') > incidentSymbolSize('high'));
  assert.ok(incidentSymbolSize('high') > incidentSymbolSize('medium'));
  assert.equal(incidentSymbolSize('low'), incidentSymbolSize('medium'));
  assert.equal(incidentSymbolSize(undefined), incidentSymbolSize('medium'));

  // P1 and P2 are solid signal colours with a dark mark; anything below is a
  // graphite chip carrying a coloured mark, so it recedes.
  assert.equal(incidentPaint('critical').body, '#F40000');
  assert.equal(incidentPaint('high').body, '#FABC1F');
  const low = incidentPaint('low');
  assert.equal(low.body, '#242424');
  assert.equal(low.glyph, '#47FF85');
  // The quiet tier must not be painted in a full-chroma body.
  assert.notEqual(incidentPaint('medium').body, '#47FF85');
});

test('a committed unit is dimmed, so the map answers "who can I send"', () => {
  const free = buildSymbol({ kind: 'unit', glyph: 'ems', service: 'ems' });
  const busy = buildSymbol({ kind: 'unit', glyph: 'ems', service: 'ems', dimmed: true });
  assert.doesNotMatch(free, /opacity="0\.5"/);
  assert.match(busy, /opacity="0\.5"/);
  assert.notEqual(free, busy);
});

test('the three services draw three different unit glyphs', () => {
  const paths = (['police', 'fire', 'ems'] as const).map((service) => {
    const svg = buildSymbol({ kind: 'unit', glyph: service, service });
    const m = svg.match(/<g transform="[^"]*"><path d="([^"]+)"/);
    assert.ok(m, `unit glyph for ${service} must render`);
    return m![1];
  });
  assert.equal(new Set(paths).size, 3, 'PCR, tender and ambulance must be distinguishable');
});

test('the distress ring appears only when prosody exists', () => {
  const withProsody = buildSymbol({
    kind: 'incident', glyph: 'medical', severity: 'high', distress: 70,
  });
  assert.match(withProsody, /data-distress="70"/);

  const noProsody = buildSymbol({
    kind: 'incident', glyph: 'medical', severity: 'high', distress: null,
  });
  assert.doesNotMatch(noProsody, /data-distress/);

  // Zero distress is a measurement and must still draw, so absence is
  // visually distinct from calm.
  const calm = buildSymbol({
    kind: 'incident', glyph: 'medical', severity: 'high', distress: 0,
  });
  assert.match(calm, /data-distress="0"/);
});

test('labels are escaped so a symbol can never inject markup', () => {
  const svg = buildSymbol({
    kind: 'incident',
    glyph: 'fire',
    severity: 'critical',
    // `plate` is what puts the label into the SVG as drawn text, so the sink
    // only exists with it on — which is exactly the case worth pinning.
    plate: true,
    label: '<img src=x onerror="alert(1)">',
  });
  assert.doesNotMatch(svg, /<img/);
  assert.match(svg, /&lt;img/);
});

test('a label names the symbol without drawing a plate unless asked', () => {
  // A plate on every map marker buried the map under text. The label still has
  // to reach assistive tech, so naming and drawing are separate concerns.
  const named = buildSymbol({ kind: 'unit', glyph: 'ems', service: 'ems', label: 'CATS-309' });
  assert.match(named, /aria-label="CATS-309"/);
  assert.match(named, /<title>CATS-309<\/title>/);
  assert.doesNotMatch(named, /<rect/);
  assert.doesNotMatch(named, /<text/);
  // And the symbol stays square, so a caller's iconSize still matches it.
  assert.match(named, /viewBox="0 0 24 24"/);

  const plated = buildSymbol({
    kind: 'unit', glyph: 'ems', service: 'ems', label: 'CATS-309', plate: true,
  });
  assert.match(plated, /<text/);
  assert.match(plated, />CATS-309</);
});

/**
 * SVG path parameter counts, by command. A browser rejects an entire `d`
 * attribute whose command carries the wrong number of parameters, and renders
 * nothing at all - silently, apart from a console warning nobody reads.
 */
const PATH_ARITY: Record<string, number> = {
  m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0,
};

/**
 * @description Assert an SVG path parses the way a browser parses it: split on
 *              commands, count the numbers each one carries, and require a whole
 *              number of parameter groups.
 *
 *              This exists because these paths are assembled from concatenated
 *              source lines, and dropping the separator between two of them
 *              fuses the numbers across the join - "...1.2-1.8" + "1-.8..."
 *              silently becomes "-1.81", one number where there were two. The
 *              path stays a plausible-looking string, so only the parameter
 *              count gives it away.
 */
function assertPathParses(d: string, label: string): void {
  const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g);
  assert.ok(commands && commands.length > 0, `${label}: no path commands found`);

  for (const chunk of commands!) {
    const letter = chunk[0];
    const arity = PATH_ARITY[letter.toLowerCase()];
    assert.ok(arity !== undefined, `${label}: unknown path command "${letter}"`);

    const numbers = chunk.slice(1).match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? [];
    if (arity === 0) {
      assert.equal(numbers.length, 0, `${label}: "${letter}" takes no parameters`);
      continue;
    }
    assert.ok(numbers.length > 0, `${label}: "${letter}" has no parameters`);
    assert.equal(
      numbers.length % arity,
      0,
      `${label}: "${letter}" carries ${numbers.length} numbers, not a multiple of ${arity} ` +
        `(a browser would reject the whole path). Chunk: ${chunk.trim()}`,
    );
  }
}

test('every glyph path is well formed, so no symbol silently fails to draw', () => {
  const specs: Array<Parameters<typeof buildSymbol>[0]> = [
    ...(['medical', 'fire', 'water', 'traffic', 'crime', 'utility', 'unknown'] as const).map(
      (glyph) => ({ kind: 'incident' as const, glyph, severity: 'critical' as const }),
    ),
    ...(['police', 'fire', 'ems'] as const).map((service) => ({
      kind: 'unit' as const,
      glyph: service,
      service,
    })),
  ];

  for (const spec of specs) {
    const svg = buildSymbol(spec);
    const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(paths.length > 0, `${spec.kind}/${spec.glyph}: rendered no paths`);
    paths.forEach((d, i) => assertPathParses(d, `${spec.kind}/${spec.glyph} path ${i}`));
  }
});
