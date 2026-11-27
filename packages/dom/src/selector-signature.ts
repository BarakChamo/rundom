// Rejects elements that provably cannot match a selector by comparing small bit signatures of names before predicates run.
import type { DefaultTreeAdapterTypes as Raw } from "parse5";
import type { DirectComplex, DirectSelector, DirectSimple } from "./selector-parser.js";
import { elementLocalName } from "./xml.js";

// Every name is ASCII-folded before hashing, so one bit covers HTML/XML case rules, quirks-mode
// class and ID folding, and `i`/`s` attribute flags. A set bit only means "maybe present".
const BITS = 30;
type Atoms = Map<string, number>;
const tagAtoms: Atoms = new Map();
const attributeAtoms: Atoms = new Map();
const idAtoms: Atoms = new Map();
const classAtoms: Atoms = new Map();
// Class attribute values map to the union of their token bits; values repeat across elements.
const classValueMasks: Atoms = new Map();
const ATOM_LIMIT = 4096;

function atom(atoms: Atoms, name: string, seed: number): number {
  const known = atoms.get(name);
  if (known !== undefined) return known;
  // FNV-1a over ASCII-folded code units; the seed separates tag, attribute, ID and class bits.
  let hash = 0x811c9dc5 ^ seed;
  for (let index = 0; index < name.length; index++) {
    let code = name.charCodeAt(index);
    if (code >= 65 && code <= 90) code += 32;
    hash = Math.imul(hash ^ code, 0x01000193);
  }
  const bit = 1 << ((hash >>> 0) % BITS);
  if (atoms.size >= ATOM_LIMIT) atoms.clear();
  atoms.set(name, bit);
  return bit;
}

const tagBit = (name: string) => atom(tagAtoms, name, 1);
const attributeBit = (name: string) => atom(attributeAtoms, name, 2);
const idBit = (name: string) => atom(idAtoms, name, 3);
const classBit = (name: string) => atom(classAtoms, name, 4);

function classValueMask(value: string): number {
  const known = classValueMasks.get(value);
  if (known !== undefined) return known;
  let mask = 0;
  // Tokens use the same ASCII whitespace as class matching; the value is finite.
  for (const token of value.split(/[\t\n\f\r ]+/)) if (token) mask |= classBit(token);
  if (classValueMasks.size >= ATOM_LIMIT) classValueMasks.clear();
  classValueMasks.set(value, mask);
  return mask;
}

type Signature = { attrs: Raw.Element["attrs"]; length: number; names: number; values: number };
const signatures = new WeakMap<Raw.Element, Signature>();
// Role-style callers test many selectors against one element in a row.
let lastNode: Raw.Element | undefined;
let lastSignature: Signature | undefined;

function signature(node: Raw.Element): Signature {
  const { attrs } = node;
  let known = node === lastNode ? lastSignature : signatures.get(node);
  if (known && known.attrs === attrs && known.length === attrs.length) {
    lastNode = node;
    return (lastSignature = known);
  }
  // Any namespace contributes, so namespaced and no-namespace attribute tests stay covered.
  let names = tagBit(elementLocalName(node));
  let values = 0;
  for (const attr of attrs) {
    names |= attributeBit(attr.name);
    if (attr.name.length === 2 && attr.name.toLowerCase() === "id") values |= idBit(attr.value);
    else if (attr.name.length === 5 && attr.name.toLowerCase() === "class")
      values |= classValueMask(attr.value);
  }
  known = { attrs, length: attrs.length, names, values };
  signatures.set(node, known);
  lastNode = node;
  return (lastSignature = known);
}

/** Drops an element's cached signature; called whenever one of its attributes changes. */
export function forgetSelectorSignature(node: Raw.Element): void {
  signatures.delete(node);
  if (lastNode === node) lastNode = lastSignature = undefined;
}

type Need = { names: number; values: number };

function compoundNeed(parts: readonly DirectSimple[], need: Need): void {
  for (const part of parts) {
    if (part.kind === "type") {
      if (part.name !== "*") need.names |= tagBit(part.name);
    } else if (part.kind === "attr") need.names |= attributeBit(part.name);
    else if (part.kind === "id") need.values |= idBit(part.name);
    else if (part.kind === "class") need.values |= classBit(part.name);
    else if (part.kind === "list" && part.name !== "not" && part.list.length === 1) {
      // The subject of a single-branch :is()/:where() is this same element.
      const inner = part.list[0]?.compounds.at(-1);
      if (inner) compoundNeed(inner, need);
    }
  }
}

function branchNeed(branch: DirectComplex): Need {
  const need = { names: 0, values: 0 };
  compoundNeed(branch.compounds.at(-1) ?? [], need);
  return need;
}

let filtering = true;

/** @internal Disables rejection so tests can compare filtered and unfiltered matching. */
export function setSelectorSignatureFiltering(enabled: boolean): void {
  filtering = enabled;
}

/**
 * Wraps a compiled predicate for a direct-grammar selector with a signature test. Returns the
 * predicate unchanged when any branch has no necessary name, since nothing could be rejected.
 */
export function withSignatureFilter(
  selector: DirectSelector | undefined,
  matches: (element: Raw.Element) => boolean,
): (element: Raw.Element) => boolean {
  if (!filtering || !selector || selector.list.length > 32) return matches;
  // Type, class and ID compounds already test as cheaply as a signature lookup, and query
  // candidate indices pre-filter them; only lists and attribute or pseudo-class compounds pay off.
  const costly =
    selector.list.length > 1 ||
    selector.list.some((branch) =>
      branch.compounds.some((parts) =>
        parts.some((part) => part.kind !== "type" && part.kind !== "class" && part.kind !== "id"),
      ),
    );
  if (!costly) return matches;
  const needs = selector.list.map(branchNeed);
  if (needs.some((need) => need.names === 0 && need.values === 0)) return matches;
  if (needs.length === 1) {
    const { names, values } = needs[0] ?? { names: 0, values: 0 };
    return (node) => {
      const own = signature(node);
      return (own.names & names) === names && (own.values & values) === values && matches(node);
    };
  }
  return (node) => {
    const own = signature(node);
    for (const need of needs)
      if ((own.names & need.names) === need.names && (own.values & need.values) === need.values)
        return matches(node);
    return false;
  };
}
