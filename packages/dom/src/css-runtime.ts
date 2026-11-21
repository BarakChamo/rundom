// Builds pinned CSS dependencies into one artifact while retaining lazy initialization per capability.
// Static CommonJS requests preserve the unbundled adapter's package conditions.
// css-tree 3.2.1 normally allocates a descriptor and up to three closures for
// every grammar in each lexer. Keep its dictionaries enumerable and let the
// bundled lexer build its original descriptor when a grammar is first used.
interface GrammarLexer {
  properties: Record<string, unknown>;
  types: Record<string, unknown>;
  createDescriptor(syntax: unknown, kind: "Property" | "Type", name: string): unknown;
  addProperty_(name: string, syntax: unknown): void;
  addType_(name: string, syntax: unknown): void;
}

function registerGrammar(
  lexer: GrammarLexer,
  kind: "Property" | "Type",
  name: string,
  syntax: unknown,
): void {
  if (!syntax) return;
  const dictionary = kind === "Property" ? lexer.properties : lexer.types;
  Object.defineProperty(dictionary, name, {
    configurable: true,
    enumerable: true,
    get() {
      const value = lexer.createDescriptor(syntax, kind, name);
      Object.defineProperty(dictionary, name, {
        value,
        configurable: true,
        enumerable: true,
        writable: true,
      });
      return value;
    },
  });
}

let grammarRegistriesPrepared = false;
function prepareGrammarRegistries(): void {
  if (grammarRegistriesPrepared) return;
  const { Lexer }: { Lexer: { prototype: GrammarLexer } } = require("css-tree/lexer");
  Lexer.prototype.addProperty_ = function (name, syntax) {
    registerGrammar(this, "Property", name, syntax);
  };
  Lexer.prototype.addType_ = function (name, syntax) {
    registerGrammar(this, "Type", name, syntax);
  };
  grammarRegistriesPrepared = true;
}

module.exports = {
  get cssTree(): typeof import("css-tree") {
    prepareGrammarRegistries();
    return require("css-tree");
  },
  get cssSelect(): typeof import("css-select") {
    return require("css-select");
  },
  get cssColor(): typeof import("@asamuzakjp/css-color") {
    return require("@asamuzakjp/css-color");
  },
  get cssPropertyDefinitions(): ReadonlyMap<string, { legacyAliasOf?: string }> {
    return require("cssstyle/lib/generated/propertyDefinitions");
  },
  // The pinned cssstyle parser can validate declarations before CSSOM initializes.
  get cssValueParser(): { parsePropertyValue: (name: string, value: string) => unknown } {
    prepareGrammarRegistries();
    return require("cssstyle/lib/parsers");
  },
  // cssstyle has no shipped declarations; consumers keep narrow operation-specific contracts.
  get cssStyle(): unknown {
    prepareGrammarRegistries();
    return require("cssstyle");
  },
};
