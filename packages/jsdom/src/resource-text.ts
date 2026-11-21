// Decodes stylesheet and classic-script bytes before their language parsers consume Unicode.
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { MIMEType } from "node:util";

const require = createRequire(import.meta.url);
type Codec = typeof import("@exodus/bytes/encoding.js");
let codec: Codec | undefined;

function transportCharset(contentType: string | undefined): string | null {
  if (!contentType) return null;
  try {
    return new MIMEType(contentType).params.get("charset");
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return null;
  }
}

function stylesheetDeclaration(bytes: ArrayBuffer, encoding: Codec): string | null {
  // CSS encoding declarations have exact ASCII syntax and must finish within the first 1024 bytes.
  const prefix = Buffer.from(bytes, 0, Math.min(bytes.byteLength, 1024)).toString("latin1");
  const label = /^@charset "([\x00-\x21\x23-\x7f]*)";/.exec(prefix)?.[1];
  const name = label === undefined ? null : encoding.labelToName(label);
  return name === "UTF-16LE" || name === "UTF-16BE" ? "UTF-8" : name;
}

/** Resolves BOM, transport, language-specific declarations, and environment fallback in order.
 * Invalid encoding labels fall through to the next hint; decoding uses replacement semantics.
 * Returns the effective encoding so imported stylesheets can inherit it independently of HTML.
 */
export function decodeTextResource(input: {
  kind: "script" | "stylesheet";
  bytes: ArrayBuffer;
  contentType: string | undefined;
  fallbackEncoding: string;
  charset: string | undefined;
}): { code: string; encoding: string } {
  const encoding = (codec ??= require("@exodus/bytes/encoding.js"));
  const bytes = new Uint8Array(input.bytes);
  const transport = transportCharset(input.contentType);
  const declared =
    input.kind === "stylesheet" ? stylesheetDeclaration(input.bytes, encoding) : null;
  const selected =
    encoding.labelToName(encoding.getBOMEncoding(bytes)) ??
    encoding.labelToName(transport) ??
    declared ??
    encoding.labelToName(input.charset) ??
    encoding.labelToName(input.fallbackEncoding) ??
    "UTF-8";
  return { code: encoding.legacyHookDecode(bytes, selected), encoding: selected };
}
