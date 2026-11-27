// Extends the pinned CSS parser's style-block dispatch while retaining its tokenizer and recovery.
import { createRequire } from "node:module";
import type { Block, CssLocation, CssNode, List, ParseOptions } from "css-tree";
import { scanFlatStyleSheet, UnreadDeclarationBlock } from "./css-flat-sheet.js";
const require = createRequire(import.meta.url);
type Parse = typeof import("css-tree").parse;
type Tokens = {
  BadString: number;
  Delim: number;
  Comma: number;
  Colon: number;
  Ident: number;
  WhiteSpace: number;
  Comment: number;
  Semicolon: number;
  AtKeyword: number;
  LeftCurlyBracket: number;
  RightCurlyBracket: number;
  Function: number;
  LeftParenthesis: number;
  RightParenthesis: number;
  LeftSquareBracket: number;
  RightSquareBracket: number;
};
type Consumer = (this: BlockParser) => CssNode;
type BlockParser = {
  tokenType: number;
  tokenStart: number;
  tokenEnd: number;
  tokenIndex: number;
  tokenCount: number;
  parseValue: boolean;
  parseCustomProperty: boolean;
  source: string;
  eof: boolean;
  createList: () => List<CssNode>;
  getLocation: (start: number, end: number) => CssLocation | null;
  eat: (type: number) => void;
  next: () => void;
  lookupType: (offset: number) => number;
  getTokenType: (index: number) => number;
  getTokenStart: (index: number) => number;
  getTokenEnd: (index: number) => number;
  getBlockTokenPairIndex: (index: number) => number;
  skip: (count: number) => void;
  isDelim: (character: number) => boolean;
  parseWithFallback: (consume: Consumer, fallback: Consumer) => CssNode;
  Rule: Consumer;
  Declaration: Consumer;
  Atrule: (nested: boolean) => CssNode;
  Block: (nested: boolean) => Block;
  Raw: (stop: ((type: number) => number) | null, trim: boolean) => CssNode;
  consumeUntilSemicolonIncluded: (type: number) => number;
};
type ParserConfiguration = {
  node: {
    StyleSheet: { parse: Consumer };
    Block: { parse: BlockParser["Block"] };
  };
  atrule: { scope: { parse: { block: (this: BlockParser) => Block } } };
};
type Syntax = {
  List: new <T>() => List<T>;
  parse: Parse;
  tokenTypes: Tokens;
  tokenize: (source: string, visit: (type: number, start: number, end: number) => void) => void;
  ident: { decode: (value: string) => string };
  fork: (extend: (configuration: ParserConfiguration) => ParserConfiguration) => { parse: Parse };
};
let syntax: Syntax | undefined;
let extendedParse: Parse | undefined;
function css(): Syntax {
  return (syntax ??= require("./css-runtime.cjs").cssTree);
}

function raw(this: BlockParser): CssNode {
  return this.Raw(null, true);
}
function rawDeclaration(this: BlockParser): CssNode {
  return this.Raw(this.consumeUntilSemicolonIncluded, true);
}
function rule(this: BlockParser): CssNode {
  return this.parseWithFallback(this.Rule, raw);
}
function declaration(this: BlockParser): CssNode {
  const node = this.parseWithFallback(this.Declaration, rawDeclaration);
  if (this.tokenType === css().tokenTypes.Semicolon) this.next();
  return node;
}
function startsRule(parser: BlockParser): boolean {
  if (parser.isDelim(38)) return true;
  const tokens = css().tokenTypes;
  if (
    parser.tokenType === tokens.Ident &&
    css().ident.decode(parser.source.slice(parser.tokenStart, parser.tokenEnd)).startsWith("--")
  )
    return false;
  if (parser.tokenType === tokens.Ident) {
    let offset = 1;
    const skipTrivia = () => {
      while (
        parser.tokenIndex + offset < parser.tokenCount &&
        (parser.lookupType(offset) === tokens.WhiteSpace ||
          parser.lookupType(offset) === tokens.Comment)
      )
        offset++;
    };
    skipTrivia();
    if (parser.lookupType(offset) === tokens.Colon) {
      offset++;
      skipTrivia();
      if (parser.lookupType(offset) === tokens.LeftCurlyBracket) return false;
    }
  }
  let depth = 0;
  // Lookahead cannot exceed the finite native token stream; strings and comments are atomic tokens.
  for (let offset = 0; parser.tokenIndex + offset < parser.tokenCount; offset++) {
    const type = parser.lookupType(offset);
    if (
      type === tokens.Function ||
      type === tokens.LeftParenthesis ||
      type === tokens.LeftSquareBracket
    )
      depth++;
    else if (type === tokens.RightParenthesis || type === tokens.RightSquareBracket) depth--;
    else if (depth === 0) {
      if (type === tokens.LeftCurlyBracket) return true;
      if (type === tokens.Semicolon || type === tokens.RightCurlyBracket) return false;
    }
  }
  return false;
}
function block(this: BlockParser, nested = false): Block {
  const tokens = css().tokenTypes,
    start = this.tokenStart,
    children = this.createList();
  this.eat(tokens.LeftCurlyBracket);
  // Every iteration advances through native parsing or consumes one token; EOF bounds recovery.
  while (!this.eof && this.tokenType !== tokens.RightCurlyBracket) {
    if (
      this.tokenType === tokens.WhiteSpace ||
      this.tokenType === tokens.Comment ||
      this.tokenType === tokens.Semicolon
    ) {
      this.next();
      continue;
    }
    if (this.tokenType === tokens.AtKeyword) {
      children.push(
        this.parseWithFallback(function () {
          return this.Atrule(nested);
        }, raw),
      );
    } else children.push((!nested || startsRule(this) ? rule : declaration).call(this));
  }
  if (!this.eof) this.eat(tokens.RightCurlyBracket);
  const loc = this.getLocation(start, this.tokenStart);
  return { type: "Block", ...(loc ? { loc } : {}), children };
}

function hasNesting(parser: BlockParser): boolean {
  const { tokenTypes, ident } = css();
  let depth = 0;
  // The native tokenizer has already separated strings, URLs, escapes and comments.
  for (let i = 0; i < parser.tokenCount; i++) {
    const type = parser.getTokenType(i);
    if (type === tokenTypes.LeftCurlyBracket) {
      if (++depth > 1) return true;
    } else if (type === tokenTypes.RightCurlyBracket) depth--;
    else if (type === tokenTypes.AtKeyword) {
      const name = parser.source.slice(parser.getTokenStart(i) + 1, parser.getTokenEnd(i));
      if (ident.decode(name).toLowerCase() === "scope") return true;
    }
  }
  return false;
}

// These compact declarations have one explicit property, a raw value and a
// terminating semicolon. More involved syntax stays with native recovery.
const compactDeclarations =
  /^(?:(?:--|-?)[a-zA-Z_][\w-]*:(?:[a-zA-Z_0-9#%.,+ \t-]|var\(--[a-zA-Z_][\w-]*\))+;)+$/;

/** Tests leaf shape without expanding declarations whose source already proves it. */
export function hasOnlyDeclarations(block: Block): boolean {
  return (
    block instanceof UnreadDeclarationBlock ||
    !block.children.some((node) => node.type !== "Declaration")
  );
}

function unreadBlock(parser: BlockParser): Block | undefined {
  const closing = parser.getBlockTokenPairIndex(parser.tokenIndex);
  if (closing < 0) return;
  const start = parser.tokenEnd;
  const end = parser.getTokenStart(closing);
  if (end <= start || end - start > 4096) return;
  const source = parser.source.slice(start, end);
  if (!source.endsWith(";") || !compactDeclarations.test(source)) return;
  parser.skip(closing - parser.tokenIndex + 1);
  return new UnreadDeclarationBlock(source, css().List);
}

function nestingParser(configuration: ParserConfiguration): ParserConfiguration {
  const sheet = configuration.node.StyleSheet.parse;
  const ordinary = configuration.node.Block.parse;
  let nested = false;
  configuration.node.StyleSheet.parse = function () {
    const previous = nested;
    nested = hasNesting(this);
    try {
      return sheet.call(this);
    } finally {
      nested = previous;
    }
  };
  configuration.node.Block.parse = function (this: BlockParser, styleBlock) {
    if (
      styleBlock &&
      !this.parseValue &&
      !this.parseCustomProperty &&
      !this.getLocation(this.tokenStart, this.tokenEnd)
    ) {
      const unread = unreadBlock(this);
      if (unread) return unread;
    }
    return (nested ? block : ordinary).call(this, styleBlock);
  };
  configuration.atrule.scope.parse.block = function () {
    return this.Block(true);
  };
  return configuration;
}

/** Parses stylesheet structure using the same token stream for nesting detection and recovery. */
export function parseNestingStyleSheet(
  source: string,
  options: ParseOptions,
  report: (message: string) => void,
): CssNode {
  // Only tokenize separately when a raw delimiter count could reach the upstream
  // nesting limit, or multiline quoted text could contain a bad-string token.
  const openings = /[[({]/g;
  let count = 0;
  if (source.length >= 129) while (count < 129 && openings.test(source)) count++;
  if (count === 129 || (/["']/.test(source) && /[\n\r\f]/.test(source))) {
    const runtime = css();
    const tokens = runtime.tokenTypes;
    const stack: number[] = [];
    let exceeded = false;
    runtime.tokenize(source, (type) => {
      if (exceeded) return;
      if (type === tokens.BadString) report("Bad string");
      if (type === tokens.Function || type === tokens.LeftParenthesis)
        stack.push(tokens.RightParenthesis);
      else if (type === tokens.LeftCurlyBracket) stack.push(tokens.RightCurlyBracket);
      else if (type === tokens.LeftSquareBracket) stack.push(tokens.RightSquareBracket);
      else if (type === stack.at(-1)) stack.pop();
      exceeded = stack.length > 128;
    });
    if (exceeded) {
      const empty: CssNode = { type: "StyleSheet", children: new runtime.List<CssNode>() };
      report("CSS nesting limit exceeded");
      return empty;
    }
  }
  if (
    !options.positions &&
    options.parseRulePrelude === false &&
    options.parseAtrulePrelude === false &&
    options.parseValue === false
  ) {
    const flat = scanFlatStyleSheet(source, css().List);
    if (flat) return flat;
  }
  const first = source.indexOf("{");
  if (!source.includes("@") && (first === -1 || source.indexOf("{", first + 1) === -1))
    return css().parse(source, options);
  return (extendedParse ??= css().fork(nestingParser).parse)(source, options);
}

/** Absolutizes implicit relative selector branches using the native CSS token stream. */
export function normalizeNestingSelector(source: string, mode?: "style" | "scope"): string {
  if (mode !== "style") return source;
  const runtime = css(),
    tokens = runtime.tokenTypes,
    branches: string[] = [];
  let depth = 0,
    start = 0,
    hasNesting = false,
    leading = false,
    first = true;
  function take(end: number): void {
    const branch = source.slice(start, end).trim();
    branches.push(branch && (leading || !hasNesting) ? `& ${branch}` : branch);
    start = end + 1;
    hasNesting = false;
    leading = false;
    first = true;
  }
  runtime.tokenize(source, (type, from, end) => {
    if (type === tokens.WhiteSpace || type === tokens.Comment) return;
    const value = source.slice(from, end);
    if (first) {
      leading =
        type === tokens.Delim && (/^[>+~]$/.test(value) || source.slice(from, from + 2) === "||");
      first = false;
    }
    if (type === tokens.Delim && value === "&") hasNesting = true;
    if (
      type === tokens.Function ||
      type === tokens.LeftParenthesis ||
      type === tokens.LeftSquareBracket
    )
      depth++;
    else if (type === tokens.RightParenthesis || type === tokens.RightSquareBracket) depth--;
    else if (type === tokens.Comma && depth === 0) take(from);
  });
  take(source.length);
  return branches.join(", ");
}
