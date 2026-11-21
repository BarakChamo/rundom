// Owns addon loading, typed native failures and validation of the single-call HTML snapshot boundary.
import { objectSchema } from "./object-schema.js";
import { createRequire } from "node:module";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import { decodeCompactSnapshot } from "./compact-transport.js";
import { decodeOwnedCompactArena, type HTMLArena } from "./compact-arena.js";
export type { HTMLArena } from "./compact-arena.js";
import { parseHTMLRequestSchema, type HTMLSnapshot } from "./schema.js";
export { decodeCompactSnapshot, compactSnapshotSchema } from "./compact-transport.js";
export { htmlSnapshotSchema, parseHTMLRequestSchema, type HTMLSnapshot } from "./schema.js";
export { invariant, InvariantError } from "./invariant.js";
export { ok, err, ResultAsync, type Result } from "neverthrow";

/** Native failures callers can report or explicitly fall back around. */
export type NativeParseError =
  | { type: "invalid_request"; issues: readonly string[] }
  | { type: "addon_unavailable"; target: string; cause: unknown }
  | { type: "invalid_snapshot"; issues: readonly string[] };
const bindingSchema = objectSchema(
  {
    parseDocumentSnapshot: z.custom<(markup: string, scriptingEnabled: boolean) => unknown>(
      (value) => typeof value === "function",
    ),
  },
  { stripUnknown: true },
);
type Binding = z.infer<typeof bindingSchema>;
let binding: Result<Binding, NativeParseError> | undefined;
function loadBinding(): Result<Binding, NativeParseError> {
  if (binding) return binding;
  const target = `${process.platform}-${process.arch}`;
  let loaded: unknown;
  try {
    loaded = createRequire(import.meta.url)(`../native/${target}.node`);
  } catch (cause) {
    if (
      !(cause instanceof Error) ||
      !("code" in cause) ||
      (cause.code !== "MODULE_NOT_FOUND" && cause.code !== "ERR_DLOPEN_FAILED")
    )
      throw cause;
    return (binding = err({ type: "addon_unavailable", target, cause }));
  }
  const parsed = bindingSchema.safeParse(loaded);
  return (binding = parsed.success
    ? ok(parsed.data)
    : err({ type: "invalid_snapshot", issues: parsed.error.issues.map((issue) => issue.message) }));
}
function parseNativeValue(request: unknown): Result<unknown, NativeParseError> {
  const parsed = parseHTMLRequestSchema.safeParse(request);
  if (!parsed.success)
    return err({
      type: "invalid_request",
      issues: parsed.error.issues.map((issue) => issue.message),
    });
  const native = loadBinding();
  if (native.isErr()) return err(native.error);
  nativeCalls++;
  let value: unknown;
  try {
    value = native.value.parseDocumentSnapshot(parsed.data.markup, parsed.data.scriptingEnabled);
  } catch (cause) {
    if (!(cause instanceof Error) || !("code" in cause) || cause.code !== "InvalidArg") throw cause;
    return err({ type: "invalid_request", issues: [cause.message] });
  }
  return ok(value);
}

/** Parses one inactive document in Rust, preserving the stable owned object snapshot API. */
export function parseHTML(request: unknown): Result<HTMLSnapshot, NativeParseError> {
  return parseNativeValue(request).andThen(decodeCompactSnapshot);
}
/** Parses and validates a fresh owned native arena before any caller materializes DOM records.
 * The opaque view never exposes mutable wire storage. Slot/edge reads require integer indices
 * within the returned arena bounds; returned attribute objects and snapshots are independent.
 * Active/XML/fragment fallback policy belongs to the DOM adapter, not this inactive parser.
 */
export function parseHTMLArena(request: unknown): Result<HTMLArena, NativeParseError> {
  return parseNativeValue(request).andThen(decodeOwnedCompactArena);
}

/** Accepted explicit parser configuration; absence selects TypeScript at the DOM adapter. */
export const parserSelectionSchema = z.enum(["typescript", "rust"]);
/** Reasons an explicitly selected Rust track retains the complete TypeScript parser. */
export type ParserFallbackReason =
  | "form_association"
  | "source_locations"
  | "custom_adapter"
  | "utf16_surrogate";
const fallbackCounts: Partial<Record<ParserFallbackReason, number>> = {};
let nativeCalls = 0;
/** Accepted reasons for retaining complete TypeScript parsing under explicit Rust selection. */
export const parserFallbackReasonSchema = z.enum([
  "form_association",
  "source_locations",
  "custom_adapter",
  "utf16_surrogate",
]);
/** Records one validated capability fallback or returns invalid_request; never suppresses native errors. */
export function recordParserFallback(reason: unknown): Result<void, NativeParseError> {
  const parsed = parserFallbackReasonSchema.safeParse(reason);
  if (!parsed.success)
    return err({
      type: "invalid_request",
      issues: parsed.error.issues.map((issue) => issue.message),
    });
  fallbackCounts[parsed.data] = (fallbackCounts[parsed.data] ?? 0) + 1;
  return ok(undefined);
}
/** Returns independent coverage counters for qualification, excluding active/XML parser paths. */
export function getParserStatistics(): {
  nativeCalls: number;
  fallbacks: Partial<Record<ParserFallbackReason, number>>;
} {
  return { nativeCalls, fallbacks: { ...fallbackCounts } };
}
