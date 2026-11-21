// Covers activation through the public jsdom entry point.
import { JSDOM } from "@run-dom/jsdom";
import { expect, it } from "vitest";

it("submits through the activated button and respects cancellation", () => {
  const { window } = new JSDOM("<form><button><span>Save</span></button></form>");
  try {
    const form = window.document.querySelector("form");
    const button = window.document.querySelector("button");
    const label = window.document.querySelector("span");
    if (
      !(form instanceof window.HTMLFormElement) ||
      !(button instanceof window.HTMLButtonElement) ||
      !(label instanceof window.HTMLElement)
    ) {
      throw new Error("Expected form controls");
    }
    const submitters: unknown[] = [];
    form.addEventListener("submit", (event) => {
      if (event instanceof window.SubmitEvent) submitters.push(event.submitter);
      event.preventDefault();
    });

    label.addEventListener("click", (event) => event.preventDefault(), { once: true });
    label.click();
    label.click();
    button.addEventListener(
      "click",
      () => {
        button.disabled = true;
      },
      { once: true },
    );
    button.click();
    form.requestSubmit();
    expect(submitters).toEqual([button, null]);
  } finally {
    window.close();
  }
});

it.each([undefined, "outside-only", "dangerously"] as const)(
  "schedules only the innermost link's javascript URL in %s mode",
  async (runScripts) => {
    const { window } = new JSDOM("", runScripts ? { runScripts } : {});
    try {
      const outer = window.document.createElement("a");
      const inner = window.document.createElement("a");
      outer.setAttribute("href", "javascript:document.body.id = 'outer'");
      inner.setAttribute("href", "javascript:document.body.id = '%69nner'; void 0");
      outer.appendChild(inner);
      window.document.body?.appendChild(outer);
      inner.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      expect(window.document.body?.id).toBe("");
      await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 0));
      expect(window.document.body?.id).toBe(runScripts === "dangerously" ? "inner" : "");
    } finally {
      window.close();
    }
  },
);

it("resets only owned inputs and restores their connection to the checked attribute", () => {
  const { window } = new JSDOM(
    '<form id="main"><button type="reset"></button></form>' +
      '<input id="owned" form="main" type="checkbox" checked>' +
      '<input id="other" type="checkbox" checked>',
  );
  try {
    const form = window.document.querySelector("form");
    const button = window.document.querySelector("button");
    const owned = window.document.querySelector("#owned");
    const other = window.document.querySelector("#other");
    if (
      !(form instanceof window.HTMLFormElement) ||
      !(button instanceof window.HTMLButtonElement) ||
      !(owned instanceof window.HTMLInputElement) ||
      !(other instanceof window.HTMLInputElement)
    ) {
      throw new Error("Expected form controls");
    }
    owned.checked = false;
    other.checked = false;
    const resets: boolean[][] = [];
    form.addEventListener(
      "reset",
      (event) => {
        resets.push([event.isTrusted, event.bubbles, event.cancelable, owned.checked]);
        event.preventDefault();
      },
      { once: true },
    );

    form.reset();
    expect(owned.checked).toBe(false);
    button.click();

    expect(resets).toEqual([[true, true, true, false]]);
    expect(owned.checked).toBe(true);
    expect(other.checked).toBe(false);
    owned.defaultChecked = false;
    expect(owned.checked).toBe(false);
  } finally {
    window.close();
  }
});

it("restores text control values and resumes tracking their defaults after reset", () => {
  const { window } = new JSDOM('<form><input value="initial"><textarea>initial</textarea></form>');
  try {
    const form = window.document.querySelector("form");
    const input = window.document.querySelector("input");
    const textarea = window.document.querySelector("textarea");
    if (
      !(form instanceof window.HTMLFormElement) ||
      !(input instanceof window.HTMLInputElement) ||
      !(textarea instanceof window.HTMLTextAreaElement)
    ) {
      throw new Error("Expected text controls");
    }

    input.value = "edited\r\ninput";
    textarea.value = "edited\r\ntextarea";
    input.defaultValue = "changed";
    textarea.defaultValue = "changed";
    expect([input.value, textarea.value]).toEqual(["editedinput", "edited\ntextarea"]);
    form.reset();
    expect([input.value, textarea.value]).toEqual(["changed", "changed"]);
    input.defaultValue = "new default";
    textarea.defaultValue = "new default";
    expect([input.value, textarea.value]).toEqual(["new default", "new default"]);
  } finally {
    window.close();
  }
});

it("restores select defaults after edits and allows an explicitly empty selection", () => {
  const { window } = new JSDOM(
    '<form><select><option disabled>Unavailable</option><option value="a">A</option><option value="b" selected>B</option></select></form>',
  );
  try {
    const form = window.document.querySelector("form");
    const select = window.document.querySelector("select");
    const option = window.document.querySelector('[value="b"]');
    if (
      !(form instanceof window.HTMLFormElement) ||
      !(select instanceof window.HTMLSelectElement) ||
      !(option instanceof window.HTMLOptionElement)
    )
      throw new Error("Expected a select");
    expect([select.selectedIndex, select.value, option.selected]).toEqual([2, "b", true]);
    select.value = "a";
    expect([select.selectedIndex, option.selected]).toEqual([1, false]);
    select.selectedIndex = -1;
    expect(select.value).toBe("");
    form.reset();
    expect([select.selectedIndex, option.selected]).toEqual([2, true]);
    option.defaultSelected = false;
    expect([select.selectedIndex, select.value]).toEqual([1, "a"]);
  } finally {
    window.close();
  }
});

it("keeps selectedOptions live across constructor, selection, and tree changes", () => {
  const { window } = new JSDOM("<select multiple></select>");
  try {
    const select = window.document.querySelector("select");
    if (!(select instanceof window.HTMLSelectElement)) throw new Error("Expected a select");
    const first = new window.Option(" First ", "", true);
    const second = new window.Option("Second", undefined, false, true);
    first.id = "first";
    expect(Object.getPrototypeOf(first)).toBe(window.HTMLOptionElement.prototype);
    expect([first.value, first.defaultSelected, first.selected]).toEqual(["", true, false]);
    expect(second.value).toBe("Second");

    select.append(first, second);
    const selected = select.selectedOptions;
    expect([...selected]).toEqual([second]);
    first.selected = true;
    expect(selected.namedItem("first")).toBe(first);
    expect([...selected]).toEqual([first, second]);
    second.remove();
    expect(select.selectedOptions).toBe(selected);
    expect([...selected]).toEqual([first]);
  } finally {
    window.close();
  }
});

it("keeps an existing selectedOptions collection live after adopting its select", () => {
  const first = new JSDOM("<select><option>A</option></select>").window;
  const second = new JSDOM("").window;
  try {
    const select = first.document.querySelector("select");
    if (!(select instanceof first.HTMLSelectElement)) throw new Error("Expected a select");
    const selected = select.selectedOptions;
    expect(selected.length).toBe(1);

    second.document.body?.appendChild(second.document.adoptNode(select));
    expect(selected.length).toBe(1);
    const option = new second.Option("B", "b", true, true);
    select.appendChild(option);
    expect(selected.item(0) === option).toBe(true);
  } finally {
    first.close();
    second.close();
  }
});

it("looks up forms by name and restores an associated output's default", () => {
  const { window } = new JSDOM(
    '<form id="order" name="checkout"></form><output form="order"><span>12</span></output>',
  );
  try {
    const forms = window.document.forms;
    const form = forms.namedItem("checkout");
    const output = window.document.querySelector("output");
    if (
      !(form instanceof window.HTMLFormElement) ||
      !(output instanceof window.HTMLOutputElement)
    ) {
      throw new Error("Expected a form and output");
    }
    expect(Reflect.get(forms, "checkout")).toBe(form);
    expect(output.form).toBe(form);
    expect(output.defaultValue).toBe("12");
    output.value = "20";
    output.defaultValue = "15";
    expect(output.value).toBe("20");
    form.reset();
    expect(output.value).toBe("15");
    output.textContent = "30";
    expect(output.defaultValue).toBe("30");

    form.remove();
    expect(forms.length).toBe(0);
    expect(output.form).toBeNull();
  } finally {
    window.close();
  }
});

it("keeps live validity state, dispatches invalid events, and bars output from validation", () => {
  const { window } = new JSDOM("<form><input required><output></output><button></button></form>");
  try {
    const form = window.document.querySelector("form");
    const input = window.document.querySelector("input");
    const output = window.document.querySelector("output");
    if (
      !(form instanceof window.HTMLFormElement) ||
      !(input instanceof window.HTMLInputElement) ||
      !(output instanceof window.HTMLOutputElement)
    )
      throw new Error("Expected controls");

    const validity = input.validity;
    expect(validity).toBeInstanceOf(window.ValidityState);
    expect(validity.valueMissing).toBe(true);
    expect(input.matches(":invalid")).toBe(true);
    expect(form.matches(":invalid")).toBe(true);
    const calls: string[] = [];
    input.addEventListener("invalid", (event) => {
      calls.push(event.isTrusted && !event.bubbles && event.cancelable ? "invalid" : "unexpected");
      event.preventDefault();
    });
    form.addEventListener("submit", (event) => {
      calls.push("submit");
      event.preventDefault();
    });
    form.requestSubmit();
    input.value = "ready";
    expect(validity.valid).toBe(true);
    expect(form.matches(":valid")).toBe(true);
    form.requestSubmit();
    expect(calls).toEqual(["invalid", "submit"]);

    output.setCustomValidity("display only");
    expect(output.validity.customError).toBe(true);
    expect(output.validationMessage).toBe("");
    expect(output.willValidate).toBe(false);
    expect(output.checkValidity()).toBe(true);
    expect(output.matches(":valid, :invalid")).toBe(false);
  } finally {
    window.close();
  }
});

it("converts and steps numeric controls and exposes live range and step flags", () => {
  const { window } = new JSDOM('<input type="number" min="0.1" max="1" step="0.2">');
  try {
    const input = window.document.querySelector("input");
    if (!(input instanceof window.HTMLInputElement)) throw new Error("Expected input");
    input.valueAsNumber = 0.2;
    expect(input.validity.stepMismatch).toBe(true);
    input.stepUp();
    expect(input.value).toBe("0.3");
    expect(input.validity.stepMismatch).toBe(false);
    input.valueAsNumber = 1.1;
    expect(input.validity.rangeOverflow).toBe(true);
    input.stepDown();
    expect(input.value).toBe("0.9");
    expect(input.validity.valid).toBe(true);
  } finally {
    window.close();
  }
});

it("converts calendar values using UTC and the input's document realm", () => {
  const first = new JSDOM('<input type="month">', { runScripts: "outside-only" });
  const second = new JSDOM("", { runScripts: "outside-only" });
  try {
    const input = first.window.document.querySelector("input");
    if (!(input instanceof first.window.HTMLInputElement)) throw new Error("Expected an input");
    input.valueAsDate = new Date("1969-12-31T23:59:00Z");
    expect(input.value).toBe("1969-12");
    expect(input.valueAsDate?.toISOString()).toBe("1969-12-01T00:00:00.000Z");
    second.window.document.adoptNode(input);
    const secondDate: unknown = Reflect.get(second.window, "Date");
    expect(input.valueAsDate?.constructor).toBe(secondDate);
    input.valueAsDate = new Date(NaN);
    expect(input.value).toBe("");
    expect(input.valueAsDate).toBeNull();
    input.type = "datetime-local";
    expect(() => {
      input.valueAsDate = null;
    }).toThrowError(expect.objectContaining({ name: "InvalidStateError" }));
  } finally {
    first.window.close();
    second.window.close();
  }
});

it("replaces the selected UTF-16 range and queues a trusted select event", async () => {
  const { window } = new JSDOM('<input value="a😀b"><textarea>abcdef</textarea>');
  try {
    const input = window.document.querySelector("input");
    const textarea = window.document.querySelector("textarea");
    if (
      !(input instanceof window.HTMLInputElement) ||
      !(textarea instanceof window.HTMLTextAreaElement)
    )
      throw new Error("Expected text controls");

    const events: boolean[] = [];
    input.addEventListener("select", (event) => events.push(event.isTrusted && event.bubbles));
    input.setSelectionRange(1, 3, "backward");
    expect(input.selectionDirection).toBe("backward");
    input.setRangeText("xy");
    expect([input.value, input.selectionStart, input.selectionEnd]).toEqual(["axyb", 1, 3]);
    expect(events).toEqual([]);
    await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 0));
    expect(events).toEqual([true, true]);

    textarea.setRangeText("X", 2, 4, "end");
    expect([textarea.value, textarea.selectionStart, textarea.selectionEnd]).toEqual([
      "abXef",
      3,
      3,
    ]);
    input.type = "number";
    expect(input.selectionStart).toBeNull();
    expect(() => input.setSelectionRange(0, 1)).toThrowError(
      expect.objectContaining({ name: "InvalidStateError" }),
    );
  } finally {
    window.close();
  }
});

it("transfers focus between text controls while preserving selection", () => {
  const { window } = new JSDOM('<input value="abc"><textarea></textarea>');
  try {
    const input = window.document.querySelector("input");
    const textarea = window.document.querySelector("textarea");
    if (
      !(input instanceof window.HTMLInputElement) ||
      !(textarea instanceof window.HTMLTextAreaElement)
    )
      throw new Error("Expected text controls");
    const types: string[] = [];
    for (const type of ["focus", "focusin", "blur", "focusout"]) {
      input.addEventListener(type, (event) => {
        expect(event.isTrusted).toBe(true);
        types.push(event.type);
      });
    }
    input.focus();
    input.setSelectionRange(1, 2);
    expect(window.document.activeElement).toBe(input);
    textarea.focus();
    expect(window.document.activeElement).toBe(textarea);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 2]);
    expect(types).toEqual(["focus", "focusin", "blur", "focusout"]);
    textarea.blur();
    expect(window.document.activeElement).toBe(window.document.body);
  } finally {
    window.close();
  }
});

it("queues selection events only for effective changes and coalesces selectionchange", async () => {
  const { window } = new JSDOM('<input value="abc">');
  try {
    const input = window.document.querySelector("input");
    if (!(input instanceof window.HTMLInputElement)) throw new Error("Expected an input");
    const types: string[] = [];
    input.addEventListener("select", (event) => types.push(event.type));
    input.addEventListener("selectionchange", (event) => types.push(event.type));
    input.setSelectionRange(0, 0);
    input.setSelectionRange(1, 2);
    input.setSelectionRange(1, 2);
    input.setSelectionRange(1, 3);
    await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 0));
    expect(types.filter((type) => type === "select")).toHaveLength(2);
    expect(types.filter((type) => type === "selectionchange")).toHaveLength(1);
  } finally {
    window.close();
  }
});

it("retargets shadow focus and clears it when the focused subtree is removed", () => {
  const { window } = new JSDOM("<main><div></div></main>");
  try {
    const host = window.document.querySelector("div");
    if (!(host instanceof window.HTMLElement)) throw new Error("Expected a shadow host");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "<input>";
    const input = shadow.querySelector("input");
    if (!(input instanceof window.HTMLInputElement)) throw new Error("Expected an input");

    input.focus();
    expect(window.document.activeElement).toBe(host);
    expect(shadow.activeElement).toBe(input);
    expect(host.matches(":focus")).toBe(true);
    expect(window.document.querySelector("main:focus-within")).toBe(host.parentElement);
    host.remove();
    window.document.body?.appendChild(host);
    expect(window.document.activeElement).toBe(window.document.body);
    expect(shadow.activeElement).toBeNull();
    expect(window.document.hasFocus()).toBe(true);
  } finally {
    window.close();
  }
});

it("keeps form controls and named radio groups live when ownership changes", () => {
  const { window } = new JSDOM(
    '<form id="settings"><input type="radio" name="mode" checked><input type="image"></form>' +
      '<input type="radio" form="settings" name="mode" value="manual">',
  );
  try {
    const form = window.document.querySelector("form");
    if (!(form instanceof window.HTMLFormElement)) throw new Error("Expected form");
    const controls = form.elements;
    expect(controls).toBeInstanceOf(window.HTMLFormControlsCollection);
    expect(form.length).toBe(2);
    const radios = controls.namedItem("mode");
    if (!(radios instanceof window.RadioNodeList)) throw new Error("Expected radio group");
    expect(radios.value).toBe("on");
    radios.value = "manual";
    expect(radios.value).toBe("manual");
    expect(Reflect.get(controls, "mode")).toBeInstanceOf(window.RadioNodeList);

    form.id = "changed";
    expect(controls).toBe(form.elements);
    expect(controls.length).toBe(1);
    expect(radios.length).toBe(1);
    expect(controls.namedItem("mode")).toBe(controls[0]);
  } finally {
    window.close();
  }
});

it("resolves direct form properties while preserving its DOM and event identity", () => {
  const { window } = new JSDOM('<form><input name="old"><input name="submit"></form>');
  try {
    const form = window.document.querySelector("form");
    const input = window.document.querySelector("input");
    if (!(form instanceof window.HTMLFormElement) || !(input instanceof window.HTMLInputElement)) {
      throw new Error("Expected form and input");
    }
    expect(Reflect.get(form, "0")).toBe(input);
    expect(Reflect.get(form, "old")).toBe(input);
    expect(Reflect.get(form, "submit")).toBe(form.elements[1]);
    expect(Object.keys(form)).toEqual(["0", "1"]);
    expect(Reflect.deleteProperty(form, "0")).toBe(false);
    expect(input.form).toBe(form);
    input.name = "new";
    expect(Reflect.get(form, "old")).toBe(input);
    let target: unknown;
    form.addEventListener("reset", (event) => {
      target = event.target;
    });
    form.reset();
    expect(target).toBe(form);
    input.remove();
    expect(Reflect.get(form, "old")).toBeUndefined();
    expect(Reflect.get(form, "0")).toBe(form.elements[0]);
  } finally {
    window.close();
  }
});

it("guards submission reentry and constructs live form data from successful controls", () => {
  const { window } = new JSDOM(
    '<form id="f"><input name="name" value="one"><input type="checkbox" name="skip">' +
      '<button name="choice" value="save"></button></form><input form="f" name="name" value="two">',
  );
  try {
    const form = window.document.querySelector("form");
    const button = window.document.querySelector("button");
    if (
      !(form instanceof window.HTMLFormElement) ||
      !(button instanceof window.HTMLButtonElement)
    ) {
      throw new Error("Expected form and button");
    }
    let submits = 0;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submits++;
      if (submits === 1) form.requestSubmit();
    });
    form.requestSubmit(button);
    expect(submits).toBe(1);
    form.remove();
    form.requestSubmit(button);
    expect(submits).toBe(1);
    expect([...new window.FormData(form, button)]).toEqual([
      ["name", "one"],
      ["choice", "save"],
    ]);

    window.document.body?.appendChild(form);
    form.addEventListener("formdata", (event) => {
      if (event instanceof window.FormDataEvent) event.formData.append("extra", "ok");
    });
    expect([...new window.FormData(form)]).toEqual([
      ["name", "two"],
      ["name", "one"],
      ["extra", "ok"],
    ]);
  } finally {
    window.close();
  }
});

it("inserts adjacent markup in context and keeps parsed scripts inert", () => {
  const { window } = new JSDOM('<table><tbody id="rows"></tbody></table><div id="target"></div>', {
    runScripts: "dangerously",
  });
  try {
    const rows = window.document.getElementById("rows");
    const target = window.document.getElementById("target");
    if (!rows || !target) throw new Error("Expected fixture elements");
    rows.insertAdjacentHTML("BEFOREEND", "<tr><td>row</td></tr>");
    target.insertAdjacentHTML("beforebegin", '<span id="before"></span>');
    target.insertAdjacentHTML(
      "afterbegin",
      '<script>document.body.id = "ran"</script><b>child</b>',
    );
    expect(rows.querySelector("td")?.textContent).toBe("row");
    expect(target.previousSibling).toBe(window.document.getElementById("before"));
    expect(target.querySelector("b")?.textContent).toBe("child");
    expect(window.document.body?.id).toBe("");
    expect(() =>
      window.document.createElement("div").insertAdjacentHTML("afterend", "x"),
    ).toThrowError(expect.objectContaining({ name: "NoModificationAllowedError" }));
  } finally {
    window.close();
  }
});

it("uses assigned file lists for file names, validation, FormData, and reset", async () => {
  const { window } = new JSDOM('<form><input type="file" name="upload" required></form>');
  try {
    const form = window.document.querySelector("form");
    const input = window.document.querySelector("input");
    if (!(form instanceof window.HTMLFormElement) || !(input instanceof window.HTMLInputElement)) {
      throw new Error("Expected a file input");
    }
    const transfer = new window.DataTransfer();
    const file = new window.File(["contents"], "report.txt", { type: "text/plain" });
    transfer.items.add(file);
    input.files = transfer.files;
    expect(input.files).toBe(transfer.files);
    expect(input.files?.item(0)).toBe(file);
    expect(input.value).toBe("C:\\fakepath\\report.txt");
    expect(input.validity.valueMissing).toBe(false);
    const value = new window.FormData(form).get("upload");
    expect(value).toBe(file);
    expect(await file.text()).toBe("contents");
    form.reset();
    expect(input.files?.length).toBe(0);
    expect(input.validity.valueMissing).toBe(true);
    input.type = "text";
    expect(input.files).toBeNull();
  } finally {
    window.close();
  }
});

it("keeps parser-assigned controls with their form until moved separately", () => {
  // Given: table parsing leaves the form and control in different branches.
  const { window } = new JSDOM(
    "<table><form><tr><td><input name=entry value=parsed></table><main></main>",
  );
  try {
    const { document } = window;
    const form = document.querySelector("form");
    const input = document.querySelector("input");
    const table = document.querySelector("table");
    const main = document.querySelector("main");
    if (
      !(form instanceof window.HTMLFormElement) ||
      !(input instanceof window.HTMLInputElement) ||
      !table ||
      !main
    )
      throw new Error("Expected parsed form controls");
    expect(input.form).toBe(form);
    expect(new window.FormData(form).get("entry")).toBe("parsed");

    // When: the entire table moves, followed by the input alone.
    main.append(table);
    expect(input.form).toBe(form);
    main.append(input);

    // Then: only the separate move breaks the parser association.
    expect(input.form).toBeNull();
    expect(form.elements.length).toBe(0);
  } finally {
    window.close();
  }
});

it("reflects form submission settings and submitter overrides", () => {
  const { window } = new JSDOM(
    '<base href="/base/"><form><input required><button></button><input type="submit"></form>',
    { url: "https://example.test/page" },
  );
  try {
    const form = window.document.querySelector("form");
    const button = window.document.querySelector("button");
    const input = window.document.querySelector('input[type="submit"]');
    if (
      !(form instanceof window.HTMLFormElement) ||
      !(button instanceof window.HTMLButtonElement) ||
      !(input instanceof window.HTMLInputElement)
    ) {
      throw new Error("Expected form controls");
    }

    expect(form.action).toBe("https://example.test/page");
    form.action = "save";
    form.method = "POST";
    form.encoding = "MULTIPART/FORM-DATA";
    expect(form.action).toBe("https://example.test/base/save");
    expect(form.method).toBe("post");
    expect(form.enctype).toBe("multipart/form-data");

    const submitters: unknown[] = [];
    form.addEventListener("submit", (event) => {
      if (event instanceof window.SubmitEvent) submitters.push(event.submitter);
      event.preventDefault();
    });
    for (const submitter of [button, input]) {
      expect(submitter.formAction).toBe("https://example.test/page");
      expect(submitter.formMethod).toBe("");
      expect(submitter.formEnctype).toBe("");
      submitter.formAction = "preview";
      submitter.formMethod = "invalid";
      submitter.formEnctype = "TEXT/PLAIN";
      submitter.formTarget = "_blank";
      expect(submitter.formAction).toBe("https://example.test/base/preview");
      expect(submitter.formMethod).toBe("get");
      expect(submitter.formEnctype).toBe("text/plain");
      expect(submitter.getAttribute("formtarget")).toBe("_blank");
      form.requestSubmit(submitter);
      submitter.formNoValidate = true;
      form.requestSubmit(submitter);
    }
    expect(submitters).toEqual([button, input]);
  } finally {
    window.close();
  }
});

it("serializes the encoding marker and directionality of eligible form controls", () => {
  const { window } = new JSDOM(`
    <form dir="rtl">
      <input type="hidden" name="_CHARSET_" value="ignored">
      <input type="tel" name="phone" dirname="phone.dir">
      <input type="url" name="link" dirname="link.dir">
      <input type="number" name="count" dirname="count.dir">
      <textarea name="message" dirname="message.dir" dir="ltr"></textarea>
      <input type="submit" name="send" dirname="send.dir">
    </form>
  `);
  try {
    const form = window.document.querySelector("form");
    const submitter = window.document.querySelector('input[type="submit"]');
    if (
      !(form instanceof window.HTMLFormElement) ||
      !(submitter instanceof window.HTMLInputElement)
    ) {
      throw new Error("Expected form controls");
    }

    expect(submitter.dirName).toBe("send.dir");
    submitter.dirName = "button.dir";
    const data = new window.FormData(form, submitter);
    expect(data.get("_CHARSET_")).toBe("UTF-8");
    expect(data.get("phone.dir")).toBe("ltr");
    expect(data.get("link.dir")).toBe("rtl");
    expect(data.has("count.dir")).toBe(false);
    expect(data.get("message.dir")).toBe("ltr");
    expect(data.get("button.dir")).toBe("rtl");
  } finally {
    window.close();
  }
});

it("includes the selected image-button coordinates in FormData", () => {
  const { window } = new JSDOM('<form><input type="image" name="send"></form>');
  try {
    const form = window.document.querySelector("form");
    const input = window.document.querySelector("input");
    if (!(form instanceof window.HTMLFormElement) || !(input instanceof window.HTMLInputElement)) {
      throw new Error("Expected an image button and its form");
    }

    const entries = () => [...new window.FormData(form, input)];
    expect(entries()).toEqual([
      ["send.x", "0"],
      ["send.y", "0"],
    ]);
    const submissions: ReturnType<typeof entries>[] = [];
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submissions.push(entries());
    });

    input.dispatchEvent(new window.MouseEvent("click", { clientX: 23, clientY: 46 }));
    input.addEventListener("click", (event) => event.preventDefault(), { once: true });
    input.dispatchEvent(
      new window.MouseEvent("click", { cancelable: true, clientX: 90, clientY: 92 }),
    );
    expect(entries()).toEqual([
      ["send.x", "23"],
      ["send.y", "46"],
    ]);
    input.click();
    expect(submissions).toEqual([
      [
        ["send.x", "23"],
        ["send.y", "46"],
      ],
      [
        ["send.x", "0"],
        ["send.y", "0"],
      ],
    ]);
  } finally {
    window.close();
  }
});

it("closes the nearest dialog using the submitter's final method and value", () => {
  const { window } = new JSDOM(
    '<dialog open><dialog open><form><button formmethod="dialog">Save</button></form></dialog></dialog>',
  );
  try {
    const [outer, inner] = window.document.querySelectorAll("dialog");
    const form = window.document.querySelector("form");
    const button = window.document.querySelector("button");
    if (
      !(outer instanceof window.HTMLDialogElement) ||
      !(inner instanceof window.HTMLDialogElement) ||
      !(form instanceof window.HTMLFormElement) ||
      !(button instanceof window.HTMLButtonElement)
    )
      throw new Error("Expected dialog form controls");

    form.addEventListener("submit", (event) => event.preventDefault(), { once: true });
    form.requestSubmit(button);
    expect(inner.open).toBe(true);

    form.addEventListener("formdata", () => button.setAttribute("value", "saved"), { once: true });
    form.requestSubmit(button);
    expect([outer.open, inner.open, inner.returnValue]).toEqual([true, false, "saved"]);
    inner.show();
    form.method = "dialog";
    form.submit();
    expect([inner.open, inner.returnValue]).toEqual([false, "saved"]);

    inner.show();
    const host = window.document.createElement("div");
    inner.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = '<form method="dialog"><button>Close</button></form>';
    const shadowForm = shadow.querySelector("form");
    if (!(shadowForm instanceof window.HTMLFormElement)) throw new Error("Expected shadow form");
    shadowForm.requestSubmit();
    expect(inner.open).toBe(true);
  } finally {
    window.close();
  }
});

it("uses rendered slot ancestry and reflected inert state when focusing", () => {
  const { window } = new JSDOM("<main><input></main><input hidden style='display: block'>");
  try {
    const host = window.document.querySelector("main");
    const slotted = host?.querySelector("input");
    const shown = window.document.querySelector("[hidden]");
    if (
      !(host instanceof window.HTMLElement) ||
      !(slotted instanceof window.HTMLInputElement) ||
      !(shown instanceof window.HTMLInputElement)
    )
      throw new Error("Expected a slot host and two inputs");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "<div style='display: none'><slot></slot></div>";

    shown.focus();
    expect(window.document.activeElement).toBe(shown);
    slotted.focus();
    expect(window.document.activeElement).toBe(shown);

    shadow.innerHTML = "<slot></slot>";
    host.inert = true;
    expect(host.hasAttribute("inert")).toBe(true);
    slotted.focus();
    expect(window.document.activeElement).toBe(shown);
    host.inert = false;
    slotted.focus();
    expect(window.document.activeElement).toBe(slotted);
  } finally {
    window.close();
  }
});

it("reports text selection inside shadow trees on the owning document", async () => {
  // Given a closed shadow tree with two text controls.
  const { window } = new JSDOM("<div></div>");
  try {
    const { document } = window;
    const host = document.querySelector("div");
    if (!host) throw new Error("Missing shadow host");
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = '<input value="abc"><textarea>abc</textarea>';
    const input = root.querySelector("input");
    const textarea = root.querySelector("textarea");
    if (
      !(input instanceof window.HTMLInputElement) ||
      !(textarea instanceof window.HTMLTextAreaElement)
    )
      throw new Error("Missing controls");
    const reported: unknown[] = [];
    root.addEventListener("selectionchange", () => reported.push("shadow"));
    document.addEventListener("selectionchange", (event) => {
      reported.push([event.target === document, event.bubbles, event.composed]);
    });

    // When both controls change their selection before the next task.
    input.setSelectionRange(0, 1);
    textarea.setSelectionRange(0, 2);
    expect(reported).toEqual([]);
    await new Promise<void>((resolve) => window.setTimeout(() => resolve(), 0));

    // Then one document event reports the changes without exposing either control.
    expect(reported).toEqual([[true, false, false]]);
  } finally {
    window.close();
  }
});
