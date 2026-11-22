// Exercises byte decoding and namespace-sensitive document input through JSDOM.
import { createRequire } from "node:module";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

const require = createRequire(import.meta.url);
const { JSDOM: reference }: { JSDOM: typeof JSDOM } = require("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom 31.0.1", Constructor: reference },
])("$name markup input", ({ Constructor }) => {
  it("uses the BOM over a conflicting transport charset and respects view bounds", () => {
    // Given: a UTF-16LE HTML payload in a view into a larger buffer.
    const encoded = Buffer.from("\uFEFF<p>Є</p>", "utf16le");
    const storage = Buffer.concat([Buffer.from("noise"), encoded, Buffer.from("noise")]);
    const view = new DataView(storage.buffer, storage.byteOffset + 5, encoded.length);

    // When: the constructor receives a conflicting charset.
    const { window } = new Constructor(view, { contentType: "text/html; charset=windows-1252" });

    // Then: decoding is confined to the view and follows the BOM.
    expect(window.document.characterSet).toBe("UTF-16LE");
    expect(window.document.body?.textContent).toBe("Є");
    window.close();
  });

  it("uses the XML context namespace for markup inserted after construction", () => {
    // Given: an XML document with a namespace declaration on an ancestor.
    const dom = new Constructor('<root xmlns:p="urn:parts"><target/></root>', {
      contentType: "text/xml",
    });
    const target = dom.window.document.querySelector("target");
    if (!target) throw new Error("XML target was not parsed");

    // When: a qualified fragment is assigned through innerHTML.
    target.innerHTML = "<p:Part><![CDATA[<data>]]></p:Part>";

    // Then: the inserted element and text preserve XML semantics.
    expect(target.firstElementChild?.namespaceURI).toBe("urn:parts");
    expect(target.firstElementChild?.localName).toBe("Part");
    expect(target.textContent).toBe("<data>");
    expect(dom.serialize()).toContain("<p:Part><![CDATA[<data>]]></p:Part>");
    dom.window.close();
  });
});

const modified = new Date(2001, 1, 3, 4, 5, 6);
const formattedModification = "02/03/2001 04:05:06";

describe("JSDOM.fromFile", () => {
  it("uses the source file modification time for document.lastModified", async () => {
    // Given a source file with a known modification time.
    const directory = await mkdtemp(join(tmpdir(), "run-dom-modified-"));
    const filename = join(directory, "index.html");
    try {
      await writeFile(filename, "<p>local</p>");
      await utimes(filename, modified, modified);

      // When the file is loaded, its document exposes the timestamp in local time.
      const { window } = await JSDOM.fromFile(filename);
      try {
        expect(window.document.lastModified).toBe(formattedModification);
      } finally {
        window.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("JSDOM.fromURL", () => {
  it("exposes the response modification date before parsing", async () => {
    // Given an intercepted HTML response carrying Last-Modified.
    const { requestInterceptor } = await import("@run-dom/jsdom");
    const resources = {
      interceptors: [
        requestInterceptor(
          () =>
            new Response("<p>remote</p>", {
              headers: { "content-type": "text/html", "last-modified": modified.toUTCString() },
            }),
        ),
      ],
    };
    let beforeParse: string | undefined;

    // When the response becomes a document, its timestamp is already available to beforeParse.
    const { window } = await JSDOM.fromURL("https://example.test/", {
      resources,
      beforeParse(window) {
        beforeParse = window.document.lastModified;
      },
    });
    try {
      expect(beforeParse).toBe(formattedModification);
      expect(window.document.lastModified).toBe(formattedModification);
    } finally {
      window.close();
    }
  });

  it("uses cookies set by the redirect on the final request and exposes the final document URL", async () => {
    // Given: a main response that sets a cookie and redirects on the same origin.
    const server = createServer((request, response) => {
      if (request.url === "/start") {
        response.writeHead(302, {
          Location: "/result",
          "Set-Cookie": "redirect=yes; Path=/; HttpOnly",
        });
        response.end();
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        request.headers.cookie === "redirect=yes"
          ? "<p>cookie received</p>"
          : "<p>cookie missing</p>",
      );
    });
    server.listen(0, "127.0.0.1");
    try {
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Fixture did not bind a TCP port");
      const origin = `http://127.0.0.1:${address.port}`;

      // When: the initial URL has a fragment and the redirect does not replace it.
      const dom = await JSDOM.fromURL(origin + "/start#retained");

      // Then: the server received the cookie, but script cannot read the HttpOnly value.
      try {
        expect(dom.window.document.URL).toBe(origin + "/result#retained");
        expect(dom.window.document.body?.textContent).toBe("cookie received");
        expect(dom.window.document.cookie).toBe("");
      } finally {
        dom.window.close();
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

describe("JSDOM external scripts", () => {
  it("runs an intercepted script before the following inline script", async () => {
    // Given: a document with one intercepted external script.
    const { requestInterceptor } = await import("@run-dom/jsdom");
    let target: object | null = null;
    const dom = new JSDOM(
      '<body><script src="/first.js"></script><script>document.body.setAttribute("data-second", document.body.getAttribute("data-first"))</script>',
      {
        url: "https://example.test/",
        runScripts: "dangerously",
        resources: {
          interceptors: [
            requestInterceptor((request, { element }) => {
              expect(request.url).toBe("https://example.test/first.js");
              target = element;
              return new Response('document.body.setAttribute("data-first", "ran")');
            }),
          ],
        },
      },
    );

    // When: the document finishes loading.
    try {
      await new Promise<void>((resolve) =>
        dom.window.addEventListener("load", () => resolve(), { once: true }),
      );

      // Then: the inline script observes the prior side effect and the interceptor saw the actual element.
      expect(dom.window.document.body?.getAttribute("data-second")).toBe("ran");
      expect(target).toBe(dom.window.document.querySelector("script"));
    } finally {
      dom.window.close();
    }
  });
});
