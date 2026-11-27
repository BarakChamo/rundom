// Pins dispatch observables that a listener-free fast path or cheaper event construction could break.
import { createRequire } from "node:module";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";
const { JSDOM: Reference }: { JSDOM: typeof JSDOM } = createRequire(import.meta.url)("jsdom");

type TestWindow = JSDOM["window"];
type TestEvent = InstanceType<TestWindow["Event"]>;

function element(window: TestWindow, id: string) {
  const found = window.document.getElementById(id);
  if (!(found instanceof window.HTMLElement)) throw new Error(`Expected #${id}`);
  return found;
}

function input(window: TestWindow, id: string) {
  const found = window.document.getElementById(id);
  if (!(found instanceof window.HTMLInputElement)) throw new Error(`Expected input #${id}`);
  return found;
}

describe.each([
  { name: "RunDOM", Constructor: JSDOM },
  { name: "jsdom", Constructor: Reference },
])("$name EventTarget.dispatchEvent", ({ Constructor }) => {
  it("delivers to a listener that an earlier listener adds on a later path node", () => {
    // Given: only the target listens, and it registers a listener on an ancestor while dispatching.
    const { window } = new Constructor("<main id=m><p id=p></p></main>");
    try {
      const main = element(window, "m");
      const p = element(window, "p");
      const seen: string[] = [];
      p.addEventListener("probe", () => {
        seen.push("target");
        main.addEventListener("probe", (event: TestEvent) => seen.push(`main:${event.eventPhase}`));
      });
      // When: a bubbling event is dispatched at the target.
      p.dispatchEvent(new window.Event("probe", { bubbles: true }));
      // Then: the late listener runs during the bubbling phase of the same dispatch.
      expect(seen).toEqual(["target", "main:3"]);
    } finally {
      window.close();
    }
  });

  it("runs an event handler attribute set on an ancestor during dispatch", () => {
    // Given: a target listener that installs an onclick content attribute on its parent.
    const { window } = new Constructor("<main id=m><p id=p></p></main>", {
      runScripts: "dangerously",
    });
    try {
      const main = element(window, "m");
      const p = element(window, "p");
      p.addEventListener("click", () => main.setAttribute("onclick", "this.dataset.hit = 'yes'"));
      // When: a bubbling click is dispatched at the target.
      p.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      // Then: the handler compiled during dispatch receives the bubbling event.
      expect(main.dataset["hit"]).toBe("yes");
    } finally {
      window.close();
    }
  });

  it("delivers to a capture-only window listener when no node listens", () => {
    // Given: a deep target whose only listener is a capturing window listener.
    const { window } = new Constructor("<main><section><p id=p></p></section></main>");
    try {
      const p = element(window, "p");
      const seen: unknown[] = [];
      window.addEventListener(
        "probe",
        (event) => seen.push(event.currentTarget === window, event.eventPhase, event.target === p),
        true,
      );
      // When: a non-bubbling event is dispatched at the target.
      const result = p.dispatchEvent(new window.Event("probe"));
      // Then: the window captures it and the dispatch result is uncanceled.
      expect(seen).toEqual([true, 1, true]);
      expect(result).toBe(true);
    } finally {
      window.close();
    }
  });

  it("retargets or clears shadow targets after a listener-free dispatch", () => {
    // Given: a node inside an open shadow root with no listeners anywhere.
    const { window } = new Constructor("<div id=host></div>");
    try {
      const host = element(window, "host");
      const inner = window.document.createElement("span");
      host.attachShadow({ mode: "open" }).append(inner);
      const composed = new window.Event("probe", { bubbles: true, composed: true });
      const local = new window.Event("probe", { bubbles: true });
      // When: composed and non-composed events are dispatched from inside the shadow tree.
      const results = [inner.dispatchEvent(composed), inner.dispatchEvent(local)];
      // Then: the composed event keeps its retargeted host, the local one clears its target.
      expect(results).toEqual([true, true]);
      expect(composed.target).toBe(host);
      expect(local.target).toBeNull();
      expect(local.srcElement).toBeNull();
      for (const event of [composed, local]) {
        expect(event.currentTarget).toBeNull();
        expect(event.eventPhase).toBe(0);
        expect(event.composedPath()).toEqual([]);
      }
    } finally {
      window.close();
    }
  });

  it("keeps the light-tree target and an empty composed path after a listener-free dispatch", () => {
    // Given: a deep light-tree target with no listeners.
    const { window } = new Constructor("<main><section><p id=p></p></section></main>");
    try {
      const p = element(window, "p");
      const event = new window.Event("probe", { bubbles: true, cancelable: true });
      // When: the event is dispatched twice.
      const results = [p.dispatchEvent(event), p.dispatchEvent(event)];
      // Then: the target persists while path, phase and current target are reset.
      expect(results).toEqual([true, true]);
      expect(event.target).toBe(p);
      expect(event.srcElement).toBe(p);
      expect(event.currentTarget).toBeNull();
      expect(event.eventPhase).toBe(0);
      expect(event.composedPath()).toEqual([]);
      expect(event.defaultPrevented).toBe(false);
    } finally {
      window.close();
    }
  });

  it("observes the full composed path while dispatching and none afterward", () => {
    // Given: a target listener capturing composedPath() during dispatch.
    const { window } = new Constructor("<main id=m><p id=p></p></main>");
    try {
      const main = element(window, "m");
      const p = element(window, "p");
      let during: unknown[] = [];
      p.addEventListener("probe", (event: TestEvent) => (during = event.composedPath()));
      const event = new window.Event("probe");
      // When: the event is dispatched.
      p.dispatchEvent(event);
      // Then: the path runs from target to window during dispatch and is empty afterward.
      const { document } = window;
      expect(during).toEqual([p, main, document.body, document.documentElement, document, window]);
      expect(event.composedPath()).toEqual([]);
    } finally {
      window.close();
    }
  });

  it("runs checkbox and label default actions without any listeners", () => {
    // Given: a checkbox and a label controlling a second checkbox, with no listeners.
    const { window } = new Constructor(
      "<input type=checkbox id=a><label id=l><input type=checkbox id=b></label>",
    );
    try {
      const a = input(window, "a");
      const b = input(window, "b");
      const label = element(window, "l");
      // When: one checkbox is clicked, one synthetic click is dispatched, and the label is clicked.
      a.click();
      const synthetic = a.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      label.click();
      // Then: activation behavior toggles each control exactly as with listeners present.
      expect(synthetic).toBe(true);
      expect(a.checked).toBe(false);
      expect(b.checked).toBe(true);
    } finally {
      window.close();
    }
  });

  it("cancels checkbox activation when an onclick handler returns false", () => {
    // Given: a checkbox whose only listener is an onclick property returning false.
    const { window } = new Constructor("<input type=checkbox id=a>");
    try {
      const a = input(window, "a");
      let checkedDuringHandler: boolean | undefined;
      a.onclick = () => {
        checkedDuringHandler = a.checked;
        return false;
      };
      const event = new window.MouseEvent("click", { bubbles: true, cancelable: true });
      // When: the click is dispatched.
      const result = a.dispatchEvent(event);
      // Then: pre-activation was visible, then legacy-canceled activation restored the state.
      expect(checkedDuringHandler).toBe(true);
      expect(result).toBe(false);
      expect(event.defaultPrevented).toBe(true);
      expect(a.checked).toBe(false);
    } finally {
      window.close();
    }
  });

  it("submits or resets a form only from enabled, connected, form-owned buttons", async () => {
    // Given: submit and reset buttons that are plain, disabled, inside a disabled fieldset, inside
    // that fieldset's first legend, of type button, outside the form with a form attribute, and
    // formless; plus a detached form with its own submit button.
    const { window } = new Constructor(
      "<form id=f><input id=t value=start>" +
        "<button id=plain>a</button><button id=off disabled>b</button>" +
        "<fieldset disabled><legend><button id=legend>c</button></legend><button id=fenced>d</button></fieldset>" +
        "<button id=inert type=button>e</button><input id=image type=image>" +
        "<button id=reset type=reset>f</button></form>" +
        "<button id=remote form=f>g</button><button id=loose>h</button>",
    );
    try {
      const form = element(window, "f");
      const submitted: string[] = [];
      form.addEventListener("submit", (event: TestEvent) => {
        event.preventDefault();
        submitted.push(String(Reflect.get(event, "submitter")?.id));
      });
      const detached = window.document.createElement("form");
      detached.innerHTML = "<button id=detached>i</button>";
      detached.addEventListener("submit", () => submitted.push("detached"));
      const text = input(window, "t");
      text.value = "edited";
      // When: each button is clicked, through click() and through a synthetic MouseEvent.
      for (const id of ["plain", "off", "legend", "fenced", "inert", "image", "remote", "loose"])
        element(window, id).click();
      element(window, "plain").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      detached
        .querySelector("button")
        ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      element(window, "reset").click();
      await Promise.resolve();
      // Then: only enabled, connected, form-owned submit buttons submit, and reset restores values.
      expect(submitted).toEqual(["plain", "legend", "image", "remote", "plain"]);
      expect(text.value).toBe("start");
    } finally {
      window.close();
    }
  });

  it("restores checkboxes and radio groups when a click is canceled in any phase", () => {
    // Given: a checkbox and a radio group under a container, with b initially checked.
    const { window } = new Constructor(
      "<div id=d><input type=checkbox id=c>" +
        "<input type=radio name=g id=a><input type=radio name=g id=b checked></div>",
    );
    try {
      const container = element(window, "d");
      const results: string[] = [];
      for (const phase of ["capture", "target", "bubble"]) {
        for (const id of ["c", "a"]) {
          const control = input(window, id);
          const cancel = (event: TestEvent) => event.preventDefault();
          const where = phase === "target" ? control : container;
          where.addEventListener("click", cancel, { capture: phase === "capture", once: true });
          // When: the control is clicked and the click is canceled in this phase.
          control.click();
          results.push(
            `${phase}:${id}:${input(window, "c").checked}${input(window, "a").checked}${input(window, "b").checked}`,
          );
        }
      }
      // Then: every canceled click restores the previous checkedness of the whole group.
      expect(results).toEqual([
        "capture:c:falsefalsetrue",
        "capture:a:falsefalsetrue",
        "target:c:falsefalsetrue",
        "target:a:falsefalsetrue",
        "bubble:c:falsefalsetrue",
        "bubble:a:falsefalsetrue",
      ]);
    } finally {
      window.close();
    }
  });

  it("activates labels, summaries and links from nested targets, text nodes and untrusted events", () => {
    // Given: a nested label, a label for a checkbox, a details summary, and a fragment link.
    const { window } = new Constructor(
      "<label id=nested><span id=s>text</span><input type=checkbox id=n></label>" +
        "<label id=for for=f>for</label><input type=checkbox id=f>" +
        "<details id=d><summary id=sum><b id=bold>more</b></summary>body</details>" +
        "<a id=link href=#there><i id=italic>go</i></a><div id=plain>x</div>",
    );
    try {
      const span = element(window, "s");
      const textNode = span.firstChild;
      if (!textNode) throw new Error("Expected a text node");
      // When: clicks reach each activation target through descendants, a text node and a plain div.
      textNode.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      element(window, "for").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      element(window, "bold").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      const details = element(window, "d");
      const openAfterFirst = details.hasAttribute("open");
      element(window, "sum").addEventListener("click", (event: TestEvent) =>
        event.preventDefault(),
      );
      element(window, "sum").click();
      element(window, "italic").click();
      element(window, "plain").click();
      window.document.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      // Then: each activation behavior ran once, and a canceled summary did nothing.
      expect(input(window, "n").checked).toBe(true);
      expect(input(window, "f").checked).toBe(true);
      expect(openAfterFirst).toBe(true);
      expect(details.hasAttribute("open")).toBe(true);
    } finally {
      window.close();
    }
  });

  it("follows the current tree after a listener moves or removes the target", () => {
    // Given: a target inside container one, and listeners on both containers and the body.
    const { window } = new Constructor(
      "<div id=one><p id=p></p></div><div id=two></div><div id=three></div>",
    );
    try {
      const p = element(window, "p");
      const seen: string[] = [];
      for (const id of ["one", "two", "three"])
        element(window, id).addEventListener("x", (event: TestEvent) =>
          seen.push(`${id}:${String(Reflect.get(Object(event.currentTarget), "id"))}`),
        );
      p.addEventListener(
        "x",
        () => {
          element(window, "two").append(p);
        },
        { once: true },
      );
      // When: the first dispatch moves the target, a second follows, then it is reparented by
      // innerHTML replacement of its container and appended to a third container.
      p.dispatchEvent(new window.Event("x", { bubbles: true }));
      p.dispatchEvent(new window.Event("x", { bubbles: true }));
      element(window, "two").innerHTML = "";
      const detached = p.dispatchEvent(new window.Event("x", { bubbles: true }));
      element(window, "three").append(p);
      const last = new window.Event("x", { bubbles: true });
      p.dispatchEvent(last);
      // Then: the first dispatch uses the snapshot path, later ones the current tree.
      expect(seen).toEqual(["one:one", "two:two", "three:three"]);
      expect(detached).toBe(true);
      expect(last.composedPath()).toEqual([]);
      expect(last.currentTarget).toBeNull();
      expect(last.target).toBe(p);
    } finally {
      window.close();
    }
  });

  it("rejects redispatch of an event that is still dispatching", () => {
    // Given: a listener that re-dispatches the event it is handling.
    const { window } = new Constructor("<p id=p></p>");
    try {
      const p = element(window, "p");
      let failure: unknown;
      p.addEventListener("probe", (event: TestEvent) => {
        try {
          window.document.body?.dispatchEvent(event);
        } catch (cause) {
          failure = cause;
        }
      });
      // When: the event is dispatched.
      p.dispatchEvent(new window.Event("probe"));
      // Then: the nested dispatch throws InvalidStateError.
      expect(failure).toBeInstanceOf(window.DOMException);
      expect(Reflect.get(Object(failure), "name")).toBe("InvalidStateError");
    } finally {
      window.close();
    }
  });
});

describe("RunDOM pointer input tracking for :focus-visible", () => {
  it("counts only connected mouse input and unmodified keydown", () => {
    // Given: two buttons, a detached button, and focus moved by script.
    const { window } = new JSDOM("<button id=a>a</button><button id=b>b</button>");
    try {
      const a = element(window, "a");
      const b = element(window, "b");
      const detached = window.document.createElement("button");
      const visible = (label: string) => `${label}:${String(b.matches(":focus-visible"))}`;
      const seen: string[] = [];
      // When: non-mouse clicks and detached mouse input arrive before b is focused.
      a.dispatchEvent(new window.Event("click", { bubbles: true }));
      detached.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
      b.focus();
      seen.push(visible("script"));
      // And: connected pointer input, modified keydown, then plain keydown arrive.
      a.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
      a.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
      b.blur();
      b.focus();
      seen.push(visible("pointer"));
      b.dispatchEvent(new window.KeyboardEvent("keydown", { key: "c", ctrlKey: true }));
      seen.push(visible("modified"));
      b.dispatchEvent(new window.Event("keydown"));
      seen.push(visible("untyped"));
      b.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab" }));
      seen.push(visible("keyboard"));
      a.click();
      b.blur();
      b.focus();
      seen.push(visible("click"));
      // Then: only connected mouse input hides the indicator and only plain keydown restores it.
      expect(seen).toEqual([
        "script:true",
        "pointer:false",
        "modified:false",
        "untyped:false",
        "keyboard:true",
        "click:false",
      ]);
    } finally {
      window.close();
    }
  });
});
