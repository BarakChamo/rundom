// Qualifies React rendering and Testing Library interactions inside the consumer's actual Vitest realm.
import { createElement as h, useEffect, useState, act } from "react";
import { createPortal } from "react-dom";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("Packed jsdom React environment", () => {
  it("updates state through a pointer click and focuses the button", async () => {
    // Given: a rendered stateful component.
    function Counter() {
      const [count, setCount] = useState(0);
      return h("button", { onClick: () => setCount(count + 1) }, `Count ${count}`);
    }
    render(h(Counter));
    const user = userEvent.setup();
    // When: the consumer clicks through the full user-event sequence.
    await user.click(screen.getByRole("button", { name: "Count 0" }));
    // Then: React receives the event and updates the live DOM.
    const button = screen.getByRole("button", { name: "Count 1" });
    expect(document.activeElement).toBe(button);
  });

  it("edits a controlled input and preserves its caret", async () => {
    // Given: React owns an input value through onChange.
    function Field() {
      const [value, setValue] = useState("");
      return h("input", {
        "aria-label": "Name",
        value,
        onChange: (event) => setValue(event.target.value),
      });
    }
    render(h(Field));
    const user = userEvent.setup(),
      input = screen.getByRole("textbox", { name: "Name" });
    // When: keyboard events insert and remove text.
    await user.type(input, "Ada{Backspace}a");
    // Then: value tracking and selection agree after React rerenders.
    expect(input.value).toBe("Ada");
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(3);
  });

  it("updates a controlled checkbox through native activation", async () => {
    // Given: a labeled controlled checkbox.
    function Checkbox() {
      const [checked, setChecked] = useState(false);
      return h(
        "label",
        null,
        "Accept",
        h("input", { type: "checkbox", checked, onChange: (e) => setChecked(e.target.checked) }),
      );
    }
    render(h(Checkbox));
    // When: user-event clicks its label.
    await userEvent.setup().click(screen.getByText("Accept"));
    // Then: label activation, React's change plugin, and checked state agree.
    expect(screen.getByRole("checkbox", { name: "Accept" }).checked).toBe(true);
  });

  it("changes a controlled select while keeping option state coherent", async () => {
    // Given: React owns the selected value.
    function Select() {
      const [value, setValue] = useState("a");
      return h(
        "select",
        { "aria-label": "Choice", value, onChange: (e) => setValue(e.target.value) },
        h("option", { value: "a" }, "Alpha"),
        h("option", { value: "b" }, "Beta"),
      );
    }
    render(h(Select));
    const select = screen.getByRole("combobox", { name: "Choice" });
    // When: user-event selects another option.
    await userEvent.setup().selectOptions(select, "b");
    // Then: value, index, and live selectedOptions identify the same option.
    expect(select.value).toBe("b");
    expect(select.selectedIndex).toBe(1);
    expect([...select.selectedOptions].map((option) => option.textContent)).toEqual(["Beta"]);
  });

  it("edits a controlled textarea across a line break", async () => {
    // Given: a controlled multiline value.
    function Textarea() {
      const [value, setValue] = useState("");
      return h("textarea", {
        "aria-label": "Notes",
        value,
        onChange: (e) => setValue(e.target.value),
      });
    }
    render(h(Textarea));
    const textarea = screen.getByRole("textbox", { name: "Notes" });
    // When: the user types an Enter key between words.
    await userEvent.setup().type(textarea, "first{Enter}second");
    // Then: line breaks survive native editing and React's value reconciliation.
    expect(textarea.value).toBe("first\nsecond");
  });

  it("observes an asynchronous effect and runs cleanup on unmount", async () => {
    // Given: an effect updates state from a microtask and owns cleanup.
    let disposed = 0;
    function Async() {
      const [value, setValue] = useState("loading");
      useEffect(() => {
        Promise.resolve().then(() => setValue("ready"));
        return () => {
          disposed++;
        };
      }, []);
      return h("output", null, value);
    }
    const view = render(h(Async));
    // When: the real asynchronous React update completes.
    await waitFor(() => expect(screen.getByText("ready").textContent).toBe("ready"));
    view.unmount();
    // Then: mutation observation and teardown work without retaining the component.
    expect(disposed).toBe(1);
  });

  it("bubbles a portal click through its React parent", async () => {
    // Given: a portal lives outside its parent DOM subtree.
    const host = document.body.appendChild(document.createElement("aside"));
    let clicks = 0;
    render(
      h("section", { onClick: () => clicks++ }, createPortal(h("button", null, "Portal"), host)),
    );
    // When: the user clicks the portal's button.
    await userEvent.setup().click(screen.getByRole("button", { name: "Portal" }));
    // Then: React's delegated event ownership follows the component tree.
    expect(clicks).toBe(1);
  });

  it("hydrates server markup without replacement or recovery errors", async () => {
    // Given: server markup for an interactive component.
    function Hydrated() {
      const [value, setValue] = useState("server");
      return h("button", { onClick: () => setValue("client") }, value);
    }
    const host = document.body.appendChild(document.createElement("main"));
    host.innerHTML = renderToString(h(Hydrated));
    const original = host.firstChild,
      errors = [];
    let root;
    // When: React hydrates and then handles an event on the retained node.
    await act(async () => {
      root = hydrateRoot(host, h(Hydrated), {
        onRecoverableError: (error) => errors.push(error.message),
      });
    });
    try {
      await userEvent.setup().click(screen.getByRole("button", { name: "server" }));
      // Then: hydration preserves identity and the client update works.
      expect(host.firstChild).toBe(original);
      expect(host.textContent).toBe("client");
      expect(errors).toEqual([]);
    } finally {
      await act(async () => root.unmount());
    }
  });
});
