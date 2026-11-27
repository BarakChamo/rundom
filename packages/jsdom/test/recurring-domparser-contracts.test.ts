// Pins independent public documents when inert parser entry points receive identical markup repeatedly.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

const markup =
  '<!doctype html><html><head><title>Shell</title></head><body><main id="root" class="a b">' +
  '<p id="row" data-n="1">first <b>bold</b></p><p id="lone">text</p>' +
  '<template><span id="inner">t</span></template><script>window.ran = (window.ran || 0) + 1;</script>' +
  "</main></body></html>";

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name DOMParser with recurring markup", ({ Constructor }) => {
  it("returns independent documents whose attributes, text, topology and ids do not leak", () => {
    // Given: one Window parses identical markup repeatedly, editing every earlier document.
    const { window } = new Constructor("", { runScripts: "dangerously" });
    try {
      const parser = new window.DOMParser();
      const seen = new Set<unknown>();
      for (let round = 0; round < 4; round++) {
        // When: the same markup is parsed again after the previous result was edited.
        const document = parser.parseFromString(markup, "text/html");
        // Then: the new document has the original source state and fresh identities.
        expect(seen.has(document)).toBe(false);
        seen.add(document);
        expect(document.contentType).toBe("text/html");
        expect(document.URL).toBe("about:blank");
        expect(document.readyState).toBe("complete");
        expect(document.title).toBe("Shell");
        const row = document.getElementById("row");
        const lone = document.getElementById("lone");
        const root = document.getElementById("root");
        if (!row || !lone || !root) throw new Error("Expected parsed ids");
        expect(row.ownerDocument).toBe(document);
        expect(row.getAttribute("data-n")).toBe("1");
        expect(row.textContent).toBe("first bold");
        expect(lone.textContent).toBe("text");
        expect(root.className).toBe("a b");
        expect(root.children.length).toBe(4);
        expect(document.getElementById("moved")).toBe(null);
        expect(document.getElementById("renamed")).toBe(null);
        const template = document.querySelector("template");
        if (!(template instanceof window.HTMLTemplateElement)) throw new Error("Expected template");
        expect(template.content.firstElementChild?.id).toBe("inner");
        expect(template.content.firstElementChild?.textContent).toBe("t");
        expect(seen.has(row)).toBe(false);
        seen.add(row);

        // Edit attributes (including through a public Attr), text, topology and ids.
        const attr = row.getAttributeNode("data-n");
        if (!attr) throw new Error("Expected attribute node");
        attr.value = "edited";
        root.classList.add("c");
        lone.textContent = "changed";
        row.querySelector("b")?.remove();
        lone.id = "renamed";
        root.append(document.createElement("aside"));
        document.body?.append(Object.assign(document.createElement("div"), { id: "moved" }));
        template.content.firstElementChild?.setAttribute("id", "edited");
        expect(document.getElementById("renamed")).toBe(lone);
        expect(row.getAttribute("data-n")).toBe("edited");
      }
      // Then: scripts from DOMParser documents never ran, even after insertion into a scripting Window.
      const script = parser.parseFromString(markup, "text/html").querySelector("script");
      if (!script) throw new Error("Expected parsed script");
      window.document.body?.append(window.document.adoptNode(script));
      expect(Reflect.get(window, "ran")).toBe(undefined);
    } finally {
      window.close();
    }
  });

  it("keeps form owners and details state in recurring documents", () => {
    // Given: markup whose parser attaches form owners and open details elements.
    const source =
      '<form id="f"><table><tr><td><input id="i"></td></tr></table></form><details open><summary>s</summary>d</details>';
    const { window } = new Constructor("");
    try {
      const parser = new window.DOMParser();
      for (let round = 0; round < 3; round++) {
        // When: the same markup is parsed repeatedly.
        const document = parser.parseFromString(source, "text/html");
        const input = document.getElementById("i");
        if (!(input instanceof window.HTMLInputElement)) throw new Error("Expected input");
        // Then: each parse keeps its own parser-associated form owner and details state.
        expect(input.form).toBe(document.getElementById("f"));
        expect(document.querySelector("details")?.hasAttribute("open")).toBe(true);
        document.querySelector("details")?.removeAttribute("open");
      }
    } finally {
      window.close();
    }
  });

  it("exposes named document properties for parsed and later inserted elements", () => {
    // Given: recurring markup with and without document-named elements.
    const { window } = new Constructor("");
    try {
      const parser = new window.DOMParser();
      for (let round = 0; round < 3; round++) {
        const plain = parser.parseFromString(markup, "text/html");
        const named = parser.parseFromString('<form name="f"></form><img name="i">', "text/html");
        // When: a named element is read from the parse, or inserted after the first property read.
        // Then: both documents expose exactly their current named elements.
        expect(Reflect.get(named, "f")).toBe(named.querySelector("form"));
        expect(Reflect.get(named, "i")).toBe(named.querySelector("img"));
        expect(Reflect.get(plain, "late")).toBe(undefined);
        expect("late" in plain).toBe(false);
        const image = plain.createElement("img");
        image.setAttribute("name", "late");
        plain.body?.append(image);
        expect(Reflect.get(plain, "late")).toBe(image);
        image.remove();
        expect(Reflect.get(plain, "late")).toBe(undefined);
      }
    } finally {
      window.close();
    }
  });

  it("keeps Window documents and DOMParser documents of the same markup independent", () => {
    // Given: identical markup alternates between Window construction and DOMParser, including over-limit input.
    const huge = `<main>${"<i></i>".repeat(33000)}</main>`;
    const { window } = new Constructor("");
    try {
      const parser = new window.DOMParser();
      for (let round = 0; round < 3; round++) {
        // When: each result is edited before the other entry point parses the same markup.
        const dom = new Constructor(markup);
        const parsed = parser.parseFromString(markup, "text/html");
        const fromWindow = dom.window.document.getElementById("row");
        const fromParser = parsed.getElementById("row");
        // Then: neither entry point observes the other's edits or identities.
        expect(fromWindow?.getAttribute("data-n")).toBe("1");
        expect(fromParser?.getAttribute("data-n")).toBe("1");
        expect(fromParser?.ownerDocument).toBe(parsed);
        fromWindow?.setAttribute("data-n", "window");
        fromParser?.replaceChildren("parser");
        expect(fromWindow?.textContent).toBe("first bold");
        dom.window.close();
      }
      // Then: repeated input beyond the private template node limit still parses completely.
      for (let round = 0; round < 2; round++)
        expect(
          parser.parseFromString(huge, "text/html").body?.firstElementChild?.childElementCount,
        ).toBe(33000);
    } finally {
      window.close();
    }
  });
});

describe("RunDOM Document.parseHTMLUnsafe with recurring markup", () => {
  it("returns independent documents and still attaches declarative shadow roots", () => {
    // Given: identical markup parsed repeatedly, with and without declarative shadow roots.
    const { window } = new JSDOM("");
    try {
      const shadow = '<div id="host"><template shadowrootmode="open"><b>s</b></template></div>';
      for (let round = 0; round < 3; round++) {
        // When: each result is edited before the next parse.
        const document = window.Document.parseHTMLUnsafe(markup);
        // Then: each document starts from the source state.
        expect(document.getElementById("row")?.getAttribute("data-n")).toBe("1");
        expect(document.getElementById("lone")?.textContent).toBe("text");
        document.getElementById("row")?.setAttribute("data-n", "edited");
        document.getElementById("lone")?.append("more");
        const host = window.Document.parseHTMLUnsafe(shadow).getElementById("host");
        expect(host?.shadowRoot?.innerHTML).toBe("<b>s</b>");
      }
    } finally {
      window.close();
    }
  });
});
