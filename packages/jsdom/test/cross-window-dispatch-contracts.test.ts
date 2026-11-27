// Pins dispatch observables when events, listeners, prototypes and nodes come from different Windows.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

type Win = JSDOM["window"];
type AnyEvent = InstanceType<Win["Event"]>;

const markup =
  "<main id=root><section id=mid><p id=leaf></p></section></main>" +
  "<label id=label><input id=box type=checkbox></label>" +
  "<form id=form><button id=submit>Go</button></form><div id=host></div>";

function byId(window: Win, id: string): InstanceType<Win["HTMLElement"]> {
  const found = window.document.getElementById(id);
  if (!found) throw new Error(`Expected #${id}`);
  return found as InstanceType<Win["HTMLElement"]>;
}

/** Names a node by id, nodeName or Window so logs compare across implementations. */
function name(windows: readonly Win[], value: unknown): string {
  if (value === null || value === undefined) return String(value);
  const index = windows.indexOf(value as Win);
  if (index !== -1) return `window${index}`;
  const node = value as { id?: string; nodeName?: string; host?: unknown };
  if (node.host) return `shadow(${name(windows, node.host)})`;
  return node.id ? `#${node.id}` : (node.nodeName ?? "?");
}

/** Records target, currentTarget, phase and composed path as each listener runs. */
function step(windows: readonly Win[], label: string, event: AnyEvent): string {
  const path = event
    .composedPath()
    .map((item) => name(windows, item))
    .join(">");
  return `${label}:${name(windows, event.target)}@${name(windows, event.currentTarget)}:${event.eventPhase}:${path}`;
}

/** Runs a scenario over two fresh Windows of one implementation and returns its log. */
function scenario(
  Constructor: typeof JSDOM,
  body: (a: Win, b: Win, log: string[]) => void,
): string[] {
  const options = { runScripts: "outside-only" as const };
  const a = new Constructor(markup, options).window;
  const b = new Constructor(markup, options).window;
  try {
    const log: string[] = [];
    body(a, b, log);
    return log;
  } finally {
    a.close();
    b.close();
  }
}

/** Adds a listener through the given Window's EventTarget prototype. */
function listen(
  through: Win,
  target: object,
  type: string,
  listener: unknown,
  options?: unknown,
): void {
  Reflect.apply(through.EventTarget.prototype.addEventListener, target, [type, listener, options]);
}

/** Dispatches through the given Window's Node prototype, which owns the event path. */
function dispatch(through: Win, target: object, event: AnyEvent): boolean {
  return Reflect.apply(through.Node.prototype.dispatchEvent, target, [event]) as boolean;
}

function expectParity(body: (a: Win, b: Win, log: string[]) => void): string[] {
  const actual = scenario(JSDOM, body);
  expect(actual).toEqual(scenario(Reference, body));
  return actual;
}

describe("EventTarget.dispatchEvent across Windows", () => {
  it("reports target, currentTarget, phase and composed path at each step for a foreign event", () => {
    const log = expectParity((a, b, log) => {
      // Given: capture and bubble listeners from both Windows on Window B's path.
      const windows = [a, b];
      const leaf = byId(b, "leaf");
      for (const [index, through] of windows.entries())
        for (const node of [b, byId(b, "root"), leaf]) {
          listen(
            through,
            node,
            "x",
            (e: AnyEvent) => log.push(step(windows, `c${index}`, e)),
            true,
          );
          listen(through, node, "x", (e: AnyEvent) => log.push(step(windows, `b${index}`, e)));
        }
      // When: an event created in Window A is dispatched through Window A's prototype on B's node.
      const event = new a.MouseEvent("x", { bubbles: true, cancelable: true });
      log.push(`result:${dispatch(a, leaf, event)}`);
      // Then: the walk is the same as jsdom's, and the event is reset afterward.
      log.push(step(windows, "after", event));
    });
    expect(log).toHaveLength(14);
  });

  it("stops propagation, stops immediately and ignores preventDefault in passive listeners", () => {
    expectParity((a, b, log) => {
      // Given: a passive listener that cancels, a stopper and an immediate stopper on two levels.
      const windows = [a, b];
      const mid = byId(b, "mid");
      const leaf = byId(b, "leaf");
      listen(
        a,
        leaf,
        "x",
        (e: AnyEvent) => {
          e.preventDefault();
          log.push(`passive:${e.defaultPrevented}`);
        },
        { passive: true },
      );
      listen(b, leaf, "x", (e: AnyEvent) => {
        e.stopImmediatePropagation();
        log.push(step(windows, "immediate", e));
      });
      listen(a, leaf, "x", () => log.push("skipped"));
      listen(a, mid, "y", (e: AnyEvent) => e.stopPropagation(), true);
      listen(b, leaf, "y", () => log.push("never"));
      // When: both events are dispatched from the other Window.
      log.push(`x:${dispatch(a, leaf, new a.Event("x", { bubbles: true, cancelable: true }))}`);
      log.push(`y:${dispatch(b, leaf, new a.Event("y", { bubbles: true }))}`);
    });
  });

  it("honours once, signal aborts, handleEvent objects and listener edits during dispatch", () => {
    expectParity((a, b, log) => {
      // Given: once, signal-bound and handleEvent listeners, one of which edits the list.
      const leaf = byId(b, "leaf");
      const controller = new a.AbortController();
      const late = () => log.push("late");
      const removed = () => log.push("removed");
      listen(a, leaf, "x", () => log.push("once"), { once: true });
      listen(b, leaf, "x", () => log.push("signal"), { signal: controller.signal });
      listen(a, leaf, "x", {
        handleEvent(e: AnyEvent) {
          log.push(`handle:${e.currentTarget === leaf}`);
          controller.abort();
          listen(b, leaf, "x", late);
          Reflect.apply(a.EventTarget.prototype.removeEventListener, leaf, ["x", removed]);
        },
      });
      listen(b, leaf, "x", removed);
      // When: the event is dispatched twice.
      dispatch(b, leaf, new a.Event("x"));
      dispatch(a, leaf, new b.Event("x"));
    });
  });

  it("walks an iframe document and a shadow tree with retargeting through another Window", () => {
    expectParity((a, b, log) => {
      // Given: a click listener on an iframe document and on a shadow host's ancestors.
      const windows = [a, b];
      const frame = b.document.createElement("iframe") as InstanceType<Win["HTMLIFrameElement"]>;
      byId(b, "root").append(frame);
      const inner = frame.contentDocument;
      if (!inner) throw new Error("Expected an iframe document");
      listen(a, inner, "x", (e: AnyEvent) =>
        log.push(`frame:${e.eventPhase}:${e.composedPath().length}`),
      );
      const host = byId(b, "host");
      const shadow = host.attachShadow({ mode: "open" });
      const span = b.document.createElement("span");
      shadow.append(span);
      for (const node of [span, shadow, host, byId(b, "root").parentElement ?? host])
        listen(a, node, "x", (e: AnyEvent) => log.push(step(windows, "s", e)));
      // When: composed and uncomposed events from Window A are dispatched.
      dispatch(
        b,
        (inner as InstanceType<Win["Document"]>).body ?? inner,
        new a.Event("x", { bubbles: true }),
      );
      dispatch(a, span, new a.Event("x", { bubbles: true, composed: true }));
      dispatch(a, span, new a.Event("x", { bubbles: true }));
      log.push(step(windows, "after", new a.Event("x")));
    });
  });

  it("runs click activation for checkbox, label and submit button with foreign events", () => {
    expectParity((a, b, log) => {
      // Given: Window B's checkbox, label and submit button with a submit listener.
      const box = byId(b, "box") as InstanceType<Win["HTMLInputElement"]>;
      const form = byId(b, "form");
      listen(a, form, "submit", (e: AnyEvent) => {
        e.preventDefault();
        log.push("submit");
      });
      listen(a, box, "change", () => log.push(`change:${box.checked}`));
      // When: Window A's click events are dispatched, and one is canceled.
      dispatch(a, box, new a.MouseEvent("click", { bubbles: true, cancelable: true }));
      dispatch(a, byId(b, "label"), new a.MouseEvent("click", { bubbles: true, cancelable: true }));
      const canceled = new a.MouseEvent("click", { bubbles: true, cancelable: true });
      listen(a, box, "click", (e: AnyEvent) => e.preventDefault(), { once: true });
      dispatch(b, box, canceled);
      dispatch(
        a,
        byId(b, "submit"),
        new a.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      // Then: checkedness and submission match jsdom.
      log.push(`checked:${box.checked}`);
    });
  });
});
