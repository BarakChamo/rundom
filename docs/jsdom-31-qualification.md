# RunDOM qualification against jsdom 31.0.1

November 22, 2026. The upstream reference was jsdom 31.0.1 at `b76da26fd3b2786771b493f0bbec8dbd7a3d36d0`. The RunDOM source measured here is commit `6c7b84f` on the qualification branch. Happy DOM was 21.0.4 and TurboDOM was 0.7.1. The version-matched npm release is held because named upstream Web Platform Test assertions still fail.

## Observable behavior

In the browser-facing DOM, assigning `element.inert = true` adds the boolean HTML attribute and prevents focus inside that subtree. Chromium confirmed both behaviors. The jsdom facade reproduces jsdom 31.0.1, which lacks the prototype accessor. Assigning the property in that environment creates an ordinary JavaScript property and leaves serialized HTML unchanged. Svelte marks elements inert during an outro, then compares their HTML while the transition is pending. Reflection added an unexpected `inert=""` in those assertions. The facade also lets Svelte install its own `matchMedia` implementation, as it can on jsdom. [HTML inert subtrees](https://html.spec.whatwg.org/multipage/interaction.html#inert-subtrees)

Both entry points now return a fresh, live, read-only declaration from `getComputedStyle`. A reference retained across an inline color change reads the new color. Code that needs the original value can save `style.color` before changing the DOM. Property access resolves lazily and can reuse an immutable internal cascade result while its dependencies hold. Detachment, adoption and window teardown have separate tests. An earlier trace recorded 498 style lookups in Ant Design and 52,849 in Material UI Autocomplete. Zero lookups on retained views followed a recorded tree or focus change. This telemetry excludes CSSOM-only mutations. [CSSOM computed style](https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle)

## Compatibility

The default and Rust-selected backends each passed the same 672 named upstream API tests and skipped the same one as jsdom. The initial candidate had 24 API failures. All 1,781 legacy jsdom tests selected from the root and three DOM levels passed on both providers. The packed alias passed all 11 tests in each of four Vitest pool configurations. A fresh local npm install using the packed facade as `jsdom` verified ESM and CommonJS imports, inert behavior and live styles.

The repository check still reports nine failures in 1,643 facade tests. All nine were reproducible in the jsdom reference half of paired contracts. The differences concern background resets, border serialization, grid-track arithmetic and stylesheet imports. The RunDOM half retains the older expected behavior. These are observable compatibility gaps.

| Project selection (pass / fail / skipped)       | RunDOM         | jsdom          | Happy DOM       | TurboDOM      |
| ----------------------------------------------- | -------------- | -------------- | --------------- | ------------- |
| Svelte runtime-runes, runtime-legacy and motion | 6074 / 28 / 34 | 6073 / 29 / 34 | 5823 / 279 / 34 | 0 / 0 / 0     |
| Vue runtime-dom                                 | 265 / 5 / 1    | 265 / 5 / 1    | 251 / 19 / 1    | 169 / 32 / 1  |
| Material UI, five components                    | 430 / 0 / 39   | 430 / 0 / 39   | 454 / 8 / 7     | 181 / 281 / 7 |
| Ant Design, eight files                         | 133 / 0 / 0    | 133 / 0 / 0    | 128 / 5 / 0     | 121 / 12 / 0  |
| Material UI Autocomplete                        | 348 / 0 / 13   | 348 / 0 / 13   | 359 / 1 / 1     | 309 / 51 / 1  |
| Next.js with-vitest example                     | 5 / 0 / 0      | 5 / 0 / 0      | 5 / 0 / 0       | 5 / 0 / 0     |

Svelte had 64 RunDOM-only failures in the initial comparison. In the final results, every case passing on jsdom also passed on RunDOM. Vue and the five Material UI components also retained every jsdom pass. Frameworks can conditionally run different tests based on provider capabilities. [Full project artifacts](https://github.com/BarakChamo/rundom/actions/runs/45021909494)

| Additional selection                       | RunDOM        | jsdom              |
| ------------------------------------------ | ------------- | ------------------ |
| React                                      | 64 / 0 / 0    | 64 / 0 / 0         |
| Supabase UI                                | 85 / 0 / 0    | 85 / 0 / 0         |
| freeCodeCamp                               | 4 / 0 / 0     | 4 / 0 / 0          |
| Drone                                      | 1 / 0 / 0     | suite setup failed |
| Mozilla Readability, full Mocha invocation | 1,984 / 0 / 0 | 1,984 / 0 / 0      |

Drone’s older Jest environment calls `virtualConsole.sendTo` during setup. RunDOM provides that legacy method, and installed jsdom 31.0.1 throws before its first assertion. Readability was rerun on the final executable using its complete upstream Mocha test selection. Scully was outside this qualification run. [Additional project artifacts](https://github.com/BarakChamo/rundom/actions/runs/45022135854)

### Web Platform Tests

| Measure                                             | Upstream WPT | jsdom-local WPT |
| --------------------------------------------------- | ------------ | --------------- |
| Files returning upstream reference harness records  | 6,738        | 475             |
| Assertions passing on jsdom                         | 235,917      | 5,260           |
| Passing on both                                     | 219,852      | 4,283           |
| jsdom pass, RunDOM nonpassing                       | 15,431       | 977             |
| jsdom pass, RunDOM record missing                   | 634          | 0               |
| jsdom nonpassing, RunDOM pass                       | 4,507        | 1               |
| RunDOM pass with no corresponding jsdom record      | 15,444       | 0               |
| Previously clean file harnesses losing clean status | 73           | 7               |

The upstream harness uses jsdom’s pinned WPT revision `2971340498805350babb6c167e0df98eaa380f98`. The comparison joins file, subtest name and occurrence within that file. Upstream marked 4,980 files pending. The largest remaining deficits by count of reference-passing assertions were css/css-color (3,615), css/css-fonts (1,747), css/css-values (1,626), css/css-view-transitions (1,055), css/css-anchor-position (1,037), css/css-gaps (857). Focused runs passed all 6,711 assertions in the selected anchor-positioning files, 2,330 across two gradient files and 590 in the local tabIndex file. [Reference shards](https://github.com/BarakChamo/rundom/actions/runs/45018050358) · [Candidate and local shards](https://github.com/BarakChamo/rundom/actions/runs/45021909494)

A minimal connected, unstyled paragraph also isolates an enumeration gap. The retained declaration reports 3 indexed properties in RunDOM and 544 in jsdom. Reading those 544 properties by name produced 205 equal values and 339 differences. For example, jsdom returns auto for accent-color and RunDOM returns an empty string. Both returned the same resolved color after an inline edit and length zero after detachment. Matching live mutation behavior still leaves a substantial property coverage and enumeration gap.

The largest single failing file contains 845 relative-color assertions that pass upstream. For example, RunDOM drops the inline declaration `rgb(from rebeccapurple 20% g b / alpha)` and computes black. jsdom computes `color(srgb 0.2 0.2 0.6)`. A direct probe of the bundled color resolver produced the correct computed value but an empty specified-value serialization. The declaration is lost before the cascade can use that resolver. This identifies specified-value admission and serialization as the first repair point for this group.

## End-to-end throughput and memory

Fresh Ubuntu 24.04 GitHub-hosted VMs ran two rounds in reverse orders. Physical host exclusivity was unverified. Each command started Vitest with one worker and cold runner caches. Each cell gives completed project commands per minute, then peak MiB. Throughput pools the two rounds. Peak is the higher sampled sum of RSS across all simultaneous process groups, at 250 ms intervals. The sum can count shared pages multiple times. This measures peak process memory rather than retained heap after garbage collection.

### Full project selections

| Project                  | Concurrent | RunDOM       | jsdom        | Happy DOM            | TurboDOM             |
| ------------------------ | ---------- | ------------ | ------------ | -------------------- | -------------------- |
| Ant Design               | 1          | 3.91 · 705   | 3.19 · 725   | failed qualification | failed qualification |
| Ant Design               | 2          | 6.53 · 1,398 | 5.33 · 1,437 | failed qualification | failed qualification |
| Ant Design               | 4          | 7.75 · 2,783 | 6.34 · 2,895 | failed qualification | failed qualification |
| Material UI Autocomplete | 1          | 3.99 · 913   | 3.38 · 1,147 | failed qualification | failed qualification |
| Material UI Autocomplete | 2          | 6.66 · 1,953 | 5.65 · 2,322 | failed qualification | failed qualification |
| Material UI Autocomplete | 4          | 7.35 · 3,732 | 6.23 · 4,627 | failed qualification | failed qualification |

The full selection required identical file, name and outcome records to jsdom. Happy DOM and TurboDOM failed the single-command screen on both selections. [Runner and raw measurements](https://github.com/BarakChamo/rundom/actions/runs/45021909494)

### Identical passing subsets across four providers

| Project                  | Concurrent | RunDOM        | jsdom         | Happy DOM     | TurboDOM             |
| ------------------------ | ---------- | ------------- | ------------- | ------------- | -------------------- |
| Ant Design               | 1          | 4.16 · 689    | 3.35 · 725    | 3.98 · 707    | 4.57 · 678           |
| Ant Design               | 2          | 6.75 · 1,383  | 5.43 · 1,434  | 6.51 · 1,389  | 7.24 · 1,337         |
| Ant Design               | 4          | 7.65 · 2,770  | 6.27 · 2,887  | 7.35 · 2,800  | 8.29 · 2,647         |
| Material UI Autocomplete | 1          | 6.09 · 933    | 5.53 · 1,101  | 4.94 · 1,081  | failed qualification |
| Material UI Autocomplete | 2          | 10.45 · 1,764 | 9.29 · 2,236  | 8.54 · 2,203  | failed qualification |
| Material UI Autocomplete | 4          | 12.52 · 3,700 | 10.97 · 4,477 | 10.23 · 4,321 | failed qualification |

The screen required identical passing file and test names, including duplicate-name multiplicities. Ant Design selected 116 tests and Material UI selected 301. TurboDOM failed one Material UI focus assertion and therefore has no qualifying timing on that selection. [Runner and raw measurements](https://github.com/BarakChamo/rundom/actions/runs/45022784097)

### Material UI complete test groups

| Concurrent commands | RunDOM        | jsdom         | Happy DOM     | TurboDOM      |
| ------------------- | ------------- | ------------- | ------------- | ------------- |
| 1                   | 7.42 · 814    | 6.60 · 894    | 6.60 · 922    | 8.88 · 741    |
| 2                   | 12.12 · 1,681 | 10.41 · 1,842 | 10.80 · 1,938 | 14.01 · 1,500 |
| 4                   | 13.72 · 3,436 | 11.99 · 3,609 | 12.52 · 3,839 | 16.71 · 3,022 |

This independent Autocomplete selection keeps the 28 entire top-level test groups with identical original outcomes on every provider. Together they contain 117 passing cases. Each timed command must reproduce the complete passing set and exit successfully. Cells give commands per minute and peak MiB. [Runner and raw measurements](https://github.com/BarakChamo/rundom/actions/runs/45023384979)

### Other project commands

| Project (seconds · max process RSS in MiB) | RunDOM      | jsdom       | Happy DOM   | TurboDOM   |
| ------------------------------------------ | ----------- | ----------- | ----------- | ---------- |
| Svelte                                     | 61.05 · 599 | 66.52 · 542 | 55.05 · 538 | 9.86 · 421 |
| Vue runtime-dom                            | 4.94 · 446  | 9.42 · 497  | 6.58 · 466  | 4.20 · 412 |
| Material UI, five components               | 12.24 · 406 | 14.14 · 394 | 13.10 · 469 | 7.54 · 470 |

Each figure is one command. Linux time reports the maximum RSS for a process in the command, which differs from the concurrent process-group sum above. The pass counts qualify these timings. TurboDOM collected zero Svelte tests. RunDOM used about 57 MiB more than jsdom in Svelte and 12 MiB more across the five Material UI components. RunDOM also finished those two selections sooner. [Raw project timing](https://github.com/BarakChamo/rundom/actions/runs/45021909494)

### Next.js example and Mozilla Readability

| Wall seconds for each local command | RunDOM      | jsdom        | Happy DOM   | TurboDOM    |
| ----------------------------------- | ----------- | ------------ | ----------- | ----------- |
| Next.js with-vitest, two rounds     | 3.86 / 6.99 | 18.04 / 8.81 | 8.30 / 5.02 | 4.27 / 4.04 |

| Wall seconds · max process RSS in MiB | RunDOM      | jsdom       |
| ------------------------------------- | ----------- | ----------- |
| Mozilla Readability, one command      | 45.41 · 537 | 98.31 · 646 |

These local runs include startup and process exit. The shared development host had variable load, particularly on the Next.js examples. They establish case coverage and illustrate the observed range. Use the paired Linux runs above for concurrent throughput comparisons.

### Packed React and Testing Library

| Vitest pool | RunDOM           | jsdom            | Happy DOM        | TurboDOM             |
| ----------- | ---------------- | ---------------- | ---------------- | -------------------- |
| forks       | 1.45 · 294 · 121 | 2.47 · 356 · 167 | 1.76 · 226 · 120 | failed qualification |
| threads     | 1.36 · 279 · 176 | 2.09 · 325 · 209 | 1.65 · 220 · 178 | failed qualification |
| vmForks     | 1.90 · 359 · 139 | 2.63 · 358 · 161 | 2.04 · 257 · 130 | failed qualification |
| vmThreads   | 2.08 · 474 · 173 | 3.10 · 367 · 208 | 2.24 · 266 · 183 | failed qualification |

Each cell gives median end-to-end seconds, test-body milliseconds and sampled worker RSS in MiB for eight identical React and Testing Library workflows. The local Apple silicon host ran nine rounds with fresh Vitest processes, one worker and disabled runner caches. Worker RSS is a different metric from the Linux aggregate peak. TurboDOM produced no qualifying median. Reproduce with `node scripts/benchmark-framework.mjs --include-turbo`.

### Memory diagnosis

In a separate four-command Material UI trace, eight Node processes together used about 4,005 MiB RSS at the highest sampled point. V8 reported 2,477 MiB heap capacity and 1,022 MiB used heap. Unused heap capacity accounts for a substantial part of residency. Prior forced-GC tests also isolated a retention bug in caches that stored short slices of long input strings. Copying admitted keys fixed those GC tests. The earlier four-command comparison moved Ant Design RSS down 13 MiB and Material UI up 90 MiB, so the workload evidence does not support attributing the historical peak increase solely to string retention. [Memory trace](https://github.com/BarakChamo/rundom/actions/runs/45017927564) · [Cache comparison](https://github.com/BarakChamo/rundom/actions/runs/45017173439)
