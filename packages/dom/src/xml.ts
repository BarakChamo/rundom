// Adapts namespace-aware XML parsing and serialization to the shared raw DOM tree.
import { createRequire } from "node:module";
import { defaultTreeAdapter as tree, html, type DefaultTreeAdapterTypes as Raw } from "parse5";
import type { SaxesParser as Parser } from "saxes";

const require = createRequire(import.meta.url);
type Special = { kind: "cdata" } | { kind: "instruction"; target: string };
const specialNodes = new WeakMap<Raw.CommentNode, Special>();

/** Returns XML-specific metadata for raw nodes with character data. */
export function xmlSpecial(node: Raw.Node): Special | undefined {
  return tree.isCommentNode(node) ? specialNodes.get(node) : undefined;
}

/** Creates character data using the raw comment representation shared with XML parsing. */
export function createXMLData(data: string, special: Special): Raw.CommentNode {
  const node = tree.createCommentNode(data);
  specialNodes.set(node, special);
  return node;
}

// XML 1.0 NameStartChar and the additional NameChar ranges.
const nameStart =
  ":A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}";
const xmlName = new RegExp(
  "^[" + nameStart + "][" + nameStart + "0-9.\\-\u00B7\u0300-\u036F\u203F-\u2040]*$",
  "u",
);

/** Checks the XML Name production used by processing instruction targets. */
export function isXMLName(name: string): boolean {
  return xmlName.test(name);
}

const elementPrefixes = new WeakMap<Raw.Element, string>();

/** Reads the explicit namespace prefix without inferring one from a colon in a local name. */
export function rawElementPrefix(node: Raw.Element): string | null {
  return elementPrefixes.get(node) ?? null;
}

/** Reads the local part of a raw element's name, preserving literal unprefixed colons. */
export function elementLocalName(node: Raw.Element): string {
  if (!node.tagName.includes(":")) return node.tagName;
  const prefix = rawElementPrefix(node);
  return prefix === null ? node.tagName : node.tagName.slice(prefix.length + 1);
}

/** Records a prefix on a freshly created raw element. */
export function setRawElementPrefix(node: Raw.Element, prefix: string): void {
  elementPrefixes.set(node, prefix);
}

type XMLInput = {
  document: Raw.Document | Raw.DocumentFragment;
  markup: string;
  url: string;
  namespaces?: Record<string, string>;
  onScript?: (script: Raw.Element) => void;
  DOMException?: typeof globalThis.DOMException;
};

/** Parses XML into a document or contextual fragment and rejects malformed markup. */
export function parseXML(input: XMLInput): void {
  const { SaxesParser }: { SaxesParser: typeof Parser } = require("saxes");
  const parser = new SaxesParser({
    xmlns: true,
    fileName: input.url,
    ...(input.namespaces === undefined
      ? {}
      : { fragment: true, additionalNamespaces: input.namespaces }),
  });
  let parent: Raw.ParentNode = input.document;
  const stack: Raw.ParentNode[] = [];

  function addData(data: string, special?: Special): void {
    tree.appendChild(parent, special ? createXMLData(data, special) : tree.createCommentNode(data));
  }

  parser.on("error", (error) => {
    const Exception = input.DOMException ?? globalThis.DOMException;
    throw new Exception(error.message, "SyntaxError");
  });
  parser.on("opentag", (tag) => {
    // The adapter stores namespace strings verbatim. Its enum only lists HTML parser namespaces.
    const node = tree.createElement(
      tag.name,
      tag.uri as html.NS,
      Object.values(tag.attributes).map((attr) => ({
        name: attr.local,
        value: attr.value,
        ...(attr.prefix ? { prefix: attr.prefix } : {}),
        ...(attr.uri ? { namespace: attr.uri } : {}),
      })),
    );
    if (tag.prefix) setRawElementPrefix(node, tag.prefix);
    tree.appendChild(parent, node);
    stack.push(parent);
    if (tag.uri === html.NS.HTML && tag.local === "template") {
      const content = tree.createDocumentFragment();
      Object.assign(node, { content });
      parent = content;
    } else parent = node;
  });
  parser.on("closetag", (tag) => {
    const closed = parent;
    const next = stack.pop();
    if (next) parent = next;
    if (
      input.onScript &&
      (tag.uri === html.NS.HTML || tag.uri === html.NS.SVG) &&
      tag.local === "script" &&
      tree.isElementNode(closed)
    )
      input.onScript(closed);
  });
  parser.on("text", (value) => {
    if (parent !== input.document || input.namespaces !== undefined) tree.insertText(parent, value);
  });
  parser.on("comment", (value) => addData(value));
  parser.on("cdata", (value) => addData(value, { kind: "cdata" }));
  parser.on("processinginstruction", ({ target, body }) =>
    addData(body, { kind: "instruction", target }),
  );
  parser.on("doctype", (declaration) => {
    const parts =
      /^\s*([^\s[]+)(?:\s+PUBLIC\s+(["'])(.*?)\2\s+(["'])(.*?)\4|\s+SYSTEM\s+(["'])(.*?)\6)?/s.exec(
        declaration,
      );
    if (parts?.[1] && input.document.nodeName === "#document")
      tree.setDocumentType(input.document, parts[1], parts[3] ?? "", parts[5] ?? parts[7] ?? "");
    // jsdom registers simple double-quoted declarations as literal, nonrecursive replacements.
    for (const [, name, value] of declaration.matchAll(/<!ENTITY ([^\s<>]+) "([^"]+)">/g)) {
      if (name && value !== undefined && !(name in parser.ENTITIES)) parser.ENTITIES[name] = value;
    }
  });
  parser.write(input.markup).close();
}

/** Parses a fragment with the in-scope namespace declarations of its context. */
export function parseXMLFragment(input: {
  markup: string;
  url: string;
  context: Raw.ParentNode | null;
  DOMException?: typeof globalThis.DOMException;
}): Raw.DocumentFragment {
  const bindings = new Map<string, string>();
  // The chain is finite and the nearest declaration wins.
  for (let node = input.context; node && tree.isElementNode(node); node = node.parentNode) {
    for (const attr of node.attrs) {
      if (attr.namespace !== html.NS.XMLNS) continue;
      const prefix = attr.prefix ? attr.name : "";
      if (!bindings.has(prefix)) bindings.set(prefix, attr.value);
    }
    // A DOM-created element can carry a namespace without an explicit xmlns attribute.
    const prefix = rawElementPrefix(node) ?? "";
    if (node.namespaceURI && !bindings.has(prefix)) bindings.set(prefix, node.namespaceURI);
  }
  const document = tree.createDocumentFragment();
  parseXML({
    document,
    markup: input.markup,
    url: input.url,
    namespaces: Object.fromEntries(bindings),
    ...(input.DOMException === undefined ? {} : { DOMException: input.DOMException }),
  });
  return document;
}

/** Serializes independent XML fragment children, translating declared serialization failures. */
export function serializeXML(
  nodes: readonly Raw.ChildNode[],
  options: { requireWellFormed?: boolean; DOMException?: typeof globalThis.DOMException } = {},
): string {
  try {
    return nodes.map((node) => serializeXMLNode(node, options)).join("");
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const Exception = options.DOMException ?? globalThis.DOMException;
    throw new Exception(error.message, "InvalidStateError");
  }
}

function serializationView(node: Raw.Node): object {
  if (tree.isElementNode(node)) {
    const prefix = rawElementPrefix(node);
    const localName = prefix === null ? node.tagName : node.tagName.slice(prefix.length + 1);
    let children: object[] | undefined;
    let content: object | undefined;
    return {
      nodeType: 1,
      namespaceURI: node.namespaceURI || null,
      prefix,
      localName,
      attributes: node.attrs.map((attr) => ({
        namespaceURI: attr.namespace || null,
        prefix: attr.prefix ?? null,
        localName: attr.name,
        value: attr.value,
      })),
      get childNodes() {
        return (children ??= node.childNodes.map(serializationView));
      },
      get content() {
        return "content" in node
          ? (content ??= serializationView((node as Raw.Template).content))
          : undefined;
      },
    };
  }
  if (tree.isTextNode(node)) return { nodeType: 3, data: node.value };
  if (tree.isCommentNode(node)) {
    const special = xmlSpecial(node);
    if (special?.kind === "instruction")
      return { nodeType: 7, data: node.data, target: special.target };
    return { nodeType: special?.kind === "cdata" ? 4 : 8, data: node.data };
  }
  if (tree.isDocumentTypeNode(node)) {
    return { nodeType: 10, name: node.name, publicId: node.publicId, systemId: node.systemId };
  }
  let children: object[] | undefined;
  return {
    nodeType: node.nodeName === "#document" ? 9 : 11,
    get childNodes() {
      return (children ??= node.childNodes.map(serializationView));
    },
  };
}

/** Serializes a standalone DOM node, repairing namespace bindings where necessary. */
export function serializeXMLNode(
  node: Raw.Node,
  options: { requireWellFormed?: boolean } = {},
): string {
  const serialize: (
    root: object,
    options: { requireWellFormed?: boolean },
  ) => string = require("w3c-xmlserializer");
  return serialize(serializationView(node), options);
}
