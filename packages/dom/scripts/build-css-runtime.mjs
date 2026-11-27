// Bundles CSS capabilities with one declared color backend, and the pinned CSS reference as a separate lazy graph.
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

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
const reactionStepImport =
  /^const (\w+) =\n {2}require\(("[^"]+[\\/]custom-elements\.js")\)\.(\w+);$/gm;
const referencePlugins = [
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
    // and call CEReactions steps only from methods, so deferring both imports lets interface
    // installation run without the CSS engine or the DOM helpers.
    name: "deferred-idl-implementations",
    setup(build) {
      build.onLoad({ filter: /[\\/]lib[\\/]generated[\\/]idl[\\/][^\\/]+\.js$/ }, ({ path }) => {
        const source = readFileSync(path, "utf8").replace(
          reactionStepImport,
          (_, name, request, step) =>
            `let $${name};\nconst ${name} = (...args) => ($${name} ??= require(${request}).${step})(...args);`,
        );
        if (/^\s*require\("[^"]+custom-elements\.js"\)/m.test(source))
          throw new Error(`Unexpected generated CEReactions shape in ${path}`);
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
];
// Reading interface objects must not load the CSS engine, so the generated IDL wrappers RunDOM
// names ship as css-reference-interfaces and everything else as css-reference. Requests that cross
// between the two become proxies to the other artifact's load(), keeping one reference module graph.
const referencePrefix = "rundom-css-reference/";
const packageRoot = dirname(
  realpathSync(fileURLToPath(import.meta.resolve("rundom-css-reference/package.json"))),
);
const packagePath = (path) => relative(packageRoot, path).split(sep).join("/");
function crossArtifactRequests(target, crosses, requested) {
  const namespace = "css-reference-artifact";
  return {
    name: `requests-into-${target}`,
    setup(build) {
      build.onResolve({ filter: /^\.\/css-reference(?:-interfaces)?\.cjs$/ }, ({ path }) => ({
        path,
        external: true,
      }));
      build.onResolve({ filter: /^(?:\.\.?\/|rundom-css-reference\/)/ }, ({ path, importer }) => {
        const file = realpathSync(
          createRequire(importer).resolve(
            path.startsWith(referencePrefix)
              ? join(packageRoot, path.slice(referencePrefix.length))
              : path,
          ),
        );
        if (!crosses(file)) return;
        requested.add(packagePath(file));
        return { path: packagePath(file), namespace };
      });
      build.onLoad({ filter: /.*/, namespace }, ({ path }) => ({
        contents: `module.exports = require("./${target}.cjs").load(${JSON.stringify(path)});`,
        loader: "js",
      }));
    },
  };
}
// The whole reference graph, built once in memory, tells which wrappers RunDOM names and what they import.
const graph = await Bun.build({
  entrypoints: [referenceEntry],
  target: "node",
  format: "cjs",
  packages: "bundle",
  metafile: true,
  plugins: referencePlugins,
});
if (!graph.success) throw new AggregateError(graph.logs, "CSS reference graph failed");
// Interfaces are the wrappers RunDOM names plus the wrappers they import; the rest (notably the
// 1.6 MB CSSStyleProperties wrapper) stay with the engine that creates them.
const wrapperDirectory = join(packageRoot, "lib", "generated", "idl") + sep;
const inputFile = (input) => realpathSync(resolve(input));
const wrapperInputs = Object.entries(graph.metafile.inputs).filter(
  ([input]) => existsSync(input) && inputFile(input).startsWith(wrapperDirectory),
);
const wrapperImports = new Map(
  wrapperInputs.map(([input, { imports }]) => [input, imports.map(({ path }) => path)]),
);
const interfaceInputs = new Set(
  graph.metafile.inputs[relative(process.cwd(), referenceEntry)].imports
    .map(({ path }) => path)
    .filter((input) => wrapperImports.has(input)),
);
for (const input of interfaceInputs)
  for (const imported of wrapperImports.get(input))
    if (wrapperImports.has(imported)) interfaceInputs.add(imported);
const interfaceFiles = new Set([...interfaceInputs].map(inputFile));
const isInterface = (file) => interfaceFiles.has(file);
const interfacePaths = [...interfaceFiles].map(packagePath).sort();
const engineRequests = new Set();
const interfaceEntry = "css-reference-interfaces-entry";
const interfaces = await Bun.build({
  entrypoints: [interfaceEntry],
  outdir: "dist",
  naming: "css-reference-interfaces-implementation.cjs",
  target: "node",
  format: "cjs",
  packages: "bundle",
  minify: { whitespace: true, syntax: true },
  sourcemap: "linked",
  plugins: [
    {
      name: "interface-entry",
      setup(build) {
        build.onResolve({ filter: new RegExp(`^${interfaceEntry}$`) }, ({ path }) => ({
          path,
          namespace: interfaceEntry,
        }));
        build.onLoad({ filter: /.*/, namespace: interfaceEntry }, () => ({
          contents: `const modules = {\n${interfacePaths
            .map(
              (path) =>
                `  ${JSON.stringify(path)}: () => require(${JSON.stringify(join(packageRoot, path))}),`,
            )
            .join("\n")}\n};
module.exports = {
  load(path) {
    const loadModule = Object.hasOwn(modules, path) ? modules[path] : undefined;
    if (!loadModule) throw new Error(\`RunDOM does not bundle CSS reference interface \${path}\`);
    return loadModule();
  },
};
`,
          loader: "js",
          resolveDir: packageRoot,
        }));
      },
    },
    crossArtifactRequests(
      "css-reference",
      (file) => !isInterface(file) && file.startsWith(packageRoot + sep),
      engineRequests,
    ),
    ...referencePlugins,
  ],
});
if (!interfaces.success)
  throw new AggregateError(interfaces.logs, "CSS reference interface build failed");
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
      // Interface wrappers reach implementation modules RunDOM never names; serve them as well.
      name: "interface-implementations",
      setup(build) {
        build.onLoad({ filter: /[\\/]src[\\/]css-reference-runtime\.ts$/ }, ({ path }) => ({
          contents: `${readFileSync(path, "utf8")}\nObject.assign(modules, {\n${[...engineRequests]
            .sort()
            .map(
              (request) =>
                `  ${JSON.stringify(request)}: () => require(${JSON.stringify(referencePrefix + request)}),`,
            )
            .join("\n")}\n});\n`,
          loader: "ts",
        }));
      },
    },
    crossArtifactRequests("css-reference-interfaces", isInterface, new Set()),
    ...referencePlugins,
  ],
});
if (!reference.success) throw new AggregateError(reference.logs, "CSS reference build failed");

execFileSync("node", ["scripts/build-css-cache.mjs", JSON.stringify(interfacePaths)], {
  stdio: "inherit",
});
