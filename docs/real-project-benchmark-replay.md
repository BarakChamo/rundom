# Real-project RunDOM benchmark replay

The benchmark uses previously exercised, installed upstream workloads with the frozen packed-branch and detached-ID build. The selected files, projects, and test identities are recorded with the raw runner results. The host was shared. Timing trials ran in fresh serial processes with provider rotation and disabled runner caches.

Node v24.20.0 on Apple M4 (darwin/arm64). Happy DOM 21.0.4 and TurboDOM 0.7.1. The jsdom runs use each repository’s installed version. The React integration uses its own pinned jsdom consumer.

[Frozen provider manifests](../.cache/performance-lab-X1fHGE/cohort.json) · [Upstream revisions](../.cache/real-project-replay-PDVg4L/upstream-manifest.json)

## Results at a glance

RunDOM had the lower elapsed median in all four full selections repeated against jsdom. Its peak RSS was lower for Vue and Supabase UI and higher for Ant Design and Material UI. In the six selections with complete timing series from all four providers, RunDOM led freeCodeCamp and TurboDOM led the other five. The 116-case and 133-case Ant Design timings cover different selections and sampling periods. The shared-host ranges show how large the process-time variation was.

## Vitest coverage

Cells show passed / failed / skipped or todo and the full-screen process time. A runner failure may terminate collection. A dagger marks a nonzero runner exit with no individual failed test. Full-screen times reflect the work each provider completed.

| Selection              | RunDOM                     | jsdom                    | Happy DOM                   | TurboDOM                 |
| ---------------------- | -------------------------- | ------------------------ | --------------------------- | ------------------------ |
| Vue runtime-dom        | 270 / 0 / 1 (10.619 s)     | 270 / 0 / 1 (26.923 s)   | 251 / 19 / 1 (16.407 s)     | 169 / 32 / 1 (9.179 s)   |
| Ant Design             | 133 / 0 / 0 (23.656 s)     | 133 / 0 / 0 (32.971 s)   | 128 / 5 / 0 (24.055 s)      | 121 / 12 / 0 (21.836 s)  |
| Material UI            | 430 / 0 / 39 (33.605 s)    | 430 / 0 / 39 (57.586 s)  | 454 / 8 / 7 (32.320 s)      | 181 / 281 / 7 (14.399 s) |
| Svelte runes shard     | 565 / 0 / 9 (6.038 s)      | 565 / 0 / 9 (6.954 s)    | 561 / 4 / 9 (6.043 s)       | Runner failed (0.976 s)  |
| Svelte motion          | 8 / 0 / 0 (1.571 s)        | 8 / 0 / 0 (1.731 s)      | 8 / 0 / 0 (1.844 s)         | Runner failed (0.982 s)  |
| Next.js Vitest example | 5 / 0 / 0 (1.942 s)        | 5 / 0 / 0 (5.129 s)      | 5 / 0 / 0 (2.358 s)         | 5 / 0 / 0 (1.732 s)      |
| freeCodeCamp client    | 4 / 0 / 0 (2.312 s)        | 4 / 0 / 0 (2.813 s)      | 4 / 0 / 0 (1.725 s)         | 4 / 0 / 0 (4.198 s)      |
| Supabase UI            | 85 / 0 / 0 (12.438 s)      | 85 / 0 / 0 (15.805 s)    | 84 / 1 / 0 (22.039 s)       | 80 / 5 / 0 (14.294 s)    |
| Svelte runtime suite   | 6012 / 90 / 34 (140.769 s) | 6102 / 0 / 34 (90.548 s) | 5823 / 279 / 34 (107.112 s) | Runner failed (13.511 s) |

[Vitest screens and trial results](../.cache/real-project-replay-PDVg4L/vitest/results.json) · [Verified provider paths, versions, and named screen outcomes](../.cache/real-project-replay-PDVg4L/verified-evidence.json)

RunDOM reproduced all 6,136 named outcomes from the previous packed build in the full Svelte run, including the same 90 failures. Svelte’s Vitest helper uses `Window.prototype.matchMedia`, and TurboDOM’s adapter stops before collection because it supplies no `Window` global. On Material UI’s 161-case selection, TurboDOM failed two keyboard-focus assertions on the timing attempt. The 118-case Button and TextField selection has a complete four-provider series.

## Matched Vitest performance

Each cell gives median process seconds / summed assertion duration in milliseconds / peak RSS in MiB. A row uses exactly the same passing case identities on every displayed provider. Timed attempts with incomplete work or differing case identities remain in the raw results.

| Selection              | Passed per trial | RunDOM                | jsdom                 | Happy DOM             | TurboDOM              |
| ---------------------- | ---------------- | --------------------- | --------------------- | --------------------- | --------------------- |
| Vue runtime-dom        | 159              | 4.457 / 448 / 334.4   | 20.729 / 553 / 395.0  | 5.696 / 262 / 304.5   | 2.373 / 185 / 272.0   |
| Ant Design             | 116              | 32.456 / 7449 / 486.4 | 29.918 / 4776 / 583.3 | 27.887 / 4573 / 547.0 | 21.997 / 3875 / 528.8 |
| Material UI            | 161              | 5.169 / 1238 / 311.1  | 10.391 / 2333 / 311.3 | 5.891 / 1934 / 311.6  | —                     |
| Material UI            | 118              | 5.135 / 1186 / 311.3  | 4.517 / 1151 / 310.6  | 4.103 / 798 / 310.4   | 3.534 / 527 / 308.1   |
| Svelte runes shard     | 561              | 6.961 / 4676 / 367.1  | 6.719 / 5260 / 329.7  | 7.424 / 6035 / 332.4  | —                     |
| Svelte motion          | 8                | 1.759 / 4 / 182.1     | 2.724 / 7 / 179.4     | 3.602 / 5 / 177.7     | —                     |
| Next.js Vitest example | 5                | 1.422 / 66 / 147.7    | 3.669 / 252 / 157.8   | 1.679 / 58 / 118.4    | 1.326 / 48 / 116.0    |
| freeCodeCamp client    | 4                | 1.860 / 64 / 185.8    | 2.549 / 152 / 190.6   | 2.834 / 95 / 177.9    | 3.147 / 91 / 141.9    |
| Supabase UI            | 80               | 13.656 / 1685 / 197.4 | 14.663 / 2719 / 295.2 | 11.004 / 1144 / 177.4 | 7.692 / 1044 / 157.8  |

| Selection   | Cases attempted | Incomplete timing series |
| ----------- | --------------- | ------------------------ |
| Material UI | 161             | TurboDOM                 |

Elapsed ranges across the three verified trials in each displayed series, in seconds.

| Selection              | Cases | RunDOM        | jsdom         | Happy DOM     | TurboDOM      |
| ---------------------- | ----- | ------------- | ------------- | ------------- | ------------- |
| Vue runtime-dom        | 159   | 3.304–8.829   | 13.087–21.327 | 4.915–10.563  | 2.310–7.818   |
| Ant Design             | 116   | 26.963–40.967 | 26.323–30.278 | 21.663–37.643 | 20.457–30.222 |
| Material UI            | 161   | 3.823–6.266   | 5.734–12.318  | 4.468–10.107  | —             |
| Material UI            | 118   | 2.784–5.182   | 3.638–5.530   | 3.430–4.973   | 3.161–4.805   |
| Svelte runes shard     | 561   | 5.945–8.674   | 6.338–9.937   | 5.881–11.643  | —             |
| Svelte motion          | 8     | 1.417–2.160   | 1.527–4.201   | 1.879–3.889   | —             |
| Next.js Vitest example | 5     | 1.299–1.670   | 2.736–3.791   | 1.621–4.168   | 1.249–2.745   |
| freeCodeCamp client    | 4     | 1.725–2.884   | 2.261–4.011   | 2.411–3.199   | 1.850–4.416   |
| Supabase UI            | 80    | 10.243–15.179 | 12.810–35.819 | 8.625–17.114  | 5.796–12.721  |

Median user plus system CPU from the runner’s operating-system timing log, in seconds.

| Selection              | Cases | RunDOM | jsdom | Happy DOM | TurboDOM |
| ---------------------- | ----- | ------ | ----- | --------- | -------- |
| Vue runtime-dom        | 159   | 5.69   | 19.51 | 7.08      | 3.10     |
| Ant Design             | 116   | 30.95  | 30.79 | 27.74     | 24.32    |
| Material UI            | 161   | 7.11   | 11.82 | 7.42      | —        |
| Material UI            | 118   | 7.14   | 6.50  | 5.57      | 5.10     |
| Svelte runes shard     | 561   | 5.72   | 5.28  | 5.81      | —        |
| Svelte motion          | 8     | 2.14   | 3.19  | 3.34      | —        |
| Next.js Vitest example | 5     | 1.69   | 3.93  | 2.00      | 1.50     |
| freeCodeCamp client    | 4     | 2.43   | 3.18  | 3.09      | 3.63     |
| Supabase UI            | 80    | 14.41  | 18.39 | 13.16     | 9.79     |

## Previously selected full Vitest workloads

These repeated pairs require all named statuses, including skips, to match each repository’s jsdom screen.

| Selection       | Passed per trial | RunDOM                 | jsdom                  | Wall ranges in s (RunDOM / jsdom) | Valid pairs |
| --------------- | ---------------- | ---------------------- | ---------------------- | --------------------------------- | ----------- |
| Vue runtime-dom | 270              | 10.273 / 1377 / 395.3  | 23.896 / 1308 / 505.4  | 10.118–12.039 / 23.465–27.750     | 3           |
| Ant Design      | 133              | 14.287 / 4188 / 651.0  | 28.031 / 5890 / 603.6  | 12.359–22.995 / 17.946–32.731     | 3           |
| Material UI     | 430              | 17.547 / 11060 / 427.2 | 34.295 / 19071 / 356.3 | 13.501–33.696 / 20.893–36.741     | 3           |
| Supabase UI     | 85               | 15.197 / 2472 / 197.2  | 37.970 / 7641 / 293.9  | 9.208–17.499 / 21.173–38.802      | 3           |

[Full selection timings and attempt failures](../.cache/real-project-replay-PDVg4L/vitest/full-results.json)

## Upstream Jest workloads

Cells give median process seconds / peak RSS in MiB. These custom Jest environments use their stock jsdom dependency or the RunDOM alias.

| Selection                                             | Passed per trial | RunDOM         | jsdom          |
| ----------------------------------------------------- | ---------------- | -------------- | -------------- |
| React CSS and DOM                                     | 64               | 19.808 / 599.5 | 21.201 / 689.6 |
| Drone                                                 | 1                | 20.604 / 394.6 | 20.963 / 446.6 |
| Scully with the same teardown guard on both providers | 8                | 4.784 / 458.3  | 5.412 / 441.2  |

| Scully environment | RunDOM passed / failed / runtime errors | jsdom passed / failed / runtime errors |
| ------------------ | --------------------------------------- | -------------------------------------- |
| Stock Jest         | 0 / 0 / 3                               | 8 / 0 / 0                              |

[Jest trials](../.cache/real-project-replay-PDVg4L/jest/jest-timing-results.json) · [Scully guarded trials](../.cache/real-project-replay-PDVg4L/jest/scully-final-results.json) · [Scully stock reports](../.cache/real-project-replay-PDVg4L/jest/scully-stock-results.json)

Stock Scully’s Jest 27 environment attempts to redefine the non-configurable Window `document` during teardown. The guarded series applies the same descriptor check to both providers and verifies the generated HTML digest for each trial.

## React and Testing Library integration

This installed-consumer workload includes eight existing workflows and two state and keyed-list stress tests. Cells give median process seconds / assertion milliseconds / worker RSS in MiB. RSS in fork pools is sampled inside the worker.

| Vitest pool | RunDOM              | jsdom                | Happy DOM                                 | TurboDOM                                  |
| ----------- | ------------------- | -------------------- | ----------------------------------------- | ----------------------------------------- |
| forks       | 1.636 / 725 / 278.1 | 2.940 / 1262 / 342.8 | Screen or trial failed (0/9 valid trials) | Screen or trial failed (0/9 valid trials) |
| threads     | 1.682 / 808 / 323.9 | 2.627 / 1227 / 376.4 | Screen or trial failed (0/9 valid trials) | Screen or trial failed (0/9 valid trials) |
| vmForks     | 1.177 / 582 / 305.1 | 1.889 / 995 / 344.8  | Screen or trial failed (0/9 valid trials) | Screen or trial failed (0/9 valid trials) |
| vmThreads   | 1.452 / 747 / 363.8 | 1.636 / 863 / 394.4  | Screen or trial failed (0/9 valid trials) | Screen or trial failed (0/9 valid trials) |

[React integration raw results](../.cache/real-project-replay-PDVg4L/react-integration.json)
