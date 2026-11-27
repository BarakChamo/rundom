// Runs the fresh-process probe scenarios under the platform's instruction counter and checks deterministic counts against a budget.
// usage: node packages/jsdom/bench/lab/probe.ts [--entry dist/jsdom.cjs] [--repeat 3] [--out probe.json] [--budget probe-budget.json]
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";

export const probeScenarios = [
  "create",
  "globals-read",
  "first-query",
  "first-computed-style",
  "visibility-reads",
  "click",
  "append-remove",
  "domparser-repeat",
  "window-create-close",
] as const;

const countsSchema = z.object({
  cjsModules: z.number(),
  builtinModules: z.number(),
  windowKeys: z.number(),
  interfaces: z.number(),
  cssGrammarInitialized: z.number(),
});
const scenarioOutputSchema = z.object({
  scenario: z.string(),
  operations: z.number(),
  counts: countsSchema,
  runDomModules: z.array(z.string()),
  cpuMs: z.object({ setup: z.number(), scenario: z.number() }),
  maxRssKiB: z.number(),
});
/** Inclusive `[min, max]` bounds per scenario and deterministic count; timing is never budgeted. */
export const budgetSchema = z.record(
  z.string(),
  z.partialRecord(countsSchema.keyof(), z.tuple([z.number(), z.number()])),
);
export type Counts = z.infer<typeof countsSchema>;
export type Budget = z.infer<typeof budgetSchema>;

/** Process-wide instructions retired from BSD `time -l` or `perf stat -x,` output; null when the platform gave none. */
export function parseInstructions(stderr: string): number | null {
  const bsd = /(\d+)\s+instructions retired/.exec(stderr);
  if (bsd) return Number(bsd[1]);
  const perf = /^(\d+),[^,]*,instructions(?::u)?,/m.exec(stderr);
  return perf ? Number(perf[1]) : null;
}

/** Lists every count outside its budget, e.g. `globals-read cjsModules 14 outside [0, 12]`. */
export function checkBudget(budget: Budget, counts: Readonly<Record<string, Counts>>): string[] {
  return Object.entries(budget).flatMap(([scenario, limits]) => {
    const measured = counts[scenario];
    if (!measured) return [`${scenario} was not measured`];
    return Object.entries(limits).flatMap(([name, [min, max]]) => {
      const value = measured[name as keyof Counts];
      return value >= min && value <= max
        ? []
        : [`${scenario} ${name} ${value} outside [${min}, ${max}]`];
    });
  });
}

function counter(): { name: string; prefix: string[] } {
  if (process.platform === "darwin") return { name: "time -l", prefix: ["/usr/bin/time", "-l"] };
  if (process.platform === "linux") {
    const perf = spawnSync("perf", ["stat", "-x,", "-e", "instructions:u", "true"], {
      encoding: "utf8",
    });
    if (perf.status === 0 && parseInstructions(perf.stderr) !== null)
      return { name: "perf stat", prefix: ["perf", "stat", "-x,", "-e", "instructions:u", "--"] };
  }
  return { name: "none (CPU time only)", prefix: [] };
}

const median = (values: number[]): number => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

function measure(entry: string, scenario: string, repeat: number, prefix: string[]) {
  const child = fileURLToPath(new URL("./probe-scenario.cjs", import.meta.url));
  const runs = Array.from({ length: repeat }, () => {
    const [command, ...args] = [
      ...prefix,
      process.execPath,
      "--single-threaded",
      child,
      entry,
      scenario,
    ];
    const result = spawnSync(command!, args, { encoding: "utf8", timeout: 120_000 });
    if (result.status !== 0)
      throw new Error(`probe ${scenario} failed (${result.status}): ${result.stderr}`);
    return {
      output: scenarioOutputSchema.parse(JSON.parse(result.stdout)),
      instructions: parseInstructions(result.stderr),
    };
  });
  const first = runs[0]!.output;
  const instructions = runs.flatMap((run) => (run.instructions === null ? [] : [run.instructions]));
  const scenarioCpu = runs.map((run) => run.output.cpuMs.scenario);
  return {
    operations: first.operations,
    counts: first.counts,
    // Counts must not move between identical runs; a mismatch means the probe itself is nondeterministic.
    countsStable: runs.every(
      (run) => JSON.stringify(run.output.counts) === JSON.stringify(first.counts),
    ),
    runDomModules: first.runDomModules,
    instructions: instructions.length
      ? { median: median(instructions), min: Math.min(...instructions) }
      : null,
    scenarioCpuMs: { median: median(scenarioCpu), min: Math.min(...scenarioCpu) },
    setupCpuMs: median(runs.map((run) => run.output.cpuMs.setup)),
    maxRssKiB: median(runs.map((run) => run.output.maxRssKiB)),
  };
}

function main(): void {
  const { values } = parseArgs({
    options: {
      entry: {
        type: "string",
        default: fileURLToPath(new URL("../../dist/jsdom.cjs", import.meta.url)),
      },
      repeat: { type: "string", default: "3" },
      scenarios: { type: "string", default: probeScenarios.join(",") },
      out: { type: "string" },
      budget: { type: "string" },
    },
  });
  const entry = resolve(values.entry);
  const repeat = Number(values.repeat);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 25)
    throw new Error("--repeat must be an integer from 1 to 25");
  const tool = counter();
  const results = Object.fromEntries(
    values.scenarios
      .split(",")
      .map((scenario) => [scenario, measure(entry, scenario, repeat, tool.prefix)]),
  );
  const report = {
    entry,
    revision:
      spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).stdout.trim() ||
      null,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    counter: tool.name,
    repeat,
    scenarios: results,
  };
  const json = JSON.stringify(report, null, 2) + "\n";
  if (values.out) writeFileSync(values.out, json);
  else process.stdout.write(json);

  const fmt = (value: number | null | undefined, digits = 1) =>
    value == null ? "-" : value.toFixed(digits);
  const rows = Object.entries(results).map(([scenario, r]) => {
    const c = r.counts;
    return `${scenario.padEnd(22)} ${String(c.cjsModules).padStart(4)} ${String(c.builtinModules).padStart(5)} ${String(c.interfaces).padStart(5)} ${String(c.cssGrammarInitialized).padStart(4)} ${fmt(r.instructions && r.instructions.median / 1e6, 0).padStart(8)} ${fmt(r.scenarioCpuMs.median).padStart(9)} ${fmt(r.scenarioCpuMs.min).padStart(9)}${r.countsStable ? "" : "  UNSTABLE COUNTS"}`;
  });
  process.stderr.write(
    `counter: ${tool.name}; ${repeat} fresh processes per scenario; instructions are whole-process (subtract "create" for the scenario's share)\n` +
      `scenario                cjs built ifaces gram  Minstr cpu-med-ms cpu-min-ms\n${rows.join("\n")}\n`,
  );

  if (values.budget) {
    const budget = budgetSchema.parse(JSON.parse(readFileSync(values.budget, "utf8")));
    const breaches = checkBudget(
      budget,
      Object.fromEntries(Object.entries(results).map(([k, r]) => [k, r.counts])),
    );
    process.stderr.write(
      breaches.length
        ? `budget breaches:\n  ${breaches.join("\n  ")}\n`
        : "budget: all counts within bounds\n",
    );
    if (breaches.length) process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
