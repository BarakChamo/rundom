// Pins var() substitution results through inherited frames, mutations, registrations and Windows.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

function element(window: JSDOM["window"], selector: string) {
  const found = window.document.querySelector(selector);
  if (!found) throw new Error(`Expected ${selector}`);
  return found;
}

function inlineStyle(window: JSDOM["window"], selector: string) {
  const found = element(window, selector);
  if (!(found instanceof window.HTMLElement)) throw new Error(`Expected HTML ${selector}`);
  return found.style;
}

describe("getComputedStyle var() substitution", () => {
  it("should resolve shorthand substitutions from inherited custom properties and follow ancestor changes", () => {
    // Given: a themed ancestor, a parent overriding a token and a child using var() shorthands
    const { window } = new JSDOM(
      `<style>.theme{--gap:4px;--edge:2px;--ink:rgb(1, 2, 3)} .item{padding:var(--gap) var(--edge);border:var(--edge) solid var(--ink);transition:color 1s} .parent{font-size:20px;--gap:6px} .child{margin:1em var(--gap)}</style><main class=theme><div class=parent><p class="item child"></p></div></main>`,
    );
    try {
      const child = element(window, "p");
      const read = () => {
        const style = window.getComputedStyle(child);
        return [
          style.getPropertyValue("padding-top"),
          style.getPropertyValue("padding-left"),
          style.getPropertyValue("border-top-width"),
          style.getPropertyValue("border-top-color"),
          style.getPropertyValue("margin-top"),
          style.getPropertyValue("margin-left"),
          style.getPropertyValue("transition-duration"),
        ];
      };
      // When: the child is read, then the parent and the root ancestor change their tokens
      const initial = read();
      inlineStyle(window, ".parent").setProperty("--gap", "9px");
      const afterParent = read();
      inlineStyle(window, "main").setProperty("--edge", "5px");
      const afterAncestor = read();
      // Then: every read reflects the current custom-property environment
      expect(initial).toEqual(["6px", "2px", "2px", "rgb(1, 2, 3)", "20px", "6px", "1s"]);
      expect(afterParent).toEqual(["9px", "2px", "2px", "rgb(1, 2, 3)", "20px", "9px", "1s"]);
      expect(afterAncestor).toEqual(["9px", "5px", "5px", "rgb(1, 2, 3)", "20px", "9px", "1s"]);
    } finally {
      window.close();
    }
  });

  it("should roll back a substituted layer declaration with revert-layer", () => {
    // Given: a theme layer that substitutes padding and reverts one side to the base layer
    const { window } = new JSDOM(
      `<style>@layer base, theme; @layer base { .x { padding: 1px } } @layer theme { .x { padding: var(--p); --p: 8px; padding-top: revert-layer } } .x{transition: color 1s}</style><p class=x></p>`,
    );
    try {
      // When: the element is read
      const style = window.getComputedStyle(element(window, "p"));
      // Then: the reverted side comes from the base layer and the other side substitutes
      expect([
        style.getPropertyValue("padding-top"),
        style.getPropertyValue("padding-left"),
      ]).toEqual(["1px", "8px"]);
    } finally {
      window.close();
    }
  });

  it("should apply a script-registered non-inherited property to substituted shorthands", () => {
    // Given: a host token that a later registration makes non-inherited
    const { window } = new JSDOM(
      `<style>.host{--size:10px} .leaf{padding:var(--size) 0; border: var(--size) solid}</style><div class=host><p class=leaf></p></div>`,
    );
    try {
      // When: the property is registered before the leaf is read
      window.CSS.registerProperty({
        name: "--size",
        syntax: "<length>",
        inherits: false,
        initialValue: "1px",
      });
      const style = window.getComputedStyle(element(window, "p"));
      // Then: the leaf substitutes the registered initial value
      expect([
        style.getPropertyValue("padding-top"),
        style.getPropertyValue("border-top-width"),
      ]).toEqual(["1px", "1px"]);
    } finally {
      window.close();
    }
  });

  it("should keep substitution environments independent across Windows sharing stylesheet text", () => {
    // Given: two Windows with identical rules and different inline tokens
    const css = `.t{--c:var(--v)} .k{padding:var(--c) 1px}`;
    const first = new JSDOM(
      `<style>${css}</style><div class=t style="--v:3px"><p class=k></p></div>`,
    );
    const second = new JSDOM(
      `<style>${css}</style><div class=t style="--v:11px"><p class=k></p></div>`,
    );
    try {
      // When: both leaves are read
      const values = [first.window, second.window].map((window) =>
        window.getComputedStyle(element(window, "p")).getPropertyValue("padding-top"),
      );
      // Then: each Window resolves its own token
      expect(values).toEqual(["3px", "11px"]);
    } finally {
      first.window.close();
      second.window.close();
    }
  });
});
