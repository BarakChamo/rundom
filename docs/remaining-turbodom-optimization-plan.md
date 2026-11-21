# Material TurboDOM gaps

Optimize only accepted positive deficits above 5 ms in existing canonical batches. Do not inflate operation counts or combine unlike workloads into an overall ratio. Cases below the threshold, failed competitor screens and already-winning workloads are correctness/cost-shifting controls, not optimization projects.

## Qualified checkpoint

The current source is frozen as `deMMKD`; source/runtime/evidence hashes are sealed in `.cache/qualification/material-gap-sealed-manifest.json`. [Performance findings](performance-lab-results.md) own the complete matrix, compatibility scope and memory tradeoffs. Exact report pointers and first-use/provider-load medians are in `material-gap-sealed-derived-results.json`; raw instrumentation is indexed by `material-gap-sealed-profile-summary.json`.

## Remaining measured queue

Values below are shared-host exploratory milliseconds per canonical batch. They establish targets, not a certified overall speed ratio. Backend-specific paths are kept separate. The sparse confirmation and primary matrix are separate reports.

| Target                                         | RunDOM ms | TurboDOM ms | Gap ms |
| ---------------------------------------------- | --------: | ----------: | -----: |
| Full traversal, Rust, 4 × 4,096 rows           |    18.003 |       3.385 | 14.618 |
| Full traversal, TypeScript, same batch         |    16.512 |       3.385 | 13.127 |
| Parse/update, Rust, same batch                 |    21.319 |       8.638 | 12.681 |
| Rotating parse, Rust, same batch               |    16.068 |       3.476 | 12.592 |
| Unique parse, Rust, same batch                 |    43.416 |      31.880 | 11.536 |
| Roles, 2,048 operations                        |    21.751 |      10.941 | 10.810 |
| Sparse TypeScript confirmation, 4 × 4,096 rows |    14.294 |       3.580 | 10.714 |
| Rotating parse, TypeScript, same batch         |    13.742 |       3.476 | 10.266 |
| Create/close 8 empty Windows                   |     6.729 |       0.090 |  6.639 |

Repeated parsing, small 256-row construction/traversal/rotation and 8,192-row batched mutation/query also remain above 5 ms; their exact rows stay in the derived report. Unique TypeScript parsing is within 1.85 ms and is excluded from further optimization work.

## What was retained and rejected

Module-private native fields replace both wrapper ownership WeakMap lookup and the inverse raw-node-to-wrapper identity lookup, with no new observable properties or public prototype sharing. Text aggregation uses a shared ordinary-tree kernel with allocation-free single-child chains. TypeScript templates and immutable validated native arenas independently reuse at most eight recurring keys under 4,194,304 source-unit/131,072-node aggregate bounds; per-input limits remain 1,048,576 units/32,768 nodes. Admission requires repeated input, exposed documents remain independently mutable, public native entry points remain uncached, and actual call/fallback accounting is preserved.

The native recurring-source contract failed first with twelve actual calls rather than eight, then passed after implementation. Genuinely unique and evicted/over-budget inputs still invoke the kernel. Both backends pass the complete recorded gates and lifecycle controls. Source archives, staged candidates and raw reports preserve rejected shared-wrapper/global-batching variants, split native metadata fields with lazy projections, and complete initial Window descriptor layout. Do not repeat them without new attribution evidence. The previous whole-tree-promotion lazy model remains rejected: dense reads and first writes cannot pay for sparse-only wins.

## Next substantial boundary

Raw canonical copying/materialization is still the large allocation source. The after-capture attributes roughly 59 MB to cloneRawNode across nine full-traversal batches. Sparse after-captures also show Window assembly and source-document ID-index construction as leading CPU costs, with essentially unchanged clone/index allocation. Investigate avoiding full ID-map construction for cheap first lookups, covering early/late/missing/duplicate IDs, repeated random reads, mutations, adoption, reentrancy and retained closed handles. Do not optimize a single fixture's ID position.

For native parsing, separate actual unique-input kernel/transport/ownership validation from warmed checked-arena materialization. The latter still allocates canonical nodes and attributes despite avoiding the kernel. Any trusted bulk-read or packed/fine-grained overlay experiment must retain boundary validation, Unicode/namespace/template semantics and private ownership; it must avoid the rejected global promotion on first write. Measure dense reads, writes, mixed sources, lifetime and real React stress together.

Empty-window initialization remains unresolved. The existing diagnostic-only phase attribution identifies per-realm class/prototype/global assembly; copying TurboDOM's shared public constructors/prototypes is incompatible with current identities, reflection and mutable per-window prototypes. New internal factories must preserve own data descriptors, key order, VM roots, subclassing and complete first-use costs. The one-step Window layout experiment was slower and removed.

Never overlap timing/profiling with builds, checks or other measurements. Gate each retained substantial change with default/native/API/types/native replay and packed real Vitest contracts; seal source and runtime hashes. Report the sparse latency regression, bounded cache memory and flat end-to-end framework results alongside the wins.

## Material-gap sweep, November 8

The ranked experiments, rejected approaches and combined qualification are tracked in [optimization sweep results](optimization-exhaustion-results.md). Earlier tables remain historical measurements of their sealed checkpoints.

The subsequent [absolute-gap batch](absolute-gap-results.md) attributes cold loading and dense/native work against sealed 3xApqF and records the final measured changes separately.
