// Verifies author layer ordering and cascade rollback through live public stylesheets.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("CSS cascade layers", () => {
  it.each([
    ["normal layer order", "@layer a,b;@layer b{div{color:green}}@layer a{#x{color:red}}", ""],
    ["unlayered normal", "div{color:green}@layer a{#x{color:red}}", ""],
    [
      "important reversal",
      "@layer a,b;@layer b{#x{color:red!important}}@layer a{div{color:green!important}}",
      "",
    ],
    ["layered important", "#x{color:red!important}@layer a{div{color:green!important}}", ""],
    ["inline important", "@layer a{#x{color:red!important}}", "color:green!important"],
    ["inline normal", "@layer a{#x{color:red}}", "color:green"],
    ["nested implicit order", "@layer a{div{color:green}@layer b{#x{color:red}}}", ""],
    [
      "nested important reversal",
      "@layer a{#x{color:red!important}@layer b{div{color:green!important}}}",
      "",
    ],
    [
      "nested order stays grouped",
      "@layer a,b;@layer b{div{color:green}}@layer a.last{#x{color:red}}",
      "",
    ],
    [
      "qualified and nested names merge",
      "@layer a.b,a.c;@layer a{ @layer c{div{color:green}} }@layer a.b{#x{color:red}}",
      "",
    ],
    ["anonymous layers stay distinct", "@layer{#x{color:red}}@layer{div{color:green}}", ""],
    [
      "escaped dots stay in identifiers",
      "@layer a\\.b,a.b;@layer a.b{div{color:green}}@layer a\\.b{#x{color:red}}",
      "",
    ],
    [
      "false media does not reserve order",
      "@media not all{@layer b{}}@layer a,b;@layer a{#x{color:red}}@layer b{div{color:green}}",
      "",
    ],
    [
      "false supports does not reserve order",
      "@supports (unknown:yes){@layer b{}}@layer a,b;@layer a{#x{color:red}}@layer b{div{color:green}}",
      "",
    ],
    [
      "unmatched style reserves order",
      ".absent{@layer a{}}@layer b,a;@layer b{div{color:green}}@layer a{#x{color:red}}",
      "",
    ],
    [
      "normal layer rollback",
      "@layer a,b;@layer a{div{color:green}}@layer b{div{color:red}#x{color:revert-layer}}",
      "",
    ],
    ["unlayered rollback", "@layer a{div{color:green}}#x{color:red}div#x{color:revert-layer}", ""],
    ["inline normal rollback", "div{color:green}", "color:revert-layer"],
    [
      "inline important rollback",
      "@layer a{div{color:green!important}}",
      "color:revert-layer!important",
    ],
    [
      "important rollback discards intervening normals",
      "body{color:green}@layer a,b;@layer a{div{color:red}#x{color:revert-layer!important}}@layer b{div{color:blue}}",
      "",
    ],
    [
      "chained rollback",
      "@layer a,b,c;@layer a{div{color:green}}@layer b{div{color:revert-layer}}@layer c{div{color:revert-layer}}",
      "",
    ],
    [
      "revert rule ignores its declaration block",
      "div{color:green}#x{color:red;color:revert-rule}",
      "",
    ],
    [
      "nested declaration rule rollback",
      "body{#x{color:green;.absent{}color:red;color:revert-rule}}",
      "",
    ],
  ])("computes %s", (_name, css, inline) => {
    // Given: competing declarations exercise layer order independently of specificity and source order.
    const { window: w } = new JSDOM(`<style>${css}</style><div id=x style="${inline}"></div>`);
    try {
      const element = w.document.getElementById("x");
      if (!element) throw new Error("Expected target");
      // When/Then: the winning declaration is selected from the correct layer or rollback boundary.
      expect(w.getComputedStyle(element).color).toBe("rgb(0, 128, 0)");
    } finally {
      w.close();
    }
  });

  it("reorders live layers after stylesheet insertion and deletion", () => {
    // Given: layer order is derived from current CSSOM across sheets, rather than cached source text.
    const { window: w } = new JSDOM(
      "<style>@layer a,b;@layer a{div{color:red}}@layer b{div{color:green}}</style><div></div>",
    );
    try {
      const sheet = w.document.styleSheets[0],
        target = w.document.querySelector("div");
      if (!sheet || !target) throw new Error("Expected sheet and target");
      expect(w.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
      // When/Then: deleting the order declaration and inserting another changes the computed result.
      sheet.deleteRule(0);
      sheet.insertRule("@layer b,a;", 0);
      expect(w.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
      sheet.deleteRule(2);
      expect(w.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
    } finally {
      w.close();
    }
  });

  it("rolls back author values to user-agent and inherited defaults", () => {
    // Given: rollback must preserve lower origins rather than selecting another author declaration.
    const { window: w } = new JSDOM(
      "<style>body{color:green}div{display:inline;color:red}#x{display:revert;color:revert}</style><div id=x></div>",
    );
    try {
      const target = w.document.getElementById("x");
      if (!target) throw new Error("Expected target");
      const style = w.getComputedStyle(target);
      // When/Then: the block default and inherited parent color survive origin rollback.
      expect(style.display).toBe("block");
      expect(style.color).toBe("rgb(0, 128, 0)");
    } finally {
      w.close();
    }
  });

  it("accepts revert-rule only for supported properties and expands shorthands", () => {
    // Given: the new CSS-wide keyword shares the declaration parser's supported property boundary.
    const { window: w } = new JSDOM();
    try {
      const style = w.document.createElement("div").style;
      // When/Then: declarations and feature queries agree, and unknown properties stay rejected.
      style.setProperty("margin", "revert-rule");
      expect(style.getPropertyValue("margin-top")).toBe("revert-rule");
      expect(w.CSS.supports("color", "revert-rule")).toBe(true);
      expect(w.CSS.supports("unknown", "revert-rule")).toBe(false);
    } finally {
      w.close();
    }
  });
});

it("ignores layer order statements nested inside a style rule", () => {
  // Given: nested style rules admit layer blocks but cannot declare layer order with a statement.
  const { window: w } = new JSDOM(
    "<style>.a{@layer b,a;}@layer a,b;@layer a{.a{color:red}}@layer b{.a{color:green}}</style><div class=a></div>",
  );
  try {
    const target = w.document.querySelector("div");
    if (!target) throw new Error("Expected target");
    // When/Then: the top-level ordering remains authoritative.
    expect(w.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
  } finally {
    w.close();
  }
});

it("orders repeated adopted sheets by their last occurrence", () => {
  // Given: adopting the same anonymous layer twice must preserve final stylesheet order.
  const { window: w } = new JSDOM("<div></div>");
  try {
    const a = new w.CSSStyleSheet(),
      b = new w.CSSStyleSheet();
    a.replaceSync("@layer{div{color:green}}");
    b.replaceSync("@layer{div{color:red}}");
    w.document.adoptedStyleSheets = [a, b, a];
    const target = w.document.querySelector("div");
    if (!target) throw new Error("Expected target");
    // When/Then: the final occurrence of the first sheet wins.
    expect(w.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
  } finally {
    w.close();
  }
});
