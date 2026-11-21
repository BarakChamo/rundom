// Recognizes independent CSS longhands whose specified values already have their serialized spelling.
import type { DeclarationImplementation } from "./css-declaration-view.js";

type InlineBlock = {
  readonly text: string;
  readonly entries: readonly (readonly [string, string])[];
};

const empty: InlineBlock = { text: "", entries: [] };
const sizes = /^(?:(?:min-|max-)?(?:width|height|block-size|inline-size))$/;
// Bound magnitude and precision so CSS number serialization cannot round or switch notation.
const length = /^(?:0|[1-9][0-9]{0,4})(?:\.[0-9]{0,3}[1-9])?(?:px|em|rem|vw|vh|%)$/;
const colors = /^(?:black|white|red|green|blue|yellow|orange|purple|transparent)$/;
const keywords = new Map<string, RegExp>([
  ["color", colors],
  ["background-color", colors],
  ["display", /^(?:none|block|inline|flex|grid)$/],
  ["position", /^(?:static|relative|absolute|fixed|sticky)$/],
  ["visibility", /^(?:visible|hidden|collapse)$/],
]);
const entry =
  /[\t\n\f\r ]*([a-z-]+)[\t\n\f\r ]*:[\t\n\f\r ]*([a-z0-9.%]+)[\t\n\f\r ]*(?:;[\t\n\f\r ]*|$)/y;
const limit = 8;

function recognized(name: string, value: string): boolean {
  return sizes.test(name) ? length.test(value) : (keywords.get(name)?.test(value) ?? false);
}

/** Parses a bounded list of distinct longhands. Other inputs retain the full CSSOM parser. */
export function parseInlineBlock(source: string): InlineBlock | undefined {
  if (!source) return empty;
  if (source.length > 384) return;
  const entries: [string, string][] = [];
  let cursor = 0;
  let text = "";
  while (cursor < source.length && entries.length < limit) {
    entry.lastIndex = cursor;
    const match = entry.exec(source);
    if (!match) return;
    const [, name, value] = match;
    if (!name || !value || !recognized(name, value) || entries.some(([key]) => key === name))
      return;
    entries.push([name, value]);
    text += (text ? " " : "") + name + ": " + value + ";";
    cursor = entry.lastIndex;
  }
  return cursor === source.length ? { text, entries } : undefined;
}

/** Resolves an independent specified longhand, including its empty value when absent. */
function inlineValue(block: InlineBlock, name: string): string | undefined {
  if (!keywords.has(name) && !sizes.test(name)) return;
  return block.entries.find(([key]) => key === name)?.[1] ?? "";
}

/** Serializes a supported update in declaration order. Undefined delegates the whole write to CSSOM. */
function updateInlineBlock(block: InlineBlock, name: string, value: unknown): string | undefined {
  if (typeof value !== "string" || (value && !recognized(name, value))) return;
  const previous = inlineValue(block, name);
  if (previous === undefined) return;
  if (previous === value) return block.text;
  const declaration = name + ": " + value + ";";
  if (!previous) {
    if (block.entries.length === limit) return;
    return (block.text ? block.text + " " : "") + declaration;
  }
  const index = block.entries.findIndex(([key]) => key === name);
  return block.entries
    .map(([key, current], i) =>
      i === index ? (value ? declaration : "") : key + ": " + current + ";",
    )
    .filter(Boolean)
    .join(" ");
}

type InlineAccess<Node> = {
  source(node: Node): string | undefined;
  update(node: Node, text: string): void;
  materialize(node: Node): DeclarationImplementation;
};

/** A live inline declaration backed by its element's attribute until an operation needs full CSSOM. */
export class InlineDeclaration<Node> implements DeclarationImplementation {
  readonly [index: number]: string | undefined;
  constructor(
    private readonly node: Node,
    private readonly access: InlineAccess<Node>,
  ) {}
  private block(): InlineBlock | undefined {
    const source = this.access.source(this.node);
    return source === undefined ? undefined : parseInlineBlock(source);
  }
  materialize(): DeclarationImplementation {
    return this.access.materialize(this.node);
  }
  get _length(): number {
    return this.block()?.entries.length ?? this.materialize()._length;
  }
  item(index: number): string | undefined {
    const block = this.block();
    return block ? block.entries[index]?.[0] : this.materialize()[index];
  }
  get cssText(): string {
    return this.block()?.text ?? this.materialize().cssText;
  }
  set cssText(value: string) {
    const block = this.access.source(this.node) !== undefined && parseInlineBlock(value);
    if (block) this.access.update(this.node, block.text);
    else this.materialize().cssText = value;
  }
  get parentRule(): null {
    return null;
  }
  read(name: string): string | undefined {
    const source = this.access.source(this.node);
    if (source === undefined) return;
    if (
      /^(?:display|color|position|visibility)$/.test(name) &&
      (!source ||
        (!source.includes("\\") && !/all/i.test(source) && !source.toLowerCase().includes(name)))
    )
      return "";
    const block = parseInlineBlock(source);
    return block && inlineValue(block, name);
  }
  write(name: string, value: unknown): boolean {
    const block = this.block();
    if (!block) return false;
    const next = updateInlineBlock(block, name, value);
    if (next === undefined) return false;
    if (next !== block.text) this.access.update(this.node, next);
    return true;
  }
  getPropertyValue(name: string): string {
    return this.read(name) ?? this.materialize().getPropertyValue(name);
  }
  getPropertyPriority(name: string): string {
    return this.block() ? "" : this.materialize().getPropertyPriority(name);
  }
  setProperty(name: string, value: string, priority = ""): void {
    if (priority || !this.write(name, value)) this.materialize().setProperty(name, value, priority);
  }
  removeProperty(name: string): string {
    const previous = this.read(name);
    return previous !== undefined && this.write(name, "")
      ? previous
      : this.materialize().removeProperty(name);
  }
}
