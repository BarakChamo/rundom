# RunDOM qualification against jsdom 31.0.1

November 23, 2026. Source commit `3e17e2f`. Named assertions are paired by file, name and occurrence. The comparison baseline is RunDOM `80b187b`. [Candidate and four-provider run](https://github.com/BarakChamo/rundom/actions/runs/45089244215) · [Matched concurrency run](https://github.com/BarakChamo/rundom/actions/runs/45089250939)

The reference is jsdom 31.0.1. Upstream covers 6,738 fixtures and jsdom-local covers 475. CSS Values rows are subsets. Recovered and new losses use the starting RunDOM revision as baseline. A harness completion and an individual assertion are counted separately.

## Compatibility

| Suite                  | jsdom passes | RunDOM matches | Outstanding | Recovered | New losses | RunDOM passes a jsdom non-pass | Lost harness completions |
| ---------------------- | ------------ | -------------- | ----------- | --------- | ---------- | ------------------------------ | ------------------------ |
| Upstream WPT           | 235917       | 235302         | 615         | 815       | 15         | 4049                           | 62                       |
| CSS Values             | 4176         | 4176           | 0           | 83        | 0          | 36                             | 0                        |
| jsdom-local WPT        | 5260         | 5056           | 204         | 235       | 6          | 1                              | 2                        |
| jsdom-local CSS Values | 241          | 241            | 0           | 15        | 0          | 0                              | 0                        |

### Largest remaining files

| Suite           | Fixture                                                                              | Outstanding named assertions |
| --------------- | ------------------------------------------------------------------------------------ | ---------------------------- |
| Upstream WPT    | css/css-shadow/part/pseudo-classes-after-part.html                                   | 13                           |
| Upstream WPT    | css/css-color/parsing/color-computed-powerless.html                                  | 7                            |
| Upstream WPT    | html/webappapis/dynamic-markup-insertion/opening-the-input-stream/active.window.html | 6                            |
| Upstream WPT    | css/cssom/overflow-serialization.html                                                | 6                            |
| Upstream WPT    | css/css-backgrounds/parsing/border-image-shorthand.sub.html                          | 6                            |
| jsdom-local WPT | css/cssom/CSSStyleDeclaration-authored-shorthands.html                               | 9                            |
| jsdom-local WPT | css/css-cascade/logical-property-cascade.html                                        | 7                            |
| jsdom-local WPT | css/css-color-adjust/embedding-color-scheme-invalidation.html                        | 6                            |
| jsdom-local WPT | css/cssom/internal-css-environment.html                                              | 6                            |
| jsdom-local WPT | css/css-animations/trigger-shorthand-serialization.tentative.html                    | 6                            |

[All outstanding named assertions](./jsdom-31-nov23-wpt-gaps.json)

## Real-project suite runs

| Project (passed/failed/skipped · wall · peak process MiB) | RunDOM                       | jsdom                        | Happy DOM                     | TurboDOM                   | jsdom passing tests lost |
| --------------------------------------------------------- | ---------------------------- | ---------------------------- | ----------------------------- | -------------------------- | ------------------------ |
| svelte                                                    | 6074/28/34 · 72.55 s · 535.9 | 6073/29/34 · 71.19 s · 851.6 | 5823/279/34 · 62.47 s · 530.0 | 0/0/0 · 12.14 s · 421.6    | 0                        |
| vue                                                       | 265/5/1 · 6.44 s · 484.0     | 265/5/1 · 8.99 s · 483.1     | 251/19/1 · 6.34 s · 465.4     | 169/32/1 · 4.05 s · 417.9  | 0                        |
| mui                                                       | 430/0/39 · 19.71 s · 516.0   | 430/0/39 · 18.70 s · 395.2   | 454/8/7 · 16.57 s · 447.3     | 181/281/7 · 9.96 s · 462.2 | 0                        |

Svelte covers runtime-runes, runtime-legacy and motion running in Node. Vue covers runtime-dom. Material UI covers Button, Checkbox, Dialog, Select and TextField. A project run includes startup and collection. TurboDOM failed to initialize all nine Svelte suites with a missing HTMLElement global. Its Svelte time is failed setup time. Happy DOM and TurboDOM completed different numbers of tests on the other projects.

## Matched end-to-end throughput and memory

Versions were jsdom 31.0.1, Happy DOM 21.0.4 and TurboDOM 0.7.1. Each Ant Design command must pass the same 116 named tests across Alert, Checkbox, Radio and Tag. Each Material UI command must pass the same 117 Autocomplete tests. RSS is the sum across the batch’s process groups sampled every 250 ms. It may miss peaks between samples. Framework tables above use the OS high-water mark for one process.

Each cell gives completed commands per minute and the highest sampled aggregate RSS in MiB. Throughput combines two rounds in opposite provider orders. An incomplete round shows its completion count. Runs at concurrency 2 and 4 include worker overlap in the RSS measurement. These measurements use hosted CI workers.

| Project | Concurrency | RunDOM         | jsdom          | Happy DOM      | TurboDOM       |
| ------- | ----------- | -------------- | -------------- | -------------- | -------------- |
| antd    | 1           | 4.03 · 746.0   | 3.84 · 737.8   | 4.59 · 702.1   | 5.14 · 676.5   |
| antd    | 2           | 6.55 · 1483.6  | 6.33 · 1467.5  | 7.53 · 1386.9  | 8.33 · 1338.4  |
| antd    | 4           | 7.65 · 2983.8  | 7.47 · 2910.1  | 8.78 · 2778.2  | 9.84 · 2654.2  |
| mui     | 1           | 9.02 · 961.0   | 9.98 · 889.6   | 9.78 · 916.2   | 13.05 · 741.4  |
| mui     | 2           | 15.21 · 1918.8 | 16.60 · 1801.1 | 16.65 · 1872.6 | 22.14 · 1486.6 |
| mui     | 4           | 17.91 · 3887.2 | 19.47 · 3665.7 | 19.71 · 3803.2 | 26.69 · 3032.9 |

## Scope of fixes

The CSS Values fixes cover typed substitution in attr() and if(), calculation dimensions and precision, URL token lists, and the lifetime of random values. Later qualification rounds also cover stylesheet registration descriptors, parser insertion and nested document.write(), cascade layer rollback, slotted and forwarded shadow parts, queued stylesheet events, computed display and URL bases. The source commit in each result identifies which changes it includes.

## Latest source

The latest source is 3e17e2f. Its local repository gate passed all 15 tasks. The jsdom API suite passed 672 tests with one pending. The jsdom-local CSS Values suite passed all 27 fixtures. The final URL change was checked against jsdom directly using both a retained computed style and a fresh read after a base change. [Final source](https://github.com/BarakChamo/rundom/commit/3e17e2f) · [Final WPT and real-project qualification](https://github.com/BarakChamo/rundom/actions/runs/45089244215) · [Final matched throughput and RSS](https://github.com/BarakChamo/rundom/actions/runs/45089250939)
