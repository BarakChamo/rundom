// Proves bounded inactive Rust reuse never shares public documents and keeps native invocation accounting honest.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));
function runNative(source: string): string {
  return execFileSync(
    process.execPath,
    [
      "--input-type=commonjs",
      "-e",
      `
    const assert=require('node:assert/strict');
    const {JSDOM}=require(${JSON.stringify(entry)});
    const {getParserStatistics}=require('@run-dom/html-parser');
    ${source}
    process.stdout.write('verified');
  `,
    ],
    { encoding: "utf8", env: { ...process.env, RUN_DOM_HTML_PARSER: "rust" }, timeout: 30000 },
  );
}

describe("bounded inactive native document reuse", () => {
  it("materializes independent documents after repeated input, mutations and adoption", () => {
    // Given: repeated identical input admits one private checked arena after the second parse.
    // When: each new document is mutated, and a node is adopted across retained documents.
    // Then: public nodes remain independent and actual native calls stop at two, never five.
    expect(
      runNative(`
      const windows=[];
      try {
        for(let index=0;index<5;index++) {
          const w=new JSDOM('<main><p id="value" data-value="original">text</p></main>').window;
          const node=w.document.getElementById('value');
          assert.equal(node.textContent,'text');
          assert.equal(node.getAttribute('data-value'),'original');
          node.textContent=String(index);
          node.setAttribute('data-value',String(index));
          windows.push(w);
        }
        assert.equal(getParserStatistics().nativeCalls,2);
        const node=windows[0].document.getElementById('value');
        windows[1].document.adoptNode(node);
        assert.equal(node.ownerDocument,windows[1].document);
        windows[0].close();
        windows.forEach((w,index)=>{if(index)assert.equal(w.document.getElementById('value').textContent,String(index));});
      } finally {windows.forEach(w=>w.close());}
    `),
    ).toBe("verified");
  });
  it("keeps genuinely unique inputs on the actual native path", () => {
    // Given/When: five distinct inputs are parsed, with no recurring source key.
    // Then: no cached arena masquerades as five independent native parses.
    expect(
      runNative(`
      for(let index=0;index<5;index++) {
        const w=new JSDOM('<p id="value">'+index+'</p>').window;
        try {assert.equal(w.document.getElementById('value').textContent,String(index));}
        finally {w.close();}
      }
      assert.equal(getParserStatistics().nativeCalls,5);
    `),
    ).toBe("verified");
  });
  it("reuses recurring checked arenas while counting only actual native calls", () => {
    // Given: four source shells recur without consecutive repetition.
    // When: their exposed documents are mutated and closed on each use.
    // Then: exactly two actual parses per admitted source suffice, with fresh owned state every time.
    expect(
      runNative(`
      for(let cycle=0;cycle<3;cycle++)for(let index=0;index<4;index++) {
        const html='<main data-shell="'+index+'"><p id="value">shell'+index+'</p><template><svg><title>λ'+index+'</title></svg></template></main>';
        const w=new JSDOM(html).window;
        try {
          const node=w.document.getElementById('value');
          assert.equal(node.textContent,'shell'+index);
          assert.equal(node.ownerDocument,w.document);
          const template=w.document.querySelector('template');
          assert.equal(template.content.firstElementChild.textContent,'λ'+index);
          assert.equal(template.content.firstElementChild.hasAttribute('changed'),false);
          node.textContent='edited';
          template.content.firstElementChild.setAttribute('changed','yes');
        } finally {w.close();}
      }
      assert.equal(getParserStatistics().nativeCalls,8);
    `),
    ).toBe("verified");
  });
  it("bounds retained recurring source keys by aggregate source capacity", () => {
    // Given: eight individually eligible source keys exceed the aggregate character budget together.
    // When: the full set rotates three times.
    // Then: eviction keeps every construction on the real native path instead of retaining an unbounded set.
    expect(
      runNative(`
      const padding='x'.repeat(600000);
      for(let cycle=0;cycle<3;cycle++)for(let index=0;index<8;index++) {
        const w=new JSDOM('<p id="value">'+index+'<!--'+padding+'--></p>').window;
        try {assert.equal(w.document.getElementById('value').textContent,String(index));}
        finally {w.close();}
      }
      assert.equal(getParserStatistics().nativeCalls,24);
    `),
    ).toBe("verified");
  });
  it.each(["markup", "topology"])("rejects reusable admission above the %s budget", (kind) => {
    // Given/When: repeated input exceeds one explicit retained-storage budget.
    // Then: every public construction remains an actual native parse with complete output.
    const markup =
      kind === "markup"
        ? "'<!--'+'x'.repeat(1024*1024)+'--><p id=tail>end</p>'"
        : "'<i></i>'.repeat(33000)+'<p id=tail>end</p>'";
    expect(
      runNative(`
      const markup=${markup};
      for(let index=0;index<3;index++) {
        const w=new JSDOM(markup).window;
        try {assert.equal(w.document.getElementById('tail').textContent,'end');}
        finally {w.close();}
      }
      assert.equal(getParserStatistics().nativeCalls,3);
    `),
    ).toBe("verified");
  });
});
