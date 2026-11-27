// Pins computed box-shadow serialization for the none keyword across declaration sources.
import { describe, expect, it } from "vitest";
import { JSDOM } from "../src/jsdom.js";

function computed(markup: string, id: string) {
  const { window } = new JSDOM(`<!doctype html>${markup}`);
  const element = window.document.getElementById(id);
  if (!element) throw new Error(`The fixture must have #${id}`);
  return window.getComputedStyle(element);
}

describe("CSSStyleDeclaration computed box-shadow", () => {
  for (const [source, markup, id] of [
    ["an inline declaration", '<div id=t style="color:green;box-shadow:none"></div>', "t"],
    [
      "an uppercase important declaration",
      '<div id=t style="box-shadow:NONE !important"></div>',
      "t",
    ],
    ["a stylesheet rule", "<style>#t{box-shadow:none}</style><div id=t></div>", "t"],
    [
      "inheritance",
      "<style>#p{box-shadow:none}#t{box-shadow:inherit}</style><div id=p><i id=t></i></div>",
      "t",
    ],
    ["a custom property", "<style>#t{--s:none;box-shadow:var(--s)}</style><div id=t></div>", "t"],
  ] as const) {
    it(`should serialize none from ${source} as none`, () => {
      // Given: box-shadow none reaches the element through the named source
      const style = computed(markup, id);
      // When: the shorthand and its color longhand are read
      // Then: they keep jsdom's literal values
      expect(style.getPropertyValue("box-shadow")).toBe("none");
      expect(Reflect.get(style, "boxShadow")).toBe("none");
      expect(style.getPropertyValue("box-shadow-color")).toBe("transparent");
    });
  }

  it("should keep initial and real shadows unchanged", () => {
    // Given: an initial keyword, an undeclared element and real shadows
    const markup =
      '<div id=i style="box-shadow:initial"></div><div id=n></div><div id=s style="box-shadow:1px 2px transparent"></div>';
    // When/Then: initial values and resolved shadow colors follow jsdom
    expect(Reflect.get(computed(markup, "i"), "boxShadow")).toBe("currentcolor none");
    expect(computed(markup, "n").getPropertyValue("box-shadow")).toBe("currentcolor none");
    expect(Reflect.get(computed(markup, "s"), "boxShadow")).toBe("rgba(0, 0, 0, 0) 1px 2px");
  });
});
