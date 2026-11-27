// Pins dispatch observables that a listener-free fast path or cheaper event construction could break.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

type TestWindow = JSDOM["window"];
type TestEvent = InstanceType<TestWindow["Event"]>;

function element(window: TestWindow, id: string) {
  const found = window.document.getElementById(id);
  if (!(found instanceof window.HTMLElement)) throw new Error(`Expected #${id}`);
  return found;
}

function input(window: TestWindow, id: string) {
  const found = window.document.getElementById(id);
  if (!(found instanceof window.HTMLInputElement)) throw new Error(`Expected input #${id}`);
  return found;
}

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name EventTarget.dispatchEvent", ({ Constructor }) => {
  it("delivers to a listener that an earlier listener adds on a later path node", () => {
    // Given: only the target listens, and it registers a listener on an ancestor while dispatching.
    const { window } = new Constructor("<main id=m><p id=p></p></main>");
    try {
      const main = element(window, "m");
      const p = element(window, "p");
      const seen: string[] = [];
      p.addEventListener("probe", () => {
        seen.push("target");
        main.addEventListener("probe", (event: TestEvent) => seen.push(`main:${event.eventPhase}`));
      });
      // When: a bubbling event is dispatched at the target.
      p.dispatchEvent(new window.Event("probe", { bubbles: true }));
      // Then: the late listener runs during the bubbling phase of the same dispatch.
      expect(seen).toEqual(["target", "main:3"]);
    } finally {
      window.close();
    }
  });

  it("runs an event handler attribute set on an ancestor during dispatch", () => {
    // Given: a target listener that installs an onclick content attribute on its parent.
    const { window } = new Constructor("<main id=m><p id=p></p></main>", {
      runScripts: "dangerously",
    });
    try {
      const main = element(window, "m");
      const p = element(window, "p");
      p.addEventListener("click", () => main.setAttribute("onclick", "this.dataset.hit = 'yes'"));
      // When: a bubbling click is dispatched at the target.
      p.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      // Then: the handler compiled during dispatch receives the bubbling event.
      expect(main.dataset["hit"]).toBe("yes");
    } finally {
      window.close();
    }
  });

  it("delivers to a capture-only window listener when no node listens", () => {
    // Given: a deep target whose only listener is a capturing window listener.
    const { window } = new Constructor("<main><section><p id=p></p></section></main>");
    try {
      const p = element(window, "p");
      const seen: unknown[] = [];
      window.addEventListener(
        "probe",
        (event) => seen.push(event.currentTarget === window, event.eventPhase, event.target === p),
        true,
      );
      // When: a non-bubbling event is dispatched at the target.
      const result = p.dispatchEvent(new window.Event("probe"));
      // Then: the window captures it and the dispatch result is uncanceled.
      expect(seen).toEqual([true, 1, true]);
      expect(result).toBe(true);
    } finally {
      window.close();
    }
  });

  it("retargets or clears shadow targets after a listener-free dispatch", () => {
    // Given: a node inside an open shadow root with no listeners anywhere.
    const { window } = new Constructor("<div id=host></div>");
    try {
      const host = element(window, "host");
      const inner = window.document.createElement("span");
      host.attachShadow({ mode: "open" }).append(inner);
      const composed = new window.Event("probe", { bubbles: true, composed: true });
      const local = new window.Event("probe", { bubbles: true });
      // When: composed and non-composed events are dispatched from inside the shadow tree.
      const results = [inner.dispatchEvent(composed), inner.dispatchEvent(local)];
      // Then: the composed event keeps its retargeted host, the local one clears its target.
      expect(results).toEqual([true, true]);
      expect(composed.target).toBe(host);
      expect(local.target).toBeNull();
      expect(local.srcElement).toBeNull();
      for (const event of [composed, local]) {
        expect(event.currentTarget).toBeNull();
        expect(event.eventPhase).toBe(0);
        expect(event.composedPath()).toEqual([]);
      }
    } finally {
      window.close();
    }
  });

  it("keeps the light-tree target and an empty composed path after a listener-free dispatch", () => {
    // Given: a deep light-tree target with no listeners.
    const { window } = new Constructor("<main><section><p id=p></p></section></main>");
    try {
      const p = element(window, "p");
      const event = new window.Event("probe", { bubbles: true, cancelable: true });
      // When: the event is dispatched twice.
      const results = [p.dispatchEvent(event), p.dispatchEvent(event)];
      // Then: the target persists while path, phase and current target are reset.
      expect(results).toEqual([true, true]);
      expect(event.target).toBe(p);
      expect(event.srcElement).toBe(p);
      expect(event.currentTarget).toBeNull();
      expect(event.eventPhase).toBe(0);
      expect(event.composedPath()).toEqual([]);
      expect(event.defaultPrevented).toBe(false);
    } finally {
      window.close();
    }
  });

  it("observes the full composed path while dispatching and none afterward", () => {
    // Given: a target listener capturing composedPath() during dispatch.
    const { window } = new Constructor("<main id=m><p id=p></p></main>");
    try {
      const main = element(window, "m");
      const p = element(window, "p");
      let during: unknown[] = [];
      p.addEventListener("probe", (event: TestEvent) => (during = event.composedPath()));
      const event = new window.Event("probe");
      // When: the event is dispatched.
      p.dispatchEvent(event);
      // Then: the path runs from target to window during dispatch and is empty afterward.
      const { document } = window;
      expect(during).toEqual([p, main, document.body, document.documentElement, document, window]);
      expect(event.composedPath()).toEqual([]);
    } finally {
      window.close();
    }
  });

  it("runs checkbox and label default actions without any listeners", () => {
    // Given: a checkbox and a label controlling a second checkbox, with no listeners.
    const { window } = new Constructor(
      "<input type=checkbox id=a><label id=l><input type=checkbox id=b></label>",
    );
    try {
      const a = input(window, "a");
      const b = input(window, "b");
      const label = element(window, "l");
      // When: one checkbox is clicked, one synthetic click is dispatched, and the label is clicked.
      a.click();
      const synthetic = a.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      label.click();
      // Then: activation behavior toggles each control exactly as with listeners present.
      expect(synthetic).toBe(true);
      expect(a.checked).toBe(false);
      expect(b.checked).toBe(true);
    } finally {
      window.close();
    }
  });

  it("cancels checkbox activation when an onclick handler returns false", () => {
    // Given: a checkbox whose only listener is an onclick property returning false.
    const { window } = new Constructor("<input type=checkbox id=a>");
    try {
      const a = input(window, "a");
      let checkedDuringHandler: boolean | undefined;
      a.onclick = () => {
        checkedDuringHandler = a.checked;
        return false;
      };
      const event = new window.MouseEvent("click", { bubbles: true, cancelable: true });
      // When: the click is dispatched.
      const result = a.dispatchEvent(event);
      // Then: pre-activation was visible, then legacy-canceled activation restored the state.
      expect(checkedDuringHandler).toBe(true);
      expect(result).toBe(false);
      expect(event.defaultPrevented).toBe(true);
      expect(a.checked).toBe(false);
    } finally {
      window.close();
    }
  });

  it("rejects redispatch of an event that is still dispatching", () => {
    // Given: a listener that re-dispatches the event it is handling.
    const { window } = new Constructor("<p id=p></p>");
    try {
      const p = element(window, "p");
      let failure: unknown;
      p.addEventListener("probe", (event: TestEvent) => {
        try {
          window.document.body?.dispatchEvent(event);
        } catch (cause) {
          failure = cause;
        }
      });
      // When: the event is dispatched.
      p.dispatchEvent(new window.Event("probe"));
      // Then: the nested dispatch throws InvalidStateError.
      expect(failure).toBeInstanceOf(window.DOMException);
      expect(Reflect.get(Object(failure), "name")).toBe("InvalidStateError");
    } finally {
      window.close();
    }
  });
});
