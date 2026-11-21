// Turns verified raw trials into phase, memory and attribution reports without changing measurement evidence.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  resultSchema,
  providerSchema,
  scenarioSchema,
  modeSchema,
  distribution,
} from "./contracts.ts";
const reportSchema = z.object({
  directory: z.string(),
  cohort: z.string(),
  mode: modeSchema,
  conditions: z.enum(["shared-host", "isolated-host"]).default("shared-host"),
  trials: z.array(z.object({ round: z.number(), processMs: z.number(), result: resultSchema })),
  failures: z.array(
    z.object({ provider: providerSchema, scenario: scenarioSchema, reason: z.string() }),
  ),
});
const locationSchema = z.object({
  function: z.string(),
  source: z.string(),
  line: z.number(),
  column: z.number(),
});
const attributionSchema = z.array(
  z.discriminatedUnion("mode", [
    z.object({
      name: z.string(),
      mode: z.literal("cpu"),
      durationMs: z.number(),
      phaseWallMs: z.number().optional(),
      instrumentationSelfMs: z.number().default(0),
      samples: z.number(),
      rows: z.array(
        locationSchema.extend({
          selfMs: z.number(),
          inclusiveMs: z.number(),
          isInstrumentation: z.boolean().default(false),
        }),
      ),
    }),
    z.object({
      name: z.string(),
      mode: z.literal("allocation"),
      rows: z.array(locationSchema.extend({ sampledBytes: z.number() })),
    }),
  ]),
);

/** Writes analysis.json/md beside raw report.json; diagnostics stay separate from speed comparisons. */
export function analyzeReport(directory: string): void {
  const report = reportSchema.parse(
    JSON.parse(readFileSync(join(directory, "report.json"), "utf8")),
  );
  const groups = new Map<string, typeof report.trials>();
  for (const trial of report.trials) {
    const key = JSON.stringify([
      trial.result.provider,
      trial.result.scenario,
      trial.result.dimensions,
    ]);
    const group = groups.get(key) ?? [];
    group.push(trial);
    groups.set(key, group);
  }
  const rows = [...groups.values()].map((trials) => {
    const first = trials[0];
    if (!first) throw new Error("Empty evidence group");
    const { provider, scenario, dimensions } = first.result;
    const phases = first.result.phases
      .filter((phase) => !phase.name.startsWith("batch-"))
      .map((phase) => ({
        name: phase.name,
        wallMs: distribution(
          trials.map((trial) => {
            const match = trial.result.phases.find((item) => item.name === phase.name);
            if (!match) throw new Error("Missing trial phase");
            return match.wallMs;
          }),
        ),
      }));
    const checkpoints = first.result.memory.map((checkpoint) => {
      const fields = Object.keys(checkpoint.values);
      return {
        checkpoint: checkpoint.checkpoint,
        bytes: Object.fromEntries(
          fields.map((field) => [
            field,
            distribution(
              trials.map((trial) => {
                const match = trial.result.memory.find(
                  (item) => item.checkpoint === checkpoint.checkpoint,
                );
                if (!match) throw new Error("Missing memory checkpoint");
                const value: unknown = Reflect.get(match.values, field);
                if (typeof value !== "number") throw new Error("Invalid memory metric");
                return value;
              }),
            ),
          ]),
        ),
      };
    });
    const eligibility =
      report.mode === "timing" &&
      report.conditions === "isolated-host" &&
      trials.length >= 9 &&
      trials.every((trial) => distribution(trial.result.batchesMs).median >= 1) &&
      !report.failures.some(
        (failure) => failure.provider === provider && failure.scenario === scenario,
      );
    return {
      provider,
      scenario,
      dimensions,
      eligibility,
      shortBatches: trials.some((trial) => distribution(trial.result.batchesMs).median < 1),
      trials: trials.length,
      phases,
      checkpoints,
      processMs: distribution(trials.map((trial) => trial.processMs)),
      warmTrialMedianMs: distribution(
        trials.map((trial) => distribution(trial.result.batchesMs).median),
      ),
      parser: trials.map((trial) => trial.result.parser).filter((value) => value !== undefined),
    };
  });
  const profileGroups = new Map<
    string,
    {
      provider: string;
      scenario: string;
      phase: string;
      mode: string;
      samples: number;
      durationMs: number;
      phaseWallMs: number;
      instrumentationSelfMs: number;
      rows: Map<
        string,
        {
          function: string;
          source: string;
          line: number;
          column: number;
          selfMs: number;
          inclusiveMs: number;
          sampledBytes: number;
          isInstrumentation?: boolean;
        }
      >;
    }
  >();
  if (report.mode === "cpu" || report.mode === "allocation")
    for (const trial of report.trials) {
      const { provider, scenario } = trial.result;
      const profiles = attributionSchema.parse(
        JSON.parse(
          readFileSync(
            join(directory, `${scenario}-${provider}-${trial.round}`, "attribution.json"),
            "utf8",
          ),
        ),
      );
      for (const profile of profiles) {
        const phase = profile.name.startsWith("batch-")
          ? "warm-batches"
          : profile.name.replace(/\.(?:cpu|heap)profile$/, "");
        const key = `${provider}:${scenario}:${phase}`;
        const group = profileGroups.get(key) ?? {
          provider,
          scenario,
          phase,
          mode: profile.mode,
          samples: 0,
          durationMs: 0,
          phaseWallMs: 0,
          instrumentationSelfMs: 0,
          rows: new Map(),
        };
        if (profile.mode === "cpu") {
          group.samples += profile.samples;
          group.durationMs += profile.durationMs;
          group.phaseWallMs += profile.phaseWallMs ?? 0;
          group.instrumentationSelfMs += profile.instrumentationSelfMs;
        }
        for (const row of profile.rows) {
          const rowKey = JSON.stringify([row.function, row.source, row.line, row.column]);
          const existing = group.rows.get(rowKey) ?? {
            ...row,
            selfMs: 0,
            inclusiveMs: 0,
            sampledBytes: 0,
          };
          if ("sampledBytes" in row) existing.sampledBytes += row.sampledBytes;
          else {
            existing.selfMs += row.selfMs;
            existing.inclusiveMs += row.inclusiveMs;
          }
          group.rows.set(rowKey, existing);
        }
        profileGroups.set(key, group);
      }
    }
  const profiles = [...profileGroups.values()].map((group) => ({
    ...group,
    rows: [...group.rows.values()].toSorted((a, b) =>
      group.mode === "cpu" ? b.selfMs - a.selfMs : b.sampledBytes - a.sampledBytes,
    ),
  }));
  const analysis = {
    cohort: report.cohort,
    mode: report.mode,
    rows,
    profiles,
    failures: report.failures,
  };
  writeFileSync(join(directory, "analysis.json"), JSON.stringify(analysis, null, 2));
  const text = [
    "# Performance evidence",
    "",
    `Mode: ${report.mode}. Host conditions: ${report.conditions}. Timing eligibility requires an isolated host, nine independent verified trials and no scenario failure. Diagnostic times cannot establish speed ratios.`,
    "",
  ];
  if (report.mode === "timing") {
    text.push(
      "| Scenario | Provider | Load ms | Setup ms | First ms | Warm batch ms | Trial MAD ms | Eligible |",
      "|---|---|---:|---:|---:|---:|---:|---|",
    );
    for (const row of rows) {
      const phase = (name: string) =>
        row.phases.find((phase) => phase.name === name)?.wallMs.median.toFixed(3) ?? "?";
      text.push(
        `| ${row.scenario} | ${row.provider} | ${phase("provider-load")} | ${phase("scenario-setup")} | ${phase("first-use")} | ${row.warmTrialMedianMs.median.toFixed(3)} | ${row.warmTrialMedianMs.mad.toFixed(3)} | ${row.eligibility ? "yes" : "no"} |`,
      );
    }
  } else if (report.mode === "memory") {
    text.push(
      "| Scenario | Provider | Live windows | Checkpoint | Heap MiB | External MiB | RSS MiB |",
      "|---|---|---:|---|---:|---:|---:|",
    );
    for (const row of rows)
      for (const checkpoint of row.checkpoints) {
        const value = (name: string) =>
          ((checkpoint.bytes[name]?.median ?? 0) / 1024 ** 2).toFixed(2);
        text.push(
          `| ${row.scenario} | ${row.provider} | ${row.dimensions.windows} | ${checkpoint.checkpoint} | ${value("heapUsed")} | ${value("external")} | ${value("rss")} |`,
        );
      }
  } else
    for (const profile of profiles) {
      text.push(
        `## ${profile.provider}: ${profile.scenario} / ${profile.phase}`,
        "",
        `Diagnostic ${profile.mode}; ${profile.samples} CPU samples. Inclusive time overlaps; allocation bytes are sampling estimates.`,
        "",
        "| Function | Source | Self ms | Inclusive ms | Sampled bytes |",
        "|---|---|---:|---:|---:|",
      );
      for (const row of profile.rows.filter((row) => !row.isInstrumentation).slice(0, 15))
        text.push(
          `| ${row.function.replaceAll("|", "/") || "anonymous"} | ${row.source}:${row.line} | ${row.selfMs.toFixed(3)} | ${row.inclusiveMs.toFixed(3)} | ${row.sampledBytes} |`,
        );
      text.push("");
    }
  if (report.failures.length)
    text.push(
      "",
      "Failures remain in raw reports; no performance ratio is assigned to missing behavior.",
    );
  writeFileSync(join(directory, "analysis.md"), text.join("\n") + "\n");
}
