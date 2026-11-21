// Owns the Window-local asynchronous XMLHttpRequest state machine.
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { MIMEType, types } from "node:util";
import { sniffHTMLResponseEncoding } from "./html-encoding.js";
import { readResourceSynchronously } from "./synchronous-resource.js";
import { blobResource } from "./blob-url.js";
import type { createEventHandlers } from "./event-handlers.js";
import type { createEvents } from "./events.js";

type Events = ReturnType<typeof createEvents>;
type BrowserEvent = InstanceType<Events["Event"]>;
type EventHandler = ((event: BrowserEvent) => unknown) | null;
const progressEventData = new WeakMap<
  object,
  { lengthComputable: boolean; loaded: number; total: number }
>();
function progressData(receiver: object) {
  const data = progressEventData.get(receiver);
  if (!data) throw new TypeError("Expected a ProgressEvent");
  return data;
}

const responseTypes = ["", "text", "json", "arraybuffer", "blob", "document"] as const;
type ResponseType = (typeof responseTypes)[number];

function byteString(value: unknown): string {
  if (typeof value === "symbol") throw new TypeError("Cannot convert a Symbol to a ByteString");
  const text = String(value);
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) > 255)
      throw new TypeError("ByteString contains a code point greater than 255");
  }
  return text;
}

type OpenRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  headerNames: Record<string, string>;
  blob?: Blob | null;
};

type XHRRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  headerNames?: Readonly<Record<string, string>>;
  body?: string | Uint8Array | ReadableStream<Uint8Array>;
  origin: string;
  credentials: boolean;
  authentication?: { username: string; password: string };
  referrer?: string;
  uploadListener?: boolean;
  fetchPolicy?: {
    mode: Request["mode"];
    credentials: Request["credentials"];
    redirect: Request["redirect"];
  };
  signal: AbortSignal;
  onHeaders: (response: Omit<XHRResponse, "bytes">) => void;
  onChunk: (chunk: Uint8Array) => void;
};

type XHRResponse = {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bytes: ArrayBuffer;
  stream?: ReadableStream<Uint8Array> | null;
  redirected?: boolean;
  responseType?: "basic" | "cors" | "opaque" | "opaqueredirect";
  bodyDecoded?: boolean;
};

export type XHRTransport = (request: XHRRequest) => Promise<XHRResponse>;

type MultipartEntry = [name: string, value: string] | [name: string, value: Blob, filename: string];
type SynchronousBody = string | Uint8Array | Blob | { multipart: MultipartEntry[] };

export type SynchronousXHRTransport = (request: {
  url: string;
  method: string;
  headers: Record<string, string>;
  headerNames?: Readonly<Record<string, string>>;
  body?: SynchronousBody;
  origin: string;
  credentials: boolean;
  authentication?: { username: string; password: string };
  referrer?: string;
}) => XHRResponse;

const require = createRequire(import.meta.url);
type TextCodec = Pick<
  typeof import("@exodus/bytes/encoding.js"),
  "legacyHookDecode" | "labelToName" | "getBOMEncoding"
>;
let textCodec: TextCodec | undefined;

function byteCodec(): TextCodec {
  return (textCodec ??= require("@exodus/bytes/encoding.js"));
}

function decodeTextResponse(bytes: ArrayBuffer, charset: string | undefined): string {
  const codec = byteCodec();
  const encoding = charset === undefined ? "UTF-8" : (codec.labelToName(charset) ?? "UTF-8");
  return codec.legacyHookDecode(new Uint8Array(bytes), encoding);
}

function decodeDocumentResponse(input: {
  bytes: ArrayBuffer;
  charset: string | undefined;
  isXML: boolean;
}) {
  const sniff: (
    bytes: Uint8Array,
    options: {
      xml: boolean;
      transportLayerEncodingLabel: string | null;
      defaultEncoding: string;
      maxPrescanBytes?: number;
    },
  ) => string = require("html-encoding-sniffer");
  const bytes = new Uint8Array(input.bytes);
  const codec = byteCodec();
  let encoding: string;
  if (input.isXML) {
    encoding = sniff(bytes, {
      xml: true,
      transportLayerEncodingLabel: input.charset ?? null,
      defaultEncoding: "UTF-8",
    });
  } else {
    const bom = codec.getBOMEncoding(bytes);
    const transport = input.charset === undefined ? null : codec.labelToName(input.charset);
    encoding =
      (bom === null ? null : codec.labelToName(bom)) ??
      transport ??
      sniffHTMLResponseEncoding(input.bytes, codec.labelToName) ??
      sniff(bytes, {
        xml: false,
        transportLayerEncodingLabel: null,
        defaultEncoding: "UTF-8",
        maxPrescanBytes: 0,
      });
  }
  return { markup: byteCodec().legacyHookDecode(bytes, encoding), encoding };
}

const maximumTimerDelayMs = 2_147_483_647;
const methodToken = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const normalizedMethods = new Set(["DELETE", "GET", "HEAD", "OPTIONS", "POST", "PUT"]);
const forbiddenHeaders = new Set([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
]);

function parseMIME(value: string): MIMEType | undefined {
  try {
    return new MIMEType(value);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return undefined;
  }
}

/** Checks names reserved for the user agent in outgoing requests. */
export function isForbiddenRequestHeader(name: string, value = ""): boolean {
  if (forbiddenHeaders.has(name) || name.startsWith("proxy-") || name.startsWith("sec-"))
    return true;
  if (!["x-http-method", "x-http-method-override", "x-method-override"].includes(name))
    return false;
  let quoted = false;
  let escaped = false;
  let start = 0;
  // Header values are finite byte strings; commas inside quoted strings do not delimit methods.
  for (let index = 0; index <= value.length; index++) {
    const character = value[index];
    if (index === value.length || (character === "," && !quoted)) {
      if (["CONNECT", "TRACE", "TRACK"].includes(value.slice(start, index).trim().toUpperCase()))
        return true;
      start = index + 1;
    } else if (escaped) escaped = false;
    else if (quoted && character === "\\") escaped = true;
    else if (character === '"') quoted = !quoted;
  }
  return false;
}

/** Creates XMLHttpRequest and ProgressEvent constructors tied to one Window. */
export function createXHR<Document>(
  events: Events,
  context: {
    DOMException: typeof globalThis.DOMException;
    handlers: ReturnType<typeof createEventHandlers>;
    baseURL: () => string;
    origin: () => string;
    referrer: () => string;
    isActive: () => boolean;
    signal: () => AbortSignal;
    resourceTime: () => number;
    recordResourceTiming: (url: string, startTime: number) => void;
    request: XHRTransport | undefined;
    requestSynchronously: SynchronousXHRTransport | undefined;
    resolveBlob: (url: string) => Blob | null;
    responseBuffer: (bytes: ArrayBuffer) => ArrayBuffer;
    parseJSON: (text: string) => unknown;
    isDocument: (value: unknown) => boolean;
    serializeDocument: (value: unknown) => { markup: string; isXML: boolean } | undefined;
    parseDocument: (input: {
      markup: string;
      url: string;
      contentType: string;
      encoding: string;
      lastModifiedMs: number;
      isXML: boolean;
    }) => Document | null;
  },
) {
  const { Event, EventTarget } = events;
  const { DOMException, handlers } = context;
  class ProgressEvent extends Event {
    constructor(
      type: string,
      init: {
        bubbles?: boolean;
        cancelable?: boolean;
        composed?: boolean;
        lengthComputable?: boolean;
        loaded?: number;
        total?: number;
      } = {},
    ) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      super(type, init);
      progressEventData.set(this, {
        lengthComputable: Boolean(init?.lengthComputable),
        loaded: Number(init?.loaded ?? 0),
        total: Number(init?.total ?? 0),
      });
    }
    get lengthComputable(): boolean {
      return progressData(this).lengthComputable;
    }
    get loaded(): number {
      return progressData(this).loaded;
    }
    get total(): number {
      return progressData(this).total;
    }
    override get [Symbol.toStringTag](): string {
      return "ProgressEvent";
    }
  }
  for (const name of ["lengthComputable", "loaded", "total"])
    Object.defineProperty(ProgressEvent.prototype, name, { enumerable: true });

  const targetKey = Symbol();
  const requestEvents = [
    "loadstart",
    "progress",
    "abort",
    "error",
    "load",
    "timeout",
    "loadend",
  ] as const;
  class XMLHttpRequestEventTarget extends EventTarget {
    constructor(key: symbol) {
      super();
      if (key !== targetKey) throw new TypeError("Illegal constructor");
    }
    get [Symbol.toStringTag](): string {
      return "XMLHttpRequestEventTarget";
    }
  }
  interface XMLHttpRequestEventTarget extends Record<
    `on${(typeof requestEvents)[number]}`,
    EventHandler
  > {}
  for (const type of requestEvents) {
    Object.defineProperty(XMLHttpRequestEventTarget.prototype, `on${type}`, {
      configurable: true,
      enumerable: true,
      get(this: XMLHttpRequestEventTarget) {
        return handlers.get(this, type);
      },
      set(this: XMLHttpRequestEventTarget, handler: EventHandler) {
        handlers.set(this, type, handler);
      },
    });
  }

  class XMLHttpRequestUpload extends XMLHttpRequestEventTarget {
    override get [Symbol.toStringTag](): string {
      return "XMLHttpRequestUpload";
    }
  }

  function normalizeBody(data: unknown): unknown {
    if (data == null) return null;
    if (
      types.isSharedArrayBuffer(data) ||
      (ArrayBuffer.isView(data) && types.isSharedArrayBuffer(data.buffer))
    )
      throw new TypeError("XMLHttpRequest bodies require an unshared buffer");
    if (
      ArrayBuffer.isView(data) ||
      types.isArrayBuffer(data) ||
      data instanceof Blob ||
      data instanceof FormData ||
      data instanceof URLSearchParams ||
      context.isDocument(data)
    )
      return data;
    return `${data}`.toWellFormed();
  }

  function extractTextBody(data: unknown, headers: Record<string, string>): string {
    const document = context.serializeDocument(data);
    const body = document?.markup ?? String(data);
    const authorType = headers["content-type"];
    if (authorType === undefined) {
      const mime = document ? (document.isXML ? "application/xml" : "text/html") : "text/plain";
      headers["content-type"] = `${mime};charset=UTF-8`;
    } else {
      const mime = parseMIME(authorType);
      const charset = mime?.params.get("charset");
      if (mime && charset && charset.toLowerCase() !== "utf-8") {
        mime.params.set("charset", "UTF-8");
        headers["content-type"] = mime.toString();
      }
    }
    return body;
  }

  class XMLHttpRequest extends XMLHttpRequestEventTarget {
    static readonly UNSENT = 0;
    static readonly OPENED = 1;
    static readonly HEADERS_RECEIVED = 2;
    static readonly LOADING = 3;
    static readonly DONE = 4;
    readonly UNSENT = 0;
    readonly OPENED = 1;
    readonly HEADERS_RECEIVED = 2;
    readonly LOADING = 3;
    readonly DONE = 4;

    readonly #upload = new XMLHttpRequestUpload(targetKey);

    constructor() {
      super(targetKey);
    }

    get upload(): XMLHttpRequestUpload {
      return this.#upload;
    }
    override get [Symbol.toStringTag](): string {
      return "XMLHttpRequest";
    }
    #authentication: { origin: string; username: string; password: string } | undefined;
    #timeout = 0;
    #responseType: ResponseType = "";
    #synchronous = false;
    #withCredentials = false;

    get withCredentials(): boolean {
      return this.#withCredentials;
    }
    set withCredentials(value: boolean) {
      if (this.#state > this.OPENED || this.#active)
        throw new DOMException("The object is in an invalid state.", "InvalidStateError");
      this.#withCredentials = Boolean(value);
    }

    get timeout(): number {
      return this.#timeout;
    }
    set timeout(value: number) {
      if (this.#synchronous)
        throw new DOMException("Timeout is unavailable in synchronous mode", "InvalidAccessError");
      this.#timeout = Number(value) >>> 0;
      this.#rescheduleDeadline?.();
    }
    get responseType(): ResponseType {
      return this.#responseType;
    }
    set responseType(value: ResponseType) {
      const text = `${value}`;
      const type = responseTypes.find((candidate) => candidate === text);
      if (type === undefined) return;
      if (this.#state >= this.LOADING)
        throw new DOMException("The object is in an invalid state.", "InvalidStateError");
      if (this.#state === this.OPENED && this.#synchronous)
        throw new DOMException(
          "The object does not support the operation or argument.",
          "InvalidAccessError",
        );
      this.#responseType = type;
    }

    #state = 0;
    #request: OpenRequest | undefined;
    #active: AbortController | undefined;
    #rescheduleDeadline: (() => void) | undefined;
    #uploadTotal: number | undefined;
    #uploadComplete = false;
    #uploadListener = false;
    #response: XHRResponse | undefined;
    #mimeOverride: string | undefined;
    #responseValue: unknown;
    #decoded = false;
    #documentResponse: Document | null | undefined;
    #chunks: Uint8Array[] = [];
    #received = 0;

    get readyState(): number {
      return this.#state;
    }
    get status(): number {
      return this.#response?.status ?? 0;
    }
    get statusText(): string {
      return this.#response?.statusText ?? "";
    }
    get responseURL(): string {
      return this.#response?.url ?? "";
    }

    get responseText(): string {
      if (this.responseType !== "" && this.responseType !== "text")
        throw new DOMException("The response type is not text", "InvalidStateError");
      return this.#state >= 3 ? this.#text() : "";
    }
    get response(): unknown {
      if (this.responseType === "" || this.responseType === "text") return this.responseText;
      if (this.#state !== 4 || !this.#response) return null;
      if (this.responseType === "document") return this.responseXML;
      if (this.#decoded) return this.#responseValue;
      const { bytes } = this.#response;
      if (this.responseType === "arraybuffer") this.#responseValue = context.responseBuffer(bytes);
      else if (this.responseType === "blob")
        this.#responseValue = new Blob([bytes], { type: this.#mime() });
      else if (this.responseType === "json") {
        try {
          this.#responseValue = context.parseJSON(new TextDecoder().decode(bytes));
        } catch (error) {
          if (!types.isNativeError(error) || error.name !== "SyntaxError") throw error;
          this.#responseValue = null;
        }
      } else this.#responseValue = null;
      this.#decoded = true;
      return this.#responseValue;
    }
    get responseXML(): Document | null {
      if (this.responseType !== "" && this.responseType !== "document") {
        throw new DOMException("The response type is not a document", "InvalidStateError");
      }
      if (this.#state !== this.DONE || !this.#response) return null;
      if (this.#documentResponse !== undefined) return this.#documentResponse;
      const { bytes, url } = this.#response;
      const mime = parseMIME(this.#mime()) ?? new MIMEType("text/xml");
      const type = mime.essence;
      const isXML = type === "text/xml" || type === "application/xml" || type.endsWith("+xml");
      if (
        this.#request?.method === "HEAD" ||
        (!isXML && (type !== "text/html" || this.responseType === ""))
      ) {
        return (this.#documentResponse = null);
      }
      const decoded = decodeDocumentResponse({ bytes, charset: this.#charset(), isXML });
      return (this.#documentResponse = context.parseDocument({
        markup: decoded.markup,
        url,
        contentType: type,
        encoding: decoded.encoding,
        lastModifiedMs: Date.parse(this.getResponseHeader("last-modified") ?? ""),
        isXML,
      }));
    }

    open(
      method: string,
      url: string,
      async = true,
      username?: string | null,
      password?: string | null,
    ): void {
      const token = String(method);
      if (!methodToken.test(token)) throw new DOMException("Invalid HTTP method", "SyntaxError");
      const upper = token.toUpperCase();
      if (["CONNECT", "TRACE", "TRACK"].includes(upper))
        throw new DOMException("Forbidden HTTP method", "SecurityError");
      const parsed = URL.parse(String(url), context.baseURL());
      if (!parsed) throw new DOMException("Invalid request URL", "SyntaxError");
      if (!context.isActive())
        throw new DOMException("The associated document is not active", "InvalidStateError");
      if (!async && (this.timeout !== 0 || this.responseType !== "")) {
        throw new DOMException(
          "Synchronous requests require the default timeout and response type",
          "InvalidAccessError",
        );
      }
      if (
        !async &&
        parsed.protocol !== "blob:" &&
        parsed.protocol !== "data:" &&
        !context.requestSynchronously
      ) {
        throw new DOMException("Synchronous network requests are unavailable", "NotSupportedError");
      }
      parsed.hash = "";
      if (username || (password && !parsed.username)) {
        this.#authentication = {
          origin: parsed.origin,
          username: username == null ? "" : String(username),
          password: password == null ? "" : String(password),
        };
        parsed.username = "";
        parsed.password = "";
      } else if (this.#authentication?.origin !== parsed.origin) this.#authentication = undefined;
      this.#active?.abort();
      this.#uploadTotal = undefined;
      this.#uploadComplete = false;
      this.#uploadListener = false;
      this.#active = undefined;
      this.#response = undefined;
      this.#chunks = [];
      this.#received = 0;
      this.#decoded = false;
      this.#documentResponse = undefined;
      this.#responseValue = undefined;
      this.#synchronous = !async;
      this.#request = {
        url: parsed.href,
        method: normalizedMethods.has(upper) ? upper : token,
        headers: Object.create(null),
        headerNames: Object.create(null),
        ...(parsed.protocol === "blob:" ? { blob: context.resolveBlob(parsed.href) } : {}),
      };
      this.#transition(1);
    }

    setRequestHeader(name: string, value: string): void {
      if (arguments.length < 2) throw new TypeError("2 arguments required");
      const spelling = byteString(name);
      const text = byteString(value).replace(/^[\t ]+|[\t ]+$/g, "");
      if (this.#state !== 1 || this.#active || !this.#request)
        throw new DOMException("Request is not open", "InvalidStateError");
      const key = spelling.toLowerCase();
      if (!methodToken.test(key) || /[\r\n\0]/.test(text))
        throw new DOMException("Invalid HTTP header", "SyntaxError");
      if (isForbiddenRequestHeader(key, text)) return;
      this.#request.headerNames[key] ??= spelling;
      const existing = this.#request.headers[key];
      this.#request.headers[key] = existing === undefined ? text : existing + ", " + text;
    }

    getResponseHeader(name: string): string | null {
      return this.#response?.headers[String(name).toLowerCase()] ?? null;
    }
    getAllResponseHeaders(): string {
      return Object.entries(this.#response?.headers ?? {})
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, value]) => `${name}: ${value}\r\n`)
        .join("");
    }
    overrideMimeType(value: string): void {
      if (this.#state >= 3)
        throw new DOMException("Response loading has already started", "InvalidStateError");
      this.#mimeOverride = parseMIME(String(value))?.toString() ?? "application/octet-stream";
    }

    send(data?: unknown): void {
      data = normalizeBody(data);
      if (!context.isActive())
        throw new DOMException("The associated document is not active", "InvalidStateError");
      if (this.#state !== 1 || this.#active || !this.#request)
        throw new DOMException("Request is not open", "InvalidStateError");
      const request = this.#request;
      const startTime = context.resourceTime();
      if (this.#synchronous) {
        this.#sendSynchronous(request, data, startTime);
        return;
      }
      const headers = { ...request.headers };
      let body: string | Uint8Array | undefined;
      let encodedBody: Request | undefined;
      if (data != null && request.method !== "GET" && request.method !== "HEAD") {
        if (ArrayBuffer.isView(data))
          body = Uint8Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        else if (types.isArrayBuffer(data)) body = Uint8Array.from(new Uint8Array(data));
        else if (data instanceof URLSearchParams) {
          headers["content-type"] ??= "application/x-www-form-urlencoded;charset=UTF-8";
          body = extractTextBody(URLSearchParams.prototype.toString.call(data), headers);
        } else if (typeof data === "object" && (data instanceof FormData || data instanceof Blob)) {
          // Request extracts a snapshot now, including its boundary and MIME type.
          encodedBody = new Request("http://localhost/", { method: "POST", body: data });
          const type = encodedBody.headers.get("content-type");
          if (type !== null) headers["content-type"] ??= type;
        } else {
          body = extractTextBody(data, headers);
        }
      }
      const uploadListener = events.hasListeners(this.#upload);
      this.#uploadListener = uploadListener;
      this.#uploadComplete = body === undefined && encodedBody === undefined;
      if (uploadListener && !this.#uploadComplete) {
        this.#uploadTotal =
          typeof body === "string" ? Buffer.byteLength(body) : (body?.byteLength ?? 0);
      }
      const active = new AbortController();
      this.#active = active;
      const windowSignal = context.signal();
      const signal = AbortSignal.any([active.signal, windowSignal]);
      this.dispatchEvent(events.trusted(new ProgressEvent("loadstart")));
      if (this.#active !== active) return;
      if (signal.aborted) {
        this.#active = undefined;
        return;
      }
      void this.#execute(
        active,
        windowSignal,
        {
          ...request,
          headers,
          ...(body === undefined ? {} : { body }),
          origin: context.origin(),
          credentials: this.withCredentials,
          ...(this.#authentication ? { authentication: this.#authentication } : {}),
          referrer: context.referrer(),
          uploadListener,
          signal,
          onHeaders: (metadata) => {
            if (this.#active !== active || signal.aborted) return;
            this.#finishUpload(active);
            if (this.#active !== active || signal.aborted) return;
            this.#response = { ...metadata, bytes: new ArrayBuffer(0) };
            this.#transition(2);
          },
          onChunk: (chunk) => {
            if (this.#active !== active || signal.aborted || chunk.byteLength === 0) return;
            this.#chunks.push(chunk);
            this.#received += chunk.byteLength;
            this.#transition(3);
            if (this.#active === active)
              this.dispatchEvent(this.#progress("progress", this.#received));
          },
        },
        startTime,
        encodedBody,
      );
    }

    #sendSynchronous(request: OpenRequest, data: unknown, startTime: number): void {
      try {
        context.signal().throwIfAborted();
        if (request.blob !== undefined) {
          const { part, ...metadata } = blobResource(request.blob, request.method, request.headers);
          const { bytes } = readResourceSynchronously({ kind: "blob", blob: part });
          this.#response = { ...metadata, bytes, url: request.url };
        } else if (request.url.startsWith("data:")) {
          const { bytes, contentType } = readResourceSynchronously({
            kind: "data",
            url: request.url,
            method: request.method,
          });
          this.#response = {
            bytes,
            url: request.url,
            status: 200,
            statusText: "OK",
            headers: contentType === null ? {} : { "content-type": contentType },
          };
        } else {
          if (!context.requestSynchronously)
            throw new TypeError("No synchronous HTTP transport is available");
          const headers = { ...request.headers };
          let body: SynchronousBody | undefined;
          if (data != null && request.method !== "GET" && request.method !== "HEAD") {
            if (ArrayBuffer.isView(data))
              body = Uint8Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
            else if (types.isArrayBuffer(data)) body = Uint8Array.from(new Uint8Array(data));
            else if (data instanceof Blob) {
              body = data;
              if (data.type) headers["content-type"] ??= data.type;
            } else if (data instanceof URLSearchParams) {
              headers["content-type"] ??= "application/x-www-form-urlencoded;charset=UTF-8";
              body = extractTextBody(URLSearchParams.prototype.toString.call(data), headers);
            } else if (data instanceof FormData) {
              body = {
                multipart: Array.from(data, ([name, value]): MultipartEntry =>
                  typeof value === "string" ? [name, value] : [name, value, value.name],
                ),
              };
            } else {
              body = extractTextBody(data, headers);
            }
          }
          this.#response = context.requestSynchronously({
            url: request.url,
            method: request.method,
            headers,
            headerNames: request.headerNames,
            ...(body === undefined ? {} : { body }),
            origin: context.origin(),
            credentials: this.withCredentials,
            ...(this.#authentication ? { authentication: this.#authentication } : {}),
            referrer: context.referrer(),
          });
        }
      } catch {
        this.#state = this.DONE;
        throw new DOMException("Synchronous resource request failed", "NetworkError");
      }
      context.recordResourceTiming(request.url, startTime);
      this.#transition(4);
      if (this.#state !== 4 || !this.#response) return;
      const size = this.#response.bytes.byteLength;
      this.dispatchEvent(this.#progress("load", size));
      this.dispatchEvent(this.#progress("loadend", size));
    }

    abort(): void {
      const active = this.#active;
      if (active) {
        active.abort();
        this.#fail(active, "abort");
      }
      if (!this.#active && this.#state === 4) {
        this.#state = 0;
        this.#response = undefined;
      }
    }

    #trackDeadline(
      active: AbortController,
      signal: AbortSignal,
      windowSignal: AbortSignal,
      startTime: number,
    ): () => void {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const clearTimer = () => {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
      };
      const reschedule = () => {
        clearTimer();
        if (!this.#timeout || signal.aborted) return;
        const remainingMs = Math.ceil(this.#timeout - (context.resourceTime() - startTime));
        if (remainingMs > maximumTimerDelayMs) {
          timer = setTimeout(reschedule, maximumTimerDelayMs);
          return;
        }
        timer = setTimeout(
          () => {
            if (signal.aborted) return;
            active.abort();
            if (!windowSignal.aborted) this.#fail(active, "timeout");
          },
          Math.max(0, remainingMs),
        );
      };
      const cleanup = () => {
        clearTimer();
        signal.removeEventListener("abort", cleanup);
        if (this.#rescheduleDeadline === reschedule) this.#rescheduleDeadline = undefined;
      };
      this.#rescheduleDeadline = reschedule;
      signal.addEventListener("abort", cleanup, { once: true });
      reschedule();
      return cleanup;
    }

    async #execute(
      active: AbortController,
      windowSignal: AbortSignal,
      request: XHRRequest & { blob?: Blob | null },
      startTime: number,
      encodedBody?: Request,
    ): Promise<void> {
      const clearDeadline = this.#trackDeadline(active, request.signal, windowSignal, startTime);
      let response: XHRResponse;
      try {
        if (encodedBody) {
          const bytes = await encodedBody.arrayBuffer();
          if (request.signal.aborted || this.#active !== active) return;
          request.body = new Uint8Array(bytes);
          if (this.#uploadTotal !== undefined) this.#uploadTotal = bytes.byteLength;
        }
        if (this.#uploadTotal !== undefined)
          this.#uploadProgress("loadstart", 0, this.#uploadTotal);
        if (request.signal.aborted || this.#active !== active) return;
        if (request.blob !== undefined) {
          const { part, ...metadata } = blobResource(request.blob, request.method, request.headers);
          request.onHeaders({ ...metadata, url: request.url });
          request.signal.throwIfAborted();
          const bytes = await part.arrayBuffer();
          request.signal.throwIfAborted();
          request.onChunk(new Uint8Array(bytes));
          response = { ...metadata, url: request.url, bytes };
        } else {
          if (!context.request) throw new TypeError("No XMLHttpRequest transport is available");
          response = await context.request(request);
        }
      } catch {
        if (!windowSignal.aborted && !active.signal.aborted) this.#fail(active, "error");
        return;
      } finally {
        if (windowSignal.aborted && this.#active === active) this.#active = undefined;
        clearDeadline();
      }
      if (this.#active !== active || request.signal.aborted) return;
      this.#finishUpload(active);
      if (this.#active !== active || request.signal.aborted) return;
      this.#response = response;
      this.#chunks = [];
      if (this.#state < 2) this.#transition(2);
      if (this.#active !== active) return;
      if (this.#state < 3 && response.bytes.byteLength > 0) {
        this.#transition(3);
        if (this.#active === active)
          this.dispatchEvent(this.#progress("progress", response.bytes.byteLength));
      }
      if (response.bytes.byteLength === 0) this.dispatchEvent(this.#progress("progress", 0));
      if (this.#active !== active) return;
      this.#active = undefined;
      context.recordResourceTiming(request.url, startTime);
      this.#transition(4);
      if (this.#state !== 4) return;
      this.dispatchEvent(this.#progress("load", response.bytes.byteLength));
      this.dispatchEvent(this.#progress("loadend", response.bytes.byteLength));
    }

    #uploadProgress(type: string, loaded: number, total: number): void {
      this.#upload.dispatchEvent(
        events.trusted(new ProgressEvent(type, { loaded, total, lengthComputable: total > 0 })),
      );
    }

    #finishUpload(active: AbortController): void {
      this.#uploadComplete = true;
      const total = this.#uploadTotal;
      if (total === undefined) return;
      this.#uploadTotal = undefined;
      for (const type of ["progress", "load", "loadend"]) {
        if (this.#active !== active) return;
        this.#uploadProgress(type, total, total);
      }
    }

    #fail(active: AbortController, type: string): void {
      if (this.#active !== active) return;
      this.#uploadTotal = undefined;
      this.#active = undefined;
      this.#response = undefined;
      this.#chunks = [];
      this.#received = 0;
      this.#transition(4);
      // Reentrant readystatechange handlers may already have opened/sent a replacement request.
      // The platform checks the current upload-complete flag after that notification.
      if (!this.#uploadComplete) {
        this.#uploadComplete = true;
        if (this.#uploadListener) {
          this.#uploadProgress(type, 0, 0);
          this.#uploadProgress("loadend", 0, 0);
        }
      }
      this.dispatchEvent(events.trusted(new ProgressEvent(type)));
      this.dispatchEvent(events.trusted(new ProgressEvent("loadend")));
    }

    #transition(state: number): void {
      if (this.#state === state && state !== this.LOADING) return;
      this.#state = state;
      this.dispatchEvent(events.trusted(new Event("readystatechange")));
    }
    #mime(): string {
      return this.#mimeOverride ?? this.getResponseHeader("content-type") ?? "";
    }
    #charset(): string | undefined {
      const override = this.#mimeOverride === undefined ? undefined : parseMIME(this.#mimeOverride);
      return (
        override?.params.get("charset") ??
        parseMIME(this.getResponseHeader("content-type") ?? "")?.params.get("charset") ??
        undefined
      );
    }
    #progress(type: string, loaded: number): ProgressEvent {
      const length = this.getResponseHeader("content-length");
      const total = Number(length);
      const isDecoded = this.#response?.bodyDecoded === true;
      const lengthComputable =
        !isDecoded && length !== null && Number.isSafeInteger(total) && total > 0;
      return events.trusted(
        new ProgressEvent(type, {
          loaded,
          total: lengthComputable ? total : 0,
          lengthComputable,
        }),
      );
    }
    #text(): string {
      let bytes = this.#response?.bytes;
      if (this.#chunks.length) {
        const partial = new Uint8Array(this.#received);
        let offset = 0;
        for (const chunk of this.#chunks) {
          partial.set(chunk, offset);
          offset += chunk.byteLength;
        }
        bytes = partial.buffer;
      }
      if (!bytes) return "";
      const charset = this.#charset();
      const mime = parseMIME(this.#mime()) ?? new MIMEType("text/xml");
      if (
        this.responseType === "" &&
        (mime.essence === "text/xml" ||
          mime.essence === "application/xml" ||
          mime.essence.endsWith("+xml")) &&
        (charset === undefined || byteCodec().labelToName(charset) === null)
      )
        return decodeDocumentResponse({ bytes, charset, isXML: true }).markup;
      return decodeTextResponse(bytes, charset);
    }
    get onreadystatechange(): EventHandler {
      return handlers.get(this, "readystatechange");
    }
    set onreadystatechange(value: EventHandler) {
      handlers.set(this, "readystatechange", value);
    }
  }
  return { XMLHttpRequest, XMLHttpRequestEventTarget, XMLHttpRequestUpload, ProgressEvent };
}
