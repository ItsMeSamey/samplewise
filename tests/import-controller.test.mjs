import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseScenario } from '../src/io.mjs';
import { validate } from '../src/optimizer.mjs';
import { scenarios } from '../src/scenarios.mjs';

// Run the production import listener and its production intent-changing functions
// with deferred file reads. The small DOM/Worker fixtures do not claim browser QA.
const appPath = process.env.SAMPLEWISE_APP || fileURLToPath(new URL('../src/app.mjs', import.meta.url));
const source = await readFile(appPath, 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const between = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Production source boundary: ${start}`);
  return source.slice(a, b);
};
const listenerStart = "$('import-file').addEventListener('change', async event => {";
const listenerOffset = source.indexOf(listenerStart);
assert.ok(listenerOffset >= 0);
const listenerEnd = source.indexOf('\n});', listenerOffset) + '\n});'.length;
assert.ok(listenerEnd > listenerOffset);
const listener = source.slice(listenerOffset, listenerEnd);

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function setup() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', checked: false, hidden: false, disabled: false, textContent: '', selectedIndex: 0, children: [], listeners: {}, addEventListener(name, handler) { this.listeners[name] = handler; }, replaceChildren() { this.children = []; } });
    return nodes.get(id);
  };
  const readInput = () => ({ title: node('study-title').value, synthetic: node('synthetic').checked, budget: Number(node('budget').value), strata: copy(node('strata-rows').children) });
  class WorkerFixture { terminate() {} postMessage(message) { this.message = message; } }
  const context = vm.createContext({
    document: { getElementById: node }, parseScenario, validate, URL, Worker: WorkerFixture,
    readInput, appendRow: row => node('strata-rows').children.push(copy(row)),
    updateInputSummary() {}, render() {}, number: String, whole: String,
  });
  const initialState = source.match(/^let lastResult =.*$/m)?.[0];
  assert.ok(initialState);
  const runSource = between('function run(', 'function render(').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(appPath).href));
  vm.runInContext([
    "const $ = id => document.getElementById(id);", initialState,
    between('function setError(', 'function updateInputSummary('),
    between('function loadScenario(', 'function run('), runSource, listener,
    `globalThis.api = {
      loadScenario, markDirty, run,
      select(file) { const input = $('import-file'); input.files = file ? [file] : []; input.value = file ? 'selected-file.json' : ''; return input.listeners.change({ target: input }); },
      seedPlan() { lastResult = { saved: 'previous completed plan' }; dirty = false; setExportState(false); setError(''); },
      state() { return { input: readInput(), fileValue: $('import-file').value, error: $('error').textContent, errorHidden: $('error').hidden, dirty, lastResult, reportDisabled: $('export-report').disabled }; }
    };`,
  ].join('\n'), context, { filename: appPath });
  const api = context.api;
  api.loadScenario(copy(scenarios.water)); api.seedPlan();
  return { api, node, state: () => copy(api.state()) };
}
const file = (text, size = Buffer.byteLength(text)) => ({ size, text: () => Promise.resolve(text) });
const slowFile = pending => ({ size: 1000, text: () => pending.promise });
const encoded = scenario => JSON.stringify(scenario);

test('production import handler accepts an exported scenario and resets selection', async () => {
  const h = setup();
  const exported = await readFile(new URL('../examples/integer.json', import.meta.url), 'utf8');
  await h.api.select(file(exported));
  assert.deepEqual(h.state().input, scenarios.integer);
  assert.equal(h.state().fileValue, ''); assert.equal(h.state().error, '');
});

test('malformed latest input preserves prior plan and a following valid import recovers', async () => {
  const h = setup(), before = h.state();
  await h.api.select(file('{broken'));
  assert.deepEqual(h.state().input, before.input);
  assert.deepEqual(h.state().lastResult, before.lastResult);
  assert.equal(h.state().reportDisabled, false);
  assert.match(h.state().error, /not valid JSON/);
  await h.api.select(file(encoded(scenarios.integer)));
  assert.deepEqual(h.state().input, scenarios.integer); assert.equal(h.state().error, '');
});

test('a current file read failure preserves the prior plan and permits recovery', async () => {
  const h = setup(), before = h.state(), a = deferred();
  const pending = h.api.select(slowFile(a)); a.reject(new Error('File could not be read')); await pending;
  assert.deepEqual(h.state().input, before.input); assert.deepEqual(h.state().lastResult, before.lastResult);
  assert.equal(h.state().error, 'File could not be read'); assert.equal(h.state().fileValue, '');
  await h.api.select(file(encoded(scenarios.integer))); assert.equal(h.state().error, '');
});

test('latest import wins when an older valid read finishes last', async () => {
  const h = setup(), a = deferred(), b = deferred();
  const pa = h.api.select(slowFile(a)), pb = h.api.select(slowFile(b));
  b.resolve(encoded(scenarios.integer)); await pb;
  a.resolve(encoded(scenarios.campus)); await pa;
  assert.deepEqual(h.state().input, scenarios.integer);
});

test('a newer malformed import cancels older pending success while preserving the plan', async () => {
  const h = setup(), before = h.state(), a = deferred();
  const pa = h.api.select(slowFile(a)); await h.api.select(file('{broken'));
  a.resolve(encoded(scenarios.integer)); await pa;
  assert.deepEqual(h.state().input, before.input); assert.deepEqual(h.state().lastResult, before.lastResult);
  assert.match(h.state().error, /not valid JSON/);
});

for (const staleOutcome of ['read rejection', 'malformed text']) {
  test(`stale ${staleOutcome} does not replace the newer successful import`, async () => {
    const h = setup(), a = deferred(); const pa = h.api.select(slowFile(a));
    await h.api.select(file(encoded(scenarios.integer)));
    if (staleOutcome === 'read rejection') a.reject(new Error('Old read failed'));
    else a.resolve('{broken');
    await pa;
    assert.deepEqual(h.state().input, scenarios.integer); assert.equal(h.state().error, '');
  });
}

for (const intent of ['field edit', 'example selection', 'add stratum', 'delete stratum', 'Run', 'invalid Run']) {
  test(`production intent change cancels pending import: ${intent}`, async () => {
    const h = setup(), a = deferred(); const pa = h.api.select(slowFile(a));
    if (intent === 'field edit') { h.node('budget').value = 721; h.api.markDirty(); }
    if (intent === 'example selection') h.api.loadScenario(copy(scenarios.integer));
    if (intent === 'add stratum') { h.node('strata-rows').children.push({ name: 'Extra', population: 100, sd: 10, cost: 1, min: 1, max: 20 }); h.api.markDirty(); }
    if (intent === 'delete stratum') { h.node('strata-rows').children.pop(); h.api.markDirty(); }
    if (intent === 'Run') h.api.run();
    if (intent === 'invalid Run') { h.node('budget').value = 0; h.api.run(); }
    const expected = h.state(); a.resolve(encoded(scenarios.campus)); await pa;
    assert.deepEqual(h.state().input, expected.input);
    assert.equal(h.state().error, expected.error);
  });
}

test('input resets before reading, permitting same-file reselection without stale clearing', async () => {
  const h = setup(), a = deferred(), b = deferred(); let reads = 0;
  const sameFile = { size: 1000, text: () => (++reads === 1 ? a.promise : b.promise) };
  const pa = h.api.select(sameFile); assert.equal(h.state().fileValue, '');
  const pb = h.api.select(sameFile); assert.equal(h.state().fileValue, '');
  b.resolve(encoded(scenarios.integer)); await pb;
  h.node('import-file').value = 'a later native selection not dispatched yet';
  a.resolve(encoded(scenarios.campus)); await pa;
  assert.deepEqual(h.state().input, scenarios.integer);
  assert.equal(h.state().fileValue, 'a later native selection not dispatched yet');
});

test('a no-file chooser cancellation leaves the existing import intent alone', async () => {
  const h = setup(), a = deferred(); const pa = h.api.select(slowFile(a));
  await h.api.select(null); a.resolve(encoded(scenarios.integer)); await pa;
  assert.deepEqual(h.state().input, scenarios.integer);
});

test('oversized latest file rejects before read, cancels pending import and preserves state', async () => {
  const h = setup(), before = h.state(), a = deferred(); const pa = h.api.select(slowFile(a));
  let read = false;
  await h.api.select({ size: 100001, text: () => { read = true; return Promise.resolve('{}'); } });
  assert.equal(read, false); a.resolve(encoded(scenarios.integer)); await pa;
  assert.deepEqual(h.state().input, before.input); assert.deepEqual(h.state().lastResult, before.lastResult);
  assert.match(h.state().error, /smaller than 100 KB/);
});

test('a valid file at the exact 100000-byte limit is accepted', async () => {
  const h = setup(); await h.api.select(file(encoded(scenarios.integer).padEnd(100000, ' ')));
  assert.deepEqual(h.state().input, scenarios.integer); assert.equal(h.state().error, '');
});
