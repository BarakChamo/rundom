// Pins which RunDOM artifacts and heavy Node built-ins a component test file's start-up loads.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));

/** Runs the start-up of a typical test file in a fresh process and reports the loads after each phase. */
function startupLoads(): Record<string, { artifacts: string[]; builtins: string[] }> {
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=commonjs",
      "-e",
      `
      const { basename } = require("node:path");
      const heavy = ["assert", "fs/promises", "stream/web"];
      const loads = {};
      const record = (phase) => {
        loads[phase] = {
          artifacts: Object.keys(require.cache)
            .filter((path) => /[\\\\/]packages[\\\\/](dom|jsdom)[\\\\/]dist[\\\\/]/.test(path))
            .map((path) => basename(path)),
          builtins: heavy.filter((name) => process.moduleLoadList.includes("NativeModule " + name)),
        };
      };
      const { JSDOM } = require(${JSON.stringify(entry)});
      record("require");
      const { window } = new JSDOM(
        '<!doctype html><style>.a { color: red }</style><div class="a" id="x"></div>',
      );
      record("create");
      for (const key of Object.getOwnPropertyNames(window)) {
        try { void window[key]; } catch {}
      }
      record("globals");
      const target = window.document.getElementById("x");
      void window.getComputedStyle(target).color;
      target.style.color = "blue";
      window.document.querySelector("div.a");
      target.matches(".a");
      record("style");
      window.close();
      process.stdout.write(JSON.stringify(loads));
      `,
    ],
    { encoding: "utf8", timeout: 30000 },
  );
  return JSON.parse(output) as Record<string, { artifacts: string[]; builtins: string[] }>;
}

describe("RunDOM start-up loading", () => {
  it("loads only the facade, the Window and the CSS runtime until globals and styles are used", () => {
    // Given: a fresh process running what a component test file does at start
    // When: the facade is required, a Window is created, its globals are read and styles are used
    const loads = startupLoads();
    // Then: each phase loads only the artifacts it needs
    const base = ["jsdom.cjs", "jsdom-implementation.cjs", "window.cjs"];
    const css = [
      ...base,
      "css-runtime.cjs",
      "css-position-descriptor-names.cjs",
      "css-reference-interfaces.cjs",
      "css-property-names.cjs",
    ];
    expect(loads.require!.artifacts).toEqual(base);
    expect(loads.create!.artifacts).toEqual([...base, "css-runtime.cjs"]);
    expect(loads.globals!.artifacts).toEqual(css);
    expect(loads.style!.artifacts).toEqual(css);
  });

  it("defers node:assert, node:fs/promises and node:stream/web past Window creation", () => {
    // Given: a fresh process running what a component test file does at start
    // When: the facade is required and a Window with a stylesheet is created
    const loads = startupLoads();
    // Then: none of the three built-ins was loaded by RunDOM (Node's own fetch loads them later)
    expect(loads.require!.builtins).toEqual([]);
    expect(loads.create!.builtins).toEqual([]);
  });
});
