// Distinguishes impossible private state from recoverable native-boundary errors.
/** An impossible state in the producer, never a recoverable native parsing failure. */
export class InvariantError extends Error {
  override name = "InvariantError";
}
/** Narrows a promised private relationship or reports a producer bug. */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InvariantError(message);
}
