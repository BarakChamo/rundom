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

describe.each(providers)(
  "$name members read through another Window's getters",
  ({ Constructor }) => {
    function getter(prototype: object, name: string): (this: unknown) => unknown {
      for (
        let current: object | null = prototype;
        current;
        current = Object.getPrototypeOf(current)
      ) {
        const read = Object.getOwnPropertyDescriptor(current, name)?.get;
        if (read) return read;
      }
      throw new Error(`No ${name} getter`);
    }

    it("should return the node's own live objects, not new ones from the calling Window", () => {
      // Given: an element from Window A and the interface prototypes of Window B.
      const a = new Constructor().window;
      const b = new Constructor().window;
      try {
        const element = a.document.createElement("div");
        element.innerHTML = "<p></p>";
        element.className = "c";
        element.dataset.x = "1";
        const fromB = {
          childNodes: getter(b.Node.prototype, "childNodes"),
          children: getter(b.Element.prototype, "children"),
          classList: getter(b.Element.prototype, "classList"),
          attributes: getter(b.Element.prototype, "attributes"),
          style: getter(b.document.createElement("div"), "style"),
          dataset: getter(b.HTMLElement.prototype, "dataset"),
        };
        // When: B's getter runs first, then A's, then B's again.
        for (const [name, read] of Object.entries(fromB)) {
          const first = read.call(element);
          // Then: every read yields A's single object with A's prototype.
          expect([name, first === Reflect.get(element, name)]).toEqual([name, true]);
          expect([name, read.call(element) === first]).toEqual([name, true]);
          expect([
            name,
            Object.getPrototypeOf(first) === Object.getPrototypeOf(Reflect.get(element, name)),
          ]).toEqual([name, true]);
        }
        expect(Object.getPrototypeOf(fromB.childNodes.call(element))).toBe(a.NodeList.prototype);
        // Then: the borrowed objects stay live views of A's element.
        (fromB.style.call(element) as CSSStyleDeclaration).color = "red";
        expect(element.getAttribute("style")).toBe("color: red;");
      } finally {
        a.close();
        b.close();
      }
    });
  },
);

describe.each(providers)("$name declaration indices after shorthand writes", ({ Constructor }) => {
  function names(style: CSSStyleDeclaration): string[] {
    const indexed = Array.from({ length: style.length }, (_, index) => style[index] ?? "");
    // The indexed getter, item() and iteration agree on one list.
    expect(indexed.map((_, index) => style.item(index))).toEqual(indexed);
    expect([...style]).toEqual(indexed);
    return indexed;
  }

  it("should list only longhands, in jsdom's expansion order", () => {
    // Given: one element per shorthand write.
    const { window } = new Constructor();
    try {
      const cases: readonly (readonly [string, string, readonly string[]])[] = [
        ["margin", "1px", ["margin-top", "margin-right", "margin-bottom", "margin-left"]],
        ["padding", "1px 2px", ["padding-top", "padding-right", "padding-bottom", "padding-left"]],
        ["border-top", "1px solid", ["border-top-width", "border-top-style", "border-top-color"]],
        ["overflow", "hidden", ["overflow-x", "overflow-y"]],
        [
          "text-decoration",
          "underline",
          [
            "text-decoration-line",
            "text-decoration-thickness",
            "text-decoration-style",
            "text-decoration-color",
          ],
        ],
        [
          "background",
          "red",
          [
            "background-image",
            "background-position-x",
            "background-position-y",
            "background-size",
            "background-repeat-x",
            "background-repeat-y",
            "background-attachment",
            "background-origin",
            "background-clip",
            "background-color",
            "background-blend-mode",
          ],
        ],
        [
          "border",
          "1px solid red",
          ["width", "style", "color"]
            .flatMap((part) =>
              ["top", "right", "bottom", "left"].map((side) => `border-${side}-${part}`),
            )
            .concat(
              ["source", "slice", "width", "outset", "repeat"].map((p) => `border-image-${p}`),
            ),
        ],
      ];
      for (const [property, value, expected] of cases) {
        const element = window.document.createElement("div");
        // When: the shorthand is written.
        element.style.setProperty(property, value);
        // Then: the indices are its longhands only.
        expect([property, names(element.style)]).toEqual([property, expected]);
        // When/Then: removing it empties the block.
        element.style.removeProperty(property);
        expect([property, element.style.length, element.style.cssText]).toEqual([property, 0, ""]);
      }
      const font = window.document.createElement("div");
      font.style.font = "12px serif";
      expect(font.style.length).toBe(19);
      expect(names(font.style)).not.toContain("font");
    } finally {
      window.close();
    }
  });

  it("should keep a shorthand's other longhands when one of them is removed", () => {
    // Given: shorthands written over and after a longhand.
    const { window } = new Constructor();
    try {
      const margin = window.document.createElement("div");
      margin.style.setProperty("margin-top", "3px");
      margin.style.setProperty("margin", "1px 2px");
      // When: a covered longhand is removed.
      expect(margin.style.removeProperty("margin-top")).toBe("1px");
      // Then: the remaining longhands stay and the shorthand no longer serializes.
      expect(margin.style.cssText).toBe("margin-right: 2px; margin-bottom: 1px; margin-left: 2px;");
      expect([margin.style.length, margin.style.getPropertyValue("margin")]).toEqual([3, ""]);
      const overflow = window.document.createElement("div");
      overflow.style.overflow = "hidden";
      expect([
        overflow.style.getPropertyValue("overflow-x"),
        overflow.style.getPropertyValue("overflow-y"),
      ]).toEqual(["hidden", "hidden"]);
      overflow.style.removeProperty("overflow-x");
      expect([names(overflow.style), overflow.style.getPropertyValue("overflow-y")]).toEqual([
        ["overflow-y"],
        "hidden",
      ]);
      const border = window.document.createElement("div");
      border.style.border = "1px solid red";
      expect(border.style.getPropertyValue("border-image-source")).toBe("none");
    } finally {
      window.close();
    }
  });
});
