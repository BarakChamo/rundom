// Preserves argument conversion and Web IDL property boundaries when cached reads skip redundant preparation.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name cached view access", ({ Constructor }) => {
  it("observes selector conversion mutations and rejects malformed selectors after warm hits", () => {
    // Given: both query shapes have valid cached results.
    const w = new Constructor('<p class="item" id="old"></p>').window;
    try {
      const document = w.document;
      const body = document.body;
      if (!body) throw new Error("Expected a query-conversion fixture body");
      expect(document.querySelector(".item")?.id).toBe("old");
      expect(document.querySelectorAll(".item").item(0)?.id).toBe("old");
      let conversions = 0;
      const selector = {
        toString() {
          conversions++;
          body.innerHTML = '<span class="item" id="new"></span>';
          return ".item";
        },
      };
      // When: conversion itself invalidates the tree before the cache can answer.
      expect(Reflect.apply(document.querySelector, document, [selector])?.id).toBe("new");
      expect(conversions).toBe(1);
      expect(document.querySelectorAll(".item").item(0)?.id).toBe("new");
      // Then: warmed hits never suppress conversion failures or selector validation.
      const malformed = {
        toString() {
          conversions++;
          return "[";
        },
      };
      for (const method of [document.querySelector, document.querySelectorAll]) {
        expect(() => Reflect.apply(method, document, [malformed])).toThrow(
          /selector|Identifier is expected/i,
        );
        expect(() =>
          Reflect.apply(method, document, [
            {
              toString() {
                throw new Error("selector conversion failed");
              },
            },
          ]),
        ).toThrow("selector conversion failed");
      }
      expect(conversions).toBe(3);
    } finally {
      w.close();
    }
  });

  it("distinguishes canonical indices from numeric-looking expandos on collection and CSS views", () => {
    // Given: a fresh collection, cached snapshot and computed declaration.
    const w = new Constructor('<p class="item" style="color:red"></p>').window;
    try {
      const first = w.document.querySelectorAll(".item"),
        second = w.document.querySelectorAll(".item"),
        node = first.item(0);
      if (!node) throw new Error("Expected an indexed-view fixture");
      for (const view of [first, second, w.getComputedStyle(node)]) {
        // When/Then: unsigned canonical indices reject writes, including unsupported large indices.
        for (const key of ["0", "9", "10", "123456789", "4294967294"]) {
          expect(Reflect.set(view, key, "changed")).toBe(false);
          expect(Reflect.defineProperty(view, key, { value: "changed", configurable: true })).toBe(
            false,
          );
        }
        for (const key of [
          "",
          "00",
          "01",
          "-0",
          "+1",
          "1.0",
          "1e2",
          " 1",
          "1 ",
          "١",
          "4294967295",
          "10000000000",
          "Infinity",
          Symbol("index"),
        ]) {
          expect(Reflect.set(view, key, "expando")).toBe(true);
          expect(Reflect.get(view, key)).toBe("expando");
          expect(Reflect.deleteProperty(view, key)).toBe(true);
        }
      }
      expect(first.item(0)).toBe(node);
      expect(second.item(0)).toBe(node);
    } finally {
      w.close();
    }
  });
});
