// Publishes facade declarations and derives available standard-global bindings from the built runtime.
import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "../dist/jsdom.js";
const dom = new JSDOM("", { runScripts: "outside-only" });
const names = new Set();
try {
  // The finite prototype chain ends at Object.prototype; own accessors need not be invoked.
  for (
    let object = dom.window;
    object && object !== Object.prototype;
    object = Object.getPrototypeOf(object)
  ) {
    for (const name of Object.getOwnPropertyNames(object)) names.add(name);
  }
} finally {
  dom.window.close();
}
const bindingType =
  "// Generated from the built Window property names; standard library types own the binding signatures.\nexport type WindowBindingNames =\n" +
  [...names]
    .sort()
    .map((name) => `  | ${JSON.stringify(name)}`)
    .join("\n") +
  ";\n";
const facade = readFileSync(new URL("../types/jsdom.d.ts", import.meta.url), "utf8");
for (const extension of ["mts", "cts"]) {
  const moduleExtension = extension === "mts" ? "mjs" : "cjs";
  writeFileSync(new URL(`../dist/window-bindings.d.${extension}`, import.meta.url), bindingType);
  writeFileSync(
    new URL(`../dist/jsdom.d.${extension}`, import.meta.url),
    facade.replace("./window-bindings.mjs", `./window-bindings.${moduleExtension}`),
  );
}
