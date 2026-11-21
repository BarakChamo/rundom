// Checks the opaque native view's ownership, public snapshot compatibility and independent outputs.
import { describe, expect, it } from "vitest";
import { getParserStatistics, parseHTML, parseHTMLArena } from "../src/index.js";

describe("validated native arena", () => {
  it.each([
    '<!doctype html><p data-v="é">hello😀</p>',
    "<template><svg><title>λ</title></svg></template>",
    "<table>foster<tr><td><math><mi>x</mi></math></td></tr></table>",
    '<form id="f"></form><input form="f"><!-- retained -->',
  ])("preserves public snapshots for %s", (markup) => {
    // Given: stable snapshot parsing and direct native arena parsing count as separate actual calls.
    const before = getParserStatistics().nativeCalls;
    const snapshot = parseHTML({ markup, scriptingEnabled: false });
    const arena = parseHTMLArena({ markup, scriptingEnabled: false });
    if (snapshot.isErr() || arena.isErr()) throw new Error("Expected a valid native fixture");
    // When/Then: both representations share complete validated semantics, including detached slots.
    expect(arena.value.snapshot()).toEqual(snapshot.value);
    expect(arena.value.length).toBe(snapshot.value.nodes.length);
    expect(arena.value.mode).toBe(snapshot.value.mode);
    expect(getParserStatistics().nativeCalls - before).toBe(2);
  });
  it("does not expose mutable words and returns independently owned attribute/snapshot data", () => {
    // Given: a fully validated native allocation whose wire must stay private.
    const parsed = parseHTMLArena({
      markup: '<p data-value="first">text</p>',
      scriptingEnabled: false,
    });
    if (parsed.isErr()) throw new Error("Expected native arena");
    const arena = parsed.value;
    expect(Reflect.ownKeys(arena)).toEqual([]);
    expect(Object.isFrozen(Object.getPrototypeOf(arena))).toBe(true);
    expect(Reflect.set(arena, "mode", "quirks")).toBe(false);
    const snapshot = arena.snapshot();
    const slot = snapshot.nodes.findIndex((node) => node.kind === "element" && node.name === "p");
    if (slot < 0) throw new Error("Expected paragraph slot");
    // When: independent consumer representations are changed.
    const attr = arena.attributeAt(slot, 0);
    attr.value = "changed";
    const tuple = snapshot.nodes[slot]?.attrs[0];
    if (!tuple) throw new Error("Expected attribute fixture");
    tuple[1] = "different";
    snapshot.nodes.length = 0;
    // Then: later reads preserve the validated wire and real native output.
    expect(arena.attributeAt(slot, 0).value).toBe("first");
    expect(arena.snapshot().nodes[slot]?.attrs[0]?.[1]).toBe("first");
  });
  it("rejects invalid requests before native invocation and bounds semantic reads", () => {
    // Given/When: malformed requests cannot reach the addon.
    const before = getParserStatistics().nativeCalls;
    expect(parseHTMLArena({ markup: 12, scriptingEnabled: false }).isErr()).toBe(true);
    expect(getParserStatistics().nativeCalls).toBe(before);
    const parsed = parseHTMLArena({ markup: "<p>x</p>", scriptingEnabled: false });
    if (parsed.isErr()) throw new Error("Expected native arena");
    // Then: out-of-range kind discovery is absent; indexed field reads require valid integer slots.
    expect(parsed.value.kind(-1)).toBeUndefined();
    expect(parsed.value.kind(parsed.value.length)).toBeUndefined();
    expect(() => parsed.value.name(parsed.value.length)).toThrow("existing integer slot");
    expect(() => parsed.value.name(0.5)).toThrow("existing integer slot");
    const constructor: unknown = Reflect.get(Object.getPrototypeOf(parsed.value), "constructor");
    if (typeof constructor !== "function") throw new Error("Expected internal arena constructor");
    expect(() => Reflect.construct(constructor, [Symbol(), {}])).toThrow("native-owned boundary");
  });
});
