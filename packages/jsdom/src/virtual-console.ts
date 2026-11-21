// Routes messages from the emulated browser to listeners and a host console.
import { EventEmitter } from "node:events";

type ForwardOptions = { jsdomErrors?: "none" | readonly string[] };
type BrowserError = Error & { type: string; cause?: unknown; detail?: unknown };
type ConsoleTarget = { error: (...args: unknown[]) => void };

/** Event sink for browser console messages and errors reported by the DOM environment. */
export class VirtualConsole extends EventEmitter {
  constructor() {
    super();
    this.on("error", () => {});
  }

  private forwardMethods(target: ConsoleTarget): void {
    for (const [name, method] of Object.entries(target)) {
      if (typeof method === "function")
        this.on(name, (...args: unknown[]) => Reflect.apply(method, target, args));
    }
  }

  /** Forwards browser console events using the legacy jsdom error arguments used by Jest 27–29. */
  sendTo(target: ConsoleTarget, options: { omitJSDOMErrors?: boolean } = {}): this {
    this.forwardMethods(target);
    if (!options.omitJSDOMErrors)
      this.on("jsdomError", (error: BrowserError) =>
        target.error(error.stack, error.detail ?? error.cause),
      );
    return this;
  }

  /** Forwards browser console events and selected jsdom errors to a console-like object. */
  forwardTo(target: ConsoleTarget, options: ForwardOptions = {}): this {
    this.forwardMethods(target);
    const { jsdomErrors } = options;
    if (jsdomErrors === "none") return this;
    if (jsdomErrors !== undefined && !Array.isArray(jsdomErrors))
      throw new TypeError("Invalid jsdomErrors option");
    this.on("jsdomError", (error: BrowserError) => {
      if (jsdomErrors !== undefined && !jsdomErrors.includes(error.type)) return;
      const cause = error.cause;
      if (
        error.type === "unhandled-exception" &&
        typeof cause === "object" &&
        cause !== null &&
        "stack" in cause
      ) {
        target.error(cause.stack);
      } else {
        target.error(error.message);
      }
    });
    return this;
  }
}
