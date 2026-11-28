// Checks that per-node side data does not promote discarded DOM trees out of the young generation.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));

/** Runs `operation` (a function body over `document`) many times and returns promoted KiB per run. */
function promotedPerOperation(operation: string): number {
  const output = execFileSync(
    process.execPath,
    [
      "--max-semi-space-size=8",
      "-e",
      `
      const v8 = require("node:v8");
      const { JSDOM } = require(process.argv[1]);
      const { window } = new JSDOM("<!doctype html><body><div id=host></div></body>");
      const document = window.document;
      const operation = new Function("document", process.argv[2]);
      for (let i = 0; i < 100; i++) operation(document);
      const profiler = new v8.GCProfiler();
      profiler.start();
      const runs = 300;
      for (let i = 0; i < runs; i++) operation(document);
      const old = (s) => s.heapSpaceStatistics.find((space) => space.spaceName === "old_space").spaceUsedSize;
      let promoted = 0;
      for (const gc of profiler.stop().statistics)
        if (gc.gcType === "Scavenge") promoted += old(gc.afterGC) - old(gc.beforeGC);
      window.close();
      process.stdout.write(String(promoted / runs / 1024));
      `,
      entry,
      operation,
    ],
    { encoding: "utf8", timeout: 60000 },
  );
  return Number(output);
}

describe("Node side data lifetime", () => {
  it("lets a replaced tree read through querySelectorAll die in a minor GC", () => {
    // Given: a host whose 128-row content is replaced on every run
    // When: each run reads the new rows through a querySelectorAll NodeList and drops it
    // Then: scavenges promote almost nothing, because the NodeList brand does not hold the rows
    const promoted = promotedPerOperation(`
      const host = document.getElementById("host");
      host.innerHTML = "<p>row</p>".repeat(128);
      const rows = host.querySelectorAll("p");
      if (rows.length !== 128 || rows[127].textContent !== "row") throw new Error("bad rows");
    `);
    expect(promoted).toBeLessThan(4);
  }, 60000);

  it("lets a discarded tree with token lists, child lists and datasets die in a minor GC", () => {
    // Given: a detached tree of 160 elements built with createElement
    // When: every element gets a classList token, a childNodes/children read and a dataset
    //   entry, and the tree is mounted, unmounted and dropped
    // Then: scavenges promote almost nothing
    const promoted = promotedPerOperation(`
      const root = document.createElement("div");
      for (let i = 0; i < 40; i++) {
        const row = document.createElement("div");
        for (let j = 0; j < 4; j++) {
          const span = document.createElement("span");
          span.appendChild(document.createTextNode("t" + i));
          span.classList.add("x");
          span.dataset.row = String(i);
          void span.childNodes.length;
          void span.children.length;
          row.appendChild(span);
        }
        root.appendChild(row);
      }
      document.body.appendChild(root);
      document.body.removeChild(root);
    `);
    expect(promoted).toBeLessThan(4);
  }, 60000);

  it("lets a discarded tree with inline styles die in a minor GC", () => {
    // Given: a detached tree of 160 elements built with createElement
    // When: every element writes and reads an inline style property, one element is
    //   materialized through setAttribute, and the tree is mounted, unmounted and dropped
    // Then: scavenges promote almost nothing, because inline style views do not hold the tree
    const promoted = promotedPerOperation(`
      const root = document.createElement("div");
      for (let i = 0; i < 40; i++) {
        const row = document.createElement("div");
        for (let j = 0; j < 4; j++) {
          const span = document.createElement("span");
          span.style.color = "red";
          if (span.style.color !== "red") throw new Error("bad style");
          row.appendChild(span);
        }
        row.setAttribute("style", "width: 1px");
        void row.style.width;
        root.appendChild(row);
      }
      document.body.appendChild(root);
      document.body.removeChild(root);
    `);
    expect(promoted).toBeLessThan(4);
  }, 60000);
});
