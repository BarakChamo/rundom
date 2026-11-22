# CSS Values qualification against jsdom 31.0.1

November 22, 2026. Candidate `80a375e`. Reference jsdom 31.0.1, Happy DOM 21.0.4 and TurboDOM 0.7.1. The preceding RunDOM measurement used `2af947b`. [Candidate source](https://github.com/BarakChamo/rundom/tree/80a375e) · [Previous qualification](./jsdom-31-css-qualification.md)

## Compatibility

| Suite           | Files | jsdom passes | Also pass | Recovered since prior build | New losses since prior build | Fail | Missing | RunDOM passes a jsdom failure | Lost harness completions |
| --------------- | ----- | ------------ | --------- | --------------------------- | ---------------------------- | ---- | ------- | ----------------------------- | ------------------------ |
| Upstream WPT    | 6738  | 235917       | 234134    | 4416                        | 36                           | 1741 | 42      | 4057                          | 74                       |
| jsdom-local WPT | 475   | 5260         | 4794      | 304                         | 4                            | 466  | 0       | 1                             | 7                        |

Assertions were paired by file, name and occurrence. A gain requires a previous mismatch on a jsdom-passing assertion. A new loss requires a previous RunDOM pass on a jsdom-passing assertion. Wins on jsdom failures are counted separately. The gap inventory identifies each remaining assertion by name and occurrence, including its status and whether the previous RunDOM build passed it.

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

| Focused selection                                                       | Files | jsdom passes | Prior RunDOM | Current RunDOM |
| ----------------------------------------------------------------------- | ----- | ------------ | ------------ | -------------- |
| All attr-* and if-* CSS Values HTML files                               | 25    | 554          | 32           | 554            |
| Attribute namespace XHTML                                               | 1     | 5            | 1            | 5              |
| CSS math selections                                                     | 56    | 2158         | 1352         | 2116           |
| All CSS Values files                                                    | 168   | 4176         | 2593         | 4092           |
| Attribute selector flags                                                | 1     | 528          | 456          | 528            |
| CSS filters, image sets, text decorations, gap rules, scroll buttons    | 5     | 394          | 149          | 394            |
| DOMException constants                                                  | 1     | 51           | 1            | 51             |
| Intrinsic size calculations, angle comparisons and computed identifiers | 4     | 153          | 74           | 153            |
| Relative colors                                                         | 3     | 1863         | 1863         | 1863           |
| Container query units in orthogonal writing modes                       | 1     | 26           | 0            | 26             |
| Layered property registration                                           | 1     | 15           | 0            | 15             |

| Largest remaining upstream area | jsdom passes still failing or missing |
| ------------------------------- | ------------------------------------- |
| css/css-backgrounds             | 132                                   |
| css/selectors                   | 113                                   |
| html/webappapis                 | 111                                   |
| css/cssom                       | 96                                    |
| css/css-shadow                  | 86                                    |
| css/css-values                  | 84                                    |
| css/css-variables               | 81                                    |
| css/css-grid                    | 76                                    |

The intermediate pseudo-element build lost its WPT HTTP service after 56 files in shard 2. Its table entry uses an isolated retry on identical provider code. The final measurement was checked against all 6,738 reference files. [Final WPT and framework runs](https://github.com/BarakChamo/rundom/actions/runs/45037447661) · [Replacement shard 2](https://github.com/BarakChamo/rundom/actions/runs/45033177764) · [Reference shards](https://github.com/BarakChamo/rundom/actions/runs/45018050358) · [Outstanding differences and new losses](./jsdom-31-css-values-wpt-gaps.json)

## Implementation and checks

RunDOM supplies matching declarations, parent styles, attribute identity and registrations to the pinned CSS Values evaluator. The evaluator preserves attribute taint through variables, detects cycles, chooses conditional branches, and can roll back to a losing declaration. Pseudo-elements have their own cascade and inherit from the originating element. Registered properties follow global layer order, including registrations nested in scopes, containers, and starting styles. The CSS evaluator remains lazy. The package installs the upstream jsdom dependency tree. Selector validation now decodes CSS escapes and checks attribute modifiers in the query and stylesheet paths. CSSOM retains the originating shorthand for repeated gap rules until an overlapping write invalidates it. DOMException exposes the Web IDL constants on the realm constructor and its prototype. Typed lengths preserve each eligible size container in the ancestor cascade, including orthogonal writing modes. Tree-dependent CSS values count element siblings from their actual parent. The evaluator handles ident() in custom properties and validates calc-size() against the property grammar.

| Upstream API parser (api = default) | Passed | Failed | Pending |
| ----------------------------------- | ------ | ------ | ------- |
| api                                 | 672    | 0      | 1       |
| rust                                | 672    | 0      | 1       |

The repository gate flagged the TypeScript type of the new focus/blur test fixture. Its runtime assertions passed. The following build corrects the fixture type. The clean packed facade installed as jsdom passed 11 React/Vitest checks in each of four worker pools. The packed CommonJS and ESM runtime examples and all three TypeScript resolution configurations passed.

## Real projects

| Project (pass/fail/skip · wall · max process MiB) | RunDOM                     | jsdom                      | Happy DOM                   | TurboDOM                 | jsdom passes lost |
| ------------------------------------------------- | -------------------------- | -------------------------- | --------------------------- | ------------------------ | ----------------- |
| Vue runtime-dom                                   | 265/5/1 · 9.03 s · 478     | 265/5/1 · 13.56 s · 499    | 251/19/1 · 9.69 s · 514     | 169/32/1 · 5.80 s · 456  | 0                 |
| Svelte runtime and motion                         | 6074/28/34 · 70.58 s · 562 | 6073/29/34 · 68.27 s · 566 | 5823/279/34 · 61.69 s · 536 | 0/0/0 · 11.94 s · 425    | 0                 |
| Material UI, five components                      | 430/0/39 · 13.66 s · 439   | 430/0/39 · 13.66 s · 402   | 454/8/7 · 12.89 s · 470     | 181/281/7 · 7.35 s · 486 | 0                 |

A shorter command with fewer executed tests is a partial run. The matched concurrent workloads below compare equal passing selections.

| Additional selection (pass/fail/skip · wall · max process MiB) | RunDOM                | jsdom                  |
| -------------------------------------------------------------- | --------------------- | ---------------------- |
| react                                                          | 64/0/0 · 7.67 s · 708 | 64/0/0 · 2.10 s · 498  |
| supabase                                                       | 85/0/0 · 7.99 s · 207 | 85/0/0 · 10.80 s · 217 |
| freecodecamp                                                   | 4/0/0 · 2.63 s · 188  | 4/0/0 · 3.13 s · 208   |
| drone                                                          | 1/0/0 · 5.94 s · 635  | Suite setup failed     |

These extra-project selections ran RunDOM first on each VM. React used the default Jest transform cache, so its wall-time comparison confounds provider time with cache warmup. Drone failed environment setup on both providers. [Downstream artifacts](https://github.com/BarakChamo/rundom/actions/runs/45037463076)

| Mozilla Readability, complete local Mocha suite | Passed | Failed | Seconds | Max process MiB |
| ----------------------------------------------- | ------ | ------ | ------- | --------------- |
| candidate                                       | 1984   | 0      | 31.21   | 792             |
| reference                                       | 1984   | 0      | 69.04   | 899             |

| Next.js with-vitest example | Passed | Wall seconds in opposite-order rounds | Max process MiB in those rounds |
| --------------------------- | ------ | ------------------------------------- | ------------------------------- |
| candidate                   | 5 / 5  | 5.73 / 6.12                           | 136 / 134                       |
| jsdom                       | 5 / 5  | 9.10 / 9.29                           | 164 / 160                       |
| happy                       | 5 / 5  | 6.25 / 6.77                           | 118 / 117                       |
| turbo                       | 5 / 5  | 3.90 / 4.79                           | 112 / 105                       |

Readability and Next.js ran on the development machine. The concurrency experiments used fresh GitHub-hosted Ubuntu VMs. Physical host exclusivity was unverified.

## Concurrent throughput and memory

Each cell gives completed commands per minute and the larger sampled aggregate peak RSS in MiB. Two cold rounds used opposite provider order and one Vitest worker per command. Throughput divides both rounds’ completions by their combined elapsed time. RSS sums simultaneous process groups at 250 ms intervals and may count shared pages more than once. A dash marks a provider that missed the required outcomes. [Full project runs](https://github.com/BarakChamo/rundom/actions/runs/45037447661) · [Matched four-provider runs](https://github.com/BarakChamo/rundom/actions/runs/45037455959)

### Full selections

| Project                  | Concurrent | RunDOM       | jsdom        | Happy DOM | TurboDOM |
| ------------------------ | ---------- | ------------ | ------------ | --------- | -------- |
| Ant Design               | 1          | 3.61 · 731   | 3.35 · 717   | —         | —        |
| Ant Design               | 2          | 5.90 · 1,481 | 5.61 · 1,442 | —         | —        |
| Ant Design               | 4          | 6.99 · 2,957 | 6.60 · 2,867 | —         | —        |
| Material UI Autocomplete | 1          | 3.55 · 1,026 | 3.36 · 1,151 | —         | —        |
| Material UI Autocomplete | 2          | 5.90 · 2,094 | 5.61 · 2,329 | —         | —        |
| Material UI Autocomplete | 4          | 6.45 · 4,177 | 6.05 · 4,629 | —         | —        |

### Shared passing selections

| Project                  | Concurrent | RunDOM        | jsdom         | Happy DOM     | TurboDOM      |
| ------------------------ | ---------- | ------------- | ------------- | ------------- | ------------- |
| Ant Design               | 1          | 3.64 · 729    | 3.35 · 721    | 4.03 · 684    | 4.63 · 668    |
| Ant Design               | 2          | 6.05 · 1,469  | 5.61 · 1,449  | 6.67 · 1,410  | 7.56 · 1,332  |
| Ant Design               | 4          | 7.12 · 2,965  | 6.65 · 2,891  | 7.88 · 2,819  | 8.90 · 2,642  |
| Material UI Autocomplete | 1          | 6.77 · 879    | 6.60 · 903    | 6.81 · 911    | 8.88 · 737    |
| Material UI Autocomplete | 2          | 11.22 · 1,790 | 10.53 · 1,785 | 10.96 · 1,837 | 14.23 · 1,493 |
| Material UI Autocomplete | 4          | 12.90 · 3,566 | 11.83 · 3,636 | 12.50 · 3,824 | 16.43 · 2,992 |

The shared Ant Design selection contains 116 cases. The shared Material UI selection contains 117 cases across 28 Autocomplete groups. Both full selections require the jsdom outcomes. The release remains gated on compatibility.
