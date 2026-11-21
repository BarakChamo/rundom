// Owns semantic arena invariants independently of object or compact storage layout.
import type { HTMLSnapshot } from "./schema.js";
import { invariant } from "./invariant.js";

type NodeKind = HTMLSnapshot["nodes"][number]["kind"];
/** Semantic reads over a finite, shape-checked arena; storage and string decoding stay private. */
export type OwnershipArena = {
  readonly length: number;
  kind: (slot: number) => NodeKind | undefined;
  name: (slot: number) => string;
  namespace: (slot: number) => string;
  attributeCount: (slot: number) => number;
  childCount: (slot: number) => number;
  childAt: (slot: number, edge: number) => number | undefined;
  template: (slot: number) => number | null;
  form: (slot: number) => number | null;
};

/** Checks complete node relationships, unique owning edges and cycles without copying storage. */
export function arenaOwnershipIssues(arena: OwnershipArena): string[] {
  const incoming = new Uint8Array(arena.length);
  const issues: string[] = [];
  // Shape validation bounds every slot and edge count by its finite backing storage.
  for (let slot = 0; slot < arena.length; slot++) {
    const kind = arena.kind(slot);
    if (!kind) continue;
    const template = arena.template(slot),
      form = arena.form(slot),
      children = arena.childCount(slot);
    if ((kind === "document") !== (slot === 0)) issues.push("Only slot zero is the document");
    if (kind !== "element" && (arena.attributeCount(slot) || template !== null || form !== null))
      issues.push("Only elements carry attributes, templates and form associations");
    if (kind !== "element" && kind !== "document" && kind !== "fragment" && children)
      issues.push("Leaf node cannot own children");
    if (kind === "element" && (!arena.name(slot) || !arena.namespace(slot)))
      issues.push("Element name and namespace are required");
    if (
      template !== null &&
      (kind !== "element" ||
        arena.name(slot) !== "template" ||
        arena.namespace(slot) !== "http://www.w3.org/1999/xhtml" ||
        arena.kind(template) !== "fragment")
    )
      issues.push("Template must own a document fragment");
    if (
      form !== null &&
      (arena.kind(form) !== "element" ||
        arena.name(form) !== "form" ||
        arena.namespace(form) !== "http://www.w3.org/1999/xhtml")
    )
      issues.push("Form association must reference an HTML form");
    for (let edge = 0; edge < children + (template === null ? 0 : 1); edge++) {
      const child = edge < children ? arena.childAt(slot, edge) : template;
      invariant(
        child !== undefined && child !== null,
        "Parsed owning edges contain complete numeric references",
      );
      if (
        !arena.kind(child) ||
        child === 0 ||
        (child !== template && arena.kind(child) === "fragment")
      ) {
        issues.push("Child index is outside the ownership arena");
        continue;
      }
      if (incoming[child] !== 0) issues.push("A node cannot have multiple owning edges");
      incoming[child] = 1;
    }
  }
  if (issues.length) return issues;
  const pending: number[] = [];
  for (let slot = 0; slot < arena.length; slot++) if (incoming[slot] === 0) pending.push(slot);
  let visited = 0;
  // Each shape-checked arena slot is queued once after its final incoming edge is removed.
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const slot = pending[cursor];
    if (slot === undefined || !arena.kind(slot)) continue;
    visited++;
    const children = arena.childCount(slot),
      template = arena.template(slot);
    for (let edge = 0; edge < children + (template === null ? 0 : 1); edge++) {
      const child = edge < children ? arena.childAt(slot, edge) : template;
      invariant(
        child !== undefined && child !== null,
        "Parsed owning edges contain complete numeric references",
      );
      if (!arena.kind(child)) continue;
      incoming[child] = (incoming[child] ?? 0) - 1;
      if (incoming[child] === 0) pending.push(child);
    }
  }
  if (visited !== arena.length) issues.push("Ownership graph contains a cycle");
  return issues;
}

/** Applies the same semantic authority to the stable public object snapshot schema. */
export function snapshotOwnershipIssues(snapshot: HTMLSnapshot): string[] {
  const nodes = snapshot.nodes;
  return arenaOwnershipIssues({
    length: nodes.length,
    kind: (slot) => nodes[slot]?.kind,
    name: (slot) => nodes[slot]?.name ?? "",
    namespace: (slot) => nodes[slot]?.namespace ?? "",
    attributeCount: (slot) => nodes[slot]?.attrs.length ?? 0,
    childCount: (slot) => nodes[slot]?.children.length ?? 0,
    childAt: (slot, edge) => nodes[slot]?.children[edge],
    template: (slot) => nodes[slot]?.template ?? null,
    form: (slot) => nodes[slot]?.form ?? null,
  });
}
