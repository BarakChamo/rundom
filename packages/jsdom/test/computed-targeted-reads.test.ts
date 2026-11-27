// Pins that single computed-property reads agree with full enumeration regardless of read order.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

type Snapshot = Record<string, string>;
type Element = InstanceType<JSDOM["window"]["Element"]>;

// Reads the camel-cased property accessor exactly as accessibility helpers do.
function read(style: object, name: string): string {
  return String(Reflect.get(style, name));
}

const documents: Record<string, string> = {
  "authored classes, ids and inheritance": `<style>
      .shell { display: flex; padding: 8px 16px; margin: 0; font: italic 600 14px/1.5 Roboto, sans-serif; letter-spacing: .01em; border: 1px solid rgba(0,0,0,.12); border-radius: 4px; color: #333 }
      #panel { visibility: hidden; background-color: #fff; box-sizing: border-box; position: relative }
      .item { display: list-item; margin-inline-start: 2em; text-align: center; line-height: 2 }
      .item > span { display: inline-block; width: 50%; font-size: 1.25em; cursor: pointer }
      .reveal { visibility: visible; opacity: .5 }
    </style>
    <div class="shell"><section id="panel"><ul><li class="item"><span>a</span></li><li class="item reveal"><span>b</span></li></ul></section></div>`,
  "explicit inheritance of non-inherited properties": `<style>
      main { display: grid; border: 2px dashed red; padding: 3px; overflow: hidden; z-index: 3; position: absolute }
      section { display: inherit; border-top: inherit; padding: inherit; overflow-x: inherit; z-index: inherit; position: inherit }
      p { display: unset; padding-left: initial; float: revert; margin: inherit }
    </style>
    <main><section><p><b>x</b></p></section></main>`,
  "important and inline declarations": `<style>
      div { display: block !important; color: green !important; padding: 4px }
      .a { display: none; color: red; padding: 9px !important }
    </style>
    <div class="a" style="display: inline; visibility: hidden; padding: 1px; margin: 2px"><span style="visibility: visible">t</span></div>`,
  "custom properties and var()": `<style>
      :root { --gap: 12px; --tone: rgb(1, 2, 3); --shown: block }
      .v { display: var(--shown); padding: var(--gap) calc(var(--gap) * 2); color: var(--tone); border-color: var(--missing, currentColor); border-style: solid }
      .v .w { --tone: rgb(9, 8, 7); visibility: var(--vis, visible); margin: var(--gap); width: var(--gap) }
    </style>
    <div class="v"><p class="w"><em>z</em></p></div>`,
  "media queries": `<style>
      .m { display: block; padding: 1px }
      @media (min-width: 1px) { .m { display: flex; padding: 5px; visibility: hidden } }
      @media (max-width: 1px) { .m { display: none } }
      @media print { .m span { display: none } }
    </style>
    <div class="m"><span>q</span></div>`,
  "state selectors": `<style>
      input:checked { display: none; outline: 3px solid red }
      input:focus { visibility: hidden }
      label:has(input:checked) { display: flex; color: blue }
    </style>
    <label><input type="checkbox" checked><span>l</span></label><input id="f">`,
  "shadow DOM": `<style>host-box { display: block; letter-spacing: 3px } host-box::part(label) { padding: 2px }</style>
    <host-box><i slot="s">slotted</i></host-box>`,
};

function elementsOf(window: JSDOM["window"]): Element[] {
  const host = window.document.querySelector("host-box");
  const shadow = host?.shadowRoot ?? host?.attachShadow({ mode: "open" });
  if (shadow && !shadow.childNodes.length)
    shadow.innerHTML =
      "<style>:host { padding: 4px } div { display: flex; visibility: hidden } ::slotted(i) { display: block }</style><div><span part=label>p</span><slot name=s></slot></div>";
  return [window.document, ...(shadow ? [shadow] : [])]
    .flatMap((root) => [...root.querySelectorAll("*")])
    .filter((element) => element.localName !== "style");
}

function enumerate(window: JSDOM["window"], element: Element): Snapshot {
  const style = window.getComputedStyle(element);
  const snapshot: Snapshot = {};
  for (const name of Array.from(style)) if (name) snapshot[name] = style.getPropertyValue(name);
  return snapshot;
}

function withWindow<T>(markup: string, read: (window: JSDOM["window"]) => T): T {
  const { window } = new JSDOM(`<!doctype html><html><head></head><body>${markup}</body></html>`);
  try {
    const field = window.document.querySelector("#f");
    if (field instanceof window.HTMLElement) field.focus();
    return read(window);
  } finally {
    window.close();
  }
}

// Testing Library reads visibility on the target, then display on every ancestor.
function accessibilityReads(
  window: JSDOM["window"],
): Map<Element, { display: string; visibility: string }> {
  const reads = new Map<Element, { display: string; visibility: string }>();
  for (const element of elementsOf(window).toReversed()) {
    const visibility = read(window.getComputedStyle(element), "visibility");
    for (let current: Element | null = element; current; current = current.parentElement) {
      const display = window.getComputedStyle(current).display;
      const known = reads.get(current);
      if (known && known.display !== display) throw new Error("Display changed between reads");
      if (current === element) reads.set(element, { display, visibility });
    }
  }
  return reads;
}

describe("Window.getComputedStyle single-property reads", () => {
  for (const [name, markup] of Object.entries(documents)) {
    it(`should agree with full enumeration in any read order for ${name}`, () => {
      // Given: the same document read in three different orders.
      const topDown = withWindow(markup, (window) =>
        elementsOf(window).map((element) => enumerate(window, element)),
      );
      const bottomUp = withWindow(markup, (window) =>
        elementsOf(window)
          .toReversed()
          .map((element) => enumerate(window, element))
          .toReversed(),
      );
      // When: accessibility-style single reads precede enumeration.
      const [single, afterSingle] = withWindow(markup, (window) => {
        const reads = accessibilityReads(window);
        const elements = elementsOf(window);
        return [
          elements.map((element) => reads.get(element)),
          elements.map((element) => enumerate(window, element)),
        ] as const;
      });
      // Then: every path yields the same computed values.
      expect(afterSingle).toEqual(topDown);
      expect(bottomUp).toEqual(topDown);
      expect(single).toEqual(
        topDown.map((snapshot) => ({
          display: snapshot["display"],
          visibility: snapshot["visibility"],
        })),
      );
    }, 60_000);
  }

  it("should return a fresh live object for every ancestor read", () => {
    // Given: an ancestor whose frame was computed for a descendant target.
    withWindow(markup(), (window) => {
      const leaf = window.document.querySelector("b");
      const parent = leaf?.parentElement;
      if (!leaf || !parent) throw new Error("Expected a leaf and parent");
      expect(read(window.getComputedStyle(leaf), "visibility")).toBe("visible");
      // When: the ancestor is read twice and then restyled.
      const first = window.getComputedStyle(parent);
      const second = window.getComputedStyle(parent);
      expect(first).not.toBe(second);
      expect(first.display).toBe("flex");
      parent.style.setProperty("display", "none");
      // Then: earlier objects observe the current cascade like a fresh read.
      expect(first.display).toBe("none");
      expect(second.getPropertyValue("display")).toBe("none");
      expect(window.getComputedStyle(parent).display).toBe("none");
      expect(window.getComputedStyle(leaf).getPropertyValue("letter-spacing")).toBe("2px");
    });
    function markup(): string {
      return "<style>p { display: flex; letter-spacing: 2px; padding: 1px }</style><p><b>x</b></p>";
    }
  });

  it("should resolve explicit inheritance from a lazily resolved ancestor", () => {
    // Given: an ancestor computed only for its descendants.
    withWindow(
      "<style>div { padding: 7px; border-left: 3px solid red } p { padding-top: inherit; border-left-width: inherit; border-left-style: inherit }</style><div><p><i>t</i></p></div>",
      (window) => {
        const leaf = window.document.querySelector("i");
        const paragraph = window.document.querySelector("p");
        if (!leaf || !paragraph) throw new Error("Expected a paragraph and leaf");
        expect(window.getComputedStyle(leaf).display).toBe("inline");
        // When: the child reads non-inherited values inherited explicitly.
        const style = window.getComputedStyle(paragraph);
        // Then: the parent values are complete.
        expect(read(style, "paddingTop")).toBe("7px");
        expect(style.getPropertyValue("border-left-width")).toBe("3px");
        expect(read(style, "paddingBottom")).toBe("0px");
      },
    );
  });
});
