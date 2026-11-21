// V8 retains the complete source of a cached CommonJS module. Keep it one-byte
// representable and carry the input source map through the syntax-aware rewrite.
import { buildSync } from "esbuild";

export function encodeCachedBundle(filename) {
  buildSync({
    entryPoints: [filename],
    outfile: filename,
    allowOverwrite: true,
    target: "esnext",
    platform: "node",
    charset: "ascii",
    sourcemap: "linked",
    sourcesContent: true,
    minifyWhitespace: true,
    legalComments: "inline",
  });
}
