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

describe.each(providers)("$name <alpha-value> percentages", ({ Constructor }) => {
  const properties = [
    "opacity",
    "fill-opacity",
    "stroke-opacity",
    "flood-opacity",
    "stop-opacity",
    "shape-image-threshold",
  ];

  it("should specify a percentage as the equivalent number in inline declarations", () => {
    // Given: a fresh element per property and percentage.
    const { window } = new Constructor();
    try {
      for (const property of properties) {
        for (const [input, specified] of [
          ["50%", "0.5"],
          ["-100%", "-1"],
          ["300%", "3"],
          ["0%", "0"],
          ["12.5%", "0.125"],
          ["1e2%", "1"],
          ["0.0001%", "0.000001"],
          ["calc(50%)", "calc(50%)"],
        ] as const) {
          const element = window.document.createElement("div");
          // When: the percentage is written through setProperty and the style attribute.
          element.style.setProperty(property, input);
          const attributed = window.document.createElement("div");
          attributed.setAttribute("style", `${property}: ${input}`);
          // Then: both declarations hold the number jsdom specifies.
          expect([property, input, element.style.getPropertyValue(property)]).toEqual([
            property,
            input,
            specified,
          ]);
          expect([property, input, element.getAttribute("style")]).toEqual([
            property,
            input,
            `${property}: ${specified};`,
          ]);
          expect([property, input, attributed.style.getPropertyValue(property)]).toEqual([
            property,
            input,
            specified,
          ]);
        }
      }
      const element = window.document.createElement("div");
      element.style.opacity = "25%";
      expect(element.style.opacity).toBe("0.25");
    } finally {
      window.close();
    }
  });

  it("should specify a percentage as a number in stylesheet rules and compute it", () => {
    // Given: a stylesheet rule with percentage opacities.
    const { window } = new Constructor(
      `<style>.o { opacity: 50%; fill-opacity: 25% }</style><div class="o"></div>`,
    );
    try {
      const rule = window.document.styleSheets[0]!.cssRules[0] as CSSStyleRule;
      // When/Then: the rule serializes numbers and the computed opacity agrees.
      expect(rule.cssText).toBe(".o { opacity: 0.5; fill-opacity: 0.25; }");
      expect(rule.style.getPropertyValue("opacity")).toBe("0.5");
      expect(window.getComputedStyle(window.document.querySelector("div")!).opacity).toBe("0.5");
    } finally {
      window.close();
    }
  });
});
