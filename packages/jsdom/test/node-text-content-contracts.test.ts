// Preserves ordinary-tree text aggregation across leaf chains, branches, inert templates, XML and borrowed realm operations.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name Node.textContent", ({ Constructor }) => {
  it("reads empty, single-child and branching trees after edits without entering template contents", () => {
    // Given: text is interleaved with nested elements, comments and an inert template.
    const a = new Constructor(
      "<!doctype html><main><section><i>first</i></section><!--ignored--><template>hidden</template><b>last</b></main>",
    ).window;
    const b = new Constructor("").window;
    try {
      const root = a.document.querySelector("main");
      if (!root) throw new Error("Expected text aggregation root");
      const read = Object.getOwnPropertyDescriptor(b.Node.prototype, "textContent")?.get;
      if (!read) throw new Error("Expected borrowed text getter");
      // When/Then: branch aggregation and the single-child chain observe canonical text and mutations.
      expect(read.call(root)).toBe("firstlast");
      expect(root.firstChild?.textContent).toBe("first");
      expect(root.querySelector("template")?.textContent).toBe("");
      root.querySelector("i")?.replaceChildren("changed");
      expect(read.call(root)).toBe("changedlast");
      root.replaceChildren();
      expect(read.call(root)).toBe("");
      expect(a.document.textContent).toBeNull();
      expect(a.document.doctype?.textContent).toBeNull();
    } finally {
      a.close();
      b.close();
    }
  });
  it("includes CDATA while excluding XML comments and processing instructions in descendant text", () => {
    // Given: character data kinds have different own-value and descendant-aggregation contracts.
    const w = new Constructor(
      "<root><![CDATA[first]]><!--ignored--><?test ignored?><part>last</part></root>",
      { contentType: "application/xml" },
    ).window;
    try {
      const root = w.document.documentElement;
      if (!root) throw new Error("Expected XML root");
      // When/Then: full and single-child aggregation retain CDATA without including instructions.
      expect(root.textContent).toBe("firstlast");
      const cdata = root.firstChild;
      if (!cdata) throw new Error("Expected CDATA node");
      root.replaceChildren(cdata);
      expect(root.textContent).toBe("first");
      expect(cdata.textContent).toBe("first");
    } finally {
      w.close();
    }
  });
});
