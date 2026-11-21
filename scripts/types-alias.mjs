// Qualifies independently packed facade types in ESM, CommonJS and bundler consumers.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const project = mkdtempSync(join(tmpdir(), "rundom-types-"));
const run = (command, args, cwd = project, env = process.env) =>
  execFileSync(command, args, { cwd, env, stdio: "inherit" });
console.log(`Packed type consumer: ${project}`);
run("bun", ["run", "build", "--filter=@run-dom/jsdom"], root);
for (const name of ["html-parser", "dom", "jsdom"])
  run(
    "bun",
    ["pm", "pack", "--filename", join(project, `${name}.tgz`), "--quiet"],
    join(root, "packages", name),
  );
writeFileSync(
  join(project, "package.json"),
  JSON.stringify({
    private: true,
    type: "module",
    dependencies: {
      jsdom: "file:./jsdom.tgz",
      "@run-dom/dom": "file:./dom.tgz",
      "@run-dom/html-parser": "file:./html-parser.tgz",
      "@types/node": "24.10.1",
      typescript: "7.0.2",
    },
    overrides: {
      "@run-dom/dom": "file:./dom.tgz",
      "@run-dom/html-parser": "file:./html-parser.tgz",
    },
  }),
);
for (const extension of ["mts", "cts"])
  copyFileSync(
    new URL("./fixtures/types-consumer.mts", import.meta.url),
    join(project, `consumer.${extension}`),
  );
copyFileSync(
  new URL("./fixtures/producer-isolation.mjs", import.meta.url),
  join(project, "producer-isolation.mjs"),
);
run("bun", ["install", "--ignore-scripts"]);
const shared = {
  target: "ES2024",
  lib: ["ES2024", "DOM", "DOM.Iterable"],
  types: ["node"],
  strict: true,
  skipLibCheck: false,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  outDir: "output",
};
writeFileSync(
  join(project, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: { ...shared, module: "NodeNext" },
    include: ["consumer.mts", "consumer.cts"],
  }),
);
run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"]);
writeFileSync(
  join(project, "bundler.json"),
  JSON.stringify({
    compilerOptions: { ...shared, module: "ESNext", moduleResolution: "Bundler", noEmit: true },
    include: ["consumer.mts"],
  }),
);
run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "bundler.json"]);
const env = {
  ...process.env,
  RUN_DOM_PRODUCER_ROOT: pathToFileURL(root).href,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(join(project, "producer-isolation.mjs")).href}`,
};
for (const extension of ["mjs", "cjs"])
  run(process.execPath, [`output/consumer.${extension}`], project, env);
console.log(
  "Packed strict types and runtime examples passed in ESM/CommonJS; bundler typecheck passed.",
);
