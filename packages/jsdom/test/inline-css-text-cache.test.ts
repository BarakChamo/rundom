// Pins inline cssText reads after every mutation path to match a declaration that was never read.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

type Window = JSDOM["window"];
type Styled = InstanceType<Window["HTMLElement"]>;
type Mutation = (element: Styled, window: Window) => void;

function target(window: Window): Styled {
  const found = window.document.getElementById("t");
  if (!(found instanceof window.HTMLElement)) throw new Error("Expected styled element");
  return found;
}

// Applies the mutations to a warm element (cssText read after each) and to a cold one
// (never read until the end); both must serialize identically after every step.
function expectSameText(mutations: Mutation[]): void {
  const markup = `<!doctype html><base href="https://a.test/x/"><div id=t style="color: red; width: 1px"></div>`;
  const { window: warm } = new JSDOM(markup);
  try {
    const element = target(warm);
    expect(element.style.cssText).toBe("color: red; width: 1px;");
    for (const [index, mutate] of mutations.entries()) {
      mutate(element, warm);
      const { window: cold } = new JSDOM(markup);
      try {
        const fresh = target(cold);
        for (const step of mutations.slice(0, index + 1)) step(fresh, cold);
        expect(element.style.cssText).toBe(fresh.style.cssText);
        expect(element.style.cssText).toBe(element.style.cssText);
      } finally {
        cold.close();
      }
    }
  } finally {
    warm.close();
  }
}

describe("CSSStyleDeclaration.cssText on an inline declaration", () => {
  it("should follow setProperty, property setters and priorities", () => {
    // Given: a warm inline declaration
    // When: values and priorities change through each public setter
    // Then: every read matches a declaration that was never read
    expectSameText([
      (e) => e.style.setProperty("opacity", "0.5"),
      (e) => Reflect.set(e.style, "opacity", "0.25"),
      (e) => e.style.setProperty("opacity", "0.25", "important"),
      (e) => e.style.setProperty("color", "blue"),
      (e) => e.style.setProperty("opacity", "1"),
    ]);
  });

  it("should follow removeProperty, the cssText setter and invalid writes", () => {
    expectSameText([
      (e) => e.style.removeProperty("color"),
      (e) => Reflect.set(e.style, "cssText", "left: 2px; margin: 1px 2px"),
      (e) => e.style.setProperty("left", "not a length"),
      (e) => e.style.removeProperty("margin-left"),
      (e) => Reflect.set(e.style, "cssText", ""),
    ]);
  });

  it("should follow attribute writes, removal and shorthand interplay", () => {
    expectSameText([
      (e) => e.setAttribute("style", "border: 1px solid red; padding: 2px"),
      (e) => Reflect.set(e.style, "borderTopColor", "blue"),
      (e) => e.style.setProperty("padding-left", "3px"),
      (e) => Reflect.set(e.style, "margin", "var(--m)"),
      (e) => e.removeAttribute("style"),
      (e) => Reflect.set(e.style, "background", "url(a.png) no-repeat"),
    ]);
  });

  it("should follow URL values resolved against a changed document base", () => {
    expectSameText([
      (e) => e.style.setProperty("background-image", "url(a.png)"),
      (_, w) => w.document.querySelector("base")?.setAttribute("href", "https://b.test/y/"),
      (e) => e.style.setProperty("list-style-image", "url(b.png)"),
    ]);
  });
});
