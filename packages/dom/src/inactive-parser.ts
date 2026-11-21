// Uses parse5's own token boundaries while consuming literal runs in an inactive document.
import {
  Parser,
  Tokenizer,
  TokenizerMode,
  parse,
  type DefaultTreeAdapterTypes as Raw,
  type ParserOptions,
} from "parse5";

// Each pattern stops before a code unit that needs preprocessing or changes the tokenizer state.
// Text also stops at HTML whitespace because parse5 gives whitespace its own token in table modes.
const textBoundary = /[<&\0\t\n\f\r \uD800-\uDFFF]/g;
const doubleQuotedBoundary = /["&\0\n\r\uD800-\uDFFF]/g;
const singleQuotedBoundary = /['&\0\n\r\uD800-\uDFFF]/g;
const commentBoundary = /[-<\0\n\r\uD800-\uDFFF]/g;

// Each accepted name and quoted value is literal in the HTML tokenizer. A failed
// scan leaves the input cursor at the first letter, so parse5 owns all recovery.
const simpleTagName = /[a-z][a-z0-9:_-]*/y;
const simpleAttribute =
  / +([a-z_:][a-z0-9:_.-]*)(?:="([^"&\0\r\n\uD800-\uDFFF]*)"|='([^'&\0\r\n\uD800-\uDFFF]*)')?/y;

function independentString(value: string): string {
  // Match the pinned tokenizer's ownership of substrings from a large input.
  return value.length < 13 ? value : (" " + value).slice(1);
}

class LiteralTokenizer extends Tokenizer {
  protected override _stateTagName(cp: number): void {
    const token = this.currentToken;
    if (cp >= 97 && cp <= 122 && token && "attrs" in token && !token.tagName) {
      const input = this.preprocessor;
      simpleTagName.lastIndex = input.pos;
      const name = simpleTagName.exec(input.html);
      if (name) {
        let cursor = simpleTagName.lastIndex;
        while (input.html.charCodeAt(cursor) === 32 && token.attrs.length < 8) {
          simpleAttribute.lastIndex = cursor;
          const attribute = simpleAttribute.exec(input.html);
          if (!attribute || !attribute[1] || token.attrs.some((a) => a.name === attribute[1]))
            break;
          token.attrs.push({
            name: independentString(attribute[1]),
            value: independentString(attribute[2] ?? attribute[3] ?? ""),
          });
          cursor = simpleAttribute.lastIndex;
        }
        const selfClosing = input.html.charCodeAt(cursor) === 47;
        if (selfClosing) cursor++;
        if (input.html.charCodeAt(cursor) === 62) {
          token.tagName = independentString(name[0]);
          token.selfClosing = selfClosing;
          this.consumedAfterSnapshot += cursor - input.pos;
          input.pos = cursor;
          this.state = TokenizerMode.DATA;
          this.emitCurrentTagToken();
          return;
        }
        token.attrs.length = 0;
      }
    }
    super._stateTagName(cp);
  }

  private advanceLiteral(cp: number, boundary: RegExp): void {
    // Scan only after parse5 accepted the start of a run. Short markup and isolated characters
    // stay on the ordinary path. The next delimiter is always consumed by the original tokenizer.
    if (this.runEnd - this.runStart !== 4 || cp <= 32 || cp >= 127) return;
    const input = this.preprocessor;
    if (this.runEnd !== input.pos + 1) return;
    boundary.lastIndex = this.runEnd;
    const stop = boundary.exec(input.html)?.index ?? input.html.length;
    this.consumedAfterSnapshot += stop - this.runEnd;
    input.pos = stop - 1;
    this.runEnd = stop;
  }
  protected override _emitCodePoint(cp: number): void {
    super._emitCodePoint(cp);
    switch (this.state) {
      case TokenizerMode.DATA:
      case TokenizerMode.SCRIPT_DATA:
      case TokenizerMode.RCDATA:
      case TokenizerMode.RAWTEXT:
      case TokenizerMode.PLAINTEXT:
        this.advanceLiteral(cp, textBoundary);
    }
  }
  protected override _stateAttributeValueDoubleQuoted(cp: number): void {
    const state = this.state;
    super._stateAttributeValueDoubleQuoted(cp);
    if (this.state === state) this.advanceLiteral(cp, doubleQuotedBoundary);
  }
  protected override _stateAttributeValueSingleQuoted(cp: number): void {
    const state = this.state;
    super._stateAttributeValueSingleQuoted(cp);
    if (this.state === state) this.advanceLiteral(cp, singleQuotedBoundary);
  }
  protected override _stateComment(cp: number): void {
    const state = this.state;
    super._stateComment(cp);
    if (this.state === state) this.advanceLiteral(cp, commentBoundary);
  }
}

/** Parses a complete, inactive HTML document. Parse errors and source locations use the stock tokenizer. */
export function parseLiteralDocument(
  markup: string,
  options: ParserOptions<Raw.DefaultTreeAdapterMap>,
): Raw.Document {
  if (markup.length < 1024 || options.sourceCodeLocationInfo || options.onParseError)
    return parse(markup, options);
  const parser = new Parser<Raw.DefaultTreeAdapterMap>(options);
  parser.tokenizer = new LiteralTokenizer(parser.options, parser);
  parser.tokenizer.write(markup, true);
  return parser.document;
}
