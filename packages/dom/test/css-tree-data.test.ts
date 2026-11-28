// Checks that the css-tree syntax data embedded at build time equals what css-tree's data module computes at start-up.
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
// @ts-expect-error The build helper is plain JavaScript without declarations.
import { serializeCssTreeData } from "../scripts/css-tree-data.mjs";

const require = createRequire(import.meta.url);

// Records every own key and whether each object has a null prototype, so equality covers shape.
function shape(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(shape);
  return {
    nullPrototype: Object.getPrototypeOf(value) === null,
    entries: Object.entries(value).map(([key, entry]) => [key, shape(entry)]),
  };
}

describe("serializeCssTreeData", () => {
  it("rebuilds the pinned css-tree syntax definitions exactly, prototypes and key order included", () => {
    // Given: the definitions css-tree's own data module computes from mdn-data and its patch
    const computed: unknown = createRequire(require.resolve("css-tree"))("./data.cjs");
    // When: they are serialized at build time and evaluated as the bundle would
    const embedded: unknown = runInNewContext(`(${serializeCssTreeData(computed)})`);
    // Then: every dictionary, syntax string, null prototype and key order is identical
    expect(JSON.stringify(shape(embedded))).toBe(JSON.stringify(shape(computed)));
  });
});
