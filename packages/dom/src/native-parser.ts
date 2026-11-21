// Materializes validated native templates directly into the canonical private parse5 representation.
import { compileInactiveTemplate, copyInactiveTemplate } from "./private-template-copy.js";
import { createRequire } from "node:module";
import {
  defaultTreeAdapter as tree,
  html,
  type DefaultTreeAdapterTypes as Raw,
  type ParserOptions,
} from "parse5";
import type { HTMLArena } from "@run-dom/html-parser";

const selectedParser = process.env.RUN_DOM_HTML_PARSER;
const require = createRequire(import.meta.url);
let native: typeof import("@run-dom/html-parser") | undefined;
const namespaces = new Map<string, html.NS>(Object.values(html.NS).map((value) => [value, value]));
// Repeated inactive sources may retain private templates made from validated immutable templates; public documents are always materialized afresh.
const templateMarkupLimit = 1024 * 1024;
const templateNodeLimit = 32768;
const templateEntryLimit = 8;
const templateCharacterBudget = 4 * templateMarkupLimit;
const templateNodeBudget = 4 * templateNodeLimit;
type NativeTemplateEntry = {
  markup: string;
  scriptingEnabled: boolean;
  recipe?: ReturnType<typeof compileInactiveTemplate>;
  nodes?: number;
};
const templates: NativeTemplateEntry[] = [];
let recentTemplate: NativeTemplateEntry | undefined;
let templateCharacters = 0;
let templateNodes = 0;

function retainTemplate(entry: NativeTemplateEntry): void {
  const previous = templates.findIndex(
    (candidate) =>
      candidate.markup === entry.markup && candidate.scriptingEnabled === entry.scriptingEnabled,
  );
  if (previous !== -1) removeTemplate(previous);
  const nodes = entry.nodes ?? 0;
  // At most eight keys/templates share aggregate capacity; no full-source hashing on unique misses.
  while (
    templates.length &&
    (templates.length >= templateEntryLimit ||
      templateCharacters + entry.markup.length > templateCharacterBudget ||
      templateNodes + nodes > templateNodeBudget)
  )
    removeTemplate(0);
  templates.push(entry);
  templateCharacters += entry.markup.length;
  templateNodes += nodes;
  recentTemplate = entry;
}

function removeTemplate(index: number): void {
  const entry = templates[index];
  if (!entry) throw new Error("Expected a retained private native template entry");
  templates.splice(index, 1);
  templateCharacters -= entry.markup.length;
  templateNodes -= entry.nodes ?? 0;
}

const modes = {
  quirks: html.DOCUMENT_MODE.QUIRKS,
  "limited-quirks": html.DOCUMENT_MODE.LIMITED_QUIRKS,
  "no-quirks": html.DOCUMENT_MODE.NO_QUIRKS,
};

function materialize(
  arena: HTMLArena,
  invariant: (typeof import("@run-dom/html-parser"))["invariant"],
): Raw.Document {
  const nodes: Raw.Node[] = [];
  // Validation already bounded every slot/edge and checked ownership before these private allocations.
  for (let index = 0; index < arena.length; index++) {
    switch (arena.kind(index)) {
      case "document":
        nodes.push(tree.createDocument());
        break;
      case "fragment":
        nodes.push(tree.createDocumentFragment());
        break;
      case "text":
        nodes.push(tree.createTextNode(arena.text(index)));
        break;
      case "comment":
        nodes.push(tree.createCommentNode(arena.text(index)));
        break;
      case "doctype":
        nodes.push({
          nodeName: "#documentType",
          name: arena.name(index),
          publicId: arena.publicId(index),
          systemId: arena.systemId(index),
          parentNode: null,
        });
        break;
      case "element": {
        const namespace = namespaces.get(arena.namespace(index));
        invariant(namespace, "Validated element namespace must have a canonical parse5 namespace");
        const attributeCount = arena.attributeCount(index);
        const attrs = new Array<Raw.Element["attrs"][number]>(attributeCount);
        for (let edge = 0; edge < attributeCount; edge++)
          attrs[edge] = arena.attributeAt(index, edge);
        const node = tree.createElement(arena.name(index), namespace, attrs);
        if (arena.template(index) === null) {
          nodes.push(node);
          break;
        }
        const template: Raw.Template = {
          ...node,
          nodeName: "template",
          tagName: "template",
          content: tree.createDocumentFragment(),
        };
        nodes.push(template);
        break;
      }
      default:
        invariant(false, "Every validated arena slot must have a materializable kind");
    }
  }
  for (let index = 0; index < arena.length; index++) {
    const node = nodes[index];
    invariant(node, "Every validated arena slot must be materialized");
    const childCount = arena.childCount(index);
    if (childCount) {
      invariant("childNodes" in node, "Only a parent node can own child records");
      for (let edge = 0; edge < childCount; edge++) {
        const childIndex = arena.childAt(index, edge);
        invariant(childIndex !== undefined, "Every checked child edge has an arena slot");
        const child = nodes[childIndex];
        invariant(
          child && child.nodeName !== "#document" && child.nodeName !== "#document-fragment",
          "Ownership edge must reference an appendable child",
        );
        invariant("parentNode" in child, "Every child record has private parent storage");
        tree.appendChild(node, child);
      }
    }
    const template = arena.template(index);
    if (template !== null) {
      const content = nodes[template];
      invariant(
        tree.isElementNode(node) && node.tagName === "template" && "content" in node,
        "Template element must own its content storage",
      );
      invariant(
        content &&
          content.nodeName === "#document-fragment" &&
          "childNodes" in content &&
          !("parentNode" in content) &&
          !("mode" in content),
        "Template content slot must be a document fragment",
      );
      node.content = content;
    }
  }
  const document = nodes[0];
  invariant(document && "mode" in document, "Slot zero must be a document");
  tree.setDocumentMode(document, modes[arena.mode]);
  return document;
}

/** Returns a Rust-parsed inactive document or an explicitly counted capability fallback.
 * Active/incremental and XML parsers never enter this boundary. Native failures remain visible.
 */
export function parseNativeInactiveHTML(
  markup: string,
  options: ParserOptions<Raw.DefaultTreeAdapterMap>,
): Raw.Document | undefined {
  if (selectedParser === undefined || selectedParser === "typescript") return undefined;
  const parser: typeof import("@run-dom/html-parser") =
    (native ??= require("@run-dom/html-parser"));
  const selection = parser.parserSelectionSchema.safeParse(selectedParser);
  if (!selection.success) throw new TypeError("RUN_DOM_HTML_PARSER must be typescript or rust");
  if (selection.data === "typescript") return undefined;
  const reason = options.sourceCodeLocationInfo
    ? "source_locations"
    : options.treeAdapter
      ? "custom_adapter"
      : !markup.isWellFormed()
        ? "utf16_surrogate"
        : /<form[\t\n\f\r />]/i.test(markup)
          ? "form_association"
          : undefined;
  if (reason) {
    const recorded = parser.recordParserFallback(reason);
    parser.invariant(
      recorded.isOk(),
      "Known parser fallback reason must satisfy its boundary schema",
    );
    return undefined;
  }
  const scriptingEnabled = options.scriptingEnabled ?? true;
  const canReuse = markup.length <= templateMarkupLimit;
  let entry = canReuse ? recentTemplate : undefined;
  if (canReuse && (entry?.markup !== markup || entry.scriptingEnabled !== scriptingEnabled))
    entry = templates.find(
      (candidate) => candidate.markup === markup && candidate.scriptingEnabled === scriptingEnabled,
    );
  if (entry?.recipe) {
    if (entry !== recentTemplate) retainTemplate(entry);
    return copyInactiveTemplate(entry.recipe);
  }
  const parsed = parser.parseHTMLArena({ markup, scriptingEnabled });
  if (parsed.isErr())
    throw new Error(`Rust HTML parser failed: ${parsed.error.type}`, { cause: parsed.error });
  if (canReuse) {
    if (!entry) retainTemplate({ markup, scriptingEnabled });
    else if (parsed.value.length <= templateNodeLimit) {
      const document = materialize(parsed.value, parser.invariant);
      const recipe = compileInactiveTemplate(document, parsed.value.length);
      retainTemplate({ markup, scriptingEnabled, recipe, nodes: parsed.value.length });
      return copyInactiveTemplate(recipe);
    } else if (entry !== recentTemplate) retainTemplate(entry);
  }
  return materialize(parsed.value, parser.invariant);
}
