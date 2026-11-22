# Qualification against jsdom 31.0.1

The release target is upstream commit `b76da26fd3b2786771b493f0bbec8dbd7a3d36d0`. On November 22, 2026, each implementation passed the same 672 upstream API tests and skipped the same one on Node 24.22.3. The starting RunDOM build failed 24. The API results cover this suite. The project and WPT comparisons below identify outstanding differences.

## Concurrent project commands

One Ubuntu 24.04 GitHub-hosted VM per project ran two rounds in opposite provider and concurrency orders. Each command started Vitest with one worker and cold runner caches. Ant Design exercised eight files (133 passing tests). Material UI exercised Autocomplete (348 passing, 13 skipped). Each command had to exit successfully and reproduce the expected hash of file, full test name and outcome. Throughput pools wall time across the two rounds. Peak RSS is the higher of the two observed peaks, sampled across all simultaneous process groups every 250 ms. Shared pages can be counted more than once. The runner allocation provided a fresh VM per job. Physical host exclusivity was unverified. [Runner, harness and artifacts](https://github.com/BarakChamo/rundom/actions/runs/45018186358)

| Project     | Concurrent commands | Prior RunDOM commands/min · peak MiB | RunDOM with stylesheet discovery change | jsdom 31.0.1 |
| ----------- | ------------------: | -----------------------------------: | --------------------------------------: | -----------: |
| Ant Design  |                   1 |                           6.01 · 706 |                              6.10 · 706 |   4.89 · 734 |
| Ant Design  |                   2 |                         9.77 · 1,412 |                            9.78 · 1,412 | 8.14 · 1,453 |
| Ant Design  |                   4 |                        11.38 · 2,779 |                           11.46 · 2,762 | 9.56 · 2,873 |
| Material UI |                   1 |                           4.63 · 955 |                              4.64 · 955 | 4.00 · 1,164 |
| Material UI |                   2 |                         7.52 · 1,955 |                            7.85 · 1,941 | 6.89 · 2,348 |
| Material UI |                   4 |                         9.30 · 3,789 |                            9.18 · 3,796 | 8.11 · 4,654 |

At four commands, the stylesheet change improved Ant Design throughput by 0.7% and lowered the higher observed peak by 17 MiB. Material UI throughput fell by 1.3% and its higher peak rose by 7 MiB. Neither project reproduced the previously reported RSS disadvantage against jsdom on the shared Apple host. The historical and current runs differ in operating system, upstream version and host contention. Those differences prevent attribution of the historical RSS rise to a single source change.

In a separate four-command Material UI trace, eight Node processes accounted for about 4,005 MiB RSS in the highest simultaneous half-second sampling bucket. V8 reported 2,477 MiB of heap capacity and 1,022 MiB of used heap. Physical young-generation space accounted for 934 MiB and old-generation space for 1,209 MiB. Process sampling does not identify all resident pages. Ant Design used threads, so its per-PID samples cannot disaggregate isolate heaps. [Memory trace and controls](https://github.com/BarakChamo/rundom/actions/runs/45017927564)

The selector and stylesheet caches retained large parent strings through short substring keys. Copying those keys at cache admission passed upstream forced-GC tests. In a separate one-round four-command comparison, this change lowered Ant Design's peak by 13 MiB and raised Material UI's by 90 MiB. The forced-GC result establishes the retention mechanism. Its workload benefit depends on the input and collection timing. [Cache comparison](https://github.com/BarakChamo/rundom/actions/runs/45017173439)

## Major project checks

| Selection                                        | RunDOM pass / fail / skipped | jsdom 31.0.1 pass / fail / skipped |
| ------------------------------------------------ | ---------------------------: | ---------------------------------: |
| Ant Design, eight files                          |                  133 / 0 / 0 |                        133 / 0 / 0 |
| Material UI, five components                     |                 430 / 0 / 39 |                       430 / 0 / 39 |
| Material UI, Autocomplete                        |                 348 / 0 / 13 |                       348 / 0 / 13 |
| Vue, full runtime-dom                            |                  270 / 0 / 1 |                        265 / 5 / 1 |
| Svelte, runtime-runes, runtime-legacy and motion |              6,012 / 90 / 34 |                    6,073 / 29 / 34 |
| Mozilla Readability, full Mocha invocation       |                1,984 / 0 / 0 |                      1,984 / 0 / 0 |
| Next.js, with-vitest example                     |                    5 / 0 / 0 |                          5 / 0 / 0 |

Svelte had 64 failures unique to RunDOM, 26 common failures and three cases unique to jsdom. Forty-two RunDOM-only failure messages explicitly mention `inert`. Vue's five additional RunDOM passes involve `v-show` and `useCssVars`. Readability includes both its jsdom and independent parser fixtures. [Vue, Svelte and Material UI reports](https://github.com/BarakChamo/rundom/actions/runs/45018271352)

## Web Platform Tests

Four matched shards used jsdom's pinned WPT commit `2971340498805350babb6c167e0df98eaa380f98` and upstream expectations. An observer recorded each testharness completion, name and status. Occurrence number disambiguated duplicate names within a file. Both sides returned completion records for 6,738 distinct paths. Upstream's Mocha run also marked 4,980 files pending. A passing Mocha expectation can include expected assertion failures, so the comparison uses individual testharness results. [Sharded outputs and instrumentation](https://github.com/BarakChamo/rundom/actions/runs/45018050358)

| Assertion comparison                            |   Count |
| ----------------------------------------------- | ------: |
| Passed by jsdom                                 | 235,917 |
| Passed by both                                  | 212,932 |
| Passed by jsdom, nonpassing result from RunDOM  |  22,351 |
| Passed by jsdom, no corresponding RunDOM result |     634 |
| Nonpassing in jsdom, passed by RunDOM           |   4,560 |
| Passed by RunDOM, no corresponding jsdom result |  15,456 |

Seventy-one files with clean reference harness status lost that status. The largest deficits among reference-passing assertions were anchor positioning (6,153), CSS color (3,615), images (1,886), fonts (1,734) and values (1,629). Anchor and anchor-size specified-value parsing accounted for 5,110 losses in two files. The result describes the build in the linked run. A subsequent focused run fixed resolved numeric and percentage line heights, passing all four assertions in `getComputedStyle-line-height.html`. Four high-resolution event timestamp assertions also passed only on RunDOM in a paired focused replay. The full-suite counts above retain their original build attribution.

The jsdom 31 reference keeps computed style declarations live across mutations. A retained declaration changed from red to blue after an inline color mutation. The RunDOM snapshot retained red until a fresh read. RunDOM also reflects the HTMLElement inert property into markup while jsdom 31 leaves the assignment as a JavaScript property. These are observable compatibility decisions for a version-matched facade.
