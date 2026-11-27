// Runs the Window-global fixture under the environment named by RUNDOM_FIXTURE_ENVIRONMENT.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["*.fixture.mjs"],
    environment: process.env.RUNDOM_FIXTURE_ENVIRONMENT,
    environmentOptions: { jsdom: { console: true } },
    pool: process.env.RUNDOM_FIXTURE_POOL ?? "forks",
  },
});
