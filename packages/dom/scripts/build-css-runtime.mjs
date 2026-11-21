// Bundles CSS capabilities with one declared color backend; reference dependencies stay unchanged.
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { deferredCssProperties } from "./build-css-properties.mjs";

const colorEntry = fileURLToPath(import.meta.resolve("@asamuzakjp/css-color"));
const cssTreeCjs = fileURLToPath(new URL("./cjs/", import.meta.resolve("css-tree/package.json")));
const parserError = fileURLToPath(new URL("../src/css-parser-error.ts", import.meta.url));
const result = await Bun.build({
  entrypoints: ["src/css-runtime.ts"],
  outdir: "dist",
  naming: "css-runtime-implementation.cjs",
  target: "node",
  format: "cjs",
  packages: "bundle",
  minify: { whitespace: true, syntax: true, identifiers: true, keepNames: true },
  sourcemap: "linked",
  define: { "import.meta.url": "RUN_DOM_MODULE_URL" },
  banner: 'const RUN_DOM_MODULE_URL = require("node:url").pathToFileURL(__filename).href;',
  plugins: [
    { name: "deferred-css-properties", setup: deferredCssProperties },
    {
      name: "declared-css-color",
      setup(build) {
        build.onResolve({ filter: /^@asamuzakjp\/css-color$/ }, () => ({ path: colorEntry }));
      },
    },
    {
      // css-tree copies its stack getter with Object.assign, which formats every
      // discarded syntax error. The bundled Node adapter captures the same call site lazily.
      name: "lazy-css-error-stacks",
      setup(build) {
        build.onResolve({ filter: /^\.\.\/utils\/create-custom-error\.cjs$/ }, ({ importer }) =>
          importer.startsWith(cssTreeCjs) ? { path: parserError } : undefined,
        );
      },
    },
  ],
});
if (!result.success) throw new AggregateError(result.logs, "CSS runtime build failed");

execFileSync("node", ["scripts/build-css-cache.mjs"], { stdio: "inherit" });
