// Captures compilation only: runtime state is always reconstructed from the complete CSS implementation.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import Module, { createRequire } from "node:module";
import { Script } from "node:vm";
import { resolve, dirname } from "node:path";
import { encodeCachedBundle } from "./encode-cached-bundle.mjs";

const filename = resolve("dist/css-runtime-implementation.cjs");
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
// Compile initialization functions as well; the resulting cache contains code, never their mutable state.
for (const name of ["cssTree", "cssSelect", "cssColor", "cssValueParser", "cssStyle"])
  Reflect.get(module.exports, name);
writeFileSync(
  "dist/css-runtime.cache",
  Buffer.concat([createHash("sha256").update(source).digest(), script.createCachedData()]),
);
// Reflection needs the ordered accessor names without evaluating the CSS engine in each worker.
const basePrototype = createRequire(import.meta.url)("cssstyle").CSSStyleDeclaration.prototype;
const properties = Object.entries(Object.getOwnPropertyDescriptors(basePrototype))
  .filter(
    ([name, descriptor]) =>
      name !== "cssText" && !name.startsWith("_") && descriptor.get && descriptor.set,
  )
  .map(([name]) => name);
// New CSSOM IDL attributes can precede support in the cssstyle parser.
const { JSDOM } = createRequire(import.meta.url)("rundom-css-reference");
const { window } = new JSDOM();
for (const [name, descriptor] of Object.entries(
  Object.getOwnPropertyDescriptors(window.CSSStyleProperties.prototype),
)) {
  if (descriptor.get && descriptor.set && !properties.includes(name)) properties.push(name);
}
window.close();
writeFileSync("dist/css-property-names.cjs", `module.exports = ${JSON.stringify(properties)};\n`);
copyFileSync("src/css-runtime-loader.cjs", "dist/css-runtime.cjs");
