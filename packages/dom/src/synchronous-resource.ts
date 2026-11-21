// Bridges local resource reads to synchronous XHR through an isolated worker.
import { MessageChannel, Worker, receiveMessageOnPort } from "node:worker_threads";

let reader: Worker | undefined;

function resourceReader(): Worker {
  if (reader) return reader;
  const worker = new Worker(
    `
    const { parentPort } = require("node:worker_threads");
    parentPort.on("message", async ({ resource, port, shared }) => {
      const state = new Int32Array(shared);
      try {
        const source = resource.kind === "blob"
          ? resource.blob
          : await fetch(resource.url, { method: resource.method });
        const bytes = await source.arrayBuffer();
        const contentType = resource.kind === "data" ? source.headers.get("content-type") : null;
        port.postMessage({ bytes, contentType }, [bytes]);
        Atomics.store(state, 0, 1);
      } catch {
        Atomics.store(state, 0, -1);
      } finally {
        Atomics.notify(state, 0);
        port.close();
      }
    });
    `,
    { eval: true, execArgv: [] },
  );
  const reset = () => {
    if (reader === worker) reader = undefined;
  };
  worker.on("error", reset);
  worker.on("exit", reset);
  worker.unref();
  reader = worker;
  return worker;
}

type LocalResource = { kind: "blob"; blob: Blob } | { kind: "data"; url: string; method: string };

/** Reads a Blob or data URL synchronously through the host's native decoders. */
export function readResourceSynchronously(resource: LocalResource): {
  bytes: ArrayBuffer;
  contentType: string | null;
} {
  const worker = resourceReader();
  const { port1, port2 } = new MessageChannel();
  const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const state = new Int32Array(shared);
  try {
    worker.postMessage({ resource, port: port2, shared }, [port2]);
    if (Atomics.wait(state, 0, 0, 30_000) === "timed-out") {
      if (reader === worker) reader = undefined;
      void worker.terminate();
      throw new Error("Synchronous resource read timed out");
    }
    const result: unknown = receiveMessageOnPort(port1)?.message;
    if (
      Atomics.load(state, 0) !== 1 ||
      !result ||
      typeof result !== "object" ||
      !("bytes" in result) ||
      !(result.bytes instanceof ArrayBuffer) ||
      !("contentType" in result) ||
      (result.contentType !== null && typeof result.contentType !== "string")
    )
      throw new Error("Synchronous resource read failed");
    return { bytes: result.bytes, contentType: result.contentType };
  } finally {
    port1.close();
    port2.close();
  }
}
