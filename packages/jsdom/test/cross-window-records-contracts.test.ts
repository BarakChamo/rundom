// Pins tree-walk and attribute results for receivers that cross Windows, frames, adoption and unusual node kinds.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

type Win = JSDOM["window"];
type DomNode = InstanceType<Win["Node"]>;
type DomElement = InstanceType<Win["Element"]>;

const nodeWalks = [
  "parentNode",
  "parentElement",
  "firstChild",
  "lastChild",
  "nextSibling",
  "previousSibling",
] as const;
const elementWalks = [
  "firstElementChild",
  "lastElementChild",
  "nextElementSibling",
  "previousElementSibling",
  "childElementCount",
] as const;

function getter(window: Win, owner: "Node" | "Element", name: string): (this: unknown) => unknown {
  const descriptor = Object.getOwnPropertyDescriptor(window[owner].prototype, name);
  if (!descriptor?.get) throw new Error(`Expected ${owner}.prototype.${name} getter`);
  return descriptor.get;
}

/** Reads every tree-walk getter through the given Window's prototypes. */
function walk(window: Win, node: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const name of nodeWalks) result[name] = getter(window, "Node", name).call(node);
  if (node instanceof window.Element || isElementLike(node))
    for (const name of elementWalks) result[name] = getter(window, "Element", name).call(node);
  return result;
}

function isElementLike(node: object): boolean {
  return (node as { nodeType?: number }).nodeType === 1;
}

/** Reads every attribute operation through the given Window's Element prototype. */
function attributes(window: Win, node: object, name: string): unknown[] {
  const proto = window.Element.prototype;
  return [proto.getAttribute.call(node, name), proto.hasAttribute.call(node, name)];
}

const markup = `<main id="m"><p id="a" data-k="1">one</p>text<span id="b" Data-Up="U"></span><!--c--></main>`;

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name cross-Window tree walk and attributes", ({ Constructor }) => {
  function windows(count: number): Win[] {
    return Array.from({ length: count }, () => new Constructor(markup).window);
  }

  it("returns the owner Window's handles when another Window's getters read its nodes", () => {
    // Given: a tree in Window A and the prototype getters of Window B
    const [a, b] = windows(2) as [Win, Win];
    try {
      const nodes = [
        a.document,
        a.document.documentElement,
        ...Array.from(a.document.getElementById("m")?.childNodes ?? []),
        a.document.getElementById("m"),
      ];
      for (const node of nodes) {
        if (!node) throw new Error("Expected fixture node");
        // When: each getter is called through both Windows
        const own = walk(a, node);
        const borrowed = walk(b, node);
        // Then: both return the same handles, all owned by Window A
        expect(borrowed).toEqual(own);
        for (const value of Object.values(borrowed))
          if (value && typeof value === "object") expect(value).toBeInstanceOf(a.Node);
      }
      const borrowedList = getter(b, "Node", "childNodes").call(a.document.getElementById("m"));
      expect((borrowedList as ArrayLike<unknown>)[1]).toBe(
        a.document.getElementById("a")?.nextSibling,
      );
    } finally {
      a.close();
      b.close();
    }
  });

  it("reads and writes attributes of a foreign element through another Window", () => {
    // Given: an HTML element owned by Window A observed by A's MutationObserver
    const [a, b] = windows(2) as [Win, Win];
    try {
      const span = a.document.getElementById("b");
      if (!span) throw new Error("Expected span");
      const observer = new a.MutationObserver(() => {});
      observer.observe(span, { attributes: true, attributeOldValue: true });
      // When: Window B's Element methods read and mutate it
      const before = attributes(b, span, "DATA-UP");
      b.Element.prototype.setAttribute.call(span, "Data-New", "n");
      const afterSet = attributes(b, span, "data-new");
      b.Element.prototype.removeAttribute.call(span, "DATA-UP");
      // Then: HTML case folding applies, A observes the mutations, and both sides agree
      expect(before).toEqual(["U", true]);
      expect(afterSet).toEqual(["n", true]);
      expect(attributes(a, span, "data-up")).toEqual([null, false]);
      expect(span.getAttributeNames()).toEqual(["id", "data-new"]);
      expect(
        observer.takeRecords().map((record) => [record.attributeName, record.oldValue]),
      ).toEqual([
        ["data-new", null],
        ["data-up", "U"],
      ]);
    } finally {
      a.close();
      b.close();
    }
  });

  it("keeps XML attribute names case-sensitive when another Window reads them", () => {
    // Given: an XML element parsed in Window A
    const [a, b] = windows(2) as [Win, Win];
    try {
      const xml = new a.DOMParser().parseFromString(`<r><e Key="v"/></r>`, "application/xml");
      const element = xml.documentElement?.firstChild;
      if (!element) throw new Error("Expected XML child");
      // When: Window B's methods read and write mixed-case names
      b.Element.prototype.setAttribute.call(element, "Other", "o");
      // Then: names are not ASCII-lowercased
      expect(attributes(b, element, "Key")).toEqual(["v", true]);
      expect(attributes(b, element, "key")).toEqual([null, false]);
      expect((element as DomElement).getAttributeNames()).toEqual(["Key", "Other"]);
      expect(walk(b, element)).toEqual(walk(a, element));
    } finally {
      a.close();
      b.close();
    }
  });

  it("walks adopted and imported nodes identically from both Windows", () => {
    // Given: a subtree adopted from A into B and another imported from A into B
    const [a, b] = windows(2) as [Win, Win];
    try {
      const main = a.document.getElementById("m");
      const sourceBody = a.document.body;
      const destinationBody = b.document.body;
      if (!main || !sourceBody || !destinationBody) throw new Error("Expected fixture bodies");
      const adopted = b.document.adoptNode(main);
      const imported = b.document.importNode(sourceBody, true) as DomElement;
      destinationBody.append(adopted, imported);
      for (const root of [adopted, imported]) {
        const nodes = [root, ...(Array.from(root.childNodes) as DomNode[])];
        for (const node of nodes) {
          // When: both Windows walk and read attributes
          // Then: results agree
          expect(walk(a, node)).toEqual(walk(b, node));
          if (node.nodeType === 1)
            expect(attributes(a, node, "ID")).toEqual(attributes(b, node, "ID"));
        }
      }
      expect(adopted).toBeInstanceOf(a.HTMLElement);
      expect(imported).toBeInstanceOf(b.HTMLElement);
      expect(getter(a, "Node", "parentNode").call(adopted)).toBe(b.document.body);
      expect(getter(a, "Node", "nextSibling").call(adopted)).toBe(imported);
      expect(getter(b, "Node", "previousSibling").call(imported)).toBe(adopted);
      expect(getter(a, "Element", "firstElementChild").call(imported)).toBe(
        imported.querySelector("main"),
      );
      a.Element.prototype.setAttribute.call(adopted, "data-z", "z");
      expect(b.Element.prototype.getAttribute.call(adopted, "DATA-Z")).toBe("z");
    } finally {
      a.close();
      b.close();
    }
  });

  it("walks frame documents with the parent Window's prototype getters", () => {
    // Given: an about:blank iframe whose document holds a small tree
    const [parent] = windows(1) as [Win];
    try {
      const frame = parent.document.createElement("iframe") as InstanceType<
        Win["HTMLIFrameElement"]
      >;
      parent.document.body?.append(frame);
      const inner = frame.contentDocument as Win["document"] | null;
      if (!inner?.body) throw new Error("Expected frame document");
      inner.body.innerHTML = `<p id="x" Title="t">a</p><b>c</b>`;
      const p = inner.getElementById("x");
      if (!p) throw new Error("Expected frame paragraph");
      const frameWindow = frame.contentWindow as unknown as Win;
      // When: the parent Window's getters and methods read frame nodes
      // Then: they agree with the frame Window's own getters
      for (const node of [inner, inner.body, p, p.firstChild, p.nextSibling])
        if (node) expect(walk(parent, node)).toEqual(walk(frameWindow, node));
      expect(getter(parent, "Node", "parentNode").call(p)).toBe(inner.body);
      expect(attributes(parent, p, "TITLE")).toEqual(["t", true]);
      parent.Element.prototype.setAttribute.call(p, "data-f", "f");
      expect(p.getAttribute("data-f")).toBe("f");
    } finally {
      parent.close();
    }
  });

  it("returns null edges for detached nodes, fragments, shadow roots, Attr and Text receivers", () => {
    // Given: detached, fragment, shadow, Attr and Text receivers from Window A
    const [a, b] = windows(2) as [Win, Win];
    try {
      const detached = a.document.createElement("div");
      const fragment = a.document.createDocumentFragment();
      fragment.append("x", a.document.createElement("i"));
      const host = a.document.createElement("section");
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = "<em>s</em>";
      const attr = a.document.getElementById("a")?.getAttributeNode("data-k");
      const text = a.document.getElementById("a")?.firstChild;
      if (!attr || !text) throw new Error("Expected fixture nodes");
      for (const window of [a, b]) {
        // When: each Window walks them
        // Then: edges follow the DOM tree, never the host or owner element
        expect(walk(window, detached)).toEqual({
          parentNode: null,
          parentElement: null,
          firstChild: null,
          lastChild: null,
          nextSibling: null,
          previousSibling: null,
          firstElementChild: null,
          lastElementChild: null,
          nextElementSibling: null,
          previousElementSibling: null,
          childElementCount: 0,
        });
        expect(walk(window, fragment)).toMatchObject({
          parentNode: null,
          firstChild: fragment.childNodes[0],
          lastChild: fragment.childNodes[1],
        });
        expect(walk(window, shadow)).toMatchObject({
          parentNode: null,
          parentElement: null,
          firstChild: shadow.firstChild,
        });
        expect(walk(window, shadow.firstChild as DomNode)).toMatchObject({
          parentNode: shadow,
          parentElement: null,
        });
        expect(walk(window, attr)).toEqual({
          parentNode: null,
          parentElement: null,
          firstChild: null,
          lastChild: null,
          nextSibling: null,
          previousSibling: null,
        });
        expect(walk(window, text)).toMatchObject({
          parentNode: text.parentNode,
          parentElement: text.parentNode,
          firstChild: null,
        });
      }
    } finally {
      a.close();
      b.close();
    }
  });

  it("treats custom element subclasses as ordinary receivers from any Window", () => {
    // Given: a custom element defined in Window A placed in A's tree
    const [a, b] = windows(2) as [Win, Win];
    try {
      class Item extends a.HTMLElement {}
      a.customElements.define("x-records-item", Item);
      const item = a.document.createElement("x-records-item");
      item.setAttribute("data-v", "1");
      item.append(a.document.createElement("i"));
      a.document.getElementById("m")?.prepend(item);
      // When: both Windows walk and read it
      // Then: results agree and attribute access sees the same record
      expect(item).toBeInstanceOf(Item);
      expect(walk(b, item)).toEqual(walk(a, item));
      expect(getter(b, "Node", "parentNode").call(item)).toBe(a.document.getElementById("m"));
      expect(attributes(b, item, "DATA-V")).toEqual(["1", true]);
      b.Element.prototype.removeAttribute.call(item, "data-v");
      expect(item.hasAttribute("data-v")).toBe(false);
    } finally {
      a.close();
      b.close();
    }
  });
});

describe("RunDOM tree walk and attribute brand checks", () => {
  it("throws the host TypeError for non-node receivers through any Window", () => {
    // Given: receivers that are not nodes, including a Window and a proxy of a node
    const a = new JSDOM(markup).window;
    const b = new JSDOM("").window;
    try {
      const element = a.document.getElementById("a");
      if (!element) throw new Error("Expected element");
      const receivers: unknown[] = [
        {},
        a,
        null,
        undefined,
        1,
        "s",
        () => {},
        new Proxy(element, {}),
        Object.create(element),
      ];
      for (const receiver of receivers) {
        for (const window of [a, b]) {
          const calls: Array<() => unknown> = [
            ...nodeWalks.map((name) => () => getter(window, "Node", name).call(receiver)),
            ...elementWalks
              .filter((name) => name !== "childElementCount")
              .map((name) => () => getter(window, "Element", name).call(receiver)),
            () => window.Element.prototype.getAttribute.call(receiver, "a"),
            () => window.Element.prototype.hasAttribute.call(receiver, "a"),
            () => window.Element.prototype.setAttribute.call(receiver, "a", "b"),
            () => window.Element.prototype.removeAttribute.call(receiver, "a"),
          ];
          // When: each getter or method is called on it
          // Then: the host realm's TypeError is thrown with the node brand message
          for (const call of calls) {
            let caught: unknown;
            try {
              call();
            } catch (error) {
              caught = error;
            }
            expect(caught).toBeInstanceOf(TypeError);
            expect((caught as Error).constructor).toBe(TypeError);
            expect((caught as Error).message).toBe("Expected a Node");
          }
        }
      }
    } finally {
      a.close();
      b.close();
    }
  });

  it("throws the Element brand error for Text, Attr and Document receivers", () => {
    // Given: non-element nodes from Window A
    const a = new JSDOM(markup).window;
    const b = new JSDOM("").window;
    try {
      const text = a.document.getElementById("a")?.firstChild;
      const attr = a.document.getElementById("a")?.getAttributeNode("data-k");
      for (const receiver of [text, attr, a.document])
        for (const window of [a, b]) {
          // When: Element-only members are called on them
          // Then: they fail with the Element brand message
          expect(() => window.Element.prototype.getAttribute.call(receiver, "a")).toThrow(
            new TypeError("Expected an Element"),
          );
          expect(() => window.Element.prototype.setAttribute.call(receiver, "a", "b")).toThrow(
            new TypeError("Expected an Element"),
          );
          expect(() => getter(window, "Element", "firstElementChild").call(receiver)).toThrow(
            new TypeError("Expected an Element"),
          );
        }
    } finally {
      a.close();
      b.close();
    }
  });

  it("checks the receiver brand before converting the attribute name", () => {
    // Given: a name whose string conversion is observable
    const a = new JSDOM(markup).window;
    try {
      const conversions: string[] = [];
      const name = {
        toString() {
          conversions.push("converted");
          return "DATA-K";
        },
      };
      const element = a.document.getElementById("a");
      const methods = ["getAttribute", "hasAttribute", "setAttribute", "removeAttribute"] as const;
      for (const method of methods) {
        // When: a non-node receiver is used
        // Then: the brand error is thrown before the name is converted
        expect(() => Reflect.apply(a.Element.prototype[method], {}, [name, "v"])).toThrow(
          new TypeError("Expected a Node"),
        );
      }
      expect(conversions).toEqual([]);
      // And: an element receiver converts the name once per call and folds its case
      expect(Reflect.apply(a.Element.prototype.getAttribute, element, [name])).toBe("1");
      expect(conversions).toEqual(["converted"]);
    } finally {
      a.close();
    }
  });

  it("checks argument counts before the receiver brand", () => {
    // Given: a non-node receiver and missing arguments
    const a = new JSDOM("").window;
    try {
      // When: attribute methods are called with too few arguments
      // Then: the argument error wins, as it does today
      expect(() => Reflect.apply(a.Element.prototype.getAttribute, {}, [])).toThrow(
        new TypeError("Missing attribute argument"),
      );
      expect(() => Reflect.apply(a.Element.prototype.setAttribute, {}, ["a"])).toThrow(
        new TypeError("Missing attribute argument"),
      );
    } finally {
      a.close();
    }
  });
});
