// Serializes the declaration values common stylesheets use exactly as the pinned reference grammar does, so they never load the reference engine.
// Every function returns undefined to decline; callers then use the reference grammar. Admitted
// shapes and every table here are compared with the reference engine by css-direct-values.test.ts.

/** The reference serializes numbers to six significant digits. */
function serializeNumber(value: number): string {
  return `${Number(value.toPrecision(6))}`;
}

const number = String.raw`[+-]?(?:\d{0,9}\.\d{1,9}|\d{1,9})(?:e[+-]?\d{1,2})?`;
const dimension = new RegExp(`^(${number})(px|em|rem|%|vh|vw)?$`, "i");
const time = new RegExp(`^(${number})(s|ms)$`);

type Accepts = {
  readonly negative: boolean;
  readonly percent: boolean;
  readonly unitless: boolean;
};
const length: Accepts = { negative: true, percent: true, unitless: false };
const nonNegative: Accepts = { negative: false, percent: true, unitless: false };
const dimensionProperties = new Map<string, Accepts>([
  ["font-size", nonNegative],
  ["letter-spacing", { negative: true, percent: false, unitless: false }],
  ["line-height", { negative: false, percent: true, unitless: true }],
  ["width", nonNegative],
  ["height", nonNegative],
  ["min-width", nonNegative],
  ["min-height", nonNegative],
  ["margin-top", length],
  ["margin-right", length],
  ["margin-bottom", length],
  ["margin-left", length],
  ["padding-top", nonNegative],
  ["padding-right", nonNegative],
  ["padding-bottom", nonNegative],
  ["padding-left", nonNegative],
]);

/** Serializes one length or percentage (or a number where `accepts.unitless`). */
function serializeDimension(text: string, accepts: Accepts): string | undefined {
  const match = dimension.exec(text);
  if (!match) return undefined;
  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  if ((!accepts.negative && value < 0) || Object.is(value, -0)) return undefined;
  if (unit === "%" && !accepts.percent) return undefined;
  if (unit === undefined) {
    if (accepts.unitless) return serializeNumber(value);
    return value === 0 ? "0px" : undefined;
  }
  return serializeNumber(value) + unit;
}

// The reference grammar's <generic-font-complete> and <generic-font-incomplete> keywords, and the
// CSS-wide keywords plus "default", which a family name cannot be.
const genericFamilies = new Set([
  "serif",
  "sans-serif",
  "system-ui",
  "cursive",
  "fantasy",
  "math",
  "monospace",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
]);
const reservedWords = new Set(["default", "initial", "inherit", "unset", "revert", "revert-layer"]);
const familyWord = /^-?[a-zA-Z_][\w-]*$/;
const quotedFamily = /^(?:"([\x20\x21\x23-\x5b\x5d-\x7e]*)"|'([\x20-\x26\x28-\x5b\x5d-\x7e]*)')$/;

function serializeFamily(text: string): string | undefined {
  const quoted = quotedFamily.exec(text);
  if (quoted) {
    const name = quoted[1] ?? quoted[2] ?? "";
    const words = name.split(" ");
    // A word that is not plainly an identifier may serialize either way; leave it to the grammar.
    if (words.some((word) => word !== "" && !familyWord.test(word))) return undefined;
    const bare =
      !genericFamilies.has(words[0]!.toLowerCase()) &&
      (words.length > 1 || !reservedWords.has(words[0]!.toLowerCase())) &&
      words.every((word) => word !== "");
    return bare ? name : `"${name.replaceAll('"', '\\"')}"`;
  }
  const words = text.split(/[ \t\n]+/);
  if (!words.every((word) => familyWord.test(word))) return undefined;
  const first = words[0]!.toLowerCase();
  if (words.length === 1 && genericFamilies.has(first)) return first;
  if (words.some((word) => genericFamilies.has(word.toLowerCase()))) return undefined;
  if (words.some((word) => reservedWords.has(word.toLowerCase()))) return undefined;
  return words.join(" ");
}

function serializeFamilyList(value: string): string | undefined {
  const families: string[] = [];
  for (const part of value.split(",")) {
    const family = serializeFamily(part.trim());
    if (family === undefined) return undefined;
    families.push(family);
  }
  return families.join(", ");
}

/** Returns the reference's specified serialization of a declaration value, or undefined to decline. */
export function directSpecifiedValue(name: string, value: string): string | undefined {
  if (name === "font-family") return serializeFamilyList(value);
  const accepts = dimensionProperties.get(name);
  return accepts && serializeDimension(value, accepts);
}

const radiusLonghands = [
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
] as const;

/** Mirrors the reference's side simplification: drop each side equal to its opposite. */
function simplifySides(sides: readonly string[]): string {
  const kept = [...sides];
  for (let index = kept.length - 1; index > 0; index--) {
    if (kept[index] !== (kept[index - 2] ?? kept[0])) break;
    kept.pop();
  }
  return kept.join(" ");
}

export type DirectExpansion = { text: string; entries: [string, string][] };

function expandBorderRadius(value: string): DirectExpansion | undefined {
  const parts = value.trim().split(/[ \t\n]+/);
  if (parts.length > 4) return undefined;
  const sides: string[] = [];
  for (const part of parts) {
    const side = serializeDimension(part, nonNegative);
    if (side === undefined) return undefined;
    sides.push(side);
  }
  const [top = "", right = top, bottom = top, left = right] = sides;
  const corners = [top, right, bottom, left];
  return {
    text: simplifySides(corners),
    entries: radiusLonghands.map((name, index) => [name, corners[index]!]),
  };
}

const easingKeywords = new Set(["ease", "linear", "ease-in", "ease-out", "ease-in-out"]);
// Transition property names that the shorthand grammar or its serializer treats specially.
const reservedTransitionNames = new Set([
  ...reservedWords,
  "none",
  "all",
  "normal",
  "allow-discrete",
  "step-start",
  "step-end",
  ...easingKeywords,
]);
const transitionName = /^[a-z][a-z-]*$/;
const cubicBezier = new RegExp(
  `^cubic-bezier\\(\\s*(${number})\\s*,\\s*(${number})\\s*,\\s*(${number})\\s*,\\s*(${number})\\s*\\)$`,
);

function serializeTime(text: string | undefined, negative: boolean): string | undefined {
  const match = text === undefined ? undefined : time.exec(text);
  if (!match) return undefined;
  const value = Number(match[1]);
  if ((!negative && value < 0) || Object.is(value, -0)) return undefined;
  return serializeNumber(value) + match[2];
}

function serializeEasing(text: string): string | undefined {
  if (easingKeywords.has(text)) return text;
  const curve = cubicBezier.exec(text);
  if (!curve) return undefined;
  const points = curve.slice(1, 5).map(Number);
  if (points[0]! < 0 || points[0]! > 1 || points[2]! < 0 || points[2]! > 1) return undefined;
  return `cubic-bezier(${points.map(serializeNumber).join(", ")})`;
}

/** Serializes a list of easing keywords and cubic-bezier() curves, or returns undefined to decline. */
export function directEasingList(value: string): string | undefined {
  const easings: string[] = [];
  for (const part of value.split(/,(?![^(]*\))/)) {
    const easing = serializeEasing(part.trim());
    if (easing === undefined) return undefined;
    easings.push(easing);
  }
  return easings.join(", ");
}

/** Reads `<property>? <duration>? <easing>? <delay>?` in that order; other orders decline. */
function readTransition(layer: string): [string, string, string, string, string] | undefined {
  const tokens = layer.trim().match(/cubic-bezier\([^)]*\)|[^ \t\n]+/g) ?? [];
  let at = 0;
  let property = "all";
  const first = tokens[0];
  if (first !== undefined && transitionName.test(first) && !first.startsWith("cubic-bezier(")) {
    if (reservedTransitionNames.has(first)) return undefined;
    property = first;
    at++;
  }
  let duration = "0s";
  let easing = "ease";
  let delay = "0s";
  if (at < tokens.length) {
    const parsed = serializeTime(tokens[at], false);
    if (parsed === undefined) return undefined;
    duration = parsed;
    at++;
  }
  if (at < tokens.length && !time.test(tokens[at]!)) {
    const parsed = serializeEasing(tokens[at]!);
    if (parsed === undefined) return undefined;
    easing = parsed;
    at++;
  }
  if (at < tokens.length) {
    const parsed = serializeTime(tokens[at], true);
    if (parsed === undefined) return undefined;
    delay = parsed;
    at++;
  }
  if (at !== tokens.length || tokens.length === 0) return undefined;
  return [duration, easing, delay, "normal", property];
}

const transitionLonghands = [
  "transition-duration",
  "transition-timing-function",
  "transition-delay",
  "transition-behavior",
  "transition-property",
] as const;
const transitionInitials = ["0s", "ease", "0s", "normal", "all"] as const;

function expandTransition(value: string): DirectExpansion | undefined {
  const layers: [string, string, string, string, string][] = [];
  // Commas inside cubic-bezier() do not separate layers.
  for (const text of value.split(/,(?![^(]*\))/)) {
    const layer = readTransition(text);
    if (!layer) return undefined;
    layers.push(layer);
  }
  return {
    text: representTransition(layers),
    entries: transitionLonghands.map((name, index) => [
      name,
      layers.map((layer) => layer[index]).join(", "),
    ]),
  };
}

/** The reference's representTransition: the property name leads unless the delay is kept. */
function representTransition(layers: readonly (readonly string[])[]): string {
  return layers
    .map((values) => {
      const order = [4, 0, 1, 2, 3];
      const components = order
        .filter(
          (component) =>
            (component === 0 && values[2] !== "0s") ||
            values[component] !== transitionInitials[component],
        )
        .map((component) => values[component]);
      return components.length ? components.join(" ") : "all";
    })
    .join(", ");
}

/** Accepts one serialized longhand component exactly as the reference would print it. */
const transitionComponent: readonly ((text: string) => boolean)[] = [
  (text) => serializeTime(text, false) === text,
  (text) => directEasingList(text) === text,
  (text) => serializeTime(text, true) === text,
  (text) => text === "normal",
  (text) => transitionName.test(text) && !reservedTransitionNames.has(text),
];

function serializeTransition(read: (name: string) => string): string | undefined {
  const lists = transitionLonghands.map((name) => read(name).split(/,(?![^(]*\))/));
  const count = lists[0]!.length;
  if (lists.some((list) => list.length !== count)) return undefined;
  const layers: string[][] = [];
  for (let index = 0; index < count; index++) {
    const layer = lists.map((list) => list[index]!.trim());
    if (!layer.every((text, component) => transitionComponent[component]!(text))) return undefined;
    layers.push(layer);
  }
  return representTransition(layers);
}

/**
 * Serializes a shorthand from its stored longhand texts as the reference does, or returns
 * undefined to decline. `read` returns each longhand's (non-empty) text.
 */
export function directShorthand(name: string, read: (name: string) => string): string | undefined {
  if (name === "transition") return serializeTransition(read);
  if (name !== "border-radius") return undefined;
  const corners = radiusLonghands.map(read);
  if (!corners.every((corner) => serializeDimension(corner, nonNegative) === corner))
    return undefined;
  return simplifySides(corners);
}

/** Returns the reference's expansion of a shorthand value, or undefined to decline. */
export function directExpansion(name: string, value: string): DirectExpansion | undefined {
  if (name === "border-radius") return expandBorderRadius(value);
  if (name === "transition") return expandTransition(value);
  return undefined;
}
