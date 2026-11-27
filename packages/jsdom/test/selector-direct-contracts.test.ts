// Pins that common selector syntax matches, rejects and cascades exactly like the general selector adapter.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

type TestDocument = JSDOM["window"]["document"];
type TestElement = ReturnType<TestDocument["createElement"]>;

const htmlFixture = `<!doctype html><html lang="en-US"><head><title>t</title></head><body>
<section id="main" class="a B" title="x b y" data-x="1" role="region button">
  <div class="a b" lang="en"><p class="a">one</p><p class="b" id="_x">two</p> <span class="-a"></span><p></p></div>
  <div id="Mixed" class="A"><span>t</span><em> </em><p><b></b></p><span class="b"></span></div>
  <a href="https://example.org/a">l</a><a>plain</a><a href="#main">frag</a>
  <img alt=""><img alt="cat"><select multiple><option selected>o</option></select><select><option>p</option></select>
  <input type="TEXT" data-x="One" list="l"><input type="email"><input type="checkbox" checked disabled>
  <input type="number" min="1" max="3" value="5" required><input placeholder="p" readonly>
  <textarea></textarea><button type="submit">b</button><custom-el></custom-el>
  <svg><foreignObject><clipPath id="c"></clipPath></foreignObject></svg>
  <ul><li></li><li class="a"></li><li></li><li></li><li></li></ul>
</section></body></html>`;

const xmlFixture = `<root xmlns:z="urn:z"><Item Type="Text" class="a"><item type="text"/><z:leaf id="l"/></Item>
<html xmlns="http://www.w3.org/1999/xhtml"><p class="a" TITLE="T">x</p><P/><input type="TEXT"/></html><empty/><item/></root>`;

const valid = [
  "div",
  "DIV",
  "Div.A",
  "*",
  "#main",
  "#Mixed",
  ".a",
  ".A",
  ".a.b",
  "section#main.a",
  ".-a",
  "#_x",
  "[data-x]",
  '[data-x="1"]',
  "[data-x='1']",
  "[data-x=One]",
  "[DATA-X]",
  "[type=TEXT]",
  "[type=text]",
  '[type="text" i]',
  '[type="TEXT" s]',
  '[data-x="one"i]',
  "[title~=b]",
  '[title~=""]',
  "[lang|=en]",
  '[href^="https"]',
  '[href$=".org/a"]',
  "[href*=example]",
  '[href^=""]',
  '[ data-x = "1" ]',
  "[Type]",
  "[TITLE]",
  "[z]",
  "div > p",
  "div p",
  "p + p",
  "p ~ span",
  "div>p+p~span",
  "section  div   p",
  "body *",
  "ul > li + li",
  ":first-child",
  ":last-child",
  ":only-child",
  "p:first-of-type",
  "span:last-of-type",
  ":only-of-type",
  ":nth-child(2)",
  ":nth-child(odd)",
  ":nth-child(EVEN)",
  ":nth-child(2n+1)",
  ":nth-child(-n+2)",
  ":nth-child(n)",
  ":nth-child(+n)",
  ":nth-child(n+1)",
  ":nth-child(3n-1)",
  ":nth-child(-2n+5)",
  ":nth-child(0n+0)",
  ":nth-child(-3)",
  ":nth-child( 2n+1 )",
  ":nth-last-child(2)",
  "p:nth-of-type(2n)",
  ":nth-last-of-type(1)",
  "li:nth-child(2N+1)",
  ":empty",
  ":root",
  "html:root",
  ":checked",
  ":enabled",
  ":disabled",
  ":required",
  ":optional",
  ":read-only",
  ":read-write",
  ":link",
  ":any-link",
  ":visited",
  ":defined",
  ":target",
  ":placeholder-shown",
  ":in-range",
  ":out-of-range",
  ":indeterminate",
  ":default",
  ":valid",
  ":invalid",
  ":focus",
  ":focus-within",
  ":focus-visible",
  ":not(.a)",
  ":not(div p)",
  ":not(.a, .b)",
  ":is(p, span).a",
  ":where(#main) p",
  "div:not(:first-child)",
  ":not(:not(.a))",
  "p:NOT(.A)",
  ":FIRST-CHILD",
  ":is(:checked, :disabled)",
  ":not(:focus-within)",
  'input:not([list])[type="email"]',
  "select:not([multiple]):not([size])",
  '[alt]:not([alt=""])',
  'input[type="checkbox"]',
  '*[role~="button"],button,input[type="button"]',
  "p, span",
  " p ",
  "p,\n\tspan",
  "svg foreignObject",
  "foreignobject",
  "clipPath",
  "Item > item",
  "item",
  "P",
  "z",
  "html p.a",
  "root > *:last-child",
  "div#Mixed > span",
  "#Mixed .b",
  ".A > p",
];
// Negation triggers reference validation, so every argument-free pseudo-class is also pinned inside :not().
valid.push(
  ...valid.filter((selector) => /^:[a-z-]+$/.test(selector)).map((name) => `:not(${name})`),
);

const invalid = [
  "",
  " ",
  "p,",
  ",p",
  "p >",
  "> p",
  "p >> span",
  ".1a",
  "#1a",
  "[1a]",
  "[a=1]",
  '[a="b" x]',
  "[a]i",
  ":not()",
  ":nth-child()",
  ":nth-child(2n of p)",
  ":unknown",
  ":first-child()",
  ":is(.a, :unknown)",
  "p:not(.a",
  "[a",
  "::before",
  "p::before",
  "a:hover",
  ":heading",
  ":nth-child(2n + 1)",
  "|p",
  "*|p",
  "svg|rect",
  "p\\:x",
  ":state(x)",
  ":has(p)",
  ":scope > p",
  "&",
  ":nth-child(n- 1)",
  "p:checked:hover",
];

type Outcome =
  | { error: string }
  | { matches: number[]; all: number[]; first: number; closest: number[] };

function outcome(document: TestDocument, selector: string): Outcome {
  const elements = [...document.querySelectorAll("*")];
  const index = (element: TestElement | null) => (element ? elements.indexOf(element) : -1);
  try {
    return {
      matches: elements.flatMap((element, at) => (element.matches(selector) ? [at] : [])),
      all: [...document.querySelectorAll(selector)].map(index),
      first: index(document.querySelector(selector)),
      closest: elements.map((element) => index(element.closest(selector))),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.name : String(error) };
  }
}

describe("Direct selector front end", () => {
  for (const [kind, documentFor] of [
    ["HTML", () => new JSDOM(htmlFixture).window.document],
    ["XML", () => new JSDOM(xmlFixture, { contentType: "application/xml" }).window.document],
  ] as const) {
    it(`should match ${kind} documents exactly like the general adapter`, () => {
      // Given: one document per selector path; a trailing comment forces the general adapter.
      const direct = documentFor();
      const general = documentFor();
      for (const selector of valid) {
        // When: both paths evaluate every element, query and ancestor lookup.
        const expected = outcome(general, `${selector}/**/`);
        // Then: results are identical and the selector is accepted.
        expect(outcome(direct, selector), selector).toEqual(expected);
        expect(expected, selector).not.toHaveProperty("error");
      }
    });
  }

  it("should keep rejecting malformed and unsupported selectors with SyntaxError", () => {
    // Given: selectors outside the direct grammar or invalid CSS.
    const { document } = new JSDOM(htmlFixture).window;
    for (const selector of invalid) {
      // When/Then: matching and queries either fall back or throw the existing DOMException.
      const result = outcome(document, selector);
      if ("error" in result) expect(result.error, selector).toBe("SyntaxError");
    }
    expect(() => document.querySelector(":not()")).toThrow(
      expect.objectContaining({ name: "SyntaxError" }),
    );
    expect(() => document.querySelector("[a=1]")).toThrow(
      expect.objectContaining({ name: "SyntaxError" }),
    );
  });

  it("should keep live state and fresh NodeLists for repeated direct selectors", () => {
    // Given: a checkbox matched through a direct live-state selector.
    const { document } = new JSDOM('<input type="checkbox"><p class="a"></p>').window;
    const input = document.querySelector("input");
    if (!input) throw new Error("Expected input");
    const first = document.querySelectorAll("input:not(:checked), p.a");
    // When: live state changes between identical queries.
    Object.assign(input, { checked: true });
    const second = document.querySelectorAll("input:not(:checked), p.a");
    // Then: results reflect current state and each call returns a fresh list.
    expect(first.length).toBe(2);
    expect(second.length).toBe(1);
    expect(second).not.toBe(first);
    expect(document.querySelectorAll("p.a")).not.toBe(document.querySelectorAll("p.a"));
  });

  it("should cascade direct selectors with unchanged specificity", () => {
    // Given: competing rules whose winners depend on :is(), :where() and :not() specificity.
    const { window } = new JSDOM(`<style>
      #main p:not(.b) { color: rgb(1, 1, 1) }
      div p.a { color: rgb(2, 2, 2) }
      :where(#main) .b { color: rgb(3, 3, 3) }
      p.b { color: rgb(4, 4, 4) }
      :is(#main, p) > span { color: rgb(5, 5, 5) }
      div > span.c { color: rgb(6, 6, 6) }
    </style><div id="main"><p class="a"></p><p class="b"></p><span class="c"></span></div>`);
    const [a, b] = window.document.querySelectorAll("p");
    const span = window.document.querySelector("span");
    if (!a || !b || !span) throw new Error("Expected cascade fixture");
    // When/Then: the higher-specificity rule wins regardless of source order.
    expect(window.getComputedStyle(a).color).toBe("rgb(1, 1, 1)");
    expect(window.getComputedStyle(b).color).toBe("rgb(4, 4, 4)");
    expect(window.getComputedStyle(span).color).toBe("rgb(5, 5, 5)");
  });
});
