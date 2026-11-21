# Stylesheet churn and worker residency

This study uses the same five Material UI files and eight Ant Design files as the previous checkpoint. Select accounts for 169 of the 430 active MUI cases. Ant's four Form Item cases exercise the responsive grid, form theme and radio theme together.

## What drove the previous RSS result

The previous 35.2 MiB was a difference between medians from three uncached runs per provider. In chronological pairs, RunDOM exceeded jsdom by 41.39, 3.72 and 0.08 MiB. The two medians selected different rounds. Repeating the unchanged provider before editing code produced 291.25 MiB for RunDOM and 301.44 MiB for jsdom with all 430 cases passing. The historical workers did not record mapping ownership at their exact peak. A retained allocation of 35.2 MiB cannot be inferred from those runs.

## Costs isolated in the real projects

**Select repeatedly parses the same short styles.** A trace with all 169 active Select cases passing recorded 13,850 calls into the stylesheet parser, 307 distinct sources and only 62,870 UTF-16 units of distinct CSS. Replaying their order through the original 32-entry FIFO resulted in 13,850 misses. A per-Window table now holds weak syntax references for up to 192 short sources. On a successful lookup the existing 32-entry strong cache receives the same source it would have parsed. Rule objects, selector edits and declaration changes stay private to each attachment. A counter replay of the captured stream and 80 warm-up sheets produced 427 parses, 13,424 weak hits and 79 strong hits.

**CSSOM churn left large empty hash tables after Window closure.** A global weak syntax cache and a Window-scoped version both improved replay CPU but increased post-close heap by about 1.1 MiB. Comparing V8 heap snapshots after multiple garbage collections traced 1.25 MiB of additional backing arrays to weak collections. Each style rule registered in five global tables for its kind, owners, group, selector and declaration. V8 could collect the rules while retaining the tables at their high-water capacity. One rule record now holds that state. The final snapshot contained 968,576 fewer bytes of objects than the selector-only build. The lifetime comparison measures incremental retained heap in this replay.

**Ant loads a large responsive grid stylesheet once.** Across the four Form Item cases there were 20 stylesheet parses, 11 distinct texts and 153,314 UTF-16 units of input. One 66,153-unit responsive stylesheet supplied 1,024 simple class selectors per attachment in the replay counter. The previous worker CPU profile attributed 407 of 676 stylesheet construction samples to selector preparation. A separate 1,338 samples fell under computed style. The new parser recognizes unescaped ASCII class and ID selectors and uses the DOM's existing matcher with their CSS specificity. Namespaced, escaped and compound cases still use the existing grammar. This applies to utility stylesheets and CSS-in-JS output across components.

## Controlled measurements

All table entries are medians from alternating fresh Node processes. Grid work uses 20 attachments of the real responsive sheet per process, including a computed style assertion. The Select replay attaches, exposes and removes each sheet in captured order. The unique-input control attaches 600 distinct small sheets. Live and closed Select heap values are incremental over a warmed Window and follow explicit garbage collection.

| Work and comparison                                     | Thread CPU before → after | Peak RSS before → after |                            Heap before → after |
| ------------------------------------------------------- | ------------------------: | ----------------------: | ---------------------------------------------: |
| Responsive grid, original → selector change, five pairs |            1,035 → 722 ms |       244.7 → 195.6 MiB |                         29.27 → 28.54 MiB live |
| Select stream, selector change → final, three pairs     |            1,234 → 752 ms |       180.1 → 169.0 MiB | 10.47 → 10.66 MiB live, 8.09 → 7.23 MiB closed |
| Unique sheets, selector change → final, three pairs     |            53.0 → 54.0 ms |       103.8 → 100.7 MiB |   0.88 → 0.87 MiB live, 0.91 → 0.89 MiB closed |

The weak cache trades a small amount of live Window memory for less parsing. It saved 39% of thread CPU in the recorded Select stream. The unique-input control had a 1 ms median CPU increase over 600 sheets. The grid changed independently through selector preparation, which saved 30% of thread CPU.

A separate trial evaluated weakly caching the expanded entry lists of large private declarations. In the same four passing Form Item cases it reduced large-block reads from 62 to four, saving 22,098 visits to the four 381-property declarations. Both builds still packed custom properties 69 times and examined 25,790 winners. The separate timing comparison without synchronous counter writes was inconclusive under host load, with the four case bodies taking 1.50 s on the final build and 1.98 s on the extra candidate. This candidate was discarded. It addressed entry construction while leaving the larger winner and inheritance work intact.

Two additional same-task stress controls exercised cache admission before the event loop could yield. In two pairs of 8,000 distinct small sheets the final build used 346–348 ms of thread CPU versus 348–372 ms. With 1,800 distinct sheets of 70 declarations each, the final build took 425–431 ms versus 409–411 ms, with peak RSS of 156–157 MiB versus 156–164 MiB. Unique dense input remains a CPU tradeoff.

## Real-project benchmarks

The runs used the installed project versions of jsdom and the frozen packed alternatives, a single worker, disabled file parallelism and disabled Vitest caches. Each result recorded the actual module resolved by the test runner. Wall time includes Vite transformation, test setup and teardown. Body time sums named test durations. Host load varied substantially throughout the study. Instruction counts in the raw logs provide another way to compare work.

### Full upstream selections

Times and memory for RunDOM and jsdom are medians over three runs with identical named outcomes. Happy DOM and TurboDOM each have one full screen. Their failed and skipped cases change the work completed.

| Project     | Provider  | Pass / fail / skip |     Wall |  Bodies |   Max RSS | Peak footprint |
| ----------- | --------- | -----------------: | -------: | ------: | --------: | -------------: |
| Material UI | rundom    |       430 / 0 / 39 |  55.64 s | 28.42 s | 275.4 MiB |      277.2 MiB |
| Material UI | jsdom     |       430 / 0 / 39 | 101.07 s | 45.30 s | 268.3 MiB |      275.0 MiB |
| Material UI | happy-dom |        454 / 8 / 7 |  62.13 s | 28.15 s | 330.0 MiB |      298.8 MiB |
| Material UI | turbo-dom |      181 / 281 / 7 |  32.58 s |  5.06 s | 252.9 MiB |      374.0 MiB |
| Ant Design  | rundom    |        133 / 0 / 0 |  43.28 s | 10.94 s | 408.2 MiB |      587.9 MiB |
| Ant Design  | jsdom     |        133 / 0 / 0 |  55.01 s | 10.85 s | 419.5 MiB |      582.6 MiB |
| Ant Design  | happy-dom |        128 / 5 / 0 |  58.72 s |  8.02 s | 394.1 MiB |      567.1 MiB |
| Ant Design  | turbo-dom |       121 / 12 / 0 |  32.14 s |  5.68 s | 434.5 MiB |      571.7 MiB |

### Same named cases across all four providers

One additional fresh process per provider ran the same 118 Material UI cases or 116 Ant Design cases. All four runs per project must pass the same named assertions to qualify.

| Project     | Provider  | Pass / fail / skip in filtered files |    Wall | Bodies |   Max RSS | Peak footprint |
| ----------- | --------- | -----------------------------------: | ------: | -----: | --------: | -------------: |
| Material UI | rundom    |                         118 / 0 / 47 | 20.98 s | 3.67 s | 210.8 MiB |      268.9 MiB |
| Material UI | jsdom     |                         118 / 0 / 47 | 26.55 s | 4.96 s | 262.0 MiB |      269.3 MiB |
| Material UI | happy-dom |                         118 / 0 / 47 | 20.45 s | 2.47 s | 237.5 MiB |      272.7 MiB |
| Material UI | turbo-dom |                         118 / 0 / 47 | 19.87 s | 2.04 s | 227.3 MiB |      273.1 MiB |
| Ant Design  | rundom    |                         116 / 0 / 17 | 30.75 s | 6.90 s | 528.3 MiB |      570.3 MiB |
| Ant Design  | jsdom     |                         116 / 0 / 17 | 51.54 s | 9.57 s | 439.1 MiB |      589.1 MiB |
| Ant Design  | happy-dom |                         116 / 0 / 17 | 31.81 s | 4.50 s | 577.3 MiB |      570.1 MiB |
| Ant Design  | turbo-dom |                         116 / 0 / 17 | 35.22 s | 5.47 s | 394.2 MiB |      538.1 MiB |

### Reported stages in full-suite runs

Vitest reports rounded phase percentages. These values approximate phase seconds by applying each percentage to its run’s reported duration and taking the median. Test-body totals above use assertion timings directly.

| Project     | Provider  | Transform | Environment | Import | Setup |  Tests |
| ----------- | --------- | --------: | ----------: | -----: | ----: | -----: |
| Material UI | rundom    |    14.8 s |       0.5 s |  5.3 s | 2.6 s | 29.1 s |
| Material UI | jsdom     |    15.7 s |      13.0 s |  7.8 s | 3.3 s | 46.8 s |
| Material UI | happy-dom |    17.0 s |       5.3 s |  4.7 s | 2.3 s | 29.3 s |
| Material UI | turbo-dom |    15.1 s |       1.2 s |  5.8 s | 1.8 s |  6.4 s |
| Ant Design  | rundom    |    21.1 s |       1.3 s |  2.5 s | 7.1 s | 11.3 s |
| Ant Design  | jsdom     |    22.2 s |      11.4 s |  2.7 s | 6.5 s | 11.4 s |
| Ant Design  | happy-dom |    28.8 s |       8.6 s |  2.9 s | 8.6 s |  8.6 s |
| Ant Design  | turbo-dom |    18.5 s |           — |  1.9 s | 4.7 s |  6.3 s |

### Within-suite body times

Each value is the median sum of the named bodies in a file across the three full, matching runs. The four Form Item cases are part of the Radio Group row.

| File                                                  |  RunDOM |   jsdom |
| ----------------------------------------------------- | ------: | ------: |
| packages/mui-material/src/Button/Button.test.js       |  2.35 s |  4.05 s |
| packages/mui-material/src/Checkbox/Checkbox.test.js   |  1.55 s |  3.86 s |
| packages/mui-material/src/Dialog/Dialog.test.js       |  2.14 s |  4.00 s |
| packages/mui-material/src/Select/Select.test.js       | 19.34 s | 28.57 s |
| packages/mui-material/src/TextField/TextField.test.js |  3.03 s |  5.72 s |
| components/alert/**tests**/index.test.tsx             |  2.73 s |  1.77 s |
| components/alert/**tests**/semantic.test.tsx          |  0.52 s |  0.54 s |
| components/checkbox/**tests**/checkbox.test.tsx       |  0.81 s |  0.81 s |
| components/checkbox/**tests**/group.test.tsx          |  2.01 s |  1.85 s |
| components/radio/**tests**/group.test.tsx             |  2.66 s |  2.20 s |
| Four Radio/Form cases                                 |  0.94 s |  0.64 s |
| components/radio/**tests**/radio.test.tsx             |  1.48 s |  1.19 s |
| components/tag/**tests**/semantic.test.tsx            |  0.60 s |  0.72 s |
| components/tag/**tests**/variant.test.tsx             |  0.57 s |  0.91 s |

## What the operating system charged to Select

The three uninstrumented pairs with matching outcomes had differences of -20.2 MiB, +8.6 MiB, +9.4 MiB in process RSS. The medians were 275.4 MiB on RunDOM and 268.3 MiB on jsdom, a 7.1 MiB difference.

A separate diagnostic sampled Mach task_vm_info every 20 ms from an independent native thread in each Node process. Values other than process high-water come from the same instant for the process with the highest sampled RSS. Worker PIDs were matched to the module-resolution log and the Vitest file time range. Select owned the peak in all four RunDOM runs and in the first stock jsdom run. TextField owned the peak in the second passing stock run. Internal and external are the kernel’s two resident categories. Compressed bytes are shown separately. Footprint includes additional charged memory.

| Build / round       | Peak worker       | Process high-water | Sampled RSS | Internal resident | External resident | Compressed | Footprint at sample |
| ------------------- | ----------------- | -----------------: | ----------: | ----------------: | ----------------: | ---------: | ------------------: |
| jsdom / 1           | Select.test.js    |          367.1 MiB |   367.1 MiB |         320.9 MiB |          46.2 MiB |   37.9 MiB |           389.5 MiB |
| Starting RunDOM / 1 | Select.test.js    |          359.0 MiB |   358.8 MiB |         313.1 MiB |          45.7 MiB |   33.5 MiB |           376.1 MiB |
| Final RunDOM / 1    | Select.test.js    |          302.8 MiB |   302.6 MiB |         257.0 MiB |          45.7 MiB |   66.6 MiB |           351.9 MiB |
| Starting RunDOM / 2 | Select.test.js    |          317.9 MiB |   317.8 MiB |         272.1 MiB |          45.7 MiB |   62.0 MiB |           363.4 MiB |
| Final RunDOM / 2    | Select.test.js    |          314.3 MiB |   313.7 MiB |         268.1 MiB |          45.6 MiB |   64.2 MiB |           363.0 MiB |
| jsdom / 3           | TextField.test.js |          302.6 MiB |   302.6 MiB |         256.4 MiB |          46.2 MiB |   13.1 MiB |           292.6 MiB |

External resident pages stayed close to 46 MiB. In the first complete triplet the final build had 56.1 MiB less internal resident memory than starting RunDOM, 33.1 MiB more compressed memory and 24.2 MiB less charged footprint. In the reversed RunDOM pair the internal resident difference narrowed to 4.0 MiB and footprint to 0.4 MiB. The two samples locate the changing region and show how compression changes the visible difference. Sampling alone cannot assign the historical 35.2 MiB to a particular JavaScript object. The forced-GC and heap-snapshot experiments above isolate the part attributable to CSSOM metadata.

## Isolated Radio and Form Item profiles

Three rotated, uninstrumented runs per provider exercised the same four named tests. A second three-round experiment measured worker thread CPU between Vitest’s start and finish for each of those four tests. This includes test hooks and scheduled work on that thread during the test interval. It excludes runner transformation in another process and time spent waiting without consuming CPU.

| Build           | Case-body elapsed | Whole-process elapsed | Case-body thread CPU |
| --------------- | ----------------: | --------------------: | -------------------: |
| jsdom           |           0.866 s |               19.25 s |               542 ms |
| Starting RunDOM |           0.855 s |               16.48 s |               714 ms |
| Final RunDOM    |           1.346 s |               16.93 s |               703 ms |

The isolated elapsed median regressed from 0.855 s to 1.346 s. Thread CPU was 714 ms before and 703 ms after, with overlapping ranges across rounds. Final RunDOM consumed 30% more case-body thread CPU than jsdom. In the full Ant selection these four cases took 0.941 s on final RunDOM and 0.645 s on jsdom. The shorter grid construction path is independently measurable. The real Radio workload still loses to jsdom.

In the successful worker CPU captures, stylesheet construction accounted for 426 active samples before and 320 after. General computed style accounted for 531 before and 645 after. In the final capture, 628 of the 645 computed-style samples were under role or focus checks. Matching and scope traversal appeared in 169 samples and winning-value resolution in 151. Those last two figures are inclusive and can overlap. React rendering accounted for another 855 samples after excluding stacks already assigned to styles, construction or selector queries. The largest remaining DOM category was computing style during accessibility checks, including how ancestor frames merge and repack inherited custom properties. The isolated captures had different total active sample counts, 15,747 and 16,959. Sample counts describe the two traces. The timing table uses independent trials.

A follow-up trace found 62 expansions of a 381-property theme. In all 62, every additional local custom property had a different name from the 381 theme properties. In 45 expansions the inherited block already contained all 381 names. This isolates a broad opportunity to carry an unchanged theme block through the cascade and merge disjoint local properties separately. A production implementation would need to preserve winning values, priority, declaration order and snapshot independence. The rejected entry-cache trial demonstrates why saving lookups alone leaves the expensive work intact.

## Compatibility and scope

Both parser modes passed all 1,595 local facade tests and all 634 pinned upstream jsdom API tests. The packed TypeScript consumer passed 11 tests per Vitest pool and the Rust consumer passed 12 per pool across forks, threads, VM forks and VM threads. The final repository check passed all 15 tasks, including type checking, lint, tests and formatting. The initial default-timeout check during the study timed out in eight fixtures on the shared host. The full facade reruns used a 30-second default test timeout. The upstream API reruns also used 30 seconds.

The selected WPT shards preserved every named assertion, fixture and harness result for both parsers. They covered 13,037 CSS and selector assertions and 310 mutation assertions per parser. The existing 106 CSS fixture failures and one mutation fixture failure remain. Full-project timing comparisons used Vitest’s real upstream assertions with a 30-second default test timeout. The 430 passing Material UI cases refer to Button, Checkbox, Dialog, Select and TextField. Ant’s 133 cases refer to the eight pinned files in the table.

Three additional initial full MUI screen attempts across RunDOM and stock jsdom failed upstream opening-mouseup delay assertions. The pass-matched timing medians include only attempts with identical full named outcomes. All attempts and provider resolutions are retained. The one incomplete stock jsdom native-memory run is excluded from the mapping comparison. The first allocation-sampling experiment added considerable overhead and its stock Select worker was stopped. Its RSS and elapsed times are excluded from the comparison.

## Evidence

The frozen manifests identify the exact production sources. The screen summary includes resolved provider paths, real suite results and retry labels. [Starting build](../.cache/cascade-alloc-WWNmyl/baseline.json) · [Final build](../.cache/cascade-alloc-WWNmyl/records.json) · [Per-provider results](../.cache/cascade-alloc-WWNmyl/qualified/summary.json) · [Per-file timings](../.cache/cascade-alloc-WWNmyl/files-report.json) · [Run-level timings and footprints](../.cache/cascade-alloc-WWNmyl/screen-report.json)

[Native high-water samples](../.cache/cascade-alloc-WWNmyl/peak-summary.json) · [Controlled throughput and memory](../.cache/cascade-alloc-WWNmyl/direct-medians.json) · [Select replay counts](../.cache/cascade-alloc-WWNmyl/stream-counts.json) · [Retained table owners](../.cache/cascade-alloc-WWNmyl/table-owners.txt) · [Final retained table owners](../.cache/cascade-alloc-WWNmyl/records-owners.txt)

[Radio CPU stacks](../.cache/cascade-alloc-WWNmyl/radio-final/profile-summary.json) · [Isolated timing runs](../.cache/cascade-alloc-WWNmyl/radio-final/cache-pair-results.json) · [Per-test CPU](../.cache/cascade-alloc-WWNmyl/body-cpu.log) · [Compatibility results](../.cache/cascade-alloc-WWNmyl/gate/combined-wpt-diff.json)

[Theme expansion trace](../.cache/cascade-alloc-WWNmyl/cascade-shapes.jsonl) · [Final repository check](../.cache/cascade-alloc-WWNmyl/gate/final-check.log)
