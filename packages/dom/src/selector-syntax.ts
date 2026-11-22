// Contains syntax errors at forgiving selector-list boundaries before strict AST parsing.
import { createRequire } from "node:module";
import type { CssNode } from "css-tree";
const require = createRequire(import.meta.url);
type Region = { start: number; content: number; end: number; stop: number; children: Region[] };
type Tokenizer = {
  tokenTypes: Record<string, number>;
  tokenize: (source: string, visit: (type: number, start: number, end: number) => void) => void;
};

/** Validates type-selector placement and canonicalizes attribute modifiers inside a compound. */
export function validSelectorCompounds(selector: Extract<CssNode, { type: "Selector" }>): boolean {
  let hasSimple = false;
  for (const part of selector.children) {
    if (part.type === "Combinator") {
      hasSimple = false;
      continue;
    }
    if (part.type === "TypeSelector" && hasSimple) return false;
    if (part.type === "AttributeSelector" && part.flags) {
      const { ident }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
      const flag = ident.decode(part.flags);
      if (!part.matcher || !/^[iIsS]$/.test(flag)) return false;
      part.flags = flag.toLowerCase();
    }
    hasSimple = true;
  }
  return true;
}

/** Reads a functional :state() argument as one decoded CSS identifier. */
export function customStateIdentifier(node: CssNode): string {
  const css: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  if (node.type !== "PseudoClassSelector" || !node.children)
    throw new SyntaxError(":state requires an identifier");
  const argument = node.children
    .toArray()
    .map((child) => css.generate(child))
    .join("");
  const value = css.parse(argument, { context: "value" });
  if (
    value.type !== "Value" ||
    value.children.size !== 1 ||
    value.children.first?.type !== "Identifier"
  )
    throw new SyntaxError(":state requires one identifier");
  return css.ident.decode(value.children.first.name);
}

/** Preprocesses CSS Unicode and recovers end-of-input tokens before DOM selector matching. */
export function normalizeSelector(source: string): string {
  let text = source
    .toWellFormed()
    .replace(/\0/g, "�")
    .replace(/\r\n?|\f/g, "\n");
  const css: typeof import("css-tree") & Tokenizer = require("./css-runtime.cjs").cssTree;
  const endings: string[] = [];
  let suffix = "";
  let trailingComma = false;
  css.tokenize(text, (type, start, end) => {
    if (!endings.length && type !== css.tokenTypes.WhiteSpace && type !== css.tokenTypes.Comment)
      trailingComma = type === css.tokenTypes.Comma;
    if (type === css.tokenTypes.Function || type === css.tokenTypes.LeftParenthesis)
      endings.push(")");
    else if (type === css.tokenTypes.LeftSquareBracket) endings.push("]");
    else if (type === css.tokenTypes.RightParenthesis || type === css.tokenTypes.RightSquareBracket)
      endings.pop();
    if (end !== text.length) return;
    if (type === css.tokenTypes.Delim && text.slice(start, end) === "\\")
      text = text.slice(0, -1) + "�";
    else if (type === css.tokenTypes.String && (end - start === 1 || text[end - 1] !== text[start]))
      suffix = text[start] ?? "";
  });
  if (trailingComma) throw new Error("Empty branch in selector list");
  return text + suffix + endings.reverse().join("");
}

/** Parses selector syntax, discarding malformed branches only inside :is() and :where(). */
export function parseSelectorList(source: string): CssNode {
  const css: typeof import("css-tree") & Tokenizer = require("./css-runtime.cjs").cssTree;
  // CSSTree recognizes pseudo tokens but does not constrain a pseudo-element's
  // arguments or what can follow it. Validate transition selectors before matching.
  if (/::view-transition/i.test(source) && !source.includes("|")) {
    const {
      parseGrammar,
    }: {
      parseGrammar: (text: string, grammar: string) => unknown;
    } = require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js");
    const {
      isFailure,
    }: {
      isFailure: (result: unknown) => boolean;
    } = require("rundom-css-reference/lib/jsdom/living/css/values/value.js");
    if (isFailure(parseGrammar(source, "<complex-selector-list>")))
      throw new SyntaxError("Invalid view-transition pseudo-element selector");
  }
  if (!/:(?:is|where)\(/i.test(source) && !source.includes("\\"))
    return css.parse(source, { context: "selectorList" });
  const roots: Region[] = [];
  const stack: { closing: number | undefined; region?: Region; enclosing?: Region }[] = [];
  css.tokenize(source, (type, start, end) => {
    if (
      type === css.tokenTypes.Function ||
      type === css.tokenTypes.LeftParenthesis ||
      type === css.tokenTypes.LeftSquareBracket
    ) {
      const closing =
        type === css.tokenTypes.LeftSquareBracket
          ? css.tokenTypes.RightSquareBracket
          : css.tokenTypes.RightParenthesis;
      const enclosing = stack.at(-1)?.enclosing;
      const name =
        type === css.tokenTypes.Function
          ? css.ident.decode(source.slice(start, end - 1)).toLowerCase()
          : "";
      if ((name === "is" || name === "where") && source[start - 1] === ":") {
        const region: Region = {
          start,
          content: end,
          end: source.length,
          stop: source.length,
          children: [],
        };
        (enclosing?.children ?? roots).push(region);
        stack.push({ closing, region, enclosing: region });
      } else stack.push(enclosing ? { closing, enclosing } : { closing });
    } else if (
      type === css.tokenTypes.RightParenthesis ||
      type === css.tokenTypes.RightSquareBracket
    ) {
      const frame = stack.pop();
      if (frame?.closing !== type) throw new SyntaxError("Mismatched selector delimiter");
      if (frame?.region) {
        frame.region.end = start;
        frame.region.stop = end;
      }
    }
  });
  function rewrite(start: number, end: number, regions: readonly Region[]): string {
    let text = "",
      cursor = start;
    // Regions are disjoint children of one finite token range; recursive ranges strictly shrink.
    for (const region of regions) {
      text += source.slice(cursor, region.content);
      const content = rewrite(region.content, region.end, region.children);
      const branches: string[] = [];
      let depth = 0,
        branchStart = 0;
      function take(stop: number) {
        const branch = content.slice(branchStart, stop).trim();
        branchStart = stop + 1;
        if (!branch) return;
        try {
          css.parse(branch, { context: "selector" });
          branches.push(branch);
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
      }
      css.tokenize(content, (type, from) => {
        if (
          type === css.tokenTypes.Function ||
          type === css.tokenTypes.LeftParenthesis ||
          type === css.tokenTypes.LeftSquareBracket
        )
          depth++;
        else if (
          type === css.tokenTypes.RightParenthesis ||
          type === css.tokenTypes.RightSquareBracket
        )
          depth--;
        else if (type === css.tokenTypes.Comma && depth === 0) take(from);
      });
      take(content.length);
      text += branches.join(", ") + source.slice(region.end, region.stop);
      cursor = region.stop;
    }
    return text + source.slice(cursor, end);
  }
  return css.parse(roots.length ? rewrite(0, source.length, roots) : source, {
    context: "selectorList",
  });
}

/** Recognizes an entire selector whose subject is a CSS pseudo-element. */
export function purePseudoSelector(
  source: string,
): { text: string; specificity: readonly [number, number, number] } | null | undefined {
  if (
    !source.startsWith("::") ||
    source.includes(",") ||
    source.includes("&") ||
    (!source.includes("(") && !source.slice(2).includes(":"))
  )
    return;
  const {
    parseGrammar,
  }: {
    parseGrammar(t: string, g: string): unknown;
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js");
  const parsed = parseGrammar(source, "<complex-selector-list>");
  if (!Array.isArray(parsed)) return null;
  const selector = parsed[0];
  if (parsed.length !== 1 || selector?.units?.length !== 1 || !selector.units[0].pseudos?.length)
    return;
  const {
    serializeComponentValue,
  }: {
    serializeComponentValue(v: unknown): string;
  } = require("rundom-css-reference/lib/jsdom/living/css/serialize.js");
  const {
    getSelectorSpecificity,
  }: {
    getSelectorSpecificity(v: unknown): readonly [number, number, number];
  } = require("rundom-css-reference/lib/jsdom/living/css/utils/selector-specificity.js");
  return { text: serializeComponentValue(parsed), specificity: getSelectorSpecificity(selector) };
}
