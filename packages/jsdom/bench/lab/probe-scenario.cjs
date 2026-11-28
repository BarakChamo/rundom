// Runs one load-immune probe scenario in a fresh process and prints its deterministic counts and CPU time as one JSON line.
// usage: node --single-threaded probe-scenario.cjs <jsdom.cjs entry> <scenario>
"use strict";
const { basename } = require("node:path");

const [entry, scenario] = process.argv.slice(2);
const cpuMs = () => {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
};
const start = cpuMs();
const { JSDOM } = require(entry);
const markup =
  '<!doctype html><html><head><style>.a{color:red;display:flex}.b .c{visibility:hidden}@media (min-width:1px){.d{margin:1px}}</style></head><body><div class="a b"><span class="c d" id="x"><input type="checkbox" id="k"></span></div></body></html>';
const window = new JSDOM(markup, { pretendToBeVisual: true, url: "http://localhost/" }).window;
const document = window.document;
const ready = cpuMs();
const table = "<!doctype html><table>" + "<tr><td>a</td></tr>".repeat(256) + "</table>";

// Each scenario returns its operation count. Loop sizes are fixed so instruction counts compare across builds.
const scenarios = {
  create: () => 0,
  "globals-read": () => {
    // Vitest's populateGlobal reads every own Window property once per test file.
    const keys = Object.getOwnPropertyNames(window);
    for (const key of keys) {
      try {
        void window[key];
      } catch {}
    }
    return keys.length;
  },
  "first-query": () => {
    document.querySelectorAll(
      'div.a > span:not([hidden])[class~="c"], input[type="checkbox"]:nth-child(1)',
    );
    return 1;
  },
  "first-computed-style": () => {
    void window.getComputedStyle(document.getElementById("x")).display;
    return 1;
  },
  "visibility-reads": () => {
    const target = document.getElementById("x");
    for (let i = 0; i < 2000; i++) {
      for (let node = target; node && node.nodeType === 1; node = node.parentNode)
        void window.getComputedStyle(node).display;
      void window.getComputedStyle(target).visibility;
    }
    return 2000;
  },
  click: () => {
    const input = document.getElementById("k");
    for (let i = 0; i < 2000; i++) input.click();
    return 2000;
  },
  "append-remove": () => {
    const parent = document.getElementById("x");
    for (let i = 0; i < 4000; i++)
      parent.removeChild(parent.appendChild(document.createElement("div")));
    return 4000;
  },
  "domparser-repeat": () => {
    const parser = new window.DOMParser();
    for (let i = 0; i < 100; i++) parser.parseFromString(table, "text/html");
    return 100;
  },
  "window-create-close": () => {
    for (let i = 0; i < 100; i++) new JSDOM("").window.close();
    return 100;
  },
};

const run = scenarios[scenario];
if (!run) {
  process.stderr.write(
    `unknown scenario ${scenario}; expected one of ${Object.keys(scenarios).join(", ")}\n`,
  );
  process.exit(2);
}
const operations = run();
const done = cpuMs();

// Interfaces are counted after the scenario so the descriptor walk cannot perturb first-use work.
let interfaces = 0;
for (const key of Object.getOwnPropertyNames(window)) {
  const value = Object.getOwnPropertyDescriptor(window, key).value;
  if (typeof value === "function" && /^[A-Z]/.test(key) && value.prototype) interfaces++;
}
const modules = Object.keys(require.cache);
const referenceLoader = modules.find((path) => basename(path) === "css-reference.cjs");
const windowKeys = Object.getOwnPropertyNames(window).length;
window.close();
process.stdout.write(
  JSON.stringify({
    scenario,
    operations,
    counts: {
      cjsModules: modules.length,
      builtinModules: process.moduleLoadList.length,
      windowKeys,
      interfaces,
      cssGrammarInitialized: referenceLoader
        ? Number(require(referenceLoader).grammarInitialized === true)
        : 0,
    },
    runDomModules: modules
      .filter((path) => /[\\/]packages[\\/](dom|jsdom)[\\/]dist[\\/]/.test(path))
      .map((path) => basename(path)),
    cpuMs: { setup: ready - start, scenario: done - ready },
    maxRssKiB: Math.round(process.resourceUsage().maxRSS),
  }) + "\n",
);
