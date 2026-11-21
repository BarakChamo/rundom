// Checks observable XMLHttpRequest state, events, and response metadata.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { JSDOM, requestInterceptor } from "@run-dom/jsdom";

const require = createRequire(import.meta.url);
const { JSDOM: reference }: { JSDOM: typeof JSDOM } = require("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom 30.1.3", Constructor: reference },
])("$name XMLHttpRequest", ({ Constructor }) => {
  it("exposes the request and upload event target hierarchy", () => {
    // Given a request and its stable upload target.
    const { window } = new Constructor();
    try {
      const request = new window.XMLHttpRequest();
      const upload = request.upload;
      expect(upload).toBe(request.upload);
      expect(upload).toBeInstanceOf(window.XMLHttpRequestUpload);
      expect(upload).toBeInstanceOf(window.XMLHttpRequestEventTarget);
      expect(request).toBeInstanceOf(window.XMLHttpRequestEventTarget);

      // When an upload handler is reassigned, it keeps its original listener position.
      const calls: string[] = [];
      upload.onprogress = () => calls.push("original");
      upload.addEventListener("progress", () => calls.push("listener"));
      upload.onprogress = () => calls.push("replacement");
      upload.dispatchEvent(new window.ProgressEvent("progress"));

      // Then the upload dispatch uses its own handler and listener slots.
      expect(calls).toEqual(["replacement", "listener"]);
      expect(request.onprogress).toBeNull();
    } finally {
      window.close();
    }
  });

  it("applies response type and credentials setters only in the permitted states", async () => {
    // Given an opened asynchronous request and a supported response type.
    const { window } = new Constructor();
    try {
      const request = new window.XMLHttpRequest();
      request.open("GET", "data:application/json,123");
      request.responseType = "json";
      Reflect.set(request, "responseType", "invalid");
      expect(request.responseType).toBe("json");
      Reflect.set(request, "withCredentials", 1);
      expect(request.withCredentials).toBe(true);

      // When sending starts, credentials can no longer be changed.
      const loaded = new Promise<void>((resolve) => {
        request.onloadend = () => resolve();
      });
      request.send();
      expect(() => {
        request.withCredentials = false;
      }).toThrow(
        expect.objectContaining({
          name: "InvalidStateError",
          message: "The object is in an invalid state.",
        }),
      );
      await loaded;

      // Then completed requests reject valid response type changes, while invalid values are ignored.
      expect(request.response).toBe(123);
      Reflect.set(request, "responseType", "invalid");
      expect(() => {
        request.responseType = "text";
      }).toThrow(
        expect.objectContaining({
          name: "InvalidStateError",
          message: "The object is in an invalid state.",
        }),
      );
      expect(request.responseType).toBe("json");
    } finally {
      window.close();
    }
  });

  it("delivers upload progress before the response headers", async () => {
    // Given a local HTTP endpoint that reads the body before replying.
    const server = createServer((request, response) => {
      request.resume();
      request.on("end", () => response.end("ok"));
    });
    server.listen(0, "127.0.0.1");
    try {
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing TCP port");
      const { window } = new Constructor("", { url: `http://127.0.0.1:${address.port}/` });
      try {
        const request = new window.XMLHttpRequest();
        const seen: unknown[] = [];
        for (const type of ["loadstart", "progress", "load", "loadend"]) {
          request.upload.addEventListener(type, (event) => {
            if (event instanceof window.ProgressEvent)
              seen.push([event.type, event.loaded, event.total, event.isTrusted]);
          });
        }
        request.onreadystatechange = () => {
          if (request.readyState === 2) seen.push("headers");
        };

        // When the request uploads a multibyte body.
        request.open("POST", "/");
        await new Promise<void>((resolve) => {
          request.onloadend = () => resolve();
          request.send("€");
        });

        // Then upload events report bytes and finish before headers are exposed.
        expect(seen).toEqual([
          ["loadstart", 0, 3, true],
          ["progress", 3, 3, true],
          ["load", 3, 3, true],
          ["loadend", 3, 3, true],
          "headers",
        ]);
      } finally {
        window.close();
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("delivers a data URL through the ready states and exposes its headers", async () => {
    // Given: a request with listeners installed before opening it.
    const { window } = new Constructor();
    const xhr = new window.XMLHttpRequest();
    const states: number[] = [];
    xhr.onreadystatechange = () => states.push(xhr.readyState);
    const result = new Promise<void>((resolve, reject) => {
      xhr.onload = () => resolve();
      xhr.onerror = () => reject(new Error("Unexpected request error"));
    });

    // When: the data resource is requested.
    try {
      xhr.open("GET", "data:text/plain,hello");
      xhr.send();
      await result;

      // Then: the body and metadata are available at DONE.
      expect(states).toEqual([1, 2, 3, 4]);
      expect(xhr.responseText).toBe("hello");
      expect(xhr.status).toBe(200);
      expect(xhr.getResponseHeader("Content-Type")).toBe("text/plain");
    } finally {
      window.close();
    }
  });
});

describe("XMLHttpRequest cross-origin preflight", () => {
  it("sends custom headers only after preflight and exposes only allowed response headers", async () => {
    // Given: a cross-origin endpoint that permits one custom request header.
    const methods: string[] = [];
    const server = createServer((request, response) => {
      methods.push(request.method ?? "");
      response.setHeader("Access-Control-Allow-Origin", "https://origin.test");
      if (request.method === "OPTIONS") {
        if (request.url === "/allowed")
          response.setHeader("Access-Control-Allow-Headers", "X-Example");
        response.writeHead(204).end();
        return;
      }
      response.setHeader("Access-Control-Expose-Headers", "X-Visible");
      response.setHeader("X-Visible", "yes");
      response.setHeader("X-Hidden", "no");
      response.end(request.headers["x-example"]);
    });
    server.listen(0, "127.0.0.1");
    const { window } = new JSDOM("", { url: "https://origin.test/" });
    try {
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Fixture did not bind a TCP port");
      const endpoint = `http://127.0.0.1:${address.port}`;
      async function request(path: string) {
        const xhr = new window.XMLHttpRequest();
        xhr.open("GET", endpoint + path);
        xhr.setRequestHeader("X-Example", "sent");
        await new Promise<void>((resolve) => {
          xhr.onloadend = () => resolve();
          xhr.send();
        });
        return xhr;
      }

      // When: the same request is attempted against the permissive and restrictive paths.
      const allowed = await request("/allowed");
      const denied = await request("/denied");

      // Then: only the allowed path reaches GET and exposes its permitted response.
      expect(methods).toEqual(["OPTIONS", "GET", "OPTIONS"]);
      expect(allowed.responseText).toBe("sent");
      expect(allowed.getResponseHeader("x-visible")).toBe("yes");
      expect(allowed.getResponseHeader("x-hidden")).toBeNull();
      expect(denied.status).toBe(0);
    } finally {
      window.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

describe("XMLHttpRequest streaming", () => {
  it("exposes partial text and progress before a response finishes", async () => {
    // Given: an endpoint that holds its final bytes until the client sees progress.
    let completeResponse: (() => void) | undefined;
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/plain", "Content-Length": "10" });
      response.write("start");
      completeResponse = () => response.end("-done");
    });
    server.listen(0, "127.0.0.1");
    let cleanup: (() => void) | undefined;
    try {
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Fixture did not bind a TCP port");
      const endpoint = `http://127.0.0.1:${address.port}`;
      const { window } = new JSDOM("", { url: endpoint });
      cleanup = () => window.close();
      const xhr = new window.XMLHttpRequest();
      xhr.open("GET", "/");

      // When: the stream starts while the remaining bytes are still withheld.
      const progress: [number, string, number, number][] = [];
      await new Promise<void>((resolve, reject) => {
        xhr.onprogress = (event) => {
          if (event instanceof window.ProgressEvent) {
            progress.push([xhr.readyState, xhr.responseText, event.loaded, event.total]);
            completeResponse?.();
            completeResponse = undefined;
          }
        };
        xhr.onload = () => resolve();
        xhr.onerror = () => reject(new Error("Unexpected stream error"));
        xhr.ontimeout = () => reject(new Error("No progress before response completed"));
        xhr.timeout = 1000;
        xhr.send();
      });

      // Then: the first notification exposes the first chunk and the final text is complete.
      expect(progress[0]).toEqual([xhr.LOADING, "start", 5, 10]);
      expect(xhr.responseText).toBe("start-done");
    } finally {
      completeResponse?.();
      cleanup?.();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

it("sends a snapshot of FormData as multipart bytes with its generated boundary", async () => {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    response.end(
      JSON.stringify({
        type: request.headers["content-type"],
        body: Buffer.concat(chunks).toString("utf8"),
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  const { window } = new JSDOM("", { url: `http://127.0.0.1:${address.port}/` });
  try {
    const data = new window.FormData();
    data.append("name", "first\nsecond");
    data.append("upload", new window.File(["payload"], "sample.txt", { type: "text/plain" }));
    const xhr = new window.XMLHttpRequest();
    xhr.open("POST", "/upload");
    const finished = new Promise<void>((resolve, reject) => {
      xhr.onload = () => resolve();
      xhr.onerror = () => reject(new Error("Upload failed"));
    });
    xhr.send(data);
    data.append("late", "ignored");
    await finished;

    const result = JSON.parse(xhr.responseText) as { type: string; body: string };
    const boundary = /^multipart\/form-data; boundary=(.+)$/.exec(result.type)?.[1];
    expect(boundary).toBeTruthy();
    expect(result.body).toContain(
      `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nfirst\r\nsecond\r\n`,
    );
    expect(result.body).toContain(
      'name="upload"; filename="sample.txt"\r\nContent-Type: text/plain\r\n\r\npayload',
    );
    expect(result.body).toContain(`--${boundary}--`);
    expect(result.body).not.toContain("ignored");
  } finally {
    window.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("fetches relative URLs with multipart uploads, cookies, and redirect metadata", async () => {
  const received: { body?: string; cookie?: string } = {};
  const server = createServer(async (request, response) => {
    if (request.url === "/start") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      received.body = Buffer.concat(chunks).toString("utf8");
      response.writeHead(303, { Location: "/done", "Set-Cookie": "session=yes; Path=/" }).end();
    } else {
      if (request.headers.cookie) received.cookie = request.headers.cookie;
      response.end("ok");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  const origin = `http://127.0.0.1:${address.port}`;
  const { window } = new JSDOM("", { url: `${origin}/page` });
  try {
    const data = new window.FormData();
    data.append("upload", new window.File(["bytes"], "example.txt"));
    const response = await window.fetch("/start", { method: "POST", body: data });
    expect(received.body).toContain('filename="example.txt"');
    expect(received.body).toContain("bytes");
    expect(received.cookie).toBe("session=yes");
    expect(response.url).toBe(`${origin}/done`);
    expect(response.redirected).toBe(true);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toBe("ok");
  } finally {
    window.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("filters cross-origin fetch responses and honors an aborted request", async () => {
  let calls = 0;
  const server = createServer((request, response) => {
    calls++;
    if (request.url === "/cors") {
      response.setHeader("Access-Control-Allow-Origin", "https://origin.test");
      response.setHeader("Access-Control-Expose-Headers", "X-Visible");
    }
    response.setHeader("X-Visible", "yes");
    response.setHeader("X-Hidden", "no");
    response.end("content");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  const endpoint = `http://127.0.0.1:${address.port}`;
  const { window } = new JSDOM("", { url: "https://origin.test/" });
  try {
    const cors = await window.fetch(`${endpoint}/cors`);
    expect(cors.type).toBe("cors");
    expect(cors.headers.get("x-visible")).toBe("yes");
    expect(cors.headers.get("x-hidden")).toBeNull();
    await expect(window.fetch(endpoint)).rejects.toBeInstanceOf(TypeError);

    const opaque = await window.fetch(endpoint, { mode: "no-cors" });
    expect([opaque.type, opaque.status, opaque.url]).toEqual(["opaque", 0, ""]);
    expect(await opaque.text()).toBe("");
    await expect(window.fetch(endpoint, { mode: "same-origin" })).rejects.toBeInstanceOf(TypeError);
    const reason = new Error("stop");
    await expect(window.fetch(endpoint, { signal: AbortSignal.abort(reason) })).rejects.toBe(
      reason,
    );
    expect(calls).toBe(3);
  } finally {
    window.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("exposes fetch headers and body chunks before the server finishes", async () => {
  let finish: (() => void) | undefined;
  const server = createServer((_request, response) => {
    response.writeHead(200, { "X-Stream": "yes" });
    response.write("first");
    finish = () => response.end("second");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  const { window } = new JSDOM("", { url: `http://127.0.0.1:${address.port}/` });
  try {
    const response = await window.fetch("/stream", { signal: AbortSignal.timeout(1000) });
    expect(response.headers.get("x-stream")).toBe("yes");
    expect(response.body).toBeInstanceOf(window.ReadableStream);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Expected a response body");
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toBe("first");
    finish?.();
    expect(decoder.decode((await reader.read()).value)).toBe("second");
    expect((await reader.read()).done).toBe(true);
  } finally {
    finish?.();
    window.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("rejects a pending fetch body read with the abort reason after headers", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200);
    response.write("first");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  const { window } = new JSDOM("", { url: `http://127.0.0.1:${address.port}/` });
  try {
    const controller = new AbortController();
    const response = await window.fetch("/stream", { signal: controller.signal });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Expected a response body");
    expect((await reader.read()).done).toBe(false);
    const pending = reader.read();
    const reason = new Error("cancelled while reading");
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
  } finally {
    window.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("uploads the first fetch request chunk before the producer closes", async () => {
  let closeBody: (() => void) | undefined;
  const server = createServer((request, response) => {
    request.once("data", () => closeBody?.());
    request.once("end", () => response.end("received"));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  const { window } = new JSDOM("", { url: `http://127.0.0.1:${address.port}/` });
  try {
    const body = new window.ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([65]));
        closeBody = () => controller.close();
      },
    });
    const response = await window.fetch("/upload", {
      method: "POST",
      body,
      duplex: "half",
      signal: AbortSignal.timeout(1000),
    });
    expect(await response.text()).toBe("received");
  } finally {
    window.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("replays buffered fetch bodies on 307, rejects streamed replay, and follows 303 as GET", async () => {
  const requests: string[] = [];
  const inspected: string[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(`${request.method} ${request.url} ${Buffer.concat(chunks).toString()}`);
    if (request.url === "/replay") response.writeHead(307, { Location: "/done" });
    if (request.url === "/rewrite") response.writeHead(303, { Location: "/done" });
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  const { window } = new JSDOM("", {
    url: `http://127.0.0.1:${address.port}/`,
    resources: {
      interceptors: [
        requestInterceptor(async (request) => {
          if (request.body) inspected.push(await request.text());
          return undefined;
        }),
      ],
    },
  });
  try {
    const streamed = (): RequestInit => ({
      method: "POST",
      duplex: "half",
      body: new window.ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("streamed"));
          controller.close();
        },
      }),
    });
    await (await window.fetch("/replay", { method: "POST", body: "buffered" })).text();
    await expect(window.fetch("/replay", streamed())).rejects.toBeInstanceOf(TypeError);
    const request = new window.Request("/rewrite", streamed()).clone();
    await (await window.fetch(request)).text();
    expect(inspected).toEqual(["buffered", "buffered", "streamed", "streamed"]);
    expect(requests).toEqual([
      "POST /replay buffered",
      "POST /done buffered",
      "POST /replay streamed",
      "POST /rewrite streamed",
      "GET /done ",
    ]);
  } finally {
    window.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("reads blobs with trusted progress events and supports reuse after abort", async () => {
  const { window } = new JSDOM("", { runScripts: "outside-only" });
  try {
    const reader = new window.FileReader();
    const events: string[] = [];
    reader.onabort = (event) => events.push(event.type);
    reader.onloadend = (event) => events.push(event.type);
    reader.readAsText(new window.Blob(["discard"]));
    reader.abort();
    expect(events).toEqual(["abort", "loadend"]);
    expect(reader.result).toBeNull();
    const done = new Promise<void>((resolve) => {
      reader.onloadend = () => resolve();
    });
    const progress: boolean[] = [];
    reader.onprogress = (event) => {
      progress.push(event.isTrusted && event instanceof window.ProgressEvent && event.loaded === 3);
    };
    reader.readAsArrayBuffer(new window.Blob(["abc"]));
    await done;
    const constructor: unknown = Reflect.get(window, "ArrayBuffer");
    expect(reader.result?.constructor).toBe(constructor);
    expect(progress).toEqual([true]);
    expect(reader.readyState).toBe(reader.DONE);
  } finally {
    window.close();
  }
});

it("captures Blob URLs in Request and XHR before revocation and blocks foreign origins", async () => {
  const { window } = new JSDOM("", { url: "https://files.test/" });
  const foreign = new JSDOM("", { url: "https://other.test/" }).window;
  try {
    const url = window.URL.createObjectURL(new window.Blob(["payload"], { type: "text/plain" }));
    expect(new window.URL(url).origin).toBe("https://files.test");
    const range = await window.fetch(url, { headers: { Range: "bytes= 1 - 3" } });
    expect(range.status).toBe(206);
    expect(range.headers.get("content-range")).toBe("bytes 1-3/7");
    expect(await range.text()).toBe("ayl");
    await expect(foreign.fetch(url)).rejects.toBeInstanceOf(TypeError);
    const request = new window.Request(`${url}#fragment`);
    await expect(foreign.fetch(request.clone())).rejects.toBeInstanceOf(TypeError);
    const xhr = new window.XMLHttpRequest();
    xhr.open("GET", url);
    window.URL.revokeObjectURL(url);
    await expect(window.fetch(url)).rejects.toBeInstanceOf(TypeError);
    expect(await (await window.fetch(request.clone())).text()).toBe("payload");
    await new Promise<void>((resolve, reject) => {
      xhr.onload = () => resolve();
      xhr.onerror = () => reject(new Error("Blob URL request failed"));
      xhr.send();
    });
    expect(xhr.responseText).toBe("payload");
  } finally {
    foreign.close();
    window.close();
  }
});

it("reads Blob ranges synchronously and throws NetworkError for invalid ranges", () => {
  const { window } = new JSDOM("", { url: "https://files.test/" });
  try {
    const url = window.URL.createObjectURL(new window.Blob(["payload"], { type: "text/plain" }));
    const xhr = new window.XMLHttpRequest();
    const states: number[] = [];
    xhr.onreadystatechange = () => states.push(xhr.readyState);
    xhr.open("GET", url, false);
    xhr.setRequestHeader("Range", "bytes=1-3");
    xhr.send();
    expect(states).toEqual([xhr.OPENED, xhr.DONE]);
    expect(xhr.status).toBe(206);
    expect(xhr.responseText).toBe("ayl");

    xhr.open("GET", url, false);
    xhr.setRequestHeader("Range", "bytes=9-1");
    expect(() => xhr.send()).toThrowError(expect.objectContaining({ name: "NetworkError" }));
    expect(xhr.readyState).toBe(xhr.DONE);
    expect(xhr.status).toBe(0);
  } finally {
    window.close();
  }
});

it("decodes data URLs consistently for synchronous requests and asynchronous HEAD", async () => {
  const { window } = new JSDOM();
  try {
    const xhr = new window.XMLHttpRequest();
    const url = "data:text/plain;charset=UTF-8;base64,SGVsbMO2";
    xhr.open("GET", url, false);
    xhr.send();
    expect(xhr.status).toBe(200);
    expect(xhr.responseText).toBe("Hellö");
    expect(xhr.getResponseHeader("content-type")).toBe("text/plain;charset=UTF-8");
    expect(xhr.getResponseHeader("content-length")).toBeNull();

    xhr.open("HEAD", url);
    await new Promise<void>((resolve, reject) => {
      xhr.onload = () => resolve();
      xhr.onerror = () => reject(new Error("Data URL HEAD failed"));
      xhr.send();
    });
    expect(xhr.status).toBe(200);
    expect(xhr.responseText).toBe("");

    xhr.open("GET", "data:text/plain;base64,%%", false);
    expect(() => xhr.send()).toThrowError(expect.objectContaining({ name: "NetworkError" }));
  } finally {
    window.close();
  }
});

it("parses and caches inert XHR documents with MIME and realm semantics", async () => {
  const { window } = new JSDOM("", { runScripts: "dangerously" });
  try {
    async function read(markup: string, mime: string, type: "" | "document" = "") {
      const xhr = new window.XMLHttpRequest();
      xhr.open("GET", `data:${mime},${encodeURIComponent(markup)}`);
      xhr.responseType = type;
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => resolve();
        xhr.onerror = () => reject(new Error("Document request failed"));
        xhr.send();
      });
      return xhr;
    }
    const xml = await read('<root xmlns="urn:example"><child/></root>', "application/xml");
    expect(xml.responseXML).toBeInstanceOf(window.XMLDocument);
    expect(xml.responseXML?.documentElement?.namespaceURI).toBe("urn:example");
    expect(xml.responseXML).toBe(xml.responseXML);
    expect((await read("<unclosed>", "application/xml")).responseXML).toBeNull();
    expect((await read("<p>text</p>", "text/html")).responseXML).toBeNull();
    const html = await read(
      '<base href="https://example.test/"><script>document.body.id="ran"</script><p>text</p>',
      "text/html",
      "document",
    );
    expect(html.response).toBe(html.responseXML);
    expect(html.responseXML?.querySelector("p")?.textContent).toBe("text");
    expect(html.responseXML?.baseURI).toBe("https://example.test/");
    expect(html.responseXML?.body?.id).toBe("");
    expect(html.responseXML?.defaultView).toBeNull();
  } finally {
    window.close();
  }
});

it("performs synchronous HTTP redirects and shares cookies with the document", async () => {
  const { Worker } = await import("node:worker_threads");
  const server = new Worker(
    `
    const { parentPort } = require("node:worker_threads");
    const server = require("node:http").createServer(async (request, response) => {
      if (request.url === "/start") {
        response.writeHead(307, { Location: "/result", "Set-Cookie": "token=ok; Path=/" }).end();
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      response.end(request.method + ":" + Buffer.concat(chunks).toString() + ":" + request.headers.cookie);
    });
    server.listen(0, "127.0.0.1", () => parentPort.postMessage(server.address().port));
  `,
    { eval: true },
  );
  try {
    const [port] = await once(server, "message");
    const origin = `http://127.0.0.1:${port}/`;
    const intercepted: string[] = [];
    const { window } = new JSDOM("", {
      url: origin,
      resources: {
        interceptors: [
          requestInterceptor((request) => {
            intercepted.push(request.url);
            return undefined;
          }),
        ],
      },
    });
    try {
      const xhr = new window.XMLHttpRequest();
      xhr.open("POST", "/start", false);
      xhr.send("payload");
      expect(xhr.status).toBe(200);
      expect(xhr.responseText).toBe("POST:payload:token=ok");
      expect(xhr.responseURL).toBe(`${origin}result`);
      expect(window.document.cookie).toBe("token=ok");
      expect(window.performance.getEntriesByType("resource")).toMatchObject([
        { name: `${origin}start`, initiatorType: "xmlhttprequest" },
      ]);

      const data = new window.FormData();
      data.append("file", new window.File(["contents"], "upload.txt"));
      xhr.open("POST", "/result", false);
      xhr.send(data);
      expect(xhr.responseText).toContain('filename="upload.txt"');
      expect(xhr.responseText).toContain("contents");

      xhr.open("GET", "/result");
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => resolve();
        xhr.onerror = () => reject(new Error("Unexpected request error"));
        xhr.send();
      });
      const entries = window.performance.getEntriesByName(`${origin}result`, "resource");
      expect(entries).toMatchObject([
        { initiatorType: "xmlhttprequest" },
        { initiatorType: "xmlhttprequest" },
      ]);
      expect(entries[1]?.duration).toBeGreaterThan(0);
      expect(intercepted).toEqual([`${origin}result`]);

      const performance = window.performance;
      performance.clearResourceTimings();
      performance.setResourceTimingBufferSize(1);
      let events = 0;
      performance.onresourcetimingbufferfull = () => {
        events++;
        performance.setResourceTimingBufferSize(2);
        const nested = new window.XMLHttpRequest();
        nested.open("GET", "/nested", false);
        nested.send();
      };
      xhr.open("GET", "/primary", false);
      xhr.send();
      xhr.open("GET", "/overflow", false);
      xhr.send();
      await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 0));
      expect(events).toBe(1);
      expect(performance.getEntriesByType("resource").map(({ name }) => name)).toEqual([
        `${origin}primary`,
        `${origin}overflow`,
      ]);
    } finally {
      window.close();
    }
  } finally {
    await server.terminate();
  }
});

it("preserves binary request bytes and creates responses in the scripted Window", async () => {
  // Given a Window with its own intrinsics and an echo endpoint.
  const { window } = new JSDOM("", {
    url: "https://example.test/",
    runScripts: "outside-only",
    resources: {
      interceptors: [
        requestInterceptor(async (request) => new Response(await request.arrayBuffer())),
      ],
    },
  });
  try {
    // When script sends a Window ArrayBuffer and reads binary and JSON responses.
    const result = await window.eval(`(async () => {
      function read(type, url, body) {
        return new Promise((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open(body ? "POST" : "GET", url);
          request.responseType = type;
          request.onload = () => resolve(request);
          request.onerror = reject;
          request.send(body);
        });
      }
      const binary = await read("arraybuffer", "/echo", Uint8Array.of(0, 128, 255).buffer);
      const json = await read("json", 'data:application/json,{"items":[1]}');
      const invalid = await read("json", "data:application/json,invalid");
      return [
        binary.response instanceof ArrayBuffer, binary.response === binary.response,
        Array.from(new Uint8Array(binary.response)),
        Object.getPrototypeOf(json.response) === Object.prototype,
        json.response.items instanceof Array, invalid.response,
      ];
    })()`);

    // Then the request preserves bytes and each response has the Window's prototypes.
    expect(result).toEqual([true, true, [0, 128, 255], true, true, null]);
  } finally {
    window.close();
  }
});

it("reschedules an in-flight timeout from the original send time", async () => {
  // Given a request whose transport is waiting for cancellation.
  const started = Promise.withResolvers<void>();
  const { window } = new JSDOM("", {
    url: "https://example.test/",
    resources: {
      interceptors: [
        requestInterceptor((request) => {
          started.resolve();
          return new Promise<Response>((_, reject) => {
            request.signal.addEventListener("abort", () => reject(request.signal.reason), {
              once: true,
            });
          });
        }),
      ],
    },
  });
  try {
    const xhr = new window.XMLHttpRequest();
    xhr.open("GET", "/wait");
    const finished = Promise.withResolvers<string>();
    xhr.ontimeout = (event) => finished.resolve(event.type);
    xhr.onerror = (event) => finished.resolve(event.type);
    xhr.send();
    await started.promise;

    // When a previously untimed request receives a deadline.
    xhr.timeout = 1;

    // Then the deadline aborts the transport and surfaces as a timeout.
    const deadline = window.setTimeout(() => finished.resolve("missing timeout"), 250);
    expect(await finished.promise).toBe("timeout");
    window.clearTimeout(deadline);
    expect(xhr.readyState).toBe(xhr.DONE);
    expect(xhr.status).toBe(0);
  } finally {
    window.close();
  }
});

it("serializes HTML and XML request documents as UTF-8", async () => {
  // Given an endpoint that echoes the body and its Content-Type.
  const { window } = new JSDOM("", {
    url: "https://example.test/",
    resources: {
      interceptors: [
        requestInterceptor(async (request) =>
          Response.json([request.headers.get("content-type"), await request.text()]),
        ),
      ],
    },
  });
  try {
    const html = window.document.implementation.createHTMLDocument("");
    if (!html.body) throw new Error("Missing HTML body");
    html.body.textContent = "a\uD800b";
    const xml = new window.DOMParser().parseFromString("<root>€</root>", "application/xml");

    // When the documents are sent, the XML request overrides the default media type.
    async function send(document: typeof html, contentType?: string) {
      const xhr = new window.XMLHttpRequest();
      xhr.open("POST", "/echo");
      if (contentType) xhr.setRequestHeader("content-type", contentType);
      xhr.responseType = "json";
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => resolve();
        xhr.onerror = () => reject(new Error("Echo request failed"));
        xhr.send(document);
      });
      return xhr.response;
    }

    // Then markup, the surrogate replacement, and the actual encoding are transmitted.
    expect(await send(html)).toEqual([
      "text/html;charset=UTF-8",
      "<!DOCTYPE html><html><head><title></title></head><body>a�b</body></html>",
    ]);
    expect(await send(xml, "text/xml;charset=windows-1252")).toEqual([
      "text/xml;charset=UTF-8",
      "<root>€</root>",
    ]);
  } finally {
    window.close();
  }
});

it("inherits configured Node preloads in the synchronous transport worker", async () => {
  // Given: the embedding process configures DNS through a standard Node preload.
  const { Worker } = await import("node:worker_threads");
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createRequire } = await import("node:module");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const directory = await mkdtemp(join(tmpdir(), "rundom-sync-preload-"));
  const server = new Worker(
    `
    const {parentPort}=require('node:worker_threads');
    const server=require('node:http').createServer(async (req,res)=>{
      const chunks=[];for await(const chunk of req) chunks.push(chunk);
      res.end(req.method+':'+Buffer.concat(chunks).toString());
    });
    server.listen(0,'127.0.0.1',()=>parentPort.postMessage(server.address().port));
  `,
    { eval: true },
  );
  try {
    const [port] = await once(server, "message");
    if (typeof port !== "number") throw new Error("Expected server port");
    const preload = join(directory, "dns.mjs"),
      script = join(directory, "client.cjs");
    await writeFile(
      preload,
      `
      import dns from 'node:dns';
      import {syncBuiltinESMExports} from 'node:module';
      const lookup=dns.lookup;
      dns.lookup=function(host,options,callback){
        if(host!=='sync.invalid') return lookup.apply(this,arguments);
        if(typeof options==='function'){callback=options;options={};}
        queueMicrotask(()=>options?.all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4));
      };
      syncBuiltinESMExports();
    `,
    );
    const entry = createRequire(import.meta.url).resolve("@run-dom/jsdom");
    await writeFile(
      script,
      `
      const {JSDOM}=require(${JSON.stringify(entry)});
      const {window}=new JSDOM('',{url:'http://sync.invalid:${port}/'});
      try {const xhr=new window.XMLHttpRequest();xhr.open('POST','/',false);xhr.send('payload');process.stdout.write(xhr.status+':'+xhr.responseText);}
      finally {window.close();}
    `,
    );
    // When/Then: synchronous requests use the same configured host resolution as the main process.
    const { stdout } = await promisify(execFile)(process.execPath, ["--import", preload, script]);
    expect(stdout).toBe("200:POST:payload");
  } finally {
    await server.terminate();
    await rm(directory, { recursive: true, force: true });
  }
});

it("preserves first header spelling and lets author fields override defaults case-insensitively", async () => {
  // Given: HTTP field names compare without case, but their first spelling is retained on the wire.
  const server = createServer((request, response) =>
    response.end(
      JSON.stringify({
        raw: request.rawHeaders,
        accept: request.headers.accept,
        language: request.headers["accept-language"],
        type: request.headers["content-type"],
      }),
    ),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected server address");
  const { window } = new JSDOM("", { url: `http://127.0.0.1:${address.port}/` });
  try {
    const xhr = new window.XMLHttpRequest();
    xhr.open("POST", "/");
    xhr.setRequestHeader("X-MiXeD", "one");
    xhr.setRequestHeader("x-mixed", "two");
    xhr.setRequestHeader("Accept", "custom");
    xhr.setRequestHeader("Accept-Language", "ru");
    xhr.setRequestHeader("Content-Type", "text/plain");
    const done = new Promise<void>((resolve, reject) => {
      xhr.onload = () => resolve();
      xhr.onerror = () => reject(new Error("Unexpected request failure"));
    });
    // When/Then: duplicate values merge once and defaults do not replace the author fields.
    xhr.send("body");
    await done;
    expect(JSON.parse(xhr.responseText)).toMatchObject({
      accept: "custom",
      language: "ru",
      type: "text/plain",
    });
    expect(JSON.parse(xhr.responseText).raw).toContain("X-MiXeD");
    expect(JSON.parse(xhr.responseText).raw).toContain("one, two");
    expect(JSON.parse(xhr.responseText).raw).toContain("Content-Type");
  } finally {
    window.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("sends the User-Agent field on cross-origin preflight as well as the request", async () => {
  // Given: a remote endpoint validates the standard transport metadata on both hops.
  const seen: string[] = [];
  const server = createServer((request, response) => {
    seen.push(request.method ?? "");
    if (!request.headers["user-agent"]) {
      response.writeHead(400).end();
      return;
    }
    response.setHeader("Access-Control-Allow-Origin", "http://origin.invalid");
    response.setHeader("Access-Control-Allow-Methods", "GET");
    response.setHeader("Access-Control-Allow-Headers", "x-probe");
    response.end(request.method === "OPTIONS" ? "" : "ok");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected server address");
  const { window } = new JSDOM("", { url: "http://origin.invalid/" });
  try {
    const xhr = new window.XMLHttpRequest();
    xhr.open("GET", `http://127.0.0.1:${address.port}/`);
    xhr.setRequestHeader("X-Probe", "test");
    const done = new Promise<void>((resolve, reject) => {
      xhr.onload = () => resolve();
      xhr.onerror = () => reject(new Error("Unexpected preflight failure"));
    });
    // When/Then: the allowed request completes after a preflight carrying User-Agent.
    xhr.send();
    await done;
    expect(xhr.responseText).toBe("ok");
    expect(seen).toEqual(["OPTIONS", "GET"]);
  } finally {
    window.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("enforces ByteString conversion and required arguments on request header writes", () => {
  // Given: header field arguments use Web IDL ByteString before HTTP grammar validation.
  const { window } = new JSDOM();
  try {
    const xhr = new window.XMLHttpRequest();
    xhr.open("GET", "data:,");
    // When/Then: non-byte code points and omitted values are TypeErrors rather than HTTP syntax errors.
    expect(() => xhr.setRequestHeader("X-Test", "\u0100")).toThrow(TypeError);
    expect(() => xhr.setRequestHeader("\u0100", "value")).toThrow(TypeError);
    expect(() => Reflect.apply(xhr.setRequestHeader, xhr, ["X-Test"])).toThrow(
      "2 arguments required",
    );
  } finally {
    window.close();
  }
});

it("rejects shared request buffers before changing request state", () => {
  // Given: shared memory is outside XMLHttpRequest's BufferSource union.
  const { window } = new JSDOM();
  try {
    const xhr = new window.XMLHttpRequest();
    xhr.open("POST", "data:,");
    const shared = new SharedArrayBuffer(8);
    // When/Then: both the buffer and its views fail synchronously, including GET bodies.
    for (const body of [shared, new Uint8Array(shared), new DataView(shared)]) {
      expect(() => xhr.send(body)).toThrow(TypeError);
      expect(xhr.readyState).toBe(xhr.OPENED);
    }
    xhr.open("GET", "data:,");
    expect(() => xhr.send(shared)).toThrow(TypeError);
  } finally {
    window.close();
  }
});

it("converts request strings before observing request state and method", async () => {
  // Given: WebIDL conversion can reenter open() or send().
  const server = createServer((request, response) => {
    response.end(request.url);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected server address");
  const { window } = new JSDOM("", { url: `http://127.0.0.1:${address.port}/` });
  try {
    const xhr = new window.XMLHttpRequest();
    xhr.open("GET", "/old");
    const done = new Promise<void>((resolve, reject) => {
      xhr.onload = () => resolve();
      xhr.onerror = () => reject(new Error("Unexpected request failure"));
    });
    // When/Then: conversion happens even for GET and the reopened request wins.
    xhr.send({
      toString() {
        xhr.open("POST", "/new");
        return "payload";
      },
    });
    await done;
    expect(xhr.responseText).toBe("/new");
    xhr.open("POST", "/old");
    expect(() =>
      xhr.send({
        toString() {
          xhr.send("inner");
          return "outer";
        },
      }),
    ).toThrow("Request is not open");
    expect(() => xhr.send(Symbol("body"))).toThrow(TypeError);
  } finally {
    window.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
