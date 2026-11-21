// Reads immutable Blob bytes through the Window task queue.
import { MIMEType, TextDecoder } from "node:util";
import { createEventHandlers } from "./event-handlers.js";
import type { createEvents } from "./events.js";
import type { createXHR } from "./xhr.js";

type Events = ReturnType<typeof createEvents>;
type Progress = InstanceType<ReturnType<typeof createXHR>["ProgressEvent"]>;
type Handler = ((event: Progress) => unknown) | null;
type Format = "buffer" | "binary" | "dataURL" | "text";

function blobMIME(blob: Blob): MIMEType | undefined {
  if (!blob.type) return undefined;
  try {
    return new MIMEType(blob.type);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return undefined;
  }
}

function textDecoder(label: string | null | undefined): TextDecoder | undefined {
  if (!label) return undefined;
  try {
    return new TextDecoder(label);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return undefined;
  }
}

function decodeText(
  bytes: Uint8Array,
  label: string | undefined,
  mime: MIMEType | undefined,
): string {
  const bom =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? "utf-8"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : bytes[0] === 0xff && bytes[1] === 0xfe
          ? "utf-16le"
          : undefined;
  const decoder =
    textDecoder(bom) ??
    textDecoder(label) ??
    textDecoder(mime?.params.get("charset")) ??
    new TextDecoder();
  return decoder.decode(bytes);
}

/** Creates FileReader with the owning Window's event, buffer, and timer constructors. */
export function createFileReader(input: {
  events: Events;
  DOMException: typeof globalThis.DOMException;
  ProgressEvent: ReturnType<typeof createXHR>["ProgressEvent"];
  queue: (callback: () => void) => void;
  buffer: (bytes: Uint8Array) => ArrayBuffer;
}) {
  const { events, DOMException, ProgressEvent, queue } = input;
  const handlers = createEventHandlers({ compile: () => null });

  class FileReader extends events.EventTarget {
    static readonly EMPTY = 0;
    static readonly LOADING = 1;
    static readonly DONE = 2;
    readonly EMPTY = 0;
    readonly LOADING = 1;
    readonly DONE = 2;

    #state = 0;
    #generation = 0;
    #result: string | ArrayBuffer | null = null;
    #error: DOMException | null = null;

    get readyState(): number {
      return this.#state;
    }
    get result(): string | ArrayBuffer | null {
      return this.#result;
    }
    get error(): DOMException | null {
      return this.#error;
    }

    get onloadstart(): Handler {
      return handlers.get(this, "loadstart") as Handler;
    }
    set onloadstart(value: Handler) {
      handlers.set(this, "loadstart", value as Parameters<typeof handlers.set>[2]);
    }
    get onprogress(): Handler {
      return handlers.get(this, "progress") as Handler;
    }
    set onprogress(value: Handler) {
      handlers.set(this, "progress", value as Parameters<typeof handlers.set>[2]);
    }
    get onload(): Handler {
      return handlers.get(this, "load") as Handler;
    }
    set onload(value: Handler) {
      handlers.set(this, "load", value as Parameters<typeof handlers.set>[2]);
    }
    get onabort(): Handler {
      return handlers.get(this, "abort") as Handler;
    }
    set onabort(value: Handler) {
      handlers.set(this, "abort", value as Parameters<typeof handlers.set>[2]);
    }
    get onerror(): Handler {
      return handlers.get(this, "error") as Handler;
    }
    set onerror(value: Handler) {
      handlers.set(this, "error", value as Parameters<typeof handlers.set>[2]);
    }
    get onloadend(): Handler {
      return handlers.get(this, "loadend") as Handler;
    }
    set onloadend(value: Handler) {
      handlers.set(this, "loadend", value as Parameters<typeof handlers.set>[2]);
    }

    readAsArrayBuffer(blob: Blob): void {
      this.#read(blob, "buffer");
    }
    readAsBinaryString(blob: Blob): void {
      this.#read(blob, "binary");
    }
    readAsDataURL(blob: Blob): void {
      this.#read(blob, "dataURL");
    }
    readAsText(blob: Blob, encoding?: string): void {
      this.#read(blob, "text", encoding === undefined ? undefined : String(encoding));
    }

    abort(): void {
      this.#result = null;
      if (this.#state !== this.LOADING) return;
      this.#state = this.DONE;
      const generation = ++this.#generation;
      this.#fire("abort");
      if (this.#generation === generation) this.#fire("loadend");
    }

    #fire(type: string, size?: number): void {
      this.dispatchEvent(
        events.trusted(
          new ProgressEvent(
            type,
            size === undefined
              ? undefined
              : {
                  lengthComputable: true,
                  loaded: size,
                  total: size,
                },
          ),
        ),
      );
    }

    #read(blob: Blob, format: Format, encoding?: string): void {
      if (!(blob instanceof Blob)) throw new TypeError("Expected a Blob");
      if (this.#state === this.LOADING) {
        throw new DOMException("A read is already in progress", "InvalidStateError");
      }
      const generation = ++this.#generation;
      this.#state = this.LOADING;
      this.#result = null;
      this.#error = null;
      queue(() => {
        if (this.#generation !== generation) return;
        this.#fire("loadstart");
        if (this.#generation !== generation) return;
        void Blob.prototype.arrayBuffer.call(blob).then(
          (buffer) =>
            queue(() => this.#complete(generation, blob, new Uint8Array(buffer), format, encoding)),
          () => queue(() => this.#failed(generation)),
        );
      });
    }

    #complete(
      generation: number,
      blob: Blob,
      bytes: Uint8Array,
      format: Format,
      encoding?: string,
    ): void {
      if (this.#generation !== generation) return;
      if (bytes.length > 0) this.#fire("progress", bytes.length);
      queue(() => {
        if (this.#generation !== generation) return;
        try {
          switch (format) {
            case "buffer":
              this.#result = input.buffer(bytes);
              break;
            case "binary":
              this.#result = Buffer.from(bytes).toString("latin1");
              break;
            case "dataURL":
              this.#result = `data:${blobMIME(blob)?.toString() ?? "application/octet-stream"};base64,${Buffer.from(bytes).toString("base64")}`;
              break;
            case "text":
              this.#result = decodeText(bytes, encoding, blobMIME(blob));
              break;
          }
        } catch {
          this.#failed(generation);
          return;
        }
        this.#state = this.DONE;
        this.#fire("load", bytes.length);
        if (this.#generation === generation) this.#fire("loadend", bytes.length);
      });
    }

    #failed(generation: number): void {
      if (this.#generation !== generation) return;
      this.#error = new DOMException("The Blob could not be read", "NotReadableError");
      this.#state = this.DONE;
      this.#fire("error");
      if (this.#generation === generation) this.#fire("loadend");
    }

    get [Symbol.toStringTag](): string {
      return "FileReader";
    }
  }
  Object.defineProperty(FileReader, "name", { value: "FileReader", configurable: true });
  return FileReader;
}
