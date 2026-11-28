// Owns WebIDL CSS declaration views; private parser/cascade objects never become public receivers.

import { createRequire } from "node:module";
import type { PositionTryStyle } from "./css-reference.js";
import { createSlotTable } from "./slot-table.js";

const requireCSS = createRequire(import.meta.url);
let standardNames: readonly string[] | undefined;
function computedLonghands(): readonly string[] {
  if (standardNames) return standardNames;
  const properties: Record<string, unknown> = requireCSS(
    "rundom-css-reference/lib/generated/css-property-definitions.js",
  );
  const shorthands: ReadonlyMap<string, unknown> = requireCSS(
    "rundom-css-reference/lib/jsdom/living/css/properties/shorthands.js",
  );
  const names = Object.keys(properties)
    .filter((name) => name !== "--*" && !shorthands.has(name))
    .sort();
  standardNames = [
    ...names.filter((name) => !name.startsWith("-")),
    ...names.filter((name) => name.startsWith("-")),
  ];
  return standardNames;
}

export type DeclarationImplementation = {
  readonly _length: number;
  readonly [index: number]: string | undefined;
  /** The CSSOM-visible property names, when they differ from the stored indices. */
  publicNames?: () => readonly (string | undefined)[] | undefined;
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
// Per-declaration and per-target side data lives in private slots (see slot-table.ts): a WeakMap
// keeps its values alive through minor GCs while the key is young, which promoted every discarded
// tree with an inline style. Only position-descriptor views, which are rare, stay in a WeakMap.
class SlotTarget {
  constructor(target: object) {
    return target;
  }
}
// Marks a declaration whose reads are answered before it is materialized. A module-private symbol
// property on the private implementation object holds nothing but itself, so no side table keeps
// discarded trees alive, and a named load is cheaper than a private brand check across shapes.
const deferredRecord = Symbol("deferred declaration");
type DeferredHolder = { [deferredRecord]?: DeferredDeclaration };
const deferredDeclarations = {
  get(implementation: object): DeferredDeclaration | undefined {
    return (implementation as DeferredHolder)[deferredRecord];
  },
  set(implementation: object, record: DeferredDeclaration): void {
    (implementation as DeferredHolder)[deferredRecord] = record;
  },
};
const implementations = new WeakMap<object, DeclarationImplementation>();
// The receiver and target seen by the latest declaration-view trap. Accessors and methods reached
// through that trap receive the proxy as `this`; when the target's own proxy is that receiver,
// the target is known without reading the slot on the proxy, which is slow. A user proxy wrapping
// a view forwards its own receiver, which never matches. It keeps at most one view reachable.
let trapView: object | undefined;
let trapTarget: object | undefined;

type ComputedSource = DeclarationImplementation | (() => object | undefined);
type ComputedResolver = (target: object) => DeclarationImplementation;
// Declaration views keep their private state in native slots on the never-escaping proxy target
// (cheap ordinary object slots) instead of WeakMaps, whose values survive minor GCs while their
// keys are young. Computed views hold their source and owning resolver; inline and ordinary views
// hold their current implementation. Every published target also points back at its own public
// proxy, so a trap's receiver can be proven to be that proxy without reading the proxy's slot:
// V8 private fields on proxies are much slower to add and read. The proxy still carries one slot
// pointing at its target for receivers that did not come through a trap. Slots add no keys and
// invoke no traps.
class ComputedTarget extends SlotTarget {
  #source: ComputedSource | undefined;
  #resolve: ComputedResolver | undefined;
  #connected: (() => boolean) | undefined;
  #implementation: DeclarationImplementation | undefined;
  #view: object | undefined = undefined;
  constructor(
    target: object,
    source: ComputedSource | undefined,
    resolve: ComputedResolver | undefined,
    connected: (() => boolean) | undefined,
    implementation?: DeclarationImplementation,
  ) {
    super(target);
    this.#source = source;
    this.#resolve = resolve;
    this.#connected = connected;
    this.#implementation = implementation;
  }
  static resolver(target: object): ComputedResolver | undefined {
    return #resolve in target ? target.#resolve : undefined;
  }
  static source(target: object): ComputedSource | undefined {
    return #source in target ? target.#source : undefined;
  }
  static connected(target: object): (() => boolean) | undefined {
    return #connected in target ? target.#connected : undefined;
  }
  static attach(target: object, view: object): void {
    if (#view in target) target.#view = view;
  }
  /** The declaration behind a target (bare computed snapshots included), if it is one. */
  static resolve(target: object): DeclarationImplementation | undefined {
    if (!(#view in target)) return undefined;
    return target.#implementation ?? target.#resolve?.(target);
  }
  /** Like `resolve`, but only when `view` is the target's own proxy rather than a wrapper. */
  static own(target: object, view: object): DeclarationImplementation | undefined {
    if (!(#view in target) || target.#view !== view) return undefined;
    return target.#implementation ?? target.#resolve?.(target);
  }
  static replace(target: object, implementation: DeclarationImplementation): boolean {
    if (!(#implementation in target) || !target.#implementation) return false;
    target.#implementation = implementation;
    return true;
  }
}
class ComputedView extends SlotTarget {
  #target: object;
  constructor(view: object, target: object) {
    super(view);
    this.#target = target;
  }
  static target(view: object): object | undefined {
    return #target in view ? view.#target : undefined;
  }
}

type ViewFactory = ReturnType<typeof createDeclarationViews>["expose"];
// Registration runs once per private declaration implementation (an ordinary object), so its
// owning factory and interface choice live in native slots instead of side tables.
class Registration extends SlotTarget {
  #factory: ViewFactory;
  #styleProperties: boolean;
  constructor(implementation: object, factory: ViewFactory, styleProperties: boolean) {
    super(implementation);
    this.#factory = factory;
    this.#styleProperties = styleProperties;
  }
  static factory(implementation: object): ViewFactory | undefined {
    return #factory in implementation ? implementation.#factory : undefined;
  }
  static styleProperties(implementation: object, factory: ViewFactory): boolean {
    return #factory in implementation
      ? implementation.#factory === factory && implementation.#styleProperties
      : false;
  }
  static register(implementation: object, factory: ViewFactory, styleProperties: boolean): void {
    if (!(#factory in implementation)) new Registration(implementation, factory, styleProperties);
    else if (implementation.#factory === factory)
      implementation.#styleProperties ||= styleProperties;
    else {
      implementation.#factory = factory;
      implementation.#styleProperties = styleProperties;
    }
  }
}

// A live computed view resolves its source on every read, and that source only needs the
// declaration behind the snapshot it returns. While a live view resolves its source, snapshot
// publication returns the never-escaping target itself instead of wrapping it in another proxy.
let resolvingLiveSource = false;

function declarationImplementation(view: object): DeclarationImplementation {
  if (view === trapView && trapTarget) {
    const own = ComputedTarget.own(trapTarget, view);
    if (own) return own;
  }
  const implementation =
    ComputedTarget.resolve(ComputedView.target(view) ?? view) ?? implementations.get(view);
  if (!implementation) throw new TypeError("Illegal invocation");
  return implementation;
}
function readNamedProperty(
  style: DeclarationImplementation,
  name: string,
  property: string,
): unknown {
  const existing = Reflect.get(style, name);
  if (existing !== undefined) return existing;
  const read = Reflect.get(style, "_readGenericProperty");
  return (
    (typeof read === "function" ? Reflect.apply(read, style, [name]) : undefined) ??
    style.getPropertyValue(property)
  );
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
const upperASCII = /[A-Z]/;
/** CSSOM matches standard property names ASCII case-insensitively; custom properties are exact. */
function propertyName(value: unknown): string {
  const name = cssString(value);
  return upperASCII.test(name) && !name.startsWith("--")
    ? name.replace(/[A-Z]+/g, (letters) => letters.toLowerCase())
    : name;
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
  if (!indices) return style.publicNames?.()?.length ?? style._length;
  return style._length + indices.names.length + (indices.last ? 1 : 0);
}

function indexedItem(
  style: DeclarationImplementation,
  index: number,
  indices?: AddedIndices,
): string | undefined {
  if (!indices) {
    const names = style.publicNames?.();
    return names ? names[index] : style[index];
  }
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
      trapView = proxy;
      trapTarget = target;
      const index = indexOf(key);
      return index === undefined ? lookup.get(target, key, proxy) : item(target, index);
    },
    has(target, key) {
      const index = indexOf(key);
      return index === undefined ? lookup.has(target, key) : item(target, index) !== undefined;
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
      const value = item(target, index);
      return value !== undefined
        ? { value, writable: false, enumerable: true, configurable: true }
        : undefined;
    },
    set(target, key, value, proxy) {
      trapView = proxy;
      trapTarget = target;
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

/**
 * A computed declaration that answers reads from its pending values and builds the complete
 * declaration on first need. Frames create one per publication source, so its behavior lives on
 * a shared prototype instead of per-instance closures, and its indices are published through
 * publicNames instead of an index proxy.
 */
class DeferredBlock implements DeclarationImplementation, DeferredDeclaration {
  #pending: DeferredDeclaration["read"] | undefined;
  #create: (() => MaterializedDeclaration) | undefined;
  #completed: MaterializedDeclaration | undefined;
  #names: readonly (string | undefined)[] | undefined;
  // Never stored: indexedLength and indexedItem read publicNames first.
  readonly [index: number]: string | undefined;
  readonly parentRule = null;
  constructor(read: DeferredDeclaration["read"], create: () => MaterializedDeclaration) {
    this.#pending = read;
    this.#create = create;
  }
  block(): MaterializedDeclaration {
    if (this.#completed) return this.#completed;
    const create = this.#create;
    if (!create) throw new Error("Expected pending computed-style values");
    const result = create();
    this.#pending = undefined;
    this.#create = undefined;
    return (this.#completed = result);
  }
  /** The materialized declaration is read-only, so its index list is listed once. */
  publicNames(): readonly (string | undefined)[] {
    if (this.#names) return this.#names;
    const { style, indices } = this.block();
    return (this.#names = Array.from({ length: indexedLength(style, indices) }, (_, index) =>
      indexedItem(style, index, indices),
    ));
  }
  read(name: string): string | undefined {
    return this.#pending?.(name);
  }
  materialize(): DeclarationImplementation {
    return this.block().style;
  }
  get _length(): number {
    const { style, indices } = this.block();
    return indexedLength(style, indices);
  }
  get cssText(): string {
    return "";
  }
  set cssText(value: string) {
    this.materialize().cssText = value;
  }
  getPropertyValue(name: string): string {
    return this.read(name) ?? this.materialize().getPropertyValue(name);
  }
  getPropertyPriority(): string {
    return "";
  }
  setProperty(name: string, value: string, priority?: string): void {
    this.materialize().setProperty(name, value, priority);
  }
  removeProperty(name: string): string {
    return this.materialize().removeProperty(name);
  }
}
/** Creates Window-local public prototypes while retaining only private implementation ownership. */
export function createDeclarationViews(input: {
  emptyComputed: () => DeclarationImplementation;
  styleProperties: () => readonly StyleProperty[];
  write: (style: DeclarationImplementation, name: string, property: string, value: unknown) => void;
  objectPrototype: object;
  functionPrototype: object;
  arrayValues: typeof Array.prototype.values;
  /** Called when an interface's prototype first becomes reachable; binds its public constructor. */
  exposeInterface: <T extends Function>(name: string, real: T) => T;
}) {
  const ordinaryViews = createSlotTable<object, CSSStyleProperties>();
  const indexedHandlers = createSlotTable<object, ProxyHandler<object>>();
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
      return style.getPropertyValue(propertyName(property));
    }
    getPropertyPriority(property: string): string {
      const style = receiver(this);
      if (arguments.length === 0) throw new TypeError("1 argument required, but only 0 present.");
      return style.getPropertyPriority(propertyName(property));
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
      return style.removeProperty(propertyName(property));
    }
    get cssText(): string {
      return receiver(this).cssText;
    }
    set cssText(value: string) {
      receiver(this).cssText = cssString(value);
    }
    get length(): number {
      const style = receiver(this);
      const target = ComputedView.target(this);
      if (target && typeof computedSource(target) === "function")
        return computedNames(style).length;
      return indexedLength(style, inheritedIndices.get(style));
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
  class CSSPositionTryDescriptors extends CSSStyleDeclaration {}
  let descriptorNamesInstalled = false;
  function positionDescriptorConstructor() {
    if (!descriptorNamesInstalled) {
      const names: string[] = requireCSS("./css-position-descriptor-names.cjs");
      for (const key of names) {
        const property = key
          .replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase())
          .replace(/^webkit-/, "-webkit-");
        Object.defineProperty(CSSPositionTryDescriptors.prototype, key, {
          configurable: true,
          enumerable: true,
          get(this: CSSPositionTryDescriptors) {
            return receiver(this).getPropertyValue(property);
          },
          set(this: CSSPositionTryDescriptors, value: unknown) {
            receiver(this).setProperty(property, value == null ? "" : cssString(value));
          },
        });
      }
      Object.defineProperty(CSSPositionTryDescriptors.prototype, Symbol.toStringTag, {
        value: "CSSPositionTryDescriptors",
        configurable: true,
      });
      descriptorNamesInstalled = true;
      input.exposeInterface("CSSPositionTryDescriptors", CSSPositionTryDescriptors);
    }
    return CSSPositionTryDescriptors;
  }
  function positionDescriptors(style: PositionTryStyle, parentRule: object) {
    positionDescriptorConstructor();
    const implementation: DeclarationImplementation = {
      parentRule,
      get _length() {
        return style.length;
      },
      get cssText() {
        return style.cssText;
      },
      set cssText(text) {
        style.cssText = text;
      },
      setProperty: style.setProperty.bind(style),
      getPropertyValue: style.getPropertyValue.bind(style),
      getPropertyPriority: style.getPropertyPriority.bind(style),
      removeProperty: style.removeProperty.bind(style),
    };
    const target = Object.create(CSSPositionTryDescriptors.prototype) as CSSPositionTryDescriptors;
    const view = new Proxy<CSSPositionTryDescriptors>(
      target,
      indexedHandler(
        Reflect,
        () => style.length,
        (_, index) => style.item(index) || undefined,
      ),
    );
    implementations.set(view, implementation);
    return view;
  }
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
          ? (deferred.read(property) ?? readNamedProperty(deferred.materialize(), name, property))
          : readNamedProperty(style, name, property);
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
    input.exposeInterface("CSSStyleProperties", CSSStyleProperties);
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
      const prototype = Registration.styleProperties(implementation, expose)
        ? CSSStyleProperties.prototype
        : pageDeclarationPrototype();
      return publishComputed(prototype, implementation);
    }
    const owner = Registration.factory(implementation);
    if (owner && owner !== expose) return owner(implementation, options);
    const previous = ordinaryViews.get(implementation);
    if (previous) return previous;
    // This is an owned allocation with all observable members supplied by the public prototype/proxy.
    const target = Object.create(
      Registration.styleProperties(implementation, expose)
        ? CSSStyleProperties.prototype
        : pageDeclarationPrototype(),
    ) as CSSStyleProperties;
    new ComputedTarget(target, undefined, undefined, undefined, implementation);
    let handler = indexedHandlers.get(implementation);
    if (!handler)
      indexedHandlers.set(
        implementation,
        (handler = indexedDeclaration(implementation, published ? Reflect : privateLookup)),
      );
    const view = new Proxy<CSSStyleProperties>(target, handler);
    ComputedTarget.attach(target, view);
    new ComputedView(view, target);
    ordinaryViews.set(implementation, view);
    return view;
  }
  const inlineTargets = createSlotTable<object, InlineImplementation>();
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
  let computedClosed = false;
  /** Reads only this Window's open computed targets, matching its former per-Window side table. */
  function computedSource(target: object): ComputedSource | undefined {
    return computedClosed || ComputedTarget.resolver(target) !== computedValue
      ? undefined
      : ComputedTarget.source(target);
  }
  let empty: DeclarationImplementation | undefined;
  function computedValue(target: object): DeclarationImplementation {
    const source = computedSource(target);
    if (typeof source !== "function") return source ?? (empty ??= input.emptyComputed());
    const resolving = resolvingLiveSource;
    resolvingLiveSource = true;
    let current: object | undefined;
    try {
      current = source();
    } finally {
      resolvingLiveSource = resolving;
    }
    return current ? declarationImplementation(current) : (empty ??= input.emptyComputed());
  }
  const indexedNames = new WeakMap<DeclarationImplementation, readonly string[]>();
  function computedNames(style: DeclarationImplementation): readonly string[] {
    if (style === empty) return [];
    const cached = indexedNames.get(style);
    if (cached) return cached;
    const inherited = inheritedIndices.get(style);
    const custom: string[] = [];
    for (let i = 0, length = indexedLength(style, inherited); i < length; i++) {
      const name = indexedItem(style, i, inherited);
      if (name?.startsWith("--")) custom.push(name);
    }
    const standard = computedLonghands();
    const names = custom.length ? [...standard, ...custom.sort()] : standard;
    indexedNames.set(style, names);
    return names;
  }
  const computedHandler = indexedHandler(
    privateLookup,
    (target) => {
      const value = computedValue(target);
      return typeof computedSource(target) === "function"
        ? computedNames(value).length
        : indexedLength(value, inheritedIndices.get(value));
    },
    (target, index) => {
      const source = computedSource(target);
      if (typeof source === "function") {
        const name = computedLonghands()[index];
        if (name !== undefined) return ComputedTarget.connected(target)?.() ? name : undefined;
      }
      const value = computedValue(target);
      return typeof computedSource(target) === "function"
        ? computedNames(value)[index]
        : indexedItem(value, index, inheritedIndices.get(value));
    },
  );
  function publishComputed(
    prototype: object,
    value: ComputedSource,
    connected?: () => boolean,
  ): CSSStyleProperties {
    const target = Object.create(prototype) as CSSStyleProperties;
    new ComputedTarget(target, value, computedValue, connected);
    if (resolvingLiveSource) return target;
    const view = new Proxy<CSSStyleProperties>(target, computedHandler);
    ComputedTarget.attach(target, view);
    new ComputedView(view, target);
    return view;
  }
  return {
    CSSStyleDeclaration,
    get CSSPositionTryDescriptors() {
      return positionDescriptorConstructor();
    },
    positionDescriptors,
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
      new ComputedTarget(target, undefined, undefined, undefined, style);
      const view = new Proxy<CSSStyleProperties>(target, inlineHandler);
      ComputedTarget.attach(target, view);
      new ComputedView(view, target);
      deferredDeclarations.set(style, style);
      return view;
    },
    materializedInline(view: object, style: DeclarationImplementation): void {
      const target = ComputedView.target(view);
      if (!target || !ComputedTarget.replace(target, style))
        throw new TypeError("Expected an inline declaration view");
    },
    /** Binds private immutable context metadata once while returning a fresh public snapshot on every call. */
    freshPublisher(
      implementation: DeclarationImplementation,
      inherited?: AddedIndices,
    ): () => CSSStyleProperties {
      const prototype = Registration.styleProperties(implementation, expose)
        ? CSSStyleProperties.prototype
        : pageDeclarationPrototype();
      if (inherited) inheritedIndices.set(implementation, inherited);
      return () => publishComputed(prototype, implementation);
    },
    deferredPublisher(
      read: DeferredDeclaration["read"],
      create: () => MaterializedDeclaration,
    ): () => CSSStyleProperties {
      const block = new DeferredBlock(read, create);
      deferredDeclarations.set(block, block);
      return () => publishComputed(CSSStyleProperties.prototype, block);
    },
    liveView(
      read: () => CSSStyleProperties | undefined,
      connected: () => boolean,
    ): CSSStyleProperties {
      return publishComputed(propertyPrototype, read, connected);
    },
    closeComputed(): void {
      computedClosed = true;
    },
    register(implementation: DeclarationImplementation, hasStyleProperties: boolean): void {
      Registration.register(implementation, expose, hasStyleProperties);
    },
  };
}
