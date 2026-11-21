# Real-project benchmarks on the November 21 article parser build

Node v24.20.0 on Apple M4 with the TypeScript HTML parser. The run used the same 11 upstream checkouts and test-file hashes as the preceding replay. Each project used its installed jsdom version. Happy DOM was 21.0.4 and TurboDOM was 0.7.1. The RunDOM package was frozen at 2026-11-21T02:35:29.046Z. [Build hashes and versions](../.cache/upstream-articles-DciTxn/cohort.json) · [Upstream sources and jsdom versions](../.cache/upstream-articles-DciTxn/upstream-manifest.json)

RunDOM finished faster than jsdom on **9 of 10** primary selections with identical named outcomes and successful exits. Scully uses a guarded teardown. The broad Svelte selection passed 6,012 and failed 90 with RunDOM.

On 42 articles where all four providers returned the same fields and content trees, constructing the documents took 103 ms with RunDOM and 17 ms with TurboDOM. Article extraction took 142 ms and 81 ms, respectively. The full 130-page input and pairwise output counts are reported below.

This was a serial replay on a shared development machine. The sampled one-minute load average ranged from 2.8 to 28.6. The unchanged jsdom Svelte control took 75.37 seconds in this batch and 33.00 seconds in the preceding batch. Elapsed differences close to the run-to-run spread carry substantial uncertainty. [Timestamped host observations](../.cache/upstream-articles-DciTxn/host.jsonl)

## Upstream results

Times are median end-to-end seconds. Parentheses denote incomplete or unequal work compared with jsdom. Each provider ran in its own process with one test worker. Provider execution order rotated. Each successful provider ran three times when at least two providers completed that selection. A failed screen ran once. Supabase means the UI package, Next.js means its Vitest example, and freeCodeCamp means two client test files. The last four rows overlap the primary selections.

| Selection                             | RunDOM s | jsdom s | Happy DOM s | TurboDOM s | jsdom / RunDOM | Peak RSS difference vs jsdom, MiB |
| ------------------------------------- | -------- | ------- | ----------- | ---------- | -------------- | --------------------------------- |
| Mozilla Readability, 130 pages        | 4.75     | 9.74    | (7.40)      | (3.79)     | 2.05×          | -21                               |
| Material UI, 10 files                 | 17.25    | 23.23   | (55.04)     | (34.07)    | 1.35×          | +94                               |
| Ant Design, 8 files                   | 6.18     | 7.31    | (6.87)      | (5.44)     | 1.18×          | -9                                |
| Vue runtime-dom                       | 3.05     | 8.24    | (4.29)      | (2.65)     | 2.70×          | -119                              |
| Svelte runes, legacy and motion       | (137.21) | 75.37   | (52.12)     | (6.36)     | incomplete     | —                                 |
| React DOM, 2 files                    | 5.81     | 5.37    | (6.62)      | (6.36)     | 0.92×          | -21                               |
| Drone UI, 1 file                      | 3.89     | 4.37    | 3.99        | (5.13)     | 1.12×          | -16                               |
| Scully, 3 files (teardown guard¹)     | 1.19     | 1.53    | (1.01)      | 1.19       | 1.29×          | +13                               |
| Supabase UI                           | 4.23     | 9.40    | (4.82)      | (4.68)     | 2.22×          | -113                              |
| Next.js Vitest example                | 1.11     | 1.71    | 1.38        | 0.91       | 1.54×          | -7                                |
| freeCodeCamp, 2 files                 | 0.99     | 1.34    | 1.29        | 1.05       | 1.35×          | -21                               |
| Material UI, original 5 files         | 7.65     | 10.03   | (8.99)      | (4.94)     | 1.31×          | -25                               |
| Svelte runes, first shard             | 5.56     | 6.00    | (5.47)      | (0.82)     | 1.08×          | +25                               |
| Svelte motion                         | 0.85     | 1.02    | 0.94        | (0.66)     | 1.20×          | 0                                 |
| Scully globals only (teardown guard¹) | 0.92     | 1.31    | (0.95)      | 0.89       | 1.42×          | +6                                |

## Compatibility

All 60 provider and selection combinations reproduced the preceding replay’s exact named outcomes, failure counts and exit status. [Comparison against the preceding replay](../.cache/upstream-articles-DciTxn/broad-outcome-changes.json)

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

Scully’s original Jest 27 teardown redefines Window.document. The timed rows guard the same call for RunDOM and jsdom. The fresh unguarded runs produced RunDOM 0 / 0 / 0 + 3 files, jsdom 8 / 0 / 0. [Jest reports and provider traces](../.cache/upstream-articles-DciTxn/jest-providers/)

The broad Svelte run reproduced the preceding replay’s exact test outcomes. In the earlier browser diagnostic, the 90 failing DOM and hydration variants also failed in Google Chrome for Testing 156.0.8078.4, and 86 had identical failure details to RunDOM. Stock jsdom passed all 90 in that diagnostic. The browser evidence comes from the earlier run. [Browser comparison](../.cache/upstream-goal-1BQdRb/svelte-browser-summary.json)

## Timing and memory on identical work

Cells show process seconds / test seconds / peak RSS MiB. Filtered comparisons require the exact multiset of named passing tests in each of three trials. Readability uses complete pages. The dash means that provider failed qualification. Peak RSS is the operating system’s process high-water measurement for the command. It does not sum concurrent workers.

| Selection                             | Cases | RunDOM            | jsdom             | Happy DOM         | TurboDOM          |
| ------------------------------------- | ----- | ----------------- | ----------------- | ----------------- | ----------------- |
| Vue runtime-dom                       | 159   | 2.00 / 0.21 / 334 | 4.98 / 0.19 / 473 | 2.81 / 0.15 / 330 | 1.79 / 0.15 / 272 |
| Ant Design, 8 files                   | 116   | 4.97 / 1.02 / 596 | 6.84 / 1.27 / 609 | 5.59 / 0.95 / 589 | 5.06 / 0.89 / 564 |
| Material UI Button and TextField      | 118   | 2.08 / 0.57 / 308 | 2.86 / 0.74 / 309 | 2.13 / 0.45 / 309 | 1.84 / 0.35 / 310 |
| Material UI common subset             | 161   | 2.62 / 0.83 / 308 | 3.50 / 1.05 / 317 | 2.66 / 0.67 / 313 | —                 |
| Supabase UI                           | 80    | 4.09 / 0.80 / 197 | 7.89 / 1.52 / 309 | 4.73 / 0.50 / 177 | 3.69 / 0.53 / 157 |
| Svelte runes, first shard             | 561   | 5.40 / 4.37 / 367 | 5.75 / 4.53 / 341 | 5.46 / 4.32 / 366 | —                 |
| React DOM, 2 files                    | 61    | 4.37 / 3.35 / 835 | 4.55 / 3.35 / 887 | 4.47 / 3.35 / 835 | 4.34 / 3.33 / 913 |
| Mozilla Readability, 44 shared pages  | 281   | 0.69 / 0.55 / 436 | 1.22 / 0.99 / 496 | 0.77 / 0.55 / 460 | 0.45 / 0.31 / 301 |
| Next.js Vitest example                | 5     | 1.11 / 0.06 / 146 | 1.71 / 0.12 / 153 | 1.38 / 0.04 / 123 | 0.91 / 0.04 / 116 |
| freeCodeCamp, 2 files                 | 4     | 0.99 / 0.06 / 164 | 1.34 / 0.08 / 185 | 1.29 / 0.04 / 177 | 1.05 / 0.03 / 165 |
| Svelte motion                         | 8     | 0.85 / 0.00 / 186 | 1.02 / 0.00 / 186 | 0.94 / 0.00 / 186 | —                 |
| Drone UI, 1 file                      | 1     | 3.89 / 0.69 / 628 | 4.37 / 0.76 / 645 | 3.99 / 0.71 / 649 | —                 |
| Scully globals only (teardown guard¹) | 5     | 0.92 / 0.00 / 435 | 1.31 / 0.00 / 430 | —                 | 0.89 / 0.00 / 404 |

| Four-way selection                         | Lowest elapsed median | RunDOM above lowest, ms | RunDOM peak minus lowest-time provider, MiB |
| ------------------------------------------ | --------------------- | ----------------------- | ------------------------------------------- |
| Vue runtime-dom (159)                      | TurboDOM              | 210                     | +62                                         |
| Ant Design, 8 files (116)                  | RunDOM                | 0                       | 0                                           |
| Material UI Button and TextField (118)     | TurboDOM              | 240                     | -2                                          |
| Supabase UI (80)                           | TurboDOM              | 400                     | +40                                         |
| React DOM, 2 files (61)                    | TurboDOM              | 30                      | -78                                         |
| Mozilla Readability, 44 shared pages (281) | TurboDOM              | 240                     | +135                                        |
| Next.js Vitest example (5)                 | TurboDOM              | 200                     | +31                                         |
| freeCodeCamp, 2 files (4)                  | RunDOM                | 0                       | 0                                           |

Each pair below uses matching repetition numbers from the rotated runs. The process clock reports hundredths of a second. On short workloads, margins of that size can change with the run order.

| Selection                                  | RunDOM minus TurboDOM per round, ms | RunDOM faster | Ties | TurboDOM faster |
| ------------------------------------------ | ----------------------------------- | ------------- | ---- | --------------- |
| Vue runtime-dom (159)                      | +220 / +210 / +210                  | 0             | 0    | 3               |
| Ant Design, 8 files (116)                  | +460 / -110 / +570                  | 1             | 0    | 2               |
| Material UI Button and TextField (118)     | +240 / +340 / +210                  | 0             | 0    | 3               |
| Supabase UI (80)                           | +420 / +400 / +400                  | 0             | 0    | 3               |
| React DOM, 2 files (61)                    | +50 / -20 / +40                     | 1             | 0    | 2               |
| Mozilla Readability, 44 shared pages (281) | +240 / +250 / +220                  | 0             | 0    | 3               |
| Next.js Vitest example (5)                 | +230 / +60 / -350                   | 1             | 0    | 2               |
| freeCodeCamp, 2 files (4)                  | +40 / -280 / +840                   | 1             | 0    | 2               |

RunDOM recorded the lower median on Ant Design and freeCodeCamp. TurboDOM still finished first in two of the three paired rounds on each. Vue, Material UI Button and TextField, Supabase UI and Readability consistently favored TurboDOM across all three rounds.

## Where RunDOM still loses on identical work

A positive delta means RunDOM took longer or used more peak memory than the named provider. These comparisons use the shared four-provider selections when all three rounds qualify. Each selection is listed once per comparison provider. The full upstream pass counts above give the coverage context.

| Selection                                  | Comparison | Process delta ms | Test delta ms | Peak RSS delta MiB |
| ------------------------------------------ | ---------- | ---------------- | ------------- | ------------------ |
| Vue runtime-dom (159)                      | jsdom      | -2980            | +19           | -140               |
| Vue runtime-dom (159)                      | Happy DOM  | -810             | +65           | +4                 |
| Vue runtime-dom (159)                      | TurboDOM   | +210             | +65           | +62                |
| Ant Design, 8 files (116)                  | jsdom      | -1870            | -254          | -13                |
| Ant Design, 8 files (116)                  | Happy DOM  | -620             | +66           | +7                 |
| Ant Design, 8 files (116)                  | TurboDOM   | -90              | +134          | +33                |
| Material UI Button and TextField (118)     | jsdom      | -780             | -174          | -1                 |
| Material UI Button and TextField (118)     | Happy DOM  | -50              | +118          | 0                  |
| Material UI Button and TextField (118)     | TurboDOM   | +240             | +214          | -2                 |
| Supabase UI (80)                           | jsdom      | -3800            | -717          | -112               |
| Supabase UI (80)                           | Happy DOM  | -640             | +302          | +20                |
| Supabase UI (80)                           | TurboDOM   | +400             | +276          | +40                |
| React DOM, 2 files (61)                    | jsdom      | -180             | -1            | -52                |
| React DOM, 2 files (61)                    | Happy DOM  | -100             | +2            | 0                  |
| React DOM, 2 files (61)                    | TurboDOM   | +30              | +18           | -78                |
| Mozilla Readability, 44 shared pages (281) | jsdom      | -530             | -448          | -61                |
| Mozilla Readability, 44 shared pages (281) | Happy DOM  | -80              | -7            | -24                |
| Mozilla Readability, 44 shared pages (281) | TurboDOM   | +240             | +233          | +135               |
| Next.js Vitest example (5)                 | jsdom      | -600             | -53           | -7                 |
| Next.js Vitest example (5)                 | Happy DOM  | -270             | +19           | +23                |
| Next.js Vitest example (5)                 | TurboDOM   | +200             | +28           | +31                |
| freeCodeCamp, 2 files (4)                  | jsdom      | -350             | -20           | -21                |
| freeCodeCamp, 2 files (4)                  | Happy DOM  | -300             | +18           | -14                |
| freeCodeCamp, 2 files (4)                  | TurboDOM   | -60              | +24           | -2                 |

## Broad runner phases and CPU

The first table reports median end-to-end seconds, test seconds and peak RSS MiB for every attempt, including partial executions. Test time is the sum of named test durations for Vitest and Jest, and suite duration for Mocha. The second table gives total user and system CPU seconds. Vitest stage measurements come from the trial nearest each provider’s elapsed median. Jest and Mocha do not emit the same stage breakdown.

| Selection                             | RunDOM               | jsdom               | Happy DOM           | TurboDOM            |
| ------------------------------------- | -------------------- | ------------------- | ------------------- | ------------------- |
| Mozilla Readability, 130 pages        | 4.75 / 4.52 / 1194   | 9.74 / 9.30 / 1214  | 7.40 / 6.90 / 1705  | 3.79 / 3.30 / 465   |
| Material UI, 10 files                 | 17.25 / 13.13 / 582  | 23.23 / 16.60 / 488 | 55.04 / 40.19 / 610 | 34.07 / 25.24 / 433 |
| Ant Design, 8 files                   | 6.18 / 1.41 / 598    | 7.31 / 1.29 / 607   | 6.87 / 1.20 / 592   | 5.44 / 1.02 / 583   |
| Vue runtime-dom                       | 3.05 / 0.45 / 395    | 8.24 / 0.50 / 514   | 4.29 / 0.30 / 389   | 2.65 / 0.20 / 342   |
| Svelte runes, legacy and motion       | 137.21 / 90.99 / 503 | 75.37 / 47.93 / 474 | 52.12 / 37.01 / 486 | 6.36 / 0.00 / 430   |
| React DOM, 2 files                    | 5.81 / 4.08 / 828    | 5.37 / 4.01 / 850   | 6.62 / 5.26 / 820   | 6.36 / 4.84 / 795   |
| Drone UI, 1 file                      | 3.89 / 0.69 / 628    | 4.37 / 0.76 / 645   | 3.99 / 0.71 / 649   | 5.13 / 0.04 / 602   |
| Scully, 3 files (teardown guard¹)     | 1.19 / 0.00 / 479    | 1.53 / 0.00 / 467   | 1.01 / 0.00 / 414   | 1.19 / 0.00 / 476   |
| Supabase UI                           | 4.23 / 0.92 / 197    | 9.40 / 2.02 / 309   | 4.82 / 0.60 / 177   | 4.68 / 1.57 / 157   |
| Next.js Vitest example                | 1.11 / 0.06 / 146    | 1.71 / 0.12 / 153   | 1.38 / 0.04 / 123   | 0.91 / 0.04 / 116   |
| freeCodeCamp, 2 files                 | 0.99 / 0.06 / 164    | 1.34 / 0.08 / 185   | 1.29 / 0.04 / 177   | 1.05 / 0.03 / 165   |
| Material UI, original 5 files         | 7.65 / 5.41 / 331    | 10.03 / 6.37 / 356  | 8.99 / 6.37 / 482   | 4.94 / 0.97 / 401   |
| Svelte runes, first shard             | 5.56 / 4.48 / 366    | 6.00 / 4.66 / 341   | 5.47 / 4.33 / 367   | 0.82 / 0.00 / 188   |
| Svelte motion                         | 0.85 / 0.00 / 186    | 1.02 / 0.00 / 186   | 0.94 / 0.00 / 186   | 0.66 / 0.00 / 179   |
| Scully globals only (teardown guard¹) | 0.92 / 0.00 / 435    | 1.31 / 0.00 / 430   | 0.95 / 0.00 / 397   | 0.89 / 0.00 / 404   |

| Selection                             | RunDOM CPU s | jsdom CPU s | Happy DOM CPU s | TurboDOM CPU s |
| ------------------------------------- | ------------ | ----------- | --------------- | -------------- |
| Mozilla Readability, 130 pages        | 6.88         | 12.77       | 9.91            | 4.20           |
| Material UI, 10 files                 | 17.84        | 24.95       | 49.22           | 33.98          |
| Ant Design, 8 files                   | 9.75         | 10.04       | 9.77            | 8.49           |
| Vue runtime-dom                       | 3.97         | 10.58       | 5.48            | 3.43           |
| Svelte runes, legacy and motion       | 101.77       | 62.64       | 54.36           | 8.01           |
| React DOM, 2 files                    | 7.21         | 7.24        | 8.62            | 8.44           |
| Drone UI, 1 file                      | 5.15         | 5.63        | 5.19            | 7.08           |
| Scully, 3 files (teardown guard¹)     | 1.88         | 1.92        | 1.56            | 1.80           |
| Supabase UI                           | 5.60         | 12.06       | 6.00            | 4.90           |
| Next.js Vitest example                | 1.25         | 1.94        | 1.56            | 1.11           |
| freeCodeCamp, 2 files                 | 1.39         | 1.66        | 1.57            | 1.34           |
| Material UI, original 5 files         | 7.43         | 10.19       | 7.72            | 6.40           |
| Svelte runes, first shard             | 4.02         | 4.47        | 3.87            | 1.09           |
| Svelte motion                         | 1.15         | 1.26        | 1.18            | 0.90           |
| Scully globals only (teardown guard¹) | 1.44         | 1.58        | 1.18            | 1.37           |

| Selection                       | Provider  | Vitest stages                                                                                   |
| ------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| Material UI, 10 files           | RunDOM    | 16.60s (tests 82%, import 7%, transform 6%, setup 3%, environment 2%)                           |
| Material UI, 10 files           | jsdom     | 22.70s (tests 75%, environment 13%, import 5%, transform 4%, setup 2%)                          |
| Material UI, 10 files           | Happy DOM | 53.34s (tests 77%, transform 11%, import 5%, environment 4%, setup 2%)                          |
| Material UI, 10 files           | TurboDOM  | 33.22s (tests 88%, import 5%, transform 5%, setup 2%)                                           |
| Ant Design, 8 files             | RunDOM    | 6.03s (transform 45%, tests 25%, setup 19%, import 6%, environment 4%)                          |
| Ant Design, 8 files             | jsdom     | 6.97s (transform 36%, environment 25%, tests 20%, setup 14%, import 6%)                         |
| Ant Design, 8 files             | Happy DOM | 6.62s (transform 44%, tests 19%, setup 15%, environment 14%, import 7%)                         |
| Ant Design, 8 files             | TurboDOM  | 5.26s (transform 53%, tests 22%, setup 17%, import 8%)                                          |
| Vue runtime-dom                 | RunDOM    | 2.86s (transform 348ms, setup 39ms, import 1.01s, tests 465ms, environment 474ms)               |
| Vue runtime-dom                 | jsdom     | 8.00s (transform 487ms, setup 89ms, import 1.21s, tests 515ms, environment 5.25s)               |
| Vue runtime-dom                 | Happy DOM | 4.07s (transform 352ms, setup 41ms, import 1.02s, tests 315ms, environment 1.81s)               |
| Vue runtime-dom                 | TurboDOM  | 2.37s (transform 299ms, setup 44ms, import 738ms, tests 212ms, environment 30ms)                |
| Svelte runes, legacy and motion | RunDOM    | 135.73s (transform 61.57s, setup 0ms, import 41.91s, tests 91.17s, environment 722ms)           |
| Svelte runes, legacy and motion | jsdom     | 73.92s (transform 28.88s, setup 0ms, import 21.76s, tests 48.02s, environment 2.97s)            |
| Svelte runes, legacy and motion | Happy DOM | 51.31s (transform 15.79s, setup 0ms, import 11.46s, tests 37.08s, environment 1.81s)            |
| Svelte runes, legacy and motion | TurboDOM  | 6.00s (transform 3.39s, setup 0ms, import 0ms, tests 0ms, environment 24ms)                     |
| Supabase UI                     | RunDOM    | 4.09s (import 29%, tests 28%, setup 28%, environment 12%, transform 3%, worker 1%)              |
| Supabase UI                     | jsdom     | 9.14s (environment 46%, tests 25%, import 15%, setup 12%, transform 2%)                         |
| Supabase UI                     | Happy DOM | 4.68s (environment 36%, import 23%, setup 22%, tests 15%, transform 3%, worker 1%)              |
| Supabase UI                     | TurboDOM  | 4.55s (tests 45%, import 26%, setup 24%, transform 4%, environment 1%, worker 1%)               |
| Next.js Vitest example          | RunDOM    | 885ms (transform 57ms, setup 0ms, collect 229ms, tests 73ms, environment 98ms, prepare 126ms)   |
| Next.js Vitest example          | jsdom     | 1.50s (transform 43ms, setup 0ms, collect 182ms, tests 118ms, environment 770ms, prepare 103ms) |
| Next.js Vitest example          | Happy DOM | 1.13s (transform 53ms, setup 0ms, collect 243ms, tests 46ms, environment 406ms, prepare 109ms)  |
| Next.js Vitest example          | TurboDOM  | 699ms (transform 44ms, setup 0ms, collect 193ms, tests 38ms, environment 8ms, prepare 106ms)    |
| freeCodeCamp, 2 files           | RunDOM    | 790ms (transform 172ms, setup 165ms, import 402ms, tests 56ms, environment 48ms)                |
| freeCodeCamp, 2 files           | jsdom     | 1.14s (transform 170ms, setup 155ms, import 390ms, tests 76ms, environment 403ms)               |
| freeCodeCamp, 2 files           | Happy DOM | 1.03s (transform 191ms, setup 194ms, import 433ms, tests 44ms, environment 218ms)               |
| freeCodeCamp, 2 files           | TurboDOM  | 810ms (transform 190ms, setup 183ms, import 419ms, tests 37ms, environment 4ms)                 |
| Material UI, original 5 files   | RunDOM    | 7.26s (tests 77%, transform 10%, import 8%, setup 3%, environment 2%)                           |
| Material UI, original 5 files   | jsdom     | 9.59s (tests 68%, environment 15%, transform 8%, import 6%, setup 3%)                           |
| Material UI, original 5 files   | Happy DOM | 8.62s (tests 77%, transform 8%, environment 7%, import 6%, setup 3%)                            |
| Material UI, original 5 files   | TurboDOM  | 4.38s (tests 38%, transform 28%, import 22%, setup 12%)                                         |
| Svelte runes, first shard       | RunDOM    | 5.35s (transform 1.11s, setup 0ms, import 779ms, tests 4.48s, environment 28ms)                 |
| Svelte runes, first shard       | jsdom     | 5.77s (transform 1.08s, setup 0ms, import 801ms, tests 4.67s, environment 233ms)                |
| Svelte runes, first shard       | Happy DOM | 5.27s (transform 1.04s, setup 0ms, import 725ms, tests 4.34s, environment 141ms)                |
| Svelte runes, first shard       | TurboDOM  | 620ms (transform 367ms, setup 0ms, import 0ms, tests 0ms, environment 5ms)                      |
| Svelte motion                   | RunDOM    | 649ms (transform 383ms, setup 0ms, import 565ms, tests 2ms, environment 24ms)                   |
| Svelte motion                   | jsdom     | 806ms (transform 371ms, setup 0ms, import 541ms, tests 2ms, environment 203ms)                  |
| Svelte motion                   | Happy DOM | 735ms (transform 373ms, setup 0ms, import 543ms, tests 2ms, environment 130ms)                  |
| Svelte motion                   | TurboDOM  | 455ms (transform 252ms, setup 0ms, import 0ms, tests 0ms, environment 2ms)                      |

Per-run peak RSS shows how much the high-water mark varies between fresh processes. Each pair of columns covers all three runs, in execution-round order.

| Selection                      | RunDOM peaks MiB  | jsdom peaks MiB    |
| ------------------------------ | ----------------- | ------------------ |
| Mozilla Readability, 130 pages | 742 / 1194 / 1217 | 1197 / 1434 / 1214 |
| Material UI, 10 files          | 600 / 560 / 582   | 472 / 488 / 560    |
| Ant Design, 8 files            | 597 / 598 / 598   | 598 / 607 / 627    |
| Vue runtime-dom                | 394 / 397 / 395   | 515 / 514 / 511    |
| React DOM, 2 files             | 846 / 828 / 773   | 847 / 850 / 890    |

## Change from the preceding replay

Ranges cover all three latest runs. The jsdom control change shows movement between batches with unchanged reference software. A small difference between batches is weak evidence for an implementation effect. [Trial summary and report filenames](../.cache/upstream-articles-DciTxn/summary.json)

| Selection                             | Previous RunDOM s | Latest RunDOM s | Latest RunDOM range s | Latest jsdom range s | jsdom control change |
| ------------------------------------- | ----------------- | --------------- | --------------------- | -------------------- | -------------------- |
| Mozilla Readability, 130 pages        | 4.38              | 4.75            | 4.51–5.09             | 9.39–14.59           | +3.4%                |
| Material UI, 10 files                 | 16.34             | 17.25           | 16.58–19.81           | 22.09–25.26          | +7.4%                |
| Ant Design, 8 files                   | 4.99              | 6.18            | 6.05–7.04             | 6.95–8.66            | +10.8%               |
| Vue runtime-dom                       | 2.59              | 3.05            | 2.63–4.64             | 6.44–12.16           | +31.2%               |
| React DOM, 2 files                    | 4.30              | 5.81            | 4.37–9.89             | 5.08–7.56            | +8.5%                |
| Drone UI, 1 file                      | 3.50              | 3.89            | 3.59–4.44             | 4.30–5.03            | +2.8%                |
| Scully, 3 files (teardown guard¹)     | 1.06              | 1.19            | 1.07–1.57             | 1.31–1.58            | +22.4%               |
| Supabase UI                           | 3.96              | 4.23            | 4.14–4.73             | 7.72–9.66            | +21.3%               |
| Next.js Vitest example                | 0.96              | 1.11            | 0.97–1.14             | 1.68–1.73            | +3.6%                |
| freeCodeCamp, 2 files                 | 0.98              | 0.99            | 0.98–1.89             | 1.31–2.69            | +2.3%                |
| Material UI, original 5 files         | 7.58              | 7.65            | 7.65–8.15             | 9.73–10.09           | +2.2%                |
| Svelte runes, first shard             | 5.82              | 5.56            | 5.38–5.67             | 5.89–6.41            | -3.4%                |
| Svelte motion                         | 0.83              | 0.85            | 0.84–0.89             | 1.01–1.04            | +8.5%                |
| Scully globals only (teardown guard¹) | 0.90              | 0.92            | 0.91–1.38             | 1.12–1.38            | +19.1%               |

## Readability application

This benchmark opens, extracts and closes 130 documents and hashes the articles. Heap values are sampled after forced GC at the end of the synchronous batch and after an event-loop turn. All four providers attempted three full replays.

| Provider  | Complete trials | Construct s | Extract s | Close ms | Process s | Peak MiB | Same-turn heap MiB | Next-turn heap MiB |
| --------- | --------------- | ----------- | --------- | -------- | --------- | -------- | ------------------ | ------------------ |
| RunDOM    | 3               | 0.78        | 1.29      | 1.22     | 2.24      | 642      | 57.41              | 36.88              |
| jsdom     | 3               | 3.16        | 2.38      | 36.13    | 5.94      | 1308     | 717.57             | 167.74             |
| Happy DOM | 0               | —           | —         | —        | —         | —        | —                  | —                  |
| TurboDOM  | 0               | —           | —         | —        | —         | —        | —                  | —                  |

RunDOM and jsdom differed on 5 serialized articles. Independent parsing found 0 differences in the resulting trees. [Per-article differences](../.cache/upstream-articles-DciTxn/output-equivalence.json) · [Application exit codes and matched test identities](../.cache/upstream-articles-DciTxn/matches.jsonl)

## React and Testing Library supplemental workloads

Each eligible cell summarizes nine fresh Vitest processes exercising the same React and Testing Library fixture. Cells give process seconds / test seconds / worker RSS MiB. RSS here is sampled at suite end. These fixtures supplement upstream React’s two Jest files.

| Fixture      | Worker pool | RunDOM            | jsdom             | Happy DOM         | TurboDOM   |
| ------------ | ----------- | ----------------- | ----------------- | ----------------- | ---------- |
| 8 workflows  | forks       | 0.40 / 0.12 / 140 | 0.61 / 0.14 / 215 | 0.43 / 0.10 / 122 | incomplete |
| 8 workflows  | threads     | 0.38 / 0.12 / 194 | 0.59 / 0.14 / 241 | 0.42 / 0.10 / 180 | incomplete |
| 8 workflows  | vmForks     | 0.44 / 0.14 / 150 | 0.62 / 0.15 / 204 | 0.45 / 0.10 / 138 | incomplete |
| 8 workflows  | vmThreads   | 0.43 / 0.14 / 202 | 0.60 / 0.15 / 254 | 0.44 / 0.10 / 189 | incomplete |
| 10 workflows | forks       | 0.81 / 0.42 / 261 | 1.38 / 0.59 / 332 | incomplete        | incomplete |
| 10 workflows | threads     | 0.78 / 0.41 / 293 | 1.37 / 0.63 / 382 | incomplete        | incomplete |
| 10 workflows | vmForks     | 0.76 / 0.41 / 299 | 1.10 / 0.58 / 345 | incomplete        | incomplete |
| 10 workflows | vmThreads   | 0.74 / 0.41 / 369 | 1.08 / 0.58 / 394 | incomplete        | incomplete |

[Eight-workflow trials and failures](../.cache/upstream-articles-DciTxn/react-standard.json) · [Ten-workflow trials and failures](../.cache/upstream-articles-DciTxn/react-integration.json)

## Which tests dominate

The longest component files below are ranked by summed upstream test duration on RunDOM. Each value is the median of three complete runs. The React row measures the case that previously formatted an internal CSS parser error stack.

| Project     | File or case                                                | RunDOM ms | jsdom ms | Difference ms |
| ----------- | ----------------------------------------------------------- | --------- | -------- | ------------- |
| Material UI | packages/mui-material/src/Autocomplete/Autocomplete.test.js | 4995      | 7165     | -2170         |
| Material UI | packages/mui-material/src/Select/Select.test.js             | 4290      | 4840     | -549          |
| Material UI | packages/mui-material/src/Tabs/Tabs.test.js                 | 1129      | 1380     | -251          |
| Material UI | packages/mui-material/src/Tooltip/Tooltip.test.js           | 928       | 1069     | -141          |
| Material UI | packages/mui-material/src/TextField/TextField.test.js       | 406       | 543      | -137          |
| Ant Design  | components/radio/**tests**/group.test.tsx                   | 312       | 277      | 35            |
| Ant Design  | components/alert/**tests**/index.test.tsx                   | 306       | 239      | 66            |
| Ant Design  | components/checkbox/**tests**/group.test.tsx                | 292       | 240      | 52            |
| Ant Design  | components/radio/**tests**/radio.test.tsx                   | 197       | 180      | 17            |
| Ant Design  | components/checkbox/**tests**/checkbox.test.tsx             | 103       | 132      | -28           |
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
| RunDOM    | 102.97       | 141.58     | 0.38     | 0.36         | 273.66       | 26.71              |
| jsdom     | 238.55       | 247.83     | 3.74     | 0.67         | 362.28       | 37.76              |
| Happy DOM | 102.52       | 141.34     | 0.04     | 0.43         | 343.03       | 58.08              |
| TurboDOM  | 16.62        | 80.98      | 0.02     | 0.19         | 244.39       | 14.36              |

[Comparable stages and selected article identities](../.cache/upstream-articles-DciTxn/shared-articles/metrics.json) · [All 520 page outcomes and raw process logs](../.cache/upstream-articles-DciTxn/shared-articles/)

## HTML parser change on the same articles

Seven alternating fresh-process pairs per workload used the same public package and the same page order. The article output hash was identical across all fourteen trials in each workload. The change consumes ordinary runs of text, quoted attribute values and comments in a single step inside the pinned parse5 tokenizer. Special characters, newlines, character references and surrogate pairs still go through parse5.

| Pages | RunDOM package | Construct ms | Extract ms | Process s | Peak RSS MiB | Heap after one turn and GC, MiB |
| ----- | -------------- | ------------ | ---------- | --------- | ------------ | ------------------------------- |
| 130   | Previous build | 869.4        | 1253.5     | 2.314     | 676.5        | 47.7                            |
| 130   | Measured build | 770.2        | 1276.6     | 2.237     | 642.5        | 37.0                            |
| 42    | Previous build | 110.8        | 135.1      | 0.366     | 274.4        | 26.8                            |
| 42    | Measured build | 102.8        | 140.5      | 0.362     | 273.6        | 26.8                            |

[Individual before/after measurements](../.cache/real-construction-BzgNSU/paired.jsonl) · [11,512 tree comparisons with unmodified parse5](../.cache/real-construction-BzgNSU/differential.json)

Three separately instrumented construction runs on the previous package split the cost before the parser change. Stylesheet application is contained in stylesheet collection. Parsed frames may construct child windows, so the columns can overlap.

| Pages | Construct ms | HTML parse ms | Build Window ms | Collect sheets ms | Apply sheets ms | Scan parsed frames ms |
| ----- | ------------ | ------------- | --------------- | ----------------- | --------------- | --------------------- |
| 130   | 859.7        | 472.1         | 83.0            | 214.9             | 204.6           | 48.1                  |
| 42    | 98.9         | 33.8          | 22.6            | 32.6              | 27.5            | 1.2                   |

A separate CSS loader trial reduced first sheet attachment from 22.8 to 15.7 ms. First computed color after attaching the sheet rose from 26.3 to 31.8 ms. The 42-page median peak rose from 275 to 320 MiB. The measured build keeps the previous CSS loader. [Seven pairs per CSS workload](../.cache/real-construction-BzgNSU/css-pairs.jsonl)

## Synthetic controls and compatibility

The order-rotated control ran 165 verified trials in fresh processes on a shared host. Each measured cell is the median per eight-operation batch over eleven processes. Source, dimensions and operation checks were identical across builds. [Comparison directory and trial count](../.cache/real-construction-BzgNSU/controlled-lab.json)

| Scenario             | Previous RunDOM ms | Measured RunDOM ms | jsdom ms | Happy DOM ms | TurboDOM ms |
| -------------------- | ------------------ | ------------------ | -------- | ------------ | ----------- |
| parse-html-unique    | 15.58              | 20.18              | 84.46    | 109.31       | 14.51       |
| parse-html-traverse  | 8.24               | 8.49               | 93.19    | 117.79       | 1.75        |
| windows-create-close | 4.28               | 4.34               | 13.99    | 14.19        | 0.08        |

Unique dense markup cost 29.5% more time per batch with the article parser. It was slower in 10 of 11 rounds. This limits the case for enabling this implementation by default despite its improvement on full article construction.

The project check passed all 15 tasks. The packed jsdom API suite passed 634 tests with each parser. Each parser preserved all 608 named assertion and harness outcomes in the focused WPT selection, including its existing failure labels. [Project gate](../.cache/real-construction-BzgNSU/check.log) · [Focused WPT results](../.cache/real-construction-BzgNSU/wpt-identity.json)

## CPU profiles on identical component tests

A separate diagnostic captured one profile per file and provider after Vitest set up the environment. Every provider passed the same named cases. Active sample counts exclude idle, program and inspector dispatch samples. Engine self counts samples executing a provider or listed DOM dependency. The computed-style and query columns count identifiable stacks and can overlap. Zero means the profiler recorded no recognized stack.

| Project | File              | Provider  | Active samples | Engine self | GC self | Computed style | Style in role or focus | DOM queries |
| ------- | ----------------- | --------- | -------------- | ----------- | ------- | -------------- | ---------------------- | ----------- |
| antd    | group.test.tsx    | happy-dom | 998            | 11.8%       | 4.6%    | 7.9%           | 7.8%                   | 0.4%        |
| antd    | group.test.tsx    | jsdom     | 1167           | 20.0%       | 3.0%    | 3.7%           | 2.1%                   | 1.4%        |
| antd    | group.test.tsx    | rundom    | 1251           | 11.5%       | 3.1%    | 4.5%           | 4.3%                   | 0.3%        |
| antd    | group.test.tsx    | turbo-dom | 952            | 7.4%        | 3.8%    | 4.7%           | 4.7%                   | 0.8%        |
| mui     | Button.test.js    | happy-dom | 576            | 18.2%       | 2.8%    | 6.8%           | 6.8%                   | 1.0%        |
| mui     | TextField.test.js | happy-dom | 694            | 16.1%       | 3.3%    | 2.4%           | 2.0%                   | 0.7%        |
| mui     | Button.test.js    | jsdom     | 869            | 38.2%       | 2.5%    | 12.1%          | 11.7%                  | 3.8%        |
| mui     | TextField.test.js | jsdom     | 988            | 34.8%       | 2.1%    | 7.1%           | 6.7%                   | 2.3%        |
| mui     | Button.test.js    | rundom    | 796            | 28.1%       | 3.3%    | 19.0%          | 18.6%                  | 3.0%        |
| mui     | TextField.test.js | rundom    | 789            | 21.9%       | 3.9%    | 12.0%          | 11.4%                  | 2.7%        |
| mui     | Button.test.js    | turbo-dom | 512            | 11.3%       | 2.5%    | 4.1%           | 3.9%                   | 1.2%        |
| mui     | TextField.test.js | turbo-dom | 600            | 8.2%        | 3.5%    | 2.8%           | 2.3%                   | 1.2%        |

In the matched Material UI Button worker, computed style beneath role or focus calls accounted for 18.6% of active samples in RunDOM, 11.7% in jsdom and 3.9% in TurboDOM. The corresponding TextField samples were 11.4%, 6.7% and 2.3%. In Ant Design Radio Group, the RunDOM share was 4.3%. The profiles concentrate this opportunity in Material UI, while the article timings independently identify HTML construction as the larger application-level gap.

[Per-file self and stack counts with hot functions](../.cache/upstream-articles-DciTxn/cpu/attribution.json) · [Profiles, test identities and resolution traces](../.cache/upstream-articles-DciTxn/cpu/)

## Material UI worker memory after teardown

One instrumented run per provider covered all 1,087 active tests. Each fork recorded its process high-water mark before teardown and live JavaScript heap after disposal and two garbage-collection turns. Each worker includes its test runner, dependencies and application.

| Worker       | RunDOM peak MiB | jsdom peak MiB | RunDOM retained heap MiB | jsdom retained heap MiB |
| ------------ | --------------- | -------------- | ------------------------ | ----------------------- |
| Autocomplete | 577.7           | 527.3          | 91.0                     | 110.9                   |
| Select       | 327.6           | 360.7          | 70.4                     | 89.4                    |
| Tabs         | 315.5           | 319.4          | 60.1                     | 79.7                    |
| TextField    | 284.6           | 320.0          | 59.3                     | 79.1                    |
| Tooltip      | 277.7           | 297.0          | 53.8                     | 73.7                    |
| Menu         | 233.5           | 289.7          | 55.1                     | 73.9                    |
| Popover      | 228.0           | 284.3          | 56.2                     | 76.0                    |
| Drawer       | 219.5           | 278.7          | 51.8                     | 71.6                    |
| Dialog       | 213.6           | 280.3          | 52.1                     | 71.5                    |
| MenuList     | 188.2           | 287.0          | 51.1                     | 71.0                    |

Autocomplete produced the largest peak in each diagnostic run. Its peak was 578 MiB for RunDOM and 527 MiB for jsdom. At the end of the file, before forced collection, V8 had 440 versus 416 MiB of heap capacity, of which 167 versus 297 MiB was used. This localizes the excess to peak memory during that workload. The sampled live heap after disposal is lower for RunDOM in every worker.

[Heap checkpoints and test reports](../.cache/upstream-articles-DciTxn/mui-workers/)

## Svelte host-load control

The same packaged providers repeated the broad Svelte selection in two reversed-order pairs. Each trial reproduced its own provider’s named results. RunDOM and jsdom still have different pass sets, so the rows describe absolute runtime only.

| Provider | Passed | Failed | Broad screen s | Repeat 1 s | Repeat 2 s | Repeat 1 CPU s | Repeat 2 CPU s |
| -------- | ------ | ------ | -------------- | ---------- | ---------- | -------------- | -------------- |
| rundom   | 6012   | 90     | 137.21         | 30.73      | 29.85      | 31.90          | 31.82          |
| jsdom    | 6102   | 0      | 75.37          | 33.15      | 34.74      | 35.69          | 37.39          |

[Named results, clocks and resolution traces](../.cache/upstream-articles-DciTxn/svelte-control/)

The additional upstream HTML syntax selection exercised 37 files and 2700 assertion and harness outcomes with the TypeScript parser. 0 outcomes changed against the previous package. [Parser-specific WPT comparison](../.cache/real-construction-BzgNSU/syntax-wpt.json)
