// Checks that selector lists serialized without the reference engine equal the pinned grammar's serialization.
import { describe, expect, it } from "vitest";
import { canonicalSelectorList, referenceSelectorList } from "../src/css-reference.js";
import { canonicalDirectSelector } from "../src/selector-parser.js";

const pseudoClasses = [
  "hover",
  "HOVER",
  "active",
  "focus",
  "focus-visible",
  "focus-within",
  "scope",
  "autofill",
  "user-valid",
  "user-invalid",
  "fullscreen",
  "modal",
  "open",
  "popover-open",
  "first-child",
  "last-child",
  "only-child",
  "first-of-type",
  "last-of-type",
  "only-of-type",
  "empty",
  "root",
  "checked",
  "enabled",
  "disabled",
  "link",
  "any-link",
  "visited",
  "required",
  "optional",
  "read-write",
  "read-only",
  "defined",
  "target",
  "placeholder-shown",
  "in-range",
  "out-of-range",
  "indeterminate",
  "default",
  "valid",
  "invalid",
  "closed",
  "host",
  "-webkit-autofill",
  "foo",
];
const pseudoElements = [
  "before",
  "after",
  "first-line",
  "first-letter",
  "placeholder",
  "marker",
  "backdrop",
  "selection",
  "file-selector-button",
  "BEFORE",
  "cue",
  "-webkit-scrollbar",
  "hover",
];
const nths = [
  "odd",
  "EVEN",
  "2n+1",
  "2N-1",
  "-n+3",
  "+n",
  "n",
  "-n",
  "1n",
  "-1n+0",
  "0n+0",
  "-0n-0",
  "0n-5",
  "+5",
  "-5",
  "0",
  "-0",
  "10n+999",
  "2n + 1",
  "2n of .a",
];
const compounds = [
  "a",
  "Div",
  "*",
  "*.a",
  ".css-1x2y3z",
  "#Id",
  ".-a",
  "._b",
  "div#x.y.z",
  "[x]",
  "[DATA-x]",
  "[x=y]",
  "[x = 'y' i]",
  '[X="y" S]',
  "[x|=y]",
  "[x~=y]",
  "[x^='a\"b']",
  '[x$=""]',
  "[x*=y I]",
  "[x='a\tb']",
  "a[x=y][z]",
];

/** Builds a corpus of selectors inside and around the direct grammar. */
function corpus(): string[] {
  const out = new Set<string>(compounds);
  for (const name of pseudoClasses) {
    out.add(`.a:${name}`);
    out.add(`*:${name}`);
    out.add(`:not(:${name})`);
  }
  for (const name of pseudoElements) {
    out.add(`.a::${name}`);
    out.add(`.a:${name}`);
    out.add(`.a:hover::${name}`);
    out.add(`*::${name}`);
    out.add(`.a::${name} .b`);
    out.add(`.a::${name}:hover`);
    out.add(`.a::${name}.b`);
    out.add(`:is(::${name})`);
    out.add(`:not(.a:${name})`);
    out.add(`::${name}, a`);
  }
  for (const nth of nths)
    for (const name of ["nth-child", "nth-last-child", "nth-of-type", "NTH-last-of-type"])
      out.add(`li:${name}(${nth})`);
  const combinators = [" ", ">", " > ", "+", " ~ ", "\n>\t", "  "];
  for (const left of compounds.slice(0, 8))
    for (const right of compounds.slice(5, 14))
      for (const combinator of combinators) out.add(`${left}${combinator}${right}`);
  for (const list of ["not", "is", "where", "Not", "IS"]) {
    out.add(`:${list}(.a,.b)`);
    out.add(`:${list}( .a > b )`);
    out.add(`a:${list}(:hover)`);
    out.add(`:${list}(*)`);
    out.add(`:${list}(:${list}(.a))`);
  }
  for (const text of [
    ".a , .b",
    ".a,.b,.c:hover",
    ".a .b:focus-visible",
    ".css-1x2y3z:hover",
    ".css-1x2y3z.Mui-focused .css-abc",
    ".MuiButton-root:hover:not(.Mui-disabled)",
    ".a:hover>.b::after",
    "a:before",
    "a:FIRST-LINE",
    ".a::before,.a::after",
    "a::before:hover",
    "a:hover::before",
    ".a\\:b",
    "a|b",
    "*|*",
    "a /* c */ b",
    ".a:has(.b)",
    ":host(.a)",
    ":lang(en)",
    ".a:",
    ".a::",
    ".a,",
    ",.a",
    "",
    " ",
  ])
    out.add(text);
  return [...out];
}

describe("canonicalDirectSelector", () => {
  it("serializes every accepted selector list exactly as the pinned reference grammar does", () => {
    // Given: a corpus of selectors inside and around the direct grammar
    let accepted = 0;
    for (const text of corpus()) {
      // When: the list is serialized directly and through the reference grammar
      const direct = canonicalDirectSelector(text);
      if (direct === undefined) continue;
      accepted++;
      // Then: an accepted list is valid in the reference grammar and serializes identically
      expect(direct, text).toBe(referenceSelectorList(text));
    }
    expect(accepted).toBeGreaterThan(400);
  });

  it("accepts the selector shapes CSS-in-JS libraries emit", () => {
    // Given: selectors Emotion and Material UI emit
    for (const text of [
      ".css-1x2y3z:hover",
      ".MuiButton-root:hover:not(.Mui-disabled)",
      ".a::before,.a::after",
      ".a:focus-visible",
      ".a::placeholder",
    ])
      // When: the list is serialized
      // Then: the direct path admits it without the reference grammar
      expect(canonicalDirectSelector(text), text).toBe(referenceSelectorList(text));
  });

  it("leaves namespaced lists to the reference grammar", () => {
    // Given: a list read under a default namespace declaration
    const namespaces = new Map([["", "http://www.w3.org/1999/xhtml"]]);
    // When: the list is canonicalized
    // Then: the result is the reference serialization under those namespaces
    expect(canonicalSelectorList("*.a:hover", namespaces)).toBe(
      referenceSelectorList("*.a:hover", namespaces),
    );
  });
});
