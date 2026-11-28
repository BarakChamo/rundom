// Pins when the document base URL changes while inline stylesheets keep the document base warm.
import { describe, expect, it } from "vitest";
import { JSDOM } from "../src/jsdom.js";

type TestDocument = JSDOM["window"]["document"];

function page(head = "") {
  const { window } = new JSDOM(
    `<!doctype html><html><head>${head}</head><body><a id=a href=x.html></a><div id=d></div></body></html>`,
    { url: "https://example.test/dir/page.html" },
  );
  return { window, document: window.document };
}

function head(document: TestDocument) {
  if (!document.head) throw new Error("The fixture must have a head");
  return document.head;
}

function body(document: TestDocument) {
  if (!document.body) throw new Error("The fixture must have a body");
  return document.body;
}

// Attaching inline sheets resolves the document base, as CSS-in-JS libraries do per test.
function warm(document: TestDocument): void {
  for (let index = 0; index < 3; index++) {
    const style = document.createElement("style");
    style.textContent = `.c${index}{color:red}`;
    head(document).appendChild(style);
  }
  void document.baseURI;
}

function bases(document: TestDocument): [string, string] {
  const anchor = document.getElementById("a");
  if (!anchor || !("href" in anchor) || typeof anchor.href !== "string")
    throw new Error("The fixture must have an anchor");
  return [document.baseURI, anchor.href];
}

function both(url: string, relative = "x.html"): [string, string] {
  return [url, new URL(relative, url).href];
}

function baseElement(document: TestDocument, href: string) {
  const base = document.createElement("base");
  base.setAttribute("href", href);
  return base;
}

describe("Document base URL", () => {
  it("follows base elements inserted, prepended and removed after sheets attach", () => {
    // Given: a document whose inline sheets already resolved the fallback base
    const { document } = page();
    warm(document);
    const wrapper = document.createElement("div");
    wrapper
      .appendChild(document.createElement("section"))
      .appendChild(baseElement(document, "/deep/"));
    // When: a base arrives deep inside an inserted subtree
    body(document).appendChild(wrapper);
    // Then: it becomes the document base
    expect(bases(document)).toEqual(both("https://example.test/deep/"));
    // When: an earlier base is prepended, then removed, then the deep one leaves
    const first = baseElement(document, "/first/");
    head(document).prepend(first);
    expect(bases(document)).toEqual(both("https://example.test/first/"));
    first.remove();
    expect(bases(document)).toEqual(both("https://example.test/deep/"));
    wrapper.remove();
    // Then: the base returns to the document URL
    expect(bases(document)).toEqual(both("https://example.test/dir/page.html"));
  });

  it("uses the first base with href in tree order across moves and attribute edits", () => {
    // Given: two parsed base elements and warm sheets
    const { document } = page('<base href="/one/"><base href="/two/">');
    warm(document);
    expect(bases(document)).toEqual(both("https://example.test/one/"));
    const [one, two] = document.querySelectorAll("base");
    if (!one || !two) throw new Error("The fixture must have two bases");
    // When: the second base moves before the first
    head(document).insertBefore(two, one);
    // Then: tree order picks the moved base, and each href edit is seen immediately
    expect(bases(document)).toEqual(both("https://example.test/two/"));
    two.setAttribute("href", "/changed/");
    expect(bases(document)).toEqual(both("https://example.test/changed/"));
    two.removeAttribute("href");
    expect(bases(document)).toEqual(both("https://example.test/one/"));
    two.toggleAttribute("href");
    expect(bases(document)).toEqual(both("https://example.test/dir/page.html"));
    const attribute = two.getAttributeNode("href");
    if (!attribute) throw new Error("The base must have an href attribute");
    attribute.value = "/attr/";
    expect(bases(document)).toEqual(both("https://example.test/attr/"));
    two.setAttributeNS("urn:x", "x:href", "/other/");
    expect(bases(document)).toEqual(both("https://example.test/attr/"));
  });

  it("ignores template and SVG bases and follows replaced content and history URLs", () => {
    // Given: warm sheets on a document without a base
    const { window, document } = page();
    warm(document);
    // When: a base sits only in template contents
    const template = document.createElement("template");
    template.innerHTML = '<base href="/tpl/">';
    head(document).appendChild(template);
    // Then: it does not apply
    expect(bases(document)).toEqual(both("https://example.test/dir/page.html"));
    // When: head content is replaced through markup, emptied, and refilled from a fragment
    head(document).innerHTML = '<base href="/inner/">';
    expect(bases(document)).toEqual(both("https://example.test/inner/"));
    head(document).replaceChildren();
    expect(bases(document)).toEqual(both("https://example.test/dir/page.html"));
    const fragment = document.createDocumentFragment();
    const relative = fragment.appendChild(baseElement(document, "rel/"));
    head(document).appendChild(fragment);
    expect(bases(document)).toEqual(both("https://example.test/dir/rel/"));
    // When: the document URL changes under a relative base
    window.history.pushState(null, "", "/other/path/x.html");
    // Then: the base resolves against the new URL
    expect(bases(document)).toEqual(both("https://example.test/other/path/rel/"));
    relative.replaceWith(document.createElement("meta"));
    expect(bases(document)).toEqual(both("https://example.test/other/path/x.html"));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "base");
    svg.setAttribute("href", "/svg/");
    head(document).appendChild(svg);
    expect(bases(document)).toEqual(both("https://example.test/other/path/x.html"));
  });

  it("updates both documents when a base moves between Windows", () => {
    // Given: two warm documents, only the second with a base
    const target = page().document;
    const origin = page('<base href="/foreign/">').document;
    warm(target);
    warm(origin);
    const base = origin.querySelector("base");
    if (!base) throw new Error("The fixture must have a base");
    // When: the base moves into the first document
    head(target).appendChild(base);
    // Then: it applies there and no longer applies to its former document
    expect(bases(target)).toEqual(both("https://example.test/foreign/"));
    expect(bases(origin)).toEqual(both("https://example.test/dir/page.html"));
  });

  it("resolves inline sheet URLs against the base current when each sheet attaches", () => {
    // Given: a warm document and a sheet attached before any base exists
    const { window, document } = page();
    warm(document);
    const target = document.getElementById("d");
    if (!target) throw new Error("The fixture must have a target");
    const attach = (image: string) => {
      const style = document.createElement("style");
      style.textContent = `#d{background-image:url(${image})}`;
      head(document).appendChild(style);
      return window.getComputedStyle(target).getPropertyValue("background-image");
    };
    attach("img.png");
    const base = baseElement(document, "/later/");
    head(document).prepend(base);
    // When/Then: the earlier sheet keeps its attachment-time base, later sheets see changes
    expect(window.getComputedStyle(target).getPropertyValue("background-image")).toBe(
      'url("https://example.test/dir/img.png")',
    );
    expect(attach("img2.png")).toBe('url("https://example.test/later/img2.png")');
    base.remove();
    expect(attach("img3.png")).toBe('url("https://example.test/dir/img3.png")');
  });

  it("follows a base written after document.open", () => {
    // Given: warm sheets on an open document
    const { document } = page();
    warm(document);
    // When: new markup with a relative base is written
    document.open();
    document.write('<base href="written/"><a id=a href=x.html></a>');
    document.close();
    // Then: the written base applies
    expect(bases(document)).toEqual(both("https://example.test/dir/written/"));
  });
});
