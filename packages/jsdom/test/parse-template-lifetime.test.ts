// Checks independent documents when repeated inactive HTML can reuse private parse templates.
import { describe, it, expect } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("JSDOM repeated HTML", () => {
  it("preserves independent recurring shells through mixed input and eviction", () => {
    // Given: multiple recurring inputs are interleaved with one-off malformed HTML.
    for (let round = 0; round < 4; round++) {
      for (let shell = 0; shell < 12; shell++) {
        const dom = new JSDOM(
          `<main data-shell="${shell}"><p>shell${shell}</p><template><b>${shell}</b></template></main>`,
        );
        try {
          const main = dom.window.document.querySelector("main"),
            template = dom.window.document.querySelector("template");
          if (!main || !(template instanceof dom.window.HTMLTemplateElement))
            throw new Error("Expected shell");
          // When/Then: earlier mutation and cache eviction never change source data or ownership.
          expect(main.getAttribute("data-shell")).toBe(String(shell));
          expect(main.querySelector("p")?.textContent).toBe(`shell${shell}`);
          expect(template.content.textContent).toBe(String(shell));
          expect(main.ownerDocument).toBe(dom.window.document);
          main.replaceChildren("modified");
        } finally {
          dom.window.close();
        }
      }
      const malformed = new JSDOM(`<table><p>round${round}<tr><td>x`);
      expect(malformed.window.document.querySelector("td")?.textContent).toBe("x");
      malformed.window.close();
    }
  });
  it("keeps large repeated documents independent across mutation and close", () => {
    // Given: input larger than the former small-template limit, with template contents and namespaces.
    const rows = Array.from(
      { length: 2048 },
      (_, i) => `<p id="row${i}" data-value="${i}">text${i}</p>`,
    ).join("");
    const markup = `<!doctype html><main>${rows}</main><template><svg><circle r="3"/></svg></template>`;
    const first = new JSDOM(markup),
      second = new JSDOM(markup),
      third = new JSDOM(markup);
    try {
      const a = first.window.document.getElementById("row0"),
        b = second.window.document.getElementById("row0");
      if (!a || !b) throw new Error("Expected independent rows");
      a.textContent = "first only";
      a.setAttribute("data-value", "changed");
      b.remove();
      second.window.close();
      // When/Then: a later copy has original topology, values and ownership, including inert template contents.
      const node = third.window.document.getElementById("row0");
      expect(third.window.document.querySelectorAll("p").length).toBe(2048);
      expect(node?.textContent).toBe("text0");
      expect(node?.getAttribute("data-value")).toBe("0");
      expect(node?.ownerDocument).toBe(third.window.document);
      const template = third.window.document.querySelector("template");
      if (!(template instanceof third.window.HTMLTemplateElement))
        throw new Error("Expected template");
      expect(template.content.querySelector("circle")?.namespaceURI).toBe(
        "http://www.w3.org/2000/svg",
      );
      expect(template.content.querySelector("circle")?.getAttribute("r")).toBe("3");
    } finally {
      first.window.close();
      second.window.close();
      third.window.close();
    }
  });
  it("preserves source locations and form ownership on repeated parse inputs", () => {
    // Given: source-location and form-owner parsing carry metadata beyond plain topology.
    const markup = '<form id="form"><input id="control"></form><p>' + "x".repeat(8192) + "</p>";
    for (let i = 0; i < 3; i++) {
      const dom = new JSDOM(markup, { includeNodeLocations: true });
      try {
        const input = dom.window.document.getElementById("control");
        if (!(input instanceof dom.window.HTMLInputElement)) throw new Error("Expected control");
        expect(input.form?.id).toBe("form");
        expect(dom.nodeLocation(input)?.startOffset).toBe(16);
      } finally {
        dom.window.close();
      }
    }
  });
});
