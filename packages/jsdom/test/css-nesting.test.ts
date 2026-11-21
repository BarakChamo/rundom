// Pins ordered CSS nesting graphs, live CSSOM edits and cascade behavior through the public facade.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = require("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name CSS nesting rule tree", ({ Constructor }) => {
  it("preserves leading declarations and ordered trailing declaration runs", () => {
    // Given: nested rules split the surrounding declarations into distinct CSSOM blocks.
    const { window: w } = new Constructor();
    try {
      const sheet = new w.CSSStyleSheet();
      sheet.replaceSync('.a { color:red; .b { content:"}"; color:blue } --x:2; & {--y:3} --z:4; }');
      const outer = sheet.cssRules[0];
      if (!(outer instanceof w.CSSStyleRule)) throw new Error("Expected style rule");
      // When/Then: source order and declaration ownership remain observable through live rules.
      expect(outer instanceof w.CSSGroupingRule).toBe(true);
      expect(outer.style.cssText).toBe("color: red;");
      expect(outer.cssRules.length).toBe(4);
      expect(Array.from(outer.cssRules, (rule) => rule?.cssText)).toEqual([
        '& .b { content: "}"; color: blue; }',
        "--x: 2;",
        "& { --y: 3; }",
        "--z: 4;",
      ]);
      const trailing = outer.cssRules[1];
      expect(trailing instanceof w.CSSNestedDeclarations).toBe(true);
      expect(trailing?.parentRule).toBe(outer);
      expect(trailing?.parentStyleSheet).toBe(sheet);
      expect(outer.cssText).toBe(
        '.a {\n  color: red;\n  & .b { content: "}"; color: blue; }\n  --x: 2;\n  & { --y: 3; }\n  --z: 4;\n}',
      );
    } finally {
      w.close();
    }
  });

  it.each([
    ["> .bar", "& > .bar"],
    [".bar", "& .bar"],
    [".x, .y &", "& .x, .y &"],
    ["div&", "div&"],
    ["&&", "&&"],
    [":is(.bar, &.baz)", ":is(.bar, &.baz)"],
  ])("normalizes nested selector %s without changing its meaning", (selector, expected) => {
    // Given: implicit relative selectors and explicit nesting references share one grammar.
    const { window: w } = new Constructor();
    try {
      const sheet = new w.CSSStyleSheet();
      sheet.replaceSync(`.a { ${selector} { color:red; } }`);
      const outer = sheet.cssRules[0];
      if (!(outer instanceof w.CSSStyleRule)) throw new Error("Expected style rule");
      const child = outer.cssRules[0];
      if (!(child instanceof w.CSSStyleRule)) throw new Error("Expected nested style rule");
      // When/Then: CSSOM exposes the absolutized selector while preserving string tokens.
      expect(child.selectorText).toBe(expected);
    } finally {
      w.close();
    }
  });

  it("drops invalid nested type ordering and preserves later valid siblings", () => {
    // Given: an invalid child must not discard its valid parent, sibling or trailing declarations.
    const { window: w } = new Constructor();
    try {
      const sheet = new w.CSSStyleSheet();
      sheet.replaceSync(".a { &div {} .b { color:blue } --x:2; }");
      const outer = sheet.cssRules[0];
      if (!(outer instanceof w.CSSStyleRule)) throw new Error("Expected style rule");
      // When/Then: only the invalid nested rule disappears.
      expect(Array.from(outer.cssRules, (rule) => rule?.cssText)).toEqual([
        "& .b { color: blue; }",
        "--x: 2;",
      ]);
    } finally {
      w.close();
    }
  });

  it("preserves declaration runs inside nested groups and stable child lists", () => {
    // Given: a nested group has declarations before and after its child style rule.
    const { window: w } = new Constructor();
    try {
      const sheet = new w.CSSStyleSheet();
      sheet.replaceSync(".a { @media screen { color:red; .b{color:blue} color:green; } }");
      const outer = sheet.cssRules[0];
      if (!(outer instanceof w.CSSStyleRule)) throw new Error("Expected style rule");
      const media = outer.cssRules[0];
      if (!(media instanceof w.CSSMediaRule)) throw new Error("Expected media rule");
      const list = media.cssRules;
      // When/Then: inserting a declaration block changes the same list with correct parents.
      expect(Array.from(list, (rule) => rule?.cssText)).toEqual([
        "color: red;",
        "& .b { color: blue; }",
        "color: green;",
      ]);
      expect(media.insertRule("--extra:4;", 1)).toBe(1);
      expect(media.cssRules).toBe(list);
      expect(list.length).toBe(4);
      expect(list[1]?.parentRule).toBe(media);
      expect(list[1]?.parentStyleSheet).toBe(sheet);
      media.deleteRule(1);
      expect(list.length).toBe(3);
      expect(media.cssText).toBe(
        "@media screen {\n  color: red;\n  & .b { color: blue; }\n  color: green;\n}",
      );
    } finally {
      w.close();
    }
  });

  it("supports PutForwards style edits without replacing nested rules", () => {
    // Given: styles and nested rule lists have independent stable identities.
    const { window: w } = new Constructor();
    try {
      const sheet = new w.CSSStyleSheet();
      sheet.replaceSync(".a{color:red; & {} left:1px; & {} right:2px;}");
      const outer = sheet.cssRules[0];
      if (!(outer instanceof w.CSSStyleRule)) throw new Error("Expected style rule");
      const style = outer.style,
        list = outer.cssRules;
      outer.style = "color:blue; &.ignored { color:green; }";
      // When/Then: style assignment forwards to cssText and cannot inject rules.
      expect(outer.style).toBe(style);
      expect(style.color).toBe("blue");
      expect(outer.cssRules).toBe(list);
      expect(list.length).toBe(4);
      for (const child of list)
        if (child instanceof w.CSSStyleRule || child instanceof w.CSSNestedDeclarations)
          child.style = "";
      expect(outer.cssText).toBe(".a {\n  color: blue;\n  & { }\n  & { }\n}");
    } finally {
      w.close();
    }
  });

  it("leaves live rule graphs unchanged after invalid CSSOM operations", () => {
    // Given: a nested list has one valid style rule.
    const { window: w } = new Constructor();
    try {
      const sheet = new w.CSSStyleSheet();
      sheet.replaceSync(".a{.b{color:red}}");
      const outer = sheet.cssRules[0];
      if (!(outer instanceof w.CSSStyleRule)) throw new Error("Expected style rule");
      const original = outer.cssText,
        child = outer.cssRules[0];
      // When/Then: invalid indices, grammar and hierarchy never partially edit the graph.
      for (const operation of [() => outer.insertRule(".x{}", 2), () => outer.deleteRule(9)])
        expect(operation).toThrow(expect.objectContaining({ name: "IndexSizeError" }));
      for (const text of ["", "not-a-property:bad;"])
        expect(() => outer.insertRule(text)).toThrow(
          expect.objectContaining({ name: "SyntaxError" }),
        );
      expect(() => outer.insertRule('@import "a.css";')).toThrow(
        expect.objectContaining({ name: "HierarchyRequestError" }),
      );
      expect(outer.cssText).toBe(original);
      expect(outer.cssRules[0]).toBe(child);
      const top = new w.CSSStyleSheet();
      top.replaceSync("@media screen{}");
      const media = top.cssRules[0];
      if (!(media instanceof w.CSSMediaRule)) throw new Error("Expected media rule");
      expect(() => media.insertRule("color:red;")).toThrow(
        expect.objectContaining({ name: "SyntaxError" }),
      );
    } finally {
      w.close();
    }
  });
});

describe("RunDOM nesting cascade", () => {
  it("keeps nested selector bindings live after parent and child edits", () => {
    // Given: child selectors refer to a parent whose selector will change through CSSOM.
    const { window: w } = new JSDOM(
      '<style>.a { & {color:red} > span {color:blue} }</style><main class="b"><span>child</span></main>',
    );
    try {
      const node = w.document.querySelector("main"),
        child = w.document.querySelector("span"),
        outer = w.document.styleSheets[0]?.cssRules[0];
      if (!node || !child || !(outer instanceof w.CSSStyleRule))
        throw new Error("Expected nesting fixture");
      expect(w.getComputedStyle(node).color).not.toBe("rgb(255, 0, 0)");
      // When/Then: changing the parent updates all descendants without reparsing their CSSOM objects.
      outer.selectorText = ".b";
      const old = w.getComputedStyle(child);
      expect(old.color).toBe("rgb(0, 0, 255)");
      expect(w.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
      const inner = outer.cssRules[1];
      if (!(inner instanceof w.CSSStyleRule)) throw new Error("Expected child rule");
      inner.selectorText = "& > em";
      expect(w.getComputedStyle(child).color).toBe("rgb(255, 0, 0)");
      expect(old.color).toBe("rgb(0, 0, 255)");
    } finally {
      w.close();
    }
  });

  it("distinguishes nesting selector specificity from trailing declaration specificity", () => {
    // Given: & takes the strongest parent branch while trailing declarations retain actual branch specificity.
    const { window: w } = new JSDOM(
      '<style>#missing,.a { color:red; & {color:blue} color:green; } .a {color:orange}</style><div class="a"></div>',
    );
    try {
      const node = w.document.querySelector("div");
      if (!node) throw new Error("Expected node");
      // When/Then: the nested rule wins despite a later weaker declaration run and flat rule.
      expect(w.getComputedStyle(node).color).toBe("rgb(0, 0, 255)");
      const outer = w.document.styleSheets[0]?.cssRules[0];
      if (!(outer instanceof w.CSSStyleRule)) throw new Error("Expected rule");
      outer.deleteRule(0);
      expect(w.getComputedStyle(node).color).toBe("rgb(255, 165, 0)");
    } finally {
      w.close();
    }
  });
});

describe("RunDOM native nesting edge contracts", () => {
  it("does not treat ampersands inside attribute strings as nesting selectors", () => {
    // Given: only an ampersand delimiter token suppresses the implicit parent reference.
    const { window: w } = new JSDOM();
    try {
      const s = new w.CSSStyleSheet();
      s.replaceSync('.a{:is([data-x="&"], .b){color:red}}');
      const outer = s.cssRules[0];
      if (!(outer instanceof w.CSSStyleRule)) throw new Error("Expected style rule");
      const child = outer.cssRules[0];
      if (!(child instanceof w.CSSStyleRule)) throw new Error("Expected child");
      // When/Then: serialization agrees with Chromium and the selector remains relative.
      expect(child.selectorText).toBe('& :is([data-x="&"], .b)');
    } finally {
      w.close();
    }
  });
  it("rejects invalid nested selector grammar without changing the child list", () => {
    // Given: the reference currently accepts this invalid selector, while native CSSOM rejects it.
    const { window: w } = new JSDOM();
    try {
      const s = new w.CSSStyleSheet();
      s.replaceSync(".a{.b{}}");
      const outer = s.cssRules[0];
      if (!(outer instanceof w.CSSStyleRule)) throw new Error("Expected rule");
      const child = outer.cssRules[0];
      // When/Then: invalid syntax cannot partially append a child rule.
      expect(() => outer.insertRule("% {}")).toThrow(
        expect.objectContaining({ name: "SyntaxError" }),
      );
      expect(outer.cssRules.length).toBe(1);
      expect(outer.cssRules[0]).toBe(child);
    } finally {
      w.close();
    }
  });
  it.each(["delete", "replace"])(
    "retains detached descendant topology after sheet %s",
    (action) => {
      // Given: author code holds a rule and child list across removal from a sheet.
      const { window: w } = new JSDOM();
      try {
        const s = new w.CSSStyleSheet();
        s.replaceSync(".a{.b{color:red}}");
        const outer = s.cssRules[0];
        if (!(outer instanceof w.CSSStyleRule)) throw new Error("Expected rule");
        const list = outer.cssRules,
          child = list[0];
        // When/Then: sheet links clear recursively but the detached hierarchy survives.
        if (action === "delete") s.deleteRule(0);
        else s.replaceSync("p{}");
        expect(outer.parentStyleSheet).toBeNull();
        expect(outer.parentRule).toBeNull();
        expect(list.length).toBe(1);
        expect(child?.parentRule).toBe(outer);
        expect(child?.parentStyleSheet).toBeNull();
        outer.insertRule(".c{}", 1);
        expect(list.length).toBe(2);
        expect(list[1]?.parentRule).toBe(outer);
        expect(list[1]?.parentStyleSheet).toBeNull();
      } finally {
        w.close();
      }
    },
  );
  it("materializes an unread leaf in its detached group and preserves subsequent live edits", () => {
    const { window: w } = new JSDOM();
    try {
      const sheet = new w.CSSStyleSheet();
      sheet.replaceSync("@media all { .unused { color: red } } .unused { color: blue }");
      const group = sheet.cssRules.item(0);
      if (!(group instanceof w.CSSMediaRule)) throw new Error("Expected a media rule");
      sheet.deleteRule(0);
      const leaf = group.cssRules.item(0);
      if (!(leaf instanceof w.CSSStyleRule)) throw new Error("Expected a style rule");
      expect(leaf.parentRule).toBe(group);
      expect(leaf.parentStyleSheet).toBeNull();
      expect(Reflect.get(leaf.style, "parentRule")).toBe(leaf);
      const children = leaf.cssRules;
      leaf.insertRule("& .child { color: green }");
      expect(children.item(0)?.parentRule).toBe(leaf);
      expect(group.cssRules[0]).toBe(leaf);
      leaf.deleteRule(0);
      expect(children.length).toBe(0);
    } finally {
      w.close();
    }
  });
  it("sets parentRule on stable leading and nested declaration styles", () => {
    // Given: declarations belong to their CSSOM rule, including implicit wrapper rules.
    const { window: w } = new JSDOM();
    try {
      const s = new w.CSSStyleSheet();
      s.replaceSync(".a{color:red;@media screen{color:blue}}");
      const outer = s.cssRules[0];
      if (!(outer instanceof w.CSSStyleRule)) throw new Error("Expected rule");
      const media = outer.cssRules[0];
      if (!(media instanceof w.CSSMediaRule)) throw new Error("Expected media");
      const child = media.cssRules[0];
      if (!(child instanceof w.CSSNestedDeclarations)) throw new Error("Expected declarations");
      // When/Then: style ownership is consistent with the enclosing live rule graph.
      expect(Reflect.get(outer.style, "parentRule")).toBe(outer);
      expect(Reflect.get(child.style, "parentRule")).toBe(child);
    } finally {
      w.close();
    }
  });
  it("resets nesting at nested scope roots and applies scope declaration runs", () => {
    // Given: a nested scope's ampersand start binds the parent, while its contents bind the new root.
    const { window: w } = new JSDOM(
      '<style>.a{@scope(&){--x:one;.b{--x:two}}}</style><main class="a"><span class="b"></span></main>',
    );
    try {
      const outer = w.document.styleSheets[0]?.cssRules[0],
        root = w.document.querySelector("main"),
        child = w.document.querySelector("span");
      if (!(outer instanceof w.CSSStyleRule) || !root || !child)
        throw new Error("Expected scope fixture");
      // When/Then: raw declarations target the root and implicit child selectors keep scope serialization.
      expect(w.getComputedStyle(root).getPropertyValue("--x")).toBe("one");
      expect(w.getComputedStyle(child).getPropertyValue("--x")).toBe("two");
      const scope = outer.cssRules[0];
      if (!(scope instanceof w.CSSScopeRule)) throw new Error("Expected scope");
      const nested = scope.cssRules[1];
      if (!(nested instanceof w.CSSStyleRule)) throw new Error("Expected child rule");
      expect(nested.selectorText).toBe(".b");
      outer.selectorText = ".other";
      expect(w.getComputedStyle(root).getPropertyValue("--x")).toBe("");
    } finally {
      w.close();
    }
  });
  it("supports the nesting selector in selector feature queries", () => {
    // Given: nesting selector grammar is valid even outside a nested rule.
    const { window: w } = new JSDOM();
    try {
      expect(w.CSS.supports("selector(&)")).toBe(true);
    } finally {
      w.close();
    }
  });
});

it("binds borrowed CSSOM operations to receiver factories and caller exception realms", () => {
  // Given: isolated Windows have distinct constructors and CSS rule factories.
  const first = new JSDOM("", { runScripts: "outside-only" }),
    second = new JSDOM("", { runScripts: "outside-only" });
  try {
    const a = first.window,
      b = second.window,
      sheet = new b.CSSStyleSheet();
    sheet.replaceSync(".a{}");
    const rule = sheet.cssRules[0];
    if (!(rule instanceof b.CSSStyleRule)) throw new Error("Expected foreign style rule");
    const insert = a.CSSStyleRule.prototype.insertRule,
      styleGet = Object.getOwnPropertyDescriptor(a.CSSStyleRule.prototype, "style")?.get;
    if (!styleGet) throw new Error("Expected style getter");
    // When/Then: valid insertion creates receiver-realm children, while failure uses the invoking realm.
    expect(insert.call(rule, ".b{color:red}", 0)).toBe(0);
    expect(rule.cssRules[0] instanceof b.CSSStyleRule).toBe(true);
    expect(rule.cssRules[0] instanceof a.CSSStyleRule).toBe(false);
    expect(styleGet.call(rule)).toBe(rule.style);
    try {
      insert.call(rule, ".b{}", 9);
      throw new Error("Expected invalid index");
    } catch (error) {
      expect(error instanceof a.DOMException).toBe(true);
      expect(error instanceof b.DOMException).toBe(false);
    }
    const getter = Object.getOwnPropertyDescriptor(a.CSSGroupingRule.prototype, "cssRules")?.get;
    if (!getter) throw new Error("Expected list getter");
    expect(getter.call(rule)).toBe(rule.cssRules);
    expect(rule.cssRules instanceof b.CSSRuleList).toBe(true);
    a.CSSStyleRule.prototype.deleteRule.call(rule, 0);
    expect(rule.cssRules.length).toBe(0);
  } finally {
    first.window.close();
    second.window.close();
  }
});

it.each(["innerHTML", "data", "comment"])(
  "rebuilds mutated CSSOM after same-text style source %s changes",
  (operation) => {
    // Given: CSSOM edits do not change the authored text and must not survive a fresh source mutation.
    const { window: w } = new JSDOM("<style>.a{color:red;.b{color:green}}</style>");
    try {
      const style = w.document.querySelector("style");
      if (!(style instanceof w.HTMLStyleElement)) throw new Error("Expected style");
      const original = style.sheet,
        source = style.textContent ?? "",
        rule = original?.cssRules[0];
      if (!(rule instanceof w.CSSStyleRule)) throw new Error("Expected rule");
      rule.style.color = "blue";
      // When/Then: source changes create a fresh sheet while keeping the old CSSOM object coherent.
      if (operation === "innerHTML") style.innerHTML = source;
      else if (operation === "data") {
        const child = style.firstChild;
        if (!(child instanceof w.Text)) throw new Error("Expected text");
        child.data = source;
      } else style.append(w.document.createComment("same source text"));
      expect(style.sheet === original).toBe(false);
      expect(style.sheet?.cssRules[0]?.cssText).toContain("color: red;");
      expect(original?.ownerNode).toBeNull();
      expect(rule.style.color).toBe("blue");
      expect(rule.cssRules.length).toBe(1);
    } finally {
      w.close();
    }
  },
);

it("matches top-level nesting selectors at their DOM scope", () => {
  // Given: & outside nesting denotes :scope without inheriting selector specificity.
  const { window: w } = new JSDOM("<style>&{color:red}</style><main><span></span></main>");
  try {
    const main = w.document.querySelector("main");
    if (!main) throw new Error("Expected main");
    // When/Then: document and element queries anchor independently rather than matching everything.
    expect(w.document.querySelector("&")).toBe(w.document.documentElement);
    expect(main.querySelector("& > span")).toBe(main.firstElementChild);
    const documentElement = w.document.documentElement;
    if (!documentElement) throw new Error("Expected document element");
    expect(w.getComputedStyle(documentElement).color).toBe("rgb(255, 0, 0)");
  } finally {
    w.close();
  }
});

it("preserves top-level scoped declarations without nested braces", () => {
  // Given: @scope permits bare declarations even when the source has only one block depth.
  const { window: w } = new JSDOM(
    "<style>@scope (.a){color:green;z-index:1}</style><div class=a></div>",
  );
  try {
    const rule = w.document.styleSheets[0]?.cssRules[0],
      target = w.document.querySelector("div");
    if (!(rule instanceof w.CSSScopeRule) || !target) throw new Error("Expected scope and target");
    // When/Then: an ordered declaration rule applies to the scope root with zero specificity.
    expect(rule.cssRules.length).toBe(1);
    expect(rule.cssRules[0] instanceof w.CSSNestedDeclarations).toBe(true);
    expect(w.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
    expect(w.getComputedStyle(target).getPropertyValue("z-index")).toBe("1");
  } finally {
    w.close();
  }
});

it.each(["@unknown {};", "@unknown value;"])(
  "keeps declarations after discarded at-rule %s in the leading block",
  (invalid) => {
    // Given: an invalid child at-rule creates no rule and therefore cannot split a declaration block.
    const { window: w } = new JSDOM(`<style>div{${invalid}color:green}</style>`);
    try {
      const rule = w.document.styleSheets[0]?.cssRules[0];
      if (!(rule instanceof w.CSSStyleRule)) throw new Error("Expected rule");
      // When/Then: invalid syntax is discarded and the leading declaration remains on CSSStyleRule.style.
      expect(rule.style.color).toBe("green");
      expect(rule.cssRules.length).toBe(0);
    } finally {
      w.close();
    }
  },
);

it("distinguishes whole-block variable declarations from nested selector rules", () => {
  // Given: a value beginning with a curly block remains declaration syntax, while div:hover is a nested selector.
  const { window: w } = new JSDOM(
    "<style>.a{color:red;color: { var(--x) };background-color:blue;div:hover{color:green}}</style>",
  );
  try {
    const rule = w.document.styleSheets[0]?.cssRules[0];
    if (!(rule instanceof w.CSSStyleRule)) throw new Error("Expected rule");
    // When/Then: parser dispatch preserves the raw declaration and the independent child rule.
    expect(rule.style.color).toBe("{ var(--x) }");
    expect(rule.style.getPropertyValue("background-color")).toBe("blue");
    expect(rule.cssRules[0]?.cssText).toBe("& div:hover { color: green; }");
  } finally {
    w.close();
  }
});

it("drops imports inside top-level conditional groups", () => {
  // Given: imports belong only to a stylesheet's root list, never a nested rule list.
  const { window: w } = new JSDOM(
    '<style>@supports(color:red){@import "data:text/css,";div{color:green}}</style>',
  );
  try {
    const rule = w.document.styleSheets[0]?.cssRules[0];
    if (!(rule instanceof w.CSSSupportsRule)) throw new Error("Expected supports rule");
    // When/Then: invalid import recovery preserves the later style rule alone.
    expect(rule.cssRules.length).toBe(1);
    expect(rule.cssRules[0]?.cssText).toBe("div { color: green; }");
  } finally {
    w.close();
  }
});

it.each(["is", "where"])(
  "preserves the pinned CSSOM spelling of invalid nested :has branches inside :%s",
  (logical) => {
    // Given: forgiving selectors retain invalid branches in CSSOM while discarding them for matching.
    const { window: w } = new JSDOM();
    try {
      const sheet = new w.CSSStyleSheet();
      sheet.replaceSync(`:has(:${logical}(:has(.a+.b))){color:green}`);
      const rule = sheet.cssRules[0];
      if (!(rule instanceof w.CSSStyleRule)) throw new Error("Expected rule");
      // When/Then: pinned jsdom and its WPT contract retain this invalid forgiving branch as raw tokens.
      expect(rule.selectorText).toBe(`:has(:${logical}(:has(.a+.b)))`);
    } finally {
      w.close();
    }
  },
);
