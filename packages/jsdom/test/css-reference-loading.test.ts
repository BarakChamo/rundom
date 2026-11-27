// Checks that Window globals reflect without the CSS reference grammar and that CSS use shares one reference module graph.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));
const domDist = dirname(createRequire(import.meta.url).resolve("@run-dom/dom"));

function runIsolated(source: string): string {
  return execFileSync(
    process.execPath,
    [
      "--input-type=commonjs",
      "-e",
      `
      const assert = require("node:assert/strict");
      const { JSDOM } = require(${JSON.stringify(entry)});
      const rawReferenceModules = () =>
        Object.keys(require.cache).filter((path) => /[\\\\/]jsdom@31\\.0\\.1[\\\\/]|rundom-css-reference/.test(path));
      const grammarInitialized = () => {
        const loader = Object.keys(require.cache).find((path) => path === ${JSON.stringify(domDist + "/css-reference.cjs")});
        return loader !== undefined && require(loader).grammarInitialized;
      };
      ${source}
      `,
    ],
    { encoding: "utf8", timeout: 30000 },
  );
}

const descriptorInterfaces = [
  "CSSFunctionDescriptors",
  "CSSFunctionDeclarations",
  "CSSFontFaceDescriptors",
  "CSSMarginDescriptors",
  "CSSPageDescriptors",
];

describe("Window CSS reference loading", () => {
  it("reflects every Window global without initializing the CSS reference grammar", () => {
    const output = runIsolated(`
      // Given: a fresh visual Window, as Vitest's populateGlobal sees it
      const { window } = new JSDOM("<!doctype html><p></p>", { pretendToBeVisual: true, runScripts: "dangerously" });
      // When: every own Window property is read once
      for (const key of Object.getOwnPropertyNames(window)) {
        try { void window[key]; } catch {}
      }
      // Then: no reference module was loaded or initialized by the reads
      assert.deepEqual(rawReferenceModules(), []);
      assert.equal(grammarInitialized(), false);
      window.close();
      process.stdout.write("verified");
    `);
    expect(output).toBe("verified");
  });

  it("reflects every Window global without loading the CSS engine artifact", () => {
    const output = runIsolated(`
      // Given: a fresh visual Window, as Vitest's populateGlobal sees it
      const { window } = new JSDOM("<!doctype html><p></p>", { pretendToBeVisual: true, runScripts: "dangerously" });
      // When: every own Window property is read once
      for (const key of Object.getOwnPropertyNames(window)) {
        try { void window[key]; } catch {}
      }
      // Then: only the interface artifact of the CSS reference was loaded
      const artifacts = Object.keys(require.cache)
        .filter((path) => path.startsWith(${JSON.stringify(domDist + "/css-reference")}))
        .map((path) => path.slice(${JSON.stringify(domDist.length + 1)}));
      assert.deepEqual(artifacts, ["css-reference-interfaces.cjs"]);
      window.close();
      process.stdout.write("verified");
    `);
    expect(output).toBe("verified");
  });

  it("resolves simple computed styles without loading the CSS engine artifact", () => {
    const output = runIsolated(`
      // Given: a stylesheet of plain longhands and a border shorthand
      const { window } = new JSDOM(\`<!doctype html><style>
        p { width: 10px; position: absolute; top: 0; border: 1px solid red; color: rgba(0, 0, 0, 0.5); }
      </style><p>x</p>\`);
      // When: computed values are read for the first time in the process
      const computed = window.getComputedStyle(window.document.querySelector("p"));
      // Then: values resolve from the property tables alone
      assert.equal(computed.width, "10px");
      assert.equal(computed.borderTopColor, "rgb(255, 0, 0)");
      assert.equal(computed.color, "rgba(0, 0, 0, 0.5)");
      const artifacts = Object.keys(require.cache)
        .filter((path) => path.startsWith(${JSON.stringify(domDist + "/css-reference")}))
        .map((path) => path.slice(${JSON.stringify(domDist.length + 1)}));
      assert.deepEqual(artifacts, ["css-reference-properties.cjs"]);
      assert.deepEqual(rawReferenceModules(), []);
      window.close();
      process.stdout.write("verified");
    `);
    expect(output).toBe("verified");
  });

  it("reflects the same descriptor interfaces before and after the CSS engine loads", () => {
    // Given: descriptor interface shapes read in one process that never loads the engine,
    // and in one where another Window parsed descriptor rules first
    const shape = (prelude: string) =>
      runIsolated(`
        ${prelude}
        const { window } = new JSDOM("<!doctype html><head></head>");
        // When: each interface's global, constructor, prototype, chain and brand checks are read
        const describe = (object) => Reflect.ownKeys(object).map((key) => [
          String(key),
          Object.entries(Object.getOwnPropertyDescriptor(object, key)).map(([field, value]) =>
            field + ":" + (typeof value === "function" ? value.name + "/" + value.length : typeof value === "object" && value !== null ? "object" : String(value)),
          ),
        ]);
        const error = (operation) => { try { operation(); return "none"; } catch (e) { return e.name + ": " + e.message; } };
        const chain = (object) => {
          const names = [];
          for (let prototype = Object.getPrototypeOf(object); prototype; prototype = Object.getPrototypeOf(prototype))
            names.push(Object.prototype.toString.call(prototype) + " " + prototype.constructor?.name);
          return names;
        };
        const shapes = ${JSON.stringify(descriptorInterfaces)}.map((name) => {
          const constructor = window[name];
          const getter = Object.values(Object.getOwnPropertyDescriptors(constructor.prototype)).find(({ get }) => get);
          return {
            name,
            global: describe(window).find(([key]) => key === name),
            constructor: describe(constructor),
            prototype: describe(constructor.prototype),
            chain: chain(constructor.prototype),
            tag: Object.prototype.toString.call(constructor.prototype),
            construct: error(() => new constructor()),
            call: error(() => constructor()),
            brand: error(() => getter.get.call({})),
          };
        });
        process.stdout.write(JSON.stringify({ engineLoaded: grammarInitialized(), shapes }));
      `);
    const cold = JSON.parse(shape(""));
    const warm = JSON.parse(
      shape(`
        const first = new JSDOM(\`<!doctype html><style>
          @function --double(--x) { result: calc(var(--x) * 2); }
          @font-face { font-family: X; src: url(x.woff); }
          @page :first { margin: 1in; @top-left { content: "a"; } }
        </style>\`);
        void first.window.document.styleSheets[0].cssRules.length;
      `),
    );
    // Then: the engine loaded only in the second process, and every shape is identical
    expect(cold.engineLoaded).toBe(false);
    expect(warm.engineLoaded).toBe(true);
    expect(cold.shapes).toHaveLength(descriptorInterfaces.length);
    expect(cold.shapes).toEqual(warm.shapes);
  });

  it("keeps early-read descriptor interfaces as the constructors of later parsed rules", () => {
    const output = runIsolated(`
      // Given: descriptor interfaces read before any stylesheet exists
      const { window } = new JSDOM("<!doctype html><head></head>");
      const names = ${JSON.stringify(descriptorInterfaces)};
      const early = Object.fromEntries(names.map((name) => [name, window[name]]));
      const chains = names.map((name) => Object.getPrototypeOf(early[name].prototype));
      // When: real @function, @font-face and @page rules are parsed later
      const style = window.document.createElement("style");
      style.textContent = \`
        @function --double(--x) { result: calc(var(--x) * 2); }
        @font-face { font-family: X; src: url(x.woff); }
        @page :first { margin: 1in; @top-left { content: "a"; } }
      \`;
      window.document.head.append(style);
      const [functionRule, fontFace, page] = window.document.styleSheets[0].cssRules;
      const declarations = functionRule.cssRules[0];
      // Then: rule objects are branded by the very constructors read earlier
      assert.ok(declarations instanceof early.CSSFunctionDeclarations);
      assert.ok(declarations.style instanceof early.CSSFunctionDescriptors);
      assert.ok(fontFace.style instanceof early.CSSFontFaceDescriptors);
      assert.ok(page.style instanceof early.CSSPageDescriptors);
      assert.ok(page.cssRules[0].style instanceof early.CSSMarginDescriptors);
      assert.equal(Object.prototype.toString.call(declarations.style), "[object CSSFunctionDescriptors]");
      assert.equal(declarations.style.getPropertyValue("result"), "calc(var(--x) * 2)");
      for (const name of names) {
        const constructor = early[name];
        assert.equal(window[name], constructor);
        assert.equal(constructor.name, name);
        assert.equal(constructor.length, 0);
        assert.equal(Object.prototype.toString.call(constructor.prototype), "[object " + name + "]");
        assert.throws(() => new constructor(), { name: "TypeError", message: "Illegal constructor" });
        const descriptor = Object.getOwnPropertyDescriptor(window, name);
        assert.equal(descriptor.enumerable, false);
        assert.equal(descriptor.configurable, true);
        assert.equal(descriptor.get.name, "get " + name);
      }
      assert.deepEqual(names.map((name) => Object.getPrototypeOf(early[name].prototype)), chains);
      window.close();
      process.stdout.write("verified");
    `);
    expect(output).toBe("verified");
  });

  it("serves CSS reference capabilities from one module graph after real CSS use", () => {
    const output = runIsolated(`
      // Given: a document exercising declarations, colors, selectors, substitution and descriptor rules
      const { window } = new JSDOM(\`<!doctype html><style>
        @property --gap { syntax: "<length>"; inherits: false; initial-value: 4px; }
        @counter-style thumbs { system: cyclic; symbols: "a"; }
        p:is(.a, .b) { color: color-mix(in srgb, red, blue); margin-inline: var(--gap); inset: 1px; }
      </style><p class="a">x</p>\`);
      const p = window.document.querySelector("p");
      // When: computed styles, inline declarations and pseudo targets are resolved
      const computed = window.getComputedStyle(p);
      p.style.setProperty("translate", "1px 2px");
      void window.getComputedStyle(p, "::before").content;
      // Then: results are produced without loading any raw reference module
      assert.equal(computed.color, "color(srgb 0.5 0 0.5)");
      assert.equal(computed.marginLeft, "4px");
      assert.equal(p.style.translate, "1px 2px");
      assert.equal(window.CSS.supports("selector(:has(a))"), true);
      assert.deepEqual(rawReferenceModules(), []);
      assert.equal(grammarInitialized(), true);
      window.close();
      process.stdout.write("verified");
    `);
    expect(output).toBe("verified");
  });
});
