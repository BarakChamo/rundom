// Checks that longhand edits preserve shorthand values, priority, and canonical CSS text.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM } = require("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: reference.JSDOM },
])("$name shorthand state", ({ Constructor }) => {
  it.each([
    ["border: 1px; border-top: 1px", "border: 1px;"],
    ["border-width: 1px", "border-width: 1px;"],
    ["background: transparent", "background: none;"],
    [
      "border-top: 1px; border-right: 1px; border-bottom: 1px; border-left: 1px; border-image: none",
      "border: 1px;",
    ],
    [
      "border-top: 1px; border-right: 1px; border-bottom: 1px; border-left: 1px",
      "border-width: 1px; border-style: none; border-color: currentcolor;",
    ],
    [
      "border-top: 1px; border-right: 2px; border-bottom: 3px; border-left: 4px",
      "border-width: 1px 2px 3px 4px; border-style: none; border-color: currentcolor;",
    ],
    [
      "border: 1px; border-top: 1px !important",
      "border-right: 1px; border-bottom: 1px; border-left: 1px; border-image: none; border-top: 1px !important;",
    ],
    ["border: inherit", "border: inherit;"],
    ["border-top: inherit", "border-top: inherit;"],
    ["background: red; background-clip: content-box", "background: padding-box content-box red;"],
    [
      "background: content-box red; background-clip: padding-box",
      "background: content-box padding-box red;",
    ],
    [
      "background: border-box content-box red; background-clip: padding-box",
      "background: border-box padding-box red;",
    ],
  ])("serializes %s", (text, expected) => {
    // Given: a declaration block can overwrite part of a shorthand.
    const { window: w } = new Constructor();
    try {
      const style = w.document.createElement("p").style;
      style.cssText = text;
      // When/Then: serialization represents the actual longhands and their importance.
      expect(style.cssText).toBe(expected);
    } finally {
      w.close();
    }
  });

  it("round-trips component values and priority after mixed shorthand writes", () => {
    // Given: normal and important declarations coexist with unrelated properties.
    const { window: w } = new Constructor();
    try {
      const style = w.document.createElement("p").style;
      style.cssText =
        "color: red; border: 1px solid blue; --token: kept; border-top: 2px dashed green !important; border-left-color: black";
      const reparsed = w.document.createElement("p").style;
      // When: the public serialization is parsed as a fresh declaration block.
      reparsed.cssText = style.cssText;
      // Then: every physical component and its importance survive serialization.
      for (const side of ["top", "right", "bottom", "left"])
        for (const part of ["width", "style", "color"]) {
          const name = `border-${side}-${part}`;
          expect(reparsed.getPropertyValue(name)).toBe(style.getPropertyValue(name));
          expect(reparsed.getPropertyPriority(name)).toBe(style.getPropertyPriority(name));
        }
      expect(reparsed.getPropertyValue("--token")).toBe("kept");
      expect(reparsed.getPropertyValue("color")).toBe("red");
    } finally {
      w.close();
    }
  });

  it("clears a pending border-side shorthand when one component is replaced", () => {
    // Given: an unresolved shorthand cannot expose a partially substituted value.
    const { window: w } = new Constructor();
    try {
      const style = w.document.createElement("p").style;
      Reflect.set(style, "borderBottom", "var(--border-width, 1px)");
      Reflect.set(style, "borderColor", "rgb(117, 117, 117)");
      // When/Then: the changed component prevents serialization of the original shorthand.
      expect(Reflect.get(style, "borderBottom")).toBe("");
      expect(Reflect.get(style, "borderColor")).toBe("rgb(117, 117, 117)");
    } finally {
      w.close();
    }
  });

  it("clears a background shorthand whose CSS-wide components no longer agree", () => {
    // Given: CSS-wide keywords apply to the complete shorthand.
    const { window: w } = new Constructor();
    try {
      const style = w.document.createElement("p").style;
      Reflect.set(style, "background", "inherit");
      expect(Reflect.get(style, "background")).toBe("inherit");
      // When/Then: replacing a single component prevents shorthand serialization.
      Reflect.set(style, "backgroundColor", "red");
      expect(Reflect.get(style, "background")).toBe("");
      expect(Reflect.get(style, "backgroundColor")).toBe("red");
    } finally {
      w.close();
    }
  });
});
