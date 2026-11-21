// Transfers the private completed fragment tree without repeatedly shifting a large donor array.
import invariant from "node:assert/strict";
import {
  Parser,
  html,
  defaultTreeAdapter as tree,
  parseFragment,
  type DefaultTreeAdapterTypes as Raw,
  type ParserOptions,
  type TreeAdapter,
} from "parse5";

const ownedAdapters = new WeakSet<TreeAdapter<Raw.DefaultTreeAdapterMap>>();
/** Adds a project-owned metadata callback without exposing private parser arrays to author code.
 * The callback must keep raw storage private. Foreign/custom base adapters retain their full protocol.
 */
export function createOwnedElementAdapter({
  adapter,
  onElement,
}: {
  adapter: TreeAdapter<Raw.DefaultTreeAdapterMap>;
  onElement: (node: Raw.Element) => void;
}): TreeAdapter<Raw.DefaultTreeAdapterMap> {
  const result: TreeAdapter<Raw.DefaultTreeAdapterMap> = {
    ...adapter,
    createElement(...args: Parameters<typeof tree.createElement>) {
      const node = adapter.createElement(...args);
      onElement(node);
      return node;
    },
  };
  if (adapter === tree || ownedAdapters.has(adapter)) ownedAdapters.add(result);
  return result;
}

function takeOwnedFragment(parser: Parser<Raw.DefaultTreeAdapterMap>): Raw.DocumentFragment {
  const root = tree.getFirstChild(parser.document);
  invariant(root && "childNodes" in root, "A completed fragment parser owns its synthetic root");
  const fragment = tree.createDocumentFragment();
  // No author-owned adapter or live DOM handle observes these private arrays.
  const children = root.childNodes;
  root.childNodes = [];
  fragment.childNodes = children;
  for (const child of children) child.parentNode = fragment;
  return fragment;
}

/** Parses inactive HTML with canonical raw storage; custom adapters retain parse5's complete protocol. */
export function parseOwnedHTMLFragment({
  context,
  markup,
  options,
}: {
  context: Raw.ParentNode;
  markup: string;
  options: ParserOptions<Raw.DefaultTreeAdapterMap>;
}): Raw.DocumentFragment {
  if (
    options.treeAdapter &&
    options.treeAdapter !== tree &&
    !ownedAdapters.has(options.treeAdapter)
  )
    return parseFragment(context, markup, options);
  const parser = Parser.getFragmentParser<Raw.DefaultTreeAdapterMap>(context, options);
  parser.tokenizer.write(markup, true);
  return takeOwnedFragment(parser);
}

type ReplacementEffects = {
  ids: Set<string> | undefined;
  hasDocumentNames: boolean;
  hasDetails: boolean;
  hasConnectionEffects: boolean;
  hasScripts: boolean;
};

const maximumReplacementIds = 128;

/** Parses ordinary replacement markup and records conservative effects before the tree is published. */
export function parseHTMLReplacement({
  context,
  markup,
  options,
}: Parameters<typeof parseOwnedHTMLFragment>[0]): {
  fragment: Raw.DocumentFragment;
  effects: ReplacementEffects;
} {
  const effects: ReplacementEffects = {
    ids: new Set(),
    hasDocumentNames: false,
    hasDetails: false,
    hasConnectionEffects: false,
    hasScripts: false,
  };
  const base = options.treeAdapter ?? tree;
  // HTML RAWTEXT without tokenizer transitions produces exactly one unchanged text node.
  if (
    (base === tree || ownedAdapters.has(base)) &&
    !options.sourceCodeLocationInfo &&
    tree.isElementNode(context) &&
    context.namespaceURI === html.NS.HTML &&
    context.tagName === "style" &&
    !/[<\r]/.test(markup) &&
    !markup.includes("\0")
  ) {
    const fragment = base.createDocumentFragment();
    if (markup) base.insertText(fragment, markup);
    return { fragment, effects };
  }
  function recordIds(attrs: Raw.Element["attrs"]): void {
    const ids = effects.ids;
    if (!ids) return;
    for (const attr of attrs) {
      if (attr.name !== "id" || attr.namespace || !attr.value) continue;
      ids.add(attr.value);
      if (ids.size > maximumReplacementIds) {
        effects.ids = undefined;
        return;
      }
    }
  }
  const adapter = createOwnedElementAdapter({
    adapter: base,
    onElement(node) {
      recordIds(node.attrs);
      // Parsed or discarded elements may overstate the effects. The final tree
      // still decides membership and order when any corresponding effect is possible.
      switch (node.tagName) {
        case "iframe":
          effects.hasDocumentNames = true;
          effects.hasConnectionEffects = true;
          break;
        case "embed":
        case "form":
        case "img":
        case "object":
          effects.hasDocumentNames = true;
          break;
        case "details":
          effects.hasDetails = true;
          break;
        case "script":
          effects.hasScripts = true;
          break;
        case "frame":
        case "link":
        case "style":
        case "input":
          effects.hasConnectionEffects = true;
          break;
        default:
          if (node.tagName.endsWith(":script")) effects.hasScripts = true;
      }
    },
  });
  adapter.adoptAttributes = (recipient, attrs) => {
    base.adoptAttributes(recipient, attrs);
    recordIds(attrs);
  };
  const fragment = parseOwnedHTMLFragment({
    context,
    markup,
    options: { ...options, treeAdapter: adapter },
  });
  return { fragment, effects };
}
