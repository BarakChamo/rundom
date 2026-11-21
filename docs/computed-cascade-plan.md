# Computed cascade reuse batch

Reduce repeated accessibility-query work while preserving the public getComputedStyle contract. The boundary is the document style controller in `packages/dom/src/styles.ts`; the public API and exception contracts do not change.

Each read still discovers current stylesheets and matches selectors, media, scopes, layers and state pseudo-classes. Capture the resulting ordered declaration inputs: specificity, context, base URL, proximity, layer rank, declaration order, property names, values, importance and logical-border source order. Compare observed values rather than introducing mutation epochs or retaining mutable declarations. A parent frame, target/ancestor role, UA direction/display/color state and relevant viewport/base dependencies must also agree before reusing a private completed frame. Return an independent readonly public view every time.

Cache inputs contain strings and scalar values, never declarations, rules, elements or callbacks. Existing frame memory and character budgets include retained inputs. Oversized inputs retain the complete existing computation path. A changed losing declaration may refresh a frame's input snapshot after the existing winner comparison proves the computed values unchanged. Live source reads preserve reentrant observation order. Scope/media/selector matching remains outside reuse.

The public test matrix covers selector specificity changes with the same matched-block count; live checked/valid/focus state; direct CSSOM priority/removal and rule reordering; dir=auto value changes without attribute mutation; inherited font/custom properties; layers/scopes/media; shadow inheritance; retained readonly views. Existing computed-reuse, CSS layers/nesting, border and document contracts remain acceptance gates.

1. Add focused source-input and directionality contracts and run them against the unchanged baseline. Performance is established by the existing repeated-query measurements, not timing assertions in unit tests.
2. Separate live input observation from cascade expansion. Reuse frames only for identical observed inputs and dependencies, preserving the existing winner-comparison fallback.
3. Account retained source data in existing frame budgets; update package/qualification documentation. Complete owned, API, strict packed type, four-pool Vitest, local and CSS WPT gates.
4. Freeze source/builds and qualify the full selected corpus. Run the same identity-checked fresh-process role/framework benchmarks serially after correctness workers stop. Retain negative results; no overall performance win follows from a microbenchmark alone.
