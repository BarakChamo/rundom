// Verifies byte-decoding precedence through loaded stylesheets, imports, and classic scripts.
import { JSDOM, requestInterceptor } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

function byteStyle(prefix: string, character = 0xc8): Uint8Array {
  return new Uint8Array([
    ...Buffer.from(prefix + "#"),
    character,
    ...Buffer.from(" { color: red; }"),
  ]);
}

describe("Resource encoding", () => {
  for (const [name, prefix, contentType, charset, expected] of [
    ["document fallback", "", "text/css", "", "И"],
    [
      "HTTP precedence",
      '@charset "windows-1253";',
      "text/css;charset=windows-1250",
      "windows-1253",
      "Č",
    ],
    ["CSS declaration", '@charset "windows-1250";', "text/css", "windows-1253", "Č"],
    ["invalid HTTP fallback", '@charset "windows-1250";', "text/css;charset=invalid", "", "Č"],
    ["invalid declaration fallback", '@charset "invalid";', "text/css", "windows-1250", "Č"],
    [
      "single quoted declaration is not encoding metadata",
      "@charset 'windows-1250';",
      "text/css",
      "",
      "И",
    ],
    [
      "non-initial declaration is not encoding metadata",
      ' @charset "windows-1250";',
      "text/css",
      "",
      "И",
    ],
  ] as const) {
    it(`loads a stylesheet using ${name}`, async () => {
      // Given: conflicting declarations and a document whose fallback is windows-1251.
      const dom = new JSDOM(Buffer.from("<meta charset=windows-1251>"), {
        url: "https://example.test/",
        resources: {
          interceptors: [
            requestInterceptor(
              () => new Response(byteStyle(prefix), { headers: { "Content-Type": contentType } }),
            ),
          ],
        },
      });
      try {
        const w = dom.window,
          link = w.document.createElement("link");
        if (!w.document.head) throw new Error("Expected stylesheet fixtures");
        // Unicode fixtures are installed after byte markup establishes encoding.
        const body = w.document.body;
        if (!body) throw new Error("Expected a body");
        body.innerHTML = '<div id="И"></div><div id="Č"></div><div id="Θ"></div>';
        link.setAttribute("rel", "stylesheet");
        link.setAttribute("href", "/style.css");
        link.setAttribute("charset", charset);
        const completed = new Promise((resolve) => {
          link.addEventListener("load", () => resolve("load"), { once: true });
          link.addEventListener("error", () => resolve("error"), { once: true });
        });
        // When: a connected link loads the actual response bytes.
        w.document.head.appendChild(link);
        // Then: the decoded selector matches only the character chosen by encoding precedence.
        expect(await completed).toBe("load");
        const target = w.document.getElementById(expected);
        if (!target) throw new Error("Expected a target");
        expect(w.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
      } finally {
        dom.window.close();
      }
    });
  }

  it("inherits an imported stylesheet's fallback from its referring sheet", async () => {
    // Given: a UTF-8 document loads a windows-1250 sheet which imports another undeclared sheet.
    const dom = new JSDOM('<div id="Č"></div>', {
      url: "https://example.test/",
      resources: {
        interceptors: [
          requestInterceptor(
            (request) =>
              new Response(
                new URL(request.url).pathname === "/parent.css"
                  ? '@charset "windows-1250";@import "child.css";'
                  : byteStyle(""),
                { headers: { "Content-Type": "text/css" } },
              ),
          ),
        ],
      },
    });
    try {
      const w = dom.window,
        link = w.document.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", "/parent.css");
      if (!w.document.head) throw new Error("Expected a head");
      // When: both the parent and imported response complete.
      const loaded = new Promise((resolve) => w.addEventListener("load", resolve, { once: true }));
      w.document.head.appendChild(link);
      await loaded;
      // Then: the imported selector uses its parent sheet's detected encoding, independently of HTML.
      const target = w.document.getElementById("Č");
      if (!target) throw new Error("Expected a target");
      expect(w.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
    } finally {
      dom.window.close();
    }
  });

  for (const [name, contentType, charset, bytes, expected] of [
    ["document fallback", "text/javascript", "", [0xc8], "И"],
    ["element charset", "text/javascript", "windows-1250", [0xc8], "Č"],
    ["HTTP charset", "text/javascript;charset=windows-1253", "windows-1250", [0xc8], "Θ"],
    [
      "BOM authority",
      "text/javascript;charset=windows-1253",
      "windows-1250",
      [0xef, 0xbb, 0xbf],
      "BOM",
    ],
  ] as const) {
    it(`executes external script bytes using ${name}`, async () => {
      // Given: legacy encodings distinguish identical source bytes, while a BOM overrides them.
      const source =
        name === "BOM authority"
          ? new Uint8Array([...bytes, ...Buffer.from('globalThis.decoded="BOM"')])
          : new Uint8Array([...Buffer.from('globalThis.decoded="'), ...bytes, ...Buffer.from('"')]);
      const dom = new JSDOM(Buffer.from("<meta charset=windows-1251>"), {
        url: "https://example.test/",
        runScripts: "dangerously",
        resources: {
          interceptors: [
            requestInterceptor(
              () => new Response(source, { headers: { "Content-Type": contentType } }),
            ),
          ],
        },
      });
      try {
        const w = dom.window,
          script = w.document.createElement("script");
        script.setAttribute("charset", charset);
        script.setAttribute("src", "/script.js");
        const loaded = new Promise((resolve) => {
          script.addEventListener("load", () => resolve("load"), { once: true });
          script.addEventListener("error", () => resolve("error"), { once: true });
        });
        if (!w.document.body) throw new Error("Expected script fixtures");
        // When: the resource is decoded before classic-script evaluation.
        w.document.body.appendChild(script);
        // Then: JavaScript sees the character selected by source-encoding precedence.
        expect(await loaded).toBe("load");
        expect(Reflect.get(w, "decoded")).toBe(expected);
      } finally {
        dom.window.close();
      }
    });
  }
  for (const [name, type, prefix, expected, encoding] of [
    ["HTML meta", "text/html", "<meta charset=windows-1251><p>", "ў", "windows-1251"],
    [
      "HTML transport authority",
      "text/html;charset=windows-1253",
      "<meta charset=windows-1251><p>",
      "Ά",
      "windows-1253",
    ],
    [
      "HTML invalid transport",
      "text/html;charset=bogus",
      "<meta charset=windows-1251><p>",
      "ў",
      "windows-1251",
    ],
    ["HTML invalid meta", "text/html", "<meta charset=bogus><p>", "�", "UTF-8"],
    [
      "XML declaration",
      "application/xml",
      '<?xml version="1.0" encoding="windows-1251"?><p>',
      "ў",
      "windows-1251",
    ],
    [
      "XML transport authority",
      "application/xml;charset=windows-1253",
      '<?xml version="1.0" encoding="windows-1251"?><p>',
      "Ά",
      "windows-1253",
    ],
  ] as const) {
    it(`decodes an XHR document using ${name} and exposes its canonical encoding`, async () => {
      // Given: a document response has byte metadata independent of the initiating Window.
      const bytes = new Uint8Array([...Buffer.from(prefix), 0xa2, ...Buffer.from("</p>")]);
      const dom = new JSDOM("", {
        url: "https://example.test/",
        resources: {
          interceptors: [
            requestInterceptor(() => new Response(bytes, { headers: { "Content-Type": type } })),
          ],
        },
      });
      try {
        const xhr = new dom.window.XMLHttpRequest();
        xhr.open("GET", "/document");
        xhr.responseType = "document";
        const loaded = new Promise((resolve) => {
          xhr.onload = () => resolve("load");
          xhr.onerror = () => resolve("error");
        });
        // When: the response document is parsed with scripting disabled.
        xhr.send();
        expect(await loaded).toBe("load");
        // Then: canonical charset, text, and detached document identity are preserved.
        const document = xhr.responseXML;
        expect(document?.characterSet).toBe(encoding);
        expect(document?.querySelector("p")?.textContent).toBe(expected);
        expect(document?.defaultView).toBeNull();
        expect(xhr.response).toBe(document);
        expect(xhr.responseXML).toBe(document);
      } finally {
        dom.window.close();
      }
    });
  }

  it("retains a response charset when overrideMimeType changes only its media type", async () => {
    // Given: the response declares a charset while the override supplies no charset.
    const dom = new JSDOM("", {
      url: "https://example.test/",
      resources: {
        interceptors: [
          requestInterceptor(
            () =>
              new Response(Uint8Array.of(0xa2), {
                headers: { "Content-Type": "text/plain;charset=windows-1251" },
              }),
          ),
        ],
      },
    });
    try {
      const xhr = new dom.window.XMLHttpRequest();
      xhr.open("GET", "/text");
      xhr.overrideMimeType("text/plain");
      const loaded = new Promise((resolve) => {
        xhr.onload = () => resolve("load");
        xhr.onerror = () => resolve("error");
      });
      // When: text response decoding chooses the final encoding independently of final MIME type.
      xhr.send();
      expect(await loaded).toBe("load");
      // Then: a charset-free override does not erase the HTTP charset.
      expect(xhr.responseText).toBe("ў");
    } finally {
      dom.window.close();
    }
  });
  for (const nested of [false, true]) {
    it(`retains stylesheet encoding for CSSOM imports${nested ? " in an imported sheet" : ""}`, async () => {
      // Given: windows-1250 CSS has already loaded in a UTF-8 document.
      const dom = new JSDOM('<div id="Č"></div>', {
        url: "https://example.test/",
        resources: {
          interceptors: [
            requestInterceptor((request) => {
              const path = new URL(request.url).pathname;
              if (path === "/parent.css")
                return new Response(
                  '@charset "windows-1250";' + (nested ? '@import "initial.css";' : ""),
                  { headers: { "Content-Type": "text/css" } },
                );
              if (path === "/initial.css")
                return new Response("/* empty imported sheet */", {
                  headers: { "Content-Type": "text/css" },
                });
              return new Response(byteStyle(""), { headers: { "Content-Type": "text/css" } });
            }),
          ],
        },
      });
      try {
        const w = dom.window,
          link = w.document.createElement("link");
        link.setAttribute("rel", "stylesheet");
        link.setAttribute("href", "/parent.css");
        if (!w.document.head) throw new Error("Expected a head");
        const loaded = new Promise((resolve) =>
          w.addEventListener("load", resolve, { once: true }),
        );
        w.document.head.appendChild(link);
        await loaded;
        const parent = w.document.styleSheets[0];
        if (!parent) throw new Error("Expected a parent sheet");
        const first = parent.cssRules[0];
        const sheet = nested && first instanceof w.CSSImportRule ? first.styleSheet : parent;
        if (!sheet) throw new Error("Expected an import destination");
        // When: CSSOM adds an import after the original document load has completed.
        sheet.insertRule('@import "dynamic.css";', 0);
        // Then: the new resource inherits the destination sheet's encoding and updates computed style.
        const target = w.document.getElementById("Č");
        if (!target) throw new Error("Expected a target");
        await expect.poll(() => w.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
        if (nested) expect(sheet.ownerNode).toBeNull();
      } finally {
        dom.window.close();
      }
    });
  }
  for (const [name, parentBytes, stylesheet, type, target] of [
    [
      "UTF-16 environment",
      Buffer.from("\ufeff<meta charset=utf-16le>", "utf16le"),
      Buffer.from("#И {color:red}", "utf16le"),
      "text/css",
      "И",
    ],
    [
      "UTF-8 BOM",
      Buffer.from("<meta charset=windows-1251>"),
      Buffer.from('\ufeff@charset "windows-1250";#Č {color:red}'),
      "text/css;charset=windows-1253",
      "Č",
    ],
    [
      "UTF-16 BOM",
      Buffer.from("<meta charset=windows-1251>"),
      Buffer.from("\ufeff#И {color:red}", "utf16le"),
      "text/css;charset=windows-1253",
      "И",
    ],
    [
      "ASCII UTF-16 declaration",
      Buffer.from("<meta charset=windows-1251>"),
      Buffer.from('@charset "utf-16le";#Č {color:red}'),
      "text/css",
      "Č",
    ],
  ] as const) {
    it(`decodes stylesheet bytes with ${name}`, async () => {
      // Given: UTF encodings distinguish a byte-order mark from an ASCII encoding declaration.
      const dom = new JSDOM(parentBytes, {
        url: "https://example.test/",
        resources: {
          interceptors: [
            requestInterceptor(
              () => new Response(stylesheet, { headers: { "Content-Type": type } }),
            ),
          ],
        },
      });
      try {
        const w = dom.window,
          link = w.document.createElement("link"),
          element = w.document.createElement("div");
        element.id = target;
        if (!w.document.body || !w.document.head) throw new Error("Expected stylesheet fixtures");
        w.document.body.appendChild(element);
        link.setAttribute("rel", "stylesheet");
        link.setAttribute("href", "/utf.css");
        const loaded = new Promise((resolve) => {
          link.addEventListener("load", () => resolve("load"), { once: true });
          link.addEventListener("error", () => resolve("error"), { once: true });
        });
        // When: the link receives its byte body and selects an effective encoding.
        w.document.head.appendChild(link);
        // Then: stylesheet parsing receives the intended selector text.
        expect(await loaded).toBe("load");
        expect(w.getComputedStyle(element).color).toBe("rgb(255, 0, 0)");
      } finally {
        dom.window.close();
      }
    });
  }

  for (const responseType of ["", "text"] as const) {
    it(`uses the XML declaration only for the legacy ${JSON.stringify(responseType)} text response type`, async () => {
      // Given: an XML declaration supplies the only encoding hint.
      const bytes = new Uint8Array([
        ...Buffer.from('<?xml version="1.0" encoding="windows-1251"?><p>'),
        0xa2,
        ...Buffer.from("</p>"),
      ]);
      const dom = new JSDOM("", {
        url: "https://example.test/",
        resources: {
          interceptors: [
            requestInterceptor(
              () => new Response(bytes, { headers: { "Content-Type": "application/xml" } }),
            ),
          ],
        },
      });
      try {
        const xhr = new dom.window.XMLHttpRequest();
        xhr.open("GET", "/xml");
        xhr.responseType = responseType;
        const loaded = new Promise((resolve) => {
          xhr.onload = () => resolve("load");
          xhr.onerror = () => resolve("error");
        });
        // When: XHR exposes XML bytes through its text interface.
        xhr.send();
        expect(await loaded).toBe("load");
        // Then: legacy default text follows XML sniffing; explicit text defaults to UTF-8.
        expect(xhr.responseText.endsWith(responseType === "" ? "ў</p>" : "�</p>")).toBe(true);
      } finally {
        dom.window.close();
      }
    });
  }

  it("parses an empty HTML document response into a detached document", async () => {
    // Given: a successful GET has a zero-length HTML body rather than a null response body.
    const dom = new JSDOM("", {
      url: "https://example.test/",
      resources: {
        interceptors: [
          requestInterceptor(
            () => new Response(new Uint8Array(0), { headers: { "Content-Type": "text/html" } }),
          ),
        ],
      },
    });
    try {
      const xhr = new dom.window.XMLHttpRequest();
      xhr.open("GET", "/empty");
      xhr.responseType = "document";
      const loaded = new Promise((resolve) => {
        xhr.onload = () => resolve("load");
        xhr.onerror = () => resolve("error");
      });
      // When: the document response is consumed.
      xhr.send();
      expect(await loaded).toBe("load");
      // Then: the parser creates the implied HTML structure with canonical metadata.
      expect(xhr.responseXML?.documentElement?.localName).toBe("html");
      expect(xhr.responseXML?.body?.textContent).toBe("");
      expect(xhr.responseXML?.characterSet).toBe("UTF-8");
    } finally {
      dom.window.close();
    }
  });
  for (const [name, prefix, encoding] of [
    ["script text", "<script><meta charset=windows-1251></script>", "UTF-8"],
    ["style text", "<style><meta charset=windows-1251></style>", "UTF-8"],
    ["title text", "<title><meta charset=windows-1251></title>", "UTF-8"],
    ["numeric character reference", '<meta charset="&#119;indows-1251">', "windows-1251"],
    [
      "late declaration in head",
      "<head>" + " ".repeat(1100) + "<meta charset=windows-1251></head>",
      "windows-1251",
    ],
    [
      "late declaration after head",
      "<head></head>" + " ".repeat(1100) + "<meta charset=windows-1251>",
      "UTF-8",
    ],
    [
      "late declaration after unknown markup",
      "<head><bogus>" + " ".repeat(1100) + "<meta charset=windows-1251>",
      "UTF-8",
    ],
    [
      "late inert template",
      "<head><template>" + " ".repeat(1100) + "<meta charset=windows-1251></template></head>",
      "UTF-8",
    ],
    [
      "early template declaration",
      "<head><template><meta charset=windows-1251></template></head>",
      "windows-1251",
    ],
  ] as const) {
    it(`matches browser XHR encoding for ${name}`, async () => {
      // Given: parser state distinguishes metadata from inert text, beyond a raw byte search.
      const bytes = new Uint8Array([...Buffer.from(prefix + "<p>"), 0xa2, ...Buffer.from("</p>")]);
      const dom = new JSDOM("", {
        url: "https://example.test/",
        resources: {
          interceptors: [
            requestInterceptor(
              () => new Response(bytes, { headers: { "Content-Type": "text/html" } }),
            ),
          ],
        },
      });
      try {
        const xhr = new dom.window.XMLHttpRequest();
        xhr.open("GET", "/parser-encoding");
        xhr.responseType = "document";
        const loaded = new Promise((resolve) => {
          xhr.onload = () => resolve("load");
          xhr.onerror = () => resolve("error");
        });
        // When: the response is decoded using Chromium-confirmed metadata behavior.
        xhr.send();
        expect(await loaded).toBe("load");
        // Then: only effective declarations change the encoding and decoded character.
        expect(xhr.responseXML?.characterSet).toBe(encoding);
        expect(xhr.responseXML?.querySelector("p")?.textContent).toBe(
          encoding === "UTF-8" ? "�" : "ў",
        );
      } finally {
        dom.window.close();
      }
    });
  }
  it("retains XML encoding hints for an HTML response without meta declarations", async () => {
    // Given: HTML transport has an XML declaration as its only byte-encoding hint.
    const bytes = new Uint8Array([
      ...Buffer.from('<?xml version="1.0" encoding="windows-1251"?><p>'),
      0xa2,
      ...Buffer.from("</p>"),
    ]);
    const dom = new JSDOM("", {
      url: "https://example.test/",
      resources: {
        interceptors: [
          requestInterceptor(
            () => new Response(bytes, { headers: { "Content-Type": "text/html" } }),
          ),
        ],
      },
    });
    try {
      const xhr = new dom.window.XMLHttpRequest();
      xhr.open("GET", "/xml-hint");
      xhr.responseType = "document";
      const loaded = new Promise((resolve) => {
        xhr.onload = () => resolve("load");
        xhr.onerror = () => resolve("error");
      });
      // When: metadata lookahead finds no effective HTML meta declaration.
      xhr.send();
      expect(await loaded).toBe("load");
      // Then: the sniffer's XML fallback remains available without scanning raw-text meta strings.
      expect(xhr.responseXML?.characterSet).toBe("windows-1251");
      expect(xhr.responseXML?.querySelector("p")?.textContent).toBe("ў");
    } finally {
      dom.window.close();
    }
  });
});
