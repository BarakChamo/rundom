// Verifies background grammar expansion, shorthand invalidation and cascade through public declarations.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM } = require("jsdom");
const longhands = ["image", "position", "size", "repeat", "attachment", "origin", "clip", "color"];
const complex =
  'url("https://example.com/") 1px 2px / 3px 4px space round local padding-box content-box, rgb(5, 6, 7) url("https://example.com/") 1px 2px / 3px 4px space round local padding-box content-box';

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: reference.JSDOM },
])("$name background declarations", ({ Constructor }) => {
  it("expands every component of a multilayer background", () => {
    // Given: both layers supply position, size, repeat, attachment and box components.
    const { window: w } = new Constructor();
    try {
      const style = w.document.createElement("p").style;
      Reflect.set(style, "background", complex);
      // When/Then: expansion uses the whole background grammar and preserves the final-layer color.
      expect(longhands.map((name) => style.getPropertyValue(`background-${name}`))).toEqual([
        'url("https://example.com/"), url("https://example.com/")',
        "1px 2px, 1px 2px",
        "3px 4px, 3px 4px",
        "space round, space round",
        "local, local",
        "padding-box, padding-box",
        "content-box, content-box",
        "rgb(5, 6, 7)",
      ]);
      expect(style.getPropertyValue("background")).toContain("rgb(5, 6, 7)");
    } finally {
      w.close();
    }
  });

  it.each(["none", complex, "border-box content-box"])(
    "leaves no stale shorthand after clearing all longhands of %s",
    (source) => {
      // Given: background stores no independently surviving declaration after its components are removed.
      const { window: w } = new Constructor();
      try {
        const style = w.document.createElement("p").style;
        Reflect.set(style, "background", source);
        // When/Then: ordinary IDL setters clear both expanded values and the obsolete shorthand representation.
        for (const name of longhands) Reflect.set(style, `background-${name}`, "");
        expect(style.length).toBe(0);
        expect(style.cssText).toBe("");
      } finally {
        w.close();
      }
    },
  );

  it("preserves variable shorthand serialization and priority", () => {
    // Given: an unresolved background must survive declaration-list parsing.
    const { window: w } = new Constructor();
    try {
      const style = w.document.createElement("p").style;
      style.cssText = "background:var(--bg)!important;color:red";
      // When/Then: deferred substitution preserves the public shorthand and priority.
      expect(style.getPropertyValue("background")).toBe("var(--bg)");
      expect(style.getPropertyPriority("background")).toBe("important");
      expect(style.cssText).toBe("background: var(--bg) !important; color: red;");
    } finally {
      w.close();
    }
  });

  it("rejects a gradient angle with an unresolved percentage context", () => {
    // Given: percentages inside sign() cannot supply a gradient angle without a percentage basis.
    const { window: w } = new Constructor();
    try {
      const style = w.document.createElement("p").style;
      style.setProperty("background", "linear-gradient(calc(sign(50%) * 1turn), red, blue)");
      // When/Then: no invalid shorthand value is published.
      expect(style.getPropertyValue("background")).toBe("");
    } finally {
      w.close();
    }
  });

  it("keeps a previous important background when a later assignment is invalid", () => {
    // Given: a background color cannot occur before the final layer.
    const { window: w } = new Constructor();
    try {
      const style = w.document.createElement("p").style;
      style.setProperty("background", "blue", "important");
      const before = style.cssText;
      // When/Then: invalid grammar has no partial longhand or priority effects.
      style.setProperty("background", "red, none");
      expect(style.cssText).toBe(before);
      expect(style.getPropertyPriority("background-color")).toBe("important");
    } finally {
      w.close();
    }
  });

  it("resets non-inherited background components and resolves explicit inheritance", () => {
    // Given: inherited and ordinary children share a parent with noninitial background values.
    const { window: w } = new Constructor(
      '<main style="background:blue fixed content-box"><p></p><p style="background:inherit"></p></main>',
    );
    try {
      const [plain, inherited] = Array.from(w.document.querySelectorAll("p"));
      if (!plain || !inherited) throw new Error("Expected children");
      // When/Then: only explicit inheritance carries the parent's background across the boundary.
      expect(w.getComputedStyle(plain).getPropertyValue("background-attachment")).toBe("scroll");
      expect(w.getComputedStyle(plain).getPropertyValue("background-clip")).toBe("border-box");
      expect(w.getComputedStyle(inherited).getPropertyValue("background-attachment")).toBe("fixed");
      expect(w.getComputedStyle(inherited).getPropertyValue("background-color")).toBe(
        "rgb(0, 0, 255)",
      );
    } finally {
      w.close();
    }
  });

  it("cascades variable background shorthands as individual longhands", () => {
    // Given: a more specific color declaration competes with a background containing a variable.
    const { window: w } = new Constructor(
      "<style>p{--bg:red;background:var(--bg)}#x{background-color:blue}</style><p id=x></p>",
    );
    try {
      const target = w.document.querySelector("p");
      if (!target) throw new Error("Expected target");
      // When/Then: substitution cannot override a stronger competing longhand declaration.
      expect(w.getComputedStyle(target).getPropertyValue("background-color")).toBe(
        "rgb(0, 0, 255)",
      );
    } finally {
      w.close();
    }
  });
});
