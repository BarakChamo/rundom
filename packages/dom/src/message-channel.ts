// Connects Window-local message ports to Node's queued structured-clone transport.
import { types } from "node:util";
import {
  markAsUncloneable,
  MessageChannel as NativeChannel,
  type MessagePort as NativePort,
} from "node:worker_threads";
import type { createEventHandlers } from "./event-handlers.js";
import type { createEvents } from "./events.js";

type Transfer = Iterable<ArrayBuffer>;
type PostOptions = Transfer | { transfer?: Transfer } | null;

const cloneIntrinsics = [
  Object,
  Array,
  Map,
  Set,
  Date,
  RegExp,
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
  AggregateError,
  Boolean,
  Number,
  String,
  ArrayBuffer,
  SharedArrayBuffer,
  DataView,
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float16Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
];

function receivingPrototypes(global: object): Map<object, object> {
  const prototypes = new Map<object, object>();
  for (const constructor of cloneIntrinsics) {
    const receiver: unknown = Reflect.get(global, constructor.name);
    if (typeof receiver !== "function") continue;
    const prototype: unknown = Reflect.get(receiver, "prototype");
    if (typeof prototype === "object" && prototype !== null)
      prototypes.set(constructor.prototype, prototype);
  }
  return prototypes;
}

function rehomeClone(data: unknown, prototypes: Map<object, object>): unknown {
  if (typeof data !== "object" || data === null) return data;
  const pending: unknown[] = [data];
  const visited = new WeakSet<object>();
  // Node has already cloned the graph. Visit each cloned object at most once.
  while (pending.length) {
    const value = pending.pop();
    if (typeof value !== "object" || value === null || visited.has(value)) continue;
    visited.add(value);
    const prototype: object | null = Object.getPrototypeOf(value);
    const receivingPrototype = prototype && prototypes.get(prototype);
    if (!receivingPrototype) continue;
    if (types.isMap(value)) {
      for (const [key, item] of value) pending.push(key, item);
    } else if (types.isSet(value)) {
      for (const item of value) pending.push(item);
    } else if (ArrayBuffer.isView(value)) {
      pending.push(value.buffer);
    } else if (Array.isArray(value) || prototype === Object.prototype) {
      for (const item of Object.values(value)) pending.push(item);
    } else if (types.isNativeError(value)) {
      pending.push(Object.getOwnPropertyDescriptor(value, "cause")?.value);
      pending.push(Object.getOwnPropertyDescriptor(value, "errors")?.value);
    }
    Object.setPrototypeOf(value, receivingPrototype);
  }
  return data;
}

/** Creates message channels whose deliveries use the Window's EventTarget and MessageEvent. */
export function createMessageChannels(input: {
  events: ReturnType<typeof createEvents>;
  handlers: ReturnType<typeof createEventHandlers>;
  DOMException: typeof globalThis.DOMException;
  TypeError: TypeErrorConstructor;
  isClosed: () => boolean;
  realm?: object;
}) {
  const { events, handlers, DOMException } = input;
  type Handler = Parameters<typeof handlers.set>[2];
  const active = new Set<NativePort>();
  const key = Symbol();
  const prototypes = input.realm ? receivingPrototypes(input.realm) : undefined;

  function transferList(options?: PostOptions): ArrayBuffer[] {
    if (options == null) return [];
    if (typeof options !== "object" && typeof options !== "function")
      throw new input.TypeError("Expected a transfer list or options dictionary");
    const iterable =
      Symbol.iterator in options ? options : "transfer" in options ? options.transfer : undefined;
    const list = iterable === undefined ? [] : Array.from(iterable);
    if (list.some((item) => !types.isArrayBuffer(item)))
      throw new DOMException("Only ArrayBuffer transfers are supported", "DataCloneError");
    return list;
  }

  class MessagePort extends events.EventTarget {
    readonly #native: NativePort;
    #started = false;
    #closed = false;

    constructor(token: symbol, native: NativePort) {
      super();
      if (token !== key) throw new input.TypeError("Illegal constructor");
      markAsUncloneable(this);
      this.#native = native;
      native.once("close", () => active.delete(native));
      native.unref();
      if (input.isClosed()) this.close();
      else active.add(native);
    }

    postMessage(message: unknown, options?: PostOptions): void {
      if (!arguments.length) throw new input.TypeError("A message is required");
      const transfer = transferList(options);
      try {
        this.#native.postMessage(message, transfer);
      } catch (error) {
        if (!(error instanceof globalThis.DOMException) || error.name !== "DataCloneError")
          throw error;
        throw new DOMException(error.message, "DataCloneError");
      }
    }

    start(): void {
      if (this.#started || this.#closed || input.isClosed()) return;
      this.#started = true;
      this.#native.on("message", (data: unknown) => {
        if (!this.#closed && !input.isClosed()) {
          this.dispatchEvent(
            events.createPostedMessage(prototypes ? rehomeClone(data, prototypes) : data),
          );
        }
      });
      this.#native.on("messageerror", () => {
        if (!this.#closed && !input.isClosed()) {
          this.dispatchEvent(events.trusted(new events.MessageEvent("messageerror")));
        }
      });
      this.#native.unref();
    }

    close(): void {
      if (this.#closed) return;
      this.#closed = true;
      active.delete(this.#native);
      this.#native.close();
    }

    get onmessage(): Handler {
      return handlers.get(this, "message");
    }
    set onmessage(handler: Handler) {
      handlers.set(this, "message", handler);
      this.start();
    }
    get onmessageerror(): Handler {
      return handlers.get(this, "messageerror");
    }
    set onmessageerror(handler: Handler) {
      handlers.set(this, "messageerror", handler);
    }
    get [Symbol.toStringTag](): string {
      return "MessagePort";
    }
  }

  class MessageChannel {
    readonly #ports: readonly [MessagePort, MessagePort];

    constructor() {
      const channel = new NativeChannel();
      this.#ports = [new MessagePort(key, channel.port1), new MessagePort(key, channel.port2)];
    }

    get port1(): MessagePort {
      return this.#ports[0];
    }
    get port2(): MessagePort {
      return this.#ports[1];
    }
    get [Symbol.toStringTag](): string {
      return "MessageChannel";
    }
  }

  return {
    MessageChannel,
    MessagePort,
    close(): void {
      for (const port of active) port.close();
      active.clear();
    },
  };
}
