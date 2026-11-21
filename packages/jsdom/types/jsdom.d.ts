// Describes the installable Node facade without exposing private DOM or parser implementation types.
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { EventEmitter } from "node:events";
import type { Context } from "node:vm";
import type { CookieJar as BaseCookieJar, CreateCookieJarOptions, Store } from "tough-cookie";
import type { Dispatcher } from "undici";
import type { WindowBindingNames } from "./window-bindings.mjs";
export * as toughCookie from "tough-cookie";

type WindowReferences = "window" | "self" | "top" | "parent" | "frames" | "globalThis";
type StandardBindings = Pick<
  typeof globalThis,
  Exclude<Extract<WindowBindingNames, keyof typeof globalThis>, keyof Window>
>;
/** Window-local DOM interfaces with standard browser method and element typings.
 * Standard DOM declarations describe the facade's browser API convention; they do not establish full browser conformance.
 */
export type DOMWindow = Omit<Window, WindowReferences> &
  StandardBindings & {
    readonly window: DOMWindow;
    readonly self: DOMWindow;
    readonly globalThis: DOMWindow;
    readonly top: DOMWindow | null;
    readonly parent: DOMWindow;
    readonly frames: DOMWindow;
  };

/** Construction and resource options accepted by the synchronous Node facade. */
export interface ConstructorOptions {
  includeNodeLocations?: boolean;
  url?: string;
  referrer?: string;
  runScripts?: "outside-only" | "dangerously" | undefined;
  beforeParse?: (window: DOMWindow) => void;
  virtualConsole?: VirtualConsole;
  pretendToBeVisual?: boolean;
  storageQuota?: number;
  contentType?: string;
  cookieJar?: BaseCookieJar;
  resources?:
    | "usable"
    | {
        dispatcher?: Dispatcher;
        interceptors?: Dispatcher.DispatcherComposeInterceptor[];
        userAgent?: string;
      };
}
/** Source offsets are UTF-16 offsets in the original input; generated nodes have no location. */
export interface SourceLocation {
  startLine: number;
  startCol: number;
  startOffset: number;
  endLine: number;
  endCol: number;
  endOffset: number;
  attrs?: Record<string, SourceLocation>;
  startTag?: SourceLocation;
  endTag?: SourceLocation;
}
/** Isolated synchronous document construction, with explicit opt-in to script execution.
 * @example new JSDOM("<p>Hello</p>").window.document.querySelector("p")?.textContent
 */
export class JSDOM {
  constructor(input?: unknown, options?: ConstructorOptions);
  static fragment(input?: unknown): DocumentFragment;
  static fromFile(filename: string, options?: ConstructorOptions): Promise<JSDOM>;
  static fromURL(
    url: string,
    options?: Omit<ConstructorOptions, "url" | "contentType">,
  ): Promise<JSDOM>;
  readonly window: DOMWindow;
  readonly cookieJar: BaseCookieJar;
  readonly virtualConsole: VirtualConsole;
  getInternalVMContext(): Context;
  reconfigure(settings: { url?: string | undefined; windowTop?: unknown }): void;
  nodeLocation(node: Node): SourceLocation | null | undefined;
  serialize(): string;
}
/** Browser console event sink; forwarding is opt-in. */
export class VirtualConsole extends EventEmitter {
  constructor();
  forwardTo(
    target: { error: (...args: unknown[]) => void },
    options?: { jsdomErrors?: "none" | readonly string[] },
  ): this;
}
/** Shared cookie storage with loose parsing enabled by default. */
export class CookieJar extends BaseCookieJar {
  constructor(store?: Store, options?: CreateCookieJarOptions);
}
/** Returning undefined passes a request to the next dispatcher; a Response intercepts it. */
export function requestInterceptor(
  callback: (
    request: Request,
    context: { element: Element | null },
  ) => Response | undefined | Promise<Response | undefined>,
): Dispatcher.DispatcherComposeInterceptor;
