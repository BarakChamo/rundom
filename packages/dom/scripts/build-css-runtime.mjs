// Bundles CSS capabilities with one declared color backend, and the pinned CSS reference as a separate lazy graph.
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

import { deferredCssProperties } from "./build-css-properties.mjs";
import { serializeCssTreeData } from "./css-tree-data.mjs";

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
      // css-tree's data module evaluates every mdn-data entry (descriptions, URLs, statuses) and
      // patches it on each process start, but its lexer reads only the patched syntax strings.
      // Embed that result; css-tree-data.test.ts compares it with the module's own output.
      name: "precomputed-css-tree-data",
      setup(build) {
        build.onLoad({ filter: /[\\/]css-tree[\\/]cjs[\\/]data\.cjs$/ }, ({ path }) => ({
          contents: `module.exports = ${serializeCssTreeData(createRequire(path)(path))};`,
          loader: "js",
        }));
      },
    },
    {
      // cssstyle forks a second css-tree lexer when its parser module loads, although declaration
      // classes and property tables never use it. Fork on the first parse or match instead.
      name: "lazy-cssstyle-lexer",
      setup(build) {
        build.onLoad({ filter: /[\\/]cssstyle[\\/]lib[\\/]parsers\.js$/ }, ({ path }) => {
          const eager = "const cssTree = csstree.fork(syntaxes);";
          const source = readFileSync(path, "utf8");
          const uses = source.match(/\bcssTree\b(?!\s*=)(?:\s*\.\s*\w+)?/g) ?? [];
          if (
            source.split(eager).length !== 2 ||
            !uses.every((use) => /\.\s*(?:parse|generate|lexer)$/.test(use))
          )
            throw new Error(`Unexpected cssstyle lexer use in ${path}`);
          return {
            contents: source.replace(
              eager,
              "let forked;\nconst cssTree = { get parse() { return (forked ??= csstree.fork(syntaxes)).parse; }, get generate() { return (forked ??= csstree.fork(syntaxes)).generate; }, get lexer() { return (forked ??= csstree.fork(syntaxes)).lexer; } };",
            ),
            loader: "js",
          };
        });
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
// The reference graph is partitioned so each first use loads only what it needs: reading interface
// objects loads the generated IDL wrappers RunDOM names (css-reference-interfaces), resolving simple
// declarations loads the property tables (css-reference-properties), and everything else ships as
// the engine (css-reference). Requests that cross artifacts become proxies to the owning artifact's
// load(), keeping one reference module graph.
const referencePrefix = "rundom-css-reference/";
const packageRoot = dirname(
  realpathSync(fileURLToPath(import.meta.resolve("rundom-css-reference/package.json"))),
);
const packagePath = (path) => relative(packageRoot, path).split(sep).join("/");
const propertyRoots = [
  "lib/generated/css-property-definitions.js",
  "lib/jsdom/living/css/properties/shorthands.js",
];

// The whole reference graph, built once in memory, gives the import edges the partition follows.
const graph = await Bun.build({
  entrypoints: [referenceEntry],
  target: "node",
  format: "cjs",
  packages: "bundle",
  metafile: true,
  plugins: referencePlugins,
});
if (!graph.success) throw new AggregateError(graph.logs, "CSS reference graph failed");
const files = new Map(
  Object.entries(graph.metafile.inputs)
    .filter(([input]) => existsSync(input))
    .map(([input, { imports }]) => [realpathSync(resolve(input)), imports]),
);
const importsOf = (file) =>
  files
    .get(file)
    .filter(({ path, external }) => !external && existsSync(path))
    .map(({ path }) => realpathSync(resolve(path)))
    .filter((path) => files.has(path));
function closure(roots, follows) {
  const reached = new Set(roots);
  for (const file of reached)
    for (const imported of importsOf(file)) if (follows(imported)) reached.add(imported);
  return reached;
}
const wrapperDirectory = join(packageRoot, "lib", "generated", "idl") + sep;
const isWrapper = (file) => file.startsWith(wrapperDirectory);
// Wrappers defer their implementation imports, so the interface closure follows wrappers only;
// the 1.6 MB CSSStyleProperties wrapper stays with the engine that creates it.
const interfaceFiles = closure(importsOf(referenceEntry).filter(isWrapper), isWrapper);
const propertyFiles = closure(
  propertyRoots.map((path) => join(packageRoot, path)),
  (file) => file.startsWith(packageRoot + sep),
);
if (
  [...propertyFiles].some(isWrapper) ||
  [...propertyFiles].some((file) => interfaceFiles.has(file))
)
  throw new Error("CSS reference property tables unexpectedly import interfaces");
const artifactOf = (file) =>
  interfaceFiles.has(file)
    ? "css-reference-interfaces"
    : propertyFiles.has(file)
      ? "css-reference-properties"
      : "css-reference";
const requests = new Map([["css-reference", new Set()]]);

function crossArtifactRequests(own) {
  const namespace = "css-reference-artifact";
  return {
    name: `requests-from-${own}`,
    setup(build) {
      build.onResolve({ filter: /^\.\/css-reference(?:-[a-z]+)?\.cjs$/ }, ({ path }) => ({
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
        if (!file.startsWith(packageRoot + sep) || artifactOf(file) === own) return;
        const target = artifactOf(file);
        requests.get(target)?.add(packagePath(file));
        return { path: `${target}:${packagePath(file)}`, namespace };
      });
      build.onLoad({ filter: /.*/, namespace }, ({ path }) => {
        const [target, request] = path.split(":");
        return {
          contents: `module.exports = require("./${target}.cjs").load(${JSON.stringify(request)});`,
          loader: "js",
        };
      });
    },
  };
}

const tableArtifacts = {
  "css-reference-interfaces": interfaceFiles,
  "css-reference-properties": propertyFiles,
};
const tablePaths = {};
for (const [name, members] of Object.entries(tableArtifacts)) {
  const paths = (tablePaths[name] = [...members].map(packagePath).sort());
  const entry = `${name}-entry`;
  const built = await Bun.build({
    entrypoints: [entry],
    outdir: "dist",
    naming: `${name}-implementation.cjs`,
    target: "node",
    format: "cjs",
    packages: "bundle",
    // Identifier minification renames generated interface classes, whose names are observable.
    minify: { whitespace: true, syntax: true },
    sourcemap: "linked",
    plugins: [
      {
        name: "table-entry",
        setup(build) {
          build.onResolve({ filter: new RegExp(`^${entry}$`) }, ({ path }) => ({
            path,
            namespace: entry,
          }));
          build.onLoad({ filter: /.*/, namespace: entry }, () => ({
            contents: `const modules = {\n${paths
              .map(
                (path) =>
                  `  ${JSON.stringify(path)}: () => require(${JSON.stringify(join(packageRoot, path))}),`,
              )
              .join("\n")}\n};
module.exports = {
  has: (path) => Object.hasOwn(modules, path),
  load(path) {
    const loadModule = Object.hasOwn(modules, path) ? modules[path] : undefined;
    if (!loadModule) throw new Error(\`RunDOM does not bundle CSS reference module \${path} in ${name}\`);
    return loadModule();
  },
};
`,
            loader: "js",
            resolveDir: packageRoot,
          }));
        },
      },
      crossArtifactRequests(name),
      ...referencePlugins,
    ],
  });
  if (!built.success) throw new AggregateError(built.logs, `${name} build failed`);
}
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
          contents: `${readFileSync(path, "utf8")}\nObject.assign(modules, {\n${[
            ...requests.get("css-reference"),
          ]
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
    crossArtifactRequests("css-reference"),
    ...referencePlugins,
  ],
});
if (!reference.success) throw new AggregateError(reference.logs, "CSS reference build failed");

execFileSync("node", ["scripts/build-css-cache.mjs", JSON.stringify(tablePaths)], {
  stdio: "inherit",
});
