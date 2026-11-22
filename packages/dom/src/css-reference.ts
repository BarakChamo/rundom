// Loads the pinned upstream CSS grammar on demand for declarations outside cssstyle's coverage.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
type Property = { initial?: string | null; inherited?: boolean };
let properties: Record<string, Property> | undefined;
let context: object | undefined;

export function longhandDefinition(name: string): Property | undefined {
  const definitions = (properties ??=
    require("rundom-css-reference/lib/generated/css-property-definitions.js") as Record<
      string,
      Property
    >);
  return Object.hasOwn(definitions, name) ? definitions[name] : undefined;
}

/** Returns the specified serialization of a valid CSS declaration in an ordinary style rule. */
function parseDeclaration(name: string, value: string, important = false): unknown {
  if (!name.startsWith("--") && !longhandDefinition(name)) return;
  const {
    createContext,
  }: {
    createContext(owner: object): object;
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/context.js");
  const {
    parseDestructuredDeclaration,
  }: {
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
    isFailure(result: unknown): boolean;
  } = require("rundom-css-reference/lib/jsdom/living/css/values/value.js");
  context ??= createContext({ _globalObject: globalThis });
  const result = parseDestructuredDeclaration(name, value, important, context);
  if (!isFailure(result)) return result;
}

export function specifiedDeclaration(name: string, value: string): string | undefined {
  const parsed = parseDeclaration(name, value);
  if (!parsed) return;
  const {
    serializeDeclarationValue,
  }: {
    serializeDeclarationValue(declaration: unknown): string;
  } = require("rundom-css-reference/lib/jsdom/living/css/serialize.js");
  return serializeDeclarationValue(parsed);
}

function detachedDeclaration(declarations: readonly unknown[]) {
  const {
    implementation: Declaration,
  }: {
    implementation: new (
      global: object,
      args: never[],
      options: object,
    ) => { readonly cssText: string; getPropertyValue(property: string): string };
  } = require("rundom-css-reference/lib/jsdom/living/css/CSSStyleDeclaration-impl.js");
  return new Declaration(globalThis, [], { baseURL: "about:blank", declarations });
}

/** Serializes CSS blocks containing overlapping shorthands or pending substitutions. */
export type ShorthandSource = {
  shorthand: string;
  text: string;
  declaration: object;
  pending: boolean;
};
export function serializeDeclarationBlock(
  text: string,
  pending?: ReadonlyMap<string, ShorthandSource>,
): string {
  const {
    parseDeclarations,
  }: {
    parseDeclarations(text: string, context: object): { name: string; important: boolean }[];
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js");
  const {
    createContext,
  }: {
    createContext(owner: object): object;
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/context.js");
  context ??= createContext({ _globalObject: globalThis });
  const declarations = parseDeclarations(text, context);
  return detachedDeclaration(
    pending?.size
      ? declarations.map((declaration) => {
          const source = pending.get(declaration.name);
          return source?.declaration ?? declaration;
        })
      : declarations,
  ).cssText;
}

/** Expands a shorthand and serializes it from all of its longhands in declaration order. */
export function expandedDeclaration(
  name: string,
  value: string,
  important = false,
):
  | {
      text: string;
      entries: [string, string][];
      declarations: { name: string; pending?: unknown }[];
    }
  | undefined {
  const parsed = parseDeclaration(name, value, important);
  if (!parsed) return;
  const expand: (declaration: unknown) => {
    name: string;
    pending?: unknown;
  }[] = require("rundom-css-reference/lib/jsdom/living/css/parse/shorthand.js");
  const declarations = expand(parsed);
  const style = detachedDeclaration(declarations);
  return {
    declarations,
    text: style.getPropertyValue(name),
    entries: declarations.map(({ name }) => [name, style.getPropertyValue(name)]),
  };
}

export type RegisteredProperty = {
  name: string;
  syntax: string;
  inherits: boolean;
  initialValue?: string;
};

/** Validates the registration grammar and the independence of its initial value. */
export function registeredProperty(
  value: unknown,
  existing: ReadonlyMap<string, RegisteredProperty> | undefined,
  Exception: typeof globalThis.DOMException,
): RegisteredProperty {
  const {
    convert,
  }: {
    convert(globals: object, input: unknown): RegisteredProperty;
  } = require("rundom-css-reference/lib/generated/idl/PropertyDefinition.js");
  const definition = convert(globalThis, value);
  const { name, syntax, initialValue } = definition;
  if (!name.startsWith("--") || name.length === 2)
    throw new Exception("Invalid custom property name", "SyntaxError");
  if (existing?.has(name))
    throw new Exception("Custom property is already registered", "InvalidModificationError");
  const {
    createVirtualContext,
  }: {
    createVirtualContext(global: object, rule: string): object;
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/context.js");
  const ctx = createVirtualContext(globalThis, "@property");
  const {
    parseDeclarationValue,
    parseGrammar,
  }: {
    parseDeclarationValue(value: string, descriptor: string, context: object): unknown;
    parseGrammar(value: string, grammar: unknown, context: object): unknown;
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js");
  const {
    serializeStringFromPrimitive,
    serializeComponentValue,
  }: {
    serializeStringFromPrimitive(value: string): string;
    serializeComponentValue(value: unknown): string;
  } = require("rundom-css-reference/lib/jsdom/living/css/serialize.js");
  const {
    isFailure,
    isComputationallyIndependent,
  }: {
    isFailure(value: unknown): boolean;
    isComputationallyIndependent(value: unknown): boolean;
  } = require("rundom-css-reference/lib/jsdom/living/css/values/value.js");
  const {
    compileRegistrationSyntax,
    isValidUniversalInitialValue,
  }: {
    compileRegistrationSyntax(value: unknown): unknown;
    isValidUniversalInitialValue(value: unknown): boolean;
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/registration.js");
  const descriptor = parseDeclarationValue(serializeStringFromPrimitive(syntax), "syntax", ctx);
  if (isFailure(descriptor)) throw new Exception("Invalid syntax descriptor", "SyntaxError");
  if (initialValue === undefined) return definition;
  const universal = serializeComponentValue(descriptor) === "*";
  const initial = universal
    ? parseDeclarationValue(initialValue, "initial-value", ctx)
    : parseGrammar(initialValue, compileRegistrationSyntax(descriptor), ctx);
  if (
    isFailure(initial) ||
    !(universal ? isValidUniversalInitialValue(initial) : isComputationallyIndependent(initial))
  )
    throw new Exception("Invalid initial value", "SyntaxError");
  return { ...definition, initialValue: serializeComponentValue(initial) };
}

/** Preserves valid general-enclosed syntax when the media evaluator cannot match a feature. */
export function specifiedMediaQuery(value: string): string {
  const {
    parseGrammar,
  }: {
    parseGrammar(text: string, grammar: string): unknown;
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js");
  const {
    isFailure,
  }: {
    isFailure(value: unknown): boolean;
  } = require("rundom-css-reference/lib/jsdom/living/css/values/value.js");
  const {
    serializeComponentValue,
  }: {
    serializeComponentValue(value: unknown): string;
  } = require("rundom-css-reference/lib/jsdom/living/css/serialize.js");
  const result = parseGrammar(value, "<media-query-list>");
  return isFailure(result) ? "not all" : serializeComponentValue(result);
}

interface ConditionSyntax {
  name: string;
  query: string;
}
export function parseContainerConditions(
  text: string,
): { text: string; conditions: readonly ConditionSyntax[] } | undefined {
  const {
    parseGrammar,
  }: {
    parseGrammar(text: string, grammar: string): unknown;
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js");
  const ast = parseGrammar(text, "<container-condition>#");
  if (!Array.isArray(ast)) return;
  const {
    serializeComponentValue,
  }: {
    serializeComponentValue(node: unknown): string;
  } = require("rundom-css-reference/lib/jsdom/living/css/serialize.js");
  const conditions = ast.map(([name, query]) =>
    Object.freeze({ name: serializeComponentValue(name), query: serializeComponentValue(query) }),
  );
  return { text: serializeComponentValue(ast), conditions: Object.freeze(conditions) };
}

export function validPseudoSelectorList(text: string, namespaces?: ReadonlyMap<string, string>) {
  const {
    parseGrammar,
  }: {
    parseGrammar(text: string, grammar: string, context: object): unknown;
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js");
  const {
    createVirtualContext,
  }: {
    createVirtualContext(global: object, name: string): { namespaces: Map<string, string> };
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/context.js");
  const context = createVirtualContext(globalThis, "@style");
  if (namespaces) for (const [prefix, uri] of namespaces) context.namespaces.set(prefix, uri);
  return Array.isArray(parseGrammar(text, "<selector-list>", context));
}

/** Parses one query and precomputes its result for the default headless device. */
export function defaultMediaQuery(text: string): { media: string; matches?: boolean } {
  const {
    parseGrammar,
  }: {
    parseGrammar(text: string, grammar: string): object[];
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js");
  const {
    serializeComponentValue,
  }: {
    serializeComponentValue(ast: object): string;
  } = require("rundom-css-reference/lib/jsdom/living/css/serialize.js");
  const ast = parseGrammar(text, "<media-query-list>");
  const media = serializeComponentValue(ast);
  // Page color scheme and scripting depend on the owning document.
  if (/prefers-color-scheme|scripting/i.test(media)) return { media };
  const match: (
    ast: object,
  ) => boolean = require("rundom-css-reference/lib/jsdom/living/css/match/media.js");
  return { media, matches: match(ast) };
}

/** Position-area resolves axes without element or layout inputs. */
export function computedPositionArea(value: string): string {
  const specified = parseDeclaration("position-area", value) as { value: unknown } | undefined;
  if (!specified) return value;
  const {
    getComputedValue,
  }: {
    getComputedValue(name: string, element: undefined, value: unknown): unknown;
  } = require("rundom-css-reference/lib/jsdom/living/css/resolve.js");
  const {
    serializeDeclarationValue,
  }: {
    serializeDeclarationValue(declaration: object): string;
  } = require("rundom-css-reference/lib/jsdom/living/css/serialize.js");
  return serializeDeclarationValue({
    name: "position-area",
    computed: true,
    value: getComputedValue("position-area", undefined, specified.value),
  });
}

/** The grammar supplies the component list for overlapping CSS shorthands. */
export function grammarLonghands(name: string): readonly string[] | undefined {
  if (
    name !== "all" &&
    name !== "font" &&
    !/^(?:(?:(?:row|column)-)?rule|grid|corner|animation|font-variant|white-space|text-wrap|text-spacing|font-synthesis|size|border-radius|border-image|contain-intrinsic-size|flex|text-emphasis|text-decoration-inset|container|flex-flow|caret|margin-block|margin-inline|padding-block|padding-inline|vertical-align|transition|gap|grid-gap|inset|scroll-padding|scroll-margin|place|list-style|text-box|overflow-clip-margin|mask|columns|column-rule|position-try|offset)(?:-|$)/.test(
      name,
    )
  )
    return;
  const shorthands: ReadonlyMap<
    string,
    readonly [readonly string[]]
  > = require("rundom-css-reference/lib/jsdom/living/css/properties/shorthands.js");
  const groups = shorthands.get(name);
  return groups && (groups.length === 1 ? groups[0] : groups.flat());
}

export function serializeShorthand(
  name: string,
  children: readonly string[],
  read: (name: string) => string,
  priority: (name: string) => string,
  computed = false,
): string {
  const declarations = [];
  const importance = priority(children[0]!);
  for (const child of children) {
    const text = read(child);
    if (!text || priority(child) !== importance) return "";
    const parsed = parseDeclaration(child, text);
    if (!parsed) return "";
    declarations.push(parsed);
  }
  const {
    serializeDeclarationValue,
  }: {
    serializeDeclarationValue(declaration: object): string;
  } = require("rundom-css-reference/lib/jsdom/living/css/serialize.js");
  return serializeDeclarationValue({ name, computed, shorthand: true, value: declarations });
}

/** Keeps the nested, ordered OpenType feature maps local to their CSS rule. */
export function fontFeatureValues(
  text: string,
): { cssText: string; fontFamily: string } | undefined {
  const {
    parseStyleSheetSyntax,
  }: {
    parseStyleSheetSyntax(text: string): { name: string }[];
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js");
  const rules = parseStyleSheetSyntax(text);
  if (rules.length !== 1 || rules[0]?.name !== "font-feature-values") return;
  const {
    implementation: FontFeatures,
  }: {
    implementation: new (
      global: object,
      args: never[],
      syntax: object,
    ) => { cssText: string; fontFamily: string };
  } = require("rundom-css-reference/lib/jsdom/living/css/CSSFontFeatureValuesRule-impl.js");
  return new FontFeatures(globalThis, [], rules[0]);
}

export type PositionTryStyle = {
  readonly length: number;
  cssText: string;
  item(index: number): string;
  setProperty(name: string, value: string, priority?: string): void;
  getPropertyValue(name: string): string;
  getPropertyPriority(name: string): string;
  removeProperty(name: string): string;
};
export type PositionTry = {
  readonly name: string;
  readonly cssText: string;
  readonly style: PositionTryStyle;
};

export type FontFaceData = {
  cssText: string;
  style: PositionTryStyle & { readonly parentRule: object | null };
};
export type BoundRule<T> = { data: T; bind(owner: object): void };

function bindRule<T>(impl: object): BoundRule<T> {
  const utils: {
    wrapperForImpl(impl: object): T;
    wrapperSymbol: symbol;
  } = require("rundom-css-reference/lib/generated/idl/utils.js");
  return {
    data: utils.wrapperForImpl(impl),
    bind(owner) {
      Reflect.set(impl, utils.wrapperSymbol, owner);
    },
  };
}

export type FunctionRuleData<List> = {
  readonly name: string;
  readonly cssText: string;
  readonly cssRules: List;
  readonly returnType: string;
  getParameters(): { name: string; type: string; defaultValue?: string }[];
  insertRule(rule: string, index?: number): number;
  deleteRule(index: number): void;
};

/** Binds the descriptor grammar to the owning stylesheet's URL and invalidation callbacks. */
export function createDescriptorRuleParser(baseURL: () => string, changed: () => void) {
  const {
    parseRule,
  }: {
    parseRule(
      text: string,
      global: object,
    ): PositionTry | { cssText: string; fontFamily: string } | { message: string };
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js");
  const globals = {
    Object,
    Array,
    TypeError,
    Error,
    Number,
    String,
    DOMException,
    _document: { baseURLSerialized: baseURL, _clearStyleSheetCache: changed },
  };
  for (const name of [
    "CSSRule",
    "CSSPositionTryRule",
    "CSSFontFeatureValuesRule",
    "CSSStyleDeclaration",
    "CSSPositionTryDescriptors",
  ]) {
    const idl: { install(global: object, names: string[]): void } = require(
      "rundom-css-reference/lib/generated/idl/" + name + ".js",
    );
    idl.install(globals, ["Window"]);
  }
  return {
    descriptor<T extends object>(
      binding: "CSSCounterStyleRule" | "CSSViewTransitionRule",
      text: string,
    ): BoundRule<T> | undefined {
      if (!Object.hasOwn(globals, binding)) {
        const idl: { install(global: object, names: string[]): void } = require(
          "rundom-css-reference/lib/generated/idl/" + binding + ".js",
        );
        idl.install(globals, ["Window"]);
      }
      const impl = parseRule(text, globals);
      return "message" in impl ? undefined : bindRule<T>(impl);
    },
    fontFaceDescriptors() {
      if (!Object.hasOwn(globals, "CSSFontFaceRule")) {
        for (const name of ["CSSFontFaceDescriptors", "CSSFontFaceRule"]) {
          const idl: { install(global: object, names: string[]): void } = require(
            "rundom-css-reference/lib/generated/idl/" + name + ".js",
          );
          idl.install(globals, ["Window"]);
        }
      }
      return (globals as typeof globals & { CSSFontFaceDescriptors: Function })
        .CSSFontFaceDescriptors;
    },
    fontFace(text: string) {
      this.fontFaceDescriptors();
      const impl = parseRule(text, globals);
      if (!("style" in impl)) return;
      return bindRule<FontFaceData>(impl);
    },
    functionInterfaces() {
      if (!Object.hasOwn(globals, "CSSFunctionRule")) {
        for (const name of [
          "CSSRuleList",
          "CSSGroupingRule",
          "CSSConditionRule",
          "CSSSupportsRule",
          "CSSMediaRule",
          "CSSContainerRule",
          "CSSFunctionRule",
          "CSSFunctionDeclarations",
          "CSSFunctionDescriptors",
        ]) {
          const idl: { install(global: object, names: string[]): void } = require(
            "rundom-css-reference/lib/generated/idl/" + name + ".js",
          );
          idl.install(globals, ["Window"]);
        }
      }
      return globals as typeof globals & {
        CSSFunctionDescriptors: Function;
        CSSFunctionDeclarations: Function;
      };
    },
    functionRule<List>(text: string) {
      this.functionInterfaces();
      const impl = parseRule(text, globals);
      if (!("getParameters" in impl)) return;
      return bindRule<FunctionRuleData<List>>(impl);
    },
    position(text: string) {
      const rule = parseRule(text, globals);
      if (!("style" in rule)) return;
      const {
        wrapperForImpl,
      }: {
        wrapperForImpl(implementation: object): PositionTry;
      } = require("rundom-css-reference/lib/generated/idl/utils.js");
      return wrapperForImpl(rule);
    },
    font(text: string) {
      const rule = parseRule(text, globals);
      return "fontFamily" in rule ? rule : undefined;
    },
  };
}

/** Returns the canonical selector for a supported computed-style pseudo target. */
export function computedPseudoTarget(text: string): string | null {
  const {
    parsePseudoElementSelectors,
  }: {
    parsePseudoElementSelectors(input: string, global: object): unknown;
  } = require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js");
  const {
    serializeComponentValue,
  }: {
    serializeComponentValue(value: unknown): string;
  } = require("rundom-css-reference/lib/jsdom/living/css/serialize.js");
  const {
    elements,
  }: {
    elements: Record<string, unknown>;
  } = require("rundom-css-reference/lib/jsdom/living/css/values/pseudos.js");
  const selectors = parsePseudoElementSelectors(text, globalThis);
  if (!Array.isArray(selectors)) return null;
  let result = "";
  for (const token of selectors) {
    const name = token.name ?? token.value;
    if (
      name === "part" ||
      name === "slotted" ||
      !Object.hasOwn(elements, token.name ? name + "()" : name)
    )
      return null;
    result += serializeComponentValue(token);
  }
  return result || null;
}
