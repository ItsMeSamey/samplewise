import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { solve, analyze, improvement } from '../src/optimizer.mjs';
import { scenarios } from '../src/scenarios.mjs';
import { scenarioJSON } from '../src/io.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let state = 20261029;
const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
const integer = (a, b) => a + Math.floor(random() * (b - a + 1));
const cases = [];
for (let i = 0; i < 48; i++) {
  const strata = Array.from({ length: integer(3, 6) }, (_, j) => ({ name: `Stratum ${j + 1}`, population: integer(100, 2500), sd: integer(5, 70), cost: integer(2, 20), min: integer(3, 12), max: integer(50, 180) }));
  strata.forEach(s => { s.max = Math.min(s.max, s.population); });
  const minCost = strata.reduce((sum, s) => sum + s.min * s.cost, 0);
  cases.push({ title: `Seeded field-planning scenario ${i + 1}`, synthetic: true, strata, budget: minCost + integer(250, 1200) });
}
solve(scenarios.water); // One warm-up excluded from reported timings.
const results = cases.map((scenario, index) => {
  const start = performance.now(), result = solve(scenario), durationMs = performance.now() - start;
  assert.ok(result.exact.variance <= result.balanced.variance + 1e-9);
  assert.ok(result.exact.variance <= result.greedy.variance + 1e-9);
  return { index: index + 1, scenario, exact: result.exact, balanced: result.balanced, greedy: result.greedy, balancedVarianceReductionPct: improvement(result.balanced.variance, result.exact.variance), greedyVarianceReductionPct: improvement(result.greedy.variance, result.exact.variance), durationMs, operationUpperBound: result.certificate.operationUpperBound };
});
const stats = values => { const sorted = values.slice().sort((a, b) => a - b); return { min: sorted[0], median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2, mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1) }; };
const examples = Object.fromEntries(Object.entries(scenarios).map(([key, input]) => { const start = performance.now(), result = analyze(input, 0); return [key, { ...result, analyzeDurationMs: performance.now() - start }]; }));
const stressInput = { title: 'Near-limit integer solver stress case', synthetic: true, budget: 1800, strata: Array.from({ length: 12 }, (_, i) => ({ name: `Stress ${i + 1}`, population: 1000 + 100 * i, sd: 8 + 4 * i, cost: 1, min: 1, max: 800 })) };
const stressStart = performance.now(), stressResult = analyze(stressInput, 0), stressMs = performance.now() - stressStart;
assert.ok(stressResult.certificate.operationUpperBound <= 20000000);
const report = {
  generatedAt: new Date().toISOString(), application: 'Samplewise 1.0.0', seed: 20261029, caseCount: results.length,
  scope: 'All data is synthetic. Outcomes are model variance, not observed field error or guaranteed real-world savings. Timings measure Node on this machine, not browser performance. The exact solver is compared with balanced counts and a feasible cost-aware marginal-gain greedy baseline.',
  generator: { strata: 'uniform integer 3..6', population: 'uniform integer 100..2500', sd: 'uniform integer 5..70', cost: 'uniform integer 2..20', minimum: 'uniform integer 3..12', maximum: 'uniform integer 50..180, clipped at population', budget: 'mandatory minima plus uniform integer 250..1200 credits', prng: '32-bit LCG; state=(1664525*state+1013904223) mod 2^32' },
  runtime: { node: process.version, platform: process.platform, arch: process.arch, peakRssMiB: process.resourceUsage().maxRSS / 1024 },
  summary: { balancedVarianceReductionPct: stats(results.map(r => r.balancedVarianceReductionPct)), greedyVarianceReductionPct: stats(results.map(r => r.greedyVarianceReductionPct)), exactStrictlyImprovesGreedy: results.filter(r => r.greedyVarianceReductionPct > 1e-8).length, solverDurationMs: stats(results.map(r => r.durationMs)) },
  stress: { scenario: stressInput, operationUpperBound: stressResult.certificate.operationUpperBound, analyzeDurationMs: stressMs, exact: stressResult.exact }, examples, cases: results
};
await mkdir(resolve(root, 'benchmarks'), { recursive: true });
await mkdir(resolve(root, 'examples'), { recursive: true });
await writeFile(resolve(root, 'benchmarks/results.json'), JSON.stringify(report, null, 2) + '\n');
for (const [key, scenario] of Object.entries(scenarios)) await writeFile(resolve(root, `examples/${key}.json`), scenarioJSON(scenario));
console.log(JSON.stringify({ caseCount: report.caseCount, summary: report.summary, runtime: report.runtime, stress: { operationUpperBound: report.stress.operationUpperBound, analyzeDurationMs: stressMs }, examples: Object.fromEntries(Object.entries(examples).map(([key, value]) => [key, { allocation: value.exact.allocation, exactVariance: value.exact.variance, balancedReductionPct: improvement(value.balanced.variance, value.exact.variance), greedyReductionPct: improvement(value.greedy.variance, value.exact.variance) }])) }, null, 2));
