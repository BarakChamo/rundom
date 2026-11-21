// Exercises Window identity and resource lifecycle for connected frames.
import { runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { JSDOM, requestInterceptor } from "@run-dom/jsdom";

describe("Window frames", () => {
  it("preserves the initial navigation window and a storage event queued before first access", async () => {
    // Given an external iframe with resource loading disabled and a cached parent Storage.
    const { window } = new JSDOM("", { url: "https://parent.example/page" });
    try {
      const area = window.localStorage;
      const frame = window.document.createElement("iframe");
      if (!(frame instanceof window.HTMLIFrameElement)) throw new Error("Expected an iframe");
      frame.src = "child";
      frame.name = "child";
      const body = window.document.body;
      if (!body) throw new Error("Expected a document body");
      body.append(frame);
      const connectedAt = performance.timeOrigin + performance.now();

      // When storage changes before any script has observed the initial child Window.
      area.setItem("before-access", "value");
      const child = frame.contentWindow as typeof window;
      const received = new Promise<void>((resolve) => {
        child.addEventListener(
          "storage",
          (event) => {
            expect(Reflect.get(event, "key")).toBe("before-access");
            expect(Reflect.get(event, "storageArea") === child.localStorage).toBe(true);
            resolve();
          },
          { once: true },
        );
      });

      // Then all access paths expose the insertion-time realm and its pending event.
      expect(window[0] === child && Reflect.get(window, "child") === child).toBe(true);
      expect(child.parent === window && child.document === frame.contentDocument).toBe(true);
      expect(child.performance.timeOrigin).toBeLessThanOrEqual(connectedAt);
      expect(child.document.baseURI).toBe("https://parent.example/page");
      expect(child.document.documentElement).toBeNull();
      await received;
    } finally {
      window.close();
    }
  });

  it("keeps a blank iframe's load position when its document is first read from an earlier microtask", async () => {
    // Given a microtask queued before the frame is attached.
    const { window } = new JSDOM();
    try {
      const frame = window.document.createElement("iframe");
      if (!(frame instanceof window.HTMLIFrameElement)) throw new Error("Expected an iframe");
      const order: string[] = [];
      queueMicrotask(() => {
        const doc = frame.contentDocument as typeof window.document;
        order.push(doc.readyState);
        doc.addEventListener("DOMContentLoaded", () => order.push("document"));
      });
      frame.addEventListener("load", () => order.push("frame"));
      // When attachment reserves the child load ahead of the next promise continuation.
      window.document.body?.append(frame);
      await Promise.resolve();
      // Then listeners observe the original document and its original position in the queue.
      expect(order).toEqual(["loading", "document", "frame"]);
      expect((frame.contentDocument as typeof window.document).readyState).toBe("complete");
    } finally {
      window.close();
    }
  });

  it.each([undefined, "dangerously"] as const)(
    "completes a dynamically inserted blank iframe before promise continuations (%s)",
    async (runScripts) => {
      const { window } = new JSDOM("", runScripts ? { runScripts } : {});
      try {
        await new Promise<void>((resolve) => window.addEventListener("load", () => resolve()));
        const frame = window.document.createElement("iframe");
        const body = window.document.body;
        if (!(frame instanceof window.HTMLIFrameElement) || !body)
          throw new Error("Expected a frame and document body");
        const loaded: string[] = [];
        const readyState = () =>
          (frame.contentDocument as typeof window.document | null)?.readyState;
        frame.addEventListener("load", () => loaded.push(readyState() ?? ""));
        body.append(frame);
        await Promise.resolve();
        expect(readyState()).toBe("complete");
        expect(loaded).toEqual(["complete"]);
      } finally {
        window.close();
      }
    },
  );

  it.each(["", "async", "defer"])(
    "stops pending frame scripts without firing load (%s)",
    async (mode) => {
      const started = Promise.withResolvers<void>();
      const canceled = Promise.withResolvers<void>();
      const { window } = new JSDOM("<iframe></iframe>", {
        url: "https://example.test/",
        runScripts: "dangerously",
        resources: {
          interceptors: [
            requestInterceptor((request) => {
              started.resolve();
              return new Promise<Response>((_, reject) => {
                request.signal.addEventListener(
                  "abort",
                  () => {
                    canceled.resolve();
                    reject(request.signal.reason);
                  },
                  { once: true },
                );
              });
            }),
          ],
        },
      });
      try {
        const frame = window.document.querySelector("iframe");
        if (!(frame instanceof window.HTMLIFrameElement)) throw new Error("Expected a frame");
        const parentLoaded = new Promise<void>((resolve) =>
          window.addEventListener("load", () => resolve(), { once: true }),
        );
        const events: string[] = [];
        frame.addEventListener("load", () => events.push("frame"));
        frame.srcdoc = `<script src="/pending.js" ${mode}></script><script>window.afterStop = true</script>`;
        await started.promise;
        const child = frame.contentWindow as typeof window | null;
        if (!child) throw new Error("Expected a child window");
        child.addEventListener("load", () => events.push("child"));
        child.stop();

        await canceled.promise;
        await parentLoaded;
        expect(events).toEqual([]);
        expect(Reflect.get(child, "afterStop")).toBe(mode ? true : undefined);
      } finally {
        window.close();
      }
    },
  );

  it("runs deferred scripts in order before DOMContentLoaded and lets async scripts finish later", async () => {
    const asyncResponse = Promise.withResolvers<Response>();
    const firstResponse = Promise.withResolvers<Response>();
    const requests: string[] = [];
    const { window } = new JSDOM(
      '<script>window.steps = []</script><script defer src="/first"></script>' +
        '<script defer src="/second"></script><script async src="/async"></script>' +
        '<p id="parsed"></p><script>steps.push("inline")</script>',
      {
        url: "https://example.test/",
        runScripts: "dangerously",
        resources: {
          interceptors: [
            requestInterceptor((request) => {
              const path = new URL(request.url).pathname;
              requests.push(path);
              if (path === "/first") return firstResponse.promise;
              if (path === "/async") return asyncResponse.promise;
              return new Response('steps.push("second")');
            }),
          ],
        },
      },
    );
    try {
      const steps = Reflect.get(window, "steps");
      expect(steps).toEqual(["inline"]);
      const loaded = new Promise<void>((resolve) =>
        window.addEventListener("load", () => resolve()),
      );
      const ready = new Promise<void>((resolve) =>
        window.document.addEventListener("DOMContentLoaded", () => resolve()),
      );
      firstResponse.resolve(new Response('steps.push(document.readyState); steps.push("first")'));
      await ready;
      expect(requests).toEqual(["/first", "/second", "/async"]);
      expect(steps).toEqual(["inline", "interactive", "first", "second"]);
      asyncResponse.resolve(new Response('steps.push("async")'));
      await loaded;
      expect(steps).toEqual(["inline", "interactive", "first", "second", "async"]);
    } finally {
      window.close();
    }
  });

  it.each([
    {
      tag: "iframe",
      markup: '<iframe src="/pending"></iframe>',
      type: "text/html",
      body: "<p>child</p>",
    },
    {
      tag: "link",
      markup: '<link rel="stylesheet" href="/pending">',
      type: "text/css",
      body: "p { color: red }",
    },
  ])("fires DOMContentLoaded before a pending $tag loads", async ({ tag, markup, type, body }) => {
    const response = Promise.withResolvers<Response>();
    const { window } = new JSDOM(markup, {
      url: "https://example.test/",
      resources: { interceptors: [requestInterceptor(() => response.promise)] },
    });
    try {
      const events: string[] = [];
      const resource = window.document.querySelector(tag);
      if (!resource) throw new Error("Expected a resource element");
      resource.addEventListener("load", () => events.push(tag));
      const loaded = new Promise<void>((resolve) =>
        window.addEventListener("load", () => {
          events.push("window");
          resolve();
        }),
      );
      window.document.addEventListener("DOMContentLoaded", () => {
        events.push("document");
        response.resolve(
          new Response(body, {
            headers: { "Content-Type": type },
          }),
        );
      });
      await loaded;
      expect(events).toEqual(["document", tag, "window"]);
    } finally {
      response.resolve(new Response(""));
      window.close();
    }
  });

  it.each([
    { media: "screen", before: undefined, after: "rgb(255, 0, 0)" },
    { media: "print", before: "rgb(0, 0, 0)", after: "rgb(0, 0, 0)" },
  ])(
    "uses stylesheet media $media to decide whether an inline script waits",
    async ({ media, before, after }) => {
      const stylesheet = Promise.withResolvers<Response>();
      const requested = Promise.withResolvers<void>();
      const { window } = new JSDOM(
        `<link rel="stylesheet" media="${media}" href="/style.css"><p>target</p>` +
          '<script>window.colorAtScript = getComputedStyle(document.querySelector("p")).color</script>',
        {
          url: "https://example.test/",
          runScripts: "dangerously",
          resources: {
            interceptors: [
              requestInterceptor(() => {
                requested.resolve();
                return stylesheet.promise;
              }),
            ],
          },
        },
      );
      try {
        const loaded = new Promise<void>((resolve) =>
          window.addEventListener("load", () => resolve()),
        );
        await requested.promise;
        expect(Reflect.get(window, "colorAtScript")).toBe(before);
        stylesheet.resolve(
          new Response("p { color: red }", { headers: { "Content-Type": "text/css" } }),
        );
        await loaded;
        expect(Reflect.get(window, "colorAtScript")).toBe(after);
      } finally {
        stylesheet.resolve(new Response(""));
        window.close();
      }
    },
  );

  it("keeps disabled and alternate stylesheets out of the cascade until enabled", async () => {
    const requests: string[] = [];
    const { window } = new JSDOM(
      '<style>p { color: red }</style><link rel="stylesheet" href="/disabled.css" disabled>' +
        '<link rel="alternate stylesheet" title="Night" href="/alternate.css"><p>target</p>',
      {
        url: "https://example.test/",
        resources: {
          interceptors: [
            requestInterceptor((request) => {
              const path = new URL(request.url).pathname;
              requests.push(path);
              return new Response(
                path === "/disabled.css" ? "p { color: blue }" : "p { color: green }",
                {
                  headers: { "Content-Type": "text/css" },
                },
              );
            }),
          ],
        },
      },
    );
    try {
      await new Promise<void>((resolve) => window.addEventListener("load", () => resolve()));
      const target = window.document.querySelector("p");
      const disabled = window.document.querySelector("link[disabled]");
      const alternate = window.document.querySelector("link[title]");
      const style = window.document.querySelector("style");
      if (
        !target ||
        !(disabled instanceof window.HTMLLinkElement) ||
        !(alternate instanceof window.HTMLLinkElement) ||
        !(style instanceof window.HTMLStyleElement)
      )
        throw new Error("Expected three stylesheets and a target");
      const color = () => window.getComputedStyle(target).color;
      expect(requests).toEqual(["/alternate.css"]);
      expect(color()).toBe("rgb(255, 0, 0)");
      style.disabled = true;
      expect(style.sheet?.disabled).toBe(true);
      expect(style.hasAttribute("disabled")).toBe(false);
      expect(color()).toBe("rgb(0, 0, 0)");
      alternate.disabled = false;
      expect(color()).toBe("rgb(0, 128, 0)");
      alternate.disabled = true;

      const enabled = new Promise<void>((resolve) =>
        disabled.addEventListener("load", () => resolve()),
      );
      disabled.disabled = false;
      await enabled;
      expect(requests).toEqual(["/alternate.css", "/disabled.css"]);
      expect(color()).toBe("rgb(0, 0, 255)");
    } finally {
      window.close();
    }
  });

  it("cancels obsolete stylesheet requests and removes sheets when link attributes change", async () => {
    const started = Promise.withResolvers<void>();
    const canceled = Promise.withResolvers<void>();
    let requests = 0;
    const { window } = new JSDOM('<link rel="stylesheet" href="/sheet.css"><p>target</p>', {
      url: "https://example.test/",
      resources: {
        interceptors: [
          requestInterceptor((request) => {
            if (++requests > 1)
              return new Response("p { color: blue }", { headers: { "Content-Type": "text/css" } });
            started.resolve();
            return new Promise<Response>((_, reject) => {
              request.signal.addEventListener(
                "abort",
                () => {
                  canceled.resolve();
                  reject(request.signal.reason);
                },
                { once: true },
              );
            });
          }),
        ],
      },
    });
    try {
      const link = window.document.querySelector("link");
      const target = window.document.querySelector("p");
      if (!(link instanceof window.HTMLLinkElement) || !target)
        throw new Error("Expected a stylesheet link");
      await started.promise;
      link.rel = "preload";
      await canceled.promise;
      expect(link.sheet).toBeNull();

      const loaded = new Promise<void>((resolve) => link.addEventListener("load", () => resolve()));
      link.rel = "stylesheet";
      await loaded;
      expect(requests).toBe(2);
      expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 255)");
      link.removeAttribute("href");
      expect(link.sheet).toBeNull();
      expect(window.document.styleSheets.length).toBe(0);
      expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 0)");
    } finally {
      window.close();
    }
  });

  it("reloads a stylesheet when its ancestor is removed and reinserted", async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const firstResponse = Promise.withResolvers<Response>();
    let requests = 0;
    const { window } = new JSDOM(
      '<div><link rel="stylesheet" href="/sheet.css"></div><p>target</p>',
      {
        url: "https://example.test/",
        resources: {
          interceptors: [
            requestInterceptor((request) => {
              if (++requests > 1)
                return new Response("p { color: blue }", {
                  headers: { "Content-Type": "text/css" },
                });
              started.resolve(request.signal);
              return firstResponse.promise;
            }),
          ],
        },
      },
    );
    try {
      const link = window.document.querySelector("link");
      const target = window.document.querySelector("p");
      const container = link?.parentElement;
      const body = window.document.body;
      if (!(link instanceof window.HTMLLinkElement) || !container || !target || !body)
        throw new Error("Expected a stylesheet link and target");
      const signal = await started.promise;
      container.remove();
      expect(signal.aborted).toBe(true);
      const loaded = new Promise<void>((resolve) =>
        link.addEventListener("load", () => resolve(), { once: true }),
      );
      body.append(container);
      firstResponse.resolve(
        new Response("p { color: red }", { headers: { "Content-Type": "text/css" } }),
      );
      await loaded;
      expect(requests).toBe(2);
      expect(window.getComputedStyle(target).color).toBe("rgb(0, 0, 255)");
      container.remove();
      expect(link.sheet).toBeNull();
      expect(window.document.styleSheets.length).toBe(0);
    } finally {
      firstResponse.resolve(new Response(""));
      window.close();
    }
  });

  it("resolves a parser-created frame against a base added after an inline script", async () => {
    const requests: string[] = [];
    const { window } = new JSDOM(
      '<script>document.baseURI</script><base href="/assets/"><iframe src="child"></iframe>',
      {
        url: "https://example.test/",
        runScripts: "dangerously",
        resources: {
          interceptors: [
            requestInterceptor(({ url }) => {
              requests.push(url);
              return new Response("<p>loaded</p>", { headers: { "Content-Type": "text/html" } });
            }),
          ],
        },
      },
    );
    try {
      await new Promise<void>((resolve) =>
        window.addEventListener("load", () => resolve(), { once: true }),
      );
      expect(requests).toEqual(["https://example.test/assets/child"]);
    } finally {
      window.close();
    }
  });

  it("loads XML and XHTML frames using their response media types", async () => {
    const { window } = new JSDOM("", {
      url: "https://example.test/",
      resources: {
        interceptors: [
          requestInterceptor(({ url }) =>
            url.endsWith(".xhtml")
              ? new Response('<html xmlns="http://www.w3.org/1999/xhtml"><body>é</body></html>\n', {
                  headers: { "Content-Type": "application/xhtml+xml;charset=UTF-8" },
                })
              : new Response(url.endsWith("/broken.xml") ? "<root>" : "<Root><Child/></Root>\n", {
                  headers: { "Content-Type": "text/xml" },
                }),
          ),
        ],
      },
    });
    try {
      const body = window.document.body;
      if (!body) throw new Error("Expected the document body");
      const load = async (path: string) => {
        const frame = window.document.createElement("iframe");
        if (!(frame instanceof window.HTMLIFrameElement)) throw new Error("Expected an iframe");
        const loaded = new Promise<void>((resolve, reject) => {
          frame.addEventListener("load", () => resolve(), { once: true });
          frame.addEventListener("error", () => reject(new Error("Expected a frame document")));
        });
        frame.src = path;
        body.appendChild(frame);
        await loaded;
        return frame.contentDocument as typeof window.document | null;
      };
      const xml = await load("/frame.xml");
      expect(xml?.contentType).toBe("text/xml");
      expect(xml?.body).toBeNull();
      expect(xml?.documentElement?.tagName).toBe("Root");
      expect(xml?.createElementNS(null, "MixedCase").tagName).toBe("MixedCase");
      const xhtml = await load("/frame.xhtml");
      expect(xhtml?.contentType).toBe("application/xhtml+xml");
      expect(xhtml?.characterSet).toBe("UTF-8");
      expect(xhtml?.documentElement?.textContent).toBe("é");
      const malformed = await load("/broken.xml");
      expect(malformed?.documentElement?.localName).toBe("parsererror");
    } finally {
      window.close();
    }
  });

  it("returns the loaded same-origin SVG document through getSVGDocument", async () => {
    // Given an iframe loader serving identical XML bytes under different media types and origins
    const { window } = new JSDOM("", {
      url: "https://example.test/",
      resources: {
        interceptors: [
          requestInterceptor(
            ({ url }) =>
              new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
                headers: { "Content-Type": url.endsWith(".svg") ? "image/svg+xml" : "text/xml" },
              }),
          ),
        ],
      },
    });
    try {
      const frame = window.document.createElement("iframe");
      if (!(frame instanceof window.HTMLIFrameElement)) throw new Error("Expected an iframe");
      expect(frame.getSVGDocument()).toBeNull();
      window.document.body?.appendChild(frame);

      const load = async (url: string) => {
        const loaded = new Promise<void>((resolve, reject) => {
          frame.addEventListener("load", () => resolve(), { once: true });
          frame.addEventListener("error", () => reject(new Error("Expected a frame document")));
        });
        frame.src = url;
        await loaded;
      };

      // When navigation loads a same-origin SVG response
      await load("/picture.svg");
      // Then the legacy method returns that exact document
      expect(frame.getSVGDocument()).toBe(frame.contentDocument);
      expect(frame.getSVGDocument()).not.toBeNull();
      Object.defineProperty(frame, "contentDocument", { value: null });
      expect(frame.getSVGDocument()).not.toBeNull();

      await load("/picture.xml");
      expect(frame.getSVGDocument()).toBeNull();
      await load("https://other.test/picture.svg");
      expect(frame.getSVGDocument()).toBeNull();
    } finally {
      window.close();
    }
  });

  it("resolves an adopted iframe and its navigation in the receiving document", async () => {
    const left = new JSDOM("<iframe></iframe>", { url: "https://left.test/" });
    const requests: string[] = [];
    const right = new JSDOM('<base href="/assets/">', {
      url: "https://right.test/",
      resources: {
        interceptors: [
          requestInterceptor((request) => {
            requests.push(request.url);
            return new Response("<p>adopted</p>", { headers: { "Content-Type": "text/html" } });
          }),
        ],
      },
    });
    try {
      const frame = left.window.document.querySelector("iframe");
      if (!(frame instanceof left.window.HTMLIFrameElement)) throw new Error("Expected an iframe");
      const original = frame.contentWindow;

      right.window.document.adoptNode(frame);
      expect(left.window.length).toBe(0);
      expect(frame.contentWindow).toBeNull();
      right.window.document.body?.appendChild(frame);
      expect(frame.contentWindow).not.toBeNull();
      expect(frame.contentWindow === original).toBe(false);
      expect(frame.contentWindow === right.window[0]).toBe(true);
      expect(frame.contentDocument).toMatchObject({ baseURI: "https://right.test/assets/" });

      const loaded = new Promise<void>((resolve) =>
        frame.addEventListener("load", () => resolve(), { once: true }),
      );
      frame.src = "child";
      expect(frame.src).toBe("https://right.test/assets/child");
      await loaded;
      expect(requests).toEqual(["https://right.test/assets/child"]);
      expect(frame.contentWindow === right.window[0]).toBe(true);
      expect(frame.contentDocument).toMatchObject({ body: { textContent: "adopted" } });
    } finally {
      left.window.close();
      right.window.close();
    }
  });

  it("loads frames inside a closed shadow tree when its host connects", async () => {
    const { window } = new JSDOM("");
    try {
      const host = window.document.createElement("div");
      const shadow = host.attachShadow({ mode: "closed" });
      const frame = window.document.createElement("iframe");
      if (!(frame instanceof window.HTMLIFrameElement)) throw new Error("Expected an iframe");
      shadow.appendChild(frame);
      const loaded = new Promise<void>((resolve) =>
        frame.addEventListener("load", () => resolve(), { once: true }),
      );
      window.document.body?.appendChild(host);
      await loaded;
      const child = frame.contentWindow;
      expect(child).not.toBeNull();
      expect(window.length).toBe(0);
      expect(window[0]).toBeUndefined();
      host.remove();
      expect(frame.contentWindow).toBeNull();
      window.document.body?.appendChild(host);
      expect(frame.contentWindow === child).toBe(false);
    } finally {
      window.close();
    }
  });

  it("recreates a moved iframe and removes its index when moved into a detached tree", () => {
    const { window } = new JSDOM(
      "<main><section><iframe></iframe></section><iframe></iframe></main>",
    );
    try {
      const [first, second] = window.document.querySelectorAll("iframe");
      if (
        !(first instanceof window.HTMLIFrameElement) ||
        !(second instanceof window.HTMLIFrameElement)
      )
        throw new Error("Expected the frame fixtures");
      const subtree = first.parentElement;
      const main = subtree?.parentElement;
      if (!subtree || !main) throw new Error("Expected the frame containers");
      const previous = first.contentWindow;

      main.appendChild(subtree);
      expect(first.contentWindow === previous).toBe(false);
      expect(window[0] === second.contentWindow).toBe(true);
      expect(window[1] === first.contentWindow).toBe(true);

      window.document.createElement("div").appendChild(subtree);
      expect(window.length).toBe(1);
      expect(window[1]).toBeUndefined();
    } finally {
      window.close();
    }
  });

  it("retains the indexed getter's association with the frame after reinsertion", () => {
    // Given the own accessor for the first connected frame
    const { window } = new JSDOM("<iframe></iframe>");
    try {
      const frame = window.document.querySelector("iframe");
      const getter = Object.getOwnPropertyDescriptor(window, "0")?.get;
      if (!(frame instanceof window.HTMLIFrameElement) || !getter)
        throw new Error("Expected an indexed frame accessor");
      const original = getter.call(window);

      // When the same frame is removed and reinserted
      frame.remove();
      expect(getter.call(window) === original).toBe(true);
      window.document.body?.appendChild(frame);

      // Then the original getter resolves the current child of that frame
      expect(getter.call(window) === frame.contentWindow).toBe(true);
      expect(getter.call(window) === original).toBe(false);
    } finally {
      window.close();
    }
  });

  it("preserves frame order across blank frames, scripts, and removal", () => {
    const { window } = new JSDOM(
      `
      <iframe id="a"></iframe>
      <iframe id="b" srcdoc="<script>parent.seen = parent.frames.length</script>"></iframe>
      <iframe id="c"></iframe>
      <script>window.parsedCount = frames.length;</script>
    `,
      { runScripts: "dangerously" },
    );
    try {
      expect(window.eval("[seen, parsedCount]")).toEqual([1, 3]);
      const [a, b, c] = window.document.querySelectorAll("iframe");
      if (
        !(a instanceof window.HTMLIFrameElement) ||
        !(b instanceof window.HTMLIFrameElement) ||
        !(c instanceof window.HTMLIFrameElement)
      )
        throw new Error("Expected frame fixtures");
      expect(window[0] === a.contentWindow).toBe(true);
      expect(window[1] === b.contentWindow).toBe(true);
      expect(window[2] === c.contentWindow).toBe(true);
      b.remove();
      expect(window[1] === c.contentWindow).toBe(true);
      expect(window[2]).toBeUndefined();
    } finally {
      window.close();
    }
  });

  it("registers only connected frames before scripts in a rewritten document", () => {
    const { window } = new JSDOM("", { runScripts: "dangerously" });
    try {
      window.document.open();
      window.document.write(`
        <template><iframe></iframe></template>
        <iframe></iframe>
        <script>window.frameCounts = [frames.length];</script>
        <iframe></iframe>
        <script>window.frameCounts.push(frames.length);</script>
      `);
      window.document.close();
      expect(window.eval("frameCounts")).toEqual([1, 2]);
      expect(window.length).toBe(2);
    } finally {
      window.close();
    }
  });

  it("reloads a connected frame when its existing src is assigned again", async () => {
    let requests = 0;
    const { window } = new JSDOM('<iframe src="/child"></iframe>', {
      url: "https://example.test/",
      resources: {
        interceptors: [
          requestInterceptor(
            () =>
              new Response(`<p>load ${++requests}</p>`, {
                headers: { "Content-Type": "text/html" },
              }),
          ),
        ],
      },
    });
    try {
      const frame = window.document.querySelector("iframe");
      if (!(frame instanceof window.HTMLIFrameElement)) throw new Error("Expected an iframe");
      await new Promise<void>((resolve) =>
        frame.addEventListener("load", () => resolve(), { once: true }),
      );
      const firstDocument = frame.contentDocument;
      const reloaded = new Promise<void>((resolve) =>
        frame.addEventListener("load", () => resolve(), { once: true }),
      );
      frame.src = "/child";
      await reloaded;
      expect(requests).toBe(2);
      expect(frame.contentDocument === firstDocument).toBe(false);
      expect(frame.contentDocument).toMatchObject({ body: { textContent: "load 2" } });
    } finally {
      window.close();
    }
  });

  it("waits for an intercepted child and removes its index on detach", async () => {
    // Given: an HTML document with one navigated frame.
    const requests: { url: string; element: object | null }[] = [];
    const { window } = new JSDOM('<iframe src="/child"></iframe>', {
      url: "https://example.test/",
      resources: {
        interceptors: [
          requestInterceptor((request, { element }) => {
            requests.push({ url: request.url, element });
            return new Response("<p>child</p>", { headers: { "Content-Type": "text/html" } });
          }),
        ],
      },
    });
    try {
      const frame = window.document.querySelector("iframe");
      if (!(frame instanceof window.HTMLIFrameElement)) throw new Error("Frame was not parsed");

      // When: the parent finishes its load after the child document has been parsed.
      await new Promise<void>((resolve) =>
        window.addEventListener("load", () => resolve(), { once: true }),
      );

      // Then: the frame's real element was intercepted and the child is indexed.
      expect(requests).toEqual([{ url: "https://example.test/child", element: frame }]);
      expect(window.frames[0]).toBe(frame.contentWindow);
      expect(frame.contentDocument).toMatchObject({ body: { textContent: "child" } });

      frame.remove();
      expect(frame.contentWindow).toBeNull();
      expect(window.frames[0]).toBeUndefined();
      expect(window.length).toBe(0);
    } finally {
      window.close();
    }
  });
});

it("resolves live named Window properties without shadowing built-ins", () => {
  // Given: a named iframe, duplicate element IDs, and a conflicting built-in name.
  const dom = new JSDOM(
    '<iframe name="fixtureFrame" srcdoc="<p>child</p>"></iframe><div id="fixture"></div><p id="fixture"></p><div id="location"></div>',
    { runScripts: "outside-only", url: "https://example.test/" },
  );
  const { window } = dom;
  try {
    const frame = window.document.querySelector("iframe");
    if (!(frame instanceof window.HTMLIFrameElement)) throw new Error("Expected an iframe");
    const matches = Reflect.get(window, "fixture");
    expect(matches instanceof window.HTMLCollection).toBe(true);

    // When: scripts use the iframe name and an element changes its ID.
    expect(runInContext("fixtureFrame", dom.getInternalVMContext()) === frame.contentWindow).toBe(
      true,
    );
    const div = window.document.querySelector("div");
    if (!div) throw new Error("Expected the named div");
    div.id = "renamed";

    // Then: existing collections stay live, and built-in properties keep precedence.
    expect(matches.length).toBe(1);
    expect(Reflect.get(window, "fixture") === matches[0]).toBe(true);
    expect(Reflect.get(window, "renamed") === div).toBe(true);
    expect(window.location.href).toBe("https://example.test/");
    expect(frame.name).toBe("fixtureFrame");
    frame.name = "renamedFrame";
    expect(frame.getAttribute("name")).toBe("renamedFrame");
    expect(Reflect.has(window, "fixtureFrame")).toBe(false);
    expect(Reflect.get(window, "renamedFrame")).toBe(frame.contentWindow);
    frame.remove();
    expect(Reflect.has(window, "renamedFrame")).toBe(false);
  } finally {
    window.close();
  }
});

it("removes nested frame names and indices from retained windows when an ancestor frame is removed", () => {
  // Given a nested browsing context whose named access has already been read.
  const { window } = new JSDOM("<iframe></iframe>");
  try {
    const frame = window.document.querySelector("iframe");
    if (!(frame instanceof window.HTMLIFrameElement)) throw new Error("Expected a frame");
    frame.srcdoc = '<iframe name="nested"></iframe>';
    const child = frame.contentWindow;
    if (!child) throw new Error("Expected a child window");
    const nested = Reflect.get(child, "nested");
    expect(nested).toBeDefined();
    expect(nested).toBe(Reflect.get(child, "0"));

    // When the outer frame is removed.
    frame.remove();

    // Then the retained child has no remaining indexed or named frame entries.
    expect(Reflect.get(child, "length")).toBe(0);
    expect(Reflect.get(child, "0")).toBeUndefined();
    expect(Reflect.get(child, "nested") === undefined).toBe(true);
    expect(Reflect.has(child, "nested")).toBe(false);
  } finally {
    window.close();
  }
});
