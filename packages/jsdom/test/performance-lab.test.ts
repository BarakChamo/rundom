// Protects benchmark evidence from invalid inputs and accidentally comparing incomplete or instrumented work.
import { expect, it } from "vitest";
import {
  dimensionsSchema,
  requestSchema,
  resultSchema,
  defaultOperations,
  distribution,
  summarize,
} from "../bench/lab/contracts.js";

it("defaults every per-document construction scenario to eight operations per batch", () => {
  // Given: each parse-html variant builds and closes a whole Window per operation.
  // When: no explicit --operations value is given.
  // Then: they share the eight-operation creation/parsing default; selection-only work keeps 512.
  for (const scenario of [
    "parse-html",
    "parse-html-rotate",
    "parse-html-sparse",
    "parse-html-traverse",
    "parse-html-update",
    "parse-html-unique",
    "windows-create-close",
    "clone-subtree",
    "serialize",
  ] as const)
    expect(defaultOperations(scenario), scenario).toBe(8);
  expect(defaultOperations("query-simple")).toBe(512);
});

it("rejects unbounded dimensions and unknown runtime selection", () => {
  // Given/When/Then: command data cannot silently change the bounded workload or parser selection.
  expect(dimensionsSchema.safeParse({ operations: 0 }).success).toBe(false);
  expect(dimensionsSchema.safeParse({ windows: 65 }).success).toBe(false);
  expect(requestSchema.safeParse({ provider: "fast", scenario: "control" }).success).toBe(false);
  expect(resultSchema.safeParse({ verified: false }).success).toBe(false);
});

it("reports sample counts and robust dispersion without treating missing samples as zero", () => {
  // Given: an outlier must remain visible while the center stays useful.
  expect(distribution([1, 2, 3, 4, 100])).toEqual({
    n: 5,
    median: 3,
    p95: 100,
    min: 1,
    max: 100,
    mad: 1,
  });
  expect(() => distribution([])).toThrow("Expected finite nonempty samples");
  expect(() => distribution([NaN])).toThrow("Expected finite nonempty samples");
});

it("excludes profiler trials and marks a partially failed comparison ineligible", () => {
  // Given: a valid timing observation and a diagnostic observation share the same workload.
  const memory = {
    rss: 1,
    heapTotal: 1,
    heapUsed: 1,
    external: 0,
    arrayBuffers: 0,
    peakRssBytes: 1,
  };
  const result = resultSchema.parse({
    version: 1,
    provider: "run-dom",
    scenario: "control",
    mode: "timing",
    dimensions: {},
    phases: [
      { name: "first", wallMs: 1, userCpuMs: 1, systemCpuMs: 0, startUs: 1, endUs: 2, memory },
    ],
    batchesMs: [2],
    memory: [],
    gc: [],
    modules: [],
    verified: true,
  });
  const rows = summarize(
    [
      { round: 0, processMs: 3, result },
      { round: 1, processMs: 1000, result: { ...result, mode: "cpu" } },
    ],
    [
      {
        round: 1,
        provider: "run-dom",
        scenario: "control",
        mode: "timing",
        reason: "timeout",
        stderr: "",
      },
    ],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]?.processMs.median).toBe(3);
  expect(rows[0]?.comparable).toBe(false);
});

it("rejects a no-op mutation even when a provider returns a plausible DOM", async () => {
  // Given: timing unchecked writes could reward an implementation that never updates the DOM.
  const { spawnSync } = await import("node:child_process");
  const script = `
    import { JSDOM } from '@run-dom/jsdom';
    import assert from 'node:assert/strict';
    import { prepareScenario } from './bench/lab/scenarios.ts';
    import { dimensionsSchema } from './bench/lab/contracts.ts';
    const create = markup => { const w = new JSDOM(markup).window; w.document.getElementById('row0').setAttribute = () => {}; return w; };
    const scenario = prepareScenario('write-attribute', create, dimensionsSchema.parse({size:2}), process.cwd());
    try { scenario.run(3); scenario.verify(3); } finally { await scenario.close(); }
  `;
  // When/Then: the real candidate with a deliberately broken write cannot produce verified evidence.
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("did not perform equal checked work");
});

it("checks query invalidation, event delivery and independent windows against a real candidate", async () => {
  // Given: the rig must detect real mutations and callbacks, including first and repeated operations.
  const { spawnSync } = await import("node:child_process");
  const script = `
    import { JSDOM } from '@run-dom/jsdom';
    import assert from 'node:assert/strict';
    import { prepareScenario } from './bench/lab/scenarios.ts';
    import { dimensionsSchema } from './bench/lab/contracts.ts';
    for (const name of ['list-reconcile','interaction-state','parse-html-unique','parse-html-rotate','parse-html-traverse','query-after-mutation','query-diverse','query-batched-mutation','query-all-iterate','query-snapshot','events-dispatch','events-default-action','mutation-observer','style-rule-invalidation','style-inheritance','style-snapshot','windows-live','windows-style-live']) {
      const scenario = prepareScenario(name, markup => new JSDOM(markup).window, dimensionsSchema.parse({size:2,windows:2}), process.cwd());
      try { await scenario.run(1); assert.throws(()=>scenario.verify(2),/different operation count/); scenario.verify(1); await scenario.run(5); scenario.verify(6); } finally { await scenario.close(); }
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
});

it("detects changed installed bytes and redirected dependency symlinks", async () => {
  // Given: tarball provenance alone cannot prove a measured installed artifact stayed frozen.
  const { mkdtempSync, writeFileSync, symlinkSync, unlinkSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { consumerDigest } = await import("../bench/lab/integrity.js");
  const directory = mkdtempSync(join(tmpdir(), "run-dom-integrity-"));
  try {
    writeFileSync(join(directory, "a.js"), "original");
    symlinkSync("a.js", join(directory, "dependency"));
    const original = consumerDigest(directory);
    writeFileSync(join(directory, "a.js"), "changed");
    expect(consumerDigest(directory)).not.toBe(original);
    const changed = consumerDigest(directory);
    unlinkSync(join(directory, "dependency"));
    symlinkSync("b.js", join(directory, "dependency"));
    expect(consumerDigest(directory)).not.toBe(changed);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("disposes Happy DOM through its lifecycle API and cancels pending work", async () => {
  // Given: standard window.close() does not dispose a directly constructed detached Happy DOM window.
  const { spawnSync } = await import("node:child_process");
  const script = `
    import assert from 'node:assert/strict';
    import { loadProvider, closeWindow } from './bench/lab/providers.ts';
    import { dimensionsSchema } from './bench/lab/contracts.ts';
    import { setTimeout as wait } from 'node:timers/promises';
    const create = await loadProvider('happy-dom', process.cwd(), dimensionsSchema.parse({}));
    const window = create('<p>live</p>'); let called = false;
    window.setTimeout(() => { called = true; }, 20);
    await closeWindow(window); await wait(40);
    assert.equal(called,false,'Disposed provider executed a pending timer');
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
});

it("rejects a provider that reuses one computed declaration across mutations", async () => {
  // Given: length/color reads alone cannot establish jsdom's fresh computed snapshot contract.
  const { spawnSync } = await import("node:child_process");
  const script = `
    import { JSDOM } from '@run-dom/jsdom';
    import { prepareScenario } from './bench/lab/scenarios.ts';
    import { dimensionsSchema } from './bench/lab/contracts.ts';
    const create = markup => {
      const window = new JSDOM(markup).window;
      const computed = window.getComputedStyle.bind(window); let cached;
      window.getComputedStyle = node => cached ??= computed(node);
      return window;
    };
    const scenario = prepareScenario('style-snapshot',create,dimensionsSchema.parse({size:2}),process.cwd());
    try { scenario.run(3); scenario.verify(3); } finally { await scenario.close(); }
  `;
  // When/Then: plausible cached output cannot be published as verified snapshot work.
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("did not perform equal checked work");
});

it("advances mutation values across one-operation batches", async () => {
  // Given: repeated one-operation runs must exercise changes instead of reassigning the first value.
  const { spawnSync } = await import("node:child_process");
  const script = `
    import assert from 'node:assert/strict';
    import { JSDOM } from '@run-dom/jsdom';
    import { prepareScenario } from './bench/lab/scenarios.ts';
    import { dimensionsSchema } from './bench/lab/contracts.ts';
    let window;
    const scenario = prepareScenario('write-attribute',markup => window=new JSDOM(markup).window,dimensionsSchema.parse({size:2}),process.cwd());
    try {
      for (let index=0;index<3;index++) {
        scenario.run(1); scenario.verify(index+1);
        assert.equal(window.document.getElementById('row0').getAttribute('data-value'),String(index),'Writes must advance across batches');
      }
    } finally { await scenario.close(); }
  `;
  // When/Then: the real DOM exposes a different written value after every batch.
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
});

it("rejects stale parse inputs and omitted full-row reads", async () => {
  // Given: equal element counts alone can hide a reused input or missing node values.
  const { spawnSync } = await import("node:child_process");
  const script = `
    import assert from 'node:assert/strict';
    import { JSDOM } from '@run-dom/jsdom';
    import { prepareScenario } from './bench/lab/scenarios.ts';
    import { dimensionsSchema } from './bench/lab/contracts.ts';
    let first;
    for (const [name,create] of [
      ['parse-html-unique',markup=>new JSDOM(first??=markup).window],
      ['parse-html-traverse',markup=>new JSDOM(markup.replace('row0</p>','wrong</p>')).window]
    ]) {
      const scenario=prepareScenario(name,create,dimensionsSchema.parse({size:2}),process.cwd());
      try { await scenario.run(3); assert.throws(()=>scenario.verify(3),/did not perform equal checked work/); }
      finally { await scenario.close(); }
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
});

it("rejects dropped edits in render batches and interaction-driven state changes", async () => {
  // Given: a provider can deliver clicks yet fail to publish the DOM state a listener writes.
  const { spawnSync } = await import("node:child_process");
  const script = `
    import assert from 'node:assert/strict';
    import { JSDOM } from '@run-dom/jsdom';
    import { prepareScenario } from './bench/lab/scenarios.ts';
    import { dimensionsSchema } from './bench/lab/contracts.ts';
    for (const name of ['list-reconcile','interaction-state']) {
      const scenario=prepareScenario(name,markup=>{const window=new JSDOM(markup).window;window.document.getElementById('row0').setAttribute=()=>{};return window;},dimensionsSchema.parse({size:2}),process.cwd());
      try { await scenario.run(1);assert.throws(()=>scenario.verify(1),/did not perform equal checked work/); }
      finally { await scenario.close(); }
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
});

it("keeps unique parser inputs disjoint across independently prepared worker tasks", async () => {
  // Given: persistent workers prepare a new workload for each task but retain parser caches.
  const { spawnSync } = await import("node:child_process");
  const script = `
    import assert from 'node:assert/strict';
    import { JSDOM } from '@run-dom/jsdom';
    import { prepareScenario } from './bench/lab/scenarios.ts';
    import { dimensionsSchema } from './bench/lab/contracts.ts';
    const inputs=[];
    for (const offset of [-4,0,4]) {
      const scenario=prepareScenario('parse-html-unique',markup=>{inputs.push(markup);return new JSDOM(markup).window;},dimensionsSchema.parse({size:2}),process.cwd(),offset);
      try { await scenario.run(4);scenario.verify(4); } finally { await scenario.close(); }
    }
    assert.equal(new Set(inputs).size,12,'Unique inputs repeated across worker tasks');
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
});

it.each(["fragment-table-read", "fragment-list-read"])(
  "checks every wide fragment row in %s",
  async (scenario) => {
    const { spawnSync } = await import("node:child_process");
    const setup = `
    import { JSDOM } from '@run-dom/jsdom';
    import { prepareScenario } from './bench/lab/scenarios.ts';
    import { dimensionsSchema } from './bench/lab/contracts.ts';
    const name = ${JSON.stringify(scenario)};
  `;
    // Given/When/Then: repeated real replacements perform and validate the complete bounded work.
    const correct = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        setup +
          `
    const scenario = prepareScenario(name,markup=>new JSDOM(markup).window,dimensionsSchema.parse({size:3}),process.cwd());
    try { scenario.run(1);scenario.run(2);scenario.verify(3); } finally { await scenario.close(); }
  `,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(correct.status, correct.stderr).toBe(0);
    // Given: a plausible DOM has the right first/last row and count but corrupts an interior value.
    const broken = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        setup +
          `
    const create = markup => {
      const w = new JSDOM(markup).window;
      const target=w.document.getElementById('row0');
      const descriptor=Object.getOwnPropertyDescriptor(w.Element.prototype,'innerHTML');
      Object.defineProperty(target,'innerHTML',{
        get(){return Reflect.apply(descriptor.get,this,[]);},
        set(value){Reflect.apply(descriptor.set,this,[value]);this.children[1].textContent='corrupt';}
      });
      return w;
    };
    const scenario=prepareScenario(name,create,dimensionsSchema.parse({size:3}),process.cwd());
    try{scenario.run(1);scenario.verify(1);}finally{await scenario.close();}
  `,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    // Then: partial first-touch verification cannot qualify this provider's timing evidence.
    expect(broken.status).not.toBe(0);
    expect(broken.stderr).toContain("did not perform equal checked work");
  },
);

it.each(["parse-html-sparse", "parse-html-update"])(
  "rejects incomplete work in %s",
  async (name) => {
    // Given: a real provider, and a second provider that corrupts a checked read or ignores a required write.
    const { spawnSync } = await import("node:child_process");
    const script = `
    import assert from 'node:assert/strict';
    import {JSDOM} from '@run-dom/jsdom';
    import {prepareScenario} from './bench/lab/scenarios.ts';
    import {dimensionsSchema} from './bench/lab/contracts.ts';
    const name=${JSON.stringify(name)};
    for(const corrupt of [false,true]) {
      const create=markup=>{
        const window=new JSDOM(markup).window;
        if(corrupt) {
          if(name==='parse-html-sparse') window.document.getElementById('row1').textContent='wrong';
          else for(const node of window.document.querySelectorAll('.item'))node.setAttribute=()=>{};
        }
        return window;
      };
      const scenario=prepareScenario(name,create,dimensionsSchema.parse({size:3}),process.cwd());
      try {
        await scenario.run(2);
        if(corrupt)assert.throws(()=>scenario.verify(2),/did not perform equal checked work/);
        else scenario.verify(2);
      }finally{await scenario.close();}
    }
  `;
    // When/Then: correct work passes and the intentionally incomplete provider fails the same verifier.
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
  },
);

it("excludes a successful worker that exceeded its elapsed deadline", () => {
  // Given: a suspend/resume can delay timer callbacks until after a worker exits successfully.
  const result = resultSchema.parse({
    version: 1,
    provider: "run-dom",
    scenario: "control",
    mode: "timing",
    dimensions: {},
    phases: [],
    batchesMs: [1],
    memory: [],
    gc: [],
    modules: [],
    verified: true,
  });
  const valid = { round: 0, processMs: 20, timeoutMs: 120000, result };
  const lateSuccess = { round: 1, processMs: 1019875, timeoutMs: 120000, result };
  // When: a completed report is reduced, exit success cannot override the wall-time budget.
  const rows = summarize([valid, lateSuccess], []);
  // Then: the contaminated trial is excluded and the incomplete combination cannot qualify.
  expect(rows).toHaveLength(1);
  expect(rows[0]?.processMs.n).toBe(1);
  expect(rows[0]?.processMs.median).toBe(20);
  expect(rows[0]?.comparable).toBe(false);
});
