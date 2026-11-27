// Freezes packages and benchmark sources into isolated pinned consumers before any measurements start.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerDigest } from "./integrity.ts";
import { cohortSchema, type Cohort } from "./contracts.ts";

export const root = fileURLToPath(new URL("../../../../", import.meta.url));
const lab = fileURLToPath(new URL("./", import.meta.url));
const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "native" ||
      entry.name === ".turbo"
    )
      return [];
    return entry.isDirectory() ? files(path) : [path];
  });
}
/** Builds once, installs independent consumers, and writes immutable provenance; installation errors abort preparation. */
export function prepareCohort(options: { from?: string | undefined } = {}): Cohort {
  const cache = join(root, ".cache");
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(join(cache, "performance-lab-"));
  const run = (command: string, args: string[], cwd = root) =>
    execFileSync(command, args, { cwd, stdio: ["ignore", 2, 2], timeout: 180000 });
  const source = options.from
    ? cohortSchema.parse(JSON.parse(readFileSync(join(options.from, "cohort.json"), "utf8")))
    : undefined;
  if (source) {
    if (source.directory !== options.from)
      throw new Error("Frozen source directory does not match its manifest");
    if (
      source.node !== process.version ||
      source.platform !== process.platform ||
      source.arch !== process.arch
    )
      throw new Error("Frozen source toolchain/platform differs");
    for (const name of ["html-parser.tgz", "dom.tgz", "jsdom.tgz"]) {
      const file = join(source.directory, name);
      if (hash(file) !== source.artifactSHA256[name])
        throw new Error(`Frozen source artifact changed: ${name}`);
      cpSync(file, join(directory, name));
    }
  } else {
    run("bun", ["run", "build", "--filter=@run-dom/jsdom"]);
    for (const name of ["html-parser", "dom", "jsdom"])
      run(
        "bun",
        ["pm", "pack", "--filename", join(directory, `${name}.tgz`), "--quiet"],
        join(root, "packages", name),
      );
  }
  const local = {
    jsdom: "file:../jsdom.tgz",
    "@run-dom/dom": "file:../dom.tgz",
    "@run-dom/html-parser": "file:../html-parser.tgz",
    "@testing-library/dom": "10.4.2",
  };
  const consumers: Record<string, Record<string, string>> = {
    "run-dom": local,
    jsdom: { jsdom: "31.0.1" },
    "happy-dom": { "happy-dom": "21.0.4" },
    "turbo-dom": { "@miaskiewicz/turbo-dom": "0.8.6" },
    tools: { zod: "4.6.7" },
  };
  for (const [name, dependencies] of Object.entries(consumers)) {
    const consumer = join(directory, name);
    mkdirSync(consumer);
    writeFileSync(
      join(consumer, "package.json"),
      JSON.stringify(
        {
          private: true,
          type: "module",
          dependencies,
          ...(name === "run-dom"
            ? {
                overrides: {
                  "@run-dom/dom": local["@run-dom/dom"],
                  "@run-dom/html-parser": local["@run-dom/html-parser"],
                },
              }
            : {}),
        },
        null,
        2,
      ),
    );
    run("bun", ["install", "--ignore-scripts"], consumer);
  }
  writeFileSync(
    join(directory, "turbo-dom/load-runtime.mjs"),
    'export const loadRuntime = () => import("@miaskiewicz/turbo-dom/runtime");\n',
  );
  cpSync(lab, join(directory, "tools/lab"), { recursive: true });
  writeFileSync(
    join(directory, "guard.mjs"),
    `// Rejects producer dependencies in all frozen measurements.\nimport {registerHooks} from 'node:module';\nimport {pathToFileURL} from 'node:url';\nconst producer=${JSON.stringify(new URL("../../../../", import.meta.url).href)};\nconst cohort=pathToFileURL(${JSON.stringify(directory + "/")}).href;\nconst forbidden=url=>url?.startsWith(producer)&&!url.startsWith(cohort);\nregisterHooks({resolve(specifier,context,next){if(forbidden(context.parentURL))throw Error('Loaded producer parent: '+context.parentURL);const result=next(specifier,context);if(forbidden(result.url))throw Error('Loaded producer artifact: '+result.url);return result;}});\n`,
  );
  const sourceFiles = ["packages", "crates", "scripts", "docs"].flatMap((name) =>
    files(join(root, name)),
  );
  for (const name of [
    "package.json",
    "bun.lock",
    "Cargo.toml",
    "Cargo.lock",
    "turbo.json",
    "tsconfig.json",
  ])
    sourceFiles.push(join(root, name));
  const cohort = cohortSchema.parse({
    ...(source
      ? {
          artifactSource: {
            directory: source.directory,
            manifestSHA256: hash(join(source.directory, "cohort.json")),
            sourceSHA256: source.sourceSHA256,
          },
        }
      : {}),
    version: 1,
    directory,
    createdAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model ?? "unknown",
    sourceSHA256: Object.fromEntries(sourceFiles.map((file) => [relative(root, file), hash(file)])),
    artifactSHA256: Object.fromEntries(
      ["html-parser.tgz", "dom.tgz", "jsdom.tgz"].map((name) => [
        name,
        hash(join(directory, name)),
      ]),
    ),
    lockSHA256: Object.fromEntries(
      Object.keys(consumers).map((name) => [name, hash(join(directory, name, "bun.lock"))]),
    ),
    runtimeSHA256: Object.fromEntries(
      Object.keys(consumers).map((name) => [name, consumerDigest(join(directory, name))]),
    ),
    versions: {
      candidate: "0.0.1",
      jsdom: "31.0.1",
      happyDOM: "21.0.4",
      turboDOM: "0.8.6",
      testingLibrary: "10.4.2",
    },
  });
  writeFileSync(join(directory, "cohort.json"), JSON.stringify(cohort, null, 2), { flag: "wx" });
  return cohort;
}
