// Exercises Range content operations and their effect on the original tree.
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

describe("Range content editing", () => {
  it("preserves a backward selection and its live range through replacement", () => {
    const { window } = new JSDOM("<main><b>old</b><i>new</i></main>");
    try {
      const { document } = window;
      const main = document.querySelector("main");
      const first = main?.firstChild;
      const last = main?.lastChild;
      const start = first?.firstChild;
      const end = last?.firstChild;
      if (!main || !first || !start || !end) throw new Error("Expected fixture nodes");

      const selection = window.getSelection();
      if (!selection) throw new Error("Expected a document selection");
      expect(document.getSelection() === selection).toBe(true);
      selection.setBaseAndExtent(start, 3, start, 0);
      expect(selection.anchorOffset).toBe(3);
      expect(selection.focusOffset).toBe(0);
      expect(selection.toString()).toBe("old");

      selection.setBaseAndExtent(end, 2, start, 1);
      const range = selection.getRangeAt(0);
      expect(selection.anchorNode === end).toBe(true);
      expect(selection.focusNode === start).toBe(true);
      expect(selection.toString()).toBe("ldne");

      main.replaceChild(document.createElement("em"), first);
      expect(selection.getRangeAt(0) === range).toBe(true);
      expect(selection.anchorNode === end).toBe(true);
      expect(selection.focusNode === main).toBe(true);
      expect(selection.focusOffset).toBe(0);
      expect(selection.toString()).toBe("ne");
    } finally {
      window.close();
    }
  });

  it("clones partial branches and moves fully selected nodes on extraction", () => {
    // Given: a selection beginning and ending inside separate elements.
    const { window } = new JSDOM("<main><p>abc</p><i>mid</i><p>def</p></main>");
    try {
      const main = window.document.querySelector("main");
      const first = main?.firstElementChild?.firstChild;
      const last = main?.lastElementChild?.firstChild;
      const middle = main?.querySelector("i");
      if (!main || !first || !last || !middle) throw new Error("Expected fixture nodes");
      const range = window.document.createRange();
      range.setStart(first, 1);
      range.setEnd(last, 2);

      // When: the caller clones and then extracts the same selection.
      const copy = range.cloneContents();
      const moved = range.extractContents();

      // Then: partial branches are copied, and the original full child moves only on extraction.
      expect(copy.textContent).toBe("bcmidde");
      expect(copy.querySelector("i") === middle).toBe(false);
      expect(moved.querySelector("i") === middle).toBe(true);
      expect(moved.children.length).toBe(3);
      expect(main.innerHTML).toBe("<p>a</p><p>f</p>");
      expect(range.collapsed).toBe(true);
      expect(range.startContainer === main).toBe(true);
      expect(range.startOffset).toBe(1);
    } finally {
      window.close();
    }
  });

  it("deletes foreign text without copying and adjusts other live ranges", () => {
    // Given: two ranges that share a text node in another Window.
    const left = new JSDOM("");
    const right = new JSDOM("");
    try {
      const text = right.window.document.createTextNode("abcdef");
      const edit = left.window.document.createRange();
      edit.setStart(text, 1);
      edit.setEnd(text, 4);
      const watched = right.window.document.createRange();
      watched.setStart(text, 5);

      // When: the foreign range deletes the selected characters.
      edit.deleteContents();

      // Then: the same node survives, and both ranges update.
      expect(text.data).toBe("aef");
      expect(edit.collapsed).toBe(true);
      expect(edit.startOffset).toBe(1);
      expect(watched.startOffset).toBe(2);
    } finally {
      left.window.close();
      right.window.close();
    }
  });
});

it("validates insertion before splitting text and surrounds a valid selection", () => {
  // Given: a text selection in an element and an invalid attribute insertion.
  const { window } = new JSDOM("<p>abcdef</p>");
  try {
    const p = window.document.querySelector("p");
    const text = p?.firstChild;
    if (!p || !text) throw new Error("Expected the fixture text");
    const range = window.document.createRange();
    range.setStart(text, 2);
    range.setEnd(text, 4);

    // When: invalid insertion is rejected and a valid element surrounds the selection.
    const attr = window.document.createAttribute("flag");
    expect(() => range.insertNode(attr)).toThrow("Cannot insert this node here");
    expect(p.childNodes.length).toBe(1);
    const strong = window.document.createElement("strong");
    strong.textContent = "old";
    range.surroundContents(strong);

    // Then: only the selected text moves into the wrapper and the range selects it.
    expect(p.innerHTML).toBe("ab<strong>cd</strong>ef");
    expect(range.startContainer === p).toBe(true);
    expect([range.startOffset, range.endOffset]).toEqual([1, 2]);
  } finally {
    window.close();
  }
});
