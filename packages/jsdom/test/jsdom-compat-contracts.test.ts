// Pins behavior differences found by differential sweeps to jsdom 31.0.1, run on both providers.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM } = require("jsdom");

const providers = [
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: reference.JSDOM },
];

describe.each(providers)("$name CSSStyleDeclaration property names", ({ Constructor }) => {
  it("should match standard property names ASCII case-insensitively in every method", () => {
    // Given: inline, rule and computed declarations with mixed-case authored names.
    const { window } = new Constructor(
      `<style>.r { Opacity: 0.4 !IMPORTANT; --Foo: a }</style>` +
        `<div style="--Bar: 1; COLOR: red"></div>`,
    );
    try {
      const element = window.document.querySelector("div")!;
      const rule = (window.document.styleSheets[0]!.cssRules[0] as CSSStyleRule).style;
      const computed = window.getComputedStyle(element);
      // When/Then: upper-case standard names find the lower-case declarations.
      expect(element.style.getPropertyValue("COLOR")).toBe("red");
      expect(element.style.getPropertyValue("Color")).toBe("red");
      expect([rule.getPropertyValue("OPACITY"), rule.getPropertyPriority("OPACITY")]).toEqual([
        "0.4",
        "important",
      ]);
      expect(computed.getPropertyValue("DISPLAY")).toBe("block");
      // Then: only ASCII letters fold; U+212A KELVIN SIGN is not "k".
      expect(element.style.getPropertyValue("Kerning")).toBe("");
      // When: a shorthand is written and removed through upper-case names.
      element.style.setProperty("MARGIN", "1px", "IMPORTANT");
      expect([
        element.style.getPropertyPriority("MARGIN"),
        element.style.getPropertyPriority("MARGIN-TOP"),
        element.style.getPropertyValue("Margin-Top"),
      ]).toEqual(["important", "important", "1px"]);
      expect(element.style.removeProperty("Margin")).toBe("1px");
      // Then: the declaration is gone from the block and the attribute.
      expect(element.style.cssText).toBe("--Bar: 1; color: red;");
      element.style.setProperty("FONT-SIZE", "2px");
      expect(element.style.removeProperty("FONT-size")).toBe("2px");
      expect(element.getAttribute("style")).toBe("--Bar: 1; color: red;");
    } finally {
      window.close();
    }
  });

  it("should keep custom property names case-sensitive", () => {
    // Given: custom properties whose names differ only in case.
    const { window } = new Constructor(
      `<style>.r { --Foo: a }</style><div style="--Bar: 1"></div>`,
    );
    try {
      const element = window.document.querySelector("div")!;
      const rule = (window.document.styleSheets[0]!.cssRules[0] as CSSStyleRule).style;
      // When/Then: only the exact spelling reads, removes or computes.
      expect([
        element.style.getPropertyValue("--bar"),
        element.style.getPropertyValue("--Bar"),
      ]).toEqual(["", "1"]);
      expect([rule.getPropertyValue("--foo"), rule.getPropertyValue("--Foo")]).toEqual(["", "a"]);
      const computed = window.getComputedStyle(element);
      expect([computed.getPropertyValue("--BAR"), computed.getPropertyValue("--Bar")]).toEqual([
        "",
        "1",
      ]);
      element.style.setProperty("--X", "1");
      expect(element.style.removeProperty("--x")).toBe("");
      expect(element.style.removeProperty("--X")).toBe("1");
      expect(element.style.cssText).toBe("--Bar: 1;");
    } finally {
      window.close();
    }
  });
});
