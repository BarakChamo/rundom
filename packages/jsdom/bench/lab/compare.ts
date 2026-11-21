// Compares immutable runtime revisions with identical frozen probes in rotated serial fresh processes.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadavg, freemem, totalmem, cpus } from "node:os";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  cohortSchema,
  requestSchema,
  resultSchema,
  dimensionsSchema,
  providerSchema,
  scenarioSchema,
  distribution,
  withinProcessBudget,
  type Cohort,
  type TrialResult,
} from "./contracts.ts";
import { consumerDigest } from "./integrity.ts";

const optionsSchema = z.object({
  before: z.string(),
  after: z.string(),
  providers: z.array(providerSchema).min(1),
  scenarios: z.array(scenarioSchema).min(1),
  dimensions: dimensionsSchema,
  rounds: z.number().int().min(1).max(51),
  timeoutMs: z.number().int().min(1000).max(300000),
  conditions: z.enum(["shared-host", "isolated-host"]),
});
const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const hostSnapshot = () => ({
  at: new Date().toISOString(),
  loadAverage: loadavg(),
  freeMemoryBytes: freemem(),
  totalMemoryBytes: totalmem(),
  cpu: cpus()[0]?.model,
});
function readCohort(directory: string): Cohort {
  const cohort = cohortSchema.parse(
    JSON.parse(readFileSync(join(directory, "cohort.json"), "utf8")),
  );
  if (
    cohort.directory !== directory ||
    cohort.node !== process.version ||
    cohort.platform !== process.platform ||
    cohort.arch !== process.arch
  )
    throw new Error("Comparison cohort path/toolchain differs");
  for (const [name, expected] of Object.entries(cohort.artifactSHA256))
    if (hash(join(directory, name)) !== expected)
      throw new Error(`Comparison artifact changed: ${name}`);
  for (const [name, expected] of Object.entries(cohort.runtimeSHA256))
    if (consumerDigest(join(directory, name)) !== expected)
      throw new Error(`Comparison consumer changed: ${name}`);
  return cohort;
}

/** Runs a matched A/B matrix; every failed screen remains visible and all outputs are exclusive new artifacts. */
export async function compareCohorts(
  input: unknown,
): Promise<{ directory: string; verifiedTrials: number; failures: number }> {
  const options = optionsSchema.parse(input),
    before = readCohort(resolve(options.before)),
    after = readCohort(resolve(options.after));
  const probes = ["worker.ts", "scenarios.ts", "providers.ts", "contracts.ts"];
  for (const file of probes)
    if (
      hash(join(before.directory, "tools/lab", file)) !==
      hash(join(after.directory, "tools/lab", file))
    )
      throw new Error(`Comparison probes differ: ${file}; prepare --from with the current rig`);
  const variants = options.providers.flatMap((provider) =>
    provider.startsWith("run-dom")
      ? [
          { label: `before-${provider}`, provider, cohort: before.directory },
          { label: `after-${provider}`, provider, cohort: after.directory },
        ]
      : [{ label: provider, provider, cohort: after.directory }],
  );
  const directory = mkdtempSync(join(after.directory, "comparison-"));
  const hostBefore = hostSnapshot();
  writeFileSync(join(directory, "compare.ts"), readFileSync(import.meta.filename), { flag: "wx" });
  type Variant = (typeof variants)[number];
  const trials: { round: number; variant: string; processMs: number; result: TrialResult }[] = [],
    failures: {
      round: number;
      variant: string;
      scenario: string;
      reason: string;
      stderr: string;
      processMs: number;
    }[] = [];
  const failedScreens = new Set<string>();
  async function run(
    variant: Variant,
    scenario: z.infer<typeof scenarioSchema>,
    round: number,
  ): Promise<void> {
    const output = join(directory, `${scenario}-${variant.label}-${round}`);
    mkdirSync(output);
    const request = requestSchema.parse({
      provider: variant.provider,
      scenario,
      mode: "timing",
      dimensions: options.dimensions,
      cohort: variant.cohort,
      output,
    });
    const start = performance.now();
    const child = spawn(
      process.execPath,
      [
        "--import",
        pathToFileURL(join(variant.cohort, "guard.mjs")).href,
        join(variant.cohort, "tools/lab/worker.ts"),
        JSON.stringify(request),
      ],
      {
        cwd: variant.cohort,
        env: { ...process.env, NODE_OPTIONS: "", RUN_DOM_HTML_PARSER: "" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "",
      stderr = "",
      expired = false;
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const timeout = setTimeout(() => {
      expired = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>(
      (resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code, signal) => resolve([code, signal]));
      },
    );
    clearTimeout(timeout);
    const processMs = performance.now() - start;
    writeFileSync(join(output, "stdout.log"), stdout);
    writeFileSync(join(output, "stderr.log"), stderr);
    const exceededBudget = !withinProcessBudget({ processMs, timeoutMs: options.timeoutMs });
    if (code !== 0 || signal || exceededBudget) {
      failures.push({
        round,
        variant: variant.label,
        scenario,
        processMs,
        reason: expired || exceededBudget ? "timeout" : `worker_exit_${code}_${signal}`,
        stderr,
      });
      if (round === -1) failedScreens.add(`${variant.label}:${scenario}`);
    } else {
      const result = resultSchema.parse(
        JSON.parse(readFileSync(join(output, "result.json"), "utf8")),
      );
      const budget =
        1 +
        request.dimensions.warmupBatches *
          Math.min(request.dimensions.operations, request.dimensions.warmupOperations) +
        request.dimensions.batches * request.dimensions.operations;
      if (
        result.provider !== variant.provider ||
        result.scenario !== scenario ||
        result.mode !== "timing" ||
        JSON.stringify(result.dimensions) !== JSON.stringify(request.dimensions) ||
        result.checkedOperations !== budget ||
        result.batchesMs.length !== request.dimensions.batches
      )
        throw new Error("Comparison worker did not complete requested work");
      if (round >= 0) trials.push({ round, variant: variant.label, processMs, result });
    }
    writeFileSync(
      join(directory, "progress.json"),
      JSON.stringify(
        {
          completedTrials: trials.length,
          failures,
          current: { round, variant: variant.label, scenario },
        },
        null,
        2,
      ),
    );
    process.stderr.write(
      `compare ${scenario} ${variant.label} ${round === -1 ? "screen" : round + 1}: ${code === 0 && !signal && !exceededBudget ? "verified" : "FAILED"}\n`,
    );
  }
  const startedAt = new Date().toISOString();
  if (process.platform === "darwin")
    spawn("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" }).unref();
  for (const scenario of options.scenarios)
    for (const variant of variants) await run(variant, scenario, -1);
  for (let round = 0; round < options.rounds; round++)
    for (const scenario of options.scenarios)
      for (let offset = 0; offset < variants.length; offset++) {
        const variant = variants[(round + offset) % variants.length];
        if (variant && !failedScreens.has(`${variant.label}:${scenario}`))
          await run(variant, scenario, round);
      }
  const summaries = options.scenarios.flatMap((scenario) =>
    variants.flatMap((variant) => {
      const rows = trials.filter(
        (t) => t.variant === variant.label && t.result.scenario === scenario,
      );
      if (!rows.length) return [];
      const medians = rows.map((t) => distribution(t.result.batchesMs).median);
      const phases = rows[0]?.result.phases.map((phase) => ({
        name: phase.name,
        wallMs: distribution(
          rows.map((row) => {
            const found = row.result.phases.find((item) => item.name === phase.name);
            if (!found) throw new Error("Comparison trial is missing a required phase");
            return found.wallMs;
          }),
        ),
      }));
      return [
        {
          scenario,
          variant: variant.label,
          dimensions: options.dimensions,
          processMs: distribution(rows.map((t) => t.processMs)),
          warmBatchMs: distribution(medians),
          phases,
          eligible:
            options.conditions === "isolated-host" &&
            rows.length >= 9 &&
            medians.every((ms) => ms >= 1) &&
            !failures.some((f) => f.variant === variant.label && f.scenario === scenario),
        },
      ];
    }),
  );
  const report = {
    version: 1,
    conditions: options.conditions,
    startedAt,
    finishedAt: new Date().toISOString(),
    directory,
    before: before.directory,
    after: after.directory,
    host: { before: hostBefore, after: hostSnapshot() },
    driverSHA256: hash(import.meta.filename),
    workerSHA256: Object.fromEntries(
      probes.map((file) => [file, hash(join(before.directory, "tools/lab", file))]),
    ),
    manifests: {
      before: hash(join(before.directory, "cohort.json")),
      after: hash(join(after.directory, "cohort.json")),
    },
    options,
    summaries,
    trials,
    failures,
  };
  writeFileSync(join(directory, "report.json"), JSON.stringify(report, null, 2), { flag: "wx" });
  const text = [
    "# Matched runtime comparison",
    "",
    `Conditions: ${options.conditions}; ${options.rounds} rotated serial process trials per successful variant/scenario. All probes are byte-identical. Ineligible rows support no certified speed ratio.`,
    "",
    "| Scenario | Variant | Warm batch median ms | MAD ms | Process median ms | Eligible |",
    "|---|---|---:|---:|---:|---|",
  ];
  for (const row of summaries)
    text.push(
      `| ${row.scenario} | ${row.variant} | ${row.warmBatchMs.median.toFixed(3)} | ${row.warmBatchMs.mad.toFixed(3)} | ${row.processMs.median.toFixed(3)} | ${row.eligible ? "yes" : "no"} |`,
    );
  text.push(
    "",
    "Phase medians are independent process observations; first use and module loading are separate from warm batches.",
    "",
    "| Scenario | Variant | Provider load ms | Setup ms | First use ms |",
    "|---|---|---:|---:|---:|",
  );
  for (const row of summaries) {
    const phase = (name: string) =>
      row.phases?.find((item) => item.name === name)?.wallMs.median.toFixed(3) ?? "missing";
    text.push(
      `| ${row.scenario} | ${row.variant} | ${phase("provider-load")} | ${phase("scenario-setup")} | ${phase("first-use")} |`,
    );
  }
  if (failures.length)
    text.push(
      "",
      "Failures are retained in report.json and per-trial stderr; incomplete behavior is not a speed result.",
    );
  writeFileSync(join(directory, "report.md"), text.join("\n") + "\n", { flag: "wx" });
  return { directory, verifiedTrials: trials.length, failures: failures.length };
}
