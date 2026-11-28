// Pins inline cssText serialization of shorthand-free blocks against jsdom 31.0.1 output.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

function cssTextAfter(writes: readonly (readonly [string, string])[]): string {
  const { window } = new JSDOM("<!doctype html><p></p>");
  try {
    const style = window.document.querySelector("p")!.style;
    for (const [name, value] of writes) style.setProperty(name, value);
    return style.cssText;
  } finally {
    window.close();
  }
}

describe("CSSStyleDeclaration.cssText on inline styles", () => {
  it("should keep a declaration-like string value as written", () => {
    // Given: a string value that looks like a grid declaration
    // When: the block is serialized
    const text = cssTextAfter([
      ["opacity", "0.5"],
      ["content", '"a; grid-template-rows: 1px"'],
    ]);
    // Then: the string is not mistaken for a declaration
    expect(text).toBe('opacity: 0.5; content: "a; grid-template-rows: 1px";');
  });

  it("should combine grid template longhands after a plain declaration", () => {
    // Given: every grid-template longhand after an opacity declaration
    // When: the block is serialized
    const text = cssTextAfter([
      ["opacity", "0.5"],
      ["grid-template-rows", "1px 2px"],
      ["grid-template-columns", "1fr"],
      ["grid-template-areas", "none"],
    ]);
    // Then: jsdom's block serializer writes the shorthand
    expect(text).toBe("opacity: 0.5; grid-template: 1px 2px / 1fr;");
  });

  it("should combine column rule longhands into their shorthand", () => {
    // Given: every column-rule longhand
    // When: the block is serialized
    const text = cssTextAfter([
      ["column-rule-width", "2px"],
      ["column-rule-style", "solid"],
      ["column-rule-color", "red"],
    ]);
    // Then: the shorthand replaces them
    expect(text).toBe("column-rule: 2px solid red;");
  });
});
