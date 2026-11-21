// Isolates addon transport failures without substituting for real native parser qualification.
import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => {
  vi.doUnmock("node:module");
  vi.resetModules();
});

describe.each(["parseHTML", "parseHTMLArena"] as const)("%s native failures", (operation) => {
  it("returns a typed error when the requested platform addon is unavailable", async () => {
    // Given: the loader reports the declared native module-not-found condition.
    vi.doMock("node:module", () => ({
      createRequire: () => () => {
        throw Object.assign(new Error("missing native addon"), { code: "MODULE_NOT_FOUND" });
      },
    }));
    vi.resetModules();
    const parseHTML = (await import("../src/index.js"))[operation];
    const result = parseHTML({ markup: "<p>text</p>", scriptingEnabled: false });
    expect(result.isErr() && result.error.type).toBe("addon_unavailable");
  });

  for (const payload of [undefined, 123, "{bad json", JSON.stringify({ version: 2, nodes: [] })]) {
    it(`rejects an invalid addon response: ${String(payload)}`, async () => {
      // Given: an invalid provider shape or payload must not enter private tree allocation.
      vi.doMock("node:module", () => ({
        createRequire: () => () =>
          payload === undefined ? {} : { parseDocumentSnapshot: () => payload },
      }));
      vi.resetModules();
      const parseHTML = (await import("../src/index.js"))[operation];
      const result = parseHTML({ markup: "<p>text</p>", scriptingEnabled: false });
      expect(result.isErr() && result.error.type).toBe("invalid_snapshot");
    });
  }

  it("does not launder unexpected loader failures into capability fallback", async () => {
    // Given/When/Then: producer bugs remain visible rather than selecting another parser.
    const cause = new RangeError("broken producer loader");
    vi.doMock("node:module", () => ({
      createRequire: () => () => {
        throw cause;
      },
    }));
    vi.resetModules();
    const parseHTML = (await import("../src/index.js"))[operation];
    expect(() => parseHTML({ markup: "<p>text</p>", scriptingEnabled: false })).toThrow(cause);
  });

  it("returns invalid_request for the addon's declared compact range limit", async () => {
    // Given/When/Then: a native range limit is recoverable without laundering unexpected exceptions.
    vi.doMock("node:module", () => ({
      createRequire: () => () => ({
        parseDocumentSnapshot: () => {
          throw Object.assign(new Error("snapshot range limit"), { code: "InvalidArg" });
        },
      }),
    }));
    vi.resetModules();
    const parseHTML = (await import("../src/index.js"))[operation];
    const result = parseHTML({ markup: "<p>text</p>", scriptingEnabled: false });
    expect(result.isErr() && result.error.type).toBe("invalid_request");
  });

  it("does not launder unexpected native invocation failures into invalid_request", async () => {
    // Given/When/Then: only the declared native range status is translated at this seam.
    const cause = new RangeError("broken native producer");
    vi.doMock("node:module", () => ({
      createRequire: () => () => ({
        parseDocumentSnapshot: () => {
          throw cause;
        },
      }),
    }));
    vi.resetModules();
    const parseHTML = (await import("../src/index.js"))[operation];
    expect(() => parseHTML({ markup: "<p>text</p>", scriptingEnabled: false })).toThrow(cause);
  });
});
