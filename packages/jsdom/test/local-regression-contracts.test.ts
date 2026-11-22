// Checks local upstream regression contracts at CSS transaction and DOM operation boundaries.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM } = require("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: reference.JSDOM },
])("$name local regression contracts", ({ Constructor }) => {
  it("keeps empty media rules without shifting subsequent rule identities", () => {
    // Given: the media list includes an empty condition and a disjunction.
    const { window: w } = new Constructor(
      "<style>@media screen {} @media print {} @media {} @media screen, print {} @media not all {}</style>",
    );
    try {
      const sheet = w.document.styleSheets[0];
      if (!sheet) throw new Error("Expected sheet");
      // When/Then: every rule survives parsing and evaluates its own condition.
      expect(sheet.cssRules.length).toBe(5);
      expect(
        Array.from(sheet.cssRules, (rule) => {
          if (!rule) throw new Error("Expected media rule");
          return Reflect.get(rule, "matches");
        }),
      ).toEqual([true, false, true, true, false]);
    } finally {
      w.close();
    }
  });

  it.each(["insertRule", "deleteRule", "replaceSync", "replace"] as const)(
    "locks %s while stylesheet replacement is pending",
    async (operation) => {
      // Given: replacement starts a transaction on a constructed stylesheet.
      const { window: w } = new Constructor();
      try {
        const sheet = new w.CSSStyleSheet();
        const pending = sheet.replace("p { color: red }");
        const error = { name: "NotAllowedError" };
        // When/Then: competing writes fail until the transaction releases its flag.
        if (operation === "replace")
          await expect(sheet.replace("p { color: blue }")).rejects.toMatchObject(error);
        else
          expect(() => {
            if (operation === "insertRule") sheet.insertRule("p {}", 0);
            else if (operation === "deleteRule") sheet.deleteRule(0);
            else sheet.replaceSync("p {}");
          }).toThrow(expect.objectContaining(error));
        expect(await pending).toBe(sheet);
        sheet.insertRule("div {}", sheet.cssRules.length);
        expect(sheet.cssRules.length).toBe(2);
        expect(Object.prototype.toString.call(sheet)).toBe("[object CSSStyleSheet]");
      } finally {
        w.close();
      }
    },
  );

  it("ignores invalid min syntax without changing an existing declaration", () => {
    // Given: an important positional value is already present.
    const { window: w } = new Constructor();
    try {
      const style = w.document.createElement("p").style;
      style.setProperty("left", "1px", "important");
      const original = style.cssText;
      // When/Then: failed syntax recovery is an atomic no-op rather than an exception.
      expect(() => style.setProperty("left", "min(1px, @x)")).not.toThrow();
      expect(style.cssText).toBe(original);
      expect(style.getPropertyPriority("left")).toBe("important");
    } finally {
      w.close();
    }
  });

  it.each([
    ["6.25rem calc((100% - 6.25rem) / 1)", "6.25rem calc(100% - 6.25rem)"],
    [
      "6.25rem 60% calc((40% - 6.25rem) / 2) calc((40% - 6.25rem) / 2)",
      "6.25rem 60% calc(20% - 3.125rem) calc(20% - 3.125rem)",
    ],
  ] as const)("retains all tracks in %s", (value, expected) => {
    // Given: mixed percentage/font-relative math cannot be reduced without layout context.
    const { window: w } = new Constructor();
    try {
      const style = w.document.createElement("p").style;
      style.setProperty("grid-template-columns", value);
      // When/Then: the complete valid track list survives native grammar validation.
      expect(style.getPropertyValue("grid-template-columns")).toBe(expected);
      const original = style.cssText;
      style.setProperty("grid-template-columns", "6rem invalid-track");
      expect(style.cssText).toBe(original);
    } finally {
      w.close();
    }
  });

  it.each([
    ["dark", "light", "rgb(255, 255, 255)"],
    ["light", "dark", "rgb(0, 0, 0)"],
  ])("inherits a system border color from %s into %s", (parentScheme, childScheme, expected) => {
    // Given: a child explicitly inherits its parent's system border color across color schemes.
    const { window: w } = new Constructor(
      `<div style="color-scheme:${parentScheme};border-color:CanvasText"><p style="color-scheme:${childScheme};border-color:inherit"></p></div>`,
    );
    try {
      const child = w.document.querySelector("p");
      if (!child) throw new Error("Expected child");
      // When/Then: inheritance uses the declaring element's resolved system palette.
      for (let index = 0; index < 3; index++) {
        const style = w.getComputedStyle(child);
        expect(style.getPropertyValue("border-top-color")).toBe(expected);
        expect(style.getPropertyValue("border-color")).toBe(expected);
      }
    } finally {
      w.close();
    }
  });

  it("converts legacy mouse coordinates to signed longs while constructors retain doubles", () => {
    // Given: legacy initialization and the current constructor have different IDL numeric types.
    const { window: w } = new Constructor();
    try {
      const event = new w.MouseEvent("before", { clientX: 1.5 });
      expect(event.clientX).toBe(1.5);
      // When/Then: the legacy method truncates and wraps all four coordinates.
      event.initMouseEvent("after", false, false, null, 0, 1.5, -2.5, 4294967297, Infinity);
      expect([event.screenX, event.screenY, event.clientX, event.clientY]).toEqual([1, -2, 1, 0]);
    } finally {
      w.close();
    }
  });

  it("does not change a radio group when only the spelling of its type changes", () => {
    // Given: both checked radios are inserted together into a detached group.
    const { window: w } = new Constructor();
    try {
      const group = w.document.createElement("div");
      const first = w.document.createElement("input"),
        second = w.document.createElement("input");
      if (!(first instanceof w.HTMLInputElement) || !(second instanceof w.HTMLInputElement))
        throw new Error("Expected inputs");
      for (const radio of [first, second]) {
        radio.type = "radio";
        radio.name = "group";
        radio.checked = true;
      }
      group.append(first, second);
      // When/Then: changing case preserves the same type state and checkedness.
      second.setAttribute("type", "RADIO");
      expect(first.checked).toBe(true);
      expect(second.checked).toBe(true);
    } finally {
      w.close();
    }
  });

  it("rejects Proxy receivers and Node arguments without invoking their traps", () => {
    // Given: platform brands belong to private records, even if a Proxy wraps a real node.
    const { window: w } = new Constructor();
    try {
      const element = w.document.createElement("p");
      let traps = 0;
      const unexpected = () => {
        traps++;
        throw new Error("Proxy trap ran");
      };
      const proxy = new Proxy(element, {
        get: unexpected,
        getPrototypeOf: unexpected,
        getOwnPropertyDescriptor: unexpected,
      });
      const descriptor = Object.getOwnPropertyDescriptor(w.Element.prototype, "innerHTML");
      if (!descriptor?.get || !descriptor.set) throw new Error("Expected HTML accessors");
      // When/Then: each native operation rejects the receiver or argument at its brand boundary.
      expect(() => descriptor.get?.call(proxy)).toThrow(TypeError);
      expect(() => descriptor.set?.call(proxy, "after")).toThrow(TypeError);
      expect(() =>
        w.Node.prototype.appendChild.call(proxy, w.document.createTextNode("child")),
      ).toThrow(TypeError);
      expect(() => element.appendChild(proxy)).toThrow(TypeError);
      expect(traps).toBe(0);
    } finally {
      w.close();
    }
  });
});
