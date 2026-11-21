// Measures identical verified DOM work in fresh, serial Node processes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const providers = ["run-dom", "jsdom", "happy-dom"];
const scenarios = ["cold", "warm", "styles", "frames", "ids", "table", "urls"];
const rounds = 9;
const workerPath = fileURLToPath(import.meta.url);
const markup = "<button id='target'>before</button>";
const rowsMarkup = markup + "<p>row</p>".repeat(64);
const idMarkup = Array.from(
  { length: 512 },
  (_, index) => `<p id="row-${index}">${index}</p>`,
).join("");
const tableMarkup =
  "<table><tbody>" +
  Array.from({ length: 128 }, (_, index) => `<tr><td>${index}</td></tr>`).join("") +
  "</tbody></table>";

async function windowFactory(provider, scenario) {
  if (provider === "happy-dom") {
    const { Window } = await import("happy-dom");
    return (html) => {
      const window =
        scenario === "frames"
          ? new Window({
              url: "https://example.test/",
              settings: { enableIframePageLoading: true },
            })
          : scenario === "urls"
            ? new Window({ url: "https://example.test/" })
            : new Window();
      window.document.write(html);
      return window;
    };
  }
  const { JSDOM } = provider === "jsdom" ? await import("jsdom") : await import("@run-dom/jsdom");
  return (html) =>
    new JSDOM(
      html,
      scenario === "frames" || scenario === "urls" ? { url: "https://example.test/" } : undefined,
    ).window;
}

async function checkedClick(createWindow, html) {
  const window = createWindow(html);
  try {
    const { document } = window;
    const button = document.querySelector("button");
    assert(button);
    assert.equal(document.getElementById("target"), button);
    assert.equal(button.textContent, "before");
    let deliveries = 0;
    document.body.addEventListener("click", (event) => {
      if (event.target === button) {
        deliveries++;
        button.textContent = "after";
      }
    });
    button.click();
    assert.equal(deliveries, 1);
    assert.equal(button.textContent, "after");
  } finally {
    await window.close();
  }
}

async function checkedStyle(createWindow) {
  const window = createWindow(
    "<style>section > p.notice { color: rgb(0, 0, 255) }</style>" +
      "<section><p class='notice'>Notice</p></section>",
  );
  try {
    const node = window.document.querySelector("section > p.notice");
    assert(node);
    assert.equal(window.getComputedStyle(node).color, "rgb(0, 0, 255)");
    node.style.setProperty("color", "rgb(0, 128, 0)");
    assert.equal(window.getComputedStyle(node).color, "rgb(0, 128, 0)");
  } finally {
    await window.close();
  }
}

async function checkedFrame(createWindow) {
  const window = createWindow("<iframe></iframe>");
  try {
    const frame = window.document.querySelector("iframe");
    assert(frame);
    const child = frame.contentDocument;
    assert(child?.body);
    const paragraph = child.createElement("p");
    paragraph.textContent = "child";
    child.body.appendChild(paragraph);
    assert.equal(child.body.textContent, "child");
    assert.notEqual(frame.contentWindow, window);
    assert.equal(frame.contentWindow.parent, window);
  } finally {
    await window.close();
  }
}

async function checkedIds(createWindow) {
  const window = createWindow(idMarkup);
  try {
    const { document } = window;
    for (let index = 0; index < 512; index += 2) {
      assert.equal(document.getElementById(`row-${index}`)?.textContent, String(index));
    }
    assert.equal(document.getElementById("missing"), null);
  } finally {
    await window.close();
  }
}

async function checkedTable(createWindow) {
  const window = createWindow(tableMarkup);
  try {
    const table = window.document.querySelector("table");
    assert(table);
    const rows = table.rows;
    assert.equal(rows.length, 128);
    for (let pass = 0; pass < 2; pass++) {
      for (let index = 0; index < 128; index++) {
        assert.equal(rows.item(index)?.cells.item(0)?.textContent, String(index));
      }
    }
    table.insertRow().insertCell().textContent = "last";
    assert.equal(table.rows.item(128)?.textContent, "last");
  } finally {
    await window.close();
  }
}

async function checkedURLs(createWindow) {
  const window = createWindow(idMarkup + '<a href="item">item</a>');
  try {
    const link = window.document.querySelector("a");
    assert(link);
    for (let index = 0; index < 128; index++) assert.equal(link.href, "https://example.test/item");
  } finally {
    await window.close();
  }
}

async function worker(provider, scenario) {
  const createWindow = await windowFactory(provider, scenario);
  const count = scenario === "cold" ? 1 : 32;
  const checked =
    scenario === "frames"
      ? () => checkedFrame(createWindow)
      : scenario === "styles"
        ? () => checkedStyle(createWindow)
        : scenario === "ids"
          ? () => checkedIds(createWindow)
          : scenario === "table"
            ? () => checkedTable(createWindow)
            : scenario === "urls"
              ? () => checkedURLs(createWindow)
              : () => checkedClick(createWindow, scenario === "cold" ? markup : rowsMarkup);
  if (scenario !== "cold") {
    for (let warmup = 0; warmup < 8; warmup++) await checked();
  }
  const start = performance.now();
  for (let index = 0; index < count; index++) {
    await checked();
  }
  console.log(
    JSON.stringify({
      verified: count,
      workMs: performance.now() - start,
      rssMiB: process.memoryUsage.rss() / (1024 * 1024),
    }),
  );
}

function median(values) {
  return values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
}

function benchmark() {
  const trials = [];
  for (const scenario of scenarios) {
    for (let round = 0; round < rounds; round++) {
      for (let offset = 0; offset < providers.length; offset++) {
        const provider = providers[(round + offset) % providers.length];
        const start = performance.now();
        const run = spawnSync(process.execPath, [workerPath, "--worker", provider, scenario], {
          encoding: "utf8",
          timeout: 20_000,
        });
        const processMs = performance.now() - start;
        if (run.error) throw run.error;
        assert.equal(run.status, 0, run.stderr);
        const result = JSON.parse(run.stdout);
        assert.equal(result.verified, scenario === "cold" ? 1 : 32);
        assert(Number.isFinite(result.workMs) && Number.isFinite(result.rssMiB));
        trials.push({ scenario, provider, round, processMs, ...result });
      }
    }
  }
  const medians = scenarios.flatMap((scenario) =>
    providers.map((provider) => {
      const matching = trials.filter(
        (trial) => trial.scenario === scenario && trial.provider === provider,
      );
      return {
        scenario,
        provider,
        processMs: median(matching.map((trial) => trial.processMs)),
        workMs: median(matching.map((trial) => trial.workMs)),
        rssMiB: median(matching.map((trial) => trial.rssMiB)),
      };
    }),
  );
  console.log(
    JSON.stringify(
      {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        rounds,
        medians,
        trials,
      },
      null,
      2,
    ),
  );
}

const [mode, provider, scenario] = process.argv.slice(2);
if (mode === "--worker") {
  assert(providers.includes(provider));
  assert(scenarios.includes(scenario));
  await worker(provider, scenario);
} else {
  assert.equal(mode, undefined);
  benchmark();
}
