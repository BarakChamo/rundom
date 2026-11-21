// Checks redirect-origin state, HTTP authentication and request metadata at real local HTTP boundaries.
import { createRequire } from "node:module";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { JSDOM, VirtualConsole } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM; VirtualConsole: typeof VirtualConsole } = require("jsdom");
type XHR = InstanceType<JSDOM["window"]["XMLHttpRequest"]>;
async function completed(request: XHR): Promise<void> {
  await new Promise<void>((resolve) => {
    request.onloadend = () => resolve();
    request.send();
  });
}
async function serve(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected HTTP address");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

describe.each([
  { name: "RunDOM", Constructor: JSDOM, Console: VirtualConsole },
  { name: "jsdom", Constructor: reference.JSDOM, Console: reference.VirtualConsole },
])("$name HTTP transitions", ({ Constructor, Console }) => {
  it.each(["*", "null", "document"])(
    "retains an opaque CORS origin on a remote-to-local redirect with allow %s",
    async (allow) => {
      // Given: a cross-origin request redirects back to the initiating document origin.
      let localOrigin = "";
      const seen: (string | undefined)[] = [];
      const local = await serve((request, response) => {
        seen.push(request.headers.origin);
        response.setHeader(
          "Access-Control-Allow-Origin",
          allow === "document" ? localOrigin : allow,
        );
        response.end(request.headers.origin ?? "missing");
      });
      localOrigin = local.origin;
      const remote = await serve((request, response) => {
        response.writeHead(302, {
          "Access-Control-Allow-Origin": request.headers.origin ?? "*",
          Location: `${local.origin}/final`,
        });
        response.end();
      });
      const { window: w } = new Constructor("", {
        url: `${local.origin}/document`,
        virtualConsole: new Console(),
      });
      try {
        const request = new w.XMLHttpRequest();
        request.open("GET", `${remote.origin}/redirect`);
        // When/Then: redirect taint governs both the wire Origin and final CORS check.
        await completed(request);
        expect(seen).toEqual(["null"]);
        expect(request.status).toBe(allow === "document" ? 0 : 200);
        if (allow !== "document") expect(request.responseText).toBe("null");
      } finally {
        w.close();
        await remote.close();
        await local.close();
      }
    },
  );

  it("retains Basic authorization through a same-origin redirect after a challenge", async () => {
    // Given: authentication succeeds at the source before it redirects to the final resource.
    const authorization = "Basic " + Buffer.from("user:password").toString("base64");
    const server = await serve((request, response) => {
      if (request.url === "/start" && request.headers.authorization !== authorization)
        response.writeHead(401, { "WWW-Authenticate": 'Basic realm="source"' }).end();
      else if (request.url === "/start") response.writeHead(302, { Location: "/final" }).end();
      else response.end(request.headers.authorization ?? "missing");
    });
    const { window: w } = new Constructor("", { url: server.origin });
    try {
      const request = new w.XMLHttpRequest();
      request.open("GET", "/start", true, "user", "password");
      // When/Then: same-origin redirect state retains the successful challenge response.
      await completed(request);
      expect(request.status).toBe(200);
      expect(request.responseText).toBe(authorization);
    } finally {
      w.close();
      await server.close();
    }
  });

  it("preserves an explicit content type when a 303 redirects an existing GET", async () => {
    // Given: a GET already has no body, so the 303 does not rewrite its method/body headers.
    const server = await serve((request, response) => {
      if (request.url === "/start") response.writeHead(303, { Location: "/final" }).end();
      else response.end(request.headers["content-type"] ?? "missing");
    });
    const { window: w } = new Constructor("", { url: server.origin });
    try {
      const request = new w.XMLHttpRequest();
      request.open("GET", `${server.origin}/start`);
      request.setRequestHeader("Content-Type", "application/x-pony");
      // When/Then: an unchanged GET keeps the authored header.
      await completed(request);
      expect(request.responseText).toBe("application/x-pony");
    } finally {
      w.close();
      await server.close();
    }
  });

  it("retries a Basic challenge and retains explicit credentials when reusing an XHR", async () => {
    // Given: credentials supplied to open() are used only after a Basic challenge.
    const seen: (string | undefined)[] = [];
    const server = await serve((request, response) => {
      seen.push(request.headers.authorization);
      if (!request.headers.authorization)
        response.writeHead(401, { "WWW-Authenticate": 'Basic realm="example"' }).end("challenge");
      else response.end(request.headers.authorization);
    });
    const { window: w } = new Constructor("", { url: server.origin });
    try {
      const request = new w.XMLHttpRequest();
      request.open("GET", `${server.origin}/auth`, true, "user", "pass");
      // When/Then: the challenge is transparent, and a later open without credentials can authenticate.
      await completed(request);
      expect(request.status).toBe(200);
      expect(request.responseText).toBe("Basic dXNlcjpwYXNz");
      expect(seen.slice(0, 2)).toEqual([undefined, "Basic dXNlcjpwYXNz"]);
      request.open("GET", `${server.origin}/auth`);
      await completed(request);
      expect(request.responseText).toBe("Basic dXNlcjpwYXNz");
      request.open("GET", `${server.origin}/auth`);
      request.setRequestHeader("Authorization", "Basic ZXhwbGljaXQ6cGFzcw==");
      await completed(request);
      expect(request.responseText).toBe("Basic ZXhwbGljaXQ6cGFzcw==");
    } finally {
      w.close();
      await server.close();
    }
  });

  it("uses the document URL for the XHR referrer independently of a base element", async () => {
    // Given: the document base URL changes relative request resolution, not the referrer source.
    const server = await serve((request, response) =>
      response.end(request.headers.referer ?? "missing"),
    );
    const { window: w } = new Constructor('<base href="/assets/">', {
      url: `${server.origin}/document?query`,
    });
    try {
      const request = new w.XMLHttpRequest();
      request.open("GET", "resource");
      // When/Then: document metadata reaches the wire.
      await completed(request);
      expect(request.responseText).toBe(`${server.origin}/document?query`);
    } finally {
      w.close();
      await server.close();
    }
  });

  it.each([false, true])(
    "decodes compressed bytes with coherent progress when cross-origin=%s",
    async (crossOrigin) => {
      // Given: the HTTP representation has a compressed length distinct from its decoded size.
      const text = "compressible payload ".repeat(2048);
      const compressed = gzipSync(text);
      const server = await serve((_request, response) => {
        response.writeHead(200, {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
          "Content-Encoding": "gzip",
          "Content-Length": compressed.byteLength,
        });
        response.end(compressed);
      });
      const { window: w } = new Constructor("", {
        url: crossOrigin ? "http://different.example/" : server.origin,
      });
      try {
        const request = new w.XMLHttpRequest();
        request.open("GET", server.origin);
        const progress: { loaded: number; total: number; lengthComputable: boolean }[] = [];
        request.addEventListener("loadend", (event) => {
          if (event instanceof w.ProgressEvent)
            progress.push({
              loaded: event.loaded,
              total: event.total,
              lengthComputable: event.lengthComputable,
            });
        });
        // When/Then: callers see decoded content and original metadata, with consistent byte accounting.
        await completed(request);
        expect(request.responseText).toBe(text);
        expect(request.getResponseHeader("content-encoding")).toBe(crossOrigin ? null : "gzip");
        expect(request.getResponseHeader("content-length")).toBe(String(compressed.byteLength));
        expect(progress).toHaveLength(1);
        const final = progress[0];
        if (!final) throw new Error("Expected loadend progress");
        if (final.lengthComputable) {
          expect(final.total).toBe(compressed.byteLength);
          expect(final.loaded).toBe(final.total);
        } else {
          expect(final.total).toBe(0);
          expect(final.loaded).toBe(Buffer.byteLength(text));
        }
      } finally {
        w.close();
        await server.close();
      }
    },
  );

  it("emits another LOADING notification when later response bytes arrive", async () => {
    // Given: a response has two chunks separated beyond the progress notification interval.
    const server = await serve((_request, response) => {
      response.write("first");
      setTimeout(() => response.end("second"), 80);
    });
    const { window: w } = new Constructor("", { url: server.origin });
    try {
      const request = new w.XMLHttpRequest();
      let loading = 0;
      request.onreadystatechange = () => {
        if (request.readyState === 3) loading++;
      };
      request.open("GET", server.origin);
      // When/Then: incremental readers receive an update even while the numeric state stays LOADING.
      await completed(request);
      expect(loading).toBeGreaterThan(1);
      expect(request.responseText).toBe("firstsecond");
    } finally {
      w.close();
      await server.close();
    }
  });

  it("emits zero-byte progress before DONE for an empty response", async () => {
    // Given: an empty chunked response has no computable content length.
    const server = await serve((_request, response) =>
      response.writeHead(200, { "Transfer-Encoding": "chunked" }).end(),
    );
    const { window: w } = new Constructor("", { url: server.origin });
    try {
      const request = new w.XMLHttpRequest();
      const order: string[] = [];
      request.onreadystatechange = () => order.push(String(request.readyState));
      for (const type of ["loadstart", "progress", "load", "loadend"])
        request.addEventListener(type, () => order.push(type));
      request.open("GET", server.origin);
      // When/Then: completion still publishes the final progress boundary before the DONE transition.
      await completed(request);
      expect(order).toEqual(["1", "loadstart", "2", "progress", "4", "load", "loadend"]);
    } finally {
      w.close();
      await server.close();
    }
  });

  it("finishes the original abort event sequence after upload handlers open a new request", async () => {
    // Given: abort processing reenters open/send on the same XHR during upload.onabort.
    const { window: w } = new Constructor();
    try {
      const request = new w.XMLHttpRequest();
      const order: string[] = [];
      request.upload.onloadstart = () => {
        order.push(`start:${request.readyState}`);
        request.abort();
        order.push(`after:${request.readyState}`);
      };
      request.upload.onabort = () => {
        order.push(`upload-abort:${request.readyState}`);
        request.open("GET", "data:,new");
        request.send();
      };
      request.onabort = () => order.push(`abort:${request.readyState}`);
      request.onloadend = () => order.push(`end:${request.readyState}`);
      // When/Then: the old operation delivers its remaining events without clearing the new active request.
      await new Promise<void>((resolve) => {
        request.onload = () => {
          order.push(`load:${request.readyState}`);
          resolve();
        };
        request.open("POST", "data:,old");
        request.send("body");
      });
      expect(order).toEqual([
        "start:1",
        "upload-abort:4",
        "abort:1",
        "end:1",
        "after:1",
        "load:4",
        "end:4",
      ]);
      expect(request.responseText).toBe("new");
    } finally {
      w.close();
    }
  });

  it("does not abort a completed replacement upload during reentrant DONE handling", async () => {
    // Given: the original request's DONE notification opens a new GET before abort delivery continues.
    const { window: w } = new Constructor();
    try {
      const request = new w.XMLHttpRequest();
      const events: string[] = [];
      let reopening = false;
      request.onloadstart = () => {
        if (!reopening) {
          reopening = true;
          request.abort();
        }
      };
      request.onreadystatechange = () => {
        if (reopening && request.readyState === 4) {
          request.onreadystatechange = null;
          request.open("GET", "data:,new");
          request.send();
        }
      };
      request.upload.onabort = () => events.push("upload-abort");
      request.upload.onloadend = () => events.push("upload-end");
      request.onabort = () => events.push("abort");
      // When/Then: the replacement GET has no pending upload, while the original request still emits abort.
      await new Promise<void>((resolve) => {
        request.onload = () => resolve();
        request.open("POST", "data:,old");
        request.send("body");
      });
      expect(events).toEqual(["abort"]);
      expect(request.responseText).toBe("new");
    } finally {
      w.close();
    }
  });

  it.each(["open", "send"])("rejects %s after the owning frame has been removed", (operation) => {
    // Given: the request's associated browsing context has been closed by removing its frame.
    const { window: w } = new Constructor("<iframe></iframe>");
    try {
      const frame = w.document.querySelector("iframe");
      if (!(frame instanceof w.HTMLIFrameElement) || !frame.contentWindow)
        throw new Error("Expected frame");
      const ChildXHR: typeof w.XMLHttpRequest = Reflect.get(frame.contentWindow, "XMLHttpRequest");
      const request = new ChildXHR();
      if (operation === "send") request.open("GET", "data:,text");
      frame.remove();
      // When/Then: neither starting nor sending a request silently uses the detached Window.
      expect(() =>
        operation === "open" ? request.open("GET", "data:,text") : request.send(),
      ).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
    } finally {
      w.close();
    }
  });

  it("rejects forbidden method override tokens without rejecting quoted commas", async () => {
    // Given: method-override fields may not tunnel forbidden HTTP methods.
    const server = await serve((request, response) =>
      response.end(request.headers["x-http-method-override"] ?? "missing"),
    );
    const { window: w } = new Constructor("", { url: server.origin });
    try {
      for (const [value, expected] of [
        ["GET, trace", "missing"],
        ['",TRACE,",', '",TRACE,",'],
        ["GETTRACE", "GETTRACE"],
      ]) {
        const request = new w.XMLHttpRequest();
        request.open("POST", server.origin);
        request.setRequestHeader("X-HTTP-Method-Override", value ?? "");
        // When/Then: only unquoted forbidden method tokens suppress the complete field.
        await completed(request);
        expect(request.responseText).toBe(expected);
      }
    } finally {
      w.close();
      await server.close();
    }
  });

  it("marks native request lifecycle events trusted while authored dispatch stays untrusted", async () => {
    // Given: lifecycle dispatch originates inside the request implementation.
    const { window: w } = new Constructor();
    try {
      const request = new w.XMLHttpRequest();
      const trusted: boolean[] = [];
      for (const type of ["readystatechange", "loadstart", "progress", "load", "loadend"])
        request.addEventListener(type, (event) => trusted.push(event.isTrusted));
      request.open("GET", "data:,text");
      // When/Then: real transitions are trusted, but redispatching authored events is not.
      await completed(request);
      expect(trusted.length).toBeGreaterThanOrEqual(7);
      expect(trusted.every(Boolean)).toBe(true);
      request.dispatchEvent(new w.Event("progress"));
      expect(trusted.at(-1)).toBe(false);
    } finally {
      w.close();
    }
  });

  it("does not enable upload progress by registering listeners after send", async () => {
    // Given: the upload-listener flag is captured when sending begins.
    const server = await serve((request, response) => {
      request.resume();
      request.on("end", () => response.end("done"));
    });
    const { window: w } = new Constructor("", { url: server.origin });
    try {
      const request = new w.XMLHttpRequest();
      const uploadEvents: string[] = [];
      const finished = new Promise<void>((resolve) => {
        request.onloadend = () => resolve();
      });
      request.open("POST", server.origin);
      request.send("body");
      // When/Then: late callbacks do not retroactively enable upload events or preflight behavior.
      for (const type of ["progress", "load", "loadend"])
        request.upload.addEventListener(type, () => uploadEvents.push(type));
      await finished;
      expect(uploadEvents).toEqual([]);
      expect(request.responseText).toBe("done");
    } finally {
      w.close();
      await server.close();
    }
  });

  it("exposes ProgressEvent inherited initialization and prototype attributes", () => {
    // Given: ProgressEvent includes EventInit and numeric progress values.
    const { window: w } = new Constructor();
    try {
      const event = new w.ProgressEvent("progress", {
        bubbles: true,
        cancelable: true,
        loaded: 2,
        total: 3,
      });
      // When/Then: public readonly attributes live on the interface prototype.
      expect(event.bubbles).toBe(true);
      expect(event.cancelable).toBe(true);
      expect(event.loaded).toBe(2);
      expect(w.ProgressEvent.length).toBe(1);
      for (const name of ["lengthComputable", "loaded", "total"]) {
        expect(Object.hasOwn(event, name)).toBe(false);
        expect(Object.getOwnPropertyDescriptor(w.ProgressEvent.prototype, name)).toMatchObject({
          enumerable: true,
          configurable: true,
        });
      }
    } finally {
      w.close();
    }
  });
});

// Fetch prohibits authentication retries for CORS-tainted responses; pinned jsdom differs here.
describe("RunDOM CORS authentication", () => {
  it("does not answer a cross-origin Basic challenge with retained credentials", async () => {
    // Given: even withCredentials does not enable HTTP authentication retries for a CORS response.
    const seen: (string | undefined)[] = [];
    const local = await serve((_request, response) => response.end("local"));
    const remote = await serve((request, response) => {
      seen.push(request.headers.authorization);
      response.setHeader("Access-Control-Allow-Origin", local.origin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      if (!request.headers.authorization)
        response.writeHead(401, { "WWW-Authenticate": 'Basic realm="remote"' }).end("challenge");
      else response.end("unexpected retry");
    });
    const { window: w } = new JSDOM("", { url: local.origin });
    try {
      const request = new w.XMLHttpRequest();
      request.open("GET", remote.origin, true, "user", "pass");
      request.withCredentials = true;
      // When/Then: the CORS response exposes its 401 without a credential retry.
      await completed(request);
      expect(request.status).toBe(401);
      expect(seen).toEqual([undefined]);
    } finally {
      w.close();
      await remote.close();
      await local.close();
    }
  });
});
