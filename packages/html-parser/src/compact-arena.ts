// Provides semantic reads over fully validated, privately owned native wire storage.
import { err, ok, type Result } from "neverthrow";
import type { HTMLSnapshot } from "./schema.js";
import { invariant } from "./invariant.js";
import { arenaOwnershipIssues, type OwnershipArena } from "./snapshot-ownership.js";
import {
  headerWords,
  nodeWords,
  attributeWords,
  absent,
  kinds,
  namespaces,
  attributeNamespaces,
  parseCompactStorage,
  invalid,
  type CompactStorage,
  type SnapshotError,
} from "./compact-storage.js";

const arenaKey = Symbol();
type ArenaAttribute = { name: string; value: string; namespace?: string; prefix?: string };
class CompactArena implements OwnershipArena {
  readonly #storage: CompactStorage;
  constructor(key: symbol, storage: CompactStorage) {
    invariant(
      key === arenaKey,
      "Validated arenas are allocated only by their native-owned boundary",
    );
    this.#storage = storage;
  }
  get length(): number {
    return this.#storage.count;
  }
  get mode(): HTMLSnapshot["mode"] {
    return this.#storage.mode;
  }
  #word(position: number): number {
    const value = this.#storage.words[position];
    invariant(value !== undefined, "Validated compact section stays within storage");
    return value;
  }
  #position(slot: number): number {
    invariant(
      Number.isInteger(slot) && slot >= 0 && slot < this.length,
      "Arena read requires an existing integer slot",
    );
    return headerWords + slot * nodeWords;
  }
  #split(offset: number): boolean {
    const text = this.#storage.strings;
    return (
      offset > 0 &&
      offset < text.length &&
      text.charCodeAt(offset) >= 0xdc00 &&
      text.charCodeAt(offset) <= 0xdfff &&
      text.charCodeAt(offset - 1) >= 0xd800 &&
      text.charCodeAt(offset - 1) <= 0xdbff
    );
  }
  #validSpan(position: number): boolean {
    const start = this.#word(position),
      end = start + this.#word(position + 1);
    return end <= this.#storage.strings.length && !this.#split(start) && !this.#split(end);
  }
  #span(position: number): string {
    const start = this.#word(position);
    return this.#storage.strings.slice(start, start + this.#word(position + 1));
  }
  kind(slot: number): HTMLSnapshot["nodes"][number]["kind"] | undefined {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.length) return;
    return kinds[this.#word(headerWords + slot * nodeWords)];
  }
  name(slot: number): string {
    return this.#span(this.#position(slot) + 2);
  }
  namespace(slot: number): HTMLSnapshot["nodes"][number]["namespace"] {
    const value = namespaces[this.#word(this.#position(slot) + 1)];
    invariant(value !== undefined, "Checked namespace has a canonical value");
    return value;
  }
  text(slot: number): string {
    return this.#span(this.#position(slot) + 4);
  }
  publicId(slot: number): string {
    return this.kind(slot) === "doctype" ? this.#span(this.#position(slot) + 6) : "";
  }
  systemId(slot: number): string {
    return this.kind(slot) === "doctype" ? this.#span(this.#position(slot) + 8) : "";
  }
  template(slot: number): number | null {
    const value = this.#word(this.#position(slot) + 10);
    return value === absent ? null : value;
  }
  form(slot: number): number | null {
    const value = this.#word(this.#position(slot) + 11);
    return value === absent ? null : value;
  }
  childCount(slot: number): number {
    return this.kind(slot) === "doctype" ? 0 : this.#word(this.#position(slot) + 7);
  }
  childAt(slot: number, edge: number): number | undefined {
    if (!Number.isInteger(edge) || edge < 0 || edge >= this.childCount(slot)) return;
    return this.#word(this.#storage.childrenStart + this.#word(this.#position(slot) + 6) + edge);
  }
  attributeCount(slot: number): number {
    return this.kind(slot) === "doctype" ? 0 : this.#word(this.#position(slot) + 9);
  }
  #attributePosition(slot: number, edge: number): number {
    invariant(
      Number.isInteger(edge) && edge >= 0 && edge < this.attributeCount(slot),
      "Attribute read requires an existing integer edge",
    );
    return (
      this.#storage.attributesStart + (this.#word(this.#position(slot) + 8) + edge) * attributeWords
    );
  }
  attributeAt(slot: number, edge: number): ArenaAttribute {
    const position = this.#attributePosition(slot, edge),
      namespace = attributeNamespaces[this.#word(position + 4)],
      prefix = this.#span(position + 5);
    invariant(namespace !== undefined, "Checked attribute has a canonical namespace");
    const attribute: ArenaAttribute = {
      name: this.#span(position),
      value: this.#span(position + 2),
    };
    if (namespace) attribute.namespace = namespace;
    if (prefix) attribute.prefix = prefix;
    return attribute;
  }
  #attributeTuple(slot: number, edge: number): [string, string, string, string] {
    const position = this.#attributePosition(slot, edge),
      namespace = attributeNamespaces[this.#word(position + 4)];
    invariant(namespace !== undefined, "Checked attribute has a canonical namespace");
    return [this.#span(position), this.#span(position + 2), namespace, this.#span(position + 5)];
  }
  /** Preserves the stable public snapshot representation without retaining any mutable wire alias. */
  snapshot(): HTMLSnapshot {
    const nodes: HTMLSnapshot["nodes"] = [];
    // Counts and ranges were checked against exact finite backing storage before this conversion.
    for (let slot = 0; slot < this.length; slot++) {
      const kind = this.kind(slot);
      invariant(kind, "Every checked arena slot has a kind");
      const children: number[] = [],
        attrs: HTMLSnapshot["nodes"][number]["attrs"] = [];
      for (let edge = 0; edge < this.childCount(slot); edge++) {
        const child = this.childAt(slot, edge);
        invariant(child !== undefined, "Checked child edge exists");
        children.push(child);
      }
      for (let edge = 0; edge < this.attributeCount(slot); edge++)
        attrs.push(this.#attributeTuple(slot, edge));
      nodes.push({
        kind,
        name: this.name(slot),
        namespace: this.namespace(slot),
        text: this.text(slot),
        public_id: this.publicId(slot),
        system_id: this.systemId(slot),
        children,
        attrs,
        template: this.template(slot),
        form: this.form(slot),
      });
    }
    return { version: 1, mode: this.mode, nodes };
  }
  /** Rejects the first malformed section/span before semantic graph validation or DOM allocation. */
  storageIssue(): string | undefined {
    const { count, childCount, attributeCount, childrenStart, attributesStart } = this.#storage;
    for (let slot = 0; slot < count; slot++) {
      const position = headerWords + slot * nodeWords,
        kind = kinds[this.#word(position)],
        namespace = namespaces[this.#word(position + 1)];
      if (!kind || namespace === undefined) return "Unknown compact node kind or namespace";
      if (
        !this.#validSpan(position + 2) ||
        !this.#validSpan(position + 4) ||
        (kind === "doctype" && (!this.#validSpan(position + 6) || !this.#validSpan(position + 8)))
      )
        return "Compact node string span is outside Unicode storage";
      const childStart = kind === "doctype" ? 0 : this.#word(position + 6),
        children = kind === "doctype" ? 0 : this.#word(position + 7),
        attrStart = kind === "doctype" ? 0 : this.#word(position + 8),
        attrs = kind === "doctype" ? 0 : this.#word(position + 9);
      if (childStart + children > childCount || attrStart + attrs > attributeCount)
        return "Compact node section is outside storage";
      for (let edge = 0; edge < children; edge++)
        if (this.#word(childrenStart + childStart + edge) >= count)
          return "Compact child slot is outside the arena";
      for (let edge = 0; edge < attrs; edge++) {
        const offset = attributesStart + (attrStart + edge) * attributeWords;
        if (
          !this.#validSpan(offset) ||
          !this.#validSpan(offset + 2) ||
          !this.#validSpan(offset + 5) ||
          attributeNamespaces[this.#word(offset + 4)] === undefined
        )
          return "Compact attribute name, namespace or span is invalid";
      }
      const template = this.#word(position + 10),
        form = this.#word(position + 11);
      if ((template !== absent && template >= count) || (form !== absent && form >= count))
        return "Compact template or form slot is outside the arena";
    }
  }
}
// The opaque view never exposes its backing words; later callers cannot poison semantic read methods.
Object.freeze(CompactArena.prototype);
export type HTMLArena = CompactArena;
/** Internal native-owned boundary. Unknown borrowed storage must never escape through this view. */
export function decodeOwnedCompactArena(value: unknown): Result<HTMLArena, SnapshotError> {
  return parseCompactStorage(value).andThen((storage) => {
    const arena = new CompactArena(arenaKey, storage),
      issue = arena.storageIssue();
    if (issue) return invalid(issue);
    const issues = arenaOwnershipIssues(arena);
    return issues.length
      ? err<HTMLArena, SnapshotError>({ type: "invalid_snapshot", issues })
      : ok(arena);
  });
}
