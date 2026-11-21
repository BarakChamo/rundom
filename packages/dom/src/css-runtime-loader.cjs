// Loads optional build-host compilation data; V8 rejects incompatible caches and compiles the original source.
const { readFileSync, existsSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { createRequire, wrap } = require("node:module");
const { Script } = require("node:vm");
const filename = __dirname + "/css-runtime-implementation.cjs";
const source = readFileSync(filename, "utf8");
const cachefile = __dirname + "/css-runtime.cache";
const cache = existsSync(cachefile) ? readFileSync(cachefile) : undefined;
const digest = createHash("sha256").update(source).digest();
const cachedData = cache?.subarray(0, 32).equals(digest) ? cache.subarray(32) : undefined;
const script = new Script(wrap(source), { filename, cachedData });
Reflect.apply(script.runInThisContext(), module.exports, [
  module.exports,
  createRequire(filename),
  module,
  filename,
  __dirname,
]);
