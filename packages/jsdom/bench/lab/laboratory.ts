// Owns frozen-cohort execution, evidence validation and measurement workflows behind the performance CLI.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { cpus, freemem, loadavg, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  cohortSchema,
  dimensionsSchema,
  modeSchema,
  providerSchema,
  requestSchema,
  resultSchema,
  scenarioSchema,
  summarize,
  withinProcessBudget,
  type Trial,
  type Failure,
  type Provider,
  type Scenario,
} from "./contracts.ts";
import { consumerDigest } from "./integrity.ts";
import { analyzeReport } from "./analyze.ts";
import { prepareCohort } from "./cohort.ts";
import { parallelResultSchema } from "./parallel.ts";
import { compareCohorts } from "./compare.ts";
import { summarizeProfiles } from "./profiles.ts";

/** Executes a bounded experiment command; malformed inputs abort, while provider failures remain explicit evidence. */
export async function runLaboratory(args: readonly string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: Object.fromEntries(
      [
        "from",
        "providers",
        "scenarios",
        "size",
        "depth",
        "windows",
        "operations",
        "batches",
        "rounds",
        "mode",
        "timeout-ms",
        "script-mode",
        "lanes",
        "tasks",
        "conditions",
        "turn-policy",
        "warmup-operations",
        "warmup-batches",
      ].map((name) => [name, { type: "string" as const }]),
    ),
  });
  const command = z
    .enum(["prepare", "run", "profile", "memory", "parallel", "analyze", "compare"])
    .parse(positionals[0]);
  if (command === "prepare") {
    process.stdout.write(
      JSON.stringify(
        prepareCohort({ from: values.from ? resolve(values.from) : undefined }),
        null,
        2,
      ) + "\n",
    );
  } else if (command === "compare") {
    const dimensions = dimensionsSchema.parse(
      Object.fromEntries(
        ["size", "depth", "windows", "operations", "batches"]
          .filter((key) => values[key] !== undefined)
          .map((key) => [key, Number(values[key])]),
      ),
    );
    const configured = {
      ...dimensions,
      turnPolicy: values["turn-policy"] ?? "between-batches",
      warmupBatches: Number(values["warmup-batches"] ?? dimensions.warmupBatches),
      warmupOperations: Number(values["warmup-operations"] ?? dimensions.warmupOperations),
      scriptMode: values["script-mode"] ?? dimensions.scriptMode,
    };
    const result = await compareCohorts({
      before: positionals[1],
      after: positionals[2],
      providers: (values.providers ?? "run-dom,happy-dom,turbo-dom").split(","),
      scenarios: (
        values.scenarios ??
        "query-simple,query-all,query-all-iterate,query-snapshot,query-after-mutation,role-query,style-read,events-dispatch"
      ).split(","),
      dimensions: configured,
      rounds: Number(values.rounds ?? 9),
      timeoutMs: Number(values["timeout-ms"] ?? 120000),
      conditions: values.conditions ?? "shared-host",
    });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (command === "analyze") {
    const directory = resolve(z.string().min(1).parse(positionals[1]));
    analyzeReport(directory);
    process.stdout.write(JSON.stringify({ directory }) + "\n");
  } else {
    const cohortPath = resolve(z.string().min(1).parse(positionals[1]));
    const cohort = cohortSchema.parse(
      JSON.parse(readFileSync(join(cohortPath, "cohort.json"), "utf8")),
    );
    if (cohort.directory !== cohortPath)
      throw new Error("Cohort relocation changes locked file references; prepare a fresh cohort");
    if (
      cohort.node !== process.version ||
      cohort.platform !== process.platform ||
      cohort.arch !== process.arch
    )
      throw new Error("Cohort toolchain/platform changed; prepare a fresh cohort");
    for (const [name, expected] of Object.entries(cohort.artifactSHA256)) {
      const actual = createHash("sha256")
        .update(readFileSync(join(cohortPath, name)))
        .digest("hex");
      if (actual !== expected) throw new Error(`Frozen artifact changed: ${name}`);
    }
    for (const [name, expected] of Object.entries(cohort.runtimeSHA256)) {
      if (consumerDigest(join(cohortPath, name)) !== expected)
        throw new Error(`Frozen installed consumer changed: ${name}`);
    }
    // Execute the immutable driver as well as immutable workers; later checkout edits cannot change a cohort's experiment.
    if (import.meta.filename !== join(cohortPath, "tools/lab/laboratory.ts")) {
      const child = spawn(process.execPath, [join(cohortPath, "tools/lab/cli.ts"), ...args], {
        stdio: ["ignore", "pipe", "inherit"],
        env: { ...process.env, NODE_OPTIONS: "" },
      });
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      const code = await new Promise<number | null>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", resolve);
      });
      if (code !== 0) process.exitCode = code ?? 1;
      else {
        const completed = z
          .object({ directory: z.string() })
          .passthrough()
          .parse(JSON.parse(output));
        if (command !== "parallel") analyzeReport(completed.directory);
        process.stdout.write(output);
      }
    } else {
      const mode = modeSchema.parse(
        command === "run" || command === "parallel"
          ? "timing"
          : command === "memory"
            ? "memory"
            : (values.mode ?? "cpu"),
      );
      if (command === "profile" && mode !== "cpu" && mode !== "allocation")
        throw new Error("Profile mode must be cpu or allocation");
      const providers = z
        .array(providerSchema)
        .min(1)
        .parse((values.providers ?? "run-dom,run-dom-rust,jsdom,happy-dom,turbo-dom").split(","));
      const scenarios = z
        .array(scenarioSchema)
        .min(1)
        .parse(
          values.scenarios
            ? values.scenarios.split(",")
            : command === "parallel"
              ? ["parse-html"]
              : scenarioSchema.options,
        );
      const rounds = z
        .number()
        .int()
        .min(1)
        .max(51)
        .parse(Number(values.rounds ?? (mode === "timing" ? 9 : 1)));
      const timeoutMs = z
        .number()
        .int()
        .min(1000)
        .max(300000)
        .parse(Number(values["timeout-ms"] ?? 120000));
      const partialDimensions = Object.fromEntries(
        ["size", "depth", "windows", "operations", "batches"]
          .filter((name) => values[name] !== undefined)
          .map((name) => [name, Number(values[name])]),
      );
      const conditions = z
        .enum(["shared-host", "isolated-host"])
        .parse(values.conditions ?? "shared-host");
      const baseDimensions = dimensionsSchema.parse({
        ...partialDimensions,
        turnPolicy: values["turn-policy"] ?? "between-batches",
        ...(values["warmup-operations"]
          ? { warmupOperations: Number(values["warmup-operations"]) }
          : {}),
        ...(values["warmup-batches"] ? { warmupBatches: Number(values["warmup-batches"]) } : {}),
        ...(values["script-mode"] ? { scriptMode: values["script-mode"] } : {}),
      });
      if (command === "parallel") {
        const lanes = z
          .array(z.number().int().min(1).max(16))
          .min(1)
          .parse((values.lanes ?? "1,2,4").split(",").map(Number));
        const tasks = z
          .number()
          .int()
          .min(1)
          .max(256)
          .parse(Number(values.tasks ?? 16));
        const directory = mkdtempSync(join(cohortPath, "parallel-"));
        if (scenarios.length !== 1)
          throw new Error("Parallel experiments require exactly one scenario");
        const trials = [],
          failures = [];
        for (let round = 0; round < rounds; round++)
          for (let offset = 0; offset < providers.length; offset++) {
            const provider = providers[(round + offset) % providers.length];
            for (let laneOffset = 0; laneOffset < lanes.length; laneOffset++) {
              const lane = lanes[(round + laneOffset) % lanes.length];
              const args = [
                "--import",
                pathToFileURL(join(cohortPath, "guard.mjs")).href,
                join(cohortPath, "tools/lab/parallel-trial.ts"),
                JSON.stringify({
                  provider,
                  scenario: scenarios[0],
                  dimensions: {
                    ...baseDimensions,
                    operations: values.operations ? baseDimensions.operations : 8,
                  },
                  cohort: cohortPath,
                  lanes: lane,
                  tasks,
                }),
              ];
              const start = performance.now();
              const child = spawnSync(process.execPath, args, {
                encoding: "utf8",
                timeout: timeoutMs,
                env: { ...process.env, NODE_OPTIONS: "", RUN_DOM_HTML_PARSER: "" },
                maxBuffer: 4 * 1024 ** 2,
              });
              const processMs = performance.now() - start;
              if (
                child.status !== 0 ||
                child.signal ||
                !withinProcessBudget({ processMs, timeoutMs })
              )
                failures.push({
                  round,
                  provider,
                  lanes: lane,
                  status: child.status,
                  signal: child.signal,
                  processMs,
                  stderr: child.stderr,
                });
              else
                trials.push({
                  round,
                  processMs,
                  ...parallelResultSchema.parse(JSON.parse(child.stdout)),
                });
              writeFileSync(
                join(directory, "progress.json"),
                JSON.stringify({ trials, failures }, null, 2),
              );
              process.stderr.write(
                `parallel ${provider} lanes=${lane} round=${round + 1}: ${child.status === 0 && !child.signal && withinProcessBudget({ processMs, timeoutMs }) ? "verified" : "FAILED"}\n`,
              );
            }
          }
        writeFileSync(
          join(directory, "report.json"),
          JSON.stringify({ cohort: cohortPath, conditions, trials, failures }, null, 2),
        );
        process.stdout.write(JSON.stringify({ directory }) + "\n");
      } else {
        const directory = mkdtempSync(join(cohortPath, `${mode}-`));
        const trials: Trial[] = [],
          failures: Failure[] = [];
        const host = () => ({
          at: new Date().toISOString(),
          loadAverage: loadavg(),
          freeMemoryBytes: freemem(),
          totalMemoryBytes: totalmem(),
          cpuCount: cpus().length,
          processes:
            process.platform === "win32"
              ? "unavailable"
              : spawnSync("ps", ["-Ao", "pid,ppid,pcpu,comm"], { encoding: "utf8" }).stdout,
        });
        const started = host();
        const screen = new Set<string>();
        if (process.platform === "darwin")
          spawn("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)], {
            stdio: "ignore",
          }).unref();
        async function trial(provider: Provider, scenario: Scenario, round: number): Promise<void> {
          const output = join(directory, `${scenario}-${provider}-${round}`);
          mkdirSync(output);
          const isHeavy = [
            "parse-html",
            "windows-create-close",
            "clone-subtree",
            "serialize",
          ].includes(scenario);
          const dimensions = {
            ...baseDimensions,
            operations: values.operations
              ? baseDimensions.operations
              : isHeavy
                ? 8
                : baseDimensions.operations,
          };
          const request = requestSchema.parse({
            provider,
            scenario,
            dimensions,
            cohort: cohortPath,
            mode,
            output,
          });
          const args = [
            "--import",
            pathToFileURL(join(cohortPath, "guard.mjs")).href,
            ...(mode === "memory" ? ["--expose-gc"] : []),
            join(cohortPath, "tools/lab/worker.ts"),
            JSON.stringify(request),
          ];
          const start = performance.now();
          const child = spawn(process.execPath, args, {
            cwd: cohortPath,
            env: { ...process.env, NODE_OPTIONS: "", RUN_DOM_HTML_PARSER: "" },
            stdio: ["ignore", "pipe", "pipe"],
          });
          let stdout = "",
            stderr = "",
            expired = false;
          child.stdout.on("data", (chunk) => {
            stdout += chunk;
          });
          child.stderr.on("data", (chunk) => {
            stderr += chunk;
          });
          const timer = setTimeout(() => {
            expired = true;
            child.kill("SIGKILL");
          }, timeoutMs);
          const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>(
            (resolve, reject) => {
              child.on("error", reject);
              child.on("close", (code, signal) => resolve([code, signal]));
            },
          );
          clearTimeout(timer);
          const processMs = performance.now() - start;
          writeFileSync(join(output, "stdout.log"), stdout);
          writeFileSync(join(output, "stderr.log"), stderr);
          const exceededBudget = !withinProcessBudget({ processMs, timeoutMs });
          if (code !== 0 || signal || exceededBudget) {
            failures.push({
              round,
              provider,
              scenario,
              mode,
              processMs,
              reason: expired || exceededBudget ? "timeout" : `worker_exit_${code}_${signal}`,
              stderr,
            });
            if (round === -1) screen.add(`${provider}:${scenario}`);
          } else {
            const result = resultSchema.parse(
              JSON.parse(readFileSync(join(output, "result.json"), "utf8")),
            );
            if (
              result.provider !== provider ||
              result.scenario !== scenario ||
              result.mode !== mode ||
              JSON.stringify(result.dimensions) !== JSON.stringify(dimensions) ||
              result.batchesMs.length !== dimensions.batches
            )
              throw new Error("Worker output does not match the requested work");
            const expectedOperations =
              1 +
              dimensions.warmupBatches *
                Math.min(dimensions.operations, dimensions.warmupOperations) +
              dimensions.batches * dimensions.operations;
            if (result.checkedOperations !== expectedOperations)
              throw new Error("Worker did not verify the requested operation count");
            if (round >= 0) trials.push({ round, processMs, timeoutMs, result });
            if (mode === "cpu" || mode === "allocation") summarizeProfiles(output);
          }
          writeFileSync(
            join(directory, "progress.json"),
            JSON.stringify(
              {
                completedTrials: trials.length,
                failures,
                current: { provider, scenario, round },
                directory,
              },
              null,
              2,
            ),
          );
          process.stderr.write(
            `${mode} ${scenario} ${provider} ${round === -1 ? "screen" : round + 1}: ${code === 0 && !signal && !exceededBudget ? "verified" : "FAILED"}\n`,
          );
        }
        // A successful unmeasured screen primes filesystem caches equally; workers always have fresh module caches.
        for (const scenario of scenarios)
          for (const provider of providers) await trial(provider, scenario, -1);
        for (let round = 0; round < rounds; round++)
          for (const scenario of scenarios) {
            for (let offset = 0; offset < providers.length; offset++) {
              const provider = providers[(round + offset) % providers.length];
              if (provider && !screen.has(`${provider}:${scenario}`))
                await trial(provider, scenario, round);
            }
          }
        const summary = summarize(trials, failures);
        const report = {
          version: 1,
          cohort: cohortPath,
          directory,
          mode,
          conditions,
          rounds,
          started,
          finished: host(),
          scope:
            "Fresh module/process state with primed OS filesystem caches. Timing is serial and uninstrumented. Diagnostic modes are ineligible for speed comparisons. Batch distributions are not per-operation latency distributions. RSS is whole process; arrayBuffers overlaps external; forced GC is memory-mode only.",
          summary,
          trials,
          failures,
        };
        writeFileSync(join(directory, "report.json"), JSON.stringify(report, null, 2), {
          flag: "wx",
        });
        const lines = [
          "# Performance laboratory",
          "",
          `Mode: ${mode}; rounds: ${rounds}; verified trials: ${trials.length}; failed screens/trials: ${failures.length}.`,
          "",
          "| Scenario | Provider | Operations/batch | Process median ms | First-use median ms | Warm batch median ms | Batch p95 ms | MAD ms | Checked work complete |",
          "|---|---|---:|---:|---:|---:|---:|---:|---|",
        ];
        for (const row of summary)
          lines.push(
            `| ${row.scenario} | ${row.provider} | ${row.dimensions.operations} | ${row.processMs.median.toFixed(3)} | ${(row.phases.find((phase) => phase.name === "first-use")?.wallMs.median ?? 0).toFixed(3)} | ${row.warmBatchMs.median.toFixed(3)} | ${row.warmBatchMs.p95.toFixed(3)} | ${row.warmBatchMs.mad.toFixed(3)} | ${row.comparable ? "yes" : "no"} |`,
          );
        if (failures.length)
          lines.push(
            "",
            "Failures are preserved in report.json and worker stderr.log. No failed scenario receives a performance claim.",
          );
        writeFileSync(join(directory, "report.md"), lines.join("\n") + "\n", { flag: "wx" });
        process.stdout.write(
          JSON.stringify(
            {
              directory,
              report: join(directory, "report.json"),
              verifiedTrials: trials.length,
              failures: failures.length,
            },
            null,
            2,
          ) + "\n",
        );
        if (!trials.length) process.exitCode = 1;
      }
    }
  }
}
