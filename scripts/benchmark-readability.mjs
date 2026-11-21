// Measures the upstream article extraction pipeline separately from Mocha's DOM comparisons.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { setImmediate } from "node:timers/promises";

const [project, provider] = process.argv.slice(2);
if (!project || typeof global.gc !== "function") {
  throw new Error(
    "Usage: node --expose-gc scripts/benchmark-readability.mjs <Readability checkout> [jsdom entry file]",
  );
}
const upstream = createRequire(resolve(project, "package.json"));
const entry = upstream.resolve(provider ? resolve(provider) : "jsdom");
const { JSDOM } = upstream(entry);
const { Readability } = upstream("./index");
const { getTestPages } = upstream("./test/utils");
const digest = createHash("sha256");

function extractPages() {
  const fixtures = getTestPages();
  let constructMs = 0;
  let extractMs = 0;
  let closeMs = 0;
  for (const { dir, source } of fixtures) {
    const started = performance.now();
    const { window } = new JSDOM(source, { url: "http://fakehost/test/page.html" });
    constructMs += performance.now() - started;
    try {
      const parsing = performance.now();
      const article = new Readability(window.document, { classesToPreserve: ["caption"] }).parse();
      extractMs += performance.now() - parsing;
      if (!article) throw new Error("No article extracted from " + dir);
      digest.update(JSON.stringify([dir, article]));
    } finally {
      const closing = performance.now();
      window.close();
      closeMs += performance.now() - closing;
    }
  }
  return { articles: fixtures.length, constructMs, extractMs, closeMs };
}

function collectedHeapBytes() {
  global.gc();
  return process.memoryUsage().heapUsed;
}

const stages = extractPages();
const synchronousHeapBytes = collectedHeapBytes();
await setImmediate();
const nextTurnHeapBytes = collectedHeapBytes();
console.log(
  JSON.stringify({
    entry,
    ...stages,
    articleSHA256: digest.digest("hex"),
    synchronousHeapBytes,
    nextTurnHeapBytes,
    peakRSSKiB: process.resourceUsage().maxRSS,
  }),
);
