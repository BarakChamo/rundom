// Guards Window global/prototype boundaries while construction avoids prototype teardown.
import { describe, it, expect } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("Window initialization", () => {
  it("allocates independent globals without invoking an author's Reflect.construct override", () => {
    // Given: the host intrinsics can be replaced after the package is loaded.
    const original = Reflect.construct;
    let dom: JSDOM | undefined;
    try {
      Reflect.set(Reflect, "construct", () => {
        throw new Error("Author construct override");
      });
      // When/Then: ordinary allocation preserves the public prototype and event branding.
      dom = new JSDOM();
      expect(Object.getPrototypeOf(dom.window)).toBe(dom.window.Window.prototype);
      expect(dom.window.constructor).toBe(dom.window.Window);
      let calls = 0;
      dom.window.addEventListener("allocated", () => calls++);
      dom.window.dispatchEvent(new dom.window.Event("allocated"));
      expect(calls).toBe(1);
    } finally {
      Reflect.set(Reflect, "construct", original);
      dom?.window.close();
    }
  });
  for (const mode of [undefined, "outside-only"] as const)
    it(`keeps global members off the public prototype in ${mode ?? "default"} mode`, () => {
      // Given: Window global members and interface inheritance have distinct ownership.
      const { window } = new JSDOM("", mode ? { runScripts: mode } : {});
      try {
        expect(Object.getOwnPropertyNames(window.Window.prototype)).toEqual(["constructor"]);
        expect(Object.getPrototypeOf(window)).toBe(window.Window.prototype);
        expect(window.constructor).toBe(window.Window);
        expect(Object.prototype.toString.call(window)).toBe("[object Window]");
        expect(Object.getOwnPropertySymbols(window)).toEqual([]);
        const Exception = mode ? window.eval("TypeError") : TypeError;
        expect(() => new window.Window()).toThrow(
          expect.objectContaining({ constructor: Exception }),
        );
        for (const name of ["close", "stop", "getComputedStyle", "document"]) {
          expect(Object.hasOwn(window, name)).toBe(true);
          expect(Reflect.get(window.Window.prototype, name)).toBeUndefined();
        }
        // When/Then: inherited EventTarget branding and realm-global identity survive setup.
        let count = 0;
        window.addEventListener("ping", () => count++);
        window.dispatchEvent(new window.Event("ping"));
        expect(count).toBe(1);
        expect(window.window).toBe(window);
        expect(window.self).toBe(window);
        if (mode) expect(window.eval("window === globalThis && self === window")).toBe(true);
      } finally {
        window.close();
      }
    });
  it.each([undefined, "outside-only"] as const)(
    "allows DOM observer and file reader bindings to be replaced independently in %s mode",
    (mode) => {
      // Given: two Windows have independent observer and file reader constructors.
      const first = new JSDOM("", mode ? { runScripts: mode } : {}).window;
      const second = new JSDOM("", mode ? { runScripts: mode } : {}).window;
      try {
        for (const name of ["MutationObserver", "FileReader"] as const) {
          const original = first[name];
          const untouched = second[name];
          class Replacement {}
          // When: an application instrumentation library replaces the Window global.
          expect(Reflect.set(first, name, Replacement)).toBe(true);
          // Then: the replacement is a writable, non-enumerable own property.
          expect(Object.getOwnPropertyDescriptor(first, name)).toEqual({
            configurable: true,
            enumerable: false,
            value: Replacement,
            writable: true,
          });
          expect(second[name]).toBe(untouched);
          expect(original).not.toBe(untouched);
        }
      } finally {
        first.close();
        second.close();
      }
    },
  );
  it("rejects external construction of the Window interface", () => {
    // Given/When/Then: the reference exposes a nonconstructible Window interface.
    const { window } = new JSDOM();
    try {
      expect(() => new window.Window()).toThrow(/Illegal constructor/);
    } finally {
      window.close();
    }
  });
});
