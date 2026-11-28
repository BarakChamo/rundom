# Stylesheet compilation and parallel test commands

The workloads were Ant Design’s eight-file selection (133 tests) and Material UI’s Autocomplete file (348 passing, 13 skipped). Each command ran one Vitest worker with a 120-second per-test timeout against the pinned checkouts from the [preceding investigation](real-project-performance-2026-11-22.md). Concurrent commands used separate processes and fresh Windows. A command counted toward throughput only if its exit status and digest of file names, test names and outcomes matched the qualified run.

At four simultaneous commands, final RunDOM completed 5.93 Ant Design commands per minute versus 4.68 on starting RunDOM and 3.13 on jsdom. Its highest aggregate RSS was 2,230 MiB, 343 MiB above starting RunDOM. Material UI throughput at four commands moved from 3.38 to 3.51, while at two commands it moved from 3.51 to 3.49. A 16 MiB V8 semi-space reduced the four-command Material UI peak from 1,908 to 1,664 MiB and throughput from 3.51 to 3.17. The second round’s one-minute host load ranged from 34 to 150. These are observed workload results under contention.

## Ant Design stylesheet trace

Across eight files the private rule builder received 234 requests. Of these, 126 repeated a CSS string within the file. The existing flat-rule plan already handled the repeats: tracing the fallback tree walk found no second full walk for any recurring sheet. Large mixed sheets drove substantial first-read work. One source with 265 top-level entries visited 1,033 rules during its single materialization. Eagerly compiling all 74 connected Radio Group sheets would include sheets that never needed their rule objects.

A second run counted 2,948 selector requests. Only 73 missed again under the same selector inputs within a file, and 71 of those were simple class or ID selectors. RunDOM now saves the first eligible single-rule compilation in the existing per-Window plan cache. Subsequent owners receive independent CSSOM wrappers. The regression test changes the first owner’s selector and declaration and checks the second owner and computed color.

## Material UI memory and cascade reuse

The worker trace sampled V8 spaces and RSS before and after all 348 passing Autocomplete cases. In one baseline process, the highest case-boundary RSS was 561 MiB. V8 reported 148 MiB used and 461 MiB of heap capacity. The old generation occupied 289 MiB of physical space and the young generation 127 MiB. Different cases peaked in other runs. These snapshots identify heap capacity as a contributor and do not attribute every resident page to JavaScript objects.

Deferring rule construction for all nonempty import-free sheets produced worker RSS peaks of 548 and 458 MiB versus 564 and 376 MiB in the two controls. The change also introduced extra per-sheet accessors. That prototype was excluded. As a separate experiment the worker used Node’s opt-in `--max-semi-space-size=16` setting. The young generation occupied 32 MiB at the sampled peaks, down from 127–128 MiB in the default runs. In two pairs, the median worker RSS fell from 417.2 to 305.8 MiB. Median worker CPU increased from 26.19 to 26.92 s. For the opt-in batches, the command set `NODE_OPTIONS=--max-semi-space-size=16` in its environment alongside the provider preload, so both Vitest and its workers inherited it. RunDOM itself does not change the embedding process’s V8 flags.

Ant Design made 4,484 attribute writes. Of these, 2,517 targeted a parentless element and 717 wrote the existing value, with overlap between those categories. All 140 misses attributed to stylesheet exposure still had a currently exposed stylesheet in the active collection. A narrower invalidation path preserves completed document frames when an unattached root receives a class, role, data or ARIA attribute, or when a connected element receives the same value for one of them. Attribute mutation notifications and query invalidation still run. Changes to selector-visible values, removals and insertion into the document retain their invalidations.

The combined changes reduced selector-preparation requests from 2,948 to 2,936 on Ant Design and from 15,164 to 9,785 on Material UI. These counts include cache lookups and simple-subject preparation as well as general selector compilation. On Ant Design, 243 requests reached the full cascade path both before and after. On Material UI, that count fell from 11,160 to 11,090 for the same 26,634 public requests. The 70 avoided traversals comprise 62 additional exact-target hits and eight additional ancestor hits. The instrumented worker retired 64.56 billion instructions before and 61.56 billion after. This single diagnostic pair measures both source changes together.

## Measuring parallel commands

Each batch launched one, two or four independent copies of the complete command together, disabled transform and filesystem module caches, and waited for every process to exit. Throughput is verified commands times 60 divided by batch elapsed seconds. At roughly 250 ms intervals the sampler summed the resident memory of all processes in the batch’s process groups. The reported peak is the maximum simultaneous sum, which can count shared pages multiple times and miss peaks between samples. The host was a shared Apple M4 running Node 24.22.3 with no reserved CPU allocation. The runtime accepted both builds’ Window and CSS compiled-code caches. Each command started a new process. The operating system filesystem cache stayed warm across runs. Sustained capacity and small differences need repeated runs on a reserved runner.

Two rounds reversed concurrency order and varied provider order. Each table cell reports **passing commands per minute / maximum observed aggregate RSS in MiB**. Throughput pools completed commands and elapsed time across both rounds. Memory uses the larger of the two simultaneous peaks. The data include every individual batch. [Raw measurements and named outcome hashes](stylesheet-concurrency-2026-11-22.json)

### Ant Design

| Concurrent commands |        jsdom | Starting RunDOM | Final RunDOM |
| ------------------: | -----------: | --------------: | -----------: |
|                   1 |   1.42 / 493 |      1.62 / 517 |   1.88 / 479 |
|                   2 | 2.36 / 1,088 |      3.02 / 895 | 4.02 / 1,118 |
|                   4 | 3.13 / 1,711 |    4.68 / 1,887 | 5.93 / 2,230 |

### Material UI Autocomplete

| Concurrent commands |        jsdom | Starting RunDOM | Final RunDOM | Final RunDOM, 16 MiB semi-space |
| ------------------: | -----------: | --------------: | -----------: | ------------------------------: |
|                   1 |   1.20 / 592 |      1.79 / 556 |   1.96 / 809 |                      2.29 / 618 |
|                   2 | 2.34 / 1,159 |    3.51 / 1,098 | 3.49 / 1,309 |                      3.24 / 997 |
|                   4 | 1.99 / 2,387 |    3.38 / 1,760 | 3.51 / 1,908 |                    3.17 / 1,664 |

## Compatibility

All 98 commands matched their expected named outcomes. The full repository gate passed 15 of 15 tasks, including 1,641 jsdom package tests. The upstream API suite passed 634 cases under each parser setting. The differential CSS corpus reproduced all 29,142 values and the stylesheet identity and media contract matched the starting implementation. An earlier run of the repository gate timed out in an unrelated recurring-parser test while profiling was active. The isolated rerun passed at the original timeout. This verification covers the selected suites and CSS contracts. Full WPT was outside the run.
