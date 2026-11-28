// Pins computed values around elements whose cascade uses the CSS Values evaluator for ordinary functions.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

const ease = "cubic-bezier(0.4, 0, 0.2, 1)";

function computed(
  html: string,
  read: (
    style: (selector: string) => ReturnType<JSDOM["window"]["getComputedStyle"]>,
    window: JSDOM["window"],
  ) => unknown,
) {
  const { window } = new JSDOM(html);
  try {
    return read((selector) => {
      const element = window.document.querySelector(selector);
      if (!element) throw new Error(`Expected ${selector}`);
      return window.getComputedStyle(element);
    }, window);
  } finally {
    window.close();
  }
}

describe("computed style beside timing functions", () => {
  it("substitutes var() inside a transition without leaking it to children", () => {
    // Given a transition whose duration and timing function come from custom properties
    const html = `<style>:root{--ease:${ease};--dur:250ms} .b{transition:color var(--dur) var(--ease)}</style><div class=b><span></span></div>`;
    // When the element and its child are read
    const values = computed(html, (style) => [
      style(".b").getPropertyValue("transition-timing-function"),
      style(".b").getPropertyValue("transition-duration"),
      style("span").getPropertyValue("transition-timing-function"),
      style("span").getPropertyValue("transition-duration"),
    ]);
    // Then the element gets the substituted values and the child keeps the initial ones
    expect(values).toEqual([ease, "0.25s", "ease", "0s"]);
  });

  it("substitutes var() outside the transition on the element and its descendants", () => {
    // Given an element with a transition and var() colors, and a child using the same variable
    const html = `<style>:root{--c:rgb(1, 2, 3)} .b{color:var(--c);box-shadow:0 0 2px var(--c);transition:box-shadow 1s ${ease}} span{border-top-color:var(--c);border-top-style:solid}</style><div class=b><span></span></div>`;
    // When colors are read
    const values = computed(html, (style) => [
      style(".b").getPropertyValue("color"),
      style(".b").getPropertyValue("box-shadow"),
      style("span").getPropertyValue("border-top-color"),
      style("span").getPropertyValue("color"),
    ]);
    // Then every var() reference resolves
    expect(values).toEqual([
      "rgb(1, 2, 3)",
      "rgb(1, 2, 3) 0px 0px 2px",
      "rgb(1, 2, 3)",
      "rgb(1, 2, 3)",
    ]);
  });

  it("inherits custom properties computed beside a transition", () => {
    // Given a custom property built from another one on an element with a transition
    const html = `<style>.p{--b:2px;--a:calc(var(--b) * 2);transition:opacity 1s ${ease}} .c{padding-left:var(--a)}</style><div class=p><p class=c><i></i></p></div>`;
    // When the child and grandchild are read
    const values = computed(html, (style) => [
      style(".c").getPropertyValue("padding-left"),
      style(".c").getPropertyValue("--a"),
      style("i").getPropertyValue("--a"),
      style("i").getPropertyValue("padding-left"),
    ]);
    // Then the token value inherits and only the declaring child uses it
    expect(values).toEqual(["4px", "calc(2px * 2)", "calc(2px * 2)", "0px"]);
  });

  it("inherits registered custom properties as computed lengths", () => {
    // Given a registered inherited length set in em on an element with a transition
    const html = `<style>@property --size{syntax:'<length>';inherits:true;initial-value:0px} .p{font-size:10px;--size:2em;transition:color 1s ${ease}} .c{font-size:20px;width:var(--size)}</style><div class=p><p class=c></p></div>`;
    // When the parent and child are read
    const values = computed(html, (style) => [
      style(".p").getPropertyValue("--size"),
      style(".c").getPropertyValue("--size"),
      style(".c").getPropertyValue("width"),
    ]);
    // Then the child inherits the parent's absolute length
    expect(values).toEqual(["20px", "20px", "20px"]);
  });

  it("treats invalid var() results as unset at computed-value time", () => {
    // Given a child with missing and type-invalid variables under a transitioning parent
    const html = `<style>.p{color:rgb(0, 128, 0);transition:color 1s ${ease}} .c{color:var(--missing);margin-left:var(--missing);--bad:10px;transition-timing-function:var(--bad)}</style><div class=p><p class=c></p></div>`;
    // When the child is read
    const values = computed(html, (style) => [
      style(".c").getPropertyValue("color"),
      style(".c").getPropertyValue("margin-left"),
      style(".c").getPropertyValue("transition-timing-function"),
    ]);
    // Then inherited properties inherit and the others take initial values
    expect(values).toEqual(["rgb(0, 128, 0)", "0px", "ease"]);
  });

  it("tracks attr() changes below a transitioning parent", () => {
    // Given a child width from attr() below a parent with a transition
    const html = `<style>.p{transition:color 1s ${ease}} .c{width:attr(data-w px, 3px)}</style><div class=p><p class=c data-w=5></p></div>`;
    // When the attribute changes between reads
    const values = computed(html, (style, window) => {
      const before = style(".c").getPropertyValue("width");
      window.document.querySelector(".c")?.setAttribute("data-w", "7");
      return [before, style(".c").getPropertyValue("width")];
    });
    // Then the second read sees the new attribute
    expect(values).toEqual(["5px", "7px"]);
  });

  it("recomputes font-relative shadows when an ancestor font size changes", () => {
    // Given an em-based shadow under a parent whose font size depends on a class
    const html = `<style>.p{font-size:10px;transition:color 1s ${ease}} .p.big{font-size:20px} .c{box-shadow:0 0 1em red;transition:box-shadow 1s ${ease}}</style><div class=p><p class=c></p></div>`;
    // When the class is added and removed between reads
    const values = computed(html, (style, window) => {
      const parent = window.document.querySelector(".p");
      const before = style(".c").getPropertyValue("box-shadow");
      parent?.classList.add("big");
      const big = style(".c").getPropertyValue("box-shadow");
      parent?.classList.remove("big");
      return [before, big, style(".c").getPropertyValue("box-shadow")];
    });
    // Then each read reflects the current font size
    expect(values).toEqual([
      "rgb(255, 0, 0) 0px 0px 10px",
      "rgb(255, 0, 0) 0px 0px 20px",
      "rgb(255, 0, 0) 0px 0px 10px",
    ]);
  });

  it("resolves the same var() shadow against each element's own custom properties", () => {
    // Given identical var() shadows whose variable is declared locally, inherited, or changed later
    const html = `<style>.s{box-shadow:var(--s);transition:box-shadow 1s ${ease}} .a{--s:0 0 1px red} .b{--s:0 0 2px blue} .local{--s:0 0 3px lime}</style><div class=a><p class=s></p></div><div class=b><p class=s></p><p class="s local"></p></div>`;
    // When every shadow is read, then the first parent's variable changes
    const values = computed(html, (_style, window) => {
      const read = () =>
        [...window.document.querySelectorAll(".s")].map((element) =>
          window.getComputedStyle(element).getPropertyValue("box-shadow"),
        );
      const before = read();
      window.document.querySelector(".a")?.setAttribute("style", "--s: 0 0 4px red");
      return [...before, ...read()];
    });
    // Then each read reflects the variable visible to that element
    expect(values).toEqual([
      "rgb(255, 0, 0) 0px 0px 1px",
      "rgb(0, 0, 255) 0px 0px 2px",
      "rgb(0, 255, 0) 0px 0px 3px",
      "rgb(255, 0, 0) 0px 0px 4px",
      "rgb(0, 0, 255) 0px 0px 2px",
      "rgb(0, 255, 0) 0px 0px 3px",
    ]);
  });

  it("follows an inherited timing function when the parent's changes", () => {
    // Given a child that inherits the parent's timing function
    const html = `<style>.p{transition:color 1s ${ease}} .p.x{transition:color 1s steps(2, jump-end)} .c{transition-timing-function:inherit}</style><div class=p><p class=c></p></div>`;
    // When the parent switches to a steps() transition
    const values = computed(html, (style, window) => {
      const before = style(".c").getPropertyValue("transition-timing-function");
      window.document.querySelector(".p")?.classList.add("x");
      return [
        before,
        style(".c").getPropertyValue("transition-timing-function"),
        style(".p").getPropertyValue("transition-timing-function"),
      ];
    });
    // Then the child follows the parent's new value
    expect(values).toEqual([ease, "steps(2)", "steps(2)"]);
  });

  it("resolves flow-relative positions through each element's own writing mode", () => {
    // Given elements that declare the same logical position under different writing modes
    const html = `<div id=a style="direction: rtl; object-position: block-end inline-start"></div><div id=b style="writing-mode: vertical-rl; direction: rtl; object-position: block-end inline-start"></div><style>:root{--edge: block-end inline-start} #c{direction: rtl; object-position: var(--edge)} #d{writing-mode: vertical-rl; direction: rtl; object-position: var(--edge)}</style><div id=c></div><div id=d></div>`;
    // When each is read in turn in one process
    const values = computed(html, (style) =>
      ["#a", "#b", "#c", "#d", "#a"].map((selector) =>
        style(selector).getPropertyValue("object-position"),
      ),
    );
    // Then no element reuses another writing mode's physical mapping
    expect(values).toEqual(["100% 100%", "0% 100%", "100% 100%", "0% 100%", "100% 100%"]);
  });
});
