// Pins the opt-in RunDOM Vitest environment: built-in parity inside real Vitest runs, lazy Window reads, and teardown.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import environment from "../src/vitest-environment.mjs";

const fixture = fileURLToPath(new URL("./fixtures/vitest-environment/", import.meta.url));
const vitest = fileURLToPath(new URL("../../../node_modules/vitest/vitest.mjs", import.meta.url));
const runDomEnvironment = createRequire(import.meta.url).resolve(
  "@run-dom/jsdom/vitest-environment",
);

interface FixtureRun {
  status: number | null;
  output: string;
  report: unknown;
}

function runFixture(environmentName: string, pool: string): FixtureRun {
  const report = join(mkdtempSync(join(tmpdir(), "rundom-environment-")), "report.json");
  const result = spawnSync(process.execPath, [vitest, "run", "--root", fixture], {
    cwd: fixture,
    encoding: "utf8",
    timeout: 120000,
    env: {
      ...process.env,
      NODE_OPTIONS: `--import=${join(fixture, "jsdom-alias.mjs")}`,
      RUNDOM_FIXTURE_ENVIRONMENT: environmentName,
      RUNDOM_FIXTURE_POOL: pool,
      RUNDOM_FIXTURE_REPORT: report,
      VITEST: "",
      VITEST_POOL_ID: "",
      VITEST_WORKER_ID: "",
    },
  });
  return {
    status: result.status,
    output: result.stdout + result.stderr,
    report: JSON.parse(readFileSync(report, "utf8")),
  };
}

type TestGlobal = Record<string, unknown>;

async function setUp(global: TestGlobal, reads: { count: number }) {
  return environment.setup(global, {
    jsdom: {
      beforeParse(window: object) {
        Object.defineProperty(window, "probeGlobal", {
          configurable: true,
          get() {
            reads.count++;
            return "probe value";
          },
        });
      },
    },
  });
}

describe("RunDOM Vitest environment", () => {
  it.each(["forks", "threads"])(
    "matches the built-in jsdom environment's globals in a %s Vitest run",
    (pool) => {
      // Given: one fixture file pinning `in`, typeof, assignment, stubGlobal, Object.keys and JSDOM defaults
      // When: Vitest runs it under the built-in environment aliased to RunDOM and under the RunDOM environment
      const builtIn = runFixture("jsdom", pool);
      const runDom = runFixture(runDomEnvironment, pool);
      // Then: both pass, forward Window console output, and expose identical global descriptor shapes
      expect(builtIn.status, builtIn.output).toBe(0);
      expect(runDom.status, runDom.output).toBe(0);
      expect(builtIn.output).toContain("rundom-forwarded-console");
      expect(runDom.output).toContain("rundom-forwarded-console");
      expect(runDom.report).toEqual(builtIn.report);
    },
    240000,
  );

  it("reads a Window-only global on first use, not during setup", async () => {
    // Given: a Window property that counts its reads
    const global: TestGlobal = {};
    const reads = { count: 0 };
    const { teardown } = await setUp(global, reads);
    try {
      // When: setup finished and the global is probed without being read
      const descriptor = Object.getOwnPropertyDescriptor(global, "probeGlobal");
      // Then: `in`, descriptors and Object.keys never read the Window
      expect("probeGlobal" in global).toBe(true);
      expect(descriptor).toMatchObject({ enumerable: false, configurable: true });
      expect(typeof descriptor?.get).toBe("function");
      expect(Object.keys(global)).not.toContain("probeGlobal");
      expect(reads.count).toBe(0);
      expect(typeof global["probeGlobal"]).toBe("string");
      expect(global["probeGlobal"]).toBe("probe value");
      expect(reads.count).toBe(2);
    } finally {
      teardown(global);
    }
  });

  it("writes assigned globals through to the Window", async () => {
    // Given: a set-up test global
    const global: TestGlobal = {};
    const { teardown } = await setUp(global, { count: 0 });
    const window = (global["jsdom"] as { window: TestGlobal }).window;
    try {
      // When: a test replaces a Window method before ever reading it
      const mock = () => ({ matches: true });
      global["matchMedia"] = mock;
      // Then: the global and the Window both return the replacement
      expect(global["matchMedia"]).toBe(mock);
      expect(window["matchMedia"]).toBe(mock);
    } finally {
      teardown(global);
    }
  });

  it("restores prior descriptors and removes Window globals on teardown", async () => {
    // Given: a test global that already defines Event, and a never-read Window global
    const original = { value: "host Event", writable: false, enumerable: true, configurable: true };
    const global: TestGlobal = {};
    Object.defineProperty(global, "Event", original);
    const reads = { count: 0 };
    const { teardown } = await setUp(global, reads);
    expect(global["Event"]).not.toBe("host Event");
    // When: the environment is torn down
    teardown(global);
    // Then: the original descriptor returns, Window globals and `jsdom` are gone, and nothing was read
    expect(Object.getOwnPropertyDescriptor(global, "Event")).toEqual(original);
    expect("probeGlobal" in global).toBe(false);
    expect("document" in global).toBe(false);
    expect("jsdom" in global).toBe(false);
    expect(reads.count).toBe(0);
  });
});
