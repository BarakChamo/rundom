# Real-project RunDOM benchmark replay

The replay covers Vue, Ant Design, Material UI, Svelte, the Next.js Vitest example, freeCodeCamp, Supabase UI, React, Drone, and Scully. It uses the same installed upstream selections with the frozen computed-cascade and viewport-aware build. The selected files, projects, and test identities are recorded with the raw runner results. The host was shared. Timing trials ran in fresh serial processes with provider rotation and disabled runner caches.

Node v24.20.0 on Apple M4 (darwin/arm64). Happy DOM 21.0.4 and TurboDOM 0.7.1. The jsdom runs use each repository’s installed version. The React integration uses its own pinned jsdom consumer.

[Frozen provider manifests](../.cache/performance-lab-drN2lZ/cohort.json) · [Upstream revisions](../.cache/cascade-real-replay-evjWsu/upstream-manifest.json)

The four repeated full Vitest pairs all had lower RunDOM process medians. Vue and Ant Design had slightly faster test bodies under jsdom. The phase breakdown shows that much of RunDOM's process-time lead on those two projects came from the environment phase. Whole-runner RSS was higher for RunDOM in full Material UI and nearly tied in full Ant Design. [Cascade optimization and profiling](cascade-role-optimization.md)

The RunDOM screens reproduced all named case outcomes from the prior replay. Full Svelte had the same 90 failures, and the stock Scully runner had the existing three teardown errors. The Scully comparison uses the same teardown guard for both providers. Upstream Jest environments were exercised against stock jsdom and the RunDOM alias. Matching Vitest work and the installed React integration exercised the available four-provider comparisons.

## Vitest coverage

Cells show passed / failed / skipped or todo and the full-screen process time. A runner failure may terminate collection. A dagger marks a nonzero runner exit with no individual failed test. Full-screen times reflect the work each provider completed.

| Selection              | RunDOM                    | jsdom                    | Happy DOM                  | TurboDOM                 |
| ---------------------- | ------------------------- | ------------------------ | -------------------------- | ------------------------ |
| Ant Design             | 133 / 0 / 0 (73.228 s)    | 133 / 0 / 0 (73.230 s)   | 128 / 5 / 0 (43.005 s)     | 121 / 12 / 0 (30.718 s)  |
| Vue runtime-dom        | 270 / 0 / 1 (5.412 s)     | 270 / 0 / 1 (12.251 s)   | 251 / 19 / 1 (6.585 s)     | 169 / 32 / 1 (3.949 s)   |
| Material UI            | 430 / 0 / 39 (29.586 s)   | 430 / 0 / 39 (36.393 s)  | 454 / 8 / 7 (26.764 s)     | 181 / 281 / 7 (16.708 s) |
| Svelte runes shard     | 565 / 0 / 9 (9.278 s)     | 565 / 0 / 9 (13.073 s)   | 561 / 4 / 9 (11.223 s)     | Runner failed (1.678 s)  |
| Svelte motion          | 8 / 0 / 0 (3.902 s)       | 8 / 0 / 0 (4.750 s)      | 8 / 0 / 0 (7.539 s)        | Runner failed (2.329 s)  |
| Next.js Vitest example | 5 / 0 / 0 (1.896 s)       | 5 / 0 / 0 (3.273 s)      | 5 / 0 / 0 (2.605 s)        | 5 / 0 / 0 (1.622 s)      |
| freeCodeCamp client    | 4 / 0 / 0 (1.628 s)       | 4 / 0 / 0 (2.862 s)      | 4 / 0 / 0 (1.944 s)        | 4 / 0 / 0 (3.093 s)      |
| Supabase UI            | 85 / 0 / 0 (15.998 s)     | 85 / 0 / 0 (28.314 s)    | 84 / 1 / 0 (17.798 s)      | 80 / 5 / 0 (14.734 s)    |
| Svelte runtime suite   | 6012 / 90 / 34 (44.170 s) | 6102 / 0 / 34 (57.861 s) | 5823 / 279 / 34 (47.492 s) | Runner failed (11.358 s) |

[Vitest screens and trial results](../.cache/cascade-real-replay-evjWsu/vitest/results.json) · [Verified provider paths, versions, and named screen outcomes](../.cache/cascade-real-replay-evjWsu/verified-evidence.json)

## Matched Vitest performance

Each cell gives median process seconds / summed assertion duration in milliseconds / peak RSS in MiB. A row uses exactly the same passing case identities on every displayed provider. Timed attempts with incomplete work or differing case identities remain in the raw results.

| Selection              | Passed per trial | RunDOM                | jsdom                 | Happy DOM             | TurboDOM              |
| ---------------------- | ---------------- | --------------------- | --------------------- | --------------------- | --------------------- |
| Ant Design             | 116              | 18.385 / 3582 / 597.3 | 23.815 / 4172 / 591.2 | 14.561 / 2049 / 554.7 | 17.833 / 2611 / 561.7 |
| Vue runtime-dom        | 159              | 5.938 / 593 / 337.5   | 18.512 / 588 / 472.0  | 10.476 / 422 / 323.0  | 5.971 / 361 / 303.8   |
| Material UI            | 161              | 10.730 / 2154 / 320.0 | 4.721 / 1494 / 310.5  | 3.604 / 893 / 312.3   | —                     |
| Material UI            | 118              | 5.876 / 1744 / 310.8  | 8.189 / 2002 / 305.0  | 10.490 / 1432 / 297.0 | 7.630 / 1283 / 257.2  |
| Svelte runes shard     | 561              | 9.751 / 7512 / 361.0  | 14.311 / 9137 / 323.4 | 11.093 / 7393 / 365.7 | —                     |
| Svelte motion          | 8                | 2.183 / 5 / 185.9     | 2.677 / 5 / 183.5     | 2.486 / 3 / 185.9     | —                     |
| Next.js Vitest example | 5                | 1.848 / 85 / 147.7    | 2.847 / 205 / 153.7   | 2.165 / 74 / 118.8    | 1.620 / 64 / 116.5    |
| freeCodeCamp client    | 4                | 2.968 / 101 / 188.2   | 3.958 / 210 / 186.1   | 4.464 / 118 / 177.9   | 2.655 / 88 / 152.7    |
| Supabase UI            | 80               | 13.700 / 1935 / 197.3 | 29.804 / 5383 / 303.2 | 16.856 / 1668 / 178.4 | 12.590 / 1642 / 161.2 |

| Selection   | Cases attempted | Incomplete timing series |
| ----------- | --------------- | ------------------------ |
| Material UI | 161             | TurboDOM                 |

Elapsed ranges across the three verified trials in each displayed series, in seconds.

| Selection              | Cases | RunDOM        | jsdom         | Happy DOM     | TurboDOM      |
| ---------------------- | ----- | ------------- | ------------- | ------------- | ------------- |
| Ant Design             | 116   | 10.487–59.871 | 17.298–29.980 | 11.149–34.208 | 8.615–25.233  |
| Vue runtime-dom        | 159   | 4.221–8.433   | 8.529–21.221  | 7.070–12.708  | 3.369–7.926   |
| Material UI            | 161   | 5.217–11.398  | 4.506–14.813  | 3.552–11.198  | —             |
| Material UI            | 118   | 3.376–7.140   | 3.351–18.310  | 5.075–11.915  | 5.304–11.040  |
| Svelte runes shard     | 561   | 9.234–16.933  | 8.616–15.685  | 7.604–14.386  | —             |
| Svelte motion          | 8     | 1.549–3.835   | 1.679–5.098   | 2.079–3.992   | —             |
| Next.js Vitest example | 5     | 1.701–2.041   | 2.741–2.911   | 2.147–2.264   | 1.511–1.626   |
| freeCodeCamp client    | 4     | 2.310–4.989   | 3.385–4.014   | 2.693–4.786   | 2.165–2.908   |
| Supabase UI            | 80    | 7.526–15.226  | 20.303–34.300 | 15.675–19.477 | 12.425–15.397 |

Median user plus system CPU from the runner’s operating-system timing log, in seconds.

| Selection              | Cases | RunDOM | jsdom | Happy DOM | TurboDOM |
| ---------------------- | ----- | ------ | ----- | --------- | -------- |
| Ant Design             | 116   | 23.06  | 28.88 | 18.54     | 20.88    |
| Vue runtime-dom        | 159   | 6.77   | 20.77 | 11.35     | 7.01     |
| Material UI            | 161   | 11.77  | 6.95  | 5.11      | —        |
| Material UI            | 118   | 7.66   | 10.79 | 9.79      | 8.79     |
| Svelte runes shard     | 561   | 8.97   | 13.22 | 10.47     | —        |
| Svelte motion          | 8     | 2.53   | 2.88  | 2.92      | —        |
| Next.js Vitest example | 5     | 2.25   | 3.29  | 2.60      | 1.94     |
| freeCodeCamp client    | 4     | 3.63   | 4.51  | 4.63      | 3.19     |
| Supabase UI            | 80    | 16.57  | 31.41 | 18.30     | 14.59    |

## Previously selected full Vitest workloads

These repeated pairs require all named statuses, including skips, to match each repository’s jsdom screen.

| Selection       | Passed per trial | RunDOM                | jsdom                 | Wall ranges in s (RunDOM / jsdom) | Valid pairs |
| --------------- | ---------------- | --------------------- | --------------------- | --------------------------------- | ----------- |
| Vue runtime-dom | 270              | 3.846 / 506 / 404.4   | 8.754 / 435 / 512.3   | 2.968–7.227 / 7.389–16.759        | 3           |
| Ant Design      | 133              | 10.615 / 2706 / 625.9 | 13.219 / 2603 / 623.9 | 10.502–12.298 / 12.727–14.018     | 3           |
| Material UI     | 430              | 12.261 / 7945 / 410.2 | 13.941 / 8413 / 363.2 | 11.956–14.827 / 13.713–21.029     | 3           |
| Supabase UI     | 85               | 6.405 / 1094 / 195.9  | 13.972 / 2869 / 311.0 | 5.703–7.016 / 12.094–14.101       | 3           |

[Full selection timings and attempt failures](../.cache/cascade-real-replay-evjWsu/vitest/full-results.json)

## Full Vitest timing by phase

Values are median seconds. Runner output that reports percentages is converted to seconds, so those phase timings are approximate. Vitest can overlap phases and reports its own duration inside the full process.

| Selection       | Provider | Transform | Setup | Import or collect | Environment | Tests | Process |
| --------------- | -------- | --------: | ----: | ----------------: | ----------: | ----: | ------: |
| Vue runtime-dom | RunDOM   |      0.42 |  0.05 |              1.25 |        0.63 |  0.52 |    3.85 |
| Vue runtime-dom | jsdom    |      0.38 |  0.09 |              1.14 |        5.72 |  0.45 |    8.75 |
| Ant Design      | RunDOM   |      4.64 |  1.86 |              0.48 |        0.41 |  2.89 |   10.62 |
| Ant Design      | jsdom    |      4.99 |  1.61 |              0.50 |        2.98 |  2.73 |   13.22 |
| Material UI     | RunDOM   |      1.69 |  0.57 |              0.92 |        0.23 |  8.27 |   12.26 |
| Material UI     | jsdom    |      1.31 |  0.40 |              0.94 |        2.27 |  8.69 |   13.94 |
| Supabase UI     | RunDOM   |      0.25 |  2.17 |              1.68 |        0.68 |  1.37 |    6.40 |
| Supabase UI     | jsdom    |      0.28 |  1.79 |              1.93 |        6.34 |  3.20 |   13.97 |

## Upstream Jest workloads

Cells give median process seconds / peak RSS in MiB. These custom Jest environments use their stock jsdom dependency or the RunDOM alias.

| Selection                                             | Passed per trial | RunDOM        | jsdom         |
| ----------------------------------------------------- | ---------------- | ------------- | ------------- |
| React CSS and DOM                                     | 64               | 7.238 / 841.0 | 8.749 / 840.8 |
| Drone                                                 | 1                | 5.970 / 635.4 | 4.393 / 645.8 |
| Scully with the same teardown guard on both providers | 8                | 1.318 / 494.2 | 1.516 / 468.2 |

| Scully environment | RunDOM passed / failed / runtime errors | jsdom passed / failed / runtime errors |
| ------------------ | --------------------------------------- | -------------------------------------- |
| Stock Jest         | 0 / 0 / 3                               | 8 / 0 / 0                              |

[Jest trials](../.cache/cascade-real-replay-evjWsu/jest/jest-timing-results.json) · [Scully guarded trials](../.cache/cascade-real-replay-evjWsu/jest/scully-final-results.json) · [Scully stock reports](../.cache/cascade-real-replay-evjWsu/jest/scully-stock-results.json)

## React and Testing Library integration

This installed-consumer workload includes eight existing workflows and two state and keyed-list stress tests. Cells give median process seconds / assertion milliseconds / worker RSS in MiB. RSS in fork pools is sampled inside the worker.

| Vitest pool | RunDOM              | jsdom               | Happy DOM                                 | TurboDOM                                  |
| ----------- | ------------------- | ------------------- | ----------------------------------------- | ----------------------------------------- |
| forks       | 1.011 / 457 / 300.5 | 1.702 / 759 / 331.8 | Screen or trial failed (0/9 valid trials) | Screen or trial failed (0/9 valid trials) |
| threads     | 0.931 / 435 / 320.8 | 1.612 / 717 / 377.1 | Screen or trial failed (0/9 valid trials) | Screen or trial failed (0/9 valid trials) |
| vmForks     | 0.900 / 440 / 301.2 | 1.306 / 710 / 344.7 | Screen or trial failed (0/9 valid trials) | Screen or trial failed (0/9 valid trials) |
| vmThreads   | 0.910 / 460 / 366.9 | 1.369 / 779 / 393.9 | Screen or trial failed (0/9 valid trials) | Screen or trial failed (0/9 valid trials) |

[React integration raw results](../.cache/cascade-real-replay-evjWsu/react-integration.json)
