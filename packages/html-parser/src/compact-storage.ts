// Decodes a bounded integer arena and immutable UTF-16 string pool before private DOM allocation.
import { objectSchema } from "./object-schema.js";
import { types } from "node:util";
import { z } from "zod";
import { err, ok, type Result } from "neverthrow";
import { invariant } from "./invariant.js";
import type { HTMLSnapshot } from "./schema.js";
import type { NativeParseError } from "./index.js";
export const headerWords = 8,
  nodeWords = 12,
  attributeWords = 7,
  absent = 0xffffffff;
export const kinds = ["document", "fragment", "element", "text", "comment", "doctype"] as const;
export const namespaces = [
  "",
  "http://www.w3.org/1999/xhtml",
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/1998/Math/MathML",
] as const;
export const attributeNamespaces = [
  ...namespaces,
  "http://www.w3.org/1999/xlink",
  "http://www.w3.org/XML/1998/namespace",
  "http://www.w3.org/2000/xmlns/",
] as const;
export const modes = ["no-quirks", "quirks", "limited-quirks"] as const;
// These are trusted Node runtime intrinsics, captured before caller-owned view
// properties can replace the metadata authority used by range validation.
const typedArrayPrototype: object = Object.getPrototypeOf(Uint32Array.prototype);
const bufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get;
const lengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, "length")?.get;
const resizableGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resizable")?.get;
invariant(
  bufferGetter && lengthGetter && resizableGetter,
  "Node 24 supplies typed-array storage intrinsics",
);
const storageBuffer: (value: Uint32Array) => ArrayBufferLike =
  Function.prototype.call.bind(bufferGetter);
export const storageLength: (value: Uint32Array) => number =
  Function.prototype.call.bind(lengthGetter);
const resizableStorage: (value: ArrayBuffer) => boolean =
  Function.prototype.call.bind(resizableGetter);

function fixedStorage(value: unknown): value is Uint32Array {
  if (!types.isUint32Array(value)) return false;
  const buffer = storageBuffer(value);
  return types.isArrayBuffer(buffer) && !resizableStorage(buffer);
}

/** Shape of compact wire storage; integer contents remain checked by the domain decoder. */
export const compactSnapshotSchema = objectSchema({
  words: z.custom<Uint32Array>(fixedStorage),
  strings: z
    .string()
    .refine(
      (value) => value.isWellFormed(),
      "Native pool must preserve complete Unicode scalar values",
    ),
});
export type SnapshotError = Extract<NativeParseError, { type: "invalid_snapshot" }>;
export const invalid = (message: string): Result<never, SnapshotError> =>
  err({ type: "invalid_snapshot", issues: [message] });

export type CompactStorage = {
  words: Uint32Array;
  strings: string;
  count: number;
  mode: HTMLSnapshot["mode"];
  childrenStart: number;
  attributesStart: number;
  childCount: number;
  attributeCount: number;
};
/** Checks fixed storage and exact section bounds before any arena-sized allocation. */
export function parseCompactStorage(value: unknown): Result<CompactStorage, SnapshotError> {
  const parsed = compactSnapshotSchema.safeParse(value);
  if (!parsed.success)
    return err({
      type: "invalid_snapshot",
      issues: parsed.error.issues.map((issue) => issue.message),
    });
  const { words, strings } = parsed.data;
  const length = storageLength(words);
  if (
    length < headerWords ||
    words[0] !== 0x52444f4d ||
    words[1] !== 2 ||
    words[6] !== strings.length ||
    words[7] !== 0
  )
    return invalid("Unsupported or truncated compact header");
  const count = words[2],
    modeIndex = words[3],
    childCount = words[4],
    attributeCount = words[5];
  invariant(
    count !== undefined &&
      modeIndex !== undefined &&
      childCount !== undefined &&
      attributeCount !== undefined,
    "Complete compact header has every field",
  );
  const mode = modes[modeIndex],
    childrenStart = headerWords + nodeWords * count,
    attributesStart = childrenStart + childCount;
  if (!mode || count === 0 || attributesStart + attributeWords * attributeCount !== length)
    return invalid("Compact counts exceed their exact storage bounds");
  return ok({
    words,
    strings,
    count,
    mode,
    childrenStart,
    attributesStart,
    childCount,
    attributeCount,
  });
}
