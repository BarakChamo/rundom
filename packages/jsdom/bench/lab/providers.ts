// Loads only the selected frozen consumer and normalizes construction, never its DOM semantics.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { z } from "zod";
import type { Dimensions, Provider } from "./contracts.ts";

export type LabWindow = Window & Pick<typeof globalThis, "Event" | "MutationObserver">;
export type Factory = (markup: string) => LabWindow;
const disposals = new WeakMap<LabWindow, () => void | Promise<void>>();
const happyDisposalSchema = z.object({
  happyDOM: z.custom<{ close: () => Promise<void> }>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "close" in value &&
      typeof value.close === "function",
  ),
});
/** Disposes provider-owned resources without replacing browser-facing methods; Happy DOM uses its detached-window API. */
export function closeWindow(window: LabWindow): void | Promise<void> {
  const dispose = disposals.get(window);
  return dispose ? dispose() : window.close();
}
const windowSchema = z.custom<LabWindow>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "document" in value &&
    "close" in value &&
    typeof value.close === "function",
);
const facadeSchema = z.object({
  JSDOM: z.custom<new (markup: string, options: object) => { window: unknown }>(
    (value) => typeof value === "function",
  ),
});
const happySchema = z.object({
  Window: z.custom<new (options: object) => unknown>((value) => typeof value === "function"),
});
const turboSchema = z.object({
  createEnvironment: z.custom<(markup: string) => { window: unknown }>(
    (value) => typeof value === "function",
  ),
});
const roleSchema = z.object({
  getByRole: z.custom<
    (container: HTMLElement, role: string, options: { name: string }) => HTMLElement
  >((value) => typeof value === "function"),
});

/** Loads a pinned provider. Unsupported script modes and malformed exports fail the worker explicitly. */
export async function loadProvider(
  provider: Provider,
  cohort: string,
  dimensions: Dimensions,
): Promise<Factory> {
  if (provider === "run-dom-rust") process.env.RUN_DOM_HTML_PARSER = "rust";
  else delete process.env.RUN_DOM_HTML_PARSER;
  const consumer = provider === "run-dom-rust" ? "run-dom" : provider;
  const require = createRequire(join(cohort, consumer, "package.json"));
  const options = {
    url: "https://example.test/",
    ...(dimensions.scriptMode === "default" ? {} : { runScripts: dimensions.scriptMode }),
  };
  if (provider === "happy-dom") {
    if (dimensions.scriptMode !== "default")
      throw new Error("Happy DOM has no equivalent jsdom runScripts realm contract");
    const { Window } = happySchema.parse(require("happy-dom"));
    return (markup) => {
      const window = windowSchema.parse(new Window(options));
      const { happyDOM } = happyDisposalSchema.parse(window);
      disposals.set(window, () => happyDOM.close());
      window.document.write(markup);
      return window;
    };
  }
  if (provider === "turbo-dom") {
    if (dimensions.scriptMode !== "default")
      throw new Error("TurboDOM script realm parity is not qualified");
    const { createEnvironment } = turboSchema.parse(
      await import(pathToFileURL(join(cohort, consumer, "load-runtime.mjs")).href).then((module) =>
        module.loadRuntime(),
      ),
    );
    return (markup) => windowSchema.parse(createEnvironment(markup).window);
  }
  const { JSDOM } = facadeSchema.parse(require("jsdom"));
  return (markup) => windowSchema.parse(new JSDOM(markup, options).window);
}

/** Loads Testing Library before first role-use timing, recording its cost in scenario setup. */
export function roleQuery(cohort: string) {
  return roleSchema.parse(
    createRequire(join(cohort, "run-dom/package.json"))("@testing-library/dom"),
  ).getByRole;
}
