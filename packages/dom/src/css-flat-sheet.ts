// Scans flat stylesheet text into the pinned CSS parser's tree shape without tokenizing it.
import type { Block, CssNode, List } from "css-tree";

type ListConstructor = new <T>() => List<T>;

function isWhitespace(code: number): boolean {
  // CSS whitespace only: space, tab, LF, CR and FF. Vertical tab and Unicode spaces are content.
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
}

function trimEnd(source: string, start: number, end: number): number {
  while (end > start && isWhitespace(source.charCodeAt(end - 1))) end--;
  return end;
}

function skipWhitespace(source: string, cursor: number, end: number): number {
  while (cursor < end && isWhitespace(source.charCodeAt(cursor))) cursor++;
  return cursor;
}

function isNameCode(code: number): boolean {
  return (
    (code >= 97 && code <= 122) ||
    (code >= 65 && code <= 90) ||
    (code >= 48 && code <= 57) ||
    code === 95 ||
    code === 45
  );
}

function isNameStart(code: number): boolean {
  return (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || code === 95;
}

/**
 * A declaration block whose source has been admitted as plain declarations. Its children are
 * built on first read with the values the pinned parser produces when values are not parsed:
 * normal declarations trim surrounding CSS whitespace, custom properties keep it, and a trailing
 * `!important` becomes the `important` flag.
 */
export class UnreadDeclarationBlock implements Block {
  readonly type = "Block";
  #source: string | undefined;
  #List: ListConstructor | undefined;
  #children: List<CssNode> | undefined;

  constructor(source: string, list: ListConstructor) {
    this.#source = source;
    this.#List = list;
  }
  get children(): List<CssNode> {
    if (this.#children) return this.#children;
    const source = this.#source;
    const List = this.#List;
    if (source === undefined || !List)
      throw new Error("An unread declaration block must own its source");
    const children = new List<CssNode>();
    // Admission excludes semicolons, colons before the property's own, and `!` anywhere but a
    // trailing priority, so every separator found here is structural.
    let start = 0;
    while (start < source.length) {
      const code = source.charCodeAt(start);
      if (code === 59 || isWhitespace(code)) {
        start++;
        continue;
      }
      const colon = source.indexOf(":", start);
      let end = source.indexOf(";", colon + 1);
      if (end < 0) end = source.length;
      const property = source.slice(start, trimEnd(source, start, colon));
      const bang = source.lastIndexOf("!", end);
      const important = bang > colon;
      const valueEnd = important ? bang : end;
      const value = property.startsWith("--")
        ? source.slice(colon + 1, valueEnd)
        : source.slice(
            skipWhitespace(source, colon + 1, valueEnd),
            trimEnd(source, colon + 1, valueEnd),
          );
      children.push({ type: "Declaration", property, important, value: { type: "Raw", value } });
      start = end + 1;
    }
    this.#source = undefined;
    this.#List = undefined;
    return (this.#children = children);
  }
}

/**
 * Admits a run of ordinary values: balanced parentheses and brackets, quoted strings without
 * escapes, semicolons or `!`, and none of the characters that start comments, blocks, escapes,
 * CDO tokens or url tokens. Returns the end offset or -1.
 */
function scanValue(source: string, cursor: number, end: number): number {
  let depth = 0;
  // Bounded by the block span; each iteration consumes at least one code unit.
  while (cursor < end) {
    const code = source.charCodeAt(cursor);
    if (code === 59 || code === 33) break;
    if (code === 40 || code === 91) depth++;
    else if (code === 41 || code === 93) {
      if (--depth < 0) return -1;
    } else if (code === 34 || code === 39) {
      const close = scanString(source, cursor, end);
      if (close < 0) return -1;
      cursor = close;
    } else if (
      code === 123 ||
      code === 125 ||
      code === 92 ||
      code === 60 ||
      (code === 47 && source.charCodeAt(cursor + 1) === 42) ||
      (code < 32 && !isWhitespace(code)) ||
      code === 127
    )
      return -1;
    else if (
      (code === 117 || code === 85) &&
      source.slice(cursor, cursor + 4).toLowerCase() === "url("
    )
      return -1;
    cursor++;
  }
  return depth === 0 ? cursor : -1;
}

/** Returns the offset of the closing quote of a simple string starting at `cursor`, or -1. */
function scanString(source: string, cursor: number, end: number): number {
  const quote = source.charCodeAt(cursor);
  for (let index = cursor + 1; index < end; index++) {
    const code = source.charCodeAt(index);
    if (code === quote) return index;
    if (code === 92 || code === 59 || code === 33 || code < 32 || code === 127) return -1;
  }
  return -1;
}

/** Returns whether `source[start, end)` holds only plain declarations in the admitted shape. */
function isDeclarationList(source: string, start: number, end: number): boolean {
  let cursor = skipWhitespace(source, start, end);
  // Bounded by the block span; each declaration consumes its property and separator.
  while (cursor < end) {
    // Property: an unescaped ASCII identifier, optionally a custom property.
    const isCustom = source.startsWith("--", cursor);
    if (isCustom) cursor += 2;
    else if (source.charCodeAt(cursor) === 45) cursor++;
    if (!isNameStart(source.charCodeAt(cursor))) return false;
    while (cursor < end && isNameCode(source.charCodeAt(cursor))) cursor++;
    cursor = skipWhitespace(source, cursor, end);
    if (source.charCodeAt(cursor) !== 58) return false;
    cursor = scanValue(source, cursor + 1, end);
    if (cursor < 0) return false;
    if (source.charCodeAt(cursor) === 33) {
      cursor = skipWhitespace(source, cursor + 1, end);
      if (source.slice(cursor, cursor + 9) !== "important") return false;
      cursor = skipWhitespace(source, cursor + 9, end);
    }
    if (cursor < end) {
      if (source.charCodeAt(cursor) !== 59) return false;
      cursor = skipWhitespace(source, cursor + 1, end);
      // An empty declaration becomes a raw node in the pinned parser.
      if (source.charCodeAt(cursor) === 59) return false;
    }
  }
  return true;
}

/**
 * Admits a qualified-rule prelude whose raw text the pinned parser would keep verbatim:
 * selector punctuation, balanced groups and simple strings, without nesting, at-keywords,
 * comments, escapes or CDO/CDC tokens. Selector validity is decided later by the selector parser.
 */
function isPlainPrelude(source: string, start: number, end: number): boolean {
  let depth = 0;
  for (let cursor = start; cursor < end; cursor++) {
    const code = source.charCodeAt(cursor);
    if (isNameCode(code) || isWhitespace(code) || code >= 128) {
      if (code === 45 && source.startsWith("-->", cursor)) return false;
      continue;
    }
    switch (code) {
      case 46: // .
      case 35: // #
      case 58: // :
      case 44: // ,
      case 42: // *
      case 43: // +
      case 126: // ~
      case 62: // >
      case 61: // =
      case 94: // ^
      case 36: // $
      case 124: // |
        continue;
      case 40: // (
      case 91: // [
        depth++;
        continue;
      case 41: // )
      case 93: // ]
        if (--depth < 0) return false;
        continue;
      case 34: // "
      case 39: // '
        cursor = scanString(source, cursor, end);
        if (cursor < 0) return false;
        continue;
      default:
        return false;
    }
  }
  return depth === 0;
}

// Media groups are limited to one bounded width or height comparison.
const plainMedia = /^@media[ \t\r\n\f]+(\((?:min|max)-(?:width|height):[ \t]*\d+(?:\.\d+)?px\))$/;
const maximumBlockLength = 4096;
const maximumGroupDepth = 8;

/**
 * Builds the stylesheet tree for comment-free flat rules and simple width/height media groups,
 * matching the pinned parser with unparsed preludes and values. Returns `undefined` for anything
 * else, including any input on which the pinned parser would recover from an error, so callers
 * fall back to the general parser.
 */
export function scanFlatStyleSheet(source: string, List: ListConstructor): CssNode | undefined {
  if (source.length > 262144) return;
  const root = new List<CssNode>();
  const parents = [root];
  let cursor = 0;
  // Each accepted rule or group consumes an entire bounded source span.
  while (cursor < source.length) {
    const code = source.charCodeAt(cursor);
    if (isWhitespace(code)) {
      cursor++;
      continue;
    }
    if (code === 125) {
      if (parents.length === 1) return;
      parents.pop();
      cursor++;
      continue;
    }
    const open = source.indexOf("{", cursor);
    if (open < 0 || open - cursor > 1024) return;
    const headingEnd = trimEnd(source, cursor, open);
    const children = parents.at(-1);
    if (!children) return;
    if (code === 64) {
      const condition = plainMedia.exec(source.slice(cursor, headingEnd))?.[1];
      if (!condition || parents.length > maximumGroupDepth) return;
      const grouped = new List<CssNode>();
      children.push({
        type: "Atrule",
        name: "media",
        prelude: { type: "Raw", value: condition },
        block: { type: "Block", children: grouped },
      });
      parents.push(grouped);
      cursor = open + 1;
      continue;
    }
    if (headingEnd === cursor || !isPlainPrelude(source, cursor, headingEnd)) return;
    const end = source.indexOf("}", open + 1);
    if (end < 0 || end - open > maximumBlockLength + 1) return;
    if (!isDeclarationList(source, open + 1, end)) return;
    children.push({
      type: "Rule",
      prelude: { type: "Raw", value: source.slice(cursor, headingEnd) },
      block: new UnreadDeclarationBlock(source.slice(open + 1, end), List),
    });
    cursor = end + 1;
  }
  return parents.length === 1 ? { type: "StyleSheet", children: root } : undefined;
}
