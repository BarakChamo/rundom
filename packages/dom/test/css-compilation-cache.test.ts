// Verifies optional compilation data cannot replace current source or change CommonJS execution semantics.
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Script } from "node:vm";
import { describe, expect, it } from "vitest";

describe("optional CSS compilation data", () => {
  for (const mode of ["matched", "missing", "stale", "different-flags"] as const) {
    it(`executes current source with ${mode} compilation data`, () => {
      // Given: a complete CommonJS source and optional build-host compilation data.
      const directory = mkdtempSync(join(tmpdir(), "run-dom-css-cache-"));
      const original = 'module.exports = { value: "original", receiver: this === exports };';
      const current = mode === "stale" ? original.replace("original", "changed!") : original;
      try {
        const filename = join(directory, "css-runtime-implementation.cjs");
        writeFileSync(filename, current);
        const script = new Script(Module.wrap(original), { filename });
        if (mode !== "missing")
          writeFileSync(
            join(directory, "css-runtime.cache"),
            Buffer.concat([
              createHash("sha256").update(original).digest(),
              script.createCachedData(),
            ]),
          );
        copyFileSync(
          new URL("../src/css-runtime-loader.cjs", import.meta.url),
          join(directory, "css-runtime.cjs"),
        );
        // When: ordinary CJS loading consumes the optional cache, including incompatible V8 flags.
        const output = execFileSync(
          process.execPath,
          [
            ...(mode === "different-flags" ? ["--no-lazy"] : []),
            "-e",
            "console.log(JSON.stringify(require(process.argv[1])))",
            join(directory, "css-runtime.cjs"),
          ],
          { encoding: "utf8" },
        );
        // Then: current source always wins, and the CommonJS receiver remains module.exports.
        expect(output.trim()).toBe(
          JSON.stringify({ value: mode === "stale" ? "changed!" : "original", receiver: true }),
        );
        expect(readFileSync(filename, "utf8")).toBe(current);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});
