// Checks that reflecting the public CSS interfaces does not initialize declaration parsing.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("exposes CSS declaration accessors before loading the style engine", () => {
  const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=commonjs",
      "-e",
      `
      const assert = require("node:assert/strict");
      const { JSDOM } = require(${JSON.stringify(entry)});
      const { window } = new JSDOM("<p></p>");
      try {
        const { CSSStyleDeclaration, CSSStyleProperties } = window;
        const { get, set } = Object.getOwnPropertyDescriptor(CSSStyleProperties.prototype, "color");
        assert.equal(get.name, "get");
        assert.equal(set.name, "set");
        assert.equal(Object.getPrototypeOf(CSSStyleProperties.prototype), CSSStyleDeclaration.prototype);
        assert.equal(Object.keys(require.cache).some(path => path.endsWith("/css-runtime.cjs")), false);
        const style = window.document.querySelector("p").style;
        set.call(style, "red");
        assert.equal(get.call(style), "red");
        assert.equal(Object.keys(require.cache).some(path => path.endsWith("/css-runtime.cjs")), false);
        set.call(style, "rgb(0, 0, 255)");
        assert.equal(get.call(style), "rgb(0, 0, 255)");
        assert.equal(Object.keys(require.cache).some(path => path.endsWith("/css-runtime.cjs")), true);
        process.stdout.write("verified");
      } finally {
        window.close();
      }
      `,
    ],
    { encoding: "utf8", timeout: 15000 },
  );
  expect(output).toBe("verified");
});

it("reads user-agent visibility without loading CSS and updates a retained declaration", () => {
  const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=commonjs",
      "-e",
      `
      const assert = require("node:assert/strict");
      const { JSDOM } = require(${JSON.stringify(entry)});
      const { window } = new JSDOM("<main><button hidden>Save</button></main>");
      try {
        const button = window.document.querySelector("button");
        const first = window.getComputedStyle(button);
        assert.equal(first.display, "none");
        assert.equal(first.getPropertyValue("visibility"), "visible");
        assert.equal(Object.keys(require.cache).some(path => path.endsWith("/css-runtime.cjs")), false);
        button.hidden = false;
        button.style.color = "red";
        const second = window.getComputedStyle(button);
        assert.notEqual(first, second);
        assert.equal(second.display, "inline");
        assert.equal(first.display, "inline");
        assert.equal(first.color, "rgb(255, 0, 0)");
        assert.equal(first.borderBlockStartColor, "rgb(51, 51, 51)");
        assert.equal(first.item(0), "accent-color");
        assert.throws(() => { first.display = "block"; }, { name: "NoModificationAllowedError" });
        process.stdout.write("verified");
      } finally {
        window.close();
      }
      `,
    ],
    { encoding: "utf8", timeout: 15000 },
  );
  expect(output).toBe("verified");
});

it("matches simple selector lists before loading the general selector engine", () => {
  const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=commonjs",
      "-e",
      `
      const assert = require("node:assert/strict");
      const { JSDOM } = require(${JSON.stringify(entry)});
      const { window } = new JSDOM(
        '<p id="one" role="switch button"></p><input id="two"><button id="three"></button>' +
        '<p id="four" role="Button"></p><p id="five" role="buttonish"></p>',
      );
      try {
        const select = () => window.document.querySelectorAll('*[role~="button"],input,BUTTON');
        const before = select();
        assert.deepEqual(Array.from(before, node => node.id), ["one", "two", "three"]);
        const input = window.document.getElementById("two");
        input.setAttribute("type", "EMAIL");
        input.setAttribute("list", "options");
        assert.equal(input.matches('input[list]:not([list=""])[type="email"]'), true);
        assert.equal(input.matches('input:not([list])[type="email"]'), false);
        assert.equal(Object.keys(require.cache).some(path => path.endsWith("/css-runtime.cjs")), false);
        window.document.getElementById("four").setAttribute("role", "button");
        assert.deepEqual(Array.from(select(), node => node.id), ["one", "two", "three", "four"]);
        assert.equal(before.length, 3);
        assert.throws(() => window.document.querySelectorAll("input,,button"), { name: "SyntaxError" });
        process.stdout.write("verified");
      } finally {
        window.close();
      }
      `,
    ],
    { encoding: "utf8", timeout: 15000 },
  );
  expect(output).toBe("verified");
});

it("defers inline declaration parsing through a simple cssText round trip", () => {
  const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));
  const result = execFileSync(
    process.execPath,
    [
      "-e",
      `
    const assert = require("node:assert/strict");
    const w = new (require(${JSON.stringify(entry)}).JSDOM)("").window;
    const p = w.document.createElement("p"), style = p.style;
    style.cssText = "color:red";
    assert.equal(style.cssText, "color: red;");
    assert.equal(p.getAttribute("style"), style.cssText);
    assert.equal(Object.keys(require.cache).some(k => k.endsWith("/css-runtime.cjs")), false);
    p.setAttribute("style","margin: 1px; color: blue");
    assert.equal(style.marginTop,"1px");
    assert.equal(style.color,"blue");
    style.display="block";
    assert.equal(style,p.style);
    const live=w.getComputedStyle(p);
    assert.equal(live.display,"");
    w.document.body.append(p);
    assert.equal(live.display,"block");
    w.close();
  `,
    ],
    { encoding: "utf8" },
  );
  expect(result).toBe("");
});

it("rejects invalid CSS values without invoking the host stack formatter", () => {
  const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));
  execFileSync(process.execPath, [
    "-e",
    `
      const assert = require("node:assert/strict");
      const { window } = new (require(process.argv[1]).JSDOM)("<p></p>");
      // Given a valid declaration and a host that observes stack formatting.
      const style = window.document.querySelector("p").style;
      style.setProperty("color", "green", "important");
      let formatted = 0;
      Error.prepareStackTrace = (error, frames) => {
        formatted++;
        return error.name + ": " + error.message + " at " + frames[0];
      };

      // When CSS parsing discards malformed input, the formatter never runs.
      style.color = "blue;";
      style.setProperty("width", "2px; display: none");
      assert.equal(formatted, 0);
      assert.equal(style.color, "green");
      assert.equal(style.getPropertyPriority("color"), "important");
      assert.equal(style.width, "");

      // Then valid values containing a semicolon still reach the complete parser.
      style.backgroundImage = 'url("a;b")';
      assert.match(style.backgroundImage, /a;b/);
      window.close();
    `,
    entry,
  ]);
});

it("releases detached stylesheet owners while the document and its live sheet list are retained", () => {
  const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));
  execFileSync(
    process.execPath,
    [
      "--expose-gc",
      "-e",
      `
      const assert = require("node:assert/strict");
      const { setImmediate: turn } = require("node:timers/promises");
      const { JSDOM } = require(${JSON.stringify(entry)});
      const { window } = new JSDOM("<style>p {color: red}</style><p>old</p>");
      const doc = window.document;
      const list = doc.styleSheets;
      function replace() {
        assert.equal(list.length, 1);
        const owner = new WeakRef(doc.querySelector("style"));
        doc.replaceChildren();
        return owner;
      }
      (async () => {
        const owner = replace();
        for (let i = 0; i < 5; i++) {
          await turn();
          global.gc();
        }
        assert.equal(owner.deref(), undefined);
        assert.equal(list.length, 0);
        const replacement = doc.createElement("style");
        replacement.textContent = "p {color: blue}";
        doc.append(replacement);
        assert.equal(list.item(0), replacement.sheet);
        assert.equal(list[0].cssRules[0].style.color, "blue");
      })().finally(() => window.close());
      `,
    ],
    { timeout: 15000 },
  );
});

it("updates and enumerates independent inline longhands before parsing a complex declaration", () => {
  const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));
  execFileSync(process.execPath, [
    "-e",
    `
      const assert = require("node:assert/strict");
      const { window } = new (require(process.argv[1]).JSDOM)("<p></p>");
      const el = window.document.querySelector("p");
      const style = el.style;
      const mutations = new window.MutationObserver(() => {});
      mutations.observe(el, { attributes: true, attributeOldValue: true });
      style.width = "200px";
      style.setProperty("height", "12.5em");
      style.display = "none";
      style.width = "320px";
      assert.deepEqual(Array.from(style), ["width", "height", "display"]);
      assert.equal(style.length, 3);
      assert.equal(style[1], "height");
      assert.equal(style.getPropertyPriority("width"), "");
      assert.equal(style.removeProperty("height"), "12.5em");
      assert.equal(style.removeProperty("height"), "");
      assert.equal(style.cssText, "width: 320px; display: none;");
      assert.equal(mutations.takeRecords().length, 5);

      el.setAttribute("style", " width : 320px ; display : none ");
      mutations.takeRecords();
      style.width = "320px";
      assert.equal(mutations.takeRecords().length, 0);
      style.display = "block";
      assert.equal(el.getAttribute("style"), "width: 320px; display: block;");
      assert.equal(Object.keys(require.cache).some(p => p.endsWith("/css-runtime.cjs")), false);
      style.setProperty("width", "calc(50% - 2px)", "important");
      assert.equal(style.getPropertyPriority("width"), "important");
      assert.equal(style.display, "block");
      assert.equal(el.style, style);
      assert.equal(Object.keys(require.cache).some(p => p.endsWith("/css-runtime.cjs")), true);
      window.close();
    `,
    entry,
  ]);
});

it("shares generic property behavior across promoted inline styles and mutable rules", () => {
  const entry = fileURLToPath(new URL("../dist/jsdom.cjs", import.meta.url));
  execFileSync(process.execPath, [
    "-e",
    `
      const assert = require("node:assert/strict");
      const { JSDOM } = require(process.argv[1]);
      const w = new JSDOM("<style>p {color: blue}</style><p></p>").window;
      const el = w.document.querySelector("p");
      const style = el.style;
      style.width = "12px";
      style.height = "3em";
      const mutations = new w.MutationObserver(() => {});
      mutations.observe(el, { attributes: true, attributeOldValue: true });
      style[0xffffffff] = "expando";
      assert.equal(style.item(-1), "");
      assert.equal(style[0xffffffff], "expando");
      const names = Object.keys(w.CSSStyleProperties.prototype);
      const descriptor = Object.getOwnPropertyDescriptor(w.CSSStyleProperties.prototype, "scrollBehavior");
      descriptor.set.call(style, "smooth");
      assert.equal(style.getPropertyValue("scroll-behavior"), "smooth");
      assert.deepEqual(Array.from(style), ["width", "height", "scroll-behavior"]);
      assert.deepEqual(mutations.takeRecords().map(r => r.oldValue), ["width: 12px; height: 3em;"]);
      const rule = w.document.styleSheets[0].cssRules[0].style;
      assert.equal(rule.scrollSnapType, "");
      rule.setProperty("scroll-snap-type", "x mandatory");
      assert.equal(rule.scrollSnapType, "x mandatory");
      rule.setProperty("scroll-behavior", "auto", "important");
      assert.equal(descriptor.get.call(rule), "auto");
      assert.equal(rule.getPropertyPriority("scroll-behavior"), "important");
      assert.deepEqual(Object.keys(w.CSSStyleProperties.prototype), names);
      el.removeAttribute("style");
      assert.equal(style.width, "");
      assert.equal(style, el.style);
      w.close();
    `,
    entry,
  ]);
});
