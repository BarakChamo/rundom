// Pins text codec interfaces, streaming state, and script-realm values through the public facade.
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

async function inWindow(script: string): Promise<unknown> {
  const dom = new JSDOM("", { runScripts: "outside-only" });
  try {
    return await dom.window.eval(script);
  } finally {
    dom.window.close();
  }
}

describe("Window text encoding", () => {
  it("exposes codec interface objects, methods, and dictionaries in the script realm", async () => {
    // Given: a VM Window with independent intrinsic prototypes.
    // When: script inspects its four encoding interfaces and encodeInto result.
    const result = await inWindow(`(() => {
      const interfaces = [TextEncoder, TextDecoder, TextEncoderStream, TextDecoderStream];
      return [interfaces.every(C => Object.getPrototypeOf(C) === Function.prototype),
        interfaces.every(C => Object.getPrototypeOf(C.prototype) === Object.prototype),
        interfaces.map(C => C.name),
        Object.getPrototypeOf(TextEncoder.prototype.encode) === Function.prototype,
        Object.getOwnPropertyDescriptor(TextDecoder.prototype, 'decode').enumerable,
        Object.getOwnPropertyDescriptor(TextEncoder.prototype, Symbol.toStringTag).value,
        Object.getPrototypeOf(new TextEncoder().encodeInto('a', new Uint8Array(1))) === Object.prototype,
        interfaces.every(C => !Object.getOwnPropertyDescriptor(globalThis, C.name).enumerable),
        TextDecoder.prototype.decode.length];
    })()`);
    // Then: interface identity and descriptors follow Web IDL rather than host class defaults.
    expect(result).toEqual([
      true,
      true,
      ["TextEncoder", "TextDecoder", "TextEncoderStream", "TextDecoderStream"],
      true,
      true,
      "TextEncoder",
      true,
      true,
      0,
    ]);
  });

  for (const [chunks, expected] of [
    [["\uD83D", "", "\uDC99"], [[240, 159, 146, 153]]],
    [["\uD83D", "A"], [[239, 191, 189, 65]]],
    [["\uD83D"], [[239, 191, 189]]],
    [
      ["\uDC99", "é"],
      [
        [239, 191, 189],
        [195, 169],
      ],
    ],
    [["", "hello", ""], [[104, 101, 108, 108, 111]]],
    [
      [undefined, null, 3],
      [[117, 110, 100, 101, 102, 105, 110, 101, 100], [110, 117, 108, 108], [51]],
    ],
  ] as const) {
    it(`encodes ${JSON.stringify(chunks)} without breaking surrogate pairs or emitting empty chunks`, async () => {
      // Given: input chunks may divide a surrogate pair or require DOMString conversion.
      const literal = chunks
        .map((chunk) => (chunk === undefined ? "undefined" : JSON.stringify(chunk)))
        .join(",");
      // When: input passes through the encoder and reaches EOF.
      const result = await inWindow(`(async () => {
        const input = new ReadableStream({start(controller) { for (const value of [${literal}]) controller.enqueue(value); controller.close(); }});
        const reader = input.pipeThrough(new TextEncoderStream()).getReader();
        const output = []; let localBytes = true;
        for (;;) { const {value, done} = await reader.read(); if (done) break; localBytes &&= value instanceof Uint8Array && value.buffer instanceof ArrayBuffer; output.push(Array.from(value)); }
        return [output, localBytes];
      })()`);
      // Then: chunk boundaries, flush replacement, and typed-array allocation are observable.
      expect(result).toEqual([expected, true]);
    });
  }

  for (const [encoding, bytes, expected] of [
    ["utf-8", [[0xef], [0xbb, 0xbf, 0xf0], [0x9f, 0x92], [0x99]], ["💙"]],
    ["shift_jis", [[0x82], [0xa0]], ["あ"]],
    ["utf-8", [[0xe5]], ["�"]],
  ] as const) {
    it(`decodes split ${encoding} bytes and flushes incomplete input`, async () => {
      // Given: an encoding sequence is split across independently supplied chunks.
      // When: the stream decodes all chunks and flushes at EOF.
      const result = await inWindow(`(async () => {
        const input = new ReadableStream({start(controller) { for (const value of ${JSON.stringify(bytes)}) controller.enqueue(Uint8Array.from(value)); controller.close(); }});
        const reader = input.pipeThrough(new TextDecoderStream(${JSON.stringify(encoding)})).getReader();
        const output = []; for (;;) { const {value, done} = await reader.read(); if (done) return output; output.push(value); }
      })()`);
      // Then: no partial characters or spurious empty output escape the decoder.
      expect(result).toEqual(expected);
    });
  }

  it("propagates a fatal flush error to both stream sides in the codec's realm", async () => {
    // Given: a fatal UTF-8 decoder receives an incomplete sequence.
    // When: its writer closes while the reader awaits output.
    const result = await inWindow(`(async () => {
      const stream = new TextDecoderStream('utf-8', {fatal:true});
      const reader = stream.readable.getReader(), writer = stream.writable.getWriter();
      const reading = reader.read().catch(error => error);
      const closed = writer.closed.catch(error => error);
      await writer.write(Uint8Array.of(0xE5));
      const error = await writer.close().catch(error => error);
      return [error instanceof TypeError, await reading === error, await closed === error];
    })()`);
    // Then: the same realm-local error rejects all affected operations.
    expect(result).toEqual([true, true, true]);
  });

  it("preserves a caller's conversion exception across encoder stream errors", async () => {
    // Given: a chunk's toString throws a particular caller-owned error.
    // When: a read and write are pending during conversion.
    const result = await inWindow(`(async () => {
      const stream = new TextEncoderStream(), error = new Error('chunk conversion');
      const writer = stream.writable.getWriter(), reader = stream.readable.getReader();
      const closed = writer.closed.catch(e => e), readClosed = reader.closed.catch(e => e);
      const reading = reader.read().catch(e => e);
      const writing = writer.write({toString() {throw error;}}).catch(e => e);
      return (await Promise.all([closed, readClosed, reading, writing])).every(e => e === error);
    })()`);
    // Then: the error is preserved rather than replaced by a generic transport error.
    expect(result).toBe(true);
  });

  it("delays writes until there is demand and propagates cancellation", async () => {
    // Given: an encoder has neither output demand nor buffered output.
    // When: a write starts, then a read consumes it, and the reader cancels.
    const result = await inWindow(`(async () => {
      const stream = new TextEncoderStream(), writer = stream.writable.getWriter(), reader = stream.readable.getReader();
      let settled = false; const writing = writer.write('A').then(() => {settled=true;});
      await Promise.resolve(); await Promise.resolve(); const blocked = !settled;
      const value = await reader.read(); await writing;
      const reason = new Error('cancelled'); const closed = writer.closed.catch(error => error);
      await reader.cancel(reason); return [blocked, Array.from(value.value), await closed === reason];
    })()`);
    // Then: the transform retains backpressure and the cancellation reason.
    expect(result).toEqual([true, [65], true]);
  });
  it("reads buffer contents after options conversion detaches the input", async () => {
    // Given: an options getter transfers the backing store during argument conversion.
    // When: decoding begins after that getter returns.
    const result = await inWindow(`(() => {
      const bytes = new Uint8Array(8).fill(42);
      return new TextDecoder().decode(bytes, {get stream() { bytes.buffer.transfer(0); return false; }});
    })()`);
    // Then: the decoder sees an empty detached view, with no host exception.
    expect(result).toBe("");
  });

  for (const [label, body, expected] of [
    ["csiso2022kr", "%41%42%A0", "�"],
    ["replacement", "", ""],
    ["utf-32", "%FF%FE%00%00%41%00", "\u0000A"],
    ["bad-label", "%C3%A9", "é"],
    ["windows-1251", "%EF%BB%BF%C3%A9", "é"],
    ["windows-1251", "%A2", "ў"],
  ] as const) {
    it(`decodes XHR ${label} responses with canonical labels and BOM precedence`, async () => {
      // Given: response bytes and an explicit override include replacement and invalid labels.
      // When: XHR exposes the complete text response.
      const result = await inWindow(`(() => {
        const xhr = new XMLHttpRequest(); xhr.open('GET', 'data:text/plain,${body}', false);
        xhr.overrideMimeType('text/plain; charset="${label}"'); xhr.send(); return xhr.responseText;
      })()`);
      // Then: standard encoding aliases, fallback, and BOM authority determine the text.
      expect(result).toBe(expected);
    });
  }
});
