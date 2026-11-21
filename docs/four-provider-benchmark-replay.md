# Four-provider benchmark replay

November 13, 2026. Node 24.20.0 on an Apple M4 Mac. The isolated package consumers used RunDOM 0.0.1 with its default TypeScript parser, jsdom 30.1.3, Happy DOM 21.0.4 and TurboDOM 0.7.1. Upstream applications kept their locked stock jsdom versions. RunDOM's three tarball hashes matched the previously qualified artifact and the independently packed React fixture. Benchmark workers ran serially on a shared host. This report uses observed medians and gives small differences limited weight. [Cohort manifest](../.cache/four-provider-replay/cohort.json), [Upstream revisions](../.cache/four-provider-replay/upstream-manifest.json)

## DOM workload completeness

| Provider  | Default scenarios completed | Screen failures | Verified default timing trials | Dense scenarios completed | Verified live-memory trials |
| --------- | --------------------------: | --------------: | -----------------------------: | ------------------------: | --------------------------: |
| RunDOM    |                       44/44 |               0 |                            396 |                       6/6 |                       45/45 |
| jsdom     |                       43/44 |               1 |                            387 |                       6/6 |                       45/45 |
| Happy DOM |                       38/44 |               6 |                            342 |                       6/6 |                       45/45 |
| TurboDOM  |                       36/44 |               8 |                            324 |                       6/6 |                       45/45 |

The default matrix used 256 rows, eight operations for construction, parse, clone and serialization, and 64 for the other scenarios. The dense matrix used 4,096 rows and four operations. Each successful timing combination has nine verified processes with five measured batches per process. Each memory combination has five fresh processes. The initial default-dimensions invocation was stopped after revealing the harness would schedule 512 operations on several parse workloads. The published matrix includes all scenarios with explicit batch sizes. [All stage and pass tables](../.cache/four-provider-replay/lab-report.md), [Default invocation log](../.cache/four-provider-replay/default-dimensions-aborted.log)

The jsdom screen failed live custom-property inheritance. Happy DOM failed six checks covering static query or style snapshots, interaction state, event semantics and CSSOM invalidation. TurboDOM additionally failed subtree cloning because the clone lacked `isEqualNode` and NodeList iteration because the result lacked `item()`. Both explicit jsdom script modes completed all three selected scenarios on RunDOM and jsdom. The Happy DOM and TurboDOM adapters reported that the jsdom script-mode contract is unavailable. [Screen details and scripts](../.cache/four-provider-replay/lab-report.md)

## Stage timings

Milliseconds per fresh process or batch, as labeled. Load is measured after the harness starts. Setup covers initial fixtures and workload dependencies. Warmup includes the designated warmup batches. Total is measured through verified worker exit and includes the Node process, harness, and timing outside the named stages. Stage medians come from independent distributions.

| Empty Window, eight operations per warm batch |   Load | Setup | First use | Warmup | Warm batch | Close |  Total |
| --------------------------------------------- | -----: | ----: | --------: | -----: | ---------: | ----: | -----: |
| RunDOM                                        |  12.45 |  0.31 |      1.94 |  30.51 |       4.98 |  0.05 | 157.33 |
| jsdom                                         | 183.50 |  0.30 |     27.97 |  61.81 |      12.11 |  0.05 | 434.73 |
| Happy DOM                                     |  87.73 |  0.31 |      4.12 |  53.71 |      13.30 |  0.07 | 296.39 |
| TurboDOM                                      |  14.85 |  0.30 |      1.81 |   1.27 |       0.07 |  0.02 | 103.04 |

| Workload                  | Metric     | RunDOM |    jsdom | Happy DOM | TurboDOM |
| ------------------------- | ---------- | -----: | -------: | --------: | -------: |
| Dense parse and traverse  | Warm batch |  11.83 |   137.72 |    225.65 |     2.70 |
| Dense parse and traverse  | Total      | 247.42 | 1,531.72 |  2,122.64 |   147.25 |
| Dense list reconciliation | Warm batch |   1.23 |     5.18 |      7.74 |     3.86 |
| Dense list reconciliation | Total      | 129.68 |   405.31 |    330.34 |   141.88 |
| Role query, 64 operations | First use  |   8.38 |    32.22 |      3.34 |     2.57 |
| Role query, 64 operations | Warm batch |   1.10 |    28.00 |      0.68 |     0.68 |
| Role query, 64 operations | Total      | 144.62 |   571.51 |    220.06 |   130.14 |
| First computed-style read | First use  |  23.34 |    26.20 |      2.88 |     1.90 |

The 35 default scenarios that all four completed sum to 5.818 s for RunDOM, 17.721 s for jsdom, 11.468 s for Happy DOM and 5.622 s for TurboDOM, using one process median per scenario. RunDOM had lower total medians than jsdom on all 43 pairwise matches, Happy DOM on all 38, and TurboDOM on 6 of 36. The six dense scenarios completed on all four providers. The sum of their process medians was 1.448 s for RunDOM, 7.617 s for jsdom, 10.303 s for Happy DOM and 1.073 s for TurboDOM. The totals weight each scenario once. [Complete timing and pairwise loss tables](../.cache/four-provider-replay/lab-report.md)

## Retained memory

MiB after forced GC. Live samples retain all 32 Windows, each with 256 rows. Released samples drop the workload's Window references. The repeated traversal row creates and closes its documents during work.

| Workload and checkpoint                 | Metric  | RunDOM | jsdom | Happy DOM | TurboDOM |
| --------------------------------------- | ------- | -----: | ----: | --------: | -------: |
| 32 live Windows                         | JS heap |   37.9 | 102.7 |     150.5 |     18.0 |
| 32 live Windows                         | RSS     |  160.6 | 322.8 |     370.3 |    107.5 |
| 32 live styled Windows                  | JS heap |   65.4 | 122.5 |     153.5 |     20.5 |
| 32 live styled Windows                  | RSS     |  587.0 | 344.3 |     373.7 |    117.5 |
| After releasing styled Windows          | JS heap |   32.1 |  51.9 |      25.5 |     16.5 |
| After releasing styled Windows          | RSS     |  587.1 | 338.2 |     389.6 |    117.5 |
| Repeated parse and traverse, after work | RSS     |  324.6 | 729.5 |     255.4 |    115.4 |

Styled Window residency is the biggest memory loss. RunDOM's JS heap drops by 33.3 MiB after releasing the styled Windows, and RSS remains near 587 MiB. Live object retention accounts for only part of the footprint. Earlier allocation profiling points to CSS initialization and temporary cascade storage, and the RSS samples alone cannot identify how much each allocator or runtime region retains. [All memory checkpoints at 1, 8 and 32 Windows](../.cache/four-provider-replay/lab-report.md#retained-memory)

## Upstream workloads

The table reports medians of three serial fresh processes per provider on identical passing test identities. Entries are total seconds / summed test milliseconds / peak RSS MiB. The linked results also give environment, setup, transform, import or collection, and other stages where the upstream runner emits them. Each full upstream selection was screened independently before filtering.

| Matched selection                | Tests |              RunDOM |               jsdom |           Happy DOM |          TurboDOM |
| -------------------------------- | ----: | ------------------: | ------------------: | ------------------: | ----------------: |
| Vue runtime-dom                  |   159 |   2.191 / 233 / 319 |   5.057 / 199 / 472 |   2.884 / 160 / 330 | 1.892 / 158 / 269 |
| Ant Design                       |   116 | 5.654 / 1,550 / 655 | 6.323 / 1,177 / 609 |   5.351 / 899 / 587 | 4.603 / 809 / 563 |
| Material UI Button and TextField |   118 |   2.236 / 566 / 308 |   2.569 / 697 / 309 |   2.075 / 428 / 312 | 1.970 / 387 / 310 |
| Svelte runes shard               |   561 | 5.683 / 4,531 / 403 | 6.015 / 4,721 / 340 | 5.769 / 4,570 / 366 |                 — |
| Svelte motion                    |     8 |     0.918 / 2 / 185 |     1.021 / 2 / 186 |     0.969 / 2 / 185 |                 — |
| Next.js example                  |     5 |    1.100 / 48 / 167 |   1.625 / 117 / 153 |    1.359 / 44 / 120 |  0.972 / 37 / 116 |
| freeCodeCamp Flash and CTA       |     4 |    1.144 / 48 / 200 |    1.314 / 79 / 186 |    1.209 / 39 / 178 |  0.996 / 32 / 153 |
| Supabase UI                      |    80 |   4.326 / 630 / 223 | 7.524 / 1,498 / 309 |   4.630 / 485 / 177 | 3.565 / 510 / 159 |

RunDOM and jsdom matched the full Vue runtime-dom, selected Ant Design and selected Material UI screens with 833 passes and 40 skips. Broad Svelte had 6,102 passes on jsdom, 6,012 on RunDOM and 5,823 on Happy DOM, with 34 skips each. TurboDOM failed before collecting Svelte tests because the environment did not define `Window`. In Material UI's full screen, TurboDOM passed 181 of 469 collected cases. Two cases failed again when 161 common passes were rerun together. The 118-case row uses the stable Button/TextField selection. [Full coverage and runner stages](../.cache/four-provider-replay/framework-report.md), [Raw upstream results](../.cache/four-provider-replay/upstream/results.json)

On the ten-workflow packed React fixture, RunDOM and jsdom passed all tests in each of four Vitest pools. RunDOM wall time ranged from 0.768 to 0.848 s by pool versus 1.085 to 1.396 s for jsdom. Happy DOM passed 9/10 in every pool. TurboDOM passed 8/10 in forks and threads, and collected zero tests in both VM pools. RunDOM also passed 64 React CSS/DOM tests, one Drone test and eight Scully tests in their existing Jest selections. Scully used the same teardown guard for both measured providers. [Packed React](../.cache/four-provider-replay/react-vitest.json), [Jest selections](../.cache/four-provider-replay/jest/jest-timing-results.json), [Scully](../.cache/four-provider-replay/jest/scully-final-results.json)

The separate eight-workflow React fixture passed on RunDOM, jsdom and Happy DOM in all four pools. RunDOM's process medians ranged from 0.404 to 0.460 s, Happy DOM's from 0.426 to 0.440 s and jsdom's from 0.600 to 0.614 s. RunDOM was faster than Happy DOM in forks and threads, slower in VM forks, and effectively tied in VM threads. Happy DOM used 35–55 MiB less post-suite worker RSS in every pool. TurboDOM passed 7/8 in forks and threads and collected zero in both VM pools. [Eight-workflow raw results](../.cache/four-provider-replay/react-standard.json)

The broader three-provider matches kept the same ordering. Across 128 Ant Design cases, total time was 6.294 s for RunDOM, 7.244 s for jsdom and 5.805 s for Happy DOM. Across 423 Material UI cases, the corresponding times were 8.604, 9.960 and 7.841 s. Material UI peak RSS was 357, 398 and 453 MiB. Across 251 Vue cases, RunDOM took 2.903 s, jsdom 6.484 s and Happy DOM 3.712 s. [Broader selections](../.cache/four-provider-replay/framework-report.md#broader-three-provider-selections)

## Remaining performance gaps

- **Empty Window assembly and repeated parsing.** TurboDOM loads slightly later and still exits the empty-Window benchmark about 54 ms earlier. Dense traversal costs RunDOM another 9.12 ms per batch and 100 ms per process. Previous profiles attribute the gap to canonical mutable tree copying, per-Window interface setup and wrapper allocation. Dense unique parsing has a smaller warm gap of 2.71 ms per batch. [Timing and attribution](../.cache/four-provider-replay/lab-report.md)
- **First authored CSS read and role queries.** RunDOM's first computed-style read is about 20 ms slower than Happy DOM and 21 ms slower than TurboDOM. Warm role queries are about 0.42 ms slower than either on 64 queries. The matched Ant Design test bodies cost RunDOM 373 ms more than jsdom, 651 ms more than Happy DOM and 741 ms more than TurboDOM. Material UI trails Happy DOM and TurboDOM even though it uses comparable peak RSS. Prior profiles locate inherited theme expansion in Ant Design and repeated author-rule evaluation in Material UI. The 64-operation table-fragment benchmark also uses roughly 200 MiB more peak RSS than TurboDOM with or without cell reads. [Framework timing and stages](../.cache/four-provider-replay/framework-report.md), [Cascade profiles](framework-performance-campaign.md#authored-cascade-and-live-tree-follow-up)
- **Styled Window RSS and framework memory.** On 32 styled Windows RunDOM uses roughly 243 MiB more RSS than jsdom, 213 MiB more than Happy DOM and 470 MiB more than TurboDOM. On the matching Svelte runes shard RunDOM uses about 63 MiB more peak RSS than jsdom and 37 MiB more than Happy DOM. Ant Design uses 46–92 MiB more than the three alternatives. [Memory stages](../.cache/four-provider-replay/lab-report.md#retained-memory), [Framework memory](../.cache/four-provider-replay/framework-report.md)

## jsdom API and focused WPT

The local facade passed all 1,572 tests and the upstream jsdom public API suite passed all 634 cases on both RunDOM parser selections. In the focused CSS selectors, CSSOM, cascade and query selection, stock jsdom satisfied its own fixture expectations for all 756 fixtures. RunDOM satisfied 650 and differed on 106. Of those 106, 85 were marked as expected failures for jsdom and instead passed outright on RunDOM. Sixteen fixtures reported named assertion mismatches and five reported other fixture errors. Among matched named assertion occurrences, RunDOM passed 798 that jsdom failed, and failed 57 that jsdom passed. RunDOM reported 608 additional assertion occurrences. The TypeScript and Rust-selected RunDOM replays matched each other across all 13,037 assertion outcomes. These results cover the focused selection. The Happy DOM and TurboDOM comparison uses the checked DOM and framework matrices above. [TypeScript API run](../.cache/four-provider-replay/api.log), [Rust API run](../.cache/four-provider-replay/api-rust.log), [WPT counts](../.cache/four-provider-replay/wpt-summary.json), [RunDOM WPT stream](../.cache/four-provider-replay/wpt-typescript.log)
