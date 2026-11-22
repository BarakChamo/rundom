// Covers stylesheet cascade and selector behavior through the public Window.
import { describe, expect, it } from "vitest";
import { createWindow } from "@run-dom/dom";
import { JSDOM, requestInterceptor } from "@run-dom/jsdom";

describe("Window stylesheets", () => {
  it("resolves hexadecimal colors and preserves alpha across independent paint properties", () => {
    const { window } = new JSDOM(
      "<style>p { color: #1a3; background-color: #aBcD; border-top-color: #12345680; fill: #11223301 }</style><p></p>",
    );
    try {
      const node = window.document.querySelector("p")!;
      const style = window.getComputedStyle(node);
      expect(style.color).toBe("rgb(17, 170, 51)");
      expect(style.getPropertyValue("background-color")).toBe("rgba(170, 187, 204, 0.867)");
      expect(style.getPropertyValue("border-top-color")).toBe("rgba(18, 52, 86, 0.5)");
      expect(style.getPropertyValue("fill")).toBe("rgba(17, 34, 51, 0.004)");
      node.style.setProperty("background-color", "rgba(4,5,6,0.125)", "important");
      expect(node.style.getPropertyValue("background-color")).toBe("rgba(4, 5, 6, 0.125)");
      expect(node.style.getPropertyPriority("background-color")).toBe("important");
      expect(style.getPropertyValue("background-color")).toBe("rgba(4, 5, 6, 0.125)");
    } finally {
      window.close();
    }
  });

  it("keeps interleaved recurring sheets independent after CSSOM edits", () => {
    // Given a recurring sheet interleaved with unrelated small sheets.
    const { window } = new JSDOM('<p class="tile"></p>');
    try {
      const append = (text: string) => {
        const style = window.document.createElement("style");
        const head = window.document.head;
        if (!head || !(style instanceof window.HTMLStyleElement))
          throw new Error("Expected a head and style element");
        style.textContent = text;
        head.appendChild(style);
        return style;
      };
      const text = ".tile { color: red }";
      const original = append(text).sheet?.cssRules[0];
      if (original?.type !== 1) throw new Error("Expected the first rule");
      original.style.color = "blue";
      for (let index = 0; index < 80; index++) append(`.other-${index} { width: 1px }`);

      // When the original stylesheet source is inserted again.
      const copy = append(text).sheet?.cssRules[0];
      if (copy?.type !== 1) throw new Error("Expected the repeated rule");

      // Then both declarations preserve their own values.
      expect(copy.style.color).toBe("red");
      expect(original.style.color).toBe("blue");
      const sheet = copy.parentStyleSheet;
      if (!sheet) throw new Error("Expected the repeated rule's sheet");
      sheet.deleteRule(0);
      expect(copy.parentStyleSheet).toBeNull();
      expect(copy.style.color).toBe("red");
      expect(original.parentStyleSheet).not.toBeNull();
    } finally {
      window.close();
    }
  });

  it("preserves class and ID specificity when editing a responsive stylesheet", () => {
    // Given overlapping simple selectors inside and outside a matching media rule.
    const { window } = new JSDOM(
      '<style>@media all { #tile { color: red } } .tile { color: blue }</style><p id="tile" class="tile"></p>',
    );
    try {
      const target = window.document.querySelector("p");
      const media = window.document.styleSheets[0]?.cssRules[0];
      if (!target || media?.type !== 4) throw new Error("Expected a target and a media rule");
      const rule = media.cssRules[0];
      if (rule?.type !== 1) throw new Error("Expected the nested style rule");
      const before = window.getComputedStyle(target);

      // When the ID selector is changed to a class with the same specificity as the later rule.
      rule.selectorText = ".tile";

      // Then the retained and fresh declarations both see the new winner.
      expect(rule.selectorText).toBe(".tile");
      expect(before.color).toBe("rgb(0, 0, 255)");
      expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 255)");
    } finally {
      window.close();
    }
  });

  it("updates unread declarations after viewport and CSSOM edits and clears them on detachment", () => {
    // Given: a declaration whose width and visibility depend on media and a custom property.
    const { window } = new JSDOM(
      "<style>@media (min-width: 500px) { main { --gap: 10px } " +
        "p { width: calc(10vw + var(--gap)); visibility: hidden } }</style><main><p></p></main>",
    );
    try {
      window.innerWidth = 800;
      const target = window.document.querySelector("p");
      if (!target) throw new Error("Expected a styled element");
      const original = window.getComputedStyle(target);

      // When: the entire environment changes before any property on the snapshot is read.
      window.innerWidth = 1000;
      const sheet = window.document.styleSheets.item(0);
      if (!sheet) throw new Error("Expected the authored stylesheet");
      sheet.insertRule("main { --gap: 25px !important }");
      const updated = window.getComputedStyle(target);
      expect(original.getPropertyValue("width")).toBe("125px");
      expect(updated.getPropertyValue("--gap")).toBe("25px");
      target.remove();
      expect(original.getPropertyValue("visibility")).toBe("");
      expect(original.getPropertyValue("width")).toBe("");
      expect(Array.from(original)).toEqual([]);
      expect(updated.getPropertyValue("--gap")).toBe("");
      window.close();
      expect(original.length).toBe(0);
      expect(updated.getPropertyValue("--gap")).toBe("");
    } finally {
      window.close();
    }
  });

  it("preserves the order and values of a large inherited custom-property block", () => {
    // Given: two descendants inherit the same theme and one overrides a custom property.
    const theme = Array.from({ length: 48 }, (_, index) => `--tone-${index}: ${index}px`);
    const { window } = new JSDOM(
      `<style>main { visibility: visible; ${theme.join(";")}; font-size: 17px } ` +
        "p { width: var(--tone-47) } .override { --tone-47: 7px }</style>" +
        '<main><section><p></p><p class="override"></p></section></main>',
    );
    try {
      const first = window.document.querySelector("p");
      const second = first?.nextElementSibling;
      if (!first || !second) throw new Error("Expected both themed paragraphs");
      const original = window.getComputedStyle(first);
      expect(original.display).toBe("block");

      // When: one target gets an override and the ancestor theme is changed.
      expect(window.getComputedStyle(second).getPropertyValue("width")).toBe("7px");
      const main = window.document.querySelector("main");
      if (!(main instanceof window.HTMLElement)) throw new Error("Expected the theme owner");
      main.style.setProperty("--tone-47", "29px");
      expect(window.getComputedStyle(first).getPropertyValue("width")).toBe("29px");

      // Then: the retained declaration exposes the updated inherited values in enumeration order.
      expect(original.getPropertyValue("--tone-47")).toBe("29px");
      expect(original.getPropertyValue("width")).toBe("29px");
      const names = Array.from(original);
      const customStart = names.indexOf("--tone-0");
      expect(names.slice(customStart, customStart + theme.length)).toEqual(
        theme.map((_, index) => `--tone-${index}`).sort(),
      );
      expect(original.item(customStart + 47)).toBe("--tone-9");
      expect(original.getPropertyPriority("--tone-47")).toBe("");
    } finally {
      window.close();
    }
  });

  it("preserves translucent inherited color in promoted ancestor snapshots", () => {
    // Given a foreground supplied through custom property substitution.
    const { window } = new JSDOM(
      "<style>main{--tone:rgba(12,34,56,0.125);color:var(--tone)}</style><main><section><i></i></section></main>",
    );
    try {
      const section = window.document.querySelector("section");
      const leaf = window.document.querySelector("i");
      if (!leaf || !section) throw new Error("Expected styled descendants");
      // When a descendant read precedes a retained ancestor snapshot and a later mutation.
      expect(window.getComputedStyle(leaf).getPropertyValue("color")).toBe(
        "rgba(12, 34, 56, 0.125)",
      );
      const captured = window.getComputedStyle(section);
      section.setAttribute("style", "--tone: rgba(4,5,6,1); color:var(--tone)");
      // Then enumeration and the named getter both reflect the updated declaration.
      expect(Array.from(captured).filter((name) => name === "color")).toHaveLength(1);
      expect(captured.getPropertyValue("color")).toBe("rgb(4, 5, 6)");
      expect(window.getComputedStyle(leaf).getPropertyValue("color")).toBe("rgb(4, 5, 6)");
    } finally {
      window.close();
    }
  });

  it("matches compound ancestors through competing descendants and direct-child boundaries", () => {
    // Given the nearest matching ancestor fails its own direct-parent condition.
    const { window } = new JSDOM(
      '<style>main > .outer.hit .target { opacity: 0.25 } .missing > .target {opacity: 0.5}</style><main><div class="outer hit"><aside><div class="outer hit"><p class="target"></p></div></aside></div></main>',
    );
    try {
      const target = window.document.querySelector("p");
      const outer = window.document.querySelector("main > div");
      if (!outer || !target) throw new Error("Expected nested subjects");
      // When the only qualifying ancestor is changed after a computed read.
      const old = window.getComputedStyle(target);
      outer.className = "outer";
      // Then matching can backtrack to a more distant ancestor and sees the subsequent class mutation.
      expect(old.getPropertyValue("opacity")).toBe("1");
      expect(window.getComputedStyle(target).getPropertyValue("opacity")).toBe("1");
    } finally {
      window.close();
    }
  });

  it("keeps type and class selector lists in cascade order across focus and CSSOM edits", () => {
    // Given a stylesheet with mixed selector lists and several unrelated rules.
    const filler = Array.from({ length: 20 }, (_, index) => `.other${index}{color:red}`).join("");
    const { window } = new JSDOM(
      `<style>${filler}button,.cold{opacity:0.2}.hot,input{opacity:0.4}button:focus,.last{opacity:0.6}</style><button class="hot"></button>`,
    );
    try {
      const button = window.document.querySelector("button");
      if (!(button instanceof window.HTMLElement)) throw new Error("Expected a button");
      // When both branches apply, a focus transition and a live rule insertion change the winner.
      const first = window.getComputedStyle(button);
      button.focus();
      const focused = window.getComputedStyle(button);
      const sheet = window.document.styleSheets[0];
      if (!sheet) throw new Error("Expected an inline stylesheet");
      sheet.insertRule("button.hot:focus{opacity:0.8}", sheet.cssRules.length);
      // Then the newest matching rule wins in every live declaration.
      expect(first.getPropertyValue("opacity")).toBe("0.8");
      expect(focused.getPropertyValue("opacity")).toBe("0.8");
      expect(window.getComputedStyle(button).getPropertyValue("opacity")).toBe("0.8");
    } finally {
      window.close();
    }
  });

  it("keeps disjoint local variables ordered across inherited and reapplied themes", () => {
    // Given a repeated token rule and variables introduced at three different depths.
    const tokens = Array.from({ length: 40 }, (_, i) => `--t${i}:${i}px`).join(";");
    const { window } = new JSDOM(
      `<style>.theme{${tokens}}main{--root:5px}section{--local:var(--t39)}` +
        "p{--leaf:8px;width:var(--local)}</style>" +
        '<main class="theme"><section class="theme"><p></p></section></main>',
    );
    try {
      const target = window.document.querySelector("p");
      const section = window.document.querySelector("section");
      if (!target || !(section instanceof window.HTMLElement))
        throw new Error("Expected section and target");
      const old = window.getComputedStyle(target);

      // When a local declaration starts overriding the theme.
      section.style.setProperty("--t39", "73px");
      const current = window.getComputedStyle(target);

      // Then each declaration sees the current tokens and enumerates each name once.
      expect(current.getPropertyValue("width")).toBe("73px");
      expect(old.getPropertyValue("width")).toBe("73px");
      const names = Array.from(old).filter((name) => name?.startsWith("--"));
      expect(names).toEqual(
        ["--leaf", ...Array.from({ length: 40 }, (_, i) => `--t${i}`), "--local", "--root"].sort(),
      );
      for (const [name, value] of [
        ["--root", "5px"],
        ["--leaf", "8px"],
        ["--local", "73px"],
      ] as const)
        expect(old.getPropertyValue(name)).toBe(value);
    } finally {
      window.close();
    }
  });

  it("keeps interleaved theme variables in computed declaration order", () => {
    // Given: two large token groups separated by an inherited longhand.
    const tokens = (prefix: string) =>
      Array.from({ length: 28 }, (_, index) => `--${prefix}-${index}: ${index}px`).join(";");
    const { window } = new JSDOM(
      `<style>main { ${tokens("a")}; visibility: hidden; ${tokens("b")}; font-size: 23px }` +
        "p { width: var(--b-27) } .override { --a-27: 5px; width: var(--a-27) }</style>" +
        '<main><section><p></p><p class="override"></p></section></main>',
    );
    try {
      const first = window.document.querySelector("p");
      const second = first?.nextElementSibling;
      const main = window.document.querySelector("main");
      if (!first || !second || !(main instanceof window.HTMLElement))
        throw new Error("Expected the theme owner and both descendants");

      // When: a sibling overrides an inherited token and the theme owner changes.
      const snapshot = window.getComputedStyle(first);
      expect(window.getComputedStyle(second).getPropertyValue("width")).toBe("5px");
      main.style.setProperty("--b-27", "99px");

      // Then: an unread snapshot preserves both groups and their interleaved index.
      const names = Array.from(snapshot);
      const expected = ["a", "b"]
        .flatMap((prefix) => Array.from({ length: 28 }, (_, index) => `--${prefix}-${index}`))
        .sort();
      expect(names.slice(-expected.length)).toEqual(expected);
      expect(snapshot.item(names.indexOf("--b-0"))).toBe("--b-0");
      expect(Object.keys(snapshot)).toHaveLength(snapshot.length);
      expect(snapshot.getPropertyValue("--b-27")).toBe("99px");
      expect(snapshot.getPropertyValue("width")).toBe("99px");
      expect(window.getComputedStyle(first).getPropertyValue("width")).toBe("99px");
    } finally {
      window.close();
    }
  });

  it("updates sheet order and source when moving nested owners and text", () => {
    const { window } = new JSDOM(
      "<section><style>p { color: red }</style></section><main><style>p { color: blue }</style></main><p></p>",
    );
    try {
      const { document } = window;
      const target = document.querySelector("p")!;
      const first = document.querySelector("section")!;
      const second = document.querySelector("main")!;
      const list = document.styleSheets;
      expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 255)");
      document.body!.append(first);
      expect(window.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
      target.append(first.firstChild!.firstChild!);
      expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 255)");
      second.replaceChildren(document.createTextNode("removed"));
      expect(list.length).toBe(1);
    } finally {
      window.close();
    }
  });

  it("keeps stylesheet membership and selector matches current across attribute edits", () => {
    // Given: a live stylesheet list and a class-dependent rule.
    const { window } = new JSDOM("<style>.selected { color: red }</style><main></main>");
    try {
      const main = window.document.querySelector("main");
      const sheet = window.document.querySelector("style");
      if (!main || !sheet) throw new Error("Expected both the rule and its target");
      const original = window.getComputedStyle(main);

      // When: a target selector changes and the source is subsequently disabled by its type.
      main.className = "selected";
      expect(window.getComputedStyle(main).color).toBe("rgb(255, 0, 0)");
      const sheets = window.document.styleSheets;
      expect(sheets.length).toBe(1);
      sheet.setAttribute("type", "text/plain");

      // Then: membership and the current computed value change while the old snapshot holds.
      expect(sheets.length).toBe(0);
      expect(window.getComputedStyle(main).color).toBe(original.color);
      sheet.setAttribute("type", "text/css");
      expect(sheets.length).toBe(1);
      expect(window.getComputedStyle(main).color).toBe("rgb(255, 0, 0)");
    } finally {
      window.close();
    }
  });

  it("keeps recurring flat sheets independently editable in one Window", () => {
    // Given: identical source attached in separate scopes of the same Window.
    const { window } = new JSDOM("<article></article><section></section><main></main>");
    try {
      const roots = [
        window.document.querySelector("article"),
        window.document.querySelector("section"),
        window.document.querySelector("main"),
      ].map((element) => {
        if (!element) throw new Error("Expected a shadow host");
        const root = element.attachShadow({ mode: "open" });
        root.innerHTML = "<style>p { color: red }</style><p></p>";
        return root;
      });
      const first = roots[0]?.querySelector("style");
      if (!(first instanceof window.HTMLStyleElement)) throw new Error("Expected a stylesheet");
      const rule = first.sheet?.cssRules[0];
      if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected a style rule");

      // When: the first rule is edited through CSSOM.
      rule.style.setProperty("color", "blue");

      // Then: the three sheets compute independently.
      expect(
        roots.map((root) => {
          const target = root.querySelector("p");
          if (!target) throw new Error("Expected a target");
          return window.getComputedStyle(target).color;
        }),
      ).toEqual(["rgb(0, 0, 255)", "rgb(255, 0, 0)", "rgb(255, 0, 0)"]);
    } finally {
      window.close();
    }
  });

  it("checks the style revision after a reentrant viewport read", () => {
    // Given: a warm computed frame whose width depends on the viewport.
    const { window } = new JSDOM(
      "<style>.original { width: 10vw } .changed { width: 25px }</style>" +
        '<main><p class="original"></p></main>',
    );
    try {
      const target = window.document.querySelector("p");
      if (!target) throw new Error("Expected a viewport-dependent element");
      let changeDuringRead = false;
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        get() {
          if (changeDuringRead) {
            changeDuringRead = false;
            target.className = "changed";
          }
          return 1000;
        },
      });
      const previous = window.getComputedStyle(target);
      expect(previous.getPropertyValue("width")).toBe("100px");

      // When: a getter changes the winning rule during validation of the cached frame.
      changeDuringRead = true;
      const updated = window.getComputedStyle(target);

      // Then: both declarations see the width after the viewport callback.
      expect(updated.getPropertyValue("width")).toBe("25px");
      expect(previous.getPropertyValue("width")).toBe("25px");
    } finally {
      window.close();
    }
  });

  it("refreshes inherited style after live state, viewport and sheet edits", () => {
    // Given: a styled ancestor, a live selector, and two children that inherit its theme.
    const { window } = new JSDOM(`
      <style>
        @media (min-width: 700px) { .theme { --space: 6px } }
        .theme:has(:checked) { --space: 9px }
        .unrelated:focus { visibility: hidden }
        p { width: var(--space, 3px) }
      </style>
      <main class="theme"><input type="checkbox"><p>one</p><p>two</p></main>
    `);
    try {
      const first = window.document.querySelector("p");
      const second = first?.nextElementSibling;
      const control = window.document.querySelector("input");
      if (!first || !second || !(control instanceof window.HTMLInputElement))
        throw new Error("Expected an authored inheritance fixture");
      window.innerWidth = 1000;
      const previous = window.getComputedStyle(first);
      expect(previous.getPropertyValue("width")).toBe("6px");
      expect(window.getComputedStyle(second).getPropertyValue("width")).toBe("6px");

      // When: style reads cross viewport, live-state, and CSSOM changes.
      window.innerWidth = 600;
      expect(window.getComputedStyle(second).getPropertyValue("width")).toBe("3px");
      control.checked = true;
      expect(window.getComputedStyle(first).getPropertyValue("width")).toBe("9px");
      const sheet = window.document.styleSheets.item(0);
      if (!sheet) throw new Error("Expected the author sheet");
      sheet.insertRule(".theme { --space: 12px !important }", sheet.cssRules.length);

      // Then: the retained public declaration follows the newest cascade.
      expect(window.getComputedStyle(second).getPropertyValue("width")).toBe("12px");
      expect(previous.getPropertyValue("width")).toBe("12px");
    } finally {
      window.close();
    }
  });

  it("tracks a new media dependency when the existing winners remain the same", () => {
    const { window } = new JSDOM(
      "<style>main { --space: 3px } p { width: var(--space) }</style>" +
        "<main><p>one</p><p>two</p></main>",
    );
    try {
      const first = window.document.querySelector("p");
      const second = first?.nextElementSibling;
      const head = window.document.head;
      if (!first || !second || !head)
        throw new Error("Expected sibling elements and a document head");
      window.innerWidth = 500;
      expect(window.getComputedStyle(first).getPropertyValue("width")).toBe("3px");

      const style = window.document.createElement("style");
      style.textContent = "@media (min-width: 700px) { main { --space: 12px } }";
      head.append(style);
      const previous = window.getComputedStyle(first);
      expect(previous.getPropertyValue("width")).toBe("3px");

      window.innerWidth = 800;
      expect(window.getComputedStyle(second).getPropertyValue("width")).toBe("12px");
      expect(window.getComputedStyle(first).getPropertyValue("width")).toBe("12px");
      expect(previous.getPropertyValue("width")).toBe("12px");
    } finally {
      window.close();
    }
  });

  it("updates inherited focus styles when modality changes on the focused element", () => {
    // Given: a focused button changes the visibility inherited by a sibling.
    const { window } = new JSDOM(
      "<style>main:has(button:focus-visible) { visibility: hidden }</style>" +
        "<main><button>focus</button><p>text</p></main><input>",
    );
    try {
      const button = window.document.querySelector("button");
      const target = window.document.querySelector("p");
      const other = window.document.querySelector("input");
      if (
        !(button instanceof window.HTMLButtonElement) ||
        !target ||
        !(other instanceof window.HTMLInputElement)
      )
        throw new Error("Expected focusable controls and a styled sibling");
      button.focus();
      const keyboard = window.getComputedStyle(target);
      expect(keyboard.getPropertyValue("visibility")).toBe("hidden");
      expect(window.getComputedStyle(target).getPropertyValue("visibility")).toBe("hidden");

      // When: the focused element receives pointer and keyboard input.
      button.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
      expect(window.document.activeElement).toBe(button);
      expect(window.getComputedStyle(target).getPropertyValue("visibility")).toBe("visible");
      button.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      expect(window.getComputedStyle(target).getPropertyValue("visibility")).toBe("hidden");

      // Then: moving focus restores visibility and updates the retained declaration.
      other.focus();
      expect(window.getComputedStyle(target).getPropertyValue("visibility")).toBe("visible");
      expect(keyboard.getPropertyValue("visibility")).toBe("visible");
    } finally {
      window.close();
    }
  });

  it("publishes the element's foreground and paint after it supplied inherited styles", () => {
    // Given: ordinary and paint-dependent ancestors with an authored foreground.
    const { window } = new JSDOM(
      "<style>main { color: rgb(8, 10, 12) } section { fill: currentColor }</style>" +
        "<main><section><p></p></section></main>",
    );
    try {
      const child = window.document.querySelector("p");
      const main = window.document.querySelector("main");
      const section = window.document.querySelector("section");
      if (!child || !main || !section) throw new Error("Expected the styled ancestor chain");

      // When: the descendants' styles are computed before their ancestors' public views.
      expect(window.getComputedStyle(child).color).toBe("rgb(8, 10, 12)");
      const foreground = window.getComputedStyle(main);
      const paint = window.getComputedStyle(section);

      // Then: a public read of either ancestor has the correct output for that element.
      expect(foreground.color).toBe("rgb(8, 10, 12)");
      expect(foreground.item(foreground.length - 1)).toBe("-webkit-text-stroke-width");
      expect(foreground.getPropertyValue("outline-color")).toBe("rgb(8, 10, 12)");
      expect(foreground.getPropertyValue("border-left-color")).toBe("rgb(8, 10, 12)");
      expect(paint.getPropertyValue("fill")).toBe("rgb(8, 10, 12)");
    } finally {
      window.close();
    }
  });

  it("reports jsdom element metrics in the headless window", () => {
    const { window } = new JSDOM('<p style="width: 50px; height: 20px">Text</p>');
    try {
      const target = window.document.querySelector("p");
      if (!(target instanceof window.HTMLElement)) throw new Error("Expected a paragraph");
      const rect = target.getBoundingClientRect();
      expect(rect).toStrictEqual({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      });
      expect(target.getBoundingClientRect() === rect).toBe(false);
      expect(target.getClientRects()).toEqual([]);
      expect([
        target.clientWidth,
        target.clientHeight,
        target.scrollWidth,
        target.scrollHeight,
      ]).toEqual([0, 0, 0, 0]);
      expect([target.clientTop, target.clientLeft, target.offsetTop, target.offsetLeft]).toEqual([
        0, 0, 0, 0,
      ]);
      expect([target.offsetWidth, target.offsetHeight, target.offsetParent]).toEqual([0, 0, null]);
    } finally {
      window.close();
    }
  });

  it("creates window-local rectangles whose edges account for negative dimensions", () => {
    const { window } = new JSDOM("");
    try {
      const rect = window.DOMRect.fromRect({ x: 7, y: 5, width: -3, height: -2 });
      expect(rect instanceof window.DOMRectReadOnly).toBe(true);
      expect(rect.toJSON()).toEqual({
        x: 7,
        y: 5,
        width: -3,
        height: -2,
        top: 3,
        right: 7,
        bottom: 5,
        left: 4,
      });
      rect.width = 2;
      expect([rect.left, rect.right]).toEqual([7, 9]);
      const copy = window.DOMRectReadOnly.fromRect(rect);
      expect(copy instanceof window.DOMRect).toBe(false);
      rect.width = Number.NaN;
      expect(Number.isNaN(rect.right)).toBe(true);
      expect(copy.width).toBe(2);
    } finally {
      window.close();
    }
  });

  it("uses selector specificity and synchronizes inline declarations with the style attribute", () => {
    // Given: one compound author selector competing with a later type selector.
    const { window } = new JSDOM(`
      <style>section > p.notice { color: blue } p { color: red }</style>
      <section><p class="notice">Notice</p></section>
    `);
    try {
      const section = window.document.querySelector("section");
      const target = section?.querySelector(":scope > p.notice");
      if (!target) throw new Error("Expected the scoped paragraph");
      expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 255)");

      // When: the inline declaration is mutated through the CSS object.
      const inline = target.style;
      inline.setProperty("color", "green");

      // Then: the same declaration remains attached and wins the cascade.
      expect(target.style).toBe(inline);
      expect(target.getAttribute("style")).toContain("color: green");
      expect(window.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
    } finally {
      window.close();
    }
  });

  it("updates retained stylesheet lists after style type and text changes", () => {
    // Given a retained collection after its first indexed read
    const { window } = new JSDOM("<style>p { color: red }</style>");
    try {
      const { document } = window;
      const style = document.querySelector("style");
      if (!(style instanceof window.HTMLStyleElement)) throw new Error("Expected a stylesheet");
      const sheets = document.styleSheets;
      style.setAttributeNS("urn:fixture", "fixture:type", "text/plain");
      const first = sheets.item(0);
      expect(first).not.toBeNull();

      // When the attached stylesheet's text and type change
      const text = style.firstChild;
      if (!text) throw new Error("Expected stylesheet text");
      text.nodeValue = "p { color: blue }";
      expect(sheets.item(0)).not.toBe(first);
      style.type = "text/plain";

      // Then the retained list tracks current stylesheet membership and contents
      expect(sheets.length).toBe(0);
      style.type = "text/css";
      const rule = sheets.item(0)?.cssRules[0];
      expect(rule && "style" in rule && rule.style.getPropertyValue("color")).toBe("blue");
    } finally {
      window.close();
    }
  });

  it("rolls author revert back to the inherited value and user-agent display", () => {
    // Given author styles and an inherited font size
    const { window } = new JSDOM(
      '<style>p { display: flex; font-size: 42px }</style><div style="font-size: 20px"><p>target</p></div>',
    );
    try {
      const target = window.document.querySelector("p");
      if (!target) throw new Error("Expected target");
      const declaration = target.style;

      // When replacing inline style, then revert uses values outside the author cascade
      target.style = "display: revert; font-size: revert";
      expect(target.style).toBe(declaration);
      expect(declaration.getPropertyValue("font-size")).toBe("revert");
      const computed = window.getComputedStyle(target);
      expect(computed.display).toBe("block");
      expect(computed.getPropertyValue("font-size")).toBe("20px");

      target.style = "";
      expect(declaration.cssText).toBe("");
      expect(window.getComputedStyle(target).display).toBe("flex");
    } finally {
      window.close();
    }
  });

  it("loads and applies only imports whose supports condition is true", async () => {
    // Given two CSS imports with different support conditions
    const requests: string[] = [];
    const { window } = new JSDOM(
      '<style>@import "yes.css" supports(display: grid); @import "no.css" supports(color: rainbow);</style><p>target</p>',
      {
        url: "https://example.test/",
        resources: {
          interceptors: [
            requestInterceptor(({ url }) => {
              requests.push(url);
              return new Response("p { color: red }", { headers: { "Content-Type": "text/css" } });
            }),
          ],
        },
      },
    );
    try {
      // When loading completes, then the unsupported import has made no request
      await new Promise<void>((resolve) =>
        window.addEventListener("load", () => resolve(), { once: true }),
      );
      expect(requests).toEqual(["https://example.test/yes.css"]);
      const target = window.document.querySelector("p");
      if (!target) throw new Error("Expected target");
      expect(window.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
      expect(window.CSS.supports("selector(p) and (color: red)")).toBe(true);
      expect(window.CSS.escape("1 x")).toBe(String.raw`\31 \ x`);
    } finally {
      window.close();
    }
  });

  it("resolves imported styles against their containing stylesheet and waits for load", async () => {
    // Given: a link whose intercepted stylesheet imports a sibling file.
    const requests: string[] = [];
    const { window } = new JSDOM('<link rel="stylesheet" href="/css/main.css"><p>Notice</p>', {
      url: "https://example.test/",
      resources: {
        interceptors: [
          requestInterceptor((request) => {
            requests.push(request.url);
            const css = request.url.endsWith("/main.css")
              ? '@import "theme.css";'
              : "p { color: blue }";
            return new Response(css, { headers: { "Content-Type": "text/css" } });
          }),
        ],
      },
    });
    try {
      const sheets = window.document.styleSheets;
      expect(sheets.length).toBe(0);
      // When: the Window completes its load lifecycle.
      await new Promise<void>((resolve) =>
        window.addEventListener("load", () => resolve(), { once: true }),
      );

      expect(sheets.item(0)?.href).toBe("https://example.test/css/main.css");
      // Then: the import affected the computed style before load.
      expect(requests).toEqual([
        "https://example.test/css/main.css",
        "https://example.test/css/theme.css",
      ]);
      const target = window.document.querySelector("p");
      if (!target) throw new Error("Expected the styled paragraph");
      expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 255)");
      const imported = sheets.item(0)?.cssRules.item(0);
      if (!(imported instanceof window.CSSImportRule)) throw new Error("Expected an import rule");
      expect(imported.media).toBe(imported.styleSheet?.media);
      imported.media.mediaText = "not all";
      expect(window.getComputedStyle(target).color).not.toBe("rgb(0, 0, 255)");
    } finally {
      window.close();
    }
  });
});

it("applies hidden-element defaults below author styles in the cascade", () => {
  const { window } = new JSDOM("<style>.shown { display: grid }</style><div></div>");
  try {
    const div = window.document.querySelector("div");
    if (!(div instanceof window.HTMLElement)) throw new Error("Expected a div");
    const computed = () => window.getComputedStyle(div);

    expect(computed().display).toBe("block");
    div.hidden = true;
    expect(computed().display).toBe("none");
    expect(computed().contentVisibility).toBe("visible");

    div.hidden = "until-found";
    expect(computed().display).toBe("block");
    expect(computed().contentVisibility).toBe("hidden");

    div.hidden = true;
    div.className = "shown";
    expect(computed().display).toBe("grid");
  } finally {
    window.close();
  }
});

it("matches :open dynamically in DOM selectors and stylesheets", () => {
  const { window } = new JSDOM(
    "<style>main:has(:open) { color: red }</style>" +
      "<main><details></details><dialog></dialog><div open></div></main>",
  );
  try {
    const main = window.document.querySelector("main");
    const details = window.document.querySelector("details");
    const dialog = window.document.querySelector("dialog");
    if (
      !main ||
      !(details instanceof window.HTMLDetailsElement) ||
      !(dialog instanceof window.HTMLDialogElement)
    )
      throw new Error("Expected details and dialog elements");

    expect(main.querySelector(":open")).toBeNull();
    details.open = true;
    expect(main.querySelector(":open") === details).toBe(true);
    expect(window.getComputedStyle(main).color).toBe("rgb(255, 0, 0)");
    details.open = false;
    dialog.open = true;
    expect(main.querySelector(":open") === dialog).toBe(true);
    dialog.open = false;
    expect(main.matches(":has(:open)")).toBe(false);
    expect(window.getComputedStyle(main).color).not.toBe("rgb(255, 0, 0)");
  } finally {
    window.close();
  }
});

it("keeps a retained inline declaration synchronized with attribute mutations", () => {
  const { window } = new JSDOM('<div style="color: red"></div>');
  try {
    const div = window.document.querySelector("div");
    if (!div) throw new Error("Expected styled element");
    const inline = div.style;
    const observer = new window.MutationObserver(() => {});
    observer.observe(div, { attributes: true, attributeOldValue: true });

    div.setAttribute("style", "color:: invalid");
    expect(inline.cssText).toBe("");
    expect(div.getAttribute("style")).toBe("color:: invalid");
    div.setAttribute("style", "color: green");
    expect(inline.color).toBe("green");
    observer.takeRecords();

    inline.setProperty("background-color", "blue");
    expect(div.getAttribute("style")).toBe("color: green; background-color: blue;");
    expect(observer.takeRecords().map((record) => [record.attributeName, record.oldValue])).toEqual(
      [["style", "color: green"]],
    );
    div.removeAttribute("style");
    expect(inline.cssText).toBe("");
  } finally {
    window.close();
  }
});

it("applies adopted stylesheets in order and isolates shadow scopes", () => {
  const { window } = new JSDOM("<style>p { color: black }</style><p>light</p><div></div>");
  try {
    const host = window.document.querySelector("div");
    const light = window.document.querySelector("p");
    if (!host || !light) throw new Error("Expected style targets");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "<p>shadow</p>";
    const child = shadow.querySelector("p");
    if (!child) throw new Error("Expected a shadow style target");

    const red = new window.CSSStyleSheet();
    red.replaceSync("p { color: red }");
    const green = new window.CSSStyleSheet();
    green.replaceSync("p { color: green }");
    const adopted = window.document.adoptedStyleSheets;
    window.document.adoptedStyleSheets = [red, green];
    expect(window.document.adoptedStyleSheets).toBe(adopted);
    expect(window.getComputedStyle(light).color).toBe("rgb(0, 128, 0)");
    adopted.pop();
    expect(window.getComputedStyle(light).color).toBe("rgb(255, 0, 0)");
    shadow.adoptedStyleSheets.push(green);
    expect(window.getComputedStyle(child).color).toBe("rgb(0, 128, 0)");
    expect(window.document.styleSheets.length).toBe(1);
    expect(shadow.styleSheets.length).toBe(0);
    expect(() => {
      window.document.adoptedStyleSheets = [window.document.styleSheets[0]!];
    }).toThrow("Only constructed stylesheets");
    expect(adopted).toEqual([red]);
  } finally {
    window.close();
  }
});

it("evaluates adopted stylesheet media rules against the current viewport", () => {
  const { window } = new JSDOM("<p>Responsive</p>");
  try {
    const p = window.document.querySelector("p");
    if (!p) throw new Error("Expected a paragraph");
    const sheet = new window.CSSStyleSheet();
    sheet.replaceSync(
      "p { color: red } @media screen and (min-width: 800px) { p { color: green } }" +
        "@media print { p { color: blue } }",
    );
    window.document.adoptedStyleSheets = [sheet];
    expect(sheet.cssRules[1]?.type).toBe(4);
    expect(window.getComputedStyle(p).color).toBe("rgb(0, 128, 0)");
    window.innerWidth = 600;
    expect(window.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
  } finally {
    window.close();
  }
});

it("reports media query matches and delivers change events on resize", () => {
  const { window } = createWindow("");
  try {
    const query = window.matchMedia("(min-width: 800px)");
    expect(query instanceof window.EventTarget).toBe(true);
    expect(query.media).toBe("(min-width: 800px)");
    expect(query.matches).toBe(true);
    expect(window.matchMedia("").matches).toBe(true);
    expect(window.matchMedia("::").media).toBe("not all");

    const changes: boolean[] = [];
    const listener = (event: InstanceType<typeof window.Event>) => {
      if (event instanceof window.MediaQueryListEvent) changes.push(event.matches);
    };
    query.addListener(listener);
    window.innerWidth = 600;
    expect(query.matches).toBe(false);
    window.dispatchEvent(new window.Event("resize"));
    window.dispatchEvent(new window.Event("resize"));
    query.removeListener(listener);
    window.innerWidth = 1000;
    window.dispatchEvent(new window.Event("resize"));
    expect(changes).toEqual([false]);
  } finally {
    window.close();
  }
});

it("shares viewport range comparisons between matchMedia and the cascade", () => {
  const { window } = createWindow(
    "<style>p { color: red } @media (400px <= width < 800px) { p { color: green } }</style><p></p>",
  );
  try {
    const target = window.document.querySelector("p");
    if (!target) throw new Error("Expected a paragraph");
    const range = window.matchMedia("(400px<=width<800px)");
    expect(range.media).toBe("(400px <= width < 800px)");

    window.innerWidth = 400;
    expect(range.matches).toBe(true);
    expect(window.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
    expect(window.matchMedia("(width > -1px)").matches).toBe(true);
    expect(window.matchMedia("(800px > width >= 25em)").matches).toBe(true);
    expect(window.matchMedia("(800px > width < 25em)").matches).toBe(false);
    expect(window.matchMedia("(width < 800)").matches).toBe(false);
    window.innerWidth = 800;
    expect(range.matches).toBe(false);
    expect(window.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
  } finally {
    window.close();
  }
});

it("evaluates nested media conditions and preserves unknown values under negation", () => {
  const { window } = createWindow(
    "<style>p { color: red } @media screen and ((width > 900px) or (height < 200px))" +
      " { p { color: green } }</style><p></p>",
  );
  try {
    const target = window.document.querySelector("p");
    if (!target) throw new Error("Expected a paragraph");

    expect(window.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
    expect(window.matchMedia("not ((width < 900px) or (height < 200px))").matches).toBe(true);
    expect(window.matchMedia("not (unknown-feature: 1)").matches).toBe(false);
    expect(window.matchMedia("(unknown-feature: 1) or (width > 900px)").matches).toBe(true);
    expect(window.matchMedia("(width) and (height) or (width)").media).toBe("not all");

    window.innerWidth = 800;
    expect(window.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
    window.innerHeight = 100;
    expect(window.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
  } finally {
    window.close();
  }
});

it("recovers media query alternatives independently at CSS token boundaries", () => {
  const { window } = createWindow(
    "<style>@media broken), (min-width: 1px) { p { color: green } }</style><p></p>",
  );
  try {
    const recovered = window.matchMedia("broken), (min-width: 1px");
    expect(recovered.media).toBe("not all, (min-width: 1px)");
    expect(recovered.matches).toBe(true);
    expect(window.matchMedia(", screen,").media).toBe("not all, screen, not all");
    expect(window.matchMedia('not (unknown: "a,b"), screen').matches).toBe(true);
    expect(window.matchMedia("/* empty */").media).toBe("");
    const target = window.document.querySelector("p");
    if (!target) throw new Error("Expected a paragraph");
    expect(window.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
  } finally {
    window.close();
  }
});

it("normalizes resolution calculations and compares them with device pixel ratio", () => {
  const { window } = createWindow(
    "<style>p { color: red } @media (min-resolution: calc(96dpi + 1x))" +
      " { p { color: green } }</style><p></p>",
  );
  try {
    const target = window.document.querySelector("p");
    if (!target) throw new Error("Expected a paragraph");
    const query = window.matchMedia("(min-resolution: calc(96dpi + 1x))");
    expect(query.media).toBe("(min-resolution: calc(2dppx))");
    expect(query.matches).toBe(false);
    expect(window.matchMedia("(resolution: 96dpi)").matches).toBe(true);
    expect(window.matchMedia("(resolution: calc(1x + 2px))").matches).toBe(false);
    window.devicePixelRatio = 2;
    expect(query.matches).toBe(true);
    expect(window.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
  } finally {
    window.close();
  }
});

it("applies media restrictions on attached and constructed stylesheets", () => {
  const { window } = new JSDOM('<style media="print">p { color: green }</style><p></p>');
  try {
    const p = window.document.querySelector("p");
    const style = window.document.querySelector("style");
    if (!p || !(style instanceof window.HTMLStyleElement)) throw new Error("Expected a stylesheet");
    const media = style.sheet?.media;
    expect(media?.mediaText).toBe("print");
    expect(window.getComputedStyle(p).color).not.toBe("rgb(0, 128, 0)");
    style.media = "(min-width: 800px)";
    expect(style.sheet?.media).toBe(media);
    expect(media?.item(0)).toBe("(min-width: 800px)");
    expect(window.getComputedStyle(p).color).toBe("rgb(0, 128, 0)");

    const constructed = new window.CSSStyleSheet({ media: "print", disabled: true });
    constructed.replaceSync("p { color: red }");
    window.document.adoptedStyleSheets.push(constructed);
    expect(constructed.disabled).toBe(true);
    constructed.disabled = false;
    expect(window.getComputedStyle(p).color).toBe("rgb(0, 128, 0)");
    constructed.media.appendMedium("screen");
    expect(constructed.media[1]).toBe("screen");
    expect(window.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
  } finally {
    window.close();
  }
});

it("serializes current CSS rule declarations and exposes stylesheet ownership", () => {
  const { window } = new JSDOM('<style title="theme">p{color:red}</style>');
  try {
    const style = window.document.querySelector("style");
    if (!(style instanceof window.HTMLStyleElement) || !style.sheet)
      throw new Error("Expected an attached stylesheet");
    expect(style.sheet.ownerNode === style).toBe(true);
    expect(style.sheet.title).toBe("theme");
    expect(style.sheet.href).toBeNull();

    const sheet = new window.CSSStyleSheet();
    expect([sheet.title, sheet.ownerNode, sheet.ownerRule, sheet.href]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    sheet.replaceSync(".a+.b,.c>p{color:red}");
    const rule = sheet.cssRules[0];
    if (rule?.type !== 1) throw new Error("Expected a style rule");
    expect(rule.cssText).toBe(".a + .b, .c > p { color: red; }");
    rule.style.setProperty("color", "green");
    expect(rule.cssText).toBe(".a + .b, .c > p { color: green; }");
  } finally {
    window.close();
  }
});

it("computes the initial text color and resolves currentcolor after the cascade", () => {
  const { window } = new JSDOM(
    '<p>Default</p><main style="color: red"><span style="color: currentcolor"></span>' +
      '<div style="border-top-color: currentcolor; color: blue"></div>' +
      '<b style="color: initial"></b></main>',
  );
  try {
    const [plain, inherited, border, initial] = window.document.querySelectorAll("p, span, div, b");
    if (!plain || !inherited || !border || !initial) throw new Error("Expected styled elements");
    expect(window.getComputedStyle(plain).color).toBe("rgb(0, 0, 0)");
    expect(window.getComputedStyle(inherited).color).toBe("rgb(255, 0, 0)");
    expect(window.getComputedStyle(border).getPropertyValue("border-top-color")).toBe(
      "rgb(0, 0, 255)",
    );
    expect(window.getComputedStyle(initial).color).toBe("rgb(0, 0, 0)");
  } finally {
    window.close();
  }
});

it("styles shadow hosts and carries inherited styles into their shadow tree", () => {
  const { window } = new JSDOM('<style>main { color: blue }</style><main class="active"></main>');
  try {
    const host = window.document.querySelector("main");
    if (!host) throw new Error("Expected shadow host");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "<p>Text</p>";
    const child = shadow.querySelector("p");
    if (!child) throw new Error("Expected shadow child");
    const sheet = new window.CSSStyleSheet();
    sheet.replaceSync(":host { color: red } :host(.active) { color: green !important }");
    shadow.adoptedStyleSheets = [sheet];
    expect(window.getComputedStyle(host).color).toBe("rgb(0, 128, 0)");
    expect(window.getComputedStyle(child).color).toBe("rgb(0, 128, 0)");
    host.className = "";
    expect(window.getComputedStyle(host).color).toBe("rgb(0, 0, 255)");
    expect(window.getComputedStyle(child).color).toBe("rgb(0, 0, 255)");
    const parent = host.parentNode;
    if (!parent) throw new Error("Expected the host to be connected");
    host.remove();
    expect(window.getComputedStyle(child).color).toBe("");
    parent.appendChild(host);
    expect(window.getComputedStyle(child).color).toBe("rgb(0, 0, 255)");
  } finally {
    window.close();
  }
});

it.each([undefined, "dangerously"] as const)(
  "preserves constructed sheets while a host moves through its document's template contents (%s)",
  (runScripts) => {
    // Given a parsed nested template and a shadow host that adopts a constructed sheet.
    const { window } = new JSDOM(
      "<main></main><template><template></template></template>",
      runScripts ? { runScripts } : {},
    );
    try {
      const doc = window.document;
      const host = doc.querySelector("main");
      const template = doc.querySelector("template");
      if (!host || !(template instanceof window.HTMLTemplateElement))
        throw new Error("Expected template and host");
      const nested = template.content.firstElementChild;
      if (!(nested instanceof window.HTMLTemplateElement))
        throw new Error("Expected nested template");
      const root = host.attachShadow({ mode: "open" });
      const child = doc.createElement("span");
      root.append(child);
      const sheet = new window.CSSStyleSheet();
      sheet.replaceSync("span {color: blue}");
      const list = root.adoptedStyleSheets;
      list.push(sheet);

      // When the host traverses the original and both inert template fragments.
      for (const target of [template.content, doc.body, nested.content]) {
        if (!target) throw new Error("Expected a document body");
        target.append(host);
        // Then the owner changes and the original stylesheet list stays attached.
        expect(host.ownerDocument === target.ownerDocument).toBe(true);
        expect(child.ownerDocument === host.ownerDocument).toBe(true);
        expect(template.content.ownerDocument === doc).toBe(false);
        expect(root.adoptedStyleSheets === list && list[0] === sheet).toBe(true);
        if (target === doc.body)
          expect(window.getComputedStyle(child).color).toBe("rgb(0, 0, 255)");
      }
      // A separate document in the same realm still clears the list in place.
      doc.implementation.createHTMLDocument().adoptNode(host);
      expect(root.adoptedStyleSheets === list && list.length === 0).toBe(true);
    } finally {
      window.close();
    }
  },
);
it("clears adopted stylesheets when an ancestor moves to another document", () => {
  const original = new JSDOM("<main><div></div></main>");
  const destination = new JSDOM("<main></main>");
  try {
    const parent = original.window.document.querySelector("main");
    const host = parent?.querySelector("div");
    const target = destination.window.document.querySelector("main");
    if (!parent || !host || !target) throw new Error("Expected a shadow host and destination");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "<p>Text</p>";
    const p = shadow.querySelector("p");
    if (!p) throw new Error("Expected a shadow child");
    const originalSheet = new original.window.CSSStyleSheet();
    originalSheet.replaceSync("p { color: red }");
    const list = shadow.adoptedStyleSheets;
    list.push(originalSheet);

    target.appendChild(parent);
    expect(shadow.adoptedStyleSheets).toBe(list);
    expect(list).toHaveLength(0);
    expect(() => list.push(originalSheet)).toThrow("same document");
    const destinationSheet = new destination.window.CSSStyleSheet();
    destinationSheet.replaceSync("p { color: blue }");
    list.push(destinationSheet);
    expect(original.window.getComputedStyle(p).color).toBe("rgb(0, 0, 255)");
  } finally {
    destination.window.close();
    original.window.close();
  }
});

it("resolves computed stylesheet URLs against the sheet's base URL", () => {
  const { window } = new JSDOM('<base href="/assets/"><p></p>', {
    url: "https://example.test/page",
  });
  try {
    const p = window.document.querySelector("p");
    if (!p) throw new Error("Expected a style target");
    const sheet = new window.CSSStyleSheet();
    sheet.insertRule('p { background-image: url("one.png") }');
    window.document.adoptedStyleSheets = [sheet];
    expect(window.getComputedStyle(p).getPropertyValue("background-image")).toBe(
      'url("https://example.test/assets/one.png")',
    );

    const custom = new window.CSSStyleSheet({ baseURL: "../theme/" });
    custom.replaceSync('p { background-image: url("two.png") }');
    window.document.adoptedStyleSheets.push(custom);
    expect(window.getComputedStyle(p).getPropertyValue("background-image")).toBe(
      'url("https://example.test/theme/two.png")',
    );
    expect(custom.cssRules[0]?.cssText).toContain('url("two.png")');
    expect(() => new window.CSSStyleSheet({ baseURL: "https://test:test/" })).toThrow(
      "Invalid stylesheet base URL",
    );
  } finally {
    window.close();
  }
});

it("records linked stylesheets in the resource timeline and ignores constructed imports", async () => {
  const requests: string[] = [];
  const { window } = new JSDOM("", {
    url: "https://example.test/",
    resources: {
      interceptors: [
        requestInterceptor((request) => {
          requests.push(request.url);
          return new Response("p { color: red }", { headers: { "content-type": "text/css" } });
        }),
      ],
    },
  });
  try {
    const sheet = new window.CSSStyleSheet();
    await sheet.replace('@import "/ignored.css";');
    const start = window.performance.now();
    const link = window.document.createElement("link");
    if (!(link instanceof window.HTMLLinkElement) || !window.document.head)
      throw new Error("Expected a link and document head");
    const loaded = new Promise<void>((resolve) =>
      link.addEventListener("load", () => resolve(), { once: true }),
    );
    link.rel = "stylesheet";
    link.href = "/loaded.css";
    window.document.head.appendChild(link);
    await loaded;
    expect(requests).toEqual(["https://example.test/loaded.css"]);
    const [entry] = window.performance.getEntriesByType("resource");
    expect(entry).toBeInstanceOf(window.PerformanceResourceTiming);
    expect(entry?.name).toBe(requests[0]);
    expect(entry?.startTime).toBeGreaterThanOrEqual(start);
    window.performance.clearResourceTimings();
    expect(window.performance.getEntries()).toEqual([]);
  } finally {
    window.close();
  }
});

it("records a completed HTTP error response before firing the element error event", async () => {
  const { window } = new JSDOM('<script src="/missing.js"></script>', {
    url: "https://example.test/",
    runScripts: "dangerously",
    resources: { interceptors: [requestInterceptor(() => new Response("", { status: 404 }))] },
  });
  try {
    const script = window.document.querySelector("script");
    if (!script) throw new Error("Expected script");
    const entries = await new Promise<ReturnType<typeof window.performance.getEntries>>(
      (resolve, reject) => {
        script.addEventListener("error", () => resolve(window.performance.getEntries()));
        script.addEventListener("load", () => reject(new Error("Expected a script error")));
      },
    );
    expect(entries).toMatchObject([
      { name: "https://example.test/missing.js", initiatorType: "script" },
    ]);
  } finally {
    window.close();
  }
});

it("delivers buffered and dropped resource entries to performance observers", async () => {
  const { window } = new JSDOM("", {
    url: "https://example.test/",
    resources: { interceptors: [requestInterceptor(() => new Response("p { color: red }"))] },
  });
  try {
    const { PerformanceObserver, performance } = window;
    const head = window.document.head;
    if (!head) throw new Error("Expected document head");
    const load = (href: string) =>
      new Promise<void>((resolve, reject) => {
        const link = window.document.createElement("link");
        link.setAttribute("rel", "stylesheet");
        link.setAttribute("href", href);
        link.addEventListener("load", () => resolve());
        link.addEventListener("error", () => reject(new Error("Expected stylesheet")));
        head.appendChild(link);
      });
    performance.setResourceTimingBufferSize(1);
    await load("/first.css");
    const observer = new PerformanceObserver(() => {});
    observer.observe({ type: "resource", buffered: true });
    expect(observer.takeRecords().map(({ name }) => name)).toEqual([
      "https://example.test/first.css",
    ]);
    expect(() => observer.observe({ entryTypes: ["resource"] })).toThrow();
    observer.disconnect();
    expect(observer.takeRecords()).toEqual([]);

    const delivered = new Promise<{ names: string[]; dropped?: number }>((resolve) => {
      new PerformanceObserver((list, subscription, options) => {
        subscription.disconnect();
        resolve({
          names: list.getEntriesByType("resource").map(({ name }) => name),
          ...(options.droppedEntriesCount === undefined
            ? {}
            : { dropped: options.droppedEntriesCount }),
        });
      }).observe({ entryTypes: ["resource"] });
    });
    await load("/second.css");
    expect(await delivered).toEqual({ names: ["https://example.test/second.css"], dropped: 1 });
    expect(performance.getEntries()).toHaveLength(1);
  } finally {
    window.close();
  }
});

it("retains overflow resource timings when the buffer-full handler makes room", async () => {
  const { window } = new JSDOM("", {
    url: "https://example.test/",
    resources: { interceptors: [requestInterceptor(() => new Response("p { color: red }"))] },
  });
  try {
    const performance = window.performance;
    const head = window.document.head;
    if (!head) throw new Error("Expected document head");
    performance.setResourceTimingBufferSize(1);
    const overflow = new Promise<void>((resolve) => {
      performance.onresourcetimingbufferfull = () => {
        expect(performance.getEntriesByType("resource")).toHaveLength(1);
        performance.setResourceTimingBufferSize(2);
        resolve();
      };
    });
    for (const path of ["/one.css", "/two.css"]) {
      const link = window.document.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", path);
      head.appendChild(link);
    }
    await overflow;
    expect(performance.getEntriesByType("resource").map(({ name }) => name)).toEqual([
      "https://example.test/one.css",
      "https://example.test/two.css",
    ]);
  } finally {
    window.close();
  }
});

it.each(["::marker", "::selection", "::placeholder", "::file-selector-button"])(
  "preserves %s in CSSOM without applying its declarations to the originating element",
  (pseudoElement) => {
    // Given a rule that applies directly to an element.
    const { window } = new JSDOM("<style>p { color: red }</style><p>text</p>");
    try {
      const target = window.document.querySelector("p");
      const rule = window.document.styleSheets[0]?.cssRules[0];
      if (!target || rule?.type !== 1) throw new Error("Expected a style rule and target");
      expect(window.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");

      // When the rule is changed to target a pseudo-element.
      rule.selectorText = `p${pseudoElement}`;

      // Then CSSOM retains the selector and the element loses the rule's color.
      expect(rule.selectorText).toBe(`p${pseudoElement}`);
      expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 0)");
      rule.selectorText = `p:${pseudoElement.slice(2)}`;
      expect(rule.selectorText).toBe(`p${pseudoElement}`);
    } finally {
      window.close();
    }
  },
);

it("evaluates pseudo-element selector support in CSS.supports and conditional rules", () => {
  // Given conditional rules for a recognized and an unknown pseudo-element.
  const { window } = new JSDOM(
    "<style>@supports selector(p::before) { p { color: green } }" +
      "@supports selector(p::-webkit-unknown) { p { color: red } }</style><p>text</p>",
  );
  try {
    const target = window.document.querySelector("p");
    if (!target) throw new Error("Expected a styled paragraph");

    // When querying support, valid pseudo-elements pass and invalid selector syntax fails.
    for (const selector of ["::before", "p:before", "li::marker", "p::selection"])
      expect(window.CSS.supports(`selector(${selector})`)).toBe(true);
    for (const selector of [
      "p::-webkit-unknown",
      "p:marker",
      "p::before, p",
      "unknown|p::before",
      ":is(p, :unknown)::before",
    ])
      expect(window.CSS.supports(`selector(${selector})`)).toBe(false);

    // Then the cascade uses the same support decisions.
    expect(window.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
  } finally {
    window.close();
  }
});

it("recognizes details content pseudo-element selectors in CSSOM and feature queries", () => {
  const { window } = new JSDOM("<style>details { color: red }</style><details>Text</details>");
  try {
    const rule = window.document.styleSheets[0]?.cssRules[0];
    const target = window.document.querySelector("details");
    if (rule?.type !== 1 || !target) throw new Error("Expected a details element and rule");
    for (const suffix of ["", "::before", "::first-line", ":hover", ":lang(en)"]) {
      const selector = `details::details-content${suffix}`;
      expect(window.CSS.supports(`selector(${selector})`)).toBe(true);
      rule.selectorText = selector;
      expect(rule.selectorText).toBe(selector);
    }
    for (const suffix of [":nth-of-type(2)", ":has(a)", "::part(a)", ".child", " > p"]) {
      expect(window.CSS.supports(`selector(details::details-content${suffix})`)).toBe(false);
    }
    expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 0)");
  } finally {
    window.close();
  }
});

it("cascades outline shorthand components with longhands and custom properties", () => {
  // Given a focus outline, an overriding longhand and an inline variable shorthand.
  const { window } = new JSDOM(
    "<style>button:focus-visible { outline: green solid 5px }" +
      "#override { outline-color: blue !important }</style>" +
      "<button>focus</button><button id=override>override</button>" +
      '<p style="--ring: 2px dotted red; outline: var(--ring)">inline</p>',
  );
  try {
    const [first, second] = window.document.querySelectorAll("button");
    const inline = window.document.querySelector("p");
    if (
      !(first instanceof window.HTMLButtonElement) ||
      !(second instanceof window.HTMLButtonElement) ||
      !inline
    )
      throw new Error("Expected three outline targets");

    // When focus moves, the shorthand expands before the cascade selects each longhand.
    first.focus();
    const focus = window.getComputedStyle(first);
    expect(
      ["outline-color", "outline-style", "outline-width"].map((name) =>
        focus.getPropertyValue(name),
      ),
    ).toEqual(["rgb(0, 128, 0)", "solid", "5px"]);
    second.focus();
    expect(window.getComputedStyle(second).getPropertyValue("outline-color")).toBe(
      "rgb(0, 0, 255)",
    );

    // Then variable substitution also supplies each longhand.
    const computed = window.getComputedStyle(inline);
    expect(
      ["outline-color", "outline-style", "outline-width"].map((name) =>
        computed.getPropertyValue(name),
      ),
    ).toEqual(["rgb(255, 0, 0)", "dotted", "2px"]);

    // An explicit style leaves auto available for the color component.
    if (!(inline instanceof window.HTMLElement)) throw new Error("Expected an HTML paragraph");
    inline.style.cssText = "color: purple; outline: auto solid";
    const automatic = window.getComputedStyle(inline);
    expect(automatic.getPropertyValue("outline-color")).toBe("rgb(128, 0, 128)");
    expect(automatic.getPropertyValue("outline-style")).toBe("solid");
  } finally {
    window.close();
  }
});

it("exposes outline longhands in a writable declaration and removes them with the shorthand", () => {
  // Given an inline outline shorthand parsed from markup.
  const { window } = new JSDOM('<p style="outline: 3px ridge blue !important">text</p>');
  try {
    const target = window.document.querySelector("p");
    if (!(target instanceof window.HTMLElement)) throw new Error("Expected a styled paragraph");
    const { style } = target;
    expect(style.getPropertyValue("outline-color")).toBe("blue");
    expect(style.getPropertyValue("outline-style")).toBe("ridge");
    expect(style.getPropertyValue("outline-width")).toBe("3px");
    expect(style.getPropertyPriority("outline-color")).toBe("important");

    // When a longhand is edited, the shorthand reflects the new value.
    style.setProperty("outline-color", "green", "important");
    expect(style.getPropertyValue("outline")).toBe("green ridge 3px");
    expect(window.getComputedStyle(target).getPropertyValue("outline-color")).toBe(
      "rgb(0, 128, 0)",
    );

    // Then removing the shorthand clears all its components.
    expect(style.removeProperty("outline")).toBe("green ridge 3px");
    expect(style.length).toBe(0);
  } finally {
    window.close();
  }
});

it("preserves source order and priority across repeated outline declarations in cssText", () => {
  const { window } = new JSDOM("<p>text</p>");
  try {
    const target = window.document.querySelector("p");
    if (!(target instanceof window.HTMLElement)) throw new Error("Expected a paragraph");

    // A later shorthand resets an intervening longhand.
    target.style.cssText =
      "outline: solid red; color: lime; outline-color: blue; outline: dotted green";
    expect(target.style.getPropertyValue("outline-color")).toBe("green");
    expect(target.style.getPropertyValue("color")).toBe("lime");
    expect(target.style.cssText).toContain("outline: green dotted;");
    target.style.cssText = target.style.cssText;
    expect(target.style.getPropertyValue("outline-color")).toBe("green");

    // An important longhand survives a later normal shorthand and a round trip.
    target.style.cssText = "outline-color: red !important; outline: 2px solid blue";
    target.style.cssText = target.style.cssText;
    expect(target.style.getPropertyValue("outline-color")).toBe("red");
    expect(target.style.getPropertyPriority("outline-color")).toBe("important");
    expect(target.style.getPropertyValue("outline-width")).toBe("2px");

    // Mixed priorities prevent recombination, so auto also has to round-trip as a longhand.
    target.style.cssText = "outline: auto solid; outline-width: 2px !important";
    expect(target.style.cssText).toContain("outline-color: auto;");
    target.style.cssText = target.style.cssText;
    expect(target.style.getPropertyValue("outline-color")).toBe("auto");
  } finally {
    window.close();
  }
});

it("ignores invalid outline longhands before applying value or priority", () => {
  const { window } = new JSDOM(
    "<style>p { outline-color: bogus !important; outline: 2px solid blue }</style><p>",
  );
  try {
    const target = window.document.querySelector("p");
    if (!(target instanceof window.HTMLElement)) throw new Error("Expected a paragraph");
    expect(window.getComputedStyle(target).getPropertyValue("outline-color")).toBe(
      "rgb(0, 0, 255)",
    );

    target.style.cssText = "outline-color: bogus !important; outline: 2px solid green";
    expect(target.style.getPropertyValue("outline-color")).toBe("green");
    expect(target.style.getPropertyPriority("outline-color")).toBe("");

    target.style.setProperty("outline-color", "invert", "important");
    expect(target.style.getPropertyValue("outline-color")).toBe("green");
    expect(target.style.getPropertyPriority("outline-color")).toBe("");

    target.style.setProperty("outline", "-2px dotted red");
    target.style.setProperty("outline-width", "-3px", "important");
    expect(target.style.getPropertyValue("outline-width")).toBe("2px");
    expect(target.style.getPropertyPriority("outline-width")).toBe("");
  } finally {
    window.close();
  }
});

it("resolves outline lengths and clamps only the outline width", () => {
  const { window } = new JSDOM(
    '<p style="font-size: 40px; outline: dotted 2.5px red; outline-offset: calc(10px - 0.5em)">',
  );
  try {
    const target = window.document.querySelector("p");
    if (!(target instanceof window.HTMLElement)) throw new Error("Expected a paragraph");
    let computed = window.getComputedStyle(target);
    expect(computed.getPropertyValue("outline-width")).toBe("2px");
    expect(computed.getPropertyValue("outline-offset")).toBe("-10px");

    target.style.setProperty("outline-width", "calc(10px - 0.5em)");
    target.style.setProperty("outline-offset", "calc(10px + 0.5em)");
    computed = window.getComputedStyle(target);
    expect(computed.getPropertyValue("outline-width")).toBe("0px");
    expect(computed.getPropertyValue("outline-offset")).toBe("30px");
  } finally {
    window.close();
  }
});

it("computes physical viewport units in outline widths and offsets after resizing", () => {
  const { window } = new JSDOM(
    '<p style="outline: solid 1vw; outline-offset: calc(1dvh + 1vmin)">',
  );
  try {
    const target = window.document.querySelector("p");
    if (!target) throw new Error("Expected a paragraph");
    window.innerWidth = 800;
    window.innerHeight = 600;
    let computed = window.getComputedStyle(target);
    expect(computed.getPropertyValue("outline-width")).toBe("8px");
    expect(computed.getPropertyValue("outline-offset")).toBe("12px");

    window.innerWidth = 400;
    computed = window.getComputedStyle(target);
    expect(computed.getPropertyValue("outline-width")).toBe("4px");
    expect(computed.getPropertyValue("outline-offset")).toBe("10px");
  } finally {
    window.close();
  }
});

it("normalizes RGB declarations while preserving priority and readonly behavior", () => {
  // Given a stylesheet color and an inline declaration for the same element.
  const { window } = new JSDOM("<style>p { color: rgb(0,0,255) }</style><p></p>");
  try {
    const paragraph = window.document.querySelector("p");
    if (!(paragraph instanceof window.HTMLElement)) throw new Error("Expected a paragraph");
    // When an important RGB value is applied through CSSOM.
    paragraph.style.setProperty("color", "rgb(0,128,0)", "important");

    // Then serialization, cascade and readonly checks use the normal declaration contract.
    expect(paragraph.getAttribute("style")).toBe("color: rgb(0, 128, 0) !important;");
    expect(paragraph.style.getPropertyPriority("color")).toBe("important");
    const computed = window.getComputedStyle(paragraph);
    expect(computed.color).toBe("rgb(0, 128, 0)");
    expect(() => computed.setProperty("color", "rgb(0,0,255)")).toThrow(
      "read-only style declaration",
    );
  } finally {
    window.close();
  }
});

it("returns CSSStyleProperties for inline, rule, and computed declarations", () => {
  // Given a document with author and inline declarations.
  const { window } = new JSDOM('<style>p { color: red; }</style><p style="color: blue"></p>');
  try {
    const paragraph = window.document.querySelector("p");
    if (!(paragraph instanceof window.HTMLElement)) throw new Error("Expected a paragraph");
    const rule = window.document.styleSheets[0]?.cssRules[0];
    if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected a style rule");

    // Then each declaration has the specialized interface and inherits the common one.
    const { CSSStyleProperties, CSSStyleDeclaration } = window;
    expect(Object.getPrototypeOf(CSSStyleProperties)).toBe(CSSStyleDeclaration);
    for (const style of [paragraph.style, rule.style, window.getComputedStyle(paragraph)]) {
      expect(style).toBeInstanceOf(CSSStyleProperties);
      expect(style).toBeInstanceOf(CSSStyleDeclaration);
      expect(Object.prototype.toString.call(style)).toBe("[object CSSStyleProperties]");
    }
    expect(() => Reflect.construct(CSSStyleProperties, [])).toThrow("Illegal constructor");
  } finally {
    window.close();
  }
});

it("preserves layer statements in the live CSS rule list", () => {
  // Given a layer statement preceding a style rule.
  const { window } = new JSDOM("<style>@layer reset, theme.base; p { color: red }</style><p>");
  try {
    const sheet = window.document.styleSheets[0];
    const rule = sheet?.cssRules[0];
    if (!sheet || !(rule instanceof window.CSSLayerStatementRule))
      throw new Error("Expected a CSS layer statement");
    expect(rule.nameList).toEqual(["reset", "theme.base"]);
    expect(Object.isFrozen(rule.nameList)).toBe(true);
    expect(rule.cssText).toBe("@layer reset, theme.base;");
    expect(rule.parentStyleSheet).toBe(sheet);

    // When a statement is inserted and the original rule is removed.
    expect(sheet.insertRule("@layer utilities;", 1)).toBe(1);
    sheet.deleteRule(0);

    // Then rule order and parent links reflect the operations.
    expect(sheet.cssRules[0]?.cssText).toBe("@layer utilities;");
    expect(sheet.cssRules[1]).toBeInstanceOf(window.CSSStyleRule);
    expect(rule.parentStyleSheet).toBeNull();
  } finally {
    window.close();
  }
});

it("preserves named and anonymous CSS layer blocks as mutable grouping rules", () => {
  // Given nested layer blocks with a style rule.
  const { window } = new JSDOM("<style>@layer theme.base { @layer { p { color: red; } } }</style>");
  try {
    const sheet = window.document.styleSheets[0];
    const outer = sheet?.cssRules[0];
    if (!sheet || !(outer instanceof window.CSSLayerBlockRule))
      throw new Error("Expected a named CSS layer");
    const inner = outer.cssRules[0];
    if (!(inner instanceof window.CSSLayerBlockRule))
      throw new Error("Expected an anonymous layer");
    expect(outer.name).toBe("theme.base");
    expect(inner.name).toBe("");
    expect(inner.parentRule).toBe(outer);
    expect(inner.cssRules[0]?.parentStyleSheet).toBe(sheet);

    // When a rule is inserted inside the anonymous block.
    inner.insertRule("div { color: blue; }");

    // Then the live grouping list and its serialization include the new rule.
    expect(inner.cssRules[0]?.parentRule).toBe(inner);
    // CSSOM prefixes each child rule once; embedded newlines do not gain another indent.
    expect(outer.cssText).toContain("@layer {\n  div { color: blue; }");
    inner.deleteRule(0);
    expect(inner.cssRules.length).toBe(1);
  } finally {
    window.close();
  }
});

it("keeps imports before ordinary stylesheet rules while allowing layer statements", () => {
  // Given an attached stylesheet with an ordinary rule.
  const { window } = new JSDOM("<style>p { color: red; }</style>");
  try {
    const sheet = window.document.styleSheets[0];
    if (!sheet) throw new Error("Expected a stylesheet");
    const importRule = '@import url("data:text/css,");';

    // When callers try to insert imports after ordinary rules or layer blocks.
    expect(() => sheet.insertRule(importRule, 1)).toThrow("@import rules must precede");
    sheet.insertRule("@layer reset;", 0);
    expect(sheet.insertRule(importRule, 1)).toBe(1);
    expect(() => sheet.insertRule("@layer theme {}", 0)).toThrow("Cannot insert a rule before");
    expect(sheet.insertRule("@layer utilities;", 0)).toBe(0);

    // Then rejected insertions leave the live list in its original relative order.
    expect(Array.from(sheet.cssRules, (rule) => rule?.type)).toEqual([0, 0, 3, 1]);
  } finally {
    window.close();
  }
});

it("preserves CSS namespace rules and enforces stylesheet mutation restrictions", () => {
  // Given a namespace followed by an ordinary stylesheet rule.
  const { window } = new JSDOM("<style>@namespace svg url(urn:svg); p { color: red; }</style>");
  try {
    const sheet = window.document.styleSheets[0];
    const rule = sheet?.cssRules[0];
    if (!sheet || !(rule instanceof window.CSSNamespaceRule))
      throw new Error("Expected a namespace rule");
    expect(rule.type).toBe(10);
    expect(rule.prefix).toBe("svg");
    expect(rule.namespaceURI).toBe("urn:svg");
    expect(rule.cssText).toBe('@namespace svg url("urn:svg");');
    expect(rule.parentStyleSheet).toBe(sheet);

    // When callers mutate a sheet containing ordinary rules.
    expect(() => sheet.deleteRule(0)).toThrow("Cannot delete @namespace");
    expect(() => sheet.insertRule('@namespace "urn:default";', 0)).toThrow(
      "Cannot insert @namespace",
    );
    sheet.deleteRule(1);
    expect(sheet.insertRule('@namespace "urn:default";', 1)).toBe(1);

    // Then namespace-only sheets can still be edited.
    sheet.deleteRule(0);
    expect(sheet.cssRules[0]?.cssText).toBe('@namespace url("urn:default");');
    expect(rule.parentStyleSheet).toBeNull();
  } finally {
    window.close();
  }
});

it("uses stylesheet-local namespace prefixes when matching CSS type selectors", () => {
  // Given two sheets with the same prefix bound to different namespaces.
  const { window } = new JSDOM(
    '<style>@namespace x "http://www.w3.org/2000/svg"; x|a { color: red; }</style>' +
      '<style>@namespace x "http://www.w3.org/1999/xhtml"; x|a { color: blue; }</style>' +
      '<a id="html"></a><svg><a id="svg"></a></svg>',
  );
  try {
    const html = window.document.getElementById("html");
    const svg = window.document.getElementById("svg");
    const first = window.document.styleSheets[0];
    if (!html || !svg || !first) throw new Error("Expected matching elements and a stylesheet");
    expect(window.getComputedStyle(html).color).toBe("rgb(0, 0, 255)");
    expect(window.getComputedStyle(svg).color).toBe("rgb(255, 0, 0)");

    // When an additional rule uses the first sheet's existing prefix.
    first.insertRule("x|a { color: green; }", first.cssRules.length);

    // Then only SVG links pick up the inserted declaration.
    expect(window.getComputedStyle(svg).color).toBe("rgb(0, 128, 0)");
    expect(window.getComputedStyle(html).color).toBe("rgb(0, 0, 255)");
  } finally {
    window.close();
  }
});

it("resolves stylesheet namespaces when editing selectors and inserting grouped rules", () => {
  // Given a stylesheet with a namespace binding and a media group.
  const { window } = new JSDOM(
    '<style>@namespace s "http://www.w3.org/2000/svg"; @media all { p { color: red; } }</style>' +
      '<p></p><svg><circle id="circle"/><rect id="rect"/></svg>',
  );
  try {
    const group = window.document.styleSheets[0]?.cssRules[1];
    if (!(group instanceof window.CSSMediaRule)) throw new Error("Expected a media rule");
    const rule = group.cssRules[0];
    if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected a style rule");
    const circle = window.document.getElementById("circle");
    const rect = window.document.getElementById("rect");
    if (!circle || !rect) throw new Error("Expected SVG shapes");

    // When the selector is edited and another qualified rule is inserted.
    rule.selectorText = "s|circle";
    group.insertRule("s|rect { color: blue; }");
    rule.selectorText = "unknown|rect";

    // Then valid changes use the owning sheet and the invalid edit leaves the selector intact.
    expect(rule.selectorText).toBe("s|circle");
    expect(window.getComputedStyle(circle).color).toBe("rgb(255, 0, 0)");
    expect(window.getComputedStyle(rect).color).toBe("rgb(0, 0, 255)");
  } finally {
    window.close();
  }
});

it("matches qualified CSS attributes by namespace URI and value", () => {
  // Given identical local attribute names in different namespaces.
  const { window } = new JSDOM(
    '<style>@namespace link "http://www.w3.org/1999/xlink"; ' +
      '[link|href="#Target" i] { color: red; }</style>' +
      '<svg><a id="qualified" xlink:href="#target"/><a id="plain" href="#target"/></svg>',
  );
  try {
    const qualified = window.document.getElementById("qualified");
    const plain = window.document.getElementById("plain");
    if (!qualified || !plain) throw new Error("Expected SVG links");

    // Then only the qualified attribute matches, even though both values compare equal.
    expect(window.getComputedStyle(qualified).color).toBe("rgb(255, 0, 0)");
    expect(window.getComputedStyle(plain).color).not.toBe("rgb(255, 0, 0)");
    qualified.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
    expect(window.getComputedStyle(qualified).color).not.toBe("rgb(255, 0, 0)");
  } finally {
    window.close();
  }
});

it("applies default CSS namespaces to explicit and implied type selectors", () => {
  // Given an SVG default namespace and matching HTML and SVG class attributes.
  const { window } = new JSDOM(
    '<style>@namespace "http://www.w3.org/2000/svg"; a.mark { color: red; } ' +
      "[data-hit] { visibility: hidden; } *|a { direction: rtl; }</style>" +
      '<a id="html" class="mark" data-hit></a><svg><a id="svg" class="mark" data-hit/></svg>',
  );
  try {
    const html = window.document.getElementById("html");
    const svg = window.document.getElementById("svg");
    if (!html || !svg) throw new Error("Expected HTML and SVG links");

    // Then the default filters element names, and an explicit wildcard bypasses it.
    expect(window.getComputedStyle(svg).color).toBe("rgb(255, 0, 0)");
    expect(window.getComputedStyle(html).color).not.toBe("rgb(255, 0, 0)");
    expect(window.getComputedStyle(svg).getPropertyValue("visibility")).toBe("hidden");
    expect(window.getComputedStyle(html).getPropertyValue("visibility")).not.toBe("hidden");
    expect(window.getComputedStyle(html).getPropertyValue("direction")).toBe("rtl");
  } finally {
    window.close();
  }
});

it("applies default namespaces inside functional selectors without constraining their exempt subjects", () => {
  // Given a default SVG namespace and matching class names in both namespaces.
  const { window } = new JSDOM(
    '<style>@namespace "http://www.w3.org/2000/svg"; ' +
      "*|a:is(.outer > .match) { color: red; } " +
      "*|div:has(> .match) { color: blue; } *|a:is(.match) { direction: rtl; }</style>" +
      '<div id="html" class="outer"><a class="match"></a></div>' +
      '<svg><g class="outer"><a id="svg" class="match"/></g></svg>',
  );
  try {
    const html = window.document.getElementById("html");
    const svg = window.document.getElementById("svg");
    const link = html?.firstElementChild;
    if (!html || !svg || !link) throw new Error("Expected matching fixture elements");

    // Then implicit namespace checks apply to ancestors in :is() and relative subjects in :has().
    expect(window.getComputedStyle(svg).color).toBe("rgb(255, 0, 0)");
    expect(window.getComputedStyle(link).color).not.toBe("rgb(255, 0, 0)");
    expect(window.getComputedStyle(link).getPropertyValue("direction")).toBe("rtl");
    expect(window.getComputedStyle(html).color).not.toBe("rgb(0, 0, 255)");
  } finally {
    window.close();
  }
});

it("preserves mutable CSS counter-style descriptors and serializes their updates", () => {
  // Given a custom counter style and an ordinary rule in the same sheet.
  const { window } = new JSDOM(
    '<style>@counter-style marks { system: cyclic; symbols: "*"; suffix: " "; } p { color: red; }</style>',
  );
  try {
    const sheet = window.document.styleSheets[0];
    const rule = sheet?.cssRules[0];
    if (!(rule instanceof window.CSSCounterStyleRule)) throw new Error("Expected a counter style");
    expect(rule.name).toBe("marks");
    expect(rule.system).toBe("cyclic");
    expect(rule.symbols).toBe('"*"');
    expect(rule.fallback).toBe("");
    expect(rule.parentStyleSheet).toBe(sheet);

    // When CSSOM changes descriptors.
    rule.name = "markers";
    rule.speakAs = "bullets";
    rule.suffix = "";

    // Then the live rule serializes only its remaining descriptors.
    expect(rule.cssText).toBe(
      '@counter-style markers { system: cyclic; symbols: "*"; speak-as: bullets; }',
    );
    expect(sheet?.cssRules[1]).toBeInstanceOf(window.CSSStyleRule);
  } finally {
    window.close();
  }
});

it("preserves page rules with editable selectors and declarations", () => {
  // Given a named page rule followed by an ordinary style rule.
  const { window } = new JSDOM(
    "<style>@page chapter:left { margin: 2cm; } p { color: red; }</style>",
  );
  try {
    const sheet = window.document.styleSheets[0];
    const page = sheet?.cssRules[0];
    if (!(page instanceof window.CSSPageRule)) throw new Error("Expected a page rule");
    expect(page.type).toBe(6);
    expect(page.parentStyleSheet).toBe(sheet);
    expect(page.style).toBeInstanceOf(window.CSSStyleDeclaration);
    expect(page.style).not.toBeInstanceOf(window.CSSStyleProperties);

    // When the page selector and declarations are edited.
    page.selectorText = " appendix:RIGHT ";
    page.selectorText = ":unknown";
    page.style.setProperty("margin", "1cm");

    // Then the invalid selector is ignored and the updated declarations are serialized.
    expect(page.selectorText).toBe("appendix:right");
    expect(page.cssText).toBe("@page appendix:right { margin: 1cm; }");
    expect(sheet?.cssRules[1]).toBeInstanceOf(window.CSSStyleRule);
  } finally {
    window.close();
  }
});

it("preserves animation keyframes and supports CSSOM edits", () => {
  // Given named animation keyframes with equivalent keyword and percentage offsets.
  const { window } = new JSDOM(
    "<style>@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }</style>",
  );
  try {
    const sheet = window.document.styleSheets[0];
    const animation = sheet?.cssRules[0];
    if (!(animation instanceof window.CSSKeyframesRule)) throw new Error("Expected keyframes");
    const start = animation.findRule("0%");
    if (!(start instanceof window.CSSKeyframeRule)) throw new Error("Expected a keyframe");
    expect(start.keyText).toBe("0%");
    expect(start.parentRule).toBe(animation);
    expect(start.parentStyleSheet).toBe(sheet);

    // When the animation is edited using CSSOM.
    animation.appendRule("50% { opacity: 0.5; }");
    start.keyText = "25%, 40%";
    animation.deleteRule("to");

    // Then its indexed, live rule list contains the edited keyframes.
    expect(animation.length).toBe(2);
    expect(animation[0]).toBe(start);
    expect(animation.findRule("25%,40%")).toBe(start);
    expect(animation.findRule("to")).toBeNull();
    expect(animation.cssText).toBe(
      "@keyframes pulse { 25%, 40% { opacity: 0; } 50% { opacity: 0.5; } }",
    );
    expect(() => (start.keyText = "invalid")).toThrow("Invalid keyframe selector");
  } finally {
    window.close();
  }
});

it("decodes valid keyframe names and drops malformed or reserved identifiers", () => {
  // Given quoted names, escaped identifiers, and invalid unquoted names.
  const { window } = new JSDOM(
    '<style>@keyframes "none" {} @keyframes f\\6f o {} @keyframes none {} ' +
      '@keyframes one two {} @keyframes "" {}</style>',
  );
  try {
    const rules = window.document.styleSheets[0]?.cssRules;
    expect(rules?.length).toBe(2);
    const quoted = rules?.[0];
    const escaped = rules?.[1];
    if (
      !(quoted instanceof window.CSSKeyframesRule) ||
      !(escaped instanceof window.CSSKeyframesRule)
    )
      throw new Error("Expected two animation rules");

    // Then CSSOM exposes decoded names and quotes reserved names on serialization.
    expect(quoted.name).toBe("none");
    expect(quoted.cssText).toContain('@keyframes "none"');
    expect(escaped.name).toBe("foo");
  } finally {
    window.close();
  }
});

it("preserves container queries as editable CSSOM grouping rules", () => {
  // Given a named container query followed by an ordinary rule.
  const { window } = new JSDOM(
    "<style>@container card (min-width: 100px) { p { color: red; } } p { color: blue; }</style><p>",
  );
  try {
    const sheet = window.document.styleSheets[0];
    const query = sheet?.cssRules[0];
    if (!(query instanceof window.CSSContainerRule)) throw new Error("Expected a container rule");
    expect(query).toBeInstanceOf(window.CSSConditionRule);
    expect(query.containerName).toBe("card");
    expect(query.containerQuery).toBe("(min-width: 100px)");
    expect(query.conditionText).toBe("card (min-width: 100px)");
    expect(query.cssRules[0]?.parentRule).toBe(query);

    // When CSSOM inserts another rule into the query.
    query.insertRule("div { color: green; }");

    // Then the live list reflects the edit without applying the query in the headless cascade.
    expect(query.cssRules[0]?.parentStyleSheet).toBe(sheet);
    expect(query.cssText).toContain("div { color: green; }");
    const paragraph = window.document.querySelector("p");
    if (!paragraph) throw new Error("Expected a paragraph");
    expect(window.getComputedStyle(paragraph).color).toBe("rgb(0, 0, 255)");
  } finally {
    window.close();
  }
});

it("preserves explicit and implicit CSS scope boundaries in grouping rules", () => {
  // Given a bounded scope and a scope that uses its implicit root.
  const { window } = new JSDOM(
    "<style>@scope (.outer, .other) to (.limit) { p { color: red; } } @scope { div {} }</style>",
  );
  try {
    const sheet = window.document.styleSheets[0];
    const scope = sheet?.cssRules[0];
    const implicit = sheet?.cssRules[1];
    if (!(scope instanceof window.CSSScopeRule) || !(implicit instanceof window.CSSScopeRule))
      throw new Error("Expected two scope rules");
    expect(scope.start).toBe(".outer, .other");
    expect(scope.end).toBe(".limit");
    expect(implicit.start).toBeNull();
    expect(implicit.end).toBeNull();

    // When CSSOM edits the scoped rule list.
    scope.insertRule("div { color: blue; }", 0);

    // Then the serialized scope and parent links include the inserted rule.
    expect(scope.cssText).toContain("@scope (.outer, .other) to (.limit)");
    expect(scope.cssRules[0]?.parentRule).toBe(scope);
    expect(scope.cssRules[0]?.parentStyleSheet).toBe(sheet);
  } finally {
    window.close();
  }
});

it("applies scoped declarations within their root and before their limit", () => {
  const { window } = new JSDOM(
    "<style>@scope (.root) to (.limit) { p { color: red } :scope { direction: rtl } } p { color: blue }</style>" +
      '<p id="outside"></p><section class="root" id="root"><p id="inside"></p>' +
      '<div class="limit"><p id="excluded"></p></div></section>',
  );
  try {
    const style = (id: string) => {
      const node = window.document.getElementById(id);
      if (!node) throw new Error("Expected a fixture element");
      return window.getComputedStyle(node);
    };
    expect(style("outside").color).toBe("rgb(0, 0, 255)");
    expect(style("inside").color).toBe("rgb(255, 0, 0)");
    expect(style("excluded").color).toBe("rgb(0, 0, 255)");
    expect(style("root").getPropertyValue("direction")).toBe("rtl");
    // The compiled boundaries still match against current attributes.
    window.document.querySelector(".limit")?.removeAttribute("class");
    expect(style("excluded").color).toBe("rgb(255, 0, 0)");
    window.document.getElementById("root")?.removeAttribute("class");
    expect(style("inside").color).toBe("rgb(0, 0, 255)");
  } finally {
    window.close();
  }
});

it("tries each enclosing scope root for selectors that depend on :scope", () => {
  // Given a nearer root that lacks the class required by the scoped selector.
  const { window } = new JSDOM(
    "<style>@scope (.root) { :scope.outer p { color: red; } }</style>" +
      '<main class="root outer"><section class="root"><p></p></section></main>',
  );
  try {
    const target = window.document.querySelector("p");
    if (!target) throw new Error("Expected a paragraph");

    // Then the farther matching root can still supply the declaration.
    expect(window.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
  } finally {
    window.close();
  }
});

it("uses the document tree as an implicit scope root for adopted stylesheets", () => {
  // Given a constructed stylesheet with no owning style element.
  const { window } = new JSDOM("<main><p></p></main>");
  try {
    const sheet = new window.CSSStyleSheet();
    sheet.replaceSync("@scope to (.limit) { p { color: red; } }");
    window.document.adoptedStyleSheets = [sheet];
    const target = window.document.querySelector("p");
    if (!target) throw new Error("Expected a paragraph");

    // Then the sheet matches until a limit is introduced in the target's ancestry.
    expect(window.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
    window.document.querySelector("main")?.classList.add("limit");
    expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 0)");
  } finally {
    window.close();
  }
});

describe("CSSStyleDeclaration mutation transactions", () => {
  it("publishes a shorthand once and preserves invalid declarations and priorities", () => {
    // Given an existing important declaration and an attribute observer
    const { window } = new JSDOM("<p></p>");
    try {
      const node = window.document.querySelector("p");
      if (!(node instanceof window.HTMLElement)) throw new Error("Expected a paragraph");
      node.style.setProperty("color", "red", "important");
      const observer = new window.MutationObserver(() => {});
      observer.observe(node, { attributes: true, attributeOldValue: true });
      // When an invalid value requests a priority change
      node.style.setProperty("color", "invalid", "");
      expect(node.style.getPropertyPriority("color")).toBe("important");
      expect(observer.takeRecords()).toHaveLength(0);
      Reflect.set(node.style, "padding", "1px 2px 3px 4px");
      // Then only the completed shorthand is observable
      expect(observer.takeRecords()).toHaveLength(1);
      node.style.color = "red";
      expect(node.style.getPropertyPriority("color")).toBe("");
      expect(observer.takeRecords()).toHaveLength(1);
    } finally {
      window.close();
    }
  });

  it("allows custom element reactions to replace a completed shorthand", () => {
    // Given a custom element that replaces its first style update
    const { window } = new JSDOM();
    try {
      const changes: (string | null)[] = [];
      class StyledElement extends window.HTMLElement {
        static observedAttributes = ["style"];
        attributeChangedCallback(_name: string, _before: string | null, after: string | null) {
          changes.push(after);
          if (changes.length === 1) this.style.cssText = "color: blue;";
        }
      }
      window.customElements.define("styled-transaction", StyledElement);
      const node = window.document.createElement("styled-transaction");
      if (!(node instanceof window.HTMLElement)) throw new Error("Expected an HTML element");
      // When a shorthand initiates a synchronous reaction
      Reflect.set(node.style, "padding", "1px 2px");
      // Then the reaction sees the completed block and its replacement persists
      expect(changes).toEqual(["padding: 1px 2px;", "color: blue;"]);
      expect(node.style.cssText).toBe("color: blue;");
    } finally {
      window.close();
    }
  });
});

it("borrows CSS declaration mutations across windows without invoking overridden setters", () => {
  // Given declarations with separate Window-local interfaces
  const left = new JSDOM();
  const right = new JSDOM();
  try {
    const source = left.window.document.createElement("p").style;
    const target = right.window.document.createElement("p").style;
    const setText = Object.getOwnPropertyDescriptor(
      left.window.CSSStyleDeclaration.prototype,
      "cssText",
    )?.set;
    Reflect.set(target, "setProperty", () => {
      throw new Error("Overridden method must be bypassed");
    });
    // When a borrowed method, a direct property, and a borrowed cssText setter write the target
    source.setProperty.call(target, "color", "red");
    Reflect.set(target, "padding", "2px");
    expect(target.color).toBe("red");
    expect(target.getPropertyValue("padding")).toBe("2px");
    setText?.call(target, "margin: 1px; color: blue;");
    // Then the receiver's declaration remains internally consistent
    expect(target.cssText).toBe("margin: 1px; color: blue;");
    expect(source.cssText).toBe("");
  } finally {
    left.window.close();
    right.window.close();
  }
});

it("preserves the position list when the child has additional image layers", () => {
  // Given a parent with two position layers and a child with three image layers
  const { window } = new JSDOM(
    '<main style="background-image:none,none;background-position-x:10px,20px;background-position-y:1px,2px">' +
      '<p style="background-image:none,none,none;background-position:inherit"></p></main>',
  );
  try {
    const node = window.document.querySelector("p");
    if (!node) throw new Error("Expected the child");
    // Then the CSS-wide keyword stays intact until inheritance resolves both axes
    expect(window.getComputedStyle(node).getPropertyValue("background-position")).toBe(
      "10px 1px, 20px 2px",
    );
  } finally {
    window.close();
  }
});

it("preserves cascade order and mutations across many individual stylesheets", () => {
  const { window } = new JSDOM(
    "<head>" +
      Array.from(
        { length: 18 },
        (_, index) => `<style>.group${index % 3}, #never${index} { --winner: ${index} }</style>`,
      ).join("") +
      "<style>* { --fallback: yes }</style></head><p class=group1></p>",
  );
  try {
    const doc = window.document;
    const target = doc.querySelector("p");
    const head = doc.head;
    const first = head?.firstElementChild;
    if (!target || !head || !first) throw new Error("Expected a target and stylesheet root");
    const list = doc.styleSheets;
    expect(list.length).toBe(19);
    expect("0" in list).toBe(true);
    const original = window.getComputedStyle(target);
    expect(original.getPropertyValue("--winner")).toBe("16");
    expect(original.getPropertyValue("--fallback")).toBe("yes");
    target.className = "group0";
    head.append(first);
    expect(window.getComputedStyle(target).getPropertyValue("--winner")).toBe("0");
    const exposed = Object.getOwnPropertyDescriptor(list, "0")?.value as
      | (typeof list)[number]
      | undefined;
    if (!exposed) throw new Error("Expected the first sheet descriptor");
    exposed.insertRule(".group0.group0 { --winner: edited }");
    expect(window.getComputedStyle(target).getPropertyValue("--winner")).toBe("edited");
    exposed.deleteRule(0);
    first.remove();
    expect(window.getComputedStyle(target).getPropertyValue("--winner")).toBe("15");
    expect(original.getPropertyValue("--winner")).toBe("15");
  } finally {
    window.close();
  }
});

it("keeps private media and pseudo-element sheets ordered across CSSOM exposure", () => {
  const { window } = new JSDOM(
    "<head>" +
      Array.from(
        { length: 12 },
        (_, index) =>
          `<style>@media (min-width: 600px) { .item${index} { --slot: ${index} } }</style>`,
      ).join("") +
      "<style>.item4::before { --pseudo-only: yes }</style>" +
      "<style>@keyframes fade { from { --keyframe-only: yes } }</style>" +
      "<style>.item4 { --overlay: last }</style></head><p class=item4></p>",
  );
  try {
    const target = window.document.querySelector("p");
    if (!target) throw new Error("Expected an element with a matching media rule");
    const read = () => window.getComputedStyle(target);
    const wide = read();
    expect(wide.getPropertyValue("--slot")).toBe("4");
    expect(wide.getPropertyValue("--pseudo-only")).toBe("");
    expect(wide.getPropertyValue("--keyframe-only")).toBe("");
    const sheets = window.document.styleSheets;
    const overlay = sheets.item(sheets.length - 1);
    if (!overlay) throw new Error("Expected an editable overlay sheet");
    overlay.insertRule(".item4.item4 { --overlay: changed }");
    expect(read().getPropertyValue("--overlay")).toBe("changed");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    expect(read().getPropertyValue("--slot")).toBe("");
    expect(wide.getPropertyValue("--slot")).toBe("");
    target.className = "item7";
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    expect(read().getPropertyValue("--slot")).toBe("7");
    expect(wide.getPropertyValue("--overlay")).toBe("");
  } finally {
    window.close();
  }
});

it("gives rules with identical private declarations independent editable CSSOM views", () => {
  const text = "color:#102030;border-left:3px solid red;--value:one";
  const { window } = new JSDOM(
    `<style>.first{${text}} .second{${text}}</style><b class=first></b><i class=second></i>`,
  );
  try {
    const first = window.document.querySelector("b");
    const second = window.document.querySelector("i");
    if (!first || !second) throw new Error("Expected two selector subjects");
    const a = window.getComputedStyle(first);
    const b = window.getComputedStyle(second);
    expect(a.getPropertyValue("--value")).toBe("one");
    expect(b.getPropertyValue("--value")).toBe("one");
    const rules = window.document.styleSheets.item(0)?.cssRules;
    const left = rules?.item(0),
      right = rules?.item(1);
    if (!left || !right || !("style" in left) || !("style" in right))
      throw new Error("Expected two style rules");
    expect(left.style).not.toBe(right.style);
    expect(left.style.parentRule).toBe(left);
    expect(right.style.parentRule).toBe(right);
    left.style.setProperty("--value", "two");
    expect(window.getComputedStyle(first).getPropertyValue("--value")).toBe("two");
    expect(window.getComputedStyle(second).getPropertyValue("--value")).toBe("one");
    expect(right.style.getPropertyValue("border-left-width")).toBe("3px");
    expect(a.getPropertyValue("--value")).toBe("two");
  } finally {
    window.close();
  }
});

it("parses utility rules and preserves recovery after a newline-terminated declaration", () => {
  const utility = Array.from(
    { length: 128 },
    (_, i) => `.item${i}{--slot:${i};margin-inline-start:${i}px;}`,
  ).join("");
  const { window } = new JSDOM(
    `<style>@media (min-width: 1px){${utility}}</style><p class=item91></p>`,
  );
  try {
    const target = window.document.querySelector("p");
    const source = window.document.querySelector("style");
    if (!target || !source) throw new Error("Expected a utility sheet and its target");
    const original = window.getComputedStyle(target);
    expect(original.getPropertyValue("margin-inline-start")).toBe("91px");
    const media = window.document.styleSheets.item(0)?.cssRules.item(0);
    if (!media || !("cssRules" in media)) throw new Error("Expected a readable rule group");
    expect(media.cssRules.length).toBe(128);
    expect(media.cssRules.item(91)?.cssText).toContain(".item91");
    source.textContent = utility + ".item91{--slot:changed;\n}";
    expect(window.getComputedStyle(target).getPropertyValue("--slot")).toBe("changed");
    expect(original.getPropertyValue("--slot")).toBe("changed");
  } finally {
    window.close();
  }
});
