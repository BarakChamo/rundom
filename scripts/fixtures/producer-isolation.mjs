// Rejects producer-checkout dependency resolution while exercising a separately installed package.
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { sep } from "node:path";

const producerRoot = process.env.RUN_DOM_PRODUCER_ROOT;
if (!producerRoot) throw new Error("Packed isolation requires the producer root URL");
const consumerRoot = pathToFileURL(process.cwd() + sep).href;
const isProducer = (url) => url?.startsWith(producerRoot) && !url.startsWith(consumerRoot);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (isProducer(context.parentURL))
      throw new Error(`Installed package resolved through producer checkout: ${context.parentURL}`);
    const resolved = nextResolve(specifier, context);
    if (isProducer(resolved.url))
      throw new Error(`Installed package loaded producer file: ${resolved.url}`);
    return resolved;
  },
});
