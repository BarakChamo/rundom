// Benchmarks the same checked React workflows in fresh Vitest processes using packed, pinned providers.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadavg, freemem } from "node:os";
import { parseArgs } from "node:util";

const { values: options } = parseArgs({
  options: {
    "include-turbo": { type: "boolean", default: false },
    "include-stress": { type: "boolean", default: false },
  },
  allowPositionals: false,
});

const root = fileURLToPath(new URL("../", import.meta.url));
const cache = join(root, ".cache");
mkdirSync(cache, { recursive: true });
const directory = mkdtempSync(join(cache, "framework-benchmark-"));
copyFileSync(fileURLToPath(import.meta.url), join(directory, "benchmark-framework.mjs"));
const pools = ["forks", "threads", "vmForks", "vmThreads"];
const rounds = 9;
const fixture = readFileSync(new URL("./fixtures/vitest-react.test.mjs", import.meta.url), "utf8");
const stressFixture = options["include-stress"]
  ? readFileSync(new URL("./fixtures/vitest-react-stress.test.mjs", import.meta.url), "utf8")
  : undefined;
const testCount = stressFixture ? 10 : 8;
const memoryObserver = `
import { afterAll as benchmarkAfterAll } from "vitest";
import { writeFileSync as benchmarkWriteFile } from "node:fs";
benchmarkAfterAll(() => benchmarkWriteFile(process.env.RUN_DOM_BENCHMARK_MEMORY,
  JSON.stringify({ workerRssMiB: process.memoryUsage().rss / 1024 ** 2 })));
`;
const common = {
  vitest: "5.1.0",
  react: "19.3.1",
  "react-dom": "19.3.1",
  "@testing-library/react": "16.3.3",
  "@testing-library/dom": "10.4.2",
  "@testing-library/user-event": "14.6.8",
};
const providers = [
  {
    name: "run-dom",
    environment: "jsdom",
    dependencies: {
      jsdom: "file:../jsdom.tgz",
      "@run-dom/dom": "file:../dom.tgz",
      "@run-dom/html-parser": "file:../html-parser.tgz",
    },
  },
  { name: "jsdom", environment: "jsdom", dependencies: { jsdom: "30.1.3" } },
  { name: "happy-dom", environment: "happy-dom", dependencies: { "happy-dom": "21.0.4" } },
  ...(options["include-turbo"]
    ? [{ name: "turbo-dom", environment: "", dependencies: { "@miaskiewicz/turbo-dom": "0.7.1" } }]
    : []),
];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const prepare = (command, args, cwd) =>
  execFileSync(command, args, { cwd, stdio: ["ignore", 2, 2] });

prepare("bun", ["run", "build", "--filter=@run-dom/jsdom"], root);
for (const name of ["html-parser", "dom", "jsdom"]) {
  prepare(
    "bun",
    ["pm", "pack", "--filename", join(directory, `${name}.tgz`), "--quiet"],
    join(root, "packages", name),
  );
}
for (const provider of providers) {
  const project = join(directory, provider.name);
  mkdirSync(project);
  copyFileSync(
    new URL("./fixtures/producer-isolation.mjs", import.meta.url),
    join(project, "producer-isolation.mjs"),
  );
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: { ...common, ...provider.dependencies },
        ...(provider.name === "run-dom"
          ? {
              overrides: {
                "@run-dom/dom": "file:../dom.tgz",
                "@run-dom/html-parser": "file:../html-parser.tgz",
              },
            }
          : {}),
      },
      null,
      2,
    ),
  );
  // The assertions and cleanup stay identical. A post-suite observer records the worker's RSS.
  writeFileSync(join(project, "react.test.mjs"), fixture + memoryObserver);
  if (stressFixture)
    writeFileSync(join(project, "react-stress.test.mjs"), stressFixture + memoryObserver);
  prepare("bun", ["install", "--ignore-scripts"], project);
  if (provider.name === "turbo-dom") {
    // Resolve the published import-only environment export in its independent consumer.
    const url = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "process.stdout.write(import.meta.resolve('@miaskiewicz/turbo-dom/environment/vitest'))",
      ],
      { cwd: project, encoding: "utf8" },
    );
    provider.environment = fileURLToPath(url);
  }
}

function trial(provider, pool, round) {
  const project = join(directory, provider.name);
  const trialDirectory = mkdtempSync(join(project, `${pool}-${round < 0 ? "screen" : round + 1}-`));
  const output = join(trialDirectory, "result.json"),
    memory = join(trialDirectory, "memory.json");
  const host = { loadAverage: loadavg(), freeMemoryBytes: freemem() };
  const start = performance.now();
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "react.test.mjs",
      ...(stressFixture ? ["react-stress.test.mjs"] : []),
      "--environment",
      provider.environment,
      "--pool",
      pool,
      "--maxWorkers",
      "1",
      "--no-cache",
      "--no-fsModuleCache",
      "--reporter",
      "json",
      "--outputFile",
      output,
    ],
    {
      cwd: project,
      encoding: "utf8",
      env: {
        ...process.env,
        RUN_DOM_BENCHMARK_MEMORY: memory,
        RUN_DOM_PRODUCER_ROOT: pathToFileURL(root).href,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(join(project, "producer-isolation.mjs")).href}`,
      },
      maxBuffer: 4 * 1024 ** 2,
      timeout: 120000,
    },
  );
  const processMs = performance.now() - start;
  writeFileSync(join(trialDirectory, "stdout.log"), result.stdout ?? "");
  writeFileSync(join(trialDirectory, "stderr.log"), result.stderr ?? "");
  if (result.error && result.error.code !== "ETIMEDOUT") throw result.error;
  if (result.status !== 0 || result.signal || processMs > 120000) {
    return {
      verified: false,
      provider: provider.name,
      pool,
      round,
      processMs,
      trialDirectory,
      exitCode: result.status,
      signal: result.signal,
      reason:
        processMs > 120000
          ? "elapsed_timeout"
          : (result.error?.message ?? "Framework assertions or environment setup failed"),
    };
  }
  const report = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(report.numTotalTests, testCount);
  assert.equal(report.numPassedTests, testCount);
  assert.equal(report.numFailedTests, 0);
  assert.equal(report.numPendingTests, 0);
  const tests = report.testResults.flatMap((file) => file.assertionResults);
  assert.equal(tests.length, testCount);
  assert(tests.every((test) => test.status === "passed" && Number.isFinite(test.duration)));
  const { workerRssMiB } = JSON.parse(readFileSync(memory, "utf8"));
  assert(Number.isFinite(workerRssMiB) && workerRssMiB > 0);
  return {
    verified: true,
    provider: provider.name,
    pool,
    processMs,
    testMs: tests.reduce((sum, test) => sum + test.duration, 0),
    workerRssMiB,
    passedTests: testCount,
    trialDirectory,
    host,
    tests: tests.map((test) => ({
      name: test.fullName,
      durationMs: test.duration,
      status: test.status,
    })),
  };
}

const trials = [];
const failures = [];
for (const pool of pools) {
  const ineligible = new Set();
  // Validate and prime filesystem caches equally before measuring fresh module/runner processes.
  for (const provider of providers) {
    const result = trial(provider, pool, -1);
    if (!result.verified) {
      failures.push(result);
      ineligible.add(provider.name);
    }
  }
  for (let round = 0; round < rounds; round++) {
    for (let offset = 0; offset < providers.length; offset++) {
      const provider = providers[(round + offset) % providers.length];
      if (ineligible.has(provider.name)) continue;
      const result = trial(provider, pool, round);
      if (result.verified) trials.push({ round, ...result });
      else {
        failures.push(result);
        ineligible.add(provider.name);
      }
    }
  }
  process.stderr.write(`Framework benchmark complete: ${pool}\n`);
}
const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const medians = pools.flatMap((pool) =>
  providers.map((provider) => {
    const values = trials.filter(
      (value) => value.pool === pool && value.provider === provider.name,
    );
    return {
      pool,
      provider: provider.name,
      n: values.length,
      eligible:
        values.length === rounds &&
        !failures.some((value) => value.pool === pool && value.provider === provider.name),
      processMs: values.length ? median(values.map((value) => value.processMs)) : null,
      testMs: values.length ? median(values.map((value) => value.testMs)) : null,
      workerRssMiB: values.length ? median(values.map((value) => value.workerRssMiB)) : null,
    };
  }),
);
const report = {
  scope:
    (stressFixture
      ? "Includes two additional keyed-list/state-interaction stress workloads. "
      : "") +
    "Eight identical React/Testing Library workflows in fresh serial Vitest processes, one worker, disabled runner and filesystem module caches. Installation/build excluded. Worker RSS is separate from whole-process wall time and excludes the main runner in fork pools. This does not establish broader API parity.",
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  directory,
  rounds,
  pools,
  versions: { ...common, jsdom: "30.1.3", "happy-dom": "21.0.4", "@run-dom/jsdom": "0.0.1" },
  ...(options["include-turbo"] ? { turboDOMVersion: "0.7.1" } : {}),
  fixtureSHA256: hash(fixture),
  ...(stressFixture ? { stressFixtureSHA256: hash(stressFixture), testsPerTrial: testCount } : {}),
  driverSHA256: hash(readFileSync(fileURLToPath(import.meta.url))),
  conditions: "shared-host",
  parserSelection: process.env.RUN_DOM_HTML_PARSER || "default",
  artifactSHA256: Object.fromEntries(
    ["html-parser.tgz", "dom.tgz", "jsdom.tgz"].map((name) => [
      name,
      hash(readFileSync(join(directory, name))),
    ]),
  ),
  lockSHA256: Object.fromEntries(
    providers.map((provider) => [
      provider.name,
      hash(readFileSync(join(directory, provider.name, "bun.lock"))),
    ]),
  ),
  medians,
  trials,
  failures,
};
writeFileSync(join(directory, "report.json"), JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (failures.length) process.exitCode = 1;
