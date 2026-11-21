// Preserves the public snapshot API over the common validated compact-arena boundary.
import type { Result } from "neverthrow";
import type { HTMLSnapshot } from "./schema.js";
import { decodeOwnedCompactArena } from "./compact-arena.js";
import type { SnapshotError } from "./compact-storage.js";
export { compactSnapshotSchema } from "./compact-storage.js";

/** Borrows unknown storage only for this synchronous conversion; no mutable wire alias escapes. */
export function decodeCompactSnapshot(value: unknown): Result<HTMLSnapshot, SnapshotError> {
  return decodeOwnedCompactArena(value).map((arena) => arena.snapshot());
}
