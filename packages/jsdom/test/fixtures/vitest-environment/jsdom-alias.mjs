// Resolves `jsdom` and its Blob-bytes subpath to the built RunDOM facade, as the drop-in alias does.
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const facade = new URL("../../../", import.meta.url);
const target = (path, context) => {
  const url = new URL(path, facade);
  // CommonJS resolution takes file paths; ESM resolution takes URLs.
  return context.conditions.includes("require") ? fileURLToPath(url) : url.href;
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "jsdom/lib/generated/idl/utils.js")
      return nextResolve(target("src/jsdom-idl-utils.cjs", context), context);
    if (specifier !== "jsdom") return nextResolve(specifier, context);
    const entry = context.conditions.includes("require") ? "dist/jsdom.cjs" : "dist/jsdom.js";
    return nextResolve(target(entry, context), context);
  },
});
