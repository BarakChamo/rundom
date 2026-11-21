// Keeps explicitly selected TypeScript parsing from initializing the unused native boundary package.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("parses under explicit TypeScript selection without loading the native package", () => {
  const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));
  const result = execFileSync(
    process.execPath,
    [
      "--input-type=commonjs",
      "-e",
      `
    const {registerHooks}=require('node:module');
    registerHooks({resolve(specifier,context,next){
      if(specifier==='@run-dom/html-parser')throw new Error('Unused native boundary was loaded');
      return next(specifier,context);
    }});
    const {JSDOM}=require(${JSON.stringify(entry)});
    const w=new JSDOM('<main><i id="a">text</i></main>').window;
    try{
      if(w.document.querySelector('#a').textContent!=='text')throw new Error('Incorrect TypeScript result');
      process.stdout.write('verified');
    }finally{w.close();}
  `,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, RUN_DOM_HTML_PARSER: "typescript" },
      timeout: 15000,
    },
  );
  expect(result).toBe("verified");
});
