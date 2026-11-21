// Pins realm ownership and observable custom-element reaction ordering at DOM operation boundaries.
import { createRequire } from "node:module";
import { JSDOM, VirtualConsole } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  JSDOM: Reference,
  VirtualConsole: ReferenceConsole,
}: { JSDOM: typeof JSDOM; VirtualConsole: typeof VirtualConsole } = require("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM, Console: VirtualConsole },
  { name: "jsdom", Constructor: Reference, Console: ReferenceConsole },
])("$name realms and custom reactions", ({ Constructor, Console }) => {
  it("keeps Window interface constructors out of enumerable global properties", () => {
    // Given: ordinary and lazy interface bindings on an isolated Window.
    const { window: w } = new Constructor("", { runScripts: "outside-only" });
    try {
      // When/Then: descriptor inspection and global enumeration preserve Web IDL exposure.
      for (const name of ["Node", "Element", "Event", "EventTarget", "Window", "ProgressEvent"]) {
        expect(Object.getOwnPropertyDescriptor(w, name)?.enumerable, name).toBe(false);
        expect(Object.keys(w), name).not.toContain(name);
      }
    } finally {
      w.close();
    }
  });
  it("roots DOM and EventTarget prototypes in the script realm and exposes the Window class string", () => {
    // Given: isolated script intrinsics and a named Window element.
    const { window: w } = new Constructor('<div id="inheritedFixture"></div>', {
      runScripts: "outside-only",
    });
    try {
      // When: script code examines the public prototype chain and changes its Object prototype.
      const result = w.eval(`[
        Object.getPrototypeOf(EventTarget.prototype) === Object.prototype,
        document instanceof Object,
        Object.prototype.toString.call(window)
      ]`);
      // Then: host intrinsics do not interrupt the script realm chain or named visibility.
      expect(Array.from(result as Iterable<unknown>)).toEqual([true, true, "[object Window]"]);
      w.eval('Object.prototype.inheritedFixture = "inherited"');
      expect(Reflect.get(w, "inheritedFixture")).toBe("inherited");
    } finally {
      w.close();
    }
  });

  it.each([true, false])(
    "preserves queued connection before nested removal, disconnected callback = %s",
    (hasDisconnected) => {
      // Given: a connected parent callback that removes a child with a pending connection reaction.
      const { window: w } = new Constructor();
      try {
        const log: string[] = [];
        class Parent extends w.HTMLElement {
          connectedCallback() {
            log.push("begin");
            const child = this.firstChild;
            if (child instanceof w.Element) child.remove();
            log.push("end");
          }
        }
        class Child extends w.HTMLElement {
          connectedCallback() {
            log.push("connected");
          }
        }
        if (hasDisconnected)
          Reflect.set(Child.prototype, "disconnectedCallback", () => log.push("disconnected"));
        w.customElements.define("queue-parent", Parent);
        w.customElements.define("queue-child", Child);
        const parent = new Parent();
        parent.appendChild(new Child());
        // When: the whole subtree connects in one operation.
        w.document.body?.appendChild(parent);
        // Then: only enqueuing an actual callback creates a nested delivery opportunity.
        expect(log).toEqual(
          hasDisconnected
            ? ["begin", "connected", "disconnected", "end"]
            : ["begin", "end", "connected"],
        );
      } finally {
        w.close();
      }
    },
  );

  it.each([true, false])(
    "preserves pending disconnection during nested insertion, connected callback = %s",
    (hasConnected) => {
      // Given: a disconnected parent callback that reconnects its child.
      const { window: w } = new Constructor();
      try {
        const log: string[] = [];
        class Parent extends w.HTMLElement {
          disconnectedCallback() {
            log.push("begin");
            if (this.firstChild) w.document.body?.appendChild(this.firstChild);
            log.push("end");
          }
        }
        class Child extends w.HTMLElement {
          disconnectedCallback() {
            log.push("disconnected");
          }
        }
        if (hasConnected)
          Reflect.set(Child.prototype, "connectedCallback", () => log.push("connected"));
        w.customElements.define("queue-parent", Parent);
        w.customElements.define("queue-child", Child);
        const parent = new Parent();
        parent.appendChild(new Child());
        w.document.body?.appendChild(parent);
        log.length = 0;
        // When: removal queues reactions for both parent and child.
        parent.remove();
        // Then: the child's FIFO survives a reentrant insertion.
        expect(log).toEqual(
          hasConnected
            ? ["begin", "disconnected", "connected", "end"]
            : ["begin", "end", "disconnected"],
        );
      } finally {
        w.close();
      }
    },
  );

  it.each([true, false])(
    "preserves pending connection during nested adoption, adopted callback = %s",
    (hasAdopted) => {
      // Given: a parent that adopts its pending child into another document during connection.
      const left = new Constructor();
      const right = new Constructor();
      try {
        const w = left.window;
        const log: string[] = [];
        class Parent extends w.HTMLElement {
          connectedCallback() {
            log.push("begin");
            if (this.firstChild) right.window.document.adoptNode(this.firstChild);
            log.push("end");
          }
        }
        class Child extends w.HTMLElement {
          connectedCallback() {
            log.push("connected");
          }
        }
        if (hasAdopted) Reflect.set(Child.prototype, "adoptedCallback", () => log.push("adopted"));
        w.customElements.define("queue-parent", Parent);
        w.customElements.define("queue-child", Child);
        const parent = new Parent();
        parent.appendChild(new Child());
        // When: connection starts the nested adoption.
        w.document.body?.appendChild(parent);
        // Then: callback eligibility determines whether adoption drains the child's existing queue.
        expect(log).toEqual(
          hasAdopted ? ["begin", "connected", "adopted", "end"] : ["begin", "end", "connected"],
        );
      } finally {
        left.window.close();
        right.window.close();
      }
    },
  );

  it.each([true, false])(
    "flushes a pending connection only for observed attribute mutation, observed = %s",
    (observed) => {
      // Given: a parent's callback changes one child attribute while connection is pending.
      const { window: w } = new Constructor();
      try {
        const log: string[] = [];
        class Parent extends w.HTMLElement {
          connectedCallback() {
            log.push("begin");
            const child = this.firstChild;
            if (child instanceof w.Element)
              child.setAttribute(observed ? "title" : "lang", "value");
            log.push("end");
          }
        }
        class Child extends w.HTMLElement {
          static observedAttributes = ["title"];
          connectedCallback() {
            log.push("connected");
          }
          attributeChangedCallback() {
            log.push("attribute");
          }
        }
        w.customElements.define("queue-parent", Parent);
        w.customElements.define("queue-child", Child);
        const parent = new Parent();
        parent.appendChild(new Child());
        // When: the subtree connects.
        w.document.body?.appendChild(parent);
        // Then: unobserved changes do not enqueue or prematurely flush reactions.
        expect(log).toEqual(
          observed ? ["begin", "connected", "attribute", "end"] : ["begin", "end", "connected"],
        );
      } finally {
        w.close();
      }
    },
  );

  it.each([true, false])(
    "uses upgrade-time connection eligibility despite constructor movement, initially connected = %s",
    (connected) => {
      // Given: an unresolved element whose upgrade constructor moves it across a connection boundary.
      const { window: w } = new Constructor();
      try {
        const element = w.document.createElement("moving-upgrade");
        const log: string[] = [];
        if (connected) w.document.body?.appendChild(element);
        class Moving extends w.HTMLElement {
          constructor() {
            super();
            if (connected) this.remove();
            else w.document.body?.appendChild(this);
            log.push("constructed");
          }
          connectedCallback() {
            log.push("connected");
          }
          disconnectedCallback() {
            log.push("disconnected");
          }
        }
        // When: definition or explicit upgrade runs its constructor.
        w.customElements.define("moving-upgrade", Moving);
        if (!connected) w.customElements.upgrade(element);
        // Then: initial eligibility controls the queued connection, and construction itself adds no callbacks.
        expect(log).toEqual(connected ? ["constructed", "connected"] : ["constructed"]);
      } finally {
        w.close();
      }
    },
  );

  it("drains each element's upgrade attributes and connection before constructing the next element", () => {
    // Given: two unresolved connected elements with initial observed attributes.
    const { window: w } = new Constructor(
      '<queue-upgrade id="a"></queue-upgrade><queue-upgrade id="b"></queue-upgrade>',
    );
    try {
      const log: string[] = [];
      class Upgraded extends w.HTMLElement {
        static observedAttributes = ["id"];
        constructor() {
          super();
          log.push("constructor:" + this.id);
        }
        attributeChangedCallback(_name: string, _old: string | null, value: string) {
          log.push("attribute:" + value);
        }
        connectedCallback() {
          log.push("connected:" + this.id);
        }
      }
      // When: registry definition upgrades both elements.
      w.customElements.define("queue-upgrade", Upgraded);
      // Then: reaction queues are per element rather than one flat callback list.
      expect(log).toEqual([
        "constructor:a",
        "attribute:a",
        "connected:a",
        "constructor:b",
        "attribute:b",
        "connected:b",
      ]);
    } finally {
      w.close();
    }
  });

  it("reports callback exceptions and continues later queued reactions", () => {
    // Given: the first element throws during its connected reaction.
    const console = new Console();
    const failures: unknown[] = [];
    console.on("jsdomError", (error) => failures.push(error));
    const { window: w } = new Constructor("", { virtualConsole: console });
    try {
      const log: string[] = [];
      class Parent extends w.HTMLElement {
        connectedCallback() {
          log.push("parent");
          throw new Error("reaction fixture");
        }
      }
      class Child extends w.HTMLElement {
        connectedCallback() {
          log.push("child");
        }
      }
      w.customElements.define("queue-parent", Parent);
      w.customElements.define("queue-child", Child);
      const parent = new Parent();
      parent.appendChild(new Child());
      // When: both callbacks are pending for one insertion.
      w.document.body?.appendChild(parent);
      // Then: reporting does not discard the child's work.
      expect(log).toEqual(["parent", "child"]);
      expect(failures.length).toBe(1);
    } finally {
      w.close();
    }
  });

  it("discards a failed upgrade's initial reactions and continues upgrading later elements", () => {
    // Given: two pending upgrades, the first of which fails after super.
    const console = new Console();
    const failures: unknown[] = [];
    console.on("jsdomError", (error) => failures.push(error));
    const { window: w } = new Constructor(
      '<failing-upgrade id="bad"></failing-upgrade><failing-upgrade id="good"></failing-upgrade>',
      { virtualConsole: console },
    );
    try {
      const log: string[] = [];
      class Child extends w.HTMLElement {
        static observedAttributes = ["id"];
        constructor() {
          super();
          if (this.id === "bad") throw new Error("upgrade fixture");
          log.push("constructed:good");
        }
        attributeChangedCallback() {
          log.push("attribute:" + this.id);
        }
        connectedCallback() {
          log.push("connected:" + this.id);
        }
      }
      // When: the registry starts its upgrade queue.
      w.customElements.define("failing-upgrade", Child);
      // Then: failed construction leaks no pending callback and does not cancel the next upgrade.
      expect(log).toEqual(["constructed:good", "attribute:good", "connected:good"]);
      expect(failures.length).toBe(1);
    } finally {
      w.close();
    }
  });

  it("flushes an adopted sibling's earlier reaction before its newly observed attribute change", () => {
    // Given: a subtree with two custom elements adopted in one operation.
    const left = new Constructor();
    const right = new Constructor();
    try {
      const w = left.window;
      const log: string[] = [];
      let second: InstanceType<typeof w.HTMLElement>;
      class Child extends w.HTMLElement {
        static observedAttributes = ["title"];
        adoptedCallback() {
          log.push("adopted:" + this.id);
          if (this.id === "first") second.setAttribute("title", "value");
        }
        attributeChangedCallback() {
          log.push("attribute:" + this.id);
        }
      }
      w.customElements.define("adopted-child", Child);
      const host = w.document.createElement("div");
      const first = new Child();
      first.id = "first";
      second = new Child();
      second.id = "second";
      host.append(first, second);
      // When: adoption queues work for both descendants before invoking either callback.
      right.window.document.adoptNode(host);
      // Then: the second element's pending FIFO precedes the new attribute reaction.
      expect(log).toEqual(["adopted:first", "adopted:second", "attribute:second"]);
    } finally {
      left.window.close();
      right.window.close();
    }
  });

  it("delivers Selection.deleteFromDocument removals through the range reaction path", () => {
    // Given: a selected connected custom element.
    const { window: w } = new Constructor();
    try {
      const log: string[] = [];
      class Child extends w.HTMLElement {
        disconnectedCallback() {
          log.push("disconnected");
        }
      }
      w.customElements.define("selection-child", Child);
      const child = new Child();
      w.document.body?.appendChild(child);
      const range = w.document.createRange();
      range.selectNode(child);
      const selection = w.getSelection();
      selection?.addRange(range);
      // When: deletion is requested through Selection rather than Range directly.
      selection?.deleteFromDocument();
      // Then: callbacks see the completed removal before the operation returns.
      expect(log).toEqual(["disconnected"]);
      expect(child.isConnected).toBe(false);
    } finally {
      w.close();
    }
  });

  it.each(["deleteContents", "extractContents"] as const)(
    "delivers Range.%s removals for a selected custom element",
    (method) => {
      // Given: a connected custom element selected in full.
      const { window: w } = new Constructor();
      try {
        const log: string[] = [];
        class Child extends w.HTMLElement {
          disconnectedCallback() {
            log.push("disconnected");
          }
        }
        w.customElements.define("range-child", Child);
        const child = new Child();
        w.document.body?.appendChild(child);
        const range = w.document.createRange();
        range.selectNode(child);
        // When: range editing removes the selected subtree.
        const fragment = range[method]();
        // Then: disconnection is delivered before returning and extraction preserves identity.
        expect(log).toEqual(["disconnected"]);
        expect(child.isConnected).toBe(false);
        if (method === "extractContents") expect(fragment?.firstChild === child).toBe(true);
      } finally {
        w.close();
      }
    },
  );

  it("upgrades disconnected shadow markup and contextual fragments, retaining inert templates", () => {
    // Given: one registry definition and a disconnected host.
    const { window: w } = new Constructor();
    try {
      const log: string[] = [];
      class Child extends w.HTMLElement {
        constructor() {
          super();
          log.push("constructed");
        }
      }
      w.customElements.define("fragment-child", Child);
      const host = w.document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });
      // When: shadow parsing and Range fragment parsing create custom elements.
      shadow.innerHTML = "<fragment-child></fragment-child>";
      const range = w.document.createRange();
      range.selectNodeContents(host);
      const fragment = range.createContextualFragment("<fragment-child></fragment-child>");
      // Then: both fragment operations upgrade, while template contents retain their inert owner.
      expect(log).toEqual(["constructed", "constructed"]);
      expect(shadow.firstChild).toBeInstanceOf(Child);
      expect(fragment.firstChild).toBeInstanceOf(Child);
      const template = w.document.createElement("template");
      if (!(template instanceof w.HTMLTemplateElement)) throw new Error("Expected a template");
      template.innerHTML = "<fragment-child></fragment-child>";
      w.customElements.upgrade(template.content);
      expect(template.content.firstChild).not.toBeInstanceOf(Child);
    } finally {
      w.close();
    }
  });
});

describe("RunDOM standard realm and streaming contracts", () => {
  it("parses document.write chunks synchronously without replacing earlier nodes at close", () => {
    // Given: an explicitly opened document and a definition registered before writes.
    const { window: w } = new JSDOM();
    try {
      const d = w.document;
      d.open();
      const log: string[] = [];
      class Child extends w.HTMLElement {
        constructor() {
          super();
          log.push("constructed");
        }
        connectedCallback() {
          log.push("connected");
        }
      }
      w.customElements.define("written-child", Child);
      // When: incomplete tokens and an open parent span separate writes.
      d.write('<section id="held"><written-');
      d.write("child></written-child>");
      const held = d.getElementById("held");
      const child = held?.firstChild;
      expect(log).toEqual(["constructed", "connected"]);
      d.writeln("<p>next</p></section>");
      d.close();
      // Then: parser stack and node identity survive continuation and EOF.
      expect(d.getElementById("held") === held).toBe(true);
      expect(held?.firstChild === child).toBe(true);
      expect(held?.lastChild?.nodeName).toBe("P");
      expect(log).toEqual(["constructed", "connected"]);
    } finally {
      w.close();
    }
  });
  it("roots Event instances in their Window's Object prototype", () => {
    // Given: an isolated Window event constructor.
    const { window: w } = new JSDOM("", { runScripts: "outside-only" });
    try {
      // When/Then: its prototype chain uses this Window's intrinsic object root.
      expect(w.eval("new Event('fixture') instanceof Object")).toBe(true);
    } finally {
      w.close();
    }
  });
  it.each([false, true])(
    "creates adopted-host shadow roots in the node document realm, custom host = %s",
    (custom) => {
      // Given: a host whose wrapper realm differs from its current node document.
      const a = new JSDOM();
      const b = new JSDOM();
      try {
        class Host extends a.window.HTMLElement {}
        a.window.customElements.define("realm-host", Host);
        const host = a.window.document.createElement(custom ? "realm-host" : "div");
        b.window.document.body?.appendChild(host);
        // When: the originating realm's method creates a shadow root after adoption.
        const shadow = host.attachShadow({ mode: "open" });
        // Then: host identity stays original while the new root follows the destination document.
        expect(host instanceof a.window.HTMLElement).toBe(true);
        expect(shadow instanceof b.window.ShadowRoot).toBe(true);
        expect(shadow.ownerDocument === b.window.document).toBe(true);
      } finally {
        a.window.close();
        b.window.close();
      }
    },
  );
});

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name parser document topology", ({ Constructor }) => {
  it.each(["element", "doctype"])("drops a doctype token after an existing %s child", (kind) => {
    // Given: author code modifies an explicitly opened document before its first write.
    const { window: w } = new Constructor();
    try {
      const doc = w.document;
      doc.open();
      const child =
        kind === "element"
          ? doc.createElement("x")
          : doc.implementation.createDocumentType("x", "", "");
      doc.appendChild(child);
      // When/Then: the token neither appends an illegal child nor rewrites the existing doctype.
      doc.write("<!doctype html>");
      expect(Array.from(doc.childNodes)).toEqual([child]);
      if (kind === "doctype") expect(doc.doctype?.name).toBe("x");
    } finally {
      w.close();
    }
  });
});
