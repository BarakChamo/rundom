// Adapts command-line arguments to the performance laboratory workflow.
import { runLaboratory } from "./laboratory.ts";
await runLaboratory(process.argv.slice(2));
