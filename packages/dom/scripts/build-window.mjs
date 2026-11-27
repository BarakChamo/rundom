// Bundles the Window for ESM and CommonJS, routing CSS reference requests into the shared code-cached reference artifact.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const sources = fileURLToPath(new URL("../src/", import.meta.url));
const shim = sources + "css-reference-require.ts";
const routeReference = {
  name: "css-reference-require",
  setup(build) {
    build.onResolve({ filter: /^node:module$/ }, ({ importer }) =>
      importer.startsWith(sources) &&
      importer !== shim &&
      readFileSync(importer, "utf8").includes('"rundom-css-reference/')
        ? { path: shim }
        : undefined,
    );
  },
};
const shared = {
  entrypoints: ["src/window.ts"],
  outdir: "dist",
  target: "node",
  plugins: [routeReference],
};
const builds = [
  await Bun.build({ ...shared, format: "esm", naming: "window.js", packages: "external" }),
  await Bun.build({
    ...shared,
    format: "cjs",
    naming: "window-implementation.cjs",
    minify: { whitespace: true, syntax: true },
    sourcemap: "linked",
    define: { "import.meta.url": "RUN_DOM_MODULE_URL" },
    banner: 'const RUN_DOM_MODULE_URL = require("node:url").pathToFileURL(__filename).href;',
  }),
];
for (const result of builds)
  if (!result.success) throw new AggregateError(result.logs, "Window build failed");

// Every statically named reference request must be bundled; a raw fallback would split the module graph.
const reference = createRequire(import.meta.url)("../dist/css-reference.cjs");
const source = readFileSync("dist/window-implementation.cjs", "utf8");
for (const [, path] of source.matchAll(/"rundom-css-reference\/([^"]+\.js)"/g))
  reference.load(path);
if (source.includes('"rundom-css-reference/') && !source.includes("./css-reference.cjs"))
  throw new Error("Window bundle requests the CSS reference without the routing require");
