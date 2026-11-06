# Import fix and verification

Version v0.1.1 prevents a delayed file read from replacing newer planner input. Selecting another file, editing a field, adding or removing a stratum, choosing an example or pressing Run invalidates the older read. A malformed latest file leaves the existing plan intact. The file selector resets immediately, so the same file can be selected again while a previous read is pending. Normal planner controls remain available during a read.

## Reproduce the regression

From the project directory, run the focused tests:

```sh
node --test tests/import-controller.test.mjs
```

Expected result: 17 passed, zero failed. The tests execute the production import listener and its `markDirty`, `loadScenario` and `run` functions with deferred file reads and small DOM/Worker fixtures. They cover reversed completion order, stale read and parse errors, later edits and planner actions, malformed-input recovery, same-file reselection, chooser cancellation and the 100,000-byte boundary. This is controller-level execution; the fixtures do not select files through a browser.

The packaged baseline fixture is the exact app from public commit `56d2b4b5180969549a193fc91d15cfee1455fb00`. Run the same tests against it:

```sh
SAMPLEWISE_APP=validation/baseline-app-v0.1.0.txt node --test tests/import-controller.test.mjs
```

This command intentionally exits with failure: five tests pass and twelve fail. The fixture is read as source by the test harness, not imported as an application module. [IMPORT_RESULTS.json](../validation/IMPORT_RESULTS.json) records the source and test hashes, outcomes and evidence scope. The preserved baseline failures remain separate from the successful fixed run.

## Browser and numerical evidence

The changed app was served to the existing Brave browser. Startup produced the CreekWatch plan with 113 samples and 720 credits. Selecting the integer example produced five samples at 21 credits. Editing its budget to 24 marked the old result stale and disabled exports. Keyboard activation of Run then produced allocation [3, 3], six samples at 24 credits and standard error 5.062; exports became available again.

Earlier v0.1.0 checks exercised invalid-budget guidance, sensitivity recomputation and all three exports. The scenario JSON, report JSON and allocation CSV appeared as new native download files and matched the expected contents. Their serialization code is unchanged. October documentation also records file import, same-file reimport and narrow-screen checks of that earlier interface; those remain historical observations.

The optimizer, its existing test suites and the benchmark generator retain their v0.1.0 bytes. The prior clean extraction passed 12 tests covering 1,800 exhaustive seeded scenarios, including 21,108 critic exact/frontier plan checks. Its fixed 48-case benchmark reproduced all deterministic fields. Those unchanged numerical suites were not rerun for this import-only revision. `npm test` still runs the complete included test collection, and `npm run benchmark` regenerates the supplied numerical corpus.

## Remaining coverage

Current native file selection and same-file reselection in the browser remain unverified. Browser screenshot capture timed out; current pixel appearance and narrow-screen layout remain unverified. Pointer attempts reported obscured controls, and one earlier attempt ended with an unknown outcome; those failures were preserved without replay. Physical mobile devices and comprehensive screen-reader coverage were not tested. No field deployment, user study or empirical precision validation has been completed.
