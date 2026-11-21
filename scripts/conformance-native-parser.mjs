// Compares the native parser with unchanged pinned html5lib trees and the existing TypeScript parser.
import { createRequire } from "node:module";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../packages/dom/package.json", import.meta.url));
const { parseHTML, getParserStatistics } = require("@run-dom/html-parser");
const { parse, defaultTreeAdapter: tree } = require("parse5");
const directory = join(
  root,
  ".cache/jsdom-reference/test/web-platform-tests/tests/html/syntax/parsing/resources",
);
const namespaceNames = new Map([
  ["http://www.w3.org/1999/xhtml", ""],
  ["http://www.w3.org/2000/svg", "svg "],
  ["http://www.w3.org/1998/Math/MathML", "math "],
  ["http://www.w3.org/1999/xlink", "xlink "],
  ["http://www.w3.org/XML/1998/namespace", "xml "],
  ["http://www.w3.org/2000/xmlns/", "xmlns "],
  ["", ""],
]);
function dump(roots, read) {
  const lines = [],
    pending = roots.toReversed().map((node) => ({ node, depth: 0 }));
  while (pending.length) {
    const frame = pending.pop(),
      node = read(frame.node),
      prefix = "| " + "  ".repeat(frame.depth);
    if (node.kind === "element") {
      lines.push(prefix + "<" + namespaceNames.get(node.namespace) + node.name + ">");
      const attrs = node.attrs
        .map(([name, value, namespace]) => [
          (namespaceNames.get(namespace) ?? namespace + " ") + name,
          value,
        ])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      for (const [name, value] of attrs) lines.push(prefix + "  " + name + '="' + value + '"');
    } else if (node.kind === "text") lines.push(prefix + '"' + node.text + '"');
    else if (node.kind === "comment") lines.push(prefix + "<!-- " + node.text + " -->");
    else if (node.kind === "doctype")
      lines.push(
        prefix +
          "<!DOCTYPE " +
          node.name +
          (node.public_id || node.system_id
            ? ' "' + node.public_id + '" "' + node.system_id + '"'
            : "") +
          ">",
      );
    else if (node.kind === "fragment") lines.push(prefix + "content");
    for (const child of node.children.toReversed())
      pending.push({ node: child, depth: frame.depth + 1 });
    if (node.template !== null) pending.push({ node: node.template, depth: frame.depth + 1 });
  }
  return lines.join("\n");
}
function readReference(node) {
  if (tree.isElementNode(node))
    return {
      kind: "element",
      name: node.tagName,
      namespace: node.namespaceURI,
      attrs: node.attrs.map((attr) => [
        attr.name,
        attr.value,
        attr.namespace ?? "",
        attr.prefix ?? "",
      ]),
      children: node.childNodes,
      template: node.tagName === "template" && node.content ? node.content : null,
    };
  if (tree.isTextNode(node))
    return { kind: "text", text: node.value, children: [], template: null };
  if (tree.isCommentNode(node))
    return { kind: "comment", text: node.data, children: [], template: null };
  if (tree.isDocumentTypeNode(node))
    return {
      kind: "doctype",
      name: node.name,
      public_id: node.publicId,
      system_id: node.systemId,
      children: [],
      template: null,
    };
  return { kind: "fragment", children: node.childNodes, template: null };
}
const report = {
  scope:
    "Pinned html5lib full-document tree construction; fragment contexts and error counts are not qualified here",
  files: {},
  cases: 0,
  executions: 0,
  fragmentCases: 0,
  nativePasses: 0,
  referencePasses: 0,
  matchedRegressions: [],
  improvements: [],
  sharedFailures: [],
  boundaryFailures: [],
};
for (const file of readdirSync(directory)
  .filter((name) => name.endsWith(".dat"))
  .sort()) {
  const text = readFileSync(join(directory, file), "utf8");
  report.files[file] = createHash("sha256").update(text).digest("hex");
  let position = 0;
  for (const block of text.split(/(?=^#data\n)/m).filter((block) => block.startsWith("#data\n"))) {
    const split = block.indexOf("\n#errors\n"),
      marker = block.indexOf("\n#document\n", split);
    if (split < 0 || marker < 0) throw new Error("Malformed fixture " + file);
    const markup = block.slice(6, split),
      metadata = block.slice(split, marker),
      expected = block.slice(marker + 11).replace(/\n+$/, "");
    const detail = { file, position: position++, markup };
    report.cases++;
    if (metadata.includes("\n#document-fragment\n")) {
      report.fragmentCases++;
      continue;
    }
    const modes = metadata.includes("\n#script-off")
      ? [false]
      : metadata.includes("\n#script-on")
        ? [true]
        : [false, true];
    for (const scriptingEnabled of modes) {
      report.executions++;
      const native = parseHTML({ markup, scriptingEnabled });
      const reference = parse(markup, { scriptingEnabled });
      const referenceTree = dump(reference.childNodes, readReference),
        referencePassed = referenceTree === expected;
      report.referencePasses += Number(referencePassed);
      if (native.isErr()) {
        report.boundaryFailures.push({ ...detail, scriptingEnabled, error: native.error });
        continue;
      }
      const actual = dump(native.value.nodes[0].children, (index) => native.value.nodes[index]),
        nativePassed = actual === expected;
      report.nativePasses += Number(nativePassed);
      if (!nativePassed)
        report[referencePassed ? "matchedRegressions" : "sharedFailures"].push({
          ...detail,
          scriptingEnabled,
          expected,
          actual,
          reference: referenceTree,
        });
      if (nativePassed && !referencePassed)
        report.improvements.push({ ...detail, scriptingEnabled });
    }
  }
}
report.statistics = getParserStatistics();
const output = resolve(
  root,
  process.argv[2] ?? ".cache/qualification/full/native-tree-construction.json",
);
mkdirSync(join(root, ".cache/qualification/full"), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      ...report,
      files: Object.keys(report.files).length,
      matchedRegressions: report.matchedRegressions.length,
      improvements: report.improvements.length,
      sharedFailures: report.sharedFailures.length,
      boundaryFailures: report.boundaryFailures.length,
      output,
    },
    null,
    2,
  ),
);
if (report.matchedRegressions.length || report.boundaryFailures.length) process.exitCode = 1;
