// Pins how Window globals behave in a Vitest test file; runs unchanged under the built-in and the RunDOM environment.
import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

function shape(name) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  return {
    kind: "value" in descriptor ? "data" : "accessor",
    enumerable: descriptor.enumerable,
    configurable: descriptor.configurable,
    writable: descriptor.writable,
    settable: typeof descriptor.set === "function",
  };
}

// Recorded before any test reads a global, so the parent test can compare both environments.
const names = Object.getOwnPropertyNames(globalThis).toSorted();
writeFileSync(
  process.env.RUNDOM_FIXTURE_REPORT,
  JSON.stringify({
    keys: Object.keys(globalThis).toSorted(),
    descriptors: Object.fromEntries(names.map((name) => [name, shape(name)])),
  }),
);

describe("Window globals in a test file", () => {
  it("answers `in` and `typeof` with the Window's values", () => {
    // Given: a test file running in the environment
    // When: globals are probed with `in` and `typeof`
    // Then: they report the Window's interfaces and functions
    expect("HTMLElement" in globalThis).toBe(true);
    expect("CSSFunctionDescriptors" in globalThis).toBe(true);
    expect(typeof HTMLElement).toBe("function");
    expect(typeof getComputedStyle).toBe("function");
    expect(typeof document).toBe("object");
    expect(document.defaultView).toBe(globalThis);
    expect(window).toBe(globalThis);
  });

  it("returns one bound function per lowercase Window method", () => {
    // Given: a Window method read twice from the global
    const first = getComputedStyle;
    // When: it is called without a receiver
    const style = first(document.body);
    // Then: the identity is stable and the call is bound to the Window
    expect(getComputedStyle).toBe(first);
    expect(typeof style.getPropertyValue).toBe("function");
    expect(jsdom.window.getComputedStyle).not.toBe(first);
  });

  it("stores assigned globals and writes them through to the Window", () => {
    // Given: a test replacing a Window method and a Node-only global
    const original = globalThis.matchMedia;
    const mock = () => ({ matches: true });
    const fetchMock = async () => new Response("mocked");
    const nodeFetch = globalThis.fetch;
    // When: the test assigns them
    globalThis.matchMedia = mock;
    globalThis.fetch = fetchMock;
    // Then: the global and the Window both see the replacement
    expect(matchMedia).toBe(mock);
    expect(jsdom.window.matchMedia).toBe(mock);
    expect(fetch).toBe(fetchMock);
    globalThis.matchMedia = original;
    globalThis.fetch = nodeFetch;
  });

  it("restores the lazy accessor after vi.unstubAllGlobals", () => {
    // Given: a stubbed Window value
    vi.stubGlobal("innerWidth", 500);
    // When: the stub is active and then removed
    expect(innerWidth).toBe(500);
    expect(jsdom.window.innerWidth).toBe(1024);
    vi.unstubAllGlobals();
    // Then: the global reads the Window again through an accessor
    expect(innerWidth).toBe(1024);
    expect(shape("innerWidth").kind).toBe("accessor");
  });

  it("keeps Window globals out of Object.keys", () => {
    // Given: Window globals installed on the test global
    // When: enumerable own keys are listed
    const keys = Object.keys(globalThis);
    // Then: interfaces and Window members are not listed
    expect(keys).not.toContain("document");
    expect(keys).not.toContain("HTMLElement");
  });

  it("exposes the JSDOM instance with Vitest's default options", async () => {
    // Given: the environment's default options with console forwarding enabled
    // When: the test inspects the JSDOM instance and logs from a Window script
    jsdom.window.eval('console.log("rundom-forwarded-console")');
    // Then: URL, visual mode, Request/URL compatibility and serialization match Vitest's defaults
    expect(jsdom.window.location.href).toBe("http://localhost:3000/");
    expect(typeof requestAnimationFrame).toBe("function");
    expect(jsdom.serialize()).toContain("<html>");
    const request = new Request("http://localhost/", { method: "POST", body: new Blob(["sent"]) });
    expect(await request.text()).toBe("sent");
    expect(URL.createObjectURL(new Blob(["blob"]))).toMatch(/^blob:/);
  });
});
