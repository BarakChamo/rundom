# Computed-style resolution on demand

A computed-style read captures selector matches, cascade winners, inherited inputs, foreground and font context, and any viewport and base URL already read by the cascade. An independent accessor can resolve its own property from that capture. Enumeration and properties that interact with shorthands resolve the complete declaration from the same capture. This keeps snapshots valid when the tree, style rules, focus, viewport or base URL later changes. A target uses the eager path when an uncaptured environment read might still be needed.

The first prototype removed target-frame reuse. Some Material UI runs then used more V8 heap and a higher physical footprint even when their RSS was lower. The final version gives deferred targets the same bounded frame cache as completed targets. It charges their captured winners and inherited inputs to the budget. A target drops its cached recipe when the declaration materializes, and the public view releases the recipe after replacing it with the resolved values.

The traced Ant Design Radio Group selection executes 112 computed-style calls. The retained implementation published 101 deferred views from 95 captures. Those views made 90 individual resolutions and one complete materialization. The other full resolutions in the trace include the ancestors needed to establish inheritance.

The final Material UI allocation profile covered the full five-file selection. Cumulative sampled allocation under computed style fell from 330 to 236 MiB and under focus from 255 to 181 MiB. The sampler includes collected objects. Peak resident memory and physical footprint are measured separately.

[Previous campaign](focus-cascade-and-material-ui-rss.md) · [Allocation profiles summarized by stack](../.cache/ondemand-style-A8TQPI/allocation-summary.txt) · [Ant Design trace](../.cache/ondemand-style-A8TQPI/cache-trace.tsv)

## Material UI resident-memory investigation

All three artifacts used the same full 430 named Material UI cases. The table gives medians of three fresh, rotated, qualified runs. A native sampler recorded resident size and physical footprint for each Vitest worker and the main runner. A separate worker probe sampled V8 heap. One attempt on the oldest artifact missed two cases and was excluded before computing medians.

| RunDOM artifact                              | Peak process RSS, MiB | Peak worker footprint, MiB | Peak V8 heap used, MiB |
| -------------------------------------------- | --------------------: | -------------------------: | ---------------------: |
| Before the previous focus and CSS changes    |                 408.5 |                      400.3 |                  251.1 |
| Immediate baseline with the previous changes |                 343.4 |                      364.2 |                  212.5 |
| Deferred snapshots with bounded reuse        |                 356.7 |                      365.2 |                  213.0 |

The previous same-artifact RSS increase from 352 to 384 MiB did not reproduce. This replay placed the worker at the peak. The new build's resident peak was 13.3 MiB above the immediate baseline while physical footprint and V8 heap were within 1 MiB. The resident ranges overlapped. The allocation profiles identify the work removed by the implementation. The earlier runs recorded RSS alone, leaving the cause of that individual peak difference unverified.

Five pairs of the 32-window lifecycle probe measured 62.39 → 62.49 MiB live heap, 31.52 → 31.57 MiB released heap after forced GC and 201.05 → 200.72 MiB peak RSS.

[Three-artifact memory results](../.cache/ondemand-style-A8TQPI/whole-memory-summary.json) · [Process-level observations](../.cache/ondemand-style-A8TQPI/timed/whole-memory-results.json) · [Styled-window lifecycle](../.cache/ondemand-style-A8TQPI/retained-memory/summary.json)

## Compatibility

Both parser selections passed the 1,588 facade cases and 634 reference API cases. The 756 CSS and selector fixtures and 17 mutation fixtures reproduced all 13,347 named WPT assertion outcomes per parser, including the prior failures. Tests read an old snapshot for the first time after CSSOM and viewport changes, after detachment and window shutdown, and after a document base URL change.

[Selected WPT comparison](../.cache/ondemand-style-A8TQPI/cache-wpt-diff.json) · [Frozen runtime](../.cache/ondemand-style-A8TQPI/cache.json)

## Four-provider replay

The final RunDOM build reproduced the full Ant Design and Material UI screen outcomes. Timed rows use fresh processes and matching named cases. The host was shared. The four focused Radio Group cases ran in a separate three-trial rotation. Median bodies took 1317 ms on prior RunDOM, 1175 ms with deferred snapshots, and 465 ms on stock jsdom.

[Radio Group comparison](../.cache/ondemand-style-A8TQPI/timed/cache-pair-results.json)

## Vitest coverage

Cells show passed / failed / skipped or todo and the full-screen process time. A runner failure may terminate collection. A dagger marks a nonzero runner exit with no individual failed test. Full-screen times reflect the work each provider completed.

| Selection   | RunDOM                   | jsdom                   | Happy DOM              | TurboDOM                 |
| ----------- | ------------------------ | ----------------------- | ---------------------- | ------------------------ |
| Ant Design  | 133 / 0 / 0 (23.587 s)   | 133 / 0 / 0 (96.344 s)  | 128 / 5 / 0 (23.129 s) | 121 / 12 / 0 (24.656 s)  |
| Material UI | 430 / 0 / 39 (130.313 s) | 430 / 0 / 39 (91.239 s) | 454 / 8 / 7 (53.642 s) | 181 / 281 / 7 (54.852 s) |

[Vitest screens and trial results](../.cache/ondemand-replay-zwjXCs/vitest/results.json) · [Verified provider paths, versions, and named screen outcomes](../.cache/ondemand-replay-zwjXCs/verified-evidence.json)

## Matched Vitest performance

Each cell gives median process seconds / summed assertion duration in milliseconds / peak RSS in MiB. A row uses exactly the same passing case identities on every displayed provider. Timed attempts with incomplete work or differing case identities remain in the raw results.

| Selection   | Passed per trial | RunDOM                | jsdom                 | Happy DOM             | TurboDOM              |
| ----------- | ---------------- | --------------------- | --------------------- | --------------------- | --------------------- |
| Ant Design  | 116              | 18.909 / 3915 / 612.1 | 28.457 / 4677 / 598.7 | 14.567 / 2396 / 586.5 | 10.525 / 1806 / 563.0 |
| Material UI | 161              | 18.393 / 4622 / 250.6 | 17.849 / 4103 / 301.4 | 11.140 / 2548 / 283.3 | —                     |
| Material UI | 118              | 11.309 / 2462 / 231.8 | 13.587 / 3631 / 284.5 | 10.690 / 1937 / 247.0 | 8.401 / 1366 / 278.9  |

| Selection   | Cases attempted | Incomplete timing series |
| ----------- | --------------- | ------------------------ |
| Material UI | 161             | TurboDOM                 |

Elapsed ranges across the three verified trials in each displayed series, in seconds.

| Selection   | Cases | RunDOM        | jsdom         | Happy DOM     | TurboDOM     |
| ----------- | ----- | ------------- | ------------- | ------------- | ------------ |
| Ant Design  | 116   | 12.805–24.170 | 16.137–43.618 | 14.245–18.308 | 9.263–20.748 |
| Material UI | 161   | 5.220–31.035  | 6.834–44.779  | 9.199–29.963  | —            |
| Material UI | 118   | 10.689–17.111 | 7.508–15.247  | 7.824–18.591  | 8.265–12.136 |

Median user plus system CPU from the runner’s operating-system timing log, in seconds.

| Selection   | Cases | RunDOM | jsdom | Happy DOM | TurboDOM |
| ----------- | ----- | ------ | ----- | --------- | -------- |
| Ant Design  | 116   | 23.31  | 25.28 | 19.89     | 15.83    |
| Material UI | 161   | 14.90  | 16.41 | 11.25     | —        |
| Material UI | 118   | 10.96  | 13.44 | 10.67     | 9.15     |

## Full selections against stock jsdom

These repeated pairs require all named statuses, including skips, to match each repository’s jsdom screen.

| Selection   | Passed per trial | RunDOM                 | jsdom                  | Wall ranges in s (RunDOM / jsdom) | Valid pairs |
| ----------- | ---------------- | ---------------------- | ---------------------- | --------------------------------- | ----------- |
| Ant Design  | 133              | 26.847 / 6007 / 610.2  | 34.199 / 5894 / 546.4  | 21.228–27.251 / 33.330–38.538     | 3           |
| Material UI | 430              | 27.560 / 15583 / 355.4 | 33.667 / 17133 / 334.5 | 26.673–30.718 / 32.124–34.869     | 3           |

[Full selection timings and attempt failures](../.cache/ondemand-replay-zwjXCs/vitest/full-results.json)
