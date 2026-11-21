// Adapts numeric CSS grammar context and serialization without replacing the native math evaluator.
import { createRequire } from "node:module";
import type { CssNode } from "css-tree";
const require = createRequire(import.meta.url);
const basisFreeDimensions = new Set(["angle", "time", "frequency", "resolution"]);

/** Rejects percentages consumed by dimensional grammar terms with no percentage basis. */
export function hasContextlessPercentage(property: string, value: string): boolean {
  if (!value.includes("%") || !/[a-z-]+\(/i.test(value) || /var\(/i.test(value)) return false;
  const {
    parse,
    walk,
    lexer,
  }: Pick<typeof import("css-tree"), "parse" | "walk"> & {
    lexer: {
      matchProperty(
        name: string,
        ast: CssNode,
      ): {
        error: unknown;
        getTrace(node: CssNode): { name: string }[] | null;
      };
    };
  } = require("./css-runtime.cjs").cssTree;
  try {
    const ast = parse(value, { context: "value" });
    const match = lexer.matchProperty(property, ast);
    if (match.error !== null) return false;
    let invalid = false;
    walk(ast, (node) => {
      if (node.type !== "Percentage") return;
      if (match.getTrace(node)?.some((term) => basisFreeDimensions.has(term.name))) invalid = true;
    });
    return invalid;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return false;
  }
}

/** Orders unresolved sums with the provider evaluator and spaces only comma tokens. */
export function serializeCSSMath(value: string): string {
  const { utils }: typeof import("@asamuzakjp/css-color") = require("./css-runtime.cjs").cssColor;
  const normalized = utils.cssCalc(value, { format: "specifiedValue" });
  const css: {
    tokenTypes: { Comma: number };
    tokenize(text: string, visit: (type: number, start: number, end: number) => void): void;
  } = require("./css-runtime.cjs").cssTree;
  let result = "";
  let previous = 0;
  css.tokenize(normalized, (type, start, end) => {
    if (type !== css.tokenTypes.Comma) return;
    result += normalized.slice(previous, start) + ", ";
    previous = end;
    while (/\s/.test(normalized[previous] ?? "")) previous++;
  });
  return result + normalized.slice(previous);
}
