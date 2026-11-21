// Exercises keyed long-list reconciliation and repeated state changes in a real packed Vitest/React realm.
import { createElement as h, useState, act } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("Packed React stress workloads", () => {
  it("preserves keyed identity and edited control state through long-list updates", () => {
    // Given: 2,048 keyed rows, including an independently edited uncontrolled input.
    const size = 2048;
    function List() {
      const [step, setStep] = useState(0);
      return h(
        "main",
        null,
        h("button", { id: "advance", onClick: () => setStep((value) => value + 1) }, "Advance"),
        h(
          "ol",
          null,
          Array.from({ length: size }, (_, offset) => {
            const key = (offset + step * 17) % size;
            return h(
              "li",
              { key, "data-key": String(key), "data-step": String(step) },
              h("span", null, `Row ${key}: ${step}`),
              key === 17
                ? h("input", { "aria-label": "Retained edit", defaultValue: "initial" })
                : null,
            );
          }),
        ),
      );
    }
    const view = render(h(List));
    const list = view.container.querySelector("ol"),
      button = view.container.querySelector("button"),
      edited = view.container.querySelector("input"),
      original = view.container.querySelector('[data-key="17"]');
    expect(list && button && edited && original).toBeTruthy();
    edited.value = "edited by consumer";
    // When: sixteen real delegated clicks reorder every row and update text/attributes.
    for (let step = 1; step <= 16; step++) {
      act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      const snapshot = list.querySelectorAll("li");
      expect(snapshot.length).toBe(size);
      for (const offset of [0, 1, size >> 1, size - 1]) {
        const key = (offset + step * 17) % size,
          row = snapshot.item(offset);
        expect(row.dataset.key).toBe(String(key));
        expect(row.dataset.step).toBe(String(step));
        expect(row.firstChild.textContent).toBe(`Row ${key}: ${step}`);
      }
      // Then: keyed moves retain the original row/control and preserve its user-owned value.
      expect(list.querySelector('[data-key="17"]')).toBe(original);
      expect(list.querySelector("input")).toBe(edited);
      expect(edited.value).toBe("edited by consumer");
    }
  });

  it("keeps repeated interactions, focus, styles and live selector state coherent", () => {
    // Given: React controls a checkbox and a styled, focusable state indicator.
    function Interaction() {
      const [checked, setChecked] = useState(false);
      return h(
        "section",
        null,
        h("input", {
          type: "checkbox",
          checked,
          onChange: (event) => setChecked(event.target.checked),
        }),
        h(
          "button",
          { "aria-pressed": String(checked), style: { color: checked ? "red" : "blue" } },
          checked ? "Enabled" : "Disabled",
        ),
      );
    }
    const view = render(h(Interaction)),
      checkbox = view.container.querySelector("input"),
      button = view.container.querySelector("button");
    expect(checkbox && button).toBeTruthy();
    button.focus();
    // When: sixty-four native checkbox activations repeatedly change React and DOM state.
    for (let index = 0; index < 64; index++) {
      act(() => checkbox.click());
      const checked = index % 2 === 0;
      // Then: checked selectors, accessible state, text, focus and computed style agree each time.
      expect(checkbox.checked).toBe(checked);
      expect(view.container.querySelector("input:checked")).toBe(checked ? checkbox : null);
      expect(button.getAttribute("aria-pressed")).toBe(String(checked));
      expect(button.textContent).toBe(checked ? "Enabled" : "Disabled");
      expect(getComputedStyle(button).color).toBe(checked ? "rgb(255, 0, 0)" : "rgb(0, 0, 255)");
      expect(document.activeElement).toBe(button);
    }
  });
});
