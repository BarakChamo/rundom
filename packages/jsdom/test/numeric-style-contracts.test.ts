// Checks numeric CSS parsing and serialization against the public JSDOM facade contract.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM } = require("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: reference.JSDOM },
])("$name numeric CSS", ({ Constructor }) => {
  it.each([
    ["font-style", "oblique calc(sign(50%) * 1deg)"],
    ["filter", "hue-rotate(calc(sign(50%) * 1deg))"],
    ["transform", "rotate(calc(sign(50%) * 1deg))"],
    ["animation-duration", "calc(sign(50%) * 1s)"],
    ["transition-delay", "calc(sign(50%) * 1s)"],
  ])("rejects percentages without a numeric basis in %s", (property, value) => {
    // Given: angle/time contexts provide no percentage basis to sign().
    const { window: w } = new Constructor();
    try {
      const style = w.document.createElement("p").style;
      // When/Then: an invalid declaration leaves the block empty.
      style.setProperty(property, value);
      expect(style.getPropertyValue(property)).toBe("");
      expect(style.length).toBe(0);
    } finally {
      w.close();
    }
  });

  it("serializes mixed percentage and font-relative math at specified and computed stages", () => {
    // Given: the percentage remains unresolved while em has a computed font basis.
    const { window: w } = new Constructor(
      '<p style="font-size:16px;text-indent:min(10% + 30px, 5em + 5%)"></p>',
    );
    try {
      const target = w.document.querySelector("p");
      if (!target) throw new Error("Expected target");
      target.style.setProperty("text-indent", "min(10% + 30px, 5em + 5%)");
      // When/Then: both stages order terms canonically and retain comma spacing.
      expect(target.style.getPropertyValue("text-indent")).toBe("min(10% + 30px, 5% + 5em)");
      expect(w.getComputedStyle(target).getPropertyValue("text-indent")).toBe(
        "min(10% + 30px, 5% + 80px)",
      );
    } finally {
      w.close();
    }
  });

  it("supplies initial automatic minimum sizes", () => {
    // Given: no author minimum size exists on an ordinary block.
    const { window: w } = new Constructor("<p></p>");
    try {
      const target = w.document.querySelector("p");
      if (!target) throw new Error("Expected target");
      // When/Then: headless computed values retain auto rather than a missing declaration.
      const computed = w.getComputedStyle(target);
      expect(computed.getPropertyValue("min-width")).toBe("auto");
      expect(computed.getPropertyValue("min-height")).toBe("auto");
    } finally {
      w.close();
    }
  });
});
