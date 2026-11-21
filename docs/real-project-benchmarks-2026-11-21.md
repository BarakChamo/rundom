# Four DOM providers on 11 upstream projects

November 21, 2026. Each project ran its own tests against its installed jsdom and three alternative DOM providers on the same Apple M4 host, using Node 24.20.0, RunDOM 0.0.1 with the TypeScript parser, Happy DOM 21.0.4 and TurboDOM 0.7.1. The 15 broad selections include overlapping Material UI, Svelte and Scully selections. The two React and Testing Library fixture replays are additional. [Consumer package hashes and versions](../.cache/real-projects-20261121-AWa9sq/cohort.json) · [Upstream revisions and test file hashes](../.cache/real-projects-20261121-AWa9sq/upstream-manifest.json)

**RunDOM matched jsdom’s named outcomes on 10 of 11 primary selections** with Scully’s teardown guard. Its elapsed median was lower on 10 of those 10. The three largest ratios were Vue runtime-dom (2.44×), Supabase UI (1.88×), Mozilla Readability, 130 pages (1.86×).

RunDOM failed 90 Svelte cases. The failures split into 62 in legacy and 28 in runes. All eight motion assertions passed. jsdom passed all 6,102 active assertions in the broad selection.

## RunDOM against each project’s jsdom

Cells give median end-to-end seconds. Speedup is jsdom time divided by RunDOM time, and the memory difference is RunDOM minus jsdom peak RSS. A comparison requires matching named test outcomes and successful exits. The Scully row uses the guarded environment described below. Ranges cover all trials, in provider order.

| Selection                             | Upstream jsdom | RunDOM s | jsdom s | Speedup    | RSS difference MiB | RunDOM / jsdom range, s   |
| ------------------------------------- | -------------- | -------- | ------- | ---------- | ------------------ | ------------------------- |
| Mozilla Readability, 130 pages        | 20.0.2         | 5.19     | 9.63    | 1.86×      | -520               | 4.97–5.40 / 9.41–10.03    |
| Material UI, 10 files                 | 30.1.3         | 16.67    | 22.79   | 1.37×      | +5                 | 16.53–19.29 / 21.88–24.53 |
| Ant Design, 8 files                   | 31.0.0         | 5.13     | 6.72    | 1.31×      | -3                 | 5.11–5.36 / 6.53–6.88     |
| Vue runtime-dom                       | 30.0.1         | 2.66     | 6.50    | 2.44×      | -119               | 2.63–2.74 / 6.36–6.84     |
| Svelte runes, legacy and motion       | 25.0.1         | 30.23    | 34.26   | incomplete | —                  | 30.23–30.23 / 34.26–34.26 |
| React DOM, 2 files                    | 26.1.0         | 4.54     | 4.99    | 1.10×      | -37                | 4.54–5.20 / 4.75–5.18     |
| Drone UI, 1 file                      | 20.0.3         | 3.57     | 4.33    | 1.21×      | -9                 | 3.57–3.87 / 4.13–4.54     |
| Scully, 3 files (teardown guard¹)     | 16.7.0         | 1.13     | 1.37    | 1.21×      | +31                | 1.08–1.41 / 1.23–1.61     |
| Supabase UI                           | 28.1.0         | 4.17     | 7.83    | 1.88×      | -98                | 4.00–4.25 / 7.76–8.46     |
| Next.js Vitest example                | 26.1.0         | 0.99     | 1.67    | 1.69×      | -7                 | 0.98–1.17 / 1.67–1.77     |
| freeCodeCamp, 2 files                 | 26.1.0         | 1.00     | 1.44    | 1.44×      | -22                | 0.98–1.08 / 1.33–1.62     |
| Material UI, original 5 files         | 30.1.3         | 7.74     | 9.93    | 1.28×      | -26                | 7.67–7.87 / 9.91–10.00    |
| Svelte runes, first shard             | 25.0.1         | 5.60     | 6.07    | 1.08×      | +26                | 5.49–5.61 / 5.84–6.37     |
| Svelte motion                         | 25.0.1         | 0.85     | 1.02    | 1.20×      | -1                 | 0.84–0.90 / 0.93–1.03     |
| Scully globals only (teardown guard¹) | 16.7.0         | 0.94     | 1.14    | 1.21×      | +9                 | 0.91–0.98 / 1.11–1.31     |

## Compatibility on the broad selections

Each cell gives passed / failed / skipped or todo. Additional hook and file errors count failures outside individual assertions. Suites can stop before collecting the remaining cases, and some upstream suites enable different tests according to the environment. The 10-file and 5-file Material UI selections overlap in Dialog, Select and TextField.

| Upstream selection                    | RunDOM         | jsdom         | Happy DOM           | TurboDOM               |
| ------------------------------------- | -------------- | ------------- | ------------------- | ---------------------- |
| Mozilla Readability, 130 pages        | 903 / 0 / 0    | 903 / 0 / 0   | 895 / 8 / 0         | 281 / 0 / 0 + 86 hooks |
| Material UI, 10 files                 | 1087 / 0 / 87  | 1087 / 0 / 87 | 1137 / 22 / 15      | 458 / 701 / 15         |
| Ant Design, 8 files                   | 133 / 0 / 0    | 133 / 0 / 0   | 128 / 5 / 0         | 121 / 12 / 0           |
| Vue runtime-dom                       | 270 / 0 / 1    | 270 / 0 / 1   | 251 / 19 / 1        | 169 / 32 / 1 + 3 files |
| Svelte runes, legacy and motion       | 6012 / 90 / 34 | 6102 / 0 / 34 | 5823 / 279 / 34     | 0 / 0 / 0 + 9 files    |
| React DOM, 2 files                    | 64 / 0 / 0     | 64 / 0 / 0    | 63 / 1 / 0          | 61 / 3 / 0             |
| Drone UI, 1 file                      | 1 / 0 / 0      | 1 / 0 / 0     | 1 / 0 / 0           | 0 / 1 / 0              |
| Scully, 3 files (teardown guard¹)     | 8 / 0 / 0      | 8 / 0 / 0     | 0 / 0 / 0 + 3 files | 8 / 0 / 0              |
| Supabase UI                           | 85 / 0 / 0     | 85 / 0 / 0    | 84 / 1 / 0          | 80 / 5 / 0             |
| Next.js Vitest example                | 5 / 0 / 0      | 5 / 0 / 0     | 5 / 0 / 0           | 5 / 0 / 0              |
| freeCodeCamp, 2 files                 | 4 / 0 / 0      | 4 / 0 / 0     | 4 / 0 / 0           | 4 / 0 / 0              |
| Material UI, original 5 files         | 430 / 0 / 39   | 430 / 0 / 39  | 454 / 8 / 7         | 181 / 281 / 7          |
| Svelte runes, first shard             | 565 / 0 / 9    | 565 / 0 / 9   | 561 / 4 / 9         | 0 / 0 / 0 + 1 files    |
| Svelte motion                         | 8 / 0 / 0      | 8 / 0 / 0     | 8 / 0 / 0           | 0 / 0 / 0 + 1 files    |
| Scully globals only (teardown guard¹) | 5 / 0 / 0      | 5 / 0 / 0     | 0 / 0 / 0 + 2 files | 5 / 0 / 0              |

The Svelte runtime selection covers all nine configured runes, legacy and motion projects in this replay. The three-file React and Drone total consists of two React DOM files and one Drone UI smoke test. Next.js is its Vitest example, and freeCodeCamp is the two previously selected client files. [Named outcomes, failures and suite errors](../.cache/real-projects-20261121-AWa9sq/summary.json)

¹ Scully’s stock Jest 27 teardown attempts to redefine Window.document. A descriptor guard runs on both RunDOM and stock jsdom in the timed rows. Three of the eight cases explicitly construct jsdom when the alternative Jest environments run. The five-case globals-only row isolates the environment replacement. In fresh unguarded runs, RunDOM recorded 0 / 0 / 0 + 3 files and jsdom recorded 8 / 0 / 0 (pass / fail / skip, plus suite errors). [Stock Jest logs and reports](../.cache/real-projects-20261121-AWa9sq/jest-providers/)

## Wall time, test execution and peak memory

Each cell gives **process seconds / test seconds / peak RSS MiB**. Process time includes startup and teardown. Test time is the sum of named case durations for Vitest and Jest and Mocha’s suite duration for Readability. Peak RSS is the high-water mark reported by macOS time for the command, with child-process memory accounted for by the operating system. Concurrent worker RSS is not summed. Each successful provider was repeated in rotated order when a second provider also succeeded. Partial runs appear once for diagnostic context.

| Upstream selection                    | RunDOM              | jsdom               | Happy DOM           | TurboDOM            |
| ------------------------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| Mozilla Readability, 130 pages        | 5.19 / 4.78 / 825   | 9.63 / 9.14 / 1346  | 5.82 / 5.48 / 1631  | 1.30 / 1.15 / 427   |
| Material UI, 10 files                 | 16.67 / 12.99 / 574 | 22.79 / 16.66 / 569 | 27.96 / 23.14 / 650 | 26.25 / 17.38 / 391 |
| Ant Design, 8 files                   | 5.13 / 1.16 / 599   | 6.72 / 1.26 / 602   | 6.02 / 1.01 / 590   | 4.66 / 0.90 / 587   |
| Vue runtime-dom                       | 2.66 / 0.39 / 394   | 6.50 / 0.38 / 514   | 3.66 / 0.27 / 390   | 2.61 / 0.20 / 342   |
| Svelte runes, legacy and motion       | 30.23 / 23.04 / 583 | 34.26 / 25.56 / 495 | 30.58 / 22.62 / 560 | 5.16 / 0.00 / 424   |
| React DOM, 2 files                    | 4.54 / 3.54 / 871   | 4.99 / 3.44 / 908   | 4.54 / 3.41 / 844   | 4.43 / 3.40 / 828   |
| Drone UI, 1 file                      | 3.57 / 0.69 / 637   | 4.33 / 0.73 / 645   | 3.80 / 0.70 / 649   | 3.07 / 0.04 / 628   |
| Scully, 3 files (teardown guard¹)     | 1.13 / 0.00 / 500   | 1.37 / 0.00 / 468   | 0.86 / 0.00 / 416   | 1.06 / 0.00 / 478   |
| Supabase UI                           | 4.17 / 0.90 / 197   | 7.83 / 1.69 / 295   | 4.94 / 0.61 / 177   | 4.77 / 1.57 / 163   |
| Next.js Vitest example                | 0.99 / 0.06 / 146   | 1.67 / 0.12 / 153   | 1.37 / 0.04 / 120   | 0.96 / 0.04 / 116   |
| freeCodeCamp, 2 files                 | 1.00 / 0.05 / 164   | 1.44 / 0.08 / 185   | 1.11 / 0.04 / 177   | 1.02 / 0.03 / 152   |
| Material UI, original 5 files         | 7.74 / 5.45 / 331   | 9.93 / 6.42 / 357   | 9.43 / 6.70 / 447   | 4.96 / 0.97 / 399   |
| Svelte runes, first shard             | 5.60 / 4.47 / 365   | 6.07 / 4.74 / 339   | 5.68 / 4.47 / 366   | 0.88 / 0.00 / 189   |
| Svelte motion                         | 0.85 / 0.00 / 183   | 1.02 / 0.00 / 184   | 0.95 / 0.00 / 183   | 0.66 / 0.00 / 179   |
| Scully globals only (teardown guard¹) | 0.94 / 0.00 / 438   | 1.14 / 0.00 / 428   | 1.34 / 0.00 / 333   | 0.93 / 0.00 / 405   |

## Equal-work comparisons across providers

Cases were selected by their full names. Each numeric entry passed the same multiset of named cases on all three trials for that provider. For Readability each selected page passed every upstream assertion on all four providers in the broad screen. These slices measure the common functionality of the providers that completed them. Broader compatibility is recorded above. Cells give **process seconds / test seconds / peak RSS MiB**.

| Selection                                 | Cases | RunDOM            | jsdom             | Happy DOM         | TurboDOM                         |
| ----------------------------------------- | ----- | ----------------- | ----------------- | ----------------- | -------------------------------- |
| Vue runtime-dom                           | 159   | 2.03 / 0.22 / 333 | 5.01 / 0.20 / 472 | 2.81 / 0.15 / 305 | 1.80 / 0.16 / 304                |
| Ant Design, 8 files                       | 116   | 5.00 / 1.03 / 596 | 6.21 / 1.15 / 609 | 5.26 / 0.89 / 588 | 4.47 / 0.78 / 563                |
| Material UI Button and TextField          | 118   | 1.87 / 0.49 / 309 | 2.44 / 0.66 / 309 | 1.90 / 0.41 / 310 | 1.65 / 0.32 / 312                |
| Material UI, subset of original selection | 161   | 2.40 / 0.75 / 314 | 3.21 / 0.98 / 310 | 2.43 / 0.63 / 313 | incomplete (159 / 2 / 63)        |
| Supabase UI                               | 80    | 3.91 / 0.78 / 197 | 7.40 / 1.46 / 310 | 4.59 / 0.49 / 177 | 3.54 / 0.51 / 157                |
| Svelte runes, first shard                 | 561   | 5.70 / 4.67 / 366 | 6.09 / 4.89 / 340 | 5.80 / 4.64 / 366 | incomplete (0 / 0 / 0 + 1 files) |
| React DOM, 2 files                        | 61    | 4.48 / 3.47 / 867 | 4.60 / 3.38 / 848 | 4.49 / 3.35 / 924 | 4.32 / 3.31 / 822                |
| Mozilla Readability (44 pages)            | 281   | 0.73 / 0.59 / 491 | 1.22 / 1.00 / 496 | 0.77 / 0.55 / 460 | 0.45 / 0.32 / 301                |
| Svelte motion                             | 8     | 0.85 / 0.00 / 183 | 1.02 / 0.00 / 184 | 0.95 / 0.00 / 183 | incomplete                       |
| Next.js Vitest example                    | 5     | 0.99 / 0.06 / 146 | 1.67 / 0.12 / 153 | 1.37 / 0.04 / 120 | 0.96 / 0.04 / 116                |
| freeCodeCamp, 2 files                     | 4     | 1.00 / 0.05 / 164 | 1.44 / 0.08 / 185 | 1.11 / 0.04 / 177 | 1.02 / 0.03 / 152                |
| React DOM, 2 files                        | 64    | 4.54 / 3.54 / 871 | 4.99 / 3.44 / 908 | incomplete        | incomplete                       |
| Drone UI, 1 file                          | 1     | 3.57 / 0.69 / 637 | 4.33 / 0.73 / 645 | 3.80 / 0.70 / 649 | incomplete                       |
| Scully globals only (teardown guard¹)     | 5     | 0.94 / 0.00 / 438 | 1.14 / 0.00 / 428 | incomplete        | 0.93 / 0.00 / 405                |

[Matched case checks per provider and trial](../.cache/real-projects-20261121-AWa9sq/matches.jsonl) · [Filtered Vitest reports and phase logs](../.cache/real-projects-20261121-AWa9sq/vitest/)

On the 8 exact-work selections with three completed runs on all four providers, the lowest elapsed medians were as follows. Margins near one percent can change with run order and host load.

| Selection                              | Fastest elapsed median | RunDOM elapsed / fastest | RunDOM peak minus fastest MiB |
| -------------------------------------- | ---------------------- | ------------------------ | ----------------------------- |
| Vue runtime-dom (159)                  | TurboDOM               | 1.13×                    | +29                           |
| Ant Design, 8 files (116)              | TurboDOM               | 1.12×                    | +33                           |
| Material UI Button and TextField (118) | TurboDOM               | 1.13×                    | -3                            |
| Supabase UI (80)                       | TurboDOM               | 1.10×                    | +40                           |
| React DOM, 2 files (61)                | TurboDOM               | 1.04×                    | +45                           |
| Mozilla Readability (281)              | TurboDOM               | 1.62×                    | +189                          |
| Next.js Vitest example                 | TurboDOM               | 1.03×                    | +30                           |
| freeCodeCamp, 2 files                  | RunDOM                 | 1.00×                    | +0                            |

## Runner phases and CPU

For each broad selection, the phase breakdown comes from the trial nearest that provider’s median elapsed time. Each upstream Vitest version determines the stage names, rounding and whether it reports seconds or percentages. Jest and Mocha provide no comparable environment/import breakdown. Full process CPU includes user and system time across threads.

| Upstream selection                    | RunDOM CPU s | jsdom CPU s | Happy DOM CPU s | TurboDOM CPU s |
| ------------------------------------- | ------------ | ----------- | --------------- | -------------- |
| Mozilla Readability, 130 pages        | 7.34         | 12.73       | 8.16            | 1.60           |
| Material UI, 10 files                 | 17.52        | 24.77       | 22.06           | 25.68          |
| Ant Design, 8 files                   | 8.22         | 9.66        | 8.45            | 7.46           |
| Vue runtime-dom                       | 3.53         | 8.27        | 4.73            | 3.36           |
| Svelte runes, legacy and motion       | 32.40        | 36.38       | 32.17           | 6.47           |
| React DOM, 2 files                    | 6.28         | 6.35        | 6.13            | 6.12           |
| Drone UI, 1 file                      | 4.70         | 4.98        | 4.89            | 4.50           |
| Scully, 3 files (teardown guard¹)     | 1.83         | 1.92        | 1.31            | 1.72           |
| Supabase UI                           | 5.41         | 10.36       | 6.21            | 5.05           |
| Next.js Vitest example                | 1.22         | 1.92        | 1.58            | 1.12           |
| freeCodeCamp, 2 files                 | 1.42         | 1.75        | 1.47            | 1.34           |
| Material UI, original 5 files         | 7.50         | 10.32       | 8.11            | 6.46           |
| Svelte runes, first shard             | 4.07         | 4.38        | 3.92            | 1.13           |
| Svelte motion                         | 1.16         | 1.26        | 1.19            | 0.91           |
| Scully globals only (teardown guard¹) | 1.44         | 1.58        | 1.31            | 1.41           |

| Vitest selection                | Provider  | Runner duration and stages                                                                      |
| ------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| Material UI, 10 files           | RunDOM    | 16.31s (tests 82%, import 7%, transform 6%, setup 3%, environment 2%)                           |
| Material UI, 10 files           | jsdom     | 22.33s (tests 77%, environment 11%, import 5%, transform 5%, setup 2%)                          |
| Material UI, 10 files           | Happy DOM | 27.47s (tests 86%, environment 4%, import 4%, transform 4%, setup 2%)                           |
| Material UI, 10 files           | TurboDOM  | 25.70s (tests 84%, import 7%, transform 6%, setup 3%)                                           |
| Ant Design, 8 files             | RunDOM    | 4.97s (transform 46%, tests 25%, setup 20%, import 4%, environment 4%)                          |
| Ant Design, 8 files             | jsdom     | 6.52s (transform 36%, environment 25%, tests 20%, setup 13%, import 6%)                         |
| Ant Design, 8 files             | Happy DOM | 5.76s (transform 44%, tests 19%, setup 15%, environment 15%, import 8%)                         |
| Ant Design, 8 files             | TurboDOM  | 4.49s (transform 53%, tests 22%, setup 18%, import 6%)                                          |
| Vue runtime-dom                 | RunDOM    | 2.47s (transform 305ms, setup 35ms, import 873ms, tests 402ms, environment 404ms)               |
| Vue runtime-dom                 | jsdom     | 6.26s (transform 323ms, setup 67ms, import 892ms, tests 391ms, environment 4.16s)               |
| Vue runtime-dom                 | Happy DOM | 3.48s (transform 310ms, setup 35ms, import 883ms, tests 279ms, environment 1.52s)               |
| Vue runtime-dom                 | TurboDOM  | 2.31s (transform 303ms, setup 43ms, import 685ms, tests 205ms, environment 31ms)                |
| Svelte runes, legacy and motion | RunDOM    | 29.72s (transform 7.57s, setup 0ms, import 5.85s, tests 23.08s, environment 222ms)              |
| Svelte runes, legacy and motion | jsdom     | 33.68s (transform 7.97s, setup 0ms, import 6.25s, tests 25.60s, environment 1.28s)              |
| Svelte runes, legacy and motion | Happy DOM | 30.00s (transform 7.57s, setup 0ms, import 5.87s, tests 22.66s, environment 895ms)              |
| Svelte runes, legacy and motion | TurboDOM  | 4.91s (transform 2.79s, setup 0ms, import 0ms, tests 0ms, environment 20ms)                     |
| Supabase UI                     | RunDOM    | 3.98s (import 29%, tests 28%, setup 27%, environment 11%, transform 4%, worker 1%)              |
| Supabase UI                     | jsdom     | 7.64s (environment 47%, tests 24%, import 15%, setup 12%, transform 2%)                         |
| Supabase UI                     | Happy DOM | 4.80s (environment 37%, import 23%, setup 21%, tests 15%, transform 3%, worker 1%)              |
| Supabase UI                     | TurboDOM  | 4.63s (tests 44%, import 26%, setup 24%, transform 4%, environment 1%, worker 1%)               |
| Next.js Vitest example          | RunDOM    | 785ms (transform 45ms, setup 0ms, collect 195ms, tests 66ms, environment 87ms, prepare 107ms)   |
| Next.js Vitest example          | jsdom     | 1.47s (transform 44ms, setup 0ms, collect 184ms, tests 119ms, environment 730ms, prepare 103ms) |
| Next.js Vitest example          | Happy DOM | 1.15s (transform 48ms, setup 0ms, collect 207ms, tests 48ms, environment 436ms, prepare 111ms)  |
| Next.js Vitest example          | TurboDOM  | 735ms (transform 45ms, setup 0ms, collect 204ms, tests 39ms, environment 8ms, prepare 112ms)    |
| freeCodeCamp, 2 files           | RunDOM    | 798ms (transform 177ms, setup 170ms, import 409ms, tests 55ms, environment 47ms)                |
| freeCodeCamp, 2 files           | jsdom     | 1.23s (transform 195ms, setup 167ms, import 440ms, tests 89ms, environment 416ms)               |
| freeCodeCamp, 2 files           | Happy DOM | 892ms (transform 172ms, setup 165ms, import 386ms, tests 40ms, environment 186ms)               |
| freeCodeCamp, 2 files           | TurboDOM  | 785ms (transform 190ms, setup 174ms, import 417ms, tests 33ms, environment 4ms)                 |
| Material UI, original 5 files   | RunDOM    | 7.38s (tests 77%, transform 9%, import 8%, setup 3%, environment 2%)                            |
| Material UI, original 5 files   | jsdom     | 9.57s (tests 69%, environment 15%, transform 7%, import 6%, setup 2%)                           |
| Material UI, original 5 files   | Happy DOM | 9.06s (tests 77%, transform 8%, environment 7%, import 6%, setup 3%)                            |
| Material UI, original 5 files   | TurboDOM  | 4.38s (tests 37%, transform 29%, import 22%, setup 11%)                                         |
| Svelte runes, first shard       | RunDOM    | 5.37s (transform 1.11s, setup 0ms, import 800ms, tests 4.48s, environment 24ms)                 |
| Svelte runes, first shard       | jsdom     | 5.84s (transform 1.10s, setup 0ms, import 806ms, tests 4.75s, environment 220ms)                |
| Svelte runes, first shard       | Happy DOM | 5.47s (transform 1.13s, setup 0ms, import 769ms, tests 4.48s, environment 149ms)                |
| Svelte runes, first shard       | TurboDOM  | 677ms (transform 402ms, setup 0ms, import 0ms, tests 0ms, environment 5ms)                      |
| Svelte motion                   | RunDOM    | 649ms (transform 382ms, setup 0ms, import 558ms, tests 3ms, environment 29ms)                   |
| Svelte motion                   | jsdom     | 811ms (transform 371ms, setup 0ms, import 538ms, tests 2ms, environment 212ms)                  |
| Svelte motion                   | Happy DOM | 747ms (transform 373ms, setup 0ms, import 545ms, tests 2ms, environment 142ms)                  |
| Svelte motion                   | TurboDOM  | 458ms (transform 255ms, setup 0ms, import 0ms, tests 0ms, environment 2ms)                      |

## Where the component suites spend test time

These measurements sum the named case durations in each upstream file, then take the median across the three broad runs per provider. The rows show the five most time-consuming files for RunDOM in each selection. Authored waits, component code and DOM work all contribute.

| Selection             | File                                                          | RunDOM bodies s | jsdom bodies s | Difference s |
| --------------------- | ------------------------------------------------------------- | --------------- | -------------- | ------------ |
| Material UI, 10 files | `packages/mui-material/src/Autocomplete/Autocomplete.test.js` | 4.896           | 7.456          | -2.560       |
| Material UI, 10 files | `packages/mui-material/src/Select/Select.test.js`             | 4.246           | 4.839          | -0.593       |
| Material UI, 10 files | `packages/mui-material/src/Tabs/Tabs.test.js`                 | 1.173           | 1.309          | -0.136       |
| Material UI, 10 files | `packages/mui-material/src/Tooltip/Tooltip.test.js`           | 0.929           | 1.040          | -0.111       |
| Material UI, 10 files | `packages/mui-material/src/TextField/TextField.test.js`       | 0.401           | 0.533          | -0.132       |
| Ant Design, 8 files   | `components/radio/__tests__/group.test.tsx`                   | 0.235           | 0.270          | -0.035       |
| Ant Design, 8 files   | `components/alert/__tests__/index.test.tsx`                   | 0.229           | 0.223          | +0.006       |
| Ant Design, 8 files   | `components/checkbox/__tests__/group.test.tsx`                | 0.218           | 0.247          | -0.028       |
| Ant Design, 8 files   | `components/radio/__tests__/radio.test.tsx`                   | 0.157           | 0.167          | -0.011       |
| Ant Design, 8 files   | `components/checkbox/__tests__/checkbox.test.tsx`             | 0.095           | 0.109          | -0.015       |

## Readability application replay

The application replay constructs a window, extracts an article and closes the window for each of the 130 pages. Heap measurements follow forced GC immediately after the synchronous batch and again after an event-loop turn. Digests cover all returned article JSON, including serialization.

| Provider  | Completed runs × articles | Construct s | Extract s | Close ms | Process s | Peak MiB | Same-turn heap MiB | Next-turn heap MiB | Digest prefix |
| --------- | ------------------------- | ----------- | --------- | -------- | --------- | -------- | ------------------ | ------------------ | ------------- |
| RunDOM    | 3 × 130                   | 1.07        | 1.43      | 1.35     | 2.70      | 772      | 73.97              | 39.33              | 41c0ab64b9a0  |
| jsdom     | 3 × 130                   | 3.16        | 2.39      | 40.21    | 5.95      | 1316     | 717.53             | 168.14             | 16e0d59c74c5  |
| Happy DOM | 0                         | —           | —         | —        | —         | —        | —                  | —                  | —             |
| TurboDOM  | 0                         | —           | —         | —        | —         | —        | —                  | —                  | —             |

Happy DOM returned no article for the cnet input on the direct replay. TurboDOM stopped when Readability cloned an attribute while replacing an element. Each provider encountered its failure on all three attempts. [Happy DOM direct log](../.cache/real-projects-20261121-AWa9sq/happy-dom-direct-0.log) · [TurboDOM direct log](../.cache/real-projects-20261121-AWa9sq/turbo-dom-direct-0.log)

RunDOM and jsdom differed in serialized output on 5 articles. Independently parsing the content with parse5 found 0 differing trees. [Per-article field and tree comparison](../.cache/real-projects-20261121-AWa9sq/output-equivalence.json)

A separate jsdom 30.1.3 control passed the same 903 Mocha assertions. Its three-run medians were 10.30 s end to end, 9.68 s in Mocha and 1338 MiB peak RSS. The broad matrix uses Readability’s own jsdom 20.0.2. [Reference-version runs](../.cache/real-projects-20261121-AWa9sq/readability-reference.log)

## React and Testing Library consumer fixture

The repository’s supplemental fixture exercises React and Testing Library in installed consumers. The standard run contains eight workflows. The stress run adds state updates and keyed-list reconciliation. Each eligible provider/pool pair runs nine fresh processes. Cells give **process seconds / test seconds / worker RSS MiB**. RSS here is sampled inside the worker at the end of the suite.

| Fixture      | Pool      | RunDOM              | jsdom               | Happy DOM           | TurboDOM         |
| ------------ | --------- | ------------------- | ------------------- | ------------------- | ---------------- |
| 8 workflows  | forks     | 0.391 / 0.120 / 140 | 0.609 / 0.144 / 215 | 0.434 / 0.099 / 122 | incomplete (0/9) |
| 8 workflows  | threads   | 0.376 / 0.121 / 194 | 0.585 / 0.144 / 241 | 0.412 / 0.098 / 181 | incomplete (0/9) |
| 8 workflows  | vmForks   | 0.448 / 0.139 / 149 | 0.618 / 0.146 / 204 | 0.447 / 0.100 / 138 | incomplete (0/9) |
| 8 workflows  | vmThreads | 0.428 / 0.138 / 202 | 0.596 / 0.146 / 254 | 0.433 / 0.101 / 189 | incomplete (0/9) |
| 10 workflows | forks     | 0.811 / 0.417 / 266 | 1.376 / 0.594 / 332 | incomplete (0/9)    | incomplete (0/9) |
| 10 workflows | threads   | 0.768 / 0.409 / 293 | 1.353 / 0.620 / 381 | incomplete (0/9)    | incomplete (0/9) |
| 10 workflows | vmForks   | 0.750 / 0.413 / 300 | 1.080 / 0.580 / 344 | incomplete (0/9)    | incomplete (0/9) |
| 10 workflows | vmThreads | 0.742 / 0.415 / 370 | 1.073 / 0.581 / 394 | incomplete (0/9)    | incomplete (0/9) |

[Eight-workflow results](../.cache/real-projects-20261121-AWa9sq/react-standard.json) · [Ten-workflow results](../.cache/real-projects-20261121-AWa9sq/react-integration.json)

## Reproduction and interpretation

The matrix used the existing local upstream checkouts, a fresh packed RunDOM consumer and one worker. Broad Vitest and Jest runs disabled runner caches. Trials ran one process at a time, with provider order rotated on successive rounds. The upstream jsdom dependency varies by project. The machine was shared. Small timing differences and individual RSS peaks can vary across runs. The named case checks include status and duplicate names. Some Svelte configurations include duplicate test titles across shards.

[Broad benchmark commands](../.cache/real-projects-20261121-AWa9sq/batch.py) · [Vitest selections and environment](../.cache/real-projects-20261121-AWa9sq/vitest/run.py) · [Jest selections and environment](../.cache/real-projects-20261121-AWa9sq/jest-providers/native.py) · [Mocha command](../.cache/real-projects-20261121-AWa9sq/pages.py) · [Matched and direct replay commands](../.cache/real-projects-20261121-AWa9sq/extra.py) · [Per-trial results](../.cache/real-projects-20261121-AWa9sq/progress.jsonl) · [Aggregation script](../.cache/real-projects-20261121-AWa9sq/summarize.py)
