// Publishes costly Window interface objects as callable proxies that build their class on first interaction.

/**
 * Proxy handler of one lazy interface object. Its traps are shared on the prototype; each
 * instance holds the resolver, the proxy it serves and, once materialised, the real class.
 *
 * @remarks `typeof` on a callable proxy runs no trap, so a Window global read that only tests
 * the type never builds the class. Any other interaction materialises it and forwards to it.
 * The target is a strict function shell: its only non-configurable own property is `prototype`,
 * which binding redefines as the real, non-writable prototype so every Proxy invariant holds.
 * The real prototype's `constructor` is the proxy, so the proxy is the one public identity.
 */
class LazyInterface implements ProxyHandler<Function> {
  real: Function | undefined;
  readonly proxy: Function;
  readonly #target: Function;
  readonly #resolve: () => Function;

  constructor(name: string, resolve: () => Function) {
    // Named evaluation gives the shell the interface name for inspection, which reads the target.
    const shells: Record<string, Function> = { [name]: function () {} };
    const target = shells[name] as Function;
    this.#target = target;
    this.#resolve = resolve;
    this.proxy = new Proxy(target, this);
  }

  bind(real: Function): void {
    if (this.real) return;
    this.real = real;
    Object.defineProperty(this.#target, "prototype", { value: real.prototype, writable: false });
    Object.defineProperty(real.prototype, "constructor", {
      value: this.proxy,
      writable: true,
      configurable: true,
    });
  }

  #materialize(): Function {
    if (!this.real) {
      // The resolver normally publishes through `expose`, which binds; bind directly otherwise.
      const real = this.#resolve();
      this.bind(real);
    }
    return this.real as Function;
  }

  /** Makes a non-configurable or frozen state of the real class visible on the target too. */
  #mirror(key: PropertyKey): void {
    const descriptor = Reflect.getOwnPropertyDescriptor(this.real as Function, key);
    if (descriptor) Reflect.defineProperty(this.#target, key, descriptor);
    else Reflect.deleteProperty(this.#target, key);
  }

  get(_: Function, key: PropertyKey, receiver: unknown): unknown {
    return Reflect.get(this.real ?? this.#materialize(), key, receiver);
  }
  set(_: Function, key: PropertyKey, value: unknown, receiver: unknown): boolean {
    return Reflect.set(this.real ?? this.#materialize(), key, value, receiver);
  }
  has(_: Function, key: PropertyKey): boolean {
    return Reflect.has(this.real ?? this.#materialize(), key);
  }
  getOwnPropertyDescriptor(_: Function, key: PropertyKey): PropertyDescriptor | undefined {
    return Reflect.getOwnPropertyDescriptor(this.real ?? this.#materialize(), key);
  }
  defineProperty(target: Function, key: PropertyKey, descriptor: PropertyDescriptor): boolean {
    if (!Reflect.defineProperty(this.real ?? this.#materialize(), key, descriptor)) return false;
    if (descriptor.configurable === false || !Reflect.isExtensible(target)) this.#mirror(key);
    return true;
  }
  deleteProperty(target: Function, key: PropertyKey): boolean {
    if (!Reflect.deleteProperty(this.real ?? this.#materialize(), key)) return false;
    Reflect.deleteProperty(target, key);
    return true;
  }
  ownKeys(): ArrayLike<string | symbol> {
    return Reflect.ownKeys(this.real ?? this.#materialize());
  }
  getPrototypeOf(): object | null {
    return Reflect.getPrototypeOf(this.real ?? this.#materialize());
  }
  setPrototypeOf(target: Function, prototype: object | null): boolean {
    if (!Reflect.setPrototypeOf(this.real ?? this.#materialize(), prototype)) return false;
    if (!Reflect.isExtensible(target)) Reflect.setPrototypeOf(target, prototype);
    return true;
  }
  preventExtensions(target: Function): boolean {
    const real = this.real ?? this.#materialize();
    if (!Reflect.preventExtensions(real)) return false;
    // A non-extensible proxy must report exactly its target's keys and prototype.
    for (const key of Reflect.ownKeys(target)) if (!Object.hasOwn(real, key)) this.#mirror(key);
    for (const key of Reflect.ownKeys(real)) this.#mirror(key);
    Reflect.setPrototypeOf(target, Reflect.getPrototypeOf(real));
    return Reflect.preventExtensions(target);
  }
  apply(_: Function, self: unknown, args: unknown[]): unknown {
    return Reflect.apply(this.real ?? this.#materialize(), self, args);
  }
  construct(_: Function, args: unknown[], newTarget: Function): object {
    const real = this.real ?? this.#materialize();
    // `new window.X()` reaches the class with itself as new.target, exactly as an eager class.
    return Reflect.construct(real, args, newTarget === this.proxy ? real : newTarget);
  }
}

/**
 * Creates one Window's table of lazily published interface objects.
 *
 * `get` serves a Window getter: the published class when internal code exposed it first,
 * otherwise a lazy proxy that calls `resolve` on first interaction. `expose` is called by the
 * code that owns a class at the moment its prototype or an instance first becomes reachable, and
 * returns the value that prototype's `constructor` must hold.
 */
export function createLazyInterfaces(): {
  get: <T extends Function>(name: string, resolve: () => T) => T;
  expose: <T extends Function>(name: string, real: T) => T;
} {
  const entries = new Map<string, LazyInterface | Function>();
  return {
    get<T extends Function>(name: string, resolve: () => T): T {
      const entry = entries.get(name);
      if (entry instanceof LazyInterface) return entry.proxy as T;
      if (entry) return entry as T;
      const lazy = new LazyInterface(name, resolve);
      entries.set(name, lazy);
      return lazy.proxy as T;
    },
    expose<T extends Function>(name: string, real: T): T {
      const entry = entries.get(name);
      if (entry instanceof LazyInterface) {
        entry.bind(real);
        return entry.proxy as T;
      }
      if (!entry) entries.set(name, real);
      return (entry ?? real) as T;
    },
  };
}
