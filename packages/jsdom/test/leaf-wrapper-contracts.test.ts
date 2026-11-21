// Preserves Window ownership and event initialization when state-free HTML wrappers are allocated directly.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name leaf wrapper contracts", ({ Constructor }) => {
  it("retains exact local prototypes, canonical identity, handlers, cloning and adoption", () => {
    // Given: every directly allocated interface has separate constructors in two Windows.
    const a = new Constructor().window,
      b = new Constructor().window;
    const examples = [
      ["div", "HTMLDivElement"],
      ["p", "HTMLParagraphElement"],
      ["dir", "HTMLDirectoryElement"],
      ["font", "HTMLFontElement"],
      ["marquee", "HTMLMarqueeElement"],
      ["span", "HTMLSpanElement"],
      ["h3", "HTMLHeadingElement"],
      ["ul", "HTMLUListElement"],
      ["ol", "HTMLOListElement"],
      ["li", "HTMLLIElement"],
      ["dl", "HTMLDListElement"],
      ["menu", "HTMLMenuElement"],
      ["pre", "HTMLPreElement"],
      ["q", "HTMLQuoteElement"],
      ["br", "HTMLBRElement"],
      ["hr", "HTMLHRElement"],
      ["caption", "HTMLTableCaptionElement"],
      ["col", "HTMLTableColElement"],
      ["td", "HTMLTableCellElement"],
    ];
    try {
      for (const [tag, name] of examples) {
        if (tag === undefined || name === undefined) throw new Error("Expected interface example");
        const local: unknown = Reflect.get(a, name),
          peer: unknown = Reflect.get(b, name);
        if (typeof local !== "function" || typeof peer !== "function")
          throw new Error("Expected HTML constructors");
        const node = a.document.createElement(tag);
        const body = a.document.body;
        if (!body) throw new Error("Expected fixture body");
        body.append(node);
        expect(local).not.toBe(peer);
        expect(Object.getPrototypeOf(node)).toBe(Reflect.get(local, "prototype"));
        expect(node).toBeInstanceOf(local);
        expect(node).not.toBeInstanceOf(peer);
        expect(node.parentNode?.lastChild).toBe(node);
        expect(node.ownerDocument).toBe(a.document);
        // When: handlers, clone/import and adoption use the existing public operations.
        let calls = 0;
        // Event-handler properties are installed dynamically by the Window implementation.
        expect(
          Reflect.set(node, "onclick", function (this: unknown) {
            expect(this).toBe(node);
            calls++;
          }),
        ).toBe(true);
        node.dispatchEvent(new a.Event("click"));
        const cloned = node.cloneNode();
        const imported = b.document.importNode(node);
        b.document.adoptNode(node);
        // Then: creation realm stays stable while document ownership and imported realm change.
        expect(calls).toBe(1);
        expect(cloned).toBeInstanceOf(local);
        expect(imported).toBeInstanceOf(peer);
        expect(imported.ownerDocument).toBe(b.document);
        expect(node.ownerDocument).toBe(b.document);
        expect(node).toBeInstanceOf(local);
        node.dispatchEvent(new b.Event("click"));
        expect(calls).toBe(2);
      }
    } finally {
      a.close();
      b.close();
    }
  });
});
