// Pins modern color serialization and theme-dependent system colors through public declarations.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("CSS colors", () => {
  it("computes UA palette defaults and lets author declarations override them", () => {
    // Given: headless native controls use the same palette as explicit system colors.
    const { window } = new JSDOM(
      '<html style="color-scheme:dark"><body><button></button><input><textarea></textarea><mark></mark></body></html>',
    );
    try {
      const button = window.document.querySelector("button"),
        input = window.document.querySelector("input"),
        mark = window.document.querySelector("mark");
      if (!button || !input || !mark) throw new Error("Expected palette fixture");
      expect(window.getComputedStyle(button).getPropertyValue("background-color")).toBe(
        "rgb(51, 51, 51)",
      );
      expect(window.getComputedStyle(input).getPropertyValue("background-color")).toBe(
        "rgb(0, 0, 0)",
      );
      expect(window.getComputedStyle(mark).getPropertyValue("background-color")).toBe(
        "rgb(255, 255, 0)",
      );
      // When/Then: author rules still outrank native defaults.
      button.style.setProperty("background-color", "red");
      expect(window.getComputedStyle(button).getPropertyValue("background-color")).toBe(
        "rgb(255, 0, 0)",
      );
    } finally {
      window.close();
    }
  });
  it("rejects invalid interpolation and relative-color syntax without changing declarations", () => {
    // Given: the serializer must not repair grammatically invalid colors.
    const { window } = new JSDOM('<p style="color:red"></p>');
    try {
      const p = window.document.querySelector("p");
      if (!p) throw new Error("Expected paragraph");
      // When/Then: invalid writes preserve the earlier value and remain unsupported.
      for (const value of [
        "color-mix(in hsl hue, red, blue)",
        "color-mix(in srgb longer hue, red, blue)",
        "rgb(from red, r, g, b)",
      ]) {
        expect(window.CSS.supports("color", value)).toBe(false);
        p.style.color = value;
        expect(p.style.color).toBe("red");
      }
    } finally {
      window.close();
    }
  });

  for (const [scheme, keyword, expected] of [
    ["light", "Canvas", "rgb(255, 255, 255)"],
    ["dark", "Canvas", "rgb(0, 0, 0)"],
    ["light", "CanvasText", "rgb(0, 0, 0)"],
    ["dark", "CanvasText", "rgb(255, 255, 255)"],
    ["light", "Menu", "rgb(255, 255, 255)"],
    ["dark", "Menu", "rgb(0, 0, 0)"],
    ["light", "MenuText", "rgb(0, 0, 0)"],
    ["dark", "MenuText", "rgb(255, 255, 255)"],
  ] as const) {
    it(`resolves ${keyword} in the ${scheme} scheme`, () => {
      // Given: system colors depend on the element's computed color scheme.
      const { window } = new JSDOM(`<p style="color-scheme:${scheme};color:${keyword}"></p>`);
      try {
        const p = window.document.querySelector("p");
        if (!p) throw new Error("Expected paragraph");
        // When/Then: a supported system keyword computes to an absolute color.
        expect(window.CSS.supports("color", keyword)).toBe(true);
        expect(window.getComputedStyle(p).color).toBe(expected);
      } finally {
        window.close();
      }
    });
  }
  it("transfers computed system colors through inheritance and reevaluates direct declarations", () => {
    // Given: inherited system color values have already resolved in the parent's scheme.
    const { window } = new JSDOM(
      '<main style="color-scheme:light;color:Menu"><p style="color-scheme:dark"></p><b style="color-scheme:dark;color:Menu"></b></main>',
    );
    try {
      const main = window.document.querySelector("main"),
        p = window.document.querySelector("p"),
        b = window.document.querySelector("b");
      if (!main || !p || !b) throw new Error("Expected colored subtree");
      expect(window.getComputedStyle(p).color).toBe("rgb(255, 255, 255)");
      expect(window.getComputedStyle(b).color).toBe("rgb(0, 0, 0)");
      // When/Then: changing the parent's scheme changes inherited computed values.
      main.setAttribute("style", "color-scheme:dark;color:Menu");
      expect(window.getComputedStyle(p).color).toBe("rgb(0, 0, 0)");
    } finally {
      window.close();
    }
  });
  it("serializes leading color-mix percentages before computing interpolation", () => {
    // Given: percentages may precede either interpolation color.
    const { window } = new JSDOM("<p></p>");
    try {
      const p = window.document.querySelector("p");
      if (!p) throw new Error("Expected paragraph");
      const source = "color-mix(in lch, 25% lch(10 20 30deg), lch(50 60 70deg))";
      // When/Then: feature queries, specified serialization, and computation agree.
      expect(window.CSS.supports("color", source)).toBe(true);
      p.style.color = source;
      expect(p.style.color).toBe("color-mix(in lch, lch(10 20 30deg) 25%, lch(50 60 70deg) 75%)");
      expect(window.getComputedStyle(p).color).toBe("lch(40 50 60)");
    } finally {
      window.close();
    }
  });
  it("resolves system colors inside color-mix at computed-value time", () => {
    // Given: specified colors must retain their theme dependencies.
    const { window } = new JSDOM('<p style="color-scheme:light"></p>');
    try {
      const p = window.document.querySelector("p");
      if (!p) throw new Error("Expected paragraph");
      p.style.color = "color-mix(in srgb, Menu 75%, MenuText)";
      // When/Then: the same declaration follows changes to the active scheme.
      expect(window.getComputedStyle(p).color).toBe("color(srgb 0.75 0.75 0.75)");
      p.style.setProperty("color-scheme", "dark");
      expect(window.getComputedStyle(p).color).toBe("color(srgb 0.25 0.25 0.25)");
    } finally {
      window.close();
    }
  });
  it("uses CanvasText for the initial root color in a dark scheme", () => {
    // Given: an initial foreground has no explicit ancestor color to inherit.
    const { window } = new JSDOM('<html style="color-scheme:dark"><body><p></p></body></html>');
    try {
      const p = window.document.querySelector("p");
      if (!p) throw new Error("Expected paragraph");
      // When/Then: root initialization and descendant inheritance use the same palette.
      expect(window.getComputedStyle(p).color).toBe("rgb(255, 255, 255)");
    } finally {
      window.close();
    }
  });
});
