# Latest completed RunDOM checks

Latest source `3e17e2f` matched 5,056 of 5,260 jsdom-local WPT assertions across 475 fixtures. All 241 reference CSS Values assertions matched. The source passed all 15 repository checks, the 672 jsdom API tests that ran, four Vitest pools using the packed jsdom alias, and the packed TypeScript checks. [Qualification](https://github.com/BarakChamo/rundom/actions/runs/45089244215)

## Svelte

At `3e17e2f`, RunDOM lost 0 named jsdom passes. Counts are passing, failing and skipped assertions. [Run](https://github.com/BarakChamo/rundom/actions/runs/45089244215)

| Provider  | Passed | Failed | Skipped | Wall (s) | Peak RSS (MiB) |
| --------- | -----: | -----: | ------: | -------: | -------------: |
| RunDOM    |   6074 |     28 |      34 |    72.55 |          535.9 |
| jsdom     |   6073 |     29 |      34 |    71.19 |          851.6 |
| Happy DOM |   5823 |    279 |      34 |    62.47 |          530.0 |
| TurboDOM  |      0 |      0 |       0 |    12.14 |          421.6 |

TurboDOM failed during setup in all nine Svelte suites.

## Matched performance

At `3e17e2f`, each cell gives completed commands per minute / peak aggregate RSS in MiB, across two opposite-order rounds. Each command had to pass the same 116 Ant Design tests or 117 Material UI Autocomplete tests. [Benchmark](https://github.com/BarakChamo/rundom/actions/runs/45089250939)

| Project | Concurrency |         RunDOM |          jsdom |      Happy DOM |       TurboDOM |
| ------- | ----------: | -------------: | -------------: | -------------: | -------------: |
| antd    |           1 |   4.03 / 746.0 |   3.84 / 737.8 |   4.59 / 702.1 |   5.14 / 676.5 |
| antd    |           2 |  6.55 / 1483.6 |  6.33 / 1467.5 |  7.53 / 1386.9 |  8.33 / 1338.4 |
| antd    |           4 |  7.65 / 2983.8 |  7.47 / 2910.1 |  8.78 / 2778.2 |  9.84 / 2654.2 |
| mui     |           1 |   9.02 / 961.0 |   9.98 / 889.6 |   9.78 / 916.2 |  13.05 / 741.4 |
| mui     |           2 | 15.21 / 1918.8 | 16.60 / 1801.1 | 16.65 / 1872.6 | 22.14 / 1486.6 |
| mui     |           4 | 17.91 / 3887.2 | 19.47 / 3665.7 | 19.71 / 3803.2 | 26.69 / 3032.9 |

## Final-source framework results

Each row uses the same pinned repository revision for all four providers. Counts are passing/failing/skipped, followed by wall seconds and peak process RSS in MiB.

| Project |                       RunDOM |                        jsdom |                     Happy DOM |                   TurboDOM | Lost jsdom passes |
| ------- | ---------------------------: | ---------------------------: | ----------------------------: | -------------------------: | ----------------: |
| vue     |     265/5/1 · 6.44 s · 484.0 |     265/5/1 · 8.99 s · 483.1 |     251/19/1 · 6.34 s · 465.4 |  169/32/1 · 4.05 s · 417.9 |                 0 |
| mui     |   430/0/39 · 19.71 s · 516.0 |   430/0/39 · 18.70 s · 395.2 |     454/8/7 · 16.57 s · 447.3 | 181/281/7 · 9.96 s · 462.2 |                 0 |
| svelte  | 6074/28/34 · 72.55 s · 535.9 | 6073/29/34 · 71.19 s · 851.6 | 5823/279/34 · 62.47 s · 530.0 |    0/0/0 · 12.14 s · 421.6 |                 0 |

## Final-source jsdom-local gaps

204 named assertions remain. The counts below group them by fixture.

| Fixture                                                                                                 | Outstanding |
| ------------------------------------------------------------------------------------------------------- | ----------: |
| css/cssom/CSSStyleDeclaration-authored-shorthands.html                                                  |           9 |
| css/css-cascade/logical-property-cascade.html                                                           |           7 |
| css/css-animations/trigger-shorthand-serialization.tentative.html                                       |           6 |
| css/css-color-adjust/embedding-color-scheme-invalidation.html                                           |           6 |
| css/cssom/internal-css-environment.html                                                                 |           6 |
| css/css-anchor-position/container-queries/anchored-fallback-complete-values.html                        |           5 |
| css/cssom/adoptedstylesheets-bindings.html                                                              |           5 |
| css/css-color/rgb-hsl-argument-contexts.html                                                            |           4 |
| css/css-text-decor/text-decoration-currentcolor-serialization.html                                      |           4 |
| css/cssom/CSSStyleDeclaration-shorthand-invalidation.html                                               |           4 |
| css/cssom/getComputedStyle-outline-text-colors.html                                                     |           4 |
| css/cssom/style-attribute-property-roundtrip.html                                                       |           4 |
| html/browsers/browsing-the-web/scroll-to-fragid/target-selector-state.html                              |           4 |
| html/rendering/widgets/form-control-default-styles.html                                                 |           4 |
| html/semantics/scripting-1/the-script-element/dynamic-script-preparation-document.html                  |           4 |
| html/webappapis/scripting/reporterror-throwing-values.html                                              |           4 |
| css/css-backgrounds/computed-logical-position.html                                                      |           3 |
| css/css-lists/marker-default-namespace.html                                                             |           3 |
| css/css-pseudo/before-after-content-normal.html                                                         |           3 |
| css/css-pseudo/marker-content-display.html                                                              |           3 |
| css/css-shapes/polygon-rounding-radius.html                                                             |           3 |
| css/css-syntax/inline-declaration-boundaries.html                                                       |           3 |
| css/css-ui/caret-auto-used-value.html                                                                   |           3 |
| css/css-variables/custom-property-name-strings.html                                                     |           3 |
| css/css-variables/substitution-contexts.html                                                            |           3 |
| css/cssom/declaration-serialization-after-mutation.html                                                 |           3 |
| css/cssom/optional-component-serialization.tentative.html                                               |           3 |
| css/cssom/registered-initial-url-base.tentative.html                                                    |           3 |
| css/cssom/style-rule-declaration-parsing.html                                                           |           3 |
| css/selectors/pseudo-element-logical-matching.tentative.html                                            |           3 |
| html/interaction/focus/processing-model/blur-non-focusable.html                                         |           3 |
| html/interaction/focus/processing-model/focus-fixup.html                                                |           3 |
| html/semantics/document-metadata/stylesheet-import-load-events.tentative.html?link                      |           3 |
| svg/styling/default-link-focus-styles.html                                                              |           3 |
| svg/styling/user-agent-styles.html                                                                      |           3 |
| css/css-anchor-position/anchor-size-declaration-context.html                                            |           2 |
| css/css-animations/keyframe-important-declarations.html                                                 |           2 |
| css/css-backgrounds/background-position-shorthand-longhands.html                                        |           2 |
| css/css-cascade/namespace-attribute-case.html                                                           |           2 |
| css/css-cascade/stylesheet-selector-matching.html                                                       |           2 |
| css/css-color/currentcolor-function-inheritance.html                                                    |           2 |
| css/css-shadow/query-shadow-host.html                                                                   |           2 |
| css/css-syntax/eof-recovery-serialization.html                                                          |           2 |
| css/css-variables/computed-token-spelling.html                                                          |           2 |
| css/cssom/CSSStyleDeclaration-property-name-case.html                                                   |           2 |
| css/cssom/media-rule-matches-lifecycle.html                                                             |           2 |
| css/cssom/stylesheet-add-rule-replace-lock.html                                                         |           2 |
| css/cssom/stylesheet-declaration-access.html                                                            |           2 |
| css/selectors/dir-slotted-native-nodes.html                                                             |           2 |
| css/selectors/invalidation/media-state-computed-style.html                                              |           2 |
| html/browsers/browsing-the-web/navigating-across-documents/abort-descendant-requests.html               |           2 |
| html/rendering/non-replaced-elements/heading-level-default-styles.html                                  |           2 |
| html/semantics/embedded-content/the-iframe-element/initial-blank-event-listeners.html                   |           2 |
| html/semantics/scripting-1/the-script-element/script-url-error-after-stop.html                          |           2 |
| jsdom-only/css-feature-scope.html                                                                       |           2 |
| jsdom-only/css-substitution-limits.html                                                                 |           2 |
| css/css-backgrounds/border-style-none.html                                                              |           1 |
| css/css-backgrounds/long-image-urls.html                                                                |           1 |
| css/css-cascade/layer-order-media-changes.html                                                          |           1 |
| css/css-cascade/rule-candidate-selection.html                                                           |           1 |
| css/css-conditional/container-query-feature-context.html                                                |           1 |
| css/css-pseudo/marker-default-cascade.html                                                              |           1 |
| css/css-syntax/comments-and-preserved-source.html                                                       |           1 |
| css/css-syntax/declaration-bad-string-boundary.html                                                     |           1 |
| css/css-variables/computed-token-comments.tentative.html                                                |           1 |
| css/css-variables/custom-setter-root-whitespace.tentative.html                                          |           1 |
| css/css-variables/registered-computed-live.html                                                         |           1 |
| css/cssom/adopted-stylesheet-mutation.html                                                              |           1 |
| css/cssom/box-shadow-initial-color.tentative.html                                                       |           1 |
| css/cssom/computed-url-stylesheet.html                                                                  |           1 |
| css/cssom/declaration-lookup-order.html                                                                 |           1 |
| css/cssom/getComputedStyle-nested-pseudo.tentative.html                                                 |           1 |
| css/cssom/page-declaration-order.html                                                                   |           1 |
| css/cssom/selector-serialization-namespaces.html                                                        |           1 |
| css/selectors/element-backed-pseudo-classes.tentative.html                                              |           1 |
| css/selectors/selectors-4/lang-023-dont-upstream.html                                                   |           1 |
| css/selectors/selectors-4/lang-024-dont-upstream.html                                                   |           1 |
| html/rendering/non-replaced-elements/default-stylesheet-namespace.html                                  |           1 |
| html/semantics/document-metadata/dynamic-stylesheet-does-not-block-script.html?parser-created           |           1 |
| html/semantics/scripting-1/the-script-element/parser-script-adopted-during-parsing.html                 |           1 |
| html/webappapis/dynamic-markup-insertion/closing-the-input-stream/iframe-load-after-document-close.html |           1 |

[Complete same-commit WPT and performance inventory](./jsdom-31-nov23-qualification.md)
