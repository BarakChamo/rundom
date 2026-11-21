// Qualifies explicit Rust parsing through the public facade and records complete-parser fallbacks.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import type { JSDOM } from "@run-dom/jsdom";
const { JSDOM: ReferenceJSDOM }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

const cases = [
  "<!doctype html><p>Hello &amp; goodbye</p>",
  "<table>before<tr><td>cell</table>after",
  "<b><i>one</b>two</i>three",
  "<template><table><tr><td>inside</table><template>nested</template></template>",
  '<svg viewBox="0 0 1 1"><use xlink:href="#x"/><foreignObject><p>html</p></foreignObject></svg>',
  '<math><annotation-xml encoding="text/html"><div>html</div></annotation-xml></math>',
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><p>limited',
  '<!doctype html SYSTEM "about:legacy-compat"><!--comment--><p title="a &quot; &lt; &gt;">\u{1f600}</p>',
  '<html a="one"><html b="two"><body c="three"><body d="four">text',
  '<textarea>\n&amp;<b></textarea><pre>\nline</pre><script>"<p>"</script>',
  "<noscript><p>parsed</p></noscript><select><option>one<option>two</select>",
  "<p>one\0two</p><table>\n \t<tr><td>three</table>",
  "<table><b>bold<tr><td><i>italic</table>outside",
  "<svg><title>text</title><desc><div>html</div></desc></svg>",
  '<form id="f"><table><input id="input"></table></form>',
  "<p>unpaired \ud800 retained</p>",
];

it("matches public serialization and document mode with counted native execution and fallback", () => {
  // Given: the child selects Rust before loading the facade, independently of this test worker.
  const require = createRequire(import.meta.url);
  const child = execFileSync(
    process.execPath,
    [
      "--input-type=commonjs",
      "-e",
      `
    const fs=require('node:fs');
    const {JSDOM}=require(${JSON.stringify(require.resolve("@run-dom/jsdom"))});
    const {getParserStatistics}=require('@run-dom/html-parser');
    const cases=JSON.parse(fs.readFileSync(0,'utf8'));
    const results=cases.map(markup=>{const dom=new JSDOM(markup);try{return {html:dom.serialize(),mode:dom.window.document.compatMode};}finally{dom.window.close();}});
    const located=new JSDOM('<p>located</p>',{includeNodeLocations:true});
    const location=located.nodeLocation(located.window.document.querySelector('p'));located.window.close();
    process.stdout.write(JSON.stringify({results,statistics:getParserStatistics(),location}));
  `,
    ],
    {
      input: JSON.stringify(cases),
      encoding: "utf8",
      env: { ...process.env, RUN_DOM_HTML_PARSER: "rust" },
    },
  );
  const expected = cases.map((markup) => {
    const dom = new ReferenceJSDOM(markup);
    try {
      return { html: dom.serialize(), mode: dom.window.document.compatMode };
    } finally {
      dom.window.close();
    }
  });
  // The subprocess result is a test-owned fixture; compare its entire JSON shape.
  expect(JSON.parse(child)).toEqual({
    results: expected,
    statistics: {
      nativeCalls: 14,
      fallbacks: { form_association: 1, utf16_surrogate: 1, source_locations: 1 },
    },
    location: {
      startLine: 1,
      startCol: 1,
      startOffset: 0,
      endLine: 1,
      endCol: 15,
      endOffset: 14,
      startTag: { startLine: 1, startCol: 1, startOffset: 0, endLine: 1, endCol: 4, endOffset: 3 },
      endTag: {
        startLine: 1,
        startCol: 11,
        startOffset: 10,
        endLine: 1,
        endCol: 15,
        endOffset: 14,
      },
    },
  });
});
