// Pins fresh static collection views and Web IDL indexing independently of their allocation strategy.
import { expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

it("keeps fresh static snapshots, identities and indexed reflection after mutations", () => {
  // Given: snapshots must retain members without retaining a mutable public result object.
  const { window: w } = new JSDOM('<main><p id="a"></p><p id="b"></p></main>');
  try {
    const a = w.document.getElementById("a"),
      b = w.document.getElementById("b");
    if (!a || !b) throw new Error("Expected members");
    const first = w.document.querySelectorAll("p"),
      second = w.document.querySelectorAll("p");
    expect(first).not.toBe(second);
    expect([...first]).toEqual([a, b]);
    expect(Object.keys(first)).toEqual(["0", "1"]);
    expect(Object.getOwnPropertyDescriptor(first, "0")).toEqual({
      value: a,
      writable: false,
      enumerable: true,
      configurable: true,
    });
    expect(Reflect.preventExtensions(first)).toBe(false);
    expect(Reflect.deleteProperty(first, "0")).toBe(false);
    expect(Reflect.defineProperty(first, "0", { value: b })).toBe(false);
    expect(Reflect.set(first, "0", b)).toBe(false);
    Reflect.set(first, "note", "owned");
    expect(Reflect.get(first, "note")).toBe("owned");
    a.remove();
    const c = w.document.createElement("p");
    const body = w.document.body;
    if (!body) throw new Error("Expected body");
    body.append(c);
    expect([...first]).toEqual([a, b]);
    expect([...w.document.querySelectorAll("p")]).toEqual([b, c]);
    expect(first.item(0)).toBe(a);
    expect(first.item(2)).toBeNull();
  } finally {
    w.close();
  }
});

it("separates collection interfaces and uses the realm's native iterable functions", () => {
  // Given: HTMLCollection has indexed iteration but none of NodeList's iterable-named members.
  const { window: w } = new JSDOM('<p id="foo"></p>');
  try {
    const nodes = w.document.querySelectorAll("p"),
      elements = w.document.getElementsByTagName("p");
    expect(elements instanceof w.NodeList).toBe(false);
    expect(Object.getPrototypeOf(w.HTMLCollection.prototype)).toBe(
      Object.getPrototypeOf(w.NodeList.prototype),
    );
    for (const key of ["keys", "values", "entries", "forEach"]) expect(key in elements).toBe(false);
    expect(nodes.values).toBe(Reflect.get(w, "Array").prototype.values);
    expect(nodes[Symbol.iterator]).toBe(nodes.values);
    expect(elements[Symbol.iterator]).toBe(Reflect.get(w, "Array").prototype.values);
    expect(Reflect.deleteProperty(elements, "foo")).toBe(false);
    expect(Reflect.defineProperty(elements, "foo", { value: 1 })).toBe(false);
  } finally {
    w.close();
  }
});

it("supports 2^32 named boundaries and prototype overrides without shadowing indices", () => {
  // Given: 2^32-1 is a name, while the preceding integer remains an unsupported array index.
  const { window: w } = new JSDOM('<main><p id="4294967295"></p><p id="foo"></p></main>');
  try {
    const list = w.document.getElementsByTagName("p");
    expect(Reflect.get(list, "4294967295")).toBe(list.item(0));
    expect(Reflect.get(list, "4294967294")).toBeUndefined();
    const original = Object.getOwnPropertyDescriptor(w.NodeList.prototype, "length");
    if (!original) throw new Error("Expected length getter");
    const nodes = w.document.querySelectorAll("p");
    Object.defineProperty(w.NodeList.prototype, "length", { get: () => 77, configurable: true });
    expect(nodes.length).toBe(77);
    Object.defineProperty(w.NodeList.prototype, "length", original);
    Object.defineProperty(w.NodeList.prototype, "2", { value: "inherited", configurable: true });
    expect(Reflect.get(nodes, "2")).toBe("inherited");
    expect(Reflect.has(nodes, "2")).toBe(true);
  } finally {
    w.close();
  }
});

it("brands borrowed collection operations across windows and converts item arguments once", () => {
  // Given: a method's realm is independent of a collection's creation realm.
  const { window: a } = new JSDOM("<p></p>"),
    { window: b } = new JSDOM("<p></p>");
  try {
    const nodes = b.document.querySelectorAll("p"),
      elements = b.document.children;
    expect(a.NodeList.prototype.item.call(nodes, 0)).toBe(nodes[0]);
    expect(
      Object.getOwnPropertyDescriptor(a.HTMLCollection.prototype, "length")?.get?.call(elements),
    ).toBe(1);
    expect(() => a.NodeList.prototype.item.call(elements, 0)).toThrow(/invocation/i);
    expect(() => Reflect.apply(a.NodeList.prototype.item, nodes, [])).toThrow(
      /index|required|argument/i,
    );
    let conversions = 0;
    const value = {
      valueOf() {
        conversions++;
        return 0;
      },
    };
    expect(Reflect.apply(a.NodeList.prototype.item, nodes, [value])).toBe(nodes[0]);
    expect(conversions).toBe(1);
  } finally {
    a.close();
    b.close();
  }
});

it("uses native iterator prototypes in an isolated window and observes live iteration", () => {
  // Given: iterators must belong to the receiver window's array intrinsic implementation.
  const { window: w } = new JSDOM("<main><p></p></main>", { runScripts: "outside-only" });
  try {
    const main = w.document.querySelector("main");
    if (!main) throw new Error("Expected main");
    expect(w.NodeList.prototype.values).toBe(Reflect.get(w, "Array").prototype.values);
    const iterator = main.childNodes.values();
    expect(iterator.next().value).toBe(main.firstChild);
    const next = w.document.createElement("p");
    main.append(next);
    expect(iterator.next().value).toBe(next);
    expect(iterator.next().done).toBe(true);
  } finally {
    w.close();
  }
});

it("matches class words at ASCII whitespace boundaries without accepting substrings", () => {
  // Given: all fast primitive-class candidates still require exact token matching.
  const { window: w } = new JSDOM('<!doctype html><p id="target"></p>');
  try {
    const p = w.document.getElementById("target");
    if (!p) throw new Error("Expected target");
    for (const [value, match] of [
      ["item", true],
      ["xitem", false],
      ["itemx", false],
      ["xitem item", true],
      ["itemitem", false],
      ["", false],
      ["item\u00a0x", false],
      ["x\vitem", false],
      ["x\titem\n", true],
      ["x\fitem\r", true],
      ["item item", true],
    ] as const) {
      p.setAttribute("class", value);
      expect(w.document.querySelector(".item") === p, value).toBe(match);
      expect(w.document.querySelectorAll(".item").length, value).toBe(match ? 1 : 0);
    }
  } finally {
    w.close();
  }
});

it("coerces query selectors once and reads mutations performed by that coercion", () => {
  // Given: selector conversion is observable and must precede lookup of reusable results.
  const { window: w } = new JSDOM('<main><p class="item"></p></main>');
  try {
    w.document.querySelectorAll(".item");
    let conversions = 0;
    const selector = {
      toString() {
        conversions++;
        const p = w.document.createElement("p");
        p.className = "item";
        w.document.querySelector("main")?.append(p);
        return ".item";
      },
    };
    const result = Reflect.apply(w.document.querySelectorAll, w.document, [selector]);
    expect(conversions).toBe(1);
    expect(result.length).toBe(2);
  } finally {
    w.close();
  }
});

it("keeps reusable results current across writes, scopes, adoption and private control state", () => {
  // Given: immutable selector text does not imply immutable DOM or pseudo-class inputs.
  const { window: a } = new JSDOM('<main><p class="item"></p><input type="checkbox"></main>'),
    { window: b } = new JSDOM("<main></main>");
  try {
    const root = a.document.querySelector("main"),
      other = b.document.querySelector("main"),
      p = a.document.querySelector("p"),
      input = a.document.querySelector("input");
    if (!root || !other || !p || !(input instanceof a.HTMLInputElement))
      throw new Error("Expected roots");
    const snapshot = root.querySelectorAll(".item");
    expect([...root.querySelectorAll(":scope > .item")]).toEqual([p]);
    expect(other.querySelectorAll(":scope > .item").length).toBe(0);
    p.className = "changed";
    expect(root.querySelectorAll(".item").length).toBe(0);
    expect(snapshot[0]).toBe(p);
    p.className = "item";
    expect(root.querySelectorAll(".item").length).toBe(1);
    expect(root.querySelectorAll(":checked").length).toBe(0);
    input.checked = true;
    expect(root.querySelectorAll(":checked")[0]).toBe(input);
    input.checked = false;
    expect(root.querySelectorAll(":checked").length).toBe(0);
    b.document.adoptNode(root);
    other.append(root);
    expect(root.querySelectorAll(".item")[0]).toBe(p);
    const added = b.document.createElement("p");
    added.className = "item";
    root.append(added);
    expect([...root.querySelectorAll(".item")]).toEqual([p, added]);
    p.remove();
    expect([...root.querySelectorAll(".item")]).toEqual([added]);
  } finally {
    a.close();
    b.close();
  }
});

it("uses the destination revision for retained live collections after adoption", () => {
  // Given: the original wrapper and collection outlive transfer to another Window.
  const { window: a } = new JSDOM('<main><p class="item"></p></main>'),
    { window: b } = new JSDOM("");
  try {
    const root = a.document.querySelector("main"),
      body = b.document.body;
    if (!root || !body) throw new Error("Expected roots");
    const tags = root.getElementsByTagName("p"),
      classes = root.getElementsByClassName("item"),
      namespaced = root.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "p");
    expect([tags.length, classes.length, namespaced.length]).toEqual([1, 1, 1]);
    b.document.adoptNode(root);
    body.append(root);
    expect(tags.length).toBe(1);
    const child = b.document.createElement("p");
    child.className = "item";
    b.Node.prototype.appendChild.call(root, child);
    expect([tags.length, classes.length, namespaced.length]).toEqual([2, 2, 2]);
    b.Element.prototype.setAttribute.call(child, "class", "other");
    expect(classes.length).toBe(1);
    b.Node.prototype.removeChild.call(root, child);
    expect([tags.length, classes.length, namespaced.length]).toEqual([1, 1, 1]);
  } finally {
    a.close();
    b.close();
  }
});

it("does not expose named members through unsupported canonical array indices", () => {
  // Given: namedItem accepts numeric names but bracket access reserves canonical array-index keys.
  const { window: w } = new JSDOM(
    '<p id="2147483645"></p><p id="4294967293"></p><p id="4294967294"></p><p id="4294967295"></p><p id="4294967296"></p>',
  );
  try {
    const list = w.document.getElementsByTagName("p");
    for (const key of ["2147483645", "4294967293", "4294967294"]) {
      expect(list.namedItem(key)).toBe(w.document.getElementById(key));
      expect(Reflect.get(list, key)).toBeUndefined();
      expect(Reflect.has(list, key)).toBe(false);
      expect(Object.getOwnPropertyDescriptor(list, key)).toBeUndefined();
      expect(Reflect.deleteProperty(list, key)).toBe(true);
    }
    for (const key of ["4294967295", "4294967296"])
      expect(Reflect.get(list, key)).toBe(w.document.getElementById(key));
  } finally {
    w.close();
  }
});

it("retains tag-name case matching chosen before adoption between HTML and XML documents", () => {
  // Given: an existing live list keeps its creation-time matching rule after its root moves.
  const { window: html } = new JSDOM(""),
    { window: xml } = new JSDOM("<root/>", { contentType: "application/xml" });
  try {
    const root = html.document.createElement("main");
    const lower = html.document.createElementNS("http://www.w3.org/1999/xhtml", "a"),
      upper = html.document.createElementNS("http://www.w3.org/1999/xhtml", "A"),
      plain = html.document.createElementNS(null, "A");
    root.append(lower, upper, plain);
    const original = root.getElementsByTagName("A");
    expect([...original]).toEqual([lower, plain]);
    // When: adoption invalidates members and a newly created list uses the XML document's rule.
    xml.document.adoptNode(root);
    xml.document.documentElement?.append(root);
    expect([...original]).toEqual([lower, plain]);
    const inXML = root.getElementsByTagName("A");
    expect([...inXML]).toEqual([upper, plain]);
    root.append(lower, upper, plain);
    expect([...original]).toEqual([lower, plain]);
    expect([...inXML]).toEqual([upper, plain]);
    // Then: moving back preserves both retained rules and future live membership updates.
    html.document.adoptNode(root);
    html.document.body?.append(root);
    expect([...original]).toEqual([lower, plain]);
    expect([...inXML]).toEqual([upper, plain]);
    const added = html.document.createElementNS("http://www.w3.org/1999/xhtml", "a");
    root.append(added);
    expect([...original]).toEqual([lower, plain, added]);
    expect([...inXML]).toEqual([upper, plain]);
  } finally {
    html.close();
    xml.close();
  }
});

it("looks up HTML attribute names case-insensitively while preserving SVG and XML case", () => {
  // Given an HTML element, a foreign SVG element and XHTML in an XML document.
  const html = new JSDOM('<button tabindex="0"></button><svg viewBox="0 0 1 1"></svg>');
  const xml = new JSDOM('<button xmlns="http://www.w3.org/1999/xhtml" tabIndex="1"/>', {
    contentType: "application/xml",
  });
  try {
    const button = html.window.document.querySelector("button");
    const svg = html.window.document.querySelector("svg");
    if (!button || !svg) throw new Error("Expected HTML and SVG fixtures");
    const attrs = button.attributes;
    // When the caller changes case, only HTML qualified-name lookup folds the name.
    const tab = attrs.getNamedItem("tabindex");
    expect(Reflect.get(attrs, "tabIndex")).toBe(tab);
    expect(Object.getOwnPropertyDescriptor(attrs, "TABINDEX")?.value).toBe(tab);
    expect(Reflect.ownKeys(attrs)).toEqual(["0", "tabindex"]);
    button.setAttributeNS(null, "mixedCase", "1");
    expect(Reflect.ownKeys(attrs)).toEqual(["0", "1", "tabindex"]);
    expect(Reflect.get(attrs, "mixedCase")).toBeUndefined();
    expect(Reflect.get(svg.attributes, "viewBox")).toBe(svg.attributes.item(0));
    expect(Reflect.get(svg.attributes, "viewbox")).toBeUndefined();
    const root = xml.window.document.documentElement;
    if (!root) throw new Error("Expected XML document element");
    const xmlAttrs = root.attributes;
    expect(Reflect.get(xmlAttrs, "tabIndex")).toBe(xmlAttrs.getNamedItem("tabIndex"));
    expect(Reflect.get(xmlAttrs, "tabindex")).toBeUndefined();
    // Then the named property still follows live attribute membership.
    button.removeAttribute("tabindex");
    expect(Reflect.get(attrs, "tabIndex")).toBeUndefined();
  } finally {
    html.window.close();
    xml.window.close();
  }
});

it("rejects proxied, inherited and primitive receivers of collection operations", () => {
  // Given: query results, cached query results, child lists and HTMLCollections
  const { window: w } = new JSDOM('<p class="a"></p><p class="a"></p>');
  try {
    const length = Object.getOwnPropertyDescriptor(w.NodeList.prototype, "length")?.get;
    const body = w.document.body;
    if (!body) throw new Error("Expected a body");
    const views = [
      w.document.querySelectorAll(".a"),
      w.document.querySelectorAll(".a"),
      body.childNodes,
    ];
    for (const view of views) {
      // When: a NodeList operation runs on a user Proxy (forwarding or not), an object
      //   inheriting from the view, or a primitive
      // Then: each throws the brand error, while the view itself still answers
      expect(() => length?.call(new Proxy(view, {}))).toThrow("Illegal invocation");
      expect(() =>
        w.NodeList.prototype.item.call(
          new Proxy(view, { get: (target, key) => Reflect.get(target, key) }),
          0,
        ),
      ).toThrow("Illegal invocation");
      expect(() => length?.call(Object.create(view))).toThrow("Illegal invocation");
      expect(() => length?.call(null)).toThrow("Illegal invocation");
      expect(() => length?.call(1)).toThrow("Illegal invocation");
      expect(length?.call(view)).toBe(2);
      expect(Object.getOwnPropertySymbols(view)).toEqual([]);
    }
    const elements = w.document.getElementsByTagName("p");
    expect(() =>
      Object.getOwnPropertyDescriptor(w.HTMLCollection.prototype, "length")?.get?.call(
        new Proxy(elements, {}),
      ),
    ).toThrow("Illegal invocation");
    expect(elements.length).toBe(2);
  } finally {
    w.close();
  }
});
