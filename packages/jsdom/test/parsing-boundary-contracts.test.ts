// Verifies parser receiver ownership and Web IDL conversions through public cross-Window APIs.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
const require = createRequire(import.meta.url);
const reference: { JSDOM: typeof JSDOM } = require("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: reference.JSDOM },
])("$name parsing boundaries", ({ Constructor }) => {
  it.each(["text/html", "application/xml", "text/xml", "application/xhtml+xml", "image/svg+xml"])(
    "allocates a borrowed %s parser result in the receiver's Window",
    (contentType) => {
      // Given: methods and their DOMParser receivers originate in different Windows.
      const left = new Constructor("", { url: "https://left.example/" });
      const right = new Constructor("", { url: "https://right.example/" });
      try {
        const parser = new left.window.DOMParser();
        const parsed = right.window.DOMParser.prototype.parseFromString.call(
          parser,
          "<root/>",
          contentType,
        );
        // When/Then: the receiver owns document allocation and URL metadata.
        expect(parsed.URL).toBe("https://left.example/");
        expect(parsed).toBeInstanceOf(left.window.Document);
        expect(parsed).not.toBeInstanceOf(right.window.Document);
      } finally {
        left.window.close();
        right.window.close();
      }
    },
  );

  it("accepts a borrowed XMLSerializer receiver and rejects a forged receiver", () => {
    // Given: one Window supplies the method and another supplies a genuine serializer.
    const left = new Constructor("<p>text</p>");
    const right = new Constructor();
    try {
      const method = right.window.XMLSerializer.prototype.serializeToString;
      const body = left.window.document.body;
      if (!body) throw new Error("Expected body");
      // When/Then: interface identity spans Windows without admitting arbitrary objects.
      expect(method.call(new left.window.XMLSerializer(), body)).toContain("<p>text</p>");
      expect(() => Reflect.apply(method, {}, [body])).toThrow(/XMLSerializer|Illegal invocation/);
    } finally {
      left.window.close();
      right.window.close();
    }
  });

  it("distinguishes undefined from null on HTML setters", () => {
    // Given: LegacyNullToEmptyString converts null alone to empty markup.
    const { window: w } = new Constructor("<main><p></p></main><div></div>");
    try {
      const target = w.document.querySelector("p");
      const host = w.document.querySelector("div");
      if (!target || !host) throw new Error("Expected elements");
      const shadow = host.attachShadow({ mode: "open" });
      // When/Then: undefined follows DOMString conversion on element and shadow setters.
      Reflect.set(target, "innerHTML", undefined);
      Reflect.set(shadow, "innerHTML", undefined);
      expect(target.innerHTML).toBe("undefined");
      expect(shadow.innerHTML).toBe("undefined");
      Reflect.set(target, "outerHTML", undefined);
      expect(w.document.querySelector("main")?.innerHTML).toBe("undefined");
      Reflect.set(shadow, "innerHTML", null);
      expect(shadow.innerHTML).toBe("");
    } finally {
      w.close();
    }
  });

  it("rejects Symbol markup at each DOMString boundary", () => {
    // Given: Symbol must throw during Web IDL string conversion, before parsing.
    const { window: w } = new Constructor("<p></p>");
    try {
      const target = w.document.querySelector("p");
      if (!target) throw new Error("Expected target");
      const value = Symbol("markup");
      // When/Then: JavaScript String(Symbol) must not bypass DOMString rejection.
      expect(() => Reflect.set(target, "innerHTML", value)).toThrow(/symbol|string/i);
      expect(() => Reflect.set(target, "outerHTML", value)).toThrow(/symbol|string/i);
      expect(() => Reflect.apply(target.insertAdjacentHTML, target, ["beforeend", value])).toThrow(
        /symbol|string/i,
      );
      const range = w.document.createRange();
      expect(() => Reflect.apply(range.createContextualFragment, range, [value])).toThrow(
        /symbol|string/i,
      );
      const parser = new w.DOMParser();
      expect(() => Reflect.apply(parser.parseFromString, parser, [value, "text/html"])).toThrow(
        /symbol|string/i,
      );
    } finally {
      w.close();
    }
  });

  it("requires a Range contextual fragment argument before parsing", () => {
    // Given: an empty argument list differs from an explicit undefined DOMString.
    const { window: w } = new Constructor();
    try {
      const range = w.document.createRange();
      // When/Then: omission throws; explicit undefined becomes text.
      expect(() => Reflect.apply(range.createContextualFragment, range, [])).toThrow(
        /argument|required|parameter/,
      );
      expect(Reflect.apply(range.createContextualFragment, range, [undefined]).textContent).toBe(
        "undefined",
      );
    } finally {
      w.close();
    }
  });

  it.each(["innerHTML", "outerHTML", "insertAdjacentHTML", "createContextualFragment"])(
    "allocates malformed XML %s errors in the invoking Window",
    (operation) => {
      // Given: all XML fragment entry points share a well-formedness error boundary.
      const { window: w } = new Constructor("<root><a/></root>", {
        contentType: "application/xml",
      });
      try {
        const target = w.document.querySelector("a");
        if (!target) throw new Error("Expected XML element");
        let failure: unknown;
        // When: unclosed markup reaches the fragment parser.
        try {
          if (operation === "insertAdjacentHTML") target.insertAdjacentHTML("beforeend", "<b>");
          else if (operation === "createContextualFragment") {
            const range = w.document.createRange();
            range.selectNodeContents(target);
            range.createContextualFragment("<b>");
          } else Reflect.set(target, operation, "<b>");
        } catch (error) {
          failure = error;
        }
        // Then: callers observe the Window's SyntaxError DOMException and unchanged source.
        expect(failure).toBeInstanceOf(w.DOMException);
        expect(failure).toMatchObject({ name: "SyntaxError" });
        expect(w.document.documentElement?.outerHTML).toBe("<root><a/></root>");
      } finally {
        w.close();
      }
    },
  );
});
