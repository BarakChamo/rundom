// Keeps conservative feature activation correct at foreign-handle and mixed-origin subtree boundaries.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name capability realms", ({ Constructor, name }) => {
  it("preserves custom reactions through third-realm borrowed adoption and mutation", () => {
    // Given: only the source registry knows this custom element.
    const a = new Constructor("").window,
      b = new Constructor("").window,
      c = new Constructor("").window;
    try {
      const sourceBody = a.document.body,
        destinationBody = b.document.body;
      if (!sourceBody || !destinationBody) throw new Error("Expected HTML fixture bodies");
      const log: string[] = [];
      class Item extends a.HTMLElement {
        connectedCallback() {
          log.push(this.ownerDocument === a.document ? "connected:a" : "connected:b");
        }
        disconnectedCallback() {
          log.push("disconnected");
        }
        adoptedCallback(previous: object, next: object) {
          log.push(previous === a.document && next === b.document ? "adopted:a:b" : "wrong owner");
        }
      }
      a.customElements.define("x-capability-item", Item);
      const node = a.document.createElement("x-capability-item");
      sourceBody.append(node);
      // When: a third Window supplies each public method.
      Reflect.apply(c.Document.prototype.adoptNode, b.document, [node]);
      Reflect.apply(c.Node.prototype.appendChild, destinationBody, [node]);
      Reflect.apply(c.Node.prototype.removeChild, destinationBody, [node]);
      // Then: ownership changes without changing the original custom prototype or reactions.
      expect(node).toBeInstanceOf(Item);
      expect(node.ownerDocument).toBe(b.document);
      expect(log).toEqual([
        "connected:a",
        "disconnected",
        "adopted:a:b",
        "connected:b",
        "disconnected",
      ]);
    } finally {
      a.close();
      b.close();
      c.close();
    }
  });

  it("preserves shadow adoption and clone/import ownership after source close", () => {
    // Given: a source subtree contains light, template and clonable shadow descendants.
    const a = new Constructor("").window,
      b = new Constructor("").window,
      c = new Constructor("").window;
    try {
      const sourceBody = a.document.body,
        destinationBody = b.document.body;
      if (!sourceBody || !destinationBody) throw new Error("Expected HTML fixture bodies");
      const host = a.document.createElement("main");
      host.innerHTML = "<span>light</span><template><b>inert</b></template>";
      host.attachShadow({ mode: "open", clonable: true }).innerHTML = "<slot></slot><i>inside</i>";
      sourceBody.append(host);
      // When: adoption precedes first descendant exposure and the source Window closes.
      destinationBody.append(b.document.adoptNode(host));
      a.close();
      const child = host.firstElementChild;
      expect(child).toBeInstanceOf(a.HTMLSpanElement);
      expect(child?.ownerDocument).toBe(b.document);
      const clone: unknown = Reflect.apply(c.Node.prototype.cloneNode, host, [true]);
      if (
        !(
          clone instanceof a.HTMLElement ||
          clone instanceof b.HTMLElement ||
          clone instanceof c.HTMLElement
        )
      )
        throw new Error("Expected a cloned HTML host");
      // Then: borrowed cloning still sees the source shadow capability and current owner.
      expect(clone.ownerDocument).toBe(b.document);
      // Pinned jsdom lacks clonable-shadow copying; RunDOM retains its existing additional support.
      if (name === "RunDOM") expect(clone.shadowRoot?.innerHTML).toBe("<slot></slot><i>inside</i>");
      else expect(clone.shadowRoot).toBeNull();
      expect(clone.firstElementChild?.textContent).toBe("light");
      const imported = c.document.importNode(host, true);
      expect(imported.ownerDocument).toBe(c.document);
      if (name === "RunDOM")
        expect(imported.shadowRoot?.innerHTML).toBe("<slot></slot><i>inside</i>");
      else expect(imported.shadowRoot).toBeNull();
    } finally {
      a.close();
      b.close();
      c.close();
    }
  });

  it("preserves unexposed creators when the source method adopts into a foreign receiver", () => {
    // Given: only the root has been exposed from the source's initial parsed tree.
    const a = new Constructor("<main><section><i>child</i></section></main>").window,
      b = new Constructor("").window;
    try {
      const root = a.document.querySelector("main"),
        body = b.document.body;
      if (!root || !body) throw new Error("Expected adoption fixture");
      const first = Object.getOwnPropertyDescriptor(b.Element.prototype, "firstElementChild")?.get;
      if (!first) throw new Error("Expected foreign child accessor");
      // When: the source realm's method adopts into the other realm, then its accessor exposes a child.
      a.Document.prototype.adoptNode.call(b.document, root);
      body.append(root);
      a.close();
      const child: unknown = Reflect.apply(first, root, []);
      // Then: a borrowed accessor cannot substitute the destination's prototype for the original creator.
      expect(child instanceof a.HTMLElement).toBe(true);
      if (!(child instanceof a.HTMLElement)) throw new Error("Expected original child realm");
      expect(child.ownerDocument).toBe(b.document);
      expect(child.textContent).toBe("child");
    } finally {
      a.close();
      b.close();
    }
  });

  it("keeps detached HTML/XML factories and ranges owned by the receiver document", () => {
    // Given: documents without a browsing context remain associated with their creating realm.
    const a = new Constructor("").window,
      b = new Constructor("").window,
      c = new Constructor("").window;
    try {
      const detached = a.document.implementation.createHTMLDocument("detached");
      const xml = new a.DOMParser().parseFromString("<root/>", "application/xml");
      // When: unrelated Windows supply factories, mutation and range methods.
      const node = c.Document.prototype.createElement.call(detached, "div");
      Reflect.apply(b.Node.prototype.appendChild, detached.body, [node]);
      node.textContent = "kept";
      const namespaced = b.Document.prototype.createElementNS.call(xml, "urn:test", "t:item");
      const root = xml.documentElement;
      if (!root) throw new Error("Expected an XML fixture root");
      root.append(namespaced);
      const range = c.Document.prototype.createRange.call(detached);
      range.selectNodeContents(node);
      a.close();
      // Then: closure ownership cannot substitute the method's Window for either receiver document.
      expect(node.ownerDocument).toBe(detached);
      expect(namespaced.ownerDocument).toBe(xml);
      expect(namespaced.namespaceURI).toBe("urn:test");
      expect(range.startContainer).toBe(node);
      expect(range.toString()).toBe("kept");
      expect(b.document.importNode(node, true).ownerDocument).toBe(b.document);
    } finally {
      a.close();
      b.close();
      c.close();
    }
  });
});
