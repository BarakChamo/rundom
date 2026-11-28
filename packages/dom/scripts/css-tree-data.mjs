// Serializes css-tree's patched syntax definitions as a JavaScript literal that rebuilds them exactly.

/**
 * Writes plain data as an object literal, keeping null prototypes (`__proto__: null`) so the
 * evaluated literal is structurally identical to the value css-tree's data module computes.
 */
export function serializeCssTreeData(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serializeCssTreeData).join(",")}]`;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new Error("css-tree data holds a non-plain object");
  const entries = Object.entries(value).map(([key, entry]) => {
    // A literal "__proto__" key would set the prototype instead of an own property.
    if (key === "__proto__") throw new Error("css-tree data holds a __proto__ key");
    return `${JSON.stringify(key)}:${serializeCssTreeData(entry)}`;
  });
  if (prototype === null) entries.unshift("__proto__:null");
  return `{${entries.join(",")}}`;
}
