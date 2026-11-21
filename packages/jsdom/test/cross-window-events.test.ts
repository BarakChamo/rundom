// Exercises event identity and listener order after a node changes documents.
import { addAbortListener } from "node:events";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

describe("Cross-Window dispatch", () => {
  it("delivers DOM events on native-backed signals and preserves host abort subscriptions", () => {
    // Given: a window signal with a DOM listener and a Node cancellation subscriber.
    const { window } = new JSDOM("");
    try {
      const controller = new window.AbortController();
      const { signal } = controller;
      const delivered: unknown[] = [];
      const hostSubscriber = addAbortListener(signal, () => delivered.push("native abort"));
      const event = new window.Event("abort");
      signal.addEventListener("abort", () => delivered.push(window.event), { once: true });

      // When: a synthetic event is dispatched, then the controller actually aborts.
      signal.dispatchEvent(event);
      expect(signal.aborted).toBe(false);
      expect(delivered).toEqual([event]);
      controller.abort("finished");

      // Then: native subscribers see real cancellation, with the reason and Window state intact.
      expect(signal.reason).toBe("finished");
      expect(delivered).toEqual([event, "native abort"]);
      expect(window.event).toBeUndefined();
      hostSubscriber[Symbol.dispose]();
    } finally {
      window.close();
    }
  });

  it("validates abort signals and removes aborted registrations during dispatch", () => {
    const { window } = new JSDOM("");
    try {
      const target = new window.EventTarget();
      expect(() =>
        Reflect.apply(target.addEventListener, target, ["test", null, { signal: null }]),
      ).toThrow(TypeError);

      const controller = new window.AbortController();
      const calls: string[] = [];
      const listener = () => calls.push("listener");
      target.addEventListener("test", () => controller.abort(), { once: true });
      target.addEventListener("test", listener, { signal: controller.signal });
      target.dispatchEvent(new window.Event("test"));
      expect(calls).toEqual([]);
      target.addEventListener("test", listener);
      target.dispatchEvent(new window.Event("test"));
      expect(calls).toEqual(["listener"]);
    } finally {
      window.close();
    }
  });

  it("reports thrown listener errors to the registered callback object's Window", () => {
    const { window } = new JSDOM("<iframe></iframe><iframe></iframe>", {
      runScripts: "outside-only",
    });
    try {
      expect(
        window.eval(`
        (() => {
          const left = frames[0];
          const right = frames[1];
          const reports = [];
          left.onerror = () => { reports.push("left"); return true; };
          right.onerror = () => { reports.push("right"); return true; };
          const target = new right.EventTarget();
          const callback = left.Function("throw new parent.Error('function');");
          const listener = left.eval("({})");
          listener.handleEvent = right.Function("throw new parent.Error('object');");
          target.addEventListener("function", callback);
          target.addEventListener("object", listener);
          target.dispatchEvent(new right.Event("function"));
          target.dispatchEvent(new right.Event("object"));
          return reports;
        })()
      `),
      ).toEqual(["left", "left"]);
    } finally {
      window.close();
    }
  });

  it("uses the new tree and accepts an event constructed in either Window", () => {
    // Given: a node with a listener in its original Window.
    const source = new JSDOM("<button></button>");
    const destination = new JSDOM("<main></main>");
    try {
      const button = source.window.document.querySelector("button");
      const main = destination.window.document.querySelector("main");
      if (!button || !main) throw new Error("Expected the fixture nodes");
      const calls: string[] = [];
      const paths: object[][] = [];
      source.window.addEventListener("fixture", () => calls.push("source window"));
      button.addEventListener("fixture", (event) => {
        calls.push("target");
        paths.push(event.composedPath());
        expect(event.target === button).toBe(true);
      });
      main.addEventListener("fixture", () => calls.push("capture"), true);
      destination.window.addEventListener("fixture", () => calls.push("destination window"));

      // When: the destination adopts the node and dispatches its own event.
      main.appendChild(button);
      const event = new destination.window.Event("fixture", { bubbles: true });
      button.dispatchEvent(event);

      // Then: listeners follow the live path without changing the original node or event.
      expect(calls).toEqual(["capture", "target", "destination window"]);
      expect(paths[0]?.[0] === button).toBe(true);
      expect(paths[0]?.at(-1) === destination.window).toBe(true);
      expect(event.currentTarget).toBeNull();
      expect(event.target === button).toBe(true);
    } finally {
      source.window.close();
      destination.window.close();
    }
  });

  it("keeps callback identity and cancellation when methods are borrowed across Windows", () => {
    // Given: independent Windows and a target constructed in the first.
    const left = new JSDOM("");
    const right = new JSDOM("");
    try {
      const target = new left.window.EventTarget();
      let calls = 0;
      const listener = (event: InstanceType<typeof right.window.Event>) => {
        calls++;
        event.preventDefault();
      };

      // When: the listener is registered using the second Window's interface.
      right.window.EventTarget.prototype.addEventListener.call(target, "fixture", listener);
      const event = new right.window.Event("fixture", { cancelable: true });

      // Then: dispatch observes the same listener and removing it uses the same identity.
      expect(target.dispatchEvent(event)).toBe(false);
      target.removeEventListener("fixture", listener);
      expect(target.dispatchEvent(new left.window.Event("fixture"))).toBe(true);
      expect(calls).toBe(1);
    } finally {
      left.window.close();
      right.window.close();
    }
  });
});

it("initializes legacy events before dispatch and preserves state during listeners", () => {
  // Given: a legacy custom event and a target with a capture listener.
  const { window } = new JSDOM("<div></div>");
  try {
    const target = window.document.querySelector("div");
    if (!target) throw new Error("Expected a target");
    const event = window.document.createEvent("CustomEvent");
    expect(() => target.dispatchEvent(event)).toThrow("Event is not initialized");
    if (!(event instanceof window.CustomEvent)) throw new Error("Expected a CustomEvent");
    event.initCustomEvent("fixture", true, true, { value: 42 });
    target.addEventListener(
      "fixture",
      () => {
        expect(event.eventPhase).toBe(window.Event.AT_TARGET);
        event.initEvent("other");
        event.preventDefault();
      },
      true,
    );

    // When: the event is dispatched and then initialized again.
    expect(target.dispatchEvent(event)).toBe(false);
    expect(event.type).toBe("fixture");
    expect(event.detail).toEqual({ value: 42 });
    event.initEvent("other");

    // Then: reinitializing outside dispatch clears cancellation and target state.
    expect(event.type).toBe("other");
    expect(event.defaultPrevented).toBe(false);
    expect(event.target).toBeNull();
  } finally {
    window.close();
  }
});
