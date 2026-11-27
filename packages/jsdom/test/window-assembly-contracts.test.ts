// Pins the reflected shape of table-installed Window interface members and wrapper clone barriers.
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

const ariaStrings = [
  "role",
  "ariaAtomic",
  "ariaAutoComplete",
  "ariaBrailleLabel",
  "ariaBrailleRoleDescription",
  "ariaBusy",
  "ariaChecked",
  "ariaColCount",
  "ariaColIndex",
  "ariaColIndexText",
  "ariaColSpan",
  "ariaCurrent",
  "ariaDescription",
  "ariaDisabled",
  "ariaExpanded",
  "ariaHasPopup",
  "ariaHidden",
  "ariaInvalid",
  "ariaKeyShortcuts",
  "ariaLabel",
  "ariaLevel",
  "ariaLive",
  "ariaModal",
  "ariaMultiLine",
  "ariaMultiSelectable",
  "ariaOrientation",
  "ariaPlaceholder",
  "ariaPosInSet",
  "ariaPressed",
  "ariaReadOnly",
  "ariaRelevant",
  "ariaRequired",
  "ariaRoleDescription",
  "ariaRowCount",
  "ariaRowIndex",
  "ariaRowIndexText",
  "ariaRowSpan",
  "ariaSelected",
  "ariaSetSize",
  "ariaSort",
  "ariaValueMax",
  "ariaValueMin",
  "ariaValueNow",
  "ariaValueText",
];
const ariaReferences = [
  "ariaActiveDescendantElement",
  "ariaControlsElements",
  "ariaDescribedByElements",
  "ariaDetailsElements",
  "ariaErrorMessageElements",
  "ariaFlowToElements",
  "ariaLabelledByElements",
  "ariaOwnsElements",
];
const bodyHandlers = [
  "onafterprint",
  "onbeforeprint",
  "onbeforeunload",
  "onhashchange",
  "onlanguagechange",
  "onmessage",
  "onmessageerror",
  "onoffline",
  "ononline",
  "onpagehide",
  "onpagereveal",
  "onpageshow",
  "onpageswap",
  "onpopstate",
  "onrejectionhandled",
  "onstorage",
  "onunhandledrejection",
  "onunload",
];
const nodeConstants = [
  ["ELEMENT_NODE", 1],
  ["ATTRIBUTE_NODE", 2],
  ["TEXT_NODE", 3],
  ["CDATA_SECTION_NODE", 4],
  ["ENTITY_REFERENCE_NODE", 5],
  ["ENTITY_NODE", 6],
  ["PROCESSING_INSTRUCTION_NODE", 7],
  ["COMMENT_NODE", 8],
  ["DOCUMENT_NODE", 9],
  ["DOCUMENT_TYPE_NODE", 10],
  ["DOCUMENT_FRAGMENT_NODE", 11],
  ["NOTATION_NODE", 12],
  ["DOCUMENT_POSITION_DISCONNECTED", 1],
  ["DOCUMENT_POSITION_PRECEDING", 2],
  ["DOCUMENT_POSITION_FOLLOWING", 4],
  ["DOCUMENT_POSITION_CONTAINS", 8],
  ["DOCUMENT_POSITION_CONTAINED_BY", 16],
  ["DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC", 32],
] as const;

function keysAfter(target: object, anchor: string): string[] {
  const names = Object.getOwnPropertyNames(target);
  return names.slice(names.indexOf(anchor) + 1);
}

function accessor(target: object, name: string): PropertyDescriptor {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  if (!descriptor) throw new Error(`Missing ${name}`);
  return descriptor;
}

describe("Window interface member tables", () => {
  it("appends ARIA reflection after Element's own members in a fixed order", () => {
    // Given: two independent Windows.
    const first = new JSDOM("").window;
    const second = new JSDOM("").window;
    try {
      // When: Element.prototype's own string keys are reflected.
      const prototype = first.Element.prototype;
      // Then: ARIA strings follow querySelectorAll, then ARIA element references, then symbols.
      expect(keysAfter(prototype, "querySelectorAll")).toEqual([...ariaStrings, ...ariaReferences]);
      expect(Object.getOwnPropertySymbols(prototype)).toEqual([
        Symbol.unscopables,
        Symbol.toStringTag,
      ]);
      for (const name of ariaStrings) {
        const descriptor = accessor(prototype, name);
        expect(descriptor).toMatchObject({ enumerable: true, configurable: true });
        expect([descriptor.get?.name, descriptor.set?.name]).toEqual(["get", "set"]);
        // And: the accessor functions stay module-shared across Windows.
        expect(accessor(second.Element.prototype, name).get).toBe(descriptor.get);
      }
      expect(first.Element).not.toBe(second.Element);
      expect(first.Element.prototype === second.Element.prototype).toBe(false);
    } finally {
      first.close();
      second.close();
    }
  });

  it("reflects ARIA attributes through every element interface", () => {
    // Given: an HTML and an SVG element.
    const { window } = new JSDOM('<p aria-label="x"></p><svg role="img"></svg>');
    try {
      const paragraph = window.document.querySelector("p")!;
      const svg = window.document.querySelector("svg")!;
      // When: ARIA properties are read and written through subclass instances.
      paragraph.ariaBusy = "true";
      // Then: they reflect the content attributes.
      expect(paragraph.ariaLabel).toBe("x");
      expect(paragraph.getAttribute("aria-busy")).toBe("true");
      expect(svg.role).toBe("img");
    } finally {
      window.close();
    }
  });

  it("installs event handler accessors in a fixed order with shared functions", () => {
    // Given: two independent Windows.
    const first = new JSDOM("").window;
    const second = new JSDOM("").window;
    try {
      // When/Then: body and frameset handlers follow their own members.
      expect(keysAfter(first.HTMLBodyElement.prototype, "background")).toEqual(bodyHandlers);
      expect(keysAfter(first.HTMLFrameSetElement.prototype, "rows")).toEqual(bodyHandlers);
      // And: global handlers end each receiving prototype in the same order.
      const global = keysAfter(first.HTMLElement.prototype, "click");
      expect(global[0]).toBe("onabort");
      expect(global.at(-1)).toBe("oncommand");
      expect(keysAfter(first.SVGElement.prototype, "viewportElement")).toEqual(global);
      expect(keysAfter(first.Document.prototype, "querySelectorAll")).toEqual([
        ...global,
        "onreadystatechange",
        "onvisibilitychange",
      ]);
      for (const [name, prototype] of [
        ["onclick", first.HTMLElement.prototype],
        ["onclick", first.SVGElement.prototype],
        ["onvisibilitychange", first.Document.prototype],
        ["onpopstate", first.HTMLBodyElement.prototype],
      ] as const) {
        const descriptor = accessor(prototype, name);
        expect(descriptor).toMatchObject({ enumerable: true, configurable: true });
        expect([descriptor.get?.length, descriptor.set?.length]).toEqual([0, 1]);
        const other = Reflect.get(second, prototype.constructor.name).prototype as object;
        expect(accessor(other, name).get).toBe(descriptor.get);
      }
    } finally {
      first.close();
      second.close();
    }
  });

  it("defines Node constants as read-only enumerable data on constructor and prototype", () => {
    // Given: a Window's Node interface.
    const { window } = new JSDOM("");
    try {
      for (const target of [window.Node, window.Node.prototype]) {
        // When: the constant names are reflected after the constructor's own members.
        const names = Object.getOwnPropertyNames(target);
        const start = names.indexOf("ELEMENT_NODE");
        // Then: they keep their order, values and flags.
        expect(names.slice(start, start + nodeConstants.length)).toEqual(
          nodeConstants.map(([name]) => name),
        );
        for (const [name, value] of nodeConstants)
          expect(Object.getOwnPropertyDescriptor(target, name)).toEqual({
            value,
            writable: false,
            enumerable: true,
            configurable: false,
          });
      }
      expect(Object.getOwnPropertyNames(window.Node).slice(0, 4)).toEqual([
        "length",
        "name",
        "prototype",
        "ELEMENT_NODE",
      ]);
    } finally {
      window.close();
    }
  });
});

type SurfaceWindow = JSDOM["window"];

// JavaScript intrinsics of a script-enabled global belong to the engine, not to Window assembly.
const intrinsicGlobals = new Set(runInNewContext("Reflect.ownKeys(globalThis)") as PropertyKey[]);

// One line per own property, in reflection order, for the Window, its prototype chain and every
// per-Window interface constructor and prototype it exposes as data. Getters are never invoked.
// Functions record name, length and whether `other` exposes the same function at the same place.
function describeSurface(window: SurfaceWindow, other: SurfaceWindow): string[] {
  const vm = Reflect.get(window, "Object") !== Object;
  const names = new Map<object, string>();
  const realmObject = Reflect.get(window, "Object") as ObjectConstructor | undefined;
  names.set(Object.prototype, "host:Object.prototype");
  names.set(Function.prototype, "host:Function.prototype");
  names.set(globalThis, "host:globalThis");
  if (realmObject) {
    names.set(realmObject.prototype, "Object.prototype");
    names.set(Object.getPrototypeOf(realmObject) as object, "Function.prototype");
  }
  const interfaces: string[] = [];
  const windowKeys = Reflect.ownKeys(window).filter((key) => !vm || !intrinsicGlobals.has(key));
  for (const key of windowKeys) {
    const value: unknown = Object.getOwnPropertyDescriptor(window, key)?.value;
    if (typeof key !== "string" || typeof value !== "function" || names.has(value)) continue;
    // Shared host classes keep their own platform-defined members.
    if (value === Reflect.get(other, key)) continue;
    const prototype: unknown = value.prototype;
    if (typeof prototype !== "object" || prototype === null) continue;
    names.set(value, key);
    if (!names.has(prototype)) names.set(prototype, `${key}.prototype`);
    interfaces.push(key);
  }
  const name = (value: object | null): string => {
    if (value === null) return "null";
    const known = names.get(value);
    if (known) return known;
    if (typeof value === "function") return `?function ${JSON.stringify(value.name)}`;
    const keys = Reflect.ownKeys(value).map(String).join(",");
    return `?${Object.prototype.toString.call(value)}{${keys}}`;
  };
  const otherTarget = (path: readonly PropertyKey[]): unknown =>
    path.reduce<unknown>(
      (target, key) =>
        target === undefined || target === null ? undefined : Reflect.get(Object(target), key),
      other,
    );
  const fn = (value: unknown, counterpart: unknown): string => {
    if (typeof value !== "function") return value === undefined ? "-" : `!${typeof value}`;
    const identity = value === counterpart ? "shared" : "own";
    return `fn(${JSON.stringify(value.name)},${value.length},${identity})`;
  };
  const value = (data: unknown, counterpart: unknown): string => {
    if (typeof data === "function") return fn(data, counterpart);
    if (typeof data === "object" && data !== null) return `obj(${name(data)})`;
    return typeof data === "symbol" ? String(data) : `${typeof data}:${String(data)}`;
  };
  const lines: string[] = [];
  const describeObject = (
    label: string,
    target: object,
    path: readonly PropertyKey[],
    keys = Reflect.ownKeys(target),
  ): void => {
    const counterpartTarget = otherTarget(path);
    lines.push(`${label} [[Prototype]]=${name(Object.getPrototypeOf(target) as object | null)}`);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (!descriptor) continue;
      const counterpart =
        typeof counterpartTarget === "object" || typeof counterpartTarget === "function"
          ? Object.getOwnPropertyDescriptor(counterpartTarget, key)
          : undefined;
      const flags = `${descriptor.enumerable ? "e" : "-"}${descriptor.configurable ? "c" : "-"}`;
      const shape =
        "value" in descriptor
          ? `data ${flags}${descriptor.writable ? "w" : "-"} ${value(descriptor.value, counterpart?.value)}`
          : `accessor ${flags} get=${fn(descriptor.get, counterpart?.get)} set=${fn(descriptor.set, counterpart?.set)}`;
      lines.push(`  ${String(key)}: ${shape}`);
    }
  };
  describeObject("window", window, [], windowKeys);
  let prototype = Object.getPrototypeOf(window) as object | null;
  for (let depth = 1; prototype && !names.has(prototype); depth++) {
    const path = Array.from({ length: depth }, () => "__proto__");
    describeObject(`window${".__proto__".repeat(depth)}`, prototype, path);
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  for (const key of interfaces) {
    const constructor = Reflect.get(window, key) as { prototype: object };
    describeObject(key, constructor, [key]);
    if (names.get(constructor.prototype) === `${key}.prototype`)
      describeObject(`${key}.prototype`, constructor.prototype, [key, "prototype"]);
  }
  return lines;
}

describe("Window global surface", () => {
  for (const [label, options] of [
    ["host", {}],
    ["vm", { runScripts: "dangerously" }],
  ] as const) {
    it(`keeps every ${label} Window key, descriptor, function and prototype chain fixed`, async () => {
      // Given: two independent Windows built with the same options.
      const first = new JSDOM("", options).window;
      const second = new JSDOM("", options).window;
      try {
        // When: both global surfaces are reflected against each other.
        const surface = describeSurface(first, second);
        const mirrored = describeSurface(second, first);
        // Then: the surface matches the pinned reflection exactly.
        await expect(`${surface.join("\n")}\n`).toMatchFileSnapshot(
          `./__snapshots__/window-surface.${label}.txt`,
        );
        // And: both Windows have the same shape; the pinned "own"/"shared" marks record which
        // functions are per-Window, and the DOM interfaces are never shared.
        expect(mirrored).toEqual(surface);
        for (const key of ["Window", "EventTarget", "Node", "Element", "HTMLElement", "Document"]) {
          const constructor = Reflect.get(first, key) as { prototype: object };
          const counterpart = Reflect.get(second, key) as { prototype: object };
          expect(constructor === counterpart, key).toBe(false);
          expect(constructor.prototype === counterpart.prototype, key).toBe(false);
        }
      } finally {
        first.close();
        second.close();
      }
    });
  }
});

describe("Node wrapper clone barrier", () => {
  it("rejects host structured cloning of every wrapper allocation path", () => {
    // Given: wrappers from parsing, element creation, text, documents and fragments.
    const { window } = new JSDOM("<p>text</p><input><svg></svg>");
    try {
      const { document } = window;
      const nodes = [
        document,
        document.body,
        document.querySelector("p")!,
        document.querySelector("input")!,
        document.querySelector("svg")!,
        document.querySelector("p")!.firstChild!,
        document.createElement("div"),
        document.createDocumentFragment(),
        document.createComment("c"),
      ];
      for (const node of nodes) {
        // When: Node's structuredClone serializes the wrapper.
        // Then: it fails with DataCloneError instead of copying an empty object.
        expect(() => structuredClone(node)).toThrow(
          expect.objectContaining({ name: "DataCloneError" }),
        );
      }
    } finally {
      window.close();
    }
  });
});
