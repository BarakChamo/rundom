// Compares public declaration syntax and enumeration with the pinned upstream provider.
import { expect, it } from "vitest";
import { JSDOM as Reference } from "jsdom";
import { JSDOM } from "../src/jsdom.js";

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
