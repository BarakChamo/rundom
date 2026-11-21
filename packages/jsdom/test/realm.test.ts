// Exercises script execution through the package's public JSDOM facade.
import { createRequire } from "node:module";
import { runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { JSDOM, VirtualConsole } from "@run-dom/jsdom";

const require = createRequire(import.meta.url);
const {
  JSDOM: reference,
  VirtualConsole: ReferenceConsole,
}: { JSDOM: typeof JSDOM; VirtualConsole: typeof VirtualConsole } = require("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom 30.1.3", Constructor: reference },
])("$name script realms", ({ Constructor }) => {
  it("uses the Window for bare global event methods", () => {
    // Given: a script realm with a callback registered through the bare global.
    const dom = new Constructor(
      `<script>
        let calls = 0;
        const listener = () => calls++;
        addEventListener("fixture", listener);
        dispatchEvent(new Event("fixture"));
        removeEventListener("fixture", listener);
        dispatchEvent(new Event("fixture"));
        window.calls = calls;
      </script>`,
      { runScripts: "dangerously" },
    );
    try {
      // When: the script dispatches before and after removing its listener.
      // Then: the listener runs exactly once.
      expect(Reflect.get(dom.window, "calls")).toBe(1);
    } finally {
      dom.window.close();
    }
  });

  it("runs inline code in parser order after beforeParse", () => {
    // Given: a hook installs state before the parser creates any nodes.
    const dom = new Constructor(
      '<body><script>document.body.setAttribute("data-result", document.body.getAttribute("data-setup") ?? (document.getElementById("later") ? "late" : window.setup));</script><p id="later">later</p>',
      {
        runScripts: "dangerously",
        beforeParse(window) {
          expect(window.document.documentElement).toBeNull();
          expect(window).toBeInstanceOf(window.Window);
          Object.assign(window, { setup: "ready" });
        },
      },
    );

    // When and then: the script sees the hook state and runs before the later sibling.
    expect(dom.window.document.body?.getAttribute("data-result")).toBe("ready");
    expect(runInContext("window === globalThis", dom.getInternalVMContext())).toBe(true);
    dom.window.close();
  });

  it("gives outside-only callers isolated intrinsics and keeps markup scripts inert", () => {
    // Given: a Window that only allows scripts invoked from outside.
    const dom = new Constructor("<script>globalThis.inlineRan = true</script>", {
      runScripts: "outside-only",
    });

    // When: the caller evaluates code through the returned context.
    const context = dom.getInternalVMContext();

    // Then: script globals are local and the inline script never ran.
    expect(runInContext("typeof inlineRan", context)).toBe("undefined");
    expect(runInContext("Array", context)).not.toBe(Array);
    expect(dom.window.eval("globalThis")).toBe(dom.window);
    dom.window.close();
  });

  it("rejects unsupported script modes", () => {
    // Given, when and then: an invalid mode is rejected instead of enabling script execution.
    expect(() => new Constructor("", { runScripts: "enabled" })).toThrow(
      'runScripts must be undefined, "dangerously", or "outside-only"',
    );
  });
});

describe("Window lifecycle", () => {
  it("cancels pending timers and rejects new timers after close", async () => {
    // Given: a timer was registered on the Window.
    const { window } = new JSDOM();
    let calls = 0;
    window.setTimeout(() => calls++, 0);

    // When: the Window closes before the host gets to its timer queue.
    window.close();
    const closedHandle = window.setInterval(() => calls++, 0);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    // Then: neither callback survives the Window.
    expect(closedHandle).toBe(0);
    expect(calls).toBe(0);
  });
});

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom 30.1.3", Constructor: reference },
])("$name HTML event handlers", ({ Constructor }) => {
  it("shares the body and Window hash handler and delivers the old and new URL", async () => {
    // Given: a content handler compiled in the enabled Window realm.
    const { window } = new Constructor(
      "<body onhashchange=\"document.body.setAttribute('data-url', event.oldURL + ' ' + event.newURL)\"></body>",
      { url: "https://example.test/", runScripts: "dangerously" },
    );
    try {
      const { body } = window.document;
      if (!(body instanceof window.HTMLBodyElement)) throw new Error("Body was not parsed");
      expect(typeof body.onhashchange).toBe("function");
      expect(window.onhashchange).toBe(body.onhashchange);

      // When: the current document navigates to another fragment.
      const changed = new Promise<void>((resolve) =>
        window.addEventListener("hashchange", () => resolve(), { once: true }),
      );
      window.location.hash = "test";
      await changed;

      // Then: the callback observed the Window event and both URLs.
      expect(body.getAttribute("data-url")).toBe(
        "https://example.test/ https://example.test/#test",
      );
    } finally {
      window.close();
    }
  });
});

describe("Window storage quota", () => {
  it("keeps the previous value when an update exceeds the quota", () => {
    // Given: a key and value that fill four UTF-16 code units.
    const { window } = new JSDOM("", { url: "https://example.test", storageQuota: 4 });
    try {
      const { localStorage, sessionStorage } = window;
      localStorage.k = "abc";

      // When: a replacement would exceed the quota.
      expect(() => localStorage.setItem("k", "abcd")).toThrow(/4-code unit storage quota/);

      // Then: the original entry remains and the session area is separate.
      expect(localStorage.k).toBe("abc");
      expect(sessionStorage.getItem("k")).toBeNull();
      expect(Object.keys(localStorage)).toEqual(["k"]);
    } finally {
      window.close();
    }
  });
});

it("compiles inline handlers with element, form, and document scopes", () => {
  // Given a button owned by a form and an ordinary element inside it.
  const { window } = new JSDOM(
    '<form><button type="button" value="button" onclick="return [typeof value, typeof elements, typeof URL]"></button>' +
      '<div onclick="return typeof elements"></div></form>',
    { url: "https://example.test/", runScripts: "dangerously" },
  );
  try {
    const button = window.document.querySelector("button");
    const div = window.document.querySelector("div");
    if (!(button instanceof window.HTMLButtonElement) || !(div instanceof window.HTMLElement))
      throw new Error("Missing handler elements");

    // When the handlers are read and called, only the associated control sees the form scope.
    expect(button.onclick?.(new window.Event("click"))).toEqual(["string", "object", "string"]);
    expect(div.onclick?.(new window.Event("click"))).toBe("undefined");

    // Then the compiled function preserves its name and original source.
    expect(button.onclick?.toString()).toBe(
      "function onclick(event) {\nreturn [typeof value, typeof elements, typeof URL]\n}",
    );
  } finally {
    window.close();
  }
});

describe.each([
  { name: "RunDOM", Constructor: JSDOM, Console: VirtualConsole },
  { name: "jsdom 30.1.3", Constructor: reference, Console: ReferenceConsole },
])("$name Window host methods", ({ Constructor, Console }) => {
  it("reports unsupported operations to the originating Window's console", () => {
    // Given a Window with a dedicated virtual console.
    const virtualConsole = new Console();
    const errors: unknown[] = [];
    virtualConsole.on("jsdomError", (error) => errors.push(error));
    const { window } = new Constructor("", { runScripts: "outside-only", virtualConsole });
    try {
      const names = [
        "alert",
        "blur",
        "confirm",
        "focus",
        "moveBy",
        "moveTo",
        "open",
        "print",
        "prompt",
        "resizeBy",
        "resizeTo",
        "scroll",
        "scrollBy",
        "scrollTo",
      ] as const;

      // When detached functions and the VM global invoke those operations.
      for (const name of names) {
        const method = window[name];
        expect(Object.getOwnPropertyDescriptor(window, name)).toMatchObject({
          value: method,
          configurable: true,
          enumerable: true,
          writable: true,
        });
        expect(method()).toBeUndefined();
      }
      expect(window.eval("print()")).toBeUndefined();

      // Then every invocation reports the method through the Window's own console.
      expect(errors).toEqual(
        [...names, "print"].map((name) =>
          expect.objectContaining({
            type: "not-implemented",
            message: `Not implemented: Window's ${name}() method`,
          }),
        ),
      );
    } finally {
      window.close();
    }
  });
});

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom 30.1.3", Constructor: reference },
])("$name legacy Window properties", ({ Constructor }) => {
  it("exposes stable constructor aliases and Window-local name and status", () => {
    // Given two independent Window globals.
    const first = new Constructor("", { runScripts: "outside-only" });
    const second = new Constructor();
    try {
      const { window } = first;
      expect(window.eval("HTMLDocument === Document && webkitURL === URL")).toBe(true);
      expect(window.document).toBeInstanceOf(window.HTMLDocument);
      expect(window.HTMLDocument).not.toBe(second.window.HTMLDocument);
      expect(Object.getOwnPropertyDescriptor(window, "webkitURL")).toMatchObject({
        configurable: true,
        enumerable: false,
        writable: true,
        value: window.URL,
      });

      // When script replaces URL and sets legacy Window state.
      expect(window.eval("const original = webkitURL; URL = null; webkitURL === original")).toBe(
        true,
      );
      window.name = "first";
      expect(window.eval("status = 42; status")).toBe("42");

      // Then the other Window still has its defaults.
      expect(window.name).toBe("first");
      expect(second.window.name).toBe("");
      expect(second.window.status).toBe("");
    } finally {
      first.window.close();
      second.window.close();
    }
  });
});

it("exposes streaming text encoders and decoders in the Window realm", () => {
  // Given a scripted Window with its own typed arrays.
  const { window } = new JSDOM("", { runScripts: "outside-only" });
  try {
    // When script encodes a supplementary character and decodes it in two chunks.
    expect(
      window.eval(`(() => {
      const encoder = new TextEncoder();
      const bytes = encoder.encode("𝄞");
      const target = new Uint8Array(3);
      const progress = encoder.encodeInto("𝄞", target);
      const decoder = new TextDecoder();
      return [bytes instanceof Uint8Array, bytes.buffer instanceof ArrayBuffer,
        progress.read, progress.written, decoder.decode(bytes.subarray(0, 2), { stream: true }),
        decoder.decode(bytes.subarray(2)), new TextDecoder("windows-1252").decode(Uint8Array.of(128))];
    })()`),
    ).toEqual([true, true, 0, 0, "", "𝄞", "€"]);

    // Then conversion errors are instances of the script's error constructors.
    expect(
      window.eval(`(() => {
      try { new TextDecoder("replacement"); }
      catch (error) { return error instanceof RangeError; }
    })()`),
    ).toBe(true);
  } finally {
    window.close();
  }
});

it("queues channel messages until start and transfers ArrayBuffer ownership", async () => {
  // Given a channel in a Window with a receiver that has not started.
  const { window } = new JSDOM("", { runScripts: "outside-only" });
  try {
    const result = window.eval(`(async () => {
      const channel = new MessageChannel();
      const buffer = Uint8Array.of(17).buffer;
      let synchronousDelivery = false;
      const received = new Promise(resolve => {
        channel.port2.addEventListener("message", event => {
          synchronousDelivery = true;
          resolve([event instanceof MessageEvent, event.target === channel.port2,
            event.isTrusted, new Uint8Array(event.data)[0]]);
        });
      });
      channel.port1.postMessage(buffer, [buffer]);
      await new Promise(resolve => setTimeout(resolve, 0));
      const beforeStart = synchronousDelivery;
      channel.port2.start();
      const result = await received;
      channel.port1.close();
      channel.port2.close();
      return [beforeStart, buffer.byteLength, ...result];
    })()`);
    // Then transfer detaches synchronously and delivery uses the Window's event interfaces.
    expect(await result).toEqual([false, 0, true, true, true, 17]);
  } finally {
    window.close();
  }
});

it("delivers cloned channel payloads with receiving Window prototypes", async () => {
  // Given a graph that contains a cycle, shared typed-array storage, and a Blob.
  const { window } = new JSDOM("", { runScripts: "outside-only" });
  try {
    const result = window.eval(`(async () => {
      const channel = new MessageChannel();
      const bytes = Uint8Array.of(9);
      const payload = { bytes, buffer: bytes.buffer, blob: new Blob(["hello"]) };
      payload.map = new Map([[payload, bytes]]);
      const received = new Promise(resolve => { channel.port2.onmessage = event => resolve(event.data); });
      channel.port1.postMessage(payload);
      const copy = await received;
      channel.port1.close();
      return [copy !== payload, Object.getPrototypeOf(copy) === Object.prototype,
        copy.map instanceof Map, copy.map.get(copy) === copy.bytes,
        copy.bytes instanceof Uint8Array, copy.buffer instanceof ArrayBuffer,
        copy.bytes.buffer === copy.buffer, await copy.blob.text()];
    })()`);
    // Then the cloned graph keeps its topology and uses the receiving realm.
    expect(await result).toEqual([true, true, true, true, true, true, true, "hello"]);
  } finally {
    window.close();
  }
});

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom 30.1.3", Constructor: reference },
])("$name historical browser objects", ({ Constructor }) => {
  it("exposes distinct replaceable bars and a legacy external object", () => {
    // Given two separate browsing contexts.
    const first = new Constructor();
    const second = new Constructor();
    try {
      const { window } = first;
      const keys = [
        "locationbar",
        "menubar",
        "personalbar",
        "scrollbars",
        "statusbar",
        "toolbar",
      ] as const;
      const bars = keys.map((key) => window[key]);
      expect(new Set(bars).size).toBe(keys.length);
      for (const [index, key] of keys.entries()) {
        expect(window[key]).toBe(bars[index]);
        expect(window[key]).toBeInstanceOf(window.BarProp);
        expect(window[key].visible).toBe(true);
      }

      // When one replaceable property is assigned another value.
      Reflect.set(window, "toolbar", "custom");

      // Then the remaining properties and the other Window retain their own identities.
      expect(Reflect.get(window, "toolbar")).toBe("custom");
      expect(window.locationbar).toBe(bars[0]);
      expect(second.window.locationbar).not.toBeInstanceOf(window.BarProp);
      expect(window.external).toBeInstanceOf(window.External);
      expect(window.external.AddSearchProvider()).toBeUndefined();
      expect(window.external.IsSearchProviderInstalled()).toBeUndefined();
    } finally {
      first.window.close();
      second.window.close();
    }
  });
});

it("rejects nested DOM nodes and untransferred ports during message serialization", () => {
  // Given a scripted Window and an array buffer that could otherwise be transferred.
  const { window } = new JSDOM("", { runScripts: "outside-only" });
  try {
    const result = window.eval(`(() => {
      const { port1, port2 } = new MessageChannel();
      const results = [];
      for (const value of [document.body, port2]) {
        const buffer = new ArrayBuffer(8);
        try {
          port1.postMessage({ payload: new Map([[0, value]]) }, [buffer]);
          results.push("accepted");
        } catch (error) {
          results.push(error instanceof DOMException, error.name, buffer.byteLength);
        }
      }
      return results;
    })()`);
    // Then the clone fails in the sending realm before ownership changes.
    expect(result).toEqual([true, "DataCloneError", 8, true, "DataCloneError", 8]);
  } finally {
    window.close();
  }
});
