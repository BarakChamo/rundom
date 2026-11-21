// Exercises mutation delivery, live child views, and Range adjustment.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("DOM mutations", () => {
  it("reports a foreign observer callback error to its function's Window", async () => {
    const { window } = new JSDOM("<iframe></iframe><iframe></iframe>", {
      runScripts: "outside-only",
    });
    try {
      expect(
        await window.eval(`
        (async () => {
          const [owner, callbackWindow] = [frames[0], frames[1]];
          const reports = [];
          owner.onerror = () => { reports.push("owner"); return true; };
          callbackWindow.onerror = () => { reports.push("callback"); return true; };
          const callback = callbackWindow.Function("throw new parent.Error('foreign');");
          const observer = new owner.MutationObserver(callback);
          observer.observe(owner.document.body, { childList: true });
          owner.document.body.append("changed");
          await Promise.resolve();
          observer.disconnect();
          return reports;
        })()
      `),
      ).toEqual(["callback"]);
    } finally {
      window.close();
    }
  });

  it("delivers records in the observer realm across adoption and foreign observation", async () => {
    const left = new JSDOM("<main><b></b></main>");
    const right = new JSDOM("<aside></aside>");
    try {
      const child = left.window.document.querySelector("b");
      const target = right.window.document.querySelector("aside");
      if (!child || !target) throw new Error("Expected fixture nodes");
      const values: string[] = [];
      const observer = new left.window.MutationObserver((records) => {
        for (const record of records) {
          expect(record instanceof left.window.MutationRecord).toBe(true);
          values.push(record.attributeName ?? record.type);
        }
      });
      observer.observe(child, { attributes: true });
      observer.observe(target, { childList: true });
      target.appendChild(child);
      child.setAttribute("data-adopted", "yes");
      await Promise.resolve();
      expect(values).toEqual(["childList", "data-adopted"]);
      observer.disconnect();
      child.setAttribute("data-ignored", "yes");
      await Promise.resolve();
      expect(values).toEqual(["childList", "data-adopted"]);
    } finally {
      left.window.close();
      right.window.close();
    }
  });

  it("observes a removed subtree until the removal delivery", async () => {
    const { window } = new JSDOM("<main><section><b></b></section></main>");
    try {
      const main = window.document.querySelector("main");
      const section = main?.firstElementChild;
      const child = section?.firstElementChild;
      if (!main || !section || !child) throw new Error("Expected fixture nodes");
      const changes: string[] = [];
      const observer = new window.MutationObserver((records) => {
        changes.push(...records.map((record) => record.type));
      });
      observer.observe(main, { childList: true, attributes: true, subtree: true });
      section.remove();
      child.remove();
      child.setAttribute("data-before", "yes");
      await Promise.resolve();
      expect(changes).toEqual(["childList", "childList", "attributes"]);
      child.setAttribute("data-after", "yes");
      await Promise.resolve();
      expect(changes).toEqual(["childList", "childList", "attributes"]);
      observer.disconnect();
    } finally {
      window.close();
    }
  });

  it("records fragment emptying and replacement with an existing child as single mutations", () => {
    const { window } = new JSDOM("<main></main>");
    try {
      const main = window.document.querySelector("main");
      if (!main) throw new Error("Expected a container");
      const fragment = window.document.createDocumentFragment();
      const first = window.document.createElement("b");
      const second = window.document.createElement("i");
      fragment.append(first, second);
      const observer = new window.MutationObserver(() => {});
      observer.observe(fragment, { childList: true });
      observer.observe(main, { childList: true });

      main.appendChild(fragment);
      const inserted = observer.takeRecords();
      expect(inserted.length).toBe(2);
      expect(inserted[0]?.target === fragment).toBe(true);
      expect(Array.from(inserted[0]?.removedNodes ?? [], (node) => node?.nodeName)).toEqual([
        "B",
        "I",
      ]);
      expect(inserted[1]?.target === main).toBe(true);

      main.replaceChildren(second);
      const replaced = observer.takeRecords();
      expect(replaced.length).toBe(1);
      expect(Array.from(replaced[0]?.removedNodes ?? [], (node) => node?.nodeName)).toEqual([
        "B",
        "I",
      ]);
      expect(replaced[0]?.addedNodes[0] === second).toBe(true);
      observer.disconnect();
    } finally {
      window.close();
    }
  });

  it("observes classList writes through the same live class attribute", () => {
    const { window } = new JSDOM('<div class=" a a b "></div>');
    try {
      const target = window.document.querySelector("div");
      if (!target) throw new Error("Expected a classed element");
      const classes = target.classList;
      expect(classes === target.classList).toBe(true);
      expect([...classes]).toEqual(["a", "b"]);
      const observer = new window.MutationObserver(() => {});
      observer.observe(target, { attributes: true, attributeOldValue: true });
      classes.add("a");
      classes.toggle("b", true);
      expect(target.className).toBe("a b");
      expect(observer.takeRecords().map((record) => record.oldValue)).toEqual([" a a b "]);
      target.className = "new";
      expect(classes[0]).toBe("new");
      expect(() => classes.add("ok", "bad token")).toThrow();
      expect(target.className).toBe("new");
      observer.disconnect();
    } finally {
      window.close();
    }
  });

  it("keeps shadow roots separate and rejects host cycles", () => {
    const { window } = new JSDOM("<div></div>");
    try {
      const host = window.document.querySelector("div");
      if (!host) throw new Error("Expected the host");
      const shadow = host.attachShadow({ mode: "closed" });
      const paragraph = shadow.appendChild(window.document.createElement("p"));

      expect(host.shadowRoot).toBeNull();
      expect(shadow.querySelector("p")).toBe(paragraph);
      expect(window.document.querySelector("p")).toBeNull();
      expect(paragraph.getRootNode()).toBe(shadow);
      expect(paragraph.getRootNode({ composed: true })).toBe(window.document);
      expect(paragraph.isConnected).toBe(true);
      expect(() => shadow.appendChild(host)).toThrow();
      host.remove();
      expect(paragraph.isConnected).toBe(false);
    } finally {
      window.close();
    }
  });

  it("delivers ordered records with old attribute values and live child views", async () => {
    // Given: an observer on a parent and a retained child list.
    const { window } = new JSDOM('<div><p data-x="before"></p></div>');
    try {
      const parent = window.document.querySelector("div");
      const paragraph = window.document.querySelector("p");
      if (!parent || !paragraph) throw new Error("Expected the fixture nodes");
      const list = parent.childNodes;
      const delivered: unknown[] = [];
      const observer = new window.MutationObserver((records) => delivered.push(...records));
      observer.observe(parent, { subtree: true, attributeOldValue: true, childList: true });

      // When: an attribute changes and the paragraph is removed in the same turn.
      paragraph.setAttribute("data-x", "after");
      paragraph.remove();
      expect(parent.childNodes).toBe(list);
      expect(list.length).toBe(0);
      expect(delivered).toEqual([]);
      await Promise.resolve();

      // Then: both records arrive in order and the removal identifies the original node.
      expect(delivered).toMatchObject([
        { type: "attributes", attributeName: "data-x", oldValue: "before" },
        { type: "childList", removedNodes: { 0: paragraph } },
      ]);
      observer.disconnect();
    } finally {
      window.close();
    }
  });

  it("adjusts selected node boundaries as siblings are inserted and removed", () => {
    // Given: a range that selects the second child.
    const { window } = new JSDOM("<div><i></i><b></b></div>");
    try {
      const parent = window.document.querySelector("div");
      const bold = window.document.querySelector("b");
      if (!parent || !bold) throw new Error("Expected the fixture nodes");
      const range = window.document.createRange();
      range.selectNode(bold);

      // When: another child is prepended and the selected child is removed.
      parent.prepend(window.document.createElement("em"));
      expect([range.startOffset, range.endOffset]).toEqual([2, 3]);
      bold.remove();

      // Then: the range collapses at the removed child's previous index.
      expect(range.startContainer).toBe(parent);
      expect(range.startOffset).toBe(2);
      expect(range.collapsed).toBe(true);
    } finally {
      window.close();
    }
  });
});
