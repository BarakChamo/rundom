// Adapt only the pinned cssstyle bundle. Fail the build when its generated table or dispatch
// changes, so an upstream upgrade cannot silently omit a supported property.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const registry = fileURLToPath(new URL("./private-css-properties.cjs", import.meta.url));
const genericEntry =
  /^  ("[^"]+"): createGenericPropertyDescriptor\(("[^"]+"), (\{[^\n]+\})\),?$/gm;
function intern(key, value, ids, values) {
  if (!ids.has(key)) {
    ids.set(key, values.length);
    values.push(value);
  }
  return ids.get(key);
}

export function deferredCssProperties(build) {
  build.onLoad({ filter: /cssstyle\/lib\/generated\/propertyDescriptors\.js$/ }, ({ path }) => {
    const aliases = Object.create(null);
    const recipes = [],
      options = [];
    const recipeIds = new Map(),
      optionIds = new Map();
    const source = readFileSync(path, "utf8").replace(genericEntry, (_, alias, name, config) => {
      const option = intern(config, JSON.parse(config), optionIds, options);
      aliases[JSON.parse(alias)] = intern(
        name + "/" + option,
        [JSON.parse(name), option],
        recipeIds,
        recipes,
      );
      return "";
    });
    if (
      !Object.keys(aliases).length ||
      source.includes(": createGenericPropertyDescriptor(") ||
      !source.includes("module.exports = {")
    )
      throw Error("Unsupported cssstyle descriptor table");
    const args = [aliases, recipes, options].map((value) => JSON.stringify(value)).join(",");
    return {
      loader: "js",
      contents:
        source.replace("module.exports = {", "const specialized = {") +
        "\nmodule.exports = require(" +
        JSON.stringify(registry) +
        ")(specialized," +
        args +
        ",createGenericPropertyDescriptor);",
    };
  });
  build.onLoad({ filter: /cssstyle\/lib\/CSSStyleDeclaration\.js$/ }, ({ path }) => {
    const source = readFileSync(path, "utf8");
    const install = "Object.defineProperties(CSSStyleDeclaration.prototype, propertyDescriptors);";
    if (!source.includes(install)) throw Error("Unsupported cssstyle prototype installation");
    const contents = source
      .replace(install, "propertyDescriptors.install(CSSStyleDeclaration.prototype);")
      .replaceAll(
        "Object.hasOwn(propertyDescriptors, property)",
        "propertyDescriptors.has(property)",
      )
      .replaceAll("propertyDescriptors[property].set", "propertyDescriptors.get(property).set");
    if (
      contents.includes("propertyDescriptors[") ||
      contents.includes("Object.hasOwn(propertyDescriptors")
    ) {
      throw Error("Unsupported cssstyle property dispatch");
    }
    return { loader: "js", contents };
  });
}
