// Keeps per-object side data in native private slots so a discarded key's value dies with it in a minor GC.
const isKey = (value: unknown): value is object =>
  (typeof value === "object" && value !== null) || typeof value === "function";

/** Returns its argument from `new`, so a subclass can add a private field to an existing object. */
class SlotTarget {
  constructor(target: object) {
    return target;
  }
}

/**
 * Creates a weakly keyed table with the `get`/`set` subset of `WeakMap`.
 *
 * @remarks V8 scavenges keep `WeakMap` values alive while their keys are young, so every
 * discarded DOM tree reachable from such a value used to be promoted to old space. A private
 * field is traced like an ordinary property instead. Stamping adds no observable property and
 * does not pass through Proxy traps. Keys that refuse a private field fall back to a `WeakMap`.
 */
export function createSlotTable<K extends object, V extends {}>(): {
  get: (key: K) => V | undefined;
  /** Same result as `get`; faster when the key nearly always has an entry, far slower on a miss. */
  read: (key: K) => V | undefined;
  set: (key: K, value: V) => void;
} {
  let fallback: WeakMap<K, V> | undefined;
  class Slot extends SlotTarget {
    #value: V;
    constructor(target: K, value: V) {
      super(target);
      this.#value = value;
    }
    static get(key: K): V | undefined {
      // Like `WeakMap.prototype.get`, a non-object key is simply absent.
      if (!isKey(key)) return undefined;
      return #value in key ? (key as Slot).#value : fallback?.get(key);
    }
    static read(key: K): V | undefined {
      if (!isKey(key)) return undefined;
      // One private load beats `#value in` plus a load when keys span many shapes; misses throw.
      try {
        return (key as Slot).#value;
      } catch {
        return fallback?.get(key);
      }
    }
    static set(key: K, value: V): void {
      if (!isKey(key)) throw new TypeError("Invalid value used as weak map key");
      if (#value in key) {
        (key as Slot).#value = value;
        return;
      }
      if (fallback?.has(key)) {
        fallback.set(key, value);
        return;
      }
      try {
        new Slot(key, value);
      } catch {
        (fallback ??= new WeakMap()).set(key, value);
      }
    }
  }
  return {
    get: Slot.get,
    read: Slot.read,
    set: Slot.set,
  };
}
