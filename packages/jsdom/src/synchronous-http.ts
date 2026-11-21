// Transfers synchronous HTTP requests to a reusable worker and applies its cookie updates.
import { MessageChannel, Worker, receiveMessageOnPort } from "node:worker_threads";
import type { CookieJar } from "tough-cookie";
import type { fetchResource } from "./main-resource.js";

export type SynchronousHTTPRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  headerNames?: Readonly<Record<string, string>>;
  origin: string;
  credentials: boolean;
  authentication?: { username: string; password: string };
  referrer?: string;
  body?: string | Uint8Array | Blob | { multipart: ([string, string] | [string, Blob, string])[] };
};
type Response = Awaited<ReturnType<typeof fetchResource>>;
type Reply = { response?: Response; cookies: { value: string; url: string }[] };

let transport: Worker | undefined;

function workerForHTTP(): Worker {
  if (transport) return transport;
  const entry = new URL("./synchronous-http-worker.cjs", import.meta.url);
  const worker = new Worker(entry);
  const reset = () => {
    if (transport === worker) transport = undefined;
  };
  worker.on("error", reset);
  worker.on("exit", reset);
  worker.unref();
  transport = worker;
  return worker;
}

/** Sends a synchronous request using the same redirect and CORS handling as async XHR. */
export function requestSynchronousHTTP(
  request: SynchronousHTTPRequest,
  jar: CookieJar,
  userAgent: string,
): Response {
  if (!jar.store.synchronous)
    throw new TypeError("Synchronous HTTP requires a synchronous cookie store");
  const cookieJar = jar.serializeSync();
  if (!cookieJar) throw new TypeError("Cookie store could not be serialized");
  const worker = workerForHTTP();
  const { port1, port2 } = new MessageChannel();
  const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const state = new Int32Array(shared);
  const { url, ...xhr } = request;
  try {
    worker.postMessage({ url, request: xhr, cookieJar, userAgent, shared, port: port2 }, [port2]);
    if (Atomics.wait(state, 0, 0, 30_000) === "timed-out") {
      if (transport === worker) transport = undefined;
      void worker.terminate();
      throw new Error("Synchronous HTTP request timed out");
    }
    const reply = receiveMessageOnPort(port1)?.message as Reply | undefined;
    if (!reply) throw new Error("Synchronous HTTP worker returned no result");
    for (const { value, url } of reply.cookies)
      jar.setCookieSync(value, url, { ignoreError: true });
    if (!reply.response) throw new Error("Synchronous HTTP request failed");
    return reply.response;
  } finally {
    port1.close();
    port2.close();
  }
}
