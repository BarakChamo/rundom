// Bridges an asynchronous Fetch-style interceptor to Undici's streaming dispatcher.
import { Readable } from "node:stream";
import type { Dispatcher } from "undici";

type Callback = (
  request: Request,
  context: { element: object | null },
) => Response | undefined | Promise<Response | undefined>;

function asHeaders(input: Dispatcher.DispatchOptions["headers"]): Headers {
  const headers = new Headers();
  if (!input) return headers;
  if (Array.isArray(input)) {
    for (let index = 0; index < input.length; index += 2) {
      const name = input[index];
      const value = input[index + 1];
      if (name !== undefined && value !== undefined) headers.append(name, value);
    }
    return headers;
  }
  const pairs = Symbol.iterator in input ? input : Object.entries(input);
  for (const [name, value] of pairs) {
    if (Array.isArray(value)) for (const member of value) headers.append(name, member);
    else if (value !== undefined) headers.append(name, String(value));
  }
  return headers;
}

function outgoingHeaders(headers: Headers): Record<string, string | string[]> {
  const output: Record<string, string | string[]> = Object.fromEntries(headers);
  const cookies = headers.getSetCookie();
  if (cookies.length) output["set-cookie"] = cookies;
  return output;
}

/** Intercepts a request before transport. Returning undefined passes it to the next dispatcher. */
export function requestInterceptor(callback: Callback): Dispatcher.DispatcherComposeInterceptor {
  if (typeof callback !== "function")
    throw new TypeError("Expected a request interceptor callback");
  return (dispatch) => (options, handler) => {
    const abort = new AbortController();
    const { signal } = abort;
    let active: Dispatcher.DispatchController | undefined;
    let stream: Readable | undefined;
    let finished = false;
    let paused = false;
    let reason: Error | null = null;

    const controller: Dispatcher.DispatchController = {
      get aborted() {
        return signal.aborted;
      },
      get paused() {
        return paused;
      },
      get reason() {
        return reason;
      },
      get rawHeaders() {
        return active?.rawHeaders ?? null;
      },
      get rawTrailers() {
        return active?.rawTrailers ?? null;
      },
      abort(error) {
        if (finished || signal.aborted) return;
        reason = error ?? new DOMException("The request was aborted", "AbortError");
        abort.abort(reason);
        if (active) active.abort(reason);
        stream?.destroy();
        fail(reason);
      },
      pause() {
        paused = true;
        active?.pause();
        stream?.pause();
      },
      resume() {
        paused = false;
        active?.resume();
        stream?.resume();
      },
    };

    function fail(cause: unknown): void {
      if (finished) return;
      finished = true;
      const error = cause instanceof Error ? cause : new Error(String(cause), { cause });
      handler.onResponseError?.(controller, error);
    }

    function end(trailers: Record<string, string | string[] | undefined>): void {
      if (finished) return;
      finished = true;
      handler.onResponseEnd?.(controller, trailers);
    }

    function passThrough(request: typeof options): void {
      dispatch(request, {
        onRequestStart(next) {
          active = next;
          if (reason) next.abort(reason);
          else if (paused) next.pause();
        },
        onRequestUpgrade(_next, status, headers, socket) {
          if (finished) return;
          finished = true;
          handler.onRequestUpgrade?.(controller, status, headers, socket);
        },
        onResponseStart(_next, status, headers, message) {
          if (!finished) handler.onResponseStart?.(controller, status, headers, message);
        },
        onResponseData(_next, chunk) {
          if (!finished) handler.onResponseData?.(controller, chunk);
        },
        onResponseEnd(_next, trailers) {
          end(trailers);
        },
        onResponseError(_next, error) {
          fail(error);
        },
      });
    }

    async function intercept(): Promise<void> {
      handler.onRequestStart?.(controller, {});
      if (signal.aborted) return;
      const opaque = "opaque" in options ? options.opaque : undefined;
      const metadata = typeof opaque === "object" && opaque !== null ? opaque : {};
      const url =
        "url" in metadata && typeof metadata.url === "string"
          ? metadata.url
          : new URL(options.path, options.origin).href;
      const element =
        "element" in metadata && typeof metadata.element === "object" ? metadata.element : null;
      const headers = asHeaders(options.headers);
      const body = options.body;
      const init: RequestInit & { duplex?: "half" } = {
        method: options.method,
        headers,
        signal,
        ...(headers.has("referer") ? { referrer: headers.get("referer") ?? "" } : {}),
      };
      let forwardedBody: ReadableStream<Uint8Array> | undefined;
      if (body !== undefined && body !== null) {
        if (typeof body === "string") init.body = body;
        else if (body instanceof Uint8Array) init.body = Uint8Array.from(body);
        else if (body instanceof Readable) {
          const [inspection, forwarding] = Readable.toWeb(body, {
            strategy: { highWaterMark: 0 },
          }).tee();
          init.body = inspection;
          forwardedBody = forwarding;
        } else throw new TypeError("Unsupported interceptor request body");
        init.duplex = "half";
      }
      const request = new Request(url, init);
      let response: Response | undefined;
      let forwarded = false;
      try {
        response = await callback(request, { element });
        if (signal.aborted) {
          await response?.body?.cancel(reason);
          return;
        }
        if (response === undefined) {
          const outgoing = forwardedBody
            ? { ...options, body: Readable.fromWeb(forwardedBody, { signal }) }
            : options;
          forwarded = true;
          passThrough(outgoing);
          return;
        }
      } finally {
        if (forwardedBody) {
          if (request.body && !request.body.locked) void request.body.cancel().catch(() => {});
          if (!forwarded) void forwardedBody.cancel().catch(() => {});
        }
      }
      if (!(response instanceof Response))
        throw new TypeError("requestInterceptor callback must return undefined or a Response");

      try {
        handler.onResponseStart?.(
          controller,
          response.status,
          outgoingHeaders(response.headers),
          response.statusText,
        );
      } catch (error) {
        fail(error);
        // The consumer already received the error. Release the body without reading it.
        if (response.body) void response.body.cancel(error).catch(() => {});
        return;
      }
      if (signal.aborted) {
        if (response.body) await response.body.cancel(reason);
        return;
      }
      if (!response.body) {
        end({});
        return;
      }
      stream = Readable.fromWeb(response.body);
      stream.on("error", fail);
      stream.on("end", () => end({}));
      stream.on("data", (chunk: Uint8Array) => {
        if (finished) return;
        try {
          handler.onResponseData?.(controller, Buffer.from(chunk));
        } catch (error) {
          fail(error);
          stream?.destroy(
            error instanceof Error ? error : new Error(String(error), { cause: error }),
          );
        }
      });
      if (signal.aborted) stream.destroy();
      else if (paused) stream.pause();
    }

    void intercept().catch(fail);
    return true;
  };
}
