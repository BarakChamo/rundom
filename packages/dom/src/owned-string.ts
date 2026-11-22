// Gives long-lived cache entries ownership of their UTF-16 code units.
/** Copies a potential substring without replacing lone surrogate code units. */
export function ownedString(source: string): string {
  return source.length < 13 ? source : Buffer.from(source, "utf16le").toString("utf16le");
}
