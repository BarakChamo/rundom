// Checks immutable rule kinds and inherited CSSRule metadata across Window owners.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM } = require("jsdom");
const constants = {
  STYLE_RULE: 1,
  CHARSET_RULE: 2,
  IMPORT_RULE: 3,
  MEDIA_RULE: 4,
  FONT_FACE_RULE: 5,
  PAGE_RULE: 6,
  KEYFRAMES_RULE: 7,
  KEYFRAME_RULE: 8,
  MARGIN_RULE: 9,
  NAMESPACE_RULE: 10,
  COUNTER_STYLE_RULE: 11,
  SUPPORTS_RULE: 12,
  FONT_FEATURE_VALUES_RULE: 14,
};

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: reference.JSDOM },
])("$name CSSRule interface", ({ Constructor }) => {
  it("exposes constants as inherited immutable Web IDL constants", () => {
    // Given: a concrete rule inherits the CSSRule interface.
    const { window: w } = new Constructor("<style>p { color: red }</style>");
    try {
      const rule = w.document.styleSheets[0]?.cssRules[0];
      if (!rule) throw new Error("Expected rule");
      // When/Then: both interface and instances expose the same immutable descriptors.
      for (const [name, value] of Object.entries(constants)) {
        const descriptor = { value, writable: false, enumerable: true, configurable: false };
        expect(Object.getOwnPropertyDescriptor(w.CSSRule, name)).toEqual(descriptor);
        expect(Object.getOwnPropertyDescriptor(w.CSSRule.prototype, name)).toEqual(descriptor);
        expect(Reflect.get(rule, name)).toBe(value);
      }
    } finally {
      w.close();
    }
  });

  it.each([
    ["p {}", 1],
    ["@media all {}", 4],
    ["@supports (color: red) {}", 12],
    ["@font-face {}", 5],
    ["@keyframes example { from {} }", 7],
    ["@page {}", 6],
    ["@layer example;", 0],
    ["@layer example {}", 0],
  ] as const)("keeps %s kind on the inherited readonly getter", (text, kind) => {
    // Given: the kind belongs to parser allocation, not a mutable public field.
    const { window: w } = new Constructor(`<style>${text}</style>`);
    const { window: foreign } = new Constructor();
    try {
      const rule = w.document.styleSheets[0]?.cssRules[0];
      if (!rule) throw new Error("Expected rule");
      const descriptor = Object.getOwnPropertyDescriptor(foreign.CSSRule.prototype, "type");
      if (!descriptor?.get) throw new Error("Expected inherited kind getter");
      // When/Then: writes fail and a borrowed getter reads the receiver's own allocation.
      expect(Object.hasOwn(rule, "type")).toBe(false);
      expect(Reflect.set(rule, "type", 99)).toBe(false);
      expect(rule.type).toBe(kind);
      expect(descriptor.get.call(rule)).toBe(kind);
      expect(descriptor.enumerable).toBe(true);
      expect(descriptor.set).toBeUndefined();
      expect(() => descriptor.get?.call({})).toThrow(TypeError);
    } finally {
      w.close();
      foreign.close();
    }
  });

  it("brands parent getters and retains parent ownership across borrowed interfaces", () => {
    // Given: the public object belongs to one Window while getters come from another.
    const { window: w } = new Constructor("<style>@media all { p {} }</style>");
    const { window: foreign } = new Constructor();
    try {
      const sheet = w.document.styleSheets[0];
      const parent = sheet?.cssRules[0];
      if (!(parent instanceof w.CSSMediaRule)) throw new Error("Expected media rule");
      const child = parent.cssRules[0];
      for (const [name, value] of [
        ["parentRule", parent],
        ["parentStyleSheet", sheet],
      ] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(foreign.CSSRule.prototype, name);
        if (!descriptor?.get) throw new Error("Expected parent getter");
        // When/Then: receiver ownership survives borrowing while unrelated objects are rejected.
        expect(descriptor.get.call(child)).toBe(value);
        expect(() => descriptor.get?.call({})).toThrow(TypeError);
      }
    } finally {
      w.close();
      foreign.close();
    }
  });
});
