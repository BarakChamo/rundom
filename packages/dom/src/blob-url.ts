// Stores Blob URLs with their creating origin and Window lifetime.
import { randomUUID } from "node:crypto";

type Entry = { blob: Blob; origin: string; owner: Set<string> };
const entries = new Map<string, Entry>();

/** Creates a Window-local URL constructor and Blob URL access scope. */
export function createBlobURLs(origin: () => string, closed: () => boolean) {
  const owned = new Set<string>();
  function permits(entry: Entry): boolean {
    const current = origin();
    return entry.origin === current && (current !== "null" || entry.owner === owned);
  }
  class URL extends globalThis.URL {
    static override createObjectURL(blob: Blob): string {
      if (!(blob instanceof Blob)) throw new TypeError("Expected a Blob");
      if (closed()) throw new TypeError("The Window is closed");
      const current = origin();
      const url = `blob:${current}/${randomUUID()}`;
      entries.set(url, { blob, origin: current, owner: owned });
      owned.add(url);
      return url;
    }
    static override revokeObjectURL(value: string): void {
      if (arguments.length === 0) throw new TypeError("Expected a URL");
      const url = globalThis.URL.parse(String(value));
      if (!url) return;
      const entry = entries.get(url.href);
      if (entry && permits(entry)) {
        entries.delete(url.href);
        entry.owner.delete(url.href);
      }
    }
  }
  Object.defineProperty(URL, "name", { value: "URL", configurable: true });
  return {
    URL,
    resolve(url: string): Entry | null {
      const entry = entries.get(url.split("#", 1)[0] ?? "");
      return entry && permits(entry) ? entry : null;
    },
    permits,
    close(): void {
      for (const url of owned) entries.delete(url);
      owned.clear();
    },
  };
}

/** Resolves a Blob request into its byte range and response metadata. */
export function blobResource(blob: Blob | null, method: string, headers: Record<string, string>) {
  if (!blob || method !== "GET") throw new TypeError("Blob URL request failed");
  let part = blob;
  let status = 200;
  let statusText = "OK";
  const responseHeaders: Record<string, string> = { "content-type": blob.type };
  const range = headers["range"];
  if (range !== undefined) {
    const match = /^bytes[\t ]*=[\t ]*(\d*)[\t ]*-[\t ]*(\d*)$/i.exec(range);
    if (!match || (!match[1] && !match[2])) throw new TypeError("Invalid Blob range");
    const start = match[1] ? Number(match[1]) : Math.max(0, blob.size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), blob.size - 1) : blob.size - 1;
    if (start > end) throw new TypeError("Unsatisfiable Blob range");
    part = blob.slice(start, end + 1, blob.type);
    responseHeaders["content-range"] = `bytes ${start}-${end}/${blob.size}`;
    status = 206;
    statusText = "Partial Content";
  }
  responseHeaders["content-length"] = String(part.size);
  return { status, statusText, headers: responseHeaders, part };
}
