# Ant Design computed style and Material UI peak RSS

The baseline is the frozen RunDOM artifact from the [previous four-provider replay](cascade-real-project-benchmarks.md). These experiments use the same installed upstream checkouts, test selections, and stock jsdom versions. Allocations, sampled RSS, and uninstrumented timings were collected in distinct processes.

## Ant Design

Testing Library's role checks account for almost all computed-style samples in the four Radio Group and Form Item cases. These checks read a target's visibility and then read display on the target and its ancestors. A trace of 112 reads found 93 target rebuilds. On 63 reads the same element already had a completed ancestor frame eligible for reuse. A separate cost came from copying roughly 400 inherited custom properties in a frame even when most values came from the same theme. The pinned Ant Design jsdom returns an owner-backed declaration and resolves individual properties as getters ask for them. RunDOM resolves a snapshot up front so an earlier declaration retains its values across later DOM and CSSOM edits.

- Large ordered blocks of already-computed inherited custom properties now share their values and names. Computed-style reflection uses the correct index of the block, and one cache entry charge covers the shared storage. Local custom declarations still participate in the complete cascade. Old public snapshots retain their values through mutations.
- A completed style can retain a dependency on the focused element and pointer or keyboard modality. This covers selectors such as `:has(button:focus-visible)` with otherwise tree-dependent matching. Other live states still use fresh matching.
- A certified ancestor frame can supply a public computed-style snapshot after its foreground is finalized. Element-relative SVG fill and stroke continue through the complete target computation.

## Material UI

The allocation profile of the 169 passing Select tests found **80.8 MiB** of sampled allocation in document traversal under stylesheet insertion's base-URL lookup. Every inline sheet looked up the document base before checking whether it could reuse its existing record or whether it had a relative import. Material UI's Emotion styles repeatedly triggered this work during DOM mutation.

Inline styles without imports now skip that lookup and the unused import cycle set. An attached inline sheet that contains a parsed import still captures the base before reporting parse errors, and linked sheets retain their resource URL. The Select profile after this change recorded **zero sampled allocations** on the document traversal path under stylesheet insertion. Total sampled allocations attributed to `applySheet` fell from 229.8 to 99.2 MiB. The allocation sampler records cumulative allocation, including collected objects. Those numbers do not represent retained heap or peak RSS.

A separate full-suite process sampler recorded 420.4 MiB for the original RunDOM worker and 359.8 MiB for the worker after the inline-sheet fix and cascade changes. The stock jsdom worker peaked at 409.6 MiB in the same diagnostic. Because process RSS varied on the shared host, the uninstrumented replay and the five-pair forced-GC tests also qualify the changes.

[Baseline allocation paths](../.cache/focus-rss-D2zsOS/mui-allocations-summary.txt) · [Updated allocation paths](../.cache/focus-rss-D2zsOS/final-allocation-paths.txt)

## Selecting the ancestor snapshot representation

The first ancestor-reuse implementation copied a declaration to add the foreground. Its trace served 57 of 112 reads from completed ancestor frames, and rebuilt 141 frames versus 207 before. In the four Ant Design cases, it cut median bodies from 775 to 621 ms. Its full Material UI pairs had essentially flat peak RSS. The three isolated Select runs exposed a 393 MiB worker peak median with the copying candidate and a 321 MiB median with the baseline.

The retained implementation publishes the foreground and its final index through an immutable view of the completed declaration. It shares the native value maps and keeps ancestor and public semantics separate at the point of access. A foreground requiring additional normalization, or an element-relative SVG paint, uses the complete target computation.

[Copying variant's Select memory samples](../.cache/focus-rss-D2zsOS/timed/select-memory-results.json)

## Final implementation measurements

Three diagnostic trials on the four Ant Design cases measured thread CPU inside all 112 public computed-style calls. The median went from 408 ms to 346 ms. The pinned jsdom spent about 3 ms in the public call itself and does its property resolution in the subsequent getters. The jsdom call measurement excludes those getters. End-to-end test bodies were noisy. The uninstrumented Radio Group median was 1,199 ms before, 1,494 ms after and 931 ms for jsdom. Whole-process medians were 10.26 s, 9.19 s and 10.36 s respectively. The direct CPU reduction has not yet translated into a consistent real-world body-time win.

The conditional Testing Library workload used five fresh pairs. It verified the same radio counts after each visibility change. Median CPU fell from 2,005 to 267 ms, peak RSS from 431 to 171 MiB, and live forced-GC heap from 34.65 to 32.29 MiB. The five-pair 32-window memory lab held live heap at 62.33 → 62.39 MiB and released heap at 31.48 → 31.52 MiB. Its median RSS went from 183.39 to 186.66 MiB.

| Material UI Select worker, 169 cases | Peak RSS, MiB | Peak V8 heap used, MiB | Peak committed physical heap, MiB |
| ------------------------------------ | ------------: | ---------------------: | --------------------------------: |
| Previous RunDOM                      |           343 |                    214 |                               289 |
| Read-only view                       |           356 |                    210 |                               285 |
| Stock jsdom                          |           337 |                    243 |                               317 |

The isolated Select row gives the median of three fresh instrumented processes. Final RunDOM worker peak RSS ranged from 319 to 365 MiB. The prior RunDOM range was 282–370 MiB. The 13 MiB median increase coexisted with a 4 MiB decrease in each of the sampled V8 measures.

[Direct computed-style CPU](../.cache/focus-rss-D2zsOS/timed/engine-confirm-results.json) · [Ant Design end-to-end trials](../.cache/focus-rss-D2zsOS/timed/overlay-pair-results.json) · [Select worker samples](../.cache/focus-rss-D2zsOS/timed/select-overlay-results.json) · [Styled-window lifecycle](../.cache/focus-rss-D2zsOS/overlay-memory/summary.json)

## Compatibility

The repository check passed. Both parsers passed all 1,586 facade tests and all 634 reference API tests. The WPT replay covered 756 CSS and selector fixtures and 17 mutation fixtures and matched all 13,347 named assertion outcomes per parser from the previous build, including the existing failures. The added facade regressions exercise inherited custom-property order and snapshot values, focus modality on a relational selector, and foreground and SVG paint after ancestor reuse.

[Frozen runtime](../.cache/focus-rss-D2zsOS/overlay.json) · [Selected WPT result comparison](../.cache/focus-rss-D2zsOS/overlay-wpt-diff.json)

## Four-provider replay

The final frozen build reproduced the prior RunDOM outcomes on both full screens. Timing tables report medians from three fresh serial trials that passed the same named cases. Happy DOM and TurboDOM use the installed cohort versions. The stock jsdom is the dependency installed in each upstream checkout. The host was shared.

The full Material UI replay measured 329.2 MiB peak RSS on RunDOM and 356.2 MiB on jsdom. In the separate three-pair RunDOM-only confirmation with all 430 cases passing, median peak RSS was 351.6 MiB before and 384.0 MiB after. [RunDOM before-and-after pairs](../.cache/focus-rss-D2zsOS/timed/mui-overlay-results.json)

## Vitest coverage

Cells show passed / failed / skipped or todo and the full-screen process time. A runner failure may terminate collection. A dagger marks a nonzero runner exit with no individual failed test. Full-screen times reflect the work each provider completed.

| Selection   | RunDOM                  | jsdom                   | Happy DOM              | TurboDOM                 |
| ----------- | ----------------------- | ----------------------- | ---------------------- | ------------------------ |
| Ant Design  | 133 / 0 / 0 (35.063 s)  | 133 / 0 / 0 (51.719 s)  | 128 / 5 / 0 (40.089 s) | 121 / 12 / 0 (23.506 s)  |
| Material UI | 430 / 0 / 39 (31.520 s) | 430 / 0 / 39 (47.453 s) | 454 / 8 / 7 (28.503 s) | 181 / 281 / 7 (19.659 s) |

[Vitest screens and trial results](../.cache/focus-rss-overlay-LilO4J/vitest/results.json) · [Verified provider paths, versions, and named screen outcomes](../.cache/focus-rss-overlay-LilO4J/verified-evidence.json)

## Matched Vitest performance

Each cell gives median process seconds / summed assertion duration in milliseconds / peak RSS in MiB. A row uses exactly the same passing case identities on every displayed provider. Timed attempts with incomplete work or differing case identities remain in the raw results.

| Selection   | Passed per trial | RunDOM                | jsdom                 | Happy DOM             | TurboDOM              |
| ----------- | ---------------- | --------------------- | --------------------- | --------------------- | --------------------- |
| Ant Design  | 116              | 21.937 / 5433 / 579.2 | 44.616 / 7604 / 502.2 | 19.538 / 2908 / 565.6 | 18.910 / 3426 / 530.3 |
| Material UI | 161              | 12.045 / 3275 / 287.8 | 14.132 / 2620 / 309.9 | 7.374 / 1594 / 304.1  | —                     |
| Material UI | 118              | 4.563 / 1129 / 311.0  | 10.182 / 2562 / 310.6 | 7.362 / 1222 / 272.0  | 4.866 / 855 / 296.0   |

| Selection   | Cases attempted | Incomplete timing series |
| ----------- | --------------- | ------------------------ |
| Material UI | 161             | TurboDOM                 |

Elapsed ranges across the three verified trials in each displayed series, in seconds.

| Selection   | Cases | RunDOM        | jsdom         | Happy DOM     | TurboDOM      |
| ----------- | ----- | ------------- | ------------- | ------------- | ------------- |
| Ant Design  | 116   | 17.021–48.558 | 40.220–53.703 | 15.336–19.745 | 15.969–21.842 |
| Material UI | 161   | 5.727–13.756  | 6.132–14.536  | 6.306–9.987   | —             |
| Material UI | 118   | 3.567–5.837   | 5.529–12.038  | 6.041–11.832  | 4.423–8.183   |

Median user plus system CPU from the runner’s operating-system timing log, in seconds.

| Selection   | Cases | RunDOM | jsdom | Happy DOM | TurboDOM |
| ----------- | ----- | ------ | ----- | --------- | -------- |
| Ant Design  | 116   | 25.61  | 33.56 | 23.26     | 21.56    |
| Material UI | 161   | 12.24  | 13.74 | 8.24      | —        |
| Material UI | 118   | 6.50   | 11.78 | 8.14      | 6.49     |

## Full selections against stock jsdom

These repeated pairs require all named statuses, including skips, to match each repository’s jsdom screen.

| Selection   | Passed per trial | RunDOM                 | jsdom                  | Wall ranges in s (RunDOM / jsdom) | Valid pairs |
| ----------- | ---------------- | ---------------------- | ---------------------- | --------------------------------- | ----------- |
| Ant Design  | 133              | 13.345 / 3625 / 625.0  | 15.635 / 2921 / 624.8  | 8.257–15.772 / 9.544–16.228       | 3           |
| Material UI | 430              | 23.159 / 13454 / 329.2 | 30.172 / 17041 / 356.2 | 15.974–29.258 / 12.587–35.058     | 3           |

[Full selection timings and attempt failures](../.cache/focus-rss-overlay-LilO4J/vitest/full-results.json)
