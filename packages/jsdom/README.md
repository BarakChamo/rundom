# @run-dom/jsdom

RunDOM implements the jsdom API for Node.js test suites. It aims to shorten the edit-and-test loop for coding agents and reduce the memory each worker holds when several agents run checks in parallel.

Use the **[jsdom documentation](https://github.com/jsdom/jsdom#readme)** for setup options, API usage and examples. With this package installed under the name `jsdom`, existing imports can use that name. Identical behavior is the compatibility target. The development build passed the same 672 API tests as jsdom 31.0.1. Differences remain in Svelte and the Web Platform Tests. [Version-specific compatibility and benchmark results](https://github.com/BarakChamo/rundom/blob/qualification/jsdom-31-0-1/docs/jsdom-31-qualification.md)

## Node API

The synchronous Node facade exports `JSDOM`, `VirtualConsole`, `CookieJar`, `toughCookie`, and `requestInterceptor` through ESM and CommonJS. The constructor accepts strings, buffers, ArrayBuffers, and views. It sniffs byte encodings and chooses HTML or XML parsing from `contentType`. `serialize()` returns the current document markup. Set `includeNodeLocations: true` at construction to retrieve original parser offsets with `nodeLocation(node)`. Implied elements return `null` and programmatically created nodes return `undefined`.

```ts
import { JSDOM } from "@run-dom/jsdom";
const dom = new JSDOM("<button>Apply</button>");
console.log(dom.window.document.body?.textContent);
dom.window.close();
```

`JSDOM.fromFile(filename)` reads the main document from disk and derives its file URL and default media type. `JSDOM.fromURL(url)` fetches the main document and follows redirects, using the final response URL and media type. `document.lastModified` uses the file modification time or the final response’s `Last-Modified` header when available and otherwise reports the current local time. The request and `document.cookie` share the supplied or default `cookieJar`. The default jar uses loose cookie parsing and is created lazily for constructors that do not perform requests.

The constructor accepts `url` and `referrer` to initialize document metadata. `reconfigure({ url, windowTop })` updates the host-controlled URL or top reference. Location supports reading URL components and same-document hash navigation.

`JSDOM.fragment(markup)` parses a detached fragment with a shared owner document. `beforeParse(window)` runs before markup insertion. The default mode keeps markup scripts inert. `runScripts: "outside-only"` creates a Node VM context for host-invoked code, while `"dangerously"` also executes inline classic scripts in parser order. `getInternalVMContext()` exposes the context in those two modes. Only enable script execution for trusted code.

`VirtualConsole` receives Window console events and inline script errors. Use `forwardTo(console)` to forward them. The legacy `sendTo(console, { omitJSDOMErrors: true })` form supports Jest environments that forward browser errors separately. `window.close()` clears the Window's timer handles. Same-document history supports push, replace, and asynchronous traversal.

Pass `resources: "usable"` to enable external classic script loading in dangerous script mode. A resource options object can also provide an Undici `dispatcher` and ordered `interceptors`. `requestInterceptor(callback)` adapts a Fetch-style callback to that chain. Return a `Response` to supply the resource or `undefined` to continue. The callback receives the initiating element for script, stylesheet, and frame requests and `null` for document and XHR requests.

The resource path covers main documents, classic scripts, linked stylesheets and CSS imports, frame documents, and asynchronous XMLHttpRequest. Classic scripts decode using BOMs, HTTP charsets, element charset, then document encoding. Stylesheets use BOMs, HTTP charsets, an exact initial CSS @charset declaration, then their environment encoding. A valid link charset supplies the initial environment fallback; imported sheets inherit their referring sheet’s detected encoding, including CSSOM imports added after load. XMLHttpRequest exposes headers before streaming the body, supports timeouts and cancellation, and checks cross-origin access and preflights. Document responses parse supported HTML and XML media types. Window stop and close cancel pending resource work. Inline event attributes execute only in dangerous script mode, and callbacks assigned through event handler properties work in all modes. Runtime errors dispatch Window error events before reaching the virtual console. The implementation includes synchronous XMLHttpRequest transport and async/defer classic-script scheduling. XMLHttpRequest event ordering, full CSS cascade and CSSOM support, and cross-document navigation still have outstanding qualification gaps.

`pretendToBeVisual` enables animation frame callbacks and visible document state. `storageQuota` sets the maximum UTF-16 code units for each storage area. Local and session storage are separate and scoped to each top-level Window and origin. Same-origin frames share their top-level context’s areas. Removing a frame closes its child Window and unsubscribes it from storage events.

Connected frames expose child documents for blank and inline `srcdoc` content. Enabling resources also loads navigated frame documents through the transport. Frames inherit script and animation settings. Loaded same-origin HTML frames inherit their initiating document’s fallback encoding; cross-origin HTML frames use an independent fallback, checked against the final response URL after redirects; transport charsets, BOMs, and valid markup declarations retain their decoding precedence. XML and JSON frame responses default to UTF-8. Non-XML bodies use the headless HTML parser. XHR text responses support standard encoding aliases and replacement encoding, with BOMs taking precedence over declared charsets. Frame source and long-description properties resolve against the owning document’s base URL. The current implementation covers document loading and teardown. Writes from an executing classic script insert a fragment immediately after the script, following jsdom. Writes to a completed document replace it synchronously. Browser WindowProxy origin enforcement and the full streaming `document.write()` contract remain incomplete.

CommonJS resource dependencies and the synchronous HTTP worker resolve from the installed implementation artifact. The packed Vitest gate rejects module resolution through the producer checkout, exercising the CSS runtime and facade in each supported pool.

The synchronous HTTP worker inherits the embedding Node process’s flags and preloads, including configured host resolution. XHR defaults merge with author headers case-insensitively; repeated writes retain the first header spelling, and CORS preflights include the configured User-Agent.

The package publishes independent `.d.mts` and `.d.cts` facade declarations. `DOMWindow` combines standard DOM method/element types with the standard-global bindings present on the built Window; the binding-name list is generated during build. Consumers do not typecheck the private DOM implementation or its CSS/parser dependencies. Standard browser typings are a public API convention and do not certify implementation completeness. Use `ConstructorOptions`, `DOMWindow`, and `SourceLocation` for explicit facade annotations.

| Command                                       | Use                                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run conformance:types` (repository root) | Pack into a clean consumer, compile with strict checking and skipLibCheck disabled under NodeNext ESM/CommonJS and bundler resolution, and execute guarded ESM/CommonJS examples. |

HTTP redirect chains retain CORS origin taint even when returning to the document origin. Explicit XHR Basic credentials retry once after a permitted challenge and are cleared across origin changes. Native transport decoding retains the original wire Content-Encoding and Content-Length metadata; decoded progress uses private response metadata rather than publicly exposed headers.

| Command                                           | Use                                                        |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `bun run benchmark:lab prepare`                   | Freeze candidate packages and pinned comparison consumers. |
| `bun run benchmark:lab run /absolute/cohort`      | Serial checked performance matrix.                         |
| `bun run benchmark:lab profile /absolute/cohort`  | Diagnostic CPU or allocation profiles.                     |
| `bun run benchmark:lab memory /absolute/cohort`   | Diagnostic forced-GC lifetime checkpoints.                 |
| `bun run benchmark:lab parallel /absolute/cohort` | Independent-document worker throughput.                    |

See the root [performance laboratory](../../docs/performance-lab.md) for parameters, provenance, interpretation and failure accounting. These commands never change production capabilities.
