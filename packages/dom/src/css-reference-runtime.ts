// Bundles the pinned jsdom CSS reference modules RunDOM requests into one code-cached, lazily initialized module graph.
// The build defers each generated IDL wrapper's implementation module, so installing a CSSOM
// interface never initializes the reference grammar; parser.js sets grammarInitialized when it runs.
const modules: Readonly<Record<string, () => unknown>> = {
  "lib/generated/css-property-definitions.js": () =>
    require("rundom-css-reference/lib/generated/css-property-definitions.js"),
  "lib/generated/default-stylesheet.js": () =>
    require("rundom-css-reference/lib/generated/default-stylesheet.js"),
  "lib/generated/idl/CSSConditionRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSConditionRule.js"),
  "lib/generated/idl/CSSContainerRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSContainerRule.js"),
  "lib/generated/idl/CSSCounterStyleRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSCounterStyleRule.js"),
  "lib/generated/idl/CSSFontFaceDescriptors.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSFontFaceDescriptors.js"),
  "lib/generated/idl/CSSFontFaceRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSFontFaceRule.js"),
  "lib/generated/idl/CSSFontFeatureValuesRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSFontFeatureValuesRule.js"),
  "lib/generated/idl/CSSFunctionDeclarations.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSFunctionDeclarations.js"),
  "lib/generated/idl/CSSFunctionDescriptors.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSFunctionDescriptors.js"),
  "lib/generated/idl/CSSFunctionRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSFunctionRule.js"),
  "lib/generated/idl/CSSGroupingRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSGroupingRule.js"),
  "lib/generated/idl/CSSMarginDescriptors.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSMarginDescriptors.js"),
  "lib/generated/idl/CSSMarginRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSMarginRule.js"),
  "lib/generated/idl/CSSMediaRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSMediaRule.js"),
  "lib/generated/idl/CSSPageDescriptors.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSPageDescriptors.js"),
  "lib/generated/idl/CSSPageRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSPageRule.js"),
  "lib/generated/idl/CSSPositionTryDescriptors.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSPositionTryDescriptors.js"),
  "lib/generated/idl/CSSPositionTryRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSPositionTryRule.js"),
  "lib/generated/idl/CSSPropertyRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSPropertyRule.js"),
  "lib/generated/idl/CSSRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSRule.js"),
  "lib/generated/idl/CSSRuleList.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSRuleList.js"),
  "lib/generated/idl/CSSStyleDeclaration.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSStyleDeclaration.js"),
  "lib/generated/idl/CSSSupportsRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSSupportsRule.js"),
  "lib/generated/idl/CSSViewTransitionRule.js": () =>
    require("rundom-css-reference/lib/generated/idl/CSSViewTransitionRule.js"),
  "lib/generated/idl/PropertyDefinition.js": () =>
    require("rundom-css-reference/lib/generated/idl/PropertyDefinition.js"),
  "lib/generated/idl/utils.js": () => require("rundom-css-reference/lib/generated/idl/utils.js"),
  "lib/jsdom/living/css/CSS-impl.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/CSS-impl.js"),
  "lib/jsdom/living/css/CSSFontFeatureValuesRule-impl.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/CSSFontFeatureValuesRule-impl.js"),
  "lib/jsdom/living/css/CSSStyleDeclaration-impl.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/CSSStyleDeclaration-impl.js"),
  "lib/jsdom/living/css/match/media.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/match/media.js"),
  "lib/jsdom/living/css/match/support.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/match/support.js"),
  "lib/jsdom/living/css/parse/context.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/parse/context.js"),
  "lib/jsdom/living/css/parse/parser.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/parse/parser.js"),
  "lib/jsdom/living/css/parse/registration.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/parse/registration.js"),
  "lib/jsdom/living/css/parse/shorthand.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/parse/shorthand.js"),
  "lib/jsdom/living/css/properties/shorthands.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/properties/shorthands.js"),
  "lib/jsdom/living/css/resolve.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/resolve.js"),
  "lib/jsdom/living/css/rules/definitions.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/rules/definitions.js"),
  "lib/jsdom/living/css/serialize.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/serialize.js"),
  "lib/jsdom/living/css/state.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/state.js"),
  "lib/jsdom/living/css/utils/resolve-color.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/utils/resolve-color.js"),
  "lib/jsdom/living/css/utils/selector-specificity.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/utils/selector-specificity.js"),
  "lib/jsdom/living/css/utils/serialize-selectors.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/utils/serialize-selectors.js"),
  "lib/jsdom/living/css/utils/style.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/utils/style.js"),
  "lib/jsdom/living/css/values/pseudos.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/values/pseudos.js"),
  "lib/jsdom/living/css/values/value.js": () =>
    require("rundom-css-reference/lib/jsdom/living/css/values/value.js"),
};

module.exports = {
  /** Diagnostic for laziness contracts: true once any request has initialized the reference grammar. */
  grammarInitialized: false,
  /**
   * Returns the shared exports of a bundled reference module.
   * @param path - Package-relative path, as requested after `rundom-css-reference/`.
   * @throws {Error} When the path was not bundled; a raw fallback would split the module graph.
   */
  load(path: string): unknown {
    const loadModule = Object.hasOwn(modules, path) ? modules[path] : undefined;
    if (!loadModule) throw new Error(`RunDOM does not bundle CSS reference module ${path}`);
    return loadModule();
  },
};
