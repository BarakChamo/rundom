// Exercises live Range queries across tree and Window boundaries.
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

describe("Range boundary queries", () => {
  it("compares endpoints, reports intersection, and clones a live selection", () => {
    // Given: text spread across sibling elements and a range around the first.
    const { window } = new JSDOM("<main><p>abc</p><p>def</p></main>");
    try {
      const main = window.document.querySelector("main");
      const first = main?.firstElementChild;
      const second = main?.lastElementChild;
      const a = first?.firstChild;
      const b = second?.firstChild;
      if (!main || !first || !second || !a || !b) throw new Error("Expected fixture nodes");
      const range = window.document.createRange();
      range.setStart(a, 1);
      range.setEnd(b, 2);
      const clone = range.cloneRange();

      // When: the caller queries the selection and moves one endpoint relative to a sibling.
      expect(range.commonAncestorContainer === main).toBe(true);
      expect(String(range)).toBe("bcde");
      expect(range.comparePoint(a, 0)).toBe(-1);
      expect(range.isPointInRange(b, 2)).toBe(true);
      expect(range.intersectsNode(second)).toBe(true);
      expect(range.compareBoundaryPoints(window.Range.START_TO_START, clone)).toBe(0);
      range.setEndBefore(second);

      // Then: the clone keeps its boundaries and comparison reflects the new endpoint.
      expect(range.intersectsNode(second)).toBe(false);
      expect(range.compareBoundaryPoints(window.Range.END_TO_END, clone)).toBe(-1);
      expect(String(clone)).toBe("bcde");
    } finally {
      window.close();
    }
  });

  it("keeps foreign boundaries live and rejects comparisons across roots", () => {
    // Given: a Range created in one Window and a text node from another.
    const left = new JSDOM("");
    const right = new JSDOM("");
    try {
      const text = right.window.document.createTextNode("abc");
      const range = left.window.document.createRange();
      range.setStart(text, 1);
      range.setEnd(text, 3);

      // When: the foreign text changes before both boundaries.
      text.insertData(0, "z");

      // Then: the Range exposes the original node and tracks its shifted offsets.
      expect(range.startContainer === text).toBe(true);
      expect([range.startOffset, range.endOffset]).toEqual([2, 4]);
      expect(range.isPointInRange(left.window.document, 0)).toBe(false);
      expect(() => range.comparePoint(left.window.document, 0)).toThrow("different trees");
      expect(() => range.compareBoundaryPoints(0, left.window.document.createRange())).toThrow(
        "different trees",
      );
    } finally {
      left.window.close();
      right.window.close();
    }
  });
});

it("keeps shadow markup and range intersections scoped to the shadow tree", () => {
  // Given: an open shadow root on a host selected by a document range.
  const { window } = new JSDOM("<div></div>");
  try {
    const host = window.document.querySelector("div");
    if (!host) throw new Error("Expected the host");
    const shadow = host.attachShadow({ mode: "open" });
    const range = window.document.createRange();
    range.selectNode(host);

    // When: markup is assigned inside the shadow root.
    shadow.innerHTML = "<span>shadow</span>";
    const span = shadow.firstElementChild;
    if (!span) throw new Error("Expected the shadow child");

    // Then: the range intersects the host but stops at the shadow boundary.
    expect(shadow.innerHTML).toBe("<span>shadow</span>");
    expect(range.intersectsNode(host)).toBe(true);
    expect(range.intersectsNode(shadow)).toBe(false);
    expect(range.intersectsNode(span)).toBe(false);
  } finally {
    window.close();
  }
});

it("preserves StaticRange endpoints across edits while live ranges update", () => {
  const { window } = new JSDOM("<p>abc</p>");
  try {
    const text = window.document.querySelector("p")?.firstChild;
    if (!(text instanceof window.Text)) throw new Error("Expected a text node");
    const range = new window.Range();
    range.setStart(text, 1);
    range.setEnd(text, 2);
    const snapshot = new window.StaticRange({
      startContainer: text,
      startOffset: 1,
      endContainer: text,
      endOffset: 2,
    });
    expect(range).toBeInstanceOf(window.AbstractRange);
    expect(snapshot).toBeInstanceOf(window.AbstractRange);
    text.insertData(0, "!");
    expect([range.startOffset, range.endOffset]).toEqual([2, 3]);
    expect([snapshot.startContainer, snapshot.startOffset, snapshot.endOffset]).toEqual([
      text,
      1,
      2,
    ]);
    expect(snapshot.collapsed).toBe(false);
  } finally {
    window.close();
  }
});

it("coalesces document selection events and observes live range edits", async () => {
  // Given a selection associated with a live range.
  const { window } = new JSDOM("<p>abc</p>");
  try {
    const { document } = window;
    const text = document.querySelector("p")?.firstChild;
    if (!(text instanceof window.Text)) throw new Error("Missing text node");
    const selection = document.getSelection();
    if (!selection) throw new Error("Missing selection");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    const observed: number[] = [];
    document.onselectionchange = () => {
      observed.push(selection.focusOffset);
      if (observed.length === 1) text.deleteData(0, 1);
    };
    const nextTask = () => new Promise<void>((resolve) => window.setTimeout(() => resolve(), 0));

    // When the selection and its live boundary change in one task.
    selection.addRange(range);
    range.setEnd(text, 3);
    expect(observed).toEqual([]);

    // Then the first event sees the final boundary and a reentrant edit queues a second event.
    await nextTask();
    expect(observed).toEqual([3]);
    await nextTask();
    expect(observed).toEqual([3, 2]);
  } finally {
    window.close();
  }
});
