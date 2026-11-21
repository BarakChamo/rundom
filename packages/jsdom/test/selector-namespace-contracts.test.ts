// Checks selector name folding and language against private element/document namespaces.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM } = require("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: reference.JSDOM },
])("$name selector namespace rules", ({ Constructor }) => {
  it("folds ASCII attribute names on HTML elements and preserves foreign/non-ASCII names", () => {
    // Given: HTML, non-ASCII and SVG attributes share one document stylesheet.
    const { window: w } = new Constructor(
      '<style>[Ä], [viewBox], [DATA-FOO] { color: rgb(0, 128, 0) }</style><div id="upper" Ä></div><div id="lower" ä></div><div id="ascii" data-foo></div><svg id="svg" viewBox="0 0 1 1"></svg>',
    );
    try {
      // When/Then: folding applies only to the ASCII names on HTML elements.
      for (const id of ["upper", "ascii", "svg"]) {
        const element = w.document.getElementById(id);
        if (!element) throw new Error("Expected element");
        expect(w.getComputedStyle(element).color).toBe("rgb(0, 128, 0)");
      }
      const lower = w.document.getElementById("lower");
      if (!lower) throw new Error("Expected lower-case attribute");
      expect(w.getComputedStyle(lower).color).not.toBe("rgb(0, 128, 0)");
    } finally {
      w.close();
    }
  });

  it("preserves Unicode element names through selector matching", () => {
    // Given: the Kelvin sign has a Unicode lower-case mapping but no ASCII mapping.
    const { window: w } = new Constructor();
    try {
      const body = w.document.body;
      if (!body) throw new Error("Expected body");
      for (const element of [
        w.document.createElement("K"),
        w.document.createElementNS("https://dummy.test/", "K"),
      ]) {
        body.append(element);
        // When/Then: selectors preserve the local name and never turn it into ASCII k.
        expect(element.matches("K")).toBe(true);
        expect(element.matches("k")).toBe(false);
      }
      expect(w.document.querySelector("k")).toBe(null);
    } finally {
      w.close();
    }
  });

  it("ignores a literal xml:lang HTML attribute when determining language", () => {
    // Given: a colon in an HTML attribute name does not make it an XML namespace attribute.
    const { window: w } = new Constructor('<p xml:lang="es"></p><p lang="es"></p>');
    try {
      const elements = w.document.querySelectorAll("p");
      // When/Then: language uses the HTML lang attribute without interpreting a literal prefix as a namespace.
      expect(elements[0]?.matches(":lang(es)")).toBe(false);
      expect(elements[1]?.matches(":lang(es)")).toBe(true);
    } finally {
      w.close();
    }
  });
});

it("uses CSS ASCII folding and token boundaries in queries and stylesheet rules", () => {
  const { window } = new JSDOM(
    '<style>[A="k" i] {--fold: yes} [tokens~="y"] {--token: yes} [testAttr="X" s] {--foreign: yes}</style><div a="K" tokens="x\u00a0y"></div><svg><g/></svg>',
  );
  try {
    const div = window.document.querySelector("div");
    const g = window.document.querySelector("g");
    if (!div || !g) throw new Error("Expected HTML and SVG fixtures");
    g.setAttribute("testAttr", "X");
    for (const invalid of ["[a i]", "[a/**/i]", "[testAttr s]"]) {
      expect(() => window.document.querySelector(invalid)).toThrowError(
        expect.objectContaining({ name: "SyntaxError" }),
      );
      expect(() => div.matches(invalid)).toThrowError(
        expect.objectContaining({ name: "SyntaxError" }),
      );
    }
    for (const [selector, property] of [
      ['[A="k" i]', "--fold"],
      ['[tokens~="y"]', "--token"],
    ] as const) {
      expect(div.matches(selector)).toBe(false);
      expect(window.document.querySelector(selector)).toBeNull();
      expect(window.getComputedStyle(div).getPropertyValue(property)).toBe("");
    }
    expect(g.matches('[testAttr="X" s]')).toBe(true);
    expect(g.matches('[testattr="X" s]')).toBe(false);
    expect(window.getComputedStyle(g).getPropertyValue("--foreign").trim()).toBe("yes");
    div.setAttribute("a", "K");
    expect(window.document.querySelector('[A="k" i]')).toBe(div);
    expect(window.getComputedStyle(div).getPropertyValue("--fold").trim()).toBe("yes");
  } finally {
    window.close();
  }
});
