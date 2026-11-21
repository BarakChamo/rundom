// Implements named Web Storage properties and atomic quota accounting.
type Kind = "local" | "session";
type Area = {
  values: Record<string, string | undefined>;
  // Numeric string keys still follow insertion order.
  keys: Set<string>;
  orderedKeys: string[] | undefined;
  size: number;
  kind: Kind;
};

function createData(kind: Kind): Area {
  return { values: Object.create(null), keys: new Set(), orderedKeys: undefined, size: 0, kind };
}
export type StorageChange = {
  kind: Kind;
  key: string | null;
  oldValue: string | null;
  newValue: string | null;
  url: string;
};
type Subscriber = (change: StorageChange) => void;
export type StorageAreas = {
  origins: Map<string, { local: Area; session: Area }>;
  subscribers: Map<string, Set<StorageSubscription>>;
};

type StorageBinding = {
  area: Area;
  set: (area: Area, key: string, value: string) => void;
  remove: (area: Area, key: string) => void;
  clear: (area: Area) => void;
};

const bindings = new WeakMap<object, StorageBinding>();

function bindingFor(receiver: object): StorageBinding {
  const binding = bindings.get(receiver);
  if (!binding) throw new TypeError("Illegal invocation");
  return binding;
}

/** Checks Storage identity across Windows. */
export function isStorage(value: object): boolean {
  return bindings.has(value);
}

function storageString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "symbol") throw new TypeError("Cannot convert a Symbol to a string");
  return String(value);
}

/** Keeps a browsing context in storage event order from insertion through disposal. */
export class StorageSubscription {
  #peers: Set<StorageSubscription> | undefined;

  constructor(
    private readonly areas: StorageAreas,
    private readonly origin: string,
    public notify: Subscriber,
  ) {
    if (origin === "null") return;
    this.#peers = areas.subscribers.get(origin) ?? new Set();
    areas.subscribers.set(origin, this.#peers);
    this.#peers.add(this);
  }

  publish(
    kind: Kind,
    key: string | null,
    oldValue: string | null,
    newValue: string | null,
    url: string,
  ): void {
    if (!this.#peers || this.#peers.size <= 1) return;
    const event = { kind, key, oldValue, newValue, url };
    for (const peer of this.#peers) if (peer !== this) peer.notify(event);
  }

  close(): void {
    const peers = this.#peers;
    if (!peers) return;
    peers.delete(this);
    if (peers.size === 0) this.areas.subscribers.delete(this.origin);
    this.#peers = undefined;
  }
}

/** Creates a Window's Storage interface over areas shared by a top-level context. */
export function createStorage(input: {
  origin: string;
  href: string;
  quota: number;
  QuotaExceededError: new (message: string) => DOMException;
  areas: StorageAreas;
  notify: Subscriber;
  subscription?: StorageSubscription | undefined;
}) {
  const { origin } = input;
  const subscription =
    input.subscription ?? new StorageSubscription(input.areas, origin, input.notify);
  subscription.notify = input.notify;

  const token = Symbol();
  let stores: { local: Storage; session: Storage } | undefined;

  function set(area: Area, key: string, value: string): void {
    const previous = area.values[key];
    if (previous === value) return;
    const size =
      area.size + value.length + (previous === undefined ? key.length : -previous.length);
    if (size > input.quota)
      throw new input.QuotaExceededError(
        `The ${input.quota}-code unit storage quota has been exceeded.`,
      );
    area.values[key] = value;
    if (previous === undefined) {
      area.keys.add(key);
      area.orderedKeys?.push(key);
    }
    area.size = size;
    subscription.publish(area.kind, key, previous ?? null, value, input.href);
  }

  function remove(area: Area, key: string): void {
    const previous = area.values[key];
    if (previous === undefined) return;
    delete area.values[key];
    area.keys.delete(key);
    area.orderedKeys = undefined;
    area.size -= key.length + previous.length;
    subscription.publish(area.kind, key, previous, null, input.href);
  }

  function clear(area: Area): void {
    if (!area.keys.size) return;
    area.values = Object.create(null);
    area.keys.clear();
    area.orderedKeys = undefined;
    area.size = 0;
    subscription.publish(area.kind, null, null, null, input.href);
  }

  class Storage {
    [name: string]: unknown;
    constructor(key: symbol) {
      if (key !== token) throw new TypeError("Illegal constructor");
    }
    key(index: number): string | null {
      const { area } = bindingFor(this);
      if (arguments.length < 1) throw new TypeError("key requires an index");
      const target = +index >>> 0;
      if (target >= area.keys.size) return null;
      if (target === 0 && !area.orderedKeys) return area.keys.values().next().value ?? null;
      return (area.orderedKeys ??= [...area.keys])[target] ?? null;
    }
    getItem(key: string): string | null {
      const { area } = bindingFor(this);
      if (arguments.length < 1) throw new TypeError("getItem requires a key");
      return area.values[storageString(key)] ?? null;
    }
    setItem(key: string, value: string): void {
      const binding = bindingFor(this);
      if (arguments.length < 2) throw new TypeError("setItem requires a key and value");
      binding.set(binding.area, storageString(key), storageString(value));
    }
    removeItem(key: string): void {
      const binding = bindingFor(this);
      if (arguments.length < 1) throw new TypeError("removeItem requires a key");
      binding.remove(binding.area, storageString(key));
    }
    clear(): void {
      const binding = bindingFor(this);
      binding.clear(binding.area);
    }
    get length(): number {
      return bindingFor(this).area.keys.size;
    }
    get [Symbol.toStringTag](): string {
      return "Storage";
    }
  }

  for (const name of ["key", "getItem", "setItem", "removeItem", "clear", "length"])
    Object.defineProperty(Storage.prototype, name, { enumerable: true });

  function createArea(area: Area): Storage {
    const storage = new Storage(token);
    const proxy: Storage = new Proxy(storage, {
      get(target, key, receiver): unknown {
        if (typeof key === "string" && !Reflect.has(target, key)) return area.values[key];
        return Reflect.get(target, key, receiver);
      },
      set(target, key, value, receiver): boolean {
        if (typeof key === "string" && receiver === proxy) {
          set(area, key, storageString(value));
          return true;
        }
        return Reflect.set(target, key, value, receiver);
      },
      defineProperty(target, key, descriptor): boolean {
        if (typeof key !== "string" || Object.hasOwn(target, key))
          return Reflect.defineProperty(target, key, descriptor);
        if (descriptor.get || descriptor.set) return false;
        set(area, key, storageString(descriptor.value));
        return true;
      },
      has(target, key): boolean {
        return Reflect.has(target, key) || (typeof key === "string" && area.keys.has(key));
      },
      ownKeys(target) {
        return [
          ...[...area.keys].filter((key) => !Reflect.has(target, key)),
          ...Reflect.ownKeys(target),
        ];
      },
      getOwnPropertyDescriptor(target, key) {
        if (typeof key === "string" && !Reflect.has(target, key) && area.keys.has(key)) {
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: area.values[key],
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      deleteProperty(target, key): boolean {
        if (typeof key === "string" && !Reflect.has(target, key)) remove(area, key);
        return Reflect.deleteProperty(target, key);
      },
      preventExtensions: () => false,
    });
    bindings.set(proxy, { area, set, remove, clear });
    return proxy;
  }

  function get(kind: Kind): Storage {
    if (!stores) {
      let data = origin === "null" ? undefined : input.areas.origins.get(origin);
      if (!data) {
        data = {
          local: createData("local"),
          session: createData("session"),
        };
        if (origin !== "null") input.areas.origins.set(origin, data);
      }
      stores = { local: createArea(data.local), session: createArea(data.session) };
    }
    return stores[kind];
  }

  return {
    Storage,
    get,
    close(): void {
      subscription.close();
    },
  };
}
