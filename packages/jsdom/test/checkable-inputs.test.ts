// Verifies the state and dispatch ordering of checkable form controls.
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

describe("checkable input activation", () => {
  it("exposes pre-click state and restores it when a checkbox click is canceled", () => {
    // Given: a connected, indeterminate checkbox.
    const { window } = new JSDOM('<input type="checkbox">');
    try {
      const input = window.document.querySelector("input");
      if (!(input instanceof window.HTMLInputElement)) throw new Error("Expected an input");
      input.indeterminate = true;
      const states: boolean[][] = [];
      const changes: string[] = [];
      input.addEventListener(
        "click",
        (event) => {
          states.push([input.checked, input.indeterminate]);
          event.preventDefault();
        },
        { once: true },
      );
      input.oninput = () => changes.push("input");
      input.onchange = () => changes.push("change");

      // When: a canceled click is followed by an uncanceled click.
      input.click();
      expect([input.checked, input.indeterminate]).toEqual([false, true]);
      expect(changes).toEqual([]);
      input.click();

      // Then: only the successful click commits and sends the follow-up events.
      expect(states).toEqual([[true, false]]);
      expect([input.checked, input.indeterminate]).toEqual([true, false]);
      expect(changes).toEqual(["input", "change"]);
      expect(input.matches(":checked")).toBe(true);
    } finally {
      window.close();
    }
  });

  it("restores the selected radio when an attempted group change is canceled", () => {
    // Given: two radio buttons in one form and a separate radio in another.
    const { window } = new JSDOM(
      '<form><input type="radio" name="choice" checked><input type="radio" name="choice"></form><form><input type="radio" name="choice" checked></form>',
    );
    try {
      const [first, second, other] = window.document.querySelectorAll("input");
      if (
        !(first instanceof window.HTMLInputElement) ||
        !(second instanceof window.HTMLInputElement) ||
        !(other instanceof window.HTMLInputElement)
      )
        throw new Error("Expected three radio inputs");
      let during: boolean[] = [];
      second.addEventListener(
        "click",
        (event) => {
          during = [first.checked, second.checked, other.checked];
          event.preventDefault();
        },
        { once: true },
      );

      // When: the second radio gets a canceled click, then a successful one.
      second.click();
      expect(during).toEqual([false, true, true]);
      expect([first.checked, second.checked, other.checked]).toEqual([true, false, true]);
      second.click();

      // Then: the selected radio changes only within its form.
      expect([first.checked, second.checked, other.checked]).toEqual([false, true, true]);
    } finally {
      window.close();
    }
  });
});

it("uses the last checked radio in parsed and inserted groups", () => {
  // Given: two default-checked radios in one group.
  const { window } = new JSDOM(
    '<main><input type="radio" name="x" checked><input type="radio" name="x" checked></main>',
  );
  try {
    const main = window.document.querySelector("main");
    const radios = Array.from(window.document.querySelectorAll("input"));
    if (!main || radios.length !== 2) throw new Error("Expected the fixture radios");
    expect(window.document.querySelector(":checked") === radios[1]).toBe(true);

    // When: another checked radio joins the group.
    const third = window.document.createElement("input");
    if (!(third instanceof window.HTMLInputElement)) throw new Error("Expected an input");
    third.type = "radio";
    third.name = "x";
    third.defaultChecked = true;
    main.append(third);

    // Then: it is the only selected radio, without rewriting default attributes.
    expect(window.document.querySelector(":checked") === third).toBe(true);
    expect(window.document.querySelectorAll(":checked").length).toBe(1);
    expect(window.document.querySelectorAll("[checked]").length).toBe(3);
  } finally {
    window.close();
  }
});
