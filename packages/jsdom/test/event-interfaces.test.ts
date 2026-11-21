// Exercises input and message event payloads through the public Window.
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

describe("Window event interfaces", () => {
  it("notifies custom controls only when form ownership or disabled state changes", () => {
    // Given: a custom control referencing a form by ID from inside a fieldset.
    const { window } = new JSDOM(
      '<form id="target"></form><fieldset><x-field form="target"></x-field></fieldset>',
    );
    try {
      const changes: unknown[] = [];
      class Field extends window.HTMLElement {
        static formAssociated = true;
        formAssociatedCallback(owner: unknown) {
          changes.push(owner);
        }
        formDisabledCallback(disabled: boolean) {
          changes.push(disabled);
        }
      }
      window.customElements.define("x-field", Field);
      const { document } = window;
      const form = document.querySelector("form");
      const fieldset = document.querySelector("fieldset");
      const field = document.querySelector("x-field");
      if (!form || !fieldset || !field) throw new Error("Expected a form, fieldset, and field");

      // When: the fieldset becomes disabled and the referenced form changes ID.
      fieldset.setAttribute("disabled", "");
      fieldset.setAttribute("disabled", "disabled");
      expect(field.matches(":disabled")).toBe(true);
      form.id = "other";
      field.remove();

      // Then: the control observes each transition once and becomes enabled when removed.
      expect(field.matches(":enabled")).toBe(true);
      expect(changes).toEqual([form, true, null, false]);
    } finally {
      window.close();
    }
  });

  it("runs custom reset callbacks only after a noncanceled native reset", () => {
    // Given: a dirty native input and a form-associated control that reads it on reset.
    const { window } = new JSDOM('<form><x-field></x-field><input value="initial"></form>');
    try {
      const form = window.document.querySelector("form");
      const input = window.document.querySelector("input");
      if (!(form instanceof window.HTMLFormElement) || !(input instanceof window.HTMLInputElement))
        throw new Error("Expected a form and input");
      const control = input;
      const observed: string[] = [];
      class Field extends window.HTMLElement {
        static formAssociated = true;
        formResetCallback() {
          observed.push(control.value);
        }
      }
      window.customElements.define("x-field", Field);
      input.value = "edited";
      form.addEventListener("reset", (event) => event.preventDefault(), { once: true });

      // When: the first reset is canceled and the second is allowed.
      form.reset();
      expect(input.value).toBe("edited");
      expect(observed).toEqual([]);
      form.reset();

      // Then: the callback sees the native input's restored value.
      expect(input.value).toBe("initial");
      expect(observed).toEqual(["initial"]);
    } finally {
      window.close();
    }
  });

  it("blocks form submission for an invalid custom control and allows it once cleared", () => {
    // Given: a form-associated field with a live validity object.
    const { window } = new JSDOM("<form><x-field></x-field></form>");
    try {
      class Field extends window.HTMLElement {
        static formAssociated = true;
        readonly internals = this.attachInternals();
      }
      window.customElements.define("x-field", Field);
      const field = window.document.querySelector("x-field");
      const form = window.document.querySelector("form");
      if (!(field instanceof Field) || !(form instanceof window.HTMLFormElement))
        throw new Error("Expected a custom field inside a form");
      const validity = field.internals.validity;
      const calls: string[] = [];
      field.addEventListener("invalid", () => calls.push("invalid"));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        calls.push("submit");
      });

      // When: the custom field becomes invalid and then clears its flags.
      field.internals.setValidity({ valueMissing: true }, "First line\r\nSecond line");
      expect(validity.valueMissing).toBe(true);
      expect(field.internals.validationMessage).toBe("First line\nSecond line");
      form.requestSubmit();
      field.internals.setValidity();
      form.requestSubmit();

      // Then: only the second request reaches the submit event.
      expect(validity.valid).toBe(true);
      expect(calls).toEqual(["invalid", "submit"]);
    } finally {
      window.close();
    }
  });

  it("lists form-associated elements and submits a snapshot of their FormData", () => {
    // Given: a detached control pointing to a form that already exposed its collection.
    const { window } = new JSDOM(
      '<form id="order"></form><x-field name="field" form="order"></x-field>',
    );
    try {
      const form = window.document.querySelector("form");
      if (!(form instanceof window.HTMLFormElement)) throw new Error("Expected a form");
      const elements = form.elements;
      expect(elements.namedItem("field")).toBeNull();
      class Field extends window.HTMLElement {
        static formAssociated = true;
        readonly internals = this.attachInternals();
      }
      window.customElements.define("x-field", Field);
      const field = window.document.querySelector("x-field");
      if (!(field instanceof Field)) throw new Error("Expected an upgraded field");

      // When: the field supplies form data and the caller subsequently changes that data.
      const input = new window.FormData();
      input.append("item", "first");
      input.append("item", "second");
      field.internals.setFormValue(input);
      input.set("item", "later");

      // Then: ownership is live while the submission value stays snapshotted.
      expect(field.internals.form).toBe(form);
      expect(elements.namedItem("field")).toBe(field);
      expect(new window.FormData(form).getAll("item")).toEqual(["first", "second"]);
      field.internals.setFormValue(null);
      expect(new window.FormData(form).has("item")).toBe(false);
      field.removeAttribute("form");
      expect(field.internals.form).toBeNull();
      expect(elements.namedItem("field")).toBeNull();
    } finally {
      window.close();
    }
  });

  it("keeps ARIA element references scoped and returns stable frozen arrays", () => {
    // Given: a host with a shadow control and a label in the surrounding document.
    const { window } = new JSDOM('<main></main><label id="label">Name</label>');
    try {
      const { document } = window;
      const host = document.querySelector("main");
      const label = document.querySelector("label");
      if (!host || !label) throw new Error("Expected a host and label");
      const shadow = host.attachShadow({ mode: "open" });
      const control = document.createElement("input");
      shadow.append(control);
      control.ariaLabelledByElements = [label];
      const initial = control.ariaLabelledByElements;
      expect(initial).toEqual([label]);
      expect(Object.isFrozen(initial)).toBe(true);
      expect(control.ariaLabelledByElements).toBe(initial);

      // When: the reference moves out of scope, then returns to the surrounding document.
      label.remove();
      expect(control.ariaLabelledByElements).toEqual([]);
      document.body?.append(label);

      // Then: the reference is visible again until an attribute write replaces it.
      expect(control.ariaLabelledByElements).toEqual([label]);
      control.setAttribute("aria-labelledby", "label");
      expect(control.ariaLabelledByElements).toEqual([]);
      expect(initial).toEqual([label]);
    } finally {
      window.close();
    }
  });

  it("reflects element ARIA attributes while keeping internals defaults separate", () => {
    // Given: a custom element with an accessibility default and an observed attribute.
    const { window } = new JSDOM("");
    try {
      const changes: (string | null)[] = [];
      class Field extends window.HTMLElement {
        static observedAttributes = ["aria-label"];
        readonly internals = this.attachInternals();
        attributeChangedCallback(_name: string, _oldValue: string | null, value: string | null) {
          changes.push(value);
        }
      }
      window.customElements.define("x-aria-field", Field);
      const field = new Field();
      field.internals.ariaLabel = "Default label";

      // When: the caller sets and clears the reflected element value.
      field.ariaLabel = "Author label";
      expect(field.getAttribute("aria-label")).toBe("Author label");
      field.ariaLabel = null;

      // Then: only the element value participates in attribute reactions.
      expect(field.ariaLabel).toBeNull();
      expect(field.hasAttribute("aria-label")).toBe(false);
      expect(field.internals.ariaLabel).toBe("Default label");
      expect(changes).toEqual(["Author label", null]);
    } finally {
      window.close();
    }
  });

  it("exposes a live label list through form-associated element internals", () => {
    // Given: a custom element and an explicit label in the same document.
    const { window } = new JSDOM('<label for="field">Field</label><x-field id="field"></x-field>');
    try {
      class Field extends window.HTMLElement {
        static formAssociated = true;
        readonly internals = this.attachInternals();
      }
      window.customElements.define("x-field", Field);
      const field = window.document.querySelector("x-field");
      const label = window.document.querySelector("label");
      if (!(field instanceof Field) || !label) throw new Error("Expected the field and label");

      // When: the label is redirected after the list has been read.
      const labels = field.internals.labels;
      expect(labels.item(0)).toBe(label);
      label.setAttribute("for", "other");

      // Then: the retained list tracks the current association.
      expect(labels.length).toBe(0);
      expect(() => field.attachInternals()).toThrow("Cannot attach internals to this element");
    } finally {
      window.close();
    }
  });

  it("blocks shadow attachment during upgrade when the definition disables it", () => {
    // Given: an existing element whose constructor attempts to attach a shadow root.
    const { window } = new JSDOM("<x-no-shadow></x-no-shadow>");
    try {
      const calls: string[] = [];
      class NoShadow extends window.HTMLElement {
        static disabledFeatures = ["shadow"];
        constructor() {
          super();
          try {
            this.attachShadow({ mode: "open" });
          } catch (error) {
            if (!(error instanceof window.DOMException)) throw error;
            calls.push(error.name);
          }
        }
      }

      // When: definition upgrades the existing element.
      window.customElements.define("x-no-shadow", NoShadow);
      const node = window.document.querySelector("x-no-shadow");

      // Then: the constructor receives the platform exception and the element still upgrades.
      expect(calls).toEqual(["NotSupportedError"]);
      expect(node).toBeInstanceOf(NoShadow);
      expect(node?.shadowRoot).toBeNull();
    } finally {
      window.close();
    }
  });

  it("upgrades customized built-ins using their creation-time is value", () => {
    // Given: a parsed button and a detached button created before registration.
    const { window } = new JSDOM('<button is="x-button"></button>');
    try {
      const { customElements, document } = window;
      const parsed = document.querySelector("button");
      const detached = document.createElement("button", { is: "x-button" });
      class Button extends window.HTMLButtonElement {
        connectedCallback() {
          this.disabled = true;
        }
      }

      // When: the definition is registered and the detached button is connected.
      customElements.define("x-button", Button, { extends: "button" });
      detached.setAttribute("is", "unrelated");
      document.body?.append(detached);

      // Then: the two existing wrappers keep their identity and built-in behavior.
      expect(document.querySelector("button")).toBe(parsed);
      expect(parsed).toBeInstanceOf(Button);
      expect(detached).toBeInstanceOf(Button);
      expect(detached.hasAttribute("disabled")).toBe(true);
      expect(document.createElement("button", "x-button")).not.toBeInstanceOf(Button);
      expect(document.createElement("input", { is: "x-button" })).not.toBeInstanceOf(Button);
      expect(new Button().localName).toBe("button");
    } finally {
      window.close();
    }
  });

  it("upgrades autonomous elements in place and delivers their lifecycle callbacks", async () => {
    // Given: an existing element, a pending definition, and a registered listener object.
    const { window } = new JSDOM('<x-button data-state="initial"></x-button>');
    try {
      const { customElements, document } = window;
      const element = document.querySelector("x-button");
      if (!element) throw new Error("Expected a custom element candidate");
      const calls: unknown[][] = [];
      const ready = customElements.whenDefined("x-button");
      class Button extends window.HTMLElement {
        static observedAttributes = ["data-state"];
        connectedCallback() {
          this.addEventListener("click", this);
        }
        disconnectedCallback() {
          calls.push(["disconnected"]);
        }
        handleEvent() {
          calls.push(["click"]);
        }
        attributeChangedCallback(name: string, previous: string | null, value: string | null) {
          calls.push([name, previous, value]);
        }
      }

      // When: the definition upgrades the existing element, then the caller mutates it.
      customElements.define("x-button", Button);
      expect(await ready).toBe(Button);
      expect(document.querySelector("x-button")).toBe(element);
      expect(element).toBeInstanceOf(Button);
      if (!(element instanceof Button)) throw new Error("Expected an upgraded element");
      element.click();
      element.setAttribute("data-state", "updated");
      element.remove();

      // Then: reactions use the original wrapper and run in mutation order.
      expect(calls).toEqual([
        ["data-state", null, "initial"],
        ["click"],
        ["data-state", "initial", "updated"],
        ["disconnected"],
      ]);
      expect(document.createElement("x-button")).toBeInstanceOf(Button);
      expect(new Button().localName).toBe("x-button");
    } finally {
      window.close();
    }
  });

  it("copies synthetic touch sequences and supports legacy touch event creation", () => {
    // Given: touch data from a caller-owned sequence and a Window to dispatch in.
    const { window } = new JSDOM("");
    try {
      const point = { identifier: 1 };
      const touches = [point];

      // When: the caller constructs the event and later changes the source sequence.
      const event = new window.TouchEvent("touchstart", { touches, ctrlKey: true });
      touches.pop();

      // Then: the payload survives independently and legacy creation uses the same interface.
      expect(event.touches).toEqual([point]);
      expect(event.touches).toBe(event.touches);
      expect(event.targetTouches).toEqual([]);
      expect(event.changedTouches).toEqual([]);
      expect(event.ctrlKey).toBe(true);
      expect(event.cancelable).toBe(false);
      expect(window.document.createEvent("TouchEvent")).toBeInstanceOf(window.TouchEvent);
    } finally {
      window.close();
    }
  });

  it("coalesces slot changes after mutation observers run", async () => {
    const { window } = new JSDOM("<main></main>");
    try {
      const host = window.document.querySelector("main");
      if (!host) throw new Error("Expected a host");
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = "<slot></slot>";
      const slot = root.firstElementChild;
      if (!slot) throw new Error("Expected a slot");
      const log: string[] = [];
      const observer = new window.MutationObserver(() => log.push("observer"));
      observer.observe(host, { childList: true });
      slot.addEventListener("slotchange", (event) => {
        log.push(event.isTrusted && event.bubbles && !event.composed ? "slotchange" : "invalid");
      });
      const child = window.document.createElement("b");
      host.append(child, window.document.createElement("i"));
      expect(log).toEqual([]);
      await Promise.resolve();
      expect(log).toEqual(["observer", "slotchange"]);
      child.remove();
      await Promise.resolve();
      expect(log).toEqual(["observer", "slotchange", "observer", "slotchange"]);
      observer.disconnect();
    } finally {
      window.close();
    }
  });

  it("keeps manual slot order and transfers assignments between slots", () => {
    const { window } = new JSDOM("<main><b></b><i></i></main>");
    try {
      const host = window.document.querySelector("main");
      if (!host) throw new Error("Expected a host");
      const [first, second] = host.children;
      if (!first || !second) throw new Error("Expected light children");
      const root = host.attachShadow({ mode: "open", slotAssignment: "manual" });
      root.innerHTML = "<slot></slot><slot></slot>";
      const [left, right] = root.querySelectorAll("slot");
      if (!(left instanceof window.HTMLSlotElement) || !(right instanceof window.HTMLSlotElement))
        throw new Error("Expected slots");
      expect(root.slotAssignment).toBe("manual");
      expect(first.assignedSlot).toBeNull();
      left.assign(second, first, second);
      expect(left.assignedNodes().map((node) => node.nodeName)).toEqual(["I", "B"]);
      expect(first.assignedSlot === left).toBe(true);
      right.assign(first);
      expect(left.assignedNodes()[0] === second).toBe(true);
      expect(right.assignedNodes()[0] === first).toBe(true);
      first.remove();
      expect(right.assignedNodes()).toEqual([]);
      host.append(first);
      expect(first.assignedSlot === right).toBe(true);
    } finally {
      window.close();
    }
  });

  it("reports live named slot assignments and flattened fallback nodes", () => {
    const { window } = new JSDOM("<main><b slot=label></b>text</main>");
    try {
      const host = window.document.querySelector("main");
      const label = host?.firstElementChild;
      const text = host?.lastChild;
      if (!host || !label || !(text instanceof window.Text)) throw new Error("Expected slotables");
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML =
        '<slot name="label"></slot><slot></slot><slot name="fallback"><i></i></slot>';
      const [named, unnamed, fallback] = root.querySelectorAll("slot");
      if (
        !(named instanceof window.HTMLSlotElement) ||
        !(unnamed instanceof window.HTMLSlotElement) ||
        !(fallback instanceof window.HTMLSlotElement)
      )
        throw new Error("Expected slots");

      expect(label.assignedSlot === named).toBe(true);
      expect(text.assignedSlot === unnamed).toBe(true);
      expect(named.assignedElements()[0] === label).toBe(true);
      expect(unnamed.assignedNodes()[0] === text).toBe(true);
      expect(fallback.assignedNodes()).toEqual([]);
      expect(fallback.assignedNodes({ flatten: true })[0] === fallback.firstChild).toBe(true);

      label.slot = "fallback";
      expect(label.assignedSlot === fallback).toBe(true);
      expect(named.assignedNodes()).toEqual([]);
      expect(fallback.assignedNodes({ flatten: true })[0] === label).toBe(true);
    } finally {
      window.close();
    }
  });

  it("routes a light-DOM event through its closed slot without retargeting the light child", () => {
    const { window } = new JSDOM("<main><b slot=label></b></main>");
    try {
      const host = window.document.querySelector("main");
      const child = host?.firstElementChild;
      if (!host || !child) throw new Error("Expected a host and slotted child");
      const root = host.attachShadow({ mode: "closed" });
      root.innerHTML = '<slot name="label"></slot>';
      const slot = root.firstElementChild;
      if (!slot) throw new Error("Expected a slot");
      const observed: boolean[] = [];
      slot.addEventListener("sample", (event) => {
        observed.push(event.target === child && event.composedPath()[1] === slot);
      });
      host.addEventListener("sample", (event) => {
        observed.push(event.target === child && event.composedPath()[1] === host);
      });
      child.dispatchEvent(new window.Event("sample", { bubbles: true }));
      expect(observed).toEqual([true, true]);
    } finally {
      window.close();
    }
  });

  it("retargets mouse transitions and keeps transitions within one shadow tree private", () => {
    const { window } = new JSDOM("<main></main><aside></aside>");
    try {
      const host = window.document.querySelector("main");
      const other = window.document.querySelector("aside");
      if (!host || !other) throw new Error("Expected shadow hosts");
      const root = host.attachShadow({ mode: "open" });
      const target = window.document.createElement("b");
      const sibling = window.document.createElement("i");
      root.append(target, sibling);
      const remote = window.document.createElement("b");
      other.attachShadow({ mode: "closed" }).append(remote);

      const transitions: boolean[] = [];
      window.document.addEventListener("mouseout", (event) => {
        transitions.push(
          event instanceof window.MouseEvent &&
            event.target === host &&
            event.relatedTarget === other,
        );
      });
      const internal = new window.MouseEvent("mouseout", {
        bubbles: true,
        composed: true,
        relatedTarget: sibling,
      });
      target.dispatchEvent(internal);
      expect(transitions).toEqual([]);
      expect(internal.target).toBeNull();
      expect(internal.relatedTarget).toBeNull();

      const external = new window.MouseEvent("mouseout", {
        bubbles: true,
        composed: true,
        relatedTarget: remote,
      });
      target.dispatchEvent(external);
      expect(transitions).toEqual([true]);
      expect(external.relatedTarget === other).toBe(true);
    } finally {
      window.close();
    }
  });

  it("retargets composed events and hides closed shadow internals from outside listeners", () => {
    const { window } = new JSDOM("<main></main>");
    try {
      const host = window.document.querySelector("main");
      if (!host) throw new Error("Expected a shadow host");
      const root = host.attachShadow({ mode: "closed" });
      const child = window.document.createElement("button");
      root.appendChild(child);
      const observed: string[] = [];
      root.addEventListener("sample", (event) => {
        if (event.target === child && event.composedPath()[0] === child) observed.push("inside");
      });
      host.addEventListener("sample", (event) => {
        if (event.target === host && event.composedPath()[0] === host && event.eventPhase === 2)
          observed.push("host");
      });
      window.document.addEventListener("sample", (event) => {
        if (event.target === host && event.composedPath()[0] === host) observed.push("document");
      });
      const composed = new window.Event("sample", { bubbles: true, composed: true });
      child.dispatchEvent(composed);
      expect(observed).toEqual(["inside", "host", "document"]);
      expect(composed.target === host).toBe(true);
      expect(composed.composedPath()).toEqual([]);

      observed.length = 0;
      const local = new window.Event("sample", { bubbles: true });
      child.dispatchEvent(local);
      expect(observed).toEqual(["inside"]);
      expect(local.target).toBeNull();
    } finally {
      window.close();
    }
  });

  it("initializes legacy mouse coordinates and reports modifier state", () => {
    // Given: an uninitialized mouse event from the legacy alias.
    const { window } = new JSDOM("");
    try {
      const event = window.document.createEvent("MouseEvents");
      if (!(event instanceof window.MouseEvent)) throw new Error("Expected a MouseEvent");

      // When: callers supply coordinates, modifiers, and a related target.
      event.initMouseEvent(
        "click",
        true,
        true,
        window,
        1,
        8,
        9,
        10,
        11,
        true,
        false,
        false,
        false,
        1,
        window.document,
      );

      // Then: mouse and inherited UI data are initialized together.
      expect([event.clientX, event.clientY, event.screenX, event.detail, event.button]).toEqual([
        10, 11, 8, 1, 1,
      ]);
      expect(event.relatedTarget === window.document).toBe(true);
      expect(event.getModifierState("Control")).toBe(true);
      expect(event.getModifierState("Shift")).toBe(false);
      expect(event.view === window).toBe(true);
    } finally {
      window.close();
    }
  });

  it("keeps keyboard and message payloads through dispatch", () => {
    // Given: a keyboard event and a legacy message event.
    const { window } = new JSDOM("");
    try {
      const key = new window.KeyboardEvent("keydown", {
        key: "A",
        code: "KeyA",
        shiftKey: true,
        modifierCapsLock: true,
      });
      const message = window.document.createEvent("MessageEvent");
      if (!(message instanceof window.MessageEvent)) throw new Error("Expected a MessageEvent");

      // When: the message receives a payload and the event is dispatched.
      const payload = { value: 2 };
      message.initMessageEvent(
        "message",
        false,
        false,
        payload,
        "https://example.test/",
        "last",
        window,
      );
      let observed: unknown;
      window.addEventListener("message", (event) => {
        observed = event;
      });
      window.dispatchEvent(message);

      // Then: identity, modifier values, and message metadata are retained.
      expect(observed === message).toBe(true);
      expect([key.key, key.code, key.getModifierState("CapsLock")]).toEqual(["A", "KeyA", true]);
      expect(message.data === payload).toBe(true);
      expect(message.origin).toBe("https://example.test/");
      expect(message.source === window).toBe(true);
      expect(Object.isFrozen(message.ports)).toBe(true);
    } finally {
      window.close();
    }
  });
});

it("fires a synthetic pointer click and prevents reentrant activation", () => {
  // Given: a button whose click listener attempts to click it again.
  const { window } = new JSDOM("<button></button>");
  try {
    const button = window.document.querySelector("button");
    if (!(button instanceof window.HTMLElement)) throw new Error("Expected a button");
    const events: object[] = [];
    button.addEventListener("click", (event) => {
      events.push(event);
      if (events.length === 1) button.click();
    });

    // When: the button is clicked programmatically.
    button.click();

    // Then: one untrusted PointerEvent carries the synthetic pointer and Window.
    expect(events).toHaveLength(1);
    const event = events[0];
    if (!(event instanceof window.PointerEvent)) throw new Error("Expected a PointerEvent");
    expect(event instanceof window.MouseEvent).toBe(true);
    expect(event.pointerId).toBe(-1);
    expect(event.view === window).toBe(true);
    expect(event.isTrusted).toBe(false);
  } finally {
    window.close();
  }
});

it("constructs a realm-local InputEvent with nullable data and dispatches it", () => {
  const { window } = new JSDOM("<input>");
  try {
    const target = window.document.querySelector("input");
    if (!target) throw new Error("Expected an input element");
    const empty = new window.InputEvent("input");
    expect([empty.data, empty.inputType, empty.isComposing]).toEqual([null, "", false]);
    expect(empty).toBeInstanceOf(window.UIEvent);
    expect(Object.prototype.toString.call(empty)).toBe("[object InputEvent]");

    const event = new window.InputEvent("beforeinput", {
      data: "",
      inputType: "insertCompositionText",
      isComposing: true,
      bubbles: true,
      cancelable: true,
      view: window,
    });
    const listener = (received: InstanceType<typeof window.Event>) => {
      expect(received).toBe(event);
      received.preventDefault();
    };
    window.document.addEventListener("beforeinput", listener);
    expect(target.dispatchEvent(event)).toBe(false);
    expect([event.data, event.inputType, event.isComposing, event.view]).toEqual([
      "",
      "insertCompositionText",
      true,
      window,
    ]);
  } finally {
    window.close();
  }
});

it("constructs and dispatches a CloseEvent with WebSocket close metadata", () => {
  const { window } = new JSDOM("<div>");
  try {
    const target = window.document.querySelector("div");
    if (!target) throw new Error("Expected an event target");
    const empty = new window.CloseEvent("close");
    expect([empty.wasClean, empty.code, empty.reason]).toEqual([false, 0, ""]);
    expect(empty).toBeInstanceOf(window.Event);
    expect(Object.prototype.toString.call(empty)).toBe("[object CloseEvent]");

    const event = new window.CloseEvent("close", {
      wasClean: true,
      code: 65536 + 1000,
      reason: "done\uD800",
    });
    let received: InstanceType<typeof window.Event> | undefined;
    target.addEventListener("close", (value) => {
      received = value;
    });
    target.dispatchEvent(event);
    expect(received).toBe(event);
    expect([event.wasClean, event.code, event.reason]).toEqual([true, 1000, "done\uFFFD"]);
  } finally {
    window.close();
  }
});

it("dispatches WebSocket messages and closes through the Window event realm", async () => {
  const server = createServer();
  server.on("upgrade", (request, socket) => {
    const accept = createHash("sha1")
      .update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    if (request.url === "/client-close") {
      socket.once("data", () => socket.end(Buffer.from([0x88, 2, 0x03, 0xe8])));
      return;
    }
    socket.write(
      Buffer.from([0x81, 2, 0x68, 0x69, 0x82, 2, 0x01, 0xff, 0x82, 1, 0x7f, 0x88, 2, 0x03, 0xe8]),
    );
    socket.once("data", () => socket.end());
  });
  const { window } = new JSDOM("", { runScripts: "outside-only" });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");
    const url = `ws://127.0.0.1:${address.port}/`;
    expect(() => new window.WebSocket(url, ["same", "same"])).toThrow(window.DOMException);
    const socket = new window.WebSocket(url);
    expect(() => Reflect.apply(socket.send, socket, [])).toThrow("WebSocket data is required");
    expect(() => socket.send("early")).toThrow(window.DOMException);
    expect(() => socket.close(1001)).toThrow(window.DOMException);
    expect(() => socket.close(1000, "é".repeat(62))).toThrow(window.DOMException);
    expect(socket.readyState).toBe(window.WebSocket.CONNECTING);
    const realmArrayBuffer = window.eval("ArrayBuffer");
    socket.onopen = () => {
      window.eval("globalThis.ArrayBuffer = class Replacement {}");
      socket.binaryType = "arraybuffer";
    };
    const messages: unknown[] = [];
    socket.addEventListener("message", (event) => {
      messages.push(event);
      if (messages.length === 2) socket.binaryType = "blob";
    });
    const close = await new Promise<unknown>((resolve, reject) => {
      socket.onclose = resolve;
      socket.onerror = () => reject(new Error("WebSocket failed"));
    });
    expect(socket).toBeInstanceOf(window.EventTarget);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toBeInstanceOf(window.MessageEvent);
    expect(messages[0]).toMatchObject({ data: "hi", target: socket, isTrusted: true });
    const binary = messages[1];
    if (!(binary instanceof window.MessageEvent)) throw new Error("Expected a binary message");
    expect(binary.data).toBeInstanceOf(realmArrayBuffer);
    expect(binary.data).not.toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(binary.data as ArrayBuffer))).toEqual([1, 255]);
    const blob = messages[2];
    if (!(blob instanceof window.MessageEvent) || !(blob.data instanceof window.Blob))
      throw new Error("Expected a Blob message after switching binaryType");
    expect(Array.from(new Uint8Array(await blob.data.arrayBuffer()))).toEqual([127]);
    expect(close).toBeInstanceOf(window.CloseEvent);
    expect(close).toMatchObject({ code: 1000, target: socket, isTrusted: true });
    expect(socket.readyState).toBe(window.WebSocket.CLOSED);

    const client = new window.WebSocket(url + "client-close");
    const states: number[] = [];
    await new Promise<void>((resolve, reject) => {
      client.onopen = () => {
        states.push(client.readyState);
        client.close(1000);
        states.push(client.readyState);
      };
      client.onclose = () => {
        states.push(client.readyState);
        resolve();
      };
      client.onerror = () => reject(new Error("Client-initiated close failed"));
    });
    expect(states).toEqual([client.OPEN, client.CLOSING, client.CLOSED]);
  } finally {
    window.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

it("exposes WebSocket constants and members with Web IDL descriptors", () => {
  const { window } = new JSDOM("");
  try {
    const { WebSocket } = window;
    expect(WebSocket.length).toBe(1);
    expect(WebSocket.prototype.close.length).toBe(0);
    for (const target of [WebSocket, WebSocket.prototype]) {
      expect(Object.getOwnPropertyDescriptor(target, "CLOSED")).toEqual({
        value: 3,
        writable: false,
        enumerable: true,
        configurable: false,
      });
    }
    expect(Object.getOwnPropertyDescriptor(WebSocket.prototype, "bufferedAmount")).toMatchObject({
      get: expect.any(Function),
      set: undefined,
      enumerable: true,
      configurable: true,
    });
  } finally {
    window.close();
  }
});

it("dispatches synthetic transition events with CSS property and timing metadata", () => {
  const { window } = new JSDOM("<div>");
  try {
    const target = window.document.querySelector("div");
    if (!target) throw new Error("Expected a transition target");
    const defaults = new window.TransitionEvent("transitionrun");
    expect([defaults.propertyName, defaults.elapsedTime, defaults.pseudoElement]).toEqual([
      "",
      0,
      "",
    ]);
    expect(() => new window.TransitionEvent("transitionend", { elapsedTime: Infinity })).toThrow(
      "Transition elapsedTime must be finite",
    );

    const event = new window.TransitionEvent("transitionend", {
      propertyName: "opacity",
      elapsedTime: 0.25,
      pseudoElement: "::before",
      bubbles: true,
    });
    let received: unknown;
    window.document.addEventListener("transitionend", (value) => {
      received = value;
    });
    target.dispatchEvent(event);
    expect(received).toBe(event);
    expect(event).toBeInstanceOf(window.Event);
    expect(Object.prototype.toString.call(event)).toBe("[object TransitionEvent]");
    expect([event.propertyName, event.elapsedTime, event.pseudoElement]).toEqual([
      "opacity",
      0.25,
      "::before",
    ]);
  } finally {
    window.close();
  }
});

it("delivers the initial pageshow after load through the body Window handler", async () => {
  const { window } = new JSDOM("<body></body>");
  try {
    const body = window.document.body;
    if (!(body instanceof window.HTMLBodyElement)) throw new Error("Expected an HTML body");
    const order: string[] = [];
    let shown: unknown;
    body.onpageshow = (event) => {
      order.push("pageshow");
      shown = event;
    };
    expect(window.onpageshow).toBe(body.onpageshow);
    await new Promise<void>((resolve) => {
      window.addEventListener("load", () => {
        order.push("load");
        setImmediate(resolve);
      });
    });
    expect(order).toEqual(["load", "pageshow"]);
    expect(shown).toBeInstanceOf(window.PageTransitionEvent);
    expect(shown).toMatchObject({
      persisted: false,
      isTrusted: true,
      bubbles: true,
      cancelable: true,
      target: window.document,
    });
    const restored = new window.PageTransitionEvent("pageshow", { persisted: true });
    expect(restored.persisted).toBe(true);
  } finally {
    window.close();
  }
});

it("keeps BlobEvent data identity and validates its required dictionary", () => {
  const { window } = new JSDOM("");
  try {
    const blob = new window.Blob(["payload"]);
    const event = new window.BlobEvent("dataavailable", { data: blob });
    expect(event).toBeInstanceOf(window.Event);
    expect(Object.prototype.toString.call(event)).toBe("[object BlobEvent]");
    expect(event.data).toBe(blob);
    expect(event.timecode).toBeNaN();
    expect(new window.BlobEvent("dataavailable", { data: blob, timecode: 2.5 }).timecode).toBe(2.5);
    expect(() => Reflect.construct(window.BlobEvent, ["dataavailable", {}])).toThrow(
      "BlobEvent data must be a Blob",
    );
    expect(() => new window.BlobEvent("dataavailable", { data: blob, timecode: Infinity })).toThrow(
      "BlobEvent timecode must be finite",
    );
  } finally {
    window.close();
  }
});

it("preserves promise rejection payloads and dispatches through the Window handler", () => {
  const { window } = new JSDOM("");
  try {
    const promise = Promise.resolve();
    const reason = new Error("failure");
    const event = new window.PromiseRejectionEvent("unhandledrejection", {
      promise,
      reason,
      cancelable: true,
    });
    window.onunhandledrejection = (received) => {
      expect(received).toBe(event);
      received.preventDefault();
    };
    expect(window.dispatchEvent(event)).toBe(false);
    expect(event.promise).toBe(promise);
    expect(event.reason).toBe(reason);
    expect(
      new window.PromiseRejectionEvent("rejectionhandled", { promise: {} }).reason,
    ).toBeUndefined();
    expect(() =>
      Reflect.construct(window.PromiseRejectionEvent, ["unhandledrejection", {}]),
    ).toThrow("PromiseRejectionEvent promise must be an object");
  } finally {
    window.close();
  }
});

it("applies beforeunload handler results only to BeforeUnloadEvent objects", () => {
  // Given a reflected body handler that returns a boolean.
  const { window } = new JSDOM('<body onbeforeunload="return false">', {
    runScripts: "dangerously",
  });
  try {
    // When a synthetic CustomEvent uses the same name, the return value does not cancel it.
    expect(window.dispatchEvent(new window.CustomEvent("beforeunload", { cancelable: true }))).toBe(
      true,
    );

    // Then a BeforeUnloadEvent is canceled and carries the coerced string.
    const event = window.document.createEvent("BeforeUnloadEvent");
    if (!(event instanceof window.BeforeUnloadEvent)) throw new Error("Missing BeforeUnloadEvent");
    expect(event.returnValue).toBe("");
    event.initEvent("beforeunload", false, false);
    expect(window.dispatchEvent(event)).toBe(false);
    expect(event.returnValue).toBe("false");

    // A previously assigned return value survives a later handler result.
    event.returnValue = "existing";
    event.initEvent("beforeunload", false, true);
    expect(window.dispatchEvent(event)).toBe(false);
    expect(event.returnValue).toBe("existing");
  } finally {
    window.close();
  }
});

it("orders event timestamps between reads of the same Window clock", () => {
  // Given: event timestamps and performance timestamps must share a coarsened clock.
  const { window } = new JSDOM("");
  try {
    // When: repeated adjacent reads fall within the same clock precision interval.
    for (let index = 0; index < 100; index++) {
      const before = window.performance.now();
      const event = new window.KeyboardEvent("probe");
      const after = window.performance.now();
      // Then: precision reduction never moves creation before the earlier read.
      expect(event.timeStamp).toBeGreaterThanOrEqual(before);
      expect(event.timeStamp).toBeLessThanOrEqual(after);
    }
  } finally {
    window.close();
  }
});
