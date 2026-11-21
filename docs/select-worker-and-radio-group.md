# Select worker residency and Radio Group cascade

The two workloads use the previously qualified installed upstream tests. The frozen starting artifact is the build from the [ancestor cascade and focus report](ancestor-cascade-and-focus-memory.md).

## Select worker

The native memory map captures show that the largest changing region is the private anonymous mapping tagged 255 on this host. Its size follows V8's reported physical heap. In the Select worker, the captured mapping was 192.4 MiB on RunDOM and 223.4 MiB in the higher of the two jsdom samples. The system read-only code mapping and system malloc were smaller sources of variation. The full diagnostic run reported 265.3 MiB peak RSS on RunDOM and 295.8 MiB on jsdom, reversing the preceding run's 18.5 MiB gap. The mapping snapshots are asynchronous and the diagnostic can perturb scheduling. These observations locate the largest varying memory region and leave the exact cause of the prior per-run difference unresolved.

The earlier allocation profiles placed about 116–131 MiB of cumulative allocation under stylesheet collection in isolated Select runs. Stylesheet discovery previously used the same revision that changed when selectors, form data, or named lookups changed. The new membership revision allows those edits to keep live stylesheet records. Selector matching retains its existing revision. Style element type and topology changes still invalidate discovery.

In five alternating fresh-process pairs, 500 computed-style reads after alternating class edits took a median of 89.57 ms of thread CPU before and 53.63 ms after. The fixture had 49 stylesheet elements and checked the color after every mutation. Peak RSS changed from 128.03 to 123.06 MiB.

Two sampled comparisons held the exact 430 named Material UI passes and 39 skips fixed. The discovery-only build moved peak RSS from 282.5 to 263.1 MiB in the first pair and from 286.6 to 262.7 MiB in the second. Peak worker footprint rose from 318.6 to 349.6 MiB in the first pair and fell from 352.1 to 305.4 MiB in the second. The resident-memory reduction reproduced in this diagnostic. The footprint result depends on the run.

[Discovery-only worker samples](../.cache/select-residency-mKvR1h/discovery/whole-memory-results.json)

[Native probe run](../.cache/select-residency-mKvR1h/region.log) · [Select native map on RunDOM](../.cache/select-residency-mKvR1h/vmmap-rundom/20526-1.vmmap) · [Select native map on jsdom](../.cache/select-residency-mKvR1h/vmmap-jsdom/19345-2.vmmap) · [Paired hotspot measurements](../.cache/select-residency-mKvR1h/hot-path.jsonl)

A matched Select trace recorded 1,734 stylesheet discovery reads on both builds, with 274 rescans before and 235 after. The 168 common passing assertions match by name and status. The two earlier instrumentation attempts hit the same drag-delay assertion and were excluded from the trace comparison. Both full uninstrumented screens passed it.

[Baseline Select counters](../.cache/select-residency-mKvR1h/baseline-select-matched-trace.json) · [Combined Select counters](../.cache/select-residency-mKvR1h/combined-select-matched-retry.json)

## Radio Group

The preceding profile found recurring stylesheet rule construction alongside cascade work. RunDOM now prepares selector results and declaration factories once when the existing syntax cache finds a recurring flat sheet. CSSOM rule identity and mutation stay local to each attachment. Sources with nested rules or namespace context continue through the complete parser.

Five alternating fresh-process pairs of 500 attach, read, and remove cycles verified two rules for each attached sheet. Median thread CPU went from 32.18 to 23.68 ms and peak RSS went from 100.20 to 99.09 MiB. The fixture uses the large authored token block shape seen in Radio Group.

[Flat-sheet hotspot measurements](../.cache/select-residency-mKvR1h/hot-path.jsonl)

The final four-case Radio Group rotation measured median test bodies of 1.959 s with the discovery-only build, 1.727 s with both changes, and 1.535 s on the project's stock jsdom. The two RunDOM builds ran the same assertions. The combined build reduced test-body time by 11.8% and remained 12.5% slower than jsdom on that measure. Over the same rounds, median total process time was 15.21 s, 17.76 s, and 16.92 s respectively. Whole-process CPU did not improve in those rounds.

The separate CPU sampling run attributed 528 baseline samples and 676 combined samples to stylesheet construction. It also sampled more cascade work on the combined build, which makes this one profile unsuitable for inferring a reduction in application CPU. The controlled attachment workload isolates the direct parsing change.

[Radio Group paired tests and profiles](../.cache/select-residency-mKvR1h/radio/cache-pair-results.json) · [CPU stack summary](../.cache/select-residency-mKvR1h/radio/profile-summary.json)

The matched four-case trace counted 1,290 parser rule visits on the baseline and 1,281 on the combined build. Nine rules used prepared factories. That limited reuse does not explain the full test-body timing difference.

[Baseline Radio Group counters](../.cache/select-residency-mKvR1h/baseline-radio-trace.json) · [Combined Radio Group counters](../.cache/select-residency-mKvR1h/combined-radio-trace.json)

## Four-provider replay

Node 24.20.0 ran on an Apple M4 on a shared macOS host. Ant Design uses jsdom 31.0.0 and Material UI uses jsdom 30.1.3. The other providers were the frozen RunDOM build, Happy DOM 21.0.4, and TurboDOM 0.7.1. The full screens on RunDOM and stock jsdom matched every named case and its status in both projects.

## Vitest coverage

Cells show passed / failed / skipped or todo and the full-screen process time. A runner failure may terminate collection. A dagger marks a nonzero runner exit with no individual failed test. Full-screen times reflect the work each provider completed.

| Selection   | RunDOM                  | jsdom                   | Happy DOM              | TurboDOM                 |
| ----------- | ----------------------- | ----------------------- | ---------------------- | ------------------------ |
| Ant Design  | 133 / 0 / 0 (47.715 s)  | 133 / 0 / 0 (68.953 s)  | 128 / 5 / 0 (56.330 s) | 121 / 12 / 0 (40.771 s)  |
| Material UI | 430 / 0 / 39 (32.230 s) | 430 / 0 / 39 (70.938 s) | 454 / 8 / 7 (28.265 s) | 181 / 281 / 7 (17.520 s) |

[Vitest screens and trial results](../.cache/select-residency-replay-41SxfL/vitest/results.json) · [Verified provider paths, versions, and named screen outcomes](../.cache/select-residency-replay-41SxfL/verified-evidence.json)

## Matched Vitest performance

Each cell gives median process seconds / summed assertion duration in milliseconds / peak RSS in MiB. A row uses exactly the same passing case identities on every displayed provider. Timed attempts with incomplete work or differing case identities remain in the raw results.

| Selection   | Passed per trial | RunDOM                 | jsdom                 | Happy DOM             | TurboDOM              |
| ----------- | ---------------- | ---------------------- | --------------------- | --------------------- | --------------------- |
| Ant Design  | 116              | 38.771 / 14146 / 561.8 | 46.427 / 9843 / 587.9 | 39.008 / 9218 / 538.6 | 33.974 / 9854 / 582.3 |
| Material UI | 161              | 14.449 / 4838 / 224.6  | 15.526 / 5757 / 288.5 | 12.401 / 3310 / 234.6 | —                     |
| Material UI | 118              | 11.117 / 4051 / 242.3  | 12.071 / 3596 / 293.9 | 12.913 / 2408 / 236.9 | 10.088 / 1624 / 265.5 |

| Selection   | Cases attempted | Incomplete timing series |
| ----------- | --------------- | ------------------------ |
| Material UI | 161             | TurboDOM                 |

Elapsed ranges across the three verified trials in each displayed series, in seconds.

| Selection   | Cases | RunDOM        | jsdom         | Happy DOM     | TurboDOM      |
| ----------- | ----- | ------------- | ------------- | ------------- | ------------- |
| Ant Design  | 116   | 36.486–46.521 | 32.927–49.155 | 36.359–49.646 | 28.767–50.541 |
| Material UI | 161   | 9.020–14.595  | 15.316–16.280 | 12.386–16.571 | —             |
| Material UI | 118   | 9.704–15.865  | 10.872–12.434 | 11.154–13.179 | 7.998–10.396  |

Median user plus system CPU from the runner’s operating-system timing log, in seconds.

| Selection   | Cases | RunDOM | jsdom | Happy DOM | TurboDOM |
| ----------- | ----- | ------ | ----- | --------- | -------- |
| Ant Design  | 116   | 42.69  | 47.68 | 45.31     | 37.61    |
| Material UI | 161   | 15.54  | 19.82 | 14.79     | —        |
| Material UI | 118   | 12.61  | 15.38 | 12.06     | 10.30    |

## Previously selected full Vitest workloads

These repeated pairs require all named statuses, including skips, to match each repository’s jsdom screen.

| Selection   | Passed per trial | RunDOM                 | jsdom                  | Wall ranges in s (RunDOM / jsdom) | Valid pairs |
| ----------- | ---------------- | ---------------------- | ---------------------- | --------------------------------- | ----------- |
| Ant Design  | 133              | 31.428 / 11457 / 598.0 | 31.429 / 9454 / 641.2  | 25.890–32.806 / 29.079–35.608     | 3           |
| Material UI | 430              | 30.778 / 24018 / 317.6 | 34.168 / 32156 / 282.4 | 25.848–33.208 / 23.969–39.202     | 3           |

[Full selection timings and attempt failures](../.cache/select-residency-replay-41SxfL/vitest/full-results.json)

### Runner phases

Times are in seconds. Vitest rounds its reported phase shares to whole percentages. Test bodies use summed assertion durations from the JSON report, and process time comes from the outer runner.

| Selection   | Provider  | Passed | Transform | Environment | Setup | Import | Test phase | Test bodies | Process | RSS (MiB) |
| ----------- | --------- | ------ | --------- | ----------- | ----- | ------ | ---------- | ----------- | ------- | --------- |
| Ant Design  | jsdom     | 116    | 21.13     | 8.48        | 3.96  | 1.89   | 5.18       | 9.84        | 46.43   | 587.9     |
| Ant Design  | RunDOM    | 116    | 19.89     | 0.75        | 4.88  | 2.28   | 7.68       | 14.15       | 38.77   | 561.8     |
| Ant Design  | Happy DOM | 116    | 23.72     | 4.14        | 3.86  | 1.95   | 4.91       | 9.22        | 39.01   | 538.6     |
| Ant Design  | TurboDOM  | 116    | 20.22     | 0.00        | 4.30  | 2.97   | 5.62       | 9.85        | 33.97   | 582.3     |
| Material UI | jsdom     | 161    | 5.96      | 2.77        | 0.55  | 1.25   | 3.29       | 5.76        | 15.53   | 288.5     |
| Material UI | RunDOM    | 161    | 6.94      | 0.24        | 0.75  | 1.32   | 2.63       | 4.84        | 14.45   | 224.6     |
| Material UI | Happy DOM | 161    | 5.87      | 1.15        | 0.63  | 1.28   | 1.82       | 3.31        | 12.40   | 234.6     |
| Material UI | jsdom     | 118    | 5.48      | 1.58        | 0.31  | 0.74   | 2.05       | 3.60        | 12.07   | 293.9     |
| Material UI | RunDOM    | 118    | 5.07      | 0.14        | 0.56  | 0.92   | 2.39       | 4.05        | 11.12   | 242.3     |
| Material UI | Happy DOM | 118    | 6.43      | 0.68        | 0.38  | 0.96   | 1.39       | 2.41        | 12.91   | 236.9     |
| Material UI | TurboDOM  | 118    | 5.50      | 0.00        | 0.39  | 0.86   | 0.94       | 1.62        | 10.09   | 265.5     |
| Ant Design  | jsdom     | 133    | 15.85     | 5.21        | 3.13  | 1.13   | 4.87       | 9.45        | 31.43   | 641.2     |
| Ant Design  | RunDOM    | 133    | 17.43     | 0.91        | 3.35  | 2.13   | 6.09       | 11.46       | 31.43   | 598.0     |
| Material UI | jsdom     | 430    | 8.67      | 3.85        | 0.66  | 2.25   | 16.70      | 32.16       | 34.17   | 282.4     |
| Material UI | RunDOM    | 430    | 9.33      | 0.29        | 1.44  | 2.28   | 13.41      | 24.02       | 30.78   | 317.6     |

In the three full Material UI pairs, median process time was 30.78 s on RunDOM and 34.17 s on jsdom. Peak RSS medians were 317.6 MiB and 282.4 MiB, leaving a 35.2 MiB gap in this replay. The outer macOS time tool reported median peak physical footprint of 280.8 MiB and 285.0 MiB respectively. The resident peaks crossed across pairs. These figures describe the final build and each project's stock jsdom in the same replay.

[Full-scope raw logs](../.cache/select-residency-replay-41SxfL/full.log)

Two sampled full-suite pairs compared the original and combined RunDOM artifacts directly. Process RSS went from 322.4 to 307.0 MiB and from 307.3 to 310.3 MiB. The Select worker's peak physical footprint fell in both pairs, from 379.8 to 364.0 MiB and from 380.2 to 362.1 MiB. Its median peak V8 heap use fell from 237.3 to 226.7 MiB. The combined build improved the worker's charged footprint and live-heap peak in these samples. Resident memory remains variable, and the stock-jsdom full-suite RSS gap remains open.

[Final paired worker samples](../.cache/select-residency-mKvR1h/combined-memory/whole-memory-results.json) · [Worker peak events and V8 heap spaces](../.cache/select-residency-mKvR1h/paired-worker-peaks.json)

## Compatibility

The build, type, lint, and format checks passed. The local suites passed all 1,593 facade tests with each parser at a 30-second runner timeout. The initial default-timeout run had five timeouts under load. Both parsers passed all 634 upstream jsdom API tests. The packed alias passed all four Vitest pools, with 11 cases per pool on TypeScript and 12 on Rust. Rust's vmThreads stress test passed on retry with a 30-second timeout.

The selected WPT replay preserved all 13,347 named assertion outcomes and the corresponding fixture and harness outcomes. The selection covers 756 CSS and selector fixtures and 17 mutation fixtures per parser, including the existing failing outcomes.

[Frozen artifact](../.cache/select-residency-mKvR1h/combined.json) · [Named WPT comparison](../.cache/select-residency-mKvR1h/combined-wpt-diff.json) · [Packed Rust vmThreads retry](../.cache/select-residency-mKvR1h/packed-rust-vmthreads-retry.log)
