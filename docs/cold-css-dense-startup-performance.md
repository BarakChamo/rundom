# First CSS read, dense traversal and empty Window startup

The frozen baseline is [5wpPv0](../.cache/performance-lab-5wpPv0/cohort.json). The replay uses Node 24.20.0 on an Apple M4, jsdom 30.1.3, Happy DOM 21.0.4, TurboDOM 0.7.1 and RunDOM’s default TypeScript parser. Stock jsdom in the upstream projects is the version pinned by each project. Timing trials on this machine are exploratory. System load and memory pressure varied substantially, and diagnostic, compatibility and benchmark runs overlapped during portions of the campaign. Check results and allocations remain useful under that contention. Timing interpretations rely on rotated trials, repeated direction and the stage in which a change should act.

## First authored CSS read

The baseline CPU profile attributes 7.88 ms of self time across two first-use profiles to RunDOM’s private declaration interface and 7.33 ms to the pinned cssstyle initialization frame. Garbage collection contributes 9.83 ms across the same profiles. Sampled allocation in the cssstyle initialization frame totals 22.35 MiB across the two trials. CSS grammar descriptors, the private declaration interface and public view construction allocate separately. The first authored read constructs the declaration engine and computes a real author-rule cascade. Subsequent reads can reuse the completed private frame. [CPU attribution](../.cache/performance-lab-5wpPv0/cpu-amhx2m/analysis.md) · [Allocation attribution](../.cache/performance-lab-5wpPv0/allocation-ggItCw/analysis.md)

RunDOM now sends named CSS property writes straight to the receiver’s owning declaration. That eliminates a second full set of private forwarding accessors. Alias metadata is built once and stays private to the style implementation. Each Window still creates its own public accessor functions and resolves deferred declarations and borrowed operations against their receivers. The original pinned getters handle shorthand semantics. [CSS view](../packages/dom/src/css-declaration-view.ts) · [CSS implementation](../packages/dom/src/styles.ts)

Installing a smaller vendor prototype and synthesizing getters from raw property reads sped up initialization but was sensitive to property name generation and shorthand semantics. A second version used the vendor’s exact generated descriptors without attaching them. Its focused tests passed and forced-GC style-read RSS was lower, but the paired median for the first authored read improved by less than the per-process variation and whole-process time increased. The retained path leaves the build-time vendor adapter alone. [Exact-descriptor experiment](../.cache/performance-lab-iXs6zB/comparison-F7mAlo/report.md)

## Dense traversal

The warm profile identifies fresh Window assembly, copying the recurring markup into independent mutable records, wrapping selected nodes, native structured-clone guards and GC. Across six warm batches, the baseline profiles attribute 13.42 ms self time to `buildWindow`, 8.34 ms to `copyInactiveTemplate`, 4.34 ms to `markAsUncloneable` and 19.71 ms to GC. The sampled allocation profile records 38.17 MiB in template copying and 16.87 MiB in wrapper constructors. Attribution uses the profiler’s per-phase captures. [CPU attribution](../.cache/performance-lab-5wpPv0/cpu-2weLRB/analysis.md) · [Allocation attribution](../.cache/performance-lab-5wpPv0/allocation-fUN7RY/analysis.md)

The diagnostic stage split checks every selected row’s owner, text and attribute. Across four 4,096-row documents, the earlier diagnostic measured 23.41 ms for baseline RunDOM construction, 14.00 ms for its query and 11.05 ms for its checked reads. TurboDOM’s corresponding stages measured 0.77, 7.05 and 5.96 ms. The sealed run reproduced the largest deficit in construction, with substantial variation in read timing. TurboDOM’s packed shared parse cache cuts initial document work, while its thinner query and indexed reads also contribute. RunDOM keeps independent parse5 topology, fresh NodeList snapshots, Window-local prototypes, stable wrappers and native structured-clone rejection. The workload reads 16,384 rows per batch, so deferring wrappers to indexed access just moves their cost. [Staged run and controls](../.cache/cold-css-dense-startup/staged-attribution.log) · [TurboDOM implementation notes](turbodom-performance.md)

The compact per-element attribute recipe improved the initial dense timing by about 6% on a loaded host, but retained heap after releasing eight recurring dense documents rose from 25.91 to 31.34 MiB. Keeping a separate attribute array for each element explains the added live objects. This candidate was removed even though short-run RSS went down. Copy-on-write of singleton attribute records and simpler attribute/text reads also failed throughput controls. [Dense candidate](../.cache/performance-lab-7aZAKh/comparison-nTFZRg/report.md) · [Forced-GC retained templates](../.cache/cold-css-dense-startup/template-retention.cjs)

## Empty Window startup

The warm baseline sample attributes 20.29 ms self time to `buildWindow`, 4.08 ms to `WindowMembers` and 3.04 ms to GC across six measured batches. Sampled `buildWindow` allocation totals 28.95 MiB. An independent staged probe across 350 warm creations timed handler/tag installation at 0.431 ms per Window, initial bindings and VM decision at 0.286 ms, the first descriptor/auxiliary-global installation at 0.278 ms and HTML subclasses at 0.203 ms. These stage medians are independently computed. [CPU attribution](../.cache/performance-lab-5wpPv0/cpu-bqCrap/analysis.md) · [Allocation attribution](../.cache/performance-lab-5wpPv0/allocation-CVO5Z6/analysis.md) · [Stage checkpoints](../.cache/cold-css-dense-startup/window-ablation.jsonl)

RunDOM initializes the private Window member holder in V8 dictionary mode before installing its public bindings. Temporary keys are removed within the holder’s initialization. Public descriptors, constructor identity and VM behavior remain covered by the realm tests. Two nine-round preflights moved empty create/close warm medians from 17.72 to 14.98 ms and 20.47 to 18.79 ms for four creations. Forced-GC live RSS for 32 windows was 161.03 versus 160.88 MiB. Installing individual descriptors and collapsing the final enumeration/tagging pass were also tried. Both warmed controls were flat or slower. TurboDOM gets most of its remaining lead from proxy-backed lazy globals and shared constructors, while RunDOM assembles independently mutable Window interfaces and defines its global property contracts at construction. [Window implementation](../packages/dom/src/window.ts:18245) · [Repeated timing](../.cache/performance-lab-3kfMI5/comparison-M0ijZf/report.md) · [Finalization candidate](../.cache/performance-lab-jEGcw0/comparison-kzNw6z/report.md)

### Compatibility and lifetime checks

The frozen source passed `bun run check`, 1,574 facade tests in each parser mode, and 634 upstream jsdom API cases in each parser mode. A baseline comparison checked setters, getters, declaration text and computed reads for all 1,619 named CSS properties using eight values each. A separate reflection comparison matched the order and descriptor shape of all 490 ordinary Window keys and 492 visual Window keys in each of three script modes. The regression tests also exercise reentrant coercion through a borrowed CSS setter and confirm that Window allocation leaves no own symbols behind. [CSS property comparison](../.cache/cold-css-dense-startup/css-diff.log) · [Window reflection comparison](../.cache/cold-css-dense-startup/reflection-final.log) · [Gate status](../.cache/cold-css-dense-startup/status)

The focused CSS, selector and ParentNode WPT replay records 756 executed fixtures and 13,037 named assertion outcomes per backend. Named outcomes match the previous build on both backends. One Rust CSSOM fixture recorded a harness timeout under load. Its immediate rerun matched the baseline in all 11 named assertions and harness status. Each batch recorded 650 passing fixtures, 25 pending fixtures and 106 existing fixture expectation failures. [Named comparison](../.cache/cold-css-dense-startup/wpt-delta.json) · [Timeout rerun](../.cache/cold-css-dense-startup/css-value-wpt-proof.json)

In five-process forced-GC comparisons, RunDOM’s 32 styled Windows used 182.27 → 183.30 MiB live RSS, 183.06 → 185.98 MiB peak RSS and 65.33 → 64.08 MiB live heap. Released heap fell from 32.08 to 31.42 MiB. Unstyled live RSS fell from 149.84 to 146.95 MiB, while peak rose from 151.81 to 155.19 MiB. Treat those single-digit RSS movements as shared-host spread. The dense template candidate’s 5.43 MiB released-heap increase is reproduced across eight recurring fixtures, and the final package uses the baseline template representation. [Baseline memory](../.cache/performance-lab-5wpPv0/memory-qdPOWa/report.json) · [Retained build memory](../.cache/performance-lab-O2bxk3/memory-C13ghU/report.json)

## Four-provider targeted replay

All four providers passed every check in this focused replay. Each cell uses five rotated fresh processes. The cold value is one checked operation and the warm value is a batch of four. Dense traversal visits every one of the 4,096 rows in each document. Total includes the Node process, harness, load, setup, warmup, measured batches and exit. The host was exceptionally busy in these trials. Use the absolute times here to interpret this replay only. [Raw timing report](../.cache/performance-lab-O2bxk3/timing-cI9QXT/report.json)

| Scenario and metric                           |    RunDOM |      jsdom |  Happy DOM | TurboDOM |
| --------------------------------------------- | --------: | ---------: | ---------: | -------: |
| First authored CSS read, wall ms              |   142.435 |    188.744 |     35.038 |    7.772 |
| First authored CSS read, user + system CPU ms |    64.990 |    140.064 |     21.263 |   13.108 |
| Empty Window, warm batch ms                   |    16.728 |     60.423 |     22.749 |    0.101 |
| Dense traversal, warm batch ms                |    67.239 |  1,250.686 |  2,305.203 |   23.031 |
| First CSS read workload, total ms             |   875.471 |  3,175.828 |  1,657.654 |  737.602 |
| Empty Window workload, total ms               |   867.847 |  3,174.330 |  1,650.212 |  606.482 |
| Dense traversal workload, total ms            | 1,512.218 | 13,679.002 | 18,064.684 |  839.864 |
| 32 styled Windows, live RSS MiB               |    201.77 |     302.12 |     335.06 |   116.89 |
| 32 styled Windows, live heap MiB              |     64.08 |     122.49 |     153.47 |    20.54 |
| 32 styled Windows, released heap MiB          |     31.42 |      51.85 |      25.48 |    16.47 |

The 256-row four-provider comparison recorded 71.81 ms for RunDOM’s first authored CSS read, versus 135.93 ms for its baseline, 214.33 ms for jsdom, 27.20 ms for Happy DOM and 5.07 ms for TurboDOM. The earlier paired CSS trials under lighter contention moved first-use wall time from 23.31 to 15.97 ms and from 36.88 to 26.48 ms. On the exact retained artifact, first-use CPU in nine paired fresh processes fell from 89.58 to 66.08 ms. Wall time was 244.61 versus 234.84 ms and whole-process time increased from 1,375.46 to 1,558.98 ms in that heavily contended pair. The retained artifact also spent less process CPU on empty-window batches in all three alternating in-process runs. Dense-read process CPU improved in two of the three runs. Its fresh-process warm timings diverged across comparisons, so the evidence supports a startup improvement and no clean dense-throughput claim. [256-row four-provider pair](../.cache/performance-lab-O2bxk3/comparison-NBlev6/report.md) · [First CSS candidate](../.cache/performance-lab-1NCdFx/comparison-zNclJ9/report.md) · [Exact retained CSS pair](../.cache/performance-lab-O2bxk3/comparison-5b7Ej6/report.md) · [Exact retained dense and empty pair](../.cache/performance-lab-O2bxk3/comparison-tLnfWR/report.md) · [Alternating CPU diagnostic](../.cache/cold-css-dense-startup/window-warm-cpu.cjs)

A separate topology candidate allocated a packed first-child array in place of growing an empty array. It lowered live heap in the eight-document diagnostic by 4.5 MiB. Dense process CPU moved 79.04 → 74.57, 75.17 → 74.67 and 75.86 → 75.39 ms in three repeats. Its fresh-process traversal and update comparisons showed mixed results, with a higher unique-input warm median. It was left out of the retained build. [Topology comparison](../.cache/performance-lab-ykBVxZ/comparison-Fab9Vf/report.md)

The remaining gaps have different owners. The cold CSS profile still shows cssstyle initialization and grammar setup. Dense traversal still pays to build a mutable owned tree and allocate branded wrappers before the caller reads the results. Empty Window startup still pays for independently mutable interfaces and hundreds of own descriptors. TurboDOM’s lower RSS in styled windows and traversal accompanies those same implementation differences. RunDOM uses less styled-window RSS than jsdom and Happy DOM in this replay. The 256-row forced-GC traversal row uses more peak RSS than Happy DOM, 304.11 versus 242.97 MiB, while retaining less heap after release, 20.88 versus 25.18 MiB. [Raw memory report](../.cache/performance-lab-O2bxk3/memory-EQ9dju/report.json)

A final startup experiment skipped redundant host prototype assignments on the four text-encoding interfaces and simplified their descriptor installation. Empty-window batches improved from 22.46 to 18.68 ms, while traversal and unique-HTML warm medians moved from 25.45 to 26.22 and 32.63 to 37.34 ms. The mixed controls kept this candidate out of the retained build. [Text-encoding interface experiment](../.cache/performance-lab-XwrYaD/comparison-AkBWut/report.md)

## Role query follow-up

The retained RunDOM profile puts the largest warm costs in Testing Library role matching and accessible-name computation. RunDOM also spends time normalizing input types and validating branded element receivers. Its largest sampled allocation frame in this profile is a simple compound selector predicate, followed by iterators and filtering. The unstyled computed snapshot allocates, but accounts for a smaller share of this workload than the selector predicate. The input-type fast path made role batches slightly faster and interaction-state batches slower in seven paired trials. It was left out of this release. [CPU profile](../.cache/performance-lab-O2bxk3/cpu-25bujM/analysis.md) · [Allocation profile](../.cache/performance-lab-O2bxk3/allocation-KeEaG0/analysis.md) · [Input-type trial](../.cache/performance-lab-3DTxc0/comparison-wGcD5B/report.md)

## Ant Design profile

The retained build passed all 133 cases in the fixed Ant Design selection with CPU profiling enabled. The captured stacks place computed style and stylesheet insertion at the top of the DOM work. Within computed style, the remaining costs include rule selection, custom-property expansion and value resolution. Stylesheet insertion spends time parsing nested rules and preparing selectors. Self time in the general declaration setter was 24.96 ms in this capture. Most of its inclusive time is below that dispatch. The instrumented process ran under heavy contention, so its wall-time samples cannot quantify a change from the prior profile. [Ant Design attribution](../.cache/cold-css-dense-startup/antd-profile/attribution.log)

## Other timing and memory gaps

The first diverse-selector query loads the general selector stack. Its cold profile includes CSS runtime file reads, cache hashing, VM compilation and css-tree grammar initialization. The compilation cache and the existing narrow selector paths already remove that cost from repeated and simple queries. The first-use profile shows where the remaining general-selector work occurs. [Cold selector profile](../.cache/performance-lab-O2bxk3/cpu-Cf8iyE/analysis.md)

The highest peak-RSS deficits in the default matrix occurred in fragment-list and fragment-table replacement. A list replacement profile shows parse5 tokenization plus repeated subtree walks for document names, ID index invalidation and insertion bookkeeping. The allocation capture places the same walks and their iterator arrays among the top allocation frames. Replacing the two ordinary descendant generators reduced table timings but slowed list and reconciliation warm batches. The production path stays on the existing implementation. [Allocation profile](../.cache/performance-lab-O2bxk3/allocation-ltobjv/analysis.md) · [Scan experiment](../.cache/performance-lab-gXmy8c/comparison-EClKKI/report.md)

## Full scenario and framework replay

Completed scenarios require every fresh process to pass the checked operation. Incomplete and unsupported rows are recorded in the stage-by-stage report.

| Workload family                                           | Scenarios | Rounds | RunDOM | jsdom | Happy DOM | TurboDOM |
| --------------------------------------------------------- | --------: | -----: | -----: | ----: | --------: | -------: |
| Construction, parse, clone and serialize                  |         9 |      9 |      9 |     9 |         9 |        8 |
| Queries, styles, interactions and other default scenarios |        35 |      3 |     35 |    34 |        29 |       28 |
| 4,096-row dense scenarios                                 |         6 |      3 |      6 |     6 |         6 |        6 |

Across the scenarios all four providers completed, the summed median process times for RunDOM, jsdom, Happy DOM and TurboDOM were 9.79, 39.25, 23.39 and 5.43 s for the eight construction scenarios, 17.44, 70.86, 43.08 and 21.62 s for the 27 lighter scenarios, and 6.04, 37.08, 46.12 and 4.62 s for the six dense scenarios. Each sum describes a batch of independent processes.

[Load, setup, first use, warmup, measured work, close, total time and RSS for each provider](../.cache/cold-css-dense-startup/lab-report.md)

Pass / fail / skip counts for the fixed upstream selections. TurboDOM’s full Vue run collected 202 tests. The other providers collected 271. The full Svelte run includes the runes shard.

| Upstream selection |         RunDOM |         jsdom |       Happy DOM |      TurboDOM |
| ------------------ | -------------: | ------------: | --------------: | ------------: |
| vue-core           |    270 / 0 / 1 |   270 / 0 / 1 |    251 / 19 / 1 |  169 / 32 / 1 |
| antd               |    133 / 0 / 0 |   133 / 0 / 0 |     128 / 5 / 0 |  121 / 12 / 0 |
| mui                |   430 / 0 / 39 |  428 / 2 / 39 |     454 / 8 / 7 | 181 / 281 / 7 |
| svelte-runes-shard |    565 / 0 / 9 |   565 / 0 / 9 |     561 / 4 / 9 |     0 / 0 / 0 |
| next-example       |      5 / 0 / 0 |     5 / 0 / 0 |       5 / 0 / 0 |     5 / 0 / 0 |
| freecodecamp       |      4 / 0 / 0 |     4 / 0 / 0 |       4 / 0 / 0 |     4 / 0 / 0 |
| supabase-ui        |     85 / 0 / 0 |    85 / 0 / 0 |      84 / 1 / 0 |    80 / 5 / 0 |
| svelte-motion      |      8 / 0 / 0 |     8 / 0 / 0 |       8 / 0 / 0 |     0 / 0 / 0 |
| svelte             | 6012 / 90 / 34 | 6102 / 0 / 34 | 5823 / 279 / 34 |     0 / 0 / 0 |

[Core framework screens](../.cache/cold-css-dense-startup/upstream-priority/results.json) · [Additional framework screens](../.cache/cold-css-dense-startup/framework-other-screens/results.json) · [Broad Svelte screen](../.cache/cold-css-dense-startup/svelte-broad/results.json) · [Matched framework timing](../.cache/cold-css-dense-startup/framework-report.md)

The broad RunDOM Svelte run retained exactly the same 6,136 named outcomes as the baseline. Its 90 existing failures are outside the passing runes-shard selection. [Named Svelte comparison](../.cache/cold-css-dense-startup/svelte-broad/named-delta.json)

In a separate rotated Ant Design comparison, all four providers passed the same 116 tests in three processes. RunDOM’s median test-body time was 8.53 s and peak RSS 640.3 MiB. The corresponding medians were 5.70 s and 606.0 MiB for jsdom, 4.13 s and 582.4 MiB for Happy DOM, and 3.57 s and 565.2 MiB for TurboDOM. RunDOM’s whole process took 31.47 s, versus 34.66, 24.79 and 21.67 s. Host contention limits precision. [Three rotated Ant Design rounds](../.cache/cold-css-dense-startup/framework-antd-matched/results.json)

The matched Material UI run completed 161 tests on RunDOM, jsdom and Happy DOM. TurboDOM failed that selection. A narrower 118-test run qualified RunDOM, jsdom and TurboDOM, while one Happy DOM process exited before reporting. The 561-case Svelte runes comparison qualified RunDOM, jsdom and Happy DOM. TurboDOM did not collect the shard. The React stress replay verified all ten workflows for RunDOM in all nine rounds across each of the four Vitest pools. Screen failures for other providers and pool-specific timings are included in the framework report.
