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
