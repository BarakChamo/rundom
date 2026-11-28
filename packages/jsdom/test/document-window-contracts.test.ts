// Pins legacy Document properties, factory realms, and Window global member contracts.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = require("jsdom");

describe("Window lifecycle receivers", () => {
  it("exposes name as a writable DOMString attribute", () => {
    // Given: the global attribute required by the Window Web IDL contract.
    const { window: w } = new JSDOM();
    try {
      // When: a non-string value is assigned through its accessor.
      expect(typeof Object.getOwnPropertyDescriptor(w, "name")?.get).toBe("function");
      expect(Reflect.set(w, "name", 42)).toBe(true);
      // Then: the public value is converted to DOMString.
      expect(w.name).toBe("42");
    } finally {
      w.close();
    }
  });
  it("rejects unrelated close/stop receivers without destroying descendant contexts", () => {
    // Given: a live child browsing context and unrelated operation receivers.
    const { window: w } = new JSDOM("<iframe></iframe>");
    try {
      const frame = w.document.querySelector("iframe");
      if (!(frame instanceof w.HTMLIFrameElement)) throw new Error("Expected an iframe");
      const original = frame.contentDocument;
      // When: an operation is called with an invalid receiver.
      expect(() => Reflect.apply(w.close, {}, [])).toThrow("Expected a Window");
      expect(() => Reflect.apply(w.stop, {}, [])).toThrow("Expected a Window");
      // Then: rejecting the call leaves the live child intact.
      expect(frame.contentDocument === original).toBe(true);
      expect(original === null).toBe(false);
    } finally {
      w.close();
    }
  });
});

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name Document and Window contracts", ({ Constructor }) => {
  it("exposes eligible names and IDs once in tree order, excluding templates and plain IDs", () => {
    // Given: named elements, nested fallback content, and an inert template.
    const { window: w } = new Constructor(
      '<embed name="media"><form name="formName"></form><img id="picture" name="image"><object id="objectId" name="objectName"><embed name="nested"></object><img id="plain"><template><img name="inert"></template><img name="42">',
    );
    try {
      const d = w.document;
      // When: own names and descriptors are queried.
      const names = Object.getOwnPropertyNames(d);
      // Then: names follow tree order even for integer strings and are enumerable.
      expect(
        names.filter((name) =>
          [
            "media",
            "formName",
            "picture",
            "image",
            "objectId",
            "objectName",
            "nested",
            "42",
          ].includes(name),
        ),
      ).toEqual([
        "media",
        "formName",
        "picture",
        "image",
        "objectId",
        "objectName",
        "nested",
        "42",
      ]);
      expect(Reflect.get(d, "objectId")).toBe(d.querySelector("object"));
      expect(names).not.toContain("plain");
      expect(names).not.toContain("inert");
      expect(Object.getOwnPropertyDescriptor(d, "picture")).toEqual({
        value: d.querySelector("img"),
        writable: false,
        enumerable: true,
        configurable: true,
      });
      expect(Object.keys(d)).toContain("picture");
    } finally {
      w.close();
    }
  });

  it("keeps duplicate named collections live through rename, removal and insertion", () => {
    // Given: duplicate object name/id matches and one saved collection.
    const { window: w } = new Constructor(
      '<object name="shared"></object><object id="shared"></object>',
    );
    try {
      const d = w.document;
      const objects = d.querySelectorAll("object");
      const collection = Reflect.get(d, "shared");
      expect(collection).toBeInstanceOf(w.HTMLCollection);
      // When: a member changes its name and the other is removed.
      objects[0]?.setAttribute("name", "renamed");
      expect(collection.length).toBe(1);
      expect(Reflect.get(d, "shared")).toBe(objects[1]);
      objects[1]?.remove();
      // Then: both the old collection and new lookups reflect the current tree.
      expect(collection.length).toBe(0);
      expect(Reflect.has(d, "shared")).toBe(false);
      objects[0]?.setAttribute("name", "shared");
      expect(collection.item(0)).toBe(objects[0]);
    } finally {
      w.close();
    }
  });

  it("deduplicates identical ID/name matches and returns a lone iframe's browsing context", () => {
    // Given: one element contributing the same ID/name, and one named frame.
    const { window: w } = new Constructor(
      '<object id="same" name="same"></object><iframe name="child"></iframe>',
    );
    try {
      const d = w.document;
      // When: the named getters and own names are queried.
      expect(Reflect.get(d, "same")).toBe(d.querySelector("object"));
      expect(Object.getOwnPropertyNames(d).filter((key) => key === "same")).toEqual(["same"]);
      // Then: a frame yields its Window; removing it drops document exposure.
      const frame = d.querySelector("iframe");
      if (!(frame instanceof w.HTMLIFrameElement)) throw new Error("Expected an iframe");
      expect(Reflect.get(d, "child")).toBe(frame?.contentWindow);
      frame?.remove();
      expect(Reflect.has(d, "child")).toBe(false);
    } finally {
      w.close();
    }
  });

  it("preserves held named collection identity across many other names and complete removal", () => {
    // Given: more named groups than a small cache can retain strongly.
    const markup = Array.from(
      { length: 260 },
      (_, index) => `<object name="group${index}"></object><object name="group${index}"></object>`,
    ).join("");
    const { window: w } = new Constructor(markup);
    try {
      const d = w.document;
      const first = Reflect.get(d, "group0");
      // When: other groups are read and the first group is removed then restored.
      for (let index = 1; index < 260; index++) Reflect.get(d, `group${index}`);
      expect(Reflect.get(d, "group0")).toBe(first);
      const members = [...d.querySelectorAll('[name="group0"]')];
      for (const member of members) member.remove();
      expect(first.length).toBe(0);
      d.body?.append(...members);
      // Then: an outstanding live collection remains the same public object.
      expect(Reflect.get(d, "group0")).toBe(first);
      expect(first.length).toBe(2);
    } finally {
      w.close();
    }
  });

  it("keeps ordinary descendants writable while restricting the Document's supported names", () => {
    // Given: a named property and an object inheriting from the Document.
    const { window: w } = new Constructor('<form name="supported"></form>');
    try {
      const child = Object.create(w.document);
      // When: assignment uses a different receiver.
      expect(Reflect.set(w.document, "supported", 42, child)).toBe(true);
      // Then: the child receives an ordinary own property without mutating the Document.
      expect(child.supported).toBe(42);
      expect(Reflect.get(w.document, "supported")).toBe(w.document.forms[0]);
    } finally {
      w.close();
    }
  });

  it("keeps named lookup live through nested insertion, text edits, name changes and reordering", () => {
    // Given: an already-read named collection and a disconnected nested contributor.
    const { window: w } = new Constructor('<img name="live"><object name="live"></object>');
    try {
      const d = w.document;
      const saved = Reflect.get(d, "live");
      const subtree = d.createElement("section");
      subtree.innerHTML = '<div><img id="late" name="live"></div>';
      // When: unrelated content changes, followed by a named subtree insertion and attribute edit.
      for (let index = 0; index < 64; index++) {
        const span = d.createElement("span");
        span.textContent = String(index);
        d.body?.append(span);
        expect(saved.length).toBe(2);
      }
      d.body?.prepend(subtree);
      expect(saved.length).toBe(3);
      expect(saved[0]).toBe(d.getElementById("late"));
      expect(Reflect.get(d, "late")).toBe(saved[0]);
      saved[0].removeAttribute("name");
      // Then: image ID exposure disappears with its name; moving another member preserves order.
      expect(Reflect.has(d, "late")).toBe(false);
      expect(saved.length).toBe(2);
      const last = saved[1];
      d.body?.prepend(last);
      expect(saved[0]).toBe(last);
    } finally {
      w.close();
    }
  });

  it("exposes the first name added after many member reads of a document without names", () => {
    // Given: a document with no named elements whose members were read many times.
    const { window: w } = new Constructor("<!doctype html><body><img id=i>");
    try {
      const d = w.document;
      for (let index = 0; index < 50; index++) expect(d.body).not.toBeNull();
      expect([Reflect.get(d, "pic"), Reflect.has(d, "pic")]).toEqual([undefined, false]);
      const image = d.getElementById("i");
      const form = d.createElement("form");
      form.setAttribute("name", "late");
      const other = d.implementation.createHTMLDocument("");
      expect(other.body).not.toBeNull();
      const embed = other.createElement("embed");
      embed.setAttribute("name", "e");
      // When: a name attribute is added, removed, and a named form is inserted and removed.
      image?.setAttribute("name", "pic");
      const named = [Reflect.get(d, "pic"), Reflect.has(d, "pic"), Object.keys(d).includes("pic")];
      image?.removeAttribute("name");
      const unnamed = Reflect.get(d, "pic");
      d.body?.append(form);
      const inserted = Reflect.get(d, "late");
      form.remove();
      other.body?.append(embed);
      // Then: each change is visible at once, and names stay scoped to their own document.
      expect(named).toEqual([image, true, true]);
      expect(unnamed).toBeUndefined();
      expect(inserted).toBe(form);
      expect(Reflect.get(d, "late")).toBeUndefined();
      expect(typeof d.getElementById).toBe("function");
      expect(Reflect.get(other, "e")).toBe(embed);
      expect(Reflect.get(d, "e")).toBeUndefined();
    } finally {
      w.close();
    }
  });

  it("shadows inherited built-ins while preserving expandos, unforgeable location and named write restrictions", () => {
    // Given: an ordinary expando and named content that shadows inherited and own members.
    const { window: w } = new Constructor();
    try {
      const d = w.document;
      Reflect.set(d, "named", "expando");
      d.body?.insertAdjacentHTML(
        "beforeend",
        '<form name="querySelector"></form><form name="named"></form><form name="location"></form><form name="blocked"></form>',
      );
      const forms = d.forms;
      // When: names collide and callers attempt to change legacy properties.
      expect(Reflect.get(d, "querySelector")).toBe(forms[0]);
      expect(Reflect.get(d, "named")).toBe("expando");
      expect(Reflect.set(d, "blocked", "replacement")).toBe(false);
      expect(Reflect.defineProperty(d, "blocked", { value: 1 })).toBe(false);
      expect(Reflect.deleteProperty(d, "blocked")).toBe(false);
      expect(Reflect.preventExtensions(d)).toBe(false);
      // Then: unforgeable access survives and the previous expando reappears after removal.
      expect(d.location).toBe(w.location);
      forms[1]?.remove();
      expect(Reflect.get(d, "named")).toBe("expando");
      expect(d.forms).toBe(forms);
    } finally {
      w.close();
    }
  });

  it.each([
    "createTextNode",
    "createComment",
    "createProcessingInstruction",
    "createDocumentFragment",
    "createAttribute",
    "createAttributeNS",
    "createElement",
    "createElementNS",
  ] as const)("allocates borrowed Document.%s results in the receiver document realm", (name) => {
    // Given: a method and a document from different Windows.
    const a = new Constructor();
    const b = new Constructor();
    try {
      const args: Record<typeof name, unknown[]> = {
        createTextNode: ["x"],
        createComment: ["x"],
        createProcessingInstruction: ["t", "d"],
        createDocumentFragment: [],
        createAttribute: ["x"],
        createAttributeNS: [null, "x"],
        createElement: ["div"],
        createElementNS: ["http://www.w3.org/1999/xhtml", "span"],
      };
      // When: the foreign method is borrowed in both directions.
      for (const [target, foreign] of [
        [a.window, b.window],
        [b.window, a.window],
      ] as const) {
        const node = Reflect.apply(foreign.Document.prototype[name], target.document, args[name]);
        // Then: wrapper and owner both belong to the receiver's document.
        expect(node).toBeInstanceOf(target.Node);
        expect(node).not.toBeInstanceOf(foreign.Node);
        expect(node.ownerDocument).toBe(target.document);
      }
    } finally {
      a.window.close();
      b.window.close();
    }
  });

  it("uses DOMImplementation receiver ownership for documents, doctypes and XML data", () => {
    // Given: independent implementation objects and a borrowed factory.
    const a = new Constructor();
    const b = new Constructor();
    try {
      const p = b.window.DOMImplementation.prototype;
      // When: all implementation factories are invoked on the other implementation.
      const type = p.createDocumentType.call(a.window.document.implementation, "root", "", "");
      const xml = p.createDocument.call(a.window.document.implementation, null, "root", type);
      const html = p.createHTMLDocument.call(a.window.document.implementation, "title");
      const cdata = b.window.Document.prototype.createCDATASection.call(xml, "x");
      // Then: documents and parser-created descendants share that implementation's realm.
      expect(type).toBeInstanceOf(a.window.DocumentType);
      expect(xml).toBeInstanceOf(a.window.XMLDocument);
      expect(cdata).toBeInstanceOf(a.window.CDATASection);
      expect(cdata.ownerDocument).toBe(xml);
      expect(html).toBeInstanceOf(a.window.Document);
      expect(html.doctype).toBeInstanceOf(a.window.DocumentType);
      expect(html.querySelector("title")?.firstChild).toBeInstanceOf(a.window.Text);
      expect(() => p.createHTMLDocument.call(Object.create(null))).toThrow(
        /DOMImplementation|invocation|private/u,
      );
    } finally {
      a.window.close();
      b.window.close();
    }
  });

  it("does not consult replaceable receiver-realm factories when a foreign intrinsic is borrowed", () => {
    // Given: user code has replaced factories in the receiver's Window.
    const a = new Constructor();
    const b = new Constructor();
    try {
      const sentinel = a.window.document.createComment("replacement");
      Reflect.set(a.window.Document.prototype, "createTextNode", () => sentinel);
      Reflect.set(a.window.Document.prototype, "createElementNS", () => sentinel);
      Reflect.set(a.window.DOMImplementation.prototype, "createHTMLDocument", () => sentinel);
      // When: genuine foreign methods are borrowed on the receiver's objects.
      const text = b.window.Document.prototype.createTextNode.call(a.window.document, "original");
      const html = b.window.DOMImplementation.prototype.createHTMLDocument.call(
        a.window.document.implementation,
        "original",
      );
      const xml = b.window.DOMImplementation.prototype.createDocument.call(
        a.window.document.implementation,
        null,
        "root",
        null,
      );
      // Then: realm allocation remains intrinsic and does not invoke the replacements.
      expect(text).toBeInstanceOf(a.window.Text);
      expect(text.textContent).toBe("original");
      expect(html).toBeInstanceOf(a.window.Document);
      expect(html.title).toBe("original");
      expect(xml.documentElement?.localName).toBe("root");
    } finally {
      a.window.close();
      b.window.close();
    }
  });

  it("copies borrowed Range contents and adopted shadow markup into the node document realm", () => {
    // Given: a local range and an adopted foreign host.
    const a = new Constructor();
    const b = new Constructor();
    try {
      const d = a.window.document;
      const host = b.window.document.createElement("div");
      d.body?.append(host);
      const shadow = host.attachShadow({ mode: "open" });
      // When: parsing and range copying run through foreign methods.
      shadow.innerHTML = "text<!--comment-->";
      expect(shadow.firstChild).toBeInstanceOf(a.window.Text);
      expect(shadow.lastChild).toBeInstanceOf(a.window.Comment);
      const range = d.createRange();
      range.selectNodeContents(shadow);
      const copy = b.window.Range.prototype.cloneContents.call(range);
      // Then: fragment and copied nodes use the target document realm.
      expect(copy).toBeInstanceOf(a.window.DocumentFragment);
      expect(copy.firstChild).toBeInstanceOf(a.window.Text);
      expect(copy.ownerDocument).toBe(d);
      expect(shadow.host).toBe(host);
    } finally {
      a.window.close();
      b.window.close();
    }
  });

  it.each([undefined, "outside-only"] as const)(
    "installs own Window members and preserves inherited event identity in %s mode",
    (runScripts) => {
      // Given: a Window with or without an isolated script global.
      const { window: w } = new Constructor("", { runScripts, url: "https://example.test/" });
      try {
        // When: descriptors and prototype membership are inspected.
        for (const name of [
          "close",
          "stop",
          "getSelection",
          "getComputedStyle",
          "history",
          "navigator",
          "localStorage",
          "sessionStorage",
          "window",
          "document",
          "location",
          "top",
          "self",
          "frames",
          "parent",
          "length",
        ]) {
          expect(Reflect.has(w.Window.prototype, name), name).toBe(false);
          expect(Object.hasOwn(w, name), name).toBe(true);
        }
        for (const name of ["window", "document", "location", "top"]) {
          const pd = Object.getOwnPropertyDescriptor(w, name);
          expect(pd?.configurable).toBe(false);
          expect(pd?.enumerable).toBe(true);
          expect(typeof pd?.get).toBe("function");
        }
        // Then: event operations retain identity and replaceable self changes only this own property.
        expect(w.addEventListener).toBe(w.EventTarget.prototype.addEventListener);
        expect(Object.hasOwn(w, "addEventListener")).toBe(false);
        expect(
          Object.getOwnPropertyDescriptor(w.EventTarget.prototype, "addEventListener")?.enumerable,
        ).toBe(true);
        expect(Object.getOwnPropertyDescriptor(w, "self")?.get?.call(w)).toBe(w);
        expect(Reflect.set(w, "self", "replacement")).toBe(true);
        expect(Reflect.get(w, "self")).toBe("replacement");
        expect(w.window).toBe(w);
        if (runScripts)
          expect(
            w.eval(
              'let n = 0; const listener = () => n++; addEventListener("fixture", listener); dispatchEvent(new Event("fixture")); removeEventListener("fixture", listener); dispatchEvent(new Event("fixture")); n',
            ),
          ).toBe(1);
      } finally {
        w.close();
      }
    },
  );
});
