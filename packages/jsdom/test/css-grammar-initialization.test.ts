// Keeps CSS grammar acceptance and rejected-write preservation stable across cold and repeated Window use.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("CSS grammar initialization", () => {
  it("validates legacy aliases against the canonical declaration grammar", () => {
    const { window } = new JSDOM();
    try {
      const alias = "-webkit-mask-box-image-repeat";
      expect(window.CSS.supports(alias, "stretch")).toBe(true);
      expect(window.CSS.supports(`(${alias}: stretch)`)).toBe(true);
      expect(window.CSS.supports(alias, "sideways")).toBe(false);
      const style = window.document.createElement("p").style;
      style.setProperty("mask-border-repeat", "stretch");
      expect(style.getPropertyValue(alias)).toBe("stretch");
    } finally {
      window.close();
    }
  });

  it("validates diverse first-use properties and preserves declarations after invalid writes", () => {
    // Given: cold and subsequent Windows exercise independent declaration objects over private shared grammars.
    const examples = [
      ["width", "10px"],
      ["font-weight", "bold"],
      ["margin", "1px 2px"],
      ["transform", "translateX(10px)"],
      ["grid-template-columns", "repeat(2, 1fr)"],
      ["animation-duration", "2s"],
      ["color", "rgb(1, 2, 3)"],
      ["border-top-width", "2px"],
    ];
    for (let index = 0; index < 3; index++) {
      const { window } = new JSDOM("<style>p{color:blue}</style><p></p>");
      try {
        const node = window.document.querySelector("p");
        if (!node) throw new Error("Expected grammar fixture");
        for (const example of examples) {
          const [property, value] = example;
          if (property === undefined || value === undefined)
            throw new Error("Expected grammar example");
          // When: a property grammar is first resolved and then revisited with an invalid value.
          expect(window.CSS.supports(property, value)).toBe(true);
          node.style.setProperty(property, value);
          const accepted = node.style.getPropertyValue(property);
          expect(accepted).not.toBe("");
          expect(window.CSS.supports(property, "not-a-css-value")).toBe(false);
          node.style.setProperty(property, "not-a-css-value");
          // Then: repeated dictionary use never loses the valid declaration or cross-contaminates Windows.
          expect(node.style.getPropertyValue(property)).toBe(accepted);
        }
        expect(window.getComputedStyle(node).color).toBe("rgb(1, 2, 3)");
      } finally {
        window.close();
      }
    }
  });
});
