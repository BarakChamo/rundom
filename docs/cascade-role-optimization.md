# Computed cascade performance during role and focus checks

The baseline trace for Ant Design recorded 214 computed-style reads and 1,098 ancestor visits. The wider Ant Design and Material UI trace recorded 826 reads, 2,444 ancestor visits, and 1,618 ancestor input-cache hits. Those hits still required walking to the root and collecting cascade inputs. Other rules in an author sheet could also block the existing completed-frame fast path. Dynamic selectors such as `a:hover` did so for unrelated elements, and selectors for pseudo-elements blocked reuse even when their matcher could never match an element.

The initial Ant Design profile for four Radio Group and Form Item tests recorded 1,639 style samples, with 1,628 under role or focus helpers, out of 13,037 active samples. The broader 116-case profile also found substantial stylesheet insertion and runner module work. [Previous real-project telemetry](real-project-bottlenecks.md)

## Changes

- Computed style can resume from the nearest completed ancestor with a valid document style and linked-sheet revision. Selector eligibility is evaluated against the candidate element through the existing ID and class constraints, a conservative direct type constraint, and the matcher for pseudo-elements. The same check applies to any computed-style caller.
- Live candidate selectors and cascade features such as imports, layers, scoped rules, nesting, inline declarations, and exposed or adopted stylesheets keep the complete path where needed. Viewport and base-URL dependencies are checked before using a completed frame. The revision is checked again after those reads because a public getter can mutate the document.
- After priority resolution, an unoverridden inherited custom property can reuse its already-computed token string. This avoids constructing a winner object and resolving the same tokens again for each descendant. Explicit inheritance, pending variables and escaped tokens retain the existing resolution path.

## Ant Design’s media rules

A second trace on the same four Radio Group and Form Item cases showed why the first cache change had little effect on real Ant Design. A media rule disabled frame certification in 111 of 112 reads. The cascade visited 911 ancestors. The engine also rebuilt 480 frames, often with about 400 winners in each frame.

The next change includes the viewport in the cache dependency for stylesheet media and `@media`. It also saves that dependency when a media rule is introduced without changing the frame’s current winners. The same four tests then took 135 ancestor steps, found 93 completed ancestors, and rebuilt 207 frames. Three style reads reused the completed target. Live focus selectors still required reevaluation when they could affect the subject.

## Ant Design Radio Group performance

The four matched upstream cases were rerun in three fresh, rotated trials per provider. The host was shared. The RunDOM wall-time ranges overlapped, from 5.64–17.24 s before to 4.90–20.44 s after. Test-body results still favor jsdom.

| Build                            | Test bodies, ms | Process, s | User and system CPU, s | Peak RSS, MiB |
| -------------------------------- | --------------: | ---------: | ---------------------: | ------------: |
| Prior RunDOM                     |           2,232 |      14.66 |                   9.32 |         571.3 |
| RunDOM with viewport-aware reuse |           1,364 |       9.43 |                   7.95 |         556.8 |
| Stock Ant Design jsdom           |             635 |       7.97 |                   7.91 |         581.7 |

A separate matched CPU profile recorded 2,166 samples with computed style on the stack before and 958 after. The active sample totals were 15,444 and 14,555. Approximately 99% of the style samples in both builds were under role or focus helpers. jsdom recorded 238 style samples, 186 under role or focus, out of 16,983 active samples. Sample counts identify where CPU landed. Test-body and process timings come from the unprofiled runs.

## CPU and memory

The Testing Library probe exercised role queries in four styled windows with 256 theme variables and 12 rounds of visibility changes. The table gives medians of seven fresh processes per build in rotated order. CPU and wall time cover the work phase. Live and released heap were sampled after forced GC. RSS is the process high-water mark.

| Build                                   | CPU, ms | Wall, ms | Live heap, MiB | Released heap, MiB | Peak RSS, MiB |
| --------------------------------------- | ------: | -------: | -------------: | -----------------: | ------------: |
| Prior RunDOM                            |   3,598 |    4,449 |          35.74 |              29.50 |        479.55 |
| Completed frames and selector filtering |   3,130 |    4,594 |          35.66 |              29.45 |        412.23 |
| Compact inherited values                |   2,038 |    2,298 |          34.50 |              29.18 |        436.33 |

The completed-frame change cut CPU by 13% in this probe. Compact inherited values cut a further 35%, with peak RSS between the two previous medians. Peak RSS varied by trial. The baseline range was 354–520 MiB and the final range was 360–449 MiB. Early runs of intermediate builds sometimes showed higher RSS, which led to a separate memory-qualified comparison of the final build.

The memory lab and two wide cascade probes each used five pairs of fresh processes. The wide probes held 16 windows with 96 styled elements and 384 inherited custom properties per window. The conditional variant included a media rule.

| Workload                  | Live heap, MiB | Released heap, MiB |   Peak RSS, MiB |
| ------------------------- | -------------: | -----------------: | --------------: |
| Lab, 32 styled windows    |  62.35 → 62.33 |      31.49 → 31.49 | 183.73 → 182.48 |
| Wide cascade, flat        |  52.67 → 47.74 |      26.60 → 26.38 | 342.88 → 324.44 |
| Wide cascade, conditional |  52.94 → 48.84 |      26.79 → 26.64 | 341.73 → 336.27 |

The final viewport-aware build was also measured on a role-query fixture with an active media rule. Across five rotated pairs, median CPU went from 3,519 to 2,066 ms, live heap from 35.79 to 34.55 MiB, released heap from 29.53 to 29.22 MiB and peak RSS from 542.03 to 445.06 MiB. All five final RSS peaks were below all five baseline peaks. macOS's peak memory footprint moved from 539.21 to 448.17 MiB.

The final build held forced-GC heap steady in the 32-window lab. Peak RSS was 200.98 → 202.05 MiB in that run. Peak RSS varied across the smaller probes. In a second flat role-query run the baseline ranged from 305 to 540 MiB and the final range was 415 to 445 MiB, while the candidate used about 105 MiB less heap at the end of the work phase before forced GC. The wide conditional probe's live heap went from 52.94 to 48.03 MiB, while its peak RSS ranges overlapped.

## Matched RunDOM build comparisons

The three rotated pairs below directly compare the prior RunDOM build and the final one. Each run passed the identical named cases. CPU time is user plus system time. A separate four-provider replay compares each repository’s installed jsdom and the pinned alternatives.

| Selection              |    Process, s | Test bodies, ms |        CPU, s | Peak RSS, MiB |
| ---------------------- | ------------: | --------------: | ------------: | ------------: |
| Ant Design, 116 cases  | 12.21 → 11.55 |   3,122 → 2,700 | 18.43 → 17.92 | 644.0 → 627.4 |
| Material UI, 118 cases |   4.57 → 3.90 |     1,117 → 973 |   6.62 → 5.72 | 307.9 → 309.1 |

The Material UI process RSS increase was 1.2 MiB. Its baseline and final ranges overlapped. The direct comparison measured whole-runner RSS, including compilation and setup. [Ant Design pairs](../.cache/cascade-role-optimization-YYzZZV/timed/media-antd.json) · [Material UI pairs](../.cache/cascade-role-optimization-YYzZZV/timed/media-mui.json)

## Compatibility

The repository check passed. The facade passed all 1,583 tests with each parser, and the pinned jsdom API suite passed 634 tests with each parser. The selected WPT replay matched the prior RunDOM build on all 756 CSS and selector fixtures, 17 mutation fixtures, and their 13,347 assertions per parser. The first TypeScript WPT run stopped in V8’s garbage collector and left its test server running. After the orphaned server was stopped, both parsers completed the replay and produced the same harness, fixture and assertion outcomes as the baseline, including existing failures.

[Selected WPT outcome diff](../.cache/cascade-role-optimization-YYzZZV/wpt-delta.json) · [Radio Group trials](../.cache/cascade-role-optimization-YYzZZV/timed/media-pair-results.json) · [CPU profile summaries](../.cache/cascade-role-optimization-YYzZZV/profile-summary.json) · [Frozen runtime](../.cache/cascade-role-optimization-YYzZZV/media.json)

[Complete real-project replay](cascade-real-project-benchmarks.md)
