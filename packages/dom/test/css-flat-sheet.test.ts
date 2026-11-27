// Checks that the flat stylesheet scanner admits CSS-in-JS output and reproduces the pinned parser's tree exactly.
import { generate, List, parse, type CssNode } from "css-tree";
import { describe, expect, it } from "vitest";
import { scanFlatStyleSheet } from "../src/css-flat-sheet.js";

function plain(value: unknown): unknown {
  if (value instanceof List) return value.toArray().map(plain);
  if (typeof value !== "object" || value === null) return value;
  const node = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(node)) if (key !== "loc") result[key] = plain(node[key]);
  // Unread declaration blocks expose their children through a getter.
  if (node.type === "Block") result.children = plain(node.children);
  return result;
}

function general(source: string): { tree: unknown; errors: string[] } {
  const errors: string[] = [];
  const tree = parse(source, {
    parseRulePrelude: false,
    parseAtrulePrelude: false,
    parseValue: false,
    onParseError: (error) => errors.push(error.message),
  });
  return { tree: plain(tree), errors };
}

const admitted = [
  ".css-1abc{display:flex;padding:6px 16px;}",
  ".css-x{color:rgba(0, 0, 0, 0.87);transition:opacity 225ms cubic-bezier(0.4, 0, 0.2, 1) 0ms}",
  '.css-t{font-family:"Roboto","Helvetica",sans-serif;font:12px/1.5 a}.css-u::before{content:\'\'}',
  ".css-x>:not(style)~:not(style){margin-top:8px}",
  "[class^=\"ant-\"] [class*=' ant-'],:where(.css-1x).ant-btn >span{box-sizing:border-box}",
  "@media (min-width:600px){.css-x{padding-left:24px}}.b{c:d}",
  ":root{--a:#1976d2;--spaced: 1px  2px ;--empty:;--i: x !important}",
  ".a{color:red!important;margin:0 ! important ;padding : 0 }",
  "\n  .a {\n    color: red;\n  }\r\n\f.b\t{\t}\n",
  '.é{font-family:"微软雅黑";content:"→";color:red }',
  ".a{}.b{ }",
];
const rejected = [
  '.a{content:"}"}',
  '.a{content:"semi;colon"}',
  "/* x */.a{color:red}",
  ".a{color:/*x*/red}",
  ".\\31 a{color:red}",
  ".a{color red}",
  ".a{;color:red}",
  ".a{color:red;;margin:0}",
  ".a{1x:2}",
  ".a{color:red",
  ".a{color:rgba(0,0,0}",
  ".a{width:calc(1px));color:red}",
  ".a{color:red}}",
  ".a{color:red} .b",
  "{color:red}",
  "@media (hover: none){.a{color:red}}",
  "@supports (display:grid){.a{display:grid}}",
  ".a{color:red;&:hover{color:blue}}",
  "& .a{color:red}",
  ".a{background:url(x.png)}",
  "-->.a{color:red}",
  "<!-- .a{color:red} -->",
  ".a{color:red !IMPORTANT}",
  ".a{color:red!important x}",
  ".a{*zoom:1}",
  ".a{--1:2}",
  '.a{content:"a\nb"}',
  ".a{color:red\u000b}",
  ".a!{color:red}",
];

describe("scanFlatStyleSheet", () => {
  for (const source of admitted) {
    it(`reproduces the pinned parser tree for ${JSON.stringify(source.slice(0, 40))}`, () => {
      // Given: flat stylesheet text that the general parser accepts without recovery
      const expected = general(source);
      // When: the scanner reads it
      const scanned = scanFlatStyleSheet(source, List);
      // Then: it admits the text and builds the same tree, and the general parser reported nothing
      expect(scanned).toBeDefined();
      expect(plain(scanned as CssNode)).toEqual(expected.tree);
      expect(expected.errors).toEqual([]);
    });
  }

  for (const source of rejected) {
    it(`leaves ${JSON.stringify(source.slice(0, 40))} to the general parser`, () => {
      // Given: text needing comments, escapes, recovery, nesting or richer at-rules
      // When: the scanner reads it
      // Then: it declines, so the caller falls back to the general parser
      expect(scanFlatStyleSheet(source, List)).toBeUndefined();
    });
  }
});

describe("pinned css-tree raw generation", () => {
  it("serializes backslash-free raw preludes as their own text", () => {
    // Given: raw rule preludes that style rule construction reads without regenerating
    const preludes = [
      ".a#b",
      ":not(.a)b",
      "a.5",
      ".css-x>:not(style)~:not(style)",
      "[class^=\"ant-\"] [class*=' ant-']",
      ".a , .b\n\t.c",
      "-->.a",
      ".é",
    ];
    // When: the pinned generator serializes each one
    // Then: the output is the raw text unchanged
    for (const value of preludes) expect(generate({ type: "Raw", value })).toBe(value);
  });
});
