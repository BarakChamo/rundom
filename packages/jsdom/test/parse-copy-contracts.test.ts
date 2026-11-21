// Exercises cached-template documents through public reads, first writes, adoption and retained handles.
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");
const padding = Array.from(
  { length: 1024 },
  (_, index) => `<span data-index="${index}"></span>`,
).join("");
function markup(extra = ""): string {
  return `<!doctype html><main id="fixture"><p id="target" data-value="original">text</p>${padding}${extra}</main>`;
}
function repeatedWindow({ Constructor, html }: { Constructor: typeof JSDOM; html: string }) {
  // The first two constructions include cache admission; the third may use a private copy backend.
  for (let index = 0; index < 2; index++) new Constructor(html).window.close();
  return new Constructor(html).window;
}

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name cached template documents", ({ Constructor }) => {
  it("keeps interleaved matches in their original order after sparse edits", () => {
    // Given alternating classes across a recurring document large enough to share membership.
    const html =
      "<main>" +
      Array.from(
        { length: 600 },
        (_, i) => `<p class="${i % 2 ? "odd" : "even"}" id="r${i}">${i}</p>`,
      ).join("") +
      "</main>";
    const window = repeatedWindow({ Constructor, html });
    try {
      const { document } = window;
      const old = document.querySelectorAll(".even");
      const removed = old[1];
      const added = document.getElementById("r5");
      if (!removed || !added) throw new Error("Expected both edited rows");
      // When two edits exchange members and a third changes only an unrelated attribute.
      removed.className = "odd";
      added.className = "even";
      old[0]?.setAttribute("title", "read");
      const current = document.querySelectorAll(".even");
      // Then old and current snapshots each retain the correct order and wrappers.
      expect(current.length).toBe(300);
      expect(current[1]?.id).toBe("r4");
      expect(current[2]).toBe(added);
      expect(old[1]).toBe(removed);
      expect(current[299]).toBe(old[299]);
      expect(current[300]).toBeUndefined();
    } finally {
      window.close();
    }
  });
  it("keeps sparse reads and the first attribute/text write independent of later documents", () => {
    // Given: a repeatedly parsed large document with only its first row initially exposed.
    const html = markup(),
      a = repeatedWindow({ Constructor, html });
    let b: typeof a | undefined;
    try {
      const first = a.document.getElementById("target");
      if (!first) throw new Error("Expected cached-template target");
      expect(a.document.querySelector("main > p")).toBe(first);
      expect(first.textContent).toBe("text");
      // When: the first write changes attributes and text, then a fresh document uses identical input.
      first.setAttribute("data-value", "changed");
      first.textContent = "edited";
      b = new Constructor(html).window;
      // Then: each document retains its own records and original input stays intact.
      expect(a.document.getElementById("target")).toBe(first);
      expect(b.document.getElementById("target")?.getAttribute("data-value")).toBe("original");
      expect(b.document.getElementById("target")?.textContent).toBe("text");
      expect(first.textContent).toBe("edited");
    } finally {
      a.close();
      b?.close();
    }
  });
  it("keeps live child-list identity across indexed reads, reflection and insertion", () => {
    // Given: a child list with untouched interior members and independently exposed endpoints.
    const w = repeatedWindow({ Constructor, html: markup() });
    try {
      const root = w.document.getElementById("fixture");
      if (!root) throw new Error("Expected child-list fixture");
      const children = root.childNodes,
        first = children.item(0),
        last = children.item(1024);
      expect(children.length).toBe(1025);
      expect(first?.nodeName).toBe("P");
      expect(last?.nodeName).toBe("SPAN");
      expect(Object.getOwnPropertyDescriptor(children, "0")?.value).toBe(first);
      // When: a new member is appended after sparse list exposure.
      const added = w.document.createElement("i");
      root.appendChild(added);
      // Then: old identities persist and the same live list observes the new dense sequence.
      expect(children.item(0)).toBe(first);
      expect(children.item(1024)).toBe(last);
      expect(children.item(1025)).toBe(added);
      expect(children.length).toBe(1026);
      expect(Array.from(children).length).toBe(1026);
    } finally {
      w.close();
    }
  });
  it("preserves Attr handles and namespace edits across the first mutation", () => {
    // Given: an Attr obtained before any structural edit.
    const w = repeatedWindow({ Constructor, html: markup() });
    try {
      const target = w.document.getElementById("target"),
        attr = target?.getAttributeNode("data-value");
      if (!target || !attr) throw new Error("Expected attribute fixture");
      // When: its value changes, a namespace is added, and the Attr is detached.
      attr.value = "changed";
      target.setAttributeNS("urn:template", "t:value", "namespaced");
      expect(target.getAttribute("data-value")).toBe("changed");
      expect(target.getAttributeNS("urn:template", "value")).toBe("namespaced");
      expect(target.removeAttributeNode(attr)).toBe(attr);
      // Then: the retained handle and remaining namespace state remain independent.
      expect(attr.ownerElement).toBeNull();
      expect(attr.value).toBe("changed");
      expect(target.hasAttribute("data-value")).toBe(false);
      expect(target.getAttributeNS("urn:template", "value")).toBe("namespaced");
    } finally {
      w.close();
    }
  });
  it("preserves foreign attribute namespaces and independent Attr ownership in copied recipes", () => {
    // Given: HTML and SVG attributes share local names but have distinct namespace and prefix metadata.
    const html = markup(
      '<svg id="foreign" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#original" href="#plain"></use></svg>',
    );
    const a = repeatedWindow({ Constructor, html }),
      b = new Constructor(html).window;
    try {
      const first = a.document.querySelector("use"),
        second = b.document.querySelector("use");
      if (!first || !second) throw new Error("Expected foreign attribute fixtures");
      const ns = "http://www.w3.org/1999/xlink",
        attr = first.getAttributeNodeNS(ns, "href");
      if (!attr) throw new Error("Expected namespaced attribute");
      expect(attr.prefix).toBe("xlink");
      expect(attr.name).toBe("xlink:href");
      expect(attr.ownerElement).toBe(first);
      // When: an owned Attr mutates, its plain-name sibling and another copied document remain unchanged.
      attr.value = "#changed";
      expect(first.getAttributeNS(ns, "href")).toBe("#changed");
      expect(first.getAttribute("href")).toBe("#plain");
      expect(second.getAttributeNS(ns, "href")).toBe("#original");
      expect(second.getAttributeNodeNS(ns, "href")).not.toBe(attr);
    } finally {
      a.close();
      b.close();
    }
  });
  it("preserves mixed child positions and nested template topology in recurring copies", () => {
    // Given: populated and empty child arrays plus inert nested contents in a recurring document.
    const html = markup(
      'lead<!--marker--><template id="outer"><b>before</b><template id="inner"><i>inside</i></template><b>after</b></template><hr id="empty">',
    );
    const a = repeatedWindow({ Constructor, html }),
      b = new Constructor(html).window;
    try {
      const outer = a.document.getElementById("outer"),
        peer = b.document.getElementById("outer");
      if (!(outer instanceof a.HTMLTemplateElement) || !(peer instanceof b.HTMLTemplateElement))
        throw new Error("Expected outer templates");
      expect(outer.previousSibling?.nodeType).toBe(8);
      expect(outer.previousSibling?.previousSibling?.textContent).toBe("lead");
      expect(Array.from(outer.content.childNodes, (node) => node?.nodeName)).toEqual([
        "B",
        "TEMPLATE",
        "B",
      ]);
      const inner = outer.content.querySelector("template");
      if (!(inner instanceof a.HTMLTemplateElement)) throw new Error("Expected inner template");
      expect(inner.content.textContent).toBe("inside");
      // When/Then: filling an empty child array and editing nested content never changes a peer recipe copy.
      inner.content.firstChild?.appendChild(a.document.createTextNode("changed"));
      const empty = a.document.getElementById("empty"),
        child = a.document.createElement("span");
      if (!empty) throw new Error("Expected empty element");
      empty.appendChild(child);
      expect(child.parentNode).toBe(empty);
      expect(empty.childNodes.length).toBe(1);
      expect(b.document.getElementById("empty")?.childNodes.length).toBe(0);
      const otherInner = peer.content.querySelector("template");
      if (!(otherInner instanceof b.HTMLTemplateElement))
        throw new Error("Expected peer inner template");
      expect(otherInner.content.textContent).toBe("inside");
    } finally {
      a.close();
      b.close();
    }
  });
  it("keeps first attribute writes, removals and replacements independent of recurring peers", () => {
    // Given: none of these fresh recurring documents has exposed an Attr before its first mutation.
    type W = ReturnType<typeof repeatedWindow>;
    type E = NonNullable<ReturnType<W["document"]["getElementById"]>>;
    const actions: Array<(input: { window: W; target: E }) => void> = [
      ({ target }) => {
        target.setAttribute("data-value", "changed");
      },
      ({ target }) => {
        target.removeAttribute("data-value");
      },
      ({ target }) => {
        target.toggleAttribute("data-value", false);
      },
      ({ target }) => {
        target.setAttributeNS("urn:copy", "c:value", "changed");
      },
      ({ window, target }) => {
        const attr = window.document.createAttribute("data-value");
        attr.value = "changed";
        target.setAttributeNode(attr);
        expect(target.getAttributeNode("data-value")).toBe(attr);
      },
    ];
    const html = markup();
    for (const action of actions) {
      const a = repeatedWindow({ Constructor, html }),
        b = new Constructor(html).window;
      try {
        const target = a.document.getElementById("target");
        if (!target) throw new Error("Expected copied attribute owner");
        // When: a different mutation entry point owns the first write.
        action({ window: a, target });
        // Then: peers and a later recurring document retain the unchanged source attributes.
        expect(b.document.getElementById("target")?.getAttribute("data-value")).toBe("original");
        expect(b.document.getElementById("target")?.getAttributeNS("urn:copy", "value")).toBeNull();
        const c = new Constructor(html).window;
        try {
          expect(c.document.getElementById("target")?.getAttribute("data-value")).toBe("original");
        } finally {
          c.close();
        }
      } finally {
        a.close();
        b.close();
      }
    }
  });
  it("preserves Attr identity and observer old values when coercion exposes attributes", async () => {
    // Given: conversion reenters the DOM before the outer attribute write publishes.
    const html = markup(),
      a = repeatedWindow({ Constructor, html }),
      b = new Constructor(html).window;
    const oldValues: Array<string | null> = [];
    const observer = new a.MutationObserver((records) => {
      for (const record of records) oldValues.push(record.oldValue);
    });
    try {
      const target = a.document.getElementById("target");
      if (!target) throw new Error("Expected coercion owner");
      const held: { attribute: ReturnType<typeof target.getAttributeNode> } = { attribute: null };
      observer.observe(target, { attributes: true, attributeOldValue: true });
      // When: public Attr exposure and a nested write happen during string conversion.
      Reflect.apply(target.setAttribute, target, [
        "data-value",
        {
          toString() {
            held.attribute = target.getAttributeNode("data-value");
            if (!held.attribute) throw new Error("Expected reentrant Attr");
            held.attribute.value = "during";
            return "after";
          },
        },
      ]);
      await setImmediate();
      // Then: copying storage is invisible, both real mutations retain old values, and the handle stays canonical.
      if (!held.attribute) throw new Error("Expected retained Attr");
      expect(oldValues).toEqual(["original", "during"]);
      expect(held.attribute.value).toBe("after");
      expect(target.getAttributeNode("data-value")).toBe(held.attribute);
      expect(b.document.getElementById("target")?.getAttribute("data-value")).toBe("original");
    } finally {
      observer.disconnect();
      a.close();
      b.close();
    }
  });
  it("keeps template and foreign-content copies isolated through mutation and cloning", () => {
    // Given: hidden template content is exposed before its outer document is traversed.
    const html = markup('<template id="hidden"><svg><title>λ</title></svg></template>');
    const a = repeatedWindow({ Constructor, html }),
      b = new Constructor(html).window;
    try {
      const template = a.document.getElementById("hidden");
      if (!(template instanceof a.HTMLTemplateElement))
        throw new Error("Expected template fixture");
      const svg = template.content.firstElementChild;
      if (!svg) throw new Error("Expected SVG fixture");
      expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
      // When: the exposed foreign node is edited and its template is cloned.
      svg.setAttribute("data-edited", "yes");
      const clone = template.cloneNode(true);
      expect(clone.content.firstElementChild?.getAttribute("data-edited")).toBe("yes");
      const peer = b.document.getElementById("hidden");
      if (!(peer instanceof b.HTMLTemplateElement)) throw new Error("Expected peer template");
      // Then: clone ownership and the other source copy remain independent.
      expect(peer.content.firstElementChild?.hasAttribute("data-edited")).toBe(false);
      expect(a.document.querySelector("svg")).toBeNull();
    } finally {
      a.close();
      b.close();
    }
  });
  it("preserves unexposed descendant realms through borrowed adoption and closure", () => {
    // Given: a source subtree whose descendant has never been wrapped.
    const html = markup('<div id="moved"><i id="descendant">child</i></div>');
    const a = repeatedWindow({ Constructor, html }),
      b = new Constructor("<article></article>").window;
    try {
      const moved = a.document.getElementById("moved");
      if (!moved || !b.document.body) throw new Error("Expected adoption fixture");
      // When: a source method is borrowed onto the destination, then the source closes.
      a.document.adoptNode.call(b.document, moved);
      b.document.body.appendChild(moved);
      a.close();
      const first = Object.getOwnPropertyDescriptor(b.Node.prototype, "firstChild")?.get;
      if (!first) throw new Error("Expected borrowed child getter");
      const child: unknown = first.call(moved);
      // Then: creator prototypes survive while ownership follows the destination.
      expect(child instanceof a.HTMLElement).toBe(true);
      expect(moved.ownerDocument === b.document).toBe(true);
      expect(moved.firstChild?.ownerDocument === b.document).toBe(true);
      expect(moved.textContent).toBe("child");
    } finally {
      a.close();
      b.close();
    }
  });
  it("allows dense cloning, traversal and serialization after a sparse lookup", () => {
    // Given: only one source element has been observed.
    const w = repeatedWindow({ Constructor, html: markup() });
    try {
      const root = w.document.getElementById("fixture"),
        first = w.document.getElementById("target");
      if (!root) throw new Error("Expected dense fixture");
      // When: a complete clone and complete serialization force all remaining records to be read.
      const clone = root.cloneNode(true);
      expect(clone.querySelectorAll("span").length).toBe(1024);
      expect(root.querySelectorAll("span").length).toBe(1024);
      // Then: canonical endpoints, text and original wrapper identity remain stable.
      expect(root.firstChild).toBe(first);
      expect(clone.querySelector("#target")?.textContent).toBe("text");
      expect(root.outerHTML.endsWith('<span data-index="1023"></span></main>')).toBe(true);
    } finally {
      w.close();
    }
  });
  it("keeps retained closed-document reads and writes valid", () => {
    // Given: a document retained after its Window closes.
    const w = repeatedWindow({ Constructor, html: markup() }),
      document = w.document;
    const target = document.getElementById("target");
    if (!target) throw new Error("Expected retained target");
    w.close();
    // When: the held document is read, then its first ID write occurs after closure.
    expect(document.getElementById("target")).toBe(target);
    target.id = "renamed";
    // Then: lookups repair normally and the held document remains usable.
    expect(document.getElementById("target")).toBeNull();
    expect(document.getElementById("renamed")).toBe(target);
    expect(document.querySelectorAll("span").length).toBe(1024);
  });
  it("preserves live named aliases without exposing cached source records", () => {
    // Given: duplicate names and an object ID, with another matching image hidden inside a template.
    const html = markup(
      '<img name="alias" id="named-first"><img name="alias" id="named-second"><object id="object-only"></object><template><img name="alias"></template>',
    );
    const a = repeatedWindow({ Constructor, html }),
      b = new Constructor(html).window;
    try {
      const first = a.document.getElementById("named-first"),
        second = a.document.getElementById("named-second");
      if (!first || !second) throw new Error("Expected named-property fixtures");
      const aliases: unknown = Reflect.get(a.document, "alias");
      if (!(aliases instanceof a.HTMLCollection))
        throw new Error("Expected live duplicate-name collection");
      expect(aliases.length).toBe(2);
      expect(aliases.item(0)).toBe(first);
      expect(aliases.item(1)).toBe(second);
      expect(Reflect.get(a.document, "object-only")).toBe(a.document.getElementById("object-only"));
      // When: the first alias changes name after the collection has been exposed.
      first.setAttribute("name", "renamed");
      // Then: aliases stay live, the other document retains original names, and template contents stay hidden.
      expect(aliases.length).toBe(1);
      expect(aliases.item(0)).toBe(second);
      expect(Reflect.get(a.document, "alias")).toBe(second);
      const peer: unknown = Reflect.get(b.document, "alias");
      if (!(peer instanceof b.HTMLCollection)) throw new Error("Expected independent peer aliases");
      expect(peer.length).toBe(2);
      expect(peer.item(0)?.getAttribute("name")).toBe("alias");
    } finally {
      a.close();
      b.close();
    }
  });
  it("discovers new named elements after an initially name-free document changes", () => {
    // Given: a name-free document whose initial ordinary getters have already been read.
    const w = repeatedWindow({ Constructor, html: markup() });
    try {
      const body = w.document.body;
      if (!body) throw new Error("Expected body fixture");
      expect(Reflect.has(w.document, "newAlias")).toBe(false);
      // When: a newly named image is inserted, renamed and removed.
      const image = w.document.createElement("img");
      image.setAttribute("name", "newAlias");
      body.appendChild(image);
      expect(Reflect.get(w.document, "newAlias")).toBe(image);
      image.setAttribute("name", "changedAlias");
      expect(Reflect.has(w.document, "newAlias")).toBe(false);
      expect(Reflect.get(w.document, "changedAlias")).toBe(image);
      image.remove();
      // Then: the initially empty discovery proof never hides later live names.
      expect(Reflect.has(w.document, "changedAlias")).toBe(false);
    } finally {
      w.close();
    }
  });
  it.each([" ", "\t", "\n", "\f", "\r"])(
    "recognizes image-token aliases with delimiter %j",
    (separator) => {
      // Given/When: the parser's legacy image token produces an ordinary named HTML image.
      const w = repeatedWindow({
        Constructor,
        html: markup(`<image${separator}name="imageAlias" id="legacy-image">`),
      });
      try {
        const image = w.document.getElementById("legacy-image");
        // Then: absence proofs do not miss parser aliases.
        expect(image instanceof w.HTMLImageElement).toBe(true);
        expect(Reflect.get(w.document, "imageAlias")).toBe(image);
      } finally {
        w.close();
      }
    },
  );
  it("invalidates an empty named index when another realm borrows the insertion method", () => {
    // Given: two name-free documents with their absence lookups already observed.
    const a = repeatedWindow({ Constructor, html: markup() }),
      b = new Constructor("<main></main>").window;
    try {
      if (!b.document.body) throw new Error("Expected destination body");
      expect(Reflect.has(a.document, "foreignAlias")).toBe(false);
      expect(Reflect.has(b.document, "foreignAlias")).toBe(false);
      const image = a.document.createElement("img");
      image.setAttribute("name", "foreignAlias");
      // When: a foreign method inserts the named element into the destination.
      a.Node.prototype.appendChild.call(b.document.body, image);
      // Then: discovery follows the owning document rather than the method's creation realm.
      expect(Reflect.get(b.document, "foreignAlias")).toBe(image);
      expect(Reflect.has(a.document, "foreignAlias")).toBe(false);
      expect(image.ownerDocument === b.document).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });
  it("discovers names after a retained document is opened and rewritten", () => {
    // Given: initial named absence has already been observed.
    const w = repeatedWindow({ Constructor, html: markup() });
    try {
      expect(Reflect.has(w.document, "writtenAlias")).toBe(false);
      // When: document replacement introduces a named image.
      w.document.open();
      w.document.write('<img name="writtenAlias" id="written">');
      w.document.close();
      // Then: a new parser generation discards the initial absence proof.
      expect(Reflect.get(w.document, "writtenAlias")).toBe(w.document.getElementById("written"));
      expect(w.document.getElementById("written") instanceof w.HTMLImageElement).toBe(true);
    } finally {
      w.close();
    }
  });
  it.each(["radio", "rAdIo", "r&#x61;dio", "&#114;&#97;&#100;&#105;&#111;"])(
    "initializes repeated checked groups with type %s",
    (type) => {
      // Given: two parser-created checked radios, including entity-encoded type spelling.
      const w = repeatedWindow({
        Constructor,
        html: markup(
          `<input id="first" type="${type}" name="group" checked><input id="last" type="${type}" name="group" checked>`,
        ),
      });
      try {
        const first = w.document.getElementById("first"),
          last = w.document.getElementById("last");
        if (!first || !last) throw new Error("Expected radio fixture");
        // When/Then: complete initialization keeps the last parser-checked group member selected.
        expect(Reflect.get(first, "type")).toBe("radio");
        expect(Reflect.get(last, "type")).toBe("radio");
        expect(Reflect.get(first, "checked")).toBe(false);
        expect(Reflect.get(last, "checked")).toBe(true);
      } finally {
        w.close();
      }
    },
  );
});
