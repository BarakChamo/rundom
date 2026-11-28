// Adapts RunDOM's cascade winners to the pinned CSS Values evaluator. Each evaluation
// frame owns its declarations and attribute identities, including inherited tainted tokens.
import { createRequire } from "node:module";
import type { DefaultTreeAdapterTypes as Raw } from "parse5";

import { directEasingList } from "./css-direct-values.js";
import type { RegisteredProperty } from "./css-reference.js";

const require = createRequire(import.meta.url);
export const substitutionFunction = /(?:^|[^\w-])(?:attr|ident|if|random(?:-item)?)\(/i;

const winnerFunctions =
  /^(?:calc|cubic-bezier|steps|rgba?|hsla?|hwb|(?:ok)?la[bc]|(?:ok)?lch|color)$/i;
const systemColor =
  /(?:^|[^\w-])(?:accentcolor(?:text)?|activetext|buttonborder|buttonface|buttontext|canvas(?:text)?|field(?:text)?|graytext|highlight(?:text)?|linktext|mark(?:text)?|selecteditem(?:text)?|visitedtext|activeborder|activecaption|appworkspace|background|buttonhighlight|buttonshadow|captiontext|inactiveborder|inactivecaption(?:text)?|infobackground|infotext|menu(?:text)?|scrollbar|threed(?:darkshadow|face|highlight|lightshadow|shadow)|window(?:frame|text)?)(?![\w-])/i;

/**
 * Whether the evaluator's result for a declaration depends only on cascade winners and the
 * ancestor chain, never on attributes, siblings, URLs, containers or the page color scheme.
 * Frames holding only such values are reusable and do not extend to descendants.
 * Without `lookup`, var() is unknown and fails; with it, var() passes when every custom
 * property it reads (own or inherited, as `lookup` returns it) is winner-only text.
 */
export function dependsOnWinnersOnly(
  value: string,
  lookup?: (name: string) => string | undefined,
): boolean {
  if (lookup && /var\(/i.test(value)) return referencesWinnersOnly(value, lookup);
  let known = winnerOnlyValues.get(value);
  if (known === undefined) {
    known = scanWinnersOnly(value);
    if (winnerOnlyValues.size >= 4096) winnerOnlyValues.clear();
    winnerOnlyValues.set(value, known);
  }
  return known;
}
const winnerOnlyValues = new Map<string, boolean>();

// var() reads a custom property of the element or its ancestors. It keeps a value winner-only
// when every referenced token, followed transitively, is winner-only text itself.
function referencesWinnersOnly(
  value: string,
  lookup: (name: string) => string | undefined,
): boolean {
  const seen = new Set<string>();
  const pending = [value];
  // At most 16 distinct references are followed; longer chains stay on the conservative path.
  for (let text = pending.pop(); text !== undefined; text = pending.pop()) {
    if (!dependsOnWinnersOnly(text.replace(/var\(/gi, "calc("))) return false;
    for (const [, reference = ""] of text.matchAll(/var\(\s*(--[\w-]+)/gi)) {
      if (seen.has(reference)) continue;
      if (seen.add(reference).size > 16) return false;
      const referenced = lookup(reference);
      if (referenced !== undefined) pending.push(referenced);
    }
  }
  return true;
}

function scanWinnersOnly(value: string): boolean {
  if (value.includes("\\") || systemColor.test(value)) return false;
  for (const [, unit] of value.replace(/#[\da-f]+/gi, "").matchAll(/\d([a-z]+)/gi))
    if (!/^(?:px|em|deg|ms|s)$/i.test(unit!)) return false;
  for (const [, name] of value.matchAll(/([\w-]*)\(/g))
    if (!winnerFunctions.test(name!)) return false;
  return true;
}

type EvaluationDocument = {
  _parentDocument: null;
  _styleCache: null | object;
  _styleSheetCache: null | object;
  _styleSheetScopes: readonly object[];
  _globalObject: object;
  defaultView: object;
  _parsingMode: string;
  baseURLSerialized(): string;
  _clearStyleSheetCache(): void;
  _descendants(): Iterable<object>;
  documentElement?: object;
};

type TypeSelector = {
  units: {
    combinator: unknown;
    type: { value: string; prefix?: string; universal: boolean } | null;
    subclasses: unknown[];
    pseudos: unknown;
  }[];
};
const otherElementSibling = { nodeType: 1 };
let defaultRules: Map<string, Map<string, unknown>> | undefined;

// Unconditional type selectors provide the browser origin below the author winners.
function defaultsFor(element: Raw.Element) {
  if (!defaultRules) {
    defaultRules = new Map();
    const {
      rules,
      namespaces,
    }: {
      rules: {
        conditions: unknown[];
        selectors: TypeSelector[];
        declarations: Map<string, unknown>;
      }[];
      namespaces: Map<string, string>;
    } = require("rundom-css-reference/lib/generated/default-stylesheet.js");
    for (const rule of rules) {
      if (rule.conditions.length) continue;
      for (const { units } of rule.selectors) {
        const unit = units[0];
        if (
          units.length !== 1 ||
          !unit?.type ||
          unit.combinator ||
          unit.type.universal ||
          unit.subclasses.length ||
          unit.pseudos
        )
          continue;
        const key = namespaces.get(unit.type.prefix ?? "") + "/" + unit.type.value;
        let block = defaultRules.get(key);
        if (!block) defaultRules.set(key, (block = new Map()));
        for (const [name, declaration] of rule.declarations) block.set(name, declaration);
      }
    }
  }
  return defaultRules.get(element.namespaceURI + "/" + element.tagName);
}

/** A property read resolves the complete dependency graph before serializing tainted tokens. */
export type SubstitutionFrame = {
  document: EvaluationDocument;
  element: object;
  read(name: string): string;
};
type BuiltFrame = SubstitutionFrame & { declares(name: string): boolean };

// Properties whose computed value, for a valid declared winner, is a function of its text and
// the custom properties it references once relative units, colors and keywords that read
// context are excluded.
const contextFreeProperty =
  /^(?:transition-timing-function|box-shadow(?:-(?:blur|color|spread|position|offset))?|(?:transform|perspective)-origin|object-position|font-style|background-(?:size|image|position-[xy])|list-style-image|(?:min-|max-)?(?:width|height)|(?:padding|margin)-(?:top|right|bottom|left)|top|right|bottom|left)$/;
const contextKeyword = /\d(?:\.\d+)?em\b|currentcolor|inherit|initial|unset|revert/i;
// Flow-relative position keywords map to physical edges through the element's writing mode and
// direction, which the key does not carry.
const flowRelativeEdge = /(?:^|[\s,(=\0])(?:(?:block|inline|x|y)-)?(?:start|end)(?=$|[\s,)\0])/i;
const resolvedText = new Map<string, string>();

function contextFreeKey(
  name: string,
  text: string,
  frame: {
    values: ReadonlyMap<string, string>;
    shorthands: ReadonlyMap<string, string> | undefined;
    registrations: ReadonlyMap<string, RegisteredProperty> | undefined;
    xml: boolean;
  },
): string | undefined {
  if (text.length > 512 || !contextFreeProperty.test(name)) return;
  let key = `${frame.xml ? "x" : "h"}${name}\0${frame.shorthands?.get(name) ?? ""}\0${text}`;
  if (text.includes("var(")) {
    // Every referenced custom property must be declared on this frame: inherited ones would
    // come from the ancestor chain, which the key cannot name.
    if (frame.registrations?.size) return;
    const seen = new Set<string>();
    const pending = [text];
    while (pending.length) {
      for (const [, reference] of pending.pop()!.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (seen.has(reference!)) continue;
        const value = frame.values.get(reference!);
        if (value === undefined || seen.add(reference!).size > 16) return;
        key += `\0${reference}=${value}`;
        pending.push(value);
      }
    }
  }
  if (/origin|position/.test(name) && flowRelativeEdge.test(key)) return;
  return key.length <= 2048 ? key : undefined;
}

function contextFree(key: string): boolean {
  // var() is the one substitution whose inputs the key carries.
  return !contextKeyword.test(key) && dependsOnWinnersOnly(key.replace(/var\(/gi, "calc("));
}

type CascadeBlock = {
  entries: readonly { name: string; value: string; important: boolean }[];
  base?: string | undefined;
  weight: number;
  hostContext: boolean;
  layerIndex: number | undefined;
};

export function substitutionFrame(
  raw: Raw.Element,
  parent: SubstitutionFrame | undefined,
  values: ReadonlyMap<string, string>,
  xml: boolean,
  baseURL: () => string,
  registrations: ReadonlyMap<string, RegisteredProperty> | undefined,
  sources?: readonly CascadeBlock[],
  shorthands?: ReadonlyMap<string, string>,
  sheetBases?: ReadonlyMap<string, string>,
): SubstitutionFrame {
  let frame: BuiltFrame | undefined;
  function materialize(): BuiltFrame {
    return (frame ??= buildSubstitutionFrame(
      raw,
      parent,
      values,
      xml,
      baseURL,
      registrations,
      sources,
      shorthands,
      sheetBases,
    ));
  }
  return {
    get document() {
      return materialize().document;
    },
    get element() {
      return materialize().element;
    },
    read(name) {
      // Context-free winners resolve once per process; a frame is built only on a miss.
      const text = values.get(name);
      // A declared easing list computes to its own serialization; no frame is needed.
      if (name === "transition-timing-function" && text !== undefined && !shorthands?.has(name)) {
        const easing = directEasingList(text);
        if (easing !== undefined) return easing;
      }
      const key =
        text === undefined
          ? undefined
          : contextFreeKey(name, text, { values, shorthands, registrations, xml });
      const known = key && resolvedText.get(key);
      if (known) return known;
      const built = materialize();
      const value = built.read(name);
      if (key && value && built.declares(name) && contextFree(key)) {
        // ponytail: whole-map reset at 4096 keys; an LRU if MUI-scale suites thrash it.
        if (resolvedText.size >= 4096) resolvedText.clear();
        resolvedText.set(key, value);
      }
      return value;
    },
  };
}

type RandomState = {
  randomValues: Map<string, number>;
  elementRandomValues: WeakMap<object, Map<string, number>>;
};
const randomBases = new WeakMap<Raw.Node, Map<string, number>>();

function basesFor(node: Raw.Node): Map<string, number> {
  let values = randomBases.get(node);
  if (!values) randomBases.set(node, (values = new Map()));
  return values;
}

type Component = { name?: string; start: number; end: number; value?: unknown };

function buildSubstitutionFrame(
  raw: Raw.Element,
  parent: SubstitutionFrame | undefined,
  values: ReadonlyMap<string, string>,
  xml: boolean,
  baseURL: () => string,
  registrations: ReadonlyMap<string, RegisteredProperty> | undefined,
  sources?: readonly CascadeBlock[],
  shorthands?: ReadonlyMap<string, string>,
  sheetBases?: ReadonlyMap<string, string>,
): BuiltFrame {
  const resolver: {
    hasResolvedStyle(element: object): boolean;
    getResolvedPropertyValue(name: string, element: object): string;
  } = require("rundom-css-reference/lib/jsdom/living/css/resolve.js");
  const parser: {
    parseGrammar(input: string, type: string, context: object): unknown;
    parseDestructuredDeclaration(
      name: string,
      value: string,
      important: boolean,
      context: object,
    ): unknown;
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js");
  const {
    isFailure,
  }: {
    isFailure(value: unknown): boolean;
  } = require("rundom-css-reference/lib/jsdom/living/css/values/value.js");
  const {
    getDocumentStyleState,
  }: {
    getDocumentStyleState(document: object): {
      elements: WeakMap<object, { candidates: object[] }>;
    };
  } = require("rundom-css-reference/lib/jsdom/living/css/utils/style.js");
  const globals = parent?.document.defaultView ?? {};
  const document: EvaluationDocument = parent?.document ?? {
    _parentDocument: null,
    _styleCache: null,
    _styleSheetCache: null,
    _styleSheetScopes: [],
    _globalObject: globals,
    defaultView: globals,
    _parsingMode: xml ? "xml" : "html",
    baseURLSerialized: baseURL,
    _clearStyleSheetCache() {
      this._styleCache = null;
      this._styleSheetCache = null;
    },
    *_descendants() {
      let top: Raw.Node = raw;
      while ("parentNode" in top && top.parentNode) top = top.parentNode;
      const pending: Raw.Node[] = [top];
      while (pending.length) {
        const node = pending.pop()!;
        if ("tagName" in node && node.tagName === "meta")
          yield {
            _namespaceURI: node.namespaceURI,
            _localName: node.tagName,
            getAttributeNS: (namespace: string | null, name: string) =>
              node.attrs.find(
                (attr) => (attr.namespace ?? null) === namespace && attr.name === name,
              )?.value ?? null,
          };
        if ("childNodes" in node)
          for (let i = node.childNodes.length - 1; i >= 0; --i) pending.push(node.childNodes[i]!);
      }
    },
  };
  if (!parent) {
    Object.assign(globals, { _document: document });
    if (registrations) {
      const {
        implementation,
      }: {
        implementation: { registerProperty(global: object, property: RegisteredProperty): void };
      } = require("rundom-css-reference/lib/jsdom/living/css/CSS-impl.js");
      for (const registration of registrations.values())
        implementation.registerProperty(globals, registration);
    }
  }
  const element = {
    nodeType: 1,
    _globalObject: globals,
    ownerDocument: document,
    _ownerDocument: document,
    _namespaceURI: raw.namespaceURI,
    _localName: raw.tagName,
    parentElement: parent?.element ?? null,
    get parentNode() {
      const parentNode = raw.parentNode;
      if (!parentNode) return null;
      return {
        *_children(): Iterable<{ nodeType: number }> {
          for (const child of parentNode.childNodes) {
            if (child === raw) yield element;
            else if ("tagName" in child) yield otherElementSibling;
          }
        },
      };
    },
    getAttributeNodeNS(namespace: string | null, name: string) {
      return (
        raw.attrs.find((attr) => (attr.namespace ?? null) === namespace && attr.name === name) ??
        null
      );
    },
  };
  document.documentElement ??= element;
  let boundRandom = false;
  function bindRandom() {
    const state: {
      getCSSState(global: object): RandomState;
      getRandomBaseValue(global: object, key: object): number;
    } = require("rundom-css-reference/lib/jsdom/living/css/state.js");
    if (!boundRandom) {
      let root: Raw.Node = raw;
      while ("parentNode" in root && root.parentNode) root = root.parentNode;
      const cache = state.getCSSState(globals);
      cache.randomValues = basesFor(root);
      cache.elementRandomValues.set(element, basesFor(raw));
      boundRandom = true;
    }
    return state;
  }

  function parseWinner(name: string, text: string, important: boolean): unknown {
    if (!/\brandom(?:-item)?\(/i.test(text))
      return parser.parseDestructuredDeclaration(name, text, important, element);
    const random = bindRandom();
    if (text.includes("random-item(")) {
      const parsed = parser.parseDestructuredDeclaration(name, text, important, element) as {
        value?: unknown;
      };
      const replacements: { start: number; end: number; text: string }[] = [];
      let index = 0;
      function visit(node: unknown): void {
        if (Array.isArray(node)) {
          for (const child of node) visit(child);
          return;
        }
        if (!node || typeof node !== "object") return;
        const part = node as Component;
        if (part.name !== "random-item" || !Array.isArray(part.value)) {
          visit(part.value);
          return;
        }
        const [keyTokens, , items] = part.value as [Component[], unknown, Component[][]];
        if (!keyTokens?.length || !items?.length) return;
        let key = text.slice(keyTokens[0]!.start, keyTokens.at(-1)!.end);
        key = key.replace(
          /^var\(\s*(--[\w-]+)\s*\)$/,
          (original, variable: string) => values.get(variable) ?? original,
        );
        const tokens = parser.parseGrammar(key, "<random-key>", element);
        if (!Array.isArray(tokens)) return;
        const [identifier, local, scope] = tokens;
        const draw =
          identifier?.value === "fixed"
            ? Number(local?.value?.value ?? local?.value)
            : random.getRandomBaseValue(globals, {
                element: local?.value === "element-scoped" ? element : undefined,
                identifier: identifier?.value ?? null,
                scope: scope?.value
                  ? JSON.stringify([
                      name,
                      "random-item",
                      scope.value === "property-index-scoped" ? index : null,
                    ])
                  : null,
              });
        ++index;
        if (!Number.isFinite(draw)) return;
        const item =
          items[Math.min(items.length - 1, Math.max(0, Math.floor(draw * items.length)))]!;
        replacements.push({
          start: part.start,
          end: part.end,
          text: item.length ? text.slice(item[0]!.start, item.at(-1)!.end) : "",
        });
      }
      visit(parsed?.value);
      for (const part of replacements.reverse())
        text = text.slice(0, part.start) + part.text + text.slice(part.end);
    }
    return parser.parseDestructuredDeclaration(name, text, important, element);
  }
  const expanded = new Map<string, ReadonlyMap<string, unknown>>();
  function expandShorthand(name: string, text: string, important: boolean) {
    const key = name + (important ? "!" : "\0") + text;
    let components = expanded.get(key);
    if (!components) {
      const parsed = parseWinner(name, text, important);
      if (isFailure(parsed)) return;
      const expand: (declaration: unknown) => {
        name: string;
      }[] = require("rundom-css-reference/lib/jsdom/living/css/parse/shorthand.js");
      components = new Map(expand(parsed).map((component) => [component.name, component]));
      expanded.set(key, components);
    }
    return components;
  }
  // A read touches few winners (inherited frames carry every computed value), so each winner
  // is parsed on first lookup. Parsing is pure except for random-item draws, which stay eager
  // and in declaration order.
  const parsedWinners = new Map<string, unknown>();
  const removed = new Set<string>();
  function declaredWinner(name: string): unknown {
    if (removed.has(name)) return;
    if (parsedWinners.has(name)) return parsedWinners.get(name);
    const text = values.get(name);
    if (text === undefined) return;
    const shorthand = shorthands?.get(name);
    let parsed: unknown;
    if (shorthand) parsed = expandShorthand(shorthand, text, false)?.get(name);
    else {
      parsed = parseWinner(name, text, false);
      if (isFailure(parsed)) parsed = undefined;
    }
    parsedWinners.set(name, parsed);
    return parsed;
  }
  const declarations = {
    get: declaredWinner,
    has: (name: string) => declaredWinner(name) !== undefined,
    *values() {
      for (const name of values.keys()) {
        const declaration = declaredWinner(name);
        if (declaration !== undefined) yield declaration;
      }
    },
    delete: (name: string) => removed.add(name),
  };
  for (const [name, text] of values) if (/\brandom(?:-item)?\(/i.test(text)) declaredWinner(name);
  // Initialize upstream's cycle guard and caches, then supply the already-matched cascade.
  resolver.hasResolvedStyle(element);
  const state = getDocumentStyleState(document).elements.get(element)!;
  function styleSource(
    block: {
      get(name: string): unknown;
      has(name: string): boolean;
      values(): Iterable<unknown>;
    },
    base: (name: string) => string | undefined,
  ) {
    return {
      _getBaseURL: base,
      _getParsedDeclaration: (name: string) => block.get(name),
      _mayDeclare: (name: string) => block.has(name),
      get _declarations() {
        return block.values();
      },
    };
  }
  state.candidates = [
    {
      declarations,
      ...(sheetBases && { style: styleSource(declarations, (name) => sheetBases.get(name)) }),
      context: {
        origin: 3,
        attached: true,
        encapsulation: 0,
        layer: null,
        namespaces: new Map(),
        root: document,
      },
      matched: true,
      specificity: [0, 0, 0],
    },
  ];
  // Deferred rollback needs the identity of each matching rule, including losing declarations.
  if (sources && sources.length > 1) {
    const shorthandNames = shorthands && new Set(shorthands.values());
    const deferred = new Set<string>();
    for (const [name, text] of values)
      if (substitutionFunction.test(text) || /var\(/i.test(text)) deferred.add(name);
    for (const source of sources) {
      const block = new Map<string, unknown>();
      for (const { name, value, important } of source.entries) {
        if (shorthandNames?.has(name)) {
          for (const [child, component] of expandShorthand(name, value, important) ?? []) {
            if (!deferred.has(child)) continue;
            block.set(child, component);
            declarations.delete(child);
          }
          continue;
        }
        if (!deferred.has(name)) continue;
        const declaration = parseWinner(name, value, important);
        if (!isFailure(declaration)) {
          block.set(name, declaration);
          declarations.delete(name);
        }
      }
      if (block.size)
        state.candidates.push({
          declarations: block,
          ...(source.base && { style: styleSource(block, () => source.base) }),
          matched: true,
          specificity: [source.weight, 0, 0],
          context: {
            root: document,
            origin: 3,
            attached: source.weight === 2 ** 52,
            encapsulation: source.hostContext ? 1 : 0,
            layer: source.layerIndex === undefined ? null : { order: source.layerIndex },
            namespaces: new Map(),
          },
        });
    }
  }
  const defaults = defaultsFor(raw);
  if (defaults)
    state.candidates.unshift({
      declarations: defaults,
      context: {
        origin: 1,
        attached: false,
        encapsulation: 0,
        layer: null,
        namespaces: new Map(),
        root: document,
      },
      matched: true,
      specificity: [0, 0, 1],
    });
  return {
    element,
    document,
    read: (name) => resolver.getResolvedPropertyValue(name, element),
    declares: (name) => declaredWinner(name) !== undefined,
  };
}
