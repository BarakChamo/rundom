# Real-project benchmarks on the November 21 direct CSS lookup build

Node v24.20.0 on Apple M4 with the TypeScript HTML parser. The run used the same 11 upstream checkouts and test-file hashes as the preceding replay. Each project used its installed jsdom version. Happy DOM was 21.0.4 and TurboDOM was 0.7.1. The RunDOM package was frozen at 2026-11-21T04:58:34.948Z. [Build hashes and versions](../.cache/upstream-directcss-T9AAOL/cohort.json) · [Upstream sources and jsdom versions](../.cache/upstream-directcss-T9AAOL/upstream-manifest.json)

RunDOM finished faster than jsdom on **10 of 10** primary selections with identical named outcomes and successful exits. Scully uses a guarded teardown. The broad Svelte selection passed 6,012 and failed 90 with RunDOM.

The largest end-to-end TurboDOM lead among the matched subsets was 500 ms on Ant Design, 8 files (116 passing cases). In the broad ten-file Material UI selection RunDOM took 16.43 seconds against jsdom’s 21.64, with a median peak RSS difference of +54 MiB.

On 42 articles where all four providers returned the same fields and content trees, constructing the documents took 123 ms with RunDOM and 21 ms with TurboDOM. Article extraction took 162 ms and 101 ms, respectively. The full 130-page input and pairwise output counts are reported below.

This was a serial replay on a shared development machine. The sampled one-minute load average ranged from 2.7 to 9.7. The unchanged jsdom Svelte control took 34.34 seconds in this batch and 33.94 seconds in the preceding batch. Elapsed differences close to the run-to-run spread carry substantial uncertainty. [Timestamped host observations](../.cache/upstream-directcss-T9AAOL/host.jsonl)

This build preserves the cold inline-CSS savings and places ordinary private declaration writes back on an ordinary JavaScript prototype chain. The earlier report records the isolated candidates, including the warm inherited-style regression that prompted the correction. [Previous build and follow-up experiments](real-project-benchmarks-inline-css.md)

## Upstream results

Times are median end-to-end seconds. Parentheses denote incomplete or unequal work compared with jsdom. Each provider ran in its own process with one test worker. Provider execution order rotated. Each successful provider ran three times when at least two providers completed that selection. A failed screen ran once. Supabase means the UI package, Next.js means its Vitest example, and freeCodeCamp means two client test files. The last four rows overlap the primary selections.

| Selection                             | RunDOM s | jsdom s | Happy DOM s | TurboDOM s | jsdom / RunDOM | Peak RSS difference vs jsdom, MiB |
| ------------------------------------- | -------- | ------- | ----------- | ---------- | -------------- | --------------------------------- |
| Mozilla Readability, 130 pages        | 4.18     | 9.39    | (5.43)      | (1.74)     | 2.25×          | -267                              |
| Material UI, 10 files                 | 16.43    | 21.64   | (26.22)     | (23.46)    | 1.32×          | +54                               |
| Ant Design, 8 files                   | 4.92     | 6.56    | (5.67)      | (4.51)     | 1.33×          | -46                               |
| Vue runtime-dom                       | 2.58     | 6.30    | (3.63)      | (2.26)     | 2.44×          | -124                              |
| Svelte runes, legacy and motion       | (30.44)  | 34.34   | (30.52)     | (5.33)     | incomplete     | —                                 |
| React DOM, 2 files                    | 4.32     | 4.93    | (4.46)      | (4.34)     | 1.14×          | +3                                |
| Drone UI, 1 file                      | 3.53     | 4.26    | 3.67        | (3.01)     | 1.21×          | -13                               |
| Scully, 3 files (teardown guard¹)     | 1.07     | 1.30    | (0.80)      | 1.04       | 1.21×          | +15                               |
| Supabase UI                           | 3.92     | 7.73    | (4.66)      | (4.61)     | 1.97×          | -123                              |
| Next.js Vitest example                | 0.95     | 1.65    | 1.28        | 0.91       | 1.74×          | -37                               |
| freeCodeCamp, 2 files                 | 0.98     | 1.33    | 1.09        | 0.94       | 1.36×          | -22                               |
| Material UI, original 5 files         | 7.59     | 9.71    | (8.97)      | (4.59)     | 1.28×          | -37                               |
| Svelte runes, first shard             | 5.79     | 6.27    | (5.88)      | (0.81)     | 1.08×          | +35                               |
| Svelte motion                         | 0.85     | 1.01    | 0.91        | (0.67)     | 1.19×          | -1                                |
| Scully globals only (teardown guard¹) | 0.90     | 1.10    | (0.96)      | 0.89       | 1.22×          | -3                                |

## Compatibility

All 60 provider and selection combinations reproduced the preceding replay’s exact named outcomes, failure counts and exit status. [Comparison against the preceding replay](../.cache/upstream-directcss-T9AAOL/broad-outcome-changes.json)

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

Scully’s original Jest 27 teardown redefines Window.document. The timed rows guard the same call for RunDOM and jsdom. The fresh unguarded runs produced RunDOM 0 / 0 / 0 + 3 files, jsdom 8 / 0 / 0. [Jest reports and provider traces](../.cache/upstream-directcss-T9AAOL/jest-providers/)

The broad Svelte run reproduced the preceding replay’s exact test outcomes. In the earlier browser diagnostic, the 90 failing DOM and hydration variants also failed in Google Chrome for Testing 156.0.8078.4, and 86 had identical failure details to RunDOM. Stock jsdom passed all 90 in that diagnostic. The browser evidence comes from the earlier run. [Browser comparison](../.cache/upstream-goal-1BQdRb/svelte-browser-summary.json)

## Timing and memory on identical work

Cells show process seconds / test seconds / peak RSS MiB. Filtered comparisons require the exact multiset of named passing tests in each of three trials. Readability uses complete pages. The dash means that provider failed qualification. Peak RSS is the operating system’s process high-water measurement for the command. Worker-specific RSS appears in the separate diagnostic.

| Selection                             | Cases | RunDOM            | jsdom             | Happy DOM         | TurboDOM          |
| ------------------------------------- | ----- | ----------------- | ----------------- | ----------------- | ----------------- |
| Vue runtime-dom                       | 159   | 1.95 / 0.21 / 290 | 4.83 / 0.19 / 471 | 2.76 / 0.15 / 302 | 1.78 / 0.15 / 272 |
| Ant Design, 8 files                   | 116   | 4.92 / 1.02 / 586 | 6.29 / 1.14 / 606 | 5.17 / 0.87 / 586 | 4.42 / 0.77 / 566 |
| Material UI Button and TextField      | 118   | 1.84 / 0.48 / 309 | 2.38 / 0.64 / 309 | 1.88 / 0.40 / 310 | 1.62 / 0.31 / 310 |
| Material UI common subset             | 161   | 2.34 / 0.72 / 309 | 3.16 / 0.95 / 312 | 2.38 / 0.61 / 312 | —                 |
| Supabase UI                           | 80    | 3.85 / 0.74 / 187 | 7.37 / 1.44 / 309 | 4.55 / 0.48 / 178 | 3.48 / 0.51 / 157 |
| Svelte runes, first shard             | 561   | 5.74 / 4.69 / 376 | 6.15 / 4.94 / 342 | 5.82 / 4.67 / 366 | —                 |
| React DOM, 2 files                    | 61    | 4.29 / 3.29 / 837 | 4.50 / 3.31 / 913 | 4.40 / 3.29 / 862 | 4.23 / 3.23 / 738 |
| Mozilla Readability, 44 shared pages  | 281   | 0.67 / 0.53 / 417 | 1.21 / 0.98 / 496 | 0.77 / 0.55 / 460 | 0.45 / 0.31 / 301 |
| Next.js Vitest example                | 5     | 0.95 / 0.06 / 117 | 1.65 / 0.12 / 153 | 1.28 / 0.04 / 120 | 0.91 / 0.04 / 116 |
| freeCodeCamp, 2 files                 | 4     | 0.98 / 0.05 / 163 | 1.33 / 0.08 / 185 | 1.09 / 0.04 / 177 | 0.94 / 0.03 / 153 |
| Svelte motion                         | 8     | 0.85 / 0.00 / 184 | 1.01 / 0.00 / 186 | 0.91 / 0.00 / 186 | —                 |
| Drone UI, 1 file                      | 1     | 3.53 / 0.69 / 633 | 4.26 / 0.74 / 646 | 3.67 / 0.70 / 650 | —                 |
| Scully globals only (teardown guard¹) | 5     | 0.90 / 0.00 / 427 | 1.10 / 0.00 / 430 | —                 | 0.89 / 0.00 / 406 |

| Four-way selection                         | Lowest elapsed median | RunDOM above lowest, ms | RunDOM peak minus lowest-time provider, MiB |
| ------------------------------------------ | --------------------- | ----------------------- | ------------------------------------------- |
| Vue runtime-dom (159)                      | TurboDOM              | 170                     | +17                                         |
| Ant Design, 8 files (116)                  | TurboDOM              | 500                     | +20                                         |
| Material UI Button and TextField (118)     | TurboDOM              | 220                     | -1                                          |
| Supabase UI (80)                           | TurboDOM              | 370                     | +29                                         |
| React DOM, 2 files (61)                    | TurboDOM              | 60                      | +98                                         |
| Mozilla Readability, 44 shared pages (281) | TurboDOM              | 220                     | +116                                        |
| Next.js Vitest example (5)                 | TurboDOM              | 40                      | +1                                          |
| freeCodeCamp, 2 files (4)                  | TurboDOM              | 40                      | +11                                         |

Each pair below uses matching repetition numbers from the rotated runs. The process clock reports hundredths of a second. On short workloads, margins of that size can change with the run order.

| Selection                                  | RunDOM minus TurboDOM per round, ms | RunDOM faster | Ties | TurboDOM faster |
| ------------------------------------------ | ----------------------------------- | ------------- | ---- | --------------- |
| Vue runtime-dom (159)                      | +160 / +180 / +190                  | 0             | 0    | 3               |
| Ant Design, 8 files (116)                  | +440 / +500 / +430                  | 0             | 0    | 3               |
| Material UI Button and TextField (118)     | +210 / +230 / +220                  | 0             | 0    | 3               |
| Supabase UI (80)                           | +370 / +350 / +320                  | 0             | 0    | 3               |
| React DOM, 2 files (61)                    | +60 / +40 / +70                     | 0             | 0    | 3               |
| Mozilla Readability, 44 shared pages (281) | +220 / +240 / +220                  | 0             | 0    | 3               |
| Next.js Vitest example (5)                 | +210 / +40 / -50                    | 1             | 0    | 2               |
| freeCodeCamp, 2 files (4)                  | +50 / -260 / +30                    | 1             | 0    | 2               |

## Where RunDOM still loses on identical work

A positive delta means RunDOM took longer or used more peak memory than the named provider. These comparisons use the shared four-provider selections when all three rounds qualify. Each selection is listed once per comparison provider. The full upstream pass counts above give the coverage context.

| Selection                                  | Comparison | Process delta ms | Test delta ms | Peak RSS delta MiB |
| ------------------------------------------ | ---------- | ---------------- | ------------- | ------------------ |
| Vue runtime-dom (159)                      | jsdom      | -2880            | +14           | -181               |
| Vue runtime-dom (159)                      | Happy DOM  | -810             | +54           | -12                |
| Vue runtime-dom (159)                      | TurboDOM   | +170             | +55           | +17                |
| Ant Design, 8 files (116)                  | jsdom      | -1370            | -120          | -20                |
| Ant Design, 8 files (116)                  | Happy DOM  | -250             | +146          | 0                  |
| Ant Design, 8 files (116)                  | TurboDOM   | +500             | +250          | +20                |
| Material UI Button and TextField (118)     | jsdom      | -540             | -157          | 0                  |
| Material UI Button and TextField (118)     | Happy DOM  | -40              | +85           | 0                  |
| Material UI Button and TextField (118)     | TurboDOM   | +220             | +171          | -1                 |
| Supabase UI (80)                           | jsdom      | -3520            | -707          | -123               |
| Supabase UI (80)                           | Happy DOM  | -700             | +259          | +8                 |
| Supabase UI (80)                           | TurboDOM   | +370             | +229          | +29                |
| React DOM, 2 files (61)                    | jsdom      | -210             | -19           | -77                |
| React DOM, 2 files (61)                    | Happy DOM  | -110             | +3            | -25                |
| React DOM, 2 files (61)                    | TurboDOM   | +60              | +64           | +98                |
| Mozilla Readability, 44 shared pages (281) | jsdom      | -540             | -451          | -79                |
| Mozilla Readability, 44 shared pages (281) | Happy DOM  | -100             | -19           | -42                |
| Mozilla Readability, 44 shared pages (281) | TurboDOM   | +220             | +217          | +116               |
| Next.js Vitest example (5)                 | jsdom      | -700             | -60           | -37                |
| Next.js Vitest example (5)                 | Happy DOM  | -330             | +12           | -3                 |
| Next.js Vitest example (5)                 | TurboDOM   | +40              | +20           | +1                 |
| freeCodeCamp, 2 files (4)                  | jsdom      | -350             | -26           | -22                |
| freeCodeCamp, 2 files (4)                  | Happy DOM  | -110             | +12           | -14                |
| freeCodeCamp, 2 files (4)                  | TurboDOM   | +40              | +18           | +11                |

## Broad runner phases and CPU

The first table reports median end-to-end seconds, test seconds and peak RSS MiB for every attempt, including partial executions. Test time is the sum of named test durations for Vitest and Jest, and suite duration for Mocha. The second table gives total user and system CPU seconds. Vitest stage measurements come from the trial nearest each provider’s elapsed median. Jest and Mocha supply process and test totals.

| Selection                             | RunDOM              | jsdom               | Happy DOM           | TurboDOM            |
| ------------------------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| Mozilla Readability, 130 pages        | 4.18 / 3.92 / 1136  | 9.39 / 8.97 / 1403  | 5.43 / 5.06 / 1699  | 1.74 / 1.60 / 427   |
| Material UI, 10 files                 | 16.43 / 12.74 / 585 | 21.64 / 15.86 / 531 | 26.22 / 21.98 / 642 | 23.46 / 16.65 / 471 |
| Ant Design, 8 files                   | 4.92 / 1.09 / 581   | 6.56 / 1.21 / 626   | 5.67 / 0.96 / 589   | 4.51 / 0.87 / 589   |
| Vue runtime-dom                       | 2.58 / 0.37 / 390   | 6.30 / 0.38 / 515   | 3.63 / 0.27 / 397   | 2.26 / 0.19 / 343   |
| Svelte runes, legacy and motion       | 30.44 / 22.90 / 546 | 34.34 / 25.26 / 526 | 30.52 / 22.36 / 536 | 5.33 / 0.00 / 427   |
| React DOM, 2 files                    | 4.32 / 3.31 / 845   | 4.93 / 3.34 / 843   | 4.46 / 3.34 / 815   | 4.34 / 3.35 / 896   |
| Drone UI, 1 file                      | 3.53 / 0.69 / 633   | 4.26 / 0.74 / 646   | 3.67 / 0.70 / 650   | 3.01 / 0.04 / 630   |
| Scully, 3 files (teardown guard¹)     | 1.07 / 0.00 / 482   | 1.30 / 0.00 / 468   | 0.80 / 0.00 / 414   | 1.04 / 0.00 / 474   |
| Supabase UI                           | 3.92 / 0.84 / 186   | 7.73 / 1.65 / 309   | 4.66 / 0.59 / 177   | 4.61 / 1.56 / 158   |
| Next.js Vitest example                | 0.95 / 0.06 / 117   | 1.65 / 0.12 / 153   | 1.28 / 0.04 / 120   | 0.91 / 0.04 / 116   |
| freeCodeCamp, 2 files                 | 0.98 / 0.05 / 163   | 1.33 / 0.08 / 185   | 1.09 / 0.04 / 177   | 0.94 / 0.03 / 153   |
| Material UI, original 5 files         | 7.59 / 5.42 / 333   | 9.71 / 6.35 / 369   | 8.97 / 6.43 / 482   | 4.59 / 0.88 / 408   |
| Svelte runes, first shard             | 5.79 / 4.71 / 375   | 6.27 / 4.94 / 341   | 5.88 / 4.72 / 366   | 0.81 / 0.00 / 189   |
| Svelte motion                         | 0.85 / 0.00 / 184   | 1.01 / 0.00 / 186   | 0.91 / 0.00 / 186   | 0.67 / 0.00 / 180   |
| Scully globals only (teardown guard¹) | 0.90 / 0.00 / 427   | 1.10 / 0.00 / 430   | 0.96 / 0.00 / 398   | 0.89 / 0.00 / 406   |

| Selection                             | RunDOM CPU s | jsdom CPU s | Happy DOM CPU s | TurboDOM CPU s |
| ------------------------------------- | ------------ | ----------- | --------------- | -------------- |
| Mozilla Readability, 130 pages        | 6.20         | 12.50       | 7.67            | 1.55           |
| Material UI, 10 files                 | 16.78        | 23.29       | 20.31           | 22.81          |
| Ant Design, 8 files                   | 7.79         | 9.35        | 8.05            | 7.29           |
| Vue runtime-dom                       | 3.39         | 8.10        | 4.69            | 2.92           |
| Svelte runes, legacy and motion       | 31.74        | 35.58       | 31.35           | 6.48           |
| React DOM, 2 files                    | 5.96         | 6.18        | 6.19            | 6.00           |
| Drone UI, 1 file                      | 4.59         | 4.85        | 4.71            | 4.41           |
| Scully, 3 files (teardown guard¹)     | 1.74         | 1.86        | 1.18            | 1.66           |
| Supabase UI                           | 5.20         | 10.00       | 5.82            | 4.78           |
| Next.js Vitest example                | 1.18         | 1.89        | 1.53            | 1.10           |
| freeCodeCamp, 2 files                 | 1.38         | 1.66        | 1.43            | 1.27           |
| Material UI, original 5 files         | 7.27         | 9.94        | 7.67            | 5.92           |
| Svelte runes, first shard             | 4.12         | 4.53        | 4.12            | 1.07           |
| Svelte motion                         | 1.13         | 1.26        | 1.18            | 0.91           |
| Scully globals only (teardown guard¹) | 1.41         | 1.54        | 1.17            | 1.36           |

| Selection                       | Provider  | Vitest stages                                                                                   |
| ------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| Material UI, 10 files           | RunDOM    | 16.05s (tests 82%, import 7%, transform 6%, setup 3%, environment 2%)                           |
| Material UI, 10 files           | jsdom     | 21.29s (tests 76%, environment 12%, import 5%, transform 4%, setup 2%)                          |
| Material UI, 10 files           | Happy DOM | 25.84s (tests 87%, import 4%, transform 4%, environment 4%, setup 2%)                           |
| Material UI, 10 files           | TurboDOM  | 22.98s (tests 88%, import 5%, transform 5%, setup 2%)                                           |
| Ant Design, 8 files             | RunDOM    | 4.77s (transform 47%, tests 25%, setup 19%, import 4%, environment 4%)                          |
| Ant Design, 8 files             | jsdom     | 6.37s (transform 36%, environment 25%, tests 20%, setup 13%, import 5%)                         |
| Ant Design, 8 files             | Happy DOM | 5.45s (transform 43%, tests 19%, setup 16%, environment 15%, import 7%)                         |
| Ant Design, 8 files             | TurboDOM  | 4.35s (transform 54%, tests 22%, setup 18%, import 5%)                                          |
| Vue runtime-dom                 | RunDOM    | 2.40s (transform 298ms, setup 34ms, import 858ms, tests 377ms, environment 396ms)               |
| Vue runtime-dom                 | jsdom     | 6.12s (transform 307ms, setup 70ms, import 866ms, tests 391ms, environment 4.07s)               |
| Vue runtime-dom                 | Happy DOM | 3.46s (transform 305ms, setup 34ms, import 878ms, tests 282ms, environment 1.51s)               |
| Vue runtime-dom                 | TurboDOM  | 2.02s (transform 268ms, setup 39ms, import 623ms, tests 195ms, environment 21ms)                |
| Svelte runes, legacy and motion | RunDOM    | 29.69s (transform 7.67s, setup 0ms, import 5.97s, tests 22.93s, environment 219ms)              |
| Svelte runes, legacy and motion | jsdom     | 33.53s (transform 8.09s, setup 0ms, import 6.35s, tests 25.30s, environment 1.32s)              |
| Svelte runes, legacy and motion | Happy DOM | 29.74s (transform 7.54s, setup 0ms, import 5.92s, tests 22.39s, environment 865ms)              |
| Svelte runes, legacy and motion | TurboDOM  | 4.96s (transform 2.89s, setup 0ms, import 0ms, tests 0ms, environment 20ms)                     |
| Supabase UI                     | RunDOM    | 3.80s (import 29%, tests 28%, setup 27%, environment 12%, transform 4%, worker 1%)              |
| Supabase UI                     | jsdom     | 7.55s (environment 46%, tests 24%, import 15%, setup 12%, transform 2%)                         |
| Supabase UI                     | Happy DOM | 4.52s (environment 36%, import 23%, setup 22%, tests 16%, transform 3%, worker 1%)              |
| Supabase UI                     | TurboDOM  | 4.47s (tests 45%, import 26%, setup 24%, transform 4%, environment 1%, worker 1%)               |
| Next.js Vitest example          | RunDOM    | 746ms (transform 45ms, setup 0ms, collect 189ms, tests 57ms, environment 81ms, prepare 102ms)   |
| Next.js Vitest example          | jsdom     | 1.45s (transform 43ms, setup 0ms, collect 182ms, tests 118ms, environment 722ms, prepare 102ms) |
| Next.js Vitest example          | Happy DOM | 1.07s (transform 43ms, setup 0ms, collect 189ms, tests 46ms, environment 407ms, prepare 102ms)  |
| Next.js Vitest example          | TurboDOM  | 699ms (transform 44ms, setup 0ms, collect 189ms, tests 38ms, environment 8ms, prepare 105ms)    |
| freeCodeCamp, 2 files           | RunDOM    | 779ms (transform 175ms, setup 161ms, import 402ms, tests 50ms, environment 47ms)                |
| freeCodeCamp, 2 files           | jsdom     | 1.13s (transform 172ms, setup 153ms, import 386ms, tests 76ms, environment 398ms)               |
| freeCodeCamp, 2 files           | Happy DOM | 874ms (transform 178ms, setup 157ms, import 385ms, tests 38ms, environment 181ms)               |
| freeCodeCamp, 2 files           | TurboDOM  | 722ms (transform 177ms, setup 156ms, import 385ms, tests 33ms, environment 4ms)                 |
| Material UI, original 5 files   | RunDOM    | 7.25s (tests 78%, transform 9%, import 8%, setup 3%, environment 2%)                            |
| Material UI, original 5 files   | jsdom     | 9.37s (tests 69%, environment 15%, transform 7%, import 6%, setup 2%)                           |
| Material UI, original 5 files   | Happy DOM | 8.62s (tests 77%, transform 7%, environment 6%, import 6%, setup 3%)                            |
| Material UI, original 5 files   | TurboDOM  | 4.04s (tests 38%, transform 29%, import 22%, setup 11%)                                         |
| Svelte runes, first shard       | RunDOM    | 5.58s (transform 1.12s, setup 0ms, import 744ms, tests 4.75s, environment 24ms)                 |
| Svelte runes, first shard       | jsdom     | 6.02s (transform 1.11s, setup 0ms, import 799ms, tests 4.94s, environment 217ms)                |
| Svelte runes, first shard       | Happy DOM | 5.67s (transform 1.13s, setup 0ms, import 735ms, tests 4.73s, environment 140ms)                |
| Svelte runes, first shard       | TurboDOM  | 617ms (transform 371ms, setup 0ms, import 0ms, tests 0ms, environment 5ms)                      |
| Svelte motion                   | RunDOM    | 648ms (transform 391ms, setup 0ms, import 564ms, tests 2ms, environment 24ms)                   |
| Svelte motion                   | jsdom     | 809ms (transform 382ms, setup 0ms, import 548ms, tests 2ms, environment 201ms)                  |
| Svelte motion                   | Happy DOM | 705ms (transform 386ms, setup 0ms, import 552ms, tests 3ms, environment 92ms)                   |
| Svelte motion                   | TurboDOM  | 465ms (transform 261ms, setup 0ms, import 0ms, tests 0ms, environment 2ms)                      |

Per-run peak RSS shows how much the high-water mark varies between fresh processes. Each pair of columns covers all three runs, in execution-round order.

| Selection                      | RunDOM peaks MiB  | jsdom peaks MiB    |
| ------------------------------ | ----------------- | ------------------ |
| Mozilla Readability, 130 pages | 1137 / 1136 / 737 | 1268 / 1435 / 1403 |
| Material UI, 10 files          | 585 / 559 / 591   | 468 / 591 / 531    |
| Ant Design, 8 files            | 579 / 603 / 581   | 627 / 626 / 621    |
| Vue runtime-dom                | 392 / 390 / 381   | 510 / 519 / 515    |
| React DOM, 2 files             | 845 / 844 / 848   | 912 / 843 / 833    |

## Change from the preceding replay

Ranges cover all three latest runs. The jsdom control change shows movement between batches with unchanged reference software. A small difference between batches is weak evidence for an implementation effect. [Trial summary and report filenames](../.cache/upstream-directcss-T9AAOL/summary.json)

| Selection                             | Previous RunDOM s | Latest RunDOM s | Latest RunDOM range s | Latest jsdom range s | jsdom control change |
| ------------------------------------- | ----------------- | --------------- | --------------------- | -------------------- | -------------------- |
| Mozilla Readability, 130 pages        | 4.25              | 4.18            | 4.16–4.31             | 9.31–9.45            | +0.4%                |
| Material UI, 10 files                 | 16.40             | 16.43           | 16.29–16.62           | 21.64–21.81          | -0.1%                |
| Ant Design, 8 files                   | 4.95              | 4.92            | 4.91–4.95             | 6.35–6.73            | -0.8%                |
| Vue runtime-dom                       | 2.59              | 2.58            | 2.58–2.65             | 6.27–6.35            | +0.0%                |
| React DOM, 2 files                    | 4.31              | 4.32            | 4.31–4.96             | 4.56–4.96            | -1.0%                |
| Drone UI, 1 file                      | 3.48              | 3.53            | 3.49–3.55             | 3.80–4.31            | -0.2%                |
| Scully, 3 files (teardown guard¹)     | 1.05              | 1.07            | 1.06–1.40             | 1.24–1.60            | +1.6%                |
| Supabase UI                           | 3.91              | 3.92            | 3.90–4.04             | 7.61–7.89            | +0.5%                |
| Next.js Vitest example                | 0.95              | 0.95            | 0.95–1.11             | 1.65–1.68            | +0.6%                |
| freeCodeCamp, 2 files                 | 0.98              | 0.98            | 0.97–0.98             | 1.31–1.60            | +0.0%                |
| Material UI, original 5 files         | 7.58              | 7.59            | 7.57–7.75             | 9.60–9.81            | +0.8%                |
| Svelte runes, first shard             | 5.72              | 5.79            | 5.74–5.82             | 6.14–6.28            | +0.5%                |
| Svelte motion                         | 0.84              | 0.85            | 0.85–0.86             | 0.93–1.01            | +7.4%                |
| Scully globals only (teardown guard¹) | 0.90              | 0.90            | 0.89–0.90             | 1.09–1.30            | -0.9%                |

## Readability application

This benchmark opens, extracts and closes 130 documents and hashes the articles. Heap values are sampled after forced GC at the end of the synchronous batch and after an event-loop turn. All four providers attempted three full replays.

| Provider  | Complete trials | Construct s | Extract s | Close ms | Process s | Peak MiB | Same-turn heap MiB | Next-turn heap MiB |
| --------- | --------------- | ----------- | --------- | -------- | --------- | -------- | ------------------ | ------------------ |
| RunDOM    | 3               | 0.89        | 1.36      | 1.19     | 2.39      | 646      | 51.84              | 36.77              |
| jsdom     | 3               | 3.39        | 2.53      | 39.52    | 6.34      | 1306     | 717.57             | 166.97             |
| Happy DOM | 0               | —           | —         | —        | —         | —        | —                  | —                  |
| TurboDOM  | 0               | —           | —         | —        | —         | —        | —                  | —                  |

RunDOM and jsdom differed on 5 serialized articles. Independent parsing found 0 differences in the resulting trees. [Per-article differences](../.cache/upstream-directcss-T9AAOL/output-equivalence.json) · [Application exit codes and matched test identities](../.cache/upstream-directcss-T9AAOL/matches.jsonl)

## React and Testing Library supplemental workloads

Each eligible cell summarizes nine fresh Vitest processes exercising the same React and Testing Library fixture. Cells give process seconds / test seconds / worker RSS MiB. RSS here is sampled at suite end. These fixtures supplement upstream React’s two Jest files.

| Fixture      | Worker pool | RunDOM            | jsdom             | Happy DOM         | TurboDOM   |
| ------------ | ----------- | ----------------- | ----------------- | ----------------- | ---------- |
| 8 workflows  | forks       | 0.46 / 0.12 / 126 | 0.99 / 0.17 / 216 | 0.53 / 0.10 / 123 | incomplete |
| 8 workflows  | threads     | 0.51 / 0.13 / 179 | 0.85 / 0.17 / 242 | 0.57 / 0.11 / 181 | incomplete |
| 8 workflows  | vmForks     | 0.59 / 0.15 / 145 | 0.82 / 0.17 / 204 | 0.59 / 0.11 / 139 | incomplete |
| 8 workflows  | vmThreads   | 0.56 / 0.15 / 188 | 0.81 / 0.18 / 254 | 0.58 / 0.11 / 190 | incomplete |
| 10 workflows | forks       | 1.13 / 0.57 / 260 | 1.98 / 0.84 / 332 | incomplete        | incomplete |
| 10 workflows | threads     | 1.14 / 0.59 / 280 | 1.95 / 0.86 / 377 | incomplete        | incomplete |
| 10 workflows | vmForks     | 1.09 / 0.57 / 273 | 1.55 / 0.83 / 345 | incomplete        | incomplete |
| 10 workflows | vmThreads   | 1.05 / 0.57 / 340 | 1.52 / 0.82 / 394 | incomplete        | incomplete |

[Eight-workflow trials and failures](../.cache/upstream-directcss-T9AAOL/react-standard.json) · [Ten-workflow trials and failures](../.cache/upstream-directcss-T9AAOL/react-integration.json)

## Which tests dominate

The longest component files below are ranked by summed upstream test duration on RunDOM. Each value is the median of three complete runs. The React row measures the case that previously formatted an internal CSS parser error stack.

| Project     | File or case                                                | RunDOM ms | jsdom ms | Difference ms |
| ----------- | ----------------------------------------------------------- | --------- | -------- | ------------- |
| Material UI | packages/mui-material/src/Autocomplete/Autocomplete.test.js | 4862      | 6801     | -1939         |
| Material UI | packages/mui-material/src/Select/Select.test.js             | 4197      | 4813     | -616          |
| Material UI | packages/mui-material/src/Tabs/Tabs.test.js                 | 1109      | 1281     | -172          |
| Material UI | packages/mui-material/src/Tooltip/Tooltip.test.js           | 916       | 1023     | -107          |
| Material UI | packages/mui-material/src/TextField/TextField.test.js       | 385       | 522      | -137          |
| Ant Design  | components/radio/**tests**/group.test.tsx                   | 230       | 265      | -35           |
| Ant Design  | components/checkbox/**tests**/group.test.tsx                | 209       | 235      | -26           |
| Ant Design  | components/alert/**tests**/index.test.tsx                   | 205       | 212      | -7            |
| Ant Design  | components/radio/**tests**/radio.test.tsx                   | 151       | 163      | -12           |
| Ant Design  | components/checkbox/**tests**/checkbox.test.tsx             | 90        | 108      | -17           |
| React DOM   | should warn about style having a trailing semicolon         | 2         | 1        | 1             |

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
| RunDOM    | 122.75       | 161.69     | 0.43     | 0.42         | 261.47       | 24.50              |
| jsdom     | 290.65       | 293.94     | 4.29     | 0.83         | 362.69       | 37.32              |
| Happy DOM | 121.90       | 167.63     | 0.04     | 0.51         | 343.64       | 58.08              |
| TurboDOM  | 20.88        | 101.09     | 0.03     | 0.24         | 245.42       | 13.54              |

[Comparable stages and selected article identities](../.cache/upstream-directcss-T9AAOL/shared-articles/metrics.json) · [All 520 page outcomes and raw process logs](../.cache/upstream-directcss-T9AAOL/shared-articles/)

## Where the elapsed advantage comes from

For each primary selection that completed identically in all RunDOM and jsdom repeats, the first two timing columns give jsdom minus RunDOM. The runner remainder includes work outside its test-duration measure, such as starting workers, loading modules, and teardown. The Mocha test measure covers suite time. Remainders are calculated separately in each trial before taking medians.

| Selection                         | Whole process s | Runner test measure s | Remainder s | Process difference by rotation s |
| --------------------------------- | --------------- | --------------------- | ----------- | -------------------------------- |
| Mozilla Readability, 130 pages    | +5.130          | +5.051                | +0.239      | +5.13 / +5.08 / +5.29            |
| Material UI, 10 files             | +5.350          | +3.126                | +2.183      | +5.02 / +5.35 / +5.38            |
| Ant Design, 8 files               | +1.650          | +0.121                | +1.529      | +1.40 / +1.81 / +1.65            |
| Vue runtime-dom                   | +3.720          | +0.014                | +3.706      | +3.72 / +3.77 / +3.62            |
| React DOM, 2 files                | +0.620          | +0.003                | +0.617      | -0.40 / +0.62 / +0.64            |
| Drone UI, 1 file                  | +0.710          | +0.042                | +0.668      | +0.27 / +0.71 / +0.82            |
| Scully, 3 files (teardown guard¹) | +0.230          | +0.000                | +0.230      | +0.23 / +0.54 / -0.16            |
| Supabase UI                       | +3.830          | +0.805                | +3.025      | +3.97 / +3.57 / +3.83            |
| Next.js Vitest example            | +0.700          | +0.060                | +0.639      | +0.57 / +0.70 / +0.70            |
| freeCodeCamp, 2 files             | +0.350          | +0.026                | +0.324      | +0.35 / +0.33 / +0.63            |

## Test files accounting for the TurboDOM gap

Each row sums durations for the same named passing cases within an upstream file. Times are medians of three trials. The table selects the largest positive RunDOM-minus-TurboDOM differences in each comparable framework workload. Runner load, imports and skipped cases are outside these file totals.

| Framework   | Upstream file                                                                | Cases | RunDOM ms | jsdom ms | Happy DOM ms | TurboDOM ms | Difference ms |
| ----------- | ---------------------------------------------------------------------------- | ----- | --------- | -------- | ------------ | ----------- | ------------- |
| Vue         | packages/runtime-dom/**tests**/patchStyle.spec.ts                            | 19    | 26.4      | 12.0     | 5.9          | 5.4         | +21.0         |
| Vue         | packages/runtime-dom/**tests**/customElement.spec.ts                         | 65    | 83.0      | 83.9     | 58.6         | 66.8        | +16.2         |
| Vue         | packages/runtime-dom/**tests**/helpers/useCssVars.spec.ts                    | 1     | 13.5      | 9.1      | 5.8          | 5.2         | +8.3          |
| Ant Design  | components/checkbox/**tests**/group.test.tsx                                 | 23    | 204.9     | 231.3    | 175.5        | 154.5       | +50.4         |
| Ant Design  | components/alert/**tests**/index.test.tsx                                    | 20    | 187.3     | 184.8    | 144.7        | 139.7       | +47.7         |
| Ant Design  | components/radio/**tests**/group.test.tsx                                    | 29    | 226.2     | 262.2    | 232.4        | 181.4       | +44.7         |
| Material UI | packages/mui-material/src/Button/Button.test.js                              | 66    | 232.9     | 297.8    | 184.2        | 144.4       | +88.5         |
| Material UI | packages/mui-material/src/TextField/TextField.test.js                        | 52    | 250.1     | 342.0    | 213.8        | 167.2       | +82.9         |
| Supabase UI | packages/ui/src/components/shadcn/ui/alert-dialog.test.tsx                   | 7     | 94.4      | 304.3    | 64.1         | 52.8        | +41.6         |
| Supabase UI | packages/ui/src/components/CustomHTMLElements/CopyHeadingLinkButton.test.tsx | 4     | 67.5      | 94.5     | 38.3         | 35.1        | +32.5         |
| Supabase UI | packages/ui/src/components/shadcn/ui/toggle-group.test.tsx                   | 13    | 178.0     | 320.9    | 113.4        | 145.9       | +32.1         |

## Earlier React, Drone and Scully selections

The original project exploration also used these overlapping Jest selections. All four published adapters were screened. Successful providers repeated twice when at least two completed the selection. Cells show passed / failed, process seconds / test seconds / peak MiB, then the number of trials. A dagger marks unequal named outcomes or a nonzero exit. Scully uses the same guarded teardown as in the primary matrix. [Source hashes, traces, failures and elapsed, CPU and memory measurements](../.cache/upstream-directcss-T9AAOL/historical.json)

| Historical selection                               | RunDOM                           | jsdom                          | Happy DOM                        | TurboDOM                          |
| -------------------------------------------------- | -------------------------------- | ------------------------------ | -------------------------------- | --------------------------------- |
| React DOM, four files including event dispatch     | 86 / 3, 7.23 / 5.49 / 827, n=1 † | 89 / 0, 7.61 / 5.44 / 788, n=1 | 86 / 3, 7.16 / 5.34 / 832, n=1 † | 78 / 11, 7.17 / 5.41 / 826, n=1 † |
| React DOM, three files including invalid listeners | 65 / 1, 6.90 / 5.23 / 829, n=1 † | 66 / 0, 6.55 / 4.90 / 836, n=1 | 64 / 2, 6.56 / 4.92 / 821, n=1 † | 62 / 4, 6.68 / 4.97 / 803, n=1 †  |
| Drone UI, CreateRepositoryButton and Strings       | 11 / 1, 6.20 / 0.75 / 619, n=1 † | 12 / 0, 5.41 / 0.79 / 605, n=1 | 11 / 1, 5.62 / 0.75 / 607, n=1 † | 10 / 2, 4.95 / 0.08 / 596, n=1 †  |
| Scully, baseHrefRewrite                            | 3 / 0, 1.12 / 0.00 / 394, n=3    | 3 / 0, 1.32 / 0.00 / 387, n=3  | 0 / 0, 1.13 / 0.00 / 385, n=1 †  | 3 / 0, 1.23 / 0.00 / 392, n=3     |

## Vue inline style patching

This upstream case assigns width, height and display, changes all three, then reapplies Vue’s style object. Those operations expose a cold inline-declaration cost that is easy to miss in whole-suite timings. The table gives durations reported by the upstream test runner.

| Provider  | Round 1 ms | Round 2 ms | Round 3 ms | Median ms |
| --------- | ---------- | ---------- | ---------- | --------- |
| rundom    | 0.56       | 0.56       | 0.56       | 0.56      |
| jsdom     | 1.39       | 1.35       | 1.43       | 1.39      |
| happy-dom | 0.60       | 0.58       | 0.58       | 0.58      |
| turbo-dom | 0.53       | 0.52       | 0.53       | 0.53      |

## Material UI worker memory after teardown

A separate diagnostic reran the ten files on RunDOM and jsdom. Every worker recorded its process high-water RSS on entering teardown and live V8 heap after disposing the environment, yielding a turn and forcing GC. Both providers passed 1,087 tests. The table uses a single instrumented observation per file and provider. [Per-worker memory checkpoints and test reports](../.cache/upstream-directcss-T9AAOL/mui-workers/)

| Worker       | RunDOM peak MiB | jsdom peak MiB | Peak difference MiB | RunDOM settled heap MiB | jsdom settled heap MiB | Heap difference MiB |
| ------------ | --------------- | -------------- | ------------------- | ----------------------- | ---------------------- | ------------------- |
| Autocomplete | 560.6           | 514.8          | 45.8                | 90.4                    | 110.9                  | -20.5               |
| Select       | 342.1           | 388.3          | -46.2               | 70.8                    | 89.4                   | -18.6               |
| Tabs         | 317.2           | 325.0          | -7.9                | 59.2                    | 79.7                   | -20.5               |
| TextField    | 250.3           | 319.6          | -69.3               | 58.5                    | 79.1                   | -20.6               |
| Menu         | 215.3           | 291.0          | -75.8               | 54.3                    | 73.9                   | -19.6               |
| Tooltip      | 211.5           | 297.3          | -85.9               | 53.0                    | 73.7                   | -20.7               |
| Popover      | 194.4           | 287.1          | -92.7               | 55.4                    | 76.1                   | -20.7               |
| Dialog       | 192.5           | 284.4          | -91.9               | 51.3                    | 71.5                   | -20.2               |
| Drawer       | 189.2           | 279.3          | -90.1               | 51.0                    | 71.5                   | -20.5               |
| MenuList     | 185.8           | 287.6          | -101.9              | 50.3                    | 71.0                   | -20.6               |

## Compatibility of the wider Jest screens

Drone’s additional Strings test renders an error span with a CSS variable as its color. Its snapshot expects the style attribute to be absent. In a separate public CSSOM check, Chromium 156.0.8078.4 returned 'color: var(--red-500);', RunDOM returned 'color: var(--red-500);', and Drone’s installed jsdom returned no attribute. The snapshot failure remains in the compatibility totals. [Browser and project-provider results](../.cache/upstream-directcss-T9AAOL/drone-style.json)

The wider React replay had these failing named cases. The two propagation cases invoke React’s internal event-dispatch helper. The invalid-listener expectation checks the number of console calls. [Four-file React assertions and stacks](../.cache/upstream-directcss-T9AAOL/jest-providers/native-react-4-rundom-0.json)

- ReactDOMEventListener Propagation should batch between handlers from different roots (discrete)
- ReactDOMEventListener Propagation should batch between handlers from different roots (continuous)
- InvalidEventListeners should prevent non-function listeners, at dispatch

## Final build qualification

All 15 repository tasks passed. Both HTML parser modes passed 634 upstream jsdom API tests each and reproduced the baseline on 14,118 named extended WPT assertion and harness outcomes each, including existing failures. The final package also matched on 3,540 inline-style observations, 35,088 generic-property observations and reflection across 1,618 CSS accessors. [Compatibility results](../.cache/direct-css-release-MqN5QS/extended-wpt.json) · [Repository gate](../.cache/direct-css-release-MqN5QS/check.log) · [CSS property differential](../.cache/direct-css-release-MqN5QS/parity.json)
