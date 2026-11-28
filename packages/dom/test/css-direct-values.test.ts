// Checks that declaration values served without the reference engine equal the pinned grammar's serialization and expansion.
import { describe, expect, it } from "vitest";
import {
  expandedDeclaration,
  referenceExpandedDeclaration,
  referenceShorthand,
  referenceSpecifiedDeclaration,
  specifiedDeclaration,
} from "../src/css-reference.js";
import { createRequire } from "node:module";
import {
  cssWideKeywords,
  directExpansion,
  directShorthand,
  directSpecifiedValue,
  genericFamilies,
} from "../src/css-direct-values.js";

const require = createRequire(import.meta.url);
const referenceProperties: Record<
  string,
  { value: string }
> = require("rundom-css-reference/lib/generated/css-property-definitions.js");
const referenceValues: Record<
  string,
  string
> = require("rundom-css-reference/lib/generated/css-value-definitions.js");
/** The alternatives of a reference grammar made only of `|`-separated keywords. */
const keywordsOf = (grammar: string) => grammar.split("|").map((word) => word.trim());
// The reference's own CSS-wide keywords: the complete value grammar of `all`.
const referenceWideKeywords = keywordsOf(referenceProperties.all!.value);
/** Every CSS-wide keyword in each position a direct path reads: alone, in a list, quoted, cased. */
function keywordPlacements(make: (keyword: string) => readonly string[]): string[] {
  return referenceWideKeywords.flatMap((keyword) => [
    ...make(keyword),
    ...make(keyword.toUpperCase()),
    ...make(keyword[0]!.toUpperCase() + keyword.slice(1)),
  ]);
}

const numbers = [
  "0",
  "1",
  "+1",
  "-1",
  "-0",
  "0.875",
  "1.10",
  "00.50",
  ".5",
  "-.5",
  "1e2",
  "1E2",
  "1e-3",
  "0.1234567",
  "0.0000001",
  "12345678",
  "0.01071",
  "-0.00833",
  "1.428571",
  "999999999",
];
const units = ["", "px", "PX", "em", "rem", "REM", "%", "vh", "vw", "pt", "ms", "s", "deg"];
const dimensionProperties = [
  "font-size",
  "letter-spacing",
  "line-height",
  "width",
  "height",
  "min-width",
  "min-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "max-width",
];
const families = [
  '"Roboto","Helvetica","Arial",sans-serif',
  "Roboto, Helvetica",
  "'Open Sans', SANS-SERIF",
  "Segoe UI, -apple-system",
  "system-ui,BlinkMacSystemFont",
  '"Roboto" , serif',
  "a  b",
  "a\tb",
  '"a  b"',
  '"sans-serif"',
  "'Serif'",
  '"default"',
  '"inherit"',
  '"inherit foo"',
  '"serif foo"',
  '"foo serif"',
  "'it\"s'",
  '"it\'s"',
  '"1a"',
  '"Font 1"',
  '"-a"',
  '"--a"',
  '"a\\"b"',
  "1a",
  "inherit",
  "default",
  "serif foo",
  "foo serif",
  "foo inherit",
  "Roboto,",
  ",Roboto",
  '""',
  '" a"',
  '"a "',
  "monospace, monospace",
  "ui-rounded",
  "math",
  "Menlo, Consolas, 'Liberation Mono', monospace",
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
  ...keywordPlacements((keyword) => [
    keyword,
    `"${keyword}"`,
    `'${keyword}'`,
    `FirstName, LastName, ${keyword}`,
    `${keyword}, serif`,
    `"${keyword}", serif`,
    `Foo ${keyword}`,
    `${keyword} Foo`,
  ]),
];
const radii = [
  "4px",
  "4px 8px",
  "1px 2px 3px",
  "1px 2px 3px 4px",
  "1px 2px 1px 2px",
  "1px 1px 1px 1px",
  "1px 2px 3px 2px",
  "50%",
  "0",
  "0 4px",
  "1px/2px",
  "0.25rem",
  "4PX",
  "-1px",
  "1px 2px 3px 4px 5px",
  " 4px ",
  "4px  8px",
  "inherit",
  "1e2px",
  "9999px",
  "4px 0 0 4px",
  ...keywordPlacements((keyword) => [keyword, `4px ${keyword}`, `${keyword} 4px`]),
];
const easings = [
  "",
  " ease",
  " linear",
  " ease-in",
  " ease-out",
  " ease-in-out",
  " EASE",
  " step-start",
  " cubic-bezier(0.4, 0, 0.2, 1)",
  " cubic-bezier(.4,0,.2,1)",
  " cubic-bezier(0.4, -2, 0.2, 3)",
  " cubic-bezier(1.4, 0, 0.2, 1)",
  " cubic-bezier(0.1234567, 0, 0.2, 1)",
];
const transitionLayers = [
  ...[
    "",
    "opacity ",
    "background-color ",
    "all ",
    "none ",
    "ease ",
    "Opacity ",
    "-webkit-x ",
  ].flatMap((property) =>
    ["", "250ms", "0.2s", ".3s", "0s", "0ms", "-1s", "1S"].flatMap((duration) =>
      easings.flatMap((easing) =>
        ["", " 0ms", " 0s", " 100ms", " -50ms"].map((delay) =>
          `${property}${duration}${duration ? easing : ""}${duration ? delay : ""}`.trim(),
        ),
      ),
    ),
  ),
  "250ms opacity",
  "opacity ease 1s",
  "opacity 1s 2s ease",
  "opacity 1s allow-discrete",
];
const transitions = [
  ...transitionLayers,
  "background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,border-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms",
  "opacity 1s, transform 2s ease-in",
  "opacity 1s,",
  "opacity 1s, none",
  ...keywordPlacements((keyword) => [
    keyword,
    `${keyword} 1s`,
    `opacity 1s, ${keyword}`,
    `${keyword} 1s, opacity 1s`,
    `opacity ${keyword}`,
  ]),
];

describe("direct tier keyword tables", () => {
  it("uses the reference engine's CSS-wide keywords and generic family names", () => {
    // Given: the reference grammar of `all` and of the complete and incomplete generic families
    const generics = [
      ...keywordsOf(referenceValues["<generic-font-complete>"]!),
      ...keywordsOf(referenceValues["<generic-font-incomplete>"]!),
    ];
    // When: the direct tier's tables are read
    // Then: they hold exactly the reference's names
    expect([...cssWideKeywords].toSorted()).toEqual(referenceWideKeywords.toSorted());
    expect([...genericFamilies].toSorted()).toEqual(generics.toSorted());
  });

  it("serializes CSS-wide keywords in every dimension position as the reference does", () => {
    // Given: each CSS-wide keyword as a whole value of each dimension property
    for (const name of dimensionProperties)
      for (const text of keywordPlacements((keyword) => [keyword]))
        // When: the value is served directly
        // Then: it declines or equals the reference
        for (const direct of [directSpecifiedValue(name, text)])
          if (direct !== undefined)
            expect(direct, `${name}: ${text}`).toBe(referenceSpecifiedDeclaration(name, text));
  });
});

describe("directSpecifiedValue", () => {
  it("serializes every accepted dimension exactly as the pinned reference grammar does", () => {
    // Given: each tier property with numbers of every shape and common units
    let accepted = 0;
    for (const name of dimensionProperties)
      for (const value of numbers)
        for (const unit of units) {
          const text = value + unit;
          // When: the value is serialized directly
          const direct = directSpecifiedValue(name, text);
          if (direct === undefined) continue;
          accepted++;
          // Then: the reference grammar accepts it with the same serialization
          expect(direct, `${name}: ${text}`).toBe(referenceSpecifiedDeclaration(name, text));
        }
    expect(accepted).toBeGreaterThan(800);
  });

  it("serializes every accepted font-family list exactly as the pinned reference grammar does", () => {
    // Given: family lists with quoted, unquoted, generic and reserved names
    let accepted = 0;
    for (const text of families) {
      // When: the list is serialized directly
      const direct = directSpecifiedValue("font-family", text);
      if (direct === undefined) continue;
      accepted++;
      // Then: the reference grammar accepts it with the same serialization
      expect(direct, text).toBe(referenceSpecifiedDeclaration("font-family", text));
    }
    expect(accepted).toBeGreaterThan(20);
  });

  it("answers specifiedDeclaration for the values CSS-in-JS sheets declare", () => {
    // Given: the declarations that used to load the reference engine on a first computed read
    for (const [name, value] of [
      ["font-size", "0.875rem"],
      ["letter-spacing", "0.01071em"],
      ["font-family", '"Roboto","Helvetica","Arial",sans-serif'],
    ] as const)
      // When: the specified value is requested
      // Then: the direct tier answers it, equal to the reference
      expect(directSpecifiedValue(name, value), name).toBe(
        referenceSpecifiedDeclaration(name, value),
      );
    expect(specifiedDeclaration("font-size", "0.875rem")).toBe("0.875rem");
  });
});

describe("directExpansion", () => {
  it("expands every accepted border-radius exactly as the pinned reference grammar does", () => {
    // Given: radius values of one to five components, units, signs and slashes
    let accepted = 0;
    for (const text of radii) {
      // When: the shorthand is expanded directly
      const direct = directExpansion("border-radius", text);
      if (!direct) continue;
      accepted++;
      // Then: text and longhand entries equal the reference expansion
      const reference = referenceExpandedDeclaration("border-radius", text);
      expect(direct, text).toEqual({ text: reference?.text, entries: reference?.entries });
    }
    expect(accepted).toBeGreaterThan(12);
  });

  it("expands every accepted transition exactly as the pinned reference grammar does", () => {
    // Given: transition layers combining names, durations, easings and delays, and lists of them
    let accepted = 0;
    for (const text of transitions) {
      // When: the shorthand is expanded directly
      const direct = directExpansion("transition", text);
      if (!direct) continue;
      accepted++;
      // Then: text and longhand entries equal the reference expansion
      const reference = referenceExpandedDeclaration("transition", text);
      expect(direct, text).toEqual({ text: reference?.text, entries: reference?.entries });
    }
    expect(accepted).toBeGreaterThan(500);
  });

  it("expands the shorthands CSS-in-JS sheets declare", () => {
    // Given: the shorthand declarations Material UI emits
    for (const [name, value] of [
      ["border-radius", "4px"],
      ["transition", "background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms"],
      ["transition", "background-color 250ms cubic-bezier(0.4,0,0.2,1) 0ms"],
      [
        "transition",
        "opacity 225ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, transform 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms",
      ],
    ] as const) {
      // When: the shorthand is expanded
      const reference = referenceExpandedDeclaration(name, value);
      // Then: the direct tier answers it, equal to the reference
      expect(directExpansion(name, value), value).toEqual({
        text: reference?.text,
        entries: reference?.entries,
      });
    }
  });

  it("gives expandedDeclaration callers one declaration name per entry and nothing pending", () => {
    // Given: a transition the direct tier expands
    const text = "opacity 1s ease-in 0ms";
    // When: expandedDeclaration answers it
    const expanded = expandedDeclaration("transition", text);
    // Then: declarations name the same longhands, in order, as the reference declarations
    expect(expanded?.declarations.map(({ name, pending }) => [name, pending])).toEqual(
      referenceExpandedDeclaration("transition", text)?.declarations.map(({ name, pending }) => [
        name,
        pending,
      ]),
    );
  });
});

describe("directShorthand", () => {
  it("serializes border-radius and transition from longhands exactly as the pinned reference grammar does", () => {
    // Given: longhand sets produced by expanding every corpus value, plus computed-style texts
    const sets: [string, Map<string, string>][] = [];
    for (const [name, values] of [
      ["border-radius", radii],
      ["transition", transitions],
    ] as const)
      for (const value of values) {
        const expanded = referenceExpandedDeclaration(name, value);
        if (expanded) sets.push([name, new Map(expanded.entries)]);
      }
    sets.push([
      "transition",
      new Map([
        ["transition-duration", "0.25s, 0.25s"],
        ["transition-timing-function", "cubic-bezier(0.4, 0, 0.2, 1), ease"],
        ["transition-delay", "0s, 0s"],
        ["transition-behavior", "normal, normal"],
        ["transition-property", "background-color, opacity"],
      ]),
    ]);
    sets.push([
      "transition",
      new Map([
        ["transition-duration", "0.25s, 0.25s"],
        ["transition-timing-function", "ease"],
        ["transition-delay", "0s, 0s"],
        ["transition-behavior", "normal, normal"],
        ["transition-property", "background-color, opacity"],
      ]),
    ]);
    let accepted = 0;
    for (const [name, texts] of sets) {
      // When: the shorthand is serialized directly
      const direct = directShorthand(name, (child) => texts.get(child) ?? "");
      if (direct === undefined) continue;
      accepted++;
      // Then: it equals the reference serialization, specified and computed
      const label = [...texts.values()].join(" | ");
      expect(direct, label).toBe(referenceShorthand(name, texts));
      expect(direct, label).toBe(referenceShorthand(name, texts, true));
    }
    expect(accepted).toBeGreaterThan(400);
  });
});
