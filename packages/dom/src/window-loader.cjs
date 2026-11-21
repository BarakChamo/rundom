// Loads optional build-host V8 compilation data for the CommonJS Window implementation.
const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { createRequire, getSourceMapsSupport, wrap } = require("node:module");
const { Script } = require("node:vm");

const filename = __dirname + "/window-implementation.cjs";
const cachefile = __dirname + "/window.cache";
if (getSourceMapsSupport?.().enabled || !existsSync(cachefile)) {
  module.exports = require("./window-implementation.cjs");
} else {
  const source = readFileSync(filename, "utf8");
  const cache = readFileSync(cachefile);
  const digest = createHash("sha256").update(source).digest();
  const cachedData = cache.subarray(0, digest.length).equals(digest)
    ? cache.subarray(digest.length)
    : undefined;
  const script = cachedData && new Script(wrap(source), { filename, cachedData });
  if (!script || script.cachedDataRejected) {
    module.exports = require("./window-implementation.cjs");
  } else {
    Reflect.apply(script.runInThisContext(), module.exports, [
      module.exports,
      createRequire(filename),
      module,
      filename,
      __dirname,
    ]);
  }
}
