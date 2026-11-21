# Selector matching and ancestor cascade traversal

## Ant Design Radio Group

Four upstream FormItem tests exercise field names, dynamic Form.List fields, name precedence and array NamePaths. Every trial verifies the same four passing test identities. The measurements below include their test hooks. Six fresh processes per provider ran in rotating order on Apple M4 with Node 24.20.0. Independent benchmark and conformance jobs used the same host. Absolute timings can vary with host load.

| Four-test median                                        | Previous RunDOM | Updated RunDOM | jsdom |
| ------------------------------------------------------- | --------------: | -------------: | ----: |
| Test-thread CPU, ms                                     |           464.8 |          358.6 | 350.1 |
| Retired process instructions during the tests, billions |           3.614 |          3.163 | 3.158 |

The sampled CPU gap fell from 32.8% to 2.4%. RunDOM executed 12.5% fewer instructions than its baseline and 0.15% more than jsdom. The test-thread CPU and process-wide instruction counters cover different sets of threads. The result measures the four profiled tests, a subset of the Radio Group file. [Per-test measurements](../.cache/subject-cascade-gIMpWK/checked-cpu/)

| V8 stack profile, one additional process per provider | Previous RunDOM | Updated RunDOM | jsdom |
| ----------------------------------------------------- | --------------: | -------------: | ----: |
| Active samples                                        |           2,042 |          1,810 | 1,872 |
| Computed style under role or focus checks             |             558 |            380 |   173 |
| Share of active samples                               |           27.3% |          21.0% |  9.2% |

The style path still accounts for a larger share of this workload on RunDOM. Within RunDOM the rule-matching scope fell from 171 to 123 samples and winning-value resolution from 109 to 44. Stylesheet construction remained substantial at 389 and 380 samples respectively. These categories overlap. [Stack profiles](../.cache/subject-verified-YDIh6z/case-stacks/profile-summary.json)

## Costs and changes

- A mixed selector list containing a type subject could cause a whole sheet to bypass the subject index. Indexing type subjects and retaining a ready-to-use fallback rule list cut branches visited from 21,263 to 11,766 on the same instrumented test prefix. The 3,074 full selector predicate calls and 505 rule matches were identical at that stage.
- An inherited translucent RGB color could force a target to rebuild the cascade even when its already computed ancestor frame held the required values. Supporting canonical integer RGB and RGBA serialization let RunDOM reuse those frames. Target computations fell from 82 to 45 with the same 77 ancestor visits. The direct serializer agreed with the previous implementation at all 1,001 tested alpha values.
- Expanding one border shorthand and resolving the same literal custom property for multiple longhands repeated substantial declaration work. The cascade now reuses an expansion within its frame. A bounded cache also reuses the context-independent serialized value of a direct literal variable substitution.
- Ordinary type, class and ID selectors with descendant and child relations now compile directly from the parsed stylesheet selector. A child chain must match in full before the matcher commits to an ancestor. Stateful, namespaced and other unsupported selectors keep the existing matcher. Across 367 generated selectors, the candidate reproduced the baseline result digest. The same held for 144 theme, CSSOM mutation and snapshot comparisons.
- A per-element rule-match cache was evaluated and discarded. Although 1,741 of 3,074 predicate calls repeated in the same generation, storing and retrieving their results did not reduce overall instruction cost.

The diagnostic counters flush at the next computed-style entry. The branch, predicate and visit totals cover the same completed prefix of each trace. The CPU measurements cover all four tests. [Original trace](../.cache/subject-cascade-gIMpWK/before-trace.json) · [Indexed trace](../.cache/subject-cascade-gIMpWK/after-trace.json) · [Cascade and substitution trace](../.cache/subject-cascade-gIMpWK/final-trace.json)

## Compatibility

Both the TypeScript and Rust HTML parsers passed all 1,599 local facade tests and 634 jsdom API tests. The targeted CSS and DOM mutation WPT comparison found zero changed fixture, harness or assertion outcomes on either parser. Existing upstream failures remain, including the shadow DOM XHTML mutation fixture. [Local and API results](../.cache/subject-verified-YDIh6z/gate/combined-status) · [Named WPT comparison](../.cache/subject-verified-YDIh6z/gate/combined-wpt-diff.json)

## Four-provider upstream replay of the selector and ancestor changes

Each full selection verifies the provider actually loaded by the upstream runner. The two fully passing providers have three fresh full-selection processes each. Shared-subset rows come from one fresh run per provider and match the same passing test identities. MUI selected five files and Ant selected eight.

| Provider  | Ant full pass / fail | MUI full pass / fail / pending | Ant shared 116, process / tests (s) | MUI shared 118, process / tests (s) |
| --------- | -------------------: | -----------------------------: | ----------------------------------: | ----------------------------------: |
| RunDOM    |              133 / 0 |                   430 / 0 / 39 |                       43.22 / 11.62 |                        10.63 / 1.97 |
| jsdom     |              133 / 0 |                   430 / 0 / 39 |                        49.31 / 9.03 |                         7.73 / 1.71 |
| Happy DOM |              128 / 5 |                    454 / 8 / 7 |                        47.37 / 7.99 |                         8.97 / 1.53 |
| TurboDOM  |             121 / 12 |                  181 / 281 / 7 |                        32.30 / 4.83 |                         7.13 / 1.17 |

On the full selections RunDOM and jsdom took 18.44 and 39.19 s respectively for Ant and 33.64 and 38.42 s for MUI. The full Radio Group file had median summed case times of 842 and 1,462 ms. Host load varied substantially across trials. The dedicated per-case CPU comparison above gives a better estimate of the optimization's effect. Happy DOM and TurboDOM completed different work on the full selections. The shared rows still show a substantial TurboDOM timing advantage. [Full results and stage summaries](../.cache/subject-verified-YDIh6z/screen-report.json) · [Per-file timings](../.cache/subject-verified-YDIh6z/files-report.json)

Three additional full MUI runs per build, rotated in order and checked against all named outcomes, yielded peak RSS of 332.1, 381.6 and 312.1 MiB on the previous RunDOM, 335.9, 376.4 and 377.2 MiB on updated RunDOM and 405.2, 367.7 and 403.8 MiB on jsdom. Updated RunDOM's median was 27.5 MiB below jsdom and 44.3 MiB above its own baseline. The separate full-selection replay above gave RunDOM 329.6 MiB and jsdom 323.6 MiB. These series did not establish a consistent RSS advantage. [Rotated peak RSS](../.cache/subject-verified-YDIh6z/peak/matched.jsonl)

## Full Radio Group and stylesheet insertion

Nine rotated runs of all 133 Ant Design tests measured the current thread's user and system CPU and hardware-retired instructions inside each named test, including its hooks. The same 30 Radio Group test IDs passed in every trial. These measurements exclude environment startup and cross-worker CPU. Independent runs measured wall time, process peak RSS and the subset shared by all four providers.

| Median                                           | Previous RunDOM | Updated RunDOM |    jsdom |
| ------------------------------------------------ | --------------: | -------------: | -------: |
| Radio Group, all 30 tests, thread CPU            |          714 ms |         669 ms |   726 ms |
| Radio Group, all 30 tests, instructions          |         5.895 B |        5.313 B |  5.470 B |
| All 133 Ant tests, thread CPU                    |        3,351 ms |       3,190 ms | 3,256 ms |
| All 133 Ant tests, instructions                  |        26.534 B |       24.899 B | 24.572 B |
| Four role-heavy tests in isolation, thread CPU   |          494 ms |         450 ms |   438 ms |
| Four role-heavy tests in isolation, instructions |         3.597 B |        3.161 B |  3.169 B |

The full Radio Group file used 7.9% less CPU than jsdom. The isolated four retained a 2.8% CPU deficit in this six-round series. Across all 133 tests, RunDOM used 1.3% more instructions than jsdom. The measurements distinguish three different workloads. Host CPU load varied during the campaign. [Nine-round test-by-test results](../.cache/real-cascade-final-ESv3il/suite-cpu/summary.json) · [Six-round isolated runs](../.cache/selector-confirm-a0OXtv/cpu/)

One Radio trace allocated 1,278 leaf rule wrappers, materialized 36 declarations, and exposed zero public rule lists in the measured prefix. The stylesheet implementation now creates CSSOM wrappers and child lists on access. It also reuses CSS-tree's tokens when detecting nesting, and defers parsing simple declaration blocks until needed. A second parse on public CSSOM access was expensive in the first candidate. Recording the original declaration spans removed it.

Twenty installations of the upstream 66,153-character Ant grid stylesheet took 176 ms of thread CPU, down from 300 ms, and peaked at 170.5 MiB, down from 189.4 MiB. Reading the complete CSSOM after each installation took 531 ms, down from 600 ms, with peak RSS falling from 296.1 to 269.9 MiB. With unique source strings the median fell from 315 to 182 ms. Differential runs matched 4,419 CSSOM observations across 860 stylesheet inputs and 7,650 paint-property samples. [Rotated insertion trials](../.cache/subject-cascade-gIMpWK/validated/span-grid.log) · [Serialization differentials](../.cache/subject-cascade-gIMpWK/validated/)

| Provider  | Ant pass / fail | Ant process / summed test time (s) | MUI pass / fail / pending | MUI process / summed test time (s) |
| --------- | --------------: | ---------------------------------: | ------------------------: | ---------------------------------: |
| RunDOM    |         133 / 0 |                       16.60 / 3.95 |              430 / 0 / 39 |                      23.87 / 13.72 |
| jsdom     |         133 / 0 |                       17.97 / 3.50 |              430 / 0 / 39 |                      31.09 / 16.94 |
| Happy DOM |         128 / 5 |                       20.49 / 3.38 |               454 / 8 / 7 |                      26.27 / 14.65 |
| TurboDOM  |        121 / 12 |                       14.86 / 2.73 |             181 / 281 / 7 |                       31.23 / 6.55 |

RunDOM and jsdom have three process trials each. Happy DOM and TurboDOM have one full screen each. On the 116 Ant tests passing on every provider, the RunDOM/jsdom/Happy DOM/TurboDOM process times were 14.99/16.67/14.47/10.23 s. On the equivalent 118 MUI tests they were 5.11/6.90/4.44/4.34 s. Each common selection has one process per provider in this replay. [Full and shared process results](../.cache/real-cascade-final-ESv3il/screen-report.json) · [Per-file results](../.cache/real-cascade-final-ESv3il/files-report.json) · [Vitest process logs](../.cache/real-cascade-final-ESv3il/qualified/)

### Material UI memory

Across three dedicated matched five-file runs, median peak RSS was 370.4 MiB for updated RunDOM, 377.4 MiB for previous RunDOM and 389.7 MiB for jsdom. The independent timing series reported 322.8 MiB versus 322.2 MiB for updated RunDOM and jsdom. High-water RSS varies between runs. [Paired process peaks](../.cache/real-cascade-final-ESv3il/peak/matched.jsonl)

| Worker    | Previous RunDOM heap after close and GC (MiB) | Updated RunDOM | jsdom |
| --------- | --------------------------------------------: | -------------: | ----: |
| Select    |                                         76.56 |          76.29 | 89.47 |
| TextField |                                         64.37 |          64.21 | 79.09 |
| Button    |                                         59.64 |          59.46 | 73.61 |
| Checkbox  |                                         57.01 |          56.90 | 72.18 |
| Dialog    |                                         56.55 |          56.44 | 71.51 |

In an earlier three-run sequence Select retained 78.73 MiB versus 76.56 MiB for the previous build. A fresh series with V8 heap-space counters did not reproduce that difference. Select old space measured 48.26 MiB on both RunDOM builds, versus 63.82 MiB on jsdom. Its peak in that series fell from 346.89 to 337.31 MiB. [First retained series](../.cache/real-cascade-final-ESv3il/retained-summary.json) · [Second series and heap-space breakdown](../.cache/mui-memory-phases-kjpagJ/detail.txt)

The broader replay preserved the Vue runtime-dom result (270 passed, one pending). RunDOM and jsdom also passed the selected Svelte runes shard (565), Svelte motion (8), Supabase UI (85), freeCodeCamp (4) and Next.js example (5). The broad nine-project Svelte screen passed 6,012 cases and failed 90 on RunDOM, versus 6,102 passing on jsdom. Happy DOM failed 279 and TurboDOM collected zero. A passing shared subset cannot establish full-suite compatibility. [All four upstream providers](../.cache/real-cascade-final-ESv3il/real/results.json) · [Stock React and Drone Jest controls](../.cache/real-cascade-final-ESv3il/jest/jest-timing-results.json) · [Scully control](../.cache/real-cascade-final-ESv3il/jest/scully-final-results.json)

The packaged runtime digest was checked against the worktree build. An earlier packaging experiment reused the original archive for several variants. All timings from those copies were excluded and the stages were packed again independently before comparison.

## Follow-up on stylesheet dispatch and memory

Material UI distributes its generated rules across many style elements. A computed-style read visited each sheet at each applicable ancestor, often to discover that its sole rule could never match the element. The cascade now indexes private single-rule sheets by the mandatory class, ID or type of their subject. A one-child media group can contribute its child's key. The ordinary media evaluation and document order still determine the winning declarations. Empty sheets, keyframes and selectors that match only pseudo-elements can be skipped in the element cascade. Accessing a sheet through the CSSOM makes later mutations visible. Reading a stylesheet list's length leaves its individual sheets private.

| Completed worker counters on the packaged build | Ant Design, eight files | Material UI, five files |
| ----------------------------------------------- | ----------------------: | ----------------------: |
| Computed-style traversals                       |                     261 |                   2,566 |
| Ancestor frames visited                         |                     549 |                   5,308 |
| Target frames visited                           |                     261 |                   2,566 |
| Sheets in the visited scopes before dispatch    |                   9,283 |                 656,423 |
| Sheets passed to the cascade                    |                   8,657 |                  19,817 |
| Ancestor selector predicate calls               |                   6,304 |                   4,772 |
| Target selector predicate calls                 |                   4,319 |                  12,400 |
| Matching rules on ancestors / targets           |               543 / 627 |           3,418 / 4,199 |

These counters include each worker's final computed-style call. Ant Design kept more of its sheets eligible, including after public CSSOM access. A separate experiment prefiltered selector predicates by ancestor keys. That reduced predicate invocations but left the four isolated Radio Group tests at 3.128 billion instructions, versus 3.122 billion without the extra lookup. The measured implementation omits that lookup. [Full-suite counters](../.cache/general-cascade-counts-PJKxOI/) · [Ancestor-key comparisons](../.cache/conditional-sheets-LSvVWz/)

Ant Design also spends time installing a 66,153-character responsive stylesheet. The parser records spans for simple declaration blocks and delays constructing independently mutable CSSOM objects until a caller needs them. Selectors still pass through the selector parser. More complex syntax uses the full stylesheet parser. Across nine alternating pairs, 20 installations with matching fell from 171 to 120 ms of CPU, with retired instructions falling from 1.82 to 1.03 billion and peak RSS from 176.3 to 171.1 MiB. With 20 distinct source strings, CPU fell from 188 to 116 ms. Opening every rule and style reduced the gain to 456 versus 417 ms. [Paired insertion samples and CSSOM checks](../.cache/compact-css-eval-ECl6BO/)

### Radio Group attribution

In the four profiled FormItem cases, V8 sampled computed style under role or focus checks 445 times out of 1,816 active samples on the preceding RunDOM build, 122 out of 1,095 on the updated build, and 160 out of 1,792 on jsdom. Matching and scope dispatch fell from 166 to 38 samples and property writes from 222 to 80. Stylesheet construction still accounted for 249 samples on updated RunDOM. Each column comes from one separate profiling process. These overlapping stack counts describe where CPU was sampled. The repeated test-thread CPU trials measure the size of the overall gap. [V8 profiles and classification](../.cache/verified-dispatch-jkSEj6/stacks/)

### Material UI footprint

The complete five-file selection passed the same 430 tests with 39 pending on both RunDOM builds and jsdom. Median dedicated peak RSS across three rotating runs was 360.1 MiB on the preceding RunDOM build, 364.9 MiB on the updated build and 401.1 MiB on jsdom. In the separate timing runs the updated RunDOM peak was 315.0 MiB, compared with 379.9 MiB on jsdom. [Matched peak samples](../.cache/verified-dispatch-jkSEj6/peak/matched.jsonl) · [Independent timing series](../.cache/verified-dispatch-jkSEj6/screen-report.json)

| Suite or shared worker            | RunDOM heap after teardown and GC, MiB | jsdom | Happy DOM | TurboDOM |
| --------------------------------- | -------------------------------------: | ----: | --------: | -------: |
| Complete Select worker            |                                   76.8 |  89.4 |         — |        — |
| Complete TextField worker         |                                   63.8 |  79.0 |         — |        — |
| Complete Button worker            |                                   59.3 |  73.5 |         — |        — |
| Complete Checkbox worker          |                                   56.8 |  72.1 |         — |        — |
| Complete Dialog worker            |                                   56.3 |  71.5 |         — |        — |
| Button in the 118 common cases    |                                  58.35 | 72.60 |     47.81 |    39.07 |
| TextField in the 118 common cases |                                  61.57 | 77.67 |     52.48 |    43.77 |

The full workers have three observations each and the common workers have four. Each measurement follows environment teardown and two forced collections. Select ranged from 75.9 to 78.5 MiB on updated RunDOM. A separate Button heap snapshot attributes 5.45 MiB of RunDOM's excess over TurboDOM to string storage, 5.68 MiB to V8 code nodes and 3.21 MiB to array storage. Two retained source strings for the bundled implementations alone occupied 4.74 MiB on RunDOM. Snapshot sizes describe shallow storage by category and can include the profiler's own allocations. [Full worker samples](../.cache/verified-dispatch-jkSEj6/retained-summary.json) · [Identical four-provider workloads](../.cache/verified-dispatch-jkSEj6/shared-retained/) · [Heap snapshot breakdown](../.cache/verified-dispatch-jkSEj6/mui-heap/profile-summary.json)

### Original build replay and remaining costs

Nine rotations ran the same 133 Ant Design tests with a counter inside each test worker. Each reported CPU value is the median of the sum of user and system CPU for the named test bodies. The hardware counter measures retired instructions on that thread. Suite startup and transforms are outside these numbers.

| Workload                                          | Original RunDOM CPU, ms | Updated RunDOM CPU, ms | jsdom CPU, ms | Original RunDOM instructions, billions | Updated RunDOM |  jsdom |
| ------------------------------------------------- | ----------------------: | ---------------------: | ------------: | -------------------------------------: | -------------: | -----: |
| Radio Group, 30 tests                             |                   935.5 |                  868.6 |         950.0 |                                  5.971 |          5.173 |  5.494 |
| Complete measured Ant Design selection, 133 tests |                 4,454.3 |                4,048.2 |       4,303.3 |                                 26.942 |         24.203 | 24.691 |

This replay puts the complete Radio Group file 8.6% ahead of jsdom on CPU. The isolated four FormItem cases were closer, at 504.8 ms originally, 436.9 ms after the changes and 440.2 ms on jsdom across six rotations. One dynamic Form.List case still took 45.6 ms and 317 million instructions on RunDOM against 41.2 ms and 205 million on jsdom. [Test-level CPU and instruction medians](../.cache/original-cascade-replay-LYauya/suite-cpu/summary.json) · [Isolated FormItem trials](../.cache/original-cascade-replay-LYauya/cpu/)

A separate instrumented package counted public computed-property reads that forced the declaration to materialize. In Material UI, 432 of 2,765 reads triggered that work. The main callers read overflow, padding or pointer events. A candidate that recognized more independent longhands reduced materializations to five and reduced the winners processed on those paths from 3,040 to 147. Ant Design fell from 88 to 43 materializations and from 1,842 winners to 444. All 3,735 snapshot comparisons matched. Despite that reduction, the seven-pair trials showed almost unchanged total instructions and higher median CPU on both complete suites. The broader projection remains experimental. [Read counts before](../.cache/captured-property-reads-NXgS6M/) · [Read counts after](../.cache/projected-read-counts-05lRpI/) · [Paired suite measurements](../.cache/property-projection-o3lRpP/metrics.jsonl)

## Selector matching and stylesheet construction on the release build

This replay uses Apple M4 and Node 24.20.0. Both packages ran all 30 tests from the upstream Radio Group file. A diagnostic build recorded retired instructions around synchronous DOM operations inside the test bodies. The table subtracts time in other instrumented operations from each parent. Instrumentation adds overhead and changes optimization decisions. The separate uninstrumented process timings and repeated test-thread CPU counters measure the overall effect.

| Operation                    | Original calls | Updated calls | Original exclusive instructions, M | Updated exclusive instructions, M |
| ---------------------------- | -------------: | ------------: | ---------------------------------: | --------------------------------: |
| parse stylesheet             |             74 |            74 |                              735.3 |                             586.6 |
| compile selector             |            395 |           203 |                              277.9 |                             154.8 |
| walk rules and match         |           2512 |          1920 |                              331.7 |                             233.2 |
| ancestor/target scopes       |            160 |           123 |                               80.5 |                              46.0 |
| cascade and value resolution |             83 |            46 |                              270.6 |                              84.6 |
| resolve declaration          |             53 |            53 |                              251.5 |                             276.3 |
| build/find subject index     |              — |          2043 |                                  — |                              58.6 |
| filter subject buckets       |              — |          1200 |                                  — |                              36.9 |
| wrap element                 |           3067 |          3067 |                               81.0 |                              79.4 |

Stylesheet parsing remained the largest measured operation. The 30 tests installed 74 sheets. In a second run, 13 installations entered the nesting parser and 1,378 rule visits prepared the stylesheet structure. The largest individual sources were the 15,037-character Radio sheet, the 66,153-character grid sheet and the 13,702-character Form sheet. Their inclusive costs were 142, 134 and 123 million instructions respectively. Declaration resolution still used about 276 million instructions across 53 calls in the first run. [Test-body operation profile](../.cache/radio-instruction-profile-V1ajdv/attribution.json) · [Per-stylesheet costs](../.cache/stylesheet-costs-Wz6Q2P/costs.json)

The private subject index selects candidate sheets and rules in document order for each ancestor or target. Exposed CSSOM, adopted sheets and unsupported selector structures keep their live evaluation paths. Common state and attribute predicates now compile directly from the parsed selector. Attribute names use the element and document namespaces, insensitive values fold ASCII letters, and token-list matching uses CSS whitespace. A separate matrix checked 2,592 selectors across HTML, SVG and no-namespace elements in HTML and XML documents. All 5,184 query and matches observations and 200 sampled cascade observations agreed with their expected results. [Selector matrix](../.cache/qualified-selector-replay-9QGYBa/matrix-validation.json)

For the full Ant selection, the instrumented selector entry point fell from 1,441 compilations and 9,815 predicate calls to 811 and 4,360. Its measured compilation and predicate costs fell from 1,247 and 270 million instructions to 925 and 127 million. Material UI fell from 679 compilations and 26,202 predicate calls to 545 and 21,934, with costs moving from 479 and 353 million to 362 and 330 million. These totals cover complete worker lifetimes and a different boundary from the Radio-only body profile. [Costs by selector and project](../.cache/qualified-selector-replay-9QGYBa/selector-cost-breakdown.json)

Material UI heap work targeted two long-lived allocations visible in worker snapshots. The build emits ASCII-encoded implementation bundles with original-source maps, allowing V8 to retain the source in one-byte strings. The bundled CSS lexer registers property and type names up front and constructs grammar descriptors when the name is used. Accessors on separate public CSS declaration prototypes remain independently mutable and retain their original order. Vitest exposes those constructors during setup, so the standalone multi-Window accessor savings do not predict a Material UI worker saving.

### Release compatibility

Both HTML parsers passed 1,618 local tests, 634 upstream jsdom API tests and the packed Vitest integration checks. All 15 workspace check tasks passed. The full pinned WPT corpus ran 5,460 fixtures and had 5,138 additional fixtures disabled by its manifest. RunDOM passed 215,960 of 248,342 reported assertions. The pre-optimization RunDOM baseline passed 215,818. Comparing the same named assertions recovered 142 passes with zero losses against that baseline. The immediately preceding RunDOM build had 108 named gains and one navigation assertion that passed only on that earlier run. The upstream jsdom expectation manifest matched 4,884 fixtures on this release and differed on 576. Its expected failures can change to unexpected passes when RunDOM improves. [Full WPT outcomes](../.cache/qualified-selector-replay-9QGYBa/standards-summary.json) · [Local and API checks](../.cache/qualified-selector-replay-9QGYBa/gate/combined-status)

Stock jsdom passed 195,061 of 228,577 reported assertions. On shared assertion identities, RunDOM passed 5,579 checks that stock jsdom failed and failed 212 that stock jsdom passed. Another 12 stock passes were absent from the RunDOM assertion stream. Different harness progress accounts for part of the total-count gap. The two complete runs had 207 and 208 harness failures respectively. [Assertion-by-assertion comparison](../.cache/subject-cascade-gIMpWK/standards/jsdom-qualified-release-normalized-diff.json)

Chromium 156 reproduced the reflected inert attribute, default black computed color, quoted computed URLs, computed RGB border color and pixel resolution of viewport widths observed in several failing Svelte fixtures. Those fixtures still count as upstream compatibility failures. Chromium also rejects attribute presence selectors with a comparison flag, and the corrected matcher reproduced the prior 456 of 528 passing assertions in the corresponding WPT syntax fixture. [Independent Chromium results](../.cache/qualified-selector-replay-9QGYBa/chromium-oracle.html)

## Ancestor shorthand expansion during accessibility checks

The first FormItem role query triggered native CSS color parsing inside ancestor declaration resolution. In a paired diagnostic on the 30-test Radio Group file, the preceding release fully resolved 52 ancestor declarations and one target declaration. Those ancestors expanded `border: 1px solid #d9d9d9` nine times (64.3 million retired instructions) and `border-color: #1677ff` twice (41.9 million). A separate weak last-value cache experiment still paid the first parse of each shorthand. It saved 0.24% of instructions in the four FormItem cases and raised Material UI test CPU in its sample, so it was discarded. [Expansion measurements](../.cache/release-ancestor-cascade-bA1HLk/shorthand-instructions.json)

When an ancestor contributes to a descendant's computed style, RunDOM now resolves inherited values and can defer variable-dependent components of non-inherited shorthands. The measured release built nine such ancestor declarations. It fully resolved the other 43 ancestors and the target, and made zero of the 11 native border expansions. An explicit child `inherit` can recover an ancestor's complete declaration. The recovery uses captured winning values and environment inputs so a later stylesheet mutation cannot change an existing snapshot. Retention accounting includes the captured parent and winners and prevents adjacent ancestors from retaining a chain of partial declarations. This path applies to computed style reads from any caller. [Implementation](../packages/dom/src/styles.ts) · [Snapshot and explicit inheritance tests](../packages/jsdom/test/computed-style-state.test.ts)

Both HTML parsers passed 1,619 local tests, 634 upstream jsdom API tests and 12 packed Vitest integration tests on the final build. The 96 targeted snapshot and mutation comparisons matched the preceding build. The full WPT replay produced the same 215,960 passes in 248,342 assertions with zero named passes lost or gained versus the immediate control. One CSSOM harness timeout from the control cleared. The new build had 206 harness errors; 5,138 fixtures remained disabled by the upstream manifest. Against the starting RunDOM build, the net change was 142 named passes gained and zero lost. Stock jsdom still passed 212 shared assertions that this build failed. [Full comparison](../.cache/subject-cascade-gIMpWK/standards/qualified-release-release-final-normalized-diff.json) · [Comparison with stock jsdom](../.cache/subject-cascade-gIMpWK/standards/jsdom-release-final-normalized-diff.json)

Seven alternating release/control pairs repeated all eight Ant Design files (133 passes) and all five Material UI files (430 passes and 39 pending). The CPU counters cover the executing test thread, including test hooks. Instruction counters cover the process over those same intervals. Each percentage below is the median within-pair change.

| Upstream tests                                 | Test CPU change | CPU wins | Instruction change | Instruction wins |
| ---------------------------------------------- | --------------: | -------: | -----------------: | ---------------: |
| Ant Design, all 133                            |           −1.7% |      5/7 |              −1.4% |              7/7 |
| Radio Group, all 30 in the Ant run             |           −4.6% |      5/7 |              −3.9% |              7/7 |
| Four Radio Group FormItem tests in the Ant run |          −10.0% |      6/7 |              −7.2% |              7/7 |
| Material UI, all 430                           |          −0.02% |      4/7 |              −0.5% |              6/7 |

This isolates the ancestor change after the selector and memory improvements. The seven paired Material UI peak RSS ratios had a median change of −0.2%; five pairs favored the new build. [Per-pair release measurements](../.cache/bounded-ancestor-projection-EI6naI/pairs.json)

### Radio Group against jsdom

Each of eight blocks ran the complete 30-test Radio Group file four times, alternating RunDOM/jsdom/jsdom/RunDOM and its reverse. Each row includes test hooks. The percentage is the median of the eight within-block ratios. The displayed times are medians of the individual providers' block means.

| Test bodies                       | RunDOM CPU, ms | jsdom CPU, ms | Paired CPU difference | Paired instruction difference | CPU wins |
| --------------------------------- | -------------: | ------------: | --------------------: | ----------------------------: | -------: |
| All 30                            |          320.3 |         344.1 |                 −6.6% |                         −9.5% |      8/8 |
| Four FormItem cases within the 30 |          109.8 |         110.6 |                 −1.2% |                         −9.1% |      5/8 |
| Dynamic Form.List within the four |           15.1 |          15.0 |                 +0.9% |                         +7.1% |      2/8 |

Independent four-case V8 profiles recorded 140 of 726 active samples in computed style under role/focus checks on the immediately preceding release, 99 of 682 on the new release, and 66 of 836 on jsdom. RunDOM's winning-value resolution fell from 37 to 9 inclusive samples. Stylesheet construction accounted for 139 samples on the new release; 46 samples included rule matching. These categories can overlap. In dynamic Form.List there were only 60 active samples. Eight included role/focus and three included declaration resolution. That sample does not identify a single dominant cause for its residual gap. [Balanced CPU and instruction measurements](../.cache/release-ancestor-cascade-bA1HLk/radio-balanced/summary.json) · [Source-mapped stacks](../.cache/release-ancestor-cascade-bA1HLk/stacks/symbolized.json)

### Material UI peak and retained memory

Three dedicated rotated runs of all five files measured median peak RSS of 339.9 MiB on the new build, 340.8 MiB on its immediate predecessor, and 355.8 MiB on jsdom. The new build's range was 339.2–343.5 MiB. A separate three-run timing series measured 337.7 MiB and 356.8 MiB for RunDOM and jsdom. All observations reproduced 430 passing and 39 pending tests.

| Worker    | Preceding RunDOM retained MiB | Updated RunDOM retained MiB | jsdom retained MiB |
| --------- | ----------------------------: | --------------------------: | -----------------: |
| Select    |                          74.3 |                        72.2 |               89.3 |
| TextField |                          59.9 |                        59.9 |               79.1 |
| Button    |                          55.4 |                        55.5 |               73.5 |
| Checkbox  |                          52.8 |                        52.9 |               72.1 |
| Dialog    |                          52.3 |                        52.3 |               71.5 |

Retained heap is the median from three fresh workers after environment teardown and two forced collections. Select measured 72.0–74.4 MiB on the new release. The other four worker medians moved by less than 0.1 MiB. Per-worker heaps come from distinct processes and cannot be added to obtain peak RSS. [Dedicated peak RSS](../.cache/release-ancestor-cascade-bA1HLk/peak/matched.jsonl) · [Retained worker heap](../.cache/bounded-ancestor-projection-EI6naI/retained-summary.json)

Nine additional rotations ran all 133 Ant Design tests and compared the final build, the starting RunDOM baseline and jsdom. RunDOM's all-test CPU was 8.8% below the starting build and 1.9% below jsdom. Within those runs, Radio Group's CPU was 10.7% below the starting build and 8.1% below jsdom (9/9 paired wins against each). The four FormItem cases used 24.2% less CPU than the starting build and 2.3% less than jsdom. Dynamic Form.List's CPU varied across measurement layouts; its instruction count consistently stayed about 7% above jsdom. [Nine-round CPU and instruction comparisons](../.cache/release-ancestor-cascade-bA1HLk/suite-cpu/paired.json)

A separate six-round three-build diagnostic identified each Material UI fork by test filepath and sampled RSS, heap capacity and live heap every 40 ms. In the new build, the Select worker peaked at a median 352.8 MiB, versus 338.4 MiB on the preceding release and 371.4 MiB on the earlier stylesheet-dispatch build. Vitest's coordinator stayed near 322 MiB on all three. Across the 18 observations, Select's sampled heap capacity at peak correlated with the OS high-water mark (Pearson r = 0.98). Select's median heap capacity at its peak was 277.7 MiB on the new build and 262.7 MiB on the preceding build. This identifies the process and transient heap cost. The uninstrumented three-run peak and the seven paired runs did not reproduce the increase, and Select's post-teardown heap was lower. [Per-process observations](../.cache/release-ancestor-cascade-bA1HLk/mui-processes/rows.json)

Running only the four FormItem cases in fresh Ant workers produced median test-thread CPU of 202.1 ms on RunDOM, 199.3 ms on jsdom and 260.7 ms on the starting RunDOM baseline (six runs each). The median paired RunDOM/jsdom ratio was 0.983 for CPU and 0.860 for instructions. The small CPU difference changes sign with aggregation; the full 30-test file gave the more consistent result. [Isolated four-test rounds](../.cache/release-ancestor-cascade-bA1HLk/cpu/rounds.json)
