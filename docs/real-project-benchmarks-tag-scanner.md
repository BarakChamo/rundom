# Real-project benchmarks on the November 21 tag scanner build

Node v24.20.0 on Apple M4 with the TypeScript HTML parser. The run used the same 11 upstream checkouts and test-file hashes as the preceding replay. Each project used its installed jsdom version. Happy DOM was 21.0.4 and TurboDOM was 0.7.1. The RunDOM package was frozen at 2026-11-21T03:22:37.683Z. [Build hashes and versions](../.cache/upstream-scanner-ZoQ9Li/cohort.json) · [Upstream sources and jsdom versions](../.cache/upstream-scanner-ZoQ9Li/upstream-manifest.json)

RunDOM finished faster than jsdom on **10 of 10** primary selections with identical named outcomes and successful exits. Scully uses a guarded teardown. The broad Svelte selection passed 6,012 and failed 90 with RunDOM.

On 42 articles where all four providers returned the same fields and content trees, constructing the documents took 97 ms with RunDOM and 17 ms with TurboDOM. Article extraction took 140 ms and 81 ms, respectively. The full 130-page input and pairwise output counts are reported below.

This was a serial replay on a shared development machine. The sampled one-minute load average ranged from 2.4 to 5.6. The unchanged jsdom Svelte control took 33.70 seconds in this batch and 75.37 seconds in the preceding batch. Elapsed differences close to the run-to-run spread carry substantial uncertainty. [Timestamped host observations](../.cache/upstream-scanner-ZoQ9Li/host.jsonl)

## Upstream results

Times are median end-to-end seconds. Parentheses denote incomplete or unequal work compared with jsdom. Each provider ran in its own process with one test worker. Provider execution order rotated. Each successful provider ran three times when at least two providers completed that selection. A failed screen ran once. Supabase means the UI package, Next.js means its Vitest example, and freeCodeCamp means two client test files. The last four rows overlap the primary selections.

| Selection                             | RunDOM s | jsdom s | Happy DOM s | TurboDOM s | jsdom / RunDOM | Peak RSS difference vs jsdom, MiB |
| ------------------------------------- | -------- | ------- | ----------- | ---------- | -------------- | --------------------------------- |
| Mozilla Readability, 130 pages        | 4.44     | 9.55    | (5.58)      | (1.05)     | 2.15×          | -610                              |
| Material UI, 10 files                 | 16.36    | 21.72   | (26.38)     | (23.90)    | 1.33×          | +24                               |
| Ant Design, 8 files                   | 5.02     | 6.60    | (5.71)      | (4.52)     | 1.31×          | -26                               |
| Vue runtime-dom                       | 2.62     | 6.32    | (3.62)      | (2.25)     | 2.41×          | -116                              |
| Svelte runes, legacy and motion       | (29.84)  | 33.70   | (30.35)     | (5.16)     | incomplete     | —                                 |
| React DOM, 2 files                    | 4.30     | 4.96    | (4.43)      | (4.33)     | 1.15×          | -50                               |
| Drone UI, 1 file                      | 3.50     | 4.25    | 3.66        | (2.96)     | 1.21×          | -6                                |
| Scully, 3 files (teardown guard¹)     | 1.06     | 1.29    | (0.80)      | 1.06       | 1.22×          | +21                               |
| Supabase UI                           | 3.97     | 7.74    | (4.62)      | (4.68)     | 1.95×          | -112                              |
| Next.js Vitest example                | 0.97     | 1.67    | 1.38        | 1.00       | 1.72×          | -7                                |
| freeCodeCamp, 2 files                 | 0.99     | 1.49    | 1.08        | 1.09       | 1.51×          | -21                               |
| Material UI, original 5 files         | 7.61     | 9.82    | (8.96)      | (5.32)     | 1.29×          | -74                               |
| Svelte runes, first shard             | 5.75     | 6.25    | (5.73)      | (0.82)     | 1.09×          | +16                               |
| Svelte motion                         | 0.85     | 1.02    | 0.93        | (0.65)     | 1.20×          | -1                                |
| Scully globals only (teardown guard¹) | 0.91     | 1.10    | (0.95)      | 0.89       | 1.21×          | +12                               |

## Compatibility

All 60 provider and selection combinations reproduced the preceding replay’s exact named outcomes, failure counts and exit status. [Comparison against the preceding replay](../.cache/upstream-scanner-ZoQ9Li/broad-outcome-changes.json)

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

Scully’s original Jest 27 teardown redefines Window.document. The timed rows guard the same call for RunDOM and jsdom. The fresh unguarded runs produced RunDOM 0 / 0 / 0 + 3 files, jsdom 8 / 0 / 0. [Jest reports and provider traces](../.cache/upstream-scanner-ZoQ9Li/jest-providers/)

The broad Svelte run reproduced the preceding replay’s exact test outcomes. In the earlier browser diagnostic, the 90 failing DOM and hydration variants also failed in Google Chrome for Testing 156.0.8078.4, and 86 had identical failure details to RunDOM. Stock jsdom passed all 90 in that diagnostic. The browser evidence comes from the earlier run. [Browser comparison](../.cache/upstream-goal-1BQdRb/svelte-browser-summary.json)

## Timing and memory on identical work

Cells show process seconds / test seconds / peak RSS MiB. Filtered comparisons require the exact multiset of named passing tests in each of three trials. Readability uses complete pages. The dash means that provider failed qualification. Peak RSS is the operating system’s process high-water measurement for the command. It does not sum concurrent workers.

| Selection                             | Cases | RunDOM            | jsdom             | Happy DOM         | TurboDOM          |
| ------------------------------------- | ----- | ----------------- | ----------------- | ----------------- | ----------------- |
| Vue runtime-dom                       | 159   | 1.98 / 0.22 / 313 | 4.85 / 0.19 / 438 | 2.76 / 0.15 / 303 | 1.77 / 0.15 / 274 |
| Ant Design, 8 files                   | 116   | 4.92 / 1.00 / 597 | 6.22 / 1.12 / 609 | 5.13 / 0.87 / 587 | 4.41 / 0.77 / 563 |
| Material UI Button and TextField      | 118   | 1.84 / 0.48 / 313 | 2.37 / 0.65 / 309 | 1.86 / 0.40 / 310 | 1.62 / 0.31 / 309 |
| Material UI common subset             | 161   | 2.39 / 0.75 / 314 | 3.64 / 1.11 / 310 | 2.43 / 0.63 / 310 | —                 |
| Supabase UI                           | 80    | 4.48 / 0.87 / 197 | 8.62 / 1.72 / 309 | 5.29 / 0.55 / 177 | 4.07 / 0.58 / 157 |
| Svelte runes, first shard             | 561   | 5.70 / 4.69 / 366 | 6.07 / 4.87 / 341 | 5.79 / 4.65 / 366 | —                 |
| React DOM, 2 files                    | 61    | 4.27 / 3.28 / 833 | 4.51 / 3.32 / 911 | 4.42 / 3.29 / 835 | 4.24 / 3.24 / 822 |
| Mozilla Readability, 44 shared pages  | 281   | 0.70 / 0.56 / 435 | 1.24 / 0.99 / 496 | 0.77 / 0.55 / 460 | 0.45 / 0.32 / 301 |
| Next.js Vitest example                | 5     | 0.97 / 0.06 / 146 | 1.67 / 0.12 / 153 | 1.38 / 0.04 / 123 | 1.00 / 0.04 / 116 |
| freeCodeCamp, 2 files                 | 4     | 0.99 / 0.06 / 164 | 1.49 / 0.08 / 185 | 1.08 / 0.04 / 177 | 1.09 / 0.04 / 152 |
| Svelte motion                         | 8     | 0.85 / 0.00 / 183 | 1.02 / 0.00 / 184 | 0.93 / 0.00 / 185 | —                 |
| Drone UI, 1 file                      | 1     | 3.50 / 0.69 / 640 | 4.25 / 0.74 / 646 | 3.66 / 0.71 / 649 | —                 |
| Scully globals only (teardown guard¹) | 5     | 0.91 / 0.00 / 440 | 1.10 / 0.00 / 428 | —                 | 0.89 / 0.00 / 413 |

| Four-way selection                         | Lowest elapsed median | RunDOM above lowest, ms | RunDOM peak minus lowest-time provider, MiB |
| ------------------------------------------ | --------------------- | ----------------------- | ------------------------------------------- |
| Vue runtime-dom (159)                      | TurboDOM              | 210                     | +39                                         |
| Ant Design, 8 files (116)                  | TurboDOM              | 510                     | +34                                         |
| Material UI Button and TextField (118)     | TurboDOM              | 220                     | +4                                          |
| Supabase UI (80)                           | TurboDOM              | 410                     | +40                                         |
| React DOM, 2 files (61)                    | TurboDOM              | 30                      | +11                                         |
| Mozilla Readability, 44 shared pages (281) | TurboDOM              | 250                     | +134                                        |
| Next.js Vitest example (5)                 | RunDOM                | 0                       | 0                                           |
| freeCodeCamp, 2 files (4)                  | RunDOM                | 0                       | 0                                           |

Each pair below uses matching repetition numbers from the rotated runs. The process clock reports hundredths of a second. On short workloads, margins of that size can change with the run order.

| Selection                                  | RunDOM minus TurboDOM per round, ms | RunDOM faster | Ties | TurboDOM faster |
| ------------------------------------------ | ----------------------------------- | ------------- | ---- | --------------- |
| Vue runtime-dom (159)                      | +210 / +200 / +210                  | 0             | 0    | 3               |
| Ant Design, 8 files (116)                  | +510 / +540 / +500                  | 0             | 0    | 3               |
| Material UI Button and TextField (118)     | +210 / +220 / +220                  | 0             | 0    | 3               |
| Supabase UI (80)                           | +410 / +540 / +200                  | 0             | 0    | 3               |
| React DOM, 2 files (61)                    | +0 / +70 / +30                      | 0             | 1    | 2               |
| Mozilla Readability, 44 shared pages (281) | +250 / +230 / +250                  | 0             | 0    | 3               |
| Next.js Vitest example (5)                 | +180 / +70 / -40                    | 1             | 0    | 2               |
| freeCodeCamp, 2 files (4)                  | +30 / -250 / +50                    | 1             | 0    | 2               |

## Where RunDOM still loses on identical work

A positive delta means RunDOM took longer or used more peak memory than the named provider. These comparisons use the shared four-provider selections when all three rounds qualify. Each selection is listed once per comparison provider. The full upstream pass counts above give the coverage context.

| Selection                                  | Comparison | Process delta ms | Test delta ms | Peak RSS delta MiB |
| ------------------------------------------ | ---------- | ---------------- | ------------- | ------------------ |
| Vue runtime-dom (159)                      | jsdom      | -2870            | +22           | -125               |
| Vue runtime-dom (159)                      | Happy DOM  | -780             | +66           | +9                 |
| Vue runtime-dom (159)                      | TurboDOM   | +210             | +63           | +39                |
| Ant Design, 8 files (116)                  | jsdom      | -1300            | -118          | -12                |
| Ant Design, 8 files (116)                  | Happy DOM  | -210             | +129          | +10                |
| Ant Design, 8 files (116)                  | TurboDOM   | +510             | +228          | +34                |
| Material UI Button and TextField (118)     | jsdom      | -530             | -164          | +4                 |
| Material UI Button and TextField (118)     | Happy DOM  | -20              | +86           | +4                 |
| Material UI Button and TextField (118)     | TurboDOM   | +220             | +171          | +4                 |
| Supabase UI (80)                           | jsdom      | -4140            | -844          | -112               |
| Supabase UI (80)                           | Happy DOM  | -810             | +325          | +20                |
| Supabase UI (80)                           | TurboDOM   | +410             | +296          | +40                |
| React DOM, 2 files (61)                    | jsdom      | -240             | -40           | -78                |
| React DOM, 2 files (61)                    | Happy DOM  | -150             | -8            | -2                 |
| React DOM, 2 files (61)                    | TurboDOM   | +30              | +45           | +11                |
| Mozilla Readability, 44 shared pages (281) | jsdom      | -540             | -433          | -61                |
| Mozilla Readability, 44 shared pages (281) | Happy DOM  | -70              | +7            | -25                |
| Mozilla Readability, 44 shared pages (281) | TurboDOM   | +250             | +239          | +134               |
| Next.js Vitest example (5)                 | jsdom      | -700             | -52           | -7                 |
| Next.js Vitest example (5)                 | Happy DOM  | -410             | +19           | +23                |
| Next.js Vitest example (5)                 | TurboDOM   | -30              | +27           | +31                |
| freeCodeCamp, 2 files (4)                  | jsdom      | -500             | -20           | -21                |
| freeCodeCamp, 2 files (4)                  | Happy DOM  | -90              | +18           | -13                |
| freeCodeCamp, 2 files (4)                  | TurboDOM   | -100             | +19           | +12                |

## Broad runner phases and CPU

The first table reports median end-to-end seconds, test seconds and peak RSS MiB for every attempt, including partial executions. Test time is the sum of named test durations for Vitest and Jest, and suite duration for Mocha. The second table gives total user and system CPU seconds. Vitest stage measurements come from the trial nearest each provider’s elapsed median. Jest and Mocha do not emit the same stage breakdown.

| Selection                             | RunDOM              | jsdom               | Happy DOM           | TurboDOM            |
| ------------------------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| Mozilla Readability, 130 pages        | 4.44 / 4.12 / 768   | 9.55 / 9.15 / 1378  | 5.58 / 5.23 / 1601  | 1.05 / 0.90 / 452   |
| Material UI, 10 files                 | 16.36 / 12.77 / 581 | 21.72 / 15.87 / 557 | 26.38 / 22.02 / 595 | 23.90 / 16.85 / 440 |
| Ant Design, 8 files                   | 5.02 / 1.12 / 599   | 6.60 / 1.23 / 625   | 5.71 / 0.98 / 592   | 4.52 / 0.85 / 586   |
| Vue runtime-dom                       | 2.62 / 0.39 / 399   | 6.32 / 0.38 / 515   | 3.62 / 0.27 / 390   | 2.25 / 0.19 / 343   |
| Svelte runes, legacy and motion       | 29.84 / 22.78 / 574 | 33.70 / 25.20 / 492 | 30.35 / 22.36 / 553 | 5.16 / 0.00 / 426   |
| React DOM, 2 files                    | 4.30 / 3.31 / 845   | 4.96 / 3.34 / 895   | 4.43 / 3.30 / 775   | 4.33 / 3.30 / 823   |
| Drone UI, 1 file                      | 3.50 / 0.69 / 640   | 4.25 / 0.74 / 646   | 3.66 / 0.71 / 649   | 2.96 / 0.04 / 627   |
| Scully, 3 files (teardown guard¹)     | 1.06 / 0.00 / 488   | 1.29 / 0.00 / 467   | 0.80 / 0.00 / 415   | 1.06 / 0.00 / 473   |
| Supabase UI                           | 3.97 / 0.88 / 197   | 7.74 / 1.65 / 309   | 4.62 / 0.59 / 177   | 4.68 / 1.56 / 158   |
| Next.js Vitest example                | 0.97 / 0.06 / 146   | 1.67 / 0.12 / 153   | 1.38 / 0.04 / 123   | 1.00 / 0.04 / 116   |
| freeCodeCamp, 2 files                 | 0.99 / 0.06 / 164   | 1.49 / 0.08 / 185   | 1.08 / 0.04 / 177   | 1.09 / 0.04 / 152   |
| Material UI, original 5 files         | 7.61 / 5.41 / 326   | 9.82 / 6.34 / 400   | 8.96 / 6.39 / 482   | 5.32 / 1.05 / 403   |
| Svelte runes, first shard             | 5.75 / 4.72 / 356   | 6.25 / 4.93 / 341   | 5.73 / 4.66 / 367   | 0.82 / 0.00 / 186   |
| Svelte motion                         | 0.85 / 0.00 / 183   | 1.02 / 0.00 / 184   | 0.93 / 0.00 / 185   | 0.65 / 0.00 / 181   |
| Scully globals only (teardown guard¹) | 0.91 / 0.00 / 440   | 1.10 / 0.00 / 428   | 0.95 / 0.00 / 397   | 0.89 / 0.00 / 413   |

| Selection                             | RunDOM CPU s | jsdom CPU s | Happy DOM CPU s | TurboDOM CPU s |
| ------------------------------------- | ------------ | ----------- | --------------- | -------------- |
| Mozilla Readability, 130 pages        | 6.40         | 12.71       | 7.92            | 1.49           |
| Material UI, 10 files                 | 16.87        | 23.31       | 20.42           | 23.38          |
| Ant Design, 8 files                   | 8.06         | 9.41        | 8.15            | 7.20           |
| Vue runtime-dom                       | 3.47         | 8.13        | 4.71            | 2.92           |
| Svelte runes, legacy and motion       | 31.54        | 35.80       | 31.54           | 6.49           |
| React DOM, 2 files                    | 5.96         | 6.22        | 6.10            | 5.95           |
| Drone UI, 1 file                      | 4.57         | 4.86        | 4.71            | 4.37           |
| Scully, 3 files (teardown guard¹)     | 1.75         | 1.86        | 1.18            | 1.69           |
| Supabase UI                           | 5.27         | 10.02       | 5.76            | 4.91           |
| Next.js Vitest example                | 1.22         | 1.90        | 1.55            | 1.11           |
| freeCodeCamp, 2 files                 | 1.40         | 1.72        | 1.43            | 1.31           |
| Material UI, original 5 files         | 7.28         | 9.94        | 7.62            | 6.97           |
| Svelte runes, first shard             | 4.11         | 4.57        | 4.02            | 1.09           |
| Svelte motion                         | 1.12         | 1.24        | 1.17            | 0.90           |
| Scully globals only (teardown guard¹) | 1.41         | 1.53        | 1.17            | 1.37           |

| Selection                       | Provider  | Vitest stages                                                                                   |
| ------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| Material UI, 10 files           | RunDOM    | 16.02s (tests 82%, import 7%, transform 6%, setup 3%, environment 2%)                           |
| Material UI, 10 files           | jsdom     | 21.30s (tests 77%, environment 12%, import 5%, transform 4%, setup 2%)                          |
| Material UI, 10 files           | Happy DOM | 26.00s (tests 87%, import 4%, environment 4%, transform 4%, setup 2%)                           |
| Material UI, 10 files           | TurboDOM  | 23.37s (tests 87%, import 6%, transform 5%, setup 3%)                                           |
| Ant Design, 8 files             | RunDOM    | 4.88s (transform 46%, tests 25%, setup 20%, environment 4%, import 4%)                          |
| Ant Design, 8 files             | jsdom     | 6.41s (transform 36%, environment 25%, tests 20%, setup 13%, import 6%)                         |
| Ant Design, 8 files             | Happy DOM | 5.50s (transform 44%, tests 19%, setup 15%, environment 14%, import 7%)                         |
| Ant Design, 8 files             | TurboDOM  | 4.35s (transform 54%, tests 22%, setup 18%, import 5%)                                          |
| Vue runtime-dom                 | RunDOM    | 2.44s (transform 288ms, setup 33ms, import 833ms, tests 400ms, environment 412ms)               |
| Vue runtime-dom                 | jsdom     | 6.15s (transform 304ms, setup 64ms, import 867ms, tests 386ms, environment 4.10s)               |
| Vue runtime-dom                 | Happy DOM | 3.43s (transform 309ms, setup 35ms, import 878ms, tests 275ms, environment 1.49s)               |
| Vue runtime-dom                 | TurboDOM  | 2.01s (transform 263ms, setup 38ms, import 619ms, tests 195ms, environment 21ms)                |
| Svelte runes, legacy and motion | RunDOM    | 29.31s (transform 7.35s, setup 0ms, import 5.72s, tests 22.82s, environment 219ms)              |
| Svelte runes, legacy and motion | jsdom     | 33.12s (transform 7.70s, setup 0ms, import 6.09s, tests 25.24s, environment 1.25s)              |
| Svelte runes, legacy and motion | Happy DOM | 29.75s (transform 7.51s, setup 0ms, import 5.92s, tests 22.40s, environment 873ms)              |
| Svelte runes, legacy and motion | TurboDOM  | 4.89s (transform 2.79s, setup 0ms, import 0ms, tests 0ms, environment 20ms)                     |
| Supabase UI                     | RunDOM    | 3.85s (import 29%, tests 28%, setup 27%, environment 11%, transform 3%, worker 1%)              |
| Supabase UI                     | jsdom     | 7.56s (environment 46%, tests 24%, import 15%, setup 12%, transform 2%)                         |
| Supabase UI                     | Happy DOM | 4.49s (environment 36%, import 23%, setup 21%, tests 16%, transform 3%, worker 1%)              |
| Supabase UI                     | TurboDOM  | 4.55s (tests 45%, import 26%, setup 24%, transform 4%, environment 1%, worker 1%)               |
| Next.js Vitest example          | RunDOM    | 768ms (transform 45ms, setup 0ms, collect 189ms, tests 65ms, environment 81ms, prepare 102ms)   |
| Next.js Vitest example          | jsdom     | 1.46s (transform 43ms, setup 0ms, collect 182ms, tests 117ms, environment 728ms, prepare 103ms) |
| Next.js Vitest example          | Happy DOM | 1.13s (transform 52ms, setup 0ms, collect 240ms, tests 45ms, environment 400ms, prepare 108ms)  |
| Next.js Vitest example          | TurboDOM  | 767ms (transform 48ms, setup 0ms, collect 215ms, tests 42ms, environment 9ms, prepare 114ms)    |
| freeCodeCamp, 2 files           | RunDOM    | 788ms (transform 181ms, setup 162ms, import 409ms, tests 56ms, environment 47ms)                |
| freeCodeCamp, 2 files           | jsdom     | 1.27s (transform 196ms, setup 172ms, import 441ms, tests 89ms, environment 432ms)               |
| freeCodeCamp, 2 files           | Happy DOM | 859ms (transform 164ms, setup 158ms, import 369ms, tests 38ms, environment 179ms)               |
| freeCodeCamp, 2 files           | TurboDOM  | 838ms (transform 198ms, setup 189ms, import 436ms, tests 40ms, environment 4ms)                 |
| Material UI, original 5 files   | RunDOM    | 7.27s (tests 78%, transform 9%, import 8%, setup 3%, environment 2%)                            |
| Material UI, original 5 files   | jsdom     | 9.39s (tests 70%, environment 14%, transform 8%, import 6%, setup 3%)                           |
| Material UI, original 5 files   | Happy DOM | 8.60s (tests 77%, transform 7%, environment 7%, import 6%, setup 3%)                            |
| Material UI, original 5 files   | TurboDOM  | 4.73s (tests 38%, transform 28%, import 22%, setup 11%)                                         |
| Svelte runes, first shard       | RunDOM    | 5.54s (transform 1.08s, setup 0ms, import 721ms, tests 4.72s, environment 32ms)                 |
| Svelte runes, first shard       | jsdom     | 6.02s (transform 1.10s, setup 0ms, import 781ms, tests 4.96s, environment 218ms)                |
| Svelte runes, first shard       | Happy DOM | 5.53s (transform 1.08s, setup 0ms, import 711ms, tests 4.67s, environment 90ms)                 |
| Svelte runes, first shard       | TurboDOM  | 617ms (transform 367ms, setup 0ms, import 0ms, tests 0ms, environment 5ms)                      |
| Svelte motion                   | RunDOM    | 640ms (transform 373ms, setup 0ms, import 549ms, tests 3ms, environment 30ms)                   |
| Svelte motion                   | jsdom     | 812ms (transform 373ms, setup 0ms, import 543ms, tests 2ms, environment 210ms)                  |
| Svelte motion                   | Happy DOM | 726ms (transform 362ms, setup 0ms, import 527ms, tests 2ms, environment 139ms)                  |
| Svelte motion                   | TurboDOM  | 451ms (transform 252ms, setup 0ms, import 0ms, tests 0ms, environment 2ms)                      |

Per-run peak RSS shows how much the high-water mark varies between fresh processes. Each pair of columns covers all three runs, in execution-round order.

| Selection                      | RunDOM peaks MiB | jsdom peaks MiB    |
| ------------------------------ | ---------------- | ------------------ |
| Mozilla Readability, 130 pages | 750 / 768 / 1226 | 1378 / 1432 / 1239 |
| Material UI, 10 files          | 577 / 581 / 611  | 523 / 584 / 557    |
| Ant Design, 8 files            | 603 / 598 / 599  | 605 / 625 / 631    |
| Vue runtime-dom                | 399 / 403 / 397  | 519 / 513 / 515    |
| React DOM, 2 files             | 845 / 844 / 849  | 916 / 850 / 895    |

## Change from the preceding replay

Ranges cover all three latest runs. The jsdom control change shows movement between batches with unchanged reference software. A small difference between batches is weak evidence for an implementation effect. [Trial summary and report filenames](../.cache/upstream-scanner-ZoQ9Li/summary.json)

| Selection                             | Previous RunDOM s | Latest RunDOM s | Latest RunDOM range s | Latest jsdom range s | jsdom control change |
| ------------------------------------- | ----------------- | --------------- | --------------------- | -------------------- | -------------------- |
| Mozilla Readability, 130 pages        | 4.75              | 4.44            | 4.32–4.48             | 9.40–9.58            | -2.0%                |
| Material UI, 10 files                 | 17.25             | 16.36           | 16.33–16.70           | 21.67–21.82          | -6.5%                |
| Ant Design, 8 files                   | 6.18              | 5.02            | 5.00–5.04             | 6.33–6.76            | -9.7%                |
| Vue runtime-dom                       | 3.05              | 2.62            | 2.60–2.66             | 6.27–6.37            | -23.3%               |
| React DOM, 2 files                    | 5.81              | 4.30            | 4.29–4.95             | 4.55–4.99            | -7.6%                |
| Drone UI, 1 file                      | 3.89              | 3.50            | 3.48–3.53             | 3.77–4.27            | -2.7%                |
| Scully, 3 files (teardown guard¹)     | 1.19              | 1.06            | 1.06–1.40             | 1.23–1.56            | -15.7%               |
| Supabase UI                           | 4.23              | 3.97            | 3.96–4.07             | 7.58–7.88            | -17.7%               |
| Next.js Vitest example                | 1.11              | 0.97            | 0.97–1.18             | 1.65–1.89            | -2.3%                |
| freeCodeCamp, 2 files                 | 0.99              | 0.99            | 0.98–1.12             | 1.29–1.61            | +11.2%               |
| Material UI, original 5 files         | 7.65              | 7.61            | 7.59–7.75             | 9.73–10.03           | -2.1%                |
| Svelte runes, first shard             | 5.56              | 5.75            | 5.68–5.86             | 6.12–6.25            | +4.2%                |
| Svelte motion                         | 0.85              | 0.85            | 0.82–0.85             | 0.93–1.02            | +0.0%                |
| Scully globals only (teardown guard¹) | 0.92              | 0.91            | 0.90–0.92             | 1.09–1.30            | -16.0%               |

## Readability application

This benchmark opens, extracts and closes 130 documents and hashes the articles. Heap values are sampled after forced GC at the end of the synchronous batch and after an event-loop turn. All four providers attempted three full replays.

| Provider  | Complete trials | Construct s | Extract s | Close ms | Process s | Peak MiB | Same-turn heap MiB | Next-turn heap MiB |
| --------- | --------------- | ----------- | --------- | -------- | --------- | -------- | ------------------ | ------------------ |
| RunDOM    | 3               | 0.77        | 1.26      | 1.14     | 2.22      | 654      | 55.88              | 37.47              |
| jsdom     | 3               | 3.15        | 2.37      | 35.07    | 5.91      | 1314     | 717.52             | 166.97             |
| Happy DOM | 0               | —           | —         | —        | —         | —        | —                  | —                  |
| TurboDOM  | 0               | —           | —         | —        | —         | —        | —                  | —                  |

RunDOM and jsdom differed on 5 serialized articles. Independent parsing found 0 differences in the resulting trees. [Per-article differences](../.cache/upstream-scanner-ZoQ9Li/output-equivalence.json) · [Application exit codes and matched test identities](../.cache/upstream-scanner-ZoQ9Li/matches.jsonl)

## React and Testing Library supplemental workloads

Each eligible cell summarizes nine fresh Vitest processes exercising the same React and Testing Library fixture. Cells give process seconds / test seconds / worker RSS MiB. RSS here is sampled at suite end. These fixtures supplement upstream React’s two Jest files.

| Fixture      | Worker pool | RunDOM            | jsdom             | Happy DOM         | TurboDOM   |
| ------------ | ----------- | ----------------- | ----------------- | ----------------- | ---------- |
| 8 workflows  | forks       | 0.39 / 0.12 / 140 | 0.61 / 0.14 / 215 | 0.43 / 0.10 / 122 | incomplete |
| 8 workflows  | threads     | 0.37 / 0.12 / 194 | 0.59 / 0.14 / 243 | 0.41 / 0.10 / 181 | incomplete |
| 8 workflows  | vmForks     | 0.44 / 0.14 / 150 | 0.61 / 0.14 / 203 | 0.44 / 0.10 / 138 | incomplete |
| 8 workflows  | vmThreads   | 0.43 / 0.14 / 202 | 0.59 / 0.15 / 254 | 0.43 / 0.10 / 189 | incomplete |
| 10 workflows | forks       | 0.80 / 0.41 / 261 | 1.35 / 0.58 / 332 | incomplete        | incomplete |
| 10 workflows | threads     | 0.76 / 0.40 / 292 | 1.33 / 0.61 / 382 | incomplete        | incomplete |
| 10 workflows | vmForks     | 0.75 / 0.41 / 299 | 1.08 / 0.58 / 345 | incomplete        | incomplete |
| 10 workflows | vmThreads   | 0.73 / 0.41 / 369 | 1.05 / 0.57 / 394 | incomplete        | incomplete |

[Eight-workflow trials and failures](../.cache/upstream-scanner-ZoQ9Li/react-standard.json) · [Ten-workflow trials and failures](../.cache/upstream-scanner-ZoQ9Li/react-integration.json)

## Which tests dominate

The longest component files below are ranked by summed upstream test duration on RunDOM. Each value is the median of three complete runs. The React row measures the case that previously formatted an internal CSS parser error stack.

| Project     | File or case                                                | RunDOM ms | jsdom ms | Difference ms |
| ----------- | ----------------------------------------------------------- | --------- | -------- | ------------- |
| Material UI | packages/mui-material/src/Autocomplete/Autocomplete.test.js | 4868      | 6826     | -1957         |
| Material UI | packages/mui-material/src/Select/Select.test.js             | 4197      | 4784     | -587          |
| Material UI | packages/mui-material/src/Tabs/Tabs.test.js                 | 1108      | 1283     | -175          |
| Material UI | packages/mui-material/src/Tooltip/Tooltip.test.js           | 920       | 1031     | -111          |
| Material UI | packages/mui-material/src/TextField/TextField.test.js       | 380       | 522      | -141          |
| Ant Design  | components/radio/**tests**/group.test.tsx                   | 228       | 259      | -31           |
| Ant Design  | components/alert/**tests**/index.test.tsx                   | 223       | 215      | 8             |
| Ant Design  | components/checkbox/**tests**/group.test.tsx                | 212       | 238      | -26           |
| Ant Design  | components/radio/**tests**/radio.test.tsx                   | 150       | 163      | -13           |
| Ant Design  | components/checkbox/**tests**/checkbox.test.tsx             | 93        | 107      | -14           |
| React DOM   | should warn about style having a trailing semicolon         | 1         | 1        | 0             |

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
| RunDOM    | 96.85        | 140.22     | 0.37     | 0.35         | 272.05       | 26.73              |
| jsdom     | 232.12       | 240.18     | 3.59     | 0.65         | 362.34       | 37.31              |
| Happy DOM | 101.74       | 140.18     | 0.04     | 0.43         | 342.48       | 58.07              |
| TurboDOM  | 16.50        | 81.45      | 0.02     | 0.19         | 245.14       | 13.45              |

[Comparable stages and selected article identities](../.cache/upstream-scanner-ZoQ9Li/shared-articles/metrics.json) · [All 520 page outcomes and raw process logs](../.cache/upstream-scanner-ZoQ9Li/shared-articles/)

## Tag scanner selection

Seven fresh processes per build and corpus ran in rotating order. Each build produced the same full article hash for its corpus. The ordinary-tag scanner consumes a complete tag only when the names and attributes are literal. The existing parse5 state machine handles the remaining tags and constructs every tree. [Paired raw application measurements](../.cache/parser-admission-caEquB/split-paired.jsonl)

| Articles | RunDOM parser                              | Construct ms | Extract ms | Process s | Peak MiB | Settled heap MiB |
| -------- | ------------------------------------------ | ------------ | ---------- | --------- | -------- | ---------------- |
| 42       | Pinned parse5                              | 112.81       | 138.74     | 0.41      | 274.56   | 26.77            |
| 42       | Literal spans                              | 104.94       | 140.64     | 0.37      | 273.64   | 26.81            |
| 42       | Literal spans and ordinary tags (selected) | 97.84        | 143.70     | 0.37      | 272.59   | 26.84            |
| 42       | Document-level scanner selection           | 106.12       | 146.87     | 0.37      | 273.91   | 26.85            |
| 130      | Pinned parse5                              | 945.77       | 1278.93    | 2.40      | 675.95   | 47.73            |
| 130      | Literal spans                              | 806.39       | 1305.31    | 2.29      | 646.28   | 36.98            |
| 130      | Literal spans and ordinary tags (selected) | 825.90       | 1298.77    | 2.25      | 658.83   | 37.58            |
| 130      | Document-level scanner selection           | 843.98       | 1369.42    | 2.40      | 646.81   | 37.03            |

| Synthetic scenario, eight operations | Pre-optimization RunDOM ms | Selected RunDOM ms | jsdom ms | Happy DOM ms | TurboDOM ms |
| ------------------------------------ | -------------------------- | ------------------ | -------- | ------------ | ----------- |
| parse-html-unique                    | 14.924                     | 13.008             | 84.746   | 110.117      | 14.191      |
| parse-html-traverse                  | 8.301                      | 8.368              | 94.148   | 126.395      | 1.813       |
| windows-create-close                 | 4.368                      | 4.243              | 13.075   | 14.389       | 0.088       |

The synthetic table uses eleven rotated rounds. The pinned parse5 differential covered 19,112 comparisons of complete trees, including malformed markup, namespaces and text boundaries. [Synthetic run directory](../.cache/parser-admission-caEquB/tag-compare.json) · [Fixture and malformed-input trees](../.cache/parser-admission-caEquB/tag-oracle.json) · [Generated tag trees](../.cache/parser-admission-caEquB/tag-fuzz.json)

## Short-project sensitivity check

A separate CPU task overlapped part of the first Supabase UI, Next.js and freeCodeCamp rotation. All three selections were replayed once more in the original provider order. Each extra run reproduced its original named outcomes. The broad medians above retain all three scheduled observations. [Initial and additional measurements](../.cache/upstream-scanner-ZoQ9Li/sensitivity.json)

| Selection    | Provider  | First process s | Additional process s |
| ------------ | --------- | --------------- | -------------------- |
| supabase-ui  | jsdom     | 7.92            | 7.90                 |
| supabase-ui  | rundom    | 3.98            | 4.01                 |
| supabase-ui  | happy-dom | 4.68            | 4.70                 |
| supabase-ui  | turbo-dom | 4.70            | 4.64                 |
| next-example | rundom    | 1.22            | 1.14                 |
| next-example | happy-dom | 1.43            | 1.30                 |
| next-example | turbo-dom | 1.06            | 0.93                 |
| next-example | jsdom     | 1.94            | 1.72                 |
| freecodecamp | happy-dom | 1.74            | 1.55                 |
| freecodecamp | turbo-dom | 1.12            | 0.98                 |
| freecodecamp | jsdom     | 1.52            | 1.35                 |
| freecodecamp | rundom    | 1.17            | 1.03                 |

## Where the elapsed advantage comes from

For each primary selection that completed identically in all RunDOM and jsdom repeats, the first two timing columns give jsdom minus RunDOM. The runner remainder includes work outside its test-duration measure, such as starting workers, loading modules, and teardown. The Mocha test measure covers suite time. Remainders are calculated separately in each trial before taking medians.

| Selection                         | Whole process s | Runner test measure s | Remainder s | Process difference by rotation s |
| --------------------------------- | --------------- | --------------------- | ----------- | -------------------------------- |
| Mozilla Readability, 130 pages    | +5.100          | +4.870                | +0.228      | +5.10 / +5.11 / +5.08            |
| Material UI, 10 files             | +5.310          | +3.121                | +2.210      | +5.12 / +5.31 / +5.39            |
| Ant Design, 8 files               | +1.600          | +0.106                | +1.476      | +1.29 / +1.74 / +1.60            |
| Vue runtime-dom                   | +3.700          | -0.012                | +3.714      | +3.70 / +3.77 / +3.61            |
| React DOM, 2 files                | +0.670          | +0.034                | +0.632      | -0.40 / +0.67 / +0.69            |
| Drone UI, 1 file                  | +0.750          | +0.043                | +0.704      | +0.24 / +0.75 / +0.79            |
| Scully, 3 files (teardown guard¹) | +0.230          | +0.000                | +0.230      | +0.23 / +0.50 / -0.17            |
| Supabase UI                       | +3.780          | +0.771                | +3.013      | +3.91 / +3.51 / +3.78            |
| Next.js Vitest example            | +0.700          | +0.053                | +0.647      | +0.71 / +0.68 / +0.70            |
| freeCodeCamp, 2 files             | +0.370          | +0.021                | +0.345      | +0.37 / +0.30 / +0.63            |

## Test files accounting for the TurboDOM gap

Each row sums durations for the same named passing cases within an upstream file. Times are medians of three trials. The table selects the largest positive RunDOM-minus-TurboDOM differences in each comparable framework workload. Runner load, imports and skipped cases are outside these file totals.

| Framework   | Upstream file                                                                | Cases | RunDOM ms | jsdom ms | Happy DOM ms | TurboDOM ms | Difference ms |
| ----------- | ---------------------------------------------------------------------------- | ----- | --------- | -------- | ------------ | ----------- | ------------- |
| Vue         | packages/runtime-dom/**tests**/patchStyle.spec.ts                            | 19    | 32.1      | 11.8     | 6.0          | 5.4         | +26.7         |
| Vue         | packages/runtime-dom/**tests**/customElement.spec.ts                         | 65    | 86.2      | 83.9     | 56.9         | 66.4        | +19.9         |
| Vue         | packages/runtime-dom/**tests**/helpers/useCssVars.spec.ts                    | 1     | 13.7      | 9.1      | 5.9          | 5.1         | +8.5          |
| Ant Design  | components/checkbox/**tests**/group.test.tsx                                 | 23    | 204.5     | 226.7    | 173.8        | 158.2       | +46.2         |
| Ant Design  | components/radio/**tests**/group.test.tsx                                    | 29    | 220.1     | 250.5    | 230.8        | 182.4       | +37.7         |
| Ant Design  | components/radio/**tests**/radio.test.tsx                                    | 16    | 135.6     | 142.4    | 113.4        | 101.8       | +33.8         |
| Material UI | packages/mui-material/src/Button/Button.test.js                              | 66    | 237.0     | 301.9    | 183.6        | 144.7       | +92.3         |
| Material UI | packages/mui-material/src/TextField/TextField.test.js                        | 52    | 243.4     | 343.7    | 213.6        | 167.3       | +76.1         |
| Supabase UI | packages/ui/src/components/shadcn/ui/alert-dialog.test.tsx                   | 7     | 112.9     | 378.8    | 73.3         | 60.7        | +52.2         |
| Supabase UI | packages/ui/src/components/shadcn/ui/toggle-group.test.tsx                   | 13    | 202.8     | 360.9    | 125.2        | 157.2       | +45.5         |
| Supabase UI | packages/ui/src/components/CustomHTMLElements/CopyHeadingLinkButton.test.tsx | 4     | 83.6      | 112.3    | 42.9         | 40.6        | +43.1         |

## Earlier React, Drone and Scully selections

The original project exploration also used these overlapping Jest selections. All four published adapters were screened. Successful providers repeated twice when at least two completed the selection. Cells show passed / failed, process seconds / test seconds / peak MiB, then the number of trials. A dagger marks unequal named outcomes or a nonzero exit. Scully uses the same guarded teardown as in the primary matrix. [Source hashes, traces, failures and elapsed, CPU and memory measurements](../.cache/upstream-scanner-ZoQ9Li/historical.json)

| Historical selection                               | RunDOM                           | jsdom                          | Happy DOM                        | TurboDOM                          |
| -------------------------------------------------- | -------------------------------- | ------------------------------ | -------------------------------- | --------------------------------- |
| React DOM, four files including event dispatch     | 86 / 3, 4.77 / 3.71 / 844, n=1 † | 89 / 0, 5.33 / 3.70 / 807, n=1 | 86 / 3, 4.78 / 3.68 / 892, n=1 † | 78 / 11, 4.61 / 3.63 / 825, n=1 † |
| React DOM, three files including invalid listeners | 65 / 1, 4.43 / 3.41 / 848, n=1 † | 66 / 0, 4.57 / 3.41 / 879, n=1 | 64 / 2, 4.92 / 3.38 / 826, n=1 † | 62 / 4, 4.29 / 3.33 / 839, n=1 †  |
| Drone UI, CreateRepositoryButton and Strings       | 11 / 1, 4.47 / 0.73 / 597, n=1 † | 12 / 0, 3.86 / 0.76 / 624, n=1 | 11 / 1, 3.92 / 0.73 / 628, n=1 † | 10 / 2, 3.22 / 0.06 / 596, n=1 †  |
| Scully, baseHrefRewrite                            | 3 / 0, 0.74 / 0.00 / 393, n=3    | 3 / 0, 0.81 / 0.00 / 385, n=3  | 0 / 0, 0.83 / 0.00 / 382, n=1 †  | 3 / 0, 0.71 / 0.00 / 391, n=3     |

## Vue inline style patching

This upstream case assigns width, height and display, changes all three, then reapplies Vue’s style object. Those operations expose a cold inline-declaration cost that is easy to miss in whole-suite timings. The table gives durations reported by the upstream test runner.

| Provider  | Round 1 ms | Round 2 ms | Round 3 ms | Median ms |
| --------- | ---------- | ---------- | ---------- | --------- |
| rundom    | 21.58      | 21.11      | 21.27      | 21.27     |
| jsdom     | 1.35       | 1.34       | 1.39       | 1.35      |
| happy-dom | 0.59       | 0.57       | 0.59       | 0.59      |
| turbo-dom | 0.52       | 0.55       | 0.53       | 0.53      |

## Material UI worker memory after teardown

A separate diagnostic reran the ten files on RunDOM and jsdom. Every worker recorded its process high-water RSS on entering teardown and live V8 heap after disposing the environment, yielding a turn and forcing GC. Both providers passed 1,087 tests. The table uses a single instrumented observation per file and provider. [Per-worker memory checkpoints and test reports](../.cache/upstream-scanner-ZoQ9Li/mui-workers/)

| Worker       | RunDOM peak MiB | jsdom peak MiB | Peak difference MiB | RunDOM settled heap MiB | jsdom settled heap MiB | Heap difference MiB |
| ------------ | --------------- | -------------- | ------------------- | ----------------------- | ---------------------- | ------------------- |
| Autocomplete | 561.9           | 521.2          | 40.8                | 91.0                    | 110.9                  | -19.9               |
| Select       | 340.5           | 355.7          | -15.2               | 70.7                    | 89.4                   | -18.7               |
| Tabs         | 337.3           | 336.3          | 1.0                 | 60.2                    | 79.7                   | -19.6               |
| TextField    | 281.6           | 322.3          | -40.7               | 59.3                    | 79.1                   | -19.9               |
| Tooltip      | 275.3           | 297.3          | -22.0               | 53.8                    | 73.7                   | -19.9               |
| Menu         | 267.2           | 282.4          | -15.2               | 55.1                    | 73.9                   | -18.8               |
| Popover      | 228.3           | 284.8          | -56.6               | 56.2                    | 76.0                   | -19.8               |
| Dialog       | 211.0           | 282.7          | -71.8               | 52.1                    | 71.5                   | -19.4               |
| Drawer       | 200.9           | 281.4          | -80.5               | 51.8                    | 71.5                   | -19.7               |
| MenuList     | 187.7           | 286.5          | -98.9               | 51.1                    | 71.0                   | -19.9               |

## Parser qualification and memory

The repository gate passed. Both TypeScript and Rust passed all 634 upstream jsdom API tests and reproduced the baseline on 608 named WPT assertion and harness outcomes per backend. Three expected-failure mismatches remain in the outer WPT runner. The targeted HTML parsing WPT set matched on all 2,700 outcomes, including three existing failures. [WPT identities and statuses](../.cache/parser-admission-caEquB/wpt-identity.json) · [HTML parsing WPT comparison](../.cache/parser-admission-caEquB/syntax-wpt.json) · [Repository gate](../.cache/parser-admission-caEquB/final-check.log)

| Synthetic workload  | Provider  | Peak RSS MiB | After-work heap MiB | Closed windows held, heap MiB | All references released, heap MiB |
| ------------------- | --------- | ------------ | ------------------- | ----------------------------- | --------------------------------- |
| windows-live        | run-dom   | 126.19       | 24.20               | 24.20                         | 19.40                             |
| windows-live        | jsdom     | 261.67       | 78.68               | 78.68                         | 43.84                             |
| windows-live        | happy-dom | 377.36       | 143.20              | 27.08                         | 24.85                             |
| windows-live        | turbo-dom | 108.19       | 17.88               | 17.89                         | 16.29                             |
| windows-style-live  | run-dom   | 155.95       | 33.07               | 33.07                         | 26.88                             |
| windows-style-live  | jsdom     | 277.62       | 86.22               | 86.19                         | 52.38                             |
| windows-style-live  | happy-dom | 380.06       | 145.57              | 27.49                         | 25.21                             |
| windows-style-live  | turbo-dom | 112.78       | 20.21               | 20.22                         | 16.49                             |
| parse-html-traverse | run-dom   | 162.53       | 19.60               | 19.60                         | 19.59                             |
| parse-html-traverse | jsdom     | 484.12       | 46.14               | 46.10                         | 46.03                             |
| parse-html-traverse | happy-dom | 446.81       | 25.20               | 25.20                         | 25.14                             |
| parse-html-traverse | turbo-dom | 118.67       | 16.34               | 16.35                         | 16.34                             |
| parse-html-unique   | run-dom   | 228.94       | 19.50               | 19.49                         | 19.43                             |
| parse-html-unique   | jsdom     | 484.09       | 46.09               | 46.05                         | 46.00                             |
| parse-html-unique   | happy-dom | 446.77       | 25.19               | 25.19                         | 25.14                             |
| parse-html-unique   | turbo-dom | 131.88       | 22.39               | 22.39                         | 22.34                             |

The next experiment opened all 130 Readability inputs, removed their document contents, then closed and released the windows. Each measurement followed three event-loop turns and forced collections. [Document lifetime measurements](../.cache/parser-admission-caEquB/retention.jsonl) · [Four-provider laboratory memory replay](../.cache/parser-admission-caEquB/final-memory.json)

| RunDOM package          | Empty windows held, heap MiB | Closed windows held, heap MiB | References released, heap MiB |
| ----------------------- | ---------------------------- | ----------------------------- | ----------------------------- |
| Before literal scanning | 81.79                        | 81.55                         | 23.37                         |
| Literal spans           | 81.83                        | 81.58                         | 23.41                         |
| Literal spans and tags  | 81.88                        | 81.64                         | 23.46                         |

## Compatibility of the wider Jest screens

Drone’s additional Strings test renders an error span with a CSS variable as its color. Its snapshot expects the style attribute to be absent. In a separate public CSSOM check, Chromium 156.0.8078.4 returned 'color: var(--red-500);', RunDOM returned 'color: var(--red-500);', and Drone’s installed jsdom returned no attribute. The snapshot failure remains in the compatibility totals. [Browser and project-provider results](../.cache/upstream-scanner-ZoQ9Li/drone-style.json)

The wider React replay had these failing named cases. The two propagation cases invoke React’s internal event-dispatch helper. The invalid-listener expectation checks the number of console calls. [Four-file React assertions and stacks](../.cache/upstream-scanner-ZoQ9Li/jest-providers/native-react-4-rundom-0.json)

- ReactDOMEventListener Propagation should batch between handlers from different roots (discrete)
- ReactDOMEventListener Propagation should batch between handlers from different roots (continuous)
- InvalidEventListeners should prevent non-function listeners, at dispatch

## Cold CSS longhand assignment

A public API probe reproduced the Vue operation sequence in nine fresh Node processes per provider. It recorded time for individual synchronous operations, verified width, height, display and priority, then repeated the sequence on 100 fresh elements. This probe uses the laboratory jsdom 30.1.3. The upstream Vue runner used its own jsdom 30.0.1. [Per-stage timings and serialization](../.cache/parser-admission-caEquB/inline-baseline.jsonl)

| Provider  | Create element ms | Access style ms | First width write ms | Height write ms | Display write ms | 100 warm sequences ms |
| --------- | ----------------- | --------------- | -------------------- | --------------- | ---------------- | --------------------- |
| rundom    | 0.309             | 0.583           | 22.045               | 0.266           | 0.470            | 5.22                  |
| jsdom     | 0.263             | 0.038           | 2.417                | 0.236           | 0.414            | 3.56                  |
| happy-dom | 0.068             | 0.042           | 0.735                | 0.169           | 0.046            | 4.05                  |
| turbo-dom | 0.087             | 0.054           | 0.798                | 0.077           | 0.046            | 4.57                  |

## Autocomplete allocation volume

The separate Inspector trials sampled allocations from worker setup through the last assertion, including objects later collected by either major or minor GC. Allocation volume estimates cover V8 heap allocations. RSS and physical heap columns come from the independent ten-file worker diagnostic on entry to teardown. The high-water RSS gap persists even though RunDOM allocates fewer total sampled bytes and has fewer live heap bytes at teardown. These checkpoints leave part of process RSS unattributed. [Allocation profiles summarized by stack](../.cache/upstream-scanner-ZoQ9Li/mui-allocation/summary.json) · [Independent RSS and heap-space observations](../.cache/upstream-scanner-ZoQ9Li/mui-workers/)

| Provider | Passing tests | Allocation round 1 GiB | Allocation round 2 GiB | RSS MiB | Physical V8 heap MiB | Used V8 heap MiB | Peak V8 malloc MiB |
| -------- | ------------- | ---------------------- | ---------------------- | ------- | -------------------- | ---------------- | ------------------ |
| rundom   | 348           | 2.84                   | 2.83                   | 558.2   | 423.0                | 194.3            | 32.1               |
| jsdom    | 348           | 4.84                   | 4.83                   | 521.2   | 416.7                | 297.1            | 22.8               |
