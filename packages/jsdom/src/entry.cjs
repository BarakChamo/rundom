// Loads the Node facade in the host module cache, including from VM test loaders.
const { createRequire } = process.getBuiltinModule("node:module");

module.exports = createRequire(__filename)("./jsdom-implementation.cjs");
