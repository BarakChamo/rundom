// Finds effective HTML charset declarations using parser state rather than raw-text byte matches.
import { Buffer } from "node:buffer";
import { InsertionMode, Parser, type DefaultTreeAdapterMap, type Token } from "parse5";

type EncodingLookup = (label: string) => string | null;

function metaEncoding(token: Token.TagToken, lookup: EncodingLookup): string | null {
  const charset = token.attrs.find((attribute) => attribute.name === "charset");
  let label = charset?.value;
  if (!charset) {
    const pragma = token.attrs.find((attribute) => attribute.name === "http-equiv")?.value;
    if (pragma?.toLowerCase() !== "content-type") return null;
    const content = token.attrs.find((attribute) => attribute.name === "content")?.value ?? "";
    // HTML's content attribute permits a charset parameter without requiring a valid MIME type.
    const match = /charset[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)'|([^\t\n\f\r ;]*))/i.exec(
      content,
    );
    label = match?.[1] ?? match?.[2] ?? match?.[3];
  }
  const encoding = label === undefined ? null : lookup(label);
  if (encoding === "UTF-16LE" || encoding === "UTF-16BE") return "UTF-8";
  return encoding === "x-user-defined" ? "windows-1252" : encoding;
}

class EncodingParser extends Parser<DefaultTreeAdapterMap> {
  encoding: string | null = null;
  readonly #lookup: EncodingLookup;

  constructor(lookup: EncodingLookup) {
    // Metadata lookahead treats noscript as raw text without executing any scripts.
    super({ scriptingEnabled: true, sourceCodeLocationInfo: true });
    this.#lookup = lookup;
  }

  override onStartTag(token: Token.TagToken): void {
    const offset = token.location?.startOffset ?? Infinity;
    // Browser HTML responses accept early declarations, or later declarations while still in head.
    // This also excludes late declarations in templates and after implicit/explicit head closure.
    if (
      token.tagName === "meta" &&
      (offset < 1024 || this.insertionMode === InsertionMode.IN_HEAD)
    ) {
      const encoding = metaEncoding(token, this.#lookup);
      if (encoding !== null) {
        this.encoding = encoding;
        this.tokenizer.pause();
        return;
      }
    }
    super.onStartTag(token);
  }
}

/** Finds browser-effective metadata after BOM and transport hints have failed.
 * This follows Chromium-confirmed response parsing, including late in-head declarations;
 * the current formal XHR prescan algorithm alone does not reproduce these cases.
 * No script executes, and parsing stops at the first supported eligible declaration.
 */
export function sniffHTMLResponseEncoding(
  bytes: ArrayBuffer,
  lookup: EncodingLookup,
): string | null {
  const text = Buffer.from(bytes).toString("latin1");
  if (!/<meta[\t\n\f\r /]/i.test(text)) return null;
  const parser = new EncodingParser(lookup);
  parser.tokenizer.write(text, true);
  return parser.encoding;
}
