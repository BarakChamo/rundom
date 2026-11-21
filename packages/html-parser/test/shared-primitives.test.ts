// Preserves the package's shared Result constructors through built CommonJS boundary packaging.
import { createRequire } from "node:module";
import { Err, Ok, ResultAsync, err, ok } from "neverthrow";
import { describe, expect, it } from "vitest";
const api: Pick<typeof import("../src/index.js"), "ok" | "err" | "ResultAsync"> = createRequire(
  import.meta.url,
)("@run-dom/html-parser");
describe("built native parser shared primitives", () => {
  it("preserves the installed Result constructors instead of embedding private copies", () => {
    // Given: downstream code imports the shared Result package and the built native boundary.
    // When/Then: values and exported helpers retain their common constructor identities.
    expect(api.ok(1)).toBeInstanceOf(Ok);
    expect(api.err("fixture")).toBeInstanceOf(Err);
    expect(api.ResultAsync).toBe(ResultAsync);
    expect(api.ok).toBe(ok);
    expect(api.err).toBe(err);
  });
});
