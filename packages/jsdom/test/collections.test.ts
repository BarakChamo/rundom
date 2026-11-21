// Exercises the live descendant collections exposed by Document and Element.
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

describe("DOM descendant collections", () => {
  it("updates retained HTML collections after class changes and removal", () => {
    // Given: overlapping class names and an HTML document in standards mode.
    const { window } = new JSDOM(
      '<!doctype html><main><p id="target" class="a b"></p><p class="A b"></p></main>',
    );
    try {
      const { document } = window;
      const main = document.querySelector("main");
      const target = document.getElementById("target");
      if (!main || !target) throw new Error("Expected fixture elements");
      const tags = main.getElementsByTagName("P");
      const classes = document.getElementsByClassName("b  a a");

      // When: class membership changes and an element leaves the tree.
      expect(tags.namedItem("target")).toBe(target);
      expect(tags[0]).toBe(target);
      expect(Reflect.get(tags, "target")).toBe(target);
      expect(Reflect.ownKeys(tags)).toContain("target");
      expect(Object.keys(tags)).not.toContain("target");
      expect(classes.length).toBe(1);
      target.setAttribute("class", "b");
      target.remove();

      // Then: the existing views expose current membership.
      expect(classes.length).toBe(0);
      expect(tags.namedItem("target")).toBeNull();
      expect(Reflect.has(tags, "target")).toBe(false);
      expect(tags.length).toBe(1);
    } finally {
      window.close();
    }
  });

  it("updates an existing collection as parser-inserted scripts run", () => {
    // Given: a collection queried before the HTML parser starts.
    const seen: number[] = [];
    const { window } = new JSDOM(
      "<p></p><script>measure()</script><p></p><script>measure()</script><p></p>",
      {
        runScripts: "dangerously",
        beforeParse(window) {
          const paragraphs = window.document.getElementsByTagName("p");
          const measure = () => seen.push(paragraphs.length);
          Reflect.set(window, "measure", measure);
          measure();
        },
      },
    );
    try {
      // When: the scripts access the same collection at two points during parsing.
      // Then: each read reflects the parser's progress.
      expect(seen).toEqual([0, 1, 2]);
      expect(window.document.getElementsByTagName("p").length).toBe(3);
    } finally {
      window.close();
    }
  });

  it("matches qualified names and namespace wildcards independently", () => {
    // Given: prefixed, default-namespaced, and unnamespaced elements.
    const { window } = new JSDOM(
      '<root xmlns:a="urn:x"><a:item/><item xmlns="urn:x"/><item/></root>',
      { contentType: "application/xml" },
    );
    try {
      const { document } = window;
      // When: callers filter by qualified name or by namespace and local name.
      // Then: the qualified name retains its prefix and namespace matching ignores it.
      expect(document.getElementsByTagName("a:item").length).toBe(1);
      expect(document.getElementsByTagName("item").length).toBe(2);
      expect(document.getElementsByTagNameNS("urn:x", "item").length).toBe(2);
      expect(document.getElementsByTagNameNS("", "*").length).toBe(2);
      expect(document.getElementsByTagNameNS("*", "item").length).toBe(3);
    } finally {
      window.close();
    }
  });
});
