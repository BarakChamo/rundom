// Pins the reflected shape of table-installed Window interface members and wrapper clone barriers.
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
