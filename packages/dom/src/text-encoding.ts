// Bridges byte encoding to each Window's typed arrays and error constructors.
import { createRequire } from "node:module";
import { isAnyArrayBuffer } from "node:util/types";
import { TransformStream } from "node:stream/web";

const require = createRequire(import.meta.url);
type EncodingBackend = typeof import("@exodus/bytes/encoding.js");
type DecodeInput = Parameters<InstanceType<EncodingBackend["TextDecoder"]>["decode"]>[0];
let backend: EncodingBackend | undefined;
let encoder: InstanceType<EncodingBackend["TextEncoder"]> | undefined;
const encoderInstances = new WeakSet<object>();
const encoderStreams = new WeakMap<object, TransformStream<unknown, Uint8Array<ArrayBuffer>>>();
const decoderStreams = new WeakMap<
  object,
  {
    decoder: Pick<InstanceType<EncodingBackend["TextDecoder"]>, "encoding" | "fatal" | "ignoreBOM">;
    stream: TransformStream<unknown, string>;
  }
>();
const decoders = new WeakMap<object, InstanceType<EncodingBackend["TextDecoder"]>>();

/** Creates Window-local interfaces while loading the codec on first use. */
export function createTextEncoding(realm: {
  Uint8Array: Uint8ArrayConstructor;
  TypeError: TypeErrorConstructor;
  RangeError: RangeErrorConstructor;
  Object: ObjectConstructor;
  Function: FunctionConstructor;
  String: StringConstructor;
}) {
  function string(value: unknown): string {
    if (typeof value === "symbol") throw new realm.TypeError("Cannot convert a Symbol to a string");
    return realm.String(value);
  }

  function checkDictionary(value: unknown): void {
    if (value != null && typeof value !== "object" && typeof value !== "function")
      throw new realm.TypeError("Expected an options dictionary");
  }

  function codec(): EncodingBackend {
    return (backend ??= require("@exodus/bytes/encoding.js"));
  }

  function utf8Encoder() {
    return (encoder ??= new (codec().TextEncoder)());
  }

  function decoderFor(receiver: object): InstanceType<EncodingBackend["TextDecoder"]> {
    const decoder = decoders.get(receiver);
    if (!decoder) throw new realm.TypeError("Expected a TextDecoder");
    return decoder;
  }

  class TextEncoder {
    constructor() {
      encoderInstances.add(this);
    }

    get encoding(): "utf-8" {
      if (!encoderInstances.has(this)) throw new realm.TypeError("Expected a TextEncoder");
      return "utf-8";
    }

    encode(input = ""): Uint8Array<ArrayBuffer> {
      if (!encoderInstances.has(this)) throw new realm.TypeError("Expected a TextEncoder");
      const bytes = utf8Encoder().encode(string(input));
      return realm.Uint8Array === Uint8Array ? bytes : new realm.Uint8Array(bytes);
    }

    encodeInto(source: string, destination: Uint8Array): { read: number; written: number } {
      if (!encoderInstances.has(this)) throw new realm.TypeError("Expected a TextEncoder");
      if (arguments.length < 2) throw new realm.TypeError("A source and destination are required");
      const text = string(source);
      const encoder = utf8Encoder();
      try {
        return Object.assign(new realm.Object(), encoder.encodeInto(text, destination));
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        throw new realm.TypeError(error.message);
      }
    }
  }

  class TextDecoder {
    constructor(label = "utf-8", options?: { fatal?: boolean; ignoreBOM?: boolean } | null) {
      const encoding = string(label);
      checkDictionary(options);
      const settings = { fatal: Boolean(options?.fatal), ignoreBOM: Boolean(options?.ignoreBOM) };
      const Decoder = codec().TextDecoder;
      try {
        decoders.set(this, new Decoder(encoding, settings));
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        throw new realm.RangeError(error.message);
      }
    }

    get encoding(): string {
      return decoderFor(this).encoding;
    }
    get fatal(): boolean {
      return decoderFor(this).fatal;
    }
    get ignoreBOM(): boolean {
      return decoderFor(this).ignoreBOM;
    }
    decode(input: DecodeInput = undefined, options?: { stream?: boolean } | null): string {
      const decoder = decoderFor(this);
      checkDictionary(options);
      const settings = { stream: Boolean(options?.stream) };
      try {
        // A conversion getter may have detached a view from a different VM realm.
        const bytes =
          ArrayBuffer.isView(input) && input.byteLength === 0 ? new Uint8Array(0) : input;
        return decoder.decode(bytes, settings);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        throw new realm.TypeError(error.message);
      }
    }
  }

  function encoderStreamFor(receiver: object) {
    const stream = encoderStreams.get(receiver);
    if (!stream) throw new realm.TypeError("Expected a TextEncoderStream");
    return stream;
  }

  function decoderStreamFor(receiver: object) {
    const state = decoderStreams.get(receiver);
    if (!state) throw new realm.TypeError("Expected a TextDecoderStream");
    return state;
  }

  class TextEncoderStream {
    constructor() {
      const encoder = new TextEncoder();
      let pendingSurrogate = "";
      encoderStreams.set(
        this,
        new TransformStream<unknown, Uint8Array<ArrayBuffer>>({
          transform(chunk, controller) {
            // Delay one leading surrogate so a pair can span chunks, including empty chunks.
            const text = pendingSurrogate + string(chunk);
            pendingSurrogate = "";
            const last = text.charCodeAt(text.length - 1);
            const hasPending = last >= 0xd800 && last <= 0xdbff;
            const complete = hasPending ? text.slice(0, -1) : text;
            if (hasPending) pendingSurrogate = text.slice(-1);
            if (complete !== "") controller.enqueue(encoder.encode(complete));
          },
          flush(controller) {
            if (pendingSurrogate !== "") controller.enqueue(encoder.encode(pendingSurrogate));
          },
        }),
      );
    }
    get encoding(): "utf-8" {
      encoderStreamFor(this);
      return "utf-8";
    }
    get readable() {
      return encoderStreamFor(this).readable;
    }
    get writable() {
      return encoderStreamFor(this).writable;
    }
  }

  class TextDecoderStream {
    constructor(label = "utf-8", options?: { fatal?: boolean; ignoreBOM?: boolean } | null) {
      const decoder = new TextDecoder(label, options);
      const stream = new TransformStream<unknown, string>({
        transform(chunk, controller) {
          // Stream chunks are required BufferSources, unlike decode's optional input.
          if (chunk == null) throw new realm.TypeError("Expected a BufferSource");
          if (!ArrayBuffer.isView(chunk) && !isAnyArrayBuffer(chunk))
            throw new realm.TypeError("Expected a BufferSource");
          let bytes: Uint8Array<ArrayBufferLike>;
          if (chunk.byteLength === 0) bytes = new Uint8Array(0);
          else if (ArrayBuffer.isView(chunk))
            bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
          else bytes = new Uint8Array(chunk);
          const text = decoder.decode(bytes, { stream: true });
          if (text !== "") controller.enqueue(text);
        },
        flush(controller) {
          const text = decoder.decode();
          if (text !== "") controller.enqueue(text);
        },
      });
      decoderStreams.set(this, { decoder, stream });
    }
    get encoding() {
      return decoderStreamFor(this).decoder.encoding;
    }
    get fatal() {
      return decoderStreamFor(this).decoder.fatal;
    }
    get ignoreBOM() {
      return decoderStreamFor(this).decoder.ignoreBOM;
    }
    get readable() {
      return decoderStreamFor(this).stream.readable;
    }
    get writable() {
      return decoderStreamFor(this).stream.writable;
    }
  }

  for (const [name, constructor] of Object.entries({
    TextEncoder,
    TextDecoder,
    TextEncoderStream,
    TextDecoderStream,
  })) {
    Object.defineProperty(constructor, "name", { value: name, configurable: true });
    Object.setPrototypeOf(constructor, realm.Function.prototype);
    Object.setPrototypeOf(constructor.prototype, realm.Object.prototype);
    for (const key of Object.getOwnPropertyNames(constructor.prototype)) {
      if (key === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(constructor.prototype, key);
      if (!descriptor) continue;
      Object.defineProperty(constructor.prototype, key, { ...descriptor, enumerable: true });
      for (const method of [descriptor.value, descriptor.get, descriptor.set]) {
        if (typeof method === "function") Object.setPrototypeOf(method, realm.Function.prototype);
      }
    }
    Object.defineProperty(constructor.prototype, Symbol.toStringTag, {
      value: name,
      configurable: true,
    });
  }
  return { TextEncoder, TextDecoder, TextEncoderStream, TextDecoderStream };
}
