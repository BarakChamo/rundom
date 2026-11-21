// Resolves the first strong Unicode bidi character without applying visual reordering.
import { createRequire } from "node:module";
import type { Bidi } from "bidi-js";

const require = createRequire(import.meta.url);
let bidi: Bidi | undefined;

/** Returns null for text with no strong character; loads Unicode tables on first use. */
export function firstStrongDirection(text: string): "ltr" | "rtl" | null {
  if (!text) return null;
  bidi ??= (require("bidi-js") as typeof import("bidi-js").default)();
  // The string has a finite number of Unicode code points.
  for (const character of text) {
    const type = bidi.getBidiCharTypeName(character);
    if (type === "L") return "ltr";
    if (type === "R" || type === "AL") return "rtl";
  }
  return null;
}
