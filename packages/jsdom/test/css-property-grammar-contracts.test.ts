// Checks declaration aliases, legacy sizing and keyframe grammar through the public CSSOM.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM } = require("jsdom");
const aliases = [
  ["-webkit-background-clip", "background-clip"],
  ["-webkit-background-origin", "background-origin"],
  ["-webkit-background-size", "background-size"],
  ["-webkit-flex-basis", "flex-basis"],
  ["-webkit-flex-grow", "flex-grow"],
  ["-webkit-flex-shrink", "flex-shrink"],
  ["-webkit-flex", "flex"],
] as const;

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: reference.JSDOM },
])("$name CSS property grammar", ({ Constructor }) => {
  it.each([
    "auto",
    "640px 480px",
    "8.5in 11in",
    "inherit",
    "initial",
    "revert-layer",
    "var(--paper)",
    "10% min-content",
    "auto 10px",
  ])("accepts the reference's size declaration %s", (value) => {
    // Given: the facade exposes the legacy page-size declaration through ordinary CSSOM.
    const { window: w } = new Constructor();
    try {
      const style = w.document.createElement("p").style;
      Reflect.set(style, "size", value);
      // When/Then: native grammar validation produces an observable declaration and priority.
      expect(style.getPropertyValue("size")).not.toBe("");
      style.setProperty("size", value, "important");
      expect(style.getPropertyPriority("size")).toBe("important");
      const before = style.cssText;
      for (const invalid of ["-1px", "a4", "letter", "landscape", "100px 200px 300px"]) {
        style.setProperty("size", invalid);
        expect(style.cssText).toBe(before);
      }
    } finally {
      w.close();
    }
  });

  it.each(["0", "1.3", "16"])("normalizes a numeric aspect ratio %s", (value) => {
    // Given: omitting the denominator means one rather than an invalid ratio.
    const { window: w } = new Constructor("<p></p>");
    try {
      const target = w.document.querySelector("p");
      if (!target) throw new Error("Expected target");
      target.style.setProperty("aspect-ratio", value);
      // When/Then: specified and computed values retain the ratio.
      expect(target.style.getPropertyValue("aspect-ratio")).toBe(`${value} / 1`);
      expect(w.getComputedStyle(target).getPropertyValue("aspect-ratio")).toBe(`${value} / 1`);
    } finally {
      w.close();
    }
  });

  it.each([
    "entry 10%",
    "exit 60%",
    "calc(10%)",
    "calc(10% * sibling-index())",
    "calc(10% * sign(1em - 1px))",
    "entry calc(10%)",
    "exit calc(60%)",
  ])("retains a valid keyframe selector %s", (value) => {
    // Given: the native selector grammar supports timeline ranges and percentage calculations.
    const { window: w } = new Constructor("<style></style>");
    try {
      const sheet = w.document.styleSheets[0];
      if (!sheet) throw new Error("Expected sheet");
      sheet.insertRule(`@keyframes example { ${value} { color:red } }`, 0);
      const rule = sheet.cssRules[0];
      // When/Then: the parsed keyframe survives instead of being silently discarded.
      if (!(rule instanceof w.CSSKeyframesRule)) throw new Error("Expected keyframes rule");
      expect(rule.cssRules.length).toBe(1);
      const frame = rule.cssRules[0];
      if (!frame || !("style" in frame)) throw new Error("Expected keyframe style");
      expect(frame.style.getPropertyValue("color")).toBe("red");
    } finally {
      w.close();
    }
  });

  it("exposes the CSS namespace class-string descriptor", () => {
    // Given: namespace identity has a configurable, readonly, non-enumerable symbol tag.
    const { window: w } = new Constructor();
    try {
      // When/Then: identity is standard without replacing Object.prototype.toString.
      expect(Object.getOwnPropertyDescriptor(w.CSS, Symbol.toStringTag)).toEqual({
        value: "CSS",
        writable: false,
        enumerable: false,
        configurable: true,
      });
      expect(Object.prototype.toString.call(w.CSS)).toBe("[object CSS]");
    } finally {
      w.close();
    }
  });
});

// Chromium confirms canonical alias semantics; pinned jsdom lacks these direct operations.
describe("RunDOM CSS aliases", () => {
  it.each(aliases)("uses one declaration for %s and %s", (alias, target) => {
    // Given: aliases and canonical names refer to the same declaration and priority.
    const { window: w } = new JSDOM();
    try {
      const style = w.document.createElement("p").style;
      style.setProperty(target, "initial", "important");
      // When/Then: reads, writes, priorities and removals agree through either spelling.
      expect(style.getPropertyValue(alias)).toBe("initial");
      expect(style.getPropertyPriority(alias)).toBe("important");
      style.setProperty(alias, "inherit", "important");
      expect(style.getPropertyValue(target)).toBe("inherit");
      expect(style.getPropertyPriority(target)).toBe("important");
      expect(style.removeProperty(alias)).toBe("inherit");
      expect(style.getPropertyValue(target)).toBe("");
    } finally {
      w.close();
    }
  });

  it("preserves canonical importance across alias declaration-list writes", () => {
    // Given: a later ordinary alias declaration competes with an important canonical declaration.
    const { window: w } = new JSDOM();
    try {
      const style = w.document.createElement("p").style;
      style.cssText = "flex-grow:2!important;-webkit-flex-grow:3";
      // When/Then: source ordering does not give aliases a separate priority slot.
      expect(style.getPropertyValue("flex-grow")).toBe("2");
      expect(style.getPropertyValue("-webkit-flex-grow")).toBe("2");
      expect(style.getPropertyPriority("-webkit-flex-grow")).toBe("important");
    } finally {
      w.close();
    }
  });
});
