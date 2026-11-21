// Exercises CharacterData operations and their live Range and observer effects.
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

describe("CharacterData", () => {
  it("finds adjacent elements across non-element siblings", () => {
    // Given a text node and a comment between two elements
    const { window } = new JSDOM("<main><i></i>text<!-- comment --><b></b></main>");
    try {
      const main = window.document.querySelector("main");
      const text = main?.firstElementChild?.nextSibling;
      const comment = text?.nextSibling;
      if (!(text instanceof window.Text) || !(comment instanceof window.Comment))
        throw new Error("Expected character data");
      // When looking in either direction, both nodes skip non-element siblings
      expect(text.nextElementSibling).toBe(main?.lastElementChild);
      expect(comment.previousElementSibling).toBe(main?.firstElementChild);
      // Then a removed node has no adjacent elements
      text.remove();
      expect(text.previousElementSibling).toBeNull();
      expect(text.nextElementSibling).toBeNull();
    } finally {
      window.close();
    }
  });

  it("adjusts live offsets and queues the previous data after partial replacement", () => {
    // Given: a text node with a range spanning the replacement.
    const { window } = new JSDOM("");
    try {
      const text = window.document.createTextNode("abcde");
      const range = window.document.createRange();
      range.setStart(text, 2);
      range.setEnd(text, 5);
      const observer = new window.MutationObserver(() => {});
      observer.observe(text, { characterDataOldValue: true });

      // When: two code units are replaced with one.
      text.replaceData(1, 2, "X");

      // Then: interior boundaries collapse, later boundaries shift, and the old data is recorded.
      expect(text.substringData(1, 2)).toBe("Xd");
      expect(text.nodeValue).toBe("aXde");
      expect([range.startOffset, range.endOffset]).toEqual([1, 4]);
      expect(observer.takeRecords().map((record) => record.oldValue)).toEqual(["abcde"]);
      expect(() => text.deleteData(5, 1)).toThrow("Offset out of bound");
    } finally {
      window.close();
    }
  });

  it("moves live boundaries across split and normalization", () => {
    // Given: a text range and a boundary immediately after the original text.
    const { window } = new JSDOM("<p>abcd</p>");
    try {
      const paragraph = window.document.querySelector("p");
      const text = paragraph?.firstChild;
      if (!paragraph || !(text instanceof window.Text)) throw new Error("Expected fixture text");
      const range = window.document.createRange();
      range.setStart(text, 3);
      range.setEnd(paragraph, 1);

      // When: the text splits and is normalized again.
      const remainder = text.splitText(2);
      expect(range.startContainer === remainder).toBe(true);
      expect([range.startOffset, range.endOffset]).toEqual([1, 2]);
      expect(remainder.wholeText).toBe("abcd");
      paragraph.normalize();

      // Then: the original node survives with the combined data and restored boundaries.
      expect(paragraph.childNodes.length).toBe(1);
      expect(text.data).toBe("abcd");
      expect(range.startContainer === text).toBe(true);
      expect([range.startOffset, range.endOffset]).toEqual([3, 1]);
    } finally {
      window.close();
    }
  });

  it("exposes comments, CDATA, and processing instructions as distinct node types", () => {
    // Given: an XML document containing three kinds of character data.
    const { window } = new JSDOM("<root><!--a--><![CDATA[b]]><?go c?></root>", {
      contentType: "application/xml",
    });
    try {
      const root = window.document.documentElement;
      if (!root) throw new Error("Expected the root");

      // When: parsed nodes are wrapped and a new comment is constructed.
      const [comment, cdata, instruction] = root.childNodes;
      const created = window.document.createComment("new");
      const createdInstruction = window.document.createProcessingInstruction("work", "now");
      expect(() => window.document.createProcessingInstruction("work", "?>")).toThrow(
        "Processing instruction data cannot contain its closing delimiter",
      );

      // Then: node interfaces reflect their actual types and CDATA contributes to textContent.
      expect(comment instanceof window.Comment).toBe(true);
      expect(cdata instanceof window.CDATASection).toBe(true);
      expect(instruction instanceof window.ProcessingInstruction).toBe(true);
      expect(created.data).toBe("new");
      expect([createdInstruction.target, createdInstruction.data]).toEqual(["work", "now"]);
      expect(root.textContent).toBe("b");
    } finally {
      window.close();
    }
  });
});
