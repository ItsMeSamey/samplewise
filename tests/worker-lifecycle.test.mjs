import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validate } from '../src/optimizer.mjs';

// Exercise the production run/error callbacks with controlled Worker events.
// DOM and result payloads are fixtures; this does not run a browser or optimizer.
const appPath = process.env.SAMPLEWISE_APP || fileURLToPath(new URL('../src/app.mjs', import.meta.url));
const source = await readFile(appPath, 'utf8');
const retained = JSON.parse(await readFile(new URL('../benchmarks/results.json', import.meta.url), 'utf8')).examples.water;
const copy = value => JSON.parse(JSON.stringify(value));
const between = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Production boundary: ${start}`);
  return source.slice(a, b);
};
function setup({ hasPlan = true, constructorFails = false } = {}) {
  const nodes = new Map(), workers = [], rendered = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', value: '', hidden: true, disabled: false });
    return nodes.get(id);
  };
  let failConstructor = constructorFails;
  class WorkerFixture {
    constructor() { if (failConstructor) throw new Error('Worker constructor rejected'); this.terminated = false; workers.push(this); }
    terminate() { this.terminated = true; }
    postMessage(message) { this.message = copy(message); }
  }
  const context = vm.createContext({
    document: { getElementById: node }, validate, readInput: () => copy(retained.scenario),
    updateInputSummary() {}, Worker: WorkerFixture, URL,
    whole: String, number: String,
    render(result) { rendered.push(copy(result)); node('stale-banner').hidden = true; node('sensitivity-stratum').value = String(result.sensitivity.index); },
  });
  const initialState = source.match(/^let lastResult =.*$/m)?.[0]; assert.ok(initialState);
  vm.runInContext([
    "const $ = id => document.getElementById(id);", initialState,
    between('function setError(', 'function updateInputSummary('),
    between('function run(', 'function render(').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(appPath).href)),
    `globalThis.api = {
      run, markDirty,
      seed(result) { lastResult = result; dirty = !result; setExportState(!result); $('dirty-note').textContent = result ? 'The results below match these inputs.' : 'Edit inputs, then run the allocation.'; $('stale-banner').textContent = 'Inputs changed. These results belong to the last completed run. Run again before exporting.'; $('stale-banner').hidden = true; },
      state() { return { lastResult, dirty, status: $('status').textContent, error: $('error').textContent, errorHidden: $('error').hidden, runDisabled: $('run').disabled, runText: $('run').textContent, reportDisabled: $('export-report').disabled, csvDisabled: $('export-csv').disabled, sensitivityDisabled: $('sensitivity-stratum').disabled, sensitivityValue: $('sensitivity-stratum').value, staleHidden: $('stale-banner').hidden, staleText: $('stale-banner').textContent, dirtyNote: $('dirty-note').textContent }; }
    };`,
  ].join('\n'), context, { filename: appPath });
  const api = context.api; api.seed(hasPlan ? copy(retained) : null);
  node('sensitivity-stratum').value = '0';
  const current = () => workers.at(-1);
  return {
    api, node, workers, rendered, current, state: () => copy(api.state()),
    allowConstruction() { failConstructor = false; },
    fail(kind) {
      if (kind === 'constructor') return;
      if (kind === 'async') { const event = { prevented: false, preventDefault() { this.prevented = true; } }; current().onerror(event); assert.equal(event.prevented, true); }
      if (kind === 'reported') current().onmessage({ data: { id: current().message.id, error: 'Calculation could not complete' } });
    },
    succeed() { const result = copy(retained); result.sensitivity.index = current().message.sensitivityIndex; current().onmessage({ data: { id: current().message.id, result } }); return result; },
  };
}

test('constructor failure ends loading with no previous result', () => {
  const h = setup({ hasPlan: false, constructorFails: true }); h.api.run(); const s = h.state();
  assert.equal(s.status, 'Calculation unavailable.'); assert.match(s.error, /could not start/);
  assert.equal(s.runDisabled, false); assert.doesNotMatch(s.runText, /Solving/);
  assert.equal(s.reportDisabled, true); assert.equal(s.csvDisabled, true);
  assert.equal(s.lastResult, null); assert.equal(s.staleHidden, true);
});

for (const kind of ['constructor', 'async', 'reported']) {
  test(`${kind} failure retains the requested sensitivity and labels the previous result`, () => {
    const h = setup({ constructorFails: kind === 'constructor' }), before = h.state().lastResult;
    h.node('sensitivity-stratum').value = '1'; h.api.run(); h.fail(kind); const s = h.state();
    assert.deepEqual(s.lastResult, before); assert.equal(h.rendered.length, 0);
    assert.equal(s.sensitivityValue, '1'); assert.equal(s.staleHidden, false);
    assert.match(s.staleText, /previous|last completed/); assert.doesNotMatch(s.staleText, /Inputs changed/);
    assert.match(s.dirtyNote, /previous/i); assert.doesNotMatch(s.dirtyNote, /results below match/);
    assert.equal(s.status, kind === 'reported' ? 'No new allocation was produced.' : 'Calculation unavailable.');
    assert.equal(s.runDisabled, false); assert.equal(s.reportDisabled, true); assert.equal(s.csvDisabled, true);
    if (kind !== 'constructor') assert.equal(h.current().terminated, true);
  });
}

test('a pending sensitivity rerun identifies displayed cards as previous results', () => {
  const h = setup(); h.node('sensitivity-stratum').value = '1'; h.api.run(); const s = h.state();
  assert.equal(s.runDisabled, true); assert.equal(s.reportDisabled, true);
  assert.equal(s.staleHidden, false); assert.match(s.staleText, /previous|last completed/);
  assert.doesNotMatch(s.staleText, /Inputs changed/); assert.match(s.dirtyNote, /previous/i);
  assert.equal(s.sensitivityValue, '1'); assert.equal(h.current().message.sensitivityIndex, 1);
});

for (const kind of ['constructor', 'async', 'reported']) {
  test(`a successful retry after ${kind} failure restores current results and exports`, () => {
    const h = setup({ constructorFails: kind === 'constructor' });
    h.node('sensitivity-stratum').value = '1'; h.api.run(); h.fail(kind);
    h.allowConstruction(); h.api.run(); assert.equal(h.current().message.sensitivityIndex, 1);
    const expected = h.succeed(), s = h.state();
    assert.deepEqual(s.lastResult, expected); assert.equal(h.rendered.length, 1);
    assert.equal(s.error, ''); assert.equal(s.errorHidden, true); assert.match(s.status, /^Allocation ready\./);
    assert.equal(s.staleHidden, true); assert.equal(s.dirtyNote, 'The results below match these inputs.');
    assert.equal(s.runDisabled, false); assert.equal(s.reportDisabled, false); assert.equal(s.csvDisabled, false); assert.equal(s.sensitivityDisabled, false);
  });
}

test('an older Worker error cannot replace a newer pending run', () => {
  const h = setup(); h.api.run(); const old = h.current(); h.api.run(); const before = h.state();
  old.onerror({ preventDefault() {} }); assert.deepEqual(h.state(), before);
  assert.equal(h.current().terminated, false);
});

test('an older Worker success cannot overwrite an intervening edit', () => {
  const h = setup(); h.api.run(); const old = h.current(); h.api.markDirty(); const before = h.state();
  old.onmessage({ data: { id: old.message.id, result: copy(retained) } });
  assert.deepEqual(h.state(), before); assert.equal(h.rendered.length, 0);
});

test('editing after a failed rerun replaces the failure label with input-change guidance', () => {
  const h = setup(); h.api.run(); h.fail('async'); h.api.markDirty(); const s = h.state();
  assert.equal(s.error, ''); assert.equal(s.status, ''); assert.match(s.staleText, /^Inputs changed\./);
  assert.equal(s.staleHidden, false); assert.equal(s.reportDisabled, true); assert.equal(s.csvDisabled, true);
});
