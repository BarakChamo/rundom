// Stores reusable inactive markup in immutable spans and materializes independently editable child lists.
import { defaultTreeAdapter as tree, html, type DefaultTreeAdapterTypes as Raw } from "parse5";

import { hasClassToken } from "./selectors.js";

// node:assert/strict loads seven built-in modules at start-up; an invariant only fails on a
// programmer error, so the module is loaded on that failure and throws the same AssertionError.
function invariant(value: unknown, message: string): asserts value {
  if (value) return;
  const assert: typeof import("node:assert/strict") =
    process.getBuiltinModule("node:assert/strict");
  assert(value, message);
}

type Attribute = Raw.Element["attrs"][number];
type CopyRecipe = {
  mode: Raw.Document["mode"];
  slots: Uint32Array;
  names: string[];
  foreignNamespaces: Map<number, html.NS> | undefined;
  attrs: Attribute[][];
  doctypes: Map<number, { publicId: string; systemId: string }> | undefined;
  templates: Map<number, number> | undefined;
  leafTexts: string[];
};
const emptyAttributes: Attribute[] = [];
Object.freeze(emptyAttributes);

function recipeAttributes(recipe: CopyRecipe, position: number): Attribute[] {
  const index = recipe.slots[position + 1];
  const attributes = index === 0 ? emptyAttributes : index !== undefined && recipe.attrs[index - 1];
  invariant(attributes, "A packed element must reference its attribute list");
  return attributes;
}

const width = 3;
const packedLeafKind = 6;
const packedText = Symbol();
type PackedText = { [packedText]?: string | undefined };
const packedDocuments = new WeakSet<Raw.Document>();

class PackedLeaf implements Raw.Element {
  nodeName: string;
  tagName: string;
  parentNode: Raw.ParentNode | null;
  [packedText]: string | undefined;
  #children: Raw.ChildNode[] | undefined;

  constructor(
    name: string,
    public namespaceURI: html.NS,
    public attrs: Attribute[],
    text: string,
    parent: Raw.ParentNode,
  ) {
    this.nodeName = name;
    this.tagName = name;
    this[packedText] = text;
    this.parentNode = parent;
  }

  get childNodes(): Raw.ChildNode[] {
    if (!this.#children) {
      const text = this[packedText];
      this.#children =
        text === undefined ? [] : [{ nodeName: "#text", value: text, parentNode: this }];
      this[packedText] = undefined;
    }
    return this.#children;
  }
  set childNodes(children: Raw.ChildNode[]) {
    this.#children = children;
    this[packedText] = undefined;
  }
}

type FindExposedAttribute = (
  node: Raw.Element,
  name: string,
  attribute: "id" | "class",
) => Raw.Element | undefined;

export type ElementSequence = {
  readonly length: number;
  at(index: number): Raw.Element | undefined;
};

type OriginalLeafOrder = { at(index: number): Raw.Element | undefined };

type LeafPositions = { count: number; positions: number[] | Uint16Array | undefined };
type LeafMembership = { first: number; attribute: string; name: string; result: LeafPositions };
const leafMemberships = new WeakMap<CopyRecipe, LeafMembership[]>();

function matchingLeafPositions(
  recipe: CopyRecipe,
  first: number,
  end: number,
  attribute: "id" | "class",
  name: string,
): LeafPositions | undefined {
  const entries = leafMemberships.get(recipe);
  const previous = entries?.find(
    (entry) => entry.first === first && entry.attribute === attribute && entry.name === name,
  );
  if (previous) return previous.result;
  let positions: number[] | undefined;
  let count = 0;
  for (let index = first; index < end; index++) {
    const slot = index * width;
    const kind = recipe.slots[slot];
    if (kind === undefined || kind < packedLeafKind) return;
    let matched = false;
    for (const attr of recipeAttributes(recipe, slot)) {
      if (attr?.name === attribute && !attr.namespace) {
        matched = attribute === "id" ? attr.value === name : hasClassToken(attr.value, name);
        break;
      }
    }
    if (matched) {
      if (!positions && index - first !== count)
        positions = Array.from({ length: count }, (_, ordinal) => ordinal);
      positions?.push(index - first);
      count++;
    }
  }
  const result: LeafPositions = { positions, count };
  // Offset vectors contain no document identities. Bound the retained payload across
  // all selectors for a recipe, including interleaved matches in wide sibling lists.
  const byteBudget = 8192;
  if (
    name.length <= 128 &&
    (!positions || (positions.length * 2 <= byteBudget && end - first <= 65536))
  ) {
    const offsets = positions && Uint16Array.from(positions);
    result.positions = offsets;
    const entry = { first, attribute, name, result };
    if (!entries) leafMemberships.set(recipe, [entry]);
    else {
      let bytes = entries.reduce(
        (sum, member) => sum + (member.result.positions?.length ?? 0) * 2,
        offsets?.byteLength ?? 0,
      );
      while (entries.length && (entries.length >= 8 || bytes > byteBudget)) {
        const oldest = entries.shift();
        bytes -= (oldest?.result.positions?.length ?? 0) * 2;
      }
      entries.push(entry);
    }
  }
  return result;
}

function lowerBound(positions: readonly number[] | Uint16Array, index: number): number {
  let low = 0,
    high = positions.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((positions[mid] ?? Infinity) < index) low = mid + 1;
    else high = mid;
  }
  return low;
}

class PackedBranch implements Raw.Element {
  // Sparse reads use a small map. A frequently read static snapshot keeps its
  // terminal siblings at their original indices until the mutable list escapes.
  #opened: Map<number, Raw.Element> | Raw.Element[] | undefined;
  #originalOrder: WeakRef<OriginalLeafOrder> | undefined;
  nodeName: string;
  tagName: string;
  parentNode: Raw.ParentNode | null;
  #recipe: CopyRecipe | undefined;
  #position: number;
  #children: Raw.ChildNode[] | undefined;

  constructor(
    name: string,
    public namespaceURI: html.NS,
    public attrs: Attribute[],
    parent: Raw.ParentNode,
    recipe: CopyRecipe,
    position: number,
  ) {
    this.nodeName = name;
    this.tagName = name;
    this.parentNode = parent;
    this.#recipe = recipe;
    this.#position = position;
  }

  #openLeaf(index: number): Raw.Element | undefined {
    const recipe = this.#recipe;
    if (!recipe) return;
    const opened = this.#opened;
    if (Array.isArray(opened)) return opened[index] ?? this.#originalOrder?.deref()?.at(index);
    const existing = opened?.get(index);
    if (existing) return existing;
    const first = recipe.slots[this.#position + 2];
    const end = recipe.slots[this.#position + width + 2];
    if (first === undefined || end === undefined || end - first < 128) return;
    if (opened && opened.size >= 16) {
      const order = this.#originalOrder?.deref();
      if (!order) return;
      // A snapshot of terminal siblings has already checked every recipe slot.
      // Keep original indices stable until someone requests the mutable child list.
      const slots = new Array<Raw.Element>(end - first);
      for (const [position, leaf] of opened) slots[position] = leaf;
      this.#opened = slots;
      order.at = (position) => {
        return (slots[position] ??= copyTerminalLeaf(recipe, first + position, this));
      };
      return order.at(index);
    }
    const slot = first + index;
    const kind = recipe.slots[slot * width];
    if (kind === undefined || kind < packedLeafKind) return;
    const child = copyTerminalLeaf(recipe, slot, this);
    (opened ?? (this.#opened = new Map())).set(index, child);
    return child;
  }

  firstDescendantAttribute(
    name: string,
    attribute: "id" | "class",
    findExposed: FindExposedAttribute,
  ): Raw.Element | null | undefined {
    if (!this.#recipe || Array.isArray(this.#opened)) return;
    const path = templateAttributePath(this.#recipe, this.#position, name, attribute, this.#opened);
    let first = path?.[0] ?? Infinity;
    let found: Raw.Element | undefined;
    if (this.#opened) {
      // A previously read leaf may now contain descendants or have different attributes.
      for (const [index, child] of this.#opened) {
        if (index >= first) continue;
        const live = findExposed(child, name, attribute);
        if (live) {
          found = live;
          first = index;
        }
      }
    }
    if (found) return found;
    if (!path) return null;
    let parent: Raw.Element = this;
    for (const [step, index] of path.entries()) {
      if (step === path.length - 1 && parent instanceof PackedBranch) {
        const leaf = parent.#openLeaf(index);
        if (leaf) return leaf;
      }
      const child = parent.childNodes[index];
      invariant(
        child && tree.isElementNode(child),
        "A matched recipe path must resolve to an element",
      );
      parent = child;
    }
    return parent;
  }

  matchingLeaves(attribute: "id" | "class", name: string): ElementSequence | undefined {
    const recipe = this.#recipe;
    if (!recipe || Array.isArray(this.#opened)) return;
    const first = recipe.slots[this.#position + 2];
    const end = recipe.slots[this.#position + width + 2];
    if (
      first === undefined ||
      end === undefined ||
      end - first < 128 ||
      recipe.templates?.has(this.#position / width)
    )
      return;
    const initial = matchingLeafPositions(recipe, first, end, attribute, name);
    if (!initial) return;
    let { positions, count } = initial;
    if (this.#opened) {
      let edited: number[] | undefined;
      for (const [index, child] of this.#opened) {
        if (packedLeafText(child) === undefined && child.childNodes.some(tree.isElementNode))
          return;
        const value = child.attrs.find((attr) => !attr.namespace && attr.name === attribute)?.value;
        const matches =
          value !== undefined && (attribute === "id" ? value === name : hasClassToken(value, name));
        // The original selection is sorted. Only a real membership change needs
        // a document-local copy; merely exposing a row leaves it shareable.
        const ordinal = positions ? lowerBound(positions, index) : Math.min(index, count);
        const wasMember = ordinal < count && (positions?.[ordinal] ?? ordinal) === index;
        if (wasMember === matches) continue;
        edited ??= positions ? Array.from(positions) : Array.from({ length: count }, (_, i) => i);
        const insertion = lowerBound(edited, index);
        if (matches) edited.splice(insertion, 0, index);
        else edited.splice(insertion, 1);
      }
      if (edited) {
        positions = edited;
        count = edited.length;
      }
    }
    if (!count) return [];
    let order = this.#originalOrder?.deref();
    if (!order) {
      order = {
        at: (index) => {
          const leaf = this.#openLeaf(index);
          if (leaf) return leaf;
          // Opening the live list also fixes every outstanding snapshot's original order.
          const current = this.childNodes[index];
          return current && tree.isElementNode(current) ? current : undefined;
        },
      };
      this.#originalOrder = new WeakRef(order);
    }
    return {
      length: count,
      at(index) {
        if (index < 0 || index >= count) return;
        return order.at(positions?.[index] ?? index);
      },
    };
  }

  #materialize(): Raw.ChildNode[] {
    const recipe = this.#recipe;
    invariant(recipe, "Materializing children requires their private recipe");
    const order = this.#originalOrder?.deref();
    const opened = this.#opened;
    if (Array.isArray(opened)) {
      const first = recipe.slots[this.#position + 2];
      invariant(first !== undefined, "A terminal recipe must own its child bounds");
      for (let index = 0; index < opened.length; index++)
        opened[index] ??= copyTerminalLeaf(recipe, first + index, this);
      this.#opened = undefined;
      this.#originalOrder = undefined;
      this.#recipe = undefined;
      if (!order) return opened;
      order.at = (index) => opened[index];
      return opened.slice();
    }
    const children = copyChildren(recipe, this.#position, this, opened);
    if (order) {
      const initial = children.slice();
      order.at = (index) => {
        const child = initial[index];
        return child && tree.isElementNode(child) ? child : undefined;
      };
    }
    this.#recipe = undefined;
    this.#opened = undefined;
    this.#originalOrder = undefined;
    return children;
  }

  get childNodes(): Raw.ChildNode[] {
    return (this.#children ??= this.#materialize());
  }
  set childNodes(children: Raw.ChildNode[]) {
    if (this.#recipe && this.#originalOrder?.deref()) this.#materialize();
    this.#children = children;
    this.#recipe = undefined;
    this.#opened = undefined;
    this.#originalOrder = undefined;
  }
}

type TemplateAttributeHint = {
  position: number;
  name: string;
  attribute: "id" | "class";
  path: readonly number[] | undefined;
};
const templateAttributeHints = new WeakMap<CopyRecipe, TemplateAttributeHint[]>();

function templateAttributePath(
  recipe: CopyRecipe,
  position: number,
  name: string,
  attribute: "id" | "class",
  opened: ReadonlyMap<number, Raw.Element> | undefined,
): readonly number[] | undefined {
  // Only numeric paths into immutable recipes are reusable across documents.
  // Limit both the number and size of keys retained by a live parse recipe.
  if (name.length > 128 || recipe.names.length < 128)
    return firstTemplateAttributePath(recipe, position, name, attribute, opened);
  const hints = templateAttributeHints.get(recipe);
  const hint = hints?.find(
    (entry) => entry.position === position && entry.name === name && entry.attribute === attribute,
  );
  if (hint) {
    const path = hint.path;
    if (path?.length === 1 && path[0] !== undefined && opened?.has(path[0]))
      return firstTemplateAttributePath(recipe, position, name, attribute, opened);
    return path;
  }
  const path = firstTemplateAttributePath(recipe, position, name, attribute, undefined);
  if (!path || path.length <= 64) {
    const hint = { position, name, attribute, path };
    if (!hints) templateAttributeHints.set(recipe, [hint]);
    else {
      if (hints.length >= 32) hints.shift();
      hints.push(hint);
    }
  }
  if (path?.length === 1 && path[0] !== undefined && opened?.has(path[0]))
    return firstTemplateAttributePath(recipe, position, name, attribute, opened);
  return path;
}

// A branch's private recipe remains available only until its mutable children
// escape. A miss can therefore skip a whole subtree without creating any nodes.
function firstTemplateAttributePath(
  recipe: CopyRecipe,
  position: number,
  name: string,
  attribute: "id" | "class",
  opened: ReadonlyMap<number, Raw.Element> | undefined,
): number[] | undefined {
  const { slots, templates } = recipe;
  function childrenOf(parent: number) {
    const first = slots[parent + 2];
    const end = templates?.get(parent / width) ?? slots[parent + width + 2];
    invariant(
      first !== undefined && end !== undefined,
      "A recipe parent must have checked child bounds",
    );
    return { first, next: first, end };
  }
  const stack = [childrenOf(position)];
  while (stack.length) {
    const frame = stack[stack.length - 1];
    invariant(frame, "A nonempty path must have a frame");
    if (frame.next === frame.end) {
      stack.pop();
      continue;
    }
    const slot = frame.next++ * width;
    const kind = slots[slot];
    if (kind !== 1 && !(kind !== undefined && kind >= packedLeafKind)) continue;
    for (const attr of recipeAttributes(recipe, slot)) {
      if (
        attr?.name === attribute &&
        !attr.namespace &&
        (attribute === "id" ? attr.value === name : hasClassToken(attr.value, name)) &&
        !(stack.length === 1 && opened?.has(frame.next - 1 - frame.first))
      )
        return stack.map((ancestor) => ancestor.next - 1 - ancestor.first);
    }
    if (kind === 1 && slots[slot + 2] !== slots[slot + width + 2]) stack.push(childrenOf(slot));
  }
}

/** Captures membership while every direct child is still an unedited text-only leaf. */
export function packedLeafMatches(
  root: Raw.ParentNode,
  attribute: "id" | "class",
  name: string,
): ElementSequence | undefined {
  return root instanceof PackedBranch ? root.matchingLeaves(attribute, name) : undefined;
}

/** Returns undefined for live child lists and null for a proven miss in unopened markup. */
export function firstPackedDescendantAttribute(
  node: Raw.Element,
  name: string,
  attribute: "id" | "class",
  findExposed: FindExposedAttribute,
): Raw.Element | null | undefined {
  return node instanceof PackedBranch
    ? node.firstDescendantAttribute(name, attribute, findExposed)
    : undefined;
}

/** Reads the original scalar only while no mutable child list or Text record exists. */
export function packedLeafText(node: Raw.Node & PackedText): string | undefined {
  return node[packedText];
}

/** Identifies document roots initially copied from packed markup. */
export function hasPackedTemplate(source: Raw.Document): boolean {
  return packedDocuments.has(source);
}

/** Returns an editable list only when the caller is about to change attribute membership. */
export function mutableTemplateAttributes(node: Raw.Element): Attribute[] {
  if (Object.isFrozen(node.attrs)) node.attrs = node.attrs.slice();
  return node.attrs;
}

/** Detaches a shared attribute before editing it or handing out its public Attr identity. */
export function ownTemplateAttribute(node: Raw.Element, attribute: Attribute): Attribute {
  if (!Object.isFrozen(attribute)) return attribute;
  const index = node.attrs.indexOf(attribute);
  invariant(index !== -1, "A template attribute must belong to its owning element");
  const owned = { ...attribute };
  mutableTemplateAttributes(node)[index] = owned;
  return owned;
}

function loneText(node: Raw.Element): Raw.TextNode | undefined {
  const child = node.childNodes.length === 1 ? node.childNodes[0] : undefined;
  return child && tree.isTextNode(child) ? child : undefined;
}

/** Compiles the bounded, never-exposed tree into adjacent child and attribute spans. */
export function compileInactiveTemplate(source: Raw.Document, count: number): CopyRecipe {
  const slots = new Uint32Array((count + 1) * width);
  const names: string[] = [];
  const attrs: Attribute[][] = [];
  const nodes: Raw.Node[] = [source];
  const leafTexts: string[] = [];
  let foreignNamespaces: CopyRecipe["foreignNamespaces"];
  let doctypes: CopyRecipe["doctypes"];
  let templates: CopyRecipe["templates"];
  // Breadth-first order keeps each parent's ordinary children adjacent. Template contents have a separate edge.
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    invariant(node && index < count, "Private template must fit its checked node count");
    const position = index * width;
    slots[position + 2] = nodes.length;
    names.push(node.nodeName);
    if (tree.isElementNode(node)) {
      names[index] = node.tagName;
      if (node.namespaceURI !== html.NS.HTML)
        (foreignNamespaces ??= new Map()).set(index, node.namespaceURI);
      if (node.attrs.length) {
        for (const attribute of node.attrs) Object.freeze(attribute);
        Object.freeze(node.attrs);
        slots[position + 1] = attrs.push(node.attrs);
      }
      const content = "content" in node ? node.content : undefined;
      const text = !content && loneText(node);
      if (text) {
        slots[position] = packedLeafKind + leafTexts.length;
        leafTexts.push(text.value);
      } else {
        slots[position] = 1;
        for (const child of node.childNodes) nodes.push(child);
        if (content) {
          (templates ??= new Map()).set(index, nodes.length);
          nodes.push(content);
        }
      }
    } else if (tree.isTextNode(node)) {
      slots[position] = 2;
      names[index] = node.value;
    } else if (tree.isCommentNode(node)) {
      slots[position] = 3;
      names[index] = node.data;
    } else if (tree.isDocumentTypeNode(node)) {
      slots[position] = 4;
      names[index] = node.name;
      (doctypes ??= new Map()).set(index, { publicId: node.publicId, systemId: node.systemId });
    } else if ("childNodes" in node) {
      slots[position] = 5;
      for (const child of node.childNodes) nodes.push(child);
    }
  }
  invariant(
    nodes.length + leafTexts.length === count,
    "Private template must represent every checked node",
  );
  slots[nodes.length * width + 2] = nodes.length;
  return {
    mode: source.mode,
    slots: slots.slice(0, (nodes.length + 1) * width),
    names,
    attrs,
    foreignNamespaces,
    doctypes,
    templates,
    leafTexts,
  };
}

function copyTerminalLeaf(recipe: CopyRecipe, slot: number, parent: Raw.ParentNode): Raw.Element {
  const child = copyChild(recipe, slot, parent);
  invariant(tree.isElementNode(child), "A terminal recipe slot must copy to an element");
  return child;
}

function copyChildren(
  recipe: CopyRecipe,
  position: number,
  parent: Raw.ParentNode,
  opened?: ReadonlyMap<number, Raw.Element>,
): Raw.ChildNode[] {
  const first = recipe.slots[position + 2];
  const after = recipe.slots[position + width + 2];
  invariant(
    first !== undefined && after !== undefined,
    "A packed parent must have checked child bounds",
  );
  const end = recipe.templates?.get(position / width) ?? after;
  const children: Raw.ChildNode[] = [];
  // Each child of a finite recipe segment is materialized once for its owning parent.
  if (opened) {
    for (let index = first; index < end; index++)
      children.push(opened.get(index - first) ?? copyChild(recipe, index, parent));
    return children;
  }
  for (let index = first; index < end; index++) children.push(copyChild(recipe, index, parent));
  return children;
}

function copyTemplateContent(recipe: CopyRecipe, position: number): Raw.DocumentFragment {
  let pending: CopyRecipe | undefined = recipe;
  let children: Raw.ChildNode[] | undefined;
  return {
    nodeName: "#document-fragment",
    get childNodes() {
      // Opening one fragment never recurses through the content of nested templates.
      if (pending) this.childNodes = copyChildren(pending, position, this);
      return (children ??= []);
    },
    set childNodes(value) {
      children = value;
      pending = undefined;
    },
  };
}

function copyChild(recipe: CopyRecipe, index: number, parent: Raw.ParentNode): Raw.ChildNode {
  const { slots, names, leafTexts, foreignNamespaces, templates } = recipe;
  const position = index * width;
  const kind = slots[position];
  const name = names[index];
  invariant(kind !== undefined && name !== undefined, "A packed child must name a checked slot");
  if (kind === 2) return { nodeName: "#text", value: name, parentNode: parent };
  if (kind === 3) return { nodeName: "#comment", data: name, parentNode: parent };
  if (kind === 4) {
    const ids = recipe.doctypes?.get(index);
    invariant(ids, "A packed doctype must own its identifiers");
    return { nodeName: "#documentType", name, ...ids, parentNode: parent };
  }
  const namespace = foreignNamespaces?.get(index) ?? html.NS.HTML;
  const attributes = recipeAttributes(recipe, position);
  if (kind >= packedLeafKind) {
    const text = leafTexts[kind - packedLeafKind];
    invariant(text !== undefined, "A packed leaf must represent its text");
    return new PackedLeaf(name, namespace, attributes, text, parent);
  }
  invariant(kind === 1, "A packed element must name an element slot");
  const contentIndex = templates?.get(index);
  if (contentIndex === undefined && slots[position + 2] === slots[position + width + 2]) {
    const leaf = tree.createElement(name, namespace, attributes);
    leaf.parentNode = parent;
    return leaf;
  }
  const branch = new PackedBranch(name, namespace, attributes, parent, recipe, position);
  if (contentIndex !== undefined) {
    Object.assign(branch, { content: copyTemplateContent(recipe, contentIndex * width) });
  }
  return branch;
}

/** Creates an independent shallow document over a private recipe. Each accessed branch owns its child list. */
export function copyInactiveTemplate(recipe: CopyRecipe): Raw.Document {
  const document = tree.createDocument();
  tree.setDocumentMode(document, recipe.mode);
  document.childNodes = copyChildren(recipe, 0, document);
  packedDocuments.add(document);
  return document;
}
