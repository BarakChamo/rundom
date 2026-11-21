// Loads the initial document and applies cookies on every redirect hop.
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { createRequire } from "node:module";
import type { Dispatcher } from "undici";
import type { CookieJar } from "tough-cookie";

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const maxRedirects = 20;
const standardHeaderNames: Readonly<Record<string, string>> = {
  accept: "Accept",
  "accept-language": "Accept-Language",
  "user-agent": "User-Agent",
  "content-type": "Content-Type",
  authorization: "Authorization",
};

const require = createRequire(import.meta.url);
export type TransportOptions = {
  dispatcher?: Dispatcher;
  interceptors?: Dispatcher.DispatcherComposeInterceptor[];
};

type XHRRequest = {
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
  onHeaders: (response: ResponseMetadata) => void;
  onChunk: (chunk: Uint8Array) => void;
};

type ResponseMetadata = {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
};

type ResourceResponse = {
  bodyDecoded?: boolean;
  statusText: string;
  headers: Record<string, string>;

  status: number;
  cookies: string[];
  location: string | undefined;
  contentType: string | undefined;
  drain: () => Promise<void>;
  cancel: () => void;
  read: (onChunk?: (chunk: Uint8Array) => void) => Promise<ArrayBuffer>;
  stream?: () => ReadableStream<Uint8Array> | null;
};

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// The transport controller belongs to one hop. Expose a controller whose abort also cancels
// subsequent hops, including an abort triggered by an interceptor after a cached hop completes.
const shareRedirectAbort: Dispatcher.DispatcherComposeInterceptor =
  (dispatch) => (options, handler) => {
    const metadata = "opaque" in options ? options.opaque : undefined;
    if (
      typeof metadata !== "object" ||
      metadata === null ||
      !("lifetime" in metadata) ||
      !(metadata.lifetime instanceof AbortController)
    )
      return dispatch(options, handler);
    const { lifetime } = metadata;
    return dispatch(
      options,
      new Proxy(handler, {
        get(target, key): unknown {
          if (key === "onRequestStart") {
            return (controller: Dispatcher.DispatchController, context: unknown) => {
              const shared = new Proxy(controller, {
                get(hop, property): unknown {
                  if (property === "abort") {
                    return (reason: Error) => {
                      if (!lifetime.signal.aborted) lifetime.abort(reason);
                      if (!hop.aborted) hop.abort(lifetime.signal.reason);
                    };
                  }
                  if (property === "aborted") return lifetime.signal.aborted || hop.aborted;
                  if (property === "reason")
                    return lifetime.signal.aborted ? lifetime.signal.reason : hop.reason;
                  const value: unknown = Reflect.get(hop, property, hop);
                  return typeof value === "function" ? value.bind(hop) : value;
                },
              });
              target.onRequestStart?.(shared, context);
              const signal =
                "signal" in metadata && metadata.signal instanceof AbortSignal
                  ? metadata.signal
                  : lifetime.signal;
              if (signal.aborted) controller.abort(signal.reason);
            };
          }
          const value: unknown = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
    );
  };

// User interceptors can decorate a handler with object spread. Undici's request handler
// keeps its callbacks on the prototype, so expose own callbacks at that boundary.
const exposeCallbacks: Dispatcher.DispatcherComposeInterceptor =
  (dispatch) => (options, handler) => {
    return dispatch(options, {
      onRequestStart: (...args) => handler.onRequestStart?.(...args),
      onRequestUpgrade: (...args) => handler.onRequestUpgrade?.(...args),
      onResponseStart: (...args) => handler.onResponseStart?.(...args),
      onResponseData: (...args) => handler.onResponseData?.(...args),
      onResponseEnd: (...args) => handler.onResponseEnd?.(...args),
      onResponseError: (...args) => handler.onResponseError?.(...args),
      onResponseStarted: () => handler.onResponseStarted?.(),
      onBodySent: (...args) => handler.onBodySent?.(...args),
      onRequestSent: () => handler.onRequestSent?.(),
    });
  };

function withResponseHeaders(
  handler: Dispatcher.DispatchHandler,
  onResponseStart: NonNullable<Dispatcher.DispatchHandler["onResponseStart"]>,
): Dispatcher.DispatchHandler {
  return new Proxy(handler, {
    get(target, key) {
      if (key === "onResponseStart") return onResponseStart;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// Undici correctly decodes streaming bodies but removes coding/length headers.
// Browser resource consumers expose the wire metadata, independently of decoded bytes.
function preserveCompressionHeaders(
  decompress: Dispatcher.DispatcherComposeInterceptor,
): Dispatcher.DispatcherComposeInterceptor {
  return (dispatch) => (options, handler) => {
    let compression: Record<string, string | string[] | undefined> = {};
    let originalRawHeaders: Dispatcher.DispatchController["rawHeaders"];
    const decoded = decompress((request, decodingHandler) =>
      dispatch(
        request,
        withResponseHeaders(decodingHandler, (controller, status, headers, message) => {
          compression = {};
          for (const name of ["content-encoding", "content-length"])
            if (headers[name] !== undefined) compression[name] = headers[name];
          originalRawHeaders = Array.isArray(controller.rawHeaders)
            ? controller.rawHeaders.slice()
            : controller.rawHeaders;
          decodingHandler.onResponseStart?.(controller, status, headers, message);
        }),
      ),
    );
    return decoded(
      options,
      withResponseHeaders(handler, (controller, status, headers, message) => {
        if (originalRawHeaders !== undefined) controller.rawHeaders = originalRawHeaders;
        const metadata: unknown = "opaque" in options ? options.opaque : undefined;
        if (
          compression["content-encoding"] !== undefined &&
          headers["content-encoding"] === undefined &&
          typeof metadata === "object" &&
          metadata !== null &&
          "onDecoded" in metadata &&
          typeof metadata.onDecoded === "function"
        )
          metadata.onDecoded();
        handler.onResponseStart?.(controller, status, { ...headers, ...compression }, message);
      }),
    );
  };
}

function requestTransport(options: TransportOptions, lifetime: AbortController) {
  let dispatcher: ReturnType<Dispatcher["compose"]> | undefined;
  return async (
    url: URL,
    headers: Record<string, string>,
    element: object | null,
    signal?: AbortSignal,
    method = "GET",
    body?: string | Uint8Array | ReadableStream<Uint8Array>,
  ): Promise<ResourceResponse> => {
    if (url.protocol === "file:") {
      return {
        status: 200,
        statusText: "OK",
        headers: {},
        cookies: [],
        location: undefined,
        contentType: undefined,
        drain: async () => {},
        cancel: () => {},
        read: async () =>
          Uint8Array.from(await readFile(url, signal ? { signal } : undefined)).buffer,
      };
    }
    if (url.protocol === "data:") {
      const response = await fetch(url, { method, ...(signal ? { signal } : {}) });
      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers),
        cookies: [],
        location: undefined,
        contentType: response.headers.get("content-type") ?? undefined,
        drain: async () => {
          await response.body?.cancel();
        },
        cancel: () => {
          void response.body?.cancel();
        },
        read: () => response.arrayBuffer(),
        stream: () => response.body,
      };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new TypeError(`Unsupported resource URL scheme: ${url.protocol}`);

    if (!dispatcher) {
      const { getGlobalDispatcher, interceptors }: typeof import("undici") = require("undici");
      dispatcher = (options.dispatcher ?? getGlobalDispatcher()).compose([
        shareRedirectAbort,
        preserveCompressionHeaders(interceptors.decompress()),
        ...(options.interceptors ?? []).toReversed(),
        exposeCallbacks,
      ]);
    }
    let bodyDecoded = false;
    const response = await dispatcher.request({
      origin: url.origin,
      path: url.pathname + url.search,
      method,
      ...(body === undefined
        ? {}
        : {
            body: body instanceof ReadableStream ? Readable.fromWeb(body, { signal }) : body,
          }),
      headers: { ...headers, "accept-encoding": "gzip, deflate, br" },
      opaque: {
        url: url.href,
        element,
        lifetime,
        signal,
        onDecoded() {
          bodyDecoded = true;
        },
      },
      ...(signal ? { signal } : {}),
    });
    const cancel = () => {
      // Undici emits an AbortError when an unread body is destroyed.
      response.body.once("error", () => {});
      response.body.destroy();
    };
    if (signal?.aborted) {
      cancel();
      signal.throwIfAborted();
    }
    const cookies = response.headers["set-cookie"];
    const headersOut: Record<string, string> = Object.create(null);
    for (const [name, value] of Object.entries(response.headers)) {
      if (name === "set-cookie" || name === "set-cookie2" || value === undefined) continue;
      headersOut[name] = Array.isArray(value) ? value.join(", ") : value;
    }
    return {
      bodyDecoded,
      status: response.statusCode,
      statusText: response.statusText,
      headers: headersOut,
      cookies: typeof cookies === "string" ? [cookies] : (cookies ?? []),
      location: firstHeader(response.headers.location),
      contentType: firstHeader(response.headers["content-type"]),
      drain: () => response.body.dump(),
      cancel,
      stream: () => Readable.toWeb(response.body, { strategy: { highWaterMark: 0 } }),
      read: async (onChunk) => {
        if (!onChunk) return response.body.arrayBuffer();
        const chunks: Uint8Array[] = [];
        let size = 0;
        // Undici's stream ends with the HTTP body, an error, or request cancellation.
        for await (const chunk of response.body) {
          if (!(chunk instanceof Uint8Array)) throw new TypeError("Expected a byte response chunk");
          chunks.push(chunk);
          size += chunk.byteLength;
          onChunk(chunk);
          signal?.throwIfAborted();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return bytes.buffer;
      },
    };
  };
}

const simpleMethods = new Set(["GET", "HEAD", "POST"]);
const simpleHeaderNames = new Set([
  "accept",
  "accept-language",
  "content-language",
  "content-type",
]);
const simpleContentTypes = new Set([
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
]);
const simpleResponseHeaders = new Set([
  "cache-control",
  "content-language",
  "content-length",
  "content-type",
  "expires",
  "last-modified",
  "pragma",
]);

function hasUnsafeHeaderByte(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code < 32 && code !== 9) || code === 127 || '"():<>?@[]{}'.includes(character))
      return true;
  }
  return false;
}

function unsafeHeaderNames(headers: Record<string, string>): string[] {
  return Object.entries(headers)
    .filter(([name, value]) => {
      if (!simpleHeaderNames.has(name) || Buffer.byteLength(value) > 128) return true;
      if (name === "content-type") {
        return (
          !simpleContentTypes.has(value.split(";", 1)[0]?.trim().toLowerCase() ?? "") ||
          hasUnsafeHeaderByte(value)
        );
      }
      if (name === "accept") return hasUnsafeHeaderByte(value);
      return !/^[0-9A-Za-z *,;=.-]*$/.test(value);
    })
    .map(([name]) => name)
    .sort();
}

function allowedCORS(
  headers: Record<string, string>,
  xhr: Pick<XHRRequest, "origin" | "credentials">,
): boolean {
  const origin = headers["access-control-allow-origin"];
  if (origin === "*" && !xhr.credentials) return true;
  return (
    origin === xhr.origin &&
    (!xhr.credentials || headers["access-control-allow-credentials"] === "true")
  );
}

function visibleCORSHeaders(
  headers: Record<string, string>,
  credentials: boolean,
): Record<string, string> {
  const exposed = new Set(
    headers["access-control-expose-headers"]
      ?.toLowerCase()
      .split(",")
      .map((name) => name.trim()),
  );
  if (exposed.has("*") && !credentials) return headers;
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => simpleResponseHeaders.has(name) || exposed.has(name),
    ),
  );
}

async function preflight(input: {
  request: ReturnType<typeof requestTransport>;
  url: URL;
  xhr: Pick<XHRRequest, "origin" | "credentials">;
  method: string;
  names: string[];
  userAgent: string;
  signal: AbortSignal;
}): Promise<void> {
  const { xhr, method, names, request, url, signal } = input;
  const headers: Record<string, string> = {
    Origin: xhr.origin,
    "User-Agent": input.userAgent,
    "Access-Control-Request-Method": method,
  };
  if (names.length) headers["Access-Control-Request-Headers"] = names.join(",");
  const response = await request(url, headers, null, signal, "OPTIONS");
  const methods = new Set(
    response.headers["access-control-allow-methods"]?.split(",").map((value) => value.trim()),
  );
  const allowedHeaders = new Set(
    response.headers["access-control-allow-headers"]
      ?.toLowerCase()
      .split(",")
      .map((value) => value.trim()),
  );
  const methodAllowed =
    methods.has(method) || simpleMethods.has(method) || (!xhr.credentials && methods.has("*"));
  const headersAllowed = names.every(
    (name) =>
      allowedHeaders.has(name) ||
      (!xhr.credentials && name !== "authorization" && allowedHeaders.has("*")),
  );
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !allowedCORS(response.headers, xhr) ||
    !methodAllowed ||
    !headersAllowed
  ) {
    response.cancel();
    throw new TypeError("Cross-origin preflight did not grant access");
  }
  await response.drain();
}

/** Fetches a resource while preserving HTTP status and final URL semantics. */
export async function fetchResource(input: {
  url: string;
  referrer?: string;
  cookieJar: CookieJar;
  userAgent: string;
  transport?: TransportOptions;
  element?: object;
  allowErrorStatus?: boolean;
  onHTTPErrorResponse?: () => void;
  signal?: AbortSignal;
  xhr?: XHRRequest;
  onCookie?: (value: string, url: string) => void;
}): Promise<{
  bytes: ArrayBuffer;
  url: string;
  contentType?: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  stream?: ReadableStream<Uint8Array> | null;
  redirected?: boolean;
  responseType?: "basic" | "cors" | "opaque" | "opaqueredirect";
  bodyDecoded?: boolean;
}> {
  let url = new URL(input.url);
  const referringURL = input.referrer ?? input.xhr?.referrer;
  const referrer = referringURL === undefined ? undefined : new URL(referringURL).href;
  const lifetime = new AbortController();
  const signal = input.signal ? AbortSignal.any([input.signal, lifetime.signal]) : lifetime.signal;
  const request = requestTransport(input.transport ?? {}, lifetime);
  const { xhr } = input;
  const policy = xhr?.fetchPolicy;
  let corsTainted = false;
  let effectiveOrigin = xhr?.origin;
  let authentication = xhr?.authentication;
  let opaqueTainted = false;
  if (xhr && url.protocol === "file:" && (policy || xhr.origin !== "null"))
    throw new TypeError("A network document cannot request a file URL");
  let method = xhr?.method ?? "GET";
  let body = xhr?.body;
  let xhrHeaders = xhr?.headers ?? {};
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const crossOrigin =
      xhr !== undefined &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin !== xhr.origin;
    if (crossOrigin && policy?.mode === "same-origin") {
      throw new TypeError("Request mode requires the document's origin");
    }
    if (policy?.mode === "no-cors") {
      opaqueTainted ||= crossOrigin;
      for (const name of unsafeHeaderNames(xhrHeaders)) {
        const { [name]: _discarded, ...allowed } = xhrHeaders;
        xhrHeaders = allowed;
      }
    }
    const requiresCORS =
      xhr !== undefined && (crossOrigin || corsTainted) && policy?.mode !== "no-cors";
    const corsRequest = {
      origin: effectiveOrigin ?? "null",
      credentials: xhr?.credentials ?? false,
    };
    if (requiresCORS) {
      corsTainted = true;
      const names = unsafeHeaderNames(xhrHeaders);
      if (
        names.length ||
        !simpleMethods.has(method) ||
        xhr.uploadListener ||
        body instanceof ReadableStream
      )
        await preflight({
          request,
          url,
          xhr: corsRequest,
          method,
          names,
          userAgent: input.userAgent,
          signal,
        });
    }
    const useCookies =
      policy?.credentials !== "omit" &&
      ((!crossOrigin && !corsTainted) || Boolean(xhr?.credentials));
    const canonicalHeaders: Record<string, string> = {
      accept:
        input.element || xhr
          ? "*/*"
          : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en",
      "user-agent": input.userAgent,
      ...xhrHeaders,
    };
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(canonicalHeaders)) {
      const spelling = xhr?.headerNames?.[name] ?? standardHeaderNames[name] ?? name;
      headers[spelling] = value;
    }
    if (
      xhr &&
      (crossOrigin || corsTainted || effectiveOrigin === "null") &&
      (policy?.mode !== "no-cors" || !["GET", "HEAD"].includes(method))
    ) {
      headers["Origin"] = corsRequest.origin;
    }
    if (referrer) headers["Referer"] = referrer;
    signal.throwIfAborted();
    let cookies = "";
    if (useCookies) {
      const jar = input.cookieJar;
      cookies = jar.store.synchronous
        ? jar.getCookieStringSync(url.href)
        : await jar.getCookieString(url.href);
    }
    signal.throwIfAborted();
    if (cookies) headers["Cookie"] = cookies;

    let response = await request(url, headers, input.element ?? null, signal, method, body);
    if (
      response.status === 401 &&
      !corsTainted &&
      authentication &&
      useCookies &&
      /^\s*Basic(?:\s|$)/i.test(response.headers["www-authenticate"] ?? "")
    ) {
      // The first response is an HTTP authentication challenge, not an exposed XHR response.
      // A replay is bounded to one attempt and cannot consume a streaming request twice.
      if (body instanceof ReadableStream) {
        response.cancel();
        throw new TypeError("Cannot replay a streaming authentication request");
      }
      await response.drain();
      signal.throwIfAborted();
      const authorization =
        "Basic " +
        Buffer.from(`${authentication.username}:${authentication.password}`, "utf8").toString(
          "base64",
        );
      xhrHeaders = { ...xhrHeaders, authorization };
      const spelling =
        xhr?.headerNames?.authorization ?? standardHeaderNames.authorization ?? "Authorization";
      response = await request(
        url,
        { ...headers, [spelling]: authorization },
        input.element ?? null,
        signal,
        method,
        body,
      );
    }
    if (requiresCORS && !allowedCORS(response.headers, corsRequest)) {
      response.cancel();
      throw new TypeError("Cross-origin response did not grant access");
    }
    for (const value of useCookies ? response.cookies : []) {
      await input.cookieJar.setCookie(value, url.href, { ignoreError: true });
      input.onCookie?.(value, url.href);
    }
    const { location } = response;
    if (policy?.redirect === "manual" && redirectStatuses.has(response.status)) {
      response.cancel();
      return {
        url: "",
        status: 0,
        statusText: "",
        headers: {},
        bytes: new ArrayBuffer(0),
        responseType: "opaqueredirect",
      };
    }
    if (location !== undefined && redirectStatuses.has(response.status)) {
      if (policy?.redirect === "error") {
        response.cancel();
        throw new TypeError("Request disallows redirects");
      }
      if (response.status !== 303 && body instanceof ReadableStream) {
        response.cancel();
        throw new TypeError("Cannot replay a streaming request body after a redirect");
      }
      await response.drain();
      const next = URL.parse(location, url.href);
      if (!next || (next.protocol !== "http:" && next.protocol !== "https:"))
        throw new TypeError(`Invalid redirect URL: ${location}`);
      if (!location.includes("#")) next.hash = url.hash;
      if (xhr && next.origin !== url.origin) {
        if (url.origin !== xhr.origin) effectiveOrigin = "null";
        authentication = undefined;
        const { authorization: _authorization, ...remaining } = xhrHeaders;
        xhrHeaders = remaining;
      }
      if (
        (response.status === 303 && method !== "GET" && method !== "HEAD") ||
        ((response.status === 301 || response.status === 302) && method === "POST")
      ) {
        method = "GET";
        body = undefined;
        const { "content-type": _contentType, ...remaining } = xhrHeaders;
        xhrHeaders = remaining;
      }
      url = next;
      continue;
    }
    if (!xhr && !input.allowErrorStatus && (response.status < 200 || response.status >= 300)) {
      await response.drain();
      input.onHTTPErrorResponse?.();
      throw new Error(`Resource was not loaded. Status: ${response.status}`);
    }
    if (opaqueTainted) {
      response.cancel();
      return {
        url: "",
        status: 0,
        statusText: "",
        headers: {},
        bytes: new ArrayBuffer(0),
        responseType: "opaque",
      };
    }
    const { contentType } = response;
    const metadata = {
      ...(response.bodyDecoded ? { bodyDecoded: true } : {}),
      url: url.href,
      status: response.status,
      statusText: response.statusText,
      headers:
        xhr && (crossOrigin || corsTainted)
          ? visibleCORSHeaders(response.headers, xhr.credentials)
          : response.headers,
    };
    xhr?.onHeaders(metadata);
    if (signal.aborted) {
      response.cancel();
      signal.throwIfAborted();
    }
    if (policy && response.stream) {
      const empty =
        method === "HEAD" ||
        response.status === 204 ||
        response.status === 205 ||
        response.status === 304;
      if (empty) await response.drain();
      signal.throwIfAborted();
      return {
        ...metadata,
        bytes: new ArrayBuffer(0),
        stream: empty ? null : response.stream(),
        redirected: hop > 0,
        responseType: corsTainted ? "cors" : "basic",
      };
    }
    const bytes = await response.read(xhr?.onChunk);
    signal.throwIfAborted();
    return {
      ...metadata,
      bytes,
      ...(contentType ? { contentType } : {}),
      ...(policy ? { redirected: hop > 0, responseType: corsTainted ? "cors" : "basic" } : {}),
    };
  }
  throw new Error("Too many redirects while loading the document");
}
