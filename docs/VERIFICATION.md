# Maintenance fixes and verification

Version v0.1.2 ends the loading status when a Worker constructor fails. Pending and failed reruns identify displayed results as belonging to the previous completed run. Report and CSV exports stay disabled until a new solve succeeds, while Run remains available after failure. The requested sensitivity selection is retained for retry; a later input edit restores the input-change guidance.

## Reproduce the Worker regression

From the project directory:

```sh
node --test tests/worker-lifecycle.test.mjs
```

Expected result: 11 passed, zero failed. The harness executes the production run, failure and edit functions with controlled Worker events and small DOM fixtures. It covers constructor failure, asynchronous Worker failure, reported calculation errors, retained results, disabled exports, pending runs, successful retry and stale callbacks. The successful result payload is a fixture, so these tests establish controller transitions rather than recomputed sensitivity values.

The baseline fixture is the exact app from v0.1.1 commit `3c76d58518575c186fc1740bfc112df33bffcbdf`:

```sh
SAMPLEWISE_APP=validation/baseline-app-v0.1.1.txt node --test tests/worker-lifecycle.test.mjs
```

This command intentionally fails: six tests pass and five fail. [WORKER_RESULTS.json](../validation/WORKER_RESULTS.json) binds the source, test and baseline hashes to the preserved outcomes.

## Actual browser Worker failure and retry

The current app was served to the existing Brave browser by an owned local preview. The first Worker-script request returned the exact module with HTTP 200; the second returned one deliberate HTTP 503; the third returned the exact module with HTTP 200. Completed server-response receipts establish that sequence. No application script was injected.

Startup produced 113 samples using 720 credits. Selecting Agricultural reaches for sensitivity triggered the failed response. The page displayed a terminal failure status, identified the retained plan as previous results, disabled report/CSV exports and enabled Run. Ordinary reverse-Tab navigation reached Run; a fresh snapshot verified focus before Enter retried. The actual Worker then produced sensitivity SD values 22.5 and 37.5 and restored exports. Snapshots omit selected values, so retention is supported by that changed result and the recorded single-selection flow.

An initial reference-based key action was rejected because Run was outside the viewport. Its error was preserved before ordinary keyboard navigation. The preview was stopped and its final state was inactive with PID 0. The [independent browser audit](../validation/WORKER_BROWSER_AUDIT.json) is an unchanged summary of retained receipts, including a readiness-metadata omission covered by manifest and served-source hashes. Raw browser/session receipts are not bundled. Constructor and reported-calculation failures were tested with controller fixtures; the browser check exercised the asynchronous Worker error path.

## Import regression

Version v0.1.1 prevents a delayed file read from replacing newer planner input. Selecting another file, editing a field, adding or removing a stratum, choosing an example or pressing Run invalidates the older read. A malformed latest file leaves the existing plan intact. The file selector resets immediately, so the same file can be selected again while a previous read is pending. Normal planner controls remain available during a read.

Run the existing focused import tests:

```sh
node --test tests/import-controller.test.mjs
```

Expected result: 17 passed, zero failed. The tests execute the production import listener and its `markDirty`, `loadScenario` and `run` functions with deferred file reads and small DOM/Worker fixtures. They cover reversed completion order, stale read and parse errors, later edits and planner actions, malformed-input recovery, same-file reselection, chooser cancellation and the 100,000-byte boundary. This is controller-level execution; the fixtures do not select files through a browser.

The packaged baseline fixture is the exact app from public commit `56d2b4b5180969549a193fc91d15cfee1455fb00`. Run the same tests against it:

```sh
SAMPLEWISE_APP=validation/baseline-app-v0.1.0.txt node --test tests/import-controller.test.mjs
```

This command intentionally exits with failure: five tests pass and twelve fail. Both baseline fixtures are read as source by the harnesses. [IMPORT_RESULTS.json](../validation/IMPORT_RESULTS.json) preserves the historical v0.1.1 source hashes and outcomes; its fixed-app hash now identifies `validation/baseline-app-v0.1.1.txt`. The import suite also passes all seventeen cases against the current v0.1.2 app, as recorded in WORKER_RESULTS.json.

## Retained browser and numerical evidence

After the v0.1.1 import fix, checks in Brave covered startup, examples and an edit to the integer example's budget. That edit to 24 marked the old result stale and disabled exports. Keyboard Run produced allocation [3, 3], six samples at 24 credits and standard error 5.062; exports became available again.

Earlier v0.1.0 checks exercised invalid-budget guidance, sensitivity recomputation and all three exports. The scenario JSON, report JSON and allocation CSV appeared as new native download files and matched the expected contents. Their serialization code is unchanged. October documentation also records file import, same-file reimport and narrow-screen checks of that earlier interface; those remain historical observations.

The optimizer, its numerical test suites and the benchmark generator retain their v0.1.0 bytes. The prior clean extraction passed 12 tests covering 1,800 exhaustive seeded scenarios, including 21,108 critic exact/frontier plan checks. Its fixed 48-case benchmark reproduced all deterministic fields. Those unchanged numerical suites were not rerun for these interface corrections. `npm test` runs the complete included test collection, and `npm run benchmark` regenerates the numerical corpus.

## Remaining coverage

Current native file selection and same-file reselection in the browser remain unverified. Browser screenshot capture timed out; current pixel appearance and narrow-screen layout remain unverified. Pointer attempts reported obscured controls, and one earlier attempt ended with an unknown outcome; those failures were preserved without replay. Physical mobile devices and comprehensive screen-reader coverage were not tested. No field deployment, user study or empirical precision validation has been completed.
