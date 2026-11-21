# RunDOM on Mozilla Readability and framework suites

Measurements from November 20, 2026 on an Apple M4 with Node 24.20.0. Framework timings use the installed upstream projects, one worker and the same cache settings on each provider. This report distinguishes changes to RunDOM from differences between providers.

## Article extraction

Mozilla Readability 0.6.0 supplies 130 saved pages covering real articles. Its upstream jsdom branch checks extracted content, titles, excerpts, bylines and metadata in 903 tests. The direct application replay separately times creation of a document and execution of Readability.parse(), closes each window, and hashes every returned article. Both runs use the same fixed page order, URL and class-preservation setting. The direct replay uses the original input including comments. The upstream suite removes comments and also parses both expected and actual content for its assertions. [Pinned upstream source](https://github.com/mozilla/readability/tree/ab4027a8b37669745016869a37a504727992b2ba)

| 130 articles, mean of two processes | Construct s | Extract s | Close s | Process s | Peak RSS MiB | Same-turn heap MiB | Next-turn heap MiB |
| ----------------------------------- | ----------- | --------- | ------- | --------- | ------------ | ------------------ | ------------------ |
| Prior RunDOM                        | 1.33        | 1.86      | 0.00    | 3.71      | 1021         | 632                | 39                 |
| Final RunDOM                        | 1.12        | 1.48      | 0.00    | 2.81      | 750          | 125                | 34                 |
| Pinned jsdom 20.0.2                 | 3.24        | 2.50      | 0.04    | 6.33      | 1363         | 770                | 45                 |

The process measurement includes loading the package and fixtures, hashing results, and collecting heap diagnostics. Same-turn heap was sampled with forced GC immediately after all windows were closed. The last heap measurement followed an event-loop turn and another GC. The difference between these checkpoints measures transient retention during a synchronous batch. Old and new RunDOM produced byte-identical article JSON. [Direct application replay](../.cache/insertion-work-BK4JCP/app.cjs) · [Final process measurements](../.cache/insertion-work-BK4JCP/new1.app) · [Control measurements](../.cache/insertion-work-BK4JCP/old0.app)

All 130 articles also had identical metadata and textContent across RunDOM and pinned jsdom. Five content strings differed in serialization. An independent parse5 parse of each fragment compared every node, text value, namespace and sorted attribute. All 130 trees matched. [Per-page output comparison](../.cache/insertion-work-BK4JCP/output-equivalence.json)

For a fresh direct replay, run the following command with an installed Readability checkout and a built jsdom-compatible entry. Omit the entry to measure the checkout’s installed jsdom. The script releases its fixture array before sampling heap. The table above uses the linked application harness and includes accessible fixture data in its same-turn measurement. Both runs produced the same article digest.

```sh
node --expose-gc scripts/benchmark-readability.mjs /path/to/readability /path/to/jsdom-entry.cjs
```

### Upstream test suite

| Provider                | Runs | Pass | Fail or failed hook | Mocha s | Process s | CPU s | Peak RSS MiB |
| ----------------------- | ---- | ---- | ------------------- | ------- | --------- | ----- | ------------ |
| Prior RunDOM            | 5    | 903  | 0                   | 5.49    | 5.72      | 8.35  | 860          |
| Final RunDOM            | 5    | 903  | 0                   | 4.89    | 5.11      | 7.41  | 795          |
| jsdom 20.0.2            | 2    | 903  | 0                   | 9.91    | 10.26     | 13.79 | 1434         |
| jsdom 30.1.3 diagnostic | 2    | 903  | 0                   | 11.24   | 11.82     | 15.78 | 1174         |
| Happy DOM 21.0.4        | 1    | 895  | 8                   | 5.87    | 6.23      | 8.67  | 1647         |
| TurboDOM 0.7.1          | 1    | 281  | 86                  | 1.00    | 1.16      | 1.65  | 452          |

The suite table uses medians. Happy DOM used its Window and document.write with script evaluation and resource loading disabled. TurboDOM used its native createEnvironment with the fixture URL. Happy DOM failed eight assertions. TurboDOM failed setup for 86 pages, frequently because an attribute lacked cloneNode(), leaving 281 of 903 assertions executed. [Upstream runner and command](../.cache/insertion-work-BK4JCP/pages.py) · [Happy DOM failures](../.cache/insertion-work-BK4JCP/happy-qualified.json) · [TurboDOM failures](../.cache/insertion-work-BK4JCP/turbo-qualified.json)

## Costs found in the engine

1. Live collections, query indices and query results allocated weak references for individual nodes or result vectors. A sampled allocation-site probe attributed most weak references to those three paths. V8 keeps newly referenced targets alive until the end of the current JavaScript job. The replacement stores membership under weak roots or collection keys and discards it on mutation and cross-realm transfer. A retained static NodeList continues to own its snapshot. In a separate three-window adoption probe, live collections followed each move and removed wrappers became collectible. [Allocation-site sample](../.cache/insertion-work-BK4JCP/weak.log) · [Adoption and collection probe](../.cache/insertion-work-BK4JCP/ownership.cjs)

2. Closed windows remained reachable through scheduled document-load callbacks. Frames added a second path through queued completion handlers. Closing a window now cancels its pending load task and drops the blank frame callback. Frame promise bookkeeping captures only its pending set. An isolated 100-window close loop went from 71 to 12 MiB before yielding. The 40-frame diagnostic fell from 45 to 12 MiB before microtasks ran. [Window probe](../.cache/insertion-work-BK4JCP/close.cjs) · [Frame probe](../.cache/insertion-work-BK4JCP/syncmem.cjs)

3. Large import-free stylesheets built CSSOM rules and selector machinery during document creation, including pages that subsequently discarded the stylesheet. Attachment still parses syntax and reports errors. Rule construction starts on rule access or cascade evaluation. Imports are processed on attachment. The inline style path also reuses the public view and can answer an absent longhand without parsing unrelated declarations. HTML tag names use a fixed table for known tag names. In upstream test profiles with 5,370 and 5,334 samples, inclusive parseSheet samples fell from 253 to 53, publicInlineStyle from 213 to 73, and nodeName from 176 to 55. Remaining major costs include parse5, allocating Window interfaces, GC, and the upstream assertion helper that rebuilds node paths. [Control CPU profile](../.cache/insertion-work-BK4JCP/profile.cpuprofile) · [Final CPU profile](../.cache/insertion-work-BK4JCP/cpu-final.cpuprofile)

An earlier experiment combined subtree insertion scans. The four-run Material UI check did not establish a material improvement. That experiment was removed before qualifying this build. [Insertion experiment](../.cache/insertion-work-BK4JCP/replay.log)

## Framework comparison

Each cell shows process seconds, peak RSS in MiB, then passed/failed/skipped tests. The RunDOM and jsdom columns use the final serial comparison. Happy DOM and TurboDOM use their independent project runs. Some screening runs overlapped diagnostic work. Treat small timing differences as uncertain. Pass counts reflect the tests each environment actually collected and enabled. A provider that runs fewer tests has a different workload.

| Project                   | RunDOM                   | jsdom                   | Happy DOM                 | TurboDOM                    |
| ------------------------- | ------------------------ | ----------------------- | ------------------------- | --------------------------- |
| Material UI, 10 files     | 17.40 / 600 / 1087/0/87  | 22.38 / 480 / 1087/0/87 | 28.60 / 594 / 1137/22/15  | 25.62 / 383 / 458/701/15    |
| Ant Design, 8 files       | 5.64 / 598 / 133/0/0     | 6.68 / 627 / 133/0/0    | 5.78 / 591 / 128/5/0      | 5.00 / 584 / 121/12/0       |
| Vue runtime-dom           | 2.83 / 402 / 270/0/1     | 6.63 / 516 / 270/0/1    | 3.78 / 391 / 251/19/1     | 2.24 / 344 / 169/32/1       |
| Svelte runtime and motion | 31.83 / 543 / 6012/90/34 | 35.46 / 568 / 6102/0/34 | 32.54 / 509 / 5823/279/34 | 5.35 / 427 / 0/0/0 (exit 1) |
| Next.js Vitest example    | 1.15 / 145 / 5/0/0       | 1.74 / 153 / 5/0/0      | 1.39 / 124 / 5/0/0        | 0.98 / 116 / 5/0/0          |
| freeCodeCamp, 2 files     | 1.37 / 165 / 4/0/0       | 1.37 / 191 / 4/0/0      | 1.20 / 177 / 4/0/0        | 0.99 / 153 / 4/0/0          |
| Supabase UI               | 4.27 / 197 / 85/0/0      | 8.12 / 309 / 85/0/0     | 4.94 / 177 / 84/1/0       | 4.75 / 158 / 80/5/0         |

### Execution stages

| Selection                 | All named outcomes match jsdom | RunDOM summed bodies s | jsdom summed bodies s | RunDOM runner phase report                                                                  |
| ------------------------- | ------------------------------ | ---------------------- | --------------------- | ------------------------------------------------------------------------------------------- |
| Material UI, 10 files     | yes                            | 13.24                  | 16.35                 | Duration 16.78s (tests 82%, import 7%, transform 6%, setup 3%, environment 2%)              |
| Ant Design, 8 files       | yes                            | 1.15                   | 1.26                  | Duration 5.35s (transform 45%, tests 23%, setup 20%, import 8%, environment 4%)             |
| Vue runtime-dom           | yes                            | 0.40                   | 0.39                  | Duration 2.55s (transform 331ms, setup 36ms, import 912ms, tests 410ms, environment 415ms)  |
| Svelte runtime and motion | no                             | 23.96                  | 26.48                 | Duration 31.22s (transform 8.16s, setup 0ms, import 6.40s, tests 24.00s, environment 223ms) |
| Next.js Vitest example    | yes                            | 0.07                   | 0.12                  | unreported                                                                                  |
| freeCodeCamp, 2 files     | yes                            | 0.05                   | 0.07                  | Duration 1.08s (transform 204ms, setup 252ms, import 605ms, tests 56ms, environment 47ms)   |
| Supabase UI               | yes                            | 0.90                   | 1.72                  | Duration 4.03s (import 29%, tests 27%, setup 27%, environment 11%, transform 4%, worker 1%) |

Vitest reports phase summaries differently across upstream versions. Sum of case durations can differ from the runner’s test phase. The final full Svelte run matched every named pass, failure and skip in the archived RunDOM run. Full Svelte uses jsdom 25.0.1 and its broader nine-project selection. The existing 90 RunDOM failures include inert reflection and CSS expectations. TurboDOM stopped during collection. [Raw project reports and provider resolution traces](../.cache/insertion-work-BK4JCP/real/)

### Change against the previous RunDOM build

| Selection             | Previous s | Final repetitions s | Previous bodies s | Final bodies s | Previous peak MiB | Final peaks MiB |
| --------------------- | ---------- | ------------------- | ----------------- | -------------- | ----------------- | --------------- |
| Material UI, 10 files | 18.55      | 17.40 / 18.35       | 14.34             | 13.24 / 14.14  | 547               | 600 / 603       |
| Ant Design, 8 files   | 5.96       | 5.64 / 5.92         | 1.28              | 1.15 / 1.34    | 600               | 598 / 599       |
| Vue runtime-dom       | 3.42       | 2.83 / 2.87         | 0.48              | 0.40 / 0.42    | 402               | 402 / 397       |

### Native Jest selections

| Selection      | Provider  | Pass | Fail | Failed files | Exit | Process s | Peak RSS MiB |
| -------------- | --------- | ---- | ---- | ------------ | ---- | --------- | ------------ |
| react          | jsdom     | 64   | 0    | 0            | 0    | 5.51      | 825          |
| react          | rundom    | 64   | 0    | 0            | 0    | 4.68      | 872          |
| react          | happy-dom | 63   | 1    | 1            | 1    | 6.00      | 804          |
| react          | turbo-dom | 61   | 3    | 1            | 1    | 5.78      | 835          |
| drone          | jsdom     | 1    | 0    | 0            | 0    | 4.68      | 647          |
| drone          | rundom    | 1    | 0    | 0            | 0    | 3.59      | 634          |
| drone          | happy-dom | 1    | 0    | 0            | 0    | 5.63      | 651          |
| drone          | turbo-dom | 0    | 1    | 1            | 1    | 3.19      | 630          |
| scully         | jsdom     | 8    | 0    | 0            | 0    | 1.87      | 475          |
| scully         | rundom    | 8    | 0    | 0            | 0    | 1.10      | 487          |
| scully         | happy-dom | 0    | 0    | 3            | 1    | 1.15      | 412          |
| scully         | turbo-dom | 8    | 0    | 0            | 0    | 1.38      | 474          |
| scully-globals | jsdom     | 5    | 0    | 0            | 0    | 1.00      | 431          |
| scully-globals | rundom    | 5    | 0    | 0            | 0    | 0.94      | 428          |
| scully-globals | happy-dom | 0    | 0    | 2            | 1    | 0.89      | 399          |
| scully-globals | turbo-dom | 5    | 0    | 0            | 0    | 1.05      | 403          |

Scully uses the existing identical Jest teardown guard for RunDOM and jsdom. Three tests construct jsdom explicitly. The globals-only selection excludes that file. [Jest reports and environment resolution](../.cache/insertion-work-BK4JCP/jest-providers/)

## Material UI worker memory

| Diagnostic build | Highest worker peak MiB | Largest pre-teardown GC heap MiB | Largest post-teardown GC heap MiB | Median post-teardown GC heap MiB |
| ---------------- | ----------------------- | -------------------------------- | --------------------------------- | -------------------------------- |
| control          | 579.5                   | 91.9                             | 91.7                              | 55.7                             |
| final            | 591.5                   | 91.9                             | 91.8                              | 55.8                             |
| stock            | 465.2                   | 111.0                            | 110.9                             | 75.0                             |

Each file ran in its own fork. The diagnostic sampled V8 twice with an intervening event-loop turn both immediately before and after environment teardown. The measurements include Vitest and project modules. Diagnostic wall times are excluded from the timing comparison. [Worker samples](../.cache/insertion-work-BK4JCP/final-retained.jsonl) · [Baseline samples](../.cache/insertion-work-BK4JCP/control-retained.jsonl) · [jsdom samples](../.cache/insertion-work-BK4JCP/stock-retained.jsonl)

Autocomplete set the worker high-water mark. Immediately before forced GC at teardown, the final RunDOM worker had 457 MiB of V8 heap capacity and 124 MiB used. jsdom had 373 MiB of capacity and 184 MiB used. Old-space physical size was 284 MiB on RunDOM and 203 MiB on jsdom, while used old space was 64 and 134 MiB respectively. That separates most of the sampled RSS gap from live object retention. After teardown, Autocomplete retained 91.8 MiB on RunDOM and 110.9 MiB on jsdom. The prior RunDOM build retained 91.7 MiB. An allocation trace or heap sample taken at teardown cannot identify which allocation first caused V8 to expand.

## DOM laboratory

The laboratory used three fresh trials per provider and scenario on the shared host, 512 fixture elements, eight operations per warm batch, and eight windows in the memory probes. The cold style read and warm window creation and traversal remain large TurboDOM gaps. Its query-all iteration failed the correctness screen. RunDOM and jsdom completed all six scenarios. Diagnostic medians follow.

| Warm batch ms        | RunDOM | jsdom  | Happy DOM | TurboDOM      |
| -------------------- | ------ | ------ | --------- | ------------- |
| windows-create-close | 4.739  | 13.108 | 13.056    | 0.086         |
| parse-html-traverse  | 8.943  | 57.880 | 58.665    | 1.070         |
| query-all-iterate    | 0.666  | 1.505  | 0.614     | failed screen |
| query-after-mutation | 0.117  | 1.112  | 0.511     | 0.177         |
| role-query           | 0.233  | 6.629  | 0.143     | 0.134         |
| style-read           | 0.012  | 0.018  | 0.006     | 0.009         |

The phase reports include package load, environment setup, first operation, warm batch, and memory after use, close and reference release. [Timing stages](../.cache/performance-lab-cD8Fug/timing-CFxweR/analysis.md) · [Memory checkpoints](../.cache/performance-lab-cD8Fug/memory-xSqvyj/analysis.md)

The first style read was 15.25 ms on RunDOM, 24.07 ms on jsdom, 3.14 ms on Happy DOM and 1.49 ms on TurboDOM. After eight styled windows were closed and references released, the worker retained 26.56 MiB on RunDOM, 50.67 MiB on jsdom, 25.22 MiB on Happy DOM and 16.41 MiB on TurboDOM.

## Compatibility and reproducibility

The repository gate passed 15 of 15 tasks. Both the TypeScript and Rust parser configurations passed all 634 upstream jsdom API tests. The focused WPT run recorded 423 passing assertions and one pre-existing template-adoption failure per parser. Three fixtures marked expected failures passed their assertions and were reported as unexpected passes by Mocha. This selection covers queries, named properties, adoption and stylesheets. [Repository gate](../.cache/insertion-work-BK4JCP/check.log) · [TypeScript WPT](../.cache/insertion-work-BK4JCP/wpt-final-typescript.log) · [Rust WPT](../.cache/insertion-work-BK4JCP/wpt-final-rust.log)

The Mozilla, Vitest and Jest workloads used the TypeScript HTML parser. Raw validation and benchmark files include provider paths and project reports. All measurements used local checkouts and local CPU and memory. [Serial comparison driver](../.cache/insertion-work-BK4JCP/complete.py) · [Framework selections](../.cache/insertion-work-BK4JCP/real/run.py)
