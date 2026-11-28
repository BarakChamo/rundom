// Declares the opt-in RunDOM Vitest environment.

/**
 * Vitest `environmentOptions.jsdom`: every JSDOM constructor option plus `html`, `console`, `cookieJar` and
 * `userAgent`, with the built-in jsdom environment's defaults.
 */
export type RunDomEnvironmentOptions = Readonly<Record<string, unknown>>;

/** Vitest environment object; Vitest calls `setup` once per test file and `teardown` after it. */
declare const environment: {
  name: "rundom";
  viteEnvironment: "client";
  setup: (
    global: object,
    options: { jsdom?: RunDomEnvironmentOptions },
  ) => Promise<{ teardown: (global: object) => void }>;
};
export default environment;
