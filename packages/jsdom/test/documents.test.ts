// Exercises detached documents, ownership, and document child constraints.
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

describe("DOM document creation", () => {
  it("keeps document image, script, and embed collections live and namespace-aware", () => {
    const { window } = new JSDOM(
      '<img id="picture"><template><img></template><script></script><embed id="media">',
    );
    try {
      const { document } = window;
      const body = document.body;
      if (!body) throw new Error("Expected a body");
      const { images, scripts, embeds, plugins, applets } = document;
      expect(images.namedItem("picture")).toBe(document.getElementById("picture"));
      expect([images.length, scripts.length, embeds.length, applets.length]).toEqual([1, 1, 1, 0]);
      expect(plugins).toBe(embeds);
      const enumerable: string[] = [];
      for (const property in images) enumerable.push(property);
      expect(enumerable.sort()).toEqual(["0", "item", "length", "namedItem"]);
      body.appendChild(document.createElementNS("urn:test", "img"));
      body.appendChild(document.createElement("img"));
      body.appendChild(document.createElement("script"));
      body.appendChild(document.createElement("applet"));
      expect(document.images).toBe(images);
      expect([images.length, scripts.length, applets.length]).toEqual([2, 2, 0]);
      embeds.item(0)?.remove();
      expect(plugins.length).toBe(0);
    } finally {
      window.close();
    }
  });

  it("updates live image-map and document link collections through edits and adoption", () => {
    const { window: first } = new JSDOM(
      '<map name="old"><div><area id="first" href="/one"></div></map><a name="mark"></a>',
    );
    const { window: second } = new JSDOM();
    try {
      const map = first.document.querySelector("map");
      if (!(map instanceof first.HTMLMapElement)) throw new Error("Expected map");
      map.name = "regions";
      expect(map.getAttribute("name")).toBe("regions");
      const areas = map.areas;
      const area = areas.namedItem("first");
      const links = first.document.links;
      expect(links.item(0)).toBe(area);
      expect(first.document.anchors.length).toBe(1);
      area?.removeAttribute("href");
      expect(links.length).toBe(0);
      area?.setAttribute("href", "/two");
      expect(links.length).toBe(1);
      second.document.adoptNode(map);
      second.document.body?.appendChild(map);
      expect(links.length).toBe(0);
      expect(second.document.links.item(0)).toBe(area);
      const added = second.document.createElement("area");
      map.appendChild(added);
      expect(map.areas).toBe(areas);
      expect(areas.item(1)).toBe(added);
    } finally {
      first.close();
      second.close();
    }
  });

  it("keeps optgroups in place when a select is resized and replaces options in their parent", () => {
    const { window } = new JSDOM(
      "<select><option>A</option><optgroup><option>B</option></optgroup></select>",
    );
    try {
      const select = window.document.querySelector("select");
      const group = window.document.querySelector("optgroup");
      if (!(select instanceof window.HTMLSelectElement)) throw new Error("Expected a select");
      const replacement = new window.Option("C");
      select.options[1] = replacement;
      expect(replacement.parentNode).toBe(group);
      select.length = 100_001;
      expect(select.length).toBe(2);
      select.options.length = 1;
      expect(replacement.parentNode).toBeNull();
      expect(group?.parentNode).toBe(select);
      expect(select.length).toBe(1);
    } finally {
      window.close();
    }
  });

  it("keeps existing table collections live when their owner document changes", () => {
    const { window: first } = new JSDOM("<table><tr><td>first</td></tr></table>");
    const { window: second } = new JSDOM();
    try {
      const table = first.document.querySelector("table");
      if (!(table instanceof first.HTMLTableElement)) throw new Error("Expected a table");
      const rows = table.rows;
      const row = rows.item(0);
      if (!(row instanceof first.HTMLTableRowElement)) throw new Error("Expected a row");
      const cells = row.cells;
      expect([rows.length, cells.length]).toEqual([1, 1]);
      second.document.adoptNode(table);
      second.document.body?.appendChild(table);
      const cell = row.insertCell();
      const newRow = table.insertRow();
      expect(rows.item(1)).toBe(newRow);
      expect(cells.item(1)).toBe(cell);
      expect(cell.ownerDocument).toBe(second.document);
      cell.remove();
      newRow.remove();
      expect([rows.length, cells.length]).toEqual([1, 1]);
    } finally {
      first.close();
      second.close();
    }
  });

  it("accepts an undefined insertBefore reference from an empty child list", () => {
    const { window } = new JSDOM();
    try {
      const { document } = window;
      const head = document.head;
      if (!head) throw new Error("Expected a head element");
      const child = document.createElement("meta");
      expect(() => Reflect.apply(head.insertBefore, head, [child])).toThrow(TypeError);
      expect(head.insertBefore(child, head.childNodes[0])).toBe(child);
      expect(head.firstChild).toBe(child);
    } finally {
      window.close();
    }
  });

  it("keeps repeated document ID lookups in tree order after moves and attribute changes", () => {
    const { window } = new JSDOM('<p id="duplicate"></p><p id="duplicate"></p>');
    try {
      const { document } = window;
      const [first, second] = document.querySelectorAll("p");
      const body = document.body;
      const root = document.documentElement;
      if (!first || !second || !body || !root) throw new Error("Expected fixture nodes");
      const warmLookups = (expected: typeof first) => {
        for (let index = 0; index < 8; index++) {
          expect(document.getElementById("duplicate")).toBe(expected);
        }
      };
      warmLookups(first);
      body.insertBefore(second, first);
      warmLookups(second);
      const id = second.getAttributeNode("id");
      if (!id) throw new Error("Expected ID attribute");
      id.value = "renamed";
      expect(document.getElementById("renamed")).toBe(second);
      warmLookups(first);
      first.remove();
      expect(document.getElementById("duplicate")).toBeNull();
      root.innerHTML = '<head></head><body><b id="duplicate"></b></body>';
      expect(document.getElementById("duplicate")?.localName).toBe("b");
    } finally {
      window.close();
    }
  });

  it("finds the first matching ID within the fragment or shadow tree", () => {
    // Given: identical IDs in the document and in two independent fragments.
    const { window } = new JSDOM('<main id="match"></main>');
    try {
      const { document } = window;
      const host = document.querySelector("main");
      if (!host) throw new Error("Expected a host");
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = '<span id="match"></span>';
      const fragment = document.createDocumentFragment();
      const first = document.createElement("b");
      const second = document.createElement("i");
      first.id = second.id = "match";
      fragment.append(first, second);

      // When: each scope looks up the same ID, including after a removal.
      expect(fragment.getElementById("match")).toBe(first);
      first.remove();

      // Then: lookup follows current tree order without crossing scope boundaries.
      expect(fragment.getElementById("match")).toBe(second);
      expect(shadow.getElementById("match")).toBe(shadow.firstElementChild);
      expect(document.getElementById("match")).toBe(host);
      expect(fragment.getElementById("")).toBeNull();
    } finally {
      window.close();
    }
  });

  it("creates a detached XML document and adopts same-realm children on insertion", () => {
    // Given: an XML document and CDATA created in the active Window.
    const { window } = new JSDOM("<p></p>");
    try {
      const xml = new window.Document();
      const section = xml.createCDATASection("data");
      const paragraph = window.document.querySelector("p");
      if (!paragraph) throw new Error("Expected a paragraph");

      // When: the section is inserted into the active document and then removed.
      expect(section.ownerDocument === xml).toBe(true);
      paragraph.appendChild(section);
      paragraph.removeChild(section);

      // Then: the node keeps its identity and its updated owner document.
      expect(xml.defaultView).toBeNull();
      expect(xml.location).toBeNull();
      expect(xml.nodeType).toBe(window.Node.DOCUMENT_NODE);
      expect(xml.nodeType).toBe(xml.DOCUMENT_NODE);
      expect(xml.contentType).toBe("application/xml");
      expect(section instanceof window.CDATASection).toBe(true);
      expect(section.ownerDocument === window.document).toBe(true);
    } finally {
      window.close();
    }
  });

  it("creates HTML and XML documents with valid child ordering", () => {
    // Given: a same-realm implementation and a detached doctype.
    const { window } = new JSDOM("");
    try {
      const implementation = window.document.implementation;
      const doctype = implementation.createDocumentType("root", "", "example.dtd");

      // When: the implementation creates documents.
      const html = implementation.createHTMLDocument("<safe>");
      const xml = implementation.createDocument("urn:x", "x:root", doctype);

      // Then: their trees are independent and reject invalid children before moving them.
      expect(html.documentElement instanceof window.HTMLHtmlElement).toBe(true);
      expect(html.head instanceof window.HTMLHeadElement).toBe(true);
      expect(html.head?.querySelector("title") instanceof window.HTMLTitleElement).toBe(true);
      expect(html.body instanceof window.HTMLBodyElement).toBe(true);
      expect(html.head?.querySelector("title")?.textContent).toBe("<safe>");
      expect(html.body?.ownerDocument === html).toBe(true);
      expect(xml instanceof window.XMLDocument).toBe(true);
      expect(xml.doctype === doctype).toBe(true);
      expect(doctype.ownerDocument === xml).toBe(true);
      expect(xml.documentElement?.prefix).toBe("x");
      expect(() => xml.appendChild(html.createElement("div"))).toThrow("Invalid document children");
      expect(xml.documentElement?.nodeName).toBe("x:root");
    } finally {
      window.close();
    }
  });
});

it("adopts a subtree across Windows without replacing its wrappers", () => {
  // Given: a source subtree and an empty destination document.
  const source = new JSDOM("<main><span>original</span></main>");
  const target = new JSDOM("");
  try {
    const root = source.window.document.querySelector("main");
    const child = root?.firstElementChild;
    const body = target.window.document.body;
    if (!root || !child || !body) throw new Error("Expected fixture elements");
    const observer = new target.window.MutationObserver(() => {});
    observer.observe(body, { childList: true, attributes: true, subtree: true });

    // When: the destination inserts the source node and its original wrapper removes a child.
    body.appendChild(root);
    root.removeChild(child);
    root.setAttribute("id", "adopted");
    const detached = source.window.document.createElement("div");
    expect(target.window.document.adoptNode(detached) === detached).toBe(true);
    expect(detached.ownerDocument === target.window.document).toBe(true);

    // Then: identity and prototypes survive, ownership moves, and mutations are observed there.
    expect(body.firstChild === root).toBe(true);
    expect(root instanceof source.window.Element).toBe(true);
    expect(root.ownerDocument === target.window.document).toBe(true);
    expect(child.ownerDocument === target.window.document).toBe(true);
    expect(source.window.document.querySelector("main")).toBeNull();
    expect(observer.takeRecords().map((record) => record.type)).toEqual([
      "childList",
      "childList",
      "attributes",
    ]);
    expect(target.window.document.getElementById("adopted") === root).toBe(true);
  } finally {
    source.window.close();
    target.window.close();
  }
});

it("parses inert HTML and reports malformed XML as a parsererror document", () => {
  const { window } = new JSDOM("", { url: "https://example.test/page", runScripts: "dangerously" });
  try {
    const parser = new window.DOMParser();
    const html = parser.parseFromString(
      '<base href="/assets/"><p>hello</p><a href="child">link</a><script>document.body.id = "ran"</script>',
      "text/html",
    );
    expect(html.URL).toBe(window.document.URL);
    expect(html.defaultView).toBeNull();
    const link = html.querySelector("a");
    expect(link instanceof window.HTMLAnchorElement && link.href).toBe(
      "https://example.test/assets/child",
    );
    expect(html.querySelector("p")).toBeInstanceOf(window.HTMLParagraphElement);
    const script = html.querySelector("script");
    if (!script) throw new Error("Expected parsed script");
    window.document.body?.appendChild(window.document.importNode(script, true));
    expect(window.document.body?.id).toBe("");
    const xml = parser.parseFromString("<unclosed>", "application/xml");
    expect(xml.documentElement?.namespaceURI).toBe(
      "http://www.mozilla.org/newlayout/xml/parsererror.xml",
    );
    expect(xml.documentElement?.localName).toBe("parsererror");
    expect(xml).not.toBeInstanceOf(window.XMLDocument);
  } finally {
    window.close();
  }
});

it("serializes XML subtrees with standalone namespace bindings", () => {
  const { window } = new JSDOM("");
  try {
    const parser = new window.DOMParser();
    const source = parser.parseFromString(
      '<root xmlns:p="urn:outer"><p:child p:flag="yes"/></root>',
      "application/xml",
    );
    const child = source.documentElement?.firstChild;
    if (!child) throw new Error("Expected an XML subtree");
    const serializer = new window.XMLSerializer();
    expect(serializer.serializeToString(child)).toBe('<p:child xmlns:p="urn:outer" p:flag="yes"/>');
    expect(serializer.serializeToString(window.document.createElement("br"))).toBe(
      '<br xmlns="http://www.w3.org/1999/xhtml" />',
    );
    expect(serializer.serializeToString(source)).toBe(
      '<root xmlns:p="urn:outer"><p:child p:flag="yes"/></root>',
    );
  } finally {
    window.close();
  }
});

it("replaces a document element atomically and reports one child-list mutation", () => {
  const { window } = new JSDOM("");
  try {
    const document = new window.DOMParser().parseFromString("<old/>", "application/xml");
    const old = document.documentElement;
    if (!old) throw new Error("Expected document root");
    const replacement = document.createElement("new");
    const observer = new window.MutationObserver(() => {});
    observer.observe(document, { childList: true });
    expect(document.replaceChild(replacement, old)).toBe(old);
    expect(document.documentElement).toBe(replacement);
    const [mutation, ...remaining] = observer.takeRecords();
    expect(remaining).toHaveLength(0);
    expect(mutation?.addedNodes[0]).toBe(replacement);
    expect(mutation?.removedNodes[0]).toBe(old);
  } finally {
    window.close();
  }
});
