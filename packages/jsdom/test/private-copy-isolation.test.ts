// Preserves independent parser copies through attribute exposure, mutation, adoption, deep paths and inert content.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");
function warmed(Constructor: typeof JSDOM, html: string) {
  for (let index = 0; index < 2; index++) new Constructor(html).window.close();
  return new Constructor(html).window;
}
describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name private parser copies", ({ Constructor }) => {
  it("keeps exposed attributes, map iteration, style writes and observer old values isolated", () => {
    // Given: identical source copies expose independent Attr handles even before either is written.
    const html =
      '<!doctype html><p id="target" data-a="one" data-b="two" style="color:red">text</p>';
    const a = warmed(Constructor, html),
      b = new Constructor(html).window;
    try {
      const first = a.document.getElementById("target"),
        peer = b.document.getElementById("target");
      if (!first || !peer) throw new Error("Expected copied elements");
      const attributes = Array.from(first.attributes),
        data = first.getAttributeNode("data-a"),
        style = first.getAttributeNode("style");
      if (!data || !style) throw new Error("Expected copied Attr handles");
      expect(attributes.find((attr) => attr?.name === "data-a")).toBe(data);
      expect(data === peer.getAttributeNode("data-a")).toBe(false);
      const observer = new a.MutationObserver(() => {});
      observer.observe(first, { attributes: true, attributeOldValue: true });
      // When: Attr and Element writes operate on the same exposed owned records.
      data.value = "changed";
      first.setAttribute("data-a", "again");
      first.removeAttribute("data-b");
      first.style.color = "blue";
      // Then: identity and old values are stable while the peer and future copies retain original source.
      expect(first.getAttributeNode("data-a")).toBe(data);
      expect(data.value).toBe("again");
      expect(style.value).toContain("blue");
      expect(
        observer
          .takeRecords()
          .filter((record) => record.attributeName === "data-a")
          .map((record) => record.oldValue),
      ).toEqual(["one", "changed"]);
      expect(peer.getAttribute("data-a")).toBe("one");
      expect(peer.getAttribute("data-b")).toBe("two");
      expect(peer.getAttribute("style")).toBe("color:red");
      const fresh = new Constructor(html).window;
      try {
        expect(fresh.document.getElementById("target")?.getAttribute("data-a")).toBe("one");
      } finally {
        fresh.close();
      }
      observer.disconnect();
    } finally {
      a.close();
      b.close();
    }
  });
  it("keeps attribute iterators live through removal and attachment after adoption", () => {
    // Given: an iterator has exposed its first member before the element moves to another document.
    const html = '<p id="target" data-a="one" data-b="two"></p>';
    const a = warmed(Constructor, html),
      b = new Constructor(html).window;
    try {
      const node = a.document.getElementById("target"),
        peer = b.document.getElementById("target");
      if (!node || !peer || !b.document.body) throw new Error("Expected adoption fixture");
      const iterator = node.attributes[Symbol.iterator]();
      expect(iterator.next().value?.name).toBe("id");
      const removed = node.getAttributeNode("data-a");
      if (!removed) throw new Error("Expected removable attribute");
      // When: the original array loses one member, then gains an independently created member.
      node.removeAttributeNode(removed);
      b.document.adoptNode(node);
      b.document.body.appendChild(node);
      const added = a.document.createAttribute("data-new");
      added.value = "new";
      node.setAttributeNode(added);
      // Then: the existing iterator follows the current block, and handles preserve ownership.
      expect(Array.from(iterator).map((attr) => attr.name)).toEqual(["data-b", "data-new"]);
      expect(removed.ownerElement).toBeNull();
      expect(added.ownerElement).toBe(node);
      expect(node.ownerDocument).toBe(b.document);
      expect(peer.getAttribute("data-a")).toBe("one");
      expect(peer.hasAttribute("data-new")).toBe(false);
    } finally {
      a.close();
      b.close();
    }
  });
  it("forks unexposed attribute blocks before coercion, namespace edits and removal", () => {
    // Given: repeated inactive documents have not exposed any Attr handles.
    const html = '<p id="target" data-a="one" data-other="original" data-remove="present"></p>';
    const a = warmed(Constructor, html),
      b = new Constructor(html).window;
    try {
      const node = a.document.getElementById("target"),
        peer = b.document.getElementById("target");
      if (!node || !peer) throw new Error("Expected copied attribute fixture");
      // When: value conversion reenters an unrelated writer before the original write completes.
      Reflect.apply(node.setAttribute, node, [
        "data-a",
        {
          toString() {
            node.setAttribute("data-other", "inner");
            return "outer";
          },
        },
      ]);
      node.setAttributeNS("urn:fixture", "p:flag", "first");
      node.setAttributeNS("urn:fixture", "p:flag", "second");
      node.removeAttribute("data-remove");
      // Then: both writes survive in the receiver and never change the peer or template.
      expect(node.getAttribute("data-a")).toBe("outer");
      expect(node.getAttribute("data-other")).toBe("inner");
      expect(node.getAttributeNS("urn:fixture", "flag")).toBe("second");
      expect(peer.getAttribute("data-a")).toBe("one");
      expect(peer.getAttribute("data-other")).toBe("original");
      expect(peer.hasAttribute("data-remove")).toBe(true);
      expect(peer.hasAttributeNS("urn:fixture", "flag")).toBe(false);
    } finally {
      a.close();
      b.close();
    }
  });
  it("copies deep ordinary paths and nested foreign template contents without sharing nodes", () => {
    // Given: a deep chain and inert SVG/MathML content recur as one inactive source.
    const html =
      "<!doctype html><main>" +
      "<section>".repeat(512) +
      '<p id="leaf">λ</p>' +
      "</section>".repeat(512) +
      '<template id="hidden"><svg><title>original</title></svg><template><math><mi>x</mi></math></template></template></main>';
    const a = warmed(Constructor, html),
      b = new Constructor(html).window;
    try {
      const leaf = a.document.getElementById("leaf"),
        template = a.document.getElementById("hidden"),
        peer = b.document.getElementById("hidden");
      if (
        !leaf ||
        !(template instanceof a.HTMLTemplateElement) ||
        !(peer instanceof b.HTMLTemplateElement)
      )
        throw new Error("Expected deep template copies");
      // When: one document changes both ordinary and inert descendants.
      leaf.textContent = "changed";
      template.content.firstElementChild?.setAttribute("data-edited", "yes");
      // Then: tree order, document mode, namespaces and inert independent data survive copying.
      expect(b.document.getElementById("leaf")?.textContent).toBe("λ");
      expect(peer.content.firstElementChild?.namespaceURI).toBe("http://www.w3.org/2000/svg");
      expect(peer.content.firstElementChild?.hasAttribute("data-edited")).toBe(false);
      expect(b.document.querySelector("svg")).toBeNull();
      expect(b.document.compatMode).toBe("CSS1Compat");
    } finally {
      a.close();
      b.close();
    }
  });
});
