// Isolates HTML's encoding-aware URL algorithms while retaining Node's UTF-8 parser fast path.
import { createRequire } from "node:module";
import { URL } from "node:url";

const require = createRequire(import.meta.url);
type URLRecord = { query: string | null };
type URLAlgorithms = {
  parseURL: (
    value: string,
    options?: { baseURL?: URLRecord | null; encoding?: string },
  ) => URLRecord | null;
  basicURLParse: (
    value: string,
    options: { url: URLRecord; stateOverride: "query"; encoding: string },
  ) => URLRecord | null;
  serializeURL: (record: URLRecord) => string;
};
let legacyAlgorithms: URLAlgorithms | undefined;

function usesUTF8(encoding: string): boolean {
  if (encoding === "UTF-8") return true;
  const normalized = encoding.toLowerCase();
  return normalized === "utf-8" || normalized === "utf-16le" || normalized === "utf-16be";
}

/** Parses an HTML document-relative URL and optionally replaces its search component.
 * The URL Standard's null failure sentinel lets reflected attributes retain their author text.
 * Legacy query encoders load only for non-UTF documents; paths and fragments remain UTF-8.
 */
export function parseDocumentURL(input: {
  value: string;
  base: string;
  encoding: string;
  search?: string;
}): URL | null {
  if (usesUTF8(input.encoding)) {
    const parsed = URL.parse(input.value, input.base);
    if (parsed && input.search !== undefined) parsed.search = input.search;
    return parsed;
  }
  const algorithms = (legacyAlgorithms ??= require("whatwg-url"));
  const parsed = algorithms.parseURL(input.value.toWellFormed(), {
    baseURL: algorithms.parseURL(input.base),
    encoding: input.encoding,
  });
  if (!parsed) return null;
  if (input.search !== undefined) {
    parsed.query = null;
    if (input.search !== "") {
      parsed.query = "";
      const text = input.search.startsWith("?") ? input.search.slice(1) : input.search;
      if (
        !algorithms.basicURLParse(text.toWellFormed(), {
          url: parsed,
          stateOverride: "query",
          encoding: input.encoding,
        })
      )
        return null;
    }
  }
  return URL.parse(algorithms.serializeURL(parsed));
}
