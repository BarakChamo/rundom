# Cold role queries and warm full traversal

The retained candidate ships optional V8 compilation data for the complete CSS runtime. Two independent nine-round comparisons reduced first-role-query time by 20.95 ms and 25.09 ms. Full traversal did not improve; wrapper deferral and fixed-shape attribute copying are excluded from the retained source.

The subsequent [interface and tree-copy investigation](interface-copy-optimization-results.md) retained no additional production optimization. It records current matched absolute gaps, repeatability checks and rejected candidates.

## Canonical measurements

Apple M4, Node 24.20.0, pinned TurboDOM 0.7.1, shared host, rotated fresh processes. Each comparison uses nine independent verified trials per variant and nine warm batches. These are process-cold measurements with the operating system's filesystem cache available; no isolated-host performance claim is made. Scenario setup loads Testing Library before the first-role-query timer. Counts match the existing laboratory workloads.

| Workload                                                | Before ms | Retained candidate ms | TurboDOM ms | Remaining absolute gap ms |
| ------------------------------------------------------- | --------: | --------------------: | ----------: | ------------------------: |
| First role query, 256 rows, confirmation                |    85.606 |                60.512 |       4.215 |                    56.297 |
| Warm full traversal, four 4,096-row documents           |    20.236 |                20.341 |       4.639 |                    15.702 |
| Warm role queries, 2,048 operations, confirmation guard |    28.231 |                28.110 |      13.420 |                    14.690 |

The preceding independent compilation-data comparison measured 79.002 → 58.051 ms for the first query, with TurboDOM at 3.810 ms. The confirmation uses a separately rebuilt and frozen package, including CommonJS receiver preservation. Traversal's 0.105 ms difference is flat, not a gain.

The starting workspace already contained a packed inactive-template recipe. Its source hashes matched the prepared recipe cohort exactly. Five fresh-process diagnostic traces found it effectively flat against the preceding sealed release; its implementation is not attributed to this batch. Its source remains intact.

## Where TurboDOM saves work

Pinned implementation: `.cache/performance-lab-fN3sLT/turbo-dom/node_modules/@miaskiewicz/turbo-dom/src/runtime/`.

- `index.mjs` reuses immutable parsed storage; `dom.mjs:2243` resolves wrappers through `__nodeAt`. RunDOM creates independent mutable parse5 records for each public document.
- `window.mjs` uses shared module-level classes and lazy factories. RunDOM preserves per-window public constructors, prototypes and function identity. Sharing those public objects would fail existing realm and mutation contracts.
- `cascade.mjs:230` returns an element's cached public computed-style object on a version hit and implements a smaller CSS surface. RunDOM preserves complete property metadata and returns a fresh readonly computed snapshot. TurboDOM fails the query-snapshot and interaction-state guards used in this batch; failed rows are excluded, with their failures retained in the reports.

Five independent stage traces on the starting recipe measured median first-role time 78.172 ms, including 43.417 ms inside computed-style calls and 34.599 ms elsewhere; TurboDOM measured 3.808 ms, 0.434 ms, and 3.375 ms respectively. The first styled read loads and initializes the declaration implementation; the surrounding query also loads the CSS bundle through selector dependencies.

For four-document traversal the diagnostic stage medians were: creation 8.058 ms, query materialization 7.790 ms, checked indexed scan 5.944 ms, close 0.028 ms. TurboDOM measured 0.565, 3.337, 1.712 and 0.004 ms. These traces use individual assertions and stage timers, so their totals differ from the canonical scenario. They locate costs; the table above supplies the benchmark results.

The warm CPU profile separately identifies per-window interface construction, tree copying, wrapper construction, native `markAsUncloneable`, and collection reads. Across nine profiled batches, `buildWindow` has 32.705 ms self time, `copyInactiveTemplate` 15.335 ms, and `markAsUncloneable` 11.416 ms. Inclusive profile times overlap and cannot be added. Deferring wrappers merely moves their cost into the dense scan, where all 16,384 selected elements must still be exposed.

## Retained implementation and rejected candidates

The CSS build emits the complete implementation, a small CommonJS loader and optional compilation data. A separate Node build process initializes the four bundled capabilities before capturing code; runtime state is never serialized. Every consumer process reconstructs its own module state. A SHA-256 header binds compilation data to the exact implementation source. Missing/stale data compiles current source; V8 rejects incompatible data and falls back to compilation. Tests cover matched, absent, equal-length stale-source and incompatible-flags cases, including the CommonJS `this === exports` contract.

The sidecar is approximately 1.3 MiB uncompressed. Performance gains depend on a compatible V8 cache. There is no public capability restriction, preloaded public Window, shared computed snapshot, new dependency or Rust parser change.

| Hypothesis                                                | Observed result                                              | Decision                               |
| --------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| Hydrate the complete cssstyle metadata Map from JSON      | First role query 88.170 → 89.512 ms                          | Reject                                 |
| Install public CSS accessors in one descriptor batch      | 89.780 → 87.581 ms amid several ms of variation              | Reject                                 |
| Fixed-shape owned HTML attribute copies                   | Traversal 19.999 → 20.768 ms; sparse/update flat             | Reject                                 |
| Resolve static query wrappers on indexed access           | Traversal 20.090 → 20.073 ms; cold role 78.559 → 83.288 ms   | Exclude from this target batch         |
| Optional compilation data for the full CSS implementation | First role query improves 20.95–25.09 ms in independent runs | Retain: final acceptance checks passed |

Wrapper deferral also improved the update guard 17.130 → 12.566 ms; this is recorded rather than discarded, but is not a traversal win. The implementation remains isolated in the experiment's source variants. The source map contains 123 CSS-tree CommonJS sources and no parallel ESM copy, ruling out duplicated package formats as an initialization explanation.

## Qualification and evidence

Final acceptance is recorded in `.cache/qualification/role-traversal/` and the `role-traversal-final-*` replay artifacts:

- Default and Rust-selected facades: 1,546 tests each; DOM/cache contracts: 15 tests each; strict typechecking, formatting and lint gates passed (existing lint warnings remain).
- Unchanged upstream API suite: 634 passing on each backend. The API loader hook explicitly preserves CommonJS/ESM formats, including the subprocess stylesheet-GC fixtures.
- Packed type consumers and real Vitest/React fixtures passed in forks, threads, vmForks and vmThreads on each backend, including long-list interaction/state stress.
- Selected default-backend standards replay: 10,598 fixtures selected, 5,460 executed, 5,138 pending; all 248,342 assertion statuses match the qualified baseline, including 215,815 passes. The same 206 known harness failures remain. Local contracts retain 2,750/2,752 assertion passes; all named legacy outcomes match.
- Native kernel corpus: 3,464 real native calls, 3,267 passes versus the reference's 3,219, 48 existing improvements, 197 shared failures, zero matched or boundary regressions. The 206 fragment contexts remain excluded from that corpus.

Disk exhaustion interrupted the initial standards workers. Resumption retained completed outcomes and original title selections, with zero deadline exclusions or missing executed fixtures. One resumed fixture emitted an identical duplicate assertion completion; the comparator verifies its identity rather than counting it twice. Earlier API-hook format failures are preserved separately as harness errors and were corrected before the two complete 634-pass runs. The selected suite is not all WPT, and its existing failures/pending cases are not described as new passes.

The repeated nine-round CSS guards record an explicit tradeoff: inline invalidation (256 updates) 6.213 → 6.972 ms (+0.760 ms); rule invalidation 4.256 → 4.474 ms (+0.218 ms). Interaction/state work remains correct and was 2.410 → 2.150 ms in its five-trial check; TurboDOM fails that scenario. These sub-5-ms differences are disclosed rather than becoming new optimization targets.

Three-process forced-GC role-query measurements leave retained heap effectively flat: 33.340 → 33.323 MiB after reference release; external memory is 9.596 MiB on both. Peak RSS rises 199.812 → 201.719 MiB. Separately, six forced-GC four-document traversal trials across RunDOM and TurboDOM passed all checks. Upstream API subprocesses independently verify that closed stylesheet Windows can be collected.

- Plan: `docs/role-traversal-optimization-plan.md`.
- Independent variant results and reports: `.cache/qualification/role-traversal/results-summary.json`.
- Canonical confirmation: `confirm-role.json` and `confirm-traversal.json` in that evidence directory.
- Stage traces: `stage-traces.json`; drivers and rejected source variants remain alongside it.
- Starting CPU profiles: `.cache/performance-lab-fN3sLT/cpu-uGvz4x` and `cpu-AaL7kz`.
- Qualified source/artifact provenance: `.cache/qualification/role-traversal/final-prepared.json`; the original packed cohort path is recorded there. `release-prepared.json` records a durable workspace cohort cloned from those exact tarballs; `integration.json` records source and installed DOM artifact hashes.

The next traversal work should address per-window interface creation and eager tree ownership together. Repeating leaf attribute-copy or wrapper-deferral experiments will not remove the measured dense-read cost. Remaining cold-role work lies in declaration-interface construction and vendor initialization; the compilation profile no longer supports treating bundle parsing as the entire gap.
