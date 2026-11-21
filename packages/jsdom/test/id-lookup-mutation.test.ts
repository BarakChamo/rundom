// Preserves live ID discovery across mutation, ownership, parsing and reentrant resource cleanup.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("Document.getElementById mutation", () => {
  it("keeps first-ID order in repeated markup when only part of the tree has been opened", () => {
    const markup =
      '<main><template><i id="dup"></i></template>' +
      "<section><b>unused</b></section>".repeat(256) +
      '<aside><p id="dup">first</p></aside><p id="dup">last</p></main>';
    for (let warm = 0; warm < 3; warm++) new JSDOM(markup).window.close();
    const { window } = new JSDOM(markup);
    try {
      const doc = window.document;
      expect(doc.getElementById("missing")).toBeNull();
      const first = doc.getElementById("dup");
      expect(first?.textContent).toBe("first");
      if (!first) throw new Error("Expected first ID");
      first.removeAttribute("id");
      expect(doc.getElementById("dup")?.textContent).toBe("last");
      doc.querySelector("section")?.setAttribute("id", "dup");
      expect(doc.getElementById("dup")?.localName).toBe("section");
    } finally {
      window.close();
    }
  });

  it("retains held ID results when unopened siblings gain competing IDs or materialize after adoption", () => {
    const rows = Array.from({ length: 512 }, (_, i) => '<i id="r' + i + '">' + i + "</i>").join("");
    const markup = "<main>" + rows + "</main>";
    for (let i = 0; i < 3; i++) new JSDOM(markup).window.close();
    const { window: w } = new JSDOM(markup);
    const { window: destination } = new JSDOM();
    try {
      const doc = w.document;
      const original = doc.getElementById("r200");
      const earlier = doc.getElementById("r10");
      if (!original || !earlier || !destination.document.body)
        throw new Error("Expected ID fixtures");
      original.id = "r10";
      expect(doc.getElementById("r10")).toBe(earlier);
      earlier.innerHTML = '<b id="r300"></b>';
      expect(doc.getElementById("r300")).toBe(earlier.firstElementChild);
      destination.document.body.append(destination.document.adoptNode(earlier));
      expect(doc.getElementById("r10")).toBe(original);
      expect(doc.getElementById("r300")?.textContent).toBe("300");
      expect(destination.document.getElementById("r300")).toBe(earlier.firstElementChild);
      expect(original.parentElement?.children[199]).toBe(original);
    } finally {
      destination.close();
      w.close();
    }
  });

  it("forgets detached IDs before resource cleanup reenters a warmed lookup", () => {
    // Given: a resource-owning child is already present in a warmed ID view.
    const { window: w } = new JSDOM('<iframe id="child"></iframe>');
    try {
      const frame = w.document.querySelector("iframe");
      if (!(frame instanceof w.HTMLIFrameElement) || !frame.contentWindow)
        throw new Error("Expected frame Window");
      for (let i = 0; i < 8; i++) expect(w.document.getElementById("child")).toBe(frame);
      const child = frame.contentWindow,
        close = child.close;
      let observed: ReturnType<typeof w.document.getElementById> | undefined;
      child.close = () => {
        observed = w.document.getElementById("child");
        close.call(child);
      };
      // When/Then: cleanup observes the tree after the child has detached.
      frame.remove();
      expect(observed).toBeNull();
      expect(w.document.getElementById("child")).toBeNull();
    } finally {
      w.close();
    }
  });

  it("keeps duplicate order through unrelated writes, reordering, replacement and removal", () => {
    // Given: duplicate IDs are resolved by current ordinary tree order.
    const { window: w } = new JSDOM('<main><i id="dup"></i><b id="dup"></b></main>');
    try {
      const main = w.document.querySelector("main"),
        first = main?.firstElementChild,
        second = main?.lastElementChild;
      if (!main || !first || !second) throw new Error("Expected ID fixture");
      for (let i = 0; i < 12; i++) {
        first.textContent = String(i);
        first.className = `c${i}`;
        second.setAttribute("data-value", String(i));
        expect(w.document.getElementById("dup")).toBe(first);
        expect(w.document.getElementById("missing")).toBeNull();
      }
      // When/Then: topology edits change the winner without changing an old wrapper's identity.
      main.prepend(second);
      expect(w.document.getElementById("dup")).toBe(second);
      const replacement = w.document.createElement("p");
      replacement.id = "dup";
      second.replaceWith(replacement);
      expect(w.document.getElementById("dup")).toBe(replacement);
      replacement.remove();
      expect(w.document.getElementById("dup")).toBe(first);
      main.textContent = "empty";
      expect(w.document.getElementById("dup")).toBeNull();
    } finally {
      w.close();
    }
  });

  it("tracks Attr replacement, namespace removal and empty IDs", () => {
    // Given: all attribute surfaces must update the same no-namespace ID.
    const { window: w } = new JSDOM('<p id="old"></p>');
    try {
      const p = w.document.querySelector("p");
      if (!p) throw new Error("Expected paragraph");
      for (let i = 0; i < 8; i++) expect(w.document.getElementById("old")).toBe(p);
      // When/Then: namespaced IDs do not replace the ordinary ID; Attr edits do.
      p.setAttributeNS("urn:test", "t:id", "foreign");
      expect(w.document.getElementById("foreign")).toBeNull();
      const attr = p.getAttributeNode("id");
      if (!attr) throw new Error("Expected ID attribute");
      attr.value = "new";
      expect(w.document.getElementById("old")).toBeNull();
      expect(w.document.getElementById("new")).toBe(p);
      const next = w.document.createAttribute("id");
      next.value = "next";
      p.setAttributeNode(next);
      expect(w.document.getElementById("new")).toBeNull();
      expect(w.document.getElementById("next")).toBe(p);
      p.removeAttributeNS(null, "id");
      expect(w.document.getElementById("next")).toBeNull();
      p.id = "";
      expect(w.document.getElementById("")).toBeNull();
    } finally {
      w.close();
    }
  });

  it("isolates shadow, template and detached fragment roots", () => {
    // Given: ordinary document lookup excludes shadow/template/detached descendants.
    const { window: w } = new JSDOM('<main></main><template><p id="hidden"></p></template>');
    try {
      const host = w.document.querySelector("main"),
        template = w.document.querySelector("template");
      if (!host || !(template instanceof w.HTMLTemplateElement))
        throw new Error("Expected root fixtures");
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = '<i id="hidden"></i>';
      const fragment = w.document.createDocumentFragment(),
        item = w.document.createElement("b");
      item.id = "hidden";
      fragment.append(item);
      // When/Then: moving the same node changes membership only in the affected ordinary roots.
      for (let i = 0; i < 8; i++) expect(w.document.getElementById("hidden")).toBeNull();
      expect(shadow.getElementById("hidden")?.localName).toBe("i");
      expect(template.content.getElementById("hidden")?.localName).toBe("p");
      expect(fragment.getElementById("hidden")).toBe(item);
      host.append(fragment);
      expect(w.document.getElementById("hidden")).toBe(item);
      expect(fragment.getElementById("hidden")).toBeNull();
      item.remove();
      expect(w.document.getElementById("hidden")).toBeNull();
    } finally {
      w.close();
    }
  });

  it("follows adoption and edits through original foreign wrappers", () => {
    // Given: a warmed lookup can be mutated through the node's original Window interfaces.
    const a = new JSDOM('<main><p id="move"></p></main>'),
      b = new JSDOM("<main></main>");
    try {
      const item = a.window.document.getElementById("move");
      if (!item) throw new Error("Expected moving node");
      for (let i = 0; i < 8; i++) {
        expect(a.window.document.getElementById("move")).toBe(item);
        expect(b.window.document.getElementById("move")).toBeNull();
      }
      // When/Then: both documents and borrowed operations agree after each ownership change.
      const aBody = a.window.document.body,
        bBody = b.window.document.body;
      if (!aBody || !bBody) throw new Error("Expected document bodies");
      bBody.append(item);
      expect(a.window.document.getElementById("move")).toBeNull();
      for (let i = 0; i < 8; i++) expect(b.window.document.getElementById("move")).toBe(item);
      item.textContent = "changed";
      item.id = "renamed";
      expect(b.window.document.getElementById("move")).toBeNull();
      expect(b.window.document.getElementById("renamed")).toBe(item);
      expect(a.window.Document.prototype.getElementById.call(b.window.document, "renamed")).toBe(
        item,
      );
      aBody.append(item);
      expect(b.window.document.getElementById("renamed")).toBeNull();
      expect(a.window.document.getElementById("renamed")).toBe(item);
    } finally {
      a.window.close();
      b.window.close();
    }
  });

  it("discovers parser insertions across script and document-write boundaries", () => {
    // Given: author script can warm lookup while parsing is still inserting ordinary descendants.
    const dom = new JSDOM(
      '<p id="first"></p><script>for(let i=0;i<8;i++) document.getElementById("later"); document.write("<b id=later></b>");</script><i id="last"></i>',
      { runScripts: "dangerously" },
    );
    try {
      const w = dom.window;
      // When/Then: parser insertions and a new explicit write stream remain discoverable.
      expect(w.document.getElementById("later")?.localName).toBe("b");
      expect(w.document.getElementById("last")?.localName).toBe("i");
      w.document.open();
      w.document.write('<main id="stream">');
      for (let i = 0; i < 8; i++) expect(w.document.getElementById("tail")).toBeNull();
      w.document.write('<p id="tail"></p></main>');
      w.document.close();
      expect(w.document.getElementById("stream")?.localName).toBe("main");
      expect(w.document.getElementById("tail")?.localName).toBe("p");
      expect(w.document.getElementById("first")).toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it("preserves case-sensitive IDs and duplicates in XML documents", () => {
    // Given: XML retains case-sensitive no-namespace ID values.
    const { window: w } = new JSDOM('<Root><Item id="A"/><Item id="A"/><Item id="a"/></Root>', {
      contentType: "application/xml",
    });
    try {
      const root = w.document.documentElement;
      if (!root) throw new Error("Expected XML root");
      const [first, second, lower] = [...root.children];
      if (!first || !second || !lower) throw new Error("Expected XML members");
      for (let i = 0; i < 8; i++) {
        expect(w.document.getElementById("A")).toBe(first);
        expect(w.document.getElementById("a")).toBe(lower);
      }
      // When/Then: unrelated text and later reorder preserve the exact current winner.
      first.textContent = "text";
      expect(w.document.getElementById("A")).toBe(first);
      root.prepend(second);
      expect(w.document.getElementById("A")).toBe(second);
      second.id = "B";
      expect(w.document.getElementById("A")).toBe(first);
      expect(w.document.getElementById("B")).toBe(second);
    } finally {
      w.close();
    }
  });
  it("updates overlapping IDs when an entire subtree moves around duplicate siblings", () => {
    // Given: a subtree contains both unique IDs and IDs shared with following siblings.
    const { window: w } = new JSDOM(
      '<main><section><i id="dup"></i><b id="inside"></b></section><p id="dup"></p></main>',
    );
    try {
      const main = w.document.querySelector("main"),
        section = main?.firstElementChild,
        p = main?.lastElementChild;
      const inner = section?.firstElementChild,
        unique = section?.lastElementChild;
      if (!main || !section || !p || !inner || !unique) throw new Error("Expected subtree IDs");
      for (let i = 0; i < 8; i++) {
        expect(w.document.getElementById("dup")).toBe(inner);
        expect(w.document.getElementById("inside")).toBe(unique);
      }
      // When/Then: moving an ancestor updates every affected ID's first ordinary-tree match.
      main.append(section);
      expect(w.document.getElementById("dup")).toBe(p);
      expect(w.document.getElementById("inside")).toBe(unique);
      section.remove();
      expect(w.document.getElementById("inside")).toBeNull();
      expect(w.document.getElementById("dup")).toBe(p);
      main.prepend(section);
      expect(w.document.getElementById("dup")).toBe(inner);
      inner.id = "inside";
      expect(w.document.getElementById("dup")).toBe(p);
      expect(w.document.getElementById("inside")).toBe(inner);
      inner.removeAttribute("id");
      expect(w.document.getElementById("inside")).toBe(unique);
    } finally {
      w.close();
    }
  });

  it("keeps all IDs fresh after a large batch of renames and fragment insertions", () => {
    // Given: a render transaction changes hundreds of ID keys before reading any results.
    const { window: w } = new JSDOM(
      "<main>" + Array.from({ length: 300 }, (_, i) => `<p id="old${i}"></p>`).join("") + "</main>",
    );
    try {
      const main = w.document.querySelector("main");
      if (!main) throw new Error("Expected long list");
      const rows = [...main.children];
      for (let i = 0; i < 8; i++) expect(w.document.getElementById("old299")).toBe(rows[299]);
      // When/Then: bounded invalidation may lose warmth but never a rename or new subtree ID.
      for (const [i, row] of rows.entries()) row.id = `new${i}`;
      const fragment = w.document.createDocumentFragment();
      for (let i = 0; i < 300; i++) {
        const p = w.document.createElement("p");
        p.id = `extra${i}`;
        fragment.append(p);
      }
      main.append(fragment);
      for (let i = 0; i < 300; i++) {
        expect(w.document.getElementById(`old${i}`)).toBeNull();
        expect(w.document.getElementById(`new${i}`)).toBe(rows[i]);
        expect(w.document.getElementById(`extra${i}`)?.parentNode).toBe(main);
      }
    } finally {
      w.close();
    }
  });
  it("does not retain a lookup refreshed by cleanup during child replacement", () => {
    // Given: closing a child Window can reenter lookup during a replacement transaction.
    const { window: w } = new JSDOM('<iframe id="child"></iframe>');
    try {
      const frame = w.document.querySelector("iframe"),
        body = w.document.body;
      if (!(frame instanceof w.HTMLIFrameElement) || !frame.contentWindow || !body)
        throw new Error("Expected child Window");
      for (let i = 0; i < 8; i++) expect(w.document.getElementById("child")).toBe(frame);
      const child = frame.contentWindow,
        close = child.close;
      child.close = () => {
        for (let i = 0; i < 8; i++) w.document.getElementById("child");
        close.call(child);
      };
      // When/Then: the completed replacement wins over any intermediate cleanup lookup.
      body.replaceChildren();
      expect(w.document.getElementById("child")).toBeNull();
    } finally {
      w.close();
    }
  });
  it("forgets old IDs when cleanup adopts and renames a replaced frame", () => {
    // Given: resource cleanup can rebuild the old index before moving the removed node to another owner.
    const a = new JSDOM('<iframe id="child"></iframe>'),
      b = new JSDOM("<main></main>");
    try {
      const frame = a.window.document.querySelector("iframe"),
        body = a.window.document.body;
      if (!(frame instanceof a.window.HTMLIFrameElement) || !frame.contentWindow || !body)
        throw new Error("Expected frame");
      for (let i = 0; i < 8; i++) expect(a.window.document.getElementById("child")).toBe(frame);
      const child = frame.contentWindow,
        close = child.close;
      child.close = () => {
        for (let i = 0; i < 8; i++) a.window.document.getElementById("child");
        b.window.document.adoptNode(frame);
        frame.id = "foreign";
        close.call(child);
      };
      // When/Then: no original key can retain a renamed foreign member after the transaction completes.
      body.replaceChildren();
      expect(frame.ownerDocument).toBe(b.window.document);
      expect(a.window.document.getElementById("child")).toBeNull();
      expect(a.window.document.getElementById("foreign")).toBeNull();
    } finally {
      a.window.close();
      b.window.close();
    }
  });
});

describe("Element.innerHTML replacement", () => {
  it("uses the final parser tree for warmed ID and named lookups", () => {
    // Given: both lookups were warmed before a fragment replacement.
    const { window } = new JSDOM('<main><img name="named" id="repeat"></main><p id="repeat"></p>');
    try {
      const { document } = window;
      const target = document.querySelector("main");
      if (!target) throw new Error("Expected replacement target");
      const removed = target.firstElementChild;
      for (let index = 0; index < 8; index++) {
        expect(document.getElementById("repeat")).toBe(removed);
        expect(Reflect.get(document, "named")).toBe(removed);
        expect(document.getElementById("absent")).toBe(null);
      }

      // When: the parser foster-parents markup and puts another copy in inert template content.
      target.innerHTML =
        '<table><img name="named" id="repeat"><tr><td>row</td></tr></table>' +
        '<template><img name="named" id="repeat"></template>';

      // Then: references resolve to the new ordinary-tree node in final order.
      expect(target.firstElementChild?.tagName).toBe("IMG");
      expect(document.getElementById("repeat")).toBe(target.firstElementChild);
      expect(Reflect.get(document, "named")).toBe(target.firstElementChild);
      expect(removed?.parentNode).toBe(null);

      target.innerHTML = "<span>plain</span>";
      expect(document.getElementById("repeat")).toBe(document.querySelector("body > p"));
      expect(Reflect.get(document, "named")).toBeUndefined();
    } finally {
      window.close();
    }
  });
});

describe("Indexed ID replacement", () => {
  it("keeps first-in-tree order when replacing a winner with the same ID", () => {
    // Given: the document has a warmed ID index and two members with the same key.
    const { window } = new JSDOM(
      '<main><p id="same"></p><b id="same"></b></main><aside id="other"></aside>',
    );
    try {
      const { document } = window;
      const target = document.querySelector("main");
      const first = target?.firstElementChild;
      const second = target?.lastElementChild;
      if (!target || !first || !second) throw new Error("Expected duplicate ID fixture");
      for (let index = 0; index < 8; index++) {
        expect(document.getElementById("same")).toBe(first);
        expect(document.getElementById("absent")).toBeNull();
      }

      // When: a fresh same-key element takes the first member's exact position.
      const replacement = document.createElement("em");
      replacement.id = "same";
      target.replaceChild(replacement, first);

      // Then: the index follows the slot and still repairs later order changes.
      expect(document.getElementById("same")).toBe(replacement);
      target.appendChild(replacement);
      expect(document.getElementById("same")).toBe(second);
      expect(document.getElementById("other")).toBe(document.querySelector("aside"));
    } finally {
      window.close();
    }
  });
});
