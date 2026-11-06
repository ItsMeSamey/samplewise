# Samplewise: model, optimizer, and limits

Samplewise allocates a fixed sampling budget across disjoint strata. It plans the precision of a population-weighted mean; it does not analyze observed outcomes, select actual units, or estimate a treatment effect.

## Model

For stratum h, let N_h be its population size, n_h the chosen sample count, c_h its integer sample cost, and S_h its planning standard deviation. Define N = sum_h N_h and W_h = N_h / N.

Under independent simple random sampling without replacement within every stratum:

```
V(n) = sum_h W_h^2 S_h^2 (1/n_h - 1/N_h)
SE(n) = sqrt(V(n))

minimize V(n)
subject to sum_h c_h n_h <= budget
           min_h <= n_h <= max_h <= N_h
           n_h is an integer
```

The finite-population variance convention is `S_h^2 = sum_i (y_hi - population_mean_h)^2 / (N_h - 1)`. A sample SD from a pilot can estimate this quantity, but Samplewise treats the supplied estimate as fixed. For N_h = 1, the only possible sample is a census; the input SD must be zero. The correction `1/n_h - 1/N_h` is zero at a census. A zero pilot SD can also yield zero modeled error; that is not proof that the underlying population has no variation.

A minimum of one is allowed because an external planning SD can be supplied. A one-observation field sample cannot estimate its own within-stratum variance. Choose larger minimums when needed for later estimation, coverage, or operational reasons.

The objective is the mean across all units, not the unweighted mean of stratum means. Population counts determine weights. SD has the measured outcome's units; variance has squared units. No units are silently converted.

## Exact integer algorithm

Every stratum offers one choice for each integer sample count in its bounds. Subtract all mandatory minimum costs. A DP layer records the smallest accumulated variance for each exact extra spend after processing one more stratum. Unreachable states have infinite objective.

```
D_0[0] = 0; other D_0[b] = infinity
D_h[b] = min over extra k of:
         D_(h-1)[b - c_h*k] + W_h^2*S_h^2*(1/(min_h+k) - 1/N_h)
```

The choice table reconstructs a feasible plan. A prefix minimum across spend states gives the optimum for every integer budget up to the chosen cap; the UI displays at most 31 evenly spaced budget points. Line segments connect displayed points; they do not imply fractional samples or linear interpolation of optimal allocations.

Induction on the layer proves optimality: every feasible partial allocation ends with one of the enumerated choices and an optimal preceding state cannot be worse than its actual prefix. The final minimum therefore includes a global optimum. This is a combinatorial claim for the supplied model, evaluated with Float64 arithmetic. It is not an exact rational-arithmetic certificate. Numerically indistinguishable plans can tie. Equal objective values prefer lower spend; other ties follow the deterministic input-order recurrence. Reordering equal-valued strata can change the chosen allocation without changing its objective.

Costs must be positive integer credits. There is no automatic rounding or hidden currency scaling. To represent a fractional currency cost, users may explicitly choose a common smaller credit unit and scale *both* costs and budget, provided limits still hold. Fixed overhead should be removed from the available budget before planning; route costs, bulk discounts and recruitment dependencies are not modeled.

Complexity is bounded by `(budget - mandatory_cost + 1) * sum_h(number_of_choices_h)`. This conservative transition count must not exceed 20 million per solve. Additional limits: 12 strata, 10,000-credit budget, population 10 million per stratum, and SD up to one million. Oversized inputs fail clearly. Choices and Float64 objective arrays use under one megabyte at the maximum supported state dimensions; total process memory also includes runtime and UI overhead. A Web Worker runs optimization and sensitivity; editing cancels pending work.

## Baselines and stress tests

**Balanced counts** begins at each minimum, then repeatedly adds to the affordable, non-saturated stratum with the smallest current n. Input order resolves ties. It is a feasible practical comparison, not proportional allocation and not a claim of fair representation.

**Cost-aware greedy** begins at minimums and repeatedly takes the largest positive marginal variance reduction per credit among affordable samples. Its score is `W_h^2*S_h^2 / [c_h*n_h*(n_h+1)]`. This is a stronger comparison than equal counts. Unequal integer costs can leave a costly useful sample unaffordable after a locally favorable purchase; the exact method considers whole combinations. Many scenarios produce little or no improvement over greedy. The benchmark reports this explicitly.

**Sensitivity** changes one selected stratum's SD to 75% and 125% of the original, re-solves, and compares the retained original allocation with the newly optimal allocation under that same changed SD. It shows allocation changes and SE, not a probability interval. A +25% case beyond the supported SD limit is shown as unavailable. It does not represent simultaneous uncertainty in all inputs or a robust optimization guarantee.

## Verification

`npm test` runs two independently authored exhaustive-oracle suites, totaling 1,800 seeded small scenarios. The critic suite checks 21,108 returned plans including frontier budgets. Oracles enumerate Cartesian products of integer allocations and use the equivalent expression `N_h*(N_h-n_h)*S_h^2 / (N^2*n_h)`; they do not reuse the DP or variance helper.

An additional test enumerates actual without-replacement samples from two tiny finite populations and compares the empirical variance of the weighted means to the formula. Edge tests cover zero SD, census, n=1, unequal-cost remainder budgets, fixed maxima, extreme weights, malformed values, operation limits, scenario roundtrips, sensitivity and CSV formula escaping.

`npm run benchmark` regenerates 48 synthetic planning cases from seed 20261029, all example JSON files, and `benchmarks/results.json`. It includes a near-limit stress input and exact comparisons with both baselines. Numerical outputs are deterministic; timestamps, timings and memory vary by environment. These are synthetic numerical experiments, not field validation.

## Statistical references

- [Penn State STAT 506, Lesson 6: Stratified Sampling](https://online.stat.psu.edu/stat506/Lesson06) gives the stratified-mean variance estimator with population weights, the finite-population correction, and a sample-variance convention. Samplewise uses the corresponding planning expression with externally supplied SDs.
- [Statistics Canada, Survey Methods and Practices, catalogue 12-587-X](https://www150.statcan.gc.ca/n1/en/pub/12-587-x/12-587-x2003001-eng.pdf), Chapters 7 and 8, covers estimation, sampling variance, finite-population correction, sample sizes and allocation.
- [Pacific Northwest National Laboratory, Visual Sample Plan: Stratified Sampling for Estimating a Mean](https://vsp.pnnl.gov/help/Vsample/Design_Stratified.htm) describes fixed-budget, cost-aware stratified allocation and its reliance on representative SD estimates, random sampling and accurate costs.

References checked 28 October 2026 UTC. These establish the statistical background; no implementation or artwork was copied from them. Samplewise's contribution is the local constrained integer workflow, transparent competing plans, frontier, scenario sensitivity and reproducible evidence.
