// Preserves EventTarget allocation, public prototype identity and Node branding across realm-local subclasses.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");
describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name EventTarget allocation", ({ Constructor }) => {
  it("keeps frozen subclass instances branded as events without treating them as nodes", () => {
    // Given: an isolated realm owns the constructor and a user subclass owns its public field.
    const window = new Constructor("", { runScripts: "outside-only" }).window;
    try {
      class Subject extends window.EventTarget {
        marker = "ready";
      }
      const target = new Subject();
      const nodeType = Object.getOwnPropertyDescriptor(window.Node.prototype, "nodeType")?.get;
      if (!nodeType) throw new Error("Expected Node type getter");
      const keys = Reflect.ownKeys(target);
      Object.freeze(target);
      let calls = 0;
      // When: listener state changes independently of the frozen public object.
      target.addEventListener("tick", () => calls++);
      target.dispatchEvent(new window.Event("tick"));
      // Then: the exact subclass prototype and reflection survive without acquiring a Node brand.
      expect(calls).toBe(1);
      expect(Object.getPrototypeOf(target)).toBe(Subject.prototype);
      expect(target instanceof window.EventTarget).toBe(true);
      expect(target.marker).toBe("ready");
      expect(Reflect.ownKeys(target)).toEqual(keys);
      expect(() => nodeType.call(target)).toThrow(/Node|invocation/);
    } finally {
      window.close();
    }
  });
  it("allocates borrowed EventTarget methods and proxy document operations in their owning realm", () => {
    // Given: distinct Windows expose independent interfaces and proxy-backed documents.
    const a = new Constructor("", { runScripts: "outside-only" }).window;
    const b = new Constructor("").window;
    try {
      const target = Reflect.construct(a.EventTarget, [], b.EventTarget);
      let calls = 0;
      // When: foreign operations use the actual receiver, including a Document's canonical proxy.
      a.EventTarget.prototype.addEventListener.call(target, "tick", () => calls++);
      b.EventTarget.prototype.dispatchEvent.call(target, new b.Event("tick"));
      const text = b.Document.prototype.createTextNode.call(a.document, "owned");
      // Then: allocation and document ownership retain public prototype/identity contracts.
      expect(Object.getPrototypeOf(target)).toBe(b.EventTarget.prototype);
      expect(calls).toBe(1);
      expect(text.ownerDocument).toBe(a.document);
      expect(text instanceof a.Text).toBe(true);
      expect(a.document.defaultView).toBe(a);
    } finally {
      a.close();
      b.close();
    }
  });
});
