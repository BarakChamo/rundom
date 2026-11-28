// Runs unmodified upstream API fixtures against the pinned reference or the built facade.
import { spawnSync } from "node:child_process";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const revision = "b76da26fd3b2786771b493f0bbec8dbd7a3d36d0";
const checkout = new URL("../.cache/jsdom-reference/", import.meta.url);
const referenceEntry = new URL("lib/api.js", checkout).href;
const candidateCommonJS = new URL("../packages/jsdom/dist/jsdom.cjs", import.meta.url).href;
const candidateESM = new URL("../packages/jsdom/dist/jsdom.js", import.meta.url).href;

if (process.env.RUN_DOM_API_PRELOAD === "1") {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      if (resolved.url === referenceEntry) {
        return context.conditions.includes("import")
          ? { ...resolved, url: candidateESM, format: "module" }
          : { ...resolved, url: candidateCommonJS, format: "commonjs" };
      }
      return resolved;
    },
  });
} else {
  const [provider, ...args] = process.argv.slice(2);
  if (provider !== "reference" && provider !== "candidate") {
    throw new Error("Usage: bun run conformance:api <reference|candidate> [Mocha arguments]");
  }
  const cwd = fileURLToPath(checkout);
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  if (commit.status !== 0 || commit.stdout.trim() !== revision) {
    throw new Error("Missing pinned jsdom checkout. Follow docs/project-guide.md to prepare it.");
  }

  const env = { ...process.env, RUN_DOM_API_PRELOAD: provider === "candidate" ? "1" : "0" };
  if (provider === "candidate") {
    env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--import=" + import.meta.url]
      .filter(Boolean)
      .join(" ");
  }
  const run = spawnSync("npm", ["run", "test:api", "--", "--reporter", "min", ...args], {
    cwd,
    env,
    stdio: "inherit",
  });
  if (run.error) throw run.error;
  process.exitCode = run.status ?? 1;
}
