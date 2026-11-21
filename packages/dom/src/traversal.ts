// Owns filtered DOM traversal and keeps live iterator cursors valid across removals.
import type { DefaultTreeAdapterTypes as Raw } from "parse5";

export type IteratorFilter<Node> =
  | ((node: Node) => number)
  | { acceptNode?: (node: Node) => number };

export const nodeFilterConstants = {
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3,
  SHOW_ALL: 0xffffffff,
  SHOW_ELEMENT: 0x1,
  SHOW_ATTRIBUTE: 0x2,
  SHOW_TEXT: 0x4,
  SHOW_CDATA_SECTION: 0x8,
  SHOW_ENTITY_REFERENCE: 0x10,
  SHOW_ENTITY: 0x20,
  SHOW_PROCESSING_INSTRUCTION: 0x40,
  SHOW_COMMENT: 0x80,
  SHOW_DOCUMENT: 0x100,
  SHOW_DOCUMENT_TYPE: 0x200,
  SHOW_DOCUMENT_FRAGMENT: 0x400,
  SHOW_NOTATION: 0x800,
} as const;

const { FILTER_ACCEPT, FILTER_REJECT, FILTER_SKIP } = nodeFilterConstants;

type TraversalOptions<Node> = {
  realm: symbol;
  root: Raw.Node;
  mask: number;
  filter: IteratorFilter<Node> | null;
  wrap: (node: Raw.Node) => Node;
};

function createFilter<Node extends { nodeType: number }>(
  mask: number,
  filter: IteratorFilter<Node> | null,
  Exception: typeof DOMException,
) {
  let active = false;
  function checkActive(): void {
    if (active) throw new Exception("Recursive node filtering", "InvalidStateError");
  }
  return {
    checkActive,
    test(node: Node): number {
      checkActive();
      if ((mask & (1 << (node.nodeType - 1))) === 0) return FILTER_SKIP;
      if (filter === null) return FILTER_ACCEPT;
      active = true;
      try {
        if (typeof filter === "function") return Number(filter(node)) & 0xffff;
        const accept = filter.acceptNode;
        if (typeof accept !== "function")
          throw new TypeError("NodeFilter.acceptNode is not callable");
        return Number(Reflect.apply(accept, filter, [node])) & 0xffff;
      } finally {
        active = false;
      }
    },
  };
}

type Pointer = { node: Raw.Node; before: boolean; index?: number };

function parent(node: Raw.Node): Raw.ParentNode | null {
  return "parentNode" in node ? node.parentNode : null;
}

function isWithin(node: Raw.Node, ancestor: Raw.Node): boolean {
  for (let current: Raw.Node | null = node; current; current = parent(current)) {
    if (current === ancestor) return true;
  }
  return false;
}

function sibling(node: Raw.Node, direction: 1 | -1, hint?: number): Pointer | null {
  if (!("parentNode" in node) || !node.parentNode) return null;
  const owner = node.parentNode;
  const children = owner.childNodes;
  const position = hint !== undefined && children[hint] === node ? hint : children.indexOf(node);
  // Bulk replacement keeps detached siblings in the old array until the operation completes.
  for (
    let index = position + direction;
    index >= 0 && index < children.length;
    index += direction
  ) {
    const candidate = children[index];
    if (candidate?.parentNode === owner) return { node: candidate, index, before: direction < 0 };
  }
  return null;
}

function following(pointer: Pointer, root: Raw.Node, skipChildren = false): Pointer | null {
  const { node, index } = pointer;
  if (!skipChildren && "childNodes" in node) {
    const first = node.childNodes[0];
    if (first) return { node: first, index: 0, before: false };
  }
  for (
    let current: Raw.Node | null = node;
    current && current !== root;
    current = parent(current)
  ) {
    const next = sibling(current, 1, current === node ? index : undefined);
    if (next) return next;
  }
  return null;
}

function preceding(pointer: Pointer, root: Raw.Node): Pointer | null {
  const { node, index } = pointer;
  if (node === root) return null;
  let previous = sibling(node, -1, index);
  if (!previous) {
    const owner = parent(node);
    return owner ? { node: owner, before: true } : null;
  }
  while ("childNodes" in previous.node) {
    const children: Raw.ChildNode[] = previous.node.childNodes;
    const child: Raw.ChildNode | undefined = children.at(-1);
    if (!child) break;
    previous = { node: child, index: children.length - 1, before: true };
  }
  return previous;
}

function adjust(pointer: Pointer, root: Raw.Node, removed: Raw.ChildNode): Pointer {
  if (!isWithin(pointer.node, removed) || isWithin(root, removed)) return pointer;
  if (pointer.before) {
    const next = following({ node: removed, before: true }, root, true);
    if (next) return { ...next, before: true };
  }
  const previous = preceding({ node: removed, before: false }, root);
  return previous ? { ...previous, before: false } : pointer;
}

type Cursor = { root: Raw.Node; reference: Pointer; candidate: Pointer | null };
const realmCursors = new WeakMap<symbol, Set<WeakRef<Cursor>>>();
const cleanup = new FinalizationRegistry<{ cursors: Set<WeakRef<Cursor>>; ref: WeakRef<Cursor> }>(
  ({ cursors, ref }) => cursors.delete(ref),
);

/** Adjusts active iterators before a raw subtree leaves its parent. */
export function removeFromIterators(realm: symbol, node: Raw.ChildNode): void {
  const cursors = realmCursors.get(realm);
  if (!cursors) return;
  for (const entry of cursors) {
    const cursor = entry.deref();
    if (!cursor) continue;
    cursor.reference = adjust(cursor.reference, cursor.root, node);
    if (cursor.candidate) cursor.candidate = adjust(cursor.candidate, cursor.root, node);
  }
}

/** Creates the Window-local traversal classes. Iterators use weak pre-removal registrations. */
export function createTraversal<Node extends { nodeType: number }>(input: {
  DOMException: typeof DOMException;
  lookup: (node: Node) => { raw: Raw.Node; wrap: (node: Raw.Node) => Node };
}) {
  const key = Symbol();
  class NodeIterator {
    readonly #state: Cursor;
    readonly #mask: number;
    readonly #wrap: (node: Raw.Node) => Node;
    readonly #filter: IteratorFilter<Node> | null;
    readonly #accept: ReturnType<typeof createFilter<Node>>;

    constructor(token: symbol, options: TraversalOptions<Node>) {
      if (token !== key) throw new TypeError("Illegal constructor");
      const { realm, root, mask, filter, wrap } = options;
      this.#state = { root, reference: { node: root, before: true }, candidate: null };
      this.#mask = mask;
      this.#filter = filter;
      this.#accept = createFilter(mask, filter, input.DOMException);
      this.#wrap = wrap;
      const ref = new WeakRef(this.#state);
      let cursors = realmCursors.get(realm);
      if (!cursors) {
        cursors = new Set();
        realmCursors.set(realm, cursors);
      }
      cursors.add(ref);
      cleanup.register(this, { cursors, ref });
    }
    get root(): Node {
      return this.#wrap(this.#state.root);
    }
    get referenceNode(): Node {
      return this.#wrap(this.#state.reference.node);
    }
    get pointerBeforeReferenceNode(): boolean {
      return this.#state.reference.before;
    }
    get whatToShow(): number {
      return this.#mask;
    }
    get filter(): IteratorFilter<Node> | null {
      return this.#filter;
    }
    nextNode(): Node | null {
      return this.#traverse(false);
    }
    previousNode(): Node | null {
      return this.#traverse(true);
    }
    detach(): void {
      // A historical method with no effect.
    }
    get [Symbol.toStringTag](): string {
      return "NodeIterator";
    }
    #traverse(backward: boolean): Node | null {
      this.#accept.checkActive();
      const state = this.#state;
      state.candidate = state.reference;
      try {
        // Each step advances in tree order, subject to mutations performed by the filter.
        while (state.candidate) {
          const pointer: Pointer = state.candidate;
          const adjacent =
            pointer.before !== backward
              ? { ...pointer, before: backward }
              : backward
                ? preceding(pointer, state.root)
                : following(pointer, state.root);
          state.candidate = adjacent;
          if (!adjacent) return null;
          const node = this.#wrap(adjacent.node);
          if (this.#accept.test(node) === FILTER_ACCEPT) {
            state.reference = state.candidate ?? adjacent;
            return node;
          }
        }
        return null;
      } finally {
        state.candidate = null;
      }
    }
  }

  function child(node: Raw.Node, direction: 1 | -1): Pointer | null {
    if (!("childNodes" in node)) return null;
    const index = direction === 1 ? 0 : node.childNodes.length - 1;
    const value = node.childNodes[index];
    return value ? { node: value, index, before: false } : null;
  }

  function adjacentBranch(
    pointer: Pointer,
    direction: 1 | -1,
    stop: Raw.Node,
    root: Raw.Node,
  ): Pointer | null {
    let candidate = pointer;
    // Walk out of completed branches, but never cross the traversal boundary.
    for (;;) {
      const next = sibling(candidate.node, direction, candidate.index);
      if (next) return next;
      const owner = parent(candidate.node);
      if (!owner || owner === stop || owner === root) return null;
      candidate = { node: owner, before: false };
    }
  }

  class TreeWalker {
    readonly #options: TraversalOptions<Node>;
    readonly #accept: ReturnType<typeof createFilter<Node>>;
    #current: Pointer;
    #wrap: (node: Raw.Node) => Node;

    constructor(token: symbol, options: TraversalOptions<Node>) {
      if (token !== key) throw new TypeError("Illegal constructor");
      this.#options = options;
      this.#current = { node: options.root, before: false };
      this.#wrap = options.wrap;
      this.#accept = createFilter(options.mask, options.filter, input.DOMException);
    }
    get root(): Node {
      return this.#options.wrap(this.#options.root);
    }
    get whatToShow(): number {
      return this.#options.mask;
    }
    get filter(): IteratorFilter<Node> | null {
      return this.#options.filter;
    }
    get currentNode(): Node {
      return this.#wrap(this.#current.node);
    }
    set currentNode(value: Node) {
      const { raw, wrap } = input.lookup(value);
      this.#current = { node: raw, before: false };
      this.#wrap = wrap;
    }
    get [Symbol.toStringTag](): string {
      return "TreeWalker";
    }
    #move(pointer: Pointer): Node {
      this.#current = pointer;
      return this.#wrap(pointer.node);
    }
    #test(pointer: Pointer): number {
      return this.#accept.test(this.#wrap(pointer.node));
    }
    parentNode(): Node | null {
      const root = this.#options.root;
      let node = this.#current.node;
      while (node !== root) {
        const owner = parent(node);
        if (!owner) return null;
        const pointer = { node: owner, before: false };
        if (this.#test(pointer) === FILTER_ACCEPT) return this.#move(pointer);
        node = owner;
      }
      return null;
    }
    firstChild(): Node | null {
      return this.#children(1);
    }
    lastChild(): Node | null {
      return this.#children(-1);
    }
    #children(direction: 1 | -1): Node | null {
      const start = this.#current.node;
      const root = this.#options.root;
      for (let pointer = child(start, direction); pointer;) {
        const result = this.#test(pointer);
        if (result === FILTER_ACCEPT) return this.#move(pointer);
        const nested = result === FILTER_SKIP ? child(pointer.node, direction) : null;
        pointer = nested ?? adjacentBranch(pointer, direction, start, root);
      }
      return null;
    }
    nextSibling(): Node | null {
      return this.#siblings(1);
    }
    previousSibling(): Node | null {
      return this.#siblings(-1);
    }
    #siblings(direction: 1 | -1): Node | null {
      const root = this.#options.root;
      let pointer = this.#current;
      while (pointer.node !== root) {
        let adjacent = sibling(pointer.node, direction, pointer.index);
        while (adjacent) {
          pointer = adjacent;
          const result = this.#test(pointer);
          if (result === FILTER_ACCEPT) return this.#move(pointer);
          const nested = result !== FILTER_REJECT ? child(pointer.node, direction) : null;
          adjacent = nested ?? sibling(pointer.node, direction, pointer.index);
        }
        const owner = parent(pointer.node);
        if (!owner || owner === root) return null;
        pointer = { node: owner, before: false };
        if (this.#test(pointer) === FILTER_ACCEPT) return null;
      }
      return null;
    }
    nextNode(): Node | null {
      const root = this.#options.root;
      let pointer = following(this.#current, root);
      while (pointer) {
        const result = this.#test(pointer);
        if (result === FILTER_ACCEPT) return this.#move(pointer);
        pointer = following(pointer, root, result === FILTER_REJECT);
      }
      return null;
    }
    previousNode(): Node | null {
      const root = this.#options.root;
      let pointer = this.#current;
      while (pointer.node !== root) {
        let previous = sibling(pointer.node, -1, pointer.index);
        while (previous) {
          pointer = previous;
          let result = this.#test(pointer);
          while (result !== FILTER_REJECT) {
            const last = child(pointer.node, -1);
            if (!last) break;
            pointer = last;
            result = this.#test(pointer);
          }
          if (result === FILTER_ACCEPT) return this.#move(pointer);
          previous = sibling(pointer.node, -1, pointer.index);
        }
        if (pointer.node === root) return null;
        const owner = parent(pointer.node);
        if (!owner) return null;
        pointer = { node: owner, before: false };
        if (this.#test(pointer) === FILTER_ACCEPT) return this.#move(pointer);
      }
      return null;
    }
  }

  return {
    NodeIterator,
    TreeWalker,
    iterator(options: TraversalOptions<Node>): NodeIterator {
      return new NodeIterator(key, options);
    },
    walker(options: TraversalOptions<Node>): TreeWalker {
      return new TreeWalker(key, options);
    },
  };
}
