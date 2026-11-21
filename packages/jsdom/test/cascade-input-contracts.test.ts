// Pins live cascade inputs and inherited directionality during repeated computed-style reads.
import { expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

it("recomputes specificity when the same declarations match with different selector branches", () => {
  // Given: both rules keep matching but the strongest branch changes without changing declaration text.
  const { window: w } = new JSDOM(
    '<style>p:is(#chosen,.entry){color:red}main p{color:blue}</style><main><p class="entry" id="chosen">text</p></main>',
  );
  try {
    const p = w.document.querySelector("p");
    if (!p) throw new Error("Expected paragraph");
    const before = w.getComputedStyle(p);
    expect(before.color).toBe("rgb(255, 0, 0)");
    // When/Then: :is uses its strongest argument even when that branch does not match.
    p.id = "other";
    expect(w.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
    const rule = w.document.styleSheets[0]?.cssRules[0];
    if (!(rule instanceof w.CSSStyleRule)) throw new Error("Expected rule");
    rule.selectorText = "p";
    expect(w.getComputedStyle(p).color).toBe("rgb(0, 0, 255)");
    expect(before.color).toBe("rgb(255, 0, 0)");
  } finally {
    w.close();
  }
});

it("updates priority, removal and reinsertion through live CSSOM declarations", () => {
  // Given: the same two rule declarations stay attached across multiple changes.
  const { window: w } = new JSDOM("<style>p{color:red!important}p{color:blue}</style><p>text</p>");
  try {
    const p = w.document.querySelector("p"),
      sheet = w.document.styleSheets[0];
    if (!p || !sheet) throw new Error("Expected sheet");
    const a = sheet.cssRules[0],
      b = sheet.cssRules[1];
    if (!(a instanceof w.CSSStyleRule) || !(b instanceof w.CSSStyleRule))
      throw new Error("Expected rules");
    expect(w.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
    a.style.setProperty("color", "red");
    expect(w.getComputedStyle(p).color).toBe("rgb(0, 0, 255)");
    b.style.removeProperty("color");
    expect(w.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
    b.style.color = "green";
    expect(w.getComputedStyle(p).color).toBe("rgb(0, 128, 0)");
  } finally {
    w.close();
  }
});

it("tracks automatic control direction after value changes without attribute changes", () => {
  // Given: directionality is a UA input rather than a matched author declaration.
  const { window: w } = new JSDOM('<input dir="auto" value="Latin"><bdi>Latin</bdi>');
  try {
    const input = w.document.querySelector("input"),
      bdi = w.document.querySelector("bdi");
    if (!(input instanceof w.HTMLInputElement) || !bdi)
      throw new Error("Expected direction fixture");
    const first = w.getComputedStyle(input);
    expect(first.getPropertyValue("direction")).toBe("ltr");
    input.value = "עברית";
    expect(input.getAttribute("value")).toBe("Latin");
    expect(w.getComputedStyle(input).getPropertyValue("direction")).toBe("rtl");
    expect(first.getPropertyValue("direction")).toBe("ltr");
    expect(w.getComputedStyle(bdi).getPropertyValue("direction")).toBe("ltr");
    bdi.textContent = "עברית";
    expect(w.getComputedStyle(bdi).getPropertyValue("direction")).toBe("rtl");
  } finally {
    w.close();
  }
});

it("keeps layer and media inputs current after declaration and viewport changes", () => {
  // Given: rule identity does not encode its current layer rank or media match.
  const { window: w } = new JSDOM(
    "<style>@layer first,second;@layer first{p{color:red}}@layer second{p{color:blue}}@media(min-width:1200px){p{font-size:30px}}</style><p>text</p>",
  );
  try {
    const p = w.document.querySelector("p"),
      sheet = w.document.styleSheets[0];
    if (!p || !sheet) throw new Error("Expected layer fixture");
    w.innerWidth = 1000;
    expect(w.getComputedStyle(p).color).toBe("rgb(0, 0, 255)");
    sheet.deleteRule(0);
    sheet.insertRule("@layer second,first;", 0);
    expect(w.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
    w.innerWidth = 1400;
    expect(w.getComputedStyle(p).getPropertyValue("font-size")).toBe("30px");
    w.innerWidth = 1000;
    expect(w.getComputedStyle(p).getPropertyValue("font-size")).not.toBe("30px");
  } finally {
    w.close();
  }
});

it("reevaluates live control state even when matching block counts stay equal", () => {
  // Given: checkedness changes without reflecting a checked content attribute.
  const { window: w } = new JSDOM(
    '<style>main:has(:checked){color:blue}main:not(:has(:checked)){color:red}</style><main><input type="checkbox"></main>',
  );
  try {
    const main = w.document.querySelector("main"),
      input = w.document.querySelector("input");
    if (!main || !(input instanceof w.HTMLInputElement)) throw new Error("Expected controls");
    expect(w.getComputedStyle(main).color).toBe("rgb(255, 0, 0)");
    input.checked = true;
    expect(input.hasAttribute("checked")).toBe(false);
    expect(w.getComputedStyle(main).color).toBe("rgb(0, 0, 255)");
    input.checked = false;
    expect(w.getComputedStyle(main).color).toBe("rgb(255, 0, 0)");
  } finally {
    w.close();
  }
});

it("recomputes hidden input display priority when the control type changes", () => {
  // Given: both UA display values are none but only a hidden input overrides author display.
  const { window: w } = new JSDOM(
    '<style>input{display:block}</style><input type="hidden" hidden>',
  );
  try {
    const input = w.document.querySelector("input");
    if (!(input instanceof w.HTMLInputElement)) throw new Error("Expected input");
    expect(w.getComputedStyle(input).display).toBe("none");
    input.type = "range";
    expect(w.getComputedStyle(input).display).toBe("block");
    input.type = "hidden";
    expect(w.getComputedStyle(input).display).toBe("none");
  } finally {
    w.close();
  }
});

it("keeps a mutable sheet in source order among indexed private sheets", () => {
  const { window: w } = new JSDOM(
    Array.from({ length: 16 }, (_, i) => `<style>.k${i}{color:red}</style>`).join("") +
      '<p class="k1"></p>',
  );
  try {
    const p = w.document.querySelector("p");
    const sheet = w.document.styleSheets[14];
    if (!p || !sheet) throw new Error("Expected fixture");
    const before = w.getComputedStyle(p);
    sheet.insertRule(".k1{color:blue}", 1);
    expect(w.getComputedStyle(p).color).toBe("rgb(0, 0, 255)");
    sheet.deleteRule(1);
    expect(w.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
    expect(before.color).toBe("rgb(255, 0, 0)");
  } finally {
    w.close();
  }
});

it("keeps every branch of a multi-rule sheet and preserves order after moving the owner", () => {
  const markup = Array.from(
    { length: 10 },
    (_, i) => `<style>.a${i}{color:red}.b${i}, #id${i}{color:blue}</style>`,
  ).join("");
  const { window: w } = new JSDOM(markup + '<p class="b2 a8"></p>');
  try {
    const p = w.document.querySelector("p"),
      owner = w.document.querySelectorAll("style")[2];
    if (!p || !owner || !w.document.head) throw new Error("Expected fixture");
    expect(w.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
    w.document.head.append(owner);
    expect(w.getComputedStyle(p).color).toBe("rgb(0, 0, 255)");
    p.className = "a8";
    p.id = "id2";
    expect(w.getComputedStyle(p).color).toBe("rgb(0, 0, 255)");
  } finally {
    w.close();
  }
});
