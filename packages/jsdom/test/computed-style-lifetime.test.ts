// Checks that computed-style caches and ancestor projections do not keep removed stylesheet owners alive.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));

describe("Window.getComputedStyle lifetime", () => {
  it("releases removed style elements after repeated reads through literal ancestor frames", () => {
    // Given: nested elements whose ancestors carry literal non-inherited declarations, so
    //   their frames resolve as independent ancestor projections
    // When: each round inserts a replacement <style>, removes the previous one, reads a
    //   computed value on the leaf and keeps only the latest computed declaration
    // Then: every removed <style> element is collectable; only the frame cache bound applies
    execFileSync(
      process.execPath,
      [
        "--expose-gc",
        "-e",
        `
        const assert = require("node:assert/strict");
        const { setImmediate: turn } = require("node:timers/promises");
        const { JSDOM } = require(process.argv[1]);
        const { window } = new JSDOM(
          '<div class="a"><div class="b"><span class="c">x</span></div></div>',
        );
        const doc = window.document;
        (async () => {
          const removed = [];
          let previous;
          let held;
          for (let i = 0; i < 300; i++) {
            const style = doc.createElement("style");
            style.textContent =
              ".a{margin:" + i + "px;display:block} .b{padding:" + i + "px} .c{color:rgb(" + (i % 256) + ",0,0)}";
            doc.head.append(style);
            if (previous) {
              removed.push(new WeakRef(previous));
              previous.remove();
            }
            previous = style;
            held = window.getComputedStyle(doc.querySelector(".c"));
            assert.equal(held.color, "rgb(" + (i % 256) + ", 0, 0)");
            await turn();
          }
          for (let i = 0; i < 5; i++) {
            await turn();
            global.gc();
          }
          const alive = removed.filter((ref) => ref.deref() !== undefined).length;
          assert.equal(alive, 0, alive + " of " + removed.length + " removed style elements are still reachable");
          assert.equal(held.length > 0, true);
        })().finally(() => window.close());
        `,
        entry,
      ],
      { timeout: 30000 },
    );
  });
});
