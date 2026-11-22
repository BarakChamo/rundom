// Owns the headless system palette and adapts theme-dependent colors to the interpolation library.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
type PaletteColor = readonly [light: string, dark: string];
const black = "rgb(0, 0, 0)";
const white = "rgb(255, 255, 255)";
const foreground: PaletteColor = [black, white];
const background: PaletteColor = [white, black];
const selection: PaletteColor = ["rgb(0, 153, 255)", "rgb(0, 51, 255)"];
// System palettes are UA-defined. Keep the deterministic jsdom 30.1.3 palette,
// including its button-text value, so headless consumers have reproducible results.
const palette = new Map<string, PaletteColor>([
  ["accentcolor", selection],
  ["accentcolortext", foreground],
  ["activetext", ["rgb(255, 0, 0)", "rgb(255, 102, 102)"]],
  ["buttonborder", ["rgb(51, 51, 51)", "rgb(204, 204, 204)"]],
  ["buttonface", ["rgb(204, 204, 204)", "rgb(51, 51, 51)"]],
  ["buttontext", [black, "rgb(255, 255, 155)"]],
  ["canvas", background],
  ["canvastext", foreground],
  ["field", background],
  ["fieldtext", foreground],
  ["graytext", ["rgb(102, 102, 102)", "rgb(153, 153, 153)"]],
  ["highlight", selection],
  ["highlighttext", background],
  ["linktext", ["rgb(0, 0, 255)", "rgb(0, 204, 255)"]],
  ["mark", ["rgb(255, 255, 0)", "rgb(204, 0, 153)"]],
  ["marktext", foreground],
  ["selecteditem", selection],
  ["selecteditemtext", foreground],
  ["visitedtext", ["rgb(128, 0, 128)", "rgb(255, 51, 255)"]],
]);
const aliases = new Map([
  ["activeborder", "buttonborder"],
  ["activecaption", "canvas"],
  ["appworkspace", "canvas"],
  ["background", "canvas"],
  ["buttonhighlight", "buttonface"],
  ["buttonshadow", "buttonface"],
  ["captiontext", "canvastext"],
  ["inactiveborder", "buttonborder"],
  ["inactivecaption", "canvas"],
  ["inactivecaptiontext", "graytext"],
  ["infobackground", "canvas"],
  ["infotext", "canvastext"],
  ["menu", "canvas"],
  ["menutext", "canvastext"],
  ["scrollbar", "canvas"],
  ["threeddarkshadow", "buttonborder"],
  ["threedface", "buttonface"],
  ["threedhighlight", "buttonborder"],
  ["threedlightshadow", "buttonborder"],
  ["threedshadow", "buttonborder"],
  ["window", "canvas"],
  ["windowframe", "buttonborder"],
  ["windowtext", "canvastext"],
]);

/** Resolves a system keyword; absence means the token is not a system color. */
export function systemColor(value: string, scheme: string): string | undefined {
  const keyword = value.toLowerCase();
  const color = palette.get(aliases.get(keyword) ?? keyword);
  if (!color) return undefined;
  // The headless UA prefers light when both schemes are available.
  const dark = /\bdark\b/i.test(scheme) && !/\blight\b/i.test(scheme);
  return color[dark ? 1 : 0];
}

/** Substitutes color identifiers in validated color/paint values, never strings or URL tokens. */
export function replaceSystemColors(value: string, scheme: string): string {
  const direct = systemColor(value, scheme);
  if (direct) return direct;
  if (!/[\s(\\]/.test(value)) return value;
  const css: Pick<typeof import("css-tree"), "ident"> & {
    tokenTypes: { Ident: number };
    tokenize: (text: string, visit: (type: number, start: number, end: number) => void) => void;
  } = require("./css-runtime.cjs").cssTree;
  let output = "";
  let end = 0;
  css.tokenize(value, (type, start, stop) => {
    if (type !== css.tokenTypes.Ident) return;
    const color = systemColor(css.ident.decode(value.slice(start, stop)), scheme);
    if (!color) return;
    output += value.slice(end, start) + color;
    end = stop;
  });
  return end ? output + value.slice(end) : value;
}

// The relative-color grammar and precision follow the pinned jsdom CSS implementation.
const functionalColor =
  /^\s*(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|contrast-color)\(/i;
export function functionalColorValue(
  value: string,
  currentColor?: string,
  scheme = "light",
): string | undefined {
  if (!functionalColor.test(value)) return;
  const {
    parseGrammar,
  }: {
    parseGrammar: (source: string, grammar: string) => unknown;
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js");
  const {
    isFailure,
  }: {
    isFailure: (value: unknown) => boolean;
  } = require("rundom-css-reference/lib/jsdom/living/css/values/value.js");
  const {
    serializeComponentValue,
  }: {
    serializeComponentValue: (value: unknown) => string;
  } = require("rundom-css-reference/lib/jsdom/living/css/serialize.js");
  const parsed = parseGrammar(
    currentColor === undefined ? value : replaceSystemColors(value, scheme),
    "<color>",
  );
  if (isFailure(parsed)) return;
  if (currentColor === undefined) return serializeComponentValue(parsed);
  const {
    resolveColor,
  }: {
    resolveColor: (value: unknown, context: object) => unknown;
  } = require("rundom-css-reference/lib/jsdom/living/css/utils/resolve-color.js");
  const resolved = resolveColor(parsed, {
    used: true,
    colorScheme: () => (scheme.includes("dark") && !scheme.startsWith("light") ? "dark" : "light"),
    get currentColor() {
      return parseGrammar(currentColor, "<color>");
    },
  });
  return resolved ? serializeComponentValue(resolved) : undefined;
}

/** Preserves authored color channels until computed-value resolution, including inherited variables. */
export function specifiedColorFunction(value: string): string | undefined {
  return /var\(/i.test(value) ? undefined : functionalColorValue(value);
}
