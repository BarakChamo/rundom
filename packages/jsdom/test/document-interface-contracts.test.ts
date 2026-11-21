// Checks document/fragment interface identity and HTML document tree accessors through public APIs.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM } = require("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: reference.JSDOM },
])("$name document interfaces", ({ Constructor }) => {
  it("exposes interface class strings on inert template documents and fragments", () => {
    // Given: template contents live in an inert document of the creating Window.
    const { window: w } = new Constructor("<template>text<span></span></template>");
    try {
      const template = w.document.querySelector("template");
      if (!(template instanceof w.HTMLTemplateElement)) throw new Error("Expected template");
      const content = template.content;
      const owner = content.ownerDocument;
      // When/Then: interface tags survive the absence of a browsing context.
      expect(Object.prototype.toString.call(content)).toBe("[object DocumentFragment]");
      expect(Object.prototype.toString.call(owner)).toBe("[object Document]");
      expect(owner).not.toBe(w.document);
      expect(owner?.defaultView).toBe(null);
      expect(Object.prototype.toString.call(content.firstChild)).toBe("[object Text]");
      expect(Object.prototype.toString.call(content.querySelector("span"))).toBe(
        "[object HTMLSpanElement]",
      );
    } finally {
      w.close();
    }
  });

  it("keeps DOM methods out of with-scope through the platform mixin tables", () => {
    // Given: parent and child node mixins have distinct unscopable methods.
    const { window: w } = new Constructor();
    try {
      const element = Reflect.get(w.Element.prototype, Symbol.unscopables);
      const document = Reflect.get(w.Document.prototype, Symbol.unscopables);
      const data = Reflect.get(w.CharacterData.prototype, Symbol.unscopables);
      // When/Then: the finite platform tables do not inherit Object members.
      expect(Object.getPrototypeOf(element)).toBe(null);
      for (const name of [
        "before",
        "after",
        "replaceWith",
        "remove",
        "append",
        "prepend",
        "replaceChildren",
        "slot",
      ])
        expect(element[name]).toBe(true);
      expect(document.append).toBe(true);
      expect(document.remove).toBe(undefined);
      expect(data.remove).toBe(true);
      expect(data.append).toBe(undefined);
    } finally {
      w.close();
    }
  });

  it("preserves public constructor names through bundled lazy factories", () => {
    // Given: native function names are part of the exposed interface contract.
    const { window: w } = new Constructor();
    try {
      // When/Then: bundler collision suffixes and inferred cache-variable names do not escape.
      for (const name of ["AbortController", "AbortSignal", "URL", "FormData", "FileReader"]) {
        expect(Reflect.get(w, name).name).toBe(name);
      }
    } finally {
      w.close();
    }
  });

  it("reads a body only below an HTML-namespace html root", () => {
    // Given: an HTML body node below another root is not the document body.
    const { window: w } = new Constructor();
    try {
      const document = w.document.implementation.createDocument(null, "root", null);
      const body = document.createElementNS("http://www.w3.org/1999/xhtml", "body");
      const root = document.documentElement;
      if (!root) throw new Error("Expected root");
      root.appendChild(body);
      // When/Then: body lookup validates both the root name and namespace.
      expect(document.body).toBe(null);
      Reflect.set(document, "body", body);
      expect(document.body).toBe(null);
    } finally {
      w.close();
    }
  });

  it("distinguishes body interface conversion from hierarchy validation", () => {
    // Given: a string is not an HTMLElement, while an HTML paragraph is one.
    const { window: w } = new Constructor();
    try {
      // When/Then: the conversion boundary throws TypeError before tree rules apply.
      expect(() => Reflect.set(w.document, "body", "text")).toThrow(
        /HTMLElement|HTML|body|Element/,
      );
      let failure: unknown;
      try {
        Reflect.set(w.document, "body", "text");
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Reflect.get(w, "TypeError"));
      expect(() => Reflect.set(w.document, "body", w.document.createElement("p"))).toThrow(
        /body|BODY|frameset|FRAMESET/,
      );
    } finally {
      w.close();
    }
  });
});

it("reads intrinsic qualified names from the receiver across public property overrides and adoption", () => {
  const { window } = new JSDOM();
  try {
    // Given an HTML element and namespaced attribute whose public names are shadowed.
    const element = window.document.createElementNS("http://www.w3.org/1999/xhtml", "x:Mixed");
    const attribute = window.document.createAttributeNS("urn:names", "a:Mixed");
    Object.defineProperty(element, "nodeName", { value: "overridden" });
    Object.defineProperty(attribute, "name", { value: "overridden" });
    const name = Object.getOwnPropertyDescriptor(window.Node.prototype, "nodeName")?.get;
    const type = Object.getOwnPropertyDescriptor(window.Node.prototype, "nodeType")?.get;
    const tag = Object.getOwnPropertyDescriptor(window.Element.prototype, "tagName")?.get;
    if (!name || !type || !tag) throw new Error("Expected DOM name and type accessors");

    // When the getters are borrowed, the canonical node determines the name and brand.
    expect(element.tagName).toBe("X:MIXED");
    expect(name.call(element)).toBe("X:MIXED");
    expect(name.call(attribute)).toBe("a:Mixed");
    expect(type.call(attribute)).toBe(2);
    expect(attribute.nodeName).toBe("a:Mixed");
    expect(() => tag.call({ nodeName: "pretend" })).toThrow(TypeError);

    // Then adopting into XML changes case handling even on the retained wrapper.
    const xml = window.document.implementation.createDocument("urn:names", "root", null);
    xml.adoptNode(element);
    expect(element.tagName).toBe("x:Mixed");
    expect(name.call(element)).toBe("x:Mixed");
  } finally {
    window.close();
  }
});
