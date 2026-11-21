# Real-project runtime bottlenecks

The frozen packed RunDOM build saved substantial environment setup time against jsdom on Vue, Ant Design, Material UI and Supabase UI. Its advantage inside test bodies varied by workload. The strongest repeatable RunDOM hot path in this replay was authored CSS resolution reached through role and focus checks. Stylesheet parsing and installation were the next identifiable CSS costs. Packed-node copying and wrapping were visible in the separate dense traversal workload and made up a small share of the matched component profiles.

## Benchmark phase breakdown

Times are medians in seconds. Test body sums assertion durations per process. Runner phases may overlap. The wall ranges overlap in seven of the nine matched Vitest comparisons on the shared host. Vue’s common set and the Next.js example have disjoint observed wall ranges. The full selections use their own paired timings.

| Selection           | Cases | RunDOM wall | jsdom wall | RunDOM test bodies | jsdom test bodies |
| ------------------- | ----: | ----------: | ---------: | -----------------: | ----------------: |
| Vue, full           |   270 |       10.27 |      23.90 |               1.38 |              1.31 |
| Ant Design, common  |   116 |       32.46 |      29.92 |               7.45 |              4.78 |
| Material UI, common |   118 |        5.14 |       4.52 |               1.19 |              1.15 |
| Svelte, runes shard |   561 |        6.96 |       6.72 |               4.68 |              5.26 |
| Supabase UI, common |    80 |       13.66 |      14.66 |               1.69 |              2.72 |
| React CSS and DOM   |    64 |       19.81 |      21.20 |              15.93 |             16.16 |
| Drone               |     1 |       20.60 |      20.96 |               0.92 |              1.21 |

- **Vue.** The median Vitest environment phase dropped from 15.13 seconds with jsdom to 1.40 seconds with RunDOM in the full selection. The test-body medians stayed close.
- **Ant Design.** The 116-case test-body gap was 2.67 seconds. The four largest case-level median deltas were all Radio Group name or FormItem cases and add to 1.37 seconds. The full 133-case pair, run at another point on the shared host, had a lower RunDOM test-body and process median. The focused four-case replay below reproduces the runtime gap inside Radio Group.
- **Material UI and Svelte.** Material UI’s 118-case test-body medians differ by 35 ms even though process medians differ by 618 ms. On the Svelte shard RunDOM’s test bodies were about 0.58 seconds faster, and the median Vitest transform and import phases were higher. Both case-level and runner costs matter to the overall ranking. In the Supabase UI diagnostic, RunDOM computed style accounts for 3.3% of active samples and module loading and compilation for 30.9%.
- **React and Drone.** React’s wall medians differ by 1.39 seconds, with overlapping ranges, closely matched assertion time and slightly higher measured process CPU on RunDOM. Drone spent about a second in its single assertion across a roughly 20-second process. In the new Jest profiles, Babel, Hermes or Jest transform stacks cover 69.3% of RunDOM’s active samples in React and 63.7% in Drone. Identified DOM engine stacks account for 4.5% and 1.8%, respectively.

[Matched benchmark and raw phase telemetry](real-project-benchmark-replay.md)

## RunDOM hot paths

1. **Computed style under role and focus checks.** The four Radio Group cases render FormItem trees and call Testing Library’s role queries. On the diagnostic rerun their bodies took 817 ms on RunDOM and 360 ms on jsdom. RunDOM’s process still finished first, 3.36 s versus 4.36 s. The current RunDOM profile includes 1,639 active samples under computed style, 1,628 of them also under a role or focus check. The profile enters cascade scope application, declaration expansion and inherited value resolution. In the broader 116-case Ant Design profile, computed style accounts for 6.7% of active samples. It accounts for 10.4% in the 118-case Material UI diagnostic, with 9.8% under role or focus checks. Earlier allocation counters identified repeated inherited custom-property winner construction in Ant Design and large rule-candidate and frame-validation work in Material UI. [Computed cascade](../packages/dom/src/styles.ts#L5697) · [Earlier measured counters](framework-performance-campaign.md#authored-cascade-and-live-tree-follow-up)
2. **Stylesheet ingestion and declaration parsing.** The broader Ant Design capture puts 4.1% of active samples under stylesheet insertion, with 3.9% under stylesheet parsing. Material UI puts 4.7% under insertion and 3.4% under parsing. The stacks run from style element insertion into sheet population, rule parsing and selector preparation. In the four-case Ant Design probe, stylesheet parsing is present alongside role-driven reads. The counts are inclusive and can overlap. [Sheet population](../packages/dom/src/styles.ts#L5043) · [Rule selection](../packages/dom/src/styles.ts#L3286)
3. **Window assembly and wrapper creation in dense workloads.** Lab traversal spends substantial time creating Window-local interfaces, materializing branches and branding every exposed node. On the real Ant Design and Material UI captures, Window construction and wrapper creation each occupy less than 1% of active samples. Those dense-workload costs therefore have limited reach in these component selections. [Dense diagnostic and memory evidence](packed-topology-performance.md#remaining-cost)

## Profile evidence

The CPU captures used in the attribution matched passing case names and used the frozen provider installations from the benchmark. The Material UI and Supabase UI diagnostics used Vitest’s threads pool to retain worker profiles. The initial forked diagnostic captured the runner without worker stacks for some projects. One initial Supabase UI capture produced 66 of the 80 passing cases. The threaded replacement matched all 80. The Svelte threaded attempt stalled before reporting, so the Svelte attribution uses the ordinary runner’s phase telemetry. The percentages count active V8 stack samples across all captured threads, excluding idle and program samples. They indicate where execution occurred and can overlap across categories. Instrumentation timings are diagnostic.

[Raw sample attribution](../.cache/real-project-telemetry-4oar9n/profile-analysis.json) · [Vitest case qualification](../.cache/real-project-telemetry-4oar9n/vitest/qualification.json) · [Material UI worker qualification](../.cache/real-project-telemetry-4oar9n/vitest/thread-profile-qualification.json) · [Supabase UI worker qualification](../.cache/real-project-telemetry-4oar9n/vitest/thread-profile-supabase-qualification.json) · [Focused Ant Design qualification](../.cache/real-project-telemetry-4oar9n/vitest/radio-qualification.json) · [Jest case qualification](../.cache/real-project-telemetry-4oar9n/jest/qualification.json)
