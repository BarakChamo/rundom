# Interface construction, CSS initialization and tree-copy experiments

The November 8 follow-up found no additional optimization with a repeatable enough benefit to ship. Production algorithms, dependencies and parser selection remain unchanged from the sealed CSS compilation-cache release. Regression examples and the complete experimental evidence are retained. Neither canonical TurboDOM gap is closed.

## Current absolute gaps

The final rotated comparison used the same frozen baseline, unchanged scenario bodies and counts, nine fresh processes per provider, nine measured batches, and separate warmup. These are shared-host observations, not isolated-host speed claims. Earlier reports used slower host conditions; comparing their absolute times with this table would incorrectly attribute host variation to code.

| Canonical measurement                         | Released RunDOM ms | TurboDOM ms | Remaining gap ms | Rejected wrapper candidate ms |
| --------------------------------------------- | -----------------: | ----------: | ---------------: | ----------------------------: |
| First role query, 256 rows                    |             49.851 |       3.445 |           46.406 |                        48.835 |
| Warm full traversal, four 4,096-row documents |             16.263 |       3.697 |           12.566 |                        16.307 |
| Warm role queries, 2,048 operations           |             22.594 |      10.625 |           11.969 |                        22.287 |

“First role query” measures the first query after scenario setup; it excludes provider loading and document creation. Full traversal creates, queries, checks and closes four independent documents per batch; the generic laboratory `windows: 8` dimension is unused by that scenario. Failures are not converted into timings.

## Hypotheses and decisions

All implementations were isolated from the production workspace. Separate frozen packages and installed consumers were used; timings did not overlap builds, tests, memory runs or CPU profiles. Root source hashes were checked before integrating tests and documentation.

| Area                       | Experiment                                                                                                                          | Outcome                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| CSS implementation classes | Share private declaration implementation and mutation operations; retain distinct public constructors/prototypes                    | Roughly 2 ms initial cold difference; insufficient evidence to retain                                                          |
| CSS public accessors       | Generate closure/accessor scaffolding at build time                                                                                 | Cold result flat or slower; warm regressions                                                                                   |
| CSS private dispatch       | Generate private base-prototype descriptor scaffolding                                                                              | Slower cold initialization; rejected                                                                                           |
| CSS scaffolding size       | Emit only the public or private factory under test                                                                                  | Did not rescue either factory                                                                                                  |
| Stylesheet interfaces      | Defer rule-interface construction until requested                                                                                   | Flat; rejected                                                                                                                 |
| CSS grammar                | Lazily create complete CSS-tree grammar descriptors through its original operation                                                  | Initial 3.45 ms cold saving shrank to 2.14 ms on repeat; added Proxy/build-transform complexity rejected                       |
| CSS compilation            | Exercise declaration set/get operations before capturing code-only compilation data                                                 | Initial 5.63 ms cold saving shrank to 1.39 ms on repeat; rejected                                                              |
| Window bindings            | Avoid redundant enumerable-binding transitions                                                                                      | No traversal gain                                                                                                              |
| Window compilation         | Extend code-only compilation caching to the Window implementation                                                                   | One worker SIGSEGV; rejected regardless of apparent startup saving                                                             |
| Wrappers                   | Directly allocate 19 field-free concrete HTML interfaces, retaining ownership stamps, handlers, local prototypes and clone barriers | Initial traversal 20.925 → 18.389 ms; repeat 14.881 → 13.887 ms; clean rebuild 16.263 → 16.307 ms. Final result flat; rejected |
| Packed tree copies         | Precompute child counts/positions and allocate sized arrays                                                                         | Slower traversal                                                                                                               |
| Packed tree order          | Depth-first recipe layout for locality                                                                                              | Slower traversal                                                                                                               |
| Copy instructions          | Typed parent-index instructions and fresh factory records                                                                           | Slower after producer isolation was corrected; initial isolation failure is not a timing result                                |
| Attribute storage          | Share private attribute arrays until writes or public Attr exposure; retain coercion/observer semantics                             | Full facade suites passed both backends; traversal flat                                                                        |
| Attribute layout           | Canonical compact shared records, captured copying operations and checked exposure barriers                                         | Traversal flat; rejected                                                                                                       |
| Combined candidate         | Wrapper allocation plus lazy grammar and extended CSS compilation data                                                              | Mixed parsing results, small cold difference; rejected                                                                         |

No unused experimental helper, generic loader, build transform, alternate tree representation or constructor bypass was added to production. Candidate source variants are preserved under `.cache/qualification/interface-copy/variants`, with per-candidate package hashes, measurements, stderr and failure records.

## What the traces establish

TurboDOM 0.7.1 retains immutable parsed storage and materializes wrappers on demand. RunDOM preserves independent mutable raw records for every exposed document. TurboDOM also reuses module-level public interfaces and cached public computed-style objects; RunDOM's existing contracts require separate Window-local public constructors/functions and fresh readonly computed snapshots. The relevant pinned sources and earlier stage comparisons remain documented in [cold role and traversal results](role-traversal-optimization-results.md).

Fresh CPU profiles still locate cold role costs in CSS module compilation/loading, declaration normalization, private declaration-interface initialization and public declaration-view creation. The first-use profile is separate from provider loading and scenario setup. Deferring CSS-tree grammar descriptors does not remove the larger normalization and declaration-accessor work. Warm role queries continue paying public declaration access and Testing Library's matching/accessibility work.

Dense traversal still pays Window interface construction, independent tree copying, wrapper allocation and native `markAsUncloneable`, followed by checked collection/attribute reads. Copying fewer attribute objects did not improve the complete workload. Timing a copying kernel alone would have selected the wrong implementation. Diagnostic profile self/inclusive times and stage traces are retained; overlapping inclusive times are not added or treated as independent benchmark savings.

The unshipped wrapper candidate's final broad guards were mixed or flat: update 13.891 → 12.604 ms, sparse parsing 8.193 → 8.554 ms, unique parsing 32.646 → 32.463 ms, inline style mutation 5.022 → 5.278 ms, stylesheet mutation 3.361 → 3.413 ms. Earlier sparse measurements varied substantially despite identical Window implementation bytes. These checks do not establish a broad speedup.

TurboDOM failed the stylesheet-rule mutation scenario with `Expected CSSStyleRule`; its failed row is retained and excluded. The final stylesheet guard therefore compared verified RunDOM variants only. Final memory/profile workers and all canonical timing workers completed their checks. Memory results concern transient create/close workloads, not eight simultaneously live documents; no new memory improvement is claimed.

## Compatibility and evidence

The added regression cases cover cross-Window CSS accessor identity/descriptors and borrowed receivers, cold/repeated diverse CSS grammars and invalid writes, mixed/nested template topology, first-write attribute changes, reentrant value coercion with observer old values, and all 19 candidate leaf interfaces' prototypes, events, clone/import and adoption. They run against the unchanged production implementation; applicable paired examples also run against upstream jsdom.

Acceptance results and artifact hashes are recorded in `.cache/qualification/interface-copy`. No new runtime was released, so the previous sealed default/native API, standards, native-corpus and packed Vitest qualification remains the runtime qualification. The selected standards replay has 10,598 selected fixtures, 5,460 executed and 5,138 pending, with known failures explicitly preserved; this batch does not claim complete WPT coverage or inherit an unqualified universal compatibility percentage.

The source/evidence archive paths, hashes, raw report index, baseline runtime identity proof and final acceptance results are in `.cache/qualification/interface-copy/sealed-manifest.json`. The rejected candidate is separately identified in `leaf-final-prepared.json`; it must not be confused with the unchanged release cohort.
