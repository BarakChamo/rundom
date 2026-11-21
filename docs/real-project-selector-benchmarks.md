# Four-provider upstream benchmark results, November 20, 2026

All release timings below use fresh processes on Apple M4 with Node 24.20.0. The runner recorded provider resolution paths. Process wall time includes worker startup and teardown. Summed test-body elapsed times include test hooks. Peak RSS comes from the host high-water counter. The upstream projects used their installed jsdom environments. The package cohort pinned Happy DOM 21.0.4 and TurboDOM 0.7.1.

On the same passing tests, RunDOM took 6.03 s against jsdom’s 7.26 s on Ant Design and 2.24 s against 2.90 s on Material UI. TurboDOM took 5.35 s and 1.95 s respectively. The complete selections expose larger compatibility differences, especially on Material UI. React’s 64 tests took 5.51 s on RunDOM and 5.41 s on jsdom. [Selector and ancestor profiles](selector-and-ancestor-profile.md) · [Frozen provider manifest](../.cache/performance-lab-HtUsDk/cohort.json)

## Full Ant Design and Material UI selections

Pass/fail/pending counts cover eight Ant Design files and five Material UI files. RunDOM and jsdom medians include only runs matching every expected test identity and status. Other providers ran the same file selections and produced different outcomes.

| Project | Provider  | Pass/fail/pending | Runs | Process s | Test bodies s | Process CPU s | Peak MiB |
| ------- | --------- | ----------------- | ---- | --------- | ------------- | ------------- | -------- |
| antd    | RunDOM    | 133/0/0           | 3    | 6.12      | 1.43          | 9.72          | 598.19   |
| antd    | jsdom     | 133/0/0           | 3    | 7.39      | 1.49          | 11.03         | 608.02   |
| antd    | Happy DOM | 128/5/0           | 1    | 6.08      | 1.14          | 9.14          | 595.56   |
| antd    | TurboDOM  | 121/12/0          | 1    | 5.31      | 1.03          | 8.40          | 585.34   |
| mui     | RunDOM    | 430/0/39          | 3    | 7.80      | 5.48          | 7.39          | 337.66   |
| mui     | jsdom     | 430/0/39          | 3    | 9.76      | 6.47          | 10.29         | 356.75   |
| mui     | Happy DOM | 454/8/7           | 1    | 9.08      | 6.45          | 7.68          | 468.53   |
| mui     | TurboDOM  | 181/281/7         | 1    | 7.60      | 0.89          | 6.03          | 394.47   |

### Vitest stages

Vitest reports phase shares as rounded percentages. These are medians of the reported shares from the same processes as the full table. Aggregate shares can differ from 100% after rounding.

| Project | Provider  | environment | transform | setup | import | tests |
| ------- | --------- | ----------- | --------- | ----- | ------ | ----- |
| antd    | RunDOM    | 4%          | 46%       | 19%   | 4%     | 26%   |
| antd    | jsdom     | 24%         | 37%       | 13%   | 3%     | 22%   |
| antd    | Happy DOM | 15%         | 45%       | 15%   | 4%     | 21%   |
| antd    | TurboDOM  | —           | 54%       | 18%   | 5%     | 23%   |
| mui     | RunDOM    | 2%          | 9%        | 5%    | 7%     | 77%   |
| mui     | jsdom     | 13%         | 7%        | 2%    | 6%     | 71%   |
| mui     | Happy DOM | 6%          | 8%        | 3%    | 6%     | 77%   |
| mui     | TurboDOM  | 57%         | 12%       | 4%    | 9%     | 16%   |

## Same passing tests on all four providers

Eight alternating provider rotations per project. Each observation verifies the complete multiset of tests and outcomes against its reference. The two Material UI files are Button and TextField.

| Project | Provider  | Passed | Runs | Process median s | Process IQR s | Test bodies s | Peak MiB |
| ------- | --------- | ------ | ---- | ---------------- | ------------- | ------------- | -------- |
| antd    | RunDOM    | 116    | 8    | 6.03             | 6.02–6.14     | 1.30          | 598.8    |
| antd    | jsdom     | 116    | 8    | 7.26             | 7.22–7.30     | 1.36          | 609.6    |
| antd    | Happy DOM | 116    | 8    | 6.13             | 6.08–6.21     | 1.06          | 588.4    |
| antd    | TurboDOM  | 116    | 8    | 5.35             | 5.32–5.39     | 0.95          | 564.6    |
| mui     | RunDOM    | 118    | 8    | 2.24             | 2.21–2.27     | 0.55          | 307.9    |
| mui     | jsdom     | 118    | 8    | 2.90             | 2.83–2.98     | 0.79          | 309.1    |
| mui     | Happy DOM | 118    | 8    | 2.24             | 2.22–2.33     | 0.47          | 309.9    |
| mui     | TurboDOM  | 118    | 8    | 1.95             | 1.94–1.95     | 0.36          | 310.6    |

## Other upstream Vitest projects

The screen columns give pass/fail/pending and full-selection wall time. Common columns use the intersection of passing test identities, matched again on each run. A provider that collected no tests contributes no comparable timing. The broad Svelte screen covers the selected runtime-runes, runtime-legacy and motion projects.

| Project            | Provider  | Pass/fail/pending | Exit | Screen peak MiB | Screen s | Shared tests | Runs | Shared process s | Shared test s | Shared peak MiB |
| ------------------ | --------- | ----------------- | ---- | --------------- | -------- | ------------ | ---- | ---------------- | ------------- | --------------- |
| vue-core           | RunDOM    | 270/0/1           | 0    | 394.9           | 2.69     | 159          | 3    | 2.02             | 0.22          | 334.7           |
| vue-core           | jsdom     | 270/0/1           | 0    | 512.7           | 6.49     | 159          | 3    | 4.94             | 0.20          | 473.5           |
| vue-core           | Happy DOM | 251/19/1          | 1    | 403.4           | 3.71     | 159          | 3    | 2.85             | 0.15          | 329.4           |
| vue-core           | TurboDOM  | 169/32/1          | 1    | 343.5           | 2.20     | 159          | 3    | 1.84             | 0.16          | 274.0           |
| svelte-runes-shard | RunDOM    | 565/0/9           | 0    | 356.5           | 5.86     | 561          | 3    | 5.75             | 4.67          | 356.3           |
| svelte-runes-shard | jsdom     | 565/0/9           | 0    | 340.9           | 6.40     | 561          | 3    | 6.11             | 4.88          | 342.2           |
| svelte-runes-shard | Happy DOM | 561/4/9           | 1    | 366.7           | 5.77     | 561          | 3    | 5.76             | 4.61          | 367.0           |
| svelte-runes-shard | TurboDOM  | 0/0/0             | 1    | 191.2           | 0.85     | —            | —    | —                | —             | —               |
| svelte-motion      | RunDOM    | 8/0/0             | 0    | 186.5           | 0.87     | 8            | 3    | 0.89             | 0.00          | 184.9           |
| svelte-motion      | jsdom     | 8/0/0             | 0    | 185.0           | 1.01     | 8            | 3    | 0.99             | 0.00          | 185.6           |
| svelte-motion      | Happy DOM | 8/0/0             | 0    | 190.0           | 0.98     | 8            | 3    | 0.96             | 0.00          | 186.4           |
| svelte-motion      | TurboDOM  | 0/0/0             | 1    | 178.3           | 0.68     | —            | —    | —                | —             | —               |
| next-example       | RunDOM    | 5/0/0             | 0    | 149.8           | 1.09     | 5            | 3    | 1.11             | 0.05          | 148.8           |
| next-example       | jsdom     | 5/0/0             | 0    | 152.9           | 1.96     | 5            | 3    | 1.61             | 0.12          | 152.6           |
| next-example       | Happy DOM | 5/0/0             | 0    | 123.2           | 1.36     | 5            | 3    | 1.35             | 0.04          | 119.5           |
| next-example       | TurboDOM  | 5/0/0             | 0    | 114.7           | 0.97     | 5            | 3    | 0.98             | 0.04          | 115.8           |
| freecodecamp       | RunDOM    | 4/0/0             | 0    | 180.5           | 1.05     | 4            | 3    | 1.06             | 0.04          | 180.5           |
| freecodecamp       | jsdom     | 4/0/0             | 0    | 185.0           | 1.86     | 4            | 3    | 1.28             | 0.08          | 184.9           |
| freecodecamp       | Happy DOM | 4/0/0             | 0    | 177.7           | 1.16     | 4            | 3    | 1.14             | 0.04          | 177.4           |
| freecodecamp       | TurboDOM  | 4/0/0             | 0    | 152.7           | 0.97     | 4            | 3    | 1.00             | 0.03          | 152.5           |
| supabase-ui        | RunDOM    | 85/0/0            | 0    | 189.5           | 4.22     | 80           | 3    | 4.13             | 0.61          | 188.3           |
| supabase-ui        | jsdom     | 85/0/0            | 0    | 309.3           | 8.10     | 80           | 3    | 7.45             | 1.46          | 309.3           |
| supabase-ui        | Happy DOM | 84/1/0            | 1    | 176.5           | 4.77     | 80           | 3    | 4.65             | 0.49          | 176.8           |
| supabase-ui        | TurboDOM  | 80/5/0            | 1    | 158.3           | 4.73     | 80           | 3    | 3.57             | 0.52          | 157.6           |
| svelte             | RunDOM    | 6012/90/34        | 1    | 566.9           | 33.07    | —            | —    | —                | —             | —               |
| svelte             | jsdom     | 6102/0/34         | 0    | 541.6           | 33.91    | —            | —    | —                | —             | —               |
| svelte             | Happy DOM | 5823/279/34       | 1    | 555.3           | 32.99    | —            | —    | —                | —             | —               |
| svelte             | TurboDOM  | 0/0/0             | 1    | 424.8           | 6.47     | —            | —    | —                | —             | —               |

## Native Jest selections

Each environment used its native Jest adapter or the upstream jsdom environment with the RunDOM package alias. Three Scully tests explicitly instantiate jsdom. The globals-only row removes that file.

| Project        | Provider  | Passed | Failed | Exit | Matched runs | Matched process s | Peak MiB |
| -------------- | --------- | ------ | ------ | ---- | ------------ | ----------------- | -------- |
| react          | RunDOM    | 64     | 0      | 0    | 3            | 5.51              | 843.6    |
| react          | jsdom     | 64     | 0      | 0    | 3            | 5.41              | 907.0    |
| react          | Happy DOM | 63     | 1      | 1    | 0            | —                 | —        |
| react          | TurboDOM  | 61     | 3      | 1    | 0            | —                 | —        |
| drone          | RunDOM    | 1      | 0      | 0    | 3            | 3.86              | 633.2    |
| drone          | jsdom     | 1      | 0      | 0    | 3            | 4.20              | 645.7    |
| drone          | Happy DOM | 1      | 0      | 0    | 3            | 4.29              | 648.1    |
| drone          | TurboDOM  | 0      | 1      | 1    | 0            | —                 | —        |
| scully         | RunDOM    | 8      | 0      | 0    | 3            | 1.25              | 479.9    |
| scully         | jsdom     | 8      | 0      | 0    | 3            | 1.50              | 467.7    |
| scully         | Happy DOM | 0      | 0      | 1    | 0            | —                 | —        |
| scully         | TurboDOM  | 8      | 0      | 0    | 3            | 1.74              | 475.5    |
| scully-globals | RunDOM    | 5      | 0      | 0    | 3            | 1.05              | 435.5    |
| scully-globals | jsdom     | 5      | 0      | 0    | 3            | 1.19              | 430.2    |
| scully-globals | Happy DOM | 0      | 0      | 1    | 0            | —                 | —        |
| scully-globals | TurboDOM  | 5      | 0      | 0    | 3            | 1.01              | 404.0    |

Counts in the broad Svelte run matched the previous RunDOM replay at all 6,136 test identities and statuses. The 90 failures are visible in the comparison against stock jsdom. [Outcome comparison](../.cache/release-ancestor-cascade-bA1HLk/real/case-validation.json) · [Four-provider timing samples](../.cache/release-ancestor-cascade-bA1HLk/four/trials.jsonl)

### Retained memory on the common Material UI selection

Four runs per provider measured post-teardown heap after two forced collections on the same 118 tests. These are medians in MiB. [Worker measurements](../.cache/release-ancestor-cascade-bA1HLk/shared-retained/medians.json)

| Worker    | RunDOM | jsdom | Happy DOM | TurboDOM |
| --------- | -----: | ----: | --------: | -------: |
| Button    |   54.5 |  72.6 |      47.8 |     39.1 |
| TextField |   57.7 |  77.7 |      52.5 |     43.8 |

### React and Testing Library in four Vitest pools

The eight-workflow fixture ran in nine fresh processes per eligible provider and pool. Its three RunDOM package archives matched the measured release byte for byte. Times are median whole-process milliseconds. In forks and threads, TurboDOM passed seven tests and failed native activation of a controlled checkbox. Its VM pools completed no tests. [Runner report](../.cache/release-ancestor-cascade-bA1HLk/react-grid.json)

| Pool      | RunDOM | jsdom | Happy DOM | TurboDOM |
| --------- | -----: | ----: | --------: | -------: |
| forks     |  399.9 | 616.5 |     436.3 |        — |
| threads   |  380.7 | 585.2 |     414.5 |        — |
| vmForks   |  448.8 | 618.5 |     449.2 |        — |
| vmThreads |  462.4 | 637.7 |     463.7 |        — |

## Remaining DOM timing and memory gaps

On the 44 standard scenarios, RunDOM completed 44, jsdom 43, Happy DOM 38 and TurboDOM 36. RunDOM had lower total process time than jsdom in all 43 comparable scenarios and than Happy DOM in all 38. Against TurboDOM it had lower total time in 8 of 36, lower warm-batch time in 12, and lower peak RSS in 3. At 4,096 nodes, parsing followed by traversal took 274.0 ms end to end on RunDOM and 167.0 ms on TurboDOM. The warm batch took 11.91 ms and 3.28 ms respectively. With 32 live styled Windows, peak RSS was 175.6 MiB on RunDOM, 344.3 MiB on jsdom, 389.7 MiB on Happy DOM and 117.9 MiB on TurboDOM. [Complete stage timings, memory checkpoints and failed screens](selector-benchmark-stages.md)
