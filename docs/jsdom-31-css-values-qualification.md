# CSS Values qualification against jsdom 31.0.1

November 22, 2026. Candidate `c27dc83`. Reference jsdom 31.0.1, Happy DOM 21.0.4 and TurboDOM 0.7.1. The preceding RunDOM measurement used `2af947b`. [Candidate source](https://github.com/BarakChamo/rundom/tree/c27dc83) · [Previous qualification](./jsdom-31-css-qualification.md)

## Compatibility

| Suite           | Files | jsdom passes | Also pass | Recovered since prior build | New losses since prior build | Fail | Missing | RunDOM passes a jsdom failure | Lost harness completions |
| --------------- | ----- | ------------ | --------- | --------------------------- | ---------------------------- | ---- | ------- | ----------------------------- | ------------------------ |
| Upstream WPT    | 6738  | 235917       | 232199    | 2470                        | 25                           | 3648 | 70      | 4049                          | 66                       |
| jsdom-local WPT | 475   | 5260         | 4703      | 209                         | 0                            | 557  | 0       | 1                             | 7                        |

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
| [Typed dimensions, container axes and identifiers](https://github.com/BarakChamo/rundom/actions/runs/45035353061)       | c27dc83 | 232199                  | 4703                       |

| Focused selection                                                       | Files | jsdom passes | Prior RunDOM | Current RunDOM |
| ----------------------------------------------------------------------- | ----- | ------------ | ------------ | -------------- |
| All attr-* and if-* CSS Values HTML files                               | 25    | 554          | 32           | 554            |
| Attribute namespace XHTML                                               | 1     | 5            | 1            | 5              |
| CSS math selections                                                     | 56    | 2158         | 1352         | 2107           |
| All CSS Values files                                                    | 168   | 4176         | 2593         | 4078           |
| Attribute selector flags                                                | 1     | 528          | 456          | 528            |
| CSS filters, image sets, text decorations, gap rules, scroll buttons    | 5     | 394          | 149          | 394            |
| DOMException constants                                                  | 1     | 51           | 1            | 51             |
| Intrinsic size calculations, angle comparisons and computed identifiers | 4     | 153          | 74           | 153            |
| Relative colors                                                         | 3     | 1863         | 1863         | 1863           |
| Container query units in orthogonal writing modes                       | 1     | 26           | 0            | 26             |
| Layered property registration                                           | 1     | 15           | 0            | 15             |

| Largest remaining upstream area | jsdom passes still failing or missing |
| ------------------------------- | ------------------------------------- |
| css/css-fonts                   | 229                                   |
| css/css-color                   | 178                                   |
| css/css-backgrounds             | 164                                   |
| css/css-masking                 | 160                                   |
| css/cssom                       | 154                                   |
| css/selectors                   | 153                                   |
| css/css-text                    | 143                                   |
| css/css-align                   | 123                                   |

The intermediate pseudo-element build lost its WPT HTTP service after 56 files in shard 2. Its table entry uses an isolated retry on identical provider code. The final measurement was checked against all 6,738 reference files. [Final WPT and framework runs](https://github.com/BarakChamo/rundom/actions/runs/45035353061) · [Replacement shard 2](https://github.com/BarakChamo/rundom/actions/runs/45033177764) · [Reference shards](https://github.com/BarakChamo/rundom/actions/runs/45018050358) · [Outstanding differences and new losses](./jsdom-31-css-values-wpt-gaps.json)

## Implementation and checks

RunDOM supplies matching declarations, parent styles, attribute identity and registrations to the pinned CSS Values evaluator. The evaluator preserves attribute taint through variables, detects cycles, chooses conditional branches, and can roll back to a losing declaration. Pseudo-elements have their own cascade and inherit from the originating element. Registered properties follow global layer order, including registrations nested in scopes, containers, and starting styles. The CSS evaluator remains lazy. The package installs the upstream jsdom dependency tree. Selector validation now decodes CSS escapes and checks attribute modifiers in the query and stylesheet paths. CSSOM retains the originating shorthand for repeated gap rules until an overlapping write invalidates it. DOMException exposes the Web IDL constants on the realm constructor and its prototype. Typed lengths preserve each eligible size container in the ancestor cascade, including orthogonal writing modes. Tree-dependent CSS values count element siblings from their actual parent. The evaluator handles ident() in custom properties and validates calc-size() against the property grammar.

| Upstream API parser (api = default) | Passed | Failed | Pending |
| ----------------------------------- | ------ | ------ | ------- |
| api                                 | 672    | 0      | 1       |
| rust                                | 672    | 0      | 1       |

The local repository check passed all 15 tasks on a serial retry after overlapping gate runs timed out. The first Rust API run failed the fromURL Accept-header server case with a text/plain response. The complete Rust API rerun passed all 672 reference cases. The clean packed facade installed as jsdom passed 11 React/Vitest checks in each of four worker pools. The packed CommonJS and ESM runtime examples and all three TypeScript resolution configurations passed.

## Real projects

| Project (pass/fail/skip · wall · max process MiB) | RunDOM                     | jsdom                      | Happy DOM                   | TurboDOM                 | jsdom passes lost |
| ------------------------------------------------- | -------------------------- | -------------------------- | --------------------------- | ------------------------ | ----------------- |
| Vue runtime-dom                                   | 265/5/1 · 4.91 s · 449     | 265/5/1 · 9.20 s · 541     | 251/19/1 · 6.40 s · 518     | 169/32/1 · 4.06 s · 409  | 0                 |
| Svelte runtime and motion                         | 6074/28/34 · 54.89 s · 596 | 6073/29/34 · 53.20 s · 545 | 5823/279/34 · 47.91 s · 537 | 0/0/0 · 8.69 s · 427     | 0                 |
| Material UI, five components                      | 430/0/39 · 13.11 s · 412   | 430/0/39 · 14.13 s · 403   | 454/8/7 · 13.05 s · 443     | 181/281/7 · 7.41 s · 462 | 0                 |

A shorter command with fewer executed tests is a partial run. The matched concurrent workloads below compare equal passing selections.

| Additional selection (pass/fail/skip · wall · max process MiB) | RunDOM                | jsdom                  |
| -------------------------------------------------------------- | --------------------- | ---------------------- |
| react                                                          | 64/0/0 · 8.08 s · 740 | 64/0/0 · 2.06 s · 489  |
| supabase                                                       | 85/0/0 · 7.49 s · 198 | 85/0/0 · 11.35 s · 217 |
| freecodecamp                                                   | 4/0/0 · 1.77 s · 173  | 4/0/0 · 2.29 s · 204   |
| drone                                                          | 1/0/0 · 8.16 s · 608  | Suite setup failed     |

These extra-project selections ran RunDOM first on each VM. React used the default Jest transform cache, so its wall-time comparison confounds provider time with cache warmup. Drone failed environment setup on both providers. [Downstream artifacts](https://github.com/BarakChamo/rundom/actions/runs/45035379276)

| Mozilla Readability, complete local Mocha suite | Passed | Failed | Seconds | Max process MiB |
| ----------------------------------------------- | ------ | ------ | ------- | --------------- |
| candidate                                       | 1984   | 0      | 22.90   | 821             |
| reference                                       | 1984   | 0      | 65.37   | 1837            |

| Next.js with-vitest example | Passed | Wall seconds in opposite-order rounds | Max process MiB in those rounds |
| --------------------------- | ------ | ------------------------------------- | ------------------------------- |
| candidate                   | 5 / 5  | 3.35 / 2.20                           | 118 / 116                       |
| jsdom                       | 5 / 5  | 4.85 / 3.02                           | 164 / 163                       |
| happy                       | 5 / 5  | 2.55 / 2.36                           | 119 / 118                       |
| turbo                       | 5 / 5  | 2.35 / 1.89                           | 116 / 116                       |

Readability and Next.js ran on the development machine. The concurrency experiments used fresh GitHub-hosted Ubuntu VMs. Physical host exclusivity was unverified.

## Concurrent throughput and memory

Each cell gives completed commands per minute and the larger sampled aggregate peak RSS in MiB. Two cold rounds used opposite provider order and one Vitest worker per command. Throughput divides both rounds’ completions by their combined elapsed time. RSS sums simultaneous process groups at 250 ms intervals and may count shared pages more than once. A dash marks a provider that missed the required outcomes. [Full project runs](https://github.com/BarakChamo/rundom/actions/runs/45035353061) · [Matched four-provider runs](https://github.com/BarakChamo/rundom/actions/runs/45035366039)

### Full selections

| Project                  | Concurrent | RunDOM       | jsdom        | Happy DOM | TurboDOM |
| ------------------------ | ---------- | ------------ | ------------ | --------- | -------- |
| Ant Design               | 1          | 3.79 · 745   | 3.40 · 719   | —         | —        |
| Ant Design               | 2          | 6.22 · 1,472 | 5.64 · 1,479 | —         | —        |
| Ant Design               | 4          | 7.32 · 2,913 | 6.71 · 2,873 | —         | —        |
| Material UI Autocomplete | 1          | 4.00 · 1,016 | 3.84 · 1,148 | —         | —        |
| Material UI Autocomplete | 2          | 6.92 · 2,083 | 6.53 · 2,319 | —         | —        |
| Material UI Autocomplete | 4          | 8.15 · 4,075 | 7.51 · 4,684 | —         | —        |

### Shared passing selections

| Project                  | Concurrent | RunDOM        | jsdom         | Happy DOM     | TurboDOM      |
| ------------------------ | ---------- | ------------- | ------------- | ------------- | ------------- |
| Ant Design               | 1          | 5.59 · 725    | 5.05 · 724    | 6.02 · 701    | 6.80 · 658    |
| Ant Design               | 2          | 9.01 · 1,478  | 8.21 · 1,457  | 9.75 · 1,392  | 10.79 · 1,330 |
| Ant Design               | 4          | 10.37 · 2,926 | 9.49 · 2,862  | 11.27 · 2,776 | 12.53 · 2,658 |
| Material UI Autocomplete | 1          | 7.33 · 861    | 6.59 · 921    | 6.80 · 912    | 9.07 · 733    |
| Material UI Autocomplete | 2          | 11.96 · 1,747 | 10.27 · 1,841 | 10.95 · 1,861 | 14.66 · 1,498 |
| Material UI Autocomplete | 4          | 13.65 · 3,487 | 12.28 · 3,583 | 12.79 · 3,760 | 17.08 · 3,007 |

The shared Ant Design selection contains 116 cases. The shared Material UI selection contains 117 cases across 28 Autocomplete groups. Both full selections require the jsdom outcomes. The release remains gated on compatibility.
