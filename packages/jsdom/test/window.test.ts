// Verifies observable behavior through the built Node compatibility facade.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM, VirtualConsole } from "@run-dom/jsdom";

const require = createRequire(import.meta.url);
const {
  JSDOM: reference,
  VirtualConsole: ReferenceConsole,
}: {
  JSDOM: typeof JSDOM;
  VirtualConsole: typeof VirtualConsole;
} = require("jsdom");

it("escapes angle brackets in HTML attributes during serialization", () => {
  // Given parsed attribute text containing literal angle brackets
  const dom = new JSDOM('<p data-value="<>&amp;&quot;"></p>');
  try {
    const paragraph = dom.window.document.querySelector("p");
    // Then serialization escapes attribute delimiters without changing the DOM value
    expect(paragraph?.getAttribute("data-value")).toBe('<>&"');
    expect(paragraph?.outerHTML).toBe('<p data-value="&lt;&gt;&amp;&quot;"></p>');
  } finally {
    dom.window.close();
  }
});

it("resolves XML XPath prefixes through the supplied callback", () => {
  // Given a namespaced XML node and a resolver using a different prefix
  const { window } = new JSDOM('<root xmlns:sample="urn:sample"><sample:item/></root>', {
    contentType: "application/xml",
  });
  try {
    const { document, XPathResult } = window;
    const prefixes: string[] = [];

    // When XPath resolves the query prefix, then it returns the original DOM node
    const result = document.evaluate(
      "//query:item",
      document,
      (prefix) => {
        prefixes.push(prefix);
        return "urn:sample";
      },
      XPathResult.FIRST_ORDERED_NODE_TYPE,
    );
    expect(prefixes).toEqual(["query"]);
    expect(result.singleNodeValue).toBe(document.documentElement?.firstChild);
    expect(() => document.evaluate("//missing:item", document, () => null)).toThrow(
      expect.objectContaining({ name: "NamespaceError" }),
    );
  } finally {
    window.close();
  }
});

it("invalidates a cross-window XPath iterator when its context document changes", () => {
  // Given an evaluator and a context document from different Windows
  const first = new JSDOM();
  const second = new JSDOM("<p>entry</p>");
  try {
    const context = second.window.document;
    const evaluator = new first.window.XPathEvaluator();
    const result = evaluator.evaluate("//p", context);
    expect(result.iterateNext()).toBe(context.querySelector("p"));

    // When the context document changes, then the foreign iterator is invalidated
    context.body?.append(context.createElement("p"));
    expect(result.invalidIteratorState).toBe(true);
    expect(() => result.iterateNext()).toThrow(/mutated/i);
  } finally {
    first.window.close();
    second.window.close();
  }
});

it("keeps XPath resolvers and results independent across repeated expressions", () => {
  // Given two namespaces addressed by the same query
  const { window } = new JSDOM('<root xmlns:a="urn:a" xmlns:b="urn:b"><a:item/><b:item/></root>', {
    contentType: "application/xml",
  });
  try {
    const { document } = window;
    const query = "//scope:item";
    const first = document.evaluate(query, document, () => "urn:a");
    const second = document.evaluate(query, document, () => "urn:b");

    // Then each iterator returns its own matching node independently
    expect(first.iterateNext()).toBe(document.documentElement?.firstChild);
    expect(second.iterateNext()).toBe(document.documentElement?.lastChild);
    expect(first.iterateNext()).toBeNull();
    expect(second.iterateNext()).toBeNull();
  } finally {
    window.close();
  }
});

it("applies matching supports groups and retains inactive groups in CSSOM", () => {
  // Given true and false feature queries around competing declarations
  const { window } = new JSDOM(
    "<style>@supports (color: red) { p { color: red } } @supports (color: rainbow) { p { color: blue } }</style><p>target</p>",
  );
  try {
    const sheet = window.document.styleSheets.item(0);
    const target = window.document.querySelector("p");
    const enabled = sheet?.cssRules[0];
    const disabled = sheet?.cssRules[1];
    if (
      !(enabled instanceof window.CSSSupportsRule) ||
      !(disabled instanceof window.CSSSupportsRule) ||
      !target
    )
      throw new Error("Expected supports rules");

    // When inspecting the groups, then only the matching declarations participate
    expect(enabled.matches).toBe(true);
    expect(disabled.matches).toBe(false);
    expect(disabled.cssRules.length).toBe(1);
    expect(enabled.conditionText).toBe("(color: red)");
    expect(window.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
    enabled.insertRule("p { color: green }", 1);
    expect(window.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
  } finally {
    window.close();
  }
});

it("reports implemented CSS at-rules in feature queries", () => {
  // Given a stylesheet that checks for media rule support
  const { window } = new JSDOM(
    "<style>@supports at-rule(@media) { p { color: red } }</style><p>target</p>",
  );
  try {
    // When queried through CSS.supports, then only a single implemented at-keyword matches
    expect(window.CSS.supports("at-rule( @supports /**/) and (color: red)")).toBe(true);
    expect(window.CSS.supports(String.raw`AT-RULE(@\6d edia)`)).toBe(true);
    expect(window.CSS.supports("at-rule(@import)")).toBe(true);
    expect(window.CSS.supports("at-rule(@media screen)")).toBe(false);
    expect(window.CSS.supports("at-rule(@ media)")).toBe(false);
    expect(window.CSS.supports("at-rule(@charset)")).toBe(false);
    expect(window.CSS.supports("at-rule(@starting-style)")).toBe(false);

    const target = window.document.querySelector("p");
    if (!target) throw new Error("Expected a styled paragraph");
    expect(window.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
  } finally {
    window.close();
  }
});

it("serializes at-rule queries in stylesheet conditions", () => {
  // Given nested feature queries with comments and identifier escapes
  const { window } = new JSDOM();
  try {
    const sheet = new window.CSSStyleSheet();
    sheet.replaceSync(String.raw`@supports (at-rule( @\6d edia /**/) or at-rule(@--\31 23)) {}`);
    const rule = sheet.cssRules[0];
    if (!(rule instanceof window.CSSSupportsRule)) throw new Error("Expected a supports rule");

    // When read back, then the canonical condition retains the same result
    expect(rule.conditionText).toBe("(at-rule(@media) or at-rule(@--123))");
    expect(window.CSS.supports(rule.conditionText)).toBe(true);
    expect(rule.cssText).toContain(`@supports ${rule.conditionText}`);
  } finally {
    window.close();
  }
});

it("updates style rule matching atomically when selectorText changes", () => {
  // Given a rule that matches only the first paragraph
  const { window } = new JSDOM(
    "<style>#first { color: red }</style><p id=first></p><p id=second></p>",
  );
  try {
    const rule = window.document.styleSheets[0]?.cssRules[0];
    const first = window.document.getElementById("first");
    const second = window.document.getElementById("second");
    if (!(rule instanceof window.CSSStyleRule) || !first || !second)
      throw new Error("Expected a style rule and two paragraphs");

    // When the selector changes, then serialization and the cascade use the same selector
    rule.selectorText = "  p > span,#second ";
    expect(rule.selectorText).toBe("p > span, #second");
    expect(window.getComputedStyle(first).color).toBe("rgb(0, 0, 0)");
    expect(window.getComputedStyle(second).color).toBe("rgb(255, 0, 0)");

    // An invalid branch must preserve the entire previous selector list.
    rule.selectorText = "#first, :gibberish";
    expect(rule.cssText).toBe("p > span, #second { color: red; }");
    expect(window.getComputedStyle(second).color).toBe("rgb(255, 0, 0)");
  } finally {
    window.close();
  }
});

it("resolves stylesheet custom properties through the cascade after rule edits", () => {
  // Given a parent alias, a child override of its source, and a cyclic custom property
  const { window } = new JSDOM("<main><p>target</p></main>");
  try {
    const sheet = new window.CSSStyleSheet();
    sheet.replaceSync(`
      main { --source: blue; --alias: var(--source, var(--alias)); }
      p {
        --source: red;
        --cycle: var(--cycle, orange);
        color: var(--alias);
        background-color: var(--cycle, green);
        width: var(--width, 20px);
      }
    `);
    window.document.adoptedStyleSheets = [sheet];
    const target = window.document.querySelector("p");
    const source = sheet.rules[0];
    if (!target || !(source instanceof window.CSSStyleRule))
      throw new Error("Expected a paragraph and its parent rule");

    // When reading computed style, then inherited aliases keep their parent's computed value
    const style = window.getComputedStyle(target);
    expect(style.color).toBe("rgb(0, 0, 255)");
    expect(style.getPropertyValue("background-color")).toBe("rgb(0, 128, 0)");
    expect(style.getPropertyValue("width")).toBe("20px");
    expect(style.getPropertyValue("--alias")).toBe("blue");
    expect(style.getPropertyValue("--cycle")).toBe("");

    source.style.setProperty("--source", "purple");
    expect(window.getComputedStyle(target).color).toBe("rgb(128, 0, 128)");
  } finally {
    window.close();
  }
});

it("serializes legacy pseudo-element selectors without matching their originating elements", () => {
  // Given a style rule that initially colors paragraphs
  const { window } = new JSDOM("<style>p { color: red }</style><p>target</p>");
  try {
    const rule = window.document.styleSheets[0]?.cssRules[0];
    const target = window.document.querySelector("p");
    if (!(rule instanceof window.CSSStyleRule) || !target)
      throw new Error("Expected a style rule and paragraph");

    // When the selector targets a pseudo-element, then the element itself loses the declaration
    rule.selectorText = "p:before";
    expect(rule.selectorText).toBe("p::before");
    expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 0)");
    rule.selectorText = "p::unknown";
    expect(rule.selectorText).toBe("p::before");
    rule.selectorText = "p::after, p";
    expect(rule.selectorText).toBe("p::after, p");
    expect(window.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
  } finally {
    window.close();
  }
});

it("matches explicit wildcard and empty selector namespaces", () => {
  // Given two local-name matches in different namespaces and a namespaced attribute
  const { window } = new JSDOM("<main><p lang=en></p></main>");
  try {
    const { document } = window;
    const main = document.querySelector("main");
    if (!main) throw new Error("Expected a selector scope");
    const noNamespace = document.createElementNS(null, "p");
    noNamespace.setAttributeNS("urn:language", "custom:lang", "fr");
    main.append(noNamespace);

    // When the selector specifies a namespace constraint, then matching respects that constraint
    expect(main.querySelectorAll("*|p")).toHaveLength(2);
    expect(main.querySelectorAll("|p")).toHaveLength(1);
    expect(main.querySelector("|p")).toBe(noNamespace);
    expect(main.querySelector(":is(|p)")).toBe(noNamespace);
    expect(main.querySelectorAll("[*|lang]")).toHaveLength(2);
    expect(main.querySelectorAll("[|lang]")).toHaveLength(1);
    expect(() => main.querySelector("unknown|p")).toThrow();
    const sheet = new window.CSSStyleSheet();
    sheet.replaceSync("p { color: red } *|* { color: blue }");
    document.adoptedStyleSheets = [sheet];
    expect(sheet.cssRules[1]?.cssText).toBe("* { color: blue; }");
    expect(window.getComputedStyle(noNamespace).color).toBe("rgb(255, 0, 0)");
  } finally {
    window.close();
  }
});

it("matches wildcard namespace attribute values across multiple same-name attributes", () => {
  // Given an element whose first attribute fails and whose namespaced attribute matches
  const { window } = new JSDOM("<p data-code=missing></p>");
  try {
    const target = window.document.querySelector("p");
    if (!target) throw new Error("Expected a paragraph");
    target.setAttributeNS("urn:example", "ex:data-code", "Prefix-Token");

    // When values are compared, then each eligible attribute gets its own comparison
    expect(target.matches('[*|data-code="Prefix-Token"]')).toBe(true);
    expect(target.matches('[*|data-code^="prefix" i]')).toBe(true);
    expect(target.matches('[*|data-code^="prefix" s]')).toBe(false);
    expect(target.matches('[*|data-code$="Token"]')).toBe(true);
    expect(target.matches('[|data-code$="Token"]')).toBe(false);
  } finally {
    window.close();
  }
});

it("queries prefixed XML elements by local name in compound selectors", () => {
  // Given an XML document with prefixed tags and case-sensitive names
  const { window } = new JSDOM();
  try {
    const document = new window.DOMParser().parseFromString(
      '<p:Root xmlns:p="urn:example"><p:Entry id="match"/></p:Root>',
      "application/xml",
    );
    const entry = document.getElementById("match");

    // When queried, then the prefix does not become part of the element's type name
    expect(entry).not.toBeNull();
    expect(document.querySelector("Entry")).toBe(entry);
    expect(document.querySelector("Root > *|Entry")).toBe(entry);
    expect(document.querySelector("Root > entry")).toBeNull();
    expect(() => document.querySelector("p|Entry")).toThrow(window.DOMException);
  } finally {
    window.close();
  }
});

it("drops undeclared namespace branches only from forgiving selector lists", () => {
  // Given a scope with matches for the valid branches
  const { window } = new JSDOM("<main><p></p><a></a></main>");
  try {
    const main = window.document.querySelector("main");
    if (!main) throw new Error("Expected a selector scope");

    // When a branch uses an undeclared prefix, then forgiving lists retain valid siblings
    expect(main.querySelectorAll(":is(p, missing|a)")).toHaveLength(1);
    expect(main.querySelector(":where(:not([missing|href]), a)")?.localName).toBe("a");
    expect(main.querySelector(":is(missing|p)")).toBeNull();
    expect(window.CSS.supports("selector(:is(p, missing|a))")).toBe(false);
    expect(main.querySelectorAll(":not(:is(missing|p))")).toHaveLength(2);
    expect(() => main.querySelector("p, missing|a")).toThrow(window.DOMException);
    expect(() => main.querySelector(":not(p, missing|a)")).toThrow(window.DOMException);
  } finally {
    window.close();
  }
});

it("counts only siblings of the same namespace and local name in typed selectors", () => {
  // Given a sequence that interleaves HTML and foreign elements with the same local name
  const { window } = new JSDOM("<main><p id=first></p><p id=last></p></main>");
  try {
    const { document } = window;
    const main = document.querySelector("main");
    const last = document.getElementById("last");
    if (!main || !last) throw new Error("Expected a parent and two paragraphs");
    const foreign = document.createElementNS("urn:example", "ex:p");
    foreign.id = "foreign";
    main.insertBefore(foreign, last);

    // When indexed by type, then each namespace has an independent sibling sequence
    const ids = (selector: string) =>
      Array.from(main.querySelectorAll(selector), (node) => node?.id);
    expect(ids("p:first-of-type")).toEqual(["first", "foreign"]);
    expect(ids("p:last-of-type")).toEqual(["foreign", "last"]);
    expect(ids("p:only-of-type")).toEqual(["foreign"]);
    expect(ids("p:nth-of-type(2)")).toEqual(["last"]);
    expect(ids("p:nth-last-of-type(2)")).toEqual(["first"]);
  } finally {
    window.close();
  }
});

it("computes inherited SVG paint and user-agent link color", () => {
  // Given inherited paint and a link nested below an author text color
  const { window } = new JSDOM(
    '<main style="color: green; fill: red; stroke: currentColor">' +
      '<a href=""><span></span></a><svg><circle/></svg></main><svg id="plain"/>',
  );
  try {
    const { document } = window;
    const read = (selector: string) => {
      const target = document.querySelector(selector);
      if (!target) throw new Error("Expected an element to compute");
      return window.getComputedStyle(target);
    };

    // When CSS values are computed, then link color and inherited paint follow the cascade
    expect(read("span").color).toBe("rgb(0, 0, 238)");
    expect(read("span").getPropertyValue("stroke")).toBe("rgb(0, 0, 238)");
    expect(read("circle").getPropertyValue("fill")).toBe("rgb(255, 0, 0)");
    expect(read("circle").getPropertyValue("stroke")).toBe("rgb(0, 128, 0)");
    expect(read("#plain").getPropertyValue("fill")).toBe("rgb(0, 0, 0)");
    expect(read("#plain").getPropertyValue("stroke")).toBe("none");
    document.querySelector("a")?.setAttribute("style", "color: purple");
    expect(read("span").color).toBe("rgb(128, 0, 128)");
  } finally {
    window.close();
  }
});

it("cascades pending shorthand substitutions as individual longhands", () => {
  const { window } = new JSDOM(
    "<style>main { margin: 9px; padding: 9px; border: 3px solid red }" +
      "main { margin: var(--missing); padding: var(--missing) !important; border: var(--edge) }" +
      "#target { padding: 3px }</style>" +
      '<main id="target" style="--edge: 2px solid blue; border-left-width: 8px"></main>',
  );
  try {
    const target = window.document.querySelector("main");
    if (!target) throw new Error("Expected a styled target");
    const style = window.getComputedStyle(target);
    expect(style.getPropertyValue("margin-top")).toBe("0");
    expect(style.getPropertyValue("padding-left")).toBe("0");
    expect(style.getPropertyValue("border-width")).toBe("2px 2px 2px 8px");
    expect(style.getPropertyValue("border-top-color")).toBe("rgb(0, 0, 255)");
  } finally {
    window.close();
  }
});

it("supports legacy virtual-console forwarding and error suppression", () => {
  // Given: Jest's jsdom environments forward console calls and register their own error listener.
  const virtual = new VirtualConsole();
  const messages: unknown[][] = [];
  const errors: unknown[][] = [];
  const target = {
    log: (...args: unknown[]) => messages.push(args),
    error: (...args: unknown[]) => errors.push(args),
  };
  // When: a legacy consumer opts out of automatic jsdom error forwarding.
  expect(virtual.sendTo(target, { omitJSDOMErrors: true })).toBe(virtual);
  virtual.emit("log", "message", 1);
  const detail = new Error("cause");
  const failure = Object.assign(new Error("reported error"), { detail });
  virtual.emit("jsdomError", failure);
  // Then: browser output is forwarded and the error is reserved for the caller's own listener.
  expect(messages).toEqual([["message", 1]]);
  expect(errors).toEqual([]);
  new VirtualConsole().sendTo(target).emit("jsdomError", failure);
  expect(errors).toEqual([[failure.stack, detail]]);
});

describe.each([
  { name: "RunDOM", Constructor: JSDOM, Console: VirtualConsole },
  { name: "jsdom 31.0.1", Constructor: reference, Console: ReferenceConsole },
])("$name public Window contracts", ({ Constructor, Console }) => {
  it("creates a fresh quirks-mode document for empty markup", () => {
    // Given two separately created empty windows
    const { window: first } = new Constructor();
    const { window: second } = new Constructor();
    try {
      // When one body changes, then the other keeps the implicit HTML structure
      expect(first.document.compatMode).toBe("BackCompat");
      const body = first.document.body;
      if (!body) throw new Error("Expected an implicit body");
      body.textContent = "first only";
      expect(second.document.documentElement?.outerHTML).toBe(
        "<html><head></head><body></body></html>",
      );
    } finally {
      first.close();
      second.close();
    }
  });

  it("exposes initial computed values and resolves CSS-wide defaults", () => {
    // Given an unstyled child of an element with inherited and non-inherited declarations
    const { window } = new Constructor(
      '<main style="font-variant: small-caps; opacity: .3"><div></div></main>',
    );
    try {
      const child = window.document.querySelector("div");
      if (!child) throw new Error("Expected a child element");

      // When computing style, then initial and inherited values are exposed without inline writes
      const style = window.getComputedStyle(child);
      expect(style.getPropertyValue("opacity")).toBe("1");
      expect(style.getPropertyValue("background-image")).toBe("none");
      expect(style.getPropertyValue("box-shadow")).toBe("none");
      expect(style.getPropertyValue("grid-row")).toBe("auto");
      expect(style.getPropertyValue("font-variant")).toBe("small-caps");
      expect(child.style.getPropertyValue("opacity")).toBe("");

      child.setAttribute("style", "font-variant: unset; opacity: inherit");
      expect(window.getComputedStyle(child).getPropertyValue("font-variant")).toBe("small-caps");
      expect(window.getComputedStyle(child).getPropertyValue("opacity")).toBe("0.3");

      child.setAttribute("style", "font-variant: initial; opacity: unset");
      expect(window.getComputedStyle(child).getPropertyValue("font-variant")).toBe("normal");
      expect(window.getComputedStyle(child).getPropertyValue("opacity")).toBe("1");
    } finally {
      window.close();
    }
  });

  it("exposes computed style through read-only declaration methods", () => {
    // Given a computed snapshot of a styled element
    const { window } = new Constructor('<div style="visibility: hidden"></div>');
    try {
      const target = window.document.querySelector("div");
      if (!target) throw new Error("Expected a styled element");
      const style = window.getComputedStyle(target);

      // When CSSOM mutation methods are used, then the computed snapshot remains intact
      expect(style.cssText).toBe("");
      for (const edit of [
        () => style.setProperty("visibility", "visible"),
        () => style.removeProperty("visibility"),
        () => {
          style.cssText = "visibility: visible";
        },
      ]) {
        expect(edit).toThrow(window.DOMException);
        expect(edit).toThrow(/can not be modified/);
      }
      expect(style.getPropertyValue("visibility")).toBe("hidden");
      expect(style.getPropertyValue("background-color")).toBe("rgba(0, 0, 0, 0)");
      target.style.removeProperty("visibility");
      expect(window.getComputedStyle(target).getPropertyValue("visibility")).toBe("visible");
    } finally {
      window.close();
    }
  });

  it("resolves current border colors using an inherited color scheme", () => {
    // Given a dark parent and a child with a scheme-dependent text color
    const { window } = new Constructor(
      '<main style="color-scheme: dark"><p style="color: light-dark(red, blue)"></p></main>',
    );
    try {
      const child = window.document.querySelector("p");
      if (!child) throw new Error("Expected a styled paragraph");

      // When the scheme changes, then new snapshots resolve text and border colors together
      const dark = window.getComputedStyle(child);
      expect(dark.getPropertyValue("border-top-color")).toBe("rgb(0, 0, 255)");
      expect(dark.color).toBe("rgb(0, 0, 255)");
      child.setAttribute("style", "color-scheme: light; color: light-dark(red, blue)");
      const light = window.getComputedStyle(child);
      expect(light.getPropertyValue("border-top-color")).toBe("rgb(255, 0, 0)");
      expect(light.color).toBe("rgb(255, 0, 0)");
      expect(dark.color).toBe("rgb(0, 0, 255)");
    } finally {
      window.close();
    }
  });

  it("resolves border widths per side and iterates indexed declarations", () => {
    // Given borders whose styles suppress two of the authored widths
    const { window } = new Constructor(
      '<div style="border-width: 1px 2px 3px 4px; border-style: solid none hidden solid"></div>',
    );
    try {
      const target = window.document.querySelector("div");
      if (!target) throw new Error("Expected a styled element");

      // When reading computed style, then the widths reflect each side's style
      const style = window.getComputedStyle(target);
      expect(style.getPropertyValue("border-top-width")).toBe("1px");
      expect(style.getPropertyValue("border-right-width")).toBe("0px");
      expect(style.getPropertyValue("border-bottom-width")).toBe("0px");
      expect(style.getPropertyValue("border-width")).toBe("1px 0px 0px 4px");
      expect([...style]).toEqual(
        Array.from({ length: style.length }, (_, index) => style.item(index)),
      );
      expect(target.style.getPropertyValue("border-right-width")).toBe("2px");
    } finally {
      window.close();
    }
  });

  it("cascades physical border longhands independently of their shorthand", () => {
    // Given a shorthand competing with specificity, importance, and inline style
    const { window } = new Constructor(
      "<style>.target { border-top-width: 7px !important }" +
        "#target { border-left-width: 8px } .target { border: 2px solid blue }</style>" +
        '<div id="target" class="target" style="border-right-width: 9px"></div>',
    );
    try {
      const target = window.document.querySelector("div");
      if (!target) throw new Error("Expected the cascade target");

      // When the winning values are read, then each side keeps its own priority
      const style = window.getComputedStyle(target);
      expect(style.getPropertyValue("border-width")).toBe("7px 9px 2px 8px");
      expect(style.getPropertyValue("border-left")).toBe("8px solid rgb(0, 0, 255)");
      expect(style.getPropertyValue("border")).toBe("");
    } finally {
      window.close();
    }
  });

  it("inherits authored border widths when an inline declaration enables the border", () => {
    // Given a parent whose resolved border width is suppressed by its style
    const { window } = new Constructor('<main style="border: 5px none red"><div></div></main>');
    try {
      const parent = window.document.querySelector("main");
      const child = window.document.querySelector("div");
      if (!parent || !child) throw new Error("Expected a parent and child");

      // When a child inherits the shorthand and overrides its style, the authored width survives
      child.style.cssText = "border: inherit; border-style: solid; opacity: .5";
      expect(window.getComputedStyle(parent).getPropertyValue("border-top-width")).toBe("0px");
      const computed = window.getComputedStyle(child);
      expect(computed.getPropertyValue("border-width")).toBe("5px");
      expect(computed.getPropertyValue("border-top-style")).toBe("solid");
      expect(computed.getPropertyValue("border-top-color")).toBe("rgb(255, 0, 0)");
      expect(computed.getPropertyValue("opacity")).toBe("0.5");
      expect(child.style.getPropertyValue("border-top-width")).toBe("inherit");
      expect(child.style.getPropertyValue("border-width")).toBe("inherit");
      expect(child.style.getPropertyValue("border-style")).toBe("solid");
    } finally {
      window.close();
    }
  });

  it("resolves font-relative lengths against the parent, element, and root", () => {
    // Given distinct root, parent, and child font sizes
    const { window } = new Constructor(
      '<html style="font-size: 20px"><main style="font-size: 10px">' +
        '<p style="font-size: 150%; padding: 2em 1rem"></p></main>',
    );
    try {
      const child = window.document.querySelector("p");
      const parent = window.document.querySelector("main");
      if (!child || !parent) throw new Error("Expected a parent and child");

      // When styles are computed, then each relative unit uses its own reference size
      const first = window.getComputedStyle(child);
      expect(first.getPropertyValue("font-size")).toBe("15px");
      expect(first.getPropertyValue("padding")).toBe("30px 20px");
      parent.style.setProperty("font-size", "20px");
      expect(window.getComputedStyle(child).getPropertyValue("padding")).toBe("60px 20px");
      expect(first.getPropertyValue("padding")).toBe("30px 20px");
    } finally {
      window.close();
    }
  });

  it("cascades and inherits resolved flex longhands independently", () => {
    // Given a flex shorthand whose grow component is overridden and whose basis uses a calculation
    const { window } = new Constructor(
      "<style>main { font-size: 20px; flex: 1 2 calc(1em + 2px) }" +
        'main.target { flex-grow: 3 }</style><main class="target">' +
        '<div style="flex: inherit"></div><p style="flex: 1 2 calc(30% + 20%)"></p></main>',
    );
    try {
      const { document } = window;
      const child = document.querySelector("div");
      const percentage = document.querySelector("p");
      if (!child || !percentage) throw new Error("Expected two styled elements");

      // When the longhands are read, then the shorthand reflects the winning values
      const inherited = window.getComputedStyle(child);
      expect(inherited.getPropertyValue("flex-grow")).toBe("3");
      expect(inherited.getPropertyValue("flex-basis")).toBe("22px");
      expect(inherited.getPropertyValue("flex")).toBe("3 2 22px");
      expect(window.getComputedStyle(percentage).getPropertyValue("flex-basis")).toBe("50%");
    } finally {
      window.close();
    }
  });

  it("inherits computed background position axes and repeats them across image layers", () => {
    const { window } = new Constructor(
      '<main style="font-size: 20px; background-position: 1em 2em">' +
        '<p style="background-image: none, none; background-position-x: inherit; background-position-y: bottom"></p></main>',
    );
    try {
      const target = window.document.querySelector("p");
      if (!target) throw new Error("Expected a styled paragraph");
      const style = window.getComputedStyle(target);
      expect(style.getPropertyValue("background-position-x")).toBe("20px, 20px");
      expect(style.getPropertyValue("background-position")).toBe("20px 100%, 20px 100%");
    } finally {
      window.close();
    }
  });

  it("serializes computed font from its winning longhands", () => {
    const { window } = new Constructor('<p style="font: italic 400 12px serif"></p>');
    try {
      const target = window.document.querySelector("p");
      if (!target) throw new Error("Expected a styled paragraph");
      const first = window.getComputedStyle(target);
      expect(first.getPropertyValue("line-height")).toBe("normal");
      expect(first.getPropertyValue("font")).toBe("italic 12px serif");

      target.setAttribute("style", "font: italic 20px / 30px serif");
      target.style.setProperty("font-size", "40px");
      expect(window.getComputedStyle(target).getPropertyValue("font")).toBe(
        "italic 40px / 30px serif",
      );
    } finally {
      window.close();
    }
  });

  it("serializes computed background layers with their positions and final color", () => {
    const { window } = new Constructor(
      '<div style="background: none 10px 20px / cover no-repeat, red none 30px 40px / contain repeat-x"></div>',
    );
    try {
      const target = window.document.querySelector("div");
      if (!target) throw new Error("Expected a styled element");
      const style = window.getComputedStyle(target);
      expect(style.getPropertyValue("background-position")).toBe("10px 20px, 30px 40px");
      expect(style.getPropertyValue("background")).toBe(
        "none no-repeat scroll 10px 20px / cover padding-box border-box, " +
          "rgb(255, 0, 0) none repeat-x scroll 30px 40px / contain padding-box border-box",
      );
    } finally {
      window.close();
    }
  });

  it("projects a focused iframe document into its parent document", () => {
    const { window } = new Constructor("<input><iframe></iframe>");
    try {
      const { document } = window;
      const parentInput = document.querySelector("input");
      const frame = document.querySelector("iframe");
      if (
        !(parentInput instanceof window.HTMLInputElement) ||
        !(frame instanceof window.HTMLIFrameElement)
      )
        throw new Error("Expected an input and iframe");
      const child = frame.contentDocument as typeof document | null;
      if (!child?.body) throw new Error("Expected a child document");
      const childInput = child.createElement("input");
      child.body.appendChild(childInput);
      const childWindow = frame.contentWindow as typeof window | null;
      if (!childWindow || !(childInput instanceof childWindow.HTMLInputElement))
        throw new Error("Expected a child input");
      parentInput.focus();

      childInput.focus();
      expect(document.activeElement).toBe(frame);
      expect(document.hasFocus()).toBe(true);
      expect(child.activeElement).toBe(childInput);
      expect(child.hasFocus()).toBe(true);

      childInput.blur();
      expect(document.activeElement).toBe(document.body);
      expect(child.hasFocus()).toBe(false);

      childInput.focus();
      const events: string[] = [];
      childInput.addEventListener("blur", () => events.push("child blur"));
      frame.addEventListener("blur", () => events.push("frame blur"));
      parentInput.addEventListener("focus", () => events.push("parent focus"));
      parentInput.focus();
      expect(events).toEqual(["child blur", "parent focus"]);
      expect(document.activeElement).toBe(parentInput);
      expect(child.activeElement).toBe(child.body);
      expect(child.hasFocus()).toBe(false);
    } finally {
      window.close();
    }
  });

  it("shares a live stylesheet rule list across legacy and modern CSSOM APIs", () => {
    // Given an attached stylesheet with one declaration
    const { window } = new Constructor("<style>p { color: red }</style>");
    try {
      const sheet = window.document.styleSheets[0];
      if (!sheet) throw new Error("Expected an attached stylesheet");
      const rules = sheet.rules;

      // When using the legacy methods, then both views reflect the same insertions and deletions
      expect(rules).toBe(sheet.cssRules);
      expect(sheet.addRule("div", "color: blue")).toBe(-1);
      expect(sheet.addRule("span", "", 0)).toBe(-1);
      expect(Array.from(rules, (rule) => rule?.cssText)).toEqual([
        "span { }",
        "p { color: red; }",
        "div { color: blue; }",
      ]);
      sheet.removeRule();
      expect(rules[0]?.cssText).toBe("p { color: red; }");
      expect(() => sheet.removeRule(2)).toThrow(
        expect.objectContaining({ name: "IndexSizeError" }),
      );
      expect(rules.length).toBe(2);
      expect(sheet.addRule()).toBe(-1);
      expect(rules[2]?.cssText).toBe("undefined { }");
      for (const method of ["insertRule", "deleteRule"] as const) {
        expect(() => Reflect.apply(sheet[method], sheet, [])).toThrow(
          `Failed to execute '${method}' on 'CSSStyleSheet': 1 argument required, but only 0 present.`,
        );
      }
    } finally {
      window.close();
    }
  });

  it("evaluates XPath predicates, scalar conversions, and live iterators", () => {
    // Given a document with two candidates
    const { window } = new Constructor('<div id="first"></div><div id="second"></div>');
    try {
      const { document, XPathResult } = window;
      const result = document.evaluate("//div[1]", document, null, XPathResult.ANY_TYPE, null);
      expect(result.iterateNext()).toBe(document.getElementById("first"));
      expect(result.iterateNext()).toBeNull();
      expect(document.evaluate("count(//div)", document, null, 1, null).numberValue).toBe(2);
      const snapshot = document.evaluate("//div", document, null, 7, null);

      // When the tree changes, then iterators invalidate and snapshots retain their results
      document.getElementById("second")?.remove();
      expect(result.invalidIteratorState).toBe(true);
      expect(() => result.iterateNext()).toThrow(/mutated/i);
      expect(snapshot.snapshotLength).toBe(2);
      expect(snapshot.snapshotItem(1)?.nodeName).toBe("DIV");
      expect(snapshot.snapshotItem(2)).toBeNull();
    } finally {
      window.close();
    }
  });

  it("preserves dimension math that depends on layout", () => {
    // Given a declaration with an unresolved length-percentage expression
    const { window } = new Constructor('<p style="width: min(100px,50%)">target</p>');
    try {
      const target = window.document.querySelector("p");
      if (!(target instanceof window.HTMLElement)) throw new Error("Expected a paragraph");
      expect(target.style.getPropertyValue("width")).toBe("min(100px, 50%)");

      // When assigning through both CSSOM paths
      Reflect.set(target.style, "height", "max(10px,2em)");
      target.style.setProperty("max-width", "clamp(1px,5vw,20px)", "important");

      // Then the declaration preserves the expressions and priority
      expect(target.style.getPropertyValue("height")).toBe("max(10px, 2em)");
      expect(target.style.getPropertyValue("max-width")).toBe("clamp(1px, 5vw, 20px)");
      expect(target.style.getPropertyPriority("max-width")).toBe("important");
      expect(target.getAttribute("style")).toContain(
        "max-width: clamp(1px, 5vw, 20px) !important;",
      );
    } finally {
      window.close();
    }
  });

  it("exposes the imported stylesheet and its live media before loading", () => {
    // Given an attached stylesheet with an import condition
    const { window } = new Constructor(
      '<style>@import "theme.css" layer(theme) supports(display: grid) print;</style>',
      { url: "https://example.test/" },
    );
    try {
      const sheet = window.document.styleSheets.item(0);
      const rule = sheet?.cssRules.item(0);
      if (!(rule instanceof window.CSSImportRule)) throw new Error("Expected an import rule");
      const imported = rule.styleSheet;
      expect(imported?.parentStyleSheet).toBe(sheet);
      expect(imported?.ownerRule).toBe(rule);
      expect(imported?.href).toBe("https://example.test/theme.css");
      expect(rule.layerName).toBe("theme");
      expect(rule.supportsText).toBe("display: grid");
      expect(rule.media).toBe(imported?.media);

      // When the import's media changes, then the associated sheet sees the same change
      rule.media = "screen";
      expect(imported?.media.mediaText).toBe("screen");
      expect(rule.cssText).toBe(
        '@import url("theme.css") layer(theme) supports(display: grid) screen;',
      );
      expect(rule.styleSheet).toBe(imported);
    } finally {
      window.close();
    }
  });

  it("uses the media rule's live MediaList for serialization and the cascade", () => {
    // Given an inactive media rule attached to a document
    const { window } = new Constructor(
      "<style>@media not all { p { color: red } }</style><p>target</p>",
    );
    try {
      const rule = window.document.styleSheets[0]?.cssRules[0];
      const paragraph = window.document.querySelector("p");
      if (!(rule instanceof window.CSSMediaRule) || !paragraph)
        throw new Error("Expected media fixture");
      expect(rule instanceof window.CSSConditionRule).toBe(true);
      const media = rule.media;
      expect(rule.matches).toBe(false);
      expect(window.getComputedStyle(paragraph).color).not.toBe("rgb(255, 0, 0)");

      // When the query changes, then matching, serialization and style use the same list
      media.mediaText = "all";
      expect(rule.media).toBe(media);
      expect(rule.conditionText).toBe("all");
      expect(rule.cssText).toMatch(/^@media all/);
      expect(rule.matches).toBe(true);
      expect(window.getComputedStyle(paragraph).color).toBe("rgb(255, 0, 0)");
      rule.media = "not all";
      expect(media.mediaText).toBe("not all");
      expect(rule.matches).toBe(false);
    } finally {
      window.close();
    }
  });

  it("updates the cascade through grouping rule insertion and deletion", () => {
    // Given a media rule whose nested declaration currently applies
    const { window } = new Constructor(
      "<style>@media all { p { color: blue } }</style><p>target</p>",
    );
    try {
      const sheet = window.document.styleSheets.item(0);
      const group = sheet?.cssRules[0];
      const target = window.document.querySelector("p");
      if (!(group instanceof window.CSSMediaRule) || !target)
        throw new Error("Expected media fixture");
      expect(group instanceof window.CSSGroupingRule).toBe(true);
      const rules = group.cssRules;
      expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 255)");

      // When a later nested rule is inserted
      expect(group.insertRule("p { color: red }", 1)).toBe(1);
      const inserted = rules.item(1);
      expect(inserted?.parentRule).toBe(group);
      expect(inserted?.parentStyleSheet).toBe(sheet);
      expect(window.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");

      // Then deleting it updates both the same list and computed style
      group.deleteRule(1);
      expect(group.cssRules).toBe(rules);
      expect(rules.item(1)).toBeNull();
      expect(inserted?.parentRule).toBeNull();
      expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 255)");
    } finally {
      window.close();
    }
  });

  it("exposes stable CSSRuleList objects for sheets and grouping rules", () => {
    // Given a stylesheet with a nested media rule
    const { window } = new Constructor(
      "<style>p { color: red } @media screen { a { color: blue } }</style>",
    );
    try {
      const sheet = window.document.styleSheets.item(0);
      if (!sheet) throw new Error("Expected stylesheet");
      const rules = sheet.cssRules;
      const media = rules[1];
      if (!(media instanceof window.CSSMediaRule)) throw new Error("Expected media rule");
      expect(rules instanceof window.CSSRuleList).toBe(true);
      expect(media.cssRules instanceof window.CSSRuleList).toBe(true);
      expect(media.cssRules.item(0)).toBe(media.cssRules[0]);
      expect(rules.item(2)).toBeNull();
      expect(Object.keys(rules)).toEqual(["0", "1"]);
      expect(Array.isArray(rules)).toBe(false);

      // When deleting a rule, then the existing list reflects the current indices
      sheet.deleteRule(0);
      expect(sheet.cssRules).toBe(rules);
      expect([...rules]).toEqual([media]);
      expect(rules.item(0)).toBe(media);
      expect(rules[1]).toBeUndefined();
    } finally {
      window.close();
    }
  });

  it("exposes parsed styles through their CSSOM interfaces", () => {
    // Given an attached stylesheet with import, grouping, and declaration rules
    const { window } = new Constructor(
      '<style>@import "theme.css"; @media screen { p { color: red } }</style>',
      { url: "https://example.test/" },
    );
    try {
      const sheet = window.document.styleSheets.item(0);
      expect(sheet instanceof window.StyleSheet).toBe(true);
      expect(sheet instanceof window.CSSStyleSheet).toBe(true);
      expect(sheet?.type).toBe("text/css");
      const imported = sheet?.cssRules[0];
      const media = sheet?.cssRules[1];
      if (!(media instanceof window.CSSMediaRule)) throw new Error("Expected media rule");

      // When callers inspect CSSOM objects, the constructor identity follows the rule type
      expect(imported instanceof window.CSSImportRule).toBe(true);
      expect(media instanceof window.CSSRule).toBe(true);
      const rule = media.cssRules[0];
      if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected style rule");
      expect(rule.style instanceof window.CSSStyleDeclaration).toBe(true);
      expect(rule.style.color).toBe("red");
      expect(media.parentStyleSheet).toBe(sheet);
      expect(media.parentRule).toBeNull();
      expect(rule.parentRule).toBe(media);
      expect(rule.parentStyleSheet).toBe(sheet);
      sheet?.deleteRule(1);
      expect(media.parentStyleSheet).toBeNull();
      expect(rule.parentRule).toBe(media);
      expect(() => Reflect.construct(window.CSSRule, [])).toThrow(/illegal constructor/i);
    } finally {
      window.close();
    }
  });

  it("exposes stable empty plugin and MIME type lists", () => {
    // Given a Window without native browser plugins
    const { window } = new Constructor();
    try {
      const { navigator } = window;
      const plugins = navigator.plugins;
      const mimeTypes = navigator.mimeTypes;
      expect(plugins).toBe(navigator.plugins);
      expect(mimeTypes).toBe(navigator.mimeTypes);
      expect(plugins instanceof window.PluginArray).toBe(true);
      expect(mimeTypes instanceof window.MimeTypeArray).toBe(true);

      // When looking up entries, then methods return null and missing indices stay absent
      expect(plugins.length).toBe(0);
      expect(mimeTypes.length).toBe(0);
      expect(plugins[0]).toBeUndefined();
      expect(mimeTypes[0]).toBeUndefined();
      expect(plugins.item(0)).toBeNull();
      expect(mimeTypes.namedItem("application/pdf")).toBeNull();
      expect(() => Reflect.construct(window.Plugin, [])).toThrow(/illegal constructor/i);
      expect(() => Reflect.construct(window.MimeType, [])).toThrow(/illegal constructor/i);
    } finally {
      window.close();
    }
  });

  it("exposes the pinned navigator identity to scripts and host callers", () => {
    // Given a script that reads Navigator through its Window global
    const { window } = new Constructor(
      "<script>document.documentElement.id = window.navigator.product</script>",
      { runScripts: "dangerously" },
    );
    try {
      const { navigator } = window;
      // Then the script and host observe the same identity values
      expect(window.document.documentElement?.id).toBe("Gecko");
      expect([navigator.appCodeName, navigator.appName, navigator.appVersion]).toEqual([
        "Mozilla",
        "Netscape",
        "4.0",
      ]);
      expect([
        navigator.product,
        navigator.productSub,
        navigator.vendor,
        navigator.vendorSub,
      ]).toEqual(["Gecko", "20030107", "Apple Computer, Inc.", ""]);
      expect(navigator.hardwareConcurrency).toBeGreaterThan(0);
      expect(navigator.javaEnabled()).toBe(false);
      expect(Object.prototype.toString.call(navigator)).toBe("[object Navigator]");
    } finally {
      window.close();
    }
  });

  it("exposes metadata and revision elements with their reflected properties", () => {
    // Given metadata and both types of markup revision
    const { window } = new Constructor(
      '<meta name="description" http-equiv="refresh" content="example"><ins cite="/log">new</ins><del>old</del>',
      { url: "https://example.test/" },
    );
    try {
      const meta = window.document.querySelector("meta");
      const ins = window.document.querySelector("ins");
      const del = window.document.querySelector("del");
      if (!(meta instanceof window.HTMLMetaElement)) throw new Error("Expected metadata");
      if (!(ins instanceof window.HTMLModElement)) throw new Error("Expected insertion");
      if (!(del instanceof window.HTMLModElement)) throw new Error("Expected deletion");

      // When reading parsed values and assigning new ones
      expect([meta.name, meta.httpEquiv, meta.content]).toEqual([
        "description",
        "refresh",
        "example",
      ]);
      expect(ins.cite).toBe("https://example.test/log");
      meta.scheme = "example";
      del.dateTime = "2026-11-05";

      // Then the properties reflect the actual attributes
      expect(meta.getAttribute("scheme")).toBe("example");
      expect(del.getAttribute("datetime")).toBe("2026-11-05");
    } finally {
      window.close();
    }
  });

  it("reflects legacy HTML presentation properties", () => {
    // Given elements with legacy presentation attributes
    const { window } = new Constructor(
      '<html version="legacy"><body alink="red" background="paper.png"><dir compact></dir><font face="serif" size="4"></font><div align="center"></div><p align="right"></p></body></html>',
    );
    try {
      const { document } = window;
      const root = document.documentElement;
      const body = document.body;
      const dir = document.querySelector("dir");
      const font = document.querySelector("font");
      const div = document.querySelector("div");
      const paragraph = document.querySelector("p");
      if (!(root instanceof window.HTMLHtmlElement)) throw new Error("Expected HTML");
      if (!(body instanceof window.HTMLBodyElement)) throw new Error("Expected body");
      if (!(dir instanceof window.HTMLDirectoryElement)) throw new Error("Expected directory");
      if (!(font instanceof window.HTMLFontElement)) throw new Error("Expected font");
      if (!(div instanceof window.HTMLDivElement)) throw new Error("Expected div");
      if (!(paragraph instanceof window.HTMLParagraphElement))
        throw new Error("Expected paragraph");
      expect([root.version, body.aLink, body.background, dir.compact]).toEqual([
        "legacy",
        "red",
        "paper.png",
        true,
      ]);
      expect([font.face, font.size, div.align, paragraph.align]).toEqual([
        "serif",
        "4",
        "center",
        "right",
      ]);

      // When legacy properties are changed
      body.bgColor = null;
      font.color = null;
      dir.compact = false;

      // Then null becomes an empty color and false removes the boolean attribute
      expect(body.getAttribute("bgcolor")).toBe("");
      expect(font.getAttribute("color")).toBe("");
      expect(dir.hasAttribute("compact")).toBe(false);
      expect(Object.prototype.toString.call(div)).toBe("[object HTMLDivElement]");
    } finally {
      window.close();
    }
  });

  it("exposes a live indexed stylesheet collection", () => {
    // Given a document with a stylesheet
    const { window } = new Constructor("<style>p { color: red }</style>");
    try {
      const { document } = window;
      const sheets = document.styleSheets;
      expect(sheets).toBe(document.styleSheets);
      expect(sheets instanceof window.StyleSheetList).toBe(true);
      expect(sheets.item(0)).toBe(sheets[0]);
      expect(Object.keys(sheets)).toEqual(["0"]);
      const iterator = sheets[Symbol.iterator]();
      expect(iterator.next().value).toBe(sheets[0]);

      // When the first style element is removed and a new one is attached
      document.querySelector("style")?.remove();
      expect(sheets.length).toBe(0);
      expect(sheets.item(0)).toBeNull();
      expect(sheets[0]).toBeUndefined();
      const style = document.createElement("style");
      style.textContent = "p { color: blue }";
      document.head?.append(style);

      // Then the original collection reflects the replacement
      expect([...sheets]).toEqual([sheets.item(0)]);
      expect(sheets.item(0)).not.toBeNull();
      expect(sheets.item(1)).toBeNull();
      const extra = document.createElement("style");
      document.head?.append(extra);
      expect(iterator.next().value).toBe(sheets[1]);
    } finally {
      window.close();
    }
  });

  it("writes markup synchronously after the executing script", () => {
    // Given an inline script followed by existing page content
    const markup = `<body><script>
      document.write('<p id="written">written</p>');
      if (!document.getElementById("written")) throw new Error("Expected synchronous insertion");
      document.getElementById("written").setAttribute("data-visible", "yes");
    </script><p id="original">original</p></body>`;

    // When the parser executes the script
    const { window } = new Constructor(markup, { runScripts: "dangerously" });
    try {
      // Then the script remains in the document and the new node precedes existing content
      const { document } = window;
      const written = document.getElementById("written");
      expect(written?.getAttribute("data-visible")).toBe("yes");
      expect(written?.previousElementSibling?.localName).toBe("script");
      expect(written?.nextElementSibling?.id).toBe("original");
    } finally {
      window.close();
    }
  });

  it("replaces a completed document synchronously when write is called without open", async () => {
    // Given a document whose initial load has completed
    const { window } = new Constructor("<p id=original>original</p>", {
      runScripts: "dangerously",
    });
    try {
      await new Promise<void>((resolve) => {
        window.addEventListener("load", () => resolve(), { once: true });
      });

      // When the caller writes a replacement with a script
      const { document } = window;
      document.write('<p id="replacement">new</p><script>document.body.id = "executed"</script>');

      // Then the replacement and script effects are visible before write returns
      expect(document.getElementById("original")).toBeNull();
      expect(document.getElementById("replacement")?.textContent).toBe("new");
      expect(document.body?.id).toBe("executed");
      expect(document.readyState).toBe("complete");
    } finally {
      window.close();
    }
  });

  it("appends a newline to each writeln call", () => {
    // Given a script writing an element and a line break
    const { window } = new Constructor(
      "<body><script>document.writeln('<p>written</p>')</script><p>original</p></body>",
      { runScripts: "dangerously" },
    );
    try {
      // Then the newline is inserted immediately after the written element
      const written = window.document.querySelector("p");
      expect(written?.textContent).toBe("written");
      expect(written?.nextSibling?.nodeValue).toBe("\n");
    } finally {
      window.close();
    }
  });

  it("reflects script and stylesheet metadata through content attributes", () => {
    // Given script, link, and style elements with metadata attributes
    const { window } = new Constructor(
      '<script charset="US-ASCII" defer></script><link hreflang="en"><style type="text/css"></style>',
    );
    try {
      const { document } = window;
      const script = document.querySelector("script");
      const link = document.querySelector("link");
      const style = document.querySelector("style");
      if (!(script instanceof window.HTMLScriptElement)) throw new Error("Expected script");
      if (!(link instanceof window.HTMLLinkElement)) throw new Error("Expected link");
      if (!(style instanceof window.HTMLStyleElement)) throw new Error("Expected style");
      expect([script.charset, script.defer, link.hreflang, style.type]).toEqual([
        "US-ASCII",
        true,
        "en",
        "text/css",
      ]);

      // When callers update reflected values
      script.defer = false;
      script.type = "text/javascript";
      script.event = "load";
      script.htmlFor = "window";
      link.charset = "UTF-8";
      link.rev = "stylesheet";
      link.type = "text/css";
      link.target = "_blank";

      // Then the changes are visible on the markup, including nullable crossorigin
      expect(script.hasAttribute("defer")).toBe(false);
      expect([
        script.getAttribute("type"),
        script.getAttribute("event"),
        script.getAttribute("for"),
      ]).toEqual(["text/javascript", "load", "window"]);
      expect([
        link.getAttribute("charset"),
        link.getAttribute("rev"),
        link.getAttribute("type"),
        link.getAttribute("target"),
      ]).toEqual(["UTF-8", "stylesheet", "text/css", "_blank"]);
      for (const element of [script, link]) {
        expect(element.crossOrigin).toBeNull();
        element.crossOrigin = "Custom";
        expect(element.getAttribute("crossorigin")).toBe("Custom");
        element.crossOrigin = null;
        expect(element.hasAttribute("crossorigin")).toBe(false);
      }
    } finally {
      window.close();
    }
  });

  it("reflects input hints, image metadata, and source URLs", () => {
    // Given an input in a document with a base URL
    const { window } = new Constructor('<base href="/assets/"><input type="image">', {
      url: "https://example.test/page",
    });
    try {
      const input = window.document.querySelector("input");
      if (!(input instanceof window.HTMLInputElement)) throw new Error("Expected input");

      // When properties and attributes are changed through both interfaces
      input.accept = "image/png";
      input.alt = "Submit";
      input.align = "bottom";
      input.useMap = "#map";
      input.src = "submit.png";
      input.setAttribute("autocomplete", "off");
      input.setAttribute("inputmode", "numeric");
      input.setAttribute("placeholder", "Hint");

      // Then the input reflects each value with the source resolved against the document base
      expect(input.getAttribute("accept")).toBe("image/png");
      expect(input.getAttribute("alt")).toBe("Submit");
      expect(input.getAttribute("align")).toBe("bottom");
      expect(input.getAttribute("usemap")).toBe("#map");
      expect(input.src).toBe("https://example.test/assets/submit.png");
      expect([input.autocomplete, input.inputMode, input.placeholder]).toEqual([
        "off",
        "numeric",
        "Hint",
      ]);
    } finally {
      window.close();
    }
  });

  it("reflects input size and text length limits with their distinct defaults", () => {
    // Given an input with no dimensions or limits
    const { window } = new Constructor("<input>");
    try {
      const input = window.document.querySelector("input");
      if (!(input instanceof window.HTMLInputElement)) throw new Error("Expected input");
      expect([input.size, input.minLength, input.maxLength]).toEqual([20, -1, -1]);

      // When parsing a dimension and assigning length limits
      input.setAttribute("size", " +25 columns");
      input.minLength = 2;
      input.maxLength = 8;

      // Then positive size and nonnegative length rules apply independently
      expect([input.size, input.minLength, input.maxLength]).toEqual([25, 2, 8]);
      expect(() => {
        input.size = 0;
      }).toThrow(/size/i);
      expect(() => {
        input.maxLength = -1;
      }).toThrow(/length/i);
      input.size = 0x80000000;
      expect(input.getAttribute("size")).toBe("20");
      expect(input.getAttribute("maxlength")).toBe("8");
    } finally {
      window.close();
    }
  });

  it("reflects frame presentation attributes and description URLs", () => {
    // Given a frame and an inline frame with a document base
    const { window } = new Constructor('<base href="/assets/"><iframe></iframe>', {
      url: "https://example.test/page",
    });
    try {
      const frame = window.document.createElement("frame");
      const iframe = window.document.querySelector("iframe");
      if (!(frame instanceof window.HTMLFrameElement)) throw new Error("Expected frame");
      if (!(iframe instanceof window.HTMLIFrameElement)) throw new Error("Expected iframe");
      for (const target of [frame, iframe]) {
        expect(target.longDesc).toBe("");
        // When callers set reflected properties and change attributes directly
        target.frameBorder = "1";
        target.marginHeight = "10";
        target.marginWidth = null;
        target.setAttribute("scrolling", "yes");
        target.longDesc = "description.html";

        // Then the properties reflect the attributes and use the current base
        expect(target.getAttribute("frameborder")).toBe("1");
        expect(target.getAttribute("marginheight")).toBe("10");
        expect(target.getAttribute("marginwidth")).toBe("");
        expect(target.scrolling).toBe("yes");
        expect(target.longDesc).toBe("https://example.test/assets/description.html");
      }
      frame.src = "example\uD800.html";
      expect(frame.getAttribute("src")).toBe("example\uFFFD.html");
      expect(frame.src).toBe("https://example.test/assets/example%EF%BF%BD.html");
      frame.noResize = true;
      iframe.allowFullscreen = true;
      iframe.align = "top";
      expect(frame.hasAttribute("noresize")).toBe(true);
      expect(iframe.hasAttribute("allowfullscreen")).toBe(true);
      expect(iframe.getAttribute("align")).toBe("top");
    } finally {
      window.close();
    }
  });

  it("reflects document direction on its HTML root", () => {
    // Given an HTML root with mixed-case direction markup.
    const { window } = new Constructor('<html dir="LTR">');
    const { document } = window;

    // When the direction is read or assigned through the document.
    expect(document.dir).toBe("ltr");
    document.dir = "invalid";

    // Then the getter only recognizes known values, while the attribute preserves the assignment.
    expect(document.dir).toBe("");
    expect(document.documentElement?.getAttribute("dir")).toBe("invalid");
    document.dir = "auto";
    expect(document.dir).toBe("auto");
    const empty = document.implementation.createDocument(null, "", null);
    empty.dir = "rtl";
    expect(empty.dir).toBe("");
    window.close();
  });

  it("reads and updates HTML and SVG document titles", () => {
    // Given an HTML document with an SVG title before its first HTML title
    const html = new Constructor("<svg><title>ignored</title></svg><title>  A &amp; B\n </title>");
    const svg = new Constructor('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>', {
      contentType: "image/svg+xml",
    });
    try {
      const htmlDocument = html.window.document;
      const svgDocument = svg.window.document;
      expect(htmlDocument.title).toBe("A & B");
      expect(svgDocument.title).toBe("");

      // When the caller assigns both titles
      htmlDocument.title = "next  page";
      svgDocument.title = "drawing";

      // Then the HTML title is reused and an SVG title is inserted before the first child
      expect(htmlDocument.title).toBe("next page");
      expect(htmlDocument.getElementsByTagName("title")[1]?.textContent).toBe("next  page");
      expect(svgDocument.title).toBe("drawing");
      expect(svgDocument.documentElement?.firstChild?.nodeName).toBe("title");
      expect(svgDocument.documentElement?.firstChild?.textContent).toBe("drawing");
    } finally {
      html.window.close();
      svg.window.close();
    }
  });

  it("exposes direct text on title and script elements", () => {
    // Given elements with direct text and a nested element
    const { window } = new Constructor("<title>heading</title><script>first</script>");
    try {
      const title = window.document.querySelector("title");
      const script = window.document.querySelector("script");
      if (!(title instanceof window.HTMLTitleElement)) throw new Error("Expected title");
      if (!(script instanceof window.HTMLScriptElement)) throw new Error("Expected script");
      for (const target of [title, script]) {
        const nested = window.document.createElement("span");
        nested.textContent = "nested";
        target.append(nested);
      }

      // When reading and then replacing the direct text
      expect(title.text).toBe("heading");
      expect(script.text).toBe("first");
      title.text = "replacement";
      script.text = "second";

      // Then both setters replace their previous child nodes
      expect(title.textContent).toBe("replacement");
      expect(script.textContent).toBe("second");
    } finally {
      window.close();
    }
  });

  it("substitutes internal XML entities in text and attributes", () => {
    // Given a document declaring a duplicated entity and literal markup in its replacement
    const markup = `<!DOCTYPE root [
      <!ENTITY city "Dallas">
      <!ENTITY city "Austin">
      <!ENTITY label "<tag/>&amp;">
    ]><root city="&city;">&label;</root>`;

    // When the XML document is parsed
    const dom = new Constructor(markup, { contentType: "application/xml" });
    try {
      // Then the first declaration wins and replacement text stays literal
      const root = dom.window.document.documentElement;
      expect(root?.getAttribute("city")).toBe("Dallas");
      expect(root?.textContent).toBe("<tag/>&amp;");
      expect(root?.childElementCount).toBe(0);
    } finally {
      dom.window.close();
    }
  });

  it("rejects references to external XML entities", () => {
    // Given an external entity reference
    const markup =
      '<!DOCTYPE root [<!ENTITY remote SYSTEM "file:///example">]><root>&remote;</root>';

    // When parsing the document, then the reference remains undefined
    expect(() => new Constructor(markup, { contentType: "application/xml" })).toThrow(
      /undefined entity/,
    );
  });

  it("dispatches separate trusted document and window load events", async () => {
    // Given a new document and listeners at both ends of the document-to-window event path
    const { window } = new Constructor("<p>loaded</p>");
    const { document } = window;
    const calls: object[] = [];
    try {
      const record = (event: InstanceType<typeof window.Event>) => {
        calls.push({
          documentTarget: event.target === document,
          windowListener: event.currentTarget === window,
          pathLength: event.composedPath().length,
          trusted: event.isTrusted,
          readyState: document.readyState,
        });
      };
      document.addEventListener("load", record);
      let handlerTarget: object | null = null;
      document.onload = (event) => {
        handlerTarget = event.target;
      };

      // When the document reaches completion
      await new Promise<void>((resolve) => {
        window.addEventListener(
          "load",
          (event) => {
            record(event);
            resolve();
          },
          { capture: true, once: true },
        );
      });

      // Then each listener receives its own at-target dispatch with the document as target
      expect(Object.is(handlerTarget, document)).toBe(true);
      expect(calls).toEqual([
        {
          documentTarget: true,
          windowListener: false,
          pathLength: 1,
          trusted: true,
          readyState: "complete",
        },
        {
          documentTarget: true,
          windowListener: true,
          pathLength: 1,
          trusted: true,
          readyState: "complete",
        },
      ]);
    } finally {
      window.close();
    }
  });

  it("reflects button names and values into form submission", () => {
    // Given a submit button in a form
    const { window } = new Constructor("<form><button></button></form>");
    try {
      const button = window.document.querySelector("button");
      if (!(button instanceof window.HTMLButtonElement)) throw new Error("Expected button");
      const form = button.form;
      if (!form) throw new Error("Expected form");
      expect([button.name, button.value]).toEqual(["", ""]);

      // When the caller sets the submission fields through the IDL properties
      button.name = "intent";
      button.value = "save";

      // Then the form data includes the button's value when it is the submitter
      expect(button.getAttribute("name")).toBe("intent");
      expect(button.getAttribute("value")).toBe("save");
      expect(new window.FormData(form, button).get("intent")).toBe("save");
      expect(new window.FormData(form).has("intent")).toBe(false);
    } finally {
      window.close();
    }
  });

  it("reflects textarea dimensions, length limits, and form names", () => {
    const { window } = new Constructor("<form><textarea>entry</textarea></form>");
    try {
      const textarea = window.document.querySelector("textarea");
      if (!(textarea instanceof window.HTMLTextAreaElement)) throw new Error("Expected textarea");
      expect([textarea.cols, textarea.rows, textarea.minLength, textarea.maxLength]).toEqual([
        20, 2, -1, -1,
      ]);
      textarea.setAttribute("cols", " +8 cells");
      textarea.rows = 0;
      textarea.minLength = 2;
      textarea.maxLength = 10;
      expect([textarea.cols, textarea.rows, textarea.minLength, textarea.maxLength]).toEqual([
        8, 2, 2, 10,
      ]);
      expect(textarea.getAttribute("rows")).toBe("2");
      expect(() => {
        textarea.maxLength = -1;
      }).toThrow();
      textarea.name = "message";
      textarea.wrap = "soft";
      textarea.inputMode = "text";
      textarea.autocomplete = "off";
      textarea.placeholder = "Write here";
      expect([
        textarea.wrap,
        textarea.inputMode,
        textarea.autocomplete,
        textarea.placeholder,
      ]).toEqual(["soft", "text", "off", "Write here"]);
      expect(new window.FormData(textarea.form ?? undefined).get("message")).toBe("entry");
      textarea.cols = 2;
      textarea.wrap = "hard";
      expect(new window.FormData(textarea.form ?? undefined).get("message")).toBe("en\ntr\ny");
      expect(textarea.value).toBe("entry");
    } finally {
      window.close();
    }
  });

  it("reflects readOnly and disabled properties into text control validation", () => {
    const { window } = new Constructor("<input required><textarea required></textarea>");
    try {
      const input = window.document.querySelector("input");
      const textarea = window.document.querySelector("textarea");
      if (!(input instanceof window.HTMLInputElement)) throw new Error("Expected input");
      if (!(textarea instanceof window.HTMLTextAreaElement)) throw new Error("Expected textarea");
      for (const control of [input, textarea]) {
        expect(control.willValidate).toBe(true);
        control.readOnly = true;
        expect(control.hasAttribute("readonly")).toBe(true);
        expect(control.willValidate).toBe(false);
        expect(control.checkValidity()).toBe(true);
        control.readOnly = false;
        expect(control.willValidate).toBe(true);
        control.disabled = true;
        expect(control.hasAttribute("disabled")).toBe(true);
        expect(control.willValidate).toBe(false);
      }
    } finally {
      window.close();
    }
  });

  it("reflects object attributes and associates objects with their form", () => {
    const { window } = new Constructor(
      '<form id="owner"></form><object form="owner" data="sample.svg" name="art"></object>',
      { url: "https://example.test/media/" },
    );
    try {
      const { document } = window;
      const object = document.querySelector("object");
      if (!(object instanceof window.HTMLObjectElement)) throw new Error("Expected object");
      expect(object.form).toBe(document.querySelector("form"));
      expect(object.data).toBe("https://example.test/media/sample.svg");
      expect(object.contentDocument).toBeNull();
      object.codeBase = "../legacy/";
      object.useMap = "#regions";
      object.hspace = -1;
      expect([object.codeBase, object.useMap, object.hspace]).toEqual([
        "https://example.test/legacy/",
        "#regions",
        0,
      ]);
      object.setCustomValidity("invalid");
      expect(object.validity.customError).toBe(true);
      expect(object.willValidate).toBe(false);
      expect(object.validationMessage).toBe("");
      expect(object.checkValidity()).toBe(true);
      expect(object.reportValidity()).toBe(true);
    } finally {
      window.close();
    }
  });

  it("exposes specialized embedded element interfaces and resolves source URLs", () => {
    const { window } = new Constructor(
      '<base href="/media/"><embed src="clip.svg" width="80%"><picture><source srcset="small.png 1x"></picture><param name="mode" value="test">',
      { url: "https://example.test/page" },
    );
    try {
      const { document } = window;
      const embed = document.querySelector("embed");
      const source = document.querySelector("source");
      const param = document.querySelector("param");
      if (!(embed instanceof window.HTMLEmbedElement)) throw new Error("Expected embed");
      if (!(source instanceof window.HTMLSourceElement)) throw new Error("Expected source");
      if (!(param instanceof window.HTMLParamElement)) throw new Error("Expected param");
      expect(document.querySelector("picture")).toBeInstanceOf(window.HTMLPictureElement);
      expect(document.embeds.item(0)).toBe(embed);
      expect([embed.src, embed.width, source.srcset, param.name, param.value]).toEqual([
        "https://example.test/media/clip.svg",
        "80%",
        "small.png 1x",
        "mode",
        "test",
      ]);
      source.src = "large.png";
      embed.height = "120";
      param.valueType = "ref";
      expect(source.src).toBe("https://example.test/media/large.png");
      expect(embed.getAttribute("height")).toBe("120");
      expect(param.getAttribute("valuetype")).toBe("ref");
    } finally {
      window.close();
    }
  });

  it("exposes area URL components and live hyperlink relation tokens", () => {
    const { window } = new Constructor(
      '<map><area href="detail#old" rel="next next" alt="Detail" coords="1,2,3,4"></map><a rel="prev"></a>',
      { url: "https://example.test/maps/" },
    );
    try {
      const area = window.document.querySelector("area");
      const anchor = window.document.querySelector("a");
      if (!(area instanceof window.HTMLAreaElement)) throw new Error("Expected area");
      if (!(anchor instanceof window.HTMLAnchorElement)) throw new Error("Expected anchor");
      expect(area).not.toBeInstanceOf(window.HTMLAnchorElement);
      expect([area.pathname, area.origin, area.alt, area.coords]).toEqual([
        "/maps/detail",
        "https://example.test",
        "Detail",
        "1,2,3,4",
      ]);
      area.hash = "new";
      area.noHref = true;
      expect(area.href).toBe("https://example.test/maps/detail#new");
      expect(area.hasAttribute("nohref")).toBe(true);
      const rel = area.relList;
      expect([...rel]).toEqual(["next"]);
      rel.add("noopener");
      expect(area.rel).toBe("next noopener");
      area.rel = "alternate";
      expect(area.relList).toBe(rel);
      expect([...rel]).toEqual(["alternate"]);
      expect([...anchor.relList]).toEqual(["prev"]);
    } finally {
      window.close();
    }
  });

  it("runs XHTML classic scripts in document order, including CDATA and external scripts", async () => {
    const { window } = new Constructor(
      '<html xmlns="http://www.w3.org/1999/xhtml"><head>' +
        '<script><![CDATA[window.steps = ["inline"];]]></script>' +
        '<script src="data:text/javascript,window.steps.push(%22external%22)"/>' +
        '<script>window.steps.push("after")</script>' +
        '<script xmlns="urn:other">window.steps.push("foreign")</script>' +
        "</head><body/></html>",
      { contentType: "application/xhtml+xml", runScripts: "dangerously", resources: "usable" },
    );
    try {
      expect(Reflect.get(window, "steps")).toEqual(["inline"]);
      await new Promise<void>((resolve) =>
        window.addEventListener("load", () => resolve(), { once: true }),
      );
      expect(Reflect.get(window, "steps")).toEqual(["inline", "external", "after"]);
    } finally {
      window.close();
    }
  });

  it("reads and updates anchor URL components against the current document base", () => {
    const { window } = new Constructor('<base href="/assets/"><a href="item?x=1#old">Item</a>', {
      url: "https://example.test/page",
    });
    try {
      const anchor = window.document.querySelector("a");
      if (!(anchor instanceof window.HTMLAnchorElement)) throw new Error("Expected an anchor");
      expect([anchor.origin, anchor.protocol, anchor.host, anchor.pathname, anchor.search]).toEqual(
        ["https://example.test", "https:", "example.test", "/assets/item", "?x=1"],
      );
      anchor.username = "guest";
      anchor.port = "8443";
      anchor.pathname = "/new item";
      anchor.search = "?q=1";
      anchor.hash = "new";
      expect(anchor.getAttribute("href")).toBe(
        "https://guest@example.test:8443/new%20item?q=1#new",
      );
      expect([anchor.hostname, anchor.port, anchor.hash]).toEqual(["example.test", "8443", "#new"]);
      anchor.removeAttribute("href");
      anchor.protocol = "http:";
      expect(anchor.hasAttribute("href")).toBe(false);
      expect([anchor.href, anchor.origin, anchor.protocol]).toEqual(["", "", ":"]);
    } finally {
      window.close();
    }
  });

  it("resolves base element URLs against the document fallback and ignores unusable bases", () => {
    const { window } = new Constructor(
      '<base href="../assets/"><base href="other/" target="_blank"><a href="entry">Entry</a>',
      { url: "https://example.test/docs/page" },
    );
    try {
      const { document } = window;
      const [first, second] = document.querySelectorAll("base");
      const link = document.querySelector("a");
      if (!(first instanceof window.HTMLBaseElement) || !(second instanceof window.HTMLBaseElement))
        throw new Error("Expected base elements");
      if (!(link instanceof window.HTMLAnchorElement)) throw new Error("Expected link");
      expect(first.href).toBe("https://example.test/assets/");
      expect(second.href).toBe("https://example.test/docs/other/");
      expect(second.target).toBe("_blank");
      expect(link.href).toBe("https://example.test/assets/entry");
      first.href = "data:text/plain,blocked";
      expect(first.href).toBe("data:text/plain,blocked");
      expect(document.baseURI).toBe("https://example.test/docs/page");
      first.remove();
      expect(link.href).toBe("https://example.test/docs/other/entry");
      second.removeAttribute("href");
      expect(second.href).toBe(document.URL);
      second.setAttribute("href", "./relative/");
      const href = second.getAttributeNode("href");
      if (!href) throw new Error("Expected href attribute");
      expect(link.href).toBe("https://example.test/docs/relative/entry");
      href.value = "./edited/";
      expect(link.href).toBe("https://example.test/docs/edited/entry");
    } finally {
      window.close();
    }
  });

  it("reflects select names, disabled state, display size, and selection type", () => {
    const { window } = new Constructor(
      '<form><select name="choice"><option value="a">A</option></select></form>',
    );
    try {
      const select = window.document.querySelector("select");
      if (!(select instanceof window.HTMLSelectElement)) throw new Error("Expected select");
      expect([select.name, select.disabled, select.size, select.type]).toEqual([
        "choice",
        false,
        0,
        "select-one",
      ]);
      select.setAttribute("size", " +5 rows");
      expect(select.size).toBe(5);
      select.size = -1;
      select.multiple = true;
      select.disabled = true;
      select.name = "updated";
      expect(select.getAttribute("size")).toBe("0");
      expect(select.type).toBe("select-multiple");
      expect(select.hasAttribute("disabled")).toBe(true);
      expect(select.getAttribute("name")).toBe("updated");
      expect(select.willValidate).toBe(false);
    } finally {
      window.close();
    }
  });

  it("normalizes meter ranges and progress values while keeping labels live", () => {
    const { window } = new Constructor(
      '<label for="meter">Level</label><meter id="meter" min="2" max="6" low="4" high="3" value="10"></meter>' +
        "<label>Work <progress></progress></label>",
    );
    try {
      const meter = window.document.querySelector("meter");
      const progress = window.document.querySelector("progress");
      if (!(meter instanceof window.HTMLMeterElement)) throw new Error("Expected a meter");
      if (!(progress instanceof window.HTMLProgressElement)) throw new Error("Expected progress");
      expect([meter.value, meter.min, meter.max, meter.low, meter.high, meter.optimum]).toEqual([
        6, 2, 6, 4, 4, 4,
      ]);
      expect(meter.labels.item(0)?.textContent).toBe("Level");
      const labels = progress.labels;
      expect(labels.length).toBe(1);
      expect(progress.position).toBe(-1);
      progress.max = 4;
      progress.max = 0;
      progress.setAttribute("value", " +2.5 units");
      expect([progress.max, progress.value, progress.position]).toEqual([4, 2.5, 0.625]);
      expect(() => {
        meter.value = Infinity;
      }).toThrow(TypeError);
      progress.remove();
      expect(labels.length).toBe(0);
    } finally {
      window.close();
    }
  });

  it("inserts and removes options through both select entry points", () => {
    const { window } = new Constructor(
      '<select><option id="first">A</option><optgroup><option id="last">B</option></optgroup></select>',
    );
    try {
      const select = window.document.querySelector("select");
      const group = window.document.querySelector("optgroup");
      if (!(select instanceof window.HTMLSelectElement)) throw new Error("Expected select");
      const options = select.options;
      expect([...select]).toEqual([options.item(0), options.item(1)]);
      expect(options).toBeInstanceOf(window.HTMLOptionsCollection);
      expect(options).toBeInstanceOf(window.HTMLCollection);
      expect(Object.prototype.toString.call(options)).toBe("[object HTMLOptionsCollection]");
      expect(Object.keys(options)).toEqual(["0", "1", "first", "last"]);
      expect(() => Reflect.construct(window.HTMLOptionsCollection, [])).toThrow(TypeError);
      const inserted = new window.Option("C");
      options.add(inserted, 1);
      expect(inserted.parentNode).toBe(group);
      expect(options.item(1)).toBe(inserted);
      expect(Object.hasOwn(options, "1")).toBe(true);
      expect(options.namedItem("last")).toBe(options.item(2));
      const appended = new window.Option("D");
      select.add(appended, -1);
      expect(appended.parentNode).toBe(select);
      expect(() => select.add(inserted, window.document.body)).toThrow();
      select.remove(1);
      expect(inserted.parentNode).toBeNull();
      options.remove(2);
      expect(appended.parentNode).toBeNull();
      select.remove();
      expect(select.isConnected).toBe(false);
      expect(options.length).toBe(2);
      select.length = 4;
      expect(select[3]?.localName).toBe("option");
      const sparse = new window.Option("sparse");
      options[5] = sparse;
      expect(options.length).toBe(6);
      expect(select[5]).toBe(sparse);
      const replacement = new window.Option("replacement");
      select[0] = replacement;
      expect(options[0]).toBe(replacement);
      options[5] = null;
      expect(sparse.parentNode).toBeNull();
      options.length = 2;
      expect(select.length).toBe(2);
    } finally {
      window.close();
    }
  });

  it("resolves label, legend, and datalist relationships through specialized form elements", () => {
    const { window } = new Constructor(
      '<form><fieldset><legend>Title</legend><label for="entry">Entry</label>' +
        '<input id="entry" list="choices"><datalist id="choices"><option value="one"></datalist>' +
        '<select><optgroup label="group" disabled><option>choice</option></optgroup></select></fieldset></form>',
    );
    try {
      const { document } = window;
      const label = document.querySelector("label");
      const legend = document.querySelector("legend");
      const list = document.querySelector("datalist");
      const group = document.querySelector("optgroup");
      const input = document.querySelector("input");
      if (!(label instanceof window.HTMLLabelElement)) throw new Error("Expected label");
      if (!(legend instanceof window.HTMLLegendElement)) throw new Error("Expected legend");
      if (!(list instanceof window.HTMLDataListElement)) throw new Error("Expected datalist");
      if (!(group instanceof window.HTMLOptGroupElement)) throw new Error("Expected option group");
      if (!(input instanceof window.HTMLInputElement)) throw new Error("Expected input");
      expect(label.control).toBe(input);
      const labels = input.labels;
      expect(labels?.item(0)).toBe(label);
      expect(label.form).toBe(legend.form);
      expect(legend.form).toBe(document.querySelector("form"));
      expect(input.list).toBe(list);
      const options = list.options;
      list.appendChild(document.createElement("option"));
      expect(list.options).toBe(options);
      expect(options.length).toBe(2);
      expect([group.label, group.disabled]).toEqual(["group", true]);
      group.disabled = false;
      expect(group.hasAttribute("disabled")).toBe(false);
      label.htmlFor = "";
      input.type = "password";
      expect(label.control).toBeNull();
      expect(labels?.length).toBe(0);
      expect(input.list).toBeNull();
    } finally {
      window.close();
    }
  });

  it("reflects table spans, cell scope, and legacy presentation attributes", () => {
    const { window } = new Constructor(
      "<table><colgroup><col></colgroup><tr><th></th></tr></table>",
    );
    try {
      const { document } = window;
      const cell = document.querySelector("th");
      const col = document.querySelector("col");
      const table = document.querySelector("table");
      if (!(cell instanceof window.HTMLTableCellElement)) throw new Error("Expected a cell");
      if (!(col instanceof window.HTMLTableColElement)) throw new Error("Expected a column");
      if (!(table instanceof window.HTMLTableElement)) throw new Error("Expected a table");
      expect([col.span, cell.colSpan, cell.rowSpan]).toEqual([1, 1, 1]);
      col.span = 1001;
      cell.colSpan = -1;
      cell.rowSpan = 0;
      expect([col.getAttribute("span"), col.span, cell.colSpan, cell.rowSpan]).toEqual([
        "1001",
        1000,
        1,
        0,
      ]);
      cell.setAttribute("rowspan", "  +70000px");
      expect(cell.rowSpan).toBe(65534);
      cell.scope = "RowGroup";
      cell.chOff = "5";
      cell.noWrap = true;
      table.cellPadding = "2";
      expect([cell.scope, cell.getAttribute("scope"), cell.getAttribute("charoff")]).toEqual([
        "rowgroup",
        "RowGroup",
        "5",
      ]);
      expect(cell.hasAttribute("nowrap")).toBe(true);
      expect(table.getAttribute("cellpadding")).toBe("2");
      cell.scope = "unknown";
      expect(cell.scope).toBe("");
    } finally {
      window.close();
    }
  });

  it("maintains live table collections and row and cell indices", () => {
    const { window } = new Constructor(
      "<table><tfoot><tr></tr></tfoot><tbody><tr></tr></tbody></table>",
    );
    try {
      const table = window.document.querySelector("table");
      if (!(table instanceof window.HTMLTableElement)) throw new Error("Expected table");
      const rows = table.rows;
      const head = table.createTHead();
      const heading = head.insertRow();
      const caption = table.createCaption();
      expect(caption).toBeInstanceOf(window.HTMLTableCaptionElement);
      expect(table.firstElementChild).toBe(caption);
      expect(table.rows).toBe(rows);
      expect(rows.item(0)).toBe(heading);
      const foot = table.tFoot;
      if (!foot) throw new Error("Expected footer");
      const last = table.insertRow();
      expect(last.parentNode).toBe(foot);
      expect(last.previousElementSibling).toBe(foot.rows.item(0));
      expect([last.rowIndex, last.sectionRowIndex]).toEqual([3, 1]);
      const cell = last.insertCell();
      last.insertCell(0);
      expect(cell.cellIndex).toBe(1);
      last.deleteCell(0);
      expect(cell.cellIndex).toBe(0);
      expect(() => last.deleteCell(3)).toThrow();
      table.deleteRow(-1);
      expect(last.rowIndex).toBe(-1);
      expect(rows.length).toBe(3);
      expect(table.createTBody()).toBe(table.tBodies.item(1));
    } finally {
      window.close();
    }
  });

  it("distinguishes unknown HTML tags from valid custom names and foreign namespaces", () => {
    const { window } = new Constructor("<constructor></constructor><demo-widget></demo-widget>");
    try {
      const { document } = window;
      const html = "http://www.w3.org/1999/xhtml";
      expect(document.querySelector("constructor")).toBeInstanceOf(window.HTMLUnknownElement);
      for (const name of ["toString", "__proto__", "annotation-xml", "image", "blink"]) {
        expect(document.createElement(name)).toBeInstanceOf(window.HTMLUnknownElement);
      }
      expect(document.createElementNS(html, "x:unrecognized")).toBeInstanceOf(
        window.HTMLUnknownElement,
      );
      expect(document.createElementNS("urn:example", "constructor").constructor).toBe(
        window.Element,
      );
      const pending = document.querySelector("demo-widget");
      expect(pending?.constructor).toBe(window.HTMLElement);
      expect(document.createElement("article").constructor).toBe(window.HTMLElement);
      expect(document.createElement("audio")).not.toBeInstanceOf(window.HTMLUnknownElement);
      class DemoWidget extends window.HTMLElement {}
      window.customElements.define("demo-widget", DemoWidget);
      expect(pending).toBeInstanceOf(DemoWidget);
      expect(Object.prototype.toString.call(document.createElement("unrecognized"))).toBe(
        "[object HTMLUnknownElement]",
      );
    } finally {
      window.close();
    }
  });

  it("exposes specialized text and list element interfaces and reflects their attributes", () => {
    const { window } = new Constructor("<h2>Heading</h2><ol><li>Item</li></ol><span>Text</span>", {
      url: "https://example.test/docs/",
    });
    try {
      const { document } = window;
      const heading = document.querySelector("h2");
      const list = document.querySelector("ol");
      const item = document.querySelector("li");
      if (!(heading instanceof window.HTMLHeadingElement)) throw new Error("Expected heading");
      if (!(list instanceof window.HTMLOListElement)) throw new Error("Expected ordered list");
      if (!(item instanceof window.HTMLLIElement)) throw new Error("Expected list item");
      expect(document.querySelector("span")).toBeInstanceOf(window.HTMLSpanElement);
      expect(document.createElement("ul")).toBeInstanceOf(window.HTMLUListElement);
      expect(document.createElement("dl")).toBeInstanceOf(window.HTMLDListElement);
      expect(document.createElement("menu")).toBeInstanceOf(window.HTMLMenuElement);
      expect(document.createElement("listing")).toBeInstanceOf(window.HTMLPreElement);
      expect(document.createElement("br")).toBeInstanceOf(window.HTMLBRElement);
      expect(document.createElement("hr")).toBeInstanceOf(window.HTMLHRElement);
      heading.align = "center";
      list.reversed = true;
      expect(list.start).toBe(1);
      list.setAttribute("start", " -7rest");
      expect(list.start).toBe(-7);
      list.start = 2 ** 32 + 9;
      item.value = -4;
      expect([
        heading.getAttribute("align"),
        list.hasAttribute("reversed"),
        list.start,
        item.value,
      ]).toEqual(["center", true, 9, -4]);
      const quote = document.createElement("q");
      if (!(quote instanceof window.HTMLQuoteElement)) throw new Error("Expected quote");
      quote.cite = "source.html";
      expect(quote.cite).toBe("https://example.test/docs/source.html");
    } finally {
      window.close();
    }
  });

  it("constructs detached images with the realm's HTMLImageElement prototype", () => {
    const { window } = new Constructor("", { url: "https://example.test/path/" });
    try {
      const image = new window.Image(12, 8);
      expect(image).toBeInstanceOf(window.HTMLImageElement);
      expect(window.document.createElement("img")).toBeInstanceOf(window.Image);
      expect(image.ownerDocument).toBe(window.document);
      expect(image.isConnected).toBe(false);
      expect([image.width, image.height]).toEqual([12, 8]);
      expect(image.complete).toBe(true);
      expect([image.naturalWidth, image.naturalHeight, image.currentSrc]).toEqual([0, 0, ""]);
      image.src = "photo.png";
      image.width = -1;
      expect(image.src).toBe("https://example.test/path/photo.png");
      expect(image.width).toBe(4294967295);
      expect(image.complete).toBe(false);
      expect(window.Image(undefined).getAttribute("width")).toBe("undefined");
      expect(Object.getOwnPropertyDescriptor(window, "Image")?.enumerable).toBe(false);
    } finally {
      window.close();
    }
  });

  it("reflects image source, alternative text, map, and legacy attributes", () => {
    const { window } = new Constructor("<base href='/assets/'>", {
      url: "https://example.test/page",
    });
    try {
      const image = new window.Image();
      image.alt = "A diagram";
      image.srcset = "small.png 1x, large.png 2x";
      image.sizes = "100vw";
      image.crossOrigin = "ANONYMOUS";
      image.useMap = "#regions";
      image.isMap = true;
      image.name = "diagram";
      image.align = "left";
      image.lowsrc = "preview.png";
      image.longDesc = "description.html";
      image.hspace = 12;
      image.vspace = -1;
      image.border = "1";
      expect(image.outerHTML).toBe(
        '<img alt="A diagram" srcset="small.png 1x, large.png 2x" sizes="100vw" crossorigin="ANONYMOUS" usemap="#regions" ismap="" name="diagram" align="left" lowsrc="preview.png" longdesc="description.html" hspace="12" vspace="0" border="1">',
      );
      expect(image.lowsrc).toBe("https://example.test/assets/preview.png");
      expect(image.longDesc).toBe("https://example.test/assets/description.html");
      expect(image.crossOrigin).toBe("ANONYMOUS");
      image.crossOrigin = null;
      image.isMap = false;
      image.setAttribute("hspace", "  +23px");
      expect([image.crossOrigin, image.isMap, image.hspace, image.vspace]).toEqual([
        null,
        false,
        23,
        0,
      ]);
    } finally {
      window.close();
    }
  });

  it("exposes replaceable viewport defaults and tracks element scrolling independently", () => {
    const { window } = new Constructor("<main><p></p><p></p></main>", {
      runScripts: "outside-only",
    });
    try {
      expect([
        window.innerWidth,
        window.innerHeight,
        window.outerWidth,
        window.outerHeight,
      ]).toEqual([1024, 768, 1024, 768]);
      expect([window.devicePixelRatio, window.scrollX, window.pageXOffset]).toEqual([1, 0, 0]);
      expect(window.screen instanceof window.Screen).toBe(true);
      expect([window.screen.width, window.screen.availHeight, window.screen.colorDepth]).toEqual([
        0, 0, 24,
      ]);
      expect(Object.getOwnPropertyDescriptor(window, "innerWidth")?.get).toBeTypeOf("function");
      window.eval("innerWidth = 320");
      expect(window.innerWidth).toBe(320);
      expect(Object.getOwnPropertyDescriptor(window, "innerWidth")?.value).toBe(320);
      expect(window.outerWidth).toBe(1024);

      const [first, second] = window.document.querySelectorAll("p");
      if (!first || !second) throw new Error("Expected the fixture elements");
      first.scrollLeft = -2.5;
      first.scrollTop = Number.POSITIVE_INFINITY;
      expect([first.scrollLeft, first.scrollTop]).toEqual([-2.5, Infinity]);
      expect([second.scrollLeft, second.scrollTop]).toEqual([0, 0]);
      expect(window.scrollY).toBe(0);
    } finally {
      window.close();
    }
  });

  it("reports unsupported viewport scrolling through the virtual console", () => {
    const virtualConsole = new Console();
    const errors: Error[] = [];
    virtualConsole.on("jsdomError", (error: Error) => errors.push(error));
    const { window } = new Constructor("", { virtualConsole });
    try {
      expect(window.scroll(1, 2)).toBeUndefined();
      expect(window.scrollBy({ top: 3 })).toBeUndefined();
      expect(window.scrollTo(4, 5)).toBeUndefined();
      expect(errors.map((error) => error.message)).toEqual([
        "Not implemented: Window's scroll() method",
        "Not implemented: Window's scrollBy() method",
        "Not implemented: Window's scrollTo() method",
      ]);
      expect([window.scrollX, window.scrollY]).toEqual([0, 0]);
    } finally {
      window.close();
    }
  });

  it("fills integer views from the script realm and reports the Web Crypto limits", () => {
    const { window } = new Constructor("", { runScripts: "outside-only" });
    try {
      expect(window.crypto instanceof window.Crypto).toBe(true);
      expect(window.crypto).toBe(window.crypto);
      expect(
        window.eval(`
        const bytes = new Uint8Array(34);
        const view = bytes.subarray(1, 33);
        crypto.getRandomValues(view) === view &&
          bytes[0] === 0 && bytes[33] === 0 && view.some(byte => byte !== 0)
      `),
      ).toBe(true);
      expect(() => window.crypto.getRandomValues(new Float32Array(1))).toThrow(
        expect.objectContaining({ name: "TypeMismatchError" }),
      );
      expect(
        window.eval(`
        try {
          crypto.getRandomValues(new Uint8Array(65537));
          false;
        } catch (error) {
          error instanceof QuotaExceededError && error instanceof DOMException &&
            error.quota === null && error.requested === null;
        }
      `),
      ).toBe(true);
      expect(window.crypto.randomUUID()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      window.close();
    }
  });

  it("allows animation-frame globals to be replaced in a visual Window", () => {
    // Given: visual and nonvisual script realms.
    const { window: visual } = new Constructor("", {
      pretendToBeVisual: true,
      runScripts: "outside-only",
    });
    const { window: nonvisual } = new Constructor("", { runScripts: "outside-only" });
    try {
      // When: a runner installs its own animation scheduler.
      const request = () => 42;
      const cancel = () => undefined;
      visual.requestAnimationFrame = request;
      visual.cancelAnimationFrame = cancel;
      // Then: the visual bindings are writable and the nonvisual realm omits them.
      expect(visual.requestAnimationFrame).toBe(request);
      expect(visual.cancelAnimationFrame).toBe(cancel);
      expect("requestAnimationFrame" in nonvisual).toBe(false);
      expect("cancelAnimationFrame" in nonvisual).toBe(false);
    } finally {
      visual.close();
      nonvisual.close();
    }
  });

  it("uses the Window time origin for performance and animation frames", async () => {
    const before = Date.now();
    const { window } = new Constructor("", { pretendToBeVisual: true, runScripts: "outside-only" });
    try {
      const clock = window.performance;
      expect(clock instanceof window.Performance).toBe(true);
      expect(clock instanceof window.EventTarget).toBe(true);
      expect(window.eval("performance === window.performance")).toBe(true);
      expect(clock.timeOrigin).toBeGreaterThanOrEqual(before - 1);
      expect(clock.toJSON()).toEqual({ timeOrigin: clock.timeOrigin });
      const start = clock.now();
      const frame = await new Promise<number>((resolve) => window.requestAnimationFrame?.(resolve));
      expect(frame).toBeGreaterThanOrEqual(start);
      expect(frame).toBeLessThanOrEqual(clock.now());
    } finally {
      window.close();
    }
  });

  it("queues trusted Window messages and checks the destination origin", async () => {
    const { window } = new Constructor("", {
      url: "https://example.test/",
      runScripts: "outside-only",
    });
    try {
      expect(() => window.eval("postMessage('missing origin')")).toThrow();
      expect(() => window.postMessage("invalid", "relative/path")).toThrow(
        expect.objectContaining({ name: "SyntaxError" }),
      );
      expect(
        await window.eval(`
        (() => {
          const received = [];
          const payload = { value: 1 };
          const result = new Promise(resolve => {
            onmessage = event => {
              received.push(event);
              if (event.data === 'same origin') {
                resolve(received.length === 2 && received[0].data === payload &&
                  received[0].data.value === 2 && received[0].isTrusted &&
                  received[0].target === window && received[0].source === null);
              }
            };
          });
          postMessage('wrong origin', 'https://other.test');
          postMessage(payload, '*');
          postMessage('same origin', 'https://example.test:443/path');
          payload.value = 2;
          return received.length === 0 && result;
        })()
      `),
      ).toBe(true);
    } finally {
      window.close();
    }
  });

  it("reflects body and frameset message handlers onto the owning Window", () => {
    const { window } = new Constructor(
      "<body onmessageerror='this.name = event.type'><script>window.initialMessageHandler = typeof onmessageerror</script>",
      {
        runScripts: "dangerously",
      },
    );
    try {
      expect(
        window.eval(`
        (() => {
          if (window.initialMessageHandler !== "function") return false;
          const body = document.body;
          const parsed = body.onmessageerror;
          dispatchEvent(new Event('messageerror'));
          if (parsed !== onmessageerror || window.name !== 'messageerror') return false;
          body.removeAttribute('onmessageerror');
          if (onmessageerror !== null) return false;
          const frameset = document.createElement('frameset');
          const listener = () => {};
          frameset.onmessage = listener;
          if (frameset.onmessage !== listener || onmessage !== listener) return false;
          const detached = document.implementation.createHTMLDocument('').body;
          detached.onmessage = () => {};
          return detached.onmessage === null && onmessage === listener;
        })()
      `),
      ).toBe(true);
    } finally {
      window.close();
    }
  });

  it("delivers a trusted history event to the body handler on traversal", async () => {
    const { window } = new Constructor("", {
      url: "https://example.test/",
      runScripts: "outside-only",
    });
    try {
      expect(
        await window.eval(`
        new Promise(resolve => {
          history.replaceState({ page: 1 }, "", "/first");
          history.pushState({ page: 2 }, "", "/second");
          document.body.onpopstate = event => resolve(
            event.isTrusted && event.state.page === 1 &&
              event.target === window && location.pathname === "/first"
          );
          history.back();
        })
      `),
      ).toBe(true);
    } finally {
      window.close();
    }
  });

  it("delivers a trusted storage event to the receiving frame's body handler", async () => {
    const { window } = new Constructor("<iframe></iframe>", {
      url: "https://example.test/",
      runScripts: "outside-only",
    });
    try {
      expect(
        await window.eval(`
        new Promise(resolve => {
          const child = document.querySelector("iframe").contentWindow;
          child.document.body.onstorage = event => resolve(
            event.isTrusted && event.target === child && event.key === "shared" &&
              event.oldValue === null && event.newValue === "value" &&
              event.storageArea === child.localStorage && event.url === "https://example.test/"
          );
          history.replaceState(null, "", "/updated");
          localStorage.setItem("shared", "value");
        })
      `),
      ).toBe(true);
    } finally {
      window.close();
    }
  });

  it("initializes and reinitializes synthetic storage events", () => {
    const { window } = new Constructor("", { url: "https://example.test/" });
    try {
      const event = new window.StorageEvent("storage", {
        bubbles: true,
        cancelable: true,
        url: "relative",
        storageArea: window.localStorage,
      });
      expect(event.bubbles).toBe(true);
      expect(event.cancelable).toBe(true);
      expect(event.storageArea === window.localStorage).toBe(true);
      event.initStorageEvent("legacy", false, false, "key", "old", "new");
      expect([
        event.type,
        event.bubbles,
        event.key,
        event.oldValue,
        event.newValue,
        event.url,
      ]).toEqual(["legacy", false, "key", "old", "new", ""]);
      expect(event.storageArea).toBeNull();
    } finally {
      window.close();
    }
  });

  it("orders trusted popstate and hashchange events after fragment navigation and traversal", async () => {
    const { window } = new Constructor("", {
      url: "https://example.test/",
      runScripts: "outside-only",
    });
    try {
      expect(
        await window.eval(`
        new Promise(resolve => {
          const events = [];
          onpopstate = event => events.push([event.type, event.isTrusted, location.hash]);
          onhashchange = event => {
            events.push([event.type, event.isTrusted, event.oldURL, event.newURL]);
            if (location.hash) history.back();
            else resolve(events);
          };
          location.hash = "one";
        })
      `),
      ).toEqual([
        ["popstate", true, "#one"],
        ["hashchange", true, "https://example.test/", "https://example.test/#one"],
        ["popstate", true, ""],
        ["hashchange", true, "https://example.test/#one", "https://example.test/"],
      ]);
    } finally {
      window.close();
    }
  });

  it("invalidates queued traversal on push and reports reload through both APIs", async () => {
    const virtualConsole = new Console();
    const errors: Error[] = [];
    virtualConsole.on("jsdomError", (error: Error) => errors.push(error));
    const { window } = new Constructor("", {
      url: "https://example.test/",
      runScripts: "outside-only",
      virtualConsole,
    });
    try {
      expect(
        await window.eval(`
        new Promise(resolve => {
          const events = [];
          onpopstate = event => events.push(event.state);
          history.pushState(1, "", "/one");
          history.back();
          history.pushState(2, "", "/two");
          setTimeout(() => resolve([location.pathname, history.state, events]), 0);
        })
      `),
      ).toEqual(["/two", 2, []]);
      window.history.go(0);
      window.location.reload();
      expect(errors.map((error) => error.message)).toEqual([
        "Not implemented: navigation to another Document",
        "Not implemented: navigation to another Document",
      ]);
    } finally {
      window.close();
    }
  });

  it("exposes unforgeable Location accessors and forwards document and Window assignments", () => {
    const { window } = new Constructor('<base href="/other">', {
      url: "https://example.test/",
      runScripts: "outside-only",
      virtualConsole: new Console(),
    });
    try {
      expect(
        window.eval(`
        (() => {
          const descriptor = Object.getOwnPropertyDescriptor(location, "href");
          const port = Object.getOwnPropertyDescriptor(location, "port");
          const assign = Object.getOwnPropertyDescriptor(location, "assign");
          return !!descriptor && !descriptor.configurable && typeof descriptor.set === "function" &&
            !!port && typeof port.set === "function" && !!assign && !assign.writable &&
            !Object.hasOwn(Location.prototype, "href") &&
            Object.getOwnPropertyDescriptor(new Document(), "location").get ===
              Object.getOwnPropertyDescriptor(document, "location").get;
        })()
      `),
      ).toBe(true);
      expect(() => window.eval("new Location()")).toThrow();
      expect(() => window.location.assign("http://[")).toThrow(
        expect.objectContaining({ name: "SyntaxError" }),
      );
      window.eval('window.location = "#uses-base"');
      expect(window.location.hash).toBe("");
      window.eval('document.location = "https://example.test/#forwarded"');
      expect(window.location.hash).toBe("#forwarded");
      expect(window.document.location === window.location).toBe(true);
    } finally {
      window.close();
    }
  });

  it("exposes an initial frame origin and its embedding element", () => {
    const dom = new Constructor("<iframe></iframe>", {
      url: "https://example.test/",
      runScripts: "outside-only",
    });
    const { window } = dom;
    try {
      expect(window.frameElement).toBeNull();
      expect(
        window.eval(`
        (() => {
          const frame = document.querySelector("iframe");
          const child = frame.contentWindow;
          return [child.origin, child.location.origin, child.frameElement === frame,
            child.parent === window, child.top === window];
        })()
      `),
      ).toEqual(["https://example.test", "null", true, true, true]);

      dom.reconfigure({ url: "https://other.test/" });
      expect(window.origin).toBe("https://example.test");
      expect(window.location.origin).toBe("https://other.test");
      window.eval('origin = "overridden"');
      expect(window.origin).toBe("overridden");
      expect(window.location.origin).toBe("https://other.test");
    } finally {
      window.close();
    }
  });

  it("retains storage through URL reconfiguration and gates access on the document origin", () => {
    const dom = new Constructor("", { url: "https://example.test/" });
    const { window } = dom;
    try {
      const local = window.localStorage;
      const session = window.sessionStorage;
      local.setItem("key", "local");
      session.setItem("key", "session");
      dom.reconfigure({ url: "https://other.test/" });
      expect(window.localStorage).toBe(local);
      expect(window.sessionStorage).toBe(session);
      expect(local.getItem("key")).toBe("local");
      expect(session.getItem("key")).toBe("session");

      dom.reconfigure({ url: "about:blank" });
      expect(() => window.localStorage).toThrow(expect.objectContaining({ name: "SecurityError" }));
      dom.reconfigure({ url: "https://third.test/" });
      expect(window.localStorage).toBe(local);
      expect(window.localStorage.getItem("key")).toBe("local");
    } finally {
      window.close();
    }
  });

  it("stores named properties while keeping inherited Storage members visible", () => {
    const { window } = new Constructor("", { url: "https://example.test/" });
    try {
      const store = window.localStorage;
      expect(Reflect.set(store, "getItem", "hidden")).toBe(true);
      expect(store.getItem).toBe(window.Storage.prototype.getItem);
      expect(store.getItem("getItem")).toBe("hidden");
      expect(Object.hasOwn(store, "getItem")).toBe(false);

      Object.defineProperty(store, "value", { value: 42 });
      expect(store.getItem("value")).toBe("42");
      expect(Object.getOwnPropertyDescriptor(store, "value")).toEqual({
        value: "42",
        enumerable: true,
        writable: true,
        configurable: true,
      });
      expect(Reflect.defineProperty(store, "accessor", { get: () => 1 })).toBe(false);
      expect(store.getItem("accessor")).toBeNull();
      expect(Reflect.deleteProperty(store, "getItem")).toBe(true);
      expect(store.getItem("getItem")).toBe("hidden");
    } finally {
      window.close();
    }
  });

  it("uses the receiver's storage and quota when methods are borrowed across Windows", () => {
    const left = new Constructor("", { url: "https://left.test/", storageQuota: 1 });
    const right = new Constructor("", { url: "https://right.test/", storageQuota: 8 });
    try {
      const source = left.window.localStorage;
      const destination = right.window.localStorage;
      source.setItem.call(destination, "key", "value");
      expect(source.getItem.call(destination, "key")).toBe("value");
      expect(source.length).toBe(0);
      expect(() => source.setItem.call(destination, "key", "longer")).toThrow(
        right.window.QuotaExceededError,
      );
      expect(destination.getItem("key")).toBe("value");
      source.removeItem.call(destination, "key");
      expect(destination.length).toBe(0);
    } finally {
      left.window.close();
      right.window.close();
    }
  });

  it("preserves insertion order for numeric and prototype-like storage keys", () => {
    const { window } = new Constructor("", { url: "https://example.test/" });
    try {
      const store = window.localStorage;
      store.setItem("10", "ten");
      store.setItem("2", "two");
      store.setItem("__proto__", "literal");
      store.setItem("10", "updated");
      expect([store.key(0), store.key(1), store.key(2)]).toEqual(["10", "2", "__proto__"]);
      expect(store.getItem("__proto__")).toBe("literal");
      store.setItem("new", "appended");
      expect(store.key(3)).toBe("new");
      store.removeItem("new");
      store.removeItem("10");
      store.setItem("10", "reinserted");
      expect([store.key(0), store.key(1), store.key(2)]).toEqual(["2", "__proto__", "10"]);
      store.clear();
      expect(store.length).toBe(0);
      expect(store.getItem("__proto__")).toBeNull();
    } finally {
      window.close();
    }
  });

  it("exposes storage accessors on Window and enumerable Web IDL members", () => {
    const { window } = new Constructor("", { url: "https://example.test/" });
    try {
      for (const key of ["localStorage", "sessionStorage"] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(window, key);
        expect(descriptor?.get).toBeTypeOf("function");
        expect(descriptor?.set).toBeUndefined();
        expect(descriptor?.enumerable).toBe(true);
        expect(descriptor?.configurable).toBe(true);
      }
      const prototype = window.Storage.prototype;
      expect(Object.keys(prototype)).toEqual([
        "key",
        "getItem",
        "setItem",
        "removeItem",
        "clear",
        "length",
      ]);
      let coerced = false;
      const index = {
        valueOf() {
          coerced = true;
          return 0;
        },
      };
      expect(() => Reflect.apply(prototype.key, {}, [index])).toThrow(TypeError);
      expect(coerced).toBe(false);
    } finally {
      window.close();
    }
  });

  it("emits storage events only when a store changes", async () => {
    const { window } = new Constructor("<iframe></iframe>", {
      url: "https://example.test/",
      runScripts: "outside-only",
    });
    try {
      expect(
        await window.eval(`
        (async () => {
          const child = document.querySelector("iframe").contentWindow;
          const results = [];
          for (const name of ["localStorage", "sessionStorage"]) {
            const store = window[name];
            const changes = [];
            child.onstorage = event => {
              if (event.storageArea === child[name])
                changes.push([event.key, event.oldValue, event.newValue]);
            };
            store.setItem("key", "first");
            store.setItem("key", "first");
            store.removeItem("missing");
            store.clear();
            store.clear();
            store.setItem("key", "last");
            await new Promise(resolve => child.setTimeout(resolve, 0));
            results.push(changes);
          }
          return results;
        })()
      `),
      ).toEqual([
        [
          ["key", null, "first"],
          [null, null, null],
          ["key", null, "last"],
        ],
        [
          ["key", null, "first"],
          [null, null, null],
          ["key", null, "last"],
        ],
      ]);
    } finally {
      window.close();
    }
  });

  it("clears trust on redispatch and exposes an unforgeable event trust getter", async () => {
    const { window } = new Constructor("", { runScripts: "outside-only" });
    try {
      expect(
        await window.eval(`
        new Promise(resolve => {
          onmessage = event => {
            onmessage = null;
            const trusted = event.isTrusted;
            const descriptor = Object.getOwnPropertyDescriptor(event, "isTrusted");
            const synthetic = Object.getOwnPropertyDescriptor(new Event("message"), "isTrusted");
            setTimeout(() => {
              const target = document.createElement("div");
              let duringRedispatch;
              target.addEventListener("message", received => { duringRedispatch = received.isTrusted; });
              target.dispatchEvent(event);
              resolve([trusted, descriptor?.configurable, descriptor?.get === synthetic?.get,
                duringRedispatch, event.isTrusted]);
            }, 0);
          };
          postMessage("payload", "*");
        })
      `),
      ).toEqual([true, false, true, false, false]);
    } finally {
      window.close();
    }
  });

  it("restores window.event after nested dispatch and excludes shadow listeners", () => {
    const { window } = new Constructor("<main></main>", { runScripts: "outside-only" });
    try {
      expect(
        window.eval(`
        (() => {
          const host = document.querySelector("main");
          const root = host.attachShadow({ mode: "closed" });
          const child = root.appendChild(document.createElement("span"));
          const seen = [];
          child.addEventListener("inner", e => seen.push(window.event?.type));
          host.addEventListener("inner", e => seen.push(window.event === e));
          host.addEventListener("outer", e => {
            seen.push(window.event === e);
            child.dispatchEvent(new Event("inner", { composed: true }));
            seen.push(window.event === e);
          });
          host.dispatchEvent(new Event("outer"));
          seen.push(window.event === undefined);
          return seen;
        })()
      `),
      ).toEqual([true, "outer", true, true, true]);
    } finally {
      window.close();
    }
  });

  it("parses implied HTML structure and dispatches a bubbling click on the same node", () => {
    // Given: markup without an explicit document structure.
    const { window } = new Constructor('<button id="apply">Apply</button>');
    const { document } = window;
    const button = document.querySelector("button");
    if (!(button instanceof window.HTMLElement)) throw new Error("HTML button was not parsed");
    document.body?.addEventListener("click", (event) => {
      expect(event.target).toBe(button);
      button.textContent = "Applied";
    });

    // When: the consumer invokes the HTML activation method.
    button.click();

    // Then: the ancestor receives the event and both lookups resolve the same object.
    expect(document.getElementById("apply")).toBe(button);
    expect(document.body?.textContent).toBe("Applied");
    window.close();
  });

  it("keeps mutable state and DOM constructors local to each Window", () => {
    // Given: two Windows created from the same markup.
    const a = new Constructor("<p>one</p>").window;
    const b = new Constructor("<p>one</p>").window;

    // When: one Window is mutated and closed.
    if (!a.document.body) throw new Error("body was not parsed");
    a.document.body.textContent = "changed";
    a.close();

    // Then: the other Window still has its own DOM and brands.
    expect(b.document.body?.textContent).toBe("one");
    expect(b.document.body).toBeInstanceOf(b.HTMLElement);
    expect(b.document.body).not.toBeInstanceOf(a.HTMLElement);
    b.close();
  });

  it("keeps live select options independent of replaced public topology getters", () => {
    // Given: one retained options collection and replaced public getters.
    const { window } = new Constructor(
      "<select><option>A</option><optgroup><option>B</option></optgroup></select>",
    );
    const select = window.document.querySelector("select");
    if (!select || !(select instanceof window.HTMLSelectElement))
      throw new Error("select was not parsed");
    const options = select.options;
    const throwGetter = () => {
      throw new Error("Public getter called");
    };
    Object.defineProperty(select, "firstElementChild", { get: throwGetter });
    Object.defineProperty(window.Element.prototype, "nextElementSibling", { get: throwGetter });

    // When: an option is appended after the collection was captured.
    const option = window.document.createElement("option");
    select.appendChild(option);

    // Then: the same collection reflects the change through private topology.
    expect(select.options).toBe(options);
    expect(options.length).toBe(3);
    expect(options.item(2)).toBe(option);
    expect(options[2]).toBe(option);
    window.close();
  });
});

describe("RunDOM package", () => {
  it("runs the synchronous CommonJS entry point", () => {
    // Given: a Node consumer using require.
    const { JSDOM: CommonJS }: { JSDOM: typeof JSDOM } = require("@run-dom/jsdom");

    // When: markup is parsed synchronously.
    const { window } = new CommonJS("<p>common</p>");

    // Then: the returned Window has parsed content.
    expect(window.document.body?.textContent).toBe("common");
    window.close();
  });
});

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom 31.0.1", Constructor: reference },
])("$name source locations", ({ Constructor }) => {
  it("reports original offsets for parsed nodes after a document mutation", () => {
    // Given: a source-tracked document with implied structure.
    const dom = new Constructor("<p>Hello</p>", { includeNodeLocations: true });
    const { document } = dom.window;
    const paragraph = document.querySelector("p");
    if (!paragraph) throw new Error("paragraph was not parsed");

    // When: new text is inserted after parsing.
    const added = document.createTextNode("!");
    paragraph.appendChild(added);

    // Then: source ranges only describe the original input.
    expect(dom.nodeLocation(paragraph)).toMatchObject({ startOffset: 0, endOffset: 12 });
    expect(dom.nodeLocation(paragraph.firstChild)).toMatchObject({ startOffset: 3, endOffset: 8 });
    expect(dom.nodeLocation(document.body)).toBeNull();
    expect(dom.nodeLocation(added)).toBeUndefined();
    dom.window.close();
  });

  it("requires source tracking to be enabled during construction", () => {
    // Given: the default parser configuration.
    const dom = new Constructor("<p>Hello</p>");

    // When and then: the caller asks for a location that was never saved.
    expect(() => dom.nodeLocation(dom.window.document.body)).toThrow(
      "Location information was not saved for this jsdom. Use includeNodeLocations during creation.",
    );
    dom.window.close();
  });
});

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom 31.0.1", Constructor: reference },
])("$name document URL", ({ Constructor }) => {
  it("updates retained Location and document views together after reconfiguration", () => {
    // Given: a Window with a canonicalized URL and a retained Location.
    const dom = new Constructor("", {
      url: "https://EXAMPLE.test:443",
      referrer: "https://other.test",
    });
    const { location, document } = dom.window;
    expect(location.href).toBe("https://example.test/");
    expect(document.referrer).toBe("https://other.test/");

    // When: the host reconfigures the browsing context URL.
    dom.reconfigure({ url: "https://example.test/path" });

    // Then: every view sees the same canonical URL.
    expect(dom.window.location).toBe(location);
    expect(location.href).toBe("https://example.test/path");
    expect(document.URL).toBe(location.href);
    expect(document.documentURI).toBe(location.href);
    dom.window.close();
  });

  it("preserves the previous URL if reconfiguration cannot parse the new one", () => {
    // Given: a valid active document URL.
    const dom = new Constructor("", { url: "https://example.test" });

    // When and then: a relative URL is rejected without changing the active document.
    expect(() => dom.reconfigure({ url: "/relative" })).toThrow(TypeError);
    expect(dom.window.document.URL).toBe("https://example.test/");
    dom.window.close();
  });
});

it("exposes the visual transition flag on synthetic popstate events", () => {
  const { window } = new JSDOM("");
  try {
    expect(new window.PopStateEvent("popstate").hasUAVisualTransition).toBe(false);
    const state = { page: 2 };
    const event = new window.PopStateEvent("popstate", {
      state,
      bubbles: true,
      hasUAVisualTransition: true,
    });
    expect(event.state).toBe(state);
    expect(event.bubbles).toBe(true);
    expect(event.hasUAVisualTransition).toBe(true);
    window.dispatchEvent(event);
    expect(window.history.state).toBeNull();
  } finally {
    window.close();
  }
});

it("reflects HTMLElement hidden states through the content attribute", () => {
  const { window } = new JSDOM();
  try {
    const element = window.document.createElement("div");
    if (!(element instanceof window.HTMLElement)) throw new Error("Expected an HTML element");

    expect(element.hidden).toBe(false);
    element.hidden = true;
    expect(element.getAttribute("hidden")).toBe("");
    expect(element.hidden).toBe(true);

    element.setAttribute("hidden", "UnTiL-FoUnD");
    expect(element.hidden).toBe("until-found");
    element.hidden = "UNTIL-FOUND";
    expect(element.getAttribute("hidden")).toBe("until-found");

    element.hidden = false;
    expect(element.hasAttribute("hidden")).toBe(false);
    element.hidden = "0";
    expect(element.hidden).toBe(true);
    element.hidden = 0;
    expect(element.hidden).toBe(false);
  } finally {
    window.close();
  }
});

it("reveals fragment ancestors synchronously and respects beforematch mutations", () => {
  const { window } = new JSDOM(
    '<section hidden="until-found"><div id="café" hidden="until-found"></div></section>',
    { url: "https://example.test/" },
  );
  try {
    const target = window.document.getElementById("café");
    const parent = target?.parentElement;
    if (!(target instanceof window.HTMLElement) || !(parent instanceof window.HTMLElement)) {
      throw new Error("Expected fragment target and ancestor");
    }
    const revealed: unknown[] = [];
    parent.onbeforematch = (event) => {
      revealed.push([
        event.target === target ? "target" : "parent",
        event.isTrusted,
        parent.hidden,
        target.hidden,
      ]);
      if (event.target === parent) parent.hidden = true;
    };

    window.location.hash = "#caf%C3%A9";
    expect(revealed).toEqual([
      ["target", true, "until-found", "until-found"],
      ["parent", true, "until-found", false],
    ]);
    expect(target.hidden).toBe(false);
    expect(parent.hidden).toBe(true);
  } finally {
    window.close();
  }
});

it("opens a details element before revealing its hidden fragment content", async () => {
  const { window } = new JSDOM(
    '<details><summary id="summary">Title</summary><p id="target">Text</p></details>',
    { url: "https://example.test/" },
  );
  try {
    const details = window.document.querySelector("details");
    const summary = window.document.getElementById("summary");
    const target = window.document.getElementById("target");
    if (
      !(details instanceof window.HTMLDetailsElement) ||
      !(summary instanceof window.HTMLElement) ||
      !(target instanceof window.HTMLElement)
    ) {
      throw new Error("Expected disclosure elements");
    }
    const openStates: boolean[] = [];
    details.addEventListener("beforematch", () => openStates.push(details.open));
    const toggled = new Promise<void>((resolve) => {
      details.addEventListener("toggle", () => resolve(), { once: true });
    });

    window.location.hash = "summary";
    expect(details.open).toBe(false);
    details.hidden = "until-found";
    window.location.hash = "target";
    expect(openStates).toEqual([true]);
    expect(details.hidden).toBe(false);
    await toggled;
    summary.click();
    expect(details.open).toBe(false);
  } finally {
    window.close();
  }
});

it("keeps named disclosures mutually exclusive within each tree", () => {
  const { window } = new JSDOM(
    '<details name="group" open></details><details name="group" open></details>',
  );
  try {
    const [first, second] = window.document.querySelectorAll("details");
    if (
      !(first instanceof window.HTMLDetailsElement) ||
      !(second instanceof window.HTMLDetailsElement)
    )
      throw new Error("Expected details elements");

    expect([first.open, second.open]).toEqual([true, false]);
    second.open = true;
    expect([first.open, second.open]).toEqual([false, true]);

    first.name = "other";
    first.open = true;
    first.name = "group";
    expect([first.open, second.open]).toEqual([false, true]);

    const detached = window.document.createElement("div");
    detached.innerHTML = '<details name="group" open></details>';
    const incoming = detached.firstElementChild;
    if (!(incoming instanceof window.HTMLDetailsElement)) throw new Error("Expected details");
    expect(incoming.open).toBe(true);
    const body = window.document.body;
    if (!body) throw new Error("Expected a body");
    body.prepend(detached);
    expect([incoming.open, second.open]).toEqual([false, true]);
  } finally {
    window.close();
  }
});

it("coalesces parsed and scripted details changes into a ToggleEvent", async () => {
  const { window } = new JSDOM("<details open></details>");
  try {
    const details = window.document.querySelector("details");
    if (!(details instanceof window.HTMLDetailsElement)) throw new Error("Expected details");

    const toggled = new Promise<unknown>((resolve) => {
      details.addEventListener("toggle", resolve, { once: true });
    });
    details.open = false;
    const event = await toggled;
    if (!(event instanceof window.ToggleEvent)) throw new Error("Expected a ToggleEvent");
    expect([event.oldState, event.newState, event.source, event.isTrusted]).toEqual([
      "closed",
      "closed",
      null,
      true,
    ]);
  } finally {
    window.close();
  }
});

it("focuses the first summary and excludes collapsed disclosure content", () => {
  const { window } = new JSDOM(
    "<details><summary>Title</summary><summary>Extra</summary><button>Action</button></details>",
  );
  try {
    const details = window.document.querySelector("details");
    const [summary, extra] = window.document.querySelectorAll("summary");
    const button = window.document.querySelector("button");
    if (
      !(details instanceof window.HTMLDetailsElement) ||
      !(summary instanceof window.HTMLElement) ||
      !(extra instanceof window.HTMLElement) ||
      !(button instanceof window.HTMLElement)
    )
      throw new Error("Expected disclosure controls");

    expect([summary.tabIndex, extra.tabIndex]).toEqual([0, -1]);
    summary.focus();
    expect(window.document.activeElement === summary).toBe(true);
    button.focus();
    expect(window.document.activeElement === summary).toBe(true);
    details.open = true;
    button.focus();
    expect(window.document.activeElement === button).toBe(true);
  } finally {
    window.close();
  }
});

it("checks the new ancestor display when a blur handler changes focusability", () => {
  // Given: two focus targets, one inside a nested styled subtree.
  const { window } = new JSDOM(
    "<style>.hidden { display: none }</style>" +
      "<button id=first>First</button><section><div><button id=next>Next</button></div></section>",
  );
  try {
    const first = window.document.getElementById("first");
    const next = window.document.getElementById("next");
    const section = window.document.querySelector("section");
    if (!(first instanceof window.HTMLElement) || !(next instanceof window.HTMLElement) || !section)
      throw new Error("Expected both focus targets and the styled ancestor");

    // When: moving focus hides the destination during the previous target's blur.
    first.focus();
    first.addEventListener(
      "blur",
      () => {
        section.className = "hidden";
      },
      { once: true },
    );
    next.focus();

    // Then: focus stays off the destination until the ancestor is shown again.
    expect(window.document.activeElement).toBe(window.document.body);
    section.className = "";
    next.focus();
    expect(window.document.activeElement).toBe(next);
  } finally {
    window.close();
  }
});

it("uses the current viewport accessor when focusing through a media-dependent ancestor", () => {
  // Given: the native viewport matches a rule that hides a focus target's ancestor.
  const { window } = new JSDOM(
    "<style>@media (min-width: 800px) { section { display: none } }</style>" +
      "<section><div><button>Next</button></div></section>",
  );
  try {
    const button = window.document.querySelector("button");
    if (!(button instanceof window.HTMLElement)) throw new Error("Expected a focus target");
    button.focus();
    expect(window.document.activeElement).toBe(window.document.body);

    // When: a script replaces the viewport reader with a smaller width.
    let reads = 0;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      get() {
        reads++;
        return 500;
      },
    });
    button.focus();

    // Then: the rule is evaluated with the new width and the target can receive focus.
    expect(reads).toBeGreaterThan(0);
    expect(window.document.activeElement).toBe(button);
  } finally {
    window.close();
  }
});

it("supports dialog lifecycle events and cancelable close requests", async () => {
  const { window } = new JSDOM("<dialog></dialog>");
  try {
    const dialog = window.document.querySelector("dialog");
    if (!(dialog instanceof window.HTMLDialogElement)) throw new Error("Expected dialog");
    const calls: string[] = [];
    dialog.addEventListener("beforetoggle", (event) => {
      if (event instanceof window.ToggleEvent) calls.push(event.newState);
    });
    dialog.showModal();
    expect(dialog.matches(":modal")).toBe(true);
    dialog.addEventListener("cancel", (event) => event.preventDefault(), { once: true });
    dialog.requestClose("ignored");
    expect(dialog.open).toBe(true);
    expect(dialog.returnValue).toBe("");
    const closed = new Promise<boolean>((resolve) => {
      dialog.onclose = (event) => resolve(event.isTrusted);
    });
    dialog.requestClose("accepted");
    expect(dialog.open).toBe(false);
    expect(dialog.matches(":modal")).toBe(false);
    expect(dialog.returnValue).toBe("accepted");
    expect(calls).toEqual(["open", "closed"]);
    expect(await closed).toBe(true);
  } finally {
    window.close();
  }
});

it("moves and restores modal focus while keeping background elements out of focus", () => {
  const { window } = new JSDOM(
    '<button id="launch">Launch</button><button id="background">Background</button>' +
      "<dialog><button>First</button><button autofocus>Preferred</button>" +
      '<dialog id="nested"></dialog></dialog>',
  );
  try {
    const [launch, background, , preferred] = window.document.querySelectorAll("button");
    const [dialog, nested] = window.document.querySelectorAll("dialog");
    if (
      !(launch instanceof window.HTMLElement) ||
      !(background instanceof window.HTMLElement) ||
      !(dialog instanceof window.HTMLDialogElement) ||
      !(nested instanceof window.HTMLDialogElement)
    )
      throw new Error("Expected dialog controls");

    launch.focus();
    dialog.showModal();
    expect(window.document.activeElement === preferred).toBe(true);
    background.focus();
    expect(window.document.activeElement === preferred).toBe(true);
    nested.showModal();
    expect(window.document.activeElement === nested).toBe(true);
    nested.close();
    expect(window.document.activeElement === preferred).toBe(true);
    dialog.close();
    expect(window.document.activeElement === launch).toBe(true);
  } finally {
    window.close();
  }
});

it("attaches declarative shadow roots before following scripts run", () => {
  const { window } = new JSDOM(
    '<div id="host"><template shadowrootmode="OPEN" shadowrootdelegatesfocus>' +
      "<slot></slot></template><span>light</span></div>" +
      '<script>const host = document.querySelector("#host");' +
      'host.setAttribute("data-ready", String(!!host.shadowRoot))</script>',
    { runScripts: "dangerously" },
  );
  try {
    const host = window.document.getElementById("host");
    if (!host) throw new Error("Expected shadow host");
    const root = host.shadowRoot;
    expect(host.getAttribute("data-ready")).toBe("true");
    expect(host.querySelector("template")).toBeNull();
    expect(root?.delegatesFocus).toBe(true);
    expect(root?.querySelector("slot") !== null).toBe(true);
    expect(host.attachShadow({ mode: "open" }) === root).toBe(true);
    expect(root?.childNodes.length).toBe(0);
  } finally {
    window.close();
  }
});

it("opts into declarative shadow parsing with setHTMLUnsafe", () => {
  const { window } = new JSDOM("<main></main>", { runScripts: "dangerously" });
  try {
    const main = window.document.querySelector("main");
    if (!main) throw new Error("Expected a host");

    const markup =
      '<template shadowrootmode="open"><slot></slot>' +
      '<script>document.body.setAttribute("data-ran", "yes")</script></template><span>light</span>';
    main.innerHTML = markup;
    expect(main.shadowRoot).toBeNull();
    expect(main.querySelector("template") !== null).toBe(true);

    main.setHTMLUnsafe(markup);
    expect(main.shadowRoot).toBeNull();
    expect(main.querySelector("template") !== null).toBe(true);

    main.setHTMLUnsafe(`<div>${markup}</div>`);
    const host = main.querySelector("div");
    const root = host?.shadowRoot;
    if (!root) throw new Error("Expected a declarative root");
    expect(main.querySelector("template")).toBeNull();
    expect(main.querySelector("span")?.assignedSlot === root.querySelector("slot")).toBe(true);
    expect(window.document.body?.hasAttribute("data-ran")).toBe(false);
    root.setHTMLUnsafe('<div><template shadowrootmode="open"><b>nested</b></template></div>');
    expect(root.querySelector("div")?.shadowRoot?.textContent).toBe("nested");
  } finally {
    window.close();
  }
});

it("clones a clonable shadow subtree even when light children are omitted", () => {
  const { window } = new JSDOM(
    '<div id="host"><template shadowrootmode="open" shadowrootclonable shadowrootserializable>' +
      "<b>shadow</b></template><span>light</span></div>",
  );
  try {
    const host = window.document.getElementById("host");
    if (!host?.shadowRoot) throw new Error("Expected a declarative host");

    const shallow = host.cloneNode();
    expect(shallow.childNodes.length).toBe(0);
    expect(shallow.shadowRoot?.textContent).toBe("shadow");
    expect(shallow.shadowRoot?.clonable).toBe(true);
    expect(shallow.shadowRoot?.serializable).toBe(true);
    expect(shallow.shadowRoot === host.shadowRoot).toBe(false);

    const imported = window.document.importNode(host, true);
    expect(imported.querySelector("span")?.textContent).toBe("light");
    expect(imported.shadowRoot?.textContent).toBe("shadow");
    expect(imported.attachShadow({ mode: "open" }).childNodes.length).toBe(0);
    expect(host.shadowRoot.textContent).toBe("shadow");
  } finally {
    window.close();
  }
});

it("serializes opted-in shadow roots without changing innerHTML", () => {
  const { window } = new JSDOM("<main><div></div><span>light</span></main>");
  try {
    const main = window.document.querySelector("main");
    const div = main?.querySelector("div");
    if (!main || !div) throw new Error("Expected shadow hosts");
    const outer = main.attachShadow({ mode: "closed", serializable: true });
    outer.innerHTML = "<p>outer</p>";
    const inner = div.attachShadow({ mode: "open" });
    inner.innerHTML = "<b>inner</b>";

    expect(main.getHTML()).toBe(main.innerHTML);
    const serialized = main.getHTML({ serializableShadowRoots: true, shadowRoots: [inner] });
    expect(serialized).toBe(
      '<template shadowrootmode="closed" shadowrootserializable=""><p>outer</p></template>' +
        '<div><template shadowrootmode="open"><b>inner</b></template></div><span>light</span>',
    );
    expect(outer.getHTML()).toBe("<p>outer</p>");
    expect(main.innerHTML).toBe("<div></div><span>light</span>");
  } finally {
    window.close();
  }
});

it("parses inert documents with declarative shadow roots and preserves the parser opt-in", () => {
  const { window } = new JSDOM("", { url: "https://example.test/", runScripts: "dangerously" });
  try {
    const markup =
      '<div><template shadowrootmode="open"><b>shadow</b></template></div>' +
      '<script>document.body.setAttribute("data-ran", "yes")</script>';
    const doc = window.Document.parseHTMLUnsafe(markup);
    expect(doc.URL).toBe("about:blank");
    expect(doc.defaultView).toBeNull();
    expect(doc.querySelector("div")?.shadowRoot?.textContent).toBe("shadow");
    expect(doc.body?.hasAttribute("data-ran")).toBe(false);
    expect(window.document.body?.hasAttribute("data-ran")).toBe(false);

    const copy = doc.cloneNode(true);
    copy.open();
    copy.write(markup);
    copy.close();
    expect(copy.querySelector("div")?.shadowRoot?.textContent).toBe("shadow");

    const ordinary = new window.DOMParser().parseFromString("", "text/html");
    ordinary.open();
    ordinary.write(markup);
    ordinary.close();
    expect(ordinary.querySelector("div")?.shadowRoot).toBeNull();
    expect(ordinary.querySelector("template") !== null).toBe(true);
  } finally {
    window.close();
  }
});

it("matches focus-visible for programmatic and keyboard focus and text entry", () => {
  // Given two buttons and an input styled by the same focus-visible rule.
  const { window } = new JSDOM(
    "<style>:focus-visible { color: green }</style><button>a</button><button>b</button><input>",
  );
  try {
    const [first, second, input] = window.document.querySelectorAll("button, input");
    if (
      !(first instanceof window.HTMLButtonElement) ||
      !(second instanceof window.HTMLButtonElement) ||
      !(input instanceof window.HTMLInputElement)
    )
      throw new Error("Expected two buttons and an input");

    // When focus moves by script on load, the first button has a visible focus indicator.
    first.focus();
    expect(first.matches(":focus-visible")).toBe(true);
    expect(window.getComputedStyle(first).color).toBe("rgb(0, 128, 0)");

    // Then a simulated mouse click hides the indicator on a button until keyboard input.
    second.addEventListener("click", () => second.focus());
    second.click();
    expect(second.matches(":focus")).toBe(true);
    expect(second.matches(":focus-visible")).toBe(false);
    second.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(second.matches(":focus-visible")).toBe(true);

    // Text entry retains a visible indicator after a pointer interaction.
    input.addEventListener("click", () => input.focus());
    input.click();
    expect(window.document.querySelector(":focus-visible")).toBe(input);
    input.blur();
    expect(window.document.querySelector(":focus-visible")).toBeNull();
  } finally {
    window.close();
  }
});

it("inserts and replaces siblings when the arguments move adjacent nodes", () => {
  const { window } = new JSDOM("<main><i>A</i><b>B</b><em>C</em><u>D</u></main>");
  try {
    const parent = window.document.querySelector("main");
    if (!parent) throw new Error("Expected a parent");
    const [first, subject, next, last] = parent.children;
    if (!first || !subject || !next || !last) throw new Error("Expected four siblings");

    subject.before(first, "!");
    subject.after(next, "?");
    expect(parent.textContent).toBe("A!BC?D");

    subject.replaceWith(next, subject, last);
    expect(parent.textContent).toBe("A!CBD?");
    expect(subject.parentNode).toBe(parent);

    const text = window.document.createTextNode("x");
    parent.appendChild(text);
    text.replaceWith("y", "z");
    expect(parent.textContent).toBe("A!CBD?yz");
    expect(text.parentNode).toBeNull();
  } finally {
    window.close();
  }
});

it("inserts adjacent elements and literal text at case-insensitive positions", () => {
  const { window } = new JSDOM("<main><p>original</p></main>");
  try {
    const { document } = window;
    const target = document.querySelector("p");
    if (!target) throw new Error("Expected an insertion target");
    const marker = document.createElement("strong");
    marker.textContent = "marker";

    expect(target.insertAdjacentElement("BEFOREBEGIN", marker)).toBe(marker);
    target.insertAdjacentText("afterbegin", "<b>");
    target.insertAdjacentText("beforeend", "&");
    expect(target.insertAdjacentElement("AFTEREND", marker)).toBe(marker);
    expect(target.parentElement?.innerHTML).toBe(
      "<p>&lt;b&gt;original&amp;</p><strong>marker</strong>",
    );

    const detached = document.createElement("p");
    expect(detached.insertAdjacentElement("beforebegin", marker)).toBeNull();
    expect(marker.parentElement).toBe(target.parentElement);
    expect(() => detached.insertAdjacentText("around", "x")).toThrow(
      "Invalid adjacent insertion position",
    );
    const root = document.documentElement;
    if (!root) throw new Error("Expected a document root");
    expect(() => root.insertAdjacentText("beforebegin", "x")).toThrow("Invalid document children");
  } finally {
    window.close();
  }
});

it("reads Node.baseURI from the current owner document after base changes and adoption", () => {
  const origin = new JSDOM('<base href="/one/"><p class="sample">text</p>', {
    url: "https://first.example/path",
  });
  const destination = new JSDOM('<base href="/two/">', { url: "https://second.example/path" });
  try {
    const { document } = origin.window;
    const element = document.querySelector("p");
    const text = element?.firstChild;
    const attribute = element?.getAttributeNode("class");
    const base = document.querySelector("base");
    if (!element || !text || !attribute || !base) throw new Error("Expected a base and subtree");
    const fragment = document.createDocumentFragment();
    const detached = document.createAttribute("data-test");
    expect(
      [document, element, text, attribute, fragment, detached].map((node) => node.baseURI),
    ).toEqual(Array(6).fill("https://first.example/one/"));

    base.setAttribute("href", "/changed/");
    expect(attribute.baseURI).toBe("https://first.example/changed/");
    destination.window.document.adoptNode(element);
    expect([element, text, attribute].map((node) => node.baseURI)).toEqual(
      Array(3).fill("https://second.example/two/"),
    );
    expect(fragment.baseURI).toBe("https://first.example/changed/");
  } finally {
    origin.window.close();
    destination.window.close();
  }
});

it("creates HTML data and time elements with reflected string attributes", () => {
  const { window } = new JSDOM('<data value="sku-1">Widget</data><time>2025-02-01</time>');
  try {
    const data = window.document.querySelector("data");
    const time = window.document.querySelector("time");
    if (!(data instanceof window.HTMLDataElement) || !(time instanceof window.HTMLTimeElement))
      throw new Error("Expected specialized data and time elements");
    expect(data.value).toBe("sku-1");
    expect(time.dateTime).toBe("");
    data.value = "sku-2";
    time.dateTime = "invalid date";
    expect(data.getAttribute("value")).toBe("sku-2");
    expect(time.getAttribute("datetime")).toBe("invalid date");
    expect(window.document.createElement("data")).toBeInstanceOf(window.HTMLDataElement);
    expect(window.document.createElement("time")).toBeInstanceOf(window.HTMLTimeElement);
  } finally {
    window.close();
  }
});

it("reflects anchor ping URLs and canonical referrer policy keywords", () => {
  const { window } = new JSDOM('<a ping="/one /two" referrerpolicy="NO-REFERRER">Link</a>');
  try {
    const anchor = window.document.querySelector("a");
    if (!(anchor instanceof window.HTMLAnchorElement)) throw new Error("Expected an anchor");
    expect(anchor.ping).toBe("/one /two");
    expect(anchor.referrerPolicy).toBe("no-referrer");
    anchor.ping = "/other";
    anchor.referrerPolicy = "unknown";
    expect(anchor.getAttribute("ping")).toBe("/other");
    expect(anchor.getAttribute("referrerpolicy")).toBe("unknown");
    expect(anchor.referrerPolicy).toBe("");
  } finally {
    window.close();
  }
});

it("reflects HTML track metadata and exposes the initial readiness state", () => {
  const { window } = new JSDOM('<base href="/media/"><track src="en.vtt" kind="custom" default>', {
    url: "https://example.test/watch",
  });
  try {
    const track = window.document.querySelector("track");
    if (!(track instanceof window.HTMLTrackElement)) throw new Error("Expected an HTML track");
    expect(track.src).toBe("https://example.test/media/en.vtt");
    expect(track.kind).toBe("custom");
    expect(track.default).toBe(true);
    expect(track.readyState).toBe(window.HTMLTrackElement.NONE);
    expect(track.LOADED).toBe(2);
    track.default = false;
    track.srclang = "en";
    track.label = "English";
    expect(track.hasAttribute("default")).toBe(false);
    expect(track.getAttribute("srclang")).toBe("en");
    expect(track.getAttribute("label")).toBe("English");
    expect(window.document.createElement("track")).toBeInstanceOf(window.HTMLTrackElement);
  } finally {
    window.close();
  }
});

it("reflects canvas bitmap dimensions and reports unavailable rendering", () => {
  const console = new VirtualConsole();
  const errors: unknown[] = [];
  console.on("jsdomError", (error) => errors.push(error));
  const { window } = new JSDOM('<canvas width="12px" height="-1"></canvas>', {
    virtualConsole: console,
  });
  try {
    const canvas = window.document.querySelector("canvas");
    if (!(canvas instanceof window.HTMLCanvasElement)) throw new Error("Expected a canvas");
    expect([canvas.width, canvas.height]).toEqual([12, 150]);
    canvas.width = -1;
    canvas.height = 50.9;
    expect([canvas.getAttribute("width"), canvas.getAttribute("height")]).toEqual(["300", "50"]);
    expect(canvas.getContext("2d")).toBeNull();
    expect(canvas.toDataURL()).toBeNull();
    canvas.toBlob(() => {
      throw new Error("Unexpected canvas output");
    });
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatchObject({ type: "not-implemented" });
  } finally {
    window.close();
  }
});

it("exposes the media element hierarchy and browser-facing fallback state", async () => {
  const { window } = new JSDOM(
    '<base href="/media/"><video src="clip.mp4" width="240" muted playsinline>',
    {
      url: "https://example.test/",
    },
  );
  try {
    const video = window.document.querySelector("video");
    if (!(video instanceof window.HTMLVideoElement)) throw new Error("Expected a video element");
    expect(video).toBeInstanceOf(window.HTMLMediaElement);
    expect([video.src, video.width, video.defaultMuted, video.playsInline]).toEqual([
      "https://example.test/media/clip.mp4",
      240,
      true,
      true,
    ]);
    expect([video.paused, video.muted, video.readyState, video.buffered.length]).toEqual([
      true,
      false,
      video.HAVE_NOTHING,
      0,
    ]);
    const audio = new window.Audio("song.mp3");
    expect(audio).toBeInstanceOf(window.HTMLAudioElement);
    expect([audio.preload, audio.getAttribute("src")]).toEqual(["auto", "song.mp3"]);
    const change = new Promise<void>((resolve) =>
      video.addEventListener("volumechange", () => resolve()),
    );
    video.volume = 0.5;
    await change;
    expect(video.volume).toBe(0.5);
    video.crossOrigin = "anonymous";
    Reflect.set(video, "crossOrigin", undefined);
    expect(video.crossOrigin).toBeNull();
    expect(video.hasAttribute("crossorigin")).toBe(false);
  } finally {
    window.close();
  }
});

it("reflects referrer policy on images, frames and image-map links", () => {
  const { window } = new JSDOM(
    '<img referrerpolicy="ORIGIN"><iframe referrerpolicy="ORIGIN"></iframe>' +
      '<map><area referrerpolicy="ORIGIN" ping="/one /two" download="map.svg" hreflang="en" type="image/svg+xml"></map>',
  );
  try {
    const image = window.document.querySelector("img");
    const frame = window.document.querySelector("iframe");
    const area = window.document.querySelector("area");
    if (
      !(image instanceof window.HTMLImageElement) ||
      !(frame instanceof window.HTMLIFrameElement) ||
      !(area instanceof window.HTMLAreaElement)
    )
      throw new Error("Expected an image, frame and area");
    for (const element of [image, frame, area]) {
      expect(element.referrerPolicy).toBe("origin");
      element.referrerPolicy = "unknown";
      expect(element.getAttribute("referrerpolicy")).toBe("unknown");
      expect(element.referrerPolicy).toBe("");
    }
    expect([area.ping, area.download, area.hreflang, area.type]).toEqual([
      "/one /two",
      "map.svg",
      "en",
      "image/svg+xml",
    ]);
    area.download = "updated.svg";
    expect(area.getAttribute("download")).toBe("updated.svg");
  } finally {
    window.close();
  }
});

it("reflects image decoding and embedded loading keywords", () => {
  const { window } = new JSDOM(
    '<img decoding="ASYNC"><iframe></iframe><video loading="LAZY"></video>',
  );
  try {
    const image = window.document.querySelector("img");
    const frame = window.document.querySelector("iframe");
    const video = window.document.querySelector("video");
    if (
      !(image instanceof window.HTMLImageElement) ||
      !(frame instanceof window.HTMLIFrameElement) ||
      !(video instanceof window.HTMLVideoElement)
    )
      throw new Error("Expected image, frame and video elements");
    expect(image.decoding).toBe("async");
    image.decoding = "unknown";
    expect(image.getAttribute("decoding")).toBe("unknown");
    expect(image.decoding).toBe("auto");
    expect([image.loading, frame.loading, video.loading]).toEqual(["eager", "eager", "lazy"]);
    frame.loading = "LAZY";
    expect(frame.getAttribute("loading")).toBe("LAZY");
    expect(frame.loading).toBe("lazy");
  } finally {
    window.close();
  }
});

it("exposes forgiving base64 conversion with Window-local exceptions", () => {
  const { window } = new JSDOM("", { runScripts: "outside-only" });
  try {
    const { atob, btoa } = window;
    expect(btoa("é\x00")).toBe("6QA=");
    expect(atob(" 6Q\nA ")).toBe("é\x00");
    expect(window.eval('atob(btoa("test"))')).toBe("test");
    expect(() => atob("_")).toThrow(window.DOMException);
    expect(() => btoa("λ")).toThrow("The string to be encoded contains invalid characters.");
  } finally {
    window.close();
  }
});

it("installs global event handlers on their Web IDL interfaces", () => {
  // Given a scripted document with HTML and SVG elements.
  const { window } = new JSDOM("<button></button><svg></svg>", { runScripts: "dangerously" });
  try {
    const button = window.document.querySelector("button");
    if (!button) throw new Error("Missing button");
    // When a prefixed handler is set through markup and an event is dispatched.
    button.setAttribute("onwebkitanimationend", "this.textContent = 'ran'");
    button.dispatchEvent(new window.Event("webkitAnimationEnd"));
    // Then the handler runs and the property is exposed on each intended interface.
    expect(button.textContent).toBe("ran");
    for (const target of [
      window,
      window.HTMLElement.prototype,
      window.SVGElement.prototype,
      window.Document.prototype,
    ]) {
      expect(Object.hasOwn(target, "onkeydown")).toBe(true);
      expect(Object.hasOwn(target, "onclick")).toBe(true);
    }
    expect("onclick" in window.Element.prototype).toBe(false);

    let observed = false;
    window.document.onkeydown = () => {
      observed = true;
      return false;
    };
    expect(window.document.dispatchEvent(new window.Event("keydown", { cancelable: true }))).toBe(
      false,
    );
    expect(observed).toBe(true);
  } finally {
    window.close();
  }
});

it("resolves computed box shadow colors and normalizes shadow lists", () => {
  // Given an inset shadow using currentColor and a second shadow with no explicit color.
  const { window } = new JSDOM(
    '<p style="color: red; box-shadow: inset 1px 2px currentColor, 0 2px"></p>',
  );
  try {
    const paragraph = window.document.querySelector("p");
    if (!(paragraph instanceof window.HTMLElement)) throw new Error("Missing paragraph");

    // When the computed style is read, both shadows use the element color and absolute offsets.
    expect(window.getComputedStyle(paragraph).getPropertyValue("box-shadow")).toBe(
      "rgb(255, 0, 0) 1px 2px 0px 0px inset, rgb(255, 0, 0) 0px 2px 0px 0px",
    );

    // The authored declaration retains its original tokens.
    expect(paragraph.style.getPropertyValue("box-shadow")).toBe(
      "inset 1px 2px currentColor, 0 2px",
    );
  } finally {
    window.close();
  }
});

it("cascades logical and physical border colors as pairs in the element writing mode", () => {
  // Given an RTL writing context and declarations with different source order and importance.
  const { window } = new JSDOM(`
    <style>
      #first { border-right-color: red; border-inline-start-color: blue }
      #second { border-inline-start-color: blue; border-right-color: red }
      #third { writing-mode: vertical-rl; border-right-color: red !important; border-block-start-color: blue }
    </style>
    <main dir="rtl">
      <div id="first"></div><div id="second"></div><div id="third"></div>
      <div id="inline" style="border-right-color: red; border-inline-start-color: blue"></div>
    </main>
  `);
  try {
    // When the logical and physical values are read, each pair exposes the same winning color.
    for (const [id, logical, expected] of [
      ["first", "border-inline-start-color", "rgb(0, 0, 255)"],
      ["second", "border-inline-start-color", "rgb(255, 0, 0)"],
      ["third", "border-block-start-color", "rgb(255, 0, 0)"],
      ["inline", "border-inline-start-color", "rgb(0, 0, 255)"],
    ] as const) {
      const element = window.document.getElementById(id);
      if (!element) throw new Error("Missing styled element");
      const style = window.getComputedStyle(element);
      expect(style.getPropertyValue(logical)).toBe(expected);
      expect(style.getPropertyValue("border-right-color")).toBe(expected);
    }
  } finally {
    window.close();
  }
});

it("expands logical border color shorthands into the computed cascade", () => {
  // Given a two-color shorthand, a later competing physical longhand, and a variable pair.
  const { window } = new JSDOM(
    '<p dir="rtl" style="border-inline-color: red blue; border-right-color: green; ' +
      '--edges: purple orange; border-block-color: var(--edges)"></p>',
  );
  try {
    const paragraph = window.document.querySelector("p");
    if (!paragraph) throw new Error("Missing paragraph");

    // When computed, each shorthand contributes both edges and respects the later declaration.
    const style = window.getComputedStyle(paragraph);
    expect(style.getPropertyValue("border-inline-color")).toBe("rgb(0, 128, 0) rgb(0, 0, 255)");
    expect(style.getPropertyValue("border-right-color")).toBe("rgb(0, 128, 0)");
    expect(style.getPropertyValue("border-left-color")).toBe("rgb(0, 0, 255)");
    expect(style.getPropertyValue("border-block-color")).toBe("rgb(128, 0, 128) rgb(255, 165, 0)");
  } finally {
    window.close();
  }
});

it("keeps stylesheet rules and declarations independent for identical markup", () => {
  // Given two Windows with the same stylesheet source.
  const markup = "<style>main p { color: red }</style><main><p>example</p></main>";
  const first = new JSDOM(markup);
  const second = new JSDOM(markup);
  try {
    const rule = first.window.document.styleSheets.item(0)?.cssRules[0];
    const firstParagraph = first.window.document.querySelector("p");
    const secondParagraph = second.window.document.querySelector("p");
    if (!(rule instanceof first.window.CSSStyleRule) || !firstParagraph || !secondParagraph)
      throw new Error("Missing stylesheet fixture");

    // When a caller edits the first Window's CSSOM.
    rule.style.setProperty("color", "blue");
    expect(first.window.getComputedStyle(firstParagraph).color).toBe("rgb(0, 0, 255)");
    rule.selectorText = "main div";

    // Then its edits do not change the other Window or a subsequent parse of the same input.
    expect(second.window.getComputedStyle(secondParagraph).color).toBe("rgb(255, 0, 0)");
    const fresh = new JSDOM(markup);
    try {
      const paragraph = fresh.window.document.querySelector("p");
      if (!paragraph) throw new Error("Missing fresh paragraph");
      expect(fresh.window.getComputedStyle(paragraph).color).toBe("rgb(255, 0, 0)");
    } finally {
      fresh.window.close();
    }
  } finally {
    first.window.close();
    second.window.close();
  }
});

it("keeps repeated HTML documents and template contents independent", () => {
  // Given repeated markup with document mode, foreign content, and an inert subtree.
  const markup = "<!doctype html><template><svg><text>original</text></svg></template>";
  const first = new JSDOM(markup);
  const second = new JSDOM(markup);
  const third = new JSDOM(markup);
  const located = new JSDOM(markup, { includeNodeLocations: true });
  try {
    const template = (dom: typeof first) => {
      const node = dom.window.document.querySelector("template");
      if (!(node instanceof dom.window.HTMLTemplateElement)) throw new Error("Expected template");
      return node;
    };
    // When a previously created document is mutated.
    template(second).content.querySelector("text")?.replaceChildren("changed");

    // Then subsequent documents retain their own tree, mode, and requested source locations.
    expect(template(first).content.querySelector("text")?.textContent).toBe("original");
    expect(template(third).content.querySelector("text")?.textContent).toBe("original");
    expect(template(third).content.querySelector("svg")?.namespaceURI).toBe(
      "http://www.w3.org/2000/svg",
    );
    expect(third.window.document.compatMode).toBe("CSS1Compat");
    expect(located.nodeLocation(template(located))?.startOffset).toBe(15);
  } finally {
    for (const dom of [first, second, third, located]) dom.window.close();
  }
});

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom 31.0.1", Constructor: reference },
])("$name reflected token lists", ({ Constructor }) => {
  it("reflects link relationships and output control IDs through stable live lists", () => {
    // Given elements whose reflected attributes contain repeated tokens.
    const { window } = new Constructor('<link rel="alternate alternate"><output for="a a b">');
    try {
      const link = window.document.querySelector("link");
      const output = window.document.querySelector("output");
      if (
        !(link instanceof window.HTMLLinkElement) ||
        !(output instanceof window.HTMLOutputElement)
      )
        throw new Error("Expected link and output elements");

      // When the output list is edited and the link's attribute is assigned through its list.
      const relationships = link.relList;
      const controls = output.htmlFor;
      expect([...relationships]).toEqual(["alternate"]);
      expect([...controls]).toEqual(["a", "b"]);
      link.relList = "stylesheet preload";
      controls.remove("a");
      output.setAttribute("for", "c d");

      // Then retained lists reflect the attributes and expose the supported-token contract.
      expect(link.relList).toBe(relationships);
      expect(link.rel).toBe("stylesheet preload");
      expect(relationships.supports("StyleSheet")).toBe(true);
      expect(relationships.supports("preload")).toBe(false);
      expect(output.htmlFor).toBe(controls);
      expect([...controls]).toEqual(["c", "d"]);
      output.htmlFor = "e f";
      expect(output.getAttribute("for")).toBe("e f");
    } finally {
      window.close();
    }
  });
});

it("reflects link icon sizes through a live token list", () => {
  // Given a link with repeated icon sizes.
  const { window } = new JSDOM('<link rel="icon" sizes="16x16 16x16 32x32">');
  try {
    const link = window.document.querySelector("link");
    if (!(link instanceof window.HTMLLinkElement)) throw new Error("Expected a link");
    const sizes = link.sizes;
    expect([...sizes]).toEqual(["16x16", "32x32"]);

    // When the list and then the property are assigned.
    sizes.add("any");
    expect(link.getAttribute("sizes")).toBe("16x16 32x32 any");
    link.sizes = "48x48";

    // Then the retained list reads the new content attribute.
    expect(link.sizes).toBe(sizes);
    expect(sizes.value).toBe("48x48");
    expect(() => sizes.supports("any")).toThrow("has no supported tokens");
  } finally {
    window.close();
  }
});

it("treats numeric keys beyond the array-index range as ordinary token-list properties", () => {
  // Given an indexed token list.
  const { window } = new JSDOM('<p class="example">');
  try {
    const list = window.document.body?.firstElementChild?.classList;
    if (!list) throw new Error("Expected a token list");

    // When writes straddle the upper index boundary.
    expect(Reflect.set(list, "4294967294", "reserved")).toBe(false);
    expect(Reflect.set(list, "4294967295", "expando")).toBe(true);

    // Then the expando is visible independently of the tokens.
    expect(Reflect.get(list, "4294967295")).toBe("expando");
    expect([...list]).toEqual(["example"]);
    expect(Reflect.deleteProperty(list, "4294967295")).toBe(true);
  } finally {
    window.close();
  }
});

it("reflects the legacy marquee interface with jsdom's unsigned defaults", () => {
  // Given a marquee parsed with both string and numeric attributes.
  const { window } = new JSDOM('<marquee bgcolor="red" scrollamount=" +12px"></marquee>');
  try {
    const marquee = window.document.querySelector("marquee");
    if (!(marquee instanceof window.HTMLMarqueeElement)) throw new Error("Expected a marquee");
    expect(marquee.bgColor).toBe("red");
    expect(marquee.scrollAmount).toBe(12);
    expect(marquee.scrollDelay).toBe(0);

    // When reflected values are assigned through the legacy interface.
    marquee.scrollDelay = -1;
    marquee.hspace = 4294967297;
    marquee.trueSpeed = true;
    marquee.direction = "right";

    // Then the underlying attributes reflect the converted values.
    expect(marquee.getAttribute("scrolldelay")).toBe("0");
    expect(marquee.getAttribute("hspace")).toBe("1");
    expect(marquee.hasAttribute("truespeed")).toBe(true);
    expect(marquee.getAttribute("direction")).toBe("right");
    expect(window.document.createElement("marquee")).toBeInstanceOf(window.HTMLMarqueeElement);
  } finally {
    window.close();
  }
});

it("exposes the legacy XPathException error factory and constants", () => {
  // Given a Window using the legacy XPath exception factory directly.
  const { window } = new JSDOM();
  try {
    const Exception = window.XPathException;
    const error = new Exception(Exception.INVALID_EXPRESSION_ERR, "Bad expression");

    // Then it returns an ordinary Error with the legacy name and code.
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(Exception);
    expect(error).toMatchObject({ name: "XPathException", message: "Bad expression", code: 51 });
    expect(Exception(Exception.TYPE_ERR, "Bad type").code).toBe(52);
    expect(Object.getOwnPropertyDescriptor(window, "XPathException")).toMatchObject({
      value: Exception,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } finally {
    window.close();
  }
});

it("replaces innerText with text and line-break nodes and updates attached styles", () => {
  // Given a regular HTML element and an attached stylesheet.
  const { window } = new JSDOM("<div><em>old</em></div><style></style>");
  try {
    const block = window.document.querySelector("div");
    const style = window.document.querySelector("style");
    if (!(block instanceof window.HTMLElement) || !(style instanceof window.HTMLStyleElement))
      throw new Error("Expected HTML elements");

    // When callers assign literal text, mixed line breaks, and CSS.
    block.innerText = "first\r\n<second>\r";
    style.innerText = "div { color: red; }";

    // Then markup is escaped, line breaks are elements, and the stylesheet is reparsed.
    expect(block.innerHTML).toBe("first<br>&lt;second&gt;<br>");
    expect(style.sheet?.cssRules.length).toBe(1);
    expect(window.getComputedStyle(block).color).toBe("rgb(255, 0, 0)");
    block.innerText = null;
    expect(block.childNodes.length).toBe(0);
  } finally {
    window.close();
  }
});

it("replaces outerText and merges only its immediate text neighbors", () => {
  // Given adjacent text nodes on either side of an element.
  const { window } = new JSDOM("<div></div>");
  try {
    const parent = window.document.querySelector("div");
    if (!parent) throw new Error("Expected a parent");
    const child = window.document.createElement("span");
    if (!(child instanceof window.HTMLElement)) throw new Error("Expected an HTML element");
    parent.append("1", "2", child, "3", "4");

    // When an empty outerText replaces the element.
    child.outerText = "";

    // Then only the nearest text nodes merge and the removed element cannot be replaced again.
    expect(Array.from(parent.childNodes, (node) => node?.textContent)).toEqual(["1", "23", "4"]);
    expect(() => (child.outerText = "detached")).toThrow("parent");
  } finally {
    window.close();
  }
});

describe("HTMLOrSVGElement.nonce", () => {
  it("reflects the nonce attribute on HTML and SVG elements", () => {
    // Given HTML and SVG elements with independently parsed nonce attributes
    const { window } = new JSDOM('<script nonce="html"></script><svg nonce="svg"></svg>');
    try {
      for (const [prototype, name, value] of [
        [window.HTMLElement.prototype, "script", "html"],
        [window.SVGElement.prototype, "svg", "svg"],
      ] as const) {
        const node = window.document.querySelector(name);
        const nonce = Object.getOwnPropertyDescriptor(prototype, "nonce");
        // When reading and writing through the reflected property
        expect(nonce?.enumerable).toBe(true);
        expect(nonce?.get?.call(node)).toBe(value);
        nonce?.set?.call(node, null);
        // Then the attribute contains the converted DOMString
        expect(node?.getAttribute("nonce")).toBe("null");
        node?.removeAttribute("nonce");
        expect(nonce?.get?.call(node)).toBe("");
      }
    } finally {
      window.close();
    }
  });

  it("delivers the custom element reaction after the nonce setter returns", async () => {
    // Given a custom element observing nonce
    const { window } = new JSDOM();
    try {
      const observed: unknown[][] = [];
      class NonceElement extends window.HTMLElement {
        static observedAttributes = ["nonce"];
        attributeChangedCallback(...args: unknown[]) {
          observed.push(args);
        }
      }
      window.customElements.define("nonce-element", NonceElement);
      const node = window.document.createElement("nonce-element");
      // When writing the nonce property
      const nonce = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "nonce");
      nonce?.set?.call(node, "token");
      expect(node.getAttribute("nonce")).toBe("token");
      // Then the callback runs at a microtask checkpoint
      expect(observed).toEqual([]);
      await Promise.resolve();
      expect(observed).toEqual([["nonce", null, "token", null]]);
      nonce?.set?.call(node, "pending");
      node.setAttribute("nonce", "explicit");
      expect(observed.slice(1)).toEqual([
        ["nonce", "token", "pending", null],
        ["nonce", "pending", "explicit", null],
      ]);
      await Promise.resolve();
      expect(observed).toHaveLength(3);
    } finally {
      window.close();
    }
  });
});

describe("Element.webkitMatchesSelector", () => {
  it("matches selectors independently of a replacement matches method", () => {
    // Given an element with a matching attribute and a shadowed matches method
    const { window } = new JSDOM("<main data-ready></main>");
    try {
      const node = window.document.querySelector("main");
      if (!node) throw new Error("Expected the fixture element");
      node.matches = () => false;
      // When the historical alias is called, it still evaluates the selector
      expect(node.webkitMatchesSelector("main[data-ready]")).toBe(true);
      expect(node.webkitMatchesSelector("main[data-pending]")).toBe(false);
      // Then missing arguments and invalid selectors raise the appropriate exceptions
      expect(() => Reflect.apply(node.webkitMatchesSelector, node, [])).toThrow(
        "1 argument required",
      );
      expect(() => node.webkitMatchesSelector("[")).toThrow(
        expect.objectContaining({ name: "SyntaxError" }),
      );
    } finally {
      window.close();
    }
  });
});

describe("DOMTokenList iterable interface", () => {
  it.each([undefined, "outside-only"] as const)(
    "installs the realm's Array iteration methods before the parser runs (%s)",
    (runScripts) => {
      // Given a fresh realm with no token list instances
      const dom = new JSDOM('<p class="first second">', {
        ...(runScripts === undefined ? {} : { runScripts }),
        beforeParse(window) {
          // When inspecting the interface during initialization
          const prototype = window.DOMTokenList.prototype;
          const array = Reflect.get(window, "Array") as ArrayConstructor;
          // Then its own iterator methods already have the right identity and descriptors
          for (const key of ["keys", "values", "entries", "forEach", Symbol.iterator] as const) {
            const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
            expect(descriptor?.value).toBe(array.prototype[key]);
            expect(descriptor?.enumerable).toBe(typeof key === "string");
          }
        },
      });
      try {
        const node = dom.window.document.querySelector("p");
        if (!node) throw new Error("Expected the fixture element");
        expect([...node.classList]).toEqual(["first", "second"]);
      } finally {
        dom.window.close();
      }
    },
  );
});

describe("SVGElement focus", () => {
  it("shares document focus with HTML and skips SVG definitions", () => {
    // Given an HTML control, a rendered SVG shape, and a shape in a definition
    const { window } = new JSDOM(
      '<input><svg><a href="#target"></a><rect id="target"/><defs><rect id="hidden"/></defs></svg>',
    );
    try {
      const input = window.document.querySelector("input");
      const anchor = window.document.querySelector("svg a");
      const target = window.document.getElementById("target");
      const hidden = window.document.getElementById("hidden");
      if (
        !(input instanceof window.HTMLInputElement) ||
        !(anchor instanceof window.SVGElement) ||
        !(target instanceof window.SVGElement) ||
        !(hidden instanceof window.SVGElement)
      )
        throw new Error("Expected focus fixtures");
      expect(anchor.tabIndex).toBe(0);
      expect(target.tabIndex).toBe(-1);
      target.tabIndex = -1;
      hidden.tabIndex = 0;
      expect(target.getAttribute("tabindex")).toBe("-1");
      const related: unknown[] = [];
      target.addEventListener("focus", (event) => {
        if (event instanceof window.FocusEvent) related.push(event.relatedTarget);
      });
      input.focus();

      // When focusing the rendered SVG shape and then the hidden definition
      target.focus();
      hidden.focus();

      // Then focus moves from HTML to the rendered SVG element and can be cleared
      expect(window.document.activeElement === target).toBe(true);
      expect(related.length).toBe(1);
      expect(related[0] === input).toBe(true);
      target.blur();
      expect(window.document.activeElement === window.document.body).toBe(true);
    } finally {
      window.close();
    }
  });
});

describe("SVG document scripts", () => {
  it("executes inline, href, and xlink scripts in document order", async () => {
    // Given a standalone SVG document containing all three classic script sources
    const { window } = new JSDOM(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        '<script><![CDATA[window.steps = ["inline"];]]></script>' +
        '<script href="data:text/javascript,steps.push(%22href%22)" xlink:href="data:text/javascript,steps.push(%22wrong%22)"/>' +
        '<script xlink:href="data:text/javascript,steps.push(%22xlink%22)"/>' +
        '<script>steps.push("after")</script>' +
        '<script type="application/json">steps.push("wrong")</script>' +
        '<script xmlns="urn:foreign">steps.push("wrong")</script>' +
        "</svg>",
      { contentType: "image/svg+xml", runScripts: "dangerously", resources: "usable" },
    );
    try {
      // When the resource queue completes
      await new Promise<void>((resolve) =>
        window.addEventListener("load", () => resolve(), { once: true }),
      );
      // Then namespace and MIME checks preserve execution order and href precedence
      expect(Reflect.get(window, "steps")).toEqual(["inline", "href", "xlink", "after"]);
    } finally {
      window.close();
    }
  });

  it.each([undefined, "outside-only"] as const)(
    "keeps SVG scripts inactive in %s mode",
    (runScripts) => {
      // Given a scripting mode that does not execute document scripts
      const { window } = new JSDOM(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>window.executed = true</script></svg>',
        { contentType: "image/svg+xml", ...(runScripts ? { runScripts } : {}) },
      );
      try {
        // Then parsing leaves the script unexecuted
        expect(Reflect.get(window, "executed")).toBeUndefined();
      } finally {
        window.close();
      }
    },
  );
});

it("executes an inserted SVG script once and keeps fragment scripts inert", () => {
  // Given an active SVG document
  const { window } = new JSDOM('<svg xmlns="http://www.w3.org/2000/svg"/>', {
    contentType: "image/svg+xml",
    runScripts: "dangerously",
  });
  try {
    const root = window.document.documentElement;
    if (!root) throw new Error("Expected an SVG root");
    const script = window.document.createElementNS("http://www.w3.org/2000/svg", "script");
    script.textContent = "window.runs = (window.runs || 0) + 1";
    // When a script created by DOM APIs is inserted twice
    root.appendChild(script);
    script.remove();
    root.appendChild(script);
    expect(Reflect.get(window, "runs")).toBe(1);

    // Then fragment parsing preserves the inert state after later insertion
    root.innerHTML = '<s:script xmlns:s="http://www.w3.org/2000/svg">window.runs++</s:script>';
    const inert = root.firstElementChild;
    if (!inert) throw new Error("Expected an inert SVG script");
    inert.remove();
    root.appendChild(inert);
    expect(Reflect.get(window, "runs")).toBe(1);
  } finally {
    window.close();
  }
});

it("runs SVG scripts embedded in HTML before subsequent parser scripts", async () => {
  // Given SVG inline and external scripts followed by a classic HTML script
  const { window } = new JSDOM(
    '<svg><script>window.steps = ["svg"]</script>' +
      '<script href="data:text/javascript,steps.push(%22external%22)"></script>' +
      '<script>steps.push("svg-after")</script></svg>' +
      '<script>steps.push("html")</script>',
    { runScripts: "dangerously", resources: "usable" },
  );
  try {
    // When the document load completes
    await new Promise<void>((resolve) =>
      window.addEventListener("load", () => resolve(), { once: true }),
    );
    // Then parser execution preserves order across both namespaces
    expect(Reflect.get(window, "steps")).toEqual(["svg", "external", "svg-after", "html"]);
  } finally {
    window.close();
  }
});

it("focuses the SVG document root and prefixed HTML controls in SVG documents", () => {
  // Given a standalone SVG document with HTML elements using qualified names
  const { window } = new JSDOM(
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:h="http://www.w3.org/1999/xhtml">' +
      '<h:iframe/><h:audio controls=""/><h:video controls=""/></svg>',
    { contentType: "image/svg+xml" },
  );
  try {
    const root = window.document.documentElement;
    if (!(root instanceof window.SVGElement)) throw new Error("Expected an SVG root");
    // When focus moves through the root and each embedded control
    root.focus();
    expect(window.document.activeElement === root).toBe(true);
    for (const name of ["iframe", "audio", "video"]) {
      const node = window.document.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", name)[0];
      if (!(node instanceof window.HTMLElement)) throw new Error("Expected an HTML control");
      node.focus();
      // Then namespace prefixes do not prevent the element receiving focus
      expect(window.document.activeElement === node).toBe(true);
    }
  } finally {
    window.close();
  }
});
