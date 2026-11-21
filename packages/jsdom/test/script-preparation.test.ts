// Pins classic-script eligibility for HTML, XHTML, and SVG before scheduling or execution.
import { JSDOM, requestInterceptor } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

const inputs = [
  [undefined, undefined, true],
  ["", undefined, true],
  [" ", undefined, false],
  ["\ttext/javascript\n", undefined, true],
  ["\u00a0text/javascript", undefined, false],
  ["text/javascript\u00a0", undefined, false],
  ["text/javascript;charset=utf-8", undefined, false],
  ["TEXT/JAVASCRIPT", undefined, true],
  ["javascript", undefined, false],
  ["module", undefined, false],
  [undefined, "", true],
  [undefined, "javascript", true],
  [undefined, "JavaScript", true],
  [undefined, "javascript1.5", true],
  [undefined, "javascript1.6", false],
  [undefined, " javascript", false],
  [undefined, "javascript ", false],
  [undefined, "text/javascript", false],
  ["", "unknown", true],
  [" ", "javascript", false],
  ["text/javascript", "unknown", true],
] as const;

describe("Classic script preparation", () => {
  for (const format of ["html", "xhtml", "svg"] as const) {
    for (const [type, language, expected] of inputs) {
      it(`selects ${format} scripts with type=${JSON.stringify(type)} and language=${JSON.stringify(language)}`, () => {
        // Given: a scripting-enabled document with the requested language and namespace rules.
        const isSVG = format === "svg",
          isXML = format !== "html";
        const namespace = isSVG ? "http://www.w3.org/2000/svg" : "http://www.w3.org/1999/xhtml";
        const markup = isSVG
          ? `<svg xmlns="${namespace}"/>`
          : `<html xmlns="${namespace}"><head/><body/></html>`;
        const dom = new JSDOM(isXML ? markup : "", {
          runScripts: "dangerously",
          ...(isXML ? { contentType: isSVG ? "image/svg+xml" : "application/xhtml+xml" } : {}),
        });
        try {
          const w = dom.window,
            script = w.document.createElementNS(namespace, "script");
          if (type !== undefined) script.setAttribute("type", type);
          if (language !== undefined) script.setAttribute("language", language);
          script.textContent = "globalThis.prepared=true";
          const parent = isSVG ? w.document.documentElement : w.document.body;
          if (!parent) throw new Error("Expected a script parent");
          // When: insertion prepares the script synchronously.
          parent.appendChild(script);
          // Then: HTML language fallback is strict, while SVG ignores language entirely.
          const shouldRun = isSVG && type === undefined ? true : expected;
          expect(Reflect.get(w, "prepared") === true).toBe(shouldRun);
        } finally {
          dom.window.close();
        }
      });
    }
  }

  for (const [event, forValue, expected] of [
    ["onload", "window", true],
    [" ONLOAD()\t", " Window ", true],
    ["onclick", "window", false],
    ["onload", "other", false],
    ["onload", "\u00a0window", false],
    [undefined, "other", true],
    ["onclick", undefined, true],
  ] as const) {
    it(`applies legacy event=${JSON.stringify(event)} and for=${JSON.stringify(forValue)} script filtering`, () => {
      // Given: legacy event/for filtering applies only when both attributes are present.
      const dom = new JSDOM("", { runScripts: "dangerously" });
      try {
        const w = dom.window,
          script = w.document.createElement("script");
        if (event !== undefined) script.setAttribute("event", event);
        if (forValue !== undefined) script.setAttribute("for", forValue);
        script.textContent = "globalThis.legacyPrepared=true";
        if (!w.document.body) throw new Error("Expected a body");
        // When: script preparation resolves its legacy event restriction.
        w.document.body.appendChild(script);
        // Then: only the allowed Window load spellings execute when both attributes exist.
        expect(Reflect.get(w, "legacyPrepared") === true).toBe(expected);
      } finally {
        dom.window.close();
      }
    });
  }

  it("does not restart a legacy-filtered script after its attributes and text change", () => {
    // Given: a nonempty script is marked started before the legacy event filter rejects it.
    const dom = new JSDOM("", { runScripts: "dangerously" });
    try {
      const w = dom.window,
        script = w.document.createElement("script");
      script.setAttribute("event", "onclick");
      script.setAttribute("for", "other");
      script.textContent = "globalThis.restarted=true";
      if (!w.document.body) throw new Error("Expected a body");
      w.document.body.appendChild(script);
      // When: later mutations remove the original reason for filtering.
      script.setAttribute("event", "onload");
      script.setAttribute("for", "window");
      script.textContent = "globalThis.restarted=true";
      // Then: preparation remains one-shot for this element.
      expect(Reflect.get(w, "restarted")).toBeUndefined();
    } finally {
      dom.window.close();
    }
  });
  it("runs parser-constructor microtasks before following script after a blocking resource", async () => {
    // Given: an external resource has already suspended parsing before custom-element construction.
    const markup = `<script src="/first.js"></script><script>
      globalThis.events=[];customElements.define('x-checkpoint',class extends HTMLElement{constructor(){super();
        Promise.resolve().then(()=>events.push('promise'));
        const node=document.createTextNode('');const observer=new MutationObserver(()=>events.push('mutation'));
        observer.observe(node,{characterData:true});node.data='changed';
      }});
    </script><x-checkpoint></x-checkpoint><script>globalThis.snapshot=events.slice()</script>`;
    const dom = new JSDOM(markup, {
      url: "https://example.test/",
      runScripts: "dangerously",
      resources: {
        interceptors: [
          requestInterceptor(
            () => new Response("", { headers: { "Content-Type": "text/javascript" } }),
          ),
        ],
      },
    });
    try {
      // When: the resumed parser reaches the script following the custom constructor.
      await new Promise((resolve) => dom.window.addEventListener("load", resolve, { once: true }));
      // Then: queued Promise and observer callbacks precede that script.
      expect(Reflect.get(dom.window, "snapshot")).toEqual(["promise", "mutation"]);
    } finally {
      dom.window.close();
    }
  });

  it("retains synchronous inline execution before any parser resource suspension", () => {
    // Given: an initial string document has no blocking external resources.
    const dom = new JSDOM(
      '<script>globalThis.events=[];Promise.resolve().then(()=>events.push("promise"))</script><script>events.push("inline");globalThis.snapshot=events.slice()</script>',
      { runScripts: "dangerously" },
    );
    try {
      // When/Then: construction still executes initial inline scripts before returning to the host.
      expect(Reflect.get(dom.window, "snapshot")).toEqual(["inline"]);
    } finally {
      dom.window.close();
    }
  });
});
