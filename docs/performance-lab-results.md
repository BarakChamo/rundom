# Performance evidence and next batch

## Qualified material-gap batch — 2026-11-08

Frozen `deMMKD`, compared with qualified `d7Ap7o`, retains opaque native ownership/identity stores, allocation-free leaf text reads, and separately bounded recurring TypeScript templates and validated native arenas. No public API or parser default changes. The definitive matrix accepts 513 workload timing trials; the real React/Vitest comparison adds 72 passing trials across four pools. All are shared-host exploratory measurements, not an overall certified ratio. Each table row is its own matched report in milliseconds per existing canonical batch.

| Canonical batch                 | TS before | TS after | Rust before | Rust after | TurboDOM |
| ------------------------------- | --------: | -------: | ----------: | ---------: | -------: |
| Sparse reads, 4 × 4,096         |    11.195 |   12.868 |      11.306 |     10.838 |    2.836 |
| Repeated parse/count, 4 × 4,096 |    17.026 |   11.352 |      17.372 |     13.007 |    2.707 |
| Full traversal, 4 × 4,096       |    25.221 |   16.512 |      24.147 |     18.003 |    3.385 |
| Parse/update, 4 × 4,096         |    25.113 |   18.120 |      25.331 |     21.319 |    8.638 |
| Rotating parse, 4 × 4,096       |    38.851 |   13.742 |      50.545 |     16.068 |    3.476 |
| Unique parse, 4 × 4,096 (guard) |    36.668 |   33.730 |      47.508 |     43.416 |   31.880 |
| Create/close 8 empty Windows    |     6.611 |    6.729 |           — |          — |    0.090 |
| Roles, 2,048 operations         |    22.404 |   21.751 |           — |          — |   10.941 |

Rotating construction falls about 65% on TypeScript and 68% on Rust in this matrix; full traversal falls about 35% and 25%. Unique TypeScript parsing is now within 1.85 ms of TurboDOM and leaves the optimization queue. Native unique parsing still trails by 11.54 ms. Empty-window construction and roles do not establish a material improvement. A separate sparse confirmation measures 13.316→14.294 ms, versus TurboDOM 3.580; retain this approximately one-millisecond regression rather than claiming universal gains. Small repeated/traversed/rotating 256-row cases remain 8–10 ms behind TurboDOM. Batched mutation/query at 8,192 rows/64 operations stays 28.662→28.878 ms against 21.984.

Default/native facade gates pass 1,532 tests each, API gates 634 each, strict packed declarations and all four packed Vitest pools each. The full selected replay executes all 5,460 previously executed fixtures, with 248,342 assertions and 215,815 passes, no missing assertions or harness changes, and only the previously proven messaging/timer fluctuation. Local and legacy named outcomes match exactly. Real native replay records 3,464 actual kernel calls, 3,267 passes, 3,219 reference passes, 48 improvements and zero matched/boundary regressions; 197 shared failures and 206 excluded fragment cases remain. This does not establish total WPT conformance or a new precise agreement percentage.

Real ten-test React/Vitest timings are largely flat: forks process medians 1,160.15→1,155.99 ms, threads 1,172.65→1,163.96, VM forks 944.24→942.86 and VM threads 950.31→926.79. Happy DOM and TurboDOM still fail the checked stress screens, so they receive no equivalent framework score. DOM improvements have not produced a large end-to-end Vitest win.

Three-process forced-GC lifetime trials per side/backend retain about 12.4 MiB extra JS heap for four large TypeScript templates. Native recurrence instead retains about 0.3 MiB extra heap and 2.9 MiB external arena storage. All released Windows collect. Eviction releases the cached graphs/arenas; a second twelve-process experiment then releases caller-owned source strings and exposes about 1.6 MiB remaining extra heap for bounded pending keys. ArrayBuffer memory is part of external storage, not an additional amount to sum. Both experiments retain RSS and peak RSS separately.

Separate CPU/allocation captures show full-traversal sampled allocation about 234.1→176.8 MiB across nine instrumented batches. Node-constructor self time is 60.958→3.332 ms in these captures, but its attributed allocation increases 11.37→25.91 MB: native slot stamping saves lookup/GC CPU, not every wrapper allocation. Raw clone allocation remains about 59 MB; sparse copying/ID-index allocation is essentially unchanged. Native rotating captures remove repeated kernel execution, while canonical materialization remains. Inspector frames are excluded from workload CPU totals; these single captures are attribution, not benchmark ratios.

The source/evidence manifest is `.cache/qualification/material-gap-sealed-manifest.json`; exact paired rows, first-use/load times, memory and failed competitors are `.cache/qualification/material-gap-sealed-derived-results.json`. Residual captures are indexed by `material-gap-sealed-profile-summary.json`. [The current queue](remaining-turbodom-optimization-plan.md) remains limited to accepted deficits above 5 ms. Previous global-layout and direct-field variants are rejected and preserved.

## Previous initialization/read-path batch and narrowed scope

Candidate `d7Ap7o` completes 1,233 verified timing trials, a separate 108-trial small-document confirmation, CPU/allocation/memory/ownership diagnostics and complete compatibility qualification. The interrupted earlier parse report is excluded. Current simple/complex query hits improve 0.288→0.202 and 0.311→0.202 ms per 2,048 operations; full iteration improves 83.365→71.502. Large unique parsing improves 50.606→38.843 ms and rotating parsing 49.015→36.474 per four 4,096-row documents. Roles are flat. Small repeated traversal regresses approximately 6% in the confirmation; framework stress measurements do not establish a gain. Preserve these tradeoffs rather than presenting an overall ratio.

Per the November 8 instruction, further optimization targets only accepted positive TurboDOM deficits over 5 ms in canonical batches. Full traversal (31.079 versus 3.550 ms), rotating large parsing (36.474 versus 3.163), empty-window construction (6.894 versus 0.091), unique large parsing (38.843 versus 28.785) and roles (20.495 versus 9.840) qualify. Sub-millisecond query differences, small event differences and workloads already faster than TurboDOM are not optimization projects. [The narrowed batch contract](remaining-turbodom-optimization-plan.md) owns priorities and instrumentation.

The shared wrapper-initialization and consolidated global-installation experiments were subsequently rejected; their source and failed measurements remain preserved. Current profiles identify wrapper creation/GC as the full-traversal cost and global assembly as a major empty-window cost. Diagnostic modified-copy phase timings are attribution only, separate from accepted speed results.

## Lazy-copy decision — November 7

Reject the current whole-tree-promotion lazy backend for default use. Fixed/follow-up candidates complete 1,152 paired timing trials, separate CPU/allocation/multi-window diagnostics, a forced-backend 1,515-test facade/634-test API supplement and six ownership probes. Sparse four-document batches improve roughly 2–3× and 64 untouched Windows fall from 175.61 to 53.29 MiB of heap, but dense-read penalties persist across promotion variants. Writes promote and erase the storage saving; styled initialization also promotes. Source archives and all distributions remain preserved in `.cache/qualification/lazy-template-decision.json` and [the experiment decision](lazy-template-materialization-plan.md). No lazy backend or unused diagnostic export remains in production.

Keep initial named-property/radio discovery proofs as an independently measured candidate, then evaluate CSS publication/index decoding/query-hit preparation. The later `d7Ap7o` checkpoint is qualified separately above; no WPT percentage transfers from a prototype. Real framework controls now include optional two-workload React stress coverage in addition to the existing eight tests; stress and historical reports have different work and fixture hashes.

## Adaptive query kernels and owned ID storage — 2026-11-07

Qualified runtime: frozen `uVC4wn`, paired against `8TeYYH`; pinned Node 24.20.0, Apple M4, shared-host exploratory. The primary matrix accepts 1,179 trials over nine rotated fresh processes and nine measured batches per process. Two additional sustained-interaction comparisons accept 18 trials each. Diagnostic CPU/allocation/forced-GC modes are separate and never overlap timings, builds or correctness runs. All competitor semantic screen failures remain recorded.

| Checked workload / batch                         | Before ms | Current ms | Happy DOM ms |  TurboDOM ms |
| ------------------------------------------------ | --------: | ---------: | -----------: | -----------: |
| Diverse queries, 64 ops / 8,192 nodes            |    27.881 |     16.641 |      185.613 |       15.527 |
| Batched mutation/query, 64 ops                   |    33.140 |     22.049 |      178.133 |       16.704 |
| Static snapshot mutation, 64 ops                 |    72.302 |     50.674 | fails screen | fails screen |
| Query after mutation, 64 ops                     |    13.067 |      7.987 |       82.592 |        8.121 |
| List updates, 16 ops / 8,192 rows                |    12.365 |      9.351 |       82.628 |       28.459 |
| List updates, 128 ops / 64 rows                  |     2.815 |      2.358 |        7.499 |        1.514 |
| ID hits, 8,192 ops                               |     0.517 |      0.418 |        0.114 |        0.079 |
| Full result iteration, 8,192 queries / 256 nodes |   272.654 |    279.725 |      174.012 | fails screen |
| Roles, 8,192 queries / 256 nodes                 |    58.157 |     58.444 |       35.022 |       27.497 |
| Unique parsing, 8 documents / 256 rows           |     8.681 |      8.721 |       27.794 |        3.386 |
| Unique parsing, 4 documents / 4,096 rows         |    38.526 |     38.891 |      215.289 |       23.977 |

Independent cold/parse controls also find small unique TypeScript parsing essentially flat, 8.667 → 8.726 ms (complete process 241.418 → 241.947 ms). Rust remains explicitly selected: large-list work changes 11.928 → 9.076 ms; small unique parsing stays near 11 ms and large unique parsing near 42 ms. Default TypeScript still wins those parse workloads. Full-result publication, roles, small mutations and TurboDOM parsing remain material gaps. No universal speed ratio is supported.

Sustained interactions (1,024 operations / 8,192 rows) first measure 40.868 → 43.357 ms; a fresh repeated comparison measures 41.283 → 41.568 ms. The original short-batch control is 2.143 → 2.182 ms. Both sustained reports and their process distributions are retained; no interaction speedup is claimed. Shared-kernel-only control and paired CPU captures are also preserved.

Sampled allocation for five 128-operation large-list batches falls from 876.5 to 474.5 MiB; interaction allocation is 29.9 → 28.4 MiB. Single-list forced-GC post-work heap is 26.89 → 26.64 MiB and closed-handles-retained heap 26.89 → 26.20 MiB; released heap is 18.80 MiB in both. Eight large styled Windows retain 83.57 MiB live / 80.03 MiB closed for TypeScript, versus TurboDOM 46.33 / 46.33 MiB. The earlier released-heap discrepancy is attributed to V8 bytecode flushing by paired heap snapshots and a no-flush control; it is not evidence of surviving DOM trees. Production VM flags remain unchanged.

Fresh tests pass 1,450 cases in each parser configuration, all 634 API checks per parser, strict packed types and four Vitest pools. WPT selection is unchanged: 10,598 selected, 5,460 executed, 5,138 pending. All 248,342 assertion outcomes match the previous qualified runtime; 207 harness failures remain visible. The 99.865% figure remains agreement with the selected reference-passing assertions, not total WPT conformance. Local structured results are identical (228 variants, 2,752 assertions, 2,750 passes), and legacy results remain 185/186, 557/557, 876/876 and 162/162. Eight React workflows pass across all four pools and nine measured repetitions. TurboDOM fails all four framework semantic screens. Forks process medians are RunDOM 609.08 ms, Happy DOM 572.18 ms and jsdom 829.59 ms; retained DOM wins do not establish the framework default goal.

Evidence: `.cache/qualification/query-owned-*`, immutable lab consumer `.cache/performance-lab-uVC4wn`, framework consumer `.cache/framework-benchmark-itrkNn`. Alternative inline/kernel/cursor/weak-key variants, GC placement observations, heap controls and rejected source snapshots remain separately preserved.

Current measurements are exploratory: other applications used CPU during the run. Raw reports record shared-host conditions; analytical reports reject speed-certification eligibility. These data identify large costs and candidate experiments. They do not establish a 3× overall win or an improvement over historical quiet-host numbers.

The corrected matrix completed 1,080 verified timing trials across 25 scenarios and five provider selections. A second tree-size matrix completed 108 trials at 4,096 rows. CPU, allocation, lifetime and worker-pool experiments add 85 measured trials, for 1,273 main laboratory observations; later bulk-query attribution and finalized-driver probes are separate validation/diagnostic observations. The current React fixture adds 108 measured CLI trials over four pools and three providers. Every main serial combination has nine process trials; memory and worker-pool results have three.

## Current ID/traversal checkpoint — 2026-11-07

The qualified candidate is `.cache/performance-lab-8TeYYH`, against S0wQID. A broad matrix completes 945 accepted timing trials across 18 distinct scenarios, followed by 54 interaction/warmup trials, 108 framework trials and separate CPU/allocation/lifetime diagnostics. Three competitor semantic screens and four TurboDOM framework screens remain visible. Earlier mechanism experiments add 108 timing trials and one direct-traversal CPU diagnostic; do not combine their separate paired baselines into one ratio.

The 8,192-row, 16-operation reconciliation batch falls from 57.909 to 12.438 ms; Happy DOM is 79.935, TurboDOM 28.795 and jsdom 43.071. Native-selected RunDOM falls from 56.507 to 12.714. The 64-row batch improves from 4.969 to 3.060 ms but still trails TurboDOM's 1.635. List allocation churn falls about 80%; a standard list lifetime probe shows higher live heap, while separate guarded collection probes collect the tracked Window/Document on both revisions. Longer interaction probes do not reproduce the initial short-batch slowdown. The 0.064 ms per 1,024 text-write increase remains explicit. Roles, framework latency and multi-window storage remain open gaps.

See [the current mechanisms, tradeoffs and evidence](optimization-opportunities.md#incremental-id-lookup-and-traversal--2026-11-07) and `.cache/qualification/id-traversal-final-manifest.json`. Full selected WPT assertions are unchanged, with zero matched regressions or missing assertions. These are exploratory shared-host observations, not an overall or certified speed result.

## Current constructor and edge checkpoint — 2026-11-07

The 36-scenario rig adds checked long-list reconciliation and interaction-driven live state/style changes. This batch completes 621 verified before/after/provider timing trials with nine rotated fresh processes per accepted combination. Default empty-window construction falls from 6.315 to 5.144 ms per eight windows; repeated HTML falls from 8.462 to 7.238 ms per eight documents. The captured intrinsic allocates the private member holder with its final public prototype before initialization. Large-list, role, mutation, event, write and VM controls remain separately reported; the default construction win does not transfer to every workload. Two interaction screens fail on competitors and remain excluded from accepted timing rows.

See [the cost matrix and retained/rejected experiments](optimization-opportunities.md#constructor-allocation-and-broad-edge-matrix--2026-11-07). Machine-readable evidence: `.cache/qualification/expansion-derived-results.json`; candidate `.cache/performance-lab-S0wQID`, matched baseline `.cache/performance-lab-fQ6LWQ`. CPU/allocation and lifetime diagnostics are separate from these latency distributions. Native thin/fat LTO experiments stay unshipped and make no complete DOM speed claim.

## Matched workloads

Each cell is the median of independent process batch medians in milliseconds. The fixture has 256 rows and depth four. Parsing includes full lifecycle cleanup and uses eight documents per batch; other rows use 512 operations. Bulk query measures collecting results and reading length, not traversing every returned node. Different rows are different work and cannot be averaged into an overall score.

| Workload                  | RunDOM TS | Happy DOM |   jsdom | TurboDOM |
| ------------------------- | --------: | --------: | ------: | -------: |
| parse-html                |    21.246 |    32.099 |  56.844 |    0.448 |
| query-all                 |    35.042 |     0.063 |  22.230 |    0.059 |
| query-after-mutation      |     8.490 |    19.766 |  42.293 |    3.688 |
| style-read                |     3.649 |     0.145 |   1.457 |    0.739 |
| style-inline-invalidation |     9.831 |    78.622 | 108.860 |   13.602 |
| role-query                |    16.440 |     4.178 | 258.945 |    4.041 |

Provider-load medians in the empty control are 25.90 ms for RunDOM, 118.25 ms for Happy DOM and 243.83 ms for jsdom. These are provider loading after the harness starts, not whole-process cold starts. Initial role-query use is 69.37 ms for RunDOM versus 3.98 ms for Happy DOM; direct style setup moves some deferred CSS work into the setup phase. The report retains both phases rather than hiding deferred cost.

The failed main screens are Happy DOM CSSOM rule invalidation, jsdom inherited custom properties, and TurboDOM rule invalidation, inherited custom properties and clone/isEqualNode. Their raw stderr and exact fixture remain preserved. No performance ratio is assigned to those failures. The large-tree replay has no failed screen after correcting teardown.

## Attribution

A dedicated bulk-query CPU pass records 3,049 warm CPU samples over 3 × 1,024 queries. NodeList construction accounts for 287.50 ms of sampled self time versus 564.05 ms of timed work; these are separate measurements, so treat the approximate half-share as a prioritization signal. Candidate-index selection contributes 88.46 ms and compiled matching 65.96 ms of sampled self time. Raw allocation call trees attribute approximately 161.96 MB to NodeList construction and 154.88 MB to string splitting in this pass. These are allocation-sampling estimates including collected objects, not retained memory. Raw caller stacks place the split allocation under queryAll; source inspection finds the simple-class predicate splitting the class attribute per candidate.

For warmed role queries, computed-view copying contributes 114.05 ms and cascade computation 58.54 ms of sampled self time in the diagnostic pass. Initial CSS use includes declaration-interface construction, dependency normalization and module compilation. Native parsing is not the execution path for these warmed reads. Instrumentation self time remains in JSON and is excluded from readable workload rankings; raw DevTools profiles are preserved.

Changing NodeList construction alone cannot produce an arbitrary speedup: removing a half-share has an ideal upper bound near 2× for that workload before residual costs. Combine representation changes with eliminating repeated result discovery, and verify iteration/reflection and invalidation costs separately.

## Lifetime

Whole-worker post-GC heap in MiB, including harness and provider code. Each fixture has 256 rows per window. Closed handles are deliberately retained before the release checkpoint. These are heap observations, not total native memory or proof of finalizer completion.

| Windows | Provider  | Live after work | Closed, handles held | References released |
| ------: | --------- | --------------: | -------------------: | ------------------: |
|       1 | run-dom   |           18.17 |                18.17 |               17.43 |
|       1 | jsdom     |           45.30 |                45.31 |               43.38 |
|       1 | happy-dom |           28.53 |                24.85 |               24.51 |
|       8 | run-dom   |           23.02 |                23.03 |               17.90 |
|       8 | jsdom     |           58.01 |                58.02 |               43.63 |
|       8 | happy-dom |           56.16 |                26.93 |               24.71 |
|      32 | run-dom   |           38.29 |                38.30 |               18.12 |
|      32 | jsdom     |          102.55 |               102.56 |               45.34 |
|      32 | happy-dom |          150.41 |                33.62 |               24.90 |

RunDOM retains much less live-window heap in this fixture. Happy DOM releases substantial document state during its explicit management teardown; RunDOM retains more while closed handles remain reachable. RSS/external/ArrayBuffer and peak-process observations remain in raw reports. Do not infer a leak from an isolated post-GC difference.

## Independent-document workers

Each trial completes 16 tasks × eight parsed documents, after a separately recorded pool warmup. Three fresh whole-process trials per lane/provider. Total throughput includes messaging, scheduling and disposal. Startup and full process exit remain separate.

| Provider     | Lanes | Documents/s | Full process ms | RSS MiB |
| ------------ | ----: | ----------: | --------------: | ------: |
| run-dom      |     1 |       220.5 |           950.9 |   354.0 |
| run-dom      |     2 |       344.6 |           708.5 |   493.5 |
| run-dom      |     4 |       502.2 |           749.0 |   622.6 |
| run-dom-rust |     1 |       163.6 |          1210.7 |   432.8 |
| run-dom-rust |     2 |       287.3 |           849.2 |   518.3 |
| run-dom-rust |     4 |       421.3 |           786.7 |   676.8 |
| happy-dom    |     1 |       124.6 |          1549.5 |   310.1 |
| happy-dom    |     2 |       230.6 |          1061.7 |   486.8 |
| happy-dom    |     4 |       298.4 |          1162.9 |   825.4 |

RunDOM TS throughput increases from 220.5 to 502.2 documents/s with four lanes, while full process time changes from 950.9 to 749.0 ms and RSS rises from 354.0 to 622.6 MiB. This is useful independent-document throughput, not a 2.3× reduction in short test-job latency. Rust trials verify 128 actual native calls in every measured trial; they remain slower than TS here. No persistent Rust DOM backend is implied.

## Actual runner

Eight identical React/Testing Library workflows per CLI process, nine trials per provider/pool. These observations share the uncontrolled-host limitation. Worker RSS scope differs between fork and thread pools; it is not aggregate runner memory.

| Pool      | Provider  | Process ms | Summed test ms | Worker RSS MiB |
| --------- | --------- | ---------: | -------------: | -------------: |
| forks     | run-dom   |      772.3 |          146.0 |          153.8 |
| forks     | jsdom     |     1086.4 |          230.9 |          216.0 |
| forks     | happy-dom |      782.8 |          132.9 |          119.5 |
| threads   | run-dom   |      761.5 |          160.2 |          207.9 |
| threads   | jsdom     |     1074.3 |          230.5 |          260.2 |
| threads   | happy-dom |      843.7 |          140.2 |          178.6 |
| vmForks   | run-dom   |      879.7 |          155.2 |          155.2 |
| vmForks   | jsdom     |     1260.4 |          243.0 |          199.0 |
| vmForks   | happy-dom |      921.1 |          133.9 |          136.3 |
| vmThreads | run-dom   |      723.2 |          136.2 |          210.2 |
| vmThreads | jsdom     |     1043.9 |          216.8 |          249.2 |
| vmThreads | happy-dom |      746.6 |          130.4 |          181.4 |

Happy DOM still wins test-work duration. RunDOM process medians are lower in this noisy cohort, with overlapping variability possible; this is not a certified overall win. A multi-file runner matrix remains required to characterize module initialization amortization and worker reuse. The existing single-file fixture must not stand in for that experiment.

## Baseline implementation order

1. **Bulk-query allocation and reuse.** Replace per-index static NodeList construction with a fresh standards-compatible view over immutable results; eliminate repeated class splitting without a mutable node cache; investigate bounded weak result-vector reuse only where tree/document ownership and selector-state invalidation are proven. Add full iteration, reflection, snapshot/identity and mutation variants before claiming gains. Preserve raw topology access and foreign/adopted-root correctness.
2. **Computed reads.** Optimize completed-frame lookup and fresh readonly-view creation. Keep live state, CSSOM mutation, media, inheritance, shadow/scoped styles and retained snapshots correct. CSS dependency initialization is a separate first-use target; prove its cost in the actual Vitest environment before moving it.
3. **Cross-runtime and lifetime experiments.** Profile parse/encode/validate/materialize stages before further Rust offload or compression. Test worker reuse and explicit script/capability profiles with separate labels. Consider shared immutable metadata and private-brand access only when profiles support their cost; never share mutable Windows or reduce default semantics.

The surviving handoff reports rejected reflection-plan caches, inherited-style subset caches and weak static-match caches. Those are historical evidence, not instructions or proof the same mechanisms will help this implementation. Repeating them requires a new measured cost and an end-to-end confirmation.

## Evidence locations and qualification

- Main frozen runtime cohort: /Users/barakchamo/Documents/dev/run-dom/.cache/performance-lab-9STIsW.
- Main raw timing and analysis: /Users/barakchamo/Documents/dev/run-dom/.cache/performance-lab-9STIsW/timing-mHaPgd.
- Large-tree replay: /Users/barakchamo/Documents/dev/run-dom/.cache/performance-lab-9STIsW/timing-oC0qCn.
- Framework cohort: /Users/barakchamo/Documents/dev/run-dom/.cache/framework-benchmark-bjAnaN.
- Report paths/statuses and SHA provenance are indexed by .cache/qualification/performance-lab-corrected-status.json, performance-lab-final-probes.json and performance-lab-findings.json.
- The early stqzQU and 7YR9dk cohorts used standard window.close() for detached Happy DOM windows. Their teardown/retention/parallel comparisons are superseded and explicitly annotated; do not infer a Happy DOM leak or reuse their ratios.
- At the laboratory baseline, owned tests passed 1,388 cases on default and Rust-selected paths; upstream API passes 634; strict packed ESM/CJS/bundler types and all four Vitest pools pass. This rig does not create a new WPT percentage. The prior 99.85697% reference-pass result remains tied to its qualified frozen source; the preceding cascade-input optimization still requires its full-corpus replay.

## Collection/query results, November 7

The combined static-view, class-matching and weak result-vector change completes 468 verified matched timing trials, plus 108 guarded React/Vitest timing trials. Each successful combination has nine rotated fresh-process trials. Separate lifetime experiments add 36 trials and CPU/allocation attribution adds ten; screens are additional and excluded from these counts. Before and after use byte-identical frozen probes. Shared-host conditions keep every row ineligible for certified speed ratios.

Medians below are milliseconds per batch, with 256 fixture rows and depth four. Bulk query reads length; iteration visits every member and checks `item()`. Different rows have different operation counts and cannot be averaged.

| Scenario             | Operations |  Before |   After |  Happy DOM |   TurboDOM |    jsdom |
| -------------------- | ---------: | ------: | ------: | ---------: | ---------: | -------: |
| query-simple         |       8192 |   9.493 |   0.958 |      0.246 |      0.146 |   22.721 |
| query-all            |       8192 | 382.225 |   3.509 |      0.327 |      0.066 |  228.705 |
| role-query           |       8192 | 117.006 | 112.612 |     36.735 |     28.275 | 3380.964 |
| style-read           |       8192 |  19.840 |  19.970 |      0.759 |      2.430 |    4.562 |
| events-dispatch      |       8192 |   7.900 |   8.033 |     18.870 |      3.716 |   13.042 |
| query-all-iterate    |        256 |  20.534 |  12.257 |      5.533 | ineligible |   21.809 |
| query-snapshot       |        256 | 108.822 |  72.215 | ineligible | ineligible |   39.915 |
| query-after-mutation |        256 |   2.703 |   1.842 |      6.985 |      1.055 |   15.998 |
| parse-html           |          8 |  13.947 |  13.725 |     26.475 |      0.298 |   37.241 |
| windows-create-close |          8 |   7.880 |   7.737 |     14.622 |      0.069 |   11.514 |

Repeated bulk-query length work falls from 382.225 to 3.509 ms in this cohort. This roughly 109-fold observed change combines result reuse with cheaper fresh views and matching; it is not the effect of collection allocation alone. Full iteration improves less, from 20.534 to 12.257 ms. Role queries and computed reads show little change. Happy DOM still leads those reads and iteration; RunDOM leads Happy DOM on the checked mutation/query, event and parse workloads. No overall 3× result is established.

Happy DOM fails the strict fresh-snapshot screen. TurboDOM fails `item()` in the iteration screen and fails the strict snapshot screen. Their complete stderr and raw screens remain in the semantic report; these failures have no assigned speed ratio. The fast length-only rows do not prove these stronger contracts.

The empty-control process medians are 99.382 ms after versus 100.049 ms before, Happy DOM 166.938 ms, TurboDOM 96.279 ms and jsdom 263.335 ms. Provider-load medians are respectively 18.245, 18.089, 85.785, 14.519 and 178.447 ms. The process includes the laboratory harness; provider loading is a separate phase. Neither means a flushed OS file cache.

### Framework and lifetime result

Every framework trial passes eight unchanged React workflows. All per-trial reports, individual test durations, stdout/stderr and worker memory are now retained, with the producer-resolution guard enabled.

| Pool      | RunDOM test ms | Happy DOM test ms | RunDOM process ms | Happy DOM process ms |
| --------- | -------------: | ----------------: | ----------------: | -------------------: |
| forks     |        104.796 |            97.204 |           439.545 |              425.609 |
| threads   |        102.211 |            97.446 |           419.643 |              406.274 |
| vmForks   |        105.100 |            99.499 |           432.138 |              439.724 |
| vmThreads |        103.100 |           100.099 |           418.735 |              425.400 |

RunDOM test work remains roughly 3–8% slower than Happy DOM across these pools. Process ordering varies by pool. The complete package goal is still active; the query microbenchmark gain is not a framework win. A multi-file worker-reuse matrix remains a separate required extension.

Whole-worker post-GC heap at 32 live windows is 38.36 MiB after versus 38.34 MiB before; closed-but-retained handles use 38.38 versus 38.36 MiB, and released references use 18.19 versus 18.17 MiB. Happy DOM is 150.47/33.66/24.94 MiB at those checkpoints; jsdom is 102.60/102.61/45.39 MiB. One/eight-window results remain in the summary. This fixture shows a small approximately 0.02 MiB increase, not a material retained-heap regression; it does not prove absence of leaks. RSS and external/native observations remain separate.

### Attribution and next optimization boundary

Equal 3 × 1,024-query allocation passes estimate 429,023,256 sampled bytes before and 3,430,208 after: approximately 136.4 KiB versus 1.09 KiB per query, including checked workload and phase bookkeeping. A longer after pass over 500,000 queries estimates approximately 0.99 KiB/query. These sampling estimates include collected objects and are not exact allocations or retained heap. Instrumented durations are not timing comparisons.

The remaining snapshot workload is dominated by rebuilding candidate indices: `createQueryIndex` contributes 501.61 ms sampled self time versus 757.52 ms timed work in its dedicated diagnostic pass. Index construction estimates 841.93 MiB of sampled allocation, with additional Set, split and map work. These are separate functions/measurements; inclusive costs must not be summed. Rebuilding all ID/tag/class buckets after each mutation is the next query boundary to change. Test deferred/adaptive index admission against repeated selectors, diverse selectors, miss-heavy searches, mutation batches, many roots and large trees; retain complete traversal as the correctness fallback.

The new role-query profile records 3,769 warm samples. `copyComputed` contributes 120.12 ms self time and `computedStyle` 60.10 ms versus 574.92 ms timed work. The allocation pass attributes approximately 573.59 MiB to `computedStyle`, 142.14 MiB to Map and 86.19 MiB to `copyComputed`. Fresh readonly views and completed-frame validation are the next CSS boundary, preserving snapshot isolation, borrowed receivers, stylesheet/CSSOM/media/inheritance and live state. Removing these self-time shares alone cannot explain a 3× overall role speedup.

These profiles favor fixing repeated TypeScript indexing and computed-view work before another Rust boundary. The separately measured Rust parser remains explicitly selected and slower than the TypeScript parser on prior matched end-to-end inputs; no new Rust speed claim is made here.

The final selected-corpus replay is **99.86466%** of reference-passing assertions, with pending variants, missing literal-input matches, shared harness failures and the pre-existing message/timer instability retained separately in [qualification](qualification.md). Release gates pass 1,399 owned tests on default and Rust paths.

### New evidence index

- Before cohort: /Users/barakchamo/Documents/dev/run-dom/.cache/performance-lab-eE4PQO.
- After cohort: /Users/barakchamo/Documents/dev/run-dom/.cache/performance-lab-K1XyKi.
- Matched read/event matrix: /Users/barakchamo/Documents/dev/run-dom/.cache/performance-lab-K1XyKi/comparison-kBuopf.
- Matched snapshot/mutation matrix: /Users/barakchamo/Documents/dev/run-dom/.cache/performance-lab-K1XyKi/comparison-9PlBpp.
- Matched lifecycle matrix: /Users/barakchamo/Documents/dev/run-dom/.cache/performance-lab-K1XyKi/comparison-cT08J4.
- Guarded framework cohort: /Users/barakchamo/Documents/dev/run-dom/.cache/framework-benchmark-jAwycq.
- Complete report, memory/profile paths, source identities and compatibility assessments: `.cache/qualification/collection-performance-summary.json`.
- Frozen runtime/source qualification: `.cache/qualification/collection-case-checkpoint-manifest.json`.

## Query admission and computed-view results, November 7

The next batch uses 31 scenarios and corrects the synchronous helper to retain a cumulative operation ordinal across batches. This matters for single-operation writes, selector rotation and multi-window reads. Both baseline and candidate were repacked with byte-identical corrected probes. The selected matched matrices contain **621 verified timing trials**, with nine rotated fresh processes per successful combination; 108 guarded framework trials and 36 CSS-active lifetime trials are separate. Failures are retained as screens, never silently removed or assigned equivalent-work speed ratios. Conditions remain shared-host: no certified overall speed claim.

Query admission now avoids constructing every ID/tag/class bucket for low-reuse roots. Non-ID searches traverse for two misses before admission; selectors whose every branch has an ID constraint retain eager indexing. Pending roots count against the fixed root limit. Index-budget eviction no longer clears separately bounded weak result vectors; actual mutations clear both. Generic deferral alone regressed selective mutation batches approximately 20% and was rejected in favor of this policy.

Computed-style internals enumerate private declaration storage rather than calling replaceable public `length`/`item`. This repairs a public override leaking the private cascade frame. Snapshots use direct metadata assignments on the existing prototype allocation, and native indexed iteration now matches reference Array iteration. Cold winner-resolution closures live behind the completed-frame cache-hit branch. An object-literal plus `setPrototypeOf` factory passed contracts but regressed role/style reads approximately 6% and was removed. Negative cohorts remain indexed by `.cache/qualification/query-style-rejected-experiments.json`.

| Scenario                  | Operations | Before ms | After ms | Happy DOM ms |  TurboDOM ms |     jsdom ms |
| ------------------------- | ---------: | --------: | -------: | -----------: | -----------: | -----------: |
| query-simple              |       8192 |     0.941 |    0.963 |        0.243 |        0.074 |       22.790 |
| query-all                 |       8192 |     3.502 |    3.529 |        0.330 |        0.069 |      220.614 |
| role-query                |       8192 |   110.817 |  105.072 |       35.676 |       27.911 |     3322.942 |
| style-read                |       8192 |    18.425 |   16.339 |        0.761 |        2.396 |        4.545 |
| events-dispatch           |       8192 |     7.925 |    8.005 |       18.808 |        3.731 |       12.973 |
| query-snapshot            |        256 |    71.635 |    9.771 | fails screen | fails screen |       39.785 |
| query-diverse             |        256 |     0.278 |    0.292 |        0.064 |        0.026 |        9.381 |
| query-batched-mutation    |        256 |     1.456 |    1.469 |       10.749 |        2.636 |       11.507 |
| query-all-iterate         |        256 |    12.312 |   12.386 |        5.530 | fails screen |       21.481 |
| style-snapshot            |        256 |     5.945 |    5.542 | fails screen | fails screen |       66.407 |
| style-inline-invalidation |        256 |     2.755 |    2.775 |       24.762 |        4.218 |       34.019 |
| style-rule-invalidation   |        256 |     1.744 |    1.593 | fails screen | fails screen |       28.279 |
| style-inheritance         |        256 |     7.277 |    7.334 |       21.284 | fails screen | fails screen |

Rows use 256 fixture rows/depth four. Query snapshots improve approximately 7.3-fold, warm roles approximately 5%, and repeated computed reads approximately 11% within this exploratory cohort. Other rows remain close or slightly slower. With 4,096 rows and 32 operations, snapshot work is 155.049 → 17.356 ms versus jsdom 74.048; diverse queries are 0.264 → 0.266 versus Happy DOM 21.606 and TurboDOM 4.287; batched writes are 2.506 → 2.505 versus Happy DOM 21.050 and TurboDOM 4.705. Larger-tree reuse is a materially different workload from small diverse queries; do not average their ratios.

Happy DOM returns the same live computed-style object in the reference probe; the stronger style-snapshot screen requires jsdom's fresh identity and retained earlier values. TurboDOM also fails that screen, fresh query snapshots and `item()` iteration. Repeated read rows still measure their narrower value contracts. Source inspection explains TurboDOM's packed parser output, lazy nodes, shared immutable parse LRU, lazy globals and versioned result caches in [the TurboDOM investigation](turbodom-performance.md), including the semantic boundaries of each technique.

### Framework attribution and remaining costs

| Pool      | RunDOM test ms | Happy DOM test ms | RunDOM process ms | Happy DOM process ms |
| --------- | -------------: | ----------------: | ----------------: | -------------------: |
| forks     |        103.973 |            97.156 |           436.556 |              422.960 |
| threads   |        104.556 |            98.502 |           423.026 |              406.377 |
| vmForks   |        105.200 |            99.162 |           431.826 |              439.049 |
| vmThreads |        101.400 |           100.824 |           417.195 |              424.213 |

RunDOM remains slower than Happy DOM on these eight-workflow test totals; the overall performance goal is not met. In the forks pool, the first pointer-click/focus workflow has a median of 23.690 ms versus Happy DOM 18.796, accounting for about 4.9 ms of the gap. Later workflow medians are mostly close: controlled input 17.140/16.921, textarea 25.322/24.856, checkbox 8.472/8.341, select 9.359/9.466, async effect 3.313/3.319, portal 6.615/6.667 and hydration 10.773/10.043. Profile real first interaction before assuming a warm style microbenchmark explains the whole gap. TurboDOM's framework compatibility requires its own checked integration; its microbenchmarks are not an eight-workflow framework result.

After full compatibility replay, separate per-workflow Inspector captures preserve all eight unchanged React assertions and the producer-resolution guard for RunDOM and Happy DOM. The first interaction samples 4.958 ms self time in RunDOM's CSS bundle and 4.625 in other RunDOM code, versus 4.582 in Happy DOM code; React contributes 7.833/7.126 and Testing Library 3.250/3.501. Inspector self time is 35.500/27.833 ms and remains excluded from workload interpretation. This single diagnostic supports investigating CSS first-use work, not a causal or timing-speed claim. Native config loading and diagnostic setup inside each consumer are required by the unchanged isolation guard. Two rejected external-config attempts remain archived. Raw profiles, checked test reports and module attribution are in `.cache/qualification/query-style-framework-profiles`; the driver is `query-style-framework-profile.mjs`.

The CSS-active lifetime fixture retains 32 live windows after computed reads. Median heap after work is 51.79 → 51.78 MiB, closed handles retained 51.79 → 51.78, and references released 29.94 → 29.93. Differences are approximately 0.01 MiB, without a material retained-heap improvement. Happy DOM is 161.94 / 34.20 / 25.45, TurboDOM 20.56 / 20.56 / 16.43 and jsdom 122.59 / 122.38 / 51.88 at the same checkpoints. TurboDOM adds nine lifetime trials after full correctness replay; the [investigation](turbodom-performance.md) records all window counts and interpretation limits. Whole-worker JS heap is distinct from external/native memory and RSS, which remain in raw reports.

Separate CPU diagnostics reduce snapshot `createQueryIndex` self time from 470.72 ms to no longer appearing among the leading functions: total instrumented phase work is 742.11 → 109.84 ms, with traversal/query/wrapping now dominant. Sampled allocation attributed to index construction falls from 845.1 MiB to no leading entry; authoritative traversal remains approximately 142 MiB. Instrumented times are diagnostic, not the timing comparison above.

Warm role CPU diagnostics show `copyComputed` self time 112.92 → 89.29 ms and `computedStyle` 62.13 → 50.30, with instrumented phase work 587.25 → 547.52. Separate allocation samples attribute `computedStyle` 580.3 → 403.0 MiB and `copyComputed` 85.3 → 79.3 MiB. Map, traversal, selector matching and fresh computed views remain substantial. These self/inclusive figures cannot be summed or read as retained heap. The hot path is TypeScript; another Rust boundary is not justified by these profiles alone.

Reference probes also reveal a compatibility boundary beyond the current selected-corpus score: jsdom hides CSS declaration implementation fields, exposes readonly indexed descriptors, and rejects `Reflect.preventExtensions`. Current direct cssstyle subclasses expose underscore storage and permit freezing. Existing tests for those behaviors must be corrected against reference evidence before a public-wrapper redesign. A private implementation/public WebIDL view split is the next substantial candidate for both compatibility and cheaper fresh snapshots; it is not implemented in this batch.

The frozen runtime completes 5,460 selected WPT variants with **zero assertion regressions against the preceding checkpoint**, zero missing completion records and no deadline exclusions. It retains **99.86466% of reference-passing selected assertions**: 195,061 reference passes, 251 matched failures and 13 missing passes. All 5,138 pending variants, 207 harness failures and additional/shared assertions remain separately visible. This is not whole-platform completeness. Owned tests pass 1,405 cases on both parser paths; API 634, packed types and all four default/native Vitest pools pass. See [qualification](qualification.md) for source identity and raw accounting.

### Evidence index

- Corrected baseline and chosen cohort: `.cache/qualification/query-style-chosen-{before,prepared}.json`.
- Timing matrices: `.cache/qualification/query-style-{reads,snapshots,invalidation,scaling}.json`.
- Guarded framework cohort: `.cache/framework-benchmark-8kFMw1`.
- CSS-active lifetime reports: `.cache/qualification/query-style-{before,after}-memory-{1,8,32}.json`.
- CPU/allocation reports: `.cache/qualification/query-style-{before,after}-{role-query,query-snapshot}-{cpu,allocation}.json`.
- Completed measurement status: `.cache/qualification/query-style-measurement-status.json`.
- Frozen runtime provenance: `.cache/qualification/query-style-checkpoint-manifest.json`.
- Full assertion comparison and prior-runtime delta: `.cache/qualification/query-style-checkpoint-full/{assertion-comparison,delta}.json`.

## Combined CSS boundary and construction optimization, 7 November 2026

The final mOY91u runtime reduces matched warm role work from 103.276 to 61.763 ms, styled reads 16.048 to 14.302, repeated eight-document parsing 12.147 to 8.540, and empty eight-window construction 7.922 to 6.513. Nine rotated processes produce 162 verified trials with no probe failures. Happy DOM records 35.903 / 0.759 / 25.696 / 13.775 respectively; TurboDOM records 27.541 / 2.430 / 0.294 / 0.069. These shared-host observations support a workload-specific approximately 3× repeated-parse advantage over Happy DOM, not an overall performance win.

The changes separate public CSS declaration views from private state, safely reuse positively proven unstyled frames, remove repeated wrapper-kind validation, expand a bounded inactive parse-template cache and replace repeated Window prototype teardown with bulk global installation. Public CSS accessor identities remain per window; a shared-accessor experiment was rejected. Mutation, adoption, live state and fresh-view contracts have explicit regression coverage.

Real Vitest remains behind Happy DOM: forks test time 103.290 versus 97.500 ms and process time 437.913 versus 420.210. CSS-active 32-window retained heap increases from 51.78 to 62.10 MiB, with released heap 29.93 to 30.93. The compatibility fix has a memory cost; the optimization batch does not erase it. See [measured opportunities](optimization-opportunities.md) for all provider results, exact evidence and the next profile-driven priorities. Full selected-WPT qualification remains pending at this recording.

## Delivered page-repaired build: exact timing and completed qualification

Final runtime: `.cache/performance-lab-z2miUa`, byte-verified against `methodical-page-checkpoint-build`. Timings run only after full correctness finishes: nine rotated processes per scenario/variant, five measured batches, 162 verified trials, zero failed probes, shared-host conditions.

| Warm work                                | Previous RunDOM ms | Delivered RunDOM ms | Happy DOM ms | TurboDOM ms |
| ---------------------------------------- | -----------------: | ------------------: | -----------: | ----------: |
| Role queries, 8,192 operations           |            105.047 |              61.176 |       35.703 |      27.862 |
| Styled reads, 8,192 operations           |             16.418 |              14.494 |        0.758 |       2.428 |
| Repeated HTML parsing, eight documents   |             11.632 |               8.506 |       26.046 |       0.288 |
| Empty window create/close, eight windows |              7.882 |               6.340 |       14.615 |       0.070 |

Work reductions against the previous build are 41.8%, 11.7%, 26.9% and 19.6%, respectively. Repeated parsing is an observed 3.06× faster than Happy DOM in this fixture; empty construction is 2.31×. TurboDOM remains far ahead at construction, and leads both read scenarios. These are not certified overall speed ratios. Exact reports: `methodical-page-{reads,construction}.json`.

The delivered build completes all 5,460 selected executed WPT variants with zero matched assertion regressions against the preceding checkpoint and 41 matched improvements. Reference-passing selected parity is 99.86517038%, with 250 matched failures and 13 unmatched passes out of 195,061 reference passes. All 5,138 pending variants, 208 harness/exception failures and unmatched literal-port assertion names remain visible in [qualification](qualification.md). One additional exception record repeats an already failing referrer assertion; it is not removed from the count. The repository gate and both parser paths pass 1,423 owned cases; packed API/types/all four Vitest pools also pass.

The earlier mOY91u framework result remains about 6% behind Happy DOM in forks test time and its 32-window retained heap is about 10 MiB above the former qualified build. Those measurements precede the page-only repair and are not byte-identical delivered-build measurements. The overall framework-performance and memory goals remain unmet. No new Rust speedup is claimed.

## Qualified static-author/native ownership follow-up

The delivered FleHh7 build reduces the checked styled-read batch from 14.495 to 2.308 ms and sampled allocation from 331.52 to 7.48 MiB across 40,960 reads. The native ownership change reduces large unique parsing from 47.104 to 41.883 ms per four documents. Role work, cold CSS initialization and retained heap remain unresolved. The eight-entry parse-cache experiment was measured and rejected for its unique-input throughput cost.

The final corpus retains 99.86517038% of reference-passing selected assertions with zero matched regressions; all 1,429 owned tests pass on both parsers. The current checked forks framework run remains approximately 4.3% behind Happy DOM. TurboDOM's official adapter fails checkbox activation in forks/threads and lacks VM setup in this pinned Vitest 5 integration, so its framework speed is not reported. The complete current matrix, allocation/pool/lifetime results, negative experiments, native system stack profile and evidence index live in [optimization opportunities](optimization-opportunities.md#static-author-frames-and-native-ownership-qualified-follow-up).

## Qualified realm and fragment checkpoint, 7 November 2026

Frozen runtime XqAsuq, paired against Mz6eAI carrying the qualified uVC4wn runtime and the same expanded scenario rig. The matrix contains 1,269 accepted primary timing trials plus 180 clean/seeded-history trials; all accepted combinations use nine rotated fresh processes. Conditions remain shared-host exploratory. Semantic competitor failures stay excluded: TurboDOM complete query iteration and Happy DOM/TurboDOM interaction state.

| 65,534 siblings, warm single-operation batch | Before ms | Candidate ms | Happy DOM ms | TurboDOM ms | jsdom ms |
| -------------------------------------------- | --------: | -----------: | -----------: | ----------: | -------: |
| Table replacement                            |   821.811 |      354.420 |    12707.888 |     616.354 | 1122.995 |
| List replacement                             |   705.910 |      365.862 |     5680.614 |     474.263 |  731.003 |
| Table replacement plus every-row reads       |   852.076 |      393.961 |    12442.290 |     611.910 | 1164.207 |
| List replacement plus every-row reads        |   729.368 |      268.931 |     5760.612 |     487.247 |  808.399 |

Ratios apply only within each row/report. First use and complete process are recorded separately in raw evidence. Small table batches regress: 256 rows/eight writes increase from 11.217 to 13.055 ms. Other construction, queries, roles, mutations, events and long-list controls stay substantially closer; this is not an overall package speed ratio. The next direct base-Parser variant is an experiment, not part of this qualified runtime.

Forced-GC heap is essentially unchanged: 64 live windows after work 53.80→53.83 MiB, closed handles 52.94→52.97, released references 18.48→18.50. Eight large styled windows after work 83.58→83.60 MiB and released 35.91→35.92. Wide table full-read after-work heap is 109.30→109.32 MiB and released 41.70→41.72. These three-process diagnostics establish no material memory improvement.

All eight React workflows pass across four Vitest pools and nine rounds. Forks complete-process medians: RunDOM 697.993 ms, Happy DOM 668.483, jsdom 953.369; worker test medians 145.109/119.561/198.501 ms. RunDOM still trails Happy DOM on this framework workload. TurboDOM fails all four compatibility screens and has no accepted framework score.

Compatibility outcomes, exact source/runtime hashes and raw evidence pointers are in `.cache/qualification/fragment-final-manifest.json`; the [fragment decision](fragment-handoff-optimization-plan.md) records the handoff/realm contracts. The subsequent native/query allocation prototype is not included in these claims.

## Material-gap sweep, November 8

The ranked experiments, rejected approaches and combined qualification are tracked in [optimization sweep results](optimization-exhaustion-results.md). Earlier tables remain historical measurements of their sealed checkpoints.

The subsequent [absolute-gap batch](absolute-gap-results.md) attributes cold loading and dense/native work against sealed 3xApqF and records the final measured changes separately.

## Cold role and full traversal batch

The qualified CSS compilation-data candidate reduces the first role query by 20.95–25.09 ms across two independent nine-round comparisons. Confirmation: RunDOM 85.606 → 60.512 ms, TurboDOM 4.215 ms. Warm full traversal of four 4,096-row documents stays flat at 20.341 ms versus TurboDOM 4.639 ms. An explicit guard tradeoff is +0.760 ms for 256 inline CSS writes. See [the complete results](role-traversal-optimization-results.md) for stage attribution, compatibility scope, memory, artifact provenance and rejected candidates.
