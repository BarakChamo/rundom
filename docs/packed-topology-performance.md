# Packed DOM branches and dense traversal

This batch extends the repeated inactive HTML cache to branches with arbitrary ordinary children, including mixed element, text and comment siblings. The recipe stores adjacent child and attribute ranges in a typed array. Each document starts with a shallow projection. Opening a branch creates its own ordered child records and releases the branch’s recipe reference. Text-only leaves keep their original scalar until a Text record is needed. Template content has a separate edge and opens its own span lazily. The 6,500-level inert-template probe verifies projection with bounded call-stack depth. Immutable attributes detach before writes, reentrant value conversion and public Attr exposure.

The ordinary-document query path now defers public wrapper creation for large static results until a member is requested. It captures membership at query time and retains creation-realm identities after adoption. The document ID index can publish a same-slot replacement for a known first match. It requires the same ID, a detached same-document element, a current generation and the original index. Setting an ID on a detached element keeps the existing connected match available until insertion. Other affected IDs retain the ordinary invalidation path.

The initial CPU profile showed Window construction and handle allocation alongside the branch copy. The selected dense path walks ordered child spans with a stack proportional to depth. A general-purpose version regressed unique-input CPU, so ordinary traversal keeps its existing walk. Div, paragraph and span wrappers use their Window-local prototypes and still run the usual branding, wrapper registration, native clone guard and event handler initialization. The packed branch and large NodeList contracts cover mutation, adoption, ordering and identity.

[Baseline profiles](../.cache/performance-lab-hEMwjb/cpu-v1Sxhj/analysis.md) · [Branch storage](../packages/dom/src/private-template-copy.ts) · [Node ownership and snapshot tests](../packages/jsdom/test/node-storage-contracts.test.ts) · [ID mutation tests](../packages/jsdom/test/id-lookup-mutation.test.ts)

## Matched RunDOM timings

Apple M4, Node 24.20.0, shared host. Each pairing uses seven rotated fresh processes per side. Warm wall time is the median of per-process batch medians for eight 4,096-row operations. Measured CPU sums user and system CPU across five batches per process. The fragment-only build predates packed leaves. The leaf-only build is the previous deliverable. These first two pairings use the packed-branch build before the detached-ID refinement.

### Fragment only → packed branches

42 timing trials verified. [Matched trials](../.cache/performance-lab-pst8Xp/comparison-uZ8sRo/report.md)

| Workload            | Warm batch (ms)   | Measured CPU (ms)  | Total process (ms)  |
| ------------------- | ----------------- | ------------------ | ------------------- |
| parse-html-traverse | 85.782 → 78.349   | 448.060 → 481.056  | 1415.437 → 1191.953 |
| parse-html-unique   | 189.222 → 162.206 | 1077.149 → 930.124 | 2186.412 → 2028.426 |
| list-reconcile      | 25.938 → 21.272   | 115.667 → 115.284  | 570.570 → 577.239   |

### Packed leaves → packed branches

84 timing trials verified. [Matched trials](../.cache/performance-lab-pst8Xp/comparison-FLTVgF/report.md)

| Workload            | Warm batch (ms)   | Measured CPU (ms) | Total process (ms)  |
| ------------------- | ----------------- | ----------------- | ------------------- |
| parse-html-sparse   | 43.848 → 38.783   | 252.507 → 307.296 | 858.144 → 734.385   |
| parse-html-traverse | 71.887 → 67.442   | 423.838 → 412.435 | 1178.991 → 1169.075 |
| parse-html-update   | 67.973 → 52.174   | 388.559 → 338.825 | 1099.997 → 966.766  |
| parse-html-rotate   | 52.455 → 48.611   | 246.337 → 256.003 | 1159.997 → 1009.676 |
| parse-html-unique   | 168.941 → 156.297 | 991.978 → 957.181 | 2034.316 → 1927.019 |
| list-reconcile      | 20.198 → 14.205   | 99.471 → 89.712   | 481.091 → 503.231   |

### Detached ID refinement

Profiling showed that setting an ID on a detached replacement was invalidating the document’s already-indexed first match. Leaving that entry intact until insertion lets the same-slot proof publish the replacement directly. This pairing uses 12 operations per batch.

28 timing trials verified. [Matched trials](../.cache/performance-lab-X1fHGE/comparison-4XIKll/report.md)

| Workload          | Warm batch (ms) | Measured CPU (ms) | Total process (ms) |
| ----------------- | --------------- | ----------------- | ------------------ |
| list-reconcile    | 6.441 → 3.488   | 36.695 → 20.996   | 289.444 → 243.657  |
| parse-html-update | 43.276 → 47.856 | 322.526 → 337.086 | 723.822 → 733.284  |

## Matched memory

Five alternating processes per side with forced GC. The live Windows case keeps eight 4,096-row documents open. Traversal and update close their Window during each checked operation. Released heap is sampled after dropping handles. Peak RSS includes the Node allocator and native memory.

| Workload            | Live heap (MiB) | Released heap (MiB) | Peak RSS (MiB)    |
| ------------------- | --------------- | ------------------- | ----------------- |
| windows-live        | 42.360 → 32.971 | 22.084 → 22.087     | 160.297 → 140.844 |
| parse-html-traverse | 22.319 → 22.314 | 22.279 → 22.300     | 228.516 → 186.281 |
| parse-html-update   | 22.426 → 22.427 | 22.389 → 22.428     | 229.578 → 212.750 |

[Forced-GC samples](../.cache/packed-topology-followup/retained-memory/summary.json)

## Four-provider benchmark

| Provider  | Heavy | Light | 4,096-row | 32 windows | 1 window | 8 windows |
| --------- | ----- | ----- | --------- | ---------- | -------- | --------- |
| RunDOM    | 9/9   | 35/35 | 6/6       | 3/3        | 3/3      | 3/3       |
| jsdom     | 9/9   | 34/35 | 6/6       | 3/3        | 3/3      | 3/3       |
| Happy DOM | 9/9   | 29/35 | 6/6       | 3/3        | 3/3      | 3/3       |
| TurboDOM  | 8/9   | 28/35 | 6/6       | 3/3        | 3/3      | 3/3       |

| 4,096-row workload  | RunDOM | jsdom   | Happy DOM | TurboDOM |
| ------------------- | ------ | ------- | --------- | -------- |
| parse-html-sparse   | 6.922  | 164.181 | 262.456   | 3.881    |
| parse-html-traverse | 23.267 | 312.545 | 457.620   | 8.629    |
| parse-html-update   | 16.488 | 253.252 | 432.760   | 9.905    |
| parse-html-rotate   | 8.407  | 241.827 | 376.056   | 3.633    |
| parse-html-unique   | 36.617 | 202.462 | 417.395   | 42.764   |
| list-reconcile      | 1.214  | 12.892  | 20.361    | 6.669    |

The dense table reports milliseconds per warm batch of four verified operations.

Totals below sum median process times for scenarios verified by all four providers. Times are seconds.

| Matrix       | Shared workloads | RunDOM | jsdom  | Happy DOM | TurboDOM |
| ------------ | ---------------- | ------ | ------ | --------- | -------- |
| timing-heavy | 8                | 4.484  | 17.709 | 9.693     | 2.708    |
| timing-light | 27               | 13.060 | 53.509 | 33.830    | 14.298   |
| dense        | 6                | 2.337  | 14.469 | 19.240    | 1.932    |

The replay verified 555 timing trials and 180 memory trials. It records every phase, failed screen and forced-GC checkpoint.

[Full replay](../.cache/packed-topology-followup/final/lab-report.md) · [Frozen runtime and provider versions](../.cache/performance-lab-X1fHGE/cohort.json)

## Compatibility

The repository’s jsdom facade passed 1,580 cases per parser, and upstream jsdom API tests passed 634 cases per parser. The selected WPT replay matches all 13,347 named outcomes per parser, including harness and test statuses. The CSS, CSSOM, selector and ParentNode selection has 650 passes, 25 pending fixtures and 106 pre-existing failures. The DOM mutation, Range and fragment selection has 16 passes and one pre-existing Shadow DOM failure.

[Repository gate](../.cache/packed-topology-followup/retained-local.log) · [Rust-selected gate](../.cache/packed-topology-followup/retained-local-rust.log) · [Named WPT comparison](../.cache/packed-topology-followup/wpt-delta.json)

### Upstream project screens

A cell gives passed / failed / skipped or todo and elapsed process time. The upstream projects use their installed jsdom versions. These are one-process runner screens. Use their raw results to diagnose compatibility.

| Project  | RunDOM                   | jsdom                    | Happy DOM                  | TurboDOM                |
| -------- | ------------------------ | ------------------------ | -------------------------- | ----------------------- |
| vue-core | 270 / 0 / 1 (3.01 s)     | 270 / 0 / 1 (13.64 s)    | 251 / 19 / 1 (14.02 s)     | 169 / 32 / 1 (8.35 s)   |
| antd     | 133 / 0 / 0 (8.60 s)     | 133 / 0 / 0 (14.68 s)    | 128 / 5 / 0 (9.12 s)       | 121 / 12 / 0 (7.80 s)   |
| mui      | 430 / 0 / 39 (17.07 s)   | 430 / 0 / 39 (27.65 s)   | 454 / 8 / 7 (12.55 s)      | 181 / 281 / 7 (6.73 s)  |
| svelte   | 6012 / 90 / 34 (59.53 s) | 6102 / 0 / 34 (106.68 s) | 5823 / 279 / 34 (246.25 s) | Runner failed (38.74 s) |

Vue runtime-dom, Ant Design and Material UI matched every named result from their jsdom screens. The final Material UI screen passed the pointer test that failed in the earlier loaded run. Svelte matched all 6,136 named outcomes from the earlier RunDOM baseline, including the same 90 existing failures. The failures include inert attributes in transition markup that Svelte’s pinned jsdom 25.0.1 omits.

[Runner outputs and named jsdom deltas](../.cache/packed-topology-followup/broader/final-summary.json)

## Remaining cost

RunDOM’s dense traversal still opens every visited branch and builds one branded handle for each matched element. The dense profile records 118.6 ms of inclusive Window setup, 96.7 ms under element wrapping and 43.1 ms in the native clone guard. These are overlapping diagnostic samples from the packed-branch build. TurboDOM’s separate dense profile shows the work concentrating in indexed node access, selector traversal and attribute reads. Its pinned Window implementation creates fewer properties on a new Window.

Unique-input CPU remains concentrated in parse5. In the matched profile before the detached-ID refinement, inclusive query collection fell from 126.4 to 23.2 ms, while the tokenizer still accounted for about 636 ms inclusive. The detached-ID change reduced measured warm samples in the first-ID scan from 112 to zero. Query traversal is now the largest sampled reconciliation cost.

TurboDOM retains the advantage in empty Window creation and peak memory. A warm batch of eight empty Windows took 17.942 ms in RunDOM and 0.120 ms in TurboDOM. Thirty-two styled Windows peaked at 200.0 MiB in RunDOM and 117.8 MiB in TurboDOM. RunDOM released to 31.5 MiB, versus 25.5 MiB for Happy DOM and 16.5 MiB for TurboDOM.

[Packed-branch CPU profiles](../.cache/performance-lab-pst8Xp/cpu-CTswOY/analysis.md) · [TurboDOM traversal profile](../.cache/performance-lab-pst8Xp/cpu-y74MjT/analysis.md) · [Final reconciliation profile](../.cache/performance-lab-X1fHGE/cpu-HMfXvH/analysis.md) · [Provider implementation comparison](provider-architecture-comparison.md)

## November 20 dense parsing and traversal

The default parser now reuses markup feature checks from its admitted inactive-document recipe. On a repeated source it can skip scanning again for form and shadow syntax when the parser options permit it. Each Window still performs its own lifecycle and resource setup. Interleaved ID and class matches in wide terminal sibling lists can now share immutable 16-bit offsets, capped at eight entries and 8 KiB per recipe. Reading a sibling keeps that membership valid. A membership-changing edit updates a document-local ordered copy.

### Matched four-provider replay

Apple M4 and Node 24.20.0, shared host. Each of nine rounds rotated the preceding RunDOM release, the candidate, jsdom 30.1.3, Happy DOM 21.0.4 and TurboDOM 0.7.1 in serial fresh processes. All 270 measured trials passed their work checks. Each cell is a median warm batch of four operations on 4,096 rows, in milliseconds. The percentage is the median of the nine within-round candidate/control ratios.

| Scenario            | Previous RunDOM | RunDOM |  jsdom | Happy DOM | TurboDOM | Paired change |
| ------------------- | --------------: | -----: | -----: | --------: | -------: | ------------: |
| parse-html-sparse   |            3.69 |   2.91 | 114.20 |    184.83 |     2.72 |        -21.2% |
| parse-html-traverse |           10.18 |   9.28 | 151.73 |    246.22 |     2.97 |         -6.4% |
| parse-html-update   |            8.12 |   7.58 | 141.02 |    241.29 |     5.67 |        -10.4% |
| parse-html-rotate   |            3.51 |   2.77 | 135.60 |    223.48 |     2.72 |        -17.9% |
| parse-html-unique   |           25.91 |  25.49 | 135.11 |    230.55 |    26.97 |         -1.8% |
| list-reconcile      |            0.75 |   0.73 |   5.78 |      8.01 |     3.88 |         -2.1% |

### Where the traversal time goes

A separate diagnostic constructed 36 Windows per process from the same 4,096-row source and discarded six warmup Windows. Five fresh processes per provider checked all owner documents, texts and data attributes. Reading the NodeList indices and reading the DOM properties were timed separately. Medians below are milliseconds per Window.

| Phase                                               | Previous RunDOM | RunDOM | TurboDOM |
| --------------------------------------------------- | --------------: | -----: | -------: |
| Construct Window and parse or copy recurring markup |           0.689 |  0.578 |    0.070 |
| Create query result                                 |           0.014 |  0.014 |    0.319 |
| Read the 4,096 indexed members                      |           1.011 |  0.991 |    0.008 |
| Read and verify properties on all members           |           0.441 |  0.423 |    0.216 |
| Close Window                                        |           0.002 |  0.002 |    0.000 |

The indexed reads still create public wrappers on first access. Window setup and member exposure together explain most of the warm diagnostic gap. Two experiments changed private-slot initialization and direct public-handle allocation. Each saved less than 1% of dense-walk instructions over its immediate control, so both were discarded.

### Interleaved snapshots

A second fixture alternated two classes across 4,096 siblings and selected 2,048 rows after exposing one sibling by ID. Each reported value is the median paired change over six fresh-process rotations, each with 30 measured documents.

| Operation                                 | TypeScript CPU | TypeScript instructions | Rust CPU | Rust instructions |
| ----------------------------------------- | -------------: | ----------------------: | -------: | ----------------: |
| Read three result members                 |         -25.4% |                  -34.7% |   -15.7% |            -21.1% |
| Change one class, then read three members |         -24.8% |                  -33.3% |   -14.1% |            -20.1% |
| Read every matching row                   |         -17.4% |                  -20.4% |   -12.8% |            -13.9% |

### Memory and compatibility

Five runs held 16 independently editable documents, read every matched element, and forced garbage collection. Live heap above the pre-work baseline was 19.54 MiB before and 19.52 MiB after. After closing and dropping the handles it was 1.59 and 1.57 MiB respectively. Interleaved full walks used 8.2% less peak RSS in the TypeScript diagnostic.

Both parser backends passed 1,621 facade tests and 634 upstream jsdom API tests. An additional adoption and reorder probe matched all 8,288 checked members on both jsdom and RunDOM. The pinned WPT replay matched all 5,460 fixture outcomes and 206 harness errors from the previous release, with 215,960 of 248,342 assertions passing and 5,138 manifest-disabled fixtures. Four raw assertion-name differences came from two failed URL assertions embedding the run-specific server port.

[Frozen before/after and peer trials](../.cache/performance-lab-jsGzHC/comparison-GfhhEL/report.json) · [Phase, memory and parser measurements](../.cache/dense-stage-uIVOqR/summary.json) · [Interleaved fixture](../.cache/dense-stage-uIVOqR/mixed.cjs)

In the nine-round matrix, the full traversal worker took 243.3 ms before and 236.3 ms after. The paired median change was −0.5%. Peak RSS was 197.4 and 197.6 MiB (paired change +2.4%). Fifteen fresh confirmation pairs put warm traversal at 9.92 and 8.99 ms, with every pair favoring the change. Whole-process time fell 3.2% in that series and peak RSS was 197.7 and 197.6 MiB. Unique-input first use showed a 4.2% paired slowdown in the original matrix and a 0.3% paired slowdown on confirmation. The evidence supports recurring-document gains; unique first-use performance remains close to baseline. [Confirmation results](../.cache/dense-stage-uIVOqR/confirmation.json)

Vue runtime-dom reproduced jsdom's 270 passes and one skip. Happy DOM passed 251 and failed 19. TurboDOM passed 169 and failed 32, with incomplete collection. On the 159 common passing tests, median process time over three fresh runs was 2.01 s for RunDOM, 4.93 s for jsdom, 2.84 s for Happy DOM and 1.81 s for TurboDOM. [Vue results and passing-test intersection](../.cache/dense-stage-uIVOqR/real/results.json)
