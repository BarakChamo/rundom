# Disjoint custom properties in the computed cascade

## What changed

A private stylesheet rule containing only literal custom properties can supply an immutable block of names and values. When the other matched declarations have disjoint names, the cascade records the block's original enumeration position and resolves the local winners independently. A descendant can inherit the same block while declaring additional custom properties, and a repeated application of the same theme can skip the inherited copies. Rules that compete for a name use the existing winner, layer and rollback logic. The projection supports ordered enumeration, lookup, substitution and computed-style snapshots captured before a mutation.

The optimization applies to rules with 24–512 custom properties and up to 32,768 UTF-16 units of names and values. CSS-wide keywords and values that require variable resolution go through normal expansion. Large private entry arrays have weak references. Exposing or adopting stylesheets disables the private rule shortcut for subsequent reads.

## Radio Group mechanism

A diagnostic build counted work while the same four upstream Ant Design Radio Group and Form Item assertions passed on both builds. The starting build called the custom-property packing pass 69 times with a cumulative 25,790 winner entries at the entrances to those calls. The updated build called it seven times with 17 entries total. It consumed 58 matched theme sources as blocks, avoiding 22,098 individual declaration expansions, and carried 36,576 inherited token positions through grouped operations. These counts describe separate stages, so adding them would overstate the workload. Each diagnostic used a separate package copy. Timing measurements used the frozen production packages.

A controlled replay repeatedly mounted a new themed section and child, read a width that depended on a theme token, then detached the section. Over five fresh processes per condition, the median thread CPU for 400 cycles after warm-up fell from 770 to 140 ms with a disjoint local variable (5.5× throughput). With one overlapping local name it fell from 645 to 307 ms (2.1×). The leaf and other eligible frames can still reuse blocks in the overlap case.

In the final Radio worker V8 profile, 727 of 729 computed-style samples were under role or focus checks. Matching and scope traversal appeared in 225 samples, and winner resolution in 134. On the starting build those counts were 587 of 588, 132 and 154, respectively. The jsdom profile recorded 278 of 384 computed-style samples under role or focus checks. The captures contained 18,492, 18,692 and 18,359 active samples, respectively. Categories are inclusive, and individual CPU profiles vary. These data identify matching, scope traversal and remaining style resolution during accessibility checks as the next broad areas to investigate.

A second set of profiles started and stopped V8 sampling inside each of the four test intervals. RunDOM after the change had 579 role/focus computed-style samples out of 1,966 active samples (29.5%), starting RunDOM had 392 of 1,774 (22.1%), and jsdom had 194 of 1,588 (12.2%). The final capture included 200 matching/scope samples, 169 samples below property writes and 105 in winner resolution. Sampling and GC scheduling varied between processes. The direct operation counts establish that repacking disappeared from this path, while the case-body profiles show how much broader cascade work still occurs.

## Case-body CPU

| Experiment | Build         | Runs | Median CPU (ms) | Range (ms)  |
| ---------- | ------------- | ---- | --------------- | ----------- |
| body-cpu   | RunDOM before | 3    | 640.2           | 593.1–703.6 |
| body-cpu   | RunDOM after  | 3    | 621.4           | 603.0–630.3 |
| body-cpu   | jsdom         | 3    | 556.3           | 545.3–810.0 |
| followup   | RunDOM before | 6    | 274.3           | 247.3–387.7 |
| followup   | RunDOM after  | 6    | 327.7           | 254.5–428.8 |
| followup   | jsdom         | 6    | 233.7           | 158.8–305.7 |

Each trial used a fresh process and verified the exact four named passes. CPU is user plus system time on the executing worker thread between Vitest’s per-test start and finish, summed across the four tests. It includes the test hooks. The first experiment overlapped with compatibility work. The follow-up ran after the four-provider and retained-heap batches finished.

## Four-provider results

The full screen ran the pinned five Material UI files and eight Ant Design files. The common selection used the same 118 Material UI cases and 116 Ant cases for all providers. Elapsed time includes startup and teardown. Test time sums Vitest’s per-case elapsed durations. Peak RSS is the maximum resident set size from macOS time -l. Each cell uses the median across the qualifying runs for that row. Full Happy DOM and TurboDOM runs are shown even when incomplete.

### Material UI

| Selection | Provider  | Pass/fail/pending | Runs | Elapsed (s) | Test time (s) | Peak RSS (MiB) |
| --------- | --------- | ----------------- | ---- | ----------- | ------------- | -------------- |
| full      | RunDOM    | 430/0/39          | 3    | 57.67       | 24.73         | 313.2          |
| full      | jsdom     | 430/0/39          | 3    | 56.66       | 24.31         | 321.8          |
| full      | Happy DOM | 454/8/7           | 1    | 76.12       | 32.46         | 307.2          |
| full      | TurboDOM  | 181/281/7         | 1    | 71.22       | 11.85         | 252.1          |
| common    | RunDOM    | 118/0/47          | 1    | 8.81        | 1.75          | 311.5          |
| common    | jsdom     | 118/0/47          | 1    | 13.13       | 3.30          | 312.3          |
| common    | Happy DOM | 118/0/47          | 1    | 7.14        | 1.28          | 308.8          |
| common    | TurboDOM  | 118/0/47          | 1    | 5.94        | 0.91          | 311.0          |

### Ant Design

| Selection | Provider  | Pass/fail/pending | Runs | Elapsed (s) | Test time (s) | Peak RSS (MiB) |
| --------- | --------- | ----------------- | ---- | ----------- | ------------- | -------------- |
| full      | RunDOM    | 133/0/0           | 3    | 11.78       | 2.88          | 603.7          |
| full      | jsdom     | 133/0/0           | 3    | 14.26       | 2.78          | 608.9          |
| full      | Happy DOM | 128/5/0           | 1    | 11.71       | 2.17          | 593.2          |
| full      | TurboDOM  | 121/12/0          | 1    | 10.11       | 1.84          | 584.0          |
| common    | RunDOM    | 116/0/17          | 1    | 10.39       | 2.32          | 602.3          |
| common    | jsdom     | 116/0/17          | 1    | 12.45       | 2.35          | 625.1          |
| common    | Happy DOM | 116/0/17          | 1    | 10.13       | 1.72          | 588.7          |
| common    | TurboDOM  | 116/0/17          | 1    | 8.68        | 1.52          | 562.9          |

## Material UI memory

| Build         | Peak trials | Elapsed (s) | Peak RSS (MiB) | Peak range (MiB) | Heap trials | Select before teardown (MiB) | Select after teardown (MiB) |
| ------------- | ----------- | ----------- | -------------- | ---------------- | ----------- | ---------------------------- | --------------------------- |
| RunDOM before | 3           | 8.52        | 384.4          | 383.6–386.2      | 2           | 78.72                        | 78.58                       |
| RunDOM after  | 3           | 8.10        | 342.8          | 330.9–385.1      | 2           | 78.07                        | 77.93                       |
| jsdom         | 3           | 10.17       | 383.2          | 373.0–407.0      | 3           | 89.56                        | 89.45                       |

Peak trials were separate uninstrumented full-suite runs in rotated order, qualified on the entire named outcome set. Retained-heap measurements used two event-loop turns and two inspector garbage collections at each sampling point in every file worker. Each sample measures V8 live heap in the full Vitest worker, including React and its module cache. The after sample comes after environment teardown and loader close, while the Vitest worker is still running. Select had the highest retained heap. The worker heaps come from separate processes and are not additive.

| Worker            | Starting RunDOM after GC (MiB) | Final RunDOM after GC (MiB) | jsdom after GC (MiB) |
| ----------------- | ------------------------------ | --------------------------- | -------------------- |
| Button.test.js    | 59.60                          | 59.60                       | 73.53                |
| Checkbox.test.js  | 56.94                          | 56.95                       | 72.14                |
| Dialog.test.js    | 56.49                          | 56.50                       | 71.48                |
| Select.test.js    | 78.58                          | 77.93                       | 89.45                |
| TextField.test.js | 64.30                          | 64.32                       | 79.04                |

## Interpretation

The Radio Group CPU gap remains. In the initial three rotations the change took 621 ms versus 640 ms before and 556 ms on jsdom. In the six follow-up rotations it took 328 ms versus 274 ms before and 234 ms on jsdom. The elapsed time for these four named tests inside the full Ant screen was 257 ms on RunDOM versus 204 ms on jsdom, even though the complete Radio Group file took 628 ms versus 651 ms. The host’s load changed substantially across batches. Reporting the batches independently preserves both the slowdown in the follow-up and the variation in the jsdom baseline.

A final six-round diagnostic read macOS retired-instruction counts at the beginning and end of each named test and collected worker thread CPU at the same boundaries. Instruction counts include all threads in the Vitest process during those intervals. RunDOM used a median 3.561 billion instructions, down 11.0% from 4.003 billion before. All six final observations were below all six starting observations. jsdom used 3.140 billion, leaving a 13.4% instruction gap. In this batch median thread CPU was 229 ms on RunDOM, 257 ms before and 200 ms on jsdom, a remaining 14.5% CPU gap. Taken together, the runs establish a repeatable reduction in executed instructions but do not establish a consistent size for the real-workload CPU improvement.

Material UI's dedicated peak-RSS median fell by 41.6 MiB against the starting build and was 40.5 MiB below jsdom. The highest final observation reached 385.1 MiB, and all three ranges overlap. In the broader four-provider screen, final RunDOM was only 8.6 MiB below jsdom. Retained heap after two collections moved by under 0.7 MiB for every worker against the starting build. These measurements support stable retention and show that the entire peak-RSS difference cannot be attributed to retained theme data.

## Compatibility and reproducibility

Both parser modes passed 1,596 local facade tests and 634 pinned upstream jsdom API tests. The first upstream TypeScript run timed out in a test with its own five-second timer for releasing callback handles. The full retry passed. Packed consumer tests passed in all four Vitest pools with 11 tests per pool for TypeScript and 12 per pool for Rust. The repository check passed all 15 tasks.

The targeted WPT comparison covered 13,037 CSS and selector assertions plus 310 mutation assertions per parser. Every named assertion, fixture and harness outcome matched the previous reference. The 106 existing CSS fixture failures and one mutation fixture failure per parser remain. An additional differential test compared the complete ordered computed declarations and selected property reads in 144 captured snapshots across mutations, overlapping names, rollback, substitution and exposed CSSOM edits. Both frozen builds produced byte-identical results.

Material UI enables a different set of tests according to the environment. The full selection contained 469 named cases on all providers. RunDOM and jsdom had 39 pending cases, while Happy DOM and TurboDOM each had seven pending. One initial full RunDOM timing attempt and one retained-heap attempt on each RunDOM build failed the Select opening-mouseup delay assertion. These attempts are available in the raw logs and excluded from the matched medians.

## Evidence

Frozen packages · [Starting manifest](../.cache/theme-reuse-BnXs9d/baseline.json) · [Final manifest](../.cache/theme-reuse-BnXs9d/records.json)

Timing and memory · [Provider trials](../.cache/theme-reuse-BnXs9d/qualified/summary.json) · [Per-file medians](../.cache/theme-reuse-BnXs9d/files-report.json) · [Rotated peak RSS](../.cache/theme-reuse-BnXs9d/peak/matched.jsonl) · [Retained-heap samples](../.cache/theme-reuse-BnXs9d/retained-summary.json)

Radio profiling · [Three-round CPU](../.cache/theme-reuse-BnXs9d/body.log) · [Six-round CPU](../.cache/theme-reuse-BnXs9d/followup.log) · [Per-case instruction and CPU records](../.cache/theme-reuse-BnXs9d/counters) · [Scoped CPU profiles](../.cache/theme-reuse-BnXs9d/case-stacks/profile-summary.json) · [Starting counts](../.cache/theme-reuse-BnXs9d/baseline-counts.json) · [Final counts](../.cache/theme-reuse-BnXs9d/records-counts.json) · [Controlled replay](../.cache/theme-reuse-BnXs9d/throughput.log)

Verification · [Repository check](../.cache/theme-reuse-BnXs9d/gate/check-final.log) · [WPT comparison](../.cache/theme-reuse-BnXs9d/gate/combined-wpt-diff.json) · [Snapshot differential](../.cache/theme-reuse-BnXs9d/differential.cjs)
