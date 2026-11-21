// Verifies that form pseudo-classes and relational style matching read current private control state.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("Form selector state", () => {
  it("reevaluates range matches after value, bounds, and readonly changes", () => {
    // Given: a bounded number control drives an ancestor's relational rule.
    const { window } = new JSDOM(
      '<style>main:has(:in-range){color:green}main:has(:out-of-range){color:blue}</style><main><input type="number" min="1" max="10" value="5"></main>',
    );
    try {
      const input = window.document.querySelector("input"),
        main = window.document.querySelector("main");
      if (!(input instanceof window.HTMLInputElement) || !main)
        throw new Error("Expected range fixture");
      expect(input.matches(":in-range")).toBe(true);
      expect(window.getComputedStyle(main).color).toBe("rgb(0, 128, 0)");
      // When/Then: all public mutations are visible without replacing the selector.
      input.value = "12";
      expect(input.matches(":out-of-range")).toBe(true);
      expect(window.getComputedStyle(main).color).toBe("rgb(0, 0, 255)");
      input.readOnly = true;
      expect(input.matches(":out-of-range")).toBe(false);
      input.readOnly = false;
      input.max = "15";
      expect(input.matches(":in-range")).toBe(true);
      input.removeAttribute("min");
      input.removeAttribute("max");
      expect(input.matches(":in-range")).toBe(false);
    } finally {
      window.close();
    }
  });
  it("distinguishes live checkedness from default checkedness and indeterminate state", () => {
    // Given: default selection is determined by the content attribute.
    const { window } = new JSDOM('<input type="checkbox" checked><progress></progress>');
    try {
      const input = window.document.querySelector("input"),
        progress = window.document.querySelector("progress");
      if (
        !(input instanceof window.HTMLInputElement) ||
        !(progress instanceof window.HTMLProgressElement)
      )
        throw new Error("Expected check fixture");
      expect(input.matches(":default")).toBe(true);
      // When/Then: dirty checkedness does not overwrite default checkedness.
      input.checked = false;
      expect(input.matches(":default")).toBe(true);
      input.indeterminate = true;
      expect(input.matches(":indeterminate")).toBe(true);
      input.indeterminate = false;
      expect(input.matches(":indeterminate")).toBe(false);
      expect(progress.matches(":indeterminate")).toBe(true);
      progress.value = 0;
      expect(progress.matches(":indeterminate")).toBe(false);
    } finally {
      window.close();
    }
  });
});
