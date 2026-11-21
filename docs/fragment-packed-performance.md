# Fragment insertion and packed parsed leaves

The original RunDOM build was frozen in [GqdMhH](../.cache/performance-lab-GqdMhH/cohort.json). [MSJKSo](../.cache/performance-lab-MSJKSo/cohort.json) adds fragment insertion changes, and [hEMwjb](../.cache/performance-lab-hEMwjb/cohort.json) adds packed leaf storage. Each comparison uses checked workloads in fresh processes with rotated order on Apple M4 and Node 24.20.0. Timings use a shared host. Peak RSS includes the allocator and native memory. Retained heap is measured after forced GC and releasing the workload’s handles.

## Fragment insertion

The owned HTML parser records possible effects while it builds a fragment. It retains at most 128 distinct IDs and otherwise invalidates the whole derived ID index. It also records whether the fragment might affect named lookups, details groups, scripts, styles, frames or radio groups. Parser candidates can overstate membership after foster parenting, formatting reconstruction and template parsing. Actual effects still run against the completed tree in its existing order. Ordinary replacements combine the removed subtree’s name and ID scan. Reentrant resource cleanup and cross-realm operations use the existing traversal. [Parser effect discovery](../packages/dom/src/html-fragment.ts#L79) · [Replacement commit](../packages/dom/src/window.ts#L3473)

The paired run verified all 84 trials. Warm batches used eight operations over 4,096-row fragments. RSS and heap use a separate five-round forced-GC replay. [Timing trials](../.cache/performance-lab-MSJKSo/comparison-PTEh8t/report.md) · [Memory trials](../.cache/fragment-packed-followup/fragment-memory/summary.json)

| Workload                       | Warm batch, baseline → fragment | Peak RSS, baseline → fragment | Released heap, baseline → fragment |
| ------------------------------ | ------------------------------: | ----------------------------: | ---------------------------------: |
| List replacement and readback  |              229.13 → 118.09 ms |           256.19 → 220.56 MiB |                  20.25 → 20.23 MiB |
| Table replacement and readback |              288.27 → 181.21 ms |           288.39 → 283.98 MiB |                  20.24 → 20.22 MiB |

## Packed parsed leaves

The packed slice covers eligible single-text HTML leaves of repeated inactive documents. It shares immutable attributes from the private parse recipe and keeps text as a scalar until a child list or Text handle is needed. Each document owns its element records and attribute arrays. The read path uses the normal attribute array. Mutation and public Attr exposure create an owned attribute record before its value or identity can change. This applies before user-controlled string conversion, so nested reads and writes see the same Attr object and MutationObserver records the right previous values. A newly materialized Text record retains normal parent edges and wrapper identity. [Leaf storage](../packages/dom/src/private-template-copy.ts#L15) · [Attribute write boundary](../packages/dom/src/window.ts#L5151) · [New ownership regression](../packages/jsdom/test/node-storage-contracts.test.ts)

Early candidates added packed-storage checks to each ordinary attribute read. The list-reconciliation profile recorded 23.6 ms of samples in the new attribute membership check across its warm batches. The final design moves the check to the edit and Attr boundaries. An existing reentrant coercion test caught the need to take ownership before conversion. [Early baseline profile](../.cache/performance-lab-MSJKSo/cpu-PrHUHd/analysis.md) · [Early candidate profile](../.cache/performance-lab-GuchRt/cpu-t7DoOQ/analysis.md) · [Focused compatibility check](../.cache/fragment-packed-followup/retained-focused.log)

The final comparison verified all 84 trials against the fragment-only build. Warm batches each used eight 4,096-row operations. Measured CPU sums user and system time over the five measured batches per worker. System contention was high, and the wall and CPU medians diverged on some rows. [Final paired timings](../.cache/performance-lab-hEMwjb/comparison-ikCO1f/report.md)

| Workload                  | Warm wall median, fragment → packed | Measured CPU median, fragment → packed |
| ------------------------- | ----------------------------------: | -------------------------------------: |
| Full traversal            |                  162.57 → 107.86 ms |                     489.98 → 399.73 ms |
| Checked edits             |                  106.33 → 127.19 ms |                     419.03 → 348.17 ms |
| Rotating repeated sources |                   104.58 → 70.63 ms |                     460.15 → 337.67 ms |
| Sparse reads              |                    79.74 → 82.91 ms |                     336.95 → 260.84 ms |
| Unique sources            |                  258.11 → 305.03 ms |                 1,011.00 → 1,056.12 ms |
| List reconciliation       |                    35.41 → 34.75 ms |                     116.88 → 125.82 ms |

Five interleaved forced-GC rounds tested memory separately. The eight live Windows each used a 4,096-row document. Retained heap rose by about 0.64 MiB for this recurring input. The private recipe and attribute ownership bookkeeping survive handle release within the bounded cache. [Final memory checks](../.cache/fragment-packed-followup/retained-memory/summary.json)

| Workload            | Live heap, fragment → packed | Peak RSS, fragment → packed | Released heap, fragment → packed |
| ------------------- | ---------------------------: | --------------------------: | -------------------------------: |
| Eight large Windows |            42.36 → 33.59 MiB |         160.45 → 147.13 MiB |                22.08 → 22.72 MiB |
| Full traversal      |            22.32 → 22.93 MiB |         228.09 → 188.38 MiB |                22.28 → 22.92 MiB |
| Checked edits       |            22.42 → 23.03 MiB |         221.38 → 213.50 MiB |                22.38 → 23.03 MiB |

## Compatibility

The fragment build passed 1,575 facade tests per parser and the final build passed 1,576 per parser. Both builds passed 634 upstream jsdom API cases per parser. The final TypeScript gate passed on a two-worker retry after three timeouts under shared-host load. The newer tests cover warmed name and ID lookups across foster parenting, per-document attribute copy-on-write, and held Attr and Text handles during adoption. The existing 48-case parse-copy suite passed, including nested attribute edits during coercion. [Fragment local gate](../.cache/fragment-packed-followup/fragment-local-recheck.log) · [Final local gate](../.cache/fragment-packed-followup/retained-local-recheck.log) · [Native-selected gate](../.cache/fragment-packed-followup/retained-local-rust.log)

Across both candidates and parsers, 13,037 named CSS, CSSOM, selector and ParentNode WPT outcomes and 310 additional mutation, adoption, Range and fragment-related outcomes matched the frozen baseline. The first selection records 106 existing fixture failures per parser. The second records one existing Shadow DOM fixture failure per parser. The named comparison includes fixture and harness outcomes. [WPT baseline comparison](../.cache/fragment-packed-followup/wpt-delta.json)

## Four-provider replay

The final matrix used RunDOM’s default TypeScript parser, jsdom 30.1.3, Happy DOM 21.0.4 and TurboDOM 0.7.1. Three rotated fresh processes ran each supported timing row. Process totals sum the medians for the same verified scenarios across all four providers. The absolute times reflect the shared host at the time of this run.

| Workload                                      |    RunDOM |     jsdom | Happy DOM |  TurboDOM |
| --------------------------------------------- | --------: | --------: | --------: | --------: |
| Default scenarios completed                   |     44/44 |     43/44 |     38/44 |     36/44 |
| Dense scenarios completed                     |       6/6 |       6/6 |       6/6 |       6/6 |
| Eight shared construction scenarios, total    |    4.36 s |   17.18 s |    9.72 s |    2.50 s |
| 27 shared query and mutation scenarios, total |   11.94 s |   48.38 s |   31.23 s |   13.88 s |
| Six shared dense scenarios, total             |    2.55 s |   13.34 s |   17.97 s |    1.96 s |
| Fragment list readback, warm batch            |  75.39 ms | 438.42 ms | 275.10 ms | 155.01 ms |
| Fragment list readback, peak RSS              | 221.8 MiB | 408.4 MiB | 916.9 MiB | 138.0 MiB |
| Fragment table readback, warm batch           |  85.36 ms | 578.08 ms | 502.10 ms | 219.94 ms |
| 4,096-row full traversal, warm batch          |  17.29 ms | 264.83 ms | 294.88 ms |   3.80 ms |
| 4,096-row full traversal, peak RSS            | 212.1 MiB | 551.3 MiB | 634.3 MiB | 146.8 MiB |
| Dense list reconciliation, warm batch         |   3.28 ms |  19.07 ms |  27.75 ms |   8.75 ms |

All 180 forced-GC trials passed across window counts of 1, 8 and 32.

[Full replay with phase timings, memory checkpoints and screen failures](../.cache/fragment-packed-followup/final/lab-report.md)
