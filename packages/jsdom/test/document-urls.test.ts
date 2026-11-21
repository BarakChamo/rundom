// Exercises document-encoding URL parsing through reflected DOM properties and ownership changes.
import { JSDOM, requestInterceptor } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

function encodedDocument(encoding: string) {
  return new JSDOM(Buffer.from(`<meta charset="${encoding}"><body></body>`), {
    url: "https://example.test/directory/page",
  });
}

describe("Document URL encoding", () => {
  for (const [encoding, text, query] of [
    ["big5", "一", "%A4@"],
    ["shift_jis", "あ", "%82%A0"],
    ["euc-jp", "あ", "%A4%A2"],
    ["euc-kr", "가", "%B0%A1"],
    ["gbk", "中", "%D6%D0"],
    ["windows-1252", "é", "%E9"],
    ["iso-2022-jp", "あ", "%1B$B$%22%1B(B"],
  ] as const) {
    it(`encodes hyperlink queries using ${encoding} while keeping paths and fragments UTF-8`, () => {
      // Given: byte markup establishes a legacy document encoding.
      const dom = encodedDocument(encoding);
      try {
        const w = dom.window,
          a = w.document.createElement("a");
        if (!(a instanceof w.HTMLAnchorElement)) throw new Error("Expected an anchor");
        // When: a Unicode URL is reflected by the hyperlink interface.
        a.href = `https://example.test/${text}?${text}#${text}`;
        // Then: only its query uses document encoding; URL constructors always use UTF-8.
        expect(a.search).toBe(`?${query}`);
        expect(a.pathname).toBe(`/${encodeURIComponent(text)}`);
        expect(a.hash).toBe(`#${encodeURIComponent(text)}`);
        expect(new w.URL(`https://example.test/?${text}`).search).toBe(
          `?${encodeURIComponent(text)}`,
        );
      } finally {
        dom.window.close();
      }
    });
  }

  it("uses numeric character-reference fallback for unencodable query characters", () => {
    // Given: Big5 cannot encode the snowman or an astral emoji.
    const dom = encodedDocument("big5");
    try {
      const w = dom.window,
        a = w.document.createElement("a");
      if (!(a instanceof w.HTMLAnchorElement)) throw new Error("Expected an anchor");
      // When: both characters enter the query.
      a.href = "https://example.test/?☃💩";
      // Then: encoding fallback is percent-encoded into the URL, without replacing characters.
      expect(a.search).toBe("?%26%239731%3B%26%23128169%3B");
    } finally {
      dom.window.close();
    }
  });

  it("keeps string input in UTF-8 regardless of a legacy meta label", () => {
    // Given: constructor string input is already Unicode.
    const dom = new JSDOM("<meta charset=big5>", { url: "https://example.test/" });
    try {
      const w = dom.window,
        a = w.document.createElement("a");
      if (!(a instanceof w.HTMLAnchorElement)) throw new Error("Expected an anchor");
      // When: the anchor parses a non-ASCII query.
      a.href = "?一";
      // Then: markup metadata does not relabel a JavaScript string.
      expect(w.document.characterSet).toBe("UTF-8");
      expect(a.search).toBe("?%E4%B8%80");
    } finally {
      dom.window.close();
    }
  });

  it("uses the owning document when a hyperlink search component changes", () => {
    // Given: an existing Big5 hyperlink has an encoded query.
    const dom = encodedDocument("big5");
    try {
      const w = dom.window,
        a = w.document.createElement("a");
      if (!(a instanceof w.HTMLAnchorElement)) throw new Error("Expected an anchor");
      a.href = "https://example.test/path?old#fragment";
      // When: component setters replace, empty, and remove the query.
      a.search = "?一";
      // Then: query replacement keeps document encoding and other components intact.
      expect(a.href).toBe("https://example.test/path?%A4@#fragment");
      a.search = "?";
      expect(a.href).toBe("https://example.test/path?#fragment");
      a.search = "";
      expect(a.href).toBe("https://example.test/path#fragment");
    } finally {
      dom.window.close();
    }
  });

  it("switches encoding and base when a foreign hyperlink is adopted", () => {
    // Given: an anchor belongs to a UTF-8 document before adoption into Big5.
    const first = new JSDOM("", { url: "https://first.test/" }),
      second = encodedDocument("big5");
    try {
      const a = first.window.document.createElement("a");
      if (!(a instanceof first.window.HTMLAnchorElement)) throw new Error("Expected an anchor");
      a.href = "next?一";
      expect(a.href).toBe("https://first.test/next?%E4%B8%80");
      // When: its node document changes but its original constructor identity is retained.
      const body = second.window.document.body;
      if (!body) throw new Error("Expected a destination body");
      body.appendChild(a);
      Object.defineProperty(second.window.document, "characterSet", {
        get() {
          throw new Error("Public charset getter must not run");
        },
      });
      // Then: URL algorithms read private document metadata, independent of the wrapper realm.
      expect(a instanceof first.window.HTMLAnchorElement).toBe(true);
      expect(a.href).toBe("https://example.test/directory/next?%A4@");
      a.search = "?☃";
      expect(a.search).toBe("?%26%239731%3B");
    } finally {
      first.window.close();
      second.window.close();
    }
  });

  it("uses legacy query encoding for reflected area, resource, form, and citation URLs", () => {
    // Given: distinct HTML URL interfaces share one Big5 node document.
    const dom = encodedDocument("big5");
    try {
      const w = dom.window;
      // When: each element reflects a relative URL content attribute.
      for (const [tag, attribute, property] of [
        ["area", "href", "href"],
        ["img", "src", "src"],
        ["iframe", "src", "src"],
        ["script", "src", "src"],
        ["link", "href", "href"],
        ["form", "action", "action"],
        ["q", "cite", "cite"],
        ["blockquote", "cite", "cite"],
      ] as const) {
        const node = w.document.createElement(tag);
        node.setAttribute(attribute, "next?一");
        // Then: all reflected URLs use the same encoding-aware resolution contract.
        expect(Reflect.get(node, property), tag).toBe("https://example.test/directory/next?%A4@");
      }
    } finally {
      dom.window.close();
    }
  });

  it("resolves a base element's query using document encoding", () => {
    // Given: the document's first base URL is itself a non-ASCII query.
    const dom = encodedDocument("big5");
    try {
      const w = dom.window,
        base = w.document.createElement("base"),
        a = w.document.createElement("a");
      base.setAttribute("href", "/root?一");
      const head = w.document.head;
      if (!head || !(a instanceof w.HTMLAnchorElement)) throw new Error("Expected URL fixtures");
      head.appendChild(base);
      // When: an empty hyperlink resolves against that base.
      a.href = "";
      // Then: baseURI, base reflection, and hyperlink reflection agree.
      expect(w.document.baseURI).toBe("https://example.test/root?%A4@");
      expect(Reflect.get(base, "href")).toBe("https://example.test/root?%A4@");
      expect(a.href).toBe("https://example.test/root?%A4@");
    } finally {
      dom.window.close();
    }
  });

  it("encodes same-document history URL queries without changing their state", () => {
    // Given: a Big5 document with a same-origin history context.
    const dom = encodedDocument("big5");
    try {
      const w = dom.window;
      // When: pushState and replaceState resolve new query strings.
      w.history.pushState({ step: 1 }, "", "?一");
      // Then: URL parsing uses document encoding and preserves the supplied state.
      expect(w.location.search).toBe("?%A4@");
      expect(w.history.state).toEqual({ step: 1 });
      w.history.replaceState({ step: 2 }, "", "?☃");
      expect(w.location.search).toBe("?%26%239731%3B");
      expect(w.history.state).toEqual({ step: 2 });
    } finally {
      dom.window.close();
    }
  });

  it("keeps URL failure reflection and non-special-scheme queries intact", () => {
    // Given: legacy encoding does not apply to mailto, data, or WebSocket URL queries.
    const dom = encodedDocument("big5");
    try {
      const w = dom.window,
        a = w.document.createElement("a");
      if (!(a instanceof w.HTMLAnchorElement)) throw new Error("Expected an anchor");
      // When: invalid and non-HTTP URLs are reflected.
      a.href = "http://[invalid/?一";
      // Then: failure retains the author attribute; schemes defined as UTF-8 stay UTF-8.
      expect(a.href).toBe("http://[invalid/?一");
      for (const scheme of [
        "mailto:a",
        "data:text/plain,a",
        "ws://example.test/",
        "wss://example.test/",
      ]) {
        a.href = `${scheme}?一`;
        expect(a.search).toBe("?%E4%B8%80");
      }
    } finally {
      dom.window.close();
    }
  });
  for (const [parentEncoding, mime, bytes, expected, childEncoding] of [
    ["utf-8", "text/plain;charset=windows-1251", [0xa2], "ў", "windows-1251"],
    ["shift_jis", "text/html", [0x82, 0xa0], "あ", "Shift_JIS"],
    [
      "utf-8",
      "text/html;charset=bad-label",
      [...Buffer.from("<meta charset=also-bad>"), 0xa2],
      "�",
      "UTF-8",
    ],
    [
      "utf-8",
      "text/html;charset=bad-label",
      [...Buffer.from("<meta charset=windows-1251>"), 0xa2],
      "ў",
      "windows-1251",
    ],
    [
      "windows-1251",
      "application/json",
      [...Buffer.from('{"text":"☃é"}')],
      '{"text":"☃é"}',
      "UTF-8",
    ],
    [
      "utf-8",
      "application/json;charset=windows-1251",
      [...Buffer.from('{"text":"'), 0xa2, ...Buffer.from('"}')],
      '{"text":"ў"}',
      "windows-1251",
    ],
    [
      "shift_jis",
      "text/html;charset=windows-1251",
      [0xef, 0xbb, 0xbf, ...Buffer.from("☃")],
      "☃",
      "UTF-8",
    ],
    [
      "shift_jis",
      "application/xhtml+xml",
      [...Buffer.from('<html xmlns="http://www.w3.org/1999/xhtml"><body>☃</body></html>')],
      "☃",
      "UTF-8",
    ],
  ] as const) {
    it(`loads ${mime} frame bytes under a ${parentEncoding} parent with the correct encoding`, async () => {
      // Given: a byte response whose encoding is supplied, inherited, or MIME-defaulted.
      const dom = new JSDOM(Buffer.from(`<meta charset=${parentEncoding}>`), {
        url: "https://example.test/",
        resources: {
          interceptors: [
            requestInterceptor(
              () => new Response(new Uint8Array(bytes), { headers: { "Content-Type": mime } }),
            ),
          ],
        },
      });
      try {
        const w = dom.window,
          frame = w.document.createElement("iframe");
        if (!(frame instanceof w.HTMLIFrameElement) || !w.document.body)
          throw new Error("Expected frame fixtures");
        frame.src = "/child";
        const completed = new Promise<string>((resolve) => {
          frame.addEventListener("load", () => resolve("load"), { once: true });
          frame.addEventListener("error", () => resolve("error"), { once: true });
        });
        // When: the connected frame loads bytes through the actual resource transport.
        w.document.body.appendChild(frame);
        // Then: the document loads successfully and exposes its decoded metadata and content.
        expect(await completed).toBe("load");
        const child = frame.contentWindow as typeof w | null;
        if (!child) throw new Error("Expected a loaded frame window");
        expect(child.document.contentType).toBe(mime.split(";")[0]);
        expect(child.document.characterSet).toBe(childEncoding);
        expect(child.document.body?.textContent).toBe(expected);
      } finally {
        dom.window.close();
      }
    });
  }

  for (const [namespace, attribute, query] of [
    ["http://www.w3.org/1999/xhtml", "src", "%A4@"],
    ["http://www.w3.org/2000/svg", "href", "%A4@"],
  ] as const) {
    it(`loads ${namespace} scripts with their specified URL encoding`, async () => {
      // Given: SVG non-presentation URLs in an HTML document follow HTML URL resolution.
      const requested: string[] = [];
      const dom = new JSDOM(Buffer.from("<meta charset=big5>"), {
        url: "https://example.test/",
        runScripts: "dangerously",
        resources: {
          interceptors: [
            requestInterceptor((request) => {
              requested.push(request.url);
              return new Response("globalThis.loadedScript=true");
            }),
          ],
        },
      });
      try {
        const w = dom.window,
          script = w.document.createElementNS(namespace, "script");
        if (!w.document.body) throw new Error("Expected a script container");
        script.setAttribute(attribute, "/code?一");
        const completed = new Promise<string>((resolve) => {
          script.addEventListener("load", () => resolve("load"), { once: true });
          script.addEventListener("error", () => resolve("error"), { once: true });
        });
        // When: insertion prepares the resource request.
        w.document.body.appendChild(script);
        // Then: the transport URL follows the element's specification and the script executes.
        expect(await completed).toBe("load");
        expect(requested).toEqual([`https://example.test/code?${query}`]);
        expect(Reflect.get(w, "loadedScript")).toBe(true);
      } finally {
        dom.window.close();
      }
    });
  }
  for (const redirect of [false, true]) {
    it(`uses an independent charset for a cross-origin frame${redirect ? " after a redirect" : ""}`, async () => {
      // Given: a Greek parent and a child whose final origin differs, without a valid charset.
      const dom = new JSDOM(Buffer.from("<meta charset=windows-1253>"), {
        url: "https://parent.test/",
        resources: {
          interceptors: [
            requestInterceptor((request) => {
              if (redirect && new URL(request.url).hostname === "parent.test")
                return new Response(null, {
                  status: 302,
                  headers: { Location: "https://child.test/content" },
                });
              return new Response(new Uint8Array([...Buffer.from("<meta charset=bogus>"), 0xa2]), {
                headers: { "Content-Type": "text/html" },
              });
            }),
          ],
        },
      });
      try {
        const w = dom.window,
          frame = w.document.createElement("iframe");
        if (!(frame instanceof w.HTMLIFrameElement) || !w.document.body)
          throw new Error("Expected frame fixtures");
        frame.src = redirect ? "/redirect" : "https://child.test/content";
        const completed = new Promise<string>((resolve) => {
          frame.addEventListener("load", () => resolve("load"), { once: true });
          frame.addEventListener("error", () => resolve("error"), { once: true });
        });
        // When: loading determines the final child document origin and charset.
        w.document.body.appendChild(frame);
        // Then: cross-origin bytes use the independent HTML fallback, including after redirects.
        expect(await completed).toBe("load");
        const child = frame.contentWindow as typeof w | null;
        expect(child?.document.characterSet).toBe("windows-1252");
        expect(child?.document.body?.textContent).toBe("¢");
      } finally {
        dom.window.close();
      }
    });
  }
});

it("uses the hyperlink stringifier's DOM value and checks the receiver in its method realm", () => {
  const { window } = new JSDOM("", {
    runScripts: "outside-only",
    url: "https://example.org/base/",
  });
  try {
    for (const tag of ["a", "area"] as const) {
      const link = window.document.createElement(tag);
      link.setAttribute("href", "page");
      const stringify = link.toString;
      Object.defineProperty(link, "href", {
        get() {
          throw new Error("Author getter");
        },
      });
      expect(stringify.call(link)).toBe("https://example.org/base/page");
      const other = window.document.createElement(tag === "a" ? "area" : "a");
      const TypeError = window.eval("TypeError");
      for (const invalid of [undefined, {}, other, window])
        expect(() => Reflect.apply(stringify, invalid, [])).toThrow(TypeError);
    }
  } finally {
    window.close();
  }
});
