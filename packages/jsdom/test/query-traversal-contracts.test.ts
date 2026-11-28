// Preserves ordinary-tree discovery and retained-handle behavior during query traversal optimization.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("DOM query traversal", () => {
  it("matches the current tree after selector coercion moves and edits descendants", () => {
    // Given: converting the selector can synchronously change an already queried root.
    const { window: w } = new JSDOM('<main><i class="match"></i></main><aside><b></b></aside>');
    try {
      const main = w.document.querySelector("main"),
        item = main?.firstElementChild,
        incoming = w.document.querySelector("b");
      if (!main || !item || !incoming) throw new Error("Expected query roots");
      const old = main.querySelectorAll(".match");
      const selector = {
        toString() {
          item.remove();
          incoming.className = "match";
          main.append(incoming);
          return ".match";
        },
      };
      // When/Then: parsing/coercion precedes matching, while the old public list remains static.
      const result: unknown = Reflect.apply(main.querySelectorAll, main, [selector]);
      if (!(result instanceof w.NodeList)) throw new Error("Expected query NodeList");
      expect(result.length).toBe(1);
      expect(result.item(0)).toBe(incoming);
      expect(old.item(0)).toBe(item);
      expect(
        Reflect.apply(main.querySelector, main, [
          {
            toString() {
              incoming.id = "selected";
              return "#selected";
            },
          },
        ]),
      ).toBe(incoming);
    } finally {
      w.close();
    }
  });

  it("finds current class tokens in tree order across private and edited children", () => {
    const markup =
      '<main><i class="nearby"></i>' +
      "<i></i>".repeat(200) +
      '<b id="late" class="far&#9;near">tail</b><template><b class="hidden"></b></template></main>';
    new JSDOM(markup).window.close();
    const { window } = new JSDOM(markup);
    try {
      const doc = window.document;
      const main = doc.querySelector("main");
      const first = main?.querySelector(".nearby");
      const last = main?.querySelector(".near");
      if (!main || !first || !last) throw new Error("Expected both ends of the packed branch");
      expect(last).toBe(doc.getElementById("late"));
      expect(main.querySelector(".hidden")).toBeNull();
      first.className = "far";
      expect(main.querySelector(".far")).toBe(first);
      first.appendChild(doc.createElement("em")).className = "near";
      expect(main.querySelector(".near")).toBe(first.firstElementChild);
      first.remove();
      expect(main.querySelector(".near")).toBe(last);
    } finally {
      window.close();
    }
  });

  it("preserves overlapping snapshot identities and order when original packed siblings move", () => {
    const group = (tag: string) =>
      "<section>" +
      Array.from(
        { length: 256 },
        (_, i) => `<${tag} class="all ${i % 2 ? "odd" : "even"}">${i}</${tag}>`,
      ).join("") +
      "</section>";
    const markup = "<main>" + group("i") + group("b") + "</main>";
    new JSDOM(markup).window.close();
    const { window } = new JSDOM(markup);
    try {
      const doc = window.document;
      const all = doc.querySelectorAll(".all");
      const odd = doc.querySelectorAll(".odd");
      const first = all.item(1);
      const last = all.item(511);
      if (!first || !last) throw new Error("Expected original snapshot members");
      expect(odd.item(0)).toBe(first);
      first.className = "edited";
      last.parentNode?.prepend(last);
      const section = doc.querySelector("section");
      section?.replaceChildren(last);
      expect(all.length).toBe(512);
      expect(all.item(1)).toBe(first);
      expect(odd.item(255)).toBe(last);
      expect(odd.item(253)?.textContent).toBe("251");
      expect(odd.item(122)?.parentNode).toBeNull();
      expect(Array.from(odd)).toEqual(Array.from(all).filter((_, i) => i % 2 === 1));
    } finally {
      window.close();
    }
  });

  it("keeps packed attribute lists independent through public Attr identity and membership edits", () => {
    const markup = '<main><i></i><span data-v="initial">leaf</span></main>';
    new JSDOM(markup).window.close();
    const first = new JSDOM(markup).window;
    const second = new JSDOM(markup).window;
    try {
      const a = first.document.querySelector("span");
      const b = second.document.querySelector("span");
      if (!a || !b) throw new Error("Expected spans from two independent documents");
      const attr = a.getAttributeNode("data-v");
      if (!attr) throw new Error("Expected a public attribute");
      expect(attr).not.toBe(b.getAttributeNode("data-v"));
      attr.value = "edited";
      a.removeAttributeNode(attr);
      a.setAttributeNS("urn:a", "a:key", "value");
      const extra = first.document.createAttribute("title");
      a.setAttributeNode(extra);
      expect(a.getAttributeNames()).toEqual(["a:key", "title"]);
      expect(b.getAttributeNames()).toEqual(["data-v"]);
      expect(b.getAttribute("data-v")).toBe("initial");
      first.document.querySelector("i")?.setAttribute("id", "new");
      expect(second.document.querySelector("i")?.getAttributeNames()).toEqual([]);
    } finally {
      first.close();
      second.close();
    }
  });

  it("retains unread packed snapshot members across subtree adoption and replacement", () => {
    const markup = "<main>" + '<i class="item">row</i>'.repeat(1024) + "</main>";
    // Warm the private parse recipe before creating the independent document under test.
    for (let i = 0; i < 3; i++) new JSDOM(markup).window.close();
    const { window: source } = new JSDOM(markup);
    const { window: target } = new JSDOM();
    try {
      const snapshot = source.document.querySelectorAll(".item");
      const root = source.document.querySelector("main");
      if (!root || !target.document.body) throw new Error("Expected an adoptable parent");
      target.document.body.appendChild(target.document.adoptNode(root));
      const last = root.lastElementChild;
      root.replaceChildren();
      expect(snapshot.length).toBe(1024);
      expect(snapshot.item(1023)).toBe(last);
      expect(snapshot.item(0)?.ownerDocument).toBe(target.document);
      expect(snapshot.item(0)).toBeInstanceOf(source.HTMLElement);
      expect(source.document.querySelectorAll(".item").length).toBe(0);
    } finally {
      source.close();
      target.close();
    }
  });

  it("matches private attributes and topology without invoking replaced public getters", () => {
    // Given: author code can replace public reflection while raw selector state remains unchanged.
    const { window: w } = new JSDOM('<main><i class="match" data-key="yes"></i><b></b></main>');
    try {
      const main = w.document.querySelector("main"),
        item = main?.firstElementChild;
      if (!main || !item) throw new Error("Expected private-state fixture");
      item.getAttribute = () => {
        throw new Error("Public getAttribute must not run");
      };
      Object.defineProperty(item, "children", {
        get() {
          throw new Error("Public children must not run");
        },
      });
      Object.defineProperty(item, "tagName", {
        get() {
          throw new Error("Public tagName must not run");
        },
      });
      // When/Then: ordinary and complex matching both use the actual private tree.
      expect(main.querySelector(".match")).toBe(item);
      expect(main.querySelector('i[data-key="yes"]:first-child')).toBe(item);
      expect([...main.querySelectorAll("i,b")]).toEqual([item, main.lastElementChild]);
    } finally {
      w.close();
    }
  });

  it("preserves deep traversal order without entering shadow or template contents", () => {
    // Given: a deep root and a wide sibling set contain independent hidden trees.
    const { window: w } = new JSDOM(
      "<main>" +
        "<section>".repeat(1024) +
        '<i class="match"></i>' +
        "</section>".repeat(1024) +
        '<b class="match"></b><template><em class="match"></em></template></main>',
    );
    try {
      const main = w.document.querySelector("main");
      if (!main) throw new Error("Expected deep fixture");
      const shadow = main.attachShadow({ mode: "open" });
      shadow.innerHTML = '<strong class="match"></strong>';
      // When/Then: both first/all queries remain in ordinary tree order and exclude hidden roots.
      const found = main.querySelectorAll(".match");
      expect([...found].map((n) => n.localName)).toEqual(["i", "b"]);
      expect(main.querySelector(".match")).toBe(found.item(0));
      expect(shadow.querySelector(".match")?.localName).toBe("strong");
    } finally {
      w.close();
    }
  });
});

describe("Window.close retained document", () => {
  it("rebuilds derived ID and query state without losing retained document or node handles", () => {
    // Given: callers retain the document and nodes after closure releases resources.
    const { window: w } = new JSDOM('<main><i id="dup" class="match"></i><b id="dup"></b></main>');
    const doc = w.document,
      main = doc.querySelector("main"),
      first = main?.firstElementChild,
      second = main?.lastElementChild;
    if (!main || !first || !second) throw new Error("Expected retained document");
    for (let i = 0; i < 8; i++) {
      expect(doc.getElementById("dup")).toBe(first);
      expect(doc.querySelectorAll(".match").item(0)).toBe(first);
    }
    // When/Then: closing can discard derived state; retained records remain current and ordered.
    w.close();
    expect(doc.getElementById("dup")).toBe(first);
    main.prepend(second);
    expect(doc.getElementById("dup")).toBe(second);
    second.id = "changed";
    expect(doc.getElementById("dup")).toBe(first);
    expect(doc.getElementById("changed")).toBe(second);
    expect(doc.querySelectorAll(".match").item(0)).toBe(first);
  });
});

describe("Query cache ownership", () => {
  it("reevaluates retained roots adopted between HTML and XML documents in one Window", () => {
    // Given: cached type matching was produced under an HTML owner.
    const { window: w } = new JSDOM('<main><span class="item"></span></main>');
    try {
      const root = w.document.querySelector("main"),
        node = root?.firstElementChild;
      if (!root || !node) throw new Error("Expected owned subtree");
      const old = root.querySelectorAll("SPAN");
      expect(old.item(0)).toBe(node);
      root.remove();
      for (let i = 0; i < 4; i++) expect(root.querySelectorAll("SPAN").item(0)).toBe(node);
      const xml = w.document.implementation.createDocument(null, "Root", null),
        xmlRoot = xml.documentElement;
      if (!xmlRoot) throw new Error("Expected XML document");
      // When/Then: owner-sensitive matching changes, while the old static result and wrappers remain valid.
      xml.adoptNode(root);
      xmlRoot.append(root);
      expect(root.ownerDocument).toBe(xml);
      expect(root.querySelectorAll("SPAN").length).toBe(0);
      expect(root.querySelectorAll("span").item(0)).toBe(node);
      expect(old.item(0)).toBe(node);
      node.remove();
      expect(root.querySelectorAll(".item").length).toBe(0);
      expect(old.item(0)).toBe(node);
    } finally {
      w.close();
    }
  });
  it("keeps detached-root results fresh after foreign adoption and later removal", () => {
    // Given: the source Window and detached queried root remain alive across adoption.
    const a = new JSDOM('<main><i class="item"></i><b class="item"></b></main>'),
      b = new JSDOM("<aside></aside>");
    try {
      const root = a.window.document.querySelector("main");
      if (!root) throw new Error("Expected detached root");
      root.remove();
      const old = root.querySelectorAll(".item"),
        first = old.item(0);
      if (!first) throw new Error("Expected first item");
      for (let i = 0; i < 4; i++) expect(root.querySelectorAll(".item").length).toBe(2);
      // When/Then: original methods read destination changes without retaining stale membership in results.
      b.window.document.adoptNode(root);
      const body = b.window.document.body;
      if (!body) throw new Error("Expected destination body");
      body.append(root);
      first.remove();
      expect(root.querySelectorAll(".item").length).toBe(1);
      expect(old.length).toBe(2);
      expect(old.item(0)).toBe(first);
      expect(first.parentNode).toBeNull();
    } finally {
      a.window.close();
      b.window.close();
    }
  });
});

describe("Query cache character data", () => {
  it("invalidates empty and relational results when existing Text becomes empty or nonempty", () => {
    // Given: changing character data can change :empty without changing the child list.
    const { window: w } = new JSDOM("<main><p></p></main>");
    try {
      const p = w.document.querySelector("p");
      if (!p) throw new Error("Expected paragraph");
      const text = w.document.createTextNode("");
      p.append(text);
      const old = w.document.querySelectorAll("p:empty");
      expect(old.item(0)).toBe(p);
      expect(w.document.querySelector("main:has(p:empty)")).not.toBeNull();
      // When/Then: both direct and nested static predicates see every zero-length transition.
      text.data = "x";
      expect(w.document.querySelectorAll("p:empty").length).toBe(0);
      expect(w.document.querySelector("main:has(p:empty)")).toBeNull();
      expect(old.item(0)).toBe(p);
      text.replaceData(0, 1, "");
      expect(w.document.querySelectorAll("p:empty").item(0)).toBe(p);
      expect(w.document.querySelector("main:has(p:empty)")).not.toBeNull();
    } finally {
      w.close();
    }
  });
  it("counts nonempty XML CDATA in cached empty matching", () => {
    // Given: CDATA participates in :empty just like Text in the pinned browser contract.
    const { window: w } = new JSDOM("<Root><Item/></Root>", { contentType: "application/xml" });
    try {
      const item = w.document.querySelector("Item");
      if (!item) throw new Error("Expected XML item");
      const data = w.document.createCDATASection("");
      item.append(data);
      expect(w.document.querySelectorAll("Item:empty").item(0)).toBe(item);
      // When/Then: whitespace is nonempty data, and deleting it restores membership.
      data.data = " ";
      expect(w.document.querySelectorAll("Item:empty").length).toBe(0);
      data.deleteData(0, 1);
      expect(w.document.querySelectorAll("Item:empty").item(0)).toBe(item);
    } finally {
      w.close();
    }
  });

  it("answers a cycle of 512 distinct selectors from the current tree across mutations", () => {
    // Given: 256 rows and a warm cycle of 512 distinct id and class selectors.
    const rows = Array.from({ length: 256 }, (_, i) => `<p class="item" id="row${i}"></p>`);
    const { window: w } = new JSDOM(`<main>${rows.join("")}</main>`);
    try {
      const selectors = Array.from({ length: 512 }, (_, i) =>
        i % 2 ? `.extra-${i >> 1}` : `.item#row${i >> 1}`,
      );
      const read = () => selectors.map((selector) => [...w.document.querySelectorAll(selector)]);
      read();
      const before = read();
      const row = (index: number) => w.document.getElementById(`row${index}`);
      // When: one row gains a class, one row loses its id and one row is removed.
      row(3)?.classList.add("extra-3");
      const renamed = row(4);
      renamed?.removeAttribute("id");
      const removed = row(5);
      removed?.remove();
      const after = read();
      // Then: every remembered answer reflects the edits and the other answers are unchanged.
      expect(before[6]?.length).toBe(1);
      expect(before[7]).toEqual([]);
      expect(after[7]).toEqual([row(3)]);
      expect(after[8]).toEqual([]);
      expect(after[10]).toEqual([]);
      expect(renamed).not.toBeNull();
      expect(removed).not.toBeNull();
      const untouched = (_: unknown, i: number) => i !== 7 && i !== 8 && i !== 10;
      expect(after.filter(untouched)).toEqual(before.filter(untouched));
    } finally {
      w.close();
    }
  });
});
