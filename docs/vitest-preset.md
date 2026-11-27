# Vitest preset

Opt-in settings that cut per-file start cost when a suite runs on RunDOM. The drop-in path
(`environment: 'jsdom'` with RunDOM installed or aliased as `jsdom`) is unchanged; nothing here applies unless
a project configures it.

## Lazy-global environment

`@run-dom/jsdom/vitest-environment` is a Vitest environment that behaves like Vitest's built-in `jsdom`
environment (Vitest 5.1.0; also runs on 4.1) but does not read every Window global per test file.

```ts
// vitest.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vitest loads custom environments by path when the name starts with "." or "/".
    environment: fileURLToPath(import.meta.resolve("@run-dom/jsdom/vitest-environment")),
    environmentOptions: { jsdom: { url: "http://localhost:3000" } },
  },
});
```

Use the `forks` or `threads` pool. The environment has no `setupVM`, so `vmForks` and `vmThreads` reject it;
those pools never populate globals and keep using the built-in environment. On Windows, Vitest only treats a
name as a path when it starts with `.` or `/`, so pass a relative path such as
`./node_modules/@run-dom/jsdom/src/vitest-environment.mjs`.

Same as the built-in environment: `environmentOptions.jsdom` options and defaults (`html` `<!DOCTYPE html>`,
`url` `http://localhost:3000`, `pretendToBeVisual` true, `runScripts` `dangerously`, `console` forwarding,
`cookieJar`, `userAgent`), `globalThis.jsdom`, the key list and key selection, `window`/`self`/`top`/`parent`
and `document.defaultView` pointing at the test global, error-event forwarding, the `AbortSignal` listener patch,
the `Request`/`URL` Blob compatibility classes, and teardown. A fixture run under both environments yields
identical descriptors for every own property of the test global.

Different: each Window-only key (about 480 of 504, such as `HTMLElement` or `CSSFunctionDescriptors`) is read
from the Window on first use. Keys the host global already defines (about 25: `Event`, `EventTarget`,
`DOMException`, `FormData`, `Blob`, `File`, `WebSocket`, `navigator`, typed arrays) are still read at setup,
because RunDOM Window getters read host classes such as `FormData` from `globalThis` and would otherwise see
their own accessor.

| Operation on a Window global                    | Behavior                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `key in globalThis`, `getOwnPropertyDescriptor` | Configurable, non-enumerable accessor; the Window is not read.                                       |
| first read (`typeof`, `globalThis.key`)         | Reads the Window. Lower-case functions are bound to the Window once and that bound function is kept. |
| later reads                                     | The bound function, or a live read of the Window for every other value.                              |
| `globalThis.key = value`                        | Later reads return `value`; the value is also assigned to the Window.                                |
| `vi.stubGlobal` / `vi.unstubAllGlobals`         | Vitest saves and restores the accessor descriptor; an unread global stays unread.                    |
| `Object.keys(globalThis)`                       | Window globals are not listed.                                                                       |
| teardown                                        | Every accessor is deleted and prior descriptors are restored; unread globals are never read.         |

The one observable timing difference: the built-in environment binds Window methods during setup, this one on
first read, so a test that replaces `jsdom.window.someMethod` directly before first reading the global sees its
replacement through the global.

`test/vitest-environment.test.ts` pins these rules, running `test/fixtures/vitest-environment` under both
environments in the `forks` and `threads` pools.

## Process settings

| Setting                                     | How                                                               | Notes                                                                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node compile cache                          | `NODE_COMPILE_CACHE=node_modules/.cache/node-compile vitest`      | Worker threads and forks inherit it; Vitest flushes each worker's cache on stop. Vitest drops it in forks when V8 coverage is on; do not set it for threads with V8 coverage. |
| 16 MiB young-generation semi-space, forks   | `test: { pool: "forks", execArgv: ["--max-semi-space-size=16"] }` | Applies per child process.                                                                                                                                                    |
| 16 MiB young-generation semi-space, threads | `NODE_OPTIONS=--max-semi-space-size=16 vitest`                    | V8 heap flags are per process; `execArgv` on the `threads` pool has no effect on RSS.                                                                                         |
| Pool                                        | Keep the project's pool                                           | `forks` and `threads` measured within noise of each other here.                                                                                                               |

## Measurements

Host: Node 24.22.3, macOS, shared machine; instructions retired from `/usr/bin/time -l` are the primary figure.

Environment setup for one test file, fresh process, default options, 5 runs (medians, setup only):
built-in `jsdom` aliased to RunDOM 1,476 M instructions and 158 ms CPU; lazy environment 1,011 M instructions and
108 ms CPU (-31%); modules loaded 90 versus 86. With a small DOM test after setup: 1,929 M versus 1,483 M
instructions per process.

Vue `runtime-dom` selection (16 files, `threads`, one worker, Vitest 4.1.11, RunDOM candidate), 5 runs, medians:

| Variant                                   | Instructions     | Peak RSS       |
| ----------------------------------------- | ---------------- | -------------- |
| built-in environment                      | 42,496 M         | 418 MiB        |
| lazy environment                          | 39,658 M (-6.7%) | 410 MiB        |
| `NODE_COMPILE_CACHE` (warm)               | 40,377 M (-5.0%) | 402 MiB        |
| `--max-semi-space-size=16` (NODE_OPTIONS) | 42,179 M (-0.7%) | 324 MiB (-22%) |
| all three (3 runs)                        | 37,453 M (-12%)  | 318 MiB (-24%) |

All variants fail the same 6 of 271 tests as the built-in baseline. `forks` versus `threads` CPU time overlapped
across 7 alternating runs (7.9-12.9 s versus 7.0-12.0 s).

## Startup snapshot spike (no-go)

A Node user-land startup snapshot (`node --build-snapshot`) holding the loaded RunDOM bundle does not work on
Node 24.22.3:

- `SharedArrayBuffer` and `Float16Array` are absent while building a snapshot, and the DOM bundle captures both in
  its realm-intrinsics table at load. Shimming them builds a 10.8 MB blob, but shims would change those
  intrinsics.
- The blob then fails to start (`ERR_INTERNAL_ASSERTION` in `initializeModuleLoaders`): snapshots support only
  built-in modules, and RunDOM loads its graph through `createRequire` (about 20 sites, lazy CSS runtime artifacts
  with V8 code cache, undici and the native parser loader). A usable snapshot needs one loader-free bundle of the
  whole graph, which is a `packages/dom` build change.
- A blob is valid only for the exact Node binary and V8 flags that built it, so it must be rebuilt per Node
  version and per flag set (`--max-semi-space-size` included).

The upper bound on the gain is the bundle load plus one Window, about 62 ms CPU per fresh process before the
compile cache. Revisit if Node snapshots gain user-land module support.
