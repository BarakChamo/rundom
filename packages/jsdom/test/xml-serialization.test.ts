// Pins namespace repair, well-formedness policy, and private-tree XML serialization across public APIs.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

const html = "http://www.w3.org/1999/xhtml";
describe("XML serialization", () => {
  it("uses the XHTML local name to attach a shadow root and the host context to parse its contents", () => {
    const { window } = new JSDOM(
      '<root xmlns="urn:outer" xmlns:h="http://www.w3.org/1999/xhtml"><h:custom-el/><h:div/><h:annotation-xml/><h:x-λ/></root>',
      { contentType: "application/xml" },
    );
    try {
      const root = window.document.documentElement;
      if (!root) throw new Error("Expected an XML root");
      expect(root.children.length).toBe(4);
      for (const host of Array.from(root.children)) {
        if (!host) throw new Error("Expected an XHTML host");
        if (host.localName === "annotation-xml") {
          expect(() => host.attachShadow({ mode: "open" })).toThrow(
            expect.objectContaining({ name: "NotSupportedError" }),
          );
          continue;
        }
        const shadow = host.attachShadow({ mode: "open" });
        shadow.innerHTML = "<span/><h:span/>";
        expect(Array.from(shadow.children, (child) => child?.namespaceURI)).toEqual([
          "urn:outer",
          html,
        ]);
      }
    } finally {
      window.close();
    }
  });

  it("repairs namespaces for standalone XHTML elements and distinguishes void elements", () => {
    // Given: elements can belong to XHTML even when their owner is an XML document.
    const { window } = new JSDOM("<root/>", { contentType: "application/xml" });
    try {
      const div = window.document.createElementNS(html, "div"),
        br = window.document.createElementNS(html, "br");
      // When/Then: XML serialization supplies bindings and the XHTML void-element syntax.
      expect(div.outerHTML).toBe(`<div xmlns="${html}"></div>`);
      expect(br.outerHTML).toBe(`<br xmlns="${html}" />`);
    } finally {
      window.close();
    }
  });
  it("repairs attribute prefixes and escapes attribute control characters", () => {
    // Given: a namespaced attribute has no explicit prefix or declaration.
    const { window } = new JSDOM("<root/>", { contentType: "application/xml" });
    try {
      const element = window.document.createElementNS("urn:element", "p:root");
      element.setAttributeNS("urn:attr", "value", 'a\t\n\r&<"');
      // When/Then: a generated prefix makes the serialized attribute namespace unambiguous.
      expect(element.outerHTML).toBe(
        '<p:root xmlns:p="urn:element" xmlns:ns1="urn:attr" ns1:value="a&#x9;&#xA;&#xD;&amp;&lt;&quot;"/>',
      );
    } finally {
      window.close();
    }
  });
  it("serializes each fragment child with independent namespace bindings", () => {
    // Given: the parent namespace must not silently disappear from standalone children.
    const { window } = new JSDOM('<r xmlns="urn:r"><a/><b/></r>', {
      contentType: "application/xml",
    });
    try {
      const root = window.document.documentElement;
      if (!root) throw new Error("Expected XML root");
      // When/Then: innerHTML is a concatenation of independently serialized children.
      expect(root.innerHTML).toBe('<a xmlns="urn:r"/><b xmlns="urn:r"/>');
    } finally {
      window.close();
    }
  });
  for (const data of ["bad--comment", "bad\0comment"])
    it(`rejects non-well-formed fragment comments ${JSON.stringify(data)}`, () => {
      // Given: DOM mutations can create data that cannot appear in well-formed XML.
      const dom = new JSDOM("<root/>", { contentType: "application/xml" }),
        { window } = dom;
      try {
        const root = window.document.documentElement;
        if (!root) throw new Error("Expected XML root");
        root.append(window.document.createComment(data));
        // When/Then: fragment getters reject it in their Window, while permissive serializers retain it.
        for (const read of [() => root.innerHTML, () => root.outerHTML]) {
          expect(read).toThrow(window.DOMException);
          try {
            read();
          } catch (error) {
            expect(error).toMatchObject({
              name: "InvalidStateError",
              message: expect.stringContaining("Failed to serialize XML"),
            });
          }
        }
        expect(new window.XMLSerializer().serializeToString(root)).toBe(
          `<root><!--${data}--></root>`,
        );
        expect(dom.serialize()).toBe(`<root><!--${data}--></root>`);
        expect(root.childNodes.length).toBe(1);
      } finally {
        window.close();
      }
    });
  it("uses fresh private child views after mutations and serializes template contents", () => {
    // Given: a serializer must not invoke replaceable public child accessors.
    const { window } = new JSDOM("<root/>", { contentType: "application/xml" });
    try {
      const template = window.document.createElementNS(html, "template");
      template.innerHTML = '<x xmlns="urn:x"/>';
      Object.defineProperty(template, "childNodes", {
        get() {
          throw new Error("Public child accessor called");
        },
      });
      const serializer = new window.XMLSerializer();
      expect(serializer.serializeToString(template)).toBe(
        `<template xmlns="${html}"><x xmlns="urn:x"/></template>`,
      );
      // When/Then: ephemeral traversal views do not survive subsequent tree edits.
      template.innerHTML = '<y xmlns="urn:y"/>';
      expect(serializer.serializeToString(template)).toContain('<y xmlns="urn:y"/>');
    } finally {
      window.close();
    }
  });
  it("preserves ordinary HTML serialization without XML namespace repair", () => {
    // Given: HTML documents use their own fragment serialization algorithm.
    const { window } = new JSDOM("<main><br></main>");
    try {
      // When/Then: introducing the XML adapter does not alter HTML output.
      expect(window.document.querySelector("main")?.outerHTML).toBe("<main><br></main>");
    } finally {
      window.close();
    }
  });
});
