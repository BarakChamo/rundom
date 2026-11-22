// Owns WebIDL CSS declaration views; private parser/cascade objects never become public receivers.

export type DeclarationImplementation = {
  readonly _length: number;
  readonly [index: number]: string | undefined;
  cssText: string;
  readonly parentRule: object | null;
  getPropertyValue: (property: string) => string;
  getPropertyPriority: (property: string) => string;
  setProperty: (property: string, value: string, priority?: string) => void;
  removeProperty: (property: string) => string;
};
type DeferredDeclaration = {
  write?: (property: string, value: unknown) => boolean;
  read: (name: string) => string | undefined;
  materialize: () => DeclarationImplementation;
};
const deferredDeclarations = new WeakMap<object, DeferredDeclaration>();
const implementations = new WeakMap<object, DeclarationImplementation>();
const computedOwners = new WeakMap<object, (view: object) => DeclarationImplementation>();
const viewFactories = new WeakMap<object, ReturnType<typeof createDeclarationViews>["expose"]>();

function declarationImplementation(view: object): DeclarationImplementation {
  const implementation = implementations.get(view) ?? computedOwners.get(view)?.(view);
  if (!implementation) throw new TypeError("Illegal invocation");
  return implementation;
}
function readNamedProperty(style: DeclarationImplementation, name: string): unknown {
  const existing = Reflect.get(style, name);
  if (existing !== undefined) return existing;
  const read = Reflect.get(style, "_readGenericProperty");
  return typeof read === "function" ? Reflect.apply(read, style, [name]) : undefined;
}
function receiver(value: unknown): DeclarationImplementation {
  if ((typeof value !== "object" || value === null) && typeof value !== "function")
    throw new TypeError("Illegal invocation");
  return declarationImplementation(value);
}
function cssString(value: unknown): string {
  if (typeof value === "symbol") throw new TypeError("Cannot convert a Symbol to a string");
  return String(value).toWellFormed();
}
function indexOf(key: PropertyKey): number | undefined {
  if (typeof key !== "string" || key === "") return;
  const first = key.charCodeAt(0);
  if (first < 48 || first > 57) return;
  const index = Number(key);
  if (Number.isInteger(index) && index >= 0 && index < 4294967295 && String(index) === key)
    return index;
  return;
}
export type StyleProperty = { name: string; property: string };

let publicPropertyNames: ReadonlyMap<string, StyleProperty> | undefined;

export type ProjectedIndexGroup = { offset: number; end: number };
type AddedIndices = {
  groups: readonly ProjectedIndexGroup[];
  names: readonly string[];
  last?: string;
};
type MaterializedDeclaration = { style: DeclarationImplementation; indices?: AddedIndices };

function indexedLength(style: DeclarationImplementation, indices?: AddedIndices): number {
  return style._length + (indices?.names.length ?? 0) + (indices?.last ? 1 : 0);
}

function indexedItem(
  style: DeclarationImplementation,
  index: number,
  indices?: AddedIndices,
): string | undefined {
  if (!indices) return style[index];
  if (indices.last && index === indexedLength(style, indices) - 1) return indices.last;
  let start = 0;
  for (const group of indices.groups) {
    if (index < group.offset + start) break;
    if (index < group.offset + group.end) return indices.names[index - group.offset];
    start = group.end;
  }
  return style[index - start];
}

type PropertyLookup = Pick<
  typeof Reflect,
  "get" | "has" | "set" | "getPrototypeOf" | "setPrototypeOf"
>;
type InlineImplementation = DeclarationImplementation &
  DeferredDeclaration & { item(index: number): string | undefined };

function indexedDeclaration(
  style: DeclarationImplementation,
  lookup: PropertyLookup,
  inherited?: AddedIndices,
): ProxyHandler<object> {
  return indexedHandler(
    lookup,
    () => indexedLength(style, inherited),
    (_, index) => indexedItem(style, index, inherited),
  );
}

function indexedHandler(
  lookup: PropertyLookup,
  length: (target: object) => number,
  item: (target: object, index: number) => string | undefined,
): ProxyHandler<object> {
  return {
    get(target, key, proxy) {
      const index = indexOf(key);
      return index === undefined ? lookup.get(target, key, proxy) : item(target, index);
    },
    has(target, key) {
      const index = indexOf(key);
      return index === undefined ? lookup.has(target, key) : index < length(target);
    },
    getPrototypeOf: lookup.getPrototypeOf,
    setPrototypeOf: lookup.setPrototypeOf,
    ownKeys(target) {
      return [
        ...Array.from({ length: length(target) }, (_, index) => String(index)),
        ...Reflect.ownKeys(target),
      ];
    },
    getOwnPropertyDescriptor(target, key) {
      const index = indexOf(key);
      if (index === undefined) return Reflect.getOwnPropertyDescriptor(target, key);
      return index < length(target)
        ? { value: item(target, index), writable: false, enumerable: true, configurable: true }
        : undefined;
    },
    set(target, key, value, proxy) {
      return indexOf(key) === undefined && lookup.set(target, key, value, proxy);
    },
    defineProperty(target, key, descriptor) {
      return indexOf(key) === undefined && Reflect.defineProperty(target, key, descriptor);
    },
    deleteProperty(target, key) {
      const index = indexOf(key);
      return index === undefined ? Reflect.deleteProperty(target, key) : index >= length(target);
    },
    preventExtensions() {
      return false;
    },
  };
}

/** Creates Window-local public prototypes while retaining only private implementation ownership. */
export function createDeclarationViews(input: {
  emptyComputed: () => DeclarationImplementation;
  styleProperties: () => readonly StyleProperty[];
  write: (style: DeclarationImplementation, name: string, property: string, value: unknown) => void;
  objectPrototype: object;
  functionPrototype: object;
  arrayValues: typeof Array.prototype.values;
}) {
  const properties = new WeakSet<DeclarationImplementation>();
  const ordinaryViews = new WeakMap<object, CSSStyleProperties>();
  const indexedHandlers = new WeakMap<object, ProxyHandler<object>>();
  const inheritedIndices = new WeakMap<DeclarationImplementation, AddedIndices>();
  class CSSStyleDeclaration {
    constructor() {
      throw new TypeError("Illegal constructor");
    }
    readonly [index: number]: string | undefined;
    declare color: string;
    declare contentVisibility: string;
    declare display: string;
    declare [Symbol.iterator]: () => ArrayIterator<string>;
    item(index: number): string {
      receiver(this);
      if (arguments.length === 0) throw new TypeError("1 argument required, but only 0 present.");
      const position = +index >>> 0;
      // The maximum unsigned long is an ordinary expando key, outside the IDL index range.
      return position === 0xffffffff ? "" : (this[position] ?? "");
    }
    getPropertyValue(property: string): string {
      const style = receiver(this);
      if (arguments.length === 0) throw new TypeError("1 argument required, but only 0 present.");
      return style.getPropertyValue(cssString(property));
    }
    getPropertyPriority(property: string): string {
      const style = receiver(this);
      if (arguments.length === 0) throw new TypeError("1 argument required, but only 0 present.");
      return style.getPropertyPriority(cssString(property));
    }
    setProperty(property: string, value: string, priority = ""): void {
      const style = receiver(this);
      if (arguments.length < 2)
        throw new TypeError("2 arguments required, but only " + arguments.length + " present.");
      style.setProperty(
        cssString(property),
        value === null ? "" : cssString(value),
        priority === null ? "" : cssString(priority),
      );
    }
    removeProperty(property: string): string {
      const style = receiver(this);
      if (arguments.length === 0) throw new TypeError("1 argument required, but only 0 present.");
      return style.removeProperty(cssString(property));
    }
    get cssText(): string {
      return receiver(this).cssText;
    }
    set cssText(value: string) {
      receiver(this).cssText = cssString(value);
    }
    get length(): number {
      const style = receiver(this);
      const indices = inheritedIndices.get(style);
      return style._length + (indices?.names.length ?? 0) + (indices?.last ? 1 : 0);
    }
    get parentRule(): object | null {
      return receiver(this).parentRule;
    }
  }
  Object.setPrototypeOf(CSSStyleDeclaration.prototype, input.objectPrototype);
  Object.setPrototypeOf(CSSStyleDeclaration, input.functionPrototype);
  for (const key of Object.getOwnPropertyNames(CSSStyleDeclaration.prototype))
    if (key !== "constructor")
      Object.defineProperty(CSSStyleDeclaration.prototype, key, { enumerable: true });
  Object.defineProperty(CSSStyleDeclaration.prototype, Symbol.toStringTag, {
    value: "CSSStyleDeclaration",
    configurable: true,
  });
  class CSSStyleProperties extends CSSStyleDeclaration {}
  const propertyPrototype = CSSStyleProperties.prototype;
  Object.defineProperty(propertyPrototype, Symbol.toStringTag, {
    value: "CSSStyleProperties",
    configurable: true,
  });
  // Reinsert the first property before adding the CSS accessors. This makes V8
  // use dictionary properties and avoids copying a growing descriptor array
  // for each Window's independently owned accessor pairs.
  Reflect.deleteProperty(propertyPrototype, "constructor");
  Object.defineProperty(propertyPrototype, "constructor", {
    value: CSSStyleProperties,
    writable: true,
    configurable: true,
  });
  const nativePropertyReader = CSSStyleDeclaration.prototype.getPropertyValue;
  const write = input.write;
  let published = false;
  let openedProperties: string[] | undefined;
  function installProperty({ name, property }: StyleProperty): void {
    Object.defineProperty(propertyPrototype, name, {
      configurable: true,
      enumerable: true,
      get() {
        const style = receiver(this);
        const deferred = deferredDeclarations.get(style);
        return deferred
          ? (deferred.read(property) ?? readNamedProperty(deferred.materialize(), name))
          : readNamedProperty(style, name);
      },
      set(value: unknown) {
        const style = receiver(this);
        const deferred = deferredDeclarations.get(style);
        if (!deferred?.write?.(property, value))
          write(deferred?.materialize() ?? style, name, property, value);
      },
    });
  }
  // The ordinary prototype is private until a constructor or prototype lookup
  // can expose it. Publish all names in IDL order before that first observation.
  function publishPrototype(): void {
    if (published) return;
    published = true;
    for (const key of openedProperties ?? []) Reflect.deleteProperty(propertyPrototype, key);
    openedProperties = undefined;
    for (const entry of input.styleProperties()) installProperty(entry);
  }

  function ensureProperty(key: PropertyKey): void {
    if (published || typeof key !== "string") return;
    if (key === "constructor" || key === "__proto__") return publishPrototype();
    if (Object.hasOwn(propertyPrototype, key)) return;
    const names = (publicPropertyNames ??= new Map(
      input.styleProperties().map((entry) => [entry.name, entry]),
    ));
    const entry = names.get(key);
    if (entry) {
      installProperty(entry);
      (openedProperties ??= []).push(key);
    }
  }

  const privateLookup = {
    get(target: object, key: PropertyKey, receiver: unknown) {
      ensureProperty(key);
      return Reflect.get(target, key, receiver);
    },
    has(target: object, key: PropertyKey) {
      ensureProperty(key);
      return Reflect.has(target, key);
    },
    set(target: object, key: PropertyKey, value: unknown, receiver: unknown) {
      ensureProperty(key);
      return Reflect.set(target, key, value, receiver);
    },
    getPrototypeOf(target: object) {
      publishPrototype();
      return Reflect.getPrototypeOf(target);
    },
    setPrototypeOf(target: object, prototype: object | null) {
      publishPrototype();
      return Reflect.setPrototypeOf(target, prototype);
    },
  };
  Object.defineProperty(CSSStyleDeclaration.prototype, Symbol.iterator, {
    value: input.arrayValues,
    writable: true,
    configurable: true,
  });

  let pagePrototype: object | undefined;
  function pageDeclarationPrototype(): object {
    if (pagePrototype) return pagePrototype;
    publishPrototype();
    const prototype: object = Object.create(CSSStyleDeclaration.prototype);
    for (const name of [
      "margin",
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
      "size",
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(CSSStyleProperties.prototype, name);
      if (descriptor) Object.defineProperty(prototype, name, descriptor);
    }
    pagePrototype = prototype;
    return prototype;
  }

  function expose(
    implementation: DeclarationImplementation,
    options: { fresh?: boolean } = {},
  ): CSSStyleProperties {
    if (options.fresh) {
      const prototype = properties.has(implementation)
        ? CSSStyleProperties.prototype
        : pageDeclarationPrototype();
      return publishComputed(prototype, implementation);
    }
    const owner = viewFactories.get(implementation);
    if (owner && owner !== expose) return owner(implementation, options);
    const previous = ordinaryViews.get(implementation);
    if (previous) return previous;
    // This is an owned allocation with all observable members supplied by the public prototype/proxy.
    const target = Object.create(
      properties.has(implementation) ? CSSStyleProperties.prototype : pageDeclarationPrototype(),
    ) as CSSStyleProperties;
    let handler = indexedHandlers.get(implementation);
    if (!handler)
      indexedHandlers.set(
        implementation,
        (handler = indexedDeclaration(implementation, published ? Reflect : privateLookup)),
      );
    const view = new Proxy<CSSStyleProperties>(target, handler);
    implementations.set(view, implementation);
    ordinaryViews.set(implementation, view);
    return view;
  }
  const inlineTargets = new WeakMap<object, InlineImplementation>();
  function inlineTarget(target: object): InlineImplementation {
    const record = inlineTargets.get(target);
    if (!record) throw new TypeError("Illegal invocation");
    return record;
  }
  const inlineHandler = indexedHandler(
    privateLookup,
    (target) => inlineTarget(target)._length,
    (target, index) => inlineTarget(target).item(index),
  );
  type ComputedSource = DeclarationImplementation | (() => CSSStyleProperties | undefined);
  let computedValues: WeakMap<object, ComputedSource> | undefined = new WeakMap();
  let empty: DeclarationImplementation | undefined;
  function computedValue(view: object): DeclarationImplementation {
    const source = computedValues?.get(view);
    if (typeof source !== "function") return source ?? (empty ??= input.emptyComputed());
    const current = source();
    return current ? declarationImplementation(current) : (empty ??= input.emptyComputed());
  }
  const computedHandler = indexedHandler(
    privateLookup,
    (target) => {
      const value = computedValue(target);
      return indexedLength(value, inheritedIndices.get(value));
    },
    (target, index) => {
      const value = computedValue(target);
      return indexedItem(value, index, inheritedIndices.get(value));
    },
  );
  function publishComputed(prototype: object, value: ComputedSource): CSSStyleProperties {
    const target = Object.create(prototype) as CSSStyleProperties;
    const view = new Proxy<CSSStyleProperties>(target, computedHandler);
    computedValues?.set(target, value);
    computedValues?.set(view, value);
    computedOwners.set(view, computedValue);
    return view;
  }
  return {
    CSSStyleDeclaration,
    hasNativePropertyReader(): boolean {
      return (
        Object.getPrototypeOf(propertyPrototype) === CSSStyleDeclaration.prototype &&
        !Object.hasOwn(propertyPrototype, "getPropertyValue") &&
        Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, "getPropertyValue")
          ?.value === nativePropertyReader
      );
    },
    get CSSStyleProperties() {
      publishPrototype();
      return CSSStyleProperties;
    },
    expose,
    /** Installs a single public proxy while successive operations share an element's live declaration. */
    inlineView(style: InlineImplementation): CSSStyleProperties {
      const target = Object.create(propertyPrototype) as CSSStyleProperties;
      inlineTargets.set(target, style);
      const view = new Proxy<CSSStyleProperties>(target, inlineHandler);
      implementations.set(view, style);
      deferredDeclarations.set(style, style);
      return view;
    },
    materializedInline(view: object, style: DeclarationImplementation): void {
      implementations.set(view, style);
    },
    /** Binds private immutable context metadata once while returning a fresh public snapshot on every call. */
    freshPublisher(
      implementation: DeclarationImplementation,
      inherited?: AddedIndices,
    ): () => CSSStyleProperties {
      const prototype = properties.has(implementation)
        ? CSSStyleProperties.prototype
        : pageDeclarationPrototype();
      if (inherited) inheritedIndices.set(implementation, inherited);
      return () => publishComputed(prototype, implementation);
    },
    deferredPublisher(
      read: DeferredDeclaration["read"],
      create: () => MaterializedDeclaration,
    ): () => CSSStyleProperties {
      let completed: MaterializedDeclaration | undefined;
      let pending: { read: DeferredDeclaration["read"]; create: typeof create } | undefined = {
        read,
        create,
      };
      function materializeBlock(): MaterializedDeclaration {
        if (completed) return completed;
        if (!pending) throw new Error("Expected pending computed-style values");
        const result = pending.create();
        pending = undefined;
        return (completed = result);
      }
      const materialize = () => materializeBlock().style;
      const readPending: DeferredDeclaration["read"] = (name) => pending?.read(name);
      const deferred: DeclarationImplementation = {
        get _length() {
          const { style, indices } = materializeBlock();
          return indexedLength(style, indices);
        },
        get cssText() {
          return "";
        },
        set cssText(value) {
          materialize().cssText = value;
        },
        parentRule: null,
        getPropertyValue(name) {
          return readPending(name) ?? materialize().getPropertyValue(name);
        },
        getPropertyPriority() {
          return "";
        },
        setProperty(name, value, priority) {
          materialize().setProperty(name, value, priority);
        },
        removeProperty(name) {
          return materialize().removeProperty(name);
        },
      };
      const implementation = new Proxy(deferred, {
        get(target, name, receiver) {
          const index = indexOf(name);
          if (index === undefined) return Reflect.get(target, name, receiver);
          const { style, indices } = materializeBlock();
          return indexedItem(style, index, indices);
        },
      });
      deferredDeclarations.set(implementation, { read: readPending, materialize });
      return () => publishComputed(CSSStyleProperties.prototype, implementation);
    },
    liveView(read: () => CSSStyleProperties | undefined): CSSStyleProperties {
      return publishComputed(propertyPrototype, read);
    },
    closeComputed(): void {
      computedValues = undefined;
    },
    register(implementation: DeclarationImplementation, hasStyleProperties: boolean): void {
      if (hasStyleProperties) properties.add(implementation);
      viewFactories.set(implementation, expose);
    },
  };
}
