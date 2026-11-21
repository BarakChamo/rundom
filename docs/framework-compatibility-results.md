# Upstream framework compatibility and performance

November 12, 2026. The Vue runtime-dom suite passes after correcting computed custom properties. Ant Design and Material UI pass the selected component suites after correcting visual Window animation-frame bindings. Svelte's motion suite passes, and its broader runtime suites still have 96 failures.

## Compatibility results

| Upstream workload                                                                     | jsdom baseline           | RunDOM                              |
| ------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------- |
| Vue 3.5.45, all 16 runtime-dom files                                                  | 270 passed, 1 skipped    | 270 passed, 1 skipped               |
| Ant Design 6.7.0, eight Alert, Checkbox, Radio and Tag files                          | 133 passed               | 133 passed                          |
| Material UI 10.0.0-alpha.0, five Button, Checkbox, Dialog, Select and TextField files | 430 passed, 39 skipped   | 430 passed, 39 skipped              |
| Svelte 5.57.3, legacy and runes runtime shards plus motion                            | 6,102 passed, 34 skipped | 6,006 passed, 96 failed, 34 skipped |

The regression test exercises inherited and stylesheet custom properties through `getComputedStyle`. Custom properties preserve color tokens such as `red` and `blue`, while the longhands consuming those variables compute RGB values.

The animation-frame regression test exercises replacement of both globals and their absence in nonvisual windows. Ant Design's setup assigns these globals. Material UI's Dialog and Select suites install fake timers that also assign them. With getter-only globals, Ant Design failed to collect its tests and Material UI reported 228 failures. Both suites pass with writable properties in visual windows.

| Checkout    | Commit                                     | Runner        | Baseline     |
| ----------- | ------------------------------------------ | ------------- | ------------ |
| Vue         | `8b479a89445868d474f17e2d837765e7c9ece5e4` | Vitest 4.1.11 | jsdom 30.0.1 |
| Ant Design  | `613e2200c9446a912dd463e060aef9c66c430854` | Vitest 5.1.0  | jsdom 31.0.0 |
| Material UI | `4c499c5a4c00dcece4ae60e5d33ec810def4f2ba` | Vitest 5.0.0  | jsdom 30.1.3 |
| Svelte      | `ff7404cccd5f112b2e99d640d95b2e17974c1ae9` | Vitest 4.1.7  | jsdom 25.0.1 |

The runs use the upstream test sources, configuration, snapshots and setup. A Node resolution hook substitutes the packed RunDOM implementation for Vitest's jsdom import. Worker logs record the resolved entry point. Vue, Svelte and Material UI use their checked-in dependency lockfiles. Ant Design's checkout has no lockfile. Its generated npm lockfile records the installation, including the legacy peer resolution option.

## Svelte compatibility differences

The runtime workload covers DOM rendering, hydration and server rendering. The failures cluster around transition markup, CSS values and serialization, select iteration, media-query stubs, and media state. Several concrete examples distinguish the behavior under test.

| Case                               | Observed difference                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transition markup                  | RunDOM reflects assignments to `inert` into markup. Both tested jsdom versions lack that reflection.                                                        |
| CSS defaults and URL serialization | jsdom 25 returns an empty computed default color and unquoted URL strings in the probed cases. RunDOM and jsdom 30.1.3 both return black and quote the URL. |
| Spread select options              | RunDOM's `HTMLSelectElement` lacks the iterator available in both jsdom versions.                                                                           |
| Media-query mock                   | The fixture installs a spy on `Window.prototype.matchMedia`. RunDOM's own Window method takes precedence over the spy.                                      |

Substituting RunDOM's reference version, jsdom 30.1.3, into the same Svelte checkout produced 6,073 passes, 29 failures and 34 skips. Of those failures, 26 have the same test identities as RunDOM failures. RunDOM has 70 additional failing identities and jsdom 30.1.3 has three of its own. This diagnostic shows how much the results change with jsdom version while retaining the original 25.0.1 baseline for Svelte. The separate motion measurements use the complete upstream motion file.

## Matched performance

The final packed candidate is cohort `iu5km1` with both fixes and the default TypeScript parser. After screening for matching test identities and statuses, each workload ran in five serial pairs of fresh Node 24.20.0 processes with alternating provider order. Runs used one worker at a time, warm filesystem caches and disabled Vitest caching. The host is Apple M4 on macOS arm64. Installation, builds and CPU profiling are outside the measured trials.

| Passing workload                 | Process time, jsdom → RunDOM | Summed test time, jsdom → RunDOM | Peak RSS, jsdom → RunDOM |
| -------------------------------- | ---------------------------: | -------------------------------: | -----------------------: |
| Vue runtime-dom, 270 tests       |              6.311 → 3.614 s |                     395 → 334 ms |            517 → 472 MiB |
| Ant Design selection, 133 tests  |              6.096 → 6.105 s |                 1,279 → 2,037 ms |            507 → 541 MiB |
| Material UI selection, 430 tests |              9.852 → 9.785 s |                 6,576 → 7,210 ms |            406 → 385 MiB |
| Svelte motion, 8 tests           |              1.009 → 0.974 s |                   1.95 → 1.91 ms |            186 → 215 MiB |

Each value is a median. Peak RSS is the maximum resident set size reported by macOS `time -l`. Forked worker pools can have resident memory in several processes at once. The reported maximum is a different measure from their simultaneous combined footprint.

Vue's final process times ranged from 6.288 to 6.379 s for jsdom and 3.564 to 3.627 s for RunDOM. A separate nine-pair run immediately after the CSS fix, before changing animation-frame bindings, measured medians of 6.312 and 3.594 s. Ant Design and Material UI had overlapping process-time ranges. Svelte motion measured about 2 ms of test work in a roughly one-second process, with overlapping ranges as well.

## Where the time goes

**Vue.** Vitest reported 4.00 s of environment work with jsdom and 1.34 s with RunDOM. That 2.66 s reduction explains nearly all of the 2.70 s process difference. Vue test-module import took 0.88–0.91 s and transforms took 0.31 s with either provider. The CommonJS loader's `wrapSafe` frame accumulated 1,165 ms of sampled self time with jsdom and 389 ms with RunDOM. RunDOM's declaration interface creation had 406 ms of inclusive samples across the 16 files. The clearest individual test regression was attaching custom-element styles to shadow DOM, from 1.1 to 11.7 ms. It is small relative to environment setup.

**Ant Design.** Vitest reported an environment share of 25% with jsdom and 12% with RunDOM. The test-body share rose from 23% to 37%. The largest individual increase came from the Radio Group test that inherits a Form.Item name, from 48 to 317 ms. It renders a form and queries the radio roles and accessible names. Three related Form.Item tests each increased by 45–54 ms. RunDOM DOM and CSS frames account for about 1.57 s of sampled self time. Role queries account for 484 ms of inclusive samples with RunDOM versus 47 ms with jsdom. The corresponding visibility checks, `isInaccessible`, account for 385 versus 31 ms. RunDOM's computed cascade alone has 591 ms of inclusive samples across the profile. This workload is the strongest candidate for investigating repeated computed-style work during accessibility queries.

**Material UI.** The environment share fell from 12% to 5%, while tests rose from 72% to 79%. The largest elapsed tests were Select's typeahead reset and pointer delays. The typeahead test explicitly sleeps for 800 ms and took about 830 ms under RunDOM. The pointer tests with fixed delays took about 480–770 ms. The largest measured increase outside the fixed-wait group was closing the menu after a pointer release outside its bounds, from 70 to 102 ms. The accessibility assertion for an expanded listbox increased from 7 to 28 ms. In the worker CPU capture, RunDOM's computed cascade had about 2.00 s of inclusive samples and role queries had 1.08 s. Those paths are worth measuring separately from the fixed waits when optimizing the Select workload.

**Svelte motion.** The eight tests use about 2 ms under either provider. Tooling, module loading and environment creation dominate this workload. Its process timings provide a startup observation for the motion suite. The broader legacy and runes results remain compatibility evidence.

### CPU profile scope

The captures use V8 sampling at a 200 µs interval. Self samples attribute time to the active frame. Inclusive samples include descendants and can overlap across functions, so they should be read individually. Vue and Ant Design used their normal thread workers. Initial Material UI and Svelte captures from fork pools contained only coordinator profiles. Both were captured again with a single thread worker and identical test outcomes. The elapsed-time and RSS table uses their original pools. Profile costs are diagnostic and separate from those medians.

## Evidence

- The final repository gate passed all 15 tasks with `bun run check`. The jsdom facade suite passed 1,559 tests, including the two new contracts.
- `.cache/upstream-framework-followup/matched-results.json` contains the five timing pairs per workload, passing screens, resolved provider paths and profile outcomes. `timing-analysis.json` records per-test medians, process ranges and phase summaries.
- `.cache/upstream-framework-followup/cpu-analysis.json` indexes the raw CPU captures by provider and workload. `*-thread-profile-cpu/` contains the worker diagnostics for Material UI and Svelte motion.
- `.cache/upstream-framework-followup/svelte-rundom-visual.json`, `svelte-jsdom-screen.json` and `svelte-jsdom-reference30.json` contain the three broad Svelte results. The corresponding logs preserve the assertion messages.
- `.cache/vue-dom-full-comparison/results.json` contains the nine-pair Vue measurement immediately after the CSS fix. `.cache/performance-lab-iu5km1/cohort.json` identifies the final candidate's source and installed runtime.

## November 13 follow-up

RunDOM now exposes the Window realm's array iterator on `HTMLSelectElement`. A dynamically inserted blank iframe publishes its child realm before completing the load in a microtask. These changes fixed all four spread-select failures and both iframe-transition failures. The same nine Svelte projects moved from 6,006 to 6,012 passes out of 6,136 tests. The jsdom 25.0.1 baseline remains 6,102 passes and 34 skips.

| Remaining Svelte failures    | Count | What the fixtures observe                                                                        |
| ---------------------------- | ----: | ------------------------------------------------------------------------------------------------ |
| Transition markup            |    70 | RunDOM reflects `inert`. Some cases also depend on jsdom 25's default opacity or spacing.        |
| CSS values and serialization |    16 | Default color, URL quoting, viewport units and border color.                                     |
| Media-query spy              |     2 | Vitest binds the existing Window method before Svelte installs a prototype spy.                  |
| Media event timing           |     2 | jsdom 25 dispatches `volumechange` synchronously. The HTML Standard queues a media element task. |

The transition counts include DOM and hydration variants. Svelte's fixtures, snapshots and setup were unchanged. The [HTML inert contract](https://html.spec.whatwg.org/multipage/interaction.html#the-inert-attribute) and [muted state setter](https://html.spec.whatwg.org/multipage/media.html#dom-media-muted) explain two differences from the older provider. The broader Svelte runtime remains a compatibility result. Timings below cover the passing motion suite and one complete upstream runes shard.

Computed styles now use class and ID buckets to narrow the author rules that can match the element being styled. The cascade still evaluates the selected rules in source order, including live selector state and selector-list specificity. CSSOM exposure, adopted sheets and scoped or nested selector bindings retain their full traversal. A regression test exercises grouped selectors, cascade order, live checkbox state and a CSSOM selector edit.

### Fresh-process benchmarks

The same pinned checkouts and upstream jsdom baselines were used for both measurements. The follow-up used packed RunDOM cohort `F2xZoM` with Node 24.20.0 on Apple M4, macOS arm64 and the TypeScript parser. The harness screened each selection for exact matching test identities and statuses, then ran five serial pairs with alternating provider order, one worker and Vitest caching disabled. Process time includes environment setup, transforms, imports and tests. Summed test time is Vitest's per-test duration total. Peak RSS is the maximum reported by macOS `time -l`. Forked workers can have a larger combined footprint.

The initial indexed build produced these five-pair medians. A subsequent normalization regression test exposed a mismatch for selectors containing an unpaired UTF-16 surrogate. The final build normalizes selector keys before indexing them and was timed separately.

| Passing workload                        | Process time, jsdom → RunDOM | Summed test time, jsdom → RunDOM | Peak RSS, jsdom → RunDOM |
| --------------------------------------- | ---------------------------: | -------------------------------: | -----------------------: |
| Vue runtime-dom, 270 passed, 1 skipped  |              6.363 → 3.634 s |                     397 → 338 ms |            516 → 490 MiB |
| Ant Design, 133 passed                  |              6.089 → 6.020 s |                 1,266 → 1,941 ms |            506 → 548 MiB |
| Material UI, 430 passed, 39 skipped     |              9.826 → 9.745 s |                 6,547 → 7,195 ms |            400 → 406 MiB |
| Svelte motion, 8 passed                 |              1.006 → 0.955 s |                   1.84 → 1.87 ms |            184 → 214 MiB |
| Svelte runes 1/4, 565 passed, 9 skipped |              6.194 → 5.957 s |                 4,991 → 4,799 ms |            339 → 378 MiB |

### Bottlenecks

- **Vue.** Environment setup explains the bulk of the process-time gain. Vitest reported roughly 4.0 s for jsdom and 1.35 s for RunDOM, with similar transform times. Attaching styles to a custom element's shadow DOM remained the largest per-test regression, about 1.1 → 11.8 ms. Sampled computed-style work was under 3 ms.
- **Ant Design.** The initial index reduced inclusive RunDOM role-query samples from 484 to 399 ms, accessibility visibility checks from 385 to 325 ms, and computed-style samples from 591 to 499 ms. The Form.Item radio test improved from 317 to 240 ms, versus 48 ms on jsdom. The median process time improved 85 ms from the preceding RunDOM build, while its peak RSS rose by 7 MiB. Faster environment setup nearly offsets the remaining 675 ms summed-test deficit versus jsdom.
- **Material UI.** The initial index reduced inclusive RunDOM role-query samples from 1,082 to 1,050 ms and computed-style samples from 1,997 to 1,942 ms. These differences are small for a single profile pair. Select's typeahead test still spends around 800 ms waiting by design. The largest increase in per-test medians versus jsdom was the outside mouse-release case, about 73 → 103 ms. The process-time ranges overlapped, and the RSS range for each provider exceeded the difference between medians.
- **Svelte.** Motion spends about 2 ms in assertions. Runes shard 1/4 spends about 5 s in the tests, which include compiling and exercising DOM, hydration and server-rendered variants. The initial indexed build cut about 237 ms from elapsed time for that shard and added 39 MiB of peak RSS versus jsdom. The fork-pool CPU profile only captured the coordinator. A worker-level breakdown requires a separate capture with the thread pool.

V8 CPU captures used 200 µs sampling in separate processes. The Ant Design captures use the normal worker pool. Material UI worker captures use the thread pool and preserve the same 430 passing and 39 skipped tests. Inclusive samples overlap across functions and are diagnostic observations.

### Final build confirmation

Cohort `aKQEf3` ran three new timing pairs after the normalization fix. Every pair matched upstream test identities and statuses. The initial five-pair series provides an independent check on the larger timing trends.

| Passing workload | Passed | Skipped | Process time, jsdom → RunDOM | Summed test time, jsdom → RunDOM | Peak RSS, jsdom → RunDOM |
| ---------------- | -----: | ------: | ---------------------------: | -------------------------------: | -----------------------: |
| Vue runtime-dom  |    270 |       1 |              6.326 → 3.634 s |                     396 → 338 ms |            518 → 491 MiB |
| Ant Design       |    133 |       0 |              6.536 → 6.024 s |                 1,427 → 1,942 ms |            506 → 546 MiB |
| Material UI      |    430 |      39 |             10.089 → 9.757 s |                 6,433 → 7,107 ms |            380 → 406 MiB |
| Svelte motion    |      8 |       0 |              1.027 → 0.975 s |                   1.89 → 1.89 ms |            186 → 214 MiB |
| Svelte runes 1/4 |    565 |       9 |              6.107 → 5.992 s |                 4,807 → 4,729 ms |            341 → 375 MiB |

The final Ant Design capture reproduced the reduction. RunDOM role queries used 402 ms of inclusive samples, visibility checks used 330 ms, and the computed cascade used 500 ms. The jsdom role-query capture used 47 ms. The Form.Item radio test was 53 ms with jsdom and 247 ms with RunDOM. Ant Design's final elapsed medians varied more than the first five pairs, while the RunDOM summed-test median stayed near 1,942 ms.

Material UI's final thread capture measured 1,131 ms in RunDOM role queries and 2,062 ms in the cascade, compared with 1,082 ms and 1,997 ms before indexing. The direction reversed between captures, so the measured change establishes no repeatable Material UI CPU gain. The final suite still spent about 674 ms more in tests than jsdom. Final process ranges overlapped at 9.61–10.75 s for jsdom and 9.50–10.39 s for RunDOM.

The Svelte runes worker capture matched all 565 passing and 9 skipped tests. RunDOM sampled about 2 ms in computed style. Module evaluation, source-file reads and Svelte runtime execution account for substantially more CPU. The thread profiles exclude idle samples from those attributions. The default-pool RSS result remains higher for RunDOM on both Svelte workloads.

The final broad Svelte rerun confirmed exactly the same six test identities moved from failed to passed and no additional failures were introduced. Repository verification passed all 15 tasks, including 1,562 jsdom facade tests.

- [Final matched runs and provider paths](../.cache/framework-nov13-confirmed/matched-results.json)
- [Final CPU, test timing and range analysis](../.cache/framework-nov13-confirmed/analysis.json)
- [Final broad Svelte outcomes](../.cache/framework-nov13-confirmed/svelte-rundom-final-broad.json)
- [Initial five-pair timing and CPU analysis](../.cache/framework-nov13/analysis.json)

## Three-provider follow-up

The pinned Happy DOM 21.0.4 screen used Vitest's built-in Happy DOM implementation under the original jsdom environment key. This retained project selection, including Svelte's per-file environment directives and Material UI's environment-based test conditions. The hook recorded the loaded package. Project sources and assertions stayed intact.

| Original selection                  | Happy DOM passed | Failed | Skipped |
| ----------------------------------- | ---------------: | -----: | ------: |
| Vue runtime-dom                     |              251 |     19 |       1 |
| Ant Design                          |              128 |      5 |       0 |
| Material UI                         |              454 |      8 |       7 |
| Svelte legacy and runes plus motion |            5,823 |    279 |      34 |
| Svelte runes 1/4                    |              561 |      4 |       9 |
| Svelte motion                       |                8 |      0 |       0 |

For elapsed-time comparisons across all three providers, use the common test identities and statuses from the original screens. Vitest discovers the original files and filters by the selected names. The benchmark verifies the resulting identity and status vectors after every run. This keeps Happy DOM's failing cases and Material UI's different runtime skips visible in the compatibility results. Only motion qualified in its entirety.

### Where CPU and allocations go

| RunDOM path                                         | Ant Design before | Material UI before |
| --------------------------------------------------- | ----------------: | -----------------: |
| Stylesheet parsing and rule construction            |            528 ms |           1,192 ms |
| Selector parsing and adaptation in stylesheet rules |            134 ms |             456 ms |
| Computed style, including any stylesheet discovery  |            500 ms |           2,062 ms |
| Cascade rule traversal and matching                 |             81 ms |             435 ms |
| Accessibility role queries                          |            402 ms |           1,131 ms |
| CSS declaration interfaces                          |            230 ms |             140 ms |

In Material UI, about 1.17 s of stylesheet construction was below `getComputedStyle`. The deepest stacks include `collect → populateSheet → parseSheet`, followed by declaration validation and selector compilation. Emotion appends style text for components and the first following style read can materialize the stylesheet. Ant Design parses earlier in its render path and spends a larger share of its role-query time evaluating existing rules and building computed declarations.

After caching parsed declaration blocks and selectors, the intermediate Material UI capture measured 570 ms in stylesheet construction, 70 ms in selector parsing, and 1,446 ms in computed style. The full Material UI suite's three-pair process median was 9.317 s versus 9.849 s on jsdom. The full Ant Design selection was 5.949 s versus 6.138 s, with summed test medians of 1,894 ms versus 1,275 ms. The profiles use inclusive time, so a parent's time already includes the work in its descendants.

V8 allocation samples on the intermediate build attributed about 80 MiB in Ant Design and 51 MiB in Material UI to initializing the CSS declaration interface and loading its dependencies. VM compilation and CSS grammar descriptors account for most of this weight. The public view constructor accounts for about 3 and 2 MiB. Stylesheet construction accounted for about 27 and 13 MiB, respectively. Computed style accounted for about 11 and 24 MiB. These are sampled allocation weights. They overlap and cannot be read as retained heap or added to process RSS.

The new code caches CSS parsing data without sharing mutable rule or declaration objects. Rule snapshots preserve priorities, indexed property order and physical/logical border order. Window-local selector caches retain matching code and evaluate current state on every invocation. Class selectors check ASCII token boundaries directly. CSS declaration descriptor installation still creates Window-local accessor functions. CSSOM edits and adopted sheets keep their live declaration path.

### Qualified three-provider runs

Cohort `9V8vAG` includes deferred flat declarations and direct class/ID checks before matching author rules. A fresh set of three serial rounds also disables Vitest's filesystem transform cache. The reported RSS is process peak, in MiB. Host load caused outliers, especially in Ant Design's timing range.

| Common selection | Passed | jsdom elapsed | RunDOM elapsed | Happy DOM elapsed | jsdom / RunDOM / Happy DOM RSS |
| ---------------- | -----: | ------------: | -------------: | ----------------: | -----------------------------: |
| Vue runtime-dom  |    251 |       6.287 s |        3.736 s |           3.682 s |                518 / 484 / 392 |
| Ant Design       |    128 |       7.037 s |        7.341 s |           5.838 s |                608 / 652 / 586 |
| Material UI      |    423 |       9.728 s |        8.823 s |           7.891 s |                357 / 389 / 454 |
| Svelte runes 1/4 |    561 |       5.903 s |        5.869 s |           5.586 s |                342 / 374 / 366 |
| Svelte motion    |      8 |       1.036 s |        0.942 s |           0.966 s |                185 / 214 / 185 |

The full Ant Design selection passed 133 tests with median elapsed time of 6.370 s on RunDOM and 6.868 s on jsdom. The full Material UI selection passed 430 tests with 39 skips and took 9.063 s on RunDOM and 10.201 s on jsdom. Material UI's final worker profile attributed 299 ms to stylesheet construction, 61 ms to selector parsing, 1,006 ms to computed style and 605 ms to role queries. The earlier values were 1,192, 456, 2,062 and 1,131 ms. In Ant Design, stylesheet construction fell from 528 to 339 ms, but role queries rose from 402 to 456 ms in the sample. Role-query overhead remains a priority for Ant Design.

The full Svelte screen retained 6,012 passes, 90 failures and 34 skips. The repository gate passed 15 tasks and 1,564 jsdom facade tests. The timing target across all providers remains open.

- [Three-provider trial results](../.cache/framework-target-prefilter/verified-results.json)
- [Baseline and intermediate CPU and allocation data](../.cache/framework-target/profile-details.json)
- [Final Svelte screen](../.cache/framework-target-prefilter/svelte-rundom-broad.json)
- [Expanded workload inventory and benchmarks](framework-performance-campaign.md)

## WebSocket startup follow-up

The packed candidate defers Undici loading until the first WebSocket is constructed. The Ant Design full selection improved from 6.174 to 5.979 s in three interleaved rounds, with a 6.480 s jsdom median. Material UI's full selection measured 8.766 to 8.704 s with a 9.852 s jsdom median. Material UI's environment phase dropped from about 6% to 4% of total time while its summed test times stayed near 6.2 s. Ant Design's test bodies still took 1.720 s on RunDOM versus 1.290 s on jsdom. Peak RSS moved from 652 to 653 MiB in Ant Design and from 390 to 408 MiB in Material UI. These process peak readings vary across the three trials. [Before and after trials](../.cache/framework-target-websocket/results.json)

| Common selection | Passed | jsdom elapsed | RunDOM elapsed | Happy DOM elapsed | jsdom / RunDOM / Happy DOM RSS |
| ---------------- | -----: | ------------: | -------------: | ----------------: | -----------------------------: |
| Vue runtime-dom  |    251 |       6.266 s |        3.443 s |           3.713 s |                519 / 503 / 394 |
| Ant Design       |    128 |       6.345 s |        6.064 s |           5.442 s |                608 / 653 / 589 |
| Material UI      |    423 |       9.819 s |        8.786 s |           7.881 s |                356 / 409 / 453 |
| Svelte runes 1/4 |    561 |       6.150 s |        5.881 s |           5.825 s |                342 / 366 / 366 |
| Svelte motion    |      8 |       0.992 s |        0.949 s |           0.982 s |                183 / 214 / 186 |

The Svelte runes and motion trial ranges overlap. The full Vue rerun matched 270 passes and one skip, and the full Svelte runes shard matched 565 passes and nine skips. The repository gate passed 15 tasks, including 1,566 jsdom facade tests and 16 DOM package tests. The pinned upstream jsdom 30.1.3 public API suite passed all 634 tests. A focused WPT replay matched 46 passing assertions across seven fixtures covering node insertion and WebSocket closure. [Three-provider trials](../.cache/framework-target-websocket/three-provider-final.json), [Repository gate](../.cache/framework-target/websocket-check.log), [Upstream API run](../.cache/framework-target-websocket/upstream-api.log), [Focused WPT outcomes](../.cache/framework-target-websocket/candidate-wpt.jsonl)
