// Reuses private static membership/traps while allocating a fresh public target and Proxy for each view.
import { indexedProperty } from "./collection-index.js";

type StaticRecord = {
  kind: "nodes";
  members: { length: () => number; at: (index: number) => object | undefined };
};
type StaticData = { record: StaticRecord; handler: ProxyHandler<object> };
/** Owns weak-key cache lifetime and private branding; immutable vectors never become public arrays. */
export function createStaticNodeListFactory({
  register,
}: {
  register: (view: object, record: StaticRecord) => void;
}): <T extends object>(input: { target: T; nodes: readonly object[] }) => T {
  let data: WeakMap<readonly object[], StaticData> | undefined;
  let entries = 0;
  function forNodes(nodes: readonly object[]): StaticData {
    const existing = data?.get(nodes);
    if (existing) return existing;
    const record: StaticRecord = {
      kind: "nodes",
      members: { length: () => nodes.length, at: (index) => nodes[index] },
    };
    const handler: ProxyHandler<object> = {
      get(target, key, receiver) {
        const index = indexedProperty(key);
        return index !== undefined && index < nodes.length
          ? nodes[index]
          : Reflect.get(target, key, receiver);
      },
      has(target, key) {
        const index = indexedProperty(key);
        return (index !== undefined && index < nodes.length) || Reflect.has(target, key);
      },
      ownKeys(target) {
        return [
          ...Array.from({ length: nodes.length }, (_, index) => String(index)),
          ...Reflect.ownKeys(target),
        ];
      },
      getOwnPropertyDescriptor(target, key) {
        const index = indexedProperty(key),
          value = index === undefined ? undefined : nodes[index];
        return value === undefined
          ? Reflect.getOwnPropertyDescriptor(target, key)
          : { value, writable: false, enumerable: true, configurable: true };
      },
      set(target, key, value, receiver) {
        return indexedProperty(key) === undefined && Reflect.set(target, key, value, receiver);
      },
      defineProperty(target, key, descriptor) {
        return (
          indexedProperty(key) === undefined && Reflect.defineProperty(target, key, descriptor)
        );
      },
      deleteProperty(target, key) {
        const index = indexedProperty(key);
        return (
          (index === undefined || index >= nodes.length) && Reflect.deleteProperty(target, key)
        );
      },
      preventExtensions: () => false,
    };
    // Bound metadata even while WeakRef jobs temporarily keep many old query vectors alive.
    if (entries >= 128) {
      data = undefined;
      entries = 0;
    }
    const result = { record, handler };
    (data ??= new WeakMap()).set(nodes, result);
    entries++;
    return result;
  }
  return function <T extends object>({
    target,
    nodes,
  }: {
    target: T;
    nodes: readonly object[];
  }): T {
    const { record, handler } = forNodes(nodes),
      view = new Proxy<T>(target, handler);
    register(view, record);
    return view;
  };
}
