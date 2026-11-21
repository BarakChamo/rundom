// Connects Window WebSockets to the configured Undici dispatcher and Window teardown.
import { createRequire } from "node:module";
import type { CookieJar } from "tough-cookie";
import type { TransportOptions } from "./main-resource.js";

const require = createRequire(import.meta.url);

/** Creates a Window-bound WebSocket constructor without loading Undici on the DOM-only path. */
export function createWebSocketClass(input: {
  transport?: TransportOptions;
  cookieJar: () => CookieJar;
  baseURL: () => string;
  origin: () => string;
  signal: AbortSignal;
  DOMException: typeof globalThis.DOMException;
}) {
  const { WebSocket: Socket, getGlobalDispatcher }: typeof import("undici") = require("undici");
  const base = input.transport?.dispatcher ?? getGlobalDispatcher();
  const chain = input.transport?.interceptors?.toReversed();
  const dispatcher = chain?.length ? base.compose(chain) : base;

  return class WebSocket extends Socket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const target = URL.parse(String(url), input.baseURL());
      if (!target || !["ws:", "wss:"].includes(target.protocol) || target.href.includes("#"))
        throw new input.DOMException("Invalid WebSocket URL", "SyntaxError");
      const headers: Record<string, string> = { origin: input.origin() };
      const httpURL = new URL(target.href);
      httpURL.protocol = target.protocol === "wss:" ? "https:" : "http:";
      const jar = input.cookieJar();
      if (jar.store.synchronous) {
        const cookies = jar.getCookieStringSync(httpURL.href);
        if (cookies) headers["cookie"] = cookies;
      }
      super(target, { dispatcher, headers, ...(protocols === undefined ? {} : { protocols }) });
      const stop = () => {
        this.addEventListener("error", () => {}, { once: true });
        this.close();
      };
      if (input.signal.aborted) stop();
      else {
        input.signal.addEventListener("abort", stop, { once: true });
        this.addEventListener("close", () => input.signal.removeEventListener("abort", stop), {
          once: true,
        });
      }
    }
  };
}
