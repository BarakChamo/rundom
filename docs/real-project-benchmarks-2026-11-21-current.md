# Real-project benchmarks on the November 21 RunDOM build

Node v24.20.0 on Apple M4 with the TypeScript HTML parser. The run used the same 11 upstream checkouts and test-file hashes as the preceding replay. Each project used its installed jsdom version. Happy DOM was 21.0.4 and TurboDOM was 0.7.1. The RunDOM package was frozen at 2026-11-21T02:04:47.518Z. [Build hashes and versions](../.cache/upstream-latest-Lfny8J/cohort.json) · [Upstream sources and jsdom versions](../.cache/upstream-latest-Lfny8J/upstream-manifest.json)

RunDOM finished faster than jsdom on **10 of 10** primary selections with identical named outcomes and successful exits. Scully uses a guarded teardown. The broad Svelte selection passed 6,012 and failed 90 with RunDOM.

On 42 articles where all four providers returned the same fields and content trees, constructing the documents took 111 ms with RunDOM and 16 ms with TurboDOM. Article extraction took 136 ms and 81 ms, respectively. On the complete 130-page input, RunDOM reproduced all 130 of jsdom’s content trees and all non-content fields. TurboDOM reproduced 42 such results across the four-way common set.

## Upstream results

Times are median end-to-end seconds. Parentheses denote incomplete or unequal work compared with jsdom. Each provider ran in its own process with one test worker. Provider execution order rotated. Each successful provider ran three times when at least two providers completed that selection. A failed screen ran once. Supabase means the UI package, Next.js means its Vitest example, and freeCodeCamp means two client test files. The last four rows overlap the primary selections.

| Selection                             | RunDOM s | jsdom s | Happy DOM s | TurboDOM s | jsdom / RunDOM | Peak RSS difference vs jsdom, MiB |
| ------------------------------------- | -------- | ------- | ----------- | ---------- | -------------- | --------------------------------- |
| Mozilla Readability, 130 pages        | 4.38     | 9.42    | (5.40)      | (4.25)     | 2.15×          | -208                              |
| Material UI, 10 files                 | 16.34    | 21.63   | (26.16)     | (23.58)    | 1.32×          | +27                               |
| Ant Design, 8 files                   | 4.99     | 6.60    | (5.65)      | (4.50)     | 1.32×          | -12                               |
| Vue runtime-dom                       | 2.59     | 6.28    | (3.57)      | (2.23)     | 2.42×          | -117                              |
| Svelte runes, legacy and motion       | (29.85)  | 33.00   | (30.29)     | (5.05)     | incomplete     | —                                 |
| React DOM, 2 files                    | 4.30     | 4.95    | (4.35)      | (4.25)     | 1.15×          | +0                                |
| Drone UI, 1 file                      | 3.50     | 4.25    | 3.68        | (2.98)     | 1.21×          | -8                                |
| Scully, 3 files (teardown guard¹)     | 1.06     | 1.25    | (0.75)      | 1.05       | 1.18×          | +12                               |
| Supabase UI                           | 3.96     | 7.75    | (4.64)      | (4.59)     | 1.96×          | -112                              |
| Next.js Vitest example                | 0.96     | 1.65    | 1.29        | 0.90       | 1.72×          | -8                                |
| freeCodeCamp, 2 files                 | 0.98     | 1.31    | 1.11        | 0.96       | 1.34×          | -21                               |
| Material UI, original 5 files         | 7.58     | 9.81    | (8.99)      | (4.57)     | 1.29×          | -50                               |
| Svelte runes, first shard             | 5.82     | 6.21    | (5.77)      | (0.80)     | 1.07×          | +24                               |
| Svelte motion                         | 0.83     | 0.94    | 0.95        | (0.67)     | 1.13×          | +4                                |
| Scully globals only (teardown guard¹) | 0.90     | 1.10    | (0.94)      | 0.89       | 1.22×          | +7                                |

## Compatibility

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

Scully’s original Jest 27 teardown redefines Window.document. The timed rows guard the same call for RunDOM and jsdom. The fresh unguarded runs produced RunDOM 0 / 0 / 0 + 3 files, jsdom 8 / 0 / 0. [Jest reports and provider traces](../.cache/upstream-latest-Lfny8J/jest-providers/)

The broad Svelte run reproduced the preceding replay’s exact test outcomes. In that replay, the 90 failing DOM and hydration variants also failed in Google Chrome for Testing 156.0.8078.4, and 86 had identical failure details to RunDOM. Stock jsdom passed all 90 in that diagnostic. The browser evidence comes from the earlier run. [Browser comparison](../.cache/upstream-goal-1BQdRb/svelte-browser-summary.json)

## Timing and memory on identical work

Cells show process seconds / test seconds / peak RSS MiB. Filtered comparisons require the exact multiset of named passing tests in each of three trials. Readability uses complete pages. The dash means that provider failed qualification. Peak RSS is the operating system’s process high-water measurement for the command. It does not sum concurrent workers.

| Selection                             | Cases | RunDOM            | jsdom             | Happy DOM         | TurboDOM          |
| ------------------------------------- | ----- | ----------------- | ----------------- | ----------------- | ----------------- |
| Vue runtime-dom                       | 159   | 1.98 / 0.22 / 334 | 4.87 / 0.20 / 474 | 2.78 / 0.16 / 330 | 1.79 / 0.15 / 304 |
| Ant Design, 8 files                   | 116   | 4.92 / 1.00 / 599 | 6.20 / 1.11 / 607 | 5.17 / 0.88 / 587 | 4.42 / 0.76 / 563 |
| Material UI Button and TextField      | 118   | 1.85 / 0.49 / 308 | 2.39 / 0.64 / 310 | 1.88 / 0.40 / 310 | 1.63 / 0.31 / 309 |
| Material UI common subset             | 161   | 2.39 / 0.73 / 312 | 3.16 / 0.96 / 310 | 2.42 / 0.61 / 313 | —                 |
| Supabase UI                           | 80    | 3.86 / 0.77 / 197 | 7.30 / 1.45 / 309 | 4.55 / 0.48 / 177 | 3.49 / 0.51 / 157 |
| Svelte runes, first shard             | 561   | 5.72 / 4.70 / 366 | 6.10 / 4.88 / 342 | 5.80 / 4.66 / 366 | —                 |
| React DOM, 2 files                    | 61    | 4.26 / 3.28 / 814 | 4.50 / 3.31 / 891 | 4.38 / 3.25 / 834 | 4.29 / 3.28 / 819 |
| Mozilla Readability, 44 shared pages  | 281   | 0.69 / 0.54 / 433 | 1.23 / 1.00 / 497 | 0.76 / 0.55 / 460 | 0.44 / 0.31 / 301 |
| Next.js Vitest example                | 5     | 0.96 / 0.06 / 145 | 1.65 / 0.11 / 153 | 1.29 / 0.04 / 123 | 0.90 / 0.04 / 116 |
| freeCodeCamp, 2 files                 | 4     | 0.98 / 0.05 / 164 | 1.31 / 0.08 / 185 | 1.11 / 0.04 / 177 | 0.96 / 0.03 / 152 |
| Svelte motion                         | 8     | 0.83 / 0.00 / 186 | 0.94 / 0.00 / 182 | 0.95 / 0.00 / 183 | —                 |
| Drone UI, 1 file                      | 1     | 3.50 / 0.69 / 638 | 4.25 / 0.74 / 646 | 3.68 / 0.70 / 649 | —                 |
| Scully globals only (teardown guard¹) | 5     | 0.90 / 0.00 / 438 | 1.10 / 0.00 / 431 | —                 | 0.89 / 0.00 / 404 |

| Four-way selection                         | Lowest elapsed median | RunDOM above lowest, ms | RunDOM peak minus lowest-time provider, MiB |
| ------------------------------------------ | --------------------- | ----------------------- | ------------------------------------------- |
| Vue runtime-dom (159)                      | TurboDOM              | 190                     | +31                                         |
| Ant Design, 8 files (116)                  | TurboDOM              | 500                     | +35                                         |
| Material UI Button and TextField (118)     | TurboDOM              | 220                     | -1                                          |
| Supabase UI (80)                           | TurboDOM              | 370                     | +40                                         |
| React DOM, 2 files (61)                    | RunDOM                | 0                       | +0                                          |
| Mozilla Readability, 44 shared pages (281) | TurboDOM              | 250                     | +132                                        |
| Next.js Vitest example (5)                 | TurboDOM              | 60                      | +29                                         |
| freeCodeCamp, 2 files (4)                  | TurboDOM              | 20                      | +12                                         |

Each pair below uses matching repetition numbers from the rotated runs. The process clock reports hundredths of a second. On short workloads, margins of that size can change with the run order.

| Selection                                  | RunDOM minus TurboDOM per round, ms | RunDOM faster | Ties | TurboDOM faster |
| ------------------------------------------ | ----------------------------------- | ------------- | ---- | --------------- |
| Vue runtime-dom (159)                      | +220 / +180 / +200                  | 0             | 0    | 3               |
| Ant Design, 8 files (116)                  | +540 / +500 / +430                  | 0             | 0    | 3               |
| Material UI Button and TextField (118)     | +220 / +210 / +210                  | 0             | 0    | 3               |
| Supabase UI (80)                           | +370 / +380 / +370                  | 0             | 0    | 3               |
| React DOM, 2 files (61)                    | +60 / -80 / -30                     | 2             | 0    | 1               |
| Mozilla Readability, 44 shared pages (281) | +240 / +240 / +250                  | 0             | 0    | 3               |
| Next.js Vitest example (5)                 | +190 / +60 / -50                    | 1             | 0    | 2               |
| freeCodeCamp, 2 files (4)                  | +40 / -260 / +30                    | 1             | 0    | 2               |

## Where RunDOM still loses on identical work

A positive delta means RunDOM took longer or used more peak memory than the named provider. These comparisons use the shared four-provider selections when all three rounds qualify. Each selection is listed once per comparison provider. The full upstream pass counts above give the coverage context.

| Selection                                  | Comparison | Process delta ms | Test delta ms | Peak RSS delta MiB |
| ------------------------------------------ | ---------- | ---------------- | ------------- | ------------------ |
| Vue runtime-dom (159)                      | jsdom      | -2890            | +20           | -139               |
| Vue runtime-dom (159)                      | Happy DOM  | -800             | +60           | +5                 |
| Vue runtime-dom (159)                      | TurboDOM   | +190             | +62           | +31                |
| Ant Design, 8 files (116)                  | jsdom      | -1280            | -109          | -9                 |
| Ant Design, 8 files (116)                  | Happy DOM  | -250             | +126          | +12                |
| Ant Design, 8 files (116)                  | TurboDOM   | +500             | +241          | +35                |
| Material UI Button and TextField (118)     | jsdom      | -540             | -148          | -2                 |
| Material UI Button and TextField (118)     | Happy DOM  | -30              | +95           | -2                 |
| Material UI Button and TextField (118)     | TurboDOM   | +220             | +180          | -1                 |
| Supabase UI (80)                           | jsdom      | -3440            | -679          | -112               |
| Supabase UI (80)                           | Happy DOM  | -690             | +285          | +20                |
| Supabase UI (80)                           | TurboDOM   | +370             | +260          | +40                |
| React DOM, 2 files (61)                    | jsdom      | -240             | -26           | -77                |
| React DOM, 2 files (61)                    | Happy DOM  | -120             | +27           | -20                |
| React DOM, 2 files (61)                    | TurboDOM   | -30              | -1            | -5                 |
| Mozilla Readability, 44 shared pages (281) | jsdom      | -540             | -455          | -64                |
| Mozilla Readability, 44 shared pages (281) | Happy DOM  | -70              | -6            | -27                |
| Mozilla Readability, 44 shared pages (281) | TurboDOM   | +250             | +233          | +132               |
| Next.js Vitest example (5)                 | jsdom      | -690             | -51           | -8                 |
| Next.js Vitest example (5)                 | Happy DOM  | -330             | +20           | +21                |
| Next.js Vitest example (5)                 | TurboDOM   | +60              | +28           | +29                |
| freeCodeCamp, 2 files (4)                  | jsdom      | -330             | -21           | -21                |
| freeCodeCamp, 2 files (4)                  | Happy DOM  | -130             | +17           | -13                |
| freeCodeCamp, 2 files (4)                  | TurboDOM   | +20              | +23           | +12                |

## Broad runner phases and CPU

The first table reports median end-to-end seconds, test seconds and peak RSS MiB for every attempt, including partial executions. Test time is the sum of named test durations for Vitest and Jest, and suite duration for Mocha. The second table gives total user and system CPU seconds. Vitest stage measurements come from the trial nearest each provider’s elapsed median. Jest and Mocha do not emit the same stage breakdown.

| Selection                             | RunDOM              | jsdom               | Happy DOM           | TurboDOM            |
| ------------------------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| Mozilla Readability, 130 pages        | 4.38 / 4.20 / 1220  | 9.42 / 8.99 / 1428  | 5.40 / 5.07 / 1762  | 4.25 / 4.11 / 433   |
| Material UI, 10 files                 | 16.34 / 12.76 / 589 | 21.63 / 15.93 / 562 | 26.16 / 21.92 / 594 | 23.58 / 16.68 / 440 |
| Ant Design, 8 files                   | 4.99 / 1.11 / 598   | 6.60 / 1.22 / 609   | 5.65 / 0.97 / 590   | 4.50 / 0.86 / 586   |
| Vue runtime-dom                       | 2.59 / 0.38 / 398   | 6.28 / 0.38 / 515   | 3.57 / 0.27 / 390   | 2.23 / 0.19 / 342   |
| Svelte runes, legacy and motion       | 29.85 / 22.77 / 576 | 33.00 / 24.77 / 548 | 30.29 / 22.50 / 557 | 5.05 / 0.00 / 423   |
| React DOM, 2 files                    | 4.30 / 3.32 / 847   | 4.95 / 3.33 / 847   | 4.35 / 3.28 / 828   | 4.25 / 3.26 / 757   |
| Drone UI, 1 file                      | 3.50 / 0.69 / 638   | 4.25 / 0.74 / 646   | 3.68 / 0.70 / 649   | 2.98 / 0.04 / 628   |
| Scully, 3 files (teardown guard¹)     | 1.06 / 0.00 / 480   | 1.25 / 0.00 / 468   | 0.75 / 0.00 / 413   | 1.05 / 0.00 / 475   |
| Supabase UI                           | 3.96 / 0.88 / 197   | 7.75 / 1.65 / 309   | 4.64 / 0.58 / 178   | 4.59 / 1.56 / 158   |
| Next.js Vitest example                | 0.96 / 0.06 / 145   | 1.65 / 0.11 / 153   | 1.29 / 0.04 / 123   | 0.90 / 0.04 / 116   |
| freeCodeCamp, 2 files                 | 0.98 / 0.05 / 164   | 1.31 / 0.08 / 185   | 1.11 / 0.04 / 177   | 0.96 / 0.03 / 152   |
| Material UI, original 5 files         | 7.58 / 5.42 / 328   | 9.81 / 6.37 / 378   | 8.99 / 6.42 / 482   | 4.57 / 0.89 / 404   |
| Svelte runes, first shard             | 5.82 / 4.76 / 366   | 6.21 / 4.94 / 341   | 5.77 / 4.70 / 366   | 0.80 / 0.00 / 187   |
| Svelte motion                         | 0.83 / 0.00 / 186   | 0.94 / 0.00 / 182   | 0.95 / 0.00 / 183   | 0.67 / 0.00 / 178   |
| Scully globals only (teardown guard¹) | 0.90 / 0.00 / 438   | 1.10 / 0.00 / 431   | 0.94 / 0.00 / 398   | 0.89 / 0.00 / 404   |

| Selection                             | RunDOM CPU s | jsdom CPU s | Happy DOM CPU s | TurboDOM CPU s |
| ------------------------------------- | ------------ | ----------- | --------------- | -------------- |
| Mozilla Readability, 130 pages        | 6.46         | 12.52       | 7.73            | 1.58           |
| Material UI, 10 files                 | 16.87        | 23.24       | 20.25           | 23.01          |
| Ant Design, 8 files                   | 8.02         | 9.38        | 8.08            | 7.20           |
| Vue runtime-dom                       | 3.40         | 8.10        | 4.63            | 2.90           |
| Svelte runes, legacy and motion       | 31.56        | 35.06       | 31.30           | 6.35           |
| React DOM, 2 files                    | 5.94         | 6.20        | 6.05            | 5.88           |
| Drone UI, 1 file                      | 4.59         | 4.85        | 4.74            | 4.37           |
| Scully, 3 files (teardown guard¹)     | 1.73         | 1.86        | 1.16            | 1.69           |
| Supabase UI                           | 5.25         | 9.96        | 5.80            | 4.78           |
| Next.js Vitest example                | 1.21         | 1.88        | 1.55            | 1.10           |
| freeCodeCamp, 2 files                 | 1.39         | 1.65        | 1.47            | 1.30           |
| Material UI, original 5 files         | 7.27         | 10.08       | 7.64            | 5.92           |
| Svelte runes, first shard             | 4.10         | 4.48        | 4.10            | 1.06           |
| Svelte motion                         | 1.12         | 1.23        | 1.17            | 0.92           |
| Scully globals only (teardown guard¹) | 1.41         | 1.54        | 1.17            | 1.37           |

| Selection                       | Provider  | Vitest stages                                                                                   |
| ------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| Material UI, 10 files           | RunDOM    | 15.99s (tests 83%, import 7%, transform 6%, setup 3%, environment 2%)                           |
| Material UI, 10 files           | jsdom     | 21.20s (tests 77%, environment 11%, import 5%, transform 4%, setup 2%)                          |
| Material UI, 10 files           | Happy DOM | 25.78s (tests 87%, import 4%, environment 4%, transform 3%, setup 2%)                           |
| Material UI, 10 files           | TurboDOM  | 23.10s (tests 88%, import 5%, transform 5%, setup 2%)                                           |
| Ant Design, 8 files             | RunDOM    | 4.84s (transform 47%, tests 25%, setup 20%, import 4%, environment 4%)                          |
| Ant Design, 8 files             | jsdom     | 6.40s (transform 36%, environment 25%, tests 20%, setup 13%, import 6%)                         |
| Ant Design, 8 files             | Happy DOM | 5.43s (transform 44%, tests 19%, setup 16%, environment 14%, import 8%)                         |
| Ant Design, 8 files             | TurboDOM  | 4.35s (transform 54%, tests 22%, setup 18%, import 5%)                                          |
| Vue runtime-dom                 | RunDOM    | 2.42s (transform 296ms, setup 34ms, import 852ms, tests 395ms, environment 396ms)               |
| Vue runtime-dom                 | jsdom     | 6.11s (transform 302ms, setup 72ms, import 862ms, tests 394ms, environment 4.05s)               |
| Vue runtime-dom                 | Happy DOM | 3.39s (transform 307ms, setup 35ms, import 877ms, tests 275ms, environment 1.46s)               |
| Vue runtime-dom                 | TurboDOM  | 2.00s (transform 262ms, setup 36ms, import 619ms, tests 194ms, environment 21ms)                |
| Svelte runes, legacy and motion | RunDOM    | 29.30s (transform 7.34s, setup 0ms, import 5.72s, tests 22.80s, environment 217ms)              |
| Svelte runes, legacy and motion | jsdom     | 32.45s (transform 7.49s, setup 0ms, import 5.89s, tests 24.80s, environment 1.22s)              |
| Svelte runes, legacy and motion | Happy DOM | 29.69s (transform 7.43s, setup 0ms, import 5.75s, tests 22.54s, environment 853ms)              |
| Svelte runes, legacy and motion | TurboDOM  | 4.79s (transform 2.74s, setup 0ms, import 0ms, tests 0ms, environment 20ms)                     |
| Supabase UI                     | RunDOM    | 3.83s (tests 29%, import 28%, setup 27%, environment 11%, transform 4%, worker 1%)              |
| Supabase UI                     | jsdom     | 7.56s (environment 47%, tests 24%, import 15%, setup 12%, transform 2%)                         |
| Supabase UI                     | Happy DOM | 4.51s (environment 36%, import 24%, setup 21%, tests 16%, transform 3%, worker 1%)              |
| Supabase UI                     | TurboDOM  | 4.45s (tests 46%, import 25%, setup 24%, transform 4%, environment 1%, worker 1%)               |
| Next.js Vitest example          | RunDOM    | 761ms (transform 44ms, setup 0ms, collect 191ms, tests 66ms, environment 84ms, prepare 102ms)   |
| Next.js Vitest example          | jsdom     | 1.45s (transform 44ms, setup 0ms, collect 182ms, tests 116ms, environment 717ms, prepare 103ms) |
| Next.js Vitest example          | Happy DOM | 1.07s (transform 43ms, setup 0ms, collect 188ms, tests 46ms, environment 403ms, prepare 102ms)  |
| Next.js Vitest example          | TurboDOM  | 690ms (transform 44ms, setup 0ms, collect 189ms, tests 37ms, environment 8ms, prepare 105ms)    |
| freeCodeCamp, 2 files           | RunDOM    | 784ms (transform 176ms, setup 161ms, import 405ms, tests 56ms, environment 47ms)                |
| freeCodeCamp, 2 files           | jsdom     | 1.11s (transform 170ms, setup 153ms, import 389ms, tests 77ms, environment 368ms)               |
| freeCodeCamp, 2 files           | Happy DOM | 884ms (transform 167ms, setup 164ms, import 377ms, tests 40ms, environment 187ms)               |
| freeCodeCamp, 2 files           | TurboDOM  | 731ms (transform 171ms, setup 165ms, import 382ms, tests 32ms, environment 4ms)                 |
| Material UI, original 5 files   | RunDOM    | 7.24s (tests 78%, transform 9%, import 8%, setup 3%, environment 2%)                            |
| Material UI, original 5 files   | jsdom     | 9.37s (tests 70%, environment 14%, transform 8%, import 6%, setup 3%)                           |
| Material UI, original 5 files   | Happy DOM | 8.64s (tests 77%, transform 8%, environment 7%, import 6%, setup 3%)                            |
| Material UI, original 5 files   | TurboDOM  | 4.08s (tests 37%, transform 29%, import 22%, setup 11%)                                         |
| Svelte runes, first shard       | RunDOM    | 5.62s (transform 1.12s, setup 0ms, import 763ms, tests 4.76s, environment 28ms)                 |
| Svelte runes, first shard       | jsdom     | 5.99s (transform 1.08s, setup 0ms, import 786ms, tests 4.92s, environment 211ms)                |
| Svelte runes, first shard       | Happy DOM | 5.58s (transform 1.10s, setup 0ms, import 718ms, tests 4.70s, environment 92ms)                 |
| Svelte runes, first shard       | TurboDOM  | 608ms (transform 359ms, setup 0ms, import 0ms, tests 0ms, environment 5ms)                      |
| Svelte motion                   | RunDOM    | 623ms (transform 365ms, setup 0ms, import 540ms, tests 2ms, environment 23ms)                   |
| Svelte motion                   | jsdom     | 737ms (transform 379ms, setup 0ms, import 546ms, tests 2ms, environment 132ms)                  |
| Svelte motion                   | Happy DOM | 743ms (transform 373ms, setup 0ms, import 543ms, tests 3ms, environment 140ms)                  |
| Svelte motion                   | TurboDOM  | 466ms (transform 261ms, setup 0ms, import 0ms, tests 0ms, environment 2ms)                      |

Per-run peak RSS shows how much the high-water mark varies between fresh processes. Each pair of columns covers all three runs, in execution-round order.

| Selection                      | RunDOM peaks MiB  | jsdom peaks MiB    |
| ------------------------------ | ----------------- | ------------------ |
| Mozilla Readability, 130 pages | 741 / 1274 / 1220 | 1428 / 1443 / 1384 |
| Material UI, 10 files          | 598 / 588 / 589   | 520 / 562 / 593    |
| Ant Design, 8 files            | 598 / 598 / 593   | 609 / 610 / 609    |
| Vue runtime-dom                | 402 / 398 / 391   | 513 / 515 / 515    |
| React DOM, 2 files             | 847 / 847 / 844   | 849 / 846 / 847    |

## Change from the preceding replay

Ranges cover all three latest runs. The jsdom control change shows movement between batches with unchanged reference software. A small difference between batches is weak evidence for an implementation effect. [Trial summary and report filenames](../.cache/upstream-latest-Lfny8J/summary.json)

| Selection                             | Previous RunDOM s | Latest RunDOM s | Latest RunDOM range s | Latest jsdom range s | jsdom control change |
| ------------------------------------- | ----------------- | --------------- | --------------------- | -------------------- | -------------------- |
| Mozilla Readability, 130 pages        | 4.52              | 4.38            | 4.36–4.64             | 9.33–9.46            | -0.4%                |
| Material UI, 10 files                 | 16.60             | 16.34           | 16.34–16.48           | 21.53–21.72          | -1.6%                |
| Ant Design, 8 files                   | 5.10              | 4.99            | 4.98–5.04             | 6.30–6.64            | -0.3%                |
| Vue runtime-dom                       | 2.67              | 2.59            | 2.59–2.66             | 6.27–6.37            | -1.6%                |
| React DOM, 2 files                    | 4.52              | 4.30            | 4.28–4.82             | 4.47–4.96            | -1.4%                |
| Drone UI, 1 file                      | 3.48              | 3.50            | 3.47–3.53             | 3.75–4.26            | -0.2%                |
| Scully, 3 files (teardown guard¹)     | 1.08              | 1.06            | 1.05–1.44             | 1.23–1.57            | -3.8%                |
| Supabase UI                           | 4.00              | 3.96            | 3.94–4.07             | 7.59–7.82            | -0.9%                |
| Next.js Vitest example                | 0.97              | 0.96            | 0.95–1.09             | 1.64–1.66            | -0.6%                |
| freeCodeCamp, 2 files                 | 0.98              | 0.98            | 0.97–0.99             | 1.30–1.64            | -1.5%                |
| Material UI, original 5 files         | 7.72              | 7.58            | 7.56–7.84             | 9.68–9.83            | -0.1%                |
| Svelte runes, first shard             | 5.79              | 5.82            | 5.74–5.89             | 6.15–6.27            | -0.8%                |
| Svelte motion                         | 0.84              | 0.83            | 0.82–0.83             | 0.92–1.03            | +1.1%                |
| Scully globals only (teardown guard¹) | 0.91              | 0.90            | 0.90–0.91             | 1.09–1.33            | +0.0%                |

## Readability application

This benchmark opens, extracts and closes 130 documents and hashes the articles. Heap values are sampled after forced GC at the end of the synchronous batch and after an event-loop turn. All four providers attempted three full replays.

| Provider  | Complete trials | Construct s | Extract s | Close ms | Process s | Peak MiB | Same-turn heap MiB | Next-turn heap MiB |
| --------- | --------------- | ----------- | --------- | -------- | --------- | -------- | ------------------ | ------------------ |
| RunDOM    | 3               | 0.91        | 1.28      | 1.20     | 2.39      | 675      | 61.41              | 47.62              |
| jsdom     | 3               | 3.14        | 2.39      | 36.13    | 5.95      | 1316     | 717.52             | 167.77             |
| Happy DOM | 0               | —           | —         | —        | —         | —        | —                  | —                  |
| TurboDOM  | 0               | —           | —         | —        | —         | —        | —                  | —                  |

RunDOM and jsdom differed on 5 serialized articles. Independent parsing found 0 differences in the resulting trees. [Per-article differences](../.cache/upstream-latest-Lfny8J/output-equivalence.json) · [Application exit codes and matched test identities](../.cache/upstream-latest-Lfny8J/matches.jsonl)

## React and Testing Library supplemental workloads

Each eligible cell summarizes nine fresh Vitest processes exercising the same React and Testing Library fixture. Cells give process seconds / test seconds / worker RSS MiB. RSS here is sampled at suite end. These fixtures supplement upstream React’s two Jest files.

| Fixture      | Worker pool | RunDOM            | jsdom             | Happy DOM         | TurboDOM   |
| ------------ | ----------- | ----------------- | ----------------- | ----------------- | ---------- |
| 8 workflows  | forks       | 0.39 / 0.12 / 140 | 0.61 / 0.14 / 215 | 0.43 / 0.10 / 123 | incomplete |
| 8 workflows  | threads     | 0.38 / 0.12 / 194 | 0.58 / 0.14 / 242 | 0.41 / 0.10 / 181 | incomplete |
| 8 workflows  | vmForks     | 0.44 / 0.14 / 150 | 0.61 / 0.14 / 205 | 0.44 / 0.10 / 138 | incomplete |
| 8 workflows  | vmThreads   | 0.42 / 0.14 / 202 | 0.59 / 0.14 / 254 | 0.43 / 0.10 / 189 | incomplete |
| 10 workflows | forks       | 0.80 / 0.41 / 261 | 1.35 / 0.58 / 332 | incomplete        | incomplete |
| 10 workflows | threads     | 0.76 / 0.41 / 293 | 1.32 / 0.60 / 382 | incomplete        | incomplete |
| 10 workflows | vmForks     | 0.74 / 0.41 / 299 | 1.06 / 0.57 / 344 | incomplete        | incomplete |
| 10 workflows | vmThreads   | 0.73 / 0.41 / 369 | 1.05 / 0.57 / 394 | incomplete        | incomplete |

[Eight-workflow trials and failures](../.cache/upstream-latest-Lfny8J/react-standard.json) · [Ten-workflow trials and failures](../.cache/upstream-latest-Lfny8J/react-integration.json)

## Retained document memory

A separate lifetime measurement holds the original 130 Readability windows after removing their document contents. Values give MiB of live V8 heap after three GC turns, with three fresh processes per row. The original article extraction and test runners above perform their own normal lifecycles.

| 130 documents                                  | Package                | Window held | Closed Window held | All windows dropped |
| ---------------------------------------------- | ---------------------- | ----------- | ------------------ | ------------------- |
| After document replacement                     | Previous constructor   | 268.51      | 268.41             | 27.03               |
| After document replacement                     | Source retention fixed | 221.20      | 221.10             | 26.17               |
| After replacement and one stylesheet-list read | Source retention fixed | 83.38       | 83.13              | 23.38               |

[Individual lifetime measurements](../.cache/upstream-latest-Lfny8J/retention.jsonl)

## Which tests dominate

The longest component files below are ranked by summed upstream test duration on RunDOM. Each value is the median of three complete runs. The React row measures the case that previously formatted an internal CSS parser error stack.

| Project     | File or case                                                | RunDOM ms | jsdom ms | Difference ms |
| ----------- | ----------------------------------------------------------- | --------- | -------- | ------------- |
| Material UI | packages/mui-material/src/Autocomplete/Autocomplete.test.js | 4859      | 6859     | -1999         |
| Material UI | packages/mui-material/src/Select/Select.test.js             | 4191      | 4800     | -609          |
| Material UI | packages/mui-material/src/Tabs/Tabs.test.js                 | 1111      | 1273     | -162          |
| Material UI | packages/mui-material/src/Tooltip/Tooltip.test.js           | 916       | 1022     | -105          |
| Material UI | packages/mui-material/src/TextField/TextField.test.js       | 394       | 517      | -123          |
| Ant Design  | components/radio/**tests**/group.test.tsx                   | 231       | 260      | -29           |
| Ant Design  | components/alert/**tests**/index.test.tsx                   | 223       | 218      | 5             |
| Ant Design  | components/checkbox/**tests**/group.test.tsx                | 212       | 235      | -22           |
| Ant Design  | components/radio/**tests**/radio.test.tsx                   | 150       | 165      | -15           |
| Ant Design  | components/checkbox/**tests**/checkbox.test.tsx             | 92        | 108      | -15           |
| React DOM   | should warn about style having a trailing semicolon         | 2         | 1        | 1             |

## Material UI peak and retained heap

These diagnostic runs use the same ten Material UI files and 1,087 active tests. Each fork records its peak RSS and V8 heap before teardown, then measures live heap after environment disposal and two turns of garbage collection. The measurements include the application and runner. Sorting by RunDOM worker peak keeps the highest-memory file visible.

| Worker       | RunDOM peak / used / retained MiB | jsdom peak / used / retained MiB |
| ------------ | --------------------------------- | -------------------------------- |
| Autocomplete | 586.2 / 120.0 / 91.0              | 527.0 / 309.8 / 110.9            |
| Select       | 344.8 / 102.8 / 71.7              | 350.0 / 118.6 / 89.4             |
| Tabs         | 316.1 / 119.2 / 60.1              | 325.1 / 127.8 / 79.7             |
| TextField    | 281.8 / 136.3 / 59.3              | 318.8 / 110.3 / 79.1             |
| Tooltip      | 275.0 / 98.3 / 53.8               | 296.9 / 96.4 / 73.7              |
| Menu         | 233.1 / 73.2 / 55.1               | 289.3 / 129.8 / 73.9             |
| Popover      | 227.9 / 87.4 / 56.2               | 284.6 / 96.6 / 76.0              |
| Drawer       | 214.9 / 107.3 / 51.8              | 280.7 / 103.1 / 71.5             |
| Dialog       | 212.1 / 103.5 / 52.1              | 279.6 / 126.6 / 71.5             |
| MenuList     | 187.4 / 64.1 / 51.1               | 288.3 / 106.6 / 71.0             |

[Worker samples, runner logs and test outcomes](../.cache/upstream-latest-Lfny8J/mui-workers/)

## Stylesheet lifetime fix

A stale stylesheet-discovery result kept a sheet owner reachable after its subtree was removed. The old stylesheet owner in turn referenced the detached tree. The current build releases the cached membership as soon as its revision changes. The regression test retains the document and its live stylesheet list across garbage collection.

| Parser     | 130 cleared Readability documents | Live windows MiB | Closed windows retained MiB | All windows dropped MiB |
| ---------- | --------------------------------- | ---------------- | --------------------------- | ----------------------- |
| typescript | Before the stylesheet fix         | 221.2            | 221.1                       | 26.2                    |
| typescript | Measured build                    | 81.8             | 81.5                        | 23.4                    |
| rust       | Before the stylesheet fix         | 213.6            | 213.5                       | 27.2                    |
| rust       | Measured build                    | 84.4             | 84.1                        | 24.4                    |

[Paired measurements](../.cache/upstream-latest-Lfny8J/memory-final.jsonl) · [Detached owner collection](../.cache/upstream-latest-Lfny8J/owner-lifetime.jsonl)

## Local and upstream compatibility checks

The repository gate passed all 15 tasks, including 1,636 jsdom facade tests. The upstream jsdom API suite passed 634 tests under each parser. The focused WPT replay covers selectors, adoption, frames and stylesheet template adoption. Outcome changes below are relative to the baseline frozen before this optimization campaign.

| Parser     | Assertion and harness outcomes checked | Changed outcomes | Mocha files passed / failed / pending |
| ---------- | -------------------------------------- | ---------------- | ------------------------------------- |
| typescript | 608                                    | 1                | 76 / 3 / 72                           |
| rust       | 608                                    | 1                | 76 / 3 / 72                           |

The single change per parser was an improvement in stylesheet adoption into and out of a template. The preceding benchmark build already had that improvement. All 608 outcomes remained identical to that build. The Mocha pass/fail counts include expected-failure wrappers.

[WPT case identities and failure labels](../.cache/upstream-latest-Lfny8J/wpt-identity.json)

## Worker CPU attribution

Additional CPU profiles begin immediately after Vitest sets up the environment and stop before teardown. Each profiled file had the same named outcomes as its broad run. The table gives percentages of active V8 samples, including imports and test bodies. Stack categories overlap, and the garbage collector reports its own samples. The source archive includes the largest self-sampled DOM functions for each worker.

| File                 | Provider | Active samples | DOM stack | Computed style | Style in role/focus | Sheet installation | DOM queries | GC   |
| -------------------- | -------- | -------------- | --------- | -------------- | ------------------- | ------------------ | ----------- | ---- |
| group.test.tsx       | jsdom    | 1147           | 24.7%     | 4.0%           | 2.5%                | 9.1%               | 1.5%        | 3.1% |
| group.test.tsx       | RunDOM   | 1246           | 13.9%     | 4.9%           | 4.8%                | 4.1%               | 0.5%        | 3.0% |
| Autocomplete.test.js | jsdom    | 8445           | 55.7%     | 22.2%          | 5.6%                | 0.0%               | 2.4%        | 2.2% |
| Select.test.js       | jsdom    | 3696           | 41.7%     | 10.2%          | 7.5%                | 0.0%               | 3.0%        | 2.4% |
| Autocomplete.test.js | RunDOM   | 5702           | 38.8%     | 15.3%          | 5.7%                | 5.5%               | 0.8%        | 4.3% |
| Select.test.js       | RunDOM   | 2759           | 26.2%     | 13.0%          | 7.0%                | 4.7%               | 0.9%        | 2.8% |

[Per-worker CPU sample attribution and hot functions](../.cache/upstream-latest-Lfny8J/diagnostics/attribution.json) · [Raw profiles and outcome verification](../.cache/upstream-latest-Lfny8J/diagnostics/)

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
| RunDOM    | 110.98       | 135.52     | 0.38     | 0.36         | 274.58       | 26.66              |
| jsdom     | 234.83       | 244.33     | 3.65     | 0.67         | 362.89       | 37.32              |
| Happy DOM | 102.25       | 143.01     | 0.04     | 0.43         | 343.88       | 58.32              |
| TurboDOM  | 16.38        | 80.85      | 0.02     | 0.19         | 245.20       | 13.45              |

[Comparable stages and selected article identities](../.cache/upstream-latest-Lfny8J/shared-articles/metrics.json) · [All 520 page outcomes and raw process logs](../.cache/upstream-latest-Lfny8J/shared-articles/)

As a version control, jsdom 30.1.3 completed the same 903 Readability assertions in all three attempts. Medians were 10.22 s end to end, 9.63 s in Mocha and 1341 MiB peak RSS. The primary matrix uses the project’s own jsdom 20.0.2. [Version-control runs](../.cache/upstream-latest-Lfny8J/reference-readability.log)
