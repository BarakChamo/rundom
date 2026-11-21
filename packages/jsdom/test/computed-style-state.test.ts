// Pins computed-style observation across mutations and declaration feature-query agreement.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("Computed style state", () => {
  it("retains independent snapshots while new reads see changed inline and sheet declarations", () => {
    // Given: an inherited stylesheet color and an independently retained computed object.
    const { window } = new JSDOM(
      "<style>main {color:red} p {visibility:hidden}</style><main><p>Text</p></main>",
    );
    try {
      const p = window.document.querySelector("p"),
        sheet = window.document.styleSheets[0];
      if (!p || !sheet) throw new Error("Expected styled paragraph");
      const before = window.getComputedStyle(p);
      // When: edits change CSSOM declarations and inline inheritance.
      const rule = sheet.cssRules[0];
      if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected style rule");
      rule.style.color = "blue";
      p.setAttribute("style", "visibility:visible");
      const after = window.getComputedStyle(p);
      // Then: fresh reads see edits, without mutating earlier returned objects.
      expect(before).not.toBe(after);
      expect(before.color).toBe("rgb(255, 0, 0)");
      expect(before.getPropertyValue("visibility")).toBe("hidden");
      expect(after.color).toBe("rgb(0, 0, 255)");
      expect(after.getPropertyValue("visibility")).toBe("visible");
    } finally {
      window.close();
    }
  });
  it("observes sheet insertion, removal, source edits, and type changes", () => {
    // Given: repeated reads can reuse stylesheet discovery.
    const { window } = new JSDOM("<style>p {color:red}</style><p>Text</p>");
    try {
      const p = window.document.querySelector("p"),
        style = window.document.querySelector("style");
      if (!p || !style) throw new Error("Expected style and paragraph");
      expect(window.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
      // When/Then: every way of changing the discovered sheets remains visible.
      const later = window.document.createElement("style");
      later.textContent = "p {color:blue}";
      window.document.head?.append(later);
      expect(window.getComputedStyle(p).color).toBe("rgb(0, 0, 255)");
      later.remove();
      style.textContent = "p {color:green}";
      expect(window.getComputedStyle(p).color).toBe("rgb(0, 128, 0)");
      style.setAttribute("type", "text/plain");
      expect(window.getComputedStyle(p).color).toBe("rgb(0, 0, 0)");
      style.removeAttribute("type");
      expect(window.getComputedStyle(p).color).toBe("rgb(0, 128, 0)");
    } finally {
      window.close();
    }
  });
  it("reads current CSSOM rules and selectors without requiring tree mutations", () => {
    // Given: sheet identity stays stable while its rules change.
    const { window } = new JSDOM("<style>p {color:red}</style><p>Text</p>");
    try {
      const p = window.document.querySelector("p"),
        sheet = window.document.styleSheets[0];
      if (!p || !sheet) throw new Error("Expected styled paragraph");
      expect(window.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
      // When/Then: discovery reuse retains live rule records.
      sheet.insertRule("p {color:blue}", 1);
      expect(window.getComputedStyle(p).color).toBe("rgb(0, 0, 255)");
      const rule = sheet.cssRules[1];
      if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected style rule");
      rule.selectorText = "aside";
      expect(window.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
      sheet.deleteRule(0);
      expect(window.getComputedStyle(p).color).toBe("rgb(0, 0, 0)");
    } finally {
      window.close();
    }
  });
  it("reevaluates checked, focus, and automatic text direction without structural edits", () => {
    // Given: stylesheet membership does not depend on interactive state.
    const { window } = new JSDOM(
      "<style>input:checked {color:red} input:focus {visibility:hidden}</style><input type=checkbox><textarea dir=auto></textarea>",
    );
    try {
      const input = window.document.querySelector("input"),
        textarea = window.document.querySelector("textarea");
      if (
        !(input instanceof window.HTMLInputElement) ||
        !(textarea instanceof window.HTMLTextAreaElement)
      )
        throw new Error("Expected controls");
      expect(window.getComputedStyle(input).color).toBe("rgb(0, 0, 0)");
      expect(window.getComputedStyle(textarea).getPropertyValue("direction")).toBe("ltr");
      // When/Then: control-state changes affect fresh cascade evaluation.
      input.checked = true;
      input.focus();
      textarea.value = "אב";
      expect(window.getComputedStyle(input).color).toBe("rgb(255, 0, 0)");
      expect(window.getComputedStyle(input).getPropertyValue("visibility")).toBe("hidden");
      expect(window.getComputedStyle(textarea).getPropertyValue("direction")).toBe("rtl");
    } finally {
      window.close();
    }
  });
  it("keeps document and shadow stylesheet discovery separate while adopted rules stay live", () => {
    // Given: an author sheet outside a shadow tree and a constructed sheet inside it.
    const { window } = new JSDOM("<style>p {color:red}</style><div></div><p>Outside</p>");
    try {
      const host = window.document.querySelector("div"),
        outside = window.document.querySelector("p");
      if (!host || !outside) throw new Error("Expected host and paragraph");
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = "<style>p {color:blue}</style><p>Inside</p>";
      const inside = shadow.querySelector("p"),
        sheet = new window.CSSStyleSheet();
      if (!inside) throw new Error("Expected shadow paragraph");
      expect(window.getComputedStyle(inside).color).toBe("rgb(0, 0, 255)");
      expect(window.getComputedStyle(outside).color).toBe("rgb(255, 0, 0)");
      // When/Then: adoption and replacement change the shadow cascade independently.
      sheet.replaceSync("p {color:green}");
      shadow.adoptedStyleSheets = [sheet];
      expect(window.getComputedStyle(inside).color).toBe("rgb(0, 128, 0)");
      sheet.replaceSync("p {color:purple}");
      expect(window.getComputedStyle(inside).color).toBe("rgb(128, 0, 128)");
      expect(window.getComputedStyle(outside).color).toBe("rgb(255, 0, 0)");
    } finally {
      window.close();
    }
  });
  for (const [inherited, keyword, expected] of [
    [100, "bolder", "400"],
    [349, "bolder", "400"],
    [350, "bolder", "700"],
    [549, "bolder", "700"],
    [550, "bolder", "900"],
    [950, "bolder", "950"],
    [50, "lighter", "50"],
    [350, "lighter", "100"],
    [550, "lighter", "400"],
    [750, "lighter", "700"],
  ] as const) {
    it(`computes ${keyword} from inherited weight ${inherited}`, () => {
      // Given: relative font weights depend on the parent's computed numeric weight.
      const { window } = new JSDOM(
        `<main style="font-weight:${inherited}"><p style="font-weight:${keyword}"></p></main>`,
      );
      try {
        const p = window.document.querySelector("p");
        if (!p) throw new Error("Expected paragraph");
        // When/Then: computed style resolves the relative keyword using its threshold interval.
        expect(window.getComputedStyle(p).getPropertyValue("font-weight")).toBe(expected);
      } finally {
        window.close();
      }
    });
  }
  it("inherits supported font features and restores their computed initial values", () => {
    // Given: font metadata marks feature settings and kerning as inherited.
    const { window } = new JSDOM(
      '<main style="font-kerning:none;font-feature-settings: &quot;smcp&quot;"><p></p></main>',
    );
    try {
      const p = window.document.querySelector("p");
      if (!p) throw new Error("Expected paragraph");
      // When/Then: inherited values are numeric/serialized, while initial resets use property defaults.
      expect(window.getComputedStyle(p).getPropertyValue("font-kerning")).toBe("none");
      expect(window.getComputedStyle(p).getPropertyValue("font-feature-settings")).toBe('"smcp"');
      p.setAttribute(
        "style",
        "font-kerning:initial;font-feature-settings:initial;font-weight:bold;font-stretch:normal",
      );
      const style = window.getComputedStyle(p);
      expect(style.getPropertyValue("font-kerning")).toBe("auto");
      expect(style.getPropertyValue("font-feature-settings")).toBe("normal");
      expect(style.getPropertyValue("font-weight")).toBe("700");
      expect(style.getPropertyValue("font-stretch")).toBe("100%");
    } finally {
      window.close();
    }
  });
  it("resolves comparison math with inherited fonts, absolute units, and viewport dimensions", () => {
    // Given: valid mixed-unit expressions can require information unavailable to specified-value parsing.
    const { window } = new JSDOM(
      '<main style="font-size:20px"><p style="margin-left:min(15px, 1em);width:clamp(10px, 2em, 60px);height:min(10vw, 200px)"></p></main>',
    );
    try {
      const p = window.document.querySelector("p"),
        main = window.document.querySelector("main");
      if (!p || !main) throw new Error("Expected styled subtree");
      // When/Then: comparison functions resolve at computed-value time and react to inherited changes.
      const style = window.getComputedStyle(p);
      expect(style.getPropertyValue("margin-left")).toBe("15px");
      expect(style.getPropertyValue("width")).toBe("40px");
      expect(style.getPropertyValue("height")).toBe("102.4px");
      main.setAttribute("style", "font-size:10px");
      expect(window.getComputedStyle(p).getPropertyValue("margin-left")).toBe("10px");
      p.setAttribute("style", "margin-left:1in");
      expect(window.getComputedStyle(p).getPropertyValue("margin-left")).toBe("96px");
    } finally {
      window.close();
    }
  });
  it("rejects malformed or dimensionally incompatible comparison math", () => {
    // Given: recovery of mixed font units must preserve ordinary declaration rejection.
    const { window } = new JSDOM("<p></p>");
    try {
      const p = window.document.querySelector("p");
      if (!p) throw new Error("Expected paragraph");
      // When/Then: invalid expressions do not become pending valid declarations.
      for (const value of [
        "min()",
        "min(,)",
        "clamp(1px,2px)",
        "min(1px,0Hz)",
        "max(1%,0)",
        "min(1px, auto)",
      ]) {
        p.setAttribute("style", "");
        p.style.setProperty("margin-left", value);
        expect(p.style.getPropertyValue("margin-left")).toBe("");
      }
      p.setAttribute("style", "z-index:calc(10.1);order:calc(-1.5)");
      const computed = window.getComputedStyle(p);
      expect(computed.getPropertyValue("z-index")).toBe("10");
      expect(computed.getPropertyValue("order")).toBe("-1");
    } finally {
      window.close();
    }
  });
  it("keeps balanced unknown supports conditions as false CSSOM rules", () => {
    // Given: future syntax is valid general-enclosed syntax even when unsupported.
    const { window } = new JSDOM(
      "<style>@supports ((future-keyword)) {p {color:red}} @supports bareword {p {color:green}}</style><p></p>",
    );
    try {
      const sheet = window.document.styleSheets[0],
        p = window.document.querySelector("p");
      if (!sheet || !p) throw new Error("Expected stylesheet and paragraph");
      // When/Then: valid unknown conditions remain in CSSOM without applying declarations.
      expect(sheet.cssRules.length).toBe(1);
      expect(window.CSS.supports("((future-keyword))")).toBe(false);
      expect(window.CSS.supports("not (future-keyword)")).toBe(true);
      expect(window.CSS.supports("bareword")).toBe(false);
      expect(window.getComputedStyle(p).color).toBe("rgb(0, 0, 0)");
    } finally {
      window.close();
    }
  });
  for (const shorthand of [
    "border-top",
    "border-right",
    "border-bottom",
    "border-left",
    "border",
    "outline",
    "margin",
  ] as const) {
    it(`removes ${shorthand} and its expanded longhands atomically`, () => {
      // Given: a shorthand can be reconstructed from its expanded global-keyword longhands.
      const { window } = new JSDOM('<p style="color:blue"></p>');
      try {
        const p = window.document.querySelector("p");
        if (!p) throw new Error("Expected paragraph");
        p.style.setProperty(shorthand, "initial", "important");
        expect(p.style.getPropertyValue(shorthand)).toBe("initial");
        // When: removal must delete the whole logical declaration.
        expect(p.style.removeProperty(shorthand)).toBe("initial");
        // Then: serialization and unrelated declarations agree after removal.
        expect(p.style.getPropertyValue(shorthand)).toBe("");
        expect(p.style.getPropertyPriority(shorthand)).toBe("");
        expect(p.style.color).toBe("blue");
        p.style.setProperty(shorthand, "initial");
        p.style.setProperty(shorthand, "");
        expect(p.style.getPropertyValue(shorthand)).toBe("");
      } finally {
        window.close();
      }
    });
  }
  it("invalidates discovered prefixed XML stylesheets after Text and CDATA edits", () => {
    // Given: namespace prefixes do not change which character data owns stylesheet source.
    const { window } = new JSDOM(
      '<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:head><h:style>p {color:red}<![CDATA[p {color:blue}]]></h:style></h:head><h:body><h:p/></h:body></h:html>',
      { contentType: "application/xhtml+xml" },
    );
    try {
      const p = window.document.querySelector("p"),
        style = window.document.querySelector("style");
      const text = style?.firstChild,
        cdata = style?.lastChild;
      if (!p || !text || !cdata) throw new Error("Expected XML style source");
      expect(window.getComputedStyle(p).color).toBe("rgb(0, 0, 255)");
      // When/Then: both source representations invalidate the same discovery snapshot.
      cdata.nodeValue = "";
      expect(window.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
      text.nodeValue = "p {color:green}";
      expect(window.getComputedStyle(p).color).toBe("rgb(0, 128, 0)");
    } finally {
      window.close();
    }
  });
  it("rejects pseudo-elements nested inside logical selector feature queries", () => {
    // Given: forgiving selector syntax does not make an invalid feature supported.
    const { window } = new JSDOM("");
    try {
      // When/Then: top-level pseudo-elements remain supported; logical arguments reject them.
      expect(window.CSS.supports("selector(::before)")).toBe(true);
      for (const name of ["is", "where", "has", "not"])
        expect(window.CSS.supports(`selector(:${name}(::before))`)).toBe(false);
    } finally {
      window.close();
    }
  });
  it("reports declaration support using the same parser as actual property writes", () => {
    // Given: CSS syntax databases include properties this implementation does not expose.
    const { window } = new JSDOM("");
    try {
      // When/Then: supported syntax reflects actual declaration capabilities.
      expect(window.CSS.supports("-epub-caption-side", "inherit")).toBe(false);
      expect(window.CSS.supports("color", "rgb(from rebeccapurple r g b)")).toBe(true);
      expect(window.CSS.supports("(color: rgb(from rebeccapurple r g b))")).toBe(true);
      expect(window.CSS.supports("color", "rgb(from invalid r g b)")).toBe(false);
      expect(window.CSS.supports("width", "1px !important")).toBe(false);
    } finally {
      window.close();
    }
  });
  it("applies relative colors inside feature-query groups", () => {
    // Given: a relative color declaration accepted by the actual declaration parser.
    const { window } = new JSDOM(
      "<style>@supports (color: rgb(from rebeccapurple r g b)) { p {color:rgb(from rebeccapurple r g b)} }</style><p>Text</p>",
    );
    try {
      const p = window.document.querySelector("p");
      if (!p) throw new Error("Expected paragraph");
      // When/Then: the feature condition and computed-value pipeline agree.
      expect(window.getComputedStyle(p).color).toBe("color(srgb 0.4 0.2 0.6)");
    } finally {
      window.close();
    }
  });
});

describe("Computed font size keywords", () => {
  it("computes absolute sizes and parent-relative keywords to pixels", () => {
    // Given: font sizes use deterministic headless UA sizes and a 40px parent.
    const { window } = new JSDOM('<main style="font-size:40px"><span></span></main>');
    try {
      const span = window.document.querySelector("span");
      if (!span) throw new Error("Expected font fixture");
      // When/Then: all keyword values serialize computed pixel lengths.
      for (const [keyword, pixels] of [
        ["xx-small", 9],
        ["x-small", 10],
        ["small", 13],
        ["medium", 16],
        ["large", 18],
        ["x-large", 24],
        ["xx-large", 32],
        ["xxx-large", 48],
        ["larger", 48],
        ["smaller", 40 / 1.2],
      ] as const) {
        span.style.setProperty("font-size", keyword);
        expect(parseFloat(window.getComputedStyle(span).getPropertyValue("font-size"))).toBeCloseTo(
          pixels,
          4,
        );
      }
    } finally {
      window.close();
    }
  });
});

describe("CSS longhand clearing", () => {
  for (const [shorthand, value, longhands] of [
    [
      "border-color",
      "red blue",
      ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"],
    ],
    ["margin", "1px 2px", ["margin-top", "margin-right", "margin-bottom", "margin-left"]],
    ["flex", "1 2 10px", ["flex-grow", "flex-shrink", "flex-basis"]],
  ] as const)
    it(`clears reconstructed ${shorthand} after all its longhands are cleared`, () => {
      // Given: a native shorthand setter materializes dependent longhands.
      const { window } = new JSDOM("<p></p>");
      try {
        const p = window.document.querySelector("p");
        if (!p) throw new Error("Expected shorthand fixture");
        p.style.setProperty(shorthand, value);
        // When/Then: clearing individual longhands updates shorthand serialization and indices.
        for (const longhand of longhands) p.style.setProperty(longhand, "");
        expect(p.style.length).toBe(0);
        expect(p.style.getPropertyValue(shorthand)).toBe("");
        expect(p.style.cssText).toBe("");
      } finally {
        window.close();
      }
    });
  it("recovers non-inherited ancestor shorthands for explicit inheritance and independent snapshots", () => {
    const { window } = new JSDOM(
      "<style>main{--edge:3px solid #1677ff;border:var(--edge);--theme:old} section,i{border-top-color:inherit}</style><main><section><i></i></section></main>",
    );
    try {
      const main = window.document.querySelector("main");
      const child = window.document.querySelector("i");
      if (!main || !child) throw new Error("Expected an ancestor and nested child");
      const old = window.getComputedStyle(child);
      expect(old.getPropertyValue("visibility")).toBe("visible");
      const ancestor = window.getComputedStyle(main);
      main.style.setProperty("--edge", "7px solid red");
      main.style.setProperty("--theme", "new");
      const fresh = window.getComputedStyle(child);
      expect(old.getPropertyValue("border-top-color")).toBe("rgb(22, 119, 255)");
      expect(old.getPropertyValue("--theme")).toBe("old");
      expect(ancestor.getPropertyValue("border-top-width")).toBe("3px");
      expect(Array.from(ancestor)).toContain("border-top-color");
      expect(fresh.getPropertyValue("border-top-color")).toBe("rgb(255, 0, 0)");
      expect(fresh.getPropertyValue("--theme")).toBe("new");
      expect(window.getComputedStyle(main).getPropertyValue("border-top-width")).toBe("7px");
    } finally {
      window.close();
    }
  });
});
