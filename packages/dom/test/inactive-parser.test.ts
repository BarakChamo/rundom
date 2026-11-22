// Checks complete document tokenization against the pinned parse5 tree, including text-node boundaries.
import assert from "node:assert/strict";
import { defaultTreeAdapter, parse, type ParserError } from "parse5";
import { describe, expect, it } from "vitest";
import { parseLiteralDocument } from "../src/inactive-parser.js";

const words = "abcdefghijklmnopqrstuvwxyz0123456789 " + "abcdefgh  ijklmnop\tqrstuvwx ".repeat(72);
const special = "abcde&amp;fghij&#13;klmno\r\npqrst\fuvwxyz\0\uD800!\uDC00🌲";
describe("inactive HTML literal runs", () => {
  for (const source of [
    `<table>\n${words}\r\n<tr><td>${special}</table>${words}`,
    `<body><p><b>${words}</p>${words}<frameset><frame></frameset>`,
    `<table>    <tr><td><pre>\n${words}</pre></td></tr>    ${words}</table><select><option>${words}</select>`,
    `<div title="${words}${special}" data-v='${special}${words}' foo=${special}></div>`,
    `<script>${words}<!-- <script> ${special} </script> --> </script><style>${words}${special}</style>`,
    `<script>${"longName && other\nvalue &amp;\r\n".repeat(64)}<!--<script>--></script><style>${words}&amp;\n</style>`,
    `<textarea>\n${"ordinary\nwords &amp;\r\n".repeat(64)}</textarea><pre>\n${words}</pre>`,
    `<textarea>\n${words}${special}</textarea><title>${words}</title>`,
    `<svg><foreignObject><template><p>${words}</template></foreignObject></svg><!--${special}--!>`,
    `<!doctype html><plaintext>${words}${special}</plaintext>`,
    `<p>${"abcdefghi".repeat(8000)} 🌲\r\n&amp;</p><!--${"abcdef".repeat(12000)}-<-->`,
    `<template><table><b>${words}<tr><td><nobr>${special}</template>`,
    `<form a="1" a='2'><table><p hidden data-id="42">x<tr><td><input form="f"></table>${words}`,
    `<svg viewBox="0 0 1 1"><path d="M0 0"/><foreignObject><p>${words}</svg>`,
    `<p data-x="ab&amp;cd" title='a>b'>${words}</p junk><section a="ok"b=2/>`,
    `<script type="text/plain"><p id="wrong"></script><textarea><input id="raw"></textarea>${words}`,
    `<main>${'<a hidden data-id="entry" title="ordinary text">x</a>'.repeat(1800)}<p title='last'>🌲</p></main>`,
  ]) {
    it(`preserves the complete tree for ${source.slice(0, 12)}`, () => {
      for (const scriptingEnabled of [false, true]) {
        const options = { scriptingEnabled };
        assert.deepStrictEqual(parseLiteralDocument(source, options), parse(source, options));
      }
    });
  }

  it("preserves the text insertion calls observed by a custom tree adapter", () => {
    const source = `<p>${words}</p>`;
    function insertions(parser: typeof parseLiteralDocument) {
      const chunks: string[] = [];
      parser(source, {
        treeAdapter: {
          ...defaultTreeAdapter,
          insertText(parent, text) {
            chunks.push(text);
            defaultTreeAdapter.insertText(parent, text);
          },
        },
      });
      return chunks;
    }
    expect(insertions(parseLiteralDocument)).toEqual(insertions(parse));
  });

  it("preserves parse errors and location offsets across CRLF and non-BMP input", () => {
    const source = `<p a="${words}🌲\r\n" a="duplicate">\0</p>`;
    const errors: ParserError[] = [];
    const referenceErrors: ParserError[] = [];
    const document = parseLiteralDocument(source, {
      sourceCodeLocationInfo: true,
      onParseError: (error) => errors.push(error),
    });
    const expected = parse(source, {
      sourceCodeLocationInfo: true,
      onParseError: (error) => referenceErrors.push(error),
    });
    assert.deepStrictEqual(document, expected);
    expect(errors).toEqual(referenceErrors);
    expect(errors.length).toBeGreaterThan(0);
  });
});
