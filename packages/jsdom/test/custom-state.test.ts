// Exercises custom-element setlike state and its live selector/style effects through public APIs.
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

function fixture() {
  const dom = new JSDOM("", { runScripts: "outside-only" });
  const w = dom.window;
  class Element extends w.HTMLElement {
    readonly internals = this.attachInternals();
  }
  w.customElements.define("state-fixture", Element);
  const element = new Element();
  return { dom, w, Element, element, states: element.internals.states };
}

describe("ElementInternals custom states", () => {
  it("exposes one branded, ordered DOMString set without allowing direct construction", () => {
    // Given: one custom element and its internals.
    const { w, element, states } = fixture();
    try {
      // When: duplicate strings and converted values are added.
      expect(states === element.internals.states).toBe(true);
      expect(states instanceof w.CustomStateSet).toBe(true);
      expect(Object.prototype.toString.call(states)).toBe("[object CustomStateSet]");
      expect(() => Reflect.construct(w.CustomStateSet, [])).toThrow("Illegal constructor");
      expect(states.add("one") === states).toBe(true);
      states.add("two");
      states.add("one");
      Reflect.apply(states.add, states, [42]);
      // Then: duplicates preserve insertion order and every value uses DOMString conversion.
      expect([...states]).toEqual(["one", "two", "42"]);
      expect(states.size).toBe(3);
      expect(states.delete("one")).toBe(true);
      expect(states.delete("missing")).toBe(false);
      states.add("one");
      expect([...states.keys()]).toEqual(["two", "42", "one"]);
      expect([...states.entries()]).toEqual([
        ["two", "two"],
        ["42", "42"],
        ["one", "one"],
      ]);
      expect(states[Symbol.iterator] === states.values).toBe(true);
      expect(states.keys === states.values).toBe(true);
    } finally {
      w.close();
    }
  });

  it("keeps iterators and forEach live while mutations preserve the public set argument", () => {
    // Given: an iterator created before a deletion.
    const { w, states } = fixture();
    try {
      states.add("one");
      states.add("two");
      const iterator = states.values();
      states.delete("one");
      // When: iteration observes deletions, additions and a clear.
      expect(iterator.next().value).toBe("two");
      states.add("three");
      expect(iterator.next().value).toBe("three");
      states.clear();
      expect(iterator.next().done).toBe(true);
      states.add("first");
      const seen: string[] = [];
      const receiver = {};
      states.forEach(function (this: object, value, key, set) {
        expect(this).toBe(receiver);
        expect(key).toBe(value);
        expect(set === states).toBe(true);
        seen.push(value);
        if (value === "first") states.add("second");
      }, receiver);
      // Then: newly appended values participate and callbacks receive the CustomStateSet.
      expect(seen).toEqual(["first", "second"]);
    } finally {
      w.close();
    }
  });

  it("validates required values, symbol conversion, callbacks and unrelated receivers", () => {
    // Given: the public setlike methods.
    const { w, states } = fixture();
    try {
      // When/Then: bad inputs fail at the Web IDL boundary without mutating the set.
      expect(() => Reflect.apply(states.add, states, [])).toThrow("A state value is required");
      expect(() => Reflect.apply(states.has, states, [])).toThrow("A state value is required");
      expect(() => Reflect.apply(states.delete, states, [])).toThrow("A state value is required");
      expect(() => Reflect.apply(states.add, states, [Symbol("bad")])).toThrow(/Symbol/u);
      expect(() => Reflect.apply(states.has, {}, ["one"])).toThrow("Expected a CustomStateSet");
      expect(() => Reflect.apply(states.forEach, states, [null])).toThrow("A callback is required");
      expect(states.size).toBe(0);
    } finally {
      w.close();
    }
  });

  it("retains receiver identity and state across foreign methods, adoption and close", () => {
    // Given: a state set and methods from another Window.
    const { w, element, states } = fixture();
    const other = new JSDOM();
    try {
      const foreign = other.window.CustomStateSet.prototype;
      Reflect.apply(foreign.add, states, ["ready"]);
      other.window.document.body?.appendChild(element);
      const get = Object.getOwnPropertyDescriptor(
        other.window.ElementInternals.prototype,
        "states",
      )?.get;
      if (!get) throw new Error("Expected states getter");
      // When: internals and methods are borrowed after adoption.
      expect(Reflect.apply(get, element.internals, []) === states).toBe(true);
      expect(Reflect.apply(foreign.has, states, ["ready"])).toBe(true);
      expect(other.window.document.querySelector(":state(ready)") === element).toBe(true);
      element.remove();
      w.close();
      states.add("retained");
      // Then: the held set remains usable with its original realm and private values.
      expect([...states]).toEqual(["ready", "retained"]);
      expect(states instanceof w.CustomStateSet).toBe(true);
    } finally {
      w.close();
      other.window.close();
    }
  });

  it("matches case-sensitive and escaped identifiers while rejecting malformed state selectors", () => {
    // Given: state strings, including values that need selector escaping.
    const { w, element, states } = fixture();
    try {
      for (const name of ["foo", "--", "--16px", "initial", "(escaped state"]) states.add(name);
      // When: functional identifiers and invalid grammar are queried.
      for (const selector of [
        ":state(foo)",
        ":state(--)",
        ":state(--16px)",
        ":state(initial)",
        ":state(\\(escaped\\ state)",
      ])
        expect(element.matches(selector), selector).toBe(true);
      expect(element.matches(":state(Foo)")).toBe(false);
      for (const selector of [
        ":state",
        ":state()",
        ":state(16px)",
        ":state(foo bar)",
        ":state(name=value)",
      ])
        expect(() => element.matches(selector), selector).toThrow(
          /state|selector|identifier|Unexpected/iu,
        );
      // Then: invalid forgiving branches are discarded without weakening strict :not().
      expect(element.matches(":is(:state(), state-fixture)")).toBe(true);
      expect(() => element.matches(":not(:state())")).toThrow(/identifier|state/iu);
      expect(w.CSS.supports("selector(:state(foo))")).toBe(true);
      w.document.head?.insertAdjacentHTML(
        "beforeend",
        "<style>:state( \\(escaped\\ state  ) { color: red }</style>",
      );
      const rule = w.document.styleSheets[0]?.cssRules[0];
      if (!rule) throw new Error("Expected a custom-state style rule");
      expect(Reflect.get(rule, "selectorText")).toBe(":state(\\(escaped\\ state)");
    } finally {
      w.close();
    }
  });

  it("reevaluates relational/nth matching and computed snapshots without reflecting attributes", async () => {
    // Given: cached selector/style work and an attribute observer.
    const { w, element, Element, states } = fixture();
    try {
      w.document.head?.insertAdjacentHTML(
        "beforeend",
        "<style>state-fixture { color: blue } state-fixture:state(ready) { color: red }</style>",
      );
      const parent = w.document.createElement("main");
      const second = new Element();
      parent.append(element, second);
      w.document.body?.append(parent);
      let attributeChanges = 0;
      const observer = new w.MutationObserver((records) => {
        attributeChanges += records.length;
      });
      observer.observe(element, { attributes: true });
      const before = w.getComputedStyle(element);
      expect(parent.matches(":has(> :state(ready))")).toBe(false);
      // When: state changes alter matching without a DOM or attribute revision.
      states.add("ready");
      second.internals.states.add("ready");
      expect(parent.matches(":has(> :state(ready))")).toBe(true);
      expect(parent.querySelector(":nth-child(2 of :state(ready))") === second).toBe(true);
      expect(w.getComputedStyle(element).color).toBe("rgb(255, 0, 0)");
      expect(before.color).toBe("rgb(0, 0, 255)");
      states.clear();
      await Promise.resolve();
      // Then: cached work sees current private state while old style snapshots and attributes stay intact.
      expect(parent.querySelector(":nth-child(1 of :state(ready))") === second).toBe(true);
      expect(w.getComputedStyle(element).color).toBe("rgb(0, 0, 255)");
      expect(attributeChanges).toBe(0);
      expect(observer.takeRecords()).toEqual([]);
      observer.disconnect();
    } finally {
      w.close();
    }
  });

  it("updates inherited shadow colors and host-state rules while preserving earlier snapshots", () => {
    // Given: a host with state-dependent inherited color and shadow host styling.
    const { w, element, states } = fixture();
    try {
      w.document.head?.insertAdjacentHTML(
        "beforeend",
        "<style>state-fixture { color: blue } state-fixture:state(ready) { color: red }</style>",
      );
      const shadow = element.attachShadow({ mode: "open" });
      shadow.innerHTML =
        "<style>:host { border-top-style: solid } :host(:state(ready)) { border-top-style: dotted }</style><span>child</span>";
      w.document.body?.append(element);
      const child = shadow.querySelector("span");
      if (!child) throw new Error("Expected a shadow child");
      const before = w.getComputedStyle(child);
      expect(before.color).toBe("rgb(0, 0, 255)");
      expect(w.getComputedStyle(element).getPropertyValue("border-top-style")).toBe("solid");
      // When: host state changes without a tree or attribute mutation.
      states.add("ready");
      // Then: inheritance and shadow-host matching use the current state; previous snapshots stay blue.
      expect(w.getComputedStyle(child).color).toBe("rgb(255, 0, 0)");
      expect(w.getComputedStyle(element).getPropertyValue("border-top-style")).toBe("dotted");
      expect(before.color).toBe("rgb(0, 0, 255)");
    } finally {
      w.close();
    }
  });

  it("contains invalid state grammar in authored styles without throwing during insertion", () => {
    // Given: a forgiving valid branch and an invalid strict rule.
    const { w, element } = fixture();
    try {
      const style = w.document.createElement("style");
      style.textContent =
        ":is(:state(),state-fixture){color:blue}state-fixture:not(:state()){color:red}";
      // When: author CSS enters through the DOM stylesheet boundary.
      expect(() => w.document.head?.appendChild(style)).not.toThrow();
      w.document.body?.appendChild(element);
      // Then: invalid rules/branches do not escape or suppress valid matching.
      expect(w.getComputedStyle(element).color).toBe("rgb(0, 0, 255)");
    } finally {
      w.close();
    }
  });
});
