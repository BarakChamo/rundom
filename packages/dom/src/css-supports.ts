// Evaluates CSS feature queries using the same syntax and selector parsers as stylesheets.
import { ownedString } from "./owned-string.js";
import { createRequire } from "node:module";
import { parseSizeDeclaration } from "./css-sizing.js";
import { hasContextlessPercentage } from "./css-numeric.js";
import type { CssNode, Declaration, List } from "css-tree";

const require = createRequire(import.meta.url);

// css-tree's type declarations do not yet describe its conditional-rule nodes.
type ConditionNode =
  | CssNode
  | { type: "SupportsDeclaration"; declaration: Declaration }
  | { type: "FeatureFunction"; feature: string; value: CssNode }
  | { type: "GeneralEnclosed"; function: string | null; children: List<CssNode> }
  | { type: "Condition"; kind: string; children: List<ConditionNode> };

function supportedDeclaration(property: string, value: CssNode | string): boolean {
  const { parse, generate }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  if (!/^(?:--[^\s:]+|-?[a-z][a-z0-9-]*)$/i.test(property)) return false;
  let parsed: CssNode;
  try {
    parsed = typeof value === "string" ? parse(value, { context: "value" }) : value;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return false;
  }
  if (property.startsWith("--")) return true;
  const propertyName = property.toLowerCase();
  const {
    cssPropertyDefinitions,
  }: {
    cssPropertyDefinitions: ReadonlyMap<string, { legacyAliasOf?: string }>;
  } = require("./css-runtime.cjs");
  const name = cssPropertyDefinitions.get(propertyName)?.legacyAliasOf ?? propertyName;
  const text = generate(parsed);
  if (name === "size") return parseSizeDeclaration(text) !== undefined;
  if (hasContextlessPercentage(name, text)) return false;
  // Use the same patched grammar as CSSStyleDeclaration without initializing its prototype.
  const { parsePropertyValue }: { parsePropertyValue: (name: string, value: string) => unknown } =
    require("./css-runtime.cjs").cssValueParser;
  const result = parsePropertyValue(name, text.toLowerCase() === "revert-rule" ? "initial" : text);
  return result !== undefined && result !== "";
}

// Keep this aligned with the at-rules that the stylesheet reader exposes through CSSOM.
const supportedAtRules = new Set(["font-face", "import", "media", "supports"]);

function parseAtRuleName(source: string): string | undefined {
  const css: Pick<typeof import("css-tree"), "ident"> & {
    tokenTypes: Record<string, number>;
    tokenize: (text: string, visit: (type: number, start: number, end: number) => void) => void;
  } = require("./css-runtime.cjs").cssTree;
  const { AtKeyword, WhiteSpace, Comment } = css.tokenTypes;
  let name: string | undefined;
  let extraToken = false;
  css.tokenize(source, (type, start, end) => {
    if (type === WhiteSpace || type === Comment) return;
    if (type === AtKeyword && name === undefined) {
      name = css.ident.decode(source.slice(start + 1, end));
    } else {
      extraToken = true;
    }
  });
  return extraToken ? undefined : name;
}

function atRuleArgument(node: ConditionNode) {
  if (node.type !== "GeneralEnclosed" || node.function?.toLowerCase() !== "at-rule") return;
  const argument = node.children.first;
  if (argument?.type === "Raw") return argument;
}

function evaluateCondition(
  node: ConditionNode,
  selector: (source: string) => boolean,
  depth = 0,
): boolean | undefined {
  if (node.type === "SupportsDeclaration")
    return supportedDeclaration(node.declaration.property, node.declaration.value);
  if (node.type === "FeatureFunction" && node.feature === "selector") {
    const { generate }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
    return selector(generate(node.value));
  }
  if (node.type === "GeneralEnclosed") {
    const argument = atRuleArgument(node);
    const name = argument && parseAtRuleName(argument.value);
    return name !== undefined && supportedAtRules.has(name.toLowerCase());
  }
  if (node.type === "FeatureFunction") return false;
  if (node.type !== "Condition" || node.kind !== "supports") return undefined;

  const terms = node.children.toArray();
  const first = terms[0];
  if (!first) return undefined;
  // A nested parenthesized unknown ident is valid general-enclosed syntax.
  // The same bare ident at the top level is not a supports condition.
  if (
    depth > 0 &&
    terms.length === 1 &&
    first.type === "Identifier" &&
    first.name.toLowerCase() !== "not"
  )
    return false;
  // Recursion follows the finite condition tree produced by the parser.
  if (first.type === "Identifier" && first.name.toLowerCase() === "not") {
    const operand = terms[1];
    if (terms.length !== 2 || !operand) return undefined;
    const value = evaluateCondition(operand, selector, depth + 1);
    return value === undefined ? undefined : !value;
  }
  let result = evaluateCondition(first, selector, depth + 1);
  if (result === undefined) return undefined;
  let operator: string | undefined;
  for (let index = 1; index < terms.length; index += 2) {
    const combinator = terms[index];
    const operand = terms[index + 1];
    if (combinator?.type !== "Identifier" || !operand) return undefined;
    const next = combinator.name.toLowerCase();
    if ((next !== "and" && next !== "or") || (operator && next !== operator)) return undefined;
    const value = evaluateCondition(operand, selector, depth + 1);
    if (value === undefined) return undefined;
    result = next === "and" ? result && value : result || value;
    operator = next;
  }
  return result;
}

function parseCondition(text: string, positions = false): CssNode | undefined {
  const { parse }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  try {
    const prelude = parse(text, { context: "atrulePrelude", atrule: "supports", positions });
    if (prelude.type === "AtrulePrelude") return prelude.children.first ?? undefined;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return undefined;
}

/** Parses the stylesheet condition and preserves its spelling outside at-rule() arguments. */
export function readSupportsCondition(
  text: string,
  selector: (source: string) => boolean,
): { conditionText: string; matches: boolean } | undefined {
  const hasAtRuleFunction = /at-rule\(/i.test(text);
  const condition = parseCondition(text, hasAtRuleFunction);
  if (!condition) return;
  const matches = evaluateCondition(condition, selector);
  if (matches === undefined) return;
  if (!hasAtRuleFunction) return { conditionText: text, matches };

  const { ident, walk }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  let end = 0;
  let conditionText = "";
  walk(condition, (node: ConditionNode) => {
    const argument = atRuleArgument(node);
    if (!argument?.loc) return;
    const name = parseAtRuleName(argument.value);
    if (name === undefined) return;
    conditionText += text.slice(end, argument.loc.start.offset) + `@${ident.encode(name)}`;
    end = argument.loc.end.offset;
  });
  return { conditionText: conditionText + text.slice(end), matches };
}

/** Creates the Window CSS namespace and shares its condition evaluator with CSS imports. */
export function createCSSNamespace(selector: (source: string) => boolean) {
  const namespace = {
    supports(conditionOrProperty: string, value?: string): boolean {
      if (arguments.length === 0) throw new TypeError("A CSS condition or property is required");
      const source = ownedString(`${conditionOrProperty}`);
      if (arguments.length > 1) return supportedDeclaration(source, ownedString(`${value}`));
      const condition = parseCondition(source) ?? parseCondition(`(${source})`);
      return condition !== undefined && evaluateCondition(condition, selector) === true;
    },
    escape(value: string): string {
      if (arguments.length === 0) throw new TypeError("A CSS identifier is required");
      const { ident }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
      return ident.encode(`${value}`);
    },
  };
  Object.defineProperty(namespace, Symbol.toStringTag, { value: "CSS", configurable: true });
  return namespace;
}
