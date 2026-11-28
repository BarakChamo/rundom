// Keeps opaque node ownership in native private slots without changing public wrapper prototypes or reflection.
import type { DefaultTreeAdapterTypes as Raw } from "parse5";

type NodeRecord =
  | { kind: "element"; node: Raw.Element; realm: symbol }
  | { kind: "other"; node: Raw.Node; realm: symbol };

class RecordTarget {
  constructor(target: object) {
    return target;
  }
}

/** Creates an independent private store; stamping adds no observable properties or strong key registry. */
export function createNodeRecords(): {
  get: (target: object) => NodeRecord | undefined;
  /** Same result as `get`; faster for receivers that are nearly always nodes, slower for others. */
  read: (target: object) => NodeRecord | undefined;
  has: (target: object) => boolean;
  set: (target: object, record: NodeRecord) => void;
} {
  class Records extends RecordTarget {
    #record: NodeRecord;
    constructor(target: object, record: NodeRecord) {
      super(target);
      this.#record = record;
    }
    static get(target: object): NodeRecord | undefined {
      // Invalid public receivers must reach the existing DOM brand-error path without invoking traps.
      if ((typeof target !== "object" || target === null) && typeof target !== "function") return;
      return #record in target ? target.#record : undefined;
    }
    static read(target: object): NodeRecord | undefined {
      if ((typeof target !== "object" || target === null) && typeof target !== "function") return;
      // One private load beats `#record in` plus a load once receivers span many wrapper classes; misses throw.
      try {
        return (target as Records).#record;
      } catch {
        return undefined;
      }
    }
    static set(target: object, record: NodeRecord): void {
      if (#record in target) target.#record = record;
      else new Records(target, record);
    }
  }
  return {
    get: Records.get,
    read: Records.read,
    has: (target) => Records.get(target) !== undefined,
    set: Records.set,
  };
}
