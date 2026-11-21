// Converts V8 diagnostic samples into source-attributed self/inclusive costs while retaining DevTools originals.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { SourceMap } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { resultSchema } from "./contracts.ts";
const frameSchema = z.object({
  functionName: z.string(),
  url: z.string(),
  lineNumber: z.number(),
  columnNumber: z.number(),
});
const nodeSchema = z.object({
  id: z.number(),
  callFrame: frameSchema,
  children: z.array(z.number()).optional(),
});
const cpuSchema = z.object({
  nodes: z.array(nodeSchema),
  samples: z.array(z.number()).optional(),
  timeDeltas: z.array(z.number()).optional(),
  startTime: z.number(),
  endTime: z.number(),
});
type HeapNode = { callFrame: z.infer<typeof frameSchema>; selfSize: number; children: HeapNode[] };
const heapNodeSchema: z.ZodType<HeapNode> = z.lazy(() =>
  z.object({ callFrame: frameSchema, selfSize: z.number(), children: z.array(heapNodeSchema) }),
);
const heapSchema = z.object({ head: heapNodeSchema });
const mapSchema = z.object({
  version: z.number(),
  file: z.string().default(""),
  sources: z.array(z.string()),
  sourcesContent: z
    .array(z.string().nullable())
    .default([])
    .transform((values) => values.map((value) => value ?? "")),
  names: z.array(z.string()),
  mappings: z.string(),
  sourceRoot: z.string().default(""),
});
const maps = new Map<string, SourceMap | undefined>();
function location(frame: z.infer<typeof frameSchema>) {
  const path = frame.url.startsWith("file:") ? fileURLToPath(frame.url) : frame.url;
  if (!maps.has(path)) {
    const mapPath = path + ".map";
    maps.set(
      path,
      path && existsSync(mapPath)
        ? new SourceMap(mapSchema.parse(JSON.parse(readFileSync(mapPath, "utf8"))))
        : undefined,
    );
  }
  const entry = maps.get(path)?.findEntry(frame.lineNumber, frame.columnNumber);
  if (entry && "originalSource" in entry)
    return {
      function: frame.functionName,
      source: entry.originalSource,
      line: entry.originalLine + 1,
      column: entry.originalColumn + 1,
    };
  return {
    function: frame.functionName,
    source: path,
    line: frame.lineNumber + 1,
    column: frame.columnNumber + 1,
  };
}
/** Writes diagnostic attribution. Inclusive costs overlap, and sampled allocation bytes are estimates, not retained heap size. */
export function summarizeProfiles(directory: string): void {
  const profiles = [];
  const trial = resultSchema.parse(
    JSON.parse(readFileSync(join(directory, "result.json"), "utf8")),
  );
  for (const name of readdirSync(directory).filter((name) =>
    /\.(?:cpuprofile|heapprofile)$/.test(name),
  )) {
    if (name.endsWith(".cpuprofile")) {
      const profile = cpuSchema.parse(JSON.parse(readFileSync(join(directory, name), "utf8")));
      const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
      const parents = new Map<number, number>();
      for (const node of profile.nodes)
        for (const child of node.children ?? []) parents.set(child, node.id);
      const self = new Map<number, number>(),
        inclusive = new Map<number, number>();
      for (const [index, id] of (profile.samples ?? []).entries()) {
        const delta = profile.timeDeltas?.[index] ?? 0;
        self.set(id, (self.get(id) ?? 0) + delta);
        let current: number | undefined = id,
          remaining = nodes.size;
        // Inspector trees are finite; the bound also rejects cyclic/corrupt input.
        while (current !== undefined && remaining-- > 0) {
          inclusive.set(current, (inclusive.get(current) ?? 0) + delta);
          current = parents.get(current);
        }
        if (current !== undefined) throw new Error("CPU profile parent cycle");
      }
      const rows = [...nodes.values()]
        .map((node) => ({
          ...location(node.callFrame),
          selfMs: (self.get(node.id) ?? 0) / 1000,
          inclusiveMs: (inclusive.get(node.id) ?? 0) / 1000,
        }))
        .filter((row) => row.inclusiveMs > 0)
        .toSorted((a, b) => b.selfMs - a.selfMs);
      profiles.push({
        name,
        mode: "cpu",
        durationMs: (profile.endTime - profile.startTime) / 1000,
        samples: profile.samples?.length ?? 0,
        phaseWallMs: trial.phases.find((phase) => phase.name === name.replace(".cpuprofile", ""))
          ?.wallMs,
        instrumentationSelfMs: rows
          .filter((row) => row.source === "node:inspector" || row.source.endsWith("/lab/worker.ts"))
          .reduce((sum, row) => sum + row.selfMs, 0),
        rows: rows.map((row) => ({
          ...row,
          isInstrumentation:
            row.source === "node:inspector" || row.source.endsWith("/lab/worker.ts"),
        })),
      });
    } else {
      const { head } = heapSchema.parse(JSON.parse(readFileSync(join(directory, name), "utf8")));
      const rows = [],
        stack = [head];
      // Each child is visited once; the profile schema is a finite JSON tree.
      while (stack.length) {
        const node = stack.pop();
        if (!node) break;
        if (node.selfSize) rows.push({ ...location(node.callFrame), sampledBytes: node.selfSize });
        stack.push(...node.children);
      }
      profiles.push({
        name,
        mode: "allocation",
        rows: rows.toSorted((a, b) => b.sampledBytes - a.sampledBytes),
      });
    }
  }
  writeFileSync(join(directory, "attribution.json"), JSON.stringify(profiles, null, 2), {
    flag: "w",
  });
}
