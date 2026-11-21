// Builds one host Node-API artifact; native task caching stays disabled until target keys are portable.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const directory = fileURLToPath(new URL("../", import.meta.url));
const run = (name, args) => execFileSync(name, args, { cwd: directory, stdio: "inherit" });
const rust = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
const target = /^host: (.+)$/m.exec(rust)?.[1];
if (!target) throw new Error("Rust compiler did not report its host target");
run("cargo", [
  "build",
  "--manifest-path",
  join(root, "Cargo.toml"),
  "-p",
  "run-dom-html-parser",
  "--release",
  "--target",
  target,
  "--locked",
]);
const library =
  process.platform === "win32"
    ? "run_dom_html_parser.dll"
    : process.platform === "darwin"
      ? "librun_dom_html_parser.dylib"
      : "librun_dom_html_parser.so";
mkdirSync(join(directory, "native"), { recursive: true });
mkdirSync(join(directory, "dist"), { recursive: true });
copyFileSync(
  join(root, "target", target, "release", library),
  join(directory, "native", `${process.platform}-${process.arch}.node`),
);
writeFileSync(
  join(directory, "native", "build.json"),
  JSON.stringify(
    { platform: process.platform, arch: process.arch, napi: 4, target, rust },
    null,
    2,
  ),
);
writeFileSync(
  join(directory, "dist", "index.js"),
  'import api from "./index.cjs"; export const {parseHTML,parseHTMLArena,decodeCompactSnapshot,compactSnapshotSchema,htmlSnapshotSchema,parseHTMLRequestSchema,parserSelectionSchema,parserFallbackReasonSchema,recordParserFallback,getParserStatistics,invariant,InvariantError,ok,err,ResultAsync}=api;\n',
);
run("bun", [
  "build",
  "src/index.ts",
  "--target=node",
  "--packages=bundle",
  "--external=neverthrow",
  "--minify-whitespace",
  "--minify-syntax",
  "--keep-names",
  "--format=cjs",
  "--outfile=dist/index-implementation.cjs",
  "--define",
  "import.meta.url=RUN_DOM_NATIVE_MODULE_URL",
  "--banner",
  'const RUN_DOM_NATIVE_MODULE_URL = require("node:url").pathToFileURL(__filename).href;',
]);
copyFileSync(join(directory, "src", "entry.cjs"), join(directory, "dist", "index.cjs"));
run(join(root, "node_modules", ".bin", "tsc"), [
  "-p",
  "tsconfig.build.json",
  "--noEmit",
  "false",
  "--declaration",
  "--emitDeclarationOnly",
  "--outDir",
  "dist",
]);
