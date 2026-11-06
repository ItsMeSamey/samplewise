import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, analyze, validate, variance, improvement } from '../src/optimizer.mjs';
import { scenarios } from '../src/scenarios.mjs';
import { parseScenario, scenarioJSON, allocationCSV, reportJSON } from '../src/io.mjs';
const close = (a, b, message = '') => assert.ok(Math.abs(a - b) <= 1e-11 * Math.max(1, Math.abs(a), Math.abs(b)), `${message}: ${a} != ${b}`);
const clone = value => structuredClone(value);

// Independent Cartesian-product oracle: no reuse of DP states or variance helper.
function brute(input, budget = input.budget) {
  const N = input.strata.reduce((sum, s) => sum + s.population, 0);
  let best = Infinity, bestCost = Infinity, allocations = [];
  function visit(i, n, cost) {
    if (cost > budget) return;
    if (i === input.strata.length) {
      const value = input.strata.reduce((sum, s, j) => sum + s.population * (s.population - n[j]) * s.sd ** 2 / (N * N * n[j]), 0);
      if (value < best) { best = value; bestCost = cost; allocations = n.slice(); }
      else if (value === best && cost < bestCost) { bestCost = cost; allocations = n.slice(); }
      return;
    }
    const s = input.strata[i];
    for (let k = s.min; k <= s.max; k++) visit(i + 1, [...n, k], cost + k * s.cost);
  }
  visit(0, [], 0); return { variance: best, cost: bestCost, allocation: allocations };
}
const feasible = (input, plan, budget = input.budget) => {
  assert.equal(plan.allocation.length, input.strata.length);
  input.strata.forEach((s, i) => assert.ok(Number.isInteger(plan.allocation[i]) && plan.allocation[i] >= s.min && plan.allocation[i] <= s.max));
  const cost = input.strata.reduce((sum, s, i) => sum + s.cost * plan.allocation[i], 0);
  assert.equal(plan.cost, cost); assert.ok(cost <= budget); assert.equal(plan.unused, budget - cost);
  close(plan.variance, variance(input.strata, plan.allocation));
};

function rng(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

test('600 seeded unequal-cost bounded scenarios and every returned frontier point match brute force', () => {
  const random = rng(20261029), integer = (a, b) => a + Math.floor(random() * (b - a + 1));
  for (let trial = 0; trial < 600; trial++) {
    const strata = Array.from({ length: integer(1, 4) }, (_, i) => {
      const population = integer(2, 20), min = integer(1, Math.min(3, population));
      return { name: `S${i}`, population, sd: trial % 9 === 0 ? 0 : integer(0, 30) / 3, cost: integer(1, 9), min, max: integer(min, Math.min(min + 4, population)) };
    });
    const minimum = strata.reduce((sum, s) => sum + s.min * s.cost, 0);
    const input = { title: 'Seeded oracle', budget: minimum + integer(0, 35), strata };
    const result = solve(input);
    close(result.exact.variance, brute(input).variance, `trial ${trial}`);
    [result.exact, result.balanced, result.greedy].forEach(plan => feasible(input, plan));
    assert.ok(result.exact.variance <= result.balanced.variance + 1e-10);
    assert.ok(result.exact.variance <= result.greedy.variance + 1e-10);
    let previous = Infinity;
    for (const point of result.frontier) {
      feasible(input, point, point.budget); close(point.variance, brute(input, point.budget).variance);
      assert.ok(point.variance <= previous + 1e-10); previous = point.variance;
    }
  }
});

test('variance agrees with enumerating actual without-replacement samples', () => {
  const values = [[1, 4, 8], [3, 7]], allocation = [2, 1];
  const strata = values.map((a, i) => { const mean = a.reduce((s, v) => s + v, 0) / a.length; return { name: `S${i}`, population: a.length, sd: Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / (a.length - 1)) }; });
  const estimates = [];
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) for (const y of values[1]) estimates.push(3 / 5 * (values[0][i] + values[0][j]) / 2 + 2 / 5 * y);
  const trueMean = values.flat().reduce((sum, v) => sum + v, 0) / 5;
  close(estimates.reduce((sum, v) => sum + (v - trueMean) ** 2, 0) / estimates.length, variance(strata, allocation));
});

test('unequal-cost greedy trap is a real counterexample', () => {
  const result = solve(scenarios.integer);
  assert.deepEqual(result.exact.allocation, [2, 3]);
  assert.deepEqual(result.greedy.allocation, [3, 2]);
  assert.ok(improvement(result.greedy.variance, result.exact.variance) > 9);
  close(result.exact.variance, brute(scenarios.integer).variance);
});

test('mandatory minima, indivisible costs and saturated maxima retain feasibility', () => {
  const input = { budget: 24, strata: [{ name: 'A', population: 20, sd: 4, cost: 4, min: 2, max: 3 }, { name: 'B', population: 30, sd: 7, cost: 6, min: 2, max: 2 }] };
  const result = solve(input); assert.deepEqual(result.exact.allocation, [3, 2]); assert.equal(result.exact.cost, 24);
  const less = solve({ ...input, budget: 23 }); assert.deepEqual(less.exact.allocation, [2, 2]); assert.equal(less.exact.unused, 3);
  const more = solve({ ...input, budget: 50 }); assert.deepEqual(more.exact.allocation, [3, 2]); assert.equal(more.exact.unused, 26);
});

test('zero SD and full census have zero variance, undefined relative gain, and lowest-spend ties', () => {
  const zero = { budget: 40, strata: [{ name: 'Zero', population: 10, sd: 0, cost: 2, min: 1, max: 10 }] };
  const result = solve(zero); assert.deepEqual(result.exact.allocation, [1]); assert.equal(result.exact.variance, 0); assert.equal(improvement(0, 0), null);
  const census = solve({ budget: 40, strata: [{ ...zero.strata[0], sd: 100, min: 10 }] }); assert.equal(census.exact.se, 0);
  assert.equal(solve({ budget: 1, strata: [{ name: 'Singleton', population: 1, sd: 0, min: 1, max: 1, cost: 1 }] }).exact.se, 0);
});

test('tiny weights retain useful precision and extreme supported values remain finite', () => {
  const input = { budget: 15, strata: [{ name: 'Small', population: 2, sd: 1000000, cost: 1, min: 1, max: 2 }, { name: 'Large', population: 10000000, sd: 0.00001, cost: 1, min: 1, max: 10 }] };
  const result = solve(input); close(result.exact.variance, brute(input).variance); assert.ok(Number.isFinite(result.exact.variance)); assert.deepEqual(result.exact.allocation, [2, 10]);
});

test('sensitivity re-optimizes only the selected SD and reports retained-plan loss', () => {
  const input = clone(scenarios.integer), before = JSON.stringify(input), result = analyze(input, 1);
  assert.equal(JSON.stringify(input), before);
  for (const scenario of result.sensitivity.cases) {
    const changed = clone(input); changed.strata[1].sd *= scenario.multiplier;
    close(scenario.optimal.variance, brute(changed).variance);
    close(scenario.retained.variance, variance(changed.strata, result.exact.allocation));
    assert.ok(scenario.regret >= -1e-10);
  }
  const upper = clone(input); upper.strata[1].sd = 1000000;
  assert.match(analyze(upper, 1).sensitivity.cases[1].unavailable, /limit/);
});

test('invalid inputs fail explicitly instead of silently coercing or approximating', () => {
  const bad = [null, [], {}, { ...scenarios.integer, budget: '21' }, { ...scenarios.integer, budget: 1 }, { ...scenarios.integer, budget: 10001 }, { ...scenarios.integer, budget: 20.5 }, { ...scenarios.integer, strata: [] }];
  for (const [field, values] of Object.entries({ population: [0, 1.5, 10000001, Infinity], sd: [-1, NaN, Infinity, 1000001, '14'], cost: [0, 2.2, -1], min: [0, 101], max: [0, 101] })) {
    for (const value of values) { const input = clone(scenarios.integer); input.strata[0][field] = value; bad.push(input); }
  }
  const duplicate = clone(scenarios.integer); duplicate.strata[1].name = duplicate.strata[0].name; bad.push(duplicate);
  const singleton = clone(scenarios.integer); singleton.strata[0] = { ...singleton.strata[0], population: 1, min: 1, max: 1 }; bad.push(singleton);
  for (const input of bad) assert.throws(() => validate(input));
  assert.throws(() => solve({ budget: 10000, strata: [{ name: 'Too many choices', population: 100000, sd: 10, min: 1, max: 100000, cost: 1 }] }), /solver limit/);
  assert.throws(() => analyze(scenarios.integer, -1), /Sensitivity/);
});

test('JSON scenario roundtrip, report provenance, size rejection, and CSV formula escaping', () => {
  const input = clone(scenarios.water), parsed = parseScenario(scenarioJSON(input));
  assert.deepEqual(parsed, input); assert.deepEqual(solve(parsed).exact, solve(input).exact);
  assert.throws(() => parseScenario('{broken'), /valid JSON/); assert.throws(() => parseScenario(' '.repeat(100001)), /100 KB/);
  const hostile = clone(scenarios.integer); hostile.strata[0].name = '=HYPERLINK("test")';
  const result = analyze(hostile), csv = allocationCSV(result);
  assert.ok(csv.includes('"\'=HYPERLINK(""test"")"')); assert.ok(csv.includes('exact_n'));
  const report = JSON.parse(reportJSON(result)); assert.equal(report.application, 'Samplewise 1.0.0'); assert.ok(report.assumptions.some(a => a.includes('confidence'))); assert.deepEqual(report.exact, result.exact);
});
