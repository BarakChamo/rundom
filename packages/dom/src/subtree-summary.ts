// Conservative per-element summaries of the node kinds that insertion steps look for in a subtree.
import type { DefaultTreeAdapterTypes as Raw } from "parse5";
import { elementLocalName } from "./xml.js";

/** Element kinds an insertion or removal step may need to find; one bit each. */
export const SubtreeKind = {
  input: 1,
  sheetOwner: 2,
  frameOrScript: 4,
  documentNamed: 8,
  details: 16,
} as const;

const kindsByLocalName: ReadonlyMap<string, number> = new Map([
  ["input", SubtreeKind.input],
  ["style", SubtreeKind.sheetOwner],
  ["link", SubtreeKind.sheetOwner],
  ["frame", SubtreeKind.frameOrScript],
  ["iframe", SubtreeKind.frameOrScript | SubtreeKind.documentNamed],
  ["script", SubtreeKind.frameOrScript],
  ["embed", SubtreeKind.documentNamed],
  ["form", SubtreeKind.documentNamed],
  ["img", SubtreeKind.documentNamed],
  ["object", SubtreeKind.documentNamed],
  ["details", SubtreeKind.details],
]);

/**
 * Kinds of one element, from its local name in any namespace. Local names never change, so the
 * result is a superset of every namespace- or attribute-qualified predicate built on these names.
 */
export function elementKinds(node: Raw.Element): number {
  return kindsByLocalName.get(elementLocalName(node)) ?? 0;
}

// Module-level so every Window's mutation primitives maintain the same entries for adopted nodes.
// Invariant: when an element has an entry, each element child (and each element child of its shadow
// root) that has element children or a shadow root has one, and the entry is a superset of the kinds
// in its shadow-including inclusive subtree. Leaves carry no entry: their kinds are their own and
// recording them would cost a weak entry per leaf. Insertion steps record entries after visiting a
// subtree; entries may stay stale-true after removal. An entry also names the scanner (one per
// Window) whose insertion scan last passed the element and its subtree.
const summaries = new WeakMap<Raw.Node, number>();
const kindMask = 31;
let scanners = 0;

/**
 * A new scanner identity for one Window's insertion scans.
 *
 * @remarks Identities wrap after 2^25 Windows in one process; a reused identity could skip inline
 * style capture for a subtree that the earlier holder of that identity scanned last.
 */
export function createSubtreeScanner(): number {
  // Entries stay small integers: 2^25 scanners times 32 kind combinations.
  scanners = (scanners + 1) % 2 ** 25;
  return scanners;
}

/** The recorded kinds of an element's subtree, or undefined when unrecorded. */
export function subtreeSummary(node: Raw.Node): number | undefined {
  const entry = summaries.get(node);
  return entry === undefined ? undefined : entry & kindMask;
}

/** The recorded kinds when scanner passed this subtree last, or undefined when it must rescan. */
export function scannedSubtreeSummary(node: Raw.Node, scanner: number): number | undefined {
  const entry = summaries.get(node);
  return entry === undefined || entry >>> 5 !== scanner ? undefined : entry & kindMask;
}

/** Records the kinds of an element whose non-leaf element children already have entries. */
export function recordSubtreeSummary(node: Raw.Element, kinds: number, scanner: number): void {
  summaries.set(node, scanner * 32 + kinds);
}

/**
 * Drops the entries of parent and its shadow-including ancestors before content enters parent's
 * subtree. Shadow roots carry no entry and pass through to their host. The first element may be a
 * leaf below a recorded parent, so the walk always passes it; by the invariant, the next element
 * without an entry ends the walk.
 */
export function invalidateSubtreeSummaries(
  parent: Raw.Node | null,
  parentOf: (node: Raw.Node) => Raw.Node | null,
): void {
  let passedElement = false;
  for (let node = parent; node; node = parentOf(node)) {
    if (summaries.delete(node) || !("tagName" in node)) continue;
    if (passedElement) return;
    passedElement = true;
  }
}
