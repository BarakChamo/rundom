// Pins tag-only selector matching for HTML, SVG-in-HTML, XML and prefixed element names.
import { describe, expect, it } from "vitest";
import { JSDOM } from "../src/jsdom.js";

function fixture() {
  const { window } = new JSDOM(
    "<!doctype html><body><form id=f><div id=d><svg><foreignObject id=fo></foreignObject><g id=g></g></svg><foo:bar id=fb></foo:bar><DIV id=up></DIV></div></form>",
  );
  const document = window.document;
  const body = document.body;
  if (!body) throw new Error("The fixture must have a body");
  const prefixed = body.appendChild(document.createElementNS("urn:x", "x:item"));
  const htmlPrefixed = body.appendChild(
    document.createElementNS("http://www.w3.org/1999/xhtml", "h:div"),
  );
  const upper = body.appendChild(document.createElementNS("urn:x", "Item"));
  const xml = new window.DOMParser().parseFromString(
    '<root xmlns:p="urn:p"><Item/><item/><p:item/><p:Item/><div xmlns="http://www.w3.org/1999/xhtml"/><DIV xmlns="http://www.w3.org/1999/xhtml"/></root>',
    "application/xml",
  );
  return { document, xml, prefixed, htmlPrefixed, upper };
}

const names = (nodes: Iterable<{ id: string; tagName: string }>) =>
  [...nodes].map((node) => node.id || node.tagName);

describe("Element type selectors", () => {
  it("should fold case only for HTML elements in HTML documents", () => {
    // Given: HTML, SVG and namespaced elements in an HTML document
    const { document, htmlPrefixed, upper } = fixture();
    // When/Then: HTML names fold case, foreign names compare exactly
    expect(names(document.querySelectorAll("DIV"))).toEqual(["d", "up", "H:DIV"]);
    expect(htmlPrefixed.matches("div")).toBe(true);
    expect(names(document.querySelectorAll("foreignObject"))).toEqual(["fo"]);
    expect(document.querySelectorAll("foreignobject")).toHaveLength(0);
    expect(document.querySelectorAll("G")).toHaveLength(0);
    expect([upper.matches("Item"), upper.matches("item")]).toEqual([true, false]);
  });

  it("should match prefixed elements by local name only", () => {
    // Given: prefixed elements and an HTML-parsed name containing a colon
    const { document, prefixed } = fixture();
    // When/Then: the local name matches, the prefix and colon halves do not
    expect([prefixed.matches("item"), prefixed.matches("x")]).toEqual([true, false]);
    expect(document.querySelectorAll("bar")).toHaveLength(0);
    expect(document.querySelectorAll("foo")).toHaveLength(0);
  });

  it("should compare case exactly in XML documents", () => {
    // Given: an XML document with mixed-case and prefixed names
    const { xml } = fixture();
    // When/Then: case is significant even for XHTML elements
    expect(names(xml.querySelectorAll("item"))).toEqual(["item", "p:item"]);
    expect(names(xml.querySelectorAll("Item"))).toEqual(["Item", "p:Item"]);
    expect(names(xml.querySelectorAll("div"))).toEqual(["div"]);
  });

  it("should find ancestors with closest by type", () => {
    // Given: an SVG child inside an HTML form
    const { document } = fixture();
    const g = document.getElementById("g");
    // When/Then: closest folds case for the HTML ancestor only
    expect(g?.closest("FORM")?.id).toBe("f");
    expect(g?.closest("SVG")).toBeNull();
    expect(g?.closest("svg")?.tagName).toBe("svg");
  });
});
