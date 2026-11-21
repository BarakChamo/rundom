# Absolute-gap optimization results

Baseline: sealed 3xApqF. This batch targets unchanged workloads with absolute deficits above 5 ms, separating first-use latency from warm throughput. Results are exploratory shared-host measurements with nine rotated fresh processes, not certified overall ratios.

## Candidate decisions

| Candidate                                                      | Decision and evidence                                                                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct ownership-slot allocation through EventTarget           | Rejected: compatibility passed after capturing Reflect.construct, but dense traversal more than doubled.                                                                                                |
| Private CSS accessor call                                      | Rejected: role timing was essentially flat; no meaningful broad gain.                                                                                                                                   |
| Bundle all native boundary dependencies                        | Superseded: cold use improved about 21 ms, but the package duplicated the shared Result constructors. A built-artifact contract now prevents that regression.                                           |
| Bundle native validation, external shared Result               | Retained for combined qualification: unique first use 59.92 → 39.84 ms; sparse first use 59.30 → 37.55 ms. Warm work was essentially unchanged.                                                         |
| Split all CSS capabilities                                     | Rejected: first role use did not improve and warm batched mutations regressed.                                                                                                                          |
| Split only selector loading                                    | Rejected: matched cold role/mutation and warm measurements were flat.                                                                                                                                   |
| Native release LTO/codegen/stripping                           | Rejected: unique parsing improved less than 0.5 ms and did not demonstrate a broad benefit. Production Cargo configuration remains unchanged.                                                           |
| Dedicated static lists for first query results                 | Retained for combined qualification: repeated parse/count 14.99 → 13.66 ms, update 20.35 → 19.74 ms; traversal and repeated query guards were flat. Public live collections retain their existing path. |
| Pool-wide proof that UTF-16 spans cannot split surrogate pairs | Rejected: the serial confirmation changed unique parsing only 45.52 → 45.30 ms. Full Unicode/ownership checks remain unchanged.                                                                         |
| Transparent intrinsically uncloneable Node proxies             | Rejected: traversal, updates and role queries regressed. No new wrapper representation is shipped.                                                                                                      |

All candidate default checks passed before timing. The corrected native bundle also passed Rust-selected tests and retains interpreted no-eval schemas. Rejected source and frozen manifests remain under `.cache/qualification/absolute-gap/`.

## Attribution

The cold native profile attributed substantial time to loading its validation dependencies. Bundling removes that module-loading cost while leaving actual parser calls and fallbacks unchanged. Neverthrow remains external so Result objects and ResultAsync retain their shared public identities. Zod's own configuration/registry ownership is not changed by application code.

Diagnostic-only native builds split parsing from encoding, and separate guarded workers wrapped the native APIs on identical 4,096-row unique inputs. Each provider performed 53 actual native calls and returned 8,205 nodes per document. These diagnostic calls showed comparable binding costs (one uninstrumented worker: RunDOM median 4.48 ms, TurboDOM 4.87 ms); they do not prove a speed ratio between kernels. Inspector-instrumented Rust stage times were larger and must not be compared numerically with those uninstrumented values. The evidence does not support treating Rust tokenization as the main source of the whole-document deficit; validation, materialization, wrapper/window work remain important after the native boundary.

The experiment index is `.cache/qualification/absolute-gap-experiment-results.json`. One initial span-proof report is explicitly excluded because a primitive-identity probe may have overlapped its first worker; its complete nine-round serial confirmation is used instead. The first attribution preload was rejected by the producer guard; a temporary preload with a frozen-cohort working directory passed without weakening that guard. Instrumented Rust logging is absent from production.

## Final native-only qualification

Only the native boundary build change is retained. The NodeList experiment did not demonstrate consistent broad gains and is removed, along with the CSS, wrapper, Unicode-proof and Cargo/LTO candidates. TypeScript remains the default. There is no new public jsdom option, parser API, unchecked storage path or Rust parsing algorithm.

The final source passed fresh release gates: 1,544 facade tests under each default/native selection, 11 DOM tests, 47 TypeScript native-boundary tests plus two Rust codec tests, both 634-case API runs, strict packed consumer types and all four packed Vitest pools under both parser selections. The no-eval subprocess and shared Result constructor identity contract passed against the built boundary. The native corpus made 3,464 actual calls with 3,267 passes, 3,219 reference passes, 48 existing improvements over the pinned reference, 197 shared failures and 206 fragment-context exclusions; no matched or boundary regressions occurred.

Default qualification is **carried forward, not rerun**: all 14 DOM/facade artifacts and relevant implementation/build/dependency sources exactly match sealed 3xApqF. The default frontend has only a type import and a Rust-only dynamic require of the changed package. Its previous complete selected replay therefore remains applicable: 10,598 selected fixtures, 5,460 executions, 5,138 pending, 248,342 recorded assertions, 215,815 passes and 206 known harness failures. The hard byte/source proof is `absolute-gap-native-default-proof.json`. This is not a new global WPT percentage or a claim of native selected-WPT coverage.

### Final matched timings

Nine rotated fresh processes and nine warm batches per successful provider are shared-host exploratory measurements. The final matrix has **243 verified timing trials**. Each first-use phase below performs one document operation; large warm batches perform four and small batches eight. Native parsing, fallback accounting, templates and caller work remain unchanged.

| Scenario            | Rows × warm operations | First use before → after | Cold saved ms | Warm before → after | Turbo cold / warm |
| ------------------- | ---------------------: | -----------------------: | ------------: | ------------------: | ----------------: |
| parse-html-sparse   |               4096 × 4 |          63.331 → 33.874 |        29.457 |       9.993 → 8.827 |    15.770 / 3.633 |
| parse-html          |               4096 × 4 |          71.794 → 43.138 |        28.656 |     16.047 → 15.974 |    17.783 / 4.100 |
| parse-html-traverse |               4096 × 4 |          63.038 → 42.651 |        20.387 |     19.008 → 18.691 |    16.507 / 4.030 |
| parse-html-update   |               4096 × 4 |          64.139 → 42.018 |        22.121 |     16.372 → 16.530 |    18.715 / 8.123 |
| parse-html-rotate   |               4096 × 4 |          62.214 → 41.729 |        20.485 |     14.456 → 14.611 |    16.277 / 3.880 |
| parse-html-unique   |               4096 × 4 |          60.089 → 39.663 |        20.426 |     45.568 → 45.796 |   15.067 / 34.035 |
| parse-html          |                256 × 8 |          41.470 → 18.434 |        23.035 |       9.278 → 9.240 |     4.981 / 0.654 |
| parse-html-traverse |                256 × 8 |          41.741 → 17.802 |        23.939 |     10.014 → 10.053 |     4.795 / 0.721 |
| parse-html-rotate   |                256 × 8 |          41.382 → 17.372 |        24.010 |       9.194 → 9.342 |     4.524 / 0.854 |

Cold native-document use improves about 20–29 ms in the large canonical cases. Warm results are broadly flat; no faster-tokenizer or dense-traversal speedup is claimed. Default TypeScript role queries, full traversal and eight-window initialization retain their previous implementation and gaps. The remaining first-use Rust deficit and post-native validation/materialization/window work are visible rather than folded into a warm ratio.

### Framework and lifetime checks

All 72 fresh packed React/Vitest comparison runs passed ten tests each across forks, threads, vmForks and vmThreads, including both 2,048-row repeated interaction/state stress tests. This batch explicitly selects Rust for both providers; the fixtures continue to exercise the normal fragment/active parsing fallback and do not prove that every UI operation uses the native kernel. Results are not pooled with earlier default-backend framework timings.

| Pool      | Test time before → after ms | Whole-process time before → after ms |
| --------- | --------------------------: | -----------------------------------: |
| forks     |             487.20 → 486.68 |                    1209.04 → 1199.10 |
| threads   |             539.79 → 538.56 |                    1217.09 → 1220.57 |
| vmForks   |             487.70 → 484.70 |                      991.60 → 987.25 |
| vmThreads |             487.50 → 490.10 |                      970.11 → 975.73 |

All 24 forced-GC processes passed closed/released-Window collection and retained closed-document usability checks. Each backend used three rotated before/after process pairs. Whole-worker checkpoint deltas include JIT and first-use module initialization; they are not pure cache-object sizes.

| Backend / checkpoint                | Heap before → after MiB | External before → after MiB |
| ----------------------------------- | ----------------------: | --------------------------: |
| typescript / four-recurring-shells  |           15.05 → 15.05 |                 0.00 → 0.00 |
| typescript / eight-live-windows     |           34.20 → 34.20 |                 0.00 → 0.00 |
| typescript / released-source-inputs |             3.46 → 3.46 |                 0.00 → 0.00 |
| rust / four-recurring-shells        |           16.89 → 14.08 |                 0.00 → 0.00 |
| rust / eight-live-windows           |           36.04 → 33.23 |                 0.00 → 0.00 |
| rust / released-source-inputs       |             7.00 → 4.18 |                 0.00 → 0.00 |

### Evidence and limits

The final candidate/cohort digests are in `.cache/qualification/absolute-gap-native-candidate-prepared.json`; the retained source stage is `absolute-gap/native-source-stage`. `absolute-gap-native-derived-results.json` links every final timing/profile/framework/memory report and release status. `absolute-gap-native-sealed-manifest.json` records final source/runtime and archive hashes. The earlier two-change matrix remains archived under `absolute-gap-final-*` and is explicitly superseded; its default-after timings are not advertised as the shipped result. Rejected candidates remain archived with their frozen source manifests.

The initial all-dependency native bundle's timings establish an internal loading hypothesis, not an acceptable public package: it failed shared primitive identity and is superseded by the corrected, externally shared Result version. No benchmark result is evidence of complete browser behavior or a certified overall speed ratio.
