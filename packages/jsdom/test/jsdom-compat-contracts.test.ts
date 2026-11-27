// Pins behavior differences found by differential sweeps to jsdom 31.0.1, run on both providers.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM, requestInterceptor } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: Pick<
  typeof import("@run-dom/jsdom"),
  "JSDOM" | "requestInterceptor"
> = require("jsdom");

const providers = [
  { name: "RunDOM", Constructor: JSDOM, intercept: requestInterceptor },
  { name: "jsdom", Constructor: reference.JSDOM, intercept: reference.requestInterceptor },
];

describe.each(providers)("$name CSSStyleDeclaration property names", ({ Constructor }) => {
  it("should match standard property names ASCII case-insensitively in every method", () => {
    // Given: inline, rule and computed declarations with mixed-case authored names.
    const { window } = new Constructor(
      `<style>.r { Opacity: 0.4 !IMPORTANT; --Foo: a }</style>` +
        `<div style="--Bar: 1; COLOR: red"></div>`,
    );
    try {
      const element = window.document.querySelector("div")!;
      const rule = (window.document.styleSheets[0]!.cssRules[0] as CSSStyleRule).style;
      const computed = window.getComputedStyle(element);
      // When/Then: upper-case standard names find the lower-case declarations.
      expect(element.style.getPropertyValue("COLOR")).toBe("red");
      expect(element.style.getPropertyValue("Color")).toBe("red");
      expect([rule.getPropertyValue("OPACITY"), rule.getPropertyPriority("OPACITY")]).toEqual([
        "0.4",
        "important",
      ]);
      expect(computed.getPropertyValue("DISPLAY")).toBe("block");
      // Then: only ASCII letters fold; U+212A KELVIN SIGN is not "k".
      expect(element.style.getPropertyValue("Kerning")).toBe("");
      // When: a shorthand is written and removed through upper-case names.
      element.style.setProperty("MARGIN", "1px", "IMPORTANT");
      expect([
        element.style.getPropertyPriority("MARGIN"),
        element.style.getPropertyPriority("MARGIN-TOP"),
        element.style.getPropertyValue("Margin-Top"),
      ]).toEqual(["important", "important", "1px"]);
      expect(element.style.removeProperty("Margin")).toBe("1px");
      // Then: the declaration is gone from the block and the attribute.
      expect(element.style.cssText).toBe("--Bar: 1; color: red;");
      element.style.setProperty("FONT-SIZE", "2px");
      expect(element.style.removeProperty("FONT-size")).toBe("2px");
      expect(element.getAttribute("style")).toBe("--Bar: 1; color: red;");
    } finally {
      window.close();
    }
  });

  it("should keep custom property names case-sensitive", () => {
    // Given: custom properties whose names differ only in case.
    const { window } = new Constructor(
      `<style>.r { --Foo: a }</style><div style="--Bar: 1"></div>`,
    );
    try {
      const element = window.document.querySelector("div")!;
      const rule = (window.document.styleSheets[0]!.cssRules[0] as CSSStyleRule).style;
      // When/Then: only the exact spelling reads, removes or computes.
      expect([
        element.style.getPropertyValue("--bar"),
        element.style.getPropertyValue("--Bar"),
      ]).toEqual(["", "1"]);
      expect([rule.getPropertyValue("--foo"), rule.getPropertyValue("--Foo")]).toEqual(["", "a"]);
      const computed = window.getComputedStyle(element);
      expect([computed.getPropertyValue("--BAR"), computed.getPropertyValue("--Bar")]).toEqual([
        "",
        "1",
      ]);
      element.style.setProperty("--X", "1");
      expect(element.style.removeProperty("--x")).toBe("");
      expect(element.style.removeProperty("--X")).toBe("1");
      expect(element.style.cssText).toBe("--Bar: 1;");
    } finally {
      window.close();
    }
  });
});

describe.each(providers)("$name <alpha-value> percentages", ({ Constructor }) => {
  const properties = [
    "opacity",
    "fill-opacity",
    "stroke-opacity",
    "flood-opacity",
    "stop-opacity",
    "shape-image-threshold",
  ];

  it("should specify a percentage as the equivalent number in inline declarations", () => {
    // Given: a fresh element per property and percentage.
    const { window } = new Constructor();
    try {
      for (const property of properties) {
        for (const [input, specified] of [
          ["50%", "0.5"],
          ["-100%", "-1"],
          ["300%", "3"],
          ["0%", "0"],
          ["12.5%", "0.125"],
          ["1e2%", "1"],
          ["0.0001%", "0.000001"],
          ["calc(50%)", "calc(50%)"],
        ] as const) {
          const element = window.document.createElement("div");
          // When: the percentage is written through setProperty and the style attribute.
          element.style.setProperty(property, input);
          const attributed = window.document.createElement("div");
          attributed.setAttribute("style", `${property}: ${input}`);
          // Then: both declarations hold the number jsdom specifies.
          expect([property, input, element.style.getPropertyValue(property)]).toEqual([
            property,
            input,
            specified,
          ]);
          expect([property, input, element.getAttribute("style")]).toEqual([
            property,
            input,
            `${property}: ${specified};`,
          ]);
          expect([property, input, attributed.style.getPropertyValue(property)]).toEqual([
            property,
            input,
            specified,
          ]);
        }
      }
      const element = window.document.createElement("div");
      element.style.opacity = "25%";
      expect(element.style.opacity).toBe("0.25");
    } finally {
      window.close();
    }
  });

  it("should specify a percentage as a number in stylesheet rules and compute it", () => {
    // Given: a stylesheet rule with percentage opacities.
    const { window } = new Constructor(
      `<style>.o { opacity: 50%; fill-opacity: 25% }</style><div class="o"></div>`,
    );
    try {
      const rule = window.document.styleSheets[0]!.cssRules[0] as CSSStyleRule;
      // When/Then: the rule serializes numbers and the computed opacity agrees.
      expect(rule.cssText).toBe(".o { opacity: 0.5; fill-opacity: 0.25; }");
      expect(rule.style.getPropertyValue("opacity")).toBe("0.5");
      expect(window.getComputedStyle(window.document.querySelector("div")!).opacity).toBe("0.5");
    } finally {
      window.close();
    }
  });
});

describe.each(providers)(
  "$name parsed stylesheets before a later <base href>",
  ({ Constructor, intercept }) => {
    const markup =
    `<!doctype html><html><head>` +
    `<style>@import "imp.css"; .a { background-image: url(a.png) }</style>` +
    `<link rel="stylesheet" href="l.css">` +
    `</head><body><div class="a" style="list-style-image: url(i.png)"></div>` +
    `<base href="http://other.example/sub/">` +
    `<style>.b { background-image: url(b.png) }</style>` +
    `<div class="b" style="list-style-image: url(j.png)"></div><p></p></body></html>`;

    it("should resolve earlier sheets, links and style attributes against the document URL", async () => {
      // Given: a document whose first sheet, link and styled element precede its <base href>.
      const requested: string[] = [];
      const { window } = new Constructor(markup, {
        url: "http://doc.example/dir/page.html",
        resources: {
          interceptors: [
            intercept((request) => {
              requested.push(request.url);
              return new Response("p { background-image: url(x.png) }", {
                headers: { "content-type": "text/css" },
              });
            }),
          ],
        },
      });
      try {
        await new Promise((resolve) => window.addEventListener("load", resolve));
        const { document } = window;
        const computed = (selector: string) =>
          window.getComputedStyle(document.querySelector(selector)!);
        // When/Then: requests use the base the parser saw, not the later <base>.
        expect(requested.toSorted()).toEqual([
          "http://doc.example/dir/imp.css",
          "http://doc.example/dir/l.css",
        ]);
        const importRule = document.styleSheets[0]!.cssRules[0] as CSSImportRule;
        expect([importRule.href, importRule.styleSheet?.href]).toEqual([
          "imp.css",
          "http://doc.example/dir/imp.css",
        ]);
        expect(document.styleSheets[1]!.href).toBe("http://doc.example/dir/l.css");
        expect(computed("p").backgroundImage).toBe('url("http://doc.example/dir/x.png")');
        // Then: rules and style attributes before the base use the document URL; later ones the base.
        expect(computed(".a").backgroundImage).toBe('url("http://doc.example/dir/a.png")');
        expect(computed(".a").listStyleImage).toBe('url("http://doc.example/dir/i.png")');
        expect(computed(".b").backgroundImage).toBe('url("http://other.example/sub/b.png")');
        expect(computed(".b").listStyleImage).toBe('url("http://other.example/sub/j.png")');
        expect(document.baseURI).toBe("http://other.example/sub/");
      } finally {
        window.close();
      }
    });

    it("should resolve sheets inserted after parsing against the live base", () => {
      // Given: a parsed document with a <base href> and an early parsed sheet.
      const { window } = new Constructor(markup, { url: "http://doc.example/dir/page.html" });
      try {
        const { document } = window;
        // When: a script prepends a sheet and later writes a URL into the early element's style.
        const style = document.createElement("style");
        style.textContent = "p { background-image: url(p.png) }";
        document.head.prepend(style);
        const early = document.querySelector<HTMLElement>(".a")!;
        early.style.backgroundImage = "url(late.png)";
        // Then: both resolve against the current document base, as in jsdom.
        expect(window.getComputedStyle(document.querySelector("p")!).backgroundImage).toBe(
          'url("http://other.example/sub/p.png")',
        );
        expect(window.getComputedStyle(early).backgroundImage).toBe(
          'url("http://other.example/sub/late.png")',
        );
        expect(window.getComputedStyle(early).listStyleImage).toBe(
          'url("http://doc.example/dir/i.png")',
        );
      } finally {
        window.close();
      }
    });
  },
);
