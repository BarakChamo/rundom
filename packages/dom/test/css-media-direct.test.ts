// Checks that media queries served without the reference engine equal the pinned grammar's serialization and default-device match.
import { describe, expect, it } from "vitest";
import { defaultMediaQuery, directMediaQuery, referenceMediaQuery } from "../src/css-reference.js";

const features = ["width", "height", "min-width", "max-width", "min-height", "max-height"];
const values = [
  "0",
  "1",
  "1.5",
  "1.50",
  "599.95",
  "767",
  "768",
  "768.0",
  "769",
  "1023.98",
  "1024",
  "1025",
  "999999",
];
const spacing = [
  (f: string, v: string) => `(${f}:${v}px)`,
  (f: string, v: string) => `( ${f} :  ${v}px )`,
];
const prefixes = ["", "screen and ", "only screen and ", "all and ", "  screen   and  "];

const admitted = [
  ...features.flatMap((feature) =>
    values.flatMap((value) => spacing.map((write) => write(feature, value))),
  ),
  ...prefixes.flatMap((prefix) => [
    `${prefix}(min-width:600px)`,
    `${prefix}(min-width:600px) and (max-width:1199.95px)`,
    `${prefix}(min-height: 100px) and (max-width: 2000px) and (width: 1024px) `,
  ]),
];

const deferred = [
  "(MIN-WIDTH:1PX)",
  "(min-width:.5px)",
  "(min-width:-1px)",
  "(min-width:1e3px)",
  "(min-width:1em)",
  "(min-width:1px)/**/",
  "print and (min-width:1px)",
  "only all and (min-width:1px)",
  "(min-width:1px) or (max-width:2px)",
  "not screen and (min-width:1px)",
  "(prefers-color-scheme: dark)",
  "(orientation: landscape)",
  "(400px <= width <= 700px)",
];

describe("defaultMediaQuery", () => {
  it("serializes and matches px width/height ranges exactly as the pinned grammar does", () => {
    // Given: every admitted shape of range query responsive CSS-in-JS emits
    for (const query of admitted) {
      // When: the query is read directly and through the reference grammar
      const direct = directMediaQuery(query);
      // Then: the direct path admitted it and produced the reference result
      expect(direct, query).toBeDefined();
      expect(direct, query).toEqual(referenceMediaQuery(query));
    }
  });

  it("leaves every other query to the reference grammar", () => {
    // Given: queries outside the direct shape (case, units, types, operators, other features)
    for (const query of deferred) {
      // When: the query is read
      // Then: the direct path declines and the default parse is the reference parse
      expect(directMediaQuery(query), query).toBeUndefined();
      expect(defaultMediaQuery(query), query).toEqual(referenceMediaQuery(query));
    }
  });
});
