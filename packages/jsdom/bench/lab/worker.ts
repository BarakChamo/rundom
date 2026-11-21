// Runs one isolated verified trial; diagnostic profilers and forced GC never enter timing comparisons.
import { Session } from "node:inspector/promises";
import { performance, PerformanceObserver } from "node:perf_hooks";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { requestSchema, resultSchema, type TrialResult } from "./contracts.ts";
import { loadProvider } from "./providers.ts";
import { prepareScenario, type Prepared } from "./scenarios.ts";

const request = requestSchema.parse(JSON.parse(process.argv[2] ?? "null"));
const { mode, provider, scenario, dimensions, cohort, output } = request;
const require = createRequire(import.meta.url);
const phases: TrialResult["phases"] = [],
  memory: TrialResult["memory"] = [],
  gc: TrialResult["gc"] = [];
const observer =
  mode === "timing"
    ? undefined
    : new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const detail: unknown = Reflect.get(entry, "detail");
          const kind =
            typeof detail === "object" &&
            detail !== null &&
            "kind" in detail &&
            typeof detail.kind === "number"
              ? detail.kind
              : -1;
          gc.push({ kind, startMs: entry.startTime, durationMs: entry.duration });
        }
      });
observer?.observe({ entryTypes: ["gc"] });
const session = mode === "cpu" || mode === "allocation" ? new Session() : undefined;
session?.connect();
if (mode === "cpu") {
  await session?.post("Profiler.enable");
  await session?.post("Profiler.setSamplingInterval", { interval: 100 });
}
if (mode === "allocation") await session?.post("HeapProfiler.enable");
function snapshot() {
  return { ...process.memoryUsage(), peakRssBytes: process.resourceUsage().maxRSS * 1024 };
}
async function checkpoint(name: string) {
  if (mode === "memory") {
    if (!globalThis.gc) throw new Error("Memory experiments require --expose-gc");
    // Separate turns permit weak references and finalizers to become eligible; this is not production behavior.
    for (let index = 0; index < 3; index++) {
      await setImmediate();
      globalThis.gc();
    }
  }
  memory.push({ checkpoint: name, values: snapshot() });
}
async function phase<T>(name: string, operation: () => T | Promise<T>): Promise<T> {
  if (mode === "cpu") await session?.post("Profiler.start");
  if (mode === "allocation")
    await session?.post("HeapProfiler.startSampling", {
      samplingInterval: 16384,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
  const cpu = process.cpuUsage(),
    startUs = Number(process.hrtime.bigint() / 1000n),
    start = performance.now();
  const result = await operation();
  const wallMs = performance.now() - start,
    endUs = Number(process.hrtime.bigint() / 1000n),
    usage = process.cpuUsage(cpu);
  phases.push({
    name,
    wallMs,
    userCpuMs: usage.user / 1000,
    systemCpuMs: usage.system / 1000,
    startUs,
    endUs,
    memory: snapshot(),
  });
  if (mode === "cpu")
    writeFileSync(
      join(output, `${name}.cpuprofile`),
      JSON.stringify((await session?.post("Profiler.stop"))?.profile),
      { flag: "wx" },
    );
  if (mode === "allocation")
    writeFileSync(
      join(output, `${name}.heapprofile`),
      JSON.stringify((await session?.post("HeapProfiler.stopSampling"))?.profile),
      { flag: "wx" },
    );
  return result;
}
await checkpoint("harness");
const create = await phase("provider-load", () => loadProvider(provider, cohort, dimensions));
await checkpoint("provider-loaded");
let prepared: Prepared | undefined = await phase("scenario-setup", () =>
  prepareScenario(scenario, create, dimensions, cohort),
);
await checkpoint("live-before-use");
let checkedOperations = 1;
await phase("first-use", () => prepared?.run(1));
prepared.verify(checkedOperations);
await checkpoint("after-first-use");
await phase("warmup", async () => {
  // Fixed bounded warmup, recorded independently from the measured batch sizes.
  for (let index = 0; index < dimensions.warmupBatches; index++) {
    if (dimensions.turnPolicy === "between-batches") await setImmediate();
    const count = Math.min(dimensions.operations, dimensions.warmupOperations);
    await prepared?.run(count);
    checkedOperations += count;
  }
});
prepared.verify(checkedOperations);
const batchesMs: number[] = [];
for (let index = 0; index < dimensions.batches; index++) {
  if (dimensions.turnPolicy === "between-batches") await setImmediate();
  await phase(`batch-${index}`, () => prepared?.run(dimensions.operations));
  checkedOperations += dimensions.operations;
  prepared.verify(checkedOperations);
  const latest = phases.at(-1);
  if (!latest) throw new Error("Missing completed batch");
  batchesMs.push(latest.wallMs);
}
await checkpoint("after-work");
await phase("close", () => prepared?.close());
await checkpoint("closed-handles-retained");
prepared = undefined;
await checkpoint("references-released");
await setImmediate();
observer?.disconnect();
session?.disconnect();
const parser =
  provider === "run-dom-rust"
    ? require(
        createRequire(join(cohort, "run-dom/package.json")).resolve("@run-dom/html-parser"),
      ).getParserStatistics()
    : undefined;

let templateCopies: unknown;
if (provider === "run-dom" || provider === "run-dom-rust") {
  const runtime: unknown = createRequire(join(cohort, "run-dom/package.json"))("@run-dom/dom");
  if (
    typeof runtime === "object" &&
    runtime !== null &&
    "getTemplateCopyStatistics" in runtime &&
    typeof runtime.getTemplateCopyStatistics === "function"
  )
    templateCopies = runtime.getTemplateCopyStatistics();
}
const result = resultSchema.parse({
  version: 1,
  provider,
  scenario,
  mode,
  dimensions,
  phases,
  batchesMs,
  memory,
  gc,
  ...(parser ? { parser } : {}),
  ...(templateCopies === undefined ? {} : { templateCopies }),
  modules: mode === "timing" ? [] : Object.keys(require.cache),
  checkedOperations,
  verified: true,
});
writeFileSync(join(output, "result.json"), JSON.stringify(result, null, 2), { flag: "wx" });
