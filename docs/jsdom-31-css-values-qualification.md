# CSS Values qualification against jsdom 31.0.1

November 22, 2026. Candidate `a3e72f7`. Reference jsdom 31.0.1, Happy DOM 21.0.4 and TurboDOM 0.7.1. The starting RunDOM baseline was `2af947b`. [Candidate source](https://github.com/BarakChamo/rundom/tree/a3e72f7) · [Previous qualification](./jsdom-31-css-qualification.md)

## Compatibility

| Suite           | Files | jsdom passes | Also pass | Recovered since baseline | New losses since baseline | Fail | Missing | RunDOM passes a jsdom failure | Lost harness completions |
| --------------- | ----- | ------------ | --------- | ------------------------ | ------------------------- | ---- | ------- | ----------------------------- | ------------------------ |
| Upstream WPT    | 6738  | 235917       | 234301    | 4585                     | 38                        | 1574 | 42      | 4057                          | 73                       |
| jsdom-local WPT | 475   | 5260         | 4827      | 337                      | 4                         | 433  | 0       | 1                             | 7                        |

Assertions were paired by file, name and occurrence. A gain requires a previous mismatch on a jsdom-passing assertion. A new loss requires a previous RunDOM pass on a jsdom-passing assertion. Wins on jsdom failures are counted separately. The gap inventory identifies each remaining assertion by name and occurrence, including its status and whether the starting RunDOM baseline passed it.

### Effect of each committed change

| Change                                                                                                                                | Commit  | Upstream passes matched | jsdom-local passes matched |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------- | -------------------------- |
| [Previous measurement](https://github.com/BarakChamo/rundom/actions/runs/45029425185)                                                 | 2af947b | 229754                  | 4494                       |
| [Attribute and conditional substitution](https://github.com/BarakChamo/rundom/actions/runs/45031270109)                               | 585ffcf | 230282                  | 4594                       |
| [Typed CSS calculations](https://github.com/BarakChamo/rundom/actions/runs/45031723065)                                               | fee97f6 | 231223                  | 4597                       |
| [Global property registrations](https://github.com/BarakChamo/rundom/actions/runs/45032248195)                                        | 81df24d | 231398                  | 4621                       |
| [Pseudo-elements and rule rollback](https://github.com/BarakChamo/rundom/actions/runs/45032914235)                                    | e5bb525 | 231568                  | 4634                       |
| [Selector grammar, declarations and exception constants](https://github.com/BarakChamo/rundom/actions/runs/45034310114)               | ae137ee | 232085                  | 4668                       |
| [Typed dimensions, container axes and identifiers](https://github.com/BarakChamo/rundom/actions/runs/45035353061)                     | c27dc83 | 232199                  | 4703                       |
| [Function rules, font descriptors, shorthands and color grammar](https://github.com/BarakChamo/rundom/actions/runs/45036648460)       | 97e42ba | 233242                  | 4751                       |
| [Contextual longhands, focus outlines, selectors and container syntax](https://github.com/BarakChamo/rundom/actions/runs/45037447661) | 80a375e | 234134                  | 4794                       |
| [Pending shorthand provenance, tokens and local links](https://github.com/BarakChamo/rundom/actions/runs/45038545257)                 | a3e72f7 | 234301                  | 4827                       |

| Focused selection                                                       | Files | jsdom passes | Baseline RunDOM | Current RunDOM |
| ----------------------------------------------------------------------- | ----- | ------------ | --------------- | -------------- |
| All attr-* and if-* CSS Values HTML files                               | 25    | 554          | 32              | 554            |
| Attribute namespace XHTML                                               | 1     | 5            | 1               | 5              |
| CSS math selections                                                     | 56    | 2158         | 1352            | 2117           |
| All CSS Values files                                                    | 168   | 4176         | 2593            | 4093           |
| Attribute selector flags                                                | 1     | 528          | 456             | 528            |
| CSS filters, image sets, text decorations, gap rules, scroll buttons    | 5     | 394          | 149             | 394            |
| DOMException constants                                                  | 1     | 51           | 1               | 51             |
| Intrinsic size calculations, angle comparisons and computed identifiers | 4     | 153          | 74              | 153            |
| Relative colors                                                         | 3     | 1863         | 1863            | 1863           |
| Container query units in orthogonal writing modes                       | 1     | 26           | 0               | 26             |
| Layered property registration                                           | 1     | 15           | 0               | 15             |

| Largest remaining upstream area | jsdom passes still failing or missing |
| ------------------------------- | ------------------------------------- |
| css/css-backgrounds             | 116                                   |
| css/selectors                   | 113                                   |
| html/webappapis                 | 111                                   |
| css/cssom                       | 94                                    |
| css/css-shadow                  | 86                                    |
| css/css-values                  | 83                                    |
| css/css-cascade                 | 70                                    |
| css/css-counter-styles          | 55                                    |

| Largest individual files in Upstream WPT                                       | jsdom passes still failing or missing |
| ------------------------------------------------------------------------------ | ------------------------------------- |
| css/css-cascade/all-prop-revert-layer.html                                     | 32                                    |
| css/css-backgrounds/parsing/border-image-shorthand.sub.html                    | 30                                    |
| css/css-gaps/parsing/gap-decorations-rule-shorthand-computed.html              | 24                                    |
| css/css-shadow/shadow-cascade-order-001.html                                   | 18                                    |
| css/selectors/parsing/parse-heading.html                                       | 17                                    |
| css/css-view-transitions/navigation/with-types/at-rule-with-types-parsing.html | 16                                    |
| css/css-values/urls/url-request-modifiers-computed.sub.html                    | 16                                    |
| css/css-properties-values-api/url-resolution.html                              | 16                                    |

| Largest individual files in jsdom-local WPT                            | jsdom passes still failing or missing |
| ---------------------------------------------------------------------- | ------------------------------------- |
| html/semantics/scripting-1/the-script-element/parser-blocking.html     | 20                                    |
| css/cssom/CSSStyleDeclaration-logical-shorthand-order.html             | 15                                    |
| html/webappapis/scripting/processing-model/task-document-lifetime.html | 12                                    |
| css/selectors/escaped-asterisks.html                                   | 10                                    |
| css/css-shadow/part-cascade.html                                       | 10                                    |
| css/cssom/CSSStyleDeclaration-authored-shorthands.html                 | 9                                     |
| css/cssom/getComputedStyle-legacy-box-properties.html                  | 8                                     |
| css/cssom/computed-url-base.html                                       | 8                                     |

The intermediate pseudo-element build lost its WPT HTTP service after 56 files in shard 2. Its table entry uses an isolated retry on identical provider code. The final measurement was checked against all 6,738 reference files. [Final WPT and framework runs](https://github.com/BarakChamo/rundom/actions/runs/45038545257) · [Replacement shard 2](https://github.com/BarakChamo/rundom/actions/runs/45033177764) · [Reference shards](https://github.com/BarakChamo/rundom/actions/runs/45018050358) · [Outstanding differences and new losses](./jsdom-31-css-values-wpt-gaps.json)

## Implementation and checks

Since the contextual longhand changes, RunDOM tracks pending shorthand substitutions through the cascade, preserves lower declarations for rollback, and handles custom-property token recovery at end of input. The CSS Values rows above measure the result across the pinned fixtures.

RunDOM supplies matching declarations, parent styles, attribute identity and registrations to the pinned CSS Values evaluator. The evaluator preserves attribute taint through variables, detects cycles, chooses conditional branches, and can roll back to a losing declaration. Pseudo-elements have their own cascade and inherit from the originating element. Registered properties follow global layer order, including registrations nested in scopes, containers, and starting styles. The CSS evaluator remains lazy. The package installs the upstream jsdom dependency tree. Selector validation now decodes CSS escapes and checks attribute modifiers in the query and stylesheet paths. CSSOM retains the originating shorthand for repeated gap rules until an overlapping write invalidates it. DOMException exposes the Web IDL constants on the realm constructor and its prototype. Typed lengths preserve each eligible size container in the ancestor cascade, including orthogonal writing modes. Tree-dependent CSS values count element siblings from their actual parent. The evaluator handles ident() in custom properties and validates calc-size() against the property grammar.

| Upstream API parser (api = default) | Passed | Failed | Pending |
| ----------------------------------- | ------ | ------ | ------- |
| api                                 | 672    | 0      | 1       |
| rust                                | 672    | 0      | 1       |

The repository check passed all 15 tasks, including the corrected focus and blur fixture. The clean packed facade installed as jsdom passed 11 React/Vitest checks in each of four worker pools. The packed CommonJS and ESM runtime examples and all three TypeScript resolution configurations passed.

## Real projects

| Project (pass/fail/skip · wall · max process MiB) | RunDOM                     | jsdom                      | Happy DOM                   | TurboDOM                 | jsdom passes lost |
| ------------------------------------------------- | -------------------------- | -------------------------- | --------------------------- | ------------------------ | ----------------- |
| Vue runtime-dom                                   | 265/5/1 · 7.03 s · 477     | 265/5/1 · 10.55 s · 485    | 251/19/1 · 7.41 s · 467     | 169/32/1 · 4.48 s · 417  | 0                 |
| Svelte runtime and motion                         | 6074/28/34 · 55.13 s · 536 | 6073/29/34 · 52.62 s · 566 | 5823/279/34 · 47.28 s · 533 | 0/0/0 · 8.60 s · 425     | 0                 |
| Material UI, five components                      | 430/0/39 · 14.48 s · 454   | 430/0/39 · 14.11 s · 399   | 454/8/7 · 13.23 s · 469     | 181/281/7 · 7.49 s · 506 | 0                 |

A shorter command with fewer executed tests is a partial run. The matched concurrent workloads below compare equal passing selections.

| Additional selection (pass/fail/skip · wall · max process MiB) | RunDOM                 | jsdom                  |
| -------------------------------------------------------------- | ---------------------- | ---------------------- |
| react                                                          | 64/0/0 · 10.61 s · 730 | 64/0/0 · 2.86 s · 491  |
| supabase                                                       | 85/0/0 · 8.17 s · 207  | 85/0/0 · 11.12 s · 216 |
| freecodecamp                                                   | 4/0/0 · 1.92 s · 187   | 4/0/0 · 2.28 s · 207   |
| drone                                                          | 1/0/0 · 5.89 s · 628   | Suite setup failed     |

These extra-project selections ran RunDOM first on each VM. React used the default Jest transform cache, so its wall-time comparison confounds provider time with cache warmup. Drone’s Jest environment calls virtualConsole.sendTo. jsdom 31 removed that method and fails before collecting tests. See the row above for the RunDOM outcome. [Downstream artifacts](https://github.com/BarakChamo/rundom/actions/runs/45038559014)

| Mozilla Readability, complete local Mocha suite | Passed | Failed | Seconds | Max process MiB |
| ----------------------------------------------- | ------ | ------ | ------- | --------------- |
| candidate                                       | 1984   | 0      | 35.22   | 576             |
| reference                                       | 1984   | 0      | 93.15   | 693             |

| Next.js with-vitest example | Passed | Wall seconds in opposite-order rounds | Max process MiB in those rounds |
| --------------------------- | ------ | ------------------------------------- | ------------------------------- |
| candidate                   | 5 / 5  | 5.72 / 4.62                           | 133 / 140                       |
| jsdom                       | 5 / 5  | 16.22 / 7.22                          | 160 / 166                       |
| happy                       | 5 / 5  | 8.41 / 4.36                           | 118 / 119                       |
| turbo                       | 5 / 5  | 3.31 / 3.29                           | 114 / 114                       |

Readability and Next.js ran on the development machine. The concurrency experiments used fresh GitHub-hosted Ubuntu VMs. Physical host exclusivity was unverified.

## Concurrent throughput and memory

Each cell gives completed commands per minute and the larger sampled aggregate peak RSS in MiB. Two cold rounds used opposite provider order and one Vitest worker per command. Throughput divides both rounds’ completions by their combined elapsed time. RSS sums simultaneous process groups at 250 ms intervals and may count shared pages more than once. A dash marks a provider that missed the required outcomes. [Full project runs](https://github.com/BarakChamo/rundom/actions/runs/45038545257) · [Matched four-provider runs](https://github.com/BarakChamo/rundom/actions/runs/45038552204)

### Full selections

| Project                  | Concurrent | RunDOM        | jsdom        | Happy DOM | TurboDOM |
| ------------------------ | ---------- | ------------- | ------------ | --------- | -------- |
| Ant Design               | 1          | 5.54 · 744    | 5.29 · 729   | —         | —        |
| Ant Design               | 2          | 9.02 · 1,495  | 8.43 · 1,454 | —         | —        |
| Ant Design               | 4          | 10.14 · 2,972 | 9.69 · 2,926 | —         | —        |
| Material UI Autocomplete | 1          | 4.64 · 1,046  | 4.89 · 1,161 | —         | —        |
| Material UI Autocomplete | 2          | 8.02 · 2,128  | 8.25 · 2,341 | —         | —        |
| Material UI Autocomplete | 4          | 9.30 · 4,250  | 9.52 · 4,698 | —         | —        |

### Shared passing selections

| Project                  | Concurrent | RunDOM        | jsdom         | Happy DOM     | TurboDOM      |
| ------------------------ | ---------- | ------------- | ------------- | ------------- | ------------- |
| Ant Design               | 1          | 6.21 · 738    | 5.98 · 719    | 6.85 · 703    | 7.64 · 680    |
| Ant Design               | 2          | 10.03 · 1,464 | 9.48 · 1,451  | 11.09 · 1,380 | 12.29 · 1,340 |
| Ant Design               | 4          | 11.73 · 2,972 | 11.17 · 2,877 | 13.31 · 2,772 | 14.62 · 2,662 |
| Material UI Autocomplete | 1          | 9.57 · 909    | 9.97 · 906    | 9.77 · 923    | 12.69 · 747   |
| Material UI Autocomplete | 2          | 16.31 · 1,848 | 16.04 · 1,835 | 16.62 · 1,856 | 21.63 · 1,515 |
| Material UI Autocomplete | 4          | 19.67 · 3,701 | 19.48 · 3,616 | 20.61 · 3,830 | 27.20 · 3,014 |

At four concurrent commands, the following comparisons use identical successful selections. Positive throughput means more completed commands per minute. Positive RSS means more peak aggregate memory.

| Four concurrent commands | Compared with | RunDOM throughput difference | RunDOM peak RSS difference in MiB |
| ------------------------ | ------------- | ---------------------------- | --------------------------------- |
| Ant Design               | jsdom         | +5.0%                        | +95                               |
| Ant Design               | Happy DOM     | -11.9%                       | +200                              |
| Ant Design               | TurboDOM      | -19.8%                       | +310                              |
| Material UI Autocomplete | jsdom         | +1.0%                        | +85                               |
| Material UI Autocomplete | Happy DOM     | -4.6%                        | -129                              |
| Material UI Autocomplete | TurboDOM      | -27.7%                       | +687                              |

The shared Ant Design selection contains 116 cases. The shared Material UI selection contains 117 cases across 28 Autocomplete groups. Both full selections require the jsdom outcomes. The release remains gated on compatibility.
