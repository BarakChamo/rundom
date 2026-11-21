# Real-project benchmarks on the November 21 inline CSS build

Node v24.20.0 on Apple M4 with the TypeScript HTML parser. The run used the same 11 upstream checkouts and test-file hashes as the preceding replay. Each project used its installed jsdom version. Happy DOM was 21.0.4 and TurboDOM was 0.7.1. The RunDOM package was frozen at 2026-11-21T04:18:58.263Z. [Build hashes and versions](../.cache/upstream-inline-vkcCKO/cohort.json) · [Upstream sources and jsdom versions](../.cache/upstream-inline-vkcCKO/upstream-manifest.json)

RunDOM finished faster than jsdom on **10 of 10** primary selections with identical named outcomes and successful exits. Scully uses a guarded teardown. The broad Svelte selection passed 6,012 and failed 90 with RunDOM.

The largest end-to-end TurboDOM lead among the matched subsets was 440 ms on Ant Design, 8 files (116 passing cases). In the broad ten-file Material UI selection RunDOM took 16.40 seconds against jsdom’s 21.67, with a median peak RSS difference of +18 MiB.

On 42 articles where all four providers returned the same fields and content trees, constructing the documents took 97 ms with RunDOM and 17 ms with TurboDOM. Article extraction took 135 ms and 81 ms, respectively. The full 130-page input and pairwise output counts are reported below.

This was a serial replay on a shared development machine. The sampled one-minute load average ranged from 2.2 to 6.7. The unchanged jsdom Svelte control took 33.94 seconds in this batch and 33.70 seconds in the preceding batch. Elapsed differences close to the run-to-run spread carry substantial uncertainty. [Timestamped host observations](../.cache/upstream-inline-vkcCKO/host.jsonl)

In five paired complete Vue runs, the CSS patch case fell from 21.20 to 0.56 ms. Total test-body time changed by -19.3 ms and whole-process time by -27.5 ms. In five separate Material UI pairs, the median peak changed by -18.2 MiB against the previous RunDOM build. The appendix separates first-use costs from subsequent calls and reports all paired trials.

## Upstream results

Times are median end-to-end seconds. Parentheses denote incomplete or unequal work compared with jsdom. Each provider ran in its own process with one test worker. Provider execution order rotated. Each successful provider ran three times when at least two providers completed that selection. A failed screen ran once. Supabase means the UI package, Next.js means its Vitest example, and freeCodeCamp means two client test files. The last four rows overlap the primary selections.

| Selection                             | RunDOM s | jsdom s | Happy DOM s | TurboDOM s | jsdom / RunDOM | Peak RSS difference vs jsdom, MiB |
| ------------------------------------- | -------- | ------- | ----------- | ---------- | -------------- | --------------------------------- |
| Mozilla Readability, 130 pages        | 4.25     | 9.35    | (5.37)      | (1.68)     | 2.20×          | -515                              |
| Material UI, 10 files                 | 16.40    | 21.67   | (28.88)     | (23.83)    | 1.32×          | +18                               |
| Ant Design, 8 files                   | 4.95     | 6.61    | (5.73)      | (4.52)     | 1.34×          | -23                               |
| Vue runtime-dom                       | 2.59     | 6.30    | (3.56)      | (2.27)     | 2.43×          | -137                              |
| Svelte runes, legacy and motion       | (30.13)  | 33.94   | (30.54)     | (5.18)     | incomplete     | —                                 |
| React DOM, 2 files                    | 4.31     | 4.98    | (4.46)      | (4.34)     | 1.16×          | -3                                |
| Drone UI, 1 file                      | 3.48     | 4.27    | 3.69        | (3.04)     | 1.23×          | -5                                |
| Scully, 3 files (teardown guard¹)     | 1.05     | 1.28    | (0.75)      | 1.05       | 1.22×          | +15                               |
| Supabase UI                           | 3.91     | 7.69    | (4.60)      | (4.58)     | 1.97×          | -109                              |
| Next.js Vitest example                | 0.95     | 1.64    | 1.27        | 0.91       | 1.73×          | -35                               |
| freeCodeCamp, 2 files                 | 0.98     | 1.33    | 1.08        | 0.97       | 1.36×          | -21                               |
| Material UI, original 5 files         | 7.58     | 9.63    | (8.96)      | (4.54)     | 1.27×          | -31                               |
| Svelte runes, first shard             | 5.72     | 6.24    | (5.80)      | (0.82)     | 1.09×          | +36                               |
| Svelte motion                         | 0.84     | 0.94    | 0.91        | (0.69)     | 1.12×          | +3                                |
| Scully globals only (teardown guard¹) | 0.90     | 1.11    | (0.95)      | 0.89       | 1.23×          | -4                                |

## Compatibility

All 60 provider and selection combinations reproduced the preceding replay’s exact named outcomes, failure counts and exit status. [Comparison against the preceding replay](../.cache/upstream-inline-vkcCKO/broad-outcome-changes.json)

Cells give passed / failed / skipped or todo. Hook and file errors are counted separately. Material UI selects additional tests under certain environments. Three Scully cases explicitly construct jsdom even in the alternative Jest environments. The five globals-only cases isolate the selected environment.

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

Scully’s original Jest 27 teardown redefines Window.document. The timed rows guard the same call for RunDOM and jsdom. The fresh unguarded runs produced RunDOM 0 / 0 / 0 + 3 files, jsdom 8 / 0 / 0. [Jest reports and provider traces](../.cache/upstream-inline-vkcCKO/jest-providers/)

The broad Svelte run reproduced the preceding replay’s exact test outcomes. In the earlier browser diagnostic, the 90 failing DOM and hydration variants also failed in Google Chrome for Testing 156.0.8078.4, and 86 had identical failure details to RunDOM. Stock jsdom passed all 90 in that diagnostic. The browser evidence comes from the earlier run. [Browser comparison](../.cache/upstream-goal-1BQdRb/svelte-browser-summary.json)

## Timing and memory on identical work

Cells show process seconds / test seconds / peak RSS MiB. Filtered comparisons require the exact multiset of named passing tests in each of three trials. Readability uses complete pages. The dash means that provider failed qualification. Peak RSS is the operating system’s process high-water measurement for the command. It does not sum concurrent workers.

| Selection                             | Cases | RunDOM            | jsdom             | Happy DOM         | TurboDOM          |
| ------------------------------------- | ----- | ----------------- | ----------------- | ----------------- | ----------------- |
| Vue runtime-dom                       | 159   | 1.97 / 0.21 / 316 | 4.83 / 0.20 / 472 | 2.77 / 0.15 / 304 | 1.77 / 0.15 / 303 |
| Ant Design, 8 files                   | 116   | 4.86 / 0.99 / 583 | 6.27 / 1.13 / 605 | 5.19 / 0.88 / 588 | 4.42 / 0.77 / 565 |
| Material UI Button and TextField      | 118   | 1.84 / 0.48 / 313 | 2.40 / 0.64 / 309 | 1.86 / 0.40 / 311 | 1.64 / 0.31 / 310 |
| Material UI common subset             | 161   | 2.34 / 0.72 / 314 | 3.16 / 0.96 / 310 | 2.41 / 0.62 / 310 | —                 |
| Supabase UI                           | 80    | 3.99 / 0.76 / 186 | 7.65 / 1.51 / 309 | 4.58 / 0.48 / 177 | 3.61 / 0.52 / 157 |
| Svelte runes, first shard             | 561   | 5.76 / 4.73 / 376 | 6.10 / 4.86 / 342 | 5.70 / 4.63 / 366 | —                 |
| React DOM, 2 files                    | 61    | 4.27 / 3.27 / 836 | 4.49 / 3.32 / 841 | 4.38 / 3.27 / 848 | 4.24 / 3.25 / 762 |
| Mozilla Readability, 44 shared pages  | 281   | 0.67 / 0.53 / 415 | 1.20 / 0.99 / 497 | 0.77 / 0.55 / 460 | 0.45 / 0.31 / 301 |
| Next.js Vitest example                | 5     | 0.95 / 0.05 / 118 | 1.64 / 0.12 / 153 | 1.27 / 0.04 / 120 | 0.91 / 0.04 / 116 |
| freeCodeCamp, 2 files                 | 4     | 0.98 / 0.05 / 163 | 1.33 / 0.07 / 185 | 1.08 / 0.04 / 177 | 0.97 / 0.03 / 153 |
| Svelte motion                         | 8     | 0.84 / 0.00 / 185 | 0.94 / 0.00 / 182 | 0.91 / 0.00 / 185 | —                 |
| Drone UI, 1 file                      | 1     | 3.48 / 0.69 / 640 | 4.27 / 0.74 / 645 | 3.69 / 0.71 / 650 | —                 |
| Scully globals only (teardown guard¹) | 5     | 0.90 / 0.00 / 427 | 1.11 / 0.00 / 431 | —                 | 0.89 / 0.00 / 405 |

| Four-way selection                         | Lowest elapsed median | RunDOM above lowest, ms | RunDOM peak minus lowest-time provider, MiB |
| ------------------------------------------ | --------------------- | ----------------------- | ------------------------------------------- |
| Vue runtime-dom (159)                      | TurboDOM              | 200                     | +12                                         |
| Ant Design, 8 files (116)                  | TurboDOM              | 440                     | +18                                         |
| Material UI Button and TextField (118)     | TurboDOM              | 200                     | +4                                          |
| Supabase UI (80)                           | TurboDOM              | 380                     | +29                                         |
| React DOM, 2 files (61)                    | TurboDOM              | 30                      | +74                                         |
| Mozilla Readability, 44 shared pages (281) | TurboDOM              | 220                     | +114                                        |
| Next.js Vitest example (5)                 | TurboDOM              | 40                      | +3                                          |
| freeCodeCamp, 2 files (4)                  | TurboDOM              | 10                      | +11                                         |

Each pair below uses matching repetition numbers from the rotated runs. The process clock reports hundredths of a second. On short workloads, margins of that size can change with the run order.

| Selection                                  | RunDOM minus TurboDOM per round, ms | RunDOM faster | Ties | TurboDOM faster |
| ------------------------------------------ | ----------------------------------- | ------------- | ---- | --------------- |
| Vue runtime-dom (159)                      | +190 / +190 / +200                  | 0             | 0    | 3               |
| Ant Design, 8 files (116)                  | +450 / +420 / +460                  | 0             | 0    | 3               |
| Material UI Button and TextField (118)     | +210 / +210 / +180                  | 0             | 0    | 3               |
| Supabase UI (80)                           | +370 / +380 / +340                  | 0             | 0    | 3               |
| React DOM, 2 files (61)                    | +40 / +30 / +30                     | 0             | 0    | 3               |
| Mozilla Readability, 44 shared pages (281) | +210 / +220 / +220                  | 0             | 0    | 3               |
| Next.js Vitest example (5)                 | +200 / +50 / -50                    | 1             | 0    | 2               |
| freeCodeCamp, 2 files (4)                  | +10 / -260 / +50                    | 1             | 0    | 2               |

## Where RunDOM still loses on identical work

A positive delta means RunDOM took longer or used more peak memory than the named provider. These comparisons use the shared four-provider selections when all three rounds qualify. Each selection is listed once per comparison provider. The full upstream pass counts above give the coverage context.

| Selection                                  | Comparison | Process delta ms | Test delta ms | Peak RSS delta MiB |
| ------------------------------------------ | ---------- | ---------------- | ------------- | ------------------ |
| Vue runtime-dom (159)                      | jsdom      | -2860            | +12           | -156               |
| Vue runtime-dom (159)                      | Happy DOM  | -800             | +58           | +11                |
| Vue runtime-dom (159)                      | TurboDOM   | +200             | +56           | +12                |
| Ant Design, 8 files (116)                  | jsdom      | -1410            | -132          | -22                |
| Ant Design, 8 files (116)                  | Happy DOM  | -330             | +118          | -4                 |
| Ant Design, 8 files (116)                  | TurboDOM   | +440             | +226          | +18                |
| Material UI Button and TextField (118)     | jsdom      | -560             | -157          | +4                 |
| Material UI Button and TextField (118)     | Happy DOM  | -20              | +87           | +2                 |
| Material UI Button and TextField (118)     | TurboDOM   | +200             | +174          | +4                 |
| Supabase UI (80)                           | jsdom      | -3660            | -753          | -123               |
| Supabase UI (80)                           | Happy DOM  | -590             | +277          | +10                |
| Supabase UI (80)                           | TurboDOM   | +380             | +241          | +29                |
| React DOM, 2 files (61)                    | jsdom      | -220             | -50           | -5                 |
| React DOM, 2 files (61)                    | Happy DOM  | -110             | +4            | -12                |
| React DOM, 2 files (61)                    | TurboDOM   | +30              | +26           | +74                |
| Mozilla Readability, 44 shared pages (281) | jsdom      | -530             | -458          | -82                |
| Mozilla Readability, 44 shared pages (281) | Happy DOM  | -100             | -24           | -44                |
| Mozilla Readability, 44 shared pages (281) | TurboDOM   | +220             | +216          | +114               |
| Next.js Vitest example (5)                 | jsdom      | -690             | -61           | -35                |
| Next.js Vitest example (5)                 | Happy DOM  | -320             | +10           | -1                 |
| Next.js Vitest example (5)                 | TurboDOM   | +40              | +18           | +3                 |
| freeCodeCamp, 2 files (4)                  | jsdom      | -350             | -26           | -21                |
| freeCodeCamp, 2 files (4)                  | Happy DOM  | -100             | +11           | -14                |
| freeCodeCamp, 2 files (4)                  | TurboDOM   | +10              | +18           | +11                |

## Broad runner phases and CPU

The first table reports median end-to-end seconds, test seconds and peak RSS MiB for every attempt, including partial executions. Test time is the sum of named test durations for Vitest and Jest, and suite duration for Mocha. The second table gives total user and system CPU seconds. Vitest stage measurements come from the trial nearest each provider’s elapsed median. Jest and Mocha do not emit the same stage breakdown.

| Selection                             | RunDOM              | jsdom               | Happy DOM           | TurboDOM            |
| ------------------------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| Mozilla Readability, 130 pages        | 4.25 / 3.97 / 753   | 9.35 / 8.87 / 1267  | 5.37 / 5.05 / 1884  | 1.68 / 1.54 / 494   |
| Material UI, 10 files                 | 16.40 / 12.78 / 585 | 21.67 / 15.90 / 567 | 28.88 / 24.31 / 594 | 23.83 / 16.77 / 424 |
| Ant Design, 8 files                   | 4.95 / 1.09 / 587   | 6.61 / 1.21 / 611   | 5.73 / 0.97 / 592   | 4.52 / 0.88 / 591   |
| Vue runtime-dom                       | 2.59 / 0.37 / 377   | 6.30 / 0.38 / 514   | 3.56 / 0.27 / 390   | 2.27 / 0.19 / 342   |
| Svelte runes, legacy and motion       | 30.13 / 22.71 / 560 | 33.94 / 25.11 / 547 | 30.54 / 22.51 / 555 | 5.18 / 0.00 / 428   |
| React DOM, 2 files                    | 4.31 / 3.32 / 844   | 4.98 / 3.36 / 847   | 4.46 / 3.32 / 823   | 4.34 / 3.33 / 910   |
| Drone UI, 1 file                      | 3.48 / 0.69 / 640   | 4.27 / 0.74 / 645   | 3.69 / 0.71 / 650   | 3.04 / 0.04 / 624   |
| Scully, 3 files (teardown guard¹)     | 1.05 / 0.00 / 483   | 1.28 / 0.00 / 468   | 0.75 / 0.00 / 414   | 1.05 / 0.00 / 473   |
| Supabase UI                           | 3.91 / 0.84 / 186   | 7.69 / 1.65 / 295   | 4.60 / 0.58 / 178   | 4.58 / 1.56 / 158   |
| Next.js Vitest example                | 0.95 / 0.05 / 118   | 1.64 / 0.12 / 153   | 1.27 / 0.04 / 120   | 0.91 / 0.04 / 116   |
| freeCodeCamp, 2 files                 | 0.98 / 0.05 / 163   | 1.33 / 0.07 / 185   | 1.08 / 0.04 / 177   | 0.97 / 0.03 / 153   |
| Material UI, original 5 files         | 7.58 / 5.41 / 330   | 9.63 / 6.36 / 361   | 8.96 / 6.42 / 481   | 4.54 / 0.89 / 404   |
| Svelte runes, first shard             | 5.72 / 4.72 / 376   | 6.24 / 4.98 / 340   | 5.80 / 4.71 / 366   | 0.82 / 0.00 / 191   |
| Svelte motion                         | 0.84 / 0.00 / 185   | 0.94 / 0.00 / 182   | 0.91 / 0.00 / 185   | 0.69 / 0.00 / 176   |
| Scully globals only (teardown guard¹) | 0.90 / 0.00 / 427   | 1.11 / 0.00 / 431   | 0.95 / 0.00 / 398   | 0.89 / 0.00 / 405   |

| Selection                             | RunDOM CPU s | jsdom CPU s | Happy DOM CPU s | TurboDOM CPU s |
| ------------------------------------- | ------------ | ----------- | --------------- | -------------- |
| Mozilla Readability, 130 pages        | 6.05         | 12.04       | 7.65            | 1.57           |
| Material UI, 10 files                 | 16.91        | 23.25       | 22.69           | 23.13          |
| Ant Design, 8 files                   | 7.88         | 9.36        | 8.10            | 7.28           |
| Vue runtime-dom                       | 3.38         | 8.12        | 4.63            | 2.91           |
| Svelte runes, legacy and motion       | 31.54        | 35.28       | 31.41           | 6.44           |
| React DOM, 2 files                    | 5.98         | 6.19        | 6.17            | 6.05           |
| Drone UI, 1 file                      | 4.56         | 4.89        | 4.74            | 4.41           |
| Scully, 3 files (teardown guard¹)     | 1.72         | 1.86        | 1.18            | 1.71           |
| Supabase UI                           | 5.17         | 9.95        | 5.75            | 4.76           |
| Next.js Vitest example                | 1.17         | 1.87        | 1.53            | 1.10           |
| freeCodeCamp, 2 files                 | 1.37         | 1.65        | 1.43            | 1.30           |
| Material UI, original 5 files         | 7.26         | 10.02       | 7.65            | 5.93           |
| Svelte runes, first shard             | 4.12         | 4.56        | 4.10            | 1.08           |
| Svelte motion                         | 1.14         | 1.25        | 1.17            | 0.92           |
| Scully globals only (teardown guard¹) | 1.41         | 1.54        | 1.17            | 1.37           |

| Selection                       | Provider  | Vitest stages                                                                                   |
| ------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| Material UI, 10 files           | RunDOM    | 16.05s (tests 83%, import 7%, transform 6%, setup 3%, environment 2%)                           |
| Material UI, 10 files           | jsdom     | 21.24s (tests 77%, environment 11%, import 5%, transform 5%, setup 2%)                          |
| Material UI, 10 files           | Happy DOM | 28.48s (tests 87%, import 4%, environment 4%, transform 3%, setup 2%)                           |
| Material UI, 10 files           | TurboDOM  | 23.25s (tests 87%, import 5%, transform 5%, setup 2%)                                           |
| Ant Design, 8 files             | RunDOM    | 4.80s (transform 47%, tests 25%, setup 19%, environment 5%, import 4%)                          |
| Ant Design, 8 files             | jsdom     | 6.42s (transform 36%, environment 25%, tests 20%, setup 13%, import 6%)                         |
| Ant Design, 8 files             | Happy DOM | 5.48s (transform 44%, tests 19%, setup 16%, environment 13%, import 8%)                         |
| Ant Design, 8 files             | TurboDOM  | 4.36s (transform 54%, tests 23%, setup 18%, import 5%)                                          |
| Vue runtime-dom                 | RunDOM    | 2.42s (transform 300ms, setup 35ms, import 859ms, tests 372ms, environment 400ms)               |
| Vue runtime-dom                 | jsdom     | 6.13s (transform 305ms, setup 72ms, import 866ms, tests 393ms, environment 4.07s)               |
| Vue runtime-dom                 | Happy DOM | 3.39s (transform 303ms, setup 35ms, import 872ms, tests 276ms, environment 1.46s)               |
| Vue runtime-dom                 | TurboDOM  | 2.01s (transform 264ms, setup 36ms, import 619ms, tests 194ms, environment 21ms)                |
| Svelte runes, legacy and motion | RunDOM    | 29.44s (transform 7.56s, setup 0ms, import 5.92s, tests 22.75s, environment 217ms)              |
| Svelte runes, legacy and motion | jsdom     | 33.25s (transform 7.96s, setup 0ms, import 6.32s, tests 25.14s, environment 1.24s)              |
| Svelte runes, legacy and motion | Happy DOM | 29.91s (transform 7.54s, setup 0ms, import 5.93s, tests 22.54s, environment 864ms)              |
| Svelte runes, legacy and motion | TurboDOM  | 4.89s (transform 2.83s, setup 0ms, import 0ms, tests 0ms, environment 20ms)                     |
| Supabase UI                     | RunDOM    | 3.78s (import 29%, tests 28%, setup 27%, environment 12%, transform 4%, worker 1%)              |
| Supabase UI                     | jsdom     | 7.50s (environment 47%, tests 24%, import 15%, setup 12%, transform 2%)                         |
| Supabase UI                     | Happy DOM | 4.47s (environment 36%, import 23%, setup 22%, tests 16%, transform 3%, worker 1%)              |
| Supabase UI                     | TurboDOM  | 4.45s (tests 46%, import 25%, setup 24%, transform 4%, environment 1%, worker 1%)               |
| Next.js Vitest example          | RunDOM    | 743ms (transform 45ms, setup 0ms, collect 189ms, tests 55ms, environment 80ms, prepare 102ms)   |
| Next.js Vitest example          | jsdom     | 1.44s (transform 42ms, setup 0ms, collect 179ms, tests 116ms, environment 715ms, prepare 102ms) |
| Next.js Vitest example          | Happy DOM | 1.07s (transform 44ms, setup 0ms, collect 188ms, tests 46ms, environment 402ms, prepare 105ms)  |
| Next.js Vitest example          | TurboDOM  | 700ms (transform 44ms, setup 0ms, collect 196ms, tests 37ms, environment 8ms, prepare 111ms)    |
| freeCodeCamp, 2 files           | RunDOM    | 774ms (transform 172ms, setup 162ms, import 398ms, tests 51ms, environment 47ms)                |
| freeCodeCamp, 2 files           | jsdom     | 1.14s (transform 170ms, setup 153ms, import 386ms, tests 79ms, environment 399ms)               |
| freeCodeCamp, 2 files           | Happy DOM | 859ms (transform 163ms, setup 158ms, import 367ms, tests 39ms, environment 178ms)               |
| freeCodeCamp, 2 files           | TurboDOM  | 747ms (transform 173ms, setup 167ms, import 371ms, tests 32ms, environment 5ms)                 |
| Material UI, original 5 files   | RunDOM    | 7.24s (tests 78%, transform 9%, import 8%, setup 3%, environment 2%)                            |
| Material UI, original 5 files   | jsdom     | 9.29s (tests 71%, environment 14%, transform 7%, import 6%, setup 2%)                           |
| Material UI, original 5 files   | Happy DOM | 8.60s (tests 77%, transform 8%, environment 6%, import 6%, setup 3%)                            |
| Material UI, original 5 files   | TurboDOM  | 4.05s (tests 37%, transform 29%, import 22%, setup 11%)                                         |
| Svelte runes, first shard       | RunDOM    | 5.52s (transform 1.09s, setup 0ms, import 722ms, tests 4.71s, environment 23ms)                 |
| Svelte runes, first shard       | jsdom     | 6.01s (transform 1.10s, setup 0ms, import 789ms, tests 4.94s, environment 211ms)                |
| Svelte runes, first shard       | Happy DOM | 5.59s (transform 1.11s, setup 0ms, import 722ms, tests 4.71s, environment 91ms)                 |
| Svelte runes, first shard       | TurboDOM  | 621ms (transform 372ms, setup 0ms, import 0ms, tests 0ms, environment 6ms)                      |
| Svelte motion                   | RunDOM    | 630ms (transform 371ms, setup 0ms, import 545ms, tests 2ms, environment 24ms)                   |
| Svelte motion                   | jsdom     | 734ms (transform 379ms, setup 0ms, import 544ms, tests 3ms, environment 128ms)                  |
| Svelte motion                   | Happy DOM | 700ms (transform 377ms, setup 0ms, import 547ms, tests 3ms, environment 91ms)                   |
| Svelte motion                   | TurboDOM  | 490ms (transform 285ms, setup 0ms, import 0ms, tests 0ms, environment 2ms)                      |

Per-run peak RSS shows how much the high-water mark varies between fresh processes. Each pair of columns covers all three runs, in execution-round order.

| Selection                      | RunDOM peaks MiB | jsdom peaks MiB    |
| ------------------------------ | ---------------- | ------------------ |
| Mozilla Readability, 130 pages | 737 / 753 / 774  | 1437 / 1267 / 1236 |
| Material UI, 10 files          | 555 / 585 / 588  | 567 / 492 / 582    |
| Ant Design, 8 files            | 585 / 588 / 587  | 611 / 610 / 623    |
| Vue runtime-dom                | 377 / 387 / 377  | 514 / 516 / 512    |
| React DOM, 2 files             | 844 / 843 / 848  | 888 / 847 / 838    |

## Change from the preceding replay

Ranges cover all three latest runs. The jsdom control change shows movement between batches with unchanged reference software. A small difference between batches is weak evidence for an implementation effect. [Trial summary and report filenames](../.cache/upstream-inline-vkcCKO/summary.json)

| Selection                             | Previous RunDOM s | Latest RunDOM s | Latest RunDOM range s | Latest jsdom range s | jsdom control change |
| ------------------------------------- | ----------------- | --------------- | --------------------- | -------------------- | -------------------- |
| Mozilla Readability, 130 pages        | 4.44              | 4.25            | 4.16–4.31             | 9.24–9.53            | -2.1%                |
| Material UI, 10 files                 | 16.36             | 16.40           | 16.36–16.51           | 21.57–21.72          | -0.2%                |
| Ant Design, 8 files                   | 5.02              | 4.95            | 4.94–4.98             | 6.31–6.76            | +0.2%                |
| Vue runtime-dom                       | 2.62              | 2.59            | 2.56–2.65             | 6.28–6.39            | -0.3%                |
| React DOM, 2 files                    | 4.30              | 4.31            | 4.30–4.90             | 4.52–5.03            | +0.4%                |
| Drone UI, 1 file                      | 3.50              | 3.48            | 3.47–3.54             | 3.77–4.29            | +0.5%                |
| Scully, 3 files (teardown guard¹)     | 1.06              | 1.05            | 1.05–1.39             | 1.22–1.56            | -0.8%                |
| Supabase UI                           | 3.97              | 3.91            | 3.90–4.02             | 7.57–7.86            | -0.6%                |
| Next.js Vitest example                | 0.97              | 0.95            | 0.95–1.11             | 1.64–1.67            | -1.8%                |
| freeCodeCamp, 2 files                 | 0.99              | 0.98            | 0.97–0.98             | 1.29–1.60            | -10.7%               |
| Material UI, original 5 files         | 7.61              | 7.58            | 7.55–7.75             | 9.62–9.80            | -1.9%                |
| Svelte runes, first shard             | 5.75              | 5.72            | 5.72–5.86             | 6.20–6.28            | -0.2%                |
| Svelte motion                         | 0.85              | 0.84            | 0.84–0.87             | 0.94–1.01            | -7.8%                |
| Scully globals only (teardown guard¹) | 0.91              | 0.90            | 0.90–0.91             | 1.09–1.31            | +0.9%                |

## Readability application

This benchmark opens, extracts and closes 130 documents and hashes the articles. Heap values are sampled after forced GC at the end of the synchronous batch and after an event-loop turn. All four providers attempted three full replays.

| Provider  | Complete trials | Construct s | Extract s | Close ms | Process s | Peak MiB | Same-turn heap MiB | Next-turn heap MiB |
| --------- | --------------- | ----------- | --------- | -------- | --------- | -------- | ------------------ | ------------------ |
| RunDOM    | 3               | 0.75        | 1.21      | 1.14     | 2.10      | 647      | 51.19              | 36.82              |
| jsdom     | 3               | 3.13        | 2.36      | 35.18    | 5.84      | 1309     | 717.56             | 167.74             |
| Happy DOM | 0               | —           | —         | —        | —         | —        | —                  | —                  |
| TurboDOM  | 0               | —           | —         | —        | —         | —        | —                  | —                  |

RunDOM and jsdom differed on 5 serialized articles. Independent parsing found 0 differences in the resulting trees. [Per-article differences](../.cache/upstream-inline-vkcCKO/output-equivalence.json) · [Application exit codes and matched test identities](../.cache/upstream-inline-vkcCKO/matches.jsonl)

## React and Testing Library supplemental workloads

Each eligible cell summarizes nine fresh Vitest processes exercising the same React and Testing Library fixture. Cells give process seconds / test seconds / worker RSS MiB. RSS here is sampled at suite end. These fixtures supplement upstream React’s two Jest files.

| Fixture      | Worker pool | RunDOM            | jsdom             | Happy DOM         | TurboDOM   |
| ------------ | ----------- | ----------------- | ----------------- | ----------------- | ---------- |
| 8 workflows  | forks       | 0.38 / 0.11 / 126 | 0.61 / 0.14 / 215 | 0.43 / 0.10 / 123 | incomplete |
| 8 workflows  | threads     | 0.37 / 0.11 / 179 | 0.58 / 0.14 / 241 | 0.41 / 0.10 / 181 | incomplete |
| 8 workflows  | vmForks     | 0.44 / 0.13 / 138 | 0.61 / 0.14 / 204 | 0.44 / 0.10 / 138 | incomplete |
| 8 workflows  | vmThreads   | 0.42 / 0.13 / 188 | 0.59 / 0.14 / 254 | 0.43 / 0.10 / 189 | incomplete |
| 10 workflows | forks       | 0.79 / 0.40 / 260 | 1.35 / 0.58 / 332 | incomplete        | incomplete |
| 10 workflows | threads     | 0.75 / 0.40 / 278 | 1.33 / 0.61 / 381 | incomplete        | incomplete |
| 10 workflows | vmForks     | 0.74 / 0.40 / 288 | 1.07 / 0.57 / 345 | incomplete        | incomplete |
| 10 workflows | vmThreads   | 0.72 / 0.40 / 340 | 1.04 / 0.57 / 394 | incomplete        | incomplete |

[Eight-workflow trials and failures](../.cache/upstream-inline-vkcCKO/react-standard.json) · [Ten-workflow trials and failures](../.cache/upstream-inline-vkcCKO/react-integration.json)

## Which tests dominate

The longest component files below are ranked by summed upstream test duration on RunDOM. Each value is the median of three complete runs. The React row measures the case that previously formatted an internal CSS parser error stack.

| Project     | File or case                                                | RunDOM ms | jsdom ms | Difference ms |
| ----------- | ----------------------------------------------------------- | --------- | -------- | ------------- |
| Material UI | packages/mui-material/src/Autocomplete/Autocomplete.test.js | 4905      | 6846     | -1940         |
| Material UI | packages/mui-material/src/Select/Select.test.js             | 4208      | 4807     | -599          |
| Material UI | packages/mui-material/src/Tabs/Tabs.test.js                 | 1115      | 1283     | -167          |
| Material UI | packages/mui-material/src/Tooltip/Tooltip.test.js           | 918       | 1023     | -105          |
| Material UI | packages/mui-material/src/TextField/TextField.test.js       | 387       | 525      | -138          |
| Ant Design  | components/radio/**tests**/group.test.tsx                   | 229       | 260      | -31           |
| Ant Design  | components/checkbox/**tests**/group.test.tsx                | 211       | 237      | -26           |
| Ant Design  | components/alert/**tests**/index.test.tsx                   | 205       | 216      | -12           |
| Ant Design  | components/radio/**tests**/radio.test.tsx                   | 153       | 162      | -10           |
| Ant Design  | components/checkbox/**tests**/checkbox.test.tsx             | 90        | 108      | -18           |
| React DOM   | should warn about style having a trailing semicolon         | 2         | 2        | 0             |

## Direct article extraction on equal output

Each provider attempted all 130 original pages individually. A page qualified for the timed subset only if every provider produced identical article fields and the same independently parsed content tree, including text, namespaces and attributes. Selection used output equality before measuring speed. Each process then ran the shared pages in their original order with the normal production benchmark.

| Provider  | Attempted | Threw | Empty | Identical article bytes | Identical fields and content tree |
| --------- | --------- | ----- | ----- | ----------------------- | --------------------------------- |
| RunDOM    | 130       | 0     | 0     | 125                     | 130                               |
| jsdom     | 130       | 0     | 0     | 130                     | 130                               |
| Happy DOM | 130       | 0     | 1     | 124                     | 127                               |
| TurboDOM  | 130       | 86    | 0     | 40                      | 42                                |

All four providers qualified on 42 pages. Of those, 40 also produced byte-identical article JSON across all providers. The elapsed time includes loading the upstream fixture corpus and hashing the selected outputs. Construction, extraction and closure timings isolate application work.

| Provider  | Construct ms | Extract ms | Close ms | End to end s | Peak RSS MiB | Next-turn heap MiB |
| --------- | ------------ | ---------- | -------- | ------------ | ------------ | ------------------ |
| RunDOM    | 97.13        | 135.04     | 0.35     | 0.34         | 260.98       | 24.50              |
| jsdom     | 235.99       | 246.04     | 3.72     | 0.67         | 365.78       | 36.44              |
| Happy DOM | 101.87       | 139.11     | 0.04     | 0.43         | 343.59       | 58.07              |
| TurboDOM  | 16.61        | 80.60      | 0.02     | 0.19         | 244.20       | 13.45              |

[Comparable stages and selected article identities](../.cache/upstream-inline-vkcCKO/shared-articles/metrics.json) · [All 520 page outcomes and raw process logs](../.cache/upstream-inline-vkcCKO/shared-articles/)

## Where the elapsed advantage comes from

For each primary selection that completed identically in all RunDOM and jsdom repeats, the first two timing columns give jsdom minus RunDOM. The runner remainder includes work outside its test-duration measure, such as starting workers, loading modules, and teardown. The Mocha test measure covers suite time. Remainders are calculated separately in each trial before taking medians.

| Selection                         | Whole process s | Runner test measure s | Remainder s | Process difference by rotation s |
| --------------------------------- | --------------- | --------------------- | ----------- | -------------------------------- |
| Mozilla Readability, 130 pages    | +5.100          | +4.894                | +0.236      | +5.37 / +4.93 / +5.10            |
| Material UI, 10 files             | +5.270          | +3.141                | +2.219      | +5.06 / +5.36 / +5.27            |
| Ant Design, 8 files               | +1.670          | +0.116                | +1.552      | +1.36 / +1.78 / +1.67            |
| Vue runtime-dom                   | +3.740          | +0.015                | +3.725      | +3.74 / +3.80 / +3.63            |
| React DOM, 2 files                | +0.670          | +0.034                | +0.636      | -0.38 / +0.73 / +0.67            |
| Drone UI, 1 file                  | +0.750          | +0.040                | +0.710      | +0.30 / +0.79 / +0.75            |
| Scully, 3 files (teardown guard¹) | +0.230          | +0.000                | +0.230      | +0.23 / +0.51 / -0.17            |
| Supabase UI                       | +3.790          | +0.806                | +2.994      | +3.95 / +3.55 / +3.79            |
| Next.js Vitest example            | +0.690          | +0.061                | +0.628      | +0.56 / +0.69 / +0.69            |
| freeCodeCamp, 2 files             | +0.350          | +0.026                | +0.322      | +0.35 / +0.32 / +0.62            |

## Test files accounting for the TurboDOM gap

Each row sums durations for the same named passing cases within an upstream file. Times are medians of three trials. The table selects the largest positive RunDOM-minus-TurboDOM differences in each comparable framework workload. Runner load, imports and skipped cases are outside these file totals.

| Framework   | Upstream file                                                                | Cases | RunDOM ms | jsdom ms | Happy DOM ms | TurboDOM ms | Difference ms |
| ----------- | ---------------------------------------------------------------------------- | ----- | --------- | -------- | ------------ | ----------- | ------------- |
| Vue         | packages/runtime-dom/**tests**/patchStyle.spec.ts                            | 19    | 26.0      | 11.7     | 5.9          | 5.4         | +20.7         |
| Vue         | packages/runtime-dom/**tests**/customElement.spec.ts                         | 65    | 85.2      | 86.6     | 58.4         | 66.8        | +18.4         |
| Vue         | packages/runtime-dom/**tests**/helpers/useCssVars.spec.ts                    | 1     | 13.4      | 9.2      | 5.9          | 5.2         | +8.2          |
| Ant Design  | components/checkbox/**tests**/group.test.tsx                                 | 23    | 206.8     | 225.3    | 173.1        | 159.7       | +47.2         |
| Ant Design  | components/radio/**tests**/group.test.tsx                                    | 29    | 221.1     | 263.4    | 231.9        | 179.9       | +41.2         |
| Ant Design  | components/alert/**tests**/index.test.tsx                                    | 20    | 169.4     | 181.6    | 147.0        | 137.9       | +31.5         |
| Material UI | packages/mui-material/src/Button/Button.test.js                              | 66    | 232.0     | 301.1    | 183.8        | 143.3       | +88.7         |
| Material UI | packages/mui-material/src/TextField/TextField.test.js                        | 52    | 249.6     | 341.2    | 213.7        | 166.6       | +83.0         |
| Supabase UI | packages/ui/src/components/shadcn/ui/alert-dialog.test.tsx                   | 7     | 99.7      | 322.3    | 63.6         | 53.6        | +46.1         |
| Supabase UI | packages/ui/src/components/CustomHTMLElements/CopyHeadingLinkButton.test.tsx | 4     | 72.4      | 101.9    | 38.0         | 36.2        | +36.2         |
| Supabase UI | packages/ui/src/components/shadcn/ui/toggle-group.test.tsx                   | 13    | 179.1     | 332.9    | 116.0        | 145.5       | +33.6         |

## Earlier React, Drone and Scully selections

The original project exploration also used these overlapping Jest selections. All four published adapters were screened. Successful providers repeated twice when at least two completed the selection. Cells show passed / failed, process seconds / test seconds / peak MiB, then the number of trials. A dagger marks unequal named outcomes or a nonzero exit. Scully uses the same guarded teardown as in the primary matrix. [Source hashes, traces, failures and elapsed, CPU and memory measurements](../.cache/upstream-inline-vkcCKO/historical.json)

| Historical selection                               | RunDOM                           | jsdom                          | Happy DOM                        | TurboDOM                          |
| -------------------------------------------------- | -------------------------------- | ------------------------------ | -------------------------------- | --------------------------------- |
| React DOM, four files including event dispatch     | 86 / 3, 4.79 / 3.69 / 868, n=1 † | 89 / 0, 5.29 / 3.65 / 849, n=1 | 86 / 3, 4.73 / 3.63 / 830, n=1 † | 78 / 11, 4.57 / 3.58 / 804, n=1 † |
| React DOM, three files including invalid listeners | 65 / 1, 4.45 / 3.44 / 916, n=1 † | 66 / 0, 4.49 / 3.34 / 847, n=1 | 64 / 2, 4.42 / 3.37 / 836, n=1 † | 62 / 4, 4.28 / 3.33 / 834, n=1 †  |
| Drone UI, CreateRepositoryButton and Strings       | 11 / 1, 4.52 / 0.73 / 618, n=1 † | 12 / 0, 3.92 / 0.75 / 624, n=1 | 11 / 1, 3.85 / 0.73 / 627, n=1 † | 10 / 2, 3.23 / 0.06 / 615, n=1 †  |
| Scully, baseHrefRewrite                            | 3 / 0, 0.72 / 0.00 / 393, n=3    | 3 / 0, 0.80 / 0.00 / 385, n=3  | 0 / 0, 0.80 / 0.00 / 383, n=1 †  | 3 / 0, 0.71 / 0.00 / 390, n=3     |

## Vue inline style patching

This upstream case assigns width, height and display, changes all three, then reapplies Vue’s style object. Those operations expose a cold inline-declaration cost that is easy to miss in whole-suite timings. The table gives durations reported by the upstream test runner.

| Provider  | Round 1 ms | Round 2 ms | Round 3 ms | Median ms |
| --------- | ---------- | ---------- | ---------- | --------- |
| rundom    | 0.55       | 0.56       | 0.57       | 0.56      |
| jsdom     | 1.34       | 1.38       | 1.36       | 1.36      |
| happy-dom | 0.58       | 0.57       | 0.57       | 0.57      |
| turbo-dom | 0.53       | 0.53       | 0.52       | 0.53      |

## Material UI worker memory after teardown

A separate diagnostic reran the ten files on RunDOM and jsdom. Every worker recorded its process high-water RSS on entering teardown and live V8 heap after disposing the environment, yielding a turn and forcing GC. Both providers passed 1,087 tests. The table uses a single instrumented observation per file and provider. [Per-worker memory checkpoints and test reports](../.cache/upstream-inline-vkcCKO/mui-workers/)

| Worker       | RunDOM peak MiB | jsdom peak MiB | Peak difference MiB | RunDOM settled heap MiB | jsdom settled heap MiB | Heap difference MiB |
| ------------ | --------------- | -------------- | ------------------- | ----------------------- | ---------------------- | ------------------- |
| Autocomplete | 582.9           | 518.4          | 64.5                | 90.1                    | 110.8                  | -20.7               |
| Select       | 325.1           | 370.9          | -45.8               | 69.6                    | 89.4                   | -19.8               |
| Tabs         | 317.3           | 330.2          | -12.9               | 59.2                    | 79.7                   | -20.5               |
| TextField    | 229.9           | 320.1          | -90.2               | 58.5                    | 79.1                   | -20.6               |
| Tooltip      | 222.4           | 296.7          | -74.2               | 53.0                    | 73.7                   | -20.7               |
| Menu         | 216.5           | 282.6          | -66.1               | 54.3                    | 74.0                   | -19.7               |
| Popover      | 194.7           | 284.6          | -89.9               | 55.4                    | 76.0                   | -20.7               |
| Dialog       | 192.8           | 284.0          | -91.1               | 51.3                    | 71.5                   | -20.2               |
| Drawer       | 189.8           | 283.0          | -93.2               | 51.0                    | 71.5                   | -20.5               |
| MenuList     | 184.9           | 279.4          | -94.5               | 50.3                    | 71.0                   | -20.7               |

## Compatibility of the wider Jest screens

Drone’s additional Strings test renders an error span with a CSS variable as its color. Its snapshot expects the style attribute to be absent. In a separate public CSSOM check, Chromium 156.0.8078.4 returned 'color: var(--red-500);', RunDOM returned 'color: var(--red-500);', and Drone’s installed jsdom returned no attribute. The snapshot failure remains in the compatibility totals. [Browser and project-provider results](../.cache/upstream-inline-vkcCKO/drone-style.json)

The wider React replay had these failing named cases. The two propagation cases invoke React’s internal event-dispatch helper. The invalid-listener expectation checks the number of console calls. [Four-file React assertions and stacks](../.cache/upstream-inline-vkcCKO/jest-providers/native-react-4-rundom-0.json)

- ReactDOMEventListener Propagation should batch between handlers from different roots (discrete)
- ReactDOMEventListener Propagation should batch between handlers from different roots (continuous)
- InvalidEventListeners should prevent non-function listeners, at dispatch

## What changed in the CSS implementation

Independent inline longhands now stay in the element’s style attribute. An operation that needs the full parser promotes the same public object and seeds its already-canonical values in declaration order. Separately, the bundled CSS engine now installs generic property accessors when they are first used. The pinned upstream table has 1,462 generic accessor names for 728 properties with 42 distinct option records. Its specialized property handlers still use the upstream implementation. Public reflection retains the full property list and ordering.

| Provider      | Create element ms | Get style ms | First width write ms | Height write ms | Initial sequence ms | 100 update sequences ms | First complex write afterward ms |
| ------------- | ----------------- | ------------ | -------------------- | --------------- | ------------------- | ----------------------- | -------------------------------- |
| RunDOM before | 0.30              | 0.58         | 21.53                | 0.26            | 23.45               | 5.17                    | 0.70                             |
| RunDOM after  | 0.31              | 0.53         | 1.48                 | 0.14            | 2.65                | 2.91                    | 15.20                            |
| jsdom         | 0.26              | 0.04         | 2.39                 | 0.23            | 3.58                | 3.67                    | 0.76                             |
| Happy DOM     | 0.07              | 0.04         | 0.73                 | 0.17            | 1.15                | 3.90                    | 0.12                             |
| TurboDOM      | 0.09              | 0.06         | 0.80                 | 0.08            | 1.19                | 4.51                    | 0.16                             |

The later complex write reveals how much initialization moves to the next operation. Each provider ran in eleven fresh Node processes in rotated order, with checks on serialization and readback. [Per-operation timings](../.cache/inline-layout-pjTC5i/final-inline.jsonl)

## Cost of the first full CSS read or write

| Operation                | Build  | Cold ms | 100 repeated operations ms | Peak RSS MiB |
| ------------------------ | ------ | ------- | -------------------------- | ------------ |
| Box longhand             | Before | 21.71   | 1.26                       | 101.55       |
| Box longhand             | After  | 16.16   | 1.23                       | 86.42        |
| Two generic longhands    | Before | 21.88   | 1.62                       | 102.09       |
| Two generic longhands    | After  | 16.35   | 1.57                       | 86.91        |
| Shorthands and transform | Before | 25.64   | 15.95                      | 126.27       |
| Shorthands and transform | After  | 20.02   | 14.77                      | 96.75        |
| Computed font-family     | Before | 19.85   | 0.27                       | 100.53       |
| Computed font-family     | After  | 14.60   | 0.26                       | 85.50        |

Each trial started a new process and immediately required full CSS support. The build comparison includes both changes. The private-accessor experiment separately compared packages that both had the inline change. [Final cold and warm trials](../.cache/inline-layout-pjTC5i/fullcss-baseline-final.jsonl) · [Accessor experiment in isolation](../.cache/inline-layout-pjTC5i/fullcss-seed-dispatch.jsonl) · [Fifteen cold CPU profiles](../.cache/inline-layout-pjTC5i/cold/summary.json)

## Inline workloads with mixed promotion

| 1,536 elements in eight windows      | Build  | Create and update ms | Peak RSS MiB | Live heap MiB | Released heap MiB |
| ------------------------------------ | ------ | -------------------- | ------------ | ------------- | ----------------- |
| Four independent longhands           | Before | 90.05                | 163.67       | 26.56         | 19.91             |
| Four independent longhands           | After  | 35.99                | 100.66       | 16.57         | 12.35             |
| CSS engine already initialized       | Before | 87.43                | 164.16       | 26.63         | 19.96             |
| CSS engine already initialized       | After  | 53.88                | 126.97       | 22.46         | 18.19             |
| One in three elements gains a border | Before | 154.39               | 177.05       | 28.68         | 20.81             |
| One in three elements gains a border | After  | 134.91               | 130.66       | 25.62         | 19.61             |
| Every element gains a border         | Before | 256.90               | 177.31       | 31.40         | 21.21             |
| Every element gains a border         | After  | 245.62               | 167.14       | 29.76         | 20.35             |

Each timing cell summarizes seven fresh processes. The separate memory cells summarize three processes, with three event-loop turns and forced collections at each checkpoint. Outputs matched within each workload. [Individual timing and memory trials](../.cache/inline-layout-pjTC5i/multi-baseline-final.jsonl)

## Effect on complete Vue runtime-dom runs

| Provider      | Passed | Failed | Style patch case ms | All test bodies ms | Process s | Peak RSS MiB |
| ------------- | ------ | ------ | ------------------- | ------------------ | --------- | ------------ |
| RunDOM before | 270    | 0      | 21.20               | 387.57             | 2.65      | 395.42       |
| RunDOM after  | 270    | 0      | 0.56                | 368.23             | 2.63      | 381.08       |
| jsdom         | 270    | 0      | 1.35                | 380.74             | 6.18      | 518.03       |
| Happy DOM     | 251    | 19     | 0.59                | 265.56             | 3.64      | 399.97       |
| TurboDOM      | 169    | 32     | 0.54                | 186.86             | 2.19      | 342.30       |

Five repetitions per build or provider ran in a rotating order. The complete suite includes initialization on other CSS operations, which limits the effect of the first width write on process time. [Paired Vue identities and timings](../.cache/inline-layout-pjTC5i/final-vue.jsonl)

## CSS and DOM qualification

An initial screen exposed an out-of-range CSSOM item returning an ordinary expando with the same numeric key. The final build restores the empty string for that index. The real-project tables use fresh runs of the corrected package. [Index and expando regression check](../.cache/inline-layout-pjTC5i/final-item-expando.jsonl)

The workspace gate passed all 15 tasks. Both HTML parsers passed all 634 upstream jsdom API tests and matched the baseline on 608 named WPT assertion and harness outcomes each. The additional CSSOM screen covered 35 files and 170 assertion and harness outcomes, with identical statuses before and after. Existing failures remain in these WPT selections. The inline differential matched on 3,540 observations and the baseline and candidate agreed on reads, writes and reflection across 1,618 CSS accessor names. Chromium matched the 36 mutation and serialization examples. [CSSOM outcome comparison](../.cache/inline-layout-pjTC5i/cssom-wpt.json) · [DOM WPT comparison](../.cache/inline-layout-pjTC5i/wpt-identity.json) · [All-accessor differential](../.cache/inline-layout-pjTC5i/final-reflection.json) · [Inline CSS differential](../.cache/inline-layout-pjTC5i/final-grammar.json) · [Workspace gate](../.cache/inline-layout-pjTC5i/final-check.log)

For all 1,462 generic accessor names, twelve inputs exercised both indexed inline writes and priority-bearing CSS rule writes. All 35,088 serialization, getter, priority and removal observations matched. 9,038 yielded a nonempty specified value. [Generic property value comparison](../.cache/inline-layout-pjTC5i/property-values.json)

| 32 operations, median warm batch ms | RunDOM before | RunDOM after | jsdom      | Happy DOM  | TurboDOM   |
| ----------------------------------- | ------------- | ------------ | ---------- | ---------- | ---------- |
| style-inline-invalidation           | 0.87          | 0.82         | 6.16       | 3.73       | 1.05       |
| style-read                          | 0.04          | 0.04         | 0.08       | 0.01       | 0.04       |
| style-inheritance                   | 1.38          | 1.64         | incomplete | 3.41       | incomplete |
| role-query                          | 0.76          | 0.75         | 15.50      | 0.50       | 0.41       |
| style-snapshot                      | 1.50          | 1.49         | 11.82      | incomplete | incomplete |

Each verified synthetic timing cell uses seven runs. Providers that fail the scenario’s semantic checks have no timing cell. [Laboratory comparison and failure records](../.cache/inline-layout-pjTC5i/styles-compare.json)

| Window lifetime    | Provider  | Verified trials | Peak RSS MiB | Live heap MiB | Closed windows held MiB | All released MiB |
| ------------------ | --------- | --------------- | ------------ | ------------- | ----------------------- | ---------------- |
| windows-live       | run-dom   | 5               | 129.91       | 25.93         | 25.95                   | 19.09            |
| windows-live       | jsdom     | 5               | 244.23       | 74.11         | 74.12                   | 45.50            |
| windows-live       | happy-dom | 5               | 237.16       | 87.77         | 29.39                   | 25.02            |
| windows-live       | turbo-dom | 5               | 107.23       | 17.10         | 17.10                   | 16.18            |
| windows-style-live | run-dom   | 5               | 141.12       | 34.65         | 34.67                   | 25.83            |
| windows-style-live | jsdom     | 5               | 268.55       | 85.59         | 85.53                   | 51.48            |
| windows-style-live | happy-dom | 5               | 238.66       | 89.38         | 29.80                   | 25.41            |
| windows-style-live | turbo-dom | 5               | 108.62       | 18.39         | 18.40                   | 16.37            |

[Four-provider lifetime checkpoints](../.cache/inline-layout-pjTC5i/styles-memory.json)

## Paired upstream Ant Design and Material UI runs

Material UI, 10 files paired differences (after minus before), in round order. Whole-process ms -496, +15, +26, +129, -3. Test-body ms -177, +52, +5, +48, +41. Peak RSS MiB -15.9, -27.2, +20.1, -54.1, -7.5.

Ant Design, 8 files paired differences (after minus before), in round order. Whole-process ms +343, -82, -508, -339, -38. Test-body ms -35, -3, -95, +21, -22. Peak RSS MiB -10.3, -9.0, -11.8, -15.3, -8.2.

| Selection             | Build  | Passed | Process s | Test bodies s | Peak RSS MiB |
| --------------------- | ------ | ------ | --------- | ------------- | ------------ |
| Material UI, 10 files | Before | 1087   | 16.42     | 12.77         | 598.69       |
| Material UI, 10 files | After  | 1087   | 16.47     | 12.80         | 580.48       |
| Ant Design, 8 files   | Before | 133    | 5.09      | 1.12          | 597.05       |
| Ant Design, 8 files   | After  | 133    | 5.01      | 1.11          | 585.25       |

The frozen old and new RunDOM packages alternated within the same replay. Each pair had the same named test outcomes. [Five pairs per selection](../.cache/inline-layout-pjTC5i/components.jsonl)

The extended CSS, selectors, query and mutation WPT replay covered 772 files and 14,118 named assertion and harness outcomes with each backend. Both parsers reproduced the frozen baseline’s individual outcomes and outer runner statuses. [Extended compatibility comparison and pre-existing failures](../.cache/inline-layout-pjTC5i/extended-wpt.json)

## Autocomplete native memory regions

Three additional isolated Autocomplete runs per provider captured macOS memory maps at entry to environment teardown and after disposal. Both providers completed the same assertions. Each snapshot stops the worker to inspect its address space. Its resident and physical-footprint values describe that checkpoint. The process high-water mark may have occurred earlier.

| Checkpoint | Provider | Passed | Peak RSS MiB | Current RSS MiB | Physical footprint MiB | V8 physical heap MiB | Used heap MiB |
| ---------- | -------- | ------ | ------------ | --------------- | ---------------------- | -------------------- | ------------- |
| before     | rundom   | 348    | 586.36       | 585.48          | 580.20                 | 458.69               | 333.44        |
| before     | jsdom    | 348    | 503.03       | 503.03          | 492.30                 | 388.44               | 177.82        |
| after      | rundom   | 348    | 594.61       | 236.53          | 195.80                 | 93.75                | 90.43         |
| after      | jsdom    | 348    | 508.78       | 235.75          | 196.50                 | 113.73               | 111.02        |

With the environment still alive, two forced collections after the final assertion reclaimed 243.1 MiB on RunDOM and 66.9 MiB on jsdom. At that same point, median RSS was 236.5 and 235.7 MiB respectively, and live heap was 90.4 and 110.9 MiB. The excess resident memory at assertion end was largely collectible before window disposal. The uninstrumented headline timings above retain ordinary GC scheduling.

| Largest resident-region differences at teardown | RunDOM MiB | jsdom MiB | Difference MiB |
| ----------------------------------------------- | ---------- | --------- | -------------- |
| Memory Tag 255                                  | 458.80     | 390.90    | +67.90         |
| MALLOC_SMALL (empty)                            | 17.70      | 12.10     | +5.60          |
| page table in kernel                            | 40.90      | 35.70     | +5.20          |
| MALLOC_SMALL                                    | 53.50      | 48.80     | +4.70          |
| MALLOC_LARGE (empty)                            | 5.12       | 1.64      | +3.48          |
| __TEXT                                          | 160.80     | 161.30    | -0.50          |

[All memory maps and V8 checkpoints](../.cache/upstream-inline-vkcCKO/mui-regions/regions.json)

## Where the shared article workload spends CPU

The same qualified articles ran three more times per provider with the Node CPU sampler. Synchronous construction, extraction and closing were marked separately while preserving the original article order. Output hashes matched each provider’s uninstrumented run. Percentages below are shares of sampled time attributed to the named phase. Samples without that phase on their stack, including some garbage collection, are excluded. Native calls can appear at their JavaScript caller.

| Provider  | Stage     | CPU samples | Largest self-time frames                                                                                                                    |
| --------- | --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| rundom    | construct | 2598        | buildWindow · window-implementation.cjs (12%), Script · node:vm (8%), _callState · window-implementation.cjs (5%)                           |
| rundom    | extract   | 3282        | (anonymous) · css-runtime-implementation.cjs (5%), isElementNode · window-implementation.cjs (5%), za · css-runtime-implementation.cjs (4%) |
| jsdom     | construct | 6031        | exports.installInterfaces · interfaces.js (5%), _callState · index.js (4%), _insert · Node-impl.js (3%)                                     |
| jsdom     | extract   | 5989        | encode · encoding (12%), URLStateMachine · url-state-machine.js (7%), following · SymbolTree.js (5%)                                        |
| happy-dom | construct | 2212        | Node · Node.js (10%), (anonymous) · Node.js (9%), createContext · node:vm (8%)                                                              |
| happy-dom | extract   | 3207        | findAll · QuerySelector.js (13%), (anonymous) · Node.js (11%), get textContent · Element.js (6%)                                            |
| turbo-dom | construct | 428         | parseBufferCached · index.mjs (69%), dlopen · (runtime) (7%), decodeUTF8 · (runtime) (5%)                                                   |
| turbo-dom | extract   | 2016        | visit · selectors.mjs (8%), get textContent · dom.mjs (5%), get nodeType · dom.mjs (5%)                                                     |

[CPU samples and inclusive stacks](../.cache/upstream-inline-vkcCKO/article-cpu/summary.json)

## Follow-up experiment on stylesheet parsing

A separate prototype records declaration offsets while checking the stylesheet token stream. It materializes the original declaration tree on demand without tokenizing the block twice. It was kept outside the four-provider benchmark package. The tree and diagnostic differential matched on 347 real stylesheets, 900 generated sheets and 5,000 additional malformed and escaped inputs.

| Read fraction of 347 sheets | Implementation | Attach ms | Read ms | Combined ms | Held heap MiB | Released heap MiB |
| --------------------------- | -------------- | --------- | ------- | ----------- | ------------- | ----------------- |
| unread                      | baseline       | 134.13    | 0.01    | 134.13      | 29.30         | 12.45             |
| unread                      | candidate      | 107.52    | 0.01    | 107.52      | 25.00         | 12.49             |
| quarter                     | baseline       | 134.49    | 2.77    | 137.36      | 29.35         | 12.48             |
| quarter                     | candidate      | 106.51    | 3.64    | 110.08      | 25.91         | 12.46             |
| all                         | baseline       | 133.81    | 11.29   | 145.25      | 29.39         | 12.48             |
| all                         | candidate      | 107.91    | 20.73   | 128.64      | 28.96         | 12.47             |

| Readability articles | Implementation | Construct ms | Extract ms | Process s | Peak RSS MiB | Next-turn heap MiB |
| -------------------- | -------------- | ------------ | ---------- | --------- | ------------ | ------------------ |
| 42                   | baseline       | 112.01       | 159.87     | 0.41      | 261.70       | 24.60              |
| 42                   | candidate      | 109.54       | 159.69     | 0.41      | 308.00       | 24.15              |
| 130                  | baseline       | 909.17       | 1489.80    | 2.57      | 642.95       | 36.88              |
| 130                  | candidate      | 937.12       | 1430.03    | 2.54      | 646.80       | 36.82              |

[Paired actual application trials](../.cache/stylesheet-offsets-J653vh/apps.jsonl) · [Held stylesheet trials](../.cache/stylesheet-offsets-J653vh/held.jsonl) · [Additional randomized checks](../.cache/stylesheet-offsets-J653vh/fuzz.json)

## When Autocomplete raises worker RSS

Three additional instrumented workers per provider ran the same 348 passing cases in the same order. Each recorded current RSS, V8 heap, and the process high-water mark immediately before and after each test. There was no forced collection. The table selects the five cases with the largest median high-water increase on RunDOM. Each row measures the increase while that test ran, which also depends on the heap state left by earlier tests.

| Autocomplete case                                                                                       | RunDOM increase MiB | jsdom increase MiB | RunDOM high-water MiB | jsdom high-water MiB |
| ------------------------------------------------------------------------------------------------------- | ------------------- | ------------------ | --------------------- | -------------------- |
| should toggle the autocomplete popup when clicking the popup indicator                                  | 26.16               | 25.86              | 400.78                | 425.67               |
| applies the className to the root component                                                             | 23.56               | 23.09              | 185.61                | 266.59               |
| sets custom properties on the paper slot's element with the slotProps.paper prop                        | 14.44               | 0.44               | 246.81                | 314.25               |
| sets custom properties on the root slot's element with the slotProps.root callback using the ownerState | 7.66                | 2.95               | 275.66                | 320.42               |
| spreads props to the root component                                                                     | 7.36                | 14.66              | 193.14                | 281.31               |

[Per-case RSS and heap checkpoints](../.cache/upstream-inline-vkcCKO/mui-cases/summary.json)

## RunDOM HTML parser backends on actual articles

Both backend settings used the same frozen RunDOM package. On 130 source pages, the Rust setting differed from TypeScript on 0 per-page output records. Native calls and capability fallbacks are recorded by the parser itself. The shared timing subset required equal serialized output under both settings. Seven rotated pairs ran per input set.

| Pages | Backend    | Native calls | Recorded fallbacks | Construct ms | Extract ms | Process s | Peak RSS MiB | Released heap MiB |
| ----- | ---------- | ------------ | ------------------ | ------------ | ---------- | --------- | ------------ | ----------------- |
| 42    | typescript | 0            | 0                  | 109.55       | 158.61     | 0.40      | 307.84       | 24.60             |
| 42    | rust       | 38           | 4                  | 115.72       | 161.59     | 0.42      | 314.55       | 25.86             |
| 130   | typescript | 0            | 0                  | 881.97       | 1464.59    | 2.53      | 633.59       | 36.88             |
| 130   | rust       | 62           | 68                 | 918.00       | 1489.24    | 2.58      | 648.94       | 37.95             |

[Backend trials and parser counters](../.cache/upstream-inline-vkcCKO/parser-backends/results.jsonl) · [Per-page output differences](../.cache/upstream-inline-vkcCKO/parser-backends/output.json)

## Isolating warm inherited-style cost

The first laboratory replay showed a slower short inherited-property batch. This experiment rotated six packages in the same verified workload, using both the original 32-operation batch and a longer 512-operation batch. Baseline predates both changes. Inline only excludes the private CSS registry. Final is the frozen RunDOM package used throughout the four-provider replay. Three diagnostic builds change the private registry: slots predefines the declaration’s own fields, get-only removes its write interception, and canonical eagerly installs one upstream accessor pair per distinct recipe on an ordinary prototype.

| Package     | 32 operations ms | 512 operations ms | First complex write ms | Cold peak RSS MiB |
| ----------- | ---------------- | ----------------- | ---------------------- | ----------------- |
| baseline    | 1.44             | 14.54             | —                      | —                 |
| inline only | 1.47             | 14.28             | —                      | —                 |
| final       | 1.79             | 20.27             | 16.24                  | 86.52             |
| slots       | 1.67             | 16.54             | 16.32                  | 86.62             |
| get-only    | 1.75             | 18.47             | 16.40                  | 86.53             |
| canonical   | 1.49             | 14.75             | 21.36                  | 100.92            |

[Eleven rounds per workload](../.cache/inheritance-dispatch-FAUNc8/trials.jsonl) · [Cold costs](../.cache/inheritance-dispatch-FAUNc8/cold.jsonl) · [Observed property parity of the canonical variant](../.cache/inheritance-dispatch-FAUNc8/canonical-parity.json)

## Indexed stylesheet declarations on Ant Design

| Package   | Process s | 133 test bodies s | Peak RSS MiB |
| --------- | --------- | ----------------- | ------------ |
| baseline  | 5.00      | 1.11              | 584.92       |
| candidate | 4.99      | 1.10              | 587.77       |

[Per-pair metrics and provider traces](../.cache/stylesheet-offsets-J653vh/antd.jsonl)

## Specified longhand reads in mixed inline styles on Ant Design

| Package   | Process s | 133 test bodies s | Peak RSS MiB |
| --------- | --------- | ----------------- | ------------ |
| baseline  | 5.10      | 1.12              | 585.98       |
| candidate | 5.01      | 1.11              | 585.80       |

[Per-pair metrics and provider traces](../.cache/specified-style-read-5dcWmF/antd.jsonl)

The CPU profiles attributed part of extraction to materializing element.style while Readability checked display and visibility. This prototype reads recognized independent keywords from flat mixed declaration lists. It matched the baseline on 5,145 generated and real inline-style observations. It was tested separately from the four-provider build.

| Articles | Package   | Construct ms | Extract ms | Process s | Peak RSS MiB |
| -------- | --------- | ------------ | ---------- | --------- | ------------ |
| 42       | baseline  | 96.07        | 135.61     | 0.35      | 261.69       |
| 42       | candidate | 90.02        | 119.19     | 0.32      | 308.12       |
| 130      | baseline  | 740.41       | 1214.99    | 2.12      | 636.08       |
| 130      | candidate | 766.37       | 1195.08    | 2.10      | 651.83       |

[Application replay](../.cache/specified-style-read-5dcWmF/apps.jsonl) · [CSSOM differential](../.cache/specified-style-read-5dcWmF/parity.json)

## Correction for inherited style updates

| Package                            | 32 inherited updates ms | 512 inherited updates ms | First complex write ms | Peak RSS MiB |
| ---------------------------------- | ----------------------- | ------------------------ | ---------------------- | ------------ |
| Original RunDOM                    | 1.49                    | 14.60                    | —                      | —            |
| Four-provider build in this report | 1.80                    | 20.14                    | 17.07                  | 86.41        |
| Direct private property lookup     | 1.48                    | 14.64                    | 16.96                  | 86.39        |

The correction moves generic lookup to the public named getter on a private lookup miss. Ordinary field writes and property-index updates on the private CSS declaration once again use the regular prototype chain. All 35,088 generic-property observations matched, and both HTML backends reproduced their full extended WPT outcomes. The four-provider tables above apply to the intermediate package identified by the freeze timestamp. [Candidate timings](../.cache/direct-css-lookup-8OrAxL/trials.jsonl) · [Cold and memory checks](../.cache/direct-css-lookup-8OrAxL/cold.jsonl) · [Extended WPT outcomes](../.cache/direct-css-lookup-8OrAxL/extended-wpt.json)
