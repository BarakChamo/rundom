# CSS Values qualification against jsdom 31.0.1

November 22, 2026. Candidate `837bd62`. Reference jsdom 31.0.1, Happy DOM 21.0.4 and TurboDOM 0.7.1. The starting RunDOM baseline was `2af947b`. [Candidate source](https://github.com/BarakChamo/rundom/tree/837bd62) · [Previous qualification](./jsdom-31-css-qualification.md)

## Compatibility

| Suite           | Files | jsdom passes | Also pass | Recovered since baseline | New losses since baseline | Fail | Missing | RunDOM passes a jsdom failure | Lost harness completions |
| --------------- | ----- | ------------ | --------- | ------------------------ | ------------------------- | ---- | ------- | ----------------------------- | ------------------------ |
| Upstream WPT    | 6738  | 235917       | 234501    | 4787                     | 40                        | 1380 | 36      | 4052                          | 73                       |
| jsdom-local WPT | 475   | 5260         | 4827      | 350                      | 17                        | 433  | 0       | 1                             | 7                        |

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
| [Rule descriptors, CSSOM setters and additional property grammars](https://github.com/BarakChamo/rundom/actions/runs/45039368335)     | 837bd62 | 234501                  | 4827                       |

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
| css/selectors                   | 113                                   |
| html/webappapis                 | 111                                   |
| css/cssom                       | 95                                    |
| css/css-shadow                  | 86                                    |
| css/css-values                  | 83                                    |
| css/css-backgrounds             | 75                                    |
| css/css-cascade                 | 64                                    |
| css/css-page                    | 55                                    |

| Largest individual files in Upstream WPT                          | jsdom passes still failing or missing |
| ----------------------------------------------------------------- | ------------------------------------- |
| css/css-cascade/all-prop-revert-layer.html                        | 26                                    |
| css/css-gaps/parsing/gap-decorations-rule-shorthand-computed.html | 24                                    |
| css/css-shadow/shadow-cascade-order-001.html                      | 18                                    |
| css/selectors/parsing/parse-heading.html                          | 17                                    |
| css/css-values/urls/url-request-modifiers-computed.sub.html       | 16                                    |
| css/css-properties-values-api/url-resolution.html                 | 16                                    |
| css/css-page/parsing/margin-rules-001.html                        | 16                                    |
| css/css-variables/variable-definition.html                        | 15                                    |

| Largest individual files in jsdom-local WPT                            | jsdom passes still failing or missing |
| ---------------------------------------------------------------------- | ------------------------------------- |
| html/semantics/scripting-1/the-script-element/parser-blocking.html     | 20                                    |
| css/cssom/CSSStyleDeclaration-logical-shorthand-order.html             | 15                                    |
| html/webappapis/scripting/processing-model/task-document-lifetime.html | 12                                    |
| css/cssom/CSSStyleDeclaration-shorthand-keywords.html                  | 12                                    |
| css/selectors/escaped-asterisks.html                                   | 10                                    |
| css/css-shadow/part-cascade.html                                       | 10                                    |
| css/cssom/CSSStyleDeclaration-authored-shorthands.html                 | 9                                     |
| css/cssom/getComputedStyle-legacy-box-properties.html                  | 8                                     |

The intermediate pseudo-element build lost its WPT HTTP service after 56 files in shard 2. Its table entry uses an isolated retry on identical provider code. The final measurement was checked against all 6,738 reference files. [Final WPT and framework runs](https://github.com/BarakChamo/rundom/actions/runs/45039368335) · [Replacement shard 2](https://github.com/BarakChamo/rundom/actions/runs/45033177764) · [Reference shards](https://github.com/BarakChamo/rundom/actions/runs/45018050358) · [Outstanding differences and new losses](./jsdom-31-css-values-wpt-gaps.json)

### Isolated remaining failures

A second local run of the pinned CSS fixtures captured assertion messages. Gap rule shorthand serialization returned extra empty comma-separated entries around a valid repeat(). In shadow cascade tests, a ::slotted rule and a :host rule selected different winners in open and closed roots. Invalid :heading() arguments were accepted by CSSStyleSheet.insertRule. Border image serialization lost individual longhand defaults. These defects reproduce without a framework or test-runner adapter.

## Implementation and checks

Since the contextual longhand changes, RunDOM tracks pending shorthand substitutions through the cascade, preserves lower declarations for rollback, and handles custom-property token recovery at end of input. The CSS Values rows above measure the result across the pinned fixtures.

This build also validates counter-style and view-transition rule descriptors, applies CSSOM string conversion on read-only rule setters, and handles additional transform, transition, border-image and URL grammars. In a direct oracle check, assigning an empty counter-style suffix kept the previous value in both providers.

RunDOM supplies matching declarations, parent styles, attribute identity and registrations to the pinned CSS Values evaluator. The evaluator preserves attribute taint through variables, detects cycles, chooses conditional branches, and can roll back to a losing declaration. Pseudo-elements have their own cascade and inherit from the originating element. Registered properties follow global layer order, including registrations nested in scopes, containers, and starting styles. The CSS evaluator remains lazy. The package installs the upstream jsdom dependency tree. Selector validation now decodes CSS escapes and checks attribute modifiers in the query and stylesheet paths. CSSOM retains the originating shorthand for repeated gap rules until an overlapping write invalidates it. DOMException exposes the Web IDL constants on the realm constructor and its prototype. Typed lengths preserve each eligible size container in the ancestor cascade, including orthogonal writing modes. Tree-dependent CSS values count element siblings from their actual parent. The evaluator handles ident() in custom properties and validates calc-size() against the property grammar.

| Upstream API parser (api = default) | Passed | Failed | Pending |
| ----------------------------------- | ------ | ------ | ------- |
| api                                 | 672    | 0      | 1       |
| rust                                | 672    | 0      | 1       |

The repository check passed all 15 tasks, including the corrected focus and blur fixture. The clean packed facade installed as jsdom passed 11 React/Vitest checks in each of four worker pools. The packed CommonJS and ESM runtime examples and all three TypeScript resolution configurations passed.

A retained computed declaration on a styled div enumerated 544 unique property names in exactly the jsdom order. Changing the inline color from red to blue updated the same declaration in both implementations.

| Upstream to-port-to-wpts group | RunDOM passes / failures | jsdom passes / failures |
| ------------------------------ | ------------------------ | ----------------------- |
| root                           | 186 / 0                  | 186 / 0                 |
| level1                         | 557 / 0                  | 557 / 0                 |
| level2                         | 876 / 0                  | 876 / 0                 |
| level3                         | 162 / 0                  | 162 / 0                 |

## Real projects

| Project (pass/fail/skip · wall · max process MiB) | RunDOM                     | jsdom                      | Happy DOM                   | TurboDOM                 | jsdom passes lost |
| ------------------------------------------------- | -------------------------- | -------------------------- | --------------------------- | ------------------------ | ----------------- |
| Vue runtime-dom                                   | 265/5/1 · 9.08 s · 476     | 265/5/1 · 14.12 s · 487    | 251/19/1 · 9.86 s · 519     | 169/32/1 · 5.84 s · 461  | 0                 |
| Svelte runtime and motion                         | 6072/30/34 · 57.09 s · 530 | 6073/29/34 · 54.31 s · 567 | 5823/279/34 · 49.57 s · 528 | 0/0/0 · 9.20 s · 427     | 2                 |
| Material UI, five components                      | 430/0/39 · 14.55 s · 457   | 430/0/39 · 14.05 s · 400   | 454/8/7 · 13.12 s · 468     | 181/281/7 · 7.44 s · 466 | 0                 |

A shorter command with fewer executed tests is a partial run. The matched concurrent workloads below compare equal passing selections.

| Additional selection (pass/fail/skip · wall · max process MiB) | RunDOM                | jsdom                  |
| -------------------------------------------------------------- | --------------------- | ---------------------- |
| react                                                          | 64/0/0 · 8.09 s · 717 | 64/0/0 · 2.06 s · 493  |
| supabase                                                       | 85/0/0 · 8.11 s · 203 | 85/0/0 · 10.96 s · 214 |
| freecodecamp                                                   | 4/0/0 · 2.01 s · 186  | 4/0/0 · 2.33 s · 208   |
| drone                                                          | 1/0/0 · 5.81 s · 622  | Suite setup failed     |

These extra-project selections ran RunDOM first on each VM. React used the default Jest transform cache, so its wall-time comparison confounds provider time with cache warmup. Drone’s Jest environment calls virtualConsole.sendTo. jsdom 31 removed that method and fails before collecting tests. See the row above for the RunDOM outcome. [Downstream artifacts](https://github.com/BarakChamo/rundom/actions/runs/45039380795)

### Opposite-order downstream reruns

Both orders used fresh processes and disabled test caches. Scully generated its real sample site at the pinned revision. Its unmodified Jest 27 adapter calls the removed VirtualConsole.sendTo method on jsdom and tries to redefine a nonconfigurable document during RunDOM teardown. Happy DOM rejected the test setup’s style override. Three of the eight Scully assertions explicitly create jsdom, including in the TurboDOM run. Source module loads identify the selected provider in every measured command. Each wall-time and maximum-process-RSS cell lists the two rounds. An unverified row means that setup or provider verification prevented a comparison. A 0/0/0 outcome means setup collected no cases. [Balanced downstream runs](https://github.com/BarakChamo/rundom/actions/runs/45039834391) · [Scully and generated fixtures](https://github.com/BarakChamo/rundom/actions/runs/45039957387)

| Project      | Provider  | Pass/fail/skip | Wall seconds  | Max process MiB | jsdom passes lost by round |
| ------------ | --------- | -------------- | ------------- | --------------- | -------------------------- |
| react        | RunDOM    | 64/0/0         | 7.96 / 7.65   | 723 / 743       | 0 / 0                      |
| react        | jsdom     | 64/0/0         | 8.16 / 8.12   | 863 / 795       | 0 / 0                      |
| react        | Happy DOM | 63/1/0         | 8.00 / 8.03   | 743 / 791       | 1 / 1                      |
| react        | TurboDOM  | 61/3/0         | 7.87 / 7.78   | 752 / 747       | 3 / 3                      |
| supabase     | RunDOM    | 85/0/0         | 12.77 / 13.23 | 208 / 206       | 0 / 0                      |
| supabase     | jsdom     | 85/0/0         | 17.67 / 18.04 | 215 / 216       | 0 / 0                      |
| supabase     | Happy DOM | 84/1/0         | 13.07 / 12.99 | 197 / 194       | 1 / 1                      |
| supabase     | TurboDOM  | 80/5/0         | 10.74 / 10.78 | 204 / 207       | 5 / 5                      |
| freecodecamp | RunDOM    | 4/0/0          | 1.70 / 1.73   | 187 / 188       | 0 / 0                      |
| freecodecamp | jsdom     | 4/0/0          | 2.02 / 2.07   | 209 / 209       | 0 / 0                      |
| freecodecamp | Happy DOM | 4/0/0          | 1.67 / 1.67   | 178 / 176       | 0 / 0                      |
| freecodecamp | TurboDOM  | 4/0/0          | 1.44 / 1.49   | 181 / 169       | 0 / 0                      |
| drone        | RunDOM    | 1/0/0          | 5.84 / 5.67   | 629 / 621       | —                          |
| drone        | jsdom     | 0/0/0          | 0.61 / 0.61   | 167 / 167       | —                          |
| drone        | Happy DOM | 1/0/0          | 5.69 / 5.79   | 634 / 628       | —                          |
| drone        | TurboDOM  | 0/1/0          | 5.04 / 5.10   | 618 / 614       | —                          |
| scully       | RunDOM    | 0/0/0          | 2.12 / 2.10   | 479 / 468       | —                          |
| scully       | jsdom     | 0/0/0          | 0.73 / 0.72   | 210 / 212       | —                          |
| scully       | Happy DOM | 0/0/0          | 1.42 / 1.50   | 391 / 396       | —                          |
| scully       | TurboDOM  | 8/0/0          | 2.15 / 2.06   | 441 / 442       | —                          |

| Mozilla Readability, complete local Mocha suite | Passed | Failed | Seconds | Max process MiB |
| ----------------------------------------------- | ------ | ------ | ------- | --------------- |
| candidate                                       | 1984   | 0      | 21.09   | 852             |
| reference                                       | 1984   | 0      | 46.62   | 1723            |

| Next.js with-vitest example | Passed | Wall seconds in opposite-order rounds | Max process MiB in those rounds |
| --------------------------- | ------ | ------------------------------------- | ------------------------------- |
| candidate                   | 5 / 5  | 2.59 / 3.12                           | 135 / 135                       |
| jsdom                       | 5 / 5  | 4.48 / 5.36                           | 165 / 164                       |
| happy                       | 5 / 5  | 2.93 / 4.06                           | 118 / 118                       |
| turbo                       | 5 / 5  | 2.19 / 1.33                           | 116 / 116                       |

Readability and Next.js ran on the development machine. The concurrency experiments used fresh GitHub-hosted Ubuntu VMs. Physical host exclusivity was unverified.

## Concurrent throughput and memory

Each cell gives completed commands per minute and the larger sampled aggregate peak RSS in MiB. Two cold rounds used opposite provider order and one Vitest worker per command. Throughput divides both rounds’ completions by their combined elapsed time. RSS sums simultaneous process groups at 250 ms intervals and may count shared pages more than once. A dash marks a provider that missed the required outcomes. [Full project runs](https://github.com/BarakChamo/rundom/actions/runs/45039368335) · [Matched four-provider runs](https://github.com/BarakChamo/rundom/actions/runs/45039374514)

### Full selections

| Project                  | Concurrent | RunDOM       | jsdom        | Happy DOM | TurboDOM |
| ------------------------ | ---------- | ------------ | ------------ | --------- | -------- |
| Ant Design               | 1          | —            | 4.89 · 729   | —         | —        |
| Ant Design               | 2          | —            | 7.99 · 1,462 | —         | —        |
| Ant Design               | 4          | —            | 9.33 · 2,876 | —         | —        |
| Material UI Autocomplete | 1          | 4.38 · 1,088 | 4.79 · 1,147 | —         | —        |
| Material UI Autocomplete | 2          | 7.83 · 2,196 | 8.24 · 2,347 | —         | —        |
| Material UI Autocomplete | 4          | 9.20 · 4,414 | 9.86 · 4,672 | —         | —        |

### Shared passing selections

| Project                  | Concurrent | RunDOM        | jsdom         | Happy DOM     | TurboDOM      |
| ------------------------ | ---------- | ------------- | ------------- | ------------- | ------------- |
| Ant Design               | 1          | 5.40 · 738    | 5.05 · 725    | 6.02 · 700    | 6.90 · 665    |
| Ant Design               | 2          | 8.93 · 1,469  | 8.44 · 1,440  | 9.99 · 1,376  | 11.08 · 1,342 |
| Ant Design               | 4          | 10.40 · 2,956 | 9.83 · 2,831  | 11.68 · 2,745 | 12.93 · 2,657 |
| Material UI Autocomplete | 1          | 8.28 · 914    | 8.76 · 900    | 8.76 · 922    | 11.62 · 735   |
| Material UI Autocomplete | 2          | 14.30 · 1,863 | 14.58 · 1,800 | 14.60 · 1,846 | 19.15 · 1,499 |
| Material UI Autocomplete | 4          | 16.92 · 3,752 | 17.20 · 3,635 | 17.79 · 3,864 | 23.73 · 3,015 |

At four concurrent commands, the following comparisons use identical successful selections. Positive throughput means more completed commands per minute. Positive RSS means more peak aggregate memory.

| Four concurrent commands | Compared with | RunDOM throughput difference | RunDOM peak RSS difference in MiB |
| ------------------------ | ------------- | ---------------------------- | --------------------------------- |
| Ant Design               | jsdom         | +5.8%                        | +125                              |
| Ant Design               | Happy DOM     | -10.9%                       | +211                              |
| Ant Design               | TurboDOM      | -19.6%                       | +300                              |
| Material UI Autocomplete | jsdom         | -1.7%                        | +117                              |
| Material UI Autocomplete | Happy DOM     | -4.9%                        | -111                              |
| Material UI Autocomplete | TurboDOM      | -28.7%                       | +737                              |

The shared Ant Design selection contains 116 cases. The shared Material UI selection contains 117 cases across 28 Autocomplete groups. Both full selections require the jsdom outcomes. The release remains gated on compatibility.
