// Runs a fresh whole-process pool trial so worker startup, peak RSS and lifecycle costs have a clean boundary.
import { parallelRequestSchema, parallelResultSchema, parallelTrial } from "./parallel.ts";
const request = parallelRequestSchema.parse(JSON.parse(process.argv[2] ?? "null"));
process.stdout.write(
  JSON.stringify(parallelResultSchema.parse(await parallelTrial(request))) + "\n",
);
