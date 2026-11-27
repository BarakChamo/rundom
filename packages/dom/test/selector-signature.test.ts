// Checks that signature rejection never changes which elements a compiled selector matches.
import {
  defaultTreeAdapter as tree,
  html,
  parse,
  type DefaultTreeAdapterTypes as Raw,
} from "parse5";
import { describe, expect, it } from "vitest";
import { compileSelector } from "../src/selectors.js";
import { parseDirectSelector } from "../src/selector-parser.js";
import {
  forgetSelectorSignature,
  setSelectorSignatureFiltering,
  withSignatureFilter,
} from "../src/selector-signature.js";
import { setRawElementPrefix } from "../src/xml.js";

// Deterministic generator so a failure reproduces from its seed.
function random(seed: number): (limit: number) => number {
  let state = seed >>> 0 || 1;
  return (limit) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % limit;
  };
}

const tags = ["div", "DIV", "span", "Span", "input", "button", "svg", "a", "li", "x-item"];
const names = ["id", "ID", "class", "Class", "type", "role", "data-x", "Data-X", "href", "lang"];
const words = ["a", "A", "b", "foo", "Foo", "button", "submit", "tab", "x-y", ""];

function pick<T>(next: (limit: number) => number, values: readonly T[]): T {
  return values[next(values.length)] as T;
}

function element(next: (limit: number) => number, namespace: string): Raw.Element {
  const attrs: Raw.Element["attrs"] = [];
  const used = new Set<string>();
  for (let count = next(4); count > 0; count--) {
    const name = pick(next, names);
    if (used.has(name)) continue;
    used.add(name);
    const value =
      name.toLowerCase() === "class"
        ? Array.from({ length: next(4) }, () => pick(next, words)).join(
            pick(next, [" ", "\t", "  "]),
          )
        : pick(next, words);
    attrs.push({ name, value });
  }
  // Namespaced attributes with selector-like local names must not satisfy plain selectors.
  if (next(6) === 0)
    attrs.push({ name: pick(next, names), value: pick(next, words), namespace: "urn:x" });
  const tag = pick(next, tags);
  const node = tree.createElement(next(8) === 0 ? `p:${tag}` : tag, namespace as html.NS, attrs);
  if (node.tagName.startsWith("p:")) setRawElementPrefix(node, "p");
  return node;
}

function document(seed: number, isXML: boolean): Raw.Element[] {
  const next = random(seed);
  const root = parse("<!doctype html><html><body></body></html>");
  const body = (root.childNodes[1] as Raw.Element).childNodes[1] as Raw.Element;
  const elements: Raw.Element[] = [];
  const parents: Raw.Element[] = [body];
  // A bounded number of nodes keeps each generated document small.
  for (let index = 0; index < 24; index++) {
    const namespace =
      isXML || next(5) === 0 ? pick(next, [html.NS.SVG, "urn:y", html.NS.HTML]) : html.NS.HTML;
    const node = element(next, namespace);
    tree.appendChild(pick(next, parents), node);
    parents.push(node);
    elements.push(node);
  }
  return elements;
}

function compound(next: (limit: number) => number, depth: number): string {
  let text = next(3) === 0 ? "" : next(5) === 0 ? "*" : pick(next, tags);
  for (let count = next(3) + (text ? 0 : 1); count > 0; count--) {
    const word = pick(next, words.filter(Boolean));
    switch (next(depth > 1 ? 4 : 7)) {
      case 0:
        text += `#${word}`;
        break;
      case 1:
        text += `.${word}`;
        break;
      case 2: {
        const operator = pick(next, ["", "=", "~=", "|=", "^=", "$=", "*="]);
        const flag = operator ? pick(next, ["", " i", " s", " I"]) : "";
        text += operator
          ? `[${pick(next, names)}${operator}"${word}"${flag}]`
          : `[${pick(next, names)}]`;
        break;
      }
      case 3:
        text += pick(next, [
          ":first-child",
          ":last-child",
          ":empty",
          ":nth-child(2n+1)",
          ":only-of-type",
        ]);
        break;
      case 4:
      case 5:
        text += `:${pick(next, ["not", "is", "where"])}(${list(next, depth + 1)})`;
        break;
      default:
        text += `.${word}`;
    }
  }
  return text;
}

function list(next: (limit: number) => number, depth: number): string {
  return Array.from({ length: 1 + next(depth ? 2 : 3) }, () => {
    let text = compound(next, depth);
    for (let count = next(3); count > 0; count--)
      text += `${pick(next, [" ", " > ", " + ", " ~ "])}${compound(next, depth)}`;
    return text;
  }).join(", ");
}

function compile(selector: string, isXML: boolean, filtering: boolean) {
  setSelectorSignatureFiltering(filtering);
  try {
    return compileSelector({ selector, isXML, statePseudos: {} });
  } finally {
    setSelectorSignatureFiltering(true);
  }
}

describe("selector signature filtering", () => {
  it("should match exactly the same elements as unfiltered selectors", () => {
    // Given: random small HTML and XML trees with mixed-case, prefixed and namespaced names
    let compared = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const isXML = seed % 3 === 0;
      const elements = document(seed, isXML);
      const next = random(seed * 7919);
      for (let attempt = 0; attempt < 12; attempt++) {
        const selector = list(next, 0);
        if (!parseDirectSelector(selector)) continue;
        // When: the same selector compiles with and without signature rejection
        const filtered = compile(selector, isXML, true);
        const plain = compile(selector, isXML, false);
        // Then: matches, querySelectorAll-style filtering and closest agree on every element
        const label = `${seed}: ${selector}`;
        expect(elements.map(filtered), label).toEqual(elements.map(plain));
        for (const node of elements) {
          let a: Raw.Node | null = node;
          while (a && tree.isElementNode(a) && !filtered(a)) a = a.parentNode;
          let b: Raw.Node | null = node;
          while (b && tree.isElementNode(b) && !plain(b)) b = b.parentNode;
          expect(a, label).toBe(b);
        }
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(2000);
  }, 60_000);

  it("should observe attribute changes once the element signature is forgotten", () => {
    // Given: a filtered compound selector that rejects an element without the class
    const [node] = document(5, false);
    if (!node) throw new Error("fixture has no elements");
    node.attrs = [{ name: "class", value: "other" }];
    const matches = compile("*[class].wanted, [role=tab]", false, true);
    expect(matches(node)).toBe(false);
    // When: the class value changes in place and the owner forgets the signature
    const [attr] = node.attrs;
    if (attr) attr.value = "x wanted";
    forgetSelectorSignature(node);
    // Then: the next match sees the new token
    expect(matches(node)).toBe(true);
    // When: an attribute is added to a fresh attribute list without notification
    node.attrs = [{ name: "role", value: "tab" }];
    // Then: the changed list identity alone invalidates the signature
    expect(matches(node)).toBe(true);
  });

  it("should leave selectors outside the direct grammar unfiltered", () => {
    // Given: syntax whose matching depends on scopes, shadow trees, escapes or namespaces
    const unfiltered = [
      ":has(> a)",
      ":host",
      "::slotted(a)",
      "::part(x)",
      ".\\61",
      "svg|a",
      "*|a[b]",
      "a:not(:has(b))",
    ];
    for (const selector of unfiltered) {
      // When: a predicate is wrapped for that selector
      const predicate = () => true;
      // Then: the predicate is returned unchanged
      expect(withSignatureFilter(parseDirectSelector(selector), predicate), selector).toBe(
        predicate,
      );
    }
  });
});
