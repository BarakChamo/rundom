// Pins live label association through duplicate IDs, tree edits, and cross-Window adoption.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("Live label membership", () => {
  it("updates a retained list after ID, for, type, and order changes", () => {
    // Given: explicit and implicit labels associate with the same control.
    const { window } = new JSDOM(
      "<label id=a for=target>A</label><label id=b>B<input id=target></label>",
    );
    try {
      const input = window.document.querySelector("input"),
        a = window.document.getElementById("a"),
        b = window.document.getElementById("b");
      if (!(input instanceof window.HTMLInputElement) || !a || !b)
        throw new Error("Expected labeled input");
      const labels = input.labels;
      if (!labels) throw new Error("Expected label list");
      expect([...labels].map((x) => x.id)).toEqual(["a", "b"]);
      expect(input.labels).toBe(labels);
      // When/Then: every dependency of association is read from current private state.
      a.setAttribute("for", "other");
      expect([...labels].map((x) => x.id)).toEqual(["b"]);
      input.id = "other";
      expect([...labels].map((x) => x.id)).toEqual(["a", "b"]);
      b.before(a);
      b.after(a);
      expect([...labels].map((x) => x.id)).toEqual(["b", "a"]);
      input.type = "hidden";
      expect(labels.length).toBe(0);
      input.type = "text";
      expect([...labels].map((x) => x.id)).toEqual(["b", "a"]);
    } finally {
      window.close();
    }
  });
  it("honors the first duplicate ID and isolates labels in different roots", () => {
    // Given: a non-labelable duplicate blocks an explicit label association.
    const { window } = new JSDOM(
      "<label for=target>Outside</label><div id=target></div><input id=target><section></section>",
    );
    try {
      const input = window.document.querySelector("input"),
        duplicate = window.document.querySelector("div"),
        host = window.document.querySelector("section");
      if (!(input instanceof window.HTMLInputElement) || !duplicate || !host)
        throw new Error("Expected controls");
      const labels = input.labels;
      if (!labels) throw new Error("Expected label list");
      expect(labels.length).toBe(0);
      // When/Then: removing the blocker and moving to a shadow root changes membership.
      duplicate.remove();
      expect(labels.length).toBe(1);
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = "<label for=target>Inside</label>";
      shadow.append(input);
      expect([...labels].map((x) => x.textContent)).toEqual(["Inside"]);
      input.remove();
      expect(labels.length).toBe(0);
    } finally {
      window.close();
    }
  });
  it("keeps an original Window's retained list live after adoption into another Window", () => {
    // Given: a control and its list retain their interface identity after adoption.
    const first = new JSDOM("<label for=target>First</label><input id=target>");
    const second = new JSDOM("<label for=target>Second</label>");
    try {
      const input = first.window.document.querySelector("input"),
        body = second.window.document.body;
      if (!(input instanceof first.window.HTMLInputElement) || !body)
        throw new Error("Expected input and destination");
      const labels = input.labels;
      if (!labels) throw new Error("Expected label list");
      expect(labels.item(0)?.textContent).toBe("First");
      // When/Then: destination mutations affect the old list without touching the old document.
      body.append(input);
      expect(labels.item(0)?.textContent).toBe("Second");
      second.window.document.querySelector("label")?.setAttribute("for", "other");
      expect(labels.length).toBe(0);
      input.id = "other";
      expect(labels.item(0)?.textContent).toBe("Second");
    } finally {
      first.window.close();
      second.window.close();
    }
  });
  it("refreshes association while custom controls upgrade and after a failed construction", () => {
    // Given: upgrading constructors can observe a partially upgraded root.
    const { window } = new JSDOM(
      "<label for=a>A</label><x-label-field id=a></x-label-field><label for=b>B</label><x-label-field id=b></x-label-field>",
    );
    try {
      const observed: {
        id: string;
        labels: ReturnType<InstanceType<typeof window.HTMLElement>["attachInternals"]>["labels"];
      }[] = [];
      class Field extends window.HTMLElement {
        static formAssociated = true;
        constructor() {
          super();
          const labels = this.attachInternals().labels;
          observed.push({ id: this.id, labels });
          expect(labels.length).toBe(1);
          if (this.id === "b") throw new Error("Rejected field");
        }
      }
      // When: a later constructor fails after reading its live label list.
      window.customElements.define("x-label-field", Field);
      // Then: successful and failed states replace the temporary construction membership.
      expect(observed.map((x) => x.id)).toEqual(["a", "b"]);
      expect(observed[0]?.labels.length).toBe(1);
      expect(observed[1]?.labels.length).toBe(0);
    } finally {
      window.close();
    }
  });
});
