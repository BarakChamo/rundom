// Pins computed-style results that incremental cascade reuse must keep current across mutations.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

function element(
  window: JSDOM["window"],
  selector: string,
): InstanceType<JSDOM["window"]["HTMLElement"]> {
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
          return [
            style.getPropertyValue("box-shadow"),
            style.getPropertyValue("max-width"),
            style.getPropertyValue("transition-timing-function"),
          ];
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
      const origin = () => window.getComputedStyle(card).getPropertyValue("transform-origin");
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
      const origin = () => window.getComputedStyle(card).getPropertyValue("transform-origin");
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
        const narrow = window.getComputedStyle(card).getPropertyValue("max-width");
        // When: the viewport grows
        window.innerWidth = 2000;
        // Then: the substituted length follows it
        expect([narrow, window.getComputedStyle(card).getPropertyValue("max-width")]).toEqual([
          "98px",
          "198px",
        ]);
      },
    );
  });

  it("should re-resolve a token that reads an attribute when the attribute changes", () => {
    // Given: a token computed from an attribute of the declaring element
    withWindow(
      `<style>p{--room:attr(data-room type(<length>));max-width:calc(100% - var(--room));transition:color 1s cubic-bezier(0, 0, 1, 1)}</style><p data-room=3px></p>`,
      (window) => {
        const card = element(window, "p");
        const first = window.getComputedStyle(card).getPropertyValue("max-width");
        // When: the attribute changes
        card.dataset.room = "9px";
        // Then: the substituted value follows the attribute
        expect([first, window.getComputedStyle(card).getPropertyValue("max-width")]).toEqual([
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
            style.getPropertyValue("flex"),
            style.getPropertyValue("flex-basis"),
            style.getPropertyValue("transition-duration"),
            style.getPropertyValue("font-style"),
            style.getPropertyValue("font"),
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

describe("getComputedStyle reuse for inline-styled elements", () => {
  it("should follow every way an inline declaration can change", () => {
    // Given: an inline-styled element inside an inline-styled ancestor, read once
    withWindow(
      `<style>p{color:rgb(1, 1, 1)}</style><main style="font-size:20px"><p style="color:rgb(2, 2, 2);opacity:0.5">x</p></main>`,
      (window) => {
        const paragraph = element(window, "p");
        const read = () => {
          const style = window.getComputedStyle(paragraph);
          return [
            style.getPropertyValue("color"),
            style.getPropertyValue("opacity"),
            style.getPropertyValue("font-size"),
            style.getPropertyValue("display"),
          ];
        };
        const steps = [read()];
        // When: the declaration changes through the CSSOM, attributes and the ancestor
        paragraph.style.setProperty("opacity", "0.25");
        steps.push(read());
        paragraph.style.cssText = "display:block";
        steps.push(read());
        paragraph.setAttribute("style", "color:rgb(3, 3, 3)");
        steps.push(read());
        element(window, "main").style.setProperty("font-size", "30px");
        steps.push(read());
        paragraph.removeAttribute("style");
        steps.push(read());
        // Then: each read reflects the current declarations
        expect(steps).toEqual([
          ["rgb(2, 2, 2)", "0.5", "20px", "block"],
          ["rgb(2, 2, 2)", "0.25", "20px", "block"],
          ["rgb(1, 1, 1)", "1", "20px", "block"],
          ["rgb(3, 3, 3)", "1", "20px", "block"],
          ["rgb(3, 3, 3)", "1", "30px", "block"],
          ["rgb(1, 1, 1)", "1", "30px", "block"],
        ]);
      },
    );
  });

  it("should keep inline URLs resolved against the base current when they were declared", () => {
    // Given: an inline image URL read once
    const { window } = new JSDOM(`<p style="background-image:url(a.png)"></p>`, {
      url: "https://example.test/a/index.html",
    });
    try {
      const paragraph = element(window, "p");
      const first = window.getComputedStyle(paragraph).getPropertyValue("background-image");
      // When: the document URL changes without a tree mutation
      window.history.pushState(null, "", "/deeper/page.html");
      // Then: the declaration keeps its declared base
      expect([
        first,
        window.getComputedStyle(paragraph).getPropertyValue("background-image"),
      ]).toEqual(['url("https://example.test/a/a.png")', 'url("https://example.test/a/a.png")']);
    } finally {
      window.close();
    }
  });
});

describe("getComputedStyle reuse beside state selectors", () => {
  it("should keep pointer-state rules inert and follow checked and validity state", () => {
    // Given: pointer, checkedness and validity rules on controls, read once
    withWindow(
      `<style>button{color:rgb(1, 1, 1)} button:hover{color:rgb(2, 2, 2)} button:active{opacity:0.5} .on:hover{display:none} input:checked{opacity:0.25} input:invalid{outline-style:dashed}</style><button>b</button><input type=checkbox><input required>`,
      (window) => {
        const { document } = window;
        const button = element(window, "button");
        const [checkbox, required] = document.querySelectorAll("input");
        if (
          !(checkbox instanceof window.HTMLInputElement) ||
          !(required instanceof window.HTMLInputElement)
        )
          throw new Error("Expected two inputs");
        const read = () => {
          const pressed = window.getComputedStyle(button);
          return [
            pressed.getPropertyValue("color"),
            pressed.getPropertyValue("opacity"),
            pressed.getPropertyValue("display"),
            window.getComputedStyle(checkbox).getPropertyValue("opacity"),
            window.getComputedStyle(required).getPropertyValue("outline-style"),
          ];
        };
        const steps = [read()];
        // When: the pointer moves and presses, a class changes, and control state changes
        button.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
        button.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
        steps.push(read());
        button.className = "on";
        steps.push(read());
        checkbox.checked = true;
        steps.push(read());
        required.value = "x";
        steps.push(read());
        // Then: pointer states never match, while checked and validity state are current
        expect(steps).toEqual([
          ["rgb(1, 1, 1)", "1", "inline-block", "1", "dashed"],
          ["rgb(1, 1, 1)", "1", "inline-block", "1", "dashed"],
          ["rgb(1, 1, 1)", "1", "inline-block", "1", "dashed"],
          ["rgb(1, 1, 1)", "1", "inline-block", "0.25", "dashed"],
          ["rgb(1, 1, 1)", "1", "inline-block", "0.25", "none"],
        ]);
      },
    );
  });
});

describe("getComputedStyle reuse across focus changes", () => {
  it("should follow focus rings, :focus, :focus-within and inheritance as focus moves", () => {
    // Given: focusable controls under a :focus-within container and a :focus parent with a child
    withWindow(
      `<style>.p:focus{color:rgb(9, 0, 0)} .w:focus-within{background-color:rgb(0, 9, 0)} b{color:rgb(1, 1, 1)}</style><div class=w><button id=a>a</button><button id=b>b</button></div><div class=p tabindex=0><span>s</span></div><b>x</b>`,
      (window) => {
        const { document } = window;
        const nodes = ["#a", "#b", ".p", "span", ".w", "b"].map((selector) => {
          const found = document.querySelector(selector);
          if (!found) throw new Error(`Expected ${selector}`);
          return found;
        });
        const read = () =>
          nodes.map((node) => {
            const style = window.getComputedStyle(node);
            return [
              style.getPropertyValue("outline-style"),
              style.getPropertyValue("color"),
              style.getPropertyValue("background-color"),
            ].join("/");
          });
        const focus = (selector: string) => element(window, selector).focus();
        const steps = [read()];
        // When: focus moves between controls, onto the :focus parent, and away
        focus("#a");
        steps.push(read());
        focus("#b");
        steps.push(read());
        focus(".p");
        steps.push(read());
        element(window, ".p").blur();
        steps.push(read());
        // Then: only elements whose focus state or focus-dependent rules changed differ
        expect(steps).toEqual([
          [
            "none/rgb(0, 0, 0)/rgb(204, 204, 204)",
            "none/rgb(0, 0, 0)/rgb(204, 204, 204)",
            "none/rgb(0, 0, 0)/rgba(0, 0, 0, 0)",
            "none/rgb(0, 0, 0)/rgba(0, 0, 0, 0)",
            "none/rgb(0, 0, 0)/rgba(0, 0, 0, 0)",
            "none/rgb(1, 1, 1)/rgba(0, 0, 0, 0)",
          ],
          [
            "auto/rgb(0, 0, 0)/rgb(204, 204, 204)",
            "none/rgb(0, 0, 0)/rgb(204, 204, 204)",
            "none/rgb(0, 0, 0)/rgba(0, 0, 0, 0)",
            "none/rgb(0, 0, 0)/rgba(0, 0, 0, 0)",
            "none/rgb(0, 0, 0)/rgb(0, 9, 0)",
            "none/rgb(1, 1, 1)/rgba(0, 0, 0, 0)",
          ],
          [
            "none/rgb(0, 0, 0)/rgb(204, 204, 204)",
            "auto/rgb(0, 0, 0)/rgb(204, 204, 204)",
            "none/rgb(0, 0, 0)/rgba(0, 0, 0, 0)",
            "none/rgb(0, 0, 0)/rgba(0, 0, 0, 0)",
            "none/rgb(0, 0, 0)/rgb(0, 9, 0)",
            "none/rgb(1, 1, 1)/rgba(0, 0, 0, 0)",
          ],
          [
            "none/rgb(0, 0, 0)/rgb(204, 204, 204)",
            "none/rgb(0, 0, 0)/rgb(204, 204, 204)",
            "auto/rgb(9, 0, 0)/rgba(0, 0, 0, 0)",
            "none/rgb(9, 0, 0)/rgba(0, 0, 0, 0)",
            "none/rgb(0, 0, 0)/rgba(0, 0, 0, 0)",
            "none/rgb(1, 1, 1)/rgba(0, 0, 0, 0)",
          ],
          [
            "none/rgb(0, 0, 0)/rgb(204, 204, 204)",
            "none/rgb(0, 0, 0)/rgb(204, 204, 204)",
            "none/rgb(0, 0, 0)/rgba(0, 0, 0, 0)",
            "none/rgb(0, 0, 0)/rgba(0, 0, 0, 0)",
            "none/rgb(0, 0, 0)/rgba(0, 0, 0, 0)",
            "none/rgb(1, 1, 1)/rgba(0, 0, 0, 0)",
          ],
        ]);
      },
    );
  });
});
