// Preserves per-view reflection and mutation behavior when immutable membership data is privately shared.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name static views", ({ Constructor }) => {
  it("keeps cached and first-use views independently reflective", () => {
    const w = new Constructor('<p class="item" id="a"></p><p class="item" id="b"></p>').window;
    try {
      const first = w.document.querySelectorAll(".item"),
        second = w.document.querySelectorAll(".item"),
        third = w.document.querySelectorAll(".item");
      expect(first === second || second === third).toBe(false);
      function trace(view: typeof first) {
        const entry = Object.getOwnPropertyDescriptor(view, "0");
        const results: unknown[] = [
          Object.getPrototypeOf(view) === w.NodeList.prototype,
          Object.keys(view),
          entry?.writable,
          entry?.enumerable,
          entry?.configurable,
        ];
        results.push(Reflect.set(view, "0", w.document.createElement("i")));
        results.push(Reflect.defineProperty(view, "01", { value: "padded", configurable: true }));
        results.push(Reflect.get(view, "01"), Reflect.deleteProperty(view, "01"));
        results.push(Reflect.preventExtensions(view));
        results.push(Reflect.defineProperty(view, "length", { value: 3, configurable: true }));
        results.push(view.length, view.item(1)?.id);
        Object.setPrototypeOf(view, Object.create(w.NodeList.prototype));
        results.push(Array.from(view, (node) => node?.id ?? "_"));
        Reflect.deleteProperty(view, "length");
        results.push(view.length, view.item(0)?.id);
        return results;
      }
      const expected = trace(first);
      expect(trace(second)).toEqual(expected);
      expect(trace(third)).toEqual(expected);
      Reflect.set(second, "marker", 17);
      expect(Reflect.has(first, "marker") || Reflect.has(third, "marker")).toBe(false);
    } finally {
      w.close();
    }
  });
  it("retains snapshot membership, foreign branding and closed-handle access", () => {
    const a = new Constructor('<p class="item" id="one"></p><p class="item" id="two"></p>').window,
      b = new Constructor('<i class="item" id="other"></i>').window;
    try {
      a.document.querySelectorAll(".item");
      const old = a.document.querySelectorAll(".item"),
        peer = a.document.querySelectorAll(".item");
      b.document.querySelectorAll(".item");
      const foreign = b.document.querySelectorAll(".item");
      const node = old.item(0);
      if (!node) throw new Error("Expected snapshot fixture");
      b.document.adoptNode(node);
      expect(old.item(0) === node && peer.item(0) === node).toBe(true);
      expect(old.length).toBe(2);
      expect(a.document.querySelectorAll(".item").length).toBe(1);
      expect(a.NodeList.prototype.item.call(foreign, 0)?.id).toBe("other");
      a.close();
      expect(old.item(0)?.ownerDocument === b.document).toBe(true);
      expect(Array.from(peer, (item) => item?.id)).toEqual(["one", "two"]);
    } finally {
      a.close();
      b.close();
    }
  });
});
