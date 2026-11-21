# Ancestor cascade and Material UI memory

Ant Design's four Radio Group and Form Item cases repeatedly rebuilt large theme blocks while Testing Library checked visibility and display. The baseline trace observed 68 full ancestor declarations and 19,803 visits to their winning properties. Custom tokens accounted for 18,750 visits. Interleaved inherited properties and overlapping local tokens often sent the cascade down the per-token write path. The original admission estimate also counted a parent's matching inputs against deferred targets that held only its computed declaration. In this trace 79 of 95 new target frames exceeded the per-frame limit.

Large resolved literal custom-token groups now share immutable name and value storage. Each group's index is preserved separately, so computed-style enumeration keeps ordinary inherited properties in their original positions. An ancestor can pass a complete group down without writing each token into a new native declaration. Winning declarations that require variable expansion or CSS-wide keyword handling continue through the cascade. The same bounded cache charges these blocks and the actual inherited values held by snapshots. Reading an earlier snapshot still returns the captured values after stylesheet or DOM changes.

In the token-packing trace, 52 ancestor declarations replaced the baseline's 68. Packed groups supplied 16,850 token values. Individual custom-property entries processed dropped from 18,750 to 1,572. The deferred target rejection count fell from 79 to 20. These counters describe the selected cases independently of elapsed time. [Token-packing counters](../.cache/ancestor-cascade-FvAE6A/final-radio-counters.json)

Material UI's maximum resident peak was in the worker running Select. The baseline allocation sample attributed 136.4 MiB of cumulative allocations to RunDOM's focus path, including 123.5 MiB through computed style. The stock jsdom focus path accounted for 45.6 MiB. Focus was requesting a fresh style for each ancestor after the first cascade had already resolved those ancestors. The internal display check now consumes those resolved values within one focusability check. Focus uses the original public path when style readers have been replaced, custom viewport getters are installed, or CSSOM has been exposed or adopted. Scoped reuse ends with the focus check, so moving focus across a blur handler rechecks the new tree.

The initial focus guard accepted numeric viewport properties. The native viewport uses replaceable getters, which kept the new path out of Select. The corrected guard recognizes the installed getters as well as numeric data properties. In the corrected trace, 544 focus checks needed a fresh style, 950 display reads used previously certified ancestor values, and 1,490 used ancestors from the same check.

Allocation samples include collected objects. Resident memory, physical footprint and V8 heap used are measured independently from allocation and timing profiles.

[Baseline Radio Group counters](../.cache/ancestor-cascade-FvAE6A/admission.json) · [Baseline Select samples](../.cache/ancestor-cascade-FvAE6A/select-allocations-summary.txt) · [Corrected Select focus counters](../.cache/ancestor-cascade-FvAE6A/native-mui-counters.json) · [Previous checkpoint](computed-style-on-demand.md)

## Radio Group timing

Each row uses three fresh, rotated runs of the same four named cases. The fixture passed on every provider and build in this probe.

| Experiment                                  | Baseline RunDOM test bodies | Candidate test bodies | Stock jsdom test bodies |
| ------------------------------------------- | --------------------------: | --------------------: | ----------------------: |
| Packed token groups                         |                      247 ms |                228 ms |                  180 ms |
| Packed groups and corrected frame admission |                      368 ms |                275 ms |                  290 ms |
| Final build                                 |                      378 ms |                374 ms |                  263 ms |

In the final batch, median process time was 6.42 s on baseline RunDOM, 6.07 s on final RunDOM, and 7.20 s on jsdom. Sample counts under RunDOM computed-style work went from 604 to 390. They were 191 in jsdom's separate profile. The final test bodies were 1.29× slower than jsdom's, with substantial variation across batches.

[Counters and timings for packed groups](../.cache/ancestor-cascade-FvAE6A/timed/cache-pair-results.json) · [Frame admission replay](../.cache/ancestor-cascade-FvAE6A/radio-confirm/cache-pair-results.json) · [Final Radio Group trials](../.cache/ancestor-cascade-FvAE6A/native-radio/cache-pair-results.json) · [CPU profiles](../.cache/ancestor-cascade-FvAE6A/native-radio/profile-summary.json)

Across all 30 Radio Group cases in the final full Ant Design runs, median test-body time was 1.37 s on RunDOM and 1.07 s on jsdom. The final RunDOM profile attributed 364 samples to stylesheet parsing and construction, including 241 inside rule construction. This work persists alongside the remaining cascade cost.

## Four-provider replay

Node 24.20.0 ran on an Apple M4 with macOS arm64. Ant Design uses jsdom 31.0.0 and Material UI uses jsdom 30.1.3. The RunDOM alias, Happy DOM 21.0.4, and TurboDOM 0.7.1 came from the frozen cohort. Timed case identities and provider resolution paths were verified. The shared host had substantial load variation during the replay.

## Vitest coverage

Cells show passed / failed / skipped or todo and the full-screen process time. A runner failure may terminate collection. A dagger marks a nonzero runner exit with no individual failed test. Full-screen times reflect the work each provider completed.

| Selection   | RunDOM                  | jsdom                   | Happy DOM              | TurboDOM                 |
| ----------- | ----------------------- | ----------------------- | ---------------------- | ------------------------ |
| Ant Design  | 133 / 0 / 0 (14.253 s)  | 133 / 0 / 0 (11.715 s)  | 128 / 5 / 0 (14.717 s) | 121 / 12 / 0 (16.902 s)  |
| Material UI | 430 / 0 / 39 (16.586 s) | 430 / 0 / 39 (23.097 s) | 454 / 8 / 7 (18.889 s) | 181 / 281 / 7 (15.705 s) |

[Vitest screens and trial results](../.cache/native-viewport-replay-FUOpCn/vitest/results.json) · [Verified provider paths, versions, and named screen outcomes](../.cache/native-viewport-replay-FUOpCn/verified-evidence.json)

## Matched Vitest performance

Each cell gives median process seconds / summed assertion duration in milliseconds / peak RSS in MiB. A row uses exactly the same passing case identities on every displayed provider. Timed attempts with incomplete work or differing case identities remain in the raw results.

| Selection   | Passed per trial | RunDOM                | jsdom                 | Happy DOM             | TurboDOM              |
| ----------- | ---------------- | --------------------- | --------------------- | --------------------- | --------------------- |
| Ant Design  | 116              | 12.648 / 5215 / 839.1 | 15.281 / 4806 / 793.3 | 11.759 / 3826 / 733.6 | 12.307 / 3406 / 720.8 |
| Material UI | 161              | 9.021 / 3114 / 279.3  | 12.507 / 5113 / 268.4 | 9.766 / 2677 / 264.0  | —                     |
| Material UI | 118              | 8.858 / 2031 / 299.4  | 9.858 / 2867 / 297.9  | 6.007 / 1443 / 313.2  | 4.434 / 945 / 315.7   |

| Selection   | Cases attempted | Incomplete timing series |
| ----------- | --------------- | ------------------------ |
| Material UI | 161             | TurboDOM                 |

Elapsed ranges across the three verified trials in each displayed series, in seconds.

| Selection   | Cases | RunDOM       | jsdom         | Happy DOM     | TurboDOM     |
| ----------- | ----- | ------------ | ------------- | ------------- | ------------ |
| Ant Design  | 116   | 8.864–17.542 | 14.693–17.150 | 11.665–16.049 | 7.829–12.845 |
| Material UI | 161   | 6.797–14.556 | 11.391–16.050 | 5.591–11.430  | —            |
| Material UI | 118   | 6.429–9.887  | 6.062–11.061  | 3.740–7.915   | 3.877–6.729  |

Median user plus system CPU from the runner’s operating-system timing log, in seconds.

| Selection   | Cases | RunDOM | jsdom | Happy DOM | TurboDOM |
| ----------- | ----- | ------ | ----- | --------- | -------- |
| Ant Design  | 116   | 27.41  | 30.79 | 25.83     | 23.41    |
| Material UI | 161   | 12.92  | 17.64 | 12.89     | —        |
| Material UI | 118   | 10.21  | 13.06 | 8.50      | 7.10     |

## Previously selected full Vitest workloads

These repeated pairs require all named statuses, including skips, to match each repository’s jsdom screen.

| Selection   | Passed per trial | RunDOM                 | jsdom                  | Wall ranges in s (RunDOM / jsdom) | Valid pairs |
| ----------- | ---------------- | ---------------------- | ---------------------- | --------------------------------- | ----------- |
| Ant Design  | 133              | 15.852 / 6422 / 839.1  | 16.298 / 5215 / 849.1  | 14.193–16.347 / 16.094–19.333     | 3           |
| Material UI | 430              | 19.330 / 17041 / 331.7 | 25.116 / 22651 / 313.2 | 18.237–20.784 / 22.822–25.824     | 3           |

[Full selection timings and attempt failures](../.cache/native-viewport-replay-FUOpCn/vitest/full-results.json)

### Runner phases

Times are in seconds. Vitest rounds its reported phase shares to whole percentages. Test bodies use summed assertion durations from the JSON report, and process time comes from the outer runner.

| Selection   | Provider  | Passed | Transform | Environment | Setup | Import | Test phase | Test bodies | Process | RSS (MiB) |
| ----------- | --------- | ------ | --------- | ----------- | ----- | ------ | ---------- | ----------- | ------- | --------- |
| Ant Design  | jsdom     | 116    | 6.92      | 2.97        | 1.56  | 0.59   | 2.50       | 4.81        | 15.28   | 793.3     |
| Ant Design  | RunDOM    | 116    | 6.14      | 0.48        | 1.92  | 0.72   | 2.77       | 5.22        | 12.65   | 839.1     |
| Ant Design  | Happy DOM | 116    | 5.68      | 1.45        | 1.67  | 0.79   | 2.02       | 3.83        | 11.76   | 733.6     |
| Ant Design  | TurboDOM  | 116    | 6.90      | 0.00        | 1.59  | 0.73   | 1.84       | 3.41        | 12.31   | 720.8     |
| Material UI | jsdom     | 161    | 4.99      | 1.66        | 0.42  | 1.11   | 2.77       | 5.11        | 12.51   | 268.4     |
| Material UI | RunDOM    | 161    | 4.20      | 0.15        | 0.53  | 0.97   | 1.60       | 3.11        | 9.02    | 279.3     |
| Material UI | Happy DOM | 161    | 4.34      | 0.90        | 0.42  | 1.00   | 1.50       | 2.68        | 9.77    | 264.0     |
| Material UI | jsdom     | 118    | 5.12      | 1.24        | 0.19  | 0.66   | 1.68       | 2.87        | 9.86    | 297.9     |
| Material UI | RunDOM    | 118    | 4.90      | 0.11        | 0.50  | 0.57   | 1.23       | 2.03        | 8.86    | 299.4     |
| Material UI | Happy DOM | 118    | 2.84      | 0.44        | 0.19  | 0.54   | 0.83       | 1.44        | 6.01    | 313.2     |
| Material UI | TurboDOM  | 118    | 1.92      | 0.00        | 0.18  | 0.51   | 0.59       | 0.95        | 4.43    | 315.7     |
| Ant Design  | jsdom     | 133    | 8.02      | 3.13        | 1.72  | 0.62   | 2.82       | 5.21        | 16.30   | 849.1     |
| Ant Design  | RunDOM    | 133    | 8.18      | 0.45        | 2.04  | 0.78   | 3.33       | 6.42        | 15.85   | 839.1     |
| Material UI | jsdom     | 430    | 5.61      | 2.82        | 0.71  | 1.49   | 12.01      | 22.65       | 25.12   | 313.2     |
| Material UI | RunDOM    | 430    | 5.16      | 0.19        | 0.89  | 1.52   | 9.80       | 17.04       | 19.33   | 331.7     |

## Material UI memory

On the three qualified full-suite pairs with all 430 cases, median peak RSS was 331.7 MiB on RunDOM and 313.2 MiB on jsdom. Median peak physical footprint reported by the outer macOS timer was 290.6 MiB and 288.0 MiB respectively. The three RunDOM resident peaks ranged from 312.7 to 386.3 MiB. The 386.3 MiB run had a physical footprint peak of 286.6 MiB. The two maxima measure different things and may occur in different processes or phases.

The build before the viewport guard correction measured a 3.1 MiB resident gap in its own full replay. The corrected build finished the 430-case selection in 19.33 s against jsdom's 25.12 s. The final uninstrumented replay retains an 18.5 MiB resident gap.

[Full timings before the guard correction](../.cache/ancestor-replay-39BY47/vitest/full-results.json) · [Final raw timing logs](../.cache/native-viewport-replay-FUOpCn/full.log)

A separate three-round, rotated process-sampling replay ran all 430 cases on stock jsdom, the frozen baseline RunDOM, and the final RunDOM build. The Select worker accounted for the maximum RSS. Median runner RSS was 302.1 MiB on jsdom, 308.2 MiB on baseline RunDOM, and 298.8 MiB on final RunDOM.

| Build           | Peak worker RSS | Peak worker physical footprint | Peak worker V8 heap used |
| --------------- | --------------: | -----------------------------: | -----------------------: |
| Baseline RunDOM |       346.2 MiB |                      347.1 MiB |                202.5 MiB |
| Final RunDOM    |       357.9 MiB |                      369.9 MiB |                234.6 MiB |
| Stock jsdom     |       319.7 MiB |                      388.6 MiB |                243.1 MiB |

The final build still peaked higher in resident memory than stock jsdom while using less peak physical footprint and V8 heap in this sampled replay. Relative to baseline RunDOM, the final worker's sampled heap and footprint peaks were higher. The Select allocation sample also did not reproduce an allocation reduction for the focus stack. It attributed 147.8 MiB cumulatively to focus in the final build and 136.4 MiB in the baseline. The stack counters directly verify that repeat style requests were avoided. The memory measurements leave the full-suite resident gap open.

[Qualified worker samples](../.cache/ancestor-cascade-FvAE6A/native-final/whole-memory-results.json) · [Peak event data](../.cache/ancestor-cascade-FvAE6A/qualified-worker-peak-events.json) · [Final allocation profiles summarized by stack](../.cache/ancestor-cascade-FvAE6A/qualified-select-allocation-summary.txt)

Two additional rotated pairs isolated all 169 passing Select cases and changed only the native viewport guard. The active focus path reduced median worker RSS from 388.8 to 359.1 MiB, physical footprint from 394.3 to 349.9 MiB, and peak V8 heap used from 245.8 to 203.6 MiB. Stock jsdom used 377.2 MiB RSS in the same Select replay. The active path had lower RSS than the guarded-off build in both pairs. The isolated worker improvement and the remaining full-suite resident gap are measured at different workload boundaries.

[Select guard comparison](../.cache/ancestor-cascade-FvAE6A/select-guard-pair/whole-memory-results.json)

A separate prototype removed temporary arrays from stylesheet source collection and walked the same ordered raw elements directly. It lowered Select-only peak RSS in both trials. On the full 430-case selection, RSS moved from 377.4 to 350.0 MiB in one pair and from 321.4 to 378.6 MiB in the other. The full-suite median rose, so the prototype was discarded.

[Select-only collection trials](../.cache/ancestor-cascade-FvAE6A/collect-check/whole-memory-results.json) · [Full selection collection trials](../.cache/ancestor-cascade-FvAE6A/collect-full/collect-full-results.json)

## Retained memory and theme throughput

The interleaved theme probe used 16 Windows with 384 custom tokens per theme and 96 checked style reads per Window. Across five alternating fresh pairs, median style work dropped from 945 ms to 318 ms. Peak RSS dropped from 329.7 MiB to 193.5 MiB. Heap held by the live Windows after forced GC was 43.25 MiB before and 41.14 MiB after. With all Window references released, it was 26.24 MiB and 26.20 MiB.

The separate 32-window styled lifecycle measured 62.59 → 62.54 MiB of live heap, 31.57 → 31.61 MiB after release, and 202.84 → 201.75 MiB peak RSS. Both probes enforce identical checked style values. Their forced-GC readings are separate from the real-project benchmarks.

[Interleaved theme trials](../.cache/ancestor-cascade-FvAE6A/theme-memory.jsonl) · [Styled Window lifecycle trials](../.cache/ancestor-cascade-FvAE6A/native-viewport-memory/summary.json)

## Compatibility

The repository check and all 1,591 facade tests passed with both parser selections. The unchanged upstream jsdom API suite passed all 634 tests with each parser. The packed alias ran through all four Vitest pools, with 11 tests per pool on TypeScript and 12 on Rust. The comparison against the frozen RunDOM baseline preserved all 13,347 named WPT assertions and all fixture and harness statuses across 756 CSS and selector fixtures and 17 mutation fixtures per parser. These totals include existing failures and describe the selected WPT coverage.

An additional 126 direct snapshot comparisons matched the baseline across interleaved token groups, CSS-wide keyword overrides, varying ancestor depth, and mutation after snapshot creation. The final Ant Design and Material UI screens matched every named jsdom outcome, including skipped cases. The new local examples cover interleaved enumeration, a blur callback hiding an ancestor, and a replaced viewport getter.

[Compiled and tested artifact](../.cache/ancestor-cascade-FvAE6A/native-viewport.json) · [Compatibility outcome comparison](../.cache/ancestor-cascade-FvAE6A/native-wpt-diff.json) · [Packed TypeScript](../.cache/ancestor-cascade-FvAE6A/packed-typescript.log) · [Packed Rust](../.cache/ancestor-cascade-FvAE6A/packed-rust.log)
