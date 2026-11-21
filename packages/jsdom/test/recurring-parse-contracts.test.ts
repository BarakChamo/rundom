// Preserves independent documents when recurring source shells are admitted, evicted and parsed again.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name recurring source shells", ({ Constructor }) => {
  it("preserves source, template ownership and fresh identities across recurring and evicted shells", () => {
    // Given: twelve distinct shells alternate repeatedly, exceeding a small cache's entry capacity.
    const sources = Array.from(
      { length: 12 },
      (_, index) =>
        `<!doctype html><main data-shell="${index}"><p id="row">shell${index}</p><template><svg><title>λ${index}</title></svg></template></main>`,
    );
    const retained = new Constructor(sources[0]).window;
    try {
      const original = retained.document.getElementById("row");
      if (!original) throw new Error("Expected recurring-source row");
      original.textContent = "retained edit";
      // When: recurring inputs are mutated and closed before later uses of the same source.
      const recurring = sources.slice(0, 4);
      for (const sequence of [recurring, recurring, recurring, sources, sources, recurring]) {
        for (const [index, html] of sequence.entries()) {
          const window = new Constructor(html).window;
          try {
            const row = window.document.getElementById("row");
            const template = window.document.querySelector("template");
            if (!row || !(template instanceof window.HTMLTemplateElement))
              throw new Error("Expected independent recurring-source nodes");
            // Then: another instance's writes cannot contaminate source data or node ownership.
            expect(row.textContent).toBe(`shell${index}`);
            expect(window.document.querySelector("main")?.getAttribute("data-shell")).toBe(
              String(index),
            );
            expect(row.ownerDocument).toBe(window.document);
            expect(row === original).toBe(false);
            expect(template.content.firstElementChild?.textContent).toBe(`λ${index}`);
            expect(template.content.ownerDocument === window.document).toBe(false);
            expect(template.content.firstElementChild?.hasAttribute("data-edited")).toBe(false);
            row.textContent = "changed";
            template.content.firstElementChild?.setAttribute("data-edited", "yes");
          } finally {
            window.close();
          }
        }
      }
      expect(original.textContent).toBe("retained edit");
      expect(original.ownerDocument).toBe(retained.document);
    } finally {
      retained.close();
    }
  });
});
