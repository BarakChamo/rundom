# Ant Design cascade and TurboDOM replay

Benchmarks used Node 24.20.0 on an Apple M4. The synthetic matrix used jsdom 30.1.3, Happy DOM 21.0.4, TurboDOM 0.7.1 and RunDOM’s default TypeScript backend. Upstream tests used each project’s pinned jsdom. The old RunDOM package was frozen in [O2bxk3](../.cache/performance-lab-O2bxk3/cohort.json) and the retained package in [GqdMhH](../.cache/performance-lab-GqdMhH/cohort.json). Timing runs shared the host with other processes. The lab and Ant Design repeated comparisons rotated provider order.

## Ant Design

The initial threaded CPU profile of the eight Ant Design files put 475 ms of samples under computed style and 315 ms under stylesheet insertion. Insertion spent 309 ms in stylesheet parsing and 170 ms in selector preparation. The before/after cascade profile attributed 45.0 → 18.5 ms of self time to declaration expansion and 246 → 184 ms of inclusive samples to CSS feature queries. Insertion in that intermediate build remained flat. These are stack attributions, with overlap between parent and child frames. [Initial profile](../.cache/antd-cascade-followup/baseline/attribution.log) · [Paired CPU profiles](../.cache/antd-cascade-followup/framework)

- The cascade constructs each winner directly and computes layer weights once per declaration block. The stylesheet syntax cache can reuse a small declaration’s lookup key in the existing 256-entry validated snapshot cache. Every rule restores its own mutable declaration. [Cascade expansion](../packages/dom/src/styles.ts#L6204) · [Declaration reuse](../packages/dom/src/styles.ts#L3600)
- CSS feature detection can load the pinned, patched value parser before constructing the declaration prototype. [CSS.supports validation](../packages/dom/src/css-supports.ts#L17)
- Stateless functional selectors and pseudo-elements can use the existing bounded cross-Window selector cache. Unknown, escaped and live-state selectors stay in the Window cache. A checked insertion probe with 49 rules in each of 20 measured Windows moved from 75.87 to 12.03 ms over five rotated processes. The checked cascade reads in the same probe moved from 147.81 to 141.48 ms. The real Ant Design suite showed a much smaller effect. [Selector cache](../packages/dom/src/styles.ts#L3286) · [Insertion probe](../.cache/antd-cascade-followup/sheet-stages.jsonl)

All 133 selected Ant Design tests passed under RunDOM and jsdom. Happy DOM passed 128 and TurboDOM passed 121. The table uses three runs of the exact same 116 tests that all four providers passed. Test time sums the test case durations. Process includes Vitest startup, transformation, environment, tests and exit. CPU includes both user and system time.

| Provider        | Test time (s) | Process (s) | CPU (s) | Peak RSS (MiB) |
| --------------- | ------------: | ----------: | ------: | -------------: |
| RunDOM baseline |         2.436 |       9.492 |   15.07 |          654.6 |
| RunDOM retained |         2.421 |      10.403 |   15.32 |          643.7 |
| jsdom           |         1.857 |       9.722 |   14.55 |          615.2 |
| Happy DOM       |         1.574 |       9.882 |   14.42 |          580.4 |
| TurboDOM        |         1.319 |       7.709 |   11.75 |          563.1 |

RunDOM’s matched Ant Design test median was approximately flat against its baseline and still trailed all three providers. [Matched tests and phase summaries](../.cache/antd-cascade-followup/selector-matched/results.json) · [Complete upstream selections and phase summaries](../.cache/antd-cascade-followup/framework/results.json)

Six additional runs of the full 133-case selection passed. The baseline and retained process CPU medians were 22.00 and 22.05 s, and the instruction medians were 105.90 and 105.56 billion. Wall process medians were 17.55 and 22.55 s during overlapping benchmark and compatibility jobs. The similar CPU and instruction counts support a flat overall cost in this replay, with higher observed wall time for the retained build. [Full Ant Design paired replay](../.cache/antd-cascade-followup/framework/antd-full-pair.log)

## Remaining gaps and controls

Empty-Window setup primes the three prototypes that receive the global event handler table, avoiding a long chain of V8 property transitions. The isolated seven-round prototype trial moved the warm median for four empty Windows from 6.62 to 5.67 ms. Standalone checks matched key order, descriptor flags, Window interface shapes and live selector state across Windows. [Startup change](../packages/dom/src/window.ts#L18888) · [Prototype-only comparison](../.cache/performance-lab-yLWU9t/comparison-471hXp/report.md) · [Realm checks](../.cache/antd-cascade-followup/realm-state-proof.log)

The latest first authored CSS read captured 11.0 ms of self time in vendor shorthand setup and 1.5 ms in the descriptor utility across the phase profiles. The lazy shorthand candidate moved first-use wall time from 35.4 to 44.3 ms and was removed. Its profile shifted into generated descriptors, CSS grammar and GC. A nine-round confirmation put the retained build at 30.9 ms wall and 37.53 ms CPU for first use, with 29.3 ms and 37.64 ms for the baseline. TurboDOM used 3.1 ms wall and 11.41 ms CPU. One earlier baseline Node process crashed in V8’s mark-compact collector. The nine-round confirmation completed all 27 checks. [Cold CSS confirmation](../.cache/performance-lab-GqdMhH/comparison-NuOX4i/report.md) · [Lazy shorthand candidate](../.cache/performance-lab-f2GVGd/comparison-PoPjHU/report.md)

Dense traversal still spends time copying independent mutable parse records, building the Window, wrapping branded nodes, and collecting garbage. The alternative first-child allocation improved sparse traversal but made the warm full-tree traversal 11.57 → 12.83 ms and the update workload 10.51 → 11.89 ms. It was removed. The current retained profile continues to show template copying, query enumeration, and native structured-clone branding in the hot path. [Dense allocation candidate](../.cache/antd-cascade-followup/dense-compare.json) · [Current CPU profile index](../.cache/antd-cascade-followup/remaining-cpu.json)

Forced-GC live heap for 32 styled Windows was 64.08 → 64.15 MiB and peak RSS was 202.81 → 203.05 MiB against the prior RunDOM. Across a separate seven-round, interleaved dense replay, baseline and retained peak RSS medians were 340.39 and 342.47 MiB with overlapping trial ranges. Released heap was 20.89 and 20.90 MiB. The 400-unique-stylesheet retention probe ended at 31.64 and 31.66 MiB after release. [Styled memory checkpoints](../.cache/antd-cascade-followup/pair-memory-after.json) · [Rotated dense memory](../.cache/antd-cascade-followup/dense-memory-pair.jsonl) · [Stylesheet retention](../.cache/antd-cascade-followup/retention.jsonl)

## Verification and full matrix

The retained source passed the complete local check, 1,574 facade tests per parser backend, and 634 upstream jsdom API tests per backend. The focused CSS, CSSOM, selector and ParentNode WPT replay recorded 650 passing fixtures, 25 pending and 106 existing failing fixtures per backend. All 13,037 named outcomes matched the frozen baseline per backend. The baseline Rust run had a harness timeout in one fixture whose candidate harness completed. [Local and upstream test status](../.cache/antd-cascade-followup/selector-status) · [Named WPT delta](../.cache/antd-cascade-followup/selector-wpt-delta.json)

The full Vue runtime-dom selection passed 270 cases with one skip. The Material UI selection passed 430 cases with 39 skips. The Svelte runes shard passed 565 cases with nine skips. The wider Svelte replay matched all 6,136 named RunDOM outcomes, including 90 existing failures. The upstream reports preserve test counts and individual process measurements. [Framework selections](../.cache/antd-cascade-followup/framework/results.json) · [Broad Svelte](../.cache/antd-cascade-followup/svelte-broad/results.json)

| Workload            | RunDOM completed | jsdom completed | Happy DOM completed | TurboDOM completed |
| ------------------- | ---------------: | --------------: | ------------------: | -----------------: |
| Default scenarios   |          44 / 44 |         43 / 44 |             38 / 44 |            36 / 44 |
| 4,096-row scenarios |            6 / 6 |           6 / 6 |               6 / 6 |              6 / 6 |

For the workloads verified by all providers, totals sum the median fresh-process duration for each workload.

| Shared workload matrix                                 | Scenarios | RunDOM (s) | jsdom (s) | Happy DOM (s) | TurboDOM (s) |
| ------------------------------------------------------ | --------: | ---------: | --------: | ------------: | -----------: |
| Construction, parse, clone and serialize               |         8 |       2.62 |     11.18 |          6.09 |         1.64 |
| Queries, CSS, interactions and other default workloads |        27 |       4.63 |     15.40 |         10.13 |         5.64 |
| Dense workloads                                        |         6 |       2.68 |     13.68 |         19.94 |         1.88 |

| Remaining timing gap                                    | RunDOM (ms) | jsdom (ms) | Happy DOM (ms) | TurboDOM (ms) |
| ------------------------------------------------------- | ----------: | ---------: | -------------: | ------------: |
| First authored CSS read                                 |       18.58 |      30.00 |           3.38 |          1.98 |
| Warm batch of eight empty Windows                       |        8.29 |      35.13 |          20.46 |          0.10 |
| Warm batch of four documents traversing 4,096 rows each |       20.09 |     232.31 |         324.27 |          4.34 |

All 180 forced-GC trials passed across window counts of 1, 8 and 32.

| Memory workload and metric (MiB)                       | RunDOM | jsdom | Happy DOM | TurboDOM |
| ------------------------------------------------------ | -----: | ----: | --------: | -------: |
| 32 styled Windows, live RSS                            |  202.7 | 336.4 |     358.9 |    118.0 |
| 32 styled Windows, live heap                           |   64.2 | 122.5 |     153.5 |     20.5 |
| 32 styled Windows, released heap                       |   31.4 |  51.9 |      25.5 |     16.5 |
| 256-row traversal, peak RSS in 32-window configuration |  349.6 | 487.9 |     257.1 |    117.6 |
| 4,096-row traversal, peak RSS in timing replay         |  230.9 | 551.9 |     626.5 |    140.9 |

TurboDOM's largest default-scenario peak RSS leads were fragment-list readback (313.7 vs. 146.8 MiB) and fragment-table readback (312.5 vs. 156.1 MiB). Happy DOM used less peak RSS for CSS inheritance (186.7 vs. 158.9 MiB) and first style read (160.7 vs. 134.0 MiB). The fragment insertion profiles attribute pressure to parse5 tokenization, subtree bookkeeping and ID-index invalidation. [Fragment attribution](cold-css-dense-startup-performance.md#other-timing-and-memory-gaps)

[Per-scenario load, setup, first use, warmup, measured work, close, total, peak RSS, and check failures](../.cache/antd-cascade-followup/final/lab-report.md)
