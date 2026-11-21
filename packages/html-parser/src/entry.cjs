// Loads one native boundary in Node's host cache even when a VM runner imports the package.
const { createRequire } = process.getBuiltinModule("node:module");
module.exports = createRequire(__filename)("./index-implementation.cjs");
