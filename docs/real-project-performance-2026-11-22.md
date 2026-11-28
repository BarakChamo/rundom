# RunDOM real-project performance, November 22

The final source made two changes to inactive HTML parsing and one to deferred CSS declaration reads. On Mozilla Readability’s 130 real articles, median Window construction fell from **2.86 to 2.14 s**, full application elapsed time fell from **8.84 to 7.67 s**, and the application executed **12.1% fewer instructions**. On Material UI Autocomplete, identifying default overflow values from the computed-style snapshot avoided **1,998 of 2,177** full declaration constructions and cut median worker CPU **9.0%**. Worker peak RSS rose **19.1 MiB** in that comparison. With eight concurrent article Windows the final build used **10.6 MiB less live heap**. The memory-constrained article run had higher peak RSS and longer elapsed time. The complete Readability jsdom article suite also executed fewer instructions. Its elapsed time varied substantially across batches. [Individual trials and source hashes](real-project-performance-2026-11-22.json)

## Final RunDOM against each project’s jsdom

These fresh comparisons ran the final packaged source on the same named tests as the project-installed jsdom. The order was jsdom, RunDOM, RunDOM, jsdom. All 32 Ant Design file executions and four Material UI workers verified their loaded provider paths. The table gives both full command timings in pair order. Each provider finished first once in each project. [Per-run process, worker and test-body measurements](real-project-performance-2026-11-22.json)

| Selected suite                         |                  Cases | Project jsdom elapsed | Final RunDOM elapsed | jsdom / RunDOM median command CPU |
| -------------------------------------- | ---------------------: | --------------------: | -------------------: | --------------------------------: |
| Material UI Autocomplete, jsdom 30.1.3 | 348 passed, 13 skipped |       42.14 / 69.54 s |      51.52 / 39.67 s |                   46.51 / 35.84 s |
| Ant Design, eight files, jsdom 31.0.1  |             133 passed |       34.67 / 81.43 s |      47.87 / 36.71 s |                   38.18 / 31.31 s |

The Material UI worker used **37.62 s CPU on jsdom and 27.35 s on RunDOM**, with 127.12 and 87.04 billion instructions respectively. RunDOM’s worker retained **94.13 MiB** of heap at file end versus **114.57 MiB** on jsdom. Its median peak RSS was **396.5 MiB** versus **370.5 MiB** on jsdom. This leaves a 26.1 MiB worker RSS gap on this selection. For Ant Design Radio Group, summed test-body time was 1.08 and 4.18 s on jsdom, and 1.97 and 1.28 s on RunDOM. Under this level of contention, the elapsed-time ranking for Radio Group remains unresolved.

## Mozilla Readability

### Final application and test-suite comparison

Each of three rounds ran the original commit, the first parser change with the CSS change, and the final source in a different order. All three used fresh processes with the optional V8 bundle caches disabled. The application digests matched on all 130 extracted article objects. The selected Mocha suite covers all upstream article cases under the jsdom provider. It performed additional upstream DOM comparisons and passed the same 903 named tests in each run.

| Median                                    | Original commit | First parser change and CSS change | Final source |
| ----------------------------------------- | --------------: | ---------------------------------: | -----------: |
| Window construction, ms                   |           2,857 |                              2,277 |        2,139 |
| Article extraction, ms                    |           5,297 |                              4,728 |        4,923 |
| Window close, ms                          |             6.4 |                                5.5 |          5.8 |
| Application process, elapsed s            |            8.84 |                               7.63 |         7.67 |
| Application process, CPU s                |           11.27 |                              10.85 |        10.15 |
| Application, billion instructions         |           51.93 |                              49.32 |        45.67 |
| Application peak RSS, MiB                 |           538.5 |                              571.3 |        547.5 |
| Application next-turn collected heap, MiB |           38.69 |                              40.01 |        33.25 |
| Mocha process, elapsed s                  |           11.57 |                              15.16 |        15.03 |
| Mocha process, CPU s                      |           15.86 |                              19.15 |        18.72 |
| Mocha, billion instructions               |           96.57 |                              92.78 |        90.73 |
| Mocha peak RSS, MiB                       |           720.4 |                              740.1 |        670.3 |

The final application used fewer instructions in all three rounds. Its median peak RSS was 9.0 MiB higher than the original and its next-turn heap was 5.4 MiB lower. Mocha used 6.0% fewer instructions and took 3.46 s longer by elapsed median in this batch. CPU seconds and instructions can move in opposite directions on a shared machine. The host’s one-minute load average exceeded 100 during the investigation. All pairs ran serially, but unrelated system load remained uncontrolled. The measurements support a reduction in parser work and a faster article application in this cohort. [Stage and process data](real-project-performance-2026-11-22.json)

Five further pairs ran the complete 903-case suite with each build’s normal packaged V8 caches. The final source retired fewer instructions in all five pairs. Its elapsed time was shorter in two of five, with a median **paired** change of +0.02 s. Taking the median of each build separately gives 16.25 and 15.88 s. This supports a reduction in work, with no consistent full-suite elapsed speedup. [All ten packaged invocations](real-project-performance-2026-11-22.json)

| Packaged Mocha suite, five runs per build |      Original |         Final |
| ----------------------------------------- | ------------: | ------------: |
| Full command elapsed                      |       16.25 s |       15.88 s |
| CPU                                       |       20.23 s |       19.66 s |
| Retired instructions                      | 97.07 billion | 90.38 billion |
| Peak RSS                                  |     729.8 MiB |     683.5 MiB |

A separate memory test held up to eight live article Windows at a time, collected garbage, closed the group, collected again, and continued through all 130 articles. With the normal bundled caches on both builds, two alternating pairs put median maximum live heap at **122.29 MiB original and 111.70 MiB final**, an 8.7% reduction. After closing the last group, heap was 77.54 and 77.31 MiB. An earlier exploratory run with unequal cache settings is separately identified in the trial data. [Per-group heap readings](real-project-performance-2026-11-22.json)

Three packaged application pairs capped V8 old space at 256 MiB. All reproduced the same article digest. Median peak RSS rose from **374.67 to 389.95 MiB**, while collected heap fell from **32.87 to 27.49 MiB**. Elapsed time rose from **9.38 to 10.68 s** and CPU from **11.51 to 12.14 s**, even as instructions fell from **51.22 to 47.96 billion**. Faster unbounded article processing and smaller live heaps do not establish a speed or peak-RSS win under this memory budget. [Packaged heap-budget trials](real-project-performance-2026-11-22.json)

### First parser change

Each process used Node 24.20.0, an Apple M4, the TypeScript backend, and the same 130 upstream fixtures. The baseline was RunDOM commit `c6ded1e0b17eeec7af18db9d8de92b5188250094`. The serial batch had four fresh runs per implementation in alternating order. CPU seconds include user and system time across process threads. Peak RSS comes from macOS, and retained heap comes from V8 after closing every Window, allowing one event-loop turn and collecting garbage. [Upstream fixtures](https://github.com/mozilla/readability/tree/ab4027a8b37669745016869a37a504727992b2ba/test/test-pages) · [Application benchmark](../scripts/benchmark-readability.mjs)

| Median, four serial pairs                             |      Baseline | Text batching |
| ----------------------------------------------------- | ------------: | ------------: |
| Time inside the HTML parser, 130 pages                |      1,194 ms |        951 ms |
| Parse and serialization process, retired instructions | 14.44 billion | 12.06 billion |
| Window construction inside the application            |      2,691 ms |      2,239 ms |
| Article extraction inside the application             |      4,742 ms |      4,689 ms |
| Whole application process                             |        8.05 s |        7.44 s |
| Whole application process, CPU                        |       11.16 s |       10.53 s |
| Whole application process, retired instructions       | 50.73 billion | 48.00 billion |
| Whole application process, peak RSS                   |     574.7 MiB |     634.4 MiB |
| Application heap after the next turn and GC           |     36.78 MiB |     36.77 MiB |
| Complete upstream Mocha invocation                    |       16.71 s |       16.08 s |
| Complete Mocha invocation, CPU                        |       20.16 s |       19.50 s |
| Complete Mocha invocation, retired instructions       | 96.35 billion | 92.58 billion |
| Complete Mocha invocation, peak RSS                   |     707.4 MiB |     693.9 MiB |

All seven pairs reduced instructions in the parse-and-serialize process. The full Mocha wall-time medians were tied at 17.95 s when the three earlier pairs were included. One early candidate invocation took 272.54 s on the shared host. Peak RSS also changed direction between runs. In the four serial application pairs the candidate’s RSS differences were approximately −159, +20, +141 and +99 MiB. The complete application and the complete test suite have different allocation lifetimes. [All seven paired measurements](real-project-performance-2026-11-22.json)

With V8 old space capped at 256 MiB, five alternating application pairs put median peak RSS at **433.84 MiB** on baseline and **433.52 MiB** on the first parser change. Next-turn collected heap was 31.73 and 27.51 MiB. Median instructions fell from 51.73 to 49.39 billion, CPU time was 9.13 and 9.07 s, and elapsed time was 5.60 and 6.06 s. The uncapped RSS increase did not reproduce under this budget. The host and allocator variability limit any claim about peak savings. [Heap-budget trials](real-project-performance-2026-11-22.json)

In three separate fresh runs per provider, Readability’s own jsdom 20.0.2 took a median **43.83 s** and RunDOM with the first parser change took **17.71 s** for the same 903 named passes (2.47×). Median peak RSS was **735.1 and 684.0 MiB**, respectively. The large provider-to-provider difference includes work completed before this change. jsdom ran first in each of these three pairs. [Reference comparison](real-project-performance-2026-11-22.json)

### Why batching works

The pinned tokenizer recognizes a change between each word and the whitespace around it. Its tree builder then appends those pieces to the same text node. Once a literal character run has started in the HTML body or text insertion mode, RunDOM scans across ordinary spaces, tabs and form feeds. A second change includes literal line feeds and allows literal ampersands in script data and raw text. Carriage returns still go through newline preprocessing. Character references in ordinary text, markup boundaries, surrogate code units, foreign content and table foster parenting retain their existing paths. Caller-supplied tree adapters, locations and parse-error callbacks use the stock tokenizer. [Implementation](../packages/dom/src/inactive-parser.ts) · [Regression fixtures](../packages/dom/test/inactive-parser.test.ts)

The final source matched parse5 in **644 complete tree comparisons** using the real articles and context combinations. It also matched in **10,518 complete tree comparisons** derived from 1,753 full-document WPT tree-construction inputs, including two scripting modes. Another 3,600 exact-tree comparisons exercised mixed raw text, script delimiters, carriage returns, surrogate code units and malformed markup with deterministic seed 1592614637. These counts describe the differential parser corpus. Every candidate application run reproduced the baseline’s SHA-256 over the full extracted article objects, and every Mocha trial passed the same 903 named tests. The repository gate passed 15 of 15 tasks and the facade passed all 634 pinned upstream API tests with each parser setting. [Pinned WPT corpus](https://github.com/web-platform-tests/wpt/tree/2971340498805350babb6c167e0df98eaa380f98/html/syntax/parsing/resources)

### Other article costs

A separate CSS syntax probe saw 346 parse requests over 323 distinct strings. There were 330 misses, including 57 with syntax errors. Of roughly 388 ms spent on misses, at most about 3.4 ms was attributable to repeated strings under an average-per-string cost estimate. Enlarging the syntax cache has little reach on these articles.

A 21,827-sample application profile attributed 2,607 self samples to GC and 938 to descendant text collection. Reads of `textContent` visited 3,750,510 nodes. Of those visits, 3,333,505 came from reads covering at least 16 nodes. An oracle restricted to the same mutation generation could have avoided at most 868,968 visits, before charging for indexing or invalidation. In an isolated upstream experiment, checking cheap byline eligibility before reading descendant text saved 852,254 visits and preserved the extracted article hash. That change belongs to Mozilla’s application and is excluded from RunDOM’s timing tables.

The same run made 249,826 public inline-style lookups, created 62,353 views and fully materialized only 366 inline declarations. The 130 inputs contained about 25.6 million characters. There were also 317 form-owner scans covering 458,119 nodes, with zero explicit form references. These counts motivated separate tests of view storage, descendant text construction and form lookup.

Four rotated trials tested string concatenation, bounded recursive text traversal and delayed form-ID lookup against the same unmodified implementation. Each used a physically separate loader, verified by the loaded module path, and every trial produced the same article hash. The delayed form lookup retired essentially the same number of instructions. The bounded traversal appeared to save memory in that first screen. On a rebuilt candidate with the ordinary DOM node-kind checks, three further pairs put application peak RSS at **555.6 versus 528.5 MiB** and elapsed at **7.92 versus 6.85 s**. The full test suite took 14.44 versus 14.26 s. That result ruled out landing the traversal rewrite. An early unqualified screen resolved some experimental loaders to the control through symlinks. It is excluded from these measurements. [Qualified traversal trials](real-project-performance-2026-11-22.json)

## Material UI

A worker-level allocation profile of Autocomplete observed about 3,076 MiB of cumulative sampled V8 allocations across 348 passing cases and 13 upstream skips. Computed style accounted for **591 MiB inclusive**. Other inclusive stacks included stylesheet collection at 190 MiB and DOM insertion at 221 MiB. The categories overlap. React element construction accounted for 210 MiB of self allocations and Stylis’s hottest function for 131 MiB. GC was the hottest individual CPU frame. Allocation volume measures objects created during the run, including collected objects. [Upstream Autocomplete suite](https://github.com/mui/material-ui/blob/4c499c5a4c00dcece4ae60e5d33ec810def4f2ba/packages/mui-material/src/Autocomplete/Autocomplete.test.js)

| Worker counter                                              |           Observed |
| ----------------------------------------------------------- | -----------------: |
| Calls requesting the stylesheet collection                  |             11,177 |
| Collection rebuilds                                         |                737 |
| Rebuilds with changed owner membership or initial discovery |                632 |
| Rebuilds with exactly the same ordered sheet records        |                105 |
| Nodes visited during discovery                              |            269,328 |
| Insertions with neither active observers nor XPath tracking | 133,010 of 133,010 |
| Inserted style elements                                     |             41,874 |
| Text insertions into style elements                         |             83,748 |
| New sheets first created with empty CSS                     |             41,874 |
| Empty sheets subsequently replaced with nonempty CSS        |             39,007 |
| Distinct nonempty CSS strings parsed                        |                462 |
| CSS syntax cache misses across 39,007 requests              |              7,371 |

Emotion’s development build creates a style element with an empty text child, connects it, then appends the rule text. RunDOM eagerly creates a public stylesheet at connection even when the application has yet to read it. This explains much of the stylesheet churn. Rebuilding the collection also finds genuinely new owners in most rounds. All measured syntax misses together took 173 ms. Charging each distinct string once at its average observed cost puts avoidable repeat parsing at about 163 ms. [Worker counters](real-project-performance-2026-11-22.json)

The worker had 55,101 active CPU samples. RunDOM and its bundled CSS runtime appeared on 22,645 stacks. Of 9,038 samples within computed style, 2,444 came through Popper’s scroll-parent lookup, 2,240 through the focusability check and 1,777 through Testing Library’s role accessibility check. Popper accounted for 1,340 of the 1,543 samples that fully materialized a deferred computed declaration. This identifies reads of the overflow properties as a candidate for avoiding full declaration construction. The 9,038 samples represent 16.4% of active worker samples. They measure part of the run that DOM changes can influence.

### Reading deferred computed styles

Popper checks all three overflow properties on the same ancestor. JavaScript's `overflowX` and `overflowY` getters previously reached the deferred view under their JavaScript names. The view indexes CSS property names. RunDOM now resolves those getters through the canonical CSS name and uses the snapshot’s initial overflow values when there is no winning declaration for the shorthand, either axis, either logical property or `all`. Otherwise it computes the declaration through the existing path. This also lets other JavaScript aliases use the same deferred lookup as `getPropertyValue`. The change adds no cache. A differential test compared 29,142 public computed and inline property readings. The targeted regression checks snapshots taken before and after a style mutation, including after enumeration. [Declaration accessors](../packages/dom/src/css-declaration-view.ts) · [Computed snapshot](../packages/dom/src/styles.ts) · [Regression test](../packages/jsdom/test/computed-reuse.test.ts)

| Autocomplete worker, median of three pairs | Before CSS change | After CSS change |
| ------------------------------------------ | ----------------: | ---------------: |
| Elapsed during the test file               |           21.73 s |          20.19 s |
| CPU during the test file                   |           24.09 s |          21.92 s |
| Retired instructions                       |     83.18 billion |    79.43 billion |
| Worker peak RSS                            |         412.9 MiB |        432.0 MiB |
| Worker peak physical footprint             |         468.0 MiB |        440.4 MiB |
| File-end heap, two forced collections      |         93.94 MiB |        93.71 MiB |

An independent counter in the full-declaration constructor recorded **2,177 materializations before and 179 after** across the same 348 passing cases. Avoiding 1,998 full declarations removed 91.8% of that work. Every uninstrumented pair reduced worker instructions and CPU. Median CPU fell 9.0% and elapsed fell 7.1%. Peak RSS rose in all three pairs, by 70.4, 11.7 and 18.4 MiB. The file-end heap and the OS physical-footprint measurements show different outcomes. These runs establish a CPU gain with a measured peak-RSS cost. The worker captured hardware counters for itself. The command and worker lifetimes are reported separately in the trial data. [Individual worker measurements](real-project-performance-2026-11-22.json)

### Stylesheet and insertion experiments

- **Empty stylesheets.** Deferring the empty association cut stylesheet constructions from 80,881 to 39,007 in the unchanged Autocomplete suite. One paired heap profile fell from 3,103 to 3,059 MiB of cumulative allocations, and insertion stacks fell from 228 to 195 MiB. The two initial timing pairs gave 23.56 s of baseline worker CPU and 26.56 s for the prototype. There was also an observable regression. After connecting an empty style element, setting its media attribute synchronously invoked a redefined stylesheet media setter on baseline. The prototype missed that call even after guarding elements that already had media at attachment. This prototype was excluded. A future deferred association would need to retain the original sheet revision and deliver media changes at their original time.
- **Mutation records.** Skipping unobservable child-list record construction removed the work on all 133,010 insertions. Across four pairs, worker CPU was 26.19 s on baseline and 26.33 s with the guard. File-end heap after GC was 94.37 and 94.38 MiB. Worker peak RSS moved from 444.7 to 413.8 MiB by median, with most of the paired difference coming from one run. This guard was excluded.
- **Inline style storage.** On Readability, moving the cached public style view from a weak map to its raw element produced 49.08 billion retired instructions against 48.91 billion on control. Peak RSS was 588.9 and 588.3 MiB, respectively. All article output hashes agreed. The storage change was excluded.

## Ant Design

In the eight-file selection, the Radio Group file had 1,186 active worker CPU samples. RunDOM appeared in 401 and computed style in 211. Of those 211 samples, 195 came through Testing Library’s accessibility predicate and only two samples in the entire file reached full deferred-declaration materialization. That distinction matters for choosing a fix. Popper in Material UI often pays to materialize values. Radio Group pays earlier, while RunDOM works out which declarations apply. Checkbox Group also spent 148 of 935 active samples in computed style and the Alert index file spent 178 of 909. [Per-file worker profiles summarized](real-project-performance-2026-11-22.json)

A separate run counted 352 computed-style requests across the eight files. In Radio Group, 3 of 112 requests reused the target’s saved cascade, 63 reused an ancestor, and 46 took the remaining cascade path. In Alert, 140 of 146 requests encountered a stylesheet whose CSSOM had been exposed. These are two distinct obstacles to reuse. On the Radio Group computed-style stacks, 123 of 211 samples passed through stylesheet scope application, 75 through applying declarations, 46 through building or looking up the cascade subject index, and 40 through parsing stylesheet rules. Selector matching itself appeared on 10 samples. The counts overlap. These timings make reuse across repeated sheet owners worth testing. Radio Group connected 74 nonempty sheets containing only 13 distinct CSS texts. All 61 repeat requests hit the syntax cache, so increasing that cache would leave the repeated work below it. There are already caches for parsed selections and declaration blocks. A trial would need to identify repeated misses and preserve the identity of public mutable rules. For Alert, a reusable result would need to account for public stylesheet mutations after exposure. Across all eight files only four requests reused the exact target. [Per-file cascade counters](real-project-performance-2026-11-22.json)

## Next.js Vitest example

The same five named cases passed in all 25 fresh invocations. Each round rotated the four providers and the baseline RunDOM build. Times include Vitest setup, imports and test execution with one worker. Body time sums the five test durations. The peak RSS column reports the operating system’s high-water figure for the command. This example’s small documents give the HTML text scanner few opportunities. [Source of the five tests](https://github.com/vercel/next.js/tree/807c3b5b1d8c4d553962a767e2700d394a5e3bbb/examples/with-vitest) · [Individual trial results](real-project-performance-2026-11-22.json)

| Provider                    | Median process | Median body |  Peak RSS |
| --------------------------- | -------------: | ----------: | --------: |
| RunDOM baseline             |         4.20 s |      209 ms | 113.9 MiB |
| RunDOM, first parser change |         4.01 s |      210 ms | 112.7 MiB |
| jsdom 26.1.0                |         6.81 s |      454 ms | 142.1 MiB |
| Happy DOM 21.0.4            |         5.20 s |      157 ms | 118.2 MiB |
| TurboDOM 0.7.1              |         3.54 s |      117 ms | 104.1 MiB |

The test files and configuration came from the pinned example, whose manifest uses floating dependencies. Resolved versions are in the trial data. Vitest 3.2.7 required `transformMode: "web"` on the TurboDOM adapter. Its published adapter alone produced five environment-load errors before any assertion. The timed adapter supplied that single configuration field and delegated setup and teardown to the published implementation. The other providers used their respective Vitest environments. A worker hook verified the loaded provider. A subsequent run using the final packaged RunDOM source passed the same five cases in 3.19 s with 116.5 MiB command peak RSS. The provider table uses the five-run medians.

## Coverage and reproduction

Ant Design’s eight-file selection passed the same 133 named cases on the baseline and candidate. The restored checkout used the pinned source with freshly installed npm dependencies. Material UI used its pinned pnpm workspace and one Vitest worker. These are selected real project suites. React and Drone transforms, Svelte’s asynchronous waits and Material UI Select’s 2.30 s of explicit sleeps were measured in prior batches. The earlier multi-provider and 11-project results have their own dates and test counts. [Earlier runner attribution](jsdom-real-workload-costs.md) · [Earlier provider comparisons](real-project-benchmarks-inline-css.md)

For the application stage, build each RunDOM revision separately, run the command below with its CommonJS facade, and compare the emitted article digest before comparing time. For the test stage, run Readability’s own Mocha suite with the single provider selected under the `jsdom` module name. Its named-test filter is `^Test pages [^ ]+ jsdom `. Keep test workers serial and alternate process order. Use operating-system process timing for elapsed, CPU and peak RSS and retain each individual run.

```sh
node --expose-gc scripts/benchmark-readability.mjs /path/to/readability "$PWD/packages/jsdom/dist/jsdom.cjs"
```

For Material UI, use the source-linked Autocomplete file with Vitest’s `node:@mui/material` project, one worker, `CI=1`, `TZ=UTC` and `TEST_SCOPE=node`. The timing runs disabled file parallelism, transform cache and filesystem module cache. The allocation experiment used a separate worker setup file that started Node Inspector’s CPU and heap sampling in `beforeAll`, stopped them in `afterAll`, and recorded RSS after each case. CPU sampling used a 500 µs interval. Heap sampling used a 256 KiB interval with minor- and major-GC collections included. The ordinary timing runs kept the inspector disabled. Capture inside the test worker to see React, Popper, Testing Library and the DOM implementation in the same call stacks.

For the worker hardware measurements, a short child process called macOS `proc_pid_rusage(getppid(), RUSAGE_INFO_V4, ...)` before and after the Vitest file. The delta in `ri_instructions` measures instructions retired by the worker. `ri_lifetime_max_phys_footprint` reports its lifetime peak. Node’s `process.resourceUsage().maxRSS` supplies worker peak RSS, and `process.cpuUsage()` supplies user plus system CPU. Measure elapsed, CPU and RSS for the outer command separately with `/usr/bin/time -lp`. The outer command’s hardware counters can omit work done in child processes. For the materialization count, increment a worker-local counter at the full computed declaration’s materialization and compare the count only after confirming the same named test outcomes.
