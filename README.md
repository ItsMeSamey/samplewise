# Samplewise

**Exact sample plans for uneven populations and fixed budgets.**

Samplewise is a local stratified-sampling planner. Enter each stratum's population, planning standard deviation, sample cost and minimum/maximum sample counts. It finds an integer allocation with the lowest modeled variance within your budget, compares two feasible alternatives, and makes its assumptions inspectable.

Version v0.1.2 fixes a loading status that remained active when a Worker could not start. Pending or failed reruns now identify displayed results as belonging to the previous completed run, keep result exports disabled and retain the requested sensitivity for retry. Eleven focused controller cases pass, and an actual browser check confirmed recovery after one deliberately failed Worker response. See [verification and reproduction](docs/VERIFICATION.md).

The project was created for Next Byte Hacks V5 during October 2026. OpenAI coding agents assisted with concept development, implementation, UI, tests, benchmarks and documentation. A separately tasked AI critic reviewed the code and authored an exhaustive oracle. See [provenance and attribution](docs/PROVENANCE.md).

## Run locally

Unzip the archive, then open a terminal in the extracted `samplewise` directory. Node.js 20 or newer is sufficient. There are no npm packages to install, API keys, paid services or build step.

```sh
npm start
```

Open **http://127.0.0.1:4175** in a modern browser. Do not open `index.html` directly: module workers require HTTP. The server binds to localhost. Use `PORT=4180 npm start` if the default port is occupied. Stop it with Ctrl+C.

The included checks and synthetic benchmark can be run from the same directory:

```sh
npm test
npm run benchmark
```

The benchmark command regenerates `benchmarks/results.json` and the example JSON files; timestamps and timings will change. The app can also be served by a static HTTP host that serves `.mjs` as JavaScript. It has no backend computation, telemetry, remote data storage or browser persistence. Save a scenario before reloading to retain edits.

## Plan and inspect an allocation

1. Start with CreekWatch, CampusPulse, or the small integer-cost counterexample. All supplied examples are synthetic.
2. Set a budget in positive whole credits. Enter disjoint strata and sample bounds; each maximum must be at most its population.
3. Run the allocation. Inspect sample counts, cost, unused credits, variance contributions and estimated standard error.
4. Compare cost-aware greedy and balanced counts. Explore the budget frontier and change one planning SD by +/-25% to see whether the allocation changes.
5. Save scenario JSON, a full report or allocation CSV. Import a saved scenario or a file from `examples/` to continue later.

Edits mark results stale and disable result exports until a new solve completes. Calculations run in a Web Worker and are canceled when inputs change. Invalid or excessive inputs are rejected rather than silently approximated.

## Evidence and limits

The retained 48-case synthetic benchmark reports a median modeled variance reduction of **0.0478% versus cost-aware greedy**, with 31 improvements and 17 ties. Against the simpler balanced-count baseline, the median reduction is 24.6863%. A deliberately selected small-budget counterexample shows a 9.2481% reduction over greedy. These model calculations use synthetic inputs; their gains do not establish field performance. See [benchmark scope and results](docs/BENCHMARK.md).

The test source includes two independently authored exhaustive-oracle suites totaling 1,800 seeded small scenarios. The separately tasked AI critic's suite checks 21,108 exact/frontier plans. Other checks cover actual-sample enumeration of the variance formula, input limits, census, zero SD, sensitivity and exports.

Checks in Brave confirmed Worker failure guidance and keyboard retry using a controlled sequence of HTTP 200, 503 and 200 responses. The retry produced the requested sensitivity analysis and restored exports. Earlier checks covered startup, examples, edits and exports. The [verification record](docs/VERIFICATION.md) separates browser observations, controller fixtures, retained numerical evidence and remaining coverage.

The objective is `sum_h (N_h / total_N)^2 * SD_h^2 * (1/n_h - 1/N_h)`. The SD convention uses finite-population denominator `N_h - 1`; pilot SDs are fixed planning estimates. Sampling must be independent simple random sampling without replacement within each stratum. Costs are linear integer credits.

The multiple-choice dynamic program considers feasible integer counts using Float64 arithmetic. It supports at most 12 strata, 10,000 budget credits and 20 million estimated transitions per solve. It does not model clustering, nonresponse, bias, travel overhead or uncertainty in population counts. The +/-25% sensitivity scenarios are not confidence intervals. The planner applies established sampling and optimization methods. See [method, derivation, limits and institutional references](docs/METHOD.md).

## Source map and license

- `src/optimizer.mjs`: validation, exact DP, baselines, frontier and sensitivity.
- `src/app.mjs`, `src/worker.mjs`, `index.html`, `styles.css`: local interface.
- `src/io.mjs`, `src/scenarios.mjs`, `examples/`: scenarios and reports.
- `tests/`: implementation and independent AI critic tests.
- `scripts/serve.mjs`, `scripts/benchmark.mjs`: local server and synthetic benchmark.
- `benchmarks/results.json`: retained synthetic inputs and measured numerical evidence.
- `docs/`: method, evidence limits and provenance.
- `validation/`: preserved pre-fix app fixtures and import/Worker verification records.
- `SOURCE_MANIFEST.json`: SHA-256 inventory of the packaged files, excluding the manifest itself.

[MIT license](LICENSE). No third-party code dependencies or image/font assets. Statistical references remain under their publishers' terms and are linked rather than bundled.
