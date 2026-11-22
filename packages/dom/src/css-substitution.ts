// Adapts RunDOM's cascade winners to the pinned CSS Values evaluator. Each evaluation
// frame owns its declarations and attribute identities, including inherited tainted tokens.
import { createRequire } from "node:module";
import type { DefaultTreeAdapterTypes as Raw } from "parse5";

import type { RegisteredProperty } from "./css-reference.js";

const require = createRequire(import.meta.url);
export const substitutionFunction = /(?:^|[^\w-])(?:attr|if)\(/i;

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

export function substitutionFrame(
  raw: Raw.Element,
  parent: SubstitutionFrame | undefined,
  values: ReadonlyMap<string, string>,
  xml: boolean,
  baseURL: () => string,
  registrations: ReadonlyMap<string, RegisteredProperty> | undefined,
): SubstitutionFrame {
  let frame: SubstitutionFrame | undefined;
  function materialize(): SubstitutionFrame {
    return (frame ??= buildSubstitutionFrame(raw, parent, values, xml, baseURL, registrations));
  }
  return {
    get document() {
      return materialize().document;
    },
    get element() {
      return materialize().element;
    },
    read: (name) => materialize().read(name),
  };
}

function buildSubstitutionFrame(
  raw: Raw.Element,
  parent: SubstitutionFrame | undefined,
  values: ReadonlyMap<string, string>,
  xml: boolean,
  baseURL: () => string,
  registrations: ReadonlyMap<string, RegisteredProperty> | undefined,
): SubstitutionFrame {
  const resolver: {
    hasResolvedStyle(element: object): boolean;
    getResolvedPropertyValue(name: string, element: object): string;
  } = require("rundom-css-reference/lib/jsdom/living/css/resolve.js");
  const parser: {
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
    getAttributeNodeNS(namespace: string | null, name: string) {
      return (
        raw.attrs.find((attr) => (attr.namespace ?? null) === namespace && attr.name === name) ??
        null
      );
    },
  };
  document.documentElement ??= element;
  const declarations = new Map<string, unknown>();
  for (const [name, text] of values) {
    const parsed = parser.parseDestructuredDeclaration(name, text, false, element);
    if (!isFailure(parsed)) declarations.set(name, parsed);
  }
  // Initialize upstream's cycle guard and caches, then supply the already-matched cascade.
  resolver.hasResolvedStyle(element);
  const state = getDocumentStyleState(document).elements.get(element)!;
  state.candidates = [
    {
      declarations,
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
  return { element, document, read: (name) => resolver.getResolvedPropertyValue(name, element) };
}
