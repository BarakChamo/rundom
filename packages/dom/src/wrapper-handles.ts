// Memoizes canonical public wrappers directly on private raw nodes without an external key registry.
import type { DefaultTreeAdapterTypes as Raw } from "parse5";
class HandleTarget {
  constructor(target: Raw.Node) {
    return target;
  }
}
/** Creates one opaque raw-node handle store; raw nodes own exactly the wrapper lifetime they already owned. */
export function createWrapperHandles(): {
  get: (node: Raw.Node) => object | undefined;
  set: (node: Raw.Node, handle: object) => void;
} {
  class Handles extends HandleTarget {
    #handle: object;
    constructor(node: Raw.Node, handle: object) {
      super(node);
      this.#handle = handle;
    }
    static get(node: Raw.Node): object | undefined {
      return #handle in node ? node.#handle : undefined;
    }
    static set(node: Raw.Node, handle: object): void {
      if (#handle in node) node.#handle = handle;
      else new Handles(node, handle);
    }
  }
  return { get: Handles.get, set: Handles.set };
}
