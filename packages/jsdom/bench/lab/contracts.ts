// Defines bounded performance experiments and validates persisted cohort/worker evidence.
import { z } from "zod";

export const providerSchema = z.enum([
  "run-dom",
  "run-dom-rust",
  "jsdom",
  "happy-dom",
  "turbo-dom",
]);
export const scenarioSchema = z.enum([
  "control",
  "windows-create-close",
  "parse-html",
  "parse-html-unique",
  "parse-html-sparse",
  "parse-html-update",
  "parse-html-rotate",
  "parse-html-traverse",
  "fragment-write",
  "fragment-table",
  "fragment-table-read",
  "fragment-list",
  "fragment-list-read",
  "read-tree",
  "query-id-hit",
  "query-id-miss",
  "query-simple",
  "query-complex",
  "query-all",
  "query-all-iterate",
  "query-snapshot",
  "query-after-mutation",
  "query-diverse",
  "query-batched-mutation",
  "list-reconcile",
  "interaction-state",
  "write-attribute",
  "write-text",
  "append-remove",
  "events-construct",
  "events-redispatch",
  "events-dispatch",
  "events-default-action",
  "mutation-observer",
  "style-read",
  "style-snapshot",
  "style-inline-invalidation",
  "style-rule-invalidation",
  "style-inheritance",
  "role-query",
  "clone-subtree",
  "serialize",
  "windows-live",
  "windows-style-live",
]);
export const modeSchema = z.enum(["timing", "memory", "cpu", "allocation"]);
export const dimensionsSchema = z.object({
  size: z.number().int().min(1).max(65536).default(256),
  depth: z.number().int().min(1).max(64).default(4),
  windows: z.number().int().min(1).max(64).default(8),
  operations: z.number().int().min(1).max(100000).default(512),
  batches: z.number().int().min(1).max(101).default(9),
  warmupBatches: z.number().int().min(0).max(101).default(8),
  warmupOperations: z.number().int().min(1).max(100000).default(32),
  turnPolicy: z.enum(["burst", "between-batches"]).default("burst"),
  scriptMode: z.enum(["default", "outside-only", "dangerously"]).default("default"),
});
export type Dimensions = z.infer<typeof dimensionsSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Mode = z.infer<typeof modeSchema>;
export const cohortSchema = z.object({
  version: z.literal(1),
  directory: z.string(),
  createdAt: z.string(),
  node: z.string(),
  platform: z.string(),
  arch: z.string(),
  cpu: z.string(),
  sourceSHA256: z.record(z.string(), z.string()),
  artifactSHA256: z.record(z.string(), z.string()),
  lockSHA256: z.record(z.string(), z.string()),
  runtimeSHA256: z.record(z.string(), z.string()),
  versions: z.record(z.string(), z.string()),
  artifactSource: z
    .object({
      directory: z.string(),
      manifestSHA256: z.string(),
      sourceSHA256: z.record(z.string(), z.string()),
    })
    .optional(),
});
export type Cohort = z.infer<typeof cohortSchema>;
export const requestSchema = z.object({
  provider: providerSchema,
  scenario: scenarioSchema,
  mode: modeSchema,
  dimensions: dimensionsSchema,
  cohort: z.string(),
  output: z.string(),
});
export type Request = z.infer<typeof requestSchema>;
export const memorySchema = z.object({
  rss: z.number().nonnegative(),
  heapTotal: z.number().nonnegative(),
  heapUsed: z.number().nonnegative(),
  external: z.number().nonnegative(),
  arrayBuffers: z.number().nonnegative(),
  peakRssBytes: z.number().nonnegative(),
});
export const phaseSchema = z.object({
  name: z.string(),
  wallMs: z.number().nonnegative(),
  userCpuMs: z.number().nonnegative(),
  systemCpuMs: z.number().nonnegative(),
  startUs: z.number(),
  endUs: z.number(),
  memory: memorySchema,
});
export const resultSchema = z.object({
  version: z.literal(1),
  provider: providerSchema,
  scenario: scenarioSchema,
  mode: modeSchema,
  dimensions: dimensionsSchema,
  phases: z.array(phaseSchema),
  batchesMs: z.array(z.number().nonnegative()),
  memory: z.array(z.object({ checkpoint: z.string(), values: memorySchema })),
  gc: z.array(z.object({ kind: z.number(), startMs: z.number(), durationMs: z.number() })),
  parser: z
    .object({ nativeCalls: z.number(), fallbacks: z.record(z.string(), z.number()) })
    .optional(),
  templateCopies: z
    .object({
      copies: z.number().int().nonnegative(),
      partialRecords: z.number().int().nonnegative(),
      promotions: z.number().int().nonnegative(),
      promotedRecords: z.number().int().nonnegative(),
      idSearches: z.number().int().nonnegative(),
      firstMatchSearches: z.number().int().nonnegative(),
      namedScans: z.number().int().nonnegative().optional(),
    })
    .optional(),
  modules: z.array(z.string()),
  checkedOperations: z.number().int().positive().optional(),
  verified: z.literal(true),
});
export type TrialResult = z.infer<typeof resultSchema>;
export type Trial = {
  round: number;
  processMs: number;
  timeoutMs?: number;
  result: TrialResult;
};
/** Rejects late successful exits even when suspension delayed the kill timer; old reports may lack a budget. */
export function withinProcessBudget(input: { processMs: number; timeoutMs?: number }): boolean {
  return (
    Number.isFinite(input.processMs) &&
    input.processMs >= 0 &&
    (input.timeoutMs === undefined || input.processMs <= input.timeoutMs)
  );
}
export type Failure = {
  round: number;
  provider: Provider;
  scenario: Scenario;
  mode: Mode;
  reason: string;
  stderr: string;
  processMs?: number;
};

/** Describes a distribution of independent trials; p95 of batches is not per-operation tail latency. */
export function distribution(values: readonly number[]): {
  n: number;
  median: number;
  p95: number;
  min: number;
  max: number;
  mad: number;
} {
  if (!values.length || values.some((value) => !Number.isFinite(value)))
    throw new Error("Expected finite nonempty samples");
  const sorted = values.toSorted((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] ?? 0;
  const median = at(0.5);
  const deviations = values.map((value) => Math.abs(value - median)).toSorted((a, b) => a - b);
  return {
    n: values.length,
    median,
    p95: at(0.95),
    min: sorted[0] ?? 0,
    max: sorted.at(-1) ?? 0,
    mad: deviations[Math.ceil(values.length / 2) - 1] ?? 0,
  };
}

/** Compares only verified timing trials with identical dimensions and complete provider coverage. */
export function summarize(trials: readonly Trial[], failures: readonly Failure[]) {
  const groups = new Map<string, Trial[]>();
  for (const trial of trials) {
    const { result } = trial;
    if (result.mode !== "timing" || !withinProcessBudget(trial)) continue;
    const key = JSON.stringify([result.provider, result.scenario, result.dimensions]);
    const group = groups.get(key) ?? [];
    group.push(trial);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const first = group[0];
    if (!first) throw new Error("Expected nonempty trial group");
    const { provider, scenario, dimensions } = first.result;
    const incomplete =
      failures.some(
        (failure) =>
          failure.provider === provider &&
          failure.scenario === scenario &&
          failure.mode === "timing",
      ) ||
      trials.some(
        (trial) =>
          trial.result.mode === "timing" &&
          trial.result.provider === provider &&
          trial.result.scenario === scenario &&
          !withinProcessBudget(trial),
      );
    const phases = first.result.phases.map((phase) => ({
      name: phase.name,
      wallMs: distribution(
        group.map((trial) => {
          const found = trial.result.phases.find((value) => value.name === phase.name);
          if (!found) throw new Error("Trial is missing a required phase");
          return found.wallMs;
        }),
      ),
    }));
    return {
      provider,
      scenario,
      dimensions,
      comparable: !incomplete,
      processMs: distribution(group.map((trial) => trial.processMs)),
      warmBatchMs: distribution(group.flatMap((trial) => trial.result.batchesMs)),
      phases,
    };
  });
}
