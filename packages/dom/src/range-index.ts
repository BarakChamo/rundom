// Tracks live Range boundary points through tree changes using weak registrations.
import type { DefaultTreeAdapterTypes as Raw } from "parse5";

export type Point = { node: Raw.Node; offset: number };
export type RangePoints = { start: Point; end: Point; observers?: Set<() => void> };

function samePoint(first: Point, second: Point): boolean {
  return first.node === second.node && first.offset === second.offset;
}

/** Updates live endpoints and notifies selections only when a boundary moved. */
export function setRangePoints(points: RangePoints, start: Point, end: Point): void {
  const observers = points.observers;
  const changed =
    observers?.size && (!samePoint(points.start, start) || !samePoint(points.end, end));
  points.start = start;
  points.end = end;
  if (observers && changed) for (const notify of observers) notify();
}

function parent(node: Raw.Node): Raw.ParentNode | null {
  return "parentNode" in node ? node.parentNode : null;
}

function path(node: Raw.Node): Raw.Node[] {
  const result: Raw.Node[] = [node];
  for (let owner = parent(node); owner; owner = parent(owner)) result.push(owner);
  return result.reverse();
}

/** Returns boundary order, or undefined when the points belong to different trees. */
export function comparePoints(a: Point, b: Point): number | undefined {
  if (a.node === b.node) return a.offset - b.offset;
  const aPath = path(a.node);
  const bPath = path(b.node);
  if (aPath[0] !== bPath[0]) return undefined;
  let index = 1;
  while (index < aPath.length && index < bPath.length && aPath[index] === bPath[index]) index++;
  const common = aPath[index - 1];
  if (!common || !("childNodes" in common)) return undefined;
  const indexOf = (node: Raw.Node | undefined): number =>
    common.childNodes.findIndex((child) => child === node);
  if (index === aPath.length) return a.offset <= indexOf(bPath[index]) ? -1 : 1;
  if (index === bPath.length) return b.offset <= indexOf(aPath[index]) ? 1 : -1;
  return indexOf(aPath[index]) - indexOf(bPath[index]);
}

function within(node: Raw.Node, ancestor: Raw.Node): boolean {
  for (let current: Raw.Node | null = node; current; current = parent(current)) {
    if (current === ancestor) return true;
  }
  return false;
}

/** Creates the weak boundary registry for a document. */
export function createRangeIndex() {
  const entries = new Set<WeakRef<RangePoints>>();
  const cleanup = new FinalizationRegistry<WeakRef<RangePoints>>((entry) => entries.delete(entry));

  function update(transform: (point: Point) => Point): void {
    for (const entry of entries) {
      const state = entry.deref();
      if (!state) continue;
      setRangePoints(state, transform(state.start), transform(state.end));
    }
  }

  return {
    register(state: RangePoints): () => void {
      const entry = new WeakRef(state);
      entries.add(entry);
      cleanup.register(state, entry, entry);
      return () => {
        entries.delete(entry);
        cleanup.unregister(entry);
      };
    },
    inserted(parent: Raw.ParentNode, index: number, count: number): void {
      update((point) =>
        point.node === parent && point.offset > index
          ? { node: parent, offset: point.offset + count }
          : point,
      );
    },
    removed(parent: Raw.ParentNode, node: Raw.ChildNode, index: number): void {
      update((point) => {
        if (within(point.node, node)) return { node: parent, offset: index };
        if (point.node === parent && point.offset > index)
          return { node: parent, offset: point.offset - 1 };
        return point;
      });
    },
    dataReplaced(node: Raw.Node, offset: number, removed: number, inserted: number): void {
      update((point) => {
        if (point.node !== node || point.offset <= offset) return point;
        if (point.offset <= offset + removed) return { node, offset };
        return { node, offset: point.offset + inserted - removed };
      });
    },
    textSplit(
      node: Raw.Node,
      remainder: Raw.Node,
      offset: number,
      owner: Raw.ParentNode,
      index: number,
    ): void {
      update((point) => {
        if (point.node === node && point.offset > offset)
          return { node: remainder, offset: point.offset - offset };
        if (point.node === owner && point.offset === index)
          return { node: owner, offset: index + 1 };
        return point;
      });
    },
    textMerged(
      node: Raw.Node,
      target: Raw.Node,
      offset: number,
      owner: Raw.ParentNode,
      index: number,
    ): void {
      update((point) => {
        if (point.node === node) return { node: target, offset: offset + point.offset };
        if (point.node === owner && point.offset === index) return { node: target, offset };
        return point;
      });
    },
  };
}
