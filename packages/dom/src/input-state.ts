// Stores live input checkedness separately from the reflected default attribute.
import { html, type DefaultTreeAdapterTypes as Raw } from "parse5";

type CheckState = { checked: boolean; dirty: boolean; indeterminate: boolean };
const states = new WeakMap<Raw.Element, CheckState>();
const inputTypes = new Set([
  "hidden",
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
  "range",
  "color",
  "checkbox",
  "radio",
  "file",
  "submit",
  "image",
  "reset",
  "button",
]);

function attribute(node: Raw.Element, name: string): string | undefined {
  return node.attrs.find((attr) => !attr.namespace && attr.name === name)?.value;
}

/** Identifies an HTML input record without allocating its wrapper. */
export function isInput(node: Raw.Element): boolean {
  return node.namespaceURI === html.NS.HTML && node.tagName === "input";
}

/** Normalizes a type attribute using ASCII case folding and the supported input states. */
export function normalizedInputType(value: string | null | undefined): string {
  const type = value?.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return type && inputTypes.has(type) ? type : "text";
}

/** Returns the normalized input type, defaulting unsupported values to text. */
export function inputType(node: Raw.Element): string {
  return normalizedInputType(attribute(node, "type"));
}

/** Reads checkedness even before a wrapper or explicit state exists. */
export function checkedness(node: Raw.Element): boolean {
  return states.get(node)?.checked ?? attribute(node, "checked") !== undefined;
}

/** Returns mutable state only for controls that need to store it. */
export function checkState(node: Raw.Element): CheckState {
  let state = states.get(node);
  if (!state) {
    state = { checked: checkedness(node), dirty: false, indeterminate: false };
    states.set(node, state);
  }
  return state;
}

/** Updates an existing clean state when the default attribute changes. */
export function updateDefaultCheckedness(node: Raw.Element): boolean {
  const state = states.get(node);
  if (state?.dirty) return false;
  const checked = attribute(node, "checked") !== undefined;
  if (state) state.checked = checked;
  return checked;
}

/** Preserves checkedness and indeterminateness on a clone of an input. */
export function copyCheckState(source: Raw.Element, target: Raw.Element): void {
  const state = states.get(source);
  if (state) states.set(target, { ...state });
}
