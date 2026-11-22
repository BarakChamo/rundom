# CSS Values qualification against jsdom 31.0.1

November 22, 2026. Candidate `ae137ee`. Reference jsdom 31.0.1, Happy DOM 21.0.4 and TurboDOM 0.7.1. The preceding RunDOM measurement used `2af947b`. [Candidate source](https://github.com/BarakChamo/rundom/tree/ae137ee) · [Previous qualification](./jsdom-31-css-qualification.md)

## Compatibility

| Suite           | Files | jsdom passes | Also pass | Recovered since prior build | New losses since prior build | Fail | Missing | RunDOM passes a jsdom failure | Lost harness completions |
| --------------- | ----- | ------------ | --------- | --------------------------- | ---------------------------- | ---- | ------- | ----------------------------- | ------------------------ |
| Upstream WPT    | 6738  | 235917       | 232085    | 2358                        | 27                           | 3762 | 70      | 4049                          | 66                       |
| jsdom-local WPT | 475   | 5260         | 4668      | 174                         | 0                            | 592  | 0       | 1                             | 7                        |

Assertions were paired by file, name and occurrence. A gain requires a previous mismatch on a jsdom-passing assertion. A new loss requires a previous RunDOM pass on a jsdom-passing assertion. Wins on jsdom failures are counted separately. The gap inventory identifies each remaining assertion by name and occurrence, including its status and whether the previous RunDOM build passed it.

### Effect of each committed change

| Change                                                                                                                  | Commit  | Upstream passes matched | jsdom-local passes matched |
| ----------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------- | -------------------------- |
| [Previous measurement](https://github.com/BarakChamo/rundom/actions/runs/45029425185)                                   | 2af947b | 229754                  | 4494                       |
| [Attribute and conditional substitution](https://github.com/BarakChamo/rundom/actions/runs/45031270109)                 | 585ffcf | 230282                  | 4594                       |
| [Typed CSS calculations](https://github.com/BarakChamo/rundom/actions/runs/45031723065)                                 | fee97f6 | 231223                  | 4597                       |
| [Global property registrations](https://github.com/BarakChamo/rundom/actions/runs/45032248195)                          | 81df24d | 231398                  | 4621                       |
| [Pseudo-elements and rule rollback](https://github.com/BarakChamo/rundom/actions/runs/45032914235)                      | e5bb525 | 231568                  | 4634                       |
| [Selector grammar, declarations and exception constants](https://github.com/BarakChamo/rundom/actions/runs/45034310114) | ae137ee | 232085                  | 4668                       |

| Focused selection                                                    | Files | jsdom passes | Prior RunDOM | Current RunDOM |
| -------------------------------------------------------------------- | ----- | ------------ | ------------ | -------------- |
| All attr-* and if-* CSS Values HTML files                            | 25    | 554          | 32           | 554            |
| Attribute namespace XHTML                                            | 1     | 5            | 1            | 5              |
| CSS math selections                                                  | 56    | 2158         | 1352         | 2067           |
| All CSS Values files                                                 | 168   | 4176         | 2593         | 3973           |
| Attribute selector flags                                             | 1     | 528          | 456          | 528            |
| CSS filters, image sets, text decorations, gap rules, scroll buttons | 5     | 394          | 149          | 394            |
| DOMException constants                                               | 1     | 51           | 1            | 51             |
| Relative colors                                                      | 3     | 1863         | 1863         | 1863           |
| Layered property registration                                        | 1     | 15           | 0            | 15             |

| Largest remaining upstream area | jsdom passes still failing or missing |
| ------------------------------- | ------------------------------------- |
| css/css-fonts                   | 230                                   |
| css/css-values                  | 203                                   |
| css/css-color                   | 178                                   |
| css/css-backgrounds             | 164                                   |
| css/css-masking                 | 160                                   |
| css/cssom                       | 154                                   |
| css/selectors                   | 153                                   |
| css/css-text                    | 143                                   |

The intermediate pseudo-element build lost its WPT HTTP service after 56 files in shard 2. Its table entry uses an isolated retry on identical provider code. The final measurement was checked against all 6,738 reference files. [Final WPT and framework runs](https://github.com/BarakChamo/rundom/actions/runs/45034310114) · [Replacement shard 2](https://github.com/BarakChamo/rundom/actions/runs/45033177764) · [Reference shards](https://github.com/BarakChamo/rundom/actions/runs/45018050358) · [Outstanding differences and new losses](./jsdom-31-css-values-wpt-gaps.json)

## Implementation and checks

RunDOM supplies matching declarations, parent styles, attribute identity and registrations to the pinned CSS Values evaluator. The evaluator preserves attribute taint through variables, detects cycles, chooses conditional branches, and can roll back to a losing declaration. Pseudo-elements have their own cascade and inherit from the originating element. Registered properties follow global layer order, including registrations nested in scopes, containers, and starting styles. The CSS evaluator remains lazy. The package installs the upstream jsdom dependency tree. Selector validation now decodes CSS escapes and checks attribute modifiers in the query and stylesheet paths. CSSOM retains the originating shorthand for repeated gap rules until an overlapping write invalidates it. DOMException exposes the Web IDL constants on the realm constructor and its prototype.

| Upstream API parser (api = default) | Passed | Failed | Pending |
| ----------------------------------- | ------ | ------ | ------- |
| api                                 | 672    | 0      | 1       |
| rust                                | 672    | 0      | 1       |

The local repository check passed all 15 tasks. The clean packed facade installed as jsdom passed 11 React/Vitest checks in each of four worker pools. The packed CommonJS and ESM runtime examples and all three TypeScript resolution configurations passed.

## Real projects

| Project (pass/fail/skip · wall · max process MiB) | RunDOM                     | jsdom                      | Happy DOM                   | TurboDOM                 | jsdom passes lost |
| ------------------------------------------------- | -------------------------- | -------------------------- | --------------------------- | ------------------------ | ----------------- |
| Vue runtime-dom                                   | 265/5/1 · 5.10 s · 513     | 265/5/1 · 9.22 s · 489     | 251/19/1 · 6.44 s · 460     | 169/32/1 · 4.21 s · 458  | 0                 |
| Svelte runtime and motion                         | 6074/28/34 · 56.44 s · 593 | 6073/29/34 · 55.11 s · 535 | 5823/279/34 · 50.80 s · 540 | 0/0/0 · 9.42 s · 426     | 0                 |
| Material UI, five components                      | 430/0/39 · 12.79 s · 411   | 430/0/39 · 13.71 s · 394   | 454/8/7 · 12.76 s · 445     | 181/281/7 · 7.34 s · 476 | 0                 |

A shorter command with fewer executed tests is a partial run. The matched concurrent workloads below compare equal passing selections.

| Additional selection (pass/fail/skip · wall · max process MiB) | RunDOM                | jsdom                  |
| -------------------------------------------------------------- | --------------------- | ---------------------- |
| react                                                          | 64/0/0 · 8.21 s · 736 | 64/0/0 · 2.13 s · 489  |
| supabase                                                       | 85/0/0 · 7.18 s · 194 | 85/0/0 · 10.97 s · 214 |
| freecodecamp                                                   | 4/0/0 · 1.96 s · 170  | 4/0/0 · 2.55 s · 206   |
| drone                                                          | 1/0/0 · 5.70 s · 613  | Suite setup failed     |

These extra-project selections ran RunDOM first on each VM. React used the default Jest transform cache, so its wall-time comparison confounds provider time with cache warmup. Drone failed environment setup on both providers. [Downstream artifacts](https://github.com/BarakChamo/rundom/actions/runs/45034321344)

| Mozilla Readability, complete local Mocha suite | Passed | Failed | Seconds | Max process MiB |
| ----------------------------------------------- | ------ | ------ | ------- | --------------- |
| candidate                                       | 1984   | 0      | 18.56   | 758             |
| reference                                       | 1984   | 0      | 42.73   | 1006            |

| Next.js with-vitest example | Passed | Wall seconds in opposite-order rounds | Max process MiB in those rounds |
| --------------------------- | ------ | ------------------------------------- | ------------------------------- |
| candidate                   | 5 / 5  | 2.30 / 4.31                           | 116 / 110                       |
| jsdom                       | 5 / 5  | 5.91 / 8.34                           | 165 / 156                       |
| happy                       | 5 / 5  | 5.46 / 5.36                           | 118 / 116                       |
| turbo                       | 5 / 5  | 3.48 / 3.48                           | 108 / 106                       |

Readability and Next.js ran on the development machine. The concurrency experiments used fresh GitHub-hosted Ubuntu VMs. Physical host exclusivity was unverified.

## Concurrent throughput and memory

Each cell gives completed commands per minute and the larger sampled aggregate peak RSS in MiB. Two cold rounds used opposite provider order and one Vitest worker per command. Throughput divides both rounds’ completions by their combined elapsed time. RSS sums simultaneous process groups at 250 ms intervals and may count shared pages more than once. A dash marks a provider that missed the required outcomes. [Full project runs](https://github.com/BarakChamo/rundom/actions/runs/45034310114) · [Matched four-provider runs](https://github.com/BarakChamo/rundom/actions/runs/45034315315)

### Full selections

| Project                  | Concurrent | RunDOM        | jsdom        | Happy DOM | TurboDOM |
| ------------------------ | ---------- | ------------- | ------------ | --------- | -------- |
| Ant Design               | 1          | 4.95 · 744    | 4.47 · 716   | —         | —        |
| Ant Design               | 2          | 8.18 · 1,478  | 7.45 · 1,456 | —         | —        |
| Ant Design               | 4          | 9.78 · 2,903  | 9.00 · 2,867 | —         | —        |
| Material UI Autocomplete | 1          | 5.10 · 1,024  | 4.90 · 1,141 | —         | —        |
| Material UI Autocomplete | 2          | 8.87 · 2,043  | 8.38 · 2,306 | —         | —        |
| Material UI Autocomplete | 4          | 10.69 · 4,177 | 9.72 · 4,681 | —         | —        |

### Shared passing selections

| Project                  | Concurrent | RunDOM        | jsdom         | Happy DOM     | TurboDOM      |
| ------------------------ | ---------- | ------------- | ------------- | ------------- | ------------- |
| Ant Design               | 1          | 5.59 · 724    | 5.05 · 742    | 6.09 · 699    | 6.80 · 668    |
| Ant Design               | 2          | 9.02 · 1,474  | 8.22 · 1,446  | 9.84 · 1,373  | 11.06 · 1,329 |
| Ant Design               | 4          | 10.50 · 2,923 | 9.71 · 2,872  | 11.44 · 2,758 | 12.89 · 2,647 |
| Material UI Autocomplete | 1          | 10.67 · 854   | 10.22 · 881   | 10.01 · 915   | 13.05 · 733   |
| Material UI Autocomplete | 2          | 17.90 · 1,725 | 16.31 · 1,789 | 16.65 · 1,869 | 21.66 · 1,496 |
| Material UI Autocomplete | 4          | 21.41 · 3,530 | 19.92 · 3,599 | 20.15 · 3,766 | 26.74 · 3,038 |

The shared Ant Design selection contains 116 cases. The shared Material UI selection contains 117 cases across 28 Autocomplete groups. Both full selections require the jsdom outcomes. The release remains gated on compatibility.
