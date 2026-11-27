// Opt-in Vitest environment: the built-in jsdom environment with Window globals resolved on first use.
//
// Vitest's built-in `jsdom` environment reads every Window global once per test file (`populateGlobal` with
// `bindFunctions`). This environment installs the same keys with the same accessor descriptors on the test global,
// but reads each Window property only when the test first reads that global. Everything else follows Vitest 5.1.0's
// built-in jsdom environment (MIT, https://github.com/vitest-dev/vitest), from which the key list, listener patches
// and Request/URL compatibility classes below are copied.
import { createRequire } from "node:module";
import { URL as NodeURL } from "node:url";

// Vitest 5.1.0 `LIVING_KEYS` followed by `OTHER_KEYS`.
const KEYS = [
  "DOMException",
  "EventTarget",
  "NamedNodeMap",
  "Node",
  "Attr",
  "Element",
  "DocumentFragment",
  "DOMImplementation",
  "Document",
  "XMLDocument",
  "CharacterData",
  "Text",
  "CDATASection",
  "ProcessingInstruction",
  "Comment",
  "DocumentType",
  "NodeList",
  "RadioNodeList",
  "HTMLCollection",
  "HTMLOptionsCollection",
  "DOMStringMap",
  "DOMTokenList",
  "StyleSheetList",
  "HTMLElement",
  "HTMLHeadElement",
  "HTMLTitleElement",
  "HTMLBaseElement",
  "HTMLLinkElement",
  "HTMLMetaElement",
  "HTMLStyleElement",
  "HTMLBodyElement",
  "HTMLHeadingElement",
  "HTMLParagraphElement",
  "HTMLHRElement",
  "HTMLPreElement",
  "HTMLUListElement",
  "HTMLOListElement",
  "HTMLLIElement",
  "HTMLMenuElement",
  "HTMLDListElement",
  "HTMLDivElement",
  "HTMLAnchorElement",
  "HTMLAreaElement",
  "HTMLBRElement",
  "HTMLButtonElement",
  "HTMLCanvasElement",
  "HTMLDataElement",
  "HTMLDataListElement",
  "HTMLDetailsElement",
  "HTMLDialogElement",
  "HTMLDirectoryElement",
  "HTMLFieldSetElement",
  "HTMLFontElement",
  "HTMLFormElement",
  "HTMLHtmlElement",
  "HTMLImageElement",
  "HTMLInputElement",
  "HTMLLabelElement",
  "HTMLLegendElement",
  "HTMLMapElement",
  "HTMLMarqueeElement",
  "HTMLMediaElement",
  "HTMLMeterElement",
  "HTMLModElement",
  "HTMLOptGroupElement",
  "HTMLOptionElement",
  "HTMLOutputElement",
  "HTMLPictureElement",
  "HTMLProgressElement",
  "HTMLQuoteElement",
  "HTMLScriptElement",
  "HTMLSelectElement",
  "HTMLSlotElement",
  "HTMLSourceElement",
  "HTMLSpanElement",
  "HTMLTableCaptionElement",
  "HTMLTableCellElement",
  "HTMLTableColElement",
  "HTMLTableElement",
  "HTMLTimeElement",
  "HTMLTableRowElement",
  "HTMLTableSectionElement",
  "HTMLTemplateElement",
  "HTMLTextAreaElement",
  "HTMLUnknownElement",
  "HTMLFrameElement",
  "HTMLFrameSetElement",
  "HTMLIFrameElement",
  "HTMLEmbedElement",
  "HTMLObjectElement",
  "HTMLParamElement",
  "HTMLVideoElement",
  "HTMLAudioElement",
  "HTMLTrackElement",
  "HTMLFormControlsCollection",
  "SVGElement",
  "SVGGraphicsElement",
  "SVGSVGElement",
  "SVGTitleElement",
  "SVGAnimatedString",
  "SVGNumber",
  "SVGStringList",
  "Event",
  "CloseEvent",
  "CustomEvent",
  "MessageEvent",
  "ErrorEvent",
  "HashChangeEvent",
  "PopStateEvent",
  "StorageEvent",
  "ProgressEvent",
  "PageTransitionEvent",
  "SubmitEvent",
  "UIEvent",
  "FocusEvent",
  "InputEvent",
  "MouseEvent",
  "KeyboardEvent",
  "TouchEvent",
  "CompositionEvent",
  "WheelEvent",
  "BarProp",
  "External",
  "Location",
  "History",
  "Screen",
  "Crypto",
  "Performance",
  "Navigator",
  "PluginArray",
  "MimeTypeArray",
  "Plugin",
  "MimeType",
  "FileReader",
  "FormData",
  "Blob",
  "File",
  "FileList",
  "ValidityState",
  "DOMParser",
  "XMLSerializer",
  "XMLHttpRequestEventTarget",
  "XMLHttpRequestUpload",
  "XMLHttpRequest",
  "WebSocket",
  "NodeFilter",
  "NodeIterator",
  "TreeWalker",
  "AbstractRange",
  "Range",
  "StaticRange",
  "Selection",
  "Storage",
  "CustomElementRegistry",
  "ShadowRoot",
  "MutationObserver",
  "MutationRecord",
  "Uint8Array",
  "Uint16Array",
  "Uint32Array",
  "Uint8ClampedArray",
  "Int8Array",
  "Int16Array",
  "Int32Array",
  "Float32Array",
  "Float64Array",
  "ArrayBuffer",
  "DOMRectReadOnly",
  "DOMRect",
  "Image",
  "Audio",
  "Option",
  "CSS",
  "addEventListener",
  "alert",
  "blur",
  "cancelAnimationFrame",
  "close",
  "confirm",
  "createPopup",
  "dispatchEvent",
  "document",
  "focus",
  "frames",
  "getComputedStyle",
  "history",
  "innerHeight",
  "innerWidth",
  "length",
  "localStorage",
  "location",
  "matchMedia",
  "moveBy",
  "moveTo",
  "name",
  "navigator",
  "open",
  "outerHeight",
  "outerWidth",
  "pageXOffset",
  "pageYOffset",
  "parent",
  "postMessage",
  "print",
  "prompt",
  "removeEventListener",
  "requestAnimationFrame",
  "resizeBy",
  "resizeTo",
  "screen",
  "screenLeft",
  "screenTop",
  "screenX",
  "screenY",
  "scroll",
  "scrollBy",
  "scrollLeft",
  "scrollTo",
  "scrollTop",
  "scrollX",
  "scrollY",
  "self",
  "sessionStorage",
  "stop",
  "top",
  "Window",
  "window",
];
const KEY_SET = new Set(KEYS);
const SKIP_KEYS = ["window", "self", "top", "parent"];
const require = createRequire(import.meta.url);
const { implForWrapper } = require("./jsdom-idl-utils.cjs");

/**
 * Installs one configurable, non-enumerable accessor per Window key on `global`, exactly where Vitest's
 * `populateGlobal` would. Unlike Vitest, only keys the host global already defines (about 25, such as `Event`,
 * `FormData` and `navigator`) are read here; the roughly 480 Window-only keys are read on first use.
 *
 * Each accessor behaves as follows:
 * - `key in global` and `Object.getOwnPropertyDescriptor` see the accessor and never read the Window.
 * - The first read resolves the Window value. Functions whose name does not start with an upper-case letter are
 *   bound to the Window once, on that read, and the bound function is returned from then on; other values are read
 *   live from the Window on every access.
 * - Assignment stores the value for later reads of the global and also assigns it to the Window.
 * - `Object.keys(global)` does not list the keys, because the accessors are non-enumerable.
 * - The returned teardown deletes every accessor and restores the descriptors that existed before setup.
 */
function populateLazyGlobal(global, win) {
  const keys = new Set(
    [...KEYS, ...Object.getOwnPropertyNames(win)].filter(
      (key) => !SKIP_KEYS.includes(key) && (!(key in global) || KEY_SET.has(key)),
    ),
  );
  const originals = new Map();
  for (const key of keys) {
    let overridden = false;
    let override;
    // undefined: not resolved yet; null: not a bindable function, so read the Window live.
    let bound;
    const resolve = () => {
      const value = win[key];
      bound =
        typeof value === "function" && key[0] !== key[0].toUpperCase() ? value.bind(win) : null;
      return bound ?? value;
    };
    // Keys the host already defines are resolved now, in Vitest's order, because RunDOM Window getters read host
    // classes such as FormData from `globalThis`; once the accessor replaces them, those reads would recurse.
    if (key in global) {
      originals.set(
        key,
        Object.getOwnPropertyDescriptor(global, key) ?? {
          value: global[key],
          configurable: true,
          writable: true,
          enumerable: true,
        },
      );
      resolve();
    }
    Object.defineProperty(global, key, {
      get() {
        if (overridden) return override;
        if (bound === undefined) return resolve();
        return bound ?? win[key];
      },
      set(value) {
        overridden = true;
        override = value;
        win[key] = value;
      },
      configurable: true,
    });
  }
  global.window = global;
  global.self = global;
  global.top = global;
  global.parent = global;
  if (global.global) global.global = global;
  if (global.document && global.document.defaultView)
    Object.defineProperty(global.document, "defaultView", {
      get: () => global,
      enumerable: true,
      configurable: true,
    });
  for (const key of SKIP_KEYS) keys.add(key);
  return () => {
    for (const key of keys) delete global[key];
    for (const [key, descriptor] of originals) Object.defineProperty(global, key, descriptor);
  };
}

function catchWindowErrors(window) {
  let userErrorListenerCount = 0;
  function throwUnhandledError(event) {
    if (userErrorListenerCount === 0 && event.error != null) {
      event.preventDefault();
      process.emit("uncaughtException", event.error);
    }
  }
  const addEventListener = window.addEventListener.bind(window);
  const removeEventListener = window.removeEventListener.bind(window);
  window.addEventListener("error", throwUnhandledError);
  window.addEventListener = function (...args) {
    if (args[0] === "error") userErrorListenerCount++;
    return addEventListener.apply(this, args);
  };
  window.removeEventListener = function (...args) {
    if (args[0] === "error" && userErrorListenerCount) userErrorListenerCount--;
    return removeEventListener.apply(this, args);
  };
  return () => window.removeEventListener("error", throwUnhandledError);
}

function patchAddEventListener(window) {
  const abortControllers = new WeakMap();
  const WindowAbortSignal = window.AbortSignal;
  const WindowAbortController = window.AbortController;
  const originalAddEventListener = window.EventTarget.prototype.addEventListener;
  function windowAbortController(signal) {
    if (!abortControllers.has(signal)) {
      const controller = new WindowAbortController();
      signal.addEventListener("abort", () => controller.abort(signal.reason));
      abortControllers.set(signal, controller);
    }
    return abortControllers.get(signal);
  }
  window.EventTarget.prototype.addEventListener = function addEventListener(
    type,
    callback,
    options,
  ) {
    if (typeof options === "object" && options?.signal != null) {
      const { signal, ...otherOptions } = options;
      // A Node AbortSignal cannot be passed to the Window's EventTarget, so it is mirrored by a Window signal.
      if (!(signal instanceof WindowAbortSignal)) {
        const compatOptions = Object.create(null);
        Object.assign(compatOptions, otherOptions);
        compatOptions.signal = windowAbortController(signal).signal;
        return originalAddEventListener.call(this, type, callback, compatOptions);
      }
    }
    return originalAddEventListener.call(this, type, callback, options);
  };
  return () => {
    window.EventTarget.prototype.addEventListener = originalAddEventListener;
  };
}

function createCompatUtils(window, NodeFormData, NodeBlob) {
  const utils = {
    window,
    makeCompatFormData(formData) {
      const nodeFormData = new NodeFormData();
      formData.forEach((value, key) => {
        if (value instanceof window.Blob) nodeFormData.append(key, utils.makeCompatBlob(value));
        else nodeFormData.append(key, value);
      });
      return nodeFormData;
    },
    makeCompatBlob(blob) {
      const impl = implForWrapper(blob);
      if (!impl) throw new TypeError("Cannot read the bytes of a RunDOM Blob.");
      return new NodeBlob([impl._bytes], { type: blob.type });
    },
  };
  return utils;
}

function createCompatRequest(utils, NodeRequest) {
  class Request extends NodeRequest {
    constructor(...args) {
      const [input, init] = args;
      if (init?.body != null) {
        const compatInit = { ...init };
        if (init.body instanceof utils.window.Blob)
          compatInit.body = utils.makeCompatBlob(init.body);
        if (init.body instanceof utils.window.FormData)
          compatInit.body = utils.makeCompatFormData(init.body);
        super(input, compatInit);
      } else super(...args);
    }
    static [Symbol.hasInstance](instance) {
      return instance instanceof NodeRequest;
    }
  }
  return Request;
}

function createCompatURL(utils) {
  class URL extends NodeURL {
    static createObjectURL(blob) {
      if (blob instanceof utils.window.Blob)
        return NodeURL.createObjectURL(utils.makeCompatBlob(blob));
      return NodeURL.createObjectURL(blob);
    }
    static [Symbol.hasInstance](instance) {
      return instance instanceof NodeURL;
    }
  }
  return URL;
}

/**
 * Vitest environment `rundom`: use it with `environment: fileURLToPath(import.meta.resolve("@run-dom/jsdom/vitest-environment"))`.
 * `environmentOptions.jsdom` accepts the same options and defaults as Vitest's built-in jsdom environment
 * (`html`, `url` = `http://localhost:3000`, `pretendToBeVisual` = true, `runScripts` = `dangerously`, `console`,
 * `cookieJar`, `userAgent`, `resources`, ...). Only the `forks` and `threads` pools are supported; the VM pools
 * do not populate globals and keep using the built-in environment.
 */
export default {
  name: "rundom",
  viteEnvironment: "client",
  async setup(global, { jsdom = {} }) {
    const NodeFormData = globalThis.FormData;
    const NodeBlob = globalThis.Blob;
    const NodeRequest = globalThis.Request;
    const { CookieJar, JSDOM, VirtualConsole } = require("../dist/jsdom.cjs");
    const {
      html = "<!DOCTYPE html>",
      userAgent,
      url = "http://localhost:3000",
      contentType = "text/html",
      pretendToBeVisual = true,
      includeNodeLocations = false,
      runScripts = "dangerously",
      resources,
      console = false,
      cookieJar = false,
      ...restOptions
    } = jsdom;
    let virtualConsole;
    if (console && globalThis.console) {
      virtualConsole = new VirtualConsole();
      virtualConsole.forwardTo(globalThis.console);
    }
    const dom = new JSDOM(html, {
      pretendToBeVisual,
      runScripts,
      url,
      virtualConsole,
      cookieJar: cookieJar ? new CookieJar() : undefined,
      includeNodeLocations,
      contentType,
      resources: userAgent ? { userAgent } : resources,
      ...restOptions,
    });
    const clearAddEventListenerPatch = patchAddEventListener(dom.window);
    const restoreGlobals = populateLazyGlobal(global, dom.window);
    const clearWindowErrors = catchWindowErrors(global);
    const utils = createCompatUtils(dom.window, NodeFormData, NodeBlob);
    global.jsdom = dom;
    global.Request = createCompatRequest(utils, NodeRequest);
    global.URL = createCompatURL(utils);
    return {
      teardown(global) {
        clearAddEventListenerPatch();
        clearWindowErrors();
        dom.window.close();
        delete global.jsdom;
        restoreGlobals();
      },
    };
  },
};
