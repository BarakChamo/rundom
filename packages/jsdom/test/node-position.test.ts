// Exercises DOM ordering for nodes, attributes, and disconnected trees.
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

describe("Node.compareDocumentPosition", () => {
  it("orders attributes, ancestors, and siblings after mutations", () => {
    // Given: a parent with two attributes and two ordered children.
    const { window } = new JSDOM('<main first="1" second="2"><p></p><aside></aside></main>');
    try {
      const main = window.document.querySelector("main");
      const p = main?.firstElementChild;
      const aside = main?.lastElementChild;
      const first = main?.getAttributeNode("first");
      const second = main?.getAttributeNode("second");
      if (!main || !p || !aside || !first || !second) throw new Error("Expected fixture nodes");
      const {
        DOCUMENT_POSITION_PRECEDING: preceding,
        DOCUMENT_POSITION_FOLLOWING: following,
        DOCUMENT_POSITION_CONTAINS: contains,
        DOCUMENT_POSITION_CONTAINED_BY: contained,
        DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: specific,
      } = window.Node;

      // When: the caller compares positions and then moves a child.
      expect(first.compareDocumentPosition(second)).toBe(specific | following);
      expect(first.compareDocumentPosition(main)).toBe(contains | preceding);
      expect(first.compareDocumentPosition(p)).toBe(following);
      expect(main.compareDocumentPosition(p)).toBe(contained | following);
      expect(p.compareDocumentPosition(aside)).toBe(following);
      main.prepend(aside);

      // Then: the result reflects the current tree order.
      expect(p.compareDocumentPosition(aside)).toBe(preceding);
      expect(p.compareDocumentPosition(p)).toBe(0);
    } finally {
      window.close();
    }
  });

  it("assigns consistent opposite order to disconnected roots across Windows", () => {
    // Given: an attribute attached in one Window and a node in another.
    const left = new JSDOM('<p id="a"></p>');
    const right = new JSDOM("<div></div>");
    try {
      const attr = left.window.document.querySelector("p")?.getAttributeNode("id");
      const node = right.window.document.querySelector("div");
      if (!attr || !node) throw new Error("Expected fixture nodes");

      // When: the two positions are compared in both directions.
      const order = attr.compareDocumentPosition(node);
      const reverse = node.compareDocumentPosition(attr);

      // Then: both are disconnected and their ordering remains consistent.
      expect([35, 37]).toContain(order);
      expect(order ^ reverse).toBe(6);
      expect(attr.compareDocumentPosition(node)).toBe(order);
    } finally {
      left.window.close();
      right.window.close();
    }
  });
});
