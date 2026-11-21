// Exercises independent node copies and cross-document imports.
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

describe("DOM node cloning", () => {
  it("shares inert template documents and updates retained content after adoption", () => {
    // Given: two documents and nested template fragments retained by the caller.
    const { window } = new JSDOM("<template><template><p>nested</p></template></template>");
    const other = new JSDOM("");
    try {
      const outer = window.document.querySelector("template");
      if (!(outer instanceof window.HTMLTemplateElement)) throw new Error("Expected a template");
      const content = outer.content;
      const nested = content.querySelector("template");
      if (!(nested instanceof window.HTMLTemplateElement))
        throw new Error("Expected a nested template");
      const nestedContent = nested.content;
      const inert = content.ownerDocument;
      expect(inert).not.toBe(window.document);
      expect(inert?.defaultView).toBeNull();
      expect(nestedContent.ownerDocument).toBe(inert);

      // When: the outer template is moved to another document.
      other.window.document.body?.append(outer);
      const targetTemplate = other.window.document.createElement("template");
      if (!(targetTemplate instanceof other.window.HTMLTemplateElement))
        throw new Error("Expected a target template");

      // Then: retained fragments and their children share the destination inert document.
      expect(outer.content).toBe(content);
      expect(content.ownerDocument).toBe(targetTemplate.content.ownerDocument);
      expect(nestedContent.firstChild?.ownerDocument).toBe(content.ownerDocument);
      expect(content.ownerDocument).not.toBe(inert);
    } finally {
      other.window.close();
      window.close();
    }
  });

  it("imports XML descendants and attributes into the destination document", () => {
    // Given: an XML subtree with namespaced elements, CDATA, and a detached destination.
    const source = new JSDOM(
      '<s:root xmlns:s="urn:s" s:flag="one"><s:child><![CDATA[value]]></s:child></s:root>',
      { contentType: "application/xml" },
    );
    const target = new JSDOM("<main></main>");
    try {
      const root = source.window.document.documentElement;
      if (!root) throw new Error("Expected a document element");

      // When: callers copy the root across documents and edit the copy.
      const copy = target.window.document.importNode(root, true);
      expect(root.isEqualNode(copy)).toBe(true);
      expect(root.isSameNode(copy)).toBe(false);
      expect(copy.contains(copy.firstChild)).toBe(true);
      expect(root.contains(copy.firstChild)).toBe(false);
      copy.setAttributeNS("urn:s", "s:flag", "two");
      expect(root.isEqualNode(copy)).toBe(false);

      // Then: the new wrappers belong to the destination and the source stays intact.
      expect(copy.ownerDocument === target.window.document).toBe(true);
      expect(copy instanceof target.window.Element).toBe(true);
      expect([copy.prefix, copy.localName, copy.namespaceURI]).toEqual(["s", "root", "urn:s"]);
      expect(copy.firstChild?.firstChild instanceof target.window.CDATASection).toBe(true);
      expect(copy.firstChild?.firstChild?.ownerDocument === target.window.document).toBe(true);
      expect(root.getAttributeNS("urn:s", "flag")).toBe("one");
      expect(copy.getAttributeNS("urn:s", "flag")).toBe("two");
      expect(() => target.window.document.importNode(source.window.document)).toThrow(
        "Cannot import a document or shadow root",
      );
    } finally {
      source.window.close();
      target.window.close();
    }
  });

  it("clones an XHTML document with template content and its own owner document", () => {
    // Given: a document with a template parsed in XML mode.
    const dom = new JSDOM('<template xmlns="http://www.w3.org/1999/xhtml"><p>xml</p></template>', {
      contentType: "application/xml",
      url: "https://example.test/",
    });
    try {
      const template = dom.window.document.documentElement;
      if (!(template instanceof dom.window.HTMLTemplateElement))
        throw new Error("Expected an XHTML template");

      // When: the caller clones the document.
      const copy = dom.window.document.cloneNode(true);

      // Then: the detached document retains metadata and owns the copied root.
      expect(template.childNodes.length).toBe(0);
      expect(template.content.firstChild?.textContent).toBe("xml");
      expect(dom.serialize()).toContain("<p>xml</p>");
      expect(copy.defaultView).toBeNull();
      expect(copy instanceof dom.window.XMLDocument).toBe(true);
      expect(copy.URL).toBe("https://example.test/");
      expect(copy.documentElement?.ownerDocument === copy).toBe(true);
      expect(copy.documentElement?.outerHTML).toContain("<p>xml</p>");
    } finally {
      dom.window.close();
    }
  });

  it("copies template contents and leaves cloned attribute nodes detached", () => {
    // Given: a template with content and an attached attribute.
    const { window } = new JSDOM('<template id="fixture"><p>hello</p></template>');
    try {
      const template = window.document.querySelector("template");
      if (!(template instanceof window.HTMLTemplateElement)) throw new Error("Expected a template");
      const attr = template.getAttributeNode("id");
      if (!attr) throw new Error("Expected an attribute");

      // When: the caller takes shallow, deep, and attribute copies.
      const shallow = template.cloneNode();
      const deep = template.cloneNode(true);
      const attrCopy = attr.cloneNode();

      // Then: only the deep copy includes a new content subtree.
      expect(shallow.content.childNodes.length).toBe(0);
      expect(deep.content.querySelector("p")?.textContent).toBe("hello");
      expect(deep.content.firstChild === template.content.firstChild).toBe(false);
      expect(attrCopy.ownerElement).toBeNull();
      expect(attrCopy.value).toBe("fixture");
      expect(attrCopy === attr).toBe(false);
    } finally {
      window.close();
    }
  });
});
