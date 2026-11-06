# Provenance and attribution

Samplewise was created for Next Byte Hacks V5 during its October 2026 event window. The implementation and original documentation were written on 28 October 2026 UTC. This public-facing documentation was prepared on 29 October from the retained project; application code, tests, examples and benchmark data were unchanged. No prior completed contest project, source codebase or submission was reused.

On 6 November 2026, a separate release copy was prepared from the retained October archive. Its interface and documentation put the cost-aware greedy comparison first and display percentage reductions with up to four decimal places, with positive values below 0.0001% labeled explicitly. The solver, Worker, tests, scenarios, benchmark generator and retained numerical data are unchanged. The original archive remains preserved. The retained 150-second demonstration shows the October interface, whose primary card compares balanced counts.

The v0.1.1 maintenance revision, prepared later on 6 November, adds an import-order guard and resets the file selector before reading. New controller tests reproduce stale file completions and verify that the latest planner action wins. The original v0.1.0 app is included as a test fixture. The optimizer, Worker, report format, examples and benchmark data retain their v0.1.0 bytes. OpenAI coding agents implemented and independently reviewed this revision.

## AI assistance

OpenAI coding agents assisted with concept development, mathematical implementation, UI, tests, benchmark generation and documentation. A separately tasked AI critic authored an independent exhaustive-oracle test suite and reviewed the implementation. This is AI-assisted work; agent review is not a human or professional statistical audit. No claim is made that a human entrant personally authored all code or independently verified every result.

## Source and assets

- Application, solver, test and server code was created for Samplewise. The project does not claim to invent stratified sampling or dynamic programming.
- No runtime or development npm dependencies are required. Node built-ins power the local server, tests and benchmark generator.
- The interface uses system Arial/Helvetica, Georgia and monospace fonts. It does not download fonts or load a CDN.
- The brand mark, decorative chart and data charts use CSS, SVG and DOM shapes created for the project. No stock images, third-party logos or generated image assets are included.
- CreekWatch, CampusPulse and the small-budget counterexample are synthetic examples. The 48 benchmark cases were generated locally from a published seed. No private survey, environmental or student data is included.
- Statistical formulas are established methods. Primary institutional references and the model's limitations are linked in [METHOD.md](METHOD.md). Reference documents retain their publishers' rights and are not bundled.

Project code is offered under the [MIT license](../LICENSE). No API keys, credentials, payment accounts or service subscriptions are needed to use it.

Imported JSON stays in browser memory. The app does not transmit study inputs, write them to local storage or set cookies. Downloads occur when requested. Reloading discards unsaved edits.

## Validation record

The [verification record](VERIFICATION.md) documents the preserved baseline failures, current controller and browser checks, historical observations and remaining coverage. The prior archives and receipts remain preserved separately.
