// Guards completed-frame reuse against CSS introduction, live controls, shadow styling and adoption.
import { describe, it, expect } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("getComputedStyle repeated reads", () => {
  it("keeps large repeated theme declarations independent after CSSOM edits", () => {
    // Given: three sheets parse the same large declaration block in separate Windows.
    const tokens = Array.from(
      { length: 380 },
      (_, index) => `--theme-token-${index}: ${index}px;`,
    ).join("");
    const markup = `<style>main{${tokens}--tone: red !important}p{color:var(--tone)}</style><main><p>text</p></main>`;
    const windows = Array.from({ length: 3 }, () => new JSDOM(markup).window);
    try {
      for (const window of windows) {
        const node = window.document.querySelector("p");
        if (!node) throw new Error("Expected themed paragraph");
        expect(window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
        expect(window.getComputedStyle(node).getPropertyValue("--theme-token-379")).toBe("379px");
      }

      // When: a caller edits a materialized CSSOM declaration in the first Window.
      const first = windows[0];
      if (!first) throw new Error("Expected first Window");
      const source = first.document.querySelector("style");
      if (!(source instanceof first.HTMLStyleElement)) throw new Error("Expected theme stylesheet");
      const rule = source.sheet?.cssRules[0];
      if (!(rule instanceof first.CSSStyleRule)) throw new Error("Expected theme rule");
      expect(rule.style.getPropertyPriority("--tone")).toBe("important");
      expect(rule.style.parentRule).toBe(rule);
      rule.style.setProperty("--tone", "blue");

      // Then: the other sheets keep their own values, priorities and parent rules.
      for (const [index, window] of windows.entries()) {
        const node = window.document.querySelector("p");
        const otherSource = window.document.querySelector("style");
        if (!(otherSource instanceof window.HTMLStyleElement))
          throw new Error("Expected theme stylesheet");
        const otherRule = otherSource.sheet?.cssRules[0];
        if (!node || !(otherRule instanceof window.CSSStyleRule))
          throw new Error("Expected theme rule");
        expect(window.getComputedStyle(node).color).toBe(
          index === 0 ? "rgb(0, 0, 255)" : "rgb(255, 0, 0)",
        );
        expect(otherRule.style.getPropertyPriority("--tone")).toBe(index === 0 ? "" : "important");
        expect(otherRule.style.parentRule).toBe(otherRule);
      }
    } finally {
      for (const window of windows) window.close();
    }
  });

  it("observes stylesheet escape, selector edits, disabling and rule replacement after static reads", () => {
    // Given: flat static rules initially allow repeated completed-frame reads.
    const { window } = new JSDOM("<style>p{color:red}</style><p>text</p>");
    try {
      const node = window.document.querySelector("p"),
        source = window.document.querySelector("style");
      if (!node || !(source instanceof window.HTMLStyleElement))
        throw new Error("Expected fixture");
      const before = window.getComputedStyle(node);
      for (let i = 0; i < 8; i++)
        expect(window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
      // When/Then: exposing a sheet closes the proof before mutation can bypass DOM revisions.
      const sheet = source.sheet;
      const rule = sheet?.cssRules[0];
      if (!sheet || !(rule instanceof window.CSSStyleRule)) throw new Error("Expected rule");
      rule.style.color = "blue";
      expect(window.getComputedStyle(node).color).toBe("rgb(0, 0, 255)");
      rule.selectorText = "div";
      expect(window.getComputedStyle(node).color).not.toBe("rgb(0, 0, 255)");
      sheet.insertRule("p{color:green}", 0);
      expect(window.getComputedStyle(node).color).toBe("rgb(0, 128, 0)");
      sheet.disabled = true;
      expect(window.getComputedStyle(node).color).not.toBe("rgb(0, 128, 0)");
      sheet.disabled = false;
      sheet.deleteRule(0);
      expect(window.getComputedStyle(node).color).not.toBe("rgb(0, 128, 0)");
      expect(before.color).toBe("rgb(255, 0, 0)");
    } finally {
      window.close();
    }
  });
  it("observes style-element disabling and inline inheritance without exposing the sheet", () => {
    // Given: inline changes reflect attributes but style-element disabling does not.
    const { window } = new JSDOM(
      '<style>p{color:red}</style><main style="visibility:hidden"><p>text</p></main>',
    );
    try {
      const node = window.document.querySelector("p"),
        parent = window.document.querySelector("main"),
        source = window.document.querySelector("style");
      if (!node || !parent || !(source instanceof window.HTMLStyleElement))
        throw new Error("Expected fixture");
      for (let i = 0; i < 8; i++)
        expect(window.getComputedStyle(node).getPropertyValue("visibility")).toBe("hidden");
      parent.style.setProperty("visibility", "visible");
      expect(window.getComputedStyle(node).getPropertyValue("visibility")).toBe("visible");
      source.disabled = true;
      expect(window.getComputedStyle(node).color).not.toBe("rgb(255, 0, 0)");
      source.disabled = false;
      expect(window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
    } finally {
      window.close();
    }
  });
  it("rechecks stylesheet list edits, stylesheet text and viewport-dependent declarations", () => {
    // Given: source membership, source text and dimensions are independent dependencies.
    const { window } = new JSDOM("<style>p{width:10vw;color:red}</style><p>text</p>");
    try {
      const node = window.document.querySelector("p"),
        source = window.document.querySelector("style");
      if (!node || !source) throw new Error("Expected fixture");
      window.innerWidth = 1000;
      for (let i = 0; i < 8; i++)
        expect(window.getComputedStyle(node).getPropertyValue("width")).toBe("100px");
      window.innerWidth = 500;
      expect(window.getComputedStyle(node).getPropertyValue("width")).toBe("50px");
      source.textContent = "p{color:blue}";
      expect(window.getComputedStyle(node).color).toBe("rgb(0, 0, 255)");
      const sheet = window.document.styleSheets.item(0),
        rule = sheet?.cssRules[0];
      if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected rule");
      rule.style.color = "green";
      expect(window.getComputedStyle(node).color).toBe("rgb(0, 128, 0)");
    } finally {
      window.close();
    }
  });
  it("returns fresh snapshots and observes new author styles after repeated default reads", () => {
    // Given: an unchanged document initially has no author declarations.
    const { window } = new JSDOM("<main><p>text</p></main>");
    try {
      const node = window.document.querySelector("p"),
        parent = window.document.querySelector("main");
      if (!node || !parent) throw new Error("Expected elements");
      const before = window.getComputedStyle(node);
      for (let i = 0; i < 8; i++) expect(window.getComputedStyle(node)).not.toBe(before);
      // When/Then: inline inheritance and subsequently introduced styles invalidate prior work.
      parent.style.color = "red";
      expect(window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
      parent.removeAttribute("style");
      const sheet = window.document.createElement("style");
      sheet.textContent = "p{color:blue}";
      window.document.head?.append(sheet);
      expect(window.getComputedStyle(node).color).toBe("rgb(0, 0, 255)");
      expect(before.color).not.toBe("rgb(0, 0, 255)");
    } finally {
      window.close();
    }
  });
  it("observes automatic direction changes without reflecting a control value attribute", () => {
    // Given: control value state can change independently of the DOM mutation generation.
    const { window } = new JSDOM('<input dir="auto" value="abc">');
    try {
      const node = window.document.querySelector("input");
      if (!(node instanceof window.HTMLInputElement)) throw new Error("Expected input");
      for (let i = 0; i < 8; i++)
        expect(window.getComputedStyle(node).getPropertyValue("direction")).toBe("ltr");
      node.value = "אבג";
      expect(node.getAttribute("value")).toBe("abc");
      expect(window.getComputedStyle(node).getPropertyValue("direction")).toBe("rtl");
    } finally {
      window.close();
    }
  });
  it("keeps live selector evaluation when styles exist but previously did not match", () => {
    // Given: an unmatched rule can start matching without a tree mutation.
    const { window } = new JSDOM('<style>input:checked{color:red}</style><input type="checkbox">');
    try {
      const node = window.document.querySelector("input");
      if (!(node instanceof window.HTMLInputElement)) throw new Error("Expected input");
      const before = window.getComputedStyle(node);
      for (let i = 0; i < 8; i++) window.getComputedStyle(node);
      node.checked = true;
      expect(window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
      expect(before.color).not.toBe("rgb(255, 0, 0)");
    } finally {
      window.close();
    }
  });
  it("observes author rules added to a new shadow root after default reads", () => {
    // Given: a host can acquire a shadow styling scope after a completed read.
    const { window } = new JSDOM("<div><p>text</p></div>");
    try {
      const host = window.document.querySelector("div"),
        node = window.document.querySelector("p");
      if (!host || !node) throw new Error("Expected host and paragraph");
      for (let i = 0; i < 8; i++) window.getComputedStyle(node);
      const root = host.attachShadow({ mode: "open" }),
        sheet = window.document.createElement("style");
      sheet.textContent = ":host{color:red}";
      root.append(sheet);
      expect(window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
    } finally {
      window.close();
    }
  });
  it("uses the destination stylesheet after a previously read node is adopted", () => {
    // Given: creation-realm frames cannot authorize reuse in another document.
    const a = new JSDOM("<p>text</p>"),
      b = new JSDOM("<style>p{color:blue}</style>");
    try {
      const node = a.window.document.querySelector("p");
      if (!node) throw new Error("Expected paragraph");
      for (let i = 0; i < 8; i++) a.window.getComputedStyle(node);
      b.window.document.body?.append(b.window.document.adoptNode(node));
      expect(a.window.getComputedStyle(node).color).toBe("rgb(0, 0, 255)");
    } finally {
      a.window.close();
      b.window.close();
    }
  });
  it("observes adopted stylesheets that change without a DOM insertion", () => {
    // Given: adopted sheets are independent of the ordinary tree mutation generation.
    const { window } = new JSDOM("<p>text</p>");
    try {
      const node = window.document.querySelector("p");
      if (!node) throw new Error("Expected paragraph");
      for (let i = 0; i < 8; i++) window.getComputedStyle(node);
      const sheet = new window.CSSStyleSheet();
      sheet.replaceSync("p{color:red}");
      window.document.adoptedStyleSheets = [sheet];
      expect(window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
      const rule = sheet.cssRules[0];
      if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected style rule");
      rule.style.setProperty("color", "blue");
      expect(window.getComputedStyle(node).color).toBe("rgb(0, 0, 255)");
    } finally {
      window.close();
    }
  });
});
