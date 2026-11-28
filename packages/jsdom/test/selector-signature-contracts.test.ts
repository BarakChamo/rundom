// Pins that selector matching observes every attribute mutation path on an element that was matched just before.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

type TestDocument = JSDOM["window"]["document"];
type TestElement = ReturnType<TestDocument["createElement"]>;

// Lists and attribute compounds take the signature-filtered path; plain class selectors do not.
const classSelector = "div.on, [role=tab]";
const idSelector = "div#target[title]";
const attributeSelector = "div[title='v']";

function fixture(): { document: TestDocument; element: TestElement } {
  const { document } = new JSDOM(
    `<!doctype html><body><section><div title="w" class="off">x</div></section></body>`,
  ).window;
  const element = document.querySelector("div");
  if (!element) throw new Error("fixture has no div");
  // Parsed attribute lists can be shared until first written; own it so later writes are in place.
  element.setAttribute("data-owned", "");
  return { document, element };
}

function observed(document: TestDocument, element: TestElement, selector: string) {
  return {
    matches: element.matches(selector),
    closest: element.closest(selector) === element,
    query: [...document.querySelectorAll(selector)].includes(element),
  };
}

const yes = { matches: true, closest: true, query: true };
const no = { matches: false, closest: false, query: false };

describe("Element.matches after attribute mutation", () => {
  const cases: [string, string, (element: TestElement, document: TestDocument) => void, boolean][] =
    [
      ["classList.add", classSelector, (element) => element.classList.add("on"), true],
      ["className", classSelector, (element) => (element.className = "a on"), true],
      ["class setAttribute", classSelector, (element) => element.setAttribute("class", "on"), true],
      [
        "role setAttributeNS",
        classSelector,
        (element) => element.setAttributeNS(null, "role", "tab"),
        true,
      ],
      [
        "namespaced role",
        classSelector,
        (element) => element.setAttributeNS("urn:x", "role", "tab"),
        false,
      ],
      ["id setAttribute", idSelector, (element) => (element.id = "target"), true],
      ["attribute value", attributeSelector, (element) => element.setAttribute("title", "v"), true],
      [
        "Attr value",
        attributeSelector,
        (element) => {
          const attr = element.getAttributeNode("title");
          if (attr) attr.value = "v";
        },
        true,
      ],
      [
        "setAttributeNode",
        attributeSelector,
        (element, document) => {
          const attr = document.createAttribute("title");
          attr.value = "v";
          element.setAttributeNode(attr);
        },
        true,
      ],
    ];
  for (const [label, selector, mutate, expected] of cases) {
    it(`should observe ${label} after a non-matching read`, () => {
      // Given: an element that was just tested against the selector and did not match
      const { document, element } = fixture();
      expect(observed(document, element, selector)).toEqual(no);
      // When: the attribute changes through this path
      mutate(element, document);
      // Then: matches, closest and querySelectorAll all see the current attributes
      expect(observed(document, element, selector)).toEqual(expected ? yes : no);
    });
  }

  it("should stop matching after class and attribute removal", () => {
    // Given: an element that matches both filtered selectors
    const { document, element } = fixture();
    element.classList.add("on");
    element.setAttribute("title", "v");
    expect(observed(document, element, classSelector)).toEqual(yes);
    expect(observed(document, element, attributeSelector)).toEqual(yes);
    // When: the class token and attribute are removed
    element.classList.remove("on");
    element.removeAttribute("title");
    // Then: neither selector matches
    expect(observed(document, element, classSelector)).toEqual(no);
    expect(observed(document, element, attributeSelector)).toEqual(no);
    // When: the attribute is toggled back on with the required value
    element.toggleAttribute("title");
    element.setAttribute("title", "v");
    // Then: the attribute selector matches again
    expect(observed(document, element, attributeSelector)).toEqual(yes);
  });

  it("should observe an id replaced in place", () => {
    // Given: an element whose current id does not satisfy the selector
    const { document, element } = fixture();
    element.id = "first";
    expect(observed(document, element, idSelector)).toEqual(no);
    // When: the existing id attribute changes value
    element.id = "target";
    // Then: the selector matches the new id
    expect(observed(document, element, idSelector)).toEqual(yes);
  });

  it("should keep matching an element adopted into a quirks-mode document", () => {
    // Given: a matched element and a document parsed without a doctype
    const { document, element } = fixture();
    element.classList.add("on");
    expect(element.matches(classSelector)).toBe(true);
    const view = document.defaultView;
    if (!view) throw new Error("fixture has no Window");
    const quirks = new view.DOMParser().parseFromString("<p>q</p>", "text/html");
    expect(quirks.compatMode).toBe("BackCompat");
    // When: the element moves into the quirks-mode document and its class changes there
    quirks.body?.append(quirks.adoptNode(element));
    expect(observed(quirks, element, classSelector)).toEqual(yes);
    element.className = "off";
    // Then: matching follows the new owner and the changed attribute
    expect(observed(quirks, element, classSelector)).toEqual(no);
  });
});
