// Preserves opaque node ownership through native-private storage, frozen handles and borrowed realm operations.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name node storage", ({ Constructor }) => {
  it("keeps unwrapped fragment descendants in their original realm through adoption", () => {
    // Given: fragment parsing created descendants the caller has never read.
    const a = new Constructor("<main></main>").window,
      b = new Constructor("").window;
    try {
      const parent = a.document.querySelector("main");
      if (!parent || !b.document.body) throw new Error("Expected a fragment adoption fixture");
      parent.innerHTML = "<section><span>original</span></section>";
      // When: a different realm adopts the parsed subtree before the descendants are wrapped.
      b.document.body.appendChild(b.document.adoptNode(parent));
      const leaf = b.document.querySelector("span");
      // Then: the node document changed while the element and text retain their creation realm.
      expect(leaf?.ownerDocument).toBe(b.document);
      expect(leaf).toBeInstanceOf(a.HTMLSpanElement);
      expect(leaf?.firstChild).toBeInstanceOf(a.Text);
      expect(leaf?.textContent).toBe("original");
    } finally {
      a.close();
      b.close();
    }
  });
  it("keeps frozen node handles usable through adoption, mutation and cloning", () => {
    // Given: callers may freeze wrappers without freezing the DOM's internal state.
    const a = new Constructor('<main><p id="target">original</p></main>').window,
      b = new Constructor("").window;
    try {
      const node = a.document.getElementById("target"),
        body = b.document.body;
      if (!node || !body || !node.firstChild) throw new Error("Expected a frozen-node fixture");
      const child = node.firstChild,
        keys = Reflect.ownKeys(node);
      Object.freeze(node);
      Object.freeze(child);
      // When: a different Window adopts and updates the frozen handles.
      body.appendChild(b.document.adoptNode(node));
      b.Element.prototype.setAttribute.call(node, "data-value", "updated");
      child.textContent = "changed";
      const copy = node.cloneNode(true);
      // Then: private ownership, text, attributes, reflection and independent cloning remain valid.
      expect(node.ownerDocument).toBe(b.document);
      expect(node.firstChild).toBe(child);
      expect(node.textContent).toBe("changed");
      expect(node.getAttribute("data-value")).toBe("updated");
      expect(copy.ownerDocument).toBe(b.document);
      expect(copy.textContent).toBe("changed");
      expect(copy === node || copy.firstChild === child).toBe(false);
      expect(Reflect.ownKeys(node)).toEqual(keys);
      expect(Object.isFrozen(node)).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });
  it("borrows node and document operations across isolated proxy documents", () => {
    // Given: both Windows own distinct constructors and intrinsic prototype chains.
    const a = new Constructor("", { runScripts: "outside-only" }).window,
      b = new Constructor("", { runScripts: "outside-only" }).window;
    try {
      const text = a.Document.prototype.createTextNode.call(b.document, "foreign"),
        type = Object.getOwnPropertyDescriptor(a.Node.prototype, "nodeType")?.get;
      if (!type) throw new Error("Expected the Node type getter");
      // When/Then: receiver ownership survives borrowed calls and document proxy branding.
      expect(type.call(b.document)).toBe(9);
      expect(type.call(text)).toBe(3);
      expect(text.ownerDocument).toBe(b.document);
      expect(text instanceof b.Text).toBe(true);
      expect(a.Node.prototype.isSameNode.call(b.document, b.document)).toBe(true);
      expect(() => type.call({})).toThrow(/Node|Illegal invocation/);
    } finally {
      a.close();
      b.close();
    }
  });
});

describe("RunDOM repeated parsed storage", () => {
  it("keeps text and Attr identities local when one copy is edited and adopted", () => {
    // Given: repeated parsing admits the input and leaves its text and attributes unread.
    const markup = '<main><p id="row" class="item" data-row="0">original</p></main>';
    const windows = Array.from({ length: 3 }, () => new JSDOM(markup).window);
    const [first, second, third] = windows;
    try {
      if (!first || !second || !third) throw new Error("Expected three independent Windows");
      const edited = second.document.querySelector(".item");
      const sibling = third.document.querySelector(".item");
      if (!edited || !sibling) throw new Error("Expected an independently parsed row");
      expect(edited.textContent).toBe("original");
      expect(edited.getAttribute("data-row")).toBe("0");

      // When: direct and handle-based edits are followed by adoption.
      edited.setAttribute("class", "updated");
      const attribute = edited.getAttributeNode("data-row");
      const text = edited.firstChild;
      if (!(text instanceof second.Text) || !attribute) throw new Error("Expected parsed payloads");
      attribute.value = "changed";
      text.data = "edited";
      const body = first.document.body;
      if (!body) throw new Error("Expected a destination body");
      body.appendChild(first.document.adoptNode(edited));

      // Then: old handles stay canonical and independently parsed payloads keep their original values.
      expect(edited.firstChild).toBe(text);
      expect(text.ownerDocument).toBe(first.document);
      expect(edited.getAttributeNode("data-row")).toBe(attribute);
      expect(edited.textContent).toBe("edited");
      expect(edited.getAttribute("data-row")).toBe("changed");
      expect(sibling.textContent).toBe("original");
      expect(sibling.getAttribute("data-row")).toBe("0");
      expect(sibling.className).toBe("item");
    } finally {
      for (const window of windows) window.close();
    }
  });
});

describe("RunDOM packed branch storage", () => {
  it("opens deeply nested inert templates on repeated parsing", () => {
    // Given: repeated inert markup with a long chain of template content edges.
    const depth = 6_500;
    const html = "<template>".repeat(depth) + "<b>end</b>" + "</template>".repeat(depth);

    // When: a fresh Window parses the source and the next Window reuses it.
    for (let iteration = 0; iteration < 2; iteration++) {
      const { window } = new JSDOM(html);
      try {
        const root = window.document.querySelector("template");
        if (!(root instanceof window.HTMLTemplateElement))
          throw new Error("Expected the outer template");
        let template = root;
        for (let index = 1; index < depth; index++) {
          const child = template.content.firstElementChild;
          if (!(child instanceof window.HTMLTemplateElement))
            throw new Error("Expected a nested template");
          template = child;
        }

        // Then: opening the inert contents preserves the complete chain and its leaf.
        expect(template.content.textContent).toBe("end");
      } finally {
        window.close();
      }
    }
  });

  it("keeps unopened children ordered and realm-local through adoption and edits", () => {
    // Given: the second and third documents reuse a source with mixed descendant kinds.
    const html =
      '<main><section aria-label="branch">start<!--marker--><em>middle</em><b>end</b></section>' +
      "<template><span>inert</span></template></main>";
    const windows = Array.from({ length: 3 }, () => new JSDOM(html).window);
    try {
      const [destination, original, peer] = windows;
      if (!destination?.document.body || !original || !peer)
        throw new Error("Expected independent documents");
      const branch = original.document.body?.firstElementChild?.firstElementChild;
      if (!branch) throw new Error("Expected a parsed branch");

      // When: only the branch handle has escaped before a foreign document adopts it.
      destination.document.body.appendChild(destination.document.adoptNode(branch));
      const children = Array.from(branch.childNodes);
      const middle = branch.querySelector("em");
      if (!middle) throw new Error("Expected the child element");
      middle.replaceWith(destination.document.createTextNode("edited"));

      // Then: exposed handles keep their order, identity and creation realm.
      expect(children.map((child) => child?.nodeName)).toEqual(["#text", "#comment", "EM", "B"]);
      expect(children[2]).toBe(middle);
      expect(children[0]).toBeInstanceOf(original.Text);
      expect(children[1]).toBeInstanceOf(original.Comment);
      expect(children.every((node) => node?.ownerDocument === destination.document)).toBe(true);
      expect(branch.textContent).toBe("starteditedend");
      expect(peer.document.querySelector("section")?.textContent).toBe("startmiddleend");
      expect(peer.document.querySelector("template")?.innerHTML).toBe("<span>inert</span>");
    } finally {
      for (const window of windows) window.close();
    }
  });
});

describe("RunDOM large query snapshots", () => {
  it("preserves a partially read prefix through attribute edits and reordering", () => {
    const markup =
      "<main>" +
      Array.from({ length: 256 }, (_, i) => `<p class="row" id="r${i}">${i}</p>`).join("") +
      "</main>";
    const first = new JSDOM(markup);
    const second = new JSDOM(markup);
    try {
      const { document } = second.window;
      const rows = document.querySelectorAll(".row");
      const peer = document.querySelectorAll(".row");
      for (let index = 0; index < 32; index++) expect(rows[index]?.textContent).toBe(String(index));
      const edited = rows[20];
      const last = peer[255];
      if (!edited || !last) throw new Error("Expected original snapshot members");
      edited.className = "changed";
      const inserted = document.createElement("span");
      inserted.className = "row";
      edited.appendChild(inserted);
      expect(document.querySelectorAll(".row")[20]).toBe(inserted);
      edited.parentNode?.insertBefore(last, edited);
      expect(rows.item(20)).toBe(edited);
      expect(peer.item(255)).toBe(last);
      expect(document.querySelectorAll(".row")[20]).toBe(last);
      expect(first.window.document.querySelector(".changed")).toBeNull();
    } finally {
      first.window.close();
      second.window.close();
    }
  });

  it("exposes the original members after replacement and adoption", () => {
    // Given: a large ordinary document returns independent static lists before any indexed read.
    const original = new JSDOM("<main>" + '<p class="row">original</p>'.repeat(140) + "</main>")
      .window;
    const destination = new JSDOM("<main></main>").window;
    try {
      const { document } = original;
      const first = document.querySelectorAll(".row");
      const second = document.querySelectorAll(".row");
      const parent = document.querySelector("main");
      const member = parent?.firstElementChild;
      if (!parent || !member || !destination.document.body)
        throw new Error("Expected query fixture");

      // When: the first result is moved before either static list is indexed.
      destination.document.body.appendChild(destination.document.adoptNode(member));
      parent.innerHTML = '<p class="row">replacement</p>';

      // Then: old snapshots keep their original ordered membership and creation-realm handles.
      expect(first).not.toBe(second);
      expect(first.length).toBe(140);
      expect(second.item(0)).toBe(member);
      expect(first[0]).toBe(member);
      expect(first[0]).toBeInstanceOf(original.HTMLParagraphElement);
      expect(first.item(139)?.textContent).toBe("original");
      expect(document.querySelectorAll(".row").item(0)?.textContent).toBe("replacement");
    } finally {
      original.close();
      destination.close();
    }
  });
});
