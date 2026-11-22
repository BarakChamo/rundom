# CSS Values qualification against jsdom 31.0.1

November 22, 2026. Candidate `97e42ba`. Reference jsdom 31.0.1, Happy DOM 21.0.4 and TurboDOM 0.7.1. The preceding RunDOM measurement used `2af947b`. [Candidate source](https://github.com/BarakChamo/rundom/tree/97e42ba) · [Previous qualification](./jsdom-31-css-qualification.md)

## Compatibility

| Suite           | Files | jsdom passes | Also pass | Recovered since prior build | New losses since prior build | Fail | Missing | RunDOM passes a jsdom failure | Lost harness completions |
| --------------- | ----- | ------------ | --------- | --------------------------- | ---------------------------- | ---- | ------- | ----------------------------- | ------------------------ |
| Upstream WPT    | 6738  | 235917       | 233242    | 3519                        | 31                           | 2612 | 63      | 4049                          | 75                       |
| jsdom-local WPT | 475   | 5260         | 4751      | 258                         | 1                            | 509  | 0       | 1                             | 7                        |

Assertions were paired by file, name and occurrence. A gain requires a previous mismatch on a jsdom-passing assertion. A new loss requires a previous RunDOM pass on a jsdom-passing assertion. Wins on jsdom failures are counted separately. The gap inventory identifies each remaining assertion by name and occurrence, including its status and whether the previous RunDOM build passed it.

### Effect of each committed change

| Change                                                                                                                          | Commit  | Upstream passes matched | jsdom-local passes matched |
| ------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------- | -------------------------- |
| [Previous measurement](https://github.com/BarakChamo/rundom/actions/runs/45029425185)                                           | 2af947b | 229754                  | 4494                       |
| [Attribute and conditional substitution](https://github.com/BarakChamo/rundom/actions/runs/45031270109)                         | 585ffcf | 230282                  | 4594                       |
| [Typed CSS calculations](https://github.com/BarakChamo/rundom/actions/runs/45031723065)                                         | fee97f6 | 231223                  | 4597                       |
| [Global property registrations](https://github.com/BarakChamo/rundom/actions/runs/45032248195)                                  | 81df24d | 231398                  | 4621                       |
| [Pseudo-elements and rule rollback](https://github.com/BarakChamo/rundom/actions/runs/45032914235)                              | e5bb525 | 231568                  | 4634                       |
| [Selector grammar, declarations and exception constants](https://github.com/BarakChamo/rundom/actions/runs/45034310114)         | ae137ee | 232085                  | 4668                       |
| [Typed dimensions, container axes and identifiers](https://github.com/BarakChamo/rundom/actions/runs/45035353061)               | c27dc83 | 232199                  | 4703                       |
| [Function rules, font descriptors, shorthands and color grammar](https://github.com/BarakChamo/rundom/actions/runs/45036648460) | 97e42ba | 233242                  | 4751                       |

| Focused selection                                                       | Files | jsdom passes | Prior RunDOM | Current RunDOM |
| ----------------------------------------------------------------------- | ----- | ------------ | ------------ | -------------- |
| All attr-* and if-* CSS Values HTML files                               | 25    | 554          | 32           | 554            |
| Attribute namespace XHTML                                               | 1     | 5            | 1            | 5              |
| CSS math selections                                                     | 56    | 2158         | 1352         | 2108           |
| All CSS Values files                                                    | 168   | 4176         | 2593         | 4084           |
| Attribute selector flags                                                | 1     | 528          | 456          | 528            |
| CSS filters, image sets, text decorations, gap rules, scroll buttons    | 5     | 394          | 149          | 394            |
| DOMException constants                                                  | 1     | 51           | 1            | 51             |
| Intrinsic size calculations, angle comparisons and computed identifiers | 4     | 153          | 74           | 153            |
| Relative colors                                                         | 3     | 1863         | 1863         | 1863           |
| Container query units in orthogonal writing modes                       | 1     | 26           | 0            | 26             |
| Layered property registration                                           | 1     | 15           | 0            | 15             |

| Largest remaining upstream area | jsdom passes still failing or missing |
| ------------------------------- | ------------------------------------- |
| css/css-backgrounds             | 155                                   |
| css/selectors                   | 153                                   |
| css/cssom                       | 129                                   |
| css/css-align                   | 123                                   |
| html/webappapis                 | 111                                   |
| css/css-logical                 | 109                                   |
| css/css-values                  | 92                                    |
| css/css-scroll-snap             | 92                                    |

The intermediate pseudo-element build lost its WPT HTTP service after 56 files in shard 2. Its table entry uses an isolated retry on identical provider code. The final measurement was checked against all 6,738 reference files. [Final WPT and framework runs](https://github.com/BarakChamo/rundom/actions/runs/45036648460) · [Replacement shard 2](https://github.com/BarakChamo/rundom/actions/runs/45033177764) · [Reference shards](https://github.com/BarakChamo/rundom/actions/runs/45018050358) · [Outstanding differences and new losses](./jsdom-31-css-values-wpt-gaps.json)

## Implementation and checks

RunDOM supplies matching declarations, parent styles, attribute identity and registrations to the pinned CSS Values evaluator. The evaluator preserves attribute taint through variables, detects cycles, chooses conditional branches, and can roll back to a losing declaration. Pseudo-elements have their own cascade and inherit from the originating element. Registered properties follow global layer order, including registrations nested in scopes, containers, and starting styles. The CSS evaluator remains lazy. The package installs the upstream jsdom dependency tree. Selector validation now decodes CSS escapes and checks attribute modifiers in the query and stylesheet paths. CSSOM retains the originating shorthand for repeated gap rules until an overlapping write invalidates it. DOMException exposes the Web IDL constants on the realm constructor and its prototype. Typed lengths preserve each eligible size container in the ancestor cascade, including orthogonal writing modes. Tree-dependent CSS values count element siblings from their actual parent. The evaluator handles ident() in custom properties and validates calc-size() against the property grammar.

| Upstream API parser (api = default) | Passed | Failed | Pending |
| ----------------------------------- | ------ | ------ | ------- |
| api                                 | 672    | 0      | 1       |
| rust                                | 672    | 0      | 1       |

The local repository check passed all 15 tasks. The clean packed facade installed as jsdom passed 11 React/Vitest checks in each of four worker pools. The packed CommonJS and ESM runtime examples and all three TypeScript resolution configurations passed.

## Real projects

| Project (pass/fail/skip · wall · max process MiB) | RunDOM                     | jsdom                      | Happy DOM                   | TurboDOM                 | jsdom passes lost |
| ------------------------------------------------- | -------------------------- | -------------------------- | --------------------------- | ------------------------ | ----------------- |
| Vue runtime-dom                                   | 265/5/1 · 6.46 s · 475     | 265/5/1 · 9.44 s · 485     | 251/19/1 · 6.57 s · 453     | 169/32/1 · 4.23 s · 415  | 0                 |
| Svelte runtime and motion                         | 6074/28/34 · 56.68 s · 526 | 6073/29/34 · 56.63 s · 572 | 5823/279/34 · 49.87 s · 566 | 0/0/0 · 9.34 s · 425     | 0                 |
| Material UI, five components                      | 430/0/39 · 12.79 s · 407   | 430/0/39 · 13.92 s · 406   | 454/8/7 · 13.00 s · 469     | 181/281/7 · 7.44 s · 486 | 0                 |

A shorter command with fewer executed tests is a partial run. The matched concurrent workloads below compare equal passing selections.

| Additional selection (pass/fail/skip · wall · max process MiB) | RunDOM                | jsdom                 |
| -------------------------------------------------------------- | --------------------- | --------------------- |
| react                                                          | 64/0/0 · 8.24 s · 720 | 64/0/0 · 2.16 s · 491 |
| supabase                                                       | 85/0/0 · 7.58 s · 203 | 85/0/0 · 9.95 s · 216 |
| freecodecamp                                                   | 4/0/0 · 2.27 s · 192  | 4/0/0 · 2.64 s · 205  |
| drone                                                          | 1/0/0 · 5.81 s · 615  | Suite setup failed    |

These extra-project selections ran RunDOM first on each VM. React used the default Jest transform cache, so its wall-time comparison confounds provider time with cache warmup. Drone failed environment setup on both providers. [Downstream artifacts](https://github.com/BarakChamo/rundom/actions/runs/45036661850)

| Mozilla Readability, complete local Mocha suite | Passed | Failed | Seconds | Max process MiB |
| ----------------------------------------------- | ------ | ------ | ------- | --------------- |
| candidate                                       | 1984   | 0      | 42.88   | 509             |
| reference                                       | 1984   | 0      | 93.66   | 674             |

| Next.js with-vitest example | Passed | Wall seconds in opposite-order rounds | Max process MiB in those rounds |
| --------------------------- | ------ | ------------------------------------- | ------------------------------- |
| candidate                   | 5 / 5  | 6.57 / 7.52                           | 144 / 130                       |
| jsdom                       | 5 / 5  | 12.04 / 9.35                          | 158 / 160                       |
| happy                       | 5 / 5  | 6.42 / 6.31                           | 119 / 119                       |
| turbo                       | 5 / 5  | 4.43 / 3.93                           | 113 / 112                       |

Readability and Next.js ran on the development machine. The concurrency experiments used fresh GitHub-hosted Ubuntu VMs. Physical host exclusivity was unverified.

## Concurrent throughput and memory

Each cell gives completed commands per minute and the larger sampled aggregate peak RSS in MiB. Two cold rounds used opposite provider order and one Vitest worker per command. Throughput divides both rounds’ completions by their combined elapsed time. RSS sums simultaneous process groups at 250 ms intervals and may count shared pages more than once. A dash marks a provider that missed the required outcomes. [Full project runs](https://github.com/BarakChamo/rundom/actions/runs/45036648460) · [Matched four-provider runs](https://github.com/BarakChamo/rundom/actions/runs/45036654965)

### Full selections

| Project                  | Concurrent | RunDOM        | jsdom        | Happy DOM | TurboDOM |
| ------------------------ | ---------- | ------------- | ------------ | --------- | -------- |
| Ant Design               | 1          | 5.40 · 752    | 5.00 · 727   | —         | —        |
| Ant Design               | 2          | 8.86 · 1,490  | 8.15 · 1,463 | —         | —        |
| Ant Design               | 4          | 10.26 · 2,961 | 9.52 · 2,857 | —         | —        |
| Material UI Autocomplete | 1          | 4.95 · 1,034  | 4.65 · 1,151 | —         | —        |
| Material UI Autocomplete | 2          | 8.20 · 2,045  | 7.61 · 2,324 | —         | —        |
| Material UI Autocomplete | 4          | 9.66 · 4,133  | 8.78 · 4,636 | —         | —        |

### Shared passing selections

| Project                  | Concurrent | RunDOM        | jsdom         | Happy DOM     | TurboDOM      |
| ------------------------ | ---------- | ------------- | ------------- | ------------- | ------------- |
| Ant Design               | 1          | 5.97 · 739    | 5.55 · 726    | 6.66 · 707    | 7.26 · 664    |
| Ant Design               | 2          | 9.67 · 1,490  | 9.03 · 1,447  | 10.57 · 1,394 | 11.93 · 1,332 |
| Ant Design               | 4          | 10.87 · 2,938 | 10.41 · 2,887 | 12.33 · 2,777 | 13.74 · 2,655 |
| Material UI Autocomplete | 1          | 10.20 · 853   | 9.57 · 898    | 9.39 · 912    | 12.35 · 758   |
| Material UI Autocomplete | 2          | 16.95 · 1,756 | 15.79 · 1,803 | 16.06 · 1,908 | 21.11 · 1,487 |
| Material UI Autocomplete | 4          | 20.61 · 3,507 | 18.86 · 3,609 | 19.49 · 3,763 | 25.90 · 3,024 |

The shared Ant Design selection contains 116 cases. The shared Material UI selection contains 117 cases across 28 Autocomplete groups. Both full selections require the jsdom outcomes. The release remains gated on compatibility.
