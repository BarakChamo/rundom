// Checks that the optional Window code cache preserves current source and CommonJS resolution.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Script } from "node:vm";
import { describe, expect, it } from "vitest";

describe("Window compilation data", () => {
  for (const mode of ["matched", "missing", "stale", "different-flags", "source-maps"] as const) {
    it(`loads the current Window implementation with ${mode} compilation data`, () => {
      // Given: the emitted Window entry, an implementation and its sibling dependency.
      const directory = mkdtempSync(join(tmpdir(), "run-dom-window-cache-"));
      const filename = join(directory, "window-implementation.cjs");
      const entry = join(directory, "window.cjs");
      const original =
        'module.exports = [require("./sibling.cjs"), __filename, this === exports, Boolean(require.cache[__filename])];';
      const current = mode === "stale" ? original.replace("this === exports", "false") : original;
      try {
        writeFileSync(join(directory, "sibling.cjs"), 'module.exports = "loaded";');
        writeFileSync(filename, current);
        copyFileSync(new URL("../src/window-loader.cjs", import.meta.url), entry);
        if (mode !== "missing") {
          const script = new Script(Module.wrap(original), { filename });
          writeFileSync(
            join(directory, "window.cache"),
            Buffer.concat([
              createHash("sha256").update(original).digest(),
              script.createCachedData(),
            ]),
          );
        }

        // When: a new Node process loads the CommonJS entry twice.
        const output = execFileSync(
          process.execPath,
          [
            ...(mode === "different-flags" ? ["--no-lazy"] : []),
            ...(mode === "source-maps" ? ["--enable-source-maps"] : []),
            "-e",
            "const first = require(process.argv[1]); console.log(JSON.stringify([first, first === require(process.argv[1])]));",
            entry,
          ],
          { encoding: "utf8" },
        );

        // Then: current source wins, and sibling resolution and require identity are preserved.
        expect(JSON.parse(output)).toEqual([
          ["loaded", realpathSync(filename), mode !== "stale", mode !== "matched"],
          true,
        ]);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});
