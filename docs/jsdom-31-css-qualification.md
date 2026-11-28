# CSS compatibility and project benchmarks against jsdom 31.0.1

The subsequent CSS Values qualification covers attribute substitution, conditional values, typed calculations and their effect on real projects. [Updated benchmark and compatibility results](./jsdom-31-css-values-qualification.md)

November 22, 2026. RunDOM commit `2af947b`, jsdom 31.0.1, Happy DOM 21.0.4, TurboDOM 0.7.1. The WPT revision was `2971340498805350babb6c167e0df98eaa380f98`. [Qualification and full runs](https://github.com/BarakChamo/rundom/actions/runs/45029425185) · [Matched four-provider runs](https://github.com/BarakChamo/rundom/actions/runs/45029432086)

## Compatibility

The relative-color setter accepts and serializes `rgb(from rebeccapurple 20% g b / alpha)` and computes `color(srgb 0.2 0.2 0.6)`. On a connected plain paragraph every one of the 544 indexed names, its order and its resolved value matched. Live mutations, custom properties, detachment and registered properties have dedicated tests. Extended grammar and CSS value serialization now use pinned, lazily loaded internals from jsdom. Installing RunDOM therefore also installs the upstream jsdom dependency tree. [Upstream release](https://github.com/jsdom/jsdom/releases/tag/v31.0.1)

| Suite           | Files observed | jsdom passes | Also pass | Fail on RunDOM | Missing on RunDOM | RunDOM passes a jsdom failure | Harness pass losses |
| --------------- | -------------- | ------------ | --------- | -------------- | ----------------- | ----------------------------- | ------------------- |
| Upstream WPT    | 6738           | 235917       | 229754    | 6093           | 70                | 4105                          | 66                  |
| jsdom local WPT | 475            | 5260         | 4494      | 766            | 0                 | 1                             | 7                   |

The earlier qualification matched 219,852 of the 235,917 upstream passing assertions. This build matches 229,754, a net gain of 9,902. There are 6,163 reference passes outstanding.

Compared by file, test name and occurrence number. Counts of additional passes exclude tests observed on only one provider. The harness column counts files whose harness completed successfully on jsdom but did not on RunDOM.

| Largest remaining area        | jsdom passes still missing or failing |
| ----------------------------- | ------------------------------------- |
| css/css-values                | 1583                                  |
| css/selectors                 | 248                                   |
| css/css-fonts                 | 244                                   |
| css/cssom                     | 192                                   |
| css/css-color                 | 191                                   |
| css/css-properties-values-api | 187                                   |
| css/css-backgrounds           | 167                                   |
| css/css-masking               | 160                                   |

| Largest individual file                                      | jsdom passes still missing or failing |
| ------------------------------------------------------------ | ------------------------------------- |
| css/css-values/if-conditionals.html                          | 192                                   |
| css/css-values/attr-all-types.html                           | 161                                   |
| css/selectors/attribute-selectors/attribute-case/syntax.html | 72                                    |
| css/filter-effects/parsing/filter-computed.html              | 72                                    |
| css/css-values/acos-asin-atan-atan2-serialize.html           | 62                                    |
| css/css-pseudo/parsing/marker-supported-properties.html      | 61                                    |

The [per-file compatibility inventory](./jsdom-31-css-wpt-gaps.json) includes each upstream or jsdom-local file with an outstanding reference-pass difference or a lost harness completion. Raw named assertions are in the linked CI artifacts. [Pinned jsdom reference shards](https://github.com/BarakChamo/rundom/actions/runs/45018050358)

| Repaired WPT selections                    | jsdom passes | Also pass on RunDOM |
| ------------------------------------------ | ------------ | ------------------- |
| Relative color, specified/computed/invalid | 1863         | 1863                |
| CSS fonts                                  | 3341         | 3341                |
| Anchor positioning                         | 3022         | 3022                |
| Media queries                              | 1268         | 1268                |
| Grid, corner shape and animation ranges    | 576          | 576                 |
| Gap decorations                            | 304          | 304                 |

The repository check passed locally and on the Linux qualification runner. The default and Rust parser paths each matched all 672 named upstream API passes, zero failures and the same one pending test. Clean packed installs aliased as `jsdom` passed all 11 React/Vitest checks in each of four worker pools plus strict CommonJS, ESM and bundler type checks.

A local diagnostic used one stylesheet with an exposed CSSOM rule and one custom property. Before direct lookup, enumerating 544 fixed indices took 105 ms and collecting own keys took 145 ms. Afterward the same operations took 1 ms and 5 ms. This single-process diagnostic measures indexing cost. The project-level tables below measure the full workload.

Two minimal cases pinpoint a remaining failure in CSS value substitution. On a paragraph with `data-size="12"` and `--on:yes`, the computed width for `attr(data-size px, 4px)` is 12px on jsdom. The computed custom property for `if(style(--on: yes): pass; else: fail)` is pass. RunDOM returns the original function text in both cases. Attribute-dependent values also require invalidation on attribute changes and preservation of attribute taint into URL contexts.

To reproduce the pass comparison, run `node scripts/compare-wpt.mjs` with one `--reference path/to/subtests.jsonl` argument per reference shard and one `--candidate path/to/subtests.jsonl` per candidate shard. Run the jsdom-local files separately. The command emits JSON and exits nonzero for a missing reference file, a lost reference pass, or a lost successful harness. Identical repeat notifications are counted once.

## Real projects

| Project (pass/fail/skipped · seconds · max process MiB) | RunDOM                   | jsdom                    | Happy DOM                 | TurboDOM                | jsdom pass losses |
| ------------------------------------------------------- | ------------------------ | ------------------------ | ------------------------- | ----------------------- | ----------------- |
| Svelte runtime-runes, runtime-legacy and motion         | 6074/28/34 · 54.9s · 593 | 6073/29/34 · 53.9s · 546 | 5823/279/34 · 49.1s · 538 | 0/0/0 · 9.1s · 430      | 0                 |
| Vue runtime-dom                                         | 265/5/1 · 5.0s · 452     | 265/5/1 · 9.3s · 503     | 251/19/1 · 6.5s · 459     | 169/32/1 · 4.1s · 414   | 0                 |
| Material UI, five components                            | 430/0/39 · 17.0s · 398   | 430/0/39 · 19.6s · 394   | 454/8/7 · 17.0s · 448     | 181/281/7 · 10.0s · 464 | 0                 |

Each project figure is one command. Conditional tests and setup failures affect how many assertions a provider executes. Timing from a partial run does not establish comparable throughput.

### Additional downstream selections

| Downstream selection (pass/fail/skipped · seconds · max process MiB) | RunDOM              | jsdom                | jsdom pass losses |
| -------------------------------------------------------------------- | ------------------- | -------------------- | ----------------- |
| Supabase UI                                                          | 85/0/0 · 9.4s · 196 | 85/0/0 · 14.5s · 215 | 0                 |
| React                                                                | 64/0/0 · 8.0s · 739 | 64/0/0 · 2.1s · 501  | 0                 |
| freeCodeCamp                                                         | 4/0/0 · 1.8s · 171  | 4/0/0 · 2.3s · 208   | 0                 |
| Drone                                                                | 1/0/0 · 5.9s · 614  | suite setup failed   | 0                 |

Drone uses the legacy virtualConsole.sendTo API. Its pinned test selection fails during environment setup on jsdom 31.0.1. [Additional project artifacts](https://github.com/BarakChamo/rundom/actions/runs/45029561466)

| Complete local Mocha selection (passes · seconds · max process MiB) | RunDOM               | jsdom                |
| ------------------------------------------------------------------- | -------------------- | -------------------- |
| Mozilla Readability                                                 | 1,984 · 39.83s · 523 | 1,984 · 71.35s · 821 |

| Next.js with-vitest example (seconds · max process MiB per round) | RunDOM                    | jsdom                      | Happy DOM                 | TurboDOM                  |
| ----------------------------------------------------------------- | ------------------------- | -------------------------- | ------------------------- | ------------------------- |
| 5/5 passing on each command                                       | 5.76s · 108 / 4.92s · 114 | 9.90s · 153 / 11.20s · 156 | 7.46s · 115 / 8.06s · 113 | 6.00s · 108 / 5.23s · 104 |

The Next.js results cover its example application. Readability and Next.js ran on the shared development machine. The paired concurrent tests below ran on separate fresh Linux VMs.

## Concurrent throughput and peak RSS

Each project ran on a fresh GitHub-hosted Ubuntu VM. Each cell gives completed commands per minute and the larger of the two sampled aggregate RSS peaks in MiB. Rounds used opposite provider orders, cold runner caches and one Vitest worker per command. The denominator is the sum of both elapsed times. The 250 ms RSS sampler sums simultaneous process groups and may count shared pages more than once. Physical host exclusivity was unverified. A dash means the provider missed the required test outcomes or failed to complete.

### Full project selections

| Project                  | Concurrent | RunDOM        | jsdom        | Happy DOM | TurboDOM |
| ------------------------ | ---------- | ------------- | ------------ | --------- | -------- |
| Ant Design               | 1          | 5.65 · 713    | 5.00 · 723   | —         | —        |
| Ant Design               | 2          | 9.29 · 1,429  | 8.21 · 1,443 | —         | —        |
| Ant Design               | 4          | 10.83 · 2,821 | 9.63 · 2,866 | —         | —        |
| Material UI Autocomplete | 1          | 4.37 · 1,019  | 4.07 · 1,156 | —         | —        |
| Material UI Autocomplete | 2          | 7.42 · 2,075  | 6.76 · 2,351 | —         | —        |
| Material UI Autocomplete | 4          | 8.44 · 4,153  | 7.58 · 4,645 | —         | —        |

### Shared passing subsets

| Project                  | Concurrent | RunDOM        | jsdom         | Happy DOM     | TurboDOM      |
| ------------------------ | ---------- | ------------- | ------------- | ------------- | ------------- |
| Ant Design               | 1          | 3.99 · 724    | 3.43 · 712    | 4.10 · 704    | 4.72 · 674    |
| Ant Design               | 2          | 6.59 · 1,421  | 5.68 · 1,440  | 6.77 · 1,393  | 7.69 · 1,328  |
| Ant Design               | 4          | 7.81 · 2,802  | 6.76 · 2,891  | 8.02 · 2,805  | 9.11 · 2,652  |
| Material UI Autocomplete | 1          | 10.19 · 873   | 9.57 · 902    | 9.77 · 911    | 12.69 · 727   |
| Material UI Autocomplete | 2          | 17.21 · 1,749 | 15.75 · 1,791 | 16.00 · 1,853 | 21.14 · 1,498 |
| Material UI Autocomplete | 4          | 20.52 · 3,516 | 18.86 · 3,620 | 19.84 · 3,806 | 26.29 · 3,027 |

The shared Ant Design cohort contains 116 tests. Material UI uses 117 tests in 28 complete Autocomplete groups. The full selections require the jsdom outcome set. The shared selections require identical passing cases across all participants.

The release remains gated on the outstanding compatibility differences. [Earlier qualification](./jsdom-31-qualification.md)
