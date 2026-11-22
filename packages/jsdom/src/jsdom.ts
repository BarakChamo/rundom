// Implements the synchronous Node-facing entry point for the standalone DOM.
import { createDocumentFragment, createWindow } from "@run-dom/dom";
import { open } from "node:fs/promises";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import type { Context } from "node:vm";
import type { CookieJar as BaseCookieJar } from "tough-cookie";
import { CookieJar } from "./cookies.js";
import { requestSynchronousHTTP } from "./synchronous-http.js";
import { fetchResource, type TransportOptions } from "./main-resource.js";
import { normalizeMarkup, normalizeFrameMarkup } from "./markup-input.js";
import { decodeTextResource } from "./resource-text.js";
import { createWebSocketClass } from "./websocket.js";
import { VirtualConsole } from "./virtual-console.js";

export { requestInterceptor } from "./request-interceptor.js";
export { CookieJar } from "./cookies.js";
export * as toughCookie from "tough-cookie";
export { VirtualConsole } from "./virtual-console.js";

const sourceLastModified = Symbol("source last modified");

type Options = {
  [sourceLastModified]?: number;
  includeNodeLocations?: boolean;
  url?: string;
  referrer?: string;
  runScripts?: string | undefined;
  beforeParse?: (window: ReturnType<typeof createWindow>["window"]) => void;
  virtualConsole?: VirtualConsole;
  pretendToBeVisual?: boolean;
  storageQuota?: number;
  contentType?: string;
  cookieJar?: BaseCookieJar;
  resources?: "usable" | (TransportOptions & { userAgent?: string });
};

const defaultUserAgent = `Mozilla/5.0 (${process.platform || "unknown OS"}) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/31.0.1`;

function userAgentFor(resources: Options["resources"]): string {
  return (
    (typeof resources === "object" && resources !== null ? resources.userAgent : undefined) ||
    defaultUserAgent
  );
}

function parseScriptMode(value: unknown): "outside-only" | "dangerously" | undefined {
  if (value === undefined) return undefined;
  const mode = String(value);
  if (mode === "outside-only" || mode === "dangerously") return mode;
  throw new RangeError('runScripts must be undefined, "dangerously", or "outside-only"');
}

/** Parses a string as an isolated HTML document with script execution controlled by the runScripts option.
 * @example new JSDOM("<p>Hello</p>").window.document.body.textContent
 */
export class JSDOM {
  /** Parses HTML into a detached fragment whose owner document is shared by calls to this method. */
  static fragment(input: unknown = ""): ReturnType<typeof createDocumentFragment> {
    return createDocumentFragment(String(input));
  }

  /** Reads the document from disk and defaults its base URL to the file URL. */
  static async fromFile(filename: string, options: Options = {}): Promise<JSDOM> {
    const url = options.url ?? pathToFileURL(filename).href;
    const contentType =
      options.contentType ??
      ([".xml", ".xhtml", ".xht"].includes(extname(filename))
        ? "application/xhtml+xml"
        : "text/html");
    const file = await open(filename);
    let bytes: Buffer;
    let modifiedMs: number;
    try {
      bytes = await file.readFile();
      modifiedMs = (await file.stat()).mtimeMs;
    } finally {
      await file.close();
    }
    return new JSDOM(bytes, { ...options, url, contentType, [sourceLastModified]: modifiedMs });
  }

  /** Fetches the main document, following redirects and sharing its cookie jar. */
  static async fromURL(url: string, options: Options = {}): Promise<JSDOM> {
    if (options.url !== undefined)
      throw new TypeError("Cannot supply a url option when using fromURL");
    if (options.contentType !== undefined)
      throw new TypeError("Cannot supply a contentType option when using fromURL");
    const cookieJar = options.cookieJar ?? new CookieJar();
    const transport = options.resources;
    const response = await fetchResource({
      ...(typeof transport === "object" && transport !== null ? { transport } : {}),
      url,
      cookieJar,
      userAgent: userAgentFor(options.resources),
      ...(options.referrer === undefined ? {} : { referrer: options.referrer }),
    });
    return new JSDOM(response.bytes, {
      ...options,
      cookieJar,
      url: response.url,
      [sourceLastModified]: Date.parse(response.headers["last-modified"] ?? ""),
      ...(response.contentType === undefined ? {} : { contentType: response.contentType }),
    });
  }

  readonly #realm: ReturnType<typeof createWindow>;
  readonly #includeNodeLocations: boolean;

  #virtualConsole: VirtualConsole | undefined;
  #cookieJar: BaseCookieJar | undefined;

  constructor(input: unknown = "", options: Options = {}) {
    this.#includeNodeLocations = Boolean(options.includeNodeLocations);
    const { runScripts, virtualConsole, cookieJar, contentType } = options;
    const markup = normalizeMarkup(input, contentType);
    if (markup.isXML && this.#includeNodeLocations)
      throw new TypeError("Cannot set includeNodeLocations to true with an XML content type");
    this.#cookieJar = cookieJar;
    if (virtualConsole !== undefined && !(virtualConsole instanceof VirtualConsole))
      throw new TypeError("virtualConsole must be an instance of VirtualConsole");
    this.#virtualConsole = virtualConsole;
    const mode = parseScriptMode(runScripts);
    const resources = options.resources;
    if (
      resources !== undefined &&
      resources !== "usable" &&
      (typeof resources !== "object" || resources === null)
    )
      throw new TypeError('resources must be undefined, "usable", or an object');
    const transport = typeof resources === "object" ? resources : undefined;
    this.#realm = createWindow({
      ...markup,
      jsdomCompatibility: true,
      lastModifiedMs: options[sourceLastModified],
      createWebSocket: (context) =>
        createWebSocketClass({
          ...context,
          cookieJar: () => this.cookieJar,
          ...(transport ? { transport } : {}),
        }),
      // Like jsdom, synchronous XHR uses a worker with its own HTTP transport.
      xhrSynchronously: (request) =>
        requestSynchronousHTTP(request, this.cookieJar, userAgentFor(resources)),
      xhr: async ({ url, signal, ...request }) =>
        fetchResource({
          url,
          signal,
          xhr: request,
          cookieJar: this.cookieJar,
          userAgent: userAgentFor(resources),
          ...(transport ? { transport } : {}),
        }),
      ...(resources === undefined
        ? {}
        : {
            loadTextResource: async ({
              kind,
              url,
              referrer,
              element,
              signal,
              onHTTPErrorResponse,
              fallbackEncoding,
              fallbackOrigin,
              charset,
            }) => {
              const response = await fetchResource({
                url,
                referrer,
                element,
                signal,
                allowErrorStatus: kind === "frame",
                ...(onHTTPErrorResponse ? { onHTTPErrorResponse } : {}),
                cookieJar: this.cookieJar,
                userAgent: userAgentFor(resources),
                ...(transport ? { transport } : {}),
              });
              if (kind === "frame") {
                const { markup: code, ...document } = normalizeFrameMarkup({
                  bytes: response.bytes,
                  contentType: response.contentType,
                  fallbackEncoding:
                    new URL(response.url).origin === fallbackOrigin
                      ? (fallbackEncoding ?? "UTF-8")
                      : "windows-1252",
                });
                return {
                  code,
                  url: response.url,
                  document: {
                    ...document,
                    lastModifiedMs: Date.parse(response.headers["last-modified"] ?? ""),
                  },
                };
              }
              return {
                ...decodeTextResource({
                  kind,
                  bytes: response.bytes,
                  contentType: response.contentType,
                  fallbackEncoding: fallbackEncoding ?? "UTF-8",
                  charset,
                }),
                url: response.url,
              };
            },
            reportResourceError: (kind, url, cause) => {
              const error = new Error(`Could not load ${kind}: "${url}"`, { cause });
              this.virtualConsole.emit(
                "jsdomError",
                Object.assign(error, { type: "resource-loading", url }),
              );
            },
          }),
      reportXMLParsingError: (cause) => {
        this.virtualConsole.emit(
          "jsdomError",
          Object.assign(new Error("Could not parse XML", { cause }), { type: "xml-parsing" }),
        );
      },
      reportStyleError: (sheetText, cause) => {
        const error = new Error("Could not parse CSS stylesheet", { cause });
        this.virtualConsole.emit(
          "jsdomError",
          Object.assign(error, { type: "css-parsing", sheetText }),
        );
      },
      userAgent: userAgentFor(options.resources),
      ...(options.url === undefined ? {} : { url: options.url }),
      ...(options.referrer === undefined ? {} : { referrer: options.referrer }),
      ...(options.beforeParse === undefined ? {} : { beforeParse: options.beforeParse }),
      readCookie: (url) => this.cookieJar.getCookieStringSync(url, { http: false }),
      writeCookie: (value, url) => {
        this.cookieJar.setCookieSync(value, url, { http: false, ignoreError: true });
      },
      ...(mode === undefined ? {} : { runScripts: mode }),
      includeNodeLocations: this.#includeNodeLocations,
      emitConsole: (method, args) => this.virtualConsole.emit(method, ...args),
      pretendToBeVisual: Boolean(options.pretendToBeVisual),
      ...(options.storageQuota === undefined ? {} : { storageQuota: Number(options.storageQuota) }),
      reportInvalidImport: (url, base, cause) => {
        const error = new Error(
          `Could not parse CSS @import URL "${url}" relative to base URL "${base}"`,
          { cause },
        );
        this.virtualConsole.emit(
          "jsdomError",
          Object.assign(error, { type: "resource-loading", url }),
        );
      },
      reportUnsupported: (description) => {
        const error = new Error(`Not implemented: ${description}`);
        this.virtualConsole.emit("jsdomError", Object.assign(error, { type: "not-implemented" }));
      },
      reportScriptError: (cause) => {
        const value = typeof cause === "object" && cause !== null ? cause : {};
        const summary =
          "name" in value &&
          typeof value.name === "string" &&
          "message" in value &&
          typeof value.message === "string" &&
          "stack" in value
            ? `[${value.name}: ${value.message}]`
            : inspect(cause);
        const error = new Error(`Uncaught ${summary}`, { cause });
        this.virtualConsole.emit(
          "jsdomError",
          Object.assign(error, { type: "unhandled-exception" }),
        );
      },
    });
  }

  /** Returns the cookie store used by this document and its initial request. */
  get cookieJar(): BaseCookieJar {
    return (this.#cookieJar ??= new CookieJar());
  }

  /** Receives browser diagnostics. The default forwards to the host console. */
  get virtualConsole(): VirtualConsole {
    return (this.#virtualConsole ??= new VirtualConsole().forwardTo(console));
  }

  /** Exposes the isolated VM context when script execution was explicitly enabled. */
  getInternalVMContext(): Context {
    const context = this.#realm.context;
    if (!context)
      throw new TypeError(
        "This jsdom was not configured to allow script running. Use the runScripts option during creation.",
      );
    return context;
  }

  get window(): ReturnType<typeof createWindow>["window"] {
    return this.#realm.window;
  }
  /** Updates the browsing context's top reference or canonical document URL. */
  reconfigure(settings: { url?: string | undefined; windowTop?: unknown }): void {
    this.#realm.reconfigure(settings);
  }

  /** Returns the original parser location, null for implied nodes, or undefined for new nodes. */
  nodeLocation(node: unknown): ReturnType<ReturnType<typeof createWindow>["nodeLocation"]> {
    if (!this.#includeNodeLocations) {
      throw new Error(
        "Location information was not saved for this jsdom. Use includeNodeLocations during creation.",
      );
    }
    return this.#realm.nodeLocation(node);
  }

  /** Serializes the current HTML document, including its doctype when present. */
  serialize(): string {
    return this.#realm.serialize();
  }
}
