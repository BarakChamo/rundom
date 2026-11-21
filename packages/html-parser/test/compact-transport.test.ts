// Rejects corrupt compact transports and preserves UTF-16 span boundaries before DOM allocation.
import { expect, it } from "vitest";
import { decodeCompactSnapshot } from "../src/compact-transport.js";
const absent = 0xffffffff;
function fixture() {
  const words = new Uint32Array(8 + 3 * 12 + 2);
  words.set([0x52444f4d, 2, 3, 0, 2, 0, 7, 0]);
  // Document -> HTML paragraph -> text; string offsets count UTF-16 code units.
  words.set([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, absent, absent], 8);
  words.set([2, 1, 0, 1, 0, 0, 1, 1, 0, 0, absent, absent], 20);
  words.set([3, 0, 0, 0, 1, 6, 2, 0, 0, 0, absent, absent], 32);
  words.set([1, 2], 44);
  return { words, strings: "p😀text" };
}
it("decodes astral text and unique ownership without JSON records", () => {
  // Given/When/Then: both integer words and string spans come from the compact contract.
  const result = decodeCompactSnapshot(fixture());
  expect(result.isOk() && result.value.nodes[2]?.text).toBe("😀text");
  expect(result.isOk() && result.value.nodes[1]?.children).toEqual([2]);
});
for (const [name, corrupt] of [
  [
    "unknown version",
    (x: ReturnType<typeof fixture>) => {
      x.words[1] = 3;
    },
  ],
  [
    "truncated words",
    (x: ReturnType<typeof fixture>) => {
      x.words = x.words.slice(0, -1);
    },
  ],
  [
    "overflowing counts",
    (x: ReturnType<typeof fixture>) => {
      x.words[2] = 0xffffffff;
    },
  ],
  [
    "unknown node kind",
    (x: ReturnType<typeof fixture>) => {
      x.words[20] = 99;
    },
  ],
  [
    "unknown namespace",
    (x: ReturnType<typeof fixture>) => {
      x.words[21] = 99;
    },
  ],
  [
    "out of range text",
    (x: ReturnType<typeof fixture>) => {
      x.words[37] = 0xffffffff;
    },
  ],
  [
    "split surrogate start",
    (x: ReturnType<typeof fixture>) => {
      x.words[36] = 2;
      x.words[37] = 5;
    },
  ],
  [
    "split surrogate end",
    (x: ReturnType<typeof fixture>) => {
      x.words[37] = 1;
    },
  ],
  [
    "bad template reference",
    (x: ReturnType<typeof fixture>) => {
      x.words[30] = 2;
    },
  ],
  [
    "bad form reference",
    (x: ReturnType<typeof fixture>) => {
      x.words[31] = 2;
    },
  ],
  [
    "reserved header",
    (x: ReturnType<typeof fixture>) => {
      x.words[7] = 1;
    },
  ],
] as const) {
  it(`rejects ${name}`, () => {
    // Given/When/Then: corrupt producer output is a typed boundary failure.
    const input = fixture();
    corrupt(input);
    const result = decodeCompactSnapshot(input);
    expect(result.isErr() && result.error.type).toBe("invalid_snapshot");
  });
}
it("rejects repaired shapes, wrong typed-array kinds and unpaired string storage", () => {
  // Given/When/Then: the wire schema must preserve exact input types.
  for (const value of [
    { ...fixture(), words: new Int32Array(58) },
    { ...fixture(), strings: "p\ud800text" },
    { ...fixture(), extra: true },
  ])
    expect(decodeCompactSnapshot(value).isErr()).toBe(true);
});

it("rejects a detached ownership cycle without any duplicate parents", () => {
  // Given: two detached elements own each other, while the document subtree stays valid.
  const input = fixture(),
    words = new Uint32Array(8 + 4 * 12 + 3);
  words.set(input.words.subarray(0, 8));
  words[2] = 4;
  words[4] = 3;
  words.set(input.words.subarray(8, 20), 8);
  const leaf = input.words.slice(20, 32);
  leaf[7] = 0;
  words.set(leaf, 20);
  const a = leaf.slice();
  a[6] = 1;
  a[7] = 1;
  words.set(a, 32);
  const b = leaf.slice();
  b[6] = 2;
  b[7] = 1;
  words.set(b, 44);
  words.set([1, 3, 2], 56);
  const result = decodeCompactSnapshot({ ...input, words });
  expect(result.isErr() && result.error.issues).toContain("Ownership graph contains a cycle");
});
it("rejects duplicate parents in an acyclic graph", () => {
  // Given: one text record is shared by the document and its element, without a cycle.
  const input = fixture(),
    words = new Uint32Array(input.words.length + 1);
  words.set(input.words);
  words[4] = 3;
  words[15] = 2;
  words[26] = 2;
  words.set([1, 2, 2], 44);
  const result = decodeCompactSnapshot({ ...input, words });
  expect(result.isErr() && result.error.issues).toContain(
    "A node cannot have multiple owning edges",
  );
});

it("rejects shared or resizable integer storage before reading mutable headers", () => {
  // Given/When/Then: native transport storage must remain fixed during validation.
  const input = fixture();
  for (const words of [
    new Uint32Array(new SharedArrayBuffer(input.words.byteLength)),
    new Uint32Array(
      new ArrayBuffer(input.words.byteLength, { maxByteLength: input.words.byteLength * 2 }),
    ),
  ]) {
    words.set(input.words);
    expect(decodeCompactSnapshot({ ...input, words }).isErr()).toBe(true);
  }
});

it("rejects invalid compact attribute namespaces and spans from a real native payload", async () => {
  // Given: real native output includes namespaced attribute and astral string storage.
  const { createRequire } = await import("node:module");
  const { compactSnapshotSchema } = await import("../src/compact-transport.js");
  const binding: { parseDocumentSnapshot: (markup: string, scripting: boolean) => unknown } =
    createRequire(import.meta.url)(`../native/${process.platform}-${process.arch}.node`);
  const value = binding.parseDocumentSnapshot('<svg><use xlink:href="😀"/></svg>', false);
  const parsed = compactSnapshotSchema.safeParse(value);
  if (!parsed.success) throw new Error("Expected real compact native payload");
  const input = parsed.data,
    decoded = decodeCompactSnapshot(input);
  expect(decoded.isOk() && decoded.value.nodes.find((node) => node.name === "use")?.attrs).toEqual([
    ["href", "😀", "http://www.w3.org/1999/xlink", "xlink"],
  ]);
  const count = input.words[2],
    children = input.words[4];
  if (count === undefined || children === undefined) throw new Error("Expected native header");
  const attribute = 8 + count * 12 + children;
  for (const [offset, value] of [
    [attribute + 4, 99],
    [attribute + 1, 0xffffffff],
    [attribute + 6, 0xffffffff],
  ] as const) {
    const words = input.words.slice();
    words[offset] = value;
    expect(decodeCompactSnapshot({ ...input, words }).isErr()).toBe(true);
  }
});

it("uses intrinsic storage metadata despite replaceable public view getters", () => {
  // Given: user-defined length/buffer getters cannot replace the typed array's private storage authority.
  const input = fixture();
  Object.defineProperties(input.words, {
    length: {
      get() {
        throw new Error("public length override");
      },
    },
    buffer: {
      get() {
        throw new Error("public buffer override");
      },
    },
  });
  const result = decodeCompactSnapshot(input);
  expect(result.isOk() && result.value.nodes[2]?.text).toBe("😀text");
});
