// Verifies the packed facade in a clean Vitest project with jsdom as its dependency name.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const project = mkdtempSync(join(tmpdir(), "rundom-vitest-"));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit" });
console.log(`Packed alias fixture: ${project}`);
run("bun", ["run", "build", "--filter=@run-dom/jsdom"], root);
for (const name of ["html-parser", "dom", "jsdom"]) {
  run(
    "bun",
    ["pm", "pack", "--filename", join(project, `${name}.tgz`), "--quiet"],
    join(root, "packages", name),
  );
}
writeFileSync(
  join(project, "package.json"),
  JSON.stringify({
    private: true,
    type: "module",
    dependencies: {
      "@run-dom/dom": "file:./dom.tgz",
      "@run-dom/html-parser": "file:./html-parser.tgz",
      jsdom: "file:./jsdom.tgz",
      vitest: "5.1.0",
      react: "19.3.1",
      "react-dom": "19.3.1",
      "@testing-library/react": "16.3.3",
      "@testing-library/dom": "10.4.2",
      "@testing-library/user-event": "14.6.8",
    },
    overrides: {
      "@run-dom/dom": "file:./dom.tgz",
      "@run-dom/html-parser": "file:./html-parser.tgz",
    },
  }),
);
copyFileSync(
  new URL("./fixtures/vitest-alias.test.mjs", import.meta.url),
  join(project, "dom.test.mjs"),
);
copyFileSync(
  new URL("./fixtures/vitest-react.test.mjs", import.meta.url),
  join(project, "react.test.mjs"),
);
copyFileSync(
  new URL("./fixtures/vitest-react-stress.test.mjs", import.meta.url),
  join(project, "react-stress.test.mjs"),
);
if (process.env.RUN_DOM_HTML_PARSER === "rust")
  copyFileSync(
    new URL("./fixtures/vitest-native.test.mjs", import.meta.url),
    join(project, "native.test.mjs"),
  );
run("bun", ["install", "--ignore-scripts"], project);
const isolation = join(project, "producer-isolation.mjs");
copyFileSync(new URL("./fixtures/producer-isolation.mjs", import.meta.url), isolation);
const consumerEnv = {
  ...process.env,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(isolation).href}`,
  RUN_DOM_PRODUCER_ROOT: pathToFileURL(root).href,
};
const runConsumer = (args) =>
  execFileSync(process.execPath, args, { cwd: project, stdio: "inherit", env: consumerEnv });
runConsumer([
  "--input-type=module",
  "-e",
  'import assert from "node:assert/strict"; import { createRequire } from "node:module"; import { JSDOM } from "jsdom"; assert.equal(JSDOM, createRequire(import.meta.url)("jsdom").JSDOM); const {window}=new JSDOM(`<style>p[data-probe]{color:red}</style><p data-probe>text</p>`); try { assert.equal(window.getComputedStyle(window.document.querySelector("p[data-probe]")).color,"rgb(255, 0, 0)"); } finally {window.close();}',
]);
for (const pool of ["forks", "threads", "vmForks", "vmThreads"]) {
  console.log(`Vitest pool: ${pool}`);
  runConsumer(["node_modules/vitest/vitest.mjs", "run", "--environment", "jsdom", "--pool", pool]);
}
