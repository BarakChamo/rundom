# RunDOM

RunDOM is a headless DOM for Node.js test suites that use jsdom. Its purpose is to reduce the time and memory spent on checks in an agentic software development lifecycle. Each coding agent may run the same component tests several times while editing and verifying a change. When several agents work in parallel, their test workers also keep separate DOM environments in memory at the same time. Faster checks shorten each feedback loop. Lower peak memory per worker leaves room to run more checks concurrently.

## Use RunDOM with existing tests

Download the [RunDOM v0.0.1 bundle](https://github.com/BarakChamo/rundom/releases/download/v0.0.1/run-dom-0.0.1.tar.gz). From your test project, extract its three npm tarballs and install the facade under the name `jsdom` so existing imports and test-runner configuration keep working. The commands below use Node.js 24 and npm.

```sh
mkdir -p vendor/run-dom
tar -xzf /path/to/run-dom-0.0.1.tar.gz -C vendor/run-dom
npm install --save-dev jsdom@file:./vendor/run-dom/jsdom.tgz ./vendor/run-dom/dom.tgz ./vendor/run-dom/html-parser.tgz
```

```js
import { JSDOM } from "jsdom";

const dom = new JSDOM("<button>Apply</button>");
console.log(dom.window.document.querySelector("button").textContent); // Apply
dom.window.close();
```

Use the **[jsdom documentation](https://github.com/jsdom/jsdom#readme)** for the API, constructor options and examples. RunDOM aims to match jsdom’s observable behavior. The development build passed the same 672 API tests as jsdom 31.0.1. RunDOM passes every Svelte case that passed on jsdom in the tested selection. Web Platform Tests still show compatibility gaps. [Version-specific compatibility and benchmark results](docs/jsdom-31-css-qualification.md)

## Measured time and memory

These are median end-to-end times with one test worker on Node.js 24 and Apple M4. Peak RSS measures the memory high-water mark for each run. RunDOM and jsdom completed the same tests in each row.

| Upstream selection    |  RunDOM |   jsdom | RunDOM peak RSS relative to jsdom |
| --------------------- | ------: | ------: | --------------------------------: |
| Vue runtime-dom       |  2.58 s |  6.30 s |                     124 MiB lower |
| Ant Design, 8 files   |  4.92 s |  6.56 s |                      46 MiB lower |
| Material UI, 10 files | 16.43 s | 21.64 s |                     54 MiB higher |

The [full benchmark report](docs/real-project-benchmarks-direct-css.md) gives the results across 11 projects, test counts and methodology. The [performance laboratory](docs/performance-lab.md) also provides a separate parallel-worker benchmark.

## Develop and test RunDOM

| Command                             | Use                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`     | Install locked workspace dependencies.                                                      |
| `bun run check`                     | Check formatting, build both tracks, typecheck, lint, and run local tests.                  |
| `bun run build`                     | Build the Node facade and Rust crate.                                                       |
| `bun run test`                      | Run local contracts through the built facade and Rust crate.                                |
| `bun run conformance:api candidate` | Run the pinned upstream API suite against the facade.                                       |
| `bun run conformance:types`         | Compile and execute clean packed TypeScript consumers in ESM/CommonJS; check bundler types. |
| `bun run conformance:vitest`        | Install a packed jsdom alias and check binary and React workflows in all four Vitest pools. |
| `bun run benchmark`                 | Run the checked startup and warm DOM smoke benchmark in fresh Node processes.               |
| `bun run benchmark:framework`       | Compare eight checked React workflows on all three providers in all four Vitest pools.      |
| `bun run format`                    | Format TypeScript, configuration, and Markdown.                                             |
| `cargo fmt --all`                   | Format Rust.                                                                                |

The facade implements HTML and XML documents, Window realms, events, selectors and CSSOM, forms, shadow DOM and custom elements, frames, and resource loading. Compatibility qualification is in progress. Upstream API tests, legacy suites, Web Platform Tests, and runner integration are separate gates. The Rust track supplies an explicitly selected inactive HTML parsing kernel over the canonical Rust topology. TypeScript remains the default parser; native coverage, fallbacks and current packaging limits are documented in [the parser package](packages/html-parser/README.md). See the [project guide](docs/project-guide.md) for the workspace map and qualification criteria.

[Qualification status](docs/qualification.md) records measured compatibility scope, performance limits, and the next subsystem boundary.

Set `RUN_DOM_HTML_PARSER=rust` before loading the facade to exercise eligible inactive document parsing. `bun run conformance:native` compares the native kernel with pinned parser trees. Native speed and general release portability remain under qualification.

The [performance laboratory](docs/performance-lab.md) provides `bun run benchmark:lab prepare`, then `run`, `compare`, `profile`, `memory` and `parallel` against a frozen cohort. It covers checked reads/writes/queries/events/styles, first and repeated operations, multiple windows, CPU/allocation attribution and lifetime checkpoints.

Measured findings and the next implementation batch are recorded in [performance evidence](docs/performance-lab-results.md) and the [remaining TurboDOM gaps](docs/remaining-turbodom-optimization-plan.md).
