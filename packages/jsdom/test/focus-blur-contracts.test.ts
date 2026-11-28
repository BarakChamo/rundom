// Pins focus refusal and blur of a focused element that stopped being focusable, as in jsdom 31.0.1.
import { describe, expect, it } from "vitest";
import { JSDOM } from "../src/jsdom.js";

type TestWindow = JSDOM["window"];
type TestInput = InstanceType<TestWindow["HTMLInputElement"]>;

function page(markup = "<div id=wrap><input id=i></div>") {
  const { window } = new JSDOM(`<!doctype html>${markup}`);
  const input = window.document.getElementById("i");
  if (!(input instanceof window.HTMLInputElement)) throw new Error("The fixture must have #i");
  return { window, document: window.document, input };
}

const parentOf = (input: TestInput) => {
  const parent = input.parentElement;
  if (!parent) throw new Error("The input must have a parent");
  return parent;
};

const mutations: Record<string, (input: TestInput) => void> = {
  "display: none on itself": (input) => {
    input.style.display = "none";
  },
  "display: none on an ancestor": (input) => {
    parentOf(input).style.display = "none";
  },
  "the hidden attribute on an ancestor": (input) => {
    parentOf(input).toggleAttribute("hidden", true);
  },
  "becoming disabled": (input) => {
    input.disabled = true;
  },
  "becoming a hidden input": (input) => {
    input.type = "hidden";
  },
};

describe("HTMLElement focus and blur", () => {
  for (const [change, mutate] of Object.entries(mutations)) {
    it(`should blur a focused element after ${change}`, () => {
      // Given: a focused input with blur listeners
      const { document, input } = page();
      const events: string[] = [];
      input.addEventListener("blur", () => events.push("blur"));
      input.addEventListener("focusout", () => events.push("focusout"));
      input.focus();
      expect(document.activeElement).toBe(input);
      // When: it stops being focusable and blur() runs
      mutate(input);
      input.blur();
      // Then: focus moves to the body with the usual events, and focus() is refused
      expect(document.activeElement).toBe(document.body);
      expect(events).toEqual(["blur", "focusout"]);
      input.focus();
      expect(document.activeElement).toBe(document.body);
    });
  }

  it("should follow visibility, class and stylesheet changes between focus calls", () => {
    // Given: an input that stays rendered under visibility: hidden
    const { document, input } = page(
      "<style>.gone{display:none}</style><div id=wrap><input id=i></div>",
    );
    input.style.setProperty("visibility", "hidden");
    input.focus();
    expect(document.activeElement).toBe(input);
    input.blur();
    // When: a class hides its parent, then is removed again
    parentOf(input).className = "gone";
    input.focus();
    expect(document.activeElement).toBe(document.body);
    parentOf(input).className = "";
    input.focus();
    // Then: focus follows the current style
    expect(document.activeElement).toBe(input);
    input.blur();
    // When: a stylesheet hiding inputs is added and then removed
    const head = document.head;
    if (!head) throw new Error("The fixture must have a head");
    const sheet = head.appendChild(document.createElement("style"));
    sheet.textContent = "input{display:none}";
    input.focus();
    expect(document.activeElement).toBe(document.body);
    sheet.remove();
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  it("should refuse focus inside a hidden shadow host and allow it in a shown one", () => {
    // Given: an input inside an open shadow root
    const { window } = new JSDOM("<!doctype html><div id=host></div>");
    const document = window.document;
    const host = document.getElementById("host");
    if (!host) throw new Error("The fixture must have a host");
    const root = host.attachShadow({ mode: "open" });
    const input = root.appendChild(document.createElement("input"));
    if (!(input instanceof window.HTMLInputElement)) throw new Error("Expected an input");
    // When/Then: focus follows the host's display
    input.focus();
    expect(root.activeElement).toBe(input);
    input.blur();
    host.style.display = "none";
    input.focus();
    expect(root.activeElement).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});
