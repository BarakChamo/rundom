// Exercises real native HTML recovery and rejects malformed boundary payloads before allocation.
import { expect, it } from "vitest";
import { parseHTML, htmlSnapshotSchema, invariant, InvariantError } from "../src/index.js";

it("constructs malformed table content, templates, foreign attributes and document mode in Rust", () => {
  // Given: foster parenting and template/foreign-content edges require actual HTML tree construction.
  const parsed = parseHTML({
    markup:
      '<!doctype html><table>outside<tr><td>cell</table><template><svg><use xlink:href="#x"/></svg></template>',
    scriptingEnabled: false,
  });
  if (parsed.isErr()) throw new Error(`Native parser failed: ${parsed.error.type}`);
  const snapshot = parsed.value;
  expect(snapshot.mode).toBe("no-quirks");
  const body = snapshot.nodes.find((node) => node.kind === "element" && node.name === "body");
  expect(body?.children.map((index) => snapshot.nodes[index]?.kind)).toEqual([
    "text",
    "element",
    "element",
  ]);
  expect(snapshot.nodes.some((node) => node.name === "tbody")).toBe(true);
  const template = snapshot.nodes.find((node) => node.name === "template");
  expect(template?.template).not.toBeNull();
  const use = snapshot.nodes.find((node) => node.name === "use");
  expect(use?.namespace).toBe("http://www.w3.org/2000/svg");
  expect(use?.attrs).toEqual([["href", "#x", "http://www.w3.org/1999/xlink", "xlink"]]);
});

it("rejects invalid public input without coercion or native execution", () => {
  // Given/When/Then: input repair would hide a caller's unsupported type.
  const parsed = parseHTML({ markup: 123, scriptingEnabled: false });
  expect(parsed.isErr() && parsed.error.type).toBe("invalid_request");
});

it("rejects cyclic, shared, out-of-range and incorrectly typed native ownership edges", () => {
  // Given: a real valid native payload becomes the seed for independent corruptions.
  const parsed = parseHTML({ markup: "<p>text</p>", scriptingEnabled: false });
  if (parsed.isErr()) throw new Error(`Native parser failed: ${parsed.error.type}`);
  expect(htmlSnapshotSchema.safeParse(parsed.value).success).toBe(true);
  const corruptions = [
    (value: typeof parsed.value) => {
      value.nodes[0]?.children.push(value.nodes.length);
    },
    (value: typeof parsed.value) => {
      value.nodes[0]?.children.push(0);
    },
    (value: typeof parsed.value) => {
      const child = value.nodes[0]?.children[0];
      if (child !== undefined) value.nodes[0]?.children.push(child);
    },
    (value: typeof parsed.value) => {
      const node = value.nodes.find((node) => node.kind === "text");
      if (node) node.children = [1];
    },
    (value: typeof parsed.value) => {
      const node = value.nodes.find((node) => node.kind === "element");
      if (node) node.template = 0;
    },
  ];
  for (const corrupt of corruptions) {
    const value = structuredClone(parsed.value);
    corrupt(value);
    expect(htmlSnapshotSchema.safeParse(value).success).toBe(false);
  }
});

it("keeps producer invariants distinct from recoverable native errors", () => {
  // Given/When/Then: an impossible state throws its own programmer-error class.
  expect(() => invariant(false, "broken producer promise")).toThrow(InvariantError);
  expect(() => invariant(true, "valid producer promise")).not.toThrow();
});

it("rejects unpaired UTF-16 and unknown fallback reasons without repairing them", async () => {
  // Given/When/Then: the adapter must report unsupported input before UTF-8 conversion.
  const { recordParserFallback, getParserStatistics } = await import("../src/index.js");
  const before = getParserStatistics();
  const parsed = parseHTML({ markup: "<p>\ud800</p>", scriptingEnabled: false });
  expect(parsed.isErr() && parsed.error.type).toBe("invalid_request");
  expect(recordParserFallback("unknown").isErr()).toBe(true);
  expect(getParserStatistics()).toEqual(before);
  expect(recordParserFallback("utf16_surrogate").isOk()).toBe(true);
  expect(getParserStatistics().fallbacks.utf16_surrogate).toBe(
    (before.fallbacks.utf16_surrogate ?? 0) + 1,
  );
});
