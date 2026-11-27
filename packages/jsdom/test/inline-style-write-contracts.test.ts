// Pins inline style writes, reads, attribute reflection and mutation records to jsdom 31.0.1.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM } = require("jsdom");

// The DOM typings omit CSSOM's named properties; these are the ones the cases use.
type StyleName =
  | "opacity"
  | "transform"
  | "width"
  | "left"
  | "color"
  | "margin"
  | "marginTop"
  | "marginRight"
  | "marginBottom"
  | "marginLeft"
  | "cssFloat"
  | "zIndex"
  | "lineHeight";
type InlineStyle = ReturnType<JSDOM["window"]["getComputedStyle"]> & Record<StyleName, string>;
function inline(style: object): InlineStyle {
  return style as InlineStyle;
}

type Step = readonly [
  label: string,
  write: (style: InlineStyle) => unknown,
  attribute: string | null,
  oldValues: readonly (string | null)[],
];

// Each row: after `write`, the style attribute and cssText equal `attribute`, and the
// observer saw one record per entry in `oldValues` (jsdom 31.0.1 output).
const writeSequence: readonly Step[] = [
  ["opacity", (s) => (s.opacity = "0.5"), "opacity: 0.5;", [null]],
  ["same opacity", (s) => (s.opacity = "0.5"), "opacity: 0.5;", []],
  ["long opacity", (s) => (s.opacity = "0.123456789"), "opacity: 0.123457;", ["opacity: 0.5;"]],
  [
    "numeric opacity",
    (s) => Reflect.set(s, "opacity", 0.25),
    "opacity: 0.25;",
    ["opacity: 0.123457;"],
  ],
  ["invalid opacity", (s) => (s.opacity = "abc"), "opacity: 0.25;", []],
  [
    "transform",
    (s) => (s.transform = "translate(10.5px, 0px) scale(0.5)"),
    "opacity: 0.25; transform: translate(10.5px) scale(0.5);",
    ["opacity: 0.25;"],
  ],
  [
    "same transform",
    (s) => (s.transform = "translate(10.5px, 0px) scale(0.5)"),
    "opacity: 0.25; transform: translate(10.5px) scale(0.5);",
    [],
  ],
  [
    "unclosed transform",
    (s) => (s.transform = "translate(10.5px, 0px"),
    "opacity: 0.25; transform: translate(10.5px);",
    ["opacity: 0.25; transform: translate(10.5px) scale(0.5);"],
  ],
  [
    "width",
    (s) => (s.width = "10px"),
    "opacity: 0.25; transform: translate(10.5px); width: 10px;",
    ["opacity: 0.25; transform: translate(10.5px);"],
  ],
  [
    "zero width",
    (s) => (s.width = "0"),
    "opacity: 0.25; transform: translate(10.5px); width: 0px;",
    ["opacity: 0.25; transform: translate(10.5px); width: 10px;"],
  ],
  [
    "unitless nonzero width",
    (s) => Reflect.set(s, "width", 5),
    "opacity: 0.25; transform: translate(10.5px); width: 0px;",
    [],
  ],
  [
    "important color",
    (s) => s.setProperty("color", "red", "important"),
    "opacity: 0.25; transform: translate(10.5px); width: 0px; color: red !important;",
    ["opacity: 0.25; transform: translate(10.5px); width: 0px;"],
  ],
  [
    "same important color",
    (s) => s.setProperty("color", "red", "important"),
    "opacity: 0.25; transform: translate(10.5px); width: 0px; color: red !important;",
    [],
  ],
  [
    "dropped importance",
    (s) => s.setProperty("color", "red"),
    "opacity: 0.25; transform: translate(10.5px); width: 0px; color: red;",
    ["opacity: 0.25; transform: translate(10.5px); width: 0px; color: red !important;"],
  ],
  [
    "unknown priority",
    (s) => s.setProperty("color", "blue", "bogus"),
    "opacity: 0.25; transform: translate(10.5px); width: 0px; color: red;",
    [],
  ],
  [
    "margin shorthand",
    (s) => (s.margin = "1px 2px"),
    "opacity: 0.25; transform: translate(10.5px); width: 0px; color: red; margin: 1px 2px;",
    ["opacity: 0.25; transform: translate(10.5px); width: 0px; color: red;"],
  ],
  [
    "margin longhand",
    (s) => (s.marginTop = "3px"),
    "opacity: 0.25; transform: translate(10.5px); width: 0px; color: red; margin: 3px 2px 1px;",
    ["opacity: 0.25; transform: translate(10.5px); width: 0px; color: red; margin: 1px 2px;"],
  ],
  [
    "collapsed margin",
    (s) => {
      s.setProperty("margin-left", "3px");
      s.marginRight = "3px";
      s.marginBottom = "3px";
    },
    "opacity: 0.25; transform: translate(10.5px); width: 0px; color: red; margin: 3px;",
    [
      "opacity: 0.25; transform: translate(10.5px); width: 0px; color: red; margin: 3px 2px 1px;",
      "opacity: 0.25; transform: translate(10.5px); width: 0px; color: red; margin: 3px 2px 1px 3px;",
      "opacity: 0.25; transform: translate(10.5px); width: 0px; color: red; margin: 3px 3px 1px;",
    ],
  ],
  [
    "custom property",
    (s) => s.setProperty("--x", " foo "),
    "opacity: 0.25; transform: translate(10.5px); width: 0px; color: red; margin: 3px; --x: foo;",
    ["opacity: 0.25; transform: translate(10.5px); width: 0px; color: red; margin: 3px;"],
  ],
  [
    "same custom property",
    (s) => s.setProperty("--x", " foo "),
    "opacity: 0.25; transform: translate(10.5px); width: 0px; color: red; margin: 3px; --x: foo;",
    [],
  ],
  [
    "vendor alias",
    (s) => s.setProperty("-webkit-transform", "translate(1px)"),
    "opacity: 0.25; transform: translate(1px); width: 0px; color: red; margin: 3px; --x: foo;",
    ["opacity: 0.25; transform: translate(10.5px); width: 0px; color: red; margin: 3px; --x: foo;"],
  ],
  [
    "camel-case vendor alias",
    (s) => Reflect.set(s, "webkitTransform", "translate(2px)"),
    "opacity: 0.25; transform: translate(2px); width: 0px; color: red; margin: 3px; --x: foo;",
    ["opacity: 0.25; transform: translate(1px); width: 0px; color: red; margin: 3px; --x: foo;"],
  ],
  [
    "cssFloat",
    (s) => (s.cssFloat = "left"),
    "opacity: 0.25; transform: translate(2px); width: 0px; color: red; margin: 3px; --x: foo; float: left;",
    ["opacity: 0.25; transform: translate(2px); width: 0px; color: red; margin: 3px; --x: foo;"],
  ],
  [
    "mixed-case name",
    (s) => s.setProperty("Z-Index", "3"),
    "opacity: 0.25; transform: translate(2px); width: 0px; color: red; margin: 3px; --x: foo; float: left; z-index: 3;",
    [
      "opacity: 0.25; transform: translate(2px); width: 0px; color: red; margin: 3px; --x: foo; float: left;",
    ],
  ],
  [
    "empty string removal",
    (s) => (s.opacity = ""),
    "transform: translate(2px); width: 0px; color: red; margin: 3px; --x: foo; float: left; z-index: 3;",
    [
      "opacity: 0.25; transform: translate(2px); width: 0px; color: red; margin: 3px; --x: foo; float: left; z-index: 3;",
    ],
  ],
  [
    "absent removal",
    (s) => s.removeProperty("opacity"),
    "transform: translate(2px); width: 0px; color: red; margin: 3px; --x: foo; float: left; z-index: 3;",
    [],
  ],
  [
    "shorthand removal",
    (s) => s.removeProperty("margin"),
    "transform: translate(2px); width: 0px; color: red; --x: foo; float: left; z-index: 3;",
    [
      "transform: translate(2px); width: 0px; color: red; margin: 3px; --x: foo; float: left; z-index: 3;",
    ],
  ],
  [
    "null removal",
    (s) => Reflect.set(s, "transform", null),
    "width: 0px; color: red; --x: foo; float: left; z-index: 3;",
    ["transform: translate(2px); width: 0px; color: red; --x: foo; float: left; z-index: 3;"],
  ],
  [
    "calc",
    (s) => (s.left = "calc(1px + 2px)"),
    "width: 0px; color: red; --x: foo; float: left; z-index: 3; left: calc(3px);",
    ["width: 0px; color: red; --x: foo; float: left; z-index: 3;"],
  ],
  [
    "var",
    (s) => (s.left = "var(--x, 1px)"),
    "width: 0px; color: red; --x: foo; float: left; z-index: 3; left: var(--x, 1px);",
    ["width: 0px; color: red; --x: foo; float: left; z-index: 3; left: calc(3px);"],
  ],
  [
    "hex color",
    (s) => (s.color = "#ABC"),
    "width: 0px; color: rgb(170, 187, 204); --x: foo; float: left; z-index: 3; left: var(--x, 1px);",
    ["width: 0px; color: red; --x: foo; float: left; z-index: 3; left: var(--x, 1px);"],
  ],
  [
    "cssText",
    (s) => (s.cssText = "top: 1px; opacity: .5"),
    "top: 1px; opacity: 0.5;",
    [
      "width: 0px; color: rgb(170, 187, 204); --x: foo; float: left; z-index: 3; left: var(--x, 1px);",
    ],
  ],
  [
    "same cssText",
    (s) => (s.cssText = "top: 1px; opacity: .5"),
    "top: 1px; opacity: 0.5;",
    ["top: 1px; opacity: 0.5;"],
  ],
  [
    "write after cssText",
    (s) => (s.opacity = "1"),
    "top: 1px; opacity: 1;",
    ["top: 1px; opacity: 0.5;"],
  ],
  [
    "long numeric values",
    (s) => {
      s.opacity = "0.10000000";
      s.zIndex = "0.10000000";
      s.setProperty("--n", "0.10000000");
    },
    "top: 1px; opacity: 0.1; --n: 0.10000000;",
    ["top: 1px; opacity: 1;", "top: 1px; opacity: 0.1;"],
  ],
];

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: reference.JSDOM },
])("$name inline style writes", ({ Constructor }) => {
  it("reflects each write into the style attribute with jsdom's mutation records", () => {
    // Given: an observed element with no style attribute.
    const { window } = new Constructor();
    try {
      const element = window.document.createElement("div");
      const observer = new window.MutationObserver(() => {});
      observer.observe(element, { attributes: true, attributeOldValue: true });
      for (const [label, write, attribute, oldValues] of writeSequence) {
        // When: one step of valid, invalid, same-value and removal writes runs.
        write(inline(element.style));
        // Then: the attribute, cssText and records match jsdom exactly.
        const records = observer.takeRecords();
        expect([label, element.getAttribute("style")]).toEqual([label, attribute]);
        expect([label, element.style.cssText]).toEqual([label, attribute ?? ""]);
        expect([label, records.map((record) => record.oldValue)]).toEqual([label, oldValues]);
        expect(records.every((record) => record.attributeName === "style")).toBe(true);
      }
    } finally {
      window.close();
    }
  });

  it("reads longhands, shorthands and aliases through every accessor", () => {
    // Given: longhand, shorthand, float and important declarations.
    const { window } = new Constructor();
    try {
      const style = inline(window.document.createElement("div").style);
      style.opacity = "0.25";
      style.margin = "3px";
      style.cssFloat = "left";
      style.setProperty("color", "red", "important");
      // When/Then: named properties, getPropertyValue and priorities agree with jsdom.
      expect([style.getPropertyValue("opacity"), style.opacity]).toEqual(["0.25", "0.25"]);
      expect([style.margin, style.getPropertyValue("margin"), style.marginTop]).toEqual([
        "3px",
        "3px",
        "3px",
      ]);
      expect([
        style.cssFloat,
        Reflect.get(style, "float"),
        style.getPropertyValue("float"),
      ]).toEqual(["left", "left", "left"]);
      expect([style.getPropertyPriority("color"), style.getPropertyPriority("opacity")]).toEqual([
        "important",
        "",
      ]);
      expect(style.getPropertyValue("bogus")).toBe("");
    } finally {
      window.close();
    }
  });

  it("judges same-value writes by the serialized block rather than the attribute text", () => {
    // Given: an observed element whose style attribute is changed around property writes.
    const { window } = new Constructor();
    try {
      const element = window.document.createElement("div");
      const observer = new window.MutationObserver(() => {});
      observer.observe(element, { attributes: true, attributeOldValue: true });
      const oldValues = () => observer.takeRecords().map((record) => record.oldValue);
      const observed: unknown[] = [];
      // When: writes follow attribute sets, removals and repeated values.
      inline(element.style).opacity = "0.5";
      observed.push(oldValues());
      element.setAttribute("style", "opacity: 0.7");
      observed.push(oldValues(), inline(element.style).opacity);
      inline(element.style).opacity = "0.5";
      observed.push(oldValues(), element.getAttribute("style"));
      element.removeAttribute("style");
      observed.push(oldValues(), element.style.cssText);
      inline(element.style).opacity = "0.5";
      observed.push(oldValues(), element.getAttribute("style"));
      inline(element.style).opacity = "0.6";
      inline(element.style).opacity = "0.5";
      observed.push(oldValues());
      element.setAttribute("style", "opacity:0.5");
      observed.push(oldValues());
      inline(element.style).opacity = "0.5";
      observed.push(oldValues(), element.getAttribute("style"));
      element.style.removeProperty("opacity");
      inline(element.style).opacity = "0.5";
      observed.push(oldValues(), element.getAttribute("style"));
      // Then: records and attribute text match jsdom.
      expect(observed).toEqual([
        [null],
        ["opacity: 0.5;"],
        "0.7",
        ["opacity: 0.7"],
        "opacity: 0.5;",
        ["opacity: 0.5;"],
        "",
        [null],
        "opacity: 0.5;",
        ["opacity: 0.5;", "opacity: 0.6;"],
        ["opacity: 0.5;"],
        [],
        "opacity:0.5",
        ["opacity:0.5", ""],
        "opacity: 0.5;",
      ]);
    } finally {
      window.close();
    }
  });

  it("parses a style attribute and reserializes it on the next property write", () => {
    // Given: an element whose style attribute uses noncanonical spelling.
    const { window } = new Constructor();
    try {
      const element = window.document.createElement("div");
      element.setAttribute(
        "style",
        "opacity: 0.50; transform: translate(1px,2px); MARGIN: 1px; color: RED !important",
      );
      const style = inline(element.style);
      // When/Then: reads expose canonical specified values without touching the attribute.
      expect([
        style.opacity,
        style.transform,
        style.margin,
        style.marginLeft,
        style.color,
        style.getPropertyPriority("color"),
        style.cssText,
        element.getAttribute("style"),
      ]).toEqual([
        "0.5",
        "translate(1px, 2px)",
        "1px",
        "1px",
        "red",
        "important",
        "opacity: 0.5; transform: translate(1px, 2px); margin: 1px; color: red !important;",
        "opacity: 0.50; transform: translate(1px,2px); MARGIN: 1px; color: RED !important",
      ]);
      // When: a property is written and then the attribute is replaced.
      style.opacity = "0.7";
      const written = element.getAttribute("style");
      element.setAttribute("style", "width: 3px");
      // Then: the write reserializes the block and the attribute replaces it wholesale.
      expect(written).toBe(
        "opacity: 0.7; transform: translate(1px, 2px); margin: 1px; color: red !important;",
      );
      expect([style.opacity, style.width, style.cssText]).toEqual(["", "3px", "width: 3px;"]);
    } finally {
      window.close();
    }
  });

  it("calls attributeChangedCallback once per serialized change", () => {
    // Given: a custom element observing its style attribute.
    const { window } = new Constructor();
    try {
      const log: unknown[] = [];
      class Watcher extends window.HTMLElement {
        static get observedAttributes(): string[] {
          return ["style"];
        }
        attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
          log.push([name, oldValue, newValue]);
        }
      }
      window.customElements.define("x-watch", Watcher);
      const style = inline(window.document.createElement("x-watch").style);
      // When: changing, repeated, invalid and removal writes run.
      style.opacity = "0.5";
      style.opacity = "0.5";
      style.opacity = "bogus";
      style.transform = "scale(2)";
      style.removeProperty("opacity");
      style.removeProperty("opacity");
      style.cssText = "top: 1px";
      style.cssText = "top: 1px";
      // Then: only serialized changes and every cssText assignment call back.
      expect(log).toEqual([
        ["style", null, "opacity: 0.5;"],
        ["style", "opacity: 0.5;", "opacity: 0.5; transform: scale(2);"],
        ["style", "opacity: 0.5; transform: scale(2);", "transform: scale(2);"],
        ["style", "transform: scale(2);", "top: 1px;"],
        ["style", "top: 1px;", "top: 1px;"],
      ]);
    } finally {
      window.close();
    }
  });

  it("keeps computed style current across interleaved inline writes", () => {
    // Given: a connected element with a stylesheet opacity.
    const { window } = new Constructor("<style>.a{opacity:0.25}</style><div class=a></div>");
    try {
      const target = window.document.querySelector(".a");
      if (!(target instanceof window.HTMLElement)) throw new Error("Expected target");
      const seen: unknown[] = [inline(window.getComputedStyle(target)).opacity];
      // When: inline writes and removals alternate with computed reads.
      inline(target.style).opacity = "0.5";
      seen.push(inline(window.getComputedStyle(target)).opacity);
      inline(target.style).opacity = "";
      seen.push(inline(window.getComputedStyle(target)).opacity);
      target.style.setProperty("opacity", "0.75", "important");
      seen.push(inline(window.getComputedStyle(target)).opacity, target.getAttribute("style"));
      inline(target.style).transform = "translate(3px, 4px)";
      seen.push(inline(window.getComputedStyle(target)).transform);
      // Then: every read sees the latest inline declaration.
      expect(seen).toEqual([
        "0.25",
        "0.5",
        "0.25",
        "0.75",
        "opacity: 0.75 !important;",
        "translate(3px, 4px)",
      ]);
    } finally {
      window.close();
    }
  });

  it("serializes repeated values identically for different properties and elements", () => {
    // Given: the same value text written to properties with different grammars.
    const { window } = new Constructor();
    try {
      const first = inline(window.document.createElement("div").style);
      const second = inline(window.document.createElement("span").style);
      // When: each element receives the same writes in a different order.
      for (const style of [first, second, first]) {
        style.opacity = "0.30000000";
        style.zIndex = "0.30000000";
        style.lineHeight = "0.30000000";
        style.setProperty("--v", "0.30000000");
        style.transform = "rotate(0.30000000deg)";
      }
      // Then: each property keeps its own canonical value.
      const expected =
        "opacity: 0.3; line-height: 0.3; --v: 0.30000000; transform: rotate(0.3deg);";
      expect([first.cssText, second.cssText]).toEqual([expected, expected]);
    } finally {
      window.close();
    }
  });
});
