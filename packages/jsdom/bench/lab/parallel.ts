// Measures independent-document throughput in persistent worker isolates, including pool startup and cleanup costs.
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  distribution,
  dimensionsSchema,
  providerSchema,
  scenarioSchema,
  type Dimensions,
  type Provider,
  type Scenario,
} from "./contracts.ts";
const responseSchema = z.union([
  z.object({ ready: z.literal(true) }),
  z.object({
    id: z.number().int(),
    wallMs: z.number().nonnegative(),
    nativeCalls: z.number().int().nonnegative(),
    verified: z.literal(true),
  }),
]);

export const parallelRequestSchema = z.object({
  provider: providerSchema,
  scenario: scenarioSchema,
  dimensions: dimensionsSchema,
  cohort: z.string(),
  lanes: z.number().int().min(1).max(16),
  tasks: z.number().int().min(1).max(256),
});
export const parallelResultSchema = z.object({
  provider: providerSchema,
  scenario: scenarioSchema,
  dimensions: dimensionsSchema,
  lanes: z.number().int(),
  tasks: z.number().int(),
  startupMs: z.number(),
  wallMs: z.number(),
  operationsPerSecond: z.number(),
  processUserCpuMs: z.number(),
  processSystemCpuMs: z.number(),
  processRssBytes: z.number(),
  peakProcessRssBytes: z.number(),
  taskSamplesMs: z.array(z.number()),
  taskWorkMs: z.object({
    n: z.number(),
    median: z.number(),
    p95: z.number(),
    min: z.number(),
    max: z.number(),
    mad: z.number(),
  }),
  scope: z.string(),
  nativeCalls: z.number().int().nonnegative(),
});

/** Runs bounded tasks over independent DOMs. Shared mutable DOM parallelism is outside this contract. */
export async function parallelTrial(input: {
  provider: Provider;
  scenario: Scenario;
  dimensions: Dimensions;
  cohort: string;
  lanes: number;
  tasks: number;
}) {
  const { lanes, tasks, dimensions } = input;
  const start = performance.now(),
    workers: Worker[] = [];
  const ready = new Set<Worker>();
  const pending = new Map<
    number,
    { resolve: (milliseconds: number) => void; reject: (error: Error) => void }
  >();
  let measuredNativeCalls = 0;
  let rejectReady: (error: Error) => void = () => {};
  let readyResolve: () => void = () => {};
  const allReady = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    rejectReady = reject;
  });
  const timer = setTimeout(() => {
    const error = new Error("Parallel trial exceeded 120 seconds");
    rejectReady(error);
    for (const item of pending.values()) item.reject(error);
  }, 120000);
  const fail = (error: Error) => {
    rejectReady(error);
    for (const item of pending.values()) item.reject(error);
  };
  function submit(worker: Worker, id: number): Promise<number> {
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, count: dimensions.operations });
    });
  }
  try {
    for (let index = 0; index < lanes; index++) {
      const worker = new Worker(join(input.cohort, "tools/lab/parallel-worker.ts"), {
        workerData: input,
        env: {
          ...process.env,
          NODE_OPTIONS: "",
          RUN_DOM_HTML_PARSER: input.provider === "run-dom-rust" ? "rust" : "",
        },
        execArgv: ["--import", pathToFileURL(join(input.cohort, "guard.mjs")).href],
      });
      worker.on("error", fail);
      worker.on("exit", (code) => {
        if (code !== 0) fail(new Error(`Worker exited ${code}`));
      });
      worker.on("message", (message: unknown) => {
        const parsed = responseSchema.safeParse(message);
        if (!parsed.success) {
          fail(new Error("Invalid parallel worker response"));
          return;
        }
        if ("ready" in parsed.data) {
          ready.add(worker);
          if (ready.size === lanes) readyResolve();
          return;
        }
        const item = pending.get(parsed.data.id);
        if (!item) {
          fail(new Error("Unexpected parallel task completion"));
          return;
        }
        if (parsed.data.id >= lanes) measuredNativeCalls += parsed.data.nativeCalls;
        pending.delete(parsed.data.id);
        item.resolve(parsed.data.wallMs);
      });
      workers.push(worker);
    }
    await allReady;
    const startupMs = performance.now() - start;
    await Promise.all(workers.map((worker, index) => submit(worker, index)));
    const cpu = process.cpuUsage(),
      workStart = performance.now();
    let next = lanes;
    const samples: number[] = [];
    await Promise.all(
      workers.map(async (worker) => {
        // The shared queue has an explicit task bound; each task owns its documents.
        while (next < lanes + tasks) {
          const id = next++;
          samples.push(await submit(worker, id));
        }
      }),
    );
    const wallMs = performance.now() - workStart,
      usage = process.cpuUsage(cpu),
      memory = process.memoryUsage();
    return {
      provider: input.provider,
      scenario: input.scenario,
      dimensions,
      lanes,
      tasks,
      startupMs,
      wallMs,
      operationsPerSecond: ((tasks * dimensions.operations) / wallMs) * 1000,
      processUserCpuMs: usage.user / 1000,
      processSystemCpuMs: usage.system / 1000,
      processRssBytes: memory.rss,
      peakProcessRssBytes: process.resourceUsage().maxRSS * 1024,
      nativeCalls: measuredNativeCalls,
      taskWorkMs: distribution(samples),
      taskSamplesMs: samples,
      scope:
        "Persistent worker isolates; startup separate; throughput wall includes messaging and scheduling, task work excludes setup/close; RSS and CPU cover the entire process and are never summed across threads.",
    };
  } finally {
    clearTimeout(timer);
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}
