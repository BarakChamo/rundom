// Pins what live computed-style views expose while their snapshots are resolved internally.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

type Window = JSDOM["window"];

function withWindow(markup: string, run: (window: Window) => void): void {
  const { window } = new JSDOM(`<!doctype html>${markup}`);
  try {
    run(window);
  } finally {
    window.close();
  }
}

describe("getComputedStyle live views", () => {
  it("should keep a retained view live and indexed after its element changes", () => {
    // Given: a retained computed view of a styled element
    withWindow(`<style>.a{color:rgb(1, 2, 3)}.b{color:red}</style><p class=a>x</p>`, (window) => {
      const p = window.document.querySelector("p")!;
      const view = window.getComputedStyle(p);
      expect(view.color).toBe("rgb(1, 2, 3)");
      // When: the element's class changes after the first read
      p.className = "b";
      // Then: the same view reads the new value and still behaves as a full declaration
      expect(view.color).toBe("rgb(255, 0, 0)");
      expect(view.getPropertyValue("color")).toBe("rgb(255, 0, 0)");
      expect(view).toBeInstanceOf(window.CSSStyleDeclaration);
      expect(Object.prototype.toString.call(view)).toBe("[object CSSStyleProperties]");
      expect(view.length).toBeGreaterThan(0);
      expect(view[0]).toBe(view.item(0));
      expect(() => {
        view.color = "blue";
      }).toThrow(/NoModificationAllowed|read-only|readonly/i);
    });
  });

  it("should serialize each color correctly when reads alternate between elements", () => {
    // Given: elements whose colors are canonical, non-canonical, translucent and named
    withWindow(
      `<style>#a{color:rgb(1, 2, 3)}#b{color:rgb(1,2,3)}#c{color:rgba(1, 2, 3, 0.5)}#d{color:red}#e{color:rgba(1, 2, 3, 1)}</style>` +
        `<i id=a></i><i id=b></i><i id=c></i><i id=d></i><i id=e></i>`,
      (window) => {
        const ids = ["a", "b", "c", "d", "e", "a", "d", "b", "a"];
        // When: their colors are read in an interleaved order
        const colors = ids.map(
          (id) => window.getComputedStyle(window.document.getElementById(id)!).color,
        );
        // Then: every read returns that element's computed serialization
        expect(colors).toEqual([
          "rgb(1, 2, 3)",
          "rgb(1, 2, 3)",
          "rgba(1, 2, 3, 0.5)",
          "rgb(255, 0, 0)",
          "rgb(1, 2, 3)",
          "rgb(1, 2, 3)",
          "rgb(255, 0, 0)",
          "rgb(1, 2, 3)",
          "rgb(1, 2, 3)",
        ]);
      },
    );
  });

  it("should reject methods borrowed onto anything but a public view", () => {
    // Given: a computed view and a user proxy around it
    withWindow(`<p>x</p>`, (window) => {
      const view = window.getComputedStyle(window.document.querySelector("p")!);
      const read = window.CSSStyleDeclaration.prototype.getPropertyValue;
      // When: the method is invoked on the view, on a proxy of it and on a plain object
      // Then: only the view itself is a valid receiver
      expect(read.call(view, "display")).toBe("block");
      expect(() => read.call(new Proxy(view, {}), "display")).toThrow(TypeError);
      expect(() => read.call(Object.create(view), "display")).toThrow(TypeError);
    });
  });

  it("should reject user proxies around inline and computed views read through their traps", () => {
    // Given: an inline style written through the view and one parsed from the attribute
    withWindow(`<p style="color: red">x</p><i></i>`, (window) => {
      const p = window.document.querySelector("p")!;
      const i = window.document.querySelector("i")!;
      i.style.color = "blue";
      const color = Object.getOwnPropertyDescriptor(
        window.CSSStyleProperties.prototype,
        "color",
      )!.get!;
      for (const [element, expected] of [
        [p, "red"],
        [i, "blue"],
      ] as const) {
        const style = element.style;
        const computed = window.getComputedStyle(element);
        // When: each view is read through a forwarding user proxy, and directly after another
        //   view's trap ran
        // Then: only the views themselves are valid receivers
        expect(() => new Proxy(style, {}).color).toThrow(TypeError);
        expect(() => color.call(new Proxy(style, {}))).toThrow(TypeError);
        expect(() => new Proxy(computed, {}).color).toThrow(TypeError);
        void window.document.createElement("b").style.color;
        expect(color.call(style)).toBe(expected);
        void window.getComputedStyle(p).display;
        expect(color.call(computed)).toBe(expected === "red" ? "rgb(255, 0, 0)" : "rgb(0, 0, 255)");
      }
    });
  });
});
