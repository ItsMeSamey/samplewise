# Provenance and attribution

Samplewise was created for Next Byte Hacks V5 during its October 2026 event window. The implementation and original documentation were written on 28 October 2026 UTC. This public-facing documentation was prepared on 29 October from the retained project; application code, tests, examples and benchmark data were unchanged. No prior completed contest project, source codebase or submission was reused.

On 6 November 2026, a separate release copy was prepared from the retained October archive. Its interface and documentation put the cost-aware greedy comparison first and display percentage reductions with up to four decimal places, with positive values below 0.0001% labeled explicitly. The solver, Worker, tests, scenarios, benchmark generator and retained numerical data are unchanged. The original archive remains preserved. The retained 150-second demonstration shows the October interface, whose primary card compares balanced counts.

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

The 6 November release checks used the existing Brave profile. Worker calculations, scenario switching, stale-export suppression, keyboard navigation and activation, invalid-budget guidance, valid reruns and sensitivity recomputation succeeded. Screenshot capture timed out. Pointer attempts reported obscured controls, and one attempt on the October interface timed out with an unknown outcome. The timed-out actions were preserved without replay. Current pixel-level appearance and narrow-screen behavior remain unverified.

The October documentation records scenario/report/CSV downloads, narrow-screen table scrolling, saved-file import, same-file reimport and preservation of the previous plan after invalid imports. Its later import check used Chromium's file-chooser protocol to select disk files. These historical checks were not repeated for this release. Physical mobile devices and comprehensive screen-reader coverage were not tested. No field deployment, user study or empirical precision validation has been completed.

The final 6 November documentation revision shortened the README and moved this detailed validation history here. It changed no application code, tests, scenarios or benchmark data.
