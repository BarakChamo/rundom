// Preserves event trust, timestamp, redispatch and borrowed-realm behavior while private metadata is consolidated.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name event metadata", ({ Constructor }) => {
  it("keeps trust unforgeable across native activation, foreign redispatch and closed handles", () => {
    // Given: two realms and a trusted activation whose change notification is trusted.
    const a = new Constructor("<input type=checkbox id=c>").window,
      b = new Constructor("<p></p>").window;
    try {
      const checkbox = a.document.getElementById("c");
      if (!checkbox || !(checkbox instanceof a.HTMLElement))
        throw new Error("Expected checkbox fixture");
      const foreignBody = b.document.body;
      if (!foreignBody) throw new Error("Expected foreign document body");
      const probe = new b.Event("probe");
      const descriptor = Object.getOwnPropertyDescriptor(probe, "isTrusted");
      if (!descriptor?.get) throw new Error("Expected own unforgeable trust getter");
      let retained: InstanceType<typeof a.Event> | undefined,
        timestamp = 0,
        trustedDuringChange = false;
      checkbox.addEventListener("change", (event) => {
        retained = event;
        timestamp = event.timeStamp;
        trustedDuringChange = descriptor.get?.call(event) === true;
      });
      // When: activation produces a change notification, then the same event is dispatched in another realm.
      checkbox.click();
      if (!retained) throw new Error("Expected click event");
      expect(Reflect.get(checkbox, "checked")).toBe(true);
      expect(trustedDuringChange).toBe(true);
      expect(Reflect.set(retained, "isTrusted", true)).toBe(false);
      expect(Reflect.defineProperty(retained, "isTrusted", { value: true })).toBe(false);
      expect(foreignBody.dispatchEvent(retained)).toBe(true);
      // Then: synthetic redispatch resets trust without changing timestamp or cancellation state.
      expect(descriptor.get.call(retained)).toBe(false);
      expect(retained.timeStamp).toBe(timestamp);
      expect(retained.currentTarget).toBeNull();
      a.close();
      expect(retained.timeStamp).toBe(timestamp);
      expect(retained.defaultPrevented).toBe(false);
    } finally {
      a.close();
      b.close();
    }
  });
  it("ignores in-flight initialization and resets between dispatches", () => {
    // Given: a cancelable event initialized before dispatch.
    const w = new Constructor("<p id=p></p>").window;
    try {
      const target = w.document.getElementById("p");
      if (!target) throw new Error("Expected event target");
      const event = new w.Event("first", { bubbles: true, cancelable: true });
      const timestamp = event.timeStamp;
      let typeDuringDispatch = "";
      target.addEventListener(
        "first",
        (received) => {
          received.preventDefault();
          received.initEvent("ignored", false, false);
          typeDuringDispatch = received.type;
        },
        { once: true },
      );
      // When: initialization is attempted while dispatched, then explicitly performed afterward.
      expect(target.dispatchEvent(event)).toBe(false);
      expect(typeDuringDispatch).toBe("first");
      event.initEvent("second", false, false);
      // Then: cancellation/dispatch state resets and timestamp remains the construction timestamp.
      expect(event.type).toBe("second");
      expect(event.defaultPrevented).toBe(false);
      expect(event.currentTarget).toBeNull();
      expect(event.timeStamp).toBe(timestamp);
      expect(target.dispatchEvent(event)).toBe(true);
      expect(event.isTrusted).toBe(false);
    } finally {
      w.close();
    }
  });
});
