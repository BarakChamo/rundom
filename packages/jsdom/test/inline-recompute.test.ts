// Pins computed styles after inline writes to match a Window that never held the replaced values.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

type Window = JSDOM["window"];

const sheet = `<style>
  main{--tone:rgb(0, 128, 0);font-size:20px}
  section{color:var(--tone);padding:1em}
  p{margin:0.5em;border:1px solid currentcolor}
  .em{width:2em}
  .inherit{opacity:inherit;background-color:inherit}
  p[style*="opacity: 0.25"] + aside{color:rgb(1, 2, 3)}
  section:has(> p[style*="rgb(9, 9, 9)"]) aside{outline-color:rgb(4, 5, 6)}
</style>`;
const body = `<main id=m><section id=s><p id=p><span id=c class="em inherit">x</span></p><aside id=a>y</aside></section><div id=d>z</div></main>`;
const ids = ["m", "s", "p", "c", "a", "d"];

function open(styles: Record<string, string> = {}): Window {
  const { window } = new JSDOM(`<!doctype html>${sheet}${body}`);
  for (const [id, text] of Object.entries(styles)) node(window, id).style.cssText = text;
  return window;
}

function node(window: Window, id: string): InstanceType<Window["HTMLElement"]> {
  const found = window.document.getElementById(id);
  if (!(found instanceof window.HTMLElement)) throw new Error(`Expected element #${id}`);
  return found;
}

// Every computed longhand of every element, so a stale frame anywhere is visible.
function snapshot(window: Window): Record<string, string> {
  const result: Record<string, string> = {};
  for (const id of ids) {
    const style = window.getComputedStyle(node(window, id));
    for (let index = 0; index < style.length; index++) {
      const name = style.item(index);
      result[`${id} ${name}`] = style.getPropertyValue(name);
    }
    for (const name of ["--tone", "--local"])
      result[`${id} ${name}`] = style.getPropertyValue(name);
  }
  return result;
}

// Writes `first` then `second` after warm reads; the result must equal a fresh Window
// whose element only ever received `second`.
function expectFreshAfterRewrite(
  id: string,
  property: string,
  first: string,
  second: string,
  base: Record<string, string> = {},
): void {
  const warm = open(base);
  const fresh = open(base);
  try {
    snapshot(warm);
    node(warm, id).style.setProperty(property, first);
    snapshot(warm);
    node(warm, id).style.setProperty(property, second);
    node(fresh, id).style.setProperty(property, second);
    expect(snapshot(warm)).toEqual(snapshot(fresh));
  } finally {
    warm.close();
    fresh.close();
  }
}

const families: [string, string, string][] = [
  ["opacity", "0.5", "0.25"],
  ["transform", "translate(1px, 2px)", "rotate(10deg)"],
  ["color", "red", "rgb(9, 9, 9)"],
  ["background-color", "currentcolor", "blue"],
  ["width", "10px", "3em"],
  ["height", "auto", "calc(1em + 2px)"],
  ["left", "1px", "2px"],
  ["top", "5%", "auto"],
  ["display", "none", "flex"],
  ["visibility", "hidden", "visible"],
  ["font-size", "10px", "2em"],
  ["margin-top", "3px", "1em"],
  ["margin", "1px 2px", "4px"],
  ["padding", "2px", "1em 3px"],
  ["border", "2px dashed red", "1px solid"],
  ["z-index", "1", "auto"],
  ["position", "absolute", "relative"],
  ["--tone", "rgb(1, 1, 1)", "rgb(2, 2, 2)"],
  ["--local", "1px", "2px"],
  ["direction", "rtl", "ltr"],
  ["line-height", "2", "10px"],
  ["box-shadow", "1px 1px red", "2px 2px currentcolor"],
  ["outline-color", "red", "currentcolor"],
];

describe("CSSStyleDeclaration inline write followed by getComputedStyle", () => {
  for (const [property, first, second] of families) {
    for (const id of ["p", "s", "m"]) {
      it(`should compute ${property} on #${id} and its relatives as a fresh Window does`, () => {
        // Given: warm computed frames for the whole tree
        // When: the element's inline declaration is written twice
        // Then: every element computes exactly what a Window that saw only the last write computes
        expectFreshAfterRewrite(id, property, first, second, { [id]: "color: rgb(7, 7, 7)" });
      });
    }
  }

  it("should restyle a following sibling and a :has() ancestor match keyed on the style attribute", () => {
    // Given: rules whose selectors read the paragraph's style attribute
    // When: the paragraph's inline opacity and color change
    // Then: the sibling and the outline rule follow the attribute
    expectFreshAfterRewrite("p", "opacity", "0.5", "0.25");
    expectFreshAfterRewrite("p", "color", "red", "rgb(9, 9, 9)");
  });

  it("should keep unrelated frames current across interleaved writes to several elements", () => {
    // Given: warm reads, then writes to a sibling, a parent and a leaf between reads
    const warm = open();
    const fresh = open();
    try {
      snapshot(warm);
      node(warm, "a").style.opacity = "0.5";
      expect(warm.getComputedStyle(node(warm, "c")).opacity).toBe("1");
      node(warm, "s").style.fontSize = "30px";
      node(warm, "d").style.color = "red";
      expect(warm.getComputedStyle(node(warm, "c")).width).toBe("60px");
      node(warm, "c").style.left = "4px";
      // When: the same final declarations are set on a fresh Window
      node(fresh, "a").style.opacity = "0.5";
      node(fresh, "s").style.fontSize = "30px";
      node(fresh, "d").style.color = "red";
      node(fresh, "c").style.left = "4px";
      // Then: both Windows compute the same values everywhere
      expect(snapshot(warm)).toEqual(snapshot(fresh));
    } finally {
      warm.close();
      fresh.close();
    }
  });

  it("should observe a DOM change made by a custom element reacting to its style attribute", () => {
    // Given: a custom element that toggles a sibling's class when its style attribute changes
    const window = open();
    try {
      class Reactive extends window.HTMLElement {
        static get observedAttributes(): string[] {
          return ["style"];
        }
        attributeChangedCallback(): void {
          node(window, "d").className = this.style.opacity === "0.5" ? "inherit em" : "";
        }
      }
      window.customElements.define("x-reactive", Reactive);
      const reactive = window.document.createElement("x-reactive");
      node(window, "m").append(reactive);
      const target = node(window, "d");
      expect(window.getComputedStyle(target).width).toBe("auto");
      // When: the custom element's inline opacity is written
      reactive.style.opacity = "0.5";
      // Then: the class set by the reaction applies to the sibling
      expect(window.getComputedStyle(target).width).toBe("40px");
      reactive.style.opacity = "1";
      expect(window.getComputedStyle(target).width).toBe("auto");
    } finally {
      window.close();
    }
  });

  it("should keep a sibling current when a following-sibling rule matches the written attribute", () => {
    // Given: a warm sibling read
    const window = open();
    try {
      const aside = node(window, "a");
      expect(window.getComputedStyle(aside).color).toBe("rgb(0, 128, 0)");
      // When: the preceding paragraph's inline opacity starts and stops matching the rule
      node(window, "p").style.opacity = "0.25";
      // Then: the sibling's color follows
      expect(window.getComputedStyle(aside).color).toBe("rgb(1, 2, 3)");
      node(window, "p").style.opacity = "0.5";
      expect(window.getComputedStyle(aside).color).toBe("rgb(0, 128, 0)");
    } finally {
      window.close();
    }
  });
});
