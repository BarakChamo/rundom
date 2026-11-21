// Runs the shared HTTP transport while a synchronous XHR caller is blocked.
import { parentPort, type MessagePort } from "node:worker_threads";
import { CookieJar, type SerializedCookieJar } from "tough-cookie";
import { fetchResource } from "./main-resource.js";

import type { SynchronousHTTPRequest } from "./synchronous-http.js";

parentPort?.on(
  "message",
  async (input: {
    url: string;
    request: Omit<SynchronousHTTPRequest, "url">;
    cookieJar: SerializedCookieJar;
    userAgent: string;
    shared: SharedArrayBuffer;
    port: MessagePort;
  }) => {
    const state = new Int32Array(input.shared);
    const cookies: { value: string; url: string }[] = [];
    try {
      const { body, ...request } = input.request;
      let payload: string | Uint8Array | undefined;
      if (body instanceof Blob) payload = new Uint8Array(await body.arrayBuffer());
      else if (typeof body === "object" && "multipart" in body) {
        const data = new FormData();
        for (const [name, value, filename] of body.multipart) {
          if (typeof value === "string") data.append(name, value);
          else data.append(name, value, filename);
        }
        const encoded = new Request("http://localhost/", { method: "POST", body: data });
        const type = encoded.headers.get("content-type");
        if (type !== null) request.headers["content-type"] ??= type;
        payload = new Uint8Array(await encoded.arrayBuffer());
      } else payload = body;
      const response = await fetchResource({
        url: input.url,
        xhr: {
          ...request,
          ...(payload === undefined ? {} : { body: payload }),
          onHeaders() {},
          onChunk() {},
        },
        cookieJar: CookieJar.deserializeSync(input.cookieJar),
        userAgent: input.userAgent,
        onCookie: (value, url) => cookies.push({ value, url }),
        signal: AbortSignal.timeout(25_000),
      });
      input.port.postMessage({ response, cookies }, [response.bytes]);
    } catch {
      input.port.postMessage({ cookies });
    } finally {
      Atomics.store(state, 0, 1);
      Atomics.notify(state, 0);
      input.port.close();
    }
  },
);
