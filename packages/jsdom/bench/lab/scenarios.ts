// Owns equal-work DOM scenarios and semantic checks across providers; loops never substitute emulated APIs.
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import type { Dimensions, Scenario } from "./contracts.ts";
import type { Factory, LabWindow } from "./providers.ts";
import { closeWindow, roleQuery } from "./providers.ts";

export type Prepared = {
  run: (count: number) => void | Promise<void>;
  verify: (expectedOperations: number) => void;
  close: () => void | Promise<void>;
};

/** Each .item has stable identity and unique text; depth adds ancestors without changing the selected set. */
export function markupFor(size: number, depth: number): string {
  const rows = Array.from(
    { length: size },
    (_, index) => `<p class="item" id="row${index}" data-index="${index}">row${index}</p>`,
  ).join("");
  return `<!doctype html><main id="fixture">${"<section>".repeat(depth)}${rows}${"</section>".repeat(depth)}</main><button>Save</button><input id="check" type="checkbox">`;
}

/** Prepares one bounded workload. All timed operations are checked; failures make the provider ineligible. */
export function prepareScenario(
  scenario: Scenario,
  create: Factory,
  dimensions: Dimensions,
  cohort: string,
  operationOffset = 0,
): Prepared {
  const isTableFragment = scenario === "fragment-table" || scenario === "fragment-table-read";
  const isListFragment = scenario === "fragment-list" || scenario === "fragment-list-read";
  let markup: string;
  if (isTableFragment)
    markup = '<table id="fixture"><tbody id="row0"><tr><td>initial</td></tr></tbody></table>';
  else if (isListFragment) markup = '<main id="fixture"><ul id="row0"><li>initial</li></ul></main>';
  else markup = markupFor(dimensions.size, dimensions.depth);
  let windows: LabWindow[] = [];
  let failures = 0,
    total = 0,
    observed = 0;
  let cleanup = () => {};
  let run: Prepared["run"];
  if (scenario === "control") {
    run = (count) => {
      for (let index = 0; index < count; index++) total++;
    };
  } else if (scenario === "windows-create-close" || scenario.startsWith("parse-html")) {
    run = async (count) => {
      for (let index = 0; index < count; index++) {
        const variant =
          scenario === "parse-html-unique"
            ? String(operationOffset + total)
            : scenario === "parse-html-rotate"
              ? String(total % 4)
              : null;
        const source =
          variant === null
            ? markup
            : markup.replace('id="fixture"', `id="fixture" data-variant="${variant}"`);
        const window = create(scenario === "windows-create-close" ? "" : source);
        try {
          const document = window.document;
          if (!document.body) failures++;
          if (scenario !== "windows-create-close") {
            if (scenario === "parse-html-sparse") {
              for (const row of [0, Math.floor(dimensions.size / 2), dimensions.size - 1]) {
                const node = document.getElementById(`row${row}`);
                if (
                  !node ||
                  node.ownerDocument !== document ||
                  node.textContent !== `row${row}` ||
                  node.getAttribute("data-index") !== String(row)
                )
                  failures++;
              }
              const first = document.getElementById("row0");
              if (!first || document.querySelector(".item") !== first) failures++;
              if (document.getElementById("fixture")?.getAttribute("data-variant") !== variant)
                failures++;
            } else {
              if (scenario === "parse-html-update") {
                for (let edit = 0; edit < Math.min(8, dimensions.size); edit++) {
                  const ordinal = Math.floor(
                    (edit * dimensions.size) / Math.min(8, dimensions.size),
                  );
                  const node = document.getElementById(`row${ordinal}`);
                  if (!node || node.textContent !== `row${ordinal}`) failures++;
                  if (node) {
                    node.setAttribute("data-edited", String(total));
                    node.textContent = `updated${ordinal}`;
                    if (
                      document.getElementById(`row${ordinal}`) !== node ||
                      node.textContent !== `updated${ordinal}` ||
                      node.getAttribute("data-edited") !== String(total)
                    )
                      failures++;
                  }
                }
              }
              const rows = document.querySelectorAll(".item");
              if (rows.length !== dimensions.size) failures++;
              if (document.getElementById("fixture")?.getAttribute("data-variant") !== variant)
                failures++;
              if (scenario === "parse-html-traverse")
                for (let row = 0; row < rows.length; row++) {
                  const node = rows[row];
                  if (
                    !node ||
                    node.ownerDocument !== document ||
                    node.textContent !== `row${row}` ||
                    node.getAttribute("data-index") !== String(row)
                  )
                    failures++;
                }
            }
          }
          total++;
        } finally {
          await closeWindow(window);
        }
      }
    };
  } else {
    const styles =
      scenario === "interaction-state"
        ? '<style>.item{color:blue}.item[data-selected="yes"]{color:red}input:checked{visibility:hidden}</style>'
        : scenario.startsWith("style-") || scenario === "windows-style-live"
          ? "<style>.item{color:rgb(255,0,0)}main{--tone:rgb(0,128,0)}.inherited{color:var(--tone)}</style>"
          : "";
    const hasMultipleWindows = scenario === "windows-live" || scenario === "windows-style-live";
    for (let index = 0; index < (hasMultipleWindows ? dimensions.windows : 1); index++)
      windows.push(create(styles + markup));
    const window = windows[0];
    assert(window, "Expected live window");
    const document = window.document;
    const target = document.getElementById("row0"),
      parent = document.getElementById("fixture");
    assert(target && parent, "Expected fixture nodes");
    const read =
      (operation: (index: number) => boolean): Prepared["run"] =>
      (count) => {
        for (let index = 0; index < count; index++) {
          // Continue across warmup and measured batches so one-operation runs still change state.
          if (!operation(total)) failures++;
          total++;
        }
      };
    switch (scenario) {
      case "list-reconcile":
        run = read((index) => {
          const before = document.querySelectorAll(".item"),
            first = before[0];
          // Eight dispersed edits and one replacement model a small render batch in a long list.
          for (let edit = 0; edit < 8; edit++) {
            const ordinal = (index * 4093 + edit * 17) % dimensions.size;
            const row = document.getElementById(`row${ordinal}`);
            if (!row) return false;
            const value = `${index}:${edit}`;
            row.setAttribute("data-value", value);
            row.textContent = `row${ordinal}:${value}`;
            if (
              row.getAttribute("data-value") !== value ||
              row.textContent !== `row${ordinal}:${value}`
            )
              return false;
          }
          const ordinal = (index * 4093) % dimensions.size;
          const old = document.getElementById(`row${ordinal}`);
          if (!old) return false;
          const replacement = document.createElement("p");
          replacement.id = old.id;
          replacement.className = "item";
          replacement.setAttribute("data-index", String(ordinal));
          replacement.textContent = `replacement${index}`;
          old.replaceWith(replacement);
          return (
            document.getElementById(replacement.id) === replacement &&
            replacement.ownerDocument === document &&
            old.parentNode === null &&
            before.length === dimensions.size &&
            before[0] === first &&
            document.querySelectorAll(".item").length === dimensions.size
          );
        });
        break;
      case "interaction-state": {
        const checkbox = document.getElementById("check");
        assert(checkbox && "checked" in checkbox && "click" in checkbox, "Expected checkbox API");
        let selected = target,
          changes = 0;
        const listener = () => {
          changes++;
          selected.setAttribute("data-selected", checkbox.checked ? "yes" : "no");
        };
        checkbox.addEventListener("change", listener);
        cleanup = () => checkbox.removeEventListener("change", listener);
        run = read((index) => {
          const row = document.getElementById(`row${(index * 4093) % dimensions.size}`);
          if (!row) return false;
          selected = row;
          const previous = checkbox.checked,
            before = changes;
          Reflect.apply(checkbox.click, checkbox, []);
          const checked = !previous;
          return (
            checkbox.checked === checked &&
            changes === before + 1 &&
            row.getAttribute("data-selected") === (checked ? "yes" : "no") &&
            window.getComputedStyle(row).color ===
              (checked ? "rgb(255, 0, 0)" : "rgb(0, 0, 255)") &&
            window.getComputedStyle(checkbox).getPropertyValue("visibility") ===
              (checked ? "hidden" : "visible")
          );
        });
        break;
      }
      case "read-tree":
        run = read(
          () =>
            target.parentNode !== null &&
            target.firstChild?.nodeValue === "row0" &&
            target.textContent === "row0" &&
            target.childNodes.length === 1,
        );
        break;
      case "query-id-hit":
        run = read(() => document.getElementById("row0") === target);
        break;
      case "query-id-miss":
        run = read(() => document.getElementById("absent") === null);
        break;
      case "query-simple":
        run = read(() => document.querySelector(".item") === target);
        break;
      case "query-complex":
        run = read(
          () =>
            document.querySelector('main section > p.item[data-index="0"]:first-child') === target,
        );
        break;
      case "query-all":
        run = read(() => document.querySelectorAll(".item").length === dimensions.size);
        break;
      case "query-all-iterate":
        run = read(() => {
          const results = document.querySelectorAll(".item");
          let sum = 0,
            count = 0;
          for (const member of results) {
            sum += Number(member.getAttribute("data-index"));
            count++;
          }
          return (
            results.item(0) === target &&
            count === dimensions.size &&
            sum === (dimensions.size * (dimensions.size - 1)) / 2
          );
        });
        break;
      case "query-snapshot":
        run = read(() => {
          const before = document.querySelectorAll(".item"),
            fresh = document.querySelectorAll(".item");
          const child = document.createElement("p");
          child.className = "item";
          parent.append(child);
          const after = document.querySelectorAll(".item");
          const correct =
            before !== fresh &&
            before.length === dimensions.size &&
            after.length === dimensions.size + 1 &&
            after.item(dimensions.size) === child &&
            before.item(0) === target;
          child.remove();
          return (
            correct &&
            after.length === dimensions.size + 1 &&
            document.querySelectorAll(".item").length === dimensions.size
          );
        });
        break;
      case "query-after-mutation":
        run = read((index) => {
          target.className = index % 2 ? "item selected" : "item";
          return document.querySelector(".selected") === (index % 2 ? target : null);
        });
        break;
      case "query-diverse":
      case "query-batched-mutation":
        run = read((index) => {
          if (scenario === "query-batched-mutation" && index % 32 === 0)
            target.setAttribute("data-bump", String(index));
          const ordinal = index % dimensions.size;
          const selector = index % 2 ? `.missing-${ordinal}` : `.item#row${ordinal}`;
          const results = document.querySelectorAll(selector);
          const correct =
            index % 2
              ? results.length === 0
              : results.length === 1 && results[0] === document.getElementById(`row${ordinal}`);
          return (
            correct &&
            (scenario !== "query-batched-mutation" ||
              target.getAttribute("data-bump") === String(Math.floor(index / 32) * 32))
          );
        });
        break;
      case "write-attribute":
        run = read((index) => {
          target.setAttribute("data-value", String(index));
          return target.getAttribute("data-value") === String(index);
        });
        break;
      case "write-text":
        run = read((index) => {
          target.textContent = String(index);
          return target.firstChild?.nodeValue === String(index);
        });
        break;
      case "append-remove":
        run = read(() => {
          const child = document.createElement("span");
          target.appendChild(child);
          const attached = target.lastChild === child && child.parentNode === target;
          target.removeChild(child);
          return attached && child.parentNode === null;
        });
        break;
      case "fragment-table":
      case "fragment-table-read":
      case "fragment-list":
      case "fragment-list-read": {
        const tag = isTableFragment ? "tr" : "li";
        const rowMarkup = (ordinal: number) =>
          isTableFragment
            ? `<tr data-row="${ordinal}"><td>${ordinal}</td></tr>`
            : `<li data-row="${ordinal}">${ordinal}</li>`;
        const prefix = Array.from({ length: dimensions.size - 1 }, (_, ordinal) =>
          rowMarkup(ordinal),
        ).join("");
        const lastOrdinal = dimensions.size - 1;
        const fullRead = scenario.endsWith("-read");
        run = read((index) => {
          const previous = target.lastElementChild;
          if (!previous) return false;
          const previousRun = previous.getAttribute("data-run");
          const cell = isTableFragment ? `<td>${lastOrdinal}</td>` : String(lastOrdinal);
          target.innerHTML =
            prefix +
            `<${tag} id="latest" data-row="${lastOrdinal}" data-run="${index}">${cell}</${tag}>`;
          const rows = target.querySelectorAll(tag),
            first = target.firstElementChild,
            last = target.lastElementChild;
          if (rows.length !== dimensions.size || !first || !last) return false;
          const replaced = last !== previous && previous.parentNode === null;
          const heldNodeUnchanged = previous.getAttribute("data-run") === previousRun;
          const currentBounds =
            first.getAttribute("data-row") === "0" &&
            first.textContent === "0" &&
            last.getAttribute("data-run") === String(index) &&
            last.textContent === String(lastOrdinal);
          if (
            !replaced ||
            !heldNodeUnchanged ||
            !currentBounds ||
            document.getElementById("latest") !== last
          )
            return false;
          if (fullRead) {
            let ordinal = 0;
            // The result is bounded by the requested finite row count; every row is read after replacement.
            for (const row of rows) {
              if (
                row.getAttribute("data-row") !== String(ordinal) ||
                row.textContent !== String(ordinal)
              )
                return false;
              ordinal++;
            }
            if (ordinal !== dimensions.size) return false;
          }
          return true;
        });
        break;
      }
      case "fragment-write":
        run = read((index) => {
          target.innerHTML = `<b data-value="${index}">fragment</b><i>end</i>`;
          return (
            target.firstElementChild?.getAttribute("data-value") === String(index) &&
            target.children.length === 2 &&
            target.textContent === "fragmentend"
          );
        });
        break;
      case "clone-subtree":
        run = read(() => {
          const clone = parent.cloneNode(true);
          return clone !== parent && clone.isEqualNode(parent) && clone.parentNode === null;
        });
        break;
      case "serialize":
        run = read(() => {
          const serialized = parent.outerHTML;
          return (
            serialized.includes('id="row0"') &&
            serialized.includes(`id="row${dimensions.size - 1}"`) &&
            serialized.endsWith("</main>")
          );
        });
        break;
      case "events-construct": {
        const probe = new window.Event("lab-screen");
        const descriptor = Object.getOwnPropertyDescriptor(probe, "isTrusted");
        assert(
          descriptor?.get &&
            descriptor.enumerable &&
            !descriptor.configurable &&
            descriptor.set === undefined,
          "Event construction requires the own unforgeable trust getter",
        );
        let previous: Event | undefined;
        let previousTimestamp = -Infinity;
        run = read(() => {
          const event = new window.Event("lab-event", {
            bubbles: true,
            cancelable: true,
            composed: true,
          });
          const correct =
            event !== previous &&
            event.type === "lab-event" &&
            event.bubbles &&
            event.cancelable &&
            event.composed &&
            event.isTrusted === false &&
            Number.isFinite(event.timeStamp) &&
            event.timeStamp >= previousTimestamp &&
            event.target === null &&
            event.currentTarget === null &&
            event.eventPhase === 0;
          previous = event;
          previousTimestamp = event.timeStamp;
          return correct;
        });
        break;
      }
      case "events-redispatch": {
        const event = new window.Event("lab-event", { bubbles: true, cancelable: true });
        const listener = (received: Event) => {
          if (
            received === event &&
            received.target === target &&
            received.currentTarget === parent &&
            received.eventPhase === 3 &&
            received.isTrusted === false
          )
            observed++;
        };
        parent.addEventListener("lab-event", listener);
        cleanup = () => parent.removeEventListener("lab-event", listener);
        run = read(() => {
          const before = observed;
          return (
            target.dispatchEvent(event) &&
            observed === before + 1 &&
            event.target === target &&
            event.currentTarget === null &&
            event.eventPhase === 0 &&
            !event.defaultPrevented &&
            !event.isTrusted
          );
        });
        break;
      }
      case "events-dispatch": {
        const listener = (event: Event) => {
          if (event.target === target) observed++;
        };
        parent.addEventListener("lab-event", listener);
        cleanup = () => parent.removeEventListener("lab-event", listener);
        run = read(() => {
          const before = observed;
          target.dispatchEvent(new window.Event("lab-event", { bubbles: true }));
          return observed === before + 1;
        });
        break;
      }
      case "events-default-action": {
        const checkbox = document.getElementById("check");
        assert(checkbox && "checked" in checkbox && "click" in checkbox, "Expected checkbox API");
        run = read(() => {
          const before = checkbox.checked;
          Reflect.apply(checkbox.click, checkbox, []);
          return checkbox.checked === !before && !checkbox.hasAttribute("checked");
        });
        break;
      }
      case "mutation-observer": {
        const observer = new window.MutationObserver((records) => {
          observed += records.length;
        });
        observer.observe(target, { attributes: true });
        cleanup = () => observer.disconnect();
        run = async (count) => {
          const before = observed;
          for (let index = 0; index < count; index++) {
            target.setAttribute("data-observed", String(total++));
          }
          await setImmediate();
          if (observed !== before + count) failures++;
        };
        break;
      }
      case "style-snapshot":
        run = read(() => {
          const before = window.getComputedStyle(target),
            fresh = window.getComputedStyle(target);
          const initial = before.color;
          target.style.color = "rgb(0, 0, 255)";
          const after = window.getComputedStyle(target);
          const correct =
            before !== fresh &&
            initial === "rgb(255, 0, 0)" &&
            before.color === "rgb(0, 0, 255)" &&
            fresh.color === "rgb(0, 0, 255)" &&
            after.color === "rgb(0, 0, 255)";
          target.style.color = "";
          return (
            correct &&
            after.color === "rgb(255, 0, 0)" &&
            window.getComputedStyle(target).color === "rgb(255, 0, 0)"
          );
        });
        break;
      case "style-read":
        run = read(() => window.getComputedStyle(target).color === "rgb(255, 0, 0)");
        break;
      case "style-inline-invalidation":
        run = read((index) => {
          const color = index % 2 ? "rgb(0, 128, 0)" : "rgb(0, 0, 255)";
          target.style.color = color;
          return window.getComputedStyle(target).color === color;
        });
        break;
      case "style-rule-invalidation": {
        const rule = document.styleSheets[0]?.cssRules[0];
        assert(rule && "style" in rule, "Expected CSSStyleRule");
        const declaration = rule.style;
        assert(
          declaration &&
            typeof declaration === "object" &&
            "setProperty" in declaration &&
            typeof declaration.setProperty === "function",
          "Expected rule declaration",
        );
        const setProperty = declaration.setProperty.bind(declaration);
        run = read((index) => {
          const color = index % 2 ? "rgb(0, 128, 0)" : "rgb(0, 0, 255)";
          setProperty("color", color);
          return window.getComputedStyle(target).color === color;
        });
        break;
      }
      case "style-inheritance": {
        target.className = "item inherited";
        run = read((index) => {
          const color = index % 2 ? "rgb(0, 128, 0)" : "rgb(0, 0, 255)";
          parent.style.setProperty("--tone", color);
          return window.getComputedStyle(target).color === color;
        });
        break;
      }
      case "role-query": {
        const getByRole = roleQuery(cohort),
          expected = document.querySelector("button");
        assert(expected, "Expected role target");
        run = read(() => getByRole(document.body, "button", { name: "Save" }) === expected);
        break;
      }
      case "windows-live":
      case "windows-style-live":
        run = read((index) => {
          const selected = windows[index % windows.length];
          if (!selected) return false;
          const item = selected.document.getElementById("row0");
          if (!item) return false;
          item.setAttribute("data-window", String(index));
          return (
            item.ownerDocument === selected.document &&
            item.getAttribute("data-window") === String(index) &&
            (scenario !== "windows-style-live" ||
              selected.getComputedStyle(item).color === "rgb(255, 0, 0)")
          );
        });
        break;
      default:
        throw new Error(`Unimplemented scenario: ${scenario}`);
    }
  }
  return {
    run,
    verify: (expectedOperations) => {
      assert.equal(total, expectedOperations, "Scenario completed a different operation count");
      assert(total > 0, "Workload performed no operations");
      assert.equal(failures, 0, `Scenario ${scenario} did not perform equal checked work`);
    },
    close: async () => {
      cleanup();
      await Promise.all(windows.map((window) => closeWindow(window)));
      // Retain closed handles until the caller releases this prepared workload.
    },
  };
}
