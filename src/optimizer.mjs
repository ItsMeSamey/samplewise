export const LIMITS = Object.freeze({ strata: 12, budget: 10000, population: 10000000, sd: 1000000, operations: 20000000 });
export class InputError extends Error { constructor(message) { super(message); this.name = 'InputError'; } }
const fail = message => { throw new InputError(message); };
const integer = (value, min, max, label) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail(`${label} must be a whole number from ${min} to ${max}.`);
  return value;
};

export function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Import a scenario object.');
  const budget = integer(input.budget, 1, LIMITS.budget, 'Budget');
  if (!Array.isArray(input.strata) || input.strata.length < 1 || input.strata.length > LIMITS.strata) fail(`Use 1 to ${LIMITS.strata} strata.`);
  const names = new Set();
  const strata = input.strata.map((s, i) => {
    if (!s || typeof s !== 'object') fail(`Stratum ${i + 1} is missing.`);
    const name = typeof s.name === 'string' ? s.name.trim() : '';
    if (!name || name.length > 60) fail(`Stratum ${i + 1} needs a name of 1 to 60 characters.`);
    if (names.has(name)) fail(`Stratum names must be unique: ${name}.`);
    names.add(name);
    const population = integer(s.population, 1, LIMITS.population, `${name}: population`);
    const cost = integer(s.cost, 1, LIMITS.budget, `${name}: cost`);
    const min = integer(s.min, 1, population, `${name}: minimum sample`);
    const max = integer(s.max, min, population, `${name}: maximum sample`);
    if (typeof s.sd !== 'number' || !Number.isFinite(s.sd) || s.sd < 0 || s.sd > LIMITS.sd) fail(`${name}: SD must be a finite number from 0 to ${LIMITS.sd}.`);
    if (population === 1 && s.sd !== 0) fail(`${name}: a one-member population must have SD 0.`);
    return { name, population, sd: s.sd, cost, min, max };
  });
  const minimumCost = strata.reduce((sum, s) => sum + s.min * s.cost, 0);
  if (minimumCost > budget) fail(`Minimum samples cost ${minimumCost} credits; budget is ${budget}. Raise the budget or lower a minimum.`);
  const slack = budget - minimumCost;
  const choices = strata.reduce((sum, s) => sum + Math.min(s.max - s.min, Math.floor(slack / s.cost)) + 1, 0);
  const operations = (slack + 1) * choices;
  if (operations > LIMITS.operations) fail(`This scenario exceeds the ${LIMITS.operations.toLocaleString('en-US')}-step solver limit. Lower the budget or tighten sample maximums.`);
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 100) : 'Untitled scenario';
  return { title: title || 'Untitled scenario', synthetic: input.synthetic === true, budget, strata, minimumCost, operations };
}

export function variance(strata, allocation) {
  const total = strata.reduce((sum, s) => sum + s.population, 0);
  return strata.reduce((sum, s, i) => sum + (s.population / total) ** 2 * s.sd ** 2 * Math.max(0, 1 / allocation[i] - 1 / s.population), 0);
}

function summarize(strata, allocation, budget) {
  const totalPopulation = strata.reduce((sum, s) => sum + s.population, 0);
  const contributions = strata.map((s, i) => (s.population / totalPopulation) ** 2 * s.sd ** 2 * Math.max(0, 1 / allocation[i] - 1 / s.population));
  const v = contributions.reduce((a, b) => a + b, 0);
  const cost = strata.reduce((sum, s, i) => sum + s.cost * allocation[i], 0);
  return { allocation, cost, unused: budget - cost, samples: allocation.reduce((a, b) => a + b, 0), variance: v, se: Math.sqrt(v), contributions };
}

function baseline(strata, budget, strategy) {
  const n = strata.map(s => s.min);
  let spent = strata.reduce((sum, s) => sum + s.cost * s.min, 0);
  const totalPopulation = strata.reduce((sum, s) => sum + s.population, 0);
  while (true) {
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < strata.length; i++) {
      const s = strata[i];
      if (n[i] >= s.max || spent + s.cost > budget) continue;
      const score = strategy === 'balanced' ? -n[i] : (s.population / totalPopulation) ** 2 * s.sd ** 2 / (n[i] * (n[i] + 1) * s.cost);
      // Stable input-order ties make exported plans reproducible.
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0 || (strategy === 'greedy' && bestScore <= 0)) break;
    n[best]++; spent += strata[best].cost;
  }
  return summarize(strata, n, budget);
}

export function solve(input) {
  const scenario = validate(input);
  const { strata, budget, minimumCost } = scenario;
  const slack = budget - minimumCost;
  const size = slack + 1;
  const totalPopulation = strata.reduce((sum, s) => sum + s.population, 0);
  let previous = new Float64Array(size).fill(Infinity);
  previous[0] = 0;
  const history = [];
  // Multiple-choice knapsack: each stratum contributes exactly one integer n.
  // State cost is extra spend above all mandatory minima. The FPC is constant
  // in n; retaining it here makes full-census variance exactly zero.
  for (const s of strata) {
    const next = new Float64Array(size).fill(Infinity);
    const choice = new Int32Array(size).fill(-1);
    const maxExtra = Math.min(s.max - s.min, Math.floor(slack / s.cost));
    const weight = (s.population / totalPopulation) ** 2 * s.sd ** 2;
    for (let extra = 0; extra <= maxExtra; extra++) {
      const cost = extra * s.cost;
      const term = weight * Math.max(0, 1 / (s.min + extra) - 1 / s.population);
      for (let used = 0; used <= slack - cost; used++) {
        if (!Number.isFinite(previous[used])) continue;
        const value = previous[used] + term;
        if (value < next[used + cost]) { next[used + cost] = value; choice[used + cost] = extra; }
      }
    }
    previous = next; history.push(choice);
  }
  const bestAt = new Int32Array(size);
  let best = 0;
  for (let b = 0; b <= slack; b++) {
    if (previous[b] < previous[best]) best = b;
    bestAt[b] = best;
  }
  const reconstruct = cost => {
    const n = new Array(strata.length);
    for (let i = strata.length - 1; i >= 0; i--) {
      const extra = history[i][cost];
      if (extra < 0) throw new Error('Internal reconstruction failure.');
      n[i] = strata[i].min + extra;
      cost -= extra * strata[i].cost;
    }
    return n;
  };
  const exact = summarize(strata, reconstruct(bestAt[slack]), budget);
  const balanced = baseline(strata, budget, 'balanced');
  const greedy = baseline(strata, budget, 'greedy');
  const frontier = [];
  // Every integer budget has a best feasible state; the chart samples at most 31.
  const steps = Math.min(30, slack);
  for (let i = 0; i <= steps; i++) {
    const extraBudget = steps === 0 ? 0 : Math.round(i * slack / steps);
    const plan = summarize(strata, reconstruct(bestAt[extraBudget]), minimumCost + extraBudget);
    frontier.push({ budget: minimumCost + extraBudget, ...plan });
  }
  return { scenario, exact, balanced, greedy, frontier, certificate: { method: 'Exact multiple-choice dynamic programming', optimalWithin: 'The stated integer costs, bounds, budget, independent strata and supplied SD estimates; Float64 arithmetic.', statesPerLayer: size, operationUpperBound: scenario.operations, tieRule: 'Lowest spend for equal objective; stable input-order recurrence for other ties.' } };
}

export function analyze(input, sensitivityIndex = 0) {
  const result = solve(input);
  const index = integer(sensitivityIndex, 0, result.scenario.strata.length - 1, 'Sensitivity stratum');
  result.sensitivity = { index, name: result.scenario.strata[index].name, cases: [] };
  for (const multiplier of [0.75, 1.25]) {
    const changed = { ...result.scenario, strata: result.scenario.strata.map((s, i) => ({ ...s, sd: i === index ? s.sd * multiplier : s.sd })) };
    if (changed.strata[index].sd > LIMITS.sd) {
      result.sensitivity.cases.push({ multiplier, unavailable: 'Adjusted SD exceeds the supported limit.' });
      continue;
    }
    const optimal = solve(changed).exact;
    const retained = summarize(changed.strata, result.exact.allocation.slice(), changed.budget);
    result.sensitivity.cases.push({ multiplier, sd: changed.strata[index].sd, optimal, retained, regret: retained.variance - optimal.variance });
  }
  return result;
}

export function improvement(reference, value) {
  return reference > 0 ? 100 * (reference - value) / reference : null;
}
