// Pins computed-style liveness and dependencies under repeated accessibility-style reads.
import { expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

it("preserves overflow axes and CSS property aliases across snapshot materialization", () => {
  const { window } = new JSDOM(
    "<style>main { display: block; max-width: 12px }</style><main></main>",
  );
  try {
    const main = window.document.querySelector("main");
    if (!(main instanceof window.HTMLElement)) throw new Error("Expected an HTML element");
    const initial = window.getComputedStyle(main);
    main.style.setProperty("overflow-x", "hidden");
    const clipped = window.getComputedStyle(main);
    main.style.setProperty("overflow-x", "scroll");
    expect([
      Reflect.get(initial, "overflow"),
      Reflect.get(initial, "overflowX"),
      Reflect.get(initial, "overflowY"),
    ]).toEqual(["visible", "scroll", "visible"]);
    expect(Reflect.get(initial, "maxWidth")).toBe("12px");
    expect(Reflect.get(clipped, "overflowX")).toBe("scroll");
    expect(clipped.getPropertyValue("overflow-x")).toBe("scroll");
    expect(clipped.length).toBeGreaterThan(0);
    expect(Reflect.get(clipped, "overflowX")).toBe("scroll");
    expect(Reflect.get(window.getComputedStyle(main), "overflowX")).toBe("scroll");
  } finally {
    window.close();
  }
});

it("keeps computed initial and inherited keywords stable across snapshot enumeration", () => {
  const { window } = new JSDOM(
    "<style>main{pointer-events:none} p{display:unset;float:initial}</style><main><p></p></main>",
  );
  try {
    const { document } = window;
    const parent = document.querySelector("main");
    const child = document.querySelector("p");
    if (!parent || !child) throw new Error("Expected a parent and child");
    const captured = window.getComputedStyle(child);
    parent.style.setProperty("pointer-events", "auto");
    expect(captured.getPropertyValue("pointer-events")).toBe("auto");
    expect(captured.display).toBe("inline");
    expect(captured.getPropertyValue("float")).toBe("none");
    expect(window.getComputedStyle(child).getPropertyValue("pointer-events")).toBe("auto");
    const unstyled = new JSDOM("<svg><g/></svg>");
    try {
      const svg = unstyled.window.document.querySelector("g");
      if (!svg) throw new Error("Expected an unstyled SVG element");
      const view = unstyled.window.getComputedStyle(svg);
      expect(view.display).toBe("inline");
      expect(view.contentVisibility).toBe("visible");
      expect(view.length).toBeGreaterThan(0);
      expect(view.display).toBe("inline");
      expect(view.contentVisibility).toBe("visible");
    } finally {
      unstyled.window.close();
    }
  } finally {
    window.close();
  }
});

it("keeps identical stylesheet declaration blocks independently editable across windows", () => {
  // Given: two independently parsed sheets with the same declaration source.
  const markup = "<style>p { color: red !important; border: 2px solid blue }</style><p></p>";
  const { window: first } = new JSDOM(markup);
  const { window: second } = new JSDOM(markup);
  try {
    const firstRule = first.document.styleSheets[0]?.cssRules[0];
    const secondRule = second.document.styleSheets[0]?.cssRules[0];
    const paragraph = second.document.querySelector("p");
    if (
      !(firstRule instanceof first.CSSStyleRule) ||
      !(secondRule instanceof second.CSSStyleRule) ||
      !paragraph
    )
      throw new Error("Expected both rules and a paragraph");
    // When: CSSOM mutates the first declaration block.
    firstRule.style.setProperty("color", "green", "important");
    firstRule.style.removeProperty("border");
    // Then: the second window keeps its priorities, expanded values and own rule.
    expect(secondRule.style.parentRule).toBe(secondRule);
    expect(secondRule.style.getPropertyPriority("color")).toBe("important");
    expect(second.getComputedStyle(paragraph).color).toBe("rgb(255, 0, 0)");
    expect(second.getComputedStyle(paragraph).getPropertyValue("border-top-width")).toBe("2px");
  } finally {
    first.close();
    second.close();
  }
});

it("keeps grouped stylesheet rules in cascade order across live state and CSSOM edits", () => {
  const unrelated = Array.from({ length: 40 }, (_, i) => `.other-${i}{visibility:hidden}`).join("");
  const { window } = new JSDOM(
    `<style>${unrelated}
      .control { display: inline }
      .unused, .control { display: block }
      .control:checked { display: none }
      .raw\uD800class { visibility: hidden }
    </style><input class="control" type="checkbox">`,
  );
  try {
    const control = window.document.querySelector("input");
    const style = window.document.querySelector("style");
    if (
      !(control instanceof window.HTMLInputElement) ||
      !(style instanceof window.HTMLStyleElement)
    )
      throw new Error("Expected a checkbox and its stylesheet");
    expect(window.getComputedStyle(control).display).toBe("block");
    control.checked = true;
    expect(window.getComputedStyle(control).display).toBe("none");
    control.checked = false;
    control.className = "raw�class";
    expect(window.getComputedStyle(control).getPropertyValue("visibility")).toBe("hidden");
    control.className = "other-3";
    expect(window.getComputedStyle(control).getPropertyValue("visibility")).toBe("hidden");
    const sheet = style.sheet;
    const rule = sheet?.cssRules[3];
    if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected a style rule");
    rule.selectorText = ".replacement";
    expect(window.getComputedStyle(control).getPropertyValue("visibility")).not.toBe("hidden");
    control.className = "replacement";
    expect(window.getComputedStyle(control).getPropertyValue("visibility")).toBe("hidden");
  } finally {
    window.close();
  }
});

it("preserves color tokens in computed custom properties until used by a color longhand", () => {
  // Given: inline and stylesheet custom properties with color-like names.
  const { window } = new JSDOM(
    "<style>p { --accent-color: blue; background-color: var(--accent-color) }</style>" +
      '<div style="--color: red"><p style="color: var(--color)">text</p></div>',
  );
  try {
    const node = window.document.querySelector("p");
    if (!node) throw new Error("Expected paragraph");
    // When: the cascade resolves inheritance and variable substitution.
    const computed = window.getComputedStyle(node);
    // Then: only the consuming longhands serialize their values as colors.
    expect(computed.getPropertyValue("--color")).toBe("red");
    expect(computed.getPropertyValue("--accent-color")).toBe("blue");
    expect(computed.color).toBe("rgb(255, 0, 0)");
    expect(computed.getPropertyValue("background-color")).toBe("rgb(0, 0, 255)");
  } finally {
    window.close();
  }
});

it("returns distinct readonly declarations with live values", () => {
  // Given: repeated reads must not expose a shared mutable public declaration.
  const { window } = new JSDOM(
    "<style>p{color:red;margin:1px 2px;font:italic 16px serif}</style><p>text</p>",
  );
  try {
    const node = window.document.querySelector("p");
    if (!node) throw new Error("Expected paragraph");
    const first = window.getComputedStyle(node),
      second = window.getComputedStyle(node);
    expect(first === second).toBe(false);
    expect([...first]).toEqual([...second]);
    expect(first.length).toBe(second.length);
    expect(first.getPropertyValue("margin-left")).toBe("2px");
    expect(first.getPropertyValue("font-size")).toBe("16px");
    expect(() => first.setProperty("color", "blue")).toThrow(
      expect.objectContaining({ name: "NoModificationAllowedError" }),
    );
    // When/Then: a later inline mutation changes a new read, leaving both snapshots intact.
    node.setAttribute("style", "color:blue;margin-left:4px");
    const third = window.getComputedStyle(node);
    expect(third.color).toBe("rgb(0, 0, 255)");
    expect(third.getPropertyValue("margin-left")).toBe("4px");
    expect(first.color).toBe("rgb(0, 0, 255)");
    expect(second.color).toBe("rgb(0, 0, 255)");
    expect(first.getPropertyPriority("color")).toBe("");
  } finally {
    window.close();
  }
});

it("reevaluates current control and focus selectors before reusing computed values", () => {
  // Given: these changes can occur without a structural or attribute mutation.
  const { window } = new JSDOM(
    '<style>main{color:red}main:has(:checked){color:blue}main:has(:indeterminate){color:green}main:focus-within{background-color:yellow}</style><main><input type="checkbox"></main>',
  );
  try {
    const main = window.document.querySelector("main"),
      input = window.document.querySelector("input");
    if (!main || !(input instanceof window.HTMLInputElement)) throw new Error("Expected controls");
    expect(window.getComputedStyle(main).color).toBe("rgb(255, 0, 0)");
    expect(window.getComputedStyle(main).color).toBe("rgb(255, 0, 0)");
    input.checked = true;
    expect(window.getComputedStyle(main).color).toBe("rgb(0, 0, 255)");
    input.indeterminate = true;
    expect(window.getComputedStyle(main).color).toBe("rgb(0, 128, 0)");
    input.focus();
    expect(window.getComputedStyle(main).getPropertyValue("background-color")).toBe(
      "rgb(255, 255, 0)",
    );
    input.blur();
    expect(window.getComputedStyle(main).getPropertyValue("background-color")).not.toBe(
      "rgb(255, 255, 0)",
    );
  } finally {
    window.close();
  }
});

it("tracks inherited custom properties, ancestor fonts, and scheme changes", () => {
  // Given: the same child consumes inherited values through several computed operations.
  const { window } = new JSDOM(
    '<main style="--size:2em;font-size:10px;color-scheme:light;color:CanvasText"><p style="width:var(--size);color:inherit">text</p></main>',
  );
  try {
    const main = window.document.querySelector("main"),
      child = window.document.querySelector("p");
    if (!main || !child) throw new Error("Expected inheritance fixture");
    const first = window.getComputedStyle(child);
    expect(first.getPropertyValue("width")).toBe("20px");
    expect(window.getComputedStyle(child).getPropertyValue("width")).toBe("20px");
    // When/Then: an ancestor change cannot leave a child computed snapshot stale.
    main.setAttribute("style", "--size:3em;font-size:20px;color-scheme:dark;color:CanvasText");
    const next = window.getComputedStyle(child);
    expect(next.getPropertyValue("width")).toBe("60px");
    expect(next.color).toBe(first.color);
    expect(first.getPropertyValue("width")).toBe("60px");
  } finally {
    window.close();
  }
});

it("observes CSSOM edits, rule reordering, and disabled sheets after repeated reads", () => {
  // Given: the discovery cache retains live rules and declaration blocks.
  const { window } = new JSDOM("<style>p{color:red}</style><p>text</p>");
  try {
    const node = window.document.querySelector("p"),
      sheet = window.document.styleSheets[0];
    if (!node || !sheet) throw new Error("Expected stylesheet");
    expect(window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
    expect(window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
    sheet.insertRule("p{color:blue}", 1);
    expect(window.getComputedStyle(node).color).toBe("rgb(0, 0, 255)");
    const rule = sheet.cssRules[1];
    if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected style rule");
    rule.style.setProperty("color", "green");
    expect(window.getComputedStyle(node).color).toBe("rgb(0, 128, 0)");
    sheet.deleteRule(1);
    expect(window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
    sheet.disabled = true;
    expect(window.getComputedStyle(node).color).not.toBe("rgb(255, 0, 0)");
  } finally {
    window.close();
  }
});

it("recomputes viewport lengths and media-dependent winners", () => {
  // Given: a declaration can depend on the viewport even when its text never changes.
  const { window } = new JSDOM(
    "<style>p{color:red;width:10vw}@media (min-width:1200px){p{color:blue}}</style><p>text</p>",
  );
  try {
    const node = window.document.querySelector("p");
    if (!node) throw new Error("Expected paragraph");
    window.innerWidth = 1000;
    expect(window.getComputedStyle(node).getPropertyValue("width")).toBe("100px");
    expect(window.getComputedStyle(node).getPropertyValue("width")).toBe("100px");
    window.innerWidth = 1400;
    const next = window.getComputedStyle(node);
    expect(next.getPropertyValue("width")).toBe("140px");
    expect(next.color).toBe("rgb(0, 0, 255)");
  } finally {
    window.close();
  }
});

it("preserves target-dependent SVG currentColor when ancestor styles have been queried", () => {
  // Given: an ancestor as a target resolves currentColor differently from inherited paint.
  const { window } = new JSDOM(
    '<svg style="color:blue;fill:currentColor"><g style="color:red"><rect/></g></svg>',
  );
  try {
    const svg = window.document.querySelector("svg"),
      rect = window.document.querySelector("rect");
    if (!svg || !rect) throw new Error("Expected SVG");
    expect(window.getComputedStyle(svg).getPropertyValue("fill")).toBe("rgb(0, 0, 255)");
    expect(window.getComputedStyle(svg).getPropertyValue("fill")).toBe("rgb(0, 0, 255)");
    expect(window.getComputedStyle(rect).getPropertyValue("fill")).toBe("rgb(255, 0, 0)");
    expect(window.getComputedStyle(svg).getPropertyValue("fill")).toBe("rgb(0, 0, 255)");
  } finally {
    window.close();
  }
});

it("resolves relative computed URLs against the current document base", () => {
  // Given: a base change can alter a computed value without changing its declaration.
  const { window } = new JSDOM(
    '<base href="/first/"><p style="background-image:url(image.png)">text</p>',
    { url: "https://example.test/" },
  );
  try {
    const node = window.document.querySelector("p"),
      base = window.document.querySelector("base");
    if (!node || !base) throw new Error("Expected base fixture");
    const first = window.getComputedStyle(node);
    expect(first.getPropertyValue("background-image")).toBe(
      'url("https://example.test/first/image.png")',
    );
    expect(window.getComputedStyle(node).getPropertyValue("background-image")).toBe(
      first.getPropertyValue("background-image"),
    );
    base.setAttribute("href", "/second/");
    expect(window.getComputedStyle(node).getPropertyValue("background-image")).toBe(
      'url("https://example.test/second/image.png")',
    );
    expect(first.getPropertyValue("background-image")).toBe(
      'url("https://example.test/second/image.png")',
    );
  } finally {
    window.close();
  }
});

it("resolves an unread relative URL against the current document base", () => {
  // Given: the ancestor already needed the document base during cascade construction.
  const { window } = new JSDOM(
    "<base href='/first/'><style>main{background-image:url(parent.png)}" +
      "p{background-image:url(child.png)}</style><main><p></p></main>",
    { url: "https://example.test/" },
  );
  try {
    const node = window.document.querySelector("p"),
      base = window.document.querySelector("base");
    if (!node || !base) throw new Error("Expected a paragraph and a document base");
    const before = window.getComputedStyle(node);

    // When: the base changes before the first property access.
    base.setAttribute("href", "/next/");
    const after = window.getComputedStyle(node);

    // Then: both declarations resolve against the current base.
    expect(before.getPropertyValue("background-image")).toBe(
      'url("https://example.test/next/child.png")',
    );
    expect(after.getPropertyValue("background-image")).toBe(
      'url("https://example.test/next/child.png")',
    );
  } finally {
    window.close();
  }
});

it("keeps shadow host inheritance separate from document rule matching", () => {
  // Given: the host participates in both its document and its own shadow scope.
  const { window } = new JSDOM("<style>section{color:blue}</style><section></section>");
  try {
    const host = window.document.querySelector("section");
    if (!host) throw new Error("Expected host");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = "<style>:host{color:red}p{color:inherit}</style><p>text</p>";
    const child = root.querySelector("p");
    if (!child) throw new Error("Expected shadow child");
    const first = window.getComputedStyle(child);
    expect(first.color).toBe("rgb(0, 0, 255)");
    expect(window.getComputedStyle(child).color).toBe(first.color);
    host.setAttribute("style", "color:green");
    expect(window.getComputedStyle(child).color).toBe("rgb(0, 128, 0)");
  } finally {
    window.close();
  }
});

it("computes range overflow shorthand from its visible axis defaults", () => {
  // Given: range controls expose the same visible overflow shorthand as the browser default.
  const { window } = new JSDOM('<input type="range">');
  try {
    const range = window.document.querySelector("input");
    if (!range) throw new Error("Expected range");
    const style = window.getComputedStyle(range);
    expect(style.getPropertyValue("overflow")).toBe("visible");
    expect(window.getComputedStyle(range).getPropertyValue("overflow")).toBe("visible");
  } finally {
    window.close();
  }
});

it("tracks current target, editable, and validity selector state", () => {
  // Given: location, editing mode, and control values each drive live rule matching.
  const { window } = new JSDOM(
    '<style>main{color:red}main:target{color:blue}main:read-write{background-color:yellow}main:has(:valid){border-top-color:green}</style><main id="target"><input required></main>',
    { url: "https://example.test/" },
  );
  try {
    const main = window.document.querySelector("main"),
      input = window.document.querySelector("input");
    if (!main || !(input instanceof window.HTMLInputElement))
      throw new Error("Expected state fixture");
    expect(window.getComputedStyle(main).color).toBe("rgb(255, 0, 0)");
    expect(window.getComputedStyle(main).color).toBe("rgb(255, 0, 0)");
    window.location.hash = "#target";
    expect(window.getComputedStyle(main).color).toBe("rgb(0, 0, 255)");
    window.document.designMode = "on";
    expect(window.getComputedStyle(main).getPropertyValue("background-color")).toBe(
      "rgb(255, 255, 0)",
    );
    input.value = "filled";
    expect(window.getComputedStyle(main).getPropertyValue("border-top-color")).toBe(
      "rgb(0, 128, 0)",
    );
    input.value = "";
    expect(window.getComputedStyle(main).getPropertyValue("border-top-color")).not.toBe(
      "rgb(0, 128, 0)",
    );
  } finally {
    window.close();
  }
});

it("reads the destination document's styles after adoption and reinsertion", () => {
  // Given: the wrapper survives adoption while its stylesheet environment changes.
  const first = new JSDOM("<style>p{color:red}</style><p>text</p>");
  const second = new JSDOM("<style>p{color:blue}</style>");
  try {
    const node = first.window.document.querySelector("p");
    if (!node) throw new Error("Expected paragraph");
    const snapshot = first.window.getComputedStyle(node);
    expect(first.window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
    second.window.document.adoptNode(node);
    second.window.document.body?.append(node);
    expect(second.window.getComputedStyle(node).color).toBe("rgb(0, 0, 255)");
    expect(first.window.getComputedStyle(node).color).toBe("rgb(0, 0, 255)");
    expect(snapshot.color).toBe("rgb(0, 0, 255)");
  } finally {
    first.window.close();
    second.window.close();
  }
});

it("keeps declarations correct after many distinct elements and oversized custom-property blocks", () => {
  // Given: large and diverse styles must remain correct when reuse is uneconomical.
  const { window } = new JSDOM("<main></main>");
  try {
    const root = window.document.querySelector("main");
    if (!root) throw new Error("Expected main");
    for (let index = 0; index < 160; index++) {
      const child = window.document.createElement("p");
      child.setAttribute("style", `width:${index}px;color:red`);
      root.append(child);
      expect(window.getComputedStyle(child).getPropertyValue("width")).toBe(`${index}px`);
    }
    const first = root.firstElementChild;
    if (!first) throw new Error("Expected child");
    const large = "x".repeat(40000);
    first.setAttribute("style", `--large:${large};color:blue`);
    expect(window.getComputedStyle(first).getPropertyValue("--large")).toBe(large);
    expect(window.getComputedStyle(first).color).toBe("rgb(0, 0, 255)");
    first.setAttribute("style", "color:green");
    expect(window.getComputedStyle(first).color).toBe("rgb(0, 128, 0)");
  } finally {
    window.close();
  }
});

it("uses one color/math backend for specified and computed comparison expressions", () => {
  // Given: valid unresolved math must survive declaration parsing before its lengths resolve.
  const { window } = new JSDOM('<p style="font-size:20px">text</p>');
  try {
    const node = window.document.querySelector("p");
    if (!(node instanceof window.HTMLElement)) throw new Error("Expected paragraph");
    node.style.setProperty("letter-spacing", "calc(min(1em, 21px) + 10px)");
    expect(node.style.getPropertyValue("letter-spacing")).not.toBe("");
    expect(window.getComputedStyle(node).getPropertyValue("letter-spacing")).toBe("30px");
    // When/Then: integer properties resolve the same nested functions through their font context.
    node.style.setProperty("orphans", "calc(pow(2, sign(1em - 18px)))");
    expect(node.style.getPropertyValue("orphans")).toBe("calc(pow(2, sign(1em - 18px)))");
    expect(window.getComputedStyle(node).getPropertyValue("orphans")).toBe("2");
  } finally {
    window.close();
  }
});

it("isolates indexed reflection and expandos on repeated computed snapshots", () => {
  // Given: expandos are independent and WebIDL declarations reject freezing.
  const { window } = new JSDOM('<p style="color:red;margin:1px 2px;--token:value">text</p>');
  try {
    const node = window.document.querySelector("p");
    if (!node) throw new Error("Expected paragraph");
    const first = window.getComputedStyle(node),
      second = window.getComputedStyle(node);
    const names = Array.from(first);
    const descriptor = Object.getOwnPropertyDescriptor(first, "0");
    expect(descriptor?.value).toBe(names[0]);
    expect(Object.keys(first).filter((name) => /^\d+$/.test(name))).toEqual(
      names.map((_, index) => `${index}`),
    );
    Object.defineProperty(first, "note", { value: "caller data" });
    expect(() => Object.freeze(first)).toThrow(TypeError);
    expect(Reflect.get(second, "note")).toBeUndefined();
    expect(Array.from(second)).toEqual(names);
    expect(first.getPropertyValue("margin")).toBe("1px 2px");
    expect(first.getPropertyValue("--token")).toBe("value");
    // When/Then: new values and old snapshots remain independent after reflection operations.
    node.setAttribute("style", "color:blue;margin:4px;--token:next");
    expect(window.getComputedStyle(node).color).toBe("rgb(0, 0, 255)");
    expect(first.color).toBe("rgb(0, 0, 255)");
    expect(second.getPropertyValue("--token")).toBe("next");
  } finally {
    window.close();
  }
});

it("rejects all public computed mutations without disturbing later snapshots", () => {
  // Given: aliases and borrowed foreign operations must retain the readonly contract.
  const first = new JSDOM('<p style="color:red;margin:1px">text</p>');
  const foreign = new JSDOM();
  try {
    const node = first.window.document.querySelector("p");
    if (!node) throw new Error("Expected paragraph");
    const style = first.window.getComputedStyle(node);
    for (const write of [
      () => {
        style.color = "blue";
      },
      () => {
        style.cssText = "color:blue";
      },
      () => style.removeProperty("color"),
      () => foreign.window.CSSStyleDeclaration.prototype.setProperty.call(style, "color", "blue"),
      () => foreign.window.CSSStyleDeclaration.prototype.removeProperty.call(style, "margin"),
    ])
      expect(write).toThrow(expect.objectContaining({ name: "NoModificationAllowedError" }));
    // When/Then: failed mutations leave the snapshot and the next fresh read intact.
    expect(style.color).toBe("rgb(255, 0, 0)");
    expect(first.window.getComputedStyle(node).getPropertyValue("margin-left")).toBe("1px");
    expect(style.item(-1)).toBe("");
    expect(style.item(style.length)).toBe("");
  } finally {
    first.window.close();
    foreign.window.close();
  }
});

it("preserves observable stylesheet constructor names across the bundled inheritance chain", () => {
  // Given: dependency minification must preserve the names exposed through public prototypes.
  const { window } = new JSDOM("<p>text</p>");
  try {
    const node = window.document.querySelector("p");
    if (!node) throw new Error("Expected paragraph");
    expect(window.CSSStyleDeclaration.name).toBe("CSSStyleDeclaration");
    expect(Object.getPrototypeOf(window.CSSStyleDeclaration)).toBe(Function.prototype);
    expect(window.getComputedStyle(node).constructor.name).toBe("CSSStyleProperties");
  } finally {
    window.close();
  }
});

it("keeps readonly snapshot operations valid after rejected freezing and foreign borrowing", () => {
  // Given: snapshots support the public declaration prototype without writable declaration state.
  const first = new JSDOM('<p style="color:red;border:1px solid blue;--token:value">text</p>');
  const foreign = new JSDOM();
  try {
    const node = first.window.document.querySelector("p");
    if (!node) throw new Error("Expected paragraph");
    const snapshot = first.window.getComputedStyle(node);
    const names = Array.from(snapshot);
    expect(() => Object.freeze(snapshot)).toThrow(TypeError);
    // When/Then: readonly failures retain their DOMException contract through foreign methods.
    for (const prototype of [
      first.window.CSSStyleDeclaration.prototype,
      foreign.window.CSSStyleDeclaration.prototype,
    ]) {
      for (const property of ["color", "background", "--token", ""]) {
        expect(() => prototype.setProperty.call(snapshot, property, "")).toThrow(
          expect.objectContaining({ name: "NoModificationAllowedError" }),
        );
        expect(() => prototype.removeProperty.call(snapshot, property)).toThrow(
          expect.objectContaining({ name: "NoModificationAllowedError" }),
        );
      }
      const text = Object.getOwnPropertyDescriptor(prototype, "cssText");
      expect(text?.get?.call(snapshot)).toBe("");
      expect(() => text?.set?.call(snapshot, "color:blue")).toThrow(
        expect.objectContaining({ name: "NoModificationAllowedError" }),
      );
      expect(prototype.getPropertyValue.call(snapshot, "--token")).toBe("value");
    }
    expect(snapshot instanceof first.window.CSSStyleDeclaration).toBe(true);
    expect(Object.prototype.toString.call(snapshot)).toBe("[object CSSStyleProperties]");
    expect(Array.from(snapshot)).toEqual(names);
    expect(first.window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
  } finally {
    first.window.close();
    foreign.window.close();
  }
});

it("copies computed indices without invoking an overridden public item method", () => {
  // Given: author overrides remain public behavior, never an escape hatch to a private cached frame.
  const { window: w } = new JSDOM('<p style="color:red;--token:value">text</p>');
  try {
    const node = w.document.querySelector("p");
    if (!node) throw new Error("Expected paragraph");
    const item = w.CSSStyleDeclaration.prototype.item;
    let calls = 0;
    w.CSSStyleDeclaration.prototype.item = function () {
      calls++;
      return "author";
    };
    // When/Then: frame copying uses private completed data, while public lookup keeps the override.
    const first = w.getComputedStyle(node),
      second = w.getComputedStyle(node);
    expect(calls).toBe(0);
    expect(first.color).toBe("rgb(255, 0, 0)");
    expect(Reflect.apply(item, first, [0])).not.toBe("author");
    expect(first.item(0)).toBe("author");
    expect(calls).toBe(1);
    node.setAttribute("style", "color:blue");
    expect(w.getComputedStyle(node).color).toBe("rgb(0, 0, 255)");
    expect(second.color).toBe("rgb(0, 0, 255)");
    expect(calls).toBe(1);
  } finally {
    w.close();
  }
});

it("uses native indexed iteration independently of an overridden item method", () => {
  // Given: public iteration reads indexed declarations, not the replaceable item convenience method.
  const { window: w } = new JSDOM('<p style="color:red">text</p>');
  try {
    const node = w.document.querySelector("p");
    if (!node) throw new Error("Expected paragraph");
    const style = w.getComputedStyle(node),
      names = [...style];
    let calls = 0;
    w.CSSStyleDeclaration.prototype.item = () => {
      calls++;
      return "author";
    };
    // When/Then: the Array iterator retains ordinary indexed access and its native public identity.
    expect([...style]).toEqual(names);
    expect(calls).toBe(0);
    expect(style[Symbol.iterator]).toBe(Array.prototype.values);
    expect(Object.prototype.toString.call(style[Symbol.iterator]())).toBe(
      "[object Array Iterator]",
    );
    expect(style.item(0)).toBe("author");
    expect(calls).toBe(1);
  } finally {
    w.close();
  }
});

it("reuses identical rule source without sharing a mutable selector or declaration", () => {
  const source = ".first { color: red }";
  const { window } = new JSDOM(
    `<style>${source}</style><style>${source}</style><p class="first"></p>`,
  );
  try {
    const { document } = window;
    const first = document.styleSheets[0]?.cssRules[0];
    const second = document.styleSheets[1]?.cssRules[0];
    const node = document.querySelector("p");
    if (
      !(first instanceof window.CSSStyleRule) ||
      !(second instanceof window.CSSStyleRule) ||
      !node
    )
      throw new Error("Expected two rules and their target");
    first.selectorText = ".renamed";
    first.style.color = "blue";
    expect(second.selectorText).toBe(".first");
    expect(second.style.color).toBe("red");
    expect(window.getComputedStyle(node).color).toBe("rgb(255, 0, 0)");
  } finally {
    window.close();
  }
});

it("tracks selector changes across equal writes, attribute removal and insertion", () => {
  const { window } = new JSDOM("<style>main:has([data-on]) { color: red }</style><main></main>");
  try {
    const { document } = window;
    const main = document.querySelector("main");
    if (!main) throw new Error("Expected a main element");
    const child = document.createElement("i");
    const initial = window.getComputedStyle(main).color;
    child.setAttribute("data-on", "");
    expect(window.getComputedStyle(main).color).toBe(initial);
    main.append(child);
    const active = window.getComputedStyle(main);
    expect(active.color).toBe("rgb(255, 0, 0)");
    const observer = new window.MutationObserver(() => {});
    observer.observe(child, { attributes: true, attributeOldValue: true });
    child.setAttribute("data-on", "");
    expect(observer.takeRecords()[0]?.oldValue).toBe("");
    child.removeAttribute("data-on");
    expect(window.getComputedStyle(main).color).toBe(initial);
    expect(active.color).toBe(initial);
  } finally {
    window.close();
  }
});
