// Hashes frozen consumer files, including real package files beneath package-manager symlinks.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, readlinkSync } from "node:fs";
import { join, relative } from "node:path";

/** Computes a deterministic content digest; symlinks are recorded without following directory cycles. */
export function consumerDigest(directory: string): string {
  const digest = createHash("sha256"),
    pending = [directory];
  // An installed directory tree is finite; symlink directories are never recursed.
  while (pending.length) {
    const current = pending.pop();
    if (!current) break;
    for (const entry of readdirSync(current, { withFileTypes: true }).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isSymbolicLink()) {
        digest.update(relative(directory, path));
        digest.update(readlinkSync(path));
      } else if (entry.isFile()) {
        digest.update(relative(directory, path));
        digest.update(createHash("sha256").update(readFileSync(path)).digest());
      }
    }
  }
  return digest.digest("hex");
}
