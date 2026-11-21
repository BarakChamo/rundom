// Normalizes constructor input without loading byte codecs on the default string path.
import { createRequire } from "node:module";
import type { legacyHookDecode as decode } from "@exodus/bytes/encoding.js";

const require = createRequire(import.meta.url);
type MIME = {
  essence: string;
  parameters: { get: (name: string) => string | null };
  isXML: () => boolean;
};
type Sniff = (
  bytes: Uint8Array,
  options: {
    xml: boolean;
    transportLayerEncodingLabel: string | null;
    defaultEncoding?: string;
    maxPrescanBytes?: number;
  },
) => string;

/** Resolves the document MIME type and decodes the supplied byte range or string. */
export function normalizeMarkup(input: unknown, contentType: string | undefined) {
  let essence = "text/html";
  let charset = null;
  let isXML = false;
  if (contentType !== undefined && contentType !== essence) {
    const { MIMEType }: { MIMEType: new (value: string) => MIME } = require("whatwg-mimetype");
    const mime = new MIMEType(contentType);
    essence = mime.essence;
    charset = mime.parameters.get("charset");
    isXML = mime.isXML();
    if (essence !== "text/html" && !isXML)
      throw new RangeError(
        `The given content type of "${contentType}" was not a HTML or XML content type`,
      );
  }

  const bytes =
    input instanceof Uint8Array
      ? input
      : ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : undefined;
  if (!bytes) return { markup: String(input), encoding: "UTF-8", contentType: essence, isXML };

  const decoded = decodeMarkupBytes(bytes, { xml: isXML, transportLayerEncodingLabel: charset });
  return { ...decoded, contentType: essence, isXML };
}

function decodeMarkupBytes(bytes: Uint8Array, settings: Parameters<Sniff>[1]) {
  const sniff: Sniff = require("html-encoding-sniffer");
  const {
    legacyHookDecode,
  }: { legacyHookDecode: typeof decode } = require("@exodus/bytes/encoding.js");
  const encoding = sniff(bytes, settings);
  return { markup: legacyHookDecode(bytes, encoding), encoding };
}

/** Decodes a loaded frame using computed MIME metadata and the initiating document's encoding.
 * Non-XML frame bodies use the headless HTML parser, matching jsdom's frame document model.
 * JSON defaults to UTF-8; explicit transport charsets and BOMs retain their precedence.
 */
export function normalizeFrameMarkup(input: {
  bytes: ArrayBuffer;
  contentType: string | undefined;
  fallbackEncoding: string;
}) {
  const {
    computedMIMEType,
  }: {
    computedMIMEType: (
      bytes: Uint8Array,
      settings: { contentTypeHeader: string | undefined },
    ) => MIME;
  } = require("whatwg-mimetype");
  const bytes = new Uint8Array(input.bytes);
  const mime = computedMIMEType(bytes, { contentTypeHeader: input.contentType });
  const isXML = mime.isXML();
  const isJSON =
    mime.essence === "application/json" ||
    mime.essence === "text/json" ||
    mime.essence.endsWith("+json");
  const defaultEncoding = isXML || isJSON ? "UTF-8" : input.fallbackEncoding;
  const decoded = decodeMarkupBytes(bytes, {
    xml: isXML,
    transportLayerEncodingLabel: mime.parameters.get("charset"),
    defaultEncoding,
    ...(isXML || mime.essence === "text/html" ? {} : { maxPrescanBytes: 0 }),
  });
  return { ...decoded, contentType: mime.essence, isXML };
}
