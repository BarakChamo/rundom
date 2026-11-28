// Covers stylesheet resource completion, import modifiers and media-list contracts through public facades.
import { createRequire } from "node:module";
import { createServer, type ServerResponse } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { JSDOM, VirtualConsole } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM; VirtualConsole: typeof VirtualConsole } = require("jsdom");
const dataCSS = (text: string) => `data:text/css,${encodeURIComponent(text)}`;

describe.each([
  { name: "RunDOM", Constructor: JSDOM, Console: VirtualConsole },
  { name: "jsdom", Constructor: reference.JSDOM, Console: reference.VirtualConsole },
])("$name stylesheet contracts", ({ Constructor, Console }) => {
  it("keeps an unread large sheet independently editable after its source changes", () => {
    // Given a sheet whose rules have never been observed.
    const { window } = new Constructor(
      "<style>" + ".old{color:red}".repeat(320) + "</style><p></p>",
    );
    try {
      const style = window.document.querySelector("style");
      const oldSheet = window.document.styleSheets[0];
      if (!style || !oldSheet) throw new Error("Expected an attached stylesheet");
      // When its source is replaced, reading or editing the old rules must use the old source.
      style.textContent = "p { color: blue }";
      oldSheet.deleteRule(0);
      expect(oldSheet.cssRules.length).toBe(319);
      expect(oldSheet.cssRules[0]?.parentStyleSheet).toBe(oldSheet);
      // Then the new sheet and its cascade are independent.
      expect(window.document.styleSheets[0]?.cssRules.length).toBe(1);
      const paragraph = window.document.querySelector("p");
      if (!paragraph) throw new Error("Expected paragraph");
      expect(window.getComputedStyle(paragraph).color).toBe("rgb(0, 0, 255)");
    } finally {
      window.close();
    }
  });

  it.each(["load", "error"])(
    "dispatches a style load event after an imported resource settles with %s",
    async (kind) => {
      // Given: a style element owns a successful or malformed data-URL import.
      const { window: w } = new Constructor("", {
        resources: "usable",
        virtualConsole: new Console(),
      });
      try {
        const head = w.document.head;
        if (!head) throw new Error("Expected HTML head");
        const style = w.document.createElement("style");
        if (!(style instanceof w.HTMLStyleElement)) throw new Error("Expected style");
        const target = kind === "load" ? dataCSS("p{color:green}") : "data:text/css";
        style.textContent = `@import "${target}";`;
        // When: the connected style fetches its import, completion is observable on its owner.
        const outcome = await new Promise<{
          type: string;
          trusted: boolean;
          target: object | null;
        }>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Stylesheet event timed out")), 500);
          for (const name of ["load", "error"])
            style.addEventListener(
              name,
              (event) => {
                clearTimeout(timer);
                resolve({ type: event.type, trusted: event.isTrusted, target: event.target });
              },
              { once: true },
            );
          head.append(style);
        });
        // Then: the graph completes once on its owner even when a child fetch fails.
        expect(outcome.type).toBe("load");
        expect(outcome.trusted).toBe(true);
        expect(outcome.target).toBe(style);
        const rule = style.sheet?.cssRules[0];
        if (!(rule instanceof w.CSSImportRule)) throw new Error("Expected import");
        expect(rule.styleSheet?.cssRules.length).toBe(kind === "load" ? 1 : 0);
      } finally {
        w.close();
      }
    },
  );

  it("finishes nested import graphs before the Window load event", async () => {
    // Given: one imported stylesheet starts another import while its parent is finishing.
    const inner = dataCSS("p{color:green}"),
      outer = dataCSS(`@import "${inner}";`);
    const { window: w } = new Constructor("", {
      resources: "usable",
      virtualConsole: new Console(),
    });
    try {
      const head = w.document.head;
      if (!head) throw new Error("Expected HTML head");
      const style = w.document.createElement("style");
      if (!(style instanceof w.HTMLStyleElement)) throw new Error("Expected style");
      let completions = 0;
      style.addEventListener("load", () => completions++);
      style.textContent = `@import "${outer}";`;
      const loaded = new Promise<void>((resolve) =>
        w.addEventListener("load", () => resolve(), { once: true }),
      );
      head.append(style);
      // When/Then: Window load observes both imported sheets and their resource completion events.
      await loaded;
      expect(completions).toBe(1);
      const first = style.sheet?.cssRules[0];
      if (!(first instanceof w.CSSImportRule)) throw new Error("Expected outer import");
      const second = first.styleSheet?.cssRules[0];
      if (!(second instanceof w.CSSImportRule)) throw new Error("Expected inner import");
      expect(second.styleSheet?.cssRules[0]?.cssText).toBe("p { color: green; }");
    } finally {
      w.close();
    }
  });

  it("suppresses imported-resource events after Window.stop aborts the request", async () => {
    // Given: a server holds a stylesheet response until the Window explicitly stops loading.
    let receive: ((response: ServerResponse) => void) | undefined;
    const received = new Promise<ServerResponse>((resolve) => {
      receive = resolve;
    });
    const server = createServer((_request, response) => receive?.(response));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected listening address");
    const { window: w } = new Constructor("", {
      resources: "usable",
      virtualConsole: new Console(),
    });
    try {
      const head = w.document.head;
      if (!head) throw new Error("Expected HTML head");
      const owner = w.document.createElement("style"),
        events: string[] = [];
      owner.addEventListener("load", () => events.push("load"));
      owner.addEventListener("error", () => events.push("error"));
      owner.textContent = `@import "http://127.0.0.1:${address.port}/held.css";`;
      head.append(owner);
      const response = await received;
      // When/Then: an aborted fetch produces neither a successful nor failed resource event.
      w.stop();
      response.writeHead(200, { "Content-Type": "text/css" });
      response.end("p{color:green}");
      await delay(20);
      expect(events).toEqual([]);
    } finally {
      w.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it.each([
    ["SCREEN", "screen"],
    ["NOT  PRINT", "not print"],
    ["screen, bad$, PRINT", "screen, not all, print"],
  ])("normalizes MediaList text %s", (source, expected) => {
    // Given: public media setters normalize keyword spelling independently of matching.
    const { window: w } = new Constructor();
    try {
      const sheet = new w.CSSStyleSheet();
      sheet.media = source;
      // When/Then: indexed and serialized views share the canonical query list.
      expect(sheet.media.mediaText).toBe(expected);
      expect(
        Array.from({ length: sheet.media.length }, (_, index) => sheet.media.item(index)).join(
          ", ",
        ),
      ).toBe(expected);
    } finally {
      w.close();
    }
  });

  it("deduplicates and deletes normalized media and reports absent entries atomically", () => {
    // Given: matching uses normalized query text rather than the authored casing.
    const { window: w } = new Constructor();
    try {
      const sheet = new w.CSSStyleSheet();
      sheet.media = "screen";
      sheet.media.appendMedium("SCREEN");
      sheet.media.appendMedium("PRINT");
      expect(sheet.media.mediaText).toBe("screen, print");
      // When/Then: deletion is normalized and a missing entry leaves the list unchanged.
      sheet.media.deleteMedium("SCREEN");
      expect(sheet.media.mediaText).toBe("print");
      expect(() => sheet.media.deleteMedium("screen")).toThrow(
        "Cannot delete a medium that is not in the media list.",
      );
      expect(sheet.media.mediaText).toBe("print");
    } finally {
      w.close();
    }
  });

  it.each([
    ["layer(foo) SCREEN", "foo", "", "screen"],
    ["layer", "", "", ""],
    ["supports((font-family: layer))", null, "(font-family: layer)", ""],
    ["supports(display:block)", null, "display:block", ""],
    ["layer() screen", null, "", "not all"],
    ["layer(A B) screen, print", null, "", "not all, print"],
    ["layer(A . B)", null, "", "layer(A . B)"],
    ["layer(a.b) supports((display: grid)) screen", "a.b", "(display: grid)", "screen"],
  ])(
    "parses top-level import modifiers %s without confusing nested tokens",
    (suffix, layer, supports, media) => {
      // Given: only valid top-level layer/supports modifiers are consumed before the media list.
      const { window: w } = new Constructor();
      try {
        // @import belongs to an attached sheet; constructed-sheet replacement ignores imports.
        const head = w.document.head;
        if (!head) throw new Error("Expected HTML head");
        const owner = w.document.createElement("style");
        head.append(owner);
        if (!(owner instanceof w.HTMLStyleElement) || !owner.sheet)
          throw new Error("Expected sheet");
        owner.sheet.insertRule(`@import "data:text/css," ${suffix};`);
        const rule = owner.sheet.cssRules[0];
        if (!(rule instanceof w.CSSImportRule)) throw new Error("Expected import");
        // When/Then: nested names do not become layer assignments, and invalid modifiers remain media syntax.
        expect(rule.layerName).toBe(layer);
        expect(rule.supportsText ?? "").toBe(supports);
        expect(rule.media.mediaText).toBe(media);
      } finally {
        w.close();
      }
    },
  );
});

it("keeps repeated private rule plans independent when their CSSOM views escape", () => {
  const { window: w } = new JSDOM("<p></p>");
  try {
    const sheet = new w.CSSStyleSheet();
    for (let i = 0; i < 3; i++) sheet.insertRule("p { color: red }", i);
    const first = sheet.cssRules[1],
      last = sheet.cssRules[2];
    if (!(first instanceof w.CSSStyleRule) || !(last instanceof w.CSSStyleRule))
      throw new Error("Expected two style rules");
    first.selectorText = "section";
    first.style.color = "blue";
    expect(last.selectorText).toBe("p");
    expect(last.style.color).toBe("red");
    expect(last.parentStyleSheet).toBe(sheet);
  } finally {
    w.close();
  }
});

it("preserves HTML raw text and tokenizer normalization during style replacement", () => {
  const { window: w } = new JSDOM("");
  try {
    const style = w.document.createElement("style");
    for (const [source, expected] of [
      ["p::before{content:'&amp;雪'}", "p::before{content:'&amp;雪'}"],
      ["a\r\nb\u0000c", "a\nb\uFFFDc"],
      ["x<z", "x<z"],
    ]) {
      style.innerHTML = source ?? "";
      expect(style.textContent).toBe(expected);
      expect(style.childNodes).toHaveLength(1);
    }
    style.innerHTML = "";
    expect(style.childNodes).toHaveLength(0);
  } finally {
    w.close();
  }
});
