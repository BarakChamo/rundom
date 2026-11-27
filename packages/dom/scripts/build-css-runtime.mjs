// Bundles CSS capabilities with one declared color backend, and the pinned CSS reference as a separate lazy graph.
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

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

const referenceEntry = fileURLToPath(new URL("../src/css-reference-runtime.ts", import.meta.url));
const implementationImport = /^const Impl = require\(("[^"]+")\);$/m;
const reference = await Bun.build({
  entrypoints: [referenceEntry],
  outdir: "dist",
  naming: "css-reference-implementation.cjs",
  target: "node",
  format: "cjs",
  packages: "bundle",
  // Identifier minification renames generated interface classes, whose names are observable.
  minify: { whitespace: true, syntax: true },
  sourcemap: "linked",
  plugins: [
    {
      // Only CSSImportRule fetching reaches the resource dispatcher (and undici), which needs a
      // reference-owned style element that RunDOM never creates. Keep it a raw package request.
      name: "raw-resource-dispatcher",
      setup(build) {
        build.onResolve({ filter: /[\\/]browser[\\/]resources[\\/]jsdom-dispatcher$/ }, () => ({
          path: "rundom-css-reference/lib/jsdom/browser/resources/jsdom-dispatcher.js",
          external: true,
        }));
      },
    },
    {
      // Generated IDL wrappers only touch Impl.implementation and Impl.init after construction,
      // so deferring the import lets interface installation run without the CSS engine.
      name: "deferred-idl-implementations",
      setup(build) {
        build.onLoad({ filter: /[\\/]lib[\\/]generated[\\/]idl[\\/][^\\/]+\.js$/ }, ({ path }) => {
          const source = readFileSync(path, "utf8");
          if (!source.includes("Impl.")) return { contents: source, loader: "js" };
          const deferred = source.replace(
            implementationImport,
            (_, request) =>
              `let $deferredImpl;\nconst Impl = { get implementation() { return ($deferredImpl ??= require(${request})).implementation; }, get init() { return ($deferredImpl ??= require(${request})).init; } };`,
          );
          if (deferred === source || /Impl\.(?!implementation\b|init\b)/.test(source))
            throw new Error(`Unexpected generated IDL implementation shape in ${path}`);
          return { contents: deferred, loader: "js" };
        });
      },
    },
    {
      // cssom.js loads concrete rule interfaces by name; enumerate the names its rule definitions declare.
      name: "static-rule-interfaces",
      setup(build) {
        build.onLoad({ filter: /[\\/]living[\\/]css[\\/]utils[\\/]cssom\.js$/ }, ({ path }) => {
          const rules = new URL("../rules/", `file://${path}`);
          const names = new Set();
          for (const file of readdirSync(rules))
            for (const [, name] of readFileSync(new URL(file, rules), "utf8").matchAll(
              /cssom: "(\w+)"/g,
            ))
              names.add(name);
          const dynamic = "require(`../../../../generated/idl/${syntax.definition.cssom}.js`)";
          const source = readFileSync(path, "utf8");
          if (source.split(dynamic).length !== 2)
            throw new Error(`Unexpected rule interface loading in ${path}`);
          const table = [...names]
            .map((name) => `${name}: () => require("../../../../generated/idl/${name}.js")`)
            .join(", ");
          return {
            contents: source.replace(dynamic, `({ ${table} })[syntax.definition.cssom]()`),
            loader: "js",
          };
        });
      },
    },
    {
      name: "reference-grammar-marker",
      setup(build) {
        build.onLoad({ filter: /[\\/]living[\\/]css[\\/]parse[\\/]parser\.js$/ }, ({ path }) => ({
          contents: `${readFileSync(path, "utf8")}\nrequire(${JSON.stringify(referenceEntry)}).grammarInitialized = true;\n`,
          loader: "js",
        }));
      },
    },
  ],
});
if (!reference.success) throw new AggregateError(reference.logs, "CSS reference build failed");

execFileSync("node", ["scripts/build-css-cache.mjs"], { stdio: "inherit" });
