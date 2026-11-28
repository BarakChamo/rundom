// Derives bounded tree-order candidate buckets; selector predicates still own all matching semantics.
import { createRequire } from "node:module";
import { defaultTreeAdapter as tree, type DefaultTreeAdapterTypes as Raw } from "parse5";
import { elementLocalName } from "./xml.js";
import { normalizeSelector, parseSelectorList } from "./selector-syntax.js";

import { simpleSelectorList } from "./selectors.js";
import { parseDirectSelector, type DirectComplex } from "./selector-parser.js";

const require = createRequire(import.meta.url);
type Hints = readonly (readonly string[])[];
const plans = new Map<string, Hints | null>();
const empty: readonly Raw.Element[] = [];
const fold = (value: string) => value.toLowerCase();

function directHints(list: readonly DirectComplex[]): Hints | undefined {
  if (list.length > 32) return undefined;
  const branches = list.map((branch) =>
    (branch.compounds.at(-1) ?? []).flatMap((part) => {
      if (part.kind === "id" || part.kind === "class") return [`${part.kind}:${fold(part.name)}`];
      if (part.kind === "attr") return [`attr:${fold(part.name)}`];
      return part.kind === "type" && part.name !== "*" ? [`tag:${fold(part.name)}`] : [];
    }),
  );
  return branches.every((branch) => branch.length > 0) ? branches : undefined;
}

/** Supplies positive subject constraints only; absence requires ordinary tree traversal. */
export function queryCandidateHints(selector: string): Hints | undefined {
  if (selector.length > 4096) return undefined;
  if (selector.trim() === "*") return undefined;
  const known = plans.get(selector);
  if (known !== undefined) return known ?? undefined;
  const simple = /^\s*([#.])?([a-zA-Z_][\w-]*|--[\w-]*|-[a-zA-Z_][\w-]*)\s*$/.exec(selector);
  const name = simple?.[2];
  let hints: Hints | undefined;
  if (name) {
    let kind = "tag";
    if (simple?.[1] === "#") kind = "id";
    else if (simple?.[1] === ".") kind = "class";
    hints = [[`${kind}:${fold(name)}`]];
  } else {
    const branches = simpleSelectorList(selector);
    if (branches)
      return branches.map((branch) => ["tag" in branch ? `tag:${fold(branch.tag)}` : "attr:role"]);
    const direct = parseDirectSelector(selector);
    if (direct) hints = directHints(direct.list);
    else
      try {
        const css: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
        const ast = parseSelectorList(normalizeSelector(selector));
        if (ast.type === "SelectorList" && ast.children.size <= 32) {
          const branches: string[][] = [];
          ast.children.forEach((branch) => {
            const anchors: string[] = [];
            if (branch.type === "Selector")
              branch.children.forEach((part) => {
                if (part.type === "Combinator") anchors.length = 0;
                else if (part.type === "IdSelector")
                  anchors.push(`id:${fold(css.ident.decode(part.name))}`);
                else if (part.type === "ClassSelector")
                  anchors.push(`class:${fold(css.ident.decode(part.name))}`);
                else if (part.type === "AttributeSelector") {
                  if (part.name.name.includes("\\")) return;
                  const local = part.name.name.split("|").at(-1);
                  if (local && local !== "*") anchors.push(`attr:${fold(css.ident.decode(local))}`);
                } else if (part.type === "TypeSelector") {
                  if (part.name.includes("\\")) return;
                  const local = part.name.split("|").at(-1);
                  if (local && local !== "*") anchors.push(`tag:${fold(css.ident.decode(local))}`);
                }
              });
            branches.push(anchors);
          });
          if (branches.length && branches.every((branch) => branch.length > 0)) hints = branches;
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
  }
  if (plans.size >= 256) plans.clear();
  plans.set(selector, hints ?? null);
  return hints;
}

/** Builds a derived view with a fixed entry budget; oversized trees retain linear traversal. */
export function createQueryIndex(nodes: Iterable<Raw.Node>):
  | {
      readonly entries: number;
      readonly select: (hints: Hints) => readonly Raw.Element[];
    }
  | undefined {
  const buckets = new Map<string, Raw.Element[]>();
  const order = new WeakMap<Raw.Element, number>();
  let ordinal = 0;
  let entries = 0;
  // One pass visits the finite ordinary subtree; template and shadow contents are separate roots.
  for (const node of nodes) {
    if (!tree.isElementNode(node)) continue;
    order.set(node, ordinal++);
    const keys = new Set([`tag:${fold(elementLocalName(node))}`]);
    for (const attr of node.attrs) {
      keys.add(`attr:${fold(attr.name)}`);
      if (attr.name === "id") keys.add(`id:${fold(attr.value)}`);
      else if (attr.name === "class")
        for (const name of attr.value.split(/[\t\n\f\r ]+/))
          if (name) keys.add(`class:${fold(name)}`);
    }
    entries += keys.size + 1;
    if (entries > 32768) return undefined;
    for (const key of keys) {
      const known = buckets.get(key);
      if (known) known.push(node);
      else buckets.set(key, [node]);
    }
  }
  return {
    entries,
    select(hints) {
      const candidates: (readonly Raw.Element[])[] = [];
      for (const branch of hints) {
        let best: readonly Raw.Element[] | undefined;
        for (const key of branch) {
          const next = buckets.get(key) ?? [];
          if (best === undefined || next.length < best.length) best = next;
        }
        if (best?.length) candidates.push(best);
      }
      if (candidates.length === 0) return empty;
      if (candidates.length === 1) return candidates[0] ?? empty;
      const members = new Set<Raw.Element>();
      for (const branch of candidates) for (const node of branch) members.add(node);
      return [...members].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    },
  };
}

const treePseudos = new Set([
  "scope",
  "root",
  "empty",
  "first-child",
  "last-child",
  "only-child",
  "first-of-type",
  "last-of-type",
  "only-of-type",
  "nth-child",
  "nth-last-child",
  "nth-of-type",
  "nth-last-of-type",
  "is",
  "where",
  "not",
  "has",
]);
const staticQueries = new Map<string, boolean>();
let staticQueryCharacters = 0;
const focusPseudos = new Set(["focus", "focus-visible", "focus-within"]);

function dependsOnTree(selector: string, allowFocus: boolean): boolean {
  const direct = parseDirectSelector(selector);
  if (direct)
    return [...direct.pseudos].every(
      (name) => treePseudos.has(name) || (allowFocus && focusPseudos.has(name)),
    );
  const css: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  try {
    const ast = parseSelectorList(normalizeSelector(selector));
    let valid = true;
    css.walk(ast, (node) => {
      if (node.type === "PseudoElementSelector" || node.type === "Raw") valid = false;
      if (node.type !== "PseudoClassSelector") return;
      const name = css.ident.decode(node.name).toLowerCase();
      if (!treePseudos.has(name) && !(allowFocus && focusPseudos.has(name))) valid = false;
    });
    return valid;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return false;
  }
}

/** Recognizes selectors whose only live dependency is the document's focus state. */
export function queryDependsOnTreeOrFocus(selector: string): boolean {
  return selector.length <= 4096 && dependsOnTree(selector, true);
}

/** Proves that matching depends on tree/attribute state alone; unknown and live state predicates bypass result reuse. */
export function queryDependsOnlyOnTree(selector: string): boolean {
  if (selector.length > 4096) return false;
  if (simpleSelectorList(selector)) return true;
  const known = staticQueries.get(selector);
  if (known !== undefined) return known;
  let result = /^(?:\*|[#.]?(?:[a-zA-Z_][\w-]*|--[\w-]*|-[a-zA-Z_][\w-]*))$/.test(selector.trim());
  if (!result) result = dependsOnTree(selector, false);
  if (staticQueries.size >= 256 || staticQueryCharacters + selector.length > 32768) {
    staticQueries.clear();
    staticQueryCharacters = 0;
  }
  staticQueries.set(selector, result);
  staticQueryCharacters += selector.length;
  return result;
}
