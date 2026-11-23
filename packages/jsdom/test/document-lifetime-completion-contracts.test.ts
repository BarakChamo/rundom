// Checks completion of already-running algorithms and cancellation of queued navigation after document destruction.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM } = require("jsdom");

async function childFrame(w: JSDOM["window"]) {
  const frame = w.document.createElement("iframe");
  if (!(frame instanceof w.HTMLIFrameElement)) throw new Error("Expected iframe");
  const loaded = new Promise<void>((resolve) =>
    frame.addEventListener("load", () => resolve(), { once: true }),
  );
  const body = w.document.body;
  if (!body) throw new Error("Expected body");
  body.append(frame);
  await loaded;
  // The frame transport type is narrow; this fixture allocates a full same-origin Window.
  const child = frame.contentWindow as JSDOM["window"] | null;
  if (!child) throw new Error("Expected child Window");
  return { frame, child };
}

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: reference.JSDOM },
])("$name document completion lifetime", ({ Constructor }) => {
  it("preserves a blocking script's insertion point during load and nested writes", async () => {
    const { window } = new Constructor(
      `<body><i id="before"></i>
      <script src="data:text/javascript,void%200" onload="document.open();document.write('&lt;script&gt;window.nested=1&lt;/script&gt;&lt;p id=x&gt;x&lt;/p&gt;');window.seen=window.nested===1 &amp;&amp; !!document.querySelector('#x');document.close()"></script><b id="after"></b>`,
      { runScripts: "dangerously", resources: "usable" },
    );
    try {
      await new Promise<void>((resolve) =>
        window.addEventListener("load", () => resolve(), { once: true }),
      );
      expect(Reflect.get(window, "seen")).toBe(true);
      expect(Array.from(window.document.querySelectorAll("[id]"), (n) => n?.id)).toEqual([
        "before",
        "x",
        "after",
      ]);
    } finally {
      window.close();
    }
  });

  it("erases handlers in the replaced tree and leaves detached listeners active", () => {
    const { window } = new Constructor("<div></div>");
    try {
      const old = window.document.querySelector("div")!;
      const detached = window.document.createElement("span");
      const calls: string[] = [];
      for (const [target, name] of [
        [old, "old"],
        [detached, "detached"],
        [window, "window"],
      ] as const)
        target.addEventListener("ping", () => calls.push(name));
      window.document.open();
      for (const target of [old, detached, window]) target.dispatchEvent(new window.Event("ping"));
      expect(calls).toEqual(["detached"]);
    } finally {
      window.close();
    }
  });

  it("fires FileReader loadend in the same task even when load destroys its document", async () => {
    // Given: the parent retains the reader while a load listener removes its frame.
    const { window: w } = new Constructor("", { runScripts: "dangerously", resources: "usable" });
    try {
      const { frame, child } = await childFrame(w);
      const reader = new child.FileReader();
      const events: string[] = [];
      reader.addEventListener("load", () => {
        events.push("load");
        frame.remove();
      });
      const ended = new Promise<void>((resolve) =>
        reader.addEventListener("loadend", () => {
          events.push("loadend");
          resolve();
        }),
      );
      // When/Then: loadend completes the running read algorithm after removal.
      reader.readAsText(new child.Blob(["payload"]));
      await ended;
      expect(reader.result).toBe("payload");
      expect(events).toEqual(["load", "loadend"]);
    } finally {
      w.close();
    }
  }, 1000);

  it.each([false, true])(
    "finishes script load after removal in a cleanup microtask: %s",
    async (microtask) => {
      // Given: evaluation itself removes the frame, synchronously or from its queued microtask.
      const { window: w } = new Constructor("", { runScripts: "dangerously", resources: "usable" });
      try {
        const { frame, child } = await childFrame(w);
        const events: string[] = [];
        Reflect.set(child, "removeFrame", () => {
          frame.remove();
          events.push("removed");
        });
        const script = child.document.createElement("script");
        const loaded = new Promise<void>((resolve) =>
          script.addEventListener("load", () => {
            events.push("load");
            resolve();
          }),
        );
        script.setAttribute(
          "src",
          `data:text/javascript,${microtask ? "queueMicrotask(removeFrame)" : "removeFrame()"};`,
        );
        const head = child.document.head;
        if (!head) throw new Error("Expected head");
        // When/Then: completion follows evaluation and cleanup even if its document was destroyed.
        head.append(script);
        await loaded;
        expect(events).toEqual(["removed", "load"]);
      } finally {
        w.close();
      }
    },
    1000,
  );

  it.each([false, true])(
    "cancels queued location/hyperlink navigation after destruction: %s",
    async (hyperlink) => {
      // Given: a second live frame provides a completion barrier on the same task source.
      const { window: w } = new Constructor("", { runScripts: "dangerously", resources: "usable" });
      try {
        const { frame, child } = await childFrame(w);
        const { child: sentinel } = await childFrame(w);
        const events: string[] = [];
        Reflect.set(child, "record", () => events.push("navigation"));
        const ended = new Promise<void>((resolve) => Reflect.set(sentinel, "record", resolve));
        const navigate = (target: typeof child) => {
          const href = "javascript:void window.record()";
          if (hyperlink) {
            const link = target.document.createElement("a");
            if (!(link instanceof target.HTMLElement)) throw new Error("Expected hyperlink");
            link.setAttribute("href", href);
            link.click();
          } else target.location.href = href;
        };
        // When/Then: detached links can enqueue navigation for a live document, and destruction cancels it.
        navigate(child);
        frame.remove();
        navigate(sentinel);
        await ended;
        expect(events).toEqual([]);
      } finally {
        w.close();
      }
    },
    1000,
  );
});
