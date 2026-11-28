// Pins that values served by the direct CSS tier compute exactly as the general substitution path computes them.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

const easings = [
  "ease",
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "EASE-IN",
  "cubic-bezier(0.4, 0, 0.2, 1)",
  "cubic-bezier(.4,0,.2,1)",
  "cubic-bezier(0.25, 0.1, 0.25, 1)",
  "cubic-bezier(0, 0, 1, 1)",
  "cubic-bezier(0.1234567, -2, 0.5, 3)",
  "ease, linear",
  "cubic-bezier(0.4, 0, 0.2, 1), ease-out",
  "step-start",
  "steps(4, end)",
  "linear(0, 1)",
  "inherit",
];

describe("direct CSS tier", () => {
  it("computes declared easing lists as the substitution path computes them", () => {
    // Given: each easing declared directly and through a custom property on twin elements
    const rules = easings
      .map(
        (easing, index) =>
          `#d${index}{transition-timing-function:${easing}}#v${index}{--e:${easing};transition-timing-function:var(--e)}`,
      )
      .join("");
    const markup = easings.map((_, index) => `<i id="d${index}"></i><i id="v${index}"></i>`);
    const { window } = new JSDOM(`<style>${rules}</style>${markup.join("")}`);
    try {
      for (const [index, easing] of easings.entries()) {
        // When: both computed values are read
        const read = (id: string) =>
          window.getComputedStyle(window.document.getElementById(id)!).transitionTimingFunction;
        // Then: the direct declaration computes to the substituted value
        expect(read(`d${index}`), easing).toBe(read(`v${index}`));
      }
    } finally {
      window.close();
    }
  });

  it("computes Material UI transitions and font declarations unchanged", () => {
    // Given: an Emotion-shaped rule with shorthands and values the tier serializes
    const { window } = new JSDOM(
      `<style>.c{font-family:"Roboto","Helvetica","Arial",sans-serif;font-size:0.875rem;letter-spacing:0.02857em;border-radius:4px 8px;transition:background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,box-shadow 250ms cubic-bezier(0.4,0,0.2,1) 0ms}.c:hover{line-height:1.75}</style><b class="c" id="x"></b>`,
    );
    try {
      // When: the computed values are read
      const style = window.getComputedStyle(window.document.getElementById("x")!);
      // Then: they equal jsdom 31.0.1's computed values
      expect([
        style.fontFamily,
        style.fontSize,
        style.letterSpacing,
        style.borderRadius,
        style.borderBottomLeftRadius,
        style.transitionTimingFunction,
      ]).toEqual([
        "Roboto, Helvetica, Arial, sans-serif",
        "14px",
        "0.39998px",
        "4px 8px",
        "8px",
        "cubic-bezier(0.4, 0, 0.2, 1), cubic-bezier(0.4, 0, 0.2, 1)",
      ]);
      expect(window.document.styleSheets[0]!.cssRules[0]!.cssText).toBe(
        ".c { font-family: Roboto, Helvetica, Arial, sans-serif; font-size: 0.875rem; letter-spacing: 0.02857em; border-radius: 4px 8px; transition: background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms; }",
      );
    } finally {
      window.close();
    }
  });

  it("computes jsdom's user-agent display for form controls and marquee", () => {
    // Given: elements jsdom's default stylesheet makes inline-block, and neighbours it does not
    const { window } = new JSDOM(
      '<input id="a"><button id="b"></button><select id="c"></select><marquee id="d"></marquee><input type="checkbox" id="e"><textarea id="f"></textarea><input type="hidden" id="g"><span id="h"></span>',
    );
    try {
      // When: their computed display is read
      const displays = ["a", "b", "c", "d", "e", "f", "g", "h"].map(
        (id) => window.getComputedStyle(window.document.getElementById(id)!).display,
      );
      // Then: they match jsdom 31.0.1
      expect(displays).toEqual([
        "inline-block",
        "inline-block",
        "inline-block",
        "inline-block",
        "inline-block",
        "inline",
        "none",
        "inline",
      ]);
    } finally {
      window.close();
    }
  });
});
