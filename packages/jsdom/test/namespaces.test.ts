// Exercises namespace-aware element construction and reflected attributes.
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

describe("DOM namespaces", () => {
  it("preserves the qualified name while matching the local name", () => {
    // Given: an HTML document with a programmatically created prefixed element.
    const { window } = new JSDOM("<main></main>");
    try {
      const { document } = window;
      const node = document.createElementNS("urn:shape", "s:point");

      // When: the element enters the document.
      document.body?.appendChild(node);

      // Then: namespace lookups use local names, while qualified lookups keep the prefix.
      expect([node.prefix, node.localName, node.tagName]).toEqual(["s", "point", "s:point"]);
      expect(document.getElementsByTagNameNS("urn:shape", "point").item(0)).toBe(node);
      expect(document.getElementsByTagName("s:point").item(0)).toBe(node);
      expect(() => document.createElementNS("", "s:point")).toThrow(
        "A prefix requires a namespace",
      );
    } finally {
      window.close();
    }
  });

  it("keeps attribute objects live across updates and detaches them on replacement", () => {
    // Given: a parsed attribute and a detached replacement.
    const { window } = new JSDOM('<div flag="old"></div><p></p>');
    try {
      const { document } = window;
      const div = document.querySelector("div");
      const p = document.querySelector("p");
      if (!div || !p) throw new Error("Expected fixture elements");
      const current = div.getAttributeNode("flag");
      if (!current) throw new Error("Expected the parsed attribute");
      const replacement = document.createAttribute("FLAG");
      replacement.value = "replacement";
      const attributes = div.attributes;

      // When: the original is changed, then replaced through the live map.
      div.setAttribute("flag", "changed");
      expect(current.value).toBe("changed");
      expect(attributes.setNamedItem(replacement)).toBe(current);

      // Then: ownership follows the attribute record and cannot be shared.
      expect(attributes[0] === replacement).toBe(true);
      expect(current.ownerElement).toBeNull();
      expect(replacement.ownerElement === div).toBe(true);
      expect(replacement.nodeType).toBe(2);
      expect(() => p.setAttributeNode(replacement)).toThrow("Attribute is already in use");
      replacement.nodeValue = "updated";
      expect(div.getAttribute("flag")).toBe("updated");
      expect(attributes.removeNamedItem("flag") === replacement).toBe(true);
      expect(replacement.ownerElement).toBeNull();
      expect(attributes.length).toBe(0);
    } finally {
      window.close();
    }
  });

  it("updates namespaced attributes independently and reports their namespace", () => {
    // Given: an element with an ordinary attribute and an observer.
    const { window } = new JSDOM('<div flag="plain"></div>');
    try {
      const node = window.document.querySelector("div");
      if (!node) throw new Error("Expected a div");
      const observer = new window.MutationObserver(() => {});
      observer.observe(node, { attributeOldValue: true });

      // When: a namespaced attribute with the same local name is set twice and removed.
      node.setAttributeNS("urn:flags", "a:flag", "first");
      node.setAttributeNS("urn:flags", "b:flag", "second");
      expect(node.getAttributeNames()).toEqual(["flag", "a:flag"]);
      expect(node.getAttribute("a:flag")).toBe("second");
      expect(node.getAttributeNS("urn:flags", "flag")).toBe("second");
      node.removeAttributeNS("urn:flags", "flag");

      // Then: the unrelated attribute survives and all records identify the local name.
      expect(node.getAttribute("FLAG")).toBe("plain");
      expect(node.hasAttributeNS("urn:flags", "flag")).toBe(false);
      expect(
        observer
          .takeRecords()
          .map((record) => [record.attributeNamespace, record.attributeName, record.oldValue]),
      ).toEqual([
        ["urn:flags", "flag", null],
        ["urn:flags", "flag", "first"],
        ["urn:flags", "flag", "second"],
      ]);
    } finally {
      window.close();
    }
  });
});

it("resolves namespace declarations through the current tree and attribute owner", () => {
  // Given: an XML tree with a default declaration and a rebound prefix.
  const { window } = new JSDOM(
    '<root xmlns="urn:root" xmlns:p="urn:outer"><child xmlns:p="urn:inner" flag="value">text</child></root>',
    {
      contentType: "application/xml",
    },
  );
  try {
    const { document } = window;
    const child = document.documentElement?.firstElementChild;
    const attr = child?.getAttributeNode("flag");
    if (!child || !attr) throw new Error("Expected the child and attribute");

    // When: a caller resolves names from descendants and then detaches the attribute.
    expect(child.firstChild?.lookupNamespaceURI("p")).toBe("urn:inner");
    expect(attr.lookupPrefix("urn:inner")).toBe("p");
    expect(document.lookupNamespaceURI("p")).toBe("urn:outer");
    expect(child.isDefaultNamespace("urn:root")).toBe(true);
    child.removeAttributeNode(attr);

    // Then: a detached attribute has no namespace context.
    expect(attr.lookupNamespaceURI("p")).toBeNull();
  } finally {
    window.close();
  }
});

it("keeps SVG viewport ancestry and ID lookup scoped to the SVG tree", () => {
  // Given nested SVG viewports and a duplicate ID outside them.
  const { window } = new JSDOM(
    '<div id="target"></div><svg id="outer"><g><svg id="inner"><title id="target">Label</title></svg></g></svg>',
  );
  try {
    const { document } = window;
    const outer = document.getElementById("outer");
    const inner = document.getElementById("inner");
    const title = document.querySelector("svg title");
    if (!(outer instanceof window.SVGSVGElement) || !(inner instanceof window.SVGSVGElement))
      throw new Error("Expected SVG roots");
    if (!(title instanceof window.SVGTitleElement)) throw new Error("Expected an SVG title");

    expect(outer.ownerSVGElement).toBeNull();
    expect(inner.viewportElement).toBe(outer);
    expect(title.ownerSVGElement).toBe(inner);
    expect(inner.getElementById("target")).toBe(title);
    expect(inner.getElementById("inner")).toBe(inner);

    // When the title is moved to the outer SVG.
    outer.append(title);
    // Then both ancestry and subtree lookup use its new position.
    expect(title.viewportElement).toBe(outer);
    expect(inner.getElementById("target")).toBeNull();
    expect(outer.getElementById("target")).toBe(title);
  } finally {
    window.close();
  }
});

it("creates detached SVG values with finite single-precision coordinates", () => {
  // Given an SVG root with its own Window constructors.
  const { window } = new JSDOM("<svg></svg>");
  try {
    const root = window.document.querySelector("svg");
    if (!(root instanceof window.SVGSVGElement)) throw new Error("Expected an SVG root");
    const number = root.createSVGNumber();
    const rect = root.createSVGRect();
    expect(number).toBeInstanceOf(window.SVGNumber);
    expect(rect).toBeInstanceOf(window.SVGRect);
    expect([number.value, rect.x, rect.y, rect.width, rect.height]).toEqual([0, 0, 0, 0, 0]);

    // When valid values and then out-of-range values are assigned.
    number.value = 1 / 3;
    rect.width = -12;
    expect(() => (number.value = 1e40)).toThrow("finite float");
    expect(() => (rect.width = Infinity)).toThrow("finite float");

    // Then rejected values preserve the previous state.
    expect(number.value).toBe(Math.fround(1 / 3));
    expect(rect.width).toBe(-12);
    expect(root.createSVGRect().width).toBe(0);
  } finally {
    window.close();
  }
});

it("reflects viewBox through stable mutable and read-only SVG rectangles", () => {
  // Given an SVG root and a symbol with different view boxes.
  const { window } = new JSDOM('<svg viewBox="1, 2 30 40"><symbol viewBox="0 0 8 9"/></svg>');
  try {
    const root = window.document.querySelector("svg");
    const symbol = window.document.querySelector("symbol");
    if (!(root instanceof window.SVGSVGElement) || !(symbol instanceof window.SVGSymbolElement))
      throw new Error("Expected SVG elements with view boxes");
    const view = root.viewBox;
    const { baseVal, animVal } = view;
    expect(view).toBeInstanceOf(window.SVGAnimatedRect);
    expect([baseVal.x, baseVal.y, baseVal.width, baseVal.height]).toEqual([1, 2, 30, 40]);

    // When either the rectangle or the underlying attribute changes.
    baseVal.width = 25;
    expect(root.getAttribute("viewBox")).toBe("1 2 25 40");
    expect(animVal.width).toBe(25);
    root.setAttribute("viewBox", "0 0 -1 10");

    // Then retained rectangles reflect the invalid attribute as zero and writes to animVal fail.
    expect(root.viewBox).toBe(view);
    expect(view.baseVal).toBe(baseVal);
    expect(view.animVal).toBe(animVal);
    expect(baseVal.width).toBe(0);
    expect(() => (animVal.width = 7)).toThrow("read-only");
    expect(symbol.viewBox.baseVal.width).toBe(8);
  } finally {
    window.close();
  }
});

it("keeps SVG className live through SVGAnimatedString", () => {
  // Given SVG and HTML elements with different className interfaces.
  const { window } = new JSDOM('<div class="plain"><svg class=" a  b "></svg></div>');
  try {
    const svg = window.document.querySelector("svg");
    if (!(svg instanceof window.SVGElement)) throw new Error("Expected SVG");
    const classes = svg.className;
    expect(classes).toBeInstanceOf(window.SVGAnimatedString);
    expect(classes.baseVal).toBe(" a  b ");

    // When the animated string is written and the token list is then changed.
    classes.baseVal = "first";
    svg.classList.add("second");

    // Then the same wrapper reflects both operations.
    expect(svg.className).toBe(classes);
    expect(classes.animVal).toBe("first second");
    expect(window.document.querySelector("div")?.className).toBe("plain");
    svg.removeAttribute("class");
    expect(classes.baseVal).toBe("");
  } finally {
    window.close();
  }
});

it("keeps SVG aspect ratio values live and rejects unknown enum values", () => {
  // Given an SVG root and a symbol with different aspect-ratio attributes.
  const { window } = new JSDOM('<svg><symbol preserveAspectRatio="xMinYMax slice"/></svg>');
  try {
    const root = window.document.querySelector("svg");
    const symbol = window.document.querySelector("symbol");
    if (!(root instanceof window.SVGSVGElement) || !(symbol instanceof window.SVGSymbolElement))
      throw new Error("Expected SVG elements with viewport settings");
    const { SVGPreserveAspectRatio: Ratio } = window;
    expect(Object.getOwnPropertyDescriptor(window, "SVGPreserveAspectRatio")).toEqual({
      value: Ratio,
      writable: true,
      configurable: true,
      enumerable: false,
    });
    const ratio = root.preserveAspectRatio;
    const { baseVal, animVal } = ratio;
    expect(baseVal.align).toBe(Ratio.SVG_PRESERVEASPECTRATIO_XMIDYMID);
    expect(symbol.preserveAspectRatio.baseVal.align).toBe(Ratio.SVG_PRESERVEASPECTRATIO_XMINYMAX);

    // When a retained object updates one part of the reflected value.
    baseVal.meetOrSlice = Ratio.SVG_MEETORSLICE_SLICE;
    expect(root.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
    expect(() => (baseVal.align = 0)).toThrow("Invalid alignment");

    // Then direct attribute updates are visible through both retained wrappers.
    root.setAttribute("preserveAspectRatio", "none");
    expect(root.preserveAspectRatio).toBe(ratio);
    expect(ratio.baseVal).toBe(baseVal);
    expect(ratio.animVal).toBe(animVal);
    expect(animVal.align).toBe(Ratio.SVG_PRESERVEASPECTRATIO_NONE);
    expect(baseVal.meetOrSlice).toBe(Ratio.SVG_MEETORSLICE_MEET);
  } finally {
    window.close();
  }
});

it("reflects SVG conditional-processing attributes through indexed string lists", () => {
  // Given comma-delimited languages and whitespace-delimited extensions.
  const { window } = new JSDOM(
    '<svg><g systemLanguage="en, fr" requiredExtensions="one two"/></svg>',
  );
  try {
    const group = window.document.querySelector("g");
    if (!(group instanceof window.SVGGElement)) throw new Error("Expected an SVG group");
    const languages = group.systemLanguage;
    const extensions = group.requiredExtensions;
    expect(languages).toBeInstanceOf(window.SVGStringList);
    expect(languages.numberOfItems).toBe(2);
    expect(languages[0]).toBe("en");

    // When callers edit the lists using methods, indices, and the content attribute.
    expect(languages.insertItemBefore("es", 99)).toBe("es");
    languages[1] = "de";
    expect(group.getAttribute("systemLanguage")).toBe("en, de, es");
    expect(extensions.removeItem(0)).toBe("one");
    expect(group.getAttribute("requiredExtensions")).toBe("two");
    group.setAttribute("systemLanguage", "ja, ko");

    // Then the retained list updates and invalid reads still raise IndexSizeError.
    expect(group.systemLanguage).toBe(languages);
    expect(languages.getItem(0)).toBe("ja");
    expect(Object.keys(languages)).toEqual(["0", "1"]);
    expect(() => languages.getItem(2)).toThrow("maximum bound (2)");
    expect(Reflect.defineProperty(languages, "0", { get: () => "ignored" })).toBe(false);
    expect(() =>
      Reflect.defineProperty(languages, "0", { value: "zh", configurable: false }),
    ).toThrow("non-configurable property");
    expect(group.getAttribute("systemLanguage")).toBe("zh, ko");
    expect(Reflect.defineProperty(languages, "0", { enumerable: true })).toBe(true);
    expect(languages[0]).toBe("undefined");
  } finally {
    window.close();
  }
});

it("preserves SVG legacy redraw calls and validates their receivers and arguments", () => {
  // Given a parsed SVG root and an ordinary element.
  const { window } = new JSDOM("<svg></svg><div></div>");
  try {
    const svg = window.document.querySelector("svg");
    if (!(svg instanceof window.SVGSVGElement)) throw new Error("Expected an SVG root");
    // When the legacy redraw methods are called.
    const handle = svg.suspendRedraw(50);
    expect(handle).toBe(1);
    expect(svg.unsuspendRedraw(handle)).toBeUndefined();
    expect(svg.unsuspendRedrawAll()).toBeUndefined();
    expect(svg.forceRedraw()).toBeUndefined();

    // Then invalid calls still fail at the interface boundary.
    expect(() => Reflect.apply(svg.suspendRedraw, svg, [])).toThrow("1 argument required");
    expect(() => Reflect.apply(svg.unsuspendRedraw, svg, [1n])).toThrow("BigInt");
    expect(() => Reflect.apply(svg.forceRedraw, window.document.querySelector("div"), [])).toThrow(
      "Expected an SVGSVGElement",
    );
  } finally {
    window.close();
  }
});

it.each([undefined, "outside-only"] as const)(
  "exposes SVG constructors as writable non-enumerable Window properties (%s)",
  (runScripts) => {
    // Given a Window with or without its own script realm.
    const { window } = new JSDOM("", runScripts ? { runScripts } : {});
    try {
      // Then supported SVG constructors use Web IDL interface-object descriptors.
      for (const name of [
        "SVGElement",
        "SVGGraphicsElement",
        "SVGSVGElement",
        "SVGGElement",
        "SVGDefsElement",
        "SVGDescElement",
        "SVGMetadataElement",
        "SVGTitleElement",
        "SVGSymbolElement",
        "SVGSwitchElement",
        "SVGNumber",
        "SVGRect",
        "SVGAnimatedRect",
        "SVGAnimatedString",
        "SVGStringList",
        "SVGPreserveAspectRatio",
        "SVGAnimatedPreserveAspectRatio",
      ] as const) {
        expect(typeof window[name]).toBe("function");
        expect(Object.getOwnPropertyDescriptor(window, name)).toEqual({
          value: window[name],
          writable: true,
          configurable: true,
          enumerable: false,
        });
      }
    } finally {
      window.close();
    }
  },
);
