// Checks border component removal, defaults and source ordering against the pinned declaration contract.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM } = require("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: reference.JSDOM },
])("$name physical border state", ({ Constructor }) => {
  it.each([
    { text: "border: none", declarations: [["border", "none"]], expected: "border: medium;" },
    {
      text: "border-top: none",
      declarations: [["border-top", "none"]],
      expected: "border-top: medium;",
    },
    {
      text: "border-top-width: 1px; border-style: none",
      declarations: [
        ["border-top-width", "1px"],
        ["border-style", "none"],
      ],
      expected: "border-top-width: 1px; border-style: none;",
    },
    {
      text: "border-top: solid; border-style: none",
      declarations: [
        ["border-top", "solid"],
        ["border-style", "none"],
      ],
      expected:
        "border-top: medium; border-right-style: none; border-bottom-style: none; border-left-style: none;",
    },
  ])(
    "serializes $text from current components in declaration order",
    ({ declarations, expected }) => {
      // Given: component groups can be incomplete while a later axis is complete.
      const { window: w } = new Constructor();
      try {
        const style = w.document.createElement("p").style;
        for (const [property, value] of declarations) {
          if (property === undefined || value === undefined)
            throw new Error("Expected declaration");
          style.setProperty(property, value);
        }
        // When/Then: only complete shorthands replace the components, preserving source order.
        expect(style.cssText).toBe(expected);
      } finally {
        w.close();
      }
    },
  );

  it.each([
    ["border-style", "border-width: medium; border-color: currentcolor; border-image: none;"],
    [
      "border-top",
      "border-right: medium; border-bottom: medium; border-left: medium; border-image: none;",
    ],
  ])("invalidates containing shorthands when %s is cleared", (property, expected) => {
    // Given: a complete border populated its physical longhands and image reset.
    const { window: w } = new Constructor();
    try {
      const style = w.document.createElement("p").style;
      style.setProperty("border", "none");
      // When/Then: removing a component removes its cached parents without erasing other values.
      style.setProperty(property, "");
      expect(style.getPropertyValue("border")).toBe("");
      expect(style.getPropertyValue("border-top")).toBe("");
      expect(style.cssText).toBe(expected);
      expect(style.getPropertyValue("border-image")).toBe("none");
    } finally {
      w.close();
    }
  });
});

it("resolves the initial border-image shorthand to its canonical computed value", () => {
  // Given: the provider describes shorthand initial values through its individual properties.
  const { window: w } = new JSDOM("<p></p>");
  try {
    const element = w.document.querySelector("p");
    if (!element) throw new Error("Expected element");
    element.style.setProperty("border-image", "initial");
    // When/Then: the CSS-wide keyword computes to the reset shorthand rather than escaping literally.
    expect(w.getComputedStyle(element).getPropertyValue("border-image")).toBe("none");
  } finally {
    w.close();
  }
});
