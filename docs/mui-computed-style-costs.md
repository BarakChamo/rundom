# Where Material UI spends time in RunDOM

Eight upstream Material UI files ran unchanged against the packaged RunDOM candidate and Material UI’s installed jsdom. Autocomplete, Dialog, Drawer, Menu, Popover, Select, TextField and Tooltip produced the same **929 passes and 75 skips**, checked by file, full test name, outcome and multiplicity. A matched unprofiled invocation took **15.72 s in RunDOM and 19.58 s in jsdom**. Test bodies took **12.54 s and 14.74 s**. Process peak RSS was **607 MiB and 569 MiB**, respectively. Single-pair RSS varied substantially in repeats. These measurements do not establish a retained-heap difference.

The ten-file screen also included Tabs and MenuList. Across two runs, RunDOM had 1,079 passes, eight failures and 87 skips. jsdom had 1,087 passes and 87 skips. All eight failures asserted on mixed-case `tabIndex`. Chai DOM reads `el.attributes[name]`. On an HTML button with `tabindex="0"`, both engines return `"0"` through `getAttribute("tabIndex")`. Named property access through `attributes.tabIndex` returns the Attr in jsdom and undefined in RunDOM. The timing comparison above excludes both files.

## How much time the CSS engine actually takes

The worker profile put CSS first among RunDOM’s own costs. Sampling also lengthened the suite considerably. A second run timed nine specific synchronous operations against a native monotonic clock inside test bodies. It passed all 929 cases with 11.90 s of body time. Subtracting nested measured operations gives **1.69 s total across the nine operations**, about 14% of body time. These measurements include timer overhead and exclude uninstrumented DOM paths.

| Operation                                    |   Calls | Inclusive ms | ms excluding other timed operations |
| -------------------------------------------- | ------: | -----------: | ----------------------------------: |
| Computed-style lookup                        |  32,944 |        1,243 |                                  36 |
| Cascade computation                          |  15,481 |          842 |                                 497 |
| Native focus eligibility                     |   1,727 |          490 |                                  18 |
| Resolve winning declarations                 |   7,438 |          449 |                                 449 |
| Apply an attached stylesheet                 | 174,830 |          411 |                                 140 |
| Collect sheets for a tree                    |  15,481 |          365 |                                  32 |
| Parse stylesheet rules, including cache hits |  56,851 |          270 |                                 270 |
| Write a public inline style property         |  22,926 |          230 |                                 230 |
| Materialize a deferred declaration           |   7,790 |          119 |                                  16 |

Inclusive times overlap. In particular, focus calls computed style, and computed style calls sheet collection and the cascade. The exclusive column also includes uninstrumented code under each named operation. Counts include repeated visits to existing sheets.

## What callers actually read

A separate diagnostic recorded the tag, property sequence and returned strings for each of **31,228 public computed-style calls**. Popper’s scroll-parent check reads three overflow properties in succession. It accounted for **14,215 views**, and every one returned `visible` for all three. Another **9,673 views** read only `position`. Together these two read patterns accounted for **76.5%** of views. **4,428** read only `display` and **919** read only `visibility`. The remaining calls include other properties and `getPropertyValue` method reads. Internal style computations during focus checks can bypass the public API. An independent entry counter in jsdom recorded exactly 31,228 public calls as well. It timed 1.71 s in jsdom’s getter, excluding subsequent property reads.

This suggests a general optimization for property groups. A computed-style snapshot could answer overflow and positioning from captured cascade inputs, including shorthand and both axes, without building an unrelated declaration. The captured values have to survive later DOM, stylesheet and CSSOM mutations. Any design that still pays the full ancestor cascade before it captures those inputs can only recover the subsequent declaration work.

A diagnostic replaced each public style lookup with previously observed strings. Replay validated every element tag, requested property and read position, including all 60,302 reads. Three counterbalanced comparisons passed the same 929 cases. Median process time went from **14.930 s to 14.491 s**, saving **0.439 s (2.9%)**. Median body time went from **11.784 s to 11.142 s**, saving **0.642 s (5.4%)**. The wall differences in the three pairs were 0.395, 0.439 and 0.496 s. Replay still incurs its own instrumentation and does not implement CSS semantics. The result measures the effect of bypassing public computation on these exact requests. It does not establish a production speedup or a strict theoretical bound.

Of the 15,464 document lookups that proceeded to cascade computation, 9,388 found a retained frame without a valid reuse proof, 2,877 encountered a changed document revision, 2,335 were the first observed lookup for that element and 864 found no retained frame on a subsequent visit. Every one of these calls had the document-level prerequisites for caching on entry. The remaining 17 cascade computations took a different scope path. The 864 subsequent visits without a retained frame put a limit on how much a larger cache could help here.

A second probe counted which branch first disabled reuse while walking the cascade. The combined guard for inline style, directionality or shadow styling fired 9,945 times. Dynamic selectors fired 1,910 times, consisting of 1,635 `:invalid` and 275 `:hover` candidates. These are first blockers during new computations. They have a different denominator from the previous-frame miss counts. A diagnostic that allowed frame reuse through inline styles, retaining the directionality, shadow and selector guards, took 14.884 and 14.954 s wall versus 14.934 and 14.899 s with the original. Mean body time fell by 84 ms. The scope of that guard alone does not justify relaxing snapshot protections.

A separate focus-only replay supplied the recorded native display decisions in order. All 10,124 tag and decision positions matched across seven files with native focus reads. All decisions were visible. The eight-file comparison went from 15.72 s to 15.16 s wall and 12.54 s to 11.68 s in test bodies in one pair. The direct timer found 0.49 s in focus eligibility. The single-pair difference is sensitive to run variation. Focus and public style costs can overlap.

## Why the stylesheet count overstates the opportunity

Emotion’s development sheet attaches a style element containing an empty text node and then appends rule text. In Autocomplete alone, RunDOM populated sheets 80,881 times for 463 distinct source strings, including the empty string. Across the eight files, there were 120,584 populations, 56,851 syntax lookups and 8,340 syntax cache misses. Only 0.27 s elapsed inside rule parsing in the timed run.

A scratch implementation reused flat, error-free rule arrays by exact source text, within a window and with a 512-entry limit. In two counterbalanced runs the original took **14.927 and 14.925 s** wall. The prototype took **14.894 and 15.001 s**. Average body time fell from **11.81 to 11.64 s**, while average peak RSS rose from **581 to 604 MiB**. Sharing mutable CSSOM rules would also require detaching them on exposure or mutation to preserve rule ownership. This experiment provides no wall-time case for that implementation.

## Costs outside the provider

A collection-only control loaded the same environment and all eight files while skipping all 1,004 tests. That took **3.11 s with RunDOM and 4.81 s with jsdom**. This is a separate invocation and cannot be subtracted exactly from another run. It establishes how much work is present before executing any test bodies.

Four upstream Select tests explicitly wait 700, 400, 400 and 800 ms, for a total of **2.30 s**. Select switches back to real timers for those interaction tests. During the passing files’ sampled bodies, project and other library frames accounted for 56% of active sample weight. RunDOM and recognized dependencies accounted for 28%. React development element creation and JSX were the two largest individual self frames. Those sample shares rank work. Multiplying them by unprofiled wall time would mix two different measurements.

To test that attribution, a scratch loader changed only development owner-stack capture in React 19.3.1’s createElement and JSX factories. React normally constructs an Error with a ten-frame stack for eligible elements and uses a shared fallback after its limit. Using that existing fallback throughout gave **14.134 and 14.110 s** against **14.931 and 14.911 s** in the two controls. Each pair saved about **0.80 s wall** with identical case outcomes. This changes the developer diagnostics available from React. It identifies a cost paid by this workload independently of which DOM engine runs it.

As a cross-check, Ant Design Table.expand and Table.virtual passed all 21 cases with both providers. Body time was 597 ms with RunDOM and 573 ms with jsdom. Ant Design Form list passed nine with each, taking 240 ms and 255 ms. These single pairs cover the files collected by the upstream Vitest manifest. Neither selection contains multiple seconds of test-body work.

## Reproduction and evidence

Material UI was at commit `4c499c5a` with jsdom 30.1.3 and Vitest 5.0.0. Ant Design was at `613e220`. The measurements used Node 24.20.0, one Vitest worker, identical upstream selections and the TypeScript parser. Timings used the upstream fork pool. Stack attribution used a separate thread-pool run with V8 profiles and native monotonic test intervals. All experimental provider changes were made to private package copies. The suite results and public-read traces come from the local checkouts.

[Run commands, raw reports, traces and counterfactual packages](../.cache/seconds-UEj4Pm/) · [Eight-file unprofiled controls](../.cache/seconds-UEj4Pm/probes/) · [Per-file direct timers](../.cache/seconds-UEj4Pm/timing/) · [Full stacks for the eight passing files](../.cache/seconds-UEj4Pm/wide-attribution.json) · [Previous cross-project attribution](jsdom-real-workload-costs.md)

## Ten-file follow-up

RunDOM now resolves mixed-case named properties on HTML attribute maps through the same qualified-name lookup as `getNamedItem`. Enumeration keeps the canonical supported names. SVG and XML retain case-sensitive lookup. Tabs and MenuList join the other eight files in a fully matched comparison with jsdom.

| Provider  |  Pass | Fail | Skip | Wall s | Test bodies s | Peak RSS MiB |
| --------- | ----: | ---: | ---: | -----: | ------------: | -----------: |
| RunDOM    | 1,087 |    0 |   87 |  16.71 |         13.10 |          610 |
| jsdom     | 1,087 |    0 |   87 |  21.80 |         16.09 |          467 |
| Happy DOM | 1,137 |   22 |   15 |  26.73 |         22.26 |          596 |
| TurboDOM  |   458 |  701 |   15 |  23.89 |         16.93 |          443 |

One serial run per provider used the same ten files. RunDOM and jsdom matched by test file, full name, status and multiplicity. The other providers executed a different set of active cases. Their totals include failures. The extra 72 active cases are already reflected in the pass and fail columns.

### Autocomplete memory

Sampling at the end of each test identified Autocomplete as the peak worker for both providers. RunDOM reached 605 MiB RSS with 151 MiB of live-or-uncollected JavaScript objects and 466 MiB of V8 heap capacity. Its old space occupied 291 MiB of physical memory while holding 100 MiB of objects. jsdom reached 536 MiB RSS with 306 MiB of objects and 420 MiB of heap capacity at its own peak. The peaks occurred in different cases.

In separate allocation-sampled runs, a test hook waited for full garbage collection at exactly test 318 and again at test 348, before allowing the suite to continue. At case 318, RunDOM with the attribute fix retained **93.55 and 93.57 MiB** of used heap in two runs. jsdom retained **110.33 MiB**. At case 348, RunDOM retained **95.12 and 95.13 MiB** versus **113.49 MiB** for jsdom. These are live worker measurements before teardown. They include the application, test runner and instrumentation.

The retained allocation profile traced several MiB of hash table capacity to stylesheet attachment. RunDOM now keeps the stylesheet source revision on the observed internal element and its applied revision on the sheet record. This removes two weak maps. Repeating the same collection checkpoints gave **91.53 and 91.51 MiB** at case 318, and **93.08 and 91.68 MiB** at case 348. The ten-file wall times averaged 16.75 s with the change and 16.83 s without it. Peak RSS was variable.

A guarded overflow default shortcut and a separate prototype that postponed CSSOM creation for newly inserted empty style elements both passed the eight-file workload. Neither produced a consistent wall-time gain. For the empty-style prototype, the two process times were 14.912 and 15.002 s against 14.866 and 14.909 s for the control. A shortcut in the deferred property reader still pays for finding the cascade winners.

[Ten-file runner reports](../.cache/push-b60f1d/real/) · [Memory samples by test](../.cache/push-b60f1d/memory/) · [Matched live-heap profiles](../.cache/push-b60f1d/heap/) · [V8 settings experiment](../.cache/push-b60f1d/gc/)

### Controlling worker RSS

In two counterbalanced ten-file runs, setting `NODE_OPTIONS=--max-semi-space-size=16` brought RunDOM's mean peak RSS from **587.7 to 495.5 MiB**. Mean wall time was **16.899 s** with the default and **16.893 s** with the smaller young generation. The corresponding single jsdom pair was 534.6 and 537.6 MiB, at 22.75 and 22.18 s. All cases matched. This is a caller-controlled Node setting tested on Node 24.20.0, with one worker on this host. A consumer that already sets `NODE_OPTIONS` can append the flag. RunDOM sets no process-wide V8 flags on import.

### Parallel execution

With the 16 MiB semi-space setting held constant, RunDOM took **16.99 and 16.76 s** with one worker and **9.72 and 9.52 s** with two. The one-pair jsdom control went from **21.97 to 12.61 s**. All ten files produced identical results with both worker counts. The runner used isolated forks in each configuration.

The process-tree RSS sampler summed live child RSS about every 120 ms, including the test runner. RunDOM peaked at **728–739 MiB** with one worker and **999–1,007 MiB** with two. jsdom peaked at **781 and 1,024 MiB**. Summed RSS can count shared pages more than once and samples can miss short peaks. These figures have a different scope from the maximum single-process RSS in the provider table.

[Full worker-count comparisons](../.cache/push-b60f1d/pools/) · [Synchronized full-GC checkpoints](../.cache/push-b60f1d/strict/)

With the same ten files, one worker and a 16 MiB semi-space, an isolated Node compile cache plus Vitest's filesystem transform cache took 16.68 s to populate. Two warm runs took 15.91 and 15.86 s, versus 16.81 s with both caches off. All 1,087 cases passed. This experiment used the stylesheet revision change and preserved process and file isolation. [Cache controls](../.cache/push-b60f1d/warm/)

### Inline style serialization

Autocomplete's allocation profile included both collected and live objects. The original 348 passing tests allocated an estimated **162.8 MiB** under the RunDOM `cssText` getter, of which **80.2 MiB** fell under physical-border serialization. The previous implementation looked up twelve physical-border components on every nonempty serialization, including Popper's inline positioning writes. The base serializer already supplies the text. The correction pass can replace a border declaration only if that text contains a border property.

The implementation now checks that precondition before building the component map. The default output still goes through the existing outline handling, and declarations containing border text still follow the complete border path. A repeat allocation profile measured **78.7 MiB** under `cssText` and zero sampled bytes under the physical-border serializer. Overall sampled allocation went from 3,006 to 2,949 MiB. Allocation sampling is statistical, and cumulative bytes are distinct from retained heap or peak RSS. [Allocation sampling inputs and before profile](../.cache/push-b60f1d/alloc/) · [After profile](../.cache/push-b60f1d/border/rundom.alloc.json)

### Final engine comparison

Two counterbalanced runs of the final build and stock jsdom produced matching results for all 1,174 selected cases. The single-worker configuration with default V8 settings averaged **16.76 s for RunDOM and 21.86 s for jsdom**. Test bodies averaged 13.07 and 16.16 s. Mean peak RSS was 610 and 569 MiB. The border change itself accounted for about 0.03 s of wall time in its separate comparison with the metadata-only build.

Two counterbalanced comparisons on other projects used the attribute-fix build as their baseline. All selected test identities and outcomes matched. Times below are means in seconds.

| Project                    | Pass / skip | Baseline wall | Final wall | Baseline bodies | Final bodies |
| -------------------------- | ----------: | ------------: | ---------: | --------------: | -----------: |
| Ant Design, eight files    |     133 / 0 |          5.15 |       5.37 |            1.16 |         1.17 |
| Vue runtime-dom            |     270 / 1 |          2.72 |       2.66 |            0.40 |         0.39 |
| Svelte runes, shard 1 of 4 |     565 / 9 |          5.83 |       5.97 |            4.74 |         4.77 |

The repository check passed all 15 tasks. The upstream jsdom API suite passed 634 cases on each parser. The focused WPT selection yielded 83 passing assertions and one pre-existing template-adoption failure on each parser, identical to baseline. Three fixtures marked as expected failures by the upstream manifest had all assertions pass, which Mocha flags as unexpected passes. All 27 assertions in the four named attribute-map fixtures passed.

[Repository check](../.cache/push-b60f1d/final-check.log) · [Focused WPT output](../.cache/push-b60f1d/wpt-border-typescript.log) · [Final provider and cross-project reports](../.cache/push-b60f1d/real/)
