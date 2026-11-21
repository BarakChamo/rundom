# Vue runtime-dom comparison — November 10, 2026

The November 12 follow-up fixes the computed custom-property failure and measures the full Vue runtime-dom suite. See [upstream framework compatibility and performance](framework-compatibility-results.md).

RunDOM passes the first small upstream Vue workload unchanged. It does not yet pass the complete runtime-dom package: a computed custom-property mismatch causes one reproducible failure and three subsequent failures in the same file.

The target is Vue **3.5.45**, commit [`8b479a89445868d474f17e2d837765e7c9ece5e4`](https://github.com/vuejs/core/tree/8b479a89445868d474f17e2d837765e7c9ece5e4), using its original `unit-jsdom` project, aliases, setup, sources, tests, snapshots and lockfile. Dependencies were installed with the frozen lockfile and lifecycle scripts disabled. The installed runner is Vitest **4.1.11**, with upstream's pinned jsdom **30.0.1**. RunDOM uses the default TypeScript parser and frozen cohort `Jdh05T`; its implementation sources match the working tree, and its installed runtime digest is checked before and after measurement. This is a workload comparison against Vue's installed jsdom version, rather than a version-equalized jsdom API qualification run.

## Compatibility

| Selection                                               | jsdom                 | RunDOM                          |
| ------------------------------------------------------- | --------------------- | ------------------------------- |
| Six core files, selected before running either provider | 85 passed             | 85 passed                       |
| Complete runtime-dom package, 16 files                  | 270 passed, 1 skipped | 266 passed, 4 failed, 1 skipped |

The initial small selection is `nodeOps`, `patchAttrs`, `patchClass`, `patchStyle`, `patchEvents` and `patchProps`, all under `packages/runtime-dom/__tests__`. Both providers also pass all 85 tests in each of nine measured fresh processes: **1,530 passing test executions** across the comparison. The full package's upstream skip, `defineCustomElement attrs shadowRoot should be initialized with delegatesFocus`, is unchanged. Every file outside `helpers/useCssVars.spec.ts` passes under RunDOM, including custom elements, static rendering, createApp, vModel and other directives.

The original tests and assertions are not patched. A Node resolution hook substitutes only the `jsdom` dependency used by Vitest's existing environment. Per-worker resolution records prove that each isolated file loads either upstream jsdom or the frozen RunDOM package; no provider-specific test setup or DOM polyfill is added. Upstream's existing `MathMLElement` stub is shared unchanged. The Vue checkout remains clean, and tracked source/test/config/lockfile hashes match before and after execution.

## Measured small workload

One threads worker runs at a time, with normal per-file isolation, file parallelism disabled and Vitest caching disabled. Both providers receive an unmeasured validation run before nine serial paired rounds; provider order alternates. Each sample starts a fresh Node process. Builds, installations and failure diagnostics are outside the timing phase. OS filesystem caches are warm. Measurements are exploratory shared-host observations on an Apple M4, macOS arm64, Node **24.20.0**.

| Median across nine processes                                 |     jsdom |    RunDOM |
| ------------------------------------------------------------ | --------: | --------: |
| Whole process                                                |  3,305 ms |  2,320 ms |
| Reported environment setup, summed across six isolated files |  1,850 ms |    746 ms |
| Sum of individual test durations                             |  110.6 ms |  115.3 ms |
| Peak complete-process RSS                                    | 439.6 MiB | 383.8 MiB |

RunDOM uses approximately **30% less whole-process time** and **13% less peak process RSS** on this selection. It finishes faster in all nine paired rounds. Whole-process median absolute deviations are 518 ms for jsdom and 556 ms for RunDOM; host conditions varied materially during the run. The median paired process ratio is 1.54, distinct from the ratio of the two independent medians. These results establish an observed setup/process advantage on this passing selection, with no demonstrated test-body runtime advantage or certified general speed ratio.

RSS comes from macOS `/usr/bin/time -l` and includes Vitest, Vite, Vue, the DOM environment and worker threads. It does not measure retained DOM heap or prove absence of leaks. The full package contains failing RunDOM tests, so its one-off durations are retained as diagnostic evidence and receive no equivalent-work performance claim.

## Reproducible compatibility gap

Vue's `useCssVars with delay mount child` expects `getComputedStyle(element).getPropertyValue('--color')` to preserve `red`. RunDOM instead returns `rgb(255, 0, 0)`. A minimal DOM-only reproduction also finds the same problem with `--background-color`; a control variable, `--x`, retains its value.

| Inline custom property     | jsdom computed value | RunDOM computed value |
| -------------------------- | -------------------- | --------------------- |
| `--color: red`             | `red`                | `rgb(255, 0, 0)`      |
| `--background-color: blue` | `blue`               | `rgb(0, 0, 255)`      |
| `--x: red`                 | `red`                | `red`                 |

The computed-style path in `packages/dom/src/styles.ts` selects color normalization using `name.endsWith('-color')` before excluding custom properties. This explains the reproduced suffix-dependent mismatch; this comparison does not change that implementation.

The full run reports failures in `with delay mount child`, `with custom element`, `should set vars before child component onMount hook` and `should set vars as initial for nullish values`. Isolating the first test preserves its failure. Running the latter three together without the first test passes all three on both providers. Their full-suite failures are therefore consistent with cascading scheduler state after the first mounted-hook exception, rather than evidence of three additional independent DOM defects. All raw failures and the original package totals remain preserved.

## Evidence and reproduction

The one-shot evidence directory is `.cache/vue-dom-comparison/`:

- `manifest.json` pins upstream tracked-file hashes, dependency versions, candidate runtime/manifest digests and hook/driver hashes.
- `run.mjs` and `provider.mjs` preserve the serial driver and dependency substitution; `results.json` contains all full-package screens, small-suite validation screens and 18 measured processes. `driver.log` records completion.
- `full-{jsdom,rundom}-screen.json` and logs retain the complete package results; `small-{jsdom,rundom}-{0..8}.json` and logs retain measured runs, timings and resource usage. Matching `*-resolutions.jsonl` files record provider selection for every worker.
- `isolated-results.json` and `isolated-*.json` retain the first-failure and later-three-test diagnostics. Their test-name filters deliberately exclude unrelated tests; those exclusions are diagnostic scope, not new package skips.
- `reproduce.mjs` and `reproduction.json` retain the minimal custom-property example. Run it from the repository with `node .cache/vue-dom-comparison/reproduce.mjs`.

To repeat upstream checks directly, use the checkout at `.cache/upstream-vue-core`, set `VUE_DOM_PROVIDER` to `jsdom` or `rundom`, and set `NODE_OPTIONS=--import=/absolute/repository/.cache/vue-dom-comparison/provider.mjs`. Run `node node_modules/vitest/vitest.mjs run --project unit-jsdom packages/runtime-dom --maxWorkers 1 --no-file-parallelism --no-cache`. Replace `packages/runtime-dom` with the six explicit file paths above for the passing selection. Use a fresh evidence directory for a new measured matrix; the recorded driver is a one-shot capture and its resolution logs append.

No RunDOM or Vue implementation changes are part of this experiment. The next compatibility action is to preserve custom-property token values during computed-style color normalization, then rerun the unchanged complete package before expanding to another project.
