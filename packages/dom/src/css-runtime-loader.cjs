// Loads optional build-host compilation data; V8 rejects incompatible caches and compiles the original source.
const { readFileSync, existsSync } = require("node:fs");
const { isAscii } = require("node:buffer");
const { hash } = require("node:crypto");
const { createRequire, wrap } = require("node:module");
const { Script } = require("node:vm");
// Serves every code-cached CSS artifact: <name>.cjs loads <name>-implementation.cjs with <name>.cache.
const artifact = __filename.slice(0, -".cjs".length);
const filename = artifact + "-implementation.cjs";
// Hash the file bytes (the UTF-8 the digest was built from) and decode ASCII builds as latin1;
// both avoid re-encoding a multi-megabyte string on every process start.
const bytes = readFileSync(filename);
const source = isAscii(bytes) ? bytes.latin1Slice(0, bytes.length) : bytes.toString("utf8");
const cachefile = artifact + ".cache";
const cache = existsSync(cachefile) ? readFileSync(cachefile) : undefined;
const digest = hash("sha256", bytes, "buffer");
const cachedData = cache?.subarray(0, 32).equals(digest) ? cache.subarray(32) : undefined;
const script = new Script(wrap(source), { filename, cachedData });
Reflect.apply(script.runInThisContext(), module.exports, [
  module.exports,
  createRequire(filename),
  module,
  filename,
  __dirname,
]);
