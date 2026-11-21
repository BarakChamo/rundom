// Requires the installed native boundary to validate data without runtime function generation.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
it("uses interpreted schemas without implicit Function-constructor calls", () => {
  // Given: the child observes code-generation calls without changing the producer process.
  const entry = createRequire(import.meta.url).resolve("../dist/index.cjs");
  const result = execFileSync(
    process.execPath,
    [
      "-e",
      `
 const assert=require('node:assert/strict');let calls=0;const original=Function;
 globalThis.Function=new Proxy(original,{construct(target,args,newTarget){calls++;return Reflect.construct(target,args,newTarget);},apply(target,receiver,args){calls++;return Reflect.apply(target,receiver,args);}});
 const api=require(${JSON.stringify(entry)});
 const result=api.parseHTML({markup:'<!doctype html><p>no eval</p>',scriptingEnabled:false});assert(result.isOk());
 assert(api.htmlSnapshotSchema.safeParse(result.value).success);
 assert(api.parseHTML({markup:42,scriptingEnabled:false}).isErr());
 process.stdout.write(JSON.stringify({calls}));
 `,
    ],
    { encoding: "utf8" },
  );
  expect(JSON.parse(result)).toEqual({ calls: 0 });
});
