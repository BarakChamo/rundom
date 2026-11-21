// Checks the public WebIDL boundary around private inline, rule and computed CSS declarations.
import { describe, it, expect } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("CSSStyleDeclaration public views", () => {
  it("keeps every property accessor distinct across Windows and borrows through receiver ownership", () => {
    // Given: private implementation metadata may be shared while public functions remain independently mutable.
    const a = new JSDOM('<p style="color:red"></p>'),
      b = new JSDOM('<p style="color:blue"></p>');
    try {
      const ap = a.window.CSSStyleProperties.prototype,
        bp = b.window.CSSStyleProperties.prototype;
      const names = Object.getOwnPropertyNames(ap);
      expect(names).toEqual(Object.getOwnPropertyNames(bp));
      const node = b.window.document.querySelector("p");
      if (!node) throw new Error("Expected receiver-owned style");
      const style = node.style;
      for (const name of names) {
        const first = Object.getOwnPropertyDescriptor(ap, name),
          second = Object.getOwnPropertyDescriptor(bp, name);
        if (!first?.get || !first.set || !second?.get || !second.set) continue;
        expect(first.get).not.toBe(second.get);
        expect(first.set).not.toBe(second.set);
        expect(first.get.name).toBe(second.get.name);
        expect(first.get.length).toBe(0);
        expect(first.set.length).toBe(1);
        expect(first.enumerable).toBe(true);
        expect(first.configurable).toBe(true);
      }
      // When/Then: a borrowed writer publishes through the destination implementation, preserving snapshots.
      const color = Object.getOwnPropertyDescriptor(ap, "color");
      if (!color?.get || !color.set) throw new Error("Expected color accessor");
      const before = b.window.getComputedStyle(node);
      color.set.call(style, "green");
      expect(color.get.call(style)).toBe("green");
      expect(before.color).toBe("rgb(0, 0, 255)");
      expect(a.window.document.querySelector("p")?.style.color).toBe("red");
      expect(() => color.get?.call({})).toThrow("Illegal invocation");
    } finally {
      a.window.close();
      b.window.close();
    }
  });

  it("publishes CSS property names in IDL order after reads, writes and inherited lookups", () => {
    const first = new JSDOM("<p></p>"),
      reference = new JSDOM();
    try {
      const node = first.window.document.querySelector("p");
      if (!node) throw new Error("Expected the styled element");
      const style = node.style;
      expect(Reflect.set(style, "zIndex", "3")).toBe(true);
      expect("writingMode" in style).toBe(true);
      expect(Reflect.get(first.window.getComputedStyle(node), "zIndex")).toBe("3");

      const prototype = Object.getPrototypeOf(style);
      expect(Reflect.ownKeys(prototype)).toEqual(
        Reflect.ownKeys(reference.window.CSSStyleProperties.prototype),
      );
      expect(prototype).toBe(first.window.CSSStyleProperties.prototype);
      expect(Reflect.deleteProperty(prototype, "zIndex")).toBe(true);
      expect("zIndex" in style).toBe(false);
      Object.defineProperty(prototype, "zIndex", { value: "overridden", configurable: true });
      expect(Reflect.get(style, "zIndex")).toBe("overridden");
      expect(Reflect.get(first.window.getComputedStyle(node), "zIndex")).toBe("overridden");
    } finally {
      first.window.close();
      reference.window.close();
    }
  });

  it("preserves page descriptor accessors without exposing ordinary style properties", () => {
    // Given: page declarations use the base implementation rather than CSSStyleProperties.
    const { window } = new JSDOM("<style>@page{margin:1px 2px 3px 4px;size:A4}</style>");
    try {
      const rule = window.document.styleSheets[0]?.cssRules[0];
      if (!(rule instanceof window.CSSPageRule)) throw new Error("Expected page rule");
      const style = rule.style;
      // When/Then: both margin spellings reach private storage and retain ordinary branding.
      expect(Reflect.get(style, "marginLeft")).toBe("4px");
      expect(Reflect.set(style, "margin-left", "99px")).toBe(true);
      expect(Reflect.get(style, "marginLeft")).toBe("99px");
      expect(style.getPropertyValue("margin-left")).toBe("99px");
      expect(Object.hasOwn(Object.getPrototypeOf(style), "size")).toBe(true);
      expect(Reflect.get(style, "cssFloat")).toBeUndefined();
      expect(Reflect.get(style, "_values")).toBeUndefined();
      expect(style instanceof window.CSSStyleDeclaration).toBe(true);
      expect(rule.style).toBe(style);
    } finally {
      window.close();
    }
  });
  it("hides implementation state on inline, rule and computed declarations", () => {
    // Given: all declaration sources expose the same public interface boundary.
    const { window } = new JSDOM('<style>p{color:red}</style><p style="margin:2px"></p>');
    try {
      const node = window.document.querySelector("p");
      if (!node) throw new Error("Expected paragraph");
      const rule = window.document.styleSheets[0]?.cssRules[0];
      if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected style rule");
      for (const style of [node.style, rule.style, window.getComputedStyle(node)]) {
        // When/Then: storage and internal mutators cannot escape through ordinary properties.
        for (const name of ["_values", "_priorities", "_length", "_setProperty", "_global"])
          expect(Reflect.get(style, name)).toBeUndefined();
        expect(Object.keys(style)).toEqual(Array.from(style, (_, index) => String(index)));
        Reflect.set(style, "_values", new Map([["color", "blue"]]));
        expect(style.getPropertyValue("color")).not.toBe("blue");
      }
      expect(node.style).toBe(node.style);
      expect(rule.style).toBe(rule.style);
    } finally {
      window.close();
    }
  });

  it("exposes readonly supported indices and rejects changes to extensibility", () => {
    // Given: declaration indices are legacy platform properties, not ordinary writable fields.
    const { window } = new JSDOM('<p style="color:red"></p>');
    try {
      const node = window.document.querySelector("p");
      if (!node) throw new Error("Expected paragraph");
      for (const style of [node.style, window.getComputedStyle(node)]) {
        const name = style.item(0);
        expect(Object.getOwnPropertyDescriptor(style, "0")).toEqual({
          value: name,
          writable: false,
          enumerable: true,
          configurable: true,
        });
        // When/Then: all canonical array indices reject writes/definitions; unsupported deletion succeeds.
        for (const key of ["0", "100000"]) {
          expect(Reflect.set(style, key, "changed")).toBe(false);
          expect(Reflect.defineProperty(style, key, { value: "changed", configurable: true })).toBe(
            false,
          );
        }
        expect(Reflect.deleteProperty(style, "0")).toBe(false);
        expect(Reflect.deleteProperty(style, "100000")).toBe(true);
        expect(Reflect.set(style, "01", "expando")).toBe(true);
        expect(Reflect.get(style, "01")).toBe("expando");
        expect(Reflect.preventExtensions(style)).toBe(false);
        expect(Object.isExtensible(style)).toBe(true);
        expect(() => Object.freeze(style)).toThrow(TypeError);
        expect(style.item(0)).toBe(name);
      }
    } finally {
      window.close();
    }
  });

  it("converts item indices and validates required arguments through the interface", () => {
    // Given: WebIDL unsigned-long conversion applies before indexed lookup.
    const { window } = new JSDOM('<p style="color:red;margin:2px"></p>');
    try {
      const style = window.document.querySelector("p")?.style;
      if (!style) throw new Error("Expected style");
      for (const value of [undefined, NaN, Infinity, 4294967296, "1x"])
        expect(Reflect.apply(style.item, style, [value])).toBe(style[0]);
      expect(style.item(1.9)).toBe(style[1]);
      expect(style.item(-1)).toBe("");
      expect(() => Reflect.apply(style.item, style, [])).toThrow(/1 argument required/);
      expect(() => Reflect.apply(style.item, style, [Symbol()])).toThrow(TypeError);
      expect(() => Reflect.apply(style.item, {}, [0])).toThrow(TypeError);
      expect(window.CSSStyleDeclaration.prototype.item.length).toBe(1);
      expect(Object.hasOwn(window.CSSStyleDeclaration.prototype, "color")).toBe(false);
      expect(Object.hasOwn(window.CSSStyleProperties.prototype, "color")).toBe(true);
      expect(Object.getPrototypeOf(window.CSSStyleDeclaration.prototype)).toBe(Object.prototype);
    } finally {
      window.close();
    }
  });
  it("uses receiver-owned views and native iterators across isolated Windows", () => {
    // Given: borrowing a getter must not allocate a view with the caller's interface.
    const first = new JSDOM("<style>p{color:red}</style>", { runScripts: "outside-only" });
    const second = new JSDOM("<style>p{color:blue}</style><p></p>", { runScripts: "outside-only" });
    try {
      const a = first.window,
        b = second.window;
      const rule = b.document.styleSheets[0]?.cssRules[0];
      if (!(rule instanceof b.CSSStyleRule)) throw new Error("Expected style rule");
      const getter = Object.getOwnPropertyDescriptor(a.CSSStyleRule.prototype, "style")?.get;
      if (!getter) throw new Error("Expected style getter");
      const borrowed = getter.call(rule);
      expect(borrowed).toBe(rule.style);
      expect(borrowed instanceof b.CSSStyleProperties).toBe(true);
      expect(borrowed instanceof a.CSSStyleProperties).toBe(false);
      expect(borrowed[Symbol.iterator]).toBe(b.eval("Array.prototype.values"));
      expect(Object.getPrototypeOf(b.CSSStyleDeclaration.prototype)).toBe(
        b.eval("Object.prototype"),
      );
      expect(a.CSSStyleDeclaration.prototype.getPropertyValue.call(borrowed, "color")).toBe("blue");
    } finally {
      first.window.close();
      second.window.close();
    }
  });
  it("keeps stylesheet attachment and cascade independent of public rule style overrides", () => {
    // Given: a public accessor override must never intercept private stylesheet state.
    const { window } = new JSDOM("<style></style><p></p>");
    try {
      let calls = 0;
      Object.defineProperty(window.CSSStyleRule.prototype, "style", {
        configurable: true,
        get() {
          calls++;
          throw new Error("Author style getter");
        },
      });
      const sheet = window.document.querySelector("style"),
        node = window.document.querySelector("p");
      if (!sheet || !node) throw new Error("Expected style and paragraph");
      // When/Then: parsing and computed matching use the owning declaration record.
      sheet.textContent = "p{color:red}";
      expect(window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
      expect(calls).toBe(0);
    } finally {
      window.close();
    }
  });
  it("isolates public accessor function identity and expandos between Windows", () => {
    // Given: shared private metadata must not share mutable public function objects.
    const first = new JSDOM(),
      second = new JSDOM('<p style="color:blue"></p>');
    try {
      const a = Object.getOwnPropertyDescriptor(first.window.CSSStyleProperties.prototype, "color"),
        b = Object.getOwnPropertyDescriptor(second.window.CSSStyleProperties.prototype, "color");
      if (!a?.get || !a.set || !b?.get || !b.set) throw new Error("Expected color accessors");
      expect(a.get).not.toBe(b.get);
      expect(a.set).not.toBe(b.set);
      Object.defineProperty(a.get, "note", { value: "first Window" });
      expect(Reflect.get(b.get, "note")).toBeUndefined();
      const style = second.window.document.querySelector("p")?.style;
      if (!style) throw new Error("Expected inline style");
      // When/Then: borrowed getters still resolve through the receiver's private implementation.
      expect(a.get.call(style)).toBe("blue");
      let conversions = 0;
      a.set.call(style, {
        toString() {
          conversions++;
          style.setProperty("opacity", "0.5");
          return "red";
        },
      });
      expect(conversions).toBe(1);
      expect(b.get.call(style)).toBe("red");
      expect(style.getPropertyValue("opacity")).toBe("0.5");
    } finally {
      first.window.close();
      second.window.close();
    }
  });
});
