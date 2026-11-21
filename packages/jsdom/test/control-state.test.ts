// Exercises control mutability, editing selectors, label activation, and private value extraction.
import { expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

it.each([
  "text",
  "search",
  "tel",
  "url",
  "email",
  "password",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
  "number",
])("evaluates required %s input mutability independently of validation candidacy", (type) => {
  // Given: a required empty value-mode control and its stable validity object.
  const { window } = new JSDOM(
    `<fieldset><legend><input required type="${type}"></legend><input required type="${type}"></fieldset>`,
  );
  try {
    const fieldset = window.document.querySelector("fieldset");
    const inputs = window.document.querySelectorAll("input");
    const first = inputs[0],
      second = inputs[1];
    if (
      !(fieldset instanceof window.HTMLFieldSetElement) ||
      !(first instanceof window.HTMLInputElement) ||
      !(second instanceof window.HTMLInputElement)
    )
      throw new Error("Expected controls");
    const validity = second.validity;
    expect(validity.valueMissing).toBe(true);
    // When/Then: the first legend stays mutable, while the other control is disabled.
    fieldset.disabled = true;
    expect(first.validity.valueMissing).toBe(true);
    expect(validity.valueMissing).toBe(false);
    fieldset.disabled = false;
    second.readOnly = true;
    expect(validity.valueMissing).toBe(false);
    second.readOnly = false;
    expect(validity.valueMissing).toBe(true);
  } finally {
    window.close();
  }
});

it.each(["checkbox", "radio", "file"])(
  "retains the %s missing-value rule when readonly or disabled",
  (type) => {
    // Given: these controls have type-specific required rules rather than mutable text values.
    const { window } = new JSDOM(`<input type="${type}" required readonly>`);
    try {
      const input = window.document.querySelector("input");
      if (!(input instanceof window.HTMLInputElement)) throw new Error("Expected input");
      expect(input.willValidate).toBe(false);
      expect(input.validity.valueMissing).toBe(true);
      input.disabled = true;
      expect(input.willValidate).toBe(false);
      expect(input.validity.valueMissing).toBe(true);
    } finally {
      window.close();
    }
  },
);

it("shares current mutable state across textarea validity and relational styles", () => {
  // Given: a required textarea controls a relational stylesheet.
  const { window } = new JSDOM(
    "<style>main:has(:read-write){color:green}main:has(:read-only){color:blue}</style><main><textarea required></textarea></main>",
  );
  try {
    const textarea = window.document.querySelector("textarea"),
      main = window.document.querySelector("main");
    if (!(textarea instanceof window.HTMLTextAreaElement) || !main)
      throw new Error("Expected textarea");
    expect(textarea.matches(":read-write")).toBe(true);
    expect(window.getComputedStyle(main).color).toBe("rgb(0, 128, 0)");
    // When/Then: no selector recompilation or replacement validity object is needed.
    textarea.disabled = true;
    expect(textarea.validity.valueMissing).toBe(false);
    expect(textarea.matches(":read-only")).toBe(true);
    expect(window.getComputedStyle(main).color).toBe("rgb(0, 0, 255)");
    textarea.disabled = false;
    textarea.readOnly = true;
    expect(textarea.validity.valueMissing).toBe(false);
    textarea.readOnly = false;
    expect(textarea.validity.valueMissing).toBe(true);
  } finally {
    window.close();
  }
});

it("matches editable inheritance and document editing mode without overriding control mutability", () => {
  // Given: nested editable and explicitly noneditable content surrounds ordinary controls.
  const { window } = new JSDOM(
    '<main contenteditable><p></p><section contenteditable="false"><span></span></section><input><input readonly><input type="checkbox"><textarea disabled></textarea></main>',
  );
  try {
    const { document } = window;
    const main = document.querySelector("main"),
      p = document.querySelector("p"),
      span = document.querySelector("span");
    if (
      !(main instanceof window.HTMLElement) ||
      !(p instanceof window.HTMLElement) ||
      !(span instanceof window.HTMLElement)
    )
      throw new Error("Expected edit fixture");
    expect(main.contentEditable).toBe("true");
    expect(p.contentEditable).toBe("inherit");
    expect(p.isContentEditable).toBe(true);
    expect(span.isContentEditable).toBe(false);
    expect(document.querySelectorAll("input:read-write").length).toBe(1);
    expect(document.querySelectorAll("input:read-only").length).toBe(2);
    expect(document.querySelector("textarea")?.matches(":read-only")).toBe(true);
    // When/Then: invalid enumerated input is rejected and valid inheritance changes remain live.
    expect(() => {
      main.contentEditable = "invalid";
    }).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    main.contentEditable = "false";
    expect(p.matches(":read-write")).toBe(false);
    main.contentEditable = "plaintext-only";
    expect(p.matches(":read-write")).toBe(true);
    document.designMode = "ON";
    expect(document.designMode).toBe("on");
    expect(document.body?.matches(":read-write")).toBe(true);
    expect(span.matches(":read-only")).toBe(true);
    document.designMode = "invalid";
    expect(document.designMode).toBe("on");
    document.designMode = "off";
    expect(span.matches(":read-only")).toBe(true);
  } finally {
    window.close();
  }
});

it("treats Unicode lookalikes as invalid input types while retaining the authored attribute", () => {
  // Given: HTML enumerated keywords are ASCII case-insensitive.
  const { window } = new JSDOM('<input type="weeK" required>');
  try {
    const input = window.document.querySelector("input");
    if (!(input instanceof window.HTMLInputElement)) throw new Error("Expected input");
    expect(input.type).toBe("text");
    expect(input.getAttribute("type")).toBe("weeK");
    // When/Then: assignment takes the same path, and ordinary ASCII case remains accepted.
    input.type = "checKbox";
    expect(input.type).toBe("text");
    input.type = "CHECKBOX";
    expect(input.type).toBe("checkbox");
  } finally {
    window.close();
  }
});

it("forwards label clicks once with current association and honors cancellation and disabled fieldsets", () => {
  // Given: a label forwards its noninteractive descendant's activation to its control.
  const { window } = new JSDOM(
    '<label for="target"><span>name</span><a href="#other">link</a></label><fieldset><input id="target" type="checkbox"></fieldset>',
  );
  try {
    const label = window.document.querySelector("label"),
      input = window.document.querySelector("input"),
      fieldset = window.document.querySelector("fieldset");
    if (
      !(label instanceof window.HTMLLabelElement) ||
      !(input instanceof window.HTMLInputElement) ||
      !(fieldset instanceof window.HTMLFieldSetElement)
    )
      throw new Error("Expected label fixture");
    let clicks = 0;
    const details: number[] = [];
    input.addEventListener("click", (event) => {
      clicks++;
      if (event instanceof window.MouseEvent) details.push(event.detail);
    });
    const span = label.querySelector("span"),
      anchor = label.querySelector("a");
    if (!(span instanceof window.HTMLElement) || !(anchor instanceof window.HTMLElement))
      throw new Error("Expected label descendants");
    span.click();
    expect(clicks).toBe(1);
    expect(details).toEqual([1]);
    expect(input.checked).toBe(true);
    // When/Then: interactive descendants, cancellation, and inherited disabling prevent forwarding.
    anchor.click();
    expect(clicks).toBe(1);
    label.addEventListener("click", (event) => event.preventDefault(), { once: true });
    label.click();
    expect(clicks).toBe(1);
    fieldset.disabled = true;
    label.click();
    expect(clicks).toBe(1);
    fieldset.disabled = false;
    label.click();
    expect(clicks).toBe(2);
  } finally {
    window.close();
  }
});

it("extracts textarea direct child text and excludes only HTML and SVG scripts from option text", () => {
  // Given: programmatic descendants need not conform to the HTML content model.
  const { window } = new JSDOM();
  try {
    const textarea = window.document.createElement("textarea");
    if (!(textarea instanceof window.HTMLTextAreaElement)) throw new Error("Expected textarea");
    textarea.append("before", window.document.createElement("span"), "after");
    const span = textarea.querySelector("span");
    if (!span) throw new Error("Expected span");
    span.textContent = "nested";
    expect(textarea.textContent).toBe("beforenestedafter");
    expect(textarea.defaultValue).toBe("beforeafter");
    expect(textarea.value).toBe("beforeafter");
    // When/Then: foreign script names are ordinary descendants unless their namespace is executable.
    const option = window.document.createElement("option");
    if (!(option instanceof window.HTMLOptionElement)) throw new Error("Expected option");
    for (const namespace of [
      "http://www.w3.org/1999/xhtml",
      "http://www.w3.org/2000/svg",
      "http://www.w3.org/1998/Math/MathML",
      null,
    ]) {
      const script = window.document.createElementNS(namespace, "script");
      script.textContent = " content ";
      option.append(script);
    }
    expect(option.text).toBe("content content");
  } finally {
    window.close();
  }
});

it("keeps required selectors separate from validation eligibility and readonly applicability", () => {
  // Given: required does not apply to hidden/range/button states, even when authored.
  const { window } = new JSDOM(
    '<input type="hidden" required><input type="range" required><input type="button"><input type="text" required disabled><input type="checkbox" readonly>',
  );
  try {
    const controls = window.document.querySelectorAll("input");
    expect(controls[0]?.matches(":optional:not(:required)")).toBe(true);
    expect(controls[1]?.matches(":optional:not(:required)")).toBe(true);
    expect(controls[2]?.matches(":optional:not(:required)")).toBe(true);
    expect(controls[3]?.matches(":required")).toBe(true);
    expect(controls[4]?.matches(":optional:read-only")).toBe(true);
    // When/Then: a cached selector sees an input transition to a required-capable type.
    const hidden = controls[0];
    if (!(hidden instanceof window.HTMLInputElement)) throw new Error("Expected input");
    hidden.type = "text";
    expect(hidden.matches(":required:read-write")).toBe(true);
  } finally {
    window.close();
  }
});

it("distinguishes detached ancestor forms from connected explicit ID associations", () => {
  // Given: a disconnected control uses an ancestor form; an external control needs connection.
  const { window } = new JSDOM();
  try {
    const root = window.document.createElement("div");
    root.innerHTML =
      '<form id="owner"><input form="owner" name="field"></form><input form="owner" name="external">';
    const form = root.querySelector("form"),
      input = root.querySelector("input");
    if (!(form instanceof window.HTMLFormElement) || !(input instanceof window.HTMLInputElement))
      throw new Error("Expected form");
    const collection = form.elements;
    expect(input.form).toBe(form);
    expect(collection.length).toBe(1);
    // When/Then: detached ancestry survives ID changes, while connected controls use the ID.
    form.id = "other";
    expect(input.form === form).toBe(true);
    expect(collection.length).toBe(1);
    form.id = "owner";
    window.document.body?.append(root);
    expect(input.form).toBe(form);
    expect(collection.length).toBe(2);
  } finally {
    window.close();
  }
});

it("normalizes radio groups when inserting into a form but preserves independent detached checked state", () => {
  // Given: checked setters operate on their current group before either radio is attached.
  const { window } = new JSDOM();
  try {
    const first = window.document.createElement("input"),
      second = window.document.createElement("input");
    if (!(first instanceof window.HTMLInputElement) || !(second instanceof window.HTMLInputElement))
      throw new Error("Expected radios");
    for (const input of [first, second]) {
      input.type = "radio";
      input.name = "group";
      input.checked = true;
    }
    const container = window.document.createElement("div");
    container.append(first, second);
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(true);
    // When/Then: acquiring a form owner normalizes the group; detached form parsing does too.
    const form = window.document.createElement("form");
    form.append(container);
    expect(first.checked).toBe(false);
    expect(second.checked).toBe(true);
    form.innerHTML =
      '<input type="radio" name="other" checked><input type="radio" name="other" checked>';
    const radios = form.querySelectorAll("input");
    if (
      !(radios[0] instanceof window.HTMLInputElement) ||
      !(radios[1] instanceof window.HTMLInputElement)
    )
      throw new Error("Expected parsed radios");
    expect(radios[0].checked).toBe(false);
    expect(radios[1].checked).toBe(true);
  } finally {
    window.close();
  }
});

it("uses intrinsic event cancellation for activation and dispatch results across Windows", () => {
  // Given: framework helpers may shadow defaultPrevented after canceling native activation.
  const { window } = new JSDOM(
    '<label for="control">name</label><input id="control" type="checkbox">',
  );
  const other = new JSDOM();
  try {
    const label = window.document.querySelector("label"),
      input = window.document.querySelector("input");
    if (!(label instanceof window.HTMLLabelElement) || !(input instanceof window.HTMLInputElement))
      throw new Error("Expected label");
    const canceled = new other.window.MouseEvent("click", { bubbles: true, cancelable: true });
    canceled.preventDefault();
    Object.defineProperty(canceled, "defaultPrevented", { value: false });
    expect(label.dispatchEvent(canceled)).toBe(false);
    expect(input.checked).toBe(false);
    // When/Then: a forged public getter cannot cancel an otherwise uncanceled event either.
    const allowed = new other.window.MouseEvent("click", { bubbles: true, cancelable: true });
    Object.defineProperty(allowed, "defaultPrevented", { value: true });
    expect(label.dispatchEvent(allowed)).toBe(true);
    expect(input.checked).toBe(true);
  } finally {
    window.close();
    other.window.close();
  }
});

it("reads private control values for validity, serialization, and submission", () => {
  // Given: author properties can shadow the DOM value/defaultValue getters.
  const { window } = new JSDOM(
    '<form><input name="input" required><textarea name="area" required></textarea></form>',
  );
  try {
    const form = window.document.querySelector("form"),
      input = window.document.querySelector("input"),
      textarea = window.document.querySelector("textarea");
    if (
      !(form instanceof window.HTMLFormElement) ||
      !(input instanceof window.HTMLInputElement) ||
      !(textarea instanceof window.HTMLTextAreaElement)
    )
      throw new Error("Expected controls");
    Object.defineProperty(input, "value", { get: () => "forged" });
    Object.defineProperty(textarea, "value", { get: () => "forged" });
    expect(input.validity.valueMissing).toBe(true);
    expect(textarea.validity.valueMissing).toBe(true);
    expect(new window.FormData(form).get("input")).toBe("");
    expect(new window.FormData(form).get("area")).toBe("");
    input.setSelectionRange(0, 1);
    textarea.setSelectionRange(0, 1);
    expect(input.selectionEnd).toBe(0);
    expect(textarea.selectionEnd).toBe(0);
    // When/Then: the native value getters also ignore a forged defaultValue accessor.
    Object.defineProperty(input, "defaultValue", { get: () => "forged" });
    Object.defineProperty(textarea, "defaultValue", { get: () => "forged" });
    expect(Reflect.get(window.HTMLInputElement.prototype, "value", input)).toBe("");
    expect(Reflect.get(window.HTMLTextAreaElement.prototype, "value", textarea)).toBe("");
  } finally {
    window.close();
  }
});

it("keeps escaped form-state pseudo-classes on the same live predicate path", () => {
  // Given: escapes change selector spelling rather than the identity of a pseudo-class.
  const { window } = new JSDOM("<input required><input disabled>");
  try {
    const input = window.document.querySelector("input");
    if (!(input instanceof window.HTMLInputElement)) throw new Error("Expected input");
    expect(input.matches(":r\\65 ad-write")).toBe(true);
    expect(input.matches(":r\\65 quired")).toBe(true);
    input.readOnly = true;
    // When/Then: escaped selectors observe current private state after mutation.
    expect(input.matches(":r\\65 ad-only")).toBe(true);
    expect(input.matches(":r\\65 ad-write")).toBe(false);
  } finally {
    window.close();
  }
});

it("resets the existing selection and focuses the document element when enabling designMode", () => {
  // Given: enabling editing changes the active range without replacing its identity.
  const { window } = new JSDOM("<p>text</p>");
  try {
    const range = window.document.createRange();
    range.selectNodeContents(window.document.querySelector("p") ?? window.document);
    const selection = window.getSelection();
    if (!selection) throw new Error("Expected selection");
    selection.addRange(range);
    window.document.designMode = "on";
    expect(selection.getRangeAt(0)).toBe(range);
    expect(range.startContainer === window.document).toBe(true);
    expect(range.startOffset).toBe(0);
    expect(range.collapsed).toBe(true);
    expect(window.document.activeElement === window.document.documentElement).toBe(true);
    // When/Then: repeated enabling leaves a subsequently moved selection intact.
    range.selectNodeContents(window.document.querySelector("p") ?? window.document);
    window.document.designMode = "on";
    expect(range.toString()).toBe("text");
  } finally {
    window.close();
  }
});

it("activates an area hyperlink before an ancestor control", () => {
  // Given: programmatic DOM trees can place a hyperlink inside another activatable control.
  const { window } = new JSDOM('<form><button><area href="#area"></button></form>', {
    url: "https://example.test/",
  });
  try {
    const area = window.document.querySelector("area"),
      form = window.document.querySelector("form");
    if (!(area instanceof window.HTMLAreaElement) || !form) throw new Error("Expected area");
    let submitted = false;
    form.addEventListener("submit", (event) => {
      submitted = true;
      event.preventDefault();
    });
    area.click();
    expect(window.location.hash).toBe("#area");
    expect(submitted).toBe(false);
  } finally {
    window.close();
  }
});

it.each(["input", "textarea"])(
  "does not report transient selection changes while replacing an empty %s value",
  async (tag) => {
    // Given: the original and final preserved selection are both collapsed at zero.
    const { window } = new JSDOM();
    try {
      const control = window.document.createElement(tag);
      if (
        !(control instanceof window.HTMLInputElement) &&
        !(control instanceof window.HTMLTextAreaElement)
      )
        throw new Error("Expected text control");
      let changes = 0;
      control.addEventListener("selectionchange", () => {
        changes++;
      });
      control.setRangeText("foo");
      await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 10));
      expect(control.value).toBe("foo");
      expect(control.selectionStart).toBe(0);
      expect(control.selectionEnd).toBe(0);
      expect(changes).toBe(0);
      // When/Then: an actual subsequent range change still queues a notification.
      control.setSelectionRange(0, 2);
      await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 10));
      expect(changes).toBe(1);
    } finally {
      window.close();
    }
  },
);
