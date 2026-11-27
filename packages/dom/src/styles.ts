// Parses author stylesheets and resolves declarations against private DOM state.
import {
  expandedDeclaration,
  fontFeatureValues,
  createDescriptorRuleParser,
  type PositionTry,
  bindCSSWrapper,
  canonicalSelectorList,
  selectorFeatureSupported,
  grammarLonghands,
  importResource,
  parseContainerConditions,
  validPseudoSelectorList,
  type FunctionRuleData,
  type BoundRule,
  type FontFaceData,
  serializeShorthand,
  serializeDeclarationBlock,
  type ShorthandSource,
  defaultMediaQuery,
  computedPositionArea,
  computedPseudoTarget,
  longhandDefinition,
  registeredProperty,
  specifiedDeclaration,
  orderedDeclaration,
  specifiedMediaQuery,
  type RegisteredProperty,
} from "./css-reference.js";
import {
  dependsOnWinnersOnly,
  substitutionFunction,
  substitutionFrame,
  type SubstitutionFrame,
} from "./css-substitution.js";
import { ownedString } from "./owned-string.js";
import { createRequire } from "node:module";
import { serializePhysicalBorder, isPhysicalBorder } from "./css-border-serialization.js";
import { InlineDeclaration, parseInlineBlock } from "./inline-declaration.js";
import { parseSizeDeclaration } from "./css-sizing.js";
import { acceptsAnchors, anchorComponents } from "./css-anchor.js";
import { hasContextlessPercentage, serializeCSSMath } from "./css-numeric.js";
import {
  createDeclarationViews,
  type DeclarationImplementation,
  type ProjectedIndexGroup,
  type StyleProperty,
} from "./css-declaration-view.js";
type PublicDeclaration = ReturnType<ReturnType<typeof createDeclarationViews>["expose"]>;
import {
  hasOnlyDeclarations,
  parseNestingStyleSheet,
  normalizeNestingSelector,
} from "./css-nesting.js";
import { defaultTreeAdapter as tree, html, type DefaultTreeAdapterTypes as Raw } from "parse5";
import type { CssNode, Selector, Value, WalkOptionsNoVisit } from "css-tree";
import { createCSSNamespace, readSupportsCondition } from "./css-supports.js";
import {
  functionalColorValue,
  replaceSystemColors,
  specifiedColorFunction,
  systemColor,
} from "./css-colors.js";
import {
  parseSelectorList,
  customStateIdentifier,
  validSelectorCompounds,
  purePseudoSelector,
} from "./selector-syntax.js";
import { compileSelector, compileSimpleSubject, compileTreeSelector } from "./selectors.js";
import { queryDependsOnTreeOrFocus, queryDependsOnlyOnTree } from "./query-index.js";
import { elementLocalName, xmlSpecial } from "./xml.js";

const require = createRequire(import.meta.url);
const arrayValues = Array.prototype.values;
const setParsedOutline = Symbol();
type Declaration = DeclarationFields &
  Iterable<string> & {
    readonly _length: number;
    [index: number]: string;
    [setParsedOutline](value: string, priority: string, preserveImportant: boolean): void;
  };
type DeclarationFields = {
  readonly parentRule: object | null;
  readonly length: number;
  get cssText(): string;
  set cssText(value: string);
  color: string;
  contentVisibility: string;
  display: string;
  item(index: number): string;
  getPropertyValue(name: string): string;
  getPropertyPriority(name: string): string;
  setProperty(name: string, value: string, priority?: string): void;
  removeProperty(name: string): string;
};

const stylesheetInstances = new WeakSet<object>();

type SelectorEntry = {
  part?: { names: string[]; local: boolean; origin: (node: Raw.Element) => boolean };
  slot?: (node: Raw.Element, root?: Raw.ParentNode) => boolean;
  pseudo?: { text: string; match: (node: Raw.Element, root?: Raw.ParentNode) => boolean };
  match: (node: Raw.Element, root?: Raw.ParentNode) => boolean;
  specificity: number;
  hostOnly: boolean;
  subjectKey?: string;
  subjectType?: string;
};
type RuleSelection = {
  text: string;
  entries: SelectorEntry[];
  containsNesting?: boolean;
  treeDependent?: boolean;
  focusDependent?: boolean;
};
type ParsedRuleSelection = { selection: RuleSelection; allMatchable: boolean };
type DeclarationRule = {
  type: 1 | 5;
  selectorText?: string;
  style: PublicDeclaration;
  readonly cssText: string;
};
type ImportRule = {
  readonly type: 3;
  readonly href: string;
  readonly styleSheet: Sheet | null;
  readonly layerName: string | null;
  readonly supportsText: string | null;
  get media(): SheetMedia;
  set media(value: string | null);
  readonly cssText: string;
};
type ImportCondition = {
  resourceText?: string;
  layerName: string | null;
  supportsText: string | null;
  media: string;
};
type GroupingRuleView = {
  readonly type: 0 | 1 | 4 | 6 | 12;
  insertRule(rule: string, index?: number): number;
  deleteRule(index: number): void;
  readonly cssRules: RuleList;
  readonly cssText: string;
};
type ConditionRuleView = GroupingRuleView & {
  readonly conditionText: string;
  readonly matches: boolean;
};
type MarginData = {
  readonly type: 9;
  readonly name: string;
  readonly cssText: string;
  readonly style: PublicDeclaration;
};
type PageData = {
  selectorText: string;
  readonly cssText: string;
  readonly style: PublicDeclaration;
  readonly cssRules: ArrayLike<MarginData>;
  insertRule(text: string, index?: number): number;
  deleteRule(index: number): void;
};
type PageRule = GroupingRuleView & {
  readonly type: 6;
  selectorText: string;
  readonly style: PublicDeclaration;
};
type ScopeRule = GroupingRuleView & {
  readonly type: 0;
  readonly start: string | null;
  readonly end: string | null;
};
type StartingStyleRule = GroupingRuleView & { readonly type: 0 };
type LayerBlockRule = GroupingRuleView & { readonly type: 0; readonly name: string };
type MediaRule = ConditionRuleView & {
  readonly type: 4;
  get media(): SheetMedia;
  set media(value: string | null);
};
type ContainerRule = ConditionRuleView & {
  readonly type: 0;
  readonly containerName: string;
  readonly containerQuery: string;
};
type SupportsRule = ConditionRuleView & { readonly type: 12 };
type KeyframeRule = {
  readonly type: 8;
  keyText: string;
  readonly style: PublicDeclaration;
  readonly cssText: string;
};
type KeyframesRule = {
  readonly type: 7;
  name: string;
  readonly length: number;
  readonly cssRules: RuleList;
  readonly cssText: string;
  readonly [index: number]: (KeyframeRule & RuleParents) | undefined;
  appendRule(rule: string): void;
  deleteRule(select: string): void;
  findRule(select: string): (KeyframeRule & RuleParents) | null;
};
type RuleParents = {
  readonly parentRule: ((GroupingRuleView | KeyframesRule) & RuleParents) | null;
  readonly parentStyleSheet: Sheet | null;
};
const counterDescriptors = [
  ["system", "system"],
  ["symbols", "symbols"],
  ["additiveSymbols", "additive-symbols"],
  ["negative", "negative"],
  ["prefix", "prefix"],
  ["suffix", "suffix"],
  ["range", "range"],
  ["pad", "pad"],
  ["speakAs", "speak-as"],
  ["fallback", "fallback"],
] as const;
type CounterDescriptor = (typeof counterDescriptors)[number][0];
type ViewTransitionData = {
  readonly navigation: string;
  readonly types: readonly string[];
  readonly cssText: string;
};
type CounterStyleRule = Record<CounterDescriptor, string> & {
  readonly type: 11;
  name: string;
  readonly cssText: string;
};
type NamespaceRule = {
  readonly type: 10;
  readonly prefix: string;
  readonly namespaceURI: string;
  readonly cssText: string;
};
type LayerStatementRule = {
  readonly type: 0;
  readonly nameList: readonly string[];
  readonly cssText: string;
};
type NestedDeclarationsRule = {
  readonly type: 0;
  readonly style: PublicDeclaration;
  readonly cssText: string;
};
type PositionTryRule = {
  readonly type: 0;
  readonly name: string;
  readonly cssText: string;
  readonly style: ReturnType<ReturnType<typeof createDeclarationViews>["positionDescriptors"]>;
};
type FontFeatureValuesRule = { readonly type: 14; fontFamily: string; readonly cssText: string };
type PropertyRule = {
  readonly type: 0;
  readonly names: readonly string[];
  readonly name: string;
  readonly syntax: string;
  readonly inherits: boolean;
  readonly initialValue: string | null;
  readonly cssText: string;
};
// Inheritance keeps unitless line heights as multipliers. Public snapshots expose their used length.
// Public CSSOM rounds converted dimensions. Keep their original calculation for
// the later computed-value stage so intermediate rounding cannot alter its result.
let calculationSources: WeakMap<object, Map<string, string>> | undefined;
const inlineBaseReaders = new WeakMap<object, () => string>();
let declarationBases: WeakMap<object, Map<string, string>> | undefined;
const urlDependentValue = /(?:url|image-set|var)\(/i;
const orderedStyles = new WeakMap<object, ReturnType<typeof orderedDeclaration>>();
const logicalBoxName =
  /^(?:(?:margin|padding|inset|border)-(?:block|inline)(?:-|$)|border-(?:start|end)-(?:start|end)-radius$)/;
const computedGapRules = new WeakMap<object, SubstitutionFrame>();
let shorthandSources: WeakMap<object, Map<string, ShorthandSource>> | undefined;
function setShorthandSource(owner: object, child: string, value: ShorthandSource): void {
  shorthandSources ??= new WeakMap();
  let entries = shorthandSources.get(owner);
  if (!entries) shorthandSources.set(owner, (entries = new Map()));
  entries.set(child, value);
}
const unitlessLineHeights = new WeakMap<object, string>();
const publicLineHeights = new WeakMap<object, string>();
type QualifiedRule = DeclarationRule &
  GroupingRuleView & { readonly type: 1; selectorText: string };
type NestingMode = "style" | "scope";
type StyleRule = (
  | MarginData
  | StartingStyleRule
  | DeclarationRule
  | NestedDeclarationsRule
  | QualifiedRule
  | PropertyRule
  | FontFeatureValuesRule
  | (ViewTransitionData & { readonly type: 0 })
  | (FontFaceData & { readonly type: 5 })
  | (FunctionRuleData<RuleList> & { readonly type: 0 })
  | PositionTryRule
  | ImportRule
  | MediaRule
  | SupportsRule
  | ContainerRule
  | ScopeRule
  | LayerStatementRule
  | LayerBlockRule
  | NamespaceRule
  | CounterStyleRule
  | PageRule
  | KeyframeRule
  | KeyframesRule
) &
  RuleParents;
type RuleList = Iterable<StyleRule> & {
  readonly [index: number]: StyleRule | undefined;
  readonly length: number;
  item(index: number): StyleRule | null;
};

type Viewport = { width: number; height: number; resolution: number };
type MediaPredicate = (viewport: Viewport) => boolean | null;
type Rule =
  | {
      kind: "style";
      view: QualifiedRule & RuleParents;
      selection: { current: RuleSelection };
      rules: Rule[];
    }
  | { kind: "nested-declarations"; view: NestedDeclarationsRule & RuleParents }
  | { kind: "declaration"; view: DeclarationRule & RuleParents; selectors: SelectorEntry[] }
  | { kind: "import"; view: ImportRule & RuleParents; imported?: SheetRecord }
  | { kind: "namespace"; view: NamespaceRule & RuleParents }
  | { kind: "keyframe"; view: KeyframeRule & RuleParents }
  | { kind: "keyframes"; view: KeyframesRule & RuleParents; rules: KeyframeEntry[] }
  | { kind: "margin"; view: MarginData & RuleParents }
  | { kind: "page"; view: PageRule & RuleParents; rules: Rule[] }
  | { kind: "property"; view: PropertyRule & RuleParents }
  | { kind: "function"; view: FunctionRuleData<RuleList> & { readonly type: 0 } & RuleParents }
  | { kind: "font-face"; view: FontFaceData & { readonly type: 5 } & RuleParents }
  | { kind: "position-try"; view: PositionTryRule & RuleParents }
  | { kind: "view-transition"; view: ViewTransitionData & { readonly type: 0 } & RuleParents }
  | { kind: "counter-style"; view: CounterStyleRule & RuleParents }
  | {
      kind: "font-feature-values";
      view: FontFeatureValuesRule & RuleParents;
    }
  | { kind: "layer-statement"; view: LayerStatementRule & RuleParents }
  | {
      kind: "starting-style";
      view: StartingStyleRule & RuleParents;
      rules: Rule[];
    }
  | { kind: "layer-block"; view: LayerBlockRule & RuleParents; rules: Rule[] }
  | { kind: "media"; view: MediaRule & RuleParents; rules: Rule[] }
  | {
      kind: "scope";
      view: ScopeRule & RuleParents;
      rules: Rule[];
      boundaries?: { parent: RuleSelection | undefined; value: ScopeBoundaries | null };
    }
  | { kind: "container"; view: ContainerRule & RuleParents; rules: Rule[] }
  | { kind: "supports"; view: SupportsRule & RuleParents; rules: Rule[] };

type OrderedSubject<T> = { index: number; value: T };
type SubjectIndex<T> = {
  fallback: OrderedSubject<T>[];
  fallbackValues: T[];
  buckets: Map<string, OrderedSubject<T>[]>;
};
const cascadeRuleIndexes = new WeakMap<Rule[], SubjectIndex<Rule> | null>();

function sheetSubjects(record: SheetRecord): Rule | Rule[] | null | undefined {
  if (!record.rules.length) return null;
  if (record.rules.length === 1) return record.rules[0];
  return record.rules.length <= 64 ? record.rules : undefined;
}
function identityRule(rule: Rule): Rule {
  return rule;
}

// Every selector branch must prove a subject before an entire rule or sheet can be skipped.
function addRuleSubjects(rule: Rule | null | undefined, keys: Set<string>): boolean {
  while (rule?.kind === "media" && rule.rules.length <= 1) rule = rule.rules[0] ?? null;
  if (rule === null || rule?.kind === "keyframes" || rule?.kind === "keyframe") return true;
  if (rule?.kind !== "style" || rule.rules.length) return false;
  const selection = rule.selection.current;
  if (selection.containsNesting || selection.entries.length > 32) return false;
  for (const entry of selection.entries) {
    if (entry.match === neverMatchesElement) continue;
    if (entry.subjectKey) keys.add(entry.subjectKey);
    else if (entry.subjectType) keys.add(`|${entry.subjectType}`);
    else return false;
  }
  return true;
}

function cascadeSubjectIndex<T>(
  values: T[],
  cache: WeakMap<T[], SubjectIndex<T> | null>,
  ruleOf: (value: T) => Rule | Rule[] | null | undefined,
): SubjectIndex<T> | undefined {
  if (values.length < 8 || values.length > 4096) return;
  const cached = cache.get(values);
  if (cached !== undefined) return cached ?? undefined;
  const buckets = new Map<string, OrderedSubject<T>[]>();
  const fallback: OrderedSubject<T>[] = [];
  let entries = 0;
  for (const [index, value] of values.entries()) {
    const ordered = { index, value };
    const rules = ruleOf(value);
    const keys = new Set<string>();
    if (
      Array.isArray(rules)
        ? !rules.every((rule) => addRuleSubjects(rule, keys))
        : !addRuleSubjects(rules, keys)
    ) {
      fallback.push(ordered);
      continue;
    }
    entries += keys.size;
    if (entries > 8192) {
      cache.set(values, null);
      return;
    }
    for (const key of keys) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(ordered);
      else buckets.set(key, [ordered]);
    }
  }
  const index =
    fallback.length <= values.length / 2
      ? { buckets, fallback, fallbackValues: fallback.map(({ value }) => value) }
      : null;
  cache.set(values, index);
  return index ?? undefined;
}

function indexedSubjects<T>(index: SubjectIndex<T>, keys: ReadonlySet<string>): T[] {
  let matching: Set<OrderedSubject<T>> | undefined;
  for (const key of keys) {
    const bucket = index.buckets.get(key);
    if (bucket) {
      matching ??= new Set(index.fallback);
      for (const entry of bucket) matching.add(entry);
    }
  }
  if (!matching) return index.fallbackValues;
  return Array.from(matching)
    .sort((a, b) => a.index - b.index)
    .map(({ value }) => value);
}
type ScopeBoundaries = { root: RuleSelection | undefined; limit: RuleSelection | undefined };
type GroupOwner = {
  parse: (
    text: string,
    namespaces?: Map<string, string>,
    nesting?: NestingMode,
  ) => Omit<SheetRecord, "sheet">;
  namespaces: (sheet: Sheet | null) => Map<string, string> | undefined;
  nesting: (rule: object) => NestingMode | undefined;
  list: (rules: readonly Rule[]) => RuleList;
  selector: (
    text: string,
    namespaces?: ReadonlyMap<string, string>,
    nesting?: NestingMode,
  ) => RuleSelection | undefined;
};
type GroupState = { rules: Rule[]; owner: GroupOwner; list?: RuleList };
// Weak graph records permit borrowed CSSOM operations without sharing Window-local constructors.
type RuleRecord = {
  kind: number;
  parentRule: RuleParents["parentRule"];
  parentStyleSheet: Sheet | null;
  group?: GroupState;
  selection?: { current: RuleSelection };
  declaration?: Declaration | (() => Declaration);
};
const cssRuleRecords = new WeakMap<object, RuleRecord>();
const cssMediaLists = new WeakMap<SheetMedia, ReturnType<typeof parseMediaQuery>>();
function ruleRecord(rule: object): RuleRecord {
  const record = cssRuleRecords.get(rule);
  if (!record) throw new TypeError("Illegal invocation");
  return record;
}
function ruleDeclaration(rule: object): Declaration {
  const record = ruleRecord(rule);
  const style = record.declaration;
  if (!style) throw new TypeError("Illegal invocation");
  if (typeof style !== "function") return style;
  const declaration = style();
  Reflect.set(declaration, "_parentRule", rule);
  record.declaration = declaration;
  return declaration;
}

type KeyframeEntry = Extract<Rule, { kind: "keyframe" }>;
type SheetMedia = {
  readonly [index: number]: string | undefined;
  readonly length: number;
  mediaText: string;
  item(index: number): string | null;
  appendMedium(medium: string): void;
  deleteMedium(medium: string): void;
};
type Sheet = {
  readonly type: string;
  get media(): SheetMedia;
  set media(value: string);
  readonly cssRules: RuleList;
  readonly rules: RuleList;
  readonly ownerNode: object | null;
  readonly ownerRule: (ImportRule & RuleParents) | null;
  readonly parentStyleSheet: Sheet | null;
  readonly title: string | null;
  readonly href: string | null;
  disabled: boolean;
  insertRule(rule: string, index?: number): number;
  deleteRule(index: number): void;
  addRule(selector?: string, style?: string, index?: number): number;
  removeRule(index?: number): void;
  replaceSync(text: string): void;
  replace(text: string): Promise<Sheet>;
};
const adopted = new WeakMap<Raw.ParentNode, { values: Sheet[]; view: Sheet[] }>();
const constructedSheetDocuments = new WeakMap<Sheet, Raw.Document>();
let didAdoptStylesheets = false;

/** Indicates whether node adoption needs to look for adopted stylesheets. */
export function hasAdoptedStylesheets(): boolean {
  return didAdoptStylesheets;
}

/** Clears a shadow root's existing observable list without replacing it. */
export function clearAdoptedStylesheets(root: Raw.ParentNode): void {
  const state = adopted.get(root);
  if (state) state.values.length = 0;
}

type SheetRecord = { text: string; sheet: Sheet; rules: Rule[]; errors: string[] };

const dimensionProperties = new Set([
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
]);

const borderSides = ["top", "right", "bottom", "left"] as const;
const borderSideColors = new Set(borderSides.map((side) => `border-${side}-color`));
const logicalBorderColors = [
  "border-block-start-color",
  "border-block-end-color",
  "border-inline-start-color",
  "border-inline-end-color",
] as const;
const logicalBorderColorNames = new Set<string>(logicalBorderColors);
const logicalBorderColorShorthands = new Map<string, readonly [string, string]>([
  ["border-block-color", ["border-block-start-color", "border-block-end-color"]],
  ["border-inline-color", ["border-inline-start-color", "border-inline-end-color"]],
]);

function splitLogicalBorderColors(
  name: string,
  value: string,
): readonly [string, string] | undefined {
  const {
    parsePropertyValue,
  }: {
    parsePropertyValue: (name: string, value: string) => unknown;
  } = require("./css-runtime.cjs").cssStyle;
  if (!Array.isArray(parsePropertyValue(name, value))) return undefined;
  const { parse }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  try {
    const syntax = parse(value, { context: "value", positions: true });
    if (syntax.type !== "Value") return undefined;
    const [first, second] = syntax.children.toArray();
    if (!first?.loc) return undefined;
    const start = value.slice(first.loc.start.offset, first.loc.end.offset);
    const end = second?.loc ? value.slice(second.loc.start.offset, second.loc.end.offset) : start;
    return [start, end];
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return undefined;
  }
}

const borderColorSourceOrder = new WeakMap<object, Map<string, number>>();

type CascadePriority = {
  context: number;
  layer?: number;
  layerIndex?: number;
  weight: number;
  proximity?: number;
  block?: number;
  order?: number;
};

function outranks(candidate: CascadePriority, incumbent: CascadePriority): boolean {
  if (candidate.context !== incumbent.context) return candidate.context > incumbent.context;
  if (candidate.layer !== incumbent.layer) {
    const unlayered = candidate.context >= 2 ? -Infinity : Infinity;
    const candidateLayer = candidate.layer ?? unlayered;
    const incumbentLayer = incumbent.layer ?? unlayered;
    if (candidateLayer !== incumbentLayer) return candidateLayer > incumbentLayer;
  }
  if (candidate.weight !== incumbent.weight) return candidate.weight > incumbent.weight;
  const candidateDistance = candidate.proximity ?? Infinity;
  const incumbentDistance = incumbent.proximity ?? Infinity;
  if (candidateDistance !== incumbentDistance) return candidateDistance < incumbentDistance;
  if (candidate.block !== incumbent.block) return (candidate.block ?? 0) > (incumbent.block ?? 0);
  return (candidate.order ?? 0) > (incumbent.order ?? 0);
}

function physicalBorderSides(writingMode: string, rtl: boolean): readonly string[] {
  if (!writingMode || writingMode === "horizontal-tb") {
    return rtl ? ["top", "bottom", "right", "left"] : ["top", "bottom", "left", "right"];
  }
  const leftward = writingMode.endsWith("-rl");
  const startsAtBottom = rtl !== (writingMode === "sideways-lr");
  return [
    leftward ? "right" : "left",
    leftward ? "left" : "right",
    startsAtBottom ? "bottom" : "top",
    startsAtBottom ? "top" : "bottom",
  ];
}

const borderWidthStyles = new Map(
  borderSides.map((side) => [`border-${side}-width`, `border-${side}-style`]),
);

const borderSideStyles = new Set(borderWidthStyles.values());
const borderSideShorthands = new Set(borderSides.map((side) => `border-${side}`));
const borderShorthands = new Set([
  "border",
  "border-width",
  "border-style",
  "border-color",
  ...borderSideShorthands,
]);

function serializeBox(top: string, right: string, bottom: string, left: string): string {
  if (left !== right) return `${top} ${right} ${bottom} ${left}`;
  if (bottom !== top) return `${top} ${right} ${bottom}`;
  return right === top ? top : `${top} ${right}`;
}

const backgroundPositionAxes = ["background-position-x", "background-position-y"] as const;

const boxShorthands = new Set(["margin", "padding"]);
const boxLonghands = new Set(
  [...boxShorthands].flatMap((property) => borderSides.map((side) => `${property}-${side}`)),
);
const flexLonghands = ["flex-grow", "flex-shrink", "flex-basis"];
const outlineLonghands = ["outline-width", "outline-style", "outline-color"] as const;
const outlineProperties = new Set<string>(["outline", ...outlineLonghands]);
let publicDeclarationProperties: readonly StyleProperty[] | undefined;
function declarationProperties(): readonly StyleProperty[] {
  if (publicDeclarationProperties) return publicDeclarationProperties;
  const vendorNames: readonly string[] = require("./css-property-names.cjs");
  const aliases = (name: string) => [
    name,
    name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
  ];
  const overrides = [
    "font",
    "background",
    ...[...outlineProperties, ...dimensionProperties].flatMap(aliases),
  ].filter((name) => vendorNames.includes(name));
  const names = new Set([...overrides, "size", ...vendorNames]);
  return (publicDeclarationProperties = Array.from(names, (name) => ({
    name,
    property:
      name === "cssFloat"
        ? "float"
        : name
            .replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase())
            .replace(/^webkit-/, "-webkit-"),
  })));
}
const deferredShorthandLonghands = new Map<string, readonly string[]>([
  ["margin", borderSides.map((side) => `margin-${side}`)],
  ["padding", borderSides.map((side) => `padding-${side}`)],
  ["flex", flexLonghands],
  [
    "background",
    [
      "background-image",
      "background-position-x",
      "background-position-y",
      "background-size",
      "background-repeat-x",
      "background-repeat-y",
      "background-attachment",
      "background-origin",
      "background-clip",
      "background-color",
      "background-blend-mode",
    ],
  ],
  ["background-position", backgroundPositionAxes],
  ["outline", outlineLonghands],
  [
    "border",
    borderSides.flatMap((side) =>
      ["width", "style", "color"].map((part) => `border-${side}-${part}`),
    ),
  ],
  ...borderSides.map((side): [string, string[]] => [
    `border-${side}`,
    ["width", "style", "color"].map((part) => `border-${side}-${part}`),
  ]),
  ...["width", "style", "color"].map((part): [string, string[]] => [
    `border-${part}`,
    borderSides.map((side) => `border-${side}-${part}`),
  ]),
]);

function cssLayers(value: string): string[][] {
  if (!value) return [];
  const { parse, generate }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  try {
    const ast = parse(value, { context: "value" });
    if (ast.type !== "Value") return [];
    const layers: string[][] = [];
    let layer: string[] = [];
    ast.children.forEach((part) => {
      if (part.type === "Operator" && part.value === ",") {
        layers.push(layer);
        layer = [];
      } else layer.push(generate(part));
    });
    layers.push(layer);
    return layers;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return [];
  }
}

function cssLayerValues(value: string): string[] {
  const { parse }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  const ast = parse(value, { context: "value", positions: true });
  if (ast.type !== "Value") return [];
  const layers: string[] = [];
  let start = 0;
  for (const node of ast.children) {
    if (node.type !== "Operator" || node.value !== "," || !node.loc) continue;
    layers.push(value.slice(start, node.loc.start.offset).trim());
    start = node.loc.end.offset;
  }
  layers.push(value.slice(start).trim());
  return layers;
}

function splitBackgroundPosition(value: string): [string, string] | undefined {
  if (/^(?:inherit|initial|unset|revert(?:-layer)?)$/i.test(value)) return [value, value];
  const layers = cssLayers(value);
  if (!layers.length) return;
  const horizontal: string[] = [];
  const vertical: string[] = [];
  for (const [first, second, third, fourth] of layers) {
    if (!first || !second) return;
    if (fourth || (third && /^(?:top|bottom|center)$/.test(third))) {
      horizontal.push(`${first} ${second}`);
      vertical.push(fourth ? `${third} ${fourth}` : (third ?? "center"));
    } else {
      horizontal.push(first);
      vertical.push(third ? `${second} ${third}` : second);
    }
  }
  return [horizontal.join(", "), vertical.join(", ")];
}

function computePositionAxis(value: string): string {
  return cssLayers(value)
    .map(([edge, offset]) => {
      if (edge === "center") return "50%";
      if (edge === "left" || edge === "top") return offset ?? "0%";
      if (edge === "right" || edge === "bottom")
        return offset ? simplifyCSSCalculation(`calc(100% - ${offset})`) : "100%";
      return edge ?? "0%";
    })
    .join(", ");
}

const computedInitialValues = new Map([
  ["background-color", "rgba(0, 0, 0, 0)"],
  ["display", "inline"],
  ["continue", "normal"],
  ["content-visibility", "visible"],
  ["border-image", "none"],
  ["background-image", "none"],
  ["background-position-x", "0%"],
  ["background-position-y", "0%"],
  ["box-shadow", "currentcolor none"],
  ["color-scheme", "normal"],
  ["fill", "rgb(0, 0, 0)"],
  ["flex-basis", "auto"],
  ["flex-grow", "0"],
  ["flex-shrink", "1"],
  ["font-family", "monospace"],
  ["font-size", "16px"],
  ["font-style", "normal"],
  ["font-variant", "normal"],
  ["font-weight", "400"],
  ["font-stretch", "100%"],
  ["font-width", "100%"],
  ["line-height", "normal"],
  ["grid-row", "auto"],
  ["opacity", "1"],
  ["z-index", "auto"],
  ["overflow", "visible"],
  ["overflow-x", "visible"],
  ["overflow-y", "visible"],
  ["outline-style", "none"],
  ["outline-width", "3px"],
  ["outline-offset", "0px"],
  ["outline-color", "currentcolor"],
  ["stroke", "none"],
  ["visibility", "visible"],
  ...[...boxLonghands].map((name): [string, string] => [name, "0px"]),
]);

function splitOutline(value: string): ReadonlyMap<string, string> | undefined {
  const keyword = value.toLowerCase();
  if (/^(?:initial|inherit|unset|revert(?:-layer)?)$/.test(keyword))
    return new Map(outlineLonghands.map((name) => [name, keyword]));
  const {
    lexer,
    parse,
    generate,
  }: Pick<typeof import("css-tree"), "parse" | "generate"> & {
    lexer: {
      matchProperty(
        name: string,
        value: CssNode,
      ): {
        error: unknown;
        getTrace(node: CssNode): { type: string; name: string }[] | null;
      };
    };
  } = require("./css-runtime.cjs").cssTree;
  let syntax: CssNode;
  try {
    syntax = parse(value, { context: "value" });
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return;
  }
  if (syntax.type !== "Value") return;
  const match = lexer.matchProperty("outline", syntax);
  if (match.error !== null) return;
  const components = new Map<string, string>();
  for (const node of syntax.children) {
    const trace = match.getTrace(node);
    const name = outlineLonghands.find((property) =>
      trace?.some((term) => term.type === "Property" && term.name === property),
    );
    if (!name) return;
    const component = generate(node);
    if (name === "outline-width" && Number.parseFloat(component) < 0) return;
    components.set(name, name === "outline-width" && node.type === "Number" ? "0px" : component);
  }
  if (!components.has("outline-width")) components.set("outline-width", "medium");
  if (!components.has("outline-style")) components.set("outline-style", "none");
  if (!components.has("outline-color"))
    components.set(
      "outline-color",
      components.get("outline-style") === "auto" ? "auto" : "currentcolor",
    );
  return components;
}

/** A CSS-wide keyword is one identifier token, including escaped spellings. */
function canonicalWideKeyword(value: string): string {
  if (!value.includes("/*") && !value.includes("\\")) return value;
  const css: typeof import("css-tree") & CSSTokenizer = require("./css-runtime.cjs").cssTree;
  let identifier: string | undefined;
  let other = false;
  css.tokenize(value, (type, start, end) => {
    if (type === css.tokenTypes.WhiteSpace || type === css.tokenTypes.Comment) return;
    if (type !== css.tokenTypes.Ident || identifier !== undefined) other = true;
    else identifier = css.ident.decode(value.slice(start, end)).toLowerCase();
  });
  return !other &&
    identifier &&
    /^(?:inherit|initial|unset|revert(?:-layer|-rule)?)$/.test(identifier)
    ? identifier
    : value;
}

function normalizeFontLineHeight(value: string): string {
  if (!/\b\d{1,4}\s/.test(value)) return value;
  const {
    parse,
    lexer,
  }: Pick<typeof import("css-tree"), "parse"> & {
    lexer: {
      matchProperty(
        name: string,
        value: CssNode,
      ): {
        error: unknown;
        getTrace(node: CssNode): { type: string; name: string }[] | null;
      };
    };
  } = require("./css-runtime.cjs").cssTree;
  try {
    const ast = parse(value, { context: "value", positions: true });
    if (
      ast.type !== "Value" ||
      ast.children.some((node) => node.type === "Operator" && node.value === "/")
    )
      return value;
    if (!ast.children.some((node) => node.type === "Number")) return value;
    const match = lexer.matchProperty("font", ast);
    if (match.error !== null) return value;
    const size = ast.children
      .toArray()
      .find((node) =>
        match.getTrace(node)?.some((term) => term.type === "Property" && term.name === "font-size"),
      );
    const end = size?.loc?.end.offset;
    return end === undefined ? value : `${value.slice(0, end)} / normal${value.slice(end)}`;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return value;
  }
}

// The color parser validates each whole gradient and resolves its color stops.
// CSSOM orders the interpolation method after the shape or direction.
function serializeGradientImages(
  value: string,
  context?: { currentColor: string; colorScheme: string },
): string {
  const { resolveGradient, utils }: typeof import("@asamuzakjp/css-color") =
    require("./css-runtime.cjs").cssColor;
  return utils
    .splitValue(value, { delimiter: "," })
    .map((layer) => {
      const match = /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/i.exec(layer);
      if (!match) return layer;
      const options = { format: context ? "computedValue" : "specifiedValue", ...context };
      const args = utils.splitValue(layer.slice(match[0].length, -1), { delimiter: "," });
      let source = layer;
      if (args[0]?.startsWith("in ")) {
        const header = utils.splitValue(args[0]);
        const method = header.splice(0, header[3] === "hue" ? 4 : 2);
        if (header.length) {
          const { lexer }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
          if (lexer.matchProperty("background-image", layer).error) return layer;
          args[0] = [...header, ...method].join(" ");
          source = match[0] + args.join(", ") + ")";
        }
      }
      const gradient = resolveGradient(source, options);
      if (!gradient || gradient === "none") return layer;
      const open = gradient.indexOf("(");
      const parts = utils.splitValue(gradient.slice(open + 1, -1), { delimiter: "," });
      const first = parts[0];
      if (!first) return gradient;
      const words = utils.splitValue(first);
      const index = words.indexOf("in");
      if (index >= 0 && words[index + 1]) {
        const hasHue = words[index + 3] === "hue";
        const [, space, hue] = words.splice(index, hasHue ? 4 : 2);
        const sourceStops = args.slice(1);
        const modern = sourceStops.some((stop) => /^(?:color|lab|lch|oklab|oklch)\(/i.test(stop));
        const legacy = sourceStops.every((stop) => {
          const token = utils.splitValue(stop)[0] ?? "";
          return (
            /^#|^[+.\-\d]|^(?:rgb|hsl)a?\([^)]*,/i.test(token) ||
            (/^[a-z]+$/i.test(token) &&
              token.toLowerCase() !== "currentcolor" &&
              !systemColor(token, "normal"))
          );
        });
        if (
          (hue && hue !== "shorter") ||
          !((space === "srgb" && legacy) || (space === "oklab" && modern))
        ) {
          words.push("in", space === "xyz" ? "xyz-d65" : space!);
          if (hue && hue !== "shorter") words.push(hue, "hue");
        }
      }
      if (context) {
        const at = words.indexOf("at");
        if (at >= 0) {
          const end = words.indexOf("in", at);
          const position = words.slice(at + 1, end < 0 ? words.length : end);
          const axes = splitBackgroundPosition(canonicalBackgroundPosition(position.join(" ")));
          if (axes) words.splice(at + 1, position.length, ...axes.map(computePositionAxis));
        }
      }
      parts[0] = words.join(" ");
      return gradient.slice(0, open + 1) + parts.filter(Boolean).join(", ") + ")";
    })
    .join(", ");
}

function canonicalBackgroundPosition(value: string): string {
  if (
    variableSyntax.test(value) ||
    /^(?:inherit|initial|unset|revert(?:-layer)?)$/i.test(value.trim())
  )
    return value;
  return cssLayers(value)
    .map((parts) => {
      const first = parts[0];
      if (parts.length !== 1 || !first) return parts.join(" ");
      return first === "top" || first === "bottom" ? `center ${first}` : `${first} center`;
    })
    .join(", ");
}

// The grammar owns validation and token classification; this adapter only groups
// already-matched background components for the pinned declaration provider.
function splitBackground(value: string): ReadonlyMap<string, string>[] | undefined {
  const {
    parse,
    generate,
    lexer,
  }: Pick<typeof import("css-tree"), "parse" | "generate"> & {
    lexer: {
      matchProperty(
        name: string,
        ast: CssNode,
      ): {
        error: unknown;
        getTrace(node: CssNode): { name: string }[] | null;
      };
    };
  } = require("./css-runtime.cjs").cssTree;
  try {
    const ast = parse(value, { context: "value" });
    if (ast.type !== "Value") return;
    const match = lexer.matchProperty("background", ast);
    if (match.error !== null) return;
    const layers: Map<string, string>[] = [new Map()];
    let layer = layers[0];
    for (const node of ast.children) {
      if (node.type === "Operator" && node.value === ",") {
        layer = new Map();
        layers.push(layer);
        continue;
      }
      if (!layer || (node.type === "Operator" && node.value === "/")) continue;
      const names = new Set(match.getTrace(node)?.map((term) => term.name));
      let property = "";
      if (names.has("bg-image")) property = "background-image";
      else if (names.has("bg-position")) property = "background-position";
      else if (names.has("bg-size")) property = "background-size";
      else if (names.has("repeat-style")) property = "background-repeat";
      else if (names.has("attachment")) property = "background-attachment";
      else if (names.has("background-color")) property = "background-color";
      else if (names.has("visual-box"))
        property = layer.has("background-origin") ? "background-clip" : "background-origin";
      if (!property) continue;
      const previous = layer.get(property);
      const part = generate(node);
      layer.set(property, previous ? `${previous} ${part}` : part);
    }
    for (const entry of layers) {
      const origin = entry.get("background-origin");
      if (origin && !entry.has("background-clip")) entry.set("background-clip", origin);
    }
    return layers;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return;
  }
}

type StyleMutationOperations = {
  setProperty: DeclarationFields["setProperty"];
  removeProperty: DeclarationFields["removeProperty"];
  setText: ((value: string) => void) | undefined;
};
const styleMutationOwners = new WeakMap<object, StyleMutationOperations>();

function writeStyleProperty(
  receiver: DeclarationImplementation,
  name: string,
  value: string,
): void {
  const owner = styleMutationOwners.get(receiver);
  if (!owner) throw new TypeError("Illegal invocation");
  owner.setProperty.call(receiver, name, value, requestedStyleWrites.get(receiver)?.priority ?? "");
}

function writePublicStyleProperty(
  style: DeclarationImplementation,
  name: string,
  property: string,
  value: unknown,
): void {
  if (name === "font") {
    writeStyleProperty(style, property, normalizeFontLineHeight(value === null ? "" : `${value}`));
  } else if (
    name === "background" ||
    outlineProperties.has(property) ||
    dimensionProperties.has(property)
  ) {
    writeStyleProperty(style, property, value === null ? "" : `${value}`);
  } else {
    writeStyleProperty(style, property, cssInput(value, false));
  }
}

const requestedStyleWrites = new WeakMap<object, { property: string; priority: string }>();

function cssInput(value: unknown, replaceEscapedEOF = true): string {
  if (value === null) return "";
  if (typeof value === "symbol") throw new TypeError("Cannot convert a Symbol to a string");
  const text = String(value).toWellFormed();
  const normalized = /[\0\r\f]/.test(text)
    ? text.replace(/\r\n?|\f/g, "\n").replace(/\0/g, "\uFFFD")
    : text;
  return replaceEscapedEOF && normalized.endsWith("\\")
    ? normalized.slice(0, -1) + "\uFFFD"
    : normalized;
}

const cssNumericToken = /^[+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?$/i;

function normalizePropertyInput(property: string, value: string): string {
  if (property.startsWith("--") || /var\(/i.test(value)) return value;
  const name = property.toLowerCase();
  const text = value.trim();
  if (name === "background-image" && /-gradient\(/i.test(text))
    return serializeGradientImages(text);
  if (name === "aspect-ratio" && cssNumericToken.test(text) && Number(text) >= 0)
    return `${Number(text)} / 1`;
  if (cssNumericToken.test(text) && Number(text) === 0) return "0";
  if (name !== "flex" && !borderShorthands.has(name)) return value;
  const { parse, generate }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  try {
    const ast = parse(value, { context: "value" });
    if (ast.type !== "Value") return value;
    const parts = ast.children.toArray();
    const [grow, shrink, basis] = parts;
    if (
      name === "flex" &&
      parts.length === 3 &&
      grow?.type === "Number" &&
      shrink?.type === "Number" &&
      basis?.type === "Number" &&
      Number(basis.value) === 0
    )
      return `${grow.value} ${shrink.value} 0px`;
    if (name === "flex") return value;
    return parts
      .map((part) => {
        if (part.type === "Number" && Number(part.value) === 0) return "0";
        if (part.type === "Url") {
          const { string }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
          return `url(${string.encode(part.value)})`;
        }
        const text = generate(part);
        if (part.type === "Function" && /calc\(/i.test(text) && !/currentcolor/i.test(text)) {
          const { resolve }: typeof import("@asamuzakjp/css-color") =
            require("./css-runtime.cjs").cssColor;
          return resolve(text, { nullable: true }) ?? text;
        }
        return text;
      })
      .join(" ");
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return value;
  }
}

const flattenedCSSLonghands = new Map<string, readonly string[]>();
function shorthandLonghands(
  name: string,
  definitions: ReadonlyMap<string, { longhands?: readonly string[] }>,
): readonly string[] {
  const children = definitions.get(name)?.longhands;
  if (!children) return [];
  const cached = flattenedCSSLonghands.get(name);
  if (cached) return cached;
  const pending = [...children];
  const visited = new Set<string>();
  // Every visited property belongs to the finite, acyclic CSS definition table.
  while (pending.length) {
    const child = pending.pop();
    if (!child || visited.has(child)) continue;
    visited.add(child);
    const nested = definitions.get(child)?.longhands;
    if (nested) pending.push(...nested);
  }
  if (name === "background") visited.add("background-blend-mode");
  const result = [...visited];
  flattenedCSSLonghands.set(name, result);
  return result;
}

type DeclarationBlock = {
  values: ReadonlyMap<string, string>;
  priorities: ReadonlyMap<string, string>;
  properties: readonly string[];
  borderOrder: ReadonlyMap<string, number> | undefined;
  lastBorderOrder: number;
};

function createDeclarationInterface(key: symbol, views: ReturnType<typeof createDeclarationViews>) {
  type BaseDeclaration = DeclarationFields & {
    [index: number]: string;
    _length: number;
    _propertyIndices: Map<string, number>;
    _computed: boolean;
    _priorities: Map<string, string>;
    _values: Map<string, string>;
    _global: Pick<typeof globalThis, "DOMException" | "TypeError">;
    _ownerNode: object | null;
    _parentRule: object | null;
    _readonly: boolean;
    _updating: boolean;
    _onChange: ((text: string) => void) | undefined;
    _setProperty(property: string, value: string, priority: string): void;
    _borderSetter(property: string, value: unknown, priority: string | undefined): void;
    _positionLonghandSetter(
      property: string,
      value: string,
      priority: string | undefined,
      shorthand: string,
    ): void;
    _flexBoxSetter(
      property: string,
      value: string,
      priority: string | undefined,
      shorthand: string,
    ): void;
  };
  const {
    CSSStyleDeclaration: Base,
    parsePropertyValue,
    propertyDefinitions,
  }: {
    CSSStyleDeclaration: new (changed?: (text: string) => void) => BaseDeclaration;
    parsePropertyValue: (property: string, value: string) => unknown;
    propertyDefinitions: ReadonlyMap<
      string,
      {
        longhands?: readonly string[];
        initial?: string;
        inherited?: string;
        legacyAliasOf?: string;
      }
    >;
  } = require("./css-runtime.cjs").cssStyle;
  // Preserve the vendor class name when the dependency bundler renames its binding.
  Object.defineProperty(Base, "name", { value: "CSSStyleDeclaration", configurable: true });
  initializeDeclarationMetadata(propertyDefinitions);

  function canonicalProperty(name: string): string {
    return propertyDefinitions.get(name)?.legacyAliasOf ?? name;
  }

  function unresolvedMathValue(property: string, value: string): string | undefined {
    if (!/\b(?:calc|min|max|clamp)\(/i.test(value) || /var\(/i.test(value)) return undefined;
    const { parse, walk, generate, lexer }: typeof import("css-tree") =
      require("./css-runtime.cjs").cssTree;
    try {
      const ast = parse(value, { context: "value" });
      if (lexer.matchProperty(property, ast).error !== null) return undefined;
      const percentageHint = parsePropertyValue(property, "1%") !== undefined;
      // Validate arithmetic with compatible representative lengths; retain the
      // original units and complete track list for computed-value context.
      walk(ast, (node, item) => {
        if (node.type === "Dimension" && lexer.matchType("length", node).error === null)
          node.unit = "px";
        else if (node.type === "Percentage" && percentageHint)
          item.data = { type: "Dimension", value: node.value, unit: "px" };
      });
      const { utils }: typeof import("@asamuzakjp/css-color") =
        require("./css-runtime.cjs").cssColor;
      walk(ast, {
        visit: "Function",
        leave(node, item) {
          if (!/^(?:calc|min|max|clamp)$/i.test(node.name)) return;
          const source = generate(node);
          const resolved = utils.cssCalc(source);
          if (resolved === source) return;
          const parsed = parse(resolved, { context: "value" });
          if (parsed.type === "Value" && parsed.children.size === 1 && parsed.children.first)
            item.data = parsed.children.first;
        },
      });
      const validation = new Base();
      validation.setProperty(property, generate(ast));
      return validation.getPropertyValue(property) ? serializeCSSMath(value) : undefined;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return undefined;
    }
  }

  function serializeOutline(text: string, shorthand: string, priority: string): string {
    const { parse }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
    const list = parse(text, { context: "declarationList", parseValue: false, positions: true });
    if (list.type !== "DeclarationList") return text;
    const output: string[] = [];
    let emitted = false;
    for (const node of list.children) {
      if (node.type !== "Declaration" || !node.loc) return text;
      if (outlineProperties.has(node.property)) {
        if (!emitted) output.push(`outline: ${shorthand}${priority ? " !important" : ""};`);
        emitted = true;
      } else {
        output.push(text.slice(node.loc.start.offset, node.loc.end.offset) + ";");
      }
    }
    return emitted ? output.join(" ") : text;
  }

  class CSSStyleDeclaration extends Base {
    constructor(token: symbol, onChange?: (text: string) => void) {
      if (token !== key) throw new TypeError("Illegal constructor");
      super(onChange);
      views.register(this, new.target === CSSStyleProperties);
      styleMutationOwners.set(this, mutationOperations);
    }
    #writeRevision = 0;
    #precisionRevision = 0;

    override _setProperty(property: string, value: string, priority?: string): void {
      if (calculationSources?.get(this)?.delete(property)) this.#precisionRevision++;
      shorthandSources?.get(this)?.delete(property);
      if (value && urlDependentValue.test(value)) {
        const reader = inlineBaseReaders.get(this);
        if (reader && !(property.startsWith("--") && this._values.get(property) === value)) {
          declarationBases ??= new WeakMap();
          let bases = declarationBases.get(this);
          if (!bases) declarationBases.set(this, (bases = new Map()));
          const base = reader();
          if (bases.get(property) !== base) this.#precisionRevision++;
          bases.set(property, base);
        }
      } else declarationBases?.get(this)?.delete(property);
      const requested = requestedStyleWrites.get(this);
      if (requested?.property === property) priority = requested.priority;
      else priority ??= requested?.priority ?? "";
      if (
        !this._readonly &&
        this._values.has("font") &&
        (property.startsWith("font-") || property === "line-height")
      )
        super.removeProperty("font");
      if (
        !this._readonly &&
        property.startsWith("text-decoration-") &&
        this._values.has("text-decoration")
      )
        super.removeProperty("text-decoration");
      if (typeof value === "string" && value !== "") this.#writeRevision++;
      if (
        value &&
        (borderSideColors.has(property) ||
          logicalBorderColorNames.has(property) ||
          logicalBorderColorShorthands.has(property))
      ) {
        let order = borderColorSourceOrder.get(this);
        if (!order) borderColorSourceOrder.set(this, (order = new Map()));
        order.set(property, (this.#borderColorOrder += 1));
      }
      if (logicalBorderColorShorthands.has(property) && !variableSyntax.test(value)) {
        const colors = splitLogicalBorderColors(property, value);
        if (colors && colors[0] === colors[1]) value = colors[0];
      }
      super._setProperty(property, value, priority);
    }
    override _borderSetter(property: string, value: unknown, priority: string | undefined): void {
      const requested = requestedStyleWrites.get(this);
      super._borderSetter(
        property,
        value,
        requested?.property === property ? requested.priority : priority,
      );
    }
    override _positionLonghandSetter(
      property: string,
      value: string,
      priority: string | undefined,
      shorthand: string,
    ): void {
      const requested = requestedStyleWrites.get(this);
      super._positionLonghandSetter(
        property,
        value,
        requested?.property === property ? requested.priority : priority,
        shorthand,
      );
    }
    override _flexBoxSetter(
      property: string,
      value: string,
      priority: string | undefined,
      shorthand: string,
    ): void {
      const requested = requestedStyleWrites.get(this);
      super._flexBoxSetter(
        property,
        value,
        requested?.property === property ? requested.priority : priority,
        shorthand,
      );
    }
    #borderColorOrder = 0;
    snapshotBlock(limit = 96, characterLimit = 8192): DeclarationBlock | undefined {
      if (shorthandSources?.get(this)?.size || calculationSources?.get(this)?.size) return;
      if (this._values.size > limit || this._length > limit || this._priorities.size > limit)
        return;
      let characters = 0;
      for (const [name, value] of this._values) characters += name.length + value.length;
      if (characters > characterLimit) return;
      return {
        values: new Map(this._values),
        priorities: new Map(this._priorities),
        properties: Array.from({ length: this._length }, (_, index) => this[index] ?? ""),
        borderOrder: borderColorSourceOrder.get(this) && new Map(borderColorSourceOrder.get(this)),
        lastBorderOrder: this.#borderColorOrder,
      };
    }

    restoreBlock(block: DeclarationBlock): void {
      this._values = new Map(block.values);
      this._priorities = new Map(block.priorities);
      this._length = block.properties.length;
      for (const [index, name] of block.properties.entries()) {
        this[index] = name;
        this._propertyIndices.set(name, index);
      }
      this.#borderColorOrder = block.lastBorderOrder;
      if (block.borderOrder) borderColorSourceOrder.set(this, new Map(block.borderOrder));
    }
    override get cssText(): string {
      const ordered = orderedStyles.get(this);
      if (ordered) return ordered.cssText;
      let text = super.cssText;
      if (shorthandSources?.get(this)?.size) {
        // CSSOM deliberately hides the value of a longhand with a pending shorthand.
        // Feed its specified source into the serializer while preserving original order.
        const declarations: string[] = [];
        for (let i = 0; i < this._length; i++) {
          const name = this[i];
          if (!name) continue;
          const value = shorthandSources?.get(this)?.has(name)
            ? "initial"
            : super.getPropertyValue(name);
          declarations.push(
            name + ": " + value + (super.getPropertyPriority(name) ? " !important;" : ";"),
          );
        }
        text = serializeDeclarationBlock(declarations.join(" "), shorthandSources?.get(this));
      } else if (
        /(?:^|; )(?:(?:column|row)-rule-(?:width|style|color|inset)|grid-(?:template|auto)|corner-|border-(?:top|bottom)-(?:left|right)-radius|animation-range-)/.test(
          text,
        )
      )
        text = serializeDeclarationBlock(text);
      if (
        this._values.has("background") &&
        this._values.get("background-blend-mode") === "normal" &&
        super.getPropertyPriority("background") ===
          super.getPropertyPriority("background-blend-mode")
      )
        text = text
          .replace(/(?:^|; )background-blend-mode: normal(?: !important)?;(?= |$)/, (match) =>
            match.startsWith(";") ? ";" : "",
          )
          .trim();
      if (!text) return text;
      // Only a serialized physical border can be replaced in the declaration list below.
      const border = text.includes("border")
        ? serializePhysicalBorder((name) => ({
            value: super.getPropertyValue(name),
            priority: super.getPropertyPriority(name),
          }))
        : undefined;
      if (border?.length) {
        const mixedParts =
          border.some((entry) =>
            /^border-(?:top|right|bottom|left)-(?:width|style|color)$/.test(entry.property),
          ) && border.some((entry) => borderShorthands.has(entry.property));
        const uniformPriority = border.every((entry) => entry.priority === border[0]?.priority);
        const position = (property: string): number =>
          this._propertyIndices.get(property) ??
          Math.min(
            ...shorthandLonghands(property, propertyDefinitions).map(
              (name) => this._propertyIndices.get(name) ?? Infinity,
            ),
          );
        const ordered =
          mixedParts && uniformPriority
            ? border.toSorted((left, right) => position(left.property) - position(right.property))
            : border;
        const { parse }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
        const ast = parse(text, { context: "declarationList", parseValue: false, positions: true });
        if (ast.type === "DeclarationList") {
          const output: string[] = [];
          let emitted = false;
          for (const node of ast.children) {
            if (node.type !== "Declaration" || !node.loc) continue;
            if (isPhysicalBorder(node.property)) {
              if (!emitted)
                for (const entry of ordered)
                  output.push(
                    `${entry.property}: ${entry.value}${entry.priority ? " !important" : ""};`,
                  );
              emitted = true;
            } else output.push(text.slice(node.loc.start.offset, node.loc.end.offset) + ";");
          }
          if (emitted) {
            text = output.join(" ");
            if (this._values.has("border-image") && /(?:^|; )border-image-source:/.test(text))
              text = serializeDeclarationBlock(text);
          }
        }
      }
      if (!super.getPropertyValue("outline-width") || super.getPropertyValue("outline"))
        return text;
      const shorthand = this.getPropertyValue("outline");
      return shorthand
        ? serializeOutline(text, shorthand, this.getPropertyPriority("outline"))
        : text;
    }
    #updateStyle<T>(write: () => T, publish: "changed" | "always" = "changed"): T {
      const changed = this._onChange;
      if (!changed || this._updating) return write();
      const before = this.cssText;
      const precisionRevision = this.#precisionRevision;
      this._onChange = undefined;
      let result: T;
      try {
        result = write();
      } finally {
        this._onChange = changed;
      }
      const after = this.cssText;
      if (publish === "always" || after !== before || precisionRevision !== this.#precisionRevision)
        changed(after);
      return result;
    }
    override removeProperty(property: string): string {
      const owner = styleMutationOwners.get(this);
      if (owner !== mutationOperations) {
        if (!owner) throw new TypeError("Illegal invocation");
        return owner.removeProperty.call(this, property);
      }
      const name = canonicalProperty(cssInput(property));
      if (this._readonly)
        throw new this._global.DOMException(
          `Cannot remove property "${property}" from a read-only style declaration.`,
          "NoModificationAllowedError",
        );
      // Native shorthand setters remove their serialized entry while rebuilding
      // longhands. Only a public removal expands to the complete declaration.
      if (requestedStyleWrites.has(this)) return super.removeProperty(name);
      return this.#updateStyle(() => {
        orderedStyles.get(this)?.removeProperty(name);
        return this.#removeProperty(name);
      });
    }
    override set cssText(text: string) {
      const owner = styleMutationOwners.get(this);
      if (owner !== mutationOperations) {
        if (!owner?.setText) throw new TypeError("Illegal invocation");
        owner.setText.call(this, text);
        return;
      }
      const value = cssInput(text);
      if (this._readonly) {
        throw new this._global.DOMException(
          "Cannot set cssText on a read-only style declaration.",
          "NoModificationAllowedError",
        );
      }
      const trackOrder =
        this._onChange &&
        /(?:margin|inset|border|padding)-(?:block|inline|start|end)-?/i.test(value);
      this.#updateStyle(() => {
        orderedStyles.delete(this);
        declarationBases?.delete(this);
        calculationSources?.delete(this);
        this.#setCSSText(value);
        if (trackOrder) orderedStyles.set(this, orderedDeclaration(value));
        // Priorities must refer to entries in the finite parsed declaration block.
        for (const name of this._priorities.keys())
          if (!this._values.has(name)) this._priorities.delete(name);
      }, "always");
    }
    #setCSSText(text: string): void {
      if (this._readonly) {
        super.cssText = text;
        return;
      }
      // Clear through the dependency, then own declaration ordering and importance.
      shorthandSources?.get(this)?.clear();
      super.cssText = "";
      const { parse, generate }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
      let list: CssNode;
      try {
        list = parse(text, { context: "declarationList", parseValue: false });
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return;
      }
      if (list.type !== "DeclarationList") return;
      let skipAfterRule = false;
      list.children.forEach((node) => {
        if (node.type === "Atrule") return;
        if (node.type === "Rule") {
          skipAfterRule = true;
          return;
        }
        // Declaration-list recovery consumes the next item after a qualified rule.
        if (skipAfterRule) {
          skipAfterRule = false;
          return;
        }
        if (node.type !== "Declaration") return;
        const name = node.property.startsWith("--")
          ? node.property
          : canonicalProperty(node.property.toLowerCase());
        const value = generate(node.value).trim();
        if (!value && name.startsWith("--") && name !== "--") {
          if (node.important || this._priorities.get(name) !== "important")
            this._setProperty(name, " ", node.important ? "important" : "");
          return;
        }
        if (!value || (!node.important && this._priorities.get(name) === "important")) return;
        let preserved: Map<string, string> | undefined;
        if (!node.important) {
          for (const child of shorthandLonghands(name, propertyDefinitions)) {
            const previous = this._values.get(child);
            if (previous !== undefined && this._priorities.get(child) === "important")
              (preserved ??= new Map()).set(child, previous);
          }
        }
        const revision = this.#writeRevision;
        mutationOperations.setProperty.call(this, name, value, node.important ? "important" : "");
        if (preserved && this.#writeRevision !== revision) {
          for (const [child, previous] of preserved)
            this._setProperty(child, previous, "important");
          super.removeProperty(name);
        }
      });
    }
    declare [Symbol.iterator]: () => ArrayIterator<string>;
    [setParsedOutline](value: string, priority: string, preserveImportant: boolean): void {
      const normalized = priority.toLowerCase();
      if (normalized && normalized !== "important") return;
      const pending = variableSyntax.test(value);
      const components = pending ? undefined : splitOutline(value);
      if (!pending && !components) return;
      const changed = this._onChange;
      const original = changed && !this._updating ? this.cssText : undefined;
      this._onChange = undefined;
      try {
        if (!preserveImportant || normalized || !super.getPropertyPriority("outline"))
          super.removeProperty("outline");
        for (const name of outlineLonghands) {
          if (preserveImportant && !normalized && super.getPropertyPriority(name)) continue;
          super.removeProperty(name);
          const component = components?.get(name);
          if (component === undefined) continue;
          if (name === "outline-color" && component.toLowerCase() !== "auto")
            super.setProperty(name, component, normalized);
          if (!super.getPropertyValue(name)) this._setProperty(name, component, normalized);
        }
        if (pending) this._setProperty("outline", value, normalized);
      } finally {
        this._onChange = changed;
      }
      if (original !== undefined && original !== this.cssText) changed?.(this.cssText);
    }
    #removeProperty(property: string): string {
      const name = property.toLowerCase();
      declarationBases?.get(this)?.delete(name);
      if (calculationSources?.get(this)?.delete(name)) this.#precisionRevision++;
      const longhands =
        name === "background-repeat"
          ? ["background-repeat-x", "background-repeat-y"]
          : name === "outline"
            ? outlineLonghands
            : (grammarLonghands(name) ?? shorthandLonghands(name, propertyDefinitions));
      if (this._readonly) return super.removeProperty(property);
      if (name.startsWith("background-") && super.getPropertyValue(name))
        super.removeProperty("background");
      if (!longhands.length && !isPhysicalBorder(name)) {
        shorthandSources?.get(this)?.delete(name);
        return super.removeProperty(property);
      }
      const previous = this.getPropertyValue(name);
      const changed = this._onChange;
      const original = changed && !this._updating ? this.cssText : undefined;
      this._onChange = undefined;
      try {
        super.removeProperty(name);
        for (const child of longhands) {
          calculationSources?.get(this)?.delete(child);
          shorthandSources?.get(this)?.delete(child);
          super.removeProperty(child);
        }
        if (isPhysicalBorder(name)) {
          const removed = new Set([name, ...longhands]);
          for (const parent of borderShorthands) {
            if (shorthandLonghands(parent, propertyDefinitions).some((child) => removed.has(child)))
              super.removeProperty(parent);
          }
        }
      } finally {
        this._onChange = changed;
      }
      if (original !== undefined && original !== this.cssText) changed?.(this.cssText);
      return previous;
    }
    override getPropertyPriority(property: string): string {
      property = canonicalProperty(property);
      const children = grammarLonghands(property);
      if (children)
        return children.every((child) => super.getPropertyPriority(child) === "important")
          ? "important"
          : "";
      if (property !== "outline" || super.getPropertyValue(property))
        return super.getPropertyPriority(property);
      return this.getPropertyValue(property) ? super.getPropertyPriority("outline-color") : "";
    }
    #specifiedBackground(): string | undefined {
      const blend = super.getPropertyValue("background-blend-mode");
      if (
        blend &&
        blend !== "normal" &&
        !/^(?:inherit|initial|unset|revert(?:-layer|-rule)?)$/.test(blend)
      )
        return "";
      const names = propertyDefinitions.get("background")?.longhands ?? [];
      const values = names.map((name) => super.getPropertyValue(name));
      const first = values[0];
      if (!first || values.some((value) => !value)) return undefined;
      const priority = super.getPropertyPriority(names[0] ?? "");
      if (names.some((name) => super.getPropertyPriority(name) !== priority)) return "";
      const wide = /^(?:inherit|initial|unset|revert(?:-layer|-rule)?)$/;
      if (values.some((value) => wide.test(value)))
        return values.every((value) => value === first) ? first : "";
      if (values.some((value) => variableSyntax.test(value))) return "";
      const layers = new Map(
        names.map((name, index) => [name, cssLayerValues(values[index] ?? "")]),
      );
      const count = layers.get("background-image")?.length ?? 0;
      if (
        !count ||
        [...layers].some(([name, list]) => name !== "background-color" && list.length !== count)
      )
        return "";
      return Array.from({ length: count }, (_, index) => {
        const read = (name: string) =>
          layers.get(name)?.[name === "background-color" ? 0 : index] ?? "";
        const output: string[] = [];
        for (const name of [
          "background-image",
          "background-position",
          "background-size",
          "background-repeat",
          "background-attachment",
        ]) {
          const value = read(name),
            initial = propertyDefinitions.get(name)?.initial;
          if (name === "background-position") {
            if (
              value !== initial ||
              read("background-size") !== propertyDefinitions.get("background-size")?.initial
            )
              output.push(value);
          } else if (value !== initial)
            output.push(name === "background-size" ? `/ ${value}` : value);
        }
        const origin = read("background-origin"),
          clip = read("background-clip");
        if (origin === clip) {
          output.push(origin);
        } else if (origin !== "padding-box" || clip !== "border-box") output.push(origin, clip);
        const color = read("background-color");
        if (index === count - 1 && color !== "transparent") output.push(color);
        return output.join(" ") || "none";
      }).join(", ");
    }
    #invalidatePendingBorder(property: string): void {
      if (!isPhysicalBorder(property)) return;
      const affected = new Set([property, ...shorthandLonghands(property, propertyDefinitions)]);
      for (const shorthand of borderShorthands) {
        if (shorthand === property || !variableSyntax.test(super.getPropertyValue(shorthand)))
          continue;
        if (shorthandLonghands(shorthand, propertyDefinitions).some((child) => affected.has(child)))
          super.removeProperty(shorthand);
      }
    }
    override getPropertyValue(property: string): string {
      if (this._computed && /^(?:(?:column|row)-)?rule$/.test(property)) {
        const frame = computedGapRules.get(this);
        if (frame) return frame.read(property);
      }
      if (property === "line-height") {
        const resolved = publicLineHeights.get(this);
        if (resolved !== undefined) return resolved;
      }
      if (property === "color") {
        const foreground = completedForegrounds.get(this);
        if (foreground !== undefined) return foreground;
      }
      if (property.startsWith("--")) {
        const inherited = computedCustomValues.get(this);
        if (inherited) return inherited.get(property) ?? this._values.get(property) ?? "";
      }
      property = canonicalProperty(property);
      if (shorthandSources?.get(this)?.get(property)?.pending) return "";
      if (property === "font" && !this._computed && this._values.has("font"))
        return this._values.get("font")!;
      if (property === "border-image" && this._values.has(property))
        return super.getPropertyValue(property);
      const children =
        (property === "font" && this._computed) ||
        (property === "size" && !(this instanceof CSSStyleProperties))
          ? undefined
          : grammarLonghands(property);
      if (children && shorthandSources?.get(this)?.size) {
        const source = shorthandSources?.get(this)?.get(children[0]!);
        if (
          source?.shorthand === property &&
          children.every((child) => {
            const entry = shorthandSources?.get(this)?.get(child);
            return entry?.shorthand === property && entry.text === source.text;
          })
        )
          return source.text;
      }
      if (children)
        return serializeShorthand(
          property,
          children,
          (child) => this.getPropertyValue(child),
          (child) => super.getPropertyPriority(child),
        );
      const value = super.getPropertyValue(property);
      if (!value && !this._computed && /^(?:margin|inset)(?:-block|-inline)?$/.test(property)) {
        const children = propertyDefinitions.get(property)?.longhands;
        if (children?.length) {
          const parts = children.map((name) => super.getPropertyValue(name));
          const priority = super.getPropertyPriority(children[0]!);
          if (
            parts.every(Boolean) &&
            children.every((name) => super.getPropertyPriority(name) === priority)
          ) {
            if (parts.length === 4 && parts[3] === parts[1]) parts.pop();
            if (parts.length === 3 && parts[2] === parts[0]) parts.pop();
            if (parts.length === 2 && parts[1] === parts[0]) parts.pop();
            return parts.join(" ");
          }
        }
      }
      if (!this._computed && property === "background") {
        const background = this.#specifiedBackground();
        if (background !== undefined) return background;
      }
      if (
        !this._computed &&
        !value &&
        (property === "border" || borderSideShorthands.has(property))
      ) {
        const leaves = shorthandLonghands(property, propertyDefinitions).filter(
          (name) => !propertyDefinitions.get(name)?.longhands,
        );
        const first = leaves[0];
        const keyword = first && super.getPropertyValue(first);
        if (
          keyword &&
          /^(?:inherit|initial|unset|revert(?:-layer)?)$/.test(keyword) &&
          leaves.every(
            (name) =>
              super.getPropertyValue(name) === keyword &&
              super.getPropertyPriority(name) === super.getPropertyPriority(first),
          )
        )
          return keyword;
      }
      if (
        property === "background" &&
        /^(inherit|initial|unset|revert(?:-layer)?)(?:\s+\1)+$/.test(value)
      )
        return value.split(" ")[0] ?? "";
      if (property === "outline" && this._computed) {
        return serializeShorthand(
          "outline",
          outlineLonghands,
          (name) => this.getPropertyValue(name),
          () => "",
          true,
        );
      }
      if (property === "outline" && !value) {
        const [width, style, color] = outlineLonghands.map((name) => super.getPropertyValue(name));
        if (!width || !style || !color) return "";
        const priority = super.getPropertyPriority("outline-color");
        if (outlineLonghands.some((name) => super.getPropertyPriority(name) !== priority))
          return "";
        if (width === style && style === color) return color;
        if (
          [width, style, color].some((item) =>
            /^(?:inherit|initial|unset|revert(?:-layer)?)$/.test(item),
          )
        )
          return "";
        const omitColor = style === "auto" ? color === "auto" : color === "currentcolor";
        const omitStyle = style === "none" && color !== "auto";
        return (
          [omitColor ? "" : color, omitStyle ? "" : style, width === "medium" ? "" : width]
            .filter(Boolean)
            .join(" ") || "none"
        );
      }
      if (
        !this._computed &&
        !requestedStyleWrites.has(this) &&
        property === "background-position" &&
        value
      )
        return usesTypedValueGrammar(property, value) ? value : canonicalBackgroundPosition(value);
      if (
        this._computed &&
        (property === "background-position" ||
          property === "background-position-x" ||
          property === "background-position-y")
      ) {
        if (
          property === "background-position" &&
          value &&
          backgroundPositionAxes.every((name) => !super.getPropertyValue(name))
        )
          return value;
        const axis = (name: string) => cssLayerValues(super.getPropertyValue(name) || "0%");
        if (property !== "background-position") return axis(property).join(", ");
        const x = axis("background-position-x");
        const y = axis("background-position-y");
        return x.length === y.length ? x.map((v, index) => v + " " + y[index]).join(", ") : "";
      }
      if (property === "background" && this._computed) {
        const layers = [
          cssLayerValues(this.getPropertyValue("background-image")),
          cssLayerValues(this.getPropertyValue("background-position")),
          cssLayerValues(super.getPropertyValue("background-size") || "auto"),
          cssLayerValues(super.getPropertyValue("background-repeat") || "repeat"),
          cssLayerValues(super.getPropertyValue("background-attachment") || "scroll"),
          cssLayerValues(super.getPropertyValue("background-origin") || "padding-box"),
          cssLayerValues(super.getPropertyValue("background-clip") || "border-box"),
        ];
        const count = layers[0]?.length ?? 0;
        if (layers.some((layer) => layer.length !== count)) return "";
        return Array.from({ length: count }, (_, index) => {
          const [image, position, size, repeat, attachment, origin, clip] = layers.map(
            (layer) => layer[index],
          );
          const parts = [];
          if (image !== "none") parts.push(image);
          if (position !== "0% 0%" || size !== "auto") parts.push(position);
          if (size !== "auto") parts.push("/", size);
          if (repeat !== "repeat") parts.push(repeat);
          if (attachment !== "scroll") parts.push(attachment);
          if (origin !== "padding-box" || clip !== "border-box") parts.push(origin);
          if (clip !== "border-box") parts.push(clip);
          if (index === count - 1) parts.push(this.getPropertyValue("background-color"));
          return parts.join(" ") || "none";
        }).join(", ");
      }
      if (this._computed && boxShorthands.has(property)) {
        const read = (side: string) => this.getPropertyValue(`${property}-${side}`);
        return serializeBox(read("top"), read("right"), read("bottom"), read("left"));
      }
      if (property === "font" && this._computed) {
        return serializeShorthand(
          "font",
          grammarLonghands("font")!,
          (child) => this.getPropertyValue(child),
          () => "",
          true,
        );
      }
      if (property === "flex" && this._computed)
        return `${this.getPropertyValue("flex-grow")} ${this.getPropertyValue("flex-shrink")} ${this.getPropertyValue("flex-basis")}`;
      if (property === "border" && this._computed) {
        const top = this.getPropertyValue("border-top");
        return borderSides.every((side) => this.getPropertyValue(`border-${side}`) === top)
          ? top
          : "";
      }
      if (borderSideShorthands.has(property) && this._computed) {
        return ["width", "style", "color"]
          .map((suffix) => this.getPropertyValue(`${property}-${suffix}`))
          .join(" ");
      }
      if (
        property === "border-width" ||
        property === "border-color" ||
        property === "border-style"
      ) {
        if (!this._computed && value) return value;
        const suffix = property.slice("border-".length);
        const names = borderSides.map((side) => `border-${side}-${suffix}`);
        const [top, right, bottom, left] = names.map((name) => this.getPropertyValue(name));
        if (!top || !right || !bottom || !left) return "";
        if (!this._computed) {
          const priority = this.getPropertyPriority(names[0] ?? "");
          if (names.some((name) => this.getPropertyPriority(name) !== priority)) return "";
          if (
            [top, right, bottom, left].some((side) =>
              /^(?:inherit|initial|unset|revert(?:-layer)?)$/i.test(side),
            )
          )
            return top === right && top === bottom && top === left ? top : "";
        }
        return serializeBox(top, right, bottom, left);
      }
      if (!this._computed) return value;
      if (
        (property === "animation-range-start" || property === "animation-range-end") &&
        value.includes("calc(")
      ) {
        const simplified = value.replace(/calc\(([+-]?(?:\d*\.)?\d+(?:%|[a-z]+))\)/gi, "$1");
        if (simplified !== value) return specifiedDeclaration(property, simplified) ?? value;
      }
      if (property === "position-area" && value)
        return value === "initial" || value === "unset" ? "none" : computedPositionArea(value);
      const colorPair = logicalBorderColorShorthands.get(property);
      if (colorPair) {
        const start = this.getPropertyValue(colorPair[0]);
        const end = this.getPropertyValue(colorPair[1]);
        return start === end ? start : `${start} ${end}`;
      }
      const pairedStyle = borderWidthStyles.get(property);
      if (pairedStyle) {
        const style = super.getPropertyValue(pairedStyle);
        if (!style || style === "none" || style === "hidden") return "0px";
        if (value === "thin") return "1px";
        if (value === "thick") return "5px";
        return !value || value === "medium" ? "3px" : value;
      }
      if (property === "outline-width") {
        if (value === "thin") return "1px";
        if (value === "thick") return "5px";
        return !value || value === "medium" ? "3px" : value;
      }
      if (property === "outline-color") {
        if (value === "auto" && super.getPropertyValue("outline-style") === "auto") return value;
        return !value || value === "auto"
          ? (completedForegrounds.get(this) ?? super.getPropertyValue("color"))
          : value;
      }
      if (borderSideStyles.has(property)) return value || "none";
      if (borderSideColors.has(property) || logicalBorderColorNames.has(property)) {
        const currentColor = completedForegrounds.get(this) ?? super.getPropertyValue("color");
        return value
          ? resolveColor(value, {
              currentColor,
              colorScheme: super.getPropertyValue("color-scheme") || "normal",
            })
          : currentColor;
      }
      if (value) return value;
      const initial =
        computedInitialValues.get(property) ?? longhandDefinition(property)?.initial ?? "";
      if (
        (initial === "currentcolor" && property !== "box-shadow-color") ||
        (initial === "auto" && property === "caret-color")
      )
        return completedForegrounds.get(this) ?? super.getPropertyValue("color");
      if (property === "animation-duration" && initial === "auto") return "0s";
      if (property.endsWith("-width") && initial === "medium") {
        if (property.startsWith("border-")) {
          const style = super.getPropertyValue(property.slice(0, -5) + "style");
          if (!style || style === "none" || style === "hidden") return "0px";
        }
        return "3px";
      }
      if (property.endsWith("-color") && (initial === "white" || initial === "black"))
        return initial === "white" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
      return initial;
    }
    #setOutlineLonghand(name: string, value: string, priority: string): void {
      const normalized = priority.toLowerCase();
      if (normalized && normalized !== "important") return;
      if (variableSyntax.test(value)) {
        this._setProperty(name, value, normalized);
        return;
      }
      const { lexer }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
      if (lexer.matchProperty(name, value).error !== null) return;
      if (name === "outline-width" && Number.parseFloat(value) < 0) return;
      const keyword = value.toLowerCase();
      if (name === "outline-color" && keyword === "auto") {
        this._setProperty(name, keyword, normalized);
        return;
      }
      // The base setter changes priority before it checks whether it accepts a value.
      const parsed = new Base();
      parsed.setProperty(name, value);
      this._setProperty(name, parsed.getPropertyValue(name) || value, normalized);
    }
    override setProperty(property: string, value: string, priority = ""): void {
      const owner = styleMutationOwners.get(this);
      if (owner !== mutationOperations) {
        if (!owner) throw new TypeError("Illegal invocation");
        owner.setProperty.call(this, property, value, priority);
        return;
      }
      const inputName = cssInput(property);
      const name = inputName.startsWith("--")
        ? inputName
        : canonicalProperty(inputName.toLowerCase());
      const text = cssInput(value, false);
      const importance = cssInput(priority).toLowerCase();
      if (this._readonly)
        throw new this._global.DOMException(
          `Cannot set property "${inputName}" on a read-only style declaration.`,
          "NoModificationAllowedError",
        );
      if (text && importance && importance !== "important") return;
      let ordered = orderedStyles.get(this);
      if (!ordered && this._onChange && logicalBoxName.test(name)) {
        ordered = orderedDeclaration(this.cssText);
        orderedStyles.set(this, ordered);
      }
      this.#updateStyle(() => {
        const previous = requestedStyleWrites.get(this);
        requestedStyleWrites.set(this, { property: name.toLowerCase(), priority: importance });
        try {
          this.#setPropertyValue(name, text, importance);
          ordered?.setProperty(name, text, importance);
        } finally {
          if (previous) requestedStyleWrites.set(this, previous);
          else requestedStyleWrites.delete(this);
        }
      });
    }
    #setPropertyValue(property: string, value: string, priority: string): void {
      if (
        value.endsWith("\\") ||
        (property.startsWith("--") &&
          (value.includes("/*") ||
            /['"]/u.test(value) ||
            (/[([{]/u.test(value) && !/[)\]}]$/u.test(value))))
      ) {
        const serialized = specifiedDeclaration(property, value);
        if (serialized !== undefined) this._setProperty(property, serialized, priority);
        return;
      }
      if (property.startsWith("--") && value && /^(?:\s|\/\*[\s\S]*?\*\/)*$/.test(value)) {
        this._setProperty(property, " ", priority);
        return;
      }
      if (!property.startsWith("--")) value = canonicalWideKeyword(value);
      if (property.toLowerCase() === "page" && value.toLowerCase() === "auto") value = "auto";
      const name = property.toLowerCase();
      if (
        value &&
        (/^-webkit-box-(?:flex|ordinal-group)$/.test(name) ||
          (!name.startsWith("--") &&
            /^[-+]?(?:[0-9]*\.[0-9]+|[0-9]+)(?:e[+-]?[0-9]+)?(?:[a-z]+|%)?$/i.test(value) &&
            (value.length >= 8 || value === "-0")))
      ) {
        const serialized = specifiedDeclaration(name, value);
        if (serialized !== undefined) value = serialized;
        if (name.startsWith("-webkit-box-") && serialized !== undefined) {
          this._setProperty(name, serialized, priority);
          return;
        }
      }
      if (
        /^(?:margin|padding|box-shadow)$/.test(name) &&
        (substitutionFunction.test(value) || /var\(/i.test(value))
      ) {
        const parsed = expandedDeclaration(name, value, priority === "important");
        if (!parsed) return;
        for (const [index, [child, component]] of parsed.entries.entries()) {
          const declaration = parsed.declarations[index]!;
          this._setProperty(child, component || parsed.text, priority);
          setShorthandSource(this, child, {
            shorthand: name,
            text: parsed.text,
            pending: !!declaration.pending,
            declaration,
          });
        }
        this._setProperty(name, parsed.text, priority);
        return;
      }
      if (
        value.includes("(") &&
        (substitutionFunction.test(value) ||
          usesTypedValueGrammar(name, value) ||
          (!name.startsWith("--") && /var\(\s*(?:[{},)]|[^)]*\{)/i.test(value))) &&
        !propertyDefinitions.get(name)?.longhands &&
        !grammarLonghands(name)
      ) {
        const serialized = specifiedDeclaration(property.startsWith("--") ? property : name, value);
        if (serialized !== undefined) {
          this._setProperty(property, serialized, priority);
          if (
            value !== serialized &&
            /[0-9](?:dpi|dpcm|rad|cm|mm|q|pt)\b/i.test(value) &&
            /\d\.\d+/.test(serialized)
          ) {
            calculationSources ??= new WeakMap();
            let source = calculationSources.get(this);
            if (!source) calculationSources.set(this, (source = new Map()));
            source.set(name, value);
            this.#precisionRevision++;
          }
        }
        return;
      }
      if (
        (usesTypedValueGrammar(name, value) ||
          (name === "background" &&
            /(?:border-area|\/|,)/i.test(value) &&
            !variableSyntax.test(value))) &&
        (name === "background" || name === "background-position" || name === "border")
      ) {
        const parsed = expandedDeclaration(name, value, priority === "important");
        if (!parsed) return;
        for (const [child, component] of parsed.entries) {
          this._setProperty(child, component, priority);
        }
        if (parsed.background) {
          this._setProperty("background-position", parsed.background.position, priority);
          this._setProperty("background-repeat", parsed.background.repeat, priority);
        }
        this._setProperty(name, parsed.text, priority);
        return;
      }
      if (
        (name === "background-position" || name === "background-repeat" || name === "box-shadow") &&
        value &&
        !variableSyntax.test(value)
      ) {
        const expanded = expandedDeclaration(name, value, priority === "important");
        if (expanded) {
          for (const [child, component] of expanded.entries)
            this._setProperty(child, component, priority);
          this._setProperty(name, expanded.text, priority);
          return;
        }
      }
      value = normalizePropertyInput(name, value);
      if (!name.startsWith("--") && hasContextlessPercentage(name, value)) return;
      if (!name.startsWith("--") && value.trim() === "") {
        if (name.startsWith("background-")) super.removeProperty("background");
        if (
          name === "outline" ||
          name === "background-repeat" ||
          grammarLonghands(name) ||
          isPhysicalBorder(name) ||
          propertyDefinitions.get(name)?.longhands?.length
        )
          this.#removeProperty(name);
        else
          // Native longhand setters also invalidate their reconstructed shorthands.
          super.setProperty(name, "", priority);
        return;
      }
      if (
        /\banchor(?:-size)?\(/i.test(value) &&
        acceptsAnchors(name) &&
        !variableSyntax.test(value)
      ) {
        const components = anchorComponents(name, value);
        if (!components) return;
        const [first, second = first, third = first, fourth = second] = components;
        if (!first) return;
        const longhands = propertyDefinitions.get(name)?.longhands;
        if (longhands?.length === 2 || longhands?.length === 4) {
          this.#removeProperty(name);
          const expanded = [first, second, third, fourth];
          for (const [index, child] of longhands.entries())
            this._setProperty(child, expanded[index]!, priority);
        } else this._setProperty(name, components.join(" "), priority);
        return;
      }
      if (
        name !== "font" &&
        !(name === "border-image" && value.toLowerCase() === "none") &&
        (name !== "size" || this instanceof CSSStyleProperties) &&
        grammarLonghands(name)
      ) {
        const shorthand = expandedDeclaration(name, value, priority === "important");
        if (!shorthand) return;
        for (const [i, [child, component]] of shorthand.entries.entries()) {
          const declaration = shorthand.declarations[i]!;
          this._setProperty(child, component || shorthand.text, priority);
          if (declaration.pending || /repeat\(/i.test(shorthand.text))
            setShorthandSource(this, child, {
              shorthand: name,
              text: shorthand.text,
              pending: !!declaration.pending,
              declaration,
            });
        }
        return;
      }
      if ((name === "font" || name === "text-decoration") && !/var\(/i.test(value)) {
        const declaration = expandedDeclaration(name, value);
        if (!declaration) return;
        this.#removeProperty(name);
        for (const [child, component] of declaration.entries) {
          if (component) this._setProperty(child, component, priority);
        }
        this._setProperty(name, declaration.text, priority);
        return;
      }
      if (name === "size") {
        const parsed = parseSizeDeclaration(value);
        if (parsed !== undefined) this._setProperty(name, parsed, priority);
        return;
      }
      if (
        name === "background" &&
        /^(?:inherit|initial|unset|revert(?:-layer|-rule)?)$/i.test(value)
      ) {
        this.#removeProperty(name);
        for (const child of propertyDefinitions.get(name)?.longhands ?? [])
          this._setProperty(child, value.toLowerCase(), priority);
        for (const axis of backgroundPositionAxes)
          this._setProperty(axis, value.toLowerCase(), priority);
        this._setProperty(name, value.toLowerCase(), priority);
        return;
      }
      // The pinned parser predates this CSS-wide keyword. Its property metadata
      // still owns validity and shorthand expansion; custom properties stay literal.
      if (value.toLowerCase() === "revert-rule" && propertyDefinitions.has(name)) {
        const leaves = shorthandLonghands(name, propertyDefinitions).filter(
          (child) => !propertyDefinitions.get(child)?.longhands,
        );
        this.#removeProperty(name);
        if (leaves.length) {
          for (const child of leaves) this._setProperty(child, "revert-rule", priority);
        } else this._setProperty(name, "revert-rule", priority);
        return;
      }
      if (
        !this._readonly &&
        borderShorthands.has(name) &&
        /^(?:inherit|initial|unset|revert(?:-layer)?)$/i.test(value)
      ) {
        this.#invalidatePendingBorder(name);
        const leaves = new Set(
          shorthandLonghands(name, propertyDefinitions).filter(
            (child) => !propertyDefinitions.get(child)?.longhands,
          ),
        );
        if (name === "border") {
          leaves.add("border-image");
          for (const child of grammarLonghands("border-image") ?? []) leaves.add(child);
        }
        for (const shorthand of borderShorthands)
          if (shorthandLonghands(shorthand, propertyDefinitions).some((child) => leaves.has(child)))
            super.removeProperty(shorthand);
        for (const child of leaves) this._setProperty(child, value.toLowerCase(), priority);
        return;
      }
      if (
        !this._readonly &&
        (name === "color" || name.endsWith("-color") || name === "fill" || name === "stroke") &&
        propertyDefinitions.has(name) &&
        !propertyDefinitions.get(name)?.longhands
      ) {
        const serialized = value.startsWith("#")
          ? serializeHexColor(value)
          : (serializeRGB(value) ?? specifiedColorFunction(value));
        if (serialized !== undefined) {
          this._setProperty(name, serialized, priority);
          return;
        }
      }
      if (!this._readonly && outlineProperties.has(name)) {
        const text = value == null ? "" : `${value}`.trim();
        if (!text) this.removeProperty(name);
        else if (name === "outline") this[setParsedOutline](text, priority, this._updating);
        else this.#setOutlineLonghand(name, text, priority);
        return;
      }
      if (
        !this._readonly &&
        typeof value === "string" &&
        deferredShorthandLonghands.has(name) &&
        /var\(/i.test(value)
      ) {
        const normalized = priority.toLowerCase();
        if (!normalized || normalized === "important") this._setProperty(name, value, normalized);
        return;
      }
      if (!this._readonly && typeof value === "string" && /^\s*(?:min|max|clamp)\(/i.test(value)) {
        const unresolved = unresolvedMathValue(name, value);
        if (unresolved !== undefined) {
          const probe = new Base();
          probe.setProperty(name, value);
          // Retain valid longhands whose mixed units need computed-value context.
          // Ordinary reducible values keep the native specified-value serializer.
          if (
            dimensionProperties.has(name) ||
            (!propertyDefinitions.get(name)?.longhands && !probe.getPropertyValue(name))
          ) {
            const normalized = priority.toLowerCase();
            if (!normalized || normalized === "important")
              this._setProperty(name, unresolved, normalized);
            return;
          }
          value = serializeCSSMath(value);
        }
      }
      if (
        !this._readonly &&
        name === "background" &&
        !/^(?:inherit|initial|unset|revert(?:-layer)?)$/i.test(value)
      ) {
        const layers = splitBackground(value);
        if (!layers) {
          try {
            if (parsePropertyValue(name, value) !== undefined)
              super.setProperty(property, value, priority);
          } catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
          }
          return;
        }
        const names = propertyDefinitions.get("background")?.longhands ?? [];
        const components = new Map<string, string>();
        for (const child of names) {
          const initial = propertyDefinitions.get(child)?.initial ?? "";
          const parts = layers.map((layer) => layer.get(child) ?? initial);
          const raw = child === "background-color" ? (parts.at(-1) ?? initial) : parts.join(", ");
          const probe = new Base();
          probe.setProperty(child, raw);
          // Native longhand setters also validate contextual math inside images.
          if (child !== "background-position" && raw && !probe.getPropertyValue(child)) return;
          components.set(
            child,
            child === "background-position"
              ? canonicalBackgroundPosition(raw)
              : probe.getPropertyValue(child) || raw,
          );
        }
        this.#removeProperty("background");
        for (const [child, component] of components) this._setProperty(child, component, priority);
        this._setProperty("background-blend-mode", "normal", priority);
        // The existing provider serializer reads the complete, canonical longhand block.
        const probe = new Base();
        for (const [child, component] of components) probe._setProperty(child, component, priority);
        probe._setProperty("background", value, priority);
        const serialized = Reflect.get(probe, "background");
        this._setProperty(
          "background",
          typeof serialized === "string" && serialized ? serialized : value,
          priority,
        );
        return;
      }
      if (
        value &&
        !property.startsWith("--") &&
        !propertyDefinitions.get(name)?.longhands &&
        (/^(?:counter-reset$|counter-increment$|counter-set$|transition-timing-function$|grid-auto-flow$|grid-(?:column|row)-(?:start|end)$|paint-order$|color-scheme$|container-name$|grid-template-areas$|box-shadow$|vertical-align$|transform$|shape-outside$|scale$|object-position$|perspective-origin$|transform-origin$|list-style-image$|text-box-edge$|font-palette$|clip-path$|text-autospace$|text-spacing-|text-transform$|font-variation-settings$|font-synthesis-|font-family$|will-change$|content$|offset-path$|mask-|border-image-|white-space-|text-decoration-line$|position-area|row-rule-|column-rule-|view-transition-|corner-|text-box-|animation-range-|animation-delay-(?:start|end))/.test(
          name,
        ) ||
          (name.startsWith("grid-template-") && value.includes("calc(")))
      ) {
        const serialized = specifiedDeclaration(name, value);
        if (serialized !== undefined) this._setProperty(name, serialized, priority);
        return;
      }
      if (value && !property.startsWith("--")) {
        try {
          if (parsePropertyValue(name, value) === undefined) {
            const unresolved =
              propertyDefinitions.has(name) && !propertyDefinitions.get(name)?.longhands
                ? unresolvedMathValue(name, value)
                : undefined;
            const serialized =
              unresolved ??
              (!propertyDefinitions.get(name)?.longhands
                ? specifiedDeclaration(name, value)
                : undefined);
            if (serialized !== undefined) this._setProperty(name, serialized, priority);
            return;
          }
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
          return;
        }
      }
      this.#invalidatePendingBorder(name);
      const previousPriority = this._priorities.get(name);
      const revision = this.#writeRevision;
      let replacedPriorities: Map<string, string> | undefined;
      if (!this._updating) {
        const longhands = shorthandLonghands(name, propertyDefinitions);
        if (longhands.length) {
          replacedPriorities = new Map();
          for (const child of longhands) {
            const previous = this._priorities.get(child);
            if (previous !== undefined) replacedPriorities.set(child, previous);
            this._priorities.delete(child);
          }
        }
      }
      super.setProperty(
        property,
        name === "font" && typeof value === "string" ? normalizeFontLineHeight(value) : value,
        priority,
      );
      if (this.#writeRevision === revision) {
        if (replacedPriorities)
          for (const [child, importance] of replacedPriorities)
            this._priorities.set(child, importance);
        if (previousPriority === undefined) this._priorities.delete(name);
        else this._priorities.set(name, previousPriority);
      }
    }
  }

  const mutationOperations: StyleMutationOperations = {
    setProperty: CSSStyleDeclaration.prototype.setProperty,
    removeProperty: CSSStyleDeclaration.prototype.removeProperty,
    setText: Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, "cssText")?.set,
  };

  const font = Object.getOwnPropertyDescriptor(Base.prototype, "font");
  if (font?.get) {
    Object.defineProperty(CSSStyleDeclaration.prototype, "font", {
      get(this: BaseDeclaration) {
        return this.getPropertyValue("font");
      },
    });
  }

  for (const property of ["background", ...outlineProperties, "size"]) {
    const camel = property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    for (const name of new Set([property, camel])) {
      Object.defineProperty(CSSStyleDeclaration.prototype, name, {
        get(this: BaseDeclaration) {
          return this.getPropertyValue(property);
        },
      });
    }
  }
  Object.defineProperty(CSSStyleDeclaration.prototype, Symbol.iterator, {
    value: arrayValues,
    writable: true,
    configurable: true,
  });
  class CSSStyleProperties extends CSSStyleDeclaration {
    get [Symbol.toStringTag](): string {
      return "CSSStyleProperties";
    }
  }
  const computedContexts = new WeakMap<CSSStyleProperties, () => PublicDeclaration>();
  const computedCustomValues = new WeakMap<CSSStyleDeclaration, ReadonlyMap<string, string>>();
  const completedForegrounds = new WeakMap<CSSStyleDeclaration, string>();
  type CustomSnapshot = {
    groups: readonly ProjectedIndexGroup[];
    block: { names: readonly string[]; values: ReadonlyMap<string, string> };
  };
  function computedContext(
    source: CSSStyleProperties,
    inherited?: CustomSnapshot,
    foreground?: string,
  ) {
    // Completed frames are immutable; bind context ownership once, never cache a public view.
    const context = Object.create(source) as CSSStyleProperties;
    const gapRules = computedGapRules.get(source);
    if (gapRules) computedGapRules.set(context, gapRules);
    const lineHeight = unitlessLineHeights.get(source);
    if (lineHeight !== undefined) publicLineHeights.set(context, lineHeight);
    context._global = source._global;
    context._computed = true;
    context._readonly = true;
    styleMutationOwners.set(context, mutationOperations);
    const order = borderColorSourceOrder.get(source);
    if (order) borderColorSourceOrder.set(context, order);
    views.register(context, true);
    if (inherited) computedCustomValues.set(context, inherited.block.values);
    if (foreground !== undefined) completedForegrounds.set(context, foreground);
    const indices =
      inherited || foreground !== undefined
        ? {
            names: inherited?.block.names ?? [],
            groups: inherited?.groups ?? [],
            ...(foreground !== undefined && { last: "color" }),
          }
        : undefined;
    return { style: context, ...(indices && { indices }) };
  }
  function createComputedPublisher(
    source: CSSStyleProperties,
    inherited?: CustomSnapshot,
    foreground?: string,
  ): () => PublicDeclaration {
    const { style, indices } = computedContext(source, inherited, foreground);
    const publish = views.freshPublisher(style, indices);
    computedContexts.set(source, publish);
    return publish;
  }
  function computedView(
    source: CSSStyleProperties,
    inherited?: CustomSnapshot,
    foreground?: string,
  ): PublicDeclaration {
    const publish =
      computedContexts.get(source) ?? createComputedPublisher(source, inherited, foreground);
    return publish();
  }
  return { CSSStyleDeclaration, CSSStyleProperties, computedContext, computedView };
}

function sheetIndex(key: PropertyKey): number | undefined {
  return typeof key === "string" && /^(0|[1-9]\d*)$/.test(key) ? Number(key) : undefined;
}

const reservedKeyframesName = /^(?:none|default|initial|inherit|unset|revert(?:-layer)?)$/i;

function parseKeyframesName(text: string): string | undefined {
  const { parse, ident }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  let ast: CssNode;
  try {
    ast = parse(text, { context: "atrulePrelude", atrule: "keyframes" });
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return;
  }
  if (ast.type !== "AtrulePrelude" || ast.children.size !== 1) return;
  const name = ast.children.first;
  if (name?.type === "String") return name.value || undefined;
  if (name?.type !== "Identifier") return;
  const decoded = ident.decode(name.name);
  return reservedKeyframesName.test(decoded) ? undefined : decoded;
}

function normalizedKeyframes(text: string): string | undefined {
  const css: { lexer: { matchType(name: string, value: string): { error: unknown } } } =
    require("./css-runtime.cjs").cssTree;
  const layers = cssLayers(text);
  if (!layers.length) return;
  const offsets: string[] = [];
  for (const parts of layers) {
    const key = parts.join(" ").toLowerCase();
    if (css.lexer.matchType("keyframe-selector", key).error !== null) return;
    if (key === "from" || key === "to") offsets.push(key === "from" ? "0%" : "100%");
    else
      offsets.push(
        parts
          .map((part) => {
            if (part.endsWith("%")) return `${Number(part.slice(0, -1))}%`;
            return /^(?:calc|min|max|clamp)\(/i.test(part)
              ? serializeCSSMath(part)
              : part.toLowerCase();
          })
          .join(" "),
      );
  }
  return offsets.join(", ");
}

function createRuleInterfaces(
  parseRules: (
    text: string,
    namespaces?: Map<string, string>,
    nesting?: NestingMode,
  ) => Omit<SheetRecord, "sheet">,
  Exception: typeof DOMException,
  mediaList: (text: string) => SheetMedia,
  matchesMedia: (media: SheetMedia) => boolean,
  parseSelectorChange: (
    text: string,
    namespaces?: ReadonlyMap<string, string>,
    nesting?: NestingMode,
  ) => RuleSelection | undefined,
  namespacesForSheet: (sheet: Sheet | null) => Map<string, string> | undefined,
  exposeDeclaration: (style: Declaration) => PublicDeclaration,
  descriptor: ReturnType<typeof createDescriptorRuleParser>["descriptor"],
  parseFontFace: (text: string) => BoundRule<FontFaceData> | undefined,
  parseFunction: (
    text: string,
  ) => { data: FunctionRuleData<RuleList>; bind(owner: object): void } | undefined,
  parseProperty: ReturnType<typeof createDescriptorRuleParser>["property"],
  parsePosition: (text: string) => PositionTry | undefined,
  positionDescriptors: ReturnType<typeof createDeclarationViews>["positionDescriptors"],
) {
  const key = Symbol();
  const listMembers = new WeakMap<CSSRuleList, readonly Rule[]>();

  function members(list: CSSRuleList): readonly Rule[] {
    const entries = listMembers.get(list);
    if (!entries) throw new TypeError("Illegal invocation");
    return entries;
  }

  class CSSRuleList implements RuleList {
    readonly [index: number]: StyleRule | undefined;

    constructor(token: symbol, rules: readonly Rule[]) {
      if (token !== key) throw new TypeError("Illegal constructor");
      const list = new Proxy(this, {
        get(target, property, receiver) {
          const index = sheetIndex(property);
          return index === undefined ? Reflect.get(target, property, receiver) : rules[index]?.view;
        },
        has(target, property) {
          const index = sheetIndex(property);
          return index === undefined ? Reflect.has(target, property) : index < rules.length;
        },
        ownKeys(target) {
          return [...rules.map((_, index) => String(index)), ...Reflect.ownKeys(target)];
        },
        getOwnPropertyDescriptor(target, property) {
          const index = sheetIndex(property);
          if (index === undefined) return Reflect.getOwnPropertyDescriptor(target, property);
          const value = rules[index]?.view;
          return value === undefined
            ? undefined
            : { value, writable: false, enumerable: true, configurable: true };
        },
        defineProperty(target, property, descriptor) {
          return (
            sheetIndex(property) === undefined &&
            Reflect.defineProperty(target, property, descriptor)
          );
        },
        deleteProperty(target, property) {
          const index = sheetIndex(property);
          return index === undefined
            ? Reflect.deleteProperty(target, property)
            : index >= rules.length;
        },
        preventExtensions: () => false,
      });
      listMembers.set(list, rules);
      return list;
    }

    get length(): number {
      return members(this).length;
    }
    item(index: number): StyleRule | null {
      const rules = members(this);
      if (arguments.length === 0) throw new TypeError("A CSS rule index is required");
      return rules[+index >>> 0]?.view ?? null;
    }
    [Symbol.iterator](): IterableIterator<StyleRule> {
      const rules = members(this);
      // Array iteration stays live and retains its intrinsic iterator brand.
      return arrayValues.call(
        new Proxy(rules, {
          get(target, property, receiver) {
            const index = sheetIndex(property);
            return index === undefined
              ? Reflect.get(target, property, receiver)
              : target[index]?.view;
          },
        }),
      );
    }
    get [Symbol.toStringTag](): string {
      return "CSSRuleList";
    }
  }

  class CSSRule<Kind extends number = number> {
    static readonly STYLE_RULE = 1;
    static readonly CHARSET_RULE = 2;
    static readonly IMPORT_RULE = 3;
    static readonly MEDIA_RULE = 4;
    static readonly FONT_FACE_RULE = 5;
    static readonly PAGE_RULE = 6;
    static readonly KEYFRAMES_RULE = 7;
    static readonly KEYFRAME_RULE = 8;
    static readonly MARGIN_RULE = 9;
    static readonly NAMESPACE_RULE = 10;
    static readonly COUNTER_STYLE_RULE = 11;
    static readonly SUPPORTS_RULE = 12;
    static readonly FONT_FEATURE_VALUES_RULE = 14;
    constructor(token: symbol, kind: Kind) {
      if (token !== key) throw new TypeError("Illegal constructor");
      cssRuleRecords.set(this, { kind, parentRule: null, parentStyleSheet: null });
    }
    get type(): Kind {
      // Only the intrinsic constructor stores a value, preserving its literal kind.
      return ruleRecord(this).kind as Kind;
    }
    get parentRule(): RuleParents["parentRule"] {
      return ruleRecord(this).parentRule;
    }
    get parentStyleSheet(): Sheet | null {
      return ruleRecord(this).parentStyleSheet;
    }
  }
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(CSSRule))) {
    if (typeof descriptor.value !== "number") continue;
    const constant = {
      value: descriptor.value,
      writable: false,
      enumerable: true,
      configurable: false,
    };
    Object.defineProperty(CSSRule, name, constant);
    Object.defineProperty(CSSRule.prototype, name, constant);
  }
  for (const name of ["type", "parentRule", "parentStyleSheet"]) {
    Object.defineProperty(CSSRule.prototype, name, { enumerable: true });
  }
  class CSSPositionTryRule extends CSSRule<0> {
    #rule: PositionTry;
    #style: PositionTryRule["style"];
    constructor(token: symbol, rule: PositionTry) {
      super(token, 0);
      this.#rule = rule;
      this.#style = positionDescriptors(rule.style, this);
    }
    get name(): string {
      return this.#rule.name;
    }
    get style() {
      return this.#style;
    }
    get cssText(): string {
      return this.#rule.cssText;
    }
    get [Symbol.toStringTag](): string {
      return "CSSPositionTryRule";
    }
  }
  class CSSFontFeatureValuesRule extends CSSRule<14> {
    #features: NonNullable<ReturnType<typeof fontFeatureValues>>;
    constructor(token: symbol, features: NonNullable<ReturnType<typeof fontFeatureValues>>) {
      super(token, 14);
      this.#features = features;
    }
    get fontFamily(): string {
      return this.#features.fontFamily;
    }
    set fontFamily(value: string) {
      this.#features.fontFamily = cssInput(value);
    }
    get cssText(): string {
      return this.#features.cssText;
    }
    get [Symbol.toStringTag](): string {
      return "CSSFontFeatureValuesRule";
    }
  }
  class CSSFontFaceRule extends CSSRule<5> {
    #data: FontFaceData;
    constructor(token: symbol, parsed: BoundRule<FontFaceData>) {
      super(token, 5);
      this.#data = parsed.data;
      parsed.bind(this);
    }
    get style() {
      return this.#data.style;
    }
    get cssText() {
      return this.#data.cssText;
    }
    get [Symbol.toStringTag]() {
      return "CSSFontFaceRule";
    }
  }
  class CSSPropertyRule extends CSSRule<0> implements PropertyRule {
    #registration: Omit<PropertyRule, "type" | "cssText" | "name">;
    constructor(token: symbol, registration: Omit<PropertyRule, "type" | "cssText" | "name">) {
      super(token, 0);
      this.#registration = registration;
    }
    get names() {
      return this.#registration.names;
    }
    get name() {
      return this.names.length === 1 ? this.names[0]! : "";
    }
    get inherits() {
      return this.#registration.inherits;
    }
    get syntax() {
      return this.#registration.syntax;
    }
    get initialValue() {
      return this.#registration.initialValue;
    }
    get cssText() {
      const { ident, string }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
      const names = this.names.map((name) => ident.encode(name)).join(", ");
      const initial = this.initialValue === null ? "" : `initial-value: ${this.initialValue}; `;
      return `@property ${names} { syntax: ${string.encode(this.syntax)}; inherits: ${this.inherits}; ${initial}}`;
    }
    get [Symbol.toStringTag]() {
      return "CSSPropertyRule";
    }
  }
  interface CSSCounterStyleRule extends Record<CounterDescriptor, string> {}
  class CSSKeyframeRule extends CSSRule<8> implements KeyframeRule {
    #keyText: string;
    constructor(token: symbol, offsets: string, declaration: Declaration) {
      super(token, 8);
      ruleRecord(this).declaration = declaration;
      this.#keyText = offsets;
    }
    get style(): PublicDeclaration {
      return exposeDeclaration(ruleDeclaration(this));
    }
    get keyText(): string {
      return this.#keyText;
    }
    set keyText(value: string) {
      const offsets = normalizedKeyframes(`${value}`);
      if (offsets === undefined) throw new Exception("Invalid keyframe selector.", "SyntaxError");
      this.#keyText = offsets;
    }
    get cssText(): string {
      return `${this.#keyText} { ${this.style.cssText} }`;
    }
    get [Symbol.toStringTag](): string {
      return "CSSKeyframeRule";
    }
  }

  const animationStates = new WeakMap<
    CSSKeyframesRule,
    {
      name: string;
      rules: KeyframeEntry[];
      list?: CSSRuleList;
    }
  >();
  function animationState(rule: CSSKeyframesRule) {
    const state = animationStates.get(rule);
    if (!state) throw new TypeError("Expected a CSSKeyframesRule");
    return state;
  }

  class CSSKeyframesRule extends CSSRule<7> implements KeyframesRule {
    readonly [index: number]: (KeyframeRule & RuleParents) | undefined;
    constructor(token: symbol, name: string, rules: KeyframeEntry[]) {
      super(token, 7);
      const list: CSSKeyframesRule = new Proxy(this, {
        get(target, property, receiver) {
          const index = sheetIndex(property);
          return index === undefined ? Reflect.get(target, property, receiver) : rules[index]?.view;
        },
        has(target, property) {
          const index = sheetIndex(property);
          return index === undefined ? Reflect.has(target, property) : index < rules.length;
        },
      });
      cssRuleRecords.set(list, ruleRecord(this));
      animationStates.set(list, { name, rules });
      return list;
    }
    get name(): string {
      return animationState(this).name;
    }
    set name(value: string) {
      animationState(this).name = `${value}`;
    }
    get length(): number {
      return animationState(this).rules.length;
    }
    get cssRules(): CSSRuleList {
      const state = animationState(this);
      return (state.list ??= new CSSRuleList(key, state.rules));
    }
    appendRule(rule: string): void {
      if (!arguments.length) throw new TypeError("A keyframe rule is required");
      const text = `@keyframes run-dom { ${rule} }`;
      const { ast, errors: syntaxErrors } = parseStyleSheetSyntax(text);
      const block =
        ast.type === "StyleSheet" && ast.children.size === 1 ? ast.children.first : null;
      if (syntaxErrors.length || block?.type !== "Atrule" || block.block?.children.size !== 1)
        return;
      const { rules, errors } = parseRules(text);
      const animation = rules[0];
      if (
        errors.length ||
        rules.length !== 1 ||
        animation?.kind !== "keyframes" ||
        animation.rules.length !== 1
      )
        return;
      const entry = animation.rules[0];
      if (!entry) return;
      const state = animationState(this);
      attach(entry, ruleRecord(this).parentStyleSheet ?? null, this);
      state.rules.push(entry);
    }
    deleteRule(select: string): void {
      if (!arguments.length) throw new TypeError("A keyframe selector is required");
      const offsets = normalizedKeyframes(`${select}`);
      const state = animationState(this);
      const index = state.rules.findIndex((entry) => entry.view.keyText === offsets);
      if (index < 0) return;
      const [removed] = state.rules.splice(index, 1);
      if (removed) detach(removed);
    }
    findRule(select: string): (KeyframeRule & RuleParents) | null {
      if (!arguments.length) throw new TypeError("A keyframe selector is required");
      const offsets = normalizedKeyframes(`${select}`);
      return (
        animationState(this).rules.findLast((entry) => entry.view.keyText === offsets)?.view ?? null
      );
    }
    get cssText(): string {
      const { ident, string }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
      const state = animationState(this);
      const name = reservedKeyframesName.test(state.name)
        ? string.encode(state.name)
        : ident.encode(state.name);
      return `@keyframes ${name} { ${state.rules.map((rule) => rule.view.cssText).join(" ")} }`;
    }
    get [Symbol.toStringTag](): string {
      return "CSSKeyframesRule";
    }
  }

  class CSSCounterStyleRule extends CSSRule<11> implements CounterStyleRule {
    #rule: CounterStyleRule;
    static {
      for (const [name] of counterDescriptors) {
        Object.defineProperty(this.prototype, name, {
          configurable: true,
          enumerable: true,
          get(this: CSSCounterStyleRule) {
            return this.#rule[name];
          },
          set(this: CSSCounterStyleRule, value: string) {
            this.#rule[name] = value;
          },
        });
      }
    }
    constructor(token: symbol, parsed: BoundRule<CounterStyleRule>) {
      super(token, 11);
      this.#rule = parsed.data;
      parsed.bind(this);
    }
    get name() {
      return this.#rule.name;
    }
    set name(value: string) {
      this.#rule.name = value;
    }
    get cssText() {
      return this.#rule.cssText;
    }

    get [Symbol.toStringTag](): string {
      return "CSSCounterStyleRule";
    }
  }

  class CSSViewTransitionRule extends CSSRule<0> {
    #rule: ViewTransitionData;
    constructor(token: symbol, parsed: BoundRule<ViewTransitionData>) {
      super(token, 0);
      this.#rule = parsed.data;
      parsed.bind(this);
    }
    get navigation() {
      return this.#rule.navigation;
    }
    get types() {
      return this.#rule.types;
    }
    get cssText() {
      return this.#rule.cssText;
    }
    get [Symbol.toStringTag]() {
      return "CSSViewTransitionRule";
    }
  }
  class CSSNamespaceRule extends CSSRule<10> implements NamespaceRule {
    readonly #prefix: string;
    readonly #namespaceURI: string;
    constructor(token: symbol, prefix: string, namespaceURI: string) {
      super(token, 10);
      this.#prefix = prefix;
      this.#namespaceURI = namespaceURI;
    }
    get prefix(): string {
      return this.#prefix;
    }
    get namespaceURI(): string {
      return this.#namespaceURI;
    }
    get cssText(): string {
      const { string, ident }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
      const prefix = this.#prefix ? `${ident.encode(this.#prefix)} ` : "";
      return `@namespace ${prefix}url(${string.encode(this.#namespaceURI)});`;
    }
    get [Symbol.toStringTag](): string {
      return "CSSNamespaceRule";
    }
  }
  class CSSLayerStatementRule extends CSSRule<0> implements LayerStatementRule {
    readonly #nameList: readonly string[];
    constructor(token: symbol, names: string[]) {
      super(token, 0);
      this.#nameList = Object.freeze(names);
    }
    get nameList(): readonly string[] {
      return this.#nameList;
    }
    get cssText(): string {
      return `@layer ${this.#nameList.join(", ")};`;
    }
    get [Symbol.toStringTag](): string {
      return "CSSLayerStatementRule";
    }
  }
  const importSheets = new WeakMap<ImportRule, Sheet>();
  class CSSImportRule extends CSSRule<3> implements ImportRule {
    #href: string;
    #condition: ImportCondition;
    #media: SheetMedia | undefined;
    constructor(token: symbol, href: string, condition: ImportCondition) {
      super(token, 3);
      this.#href = href;
      this.#condition = condition;
    }
    get href(): string {
      return this.#href;
    }
    get styleSheet(): Sheet | null {
      return importSheets.get(this) ?? null;
    }
    get layerName(): string | null {
      return this.#condition.layerName;
    }
    get supportsText(): string | null {
      return this.#condition.supportsText;
    }
    get media(): SheetMedia {
      return (this.#media ??= mediaList(this.#condition.media));
    }
    set media(value: string | null) {
      this.media.mediaText = value === null ? "" : value;
    }
    get cssText(): string {
      const { string }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
      const parts = [
        `@import ${this.#condition.resourceText ?? `url(${string.encode(this.href)})`}`,
      ];
      if (this.layerName !== null)
        parts.push(this.layerName ? `layer(${this.layerName})` : "layer");
      if (this.supportsText !== null) parts.push(`supports(${this.supportsText})`);
      if (this.media.mediaText) parts.push(this.media.mediaText);
      return parts.join(" ") + ";";
    }
  }
  function groupFor(rule: object): GroupState {
    const group = ruleRecord(rule).group;
    if (!group) throw new TypeError("Illegal invocation");
    return group;
  }

  abstract class CSSGroupingRule<
    Kind extends 0 | 1 | 4 | 6 | 12 = 0 | 1 | 4 | 6 | 12,
  > extends CSSRule<Kind> {
    abstract get cssText(): string;

    constructor(token: symbol, kind: Kind, rules: Rule[]) {
      super(token, kind);
      ruleRecord(this).group = { rules, owner: groupOwner };
    }
    get cssRules(): RuleList {
      const group = groupFor(this);
      return (group.list ??= group.owner.list(group.rules));
    }
    insertRule(rule: string, index = 0): number {
      const group = groupFor(this);
      if (arguments.length === 0) throw new TypeError("A CSS rule is required");
      const text = `${rule}`;
      const position = +index >>> 0;
      if (position > group.rules.length)
        throw new Exception("Rule index out of bounds", "IndexSizeError");
      const sheet = ruleRecord(this).parentStyleSheet ?? null;
      const mode = group.owner.nesting(this);
      if (mode && text.trimStart().startsWith("@")) {
        const ordinary = group.owner.parse(text, group.owner.namespaces(sheet));
        const entry = ordinary.rules[0];
        if (
          ordinary.rules.length === 1 &&
          entry &&
          !["media", "supports", "container", "scope", "layer-block"].includes(entry.kind)
        )
          throw new Exception(
            "This at-rule is not allowed inside a style rule",
            "HierarchyRequestError",
          );
      }
      const parsed = group.owner.parse(
        text,
        group.owner.namespaces(sheet),
        group.owner.nesting(this),
      );
      const { rules } = parsed;
      const errors = parsed.errors.filter((message) => message !== "Colon is expected");
      const entry = rules[0];
      if (
        !errors.length &&
        rules.length === 1 &&
        (entry?.kind === "import" || entry?.kind === "namespace")
      )
        throw new Exception(
          "Imports and namespace rules cannot be nested",
          "HierarchyRequestError",
        );
      let invalid = errors.length !== 0;
      if (invalid && entry?.kind === "style" && rules.length === 1) {
        const { parse }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
        try {
          parse(text, { context: "rule", parseValue: false });
          invalid = false;
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
      }
      if (invalid || rules.length !== 1 || !entry)
        throw new Exception("The rule could not be parsed", "SyntaxError");
      attach(entry, sheet, this);
      group.rules.splice(position, 0, entry);
      return position;
    }
    deleteRule(index: number): void {
      const group = groupFor(this);
      if (arguments.length === 0) throw new TypeError("A CSS rule index is required");
      const position = +index >>> 0;
      const entry = group.rules[position];
      if (!entry) throw new Exception("Rule index out of bounds", "IndexSizeError");
      detach(entry);
      group.rules.splice(position, 1);
    }
  }

  function nestingMode(rule: object): NestingMode | undefined {
    // Every parent step leaves a node in the finite, acyclic CSSOM rule tree.
    for (
      let current: object | null = rule;
      current;
      current = ruleRecord(current).parentRule ?? null
    ) {
      if (current instanceof CSSStyleRule) return "style";
      if (current instanceof CSSScopeRule) return "scope";
    }
    return undefined;
  }
  class CSSStyleRule extends CSSGroupingRule<1> implements DeclarationRule {
    constructor(
      token: symbol,
      selection: { current: RuleSelection },
      style: Declaration | (() => Declaration),
      rules: Rule[],
    ) {
      super(token, 1, rules);
      const record = ruleRecord(this);
      record.selection = selection;
      record.declaration = style;
    }
    get style(): PublicDeclaration {
      return exposeDeclaration(ruleDeclaration(this));
    }
    set style(value: string) {
      ruleDeclaration(this).cssText = `${value}`;
    }
    get selectorText(): string {
      return selectionFor(this).current.text;
    }
    set selectorText(value: string) {
      const slot = selectionFor(this),
        owner = groupFor(this).owner;
      const namespaces = owner.namespaces(ruleRecord(this).parentStyleSheet ?? null);
      const parent = ruleRecord(this).parentRule;
      const selection = owner.selector(
        `${value}`,
        namespaces,
        parent ? owner.nesting(parent) : undefined,
      );
      if (selection) slot.current = selection;
    }
    get cssText(): string {
      const children = groupFor(this)
        .rules.map((child) => child.view.cssText)
        .filter(Boolean);
      if (!children.length)
        return `${this.selectorText} { ${this.style.cssText}${this.style.length ? " " : ""}}`;
      const declarations = this.style.cssText;
      const parts = declarations ? [declarations, ...children] : children;
      return `${this.selectorText} {\n${parts.map((text) => `  ${text}`).join("\n")}\n}`;
    }
  }
  function selectionFor(rule: object) {
    const slot = ruleRecord(rule).selection;
    if (!slot) throw new TypeError("Illegal invocation");
    return slot;
  }
  class CSSNestedDeclarations extends CSSRule<0> implements NestedDeclarationsRule {
    constructor(token: symbol, style: Declaration) {
      super(token, 0);
      ruleRecord(this).declaration = style;
    }
    get style(): PublicDeclaration {
      return exposeDeclaration(ruleDeclaration(this));
    }
    set style(value: string) {
      ruleDeclaration(this).cssText = `${value}`;
    }
    get cssText(): string {
      return ruleDeclaration(this).cssText;
    }
    get [Symbol.toStringTag](): string {
      return "CSSNestedDeclarations";
    }
  }

  abstract class CSSConditionRule<
    Kind extends 0 | 4 | 12 = 0 | 4 | 12,
  > extends CSSGroupingRule<Kind> {
    abstract readonly conditionText: string;
    abstract readonly matches: boolean;
  }

  class CSSMarginRule extends CSSRule<9> {
    readonly #data: MarginData;
    constructor(token: symbol, data: MarginData) {
      super(token, 9);
      this.#data = data;
      bindCSSWrapper(data, this);
    }
    get name() {
      return this.#data.name;
    }
    get cssText() {
      return this.#data.cssText;
    }
    get style(): PublicDeclaration {
      return this.#data.style;
    }
    set style(value: string) {
      this.#data.style.cssText = value;
    }
    get [Symbol.toStringTag]() {
      return "CSSMarginRule";
    }
  }

  class CSSPageRule extends CSSGroupingRule<6> implements PageRule {
    readonly #data: PageData;
    readonly #rules: Rule[];
    constructor(token: symbol, parsed: BoundRule<PageData>, rules: Rule[]) {
      super(token, 6, rules);
      this.#rules = rules;
      this.#data = parsed.data;
      parsed.bind(this);
      for (const child of Array.from(this.#data.cssRules)) {
        rules.push({ kind: "margin", view: new CSSMarginRule(key, child) });
      }
    }
    get style(): PublicDeclaration {
      return this.#data.style;
    }
    set style(value: string) {
      this.#data.style.cssText = value;
    }
    get selectorText() {
      return this.#data.selectorText;
    }
    set selectorText(value: string) {
      this.#data.selectorText = value;
    }
    get cssText() {
      return this.#data.cssText;
    }
    override insertRule(text: string, index = 0) {
      const position = this.#data.insertRule(text, index);
      const entry: Rule = {
        kind: "margin",
        view: new CSSMarginRule(key, this.#data.cssRules[position]!),
      };
      this.#rules.splice(position, 0, entry);
      attach(entry, ruleRecord(this).parentStyleSheet ?? null, this);
      return position;
    }
    override deleteRule(index: number) {
      const position = +index >>> 0;
      this.#data.deleteRule(position);
      const [removed] = this.#rules.splice(position, 1);
      if (removed) detach(removed);
    }
    get [Symbol.toStringTag]() {
      return "CSSPageRule";
    }
  }

  class CSSFunctionRule extends CSSGroupingRule<0> {
    #data: FunctionRuleData<RuleList>;
    constructor(token: symbol, parsed: NonNullable<ReturnType<typeof parseFunction>>) {
      super(token, 0, []);
      this.#data = parsed.data;
      parsed.bind(this);
    }
    get name() {
      return this.#data.name;
    }
    get returnType() {
      return this.#data.returnType;
    }
    getParameters() {
      return this.#data.getParameters();
    }
    get cssText() {
      return this.#data.cssText;
    }
    override get cssRules() {
      return this.#data.cssRules;
    }
    override insertRule(...args: [string, number?]) {
      return this.#data.insertRule(...args);
    }
    override deleteRule(...args: [number]) {
      return this.#data.deleteRule(...args);
    }
    get [Symbol.toStringTag]() {
      return "CSSFunctionRule";
    }
  }
  class CSSStartingStyleRule extends CSSGroupingRule<0> {
    constructor(token: symbol, rules: Rule[]) {
      super(token, 0, rules);
    }
    get cssText(): string {
      return groupingText(this, "@starting-style");
    }
    get [Symbol.toStringTag](): string {
      return "CSSStartingStyleRule";
    }
  }

  class CSSLayerBlockRule extends CSSGroupingRule<0> implements LayerBlockRule {
    readonly #name: string;
    constructor(token: symbol, name: string, rules: Rule[]) {
      super(token, 0, rules);
      this.#name = name;
    }
    get name(): string {
      return this.#name;
    }
    get cssText(): string {
      return groupingText(this, this.#name ? `@layer ${this.#name}` : "@layer");
    }
    get [Symbol.toStringTag](): string {
      return "CSSLayerBlockRule";
    }
  }

  class CSSMediaRule extends CSSConditionRule<4> implements MediaRule {
    #initialCondition: string;
    #media: SheetMedia | undefined;
    constructor(token: symbol, conditionText: string, rules: Rule[]) {
      super(token, 4, rules);
      this.#initialCondition = conditionText;
    }
    get media(): SheetMedia {
      return (this.#media ??= mediaList(this.#initialCondition));
    }
    set media(value: string | null) {
      this.media.mediaText = value === null ? "" : value;
    }
    get conditionText(): string {
      return this.media.mediaText;
    }
    get matches(): boolean {
      return matchesMedia(this.media);
    }
    get cssText(): string {
      const heading = this.conditionText ? `@media ${this.conditionText}` : "@media";
      return groupingText(this, heading);
    }
  }

  class CSSScopeRule extends CSSGroupingRule<0> implements ScopeRule {
    readonly #start: string | null;
    readonly #end: string | null;
    constructor(
      token: symbol,
      bounds: { start: string | null; end: string | null },
      rules: Rule[],
    ) {
      super(token, 0, rules);
      this.#start = bounds.start;
      this.#end = bounds.end;
    }
    get start(): string | null {
      return this.#start;
    }
    get end(): string | null {
      return this.#end;
    }
    get cssText(): string {
      const start = this.#start === null ? "" : ` (${this.#start})`;
      const end = this.#end === null ? "" : ` to (${this.#end})`;
      return groupingText(this, `@scope${start}${end}`);
    }
    get [Symbol.toStringTag](): string {
      return "CSSScopeRule";
    }
  }

  class CSSContainerRule extends CSSConditionRule<0> implements ContainerRule {
    readonly #condition: NonNullable<ReturnType<typeof parseContainerConditions>>;
    constructor(
      token: symbol,
      condition: NonNullable<ReturnType<typeof parseContainerConditions>>,
      rules: Rule[],
    ) {
      super(token, 0, rules);
      this.#condition = condition;
    }
    get conditions() {
      return this.#condition.conditions;
    }
    get containerName() {
      return this.conditions.length === 1 ? this.conditions[0]!.name : "";
    }
    get containerQuery() {
      return this.conditions.length === 1 ? this.conditions[0]!.query : "";
    }
    get conditionText() {
      return this.#condition.text;
    }
    get matches(): boolean {
      return false;
    }
    get cssText(): string {
      return groupingText(this, `@container ${this.conditionText}`);
    }
    get [Symbol.toStringTag](): string {
      return "CSSContainerRule";
    }
  }

  class CSSSupportsRule extends CSSConditionRule<12> implements SupportsRule {
    #condition: string;
    #matches: boolean;
    constructor(token: symbol, condition: string, matches: boolean, rules: Rule[]) {
      super(token, 12, rules);
      this.#condition = condition;
      this.#matches = matches;
    }
    get conditionText(): string {
      return this.#condition;
    }
    get matches(): boolean {
      return this.#matches;
    }
    get cssText(): string {
      return groupingText(this, `@supports ${this.conditionText}`);
    }
  }

  function groupingText(rule: CSSGroupingRule, heading: string): string {
    const body = groupFor(rule)
      .rules.map((child) => child.view.cssText)
      .filter(Boolean)
      .map((text) => `  ${text}\n`)
      .join("");
    return `${heading} {\n${body}}`;
  }
  // Before a leaf is exposed or matched it has no editable child list or public identity.
  const noStyleChildren: Rule[] = [];
  let privateDeclarations: PrivateDeclarationCache | undefined;
  class PrivateStyleRule {
    readonly kind = "style" as const;
    rules = noStyleChildren;
    #view?: CSSStyleRule;
    #sheet: Sheet | null = null;
    #parent: RuleParents["parentRule"] = null;
    #declaration: RuleDeclarationFactory | undefined;
    #cascade?: Declaration | undefined;

    constructor(
      public selection: { current: RuleSelection },
      declaration: RuleDeclarationFactory,
    ) {
      this.#declaration = declaration;
    }

    cascadeDeclaration(): Declaration {
      if (this.#view) return ruleDeclaration(this.#view);
      const factory = this.#declaration;
      if (!factory) throw new Error("An unexposed rule must own its declaration factory");
      return (this.#cascade ??= factory((privateDeclarations ??= new WeakMap())));
    }

    get view(): CSSStyleRule {
      if (this.#view) return this.#view;
      const declaration = this.#declaration;
      if (!declaration) throw new Error("An unexposed style rule must own its declaration");
      // Private leaves may share a plan. Detach the editable selector slot on exposure.
      this.selection = { current: this.selection.current };
      const view = new CSSStyleRule(key, this.selection, declaration, (this.rules = []));
      const record = ruleRecord(view);
      record.parentStyleSheet = this.#sheet;
      record.parentRule = this.#parent;
      this.#declaration = undefined;
      this.#cascade = undefined;
      this.#sheet = null;
      this.#parent = null;
      return (this.#view = view);
    }

    attachWhilePrivate(sheet: Sheet | null, parent: RuleParents["parentRule"]): boolean {
      if (this.#view) return false;
      this.#sheet = sheet;
      this.#parent = parent;
      return true;
    }
  }

  function attach(
    rule: Rule,
    sheet: Sheet | null,
    parentRule: RuleParents["parentRule"] = null,
  ): void {
    if (rule instanceof PrivateStyleRule && rule.attachWhilePrivate(sheet, parentRule)) return;
    const record = ruleRecord(rule.view);
    record.parentRule = parentRule;
    record.parentStyleSheet = sheet;
    const declaration = record.declaration;
    if (declaration && typeof declaration !== "function")
      Reflect.set(declaration, "_parentRule", rule.view);
    // Recursion follows the finite rule tree produced by the parser.
    if (rule.kind === "keyframes") for (const child of rule.rules) attach(child, sheet, rule.view);
    if (
      rule.kind === "style" ||
      rule.kind === "media" ||
      rule.kind === "supports" ||
      rule.kind === "starting-style" ||
      rule.kind === "container" ||
      rule.kind === "scope" ||
      rule.kind === "layer-block" ||
      rule.kind === "page"
    ) {
      for (const child of rule.rules) attach(child, sheet, rule.view);
    }
  }
  function detach(rule: Rule): void {
    // Detachment clears sheet ownership without destroying author-held descendant lists.
    attach(rule, null);
  }
  const groupOwner: GroupOwner = {
    parse: parseRules,
    namespaces: namespacesForSheet,
    nesting: nestingMode,
    list: (rules) => new CSSRuleList(key, rules),
    selector: parseSelectorChange,
  };
  const interfaces = {
    key,
    PrivateStyleRule,
    CSSRule,
    CSSStyleRule,
    CSSNestedDeclarations,
    CSSFontFaceRule,
    CSSFontFeatureValuesRule,
    CSSPositionTryRule,
    descriptor,
    CSSViewTransitionRule,
    parseFontFace,
    parseFunction,
    CSSFunctionRule,
    parseProperty,
    parsePosition,
    CSSPropertyRule,
    CSSNamespaceRule,
    CSSCounterStyleRule,
    CSSKeyframesRule,
    CSSKeyframeRule,
    CSSMarginRule,
    CSSPageRule,
    CSSLayerStatementRule,
    CSSStartingStyleRule,
    CSSLayerBlockRule,
    CSSImportRule,
    setImportSheet(rule: ImportRule, sheet: Sheet) {
      importSheets.set(rule, sheet);
    },
    CSSMediaRule,
    CSSSupportsRule,
    CSSContainerRule,
    CSSScopeRule,
    CSSGroupingRule,
    CSSConditionRule,
    CSSRuleList,
    attach,
    detach,
  };
  // CSSOM's legacy setter converts its argument even for rules whose text is read-only.
  for (const binding of Object.values(interfaces)) {
    if (typeof binding !== "function" || !(binding.prototype instanceof CSSRule)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(binding.prototype, "cssText");
    if (descriptor?.get && !descriptor.set)
      Object.defineProperty(binding.prototype, "cssText", {
        ...descriptor,
        set(value: unknown) {
          cssInput(value);
        },
      });
  }
  return interfaces;
}

const stylesheetSourceVersion = Symbol();
type StyleOwner = Raw.Element & { [stylesheetSourceVersion]?: number };
/** Invalidates an already observed style source after a successful DOM source mutation. */
export function invalidateStyleSource(node: Raw.ParentNode): boolean {
  if (
    !tree.isElementNode(node) ||
    node.namespaceURI !== html.NS.HTML ||
    elementLocalName(node) !== "style"
  )
    return false;
  const owner: StyleOwner = node;
  const revision = owner[stylesheetSourceVersion];
  if (revision === undefined) return false;
  owner[stylesheetSourceVersion] = revision + 1;
  return true;
}

type InlineStyle = { text: string; style: Declaration; syncing: boolean };
let inlineStyles: WeakMap<Raw.Element, InlineStyle> | undefined;

let publicInlineViews: WeakMap<Raw.Element, PublicDeclaration> | undefined;

/** Updates an existing inline declaration after its content attribute changes. */
export function syncInlineStyle(node: Raw.Element): void {
  const entry = inlineStyles?.get(node);
  if (!entry) return;
  const text = node.attrs.find((attr) => !attr.namespace && attr.name === "style")?.value ?? "";
  if (entry.text === text) return;
  entry.syncing = true;
  try {
    entry.style.cssText = text;
    entry.text = text;
  } finally {
    entry.syncing = false;
  }
}

type Specificity = { readonly ids: number; readonly classes: number; readonly types: number };
const zeroSpecificity: Specificity = { ids: 0, classes: 0, types: 0 };
const specificityBase = 131_072;

function specificityScore(value: Specificity): number {
  // Three clamped 17-bit components fit exactly in a Number without carrying between columns.
  return (value.ids * specificityBase + value.classes) * specificityBase + value.types;
}

function selectorSpecificity(selector: Selector, nesting = zeroSpecificity): Specificity {
  const result = { ids: 0, classes: 0, types: 0 };
  // Recursive calls enter proper AST descendants; depth is bounded by the parsed token count.
  selector.children.forEach((node) => {
    const part = partSpecificity(node, nesting);
    result.ids = Math.min(specificityBase - 1, result.ids + part.ids);
    result.classes = Math.min(specificityBase - 1, result.classes + part.classes);
    result.types = Math.min(specificityBase - 1, result.types + part.types);
  });
  return result;
}

function argumentSpecificity(
  node: CssNode | null | undefined,
  nesting = zeroSpecificity,
): Specificity {
  if (node?.type === "Selector") return selectorSpecificity(node, nesting);
  if (node?.type === "Nth") return argumentSpecificity(node.selector ?? undefined, nesting);
  if (node?.type !== "SelectorList") return zeroSpecificity;
  let result = zeroSpecificity;
  node.children.forEach((selector) => {
    const candidate = argumentSpecificity(selector, nesting);
    if (specificityScore(candidate) > specificityScore(result)) result = candidate;
  });
  return result;
}

const wildcardPseudo =
  /^::(?:highlight|view-transition-(?:group(?:-children)?|image-pair|old|new))\(\*\)$/i;

function partSpecificity(node: CssNode, nesting = zeroSpecificity): Specificity {
  if (node.type === "NestingSelector") return nesting;
  if (node.type === "IdSelector") return { ids: 1, classes: 0, types: 0 };
  if (node.type === "ClassSelector" || node.type === "AttributeSelector")
    return { ids: 0, classes: 1, types: 0 };
  if (node.type === "TypeSelector")
    return { ids: 0, classes: 0, types: node.name === "*" || node.name.endsWith("|*") ? 0 : 1 };
  if (node.type !== "PseudoClassSelector" && node.type !== "PseudoElementSelector")
    return zeroSpecificity;
  const name = node.name.toLowerCase();
  if (name === "where") return zeroSpecificity;
  if (name === "is" || name === "not" || name === "has")
    return argumentSpecificity(node.children?.first, nesting);
  const hasSelectorArgument =
    name === "host" ||
    name === "host-context" ||
    name === "nth-child" ||
    name === "nth-last-child" ||
    name === "slotted";
  const argument = hasSelectorArgument
    ? argumentSpecificity(node.children?.first, nesting)
    : zeroSpecificity;
  const isElement = node.type === "PseudoElementSelector";
  if (
    isElement &&
    node.children?.first?.type === "Raw" &&
    node.children.first.value.trim() === "*" &&
    wildcardPseudo.test(`::${name}(*)`)
  )
    return zeroSpecificity;
  return {
    ids: argument.ids,
    classes: Math.min(specificityBase - 1, argument.classes + (isElement ? 0 : 1)),
    types: Math.min(specificityBase - 1, argument.types + (isElement ? 1 : 0)),
  };
}

function specificity(selector: Selector, nesting = zeroSpecificity): number {
  return specificityScore(selectorSpecificity(selector, nesting));
}

const maximumCachedSyntaxLength = 4096;
const maximumCachedSyntaxEntries = 32;
const stylesheetSyntax = new Map<string, CssNode>();
const maximumLargeStylesheetLength = 16_384;
const largeStylesheetSyntax = new Map<string, CssNode>();
const declarationBlocks = new Map<string, DeclarationBlock>();
// The syntax cache can retain a lookup key while the bounded text cache owns its snapshot.
const declarationBlockKeys = new WeakMap<Extract<CssNode, { type: "Block" }>, string>();
const syntaxDeclarationBlocks = new WeakMap<
  Extract<CssNode, { type: "Block" }>,
  DeclarationBlock
>();
const statelessSelections = new Map<string, ParsedRuleSelection>();
const windowSelections = new WeakMap<
  Parameters<typeof compileSelector>[0]["statePseudos"],
  Map<string, ParsedRuleSelection>
>();

function rememberSyntax<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit = maximumCachedSyntaxEntries,
): void {
  if (cache.size >= limit) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, value);
}

function parseStyleSheetSyntax(text: string, recent?: Map<string, WeakRef<CssNode>>) {
  const cache = text.length <= maximumCachedSyntaxLength ? stylesheetSyntax : largeStylesheetSyntax;
  const cached = cache.get(text);
  if (cached) return { ast: cached, errors: [] as string[], reused: true };
  const recurring = text.length <= 1536 && recent?.get(text)?.deref();
  if (recurring) {
    // Keep the strongly retained FIFO identical to an ordinary parse on this miss.
    rememberSyntax(cache, text, recurring);
    return { ast: recurring, errors: [] as string[], reused: true };
  }
  text = ownedString(text);
  const errors: string[] = [];
  const ast = parseNestingStyleSheet(
    text,
    {
      positions: /@property\b/i.test(text),
      parseRulePrelude: false,
      parseAtrulePrelude: false,
      parseValue: false,
      onParseError(error) {
        errors.push(error.message);
      },
    },
    (message) => errors.push(message),
  );
  // Consumers only read this AST. CSSOM rules and parse diagnostics are built for each sheet.
  if (!errors.length && text.length <= maximumLargeStylesheetLength) {
    const limit = cache === stylesheetSyntax ? maximumCachedSyntaxEntries : 8;
    if (recent && text.length <= 1536) rememberSyntax(recent, text, new WeakRef(ast), 192);
    rememberSyntax(cache, text, ast, limit);
  }
  return { ast, errors, reused: false };
}

function mediaLength(text: string): number | undefined {
  const match = /^([+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)(px|em|rem)?$/.exec(text);
  if (!match) return;
  const [, amount, unit] = match;
  const length = Number(amount);
  if (!Number.isFinite(length) || (!unit && length !== 0)) return;
  return length * (unit === "em" || unit === "rem" ? 16 : 1);
}

function compareMediaLength(left: number, operator: string, right: number): boolean {
  switch (operator) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "=":
      return left === right;
    default:
      return false;
  }
}

function mediaRange(text: string): MediaPredicate | undefined {
  const match =
    /^\(\s*([^<=>\s]+)\s*(<=|>=|<|>|=)\s*([^<=>\s]+)(?:\s*(<=|>=|<|>)\s*([^<=>\s]+))?\s*\)$/.exec(
      text,
    );
  if (!match) return;
  const [, left = "", operator = "", middle = "", upperOperator, right] = match;
  if (left === "width" || left === "height") {
    const bound = mediaLength(middle);
    if (bound !== undefined && !upperOperator)
      return (viewport) => compareMediaLength(viewport[left], operator, bound);
    return;
  }
  if (middle !== "width" && middle !== "height") return;
  const bound = mediaLength(left);
  if (bound === undefined) return;
  if (!upperOperator) return (viewport) => compareMediaLength(bound, operator, viewport[middle]);
  if (operator[0] !== upperOperator[0]) return;
  const upper = mediaLength(right ?? "");
  if (upper === undefined) return;
  return (viewport) =>
    compareMediaLength(bound, operator, viewport[middle]) &&
    compareMediaLength(viewport[middle], upperOperator, upper);
}

function mediaResolution(text: string): number | undefined {
  const match = /^([+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)(dppx|dpi|dpcm|x)$/i.exec(text);
  if (!match) return;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return;
  const unit = match[2]?.toLowerCase();
  if (unit === "dpi") return value / 96;
  if (unit === "dpcm") return (value * 2.54) / 96;
  return value;
}

function mediaFeature(text: string): MediaPredicate {
  const range = mediaRange(text);
  if (range) return range;
  const match = /^\(\s*(?:(min|max)-)?(width|height)\s*(?::\s*([^\s)]+)\s*)?\)$/.exec(text);
  if (match) {
    const [, bound, axis, amount] = match;
    const dimension = axis === "width" ? "width" : "height";
    if (amount === undefined) return (viewport) => bound === undefined && viewport[dimension] > 0;
    const pixels = mediaLength(amount);
    if (pixels === undefined) return () => null;
    const operator = bound === "min" ? ">=" : bound === "max" ? "<=" : "=";
    return (viewport) => compareMediaLength(viewport[dimension], operator, pixels);
  }
  const resolution =
    /^\(\s*(?:(min|max)-)?resolution\s*(?::\s*(?:calc\(([^()]+)\)|([^()\s]+))\s*)?\)$/.exec(text);
  if (resolution) {
    const [, bound, calculated, dimension] = resolution;
    const value = calculated ?? dimension;
    if (value === undefined) return (viewport) => bound === undefined && viewport.resolution > 0;
    const dppx = mediaResolution(value.trim());
    if (dppx === undefined) return () => null;
    const operator = bound === "min" ? ">=" : bound === "max" ? "<=" : "=";
    return (viewport) => compareMediaLength(viewport.resolution, operator, dppx);
  }
  const ratio =
    /^\(\s*(?:(min|max)-)?aspect-ratio\s*:\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*\)$/.exec(
      text,
    );
  if (ratio) {
    const [, bound, numerator, denominator = "1"] = ratio;
    const width = Number(numerator);
    const height = Number(denominator);
    if (!height) return () => null;
    return (viewport) => {
      const actual = viewport.width * height;
      const expected = viewport.height * width;
      if (bound === "min") return actual >= expected;
      if (bound === "max") return actual <= expected;
      return actual === expected;
    };
  }
  const orientation = /^\(\s*orientation\s*:\s*(portrait|landscape)\s*\)$/.exec(text)?.[1];
  if (orientation) return ({ width, height }) => width > height === (orientation === "landscape");
  if (/^\(\s*orientation\s*\)$/.test(text)) return () => true;
  if (/^\(\s*aspect-ratio\s*\)$/.test(text)) return ({ width, height }) => width > 0 && height > 0;
  return () => null;
}

// css-tree's installed declarations describe its older media query AST.
type MediaConditionNode = {
  type: string;
  name?: string;
  children?: { toArray(): MediaConditionNode[] };
};
type MediaQueryNode = {
  type: string;
  mediaType: string | null;
  modifier: string | null;
  condition: MediaConditionNode | null;
};

function compileMediaCondition(
  node: MediaConditionNode,
  render: (node: MediaConditionNode) => string,
  allowOr = true,
): MediaPredicate | undefined {
  if (node.type !== "Condition") return mediaFeature(render(node).toLowerCase());
  const children = node.children?.toArray() ?? [];
  const [first, second] = children;
  if (!first) return;
  if (first.type === "Identifier" && first.name?.toLowerCase() === "not") {
    if (!second || children.length !== 2 || second.type === "Identifier") return;
    const match = compileMediaCondition(second, render);
    return (
      match &&
      ((viewport) => {
        const value = match(viewport);
        return value === null ? null : !value;
      })
    );
  }

  const operator = second?.name?.toLowerCase();
  if (children.length > 1 && operator !== "and" && !(allowOr && operator === "or")) return;
  const predicates: MediaPredicate[] = [];
  for (const [index, child] of children.entries()) {
    if (index % 2) {
      if (child.type !== "Identifier" || child.name?.toLowerCase() !== operator) return;
    } else {
      if (child.type === "Identifier") return;
      const predicate = compileMediaCondition(child, render);
      if (!predicate) return;
      predicates.push(predicate);
    }
  }
  if (children.length % 2 === 0) return;
  const decisive = operator === "or";
  return (viewport) => {
    let unknown = false;
    for (const predicate of predicates) {
      const value = predicate(viewport);
      if (value === decisive) return decisive;
      if (value === null) unknown = true;
    }
    return unknown ? null : !decisive;
  };
}

type CSSTokenizer = {
  tokenTypes: Record<string, number>;
  tokenize: (text: string, token: (type: number, start: number, end: number) => void) => void;
};

function mediaQueryMembers(query: string, { tokenize, tokenTypes }: CSSTokenizer): string[] {
  const members: string[] = [];
  const closers: { token: number | undefined; text: string }[] = [];
  let start = 0;
  let hasContent = false;
  let unclosedComment = false;
  tokenize(query, (type, offset, end) => {
    if (type === tokenTypes.Comment) {
      unclosedComment = end === query.length && !query.endsWith("*/");
      return;
    }
    if (type === tokenTypes.WhiteSpace) return;
    if (type === tokenTypes.Comma && closers.length === 0) {
      members.push(hasContent ? query.slice(start, offset).trim() : "");
      start = end;
      hasContent = false;
      return;
    }
    hasContent = true;
    if (type === tokenTypes.Function || type === tokenTypes.LeftParenthesis) {
      closers.push({ token: tokenTypes.RightParenthesis, text: ")" });
    } else if (type === tokenTypes.LeftSquareBracket) {
      closers.push({ token: tokenTypes.RightSquareBracket, text: "]" });
    } else if (type === tokenTypes.LeftCurlyBracket) {
      closers.push({ token: tokenTypes.RightCurlyBracket, text: "}" });
    } else if (type === closers.at(-1)?.token) {
      closers.pop();
    }
  });
  if (hasContent) {
    // CSS component values implicitly close open blocks at the end of the input.
    const closing = closers
      .reverse()
      .map(({ text }) => text)
      .join("");
    members.push(query.slice(start).trim() + (unclosedComment ? "*/" : "") + closing);
  } else if (members.length) members.push("");
  return members;
}

function simplifyResolutionCalculations(
  item: CssNode,
  css: typeof import("css-tree") & CSSTokenizer,
): void {
  css.walk(item, (node) => {
    const feature = node as unknown as { type: string; name?: string; value?: CssNode };
    if (
      feature.type !== "Feature" ||
      !/^(?:(?:min|max)-)?resolution$/i.test(feature.name ?? "") ||
      feature.value?.type !== "Function" ||
      feature.value.name.toLowerCase() !== "calc"
    )
      return;
    const expression = css.generate(feature.value);
    let normalized = "";
    let cursor = 0;
    css.tokenize(expression, (type, start, end) => {
      if (type !== css.tokenTypes.Dimension) return;
      const resolution = mediaResolution(expression.slice(start, end));
      if (resolution === undefined) return;
      normalized += expression.slice(cursor, start) + `${resolution}dppx`;
      cursor = end;
    });
    normalized += expression.slice(cursor);
    const { utils }: typeof import("@asamuzakjp/css-color") = require("./css-runtime.cjs").cssColor;
    const result = utils.cssCalc(normalized);
    const resolution = mediaResolution(result);
    if (resolution === undefined) return;
    const simplified = css.parse(`calc(${resolution}dppx)`, { context: "value" });
    if (simplified.type === "Value" && simplified.children.first)
      feature.value = simplified.children.first;
  });
}

/** Parses a CSSOM media query and shares its evaluator with stylesheet media rules. */
type ParsedMediaQuery = {
  media: string;
  queries: string[];
  matches: (viewport: Viewport) => boolean;
};
// Parsing depends only on the text, and matches() reads the viewport on every call, so one
// shared, never-mutated parse serves every MediaList, rule and matchMedia list with that text.
const parsedMediaQueries = new Map<string, ParsedMediaQuery>();
export function parseMediaQuery(query: string): ParsedMediaQuery {
  const known = parsedMediaQueries.get(query);
  if (known) return known;
  const parsed = readMediaQuery(query);
  if (query.length <= 1024) rememberSyntax(parsedMediaQueries, query, parsed, 256);
  return parsed;
}

function readMediaQuery(query: string): ParsedMediaQuery {
  const css: typeof import("css-tree") & CSSTokenizer = require("./css-runtime.cjs").cssTree;
  const { parse, generate } = css;
  const render = (node: MediaConditionNode) => generate(node as CssNode);
  const predicates: MediaPredicate[] = [];
  const serialized = mediaQueryMembers(query, css).map((member) => {
    if (!member) return "not all";
    const reference = member.includes("(") ? defaultMediaQuery(member) : undefined;
    const fallback = () => {
      if (reference?.matches !== undefined) predicates.push(() => reference.matches!);
      return reference?.media ?? specifiedMediaQuery(member);
    };
    let item: CssNode;
    try {
      item = parse(member, { context: "mediaQuery" });
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return fallback();
    }
    if (/resolution\s*:/i.test(member) && /calc\(/i.test(member))
      simplifyResolutionCalculations(item, css);
    const node = item as CssNode & MediaQueryNode;
    if (node.type !== "MediaQuery") return fallback();
    const type = node.mediaType?.toLowerCase();
    const modifier = node.modifier?.toLowerCase();
    node.mediaType = type ?? null;
    node.modifier = modifier ?? null;
    const match = node.condition && compileMediaCondition(node.condition, render, !type);
    if ((node.condition && !match) || type === "and" || type === "or" || type === "layer")
      return fallback();
    const screen = !type || type === "all" || type === "screen";
    predicates.push((viewport) => {
      if (
        reference?.matches !== undefined &&
        viewport.width === 1024 &&
        viewport.height === 768 &&
        viewport.resolution === 1
      )
        return reference.matches;
      const value = screen ? (match ? match(viewport) : true) : false;
      return value === null ? null : value !== (modifier === "not");
    });
    return (
      reference?.media ??
      generate(item)
        .replace(/^all and /i, "")
        .replace(/:(?=\S)/g, ": ")
        .replace(/\s*(<=|>=|<|>|=)\s*/g, " $1 ")
    );
  });
  return {
    media: serialized.join(", "),
    queries: serialized,
    matches: (viewport) =>
      !serialized.length || predicates.some((match) => match(viewport) === true),
  };
}

const legacyPseudoElements = new Set(["after", "before", "first-letter", "first-line"]);
const simplePseudoElements = new Set([
  ...legacyPseudoElements,
  "file-selector-button",
  "marker",
  "placeholder",
  "selection",
  "target-text",
  "grammar-error",
  "spelling-error",
  "highlight",
]);
const detailsContentStates = new Set(["active", "dir", "focus", "focus-within", "hover", "lang"]);

function pseudoElementName(node: CssNode | undefined): string | undefined {
  if (node?.type !== "PseudoClassSelector" && node?.type !== "PseudoElementSelector") return;
  if (node.children !== null) return;
  const name = node.name.toLowerCase();
  if (legacyPseudoElements.has(name)) return name;
  if (node.type === "PseudoElementSelector" && simplePseudoElements.has(name)) return name;
}

function detailsContentIndex(parts: CssNode[]): number {
  return parts.findIndex(
    (part) =>
      part.type === "PseudoElementSelector" &&
      part.children === null &&
      part.name.toLowerCase() === "details-content",
  );
}

const neverMatchesElement = () => false;

function serializeSelectorPart(part: CssNode, relationalDepth = 0): string {
  const { generate, ident, walk }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  return generate(part, {
    decorator: (handlers) => ({
      ...handlers,
      node(node) {
        if (node.type === "PseudoClassSelector") {
          const name = ident.decode(node.name).toLowerCase();
          if (name === "has") {
            relationalDepth++;
            handlers.node(node);
            relationalDepth--;
            return;
          }
          const list = node.children?.first;
          if (
            relationalDepth &&
            (name === "is" || name === "where") &&
            list?.type === "SelectorList"
          ) {
            const branches = list.children.toArray().map((branch) => {
              let invalid = false;
              walk(branch, (part) => {
                if (
                  part.type === "PseudoClassSelector" &&
                  ident.decode(part.name).toLowerCase() === "has"
                )
                  invalid = true;
              });
              // Invalid forgiving branches remain raw tokens in CSSOM. They never
              // acquire the canonical combinator spacing of a valid selector.
              return invalid ? generate(branch) : serializeSelectorPart(branch, relationalDepth);
            });
            handlers.node({ type: "Raw", value: `:${node.name}(${branches.join(", ")})` });
            return;
          }
        }
        if (node.type === "SelectorList") {
          handlers.node({
            type: "Raw",
            value: node.children
              .toArray()
              .map((child) => serializeSelectorPart(child, relationalDepth))
              .join(", "),
          });
          return;
        }
        if (node.type === "Combinator" && node.name !== " ") {
          handlers.node({ type: "Raw", value: ` ${node.name} ` });
          return;
        }
        if (
          node.type === "PseudoClassSelector" &&
          ident.decode(node.name).toLowerCase() === "state"
        ) {
          let name: string;
          try {
            name = customStateIdentifier(node);
          } catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
            // Keep invalid syntax for the selector validator, which owns rule/forgiving-branch rejection.
            handlers.node(node);
            return;
          }
          handlers.node({ type: "Raw", value: `:state(${ident.encode(name)})` });
          return;
        }
        if (node.type === "AttributeSelector" && node.flags) {
          const text = generate({ ...node, flags: null });
          handlers.node({
            type: "Raw",
            value: `${text.slice(0, -1)} ${ident.decode(node.flags).toLowerCase()}]`,
          });
        } else handlers.node(node);
      },
    }),
  });
}

function parseRuleSelection({
  text,
  isXML,
  statePseudos,
  requireMatchable,
  featureQuery = false,
  namespaces,
  nesting,
  parentSelection,
}: {
  text: string;
  isXML: boolean;
  statePseudos: Parameters<typeof compileSelector>[0]["statePseudos"];
  requireMatchable: boolean;
  nesting?: NestingMode | undefined;
  parentSelection?: RuleSelection | undefined;
  featureQuery?: boolean;
  namespaces?: ReadonlyMap<string, string> | undefined;
}): RuleSelection | undefined {
  const { parse, generate, walk, ident }: typeof import("css-tree") =
    require("./css-runtime.cjs").cssTree;
  const selectorText = normalizeNestingSelector(cssInput(text, false).trim(), nesting);
  if (!selectorText) return;
  if (
    !nesting &&
    /::(?:highlight|selection|grammar-error|spelling-error|target-text)\b/i.test(selectorText) &&
    !validPseudoSelectorList(selectorText, namespaces)
  )
    return;
  let canonicalText: string | undefined;
  if (!nesting && (selectorText.includes(":") || selectorText.includes("\\"))) {
    canonicalText = canonicalSelectorList(selectorText, namespaces);
    if (canonicalText === undefined) return;
  }
  // State-independent functional selectors and pseudo-elements can share the
  // same compiled matchers across Windows. Unknown or escaped pseudos stay local.
  if (!nesting && !namespaces?.size) {
    const pure = /::(?:slotted|part)\(/i.test(selectorText)
      ? undefined
      : purePseudoSelector(selectorText);
    if (pure === null) return;
    if (pure) {
      const [ids, classes, types] = pure.specificity;
      return {
        text: canonicalText ?? pure.text,
        entries: [
          {
            match: neverMatchesElement,
            pseudo: { text: pure.text, match: () => true },
            hostOnly: false,
            specificity: specificityScore({ ids, classes, types }),
          },
        ],
      };
    }
  }
  let selections: Map<string, ParsedRuleSelection> | undefined;
  if (
    !featureQuery &&
    !namespaces?.size &&
    selectorText.length <= maximumCachedSyntaxLength &&
    !selectorText.includes("&")
  ) {
    const stateless =
      !selectorText.includes("\\") &&
      !/:(?!:|(?:where|is|not|has|before|after)(?![\w-]))/i.test(selectorText);
    if (stateless) {
      selections = statelessSelections;
    } else {
      selections = windowSelections.get(statePseudos);
      if (!selections) {
        selections = new Map();
        windowSelections.set(statePseudos, selections);
      }
    }
  }
  const cacheKey = `${isXML}:${selectorText}`;
  const cached = selections?.get(cacheKey);
  if (cached) return !requireMatchable || cached.allMatchable ? cached.selection : undefined;
  // A single unescaped class or ID is already in CSSOM serialization form.
  const simple = !namespaces?.size && compileSimpleSubject(selectorText);
  if (simple) {
    const selection = {
      text: selectorText,
      treeDependent: true,
      entries: [
        {
          match: simple,
          hostOnly: false,
          subjectKey: selectorText,
          specificity: selectorText.startsWith("#") ? specificityBase ** 2 : specificityBase,
        },
      ],
    };
    return selection;
  }
  let prelude: CssNode;
  try {
    prelude = featureQuery
      ? parse(selectorText, { context: "selectorList" })
      : parseSelectorList(selectorText);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return;
  }
  if (prelude.type !== "SelectorList" || (featureQuery && prelude.children.size !== 1)) return;
  let invalidCompound = false;
  walk(prelude, {
    visit: "Selector",
    enter(selector) {
      if (!validSelectorCompounds(selector)) invalidCompound = true;
    },
  });
  if (invalidCompound) return;
  if (featureQuery) {
    let logicalDepth = 0;
    let invalid = false;
    const logical = (node: CssNode) =>
      node.type === "PseudoClassSelector" &&
      /^(?:is|where|has|not)$/.test(ident.decode(node.name).toLowerCase());
    walk(prelude, {
      enter(node: CssNode) {
        if (logical(node)) logicalDepth++;
        if (
          logicalDepth &&
          (node.type === "PseudoElementSelector" ||
            (node.type === "PseudoClassSelector" &&
              legacyPseudoElements.has(ident.decode(node.name).toLowerCase())))
        )
          invalid = true;
      },
      leave(node: CssNode) {
        if (logical(node)) logicalDepth--;
      },
    });
    if (invalid) return;
  }
  let containsNesting = false;
  walk(prelude, {
    enter(node: CssNode) {
      if (node.type === "NestingSelector") containsNesting = true;
    },
  });
  let nestingScore = 0;
  for (const entry of parentSelection?.entries ?? [])
    nestingScore = Math.max(nestingScore, entry.specificity);
  const nestingSpecificity = {
    ids: Math.floor(nestingScore / specificityBase / specificityBase),
    classes: Math.floor(nestingScore / specificityBase) % specificityBase,
    types: nestingScore % specificityBase,
  };
  let alias = "run-dom-css-nesting";
  const decodedSelector = ident.decode(selectorText).toLowerCase();
  // Each collision adds a character, bounded by the finite authored selector's length.
  while (decodedSelector.includes(alias) || Object.hasOwn(statePseudos, alias)) alias += "-";
  function matcherSource(selector: CssNode): string {
    if (!containsNesting) return generate(selector);
    return generate(selector, {
      decorator: (handlers) => ({
        ...handlers,
        node(node) {
          if (node.type === "NestingSelector")
            handlers.node({ type: "Raw", value: parentSelection ? `:${alias}` : ":where(:scope)" });
          else handlers.node(node);
        },
      }),
    });
  }
  const compileOptions = {
    isXML,
    statePseudos: selections === statelessSelections ? {} : statePseudos,
    strictSyntax: featureQuery,
    namespaces,
  };
  const selectors: SelectorEntry[] = [];
  const serializedSelectors: string[] = [];
  let treeOnly = true;
  prelude.children.forEach((selector) => {
    if (selector.type !== "Selector") return;
    const parts = selector.children.toArray();
    const partIndex = parts.findIndex(
      (n) => n.type === "PseudoElementSelector" && n.name.toLowerCase() === "part",
    );
    if (partIndex !== -1) {
      const part = parts[partIndex];
      if (part?.type !== "PseudoElementSelector" || !part.children?.first) return;
      const syntax = parse(generate(part.children.first), { context: "value" });
      if (
        syntax.type !== "Value" ||
        syntax.children.isEmpty ||
        syntax.children.some((n) => n.type !== "Identifier")
      )
        return;
      const names = syntax.children
        .toArray()
        .map((n) => ident.decode((n as { name: string }).name));
      const head = parts.slice(0, partIndex);
      if (head.some((n) => n.type === "PseudoElementSelector")) return;
      const single = head.length === 1 ? head[0] : undefined;
      const host =
        single?.type === "PseudoClassSelector" && single.name.toLowerCase() === "host"
          ? single
          : undefined;
      const nested =
        single?.type === "NestingSelector" && parentSelection?.entries.some((e) => e.hostOnly);
      const from = host
        ? host.children?.first
          ? generate(host.children.first)
          : "*"
        : head.map((n) => generate(n)).join("") || "*";
      const origin = nested
        ? (node: Raw.Element) => parentSelection!.entries.some((e) => e.hostOnly && e.match(node))
        : compileSelector({ selector: from, ...compileOptions });
      const suffix = parts.slice(partIndex + 1);
      const last = suffix.at(-1);
      const pseudo =
        last?.type === "PseudoElementSelector" ? computedPseudoTarget(generate(last)) : undefined;
      if (pseudo) suffix.pop();
      if (suffix.some((n) => n.type !== "PseudoClassSelector")) return;
      const match = compileSelector({
        selector:
          "*" +
          suffix
            .map((n) =>
              generate(n, {
                decorator: (handlers) => ({
                  ...handlers,
                  node(child) {
                    if (
                      child.type === "PseudoClassSelector" &&
                      /^(?:empty|root|scope|has|host|host-context|(?:first|last|only|nth|nth-last)-(?:child|of-type))$/i.test(
                        ident.decode(child.name),
                      )
                    )
                      handlers.node({ type: "Raw", value: ":not(*)" });
                    else handlers.node(child);
                  },
                }),
              }),
            )
            .join(""),
        ...compileOptions,
      });
      selectors.push({
        part: { names, local: !!host || !!nested, origin },
        match: pseudo ? neverMatchesElement : match,
        ...(pseudo && { pseudo: { text: pseudo, match } }),
        specificity: specificity(selector, nestingSpecificity),
        hostOnly: false,
      });
      serializedSelectors.push(serializeSelectorPart(selector));
      treeOnly = false;
      return;
    }
    const slotIndex = parts.findIndex(
      (n) => n.type === "PseudoElementSelector" && n.name.toLowerCase() === "slotted",
    );
    const slotted = parts[slotIndex];
    if (slotted?.type === "PseudoElementSelector") {
      const suffix = parts.slice(slotIndex + 1);
      const pseudo =
        suffix.length === 1 && suffix[0]?.type === "PseudoElementSelector"
          ? computedPseudoTarget(generate(suffix[0]))
          : undefined;
      if (suffix.length && !pseudo) return;
      const argument = slotted.children?.first;
      if (
        argument?.type !== "Selector" ||
        slotted.children?.size !== 1 ||
        argument.children.some(
          (part) => part.type === "Combinator" || part.type === "PseudoElementSelector",
        )
      )
        return;
      try {
        const origin = parts
          .slice(0, slotIndex)
          .map((part) => generate(part))
          .join("");
        const match = compileSelector({ selector: generate(argument), ...compileOptions });
        const slot = compileSelector({ selector: origin || "*", ...compileOptions });
        selectors.push({
          match: pseudo ? neverMatchesElement : match,
          ...(pseudo && { pseudo: { text: pseudo, match } }),
          slot,
          hostOnly: true,
          specificity: specificity(selector, nestingSpecificity),
        });
        serializedSelectors.push(serializeSelectorPart(selector));
        treeOnly = false;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
      return;
    }
    const detailsIndex = detailsContentIndex(parts);
    const tail = parts.at(-1);
    const trailingPseudo =
      pseudoElementName(tail) ??
      (tail?.type === "PseudoElementSelector"
        ? (wildcardPseudo.test(generate(tail))
            ? generate(tail).toLowerCase()
            : computedPseudoTarget(generate(tail))
          )?.slice(2)
        : undefined);
    let pseudoText = "";
    let detailsStates = "";
    let validPseudo = true;
    if (detailsIndex !== -1) {
      const suffix = parts.splice(detailsIndex).slice(1);
      pseudoText = "::details-content";
      for (const [index, part] of suffix.entries()) {
        const child = pseudoElementName(part);
        if (child && legacyPseudoElements.has(child) && index === suffix.length - 1) {
          pseudoText += `::${child}`;
        } else if (
          part.type === "PseudoClassSelector" &&
          detailsContentStates.has(part.name.toLowerCase())
        ) {
          const state = generate(part);
          pseudoText += state;
          detailsStates += state;
        } else {
          pseudoText += generate(part);
          validPseudo = false;
        }
      }
    } else if (trailingPseudo) {
      parts.pop();
      pseudoText = `::${trailingPseudo}`;
      if (trailingPseudo === "marker") {
        const parent = pseudoElementName(parts.at(-1));
        if (parent === "before" || parent === "after") {
          parts.pop();
          pseudoText = `::${parent}::marker`;
        }
      }
    }
    let serialized = parts
      .map((part, index) => {
        if (part.type === "TypeSelector") {
          const separator = part.name.indexOf("|");
          const prefix = separator < 0 ? undefined : part.name.slice(0, separator);
          const local = part.name.slice(separator + 1);
          const hasDefault = namespaces?.has("") === true;
          const redundant =
            prefix === undefined ||
            (prefix === "*"
              ? !hasDefault
              : !!prefix &&
                namespaces?.has(prefix) &&
                namespaces.get(prefix) === namespaces.get(""));
          if (redundant) {
            const next = parts[index + 1];
            if (local === "*" && (next ? next.type !== "Combinator" : !!pseudoText)) return "";
            return generate({ ...part, name: local });
          }
        }
        if (part.type === "AttributeSelector" && part.name.name.startsWith("|"))
          return generate({ ...part, name: { ...part.name, name: part.name.name.slice(1) } });
        const text = serializeSelectorPart(part);
        return text;
      })
      .join("");
    serializedSelectors.push((serialized + pseudoText).trim());
    if (!validPseudo) return;
    try {
      if (pseudoText) {
        // Validate the originating selector while keeping pseudo-elements out of element matching.
        const origin = parts.map((part) => generate(part)).join("");
        const subject = parts.at(-1)?.type === "Combinator" ? `${origin}*` : origin || "*";
        const originMatches = compileSelector({ selector: subject, ...compileOptions });
        if (detailsStates) compileSelector({ selector: `*${detailsStates}`, ...compileOptions });
        selectors.push({
          match: neverMatchesElement,
          pseudo: { text: pseudoText, match: originMatches },
          specificity: specificity(selector, nestingSpecificity),
          hostOnly: false,
        });
        return;
      }
      const host = selector.children.first;
      if (host?.type === "PseudoClassSelector" && host.name.toLowerCase() === "host") {
        treeOnly = false;
        if (selector.children.size !== 1) return;
        const argument = host.children?.first;
        if (
          host.children &&
          (host.children.size !== 1 ||
            argument?.type !== "Selector" ||
            argument.children.some((part) => part.type === "Combinator"))
        )
          return;
        const match =
          argument?.type === "Selector"
            ? compileSelector({ selector: generate(argument), ...compileOptions })
            : () => true;
        selectors.push({
          match,
          hostOnly: true,
          specificity: specificity(selector, nestingSpecificity),
        });
        return;
      }
      const source = matcherSource(selector);
      function compile(root?: Raw.ParentNode) {
        const state =
          parentSelection && containsNesting
            ? {
                ...compileOptions.statePseudos,
                [alias]: (node: Raw.Element) =>
                  parentSelection.entries.some((entry) => entry.match(node, root)),
              }
            : compileOptions.statePseudos;
        return compileSelector({
          ...compileOptions,
          selector: source,
          statePseudos: state,
          ...(root ? { scope: root } : {}),
        });
      }
      const treeMatcher =
        !namespaces?.size && !featureQuery && !/[\\&]/.test(source)
          ? compileTreeSelector(parts, isXML, compileOptions.statePseudos)
          : undefined;
      treeOnly &&= treeMatcher !== undefined && !source.includes(":");
      const unscoped = treeMatcher ?? compile();
      let scoped: WeakMap<Raw.ParentNode, (node: Raw.Element) => boolean> | undefined;
      const match: SelectorEntry["match"] =
        /:scope\b/i.test(source) || (containsNesting && parentSelection !== undefined)
          ? (node, root) => {
              if (!root) return unscoped(node);
              const cache = (scoped ??= new WeakMap());
              let matcher = cache.get(root);
              if (!matcher) {
                matcher = compile(root);
                cache.set(root, matcher);
              }
              return matcher(node);
            }
          : unscoped;
      // Only direct, positive tests in the subject compound constrain candidates.
      let subjectKey: string | undefined;
      let subjectType: string | undefined;
      for (const part of selector.children) {
        if (part.type === "Combinator") {
          subjectKey = undefined;
          subjectType = undefined;
        } else if (part.type === "TypeSelector" && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(part.name)) {
          subjectType = part.name.toLowerCase();
        } else if (part.type === "IdSelector")
          subjectKey = `#${ident.decode(part.name.toWellFormed())}`;
        else if (part.type === "ClassSelector" && subjectKey === undefined)
          subjectKey = `.${ident.decode(part.name.toWellFormed())}`;
      }
      selectors.push({
        match,
        specificity: specificity(selector, nestingSpecificity),
        hostOnly: false,
        ...(subjectKey === undefined ? {} : { subjectKey }),
        ...(subjectType === undefined ? {} : { subjectType }),
      });
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "SyntaxError") throw error;
    }
  });
  let serializedText = serializedSelectors.join(", ");
  if (/:(?:is|where)\(/i.test(selectorText)) {
    try {
      parse(selectorText, { context: "selectorList" });
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      serializedText = selectorText;
      // Native grammar has already validated the surviving forgiving branches.
      const css: typeof import("css-tree") & {
        tokenTypes: { Comma: number };
        tokenize: (text: string, visit: (type: number, start: number, end: number) => void) => void;
      } = require("./css-runtime.cjs").cssTree;
      let cursor = 0,
        formatted = "";
      css.tokenize(selectorText, (type, start, end) => {
        if (type !== css.tokenTypes.Comma) return;
        formatted += selectorText.slice(cursor, start).trimEnd() + ", ";
        cursor = end;
        while (cursor < selectorText.length && /[\t\n\f\r ]/.test(selectorText[cursor] ?? ""))
          cursor++;
      });
      serializedText = formatted + selectorText.slice(cursor);
    }
  }
  const selection = {
    text: canonicalText ?? serializedText,
    entries: selectors,
    containsNesting,
    ...(treeOnly && !containsNesting && { treeDependent: true }),
  };
  const allMatchable = selectors.length === prelude.children.size;
  if (!containsNesting && selections)
    rememberSyntax(selections, cacheKey, { selection, allMatchable }, 128);
  return !requireMatchable || allMatchable ? selection : undefined;
}

type StylesheetDeclaration = Declaration & {
  snapshotBlock: (limit?: number, characterLimit?: number) => DeclarationBlock | undefined;
  restoreBlock: (block: DeclarationBlock) => void;
};

function readStylesheetDeclaration(
  style: Declaration,
  entry: Extract<CssNode, { type: "Declaration" }>,
  generate: (typeof import("css-tree"))["generate"],
): void {
  const priority = entry.important ? "important" : "";
  if (!priority && style.getPropertyPriority(entry.property) === "important") return;
  const value = generate(entry.value);
  if (entry.property.toLowerCase() === "outline") style[setParsedOutline](value, priority, true);
  else style.setProperty(entry.property, value, priority);
}

type PrivateDeclarationCache = WeakMap<DeclarationBlock, WeakRef<Declaration>>;
type RuleDeclarationFactory = (cache?: PrivateDeclarationCache) => Declaration;

function deferredDeclaration(
  declaration: () => StylesheetDeclaration,
  block: Extract<CssNode, { type: "Block" }>,
  generate: (typeof import("css-tree"))["generate"],
  retainedSource: boolean,
): RuleDeclarationFactory {
  return (cache) => {
    function restore(snapshot: DeclarationBlock): Declaration {
      const known = cache?.get(snapshot)?.deref();
      if (known) return known;
      const style = declaration();
      style.restoreBlock(snapshot);
      cache?.set(snapshot, new WeakRef(style));
      return style;
    }
    const syntaxSnapshot = retainedSource ? syntaxDeclarationBlocks.get(block) : undefined;
    if (syntaxSnapshot) return restore(syntaxSnapshot);
    let key = retainedSource ? declarationBlockKeys.get(block) : undefined;
    if (key === undefined && block.children.size <= 64) {
      const text = generate(block);
      if (text && text.length <= 2048) {
        key = text;
        if (retainedSource) declarationBlockKeys.set(block, key);
      }
    }
    const cached = key === undefined ? undefined : declarationBlocks.get(key);
    if (cached) return restore(cached);
    const style = declaration();
    for (const child of block.children)
      if (child.type === "Declaration") readStylesheetDeclaration(style, child, generate);
    const large = retainedSource && block.children.size > 64 && block.children.size <= 512;
    if (large || key !== undefined) {
      const snapshot = large ? style.snapshotBlock(512, 16_384) : style.snapshotBlock();
      if (snapshot) {
        cache?.set(snapshot, new WeakRef(style));
        if (large) syntaxDeclarationBlocks.set(block, snapshot);
        else if (key !== undefined) rememberSyntax(declarationBlocks, key, snapshot, 256);
      }
    }
    return style;
  };
}

// The pinned generator re-emits every token of raw text and only appends a newline after a
// backslash delimiter, so backslash-free raw text is already its own serialization.
function preludeText(prelude: CssNode, generate: (typeof import("css-tree"))["generate"]): string {
  return prelude.type === "Raw" && !prelude.value.includes("\\")
    ? prelude.value
    : generate(prelude);
}

type FlatStyleRule = {
  current: RuleSelection;
  declaration: RuleDeclarationFactory;
};

function prepareFlatRules(input: {
  ast: Extract<CssNode, { type: "StyleSheet" }>;
  generate: (typeof import("css-tree"))["generate"];
  declaration: () => StylesheetDeclaration;
  isXML: boolean;
  statePseudos: Parameters<typeof compileSelector>[0]["statePseudos"];
}): readonly FlatStyleRule[] | null {
  const { ast, generate, declaration, isXML, statePseudos } = input;
  if (
    ast.children.size > 64 ||
    ast.children.some((node) => node.type !== "Rule" || !hasOnlyDeclarations(node.block))
  )
    return null;
  const plan: FlatStyleRule[] = [];
  for (const node of ast.children) {
    if (node.type !== "Rule") continue;
    const selection = parseRuleSelection({
      text: preludeText(node.prelude, generate),
      isXML,
      statePseudos,
      requireMatchable: false,
    });
    if (selection)
      plan.push({
        current: selection,
        declaration: deferredDeclaration(declaration, node.block, generate, true),
      });
  }
  return plan;
}

let sheetSyntaxEngine: typeof import("css-tree") | undefined;
function parseSheet(
  text: string,
  isXML: boolean,
  statePseudos: Parameters<typeof compileSelector>[0]["statePseudos"],
  interfaces: ReturnType<typeof createRuleInterfaces>,
  declaration: () => StylesheetDeclaration,
  supports: (condition: string) => ReturnType<typeof readSupportsCondition>,
  flatPlans: WeakMap<CssNode, readonly FlatStyleRule[] | null>,
  recentSyntax: Map<string, WeakRef<CssNode>>,
  namespaces?: Map<string, string>,
  nesting?: NestingMode,
  syntax?: ReturnType<typeof parseStyleSheetSyntax>,
): Omit<SheetRecord, "sheet"> {
  const { parse, generate, ident } = (sheetSyntaxEngine ??= require("./css-runtime.cjs")
    .cssTree as typeof import("css-tree"));
  // The parser retains its latest recovery callback. That callback captures only the error list.
  const { ast, errors, reused } =
    syntax ?? parseStyleSheetSyntax(nesting ? `x { ${text} }` : text, recentSyntax);
  const rules: Rule[] = [];
  if (ast.type !== "StyleSheet") return { text, rules, errors };

  // A cacheable one-rule sheet can publish its first compilation directly into the
  // per-Window plan. Its next owner only needs independent mutable CSSOM slots.
  const cacheSingleRule =
    ast.children.size === 1 &&
    ast.children.first?.type === "Rule" &&
    errors.length === 0 &&
    text.length <= maximumLargeStylesheetLength;
  if ((reused || cacheSingleRule) && !namespaces?.size && nesting === undefined) {
    let plan = flatPlans.get(ast);
    if (plan === undefined) {
      plan = prepareFlatRules({ ast, generate, declaration, isXML, statePseudos });
      flatPlans.set(ast, plan);
    }
    if (plan) {
      // CSSOM keeps independent rule and selector slots even when sources recur.
      for (const entry of plan) {
        rules.push(new interfaces.PrivateStyleRule(entry, entry.declaration));
      }
      return { text, rules, errors };
    }
  }

  function addLayerBlock(
    name: string,
    block: Extract<CssNode, { type: "Block" }>,
    target: Rule[],
    mode?: NestingMode,
  ): void {
    const nested: Rule[] = [];
    readContents(block, nested, mode);
    target.push({
      kind: "layer-block",
      rules: nested,
      view: new interfaces.CSSLayerBlockRule(interfaces.key, name, nested),
    });
  }

  function readContents(
    block: Extract<CssNode, { type: "Block" }>,
    target: Rule[],
    mode?: NestingMode,
    leading?: Declaration,
  ): void {
    let current = leading;
    function publish(): void {
      if (current && current !== leading && current.length)
        target.push({
          kind: "nested-declarations",
          view: new interfaces.CSSNestedDeclarations(interfaces.key, current),
        });
      current = undefined;
    }
    // Native parsing bounds iteration to this block's finite child list.
    for (const child of block.children) {
      if (child.type === "Declaration") {
        if (!mode) continue;
        current ??= declaration();
        readStylesheetDeclaration(current, child, generate);
      } else if (child.type === "Rule" || child.type === "Atrule") {
        const children: Rule[] = [];
        readRule(child, children, mode);
        if (children.length) {
          publish();
          target.push(...children);
        }
      }
    }
    publish();
  }

  function readRule(node: CssNode, target: Rule[], mode?: NestingMode): void {
    if (node.type === "Atrule" && node.name === "starting-style" && !node.prelude && node.block) {
      const rules: Rule[] = [];
      readContents(node.block, rules, mode);
      target.push({
        kind: "starting-style",
        rules,
        view: new interfaces.CSSStartingStyleRule(interfaces.key, rules),
      });
      return;
    }
    if (
      mode &&
      node.type === "Atrule" &&
      !(mode === "scope" && node.name === "property") &&
      !["media", "supports", "container", "layer", "scope", "import", "namespace"].includes(
        node.name,
      )
    )
      return;
    if (mode === "style" && node.type === "Atrule" && node.name === "layer" && !node.block) return;
    if (node.type === "Atrule" && node.name === "scope" && node.block) {
      const bounds: { start: string | null; end: string | null } = { start: null, end: null };
      if (node.prelude) {
        const text = generate(node.prelude).trim();
        let prelude: CssNode;
        try {
          prelude = parse(text, { context: "atrulePrelude", atrule: "scope", positions: true });
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
          return;
        }
        if (prelude.type !== "AtrulePrelude") return;
        // CSS-tree supplies Scope nodes that are absent from its declaration package.
        type ScopePrelude = { type: "Scope"; root: CssNode | null; limit: CssNode | null };
        const parsed = prelude.children.first as CssNode | ScopePrelude | null;
        if (parsed?.type !== "Scope") return;
        for (const boundary of [parsed.root, parsed.limit]) {
          if (!boundary) continue;
          if (boundary.type !== "SelectorList" || !boundary.children.size) return;
          const invalid = boundary.children
            .toArray()
            .some(
              (selector) =>
                selector.type !== "Selector" ||
                !selector.children.toArray().some((part) => part.type !== "Combinator") ||
                selector.children.toArray().some((part) => part.type === "PseudoElementSelector"),
            );
          if (invalid) return;
        }
        const root = parsed.root?.loc;
        const limit = parsed.limit?.loc;
        if (root) bounds.start = text.slice(root.start.offset, root.end.offset);
        if (limit) bounds.end = text.slice(limit.start.offset, limit.end.offset);
      }
      const nested: Rule[] = [];
      readContents(node.block, nested, "scope");
      target.push({
        kind: "scope",
        rules: nested,
        view: new interfaces.CSSScopeRule(interfaces.key, bounds, nested),
      });
      return;
    }
    if (node.type === "Atrule" && node.name === "container" && node.prelude && node.block) {
      const condition = parseContainerConditions(generate(node.prelude));
      if (!condition) return;
      const nested: Rule[] = [];
      readContents(node.block, nested, mode);
      target.push({
        kind: "container",
        rules: nested,
        view: new interfaces.CSSContainerRule(interfaces.key, condition, nested),
      });
      return;
    }
    if (node.type === "Atrule" && node.name === "keyframes" && node.prelude && node.block) {
      const name = parseKeyframesName(generate(node.prelude));
      if (name === undefined) return;
      const frames: KeyframeEntry[] = [];
      for (const child of node.block.children) {
        if (child.type !== "Rule") continue;
        const offsets = normalizedKeyframes(generate(child.prelude));
        if (offsets === undefined) continue;
        const style = declaration();
        for (const entry of child.block.children) {
          if (entry.type === "Declaration" && !entry.important)
            style.setProperty(entry.property, generate(entry.value));
        }
        frames.push({
          kind: "keyframe",
          view: new interfaces.CSSKeyframeRule(interfaces.key, offsets, style),
        });
      }
      target.push({
        kind: "keyframes",
        rules: frames,
        view: new interfaces.CSSKeyframesRule(interfaces.key, name, frames),
      });
      return;
    }
    if (node.type === "Atrule" && node.name === "page" && node.block) {
      const page = interfaces.descriptor<PageData>("CSSPageRule", generate(node));
      if (page) {
        const nested: Rule[] = [];
        target.push({
          kind: "page",
          rules: nested,
          view: new interfaces.CSSPageRule(interfaces.key, page, nested),
        });
      }
      return;
    }
    if (node.type === "Atrule" && node.name === "counter-style" && node.block) {
      const rule = interfaces.descriptor<CounterStyleRule>("CSSCounterStyleRule", generate(node));
      if (rule)
        target.push({
          kind: "counter-style",
          view: new interfaces.CSSCounterStyleRule(interfaces.key, rule),
        });
      return;
    }
    if (node.type === "Atrule" && node.name === "view-transition" && node.block) {
      const rule = interfaces.descriptor<ViewTransitionData>(
        "CSSViewTransitionRule",
        generate(node),
      );
      if (rule)
        target.push({
          kind: "view-transition",
          view: new interfaces.CSSViewTransitionRule(interfaces.key, rule),
        });
      return;
    }
    if (node.type === "Atrule" && node.name === "namespace" && node.prelude && !node.block) {
      if (target !== rules) return;
      let prelude: CssNode;
      try {
        prelude = parse(generate(node.prelude), { context: "atrulePrelude", atrule: "namespace" });
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return;
      }
      if (prelude.type !== "AtrulePrelude") return;
      const [first, second] = prelude.children.toArray();
      const prefix = first?.type === "Identifier" ? ident.decode(first.name) : "";
      const uri = prefix ? second : first;
      if (uri?.type === "String" || uri?.type === "Url") {
        (namespaces ??= new Map()).set(prefix, uri.value);
        target.push({
          kind: "namespace",
          view: new interfaces.CSSNamespaceRule(interfaces.key, prefix, uri.value),
        });
      }
      return;
    }
    if (node.type === "Atrule" && node.name === "layer") {
      if (node.block && !node.prelude) {
        addLayerBlock("", node.block, target, mode);
        return;
      }
      if (!node.prelude) return;
      let prelude: CssNode;
      try {
        prelude = parse(generate(node.prelude), { context: "atrulePrelude", atrule: "layer" });
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return;
      }
      const names: unknown = prelude.type === "AtrulePrelude" ? prelude.children.first : null;
      const layers: string[] = [];
      // The installed CSS-tree parser supports LayerList before its declaration package does.
      if (
        names &&
        typeof names === "object" &&
        "type" in names &&
        names.type === "LayerList" &&
        "children" in names &&
        names.children &&
        typeof names.children === "object" &&
        Symbol.iterator in names.children
      ) {
        for (const layer of names.children as Iterable<unknown>) {
          if (
            layer &&
            typeof layer === "object" &&
            "name" in layer &&
            typeof layer.name === "string"
          )
            layers.push(layer.name);
        }
      }
      if (node.block) {
        const [name] = layers;
        if (layers.length === 1 && name !== undefined)
          addLayerBlock(name, node.block, target, mode);
      } else if (layers.length) {
        target.push({
          kind: "layer-statement",
          view: new interfaces.CSSLayerStatementRule(interfaces.key, layers),
        });
      }
      return;
    }
    if (node.type === "Atrule" && node.name === "media" && node.block) {
      const conditionText = node.prelude ? generate(node.prelude) : "";
      const nested: Rule[] = [];
      readContents(node.block, nested, mode);
      target.push({
        kind: "media",
        rules: nested,
        view: new interfaces.CSSMediaRule(interfaces.key, conditionText, nested),
      });
      return;
    }
    if (node.type === "Atrule" && node.name === "supports" && node.prelude && node.block) {
      const condition = supports(generate(node.prelude));
      if (!condition) return;
      const nested: Rule[] = [];
      readContents(node.block, nested, mode);
      target.push({
        kind: "supports",
        rules: nested,
        view: new interfaces.CSSSupportsRule(
          interfaces.key,
          condition.conditionText,
          condition.matches,
          nested,
        ),
      });
      return;
    }
    if (node.type === "Atrule" && node.name === "import" && node.prelude) {
      if (target !== rules) return;
      let source = generate(node.prelude);
      let resourceText: string | undefined;
      if (node.prelude.type === "Raw" && /^url\(\s*["']/i.test(source)) {
        const resource = importResource(source);
        if (resource) {
          const { string }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
          resourceText = resource.cssText;
          source = string.encode(resource.href) + source.slice(resource.end);
        }
      }
      let prelude: CssNode;
      try {
        prelude = parse(source, { context: "atrulePrelude", atrule: "import", positions: true });
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        errors.push(error.message);
        return;
      }
      if (prelude.type !== "AtrulePrelude") return;
      const resource = prelude.children.first;
      if (resource?.type !== "String" && resource?.type !== "Url") return;
      const condition: ImportCondition = { layerName: null, supportsText: null, media: "" };
      if (resourceText) condition.resourceText = resourceText;
      // Native parsing owns modifier position and recovery. Invalid layer() remains
      // the beginning of the media tail; later functions cannot become modifiers.
      for (const item of prelude.children) {
        if (item.type === "Identifier" && item.name.toLowerCase() === "layer")
          condition.layerName = "";
        if (item.type === "Function" && item.name.toLowerCase() === "layer") {
          const layer: unknown = item.children.first;
          if (
            item.children.size === 1 &&
            layer &&
            typeof layer === "object" &&
            "type" in layer &&
            layer.type === "Layer" &&
            "name" in layer &&
            typeof layer.name === "string"
          ) {
            condition.layerName = layer.name;
          } else {
            const tail = item.loc ? source.slice(item.loc.start.offset) : generate(item);
            condition.media = specifiedMediaQuery(tail);
            break;
          }
        }
        if (item.type === "Function" && item.name.toLowerCase() === "supports") {
          const raw = item.loc
            ? source.slice(item.loc.start.offset, item.loc.end.offset)
            : generate(item);
          condition.supportsText = raw.slice(raw.indexOf("(") + 1, -1).trim();
        }
        if (item.type === "MediaQueryList") condition.media = generate(item);
      }
      target.push({
        kind: "import",
        view: new interfaces.CSSImportRule(interfaces.key, resource.value, condition),
      });
      return;
    }
    if (
      node.type === "Atrule" &&
      node.name.toLowerCase() === "property" &&
      node.block &&
      node.prelude
    ) {
      const registration = interfaces.parseProperty(
        node.loc
          ? (nesting ? `x { ${text} }` : text).slice(node.loc.start.offset, node.loc.end.offset)
          : generate(node),
      );
      if (registration) {
        target.push({
          kind: "property",
          view: new interfaces.CSSPropertyRule(interfaces.key, {
            names: Object.freeze([...registration.names]),
            syntax: registration.syntax,
            inherits: registration.inherits,
            initialValue: registration.initialValue,
          }),
        });
      }
      return;
    }
    if (node.type === "Atrule" && node.name === "position-try" && node.block) {
      const rule = interfaces.parsePosition(generate(node));
      if (rule)
        target.push({
          kind: "position-try",
          view: new interfaces.CSSPositionTryRule(interfaces.key, rule),
        });
      return;
    }
    if (node.type === "Atrule" && node.name === "function" && node.block) {
      const parsed = interfaces.parseFunction(generate(node));
      if (parsed)
        target.push({
          kind: "function",
          view: new interfaces.CSSFunctionRule(interfaces.key, parsed),
        });
      return;
    }
    if (node.type === "Atrule" && node.name === "font-feature-values" && node.block) {
      const features = fontFeatureValues(generate(node));
      if (features)
        target.push({
          kind: "font-feature-values",
          view: new interfaces.CSSFontFeatureValuesRule(interfaces.key, features),
        });
      return;
    }
    if (node.type === "Atrule" && node.name === "font-face" && node.block) {
      const parsed = interfaces.parseFontFace(generate(node));
      if (parsed)
        target.push({
          kind: "font-face",
          view: new interfaces.CSSFontFaceRule(interfaces.key, parsed),
        });
      return;
    }
    if (node.type !== "Rule") return;
    const parsed = parseRuleSelection({
      text: preludeText(node.prelude, generate),
      isXML,
      statePseudos,
      requireMatchable: false,
      namespaces,
      nesting: mode,
    });
    if (!parsed) return;
    const selection = { current: parsed };
    if (hasOnlyDeclarations(node.block)) {
      const declarationForRule = deferredDeclaration(
        declaration,
        node.block,
        generate,
        text.length <= maximumLargeStylesheetLength && errors.length === 0,
      );
      target.push(new interfaces.PrivateStyleRule(selection, declarationForRule));
      return;
    }
    const nested: Rule[] = [];
    const style = declaration();
    readContents(node.block, nested, "style", style);
    target.push({
      kind: "style",
      rules: nested,
      selection,
      view: new interfaces.CSSStyleRule(interfaces.key, selection, style, nested),
    });
  }

  const container = nesting ? ast.children.first : undefined;
  if (nesting && container?.type === "Rule") readContents(container.block, rules, nesting);
  else ast.children.forEach((node) => readRule(node, rules));
  return { text, rules, errors };
}

const blockElements = new Set(
  "address article aside blockquote body center dd details dialog dir div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr html legend listing main menu nav ol p plaintext pre search section ul xmp".split(
    " ",
  ),
);
const uaBlockMargins = new Set("blockquote figure listing p plaintext pre xmp".split(" "));
const uaIsolates = new Set(
  "address blockquote center div figure figcaption footer form header hr legend listing main p plaintext pre summary xmp article aside h1 h2 h3 h4 h5 h6 hgroup nav search section table caption colgroup col thead tbody tfoot tr td th dir dd dl dt menu ol ul li bdi output".split(
    " ",
  ),
);
const nonRenderedElements = new Set(
  "area base basefont datalist head link meta noembed noframes param rp script style template title".split(
    " ",
  ),
);
const tableDisplay = new Map([
  ["table", "table"],
  ["caption", "table-caption"],
  ["colgroup", "table-column-group"],
  ["col", "table-column"],
  ["thead", "table-header-group"],
  ["tbody", "table-row-group"],
  ["tfoot", "table-footer-group"],
  ["tr", "table-row"],
  ["td", "table-cell"],
  ["th", "table-cell"],
]);

function defaultDisplay(tag: string): string {
  if (nonRenderedElements.has(tag)) return "none";
  if (blockElements.has(tag)) return "block";
  if (tag === "li" || tag === "summary") return "list-item";
  return tableDisplay.get(tag) ?? "inline";
}

function userAgentStyle(element: Raw.Element) {
  const isHTML = element.namespaceURI === html.NS.HTML;
  const isSVG = element.namespaceURI === html.NS.SVG;
  const tag = element.tagName;
  const link = (tag === "a" && (isHTML || isSVG)) || (isHTML && tag === "area");
  let userAgentColor =
    link &&
    element.attrs.some(
      (attr) =>
        attr.name === "href" &&
        (!attr.namespace || (isSVG && attr.namespace === "http://www.w3.org/1999/xlink")),
    )
      ? "rgb(0, 0, 238)"
      : undefined;
  let userAgentDisplay: string | undefined;
  let userAgentContentVisibility: string | undefined;
  let needsDirection = false;
  let button = false,
    field = false,
    hiddenInput = false;
  if (isHTML) {
    let hidden: string | undefined, type: string | undefined, direction: string | undefined;
    let open = false;
    for (const attr of element.attrs) {
      if (attr.namespace) continue;
      if (attr.name === "hidden") hidden = attr.value;
      else if (attr.name === "type") type = attr.value;
      else if (attr.name === "open") open = true;
      else if (attr.name === "dir") direction = attr.value.toLowerCase();
    }
    const inputType = type?.toLowerCase() ?? "text";
    button =
      tag === "button" || (tag === "input" && /^(?:submit|reset|button|color)$/.test(inputType));
    field =
      tag === "textarea" ||
      (tag === "input" &&
        !/^(?:hidden|range|checkbox|radio|file|image|submit|reset|button|color)$/.test(inputType));
    if (button || field) userAgentColor = button ? "ButtonText" : "FieldText";
    const untilFound = tag !== "embed" && hidden?.toLowerCase() === "until-found";
    hiddenInput = tag === "input" && inputType === "hidden";
    userAgentDisplay =
      hiddenInput ||
      (tag !== "embed" && hidden !== undefined && !untilFound) ||
      (tag === "dialog" && !open)
        ? "none"
        : defaultDisplay(tag);
    userAgentContentVisibility = untilFound ? "hidden" : "visible";
    needsDirection =
      direction === "ltr" ||
      direction === "rtl" ||
      direction === "auto" ||
      tag === "bdi" ||
      (tag === "input" && inputType === "tel");
  }
  return {
    isHTML,
    tag,
    button,
    field,
    hiddenInput,
    userAgentColor,
    userAgentDisplay,
    userAgentContentVisibility,
    needsDirection,
  };
}

function resolveCSSURLs(value: string, base: string): string {
  const { parse, walk, string }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  try {
    const ast = parse(value, { context: "value", positions: true });
    let result = "";
    let offset = 0;
    walk(ast, {
      visit: "Url",
      enter(node) {
        if (!node.loc) return;
        const href =
          node.value && !node.value.startsWith("#")
            ? (URL.parse(node.value, base)?.href ?? node.value)
            : node.value;
        result += value.slice(offset, node.loc.start.offset) + "url(" + string.encode(href) + ")";
        offset = node.loc.end.offset;
      },
    });
    return result + value.slice(offset);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return value;
  }
}

const initialFontSize = 16;
const absoluteFontSizes = new Map([
  ["xx-small", 9],
  ["x-small", 10],
  ["small", 13],
  ["medium", 16],
  ["large", 18],
  ["x-large", 24],
  ["xx-large", 32],
  ["xxx-large", 48],
]);
const fontRelativeLength = /[0-9]r?em\b/i;

function simplifyCSSCalculation(value: string): string {
  if (!/^(?:calc|min|max|clamp)\(/i.test(value)) return value;
  const { utils }: typeof import("@asamuzakjp/css-color") = require("./css-runtime.cjs").cssColor;
  return serializeCSSMath(utils.cssCalc(value));
}

// These dimensions need font metrics or a writing mode from the element's cascade.
// These longhands normalize lists, coordinates or ratios using the element's style context.
const contextualLonghand =
  /^(?:box-shadow(?:-(?:blur|color|spread|position|offset))?|(?:column|row)-rule-(?:style|color|width)|aspect-ratio|translate|transition-timing-function|counter-reset|counter-increment|counter-set|border-spacing|grid-auto-flow|font-style|rotate|background-size|grid-auto-rows|grid-auto-columns|zoom|scale|shape-outside|object-position|perspective-origin|transform-origin|offset-(?:anchor|path|position|rotate)|list-style-image|overflow-clip-margin(?:-|$)|text-box-edge|background-position-[xy])$/;
// The pinned evaluator has a fixed viewport. RunDOM resolves physical viewport
// math against the dimensions captured for the declaration, including var() input.
function usesDynamicViewportMath(value: string): boolean {
  return /calc\(/i.test(value) && /[0-9](?:[sld])?v(?:w|h|min|max)\b/i.test(value);
}

function usesTypedValueGrammar(name: string, text: string): boolean {
  return (
    !name.startsWith("--") &&
    text.includes("(") &&
    (/url\(\s*["'][^"']*["']\s+[-_a-z]/i.test(text) ||
      /(?:linear|radial|conic)-gradient\(/i.test(text) ||
      (name === "cursor" && /(?:var|url)\(/i.test(text)) ||
      name === "clip-path" ||
      name === "opacity" ||
      /\bcalc\(/i.test(text) ||
      name === "mask-image" ||
      name === "filter" ||
      name === "backdrop-filter" ||
      (name === "transform" && /[0-9](?:grad|rad|turn)\b/i.test(text)) ||
      /(?:^|[^\w-])(?:src|alpha|palette-mix|light-dark|random-item|calc-size|sibling-count|sibling-index|image|image-set|min|max|clamp|acos|asin|atan2?|cos|sin|tan|hypot|pow|sqrt|log|exp|round|mod|rem|abs|sign|progress)\(/i.test(
        text,
      ) ||
      ((name === "transform" || /[/*]|\b(?:nan|infinity)\b/i.test(text)) && /calc\(/i.test(text)))
  );
}

const elementDimension =
  /^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?(?:r?(?:ex|cap|ch|ic|lh)|[sld]?v[ib]|cq(?:w|h|i|b|min|max)|grad|rad|turn|dpi|dpcm|dppx)$/i;

function computeNumericValue(value: string, readViewport: () => Viewport): string {
  if (value.endsWith("ms") && /^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?ms$/i.test(value))
    return `${Number((Number.parseFloat(value) / 1000).toPrecision(12))}s`;
  const math = /^(?:calc|min|max|clamp)\(/i.test(value);
  const viewportToken = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[sld])?v(?:w|h|min|max)$/i.test(value);
  if ((math || viewportToken) && /[0-9](?:[sld])?v(?:w|h|min|max)\b/i.test(value)) {
    const { utils }: typeof import("@asamuzakjp/css-color") = require("./css-runtime.cjs").cssColor;
    const { width, height } = readViewport();
    const units = {
      vw: width / 100,
      vh: height / 100,
      vmin: Math.min(width, height) / 100,
      vmax: Math.max(width, height) / 100,
    };
    // This viewport has no browser chrome that changes the available dimensions.
    const dimension: Record<string, number> = {};
    for (const [unit, length] of Object.entries(units)) {
      for (const prefix of ["", "s", "l", "d"]) dimension[prefix + unit] = length;
    }
    const calculation = /^calc\(/i.test(value) ? value : `calc(${value})`;
    return utils.cssCalc(calculation, { dimension });
  }
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:cm|mm|q|in|pc|pt)$/i.test(value))
    return simplifyCSSCalculation(`calc(${value})`);
  return simplifyCSSCalculation(value);
}

function snapOutlineWidth(value: string, resolution: number): string {
  if (!value.endsWith("px")) return value;
  const width = Number(value.slice(0, -2));
  if (!Number.isFinite(width)) return value;
  if (width <= 0) return "0px";
  const scale = Number.isFinite(resolution) && resolution > 0 ? resolution : 1;
  return `${Math.max(1, Math.floor(width * scale)) / scale}px`;
}

function computeFontSize(
  value: string | undefined,
  parentSize: number,
  rootSize: number,
  readViewport: () => Viewport,
) {
  if (!value || /^(?:inherit|unset|revert(?:-layer)?)$/i.test(value)) return parentSize;
  if (/^initial$/i.test(value)) return initialFontSize;
  const keyword = value.toLowerCase();
  const absolute = absoluteFontSizes.get(keyword);
  if (absolute !== undefined) return absolute;
  if (keyword === "larger") return parentSize * 1.2;
  if (keyword === "smaller") return parentSize / 1.2;
  value = computeNumericValue(
    resolveFontRelativeLengths(value, parentSize, rootSize, parentSize),
    readViewport,
  );
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(px|em|rem|%)$/i.exec(value);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  switch (match[2]?.toLowerCase()) {
    case "%":
      return (parentSize * amount) / 100;
    case "em":
      return parentSize * amount;
    case "rem":
      return rootSize * amount;
    default:
      return amount;
  }
}

function resolveFontRelativeLengths(
  value: string,
  fontSize: number,
  rootSize: number,
  percentageBase?: number,
): string {
  if (!fontRelativeLength.test(value) && (percentageBase === undefined || !value.includes("%")))
    return value;
  const { parse, walk, generate }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  try {
    const ast = parse(value, { context: "value" });
    let changed = false;
    walk(ast, (node, item) => {
      if (node.type === "Percentage" && percentageBase !== undefined) {
        const size = (Number(node.value) * percentageBase) / 100;
        if (!Number.isFinite(size)) return;
        item.data = { type: "Dimension", value: String(size), unit: "px" };
        changed = true;
      } else if (node.type === "Dimension") {
        const unit = node.unit.toLowerCase();
        if (unit !== "em" && unit !== "rem") return;
        const size = Number(node.value) * (unit === "em" ? fontSize : rootSize);
        if (!Number.isFinite(size)) return;
        node.value = String(size);
        node.unit = "px";
        changed = true;
      }
    });
    return changed ? generate(ast) : value;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return value;
  }
}

const variableSyntax = /var\(|\\/i;
// Only the resolver's serialized primitive output is shared across computations.
const literalSubstitutions = new Map<string, string>();
const directVariable = /^var\((--[-_a-zA-Z0-9]+)\)$/;
const maximumVariableDepth = 128;
const maximumExpandedValueLength = 1_000_000;

function createVariableResolver(lookup: (name: string) => string | undefined) {
  const css: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  const active: string[] = [];
  const cyclic = new Set<string>();
  const resolved = new Map<string, { ast: Value; text: string } | undefined>();

  function readValue(text: string): Value | undefined {
    if (text.length > maximumExpandedValueLength) return;
    try {
      const value = css.parse(text, { context: "value", parseCustomProperty: true });
      if (value.type === "Value") return value;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }

  function readVariable(name: string, depth: number) {
    if (resolved.has(name)) return resolved.get(name);
    const start = active.indexOf(name);
    if (start !== -1) {
      for (const member of active.slice(start)) cyclic.add(member);
      return;
    }
    const source = lookup(name);
    if (source === undefined || /^(?:initial|inherit|unset|revert(?:-layer)?)$/i.test(source))
      return;
    const ast = readValue(source);
    if (!ast) return;
    active.push(name);
    const text = substitute(ast, source.length, depth);
    active.pop();
    const result = text === undefined || cyclic.has(name) ? undefined : { ast, text };
    resolved.set(name, result);
    return result;
  }

  // Bound recursion through nested fallbacks and custom property references, and cap expansion.
  function substitute(ast: Value, length: number, depth: number): string | undefined {
    if (depth > maximumVariableDepth) return;
    let invalid = false;
    // Filter inside the callback because the typed visit filter discards skip signals.
    const substitution: WalkOptionsNoVisit = {
      enter(node, item, list) {
        if (node.type !== "Function" || css.ident.decode(node.name).toLowerCase() !== "var") return;
        const [reference, comma, fallback] = node.children.toArray();
        const name = reference?.type === "Identifier" ? css.ident.decode(reference.name) : "";
        const value = name.startsWith("--") ? readVariable(name, depth + 1) : undefined;
        const replacement =
          value?.ast ??
          (comma?.type === "Operator" && fallback?.type === "Value" ? fallback : undefined);
        const text = value?.text ?? (replacement && substitute(replacement, length, depth + 1));
        if (replacement === undefined || text === undefined) {
          invalid = true;
          return this.break;
        }
        length += text.length;
        if (length > maximumExpandedValueLength) {
          invalid = true;
          return this.break;
        }
        list.replace(item, replacement.children.copy());
        return this.skip;
      },
    };
    css.walk(ast, substitution);
    return invalid ? undefined : css.generate(ast);
  }

  return (name: string, source: string): string | undefined => {
    if (name.startsWith("--")) return readVariable(name, 0)?.text;
    const ast = readValue(source);
    return ast && substitute(ast, source.length, 0);
  };
}

const initialColor = "rgb(0, 0, 0)";

// CSSStyleDeclaration serializes ordinary sRGB colors in this canonical form.
// Limit the literal path to integer channels and alpha precision with identical
// specified and computed serialization in the CSS value implementation.
const absoluteRGB =
  /^rgb(a?)\((0|[1-9]\d{0,2}), ?(0|[1-9]\d{0,2}), ?(0|[1-9]\d{0,2})(?:, ?(0(?:\.\d{1,3})?|1))?\)$/;

function serializeRGB(value: string): string | undefined {
  if (!value.startsWith("rgb")) return;
  const match = absoluteRGB.exec(value);
  if (!match || match[0] !== value || !!match[1] !== (match[5] !== undefined)) return;
  if (Number(match[2]) > 255 || Number(match[3]) > 255 || Number(match[4]) > 255) return;
  const channels = `${match[2]}, ${match[3]}, ${match[4]}`;
  const alpha = Number(match[5] ?? 1);
  return alpha === 1 ? `rgb(${channels})` : `rgba(${channels}, ${alpha})`;
}

function isSerializedRGB(value: string): boolean {
  return serializeRGB(value) === value;
}

// CSSOM serializes an eight-bit alpha with two decimals when that round-trips,
// otherwise three. Opaque colors share the integer RGB serialization.
function serializeHexColor(value: string): string | undefined {
  const length = value.length;
  if (length !== 4 && length !== 5 && length !== 7 && length !== 9) return;
  const digits = value.slice(1);
  if (/[^a-fA-F0-9]/.test(digits)) return;
  const short = length <= 5;
  const number = Number.parseInt(digits, 16);
  const hasAlpha = length === 5 || length === 9;
  const bits = short ? 4 : 8;
  const mask = short ? 15 : 255;
  const scale = short ? 17 : 1;
  const rgb = hasAlpha ? number >>> bits : number;
  const channels = `${((rgb >>> (2 * bits)) & mask) * scale}, ${((rgb >>> bits) & mask) * scale}, ${(rgb & mask) * scale}`;
  const byte = hasAlpha ? (number & mask) * scale : 255;
  if (byte === 255) return `rgb(${channels})`;
  const percent = Math.round((byte * 100) / 255);
  const alpha =
    Math.round((percent * 255) / 100) === byte
      ? percent / 100
      : Math.round((byte * 1000) / 255) / 1000;
  return `rgba(${channels}, ${alpha})`;
}

function resolveColor(
  value: string,
  options: { currentColor: string; colorScheme: string; fallback?: string | undefined },
): string {
  const { currentColor, colorScheme, fallback } = options;
  const system = systemColor(value, colorScheme);
  if (system) return system;
  const rgb = value.startsWith("#") ? serializeHexColor(value) : serializeRGB(value);
  if (rgb !== undefined) return rgb;
  const functional = functionalColorValue(value, currentColor, colorScheme);
  if (functional !== undefined) return functional;
  const { resolve }: typeof import("@asamuzakjp/css-color") = require("./css-runtime.cjs").cssColor;
  return (
    resolve(replaceSystemColors(value, colorScheme), {
      currentColor,
      colorScheme,
      nullable: fallback !== undefined,
    }) ??
    fallback ??
    value
  );
}

function computedBoxShadow(
  value: string,
  currentColor: string,
  colorScheme: string,
  viewport: () => Viewport,
): string | undefined {
  if (value.toLowerCase() === "none") return "none";
  const { parse, generate, lexer }: typeof import("css-tree") =
    require("./css-runtime.cjs").cssTree;
  try {
    const ast = parse(value, { context: "value" });
    if (ast.type !== "Value") return undefined;
    const shadows: string[] = [];
    let lengths: string[] = [];
    let color = "";
    let inset = false;
    function finishShadow(): boolean {
      if (lengths.length < 2 || lengths.length > 4 || (lengths[2]?.startsWith("-") ?? false))
        return false;
      while (lengths.length < 4) lengths.push("0px");
      shadows.push([color || currentColor, ...lengths, ...(inset ? ["inset"] : [])].join(" "));
      lengths = [];
      color = "";
      inset = false;
      return true;
    }
    for (const token of ast.children) {
      if (token.type === "Operator" && token.value === ",") {
        if (!finishShadow()) return undefined;
        continue;
      }
      const component = generate(token);
      if (component.toLowerCase() === "inset" && !inset) {
        inset = true;
      } else if (lexer.matchType("length", token).error === null) {
        lengths.push(Number(component) === 0 ? "0px" : computeNumericValue(component, viewport));
      } else {
        if (color) return undefined;
        color = resolveColor(component, { currentColor, colorScheme, fallback: "" });
        if (!color) {
          // cssstyle also accepts legacy system colors absent from the color resolver.
          const {
            parsePropertyValue,
          }: {
            parsePropertyValue: (name: string, value: string) => unknown;
          } = require("./css-runtime.cjs").cssStyle;
          if (!parsePropertyValue("color", component)) return undefined;
          color = resolveColor(component, { currentColor, colorScheme });
        }
      }
    }
    return finishShadow() ? shadows.join(", ") : undefined;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return undefined;
  }
}

function computedTextColor(
  value: string | undefined,
  inheritedColor: string,
  colorScheme: string,
  substituted: boolean,
): string {
  switch (value?.toLowerCase()) {
    case "initial":
    case "canvastext":
      return systemColor("canvastext", colorScheme) ?? initialColor;
    case undefined:
    case "inherit":
    case "unset":
    case "currentcolor":
    case "revert":
    case "revert-layer":
      return inheritedColor;
    default:
      return resolveColor(value ?? initialColor, {
        currentColor: inheritedColor,
        colorScheme,
        fallback: substituted ? inheritedColor : undefined,
      });
  }
}

const inherited = new Set([
  "color-scheme",
  "cursor",
  "direction",
  "writing-mode",
  "text-orientation",
  "fill",
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "letter-spacing",
  "line-height",
  "stroke",
  "text-align",
  "visibility",
  "white-space",
  "word-spacing",
]);

let declarationMetadataInitialized = false;
function initializeDeclarationMetadata(
  properties: ReadonlyMap<
    string,
    {
      initial?: string;
      inherited?: string;
      computedValue?: string;
      longhands?: readonly string[];
      legacyAliasOf?: string;
    }
  >,
): void {
  if (declarationMetadataInitialized) return;
  // Only use a specified keyword directly when it is also the computed initial.
  // The border-image component initials serialize identically on all four edges.
  for (const [name, metadata] of properties) {
    if (
      !name.startsWith("font-") &&
      !name.startsWith("background-") &&
      !dimensionProperties.has(name) &&
      !name.startsWith("border-image-") &&
      name !== "margin-trim" &&
      (metadata.longhands ||
        metadata.legacyAliasOf ||
        !/^(?:as specified|(?:the )?specified (?:keyword|value))$/i.test(
          metadata.computedValue ?? "",
        ) ||
        !/^(?:none|auto|normal|visible|hidden|start|end|stretch|row|nowrap|static|flat|manual|smooth|inline|always|baseline|horizontal-tb)$/.test(
          metadata.initial ?? "",
        ))
    )
      continue;
    if (metadata.inherited === "yes") inherited.add(name);
    if (!computedInitialValues.has(name) && metadata.initial !== undefined)
      computedInitialValues.set(name, metadata.initial);
  }
  declarationMetadataInitialized = true;
}

function computedFontWeight(value: string, parent: string): string {
  const inheritedWeight = Number(parent) || 400;
  if (value === "normal") return "400";
  if (value === "bold") return "700";
  if (value === "bolder") {
    if (inheritedWeight < 350) return "400";
    if (inheritedWeight < 550) return "700";
    return String(Math.max(900, inheritedWeight));
  }
  if (value === "lighter") {
    if (inheritedWeight < 550) return String(Math.min(100, inheritedWeight));
    return inheritedWeight < 750 ? "400" : "700";
  }
  const number = Number(simplifyCSSCalculation(value).replace(/^calc\(([-+.\deE]+)\)$/, "$1"));
  return Number.isFinite(number) ? String(Math.min(1000, Math.max(1, number))) : value;
}

function roundComputedInteger(property: string, source: string, value: string): string {
  if (!/^(?:calc|min|max|clamp)\(/i.test(source) || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))
    return value;
  const number = Number(value);
  if (Number.isInteger(number)) return value;
  const { parsePropertyValue }: { parsePropertyValue: (name: string, value: string) => unknown } =
    require("./css-runtime.cjs").cssStyle;
  if (parsePropertyValue(property, value) !== undefined) return value;
  const rounded = String(Math.round(number));
  return parsePropertyValue(property, rounded) !== undefined ? rounded : value;
}

// These serialized values need neither native declaration validation nor a computed context.
const literalComputedValues = new Map([
  [
    "display",
    new Set([
      "none",
      "inline",
      "block",
      "inline-block",
      "flex",
      "inline-flex",
      "grid",
      "inline-grid",
      "contents",
      "flow-root",
      "list-item",
      "table",
    ]),
  ],
  ["visibility", new Set(["visible", "hidden", "collapse"])],
  ["content-visibility", new Set(["visible", "hidden", "auto"])],
  ["position", new Set(["static", "relative", "absolute", "fixed", "sticky"])],
]);

const fontWidths = new Map([
  ["ultra-condensed", "50%"],
  ["extra-condensed", "62.5%"],
  ["condensed", "75%"],
  ["semi-condensed", "87.5%"],
  ["normal", "100%"],
  ["semi-expanded", "112.5%"],
  ["expanded", "125%"],
  ["extra-expanded", "150%"],
  ["ultra-expanded", "200%"],
]);

const fontWidthKeywords = new Map([...fontWidths].map(([keyword, width]) => [width, keyword]));

// Defined outside the cascade so the reader's closure context holds only the captured map.
function capturedParentValues(captured: ReadonlyMap<string, string>) {
  return { getPropertyValue: (name: string) => captured.get(name) ?? "" };
}

/** Owns stylesheets and declarations for a single document. */
export function createStyles(input: {
  document: Raw.Document;
  ownerDocument: (root: Raw.ParentNode) => Raw.Document;
  wrapOwner: (node: Raw.Element) => object;
  assignedSlot: (node: Raw.Element) => Raw.Element | undefined;
  shadowRoot: (node: Raw.Element) => Raw.DocumentFragment | undefined;
  shadowHost: (root: Raw.ParentNode) => Raw.Element | undefined;
  isConnected: (node: Raw.Element) => boolean;
  styleScope: (node: Raw.Element) => Raw.ParentNode | undefined;
  viewport: () => Viewport;
  elements: (root?: Raw.ParentNode) => Iterable<Raw.ChildNode>;
  treeRevision: (root: Raw.ParentNode) => number | undefined;
  styleRevision: (root: Raw.ParentNode) => number | undefined;
  focusRevision: () => number;
  isXML: boolean;
  statePseudos: Parameters<typeof compileSelector>[0]["statePseudos"];
  directionality: (node: Raw.Element) => "ltr" | "rtl";
  DOMException: typeof globalThis.DOMException;
  objectPrototype: object;
  functionPrototype: object;
  arrayValues: typeof Array.prototype.values;
  report: (text: string, error: SyntaxError) => void;
  baseURL: (owner?: Raw.Document) => string;
  reportInvalidImport: (url: string, base: string) => void;
  documentEncoding: (node: Raw.Element) => string;
  loadImport: (
    node: Raw.Element,
    url: string,
    encoding: string,
  ) => Promise<
    | { status: "loaded"; code: string; url: string; encoding?: string }
    | { status: "failed" | "aborted" }
  >;
  track: (pending: Promise<void>, owner: Raw.Element) => void;
  resourcesEnabled: boolean;
  queueInlineLoad: (owner: Raw.Element) => void;
  importCompleted: (owner: Raw.Element, type: "load" | "error") => void;
  writeInlineStyle: (node: Raw.Element, text: string) => void;
}) {
  function supportsSelector(selector: string): boolean {
    if (selector.includes(":") && !selector.includes("::details-content"))
      return selectorFeatureSupported(selector);
    return (
      parseRuleSelection({
        text: selector,
        isXML: input.isXML,
        statePseudos: input.statePseudos,
        requireMatchable: true,
        featureQuery: true,
      }) !== undefined
    );
  }

  let cssNamespace: ReturnType<typeof createCSSNamespace> | undefined;
  let scriptRegistrations: Map<string, RegisteredProperty> | undefined;
  function css() {
    return (cssNamespace ??= createCSSNamespace(supportsSelector, (inputValue) => {
      const result = registeredProperty(inputValue, scriptRegistrations, input.DOMException);
      (scriptRegistrations ??= new Map()).set(result.name, result);
      linkedSheetChanged();
    }));
  }

  let descriptorParser: ReturnType<typeof createDescriptorRuleParser> | undefined;
  function descriptorRules() {
    return (descriptorParser ??= createDescriptorRuleParser(
      input.baseURL,
      linkedSheetChanged,
      () => views().CSSStyleDeclaration.prototype,
    ));
  }
  const ruleInterfaces = createRuleInterfaces(
    parseRules,
    input.DOMException,
    (text) => new MediaList(mediaListKey, text),
    (media) => mediaListState(media).matches(input.viewport()),
    (text, namespaces, nesting) =>
      parseRuleSelection({
        text,
        isXML: input.isXML,
        statePseudos: input.statePseudos,
        requireMatchable: true,
        namespaces,
        nesting,
      }),
    namespacesForSheet,
    (style) => views().expose(style),
    (binding, text) => descriptorRules().descriptor(binding, text),
    (text) => descriptorRules().fontFace(text),
    (text) => descriptorRules().functionRule<RuleList>(text),
    (text) => descriptorRules().property(text),
    (text) => descriptorRules().position(text),
    (style, parent) => views().positionDescriptors(style, parent),
  );
  const declarationKey = Symbol();
  let declarationViews: ReturnType<typeof createDeclarationViews> | undefined;
  function views(): ReturnType<typeof createDeclarationViews> {
    return (declarationViews ??= createDeclarationViews({
      emptyComputed: () => {
        const empty = declaration();
        empty._readonly = true;
        empty._global = declarationGlobals;
        return empty;
      },
      styleProperties: declarationProperties,
      write: writePublicStyleProperty,
      objectPrototype: input.objectPrototype,
      functionPrototype: input.functionPrototype,
      arrayValues: input.arrayValues,
    }));
  }
  let declarationClass: ReturnType<typeof createDeclarationInterface> | undefined;
  function declarationInterface() {
    return (declarationClass ??= createDeclarationInterface(declarationKey, views()));
  }
  function declaration(onChange?: (text: string) => void) {
    const { CSSStyleProperties } = declarationInterface();
    return new CSSStyleProperties(declarationKey, onChange);
  }
  // CSS-in-JS sources can recur after eviction from the shared syntax cache.
  // Window ownership bounds key lifetime and weak values leave V8 free to reclaim every AST.
  const recentSyntax = new Map<string, WeakRef<CssNode>>();
  const flatPlans = new WeakMap<CssNode, readonly FlatStyleRule[] | null>();
  function parseRules(
    text: string,
    namespaces?: Map<string, string>,
    nesting?: NestingMode,
    syntax?: ReturnType<typeof parseStyleSheetSyntax>,
  ) {
    return parseSheet(
      text,
      input.isXML,
      input.statePseudos,
      ruleInterfaces,
      declaration,
      (condition) => readSupportsCondition(condition, supportsSelector),
      flatPlans,
      recentSyntax,
      namespaces,
      nesting,
      syntax,
    );
  }

  function namespacesForSheet(sheet: Sheet | null): Map<string, string> | undefined {
    if (!sheet || !sheetState(sheet).mayHaveNamespace) return undefined;
    let namespaces: Map<string, string> | undefined;
    for (const rule of sheetState(sheet).rules) {
      if (rule.kind === "namespace")
        (namespaces ??= new Map()).set(rule.view.prefix, rule.view.namespaceURI);
    }
    return namespaces;
  }

  const sheets = new WeakMap<Raw.Element, SheetRecord & { sourceVersion: number }>();
  let linkedSheetRevision = 0;

  type SheetState = {
    attached?: true;
    mayHaveNamespace?: true;
    modificationDisallowed?: boolean;
    rules: Rule[];
    ruleList?: RuleList;
    media?: SheetMedia;
    owner?: Raw.Element;
    sourceOwner?: Raw.Element;
    importRule?: ImportRule & RuleParents;
    href?: string;
    base?: string;
    encoding?: string;
  };
  const sheetStates = new WeakMap<Sheet, SheetState>();
  const attachedOptions = { disabled: false };

  function checkAdoption(root: Raw.ParentNode, sheet: Sheet): void {
    if (!stylesheetInstances.has(sheet)) throw new TypeError("Expected a CSSStyleSheet");
    if (constructedSheetDocuments.get(sheet) !== input.ownerDocument(root))
      throw new input.DOMException(
        "Only constructed stylesheets from the same document may be adopted",
        "NotAllowedError",
      );
    didAdoptStylesheets = true;
  }

  function adoption(root: Raw.ParentNode) {
    const existing = adopted.get(root);
    if (existing) return existing;
    const values: Sheet[] = [];
    const view = new Proxy(values, {
      set(target, key, value: Sheet | number) {
        if (key === "length") {
          if (Number(value) > target.length) return false;
          return Reflect.set(target, key, value);
        }
        if (typeof key === "string" && /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < 0xffffffff) {
          if (Number(key) > target.length) return false;
          checkAdoption(root, value as Sheet);
        }
        return Reflect.set(target, key, value);
      },
      deleteProperty(target, key) {
        if (
          typeof key === "string" &&
          /^(?:0|[1-9]\d*)$/.test(key) &&
          Number(key) < target.length
        ) {
          if (Number(key) !== target.length - 1) return false;
          target.length--;
          return true;
        }
        return Reflect.deleteProperty(target, key);
      },
      defineProperty: () => false,
      preventExtensions: () => false,
    });
    const entry = { values, view };
    adopted.set(root, entry);
    return entry;
  }

  function setAdopted(root: Raw.ParentNode, sheets: Iterable<Sheet>): void {
    const replacement = [...sheets];
    for (const sheet of replacement) checkAdoption(root, sheet);
    const { values } = adoption(root);
    values.length = 0;
    for (const sheet of replacement) values.push(sheet);
  }

  function sheetState(sheet: Sheet): SheetState {
    const state = sheetStates.get(sheet);
    if (!state) throw new TypeError("Illegal invocation");
    return state;
  }

  const mediaListKey = Symbol();
  const mediaLists = cssMediaLists;

  function mediaListState(list: SheetMedia): ReturnType<typeof parseMediaQuery> {
    const state = mediaLists.get(list);
    if (!state) throw new TypeError("Expected a MediaList");
    return state;
  }

  class MediaList implements SheetMedia {
    readonly [index: number]: string | undefined;

    constructor(key: symbol, text: string) {
      if (key !== mediaListKey) throw new TypeError("Illegal constructor");
      const list = new Proxy(this, {
        get(target, key, receiver) {
          if (typeof key === "string" && /^(?:0|[1-9]\d*)$/.test(key))
            return mediaListState(receiver as MediaList).queries[Number(key)];
          return Reflect.get(target, key, receiver);
        },
      });
      mediaLists.set(list, parseMediaQuery(text));
      return list;
    }
    get length(): number {
      return mediaListState(this).queries.length;
    }
    get mediaText(): string {
      return mediaListState(this).media;
    }
    set mediaText(value: string | null) {
      mediaListState(this);
      mediaLists.set(this, parseMediaQuery(value === null ? "" : `${value}`));
    }
    toString(): string {
      return mediaListState(this).media;
    }
    item(index: number): string | null {
      return mediaListState(this).queries[Number(index) >>> 0] ?? null;
    }
    appendMedium(medium: string): void {
      const state = mediaListState(this);
      const [entry, extra] = parseMediaQuery(`${medium}`).queries;
      if (!entry || extra || state.queries.includes(entry)) return;
      this.mediaText = [...state.queries, entry].join(", ");
    }
    deleteMedium(medium: string): void {
      const state = mediaListState(this);
      const [entry, extra] = parseMediaQuery(`${medium}`).queries;
      if (!entry || extra) return;
      if (!state.queries.includes(entry))
        throw new input.DOMException(
          `Cannot delete a medium that is not in the media list.`,
          "NotFoundError",
        );
      this.mediaText = state.queries.filter((query) => query !== entry).join(", ");
    }
  }

  const styleSheetKey = Symbol();
  class StyleSheet {
    constructor(key: symbol) {
      if (key !== styleSheetKey) throw new TypeError("Illegal constructor");
    }
    get type(): string {
      return "text/css";
    }
  }

  function hasOrdinaryRules(rules: Rule[]): boolean {
    return rules.some(
      (rule) =>
        rule.kind !== "import" && rule.kind !== "namespace" && rule.kind !== "layer-statement",
    );
  }

  class CSSStyleSheet extends StyleSheet implements Sheet {
    disabled = false;
    constructor(options?: {
      baseURL?: string | null;
      disabled?: boolean;
      media?: string | MediaList;
    }) {
      super(styleSheetKey);
      const requestedBase = options?.baseURL;
      const base =
        requestedBase == null ? undefined : URL.parse(`${requestedBase}`, input.baseURL())?.href;
      if (requestedBase != null && base === undefined)
        throw new input.DOMException("Invalid stylesheet base URL", "NotAllowedError");
      stylesheetInstances.add(this);
      if (options === attachedOptions) {
        sheetStates.set(this, { rules: [], attached: true });
        return;
      }
      constructedSheetDocuments.set(this, input.document);
      this.disabled = Boolean(options?.disabled);
      sheetStates.set(this, {
        rules: [],
        ...(base === undefined ? {} : { base }),
      });
      const media = options?.media;
      if (media !== undefined)
        this.media = media instanceof MediaList ? mediaListState(media).media : `${media}`;
    }
    get media(): SheetMedia {
      const state = sheetState(this);
      return (state.media ??= new MediaList(mediaListKey, ""));
    }
    set media(value: string) {
      this.media.mediaText = value;
    }
    get ownerNode(): object | null {
      const owner = sheetState(this).owner;
      return owner ? input.wrapOwner(owner) : null;
    }
    get ownerRule(): (ImportRule & RuleParents) | null {
      return sheetState(this).importRule ?? null;
    }
    get parentStyleSheet(): Sheet | null {
      return sheetState(this).importRule?.parentStyleSheet ?? null;
    }
    get title(): string | null {
      return (
        sheetState(this).owner?.attrs.find((attr) => !attr.namespace && attr.name === "title")
          ?.value || null
      );
    }
    get href(): string | null {
      return sheetState(this).href ?? null;
    }
    get cssRules(): RuleList {
      const state = sheetState(this);
      return (state.ruleList ??= new ruleInterfaces.CSSRuleList(ruleInterfaces.key, state.rules));
    }
    get rules(): RuleList {
      return this.cssRules;
    }
    addRule(selector = "undefined", style = "", index?: number): number {
      const rule = `${selector} { ${style} }`;
      this.insertRule(rule, index === undefined ? sheetState(this).rules.length : index);
      return -1;
    }
    removeRule(index = 0): void {
      this.deleteRule(index);
    }
    insertRule(rule: string, index = 0): number {
      const state = sheetState(this);
      if (state.modificationDisallowed)
        throw new input.DOMException("Stylesheet replacement is in progress", "NotAllowedError");
      if (arguments.length === 0)
        throw new TypeError(
          "Failed to execute 'insertRule' on 'CSSStyleSheet': 1 argument required, but only 0 present.",
        );
      const position = Number(index) >>> 0;
      if (position > state.rules.length)
        throw new input.DOMException("Rule index out of bounds", "IndexSizeError");
      const text = String(rule);
      const featureRule = /^\s*@font-feature-values\b/i.test(text);
      const features = featureRule && descriptorRules().font(text);
      const parsed = featureRule
        ? {
            rules: features
              ? [
                  {
                    kind: "font-feature-values" as const,
                    view: new ruleInterfaces.CSSFontFeatureValuesRule(ruleInterfaces.key, features),
                  },
                ]
              : [],
            errors: features ? [] : ["Invalid font feature values rule"],
          }
        : parseRules(text, namespacesForSheet(this));
      const { rules } = parsed;
      const errors = parsed.errors.filter((message) => message !== "Colon is expected");
      const entry = rules[0];
      let invalid = errors.length !== 0;
      if (invalid && entry?.kind === "style" && rules.length === 1) {
        const { parse }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
        try {
          parse(text, { context: "rule", parseValue: false });
          invalid = false;
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
      }
      if (invalid || rules.length !== 1 || !entry)
        throw new input.DOMException("The rule could not be parsed", "SyntaxError");
      if (entry.kind === "import") {
        if (!state.attached)
          throw new input.DOMException(
            "Cannot insert an import rule into a constructed stylesheet",
            "SyntaxError",
          );
        if (
          state.rules.some(
            (rule, index) =>
              index < position && rule.kind !== "import" && rule.kind !== "layer-statement",
          )
        )
          throw new input.DOMException(
            "@import rules must precede all other rules.",
            "HierarchyRequestError",
          );
      } else if (entry.kind === "namespace") {
        if (hasOrdinaryRules(state.rules))
          throw new input.DOMException(
            "Cannot insert @namespace rule when other rules exist.",
            "InvalidStateError",
          );
      } else if (
        entry.kind !== "layer-statement" &&
        position < state.rules.length &&
        state.rules.some(
          (rule, index) =>
            index >= position && (rule.kind === "import" || rule.kind === "namespace"),
        )
      ) {
        throw new input.DOMException(
          "Cannot insert a rule before @import or @namespace rules.",
          "HierarchyRequestError",
        );
      }
      if (entry.kind === "namespace") state.mayHaveNamespace = true;
      ruleInterfaces.attach(entry, this);
      state.rules.splice(position, 0, entry);
      const sourceOwner = state.owner ?? state.sourceOwner;
      if (entry.kind === "import" && sourceOwner) {
        const base = state.href ?? input.baseURL();
        trackImportTree(
          sourceOwner,
          loadImportRule(
            sourceOwner,
            entry,
            base,
            new Set([base]),
            state.encoding ?? input.documentEncoding(sourceOwner),
          ),
        );
      }
      return position;
    }
    deleteRule(index: number): void {
      const state = sheetState(this);
      if (state.modificationDisallowed)
        throw new input.DOMException("Stylesheet replacement is in progress", "NotAllowedError");
      if (arguments.length === 0)
        throw new TypeError(
          "Failed to execute 'deleteRule' on 'CSSStyleSheet': 1 argument required, but only 0 present.",
        );
      const position = Number(index) >>> 0;
      if (position >= state.rules.length)
        throw new input.DOMException("Rule index out of bounds", "IndexSizeError");
      if (state.rules[position]?.kind === "namespace" && hasOrdinaryRules(state.rules))
        throw new input.DOMException(
          "Cannot delete @namespace rule when other rules exist.",
          "InvalidStateError",
        );
      const [removed] = state.rules.splice(position, 1);
      if (removed) ruleInterfaces.detach(removed);
    }
    replaceSync(text: string): void {
      const state = sheetState(this);
      if (arguments.length === 0) throw new TypeError("Stylesheet text is required");
      if (state.attached || state.modificationDisallowed)
        throw new input.DOMException("This stylesheet cannot be replaced", "NotAllowedError");
      replaceSheetContents(this, String(text));
    }
    async replace(text: string): Promise<this> {
      const state = sheetState(this);
      if (arguments.length === 0) throw new TypeError("Stylesheet text is required");
      if (state.attached || state.modificationDisallowed)
        throw new input.DOMException("This stylesheet cannot be replaced", "NotAllowedError");
      const source = String(text);
      state.modificationDisallowed = true;
      try {
        await Promise.resolve();
        replaceSheetContents(this, source);
      } finally {
        state.modificationDisallowed = false;
      }
      return this;
    }
  }
  Object.defineProperty(CSSStyleSheet.prototype, Symbol.toStringTag, {
    value: "CSSStyleSheet",
    configurable: true,
  });

  function replaceSheetContents(sheet: Sheet, text: string): void {
    const state = sheetState(sheet);
    const parsed = parseRules(text);
    for (const rule of state.rules) ruleInterfaces.detach(rule);
    state.rules.length = 0;
    for (const rule of parsed.rules) {
      if (rule.kind === "import") continue;
      if (rule.kind === "namespace") state.mayHaveNamespace = true;
      ruleInterfaces.attach(rule, sheet);
      state.rules.push(rule);
    }
  }

  function createAttachedSheet(
    metadata: Pick<SheetState, "owner" | "sourceOwner" | "importRule" | "href" | "media">,
  ) {
    const sheet = new CSSStyleSheet(attachedOptions);
    Object.assign(sheetState(sheet), metadata);
    return sheet;
  }

  function populateSheet(
    sheet: Sheet,
    text: string,
    sourceVersion = 0,
    syntax?: ReturnType<typeof parseStyleSheetSyntax>,
  ) {
    const state = sheetState(sheet);
    if (text === "") return { text, errors: [], rules: state.rules, sheet, sourceVersion };
    const { errors, rules } = parseRules(text, undefined, undefined, syntax);
    for (const rule of rules) {
      if (rule.kind === "namespace") state.mayHaveNamespace = true;
      ruleInterfaces.attach(rule, sheet);
      state.rules.push(rule);
    }
    return { text, errors, rules: state.rules, sheet, sourceVersion };
  }

  function deferAttachedRules(
    sheet: Sheet,
    text: string,
    sourceVersion: number,
    syntax: ReturnType<typeof parseStyleSheetSyntax>,
  ) {
    const state = sheetState(sheet);
    const storage = state.rules;
    const errors = syntax.errors;
    let pending: typeof syntax | undefined = syntax;
    // The first CSSOM access publishes the original mutable array, also used by rule lists.
    Object.defineProperty(state, "rules", {
      configurable: true,
      get() {
        Object.defineProperty(state, "rules", {
          configurable: true,
          writable: true,
          value: storage,
        });
        populateSheet(sheet, text, sourceVersion, pending);
        pending = undefined;
        return storage;
      },
    });
    return {
      sheet,
      text,
      sourceVersion,
      errors,
      get rules() {
        return state.rules;
      },
    };
  }

  function reportErrors(record: SheetRecord): void {
    for (const message of record.errors) input.report(record.text, new SyntaxError(message));
  }

  function loadImports(
    owner: Raw.Element,
    record: SheetRecord,
    base: string,
    ancestors: ReadonlySet<string>,
    encoding: string,
  ): Promise<boolean> | undefined {
    let pending: Promise<boolean>[] | undefined;
    for (const rule of record.rules) {
      if (rule.kind !== "import") continue;
      const load = loadImportRule(owner, rule, base, ancestors, encoding);
      if (load) (pending ??= []).push(load);
    }
    return pending && Promise.all(pending).then((outcomes) => outcomes.every(Boolean));
  }

  function loadImportRule(
    owner: Raw.Element,
    rule: Extract<Rule, { kind: "import" }>,
    base: string,
    ancestors: ReadonlySet<string>,
    encoding: string,
  ): Promise<boolean> | undefined {
    const condition = rule.view.supportsText;
    if (condition !== null && !css().supports(condition)) return Promise.resolve(true);
    const url = URL.parse(rule.view.href, base);
    const importedSheet = createAttachedSheet({
      sourceOwner: owner,
      importRule: rule.view,
      media: rule.view.media,
      ...(url ? { href: url.href } : {}),
    });
    ruleInterfaces.setImportSheet(rule.view, importedSheet);
    if (!url) {
      input.reportInvalidImport(rule.view.href, base);
      return;
    }
    if (ancestors.size >= 20 || ancestors.has(url.href)) return;
    if (!input.resourcesEnabled) return;
    return input.loadImport(owner, url.href, encoding).then((resource) => {
      if (resource.status !== "loaded") return resource.status !== "aborted";
      sheetState(importedSheet).href = resource.url;
      sheetState(importedSheet).encoding = resource.encoding ?? encoding;
      const imported = populateSheet(importedSheet, resource.code);
      rule.imported = imported;
      reportErrors(imported);
      return (
        loadImports(
          owner,
          imported,
          resource.url,
          new Set([...ancestors, url.href, resource.url]),
          resource.encoding ?? encoding,
        ) ?? true
      );
    });
  }

  function trackImportTree(owner: Raw.Element, loading: Promise<boolean> | undefined): void {
    if (loading)
      input.track(
        loading.then((completed) => {
          if (completed && owner.tagName === "style") input.importCompleted(owner, "load");
        }),
        owner,
      );
  }

  function applySheet(node: StyleOwner, text: string, base?: string, encoding?: string): Sheet {
    const href = node.tagName === "link" ? (base ?? input.baseURL()) : undefined;
    const existing = sheets.get(node);
    const sourceVersion = node[stylesheetSourceVersion] ?? 0;
    if (
      existing?.text === text &&
      existing.sourceVersion === sourceVersion &&
      (href === undefined || existing.sheet.href === href)
    )
      return existing.sheet;
    if (existing) delete sheetState(existing.sheet).owner;
    if (elementLocalName(node) === "style") node[stylesheetSourceVersion] = sourceVersion;
    const sheet = createAttachedSheet(href === undefined ? { owner: node } : { owner: node, href });
    if (href === undefined) sheetState(sheet).base = input.baseURL(input.ownerDocument(node));
    encoding ??= input.documentEncoding(node);
    sheetState(sheet).encoding = encoding;
    // Parse diagnostics and import requests are observable at attachment. For a large
    // import-free sheet, the CSSOM objects can wait until the first rule or cascade read.
    const syntax = text.length >= 4096 ? parseStyleSheetSyntax(text, recentSyntax) : undefined;
    const defer =
      syntax?.ast.type === "StyleSheet" &&
      !syntax.ast.children.some((node) => node.type === "Atrule" && node.name === "import");
    const record = defer
      ? deferAttachedRules(sheet, text, sourceVersion, syntax)
      : populateSheet(sheet, text, sourceVersion, syntax);
    sheets.set(node, record);
    if (href !== undefined) linkedSheetChanged();
    syncSheetMedia(node);
    // Inline sheets need the document base at attachment only for their imports.
    const importBase =
      !defer && record.rules.some((rule) => rule.kind === "import")
        ? (href ?? base ?? input.baseURL())
        : undefined;
    reportErrors(record);
    if (importBase !== undefined)
      trackImportTree(node, loadImports(node, record, importBase, new Set([importBase]), encoding));
    else if (node.tagName === "style") input.queueInlineLoad(node);
    return record.sheet;
  }

  function syncSheetMedia(node: Raw.Element): void {
    const record = sheets.get(node);
    if (!record) return;
    const media = node.attrs.find((attr) => !attr.namespace && attr.name === "media")?.value ?? "";
    const state = sheetState(record.sheet);
    if (state.media || media) record.sheet.media = media;
  }

  function inlineStyle(node: Raw.Element): Declaration {
    const inline = (inlineStyles ??= new WeakMap());
    const existing = inline.get(node);
    if (existing) return existing.style;
    const state = {
      text: "",
      style: declaration((text) => {
        if (state.syncing) return;
        state.text = text;
        input.writeInlineStyle(node, text);
      }),
      syncing: false,
    };
    inline.set(node, state);
    inlineBaseReaders.set(state.style, () => input.baseURL(input.ownerDocument(node)));
    const text = node.attrs.find((attr) => !attr.namespace && attr.name === "style")?.value;
    if (text) {
      const block = parseInlineBlock(text);
      if (block) {
        // These disjoint longhands already own CSSOM's exact specified values.
        // Seed the fresh indices in source order without issuing a second attribute mutation.
        state.style._updating = true;
        try {
          for (const [name, value] of block.entries) state.style._setProperty(name, value);
          state.text = text;
        } finally {
          state.style._updating = false;
        }
      } else syncInlineStyle(node);
    }
    const view = publicInlineViews?.get(node);
    if (view) views().materializedInline(view, state.style);
    return state.style;
  }

  const inlineAccess = {
    source(node: Raw.Element) {
      if (inlineStyles?.has(node)) return;
      return node.attrs.find((attr) => !attr.namespace && attr.name === "style")?.value ?? "";
    },
    update: input.writeInlineStyle,
    materialize: inlineStyle,
  };
  function publicInlineStyle(node: Raw.Element): PublicDeclaration {
    const pending = publicInlineViews?.get(node);
    if (pending) return pending;
    const view = inlineStyles?.has(node)
      ? views().expose(inlineStyle(node))
      : views().inlineView(new InlineDeclaration(node, inlineAccess));
    (publicInlineViews ??= new WeakMap()).set(node, view);
    return view;
  }

  function applyInline(node: Raw.Element): Sheet | null {
    const type = node.attrs.find((attr) => !attr.namespace && attr.name === "type")?.value;
    if (node.namespaceURI !== html.NS.HTML || (type && type.toLowerCase() !== "text/css")) {
      return null;
    }
    let text = "";
    for (const child of node.childNodes) {
      if (tree.isTextNode(child)) text += child.value;
      else if (tree.isCommentNode(child) && xmlSpecial(child)?.kind === "cdata") text += child.data;
    }
    return applySheet(node, text);
  }

  type CollectionSnapshot = {
    treeRevision: number;
    linkedRevision: number;
    entries: SheetRecord[];
  };
  let documentSheets: CollectionSnapshot | undefined;
  let scopedSheets: WeakMap<Raw.ParentNode, CollectionSnapshot> | undefined;

  function invalidateSheetMembership(): void {
    // Sheet owners can keep an entire detached tree alive until the next CSS read.
    documentSheets = undefined;
    scopedSheets = undefined;
  }

  function linkedSheetChanged(): void {
    linkedSheetRevision++;
    invalidateSheetMembership();
  }

  let exposedStylesheets: WeakSet<Sheet> | undefined;

  function privateSheet(sheet: Sheet): boolean {
    if (didAdoptStylesheets) return false;
    if (!exposedStylesheets) return true;
    // Imported rules are reachable from their owner rule; only directly owned
    // unexposed sheets retain the private rule and declaration indexes.
    return !!sheetState(sheet).owner && !exposedStylesheets.has(sheet);
  }

  let cascadeSheetIndexes = new WeakMap<SheetRecord[], SubjectIndex<SheetRecord> | null>();
  function privateSheetRule(record: SheetRecord): Rule | Rule[] | null | undefined {
    return privateSheet(record.sheet) ? sheetSubjects(record) : undefined;
  }

  function exposeSheet<T extends Sheet | null | undefined>(sheet: T): T {
    // Once a backing sheet escapes, arbitrary CSSOM writes need no DOM mutation.
    if (sheet && !exposedStylesheets?.has(sheet)) {
      (exposedStylesheets ??= new WeakSet()).add(sheet);
      // This sheet must now remain in the ordered fallback for arbitrary CSSOM edits.
      cascadeSheetIndexes = new WeakMap();
    }
    return sheet;
  }

  function collect(root: Raw.ParentNode = input.document): SheetRecord[] {
    const treeRevision = input.treeRevision(root);
    const linkedRevision = linkedSheetRevision;
    const snapshot = root === input.document ? documentSheets : scopedSheets?.get(root);
    if (
      snapshot &&
      snapshot.treeRevision === treeRevision &&
      snapshot.linkedRevision === linkedRevision
    )
      return snapshot.entries;
    const result: SheetRecord[] = [];
    for (const node of input.elements(root)) {
      if (!tree.isElementNode(node) || node.namespaceURI !== html.NS.HTML) continue;
      if (elementLocalName(node) === "style" && !applyInline(node)) continue;
      const record = sheets.get(node);
      if (record) result.push(record);
    }
    // Error reporting can reenter and mutate the tree while a sheet is parsed.
    // Cache only membership, retaining live CSSOM records rather than computed values.
    if (
      treeRevision !== undefined &&
      input.treeRevision(root) === treeRevision &&
      linkedSheetRevision === linkedRevision
    ) {
      const current = { treeRevision, linkedRevision, entries: result };
      if (root === input.document) documentSheets = current;
      else (scopedSheets ??= new WeakMap()).set(root, current);
    } else if (root === input.document) documentSheets = undefined;
    else scopedSheets?.delete(root);
    return result;
  }

  const styleSheetListKey = Symbol();
  const styleSheetLists = new WeakMap<Raw.ParentNode, StyleSheetList>();
  const styleSheetRoots = new WeakMap<StyleSheetList, Raw.ParentNode>();

  function listEntries(list: StyleSheetList): SheetRecord[] {
    const root = styleSheetRoots.get(list);
    if (!root) throw new TypeError("Illegal invocation");
    return collect(root);
  }

  class StyleSheetList {
    readonly [index: number]: Sheet | undefined;

    constructor(key: symbol, root: Raw.ParentNode) {
      if (key !== styleSheetListKey) throw new TypeError("Illegal constructor");
      const list: StyleSheetList = new Proxy(this, {
        get(target, key, receiver) {
          const index = sheetIndex(key);
          return index === undefined
            ? Reflect.get(target, key, receiver)
            : exposeSheet(listEntries(list)[index]?.sheet);
        },
        has(target, key) {
          const index = sheetIndex(key);
          return index === undefined ? Reflect.has(target, key) : index < listEntries(list).length;
        },
        ownKeys(target) {
          return [
            ...listEntries(list).map((_, index) => String(index)),
            ...Reflect.ownKeys(target),
          ];
        },
        getOwnPropertyDescriptor(target, key) {
          const index = sheetIndex(key);
          if (index === undefined) return Reflect.getOwnPropertyDescriptor(target, key);
          const value = exposeSheet(listEntries(list)[index]?.sheet);
          return value === undefined
            ? undefined
            : { value, writable: false, enumerable: true, configurable: true };
        },
        defineProperty(target, key, descriptor) {
          return sheetIndex(key) === undefined && Reflect.defineProperty(target, key, descriptor);
        },
        deleteProperty(target, key) {
          const index = sheetIndex(key);
          return index === undefined
            ? Reflect.deleteProperty(target, key)
            : index >= listEntries(list).length;
        },
        preventExtensions: () => false,
      });
      styleSheetRoots.set(list, root);
      return list;
    }

    get length(): number {
      return listEntries(this).length;
    }
    item(index: number): Sheet | null {
      if (arguments.length === 0) throw new TypeError("A stylesheet index is required");
      const position = +index >>> 0;
      return exposeSheet(listEntries(this)[position]?.sheet ?? null);
    }
    *[Symbol.iterator](): IterableIterator<Sheet> {
      // Re-read the index after each yield so mutations between next() calls remain visible.
      for (let index = 0; ; index++) {
        const entry = listEntries(this)[index];
        if (!entry) return;
        yield exposeSheet(entry.sheet);
      }
    }
    get [Symbol.toStringTag](): string {
      return "StyleSheetList";
    }
  }

  function list(root: Raw.ParentNode): StyleSheetList {
    let existing = styleSheetLists.get(root);
    if (!existing) {
      existing = new StyleSheetList(styleSheetListKey, root);
      styleSheetLists.set(root, existing);
    }
    return existing;
  }

  const declarationGlobals = { DOMException: input.DOMException, TypeError };
  function finishComputedStyle(style: ReturnType<typeof declaration>): PublicDeclaration {
    style._global = declarationGlobals;
    style._computed = true;
    style._readonly = true;
    return views().expose(style, { fresh: true });
  }

  function scopeBoundaries(
    rule: Extract<Rule, { kind: "scope" }>,
    sheet: Sheet,
    parent?: RuleSelection,
  ): ScopeBoundaries | null {
    if (rule.boundaries && rule.boundaries.parent === parent) return rule.boundaries.value;
    const namespaces = namespacesForSheet(sheet);
    const parseBoundary = (text: string | null, nestingParent?: RuleSelection) =>
      text === null
        ? undefined
        : parseRuleSelection({
            text,
            isXML: input.isXML,
            statePseudos: input.statePseudos,
            requireMatchable: true,
            namespaces,
            parentSelection: nestingParent,
          });
    const root = parseBoundary(rule.view.start, parent);
    const limit = parseBoundary(rule.view.end);
    // Namespace rules cannot be edited while this ordinary rule belongs to the sheet.
    const value =
      (rule.view.start !== null && !root) || (rule.view.end !== null && !limit)
        ? null
        : { root, limit };
    rule.boundaries = { parent, value };
    return value;
  }

  type Winner = CascadePriority & {
    value: string;
    base?: string | undefined;
    shorthand?: string;
    previous?: Winner | undefined;
  };
  // An inherited custom property without a local declaration is already a computed value.
  type ComputedWinner = Winner | string;
  type ComputedDeclaration = ReturnType<typeof declaration>;
  const viewportValue = /(?:[sld])?v(?:w|h|min|max)\b|\\/i;
  const documentURLValue = /url\s*\(|\\/i;
  type CustomBlock = {
    names: readonly string[];
    values: ReadonlyMap<string, string>;
    characters: number;
    usesViewport: boolean;
    usesDocumentURL: boolean;
  };
  type InheritedCustomBlock = {
    block: CustomBlock;
    groups: readonly ProjectedIndexGroup[];
  };
  type CustomPlacement = { before: string | undefined; end: number };
  type CustomProjection = { block: CustomBlock; placements: readonly CustomPlacement[] };
  const minimumPackedTokens = 24;
  const maximumPackedGroups = 8;
  const recentCustomBlocks: WeakRef<CustomBlock>[] = [];
  let inheritedCustomBlocks: WeakMap<ComputedDeclaration, InheritedCustomBlock> | undefined;
  let shareableCustomBlocks: WeakMap<ComputedDeclaration, CustomBlock | null> | undefined;

  function customBlock(values: Map<string, string>): CustomBlock {
    const names = [...values.keys()];
    for (const reference of recentCustomBlocks) {
      const block = reference.deref();
      if (
        block?.names.length === names.length &&
        names.every(
          (name, index) =>
            name === block.names[index] && values.get(name) === block.values.get(name),
        )
      )
        return block;
    }
    let characters = 0;
    let usesViewport = false;
    let usesDocumentURL = false;
    for (const [name, value] of values) {
      characters += name.length + value.length;
      usesViewport ||= viewportValue.test(value);
      usesDocumentURL ||= documentURLValue.test(value);
    }
    const block = { names, values, characters, usesViewport, usesDocumentURL };
    if (characters <= 32768) {
      if (recentCustomBlocks.length === 4) recentCustomBlocks.shift();
      recentCustomBlocks.push(new WeakRef(block));
    }
    return block;
  }

  function shareableCustomBlock(style: ComputedDeclaration): CustomBlock | undefined {
    const shared = inheritedCustomBlocks?.get(style);
    if (shared) return shared.block;
    if (style._length < minimumPackedTokens) return;
    const cached = shareableCustomBlocks?.get(style);
    if (cached !== undefined) return cached ?? undefined;
    const values = new Map<string, string>();
    for (let index = 0; index < style._length; index++) {
      const name = style[index] ?? "";
      if (!name.startsWith("--")) continue;
      const value = style._values.get(name);
      if (!value || variableSyntax.test(value)) {
        (shareableCustomBlocks ??= new WeakMap()).set(style, null);
        return;
      }
      values.set(name, value);
    }
    const block = values.size >= minimumPackedTokens ? customBlock(values) : undefined;
    (shareableCustomBlocks ??= new WeakMap()).set(style, block ?? null);
    return block;
  }

  function isLiteralToken(value: string): boolean {
    return (
      !!value &&
      !variableSyntax.test(value) &&
      !substitutionFunction.test(value) &&
      cssInput(value).trim() === value &&
      !/^(?:initial|inherit|unset|revert(?:-layer|-rule)?)$/i.test(value)
    );
  }

  function packCustomWinners(winners: Map<string, ComputedWinner>): CustomProjection | undefined {
    if (winners.size < minimumPackedTokens) return;
    const values = new Map<string, string>();
    const placements: CustomPlacement[] = [];
    let pending = false;
    for (const [name, winner] of winners) {
      if (name.startsWith("--")) {
        const value = typeof winner === "string" ? winner : winner.value;
        if (!isLiteralToken(value)) return;
        values.set(name, value);
        pending = true;
      } else if (pending) {
        placements.push({ before: name, end: values.size });
        if (placements.length > maximumPackedGroups) return;
        pending = false;
      }
    }
    if (pending) placements.push({ before: undefined, end: values.size });
    if (values.size < minimumPackedTokens || placements.length > maximumPackedGroups) return;
    for (const name of values.keys()) winners.delete(name);
    return { block: customBlock(values), placements };
  }

  function sameCustomProjection(
    left: CustomProjection | undefined,
    right: CustomProjection | undefined,
  ): boolean {
    if (left === right) return true;
    return (
      !!left &&
      !!right &&
      left.block === right.block &&
      left.placements.length === right.placements.length &&
      left.placements.every(
        (placement, index) =>
          placement.before === right.placements[index]?.before &&
          placement.end === right.placements[index]?.end,
      )
    );
  }

  function computedView(style: ComputedDeclaration): PublicDeclaration {
    return declarationInterface().computedView(style, inheritedCustomBlocks?.get(style));
  }

  type CascadeEntry = {
    base?: string;
    shorthand?: string;
    name: string;
    value: string;
    important: boolean;
    order: number | undefined;
  };
  const privateRuleEntries = new WeakMap<DeclarationImplementation, readonly CascadeEntry[]>();
  const themeBlocks = new WeakMap<readonly CascadeEntry[], CustomBlock>();
  const recentThemeEntries = new WeakMap<
    DeclarationImplementation,
    WeakRef<readonly CascadeEntry[]>
  >();
  function ruleEntries(style: DeclarationImplementation): readonly CascadeEntry[] {
    const known =
      privateRuleEntries.get(style) ??
      (style._length > 96 ? recentThemeEntries.get(style)?.deref() : undefined);
    if (known) return known;
    const entries: CascadeEntry[] = [];
    const order = borderColorSourceOrder.get(style);
    for (let index = 0; index < style._length; index++) {
      const name = style[index] ?? "";
      const source = shorthandSources?.get(style)?.get(name);
      entries.push({
        name,
        ...(source && { shorthand: source.shorthand }),
        value:
          source?.text ?? calculationSources?.get(style)?.get(name) ?? style.getPropertyValue(name),
        important: style.getPropertyPriority(name) === "important",
        order: order?.get(name),
      });
    }
    if (entries.length <= 96) privateRuleEntries.set(style, entries);
    if (
      entries.length >= minimumPackedTokens &&
      entries.length <= 512 &&
      entries.every(({ name, value }) => name.startsWith("--") && isLiteralToken(value))
    ) {
      const block = customBlock(new Map(entries.map(({ name, value }) => [name, value])));
      if (block.characters <= 32768) {
        themeBlocks.set(entries, block);
        if (entries.length > 96) recentThemeEntries.set(style, new WeakRef(entries));
      }
    }
    return entries;
  }
  type CascadeInput = {
    outerDepth?: number;
    weight: number;
    hostContext: boolean;
    base: string | undefined;
    proximity: number;
    layerIndex: number | undefined;
    entries: readonly CascadeEntry[];
  };
  type FrameRevision = {
    tree: number;
    linked: number;
    authorSheets: boolean;
  };
  type DeferredComputed = {
    publish: () => PublicDeclaration;
    retained?: WeakRef<ComputedFrame>;
  };
  type FrameValues =
    | { style: ComputedDeclaration; deferred?: never }
    | { style?: never; deferred: DeferredComputed };
  type ComputedFrame = {
    reuse?: FrameRevision;
    winners: ReadonlyMap<string, ComputedWinner>;
    inputs: readonly CascadeInput[] | undefined;
    userAgentDirection: string | undefined;
    formattingContainer?: true;
    userAgentFocus?: true;
    userAgentHiddenInput: boolean;
    parent: WeakRef<ComputedFrame> | undefined;
    documentChild: boolean;
    userAgentColor: string | undefined;
    userAgentDisplay: string | undefined;
    userAgentContentVisibility: string | undefined;
    fontSize: number;
    rootFontSize: number;
    color: string;
    viewport: Viewport | undefined;
    baseURL: string | undefined;
    focusRevision?: number | undefined;
    substitution?: SubstitutionFrame;
    // The frame's values depend only on winners and ancestors: reusable, and not inherited.
    staticSubstitution?: true;
    siblingColor?: boolean;
    registered?: boolean;
    custom?: CustomProjection;
    units: number;
    characters: number;
    declarationCharacters: number;
  } & FrameValues;
  type FrameRole = "target" | "ancestor";
  const computedFrames = new WeakMap<
    Raw.Element,
    { target?: ComputedFrame; ancestor?: ComputedFrame }
  >();
  const frameOrder = new Map<ComputedFrame, { node: WeakRef<Raw.Element>; role: FrameRole }>();
  let frameBlocks: Map<CustomBlock, number> | undefined;
  let frameUnits = 0;
  let frameCharacters = 0;

  function forgetComputedFrame(frame: ComputedFrame): void {
    const owner = frameOrder.get(frame);
    if (!owner) return;
    frameOrder.delete(frame);
    frameUnits -= frame.units;
    frameCharacters -= frame.characters;
    const block = frame.custom?.block;
    if (block && frameBlocks) {
      const references = frameBlocks.get(block);
      if (references === 1) {
        frameBlocks.delete(block);
        frameUnits -= block.names.length * 2;
        frameCharacters -= block.characters * 2;
      } else if (references !== undefined) frameBlocks.set(block, references - 1);
    }
    const node = owner.node.deref();
    const slots = node && computedFrames.get(node);
    if (node && slots?.[owner.role] === frame) {
      delete slots[owner.role];
      if (!slots.target && !slots.ancestor) computedFrames.delete(node);
    }
  }

  function prioritizeAncestor(frame: ComputedFrame): void {
    const owner = frameOrder.get(frame);
    if (owner?.role !== "ancestor") return;
    frameOrder.delete(frame);
    frameOrder.set(frame, owner);
  }

  function rememberComputedFrame(node: Raw.Element, role: FrameRole, frame: ComputedFrame): void {
    const block = frame.custom?.block;
    const blockUnits = (block?.names.length ?? 0) * 2;
    const blockCharacters = (block?.characters ?? 0) * 2;
    // A large declaration still computes normally, without consuming a persistent cache budget.
    if (frame.units + blockUnits > 2048 || frame.characters + blockCharacters > 32768) return;
    const slots = computedFrames.get(node) ?? {};
    const previous = slots[role];
    if (previous) forgetComputedFrame(previous);
    while (
      frameOrder.size &&
      (frameOrder.size >= 128 ||
        frameUnits + frame.units + (block && !frameBlocks?.has(block) ? blockUnits : 0) > 8192 ||
        frameCharacters +
          frame.characters +
          (block && !frameBlocks?.has(block) ? blockCharacters : 0) >
          262144)
    ) {
      const oldest = frameOrder.keys().next().value;
      if (oldest) forgetComputedFrame(oldest);
    }
    slots[role] = frame;
    computedFrames.set(node, slots);
    frameOrder.set(frame, { node: new WeakRef(node), role });
    frameUnits += frame.units;
    frameCharacters += frame.characters;
    if (block) {
      const blocks = (frameBlocks ??= new Map());
      const references = blocks.get(block) ?? 0;
      if (!references) {
        frameUnits += blockUnits;
        frameCharacters += blockCharacters;
      }
      blocks.set(block, references + 1);
    }
  }

  function sameWinners(
    left: ReadonlyMap<string, ComputedWinner>,
    right: ReadonlyMap<string, ComputedWinner>,
  ): boolean {
    if (left.size !== right.size) return false;
    const entries = left.entries();
    // Declaration order affects shorthand serialization, so compare the ordered maps.
    for (const [name, value] of right) {
      const previous = entries.next().value;
      if (!previous || previous[0] !== name) return false;
      const prior = previous[1];
      if (typeof prior === "string" || typeof value === "string") {
        if (prior !== value) return false;
        continue;
      }
      if (
        prior.value !== value.value ||
        prior.base !== value.base ||
        prior.shorthand !== value.shorthand ||
        prior.context !== value.context ||
        prior.weight !== value.weight ||
        prior.layer !== value.layer ||
        prior.layerIndex !== value.layerIndex ||
        prior.proximity !== value.proximity ||
        prior.block !== value.block ||
        prior.order !== value.order
      )
        return false;
    }
    return true;
  }

  const scopeSelections = new WeakMap<Raw.ParentNode, RuleSelection>();
  function scopeSelection(root: Raw.ParentNode): RuleSelection {
    const existing = scopeSelections.get(root);
    if (existing) return existing;
    const reference = new WeakRef(root);
    const selection = {
      text: ":where(:scope)",
      entries: [
        {
          match: (node: Raw.Element) => node === reference.deref(),
          specificity: 0,
          hostOnly: false,
        },
      ],
    };
    scopeSelections.set(root, selection);
    return selection;
  }

  const nestingSelections = new WeakMap<
    Rule,
    { source: RuleSelection; parent: RuleSelection | undefined; bound: RuleSelection }
  >();
  function styleSelection(
    rule: Extract<Rule, { kind: "style" }>,
    parent?: RuleSelection,
  ): RuleSelection {
    const source = rule.selection.current;
    if (!source.containsNesting) return source;
    const previous = nestingSelections.get(rule);
    if (previous?.source === source && previous.parent === parent) return previous.bound;
    const bound = parseRuleSelection({
      text: source.text,
      isXML: input.isXML,
      statePseudos: input.statePseudos,
      requireMatchable: false,
      parentSelection: parent,
      namespaces: namespacesForSheet(rule.view.parentStyleSheet),
    }) ?? { text: source.text, entries: [] };
    nestingSelections.set(rule, { source, parent, bound });
    return bound;
  }

  let userAgentSnapshots: WeakMap<Raw.Element, () => PublicDeclaration> | undefined;
  let userAgentRevision: number | undefined;
  let userAgentSnapshotCount = 0;

  function userAgentSnapshot(
    node: Raw.Element,
    revision: number | undefined,
  ): PublicDeclaration | undefined {
    if (adopted.get(input.document)?.values.length || input.statePseudos["focus-visible"]?.(node))
      return;
    if (userAgentRevision !== revision || userAgentSnapshotCount >= 128) {
      userAgentSnapshots = undefined;
      userAgentRevision = revision;
      userAgentSnapshotCount = 0;
    }
    const previous = userAgentSnapshots?.get(node);
    if (previous) return previous();
    let foreground: string | undefined;
    const target = userAgentStyle(node);
    for (let element: Raw.Element | undefined = node; element;) {
      if (
        input.shadowRoot(element) ||
        (inlineStyles?.get(element)?.style._length ?? 0) !== 0 ||
        element.attrs.some((attr) => !attr.namespace && attr.name === "style" && attr.value)
      )
        return;
      const defaults = element === node ? target : userAgentStyle(element);
      if (defaults.needsDirection) return;
      // The nearest UA foreground wins in the absence of authored inheritance.
      if (foreground === undefined) {
        if (defaults.isHTML && defaults.tag === "mark") foreground = initialColor;
        else if (defaults.userAgentColor)
          foreground = systemColor(defaults.userAgentColor, "normal") ?? defaults.userAgentColor;
      }
      const parent: Raw.ParentNode | null = element.parentNode;
      element = parent && tree.isElementNode(parent) ? parent : undefined;
    }
    const { userAgentDisplay, userAgentContentVisibility, button, field, isHTML, tag } = target;
    const publish = views().deferredPublisher(
      (name) =>
        name === "display"
          ? (userAgentDisplay ?? "inline")
          : name === "visibility"
            ? "visible"
            : name === "content-visibility"
              ? (userAgentContentVisibility ?? "visible")
              : undefined,
      () => {
        const style = declaration();
        if (isHTML && uaIsolates.has(tag)) style._setProperty("unicode-bidi", "isolate", "");
        if (isHTML && uaBlockMargins.has(tag)) {
          for (const side of ["top", "bottom", "block-start", "block-end"])
            style._setProperty("margin-" + side, initialFontSize + "px", "");
        }
        if (isHTML && tag === "mark")
          style._setProperty("background-color", "rgb(255, 255, 0)", "");
        if (button || field)
          style._setProperty(
            "background-color",
            systemColor(button ? "ButtonFace" : "Field", "normal") ?? "",
            "",
          );
        const border = button && systemColor("ButtonBorder", "normal");
        if (border)
          for (const side of borderSides) style._setProperty(`border-${side}-color`, border, "");
        if (userAgentDisplay !== undefined) style._setProperty("display", userAgentDisplay, "");
        if (userAgentContentVisibility !== undefined)
          style._setProperty("content-visibility", userAgentContentVisibility, "");
        if (border) for (const name of logicalBorderColors) style._setProperty(name, border, "");
        style._setProperty("color", foreground ?? initialColor, "");
        style._global = declarationGlobals;
        style._computed = true;
        style._readonly = true;
        return { style };
      },
    );
    if (revision !== undefined) {
      (userAgentSnapshots ??= new WeakMap()).set(node, publish);
      userAgentSnapshotCount++;
    }
    return publish();
  }

  let latestFrameRevision: FrameRevision | undefined;

  function completedFrame(
    frame: ComputedFrame | undefined,
    node: Raw.Element,
    currentRevision: number | undefined,
  ): frame is ComputedFrame {
    const proof = frame?.reuse;
    return (
      !!frame &&
      !!proof &&
      proof.tree === currentRevision &&
      proof.linked === linkedSheetRevision &&
      (!proof.authorSheets || !exposedStylesheets) &&
      !didAdoptStylesheets &&
      ((!frame.viewport && frame.baseURL === undefined) ||
        (sameCompletedEnvironment(frame, node) &&
          input.styleRevision(input.document) === proof.tree &&
          linkedSheetRevision === proof.linked &&
          (!proof.authorSheets || !exposedStylesheets) &&
          !didAdoptStylesheets)) &&
      (frame.focusRevision === undefined || frame.focusRevision === input.focusRevision())
    );
  }

  function setComputedForeground(style: ComputedDeclaration, color: string): void {
    if (isSerializedRGB(color)) style._setProperty("color", color, "");
    else style.setProperty("color", color);
  }

  function publishAncestorAsTarget(frame: ComputedFrame): PublicDeclaration | undefined {
    // Element-relative SVG paints need the target cascade. Ordinary declarations
    // differ from their ancestor frame only by the finalized foreground.
    const style = frame.style;
    const independent = style && partialAncestors?.get(style)?.target;
    if (independent) {
      prioritizeAncestor(frame);
      return independent();
    }
    if (
      !style ||
      partialAncestors?.has(style) ||
      frame.winners.has("fill") ||
      frame.winners.has("stroke") ||
      style._values.has("fill") ||
      style._values.has("stroke") ||
      style._values.has("color") ||
      !isSerializedRGB(frame.color)
    )
      return;
    style._global = declarationGlobals;
    prioritizeAncestor(frame);
    return declarationInterface().computedView(
      style,
      inheritedCustomBlocks?.get(style),
      frame.color,
    );
  }

  function computedFrameView(frame: ComputedFrame): PublicDeclaration {
    if (frame.deferred) return frame.deferred.publish();
    frame.style._global = declarationGlobals;
    return computedView(frame.style);
  }

  type AncestorDisplays = Map<Raw.Element, boolean>;
  function focusDisplayCheck(): ((node: Raw.Element) => boolean | undefined) | undefined {
    if (exposedStylesheets || didAdoptStylesheets || !views().hasNativePropertyReader()) return;
    const displays: AncestorDisplays = new Map();
    const tree = input.styleRevision(input.document);
    const linked = linkedSheetRevision;
    const focus = input.focusRevision();
    function stillCurrent(): boolean {
      return (
        tree === input.styleRevision(input.document) &&
        linked === linkedSheetRevision &&
        focus === input.focusRevision() &&
        !exposedStylesheets &&
        !didAdoptStylesheets
      );
    }
    return (node) => {
      if (!stillCurrent() || !views().hasNativePropertyReader()) return;
      const cached = displays.get(node);
      if (cached !== undefined) return cached;
      if (input.styleScope(node) !== input.document) return;
      const ancestor = computedFrames.get(node)?.ancestor;
      if (completedFrame(ancestor, node, tree))
        return ancestor.style?._values.get("display") === "none";
      const style = computedStyle(node, input.document, displays);
      const hidden = style.getPropertyValue("display") === "none";
      if (!stillCurrent()) displays.clear();
      return hidden;
    };
  }

  function computedStyle(
    node: Raw.Element,
    root?: Raw.ParentNode,
    displays?: AncestorDisplays,
  ): PublicDeclaration {
    if (root && input.shadowHost(root) && !input.isConnected(node))
      return finishComputedStyle(declaration());
    if (root !== input.document) return computeStyle(node, root, collect(root));

    const revision = input.styleRevision(root);
    const linked = linkedSheetRevision;
    const frames = computedFrames.get(node);
    if (completedFrame(frames?.target, node, revision)) return computedFrameView(frames.target);
    if (completedFrame(frames?.ancestor, node, revision)) {
      const publicStyle = publishAncestorAsTarget(frames.ancestor);
      if (publicStyle) return publicStyle;
    }

    const available = collect(root);
    const stableCollection =
      revision !== undefined &&
      input.styleRevision(root) === revision &&
      linkedSheetRevision === linked;
    if (!available.length && !scriptRegistrations && stableCollection && !input.isXML) {
      const snapshot = userAgentSnapshot(node, revision);
      if (snapshot) return snapshot;
    }
    let proof: FrameRevision | undefined;
    if (stableCollection && (!available.length || !exposedStylesheets) && !didAdoptStylesheets) {
      const authorSheets = available.length !== 0;
      if (
        latestFrameRevision?.tree !== revision ||
        latestFrameRevision.linked !== linked ||
        latestFrameRevision.authorSheets !== authorSheets
      )
        latestFrameRevision = { tree: revision, linked, authorSheets };
      proof = latestFrameRevision;
    }
    return computeStyle(node, root, available, proof, displays);
  }

  function sameCompletedEnvironment(frame: ComputedFrame, node: Raw.Element): boolean {
    if (frame.viewport) {
      const current = input.viewport();
      if (
        current.width !== frame.viewport.width ||
        current.height !== frame.viewport.height ||
        current.resolution !== frame.viewport.resolution
      )
        return false;
    }
    return (
      frame.baseURL === undefined || frame.baseURL === input.baseURL(input.ownerDocument(node))
    );
  }

  function winningValueResolver(
    winners: ReadonlyMap<string, ComputedWinner>,
    custom: CustomBlock | undefined,
    substitution: SubstitutionFrame | undefined,
    registrations: ReadonlyMap<string, RegisteredProperty> | undefined,
  ) {
    let resolver: ReturnType<typeof createVariableResolver> | undefined;
    function lookup(name: string): string | undefined {
      const entry = winners.get(name);
      return typeof entry === "string" ? entry : (entry?.value ?? custom?.values.get(name));
    }
    function resolveValue(name: string, value: string): string | undefined {
      if (
        substitution &&
        !usesDynamicViewportMath(value) &&
        (substitutionFunction.test(value) || variableSyntax.test(value))
      )
        return substitution.read(name) || undefined;
      if (!variableSyntax.test(value)) return value;
      const variable = !name.startsWith("--") && directVariable.exec(value)?.[1];
      const literal = variable ? lookup(variable) : undefined;
      const shareable =
        literal !== undefined && literal.length <= 256 && !variableSyntax.test(literal);
      if (shareable) {
        const known = literalSubstitutions.get(literal);
        if (known !== undefined) return known;
      }
      const resolved = (resolver ??= createVariableResolver(lookup))(name, value);
      if (shareable && resolved !== undefined && resolved.length <= 256)
        rememberSyntax(literalSubstitutions, literal, resolved, 128);
      return resolved;
    }
    let pending: Map<string, Declaration> | undefined;
    function expandPending(name: string, shorthand: string, source: string): string | undefined {
      // All components of a winning shorthand share the same immutable variable environment.
      const key = `${shorthand}\0${source}`;
      const declarations = (pending ??= new Map());
      let expanded = declarations.get(key);
      if (!expanded) {
        const value = resolveValue(shorthand, source);
        if (value === undefined) return;
        const colorPair = logicalBorderColorShorthands.get(shorthand);
        if (colorPair) return splitLogicalBorderColors(shorthand, value)?.[colorPair.indexOf(name)];
        expanded = declaration();
        if (shorthand === "outline") {
          for (const [property, component] of splitOutline(value) ?? [])
            expanded._setProperty(property, component, "");
        } else {
          expanded.setProperty(shorthand, value);
        }
        if (shorthand === "background-position") {
          const axes = splitBackgroundPosition(expanded.getPropertyValue(shorthand));
          if (axes) {
            expanded.setProperty(backgroundPositionAxes[0], axes[0]);
            expanded.setProperty(backgroundPositionAxes[1], axes[1]);
          }
        }
        declarations.set(key, expanded);
      }
      return expanded.getPropertyValue(name) || undefined;
    }
    return { resolveValue, expandPending, substitution, registrations };
  }

  // Resolution reads only named parent values, so a captured subset can stand in for the parent.
  type ParentValues = Pick<ComputedDeclaration, "getPropertyValue">;
  type ResolutionValues = {
    transformedDisplay: string | undefined;
    prior: ParentValues | undefined;
    custom: CustomProjection | undefined;
    projected: CustomBlock | undefined;
    fontSize: number;
    rootFontSize: number;
    specifiedFontSize: string | undefined;
    computedFontSize: number | undefined;
    color: string;
    colorScheme: string;
    target: boolean;
    userAgentDisplay: string | undefined;
    userAgentContentVisibility: string | undefined;
  };

  // A child usually needs only inherited values. Keep a complete read available
  // for explicit inheritance of a non-inherited shorthand component.
  // An independent projection resolved only inherited values and display eagerly.
  // It captures the parent values it reads and can publish the element as a deferred target.
  type AncestorProjection = {
    complete: () => ComputedDeclaration;
    target?: () => PublicDeclaration;
    units: number;
    characters: number;
  };
  let partialAncestors: WeakMap<ParentValues, AncestorProjection> | undefined;
  function resolveDeclaration(
    winners: ReadonlyMap<string, ComputedWinner>,
    values: ResolutionValues,
    resolver: ReturnType<typeof winningValueResolver>,
    readViewport: () => Viewport,
    readBaseURL: () => string,
    property?: string,
    inheritanceOnly: boolean | "independent" = false,
  ): ComputedDeclaration {
    const {
      prior,
      projected,
      fontSize,
      rootFontSize,
      computedFontSize,
      color,
      colorScheme,
      target,
      userAgentDisplay,
      userAgentContentVisibility,
    } = values;
    const { resolveValue, expandPending } = resolver;
    const { custom, specifiedFontSize } = values;
    const placements = property === undefined ? custom?.placements : undefined;
    let placementIndex = 0;
    const result = declaration();
    const requested = property === undefined ? undefined : winners.get(property);
    const entries =
      property === undefined
        ? winners
        : requested === undefined
          ? []
          : [[property, requested] as const];
    for (const [name, winner] of entries) {
      // Invalid property names reserve positions across native shorthand rewrites.
      if (placements?.[placementIndex]?.before === name)
        result._setProperty(` ${placementIndex++}`, "1", "");
      if (
        inheritanceOnly &&
        typeof winner !== "string" &&
        (inheritanceOnly === "independent"
          ? name !== "display" && !name.startsWith("--")
          : winner.shorthand) &&
        !inherited.has(name)
      )
        continue;
      if (resolver.substitution && resolver.registrations?.has(name)) {
        const computed = resolver.substitution.read(name);
        if (computed) result._setProperty(name, computed, "");
        continue;
      }
      if (typeof winner === "string") {
        result._setProperty(name, winner, "");
        continue;
      }
      if (name === "color") continue;
      const { value: specified, base, shorthand, context } = winner;
      const isCustomProperty = name.startsWith("--");
      if (context === -1 || context === Infinity) {
        result._setProperty(
          name,
          !isCustomProperty &&
            name.endsWith("-color") &&
            !(name === "outline-color" && specified === "auto")
            ? resolveColor(specified, { currentColor: color, colorScheme })
            : specified,
          "",
        );
        continue;
      }
      if (name === "font-size" && computedFontSize !== undefined) {
        result._setProperty(name, `${Number(fontSize.toPrecision(6))}px`, "");
        continue;
      }
      if (
        resolver.substitution &&
        (!shorthand ||
          variableSyntax.test(specified) ||
          substitutionFunction.test(specified) ||
          contextualLonghand.test(name)) &&
        !usesDynamicViewportMath(specified) &&
        (substitutionFunction.test(specified) ||
          contextualLonghand.test(name) ||
          usesTypedValueGrammar(name, specified) ||
          variableSyntax.test(specified) ||
          (!isCustomProperty && elementDimension.test(specified)))
      ) {
        const computed = resolver.substitution.read(name);
        if (shorthand && /^(?:(?:column|row)-)?rule$/.test(shorthand))
          computedGapRules.set(result, resolver.substitution);
        if (computed) result._setProperty(name, computed, "");
        continue;
      }
      const substituted =
        shorthand === undefined
          ? resolveValue(name, specified)
          : expandPending(name, shorthand, specified);
      const value =
        substituted === undefined || isCustomProperty || name === "font"
          ? substituted
          : roundComputedInteger(
              name,
              substituted,
              computeNumericValue(
                resolveFontRelativeLengths(substituted, fontSize, rootFontSize),
                readViewport,
              ),
            );
      if (value === undefined) {
        const inheritedValue = inherited.has(name) && prior?.getPropertyValue(name);
        if (inheritedValue) result.setProperty(name, inheritedValue);
        continue;
      }
      if (isCustomProperty && /^(?:initial|inherit|unset|revert-layer)$/i.test(value)) continue;
      if (name === "-webkit-box-orient" && (value === "inline-axis" || value === "block-axis")) {
        result._setProperty(name, value === "inline-axis" ? "horizontal" : "vertical", "");
        continue;
      }
      if (name === "opacity" || name.endsWith("-opacity")) {
        const fraction = value.endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value);
        if (Number.isFinite(fraction)) {
          result._setProperty(name, String(Math.max(0, Math.min(1, fraction))), "");
          continue;
        }
      }
      const initialValue =
        computedInitialValues.get(name) ??
        (!isCustomProperty && /^(?:initial|inherit|unset)$/i.test(value)
          ? longhandDefinition(name)?.initial
          : undefined);
      if (initialValue !== undefined) {
        const keyword = value.toLowerCase();
        if (keyword === "initial") continue;
        if (keyword === "inherit" || keyword === "unset") {
          const shouldInherit = keyword === "inherit" || inherited.has(name);
          const source =
            shouldInherit && !inherited.has(name) && prior
              ? (partialAncestors?.get(prior)?.complete() ?? prior)
              : prior;
          const inheritedValue = shouldInherit ? source?.getPropertyValue(name) : undefined;
          if (inheritedValue) result.setProperty(name, inheritedValue);
          continue;
        }
      }
      if (value === "revert") {
        const userAgentValue =
          name === "display"
            ? userAgentDisplay
            : name === "content-visibility"
              ? userAgentContentVisibility
              : undefined;
        const inheritedValue =
          inherited.has(name) || isCustomProperty
            ? (projected?.values.get(name) ?? prior?.getPropertyValue(name))
            : undefined;
        const fallback = userAgentValue || inheritedValue || (name === "font-size" ? "16px" : "");
        if (fallback) result.setProperty(name, fallback);
        continue;
      }
      if (isCustomProperty) {
        // The cascade already selected the case-sensitive name and discarded
        // importance. Custom tokens only need the declaration's value cleanup.
        const tokens = cssInput(value).trim();
        result._setProperty(name, tokens || " ", "");
        continue;
      }
      if (name === "background-image" && /-gradient\(/i.test(value)) {
        let images = serializeGradientImages(value, { currentColor: color, colorScheme });
        if (/url\(/i.test(images)) images = resolveCSSURLs(images, base ?? readBaseURL());
        result._setProperty(name, images, "");
        continue;
      }
      if (name === "box-shadow") {
        const shadow = computedBoxShadow(value, color, colorScheme, readViewport);
        if (shadow) result._setProperty(name, shadow, "");
        continue;
      }
      if (name === "background-position-x" || name === "background-position-y") {
        result._setProperty(name, computePositionAxis(value), "");
        continue;
      }
      if (name === "flex-basis") {
        result.setProperty(name, simplifyCSSCalculation(value));
        continue;
      }
      if (name === "font-weight") {
        result._setProperty(
          name,
          computedFontWeight(value, prior?.getPropertyValue(name) ?? "400"),
          "",
        );
        continue;
      }
      if (name === "font-stretch" || name === "font-width") {
        result._setProperty(name, fontWidths.get(value) ?? value, "");
        continue;
      }
      if (
        borderWidthStyles.has(name) ||
        borderSideStyles.has(name) ||
        borderSideColors.has(name) ||
        logicalBorderColorNames.has(name) ||
        boxLonghands.has(name)
      ) {
        if (/^(?:initial|inherit|unset|revert-layer)$/i.test(value)) continue;
        if (value !== specified) {
          const { lexer }: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
          if (lexer.matchProperty(name, value).error !== null) continue;
        }
        // Resolve system colors in the declaring frame before inheritance;
        // currentColor remains a dependency of the element that uses it.
        const computed =
          borderSideColors.has(name) || logicalBorderColorNames.has(name)
            ? replaceSystemColors(value, colorScheme)
            : value;
        result._setProperty(name, computed, "");
        continue;
      }
      if (name === "outline-width" || name === "outline-offset") {
        if (/^(?:initial|unset|revert-layer)$/i.test(value)) continue;
        const currentViewport = readViewport();
        const length = computeNumericValue(value, () => currentViewport);
        const computed =
          name === "outline-width" ? snapOutlineWidth(length, currentViewport.resolution) : length;
        result.setProperty(name, computed);
        continue;
      }
      if (name === "outline-color" && value.toLowerCase() === "auto") {
        result._setProperty(name, "auto", "");
        continue;
      }
      const computed = name.endsWith("-color")
        ? resolveColor(value, { currentColor: color, colorScheme })
        : /url\(/i.test(value)
          ? resolveCSSURLs(value, base ?? readBaseURL())
          : value;
      // System colors compute in their declaring element's scheme; currentColor
      // paint references retain the target's foreground dependency.
      const paint = target && (name === "fill" || name === "stroke");
      result.setProperty(
        name,
        paint
          ? resolveColor(computed, { currentColor: color, colorScheme, fallback: computed })
          : name === "fill" || name === "stroke" || name === "text-shadow"
            ? replaceSystemColors(computed, colorScheme)
            : computed,
      );
    }
    if (
      values.transformedDisplay !== undefined &&
      (property === undefined || property === "display")
    )
      result._setProperty("display", values.transformedDisplay, "");
    const lineHeight = result._values.get("line-height");
    if (lineHeight) {
      const percentage = lineHeight.endsWith("%");
      const multiplier = Number(percentage ? lineHeight.slice(0, -1) : lineHeight);
      if (Number.isFinite(multiplier)) {
        const pixels =
          Number(((fontSize * multiplier) / (percentage ? 100 : 1)).toPrecision(12)) + "px";
        if (percentage) result._setProperty("line-height", pixels, "");
        else unitlessLineHeights.set(result, pixels);
      }
    }
    if (property !== undefined) return result;
    if (placements && placementIndex < placements.length)
      result._setProperty(` ${placementIndex}`, "1", "");
    if (
      winners.has("margin-block-start") ||
      winners.has("margin-block-end") ||
      winners.has("margin-inline-start") ||
      winners.has("margin-inline-end")
    ) {
      const sides = physicalBorderSides(
        result.getPropertyValue("writing-mode"),
        result.getPropertyValue("direction") === "rtl",
      );
      for (const [index, axis] of [
        "block-start",
        "block-end",
        "inline-start",
        "inline-end",
      ].entries()) {
        const logical = "margin-" + axis;
        const physical = "margin-" + sides[index];
        const logicalWinner = objectWinner(winners.get(logical));
        const physicalWinner = objectWinner(winners.get(physical));
        if (!logicalWinner && !physicalWinner) continue;
        const logicalWins =
          logicalWinner && (!physicalWinner || outranks(logicalWinner, physicalWinner));
        result._setProperty(
          logicalWins ? physical : logical,
          result.getPropertyValue(logicalWins ? logical : physical),
          "",
        );
      }
    }
    if (borderColorSourceOrder.has(result)) {
      const writingMode = result.getPropertyValue("writing-mode");
      const rtl =
        result.getPropertyValue("direction") === "rtl" &&
        result.getPropertyValue("text-orientation") !== "upright";
      const physicalSides = physicalBorderSides(writingMode, rtl);
      for (const [index, logical] of logicalBorderColors.entries()) {
        const physical = `border-${physicalSides[index]}-color`;
        const logicalWinner = objectWinner(winners.get(logical));
        const physicalWinner = objectWinner(winners.get(physical));
        if (!logicalWinner && !physicalWinner) continue;
        const logicalWins =
          logicalWinner && (!physicalWinner || outranks(logicalWinner, physicalWinner));
        const value = result.getPropertyValue(logicalWins ? logical : physical);
        result._setProperty(logical, value, "");
        result._setProperty(physical, value, "");
      }
    }
    // A shorthand serializer may have rewritten the longhand while storing font.
    if (specifiedFontSize !== undefined && computedFontSize !== undefined)
      result._setProperty("font-size", `${Number(fontSize.toPrecision(6))}px`, "");
    // Finish the target before retaining it: public views must not rewrite color
    // and materialize their shared maps on every getComputedStyle call.
    if (target) setComputedForeground(result, color);
    if (custom) {
      const groups = custom.placements.map(({ end }, index) => {
        const marker = ` ${index}`;
        const offset = result._propertyIndices.get(marker) ?? result._length;
        result.removeProperty(marker);
        return { offset, end };
      });
      (inheritedCustomBlocks ??= new WeakMap()).set(result, { block: custom.block, groups });
    }
    return result;
  }

  function objectWinner(value: ComputedWinner | undefined): Winner | undefined {
    return typeof value === "string" ? undefined : value;
  }

  const independentProperties = new Set([
    ...dimensionProperties,
    "box-sizing",
    "content-visibility",
    "display",
    "opacity",
    "position",
    "visibility",
    "z-index",
  ]);

  function canDeferValues(
    winners: ReadonlyMap<string, ComputedWinner>,
    values: ResolutionValues,
    viewport: Viewport | undefined,
    baseURL: string | undefined,
  ): boolean {
    if (
      viewport &&
      (typeof viewport.width !== "number" ||
        typeof viewport.height !== "number" ||
        typeof viewport.resolution !== "number")
    )
      return false;
    if (viewport && baseURL !== undefined) return true;
    const needsEnvironment = (value: string) =>
      (!viewport && viewportValue.test(value)) ||
      (baseURL === undefined && documentURLValue.test(value));
    let usesCustom = false;
    for (const [name, winner] of winners) {
      if (name.startsWith("--")) continue;
      if (!viewport && (name === "outline-width" || name === "outline-offset")) return false;
      const value = typeof winner === "string" ? winner : winner.value;
      if (needsEnvironment(value)) return false;
      usesCustom ||= variableSyntax.test(value);
    }
    if (!usesCustom) return true;
    const shared = values.custom?.block;
    if ((!viewport && shared?.usesViewport) || (baseURL === undefined && shared?.usesDocumentURL))
      return false;
    for (const [name, winner] of winners)
      if (
        name.startsWith("--") &&
        needsEnvironment(typeof winner === "string" ? winner : winner.value)
      )
        return false;
    return true;
  }

  function capturedEnvironment(viewport: Viewport | undefined, baseURL: string | undefined) {
    return {
      readViewport() {
        if (!viewport) throw new Error("Expected a captured viewport");
        return viewport;
      },
      readBaseURL() {
        if (baseURL === undefined) throw new Error("Expected a captured document base URL");
        return baseURL;
      },
    };
  }

  function registerAncestorProjection(
    style: ComputedDeclaration,
    winners: ReadonlyMap<string, ComputedWinner>,
    values: ResolutionValues,
    resolver: ReturnType<typeof winningValueResolver>,
    viewport: Viewport | undefined,
    baseURL: string | undefined,
    units: number,
    characters: number,
    independent = false,
  ): void {
    const { readViewport, readBaseURL } = capturedEnvironment(viewport, baseURL);
    (partialAncestors ??= new WeakMap()).set(style, {
      complete: () => resolveDeclaration(winners, values, resolver, readViewport, readBaseURL),
      ...(independent && {
        target: () =>
          deferComputedValues(
            winners,
            { ...values, target: true },
            resolver,
            viewport,
            baseURL,
          ).publish(),
      }),
      units,
      characters,
    });
  }

  // Non-inherited literal values read the parent only through explicit inheritance.
  function independentOfParent(winners: ReadonlyMap<string, ComputedWinner>): boolean {
    for (const [name, winner] of winners) {
      // The foreground resolves before the declaration and never reads it.
      if (
        typeof winner === "string" ||
        inherited.has(name) ||
        name.startsWith("--") ||
        name === "color"
      )
        continue;
      if (
        winner.shorthand ||
        variableSyntax.test(winner.value) ||
        substitutionFunction.test(winner.value) ||
        winner.value.toLowerCase() === "inherit"
      )
        return false;
    }
    return true;
  }

  function deferComputedValues(
    winners: ReadonlyMap<string, ComputedWinner>,
    values: ResolutionValues,
    resolver: ReturnType<typeof winningValueResolver>,
    viewport: Viewport | undefined,
    baseURL: string | undefined,
  ): DeferredComputed {
    // No DOM reads can occur after publication. Cascade inputs and the prior
    // declaration are immutable, and environment-dependent writes use captured values.
    const { readViewport, readBaseURL } = capturedEnvironment(viewport, baseURL);
    let reads: Map<string, string> | undefined;
    const deferred: DeferredComputed = {
      publish: views().deferredPublisher(
        (name) => {
          if (name === "display" && values.transformedDisplay !== undefined)
            return values.transformedDisplay;
          if (resolver.substitution && resolver.registrations?.has(name))
            return resolver.substitution.read(name);
          if (name === "color" && isSerializedRGB(values.color)) return values.color;
          // The shorthand and axes can affect each other's computed values.
          // Without a winner anywhere in the family, all three retain their initial value.
          if (
            (name === "overflow" || name === "overflow-x" || name === "overflow-y") &&
            !winners.has("all") &&
            !winners.has("overflow") &&
            !winners.has("overflow-x") &&
            !winners.has("overflow-y") &&
            !winners.has("overflow-block") &&
            !winners.has("overflow-inline")
          )
            return "visible";
          const custom = name.startsWith("--");
          if ((!custom && !independentProperties.has(name)) || winners.has("all")) return;
          const known = reads?.get(name);
          if (known !== undefined) return known;
          const winner = winners.get(name);
          if (!winner)
            return custom
              ? (values.custom?.block.values.get(name) ?? "")
              : (computedInitialValues.get(name) ?? longhandDefinition(name)?.initial ?? "");
          if (typeof winner !== "string") {
            if (winner.shorthand || variableSyntax.test(winner.value)) return;
            if (
              winner.context === -1 ||
              winner.context === Infinity ||
              literalComputedValues.get(name)?.has(winner.value)
            )
              return winner.value;
          }
          const style = resolveDeclaration(
            winners,
            values,
            resolver,
            readViewport,
            readBaseURL,
            name,
          );
          style._computed = true;
          const value = style.getPropertyValue(name);
          (reads ??= new Map()).set(name, value);
          return value;
        },
        () => {
          const style = resolveDeclaration(winners, values, resolver, readViewport, readBaseURL);
          style._global = declarationGlobals;
          const frame = deferred.retained?.deref();
          if (frame) forgetComputedFrame(frame);
          return declarationInterface().computedContext(style, inheritedCustomBlocks?.get(style));
        },
      ),
    };
    return deferred;
  }

  // Substitution frames outlive this computation; keep their reader's context to the element.
  function elementBaseURL(element: Raw.Element): () => string {
    return () => input.baseURL(input.ownerDocument(element));
  }

  function computeStyle(
    node: Raw.Element,
    root: Raw.ParentNode | undefined,
    available: SheetRecord[],
    proof?: FrameRevision,
    displays?: AncestorDisplays,
    pseudo?: string,
  ): PublicDeclaration {
    let reusableEligible = proof !== undefined;
    let focusRevision: number | undefined = input.focusRevision();
    function certify(frame: ComputedFrame): void {
      if (
        reusableEligible &&
        proof &&
        !didAdoptStylesheets &&
        (!proof.authorSheets || !exposedStylesheets) &&
        (!viewport ||
          (typeof viewport.width === "number" &&
            typeof viewport.height === "number" &&
            typeof viewport.resolution === "number")) &&
        input.styleRevision(input.document) === proof.tree &&
        linkedSheetRevision === proof.linked &&
        (focusRevision === undefined || focusRevision === input.focusRevision())
      ) {
        // A previously retained frame can acquire a media dependency without changing its winners.
        frame.viewport ??= viewport && { ...viewport };
        frame.reuse = proof;
        frame.focusRevision = focusRevision;
      }
    }
    let otherScopes: Map<Raw.ParentNode | undefined, SheetRecord[]> | undefined;
    function sheetsIn(scope: Raw.ParentNode | undefined): SheetRecord[] {
      if (scope === root) return available;
      const cache = (otherScopes ??= new Map());
      const known = cache.get(scope);
      if (known) return known;
      const found = collect(scope);
      cache.set(scope, found);
      return found;
    }

    let viewport: Viewport | undefined;
    let documentBase: string | undefined;
    // Only layered styles pay for a global ordering pass. The table lives for this
    // computation, so CSSOM edits, media changes and adoption need no invalidation cache.
    let layerOrders: Map<Raw.ParentNode | undefined, Map<Rule, number>> | undefined;
    let registrationsByScope:
      | Map<Raw.ParentNode | undefined, Map<string, RegisteredProperty>>
      | undefined;
    function layerOrder(target: Raw.ParentNode | undefined): Map<Rule, number> {
      const cache = (layerOrders ??= new Map());
      const previous = cache.get(target);
      if (previous) return previous;
      type Layer = { children: Map<string | Rule, Layer>; rank: number };
      const outer: Layer = { children: new Map(), rank: Infinity };
      const assignments = new Map<Rule, Layer>();
      function register(parent: Layer, name: string, rule: Rule): Layer {
        const css: typeof import("css-tree") & {
          tokenTypes: { Ident: number };
          tokenize: (
            source: string,
            visit: (type: number, start: number, end: number) => void,
          ) => void;
        } = require("./css-runtime.cjs").cssTree;
        const names: (string | Rule)[] = [];
        css.tokenize(name, (type, start, end) => {
          if (type === css.tokenTypes.Ident) names.push(css.ident.decode(name.slice(start, end)));
        });
        if (!names.length) names.push(rule);
        for (const segment of names) {
          let child = parent.children.get(segment);
          if (!child) {
            child = { children: new Map(), rank: 0 };
            parent.children.set(segment, child);
          }
          parent = child;
        }
        return parent;
      }
      const stack: { sheet: Sheet; rules: Rule[]; parent: Layer; index: number }[] = [];
      function push(sheet: Sheet, rules: Rule[], parent: Layer): void {
        const media = sheetState(sheet).media;
        if (
          !sheet.disabled &&
          (!media || mediaListState(media).matches((viewport ??= input.viewport())))
        )
          stack.push({ sheet, rules, parent, index: 0 });
      }
      const sheets = sheetsIn(target).map(({ sheet }) => sheet);
      sheets.push(...(adopted.get(target ?? input.document)?.values ?? []));
      for (const sheet of [...new Set(sheets.reverse())].reverse()) {
        push(sheet, sheetState(sheet).rules, outer);
        // Each frame advances once per finite rule; imports are acyclic and depth-bounded by loading.
        while (stack.length) {
          const frame = stack[stack.length - 1];
          if (!frame) break;
          const rule = frame.rules[frame.index++];
          if (!rule) {
            stack.pop();
            continue;
          }
          let parent = frame.parent;
          if (rule.kind === "layer-statement") {
            for (const name of rule.view.nameList) register(parent, name, rule);
          } else if (rule.kind === "import") {
            if (rule.view.supportsText !== null && !css().supports(rule.view.supportsText))
              continue;
            if (!mediaListState(rule.view.media).matches((viewport ??= input.viewport()))) continue;
            if (rule.view.layerName !== null) parent = register(parent, rule.view.layerName, rule);
            assignments.set(rule, parent);
            if (rule.imported) push(rule.imported.sheet, rule.imported.rules, parent);
          } else if (rule.kind === "layer-block") {
            parent = register(parent, rule.view.name, rule);
            assignments.set(rule, parent);
            push(frame.sheet, rule.rules, parent);
          } else if (rule.kind === "media") {
            if (mediaListState(rule.view.media).matches((viewport ??= input.viewport())))
              push(frame.sheet, rule.rules, parent);
          } else if (rule.kind === "supports") {
            if (rule.view.matches) push(frame.sheet, rule.rules, parent);
          } else if (rule.kind === "property") {
            assignments.set(rule, parent);
          } else if (
            rule.kind === "style" ||
            rule.kind === "scope" ||
            rule.kind === "container" ||
            rule.kind === "starting-style"
          ) {
            // Element-sensitive conditions reserve layer order even when they do not match this element.
            push(frame.sheet, rule.rules, parent);
          }
        }
      }
      const pending = [...outer.children.values()]
        .reverse()
        .map((layer) => ({ layer, visited: false }));
      let rank = 0;
      // Postorder keeps a parent's implicit layer after every child and before the next sibling.
      while (pending.length) {
        const entry = pending.pop();
        if (!entry) break;
        if (entry.visited) entry.layer.rank = ++rank;
        else {
          pending.push({ layer: entry.layer, visited: true });
          for (const child of [...entry.layer.children.values()].reverse())
            pending.push({ layer: child, visited: false });
        }
      }
      const order = new Map([...assignments].map(([rule, layer]) => [rule, layer.rank]));
      const registrations = [...assignments]
        .filter(([rule]) => rule.kind === "property")
        .sort((left, right) => left[1].rank - right[1].rank);
      if (registrations.length) {
        const definitions = new Map<string, RegisteredProperty>();
        for (const [rule] of registrations) {
          if (rule.kind !== "property") continue;
          const def = rule.view;
          for (const name of def.names) {
            try {
              const registration = registeredProperty(
                {
                  name,
                  syntax: def.syntax,
                  inherits: def.inherits,
                  ...(def.initialValue !== null ? { initialValue: def.initialValue } : {}),
                },
                undefined,
                input.DOMException,
              );
              definitions.set(name, registration);
            } catch (error) {
              // Invalid descriptors keep their CSSOM rule but do not enter the registration map.
              if (!(error instanceof input.DOMException && error.name === "SyntaxError"))
                throw error;
            }
          }
        }
        (registrationsByScope ??= new Map()).set(target, definitions);
      }
      cache.set(target, order);
      return order;
    }
    const parents: { node: Raw.Element; scope: Raw.ParentNode | undefined; pseudo?: string }[] =
      pseudo
        ? [
            { node, scope: root, pseudo },
            { node, scope: root },
          ]
        : [{ node, scope: root }];
    let inheritedFrame: ComputedFrame | undefined;
    let scope = root;
    for (let parent = node.parentNode; parent;) {
      if (tree.isElementNode(parent)) {
        if (proof && scope === root) {
          const known = computedFrames.get(parent)?.ancestor;
          if (completedFrame(known, parent, proof.tree)) {
            prioritizeAncestor(known);
            inheritedFrame = known;
            viewport = known.viewport;
            documentBase = known.baseURL;
            focusRevision = known.focusRevision;
            break;
          }
        }
        parents.push({ node: parent, scope });
        parent = parent.parentNode;
      } else {
        const host = input.shadowHost(parent);
        if (!host) break;
        scope = input.styleScope(host);
        parent = host;
      }
    }
    let result = inheritedFrame?.style;
    let frame = inheritedFrame;
    let fontSize = inheritedFrame?.fontSize ?? initialFontSize;
    let rootFontSize = inheritedFrame?.rootFontSize ?? initialFontSize;
    let color = inheritedFrame?.color ?? initialColor;
    for (const { node: element, scope, pseudo: activePseudo } of parents.reverse()) {
      const pseudoFamily = activePseudo?.includes("(")
        ? activePseudo.slice(0, activePseudo.indexOf("(")) + "(*)"
        : undefined;
      let subjectTypeName: string | undefined;
      let subjectKeys: Set<string> | undefined;
      function elementSubjectKeys(): Set<string> {
        if (subjectKeys) return subjectKeys;
        const keys = new Set([`|${(subjectTypeName ??= elementLocalName(element).toLowerCase())}`]);
        for (const attr of element.attrs) {
          if (attr.namespace) continue;
          if (attr.name === "id") keys.add(`#${attr.value}`);
          if (attr.name === "class")
            for (const name of attr.value.split(/[\t\n\f\r ]+/)) if (name) keys.add(`.${name}`);
        }
        subjectKeys = keys;
        return keys;
      }
      function candidates(rules: Rule[], sheet: Sheet): Rule[] {
        if (activePseudo || !privateSheet(sheet)) return rules;
        const index = cascadeSubjectIndex(rules, cascadeRuleIndexes, identityRule);
        return index ? indexedSubjects(index, elementSubjectKeys()) : rules;
      }
      let prior = result;
      const parentFrame = frame;
      const role = element === node && (!pseudo || activePseudo) ? "target" : "ancestor";
      const documentChild = element.parentNode?.nodeName === "#document";
      const previous = activePseudo ? undefined : computedFrames.get(element)?.[role];
      const sameParent =
        previous &&
        (parentFrame ? previous.parent?.deref() === parentFrame : previous.parent === undefined);
      const inputs: CascadeInput[] = [];
      let themeEntries: readonly CascadeEntry[] | undefined;
      const {
        isHTML,
        tag,
        button,
        field,
        hiddenInput,
        userAgentColor,
        userAgentDisplay,
        userAgentContentVisibility,
        needsDirection,
      } = activePseudo
        ? {
            isHTML: false,
            tag: "",
            button: false,
            field: false,
            hiddenInput: false,
            userAgentColor: undefined,
            userAgentDisplay: /^(?:inline-)?(?:flex|grid)$/.test(
              prior?.getPropertyValue("display") ?? "",
            )
              ? "block"
              : undefined,
            userAgentContentVisibility: undefined,
            needsDirection: false,
          }
        : userAgentStyle(element);
      const userAgentFocus =
        !activePseudo && input.statePseudos["focus-visible"]?.(element) === true;
      const userAgentDirection = needsDirection ? input.directionality(element) : undefined;
      function sameEnvironment(cached: ComputedFrame): boolean {
        if (
          (cached.substitution && !cached.staticSubstitution) ||
          cached.siblingColor ||
          cached.registered ||
          scriptRegistrations
        )
          return false;
        const currentViewport = cached.viewport && (viewport ??= input.viewport());
        const sameViewport =
          !cached.viewport ||
          (currentViewport &&
            cached.viewport.width === currentViewport.width &&
            cached.viewport.height === currentViewport.height &&
            cached.viewport.resolution === currentViewport.resolution);
        const currentBase =
          cached.baseURL === undefined
            ? undefined
            : (documentBase ??= input.baseURL(input.ownerDocument(element)));
        return !!sameViewport && cached.baseURL === currentBase;
      }
      const sameContext =
        previous &&
        sameParent &&
        previous.documentChild === documentChild &&
        previous.userAgentColor === userAgentColor &&
        previous.userAgentDisplay === userAgentDisplay &&
        previous.userAgentContentVisibility === userAgentContentVisibility &&
        !!previous.userAgentFocus === userAgentFocus &&
        previous.userAgentDirection === userAgentDirection &&
        previous.userAgentHiddenInput === hiddenInput;
      // Inline declaration provenance, automatic direction and shadow styling retain
      // the complete path; serialized attribute equality alone cannot certify them.
      if (
        reusableEligible &&
        (userAgentDirection !== undefined ||
          input.shadowRoot(element) ||
          (inlineStyles?.get(element)?.style._length ?? 0) !== 0 ||
          element.attrs.some((attr) => !attr.namespace && attr.name === "style" && attr.value))
      )
        reusableEligible = false;
      let borderColorBlock = 0;
      let collectLosers = false,
        hasHistory = false,
        hasRollback = false;
      let outerPart: { host: Raw.Element; names: Set<string>; depth: number } | undefined;
      function take(
        style: DeclarationImplementation,
        weight: number,
        hostContext = false,
        base?: string,
        proximity = Infinity,
        layerIndex?: number,
        immutable = false,
      ): void {
        const old = previous?.inputs?.[inputs.length];
        const depth = outerPart?.depth ?? (activeSlot ? -1 : undefined);
        if (immutable) {
          const entries = ruleEntries(style);
          if (entries.length >= minimumPackedTokens && themeBlocks.has(entries))
            themeEntries = entries;
          if (
            old?.entries === entries &&
            old.weight === weight &&
            old.outerDepth === depth &&
            old.hostContext === hostContext &&
            old.base === base &&
            old.proximity === proximity &&
            old.layerIndex === layerIndex
          )
            inputs.push(old);
          else
            inputs.push({
              weight,
              hostContext,
              base,
              proximity,
              layerIndex,
              entries,
              ...(depth !== undefined && { outerDepth: depth }),
            });
          return;
        }
        let entries: CascadeEntry[] | undefined;
        const declarationOrder = borderColorSourceOrder.get(style);
        let index = 0;
        for (; index < style._length; index++) {
          const name = style[index] ?? "";
          const important = style.getPropertyPriority(name) === "important";
          const source = shorthandSources?.get(style)?.get(name);
          const value =
            source?.text ??
            calculationSources?.get(style)?.get(name) ??
            style.getPropertyValue(name);
          const order = declarationOrder?.get(name);
          const propertyBase = declarationBases?.get(style)?.get(name);
          const priorEntry = old?.entries[index];
          const equal =
            priorEntry &&
            priorEntry.base === propertyBase &&
            priorEntry.name === name &&
            priorEntry.value === value &&
            priorEntry.important === important &&
            priorEntry.shorthand === source?.shorthand &&
            priorEntry.order === order;
          if (!entries && !equal) entries = old ? old.entries.slice(0, index) : [];
          if (entries)
            entries.push(
              equal
                ? priorEntry
                : {
                    name,
                    important,
                    value,
                    order,
                    ...(propertyBase && { base: propertyBase }),
                    ...(source && { shorthand: source.shorthand }),
                  },
            );
        }
        if (!entries && old && index !== old.entries.length) entries = old.entries.slice(0, index);
        if (
          !entries &&
          old &&
          old.weight === weight &&
          old.outerDepth === depth &&
          old.hostContext === hostContext &&
          old.base === base &&
          old.proximity === proximity &&
          old.layerIndex === layerIndex
        ) {
          inputs.push(old);
        } else {
          inputs.push({
            weight,
            hostContext,
            base,
            proximity,
            layerIndex,
            entries: entries ?? old?.entries ?? [],
            ...(depth !== undefined && { outerDepth: depth }),
          });
        }
      }
      let sheetRegistrations: Map<string, RegisteredProperty> | undefined;
      let activeSlot: Raw.Element | undefined;
      function apply(
        sheet: Sheet,
        rules: Rule[],
        hostContext: boolean,
        scoped?: { root: Raw.ParentNode; proximity: number },
        parentSelection?: RuleSelection,
        layerIndex?: number,
        targetScope: Raw.ParentNode | undefined = scope,
      ): void {
        if (sheet.disabled) return;
        const { media, href, base } = sheetState(sheet);
        if (media && !mediaListState(media).matches((viewport ??= input.viewport()))) return;
        // Imports form an acyclic graph bounded by loadImports.
        for (const rule of hostContext || outerPart || scoped || parentSelection
          ? rules
          : candidates(rules, sheet)) {
          if (
            !hostContext &&
            !sheetRegistrations &&
            (rule.kind === "property" ||
              rule.kind === "scope" ||
              rule.kind === "container" ||
              rule.kind === "starting-style")
          ) {
            layerOrder(targetScope);
            sheetRegistrations = registrationsByScope?.get(targetScope);
          }
          if (rule.kind === "property" || rule.kind === "starting-style") continue;
          if (rule.kind === "media") {
            if (mediaListState(rule.view.media).matches((viewport ??= input.viewport())))
              apply(
                sheet,
                rule.rules,
                hostContext,
                scoped,
                parentSelection,
                layerIndex,
                targetScope,
              );
            continue;
          }
          if (rule.kind === "supports") {
            reusableEligible = false;
            if (rule.view.matches)
              apply(
                sheet,
                rule.rules,
                hostContext,
                scoped,
                parentSelection,
                layerIndex,
                targetScope,
              );
            continue;
          }
          if (rule.kind === "import") {
            reusableEligible = false;
            if (rule.imported) {
              let importedLayer = layerIndex;
              if (rule.view.layerName !== null) {
                collectLosers = true;
                importedLayer = layerOrder(targetScope).get(rule);
              }
              apply(
                rule.imported.sheet,
                rule.imported.rules,
                hostContext,
                scoped,
                parentSelection,
                importedLayer,
                targetScope,
              );
            }
            continue;
          }
          if (rule.kind === "layer-block") {
            reusableEligible = false;
            collectLosers = true;
            apply(
              sheet,
              rule.rules,
              hostContext,
              scoped,
              parentSelection,
              layerOrder(targetScope).get(rule),
              targetScope,
            );
            continue;
          }
          if (rule.kind === "scope") {
            reusableEligible = false;
            const boundaries = scopeBoundaries(rule, sheet, parentSelection);
            if (!boundaries) continue;
            const { root: rootSelectors, limit: limitSelectors } = boundaries;
            const ownerParent = sheetState(sheet).owner?.parentNode;
            const implicitRoot =
              ownerParent && tree.isElementNode(ownerParent)
                ? ownerParent
                : (scope ?? input.document);
            const path: Raw.Element[] = [];
            for (
              let candidate: Raw.ParentNode | null = element;
              candidate;
              candidate = tree.isElementNode(candidate) ? candidate.parentNode : null
            ) {
              const root = candidate;
              const isRoot = rootSelectors
                ? tree.isElementNode(root) &&
                  rootSelectors.entries.some(({ match }) => match(root, scoped?.root))
                : root === (scoped?.root ?? implicitRoot);
              if (isRoot) {
                const limited =
                  limitSelectors &&
                  path.some((node) =>
                    limitSelectors.entries.some(({ match }) => match(node, root)),
                  );
                // Different roots can make different :scope selectors match.
                if (!limited)
                  apply(
                    sheet,
                    rule.rules,
                    hostContext,
                    { root, proximity: path.length },
                    scopeSelection(root),
                    layerIndex,
                    targetScope,
                  );
              }
              if (candidate === scoped?.root) break;
              if (tree.isElementNode(candidate)) path.push(candidate);
            }
            continue;
          }
          if (
            rule.kind === "layer-statement" ||
            rule.kind === "namespace" ||
            rule.kind === "view-transition" ||
            rule.kind === "counter-style" ||
            rule.kind === "font-face" ||
            rule.kind === "function" ||
            rule.kind === "font-feature-values" ||
            rule.kind === "position-try" ||
            rule.kind === "margin" ||
            rule.kind === "page" ||
            rule.kind === "keyframe" ||
            rule.kind === "keyframes" ||
            rule.kind === "container"
          )
            continue;
          const selection =
            rule.kind === "style" ? styleSelection(rule, parentSelection) : undefined;
          const selectors =
            rule.kind === "nested-declarations"
              ? (parentSelection?.entries ?? [])
              : rule.kind === "declaration"
                ? rule.selectors
                : (selection?.entries ?? []);
          let score = -1;
          for (const entry of selectors) {
            if (entry.part) {
              if (hostContext || entry.part.local === !!outerPart) continue;
              const host = outerPart?.host ?? (scope && input.shadowHost(scope));
              if (!host || !entry.part.origin(host)) continue;
              const names =
                outerPart?.names ??
                new Set(
                  (
                    element.attrs.find((attr) => !attr.namespace && attr.name === "part")?.value ??
                    ""
                  ).split(/[\t\n\f\r ]+/),
                );
              if (!entry.part.names.every((name) => names.has(name))) continue;
              reusableEligible = false;
            } else if (outerPart) continue;
            const { specificity, hostOnly, subjectKey, subjectType } = entry;
            const match = activePseudo
              ? entry.pseudo &&
                (entry.pseudo.text === activePseudo || entry.pseudo.text === pseudoFamily)
                ? entry.pseudo.match
                : neverMatchesElement
              : entry.match;
            if (
              match === neverMatchesElement ||
              hostOnly !== hostContext ||
              (entry.slot ? !activeSlot || !entry.slot(activeSlot, scoped?.root) : !!activeSlot) ||
              (subjectType !== undefined &&
                subjectType !== (subjectTypeName ??= elementLocalName(element).toLowerCase())) ||
              (subjectKey !== undefined && !elementSubjectKeys().has(subjectKey))
            )
              continue;
            // A stateful selector can only affect this frame if its subject is a candidate.
            if (reusableEligible) {
              if (!selection) reusableEligible = false;
              else if (!(selection.treeDependent ??= queryDependsOnlyOnTree(selection.text))) {
                if ((selection.focusDependent ??= queryDependsOnTreeOrFocus(selection.text))) {
                  const revision = input.focusRevision();
                  reusableEligible = focusRevision === undefined || focusRevision === revision;
                  focusRevision = revision;
                } else reusableEligible = false;
              }
            }
            if (match(element, scoped?.root)) score = Math.max(score, specificity);
          }
          if (score >= 0) {
            const immutable = privateSheet(sheet);
            const style =
              immutable && rule instanceof ruleInterfaces.PrivateStyleRule
                ? rule.cascadeDeclaration()
                : ruleDeclaration(rule.view);
            take(style, score, hostContext, base ?? href, scoped?.proximity, layerIndex, immutable);
          }
          if (rule.kind === "style" && rule.rules.length) {
            reusableEligible = false;
            apply(sheet, rule.rules, hostContext, scoped, selection, layerIndex, targetScope);
          }
        }
      }
      function applyScope(target: Raw.ParentNode | undefined, hostContext: boolean): void {
        const records = sheetsIn(target);
        // CSS-in-JS frequently distributes rules across separate style elements.
        // Only private, individually anchored sheets can be omitted; unindexed
        // groups keep their exact place in document order.
        const index =
          !activePseudo && !hostContext && !outerPart && !didAdoptStylesheets
            ? cascadeSubjectIndex(
                records,
                cascadeSheetIndexes,
                exposedStylesheets ? privateSheetRule : sheetSubjects,
              )
            : undefined;
        for (const record of index ? indexedSubjects(index, elementSubjectKeys()) : records)
          apply(record.sheet, record.rules, hostContext, undefined, undefined, undefined, target);
        const adoptedSheets = adopted.get(target ?? input.document)?.values;
        if (adoptedSheets) {
          for (const sheet of adoptedSheets)
            apply(
              sheet,
              sheetState(sheet).rules,
              hostContext,
              undefined,
              undefined,
              undefined,
              target,
            );
        }
      }
      applyScope(scope, false);
      const exposed =
        scope &&
        input.shadowHost(scope) &&
        element.attrs.find((attr) => !attr.namespace && attr.name === "part")?.value;
      if (exposed && scope) {
        let host = input.shadowHost(scope);
        let names = new Set(exposed.split(/[\t\n\f\r ]+/).filter(Boolean));
        let depth = 0;
        while (host && names.size) {
          const outer = input.styleScope(host);
          if (!outer) break;
          outerPart = { host, names, depth: ++depth };
          applyScope(outer, false);
          const forwarded = new Set<string>();
          for (const mapping of (
            host.attrs.find((attr) => !attr.namespace && attr.name === "exportparts")?.value ?? ""
          ).split(",")) {
            const match =
              /^[\t\n\f\r ]*([^\t\n\f\r :,]+)[\t\n\f\r ]*(?::[\t\n\f\r ]*([^\t\n\f\r :,]+)[\t\n\f\r ]*)?$/.exec(
                mapping,
              );
            if (match && names.has(match[1]!)) forwarded.add(match[2] ?? match[1]!);
          }
          names = forwarded;
          host = input.shadowHost(outer);
        }
        outerPart = undefined;
      }
      const shadow = input.shadowRoot(element);
      if (shadow) applyScope(shadow, true);
      const parent = element.parentNode;
      const slotRoot = parent && tree.isElementNode(parent) && input.shadowRoot(parent);
      if (slotRoot) {
        activeSlot = input.assignedSlot(element);
        while (activeSlot) {
          reusableEligible = false;
          applyScope(input.styleScope(activeSlot), true);
          activeSlot = input.assignedSlot(activeSlot);
        }
      }
      if (!activePseudo) {
        const inline = inlineStyles?.get(element)?.style;
        if (inline) take(inline, 2 ** 52);
        else if (
          element.attrs.some((attr) => !attr.namespace && attr.name === "style" && attr.value)
        )
          take(inlineStyle(element), 2 ** 52);
      }
      if (
        previous &&
        !sheetRegistrations &&
        sameContext &&
        previous.inputs &&
        previous.inputs.length === inputs.length &&
        inputs.every((source, index) => source === previous.inputs?.[index]) &&
        sameEnvironment(previous)
      ) {
        prioritizeAncestor(previous);
        certify(previous);
        if (role === "target") return computedFrameView(previous);
        result = previous.style;
        if (displays) displays.set(element, result?._values.get("display") === "none");
        frame = previous;
        fontSize = previous.fontSize;
        rootFontSize = previous.rootFontSize;
        color = previous.color;
        continue;
      }
      {
        // Winner resolution has its own lexical context; cache hits never allocate it.
        const winners = new Map<string, Winner>();
        let hasVariableShorthand = false;
        let usesSubstitution = false;
        let environmentSubstitution = false;

        // Cached frames return above without allocating winner-expansion closures.
        const consider = (name: string, candidate: Winner): void => {
          const previous = winners.get(name);
          if (previous && outranks(previous, candidate)) {
            if (collectLosers) {
              candidate.previous = previous.previous;
              previous.previous = candidate;
              hasHistory = true;
            }
            return;
          }
          if (previous) {
            candidate.previous = previous;
            hasHistory = true;
          }
          winners.set(name, candidate);
        };
        const expand = (source: CascadeInput): void => {
          const { weight, hostContext, base, proximity, layerIndex } = source;
          const block = ++borderColorBlock;
          const inline = weight === 2 ** 52;
          const unmodifiedLayer = inline ? Infinity : layerIndex;
          const importantLayer = inline
            ? Infinity
            : layerIndex === undefined
              ? undefined
              : -layerIndex;
          for (const {
            name,
            important,
            value,
            order,
            shorthand,
            base: propertyBase,
          } of source.entries) {
            // Normal declarations prefer the outer scope. Important declarations prefer the inner scope.
            const offset =
              source.outerDepth && source.outerDepth > 0
                ? source.outerDepth / (2 * (source.outerDepth + 1))
                : 0;
            const context = important
              ? hostContext
                ? source.outerDepth === -1
                  ? 2.75
                  : 3
                : 2 - offset
              : hostContext
                ? source.outerDepth === -1
                  ? 0.25
                  : 0
                : 1 + offset;
            if (value.length === 11 && value.toLowerCase() === "revert-rule") continue;
            if (
              (value.length === 6 || value.length === 12) &&
              /^(?:revert|revert-layer)$/i.test(value)
            )
              hasRollback = true;

            if (!environmentSubstitution) {
              const evaluated =
                contextualLonghand.test(name) ||
                (value.includes("(") && usesTypedValueGrammar(name, value));
              environmentSubstitution =
                (evaluated && !dependsOnWinnersOnly(value)) ||
                (name.startsWith("--") && /\)var\(/i.test(value)) ||
                ((name === "container-type" || name === "container") &&
                  /(?:^|[ /])(?:inline-)?size(?:$| )/.test(value)) ||
                (value.includes("(") && substitutionFunction.test(value)) ||
                (!name.startsWith("--") && elementDimension.test(value));
              usesSubstitution ||= evaluated || environmentSubstitution;
            }
            const winner: Winner = {
              context,
              weight,
              proximity,
              value,
              base: propertyBase ?? base,
            };
            const layer = important ? importantLayer : layerIndex;
            if (layer !== undefined) winner.layer = layer;
            if (unmodifiedLayer !== undefined) winner.layerIndex = unmodifiedLayer;
            if (order !== undefined) {
              winner.block = block;
              winner.order = order;
            }
            if (shorthand) {
              hasVariableShorthand = true;
              consider(name, { ...winner, block, shorthand });
              continue;
            }
            const colorPair = logicalBorderColorShorthands.get(name);
            if (colorPair) {
              const deferred = variableSyntax.test(value);
              const colors = deferred ? [value, value] : splitLogicalBorderColors(name, value);
              if (!colors) continue;
              for (const [edge, longhand] of colorPair.entries()) {
                const color = colors[edge];
                if (color !== undefined) {
                  consider(longhand, {
                    ...winner,
                    value: color,
                    ...(deferred ? { shorthand: name } : {}),
                  });
                }
              }
              continue;
            }
            const longhands = deferredShorthandLonghands.get(name);
            if (longhands && /var\(/i.test(value)) {
              hasVariableShorthand = true;
              for (const longhand of longhands) {
                consider(longhand, { ...winner, block, shorthand: name });
              }
              continue;
            }
            if (name === "background-position") {
              const position = splitBackgroundPosition(value);
              if (position) {
                for (const [axis, property] of backgroundPositionAxes.entries()) {
                  const value = position[axis];
                  if (value !== undefined) consider(property, { ...winner, value });
                }
                continue;
              }
            }
            // cssstyle enumerates these shorthands as well as their expanded longhands.
            if (
              name === "flex" ||
              borderShorthands.has(name) ||
              boxShorthands.has(name) ||
              ((name === "font" || name === "background") && !variableSyntax.test(value))
            )
              continue;
            consider(name, winner);
          }
        };
        if (activePseudo === "::before" || activePseudo === "::after")
          winners.set("content", { context: -1, weight: 0, value: "none" });
        if (userAgentFocus) {
          winners.set("outline-style", { context: -1, weight: 0, value: "auto" });
          winners.set("outline-color", { context: -1, weight: 0, value: "auto" });
        }
        if (isHTML && uaIsolates.has(tag))
          winners.set("unicode-bidi", { context: -1, weight: 0, value: "isolate" });
        if (isHTML && uaBlockMargins.has(tag)) {
          for (const side of ["block-start", "block-end"])
            winners.set("margin-" + side, { context: -1, weight: 0, value: "1em" });
        }
        if (userAgentColor) winners.set("color", { context: -1, weight: 0, value: userAgentColor });
        if (isHTML && tag === "mark") {
          winners.set("background-color", { context: -1, weight: 0, value: "rgb(255, 255, 0)" });
          winners.set("color", { context: -1, weight: 0, value: "black" });
        }
        if (button || field) {
          winners.set("background-color", {
            context: -1,
            weight: 0,
            value: button ? "ButtonFace" : "Field",
          });
          if (button)
            for (const side of ["top", "right", "bottom", "left"])
              winners.set(`border-${side}-color`, {
                context: -1,
                weight: 0,
                value: "ButtonBorder",
              });
        }
        if (userAgentDirection !== undefined)
          winners.set("direction", { context: -1, weight: 0, value: userAgentDirection });
        if (userAgentDisplay !== undefined)
          winners.set("display", {
            context: hiddenInput ? Infinity : -1,
            weight: 0,
            value: userAgentDisplay,
          });
        if (userAgentContentVisibility !== undefined)
          winners.set("content-visibility", {
            context: -1,
            weight: 0,
            value: userAgentContentVisibility,
          });
        const block = themeEntries && themeBlocks.get(themeEntries);
        // Only a single contribution may own each projected name. Its first name
        // marks the original insertion position while ordinary winners are resolved.
        const theme =
          block &&
          !inputs.some(
            (source) =>
              source.entries !== themeEntries &&
              source.entries.some((entry) => block.values.has(entry.name)),
          )
            ? block
            : undefined;
        const marker = theme?.names[0];
        for (const source of inputs) {
          if (theme && marker && source.entries === themeEntries) {
            winners.set(marker, { context: 0, weight: 0, value: "" });
          } else expand(source);
        }
        // Flat styles avoid allocating rollback exclusions or scanning untouched UA winners.
        if (hasRollback) {
          for (const [name, winner] of winners) {
            let current: Winner | undefined = winner;
            const excluded: Winner[] = [];
            // Each rollback excludes at least its own declaration from this finite candidate chain.
            while (current && /^(?:revert|revert-layer)$/i.test(current.value)) {
              excluded.push(current);
              let best: Winner | undefined;
              for (
                let candidate: Winner | undefined = winner;
                candidate;
                candidate = candidate.previous
              ) {
                const blocked = excluded.some((rollback) => {
                  if (rollback.value.toLowerCase() === "revert") return candidate.context >= 0;
                  if (candidate.context < 0) return false;
                  const sameContext =
                    (candidate.context === 0 || candidate.context === 3) ===
                    (rollback.context === 0 || rollback.context === 3);
                  if (!sameContext) return false;
                  if (rollback.layerIndex === Infinity) return candidate.layerIndex === Infinity;
                  // Important rollback removes the current layer and every normal/important
                  // declaration between its two levels in the cascade, including inline normals.
                  return (candidate.layerIndex ?? Infinity) >= (rollback.layerIndex ?? Infinity);
                });
                if (!blocked && (!best || outranks(candidate, best))) best = candidate;
              }
              current = best;
            }
            if (!current) winners.delete(name);
            else {
              if (current.previous) current.previous = undefined;
              if (current !== winner) winners.set(name, current);
            }
          }
        } else if (hasHistory) {
          for (const winner of winners.values()) if (winner.previous) winner.previous = undefined;
        }
        const registrations =
          sheetRegistrations && scriptRegistrations
            ? new Map([...sheetRegistrations, ...scriptRegistrations])
            : (scriptRegistrations ?? sheetRegistrations);
        if (registrations)
          for (const [name, registration] of registrations) {
            const current = winners.get(name);
            if (
              current?.value === "initial" ||
              ((!current || current.value === "unset") &&
                (!registration.inherits || !prior?.getPropertyValue(name)))
            ) {
              if (registration.initialValue !== undefined)
                winners.set(name, { context: -1, weight: 0, value: registration.initialValue });
              else winners.delete(name);
            }
          }
        const substitutionValues =
          usesSubstitution ||
          hasVariableShorthand ||
          (parentFrame?.substitution && !parentFrame.staticSubstitution) ||
          registrations?.size
            ? new Map([...winners].map(([name, winner]) => [name, winner.value]))
            : undefined;
        const computedWinners: Map<string, ComputedWinner> = winners;
        let custom: CustomProjection | undefined;
        const parentProjection = prior && partialAncestors?.get(prior);
        let materializedParent = false;
        if (parentProjection) {
          // A new substitution chain copies every parent value, including non-inherited ones.
          materializedParent = !!(
            parentProjection.target &&
            substitutionValues &&
            !parentFrame?.substitution
          );
          for (const [name, winner] of winners) {
            if (materializedParent) break;
            materializedParent = !inherited.has(name) && winner.value.toLowerCase() === "inherit";
          }
          if (materializedParent) prior = parentProjection.complete();
        }
        const projected = prior && inheritedCustomBlocks?.get(prior);
        if (prior) {
          let shared = theme || registrations ? undefined : shareableCustomBlock(prior);
          if (shared) {
            for (const name of winners.keys()) {
              if (shared.values.has(name)) {
                shared = undefined;
                break;
              }
            }
          }
          const placements = shared && new Array<CustomPlacement>();
          let customEnd = 0;
          let placedEnd = 0;
          function inheritName(name: string, tokens?: string): void {
            if (theme?.values.has(name)) return;
            const winner = winners.get(name);
            const value = winner?.value;
            const isCustom = name.startsWith("--");
            if (isCustom && registrations?.get(name)?.inherits === false && value !== "inherit")
              return;
            if (isCustom && !winner) {
              if (shared && !projected && shared.values.has(name)) {
                customEnd++;
                return;
              }
              if (tokens && !variableSyntax.test(tokens)) {
                if (placements && customEnd !== placedEnd) {
                  placements.push({ before: name, end: customEnd });
                  placedEnd = customEnd;
                }
                computedWinners.set(name, tokens);
                return;
              }
            }
            if (
              value === "inherit" ||
              (isCustom && value === "unset") ||
              (value === undefined && (inherited.has(name) || isCustom))
            ) {
              if (placements && !winner && customEnd !== placedEnd) {
                placements.push({ before: name, end: customEnd });
                placedEnd = customEnd;
              }
              winners.set(name, {
                ...(winner ?? { context: 0, weight: 0 }),
                value: tokens ?? prior?.getPropertyValue(name) ?? "",
              });
            }
          }
          let groupIndex = 0;
          const names = projected?.block.names;
          // Projected indices address the ordinary declaration. A complete block
          // with no local overrides can cross an ancestor without visiting its tokens.
          for (let index = 0; index <= prior._length; index++) {
            let group = projected?.groups[groupIndex];
            // Groups may share an offset when the ordinary separator computes to no entry.
            while (group?.offset === index && names) {
              if (!shared && projected.block !== theme) {
                for (let token = customEnd; token < group.end; token++) {
                  const name = names[token];
                  if (name !== undefined) inheritName(name, projected.block.values.get(name));
                }
              }
              customEnd = group.end;
              group = projected?.groups[++groupIndex];
            }
            const name = prior[index];
            if (name !== undefined)
              inheritName(name, name.startsWith("--") ? prior._values.get(name) : undefined);
          }
          if (shared && placements) {
            if (customEnd !== placedEnd) placements.push({ before: undefined, end: customEnd });
            custom = { block: shared, placements };
          }
        }
        if (theme && marker) {
          let found = false;
          let before: string | undefined;
          for (const name of winners.keys()) {
            if (found) {
              before = name;
              break;
            }
            found = name === marker;
          }
          winners.delete(marker);
          custom = { block: theme, placements: [{ before, end: theme.names.length }] };
        }
        custom ??= packCustomWinners(computedWinners);
        if (
          previous &&
          sameContext &&
          sameCustomProjection(previous.custom, custom) &&
          sameWinners(previous.winners, computedWinners) &&
          sameEnvironment(previous)
        ) {
          prioritizeAncestor(previous);
          certify(previous);
          if (role === "target") return computedFrameView(previous);
          result = previous.style;
          if (displays) displays.set(element, result?._values.get("display") === "none");
          frame = previous;
          fontSize = previous.fontSize;
          rootFontSize = previous.rootFontSize;
          color = previous.color;
          continue;
        }
        let substitution: SubstitutionFrame | undefined;
        if (substitutionValues) {
          const baseURL = elementBaseURL(element);
          let inheritedFrame = parentFrame?.substitution;
          if (
            !inheritedFrame &&
            prior &&
            element.parentNode &&
            tree.isElementNode(element.parentNode)
          ) {
            const inheritedValues = new Map(prior._values);
            inheritedValues.set("color", color);
            for (const [name, value] of projected?.block.values ?? [])
              inheritedValues.set(name, value);
            let root = element.parentNode;
            while (root.parentNode && tree.isElementNode(root.parentNode)) root = root.parentNode;
            const rootFrame =
              root === element.parentNode
                ? undefined
                : substitutionFrame(
                    root,
                    undefined,
                    new Map([["font-size", rootFontSize + "px"]]),
                    !!input.isXML,
                    baseURL,
                    registrations,
                  );
            inheritedFrame = substitutionFrame(
              element.parentNode,
              rootFrame,
              inheritedValues,
              !!input.isXML,
              baseURL,
              registrations,
            );
          }
          if (custom) {
            for (const [name, value] of custom.block.values)
              if (!substitutionValues.has(name)) substitutionValues.set(name, value);
          }
          let sheetBases: Map<string, string> | undefined;
          for (const [name, winner] of winners)
            if (winner.base) (sheetBases ??= new Map()).set(name, winner.base);
          substitution = substitutionFrame(
            element,
            inheritedFrame,
            substitutionValues,
            !!input.isXML,
            baseURL,
            registrations,
            inputs,
            hasVariableShorthand
              ? new Map(
                  [...winners].flatMap(([name, winner]) =>
                    winner.shorthand ? [[name, winner.shorthand] as const] : [],
                  ),
                )
              : undefined,
            sheetBases,
          );
        }
        const resolver = winningValueResolver(
          computedWinners,
          custom?.block,
          substitution,
          registrations,
        );
        const { resolveValue } = resolver;
        const specifiedScheme = winners.get("color-scheme")?.value;
        const scheme =
          specifiedScheme === undefined ? undefined : resolveValue("color-scheme", specifiedScheme);
        const colorScheme =
          scheme === undefined ||
          scheme === "unset" ||
          scheme === "inherit" ||
          scheme === "revert" ||
          scheme === "revert-layer"
            ? prior?.getPropertyValue("color-scheme") || "normal"
            : scheme === "initial"
              ? "normal"
              : scheme;
        if (!prior) color = systemColor("canvastext", colorScheme) ?? initialColor;
        const specifiedColor = winners.get("color")?.value;
        let resolvedColor =
          specifiedColor === undefined ? undefined : resolveValue("color", specifiedColor);
        const siblingColor =
          resolvedColor !== undefined && /sibling-(?:index|count)\(/i.test(resolvedColor);
        if (siblingColor && resolvedColor) {
          const siblings = element.parentNode?.childNodes.filter(tree.isElementNode) ?? [element];
          // Color syntax has already been validated and contains no string tokens.
          resolvedColor = resolvedColor.replace(
            /\bsibling-(index|count)\(\s*\)/gi,
            (_, kind: string) =>
              String(
                kind.toLowerCase() === "count" ? siblings.length : siblings.indexOf(element) + 1,
              ),
          );
        }
        const colorKeyword = resolvedColor?.toLowerCase();
        if (userAgentColor && (colorKeyword === "revert" || colorKeyword === "revert-layer"))
          color = resolveColor(userAgentColor, { currentColor: color, colorScheme });
        else if (substitution && specifiedColor && usesTypedValueGrammar("color", specifiedColor))
          color = substitution.read("color");
        else
          color = computedTextColor(
            resolvedColor,
            color,
            colorScheme,
            resolvedColor !== specifiedColor,
          );
        const specifiedFontSize = winners.get("font-size")?.value;
        const resolvedFontSize =
          specifiedFontSize === undefined
            ? undefined
            : resolveValue("font-size", specifiedFontSize);
        const computedFontSize = computeFontSize(
          resolvedFontSize,
          fontSize,
          rootFontSize,
          () => (viewport ??= input.viewport()),
        );
        if (computedFontSize !== undefined) fontSize = computedFontSize;
        if (element.parentNode?.nodeName === "#document") rootFontSize = fontSize;
        const layoutValue = (name: string, fallback: string) => {
          const declared = winners.get(name)?.value;
          if (declared === undefined) return fallback;
          const value = resolveValue(name, declared);
          if (value === "inherit") return prior?.getPropertyValue(name) || fallback;
          return value && !/^(?:initial|unset|revert(?:-layer)?)$/.test(value) ? value : fallback;
        };
        const display = layoutValue("display", userAgentDisplay ?? "inline");
        const rootBox = documentChild && !activePseudo;
        let transformedDisplay: string | undefined;
        if (display === "contents") {
          if (rootBox) transformedDisplay = "block";
        } else if (
          /^(?:inline(?:$|[- ])|table-(?:cell|caption|column|row|header|footer)|ruby(?:$|-))/.test(
            display,
          ) &&
          (rootBox ||
            parentFrame?.formattingContainer ||
            /^(?:absolute|fixed)$/.test(layoutValue("position", "static")) ||
            layoutValue("float", "none") !== "none")
        ) {
          const inside = display.replace(/^inline[- ]?/, "");
          transformedDisplay = /^(?:flex|grid|table|list-item)$/.test(inside) ? inside : "block";
        }
        const formattingContainer =
          /^(?:inline[- ])?(?:flex|grid)$/.test(display) ||
          (display === "contents" && !rootBox && parentFrame?.formattingContainer);
        const attributes = {
          transformedDisplay,
          prior,
          custom,
          projected: projected?.block,
          fontSize,
          rootFontSize,
          specifiedFontSize,
          computedFontSize,
          color,
          colorScheme,
          target: role === "target",
          userAgentDisplay,
          userAgentContentVisibility,
        };
        // An independent projection captures its parent values, so chains retain no parent.
        const independent =
          !materializedParent &&
          role === "ancestor" &&
          independentOfParent(computedWinners) &&
          canDeferValues(computedWinners, attributes, viewport, documentBase);
        // Keep at most one retained inheritance recipe along an ancestor chain.
        const partial =
          independent ||
          (!materializedParent &&
            role === "ancestor" &&
            hasVariableShorthand &&
            (!prior || !partialAncestors?.has(prior)) &&
            canDeferValues(computedWinners, attributes, viewport, documentBase));
        const resolved: FrameValues =
          !materializedParent &&
          role === "target" &&
          canDeferValues(computedWinners, attributes, viewport, documentBase)
            ? {
                deferred: deferComputedValues(
                  computedWinners,
                  attributes,
                  resolver,
                  viewport,
                  documentBase,
                ),
              }
            : {
                style: resolveDeclaration(
                  computedWinners,
                  attributes,
                  resolver,
                  () => (viewport ??= input.viewport()),
                  () => (documentBase ??= input.baseURL(input.ownerDocument(element))),
                  undefined,
                  independent ? "independent" : partial,
                ),
              };
        result = resolved.style;
        let characters = 0;
        for (const [name, winner] of computedWinners) {
          characters += name.length;
          characters +=
            typeof winner === "string"
              ? winner.length
              : winner.value.length + (winner.base?.length ?? 0) + (winner.shorthand?.length ?? 0);
        }
        let declarationCharacters = 0;
        if (result)
          for (const [name, value] of result._values)
            declarationCharacters += name.length + value.length;
        const retainedPriorBlock =
          (!result || partial) && projected?.block !== custom?.block ? projected?.block : undefined;
        // Captures retain the parent's declaration and its token block, not its matching inputs.
        characters += result
          ? declarationCharacters
          : (parentFrame?.declarationCharacters ?? 0) + (retainedPriorBlock?.characters ?? 0) * 2;
        let inputCharacters = 0,
          inputUnits = inputs.length;
        for (const source of inputs) {
          inputCharacters += source.base?.length ?? 0;
          inputUnits += source.entries.length;
          for (const entry of source.entries)
            inputCharacters += entry.name.length + entry.value.length;
        }
        let parentValues: Map<string, string> | undefined;
        let parentValueCharacters = 0;
        if (independent && prior) {
          parentValues = new Map();
          for (const [name, winner] of computedWinners) {
            if (typeof winner === "string" || (!inherited.has(name) && !name.startsWith("--")))
              continue;
            const value = prior.getPropertyValue(name);
            parentValues.set(name, value);
            parentValueCharacters += name.length + value.length;
          }
        }
        const parentUnits =
          (parentValues?.size ?? prior?._values.size ?? 0) +
          (retainedPriorBlock?.names.length ?? 0) * 2;
        const parentCharacters =
          (parentValues ? parentValueCharacters : (parentFrame?.declarationCharacters ?? 0)) +
          (retainedPriorBlock?.characters ?? 0) * 2;
        if (partial && result) {
          characters += parentCharacters;
          const captured = parentValues;
          // A later target can retain this private declaration after its original
          // frame is evicted. Charge the captured winners and parent to that target.
          registerAncestorProjection(
            result,
            computedWinners,
            independent
              ? {
                  ...attributes,
                  prior: captured && capturedParentValues(captured),
                }
              : attributes,
            resolver,
            viewport,
            documentBase,
            winners.size + parentUnits,
            characters - declarationCharacters,
            independent,
          );
        }
        const capturedProjection = !result && prior ? partialAncestors?.get(prior) : undefined;
        characters += capturedProjection?.characters ?? 0;
        const units =
          (capturedProjection?.units ?? 0) +
          (partial ? parentUnits : 0) +
          winners.size +
          (result?._values.size ??
            (prior?._values.size ?? 0) + (retainedPriorBlock?.names.length ?? 0) * 2);
        const retainInputs =
          units + inputUnits + (custom?.block.names.length ?? 0) * 2 <= 2048 &&
          characters + inputCharacters + (custom?.block.characters ?? 0) * 2 <= 32768;
        frame = {
          ...resolved,
          ...(formattingContainer && { formattingContainer: true as const }),
          ...(substitution && { substitution }),
          ...(substitution &&
            !environmentSubstitution &&
            !hasVariableShorthand &&
            !registrations?.size &&
            (!parentFrame?.substitution || parentFrame.staticSubstitution) && {
              staticSubstitution: true as const,
            }),
          ...(siblingColor ? { siblingColor } : {}),
          ...(registrations ? { registered: true } : {}),
          inputs: retainInputs ? inputs : undefined,
          userAgentDirection,
          ...(userAgentFocus ? { userAgentFocus: true as const } : {}),
          userAgentHiddenInput: hiddenInput,
          winners: computedWinners,
          parent: parentFrame && new WeakRef(parentFrame),
          documentChild,
          userAgentColor,
          userAgentDisplay,
          userAgentContentVisibility,
          fontSize,
          rootFontSize,
          color,
          viewport: viewport && { ...viewport },
          baseURL: documentBase,
          ...(custom && { custom }),
          declarationCharacters,
          units: units + (retainInputs ? inputUnits : 0),
          characters: characters + (retainInputs ? inputCharacters : 0),
        };
        certify(frame);
        if (!activePseudo) rememberComputedFrame(element, role, frame);
        if (frame.deferred && frameOrder.has(frame)) frame.deferred.retained = new WeakRef(frame);
        if (role === "target") return computedFrameView(frame);
        if (displays) displays.set(element, result?._values.get("display") === "none");
      }
    }
    if (result) {
      result._global = declarationGlobals;
      return computedView(result);
    }
    const computed = declaration();
    {
      if (isSerializedRGB(color)) computed._setProperty("color", color, "");
      else computed.setProperty("color", color);
    }
    return finishComputedStyle(computed);
  }

  return {
    closeComputed: () => views().closeComputed(),
    StyleSheet,
    css,
    CSSStyleSheet,
    CSSRule: ruleInterfaces.CSSRule,
    CSSRuleList: ruleInterfaces.CSSRuleList,
    CSSStyleRule: ruleInterfaces.CSSStyleRule,
    CSSNestedDeclarations: ruleInterfaces.CSSNestedDeclarations,
    CSSImportRule: ruleInterfaces.CSSImportRule,
    CSSMediaRule: ruleInterfaces.CSSMediaRule,
    CSSSupportsRule: ruleInterfaces.CSSSupportsRule,
    CSSContainerRule: ruleInterfaces.CSSContainerRule,
    CSSScopeRule: ruleInterfaces.CSSScopeRule,
    CSSGroupingRule: ruleInterfaces.CSSGroupingRule,
    CSSConditionRule: ruleInterfaces.CSSConditionRule,
    CSSFontFaceRule: ruleInterfaces.CSSFontFaceRule,
    CSSFontFeatureValuesRule: ruleInterfaces.CSSFontFeatureValuesRule,
    get CSSFontFaceDescriptors() {
      return descriptorRules().fontFaceDescriptors();
    },
    CSSViewTransitionRule: ruleInterfaces.CSSViewTransitionRule,
    CSSFunctionRule: ruleInterfaces.CSSFunctionRule,
    get CSSFunctionDeclarations() {
      return descriptorRules().functionInterfaces().CSSFunctionDeclarations;
    },
    get CSSFunctionDescriptors() {
      return descriptorRules().functionInterfaces().CSSFunctionDescriptors;
    },
    CSSPositionTryRule: ruleInterfaces.CSSPositionTryRule,
    get CSSPositionTryDescriptors() {
      return views().CSSPositionTryDescriptors;
    },
    CSSPropertyRule: ruleInterfaces.CSSPropertyRule,
    CSSNamespaceRule: ruleInterfaces.CSSNamespaceRule,
    CSSCounterStyleRule: ruleInterfaces.CSSCounterStyleRule,
    CSSKeyframesRule: ruleInterfaces.CSSKeyframesRule,
    CSSKeyframeRule: ruleInterfaces.CSSKeyframeRule,
    get CSSMarginDescriptors() {
      return descriptorRules().pageInterfaces().CSSMarginDescriptors;
    },
    get CSSPageDescriptors() {
      return descriptorRules().pageInterfaces().CSSPageDescriptors;
    },
    CSSMarginRule: ruleInterfaces.CSSMarginRule,
    CSSPageRule: ruleInterfaces.CSSPageRule,
    CSSLayerStatementRule: ruleInterfaces.CSSLayerStatementRule,
    CSSStartingStyleRule: ruleInterfaces.CSSStartingStyleRule,
    CSSLayerBlockRule: ruleInterfaces.CSSLayerBlockRule,
    get CSSStyleDeclaration() {
      return views().CSSStyleDeclaration;
    },
    get CSSStyleProperties() {
      return views().CSSStyleProperties;
    },
    MediaList,
    syncSheetMedia,
    invalidateSheetMembership,
    adopted: (root: Raw.ParentNode) => adoption(root).view,
    setAdopted,
    applySheet,
    applyInline,
    captureInlineBase: inlineStyle,
    exposeSheet,
    inlineStyle: publicInlineStyle,
    computedStyle,
    computedPseudoTarget,
    pseudoStyle(node: Raw.Element, root: Raw.ParentNode, pseudo: string) {
      return computeStyle(node, root, collect(root), undefined, undefined, pseudo);
    },
    liveView(
      node: Raw.Element,
      read: () => PublicDeclaration | undefined,
      pseudo: string | null | undefined,
      eligible: () => boolean,
    ) {
      if (pseudo !== undefined)
        return views().liveView(
          () => (eligible() ? read() : undefined),
          () => pseudo !== null && input.isConnected(node) && eligible(),
        );
      let frame: ComputedFrame | undefined;
      let snapshot: PublicDeclaration | undefined;
      return views().liveView(
        () => {
          if (!eligible()) return;
          if (snapshot && completedFrame(frame, node, input.styleRevision(input.document)))
            return snapshot;
          snapshot = read();
          frame = snapshot ? computedFrames.get(node)?.target : undefined;
          return snapshot;
        },
        () => input.isConnected(node) && eligible(),
      );
    },
    focusDisplayCheck,
    removeLinkedSheet(node: Raw.Element): void {
      if (sheets.delete(node)) linkedSheetChanged();
    },
    sheet: (node: Raw.Element) => sheets.get(node)?.sheet ?? null,
    StyleSheetList,
    list,
    initialize() {
      collect();
    },
  };
}
