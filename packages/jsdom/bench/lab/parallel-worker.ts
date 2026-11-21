// Keeps one provider per worker isolate for independent-document throughput experiments.
import { parentPort, workerData } from "node:worker_threads";
import { z } from "zod";
import { createRequire } from "node:module";
import { join } from "node:path";
import { dimensionsSchema, providerSchema, scenarioSchema } from "./contracts.ts";
import { loadProvider } from "./providers.ts";
import { prepareScenario } from "./scenarios.ts";
const request = z
  .object({
    provider: providerSchema,
    scenario: scenarioSchema,
    dimensions: dimensionsSchema,
    cohort: z.string(),
    lanes: z.number().int().min(1).max(16),
  })
  .parse(workerData);
const port = parentPort;
if (!port) throw new Error("Parallel worker requires a parent port");
const create = await loadProvider(request.provider, request.cohort, request.dimensions);
const messageSchema = z.object({
  id: z.number().int().nonnegative(),
  count: z.number().int().positive().max(100000),
});
const statisticsSchema = z.object({ nativeCalls: z.number().int().nonnegative() });
const native =
  request.provider === "run-dom-rust"
    ? z
        .object({
          getParserStatistics: z.custom<() => unknown>((value) => typeof value === "function"),
        })
        .parse(createRequire(join(request.cohort, "run-dom/package.json"))("@run-dom/html-parser"))
    : undefined;
const nativeCalls = () =>
  native ? statisticsSchema.parse(native.getParserStatistics()).nativeCalls : 0;
port.on("message", async (message: unknown) => {
  const { id, count } = messageSchema.parse(message);
  const beforeNative = nativeCalls();
  // Negative warmup ordinals and disjoint task ranges keep unique HTML unique across
  // prepared workloads and workers, without moving parse work outside measured tasks.
  const offset = id < request.lanes ? -(id + 1) * count : (id - request.lanes) * count;
  const prepared = prepareScenario(
    request.scenario,
    create,
    request.dimensions,
    request.cohort,
    offset,
  );
  const start = performance.now();
  let wallMs = 0;
  try {
    await prepared.run(count);
    prepared.verify(count);
    wallMs = performance.now() - start;
  } finally {
    await prepared.close();
  }
  port.postMessage({ id, wallMs, nativeCalls: nativeCalls() - beforeNative, verified: true });
});
port.postMessage({ ready: true });
