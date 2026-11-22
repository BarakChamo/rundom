// Compares public declaration syntax and enumeration with the pinned upstream provider.
import { expect, it } from "vitest";
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

it("preserves relative color syntax, resolves it and rejects invalid replacements", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor("<p></p>");
    const node = window.document.querySelector("p")!;
    node.style.color = "rgb(from rebeccapurple 20% g b / alpha)";
    expect(node.style.color).toBe("rgb(from rebeccapurple 51 g b / alpha)");
    expect(window.getComputedStyle(node).color).toBe("color(srgb 0.2 0.2 0.6)");
    node.style.color = "rgb(from red q g b)";
    expect(node.style.color).toBe("rgb(from rebeccapurple 51 g b / alpha)");
    window.close();
  }
});

it("enumerates the reference longhands and sorted custom properties across mutations", () => {
  const results = [Reference, JSDOM].map((Constructor) => {
    const { window } = new Constructor("<main style='--z: 3'><p style='--a: 1'></p></main>");
    const node = window.document.querySelector("p")!;
    const view = window.getComputedStyle(node);
    const connected = Array.from(view);
    node.style.setProperty("--b", "2");
    const changed = Array.from(view);
    node.remove();
    const detached = Array.from(view);
    window.close();
    return { connected, changed, detached };
  });
  expect(results[1]).toEqual(results[0]);
});

it("reads longhand initial values through computed declarations only", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor("<p></p>");
    const node = window.document.querySelector("p")!;
    const style = window.getComputedStyle(node);
    for (const [name, value] of [
      ["accent-color", "auto"],
      ["align-items", "normal"],
      ["animation-delay-start", "0s"],
    ] as const) {
      expect(style.getPropertyValue(name)).toBe(value);
      expect(node.style.getPropertyValue(name)).toBe("");
    }
    window.close();
  }
});

it("keeps registrations local to a window and exposes their initial values to retained styles", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor(
      "<style>@property --angle { syntax: '<angle>'; inherits: false; initial-value: 10deg }</style><main style='--angle: 20deg'><p></p></main>",
    );
    const node = window.document.querySelector("p")!;
    const view = window.getComputedStyle(node);
    expect(view.getPropertyValue("--angle")).toBe("10deg");
    window.CSS.registerProperty({
      name: "--count",
      inherits: false,
      syntax: "<number>",
      initialValue: "4",
    });
    expect(view.getPropertyValue("--count")).toBe("4");
    expect(Array.from(view).slice(-2)).toEqual(["--angle", "--count"]);
    expect(() => window.CSS.registerProperty({ name: "--count" })).toThrow();
    window.close();
  }
});

it("matches every enumerated value for an unstyled paragraph", () => {
  const declarations = [Reference, JSDOM].map((Constructor) => {
    const { window } = new Constructor("<p>x</p>");
    const style = window.getComputedStyle(window.document.querySelector("p")!);
    const entries = Array.from(style, (name) => [name, style.getPropertyValue(name!)]);
    window.close();
    return entries;
  });
  expect(declarations[0]).toHaveLength(544);
  expect(declarations[1]).toEqual(declarations[0]);
});

it("applies device media queries to live shorthand components inside resized frames", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor("<iframe style='width:300px'></iframe>");
    const element = window.document.querySelector("iframe");
    if (!(element instanceof window.HTMLIFrameElement) || !element.contentWindow)
      throw new Error("Expected a child Window");
    const frame = element.contentWindow as typeof window;
    const sheet = frame.document.createElement("style");
    sheet.textContent =
      "body { text-decoration: underline; position-area: span-inline-start span-block-end }";
    frame.document.head!.append(sheet);
    const live = frame.getComputedStyle(frame.document.body!);
    sheet.setAttribute("media", "(min-width: 1000px) and (color)");
    expect(live.getPropertyValue("text-decoration-line")).toBe("underline");
    expect(live.getPropertyValue("position-area")).toBe("span-end span-start");
    sheet.setAttribute("media", "not (unknown)");
    expect(live.getPropertyValue("text-decoration-line")).toBe("none");
    window.close();
  }
});

it("keeps overlapping gap shorthands coherent after a longhand edit", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor("<p></p>");
    const style = window.document.querySelector("p")!.style;
    style.setProperty("rule", "5px solid red");
    expect(style.cssText).toBe("rule: 5px solid red;");
    style.setProperty("row-rule-color", "blue");
    expect(style.getPropertyValue("row-rule")).toBe("5px solid blue");
    expect(style.getPropertyValue("column-rule")).toBe("5px solid red");
    style.removeProperty("rule");
    expect(style.length).toBe(0);
    window.close();
  }
});

it("retains the pending shorthand and each leaf's importance through partial overrides", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor("<p></p>");
    const style = window.document.querySelector("p")!.style;
    style.setProperty("rule", "5px solid red");
    style.setProperty("rule", "var(--decoration)", "important");
    expect(style.length).toBe(6);
    expect(style.getPropertyValue("rule")).toBe("var(--decoration)");
    expect(style.getPropertyValue("row-rule-width")).toBe("");
    expect(style.cssText).toBe("rule: var(--decoration) !important;");
    style.setProperty("row-rule-width", "2px");
    expect(style.getPropertyValue("rule")).toBe("");
    expect(style.getPropertyPriority("column-rule-width")).toBe("important");
    window.close();
  }
});

it("reconstructs grid components and suppresses a font shorthand with nondefault reset properties", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor("<p></p>");
    const node = window.document.querySelector("p")!;
    node.style.setProperty("grid", "auto-flow auto / 100px 100px");
    expect(node.style.getPropertyValue("grid-template-columns")).toBe("100px 100px");
    node.style.setProperty("grid-template-areas", '"one two" "three four"');
    expect(node.style.getPropertyValue("grid")).toBe("");
    node.style.setProperty("font", "16px serif");
    node.style.setProperty("font-variant-caps", "all-small-caps");
    expect(node.style.getPropertyValue("font")).toBe("");
    expect(window.getComputedStyle(node).getPropertyValue("font")).toBe("");
    window.close();
  }
});

it("resolves attribute values, conditional branches, cycles and inherited attribute taint", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor("<main data-size='12' data-url='photo.png'><p></p></main>");
    const parent = window.document.querySelector("main")!;
    const child = window.document.querySelector("p")!;
    parent.style.cssText = "--on: yes; --url: attr(data-url); --size: attr(data-size px, 4px)";
    child.style.cssText =
      "width: var(--size); --label: if(style(--on: yes): pass; else: fail); background-image: image-set(var(--url)); --cycle: if(style(--cycle: x): a; else: b)";
    const view = window.getComputedStyle(child);
    expect(view.getPropertyValue("width")).toBe("12px");
    expect(view.getPropertyValue("--label")).toBe("pass");
    expect(view.getPropertyValue("background-image")).toBe("none");
    expect(view.getPropertyValue("--cycle")).toBe("");
    child.setAttribute("data-size", "80");
    parent.setAttribute("data-size", "27");
    expect(view.getPropertyValue("width")).toBe("27px");
    parent.removeAttribute("data-size");
    parent.style.setProperty("--on", "no");
    expect(view.getPropertyValue("width")).toBe("4px");
    expect(view.getPropertyValue("--label")).toBe("fail");
    window.close();
  }
});

it("validates nested calculation dimensions before committing a transform", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor("<p></p>");
    const node = window.document.querySelector("p")!;
    node.style.setProperty("transform", "rotate(acos(1))", "important");
    expect(node.style.getPropertyValue("transform")).toBe("rotate(calc(0deg))");
    node.style.setProperty("transform", "rotate(min(1px, 2deg))");
    expect(node.style.getPropertyPriority("transform")).toBe("important");
    expect(window.getComputedStyle(node).getPropertyValue("transform")).toBe("rotate(0deg)");
    window.close();
  }
});

it("computes registered colors across layer order and stylesheet edits", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor(
      '<style>@layer first, second; @layer second { @property --v { syntax: "<color>"; inherits: false; initial-value: green } } @layer first { @property --v { syntax: "<color>"; inherits: false; initial-value: red } }</style><p></p>',
    );
    const node = window.document.querySelector("p")!;
    const view = window.getComputedStyle(node);
    expect(view.getPropertyValue("--v")).toBe("rgb(0, 128, 0)");
    window.document.styleSheets[0]!.deleteRule(1);
    expect(view.getPropertyValue("--v")).toBe("rgb(255, 0, 0)");
    window.close();
  }
});

it("resolves a live pseudo-element style against its originating element", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor(
      '<style>p::before { content: "x"; font-size: attr(data-size type(<percentage>)); color: green }</style><p data-size="150%" style="font-size:20px;color:red"></p>',
    );
    const node = window.document.querySelector("p")!;
    const view = Reflect.apply(window.getComputedStyle, window, [node, "::before"]);
    expect(view.getPropertyValue("color")).toBe("rgb(0, 128, 0)");
    expect(view.getPropertyValue("font-size")).toBe("30px");
    node.setAttribute("data-size", "300%");
    expect(view.getPropertyValue("font-size")).toBe("60px");
    expect(window.getComputedStyle(node).getPropertyValue("font-size")).toBe("20px");
    expect(Reflect.apply(window.getComputedStyle, window, [node, "::unknown"]).length).toBe(0);
    window.close();
  }
});

it("rolls back the winning rule after branch or attribute substitution", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor(
      "<style>p {color: green} p {--on:yes; color: if(style(--on:yes):revert-rule; else:red)}</style><p></p>",
    );
    const node = window.document.querySelector("p")!;
    const view = window.getComputedStyle(node);
    expect(view.color).toBe("rgb(0, 128, 0)");
    node.style.setProperty("color", "attr(data-key type(*), revert-rule)");
    expect(view.color).toBe("rgb(0, 128, 0)");
    node.setAttribute("data-key", "blue");
    expect(view.color).toBe("rgb(0, 0, 255)");
    window.close();
  }
});

it("computes filter defaults and preserves the specified image and decoration grammars", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor("<p></p>");
    const node = window.document.querySelector("p")!;
    node.style.setProperty("filter", "sepia()");
    expect(window.getComputedStyle(node).getPropertyValue("filter")).toBe("sepia(1)");
    node.style.setProperty("text-decoration-line", "line-through underline");
    expect(node.style.getPropertyValue("text-decoration-line")).toBe("underline line-through");
    node.style.setProperty("background-image", "image-set(url(x))");
    expect(node.style.getPropertyValue("background-image")).toBe('image-set(url("x"))');
    window.close();
  }
});

it("resolves each container axis at the nearest eligible ancestor and reads sibling indices", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor(
      '<main style="container-type:size;width:400px"><div style="container-type:inline-size;writing-mode:vertical-rl;height:300px"><i></i> text <p style="writing-mode:horizontal-tb;margin-left:1cqw;margin-top:1cqh;z-index:sibling-index()"></p></div></main>',
    );
    const node = window.document.querySelector("p")!;
    const style = window.getComputedStyle(node);
    expect(style.getPropertyValue("margin-left")).toBe("4px");
    expect(style.getPropertyValue("margin-top")).toBe("3px");
    expect(style.getPropertyValue("z-index")).toBe("2");
    window.close();
  }
});

it("retains the descriptor grammar and parent rule of parsed font faces and CSS functions", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor(
      "<style>@font-face { font-family: Demo; src: local(Demo) } @function --step(--n) {result: 1px}</style>",
    );
    const rules = window.document.styleSheets[0]!.cssRules;
    const face = rules[0]!;
    const descriptors = Reflect.get(face, "style");
    expect(descriptors.parentRule).toBe(face);
    expect(descriptors.getPropertyValue("src")).toBe("local(Demo)");
    const fn = rules[1]!;
    expect(Reflect.get(fn, "name")).toBe("--step");
    const block = Reflect.get(fn, "cssRules")[0];
    expect(block.parentRule).toBe(fn);
    expect(block.style.result).toBe("1px");
    block.style.result = "2px";
    expect(fn.cssText).toContain("result: 2px");
    window.close();
  }
});

it("updates the browser focus ring on a retained computed declaration", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor("<button>Focus</button>");
    const button = window.document.querySelector("button")!;
    const style = window.getComputedStyle(button);
    Reflect.apply(Reflect.get(button, "focus"), button, []);
    expect(style.getPropertyValue("outline")).toBe("3px auto");
    Reflect.apply(Reflect.get(button, "blur"), button, []);
    expect(style.getPropertyValue("outline-style")).toBe("none");
    window.close();
  }
});

it("resolves a pending background shorthand with registered and CSS-wide custom properties", () => {
  for (const Constructor of [Reference, JSDOM]) {
    const { window } = new Constructor(
      '<style>@property --accent {syntax:"<color>"; inherits:false; initial-value:orange}</style><p style="background:var(--missing,lightgreen);--missing:initial"></p>',
    );
    const node = window.document.querySelector("p")!;
    const style = window.getComputedStyle(node);
    expect(style.getPropertyValue("background-color")).toBe("rgb(144, 238, 144)");
    node.style.setProperty("background", "var(--accent)");
    expect(style.getPropertyValue("background-color")).toBe("rgb(255, 165, 0)");
    window.close();
  }
});

it("serializes border radius after an unrelated inline style change", () => {
  const { window } = new JSDOM('<p style="border-radius: 2px; color: orange"></p>');
  try {
    const element = window.document.querySelector("p")!;
    element.style.color = "red";
    expect(element.getAttribute("style")).toBe("border-radius: 2px; color: red;");
    element.style.setProperty("border-top-right-radius", "4px");
    expect(element.style.getPropertyValue("border-radius")).toBe("2px 4px 2px 2px");
  } finally {
    window.close();
  }
});

it("uses matching declaration grammars for CSS math and URL request modifiers", () => {
  const { window } = new JSDOM(
    '<style>@import url("theme.css" cross-origin(anonymous));</style><p></p>',
    {
      url: "https://example.test/",
    },
  );
  try {
    const target = window.document.querySelector("p")!;
    const image = 'url("https://example.test/a.png" cross-origin(anonymous))';
    expect(window.CSS.supports("background-image", image)).toBe(true);
    target.style.setProperty("background-image", image);
    expect(window.getComputedStyle(target).getPropertyValue("background-image")).toBe(image);
    expect(window.document.styleSheets[0]?.cssRules[0]?.cssText).toBe(
      '@import url("theme.css" cross-origin(anonymous));',
    );
    target.style.setProperty("width", "calc(15vw + 16vmin - 17vh)");
    expect(target.style.getPropertyValue("width")).toBe("calc(-17vh + 16vmin + 15vw)");
  } finally {
    window.close();
  }
});

it("keeps precision through computed math and matches slot rules at the assigning slot", () => {
  const { window } = new JSDOM("<main><i></i><p></p></main>");
  try {
    const host = window.document.querySelector("main")!;
    const target = window.document.querySelector("p")!;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = "<style>slot::slotted(p) { z-index: sibling-index() }</style><slot></slot>";
    target.style.setProperty("font-size", "20px");
    target.style.setProperty("image-resolution", "calc(100dpi + 20dpi * sign(38px - 2em))");
    const computed = window.getComputedStyle(target);
    expect(computed.getPropertyValue("image-resolution")).toBe("0.833333dppx");
    expect(computed.getPropertyValue("z-index")).toBe("2");
    target.style.setProperty("image-resolution", "96dpi");
    expect(computed.getPropertyValue("image-resolution")).toBe("1dppx");
  } finally {
    window.close();
  }
});
