// Compares completed WPT harness observations by file, subtest name and occurrence.
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    reference: { type: "string", multiple: true },
    candidate: { type: "string", multiple: true },
  },
});
if (!values.reference?.length || !values.candidate?.length) {
  throw new Error("Supply --reference PATH and --candidate PATH once per JSONL shard.");
}

async function readShards(paths) {
  const files = new Map();
  for (const path of paths) {
    // WPT names can contain Unicode line separators inside valid JSON strings.
    const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
    for (const line of lines) {
      const record = JSON.parse(line);
      if (
        typeof record.path !== "string" ||
        !Number.isInteger(record.harness) ||
        !Array.isArray(record.tests)
      ) {
        throw new Error(`Invalid harness observation in ${path}`);
      }
      const prior = files.get(record.path);
      if (prior) {
        if (
          prior.harness !== record.harness ||
          JSON.stringify(prior.tests) !== JSON.stringify(record.tests)
        ) {
          throw new Error(`Conflicting observations for ${record.path} in ${path}`);
        }
        continue;
      }
      for (const test of record.tests) {
        if (!Array.isArray(test) || typeof test[0] !== "string" || !Number.isInteger(test[1])) {
          throw new Error(`Invalid subtest in ${record.path}`);
        }
      }
      files.set(record.path, record);
    }
  }
  if (!files.size) throw new Error("The supplied shards contain no harness observations.");
  return files;
}

function compareFile(reference, candidate) {
  const occurrences = new Map();
  const observed = new Map();
  for (const [name, status] of candidate?.tests ?? []) {
    const statuses = observed.get(name);
    if (statuses) statuses.push(status);
    else observed.set(name, [status]);
  }
  const result = {
    referencePasses: 0,
    matchedPasses: 0,
    failing: 0,
    missing: 0,
    improved: 0,
    candidateOnlyPasses: 0,
  };
  for (const [name, status] of reference?.tests ?? []) {
    const occurrence = occurrences.get(name) ?? 0;
    occurrences.set(name, occurrence + 1);
    const actual = observed.get(name)?.[occurrence];
    if (status !== 0) {
      if (actual === 0) result.improved++;
      continue;
    }
    result.referencePasses++;
    if (actual === 0) result.matchedPasses++;
    else if (actual === undefined) result.missing++;
    else result.failing++;
  }
  for (const [name, statuses] of observed) {
    for (let i = occurrences.get(name) ?? 0; i < statuses.length; i++) {
      if (statuses[i] === 0) result.candidateOnlyPasses++;
    }
  }
  return result;
}

const [reference, candidate] = await Promise.all([
  readShards(values.reference),
  readShards(values.candidate),
]);
const totals = compareFile(undefined, undefined);
const gaps = [];
let harnessLosses = 0;
for (const path of new Set([...reference.keys(), ...candidate.keys()])) {
  const before = reference.get(path);
  const after = candidate.get(path);
  const result = compareFile(before, after);
  for (const key of Object.keys(totals)) totals[key] += result[key];
  const harnessLoss = before?.harness === 0 && after?.harness !== 0;
  if (harnessLoss) harnessLosses++;
  if (result.failing || result.missing || harnessLoss || (before && !after)) {
    gaps.push({
      path,
      failing: result.failing,
      missing: result.missing,
      harnessLoss,
      fileMissing: !after,
    });
  }
}
gaps.sort((a, b) => b.failing + b.missing - a.failing - a.missing || a.path.localeCompare(b.path));
console.log(
  JSON.stringify(
    {
      referenceFiles: reference.size,
      candidateFiles: candidate.size,
      ...totals,
      harnessLosses,
      gaps,
    },
    null,
    2,
  ),
);
if (gaps.length) process.exitCode = 1;
