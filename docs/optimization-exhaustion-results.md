# Optimization sweep results

This finite sweep evaluates eight areas and twelve timed variants against sealed deMMKD, only targeting existing workloads with deficits above 5 ms. Nine rotated fresh processes and nine warm batches per accepted provider use unchanged canonical dimensions. Builds, tests, timings, profiles and memory workers run in separate phases. Conditions are shared-host exploratory; there is no certified aggregate speed ratio.

## Decisions

| Area                     | Most promising retained mechanism                                                                                                 | Rejected evidence                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID admission             | 64-node prefix probe, depth-bounded scanning and one weak first-match hint before full indexing                                   | A threshold-only change saved less and slightly worsened batched mutations.                                                                                                 |
| TypeScript parse copying | Eager private-template copier with reusable depth frames and fresh attributes/nodes                                               | Public cloning remains unchanged.                                                                                                                                           |
| Attribute ownership      | No retained change                                                                                                                | Per-element COW regressed traversal 7%, updates 4.6%, and unique TypeScript input 3.9%; native results were nearly flat.                                                    |
| Native materialization   | Retain a never-exposed materialized template after the second actual parse, then copy independent trees                           | A generic bulk arena builder saved only 0.36–0.80 ms and added an unnecessary boundary surface.                                                                             |
| Native validation        | No retained change                                                                                                                | Storage-proven internal reads saved 0.04 ms in the existing unique-input batch. All malformed-storage checks remained intact.                                               |
| Window construction      | No retained change                                                                                                                | Eighteen leaf interfaces in a separate factory left eight-window construction unchanged/slightly slower.                                                                    |
| Role/CSS publication     | Split closure-creating selector compilation from shared hits; bind immutable CSS publication metadata once, returning fresh views | Selector sampled allocation hotspot (~51 MB) disappeared; its timing was noisy/flat. Scalar CSS reads barely changed role queries and regressed inline writes 7.4%.         |
| Wrapper dispatch         | No retained change                                                                                                                | An 81-tag canonical constructor map changed traversal by under 1%, updates and startup were flat/slightly slower. Ordinary construction and public identity were preserved. |

The native template changes the memory balance: it replaces retained native arenas with private JavaScript trees. The existing eight-key, 1,048,576-UTF-16-unit/32,768-node per-input, aggregate 4,194,304-UTF-16-unit/131,072-node limits remain. Native first occurrences still retain only their source key; a second actual native parse is required for admission. Public parser calls remain uncached. Final memory and correctness results are recorded below when qualification completes.

## Isolated timings

All values are milliseconds per original workload batch. Different rows were measured at different times; use each row's matched before/after, not cross-row arithmetic. Source/cache admission and first-use figures are retained in the machine-readable report.

| Variant           | Scenario                  | Backend      | Before ms | After ms | TurboDOM ms |
| ----------------- | ------------------------- | ------------ | --------: | -------: | ----------: |
| id16              | parse-html-sparse         | run-dom      |    15.321 |   14.257 |       4.368 |
| id16              | query-batched-mutation    | run-dom      |    33.725 |   33.968 |      25.851 |
| id-prefix         | parse-html-sparse         | run-dom      |    15.003 |   12.273 |       3.944 |
| id-prefix         | query-batched-mutation    | run-dom      |    33.499 |   32.463 |      25.584 |
| template-copy     | parse-html-sparse         | run-dom      |    15.038 |   12.854 |       3.874 |
| template-copy     | parse-html                | run-dom      |    14.567 |   13.663 |       3.611 |
| template-copy     | parse-html-traverse       | run-dom      |    22.073 |   20.374 |       4.555 |
| template-copy     | parse-html-update         | run-dom      |    16.158 |   15.790 |       7.559 |
| template-copy     | parse-html-rotate         | run-dom      |    13.864 |   13.616 |       3.406 |
| role-cold         | role-query                | run-dom      |    22.043 |   22.792 |      10.672 |
| role-cold         | query-batched-mutation    | run-dom      |    30.011 |   29.363 |      23.606 |
| cow-attributes    | parse-html-sparse         | run-dom      |    14.924 |   13.573 |       3.890 |
| cow-attributes    | parse-html                | run-dom      |    14.552 |   13.743 |       3.681 |
| cow-attributes    | parse-html-traverse       | run-dom      |    19.164 |   20.498 |       4.027 |
| cow-attributes    | parse-html-update         | run-dom      |    16.830 |   17.596 |       8.196 |
| cow-attributes    | parse-html-rotate         | run-dom      |    14.912 |   14.258 |       3.704 |
| cow-attributes    | parse-html-unique         | run-dom      |    34.738 |   36.099 |      33.983 |
| cow-attributes    | parse-html-sparse         | run-dom-rust |    14.487 |   14.886 |       3.866 |
| cow-attributes    | parse-html-traverse       | run-dom-rust |    21.238 |   21.573 |       4.070 |
| cow-attributes    | parse-html-update         | run-dom-rust |    19.395 |   18.839 |       7.888 |
| cow-attributes    | parse-html-unique         | run-dom-rust |    45.526 |   45.504 |      33.794 |
| native-validation | parse-html-unique         | run-dom-rust |    44.698 |   44.658 |      33.256 |
| native-bulk       | parse-html-unique         | run-dom-rust |    44.608 |   43.942 |      31.501 |
| native-bulk       | parse-html-traverse       | run-dom-rust |    19.657 |   19.299 |       3.764 |
| native-bulk       | parse-html-update         | run-dom-rust |    18.093 |   17.290 |       7.540 |
| window-leaves     | windows-create-close      | run-dom      |     6.859 |    6.934 |       0.072 |
| window-leaves     | parse-html-traverse       | run-dom      |    17.789 |   17.706 |       3.746 |
| css-publisher     | role-query                | run-dom      |    23.855 |   21.463 |      10.771 |
| css-publisher     | query-batched-mutation    | run-dom      |    30.428 |   30.054 |      23.544 |
| role-cold         | role-query                | run-dom      |    23.159 |   22.660 |      11.143 |
| native-template   | parse-html-sparse         | run-dom-rust |    14.635 |   13.053 |       3.885 |
| native-template   | parse-html                | run-dom-rust |    16.632 |   14.273 |       3.674 |
| native-template   | parse-html-traverse       | run-dom-rust |    21.181 |   19.135 |       4.054 |
| native-template   | parse-html-update         | run-dom-rust |    19.198 |   16.501 |       8.192 |
| native-template   | parse-html-rotate         | run-dom-rust |    16.769 |   13.718 |       3.583 |
| native-template   | parse-html-unique         | run-dom-rust |    44.796 |   45.116 |      32.286 |
| css-scalars       | role-query                | run-dom      |    22.128 |   22.087 |      10.635 |
| css-scalars       | style-read                | run-dom      |     2.592 |    2.164 |       3.336 |
| css-scalars       | style-inline-invalidation | run-dom      |     5.020 |    5.390 |       5.998 |
| wrapper-dispatch  | parse-html-traverse       | run-dom      |    18.212 |   18.041 |       3.827 |
| wrapper-dispatch  | parse-html-update         | run-dom      |    16.155 |   16.185 |       7.761 |
| wrapper-dispatch  | windows-create-close      | run-dom      |     6.909 |    6.936 |       0.070 |

## Remaining architectural costs

TurboDOM 0.7.1 caches immutable packed SoA buffers, reuses unpacked typed-array views, inflates wrappers lazily, and uses lazy/shared interfaces. RunDOM still creates independent canonical mutable parse5 trees and per-window public interfaces. Dense traversal then pays for public wrapper ownership and native structured-clone rejection. The experiments above eliminate several attractive but incorrect cost hypotheses; they do not remove these architectural costs or close all TurboDOM gaps.

Both native parsers use html5ever (RunDOM 0.40.1, pinned TurboDOM source 0.39). The Turbo CPU capture labels a large native interval `custom_gc`; that label alone does not establish its exact kernel attribution or prove that either tokenizer is faster. Native full-window cost, checked boundary reads, materialization and first-occurrence kernel time remain separate evidence.

## Evidence

The complete experiment index is `.cache/qualification/optimization-sweep-experiment-results.json`; every row links its raw comparison report, exact dimensions, warm median/MAD/p95, first-use phases and verified operation counts. Frozen source stages and cohort manifests live under `.cache/qualification/optimization-sweep/` and `optimization-sweep-*-prepared.json`. Rejected source is retained there and removed from production.

Infrastructure retries are preserved: the first native-validation metadata stream mixed stderr with JSON and was recovered from its unchanged JSON suffix; a staged native-template build initially lacked its baseline window file; one comparison used an invalid scenario name and failed before trials, then resumed with the canonical `windows-create-close` name and eight operations. These are not accepted performance trials.

## Combined qualification

The retained source is frozen in cohort `3xApqF`, compared with sealed baseline `deMMKD`. All figures below are milliseconds per unchanged canonical workload batch. The completed matrix contains **567 verified timing trials**; role confirmation adds 27. The 12 isolated variants produced 1,134 verified comparative trials. Twelve diagnostic captures, 72 fresh packed framework timing trials and 24 forced-GC memory/lifetime processes ran in separate phases. No failed provider is assigned an equivalent-work speed ratio.

| Scenario                  | Rows × operations | TS before → after | Rust before → after |          TurboDOM |
| ------------------------- | ----------------: | ----------------: | ------------------: | ----------------: |
| parse-html-sparse         |          4096 × 4 |    12.790 → 8.980 |      14.386 → 9.422 |             3.605 |
| parse-html                |          4096 × 4 |   14.283 → 13.480 |     16.483 → 14.119 |             3.466 |
| parse-html-traverse       |          4096 × 4 |   18.916 → 18.175 |     21.064 → 18.336 |             4.020 |
| parse-html-update         |          4096 × 4 |   16.404 → 15.824 |     19.071 → 15.804 |             7.760 |
| parse-html-rotate         |          4096 × 4 |   14.002 → 13.635 |     16.328 → 13.278 |             3.439 |
| parse-html-unique         |          4096 × 4 |   33.806 → 33.097 |     44.488 → 44.640 |            33.484 |
| windows-create-close      |           256 × 8 |     6.808 → 6.939 |                   — |             0.097 |
| role-query                |        256 × 2048 |   21.729 → 22.327 |                   — |            10.853 |
| query-batched-mutation    |         8192 × 64 |   31.033 → 30.029 |                   — |            23.688 |
| parse-html                |           256 × 8 |     8.721 → 8.498 |       9.213 → 8.592 |             0.609 |
| parse-html-traverse       |           256 × 8 |     9.553 → 9.506 |      10.410 → 9.377 |             0.769 |
| parse-html-rotate         |           256 × 8 |     9.017 → 8.692 |       9.664 → 8.793 |             0.809 |
| style-read                |        256 × 8192 |     2.604 → 2.165 |                   — |             3.321 |
| style-snapshot            |         256 × 256 |    9.875 → 10.091 |                   — | not screened here |
| style-inline-invalidation |         256 × 256 |     5.418 → 4.989 |                   — | not screened here |
| style-inheritance         |         256 × 256 |   14.550 → 14.391 |                   — | not screened here |

The empty-window row uses eight windows and ignores the fixture-row dimension. Unique TypeScript parsing, existing winning/failed/smaller scenarios and style mutations are cost-shifting guards, not new optimization targets. Rust unique parsing remains an eligible unresolved gap. Warm parsing gains do not establish a faster tokenizer.

Sparse parsing improved approximately **30% in TypeScript and 35% in Rust**. Rust repeated/count, traversal, update and rotation improved approximately 13–19%; TypeScript dense cases improved much less. Empty-window construction and first-occurrence Rust parsing remain unresolved. The combined role row did not reproduce the isolated publisher's 10% timing improvement; the independent confirmation was 22.956 → 22.625 ms (TurboDOM 11.040), so no meaningful role-query CPU improvement is claimed. Diagnostic role-query sampled allocations fell from **190.13 to 143.39 MiB**, approximately 25%, over nine warm batches. The selector allocation hotspot disappeared. These are sampled allocations including collected objects, not retained heap; Inspector instrumentation frames are excluded from workload CPU summaries.

Cold use remains materially different: one first sparse document was TS 26.09 → 24.41 ms, Rust 58.58 → 57.97 ms, versus TurboDOM 15.22 ms, after provider-load medians near 25.7/20.0 ms. One first full-traversal document was TS 29.43 → 30.18 ms, Rust 62.55 → 62.58 ms, versus TurboDOM 16.64 ms. Each first-use phase performs one operation; the warm four-document rows perform four. The rig records those phases separately. Native loader/schema/first-parse cost is not hidden in a warmed throughput claim.

### Memory and real framework work

All 24 fresh memory workers verified that closed-and-released Windows collect and held closed documents remain usable. Three rotated process pairs per backend measure whole-worker growth after forced GC; they include JIT and first-use module initialization, so they are not pure object-size measurements.

For four warm native sources, heap growth from the loaded checkpoint was 6.50 → 16.89 MiB, while external storage was 2.94 → 0 MiB. This intentionally trades about 10.4 MiB of heap for releasing about 2.9 MiB of arena storage. With eight live Windows, heap growth was 31.14 → 36.04 MiB, external 2.94 → 0 MiB: roughly 2 MiB net additional measured storage. After eviction and release of caller-owned source strings, native heap growth was 6.98 → 6.99 MiB with zero arena storage; the cache did not grow without bound. TypeScript warm/live growth was essentially unchanged. Private copies can share immutable string values while retaining independent mutable node/attribute records.

All 72 fresh baseline/candidate React/Vitest timing trials passed ten identical tests each, across forks, threads, vmForks and vmThreads, with runner/fs caches disabled. Test-time medians were respectively 491.19 → 493.09, 597.81 → 596.11, 487.90 → 482.60 and 489.80 → 482.20 ms: broadly flat, with no claimed overall framework speed ratio. The two 2,048-row interaction/state stress tests passed in every run. Happy DOM and TurboDOM were not requalified for these strict framework fixtures; their unchanged pinned versions failed the previous sealed compatibility screens. Canonical DOM scenarios above do include accepted TurboDOM work.

### Compatibility

Fresh release gates passed 1,540 facade tests under each default/native selection, 11 DOM tests, 46 TypeScript parser tests plus two Rust codec tests, both 634-case API runs, strict packed types and all four packed Vitest pools under both parsers. The native corpus made 3,464 actual calls: 3,267 passes, 3,219 reference passes, 48 improvements, 197 shared failures, 206 fragment-context exclusions, and zero matched/boundary regressions.

The complete selected replay preserved 10,598 selected fixtures, 5,460 executions and 5,138 pending fixtures, with no missing/duplicate executions or deadline exclusions. It recorded 248,342 assertions and 215,815 passes, with 206 existing harness failures. Every assertion status matched sealed deMMKD. No other assertion, harness, fixture-selection or expectation-policy changes were accepted. Local replay retained 228 structured records and 2,752 assertions (2,750 passes); all four legacy suites retained their named outcomes. These are selected-corpus parity results, not a claim of 99.8% of all WPT.

### Final evidence

`.cache/qualification/optimization-sweep-final-derived-results.json` links the full matrix, role confirmation, diagnostic captures, framework report, memory trials, gate statuses and assertion deltas. `.cache/qualification/optimization-sweep-final-candidate-prepared.json` owns the frozen source/runtime digests; `.cache/qualification/optimization-sweep/final-source-stage` preserves exactly that source. Final sealed archives and post-documentation hashes are recorded in `optimization-sweep-final-sealed-manifest.json`. Rejected candidates remain outside production. The TypeScript parser remains the default, and no public jsdom option or parser API was added.
