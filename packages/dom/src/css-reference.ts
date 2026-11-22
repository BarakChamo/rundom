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
function parseDeclaration(name: string, value: string): unknown {
  if (!longhandDefinition(name)) return;
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
  const result = parseDestructuredDeclaration(name, value, false, context);
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

/** Expands a shorthand and serializes it from all of its longhands in declaration order. */
export function expandedDeclaration(
  name: string,
  value: string,
): { text: string; entries: [string, string][] } | undefined {
  const parsed = parseDeclaration(name, value);
  if (!parsed) return;
  const expand: (
    declaration: unknown,
  ) => { name: string }[] = require("rundom-css-reference/lib/jsdom/living/css/parse/shorthand.js");
  const {
    implementation: Declaration,
  }: {
    implementation: new (
      global: object,
      args: never[],
      options: object,
    ) => { getPropertyValue(property: string): string };
  } = require("rundom-css-reference/lib/jsdom/living/css/CSSStyleDeclaration-impl.js");
  const declarations = expand(parsed);
  const style = new Declaration(globalThis, [], { baseURL: "about:blank", declarations });
  return {
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
