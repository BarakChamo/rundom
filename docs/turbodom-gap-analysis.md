# RunDOM and TurboDOM: where the remaining gap comes from

November 28, 2026. This records the profile-backed comparison of RunDOM with TurboDOM 0.8.6 and the three optimization batches that followed (pull requests #1, #2 and #3, plus the lazy CSS interface change). Figures are instructions retired in fresh single-threaded Node 24 processes on a shared development machine unless a row says otherwise. Treat them as indicative and re-measure before quoting them.

## Summary

TurboDOM's lead over RunDOM came from five sources. Three of them cannot be adopted by a DOM that must behave like jsdom 31.0.1. The other two were RunDOM's own costs, and the batches removed most of them.

| Source of TurboDOM's lead                                                                                                              | Status for RunDOM                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| No realm per Window: a Proxy over a nine-key object, one process-wide set of constructors, every tag class sharing `Element.prototype` | Not adoptable; jsdom requires per-Window constructors and prototypes. Remains the largest gap                                                |
| Almost no CSS engine: no `@media`, no `var()`, no initial values, no user-agent stylesheet                                             | Not adoptable; TurboDOM fails 22 of 33 simple computed-style checks where RunDOM and jsdom agree. RunDOM's own cold cost was largely removed |
| Cached results: the same `querySelectorAll` array and the same computed-style object until the document changes                        | Not adoptable; jsdom returns fresh objects. RunDOM made fresh objects cheap instead                                                          |
| One plain object per node                                                                                                              | RunDOM's per-node size was never the problem; its WeakMap side tables were, and are fixed                                                    |
| Little code loaded at start                                                                                                            | Partly addressed through lazy loading, code-cache priming and lazy interfaces                                                                |

## What was not a gap

- **Parsing.** RunDOM parses faster than TurboDOM (`innerHTML` 15.0M against 29.8M instructions; repeated `DOMParser` 3.8M against 8.9M).
- **Warm event dispatch.** Steady state is at parity (13.0k against 13.2k per dispatch); the lab's earlier 1.4–1.8× was JIT warm-up.
- **The lab's `globals-read` ratio.** The lab reads 9 keys from TurboDOM and about 502 from RunDOM. A fair comparison is about 32×, not 150×.
- **The wrapper and record split.** Modelled at 3–10% of per-operation cost; not worth undoing.
- **Real-suite wall time.** TurboDOM's figures include 96 failing Vue tests and 249 failing Material UI tests. About 85% of a test worker's CPU is module loading that no DOM affects.

## What changed

| Area                                                     | Before  | After       | Reference        |
| -------------------------------------------------------- | ------- | ----------- | ---------------- |
| First computed read, Emotion-shaped sheet, fresh process | 112 ms  | about 18 ms | jsdom 17 ms      |
| Whole process to first computed read                     | 2.28G   | about 1.39G | jsdom 3.63G      |
| Window create plus Vitest's read of every global         | 27.6M   | 15.4M       |                  |
| Fragment scenario peak RSS                               | 339 MiB | 151 MiB     | TurboDOM 142 MiB |
| Style churn peak memory                                  | 755 MiB | 95 MiB      |                  |
| `querySelectorAll` (lab `query-all`)                     | 6.2k    | 3.8k        | TurboDOM 0.3k    |
| MutationObserver attribute write                         | 25.0k   | 8.0k        | TurboDOM 1.8k    |
| `getComputedStyle().color`                               | 12.3k   | 7.25k       | jsdom 9.6k       |
| Inline `cssText` read                                    | 14.3k   | 1.7k        | jsdom 2.9k       |
| Inline write, then computed read                         | 266k    | 187k        | jsdom 91k        |
| Leaf append and remove                                   | 13.6k   | 11.8k       | TurboDOM 2.8k    |

Cold-start rows combine probes from different investigations and are approximate.

Lab matrix, both builds measured in one session on the same host, before batch 3 and after it:

| RunDOM slower in   | against TurboDOM (37 scenarios) | against jsdom (45) | against Happy DOM (39) |
| ------------------ | ------------------------------- | ------------------ | ---------------------- |
| First use          | 33 → 27                         | 18 → 3             | 23 → 15                |
| Warm batch         | 26 → 26                         | 7 → 2              | 12 → 11                |
| Whole-process span | 17 → 15                         | 0 → 0              | 0 → 0                  |
| Peak RSS           | 20 → 16                         | 2 → 0              | 3 → 2                  |

Across all three batches no Web Platform Test assertion that RunDOM passed was lost, and no test that passes on jsdom was lost in the Vue, Svelte or Material UI selections.

## Root causes that were fixed

- **WeakMap side tables kept dead trees alive.** V8's young-generation collector keeps a WeakMap value alive while its key is young, so every discarded tree was promoted to old space. Moving per-node view data into private slots took the fragment scenario from 18 major collections to none.
- **Three CSS engines on the cold path.** jsdom 31.0.1 itself runs one parse-once CSS engine. RunDOM layered cssstyle and css-tree on top of it, parsing a value three or four times, and any selector containing `:` loaded the 3.1 MB reference engine. Direct, differentially tested paths now serve common selectors and values, stylesheet blocks of known declarations skip cssstyle, and cssstyle's lexer is created on first use.
- **Expensive fresh objects.** Each `querySelectorAll` built closures, a handler with eight trap closures, a Proxy and a WeakMap entry; each `getComputedStyle` built two Proxies. Both now share handlers and keep state on the Proxy target, still returning a fresh object per call.
- **Eager work nothing observed.** MutationObserver records built their node lists eagerly; insertion scanned leaves; inline `cssText` re-serialized on every read; an inline write rebuilt the element's whole computed frame.
- **Eager interfaces.** Vitest's built-in jsdom environment reads every Window key once per test file. Seven rarely used CSS interfaces are now callable Proxies that build their class on first interaction, so that read loads no CSS code.

## Remaining gaps against TurboDOM

| Scenario family                                | Ratio after batch 3         | Cause                                                                          |
| ---------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| Global read, warm                              | about 10× span, 3× peak RSS | Per-Window interface objects                                                   |
| Window create and close                        | 4.3× span, 1.9× peak        | Per-Window classes: about 14M instructions against a measured V8 floor of 5.3M |
| `parse-html` family (new Window per operation) | 2.9–3.7× span               | Same as Window creation                                                        |
| First style use in the lab                     | 5–8×                        | TurboDOM has almost no CSS engine                                              |
| Role queries                                   | 1.9× warm                   | Computed-style reads up the ancestor chain                                     |
| Inline style writes                            | 1.6× jsdom                  | cssstyle setter and eager attribute reflection                                 |

## Rejected after measurement

Each of these was built or modelled and measured; reasons are in `docs/project-guide.md`.

- Table-generated interface members, a code-cached script per Window, shared functions in per-Window prototypes, Window pools.
- Lazily populated Proxy prototypes: 19 times the inherited lookup cost and visible through `util.types.isProxy`, `util.inspect`, `structuredClone` and `Function.prototype.toString`.
- `CSSStyleProperties` members as one object literal: compiling 3,360 accessors costs 45–60M instructions per process.
- A packed, disk-persisted parse cache shared across threads: distinct parsing is 0.8–1.4% of Material UI worker CPU.
- Node startup snapshots: they allow built-in modules only.
- Per-rule prepared declarations: blocks were already parsed once per process.
- Lazy constructors for rare element interfaces: about 10% of Window creation for a large change to tag dispatch.

## Next candidates

- Per-file start cost: profile a fresh Vitest worker. Undici is loaded by Vitest itself before RunDOM (measured on issue #5), so the remaining cost is most likely module loading, about 560M instructions per worker; not yet measured.
- Inline write pipeline: one validation per write, incremental `style` attribute reflection.
- Material UI single-process peak RSS read about 30 MiB higher after batch 3 in three CI runs; the cause is not yet identified.
- `css/css-cascade/all-prop-revert-layer-noop.html` takes 9–10 s, at the testharness limit, on every build.
- `getComputedStyle(element).cssText` throws a brand error under Vitest but returns an empty string from the built package.
