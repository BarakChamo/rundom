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
export function specifiedDeclaration(name: string, value: string): string | undefined {
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
  const {
    serializeDeclarationValue,
  }: {
    serializeDeclarationValue(declaration: unknown): string;
  } = require("rundom-css-reference/lib/jsdom/living/css/serialize.js");
  context ??= createContext({ _globalObject: globalThis });
  const result = parseDestructuredDeclaration(name, value, false, context);
  if (!isFailure(result)) return serializeDeclarationValue(result);
}
