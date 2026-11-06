import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { analyze, solve, validate, InputError } from '../src/optimizer.mjs';
import { allocationCSV, parseScenario, reportJSON, scenarioJSON } from '../src/io.mjs';

const SEED = 739182;
const BASE = { title: 'Independent critic fixture', budget: 10, synthetic: true, strata: [{ name: 'A', population: 10, sd: 2, cost: 1, min: 1, max: 10 }] };

// Independent oracle: Cartesian enumeration, with (N-n)/(n*N) instead of
// the production recurrence's reciprocal FPC expression. No DP is reused.
function enumerate(strata, budget) {
  const population = strata.reduce((sum, stratum) => sum + stratum.population, 0);
  const plans = [];
  function visit(allocation, index, cost, variance) {
    if (index === strata.length) { plans.push({ allocation, cost, variance }); return; }
    const s = strata[index];
    for (let n = s.min; n <= s.max; n++) {
      const nextCost = cost + n * s.cost;
      if (nextCost > budget) break;
      const term = (s.population / population) ** 2 * s.sd ** 2 * (s.population - n) / (n * s.population);
      visit([...allocation, n], index + 1, nextCost, variance + term);
    }
  }
  visit([], 0, 0, 0);
  return plans;
}

function close(actual, expected, context) {
  assert.ok(Math.abs(actual - expected) <= 1e-11 * Math.max(expected, 1e-16), `${context}: ${actual} versus ${expected}`);
}

function feasible(plan, strata, budget) {
  assert.equal(plan.allocation.length, strata.length);
  assert.ok(plan.cost <= budget);
  assert.equal(plan.cost, strata.reduce((sum, s, i) => sum + s.cost * plan.allocation[i], 0));
  plan.allocation.forEach((n, i) => {
    assert.ok(Number.isInteger(n) && n >= strata[i].min && n <= strata[i].max);
  });
}

test('critic: exact allocations and sampled frontier match 1,200 exhaustive cases', t => {
  const started = performance.now();
  let state = SEED;
  const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296);
  let checkedPlans = 0;
  for (let trial = 0; trial < 1200; trial++) {
    const count = 1 + Math.floor(random() * 4);
    const strata = Array.from({ length: count }, (_, i) => {
      const population = 2 + Math.floor(random() * 7);
      const min = 1 + Math.floor(random() * Math.min(3, population));
      return { name: `s${i}`, population, min, max: min + Math.floor(random() * (population - min + 1)), cost: 1 + Math.floor(random() * 7), sd: random() < 0.15 ? 0 : 10 ** (-4 + random() * 8) };
    });
    const minimumCost = strata.reduce((sum, s) => sum + s.min * s.cost, 0);
    const budget = minimumCost + Math.floor(random() * 31);
    const result = solve({ budget, strata });
    const allPlans = enumerate(strata, budget);
    for (const plan of [result.exact, ...result.frontier]) {
      const cap = plan.budget ?? budget;
      const best = Math.min(...allPlans.filter(candidate => candidate.cost <= cap).map(candidate => candidate.variance));
      close(plan.variance, best, `seed=${SEED}, trial=${trial}, budget=${cap}`);
      feasible(plan, strata, cap);
      checkedPlans++;
    }
    for (const baseline of [result.balanced, result.greedy]) {
      feasible(baseline, strata, budget);
      assert.ok(result.exact.variance <= baseline.variance + 1e-11 * Math.max(baseline.variance, 1e-16));
    }
    for (let i = 1; i < result.frontier.length; i++) {
      assert.ok(result.frontier[i].budget > result.frontier[i - 1].budget);
      assert.ok(result.frontier[i].variance <= result.frontier[i - 1].variance + 1e-11 * Math.max(result.frontier[i - 1].variance, 1e-16));
    }
  }
  assert.equal(checkedPlans, 21108);
  t.diagnostic(JSON.stringify({ seed: SEED, scenarios: 1200, checkedPlans, elapsedMs: Math.round(performance.now() - started) }));
});

test('critic: census, zero SD, fixed minima, unavailable sensitivity and malformed input', () => {
  const census = analyze(BASE);
  assert.equal(census.exact.variance, 0);
  assert.deepEqual(census.exact.allocation, [10]);
  const zero = analyze({ ...BASE, strata: [{ ...BASE.strata[0], sd: 0 }] });
  assert.equal(zero.exact.cost, 1);
  assert.equal(zero.exact.variance, 0);
  const fixed = solve({ ...BASE, budget: 3, strata: [{ ...BASE.strata[0], min: 3, max: 3 }] });
  assert.equal(fixed.frontier.length, 1);
  assert.deepEqual(fixed.exact.allocation, [3]);
  const hugeSD = analyze({ ...BASE, strata: [{ ...BASE.strata[0], sd: 1000000 }] });
  assert.match(hugeSD.sensitivity.cases[1].unavailable, /limit/);
  for (const budget of [NaN, Infinity, -Infinity, 1.5, -1, 0, '10', 10001]) assert.throws(() => validate({ ...BASE, budget }), InputError);
  for (const sd of [NaN, Infinity, -Infinity, -1, '2', 1000001]) assert.throws(() => validate({ ...BASE, strata: [{ ...BASE.strata[0], sd }] }), InputError);
  for (const change of [{ population: 1, sd: 1, max: 1 }, { min: 0 }, { max: 11 }, { cost: 0 }]) assert.throws(() => validate({ ...BASE, strata: [{ ...BASE.strata[0], ...change }] }), InputError);
  assert.throws(() => validate({ ...BASE, budget: 10000, strata: [{ ...BASE.strata[0], population: 10000, max: 10000 }] }), /solver limit/);
});

test('critic: scenario/report round trip and CSV labels preserve provenance and quoting', () => {
  const fixture = { ...BASE, strata: [{ ...BASE.strata[0], name: '=HYPERLINK("x"), quoted' }] };
  const scenario = parseScenario(scenarioJSON(fixture));
  assert.deepEqual(scenario, fixture);
  const result = analyze(scenario);
  const report = JSON.parse(reportJSON(result));
  assert.deepEqual(report.exact, result.exact);
  assert.equal(report.scenario.synthetic, true);
  assert.ok(report.assumptions.some(text => text.includes('not field evidence')));
  const csv = allocationCSV(result);
  assert.ok(csv.includes('"\'=HYPERLINK(""x""), quoted"'));
  assert.throws(() => parseScenario('{bad'), /valid JSON/);
  assert.throws(() => parseScenario(' '.repeat(100001)), /100 KB/);
});
