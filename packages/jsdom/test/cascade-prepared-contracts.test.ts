// Pins cascade results that shared, per-text preparation of rules and media queries must not change.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

type TestWindow = JSDOM["window"];

function withWindow(markup: string, run: (window: TestWindow) => void): void {
  const { window } = new JSDOM(markup);
  try {
    run(window);
  } finally {
    window.close();
  }
}

function element(window: TestWindow, selector: string) {
  const found = window.document.querySelector(selector);
  if (!found) throw new Error(`Expected ${selector}`);
  return found;
}

function styleRule(window: TestWindow, sheetIndex: number, ruleIndex: number) {
  const rule = window.document.styleSheets[sheetIndex]?.cssRules[ruleIndex];
  if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected a style rule");
  return rule;
}

describe("getComputedStyle with media rules", () => {
  it("should follow viewport changes after a media query was evaluated", () => {
    // Given: two sheets share one media condition and the narrow result was already read
    withWindow(
      "<style>@media (min-width: 1200px){p{color:blue}}</style><style>@media (min-width: 1200px){i{color:red}}</style><p></p><i></i>",
      (window) => {
        window.innerWidth = 1000;
        expect(window.getComputedStyle(element(window, "p")).color).toBe("rgb(0, 0, 0)");
        expect(window.getComputedStyle(element(window, "i")).color).toBe("rgb(0, 0, 0)");
        // When: the viewport widens and then narrows again
        window.innerWidth = 1400;
        const wide = [
          window.getComputedStyle(element(window, "p")).color,
          window.getComputedStyle(element(window, "i")).color,
        ];
        window.innerWidth = 1000;
        // Then: every rule reevaluates the shared condition
        expect(wide).toEqual(["rgb(0, 0, 255)", "rgb(255, 0, 0)"]);
        expect(window.getComputedStyle(element(window, "p")).color).toBe("rgb(0, 0, 0)");
      },
    );
  });

  it("should keep each MediaList independent when rules share media text", () => {
    // Given: two media rules with the same condition text
    withWindow(
      "<style>@media (min-width: 1200px){p{color:blue}} @media (min-width: 1200px){i{color:red}}</style><p></p><i></i>",
      (window) => {
        window.innerWidth = 1400;
        const rules = window.document.styleSheets[0]?.cssRules;
        const first = rules?.[0],
          second = rules?.[1];
        if (!(first instanceof window.CSSMediaRule) || !(second instanceof window.CSSMediaRule))
          throw new Error("Expected media rules");
        expect(window.getComputedStyle(element(window, "p")).color).toBe("rgb(0, 0, 255)");
        // When: one rule's list is edited through each MediaList mutation route
        first.media.appendMedium("print");
        first.media.deleteMedium("(min-width: 1200px)");
        // Then: only that rule changes, and later parses of the same text stay pristine
        expect([first.media.mediaText, first.media.length, first.media.item(0)]).toEqual([
          "print",
          1,
          "print",
        ]);
        expect([second.media.mediaText, second.media.length, second.media[0]]).toEqual([
          "(min-width: 1200px)",
          1,
          "(min-width: 1200px)",
        ]);
        expect(window.getComputedStyle(element(window, "p")).color).toBe("rgb(0, 0, 0)");
        expect(window.getComputedStyle(element(window, "i")).color).toBe("rgb(255, 0, 0)");
        const sheet = new window.CSSStyleSheet({ media: "(min-width: 1200px)" });
        expect([sheet.media.mediaText, sheet.media.length]).toEqual(["(min-width: 1200px)", 1]);
        first.media.mediaText = "(min-width: 1200px)";
        expect(window.getComputedStyle(element(window, "p")).color).toBe("rgb(0, 0, 255)");
      },
    );
  });

  it("should serialize invalid and mixed media lists the same way on repeated parses", () => {
    // Given: media lists that mix valid, invalid and uppercase queries
    withWindow("<p></p>", (window) => {
      const read = () => {
        const sheet = new window.CSSStyleSheet({
          media: "SCREEN AND (MIN-WIDTH:10PX), foo(, print",
        });
        return [sheet.media.mediaText, sheet.media.length, sheet.media.item(1)];
      };
      // When: the same text is parsed twice
      const first = read();
      // Then: both parses serialize identically
      expect(read()).toEqual(first);
      expect(first).toEqual(["screen and (min-width: 10px), foo(, print)", 2, "foo(, print)"]);
    });
  });
});

describe("getComputedStyle after rule mutation", () => {
  it("should see CSSOM declaration edits made after a computed read", () => {
    // Given: a rule whose declarations were already used by the cascade
    withWindow("<style>p{color:red;margin:1px 2px}</style><p></p>", (window) => {
      const p = element(window, "p");
      const rule = styleRule(window, 0, 0);
      expect(window.getComputedStyle(p).getPropertyValue("margin-left")).toBe("2px");
      // When: the rule changes through setProperty, removeProperty and cssText
      rule.style.setProperty("margin-left", "7px");
      const afterSet = window.getComputedStyle(p).getPropertyValue("margin-left");
      rule.style.removeProperty("color");
      const afterRemove = window.getComputedStyle(p).color;
      rule.style.cssText = "padding: 3px 4px !important; color: blue";
      // Then: each edit reaches the next computed read
      expect([afterSet, afterRemove]).toEqual(["7px", "rgb(0, 0, 0)"]);
      const style = window.getComputedStyle(p);
      expect([
        style.getPropertyValue("padding-right"),
        style.getPropertyValue("margin-left"),
        style.color,
      ]).toEqual(["4px", "0px", "rgb(0, 0, 255)"]);
    });
  });

  it("should see rule replacement and stylesheet text replacement", () => {
    // Given: an element styled by a stylesheet rule that was already read
    withWindow("<style>p{color:red}</style><p></p>", (window) => {
      const p = element(window, "p");
      const sheet = window.document.styleSheets[0];
      if (!sheet) throw new Error("Expected a stylesheet");
      expect(window.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
      // When: the rule is replaced and then the owner element's text changes
      sheet.deleteRule(0);
      sheet.insertRule("p{color:green}", 0);
      const replaced = window.getComputedStyle(p).color;
      const owner = element(window, "style");
      owner.textContent = "p{color:blue}";
      // Then: computed style follows both replacements
      expect(replaced).toBe("rgb(0, 128, 0)");
      expect(window.getComputedStyle(p).color).toBe("rgb(0, 0, 255)");
    });
  });

  it("should see replaceSync on a sheet adopted by a document and a shadow root", () => {
    // Given: one constructed sheet adopted in two scopes
    withWindow("<p></p><div></div>", (window) => {
      const { document } = window;
      const sheet = new window.CSSStyleSheet();
      sheet.replaceSync("p{color:red}");
      const host = element(window, "div");
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = "<p></p>";
      const inner = shadow.querySelector("p");
      if (!inner) throw new Error("Expected a shadow paragraph");
      document.adoptedStyleSheets = [sheet];
      shadow.adoptedStyleSheets = [sheet];
      expect(window.getComputedStyle(element(window, "p")).color).toBe("rgb(255, 0, 0)");
      expect(window.getComputedStyle(inner).color).toBe("rgb(255, 0, 0)");
      // When: the shared sheet's text is replaced
      sheet.replaceSync("p{color:blue}");
      // Then: both scopes read the new declarations
      expect(window.getComputedStyle(element(window, "p")).color).toBe("rgb(0, 0, 255)");
      expect(window.getComputedStyle(inner).color).toBe("rgb(0, 0, 255)");
    });
  });
});

describe("getComputedStyle declaration merging", () => {
  it("should apply shorthand expansion order, importance and duplicates in source order", () => {
    // Given: shorthands, overriding longhands, duplicate declarations and importance
    withWindow(
      "<style>p{margin:1px 2px 3px 4px;margin-left:9px;padding:1px;padding:5px;color:red!important;color:blue;border:1px solid red;border-top-color:green} p{color:black;margin-top:8px!important} p{margin-top:2px}</style><p></p>",
      (window) => {
        // When: the element's computed style is read
        const style = window.getComputedStyle(element(window, "p"));
        // Then: the cascade keeps the declared winners
        expect([
          style.getPropertyValue("margin-top"),
          style.getPropertyValue("margin-right"),
          style.getPropertyValue("margin-left"),
          style.getPropertyValue("padding-top"),
          style.color,
          style.getPropertyValue("border-top-color"),
          style.getPropertyValue("border-left-color"),
        ]).toEqual([
          "8px",
          "2px",
          "9px",
          "5px",
          "rgb(255, 0, 0)",
          "rgb(0, 128, 0)",
          "rgb(255, 0, 0)",
        ]);
      },
    );
  });

  it("should resolve custom properties per element from shared rule text", () => {
    // Given: rules that share declaration text but receive different variables
    withWindow(
      "<style>.a{--gap:3px}.b{--gap:7px}i{margin:var(--gap) 1px;color:var(--tone,green)}</style><div class=a><i></i></div><div class=b><i></i></div>",
      (window) => {
        const [first, second] = window.document.querySelectorAll("i");
        if (!first || !second) throw new Error("Expected two items");
        // When: both elements are read
        const one = window.getComputedStyle(first);
        const two = window.getComputedStyle(second);
        // Then: each substitutes its own environment
        expect([
          one.getPropertyValue("margin-top"),
          one.getPropertyValue("margin-left"),
          one.color,
        ]).toEqual(["3px", "1px", "rgb(0, 128, 0)"]);
        expect([two.getPropertyValue("margin-top"), two.getPropertyValue("--gap")]).toEqual([
          "7px",
          "7px",
        ]);
      },
    );
  });

  it("should keep Windows independent when they parse the same CSS text", () => {
    // Given: two Windows with identical stylesheets
    const css =
      "<style>p{color:red;margin:1px 2px}@media (min-width: 1200px){p{color:blue}}</style><p></p>";
    const first = new JSDOM(css).window;
    const second = new JSDOM(css).window;
    try {
      expect(first.getComputedStyle(element(first, "p")).color).toBe("rgb(255, 0, 0)");
      // When: one Window mutates its rule and widens its viewport
      styleRule(first, 0, 0).style.setProperty("margin-left", "6px");
      first.innerWidth = 1400;
      // Then: the other Window keeps its own declarations and media result
      expect(first.getComputedStyle(element(first, "p")).color).toBe("rgb(0, 0, 255)");
      expect(first.getComputedStyle(element(first, "p")).getPropertyValue("margin-left")).toBe(
        "6px",
      );
      const other = second.getComputedStyle(element(second, "p"));
      expect([other.color, other.getPropertyValue("margin-left")]).toEqual([
        "rgb(255, 0, 0)",
        "2px",
      ]);
    } finally {
      first.close();
      second.close();
    }
  });
});
