// Adapts native Blobs for consumers that read jsdom Blob parts synchronously.
const { Blob } = require("node:buffer");

exports.implForWrapper = function implForWrapper(wrapper) {
  // Node's Blob constructor accepts an existing Blob as a byte-preserving part.
  return wrapper instanceof Blob ? { _bytes: wrapper } : undefined;
};
