// Exercises the installed public facade with standard DOM types and Node VM integration.
import assert from "node:assert/strict";
import { runInContext } from "node:vm";
import {
  JSDOM,
  VirtualConsole,
  CookieJar,
  toughCookie,
  requestInterceptor,
  type DOMWindow,
} from "jsdom";
const consoleSink = new VirtualConsole().forwardTo(console, { jsdomErrors: "none" });
const jar: toughCookie.CookieJar = new CookieJar();
const dom = new JSDOM('<input value="start"><p></p>', {
  url: "https://example.test/",
  runScripts: "outside-only",
  includeNodeLocations: true,
  cookieJar: jar,
  virtualConsole: consoleSink,
  beforeParse(window) {
    const node: HTMLDivElement = window.document.createElement("div");
    node.style.marginTop = "1px";
  },
  resources: {
    interceptors: [
      requestInterceptor(async (request, context) => {
        const url: string = request.url;
        const element: object | null = context.element;
        return url && element ? new Response("ok") : undefined;
      }),
    ],
  },
});
try {
  const window: DOMWindow = dom.window;
  const input = window.document.querySelector<HTMLInputElement>("input");
  assert.ok(input);
  input.value = "typed";
  input.addEventListener("click", (event) => {
    const x: number = event.clientX;
    assert.equal(x, 0);
  });
  input.dispatchEvent(new window.MouseEvent("click"));
  const paragraph = window.document.querySelector("p");
  assert.ok(paragraph);
  paragraph.style.marginTop = "2px";
  assert.equal(window.getComputedStyle(paragraph).marginTop, "2px");
  class ExampleElement extends window.HTMLElement {
    value = "custom";
  }
  window.customElements.define("typed-example", ExampleElement);
  assert.equal(new ExampleElement().value, "custom");
  const fragment: DocumentFragment = JSDOM.fragment("<span>fragment</span>");
  assert.equal(fragment.querySelector("span")?.textContent, "fragment");
  const location = dom.nodeLocation(input);
  assert.equal(typeof location?.startOffset, "number");
  assert.equal(
    runInContext("document.querySelector('input').value", dom.getInternalVMContext()),
    "typed",
  );
  dom.reconfigure({ url: "https://example.test/next", windowTop: window });
  assert.equal(dom.cookieJar, jar);
  assert.equal(dom.virtualConsole, consoleSink);
  assert.ok(dom.serialize().includes("<input"));
  const fromFile: (path: string) => Promise<JSDOM> = JSDOM.fromFile;
  void fromFile;
} finally {
  dom.window.close();
}
// These declarations check rejected inputs without executing them.
function invalidContracts(): void {
  // @ts-expect-error Script modes use the facade's documented enum.
  new JSDOM("", { runScripts: "sometimes" });
  // @ts-expect-error Unknown CSS fields must not be accepted through an index signature.
  dom.window.document.body.style.imaginaryMargin = "2px";
  // @ts-expect-error Generic selectors retain the requested input element type.
  const bad: HTMLTextAreaElement | null =
    dom.window.document.querySelector<HTMLInputElement>("input");
  void bad;
}
void invalidContracts;

// The separately installed native package must share its binding across module formats.
import { parseHTML, getParserStatistics } from "@run-dom/html-parser";
const nativeDocument = parseHTML({
  markup: "<!doctype html><p>packed native</p>",
  scriptingEnabled: false,
});
if (nativeDocument.isErr()) throw new Error(nativeDocument.error.type);
assert.equal(nativeDocument.value.mode, "no-quirks");
assert.ok(nativeDocument.value.nodes.some((node) => node.name === "p"));
assert.ok(getParserStatistics().nativeCalls >= 1);
