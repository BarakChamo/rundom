# CSS performance on component workloads

Measured on an Apple M4 using Node 24.20.0, with fresh processes and one worker per upstream invocation. The baseline is the packaged RunDOM build from the preceding [project evaluation](jsdom-real-workload-costs.md). Project speed comparisons use identical case names and outcomes. Profiles and diagnostic counters ran separately from ordinary timing.

## Changes and isolated measurements

The per-scope stylesheet index can now preserve an exposed sheet in source order and index the private sheets around it. Exposing a new sheet invalidates the cached index. Private multi-rule sheets qualify when all contributing selectors have provable subjects. Nested rules, unknown selectors and mutable sheets keep their conservative path. The independent computed-style snapshots and CSSOM mutations remain observable.

An inline style can represent an empty declaration or one common color, display, position or visibility keyword through its content attribute until an operation needs the complete declaration engine. CSSOM reflection retains the same public object. Complex values, multiple declarations and computed style use the full implementation.

For CSS-in-JS, ordinary raw text assigned to an HTML style element can become a text node directly. Exceptional tokenizer inputs, source locations and custom adapters retain the parser. Repeated flat rules share selector metadata until public exposure, and live CSSRuleList instances expose individual members on access. Appending ordinary rules to a namespace-free sheet avoids two scans over previously inserted rules.

| Checked operation                                       | Wall ms, before → after | Peak RSS MiB    | Live heap MiB after GC |
| ------------------------------------------------------- | ----------------------- | --------------- | ---------------------- |
| 600 cascade reads across 192 sheets, one exposed        | 69.82 → 42.61           | 147.81 → 140.00 | 21.96 → 22.00          |
| First inline assignment and serialization               | 41.88 → 2.02            | 110.14 → 109.06 | 17.84 → 17.84          |
| 160 replacements of 68.6k characters in a style element | 185.76 → 3.11           | 108.70 → 81.83  | 11.21 → 10.53          |
| 4,000 ordinary CSSOM insertions                         | 66.82 → 21.69           | 111.75 → 112.05 | 18.89 → 18.89          |
| 1,600 live elements with a single inline declaration    | 108.00 → 52.15          | 149.67 → 95.83  | 22.51 → 15.87          |

Seven alternating fresh-process pairs per operation, comparing successive implementation slices. The 1,600-element timer includes provider load and Window creation. The other timers cover the named operation. Explicit GC changes Node’s runtime configuration. On the cold-style probe, a subsequent full computed-color read took 3.70 ms before and 43.40 ms after, so code that immediately needs the full engine still pays its startup cost.

Reading cssRules.length while appending 3,000 rules, then exposing a single member, took 23.4 → 22.5 ms across nine alternating pairs. On-demand rule views reduced live heap from 15.46 to 14.64 MiB.

## What changed in real suites

| Project     | Sheet visits before filtering | Old index | Mixed private and exposed | Including multi-rule sheets |
| ----------- | ----------------------------- | --------- | ------------------------- | --------------------------- |
| Ant Design  | 8911                          | 8285      | 7159                      | 6924                        |
| Material UI | 645083                        | 19713     | 19713                     | 19713                       |

A visit is a sheet passed to cascade evaluation for a particular element and scope. Material UI already eliminated 97% of possible visits. The additional filtering reduces Ant Design’s sheet visits by 16.4%. In Vue’s first string-style patch the median fell from 25.2 to 1.6 ms. Its first v-show truthy case fell from about 22 to 5 ms. The useCssVars case, which needs the full engine, stayed around 25 ms. Some subsequent tests in the same worker now pay the first full CSS read.

Three fresh pairs compare the final package with the frozen baseline. The jsdom column uses three fresh runs of each upstream checkout’s installed version. RSS is the peak reported for the command.

| Project            | Previous RunDOM s | Final RunDOM s | jsdom s | Test bodies s, previous → final | Peak RSS MiB, previous → final |
| ------------------ | ----------------: | -------------: | ------: | ------------------------------- | ------------------------------ |
| Ant Design         |             5.341 |          5.236 |   6.300 | 1.216 → 1.163                   | 597.3 → 597.2                  |
| Material UI        |             7.772 |          7.826 |   9.828 | 5.465 → 5.563                   | 340.6 → 328.0                  |
| Vue runtime-dom    |             2.737 |          2.682 |   6.410 | 0.399 → 0.399                   | 396.9 → 392.0                  |
| Svelte runes shard |             5.916 |          5.870 |   6.172 | 4.728 → 4.739                   | 365.2 → 364.1                  |

Five additional pairs measured CPU used by the executing test thread between each case’s entry and exit. Ant Design used 1.195 → 1.154 CPU seconds. Material UI used 2.614 → 2.664 CPU seconds. These CPU measurements exclude time spent collecting the files and waiting for timers.

A two-pair trace of the cssstyle capability getter located a timing shift in every Material UI worker. On the baseline all five workers initialized declarations before the first test. On the final package all five initialized them inside a test, spending 9–11 ms each. That accounts for about 50 ms moving into test intervals. In the independent five-pair comparison, median test-thread CPU rose by 50 ms. End-to-end wall time rose by 54 ms (0.7%) while peak RSS fell by 12.6 MiB. These data establish where initialization moved; the net wall difference includes other work and run-to-run variation. [Initialization trace](../.cache/css-three-nnUdyn/css-init)

### Captured Material UI stylesheet stream

Nine rotated pairs replayed the Select worker’s 13,850 stylesheet strings, appending, exposing and removing each style element. A separate control created 600 unique styles. The implementation constructs attached sheets directly, resolves encoding when a source actually changes, reuses the syntax engine, and reads text nodes without allocating an intermediate array. Live and closed measurements are incremental heap over a warmed Window after explicit GC.

| Workload | Thread CPU ms, previous → final | Peak RSS MiB    | Live heap MiB | Closed heap MiB |
| -------- | ------------------------------- | --------------- | ------------- | --------------- |
| select   | 125.53 → 116.65                 | 179.38 → 179.53 | 9.08 → 8.58   | 5.60 → 5.60     |
| unique   | 10.27 → 9.92                    | 108.09 → 108.25 | 0.86 → 0.84   | 1.00 → 0.91     |

## Compatibility and comparator coverage

The repository gate passed all 15 tasks. Both parsers passed all 1,626 facade tests and 634 upstream jsdom API tests. Next.js, Supabase UI, freeCodeCamp, Svelte motion, React, Drone and Scully matched their reference selections.

The CSS, selector, query and mutation WPT selections matched all 13,347 individual baseline assertion outcomes on each parser. The CSS selection contains 650 passing fixtures, 106 baseline failures and 25 pending fixtures; the mutation selection passed all 17 fixtures.

| Passed / failed / skipped | RunDOM       | jsdom        | Happy DOM    | TurboDOM      |
| ------------------------- | ------------ | ------------ | ------------ | ------------- |
| Ant Design                | 133 / 0 / 0  | 133 / 0 / 0  | 128 / 5 / 0  | 121 / 12 / 0  |
| Material UI               | 430 / 0 / 39 | 430 / 0 / 39 | 454 / 8 / 7  | 181 / 281 / 7 |
| Vue runtime-dom           | 270 / 0 / 1  | 270 / 0 / 1  | 251 / 19 / 1 | 169 / 32 / 1  |
| Svelte runes shard        | 565 / 0 / 9  | 565 / 0 / 9  | 561 / 4 / 9  | 0 / 0 / 0     |

TurboDOM stopped during Svelte collection and missed some Vue files. Material UI enabled a different set of tests on Happy DOM and TurboDOM. Their durations cannot establish a speed ranking on these selections. The broader Svelte runtime and motion selection still has 6,012 passes, 90 failures and 34 skips on RunDOM.

[Per-stage summary](../.cache/css-three-nnUdyn/summary.json) · [Project logs and reports](../.cache/css-three-nnUdyn/real) · [Test-thread CPU intervals](../.cache/css-three-nnUdyn/worker-cpu) · [Candidate counters](../.cache/css-three-nnUdyn/count) · [Isolated paired samples](../.cache/css-three-nnUdyn/probes.jsonl) · [Select stylesheet stream](../.cache/css-three-nnUdyn/stream-final.jsonl) · [Named WPT comparison](../.cache/css-three-nnUdyn/wpt-selected/combined-wpt-diff.json) · [React, Drone and Scully](../.cache/css-three-nnUdyn/selected-jest/checked-outcomes.jsonl)
