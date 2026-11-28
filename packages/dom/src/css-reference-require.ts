// Routes CSS reference requests in the built Window to the code-cached reference artifacts, keeping one module graph per process.
// scripts/build-window.mjs substitutes this module for node:module in sources that request
// rundom-css-reference; unbuilt sources keep Node's createRequire and the raw package files.
import { createRequire as createNodeRequire } from "node:module";

const prefix = "rundom-css-reference/";
const interfacePrefix = "lib/generated/idl/";
const requireArtifact = createNodeRequire(import.meta.url);
type Artifact = { load(path: string): unknown };
let reference: Artifact | undefined;
let interfaces: Artifact | undefined;
let properties: (Artifact & { has(path: string): boolean }) | undefined;

// Interface wrappers and property tables live in small artifacts, so reading CSSOM globals or
// resolving declarations that need only the property tables never loads the engine.
function load(path: string): unknown {
  if (path.startsWith(interfacePrefix))
    return (interfaces ??= requireArtifact("./css-reference-interfaces.cjs") as Artifact).load(
      path,
    );
  properties ??= requireArtifact("./css-reference-properties.cjs") as Artifact & {
    has(path: string): boolean;
  };
  return properties.has(path)
    ? properties.load(path)
    : (reference ??= requireArtifact("./css-reference.cjs") as Artifact).load(path);
}

/** Node's createRequire, except reference package paths resolve inside the dist/css-reference*.cjs artifacts. */
export function createRequire(url: string | URL): NodeJS.Require {
  const nodeRequire = createNodeRequire(url);
  const routed = (id: string): unknown =>
    id.startsWith(prefix) ? load(id.slice(prefix.length)) : nodeRequire(id);
  return Object.assign(routed, nodeRequire);
}
