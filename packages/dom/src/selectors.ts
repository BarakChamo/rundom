// Adapts CSS selectors to the raw DOM tree without going through public getters.
import { createRequire } from "node:module";
import { defaultTreeAdapter as tree, html, type DefaultTreeAdapterTypes as Raw } from "parse5";
import {
  normalizeSelector,
  parseSelectorList,
  customStateIdentifier,
  validSelectorCompounds,
  purePseudoSelector,
} from "./selector-syntax.js";
import { validPseudoSelectorList } from "./css-reference.js";
import { checkedness, inputType, isInput } from "./input-state.js";
import { hasCustomState } from "./custom-state.js";
import { elementLocalName, xmlSpecial } from "./xml.js";
import type { Options } from "css-select";
import type { CssNode } from "css-tree";

const require = createRequire(import.meta.url);
type Adapter = NonNullable<Options<Raw.Node, Raw.Element>["adapter"]>;

const legacyPseudoElements = new Set(["before", "after", "first-line", "first-letter"]);
const elementlessPseudos = new Set([
  ...legacyPseudoElements,
  "selection",
  "target-text",
  "grammar-error",
  "spelling-error",
  "highlight",
  "marker",
  "placeholder",
  "backdrop",
  "file-selector-button",
  "details-content",
  "part",
  "slotted",
  "cue",
  "cue-region",
  "view-transition",
  "view-transition-group",
  "view-transition-group-children",
  "view-transition-image-pair",
  "view-transition-new",
  "view-transition-old",
]);

function parent(node: Raw.Node): Raw.ParentNode | null {
  return "parentNode" in node ? node.parentNode : null;
}

function children(node: Raw.Node): Raw.ChildNode[] {
  return "childNodes" in node ? node.childNodes : [];
}

function attribute(node: Raw.Element, name: string): string | undefined {
  for (const attr of node.attrs) if (!attr.namespace && attr.name === name) return attr.value;
  return undefined;
}

function isClassSeparator(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 12 || code === 13;
}

/** Matches a decoded CSS class against the current no-namespace class attribute. */
export function hasClass(node: Raw.Element, name: string): boolean {
  const text = attribute(node, "class");
  return text !== undefined && hasClassToken(text, name);
}

/** Tests one decoded class name against a raw class attribute using HTML whitespace. */
export function hasClassToken(text: string, name: string): boolean {
  if (text === name) return true;
  // Each failed match advances through the finite attribute value.
  for (let index = text.indexOf(name); index >= 0; index = text.indexOf(name, index + 1)) {
    const end = index + name.length;
    if (
      (index === 0 || isClassSeparator(text.charCodeAt(index - 1))) &&
      (end === text.length || isClassSeparator(text.charCodeAt(end)))
    )
      return true;
  }
  return false;
}

const adapter: Adapter = {
  isTag: tree.isElementNode,
  getChildren: children,
  getName: elementLocalName,
  getParent: parent,
  getSiblings(node) {
    const owner = parent(node);
    return owner ? children(owner) : [node];
  },
  getAttributeValue: attribute,
  hasAttrib: (node, name) => attribute(node, name) !== undefined,
  getText(node) {
    const parts: string[] = [];
    const stack: Raw.Node[] = [node];
    // Each tree edge is visited once.
    while (stack.length) {
      const child = stack.pop();
      if (!child) break;
      if (tree.isTextNode(child)) parts.push(child.value);
      else {
        const descendants = children(child);
        for (let index = descendants.length - 1; index >= 0; index--) {
          const descendant = descendants[index];
          if (descendant) stack.push(descendant);
        }
      }
    }
    return parts.join("");
  },
  removeSubsets(nodes) {
    const unique = new Set(nodes);
    return [...unique].filter((node) => {
      for (let owner = parent(node); owner; owner = parent(owner)) {
        if (unique.has(owner)) return false;
      }
      return true;
    });
  },
};

function liveStateSelector(selector: string): { source: string; names?: Map<string, string> } {
  if (
    !selector.includes("\\") &&
    !/:(?:checked|enabled|disabled|link|any-link|visited|required|optional|read-write|read-only)\b/i.test(
      selector,
    )
  )
    return { source: selector };
  const names = new Map<string, string>();
  const { parse, walk, generate, ident }: typeof import("css-tree") =
    require("./css-runtime.cjs").cssTree;
  const decodedSource = ident.decode(selector);
  const ast = parse(selector, { context: "selectorList" });
  walk(ast, {
    visit: "PseudoClassSelector",
    enter(node) {
      const name = ident.decode(node.name).replace(/[A-Z]/g, (letter) => letter.toLowerCase());
      if (
        ![
          "checked",
          "enabled",
          "disabled",
          "link",
          "any-link",
          "visited",
          "required",
          "optional",
          "read-write",
          "read-only",
        ].includes(name)
      )
        return;
      let alias = names.get(name) ?? `run-dom-${name}`;
      while (decodedSource.includes(alias)) alias += "-";
      names.set(name, alias);
      node.name = alias;
    },
  });
  return { source: names.size ? generate(ast) : selector, names };
}

// The selector compiled against this adapter is a single attribute selector.
const attributeValueAdapter: NonNullable<Options<string, string>["adapter"]> = {
  isTag: (value): value is string => typeof value === "string",
  getAttributeValue: (value) => value,
  getChildren: () => [],
  getName: () => "",
  getParent: () => null,
  getSiblings: (value) => [value],
  getText: () => "",
  hasAttrib: () => true,
  removeSubsets: (values) => values,
};

function namespacedAttributeMatcher(
  name: string,
  selector: string,
  isXML: boolean,
  namespace?: string,
) {
  const { compile }: typeof import("css-select") = require("./css-runtime.cjs").cssSelect;
  const exact = compile(selector, { adapter: attributeValueAdapter, xmlMode: true });
  const html = isXML
    ? exact
    : compile(selector, { adapter: attributeValueAdapter, xmlMode: false });
  return (element: Raw.Element) =>
    element.attrs.some((attribute) => {
      if (
        attribute.name !== name ||
        (namespace !== undefined && (attribute.namespace ?? "") !== namespace)
      )
        return false;
      const match =
        attribute.namespace || element.namespaceURI !== "http://www.w3.org/1999/xhtml"
          ? exact
          : html;
      return match(attribute.value);
    });
}

function bareAttributeMatcher(name: string, selector: string, isXML: boolean) {
  const exact = namespacedAttributeMatcher(name, selector, true, "");
  const lower = name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const html = isXML ? exact : namespacedAttributeMatcher(lower, selector, false, "");
  return (element: Raw.Element) =>
    (element.namespaceURI === "http://www.w3.org/1999/xhtml" ? html : exact)(element);
}

const qualifiedSelectorName = /^((?:\\.|[^\\|])+)[|](.+)$/;

function hasUndeclaredNamespace(selector: import("css-tree").CssNode): boolean {
  const { walk }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  let invalid = false;
  walk(selector, function (node) {
    const name =
      node.type === "TypeSelector"
        ? node.name
        : node.type === "AttributeSelector"
          ? node.name.name
          : undefined;
    if (!name || name.startsWith("|") || name.startsWith("*|")) return;
    // A literal namespace separator follows an even number of escape characters.
    if (/(?:^|[^\\])(?:\\\\)*\|/.test(name)) {
      invalid = true;
      return this.break;
    }
  });
  return invalid;
}

const typedSiblingPseudos = new Set([
  "first-of-type",
  "last-of-type",
  "only-of-type",
  "nth-of-type",
  "nth-last-of-type",
]);

// The adapter is used only for standalone typed sibling predicates. Type selectors
// in the rest of the query still compare the local name through the normal adapter.
const typedSiblingAdapter: Adapter = {
  ...adapter,
  getName: (node) => `${node.namespaceURI}\0${elementLocalName(node)}`,
};

function typedSiblingMatcher(selector: string) {
  const { compile }: typeof import("css-select") = require("./css-runtime.cjs").cssSelect;
  return compile(selector, { adapter: typedSiblingAdapter, cacheResults: false });
}

function relationalMatcher(
  selectors: string[],
  input: Parameters<typeof compileSelector>[0],
): (element: Raw.Element) => boolean {
  let anchor: Raw.Element | undefined;
  let alias = "run-dom-relative-anchor";
  while (input.selector.includes(alias) || Object.hasOwn(input.statePseudos, alias)) alias += "-";
  const matches = compileSelector({
    ...input,
    selector: selectors.map((selector) => `*|*:${alias} ${selector}`).join(","),
    statePseudos: { ...input.statePseudos, [alias]: (element) => element === anchor },
  });
  const siblings = selectors.some((selector) => /^[\t\n\f\r ]*[+~]/.test(selector));
  return (element) => {
    const previous = anchor;
    anchor = element;
    try {
      // A relative path can reach descendants or following siblings and their
      // descendants. The explicit anchor excludes unrelated nodes in this tree.
      const roots: Raw.Node[] = [...children(element)];
      const owner = siblings && parent(element);
      if (owner) roots.push(...children(owner).slice(children(owner).indexOf(element) + 1));
      const pending = roots.reverse();
      while (pending.length) {
        const candidate = pending.pop();
        if (!candidate) break;
        if (tree.isElementNode(candidate) && matches(candidate)) return true;
        const descendants = children(candidate);
        for (let index = descendants.length - 1; index >= 0; index--) {
          const descendant = descendants[index];
          if (descendant) pending.push(descendant);
        }
      }
      return false;
    } finally {
      anchor = previous;
    }
  };
}

function adaptSelector(
  source: string,
  {
    isXML,
    strictSyntax,
    namespaces,
    scope,
  }: {
    isXML: boolean;
    strictSyntax?: boolean;
    namespaces?: ReadonlyMap<string, string> | undefined;
    scope?: Raw.Node;
  },
  pseudos: Record<string, (element: Raw.Element, level?: number) => boolean>,
): string {
  if (
    /::(?:highlight|selection|grammar-error|spelling-error|target-text)\b/i.test(source) &&
    !validPseudoSelectorList(source, namespaces)
  )
    throw new SyntaxError("Invalid pseudo-element selector");
  const hasNamespaceSyntax = source.includes("|");
  const defaultNamespace = namespaces?.get("");
  const { parse, walk, generate, ident }: typeof import("css-tree") =
    require("./css-runtime.cjs").cssTree;
  const ast = strictSyntax ? parse(source, { context: "selectorList" }) : parseSelectorList(source);
  if (ast.type !== "SelectorList" || ast.children.isEmpty) throw new Error("Empty selector");
  walk(ast, {
    enter(
      node: import("css-tree").CssNode,
      item: import("css-tree").ListItem<import("css-tree").CssNode>,
    ) {
      if (node.type === "Selector" && !validSelectorCompounds(node))
        throw new Error("Invalid compound selector");
      if (node.type === "NestingSelector")
        item.data = { type: "PseudoClassSelector", name: "scope", children: null };
    },
  });
  const decodedSource = ident.decode(source).toLowerCase();
  let nextAlias = 0;
  function register(predicate: (element: Raw.Element) => boolean) {
    let name: string;
    do {
      name = `run-dom-namespace-${nextAlias++}`;
    } while (decodedSource.includes(name) || Object.hasOwn(pseudos, name));
    pseudos[name] = predicate;
    return { type: "PseudoClassSelector" as const, name, children: null };
  }
  function localName(name: string): string {
    const decoded = ident.decode(name);
    return isXML ? decoded : decoded.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  }
  let relationalDepth = 0;
  if (!strictSyntax)
    walk(ast, {
      enter(node: import("css-tree").CssNode) {
        if (node.type === "PseudoClassSelector" && ident.decode(node.name).toLowerCase() === "has")
          relationalDepth++;
      },
      leave(
        node: import("css-tree").CssNode,
        item: import("css-tree").ListItem<import("css-tree").CssNode>,
      ) {
        if (node.type !== "PseudoClassSelector") return;
        const name = ident.decode(node.name).toLowerCase();
        if (name === "has") {
          relationalDepth--;
          return;
        }
        if (name !== "is" && name !== "where") return;
        const list = node.children?.first;
        if (list?.type !== "SelectorList") {
          if (node.children?.isEmpty) item.data = register(() => false);
          return;
        }
        list.children.forEach((branch, branchItem) => {
          let invalid = false;
          walk(branch, (part) => {
            if (
              part.type === "PseudoElementSelector" ||
              (part.type === "PseudoClassSelector" &&
                (legacyPseudoElements.has(ident.decode(part.name).toLowerCase()) ||
                  (relationalDepth > 0 && ident.decode(part.name).toLowerCase() === "has")))
            )
              invalid = true;
          });
          if (!invalid) {
            const selector = generate(branch);
            if (selector.includes(":")) {
              try {
                compileSelector({
                  selector,
                  isXML,
                  namespaces,
                  statePseudos: pseudos,
                  ...(scope ? { scope } : {}),
                });
              } catch (error) {
                if (!(error instanceof globalThis.DOMException) || error.name !== "SyntaxError")
                  throw error;
                invalid = true;
              }
            }
          }
          if (invalid) list.children.remove(branchItem);
        });
        if (list.children.isEmpty) item.data = register(() => false);
      },
    });
  walk(ast, {
    visit: "PseudoClassSelector",
    enter(node, item) {
      if (ident.decode(node.name).toLowerCase() !== "state") return;
      const name = customStateIdentifier(node);
      item.data = register((element) => hasCustomState(element, name));
    },
  });
  if (defaultNamespace !== undefined) {
    const implicitType = register((element) => element.namespaceURI === defaultNamespace);
    const functions: string[] = [];
    walk(ast, {
      enter(node: import("css-tree").CssNode) {
        if (node.type === "PseudoClassSelector") {
          functions.push(ident.decode(node.name).toLowerCase());
          return;
        }
        if (node.type !== "Selector") return;
        const parent = functions.at(-1);
        // The subject of these selector arguments ignores an implied universal namespace.
        const exemptSubject = parent === "is" || parent === "where" || parent === "not";
        const lastCombinator = exemptSubject
          ? node.children.toArray().findLast((part) => part.type === "Combinator")
          : undefined;
        let first = true;
        let inSubject = exemptSubject && !lastCombinator;
        node.children.forEach((part, item) => {
          if (part.type === "Combinator") {
            first = true;
            if (part === lastCombinator) inSubject = true;
            return;
          }
          if (first && !inSubject && part.type !== "TypeSelector") {
            node.children.insertData(implicitType, item);
          }
          first = false;
        });
      },
      leave(node: import("css-tree").CssNode) {
        if (node.type === "PseudoClassSelector") functions.pop();
      },
    });
  }
  walk(ast, (node, item) => {
    if (
      node.type === "PseudoClassSelector" &&
      /^nth-(?:last-)?(?:child|of-type)$/i.test(node.name)
    ) {
      const nth = node.children?.first;
      if (
        nth?.type === "Nth" &&
        nth.selector === null &&
        nth.nth.type === "AnPlusB" &&
        Number(nth.nth.a) === 1 &&
        Number(nth.nth.b ?? 0) <= 1
      ) {
        item.data = register(() => true);
        return;
      }
    }
    if (node.type === "IdSelector" || node.type === "ClassSelector") {
      const name = ident.decode(node.name);
      if (node.type === "IdSelector")
        item.data = register((element) => attribute(element, "id") === name);
      else if (/[\t\n\f\r ]/.test(name)) item.data = register(() => false);
      else item.data = register((element) => hasClass(element, name));
      return;
    }
    if (
      node.type === "PseudoElementSelector" ||
      (node.type === "PseudoClassSelector" &&
        legacyPseudoElements.has(ident.decode(node.name).toLowerCase()))
    ) {
      const name = ident.decode(node.name).toLowerCase();
      if (!elementlessPseudos.has(name)) throw new Error(`Unknown pseudo-element ::${name}`);
      item.data = register(() => false);
      return;
    }
    if (
      node.type === "AttributeSelector" &&
      node.matcher === "~=" &&
      node.value &&
      ((node.value.type === "String" && !node.value.value) ||
        (node.value.type === "Identifier" && !node.value.name))
    ) {
      item.data = register(() => false);
      return;
    }
    if (node.type === "PseudoClassSelector") {
      const name = ident.decode(node.name).toLowerCase();
      if (name === "local-link") {
        const text = node.children
          ? generate(node)
              .slice(generate(node).indexOf("(") + 1, -1)
              .trim()
          : undefined;
        if (text !== undefined && !/^\+?\d+$/.test(text))
          throw new SyntaxError("Invalid local link depth");
        const level = text === undefined ? undefined : Number(text);
        item.data = register((element) => pseudos["local-link"]?.(element, level) === true);
        return;
      }
      if (name === "has") {
        const list = node.children?.first;
        if (list?.type !== "SelectorList" || list.children.isEmpty)
          throw new Error("Invalid :has() relative selector list");
        walk(list, (part) => {
          if (
            part.type === "PseudoClassSelector" &&
            ident.decode(part.name).toLowerCase() === "has"
          )
            throw new Error("Nested :has() is not allowed");
        });
        item.data = register(
          relationalMatcher(
            list.children.toArray().map((part) => generate(part)),
            {
              selector: source,
              isXML,
              ...(strictSyntax === undefined ? {} : { strictSyntax }),
              namespaces,
              statePseudos: pseudos,
              ...(scope ? { scope } : {}),
            },
          ),
        );
        return;
      }
      if (name === "host" || name === "host-context") {
        item.data = register(() => false);
        return;
      }
      if (name === "heading") {
        if (node.children === null) {
          item.data = register(pseudos["run-dom-heading"] ?? (() => false));
        } else {
          const argument = node.children
            .toArray()
            .map((part) => generate(part))
            .join("")
            .replace(/\/\*[\s\S]*?\*\//g, " ");
          if (
            !/^[\t\n\f\r ]*[+-]?\d+[\t\n\f\r ]*(?:,[\t\n\f\r ]*[+-]?\d+[\t\n\f\r ]*)*$/.test(
              argument,
            )
          )
            throw new Error("Invalid :heading() integer list");
          const predicates = argument
            .split(",")
            .map((level) => pseudos[`run-dom-heading-${Number(level)}`])
            .filter((predicate) => predicate !== undefined);
          item.data = register((element) => predicates.some((predicate) => predicate(element)));
        }
        return;
      }
      if (name === "dir") {
        const argumentsList = node.children?.toArray();
        const argument = argumentsList?.[0];
        if (argumentsList?.length !== 1 || argument?.type !== "Identifier")
          throw new Error("Invalid :dir() identifier");
        const direction = ident.decode(argument.name).toLowerCase();
        const predicate =
          direction === "ltr" || direction === "rtl"
            ? pseudos[`run-dom-direction-${direction}`]
            : undefined;
        item.data = register(predicate ?? (() => false));
        return;
      }
    }
    if (
      node.type === "PseudoClassSelector" &&
      typedSiblingPseudos.has(ident.decode(node.name).toLowerCase())
    ) {
      item.data = register(typedSiblingMatcher(generate(node)));
      return;
    }
    if (node.type === "PseudoClassSelector" && ident.decode(node.name).toLowerCase() === "lang") {
      const { compile }: typeof import("css-select") = require("./css-runtime.cjs").cssSelect;
      item.data = register(
        compile(generate(node), {
          adapter: {
            ...adapter,
            getAttributeValue(element, name) {
              if (name !== "xml:lang") return attribute(element, name);
              return isXML
                ? element.attrs.find(
                    (attr) =>
                      attr.namespace === "http://www.w3.org/XML/1998/namespace" &&
                      attr.name === "lang",
                  )?.value
                : undefined;
            },
          },
          xmlMode: isXML,
          cacheResults: false,
        }),
      );
      return;
    }
    if (node.type === "TypeSelector") {
      if (node.name.startsWith("*|")) {
        node.name = node.name.slice(2);
      } else if (node.name.startsWith("|")) {
        const name = localName(node.name.slice(1));
        item.data = register(
          (element) => !element.namespaceURI && (name === "*" || element.tagName === name),
        );
      } else if (namespaces) {
        const qualified = qualifiedSelectorName.exec(node.name);
        const prefix = qualified?.[1];
        const local = qualified?.[2] ?? node.name;
        const uri = prefix === undefined ? defaultNamespace : namespaces.get(ident.decode(prefix));
        if (uri !== undefined) {
          const name =
            uri === "http://www.w3.org/1999/xhtml" ? localName(local) : ident.decode(local);
          item.data = register(
            (element) =>
              element.namespaceURI === uri && (name === "*" || elementLocalName(element) === name),
          );
        }
      }
      if (item.data === node && !node.name.includes("|")) {
        const name = ident.decode(node.name);
        if (!isXML && /[A-Z\u0080-\uffff]/.test(name)) {
          const lower = name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
          item.data = register(
            (element) =>
              elementLocalName(element) ===
              (element.namespaceURI === "http://www.w3.org/1999/xhtml" ? lower : name),
          );
        }
      }
    } else if (node.type === "AttributeSelector") {
      if (node.name.name.startsWith("|")) {
        node.name.name = node.name.name.slice(1);
      } else if (node.name.name.startsWith("*|")) {
        node.name.name = node.name.name.slice(2);
        const name = localName(node.name.name);
        const matches =
          node.matcher === null
            ? (element: Raw.Element) => element.attrs.some((attribute) => attribute.name === name)
            : namespacedAttributeMatcher(name, generate(node), isXML);
        item.data = register(matches);
      } else if (namespaces) {
        const qualified = qualifiedSelectorName.exec(node.name.name);
        const prefix = qualified?.[1];
        const local = qualified?.[2];
        const uri = prefix === undefined ? undefined : namespaces.get(ident.decode(prefix));
        if (uri !== undefined && local !== undefined) {
          node.name.name = local;
          const name = ident.decode(local);
          const matches =
            node.matcher === null
              ? (element: Raw.Element) =>
                  element.attrs.some(
                    (attribute) => attribute.name === name && attribute.namespace === uri,
                  )
              : namespacedAttributeMatcher(name, generate(node), isXML, uri);
          item.data = register(matches);
        }
      }
      if (item.data === node && !node.name.name.includes("|")) {
        const name = ident.decode(node.name.name);
        const mixed = !isXML && /[A-Z\u0080-\uffff]/.test(name);
        if (
          mixed ||
          node.matcher === "~=" ||
          node.flags ||
          (!isXML && htmlInsensitiveValues.has(name))
        ) {
          const expected =
            node.value?.type === "Identifier"
              ? ident.decode(node.value.name)
              : (node.value?.value ?? "");
          const test = compileAttributeTest(name, node.matcher, expected, node.flags, isXML);
          if (test) item.data = register(test);
          else if (mixed) item.data = register(bareAttributeMatcher(name, generate(node), isXML));
        }
      }
    }
  });
  function serializeSelector(): string {
    walk(ast, {
      visit: "PseudoClassSelector",
      leave(node) {
        const nth = node.children?.first;
        if (nth?.type !== "Nth" || !nth.selector || !node.children) return;
        // css-select's nth-of boundary requires whitespace that css-tree may omit before a colon.
        const argument = `${generate(nth.nth)} of ${generate(nth.selector)}`;
        node.children.clear();
        node.children.appendData({ type: "Raw", value: argument });
      },
    });
    return generate(ast);
  }
  if (!hasNamespaceSyntax || strictSyntax) return serializeSelector();
  // Process nested forgiving lists first so invalidity reaches only the nearest valid boundary.
  walk(ast, {
    visit: "PseudoClassSelector",
    leave(node, item) {
      const name = ident.decode(node.name).toLowerCase();
      if (name !== "is" && name !== "where") return;
      const list = node.children?.first;
      if (list?.type !== "SelectorList") return;
      list.children.forEach((branch, branchItem) => {
        if (!hasUndeclaredNamespace(branch)) return;
        list.children.remove(branchItem);
      });
      if (list.children.isEmpty) {
        item.data = register(() => false);
      }
    },
  });
  return serializeSelector();
}

type SimpleBranch = { tag: string } | { role: string };
const simpleLists = new Map<string, readonly SimpleBranch[] | null>();

/** Recognizes selector lists of ASCII type selectors and case-sensitive attribute word tests. */
export function simpleSelectorList(selector: string): readonly SimpleBranch[] | undefined {
  if (selector.length > 4096 || !selector.includes(",")) return;
  const previous = simpleLists.get(selector);
  if (previous !== undefined) return previous ?? undefined;
  const branches: SimpleBranch[] = [];
  const sources = selector.split(",");
  for (const source of sources) {
    const text = source.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
    if (/^[a-zA-Z][\w-]*(?![\s\S])/.test(text)) branches.push({ tag: text });
    else {
      // role values are case-sensitive in both HTML and XML.
      const word = /^\*?\[role~=(?:"([\w-]+)"|'([\w-]+)')\]$/.exec(text);
      const value = word?.[1] ?? word?.[2];
      if (value === undefined || word?.[0] !== text) break;
      branches.push({ role: value });
    }
  }
  const parsed = branches.length === sources.length ? branches : null;
  if (simpleLists.size >= 128) simpleLists.clear();
  simpleLists.set(selector, parsed);
  return parsed ?? undefined;
}

function compileSimpleList(branches: readonly SimpleBranch[], isXML: boolean) {
  const matchers = branches.map((branch) => {
    if ("tag" in branch) return simpleTypeMatcher(branch.tag, isXML);
    return (element: Raw.Element) => hasClassToken(attribute(element, "role") ?? "", branch.role);
  });
  return (element: Raw.Element) => matchers.some((matches) => matches(element));
}

function simpleTypeMatcher(tag: string, isXML: boolean) {
  const lower = tag.toLowerCase();
  return (element: Raw.Element) =>
    elementLocalName(element) === (!isXML && element.namespaceURI === html.NS.HTML ? lower : tag);
}

// HTML's legacy attribute-value folding applies only to HTML elements in HTML documents.
const htmlInsensitiveValues = new Set(
  (
    "accept accept-charset align alink axis bgcolor charset checked clear codetype color compact declare defer dir " +
    "direction disabled enctype face frame hreflang http-equiv lang language link media method multiple nohref " +
    "noresize noshade nowrap readonly rel rev rules scope scrolling selected shape target text type valign valuetype vlink"
  ).split(" "),
);
function asciiFold(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}
function attributeValueTest(
  operator: string,
  expected: string,
): ((value: string) => boolean) | undefined {
  switch (operator) {
    case "=":
      return (value) => value === expected;
    case "~=":
      return expected && !/[\t\n\f\r ]/.test(expected)
        ? (value) => hasClassToken(value, expected)
        : () => false;
    case "|=":
      return (value) => value === expected || value.startsWith(expected + "-");
    case "^=":
      return expected ? (value) => value.startsWith(expected) : () => false;
    case "$=":
      return expected ? (value) => value.endsWith(expected) : () => false;
    case "*=":
      return expected ? (value) => value.includes(expected) : () => false;
    default:
      return;
  }
}
function compileAttributeTest(
  name: string,
  operator: string | null,
  expected: string,
  flag: string | null,
  isXML: boolean,
) {
  if (!/^[a-zA-Z_][\w-]*$/.test(name) || (flag !== null && !/^[is]$/i.test(flag))) return;
  const lower = asciiFold(name);
  const read =
    isXML || name === lower
      ? (node: Raw.Element) => attribute(node, name)
      : (node: Raw.Element) => attribute(node, node.namespaceURI === html.NS.HTML ? lower : name);
  if (!operator) return flag ? undefined : (node: Raw.Element) => read(node) !== undefined;
  const exact = attributeValueTest(operator, expected);
  if (!exact) return;
  const forced = flag?.toLowerCase() === "i";
  const folded =
    forced || (!flag && !isXML && htmlInsensitiveValues.has(lower))
      ? attributeValueTest(operator, asciiFold(expected))
      : undefined;
  if (!folded)
    return (node: Raw.Element) => {
      const value = read(node);
      return value !== undefined && exact(value);
    };
  return (node: Raw.Element) => {
    const value = read(node);
    return (
      value !== undefined &&
      (forced || node.namespaceURI === html.NS.HTML ? folded(asciiFold(value)) : exact(value))
    );
  };
}
const attributeLiteral =
  /^(?:([a-zA-Z][\w-]*|\*))?\[([a-z][\w-]*)(?:([~|^$*]?=)(?:"([^"\\\n\r\f]*)"|'([^'\\\n\r\f]*)'|([a-zA-Z_][\w-]*)))?\]$/;
function compileAttributeLiteral(selector: string, isXML: boolean) {
  if (selector.length > 4096 || !selector.endsWith("]")) return;
  const m = attributeLiteral.exec(selector);
  if (!m || !m[2]) return;
  const matches = compileAttributeTest(m[2], m[3] ?? null, m[4] ?? m[5] ?? m[6] ?? "", null, isXML);
  if (!matches || !m[1] || m[1] === "*") return matches;
  const tag = simpleTypeMatcher(m[1], isXML);
  return (node: Raw.Element) => tag(node) && matches(node);
}

const simpleAttribute = /^(?:[a-z][\w-]*)(?:=(?:"([a-zA-Z0-9_-]*)"|'([a-zA-Z0-9_-]*)'))?$/;
const simpleAttributePart = /\[([^\]]+)\]|:not\(\[([^\]]+)\]\)/gy;

function compileSimpleCompound(selector: string, isXML: boolean) {
  if (!selector.includes("[") || selector.length > 4096) return;
  const head = /^[a-zA-Z][\w-]*/.exec(selector)?.[0];
  if (!head) return;
  const tests: ((element: Raw.Element) => boolean)[] = [];
  for (let cursor = head.length; cursor < selector.length;) {
    simpleAttributePart.lastIndex = cursor;
    const part = simpleAttributePart.exec(selector);
    const source = part?.[1] ?? part?.[2];
    if (source === undefined) return;
    const syntax = simpleAttribute.exec(source);
    if (!syntax || syntax[0] !== source) return;
    const value = syntax[1] ?? syntax[2];
    const name = value === undefined ? source : source.slice(0, source.indexOf("="));
    const test = compileAttributeTest(
      name,
      value === undefined ? null : "=",
      value ?? "",
      null,
      isXML,
    );
    if (!test) return;
    tests.push(part?.[2] === undefined ? test : (node) => !test(node));
    cursor = simpleAttributePart.lastIndex;
  }
  const matchesType = simpleTypeMatcher(head, isXML);
  return (element: Raw.Element) => matchesType(element) && tests.every((test) => test(element));
}

/** Decodes an unescaped ASCII class or ID for raw and packed attribute matching. */
export function simpleSubjectAttribute(
  selector: string,
): { name: string; attribute: "id" | "class" } | undefined {
  const simple = /^([.#])([a-zA-Z_][\w-]*|--[\w-]*|-[a-zA-Z_][\w-]*)$/.exec(selector);
  const name = simple?.[2];
  if (name) return { name, attribute: simple?.[1] === "#" ? "id" : "class" };
}

/** Matches a simple subject selector when no default namespace is declared. */
export function compileSimpleSubject(
  selector: string,
): ((element: Raw.Element) => boolean) | undefined {
  const subject = simpleSubjectAttribute(selector);
  if (subject)
    return subject.attribute === "class"
      ? (element) => hasClass(element, subject.name)
      : (element) => attribute(element, "id") === subject.name;
}

/** Compiles supported selector compounds joined by child or descendant combinators. */
export function compileTreeSelector(
  parts: readonly CssNode[],
  isXML: boolean,
  pseudos?: Record<string, (element: Raw.Element) => boolean>,
) {
  if (!parts.length || parts.length > 32) return;
  type Predicate = (element: Raw.Element) => boolean;
  // A run of child relations fixes each parent's position. Between runs a
  // descendant relation can try ancestors until the entire next run matches.
  type Compound = Predicate[];
  type ChildChain = Compound[];
  const groups: ChildChain[] = [];
  let group: ChildChain = [];
  let compound: Compound = [];
  for (const part of parts) {
    if (part.type === "Combinator") {
      if (!compound.length || (part.name !== " " && part.name !== ">")) return;
      group.push(compound);
      if (part.name === " ") {
        groups.push(group);
        group = [];
      }
      compound = [];
      continue;
    }
    if (part.type === "PseudoClassSelector" && pseudos) {
      const name = part.name.toLowerCase();
      if (!part.children && Object.hasOwn(pseudos, name) && !name.startsWith("run-dom-")) {
        compound.push(pseudos[name]!);
        continue;
      }
      if (!part.children && (name === "hover" || name === "active")) {
        // css-select delegates both pointer states to its adapter.
        const handler = name === "hover" ? adapter.isHovered : adapter.isActive;
        compound.push(handler ?? (() => false));
        continue;
      }
      if ((name === "not" || name === "is" || name === "where") && part.children?.size === 1) {
        const list = part.children.first;
        if (list?.type !== "SelectorList" || list.children.size !== 1) return;
        const item = list.children.first;
        if (
          item?.type !== "Selector" ||
          item.children.size !== 1 ||
          item.children.first?.type === "PseudoClassSelector"
        )
          return;
        const inner = compileTreeSelector(item.children.toArray(), isXML);
        if (!inner) return;
        compound.push(name === "not" ? (node) => !inner(node) : inner);
        continue;
      }
      return;
    }
    if (part.type === "AttributeSelector") {
      const expected =
        part.value?.type === "Identifier" ? part.value.name : (part.value?.value ?? "");
      if (part.value?.type === "Identifier" && expected.includes("\\")) return;
      const test = compileAttributeTest(part.name.name, part.matcher, expected, part.flags, isXML);
      if (!test) return;
      compound.push(test);
      continue;
    }
    if (part.type !== "ClassSelector" && part.type !== "IdSelector" && part.type !== "TypeSelector")
      return;
    if (part.type === "TypeSelector" && part.name === "*") {
      compound.push(() => true);
      continue;
    }
    const name = part.name;
    if (!/^[a-zA-Z_][\w-]*$/.test(name)) return;
    if (part.type === "TypeSelector") compound.push(simpleTypeMatcher(name, isXML));
    else if (part.type === "ClassSelector") compound.push((node) => hasClass(node, name));
    else compound.push((node) => attribute(node, "id") === name);
  }
  if (!compound.length) return;
  group.push(compound);
  groups.push(group);
  const runs = groups.reverse().map((parts) => parts.reverse());
  function matchRun(node: Raw.Element, run: ChildChain): Raw.Element | undefined {
    let current = node;
    let first = true;
    for (const tests of run) {
      if (!first) {
        const parent = current.parentNode;
        if (!parent || !tree.isElementNode(parent)) return;
        current = parent;
      }
      first = false;
      for (const matches of tests) if (!matches(current)) return;
    }
    return current;
  }
  const [subject, ...ancestors] = runs;
  if (!subject) return;
  if (!ancestors.length) return (node: Raw.Element) => matchRun(node, subject) !== undefined;
  return (node: Raw.Element): boolean => {
    let top = matchRun(node, subject);
    if (!top) return false;
    for (const run of ancestors) {
      let parent = top.parentNode;
      top = undefined;
      // The nearest complete child chain leaves the most ancestors available for previous runs.
      while (parent && tree.isElementNode(parent)) {
        top = matchRun(parent, run);
        if (top) break;
        parent = parent.parentNode;
      }
      if (!top) return false;
    }
    return true;
  };
}

/** Compiles a DOM selector with an optional :scope node. */
export function compileSelector(input: {
  selector: string;
  isXML: boolean;
  scope?: Raw.Node;
  strictSyntax?: boolean;
  namespaces?: ReadonlyMap<string, string> | undefined;
  DOMException?: typeof globalThis.DOMException;
  statePseudos: Record<string, (element: Raw.Element, level?: number) => boolean>;
}): (element: Raw.Element) => boolean {
  // ASCII compound-free class and ID selectors need no grammar or state adapter.
  // A default namespace still constrains these selectors in author stylesheets.
  if (!input.namespaces?.size) {
    const list = simpleSelectorList(input.selector);
    if (list) return compileSimpleList(list, input.isXML);
    const literal = compileAttributeLiteral(input.selector, input.isXML);
    if (literal) return literal;
    const compound = compileSimpleCompound(input.selector, input.isXML);
    if (compound) return compound;
    const simple = compileSimpleSubject(input.selector);
    if (simple) return simple;
  }
  const { _compileUnsafe: compile }: typeof import("css-select") =
    require("./css-runtime.cjs").cssSelect;
  const { selector, isXML, scope } = input;
  try {
    const pseudoOnly = purePseudoSelector(input.selector);
    if (pseudoOnly === null) throw new Error("Invalid pseudo-element selector");
    if (pseudoOnly) return () => false;
    const { source, names } = liveStateSelector(normalizeSelector(selector));
    const pseudo = names?.get("checked");
    const statePseudos = { ...input.statePseudos };
    for (const name of [
      "enabled",
      "disabled",
      "link",
      "any-link",
      "visited",
      "required",
      "optional",
      "read-write",
      "read-only",
    ]) {
      const alias = names?.get(name);
      const predicate = statePseudos[name];
      if (alias && predicate) statePseudos[alias] = predicate;
    }
    if (pseudo)
      statePseudos[pseudo] =
        input.statePseudos.checked ??
        ((node) => {
          if (isInput(node)) {
            const type = inputType(node);
            return (type === "checkbox" || type === "radio") && checkedness(node);
          }
          return (
            node.namespaceURI === "http://www.w3.org/1999/xhtml" &&
            node.tagName === "option" &&
            attribute(node, "selected") !== undefined
          );
        });
    // The public adapter contract accepts Raw.Element only. css-select documents
    // this entrypoint for skipping its duplicate root tag check; traversal remains checked.
    return compile(adaptSelector(source, input, statePseudos), {
      adapter,
      xmlMode: isXML,
      cacheResults: false,
      relativeSelector: false,
      pseudos: {
        // jsdom and deployed browsers count nonempty Text/CDATA, including whitespace.
        empty: (node: Raw.Element) =>
          node.childNodes.every(
            (child) =>
              !tree.isElementNode(child) &&
              (!tree.isTextNode(child) || child.value.length === 0) &&
              (!tree.isCommentNode(child) ||
                xmlSpecial(child)?.kind !== "cdata" ||
                child.data.length === 0),
          ),
        ...statePseudos,
      },
      ...(scope ? { context: scope } : {}),
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new (input.DOMException ?? DOMException)(cause.message, "SyntaxError");
  }
}
