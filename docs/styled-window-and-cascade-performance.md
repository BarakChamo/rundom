# Styled Window and CSS cascade performance

The replay uses Node 24.20.0 on Apple M4 with RunDOM 0.0.1, jsdom 30.1.3, Happy DOM 21.0.4 and TurboDOM 0.7.1. RunDOM uses the TypeScript parser for timing. Upstream projects retain their locked jsdom versions. The lab runs serial fresh processes with independent medians for each stage. [Frozen runtime manifest](../.cache/styled-rss-campaign/cohort.json), [Previous replay](four-provider-benchmark-replay.md)

## Styled Window RSS

The baseline allocation capture sampled 397.93 MiB during warmup. Installing CSSStyleProperties accessors accounted for 388.40 MiB of direct allocations. The separate CPU capture attributed 94.54 ms of self time to accessor installation and 65.79 ms to garbage collection. The spike coincided with the first style read in each Window. The live heap returned to 65.41 MiB after collection while RSS stayed at 587.05 MiB. [Allocation capture](../.cache/performance-lab-Ev1CFS/allocation-RajlQm/windows-style-live-run-dom-0/warmup.heapprofile), [CPU capture](../.cache/performance-lab-Ev1CFS/cpu-KB7TKb/windows-style-live-run-dom-0/warmup.cpuprofile)

A standalone 32-prototype reproduction isolated descriptor installation. Adding the accessors individually or in a batch produced peak RSS of about 393 or 381 MiB. Installing them on a dictionary-backed prototype used about 66 MiB. RunDOM now establishes dictionary storage before defining the accessors. The prototype keeps the constructor descriptor, own-key order and distinct accessor functions in every Window. The focused four-provider memory replay cut RunDOM’s live RSS from 587.05 to 201.38 MiB and warmup from 170.09 to 14.08 ms. Retained heap remained at 65.41 MiB. [Prototype reproduction](../.cache/styled-rss-campaign/accessor-shape.cjs), [Four-provider memory replay](../.cache/performance-lab-HijXUG/memory-GUn2qn/report.json), [Implementation](../packages/dom/src/css-declaration-view.ts)

## Ant Design

The 133-case Ant Design CPU profile attributes 566 ms cumulatively to computed style and 296 ms to attaching stylesheets. Computed style repeatedly expanded and wrote inherited theme values. The existing counters counted about 195,000 custom-property winners after the previous ancestor-cache change. The public declaration write path was doing name conversion, priority tracking and shorthand checks on those resolved tokens. The cascade now stores normalized custom tokens directly after handling substitution and CSS-wide keywords. [CPU captures](../.cache/styled-rss-campaign/antd/antd-rundom-thread-profile-cpu), [Baseline counters](../.cache/property-cascade/trace-recency/antd.jsonl), [Implementation](../packages/dom/src/styles.ts)

Three rotated runs per build on the full Ant Design selection reduced median summed test time from 1,655.93 to 1,547.57 ms. Median wall time moved from 5.952 to 5.855 s. All 133 tests passed on both builds. In the same replay the full Material UI selection passed all 430 tests on both builds and had comparable test-body time. A second experiment changed custom-property setters and winner construction. Its Ant Design test-body medians were 1,584.62 and 1,580.85 ms and the changes were removed. [Paired Ant Design and Material UI trials](../.cache/styled-rss-campaign/paired/trials.log), [Second cascade trial](../.cache/styled-rss-campaign/cascade-pair/trials.log)

## Fragment replacement

The table profile showed a full realm-stamping traversal and several passes over nodes that could not participate in script, frame or stylesheet work. Fresh local fragments now use the local realm until a cross-Window transfer records their origin. Insertion collects eligible frame and script work before callbacks, and runs the stylesheet scan only when the subtree contains a style or link element. Radio normalization retains the full checked-default snapshot. The adoption test exercises previously unread descendants through a move to a different Window. [CPU capture](../.cache/styled-rss-campaign/fragment-table-read-cpu.json), [Adoption contract](../packages/jsdom/test/node-storage-contracts.test.ts), [Insertion implementation](../packages/dom/src/window.ts)

Skipping the realm walk moved the 64-operation warm table batch from 47.41 to 35.05 ms. The insertion change moved it from 35.04 to 31.63 ms in a separate paired run. The full-read batch moved from 50.47 to 38.91 ms and then from 38.75 to 35.90 ms. TurboDOM took about 75–76 ms on both. All 174 timed trials verified the checked work. [Realm comparison](../.cache/performance-lab-hC5m6H/comparison-klHQnR/report.md), [Insertion comparison](../.cache/performance-lab-JV84lE/comparison-QPvj9Q/report.md)

## Four-provider DOM replay

The default matrix used 256 rows and nine fresh processes per verified provider and scenario. Warm batches contain eight operations for Window creation, parsing, cloning and serialization, and 64 for the other workloads. The six dense scenarios use 4,096 rows and four operations. Memory runs use five fresh processes per provider and workload. [Every stage, completeness, screen failure and memory checkpoint](../.cache/styled-rss-campaign/lab-report.md)

| Provider  | Default scenarios | Verified default trials | Dense scenarios | Verified memory trials |
| --------- | ----------------: | ----------------------: | --------------: | ---------------------: |
| RunDOM    |             44/44 |                     396 |             6/6 |                  45/45 |
| jsdom     |             43/44 |                     387 |             6/6 |                  45/45 |
| Happy DOM |             38/44 |                     342 |             6/6 |                  45/45 |
| TurboDOM  |             36/44 |                     324 |             6/6 |                  45/45 |

Across the 35 default workloads completed by all four providers, the sums of process medians were 5.444 s for RunDOM, 17.861 s for jsdom, 11.610 s for Happy DOM and 5.694 s for TurboDOM. RunDOM had lower process medians on 43 of 43 jsdom matches, 38 of 38 Happy DOM matches and 7 of 36 TurboDOM matches. Across the six dense workloads the sums were 1.609, 8.442, 11.257 and 1.188 s respectively. Each sum weights the measured median of each workload once. [Timing data](../.cache/styled-rss-campaign/derived-metrics.json)

| Workload and metric                 | RunDOM |   jsdom | Happy DOM | TurboDOM |
| ----------------------------------- | -----: | ------: | --------: | -------: |
| 32 styled Windows, live RSS MiB     |  201.2 |   353.9 |     374.0 |    117.6 |
| 32 styled Windows, live JS heap MiB |   65.3 |   122.5 |     153.5 |     20.5 |
| 32 styled Windows, released RSS MiB |  201.3 |   347.7 |     389.6 |    117.6 |
| 32 bare Windows, live RSS MiB       |  160.5 |   323.1 |     370.4 |    107.2 |
| Empty Window, warm batch ms         |  4.924 |  12.407 |    14.445 |    0.070 |
| Empty Window, total ms              |  157.2 |   445.0 |     306.6 |    104.0 |
| First authored style read ms        | 22.184 |  25.922 |     2.878 |    2.034 |
| Role query, warm batch ms           |  1.044 |  28.221 |     0.668 |    0.666 |
| Role query, total ms                |  136.3 |   579.7 |     214.9 |    130.4 |
| Table fragment, warm batch ms       | 30.902 | 132.686 |   126.285 |   75.467 |
| Table fragment, peak RSS MiB        |  312.9 |   470.2 |     849.9 |    154.3 |

The largest remaining style startup cost sits in the pinned declaration engine. The post-change first-use capture sampled 11.72 MiB directly in the vendor initialization path and 1.73 MiB building grammar descriptors. The same phase still spent time creating RunDOM’s private declaration interface. A warm style read is approximately tied with TurboDOM in this matrix. [First-use allocation capture](../.cache/styled-rss-campaign/style-read-allocation.json), [First-use CPU capture](../.cache/styled-rss-campaign/style-read-cpu.json)

The dense profile found that creating mutable copies of the template records, allocating wrappers and constructing the Window account for much of the work. Dense traversal took 13.008 ms per batch versus TurboDOM’s 3.064 ms. TurboDOM shares immutable parser storage and creates its mutable overlays per document. It also shares module-level constructors through its Window proxy. RunDOM’s Window contracts require separate mutable constructors and prototypes. [Dense CPU capture](../.cache/styled-rss-campaign/parse-html-traverse-cpu.json), [Dense allocation capture](../.cache/styled-rss-campaign/parse-html-traverse-allocation.json), [Empty Window allocation capture](../.cache/styled-rss-campaign/windows-create-close-allocation.json)

## Ant Design matched replay

The full Ant Design screen passed 133 cases on RunDOM and jsdom, 128 on Happy DOM and 121 on TurboDOM. Each provider then passed the same 116 cases in three rotated processes.

| Provider  | Total seconds | Summed test ms | Peak RSS MiB |
| --------- | ------------: | -------------: | -----------: |
| RunDOM    |         5.502 |          1,449 |        653.8 |
| jsdom     |         6.172 |          1,132 |        607.4 |
| Happy DOM |         5.249 |            872 |        587.4 |
| TurboDOM  |         4.533 |            778 |        567.0 |

RunDOM remains about 0.97 s behind TurboDOM end to end. About 0.67 s of that difference is in test bodies. TurboDOM used about 87 MiB less peak RSS. [Raw Ant Design results and runner stages](../.cache/styled-rss-campaign/upstream/results.json)

## Framework coverage and compatibility

| Matched selection                | Passed | RunDOM seconds | jsdom seconds | Happy DOM seconds | TurboDOM seconds |
| -------------------------------- | -----: | -------------: | ------------: | ----------------: | ---------------: |
| Vue runtime-dom                  |    159 |          2.082 |         4.929 |             2.847 |            1.852 |
| Ant Design                       |    116 |          5.502 |         6.172 |             5.249 |            4.533 |
| Material UI Button and TextField |    118 |          2.031 |         2.454 |             1.949 |            1.690 |
| Svelte runes shard               |    561 |          5.823 |         6.252 |             5.852 |                — |
| Svelte motion                    |      8 |          0.887 |         0.978 |             0.955 |                — |
| Next.js example                  |      5 |          1.128 |         1.575 |             1.325 |            0.951 |
| freeCodeCamp Flash and CTA       |      4 |          1.065 |         1.253 |             1.122 |            0.992 |
| Supabase UI                      |     80 |          4.282 |         7.433 |             4.626 |            3.564 |

RunDOM also passed the full selected Vue runtime-dom, Ant Design and Material UI screens with 270, 133 and 430 passes. The full Svelte runtime replay matched every named outcome from the previous build, with 6,012 passes, 90 failures and 34 skips. TurboDOM collected zero cases on the Svelte runtime selection because its environment lacked Window. The full Material UI screen gave TurboDOM 181 passes and 281 failures. Two common cases failed again in the shared 161-case replay. All four completed the stable Button and TextField selection. [Framework results and available runner stages](../.cache/styled-rss-campaign/framework-report.md), [Named runner results](../.cache/styled-rss-campaign/upstream/results.json)

RunDOM and jsdom completed the ten-workflow packed React fixture in all four Vitest pools. RunDOM’s wall medians ranged from 0.743 to 0.821 s and jsdom’s from 1.054 to 1.368 s. The eight-workflow fixture also completed on Happy DOM. React’s upstream Jest selection, Drone and Scully passed on RunDOM and jsdom. Both Scully providers used the same Jest 27 teardown guard. [React fixture with stress](../.cache/styled-rss-campaign/react-vitest.json), [Eight-workflow fixture](../.cache/styled-rss-campaign/react-standard.json), [React and Drone Jest runs](../.cache/styled-rss-campaign/jest/jest-timing-results.json), [Scully](../.cache/styled-rss-campaign/jest/scully-final-results.json)

The focused CSS, CSSOM, cascade and query WPT replay reproduced all 13,037 named assertions and all 756 fixture and harness outcomes from the previous RunDOM build on each parser. Stock jsdom satisfied 756 fixture expectations. RunDOM satisfied 650 and differed on 106, including 85 expected-failure fixtures that passed outright. The local facade suite passed 1,574 tests with the TypeScript parser and the upstream public API passed 634. [Local gate](../.cache/styled-rss-campaign/local.log), [Public API](../.cache/styled-rss-campaign/api.log), [WPT counts](../.cache/styled-rss-campaign/wpt-summary.json), [Named WPT deltas](../.cache/styled-rss-campaign/wpt-delta.json)
The supplementary V8 checkpoints show the allocation spike without either sampling profiler. The original process went from 115 MiB of committed JS heap before first use to 498 MiB after the first full styled batch, versus 114 to 118 MiB on the retained build. Both were at 197 MiB committed and 65 MiB live after forced GC. Code and metadata were below 2 MiB at those checkpoints on both builds. [Baseline V8 spaces](../.cache/styled-rss-campaign/memory-spaces-performance-lab-Ev1CFS-default.jsonl), [Retained-build V8 spaces](../.cache/styled-rss-campaign/memory-spaces-performance-lab-5wpPv0-default.jsonl)

A fresh Ant Design CPU capture attributed 441 ms cumulatively to computed style and 299 ms to attaching stylesheets. The comparable starting capture had 566 ms and 296 ms. Direct self time in the general declaration setter fell from 43.2 to 5.6 ms. The remaining cascade work includes winner expansion, rule traversal, inherited-token copies and variable resolution. The stylesheet path spends time on selector preparation and parsing rules for CSS-in-JS insertions. These are instrumented samples. [Updated capture](../.cache/styled-rss-campaign/antd/antd-rundom-final-thread-profile-cpu)

Both parser selections passed all 1,574 local facade tests and 634 public API tests. The broader 128-case Ant Design comparison measured 5.529 s for RunDOM, 6.305 s for jsdom and 5.326 s for Happy DOM. The broader 423-case Material UI comparison measured 8.432, 9.722 and 7.810 s. [Rust facade tests](../.cache/styled-rss-campaign/local-rust.log), [Rust public API](../.cache/styled-rss-campaign/api-rust.log), [Broader framework results](../.cache/styled-rss-campaign/framework-report.md#broader-three-provider-selections)

## Additional TurboDOM gap experiments

Copying only explicit attributes into the dense parse template was flat on sparse and update workloads, raised traversal from 11.351 to 11.804 ms and raised unique parsing from 26.165 to 30.690 ms. Capturing only the DOM and document implementation factory methods instead of their complete descriptor tables raised empty Window construction from 4.959 to 5.627 ms per batch and slowed both repeated parsing workloads. Both experiments were removed. [Dense attribute comparison](../.cache/performance-lab-QiVcpK), [Window assembly comparison](../.cache/styled-rss-campaign/window-descriptor-pair.json)
Forcing dictionary storage on the pinned cssstyle prototype reduced the first authored read from 22.144 to 13.008 ms, and peak RSS in the single-Window style-read memory run from 163.0 to 134.1 MiB. It left Ant Design’s full-selection test bodies effectively flat at 1,498 versus 1,493 ms. The full Material UI selection was also flat in test time at 6,106 versus 6,103 ms, while median peak RSS increased from 385.7 to 421.4 MiB. The experiment would require a transform of the pinned dependency. It was removed after the framework memory result. [Cold and warm style comparison](../.cache/performance-lab-J3bQzd/comparison-Hzq80U/report.md), [Framework trials](../.cache/styled-rss-campaign/vendor-pair/trials.log), [Baseline memory](../.cache/styled-rss-campaign/vendor-baseline-memory.json), [Candidate memory](../.cache/styled-rss-campaign/vendor-candidate-memory.json)

RunDOM remains behind TurboDOM on empty-Window startup, repeated dense parsing, first authored-style reads, most matched upstream selections, and RSS on styled Windows and table fragments. Dense reads pay for mutable tree copies and wrappers, and bare Window startup pays for distinct per-Window interfaces. The 32-Window gap is about 84 MiB RSS and 45 MiB live heap. Peak table-fragment RSS differs by about 159 MiB in timing mode, while after-work live JS heaps differ by about 5 MiB in a forced-GC fragment diagnostic. That separation points to transient allocation and resident-page high water during repeated replacement. [Full timing and memory tables](../.cache/styled-rss-campaign/lab-report.md), [Table-fragment memory diagnostic](../.cache/styled-rss-campaign/fragment-memory.json)
