// Compiles the exact CommonJS Window bundle and warms only the empty, script-disabled path.
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
writeFileSync(
  "dist/window.cache",
  Buffer.concat([createHash("sha256").update(source).digest(), script.createCachedData()]),
);
copyFileSync("src/window-loader.cjs", "dist/window.cjs");
rmSync("dist/window.cjs.map", { force: true });
