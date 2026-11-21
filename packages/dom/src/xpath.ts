// Adapts XPath evaluation to Window-local DOM interfaces and mutation-aware results.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
type NamespaceResolver =
  | ((prefix: string) => string | null)
  | { lookupNamespaceURI: (prefix: string) => string | null };
type EngineResult<Node> = {
  resultType: number;
  numberValue?: number;
  stringValue?: string;
  booleanValue?: boolean;
  singleNodeValue?: Node;
  nodes?: Node[];
};
type EngineArgument<Node> = {
  evaluate: (context: EngineContext<Node>) => { stringValue: () => string };
};
type NodeName = {
  namespace: string | null;
  localName: string;
  attribute: boolean;
  htmlOwner: boolean;
};
type NameTest<Node> = {
  matches: (node: Node, context: EngineContext<Node>) => boolean;
  toString: () => string;
};
type EngineContext<Node> = {
  virtualRoot?: Node;
  contextNode: Node;
  functionResolver: {
    addFunction: (
      namespace: string,
      name: string,
      callback: (context: EngineContext<Node>, ...args: EngineArgument<Node>[]) => object,
    ) => void;
  };
  expressionContextNode: Node;
  isHtml: boolean;
  namespaceResolver: { getNamespace: (prefix: string, node: Node) => string | null };
};
type EngineExpression<Node> = { evaluate: (context: EngineContext<Node>) => object };
type Engine<Node> = {
  XPathParser: new () => { parse: (expression: string) => EngineExpression<Node> | undefined };
  XPathContext: new () => EngineContext<Node>;
  Step: {
    new (): { axis: number; nodeTest: NameTest<Node> };
    ATTRIBUTE: number;
    DESCENDANTORSELF: number;
  };
  NodeTest: {
    nodeTest: NameTest<Node>;
    NameTestQName: new () => NameTest<Node> & { prefix: string | null; localName: string };
    NameTestPrefixAny: new () => NameTest<Node> & { prefix: string };
  };
  XBoolean: new (value: boolean) => object;
  XPathResult: new (value: object, type: number) => EngineResult<Node>;
};

const resultTypes = {
  ANY_TYPE: 0,
  NUMBER_TYPE: 1,
  STRING_TYPE: 2,
  BOOLEAN_TYPE: 3,
  UNORDERED_NODE_ITERATOR_TYPE: 4,
  ORDERED_NODE_ITERATOR_TYPE: 5,
  UNORDERED_NODE_SNAPSHOT_TYPE: 6,
  ORDERED_NODE_SNAPSHOT_TYPE: 7,
  ANY_UNORDERED_NODE_TYPE: 8,
  FIRST_ORDERED_NODE_TYPE: 9,
} as const;

/** Creates the DOM XPath interfaces with the Window's node validation and mutation tracking. */
export function createXPath<Node extends object>(input: {
  Exception: typeof DOMException;
  isNode: (value: unknown) => value is Node;
  isHTML: (node: Node) => boolean;
  xmlLanguage: (node: Node) => string | null;
  nodeName: (node: Node) => NodeName | undefined;
  shadowRoot: (node: Node) => Node | undefined;
  observeVersion: (node: Node) => () => number;
  reportResolverError: (resolver: object, error: unknown) => void;
  makeTypeError: (message: string) => TypeError;
}) {
  const key = Symbol();
  const isIterator = (type: number) => type === 4 || type === 5;
  const isSnapshot = (type: number) => type === 6 || type === 7;

  class XPathResult {
    declare static readonly ANY_TYPE: 0;
    declare static readonly NUMBER_TYPE: 1;
    declare static readonly STRING_TYPE: 2;
    declare static readonly BOOLEAN_TYPE: 3;
    declare static readonly UNORDERED_NODE_ITERATOR_TYPE: 4;
    declare static readonly ORDERED_NODE_ITERATOR_TYPE: 5;
    declare static readonly UNORDERED_NODE_SNAPSHOT_TYPE: 6;
    declare static readonly ORDERED_NODE_SNAPSHOT_TYPE: 7;
    declare static readonly ANY_UNORDERED_NODE_TYPE: 8;
    declare static readonly FIRST_ORDERED_NODE_TYPE: 9;
    declare readonly ANY_TYPE: 0;
    declare readonly NUMBER_TYPE: 1;
    declare readonly STRING_TYPE: 2;
    declare readonly BOOLEAN_TYPE: 3;
    declare readonly UNORDERED_NODE_ITERATOR_TYPE: 4;
    declare readonly ORDERED_NODE_ITERATOR_TYPE: 5;
    declare readonly UNORDERED_NODE_SNAPSHOT_TYPE: 6;
    declare readonly ORDERED_NODE_SNAPSHOT_TYPE: 7;
    declare readonly ANY_UNORDERED_NODE_TYPE: 8;
    declare readonly FIRST_ORDERED_NODE_TYPE: 9;

    #value: EngineResult<Node>;
    #version: (() => number) | undefined;
    #initialVersion: number | undefined;
    #index = 0;
    constructor(token: symbol, value: EngineResult<Node>, version?: () => number) {
      if (token !== key) throw new TypeError("Illegal constructor");
      this.#value = value;
      this.#version = version;
      this.#initialVersion = version?.();
    }
    get resultType(): number {
      return this.#value.resultType;
    }
    get numberValue(): number {
      const value = this.#value.numberValue;
      if (value === undefined) throw new TypeError("Expected an XPath number result");
      return value;
    }
    get stringValue(): string {
      const value = this.#value.stringValue;
      if (value === undefined) throw new TypeError("Expected an XPath string result");
      return value;
    }
    get booleanValue(): boolean {
      const value = this.#value.booleanValue;
      if (value === undefined) throw new TypeError("Expected an XPath boolean result");
      return value;
    }
    get singleNodeValue(): Node | null {
      if (this.resultType !== 8 && this.resultType !== 9)
        throw new TypeError("Expected a single XPath node result");
      return this.#value.singleNodeValue ?? null;
    }
    get invalidIteratorState(): boolean {
      return this.#version?.() !== this.#initialVersion;
    }
    get snapshotLength(): number {
      if (!isSnapshot(this.resultType)) throw new TypeError("Expected an XPath snapshot");
      return this.#value.nodes?.length ?? 0;
    }
    snapshotItem(index: number): Node | null {
      if (!isSnapshot(this.resultType)) throw new TypeError("Expected an XPath snapshot");
      return this.#value.nodes?.[+index >>> 0] ?? null;
    }
    iterateNext(): Node | null {
      if (!isIterator(this.resultType)) throw new TypeError("Expected an XPath iterator");
      if (this.invalidIteratorState)
        throw new input.Exception(
          "The document has been mutated since evaluation",
          "InvalidStateError",
        );
      return this.#value.nodes?.[this.#index++] ?? null;
    }
    get [Symbol.toStringTag](): string {
      return "XPathResult";
    }
  }
  for (const [name, value] of Object.entries(resultTypes)) {
    const descriptor = { value, enumerable: true };
    Object.defineProperty(XPathResult, name, descriptor);
    Object.defineProperty(XPathResult.prototype, name, descriptor);
  }

  function asciiLower(value: string): string {
    return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  }

  const htmlNamespace = "http://www.w3.org/1999/xhtml";
  const xmlnsNamespace = "http://www.w3.org/2000/xmlns/";

  function matchesName(
    name: NodeName,
    context: EngineContext<Node>,
    prefix: string | null,
    localName?: string,
  ): boolean {
    const htmlName = context.isHtml && name.htmlOwner;
    const namespace = prefix
      ? context.namespaceResolver.getNamespace(prefix, context.expressionContextNode)
      : context.isHtml && !name.attribute
        ? htmlNamespace
        : "";
    if (namespace === null)
      throw new input.Exception("Unresolved XPath prefix " + prefix, "NamespaceError");
    if ((name.namespace ?? "") !== namespace) return false;
    if (localName === undefined) return true;
    const foldCase = htmlName && (!name.attribute || name.namespace === null);
    return foldCase
      ? asciiLower(localName) === asciiLower(name.localName)
      : localName === name.localName;
  }

  function adaptSteps(expression: EngineExpression<Node>, engine: Engine<Node>): void {
    const { Step, NodeTest } = engine;
    const pending: unknown[] = [expression];
    const seen = new WeakSet<object>();
    // The engine parser produces a finite graph of steps, predicates, and function arguments.
    while (pending.length) {
      const item = pending.pop();
      if (item === null || typeof item !== "object" || seen.has(item)) continue;
      seen.add(item);
      for (const value of Object.values(item)) pending.push(value);
      if (!(item instanceof Step)) continue;
      const original = item.nodeTest;
      if (original === NodeTest.nodeTest && item.axis === Step.DESCENDANTORSELF) {
        // The engine excludes document fragments from node(), including our virtual root.
        item.nodeTest = {
          toString: () => original.toString(),
          matches: (node, context) =>
            node === context.virtualRoot || original.matches(node, context),
        };
        continue;
      }
      const isQualified = original instanceof NodeTest.NameTestQName;
      const prefix =
        isQualified || original instanceof NodeTest.NameTestPrefixAny ? original.prefix : undefined;
      if (prefix === undefined && item.axis !== Step.ATTRIBUTE) continue;
      const localName = isQualified ? original.localName : undefined;
      item.nodeTest = {
        toString: () => original.toString(),
        matches(node, context) {
          const name = input.nodeName(node);
          if (name?.attribute && name.namespace === xmlnsNamespace) return false;
          return name && prefix !== undefined
            ? matchesName(name, context, prefix, localName)
            : original.matches(node, context);
        },
      };
    }
  }

  function resolveNamespace(resolver: NamespaceResolver, prefix: string): string | null {
    try {
      const callback = typeof resolver === "function" ? resolver : resolver.lookupNamespaceURI;
      if (typeof callback !== "function")
        throw input.makeTypeError("The namespace resolver has no callable lookupNamespaceURI");
      const value: unknown = Reflect.apply(
        callback,
        typeof resolver === "function" ? undefined : resolver,
        [prefix],
      );
      if (value == null) return null;
      if (typeof value === "symbol")
        throw input.makeTypeError("Cannot convert a Symbol to a namespace string");
      return `${value}`;
    } catch (error) {
      input.reportResolverError(resolver, error);
      return null;
    }
  }

  const parsedExpressions = new Map<string, EngineExpression<Node>>();
  const maxCachedExpressions = 64;
  const maxCachedSourceLength = 2048;
  let engine: Engine<Node> | undefined;
  let parser: InstanceType<Engine<Node>["XPathParser"]> | undefined;

  function compile(source: string, implementation: Engine<Node>): EngineExpression<Node> {
    const cached = parsedExpressions.get(source);
    if (cached) return cached;
    let parsed: EngineExpression<Node> | undefined;
    try {
      parsed = (parser ??= new implementation.XPathParser()).parse(source);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      throw new input.Exception(error.message, "SyntaxError");
    }
    if (!parsed) throw new input.Exception("Invalid XPath expression", "SyntaxError");
    adaptSteps(parsed, implementation);
    if (source.length <= maxCachedSourceLength) {
      if (parsedExpressions.size === maxCachedExpressions) {
        const oldest = parsedExpressions.keys().next();
        if (!oldest.done) parsedExpressions.delete(oldest.value);
      }
      parsedExpressions.set(source, parsed);
    }
    return parsed;
  }

  class XPathExpression {
    #engine: Engine<Node>;
    #expression: EngineExpression<Node>;
    #resolver: NamespaceResolver | null;
    constructor(token: symbol, expression: string, resolver: NamespaceResolver | null) {
      if (token !== key) throw new TypeError("Illegal constructor");
      this.#engine = engine ??= require("xpath");
      this.#expression = compile(`${expression}`, this.#engine);
      this.#resolver = resolver;
    }
    evaluate(node: Node, type = 0, _result: XPathResult | null = null): XPathResult {
      if (!input.isNode(node)) throw new TypeError("Expected an XPath context node");
      const resultType = +type >>> 0;
      if (resultType > 9)
        throw new input.Exception("Unsupported XPath result type", "NotSupportedError");
      const context = new this.#engine.XPathContext();
      context.expressionContextNode = node;
      context.isHtml = input.isHTML(node);
      const shadow = input.shadowRoot(node);
      if (shadow) context.virtualRoot = shadow;
      const { XBoolean } = this.#engine;
      context.functionResolver.addFunction("", "lang", (active, ...args) => {
        const [argument] = args;
        if (!argument || args.length !== 1)
          throw new TypeError("XPath lang() requires one argument");
        const requested = asciiLower(argument.evaluate(active).stringValue());
        const language = input.xmlLanguage(active.contextNode);
        if (language === null) return new XBoolean(false);
        const actual = asciiLower(language);
        return new XBoolean(actual === requested || actual.startsWith(requested + "-"));
      });
      const resolver = this.#resolver;
      if (resolver != null) {
        // The engine's higher-level resolver replaces empty strings with a fallback lookup.
        const namespaces = new Map<string, string | null>();
        context.namespaceResolver = {
          getNamespace(prefix) {
            if (namespaces.has(prefix)) return namespaces.get(prefix) ?? null;
            const namespace = resolveNamespace(resolver, prefix);
            namespaces.set(prefix, namespace);
            return namespace;
          },
        };
      }
      let value: object;
      try {
        value = this.#expression.evaluate(context);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("Cannot resolve QName "))
          throw error;
        throw new input.Exception(error.message, "NamespaceError");
      }
      try {
        const result = new this.#engine.XPathResult(value, resultType);
        const version = isIterator(result.resultType) ? input.observeVersion(node) : undefined;
        return new XPathResult(key, result, version);
      } catch (error) {
        if (typeof error !== "object" || error === null || !("code" in error) || error.code !== 52)
          throw error;
        throw new TypeError("The XPath result cannot be converted to the requested type");
      }
    }
  }

  class XPathEvaluator {
    createExpression(
      expression: string,
      resolver: NamespaceResolver | null = null,
    ): XPathExpression {
      return new XPathExpression(key, expression, resolver);
    }
    createNSResolver(node: Node): Node {
      if (!input.isNode(node)) throw new TypeError("Expected an XPath namespace resolver node");
      return node;
    }
    evaluate(
      expression: string,
      node: Node,
      resolver: NamespaceResolver | null = null,
      type = 0,
      result: XPathResult | null = null,
    ): XPathResult {
      return this.createExpression(expression, resolver).evaluate(node, type, result);
    }
  }
  return { XPathEvaluator, XPathExpression, XPathResult };
}
