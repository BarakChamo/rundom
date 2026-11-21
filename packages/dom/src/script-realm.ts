// Owns the Node VM boundary and preserves identity between the Window and its global.
import { types } from "node:util";
import { compileFunction, constants, createContext, runInContext, type Context } from "node:vm";

export type ScriptMode = "outside-only" | "dangerously";

type ErrorReporter = (cause: unknown) => void;
const callbackRealms = new WeakMap<object, ErrorReporter>();

/** Reports callback failures through the Window that supplied the callback's intrinsic prototype. */
export function reportCallbackException(
  callback: object,
  cause: unknown,
  fallback: ErrorReporter,
): void {
  for (
    let prototype: object | null = callback;
    prototype && !types.isProxy(prototype);
    prototype = Object.getPrototypeOf(prototype)
  ) {
    const report = callbackRealms.get(prototype);
    if (report) {
      report(cause);
      return;
    }
  }
  fallback(cause);
}

/** Builds a VM global with the supplied Window's own bindings and prototype. */
export function createScriptRealm<Window extends object>(
  window: Window,
  report: ErrorReporter,
): Window & Context {
  const context = createContext(constants.DONT_CONTEXTIFY);
  const intrinsicFunction: FunctionConstructor = Reflect.get(context, "Function");
  callbackRealms.set(intrinsicFunction.prototype, report);
  const intrinsicObject: ObjectConstructor = Reflect.get(context, "Object");
  callbackRealms.set(intrinsicObject.prototype, report);
  Object.setPrototypeOf(context, Object.getPrototypeOf(window));
  return Object.assign(context, window);
}

/** Executes classic script source in its Window with document-relative diagnostic offsets. */
export function evaluateClassicScript(input: {
  context: Context;
  source: string;
  url: string;
  lineOffset: number;
}): unknown {
  return runInContext(input.source, input.context, {
    filename: input.url,
    lineOffset: input.lineOffset,
    displayErrors: false,
  });
}

// These are ECMAScript globals. Node-only capabilities are deliberately outside this set.
const hostGlobalNames = (
  "Object Function Array Number parseFloat parseInt Infinity NaN undefined Boolean String Symbol Date " +
  "Promise RegExp Error AggregateError EvalError RangeError ReferenceError SyntaxError TypeError URIError " +
  "globalThis JSON Math Intl ArrayBuffer Atomics Uint8Array Int8Array Uint16Array Int16Array Uint32Array " +
  "Int32Array BigUint64Array BigInt64Array Uint8ClampedArray Float32Array Float64Array DataView Map BigInt " +
  "Set Iterator WeakMap WeakSet Proxy Reflect FinalizationRegistry WeakRef decodeURI decodeURIComponent " +
  "encodeURI encodeURIComponent escape unescape eval isFinite isNaN SuppressedError DisposableStack " +
  "AsyncDisposableStack Float16Array SharedArrayBuffer WebAssembly"
).split(" ");

let hostGlobals: PropertyDescriptorMap | undefined;

/** Gives a script-disabled Window its own descriptors for host ECMAScript globals. */
export function installHostGlobals(window: object): void {
  if (!hostGlobals) {
    const descriptors: PropertyDescriptorMap = {};
    for (const name of hostGlobalNames) {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
      if (descriptor) descriptors[name] = descriptor;
    }
    hostGlobals = descriptors;
  }
  Object.defineProperties(window, hostGlobals);
}

/** Compiles an inline handler with its original source and HTML object scopes. */
export function compileEventHandler(input: {
  context: Context;
  source: string;
  url: string;
  type: string;
  isWindowError: boolean;
  scopes: readonly object[];
}): (event: unknown) => unknown {
  const { context, source, url, type, isWindowError, scopes } = input;
  const parameters = isWindowError ? ["event", "source", "lineno", "colno", "error"] : ["event"];
  const options = { parsingContext: context, filename: url };
  // Parse the body in isolation so malformed source cannot escape the generated function.
  compileFunction(source, parameters, options);
  // Scope objects can be proxies. Use with environments and index them via the factory's this.
  const environments = scopes.map((_, index) => `with (this[${index}]) `).join("");
  const name = "on" + type.toLowerCase();
  const factory = compileFunction(
    `${environments}return function ${name}(${parameters.join(", ")}) {\n${source}\n}`,
    [],
    options,
  );
  return Reflect.apply(factory, scopes, []);
}
