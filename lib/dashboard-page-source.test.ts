import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';

test('dashboard keeps the call station without the redundant start-here band', async () => {
  const dashboardSource = await readFile(path.join(process.cwd(), 'app', 'dashboard', 'page.tsx'), 'utf8');

  assert.ok(
    dashboardSource.includes('<StartEmergencyCall'),
    'dashboard must keep the functional emergency call station',
  );
  assert.ok(
    !dashboardSource.includes('Place a 112 call — start here'),
    'dashboard should not render the redundant top start-here band',
  );
});

test('incident detail keeps dispatch focused instead of repeating operator checklists', async () => {
  const dashboardSource = await readFile(path.join(process.cwd(), 'app', 'dashboard', 'page.tsx'), 'utf8');

  assert.ok(
    !dashboardSource.includes('IncidentActionChecklistPanel'),
    'incident detail should not render the separate next-action checklist panel',
  );
  assert.ok(
    !dashboardSource.includes('Operator actions'),
    'incident detail should not render a separate operator-actions section',
  );
  assert.ok(
    !dashboardSource.includes('Operator next questions'),
    'incident detail should not repeat missing-info questions as another section',
  );
  assert.ok(
    dashboardSource.includes('DispatchSuggestedUnitsPanel'),
    'incident detail should use one focused suggested-dispatch panel',
  );
});

test('decision timeline uses compact proposal rows rather than large repeated cards', async () => {
  const timelineSource = await readFile(path.join(process.cwd(), 'components', 'IncidentTimeline.tsx'), 'utf8');

  assert.ok(!timelineSource.includes('AI proposal'), 'timeline should not label each step as a large AI proposal card');
  assert.ok(!timelineSource.includes('Locked'), 'future timeline steps should be compact pending rows, not locked cards');
  assert.ok(
    timelineSource.includes('DecisionStepRow'),
    'timeline should render each decision point through the compact row component',
  );
});

test('voice station cannot stay forever on the opening socket state', async () => {
  const voiceSource = await readFile(path.join(process.cwd(), 'components', 'StartEmergencyCall.tsx'), 'utf8');

  assert.ok(
    voiceSource.includes('VOICE_CONNECT_TIMEOUT_MS'),
    'live voice connection should have an explicit timeout',
  );
  assert.ok(
    voiceSource.includes('The live voice session is taking too long to open'),
    'timeout should give the caller an actionable fallback instead of a permanent spinner',
  );
});

test('voice station labels the live path as a demo call', async () => {
  const voiceSource = await readFile(path.join(process.cwd(), 'components', 'StartEmergencyCall.tsx'), 'utf8');

  assert.ok(voiceSource.includes('Start live demo call'));
  assert.ok(!voiceSource.includes('Start live call'));
});

test('voice station does not show a caller number editor', async () => {
  const voiceSource = await readFile(path.join(process.cwd(), 'components', 'StartEmergencyCall.tsx'), 'utf8');

  assert.ok(!voiceSource.includes('htmlFor="caller-number"'));
  assert.ok(!voiceSource.includes('id="caller-number"'));
  assert.ok(!voiceSource.includes('Caller number'));
});

test('scripted playback still raises a backend-triaged incident event', async () => {
  const voiceSource = await readFile(path.join(process.cwd(), 'components', 'StartEmergencyCall.tsx'), 'utf8');

  assert.match(voiceSource, /triageAndPublish\(script\.phone,\s*built,\s*collectedFrames,\s*seconds,\s*'simulated'/);
  assert.ok(voiceSource.includes("publishLiveCallEvent('end', built, 'simulated', language)"));
});

test('scripted incidents are labelled as scripted calls in shared provenance', async () => {
  const incidentSource = await readFile(path.join(process.cwd(), 'lib', 'incident.ts'), 'utf8');

  assert.ok(incidentSource.includes("? 'Scripted call' : 'Kwik 112 voice'"));
  assert.ok(!incidentSource.includes("? 'Simulated demo' : 'Kwik 112 voice'"));
});

// Execute the real timeline component with a small hook host. Browser-only
// rendering dependencies are stubbed; decisions and reservation storage are real.
import ts from 'typescript';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const nativeRequire = createRequire(import.meta.url);
function timelineHost(entry = 'components/IncidentTimeline.tsx') {
  const slots: any[] = []; let cursor = 0; const effects: (() => void)[] = [];
  const hooks = {
    use(value: any) { return value; },
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (v: any) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || deps.some((d, n) => d !== slots[i].deps[n])) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn: any, deps: any[]) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || deps.some((d, n) => d !== slots[i][n])) { slots[i] = deps; effects.push(fn); } },
  };
  const cache = new Map<string, any>();
  function load(filename: string): any {
    if (cache.has(filename)) return cache.get(filename);
    const exports = {}; cache.set(filename, exports);
    const input = process.env.RUNTIME_TEST_BASELINE && /^(components|app)[\\/]/.test(path.relative(process.cwd(), filename)) ? execFileSync('git', ['show', '45ab1d197036d73574cbe64029c11a9d55860c99:' + path.relative(process.cwd(), filename).replaceAll('\\', '/')], { encoding: 'utf8' }) : readFileSync(filename, 'utf8');
    const source = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const require = (id: string) => {
      if (id === 'react') return hooks;
      if (id === 'next/dynamic') return { default: () => 'DynamicComponent' };
      if (id === 'next/link') return { default: 'Link' };
      if (id.includes('useDialogFocus')) return { useDialogFocus: () => ({ dialogRef: null, onKeyDown: () => {} }) };
      if (id.startsWith('@/components/') || id === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      if (id.startsWith('@/') || id.startsWith('.')) {
        let target = id.startsWith('@/') ? path.join(process.cwd(), id.slice(2)) : path.resolve(path.dirname(filename), id);
        if (!existsSync(target)) target += existsSync(target + '.ts') ? '.ts' : '.tsx';
        return load(target);
      }
      return nativeRequire(id);
    };
    new Function('require', 'exports', source)(require, exports);
    return exports;
  }
  const component = load(path.join(process.cwd(), entry)).default;
  return { render(props: any) { cursor = 0; const tree = component(props); effects.splice(0).forEach(fn => fn()); return tree; }, load };
}
function nodes(tree: any): any[] { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }

test('selected roster unit stays a proposal until DISPATCH, then receipt and lifecycle agree', async () => {
  const data = new Map<string, string>(); const events = new EventTarget();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) };
  const previousWindow = globalThis.window; const previousStorage = globalThis.localStorage;
  Object.assign(globalThis, { window: Object.assign(events, { localStorage: storage }), localStorage: storage });
  try {
    const host = timelineHost();
    const fleet = host.load(path.join(process.cwd(), 'lib/units.ts')).TACTICAL_UNITS;
    const selected = fleet.find((u: any) => u.status === 'available' && u.type === 'ems');
    const call = { id: 'regression', status: 'incoming', severity: 'critical', incident_type: 'medical', caller_location: { latitude: selected.lat, longitude: selected.lng, confidence: 1 }, created_at: new Date().toISOString() };
    storage.setItem('kwik_emergency_calls', JSON.stringify([call]));
    const props = { open: true, onClose() {}, call, selectedUnitId: selected.id };
    host.render(props);
    const submit = async () => { const button = nodes(host.render(props)).find(n => n.type === 'button' && n.props.onClick?.constructor.name === 'AsyncFunction'); assert.ok(button, 'checkpoint submit exists'); assert.equal(button.props.disabled, false); await button.props.onClick(); };
    assert.equal(storage.getItem('dispatch_unit_reservations'), null);
    await submit(); // INTAKE
    assert.equal(storage.getItem('dispatch_unit_reservations'), null);
    await submit(); // DISPATCH
    assert.deepEqual(JSON.parse(storage.getItem('dispatch_unit_reservations') ?? '{}'), { [selected.id]: call.id });
    const records = JSON.parse(storage.getItem('dispatch_timeline')!)[call.id];
    assert.ok(records[1].proposal.items.some((item: string) => item.includes(selected.id)));
    assert.equal(JSON.parse(storage.getItem('kwik_emergency_calls')!)[0].status, 'dispatched');
    await submit(); // RESOLUTION
    assert.deepEqual(JSON.parse(storage.getItem('dispatch_unit_reservations')!), {});
    assert.equal(JSON.parse(storage.getItem('kwik_emergency_calls')!)[0].status, 'resolved');
  } finally { Object.assign(globalThis, { window: previousWindow, localStorage: previousStorage }); }
});


async function browserFixture(run: (storage: any, events: any) => Promise<void> | void) {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) };
  const events = Object.assign(new EventTarget(), { localStorage: storage, sessionStorage: storage, innerWidth: 1440, location: { search: '', hash: '' }, setInterval: () => 1, clearInterval() {} });
  const previous = { window: globalThis.window, localStorage: globalThis.localStorage, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  Object.assign(globalThis, { window: events, localStorage: storage, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {} });
  try { await run(storage, events); } finally { Object.assign(globalThis, previous); }
}

test('mounted alerts age with unchanged calls and receive cross-tab acknowledgements', async () => browserFixture((storage, events) => {
  const host = timelineHost('components/AlertsModule.tsx'); const start = Date.now();
  const calls = [{ id: 'aging', severity: 'critical', status: 'incoming', created_at: new Date(start).toISOString(), caller_location: { latitude: 28.6, longitude: 77.2 } }];
  const urgent = (tree: any) => nodes(tree).find(n => n.props?.label === 'Urgent now').props.value;
  assert.equal(urgent(host.render({ calls, now: start })), 0);
  assert.equal(urgent(host.render({ calls, now: start + 91000 })), 1);
  const alerts = host.load(path.join(process.cwd(), 'lib/alerts.ts'));
  alerts.acknowledge('aging:P1_UNASSIGNED');
  events.dispatchEvent(Object.assign(new Event('storage'), { key: alerts.ACK_STORAGE_KEY }));
  assert.equal(urgent(host.render({ calls, now: start + 91000 })), 0);
}));

test('dashboard reading storage retains unlocated records and roster action only opens checkpoints', async () => browserFixture((storage) => {
  const unknown = { id: 'unlocated', severity: 'critical', status: 'incoming', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const outside = { ...unknown, id: 'outside', caller_location: { city: 'Mumbai' } };
  const original = JSON.stringify([unknown, outside]); storage.setItem('kwik_emergency_calls', original);
  const host = timelineHost('app/dashboard/page.tsx'); host.render({}); let tree = host.render({});
  assert.equal(storage.getItem('kwik_emergency_calls'), original, 'read must not rewrite persisted calls');
  const map = nodes(tree).find(n => n.props?.onMarkerClick);
  assert.ok(map.props.calls.some((call: any) => call.id === unknown.id), 'unlocated call visible for location review');
  nodes(tree).find(n => n.props?.onCallCreated).props.onCallCreated(unknown.id);
  tree = host.render({});
  const detail = nodes(tree).find(n => n.props?.onDispatchSuggestedUnit);
  // The initial selection is the unlocated call; dispatch must open a proposal.
  detail.props.onDispatchSuggestedUnit('AMB-302', unknown.id, 'Ambulance 302');
  tree = host.render({});
  const timeline = nodes(tree).find(n => n.type === 'default' && n.props?.linkedPrimaryCallId !== undefined && 'open' in n.props);
  assert.ok(timeline?.props.open, 'roster opens timeline');
  assert.equal(timeline.props.selectedUnitId, 'AMB-302');
  assert.equal(storage.getItem('dispatch_unit_reservations'), null);
}));

test('muted critical arrivals announce visually and enabling sound does not replay them', async () => browserFixture((storage, events) => {
  let tones = 0;
  Object.assign(events, { AudioContext: class { currentTime = 0; destination = {}; resume() {} createOscillator() { tones++; return { frequency: {}, connect() { return { connect() {} }; }, start() {}, stop() {} }; } createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } } });
  const host = timelineHost('app/dashboard/page.tsx'); host.render({}); host.render({});
  const call = { id: 'new-critical', status: 'incoming', severity: 'critical', incident_type: 'medical', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), caller_location: { city: 'Delhi' } };
  storage.setItem('kwik_emergency_calls', JSON.stringify([call]));
  events.dispatchEvent(new CustomEvent('kwik-call-updated', { detail: { call, isUpdate: false } }));
  host.render({}); let tree = host.render({});
  assert.equal(tones, 0, 'off stays silent');
  assert.ok(nodes(tree).some(n => n.props?.['aria-live'] && JSON.stringify(n.props.children).includes('New critical incident')));
  const toggle = nodes(tree).find(n => n.props?.['aria-label'] === 'Turn alert sound on for new critical calls');
  toggle.props.onClick(); host.render({});
  assert.equal(tones, 0, 'enabling does not replay an existing arrival');
  const next = { ...call, id: 'next-critical' };
  storage.setItem('kwik_emergency_calls', JSON.stringify([next, call]));
  events.dispatchEvent(new CustomEvent('kwik-call-updated', { detail: { call: next, isUpdate: false } }));
  host.render({}); assert.equal(tones, 2, 'new arrival plays two notes when enabled');
}));

test('stale checkpoint submit cannot overwrite a decision made in another tab', async () => browserFixture(async (storage) => {
  const host = timelineHost(); const call = { id: 'stale', severity: 'critical', status: 'incoming', created_at: new Date().toISOString() };
  const props = { open: true, onClose() {}, call }; host.render(props);
  const submit = nodes(host.render(props)).find(n => n.type === 'button' && n.props.onClick?.constructor.name === 'AsyncFunction');
  const external = [{ point: 'INTAKE', action: 'amended', at: new Date().toISOString(), note: 'Verified in second console' }];
  storage.setItem('dispatch_timeline', JSON.stringify({ stale: external }));
  await submit.props.onClick();
  assert.deepEqual(JSON.parse(storage.getItem('dispatch_timeline')).stale, external);
  assert.equal(storage.getItem('dispatch_unit_reservations'), null);
}));

test('selected dispatch enforces location, coverage, duplicate, and reservation conflict checks', async () => browserFixture(async (storage) => {
  const host = timelineHost(); const fleet = host.load(path.join(process.cwd(), 'lib/units.ts')).TACTICAL_UNITS;
  const selected = fleet.find((u: any) => u.status === 'available' && u.type === 'ems');
  const call = { id: 'guards', severity: 'critical', status: 'incoming', created_at: new Date().toISOString(), caller_location: { latitude: selected.lat, longitude: selected.lng, confidence: 1 } };
  storage.setItem('dispatch_timeline', JSON.stringify({ guards: [{ point: 'INTAKE', action: 'confirmed', at: new Date().toISOString() }] }));
  const props = { open: true, onClose() {}, call, selectedUnitId: selected.id };
  const button = (tree: any) => nodes(tree).find(n => n.type === 'button' && n.props.onClick?.constructor.name === 'AsyncFunction');
  host.render(props);
  assert.equal(button(host.render({ ...props, call: { ...call, caller_location: undefined } })).props.disabled, true);
  assert.equal(button(host.render({ ...props, call: { ...call, dispatch_plan: { units: [{ service: 'civic', unit: 'Utility crew' }] } } })).props.disabled, true);
  assert.equal(button(host.render({ ...props, linkedPrimaryCallId: 'primary' })).props.disabled, true);
  const ready = button(host.render(props)); assert.equal(ready.props.disabled, false);
  storage.setItem('dispatch_unit_reservations', JSON.stringify({ [selected.id]: 'other-call' }));
  await ready.props.onClick();
  assert.equal(JSON.parse(storage.getItem('dispatch_timeline')).guards.length, 1);
  assert.deepEqual(JSON.parse(storage.getItem('dispatch_unit_reservations')), { [selected.id]: 'other-call' });
}));

test('incident dossier recovers when a missing call arrives via storage', async () => browserFixture((storage, events) => {
  const host = timelineHost('app/dashboard/calls/[id]/page.tsx'); const props = { params: { id: 'late-call' } };
  host.render(props); const missing = host.render(props);
  assert.ok(JSON.stringify(missing).includes('not found'));
  const call = { id: 'late-call', status: 'incoming', severity: 'high', incident_type: 'medical', created_at: new Date().toISOString() };
  storage.setItem('kwik_emergency_calls', JSON.stringify([call]));
  events.dispatchEvent(Object.assign(new Event('storage'), { key: 'kwik_emergency_calls' }));
  const recovered = JSON.stringify(host.render(props));
  assert.ok(!recovered.includes('not found'));
  assert.ok(recovered.includes('Incident dossier'));
}));

test('selecting one roster unit retains remaining coverage for a multi-service proposal', async () => browserFixture(async (storage) => {
  const host = timelineHost(); const fleet = host.load(path.join(process.cwd(), 'lib/units.ts')).TACTICAL_UNITS;
  const selected = fleet.find((u: any) => u.status === 'available' && u.type === 'ems');
  const call = { id: 'multi', severity: 'critical', status: 'incoming', created_at: new Date().toISOString(), caller_location: { latitude: selected.lat, longitude: selected.lng, confidence: 1 }, dispatch_plan: { units: [{ service: 'ems', unit: 'Ambulance' }, { service: 'fire', unit: 'Engine' }] } };
  storage.setItem('dispatch_timeline', JSON.stringify({ multi: [{ point: 'INTAKE', action: 'confirmed', at: new Date().toISOString() }] }));
  const props = { open: true, onClose() {}, call, selectedUnitId: selected.id }; host.render(props);
  const button = nodes(host.render(props)).find(n => n.type === 'button' && n.props.onClick?.constructor.name === 'AsyncFunction');
  assert.equal(button.props.disabled, false, 'selected ambulance must retain fire coverage');
  await button.props.onClick();
  const reservations = JSON.parse(storage.getItem('dispatch_unit_reservations'));
  assert.equal(reservations[selected.id], call.id);
  assert.equal(Object.keys(reservations).length, 2);
  assert.ok(Object.keys(reservations).some(id => fleet.find((u: any) => u.id === id).type === 'fire'));
}));

test('new roster selection after stand down requires and records a fresh dispatch amendment', async () => browserFixture(async (storage) => {
  const host = timelineHost(); const fleet = host.load(path.join(process.cwd(), 'lib/units.ts')).TACTICAL_UNITS;
  const selected = fleet.find((u: any) => u.status === 'available' && u.type === 'ems');
  const call = { id: 'replace', severity: 'critical', status: 'dispatched', created_at: new Date().toISOString(), caller_location: { latitude: selected.lat, longitude: selected.lng, confidence: 1 } };
  storage.setItem('kwik_emergency_calls', JSON.stringify([call]));
  storage.setItem('dispatch_timeline', JSON.stringify({ replace: [{ point: 'INTAKE', action: 'confirmed', at: new Date().toISOString() }, { point: 'DISPATCH', action: 'confirmed', at: new Date().toISOString(), proposal: { heading: 'Earlier dispatch', body: '', items: ['Previous recalled unit'] } }] }));
  const props = { open: true, onClose() {}, call, selectedUnitId: selected.id }; host.render(props);
  const button = nodes(host.render(props)).find(n => n.type === 'button' && n.props.onClick?.constructor.name === 'AsyncFunction');
  assert.equal(storage.getItem('dispatch_unit_reservations'), null);
  await button.props.onClick();
  assert.equal(JSON.parse(storage.getItem('dispatch_unit_reservations'))[selected.id], call.id);
  const records = JSON.parse(storage.getItem('dispatch_timeline')).replace;
  assert.equal(records.length, 2, 'replacement must not resolve the incident');
  assert.equal(records[1].action, 'amended');
  assert.ok(records[1].note.includes('Previous recalled unit'));
  assert.equal(JSON.parse(storage.getItem('kwik_emergency_calls'))[0].status, 'dispatched');
}));

test('failed lifecycle persistence rolls back the dispatch reservation and checkpoint', async () => browserFixture(async (storage) => {
  const host = timelineHost(); const fleet = host.load(path.join(process.cwd(), 'lib/units.ts')).TACTICAL_UNITS;
  const selected = fleet.find((u: any) => u.status === 'available' && u.type === 'ems');
  const call = { id: 'write-failure', severity: 'critical', status: 'incoming', created_at: new Date().toISOString(), caller_location: { latitude: selected.lat, longitude: selected.lng, confidence: 1 } };
  const intake = [{ point: 'INTAKE', action: 'confirmed', at: new Date().toISOString() }];
  storage.setItem('kwik_emergency_calls', JSON.stringify([call]));
  storage.setItem('dispatch_timeline', JSON.stringify({ [call.id]: intake }));
  const props = { open: true, onClose() {}, call, selectedUnitId: selected.id }; host.render(props);
  const button = nodes(host.render(props)).find(n => n.type === 'button' && n.props.onClick?.constructor.name === 'AsyncFunction');
  const write = storage.setItem; let failOnce = true;
  storage.setItem = (key: string, value: string) => { if (key === 'kwik_emergency_calls' && failOnce) { failOnce = false; throw new Error('storage full'); } write(key, value); };
  await button.props.onClick();
  assert.deepEqual(JSON.parse(storage.getItem('dispatch_timeline'))[call.id], intake);
  assert.deepEqual(JSON.parse(storage.getItem('dispatch_unit_reservations') ?? '{}'), {});
  assert.equal(JSON.parse(storage.getItem('kwik_emergency_calls'))[0].status, 'incoming');
}));

test('delhi-1 selected unit proposal preserves fire, rescue, and ALS coverage', async () => browserFixture(async (storage) => {
  const host = timelineHost(); const fleet = host.load(path.join(process.cwd(), 'lib/units.ts')).TACTICAL_UNITS;
  const call = host.load(path.join(process.cwd(), 'lib/mock-data.ts')).mockCalls.find((entry: any) => entry.id === 'delhi-1');
  const assurance = host.load(path.join(process.cwd(), 'lib/dispatch-assurance.ts')).assessDispatch;
  const selectedId = assurance(call, fleet).assignments[0].unit_id;
  storage.setItem('dispatch_timeline', JSON.stringify({ [call.id]: [{ point: 'INTAKE', action: 'confirmed', at: new Date().toISOString() }] }));
  const props = { open: true, onClose() {}, call, selectedUnitId: selectedId }; host.render(props);
  const tree = host.render(props);
  const submit = nodes(tree).find(n => n.type === 'button' && n.props.onClick?.constructor.name === 'AsyncFunction');
  assert.equal(submit.props.disabled, false);
  await submit.props.onClick();
  const reservedIds = Object.keys(JSON.parse(storage.getItem('dispatch_unit_reservations')));
  assert.ok(reservedIds.includes(selectedId)); assert.equal(reservedIds.length, 3);
  assert.deepEqual(assurance(call, fleet.filter((unit: any) => reservedIds.includes(unit.id))).uncovered_services, []);
  const receipt = JSON.parse(storage.getItem('dispatch_timeline'))[call.id][1].proposal;
  for (const id of reservedIds) assert.ok(receipt.items.some((item: string) => item.includes(id)));
}));

test('same unit can be dispatched again after close, stand down, and reopening a proposal', async () => browserFixture(async (storage) => {
  const host = timelineHost(); const fleet = host.load(path.join(process.cwd(), 'lib/units.ts')).TACTICAL_UNITS;
  const selected = fleet.find((unit: any) => unit.status === 'available' && unit.type === 'ems');
  const call = { id: 'same-unit', severity: 'critical', status: 'incoming', created_at: new Date().toISOString(), caller_location: { latitude: selected.lat, longitude: selected.lng, confidence: 1 } };
  const props = { open: true, onClose() {}, call, selectedUnitId: selected.id }; host.render(props);
  const submit = async () => { const button = nodes(host.render(props)).find(n => n.type === 'button' && n.props.onClick?.constructor.name === 'AsyncFunction'); assert.equal(button.props.disabled, false); await button.props.onClick(); };
  await submit(); await submit();
  host.render({ ...props, open: false, selectedUnitId: undefined });
  const reservations = host.load(path.join(process.cwd(), 'lib/dispatch-reservations.ts'));
  await reservations.releaseUnit(call.id, selected.id);
  host.render(props); await submit();
  assert.equal(JSON.parse(storage.getItem('dispatch_unit_reservations'))[selected.id], call.id);
  const records = JSON.parse(storage.getItem('dispatch_timeline'))[call.id];
  assert.equal(records.length, 2); assert.equal(records[1].action, 'amended');
}));
