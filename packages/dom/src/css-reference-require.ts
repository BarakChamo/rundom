// Routes CSS reference requests in the built Window to the code-cached reference artifact, keeping one module graph per process.
// scripts/build-window.mjs substitutes this module for node:module in sources that request
// rundom-css-reference; unbuilt sources keep Node's createRequire and the raw package files.
import { createRequire as createNodeRequire } from "node:module";

const prefix = "rundom-css-reference/";
const requireArtifact = createNodeRequire(import.meta.url);
let reference: { load(path: string): unknown } | undefined;

/** Node's createRequire, except reference package paths resolve inside dist/css-reference.cjs. */
export function createRequire(url: string | URL): NodeJS.Require {
  const nodeRequire = createNodeRequire(url);
  const routed = (id: string): unknown =>
    id.startsWith(prefix)
      ? (reference ??= requireArtifact("./css-reference.cjs")).load(id.slice(prefix.length))
      : nodeRequire(id);
  return Object.assign(routed, nodeRequire);
}
