// Compiles the exact CommonJS Window bundle and warms the empty Window plus a test-like workload.
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { Script } from "node:vm";

import { encodeCachedBundle } from "./encode-cached-bundle.mjs";

const filename = resolve("dist/window-implementation.cjs");
encodeCachedBundle(filename);
const source = readFileSync(filename, "utf8");
const script = new Script(Module.wrap(source), { filename });
const module = { exports: {} };
Reflect.apply(script.runInThisContext(), module.exports, [
  module.exports,
  createRequire(filename),
  module,
  filename,
  dirname(filename),
]);
const { window } = module.exports.createWindow("");
window.close();
// Also compile what a test file runs first: reading every global (as Vitest does), building and
// querying a tree, events and innerHTML. Functions that ran are stored compiled, which cut whole
// process instructions through a test-like workload by about 6% despite the larger cache.
const primed = module.exports.createWindow(
  '<!doctype html><main id="app"><ul class="list"></ul><form><input name="q"><button>Go</button></form></main>',
).window;
for (const key of Object.getOwnPropertyNames(primed)) {
  try {
    Reflect.get(primed, key);
  } catch {
    // Opaque-origin storage getters throw; the compiled getter is what matters here.
  }
}
const document = primed.document;
const list = document.querySelector(".list");
for (let i = 0; i < 20; i++) {
  const item = document.createElement("li");
  item.className = "item i" + i;
  item.setAttribute("data-i", String(i));
  item.textContent = "row " + i;
  list.appendChild(item);
}
const button = document.querySelector("button");
button.addEventListener("click", (event) => event.preventDefault());
button.click();
document.querySelector("input").value = "hello";
document.querySelectorAll("li.item");
list.innerHTML = '<li><a href="/x">x</a></li><li><span>y</span></li>';
void document.body.textContent;
primed.close();
writeFileSync(
  "dist/window.cache",
  Buffer.concat([createHash("sha256").update(source).digest(), script.createCachedData()]),
);
copyFileSync("src/window-loader.cjs", "dist/window.cjs");
rmSync("dist/window.cjs.map", { force: true });
