// Pins computed-style results that incremental cascade reuse must keep current across mutations.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

function element(window: JSDOM["window"], selector: string): HTMLElement {
  const found = window.document.querySelector(selector);
  if (!(found instanceof window.HTMLElement)) throw new Error(`Expected HTML ${selector}`);
  return found;
}

function withWindow(markup: string, run: (window: JSDOM["window"]) => void): void {
  const { window } = new JSDOM(markup);
  try {
    run(window);
  } finally {
    window.close();
  }
}

describe("getComputedStyle var() in evaluated longhands", () => {
  const sheet = `<style>
    .theme{--shadow:0px 1px 2px rgb(1, 2, 3);--origin:2px 3px;--room:8px}
    .alt{--shadow:0px 4px 5px rgb(4, 5, 6);--room:16px}
    .card{box-shadow:var(--shadow);transform-origin:var(--origin);max-width:calc(100% - var(--room));transition:color 1s cubic-bezier(0.4, 0, 0.2, 1)}
    .own{--origin:7px 9px}
  </style>`;

  it("should follow an inherited token when an ancestor class changes", () => {
    // Given: a card substituting tokens inherited from its themed ancestor, read once
    withWindow(
      `${sheet}<main class=theme><section><p class=card><span>x</span></p></section></main>`,
      (window) => {
        const card = element(window, "p");
        const read = () => {
          const style = window.getComputedStyle(card);
          return [style.boxShadow, style.maxWidth, style.transitionTimingFunction];
        };
        const initial = read();
        // When: the ancestor switches theme
        element(window, "main").className = "theme alt";
        // Then: the next read substitutes the new tokens
        expect(initial).toEqual([
          "rgb(1, 2, 3) 0px 1px 2px",
          "calc(100% - 8px)",
          "cubic-bezier(0.4, 0, 0.2, 1)",
        ]);
        expect(read()).toEqual([
          "rgb(4, 5, 6) 0px 4px 5px",
          "calc(100% - 16px)",
          "cubic-bezier(0.4, 0, 0.2, 1)",
        ]);
      },
    );
  });

  it("should follow an inherited token set through ancestor inline style and CSSOM edits", () => {
    // Given: a card whose descendant inherits nothing but whose own tokens come from above
    withWindow(`${sheet}<main class=theme><p class=card></p></main>`, (window) => {
      const card = element(window, "p");
      const origin = () => window.getComputedStyle(card).transformOrigin;
      const before = origin();
      // When: the ancestor overrides a token inline, then the theme rule changes through CSSOM
      element(window, "main").style.setProperty("--origin", "5px 6px");
      const inline = origin();
      element(window, "main").style.removeProperty("--origin");
      const rule = window.document.styleSheets[0]?.cssRules[0];
      if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected the theme rule");
      rule.style.setProperty("--origin", "11px 12px");
      // Then: each read reflects the current token
      expect([before, inline, origin()]).toEqual(["2px 3px", "5px 6px", "11px 12px"]);
    });
  });

  it("should prefer the element's own token and drop it when its class is removed", () => {
    // Given: a card that declares its own origin token
    withWindow(`${sheet}<main class=theme><p class="card own"></p></main>`, (window) => {
      const card = element(window, "p");
      const origin = () => window.getComputedStyle(card).transformOrigin;
      const own = origin();
      // When: the element loses the class declaring the token
      card.className = "card";
      // Then: the inherited token applies
      expect([own, origin()]).toEqual(["7px 9px", "2px 3px"]);
    });
  });

  it("should re-resolve viewport math around an inherited token when the viewport changes", () => {
    // Given: viewport math around an inherited token
    withWindow(
      `<style>main{--room:2px} p{max-width:calc(10vw - var(--room));transition:color 1s cubic-bezier(0, 0, 1, 1)}</style><main><p></p></main>`,
      (window) => {
        const card = element(window, "p");
        window.innerWidth = 1000;
        const narrow = window.getComputedStyle(card).maxWidth;
        // When: the viewport grows
        window.innerWidth = 2000;
        // Then: the substituted length follows it
        expect([narrow, window.getComputedStyle(card).maxWidth]).toEqual(["98px", "198px"]);
      },
    );
  });

  it("should re-resolve a token that reads an attribute when the attribute changes", () => {
    // Given: a token computed from an attribute of the declaring element
    withWindow(
      `<style>p{--room:attr(data-room type(<length>));max-width:calc(100% - var(--room));transition:color 1s cubic-bezier(0, 0, 1, 1)}</style><p data-room=3px></p>`,
      (window) => {
        const card = element(window, "p");
        const first = window.getComputedStyle(card).maxWidth;
        // When: the attribute changes
        card.dataset.room = "9px";
        // Then: the substituted value follows the attribute
        expect([first, window.getComputedStyle(card).maxWidth]).toEqual([
          "calc(100% - 3px)",
          "calc(100% - 9px)",
        ]);
      },
    );
  });
});

describe("getComputedStyle repeated computed writes", () => {
  it("should serialize shorthands from each element's own longhands when values repeat", () => {
    // Given: two elements sharing longhand values, one of them with a complete flex and font family
    withWindow(
      `<style>.a{flex-basis:22px;transition-duration:0.25s;opacity:0.5;font-style:italic} .b{flex-grow:3;flex-shrink:2;flex-basis:22px;transition-duration:0.25s;font-style:italic;font-size:20px;font-family:serif}</style><p class=a></p><p class=b></p>`,
      (window) => {
        // When: both are read in turn, the second reusing values the first validated
        const read = (selector: string) => {
          const style = window.getComputedStyle(element(window, selector));
          return [
            style.flex,
            style.flexBasis,
            style.transitionDuration,
            style.fontStyle,
            style.font,
          ];
        };
        // Then: each shorthand reflects only that element's longhands
        expect(read(".a")).toEqual([
          "0 1 22px",
          "22px",
          "0.25s",
          "italic",
          "italic 16px monospace",
        ]);
        expect(read(".b")).toEqual(["3 2 22px", "22px", "0.25s", "italic", "italic 20px serif"]);
      },
    );
  });
});
