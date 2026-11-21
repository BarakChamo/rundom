// Exercises live NodeIterator cursors and callback behavior.
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

describe("NodeIterator", () => {
  it("keeps the cursor in tree order when its reference subtree is removed", () => {
    // Given: a cursor positioned after a descendant of a removable subtree.
    const { window } = new JSDOM("<main><div><p></p></div><aside></aside></main>");
    try {
      const root = window.document.querySelector("main");
      if (!root) throw new Error("Expected the root");
      const iterator = window.document.createNodeIterator(root, window.NodeFilter.SHOW_ELEMENT);
      expect(iterator.nextNode()?.nodeName).toBe("MAIN");
      expect(iterator.nextNode()?.nodeName).toBe("DIV");
      expect(iterator.nextNode()?.nodeName).toBe("P");

      // When: markup replacement removes the cursor's ancestor.
      const div = root.querySelector("div");
      if (!div) throw new Error("Expected the subtree");
      div.outerHTML = "<span></span>";

      // Then: the cursor resumes at the next live node and can reverse direction.
      expect(iterator.referenceNode === root).toBe(true);
      expect(iterator.pointerBeforeReferenceNode).toBe(false);
      expect(iterator.nextNode()?.nodeName).toBe("SPAN");
      expect(iterator.previousNode()?.nodeName).toBe("SPAN");
      expect(iterator.nextNode()?.nodeName).toBe("SPAN");
      expect(iterator.nextNode()?.nodeName).toBe("ASIDE");
      expect(iterator.nextNode()).toBeNull();
    } finally {
      window.close();
    }
  });

  it("adjusts its in-flight candidate when a filter removes it", () => {
    // Given: an iterator whose filter removes its first element candidate.
    const { window } = new JSDOM("<main><p></p><aside></aside></main>");
    try {
      const root = window.document.querySelector("main");
      const p = root?.querySelector("p");
      if (!root || !p) throw new Error("Expected fixture elements");
      const iterator = window.document.createNodeIterator(
        root,
        window.NodeFilter.SHOW_ELEMENT,
        (node) => {
          if (node === root) return window.NodeFilter.FILTER_REJECT;
          if (node === p) p.remove();
          return window.NodeFilter.FILTER_ACCEPT;
        },
      );

      // When: filtering rejects the root and then removes the paragraph.
      expect(iterator.nextNode() === p).toBe(true);

      // Then: the result is the accepted node and the live cursor continues from the root.
      expect(iterator.referenceNode === root).toBe(true);
      expect(iterator.nextNode()?.nodeName).toBe("ASIDE");
    } finally {
      window.close();
    }
  });
});

describe("TreeWalker", () => {
  it("skips transparent ancestors and prunes rejected subtrees", () => {
    // Given: one skipped wrapper, one rejected branch, and two visible leaves.
    const { window } = new JSDOM(
      "<main><div><b></b></div><section><i></i></section><p></p></main>",
    );
    try {
      const root = window.document.querySelector("main");
      if (!root) throw new Error("Expected the traversal root");
      const filter = window.NodeFilter;
      const walker = window.document.createTreeWalker(root, filter.SHOW_ELEMENT, {
        acceptNode(node) {
          if (node.nodeName === "DIV") return filter.FILTER_SKIP;
          if (node.nodeName === "SECTION") return filter.FILTER_REJECT;
          return filter.FILTER_ACCEPT;
        },
      });

      // When: callers navigate the filtered tree in both directions.
      // Then: rejected descendants stay hidden and skipped ancestors are transparent.
      expect(walker.firstChild()?.nodeName).toBe("B");
      expect(walker.nextSibling()?.nodeName).toBe("P");
      expect(walker.previousNode()?.nodeName).toBe("B");
      expect(walker.parentNode() === root).toBe(true);
      expect(walker.lastChild()?.nodeName).toBe("P");
      expect(walker.nextNode()).toBeNull();
      expect(walker.currentNode.nodeName).toBe("P");
    } finally {
      window.close();
    }
  });

  it("walks live template content outside the original root", () => {
    // Given: a walker rooted at the document and a detached template.
    const { window } = new JSDOM("");
    try {
      const template = window.document.createElement("template");
      if (!(template instanceof window.HTMLTemplateElement)) throw new Error("Expected a template");
      const children = template.content.children;
      template.innerHTML = "text<div></div>text";
      const walker = window.document.createTreeWalker(
        window.document,
        window.NodeFilter.SHOW_ELEMENT,
      );

      // When: the walker starts from the template fragment.
      walker.currentNode = template.content;

      // Then: it finds the live element child and stops at the fragment boundary.
      expect(children.length).toBe(1);
      expect(walker.nextNode() === children[0]).toBe(true);
      expect(walker.nextNode()).toBeNull();
    } finally {
      window.close();
    }
  });

  it("preserves a foreign node as current after it is removed", () => {
    // Given: a walker over an element created in a different Window.
    const owner = new JSDOM("");
    const foreign = new JSDOM("<main><div><b></b></div></main>");
    try {
      const root = foreign.window.document.querySelector("main");
      if (!root) throw new Error("Expected the foreign root");
      const walker = owner.window.document.createTreeWalker(root);
      const branch = walker.firstChild();

      // When: the current branch is removed from the root.
      root.firstElementChild?.remove();

      // Then: the cursor retains its position and still exposes foreign node identities.
      expect(walker.currentNode === branch).toBe(true);
      expect(walker.nextNode() instanceof foreign.window.Element).toBe(true);
      expect(walker.currentNode.nodeName).toBe("B");
    } finally {
      owner.window.close();
      foreign.window.close();
    }
  });
});
