// Pins that lazily published CSS interface objects reflect exactly like the classes they stand for.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { types } from "node:util";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

const lazyNames = [
  "CSSStyleProperties",
  "CSSPositionTryDescriptors",
  "CSSFontFaceDescriptors",
  "CSSFunctionDescriptors",
  "CSSFunctionDeclarations",
  "CSSMarginDescriptors",
  "CSSPageDescriptors",
] as const;
type LazyName = (typeof lazyNames)[number];

const rules = `
  @function --double(--x) { result: calc(var(--x) * 2); }
  @font-face { font-family: X; src: url(x.woff); }
  @page :first { margin: 1in; @top-left { content: "a"; } }
  @position-try --flip { top: 1px; }
`;

type Win = JSDOM["window"] & Record<string, unknown>;

/** Reads a property path from parsed CSSOM objects. */
const at = (value: unknown, ...path: (string | number)[]): object =>
  path.reduce<unknown>((object, key) => Reflect.get(object as object, key), value) as object;

/** Creates one instance of every lazy interface through CSS that the Window parses. */
function instances(window: Win): Record<LazyName, object> {
  const style = window.document.createElement("style");
  style.textContent = rules;
  window.document.head!.append(style);
  const rulesOf = at(window.document.styleSheets[0], "cssRules");
  return {
    CSSStyleProperties: window.document.body!.style,
    CSSPositionTryDescriptors: at(rulesOf, 3, "style"),
    CSSFontFaceDescriptors: at(rulesOf, 1, "style"),
    CSSFunctionDescriptors: at(rulesOf, 0, "cssRules", 0, "style"),
    CSSFunctionDeclarations: at(rulesOf, 0, "cssRules", 0),
    CSSMarginDescriptors: at(rulesOf, 2, "cssRules", 0, "style"),
    CSSPageDescriptors: at(rulesOf, 2, "style"),
  };
}

const error = (operation: () => unknown): string => {
  try {
    operation();
    return "none";
  } catch (cause) {
    return cause instanceof Error ||
      (typeof cause === "object" && cause !== null && "name" in cause)
      ? `${(cause as Error).name}: ${(cause as Error).message}`
      : String(cause);
  }
};
const shape = (descriptor: PropertyDescriptor | undefined, self: Function) =>
  descriptor &&
  Object.entries(descriptor).map(
    ([field, value]) =>
      `${field}:${value === self.prototype ? "<prototype>" : typeof value === "function" ? `fn ${value.name}` : String(value)}`,
  );

/** Describes every ECMAScript-observable fact of one interface object, without identities. */
function describeConstructor(window: Win, name: LazyName) {
  const C = window[name] as (new () => object) & { prototype: object };
  const parent = Object.getPrototypeOf(C) as Function;
  class Sub extends C {}
  const window$ = Object.getOwnPropertyDescriptor(window, name)!;
  return {
    type: typeof C,
    stable: window[name] === C,
    global: [window$.get?.name, window$.set, window$.enumerable, window$.configurable],
    name: C.name,
    length: C.length,
    ownKeys: Reflect.ownKeys(C).map(String),
    own: Reflect.ownKeys(C).map((key) => shape(Object.getOwnPropertyDescriptor(C, key), C)),
    parent: [parent.name, parent === window[parent.name]],
    prototypeConstructor: C.prototype.constructor === C,
    constructorShape: shape(Object.getOwnPropertyDescriptor(C.prototype, "constructor"), C),
    prototypeKeys: Reflect.ownKeys(C.prototype).length,
    prototypeKeyHead: Reflect.ownKeys(C.prototype).slice(0, 4).map(String),
    tag: Object.prototype.toString.call(C.prototype),
    hasInstance: Reflect.get(C, Symbol.hasInstance) === Function.prototype[Symbol.hasInstance],
    has: ["prototype" in C, "name" in C, "call" in C, "missing" in C],
    extensible: [Object.isExtensible(C), Object.isFrozen(C), Object.isSealed(C)],
    construct: error(() => Reflect.construct(C, [])),
    call: error(() => Reflect.apply(C, undefined, [])),
    subclass: error(() => new Sub()),
    subclassChain: [
      Object.getPrototypeOf(Sub) === C,
      Object.getPrototypeOf(Sub.prototype) === C.prototype,
    ],
    newTarget: Object.getPrototypeOf(Reflect.construct(Object, [], C)) === C.prototype,
    clone: error(() => structuredClone(C)).split(":")[0],
  };
}

function describeInstance(window: Win, name: LazyName, instance: object) {
  const C = window[name] as Function & { prototype: object };
  return {
    instanceOf: instance instanceof C,
    prototype: Object.getPrototypeOf(instance) === C.prototype,
    constructor: (instance as { constructor: unknown }).constructor === C,
    tag: Object.prototype.toString.call(instance),
  };
}

type Order = "constructor first" | "instance first" | "read, use, then reflect";

/** Reflects all lazy interfaces of a fresh Window after interacting with them in a given order. */
function reflect(order: Order, options: { runScripts?: "dangerously" } = {}) {
  const window = new JSDOM("<!doctype html><head></head><body></body>", options).window as Win;
  try {
    let constructors: Record<string, unknown> = {};
    let made: Record<LazyName, object>;
    if (order === "constructor first") {
      // Every constructor is read, then materialised by reflection before CSS creates any instance.
      for (const name of lazyNames) void window[name];
      constructors = Object.fromEntries(
        lazyNames.map((name) => [name, describeConstructor(window, name)]),
      );
      made = instances(window);
    } else if (order === "instance first") {
      // Internal use publishes every class before the Window property is ever read.
      made = instances(window);
      for (const name of lazyNames) void (made[name] as { constructor: unknown }).constructor;
      constructors = Object.fromEntries(
        lazyNames.map((name) => [name, describeConstructor(window, name)]),
      );
    } else {
      // The Vitest read pattern runs first, then CSS creates instances, then reflection.
      for (const name of lazyNames) void (typeof window[name] === "function");
      made = instances(window);
      constructors = Object.fromEntries(
        lazyNames.map((name) => [name, describeConstructor(window, name)]),
      );
    }
    const proxies = lazyNames.filter((name) => types.isProxy(window[name]));
    const instanceShapes = Object.fromEntries(
      lazyNames.map((name) => [name, describeInstance(window, name, made[name])]),
    );
    return { constructors, instanceShapes, proxies };
  } finally {
    window.close();
  }
}

/** Freezes and extends each interface object, then reflects what became of it. */
function mutate(readFirst: boolean) {
  const window = new JSDOM("<!doctype html><head></head><body></body>").window as Win;
  try {
    if (!readFirst) instances(window);
    return lazyNames.map((name) => {
      const C = window[name] as Function & Record<string, unknown>;
      const defined = Reflect.defineProperty(C, "fixed", { value: 1, configurable: false });
      const deleted = Reflect.deleteProperty(C, "fixed");
      const looseSet = Reflect.set(C, "loose", 2);
      const looseDeleted = Reflect.deleteProperty(C, "loose");
      C.kept = 4;
      const prevented = Reflect.preventExtensions(C);
      const afterPrevent = [
        Reflect.ownKeys(C).map(String),
        (Object.getPrototypeOf(C) as Function).name,
      ];
      const keptDeleted = Reflect.deleteProperty(C, "kept");
      Object.freeze(C);
      return {
        prevented,
        afterPrevent,
        keptDeleted,
        defined,
        deleted,
        looseSet,
        looseDeleted,
        frozen: [Object.isFrozen(C), Object.isExtensible(C)],
        keys: Reflect.ownKeys(C).map(String),
        fixed: Object.getOwnPropertyDescriptor(C, "fixed"),
        prototype: shape(Object.getOwnPropertyDescriptor(C, "prototype"), C),
        assign: Reflect.set(C, "later", 3),
        reparent: Reflect.setPrototypeOf(C, null),
      };
    });
  } finally {
    window.close();
  }
}

describe("lazily published CSS interface objects", () => {
  it("reflect identically whether reflection, instances or a typeof read comes first", () => {
    // Given: three fresh Windows that meet the CSS interfaces in a different order
    // When: each interface object and one parsed instance of it are reflected
    const constructorFirst = reflect("constructor first");
    const instanceFirst = reflect("instance first");
    const readFirst = reflect("read, use, then reflect");
    // Then: every observable fact matches the Window where the classes were published eagerly
    expect(instanceFirst.proxies).toEqual([]);
    expect(constructorFirst.proxies).toEqual([...lazyNames]);
    expect(readFirst.proxies).toEqual([...lazyNames]);
    expect(constructorFirst.constructors).toEqual(instanceFirst.constructors);
    expect(readFirst.constructors).toEqual(instanceFirst.constructors);
    expect(constructorFirst.instanceShapes).toEqual(instanceFirst.instanceShapes);
    expect(readFirst.instanceShapes).toEqual(instanceFirst.instanceShapes);
  });

  it("reflect identically in a Window with its own script realm", () => {
    // Given: Windows that run scripts in their own realm
    // When: interfaces are reflected before and after CSS creates instances
    const lazy = reflect("constructor first", { runScripts: "dangerously" });
    const eager = reflect("instance first", { runScripts: "dangerously" });
    // Then: the lazy objects reflect exactly like the eagerly published classes
    expect(lazy.proxies).toEqual([...lazyNames]);
    expect(lazy.constructors).toEqual(eager.constructors);
    expect(lazy.instanceShapes).toEqual(eager.instanceShapes);
  });

  it("match jsdom's interface objects for name, length, keys and construction errors", () => {
    // Given: a fresh Window whose CSS interfaces were never used
    const { constructors } = reflect("constructor first");
    // Then: each matches what jsdom 31.0.1 reports for the same interface
    for (const name of lazyNames) {
      expect(constructors[name]).toMatchObject({
        type: "function",
        stable: true,
        global: [`get ${name}`, undefined, false, true],
        name,
        length: 0,
        ownKeys: ["length", "name", "prototype"],
        prototypeConstructor: true,
        hasInstance: true,
        construct: "TypeError: Illegal constructor",
        call: `TypeError: Class constructor ${name} cannot be invoked without 'new'`,
        subclass: "TypeError: Illegal constructor",
        clone: "DataCloneError",
      });
    }
  });

  it("keep Proxy invariants when frozen, extended and reparented", () => {
    // Given: interface objects mutated before and after the classes were published
    // When: a non-configurable property is defined, an expando added and deleted, extensions
    // prevented with another expando present, that expando deleted and the object frozen
    const lazy = mutate(true);
    const eager = mutate(false);
    // Then: every operation reports what it reports on the published class, without a TypeError
    expect(lazy).toEqual(eager);
    expect(lazy[0]).toMatchObject({
      prevented: true,
      afterPrevent: [["length", "name", "prototype", "fixed", "kept"], "CSSStyleDeclaration"],
      keptDeleted: true,
      defined: true,
      deleted: false,
      looseSet: true,
      looseDeleted: true,
      frozen: [true, false],
    });
  });

  it("resolve a Window getter to the same object as the constructor of parsed instances", () => {
    // Given: Window properties read as Vitest does, then a stylesheet parsed later
    const window = new JSDOM("<!doctype html><head></head><body></body>").window as Win;
    const early = Object.fromEntries(lazyNames.map((name) => [name, window[name]]));
    // When: instances of every interface are created by CSS
    const made = instances(window);
    // Then: each instance's constructor is the early object, and reads stay stable
    for (const name of lazyNames) {
      expect((made[name] as { constructor: unknown }).constructor).toBe(early[name]);
      expect(window[name]).toBe(early[name]);
    }
    window.close();
  });
});

describe("lazily published CSS interface objects in a fresh process", () => {
  it("are read by the Vitest environment's global pass without building any CSS class", () => {
    const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=commonjs",
        "-e",
        `
        const assert = require("node:assert/strict");
        const { types } = require("node:util");
        const { JSDOM } = require(${JSON.stringify(entry)});
        const loaded = () => Object.keys(require.cache).filter((path) => /[\\\\/]css-/.test(path)).map((path) => path.split(/[\\\\/]/).pop());
        for (const runScripts of [undefined, "dangerously"]) {
          // Given: a fresh Window
          const { window } = new JSDOM("<!doctype html><p></p>", { runScripts });
          // When: every key is read exactly as Vitest's populateGlobal does
          for (const key of Object.getOwnPropertyNames(window)) {
            let value;
            try { value = window[key]; } catch { continue; }
            if (typeof value === "function" && key[0] !== key[0].toUpperCase()) value.bind(window);
          }
          // Then: no CSS artifact loaded and every lazy interface is still a shell
          assert.deepEqual(loaded(), []);
          for (const name of ${JSON.stringify(lazyNames)}) assert.equal(types.isProxy(window[name]), true, name);
          window.close();
        }
        process.stdout.write("verified");
        `,
      ],
      { encoding: "utf8", timeout: 30000 },
    );
    expect(output).toBe("verified");
  });
});
