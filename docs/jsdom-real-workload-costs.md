# Why isolated DOM gains shrink in project test runs

Fresh Apple M4 measurements on November 20, 2026, using Node 24.20.0. The comparison uses the packaged RunDOM TypeScript parser and each project’s installed jsdom. Wall times include starting Node and returning the result to the caller. The upstream checkouts, selected files and provider resolutions are recorded in the batch.

## Upstream project results

Each cell gives the median of fresh single-worker invocations in seconds. The primary runs disabled runner transform caches. Speedup divides jsdom median wall by RunDOM median wall. The body column sums durations reported for individual tests, which can include fixtures, framework compilation, real waits and lazy imports. RSS is maximum resident set size reported by macOS for the command, in MiB. Rows labelled as examples or selections cover only that workload.

| Selection                               | Pass / skipped | RunDOM s | jsdom s | Speedup | Bodies s · RunDOM / jsdom | Peak RSS MiB · RunDOM / jsdom |
| --------------------------------------- | -------------- | -------- | ------- | ------- | ------------------------- | ----------------------------- |
| Ant Design · 8 files                    | 133            | 5.21     | 6.75    | 1.30×   | 1.198 / 1.248             | 597 / 608                     |
| Material UI · 5 components              | 430 / 39       | 7.80     | 9.93    | 1.27×   | 5.493 / 6.452             | 340 / 363                     |
| Vue · runtime-dom                       | 270 / 1        | 2.76     | 6.43    | 2.33×   | 0.395 / 0.389             | 396 / 513                     |
| Svelte · runes shard 1/4                | 565 / 9        | 5.88     | 6.36    | 1.08×   | 4.809 / 4.973             | 365 / 339                     |
| Svelte · motion                         | 8              | 0.88     | 1.05    | 1.19×   | 0.002 / 0.002             | 184 / 184                     |
| Next.js · example                       | 5              | 1.11     | 1.79    | 1.62×   | 0.045 / 0.117             | 148 / 153                     |
| freeCodeCamp · 2 files                  | 4              | 1.74     | 2.08    | 1.20×   | 0.072 / 0.122             | 181 / 186                     |
| Supabase · UI package                   | 85             | 4.21     | 7.99    | 1.90×   | 0.723 / 1.691             | 189 / 310                     |
| React · DOM and CSS property operations | 64             | 4.68     | 4.60    | 0.98×   | 3.626 / 3.408             | 839 / 835                     |
| Drone · CreateRepositoryButton          | 1              | 3.72     | 3.81    | 1.02×   | 0.690 / 0.741             | 634 / 645                     |
| Scully · 3 files                        | 8              | 1.08     | 1.21    | 1.12×   | unreported                | 480 / 467                     |
| Scully · 2-file subset                  | 5              | 1.00     | 1.10    | 1.10×   | unreported                | 435 / 430                     |

Three rotated pairs per selection, eleven for freeCodeCamp. The two Scully rows overlap. Both providers used the same legacy Jest teardown guard for Scully. Each matched row checks the file, full case name and outcome, including duplicate case names. Stock jsdom versions range from 16.7.0 for Scully to 31.0.0 for Ant Design. Material UI uses 30.1.3, Vue 30.0.1, Svelte 25.0.1, and React 26.1.0.

**Broad Svelte compatibility limits the comparison.** Across runtime-runes, runtime-legacy and motion, RunDOM passed 6,012, failed 90 and skipped 34. jsdom passed 6,102, failed zero and skipped 34. Of the failures, 62 were in legacy and 28 in runes. Forty-eight failure messages mention `inert`, often in transition markup comparisons. The 30.76 s and 33.47 s invocations did different work after failures, so the table omits their ratio.

## Cost of running the test environment

A second experiment selected the same files and an unmatched test name. Each runner still resolved the requested provider, collected the files and skipped every case. Medians across two fresh invocations per side show how much time file loading and setup can consume. They are independent measurements. Warm filesystem state, transforms and scheduling can move a skipped run above a full run, particularly for Vue. Subtracting these numbers from the full run would give a misleading estimate of DOM time.

| Same files, zero bodies                 | RunDOM s | jsdom s | Target for 2× cold jsdom, s |
| --------------------------------------- | -------- | ------- | --------------------------- |
| Ant Design · 8 files                    | 4.78     | 5.72    | 3.37                        |
| Material UI · 5 components              | 2.64     | 3.60    | 4.96                        |
| Vue · runtime-dom                       | 2.84     | 7.29    | 3.21                        |
| Svelte · runes shard 1/4                | 1.40     | 1.49    | 3.18                        |
| React · DOM and CSS property operations | 3.81     | 3.93    | 2.30                        |

For React, Babel traversal and deep cloning, source-map handling, file I/O and module compilation dominate the profile. RunDOM code and its recognized dependencies received 63 ms of 5.52 s of active samples across the invocation. The matched 64-case suite already spent about 3.81 s collecting with RunDOM against a 2.30 s target for a 2× total speedup. Ant Design’s corresponding figures were 4.78 s against 3.37 s. In its unprofiled RunDOM runs, Vitest assigned a median 46% of its measured duration to transforms and 20% to setup.

### Persisting transforms

- Ant Design · 8 files with populated transform caches took 5.51 s with RunDOM and 6.68 s with jsdom (1.21×).
- React · DOM and CSS property operations with populated transform caches took 1.43 s with RunDOM and 1.31 s with jsdom (0.92×).

Each provider had a separate cache with one priming invocation followed by three measured invocations. These are runner configuration controls.

## Which DOM operations the projects exercised

| Instrumented RunDOM selection | Windows | Largest constructor markup, chars | Element fragment parses | Largest fragment, chars | querySelectorAll | Deferred document snapshots ≥128 | getComputedStyle |
| ----------------------------- | ------- | --------------------------------- | ----------------------- | ----------------------- | ---------------- | -------------------------------- | ---------------- |
| Ant Design · 8 files          | 8       | 15                                | 407                     | 66153                   | 226              | 0                                | 352              |
| Material UI · 5 components    | 5       | 15                                | 1                       | 220                     | 1201             | 0                                | 3180             |
| Vue · runtime-dom             | 16      | 15                                | 158                     | 159                     | 75               | 0                                | 6                |
| Svelte · runes shard 1/4      | 1       | 15                                | 5708                    | 8988                    | 622              | 0                                | 20               |

Counters came from a separate copy of the packaged runtime. They count calls to the Window constructor implementation, element markup parser, queryAll, deferred document snapshot constructor and public getComputedStyle. The fragment counter excludes other parsing entry points. A large CSS text node or a tree built by createElement can coexist with small parser inputs.

## Where provider CPU goes

Paired V8 profiles used a 500 µs sampling interval. Worker test intervals use a native monotonic clock aligned to V8. The body shares below exclude idle and unattributed VM samples. Direct provider time includes package frames and recognized dependencies below provider frames. Native work and costs such as module loading and GC do not all appear as provider self time. Samples from separate threads or phases are not additive with process wall time. Ant Design used its thread pool. Additional profiles of Material UI, Svelte and freeCodeCamp used a thread pool to retain worker V8 samples; native-pool intervals independently measured elapsed time and test-thread CPU. Each profile is diagnostic. Timings above come from uninstrumented runs.

| Within test intervals      | RunDOM direct / active ms | jsdom direct / active ms | RunDOM CSS ms | jsdom CSS ms |
| -------------------------- | ------------------------- | ------------------------ | ------------- | ------------ |
| Ant Design · 8 files       | 547 / 1402 (39%)          | 575 / 1523 (38%)         | 352           | 353          |
| Material UI · 5 components | 833 / 2701 (31%)          | 1713 / 3858 (44%)        | 527           | 796          |
| Svelte · runes shard 1/4   | 152 / 906 (17%)           | 267 / 1052 (25%)         | 29            | 5            |
| Vue · runtime-dom          | 147 / 368 (40%)           | 163 / 396 (41%)          | 81            | 71           |
| freeCodeCamp · 2 files     | 20 / 52 (39%)             | 53 / 86 (62%)            | 13            | 27           |

### 1. CSS work across component libraries

Material UI spent **527 ms in CSS** out of 833 ms of direct RunDOM work during the profiled tests. An inclusive 336 ms had both style and role/focus frames on the stack. These measurements overlap. The Select file accounted for 462 ms of direct provider work across all categories. There were 3,180 public computed-style reads and 2,518 entries into computeStyle. Those entries received 188,014 available sheets in total, about 75 per entry. That counts sheets supplied, not sheets actually scanned. The hot functions included computeStyle, applySheet, stylesheet construction, and color processing.

The stylesheet pipeline also handled **17,432 Material UI parse requests**. Of those, 16,105 reused syntax and 14,285 used a flat plan containing a single rule. Ant Design presents the complementary case. It sent 2,108,436 characters through the element fragment parser, all in style elements, and made 1,825 calls into full selector parsing. RunDOM’s CSS frames accounted for 352 ms out of 547 ms of direct provider work. Only 65 ms had style under recognized role/focus frames. Ant’s corresponding jsdom CSS measurement was 353 ms. Both engines still spend substantial time here.

**First engine experiment.** Attach a reusable per-scope index of candidate rules to the stylesheet set, with incremental invalidation for insertion, mutation and adoption. Measure candidate counts and avoided declaration work on Material UI before committing to the design. For repeated single-rule inputs, evaluate sharing the immutable parsed representation up to the point where an independent CSSOM rule object becomes observable. The existing syntax and flat-plan hits are already high; increasing cache capacity alone has little headroom. Preserve separate rule identity, mutation ordering, computed-style snapshots and cross-document adoption. [Computed style and stylesheet implementation](../packages/dom/src/styles.ts)

**Second experiment.** Avoid the general HTML fragment parser for eligible HTML raw-text assignments, starting with the style-element inputs measured in Ant. Preserve tokenizer behavior for exceptional input and XML. Ant’s entire parsing and serialization category contributed 51 ms of test samples, so this is a smaller opportunity than CSS itself. [Fragment replacement](../packages/dom/src/html-fragment.ts)

### 2. First inline CSS use in each isolated worker

Vue’s first string-style patch was about 21 ms slower than jsdom across the three unprofiled pairs. The first test in several other style-using files also paid a penalty. In 11 isolated pairs using Vue’s installed jsdom, the first inline assignment and serialization took **26.82 ms on RunDOM versus 2.72 ms on jsdom**. The second took 0.33 versus 0.16 ms. RunDOM had already saved time on package load (13.78 vs 205.50 ms) and Window creation (1.34 vs 31.24 ms). Its first computed color took 4.51 versus 29.71 ms.

A separate nine-pair RunDOM experiment changed only whether the CSS capabilities were initialized before the first assignment. The first assignment fell from **26.45 to 8.62 ms**. Priming itself took median stages of 3.92 ms to load the bundle, 3.10 ms for css-tree, 1.03 ms for color, and 9.75 ms for cssstyle in that order. This establishes that much of the penalty is initialization. Moving it into startup would shift that cost to all suites. Evaluate a lightweight declaration path for common inline properties that preserves canonical serialization and invokes the full grammar on demand. Verify startup, first use, warm setters and retained heap separately. [CSS capability loader](../packages/dom/src/css-runtime.ts)

### 3. Runner, application and wait time

- **React.** Populating the transform cache brought RunDOM from 4.68 to 1.43 s and jsdom from 4.60 to 1.31 s. Both benefit. The underlying provider accounts for only about 1% of active samples in the cold RunDOM profile. This checkout is an effective test of Jest integration and a poor target for a multi-second DOM optimization. In Ant Design the cache reduced the reported transform share to 10–11%, but setup rose to 52–53%. End-to-end RunDOM time did not improve in that control.
- **Material UI.** Four Select tests include explicit sleeps totaling **2.30 s**, about 42% of RunDOM’s 5.49 s of unprofiled body time. Select accounts for 4.27 s of those bodies. In the native-pool diagnostic the test thread used 3.04 CPU seconds across 5.71 elapsed seconds inside cases. React element creation and JSX construction were the two hottest individual active frames in the thread-pool profile. The 2.64 s zero-body run and the 2.30 s authored waits already consume roughly the 4.97 s budget for doubling jsdom’s wall speed, before rendering the components. These independent measurements indicate scale, not an exact additive bound. [Select timing cases](../.cache/upstream-mui/packages/mui-material/src/Select/Select.test.js)
- **Svelte.** In the matched runes shard the native test thread used **1.29 CPU seconds during 4.06 elapsed seconds** of test intervals. The paired thread-pool profile attributed only 152 ms of 906 active ms to RunDOM. File reads and writes, module evaluation and circular-import checks also appear. Two async fixtures alone specify about 600 ms of delays across DOM and hydrate variants. RunDOM peaked 26 MiB above jsdom in this shard; these timing profiles do not identify the owner of that memory. The broad selection also has 90 compatibility failures, which take priority over claiming a speedup there. [Stale-resolution fixture](../.cache/upstream-svelte/packages/svelte/tests/runtime-runes/samples/async-resolve-stale/_config.js) · [Navigation-race fixture](../.cache/upstream-svelte/packages/svelte/tests/runtime-runes/samples/async-boundary-nav-race/_config.js)
- **freeCodeCamp.** The first three pairs gave 1.37 versus 1.33 s, and the eight confirmation pairs gave 1.78 versus 2.26 s. The table pools all eleven. Both groups ran the same four cases, which take tens of milliseconds on RunDOM. File setup and imports dominate. A small difference in one batch is insufficient evidence of a provider regression on this selection.
- **Dense traversal.** None of the four instrumented selections constructed a deferred document query snapshot with at least 128 members. The largest Window constructor input was 15 characters. Svelte made thousands of fragment parses, and Ant processed large CSS strings, so these suites still exercise parsing; their access patterns differ from repeatedly constructing a 4,096-row document. Dense traversal and the 0.018 ms warm mutation-observer deficit rank below CSS for these workloads.

## Internal benchmarks

The default-size lab exercised 44 scenarios at 256 rows, with five scheduled fresh processes per provider per scenario. RunDOM was faster on 41 of 43 comparable warm batch medians and on 43 of 43 total-process medians. The reference failed the lab’s style-inheritance assertion, so its timing is excluded. Warm batch medians are medians of each process’s five measured batches.

| Closest internal warm results | RunDOM batch ms | jsdom batch ms | Warm speedup | Process speedup |
| ----------------------------- | --------------- | -------------- | ------------ | --------------- |
| mutation-observer             | 0.204           | 0.186          | 0.91×        | 3.10×           |
| control                       | 0.001           | 0.001          | 0.97×        | 2.86×           |
| serialize                     | 0.672           | 0.951          | 1.42×        | 2.98×           |
| windows-live                  | 0.113           | 0.197          | 1.75×        | 3.20×           |
| events-default-action         | 0.435           | 0.862          | 1.98×        | 3.23×           |
| style-read                    | 0.071           | 0.168          | 2.36×        | 2.65×           |
| query-id-hit                  | 0.016           | 0.038          | 2.39×        | 3.06×           |
| events-redispatch             | 0.171           | 0.442          | 2.58×        | 3.17×           |

| 4,096-row workload, four ops/batch | RunDOM ms | jsdom ms | Warm speedup | Peak RSS MiB · RunDOM / jsdom |
| ---------------------------------- | --------- | -------- | ------------ | ----------------------------- |
| parse-html-sparse                  | 4.1       | 156.1    | 37.71×       | 164 / 512                     |
| parse-html-traverse                | 11.3      | 174.9    | 15.44×       | 198 / 552                     |
| parse-html-update                  | 7.6       | 155.2    | 20.29×       | 196 / 558                     |
| parse-html-rotate                  | 3.2       | 161.0    | 49.58×       | 206 / 561                     |
| parse-html-unique                  | 31.2      | 165.7    | 5.31×        | 326 / 561                     |
| list-reconcile                     | 0.9       | 7.9      | 9.17×        | 122 / 244                     |

| Internal React/Testing Library · eight cases | RunDOM total ms | jsdom total ms | Total speedup | RunDOM / jsdom body ms |
| -------------------------------------------- | --------------- | -------------- | ------------- | ---------------------- |
| forks                                        | 411             | 630            | 1.53×         | 104 / 148              |
| threads                                      | 384             | 598            | 1.56×         | 103 / 145              |
| vmForks                                      | 508             | 718            | 1.41×         | 113 / 158              |
| vmThreads                                    | 783             | 989            | 1.26×         | 136 / 204              |

Nine rotated invocations per pool and provider; the internal fixture holds the React interactions and assertions constant. Its dependency graph is smaller than the upstream React Jest checkout.

## Evidence

[Project medians and outcomes](../.cache/project-cost-fQWWV4/projects.json) · [Cache and repeat controls](../.cache/project-cost-fQWWV4/controls.json) · [Per-case deltas](../.cache/project-cost-fQWWV4/case-deltas.json) · [Worker CPU breakdown](../.cache/project-cost-fQWWV4/attribution.json) · [Diagnostic outcome checks](../.cache/project-cost-fQWWV4/diagnostic-validity.json) · [Workload counters](../.cache/project-cost-fQWWV4/usage-summary.json) · [CSS controls](../.cache/project-cost-fQWWV4/first-style) · [Internal lab](../.cache/project-cost-fQWWV4/lab-summary.json) · [React fixture](../.cache/project-cost-fQWWV4/react-grid.json) · [Upstream runner reports](../.cache/project-cost-fQWWV4/real) · [Native Jest reports](../.cache/project-cost-fQWWV4/jest-providers)
