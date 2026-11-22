// Owns Window-local DOM interfaces backed by the same tree that parse5 builds.
import { ownedString } from "./owned-string.js";
import {
  enqueueCustomReaction,
  invokeCustomReactions,
  discardCustomReactions,
} from "./custom-reactions.js";
import { initializeCustomStates, customStateValues } from "./custom-state.js";
import { createQueryIndex, queryCandidateHints, queryDependsOnlyOnTree } from "./query-index.js";
import {
  defaultTreeAdapter as tree,
  html,
  parse,
  Parser,
  serialize,
  serializeOuter,
  type DefaultTreeAdapterTypes as Raw,
  type ParserOptions,
  type TreeAdapter,
} from "parse5";
import {
  createOwnedElementAdapter,
  parseHTMLReplacement,
  parseOwnedHTMLFragment,
} from "./html-fragment.js";
import { indexedProperty } from "./collection-index.js";
import { createNodeRecords } from "./node-records.js";
import {
  compileInactiveTemplate,
  copyInactiveTemplate,
  firstPackedDescendantAttribute,
  packedLeafMatches,
  type ElementSequence,
  hasPackedTemplate,
  ownTemplateAttribute,
  mutableTemplateAttributes,
  packedLeafText,
} from "./private-template-copy.js";
import { createWrapperHandles } from "./wrapper-handles.js";
import { createStaticNodeListFactory } from "./static-node-list.js";
import { randomFillSync, randomUUID } from "node:crypto";
import {
  atob as decodeBase64,
  btoa as encodeBase64,
  Blob as NodeBlob,
  File as NodeFile,
} from "node:buffer";
import { types } from "node:util";
import { cpus } from "node:os";
import { performance as monotonicClock } from "node:perf_hooks";
import { markAsUncloneable } from "node:worker_threads";
import { blobResource, createBlobURLs } from "./blob-url.js";
import { createNavigatorPlugins } from "./navigator-plugins.js";
import { createXPath } from "./xpath.js";
import { createFileReader } from "./file-reader.js";
import { createFileLists } from "./file-list.js";
import {
  createXHR,
  isForbiddenRequestHeader,
  type XHRTransport,
  type SynchronousXHRTransport,
} from "./xhr.js";
import { compileSelector, hasClass, simpleSubjectAttribute } from "./selectors.js";
import { parseNativeInactiveHTML } from "./native-parser.js";
import { parseLiteralDocument } from "./inactive-parser.js";
import { firstStrongDirection } from "./text-direction.js";
import { parseDocumentURL } from "./document-url.js";
import {
  comparePoints,
  createRangeIndex,
  setRangePoints,
  type Point,
  type RangePoints,
} from "./range-index.js";
import {
  createTraversal,
  nodeFilterConstants,
  removeFromIterators,
  type IteratorFilter,
} from "./traversal.js";
import {
  createMutationObservers,
  mutationObserversActive,
  queueAfterObservers,
  queueMutation as queueObserverMutation,
  retainRemovedSubtree,
} from "./mutations.js";
import { createStorage, isStorage, StorageSubscription, type StorageAreas } from "./storage.js";
import {
  clearAdoptedStylesheets,
  createStyles,
  invalidateStyleSource,
  hasAdoptedStylesheets,
  parseMediaQuery,
  syncInlineStyle,
} from "./styles.js";
import { createMessageChannels } from "./message-channel.js";
import { createEventHandlers } from "./event-handlers.js";
import {
  checkedness,
  checkState,
  copyCheckState,
  inputType,
  normalizedInputType,
  isInput,
  updateDefaultCheckedness,
} from "./input-state.js";
import {
  floatingPrefix,
  formatInputDate,
  formatInputNumber,
  inputDateTimestamp,
  inputNumber,
  numericGrid,
  numericStepMismatch,
  sanitizeRange,
  stepNumericValue,
  supportsInputDate,
  supportsInputNumber,
} from "./input-numeric.js";
import { createEvents } from "./events.js";
import { createHistory } from "./history.js";
import {
  compileEventHandler,
  createScriptRealm,
  evaluateClassicScript,
  installHostGlobals,
  reportCallbackException,
  type ScriptMode,
} from "./script-realm.js";
import { createTextEncoding } from "./text-encoding.js";
import { createWindowTimers } from "./timers.js";
import {
  createXMLData,
  elementLocalName,
  rawElementPrefix,
  setRawElementPrefix,
  isXMLName,
  parseXML,
  parseXMLFragment,
  serializeXML,
  serializeXMLNode,
  xmlSpecial,
} from "./xml.js";

const construct = Reflect.construct;
const streamingRequests = new WeakSet<Request>();
const requestBlobs = new WeakMap<
  Request,
  ReturnType<ReturnType<typeof createBlobURLs>["resolve"]>
>();
const inertParsing = { scriptingEnabled: false };
const blankURL = new URL("about:blank");
const classicScriptTypes = new Set([
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
]);

function* descendants(root: Raw.ParentNode): Generator<Raw.ChildNode> {
  const pending = root.childNodes.toReversed();
  // Each acyclic tree edge is visited at most once.
  while (pending.length) {
    const node = pending.pop();
    if (!node) break;
    yield node;
    if (tree.isElementNode(node)) {
      for (let index = node.childNodes.length - 1; index >= 0; index--) {
        const child = node.childNodes[index];
        if (child) pending.push(child);
      }
    }
  }
}

// Module-owned kernels can warm across independent Windows without sharing any public realm objects.
function firstQueryDescendant({
  root,
  matches,
  skipPackedText,
}: {
  root: Raw.ParentNode;
  matches: (node: Raw.Element) => boolean;
  skipPackedText: boolean;
}): Raw.Element | undefined {
  const pending = root.childNodes.toReversed();
  // Each finite ordinary-tree edge is visited once; private matching cannot invoke author callbacks.
  while (pending.length) {
    const node = pending.pop();
    if (!node || !tree.isElementNode(node)) continue;
    if (matches(node)) return node;
    if (skipPackedText && packedLeafText(node) !== undefined) continue;
    for (let position = node.childNodes.length - 1; position >= 0; position--) {
      const child = node.childNodes[position];
      if (child) pending.push(child);
    }
  }
  return undefined;
}

function collectQueryDescendants<T>({
  root,
  matches,
  skipPackedText,
  wrap,
}: {
  root: Raw.ParentNode;
  matches: (node: Raw.Element) => boolean;
  skipPackedText: boolean;
  wrap: (node: Raw.Element) => T;
}): T[] {
  if (skipPackedText) return collectPackedQueryDescendants(root, matches, wrap);
  const result: T[] = [],
    pending = root.childNodes.toReversed();
  // Each finite ordinary-tree edge is visited once.
  while (pending.length) {
    const node = pending.pop();
    if (!node || !tree.isElementNode(node)) continue;
    if (matches(node)) result.push(wrap(node));
    for (let position = node.childNodes.length - 1; position >= 0; position--) {
      const child = node.childNodes[position];
      if (child) pending.push(child);
    }
  }
  return result;
}

function collectPackedQueryDescendants<T>(
  root: Raw.ParentNode,
  matches: (node: Raw.Element) => boolean,
  wrap: (node: Raw.Element) => T,
): T[] {
  const result: T[] = [];
  const parents: Raw.ChildNode[][] = [];
  const offsets: number[] = [];
  let children = root.childNodes;
  // Resume parent spans in tree order without copying a wide sibling list to the stack.
  for (let index = 0; ; index++) {
    if (index >= children.length) {
      const parent = parents.pop();
      const offset = offsets.pop();
      if (!parent || offset === undefined) break;
      children = parent;
      index = offset;
      continue;
    }
    const node = children[index];
    if (!node || !tree.isElementNode(node)) continue;
    if (matches(node)) result.push(wrap(node));
    if (packedLeafText(node) !== undefined) continue;
    const descendants = node.childNodes;
    const first = descendants[0];
    if (!first || (descendants.length === 1 && !tree.isElementNode(first))) continue;
    parents.push(children);
    offsets.push(index);
    children = descendants;
    index = -1;
  }
  return result;
}

function markScriptsInert(root: Raw.ParentNode): void {
  for (const node of descendants(root)) {
    if (
      tree.isElementNode(node) &&
      (node.namespaceURI === html.NS.HTML || node.namespaceURI === html.NS.SVG) &&
      (node.tagName === "script" || node.tagName.endsWith(":script"))
    ) {
      startedScripts.add(node);
    }
  }
}

function* optionMembers(root: Raw.Element): Generator<Raw.Element> {
  const pending = root.childNodes.toReversed().map((node) => ({ node, inGroup: false }));
  // Each entry represents a unique edge of the private, acyclic tree.
  while (pending.length) {
    const entry = pending.pop();
    if (!entry) break;
    const { node, inGroup } = entry;
    if (!tree.isElementNode(node)) continue;
    const name = node.namespaceURI === html.NS.HTML ? node.tagName : "";
    if (name === "option") {
      yield node;
      continue;
    }
    if (
      name === "select" ||
      name === "datalist" ||
      name === "hr" ||
      (inGroup && name === "optgroup")
    )
      continue;
    for (let index = node.childNodes.length - 1; index >= 0; index--) {
      const child = node.childNodes[index];
      if (child) pending.push({ node: child, inGroup: inGroup || name === "optgroup" });
    }
  }
}

type AttributeRecord = Raw.Element["attrs"][number];

function qualifiedAttributeName(attr: AttributeRecord): string {
  return attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name;
}

function nullableNamespace(value: string | null): string | null {
  return value == null ? null : String(value) || null;
}

function validElementName(name: string): boolean {
  return /^(?:[A-Za-z][^\0\t\n\f\r />]*|[:_\u0080-\u{10FFFF}][A-Za-z0-9-.:_\u0080-\u{10FFFF}]*)$/u.test(
    name,
  );
}

type LegacyXPathError = Error & { code: unknown };
type LegacyXPathException = {
  (code?: unknown, message?: string): LegacyXPathError;
  new (code?: unknown, message?: string): LegacyXPathError;
  INVALID_EXPRESSION_ERR: 51;
  TYPE_ERR: 52;
};

// Pinned jsdom exposes a callable factory that returns an ordinary Error.
const XPathException = Object.assign(
  function XPathException(code?: unknown, message?: string): LegacyXPathError {
    return Object.assign(new Error(message), { name: "XPathException", code });
  },
  { INVALID_EXPRESSION_ERR: 51, TYPE_ERR: 52 } as const,
) as LegacyXPathException;

function validAttributeName(name: string): boolean {
  return name.length > 0 && !/[\0\t\n\f\r /=>]/u.test(name);
}

function attribute(element: Raw.Element, name: string): string | null {
  return element.attrs.find((attr) => !attr.namespace && attr.name === name)?.value ?? null;
}

function reflectedLong(element: Raw.Element, name: string, fallback: number): number {
  const value = attribute(element, name);
  if (value === null) return fallback;
  const digits = /^[\t\n\f\r ]*([+-]?[0-9]+)/.exec(value)?.[1];
  const number = Number(digits);
  return number >= -0x80000000 && number <= 0x7fffffff ? number | 0 : fallback;
}

// HTML names that currently use the generic wrapper, including legacy elements.
const genericHTMLNames: ReadonlySet<string> = new Set(
  (
    "abbr acronym address article aside b basefont bdi bdo big caption " +
    "center cite code col colgroup data dd dfn dt em figcaption figure " +
    "footer header hgroup i kbd main mark marquee nav nobr " +
    "noembed noframes noscript plaintext rb rp rt rtc " +
    "ruby s samp search section small strike strong sub summary sup table tbody td th " +
    "thead tfoot time tr track tt u var wbr"
  ).split(" "),
);

interface OptionsCollection {
  selectedIndex: number;
  [index: number]: ElementHandle | null | undefined;
  length: number;
  item(index: number): ElementHandle | null;
  namedItem(name: string): ElementHandle | null;
  add(option: ElementHandle, before?: ElementHandle | number | null): void;
  remove(index: number): void;
  [Symbol.iterator](): IterableIterator<ElementHandle>;
}

// A structural view keeps declaration inference independent of private realm state.
interface ElementHandle {
  readonly localName: string;
  textContent: string | null;
}

type SocketTransport = Pick<
  InstanceType<typeof globalThis.WebSocket>,
  | "readyState"
  | "url"
  | "protocol"
  | "extensions"
  | "bufferedAmount"
  | "binaryType"
  | "send"
  | "close"
  | "addEventListener"
>;
type SocketTransportConstructor = new (
  url: string | URL,
  protocols?: string | string[],
) => SocketTransport;
type RealmSocketTarget = InstanceType<ReturnType<typeof createEvents>["EventTarget"]>;
type RealmSocketHandler<Kind extends "Event" | "MessageEvent" | "CloseEvent" = "Event"> = (
  event: InstanceType<ReturnType<typeof createEvents>[Kind]>,
) => unknown;
type SocketStates = {
  readonly CONNECTING: number;
  readonly OPEN: number;
  readonly CLOSING: number;
  readonly CLOSED: number;
};
type BrowserSocket = Omit<SocketTransport, "addEventListener"> &
  RealmSocketTarget &
  SocketStates & {
    onopen: RealmSocketHandler | null;
    onerror: RealmSocketHandler | null;
    onmessage: RealmSocketHandler<"MessageEvent"> | null;
    onclose: RealmSocketHandler<"CloseEvent"> | null;
  };
type SocketConstructor = {
  new (url: string | URL, protocols?: string | string[]): BrowserSocket;
} & SocketStates;

type WindowSettings = {
  jsdomCompatibility?: boolean;
  lastModifiedMs?: number | undefined;
  url?: string;
  referrer?: string;
  runScripts?: ScriptMode;
  reportScriptError?: (cause: unknown) => void;
  reportUnsupported?: (description: string) => void;
  pretendToBeVisual?: boolean;
  storageQuota?: number;
  reportInvalidImport?: (url: string, base: string, cause: Error) => void;
  emitConsole?: (method: string, args: unknown[]) => void;
  detachedDocument?: boolean;
  xhr?: XHRTransport;
  xhrSynchronously?: SynchronousXHRTransport;
  createWebSocket?: (context: {
    baseURL: () => string;
    origin: () => string;
    signal: AbortSignal;
    DOMException: typeof globalThis.DOMException;
  }) => SocketTransportConstructor;
  hasMarkupStyles?: boolean;
  hasMarkupFrames?: boolean;
  mayHaveMarkupRadios?: boolean;
  canKeepInitialDocumentNamesEmpty?: boolean;
  hasMarkupDetails?: boolean;
  frameParent?: object;
  frameElement?: object;
  frameTop?: unknown;
  inheritedOrigin?: string;
  inheritedBase?: string;
  frameDepth?: number;
  storageAreas?: () => StorageAreas;
  frameLoaded?: () => void;
  frameFailed?: (error: unknown) => void;
  reportXMLParsingError?: (cause: unknown) => void;
  frameClosed?: () => void;
  loadTextResource?: (input: {
    kind: "script" | "stylesheet" | "frame";
    url: string;
    referrer: string;
    element: object;
    signal: AbortSignal;
    onHTTPErrorResponse?: () => void;
    fallbackEncoding?: string;
    fallbackOrigin?: string;
    charset?: string;
  }) => Promise<{
    code: string;
    url: string;
    encoding?: string;
    document?: {
      isXML: boolean;
      contentType: string;
      encoding: string;
      lastModifiedMs?: number | undefined;
    };
  }>;
  reportResourceError?: (
    kind: "script" | "stylesheet" | "frame",
    url: string,
    cause: unknown,
  ) => void;
  reportStyleError?: (text: string, cause: SyntaxError) => void;
  encoding?: string;
  userAgent?: string;
  isXML?: boolean;
  contentType?: string;
  readCookie?: (url: string) => string;
  writeCookie?: (value: string, url: string) => void;
};

type WindowInput = WindowSettings & {
  markup: string;
  includeNodeLocations: boolean;
  beforeParse?: (window: ReturnType<typeof buildWindow>["window"]) => void;
};

let parserFormOwners: WeakMap<Raw.Element, Raw.Element> | undefined;
const parserAssociatedForms = new WeakSet<Raw.Element>();
const parserAssociationDocuments = new WeakSet<Raw.Document>();
const parserAssociatedTags = new Set([
  "button",
  "fieldset",
  "img",
  "input",
  "object",
  "output",
  "select",
  "textarea",
]);

const recordParserFormOwner: NonNullable<
  TreeAdapter<Raw.DefaultTreeAdapterMap>["onElementCreated"]
> = (node, { intendedParent, formElement, isInTemplate }) => {
  if (
    !formElement ||
    isInTemplate ||
    node.namespaceURI !== html.NS.HTML ||
    !parserAssociatedTags.has(node.tagName) ||
    (node.tagName !== "img" && attribute(node, "form") !== null)
  )
    return;
  const root = treeRoot(intendedParent);
  if (!isDocumentRecord(root) || treeRoot(formElement) !== root) return;
  for (let parent: Raw.Node | null = intendedParent; parent; parent = treeParent(parent, false)) {
    if (parent === formElement) return;
    if (
      tree.isElementNode(parent) &&
      parent.namespaceURI === html.NS.HTML &&
      parent.tagName === "form"
    )
      break;
  }
  (parserFormOwners ??= new WeakMap()).set(node, formElement);
  parserAssociatedForms.add(formElement);
  parserAssociationDocuments.add(root);
};

function parserFormOptions(
  markup: string,
  options: ParserOptions<Raw.DefaultTreeAdapterMap>,
  streaming = false,
): ParserOptions<Raw.DefaultTreeAdapterMap> {
  if (!streaming && !/<form[\t\n\f\r />]/i.test(markup)) return options;
  return {
    ...options,
    treeAdapter: { ...(options.treeAdapter ?? tree), onElementCreated: recordParserFormOwner },
  };
}

function parserFormOwner(node: Raw.Element): Raw.Element | null {
  const form = parserFormOwners?.get(node);
  return form && treeRoot(form) === treeRoot(node) ? form : null;
}

function createEmptyHTMLDocument(): Raw.Document {
  const document = tree.createDocument();
  tree.setDocumentMode(document, html.DOCUMENT_MODE.QUIRKS);
  const root = tree.createElement("html", html.NS.HTML, []);
  tree.appendChild(document, root);
  tree.appendChild(root, tree.createElement("head", html.NS.HTML, []));
  tree.appendChild(root, tree.createElement("body", html.NS.HTML, []));
  return document;
}

const parseTemplateLimit = 1024 * 1024;
const parseTemplateNodeLimit = 32768;
const parseTemplateEntries = 8;
const parseTemplateCharacterBudget = 4 * parseTemplateLimit;
const parseTemplateNodeBudget = 4 * parseTemplateNodeLimit;
type ParseTemplate = { markup: string; scriptingEnabled: boolean } & (
  | { kind: "pending" }
  | { kind: "rejected" }
  | {
      kind: "ready";
      recipe: ReturnType<typeof compileInactiveTemplate>;
      nodes: number;
      markupFeatures?: ReturnType<typeof inspectMarkup>;
      shadowSyntaxAbsent?: true;
    }
);
// A tiny bounded LRU avoids hashing the entire HTML source on every unique-input miss.
const parseTemplates: ParseTemplate[] = [];
let recentParseTemplate: ParseTemplate | undefined;
let parseTemplateCharacters = 0;
let parseTemplateNodes = 0;

function boundedParseTemplate(document: Raw.Document): number | undefined {
  const pending: Raw.Node[] = [document];
  let nodes = 0;
  // Both visited and queued nodes count against the fixed per-template capacity.
  while (pending.length) {
    const node = pending.pop();
    if (!node) break;
    nodes++;
    if ("childNodes" in node) {
      for (const child of node.childNodes) {
        if (nodes + pending.length >= parseTemplateNodeLimit) return;
        pending.push(child);
      }
      const content = templateContent(node);
      if (content) {
        if (nodes + pending.length >= parseTemplateNodeLimit) return;
        pending.push(content);
      }
    }
  }
  return nodes;
}

function retainParseTemplate(entry: ParseTemplate): void {
  const previousIndex = parseTemplates.findIndex(
    (previous) =>
      previous.markup === entry.markup && previous.scriptingEnabled === entry.scriptingEnabled,
  );
  if (previousIndex !== -1) removeParseTemplate(previousIndex);
  const nodes = entry.kind === "ready" ? entry.nodes : 0;
  // At most eight source keys/private trees exist, with aggregate character and node bounds.
  while (
    parseTemplates.length &&
    (parseTemplates.length >= parseTemplateEntries ||
      parseTemplateCharacters + entry.markup.length > parseTemplateCharacterBudget ||
      parseTemplateNodes + nodes > parseTemplateNodeBudget)
  )
    removeParseTemplate(0);
  parseTemplates.push(entry);
  parseTemplateCharacters += entry.markup.length;
  parseTemplateNodes += nodes;
  recentParseTemplate = entry;
}

function removeParseTemplate(index: number): void {
  const previous = parseTemplates[index];
  if (!previous) throw new Error("Expected a retained parse template");
  parseTemplates.splice(index, 1);
  parseTemplateCharacters -= previous.markup.length;
  if (previous.kind === "ready") parseTemplateNodes -= previous.nodes;
}

function parseInactiveHTML(
  markup: string,
  options: ParserOptions<Raw.DefaultTreeAdapterMap>,
  ready: Extract<ParseTemplate, { kind: "ready" }> | undefined,
): Raw.Document {
  const native = parseNativeInactiveHTML(markup, options);
  if (native) return native;
  // Only the default, location-free parser admits recipes. A matching recipe
  // already passed the form-owner adapter check on its original parse.
  if (
    ready &&
    !options.treeAdapter &&
    !options.sourceCodeLocationInfo &&
    ready.scriptingEnabled === (options.scriptingEnabled ?? true)
  )
    return copyInactiveTemplate(ready.recipe);
  const settings = parserFormOptions(markup, options);
  // Form ownership and source locations are attached during parsing and must be preserved.
  if (settings.treeAdapter || settings.sourceCodeLocationInfo || markup.length > parseTemplateLimit)
    return parseLiteralDocument(markup, settings, options.treeAdapter === undefined);
  const scriptingEnabled = settings.scriptingEnabled ?? true;
  let entry = recentParseTemplate;
  if (entry?.markup !== markup || entry.scriptingEnabled !== scriptingEnabled) {
    entry = parseTemplates.find(
      (previous) => previous.markup === markup && previous.scriptingEnabled === scriptingEnabled,
    );
  }
  if (!entry) {
    retainParseTemplate({ kind: "pending", markup, scriptingEnabled });
    return parseLiteralDocument(markup, settings);
  }
  if (entry !== recentParseTemplate) retainParseTemplate(entry);
  // Only repeated inputs acquire a private graph. No exposed document becomes a cache template.
  if (entry.kind === "rejected") return parseLiteralDocument(markup, settings);
  if (entry.kind === "pending") {
    const parsed = parseLiteralDocument(markup, settings);
    const nodes = boundedParseTemplate(parsed);
    if (nodes === undefined) {
      retainParseTemplate({ kind: "rejected", markup, scriptingEnabled });
      return parsed;
    }
    entry = {
      kind: "ready",
      markup,
      scriptingEnabled,
      recipe: compileInactiveTemplate(parsed, nodes),
      nodes,
    };
    retainParseTemplate(entry);
  }
  const copy = copyInactiveTemplate(entry.recipe);
  if (!isDocumentRecord(copy)) throw new Error("Expected a cloned HTML document");
  return copy;
}

// These conservative source checks describe immutable markup, independently of Window options.
function inspectMarkup(markup: string) {
  return {
    hasMarkupStyles: /<(?:style|link)[\t\n\f\r />]/i.test(markup),
    hasMarkupFrames: /<(?:iframe|frame)[\t\n\f\r />]/i.test(markup),
    hasNamedElements: /<(?:embed|form|iframe|image|img|object)[\t\n\f\r />]/i.test(markup),
    // Radio types can be entity-encoded; any ampersand retains the complete initialization scan.
    mayHaveMarkupRadios: /<input[\t\n\f\r />]/i.test(markup) && /radio|&/i.test(markup),
    hasMarkupDetails: /<details[\t\n\f\r />]/i.test(markup),
  };
}

/** Creates an HTML Window and a serializer for its live document. Script execution is opt-in.
 * @example createWindow("<p>Hello</p>").window.document.querySelector("p")
 */
export function createWindow(
  input: string | WindowInput,
): Omit<ReturnType<typeof buildWindow>, "parseMarkup" | "finishLoading" | "closeWindow"> {
  const options: WindowInput =
    typeof input === "string" ? { markup: input, includeNodeLocations: false } : input;
  // The public Window outlives parsing. Original HTML and parser callbacks may
  // otherwise remain reachable through the realm even after the document is emptied.
  const { markup, beforeParse, includeNodeLocations, ...settings } = options;
  const parserOptions = {
    scriptingEnabled: options.runScripts === "dangerously",
    sourceCodeLocationInfo: includeNodeLocations,
  };
  const recent = recentParseTemplate;
  const ready = recent?.kind === "ready" && recent.markup === markup ? recent : undefined;
  const needsLiveParser =
    options.isXML ||
    beforeParse !== undefined ||
    parserOptions.scriptingEnabled ||
    (!options.detachedDocument && !ready?.shadowSyntaxAbsent && /shadowrootmode/i.test(markup));
  let source: Raw.Document;
  if (needsLiveParser) source = tree.createDocument();
  else if (markup === "" && !includeNodeLocations) source = createEmptyHTMLDocument();
  else source = parseInactiveHTML(markup, parserOptions, ready);
  const latest = recentParseTemplate;
  const template = latest?.kind === "ready" && latest.markup === markup ? latest : undefined;
  // Detached parsing skips the shadow check and cannot establish absence for a browsing context.
  if (template && !needsLiveParser && !options.detachedDocument) template.shadowSyntaxAbsent = true;
  const features = template
    ? (template.markupFeatures ??= inspectMarkup(markup))
    : inspectMarkup(markup);
  const canKeepInitialDocumentNamesEmpty =
    !needsLiveParser &&
    !features.hasMarkupStyles &&
    !features.hasMarkupFrames &&
    options.loadTextResource === undefined &&
    options.frameParent === undefined &&
    !features.hasNamedElements;
  const { parseMarkup, finishLoading, closeWindow, ...realm } = buildWindow(source, {
    ...settings,
    hasMarkupStyles: features.hasMarkupStyles,
    hasMarkupFrames: features.hasMarkupFrames,
    canKeepInitialDocumentNamesEmpty,
    mayHaveMarkupRadios: features.mayHaveMarkupRadios,
    hasMarkupDetails: features.hasMarkupDetails,
  });
  if (needsLiveParser) {
    try {
      beforeParse?.(realm.window);
      parseMarkup(options.markup, parserOptions);
    } catch (error) {
      closeWindow();
      throw error;
    }
  } else finishLoading();
  return realm;
}

let fragmentDocument: ReturnType<typeof buildWindow>["window"]["document"] | undefined;

/** Parses an HTML fragment with a shared owner document and no browsing context. */
export function createDocumentFragment(
  markup: string,
): ReturnType<ReturnType<typeof buildWindow>["window"]["document"]["createDocumentFragment"]> {
  fragmentDocument ??= buildWindow(tree.createDocument(), { detachedDocument: true }).window
    .document;
  return fragmentDocument.createRange().createContextualFragment(markup);
}

type ChildRealm = { window: { document: object; close(): void } };
type FrameState = {
  realm: ChildRealm;
  svgOrigin?: string;
  signature: string;
  abort: AbortController | undefined;
  complete: () => void;
};

// A retained indexed getter follows its frame even after it moves to another Window.
// Only an observable index accessor owns the last closed realm. Keeping a frame
// element or its parent document alive alone must not pin that realm after removal.
// V8 keeps a dereferenced target alive for the rest of the job. The target
// therefore owns the state only while the raw frame is separately reachable.
type FrameIndexTarget = WeakMap<Raw.Element, FrameState>;
const frameIndexTargets = new WeakMap<Raw.Element, WeakRef<FrameIndexTarget>>();

function frameIndexGetter(node: Raw.Element, state: FrameState): () => ChildRealm["window"] {
  let target = frameIndexTargets.get(node)?.deref();
  if (!target) {
    target = new WeakMap();
    frameIndexTargets.set(node, new WeakRef(target));
  }
  target.set(node, state);
  const current = target;
  return () => {
    const value = current.get(node);
    if (!value) throw new Error("Expected a retained frame index to have a browsing context");
    return value.realm.window;
  };
}

// Browsing context lifetime starts on insertion. Its initial document needs public
// objects only when observed. Blank documents reserve their original load microtask.
type FrameLoadSlot = { run?: () => void };
class InitialFrameRealm implements ChildRealm {
  #realm: ChildRealm | undefined;
  #closed = false;
  #loaded = false;
  readonly #load: FrameLoadSlot | undefined;
  readonly #started = monotonicClock.now();
  readonly #subscription: StorageSubscription;

  constructor(
    private readonly input: WindowInput,
    kind: "blank" | "navigation",
    areas: StorageAreas,
  ) {
    const origin = input.inheritedOrigin ?? "null";
    if (kind === "blank") {
      this.#load = { run: () => this.#finishBlankLoad() };
      queueFrameLoad(this.#load);
    }
    this.#subscription = new StorageSubscription(areas, origin, (change) => {
      this.#materialize();
      // Materialization installs the Window's timer-backed storage event receiver.
      this.#subscription.notify(change);
    });
  }

  #finishBlankLoad(): void {
    if (this.#loaded) return;
    this.#loaded = true;
    this.input.frameLoaded?.();
  }

  #materialize(): ChildRealm {
    if (!this.#realm) {
      const load = this.#load;
      const settings = load
        ? {
            ...this.input,
            hasMarkupStyles: false,
            hasMarkupFrames: false,
            mayHaveMarkupRadios: false,
            hasMarkupDetails: false,
            frameLoaded: () => this.#finishBlankLoad(),
          }
        : this.input;
      const realm = buildWindow(
        load ? createEmptyHTMLDocument() : tree.createDocument(),
        settings,
        this.#started,
        this.#subscription,
      );
      this.#realm = realm;
      if (load) {
        realm.finishLoading(undefined, load);
        // A first read from the embedding element's load listener must already
        // see a complete document. The embedding load was delivered exactly once.
        if (this.#loaded) {
          const advance = load.run;
          delete load.run;
          advance?.();
        }
      }
      if (this.#closed) realm.window.close();
    }
    return this.#realm;
  }

  get window(): ChildRealm["window"] {
    return this.#materialize().window;
  }

  get existingWindow(): ChildRealm["window"] | undefined {
    return this.#realm?.window;
  }

  close(): void {
    this.#closed = true;
    if (this.#load) delete this.#load.run;
    if (this.#realm) this.#realm.window.close();
    else this.#subscription.close();
  }
}

function closeFrameRealm(realm: ChildRealm): void {
  if (realm instanceof InitialFrameRealm) realm.close();
  else realm.window.close();
}

function createChildWindow(input: WindowInput): ChildRealm {
  if (
    input.markup === "" &&
    !input.isXML &&
    !input.includeNodeLocations &&
    input.beforeParse === undefined &&
    input.runScripts !== "dangerously"
  ) {
    const realm = buildWindow(createEmptyHTMLDocument(), {
      ...input,
      hasMarkupStyles: false,
      hasMarkupFrames: false,
      mayHaveMarkupRadios: false,
      hasMarkupDetails: false,
    });
    realm.finishLoading();
    return realm;
  }
  return createWindow(input);
}

type RectCoordinates = { x: number; y: number; width: number; height: number };
const svgNumberSyntax = String.raw`([+-]?(?:\d*\.)?\d+(?:[eE][+-]?\d+)?)`;
const viewBoxSyntax = new RegExp(
  String.raw`^[\t\n\r ]*` +
    Array<string>(4)
      .fill(svgNumberSyntax)
      .join(String.raw`(?:[\t\n\r ]*,[\t\n\r ]*|[\t\n\r ]+)`) +
    String.raw`[\t\n\r ]*$`,
);
const aspectAlignments = [
  "",
  "none",
  "xMinYMin",
  "xMidYMin",
  "xMaxYMin",
  "xMinYMid",
  "xMidYMid",
  "xMaxYMid",
  "xMinYMax",
  "xMidYMax",
  "xMaxYMax",
];
const aspectModes = ["", "meet", "slice"];
const aspectRatioDescriptors: PropertyDescriptorMap = {
  SVG_PRESERVEASPECTRATIO_UNKNOWN: { value: 0, enumerable: true },
  SVG_PRESERVEASPECTRATIO_NONE: { value: 1, enumerable: true },
  SVG_PRESERVEASPECTRATIO_XMINYMIN: { value: 2, enumerable: true },
  SVG_PRESERVEASPECTRATIO_XMIDYMIN: { value: 3, enumerable: true },
  SVG_PRESERVEASPECTRATIO_XMAXYMIN: { value: 4, enumerable: true },
  SVG_PRESERVEASPECTRATIO_XMINYMID: { value: 5, enumerable: true },
  SVG_PRESERVEASPECTRATIO_XMIDYMID: { value: 6, enumerable: true },
  SVG_PRESERVEASPECTRATIO_XMAXYMID: { value: 7, enumerable: true },
  SVG_PRESERVEASPECTRATIO_XMINYMAX: { value: 8, enumerable: true },
  SVG_PRESERVEASPECTRATIO_XMIDYMAX: { value: 9, enumerable: true },
  SVG_PRESERVEASPECTRATIO_XMAXYMAX: { value: 10, enumerable: true },
  SVG_MEETORSLICE_UNKNOWN: { value: 0, enumerable: true },
  SVG_MEETORSLICE_MEET: { value: 1, enumerable: true },
  SVG_MEETORSLICE_SLICE: { value: 2, enumerable: true },
};
const zeroSVGRect: Readonly<RectCoordinates> = { x: 0, y: 0, width: 0, height: 0 };

function parseViewBox(value: string | null): Readonly<RectCoordinates> {
  const match = value === null ? null : viewBoxSyntax.exec(value);
  if (!match || match[0] !== value) return zeroSVGRect;
  const x = Number(match[1]);
  const y = Number(match[2]);
  const width = Number(match[3]);
  const height = Number(match[4]);
  if (![x, y, width, height].every(Number.isFinite) || width < 0 || height < 0) return zeroSVGRect;
  return { x, y, width, height };
}
const rectangles = new WeakMap<object, RectCoordinates>();

function rectCoordinates(rect: object): RectCoordinates {
  const coordinates = rectangles.get(rect);
  if (!coordinates) throw new TypeError("Expected a DOMRectReadOnly");
  return coordinates;
}

function rectDictionary(other?: Partial<RectCoordinates> | null): RectCoordinates {
  if (other == null) return { height: 0, width: 0, x: 0, y: 0 };
  if (typeof other !== "object" && typeof other !== "function")
    throw new TypeError("Expected a DOMRectInit dictionary");
  // Web IDL reads dictionary members in lexicographic order.
  return {
    height: +(other.height ?? 0),
    width: +(other.width ?? 0),
    x: +(other.x ?? 0),
    y: +(other.y ?? 0),
  };
}

type ContentMode = "clone" | "extract" | "delete";
const rangeEditors = new WeakMap<
  symbol,
  (
    points: RangePoints,
    mode: ContentMode,
    Exception: typeof DOMException,
  ) => Raw.DocumentFragment | null
>();
const rangeInserters = new WeakMap<
  symbol,
  (points: RangePoints, node: object, Exception: typeof DOMException) => void
>();
const rangePoints = new WeakMap<object, RangePoints>();
const rangeIndexes = new WeakMap<symbol, ReturnType<typeof createRangeIndex>>();
const mediaStateDescriptors = {
  NETWORK_EMPTY: { value: 0, enumerable: true },
  NETWORK_IDLE: { value: 1, enumerable: true },
  NETWORK_LOADING: { value: 2, enumerable: true },
  NETWORK_NO_SOURCE: { value: 3, enumerable: true },
  HAVE_NOTHING: { value: 0, enumerable: true },
  HAVE_METADATA: { value: 1, enumerable: true },
  HAVE_CURRENT_DATA: { value: 2, enumerable: true },
  HAVE_FUTURE_DATA: { value: 3, enumerable: true },
  HAVE_ENOUGH_DATA: { value: 4, enumerable: true },
};

const trackStateDescriptors = {
  NONE: { value: 0, enumerable: true },
  LOADING: { value: 1, enumerable: true },
  LOADED: { value: 2, enumerable: true },
  ERROR: { value: 3, enumerable: true },
};

const rangeConstantDescriptors: PropertyDescriptorMap = {
  START_TO_START: { value: 0, enumerable: true },
  START_TO_END: { value: 1, enumerable: true },
  END_TO_END: { value: 2, enumerable: true },
  END_TO_START: { value: 3, enumerable: true },
};

function registerRange(realm: symbol, points: RangePoints): () => void {
  let index = rangeIndexes.get(realm);
  if (!index) {
    index = createRangeIndex();
    rangeIndexes.set(realm, index);
  }
  return index.register(points);
}

type CustomCallback = (...args: unknown[]) => unknown;
type CustomLifecycle = {
  connected: CustomCallback | undefined;
  disconnected: CustomCallback | undefined;
  adopted: CustomCallback | undefined;
  attributeChanged: CustomCallback | undefined;
  observed: Set<string>;
  disableShadow: boolean;
  disableInternals: boolean;
  formAssociated: boolean;
  formReset: CustomCallback | undefined;
  formOwnerChanged: CustomCallback | undefined;
  formDisabled: CustomCallback | undefined;
};

// Customized nodes retain their callbacks when adopted by another Window.
type CustomSubmissionValue = string | File | readonly (readonly [string, string | File])[];
const customValidityFlags = [
  "badInput",
  "customError",
  "patternMismatch",
  "rangeOverflow",
  "rangeUnderflow",
  "stepMismatch",
  "tooLong",
  "tooShort",
  "typeMismatch",
  "valueMissing",
] as const;
type CustomValidityFlag = (typeof customValidityFlags)[number];
type CustomValidityFlags = Partial<Record<CustomValidityFlag, boolean>>;
let customControlValidity:
  | WeakMap<
      Raw.Element,
      {
        flags: Set<CustomValidityFlag>;
        message: string;
        anchor: Raw.Element;
      }
    >
  | undefined;

const customSubmissionValues = new WeakMap<Raw.Element, CustomSubmissionValue>();
const customFormLifecycle = new WeakMap<
  Raw.Element,
  { owner: Raw.Element | null; disabled: boolean }
>();
const customFormCallbackDocuments = new WeakSet<Raw.Document>();
const customStates = new WeakMap<Raw.Element, CustomLifecycle | null>();
const constructingCustomElements = new WeakMap<Raw.Element, CustomLifecycle>();
const internalsVisibleShadows = new WeakSet<Raw.Node>();
const attachedInternals = new WeakSet<Raw.Element>();

const wrappers = createWrapperHandles();
const documentRealms = new WeakMap<Raw.Document, symbol>();
type CollectionMembers<T> = { length: () => number; at: (index: number) => T | undefined };
// The store is shared across Window factories so borrowed Web IDL methods preserve receiver identity.
const collectionRecords = new WeakMap<
  object,
  {
    kind: "nodes" | "elements";
    members: CollectionMembers<object>;
  }
>();
const registerCollectionRecord: Parameters<typeof createStaticNodeListFactory>[0]["register"] = (
  view,
  record,
) => collectionRecords.set(view, record);
const realmObjectPrototypes = new WeakMap<object, symbol>();
const realmDocuments = new WeakMap<symbol, Raw.Document>();
const xmlDocuments = new WeakSet<Raw.Document>();
const detachedOwners = new WeakMap<Raw.Node, Raw.Document>();
const inertTemplateOwners = new WeakMap<Raw.Document, Raw.Document>();
const inertTemplateDocuments = new WeakSet<Raw.Document>();
let exposedTemplateHosts: WeakMap<Raw.Node, Raw.Element> | undefined;
const creationRealms = new WeakMap<Raw.Node, symbol>();

type DocumentFactory =
  | "createElement"
  | "createElementNS"
  | "createAttribute"
  | "createAttributeNS"
  | "createTextNode"
  | "createComment"
  | "createCDATASection"
  | "createProcessingInstruction"
  | "createDocumentFragment"
  | "createRange";
type ImplementationFactory = "createDocumentType" | "createDocument" | "createHTMLDocument";
const implementationOwners = new WeakMap<object, { owner: Raw.Document; realm: symbol }>();
const windowControls = new WeakMap<
  object,
  {
    close: () => void;
    stop: () => void;
    navigate: (url: URL, replace?: boolean) => void;
  }
>();
const domParserOwners = new WeakMap<object, (markup: string, contentType: string) => object>();
const xmlSerializerInstances = new WeakSet<object>();

const realmTreeOperations = new WeakMap<
  symbol,
  {
    documentFactory: (
      receiver: object,
      method: DocumentFactory,
      args: readonly unknown[],
    ) => object;
    implementationFactory: (
      receiver: object,
      method: ImplementationFactory,
      args: readonly unknown[],
    ) => object;
    installShadowRoot: (
      host: Raw.Element,
      fragment: Raw.DocumentFragment,
      settings: ShadowSettings,
    ) => object;
    enableForeignCapabilities: () => void;
    revision: () => number;
    invalidateQueryIndices: () => void;
    collectionMembersCache: () => WeakMap<object, Raw.Element[]>;
    observeXPathVersion: (owner: Raw.Document) => () => number;
    baseURL: (owner: Raw.Document, kind?: "document" | "fallback") => string;
    documentEncoding: (owner: Raw.Document) => string;
    initializeCopiedTree: (copy: Raw.Node, owner: Raw.Document) => object;
    nativeHTMLElementPrototype: (localName: string, autonomous: boolean) => object;
    computedStyle: (
      node: Raw.Element,
      root?: Raw.ParentNode,
      pseudo?: string,
    ) => ReturnType<ReturnType<typeof createStyles>["computedStyle"]>;
    templateOwner: (owner: Raw.Document) => Raw.Document;
    queueDocumentSelectionChange: (owner: Raw.Document) => void;
    frameWindow: (frame: Raw.Element) => ChildRealm["window"] | null;
    frameSVGDocument: (frame: Raw.Element) => object | null;
    focusViewport: () => void;
    insert: (
      target: Raw.ParentNode | null,
      node: Raw.Node,
      reference: Raw.Node | null,
      isAttribute: boolean,
      replacing?: Raw.ChildNode,
    ) => void;
    remove: (node: Raw.ChildNode) => void;
    replaceChildren: (target: Raw.ParentNode, children: Raw.ChildNode[]) => void;
    attributeMutation: (node: Raw.Element, attr: AttributeRecord, oldValue: string | null) => void;
    removeAttribute: (owner: Raw.Element, attribute: AttributeRecord) => void;
    writeAriaAttribute: (owner: Raw.Element, name: string, value: string | null) => void;
    replaceData: (
      node: Raw.TextNode | Raw.CommentNode,
      offset: number,
      count: number,
      data: string,
    ) => void;
  }
>();

function rememberCreationRealm({
  root,
  realm,
  isForeignTransfer = false,
}: {
  root: Raw.Node;
  realm: symbol;
  isForeignTransfer?: boolean;
}): void {
  const pending = [root];
  const creators = isForeignTransfer ? new Set([realm]) : undefined;
  // Moving a subtree preserves original prototypes, including descendants never previously exposed.
  while (pending.length) {
    const node = pending.pop();
    if (!node) break;
    const handle = wrappers.get(node);
    if (!handle && !creationRealms.has(node)) creationRealms.set(node, realm);
    if (creators) {
      const creator = (handle && records.get(handle)?.realm) || creationRealms.get(node);
      if (creator) creators.add(creator);
    }
    if (!("childNodes" in node)) continue;
    for (const child of node.childNodes) pending.push(child);
    const content = templateContent(node);
    if (content) pending.push(content);
    const shadow = tree.isElementNode(node) && shadowRoots.get(node);
    if (shadow) pending.push(shadow);
  }
  if (creators)
    for (const creator of creators) realmTreeOperations.get(creator)?.enableForeignCapabilities();
}

const realmWrappers = new WeakMap<symbol, (node: Raw.Node) => { nodeType: number }>();
const records = createNodeRecords();
const asciiUppercase = /[A-Z]/;
const htmlNodeNames = new Map<string, string>(
  Object.values(html.TAG_NAMES).map((name) => [name, name.toUpperCase()]),
);

const ariaStringProperties = [
  "role",
  "ariaAtomic",
  "ariaAutoComplete",
  "ariaBrailleLabel",
  "ariaBrailleRoleDescription",
  "ariaBusy",
  "ariaChecked",
  "ariaColCount",
  "ariaColIndex",
  "ariaColIndexText",
  "ariaColSpan",
  "ariaCurrent",
  "ariaDescription",
  "ariaDisabled",
  "ariaExpanded",
  "ariaHasPopup",
  "ariaHidden",
  "ariaInvalid",
  "ariaKeyShortcuts",
  "ariaLabel",
  "ariaLevel",
  "ariaLive",
  "ariaModal",
  "ariaMultiLine",
  "ariaMultiSelectable",
  "ariaOrientation",
  "ariaPlaceholder",
  "ariaPosInSet",
  "ariaPressed",
  "ariaReadOnly",
  "ariaRelevant",
  "ariaRequired",
  "ariaRoleDescription",
  "ariaRowCount",
  "ariaRowIndex",
  "ariaRowIndexText",
  "ariaRowSpan",
  "ariaSelected",
  "ariaSetSize",
  "ariaSort",
  "ariaValueMax",
  "ariaValueMin",
  "ariaValueNow",
  "ariaValueText",
] as const;
type AriaStringProperties = Record<(typeof ariaStringProperties)[number], string | null>;
const ariaReferenceAttributes = {
  ariaActiveDescendantElement: "aria-activedescendant",
  ariaControlsElements: "aria-controls",
  ariaDescribedByElements: "aria-describedby",
  ariaDetailsElements: "aria-details",
  ariaErrorMessageElements: "aria-errormessage",
  ariaFlowToElements: "aria-flowto",
  ariaLabelledByElements: "aria-labelledby",
  ariaOwnsElements: "aria-owns",
} as const;

type AriaReferenceProperties<T> = {
  ariaActiveDescendantElement: T | null;
} & Record<
  Exclude<keyof typeof ariaReferenceAttributes, "ariaActiveDescendantElement">,
  readonly T[] | null
>;
type AriaReferences = readonly WeakRef<Raw.Element>[];
let explicitAriaReferences: WeakMap<object, Map<string, AriaReferences>> | undefined;
const cachedAriaArrays = new WeakMap<object, Map<string, readonly object[]>>();
const internalsAriaTargets = new WeakMap<object, Raw.Element>();
const internalsStateSets = new WeakMap<object, () => object>();

function updateAriaReferences(
  target: object,
  name: string,
  references: AriaReferences | undefined,
): void {
  let attributes = explicitAriaReferences?.get(target);
  if (!references) attributes?.delete(name);
  else {
    if (!attributes)
      (explicitAriaReferences ??= new WeakMap()).set(target, (attributes = new Map()));
    attributes.set(name, references);
  }
}

const internalsAriaValues = new WeakMap<object, Map<string, string> | undefined>();
const elementAriaDescriptors: PropertyDescriptorMap = {};
const internalsAriaDescriptors: PropertyDescriptorMap = {};

function nullableAriaString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "symbol") throw new TypeError("Cannot convert a Symbol to a string");
  return String(value);
}

for (const property of ariaStringProperties) {
  const name = property === "role" ? property : "aria-" + property.slice(4).toLowerCase();
  elementAriaDescriptors[property] = {
    configurable: true,
    enumerable: true,
    get(this: object): string | null {
      const record = records.get(this);
      if (!record || !tree.isElementNode(record.node)) throw new TypeError("Expected an Element");
      return attribute(record.node, name);
    },
    set(this: object, value: unknown) {
      const record = records.get(this);
      if (!record || !tree.isElementNode(record.node)) throw new TypeError("Expected an Element");
      const write = realmTreeOperations.get(record.realm)?.writeAriaAttribute;
      if (!write) throw new Error("An element must have an attribute mutation realm");
      write(record.node, name, nullableAriaString(value));
    },
  };
  internalsAriaDescriptors[property] = {
    configurable: true,
    enumerable: true,
    get(this: object): string | null {
      if (!internalsAriaValues.has(this)) throw new TypeError("Expected ElementInternals");
      return internalsAriaValues.get(this)?.get(name) ?? null;
    },
    set(this: object, value: unknown) {
      if (!internalsAriaValues.has(this)) throw new TypeError("Expected ElementInternals");
      const converted = nullableAriaString(value);
      const values = internalsAriaValues.get(this);
      if (converted === null) values?.delete(name);
      else if (values) values.set(name, converted);
      else internalsAriaValues.set(this, new Map([[name, converted]]));
    },
  };
}
const shadowHosts = new WeakMap<Raw.Node, Raw.Element>();
const shadowRoots = new WeakMap<Raw.Element, Raw.DocumentFragment>();
type ShadowSettings = {
  mode: "open" | "closed";
  delegatesFocus: boolean;
  clonable: boolean;
  serializable: boolean;
};
const shadowSettings = new WeakMap<Raw.Node, ShadowSettings>();
const declarativeShadows = new WeakSet<Raw.DocumentFragment>();
const declarativeShadowDocuments = new WeakSet<Raw.Document>();

function treeParent(node: Raw.Node, composed: boolean): Raw.ParentNode | null {
  return (
    ("parentNode" in node ? node.parentNode : null) ??
    (composed ? (shadowHosts.get(node) ?? null) : null)
  );
}

function treeRoot(node: Raw.Node, composed = false): Raw.Node {
  let root = node;
  for (let owner = treeParent(root, composed); owner; owner = treeParent(root, composed)) {
    root = owner;
  }
  return root;
}

const manualShadowRoots = new WeakSet<Raw.Node>();
type Slotable = Raw.Element | Raw.TextNode;
const manualSlotFor = new WeakMap<Slotable, Raw.Element>();
const manualSlotMembers = new WeakMap<Raw.Element, Set<Slotable>>();
const assignedSlotSnapshots = new WeakMap<Raw.Node, Map<Raw.Element, Slotable[]>>();
const scriptAsyncCleared = new WeakSet<Raw.Element>();
const startedScripts = new WeakSet<Raw.Element>();
let attrRecords: WeakMap<object, AttributeRecord> | undefined;
let attrOwners: WeakMap<object, Raw.Element> | undefined;
let disconnectedOrder: WeakMap<Raw.Node, number> | undefined;
let nextDisconnectedOrder = 0;

function orderOfDisconnected(node: Raw.Node): number {
  const order = (disconnectedOrder ??= new WeakMap());
  const existing = order.get(node);
  if (existing !== undefined) return existing;
  const assigned = nextDisconnectedOrder++;
  order.set(node, assigned);
  return assigned;
}

// Presence records a dirty value. Clean controls read their default directly.
const scrollOffsets = new WeakMap<Raw.Element, { left: number; top: number }>();

function elementScrollOffsets(node: Raw.Element): { left: number; top: number } {
  let offsets = scrollOffsets.get(node);
  if (!offsets) {
    offsets = { left: 0, top: 0 };
    scrollOffsets.set(node, offsets);
  }
  return offsets;
}

const typedArrayPrototype: object = Object.getPrototypeOf(Uint8Array.prototype);
const cryptoInstances = new WeakSet<object>();
const integerArrayTags = new Set([
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "BigInt64Array",
  "BigUint64Array",
]);

// HTML local names with a built-in interface, including legacy HTML elements.
let customIsValues: WeakMap<Raw.Element, string | null> | undefined;
const customElementSerialization = {
  treeAdapter: {
    ...tree,
    getAttrList(node: Raw.Element) {
      const is = customIsValues?.get(node);
      return is != null && attribute(node, "is") === null
        ? [{ name: "is", value: is }, ...node.attrs]
        : node.attrs;
    },
  },
};
const referrerPolicyKeywords = new Set([
  "no-referrer",
  "no-referrer-when-downgrade",
  "same-origin",
  "origin",
  "strict-origin",
  "origin-when-cross-origin",
  "strict-origin-when-cross-origin",
  "unsafe-url",
]);

const builtInCustomElementNames = new Set(
  "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog dir div dl dt em embed fieldset figcaption figure font footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link listing main map mark marquee menu meta meter nav noscript object ol optgroup option output p param picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr xmp".split(
    " ",
  ),
);

const globalHandlerEvents = [
  "abort",
  "auxclick",
  "beforeinput",
  "beforematch",
  "beforetoggle",
  "blur",
  "cancel",
  "canplay",
  "canplaythrough",
  "change",
  "click",
  "close",
  "contextlost",
  "contextmenu",
  "contextrestored",
  "copy",
  "cuechange",
  "cut",
  "dblclick",
  "drag",
  "dragend",
  "dragenter",
  "dragleave",
  "dragover",
  "dragstart",
  "drop",
  "durationchange",
  "emptied",
  "ended",
  "error",
  "focus",
  "formdata",
  "input",
  "invalid",
  "keydown",
  "keypress",
  "keyup",
  "load",
  "loadeddata",
  "loadedmetadata",
  "loadstart",
  "mousedown",
  "mouseenter",
  "mouseleave",
  "mousemove",
  "mouseout",
  "mouseover",
  "mouseup",
  "paste",
  "pause",
  "play",
  "playing",
  "progress",
  "ratechange",
  "reset",
  "resize",
  "scroll",
  "scrollend",
  "securitypolicyviolation",
  "seeked",
  "seeking",
  "select",
  "selectionchange",
  "selectstart",
  "slotchange",
  "stalled",
  "submit",
  "suspend",
  "timeupdate",
  "toggle",
  "volumechange",
  "waiting",
  "webkitanimationend",
  "webkitanimationiteration",
  "webkitanimationstart",
  "webkittransitionend",
  "wheel",
  "touchstart",
  "touchend",
  "touchmove",
  "touchcancel",
  "pointerover",
  "pointerenter",
  "pointerdown",
  "pointermove",
  "pointerrawupdate",
  "pointerup",
  "pointercancel",
  "pointerout",
  "pointerleave",
  "gotpointercapture",
  "lostpointercapture",
  "command",
] as const;
const windowHandlerEvents = [
  "afterprint",
  "beforeprint",
  "beforeunload",
  "hashchange",
  "languagechange",
  "message",
  "messageerror",
  "offline",
  "online",
  "pagehide",
  "pagereveal",
  "pageshow",
  "pageswap",
  "popstate",
  "rejectionhandled",
  "storage",
  "unhandledrejection",
  "unload",
] as const;
const documentHandlerEvents = ["readystatechange", "visibilitychange"] as const;
const reflectedWindowEvents = [
  ...windowHandlerEvents,
  "blur",
  "error",
  "focus",
  "load",
  "resize",
  "scroll",
] as const;
const globalHandlerNames = new Set<string>(globalHandlerEvents);
const legacyEventTypes: ReadonlyMap<string, string> = new Map([
  ["webkitanimationend", "webkitAnimationEnd"],
  ["webkitanimationiteration", "webkitAnimationIteration"],
  ["webkitanimationstart", "webkitAnimationStart"],
  ["webkittransitionend", "webkitTransitionEnd"],
]);
type ReflectedWindowEvent = (typeof reflectedWindowEvents)[number];
type GlobalHandlerName = (typeof globalHandlerEvents)[number];
type WindowHandlerName = (typeof windowHandlerEvents)[number];
type HandlerProperties<Name extends string, Callback> = Record<`on${Name}`, Callback | null>;
const reflectedWindowAttributes = new WeakMap<
  Raw.Document,
  (type: ReflectedWindowEvent, value: string | null, initial: boolean) => void
>();

function reflectedWindowEvent(name: string): ReflectedWindowEvent | undefined {
  if (!name.startsWith("on")) return undefined;
  const eventType = name.slice(2);
  return reflectedWindowEvents.find((type) => type === eventType);
}

type HandlerTable = ReturnType<typeof createEventHandlers>;
type EventHandlerTarget = Parameters<HandlerTable["get"]>[0];
type EventHandlerCallback = Parameters<HandlerTable["set"]>[2];
const windowHandlerTables = new WeakMap<object, HandlerTable>();
const nodeHandlerTables = new WeakMap<
  symbol,
  { handlers: HandlerTable; ownerRecord: (node: Raw.Node) => Raw.Document }
>();

function handlerTarget(
  receiver: EventHandlerTarget,
  reflected: boolean,
): EventHandlerTarget | null {
  const record = records.get(receiver);
  if (!reflected || !record) return receiver;
  const { node, realm } = record;
  if (
    !tree.isElementNode(node) ||
    node.namespaceURI !== html.NS.HTML ||
    (node.tagName !== "body" && node.tagName !== "frameset")
  )
    return receiver;
  const owner = nodeHandlerTables.get(realm)?.ownerRecord(node);
  return owner ? ((documentViews.get(owner) as EventHandlerTarget | undefined) ?? null) : null;
}

function handlerTable(target: EventHandlerTarget): HandlerTable {
  const record = records.get(target);
  const table = record
    ? nodeHandlerTables.get(record.realm)?.handlers
    : windowHandlerTables.get(target);
  if (!table) throw new TypeError("Expected an event handler target");
  return table;
}

function handlerDescriptor(type: string, reflected = false): PropertyDescriptor {
  return {
    configurable: true,
    enumerable: true,
    get(this: EventHandlerTarget) {
      const target = handlerTarget(this, reflected);
      return target ? handlerTable(target).get(target, type) : null;
    },
    set(this: EventHandlerTarget, handler: EventHandlerCallback) {
      const target = handlerTarget(this, reflected);
      if (target) handlerTable(target).set(target, type, handler);
    },
  };
}

// These module-owned tables have fixed string keys and immutable descriptors.
const interfaceTableEntries = new WeakMap<PropertyDescriptorMap, [string, PropertyDescriptor][]>();
function installInterfaceTable(target: object, table: PropertyDescriptorMap): void {
  let entries = interfaceTableEntries.get(table);
  if (!entries) {
    entries = Object.entries(table);
    interfaceTableEntries.set(table, entries);
  }
  for (const [name, descriptor] of entries) Object.defineProperty(target, name, descriptor);
}

const globalHandlerDescriptors: PropertyDescriptorMap = {};
const bodyHandlerDescriptors: PropertyDescriptorMap = {};
const windowHandlerDescriptors: PropertyDescriptorMap = {};
for (const name of globalHandlerEvents) {
  const type = legacyEventTypes.get(name) ?? name;
  const descriptor = handlerDescriptor(
    type,
    reflectedWindowEvents.some((event) => event === name),
  );
  globalHandlerDescriptors[`on${name}`] = descriptor;
  windowHandlerDescriptors[`on${name}`] = descriptor;
}
for (const name of windowHandlerEvents) {
  const descriptor = handlerDescriptor(name, true);
  bodyHandlerDescriptors[`on${name}`] = descriptor;
  windowHandlerDescriptors[`on${name}`] = descriptor;
}
const documentHandlerDescriptors = { ...globalHandlerDescriptors };
for (const name of documentHandlerEvents)
  documentHandlerDescriptors[`on${name}`] = handlerDescriptor(name);

const performanceStarts = new WeakMap<object, number>();

// Public relative timestamps share the non-isolated Window's 100 µs precision.
function relativeHighResolutionTime(origin: number): number {
  return Math.floor((monotonicClock.now() - origin) * 10) / 10;
}

function performanceStart(receiver: object): number {
  const start = performanceStarts.get(receiver);
  if (start === undefined) throw new TypeError("Expected a Performance");
  return start;
}

const notifyFrameMedia = new WeakMap<object, () => void>();

const browserBarNames = [
  "locationbar",
  "menubar",
  "personalbar",
  "scrollbars",
  "statusbar",
  "toolbar",
] as const;

const unsupportedWindowMethods = [
  "alert",
  "blur",
  "confirm",
  "focus",
  "moveBy",
  "moveTo",
  "open",
  "print",
  "prompt",
  "resizeBy",
  "resizeTo",
  "scroll",
  "scrollBy",
  "scrollTo",
] as const;
type UnsupportedWindowMethods = Record<
  (typeof unsupportedWindowMethods)[number],
  (...args: unknown[]) => undefined
>;

const viewportDefaults = {
  innerWidth: 1024,
  innerHeight: 768,
  outerWidth: 1024,
  outerHeight: 768,
  devicePixelRatio: 1,
  scrollX: 0,
  scrollY: 0,
  pageXOffset: 0,
  pageYOffset: 0,
  screenX: 0,
  screenY: 0,
  screenLeft: 0,
  screenTop: 0,
};

const controlValues = new WeakMap<Raw.Element, string>();
type InputFileList = InstanceType<ReturnType<typeof createFileLists>["FileList"]>;
const inputFiles = new WeakMap<Raw.Element, InputFileList>();
const outputDefaults = new WeakMap<Raw.Element, string>();
const customValidity = new WeakMap<Raw.Element, string>();
type FocusState = { kind: "element"; element: Raw.Element } | { kind: "viewport"; element?: never };
const designModeDocuments = new WeakSet<Raw.Document>();
const focusStates = new WeakMap<Raw.Document, FocusState>();
const focusRequests = new WeakMap<Raw.Document, symbol>();
const focusedDocuments = new WeakSet<Raw.Document>();
const focusFrameOwners = new WeakMap<Raw.Document, Raw.Element>();
const projectedFrameFocus = new WeakMap<Raw.Element, Raw.Document>();
const optionStates = new WeakMap<Raw.Element, { selected: boolean; dirty: boolean }>();
let optionSelectionRevision = 0;

function optionSelected(node: Raw.Element): boolean {
  return optionStates.get(node)?.selected ?? attribute(node, "selected") !== null;
}

function setOptionSelected(node: Raw.Element, selected: boolean, dirty = false): void {
  if (optionSelected(node) !== selected) optionSelectionRevision++;
  optionStates.set(node, { selected, dirty: dirty || (optionStates.get(node)?.dirty ?? false) });
}

function inputValueMode(type: string): "value" | "default" | "default/on" | "filename" {
  switch (type) {
    case "checkbox":
    case "radio":
      return "default/on";
    case "hidden":
    case "submit":
    case "image":
    case "reset":
    case "button":
      return "default";
    case "file":
      return "filename";
    default:
      return "value";
  }
}

function inputGrid(node: Raw.Element, type: string) {
  return numericGrid(type, (name) => attribute(node, name));
}

function sanitizeInputValue(node: Raw.Element, value: string, type: string): string {
  if (type === "text" || type === "search" || type === "tel" || type === "password") {
    return value.replace(/[\r\n]/g, "");
  }
  if (type === "url" || type === "email") {
    const stripped = value.replace(/[\r\n]/g, "");
    const trim = (text: string) => text.replace(/^[\t\f ]+|[\t\f ]+$/g, "");
    return type === "email" && attribute(node, "multiple") !== null
      ? stripped.split(",").map(trim).join(",")
      : trim(stripped);
  }
  if (type === "range") return sanitizeRange(value, inputGrid(node, type));
  if (supportsInputNumber(type)) {
    const number = inputNumber(type, value);
    if (!Number.isFinite(number)) return "";
    return type === "datetime-local" ? formatInputNumber(type, number) : value;
  }
  if (type === "color") return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "#000000";
  return value;
}

// Ordinary-tree text only: templates stay inert, comments/instructions are excluded, and CDATA is included.
function descendantTextContent(root: Raw.ParentNode): string {
  const packed = packedLeafText(root);
  if (packed !== undefined) return packed;
  let children = root.childNodes;
  // Each step follows one edge in the finite acyclic raw tree; single-child chains need no scratch arrays.
  while (children.length === 1) {
    const child = children[0];
    if (!child) return "";
    if (tree.isTextNode(child)) return child.value;
    if (tree.isCommentNode(child)) return xmlSpecial(child)?.kind === "cdata" ? child.data : "";
    if (!tree.isElementNode(child)) return "";
    const packed = packedLeafText(child);
    if (packed !== undefined) return packed;
    children = child.childNodes;
  }
  if (!children.length) return "";
  const pieces: string[] = [];
  const pending = children.toReversed();
  // Each ordinary child edge is visited once; private reads cannot invoke author callbacks.
  while (pending.length) {
    const child = pending.pop();
    if (!child) continue;
    if (tree.isTextNode(child)) pieces.push(child.value);
    else if (tree.isCommentNode(child)) {
      if (xmlSpecial(child)?.kind === "cdata") pieces.push(child.data);
    } else if (tree.isElementNode(child)) {
      const packed = packedLeafText(child);
      if (packed !== undefined) {
        pieces.push(packed);
        continue;
      }
      for (let index = child.childNodes.length - 1; index >= 0; index--) {
        const nested = child.childNodes[index];
        if (nested) pending.push(nested);
      }
    }
  }
  return pieces.join("");
}

function findExposedAttribute(
  node: Raw.Element,
  name: string,
  kind: "id" | "class",
): Raw.Element | undefined {
  if (kind === "id" ? attribute(node, "id") === name : hasClass(node, name)) return node;
  if (packedLeafText(node) !== undefined) return;
  return firstAttributeInOrdinaryTree({ root: node, name, kind, skipPackedText: false });
}

function firstAttributeInOrdinaryTree({
  root,
  name,
  kind = "id",
  maxVisits = Infinity,
  skipPackedText,
}: {
  root: Raw.ParentNode;
  name: string;
  kind?: "id" | "class";
  maxVisits?: number;
  skipPackedText: boolean;
}): Raw.Element | undefined {
  if (skipPackedText && maxVisits === Infinity && tree.isElementNode(root)) {
    const packed = firstPackedDescendantAttribute(root, name, kind, findExposedAttribute);
    if (packed !== undefined) return packed ?? undefined;
  }
  const parents: Raw.ParentNode[] = [];
  const positions: number[] = [];
  let parent = root,
    position = 0,
    visited = 0;
  // The finite acyclic ordinary tree is visited in order, with O(depth) scratch storage and an optional prefix budget.
  while (visited < maxVisits) {
    if (position >= parent.childNodes.length) {
      const previous = parents.pop(),
        next = positions.pop();
      if (!previous || next === undefined) return;
      parent = previous;
      position = next;
      continue;
    }
    const node = parent.childNodes[position++];
    visited++;
    if (!node || !tree.isElementNode(node)) continue;
    if (kind === "id" ? attribute(node, "id") === name : hasClass(node, name)) return node;
    if (skipPackedText && packedLeafText(node) !== undefined) {
      visited++;
      continue;
    }
    if (skipPackedText && maxVisits === Infinity) {
      const packed = firstPackedDescendantAttribute(node, name, kind, findExposedAttribute);
      if (packed) return packed;
      if (packed === null) continue;
    }
    if (node.childNodes.length) {
      parents.push(parent);
      positions.push(position);
      parent = node;
      position = 0;
    }
  }
}

function cloneRawNode(node: Raw.Node): Raw.Node {
  if (tree.isElementNode(node)) {
    const copy = tree.createElement(
      node.tagName,
      node.namespaceURI,
      node.attrs.map((attr) => ({ ...attr })),
    );
    const prefix = rawElementPrefix(node);
    if (prefix !== null) setRawElementPrefix(copy, prefix);
    const is = customIsValues?.get(node);
    if (is !== undefined) customIsValues?.set(copy, is);
    if ("content" in node) Object.assign(copy, { content: tree.createDocumentFragment() });
    if (startedScripts.has(node)) startedScripts.add(copy);
    if (isInput(node)) copyCheckState(node, copy);
    const value = controlValues.get(node);
    if (value !== undefined) controlValues.set(copy, value);
    const option = optionStates.get(node);
    if (option) optionStates.set(copy, { ...option });
    return copy;
  }
  if (tree.isTextNode(node)) return { nodeName: "#text", value: node.value, parentNode: null };
  if (tree.isCommentNode(node)) {
    const special = xmlSpecial(node);
    return special ? createXMLData(node.data, special) : tree.createCommentNode(node.data);
  }
  if (tree.isDocumentTypeNode(node)) {
    const { nodeName, name, publicId, systemId } = node;
    return { nodeName, name, publicId, systemId, parentNode: null };
  }
  if (node.nodeName === "#document")
    return { nodeName: "#document", mode: node.mode, childNodes: [] };
  return tree.createDocumentFragment();
}

function isDocumentRecord(node: Raw.Node): node is Raw.Document {
  return node.nodeName === "#document" && "mode" in node;
}

function templateContent(node: Raw.ParentNode): Raw.DocumentFragment | undefined {
  return tree.isElementNode(node) && "content" in node ? (node as Raw.Template).content : undefined;
}

function cloneRawTree(
  node: Raw.Node,
  deep: boolean,
  cloneShadow?: (
    source: Raw.ParentNode,
    target: Raw.ParentNode,
  ) => { source: Raw.ParentNode; target: Raw.ParentNode } | undefined,
): Raw.Node {
  const copy = cloneRawNode(node);
  if (!("childNodes" in node) || !("childNodes" in copy) || (!deep && !cloneShadow)) return copy;
  const pending: { source: Raw.ParentNode; target: Raw.ParentNode }[] = [
    { source: node, target: copy },
  ];
  // Each child and template content fragment is copied once from the acyclic raw tree.
  while (pending.length) {
    const entry = pending.pop();
    if (!entry) break;
    const shadow = cloneShadow?.(entry.source, entry.target);
    if (shadow) pending.push(shadow);
    if (entry.source === node && !deep) continue;
    const fromContent = templateContent(entry.source);
    const toContent = templateContent(entry.target);
    if (fromContent && toContent) pending.push({ source: fromContent, target: toContent });
    for (const child of entry.source.childNodes) {
      const cloned = cloneRawNode(child);
      if (!("parentNode" in cloned)) throw new TypeError("Expected a cloned child node");
      tree.appendChild(entry.target, cloned);
      if ("childNodes" in child && "childNodes" in cloned)
        pending.push({ source: child, target: cloned });
    }
  }
  return copy;
}

function equalAttribute(a: AttributeRecord, b: AttributeRecord): boolean {
  return (
    (a.namespace || null) === (b.namespace || null) && a.name === b.name && a.value === b.value
  );
}

function equalRawNode(a: Raw.Node, b: Raw.Node): boolean {
  if (a.nodeName !== b.nodeName) return false;
  if (tree.isElementNode(a)) {
    if (
      !tree.isElementNode(b) ||
      a.namespaceURI !== b.namespaceURI ||
      rawElementPrefix(a) !== rawElementPrefix(b)
    )
      return false;
    return (
      a.attrs.length === b.attrs.length &&
      a.attrs.every((attr) => b.attrs.some((other) => equalAttribute(attr, other)))
    );
  }
  if (tree.isTextNode(a)) return tree.isTextNode(b) && a.value === b.value;
  if (tree.isCommentNode(a)) {
    if (!tree.isCommentNode(b) || a.data !== b.data) return false;
    const left = xmlSpecial(a);
    const right = xmlSpecial(b);
    if (left?.kind === "instruction")
      return right?.kind === "instruction" && left.target === right.target;
    return left?.kind === right?.kind;
  }
  if (tree.isDocumentTypeNode(a)) {
    return (
      tree.isDocumentTypeNode(b) &&
      a.name === b.name &&
      a.publicId === b.publicId &&
      a.systemId === b.systemId
    );
  }
  return shadowHosts.has(a) === shadowHosts.has(b);
}

function equalRawTree(a: Raw.Node, b: Raw.Node): boolean {
  const pending: [Raw.Node, Raw.Node][] = [[a, b]];
  // Each pair represents corresponding positions in the two acyclic trees.
  while (pending.length) {
    const pair = pending.pop();
    if (!pair) break;
    const [left, right] = pair;
    if (left === right) continue;
    if (!equalRawNode(left, right)) return false;
    if ("childNodes" in left && "childNodes" in right) {
      if (left.childNodes.length !== right.childNodes.length) return false;
      for (const [index, child] of left.childNodes.entries()) {
        const other = right.childNodes[index];
        if (!other) return false;
        pending.push([child, other]);
      }
    }
  }
  return true;
}

const nodeConstantDescriptors: PropertyDescriptorMap = {
  ELEMENT_NODE: { value: 1, enumerable: true },
  ATTRIBUTE_NODE: { value: 2, enumerable: true },
  TEXT_NODE: { value: 3, enumerable: true },
  CDATA_SECTION_NODE: { value: 4, enumerable: true },
  ENTITY_REFERENCE_NODE: { value: 5, enumerable: true },
  ENTITY_NODE: { value: 6, enumerable: true },
  PROCESSING_INSTRUCTION_NODE: { value: 7, enumerable: true },
  COMMENT_NODE: { value: 8, enumerable: true },
  DOCUMENT_NODE: { value: 9, enumerable: true },
  DOCUMENT_TYPE_NODE: { value: 10, enumerable: true },
  DOCUMENT_FRAGMENT_NODE: { value: 11, enumerable: true },
  NOTATION_NODE: { value: 12, enumerable: true },
  DOCUMENT_POSITION_DISCONNECTED: { value: 1, enumerable: true },
  DOCUMENT_POSITION_PRECEDING: { value: 2, enumerable: true },
  DOCUMENT_POSITION_FOLLOWING: { value: 4, enumerable: true },
  DOCUMENT_POSITION_CONTAINS: { value: 8, enumerable: true },
  DOCUMENT_POSITION_CONTAINED_BY: { value: 16, enumerable: true },
  DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: { value: 32, enumerable: true },
};

const errorEventRecords = new WeakSet<object>();
const windowObjects = new WeakSet<object>();
type WindowInterfaceLayout = { hidden: string[]; tagged: string[] };
let hostInterfaceLayout: WindowInterfaceLayout | undefined;
let vmInterfaceLayout: WindowInterfaceLayout | undefined;
const nonEnumerable = { enumerable: false };

// All interface bindings are installed before beforeParse or any page script.
// Cache only names, so every constructor, prototype and property still belongs
// to its own realm. Native VM globals and host-backed globals learn separately.
function finalizeWindowInterfaces(window: object, nodePrototype: object, vm: boolean): void {
  const layout = vm ? vmInterfaceLayout : hostInterfaceLayout;
  if (layout) {
    for (const name of layout.hidden) Object.defineProperty(window, name, nonEnumerable);
    for (const name of layout.tagged) {
      const prototype = Reflect.get(window, name).prototype;
      Object.defineProperty(prototype, Symbol.toStringTag, { value: name, configurable: true });
    }
    return;
  }
  const hidden: string[] = [];
  const tagged: string[] = [];
  for (const name of Object.getOwnPropertyNames(window)) {
    // The historical XPath error factory is enumerable in pinned jsdom.
    if (name === "XPathException" || !/^[A-Z]/.test(name)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(window, name);
    if (descriptor?.enumerable) {
      hidden.push(name);
      Object.defineProperty(window, name, nonEnumerable);
    }
    const constructor: unknown = descriptor?.value;
    const prototype: unknown =
      typeof constructor === "function" ? constructor.prototype : undefined;
    if (
      typeof prototype !== "object" ||
      prototype === null ||
      !(
        prototype === nodePrototype || Object.prototype.isPrototypeOf.call(nodePrototype, prototype)
      ) ||
      Object.hasOwn(prototype, Symbol.toStringTag)
    )
      continue;
    tagged.push(name);
    Object.defineProperty(prototype, Symbol.toStringTag, { value: name, configurable: true });
  }
  if (vm) vmInterfaceLayout = { hidden, tagged };
  else hostInterfaceLayout = { hidden, tagged };
}

const windowShapeKeys = [Symbol(), Symbol()] as const;
const documentViews = new WeakMap<Raw.Document, object>();
const HostDOMException = globalThis.DOMException;
const exceptionConstants = Object.fromEntries(
  Object.keys(HostDOMException)
    .filter((name) => name.endsWith("_ERR"))
    .map((name) => [name, Object.getOwnPropertyDescriptor(HostDOMException, name)!]),
);
let hostFormDataClass: typeof globalThis.FormData | undefined;

function hostFormData(): typeof globalThis.FormData {
  return (hostFormDataClass ??= globalThis.FormData);
}
const windowNameElements = new Set(["embed", "form", "img", "object", "iframe", "frame"]);
const supportedLinkRelationships: ReadonlySet<string> = new Set(["stylesheet"]);

function namesForWindow(node: Raw.Element): [string | null, string | null] {
  if (node.namespaceURI !== html.NS.HTML) return [null, null];
  return [
    attribute(node, "id"),
    windowNameElements.has(node.tagName) ? attribute(node, "name") : null,
  ];
}

// Share HTML keyword tables across windows. Realm-specific state stays in buildWindow.
const focusableControls: ReadonlySet<string> = new Set(["input", "button", "select", "textarea"]);
const nonRenderedSVGElements: ReadonlySet<string> = new Set([
  "clipPath",
  "defs",
  "desc",
  "linearGradient",
  "marker",
  "mask",
  "metadata",
  "pattern",
  "radialGradient",
  "script",
  "style",
  "symbol",
  "title",
]);
const defaultTabStops: ReadonlySet<string> = new Set([
  ...focusableControls,
  "a",
  "area",
  "frame",
  "iframe",
  "object",
]);
const labelableTags: ReadonlySet<string> = new Set([
  "button",
  "input",
  "meter",
  "output",
  "progress",
  "select",
  "textarea",
]);
const validationElements: ReadonlySet<string> = new Set([
  "input",
  "textarea",
  "select",
  "button",
  "output",
]);
const barredInputTypes: ReadonlySet<string> = new Set(["hidden", "button", "reset"]);
const optionalInputTypes: ReadonlySet<string> = new Set([
  "hidden",
  "range",
  "color",
  "submit",
  "image",
  "reset",
  "button",
]);
const readonlyInputTypes: ReadonlySet<string> = new Set([
  "text",
  "search",
  "tel",
  "url",
  "email",
  "password",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
  "number",
]);
const patternTypes: ReadonlySet<string> = new Set([
  "text",
  "search",
  "tel",
  "url",
  "email",
  "password",
]);
const listedControlNames: ReadonlySet<string> = new Set([
  "button",
  "fieldset",
  "input",
  "object",
  "output",
  "select",
  "textarea",
]);
const submissionControls: ReadonlySet<string> = new Set(["button", "input", "select", "textarea"]);
const inputButtonTypes: ReadonlySet<string> = new Set(["button", "reset", "submit", "image"]);
const inputListTypes: ReadonlySet<string> = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
  "number",
  "range",
  "color",
]);
const directionalityInputTypes: ReadonlySet<string> = new Set([
  "hidden",
  "text",
  "search",
  "tel",
  "url",
  "email",
  "password",
  "submit",
  "reset",
  "button",
]);
const resettableControlNames: ReadonlySet<string> = new Set([
  "input",
  "textarea",
  "select",
  "output",
]);
const formMethods: ReadonlySet<string> = new Set(["get", "post", "dialog"]);
const formEncodings: ReadonlySet<string> = new Set([
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
]);
const selectableInputTypes: ReadonlySet<string> = new Set([
  "text",
  "search",
  "url",
  "tel",
  "password",
]);
const focusVisibleInputTypes = new Set([
  ...selectableInputTypes,
  "email",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);
const selectAllInputTypes: ReadonlySet<string> = new Set([
  ...selectableInputTypes,
  "email",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
  "number",
  "color",
  "file",
]);

function matchesOpenState(node: Raw.Element): boolean {
  return (
    node.namespaceURI === html.NS.HTML &&
    (node.tagName === "details" || node.tagName === "dialog") &&
    attribute(node, "open") !== null
  );
}

// The host queue owns only the slot. Closing an unobserved blank frame releases its realm
// immediately, while open frames keep the normal microtask order.
function queueFrameLoad(slot: FrameLoadSlot): void {
  queueMicrotask(() => {
    const run = slot.run;
    delete slot.run;
    run?.();
  });
}

// Frame completion promises only resolve. Keep the scheduled cleanup independent of the Window.
function trackFrameLoad(resources: Set<Promise<void>>, pending: Promise<void>): void {
  resources.add(pending);
  void pending.then(() => resources.delete(pending));
}

function buildWindow(
  source: Raw.Document,
  options: WindowSettings,
  windowStarted = monotonicClock.now(),
  frameStorage?: StorageSubscription,
) {
  const skipPackedText = hasPackedTemplate(source);
  const sourceIsXML = options.isXML === true;
  let hasFormLifecycleCallbacks = false;
  let hasCustomElements = false;
  let hasAdditionalDocuments = false;
  let hasClonableShadows = false;
  let hasShadowRoots = false;
  if (!sourceIsXML && !options.detachedDocument) declarativeShadowDocuments.add(source);
  let url = options.url === undefined ? blankURL : new URL(options.url);
  const windowOrigin = options.inheritedOrigin ?? url.origin;
  const initialDocumentURL = url.href;
  const referrer = options.referrer === undefined ? "" : new URL(options.referrer).href;
  let currentScript: Raw.Element | null = null;
  let readyState: "loading" | "interactive" | "complete" = "loading";
  let pageShowing = false;
  let loadGeneration = 0;
  let documentLoadStopped = false;
  let frameLoadSlot: FrameLoadSlot | undefined;
  let loadImmediates: Set<ReturnType<typeof setImmediate>> | undefined;

  function cancelScheduledLoads(): void {
    if (frameLoadSlot) delete frameLoadSlot.run;
    if (!loadImmediates) return;
    for (const task of loadImmediates) clearImmediate(task);
    loadImmediates = undefined;
  }
  let closed = false;
  let stopActiveParser: (() => void) | undefined;
  let focusFixupPending = false;
  class DOMException extends HostDOMException {}
  Object.defineProperties(DOMException, exceptionConstants);
  Object.defineProperties(DOMException.prototype, exceptionConstants);

  class QuotaExceededError extends DOMException {
    readonly #quota: number | null;
    readonly #requested: number | null;

    constructor(message = "", options?: { quota?: number; requested?: number } | null) {
      super(message, "QuotaExceededError");
      if (options != null && typeof options !== "object" && typeof options !== "function")
        throw new TypeError("Expected a QuotaExceededErrorOptions dictionary");
      const quota = options?.quota;
      const requested = options?.requested;
      this.#quota = quota === undefined ? null : +quota;
      this.#requested = requested === undefined ? null : +requested;
      for (const value of [this.#quota, this.#requested]) {
        if (value !== null && !Number.isFinite(value))
          throw new TypeError("Expected a finite double");
        if (value !== null && value < 0) throw new RangeError("Expected a non-negative value");
      }
      if (this.#quota !== null && this.#requested !== null && this.#requested < this.#quota)
        throw new RangeError("requested must be greater than or equal to quota");
    }

    get quota(): number | null {
      return this.#quota;
    }
    get requested(): number | null {
      return this.#requested;
    }
    get [Symbol.toStringTag](): string {
      return "QuotaExceededError";
    }
  }

  Object.defineProperty(DOMException, "name", { value: "DOMException", configurable: true });
  const frameStates = new Map<Raw.Element, FrameState>();
  let frameCount = 0;
  let storageAreas: StorageAreas | undefined;
  const sharedAreas =
    options.storageAreas ??
    (() => (storageAreas ??= { origins: new Map(), subscribers: new Map() }));
  function documentOrigin(): string {
    return options.inheritedOrigin ?? url.origin;
  }
  let resourceAbort: AbortController | undefined;
  let socketAbort: AbortController | undefined;
  let socketClass: SocketConstructor | undefined;
  let pendingResources: Set<Promise<void>> | undefined;
  let pendingLoadResources: Set<Promise<void>> | undefined;
  let pendingStylesheets: Set<Promise<void>> | undefined;
  let pendingBlockingStylesheets: Set<Promise<void>> | undefined;
  let parserStylesheetOwners: WeakSet<Raw.Element> | undefined;
  let linkRequests: WeakMap<Raw.Element, { url: string; abort: AbortController }> | undefined;
  let explicitlyEnabledStylesheets: WeakSet<Raw.Element> | undefined;
  let pointerFocusDocuments: WeakSet<Raw.Document> | undefined;
  let lastStyleFocus: WeakRef<Raw.Element> | undefined;
  let lastStylePointerFocus = false;
  let styleFocusRevision = 0;
  function matchesHyperlink(node: Raw.Element): boolean {
    const name = elementLocalName(node);
    return (
      ((node.namespaceURI === html.NS.HTML && (name === "a" || name === "area")) ||
        (node.namespaceURI === html.NS.SVG && name === "a")) &&
      attribute(node, "href") !== null
    );
  }
  const statePseudos = {
    defined: isDefinedElement,
    root: (node: Raw.Element) => Boolean(node.parentNode && isDocumentRecord(node.parentNode)),
    link: matchesHyperlink,
    "any-link": matchesHyperlink,
    "local-link": (node: Raw.Element, level?: number) => {
      const svgAnchor = node.namespaceURI === html.NS.SVG && elementLocalName(node) === "a";
      if (!svgAnchor && !matchesHyperlink(node)) return false;
      const href =
        attribute(node, "href") ??
        (svgAnchor
          ? node.attrs.find(
              (a) => a.namespace === "http://www.w3.org/1999/xlink" && a.name === "href",
            )?.value
          : undefined);
      if (href === undefined || href === null) return false;
      const link = parseElementURL(node, href);
      if (!link) return false;
      const current = new URL(detachedSettings?.get(ownerRecord(node))?.url ?? url.href);
      if (level === undefined) {
        link.hash = current.hash = "";
        return current.href === link.href;
      }
      if (current.origin === "null" || current.origin !== link.origin) return false;
      const path = current.pathname.slice(1).split("/");
      const target = link.pathname.slice(1).split("/");
      return (
        path.length >= level &&
        target.length >= level &&
        path.slice(0, level).every((segment, index) => target[index] === segment)
      );
    },
    visited: () => false,
    target: (node: Raw.Element) => {
      const fragment = ownerRecord(node) === source ? url.hash.slice(1) : "";
      return Boolean(fragment) && fragmentTarget(fragment) === node;
    },
    "placeholder-shown": (node: Raw.Element) => {
      if (node.namespaceURI !== html.NS.HTML || attribute(node, "placeholder") === null)
        return false;
      const name = elementLocalName(node);
      if (name === "textarea") return textareaValue(node) === "";
      return (
        name === "input" &&
        /^(?:text|search|tel|url|email|password|number)$/.test(inputType(node)) &&
        inputValue(node) === ""
      );
    },
    checked: (node: Raw.Element) => {
      if (isInput(node)) return /^(?:checkbox|radio)$/.test(inputType(node)) && checkedness(node);
      if (node.namespaceURI !== html.NS.HTML || elementLocalName(node) !== "option") return false;
      const select = optionSelect(node);
      if (select) selectMembers(select);
      return optionSelected(node);
    },
    "run-dom-direction-ltr": (node: Raw.Element) => directionality(node) === "ltr",
    "run-dom-direction-rtl": (node: Raw.Element) => directionality(node) === "rtl",
    "run-dom-heading": (node: Raw.Element) => headingLevel(node) !== 0,
    ...Object.fromEntries(
      Array.from({ length: 10 }, (_, level) => [
        `run-dom-heading-${level}`,
        (node: Raw.Element) => headingLevel(node) === level && level !== 0,
      ]),
    ),
    open: matchesOpenState,
    modal: (node: Raw.Element) => modalDialogs?.has(node) ?? false,
    enabled: (node: Raw.Element) => matchesDisabledState(node, false),
    disabled: (node: Raw.Element) => matchesDisabledState(node, true),
    "read-write": matchesReadWrite,
    "read-only": (node: Raw.Element) =>
      node.namespaceURI === html.NS.HTML && !matchesReadWrite(node),
    required: (node: Raw.Element) => supportsRequired(node) && attribute(node, "required") !== null,
    optional: (node: Raw.Element) =>
      node.namespaceURI === html.NS.HTML &&
      (isInput(node) || node.tagName === "select" || node.tagName === "textarea") &&
      (!supportsRequired(node) || attribute(node, "required") === null),
    "in-range": (node: Raw.Element) => matchesRange(node, true),
    "out-of-range": (node: Raw.Element) => matchesRange(node, false),
    indeterminate: matchesIndeterminate,
    default: matchesDefault,
    valid: (node: Raw.Element) => matchesValidity(node, true),
    invalid: (node: Raw.Element) => matchesValidity(node, false),
    focus: (node: Raw.Element) => matchesFocus(node, false),
    "focus-within": (node: Raw.Element) => matchesFocus(node, true),
    "focus-visible": matchesFocusVisible,
  };
  let styleBinding: ReturnType<typeof createStyles> | undefined;
  function styleScope(node: Raw.Element): Raw.ParentNode | undefined {
    const root = treeRoot(node);
    return isDocumentRecord(root) ||
      (root.nodeName === "#document-fragment" && shadowHosts.has(root))
      ? root
      : undefined;
  }

  function styles() {
    return (styleBinding ??= createStyles({
      objectPrototype: Object.getPrototypeOf(EventTarget.prototype),
      functionPrototype: Object.getPrototypeOf(EventTarget),
      arrayValues: realmArray.prototype.values,
      document: source,
      ownerDocument: actualOwnerRecord,
      wrapOwner: wrapElement,
      shadowRoot: (node) => shadowRoots.get(node),
      shadowHost: (root) => shadowHosts.get(root),
      isConnected: (node) => isDocumentRecord(treeRoot(node, true)),
      styleScope,
      viewport: mediaViewport,
      elements: (root = source) => descendants(root),
      treeRevision: (root) =>
        root === source || owningRealm(root) === token ? stylesheetDiscoveryRevision : undefined,
      styleRevision: (root) =>
        root === source || owningRealm(root) === token ? computedStyleRevision : undefined,
      focusRevision: readStyleFocusRevision,
      DOMException,
      isXML: options.isXML ?? false,
      statePseudos,
      directionality,
      report: (text, error) => options.reportStyleError?.(text, error),
      reportInvalidImport: (url, base) =>
        options.reportInvalidImport?.(url, base, new TypeError("Invalid URL")),
      baseURL,
      documentEncoding: (node) => documentEncoding(ownerRecord(node)),
      track: trackStylesheet,
      resourcesEnabled: options.loadTextResource !== undefined,
      importCompleted: (owner, kind) => {
        if (!closed)
          Node.prototype.dispatchEvent.call(wrapElement(owner), events.trusted(new Event(kind)));
      },
      writeInlineStyle: (node, value) => {
        setAttributeValue(wrapElement(node), findAttributeNS(node, null, "style"), {
          name: "style",
          value,
        });
      },
      loadImport: async (owner, target, encoding) => {
        const loader = options.loadTextResource;
        if (!loader || closed) return { status: "aborted" };
        const signal = (resourceAbort ??= new AbortController()).signal;
        try {
          const result = await loadTimedTextResource(
            loader,
            {
              kind: "stylesheet",
              fallbackEncoding: encoding,
              url: target,
              referrer: url.href,
              element: wrapElement(owner),
              signal,
            },
            "css",
          );
          if (closed || signal.aborted) return { status: "aborted" };
          return { status: "loaded", ...result };
        } catch (error) {
          if (closed || signal.aborted) return { status: "aborted" };
          options.reportResourceError?.("stylesheet", target, error);
          return { status: "failed" };
        }
      },
    }));
  }
  const timers = createWindowTimers((handler, args) => {
    try {
      if (typeof handler === "function") Reflect.apply(handler, window, args);
      else if (context && options.runScripts === "dangerously")
        evaluateClassicScript({ context, source: String(handler), url: url.href, lineOffset: 0 });
    } catch (cause) {
      if (typeof handler === "function")
        reportCallbackException(handler, cause, reportRuntimeError);
      else reportRuntimeError(cause);
    }
  });
  const events = createEvents(
    // Event timestamps use 100 µs resolution for non-isolated Windows.
    () => relativeHighResolutionTime(windowStarted),
    reportRuntimeError,
    DOMException,
    clickActivation,
    eventAssignedSlot,
    isDefaultPassiveTarget,
    (target) => windowObjects.has(target),
    () => window,
  );
  const {
    Event,
    BeforeUnloadEvent,
    DeviceMotionEvent,
    DeviceMotionEventAcceleration,
    DeviceMotionEventRotationRate,
    DeviceOrientationEvent,
    CustomEvent,
    UIEvent,
    FocusEvent,
    MouseEvent,
    WheelEvent,
    TouchEvent,
    PointerEvent,
    KeyboardEvent,
    MessageEvent,
    CompositionEvent,
    InputEvent,
    CloseEvent,
    TransitionEvent,
    PageTransitionEvent,
    BlobEvent,
    PromiseRejectionEvent,
    EventTarget,
    parent,
  } = events;
  type Handler = (
    this: InstanceType<typeof EventTarget>,
    event: InstanceType<typeof Event>,
  ) => unknown;
  const handlers = createEventHandlers({
    compile(target, type, code) {
      if (!context || options.runScripts !== "dangerously") return null;
      const node = nodeRecord(target)?.node;
      const scopes: object[] = [];
      if (node && tree.isElementNode(node)) {
        const owner = actualOwnerRecord(node);
        if (!documentViews.has(owner)) return null;
        scopes.push(wrap(owner));
        if (node.namespaceURI === html.NS.HTML) {
          const custom = customStates.get(node) ?? constructingCustomElements.get(node);
          if (parserAssociatedTags.has(node.tagName) || custom?.formAssociated) {
            const form =
              node.tagName === "img"
                ? (parserFormOwner(node) ?? implicitFormOwner(node))
                : formOwner(node);
            if (form) scopes.push(wrapElement(form));
          }
        }
        scopes.push(target);
      }
      try {
        return compileEventHandler({
          context,
          source: code,
          url: url.href,
          type,
          isWindowError: type === "error" && target === window,
          scopes,
        });
      } catch (cause) {
        reportRuntimeError(cause);
        return null;
      }
    },
    invokeError(target, handler, event) {
      if (target !== window || !errorEventRecords.has(event)) return handler.call(target, event);
      const { message, filename, lineno, colno, error } = event as ErrorEvent;
      return Reflect.apply(handler, target, [message, filename, lineno, colno, error]) !== true;
    },
  });
  function handlerName(record: Raw.Element, attributeName: string): string | undefined {
    if (record.namespaceURI !== html.NS.HTML && record.namespaceURI !== html.NS.SVG)
      return undefined;
    if (!attributeName.startsWith("on")) return undefined;
    const name = attributeName.slice(2);
    return globalHandlerNames.has(name) ? (legacyEventTypes.get(name) ?? name) : undefined;
  }
  function updateReflectedWindowAttribute(
    record: Raw.Element,
    name: string,
    initialValue?: string,
  ): boolean {
    if (record.namespaceURI !== html.NS.HTML) return false;
    if (record.tagName !== "body" && record.tagName !== "frameset") return false;
    const type = reflectedWindowEvent(name);
    if (!type) return false;
    reflectedWindowAttributes.get(ownerRecord(record))?.(
      type,
      initialValue ?? attribute(record, name),
      initialValue !== undefined,
    );
    return true;
  }

  function initializeHandlers(handle: Element, record: Raw.Element): void {
    if (options.runScripts !== "dangerously") return;
    for (const attr of record.attrs) {
      if (attr.namespace) continue;
      if (updateReflectedWindowAttribute(record, attr.name, attr.value)) continue;
      const name = handlerName(record, attr.name);
      if (!name) continue;
      if (!handlers.has(handle, name)) handlers.attribute(handle, name, attr.value);
    }
  }

  let blobURLs: ReturnType<typeof createBlobURLs> | undefined;
  function blobs() {
    return (blobURLs ??= createBlobURLs(documentOrigin, () => closed));
  }

  let xhrBindings: ReturnType<typeof createXHR<Document>> | undefined;
  function xhr() {
    return (xhrBindings ??= createXHR(events, {
      DOMException,
      handlers,
      baseURL,
      origin: documentOrigin,
      referrer: () => url.href,
      isActive: () => !closed,
      signal: () =>
        closed ? AbortSignal.abort() : (resourceAbort ??= new AbortController()).signal,
      request: options.xhr,
      requestSynchronously: options.xhrSynchronously,
      resourceTime: () => relativeHighResolutionTime(windowStarted),
      recordResourceTiming(url, startTime) {
        if (/^https?:/.test(url)) recordResourceTiming(url, startTime, "xmlhttprequest");
      },
      resolveBlob: (url) => blobs().resolve(url)?.blob ?? null,
      responseBuffer: (bytes) =>
        bytes instanceof realmArrayBuffer ? bytes : copyBytesToWindow(new Uint8Array(bytes)),
      parseJSON: realmJSONParse,
      isDocument(value) {
        if (typeof value !== "object" || value === null) return false;
        const node = nodeRecord(value)?.node;
        return node !== undefined && isDocumentRecord(node);
      },
      serializeDocument(value) {
        if (typeof value !== "object" || value === null) return undefined;
        const node = nodeRecord(value)?.node;
        if (!node || !isDocumentRecord(node)) return undefined;
        const isXML = xmlDocuments.has(node);
        const markup = isXML
          ? serializeXML(node.childNodes)
          : serialize(node, customIsValues && customElementSerialization);
        return { markup, isXML };
      },
      parseDocument({ markup, ...settings }) {
        try {
          const record = parseInertDocument(markup, settings);
          return settings.isXML
            ? new XMLDocument(token, record, settings)
            : new Document(token, record, settings);
        } catch (error) {
          if (!isXMLParseError(error)) throw error;
          return null;
        }
      },
    }));
  }
  function copyBytesToWindow(bytes: Uint8Array): ArrayBuffer {
    const result = new realmArrayBuffer(bytes.length);
    new Uint8Array(result).set(bytes);
    return result;
  }

  let fileReaderClass: ReturnType<typeof createFileReader> | undefined;
  function fileReader() {
    return (fileReaderClass ??= createFileReader({
      events,
      DOMException,
      ProgressEvent: xhr().ProgressEvent,
      queue: (callback) => {
        timers.setTimeout(callback);
      },
      buffer: copyBytesToWindow,
    }));
  }
  let requestClass: typeof Request | undefined;

  function requestConstructor(): typeof Request {
    if (requestClass) return requestClass;
    requestClass = class Request extends globalThis.Request {
      constructor(input: Request | string | URL, init?: RequestInit) {
        super(
          input instanceof globalThis.Request ? input : new URL(String(input), baseURL()),
          init,
        );
        if (this.url.startsWith("blob:")) {
          const captured =
            input instanceof globalThis.Request ? requestBlobs.get(input) : undefined;
          requestBlobs.set(this, captured === undefined ? blobs().resolve(this.url) : captured);
        }
        if (
          init?.body instanceof ReadableStream ||
          (init?.body == null &&
            input instanceof globalThis.Request &&
            streamingRequests.has(input))
        ) {
          streamingRequests.add(this);
        }
      }
      override clone = function (this: Request): Request {
        const copy = globalThis.Request.prototype.clone.call(this);
        Object.setPrototypeOf(copy, Object.getPrototypeOf(this));
        if (streamingRequests.has(this)) streamingRequests.add(copy);
        const blob = requestBlobs.get(this);
        if (blob !== undefined) requestBlobs.set(copy, blob);
        return copy;
      };
    };
    Object.defineProperty(requestClass, "name", { value: "Request", configurable: true });
    return requestClass;
  }

  function fetchResponse(result: Awaited<ReturnType<XHRTransport>>): Response {
    const { url, redirected = false, responseType = "basic", status, statusText, stream } = result;
    const headers = new Headers(result.headers);
    headers.delete("set-cookie");
    headers.delete("set-cookie2");
    const body =
      stream !== undefined ? stream : [204, 205, 304].includes(status) ? null : result.bytes;
    const response =
      status === 0 ? Response.error() : new Response(body, { status, statusText, headers });
    const decorate = (value: Response): Response => {
      Object.defineProperties(value, {
        url: { configurable: true, value: url },
        redirected: { configurable: true, value: redirected },
        type: { configurable: true, value: responseType },
        clone: {
          configurable: true,
          value: function (this: Response) {
            return decorate(Response.prototype.clone.call(this));
          },
        },
      });
      return value;
    };
    return decorate(response);
  }

  async function fetchBody(request: Request, signal: AbortSignal): Promise<Uint8Array | undefined> {
    if (!request.body) return undefined;
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    const abort = () => {
      void reader.cancel(signal.reason).catch(() => {});
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      for (;;) {
        signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        chunks.push(chunk.value);
      }
      signal.throwIfAborted();
      return Buffer.concat(chunks);
    } finally {
      signal.removeEventListener("abort", abort);
      reader.releaseLock();
    }
  }

  async function fetchFromWindow(
    input: Request | string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    if (arguments.length === 0) throw new TypeError("A request input is required");
    const request = new (requestConstructor())(input, init);
    const lifetime = closed
      ? AbortSignal.abort()
      : (resourceAbort ??= new AbortController()).signal;
    const signal = AbortSignal.any([request.signal, lifetime]);
    signal.throwIfAborted();
    const headers: Record<string, string> = {};
    for (const [name, value] of request.headers) {
      if (!isForbiddenRequestHeader(name, value)) headers[name] = value;
    }
    const blob = requestBlobs.get(request);
    if (blob !== undefined) {
      const { part, ...metadata } = blobResource(
        blob && blobs().permits(blob) ? blob.blob : null,
        request.method,
        headers,
      );
      return fetchResponse({
        ...metadata,
        url: request.url,
        bytes: new ArrayBuffer(0),
        stream: part
          .stream()
          .pipeThrough(new TransformStream<Uint8Array, Uint8Array>(), { signal }),
      });
    }
    if (!options.xhr) throw new TypeError("No fetch transport is available");
    const body = streamingRequests.has(request)
      ? (request.body ?? undefined)
      : await fetchBody(request, signal);
    signal.throwIfAborted();
    const result = await options.xhr({
      url: request.url,
      method: request.method,
      headers,
      ...(body === undefined ? {} : { body }),
      origin: documentOrigin(),
      credentials: request.credentials === "include",
      fetchPolicy: {
        mode: request.mode,
        credentials: request.credentials,
        redirect: request.redirect,
      },
      signal,
      onHeaders() {},
      onChunk() {},
    });
    signal.throwIfAborted();
    return fetchResponse(result);
  }

  const token = Symbol();
  realmWrappers.set(token, wrap);
  realmDocuments.set(token, source);
  realmTreeOperations.set(token, {
    enableForeignCapabilities,
    installShadowRoot: (host, fragment, settings) =>
      installShadowRoot(wrapElement(host), host, fragment, settings),
    documentFactory: intrinsicDocumentFactory,
    implementationFactory: (receiver, method, args) => {
      const factory = implementationFactoryDescriptors[method]?.value;
      if (typeof factory !== "function")
        throw new Error("Missing intrinsic DOMImplementation factory");
      return Reflect.apply(factory, receiver, args);
    },
    revision: () => revision,
    invalidateQueryIndices,
    collectionMembersCache,
    observeXPathVersion,
    baseURL,
    documentEncoding,
    initializeCopiedTree,
    nativeHTMLElementPrototype,
    computedStyle: (node, root, pseudo) =>
      pseudo && root
        ? styles().pseudoStyle(node, root, pseudo)
        : styles().computedStyle(node, root),
    templateOwner,
    queueDocumentSelectionChange,
    frameWindow,
    frameSVGDocument,
    focusViewport,
    insert: insertNodeRecord,
    remove: removeNodeRecord,
    replaceChildren,
    attributeMutation: recordAttributeMutation,
    removeAttribute: (owner, attr) => removeAttributeRecord(wrapElement(owner), attr),
    writeAriaAttribute(owner, name, value) {
      const handle = wrapElement(owner);
      const existing = findAttributeNS(owner, null, name);
      if (value === null) removeAttributeRecord(handle, existing);
      else setAttributeValue(handle, existing, { name, value });
    },
    replaceData,
  });
  if (options.frameElement) nodeRecord(options.frameElement);
  let revision = 0;
  // The source document already owns these members; invalidation must release affected entries immediately.
  let documentIdLookups = 0;
  let earlyDocumentId: { id: string; node: WeakRef<Raw.Element>; revision: number } | undefined;
  let documentIdIndex: Map<string, Raw.Element> | undefined;
  let dirtyDocumentIds: Set<string> | undefined;
  let computedStyleRevision = 0;
  let stylesheetDiscoveryRevision = 0;
  let namedRevision = 0;
  let documentNameIndices: WeakMap<Raw.Document, Map<string, Raw.Element[]>> | undefined;
  type QueryIndex = NonNullable<ReturnType<typeof createQueryIndex>>;
  type QueryIndexState =
    | { kind: "pending"; misses: number }
    | { kind: "ready"; index: QueryIndex | null };
  let queryIndices: WeakMap<Raw.ParentNode, QueryIndexState> | undefined;
  let indexedRoots = 0;
  let indexedEntries = 0;
  type QueryVector = readonly Element[] | { records: ElementSequence };
  type QueryResult = {
    byRoot: WeakMap<Raw.ParentNode, { owner: Raw.Document; nodes: QueryVector }>;
    kind: "first" | "all";
    generation: number;
    units: number;
  };
  let queryResults: Map<string, QueryResult> | undefined;
  let queryResultUnits = 0;
  let queryResultCharacters = 0;
  let cachedNodeListFactory: ReturnType<typeof createStaticNodeListFactory> | undefined;
  function reusableQuery(
    root: Raw.ParentNode,
    selector: string,
    kind: "first" | "all",
  ): QueryVector | undefined {
    if (owningRealm(root) !== token) return undefined;
    const result = queryResults?.get(selector);
    if (!result || (kind === "all" && result.kind !== "all") || result.generation !== revision)
      return undefined;
    const entry = result.byRoot.get(root);
    return entry?.owner === ownerRecord(root) ? entry.nodes : undefined;
  }
  function rememberQuery(
    root: Raw.ParentNode,
    selector: string,
    nodes: QueryVector,
    kind: "first" | "all",
    generation: number,
  ): void {
    const size = "records" in nodes ? nodes.records.length : nodes.length;
    if (
      generation !== revision ||
      owningRealm(root) !== token ||
      size > 8192 ||
      !queryDependsOnlyOnTree(selector)
    )
      return;
    const previous = queryResults?.get(selector);
    if (previous) {
      queryResultUnits -= previous.units;
      queryResultCharacters -= selector.length;
    }
    if (
      (queryResults?.size ?? 0) >= 128 ||
      queryResultUnits + size > 8192 ||
      queryResultCharacters + selector.length > 32768
    ) {
      queryResults = undefined;
      queryResultUnits = 0;
      queryResultCharacters = 0;
    }
    (queryResults ??= new Map()).set(selector, {
      byRoot: new WeakMap([[root, { owner: ownerRecord(root), nodes }]]),
      kind,
      generation,
      units: size,
    });
    queryResultUnits += size;
    queryResultCharacters += selector.length;
  }
  function resetQueryIndices(): void {
    queryIndices = undefined;
    indexedRoots = 0;
    indexedEntries = 0;
  }
  let liveMembers: WeakMap<object, Raw.Element[]> | undefined;
  function collectionMembersCache(): WeakMap<object, Raw.Element[]> {
    return (liveMembers ??= new WeakMap());
  }
  function invalidateQueryIndices(): void {
    liveMembers = undefined;
    // Mutation invalidates both derived views; index-budget eviction invalidates indices alone.
    resetQueryIndices();
    queryResults = undefined;
    queryResultUnits = 0;
    queryResultCharacters = 0;
  }
  function advanceRevision({
    namesChanged = true,
    idsChanged = true,
    stylesheetMembershipChanged = true,
    styleChanged = true,
  } = {}): void {
    if (styleChanged) computedStyleRevision++;
    revision++;
    if (stylesheetMembershipChanged) {
      stylesheetDiscoveryRevision++;
      styleBinding?.invalidateSheetMembership();
    }
    if (idsChanged) resetDocumentIds();
    if (namesChanged) {
      namedRevision++;
      documentNameIndices = undefined;
    }
    invalidateQueryIndices();
  }

  function isDocumentNamedElement(node: Raw.Node): node is Raw.Element {
    return (
      tree.isElementNode(node) &&
      node.namespaceURI === html.NS.HTML &&
      /^(?:embed|form|iframe|img|object)$/.test(elementLocalName(node))
    );
  }

  function contributesDocumentName(node: Raw.Node): boolean {
    return (
      isDocumentNamedElement(node) &&
      (Boolean(attribute(node, "name")) ||
        (elementLocalName(node) === "object" && Boolean(attribute(node, "id"))))
    );
  }

  function containsDocumentNames(root: Raw.Node): boolean {
    if (contributesDocumentName(root)) return true;
    if (!("childNodes" in root)) return false;
    // Only the finite inserted/removed subtree is visited, never the destination document.
    for (const node of descendants(root)) if (contributesDocumentName(node)) return true;
    return false;
  }

  function extractName(
    namespace: string | null,
    qualifiedName: string,
    kind: "element" | "attribute",
  ) {
    const colon = qualifiedName.indexOf(":");
    const prefix = colon < 0 ? null : qualifiedName.slice(0, colon);
    const name = qualifiedName.slice(colon + 1);
    const validLocalName = kind === "element" ? validElementName(name) : validAttributeName(name);
    if (!validLocalName || (prefix !== null && (!prefix || /[\0\t\n\f\r />]/u.test(prefix))))
      throw new DOMException(`Invalid ${kind} name: ${qualifiedName}`, "InvalidCharacterError");
    if (prefix !== null && namespace === null)
      throw new DOMException("A prefix requires a namespace", "NamespaceError");
    if (prefix === "xml" && namespace !== html.NS.XML)
      throw new DOMException("The xml prefix requires the XML namespace", "NamespaceError");
    const usesXMLNS = prefix === "xmlns" || qualifiedName === "xmlns";
    if (usesXMLNS !== (namespace === html.NS.XMLNS))
      throw new DOMException("The xmlns name and namespace must agree", "NamespaceError");
    return { name, prefix };
  }

  function enableForeignCapabilities(realm?: symbol): void {
    // Foreign handles and mixed-origin subtrees conservatively retain every fallback path.
    hasFormLifecycleCallbacks = true;
    hasCustomElements = true;
    hasAdditionalDocuments = true;
    hasClonableShadows = true;
    hasShadowRoots = true;
    if (realm !== undefined && realm !== token)
      realmTreeOperations.get(realm)?.enableForeignCapabilities();
  }

  function nodeRecord(node: object) {
    const record = records.get(node);
    if (record && record.realm !== token) enableForeignCapabilities(record.realm);
    return record;
  }

  function raw(node: Node): Raw.Node {
    const record = nodeRecord(node);
    if (!record) throw new TypeError("Expected a Node");
    return record.node;
  }

  type DetachedDocumentSettings = {
    isXML: boolean;
    contentType: string;
    encoding: string;
    url: string;
    lastModifiedMs?: number | undefined;
  };
  let detachedSettings: WeakMap<Raw.Document, DetachedDocumentSettings> | undefined;
  const defaultDetachedSettings: DetachedDocumentSettings = {
    isXML: true,
    contentType: "application/xml",
    encoding: "UTF-8",
    url: "about:blank",
  };

  function creationRealm(node: Raw.Node): symbol {
    const handle = wrappers.get(node);
    return (handle && nodeRecord(handle)?.realm) || creationRealms.get(node) || token;
  }

  function ownerRecord(node: Raw.Node): Raw.Document {
    return hasAdditionalDocuments ? actualOwnerRecord(node) : source;
  }

  function actualOwnerRecord(node: Raw.Node): Raw.Document {
    const root = treeRoot(node, true);
    if (isDocumentRecord(root)) return root;
    return detachedOwners.get(root) ?? realmDocuments.get(creationRealm(root)) ?? source;
  }

  function owningRealm(node: Raw.Node): symbol {
    return documentRealms.get(ownerRecord(node)) ?? token;
  }

  function setOwner(node: Raw.Node, owner: Raw.Document): void {
    if (!exposedTemplateHosts?.has(node) && realmDocuments.get(creationRealm(node)) === owner)
      detachedOwners.delete(node);
    else detachedOwners.set(node, owner);
  }

  function templateOwner(owner: Raw.Document): Raw.Document {
    if (inertTemplateDocuments.has(owner)) return owner;
    const existing = inertTemplateOwners.get(owner);
    if (existing) return existing;
    const realm = documentRealms.get(owner);
    if (realm !== undefined && realm !== token) {
      const resolve = realmTreeOperations.get(realm)?.templateOwner;
      if (resolve) return resolve(owner);
    }
    const isXML = xmlDocuments.has(owner);
    const encoding = detachedSettings?.get(owner)?.encoding ?? options.encoding ?? "UTF-8";
    const inert = tree.createDocument();
    new Document(token, inert, {
      isXML,
      encoding,
      contentType: isXML ? "application/xml" : "text/html",
      url: "about:blank",
    });
    inertTemplateDocuments.add(inert);
    inertTemplateOwners.set(owner, inert);
    return inert;
  }

  function adoptAssociatedSubtrees(
    root: Raw.Node,
    previous: Raw.Document,
    owner: Raw.Document,
  ): void {
    if ((!exposedTemplateHosts && !hasAdoptedStylesheets()) || !("childNodes" in root)) return;
    // A document and its inert template owner preserve constructed sheets across
    // adoption. Independent documents, including ones in the same realm, clear them.
    const keepSheets =
      inertTemplateOwners.get(previous) === owner || inertTemplateOwners.get(owner) === previous;
    const pending: Raw.Node[] = [root];
    // The tree and associated template fragments are disjoint and acyclic.
    while (pending.length) {
      const node = pending.pop();
      if (!node || !("childNodes" in node)) continue;
      const content = templateContent(node);
      if (content && exposedTemplateHosts?.has(content)) {
        setOwner(content, templateOwner(owner));
        pending.push(content);
      }
      const shadow = tree.isElementNode(node) && shadowRoots.get(node);
      if (shadow) {
        if (!keepSheets) clearAdoptedStylesheets(shadow);
        pending.push(shadow);
      }
      for (const child of node.childNodes) pending.push(child);
    }
  }

  function initializeCopiedTree(copy: Raw.Node, owner: Raw.Document): Node {
    const realm = documentRealms.get(owner);
    if (realm !== undefined && realm !== token) {
      const initialize = realmTreeOperations.get(realm)?.initializeCopiedTree;
      if (initialize) return initialize(copy, owner) as Node;
    }
    setOwner(copy, owner);
    const handle = wrap(copy);
    if (hasCustomElements && owner === source) updateCustomSubtree(copy);
    return handle;
  }

  function owned<T extends Node>(node: T, owner: Raw.Document): T {
    if (owner !== source) setOwner(raw(node), owner);
    return node;
  }

  function xmlDocumentFor(node: Raw.Node): boolean {
    return hasAdditionalDocuments ? xmlDocuments.has(actualOwnerRecord(node)) : sourceIsXML;
  }

  function qualifiedElementName(node: Raw.Element): string {
    if (node.namespaceURI !== html.NS.HTML || xmlDocumentFor(node)) return node.tagName;
    return (
      htmlNodeNames.get(node.tagName) ??
      node.tagName.replace(/[a-z]/g, (letter) => letter.toUpperCase())
    );
  }

  function container(node: Node): Raw.ParentNode | null {
    const record = raw(node);
    return "childNodes" in record ? record : null;
  }

  function element(node: Node): Raw.Element {
    const record = nodeRecord(node);
    if (!record) throw new TypeError("Expected a Node");
    if (record.kind !== "element") throw new TypeError("Expected an Element");
    return record.node;
  }

  type SelectorPredicate = (element: Raw.Element) => boolean;
  type SelectorCaches = {
    html: Map<string, SelectorPredicate>;
    xml: Map<string, SelectorPredicate>;
  };
  // Cache predicates, never matching results. Separating namespace modes avoids
  // allocating a prefixed key on every repeated selector call.
  const selectorPredicates: SelectorCaches = { html: new Map(), xml: new Map() };
  const scopedSelectorPredicates = new WeakMap<Raw.Node, SelectorCaches>();

  function selectorPredicate(
    selector: string,
    isXML: boolean,
    scope?: Raw.Node,
  ): SelectorPredicate {
    // Shared entries are exclusively scope-independent, so a hit needs no string
    // classification or receiver-specific cache lookup.
    const sharedCache = isXML ? selectorPredicates.xml : selectorPredicates.html;
    const shared = sharedCache.get(selector);
    if (shared) return shared;
    return compileSelectorPredicate(selector, isXML, scope);
  }

  function compileSelectorPredicate(
    selector: string,
    isXML: boolean,
    scope?: Raw.Node,
  ): SelectorPredicate {
    const dependsOnScope =
      selector.includes("\\") ||
      selector.includes("&") ||
      (selector.includes(":") && /:scope\b/i.test(selector));
    let caches = selectorPredicates;
    if (dependsOnScope && scope) {
      const known = scopedSelectorPredicates.get(scope);
      caches = known ?? { html: new Map(), xml: new Map() };
      if (!known) scopedSelectorPredicates.set(scope, caches);
    }
    const cache = isXML ? caches.xml : caches.html;
    const known = cache.get(selector);
    if (known) return known;
    selector = ownedString(selector);
    const query = selector.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
    let compiled: SelectorPredicate;
    const subject = simpleSubjectAttribute(query);
    if (query === "*") compiled = () => true;
    else if (subject) {
      const { name, attribute: kind } = subject;
      compiled =
        kind === "class"
          ? (node) => hasClass(node, name)
          : (node) => attribute(node, "id") === name;
    } else if (/^[a-zA-Z][\w-]*$/.test(query)) {
      const lower = query.toLowerCase();
      compiled = (node) =>
        elementLocalName(node) === (!isXML && node.namespaceURI === html.NS.HTML ? lower : query);
    } else
      compiled = compileSelector({
        selector,
        isXML,
        statePseudos,
        DOMException,
        ...(dependsOnScope && scope ? { scope } : {}),
      });
    // Untrusted selectors cannot grow retained strings without a fixed bound.
    if (selector.length <= 4096 && (!dependsOnScope || scope)) {
      if (cache.size >= 256) cache.clear();
      cache.set(selector, compiled);
    }
    return compiled;
  }

  function queryCandidates(
    root: Raw.ParentNode,
    selector: string,
  ): readonly Raw.Element[] | undefined {
    // Adoption preserves original wrappers, but the destination owns subsequent invalidation.
    if (owningRealm(root) !== token) return undefined;
    const hints = queryCandidateHints(selector);
    if (!hints) return undefined;
    let state = queryIndices?.get(root);
    if (state?.kind === "ready") return state.index?.select(hints);
    const hasSelectiveIds = hints.every((branch) => branch.some((key) => key.startsWith("id:")));
    if (!state) {
      if (indexedRoots >= 32) resetQueryIndices();
      state = { kind: "pending", misses: 0 };
      (queryIndices ??= new WeakMap()).set(root, state);
      indexedRoots++;
    }
    // Result hits never reach this path. Two misses traverse before bucket construction
    // can be amortized by a third distinct or live query in the same tree generation.
    // ID-constrained branches keep eager lookup, avoiding extra scans in selective mutation bursts.
    if (!hasSelectiveIds && state.misses < 2) {
      queryIndices?.set(root, { kind: "pending", misses: state.misses + 1 });
      return undefined;
    }
    const index = createQueryIndex(descendants(root)) ?? null;
    if (indexedEntries + (index?.entries ?? 0) > 65536) {
      resetQueryIndices();
      indexedRoots = 1;
    }
    (queryIndices ??= new WeakMap()).set(root, { kind: "ready", index });
    indexedEntries += index?.entries ?? 0;
    return index?.select(hints);
  }

  function query(node: Node, selector: string): Element | null {
    const root = container(node);
    let text = String(selector);
    const cached = root && reusableQuery(root, text, "first");
    if (cached) {
      if (!("records" in cached)) return cached[0] ?? null;
      const record = cached.records.at(0);
      return record ? wrapElement(record) : null;
    }
    text = ownedString(text);
    const scope = root && isDocumentRecord(root) ? root.childNodes.find(tree.isElementNode) : root;
    const matches = selectorPredicate(text, xmlDocumentFor(raw(node)), scope ?? undefined);
    if (!root) return null;
    const generation = revision;
    const state = owningRealm(root) === token && queryIndices?.get(root);
    const index = state && state.kind === "ready" ? state.index : undefined;
    const hints = index && queryCandidateHints(text);
    const candidates = hints && index ? index.select(hints) : undefined;
    const simple = !candidates && skipPackedText && simpleSubjectAttribute(text);
    const match = candidates
      ? candidates.find(matches)
      : simple
        ? firstAttributeInOrdinaryTree({
            root,
            name: simple.name,
            kind: simple.attribute,
            skipPackedText,
          })
        : firstQueryDescendant({ root, matches, skipPackedText });
    const result = match ? wrapElement(match) : null;
    rememberQuery(root, text, result ? [result] : [], "first", generation);
    return result;
  }

  function deferredQueryView(members: { records: ElementSequence }): NodeList<Element> {
    return new NodeList(token, {
      length: () => members.records.length,
      at(index) {
        const node = members.records.at(index);
        return node && wrapElement(node);
      },
    });
  }

  function collectAttributeMembers(
    root: Raw.ParentNode,
    attribute: "id" | "class",
    name: string,
    matches: SelectorPredicate,
  ): ElementSequence {
    const sections: { end: number; members: ElementSequence }[] = [];
    let ordinary: Raw.Element[] = [];
    let length = 0;
    function append(members: ElementSequence): void {
      if (members.length) sections.push({ end: (length += members.length), members });
    }
    function enter(parent: Raw.ParentNode, pending: Raw.ChildNode[]): void {
      const packed = packedLeafMatches(parent, attribute, name);
      if (packed) {
        if (ordinary.length) {
          append(ordinary);
          ordinary = [];
        }
        append(packed);
        return;
      }
      const children = parent.childNodes;
      for (let index = children.length - 1; index >= 0; index--) {
        const child = children[index];
        if (child) pending.push(child);
      }
    }
    const pending: Raw.ChildNode[] = [];
    enter(root, pending);
    while (pending.length) {
      const child = pending.pop();
      if (!child || !tree.isElementNode(child)) continue;
      if (matches(child)) ordinary.push(child);
      if (packedLeafText(child) === undefined) enter(child, pending);
    }
    if (!sections.length) return ordinary;
    append(ordinary);
    if (sections.length === 1 && sections[0]) return sections[0].members;
    return {
      length,
      at(index) {
        let start = 0,
          end = sections.length;
        while (start < end) {
          const middle = (start + end) >>> 1;
          const section = sections[middle];
          if (!section) return;
          if (section.end <= index) start = middle + 1;
          else end = middle;
        }
        const section = sections[start];
        return section?.members.at(index - (section.end - section.members.length));
      },
    };
  }

  function queryAll(node: Node, selector: string): NodeList<Element> {
    const root = container(node);
    let text = String(selector);
    const cached = root && reusableQuery(root, text, "all");
    if (cached) {
      if ("records" in cached) return deferredQueryView(cached);
      // This owned target has all observable members on its Window-local prototype; the factory brands its Proxy.
      const target = Object.create(NodeList.prototype) as NodeList<Element>;
      const factory = (cachedNodeListFactory ??= createStaticNodeListFactory({
        register: registerCollectionRecord,
      }));
      return factory({ target, nodes: cached });
    }
    text = ownedString(text);
    const scope = root && isDocumentRecord(root) ? root.childNodes.find(tree.isElementNode) : root;
    const matches = selectorPredicate(text, xmlDocumentFor(raw(node)), scope ?? undefined);
    const generation = revision;
    let result: Element[] = [];
    if (root) {
      const candidates = queryCandidates(root, text);
      if (root === source) {
        // A large snapshot can answer length and key enumeration without allocating every public handle.
        const simple = !candidates && skipPackedText && simpleSubjectAttribute(text);
        const members = candidates
          ? candidates.filter(matches)
          : simple
            ? collectAttributeMembers(root, simple.attribute, simple.name, matches)
            : collectQueryDescendants({ root, matches, wrap: (record) => record, skipPackedText });
        if (members.length >= 128) {
          const vector = { records: members };
          rememberQuery(root, text, vector, "all", generation);
          return deferredQueryView(vector);
        }
        for (let i = 0; i < members.length; i++) {
          const member = members.at(i);
          if (member) result.push(wrapElement(member));
        }
      } else if (candidates) {
        for (const candidate of candidates)
          if (matches(candidate)) result.push(wrapElement(candidate));
      } else result = collectQueryDescendants({ root, matches, wrap: wrapElement, skipPackedText });
      rememberQuery(root, text, result, "all", generation);
    }
    return new NodeList(token, result);
  }

  function createPlainElementHandle<T extends Element>(prototype: T, node: Raw.Element): T {
    // These built-in interfaces carry no instance fields. Branding and handler
    // initialization match the constructor chain and retain the Window's prototype.
    const handle = Object.create(prototype) as T;
    markAsUncloneable(handle);
    records.set(handle, { kind: "element", node, realm: token });
    wrappers.set(node, handle);
    initializeHandlers(handle, node);
    return handle;
  }

  function wrapElement(node: Raw.Element): Element {
    const known = wrappers.get(node);
    if (known) return known as Element;
    const realm = creationRealms.get(node);
    if (realm !== undefined && realm !== token) {
      const foreign = realmWrappers.get(realm);
      if (foreign) return foreign(node) as Element;
    }
    if (node.namespaceURI === html.NS.SVG) return wrapSVGElement(node);
    if (node.namespaceURI !== html.NS.HTML) return new Element(token, node);
    const name = elementLocalName(node);
    if (name === "div") return createPlainElementHandle(HTMLDivElement.prototype, node);
    if (name === "p") return createPlainElementHandle(HTMLParagraphElement.prototype, node);
    if (name === "span") return createPlainElementHandle(HTMLSpanElement.prototype, node);
    if (name === "form") return new HTMLFormElement(token, node);
    if (name === "fieldset") return new HTMLFieldSetElement(token, node);
    if (name === "button") return new HTMLButtonElement(token, node);
    if (name === "input") return new HTMLInputElement(token, node);
    if (name === "textarea") return new HTMLTextAreaElement(token, node);
    if (name === "output") return new HTMLOutputElement(token, node);
    if (name === "select") return new HTMLSelectElement(token, node);
    if (name === "option") return new HTMLOptionElement(token, node);
    if (name === "optgroup") return new HTMLOptGroupElement(token, node);
    if (name === "datalist") return new HTMLDataListElement(token, node);
    if (name === "label") return new HTMLLabelElement(token, node);
    if (name === "legend") return new HTMLLegendElement(token, node);
    if (name === "meter") return new HTMLMeterElement(token, node);
    if (name === "progress") return new HTMLProgressElement(token, node);
    if (name === "img") return new HTMLImageElement(token, node);
    if (name === "canvas") return new HTMLCanvasElement(token, node);
    if (name === "embed") return new HTMLEmbedElement(token, node);
    if (name === "object") return new HTMLObjectElement(token, node);
    if (name === "source") return new HTMLSourceElement(token, node);
    if (name === "audio") return new HTMLAudioElement(token, node);
    if (name === "video") return new HTMLVideoElement(token, node);
    if (name === "track") return new HTMLTrackElement(token, node);
    if (name === "param") return new HTMLParamElement(token, node);
    if (name === "picture") return new HTMLPictureElement(token, node);
    if (name === "a") return new HTMLAnchorElement(token, node);
    if (name === "area") return new HTMLAreaElement(token, node);
    if (name === "map") return new HTMLMapElement(token, node);
    if (name === "script") return new HTMLScriptElement(token, node);
    if (name === "link") return new HTMLLinkElement(token, node);
    if (name === "style") return new HTMLStyleElement(token, node);
    if (name === "html") return new HTMLHtmlElement(token, node);
    if (name === "head") return new HTMLHeadElement(token, node);
    if (name === "base") return new HTMLBaseElement(token, node);
    if (name === "meta") return new HTMLMetaElement(token, node);
    if (name === "ins" || name === "del") return new HTMLModElement(token, node);
    if (name === "data") return new HTMLDataElement(token, node);
    if (name === "time") return new HTMLTimeElement(token, node);
    if (name === "dir") return new HTMLDirectoryElement(token, node);
    if (name === "font") return new HTMLFontElement(token, node);
    if (name === "marquee") return new HTMLMarqueeElement(token, node);
    if (name === "title") return new HTMLTitleElement(token, node);
    if (name === "details") return new HTMLDetailsElement(token, node);
    if (name === "dialog") return new HTMLDialogElement(token, node);
    if (name === "body") return new HTMLBodyElement(token, node);
    if (name === "frameset") return new HTMLFrameSetElement(token, node);
    if (name === "slot") return new HTMLSlotElement(token, node);
    if (name === "template") return new HTMLTemplateElement(token, node);
    if (name === "iframe") return new HTMLIFrameElement(token, node);
    if (name === "frame") return new HTMLFrameElement(token, node);
    switch (name) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        return new HTMLHeadingElement(token, node);
      case "ul":
        return new HTMLUListElement(token, node);
      case "ol":
        return new HTMLOListElement(token, node);
      case "li":
        return new HTMLLIElement(token, node);
      case "dl":
        return new HTMLDListElement(token, node);
      case "menu":
        return new HTMLMenuElement(token, node);
      case "listing":
      case "pre":
      case "xmp":
        return new HTMLPreElement(token, node);
      case "br":
        return new HTMLBRElement(token, node);
      case "hr":
        return new HTMLHRElement(token, node);
      case "blockquote":
      case "q":
        return new HTMLQuoteElement(token, node);
      case "table":
        return new HTMLTableElement(token, node);
      case "caption":
        return new HTMLTableCaptionElement(token, node);
      case "col":
      case "colgroup":
        return new HTMLTableColElement(token, node);
      case "thead":
      case "tbody":
      case "tfoot":
        return new HTMLTableSectionElement(token, node);
      case "tr":
        return new HTMLTableRowElement(token, node);
      case "td":
      case "th":
        return new HTMLTableCellElement(token, node);
      default:
        return genericHTMLNames.has(name) || validCustomName(name)
          ? new HTMLElement(token, node)
          : new HTMLUnknownElement(token, node);
    }
  }

  function wrap(node: Raw.Node): Node {
    const known = wrappers.get(node);
    if (known) return known as Node;
    const realm = creationRealms.get(node);
    if (realm !== undefined && realm !== token) {
      const foreign = realmWrappers.get(realm);
      if (foreign) return foreign(node) as Node;
    }
    if (tree.isElementNode(node)) return wrapElement(node);
    if (tree.isTextNode(node)) return new Text(token, node);
    if (tree.isDocumentTypeNode(node)) return new DocumentType(token, node);
    if (tree.isCommentNode(node)) {
      const special = xmlSpecial(node);
      if (special?.kind === "cdata") return new CDATASection(token, node);
      if (special?.kind === "instruction") return new ProcessingInstruction(token, node);
      return new Comment(token, node);
    }
    if (node.nodeName === "#document-fragment") return new DocumentFragment(token, node);
    return new Node(token, node);
  }

  function isSlotable(node: Raw.Node): node is Slotable {
    return tree.isElementNode(node) || tree.isTextNode(node);
  }

  function isSlot(node: Raw.Node): node is Raw.Element {
    return (
      tree.isElementNode(node) && node.namespaceURI === html.NS.HTML && node.tagName === "slot"
    );
  }

  function slotableName(node: Slotable): string {
    return tree.isElementNode(node) ? (attribute(node, "slot") ?? "") : "";
  }

  function firstNamedSlot(root: Raw.Node, name: string): Raw.Element | undefined {
    if (!("childNodes" in root)) return undefined;
    for (const candidate of descendants(root)) {
      if (isSlot(candidate) && (attribute(candidate, "name") ?? "") === name) return candidate;
    }
    return undefined;
  }

  function assignedSlot(node: Raw.Node): Raw.Element | undefined {
    if (!isSlotable(node)) return undefined;
    const host = node.parentNode;
    if (!host || !tree.isElementNode(host)) return undefined;
    const shadow = shadowRoots.get(host);
    if (!shadow) return undefined;
    if (!manualShadowRoots.has(shadow)) return firstNamedSlot(shadow, slotableName(node));
    const slot = manualSlotFor.get(node);
    return slot && treeRoot(slot) === shadow ? slot : undefined;
  }

  function visibleAssignedSlot(node: Node): HTMLSlotElement | null {
    const slot = assignedSlot(raw(node));
    if (!slot || (wrap(treeRoot(slot)) as ShadowRoot).mode !== "open") return null;
    return wrapElement(slot) as HTMLSlotElement;
  }

  function slotMembers(slot: Raw.Element, fallback: boolean): Slotable[] {
    const root = treeRoot(slot);
    const host = shadowHosts.get(root);
    if (!host) return [];
    const name = attribute(slot, "name") ?? "";
    const assigned = manualShadowRoots.has(root)
      ? [...(manualSlotMembers.get(slot) ?? [])].filter((node) => node.parentNode === host)
      : firstNamedSlot(root, name) === slot
        ? host.childNodes.filter(
            (node): node is Slotable => isSlotable(node) && slotableName(node) === name,
          )
        : [];
    return fallback && !assigned.length ? slot.childNodes.filter(isSlotable) : assigned;
  }

  function signalSlotChange(slot: Raw.Element): void {
    queueAfterObservers(slot, () => {
      const target = wrapElement(slot);
      const EventType = target.ownerDocument?.defaultView?.Event ?? Event;
      target.dispatchEvent(events.trusted(new EventType("slotchange", { bubbles: true })));
    });
  }

  function reconcileSlots(root: Raw.Node): void {
    const host = shadowHosts.get(root);
    if (!host || !("childNodes" in root)) return;
    const previous = assignedSlotSnapshots.get(root);
    const current = new Map<Raw.Element, Slotable[]>();
    const firstByName = new Map<string, Slotable[]>();
    const manual = manualShadowRoots.has(root);
    for (const slot of descendants(root)) {
      if (!isSlot(slot)) continue;
      const members: Slotable[] = manual
        ? [...(manualSlotMembers.get(slot) ?? [])].filter((node) => node.parentNode === host)
        : [];
      current.set(slot, members);
      if (!manual) {
        const name = attribute(slot, "name") ?? "";
        if (!firstByName.has(name)) firstByName.set(name, members);
      }
    }
    if (firstByName.size) {
      for (const child of host.childNodes) {
        if (isSlotable(child)) firstByName.get(slotableName(child))?.push(child);
      }
    }
    assignedSlotSnapshots.set(root, current);
    for (const [slot, members] of current) {
      const old = previous?.get(slot);
      if (
        members.length !== (old?.length ?? 0) ||
        members.some((node, index) => node !== old?.[index])
      )
        signalSlotChange(slot);
    }
    if (previous) {
      for (const [slot, members] of previous) {
        if (members.length && !current.has(slot)) signalSlotChange(slot);
      }
    }
  }

  function updateSlotsAfterChildren(target: Raw.ParentNode): void {
    if (!hasShadowRoots) return;
    const ownedShadow = tree.isElementNode(target) && shadowRoots.get(target);
    if (ownedShadow) reconcileSlots(ownedShadow);
    const root = treeRoot(target);
    if (!shadowHosts.has(root)) return;
    reconcileSlots(root);
    if (isSlot(target) && !assignedSlotSnapshots.get(root)?.get(target)?.length)
      signalSlotChange(target);
  }

  function flattenedSlotMembers(slot: Raw.Element): Slotable[] {
    const pending = slotMembers(slot, true).reverse();
    const result: Slotable[] = [];
    while (pending.length) {
      const node = pending.pop();
      if (!node) break;
      if (!isSlot(node) || !shadowHosts.has(treeRoot(node))) {
        result.push(node);
        continue;
      }
      const nested = slotMembers(node, true);
      for (let index = nested.length - 1; index >= 0; index--) {
        const member = nested[index];
        if (member) pending.push(member);
      }
    }
    return result;
  }

  function isDefaultPassiveTarget(target: object): boolean {
    if (target === window) return true;
    const node = nodeRecord(target)?.node;
    if (!node) return false;
    const owner = ownerRecord(node);
    return (
      node === owner ||
      node === owner.childNodes.find(tree.isElementNode) ||
      node === bodyRecord(owner)
    );
  }

  function eventAssignedSlot(target: object): Node | undefined {
    if (!hasShadowRoots) return undefined;
    const node = nodeRecord(target)?.node;
    const slot = node && assignedSlot(node);
    if (!slot) return undefined;
    for (let current: Raw.Node | null = slot; current; current = treeParent(current, true))
      bindPath(current);
    return wrap(slot);
  }

  function bindPath(node: Raw.Node): void {
    const child = wrap(node);
    const rawParent = "parentNode" in node ? node.parentNode : null;
    if (rawParent) parent.set(child, wrap(rawParent));
    else if (!isDocumentRecord(node)) parent.delete(child);
  }

  let traversalBinding: ReturnType<typeof createTraversal<Node>> | undefined;
  function traversalRoot(root: Node) {
    const record = nodeRecord(root);
    if (!record) throw new TypeError("Expected a Node to traverse");
    const wrapRoot = realmWrappers.get(record.realm);
    if (!wrapRoot) throw new Error("Registered nodes must have a wrapping realm");
    return {
      realm: record.realm,
      raw: record.node,
      wrap: (node: Raw.Node) => wrapRoot(node) as Node,
    };
  }

  function traversalOptions(root: Node, mask: number, filter: IteratorFilter<Node> | null) {
    const record = traversalRoot(root);
    if (filter !== null && typeof filter !== "object" && typeof filter !== "function")
      throw new TypeError("Expected a NodeFilter object");
    return {
      realm: record.realm,
      root: record.raw,
      wrap: record.wrap,
      mask: Number(mask) >>> 0,
      filter,
    };
  }

  function traversal() {
    return (traversalBinding ??= createTraversal<Node>({ DOMException, lookup: traversalRoot }));
  }

  const rangeIndex = () => rangeIndexes.get(token);
  let observerBinding: ReturnType<typeof createMutationObservers<Node, NodeList<Node>>> | undefined;
  function observers() {
    return (observerBinding ??= createMutationObservers({
      raw,
      wrap,
      list: (nodes) => new NodeList(token, nodes.map(wrap)),
      report: reportRuntimeError,
    }));
  }

  function clearRemovedFocus(node: Raw.ChildNode): void {
    if (!tree.isElementNode(node)) return;
    const owner = hasAdditionalDocuments ? ownerRecord(node) : source;
    const focused = focusStates.get(owner)?.element;
    if (!focused) return;
    for (let current: Raw.Node | null = focused; current; current = treeParent(current, true)) {
      if (current !== node) continue;
      focusStates.delete(owner);
      projectedFrameFocus.delete(focused);
      return;
    }
  }

  function clearParserFormOwners(node: Raw.ChildNode): void {
    if (
      !parserFormOwners ||
      !tree.isElementNode(node) ||
      !parserAssociationDocuments.has(ownerRecord(node))
    )
      return;
    function clear(control: Raw.Element): void {
      const owner = parserFormOwners?.get(control);
      if (!owner) return;
      // Parser ownership survives when the form and its control move as a subtree.
      for (let parent: Raw.Node | null = owner; parent; parent = treeParent(parent, false))
        if (parent === node) return;
      parserFormOwners?.delete(control);
    }
    clear(node);
    for (const child of descendants(node)) if (tree.isElementNode(child)) clear(child);
  }

  function transferParserAssociationScope(previous: Raw.Document, destination: Raw.Document): void {
    if (previous !== destination && parserAssociationDocuments.has(previous))
      parserAssociationDocuments.add(destination);
  }

  function disconnect(node: Raw.ChildNode): void {
    clearParserFormOwners(node);
    clearRemovedFocus(node);
    clearRemovedModals(node);
    if (hasAdditionalDocuments) setOwner(node, ownerRecord(node));
    node.parentNode = null;
    disconnectResourcesIn(node);
    const handle = wrappers.get(node);
    if (handle) parent.delete(handle as Node);
  }

  type ReplacementEffects = ReturnType<typeof parseHTMLReplacement>["effects"];

  function invalidateReplacementLookups(
    roots: readonly Raw.ChildNode[],
    checkNames: boolean,
  ): boolean {
    earlyDocumentId = undefined;
    let namesChanged = false;
    const pending: Raw.ChildNode[] = [];
    // The two lookup indexes observe the same finite ordinary subtree. Stop once their work is complete.
    for (let index = roots.length - 1; index >= 0; index--) {
      const root = roots[index];
      if (root && tree.isElementNode(root)) pending.push(root);
    }
    while (pending.length && (documentIdIndex || (checkNames && !namesChanged))) {
      const node = pending.pop();
      if (!node || !tree.isElementNode(node)) continue;
      if (documentIdIndex) invalidateDocumentId(attribute(node, "id"));
      if (checkNames && !namesChanged) namesChanged = contributesDocumentName(node);
      for (let index = node.childNodes.length - 1; index >= 0; index--) {
        const child = node.childNodes[index];
        if (child && tree.isElementNode(child)) pending.push(child);
      }
    }
    return namesChanged;
  }

  // Sheet order depends only on style and link elements in the ordinary tree.
  // Shadow and template contents have separate roots and collection snapshots.
  function containsSheetOwner(root: Raw.ChildNode): boolean {
    if (!tree.isElementNode(root)) return false;
    if (isSheetOwner(root)) return true;
    if (packedLeafText(root) !== undefined || !root.childNodes.length) return false;
    return (
      firstQueryDescendant({
        root,
        matches: isSheetOwner,
        skipPackedText: true,
      }) !== undefined
    );
  }
  function isSheetOwner(node: Raw.Element): boolean {
    return htmlChildNamed(node, "style", "link");
  }

  function replaceChildren(
    target: Raw.ParentNode,
    children: Raw.ChildNode[],
    parsed?: ReplacementEffects,
  ): void {
    const realm = owningRealm(target);
    if (realm !== token) {
      const replace = realmTreeOperations.get(realm)?.replaceChildren;
      if (!replace) throw new Error("A node must have a child mutation realm");
      replace(target, children);
      return;
    }
    const removed = target.childNodes;
    const canReenter = removed.length > 0 && (frameStates.size > 0 || linkRequests !== undefined);
    const reactions = hasCustomElements ? customDisconnectReactions(removed) : undefined;
    for (const child of removed) {
      retainRemovedSubtree(child, target);
      removeFromIterators(token, child);
      rangeIndex()?.removed(target, child, 0);
      disconnect(child);
    }
    target.childNodes = children;
    const sourceChanged = invalidateStyleSource(target);
    rangeIndex()?.inserted(target, 0, children.length);
    const destination =
      (exposedTemplateHosts || hasCustomElements || hasAdoptedStylesheets()) && ownerRecord(target);
    for (const child of children) {
      const previous = destination && ownerRecord(child);
      if (destination && previous && previous !== destination) {
        adoptAssociatedSubtrees(child, previous, destination);
        if (reactions)
          for (const reaction of customAdoptionReactions(child, previous, destination))
            reactions.push(reaction);
      }
      detachedOwners.delete(child);
      child.parentNode = target;
    }
    // Cleanup may reenter lookup; invalidate after the complete replacement tree is established.
    let namesChanged: boolean;
    const effects = canReenter ? undefined : parsed;
    if (effects) {
      if (effects.ids === undefined) resetDocumentIds();
      else for (const id of effects.ids) invalidateDocumentId(id);
      namesChanged = invalidateReplacementLookups(removed, !effects.hasDocumentNames);
      namesChanged ||= effects.hasDocumentNames;
    } else {
      for (const child of removed) invalidateDocumentIdsIn(child);
      for (const child of children) invalidateDocumentIdsIn(child);
      namesChanged = children.some(containsDocumentNames) || removed.some(containsDocumentNames);
    }
    advanceRevision({
      namesChanged,
      stylesheetMembershipChanged:
        !styleBinding ||
        sourceChanged ||
        removed.some(containsSheetOwner) ||
        children.some(containsSheetOwner),
      // Cleanup may have repopulated keys before a foreign rename; only resource-free edits preserve them.
      idsChanged: canReenter,
    });
    if (children.length || removed.length)
      queueMutation({ type: "childList", target, added: children.slice(), removed });
    if (children.length || removed.length) updateSlotsAfterChildren(target);
    if (!effects || effects.hasDetails) reconcileInsertedDetails(children, target);
    if (!effects || effects.hasConnectionEffects || effects.hasDetails)
      finishInsertedContent(children, target);
    else if (tree.isElementNode(target)) activateInsertedScript(target);
    reactions?.forEach((react) => react());
    if (hasFormLifecycleCallbacks) refreshCustomFormLifecycle([target, ...removed]);
    for (const child of children)
      if (hasCustomElements && tree.isElementNode(child) && isDocumentRecord(treeRoot(child, true)))
        updateCustomSubtree(child, true);
  }

  function parseElementMarkup(context: Raw.Element, markup: string) {
    const owner = ownerRecord(context);
    const { fragment, effects } = xmlDocumentFor(context)
      ? {
          fragment: parseXMLFragment({ context, markup, url: url.href, DOMException }),
          effects: undefined,
        }
      : parseHTMLReplacement({
          context,
          markup,
          options: detailsParserOptions(markup, inertParsing),
        });
    setOwner(fragment, owner);
    const realm = documentRealms.get(owner) ?? token;
    // Fresh local records already resolve to this realm. A later transfer stamps
    // their original realm before it moves them to the destination document.
    if (realm !== token) rememberCreationRealm({ root: fragment, realm });
    if (!effects || effects.hasScripts) markScriptsInert(fragment);
    return { fragment, effects };
  }

  function replaceElementMarkup(
    record: Raw.Element,
    fragment: Raw.DocumentFragment,
    effects?: ReplacementEffects,
  ): void {
    const target = templateContent(record) ?? record;
    replaceChildren(target, fragment.childNodes, effects);
    if (
      customDefinitions &&
      target === record &&
      ownerRecord(record) === source &&
      !connected(record)
    )
      for (const child of fragment.childNodes) updateCustomSubtree(child);
  }

  function parseUnsafeMarkup(context: Raw.Element, markup: string) {
    const owner = ownerRecord(context);
    const content = parseOwnedHTMLFragment({
      context,
      markup,
      options: detailsParserOptions(markup, inertParsing),
    });
    setOwner(content, owner);
    const realm = documentRealms.get(owner) ?? token;
    if (realm !== token) rememberCreationRealm({ root: content, realm });
    markScriptsInert(content);
    const shadows = /shadowrootmode/i.test(markup) ? materializeParsedShadows(content) : [];
    return { content, shadows };
  }

  function materializeParsedShadows(root: Raw.ParentNode): Raw.DocumentFragment[] {
    const shadows: Raw.DocumentFragment[] = [];
    const pending = [root];
    while (pending.length) {
      const container = pending.pop();
      if (!container) break;
      for (const node of descendants(container)) {
        if (!tree.isElementNode(node)) continue;
        const nested = templateContent(node);
        if (!nested) continue;
        const shadow = attachParsedShadow(node);
        if (shadow) {
          markScriptsInert(shadow);
          shadows.push(shadow);
        }
        pending.push(nested);
      }
    }
    return shadows;
  }

  function replaceMarkup(record: Raw.Element, value: string): void {
    const markup = String(value);
    const target = record.parentNode;
    if (!target) return;
    if (isDocumentRecord(target))
      throw new DOMException(
        "Cannot replace an element whose parent is a document",
        "NoModificationAllowedError",
      );
    const context = tree.isElementNode(target)
      ? target
      : tree.createElement("body", html.NS.HTML, []);
    const fragment = xmlDocumentFor(record)
      ? parseXMLFragment({ context: target, markup, url: url.href, DOMException })
      : parseOwnedHTMLFragment({
          context,
          markup,
          options: detailsParserOptions(markup, inertParsing),
        });
    markScriptsInert(fragment);
    const index = target.childNodes.indexOf(record);
    if (index < 0) throw new Error("Parent must contain its child's reciprocal edge");
    const realm = owningRealm(target);
    const insert = realm === token ? insertNodeRecord : realmTreeOperations.get(realm)?.insert;
    if (!insert) throw new Error("A node must have an insertion realm");
    insert(target, fragment, target.childNodes[index + 1] ?? null, false, record);
  }

  function detachWithRecord(node: Raw.ChildNode, notify = true): void {
    const target = node.parentNode;
    if (!target) return;
    if (invalidateStyleSource(target)) {
      stylesheetDiscoveryRevision++;
      styleBinding?.invalidateSheetMembership();
    }
    clearParserFormOwners(node);
    clearRemovedModals(node);
    retainRemovedSubtree(node, target);
    clearRemovedFocus(node);
    if (hasAdditionalDocuments) setOwner(node, ownerRecord(node));
    removeFromIterators(token, node);
    const handle = wrappers.get(node);
    if (handle) parent.delete(handle as Node);
    if (!xpathVersions && !mutationObserversActive() && !rangeIndex()) {
      tree.detachNode(node);
      invalidateDocumentIdsIn(node);
      invalidateQueryIndices();
      updateSlotsAfterChildren(target);
      return;
    }
    const index = target.childNodes.indexOf(node);
    rangeIndex()?.removed(target, node, index);
    const previous = target.childNodes[index - 1];
    const next = target.childNodes[index + 1];
    tree.detachNode(node);
    invalidateDocumentIdsIn(node);
    invalidateQueryIndices();
    if (notify)
      queueMutation({
        type: "childList",
        target,
        added: [],
        removed: [node],
        ...(previous ? { previous } : {}),
        ...(next ? { next } : {}),
      });
    updateSlotsAfterChildren(target);
  }

  function wouldCreateCycle(target: Raw.ParentNode, moving: Raw.Node): boolean {
    // Parent and host links form a finite acyclic chain before each insertion.
    for (
      let ancestor: Raw.Node | null = target;
      ancestor;
      ancestor = treeParent(ancestor, true) ?? exposedTemplateHosts?.get(ancestor) ?? null
    ) {
      if (ancestor === moving) return true;
    }
    return false;
  }

  function assertNoCycle(target: Raw.ParentNode, moving: Raw.Node, Exception = DOMException): void {
    if (wouldCreateCycle(target, moving))
      throw new Exception("Cannot insert an ancestor into its descendant", "HierarchyRequestError");
  }

  function insertionPlan(
    target: Raw.ParentNode | null,
    moving: Raw.Node,
    reference: Raw.Node | null,
    isAttribute: boolean,
    Exception: typeof DOMException,
    replacing?: Raw.ChildNode,
  ): { before: Raw.ChildNode | null; added: Raw.ChildNode[] } {
    const isFragment = moving.nodeName === "#document-fragment" && "childNodes" in moving;
    if (!target) throw new Exception("Cannot insert this node here", "HierarchyRequestError");
    assertNoCycle(target, moving, Exception);
    if (replacing && replacing.parentNode !== target)
      throw new Exception("The replaced node is not a child of this node", "NotFoundError");
    if (reference && (!("parentNode" in reference) || reference.parentNode !== target))
      throw new Exception("The reference node is not a child of this node", "NotFoundError");
    if (
      isAttribute ||
      (!isFragment && !("parentNode" in moving)) ||
      (tree.isDocumentTypeNode(moving) && !isDocumentRecord(target))
    )
      throw new Exception("Cannot insert this node here", "HierarchyRequestError");
    const before =
      reference === moving
        ? (target.childNodes[target.childNodes.findIndex((child) => child === moving) + 1] ?? null)
        : reference;
    const added = isFragment ? moving.childNodes.slice() : "parentNode" in moving ? [moving] : [];
    if (isDocumentRecord(target))
      validateDocumentInsertion(target, added, before, Exception, replacing);
    return { before, added };
  }

  function validateDocumentInsertion(
    target: Raw.Document,
    added: Raw.ChildNode[],
    before: Raw.Node | null,
    Exception: typeof DOMException,
    replacing?: Raw.ChildNode,
  ): void {
    const incoming = new Set(added);
    const children = target.childNodes.filter(
      (child) => child !== replacing && !incoming.has(child),
    );
    const index =
      before === null ? children.length : children.findIndex((child) => child === before);
    const ordered = children.slice(0, index).concat(added, children.slice(index));
    validateDocumentChildren(ordered, Exception);
  }

  function validateDocumentChildren(
    children: readonly Raw.ChildNode[],
    Exception: typeof DOMException,
  ): void {
    let hasElement = false;
    let hasDoctype = false;
    for (const child of children) {
      if (tree.isElementNode(child) && !hasElement) hasElement = true;
      else if (tree.isDocumentTypeNode(child) && !hasDoctype && !hasElement) hasDoctype = true;
      else if (!tree.isCommentNode(child) || xmlSpecial(child)?.kind === "cdata")
        throw new Exception("Invalid document children", "HierarchyRequestError");
    }
  }

  function positionPath(node: Raw.Node): Raw.Node[] {
    const path: Raw.Node[] = [];
    for (let ancestor: Raw.Node | null = node; ancestor; ancestor = treeParent(ancestor, false)) {
      path.push(ancestor);
    }
    return path;
  }

  function compareNodePosition(reference: Node, other: Node): number {
    const left = raw(reference);
    const right = nodeRecord(other)?.node;
    if (!right) throw new TypeError("Expected a Node to compare");
    if (reference === other) return 0;

    const {
      DOCUMENT_POSITION_PRECEDING: preceding,
      DOCUMENT_POSITION_FOLLOWING: following,
      DOCUMENT_POSITION_CONTAINS: contains,
      DOCUMENT_POSITION_CONTAINED_BY: contained,
      DOCUMENT_POSITION_DISCONNECTED: disconnected,
      DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: specific,
    } = Node;
    const leftAttr = attrRecords?.get(reference);
    const rightAttr = attrRecords?.get(other);
    const leftOwner = attrOwners?.get(reference);
    const rightOwner = attrOwners?.get(other);

    if (leftAttr && rightAttr && leftOwner && leftOwner === rightOwner) {
      return (
        specific |
        (leftOwner.attrs.indexOf(leftAttr) < leftOwner.attrs.indexOf(rightAttr)
          ? following
          : preceding)
      );
    }

    const leftPath = positionPath(leftOwner ?? left);
    const rightPath = positionPath(rightOwner ?? right);
    const leftRoot = leftPath.at(-1) ?? left;
    const rightRoot = rightPath.at(-1) ?? right;
    if (leftRoot !== rightRoot) {
      const earlier = orderOfDisconnected(leftRoot) < orderOfDisconnected(rightRoot);
      return disconnected | specific | (earlier ? following : preceding);
    }

    while (leftPath.length && rightPath.length && leftPath.at(-1) === rightPath.at(-1)) {
      leftPath.pop();
      rightPath.pop();
    }
    if (!leftPath.length && !rightPath.length)
      return leftAttr ? contains | preceding : contained | following;
    if (!leftPath.length) return leftAttr ? following : contained | following;
    if (!rightPath.length) return rightAttr ? preceding : contains | preceding;

    const leftBranch = leftPath.at(-1);
    const rightBranch = rightPath.at(-1);
    const owner = leftBranch && treeParent(leftBranch, false);
    if (!owner) throw new Error("Diverging branches must have a shared parent");
    for (const child of owner.childNodes) {
      if (child === leftBranch) return following;
      if (child === rightBranch) return preceding;
    }
    throw new Error("Parent must contain a diverging branch");
  }

  function namespaceContext(handle: Node): Raw.Element | null {
    const node = raw(handle);
    if (tree.isElementNode(node)) return node;
    if (isDocumentRecord(node)) return node.childNodes.find(tree.isElementNode) ?? null;
    if (attrRecords?.has(handle)) return attrOwners?.get(handle) ?? null;
    if (tree.isDocumentTypeNode(node)) return null;
    return parentElementRecord(node);
  }

  function parentElementRecord(node: Raw.Node): Raw.Element | null {
    const owner = treeParent(node, false);
    return owner && tree.isElementNode(owner) ? owner : null;
  }

  function locateNamespace(node: Raw.Element | null, prefix: string | null): string | null {
    if (node && prefix === "xml") return html.NS.XML;
    if (node && prefix === "xmlns") return html.NS.XMLNS;
    for (let current = node; current; current = parentElementRecord(current)) {
      if (current.namespaceURI && rawElementPrefix(current) === prefix) return current.namespaceURI;
      const declaration = current.attrs.find(
        (attr) =>
          attr.namespace === html.NS.XMLNS &&
          (prefix === null
            ? !attr.prefix && attr.name === "xmlns"
            : attr.prefix === "xmlns" && attr.name === prefix),
      );
      if (declaration) return declaration.value || null;
    }
    return null;
  }

  function insertHandle(
    target: Raw.ParentNode | null,
    child: Node,
    reference: Raw.Node | null,
  ): void {
    if (nodeRecord(child)?.realm !== token) hasAdditionalDocuments = true;
    const realm = target ? owningRealm(target) : token;
    const insert = realm === token ? insertNodeRecord : realmTreeOperations.get(realm)?.insert;
    if (!insert) throw new Error("A node must have an insertion realm");
    insert(target, raw(child), reference, attrRecords?.has(child) ?? false);
  }

  function convertMutationNodes(
    nodes: readonly (Node | string)[],
    owner: Raw.Document,
  ): Node | null {
    // Web IDL converts every string argument before the DOM algorithm mutates any tree.
    const converted = nodes.map((value) => {
      if (typeof value === "object" && value && records.has(value)) return value;
      if (typeof value === "symbol") throw new TypeError("Cannot convert a Symbol to a string");
      return owned(new Text(String(value)), owner);
    });
    if (!converted.length) return null;
    if (converted.length === 1) return converted[0] ?? null;
    const fragment = owned(new DocumentFragment(), owner);
    const target = container(fragment);
    for (const node of converted) insertHandle(target, node, null);
    return fragment;
  }

  function firstIdReplacement({
    target,
    replacing,
    candidate,
    before,
  }: {
    target: Raw.ParentNode;
    replacing: Raw.ChildNode | undefined;
    candidate: Raw.ChildNode | undefined;
    before: Raw.Node | null;
  }):
    | { index: Map<string, Raw.Element>; id: string; node: Raw.Element; generation: number }
    | undefined {
    const index = documentIdIndex;
    if (
      !index ||
      frameStates.size ||
      linkRequests ||
      hasCustomElements ||
      !replacing ||
      replacing.parentNode !== target ||
      !tree.isElementNode(replacing) ||
      !candidate ||
      candidate.parentNode ||
      !tree.isElementNode(candidate) ||
      ownerRecord(candidate) !== source
    )
      return;
    const id = attribute(replacing, "id");
    if (!id || index.get(id) !== replacing || attribute(candidate, "id") !== id) return;
    const children = target.childNodes;
    if ((children[children.indexOf(replacing) + 1] ?? null) !== before) return;
    return { index, id, node: candidate, generation: revision };
  }

  function insertNodeRecord(
    target: Raw.ParentNode | null,
    moving: Raw.Node,
    referenceNode: Raw.Node | null,
    isAttribute: boolean,
    replacing?: Raw.ChildNode,
  ): void {
    const { before, added } = insertionPlan(
      target,
      moving,
      referenceNode,
      isAttribute,
      DOMException,
      replacing,
    );
    if (!target || (!added.length && !replacing)) return;
    const indexedReplacement =
      added.length === 1 && moving === added[0]
        ? firstIdReplacement({ target, replacing, candidate: added[0], before })
        : undefined;
    const reactions: (() => void)[] | undefined = hasCustomElements ? [] : undefined;
    const lifecycleRoots = hasFormLifecycleCallbacks
      ? added.map((member) => treeRoot(member, true))
      : undefined;
    if (added.length && moving.nodeName === "#document-fragment" && "childNodes" in moving)
      replaceChildren(moving, []);
    const destination =
      (exposedTemplateHosts || hasCustomElements || hasAdoptedStylesheets()) && ownerRecord(target);
    for (const member of added) {
      const previousOwner = ownerRecord(member);
      if (parserFormOwners) transferParserAssociationScope(previousOwner, ownerRecord(target));
      const priorRealm = documentRealms.get(previousOwner) ?? token;
      if (priorRealm !== token) {
        realmTreeOperations.get(priorRealm)?.invalidateQueryIndices();
        hasAdditionalDocuments = true;
        rememberCreationRealm({
          root: member,
          realm: creationRealm(member) === token ? priorRealm : creationRealm(member),
          isForeignTransfer: true,
        });
        if (member.parentNode) realmTreeOperations.get(priorRealm)?.remove(member);
      } else if (member.parentNode) {
        if (reactions)
          for (const reaction of customDisconnectReactions([member])) reactions.push(reaction);
        detachWithRecord(member);
        disconnectResourcesIn(member);
      }
      if (destination && previousOwner !== destination) {
        adoptAssociatedSubtrees(member, previousOwner, destination);
        if (reactions)
          for (const reaction of customAdoptionReactions(member, previousOwner, destination))
            reactions.push(reaction);
      }
      detachedOwners.delete(member);
    }

    const removed = replacing?.parentNode === target ? [replacing] : [];
    if (replacing && removed.length) {
      if (reactions)
        for (const reaction of customDisconnectReactions([replacing])) reactions.push(reaction);
      detachWithRecord(replacing, false);
      disconnectResourcesIn(replacing);
    }
    const index =
      before && "parentNode" in before
        ? target.childNodes.indexOf(before)
        : target.childNodes.length;
    const previous = target.childNodes[index - 1];
    rangeIndex()?.inserted(target, index, added.length);
    if (before && "parentNode" in before) {
      for (const member of added) tree.insertBefore(target, member, before);
    } else {
      for (const member of added) tree.appendChild(target, member);
    }
    const sourceChanged = invalidateStyleSource(target);
    for (const child of added) invalidateDocumentIdsIn(child);
    // The old first member and its replacement occupied the same slot. A reentrant
    // edit or an index eviction invalidates that proof before it can be published.
    if (
      indexedReplacement &&
      indexedReplacement.generation === revision &&
      indexedReplacement.index === documentIdIndex
    ) {
      indexedReplacement.index.set(indexedReplacement.id, indexedReplacement.node);
      dirtyDocumentIds?.delete(indexedReplacement.id);
    }
    advanceRevision({
      namesChanged: added.some(containsDocumentNames) || removed.some(containsDocumentNames),
      stylesheetMembershipChanged:
        !styleBinding ||
        sourceChanged ||
        added.some(containsSheetOwner) ||
        removed.some(containsSheetOwner),
      idsChanged: false,
    });
    queueMutation({
      type: "childList",
      target,
      added,
      removed,
      ...(previous ? { previous } : {}),
      ...(before && "parentNode" in before ? { next: before } : {}),
    });
    updateSlotsAfterChildren(target);
    reconcileInsertedDetails(added, target);
    finishInsertedContent(added, target);
    reactions?.forEach((react) => react());
    if (lifecycleRoots) refreshCustomFormLifecycle([target, ...lifecycleRoots, ...removed]);
    for (const member of added)
      if (
        hasCustomElements &&
        tree.isElementNode(member) &&
        isDocumentRecord(treeRoot(member, true))
      )
        updateCustomSubtree(member, true);
  }

  function removeNodeRecord(node: Raw.ChildNode): void {
    const formerParent = hasFormLifecycleCallbacks && node.parentNode;
    const reactions = hasCustomElements ? customDisconnectReactions([node]) : undefined;
    detachWithRecord(node);
    disconnectResourcesIn(node);
    advanceRevision({
      namesChanged: containsDocumentNames(node),
      idsChanged: false,
      stylesheetMembershipChanged: !styleBinding || containsSheetOwner(node),
    });
    reactions?.forEach((react) => react());
    if (formerParent) refreshCustomFormLifecycle([formerParent, node]);
  }

  class Node extends EventTarget {
    declare static readonly ELEMENT_NODE: 1;
    declare static readonly ATTRIBUTE_NODE: 2;
    declare static readonly TEXT_NODE: 3;
    declare static readonly CDATA_SECTION_NODE: 4;
    declare static readonly ENTITY_REFERENCE_NODE: 5;
    declare static readonly ENTITY_NODE: 6;
    declare static readonly PROCESSING_INSTRUCTION_NODE: 7;
    declare static readonly COMMENT_NODE: 8;
    declare static readonly DOCUMENT_NODE: 9;
    declare static readonly DOCUMENT_TYPE_NODE: 10;
    declare static readonly DOCUMENT_FRAGMENT_NODE: 11;
    declare static readonly NOTATION_NODE: 12;
    declare static readonly DOCUMENT_POSITION_DISCONNECTED: 1;
    declare static readonly DOCUMENT_POSITION_PRECEDING: 2;
    declare static readonly DOCUMENT_POSITION_FOLLOWING: 4;
    declare static readonly DOCUMENT_POSITION_CONTAINS: 8;
    declare static readonly DOCUMENT_POSITION_CONTAINED_BY: 16;
    declare static readonly DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32;
    declare readonly ELEMENT_NODE: 1;
    declare readonly ATTRIBUTE_NODE: 2;
    declare readonly TEXT_NODE: 3;
    declare readonly CDATA_SECTION_NODE: 4;
    declare readonly ENTITY_REFERENCE_NODE: 5;
    declare readonly ENTITY_NODE: 6;
    declare readonly PROCESSING_INSTRUCTION_NODE: 7;
    declare readonly COMMENT_NODE: 8;
    declare readonly DOCUMENT_NODE: 9;
    declare readonly DOCUMENT_TYPE_NODE: 10;
    declare readonly DOCUMENT_FRAGMENT_NODE: 11;
    declare readonly NOTATION_NODE: 12;
    declare readonly DOCUMENT_POSITION_DISCONNECTED: 1;
    declare readonly DOCUMENT_POSITION_PRECEDING: 2;
    declare readonly DOCUMENT_POSITION_FOLLOWING: 4;
    declare readonly DOCUMENT_POSITION_CONTAINS: 8;
    declare readonly DOCUMENT_POSITION_CONTAINED_BY: 16;
    declare readonly DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32;
    static {
      installInterfaceTable(this, nodeConstantDescriptors);
      installInterfaceTable(this.prototype, nodeConstantDescriptors);
    }

    constructor(key: symbol, record: Raw.Node, wrapHandle?: (target: Node) => Node) {
      super();
      if (key !== token) throw new TypeError("Illegal constructor");
      // Proxy-backed wrappers already fail native structured serialization.
      if (!wrapHandle) markAsUncloneable(this);
      const handle = wrapHandle ? wrapHandle(this) : this;
      records.set(
        handle,
        tree.isElementNode(record)
          ? { kind: "element", node: record, realm: token }
          : { kind: "other", node: record, realm: token },
      );
      wrappers.set(record, handle);
      return handle;
    }

    cloneNode(deep = false): this {
      const node = raw(this);
      if (shadowHosts.has(node))
        throw new DOMException("Cannot clone a shadow root", "NotSupportedError");
      const attr = attrRecords?.get(this);
      const owner = ownerRecord(node);
      if (attr) {
        const cloned: Node = owned(wrapAttribute({ ...attr }), owner);
        return cloned as this;
      }
      const copy = cloneRawTree(
        node,
        Boolean(deep),
        hasClonableShadows ? cloneShadowTree : undefined,
      );
      if (isDocumentRecord(copy)) {
        if (declarativeShadowDocuments.has(owner)) declarativeShadowDocuments.add(copy);
        const settings = detachedSettings?.get(owner) ?? {
          isXML: options.isXML ?? false,
          contentType: options.contentType ?? "text/html",
          encoding: options.encoding ?? "UTF-8",
          url: url.href,
        };
        const cloned: Node =
          this instanceof XMLDocument
            ? new XMLDocument(token, copy, settings)
            : new Document(token, copy, settings);
        return cloned as this;
      }
      return initializeCopiedTree(copy, owner) as this;
    }

    isEqualNode(other: Node | null = null): boolean {
      const node = raw(this);
      if (other == null) return false;
      const peer = nodeRecord(other)?.node;
      if (!peer) throw new TypeError("Expected a Node to compare");
      const a = attrRecords?.get(this);
      const b = attrRecords?.get(other);
      if (a || b) return Boolean(a && b && equalAttribute(a, b));
      return equalRawTree(node, peer);
    }
    isSameNode(other: Node | null = null): boolean {
      raw(this);
      if (other != null && !records.has(other)) throw new TypeError("Expected a Node to compare");
      return this === other;
    }
    lookupNamespaceURI(prefix: string | null): string | null {
      if (arguments.length < 1) throw new TypeError("A prefix is required");
      return locateNamespace(
        namespaceContext(this),
        prefix == null ? null : String(prefix) || null,
      );
    }
    lookupPrefix(namespace: string | null): string | null {
      if (arguments.length < 1) throw new TypeError("A namespace is required");
      const target = nullableNamespace(namespace);
      if (target === null) return null;
      for (let node = namespaceContext(this); node; node = parentElementRecord(node)) {
        const prefix = rawElementPrefix(node);
        if (node.namespaceURI === target && prefix !== null) return prefix;
        const declaration = node.attrs.find(
          (attr) =>
            attr.namespace === html.NS.XMLNS && attr.prefix === "xmlns" && attr.value === target,
        );
        if (declaration) return declaration.name;
      }
      return null;
    }
    isDefaultNamespace(namespace: string | null): boolean {
      if (arguments.length < 1) throw new TypeError("A namespace is required");
      return locateNamespace(namespaceContext(this), null) === nullableNamespace(namespace);
    }
    compareDocumentPosition(other: Node): number {
      return compareNodePosition(this, other);
    }
    contains(other: Node | null = null): boolean {
      const node = raw(this);
      if (other == null) return false;
      const peer = nodeRecord(other)?.node;
      if (!peer) throw new TypeError("Expected a Node to compare");
      for (let current: Raw.Node | null = peer; current; current = treeParent(current, false)) {
        if (current === node) return true;
      }
      return false;
    }
    hasChildNodes(): boolean {
      return (container(this)?.childNodes.length ?? 0) > 0;
    }
    get parentElement(): Element | null {
      const owner = treeParent(raw(this), false);
      return owner && tree.isElementNode(owner) ? wrapElement(owner) : null;
    }

    get nodeName(): string {
      const entry = nodeRecord(this);
      if (!entry) throw new TypeError("Expected a Node");
      if (entry.kind === "element") return qualifiedElementName(entry.node);
      const record = entry.node;
      const attribute = attrRecords?.get(this);
      if (attribute) return qualifiedAttributeName(attribute);
      if (tree.isDocumentTypeNode(record)) return record.name;
      const special = tree.isCommentNode(record) ? xmlSpecial(record) : undefined;
      if (special?.kind === "cdata") return "#cdata-section";
      if (special?.kind === "instruction") return special.target;
      return record.nodeName;
    }

    get nodeType(): number {
      const record = raw(this);
      if (tree.isElementNode(record)) return 1;
      if (tree.isTextNode(record)) return 3;
      if (attrRecords?.has(this)) return 2;
      if (tree.isCommentNode(record)) {
        const special = xmlSpecial(record);
        return special?.kind === "cdata" ? 4 : special?.kind === "instruction" ? 7 : 8;
      }
      if (tree.isDocumentTypeNode(record)) return 10;
      return record.nodeName === "#document" ? 9 : 11;
    }

    get baseURI(): string {
      const node = raw(this);
      return baseURL(ownerRecord(attrOwners?.get(this) ?? node));
    }

    get ownerDocument(): Document | null {
      const node = raw(this);
      if (isDocumentRecord(node)) return null;
      const attrOwner = attrOwners?.get(this);
      const owner = ownerRecord(attrOwner ?? node);
      return owner === source ? document : (wrap(owner) as Document);
    }
    get parentNode(): Node | null {
      const record = raw(this);
      return "parentNode" in record && record.parentNode ? wrap(record.parentNode) : null;
    }
    get childNodes(): NodeList<Node> {
      let list = childLists.get(this);
      if (!list) {
        const owner = container(this);
        list = new NodeList(token, {
          length: () => owner?.childNodes.length ?? 0,
          at(index) {
            const child = owner?.childNodes[index];
            return child ? wrap(child) : undefined;
          },
        });
        childLists.set(this, list);
      }
      return list;
    }
    get isConnected(): boolean {
      return isDocumentRecord(treeRoot(raw(this), true));
    }
    getRootNode(options?: { composed?: boolean }): Node {
      return wrap(treeRoot(raw(this), options?.composed));
    }
    get lastChild(): Node | null {
      const child = container(this)?.childNodes.at(-1);
      return child ? wrap(child) : null;
    }
    get nextSibling(): Node | null {
      const record = raw(this);
      if (!("parentNode" in record) || !record.parentNode) return null;
      const siblings = record.parentNode.childNodes;
      const index = siblings.indexOf(record);
      const sibling = siblings[index + 1];
      return sibling ? wrap(sibling) : null;
    }
    get previousSibling(): Node | null {
      const record = raw(this);
      if (!("parentNode" in record) || !record.parentNode) return null;
      const siblings = record.parentNode.childNodes;
      const sibling = siblings[siblings.indexOf(record) - 1];
      return sibling ? wrap(sibling) : null;
    }
    get firstChild(): Node | null {
      const first = container(this)?.childNodes[0];
      return first ? wrap(first) : null;
    }

    get nodeValue(): string | null {
      const record = raw(this);
      return isCharacterData(record) ? dataOf(record) : null;
    }
    set nodeValue(value: string | null) {
      const record = raw(this);
      if (isCharacterData(record))
        replaceData(record, 0, dataOf(record).length, value == null ? "" : String(value));
    }
    get textContent(): string | null {
      const record = raw(this);
      if (tree.isTextNode(record)) return record.value;
      if (tree.isCommentNode(record)) return record.data;
      if (tree.isDocumentTypeNode(record) || isDocumentRecord(record) || !("childNodes" in record))
        return null;
      return descendantTextContent(record);
    }
    set textContent(value: string | null) {
      const record = raw(this);
      const text = value == null ? "" : String(value);
      if (isCharacterData(record)) {
        replaceData(record, 0, dataOf(record).length, text);
      } else if (!isDocumentRecord(record) && "childNodes" in record) {
        const children: Raw.ChildNode[] = text
          ? [{ nodeName: "#text", value: text, parentNode: record }]
          : [];
        replaceChildren(record, children);
      }
    }

    normalize(): void {
      const root = container(this);
      if (!root) return;
      for (const node of descendants(root)) {
        if (tree.isTextNode(node) && node.parentNode) normalizeText(node, node.parentNode);
      }
    }

    append(...nodes: (Node | string)[]): void {
      const target = container(this);
      if (!target) throw new DOMException("Cannot insert this node here", "HierarchyRequestError");
      const moving = convertMutationNodes(nodes, ownerRecord(target));
      if (moving) insertHandle(target, moving, null);
    }

    prepend(...nodes: (Node | string)[]): void {
      const target = container(this);
      if (!target) throw new DOMException("Cannot insert this node here", "HierarchyRequestError");
      const moving = convertMutationNodes(nodes, ownerRecord(target));
      if (moving) insertHandle(target, moving, target.childNodes[0] ?? null);
    }

    replaceChildren(...nodes: (Node | string)[]): void {
      const target = container(this);
      if (!target) throw new DOMException("Cannot replace these children", "HierarchyRequestError");
      const moving = convertMutationNodes(nodes, ownerRecord(target));
      const record = moving && raw(moving);
      if (record) {
        if (
          attrRecords?.has(moving) ||
          isDocumentRecord(record) ||
          (tree.isDocumentTypeNode(record) && !isDocumentRecord(target))
        )
          throw new DOMException("Cannot insert this node here", "HierarchyRequestError");
        assertNoCycle(target, record);
      }
      const children = !record
        ? []
        : record.nodeName === "#document-fragment" && "childNodes" in record
          ? record.childNodes.slice()
          : "parentNode" in record
            ? [record]
            : [];
      if (isDocumentRecord(target)) validateDocumentChildren(children, DOMException);
      for (const child of children) {
        if (!child.parentNode || child.parentNode === target) continue;
        const realm = owningRealm(child);
        if (realm === token) removeNodeRecord(child);
        else realmTreeOperations.get(realm)?.remove(child);
      }
      replaceChildren(target, children);
    }

    appendChild<T extends Node>(child: T): T {
      insertHandle(container(this), child, null);
      return child;
    }

    insertBefore<T extends Node>(child: T, reference: Node | null | undefined): T {
      if (arguments.length < 2) throw new TypeError("Expected a child and a reference");
      insertHandle(container(this), child, reference == null ? null : raw(reference));
      return child;
    }

    replaceChild<T extends Node>(child: Node, oldChild: T): T {
      if (arguments.length < 2) throw new TypeError("Expected a replacement and an existing child");
      const target = container(this);
      const moving = raw(child);
      const replaced = raw(oldChild);
      if (!target) throw new DOMException("Cannot replace a child here", "HierarchyRequestError");
      assertNoCycle(target, moving);
      if (!("parentNode" in replaced) || replaced.parentNode !== target) {
        throw new DOMException("The replaced node is not a child of this node", "NotFoundError");
      }
      const before = target.childNodes[target.childNodes.indexOf(replaced) + 1] ?? null;
      if (nodeRecord(child)?.realm !== token) hasAdditionalDocuments = true;
      const realm = owningRealm(target);
      const insert = realm === token ? insertNodeRecord : realmTreeOperations.get(realm)?.insert;
      if (!insert) throw new Error("A node must have an insertion realm");
      insert(target, moving, before, attrRecords?.has(child) ?? false, replaced);
      return oldChild;
    }

    removeChild<T extends Node>(child: T): T {
      const record = raw(child);
      if (!("parentNode" in record) || record.parentNode !== raw(this))
        throw new DOMException("The node is not a child of this node", "NotFoundError");
      const realm = owningRealm(record);
      const remove = realm === token ? removeNodeRecord : realmTreeOperations.get(realm)?.remove;
      if (!remove) throw new Error("A node must have a removal realm");
      remove(record);
      return child;
    }

    override dispatchEvent(event: InstanceType<typeof Event>): boolean {
      const type = event.type;
      if (type === "click" || type === "mousedown" || type === "pointerdown" || type === "keydown")
        noteFocusInput(raw(this), event);
      // Only dispatch needs wrappers for ancestors; parsing never allocates them.
      const related = events.relatedTargetOf(event);
      const relatedRecord = related && nodeRecord(related);
      if (relatedRecord) {
        for (
          let current: Raw.Node | null = relatedRecord.node;
          current;
          current = treeParent(current, true)
        )
          bindPath(current);
      }
      for (
        let current: Raw.Node | null = raw(this);
        current;
        current = treeParent(current, event.composed || Boolean(relatedRecord))
      ) {
        bindPath(current);
      }
      return super.dispatchEvent(event);
    }
  }

  type Members<T> = CollectionMembers<T>;
  const childLists = new WeakMap<Node, NodeList<Node>>();
  const elementLists = new WeakMap<Node, HTMLCollection>();

  function collectionNames(candidate: Node): string[] {
    const record = raw(candidate);
    if (!tree.isElementNode(record)) return [];
    const id = attribute(record, "id");
    const name = record.namespaceURI === html.NS.HTML ? attribute(record, "name") : null;
    return [id, name].filter((value): value is string => Boolean(value));
  }

  function* collectionEntries<T extends Node>(members: Members<T>): Generator<T> {
    const length = members.length();
    for (let index = 0; index < length; index++) {
      const member = members.at(index);
      if (member !== undefined) yield member;
    }
  }

  function namedMember<T extends Node>(members: Members<T>, key: string): T | undefined {
    if (!key) return undefined;
    for (const candidate of collectionEntries(members)) {
      if (collectionNames(candidate).includes(key)) return candidate;
    }
    return undefined;
  }

  function collectionMembers<T extends Node>(
    receiver: object,
    kind: "nodes" | "elements",
  ): Members<T> {
    const record = collectionRecords.get(receiver);
    if (!record || record.kind !== kind) throw new TypeError("Illegal invocation");
    // Only collectionView writes these slots, with typed Node members from its owning Window.
    return record.members as Members<T>;
  }

  function collectionView<Target extends object, Member extends Node>(input: {
    target: Target;
    kind: "nodes" | "elements";
    members: readonly Member[] | Members<Member>;
    lookupName?: ((name: string) => Node | RadioNodeList | undefined) | undefined;
    setIndex?: ((index: number, value: unknown) => void) | undefined;
  }): Target {
    const { target, kind, lookupName, setIndex } = input;
    const snapshot = input.members as readonly Member[];
    const members =
      typeof input.members.length === "function"
        ? (input.members as Members<Member>)
        : { length: () => snapshot.length, at: (index: number) => snapshot[index] };
    const visibleName = (owner: Target, property: PropertyKey): Node | RadioNodeList | undefined =>
      kind === "elements" &&
      typeof property === "string" &&
      indexedProperty(property) === undefined &&
      !Reflect.has(owner, property)
        ? lookupName
          ? lookupName(property)
          : namedMember(members, property)
        : undefined;
    const proxy = new Proxy(target, {
      set(owner, property, value, receiver) {
        const index = indexedProperty(property);
        if (index === undefined) return Reflect.set(owner, property, value, receiver);
        if (!setIndex) return false;
        setIndex(index, value);
        return true;
      },
      get(owner, property, receiver): unknown {
        const index = indexedProperty(property);
        if (index !== undefined && index < members.length()) return members.at(index);
        return visibleName(owner, property) ?? Reflect.get(owner, property, receiver);
      },
      has(owner, property) {
        const index = indexedProperty(property);
        return (
          (index !== undefined && index < members.length()) ||
          Reflect.has(owner, property) ||
          visibleName(owner, property) !== undefined
        );
      },
      ownKeys(owner) {
        const keys: string[] = Array.from({ length: members.length() }, (_, index) =>
          String(index),
        );
        if (kind === "elements") {
          const names = new Set<string>();
          for (const candidate of collectionEntries(members))
            for (const name of collectionNames(candidate))
              if (indexedProperty(name) === undefined && !Reflect.has(owner, name)) names.add(name);
          keys.push(...names);
        }
        return [...keys, ...Reflect.ownKeys(owner)];
      },
      getOwnPropertyDescriptor(owner, property) {
        const index = indexedProperty(property);
        if (index === undefined) {
          const value = visibleName(owner, property);
          return value === undefined
            ? Reflect.getOwnPropertyDescriptor(owner, property)
            : { value, writable: false, enumerable: Boolean(setIndex), configurable: true };
        }
        const value = members.at(index);
        return value === undefined
          ? Reflect.getOwnPropertyDescriptor(owner, property)
          : { value, writable: Boolean(setIndex), enumerable: true, configurable: true };
      },
      defineProperty(owner, property, descriptor) {
        if (indexedProperty(property) !== undefined || visibleName(owner, property) !== undefined)
          return false;
        return Reflect.defineProperty(owner, property, descriptor);
      },
      deleteProperty(owner, property) {
        const index = indexedProperty(property);
        if (
          (index !== undefined && index < members.length()) ||
          visibleName(owner, property) !== undefined
        )
          return false;
        return Reflect.deleteProperty(owner, property);
      },
      preventExtensions: () => false,
    });
    collectionRecords.set(proxy, { kind, members });
    return proxy;
  }

  class NodeList<T extends Node> {
    readonly [index: number]: T | undefined;
    constructor(key: symbol, members: readonly T[] | Members<T>) {
      if (key !== token) throw new TypeError("Illegal constructor");
      return collectionView({ target: this, kind: "nodes", members });
    }
    get length(): number {
      return collectionMembers<T>(this, "nodes").length();
    }
    item(index: number): T | null {
      const members = collectionMembers<T>(this, "nodes");
      if (!arguments.length) throw new TypeError("An index is required");
      return members.at(+index >>> 0) ?? null;
    }
    declare keys: () => IterableIterator<number>;
    declare values: () => IterableIterator<T>;
    declare entries: () => IterableIterator<[number, T]>;
    declare forEach: (
      callback: (value: T, index: number, list: this) => void,
      receiver?: unknown,
    ) => void;
    declare [Symbol.iterator]: () => IterableIterator<T>;
    get [Symbol.toStringTag](): string {
      return "NodeList";
    }
  }

  class HTMLCollection<Named extends Element | RadioNodeList = Element> {
    readonly [index: number]: Element | undefined;
    constructor(
      key: symbol,
      members: readonly Element[] | Members<Element>,
      lookupName?: (name: string) => Node | RadioNodeList | undefined,
      setIndex?: (index: number, value: unknown) => void,
    ) {
      if (key !== token) throw new TypeError("Illegal constructor");
      return collectionView({ target: this, kind: "elements", members, lookupName, setIndex });
    }
    static {
      for (const name of ["length", "item", "namedItem"])
        Object.defineProperty(this.prototype, name, { enumerable: true });
    }
    get length(): number {
      return collectionMembers<Element>(this, "elements").length();
    }
    item(index: number): Element | null {
      const members = collectionMembers<Element>(this, "elements");
      if (!arguments.length) throw new TypeError("An index is required");
      return members.at(+index >>> 0) ?? null;
    }
    namedItem(name: string): Named | null {
      const members = collectionMembers<Element>(this, "elements");
      if (arguments.length < 1) throw new TypeError("A name is required");
      return (namedMember(members, String(name)) as Named | undefined) ?? null;
    }
    declare [Symbol.iterator]: () => IterableIterator<Element>;
    get [Symbol.toStringTag](): string {
      return "HTMLCollection";
    }
  }

  function installCollectionIterators(prototype: typeof Array.prototype): void {
    for (const name of ["keys", "values", "entries", "forEach"] as const)
      Object.defineProperty(NodeList.prototype, name, {
        value: prototype[name],
        writable: true,
        enumerable: true,
        configurable: true,
      });
    for (const owner of [NodeList.prototype, HTMLCollection.prototype])
      Object.defineProperty(owner, Symbol.iterator, {
        value: prototype.values,
        writable: true,
        configurable: true,
      });
  }
  installCollectionIterators(Array.prototype);
  for (const owner of [NodeList.prototype, HTMLCollection.prototype]) {
    for (const name of ["length", "item"]) Object.defineProperty(owner, name, { enumerable: true });
  }

  function descendantMembers(
    root: Raw.ParentNode,
    matches: (node: Raw.Element) => boolean,
  ): Members<Element> {
    function current(): Raw.Element[] {
      const realm = owningRealm(root);
      const cache =
        realm === token
          ? collectionMembersCache()
          : realmTreeOperations.get(realm)?.collectionMembersCache();
      const known = cache?.get(current);
      if (known) return known;
      const members = collectQueryDescendants({
        root,
        matches,
        skipPackedText,
        wrap: (node) => node,
      });
      cache?.set(current, members);
      return members;
    }
    return {
      length: () => current().length,
      at(index) {
        const node = current()[index];
        return node && wrapElement(node);
      },
    };
  }

  function asciiLower(value: string): string {
    if (!asciiUppercase.test(value)) return value;
    return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  }

  function elementsByTag(root: Raw.ParentNode, name: string): HTMLCollection {
    const lower = asciiLower(name);
    // The collection's matching rule is chosen at creation, even if its live root is adopted.
    const isHTMLDocument = !xmlDocumentFor(root);
    return new HTMLCollection(
      token,
      descendantMembers(root, (node) => {
        if (name === "*") return true;
        return (
          node.tagName === (isHTMLDocument && node.namespaceURI === html.NS.HTML ? lower : name)
        );
      }),
    );
  }

  function elementsByNamespace(
    root: Raw.ParentNode,
    namespace: string | null,
    localName: string,
  ): HTMLCollection {
    return new HTMLCollection(
      token,
      descendantMembers(root, (node) => {
        if (namespace !== "*" && (node.namespaceURI || null) !== (namespace || null)) return false;
        return localName === "*" || localName === elementLocalName(node);
      }),
    );
  }

  function elementsByClass(root: Raw.ParentNode, value: string): HTMLCollection {
    const fold = () =>
      !xmlDocumentFor(root) && ownerRecord(root).mode === html.DOCUMENT_MODE.QUIRKS;
    const classTokens = (text: string) => text.split(/[\t\n\f\r ]+/).filter(Boolean);
    const names = classTokens(value);
    const lowerNames = names.map(asciiLower);
    return new HTMLCollection(
      token,
      descendantMembers(root, (node) => {
        if (!names.length) return false;
        const classes = attribute(node, "class");
        if (!classes) return false;
        const shouldFold = fold();
        const tokens = classTokens(shouldFold ? asciiLower(classes) : classes);
        return (shouldFold ? lowerNames : names).every((name) => tokens.includes(name));
      }),
    );
  }

  type DataNode = Raw.TextNode | Raw.CommentNode;

  function isCharacterData(node: Raw.Node): node is DataNode {
    return tree.isTextNode(node) || tree.isCommentNode(node);
  }

  function isTextData(node: Raw.Node | undefined): node is DataNode {
    return node !== undefined && (tree.isTextNode(node) || xmlSpecial(node)?.kind === "cdata");
  }

  function dataOf(node: DataNode): string {
    return tree.isTextNode(node) ? node.value : node.data;
  }

  function childTextContent(node: Raw.Element): string {
    let text = "";
    for (const child of node.childNodes) {
      if (isTextData(child)) text += dataOf(child);
    }
    return text;
  }

  function setChildTextContent(node: Raw.Element, value: string): void {
    const text = `${value}`;
    replaceChildren(node, text ? [{ nodeName: "#text", value: text, parentNode: node }] : []);
  }

  function checkedOffset(value: number, length: number): number {
    const offset = Number(value) >>> 0;
    if (offset > length) throw new DOMException("Offset out of bound", "IndexSizeError");
    return offset;
  }

  function replaceData(node: DataNode, offset: number, count: number, value: string): void {
    const realm = owningRealm(node);
    if (realm !== token) {
      const edit = realmTreeOperations.get(realm)?.replaceData;
      if (!edit) throw new Error("A node must have a character data realm");
      edit(node, offset, count, value);
      return;
    }
    const oldValue = dataOf(node);
    computedStyleRevision++;
    const removed = Math.min(count, oldValue.length - offset);
    const next = oldValue.slice(0, offset) + value + oldValue.slice(offset + removed);
    if (tree.isTextNode(node)) node.value = next;
    else node.data = next;
    const parent = node.parentNode;
    if (
      isTextData(node) &&
      parent &&
      tree.isElementNode(parent) &&
      parent.namespaceURI === html.NS.HTML &&
      elementLocalName(parent) === "style"
    ) {
      invalidateStyleSource(parent);
      advanceRevision();
    } else if (isTextData(node) && (oldValue.length === 0) !== (next.length === 0)) {
      // :empty and relational selectors can change without any topology or attribute mutation.
      invalidateQueryIndices();
    }
    rangeIndex()?.dataReplaced(node, offset, removed, value.length);
    queueMutation({ type: "characterData", target: node, oldValue });
  }

  function normalizeText(node: Raw.TextNode, owner: Raw.ParentNode): void {
    const length = node.value.length;
    if (!length) {
      detachWithRecord(node);
      advanceRevision();
      return;
    }
    const index = owner.childNodes.indexOf(node) + 1;
    const adjacent: Raw.TextNode[] = [];
    for (let next = index; next < owner.childNodes.length; next++) {
      const sibling = owner.childNodes[next];
      if (!sibling || !tree.isTextNode(sibling)) break;
      adjacent.push(sibling);
    }
    if (!adjacent.length) return;
    replaceData(node, length, 0, adjacent.map((sibling) => sibling.value).join(""));
    let offset = length;
    for (const sibling of adjacent) {
      rangeIndex()?.textMerged(sibling, node, offset, owner, index);
      offset += sibling.value.length;
      detachWithRecord(sibling);
    }
    advanceRevision();
  }

  function editSiblings(
    receiver: Node,
    node: Raw.ChildNode,
    position: "before" | "after" | "replace",
    values: (Node | string)[],
  ): void {
    const inputs = values.map((value) =>
      typeof value === "object" && value && records.has(value) ? value : `${value}`,
    );
    const owner = node.parentNode;
    if (!owner || (!inputs.length && position !== "replace")) return;
    const siblings = owner.childNodes;
    const incoming = new Set(inputs.filter((value) => typeof value !== "string").map(raw));
    const step = position === "before" ? -1 : 1;
    let index = siblings.indexOf(node) + step;
    let viable = siblings[index];
    // Conversion may move the receiver or its siblings into the temporary fragment.
    while (viable && incoming.has(viable)) {
      index += step;
      viable = siblings[index];
    }

    const ownerDocument = ownerRecord(node);
    const converted = inputs.map((value) =>
      typeof value === "string" ? owned(new Text(value), ownerDocument) : value,
    );
    let moving = converted.length === 1 ? converted[0] : undefined;
    if (!moving) {
      moving = owned(new DocumentFragment(), ownerDocument);
      for (const child of converted) Node.prototype.insertBefore.call(moving, child, null);
    }

    const parent = wrap(owner);
    if (position === "replace" && node.parentNode === owner) {
      Node.prototype.replaceChild.call(parent, moving, receiver);
      return;
    }
    const reference =
      position === "before" ? siblings[viable ? siblings.indexOf(viable) + 1 : 0] : viable;
    Node.prototype.insertBefore.call(parent, moving, reference ? wrap(reference) : null);
  }

  class CharacterData extends Node {
    get nextElementSibling(): Element | null {
      return adjacentElement(this.dataRecord(), 1);
    }
    get previousElementSibling(): Element | null {
      return adjacentElement(this.dataRecord(), -1);
    }
    constructor(key: symbol, record: DataNode) {
      super(key, record);
    }
    protected dataRecord(): DataNode {
      const record = raw(this);
      if (!isCharacterData(record)) throw new TypeError("Expected character data");
      return record;
    }
    get data(): string {
      return dataOf(this.dataRecord());
    }
    set data(value: string) {
      const node = this.dataRecord();
      replaceData(node, 0, dataOf(node).length, String(value));
    }
    get length(): number {
      return this.data.length;
    }
    substringData(offset: number, count: number): string {
      if (arguments.length < 2) throw new TypeError("An offset and count are required");
      const data = dataOf(this.dataRecord());
      const start = checkedOffset(offset, data.length);
      return data.slice(start, start + (Number(count) >>> 0));
    }
    appendData(data: string): void {
      if (arguments.length < 1) throw new TypeError("Data is required");
      const node = this.dataRecord();
      replaceData(node, dataOf(node).length, 0, String(data));
    }
    insertData(offset: number, data: string): void {
      if (arguments.length < 2) throw new TypeError("An offset and data are required");
      const node = this.dataRecord();
      replaceData(node, checkedOffset(offset, dataOf(node).length), 0, String(data));
    }
    deleteData(offset: number, count: number): void {
      if (arguments.length < 2) throw new TypeError("An offset and count are required");
      const node = this.dataRecord();
      replaceData(node, checkedOffset(offset, dataOf(node).length), Number(count) >>> 0, "");
    }
    replaceData(offset: number, count: number, data: string): void {
      if (arguments.length < 3) throw new TypeError("An offset, count, and data are required");
      const node = this.dataRecord();
      replaceData(
        node,
        checkedOffset(offset, dataOf(node).length),
        Number(count) >>> 0,
        String(data),
      );
    }
    before(...nodes: (Node | string)[]): void {
      editSiblings(this, this.dataRecord(), "before", nodes);
    }
    after(...nodes: (Node | string)[]): void {
      editSiblings(this, this.dataRecord(), "after", nodes);
    }
    replaceWith(...nodes: (Node | string)[]): void {
      editSiblings(this, this.dataRecord(), "replace", nodes);
    }
    remove(): void {
      const record = this.dataRecord();
      if (record.parentNode) wrap(record.parentNode).removeChild(this);
    }
  }

  class Text extends CharacterData {
    constructor(data?: string);
    constructor(key: symbol, node: DataNode);
    constructor(value: string | symbol = "", node?: DataNode) {
      if (node && typeof value === "symbol") super(value, node);
      else super(token, { nodeName: "#text", value: String(value), parentNode: null });
    }
    get assignedSlot(): HTMLSlotElement | null {
      return visibleAssignedSlot(this);
    }
    splitText(offset: number): Text {
      if (arguments.length < 1) throw new TypeError("An offset is required");
      const node = this.dataRecord();
      const data = dataOf(node);
      const start = checkedOffset(offset, data.length);
      const remainder = owned(new Text(data.slice(start)), ownerRecord(node));
      const owner = node.parentNode;
      if (owner) {
        const index = owner.childNodes.indexOf(node) + 1;
        const next = owner.childNodes[index];
        wrap(owner).insertBefore(remainder, next ? wrap(next) : null);
        rangeIndexes.get(owningRealm(owner))?.textSplit(node, raw(remainder), start, owner, index);
      }
      replaceData(node, start, data.length - start, "");
      return remainder;
    }
    get wholeText(): string {
      const node = this.dataRecord();
      const siblings = node.parentNode?.childNodes;
      if (!siblings) return dataOf(node);
      let index = siblings.indexOf(node);
      while (isTextData(siblings[index - 1])) index--;
      const parts: string[] = [];
      for (let sibling = siblings[index]; isTextData(sibling); sibling = siblings[++index]) {
        parts.push(dataOf(sibling));
      }
      return parts.join("");
    }
  }

  class Comment extends CharacterData {
    constructor(data?: string);
    constructor(key: symbol, node: Raw.CommentNode);
    constructor(value: string | symbol = "", node?: Raw.CommentNode) {
      if (node && typeof value === "symbol") super(value, node);
      else super(token, tree.createCommentNode(String(value)));
    }
  }

  class CDATASection extends Text {
    constructor(key: symbol, node: Raw.CommentNode) {
      if (key !== token) throw new TypeError("Illegal constructor");
      super(key, node);
    }
  }
  class ProcessingInstruction extends CharacterData {
    get target(): string {
      const special = xmlSpecial(this.dataRecord());
      return special?.kind === "instruction" ? special.target : "";
    }
  }

  function attributeName(record: Raw.Element, name: string): string {
    // HTML and XML use the same qualified name when ASCII case folding has no effect.
    if (
      !asciiUppercase.test(name) ||
      record.namespaceURI !== html.NS.HTML ||
      xmlDocumentFor(record)
    )
      return name;
    return name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  }

  function findAttribute(record: Raw.Element, name: string): AttributeRecord | undefined {
    const key = attributeName(record, name);
    for (const attr of record.attrs) {
      if ((attr.prefix ? qualifiedAttributeName(attr) : attr.name) === key) return attr;
    }
    return undefined;
  }

  function findAttributeNS(
    record: Raw.Element,
    namespace: string | null,
    name: string,
  ): AttributeRecord | undefined {
    return record.attrs.find(
      (attr) => (attr.namespace || null) === namespace && attr.name === name,
    );
  }

  function recordAttributeMutation(
    record: Raw.Element,
    attr: AttributeRecord,
    oldValue: string | null,
  ): void {
    if (!focusFixupPending && focusStates.get(source)?.element && !closed) {
      focusFixupPending = true;
      timers.setTimeout(() => {
        focusFixupPending = false;
        const focused = focusStates.get(source)?.element;
        if (focused && !focusable(focused, window)) focusViewport();
      });
    }
    const { name, namespace } = attr;
    // These attributes affect the cascade through selector matching. An unattached
    // root is outside document-frame reuse, and equal values leave selectors unchanged.
    const selectorOnly =
      !namespace &&
      (name === "class" || name === "role" || name.startsWith("data-") || name.startsWith("aria-"));
    const styleChanged =
      !selectorOnly ||
      (record.parentNode !== null && (oldValue === null || attribute(record, name) !== oldValue));
    if (styleChanged) computedStyleRevision++;
    invalidateQueryIndices();
    // A detached element cannot displace a document match. Insertion invalidates its key.
    if (!namespace && name === "id" && record.parentNode) {
      invalidateDocumentId(oldValue);
      invalidateDocumentId(attr.value);
    }
    if (!namespace && name === "href" && htmlChildNamed(record, "base"))
      cachedDocumentBase = undefined;
    if (!namespace && (name === "src" || name === "srcdoc") && isFrame(record)) {
      const reload =
        name === "src" && (record.tagName === "frame" || attribute(record, "srcdoc") === null);
      startFrame(record, reload);
    }
    if (
      !namespace &&
      (name === "class" ||
        name === "name" ||
        name === "id" ||
        name === "form" ||
        (name === "for" && isLabel(record)) ||
        (name === "href" &&
          (oldValue === null) !== (attribute(record, "href") === null) &&
          htmlChildNamed(record, "a", "area")) ||
        (name === "type" && (isInput(record) || htmlChildNamed(record, "style"))))
    )
      advanceRevision({
        namesChanged: (name === "name" || name === "id") && isDocumentNamedElement(record),
        idsChanged: false,
        stylesheetMembershipChanged: name === "type" && htmlChildNamed(record, "style"),
        styleChanged,
      });
    queueMutation({
      type: "attributes",
      target: record,
      name,
      oldValue,
      ...(namespace ? { namespace } : {}),
    });
    if (!namespace && name === "name" && isSlot(record)) reconcileSlots(treeRoot(record));
    if (!namespace && name === "slot") {
      const host = record.parentNode;
      const shadow = host && tree.isElementNode(host) && shadowRoots.get(host);
      if (shadow) reconcileSlots(shadow);
    }
  }

  function attributeChanged(
    owner: Element,
    attr: AttributeRecord,
    oldValue: string | null,
    references?: AriaReferences,
    scheduleReaction?: typeof queueMicrotask,
  ): void {
    const record = element(owner);
    const { name, namespace } = attr;
    if (!namespace && (name === "width" || name === "height")) {
      const realm = frameStates.get(record)?.realm;
      const child = realm instanceof InitialFrameRealm ? realm.existingWindow : realm?.window;
      if (child) notifyFrameMedia.get(child)?.();
    }
    if (!namespace && name === "style") syncInlineStyle(record);
    if (!namespace && name === "media") styleBinding?.syncSheetMedia(record);
    if (
      !namespace &&
      name === "disabled" &&
      record.namespaceURI === html.NS.HTML &&
      record.tagName === "link"
    ) {
      const disabled = attribute(record, "disabled") !== null;
      const sheet = styleBinding?.sheet(record);
      if (sheet) sheet.disabled = disabled;
      if (!disabled) enableStylesheetLink(record);
    }

    if (
      !namespace &&
      (name === "href" || name === "rel") &&
      record.namespaceURI === html.NS.HTML &&
      record.tagName === "link"
    )
      startStyle(record);
    if (!namespace && name === "form" && record.tagName !== "img") parserFormOwners?.delete(record);
    if (!namespace && (references || explicitAriaReferences))
      updateAriaReferences(record, name, references);
    if (!namespace && name === "is" && record.namespaceURI === html.NS.HTML) {
      const values = (customIsValues ??= new WeakMap());
      if (!values.has(record)) values.set(record, oldValue);
    }
    const realm = owningRealm(record);
    const notify =
      realm === token ? recordAttributeMutation : realmTreeOperations.get(realm)?.attributeMutation;
    if (!notify) throw new Error("A node must have an attribute mutation realm");
    notify(record, attr, oldValue);
    if (!namespace && isInput(record)) {
      if (name === "type") updateInputValueMode(owner, record, oldValue);
      if (name === "min" || name === "max" || name === "step" || name === "multiple") {
        const value = controlValues.get(record);
        if (value !== undefined) {
          const type = inputType(record);
          if (type === "range" || type === "email") {
            controlValues.set(record, sanitizeInputValue(record, value, type));
          }
        }
      }
      if (name === "checked" && updateDefaultCheckedness(record)) setChecked(record, true);
      if (
        (name === "type" || name === "name" || name === "form") &&
        checkedness(record) &&
        (name !== "type" || inputType(record) !== normalizedInputType(oldValue))
      )
        setChecked(record, true);
    }
    if (!namespace && record.namespaceURI === html.NS.HTML) {
      if (record.tagName === "dialog" && name === "open" && attribute(record, "open") === null)
        modalDialogs?.delete(record);
      if (record.tagName === "details") {
        if (name === "open") {
          const open = attribute(record, "open") !== null;
          if ((oldValue === null) === open) queueToggleEvent(record, open);
          if (open) enforceDetailsGroup(record, true);
        } else if (name === "name") {
          enforceDetailsGroup(record, false);
        }
      }
      if (record.tagName === "option" && name === "selected" && !optionStates.get(record)?.dirty) {
        optionStates.delete(record);
        optionSelectionRevision++;
        updateOptionSelection(record, attribute(record, "selected") !== null);
      }
      if (record.tagName === "select" && (name === "multiple" || name === "size")) {
        normalizeSelection(record, selectMembers(record));
      }
    }
    if (
      !namespace &&
      !updateReflectedWindowAttribute(record, name) &&
      options.runScripts === "dangerously"
    ) {
      const type = handlerName(record, name);
      if (type) handlers.attribute(owner, type, attribute(record, name));
    }
    if (hasCustomElements)
      customAttributeChanged(
        record,
        attr,
        oldValue,
        record.attrs.includes(attr) ? attr.value : null,
        scheduleReaction,
      );
    if (
      hasFormLifecycleCallbacks &&
      !namespace &&
      (name === "id" || name === "form" || name === "disabled")
    )
      refreshCustomFormLifecycle([record]);
  }

  function setAttributeValue(
    owner: Element,
    existing: AttributeRecord | undefined,
    next: AttributeRecord,
    references?: AriaReferences,
    scheduleReaction?: typeof queueMicrotask,
  ): void {
    const record = element(owner);
    // String conversion can expose, mutate or detach the Attr before this write resumes.
    const owned = existing && ownTemplateAttribute(record, existing);
    const value = String(next.value);
    const oldValue = owned?.value ?? null;
    const updated = owned ?? (value === next.value ? next : { ...next, value });
    if (owned) owned.value = value;
    else mutableTemplateAttributes(record).push(updated);
    attributeChanged(owner, updated, oldValue, references, scheduleReaction);
  }

  function removeAttributeRecord(owner: Element, attr: AttributeRecord | undefined): void {
    if (!attr) return;
    const attrs = mutableTemplateAttributes(element(owner));
    attrs.splice(attrs.indexOf(attr), 1);
    const wrapper = attrWrappers?.get(attr);
    if (wrapper) {
      if (hasAdditionalDocuments) setOwner(raw(wrapper), ownerRecord(raw(owner)));
      attrOwners?.delete(wrapper);
    }
    attributeChanged(owner, attr, attr.value);
  }

  let attrWrappers: WeakMap<AttributeRecord, Attr> | undefined;
  let attributeMaps: WeakMap<Element, NamedNodeMap> | undefined;

  function attrRecord(attr: Attr): AttributeRecord {
    const record = attrRecords?.get(attr);
    if (!record || nodeRecord(attr)?.realm !== token)
      throw new TypeError("Expected an Attr from this Window");
    return record;
  }

  function wrapAttribute(record: AttributeRecord, owner: Element | null = null): Attr {
    const parent = owner && element(owner);
    const owned = parent ? ownTemplateAttribute(parent, record) : record;
    const attr = attrWrappers?.get(owned) ?? new Attr(token, owned);
    if (parent) (attrOwners ??= new WeakMap()).set(attr, parent);
    return attr;
  }

  function attachAttribute(owner: Element, attr: Attr): Attr | null {
    const next = attrRecord(attr);
    const record = element(owner);
    const priorOwner = attrOwners?.get(attr);
    if (priorOwner && priorOwner !== record)
      throw new DOMException("Attribute is already in use", "InUseAttributeError");
    if (priorOwner === record) return attr;
    const matched = findAttributeNS(record, next.namespace || null, next.name);
    const existing = matched && ownTemplateAttribute(record, matched);
    const previous = existing ? wrapAttribute(existing, owner) : null;
    if (existing) record.attrs[record.attrs.indexOf(existing)] = next;
    else mutableTemplateAttributes(record).push(next);
    if (previous) {
      if (hasAdditionalDocuments) setOwner(raw(previous), ownerRecord(record));
      attrOwners?.delete(previous);
    }
    detachedOwners.delete(raw(attr));
    (attrOwners ??= new WeakMap()).set(attr, record);
    attributeChanged(owner, next, existing?.value ?? null);
    return previous;
  }

  function detachAttribute(owner: Element, attr: Attr | null): Attr {
    if (!attr || attrOwners?.get(attr) !== element(owner))
      throw new DOMException("Attribute is not attached to this element", "NotFoundError");
    removeAttributeRecord(owner, attrRecord(attr));
    return attr;
  }

  class Attr extends Node {
    constructor(key: symbol, record: AttributeRecord) {
      // Attr uses Node's wrapper identity but never enters the parse5 child tree.
      super(key, tree.createCommentNode(""));
      (attrRecords ??= new WeakMap()).set(this, record);
      (attrWrappers ??= new WeakMap()).set(record, this);
    }
    override get nodeType(): number {
      attrRecord(this);
      return 2;
    }
    override get nodeName(): string {
      return qualifiedAttributeName(attrRecord(this));
    }
    get name(): string {
      return qualifiedAttributeName(attrRecord(this));
    }
    get localName(): string {
      return attrRecord(this).name;
    }
    get prefix(): string | null {
      return attrRecord(this).prefix ?? null;
    }
    get namespaceURI(): string | null {
      return attrRecord(this).namespace ?? null;
    }
    get ownerElement(): Element | null {
      const owner = attrOwners?.get(this);
      return owner ? wrapElement(owner) : null;
    }
    get specified(): boolean {
      return true;
    }
    get value(): string {
      return attrRecord(this).value;
    }
    set value(value: string) {
      const attr = attrRecord(this);
      const oldValue = attr.value;
      attr.value = String(value);
      const owner = attrOwners?.get(this);
      if (owner) attributeChanged(wrapElement(owner), attr, oldValue);
    }
    override get nodeValue(): string {
      return this.value;
    }
    override set nodeValue(value: string | null) {
      this.value = value ?? "";
    }
    override get textContent(): string {
      return this.value;
    }
    override set textContent(value: string | null) {
      this.value = value ?? "";
    }
  }

  const mapOwners = new WeakMap<NamedNodeMap, Element>();

  function mapOwner(map: NamedNodeMap): Element {
    const owner = mapOwners.get(map);
    if (!owner) throw new TypeError("Illegal invocation");
    return owner;
  }

  class NamedNodeMap {
    readonly [index: number]: Attr | undefined;
    constructor(key: symbol, owner: Element) {
      if (key !== token) throw new TypeError("Illegal constructor");
      const record = element(owner);
      function lookup(target: NamedNodeMap, property: PropertyKey): Attr | undefined {
        if (typeof property !== "string" || Reflect.has(target, property)) return undefined;
        const attr = /^(0|[1-9]\d*)$/.test(property)
          ? record.attrs[Number(property)]
          : findAttribute(record, property);
        return attr && wrapAttribute(attr, owner);
      }
      const proxy = new Proxy(this, {
        get(target, property, receiver) {
          return lookup(target, property) ?? Reflect.get(target, property, receiver);
        },
        has(target, property) {
          return Reflect.has(target, property) || lookup(target, property) !== undefined;
        },
        ownKeys(target) {
          const keys = new Set(Reflect.ownKeys(target));
          for (let index = 0; index < record.attrs.length; index++) keys.add(String(index));
          for (const attr of record.attrs) {
            const name = qualifiedAttributeName(attr);
            if (attributeName(record, name) === name && !Reflect.has(target, name)) keys.add(name);
          }
          return [...keys];
        },
        getOwnPropertyDescriptor(target, property) {
          const value = lookup(target, property);
          if (!value) return Reflect.getOwnPropertyDescriptor(target, property);
          return { value, enumerable: /^(0|[1-9]\d*)$/.test(String(property)), configurable: true };
        },
        preventExtensions: () => false,
      });
      mapOwners.set(proxy, owner);
      return proxy;
    }
    get length(): number {
      return element(mapOwner(this)).attrs.length;
    }
    item(index: number): Attr | null {
      const owner = mapOwner(this);
      const attr = element(owner).attrs[Number(index) >>> 0];
      return attr ? wrapAttribute(attr, owner) : null;
    }
    getNamedItem(name: string): Attr | null {
      const owner = mapOwner(this);
      const attr = findAttribute(element(owner), String(name));
      return attr ? wrapAttribute(attr, owner) : null;
    }
    getNamedItemNS(namespace: string | null, localName: string): Attr | null {
      const owner = mapOwner(this);
      const attr = findAttributeNS(element(owner), nullableNamespace(namespace), String(localName));
      return attr ? wrapAttribute(attr, owner) : null;
    }
    setNamedItem(attr: Attr): Attr | null {
      return attachAttribute(mapOwner(this), attr);
    }
    setNamedItemNS(attr: Attr): Attr | null {
      return attachAttribute(mapOwner(this), attr);
    }
    removeNamedItem(name: string): Attr {
      return detachAttribute(mapOwner(this), this.getNamedItem(name));
    }
    removeNamedItemNS(namespace: string | null, localName: string): Attr {
      return detachAttribute(mapOwner(this), this.getNamedItemNS(namespace, localName));
    }
    *[Symbol.iterator](): IterableIterator<Attr> {
      const owner = mapOwner(this);
      const record = element(owner);
      // Exposing an Attr can detach the shared array. Each step reads the live membership.
      for (let index = 0; index < record.attrs.length; index++) {
        const attr = record.attrs[index];
        if (attr) yield wrapAttribute(attr, owner);
      }
    }
    get [Symbol.toStringTag](): string {
      return "NamedNodeMap";
    }
  }

  function childElements(node: Node, owner: Raw.ParentNode): HTMLCollection {
    let list = elementLists.get(node);
    if (!list) {
      list = new HTMLCollection(token, {
        length() {
          let size = 0;
          for (const child of owner.childNodes) if (tree.isElementNode(child)) size++;
          return size;
        },
        at(index) {
          for (const child of owner.childNodes) {
            if (tree.isElementNode(child) && index-- === 0) return wrapElement(child);
          }
          return undefined;
        },
      });
      elementLists.set(node, list);
    }
    return list;
  }
  function edgeElement(owner: Raw.ParentNode, last: boolean): Element | null {
    const match = last
      ? owner.childNodes.findLast(tree.isElementNode)
      : owner.childNodes.find(tree.isElementNode);
    return match ? wrapElement(match) : null;
  }

  class DOMRectReadOnly {
    constructor(x = 0, y = 0, width = 0, height = 0) {
      rectangles.set(this, { x: +x, y: +y, width: +width, height: +height });
    }

    static fromRect(other?: Partial<RectCoordinates> | null): DOMRectReadOnly {
      const { x, y, width, height } = rectDictionary(other);
      return new DOMRectReadOnly(x, y, width, height);
    }

    get [Symbol.toStringTag](): string {
      return "DOMRectReadOnly";
    }
    get x(): number {
      return rectCoordinates(this).x;
    }
    get y(): number {
      return rectCoordinates(this).y;
    }
    get width(): number {
      return rectCoordinates(this).width;
    }
    get height(): number {
      return rectCoordinates(this).height;
    }
    get top(): number {
      const { y, height } = rectCoordinates(this);
      return Math.min(y, y + height);
    }
    get right(): number {
      const { x, width } = rectCoordinates(this);
      return Math.max(x, x + width);
    }
    get bottom(): number {
      const { y, height } = rectCoordinates(this);
      return Math.max(y, y + height);
    }
    get left(): number {
      const { x, width } = rectCoordinates(this);
      return Math.min(x, x + width);
    }
    toJSON() {
      const { x, y, width, height, top, right, bottom, left } = this;
      return { x, y, width, height, top, right, bottom, left };
    }
  }

  class DOMRect extends DOMRectReadOnly {
    static override fromRect(other?: Partial<RectCoordinates> | null): DOMRect {
      const { x, y, width, height } = rectDictionary(other);
      return new DOMRect(x, y, width, height);
    }

    override get [Symbol.toStringTag](): string {
      return "DOMRect";
    }
    override get x(): number {
      return super.x;
    }
    override set x(value: number) {
      rectCoordinates(this).x = +value;
    }
    override get y(): number {
      return super.y;
    }
    override set y(value: number) {
      rectCoordinates(this).y = +value;
    }
    override get width(): number {
      return super.width;
    }
    override set width(value: number) {
      rectCoordinates(this).width = +value;
    }
    override get height(): number {
      return super.height;
    }
    override set height(value: number) {
      rectCoordinates(this).height = +value;
    }
  }

  const classLists = new WeakMap<Element, DOMTokenList>();
  const tokenLists = new WeakMap<
    object,
    {
      owner: Element;
      attributeName: string;
      supportedTokens: ReadonlySet<string> | undefined;
      source: string | null;
      tokens: string[];
    }
  >();

  function tokenList(list: object) {
    const state = tokenLists.get(list);
    if (!state) throw new TypeError("Expected a DOMTokenList");
    const source = attribute(element(state.owner), state.attributeName);
    if (source !== state.source) {
      state.source = source;
      state.tokens = [...new Set(source?.match(/[^\t\n\f\r ]+/g) ?? [])];
    }
    return state;
  }

  function domString(value: unknown): string {
    if (typeof value === "symbol") throw new TypeError("Cannot convert a Symbol to a string");
    return String(value);
  }

  function validateClassToken(token: string): void {
    if (!token) throw new DOMException("A token cannot be empty", "SyntaxError");
    if (/[\t\n\f\r ]/.test(token))
      throw new DOMException("A token cannot contain ASCII whitespace", "InvalidCharacterError");
  }

  function writeTokens(list: DOMTokenList, tokens: Iterable<string>): void {
    const { owner, attributeName, source } = tokenList(list);
    const value = [...tokens].join(" ");
    if (value || source !== null) Element.prototype.setAttribute.call(owner, attributeName, value);
  }

  class DOMTokenList {
    readonly [index: number]: string | undefined;
    constructor(
      key: symbol,
      owner: Element,
      attributeName = "class",
      supportedTokens?: ReadonlySet<string>,
    ) {
      if (key !== token) throw new TypeError("Illegal constructor");
      const proxy: DOMTokenList = new Proxy(this, {
        get(target, property, receiver) {
          const index = indexedProperty(property);
          return index === undefined
            ? Reflect.get(target, property, receiver)
            : tokenList(proxy).tokens[index];
        },
        has(target, property) {
          const index = indexedProperty(property);
          return index === undefined
            ? Reflect.has(target, property)
            : index < tokenList(proxy).tokens.length;
        },
        ownKeys(target) {
          return [
            ...tokenList(proxy).tokens.map((_, index) => String(index)),
            ...Reflect.ownKeys(target),
          ];
        },
        getOwnPropertyDescriptor(target, property) {
          const index = indexedProperty(property);
          if (index === undefined) return Reflect.getOwnPropertyDescriptor(target, property);
          const value = tokenList(proxy).tokens[index];
          return value === undefined
            ? undefined
            : { value, writable: false, enumerable: true, configurable: true };
        },
        set(target, property, value, receiver) {
          return (
            indexedProperty(property) === undefined &&
            Reflect.set(target, property, value, receiver)
          );
        },
        defineProperty(target, property, descriptor) {
          return (
            indexedProperty(property) === undefined &&
            Reflect.defineProperty(target, property, descriptor)
          );
        },
        deleteProperty(target, property) {
          const index = indexedProperty(property);
          return index === undefined
            ? Reflect.deleteProperty(target, property)
            : index >= tokenList(proxy).tokens.length;
        },
        preventExtensions: () => false,
      });
      tokenLists.set(proxy, { owner, attributeName, supportedTokens, source: null, tokens: [] });
      return proxy;
    }

    get [Symbol.toStringTag](): string {
      return "DOMTokenList";
    }
    get length(): number {
      return tokenList(this).tokens.length;
    }
    get value(): string {
      return tokenList(this).source ?? "";
    }
    set value(value: string) {
      const { owner, attributeName } = tokenList(this);
      Element.prototype.setAttribute.call(owner, attributeName, domString(value));
    }
    item(index: number): string | null {
      if (arguments.length < 1) throw new TypeError("An index is required");
      return tokenList(this).tokens[+index >>> 0] ?? null;
    }
    contains(token: string): boolean {
      if (arguments.length < 1) throw new TypeError("A token is required");
      return tokenList(this).tokens.includes(domString(token));
    }
    add(...tokens: string[]): void {
      const values = tokens.map(domString);
      values.forEach(validateClassToken);
      writeTokens(this, new Set([...tokenList(this).tokens, ...values]));
    }
    remove(...tokens: string[]): void {
      const values = tokens.map(domString);
      values.forEach(validateClassToken);
      const remaining = new Set(tokenList(this).tokens);
      for (const value of values) remaining.delete(value);
      writeTokens(this, remaining);
    }
    toggle(token: string, force?: boolean): boolean {
      if (arguments.length < 1) throw new TypeError("A token is required");
      const value = domString(token);
      validateClassToken(value);
      const tokens = new Set(tokenList(this).tokens);
      const present = tokens.has(value);
      const next = force === undefined ? !present : Boolean(force);
      if (present === next) return next;
      if (next) tokens.add(value);
      else tokens.delete(value);
      writeTokens(this, tokens);
      return next;
    }
    replace(token: string, replacement: string): boolean {
      if (arguments.length < 2) throw new TypeError("Two tokens are required");
      const oldToken = domString(token);
      const newToken = domString(replacement);
      if (!oldToken || !newToken) throw new DOMException("A token cannot be empty", "SyntaxError");
      validateClassToken(oldToken);
      validateClassToken(newToken);
      const tokens = tokenList(this).tokens;
      if (!tokens.includes(oldToken)) return false;
      writeTokens(this, new Set(tokens.map((value) => (value === oldToken ? newToken : value))));
      return true;
    }
    supports(token: string): boolean {
      if (arguments.length < 1) throw new TypeError("A token is required");
      const value = domString(token);
      const { attributeName, supportedTokens } = tokenList(this);
      if (!supportedTokens)
        throw new TypeError(`The ${attributeName} attribute has no supported tokens`);
      return supportedTokens.has(asciiLower(value));
    }
    declare entries: () => IterableIterator<[number, string]>;
    declare keys: () => IterableIterator<number>;
    declare values: () => IterableIterator<string>;
    declare [Symbol.iterator]: () => IterableIterator<string>;
    declare forEach: (
      callback: (token: string, index: number, list: DOMTokenList) => void,
      thisArg?: unknown,
    ) => void;
    toString(): string {
      return this.value;
    }
  }

  interface Element extends AriaStringProperties, AriaReferenceProperties<Element> {}
  function adjacentInsertionPoint(
    node: Raw.Element,
    position: string,
  ): { target: Raw.ParentNode; before: Raw.ChildNode | null } | undefined {
    switch (asciiLower(position)) {
      case "beforebegin":
        return node.parentNode ? { target: node.parentNode, before: node } : undefined;
      case "afterend": {
        const target = node.parentNode;
        if (!target) return;
        return { target, before: target.childNodes[target.childNodes.indexOf(node) + 1] ?? null };
      }
      case "afterbegin":
        return { target: node, before: node.childNodes[0] ?? null };
      case "beforeend":
        return { target: node, before: null };
      default:
        throw new DOMException("Invalid adjacent insertion position", "SyntaxError");
    }
  }

  class Element extends Node {
    constructor(key: symbol, record: Raw.Element, wrapHandle?: (target: Node) => Node) {
      super(key, record, wrapHandle);
      initializeHandlers(this, record);
    }

    // jsdom exposes empty metrics in a window without a layout engine.
    getBoundingClientRect() {
      element(this);
      return { x: 0, y: 0, bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 };
    }
    getClientRects(): DOMRect[] {
      element(this);
      return [];
    }
    get scrollLeft(): number {
      return scrollOffsets.get(element(this))?.left ?? 0;
    }
    set scrollLeft(value: number) {
      const node = element(this);
      const offset = +value;
      elementScrollOffsets(node).left = offset;
    }
    get scrollTop(): number {
      return scrollOffsets.get(element(this))?.top ?? 0;
    }
    set scrollTop(value: number) {
      const node = element(this);
      const offset = +value;
      elementScrollOffsets(node).top = offset;
    }
    get scrollWidth(): number {
      element(this);
      return 0;
    }
    get scrollHeight(): number {
      element(this);
      return 0;
    }
    get clientTop(): number {
      element(this);
      return 0;
    }
    get clientLeft(): number {
      element(this);
      return 0;
    }
    get clientWidth(): number {
      element(this);
      return 0;
    }
    get clientHeight(): number {
      element(this);
      return 0;
    }

    get slot(): string {
      return this.getAttribute("slot") ?? "";
    }
    set slot(value: string) {
      this.setAttribute("slot", value);
    }
    get assignedSlot(): HTMLSlotElement | null {
      return visibleAssignedSlot(this);
    }

    attachShadow(options: {
      mode: "open" | "closed";
      delegatesFocus?: boolean;
      clonable?: boolean;
      serializable?: boolean;
      slotAssignment?: "named" | "manual";
    }): ShadowRoot {
      const assignment = options?.slotAssignment;
      if (assignment !== undefined && assignment !== "named" && assignment !== "manual")
        throw new TypeError("Invalid slot assignment mode");
      const mode = options?.mode;
      if (mode !== "open" && mode !== "closed") throw new TypeError("Invalid shadow root mode");
      const host = element(this);
      if (!canHostShadow(host)) {
        throw new DOMException("Cannot attach a shadow root to this element", "NotSupportedError");
      }
      const existing = shadowRoots.get(host);
      if (existing) {
        const shadow = wrap(existing) as ShadowRoot;
        if (!declarativeShadows.has(existing) || shadow.mode !== mode) {
          throw new DOMException(
            "Cannot attach a shadow root to this element",
            "NotSupportedError",
          );
        }
        declarativeShadows.delete(existing);
        replaceChildren(existing, []);
        return shadow;
      }
      const fragment = tree.createDocumentFragment();
      if (assignment === "manual") manualShadowRoots.add(fragment);
      return installShadowRoot(this, host, fragment, {
        mode,
        delegatesFocus: Boolean(options.delegatesFocus),
        clonable: Boolean(options.clonable),
        serializable: Boolean(options.serializable),
      });
    }

    get shadowRoot(): ShadowRoot | null {
      const fragment = shadowRoots.get(element(this));
      if (!fragment) return null;
      const shadow = wrap(fragment) as ShadowRoot;
      return shadow.mode === "open" ? shadow : null;
    }

    before(...nodes: (Node | string)[]): void {
      editSiblings(this, element(this), "before", nodes);
    }
    after(...nodes: (Node | string)[]): void {
      editSiblings(this, element(this), "after", nodes);
    }
    replaceWith(...nodes: (Node | string)[]): void {
      editSiblings(this, element(this), "replace", nodes);
    }
    remove(): void {
      const owner = element(this).parentNode;
      if (owner) wrap(owner).removeChild(this);
    }

    get localName(): string {
      return elementLocalName(element(this));
    }
    get tagName(): string {
      return qualifiedElementName(element(this));
    }
    get namespaceURI(): string | null {
      return element(this).namespaceURI || null;
    }
    get prefix(): string | null {
      return rawElementPrefix(element(this));
    }
    get className(): string | SVGAnimatedString {
      return this.getAttribute("class") ?? "";
    }
    set className(value: string) {
      this.setAttribute("class", domString(value));
    }
    get classList(): DOMTokenList {
      let list = classLists.get(this);
      if (!list) {
        list = new DOMTokenList(token, this);
        classLists.set(this, list);
      }
      return list;
    }
    set classList(value: string) {
      this.classList.value = value;
    }
    get id(): string {
      return this.getAttribute("id") ?? "";
    }
    set id(value: string) {
      this.setAttribute("id", value);
    }
    get attributes(): NamedNodeMap {
      const maps = (attributeMaps ??= new WeakMap());
      let map = maps.get(this);
      if (!map) {
        map = new NamedNodeMap(token, this);
        maps.set(this, map);
      }
      return map;
    }
    getAttributeNode(name: string): Attr | null {
      const attr = findAttribute(element(this), String(name));
      return attr ? wrapAttribute(attr, this) : null;
    }
    getAttributeNodeNS(namespace: string | null, localName: string): Attr | null {
      const attr = findAttributeNS(element(this), nullableNamespace(namespace), String(localName));
      return attr ? wrapAttribute(attr, this) : null;
    }
    setAttributeNode(attr: Attr): Attr | null {
      return attachAttribute(this, attr);
    }
    setAttributeNodeNS(attr: Attr): Attr | null {
      return attachAttribute(this, attr);
    }
    removeAttributeNode(attr: Attr): Attr {
      return detachAttribute(this, attr);
    }
    getAttribute(name: string): string | null {
      if (arguments.length < 1) throw new TypeError("Missing attribute argument");
      return findAttribute(element(this), String(name))?.value ?? null;
    }
    getAttributeNS(namespace: string | null, localName: string): string | null {
      if (arguments.length < 2) throw new TypeError("Missing attribute argument");
      return (
        findAttributeNS(element(this), nullableNamespace(namespace), String(localName))?.value ??
        null
      );
    }
    getAttributeNames(): string[] {
      return element(this).attrs.map(qualifiedAttributeName);
    }
    hasAttributes(): boolean {
      return element(this).attrs.length !== 0;
    }
    hasAttribute(name: string): boolean {
      if (arguments.length < 1) throw new TypeError("Missing attribute argument");
      return findAttribute(element(this), String(name)) !== undefined;
    }
    hasAttributeNS(namespace: string | null, localName: string): boolean {
      if (arguments.length < 2) throw new TypeError("Missing attribute argument");
      return (
        findAttributeNS(element(this), nullableNamespace(namespace), String(localName)) !==
        undefined
      );
    }
    setAttribute(name: string, value: string): void {
      if (arguments.length < 2) throw new TypeError("Missing attribute argument");
      const record = element(this);
      const key = attributeName(record, String(name));
      if (!validAttributeName(key))
        throw new DOMException("Invalid attribute name", "InvalidCharacterError");
      setAttributeValue(this, findAttribute(record, key), { name: key, value });
    }
    setAttributeNS(namespace: string | null, qualifiedName: string, value: string): void {
      if (arguments.length < 3) throw new TypeError("Missing attribute argument");
      const ns = nullableNamespace(namespace);
      const { name, prefix } = extractName(ns, String(qualifiedName), "attribute");
      setAttributeValue(this, findAttributeNS(element(this), ns, name), {
        name,
        value,
        ...(ns === null ? {} : { namespace: ns }),
        ...(prefix === null ? {} : { prefix }),
      });
    }
    removeAttribute(name: string): void {
      if (arguments.length < 1) throw new TypeError("Missing attribute argument");
      removeAttributeRecord(this, findAttribute(element(this), String(name)));
    }
    removeAttributeNS(namespace: string | null, localName: string): void {
      if (arguments.length < 2) throw new TypeError("Missing attribute argument");
      removeAttributeRecord(
        this,
        findAttributeNS(element(this), nullableNamespace(namespace), String(localName)),
      );
    }
    toggleAttribute(name: string, force?: boolean): boolean {
      if (arguments.length < 1) throw new TypeError("Missing attribute argument");
      const record = element(this);
      const key = attributeName(record, String(name));
      if (!validAttributeName(key))
        throw new DOMException("Invalid attribute name", "InvalidCharacterError");
      const existing = findAttribute(record, key);
      if (!existing && (force === undefined || force)) {
        setAttributeValue(this, undefined, { name: key, value: "" });
        return true;
      }
      if (existing && (force === undefined || !force)) {
        removeAttributeRecord(this, existing);
        return false;
      }
      return existing !== undefined;
    }
    get style(): ReturnType<ReturnType<typeof styles>["inlineStyle"]> {
      return styles().inlineStyle(element(this));
    }
    set style(value: string) {
      styles().inlineStyle(element(this)).cssText = `${value}`;
    }
    matches(selector: string): boolean {
      const record = element(this);
      if (arguments.length < 1) throw new TypeError("1 argument required");
      return elementMatches(record, domString(selector));
    }
    webkitMatchesSelector(selector: string): boolean {
      const record = element(this);
      if (arguments.length < 1) throw new TypeError("1 argument required");
      return elementMatches(record, domString(selector));
    }
    closest(selector: string): Element | null {
      const record = element(this);
      if (arguments.length < 1) throw new TypeError("1 argument required");
      const matches = selectorPredicate(domString(selector), xmlDocumentFor(record), record);
      for (
        let current: Raw.ParentNode | null = record;
        current && tree.isElementNode(current);
        current = current.parentNode
      ) {
        if (matches(current)) return wrapElement(current);
      }
      return null;
    }
    get children(): HTMLCollection {
      return childElements(this, element(this));
    }
    get childElementCount(): number {
      return this.children.length;
    }
    get lastElementChild(): Element | null {
      return edgeElement(element(this), true);
    }
    get innerHTML(): string {
      const record = element(this);
      return xmlDocumentFor(record)
        ? serializeXML((templateContent(record) ?? record).childNodes, {
            requireWellFormed: true,
            DOMException,
          })
        : serialize(record, customIsValues && customElementSerialization);
    }
    set innerHTML(value: string | null) {
      const record = element(this);
      const markup = value === null ? "" : domString(value);
      const { fragment, effects } = parseElementMarkup(record, markup);
      replaceElementMarkup(record, fragment, effects);
    }
    getHTML(options?: GetHTMLOptions | null): string {
      return serializeWithShadows(element(this), options);
    }
    setHTMLUnsafe(markup: string): void {
      if (arguments.length === 0) throw new TypeError("HTML is required");
      const record = element(this);
      const fragment = parseUnsafeMarkup(record, `${markup}`);
      replaceElementMarkup(record, fragment.content);
      for (const shadow of fragment.shadows) reconcileSlots(shadow);
    }
    insertAdjacentElement<T extends Element>(position: string, value: T): T | null {
      const node = element(this);
      if (arguments.length < 2) throw new TypeError("Expected a position and element");
      const where = `${position}`;
      element(value);
      const point = adjacentInsertionPoint(node, where);
      if (!point) return null;
      Node.prototype.insertBefore.call(
        wrap(point.target),
        value,
        point.before ? wrap(point.before) : null,
      );
      return value;
    }
    insertAdjacentText(position: string, value: string): void {
      const node = element(this);
      if (arguments.length < 2) throw new TypeError("Expected a position and text");
      const where = `${position}`;
      const text = `${value}`;
      const point = adjacentInsertionPoint(node, where);
      if (!point) return;
      const inserted = owned(new Text(text), ownerRecord(node));
      Node.prototype.insertBefore.call(
        wrap(point.target),
        inserted,
        point.before ? wrap(point.before) : null,
      );
    }
    insertAdjacentHTML(position: string, value: string): void {
      if (arguments.length < 2) throw new TypeError("Expected a position and markup");
      const node = element(this);
      const where = domString(position);
      const markup = domString(value);
      const point = adjacentInsertionPoint(node, where);
      if (!point || isDocumentRecord(point.target))
        throw new DOMException("No element or fragment parent", "NoModificationAllowedError");
      const { target, before } = point;
      const xml = xmlDocumentFor(node);
      const context =
        tree.isElementNode(target) &&
        (xml || target.namespaceURI !== html.NS.HTML || target.tagName !== "html")
          ? target
          : tree.createElement("body", html.NS.HTML, []);
      const fragment = xml
        ? parseXMLFragment({ context, markup, url: url.href, DOMException })
        : parseOwnedHTMLFragment({
            context,
            markup,
            options: detailsParserOptions(markup, inertParsing),
          });
      markScriptsInert(fragment);
      const realm = owningRealm(target);
      const insert = realm === token ? insertNodeRecord : realmTreeOperations.get(realm)?.insert;
      if (!insert) throw new Error("A node must have an insertion realm");
      insert(target, fragment, before, false);
    }
    get outerHTML(): string {
      const record = element(this);
      return xmlDocumentFor(record)
        ? serializeXML([record], { requireWellFormed: true, DOMException })
        : serializeOuter(record, customIsValues && customElementSerialization);
    }
    set outerHTML(value: string | null) {
      replaceMarkup(element(this), value === null ? "" : domString(value));
    }
    get firstElementChild(): Element | null {
      return edgeElement(element(this), false);
    }
    get nextElementSibling(): Element | null {
      return adjacentElement(element(this), 1);
    }
    get previousElementSibling(): Element | null {
      return adjacentElement(element(this), -1);
    }
    getElementsByTagName(name: string): HTMLCollection {
      if (arguments.length < 1) throw new TypeError("A tag name is required");
      return elementsByTag(element(this), String(name));
    }
    getElementsByTagNameNS(namespace: string | null, localName: string): HTMLCollection {
      if (arguments.length < 2) throw new TypeError("A namespace and local name are required");
      return elementsByNamespace(
        element(this),
        namespace == null ? null : String(namespace),
        String(localName),
      );
    }
    getElementsByClassName(names: string): HTMLCollection {
      if (arguments.length < 1) throw new TypeError("Class names are required");
      return elementsByClass(element(this), String(names));
    }
    querySelector(selector: string): Element | null {
      if (arguments.length < 1) throw new TypeError("1 argument required");
      return query(this, domString(selector));
    }
    querySelectorAll(selector: string): NodeList<Element> {
      if (arguments.length < 1) throw new TypeError("1 argument required");
      return queryAll(this, domString(selector));
    }
  }

  const clicking = new WeakSet<Raw.Element>();

  function isDisabledControl(node: Raw.Element): boolean {
    if (attribute(node, "disabled") !== null) return true;
    let child = node;
    for (let parent = parentElementRecord(node); parent; parent = parentElementRecord(parent)) {
      if (
        parent.namespaceURI === html.NS.HTML &&
        parent.tagName === "fieldset" &&
        attribute(parent, "disabled") !== null
      ) {
        const legend = parent.childNodes.find(
          (candidate) =>
            tree.isElementNode(candidate) &&
            candidate.namespaceURI === html.NS.HTML &&
            candidate.tagName === "legend",
        );
        if (child !== legend) return true;
      }
      child = parent;
    }
    return false;
  }

  function matchesDisabledState(node: Raw.Element, disabled: boolean): boolean {
    if (node.namespaceURI !== html.NS.HTML) return false;
    const name = node.tagName;
    if (name === "option") return optionIsDisabled(node) === disabled;
    const eligible =
      focusableControls.has(name) ||
      name === "fieldset" ||
      name === "optgroup" ||
      (hasCustomElements && customStates.get(node)?.formAssociated);
    return !!eligible && isDisabledControl(node) === disabled;
  }

  function focusable(node: Raw.Element, view: Window): boolean {
    const name = elementLocalName(node);
    const svg = node.namespaceURI === html.NS.SVG;
    if (
      !svg &&
      (focusableControls.has(name) ||
        (hasCustomElements && customStates.get(node)?.formAssociated)) &&
      (isDisabledControl(node) || (name === "input" && inputType(node) === "hidden"))
    )
      return false;
    const tabindex = attribute(node, "tabindex");
    const eligible = svg
      ? (name === "a" && attribute(node, "href") !== null) ||
        !Number.isNaN(reflectedLong(node, "tabindex", NaN))
      : focusableControls.has(name) ||
        ((name === "audio" || name === "video") && attribute(node, "controls") !== null) ||
        (name === "summary" && summaryDetails(node) !== null) ||
        (name === "dialog" && matchesOpenState(node)) ||
        name === "iframe" ||
        ((name === "a" || name === "area") && attribute(node, "href") !== null) ||
        isEditingHost(node) ||
        (tabindex !== null && /^\s*[+-]?\d/.test(tabindex));
    if (!eligible) return false;
    let child: Raw.Element | null = null;
    let readDisplay: ((node: Raw.Element) => boolean | undefined) | undefined;
    let didCheckNativeReader = false;
    for (
      let current: Raw.Node | null = node;
      current;
      current = assignedSlot(current) ?? treeParent(current, true)
    ) {
      if (!tree.isElementNode(current)) continue;
      const domParent = current.parentNode;
      if (!assignedSlot(current) && domParent && tree.isElementNode(domParent)) {
        if (shadowRoots.has(domParent)) return false;
        if (isSlot(domParent) && slotMembers(domParent, false).length) return false;
      }
      if (
        child &&
        current.tagName === "details" &&
        current.namespaceURI === html.NS.HTML &&
        attribute(current, "open") === null &&
        child !== firstDetailsSummary(current)
      )
        return false;
      child = current;
      if (
        (svg &&
          current.namespaceURI === html.NS.SVG &&
          nonRenderedSVGElements.has(current.tagName)) ||
        (!options.jsdomCompatibility && attribute(current, "inert") !== null)
      )
        return false;

      const getStyle = view.getComputedStyle;
      let hidden: boolean | undefined;
      if (
        view === window &&
        getStyle === nativeGetComputedStyle &&
        Object.getOwnPropertyDescriptor(view, "getComputedStyle")?.value === getStyle
      ) {
        if (!didCheckNativeReader) {
          didCheckNativeReader = true;
          // A custom viewport getter can run script on each individual style read.
          if (hasNativeViewportReaders()) readDisplay = styles().focusDisplayCheck();
        }
        hidden = readDisplay?.(current);
      }
      if (
        hidden ??
        Reflect.apply(getStyle, view, [wrapElement(current)]).getPropertyValue("display") === "none"
      )
        return false;
    }
    return true;
  }

  function fireViewportFocus(view: Window, focus: boolean): void {
    view.dispatchEvent(events.trusted(new view.FocusEvent(focus ? "focus" : "blur", { view })));
  }

  function clearProjectedFocus(frame: Raw.Element): boolean {
    let child = projectedFrameFocus.get(frame);
    if (!child) return false;
    const viewports: { owner: Raw.Document; view: Window }[] = [];
    // The frame-depth limit bounds this projection chain to 32 browsing contexts.
    while (child) {
      projectedFrameFocus.delete(frame);
      const focused = focusStates.get(child)?.element;
      focusStates.delete(child);
      focusRequests.set(child, Symbol());
      focusedDocuments.delete(child);
      const view = documentViews.get(child) as Window | undefined;
      if (view) viewports.push({ owner: child, view });
      if (!focused) break;
      if (projectedFrameFocus.has(focused)) {
        frame = focused;
        child = projectedFrameFocus.get(frame);
        continue;
      }
      const realm = documentRealms.get(child);
      const wrap = realm && realmWrappers.get(realm);
      if (view && wrap && treeRoot(focused, true) === child)
        fireFocusPair(wrap(focused) as Element, null, view, false);
      break;
    }
    for (const { owner, view } of viewports.toReversed())
      if (!focusStates.has(owner)) fireViewportFocus(view, false);
    return true;
  }

  function propagateFrameFocus(owner: Raw.Document, focus: boolean): void {
    // Each step follows a connected embedding frame to its parent document.
    for (let frame = focusFrameOwners.get(owner); frame; frame = focusFrameOwners.get(owner)) {
      const parent = treeRoot(frame, true);
      if (!isDocumentRecord(parent) || parent === owner) return;
      const current = focusStates.get(parent)?.element;
      if (focus) {
        if (current !== frame) {
          const parentView = documentViews.get(parent) as Window | undefined;
          const previous = current && parentView?.document.activeElement;
          focusStates.delete(parent);
          const projected = current && clearProjectedFocus(current);
          if (!projected && previous && parentView)
            fireFocusPair(previous, null, parentView, false);
          if (
            focusStates.has(parent) ||
            !focusStates.has(owner) ||
            treeRoot(frame, true) !== parent
          )
            return;
          focusStates.set(parent, { kind: "element", element: frame });
        }
        projectedFrameFocus.set(frame, owner);
        focusedDocuments.add(parent);
      } else {
        focusedDocuments.delete(owner);
        if (projectedFrameFocus.get(frame) !== owner) return;
        projectedFrameFocus.delete(frame);
        if (current !== frame) return;
        focusStates.delete(parent);
      }
      owner = parent;
    }
  }

  function focusViewport(): void {
    updateFocus(null, true, true);
  }

  function updateFocus(target: Element | null, focus: boolean, forceViewport = false): void {
    const node = target ? element(target) : null;
    const owner = node ? ownerRecord(node) : source;
    const view = documentViews.get(owner) as Window | undefined;
    if (!view) return;
    const state = focusStates.get(owner);
    const previous = state?.element;
    let viewport = false;
    if (focus) {
      if (node && (!isDocumentRecord(treeRoot(node, true)) || !withinActiveModal(node))) return;
      const eligible = node !== null && focusable(node, view);
      viewport =
        forceViewport ||
        (node !== null &&
          !eligible &&
          node.parentNode === owner &&
          owner.childNodes.find(tree.isElementNode) === node);
      if (!viewport && !eligible) return;
      if (viewport ? state?.kind === "viewport" : previous === node) return;
      if (!viewport && node && isFrame(node)) {
        const child = frameWindow(node);
        const childRecord = child && nodeRecord(child.document)?.node;
        const childRealm =
          childRecord && isDocumentRecord(childRecord) && documentRealms.get(childRecord);
        if (childRealm) {
          realmTreeOperations.get(childRealm)?.focusViewport();
          return;
        }
      }
    } else if (!node || previous !== node || !focusable(node, view)) return;

    const request = Symbol();
    focusRequests.set(owner, request);
    const next = focus && !viewport ? target : null;
    focusStates.delete(owner);
    const projected = previous && clearProjectedFocus(previous);
    const old =
      previous && !projected && treeRoot(previous, true) === owner ? wrapElement(previous) : null;
    if (old) fireFocusPair(old, next, view, false);
    // A callback can focus another target or make the requested target non-focusable.
    if (focusRequests.get(owner) !== request || focusStates.has(owner)) return;
    if (focus && focusFrameOwners.has(owner) && !focusedDocuments.has(owner)) {
      // A browsing context gains focus before its element, with the viewport as the interim target.
      focusStates.set(owner, { kind: "viewport" });
      focusedDocuments.add(owner);
      propagateFrameFocus(owner, true);
      fireViewportFocus(view, true);
      if (focusRequests.get(owner) !== request || focusStates.get(owner)?.kind !== "viewport")
        return;
      focusStates.delete(owner);
    }
    if (viewport) {
      focusStates.set(owner, { kind: "viewport" });
      focusedDocuments.add(owner);
      propagateFrameFocus(owner, true);
    } else if (next && node && treeRoot(node, true) === owner && focusable(node, view)) {
      focusStates.set(owner, { kind: "element", element: node });
      focusedDocuments.add(owner);
      propagateFrameFocus(owner, true);
      if (focusStates.get(owner)?.element === node) fireFocusPair(next, old, view, true);
    } else {
      propagateFrameFocus(owner, false);
    }
  }

  function noteFocusInput(node: Raw.Node, event: InstanceType<typeof Event>): void {
    const owner = ownerRecord(node);
    if (treeRoot(node, true) !== owner) return;
    if (event.type === "keydown") {
      if (event instanceof KeyboardEvent && !event.altKey && !event.ctrlKey && !event.metaKey)
        pointerFocusDocuments?.delete(owner);
    } else if (event instanceof MouseEvent) {
      (pointerFocusDocuments ??= new WeakSet()).add(owner);
    }
  }

  function readStyleFocusRevision(): number {
    const focused = focusStates.get(source)?.element;
    const pointer = pointerFocusDocuments?.has(source) ?? false;
    const sameElement = focused ? lastStyleFocus?.deref() === focused : !lastStyleFocus;
    if (!sameElement || pointer !== lastStylePointerFocus) {
      lastStyleFocus = focused && new WeakRef(focused);
      lastStylePointerFocus = pointer;
      styleFocusRevision++;
    }
    return styleFocusRevision;
  }

  function matchesFocusVisible(node: Raw.Element): boolean {
    if (!matchesFocus(node, false)) return false;
    const owner = ownerRecord(node);
    if (!pointerFocusDocuments?.has(owner)) return true;
    const focused = focusStates.get(owner)?.element;
    if (!focused || focused.namespaceURI !== html.NS.HTML) return false;
    const editable = attribute(focused, "contenteditable");
    return (
      focused.tagName === "textarea" ||
      (isInput(focused) && focusVisibleInputTypes.has(inputType(focused))) ||
      (editable !== null && ["", "true", "plaintext-only"].includes(asciiLower(editable)))
    );
  }

  function matchesFocus(node: Raw.Element, within: boolean): boolean {
    const owner = ownerRecord(node);
    const focused = focusStates.get(owner)?.element;
    if (!focused) return false;
    if (!within) {
      return activeElementInRoot(treeRoot(node)) === wrapElement(node);
    }
    for (let current: Raw.Node | null = focused; current; current = treeParent(current, true)) {
      if (current === node) return true;
    }
    return false;
  }

  function activeElementInRoot(root: Raw.Node): Element | null {
    const owner = ownerRecord(root);
    if (root === owner && focusStates.get(owner)?.kind === "viewport") {
      const documentElement = owner.childNodes.find(tree.isElementNode);
      if (!documentElement) return null;
      const body = documentElement.childNodes.find(
        (node) => tree.isElementNode(node) && htmlChildNamed(node, "body", "frameset"),
      );
      return wrapElement(body && tree.isElementNode(body) ? body : documentElement);
    }
    let focused = focusStates.get(owner)?.element;
    if (!focused) return null;
    if (treeRoot(focused, true) !== owner) {
      focusStates.delete(owner);
      return null;
    }
    for (let currentRoot = treeRoot(focused); focused; currentRoot = treeRoot(focused)) {
      if (currentRoot === root) return wrapElement(focused);
      const host = shadowHosts.get(currentRoot);
      if (!host) break;
      focused = host;
    }
    return null;
  }

  function fireFocusPair(
    target: Element,
    relatedTarget: Element | null,
    view: Window,
    focus: boolean,
  ): void {
    const Focus = view.FocusEvent;
    target.dispatchEvent(
      events.trusted(
        new Focus(focus ? "focus" : "blur", {
          composed: true,
          relatedTarget,
          view,
        }),
      ),
    );
    target.dispatchEvent(
      events.trusted(
        new Focus(focus ? "focusin" : "focusout", {
          bubbles: true,
          composed: true,
          relatedTarget,
          view,
        }),
      ),
    );
  }

  type CustomConstructor = new () => HTMLElement;
  type CustomDefinition = CustomLifecycle & {
    constructor: CustomConstructor;
    localName: string;
    is: string | null;
    construction: (HTMLElement | null)[];
  };

  let customDefinitions: Map<string, CustomDefinition> | undefined;
  const customConstructors = new Map<Function, string>();

  const pendingCustomNames = new Map<
    string,
    {
      promise: Promise<CustomConstructor>;
      resolve: (constructor: CustomConstructor) => void;
    }
  >();
  let definingCustomElement = false;

  function validCustomName(name: string): boolean {
    return (
      name.includes("-") &&
      /^[a-z][.0-9_a-z\u00b7\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u037d\u037f-\u1fff\u200c-\u200d\u203f-\u2040\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd\u{10000}-\u{effff}-]*$/u.test(
        name,
      ) &&
      ![
        "annotation-xml",
        "color-profile",
        "font-face",
        "font-face-src",
        "font-face-uri",
        "font-face-format",
        "font-face-name",
        "missing-glyph",
      ].includes(name)
    );
  }

  function customOption(settings: { is?: string } | string | undefined): string | null {
    const value = settings && typeof settings === "object" ? settings.is : undefined;
    return value === undefined ? null : String(value);
  }

  function customIsValue(record: Raw.Element): string | null {
    const initial = customIsValues?.get(record);
    return initial === undefined ? attribute(record, "is") : initial;
  }

  function isDefinedElement(record: Raw.Element): boolean {
    if (record.namespaceURI !== html.NS.HTML) return true;
    if (customStates.has(record)) return customStates.get(record) !== null;
    return !validCustomName(elementLocalName(record)) && customIsValue(record) === null;
  }

  function definitionForElement(record: Raw.Element): CustomDefinition | undefined {
    if (!documentViews.has(ownerRecord(record))) return undefined;
    const localName = elementLocalName(record);
    const autonomous = customDefinitions?.get(localName);
    if (autonomous?.is === null) return autonomous;
    const is = customIsValue(record);
    if (is === null) return undefined;
    const customized = customDefinitions?.get(is);
    return customized?.localName === localName && customized.is !== null ? customized : undefined;
  }

  function constructDocumentCustomElement(handle: Element): Element {
    if (!customDefinitions) return handle;
    const record = element(handle);
    if (record.namespaceURI !== html.NS.HTML) return handle;
    const definition = definitionForElement(record);
    if (!definition) return handle;
    if (definition.is !== null) {
      upgradeCustomElement(record, definition);
      return handle;
    }
    try {
      const result = new definition.constructor();
      const node = nodeRecord(result)?.node;
      if (!node || !tree.isElementNode(node) || node.namespaceURI !== html.NS.HTML)
        throw new TypeError("Custom element constructor must return a custom element");
      if (
        node.attrs.length ||
        node.childNodes.length ||
        node.parentNode ||
        ownerRecord(node) !== ownerRecord(record) ||
        elementLocalName(node) !== definition.localName
      )
        throw new DOMException("Invalid custom element construction result", "NotSupportedError");
      if (!customStates.get(node))
        throw new TypeError("Custom element constructor must return a custom element");
      const prefix = rawElementPrefix(record);
      if (prefix !== null) setRawElementPrefix(node, prefix);
      const is = customIsValue(record);
      if (is !== null) (customIsValues ??= new WeakMap()).set(node, is);
      return result;
    } catch (cause) {
      customStates.set(record, null);
      Object.setPrototypeOf(handle, HTMLUnknownElement.prototype);
      reportRuntimeError(cause);
      return handle;
    }
  }

  function callCustomCallback(
    handle: HTMLElement,
    callback: CustomCallback,
    args: unknown[],
  ): void {
    try {
      Reflect.apply(callback, handle, args);
    } catch (cause) {
      reportCallbackException(callback, cause, reportRuntimeError);
    }
  }

  function queueCustomCallback(
    record: Raw.Element,
    callback: CustomCallback,
    args: unknown[],
  ): () => void {
    const handle = wrapElement(record) as HTMLElement;
    enqueueCustomReaction(record, () => callCustomCallback(handle, callback, args));
    return () => invokeCustomReactions(record);
  }

  let pendingBackupReactions: WeakSet<Raw.Element> | undefined;

  function customAttributeChanged(
    record: Raw.Element,
    attr: AttributeRecord,
    previous: string | null,
    value: string | null,
    scheduleReaction?: typeof queueMicrotask,
  ): void {
    const definition = customStates.get(record);
    const callback = definition?.attributeChanged;
    // No callback means no element-queue entry, even when this element has older pending work.
    if (!callback || !definition.observed.has(attr.name)) return;
    const invoke = queueCustomCallback(record, callback, [
      attr.name,
      previous,
      value,
      attr.namespace ?? null,
    ]);
    if (!scheduleReaction) {
      invoke();
      return;
    }
    const pending = (pendingBackupReactions ??= new WeakSet());
    if (pending.has(record)) return;
    pending.add(record);
    scheduleReaction(() => {
      pending.delete(record);
      invokeCustomReactions(record);
    });
  }

  function upgradeCustomElement(record: Raw.Element, definition: CustomDefinition): void {
    if (customStates.has(record)) return;
    const handle = wrapElement(record) as HTMLElement;
    const attributes = definition.attributeChanged ? record.attrs.map((attr) => ({ ...attr })) : [];
    if (definition.attributeChanged)
      for (const attr of attributes) {
        if (definition.observed.has(attr.name))
          queueCustomCallback(record, definition.attributeChanged, [
            attr.name,
            null,
            attr.value,
            attr.namespace ?? null,
          ]);
      }
    if (definition.connected && connected(record))
      queueCustomCallback(record, definition.connected, []);
    customStates.set(record, null);
    definition.construction.push(handle);
    try {
      if (definition.disableShadow && shadowRoots.has(record))
        throw new DOMException("Custom element disables shadow roots", "NotSupportedError");
      if (new definition.constructor() !== handle || definition.construction.at(-1) !== null)
        throw new TypeError("Custom element constructor must return the element");
    } catch (cause) {
      discardCustomReactions(record);
      reportRuntimeError(cause);
      return;
    } finally {
      definition.construction.pop();
      constructingCustomElements.delete(record);
      if (definition.formAssociated) advanceRevision();
    }
    customStates.set(record, definition);
    if (definition.formOwnerChanged || definition.formDisabled) {
      customFormCallbackDocuments.add(ownerRecord(record));
      refreshCustomFormLifecycle([record], false);
    }
    invokeCustomReactions(record);
  }

  function refreshCustomFormLifecycle(roots: readonly Raw.Node[], includeTree = true): void {
    if (!hasFormLifecycleCallbacks) return;
    const visited = new Set<Raw.Node>();
    const reactions: (() => void)[] = [];
    for (const root of roots) {
      if (!customFormCallbackDocuments.has(ownerRecord(root))) continue;
      const scope = includeTree ? treeRoot(root, true) : root;
      if (visited.has(scope)) continue;
      visited.add(scope);
      for (const node of shadowIncludingElements(scope)) {
        const definition = customStates.get(node);
        if (!definition || (!definition.formOwnerChanged && !definition.formDisabled)) continue;
        const owner = definition.formOwnerChanged ? formOwner(node) : null;
        const disabled = !!definition.formDisabled && isDisabledControl(node);
        const previous = customFormLifecycle.get(node);
        if (previous?.owner === owner && previous.disabled === disabled) continue;
        customFormLifecycle.set(node, { owner, disabled });
        if (definition.formOwnerChanged && (previous?.owner ?? null) !== owner) {
          const callback = definition.formOwnerChanged;
          reactions.push(queueCustomCallback(node, callback, [owner ? wrapElement(owner) : null]));
        }
        if (definition.formDisabled && (previous?.disabled ?? false) !== disabled) {
          const callback = definition.formDisabled;
          reactions.push(queueCustomCallback(node, callback, [disabled]));
        }
      }
    }
    for (const reaction of reactions) reaction();
  }

  function customDisconnectReactions(roots: readonly Raw.ChildNode[]): (() => void)[] {
    const reactions: (() => void)[] = [];
    for (const root of roots) {
      if (!isDocumentRecord(treeRoot(root, true))) continue;
      for (const node of shadowIncludingElements(root)) {
        const callback = customStates.get(node)?.disconnected;
        if (callback) {
          reactions.push(queueCustomCallback(node, callback, []));
        }
      }
    }
    return reactions;
  }

  function customAdoptionReactions(
    root: Raw.Node,
    previous: Raw.Document,
    destination: Raw.Document,
  ): (() => void)[] {
    const reactions: (() => void)[] = [];
    for (const node of shadowIncludingElements(root)) {
      const definition = customStates.get(node);
      if (definition?.formOwnerChanged || definition?.formDisabled)
        customFormCallbackDocuments.add(destination);
      const callback = definition?.adopted;
      if (callback) {
        reactions.push(queueCustomCallback(node, callback, [wrap(previous), wrap(destination)]));
      }
    }
    return reactions;
  }

  function updateCustomSubtree(root: Raw.Node, connecting = false): void {
    const candidates = [...shadowIncludingElements(root)];
    const pending: Raw.Element[] = [];
    for (const node of candidates) {
      if (node.namespaceURI !== html.NS.HTML) continue;
      const existing = customStates.get(node);
      if (existing) {
        if (connecting && existing.connected && isDocumentRecord(treeRoot(node, true))) {
          queueCustomCallback(node, existing.connected, []);
          pending.push(node);
        }
        continue;
      }
      if (customStates.has(node) || (connecting && !connected(node))) continue;
      const definition = definitionForElement(node);
      if (definition) {
        enqueueCustomReaction(node, () => upgradeCustomElement(node, definition));
        pending.push(node);
      }
    }
    // Enqueue the entire finite candidate list before any author callback can mutate it.
    for (const node of pending) invokeCustomReactions(node);
  }

  function isCustomConstructor(value: unknown): value is CustomConstructor {
    if (typeof value !== "function") return false;
    // A construct trap tests constructibility without invoking the constructor or reading its prototype.
    const probe = new Proxy(value, { construct: () => ({}) });
    try {
      Reflect.construct(probe, []);
      return true;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      return false;
    }
  }

  function customStringSequence(value: unknown, name: string): string[] {
    if (value === undefined) return [];
    if (!value || (typeof value !== "object" && typeof value !== "function"))
      throw new TypeError(`${name} must be iterable`);
    const iterator: unknown = Reflect.get(value, Symbol.iterator);
    if (typeof iterator !== "function") throw new TypeError(`${name} must be iterable`);
    return Array.from(
      { [Symbol.iterator]: () => Reflect.apply(iterator, value, []) },
      (entry: unknown) => {
        if (typeof entry === "symbol") throw new TypeError("Cannot convert a Symbol to a string");
        return String(entry);
      },
    );
  }

  class CustomElementRegistry {
    constructor(key: symbol) {
      if (key !== token) throw new TypeError("Illegal constructor");
    }
    define(name: string, constructor: CustomConstructor, settings?: { extends?: string }): void {
      if (arguments.length < 2 || !isCustomConstructor(constructor))
        throw new TypeError("A custom element constructor is required");
      name = String(name);
      if (!validCustomName(name))
        throw new DOMException("Invalid custom element name", "SyntaxError");
      if (
        definingCustomElement ||
        customDefinitions?.has(name) ||
        customConstructors.has(constructor)
      )
        throw new DOMException(
          "Custom element definition already exists or is running",
          "NotSupportedError",
        );
      const extendsValue = settings?.extends;
      const localName = extendsValue === undefined ? name : String(extendsValue);
      if (extendsValue !== undefined && !builtInCustomElementNames.has(localName))
        throw new DOMException("Unknown built-in element", "NotSupportedError");
      definingCustomElement = true;
      let definition: CustomDefinition;
      try {
        const prototype: unknown = constructor.prototype;
        if (!prototype || (typeof prototype !== "object" && typeof prototype !== "function"))
          throw new TypeError("A custom element constructor must have a prototype");
        // Keep the original callback identity for reporting errors in its script realm.
        const callback = (key: string): CustomCallback | undefined => {
          const value: unknown = Reflect.get(prototype, key);
          if (value === undefined) return undefined;
          if (typeof value !== "function") throw new TypeError(`${key} must be callable`);
          return value as CustomCallback;
        };
        const connected = callback("connectedCallback");
        const disconnected = callback("disconnectedCallback");
        const adopted = callback("adoptedCallback");
        const attributeChanged = callback("attributeChangedCallback");
        const observed = attributeChanged
          ? customStringSequence(
              Reflect.get(constructor, "observedAttributes"),
              "observedAttributes",
            )
          : [];
        const disabledFeatures = customStringSequence(
          Reflect.get(constructor, "disabledFeatures"),
          "disabledFeatures",
        );
        const formAssociated = Boolean(Reflect.get(constructor, "formAssociated"));
        const formOwnerChanged = formAssociated ? callback("formAssociatedCallback") : undefined;
        const formDisabled = formAssociated ? callback("formDisabledCallback") : undefined;
        const formReset = formAssociated ? callback("formResetCallback") : undefined;
        if (formAssociated) callback("formStateRestoreCallback");
        definition = {
          constructor,
          localName,
          is: extendsValue === undefined ? null : name,
          connected,
          disconnected,
          adopted,
          attributeChanged,
          observed: new Set(observed),
          disableShadow: disabledFeatures.includes("shadow"),
          disableInternals: disabledFeatures.includes("internals"),
          formAssociated,
          formReset,
          formOwnerChanged,
          formDisabled,
          construction: [],
        };
      } finally {
        definingCustomElement = false;
      }
      (customDefinitions ??= new Map()).set(name, definition);
      customConstructors.set(constructor, name);
      hasCustomElements = true;
      if (definition.formOwnerChanged || definition.formDisabled) {
        hasFormLifecycleCallbacks = true;
        customFormCallbackDocuments.add(source);
      }
      updateCustomSubtree(source);
      pendingCustomNames.get(name)?.resolve(constructor);
      pendingCustomNames.delete(name);
    }
    get(name: string): CustomConstructor | undefined {
      if (arguments.length < 1) throw new TypeError("A custom element name is required");
      return customDefinitions?.get(String(name))?.constructor;
    }
    getName(constructor: CustomConstructor): string | null {
      if (typeof constructor !== "function")
        throw new TypeError("A custom element constructor is required");
      return customConstructors.get(constructor) ?? null;
    }
    whenDefined(name: string): Promise<CustomConstructor> {
      try {
        if (arguments.length < 1) throw new TypeError("A custom element name is required");
        if (typeof name === "symbol") throw new TypeError("Cannot convert a Symbol to a string");
        name = String(name);
      } catch (cause) {
        return registryPromise.reject(cause);
      }
      if (!validCustomName(name))
        return registryPromise.reject(
          new DOMException("Invalid custom element name", "SyntaxError"),
        );
      const definition = customDefinitions?.get(name);
      if (definition) return registryPromise.resolve(definition.constructor);
      let pending = pendingCustomNames.get(name);
      if (!pending) {
        pending = registryPromise.withResolvers<CustomConstructor>();
        pendingCustomNames.set(name, pending);
      }
      return pending.promise;
    }
    upgrade(root: Node): void {
      updateCustomSubtree(raw(root));
    }
  }

  let customRegistry: CustomElementRegistry | undefined;

  let datasets: WeakMap<Element, DOMStringMap> | undefined;

  class DOMStringMap {
    [name: string]: string | undefined;
    constructor(key: symbol, owner: Element) {
      if (key !== token) throw new TypeError("Illegal constructor");
      const record = element(owner);
      const toAttribute = (name: string) =>
        "data-" + name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
      const lookup = (name: string) =>
        /-[a-z]/.test(name) ? null : attribute(record, toAttribute(name));
      const write = (name: string, value: unknown) => {
        if (/-[a-z]/.test(name))
          throw new DOMException("Invalid dataset property name", "SyntaxError");
        Element.prototype.setAttribute.call(owner, toAttribute(name), String(value));
        return true;
      };
      return new Proxy(this, {
        get(target, key, receiver) {
          if (typeof key === "string") {
            const value = lookup(key);
            if (value !== null) return value;
          }
          return Reflect.get(target, key, receiver);
        },
        set(target, key, value) {
          return typeof key === "string" ? write(key, value) : Reflect.set(target, key, value);
        },
        has(target, key) {
          return (typeof key === "string" && lookup(key) !== null) || Reflect.has(target, key);
        },
        deleteProperty(target, key) {
          if (typeof key !== "string") return Reflect.deleteProperty(target, key);
          if (!/-[a-z]/.test(key)) Element.prototype.removeAttribute.call(owner, toAttribute(key));
          return true;
        },
        defineProperty(target, key, descriptor) {
          if (typeof key !== "string") return Reflect.defineProperty(target, key, descriptor);
          if (!("value" in descriptor) || descriptor.configurable === false) return false;
          return write(key, descriptor.value);
        },
        ownKeys(target) {
          const keys = new Set(Reflect.ownKeys(target));
          for (const attr of record.attrs) {
            if (!attr.namespace && attr.name.startsWith("data-") && !/[A-Z]/.test(attr.name))
              keys.add(
                attr.name
                  .slice(5)
                  .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
              );
          }
          return [...keys];
        },
        getOwnPropertyDescriptor(target, key) {
          const value = typeof key === "string" ? lookup(key) : null;
          return value === null
            ? Reflect.getOwnPropertyDescriptor(target, key)
            : { value, enumerable: true, writable: true, configurable: true };
        },
        preventExtensions: () => false,
      });
    }
    get [Symbol.toStringTag](): string {
      return "DOMStringMap";
    }
  }

  function datasetFor(owner: Element): DOMStringMap {
    const map = (datasets ??= new WeakMap());
    let dataset = map.get(owner);
    if (!dataset) {
      dataset = new DOMStringMap(token, owner);
      map.set(owner, dataset);
    }
    return dataset;
  }

  class SVGAnimatedString {
    readonly #owner: Element;
    constructor(key: symbol, owner: Element) {
      if (key !== token) throw new TypeError("Illegal constructor");
      this.#owner = owner;
    }
    get baseVal(): string {
      return attribute(element(this.#owner), "class") ?? "";
    }
    set baseVal(value: string) {
      Element.prototype.setAttribute.call(this.#owner, "class", domString(value));
    }
    get animVal(): string {
      return attribute(element(this.#owner), "class") ?? "";
    }
    get [Symbol.toStringTag](): string {
      return "SVGAnimatedString";
    }
  }

  function nonceAttribute(owner: Element, namespace: string): AttributeRecord | undefined {
    const record = element(owner);
    if (record.namespaceURI !== namespace) throw new TypeError("Illegal invocation");
    return findAttributeNS(record, null, "nonce");
  }

  function setNonce(owner: Element, namespace: string, value: string): void {
    const attr = nonceAttribute(owner, namespace);
    // The nonce setter does not open a custom element reaction scope.
    setAttributeValue(
      owner,
      attr,
      { name: "nonce", value: domString(value) },
      undefined,
      queueMicrotask,
    );
  }

  class SVGElement extends Element {
    get tabIndex(): number {
      const node = element(this);
      return reflectedLong(node, "tabindex", node.tagName === "a" ? 0 : -1);
    }
    set tabIndex(value: number) {
      Element.prototype.setAttributeNS.call(this, null, "tabindex", String(+value | 0));
    }
    focus(_options?: { preventScroll?: boolean; focusVisible?: boolean }): void {
      updateFocus(this, true);
    }
    blur(): void {
      updateFocus(this, false);
    }
    get nonce(): string {
      return nonceAttribute(this, html.NS.SVG)?.value ?? "";
    }
    set nonce(value: string) {
      setNonce(this, html.NS.SVG, value);
    }
    #animatedClassName: SVGAnimatedString | undefined;
    override get className(): SVGAnimatedString {
      return (this.#animatedClassName ??= new SVGAnimatedString(token, this));
    }
    get dataset(): DOMStringMap {
      return datasetFor(this);
    }
    get ownerSVGElement(): SVGSVGElement | null {
      for (
        let ancestor = parentElementRecord(element(this));
        ancestor?.namespaceURI === html.NS.SVG;
        ancestor = parentElementRecord(ancestor)
      ) {
        const name = elementLocalName(ancestor);
        // An SVG embedded in foreignObject starts a new outermost SVG fragment.
        if (name === "foreignObject") break;
        if (name === "svg") return wrapElement(ancestor) as SVGSVGElement;
      }
      return null;
    }
    get viewportElement(): SVGSVGElement | null {
      return this.ownerSVGElement;
    }
  }

  type SVGListAttribute = "systemLanguage" | "requiredExtensions";
  type SVGListState = {
    owner: SVGElement;
    name: SVGListAttribute;
    text: string | null;
    items: string[];
  };
  let svgLists: WeakMap<SVGStringList, SVGListState> | undefined;

  function svgList(list: SVGStringList): SVGListState {
    const state = svgLists?.get(list);
    if (!state) throw new TypeError("Expected an SVGStringList");
    const text = attribute(element(state.owner), state.name);
    if (text === state.text) return state;
    state.text = text;
    if (!text) state.items = [];
    else if (state.name === "systemLanguage") {
      const tokens = text.split(",");
      if (text.endsWith(",")) tokens.pop();
      state.items = tokens.map((item) => item.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, ""));
    } else state.items = text.match(/[^\t\n\f\r ]+/g) ?? [];
    return state;
  }

  function writeSVGList(state: SVGListState, items: string[]): void {
    const text = items.join(state.name === "systemLanguage" ? ", " : " ");
    state.items = items;
    state.text = text;
    Element.prototype.setAttribute.call(state.owner, state.name, text);
  }

  function svgListItem(state: SVGListState, index: number): string {
    const item = state.items[index];
    if (item === undefined)
      throw new DOMException(
        `The index provided (${index}) is greater than or equal to the maximum bound (${state.items.length}).`,
        "IndexSizeError",
      );
    return item;
  }

  class SVGStringList {
    [index: number]: string | undefined;
    constructor(key: symbol, owner: SVGElement, name: SVGListAttribute) {
      if (key !== token) throw new TypeError("Illegal constructor");
      const list: SVGStringList = new Proxy(this, {
        get(target, key, receiver) {
          const index = indexedProperty(key);
          return index === undefined
            ? Reflect.get(target, key, receiver)
            : svgList(list).items[index];
        },
        set(target, key, value: string, receiver) {
          const index = indexedProperty(key);
          if (index === undefined) return Reflect.set(target, key, value, receiver);
          SVGStringList.prototype.replaceItem.call(list, value, index);
          return true;
        },
        has(target, key) {
          const index = indexedProperty(key);
          return index === undefined
            ? Reflect.has(target, key)
            : index < svgList(list).items.length;
        },
        ownKeys(target) {
          return [
            ...svgList(list).items.map((_, index) => String(index)),
            ...Reflect.ownKeys(target),
          ];
        },
        getOwnPropertyDescriptor(target, key) {
          const index = indexedProperty(key);
          if (index === undefined) return Reflect.getOwnPropertyDescriptor(target, key);
          const value = svgList(list).items[index];
          return value === undefined
            ? undefined
            : { value, writable: true, enumerable: true, configurable: true };
        },
        defineProperty(target, key, descriptor) {
          const index = indexedProperty(key);
          if (index === undefined) return Reflect.defineProperty(target, key, descriptor);
          if (descriptor.get || descriptor.set) return false;
          // The index setter runs before the proxy checks descriptor invariants.
          SVGStringList.prototype.replaceItem.call(list, descriptor.value, index);
          return true;
        },
        deleteProperty(target, key) {
          const index = indexedProperty(key);
          return index === undefined
            ? Reflect.deleteProperty(target, key)
            : index >= svgList(list).items.length;
        },
        preventExtensions: () => false,
      });
      (svgLists ??= new WeakMap()).set(list, { owner, name, text: null, items: [] });
      return list;
    }

    get length(): number {
      return svgList(this).items.length;
    }
    get numberOfItems(): number {
      return svgList(this).items.length;
    }
    clear(): void {
      writeSVGList(svgList(this), []);
    }
    initialize(item: string): void {
      if (!arguments.length) throw new TypeError("An item is required");
      const value = domString(item);
      writeSVGList(svgList(this), [value]);
    }
    getItem(index: number): string {
      if (!arguments.length) throw new TypeError("An index is required");
      const position = +index >>> 0;
      return svgListItem(svgList(this), position);
    }
    insertItemBefore(item: string, index: number): string {
      if (arguments.length < 2) throw new TypeError("An item and index are required");
      const value = domString(item);
      const position = +index >>> 0;
      const state = svgList(this);
      writeSVGList(state, state.items.toSpliced(position, 0, value));
      return value;
    }
    replaceItem(item: string, index: number): string {
      if (arguments.length < 2) throw new TypeError("An item and index are required");
      const value = domString(item);
      const position = +index >>> 0;
      const state = svgList(this);
      svgListItem(state, position);
      writeSVGList(state, state.items.with(position, value));
      return value;
    }
    removeItem(index: number): string {
      if (!arguments.length) throw new TypeError("An index is required");
      const position = +index >>> 0;
      const state = svgList(this);
      const value = svgListItem(state, position);
      writeSVGList(state, state.items.toSpliced(position, 1));
      return value;
    }
    appendItem(item: string): string {
      if (!arguments.length) throw new TypeError("An item is required");
      const value = domString(item);
      const state = svgList(this);
      writeSVGList(state, [...state.items, value]);
      return value;
    }
    get [Symbol.toStringTag](): string {
      return "SVGStringList";
    }
  }

  class SVGGraphicsElement extends SVGElement {
    #extensions: SVGStringList | undefined;
    #languages: SVGStringList | undefined;
    get requiredExtensions(): SVGStringList {
      return (this.#extensions ??= new SVGStringList(token, this, "requiredExtensions"));
    }
    get systemLanguage(): SVGStringList {
      return (this.#languages ??= new SVGStringList(token, this, "systemLanguage"));
    }
  }
  class SVGDefsElement extends SVGGraphicsElement {}
  class SVGGElement extends SVGGraphicsElement {}
  class SVGSwitchElement extends SVGGraphicsElement {}
  class SVGSymbolElement extends SVGGraphicsElement {
    #aspectRatio: SVGAnimatedPreserveAspectRatio | undefined;
    get preserveAspectRatio(): SVGAnimatedPreserveAspectRatio {
      return (this.#aspectRatio ??= new SVGAnimatedPreserveAspectRatio(token, this));
    }
    #viewBox: SVGAnimatedRect | undefined;
    get viewBox(): SVGAnimatedRect {
      return (this.#viewBox ??= new SVGAnimatedRect(token, this));
    }
  }
  class SVGDescElement extends SVGElement {}
  class SVGMetadataElement extends SVGElement {}
  class SVGTitleElement extends SVGElement {}
  function svgFloat(value: number): number {
    const rounded = Math.fround(+value);
    if (!Number.isFinite(rounded)) throw new TypeError("Expected a finite float");
    return rounded;
  }

  class SVGNumber {
    #value = 0;
    constructor(key: symbol) {
      if (key !== token) throw new TypeError("Illegal constructor");
    }
    get value(): number {
      return this.#value;
    }
    set value(value: number) {
      this.#value = svgFloat(value);
    }
    get [Symbol.toStringTag](): string {
      return "SVGNumber";
    }
  }

  class SVGRect {
    #coordinates: RectCoordinates = { ...zeroSVGRect };
    readonly #reflection: { owner: Element; readOnly: boolean } | undefined;
    constructor(key: symbol, reflection?: { owner: Element; readOnly: boolean }) {
      if (key !== token) throw new TypeError("Illegal constructor");
      this.#reflection = reflection;
    }
    #read(): Readonly<RectCoordinates> {
      const reflection = this.#reflection;
      return reflection
        ? parseViewBox(attribute(element(reflection.owner), "viewBox"))
        : this.#coordinates;
    }
    #write(name: keyof RectCoordinates, value: number): void {
      const coordinate = svgFloat(value);
      const reflection = this.#reflection;
      if (!reflection) {
        this.#coordinates[name] = coordinate;
        return;
      }
      if (reflection.readOnly)
        throw new DOMException("This SVGRect is read-only", "NoModificationAllowedError");
      const coordinates = { ...this.#read() };
      coordinates[name] = coordinate;
      const { x, y, width, height } = coordinates;
      Element.prototype.setAttribute.call(
        reflection.owner,
        "viewBox",
        `${x} ${y} ${width} ${height}`,
      );
    }
    get x(): number {
      return this.#read().x;
    }
    set x(value: number) {
      this.#write("x", value);
    }
    get y(): number {
      return this.#read().y;
    }
    set y(value: number) {
      this.#write("y", value);
    }
    get width(): number {
      return this.#read().width;
    }
    set width(value: number) {
      this.#write("width", value);
    }
    get height(): number {
      return this.#read().height;
    }
    set height(value: number) {
      this.#write("height", value);
    }
    get [Symbol.toStringTag](): string {
      return "SVGRect";
    }
  }

  class SVGAnimatedRect {
    readonly #baseVal: SVGRect;
    readonly #animVal: SVGRect;
    constructor(key: symbol, owner: Element) {
      if (key !== token) throw new TypeError("Illegal constructor");
      this.#baseVal = new SVGRect(token, { owner, readOnly: false });
      this.#animVal = new SVGRect(token, { owner, readOnly: true });
    }
    get baseVal(): SVGRect {
      return this.#baseVal;
    }
    get animVal(): SVGRect {
      return this.#animVal;
    }
    get [Symbol.toStringTag](): string {
      return "SVGAnimatedRect";
    }
  }

  class SVGPreserveAspectRatio {
    declare static readonly SVG_PRESERVEASPECTRATIO_UNKNOWN: 0;
    declare readonly SVG_PRESERVEASPECTRATIO_UNKNOWN: 0;
    declare static readonly SVG_PRESERVEASPECTRATIO_NONE: 1;
    declare readonly SVG_PRESERVEASPECTRATIO_NONE: 1;
    declare static readonly SVG_PRESERVEASPECTRATIO_XMINYMIN: 2;
    declare readonly SVG_PRESERVEASPECTRATIO_XMINYMIN: 2;
    declare static readonly SVG_PRESERVEASPECTRATIO_XMIDYMIN: 3;
    declare readonly SVG_PRESERVEASPECTRATIO_XMIDYMIN: 3;
    declare static readonly SVG_PRESERVEASPECTRATIO_XMAXYMIN: 4;
    declare readonly SVG_PRESERVEASPECTRATIO_XMAXYMIN: 4;
    declare static readonly SVG_PRESERVEASPECTRATIO_XMINYMID: 5;
    declare readonly SVG_PRESERVEASPECTRATIO_XMINYMID: 5;
    declare static readonly SVG_PRESERVEASPECTRATIO_XMIDYMID: 6;
    declare readonly SVG_PRESERVEASPECTRATIO_XMIDYMID: 6;
    declare static readonly SVG_PRESERVEASPECTRATIO_XMAXYMID: 7;
    declare readonly SVG_PRESERVEASPECTRATIO_XMAXYMID: 7;
    declare static readonly SVG_PRESERVEASPECTRATIO_XMINYMAX: 8;
    declare readonly SVG_PRESERVEASPECTRATIO_XMINYMAX: 8;
    declare static readonly SVG_PRESERVEASPECTRATIO_XMIDYMAX: 9;
    declare readonly SVG_PRESERVEASPECTRATIO_XMIDYMAX: 9;
    declare static readonly SVG_PRESERVEASPECTRATIO_XMAXYMAX: 10;
    declare readonly SVG_PRESERVEASPECTRATIO_XMAXYMAX: 10;
    declare static readonly SVG_MEETORSLICE_UNKNOWN: 0;
    declare readonly SVG_MEETORSLICE_UNKNOWN: 0;
    declare static readonly SVG_MEETORSLICE_MEET: 1;
    declare readonly SVG_MEETORSLICE_MEET: 1;
    declare static readonly SVG_MEETORSLICE_SLICE: 2;
    declare readonly SVG_MEETORSLICE_SLICE: 2;

    static {
      Object.defineProperties(this, aspectRatioDescriptors);
      Object.defineProperties(this.prototype, aspectRatioDescriptors);
    }

    readonly #owner: Element;
    constructor(key: symbol, owner: Element) {
      if (key !== token) throw new TypeError("Illegal constructor");
      this.#owner = owner;
    }
    #read(): { alignment: string; mode: string } {
      const text = attribute(element(this.#owner), "preserveAspectRatio") ?? "";
      const match = /^(none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?: +(meet|slice))?$/.exec(text);
      return { alignment: match?.[1] ?? "xMidYMid", mode: match?.[2] ?? "meet" };
    }
    #write(alignment: string, mode: string): void {
      Element.prototype.setAttribute.call(
        this.#owner,
        "preserveAspectRatio",
        `${alignment} ${mode}`,
      );
    }
    get align(): number {
      return aspectAlignments.indexOf(this.#read().alignment);
    }
    set align(value: number) {
      const alignment = aspectAlignments[+value & 0xffff];
      if (!alignment) throw new TypeError("Invalid alignment");
      this.#write(alignment, this.#read().mode);
    }
    get meetOrSlice(): number {
      return aspectModes.indexOf(this.#read().mode);
    }
    set meetOrSlice(value: number) {
      const mode = aspectModes[+value & 0xffff];
      if (!mode) throw new TypeError("Invalid meet-or-slice value");
      this.#write(this.#read().alignment, mode);
    }
    get [Symbol.toStringTag](): string {
      return "SVGPreserveAspectRatio";
    }
  }

  class SVGAnimatedPreserveAspectRatio {
    readonly #baseVal: SVGPreserveAspectRatio;
    readonly #animVal: SVGPreserveAspectRatio;
    constructor(key: symbol, owner: Element) {
      if (key !== token) throw new TypeError("Illegal constructor");
      this.#baseVal = new SVGPreserveAspectRatio(token, owner);
      this.#animVal = new SVGPreserveAspectRatio(token, owner);
    }
    get baseVal(): SVGPreserveAspectRatio {
      return this.#baseVal;
    }
    get animVal(): SVGPreserveAspectRatio {
      return this.#animVal;
    }
    get [Symbol.toStringTag](): string {
      return "SVGAnimatedPreserveAspectRatio";
    }
  }

  function svgRootRecord(receiver: SVGSVGElement): Raw.Element {
    const node = element(receiver);
    if (node.namespaceURI !== html.NS.SVG || elementLocalName(node) !== "svg")
      throw new TypeError("Expected an SVGSVGElement");
    return node;
  }

  class SVGSVGElement extends SVGGraphicsElement {
    #aspectRatio: SVGAnimatedPreserveAspectRatio | undefined;
    get preserveAspectRatio(): SVGAnimatedPreserveAspectRatio {
      return (this.#aspectRatio ??= new SVGAnimatedPreserveAspectRatio(token, this));
    }
    #viewBox: SVGAnimatedRect | undefined;
    get viewBox(): SVGAnimatedRect {
      return (this.#viewBox ??= new SVGAnimatedRect(token, this));
    }
    createSVGNumber(): SVGNumber {
      svgRootRecord(this);
      return new SVGNumber(token);
    }
    createSVGRect(): SVGRect {
      svgRootRecord(this);
      return new SVGRect(token);
    }
    getElementById(id: string): Element | null {
      const root = svgRootRecord(this);
      if (!arguments.length) throw new TypeError("An element ID is required");
      const match = firstElementWithID(root, domString(id));
      return match ? wrapElement(match) : null;
    }
    // Legacy redraw methods preserve Web IDL validation in a headless Window.
    suspendRedraw(maxWaitMilliseconds: number): number {
      svgRootRecord(this);
      if (!arguments.length) throw new TypeError("suspendRedraw: 1 argument required");
      void +maxWaitMilliseconds;
      return 1;
    }
    unsuspendRedraw(suspendHandleID: number): void {
      svgRootRecord(this);
      if (!arguments.length) throw new TypeError("unsuspendRedraw: 1 argument required");
      void +suspendHandleID;
    }
    unsuspendRedrawAll(): void {
      svgRootRecord(this);
    }
    forceRedraw(): void {
      svgRootRecord(this);
    }
  }

  function wrapSVGElement(node: Raw.Element): SVGElement {
    switch (elementLocalName(node)) {
      case "svg":
        return new SVGSVGElement(token, node);
      case "defs":
        return new SVGDefsElement(token, node);
      case "g":
        return new SVGGElement(token, node);
      case "switch":
        return new SVGSwitchElement(token, node);
      case "symbol":
        return new SVGSymbolElement(token, node);
      case "desc":
        return new SVGDescElement(token, node);
      case "metadata":
        return new SVGMetadataElement(token, node);
      case "title":
        return new SVGTitleElement(token, node);
      default:
        return new SVGElement(token, node);
    }
  }

  function labelable(record: Raw.Element): boolean {
    if (record.namespaceURI !== html.NS.HTML) return false;
    if (isInput(record)) return inputType(record) !== "hidden";
    return (
      labelableTags.has(elementLocalName(record)) ||
      (customStates.get(record) ?? constructingCustomElements.get(record))?.formAssociated === true
    );
  }

  function labelControl(label: Raw.Element, root: Raw.Node): Raw.Element | null {
    const name = attribute(label, "for");
    if (name !== null) {
      if (!name) return null;
      const match = firstElementWithID(root, name);
      return match && labelable(match) ? match : null;
    }
    for (const candidate of descendants(label))
      if (tree.isElementNode(candidate) && labelable(candidate)) return candidate;
    return null;
  }

  type LabelIndex = { revision: number; controls: WeakMap<Raw.Element, WeakRef<Raw.Element>[]> };
  let labelIndices: WeakMap<Raw.ParentNode, LabelIndex> | undefined;
  const emptyLabels: readonly WeakRef<Raw.Element>[] = [];

  function associatedLabels(target: Raw.Element): readonly WeakRef<Raw.Element>[] {
    const root = treeRoot(target);
    if (!("childNodes" in root)) return emptyLabels;
    const local = owningRealm(root) === token;
    const indices = (labelIndices ??= new WeakMap());
    const known = local && indices.get(root);
    if (known && known.revision === revision) return known.controls.get(target) ?? emptyLabels;
    const controls = new WeakMap<Raw.Element, WeakRef<Raw.Element>[]>();
    function collect(label: Raw.Element): void {
      const control = labelControl(label, root);
      if (!control) return;
      const labels = controls.get(control);
      if (labels) labels.push(new WeakRef(label));
      else controls.set(control, [new WeakRef(label)]);
    }
    if (tree.isElementNode(root) && isLabel(root)) collect(root);
    // A single tree-order pass builds associations for every control in the root.
    // Weak keys and label references do not retain removed subtrees between reads.
    for (const node of descendants(root)) {
      if (tree.isElementNode(node) && isLabel(node)) collect(node);
    }
    // Original wrappers survive adoption. Their destination's changes do not
    // advance this Window's revision, so foreign roots are deliberately uncached.
    if (local) indices.set(root, { revision, controls });
    return controls.get(target) ?? emptyLabels;
  }

  let controlLabels: WeakMap<Raw.Element, NodeList<Element>> | undefined;
  function labelsFor(target: Raw.Element): NodeList<Element> {
    const lists = (controlLabels ??= new WeakMap());
    const existing = lists.get(target);
    if (existing) return existing;
    const list = new NodeList(token, {
      length: () => associatedLabels(target).length,
      at(index) {
        const label = associatedLabels(target)[index]?.deref();
        return label && wrapElement(label);
      },
    });
    lists.set(target, list);
    return list;
  }

  interface ElementInternals extends AriaStringProperties, AriaReferenceProperties<Element> {}
  function ariaReferenceRecord(value: unknown): Raw.Element {
    const record = value && typeof value === "object" ? nodeRecord(value)?.node : undefined;
    if (!record || !tree.isElementNode(record)) throw new TypeError("Expected an Element");
    return record;
  }

  function ariaReferencesFrom(value: unknown, single: boolean): AriaReferences | undefined {
    if (value == null) return undefined;
    if (single) return [new WeakRef(ariaReferenceRecord(value))];
    const iterator: unknown =
      typeof value === "object" || typeof value === "function"
        ? Reflect.get(value, Symbol.iterator)
        : undefined;
    if (typeof iterator !== "function") throw new TypeError("Expected an iterable of Elements");
    return Array.from(
      { [Symbol.iterator]: () => Reflect.apply(iterator, value, []) },
      (entry) => new WeakRef(ariaReferenceRecord(entry)),
    );
  }

  function ariaReferenceInScope(source: Raw.Element, reference: Raw.Element): boolean {
    const referenceRoot = treeRoot(reference);
    let root = treeRoot(source);
    // A reference may point into the same tree or a tree containing a shadow host of that tree.
    for (;;) {
      if (root === referenceRoot) return true;
      const host = shadowHosts.get(root);
      if (!host) return false;
      root = treeRoot(host);
    }
  }

  function readAriaReferences(
    target: object,
    source: Raw.Element,
    name: string,
    single: boolean,
    internal: boolean,
  ): Element[] | null {
    const references = explicitAriaReferences?.get(target)?.get(name);
    const matches: Element[] = [];
    if (references) {
      for (const reference of references) {
        const node = reference.deref();
        if (node && ariaReferenceInScope(source, node)) matches.push(wrapElement(node));
      }
      return matches;
    }
    const content = internal ? null : attribute(source, name);
    if (content === null) return null;
    const root = treeRoot(source);
    const ids = single ? [content] : content.split(/[\t\n\f\r ]+/);
    for (const id of ids) {
      if (!id) continue;
      const node = firstElementWithID(root, id);
      if (node) matches.push(wrapElement(node));
    }
    return matches;
  }

  function cachedAriaArray(target: object, name: string, matches: Element[]): readonly object[] {
    let cache = cachedAriaArrays.get(target);
    if (!cache) cachedAriaArrays.set(target, (cache = new Map()));
    const previous = cache.get(name);
    if (
      previous?.length === matches.length &&
      previous.every((item, index) => item === matches[index])
    )
      return previous;
    const frozen = Object.freeze(realmArray.from(matches));
    cache.set(name, frozen);
    return frozen;
  }

  function installAriaReferences(prototype: object, internal: boolean): void {
    for (const [property, name] of Object.entries(ariaReferenceAttributes)) {
      const single = property === "ariaActiveDescendantElement";
      function sourceRecord(receiver: object): Raw.Element {
        if (!internal) return ariaReferenceRecord(receiver);
        const target = internalsAriaTargets.get(receiver);
        if (!target) throw new TypeError("Expected ElementInternals");
        return target;
      }
      Object.defineProperty(prototype, property, {
        configurable: true,
        enumerable: true,
        get(this: object) {
          const source = sourceRecord(this);
          const target = internal ? this : source;
          const matches = readAriaReferences(target, source, name, single, internal);
          if (!matches) {
            cachedAriaArrays.get(target)?.delete(name);
            return null;
          }
          return single ? (matches[0] ?? null) : cachedAriaArray(target, name, matches);
        },
        set(this: object, value: unknown) {
          const source = sourceRecord(this);
          const references = ariaReferencesFrom(value, single);
          if (internal) {
            updateAriaReferences(this, name, references);
            return;
          }
          const handle = wrapElement(source);
          const existing = findAttributeNS(source, null, name);
          if (references) setAttributeValue(handle, existing, { name, value: "" }, references);
          else {
            updateAriaReferences(source, name, undefined);
            removeAttributeRecord(handle, existing);
          }
        },
      });
    }
  }

  let didInstallInternalsAria = false;
  function installInternalsAria(): void {
    if (didInstallInternalsAria) return;
    Object.defineProperties(ElementInternals.prototype, internalsAriaDescriptors);
    Object.defineProperty(ElementInternals.prototype, "states", { enumerable: true });
    installAriaReferences(ElementInternals.prototype, true);
    didInstallInternalsAria = true;
  }

  class CustomStateSet {
    constructor(key: symbol, target: Raw.Element) {
      if (key !== token) throw new TypeError("Illegal constructor");
      initializeCustomStates(this, target, new Set<string>());
    }
    get size(): number {
      return customStateValues(this).size;
    }
    add(value: string): this {
      const values = customStateValues(this);
      if (!arguments.length) throw new TypeError("A state value is required");
      values.add(`${value}`);
      return this;
    }
    delete(value: string): boolean {
      const values = customStateValues(this);
      if (!arguments.length) throw new TypeError("A state value is required");
      return values.delete(`${value}`);
    }
    has(value: string): boolean {
      const values = customStateValues(this);
      if (!arguments.length) throw new TypeError("A state value is required");
      return values.has(`${value}`);
    }
    clear(): void {
      customStateValues(this).clear();
    }
    values(): SetIterator<string> {
      return Reflect.apply(realmSetValues, customStateValues(this), []);
    }
    declare keys: CustomStateSet["values"];
    entries(): SetIterator<[string, string]> {
      return Reflect.apply(realmSetEntries, customStateValues(this), []);
    }
    forEach(
      callback: (value: string, key: string, set: CustomStateSet) => void,
      thisArg?: unknown,
    ): void {
      const values = customStateValues(this);
      if (typeof callback !== "function") throw new TypeError("A callback is required");
      values.forEach((value) => Reflect.apply(callback, thisArg, [value, value, this]));
    }
    declare [Symbol.iterator]: CustomStateSet["values"];
  }
  for (const name of Object.getOwnPropertyNames(CustomStateSet.prototype)) {
    if (name !== "constructor")
      Object.defineProperty(CustomStateSet.prototype, name, { enumerable: true });
  }
  Object.defineProperties(CustomStateSet.prototype, {
    keys: {
      value: CustomStateSet.prototype.values,
      configurable: true,
      writable: true,
      enumerable: true,
    },
    [Symbol.iterator]: {
      value: CustomStateSet.prototype.values,
      configurable: true,
      writable: true,
    },
    [Symbol.toStringTag]: { value: "CustomStateSet", configurable: true },
  });

  class ElementInternals {
    readonly #target: Raw.Element;
    constructor(key: symbol, target: Raw.Element) {
      if (key !== token) throw new TypeError("Illegal constructor");
      this.#target = target;
      installInternalsAria();
      internalsAriaValues.set(this, undefined);
      internalsAriaTargets.set(this, target);
      let states: CustomStateSet | undefined;
      internalsStateSets.set(this, () => (states ??= new CustomStateSet(token, target)));
    }
    get states(): CustomStateSet {
      const read = internalsStateSets.get(this);
      if (!read) throw new TypeError("Expected ElementInternals");
      return read() as CustomStateSet;
    }
    get shadowRoot(): ShadowRoot | null {
      const root = shadowRoots.get(this.#target);
      return root && internalsVisibleShadows.has(root) ? (wrap(root) as ShadowRoot) : null;
    }
    #formAssociatedTarget(): Raw.Element {
      const target = this.#target;
      const definition = customStates.get(target) ?? constructingCustomElements.get(target);
      if (!definition?.formAssociated)
        throw new DOMException("This element is not form-associated", "NotSupportedError");
      return target;
    }
    get form(): HTMLFormElement | null {
      const owner = formOwner(this.#formAssociatedTarget());
      return owner ? (wrapElement(owner) as HTMLFormElement) : null;
    }
    setFormValue(value: string | File | globalThis.FormData | null | undefined): void {
      if (arguments.length < 1) throw new TypeError("A form value is required");
      const target = this.#formAssociatedTarget();
      if (value == null) {
        customSubmissionValues.delete(target);
        return;
      }
      const NativeFormData = hostFormData();
      if (value instanceof NativeFormData) {
        customSubmissionValues.set(
          target,
          Array.from(NativeFormData.prototype.entries.call(value)),
        );
      } else if (value instanceof File) {
        customSubmissionValues.set(target, value);
      } else {
        if (typeof value === "symbol") throw new TypeError("Cannot convert a Symbol to a string");
        customSubmissionValues.set(target, String(value).toWellFormed());
      }
    }
    setValidity(flags?: CustomValidityFlags | null, message?: string, anchor?: HTMLElement): void {
      const target = this.#formAssociatedTarget();
      if (flags != null && typeof flags !== "object" && typeof flags !== "function")
        throw new TypeError("Validity flags must be an object");
      const active = new Set(customValidityFlags.filter((flag) => Boolean(flags?.[flag])));
      if (typeof message === "symbol") throw new TypeError("Cannot convert a Symbol to a string");
      const text = message === undefined ? "" : String(message);
      if (active.size && !text)
        throw new TypeError("Invalid controls require a validation message");
      let reportTarget = target;
      if (anchor !== undefined) {
        const record = nodeRecord(anchor)?.node;
        if (!record || !tree.isElementNode(record) || record.namespaceURI !== html.NS.HTML)
          throw new TypeError("Expected an HTMLElement validation anchor");
        let ancestor: Raw.Node | null = record;
        while (ancestor && ancestor !== target) ancestor = treeParent(ancestor, true);
        if (ancestor !== target)
          throw new DOMException("Validation anchor must be within the element", "NotFoundError");
        reportTarget = record;
      }
      if (!active.size) customControlValidity?.delete(target);
      else
        (customControlValidity ??= new WeakMap()).set(target, {
          flags: active,
          message: text.replace(/\r\n?/g, "\n"),
          anchor: reportTarget,
        });
    }
    get willValidate(): boolean {
      return validationCandidate(this.#formAssociatedTarget());
    }
    get validity(): ValidityState {
      return validityFor(this.#formAssociatedTarget());
    }
    get validationMessage(): string {
      return validationMessageFor(this.#formAssociatedTarget());
    }
    checkValidity(): boolean {
      return checkControlValidity(wrapElement(this.#formAssociatedTarget()));
    }
    reportValidity(): boolean {
      const target = this.#formAssociatedTarget();
      if (!controlIsInvalid(target)) return true;
      const event = events.trusted(new Event("invalid", { cancelable: true }));
      if (wrapElement(target).dispatchEvent(event)) {
        const anchor = customControlValidity?.get(target)?.anchor;
        if (anchor) updateFocus(wrapElement(anchor) as HTMLElement, true);
      }
      return false;
    }
    get labels(): NodeList<Element> {
      return labelsFor(this.#formAssociatedTarget());
    }
    get [Symbol.toStringTag](): string {
      return "ElementInternals";
    }
  }

  function isLabel(record: Raw.Element): boolean {
    return record.namespaceURI === html.NS.HTML && elementLocalName(record) === "label";
  }

  function reflectedDirection(node: Raw.Element): string {
    const value = asciiLower(attribute(node, "dir") ?? "");
    return value === "ltr" || value === "rtl" || value === "auto" ? value : "";
  }

  function renderedTextChildren(value: string | null): Raw.ChildNode[] {
    const text = value === null ? "" : domString(value);
    const children: Raw.ChildNode[] = [];
    for (const [index, line] of text.split(/\r\n|[\r\n]/).entries()) {
      if (index) children.push(tree.createElement("br", html.NS.HTML, []));
      if (line) children.push({ nodeName: "#text", value: line, parentNode: null });
    }
    return children;
  }

  function mergeNextText(node: Raw.ChildNode | undefined): void {
    if (!node || !tree.isTextNode(node) || !node.parentNode) return;
    const owner = node.parentNode;
    const next = owner.childNodes[owner.childNodes.indexOf(node) + 1];
    if (!next || !tree.isTextNode(next)) return;
    replaceData(node, node.value.length, 0, next.value);
    Node.prototype.removeChild.call(wrap(owner), wrap(next));
  }

  let nativeHTMLElementPrototypes: Map<string, object> | undefined;

  function nativeHTMLElementPrototype(localName: string, autonomous: boolean): object {
    if (autonomous) return HTMLElement.prototype;
    const prototypes = (nativeHTMLElementPrototypes ??= new Map());
    const cached = prototypes.get(localName);
    if (cached) return cached;
    // This uses the same native interface dispatch as ordinary allocation, without a registry upgrade.
    const handle = createElementRecord(localName, html.NS.HTML, null);
    const prototype: object = Object.getPrototypeOf(handle);
    prototypes.set(localName, prototype);
    return prototype;
  }

  function customConstructorPrototype(
    target: CustomConstructor,
    definition: CustomDefinition,
  ): object {
    let prototype: unknown;
    // Native GetPrototypeFromConstructor supplies GetFunctionRealm even for bound functions and
    // nested proxies. Observe its single prototype read while preserving the original receiver.
    const probe = new Proxy(target, {
      get(original, key) {
        const value: unknown = Reflect.get(original, key, original);
        if (key === "prototype") prototype = value;
        return value;
      },
    });
    const allocated: object = Reflect.construct(Object, [], probe);
    if (prototype !== null && (typeof prototype === "object" || typeof prototype === "function"))
      return prototype;
    const realm = realmObjectPrototypes.get(Object.getPrototypeOf(allocated));
    const resolve =
      realm === undefined ? undefined : realmTreeOperations.get(realm)?.nativeHTMLElementPrototype;
    return resolve
      ? resolve(definition.localName, definition.is === null)
      : nativeHTMLElementPrototype(definition.localName, definition.is === null);
  }

  function constructHTMLElement<T extends HTMLElement>(
    active: new (...args: never[]) => T,
    target: CustomConstructor,
  ): T {
    if (active === target) throw new TypeError("Illegal constructor");
    const name = customConstructors.get(target);
    const definition = name && customDefinitions?.get(name);
    if (!definition) throw new TypeError("Illegal constructor");
    if (
      active.prototype !== nativeHTMLElementPrototype(definition.localName, definition.is === null)
    )
      throw new TypeError("Custom element does not extend the matching HTML interface");
    const prototype = customConstructorPrototype(target, definition);
    if (definition.construction.length) {
      const handle = definition.construction.at(-1);
      if (!handle) throw new TypeError("Custom element already constructed");
      definition.construction[definition.construction.length - 1] = null;
      Object.setPrototypeOf(handle, prototype);
      constructingCustomElements.set(element(handle), definition);
      if (definition.formAssociated) advanceRevision();
      return handle as T;
    }
    const handle = createElementRecord(definition.localName, html.NS.HTML, null, definition.is);
    Object.setPrototypeOf(handle, prototype);
    customStates.set(element(handle), definition);
    return handle as T;
  }

  class HTMLElement extends Element {
    get contentEditable(): string {
      return contentEditableState(element(this));
    }
    set contentEditable(value: string) {
      const state = asciiLower(`${value}`);
      if (state === "inherit") Element.prototype.removeAttribute.call(this, "contenteditable");
      else if (state === "true" || state === "false" || state === "plaintext-only")
        Element.prototype.setAttribute.call(this, "contenteditable", state);
      else throw new DOMException("Invalid contentEditable state", "SyntaxError");
    }
    get isContentEditable(): boolean {
      return editableContent(element(this));
    }
    get nonce(): string {
      return nonceAttribute(this, html.NS.HTML)?.value ?? "";
    }
    set nonce(value: string) {
      setNonce(this, html.NS.HTML, value);
    }
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key === token && record) {
        super(key, record, wrapHandle);
        return;
      }
      return constructHTMLElement(HTMLElement, new.target);
    }
    get innerText(): string {
      // A headless document uses the descendant-text fallback for unrendered elements.
      return this.textContent ?? "";
    }
    set innerText(value: string | null) {
      replaceChildren(element(this), renderedTextChildren(value));
    }
    get outerText(): string {
      return this.textContent ?? "";
    }
    set outerText(value: string | null) {
      const target = element(this);
      const children = renderedTextChildren(value);
      const owner = target.parentNode;
      if (!owner) throw new DOMException("The element has no parent", "NoModificationAllowedError");
      const position = owner.childNodes.indexOf(target);
      const previous = owner.childNodes[position - 1];
      const next = owner.childNodes[position + 1];
      const fragment = owned(new DocumentFragment(), ownerRecord(target));
      const record = raw(fragment);
      if (record.nodeName !== "#document-fragment" || !("childNodes" in record))
        throw new Error("Expected a document fragment");
      if (!children.length) children.push({ nodeName: "#text", value: "", parentNode: null });
      for (const child of children) tree.appendChild(record, child);
      Node.prototype.replaceChild.call(wrap(owner), fragment, this);
      if (next?.parentNode) {
        const siblings = next.parentNode.childNodes;
        mergeNextText(siblings[siblings.indexOf(next) - 1]);
      }
      mergeNextText(previous);
    }
    attachInternals(): ElementInternals {
      const target = element(this);
      const definition = customStates.get(target) ?? constructingCustomElements.get(target);
      if (
        customIsValue(target) !== null ||
        !definition ||
        definition.disableInternals ||
        attachedInternals.has(target)
      )
        throw new DOMException("Cannot attach internals to this element", "NotSupportedError");
      attachedInternals.add(target);
      return new ElementInternals(token, target);
    }
    get dataset(): DOMStringMap {
      return datasetFor(this);
    }
    get title(): string {
      return attribute(element(this), "title") ?? "";
    }
    set title(value: string) {
      Element.prototype.setAttribute.call(this, "title", value);
    }
    get lang(): string {
      return attribute(element(this), "lang") ?? "";
    }
    set lang(value: string) {
      Element.prototype.setAttribute.call(this, "lang", value);
    }
    get accessKey(): string {
      return attribute(element(this), "accesskey") ?? "";
    }
    set accessKey(value: string) {
      Element.prototype.setAttribute.call(this, "accesskey", value);
    }
    get headingOffset(): number {
      return Math.min(8, headingOffset(element(this)));
    }
    set headingOffset(value: number) {
      const number = +value >>> 0;
      Element.prototype.setAttribute.call(
        this,
        "headingoffset",
        String(number <= 0x7fffffff ? number : 0),
      );
    }
    get headingReset(): boolean {
      return attribute(element(this), "headingreset") !== null;
    }
    set headingReset(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "headingreset", Boolean(value));
    }
    get dir(): string {
      return reflectedDirection(element(this));
    }
    set dir(value: string) {
      Element.prototype.setAttribute.call(this, "dir", value);
    }
    get translate(): boolean {
      for (
        let current: Raw.Element | null = element(this);
        current;
        current = parentElementRecord(current)
      ) {
        if (current.namespaceURI !== html.NS.HTML) continue;
        const value = attribute(current, "translate");
        if (value === null) continue;
        const keyword = asciiLower(value);
        if (keyword === "" || keyword === "yes") return true;
        if (keyword === "no") return false;
      }
      return true;
    }
    set translate(value: boolean) {
      Element.prototype.setAttribute.call(this, "translate", value ? "yes" : "no");
    }
    get hidden(): boolean | "until-found" {
      const value = attribute(element(this), "hidden");
      if (value === null) return false;
      return asciiLower(value) === "until-found" ? "until-found" : true;
    }
    set hidden(value: boolean | number | string | null | undefined) {
      const converted =
        value == null || typeof value === "boolean" || typeof value === "number"
          ? value
          : `${value}`;
      if (!converted) {
        Element.prototype.removeAttribute.call(this, "hidden");
      } else {
        const untilFound = typeof converted === "string" && asciiLower(converted) === "until-found";
        Element.prototype.setAttribute.call(this, "hidden", untilFound ? "until-found" : "");
      }
    }
    get inert(): boolean {
      return attribute(element(this), "inert") !== null;
    }
    set inert(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "inert", Boolean(value));
    }
    get draggable(): boolean {
      const node = element(this);
      const keyword = asciiLower(attribute(node, "draggable") ?? "");
      if (keyword === "true" || keyword === "false") return keyword === "true";
      return node.tagName === "img" || (node.tagName === "a" && attribute(node, "href") !== null);
    }
    set draggable(value: boolean) {
      Element.prototype.setAttribute.call(this, "draggable", value ? "true" : "false");
    }
    get offsetParent(): Element | null {
      element(this);
      return null;
    }
    get offsetTop(): number {
      element(this);
      return 0;
    }
    get offsetLeft(): number {
      element(this);
      return 0;
    }
    get offsetWidth(): number {
      element(this);
      return 0;
    }
    get offsetHeight(): number {
      element(this);
      return 0;
    }
    get tabIndex(): number {
      const node = element(this);
      const focusableByDefault =
        defaultTabStops.has(node.tagName) ||
        (node.tagName === "summary" && summaryDetails(node) !== null);
      return reflectedLong(node, "tabindex", focusableByDefault ? 0 : -1);
    }
    set tabIndex(value: number) {
      this.setAttribute("tabindex", String(Number(value) | 0));
    }
    get autofocus(): boolean {
      return attribute(element(this), "autofocus") !== null;
    }
    set autofocus(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "autofocus", Boolean(value));
    }
    focus(_options?: { preventScroll?: boolean; focusVisible?: boolean }): void {
      updateFocus(this, true);
    }
    blur(): void {
      updateFocus(this, false);
    }

    click(): void {
      const node = element(this);
      if (clicking.has(node)) return;
      if (
        ["button", "input", "select", "textarea"].includes(node.tagName) &&
        isDisabledControl(node)
      )
        return;
      clicking.add(node);
      try {
        this.dispatchEvent(
          new PointerEvent("click", {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: -1,
            view: (documentViews.get(ownerRecord(node)) as Window | undefined) ?? null,
          }),
        );
      } finally {
        clicking.delete(node);
      }
    }
  }

  class HTMLUnknownElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLUnknownElement, new.target);
      super(key, record, wrapHandle);
    }

    get [Symbol.toStringTag](): string {
      return "HTMLUnknownElement";
    }
  }

  function firstElementWithID(root: Raw.Node, id: string): Raw.Element | null {
    if (tree.isElementNode(root) && attribute(root, "id") === id) return root;
    if (!("childNodes" in root)) return null;
    for (const candidate of descendants(root)) {
      if (tree.isElementNode(candidate) && attribute(candidate, "id") === id) return candidate;
    }
    return null;
  }

  function implicitFormOwner(node: Raw.Element): Raw.Element | null {
    for (let owner = parentElementRecord(node); owner; owner = parentElementRecord(owner)) {
      if (owner.namespaceURI === html.NS.HTML && owner.tagName === "form") return owner;
    }
    return null;
  }

  function formOwner(node: Raw.Element): Raw.Element | null {
    const id = attribute(node, "form");
    if (id === null) return parserFormOwner(node) ?? implicitFormOwner(node);
    if (!isDocumentRecord(treeRoot(node, true))) return implicitFormOwner(node);
    if (id === "") return null;
    const form = firstElementWithID(treeRoot(node), id);
    return form?.namespaceURI === html.NS.HTML && form.tagName === "form" ? form : null;
  }

  function* radioPeers(node: Raw.Element): Generator<Raw.Element> {
    const name = attribute(node, "name");
    if (!name || inputType(node) !== "radio") return;
    const root = treeRoot(node);
    if (!("childNodes" in root)) return;
    const form = formOwner(node);
    for (const peer of descendants(root)) {
      if (
        tree.isElementNode(peer) &&
        peer !== node &&
        isInput(peer) &&
        inputType(peer) === "radio" &&
        attribute(peer, "name") === name &&
        formOwner(peer) === form
      ) {
        yield peer;
      }
    }
  }

  function setChecked(node: Raw.Element, checked: boolean, dirty = false): void {
    const state = checkState(node);
    state.checked = checked;
    if (dirty) state.dirty = true;
    if (checked) {
      for (const peer of radioPeers(node)) if (checkedness(peer)) checkState(peer).checked = false;
    }
  }

  function buttonType(node: Raw.Element): string {
    const type = attribute(node, "type")?.toLowerCase();
    return type === "button" || type === "reset" ? type : "submit";
  }

  function isSubmitButton(node: Raw.Element): boolean {
    if (node.namespaceURI !== html.NS.HTML) return false;
    if (node.tagName === "button") return buttonType(node) === "submit";
    return isInput(node) && ["submit", "image"].includes(inputType(node));
  }

  const imageSubmitCoordinates = new WeakMap<Raw.Element, { x: number; y: number }>();

  function interactiveContent(node: Raw.Element): boolean {
    if (node.namespaceURI !== html.NS.HTML) return false;
    if (attribute(node, "tabindex") !== null) return true;
    if (isInput(node)) return inputType(node) !== "hidden";
    if (node.tagName === "a") return attribute(node, "href") !== null;
    if (node.tagName === "audio" || node.tagName === "video")
      return attribute(node, "controls") !== null;
    if (node.tagName === "img" || node.tagName === "object")
      return attribute(node, "usemap") !== null;
    return ["button", "details", "embed", "iframe", "label", "select", "textarea"].includes(
      node.tagName,
    );
  }

  function activateLabel(label: Raw.Element, target: Raw.Node | undefined): void {
    const control = labelControl(label, treeRoot(label));
    if (!control || matchesDisabledState(control, true)) return;
    for (
      let current: Raw.Node | null = target ?? null;
      current && current !== label;
      current = treeParent(current, false)
    ) {
      if (current === control) return;
      if (tree.isElementNode(current) && interactiveContent(current)) {
        // A target moved outside the label during dispatch no longer suppresses its activation.
        for (
          let ancestor: Raw.Node | null = current;
          ancestor;
          ancestor = treeParent(ancestor, false)
        ) {
          if (ancestor === label) return;
        }
      }
    }
    wrapElement(control).dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        detail: 1,
        view: (documentViews.get(ownerRecord(control)) as Window | undefined) ?? null,
      }),
    );
  }

  function clickActivation(
    path: readonly object[],
    event: { readonly bubbles: boolean; readonly offsetX: number; readonly offsetY: number },
  ): ((canceled: boolean) => void) | undefined {
    const limit = event.bubbles ? path.length : 1;
    for (let index = 0; index < limit; index++) {
      const target = path[index];
      const node = target && nodeRecord(target)?.node;
      if (!node || !tree.isElementNode(node) || node.namespaceURI !== html.NS.HTML) continue;
      const type = isInput(node) ? inputType(node) : null;
      if (type === "checkbox" || type === "radio") return checkableActivation(node, type);
      if (node.tagName === "label") {
        return (canceled) => {
          if (!canceled) activateLabel(node, path[0] && nodeRecord(path[0])?.node);
        };
      }
      if (node.tagName === "button" || (type !== null && type !== "hidden")) {
        return (canceled) => {
          if (canceled || isDisabledControl(node) || !isDocumentRecord(treeRoot(node, true)))
            return;
          const currentType = node.tagName === "button" ? buttonType(node) : inputType(node);
          const reset = currentType === "reset";
          if (!reset && !isSubmitButton(node)) return;
          const owner = formOwner(node);
          if (!owner) return;
          const form = wrapElement(owner) as HTMLFormElement;
          if (reset) {
            resetForm(form, "activation");
          } else {
            if (currentType === "image") {
              imageSubmitCoordinates.set(node, { x: event.offsetX, y: event.offsetY });
            }
            HTMLFormElement.prototype.requestSubmit.call(form, wrapElement(node));
          }
        };
      }
      if (node.tagName === "summary") {
        const details = summaryDetails(node);
        if (details) {
          return (canceled) => {
            if (!canceled && summaryDetails(node) === details) {
              Element.prototype.toggleAttribute.call(wrapElement(details), "open");
            }
          };
        }
      }
      if ((node.tagName === "a" || node.tagName === "area") && attribute(node, "href") !== null) {
        return (canceled) => {
          if (canceled) return;
          const href = attribute(node, "href");
          const target = attribute(node, "target")?.toLowerCase();
          if (href === null || (target && target !== "_self")) return;
          const destination = parseElementURL(node, href);
          const view = documentViews.get(ownerRecord(node));
          const control = view && windowControls.get(view);
          if (destination && control) control.navigate(destination);
        };
      }
    }
    return undefined;
  }

  function checkableActivation(
    node: Raw.Element,
    type: "checkbox" | "radio",
  ): (canceled: boolean) => void {
    const state = checkState(node);
    const before = state.checked;
    const indeterminate = state.indeterminate;
    let previous: Raw.Element | undefined;
    if (type === "radio" && !before) {
      for (const peer of radioPeers(node)) {
        if (!checkedness(peer)) continue;
        previous = peer;
        break;
      }
    }
    setChecked(node, type === "radio" || !before, true);
    if (type === "checkbox") state.indeterminate = false;
    return (canceled) => {
      if (canceled) {
        if (type === "checkbox") {
          setChecked(node, before);
          state.indeterminate = indeterminate;
        } else if (previous && [...radioPeers(node)].includes(previous)) {
          setChecked(previous, true);
        } else setChecked(node, before);
      } else if ((type === "checkbox" || !before) && isDocumentRecord(treeRoot(node, true))) {
        const input = wrapElement(node);
        input.dispatchEvent(events.trusted(new Event("input", { bubbles: true, composed: true })));
        input.dispatchEvent(events.trusted(new Event("change", { bubbles: true })));
      }
    };
  }

  class ToggleEvent extends Event {
    readonly #oldState: string;
    readonly #newState: string;
    readonly #source: Element | null;

    constructor(
      type: string,
      init?: {
        bubbles?: boolean;
        cancelable?: boolean;
        composed?: boolean;
        oldState?: string;
        newState?: string;
        source?: Element | null;
      },
    ) {
      if (arguments.length === 0) throw new TypeError("Expected an event type");
      super(type, init);
      this.#oldState = init?.oldState === undefined ? "" : `${init.oldState}`;
      this.#newState = init?.newState === undefined ? "" : `${init.newState}`;
      const source = init?.source ?? null;
      const node = source === null ? undefined : nodeRecord(source)?.node;
      if (source !== null && (!node || !tree.isElementNode(node))) {
        throw new TypeError("Expected an Element source");
      }
      this.#source = source;
    }
    get oldState(): string {
      return this.#oldState;
    }
    get newState(): string {
      return this.#newState;
    }
    get source(): Element | null {
      return this.#source;
    }
    override get [Symbol.toStringTag](): string {
      return "ToggleEvent";
    }
  }

  class SubmitEvent extends Event {
    readonly #submitter: HTMLElement | null;

    constructor(
      type: string,
      init?: {
        bubbles?: boolean;
        cancelable?: boolean;
        composed?: boolean;
        submitter?: HTMLElement | null;
      },
    ) {
      if (arguments.length === 0) throw new TypeError("Expected an event type");
      super(type, init);
      const submitter = init?.submitter;
      const node = submitter == null ? undefined : nodeRecord(submitter)?.node;
      if (
        submitter != null &&
        (!node || !tree.isElementNode(node) || node.namespaceURI !== html.NS.HTML)
      ) {
        throw new TypeError("Expected an HTMLElement submitter");
      }
      this.#submitter = submitter ?? null;
    }
    get submitter(): HTMLElement | null {
      return this.#submitter;
    }
    override get [Symbol.toStringTag](): string {
      return "SubmitEvent";
    }
  }

  const validationStates = new WeakMap<Raw.Element, ValidityState>();

  function readonlyApplies(node: Raw.Element): boolean {
    return (
      node.namespaceURI === html.NS.HTML &&
      (node.tagName === "textarea" || (isInput(node) && readonlyInputTypes.has(inputType(node))))
    );
  }

  function mutableControl(node: Raw.Element): boolean {
    return (
      !isDisabledControl(node) && !(readonlyApplies(node) && attribute(node, "readonly") !== null)
    );
  }

  function supportsRequired(node: Raw.Element): boolean {
    return (
      node.namespaceURI === html.NS.HTML &&
      (node.tagName === "select" ||
        node.tagName === "textarea" ||
        (isInput(node) && !optionalInputTypes.has(inputType(node))))
    );
  }

  function contentEditableState(
    node: Raw.Element,
  ): "true" | "false" | "plaintext-only" | "inherit" {
    const value = attribute(node, "contenteditable");
    if (value === "") return "true";
    const keyword = value === null ? "inherit" : asciiLower(value);
    return keyword === "true" || keyword === "false" || keyword === "plaintext-only"
      ? keyword
      : "inherit";
  }

  function isEditingHost(node: Raw.Element): boolean {
    if (node.namespaceURI !== html.NS.HTML) return false;
    const state = contentEditableState(node);
    return (
      state === "true" ||
      state === "plaintext-only" ||
      (node.parentNode !== null &&
        isDocumentRecord(node.parentNode) &&
        designModeDocuments.has(node.parentNode))
    );
  }

  function editableContent(node: Raw.Element): boolean {
    for (let current: Raw.Element | null = node; current; current = parentElementRecord(current)) {
      if (isEditingHost(current)) return true;
      if (
        current.namespaceURI !== html.NS.HTML &&
        !(current.namespaceURI === html.NS.SVG && current.tagName === "svg") &&
        !(current.namespaceURI === html.NS.MATHML && current.tagName === "math")
      )
        return false;
      if (contentEditableState(current) === "false") return false;
    }
    return false;
  }

  function matchesReadWrite(node: Raw.Element): boolean {
    if (isInput(node) || htmlChildNamed(node, "textarea"))
      return readonlyApplies(node) && mutableControl(node);
    return editableContent(node);
  }

  function validationCandidate(node: Raw.Element): boolean {
    const name = node.tagName;
    if (
      hasCustomElements &&
      (customStates.get(node) ?? constructingCustomElements.get(node))?.formAssociated
    )
      return (
        !isDisabledControl(node) &&
        attribute(node, "readonly") === null &&
        !hasDatalistAncestor(node)
      );
    if (node.namespaceURI !== html.NS.HTML || !validationElements.has(name) || name === "output")
      return false;
    if (isDisabledControl(node)) return false;
    if (name === "button" && buttonType(node) !== "submit") return false;
    const type = name === "input" ? inputType(node) : "";
    if (barredInputTypes.has(type)) return false;
    if (attribute(node, "readonly") !== null && (name === "textarea" || name === "input"))
      return false;
    return !hasDatalistAncestor(node);
  }

  function hasDatalistAncestor(node: Raw.Element): boolean {
    for (let parent = parentElementRecord(node); parent; parent = parentElementRecord(parent)) {
      if (parent.namespaceURI === html.NS.HTML && parent.tagName === "datalist") return true;
    }
    return false;
  }

  function inputValue(node: Raw.Element): string {
    const type = inputType(node);
    const defaultValue = attribute(node, "value") ?? "";
    switch (inputValueMode(type)) {
      case "default":
        return defaultValue;
      case "default/on":
        return attribute(node, "value") ?? "on";
      case "filename": {
        const file = inputFiles.get(node)?.item(0);
        return file ? `C:\\fakepath\\${file.name}` : "";
      }
      case "value":
        return controlValues.get(node) ?? sanitizeInputValue(node, defaultValue, type);
    }
  }

  function textareaValue(node: Raw.Element): string {
    return (controlValues.get(node) ?? childTextContent(node)).replace(/\r\n?/g, "\n");
  }

  function missingValue(node: Raw.Element): boolean {
    const required = attribute(node, "required") !== null;
    if (isInput(node)) {
      const type = inputType(node);
      if (optionalInputTypes.has(type)) return false;
      if (type === "radio") {
        if (checkedness(node)) return false;
        let groupRequired = required;
        for (const peer of radioPeers(node)) {
          if (checkedness(peer)) return false;
          if (attribute(peer, "required") !== null) groupRequired = true;
        }
        return groupRequired;
      }
      if (!required) return false;
      if (type === "checkbox") return !checkedness(node);
      if (type === "file") return filesFor(node).length === 0;
      return mutableControl(node) && inputValue(node) === "";
    }
    if (!required) return false;
    if (node.tagName === "textarea") return mutableControl(node) && textareaValue(node) === "";
    if (node.tagName === "select") {
      const members = selectMembers(node);
      const selected = members.filter(optionSelected);
      if (selected.length === 0) return true;
      const placeholder = members[0];
      return (
        selected.length === 1 &&
        selected[0] === placeholder &&
        placeholder !== undefined &&
        attribute(node, "multiple") === null &&
        selectDisplaySize(node) === 1 &&
        parentElementRecord(placeholder) === node &&
        optionValue(placeholder) === ""
      );
    }
    return false;
  }

  const inputPatterns = new WeakMap<Raw.Element, { source: string; expression: RegExp | null }>();
  const emailAddress =
    /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

  function patternMismatch(node: Raw.Element): boolean {
    if (!isInput(node)) return false;
    const type = inputType(node);
    const source = attribute(node, "pattern");
    if (source === null || !patternTypes.has(type)) return false;
    const value = inputValue(node);
    if (!value) return false;
    let pattern = inputPatterns.get(node);
    if (pattern?.source !== source) {
      let expression: RegExp | null = null;
      try {
        new RegExp(source, "v");
        expression = new RegExp(`^(?:${source})$`, "v");
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
      pattern = { source, expression };
      inputPatterns.set(node, pattern);
    }
    const { expression } = pattern;
    if (!expression) return false;
    const values =
      type === "email" && attribute(node, "multiple") !== null ? value.split(",") : [value];
    return values.some((entry) => !expression.test(entry));
  }

  function typeMismatch(node: Raw.Element): boolean {
    if (!isInput(node)) return false;
    const type = inputType(node);
    if (type !== "email" && type !== "url") return false;
    const value = inputValue(node);
    if (!value) return false;
    if (type === "url") return !URL.canParse(value);
    const values = attribute(node, "multiple") === null ? [value] : value.split(",");
    return values.some((entry) => !emailAddress.test(entry));
  }

  function matchesRange(node: Raw.Element, within: boolean): boolean {
    if (!isInput(node) || !validationCandidate(node)) return false;
    const type = inputType(node);
    if (!supportsInputNumber(type)) return false;
    const grid = inputGrid(node, type);
    if (!Number.isFinite(grid.min) && !Number.isFinite(grid.max)) return false;
    const outside = numericConstraint(node, "underflow") || numericConstraint(node, "overflow");
    return within !== outside;
  }

  function matchesIndeterminate(node: Raw.Element): boolean {
    if (node.namespaceURI !== html.NS.HTML) return false;
    if (node.tagName === "progress") return attribute(node, "value") === null;
    if (!isInput(node)) return false;
    const type = inputType(node);
    if (type === "checkbox") return checkState(node).indeterminate;
    if (type !== "radio" || checkedness(node)) return false;
    for (const peer of radioPeers(node)) if (checkedness(peer)) return false;
    return true;
  }

  function matchesDefault(node: Raw.Element): boolean {
    if (node.namespaceURI !== html.NS.HTML) return false;
    if (isInput(node) && /^(?:radio|checkbox)$/.test(inputType(node)))
      return attribute(node, "checked") !== null;
    if (node.tagName === "option") return attribute(node, "selected") !== null;
    if (!isSubmitButton(node)) return false;
    const form = formOwner(node);
    if (!form) return false;
    // Default submitters include external form-associated controls in tree order.
    const root = treeRoot(node);
    if (!("childNodes" in root)) return false;
    if (tree.isElementNode(root) && isSubmitButton(root) && formOwner(root) === form)
      return root === node;
    for (const member of descendants(root)) {
      if (tree.isElementNode(member) && isSubmitButton(member) && formOwner(member) === form)
        return member === node;
    }
    return false;
  }

  function numericConstraint(
    node: Raw.Element,
    constraint: "underflow" | "overflow" | "step",
  ): boolean {
    if (!isInput(node)) return false;
    const type = inputType(node);
    if (!supportsInputNumber(type)) return false;
    const value = inputNumber(type, inputValue(node));
    if (!Number.isFinite(value)) return false;
    const grid = inputGrid(node, type);
    if (constraint === "step") return numericStepMismatch(value, grid);
    if (type === "time" && grid.min > grid.max) return value < grid.min && value > grid.max;
    return constraint === "underflow" ? value < grid.min : value > grid.max;
  }

  class ValidityState {
    readonly #node: Raw.Element;
    constructor(key: symbol, node: Raw.Element) {
      if (key !== token) throw new TypeError("Illegal constructor");
      this.#node = node;
    }
    get badInput(): boolean {
      return customControlValidity?.get(this.#node)?.flags.has("badInput") ?? false;
    }
    get customError(): boolean {
      return (
        customControlValidity?.get(this.#node)?.flags.has("customError") ??
        customValidity.has(this.#node)
      );
    }
    get patternMismatch(): boolean {
      return (
        customControlValidity?.get(this.#node)?.flags.has("patternMismatch") ??
        patternMismatch(this.#node)
      );
    }
    get rangeOverflow(): boolean {
      return (
        customControlValidity?.get(this.#node)?.flags.has("rangeOverflow") ??
        numericConstraint(this.#node, "overflow")
      );
    }
    get rangeUnderflow(): boolean {
      return (
        customControlValidity?.get(this.#node)?.flags.has("rangeUnderflow") ??
        numericConstraint(this.#node, "underflow")
      );
    }
    get stepMismatch(): boolean {
      return (
        customControlValidity?.get(this.#node)?.flags.has("stepMismatch") ??
        numericConstraint(this.#node, "step")
      );
    }
    get tooLong(): boolean {
      return customControlValidity?.get(this.#node)?.flags.has("tooLong") ?? false;
    }
    get tooShort(): boolean {
      return customControlValidity?.get(this.#node)?.flags.has("tooShort") ?? false;
    }
    get typeMismatch(): boolean {
      return (
        customControlValidity?.get(this.#node)?.flags.has("typeMismatch") ??
        typeMismatch(this.#node)
      );
    }
    get valueMissing(): boolean {
      return (
        customControlValidity?.get(this.#node)?.flags.has("valueMissing") ??
        missingValue(this.#node)
      );
    }
    get valid(): boolean {
      if (customControlValidity?.has(this.#node)) return false;
      return (
        !this.customError &&
        !this.valueMissing &&
        !this.typeMismatch &&
        !this.patternMismatch &&
        !this.rangeOverflow &&
        !this.rangeUnderflow &&
        !this.stepMismatch
      );
    }
    get [Symbol.toStringTag](): string {
      return "ValidityState";
    }
  }

  function validityFor(node: Raw.Element): ValidityState {
    let state = validationStates.get(node);
    if (!state) {
      state = new ValidityState(token, node);
      validationStates.set(node, state);
    }
    return state;
  }

  function setValidationMessage(node: Raw.Element, value: string): void {
    const message = String(value);
    if (message) customValidity.set(node, message);
    else customValidity.delete(node);
  }

  function validationMessageFor(node: Raw.Element): string {
    if (!validationCandidate(node) || validityFor(node).valid) return "";
    return (
      customControlValidity?.get(node)?.message ??
      customValidity.get(node) ??
      "Constraints not satisfied"
    );
  }

  function controlIsInvalid(node: Raw.Element): boolean {
    return validationCandidate(node) && !validityFor(node).valid;
  }

  function checkControlValidity(control: Element): boolean {
    if (!controlIsInvalid(element(control))) return true;
    control.dispatchEvent(events.trusted(new Event("invalid", { cancelable: true })));
    return false;
  }

  function ownedValidationControls(form: Raw.Element): Generator<Raw.Element> {
    return ownedFormControls(form, validationElements, true);
  }

  function matchesValidity(node: Raw.Element, valid: boolean): boolean {
    if (node.namespaceURI !== html.NS.HTML) return false;
    if (node.tagName === "form") {
      for (const control of ownedValidationControls(node))
        if (controlIsInvalid(control)) return !valid;
      return valid;
    }
    if (node.tagName === "fieldset") {
      for (const control of descendants(node)) {
        if (tree.isElementNode(control) && controlIsInvalid(control)) return !valid;
      }
      return valid;
    }
    return validationCandidate(node) && validityFor(node).valid === valid;
  }

  const formCollectionLookups = new WeakMap<
    object,
    (name: string) => Element | RadioNodeList | undefined
  >();

  function* ownedFormControls(
    form: Raw.Element,
    controlNames: ReadonlySet<string>,
    includeCustom = false,
  ): Generator<Raw.Element> {
    const id = attribute(form, "id");
    const root = id || parserAssociatedForms.has(form) ? treeRoot(form) : form;
    if (!("childNodes" in root)) return;
    const isConnected = isDocumentRecord(treeRoot(form, true));
    const canReference = id && isConnected && firstElementWithID(root, id) === form;
    for (const node of descendants(root)) {
      if (
        !tree.isElementNode(node) ||
        node.namespaceURI !== html.NS.HTML ||
        (!controlNames.has(node.tagName) &&
          !(includeCustom && hasCustomElements && customStates.get(node)?.formAssociated))
      )
        continue;
      const ownerID = attribute(node, "form");
      if (
        ownerID === null
          ? (parserFormOwner(node) ?? implicitFormOwner(node)) === form
          : isConnected
            ? canReference && ownerID === id
            : implicitFormOwner(node) === form
      )
        yield node;
    }
  }

  function* listedFormControls(form: Raw.Element): Generator<Raw.Element> {
    for (const node of ownedFormControls(form, listedControlNames, true)) {
      if (!isInput(node) || inputType(node) !== "image") yield node;
    }
  }

  class RadioNodeList extends NodeList<Element> {
    get value(): string {
      for (const candidate of this) {
        const node = element(candidate);
        if (isInput(node) && inputType(node) === "radio" && checkedness(node)) {
          return attribute(node, "value") ?? "on";
        }
      }
      return "";
    }
    set value(value: string) {
      const requested = String(value);
      for (const candidate of this) {
        const node = element(candidate);
        if (
          isInput(node) &&
          inputType(node) === "radio" &&
          (attribute(node, "value") ?? "on") === requested
        ) {
          setChecked(node, true, true);
          return;
        }
      }
    }
    override get [Symbol.toStringTag](): string {
      return "RadioNodeList";
    }
  }

  class HTMLFormControlsCollection extends HTMLCollection<Element | RadioNodeList> {
    constructor(key: symbol, form: Raw.Element) {
      let cachedRealm: symbol | undefined;
      let cachedRevision: number | undefined;
      let records: Raw.Element[] = [];
      function current(): Raw.Element[] {
        const realm = hasAdditionalDocuments ? owningRealm(form) : token;
        const treeRevision =
          realm === token ? revision : realmTreeOperations.get(realm)?.revision();
        if (
          treeRevision === undefined ||
          realm !== cachedRealm ||
          treeRevision !== cachedRevision
        ) {
          records = [...listedFormControls(form)];
          cachedRealm = realm;
          cachedRevision = treeRevision;
        }
        return records;
      }
      function lookup(name: string): Element | RadioNodeList | undefined {
        if (!name) return undefined;
        let source: Raw.Element[] | undefined;
        let matches: Raw.Element[] = [];
        function matching(): Raw.Element[] {
          const next = current();
          if (source !== next) {
            matches = next.filter(
              (node) => attribute(node, "id") === name || attribute(node, "name") === name,
            );
            source = next;
          }
          return matches;
        }
        const initial = matching();
        if (initial.length <= 1) return initial[0] && wrapElement(initial[0]);
        return new RadioNodeList(token, {
          length: () => matching().length,
          at(index) {
            const node = matching()[index];
            return node && wrapElement(node);
          },
        });
      }
      super(
        key,
        {
          length: () => current().length,
          at(index) {
            const node = current()[index];
            return node && wrapElement(node);
          },
        },
        lookup,
      );
      formCollectionLookups.set(this, lookup);
    }
    override namedItem(name: string): Element | RadioNodeList | null {
      if (arguments.length < 1) throw new TypeError("A name is required");
      const lookup = formCollectionLookups.get(this);
      if (!lookup) throw new TypeError("Illegal invocation");
      return lookup(String(name)) ?? null;
    }
    override get [Symbol.toStringTag](): string {
      return "HTMLFormControlsCollection";
    }
  }

  class HTMLFieldSetElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLFieldSetElement, new.target);
      super(key, record, wrapHandle);
    }

    get elements(): HTMLCollection {
      return new HTMLCollection(
        token,
        descendantMembers(
          element(this),
          (node) =>
            node.namespaceURI === html.NS.HTML &&
            (listedControlNames.has(node.tagName) ||
              (hasCustomElements && customStates.get(node)?.formAssociated === true)),
        ),
      );
    }
    get form(): HTMLFormElement | null {
      const owner = formOwner(element(this));
      return owner ? (wrapElement(owner) as HTMLFormElement) : null;
    }
    get type(): string {
      return "fieldset";
    }
    get name(): string {
      return this.getAttribute("name") ?? "";
    }
    set name(value: string) {
      this.setAttribute("name", value);
    }
    get disabled(): boolean {
      return this.hasAttribute("disabled");
    }
    set disabled(value: boolean) {
      this.toggleAttribute("disabled", Boolean(value));
    }
    get willValidate(): boolean {
      return false;
    }
    get validity(): ValidityState {
      return validityFor(element(this));
    }
    get validationMessage(): string {
      return "";
    }
    setCustomValidity(message: string): void {
      if (arguments.length === 0) throw new TypeError("A validation message is required");
      setValidationMessage(element(this), message);
    }
    checkValidity(): boolean {
      return true;
    }
    reportValidity(): boolean {
      return true;
    }
  }

  const formCollections = new WeakMap<Raw.Element, HTMLFormControlsCollection>();

  function formCollection(form: Raw.Element): HTMLFormControlsCollection {
    let collection = formCollections.get(form);
    if (!collection) {
      collection = new HTMLFormControlsCollection(token, form);
      formCollections.set(form, collection);
    }
    return collection;
  }

  function* formImages(form: Raw.Element): Generator<Raw.Element> {
    const root = parserAssociatedForms.has(form) ? treeRoot(form) : form;
    if (!("childNodes" in root)) return;
    for (const node of descendants(root)) {
      if (
        tree.isElementNode(node) &&
        node.namespaceURI === html.NS.HTML &&
        node.tagName === "img" &&
        (parserFormOwner(node) ?? implicitFormOwner(node)) === form
      )
        yield node;
    }
  }

  function formProperties(target: Node, form: Raw.Element): Node {
    const pastNames = new Map<string, WeakRef<Element>>();
    const groups = new Map<string, WeakRef<RadioNodeList>>();

    function isIndex(key: string): boolean {
      return /^(0|[1-9]\d*)$/.test(key) && Number(key) < 0xffffffff;
    }

    function property(key: PropertyKey, remember = false): Element | RadioNodeList | undefined {
      if (typeof key !== "string" || Object.hasOwn(target, key)) return undefined;
      const elements = formCollection(form);
      if (isIndex(key)) return elements[Number(key)];
      if (!key) return undefined;
      let value = elements.namedItem(key);
      if (!value) {
        for (const image of formImages(form)) {
          if (attribute(image, "id") !== key && attribute(image, "name") !== key) continue;
          value = wrapElement(image);
          break;
        }
      }
      if (value instanceof RadioNodeList) {
        const cached = groups.get(key)?.deref();
        if (cached) return cached;
        if (remember) groups.set(key, new WeakRef(value));
        return value;
      }
      groups.delete(key);
      if (value) {
        if (remember) pastNames.set(key, new WeakRef(value));
        return value;
      }
      const past = pastNames.get(key)?.deref();
      if (!past) {
        pastNames.delete(key);
        return undefined;
      }
      const node = element(past);
      const owner =
        node.tagName === "img"
          ? (parserFormOwner(node) ?? implicitFormOwner(node))
          : formOwner(node);
      if (owner === form) return past;
      pastNames.delete(key);
      return undefined;
    }

    return new Proxy(target, {
      get(_target, key, receiver): unknown {
        return property(key, true) ?? Reflect.get(target, key, receiver);
      },
      has(_target, key) {
        return property(key) !== undefined || Reflect.has(target, key);
      },
      ownKeys() {
        const elements = formCollection(form);
        const keys = new Set<string | symbol>();
        for (let index = 0; index < elements.length; index++) keys.add(String(index));
        for (const control of elements) {
          for (const name of collectionNames(control)) {
            if (!isIndex(name) && !Object.hasOwn(target, name)) keys.add(name);
          }
        }
        for (const image of formImages(form)) {
          for (const name of collectionNames(wrapElement(image)))
            if (!isIndex(name) && !Object.hasOwn(target, name)) keys.add(name);
        }
        for (const name of pastNames.keys()) if (property(name)) keys.add(name);
        for (const key of Reflect.ownKeys(target)) keys.add(key);
        return [...keys];
      },
      getOwnPropertyDescriptor(_target, key) {
        const value = property(key, true);
        return value === undefined
          ? Reflect.getOwnPropertyDescriptor(target, key)
          : {
              value,
              configurable: true,
              enumerable: typeof key === "string" && isIndex(key),
              writable: false,
            };
      },
      set(_target, key, value, receiver) {
        return property(key) === undefined && Reflect.set(target, key, value, receiver);
      },
      defineProperty(_target, key, descriptor) {
        return property(key) === undefined && Reflect.defineProperty(target, key, descriptor);
      },
      deleteProperty(_target, key) {
        return property(key) === undefined && Reflect.deleteProperty(target, key);
      },
      preventExtensions: () => false,
    });
  }

  const submittingForms = new WeakSet<Raw.Element>();
  const constructingFormData = new WeakSet<Raw.Element>();

  function checkedSubmitter(form: Raw.Element, submitter: Element | null): Raw.Element | null {
    if (submitter === null) return null;
    const node = nodeRecord(submitter)?.node;
    if (!node || !tree.isElementNode(node) || !isSubmitButton(node)) {
      throw new TypeError("The specified element is not a submit button");
    }
    if (formOwner(node) !== form) {
      throw new DOMException(
        "The specified element is not owned by this form element",
        "NotFoundError",
      );
    }
    return node;
  }

  function appendFormEntries(
    data: FormData,
    form: Raw.Element,
    submitter: Raw.Element | null,
  ): void {
    for (const control of ownedFormControls(form, submissionControls, true)) {
      const tag = control.tagName;
      if (isDisabledControl(control) || hasDatalistAncestor(control)) continue;
      if (hasCustomElements && customStates.get(control)?.formAssociated) {
        const value = customSubmissionValues.get(control);
        if (value === undefined) continue;
        if (typeof value === "string" || value instanceof File) {
          const name = attribute(control, "name");
          if (name) data.append(name, value);
        } else {
          for (const [name, item] of value) data.append(name, item);
        }
        continue;
      }
      const type = isInput(control) ? inputType(control) : "";
      if ((tag === "button" || inputButtonTypes.has(type)) && control !== submitter) continue;
      if ((type === "checkbox" || type === "radio") && !checkedness(control)) continue;
      const name = attribute(control, "name");
      if (type === "image") {
        const prefix = name ? `${name}.` : "";
        const coordinates = imageSubmitCoordinates.get(control);
        data.append(`${prefix}x`, String(coordinates?.x ?? 0));
        data.append(`${prefix}y`, String(coordinates?.y ?? 0));
        continue;
      }
      if (!name) continue;
      if (tag === "select") {
        for (const option of selectMembers(control)) {
          if (optionSelected(option) && !optionIsDisabled(option))
            data.append(name, optionValue(option));
        }
      } else if (type === "file") {
        const files = inputFiles.get(control);
        if (files?.length) {
          for (const file of files) data.append(name, file);
        } else data.append(name, new File([], "", { type: "application/octet-stream" }));
      } else if (tag === "button") {
        data.append(name, attribute(control, "value") ?? "");
      } else if (type === "hidden" && asciiLower(name) === "_charset_") {
        data.append(name, "UTF-8");
      } else if (tag === "textarea") {
        const value = textareaValue(control);
        data.append(name, textareaSubmissionValue(control, value));
      } else {
        data.append(name, inputValue(control));
      }
      const dirname = attribute(control, "dirname");
      if (dirname && (tag === "textarea" || directionalityInputTypes.has(type))) {
        data.append(dirname, directionality(control));
      }
    }
  }

  function headingOffset(node: Raw.Element): number {
    const match = /^[\t\n\f\r ]*\+?(\d+)/.exec(attribute(node, "headingoffset") ?? "");
    return match ? Math.min(Number(match[1]), 0xffffffff) : 0;
  }

  function headingLevel(node: Raw.Element): number {
    const name = elementLocalName(node);
    if (node.namespaceURI !== html.NS.HTML || !/^h[1-6]$/.test(name)) return 0;
    let level = Number(name[1]);
    // The shadow-including ancestor chain is finite and acyclic; assigned slots
    // do not participate in the heading-offset ancestor chain.
    for (let current: Raw.Element | undefined = node; current;) {
      if (current.namespaceURI === html.NS.HTML) {
        level += headingOffset(current);
        if (attribute(current, "headingreset") !== null) break;
      }
      const parent: Raw.ParentNode | null = current.parentNode;
      current =
        parent && tree.isElementNode(parent)
          ? parent
          : parent
            ? shadowHosts.get(parent)
            : undefined;
    }
    return Math.min(9, level);
  }

  function directionParent(node: Raw.Element): Raw.Element | undefined {
    const parent = node.parentNode;
    return parent && tree.isElementNode(parent)
      ? parent
      : parent
        ? shadowHosts.get(parent)
        : undefined;
  }

  function containedTextDirection(node: Raw.Element, assigned = false): "ltr" | "rtl" | null {
    const pending: Raw.Node[] = [
      ...(assigned ? slotMembers(node, true) : node.childNodes),
    ].reverse();
    // Each light-tree edge is visited once. Shadow slots return host direction
    // instead of traversing back through assignments, so no slot cycle is entered.
    while (pending.length) {
      const child = pending.pop();
      if (!child) break;
      if (tree.isTextNode(child)) {
        const direction = firstStrongDirection(child.value);
        if (direction) return direction;
      } else if (tree.isElementNode(child)) {
        const name = elementLocalName(child);
        const htmlChild = child.namespaceURI === html.NS.HTML;
        const dir = asciiLower(attribute(child, "dir") ?? "");
        if (
          (htmlChild && /^(?:bdi|script|style|textarea)$/.test(name)) ||
          /^(?:ltr|rtl|auto)$/.test(dir)
        )
          continue;
        if (isSlot(child) && shadowHosts.has(treeRoot(child))) {
          const host = shadowHosts.get(treeRoot(child));
          if (host) return directionality(host);
        }
        for (let index = child.childNodes.length - 1; index >= 0; index--) {
          const descendant = child.childNodes[index];
          if (descendant) pending.push(descendant);
        }
      }
    }
    return null;
  }

  function directionality(node: Raw.Element): "ltr" | "rtl" {
    // A finite parent chain, crossing shadow roots through their host.
    for (let current: Raw.Element | undefined = node; current; current = directionParent(current)) {
      const isHTML = current.namespaceURI === html.NS.HTML;
      const dir = isHTML ? asciiLower(attribute(current, "dir") ?? "") : "";
      if (dir === "rtl" || dir === "ltr") return dir;
      const name = elementLocalName(current);
      const automatic = dir === "auto" || (isHTML && name === "bdi");
      if (automatic) {
        if (
          isHTML &&
          (name === "textarea" ||
            (name === "input" &&
              /^(?:hidden|text|search|tel|url|email|password|submit|reset|button)$/.test(
                inputType(current),
              )))
        ) {
          const value =
            controlValues.get(current) ??
            (name === "textarea" ? childTextContent(current) : (attribute(current, "value") ?? ""));
          return firstStrongDirection(value) ?? "ltr";
        }
        return (
          containedTextDirection(current, isSlot(current) && shadowHosts.has(treeRoot(current))) ??
          "ltr"
        );
      }
      if (isHTML && name === "input" && inputType(current) === "tel") return "ltr";
    }
    return "ltr";
  }

  type FormData = InstanceType<typeof globalThis.FormData>;
  let formDataClass:
    | (new (form?: HTMLFormElement, submitter?: Element | null) => FormData)
    | undefined;

  function formDataConstructor() {
    if (formDataClass) return formDataClass;
    formDataClass = class FormData extends hostFormData() {
      constructor(form?: HTMLFormElement, submitter: Element | null = null) {
        super();
        if (form === undefined) return;
        const node = nodeRecord(form)?.node;
        if (
          !node ||
          !tree.isElementNode(node) ||
          node.namespaceURI !== html.NS.HTML ||
          node.tagName !== "form"
        ) {
          throw new TypeError("Expected an HTMLFormElement");
        }
        const button = checkedSubmitter(node, submitter);
        const entryList = new (formDataConstructor())();
        constructFormData(entryList, form, node, button);
        for (const [name, value] of entryList) this.append(name, value);
      }
    };
    Object.defineProperty(formDataClass, "name", { value: "FormData", configurable: true });
    return formDataClass;
  }

  function constructFormData(
    data: FormData,
    handle: HTMLFormElement,
    form: Raw.Element,
    submitter: Raw.Element | null,
  ): void {
    if (constructingFormData.has(form)) {
      throw new DOMException("Form data construction is already in progress", "InvalidStateError");
    }
    constructingFormData.add(form);
    try {
      appendFormEntries(data, form, submitter);
      Node.prototype.dispatchEvent.call(
        handle,
        events.trusted(
          new FormDataEvent("formdata", {
            bubbles: true,
            formData: data,
          }),
        ),
      );
    } finally {
      constructingFormData.delete(form);
    }
  }

  class FormDataEvent extends Event {
    readonly #data: FormData;
    constructor(
      type: string,
      init: { formData: FormData; bubbles?: boolean; cancelable?: boolean; composed?: boolean },
    ) {
      if (arguments.length < 2 || !(init?.formData instanceof hostFormData())) {
        throw new TypeError("Expected FormData in the event initializer");
      }
      super(type, init);
      this.#data = init.formData;
    }
    get formData(): FormData {
      return this.#data;
    }
    override get [Symbol.toStringTag](): string {
      return "FormDataEvent";
    }
  }

  const resettingForms = new WeakSet<Raw.Element>();

  function resetNativeControl(control: Raw.Element): void {
    const name = control.tagName;
    if (name === "output") {
      const output = wrapElement(control) as HTMLOutputElement;
      output.textContent = output.defaultValue;
      outputDefaults.delete(control);
      return;
    }
    if (name === "select") {
      const members = selectMembers(control);
      for (const option of members) optionStates.delete(option);
      optionSelectionRevision++;
      normalizeSelection(control, members);
      return;
    }
    controlValues.delete(control);
    if (isInput(control)) {
      const files = inputFiles.get(control);
      if (files) filesAPI().clear(files);
      checkState(control).dirty = false;
      setChecked(control, attribute(control, "checked") !== null);
    }
  }

  function resetForm(handle: HTMLFormElement, origin: "activation" | "method"): void {
    const form = element(handle);
    if (form.namespaceURI !== html.NS.HTML || form.tagName !== "form")
      throw new TypeError("Expected an HTMLFormElement");
    if (resettingForms.has(form)) return;
    const reactions: (() => void)[] = [];
    resettingForms.add(form);
    try {
      const event = events.trusted(new Event("reset", { bubbles: true, cancelable: true }));
      if (!Node.prototype.dispatchEvent.call(handle, event)) return;
      for (const control of ownedFormControls(form, resettableControlNames, true)) {
        const definition = hasCustomElements ? customStates.get(control) : undefined;
        if (definition?.formAssociated) {
          const callback = definition.formReset;
          if (callback) {
            reactions.push(queueCustomCallback(control, callback, []));
          }
        } else resetNativeControl(control);
      }
    } finally {
      resettingForms.delete(form);
    }
    if (!reactions.length) return;
    const invoke = () => {
      for (const reaction of reactions) reaction();
    };
    if (origin === "activation") queueMicrotask(invoke);
    else invoke();
  }

  const defaultFormEncoding = "application/x-www-form-urlencoded";

  function formActionURL(record: Raw.Element, name: string): string {
    const owner = ownerRecord(record);
    const value = attribute(record, name)?.toWellFormed();
    if (!value) return (wrap(owner) as Document).URL;
    return parseElementURL(record, value)?.href ?? value;
  }

  function formKeyword(
    record: Raw.Element,
    name: string,
    keywords: ReadonlySet<string>,
    fallback: string,
    missing = fallback,
  ): string {
    const value = attribute(record, name);
    if (value === null) return missing;
    const keyword = asciiLower(value);
    return keywords.has(keyword) ? keyword : fallback;
  }

  function completeFormSubmission(
    handle: HTMLFormElement,
    form: Raw.Element,
    submitter: Raw.Element | null,
    origin: "submit" | "requestSubmit",
  ): void {
    constructFormData(new (formDataConstructor())(), handle, form, submitter);
    if (!isDocumentRecord(treeRoot(form, true))) return;

    const override =
      submitter && isSubmitButton(submitter)
        ? formKeyword(submitter, "formmethod", formMethods, "get", "")
        : "";
    if ((override || formKeyword(form, "method", formMethods, "get")) !== "dialog") {
      options.reportUnsupported?.(`HTMLFormElement's ${origin}() method`);
      return;
    }

    for (
      let ancestor = parentElementRecord(form);
      ancestor;
      ancestor = parentElementRecord(ancestor)
    ) {
      if (ancestor.tagName !== "dialog" || ancestor.namespaceURI !== html.NS.HTML) continue;
      let result: string | undefined;
      if (submitter && isSubmitButton(submitter)) {
        if (isInput(submitter) && inputType(submitter) === "image") {
          const coordinates = imageSubmitCoordinates.get(submitter);
          result = `${coordinates?.x ?? 0},${coordinates?.y ?? 0}`;
        } else result = attribute(submitter, "value") ?? undefined;
      }
      HTMLDialogElement.prototype.close.call(wrapElement(ancestor), result);
      return;
    }
  }

  class HTMLFormElement extends HTMLElement {
    constructor(key: symbol | undefined = undefined, node?: Raw.Element) {
      if (key !== token) return constructHTMLElement(HTMLFormElement, new.target);
      super(key, node, node ? (target) => formProperties(target, node) : undefined);
    }
    get acceptCharset(): string {
      return attribute(element(this), "accept-charset") ?? "";
    }
    set acceptCharset(value: string) {
      Element.prototype.setAttribute.call(this, "accept-charset", value);
    }
    get action(): string {
      return formActionURL(element(this), "action");
    }
    set action(value: string) {
      Element.prototype.setAttribute.call(this, "action", String(value).toWellFormed());
    }
    get enctype(): string {
      return formKeyword(element(this), "enctype", formEncodings, defaultFormEncoding);
    }
    set enctype(value: string) {
      Element.prototype.setAttribute.call(this, "enctype", value);
    }
    get encoding(): string {
      return formKeyword(element(this), "enctype", formEncodings, defaultFormEncoding);
    }
    set encoding(value: string) {
      Element.prototype.setAttribute.call(this, "enctype", value);
    }
    get method(): string {
      return formKeyword(element(this), "method", formMethods, "get");
    }
    set method(value: string) {
      Element.prototype.setAttribute.call(this, "method", value);
    }
    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      Element.prototype.setAttribute.call(this, "name", value);
    }
    get target(): string {
      return attribute(element(this), "target") ?? "";
    }
    set target(value: string) {
      Element.prototype.setAttribute.call(this, "target", value);
    }
    get elements(): HTMLFormControlsCollection {
      return formCollection(element(this));
    }
    get length(): number {
      return formCollection(element(this)).length;
    }

    reset(): void {
      resetForm(this, "method");
    }

    get noValidate(): boolean {
      return this.hasAttribute("novalidate");
    }
    set noValidate(value: boolean) {
      this.toggleAttribute("novalidate", Boolean(value));
    }
    checkValidity(): boolean {
      const form = element(this);
      const controls = [...ownedValidationControls(form)].filter(controlIsInvalid);
      for (const control of controls) {
        wrapElement(control).dispatchEvent(
          events.trusted(new Event("invalid", { cancelable: true })),
        );
      }
      return controls.length === 0;
    }
    reportValidity(): boolean {
      return HTMLFormElement.prototype.checkValidity.call(this);
    }
    submit(): void {
      const form = element(this);
      if (!isDocumentRecord(treeRoot(form, true)) || constructingFormData.has(form)) return;
      completeFormSubmission(this, form, null, "submit");
    }
    requestSubmit(submitter: Element | null = null): void {
      const form = element(this);
      const button = checkedSubmitter(form, submitter);
      if (
        !isDocumentRecord(treeRoot(form, true)) ||
        submittingForms.has(form) ||
        constructingFormData.has(form)
      )
        return;
      submittingForms.add(form);
      try {
        if (
          attribute(form, "novalidate") === null &&
          (!button || attribute(button, "formnovalidate") === null) &&
          !HTMLFormElement.prototype.checkValidity.call(this)
        )
          return;
        const event = events.trusted(
          new SubmitEvent("submit", {
            bubbles: true,
            cancelable: true,
            submitter: submitter as HTMLElement | null,
          }),
        );
        if (
          !Node.prototype.dispatchEvent.call(this, event) ||
          !isDocumentRecord(treeRoot(form, true))
        )
          return;
        // The submit event may move the submitter. Entry construction still uses its original identity.
        completeFormSubmission(this, form, button, "requestSubmit");
      } finally {
        submittingForms.delete(form);
      }
    }
  }

  class HTMLButtonElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLButtonElement, new.target);
      super(key, record, wrapHandle);
    }

    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      Element.prototype.setAttribute.call(this, "name", value);
    }
    get value(): string {
      return attribute(element(this), "value") ?? "";
    }
    set value(value: string) {
      Element.prototype.setAttribute.call(this, "value", value);
    }
    get labels(): NodeList<Element> {
      return labelsFor(element(this));
    }
    get formAction(): string {
      return formActionURL(element(this), "formaction");
    }
    set formAction(value: string) {
      Element.prototype.setAttribute.call(this, "formaction", String(value).toWellFormed());
    }
    get formEnctype(): string {
      return formKeyword(element(this), "formenctype", formEncodings, defaultFormEncoding, "");
    }
    set formEnctype(value: string) {
      Element.prototype.setAttribute.call(this, "formenctype", value);
    }
    get formMethod(): string {
      return formKeyword(element(this), "formmethod", formMethods, "get", "");
    }
    set formMethod(value: string) {
      Element.prototype.setAttribute.call(this, "formmethod", value);
    }
    get formTarget(): string {
      return attribute(element(this), "formtarget") ?? "";
    }
    set formTarget(value: string) {
      Element.prototype.setAttribute.call(this, "formtarget", value);
    }
    get formNoValidate(): boolean {
      return attribute(element(this), "formnovalidate") !== null;
    }
    set formNoValidate(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "formnovalidate", Boolean(value));
    }

    get willValidate(): boolean {
      return validationCandidate(element(this));
    }
    get validity(): ValidityState {
      return validityFor(element(this));
    }
    get validationMessage(): string {
      return validationMessageFor(element(this));
    }
    setCustomValidity(message: string): void {
      if (arguments.length === 0) throw new TypeError("A validation message is required");
      setValidationMessage(element(this), message);
    }
    checkValidity(): boolean {
      return checkControlValidity(this);
    }
    reportValidity(): boolean {
      return this.checkValidity();
    }

    get type(): string {
      return buttonType(element(this));
    }
    set type(value: string) {
      this.setAttribute("type", value);
    }
    get disabled(): boolean {
      return this.hasAttribute("disabled");
    }
    set disabled(value: boolean) {
      this.toggleAttribute("disabled", Boolean(value));
    }
    get form(): HTMLFormElement | null {
      const owner = formOwner(element(this));
      return owner ? (wrapElement(owner) as HTMLFormElement) : null;
    }
  }

  type SelectionDirection = "none" | "forward" | "backward";
  type TextSelection = { start: number; end: number; direction: SelectionDirection };
  type TextControl = HTMLInputElement | HTMLTextAreaElement;

  const textSelections = new WeakMap<Raw.Element, TextSelection>();
  let pendingSelectionChanges: WeakSet<Raw.Element | Raw.Document> | undefined;
  const emptySelection: TextSelection = { start: 0, end: 0, direction: "none" };

  function selectionApplies(control: TextControl): boolean {
    const node = element(control);
    return !isInput(node) || selectableInputTypes.has(inputType(node));
  }

  function requireSelection(control: TextControl): void {
    if (!selectionApplies(control)) {
      throw new DOMException("Input type has no text selection", "InvalidStateError");
    }
  }

  function textSelection(control: TextControl): TextSelection {
    const node = element(control);
    const stored = textSelections.get(node);
    if (!stored) return emptySelection;
    const end = Math.min(
      stored.end,
      (isInput(node) ? inputValue(node) : textareaValue(node)).length,
    );
    if (end === stored.end) return stored;
    const selection = { start: Math.min(stored.start, end), end, direction: stored.direction };
    textSelections.set(node, selection);
    return selection;
  }

  function setTextSelection(
    control: TextControl,
    start: number,
    end: number,
    direction: string,
  ): void {
    const node = element(control);
    const boundedEnd = Math.min(
      end,
      (isInput(node) ? inputValue(node) : textareaValue(node)).length,
    );
    const selection: TextSelection = {
      start: Math.min(start, boundedEnd),
      end: boundedEnd,
      direction: direction === "forward" || direction === "backward" ? direction : "none",
    };
    const previous = textSelection(control);
    if (
      selection.start === previous.start &&
      selection.end === previous.end &&
      selection.direction === previous.direction
    )
      return;
    textSelections.set(node, selection);
    if (shadowHosts.has(treeRoot(node))) {
      // Keep the control's selection private while notifying document-level listeners.
      const owner = actualOwnerRecord(node);
      const realm = documentRealms.get(owner);
      if (realm === token) queueDocumentSelectionChange(owner);
      else if (realm) realmTreeOperations.get(realm)?.queueDocumentSelectionChange(owner);
    } else {
      queueSelectionChange(node, control);
    }
    timers.setTimeout(() => {
      control.dispatchEvent(events.trusted(new Event("select", { bubbles: true })));
    });
  }

  function queueDocumentSelectionChange(owner: Raw.Document): void {
    queueSelectionChange(owner, wrap(owner));
  }

  function queueSelectionChange(node: Raw.Element | Raw.Document, target: Node): void {
    const pending = (pendingSelectionChanges ??= new WeakSet());
    if (pending.has(node)) return;
    pending.add(node);
    timers.setTimeout(() => {
      pending.delete(node);
      target.dispatchEvent(
        events.trusted(new Event("selectionchange", { bubbles: tree.isElementNode(node) })),
      );
    });
  }

  function changeSelectionBoundary(
    control: TextControl,
    key: "start" | "end",
    value: number | null,
  ): void {
    const position = Number(value) >>> 0;
    requireSelection(control);
    const selection = textSelection(control);
    const start = key === "start" ? position : selection.start;
    const end = key === "end" ? position : Math.max(position, selection.end);
    setTextSelection(control, start, end, selection.direction);
  }

  function selectAllText(control: TextControl): void {
    const node = element(control);
    if (isInput(node) && !selectAllInputTypes.has(inputType(node))) return;
    setTextSelection(
      control,
      0,
      (isInput(node) ? inputValue(node) : textareaValue(node)).length,
      "none",
    );
  }

  function replaceTextSelection(
    control: TextControl,
    replacement: string,
    start: number | undefined,
    end: number | undefined,
    mode: string,
    arity: number,
  ): void {
    if (arity === 0 || arity === 2)
      throw new TypeError("Expected replacement text and optional start and end");
    const text = String(replacement);
    const selectionMode = String(mode);
    if (!["select", "start", "end", "preserve"].includes(selectionMode)) {
      throw new TypeError("Invalid selection mode");
    }
    const from = Number(start) >>> 0;
    const to = Number(end) >>> 0;
    requireSelection(control);
    const selection = textSelection(control);
    if (arity > 1 && from > to) throw new DOMException("Start exceeds end", "IndexSizeError");
    const node = element(control);
    const value = isInput(node) ? inputValue(node) : textareaValue(node);
    const left = arity === 1 ? selection.start : Math.min(from, value.length);
    const right = arity === 1 ? selection.end : Math.min(to, value.length);
    const nextValue = value.slice(0, left) + text + value.slice(right);
    controlValues.set(
      node,
      isInput(node)
        ? sanitizeInputValue(node, nextValue, inputType(node))
        : nextValue.replace(/\r\n?/g, "\n"),
    );
    const newEnd = left + text.length;
    const delta = newEnd - right;
    const preservedStart =
      selection.start > right
        ? selection.start + delta
        : selection.start > left
          ? left
          : selection.start;
    const preservedEnd =
      selection.end > right ? selection.end + delta : selection.end > left ? newEnd : selection.end;
    const nextStart =
      selectionMode === "preserve" ? preservedStart : selectionMode === "end" ? newEnd : left;
    const nextEnd =
      selectionMode === "preserve" ? preservedEnd : selectionMode === "start" ? left : newEnd;
    setTextSelection(control, nextStart, nextEnd, "none");
  }

  function collapseTextSelection(node: Raw.Element, length: number): void {
    textSelections.set(node, { start: length, end: length, direction: "none" });
  }

  function updateInputValueMode(owner: Element, node: Raw.Element, oldType: string | null): void {
    const previousType = normalizedInputType(oldType);
    const previous = inputValueMode(previousType);
    const type = inputType(node);
    const current = inputValueMode(type);
    if (previous !== current && (previous === "filename" || current === "filename"))
      inputFiles.delete(node);
    if (selectableInputTypes.has(type) && !selectableInputTypes.has(previousType)) {
      textSelections.delete(node);
    }
    const dirty = controlValues.get(node);
    if (current === "value") {
      if (previous !== "value") controlValues.delete(node);
      else if (dirty !== undefined) {
        controlValues.set(node, sanitizeInputValue(node, dirty, type));
      }
    } else {
      controlValues.delete(node);
      if ((current === "default" || current === "default/on") && previous === "value" && dirty) {
        owner.setAttribute("value", dirty);
      }
    }
  }

  class HTMLOutputElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLOutputElement, new.target);
      super(key, record, wrapHandle);
    }

    #htmlFor: DOMTokenList | undefined;
    get htmlFor(): DOMTokenList {
      return (this.#htmlFor ??= new DOMTokenList(token, this, "for"));
    }
    set htmlFor(value: string) {
      this.htmlFor.value = value;
    }
    get labels(): NodeList<Element> {
      return labelsFor(element(this));
    }
    get willValidate(): boolean {
      return validationCandidate(element(this));
    }
    get validity(): ValidityState {
      return validityFor(element(this));
    }
    get validationMessage(): string {
      return validationMessageFor(element(this));
    }
    setCustomValidity(message: string): void {
      if (arguments.length === 0) throw new TypeError("A validation message is required");
      setValidationMessage(element(this), message);
    }
    checkValidity(): boolean {
      return checkControlValidity(this);
    }
    reportValidity(): boolean {
      return this.checkValidity();
    }

    get type(): string {
      return "output";
    }
    get name(): string {
      return this.getAttribute("name") ?? "";
    }
    set name(value: string) {
      this.setAttribute("name", value);
    }
    get value(): string {
      return this.textContent ?? "";
    }
    set value(value: string) {
      const text = String(value);
      outputDefaults.set(element(this), this.defaultValue);
      this.textContent = text;
    }
    get defaultValue(): string {
      return outputDefaults.get(element(this)) ?? this.value;
    }
    set defaultValue(value: string) {
      const text = String(value);
      const node = element(this);
      if (outputDefaults.has(node)) outputDefaults.set(node, text);
      else this.textContent = text;
    }
    get form(): HTMLFormElement | null {
      const owner = formOwner(element(this));
      return owner ? (wrapElement(owner) as HTMLFormElement) : null;
    }
  }

  function textareaDimension(node: Raw.Element, name: "rows" | "cols"): number {
    const fallback = name === "rows" ? 2 : 20;
    const value = reflectedLong(node, name, fallback);
    return value > 0 ? value : fallback;
  }

  function setTextareaDimension(owner: HTMLElement, name: "rows" | "cols", value: number): void {
    const number = +value >>> 0;
    const fallback = name === "rows" ? 2 : 20;
    Element.prototype.setAttribute.call(
      owner,
      name,
      String(number > 0 && number <= 0x7fffffff ? number : fallback),
    );
  }

  function setTextLengthLimit(
    owner: HTMLElement,
    name: "minlength" | "maxlength",
    value: number,
  ): void {
    const number = +value | 0;
    if (number < 0) throw new DOMException("The length limit cannot be negative", "IndexSizeError");
    Element.prototype.setAttribute.call(owner, name, String(number));
  }

  function textareaSubmissionValue(node: Raw.Element, value: string): string {
    if (asciiLower(attribute(node, "wrap") ?? "") !== "hard") return value;
    const cols = textareaDimension(node, "cols");
    const lines: string[] = [];
    for (const line of value.split("\n")) {
      let offset = 0;
      for (; offset + cols < line.length; offset += cols)
        lines.push(line.slice(offset, offset + cols));
      lines.push(line.slice(offset));
    }
    return lines.join("\n");
  }

  class HTMLTextAreaElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLTextAreaElement, new.target);
      super(key, record, wrapHandle);
    }

    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      Element.prototype.setAttribute.call(this, "name", `${value}`);
    }
    get wrap(): string {
      return attribute(element(this), "wrap") ?? "";
    }
    set wrap(value: string) {
      Element.prototype.setAttribute.call(this, "wrap", `${value}`);
    }
    get inputMode(): string {
      return attribute(element(this), "inputmode") ?? "";
    }
    set inputMode(value: string) {
      Element.prototype.setAttribute.call(this, "inputmode", `${value}`);
    }
    get autocomplete(): string {
      return attribute(element(this), "autocomplete") ?? "";
    }
    set autocomplete(value: string) {
      Element.prototype.setAttribute.call(this, "autocomplete", `${value}`);
    }
    get placeholder(): string {
      return attribute(element(this), "placeholder") ?? "";
    }
    set placeholder(value: string) {
      Element.prototype.setAttribute.call(this, "placeholder", `${value}`);
    }
    get rows(): number {
      return textareaDimension(element(this), "rows");
    }
    set rows(value: number) {
      setTextareaDimension(this, "rows", value);
    }
    get cols(): number {
      return textareaDimension(element(this), "cols");
    }
    set cols(value: number) {
      setTextareaDimension(this, "cols", value);
    }
    get minLength(): number {
      return Math.max(-1, reflectedLong(element(this), "minlength", -1));
    }
    set minLength(value: number) {
      setTextLengthLimit(this, "minlength", value);
    }
    get maxLength(): number {
      return Math.max(-1, reflectedLong(element(this), "maxlength", -1));
    }
    set maxLength(value: number) {
      setTextLengthLimit(this, "maxlength", value);
    }
    get readOnly(): boolean {
      return attribute(element(this), "readonly") !== null;
    }
    set readOnly(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "readonly", Boolean(value));
    }
    get disabled(): boolean {
      return attribute(element(this), "disabled") !== null;
    }
    set disabled(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "disabled", Boolean(value));
    }
    get labels(): NodeList<Element> {
      return labelsFor(element(this));
    }
    get dirName(): string {
      return attribute(element(this), "dirname") ?? "";
    }
    set dirName(value: string) {
      Element.prototype.setAttribute.call(this, "dirname", value);
    }

    get [Symbol.toStringTag](): string {
      return "HTMLTextAreaElement";
    }
    select(): void {
      selectAllText(this);
    }
    get selectionStart(): number {
      return textSelection(this).start;
    }
    set selectionStart(value: number | null) {
      changeSelectionBoundary(this, "start", value);
    }
    get selectionEnd(): number {
      return textSelection(this).end;
    }
    set selectionEnd(value: number | null) {
      changeSelectionBoundary(this, "end", value);
    }
    get selectionDirection(): SelectionDirection {
      return textSelection(this).direction;
    }
    set selectionDirection(value: string | null) {
      const direction = String(value);
      requireSelection(this);
      const { start, end } = textSelection(this);
      setTextSelection(this, start, end, direction);
    }
    setSelectionRange(start: number, end: number, direction = "none"): void {
      if (arguments.length < 2) throw new TypeError("Expected a start and end");
      requireSelection(this);
      setTextSelection(this, Number(start) >>> 0, Number(end) >>> 0, String(direction));
    }
    setRangeText(
      replacement: string,
      start?: number,
      end?: number,
      selectionMode = "preserve",
    ): void {
      replaceTextSelection(this, replacement, start, end, selectionMode, arguments.length);
    }

    get required(): boolean {
      return this.hasAttribute("required");
    }
    set required(value: boolean) {
      this.toggleAttribute("required", Boolean(value));
    }

    get willValidate(): boolean {
      return validationCandidate(element(this));
    }
    get validity(): ValidityState {
      return validityFor(element(this));
    }
    get validationMessage(): string {
      return validationMessageFor(element(this));
    }
    setCustomValidity(message: string): void {
      if (arguments.length === 0) throw new TypeError("A validation message is required");
      setValidationMessage(element(this), message);
    }
    checkValidity(): boolean {
      return checkControlValidity(this);
    }
    reportValidity(): boolean {
      return this.checkValidity();
    }

    get defaultValue(): string {
      return childTextContent(element(this));
    }
    set defaultValue(value: string) {
      this.textContent = String(value);
    }
    get value(): string {
      return textareaValue(element(this));
    }
    set value(value: string | null) {
      const node = element(this);
      const previous = this.value;
      const next = (value === null ? "" : domString(value)).replace(/\r\n?/g, "\n");
      controlValues.set(node, next);
      if (previous !== next) collapseTextSelection(node, next.length);
    }
    get textLength(): number {
      return this.value.length;
    }
    get type(): string {
      return "textarea";
    }
    get form(): HTMLFormElement | null {
      const owner = formOwner(element(this));
      return owner ? (wrapElement(owner) as HTMLFormElement) : null;
    }
  }

  let fileLists: ReturnType<typeof createFileLists> | undefined;
  function filesAPI() {
    return (fileLists ??= createFileLists((callback) => {
      timers.setTimeout(callback);
    }, DOMException));
  }
  function filesFor(node: Raw.Element): InputFileList {
    let files = inputFiles.get(node);
    if (!files) {
      files = filesAPI().empty();
      inputFiles.set(node, files);
    }
    return files;
  }

  class HTMLInputElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLInputElement, new.target);
      super(key, record, wrapHandle);
    }

    get accept(): string {
      return attribute(element(this), "accept") ?? "";
    }
    set accept(value: string) {
      Element.prototype.setAttribute.call(this, "accept", `${value}`);
    }
    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
    get alt(): string {
      return attribute(element(this), "alt") ?? "";
    }
    set alt(value: string) {
      Element.prototype.setAttribute.call(this, "alt", `${value}`);
    }
    get autocomplete(): string {
      return attribute(element(this), "autocomplete") ?? "";
    }
    set autocomplete(value: string) {
      Element.prototype.setAttribute.call(this, "autocomplete", `${value}`);
    }
    get inputMode(): string {
      return attribute(element(this), "inputmode") ?? "";
    }
    set inputMode(value: string) {
      Element.prototype.setAttribute.call(this, "inputmode", `${value}`);
    }
    get placeholder(): string {
      return attribute(element(this), "placeholder") ?? "";
    }
    set placeholder(value: string) {
      Element.prototype.setAttribute.call(this, "placeholder", `${value}`);
    }
    get useMap(): string {
      return attribute(element(this), "usemap") ?? "";
    }
    set useMap(value: string) {
      Element.prototype.setAttribute.call(this, "usemap", `${value}`);
    }
    get src(): string {
      return reflectedResourceURL(element(this), "src");
    }
    set src(value: string) {
      Element.prototype.setAttribute.call(this, "src", `${value}`.toWellFormed());
    }
    get size(): number {
      const value = reflectedLong(element(this), "size", 20);
      return value > 0 ? value : 20;
    }
    set size(value: number) {
      const number = +value >>> 0;
      if (number === 0) throw new DOMException("The input size must be positive", "IndexSizeError");
      Element.prototype.setAttribute.call(this, "size", String(number <= 0x7fffffff ? number : 20));
    }
    get minLength(): number {
      return Math.max(-1, reflectedLong(element(this), "minlength", -1));
    }
    set minLength(value: number) {
      setTextLengthLimit(this, "minlength", value);
    }
    get maxLength(): number {
      return Math.max(-1, reflectedLong(element(this), "maxlength", -1));
    }
    set maxLength(value: number) {
      setTextLengthLimit(this, "maxlength", value);
    }
    get readOnly(): boolean {
      return attribute(element(this), "readonly") !== null;
    }
    set readOnly(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "readonly", Boolean(value));
    }
    get labels(): NodeList<Element> | null {
      const node = element(this);
      return labelable(node) ? labelsFor(node) : null;
    }
    get list(): HTMLDataListElement | null {
      const node = element(this);
      const id = attribute(node, "list");
      if (!id || !inputListTypes.has(inputType(node))) return null;
      const match = firstElementWithID(treeRoot(node), id);
      return match && htmlChildNamed(match, "datalist")
        ? (wrapElement(match) as HTMLDataListElement)
        : null;
    }
    get dirName(): string {
      return attribute(element(this), "dirname") ?? "";
    }
    set dirName(value: string) {
      Element.prototype.setAttribute.call(this, "dirname", value);
    }

    get files(): InputFileList | null {
      const node = element(this);
      return inputType(node) === "file" ? filesFor(node) : null;
    }
    set files(value: InputFileList | null) {
      if (value == null) return;
      filesAPI().check(value);
      const node = element(this);
      if (inputType(node) === "file") inputFiles.set(node, value);
    }

    get [Symbol.toStringTag](): string {
      return "HTMLInputElement";
    }
    select(): void {
      selectAllText(this);
    }
    get selectionStart(): number | null {
      return selectionApplies(this) ? textSelection(this).start : null;
    }
    set selectionStart(value: number | null) {
      changeSelectionBoundary(this, "start", value);
    }
    get selectionEnd(): number | null {
      return selectionApplies(this) ? textSelection(this).end : null;
    }
    set selectionEnd(value: number | null) {
      changeSelectionBoundary(this, "end", value);
    }
    get selectionDirection(): SelectionDirection | null {
      return selectionApplies(this) ? textSelection(this).direction : null;
    }
    set selectionDirection(value: string | null) {
      const direction = String(value);
      requireSelection(this);
      const { start, end } = textSelection(this);
      setTextSelection(this, start, end, direction);
    }
    setSelectionRange(start: number, end: number, direction = "none"): void {
      if (arguments.length < 2) throw new TypeError("Expected a start and end");
      requireSelection(this);
      setTextSelection(this, Number(start) >>> 0, Number(end) >>> 0, String(direction));
    }
    setRangeText(
      replacement: string,
      start?: number,
      end?: number,
      selectionMode = "preserve",
    ): void {
      replaceTextSelection(this, replacement, start, end, selectionMode, arguments.length);
    }

    get min(): string {
      return this.getAttribute("min") ?? "";
    }
    set min(value: string) {
      this.setAttribute("min", value);
    }
    get max(): string {
      return this.getAttribute("max") ?? "";
    }
    set max(value: string) {
      this.setAttribute("max", value);
    }
    get step(): string {
      return this.getAttribute("step") ?? "";
    }
    set step(value: string) {
      this.setAttribute("step", value);
    }
    get valueAsDate(): Date | null {
      const type = this.type;
      if (!supportsInputDate(type)) return null;
      const timestamp = inputDateTimestamp(type, this.value);
      if (!Number.isFinite(timestamp)) return null;
      const owner = this.ownerDocument?.defaultView ?? window;
      const DateConstructor = Reflect.get(owner, "Date") as DateConstructor;
      return new DateConstructor(timestamp);
    }
    set valueAsDate(value: Date | null) {
      const type = this.type;
      if (!supportsInputDate(type)) {
        throw new DOMException("Input type has no Date value", "InvalidStateError");
      }
      const timestamp = value == null ? NaN : Date.prototype.getTime.call(value);
      this.value = formatInputDate(type, timestamp);
    }
    get valueAsNumber(): number {
      const type = this.type;
      return supportsInputNumber(type) ? inputNumber(type, this.value) : NaN;
    }
    set valueAsNumber(value: number) {
      const number = Number(value);
      if (Math.abs(number) === Infinity) throw new TypeError("Expected a finite number or NaN");
      const type = this.type;
      if (!supportsInputNumber(type))
        throw new DOMException("Input type has no numeric value", "InvalidStateError");
      this.value = formatInputNumber(type, number);
    }
    stepUp(count = 1): void {
      this.#stepBy(count, true);
    }
    stepDown(count = 1): void {
      this.#stepBy(count, false);
    }
    #stepBy(count: number, up: boolean): void {
      const steps = Number(count) | 0;
      const node = element(this);
      const type = inputType(node);
      const grid = inputGrid(node, type);
      if (!supportsInputNumber(type) || !Number.isFinite(grid.step)) {
        throw new DOMException("Input type has no allowed step", "InvalidStateError");
      }
      const value = stepNumericValue(this.valueAsNumber, steps, up, grid);
      if (value !== undefined) this.value = formatInputNumber(type, value);
    }

    get pattern(): string {
      return this.getAttribute("pattern") ?? "";
    }
    set pattern(value: string) {
      this.setAttribute("pattern", value);
    }
    get multiple(): boolean {
      return this.hasAttribute("multiple");
    }
    set multiple(value: boolean) {
      this.toggleAttribute("multiple", Boolean(value));
    }

    get required(): boolean {
      return this.hasAttribute("required");
    }
    set required(value: boolean) {
      this.toggleAttribute("required", Boolean(value));
    }

    get formAction(): string {
      return formActionURL(element(this), "formaction");
    }
    set formAction(value: string) {
      Element.prototype.setAttribute.call(this, "formaction", String(value).toWellFormed());
    }
    get formEnctype(): string {
      return formKeyword(element(this), "formenctype", formEncodings, defaultFormEncoding, "");
    }
    set formEnctype(value: string) {
      Element.prototype.setAttribute.call(this, "formenctype", value);
    }
    get formMethod(): string {
      return formKeyword(element(this), "formmethod", formMethods, "get", "");
    }
    set formMethod(value: string) {
      Element.prototype.setAttribute.call(this, "formmethod", value);
    }
    get formTarget(): string {
      return attribute(element(this), "formtarget") ?? "";
    }
    set formTarget(value: string) {
      Element.prototype.setAttribute.call(this, "formtarget", value);
    }
    get formNoValidate(): boolean {
      return attribute(element(this), "formnovalidate") !== null;
    }
    set formNoValidate(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "formnovalidate", Boolean(value));
    }

    get willValidate(): boolean {
      return validationCandidate(element(this));
    }
    get validity(): ValidityState {
      return validityFor(element(this));
    }
    get validationMessage(): string {
      return validationMessageFor(element(this));
    }
    setCustomValidity(message: string): void {
      if (arguments.length === 0) throw new TypeError("A validation message is required");
      setValidationMessage(element(this), message);
    }
    checkValidity(): boolean {
      return checkControlValidity(this);
    }
    reportValidity(): boolean {
      return this.checkValidity();
    }

    get defaultValue(): string {
      return this.getAttribute("value") ?? "";
    }
    set defaultValue(value: string) {
      this.setAttribute("value", value);
    }
    get value(): string {
      return inputValue(element(this));
    }
    set value(value: string | null) {
      const string = value === null ? "" : domString(value);
      const node = element(this);
      const type = inputType(node);
      switch (inputValueMode(type)) {
        case "default":
        case "default/on":
          this.setAttribute("value", string);
          break;
        case "filename":
          if (string !== "")
            throw new DOMException("This input accepts only an empty value", "InvalidStateError");
          const files = inputFiles.get(node);
          if (files) filesAPI().clear(files);
          break;
        case "value": {
          const next = sanitizeInputValue(node, string, type);
          const previous = selectableInputTypes.has(type) ? this.value : next;
          controlValues.set(node, next);
          if (previous !== next) {
            collapseTextSelection(node, next.length);
          }
          break;
        }
      }
    }
    get type(): string {
      return inputType(element(this));
    }
    set type(value: string) {
      this.setAttribute("type", value);
    }
    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      this.setAttribute("name", value);
    }
    get checked(): boolean {
      return checkedness(element(this));
    }
    set checked(value: boolean) {
      setChecked(element(this), Boolean(value), true);
    }
    get defaultChecked(): boolean {
      return attribute(element(this), "checked") !== null;
    }
    set defaultChecked(value: boolean) {
      this.toggleAttribute("checked", Boolean(value));
    }
    get indeterminate(): boolean {
      return checkState(element(this)).indeterminate;
    }
    set indeterminate(value: boolean) {
      checkState(element(this)).indeterminate = Boolean(value);
    }
    get disabled(): boolean {
      return attribute(element(this), "disabled") !== null;
    }
    set disabled(value: boolean) {
      this.toggleAttribute("disabled", Boolean(value));
    }
    get form(): HTMLFormElement | null {
      const owner = formOwner(element(this));
      return owner ? (wrapElement(owner) as HTMLFormElement) : null;
    }
  }

  class HTMLHtmlElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLHtmlElement, new.target);
      super(key, record, wrapHandle);
    }

    get version(): string {
      return attribute(element(this), "version") ?? "";
    }
    set version(value: string) {
      Element.prototype.setAttribute.call(this, "version", `${value}`);
    }
  }
  class HTMLMetaElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLMetaElement, new.target);
      super(key, record, wrapHandle);
    }

    get [Symbol.toStringTag](): string {
      return "HTMLMetaElement";
    }
    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      Element.prototype.setAttribute.call(this, "name", `${value}`);
    }
    get httpEquiv(): string {
      return attribute(element(this), "http-equiv") ?? "";
    }
    set httpEquiv(value: string) {
      Element.prototype.setAttribute.call(this, "http-equiv", `${value}`);
    }
    get content(): string {
      return attribute(element(this), "content") ?? "";
    }
    set content(value: string) {
      Element.prototype.setAttribute.call(this, "content", `${value}`);
    }
    get scheme(): string {
      return attribute(element(this), "scheme") ?? "";
    }
    set scheme(value: string) {
      Element.prototype.setAttribute.call(this, "scheme", `${value}`);
    }
  }
  class HTMLDataElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLDataElement, new.target);
      super(key, record, wrapHandle);
    }

    get [Symbol.toStringTag](): string {
      return "HTMLDataElement";
    }
    get value(): string {
      return attribute(element(this), "value") ?? "";
    }
    set value(value: string) {
      Element.prototype.setAttribute.call(this, "value", `${value}`);
    }
  }

  class HTMLTimeElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLTimeElement, new.target);
      super(key, record, wrapHandle);
    }

    get [Symbol.toStringTag](): string {
      return "HTMLTimeElement";
    }
    get dateTime(): string {
      return attribute(element(this), "datetime") ?? "";
    }
    set dateTime(value: string) {
      Element.prototype.setAttribute.call(this, "datetime", `${value}`);
    }
  }

  class HTMLModElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLModElement, new.target);
      super(key, record, wrapHandle);
    }

    get [Symbol.toStringTag](): string {
      return "HTMLModElement";
    }
    get dateTime(): string {
      return attribute(element(this), "datetime") ?? "";
    }
    set dateTime(value: string) {
      Element.prototype.setAttribute.call(this, "datetime", `${value}`);
    }
    get cite(): string {
      return reflectedResourceURL(element(this), "cite");
    }
    set cite(value: string) {
      Element.prototype.setAttribute.call(this, "cite", `${value}`.toWellFormed());
    }
  }
  class HTMLHeadElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLHeadElement, new.target);
      super(key, record, wrapHandle);
    }
  }
  class HTMLBaseElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLBaseElement, new.target);
      super(key, record, wrapHandle);
    }

    get href(): string {
      const node = element(this);
      const value = attribute(node, "href") ?? "";
      const owner = ownerRecord(node);
      return (
        parseDocumentURL({
          value,
          base: baseURL(owner, "fallback"),
          encoding: documentEncoding(owner),
        })?.href ?? value.toWellFormed()
      );
    }
    set href(value: string) {
      Element.prototype.setAttribute.call(this, "href", `${value}`.toWellFormed());
    }
    get target(): string {
      return attribute(element(this), "target") ?? "";
    }
    set target(value: string) {
      Element.prototype.setAttribute.call(this, "target", `${value}`);
    }
  }
  type ToggleState = "open" | "closed";
  let pendingToggleEvents:
    | WeakMap<Raw.Element, { task: number; oldState: ToggleState }>
    | undefined;

  function queueToggleEvent(node: Raw.Element, open: boolean): void {
    const pending = (pendingToggleEvents ??= new WeakMap());
    const previous = pending.get(node);
    if (previous) timers.cancel(previous.task);
    const oldState = previous?.oldState ?? (open ? "closed" : "open");
    const newState = open ? "open" : "closed";
    const task = timers.setTimeout(() => {
      pending.delete(node);
      Node.prototype.dispatchEvent.call(
        wrapElement(node),
        events.trusted(new ToggleEvent("toggle", { oldState, newState })),
      );
    });
    pending.set(node, { task, oldState });
  }

  function queueParsedDetailsToggle(node: Raw.Element): void {
    if (
      node.namespaceURI === html.NS.HTML &&
      node.tagName === "details" &&
      attribute(node, "open") !== null
    )
      queueToggleEvent(node, true);
  }

  function detailsParserOptions(
    markup: string,
    settings: ParserOptions<Raw.DefaultTreeAdapterMap>,
    streaming = false,
  ): ParserOptions<Raw.DefaultTreeAdapterMap> {
    if (!streaming && !/<details[\t\n\f\r />]/i.test(markup)) return settings;
    const adapter = settings.treeAdapter ?? tree;
    return {
      ...settings,
      treeAdapter: createOwnedElementAdapter({ adapter, onElement: queueParsedDetailsToggle }),
    };
  }

  function firstDetailsSummary(details: Raw.Element): Raw.Element | undefined {
    return details.childNodes.find(
      (child): child is Raw.Element =>
        tree.isElementNode(child) &&
        child.namespaceURI === html.NS.HTML &&
        child.tagName === "summary",
    );
  }

  function summaryDetails(node: Raw.Element): Raw.Element | null {
    if (node.namespaceURI !== html.NS.HTML) return null;
    const parent = parentElementRecord(node);
    return parent?.tagName === "details" &&
      parent.namespaceURI === html.NS.HTML &&
      firstDetailsSummary(parent) === node
      ? parent
      : null;
  }

  function openDetailsName(node: Raw.Node): string | null {
    if (
      !tree.isElementNode(node) ||
      node.namespaceURI !== html.NS.HTML ||
      node.tagName !== "details" ||
      attribute(node, "open") === null
    )
      return null;
    return attribute(node, "name") || null;
  }

  function* detailsTree(root: Raw.Node): Generator<Raw.Element> {
    if (tree.isElementNode(root)) yield root;
    if ("childNodes" in root) {
      for (const child of descendants(root)) if (tree.isElementNode(child)) yield child;
    }
  }

  function closeDetails(node: Raw.Element): void {
    Element.prototype.removeAttribute.call(wrapElement(node), "open");
  }

  function enforceDetailsGroup(node: Raw.Element, closePeers: boolean): void {
    const name = openDetailsName(node);
    if (!name) return;
    for (const peer of detailsTree(treeRoot(node))) {
      if (peer === node || openDetailsName(peer) !== name) continue;
      if (closePeers) closeDetails(peer);
      else {
        closeDetails(node);
        return;
      }
    }
  }

  function reconcileInsertedDetails(added: readonly Raw.ChildNode[], parent: Raw.ParentNode): void {
    let incoming: Map<Raw.Element, string> | undefined;
    for (const child of added) {
      if (!tree.isElementNode(child) || (!child.childNodes.length && child.tagName !== "details"))
        continue;
      for (const node of detailsTree(child)) {
        const name = openDetailsName(node);
        if (name) (incoming ??= new Map()).set(node, name);
      }
    }
    if (!incoming) return;
    const openNames = new Set<string>();
    // Existing disclosures win even when inserted nodes precede them in tree order.
    for (const peer of detailsTree(treeRoot(parent))) {
      if (incoming.has(peer)) continue;
      const name = openDetailsName(peer);
      if (name) openNames.add(name);
    }
    for (const [node, name] of incoming) {
      if (openNames.has(name)) closeDetails(node);
      else openNames.add(name);
    }
  }

  class HTMLDetailsElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLDetailsElement, new.target);
      super(key, record, wrapHandle);
    }

    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      Element.prototype.setAttribute.call(this, "name", value);
    }
    get open(): boolean {
      return attribute(element(this), "open") !== null;
    }
    set open(value: boolean) {
      if (value) Element.prototype.setAttribute.call(this, "open", "");
      else Element.prototype.removeAttribute.call(this, "open");
    }
  }

  let modalDialogs: Set<Raw.Element> | undefined;
  const dialogTransitions = new WeakSet<Raw.Element>();
  const dialogCloseRequests = new WeakSet<Raw.Element>();

  function isWithin(node: Raw.Element, ancestor: Raw.Node): boolean {
    for (let current: Raw.Node | null = node; current; current = treeParent(current, true)) {
      if (current === ancestor) return true;
    }
    return false;
  }

  function withinActiveModal(node: Raw.Element): boolean {
    if (!modalDialogs?.size) return true;
    let top: Raw.Element | undefined;
    for (const modal of modalDialogs) top = modal;
    return !top || isWithin(node, top);
  }

  function focusOpenedDialog(dialog: HTMLDialogElement, node: Raw.Element): void {
    const view = dialog.ownerDocument?.defaultView;
    if (!view) return;
    if (attribute(node, "autofocus") !== null) {
      updateFocus(dialog, true);
      return;
    }
    let first: HTMLElement | undefined;
    for (const candidate of shadowIncludingElements(node)) {
      if (candidate === node || !focusable(candidate, view)) continue;
      const handle = wrapElement(candidate);
      if (!(handle instanceof HTMLElement)) continue;
      if (attribute(candidate, "autofocus") !== null) {
        updateFocus(handle, true);
        return;
      }
      first ??= handle;
    }
    updateFocus(first ?? dialog, true);
  }

  function clearRemovedModals(root: Raw.Node): void {
    if (!modalDialogs?.size) return;
    for (const dialog of modalDialogs) if (isWithin(dialog, root)) modalDialogs.delete(dialog);
  }

  class HTMLDialogElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLDialogElement, new.target);
      super(key, record, wrapHandle);
    }

    #returnValue = "";
    #previousFocus: Raw.Element | undefined;

    get returnValue(): string {
      return this.#returnValue;
    }
    set returnValue(value: string) {
      this.#returnValue = `${value}`;
    }

    show(): void {
      this.#show(false);
    }
    showModal(): void {
      this.#show(true);
    }
    #show(modal: boolean): void {
      const node = element(this);
      if (attribute(node, "open") !== null) {
        if ((modalDialogs?.has(node) ?? false) !== modal)
          throw new DOMException(
            "The dialog is already open in a different mode",
            "InvalidStateError",
          );
        return;
      }
      if (modal && !connected(node))
        throw new DOMException("The dialog is disconnected", "InvalidStateError");
      if (dialogTransitions.has(node)) return;
      dialogTransitions.add(node);
      try {
        const event = events.trusted(
          new ToggleEvent("beforetoggle", {
            oldState: "closed",
            newState: "open",
            cancelable: true,
          }),
        );
        if (
          !Node.prototype.dispatchEvent.call(this, event) ||
          attribute(node, "open") !== null ||
          (modal && !connected(node))
        )
          return;
        this.#previousFocus = focusStates.get(ownerRecord(node))?.element;
        if (modal) (modalDialogs ??= new Set()).add(node);
        Element.prototype.setAttribute.call(this, "open", "");
        queueToggleEvent(node, true);
        focusOpenedDialog(this, node);
      } finally {
        dialogTransitions.delete(node);
      }
    }
    close(returnValue?: string): void {
      this.#close(returnValue === undefined ? undefined : `${returnValue}`);
    }
    requestClose(returnValue?: string): void {
      const value = returnValue === undefined ? undefined : `${returnValue}`;
      const node = element(this);
      if (attribute(node, "open") === null || !connected(node) || dialogCloseRequests.has(node))
        return;
      dialogCloseRequests.add(node);
      try {
        if (
          Node.prototype.dispatchEvent.call(
            this,
            events.trusted(new Event("cancel", { cancelable: true })),
          )
        )
          this.#close(value);
      } finally {
        dialogCloseRequests.delete(node);
      }
    }
    #close(value: string | undefined): void {
      const node = element(this);
      if (attribute(node, "open") === null || dialogTransitions.has(node)) return;
      dialogTransitions.add(node);
      try {
        Node.prototype.dispatchEvent.call(
          this,
          events.trusted(new ToggleEvent("beforetoggle", { oldState: "open", newState: "closed" })),
        );
        if (attribute(node, "open") === null) return;
        const wasModal = modalDialogs?.has(node) ?? false;
        Element.prototype.removeAttribute.call(this, "open");
        if (value !== undefined) this.#returnValue = value;
        const previous = this.#previousFocus;
        this.#previousFocus = undefined;
        const current = focusStates.get(ownerRecord(node))?.element;
        const focusWasInside = current !== undefined && isWithin(current, node);
        if (wasModal || focusWasInside) {
          const restore = previous && wrapElement(previous);
          if (restore instanceof HTMLElement) updateFocus(restore, true);
          if (focusWasInside && focusStates.get(ownerRecord(node))?.element === current) {
            const handle = wrapElement(current);
            if (handle instanceof HTMLElement) updateFocus(handle, false);
          }
        }
        queueToggleEvent(node, false);
        timers.setTimeout(() => {
          Node.prototype.dispatchEvent.call(this, events.trusted(new Event("close")));
        });
      } finally {
        dialogTransitions.delete(node);
      }
    }
    get open(): boolean {
      return attribute(element(this), "open") !== null;
    }
    set open(value: boolean) {
      if (value) Element.prototype.setAttribute.call(this, "open", "");
      else Element.prototype.removeAttribute.call(this, "open");
    }
  }

  class HTMLTitleElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLTitleElement, new.target);
      super(key, record, wrapHandle);
    }

    get text(): string {
      return childTextContent(element(this));
    }
    set text(value: string) {
      setChildTextContent(element(this), value);
    }
  }
  class HTMLBodyElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLBodyElement, new.target);
      super(key, record, wrapHandle);
    }

    get text(): string {
      return attribute(element(this), "text") ?? "";
    }
    set text(value: string | null) {
      Element.prototype.setAttribute.call(this, "text", value === null ? "" : `${value}`);
    }
    get link(): string {
      return attribute(element(this), "link") ?? "";
    }
    set link(value: string | null) {
      Element.prototype.setAttribute.call(this, "link", value === null ? "" : `${value}`);
    }
    get vLink(): string {
      return attribute(element(this), "vlink") ?? "";
    }
    set vLink(value: string | null) {
      Element.prototype.setAttribute.call(this, "vlink", value === null ? "" : `${value}`);
    }
    get aLink(): string {
      return attribute(element(this), "alink") ?? "";
    }
    set aLink(value: string | null) {
      Element.prototype.setAttribute.call(this, "alink", value === null ? "" : `${value}`);
    }
    get bgColor(): string {
      return attribute(element(this), "bgcolor") ?? "";
    }
    set bgColor(value: string | null) {
      Element.prototype.setAttribute.call(this, "bgcolor", value === null ? "" : `${value}`);
    }
    get background(): string {
      return attribute(element(this), "background") ?? "";
    }
    set background(value: string) {
      Element.prototype.setAttribute.call(this, "background", `${value}`);
    }
  }
  class HTMLFrameSetElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLFrameSetElement, new.target);
      super(key, record, wrapHandle);
    }

    get cols(): string {
      return this.getAttribute("cols") ?? "";
    }
    set cols(value: string) {
      this.setAttribute("cols", value);
    }
    get rows(): string {
      return this.getAttribute("rows") ?? "";
    }
    set rows(value: string) {
      this.setAttribute("rows", value);
    }
  }
  interface HTMLBodyElement extends HandlerProperties<WindowHandlerName, Handler> {}
  interface HTMLFrameSetElement extends HandlerProperties<WindowHandlerName, Handler> {}

  class HTMLSlotElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLSlotElement, new.target);
      super(key, record, wrapHandle);
    }

    get name(): string {
      return this.getAttribute("name") ?? "";
    }
    set name(value: string) {
      this.setAttribute("name", value);
    }
    assign(...nodes: (Element | Text)[]): void {
      const slot = element(this);
      if (!isSlot(slot)) throw new TypeError("Expected an HTMLSlotElement");
      const next = new Set<Slotable>();
      for (const node of nodes) {
        const record = nodeRecord(node)?.node;
        if (!record || !isSlotable(record)) throw new TypeError("Expected an Element or Text");
        next.add(record);
      }
      const roots = new Set([treeRoot(slot)]);
      for (const member of next) {
        const previous = manualSlotFor.get(member);
        if (previous) roots.add(treeRoot(previous));
      }
      for (const member of manualSlotMembers.get(slot) ?? []) {
        if (!next.has(member)) manualSlotFor.delete(member);
      }
      for (const member of next) {
        const previous = manualSlotFor.get(member);
        if (previous && previous !== slot) manualSlotMembers.get(previous)?.delete(member);
        manualSlotFor.set(member, slot);
      }
      manualSlotMembers.set(slot, next);
      for (const root of roots) reconcileSlots(root);
    }

    assignedNodes(options?: { flatten?: boolean }): Node[] {
      const slot = element(this);
      const nodes = options?.flatten ? flattenedSlotMembers(slot) : slotMembers(slot, false);
      return nodes.map(wrap);
    }
    assignedElements(options?: { flatten?: boolean }): Element[] {
      const slot = element(this);
      const nodes = options?.flatten ? flattenedSlotMembers(slot) : slotMembers(slot, false);
      return nodes.filter(tree.isElementNode).map(wrapElement);
    }
  }
  class HTMLDivElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLDivElement, new.target);
      super(key, record, wrapHandle);
    }

    get [Symbol.toStringTag](): string {
      return "HTMLDivElement";
    }
    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
  }
  class HTMLParagraphElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLParagraphElement, new.target);
      super(key, record, wrapHandle);
    }

    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
  }
  class HTMLDirectoryElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLDirectoryElement, new.target);
      super(key, record, wrapHandle);
    }

    get [Symbol.toStringTag](): string {
      return "HTMLDirectoryElement";
    }
    get compact(): boolean {
      return attribute(element(this), "compact") !== null;
    }
    set compact(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "compact", Boolean(value));
    }
  }
  class HTMLFontElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLFontElement, new.target);
      super(key, record, wrapHandle);
    }

    get [Symbol.toStringTag](): string {
      return "HTMLFontElement";
    }
    get color(): string {
      return attribute(element(this), "color") ?? "";
    }
    set color(value: string | null) {
      Element.prototype.setAttribute.call(this, "color", value === null ? "" : `${value}`);
    }
    get face(): string {
      return attribute(element(this), "face") ?? "";
    }
    set face(value: string) {
      Element.prototype.setAttribute.call(this, "face", `${value}`);
    }
    get size(): string {
      return attribute(element(this), "size") ?? "";
    }
    set size(value: string) {
      Element.prototype.setAttribute.call(this, "size", `${value}`);
    }
  }

  class HTMLMarqueeElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLMarqueeElement, new.target);
      super(key, record, wrapHandle);
    }

    get [Symbol.toStringTag](): string {
      return "HTMLMarqueeElement";
    }
    get behavior(): string {
      return attribute(element(this), "behavior") ?? "";
    }
    set behavior(value: string) {
      Element.prototype.setAttribute.call(this, "behavior", domString(value));
    }
    get bgColor(): string {
      return attribute(element(this), "bgcolor") ?? "";
    }
    set bgColor(value: string) {
      Element.prototype.setAttribute.call(this, "bgcolor", domString(value));
    }
    get direction(): string {
      return attribute(element(this), "direction") ?? "";
    }
    set direction(value: string) {
      Element.prototype.setAttribute.call(this, "direction", domString(value));
    }
    get height(): string {
      return attribute(element(this), "height") ?? "";
    }
    set height(value: string) {
      Element.prototype.setAttribute.call(this, "height", domString(value));
    }
    get width(): string {
      return attribute(element(this), "width") ?? "";
    }
    set width(value: string) {
      Element.prototype.setAttribute.call(this, "width", domString(value));
    }
    get hspace(): number {
      return reflectedSpacing(this, "hspace");
    }
    set hspace(value: number) {
      setReflectedSpacing(this, "hspace", value);
    }
    get scrollAmount(): number {
      return reflectedSpacing(this, "scrollamount");
    }
    set scrollAmount(value: number) {
      setReflectedSpacing(this, "scrollamount", value);
    }
    get scrollDelay(): number {
      return reflectedSpacing(this, "scrolldelay");
    }
    set scrollDelay(value: number) {
      setReflectedSpacing(this, "scrolldelay", value);
    }
    get vspace(): number {
      return reflectedSpacing(this, "vspace");
    }
    set vspace(value: number) {
      setReflectedSpacing(this, "vspace", value);
    }
    get trueSpeed(): boolean {
      return attribute(element(this), "truespeed") !== null;
    }
    set trueSpeed(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "truespeed", Boolean(value));
    }
  }

  class HTMLSpanElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLSpanElement, new.target);
      super(key, record, wrapHandle);
    }
  }

  class HTMLHeadingElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLHeadingElement, new.target);
      super(key, record, wrapHandle);
    }

    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
  }

  class HTMLUListElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLUListElement, new.target);
      super(key, record, wrapHandle);
    }

    get type(): string {
      return attribute(element(this), "type") ?? "";
    }
    set type(value: string) {
      Element.prototype.setAttribute.call(this, "type", `${value}`);
    }
    get compact(): boolean {
      return attribute(element(this), "compact") !== null;
    }
    set compact(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "compact", Boolean(value));
    }
  }

  class HTMLOListElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLOListElement, new.target);
      super(key, record, wrapHandle);
    }

    get type(): string {
      return attribute(element(this), "type") ?? "";
    }
    set type(value: string) {
      Element.prototype.setAttribute.call(this, "type", `${value}`);
    }
    get reversed(): boolean {
      return attribute(element(this), "reversed") !== null;
    }
    set reversed(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "reversed", Boolean(value));
    }
    get compact(): boolean {
      return attribute(element(this), "compact") !== null;
    }
    set compact(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "compact", Boolean(value));
    }
    get start(): number {
      return reflectedLong(element(this), "start", 1);
    }
    set start(value: number) {
      Element.prototype.setAttribute.call(this, "start", String(+value | 0));
    }
  }

  class HTMLLIElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLLIElement, new.target);
      super(key, record, wrapHandle);
    }

    get type(): string {
      return attribute(element(this), "type") ?? "";
    }
    set type(value: string) {
      Element.prototype.setAttribute.call(this, "type", `${value}`);
    }
    get value(): number {
      return reflectedLong(element(this), "value", 0);
    }
    set value(value: number) {
      Element.prototype.setAttribute.call(this, "value", String(+value | 0));
    }
  }

  class HTMLDListElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLDListElement, new.target);
      super(key, record, wrapHandle);
    }

    get compact(): boolean {
      return attribute(element(this), "compact") !== null;
    }
    set compact(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "compact", Boolean(value));
    }
  }

  class HTMLMenuElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLMenuElement, new.target);
      super(key, record, wrapHandle);
    }

    get compact(): boolean {
      return attribute(element(this), "compact") !== null;
    }
    set compact(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "compact", Boolean(value));
    }
  }

  class HTMLPreElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLPreElement, new.target);
      super(key, record, wrapHandle);
    }

    get width(): number {
      return reflectedLong(element(this), "width", 0);
    }
    set width(value: number) {
      Element.prototype.setAttribute.call(this, "width", String(+value | 0));
    }
  }

  class HTMLBRElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLBRElement, new.target);
      super(key, record, wrapHandle);
    }

    get clear(): string {
      return attribute(element(this), "clear") ?? "";
    }
    set clear(value: string) {
      Element.prototype.setAttribute.call(this, "clear", `${value}`);
    }
  }

  class HTMLHRElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLHRElement, new.target);
      super(key, record, wrapHandle);
    }

    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
    get color(): string {
      return attribute(element(this), "color") ?? "";
    }
    set color(value: string) {
      Element.prototype.setAttribute.call(this, "color", `${value}`);
    }
    get size(): string {
      return attribute(element(this), "size") ?? "";
    }
    set size(value: string) {
      Element.prototype.setAttribute.call(this, "size", `${value}`);
    }
    get width(): string {
      return attribute(element(this), "width") ?? "";
    }
    set width(value: string) {
      Element.prototype.setAttribute.call(this, "width", `${value}`);
    }
    get noShade(): boolean {
      return attribute(element(this), "noshade") !== null;
    }
    set noShade(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "noshade", Boolean(value));
    }
  }

  class HTMLQuoteElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLQuoteElement, new.target);
      super(key, record, wrapHandle);
    }

    get cite(): string {
      const record = element(this);
      const value = attribute(record, "cite");
      if (value === null) return "";
      return parseElementURL(record, value)?.href ?? value.toWellFormed();
    }
    set cite(value: string) {
      Element.prototype.setAttribute.call(this, "cite", `${value}`.toWellFormed());
    }
  }

  function elementMatches(node: Raw.Element, selector: string): boolean {
    return selectorPredicate(selector, xmlDocumentFor(node), node)(node);
  }

  function adjacentElement(node: Raw.ChildNode, direction: 1 | -1): Element | null {
    const siblings = node.parentNode?.childNodes;
    if (!siblings) return null;
    for (
      let index = siblings.indexOf(node) + direction;
      index >= 0 && index < siblings.length;
      index += direction
    ) {
      const sibling = siblings[index];
      if (sibling && tree.isElementNode(sibling)) return wrapElement(sibling);
    }
    return null;
  }

  function htmlChildNamed(node: Raw.Node, ...names: string[]): node is Raw.Element {
    return (
      tree.isElementNode(node) &&
      node.namespaceURI === html.NS.HTML &&
      names.includes(elementLocalName(node))
    );
  }

  function tableRows(table: Raw.Element): Raw.Element[] {
    const head: Raw.Element[] = [];
    const body: Raw.Element[] = [];
    const foot: Raw.Element[] = [];
    for (const child of table.childNodes) {
      if (htmlChildNamed(child, "tr")) {
        body.push(child);
        continue;
      }
      if (!htmlChildNamed(child, "thead", "tbody", "tfoot")) continue;
      const rows = child.tagName.endsWith("thead")
        ? head
        : child.tagName.endsWith("tfoot")
          ? foot
          : body;
      for (const row of child.childNodes) if (htmlChildNamed(row, "tr")) rows.push(row);
    }
    return head.concat(body, foot);
  }

  function liveElementCollection(root: Raw.Element, query: () => Raw.Element[]): HTMLCollection {
    let cachedRealm: symbol | undefined;
    let cachedRevision: number | undefined;
    let members: WeakRef<Raw.Element>[] | undefined;
    function current(): WeakRef<Raw.Element>[] {
      const realm = hasAdditionalDocuments ? owningRealm(root) : token;
      const version = realm === token ? revision : realmTreeOperations.get(realm)?.revision();
      if (
        !members ||
        realm !== cachedRealm ||
        version !== cachedRevision ||
        version === undefined
      ) {
        members = query().map((node) => new WeakRef(node));
        cachedRealm = realm;
        cachedRevision = version;
      }
      return members;
    }
    return new HTMLCollection(token, {
      length: () => current().length,
      at(index) {
        const node = current()[index]?.deref();
        return node && wrapElement(node);
      },
    });
  }

  function newTablePart(owner: HTMLElement, tag: string): Element {
    const doc = ownerRecord(element(owner));
    const handle = doc === source ? document : (wrap(doc) as Document);
    return handle.createElementNS(html.NS.HTML, tag);
  }

  function insertTableItem(
    parent: HTMLElement,
    name: string,
    items: Raw.Element[],
    index: number,
  ): Element {
    if (index < -1 || index > items.length)
      throw new DOMException("Index is outside the allowed range", "IndexSizeError");
    const before = index === -1 ? undefined : items[index];
    const item = newTablePart(parent, name);
    Node.prototype.insertBefore.call(parent, item, before ? wrapElement(before) : null);
    return item;
  }

  function deleteTableItem(items: Raw.Element[], index: number): void {
    if (index < -1 || index >= items.length)
      throw new DOMException("Index is outside the allowed range", "IndexSizeError");
    const node = index === -1 ? items.at(-1) : items[index];
    if (node) wrapElement(node).remove();
  }

  function reflectedTableSpan(
    node: Raw.Element,
    name: string,
    minimum: number,
    maximum: number,
  ): number {
    const value = attribute(node, name);
    if (value === null) return 1;
    const digits = /^[\t\n\f\r ]*([+-]?[0-9]+)/.exec(value)?.[1];
    const parsed = Number(digits);
    return parsed >= 0 ? Math.min(maximum, Math.max(minimum, parsed)) : 1;
  }

  function setReflectedTableSpan(owner: HTMLElement, name: string, value: number): void {
    const converted = +value >>> 0;
    Element.prototype.setAttribute.call(
      owner,
      name,
      String(converted <= 0x7fffffff ? converted : 1),
    );
  }

  function directTableParts(parent: Raw.Element, ...names: string[]): Raw.Element[] {
    return parent.childNodes.filter((node) => htmlChildNamed(node, ...names));
  }

  class HTMLTableCaptionElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLTableCaptionElement, new.target);
      super(key, record, wrapHandle);
    }

    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
  }
  class HTMLTableColElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLTableColElement, new.target);
      super(key, record, wrapHandle);
    }

    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
    get ch(): string {
      return attribute(element(this), "char") ?? "";
    }
    set ch(value: string) {
      Element.prototype.setAttribute.call(this, "char", `${value}`);
    }
    get chOff(): string {
      return attribute(element(this), "charoff") ?? "";
    }
    set chOff(value: string) {
      Element.prototype.setAttribute.call(this, "charoff", `${value}`);
    }
    get vAlign(): string {
      return attribute(element(this), "valign") ?? "";
    }
    set vAlign(value: string) {
      Element.prototype.setAttribute.call(this, "valign", `${value}`);
    }
    get width(): string {
      return attribute(element(this), "width") ?? "";
    }
    set width(value: string) {
      Element.prototype.setAttribute.call(this, "width", `${value}`);
    }
    get span(): number {
      return reflectedTableSpan(element(this), "span", 1, 1000);
    }
    set span(value: number) {
      setReflectedTableSpan(this, "span", value);
    }
  }

  class HTMLTableCellElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLTableCellElement, new.target);
      super(key, record, wrapHandle);
    }

    get headers(): string {
      return attribute(element(this), "headers") ?? "";
    }
    set headers(value: string) {
      Element.prototype.setAttribute.call(this, "headers", `${value}`);
    }
    get abbr(): string {
      return attribute(element(this), "abbr") ?? "";
    }
    set abbr(value: string) {
      Element.prototype.setAttribute.call(this, "abbr", `${value}`);
    }
    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
    get axis(): string {
      return attribute(element(this), "axis") ?? "";
    }
    set axis(value: string) {
      Element.prototype.setAttribute.call(this, "axis", `${value}`);
    }
    get height(): string {
      return attribute(element(this), "height") ?? "";
    }
    set height(value: string) {
      Element.prototype.setAttribute.call(this, "height", `${value}`);
    }
    get width(): string {
      return attribute(element(this), "width") ?? "";
    }
    set width(value: string) {
      Element.prototype.setAttribute.call(this, "width", `${value}`);
    }
    get ch(): string {
      return attribute(element(this), "char") ?? "";
    }
    set ch(value: string) {
      Element.prototype.setAttribute.call(this, "char", `${value}`);
    }
    get chOff(): string {
      return attribute(element(this), "charoff") ?? "";
    }
    set chOff(value: string) {
      Element.prototype.setAttribute.call(this, "charoff", `${value}`);
    }
    get vAlign(): string {
      return attribute(element(this), "valign") ?? "";
    }
    set vAlign(value: string) {
      Element.prototype.setAttribute.call(this, "valign", `${value}`);
    }
    get bgColor(): string {
      return attribute(element(this), "bgcolor") ?? "";
    }
    set bgColor(value: string | null) {
      Element.prototype.setAttribute.call(this, "bgcolor", value === null ? "" : `${value}`);
    }
    get noWrap(): boolean {
      return attribute(element(this), "nowrap") !== null;
    }
    set noWrap(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "nowrap", Boolean(value));
    }
    get colSpan(): number {
      return reflectedTableSpan(element(this), "colspan", 1, 1000);
    }
    set colSpan(value: number) {
      setReflectedTableSpan(this, "colspan", value);
    }
    get rowSpan(): number {
      return reflectedTableSpan(element(this), "rowspan", 0, 65534);
    }
    set rowSpan(value: number) {
      setReflectedTableSpan(this, "rowspan", value);
    }
    get scope(): string {
      const value = asciiLower(attribute(element(this), "scope") ?? "");
      return value === "row" || value === "col" || value === "rowgroup" || value === "colgroup"
        ? value
        : "";
    }
    set scope(value: string) {
      Element.prototype.setAttribute.call(this, "scope", `${value}`);
    }
    get cellIndex(): number {
      const node = element(this);
      const parent = node.parentNode;
      return parent && htmlChildNamed(parent, "tr")
        ? directTableParts(parent, "td", "th").indexOf(node)
        : -1;
    }
  }

  class HTMLTableRowElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLTableRowElement, new.target);
      super(key, record, wrapHandle);
    }

    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
    get ch(): string {
      return attribute(element(this), "char") ?? "";
    }
    set ch(value: string) {
      Element.prototype.setAttribute.call(this, "char", `${value}`);
    }
    get chOff(): string {
      return attribute(element(this), "charoff") ?? "";
    }
    set chOff(value: string) {
      Element.prototype.setAttribute.call(this, "charoff", `${value}`);
    }
    get vAlign(): string {
      return attribute(element(this), "valign") ?? "";
    }
    set vAlign(value: string) {
      Element.prototype.setAttribute.call(this, "valign", `${value}`);
    }
    get bgColor(): string {
      return attribute(element(this), "bgcolor") ?? "";
    }
    set bgColor(value: string | null) {
      Element.prototype.setAttribute.call(this, "bgcolor", value === null ? "" : `${value}`);
    }
    #cells: HTMLCollection | undefined;
    get cells(): HTMLCollection {
      const node = element(this);
      return (this.#cells ??= liveElementCollection(node, () =>
        directTableParts(node, "td", "th"),
      ));
    }
    get rowIndex(): number {
      const node = element(this);
      const parent = node.parentNode;
      const table =
        parent && htmlChildNamed(parent, "thead", "tbody", "tfoot") ? parent.parentNode : parent;
      return table && htmlChildNamed(table, "table") ? tableRows(table).indexOf(node) : -1;
    }
    get sectionRowIndex(): number {
      const node = element(this);
      const parent = node.parentNode;
      if (!parent) return -1;
      if (htmlChildNamed(parent, "table")) return tableRows(parent).indexOf(node);
      return htmlChildNamed(parent, "thead", "tbody", "tfoot")
        ? directTableParts(parent, "tr").indexOf(node)
        : -1;
    }
    insertCell(index = -1): HTMLTableCellElement {
      return insertTableItem(
        this,
        "td",
        directTableParts(element(this), "td", "th"),
        +index | 0,
      ) as HTMLTableCellElement;
    }
    deleteCell(index: number): void {
      if (!arguments.length) throw new TypeError("An index is required");
      deleteTableItem(directTableParts(element(this), "td", "th"), +index | 0);
    }
  }

  class HTMLTableSectionElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLTableSectionElement, new.target);
      super(key, record, wrapHandle);
    }

    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
    get ch(): string {
      return attribute(element(this), "char") ?? "";
    }
    set ch(value: string) {
      Element.prototype.setAttribute.call(this, "char", `${value}`);
    }
    get chOff(): string {
      return attribute(element(this), "charoff") ?? "";
    }
    set chOff(value: string) {
      Element.prototype.setAttribute.call(this, "charoff", `${value}`);
    }
    get vAlign(): string {
      return attribute(element(this), "valign") ?? "";
    }
    set vAlign(value: string) {
      Element.prototype.setAttribute.call(this, "valign", `${value}`);
    }
    #rows: HTMLCollection | undefined;
    get rows(): HTMLCollection {
      const node = element(this);
      return (this.#rows ??= liveElementCollection(node, () => directTableParts(node, "tr")));
    }
    insertRow(index = -1): HTMLTableRowElement {
      return insertTableItem(
        this,
        "tr",
        directTableParts(element(this), "tr"),
        +index | 0,
      ) as HTMLTableRowElement;
    }
    deleteRow(index: number): void {
      if (!arguments.length) throw new TypeError("An index is required");
      deleteTableItem(directTableParts(element(this), "tr"), +index | 0);
    }
  }

  class HTMLTableElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLTableElement, new.target);
      super(key, record, wrapHandle);
    }

    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
    get border(): string {
      return attribute(element(this), "border") ?? "";
    }
    set border(value: string) {
      Element.prototype.setAttribute.call(this, "border", `${value}`);
    }
    get frame(): string {
      return attribute(element(this), "frame") ?? "";
    }
    set frame(value: string) {
      Element.prototype.setAttribute.call(this, "frame", `${value}`);
    }
    get rules(): string {
      return attribute(element(this), "rules") ?? "";
    }
    set rules(value: string) {
      Element.prototype.setAttribute.call(this, "rules", `${value}`);
    }
    get summary(): string {
      return attribute(element(this), "summary") ?? "";
    }
    set summary(value: string) {
      Element.prototype.setAttribute.call(this, "summary", `${value}`);
    }
    get width(): string {
      return attribute(element(this), "width") ?? "";
    }
    set width(value: string) {
      Element.prototype.setAttribute.call(this, "width", `${value}`);
    }
    get bgColor(): string {
      return attribute(element(this), "bgcolor") ?? "";
    }
    set bgColor(value: string | null) {
      Element.prototype.setAttribute.call(this, "bgcolor", value === null ? "" : `${value}`);
    }
    get cellPadding(): string {
      return attribute(element(this), "cellpadding") ?? "";
    }
    set cellPadding(value: string | null) {
      Element.prototype.setAttribute.call(this, "cellpadding", value === null ? "" : `${value}`);
    }
    get cellSpacing(): string {
      return attribute(element(this), "cellspacing") ?? "";
    }
    set cellSpacing(value: string | null) {
      Element.prototype.setAttribute.call(this, "cellspacing", value === null ? "" : `${value}`);
    }
    #rows: HTMLCollection | undefined;
    #bodies: HTMLCollection | undefined;
    #part(name: string): Element | null {
      const node = element(this).childNodes.find((child) => htmlChildNamed(child, name));
      return node && tree.isElementNode(node) ? wrapElement(node) : null;
    }
    #replacePart(name: "caption" | "thead" | "tfoot", value: Element | null): void {
      if (value != null) {
        const node = nodeRecord(value)?.node;
        if (!node || !htmlChildNamed(node, name)) {
          if (node && name !== "caption" && htmlChildNamed(node, "thead", "tbody", "tfoot"))
            throw new DOMException("Unexpected table section", "HierarchyRequestError");
          throw new TypeError("Expected a matching table part");
        }
      }
      this.#part(name)?.remove();
      if (value == null) return;
      const children = element(this).childNodes;
      const before =
        name === "caption"
          ? children[0]
          : name === "thead"
            ? children.find(
                (node) => tree.isElementNode(node) && !htmlChildNamed(node, "caption", "colgroup"),
              )
            : undefined;
      Node.prototype.insertBefore.call(this, value, before ? wrap(before) : null);
    }
    get caption(): HTMLTableCaptionElement | null {
      return this.#part("caption") as HTMLTableCaptionElement | null;
    }
    set caption(value: HTMLTableCaptionElement | null) {
      this.#replacePart("caption", value);
    }
    createCaption(): HTMLTableCaptionElement {
      const current = this.#part("caption");
      if (current) return current as HTMLTableCaptionElement;
      const caption = newTablePart(this, "caption") as HTMLTableCaptionElement;
      this.#replacePart("caption", caption);
      return caption;
    }
    deleteCaption(): void {
      this.#replacePart("caption", null);
    }
    get tHead(): HTMLTableSectionElement | null {
      return this.#part("thead") as HTMLTableSectionElement | null;
    }
    set tHead(value: HTMLTableSectionElement | null) {
      this.#replacePart("thead", value);
    }
    createTHead(): HTMLTableSectionElement {
      return this.#createSection("thead");
    }
    deleteTHead(): void {
      this.#replacePart("thead", null);
    }
    get tFoot(): HTMLTableSectionElement | null {
      return this.#part("tfoot") as HTMLTableSectionElement | null;
    }
    set tFoot(value: HTMLTableSectionElement | null) {
      this.#replacePart("tfoot", value);
    }
    createTFoot(): HTMLTableSectionElement {
      return this.#createSection("tfoot");
    }
    deleteTFoot(): void {
      this.#replacePart("tfoot", null);
    }
    #createSection(name: "thead" | "tfoot"): HTMLTableSectionElement {
      const current = this.#part(name);
      if (current) return current as HTMLTableSectionElement;
      const section = newTablePart(this, name) as HTMLTableSectionElement;
      this.#replacePart(name, section);
      return section;
    }
    get tBodies(): HTMLCollection {
      const node = element(this);
      return (this.#bodies ??= liveElementCollection(node, () => directTableParts(node, "tbody")));
    }
    createTBody(): HTMLTableSectionElement {
      const node = element(this);
      const last = directTableParts(node, "tbody").at(-1);
      const next = last && node.childNodes[node.childNodes.indexOf(last) + 1];
      const body = newTablePart(this, "tbody") as HTMLTableSectionElement;
      Node.prototype.insertBefore.call(this, body, next ? wrap(next) : null);
      return body;
    }
    get rows(): HTMLCollection {
      const node = element(this);
      return (this.#rows ??= liveElementCollection(node, () => tableRows(node)));
    }
    insertRow(index = -1): HTMLTableRowElement {
      const position = +index | 0;
      const node = element(this);
      const rows = tableRows(node);
      if (position < -1 || position > rows.length)
        throw new DOMException("Index is outside the allowed range", "IndexSizeError");
      const row = newTablePart(this, "tr") as HTMLTableRowElement;
      const before = position === -1 ? undefined : rows[position];
      const parent = (before ?? rows.at(-1))?.parentNode ?? directTableParts(node, "tbody").at(-1);
      const target = parent ? wrap(parent) : this.createTBody();
      Node.prototype.insertBefore.call(target, row, before ? wrapElement(before) : null);
      return row;
    }
    deleteRow(index: number): void {
      if (!arguments.length) throw new TypeError("An index is required");
      deleteTableItem(tableRows(element(this)), +index | 0);
    }
  }

  class HTMLTemplateElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLTemplateElement, new.target);
      super(key, record, wrapHandle);
    }

    get shadowRootMode(): string {
      const value = asciiLower(attribute(element(this), "shadowrootmode") ?? "");
      return value === "open" || value === "closed" ? value : "";
    }
    set shadowRootMode(value: string) {
      Element.prototype.setAttribute.call(this, "shadowrootmode", value);
    }
    get shadowRootDelegatesFocus(): boolean {
      return attribute(element(this), "shadowrootdelegatesfocus") !== null;
    }
    set shadowRootDelegatesFocus(value: boolean) {
      if (value) Element.prototype.setAttribute.call(this, "shadowrootdelegatesfocus", "");
      else Element.prototype.removeAttribute.call(this, "shadowrootdelegatesfocus");
    }
    get shadowRootClonable(): boolean {
      return attribute(element(this), "shadowrootclonable") !== null;
    }
    set shadowRootClonable(value: boolean) {
      if (value) Element.prototype.setAttribute.call(this, "shadowrootclonable", "");
      else Element.prototype.removeAttribute.call(this, "shadowrootclonable");
    }
    get shadowRootSerializable(): boolean {
      return attribute(element(this), "shadowrootserializable") !== null;
    }
    set shadowRootSerializable(value: boolean) {
      if (value) Element.prototype.setAttribute.call(this, "shadowrootserializable", "");
      else Element.prototype.removeAttribute.call(this, "shadowrootserializable");
    }
    get shadowRootSlotAssignment(): "named" | "manual" {
      return asciiLower(attribute(element(this), "shadowrootslotassignment") ?? "") === "manual"
        ? "manual"
        : "named";
    }
    set shadowRootSlotAssignment(value: string) {
      Element.prototype.setAttribute.call(this, "shadowrootslotassignment", value);
    }
    get content(): DocumentFragment {
      const host = element(this);
      const fragment = templateContent(host);
      if (!fragment) throw new TypeError("Expected template contents");
      const contents = wrap(fragment) as DocumentFragment;
      const hosts = (exposedTemplateHosts ??= new WeakMap());
      if (!hosts.has(fragment)) {
        hosts.set(fragment, host);
        setOwner(fragment, templateOwner(ownerRecord(host)));
      }
      return contents;
    }
  }

  class HTMLScriptElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLScriptElement, new.target);
      super(key, record, wrapHandle);
    }

    get type(): string {
      return attribute(element(this), "type") ?? "";
    }
    set type(value: string) {
      Element.prototype.setAttribute.call(this, "type", `${value}`);
    }
    get charset(): string {
      return attribute(element(this), "charset") ?? "";
    }
    set charset(value: string) {
      Element.prototype.setAttribute.call(this, "charset", `${value}`);
    }
    get event(): string {
      return attribute(element(this), "event") ?? "";
    }
    set event(value: string) {
      Element.prototype.setAttribute.call(this, "event", `${value}`);
    }
    get htmlFor(): string {
      return attribute(element(this), "for") ?? "";
    }
    set htmlFor(value: string) {
      Element.prototype.setAttribute.call(this, "for", `${value}`);
    }
    get crossOrigin(): string | null {
      return attribute(element(this), "crossorigin");
    }
    set crossOrigin(value: string | null) {
      if (value == null) Element.prototype.removeAttribute.call(this, "crossorigin");
      else Element.prototype.setAttribute.call(this, "crossorigin", `${value}`);
    }
    get async(): boolean {
      const node = element(this);
      return !scriptAsyncCleared.has(node) || attribute(node, "async") !== null;
    }
    set async(value: boolean) {
      scriptAsyncCleared.add(element(this));
      Element.prototype.toggleAttribute.call(this, "async", Boolean(value));
    }
    get defer(): boolean {
      return attribute(element(this), "defer") !== null;
    }
    set defer(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "defer", Boolean(value));
    }
    get text(): string {
      return childTextContent(element(this));
    }
    set text(value: string) {
      setChildTextContent(element(this), value);
    }
    get src(): string {
      const value = attribute(element(this), "src");
      return value === null ? "" : (parseElementURL(element(this), value)?.href ?? value);
    }
    set src(value: string) {
      this.setAttribute("src", value);
    }
    override setAttribute(name: string, value: string): void {
      super.setAttribute(name, value);
      if (String(name).toLowerCase() === "async") scriptAsyncCleared.add(element(this));
      if (String(name).toLowerCase() === "src") activateInsertedScript(element(this));
    }
  }

  class HTMLLinkElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLLinkElement, new.target);
      super(key, record, wrapHandle);
    }

    #sizes: DOMTokenList | undefined;
    get sizes(): DOMTokenList {
      return (this.#sizes ??= new DOMTokenList(token, this, "sizes"));
    }
    set sizes(value: string) {
      this.sizes.value = value;
    }
    #relList: DOMTokenList | undefined;
    get relList(): DOMTokenList {
      return (this.#relList ??= new DOMTokenList(token, this, "rel", supportedLinkRelationships));
    }
    set relList(value: string) {
      this.relList.value = value;
    }
    get charset(): string {
      return attribute(element(this), "charset") ?? "";
    }
    set charset(value: string) {
      Element.prototype.setAttribute.call(this, "charset", `${value}`);
    }
    get hreflang(): string {
      return attribute(element(this), "hreflang") ?? "";
    }
    set hreflang(value: string) {
      Element.prototype.setAttribute.call(this, "hreflang", `${value}`);
    }
    get rev(): string {
      return attribute(element(this), "rev") ?? "";
    }
    set rev(value: string) {
      Element.prototype.setAttribute.call(this, "rev", `${value}`);
    }
    get target(): string {
      return attribute(element(this), "target") ?? "";
    }
    set target(value: string) {
      Element.prototype.setAttribute.call(this, "target", `${value}`);
    }
    get type(): string {
      return attribute(element(this), "type") ?? "";
    }
    set type(value: string) {
      Element.prototype.setAttribute.call(this, "type", `${value}`);
    }
    get crossOrigin(): string | null {
      return attribute(element(this), "crossorigin");
    }
    set crossOrigin(value: string | null) {
      if (value == null) Element.prototype.removeAttribute.call(this, "crossorigin");
      else Element.prototype.setAttribute.call(this, "crossorigin", `${value}`);
    }
    get rel(): string {
      return attribute(element(this), "rel") ?? "";
    }
    set rel(value: string) {
      this.setAttribute("rel", value);
    }
    get href(): string {
      const value = attribute(element(this), "href");
      return value === null ? "" : (parseElementURL(element(this), value)?.href ?? value);
    }
    set href(value: string) {
      this.setAttribute("href", value);
    }
    get media(): string {
      return attribute(element(this), "media") ?? "";
    }
    set media(value: string) {
      this.setAttribute("media", value);
    }
    get disabled(): boolean {
      return attribute(element(this), "disabled") !== null;
    }
    set disabled(value: boolean) {
      const node = element(this);
      const disabled = Boolean(value);
      const wasDisabled = attribute(node, "disabled") !== null;
      Element.prototype.toggleAttribute.call(this, "disabled", disabled);
      if (!disabled && !wasDisabled) enableStylesheetLink(node);
    }
    get sheet() {
      return styles().exposeSheet(styles().sheet(element(this)));
    }
  }

  class HTMLStyleElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLStyleElement, new.target);
      super(key, record, wrapHandle);
    }

    get type(): string {
      return attribute(element(this), "type") ?? "";
    }
    set type(value: string) {
      Element.prototype.setAttribute.call(this, "type", `${value}`);
    }
    get media(): string {
      return attribute(element(this), "media") ?? "";
    }
    set media(value: string) {
      this.setAttribute("media", value);
    }
    get disabled(): boolean {
      const node = element(this);
      return connected(node) && (styles().applyInline(node)?.disabled ?? false);
    }
    set disabled(value: boolean) {
      const node = element(this);
      const sheet = connected(node) ? styles().exposeSheet(styles().applyInline(node)) : null;
      if (sheet) sheet.disabled = Boolean(value);
    }
    get sheet() {
      const node = element(this);
      return connected(node) ? styles().exposeSheet(styles().applyInline(node)) : null;
    }
  }

  class FrameElement extends HTMLElement {
    get frameBorder(): string {
      return attribute(element(this), "frameborder") ?? "";
    }
    set frameBorder(value: string) {
      Element.prototype.setAttribute.call(this, "frameborder", value);
    }
    get scrolling(): string {
      return attribute(element(this), "scrolling") ?? "";
    }
    set scrolling(value: string) {
      Element.prototype.setAttribute.call(this, "scrolling", value);
    }
    get marginHeight(): string {
      return attribute(element(this), "marginheight") ?? "";
    }
    set marginHeight(value: string | null) {
      Element.prototype.setAttribute.call(this, "marginheight", value === null ? "" : value);
    }
    get marginWidth(): string {
      return attribute(element(this), "marginwidth") ?? "";
    }
    set marginWidth(value: string | null) {
      Element.prototype.setAttribute.call(this, "marginwidth", value === null ? "" : value);
    }
    get longDesc(): string {
      return reflectedResourceURL(element(this), "longdesc");
    }
    set longDesc(value: string) {
      Element.prototype.setAttribute.call(this, "longdesc", `${value}`.toWellFormed());
    }
    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      Element.prototype.setAttribute.call(this, "name", value);
    }
    get src(): string {
      return reflectedResourceURL(element(this), "src");
    }
    set src(value: string) {
      Element.prototype.setAttribute.call(this, "src", `${value}`.toWellFormed());
    }
    get contentWindow(): ChildRealm["window"] | null {
      const node = element(this);
      const owner = owningRealm(node);
      if (owner !== token) return realmTreeOperations.get(owner)?.frameWindow(node) ?? null;
      return frameWindow(node);
    }
    get contentDocument(): object | null {
      return this.contentWindow?.document ?? null;
    }
  }
  class HTMLFrameElement extends FrameElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLFrameElement, new.target);
      super(key, record, wrapHandle);
    }

    get noResize(): boolean {
      return attribute(element(this), "noresize") !== null;
    }
    set noResize(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "noresize", Boolean(value));
    }
  }
  class HTMLIFrameElement extends FrameElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLIFrameElement, new.target);
      super(key, record, wrapHandle);
    }

    /** Returns the document of a same-origin SVG navigation. */
    getSVGDocument(): object | null {
      const node = element(this);
      if (!htmlChildNamed(node, "iframe")) throw new TypeError("Illegal invocation");
      const owner = owningRealm(node);
      if (owner !== token) return realmTreeOperations.get(owner)?.frameSVGDocument(node) ?? null;
      return frameSVGDocument(node);
    }
    get loading(): string {
      return reflectedLoading(element(this));
    }
    set loading(value: string) {
      Element.prototype.setAttribute.call(this, "loading", `${value}`);
    }
    get referrerPolicy(): string {
      return reflectedReferrerPolicy(element(this));
    }
    set referrerPolicy(value: string) {
      Element.prototype.setAttribute.call(this, "referrerpolicy", `${value}`);
    }
    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", value);
    }
    get allowFullscreen(): boolean {
      return attribute(element(this), "allowfullscreen") !== null;
    }
    set allowFullscreen(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "allowfullscreen", Boolean(value));
    }
    get width(): string {
      return attribute(element(this), "width") ?? "";
    }
    set width(value: string) {
      this.setAttribute("width", value);
    }
    get height(): string {
      return attribute(element(this), "height") ?? "";
    }
    set height(value: string) {
      this.setAttribute("height", value);
    }
    get srcdoc(): string {
      return attribute(element(this), "srcdoc") ?? "";
    }
    set srcdoc(value: string) {
      this.setAttribute("srcdoc", value);
    }
  }

  type HyperlinkComponent =
    | "protocol"
    | "username"
    | "password"
    | "host"
    | "hostname"
    | "port"
    | "pathname"
    | "search"
    | "hash";

  function hyperlinkURL(node: Raw.Element, search?: string): URL | null {
    const value = attribute(node, "href");
    return value === null ? null : parseElementURL(node, value, search);
  }

  function setHyperlinkComponent(owner: HTMLElement, key: HyperlinkComponent, value: string): void {
    const input = `${value}`.toWellFormed();
    const url = hyperlinkURL(element(owner), key === "search" ? input : undefined);
    if (!url) return;
    if (
      (key === "username" || key === "password" || key === "port") &&
      (!url.hostname || url.protocol === "file:")
    )
      return;
    if (
      (key === "host" || key === "hostname" || key === "pathname") &&
      !url.host &&
      !url.pathname.startsWith("/") &&
      !url.href.startsWith(url.protocol + "//")
    )
      return;
    if (key !== "search") url[key] = input;
    Element.prototype.setAttribute.call(owner, "href", url.href);
  }

  function hyperlinkHref(node: Raw.Element): string {
    return hyperlinkURL(node)?.href ?? attribute(node, "href")?.toWellFormed() ?? "";
  }

  function stringifyHyperlink(receiver: object, tag: "a" | "area"): string {
    const node = nodeRecord(receiver)?.node;
    if (
      node &&
      tree.isElementNode(node) &&
      node.namespaceURI === html.NS.HTML &&
      elementLocalName(node) === tag
    )
      return hyperlinkHref(node);
    const Exception: TypeErrorConstructor = context ? Reflect.get(context, "TypeError") : TypeError;
    throw new Exception("Expected an HTML hyperlink of the matching interface");
  }

  function reflectedLoading(node: Raw.Element): string {
    return asciiLower(attribute(node, "loading") ?? "") === "lazy" ? "lazy" : "eager";
  }

  function reflectedReferrerPolicy(node: Raw.Element): string {
    const value = asciiLower(attribute(node, "referrerpolicy") ?? "");
    return referrerPolicyKeywords.has(value) ? value : "";
  }

  class HTMLAnchorElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLAnchorElement, new.target);
      super(key, record, wrapHandle);
    }

    #relList: DOMTokenList | undefined;
    get relList(): DOMTokenList {
      return (this.#relList ??= new DOMTokenList(token, this, "rel"));
    }
    set relList(value: string) {
      this.relList.value = value;
    }
    get href(): string {
      return hyperlinkHref(element(this));
    }
    set href(value: string) {
      Element.prototype.setAttribute.call(this, "href", `${value}`.toWellFormed());
    }
    get origin(): string {
      return hyperlinkURL(element(this))?.origin ?? "";
    }
    get protocol(): string {
      return hyperlinkURL(element(this))?.protocol ?? ":";
    }
    set protocol(value: string) {
      setHyperlinkComponent(this, "protocol", value);
    }
    get username(): string {
      return hyperlinkURL(element(this))?.username ?? "";
    }
    set username(value: string) {
      setHyperlinkComponent(this, "username", value);
    }
    get password(): string {
      return hyperlinkURL(element(this))?.password ?? "";
    }
    set password(value: string) {
      setHyperlinkComponent(this, "password", value);
    }
    get host(): string {
      return hyperlinkURL(element(this))?.host ?? "";
    }
    set host(value: string) {
      setHyperlinkComponent(this, "host", value);
    }
    get hostname(): string {
      return hyperlinkURL(element(this))?.hostname ?? "";
    }
    set hostname(value: string) {
      setHyperlinkComponent(this, "hostname", value);
    }
    get port(): string {
      return hyperlinkURL(element(this))?.port ?? "";
    }
    set port(value: string) {
      setHyperlinkComponent(this, "port", value);
    }
    get pathname(): string {
      return hyperlinkURL(element(this))?.pathname ?? "";
    }
    set pathname(value: string) {
      setHyperlinkComponent(this, "pathname", value);
    }
    get search(): string {
      return hyperlinkURL(element(this))?.search ?? "";
    }
    set search(value: string) {
      setHyperlinkComponent(this, "search", value);
    }
    get hash(): string {
      return hyperlinkURL(element(this))?.hash ?? "";
    }
    set hash(value: string) {
      setHyperlinkComponent(this, "hash", value);
    }
    get target(): string {
      return attribute(element(this), "target") ?? "";
    }
    set target(value: string) {
      this.setAttribute("target", value);
    }
    get rel(): string {
      return attribute(element(this), "rel") ?? "";
    }
    set rel(value: string) {
      this.setAttribute("rel", value);
    }
    get download(): string {
      return attribute(element(this), "download") ?? "";
    }
    set download(value: string) {
      Element.prototype.setAttribute.call(this, "download", `${value}`);
    }
    get ping(): string {
      return (attribute(element(this), "ping") ?? "").toWellFormed();
    }
    set ping(value: string) {
      Element.prototype.setAttribute.call(this, "ping", `${value}`.toWellFormed());
    }
    get referrerPolicy(): string {
      return reflectedReferrerPolicy(element(this));
    }
    set referrerPolicy(value: string) {
      Element.prototype.setAttribute.call(this, "referrerpolicy", `${value}`);
    }
    get hreflang(): string {
      return attribute(element(this), "hreflang") ?? "";
    }
    set hreflang(value: string) {
      Element.prototype.setAttribute.call(this, "hreflang", `${value}`);
    }
    get type(): string {
      return attribute(element(this), "type") ?? "";
    }
    set type(value: string) {
      Element.prototype.setAttribute.call(this, "type", `${value}`);
    }
    get coords(): string {
      return attribute(element(this), "coords") ?? "";
    }
    set coords(value: string) {
      Element.prototype.setAttribute.call(this, "coords", `${value}`);
    }
    get charset(): string {
      return attribute(element(this), "charset") ?? "";
    }
    set charset(value: string) {
      Element.prototype.setAttribute.call(this, "charset", `${value}`);
    }
    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      Element.prototype.setAttribute.call(this, "name", `${value}`);
    }
    get rev(): string {
      return attribute(element(this), "rev") ?? "";
    }
    set rev(value: string) {
      Element.prototype.setAttribute.call(this, "rev", `${value}`);
    }
    get shape(): string {
      return attribute(element(this), "shape") ?? "";
    }
    set shape(value: string) {
      Element.prototype.setAttribute.call(this, "shape", `${value}`);
    }
    get text(): string {
      return this.textContent ?? "";
    }
    set text(value: string) {
      this.textContent = `${value}`;
    }
    override toString(): string {
      return stringifyHyperlink(this, "a");
    }
  }

  class HTMLAreaElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLAreaElement, new.target);
      super(key, record, wrapHandle);
    }

    get referrerPolicy(): string {
      return reflectedReferrerPolicy(element(this));
    }
    set referrerPolicy(value: string) {
      Element.prototype.setAttribute.call(this, "referrerpolicy", `${value}`);
    }
    #relList: DOMTokenList | undefined;
    get relList(): DOMTokenList {
      return (this.#relList ??= new DOMTokenList(token, this, "rel"));
    }
    set relList(value: string) {
      this.relList.value = value;
    }
    get href(): string {
      return hyperlinkHref(element(this));
    }
    set href(value: string) {
      Element.prototype.setAttribute.call(this, "href", `${value}`.toWellFormed());
    }
    get origin(): string {
      return hyperlinkURL(element(this))?.origin ?? "";
    }
    get protocol(): string {
      return hyperlinkURL(element(this))?.protocol ?? ":";
    }
    set protocol(value: string) {
      setHyperlinkComponent(this, "protocol", value);
    }
    get username(): string {
      return hyperlinkURL(element(this))?.username ?? "";
    }
    set username(value: string) {
      setHyperlinkComponent(this, "username", value);
    }
    get password(): string {
      return hyperlinkURL(element(this))?.password ?? "";
    }
    set password(value: string) {
      setHyperlinkComponent(this, "password", value);
    }
    get host(): string {
      return hyperlinkURL(element(this))?.host ?? "";
    }
    set host(value: string) {
      setHyperlinkComponent(this, "host", value);
    }
    get hostname(): string {
      return hyperlinkURL(element(this))?.hostname ?? "";
    }
    set hostname(value: string) {
      setHyperlinkComponent(this, "hostname", value);
    }
    get port(): string {
      return hyperlinkURL(element(this))?.port ?? "";
    }
    set port(value: string) {
      setHyperlinkComponent(this, "port", value);
    }
    get pathname(): string {
      return hyperlinkURL(element(this))?.pathname ?? "";
    }
    set pathname(value: string) {
      setHyperlinkComponent(this, "pathname", value);
    }
    get search(): string {
      return hyperlinkURL(element(this))?.search ?? "";
    }
    set search(value: string) {
      setHyperlinkComponent(this, "search", value);
    }
    get hash(): string {
      return hyperlinkURL(element(this))?.hash ?? "";
    }
    set hash(value: string) {
      setHyperlinkComponent(this, "hash", value);
    }
    get ping(): string {
      return (attribute(element(this), "ping") ?? "").toWellFormed();
    }
    set ping(value: string) {
      Element.prototype.setAttribute.call(this, "ping", `${value}`.toWellFormed());
    }
    get download(): string {
      return attribute(element(this), "download") ?? "";
    }
    set download(value: string) {
      Element.prototype.setAttribute.call(this, "download", `${value}`);
    }
    get hreflang(): string {
      return attribute(element(this), "hreflang") ?? "";
    }
    set hreflang(value: string) {
      Element.prototype.setAttribute.call(this, "hreflang", `${value}`);
    }
    get type(): string {
      return attribute(element(this), "type") ?? "";
    }
    set type(value: string) {
      Element.prototype.setAttribute.call(this, "type", `${value}`);
    }
    get alt(): string {
      return attribute(element(this), "alt") ?? "";
    }
    set alt(value: string) {
      Element.prototype.setAttribute.call(this, "alt", `${value}`);
    }
    get coords(): string {
      return attribute(element(this), "coords") ?? "";
    }
    set coords(value: string) {
      Element.prototype.setAttribute.call(this, "coords", `${value}`);
    }
    get shape(): string {
      return attribute(element(this), "shape") ?? "";
    }
    set shape(value: string) {
      Element.prototype.setAttribute.call(this, "shape", `${value}`);
    }
    get target(): string {
      return attribute(element(this), "target") ?? "";
    }
    set target(value: string) {
      Element.prototype.setAttribute.call(this, "target", `${value}`);
    }
    get rel(): string {
      return attribute(element(this), "rel") ?? "";
    }
    set rel(value: string) {
      Element.prototype.setAttribute.call(this, "rel", `${value}`);
    }
    get noHref(): boolean {
      return attribute(element(this), "nohref") !== null;
    }
    set noHref(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "nohref", Boolean(value));
    }
    override toString(): string {
      return stringifyHyperlink(this, "area");
    }
  }

  let mapAreas: WeakMap<Raw.Element, HTMLCollection> | undefined;
  class HTMLMapElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLMapElement, new.target);
      super(key, record, wrapHandle);
    }

    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      Element.prototype.setAttribute.call(this, "name", `${value}`);
    }
    get areas(): HTMLCollection {
      const node = element(this);
      const lists = (mapAreas ??= new WeakMap());
      const existing = lists.get(node);
      if (existing) return existing;
      const areas = liveElementCollection(node, () =>
        Array.from(descendants(node)).filter((child) => htmlChildNamed(child, "area")),
      );
      lists.set(node, areas);
      return areas;
    }
  }

  function reflectedResourceURL(node: Raw.Element, name: string): string {
    const value = attribute(node, name);
    if (value === null) return "";
    return parseElementURL(node, value)?.href ?? value.toWellFormed();
  }

  function reflectedSpacing(
    owner: HTMLElement,
    name: "hspace" | "vspace" | "scrollamount" | "scrolldelay",
  ): number {
    return Math.max(0, reflectedLong(element(owner), name, 0));
  }

  function setReflectedSpacing(
    owner: HTMLElement,
    name: "hspace" | "vspace" | "scrollamount" | "scrolldelay",
    value: number,
  ): void {
    const converted = +value >>> 0;
    Element.prototype.setAttribute.call(
      owner,
      name,
      String(converted <= 0x7fffffff ? converted : 0),
    );
  }

  class HTMLObjectElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLObjectElement, new.target);
      super(key, record, wrapHandle);
    }

    get data(): string {
      return reflectedResourceURL(element(this), "data");
    }
    set data(value: string) {
      Element.prototype.setAttribute.call(this, "data", `${value}`.toWellFormed());
    }
    get codeBase(): string {
      return reflectedResourceURL(element(this), "codebase");
    }
    set codeBase(value: string) {
      Element.prototype.setAttribute.call(this, "codebase", `${value}`);
    }
    get type(): string {
      return attribute(element(this), "type") ?? "";
    }
    set type(value: string) {
      Element.prototype.setAttribute.call(this, "type", `${value}`);
    }
    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      Element.prototype.setAttribute.call(this, "name", `${value}`);
    }
    get useMap(): string {
      return attribute(element(this), "usemap") ?? "";
    }
    set useMap(value: string) {
      Element.prototype.setAttribute.call(this, "usemap", `${value}`);
    }
    get width(): string {
      return attribute(element(this), "width") ?? "";
    }
    set width(value: string) {
      Element.prototype.setAttribute.call(this, "width", `${value}`);
    }
    get height(): string {
      return attribute(element(this), "height") ?? "";
    }
    set height(value: string) {
      Element.prototype.setAttribute.call(this, "height", `${value}`);
    }
    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
    get archive(): string {
      return attribute(element(this), "archive") ?? "";
    }
    set archive(value: string) {
      Element.prototype.setAttribute.call(this, "archive", `${value}`);
    }
    get code(): string {
      return attribute(element(this), "code") ?? "";
    }
    set code(value: string) {
      Element.prototype.setAttribute.call(this, "code", `${value}`);
    }
    get standby(): string {
      return attribute(element(this), "standby") ?? "";
    }
    set standby(value: string) {
      Element.prototype.setAttribute.call(this, "standby", `${value}`);
    }
    get codeType(): string {
      return attribute(element(this), "codetype") ?? "";
    }
    set codeType(value: string) {
      Element.prototype.setAttribute.call(this, "codetype", `${value}`);
    }
    get border(): string {
      return attribute(element(this), "border") ?? "";
    }
    set border(value: string | null) {
      Element.prototype.setAttribute.call(this, "border", value === null ? "" : `${value}`);
    }
    get declare(): boolean {
      return attribute(element(this), "declare") !== null;
    }
    set declare(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "declare", Boolean(value));
    }
    get hspace(): number {
      return reflectedSpacing(this, "hspace");
    }
    set hspace(value: number) {
      setReflectedSpacing(this, "hspace", value);
    }
    get vspace(): number {
      return reflectedSpacing(this, "vspace");
    }
    set vspace(value: number) {
      setReflectedSpacing(this, "vspace", value);
    }
    get form(): HTMLFormElement | null {
      const owner = formOwner(element(this));
      return owner ? (wrapElement(owner) as HTMLFormElement) : null;
    }
    get contentDocument(): null {
      return null;
    }
    get willValidate(): boolean {
      return validationCandidate(element(this));
    }
    get validity(): ValidityState {
      return validityFor(element(this));
    }
    get validationMessage(): string {
      return validationMessageFor(element(this));
    }
    setCustomValidity(message: string): void {
      if (!arguments.length) throw new TypeError("A validation message is required");
      setValidationMessage(element(this), message);
    }
    checkValidity(): boolean {
      return checkControlValidity(this);
    }
    reportValidity(): boolean {
      return checkControlValidity(this);
    }
  }

  class HTMLEmbedElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLEmbedElement, new.target);
      super(key, record, wrapHandle);
    }

    get src(): string {
      return reflectedResourceURL(element(this), "src");
    }
    set src(value: string) {
      Element.prototype.setAttribute.call(this, "src", `${value}`.toWellFormed());
    }
    get type(): string {
      return attribute(element(this), "type") ?? "";
    }
    set type(value: string) {
      Element.prototype.setAttribute.call(this, "type", `${value}`);
    }
    get width(): string {
      return attribute(element(this), "width") ?? "";
    }
    set width(value: string) {
      Element.prototype.setAttribute.call(this, "width", `${value}`);
    }
    get height(): string {
      return attribute(element(this), "height") ?? "";
    }
    set height(value: string) {
      Element.prototype.setAttribute.call(this, "height", `${value}`);
    }
    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      Element.prototype.setAttribute.call(this, "name", `${value}`);
    }
  }

  function emptyMediaRanges() {
    return { length: 0, start: () => 0, end: () => 0 };
  }

  function mediaNumber(value: number): number {
    const number = +value;
    if (!Number.isFinite(number)) throw new TypeError("A media value must be finite");
    return number;
  }

  class HTMLMediaElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLMediaElement, new.target);
      super(key, record, wrapHandle);
    }

    declare static readonly NETWORK_EMPTY: 0;
    declare static readonly NETWORK_IDLE: 1;
    declare static readonly NETWORK_LOADING: 2;
    declare static readonly NETWORK_NO_SOURCE: 3;
    declare static readonly HAVE_NOTHING: 0;
    declare static readonly HAVE_METADATA: 1;
    declare static readonly HAVE_CURRENT_DATA: 2;
    declare static readonly HAVE_FUTURE_DATA: 3;
    declare static readonly HAVE_ENOUGH_DATA: 4;
    declare readonly NETWORK_EMPTY: 0;
    declare readonly NETWORK_IDLE: 1;
    declare readonly NETWORK_LOADING: 2;
    declare readonly NETWORK_NO_SOURCE: 3;
    declare readonly HAVE_NOTHING: 0;
    declare readonly HAVE_METADATA: 1;
    declare readonly HAVE_CURRENT_DATA: 2;
    declare readonly HAVE_FUTURE_DATA: 3;
    declare readonly HAVE_ENOUGH_DATA: 4;

    static {
      Object.defineProperties(this, mediaStateDescriptors);
      Object.defineProperties(this.prototype, mediaStateDescriptors);
    }

    #currentTime = 0;
    #volume = 1;
    #muted = false;
    #defaultPlaybackRate: number | undefined;
    #playbackRate: number | undefined;
    #buffered: ReturnType<typeof emptyMediaRanges> | undefined;
    #played: ReturnType<typeof emptyMediaRanges> | undefined;
    #seekable: ReturnType<typeof emptyMediaRanges> | undefined;
    #audioTracks: never[] | undefined;
    #videoTracks: never[] | undefined;
    #textTracks: never[] | undefined;

    get loading(): string {
      return reflectedLoading(element(this));
    }
    set loading(value: string) {
      Element.prototype.setAttribute.call(this, "loading", `${value}`);
    }
    get [Symbol.toStringTag](): string {
      return "HTMLMediaElement";
    }
    get src(): string {
      return reflectedResourceURL(element(this), "src");
    }
    set src(value: string) {
      Element.prototype.setAttribute.call(this, "src", `${value}`.toWellFormed());
    }
    get crossOrigin(): string | null {
      return attribute(element(this), "crossorigin");
    }
    set crossOrigin(value: string | null) {
      if (value == null) Element.prototype.removeAttribute.call(this, "crossorigin");
      else Element.prototype.setAttribute.call(this, "crossorigin", `${value}`);
    }
    get preload(): string {
      return attribute(element(this), "preload") ?? "";
    }
    set preload(value: string) {
      Element.prototype.setAttribute.call(this, "preload", `${value}`);
    }
    get autoplay(): boolean {
      return attribute(element(this), "autoplay") !== null;
    }
    set autoplay(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "autoplay", Boolean(value));
    }
    get loop(): boolean {
      return attribute(element(this), "loop") !== null;
    }
    set loop(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "loop", Boolean(value));
    }
    get controls(): boolean {
      return attribute(element(this), "controls") !== null;
    }
    set controls(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "controls", Boolean(value));
    }
    get defaultMuted(): boolean {
      return attribute(element(this), "muted") !== null;
    }
    set defaultMuted(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "muted", Boolean(value));
    }
    get currentSrc(): string {
      element(this);
      return "";
    }
    get networkState(): number {
      element(this);
      return 0;
    }
    get readyState(): number {
      element(this);
      return 0;
    }
    get seeking(): boolean {
      element(this);
      return false;
    }
    get duration(): number {
      element(this);
      return NaN;
    }
    get paused(): boolean {
      element(this);
      return true;
    }
    get ended(): boolean {
      element(this);
      return false;
    }
    get buffered(): ReturnType<typeof emptyMediaRanges> {
      return (this.#buffered ??= emptyMediaRanges());
    }
    get played(): ReturnType<typeof emptyMediaRanges> {
      return (this.#played ??= emptyMediaRanges());
    }
    get seekable(): ReturnType<typeof emptyMediaRanges> {
      return (this.#seekable ??= emptyMediaRanges());
    }
    get audioTracks(): readonly never[] {
      return (this.#audioTracks ??= []);
    }
    get videoTracks(): readonly never[] {
      return (this.#videoTracks ??= []);
    }
    get textTracks(): readonly never[] {
      return (this.#textTracks ??= []);
    }
    get currentTime(): number {
      return this.#currentTime;
    }
    set currentTime(value: number) {
      this.#currentTime = mediaNumber(value);
    }
    get muted(): boolean {
      return this.#muted;
    }
    set muted(value: boolean) {
      const muted = Boolean(value);
      if (this.#muted === muted) return;
      this.#muted = muted;
      this.#queueChange("volumechange");
    }
    get volume(): number {
      return this.#volume;
    }
    set volume(value: number) {
      const volume = mediaNumber(value);
      if (volume < 0 || volume > 1)
        throw new DOMException("The index is not in the allowed range.", "IndexSizeError");
      if (this.#volume === volume) return;
      this.#volume = volume;
      this.#queueChange("volumechange");
    }
    get defaultPlaybackRate(): number {
      return this.#defaultPlaybackRate ?? 1;
    }
    set defaultPlaybackRate(value: number) {
      const rate = mediaNumber(value);
      if (rate === 0)
        throw new DOMException("The operation is not supported.", "NotSupportedError");
      if (rate === this.#defaultPlaybackRate) return;
      this.#defaultPlaybackRate = rate;
      this.#queueChange("ratechange");
    }
    get playbackRate(): number {
      return this.#playbackRate ?? 1;
    }
    set playbackRate(value: number) {
      const rate = mediaNumber(value);
      if (rate === this.#playbackRate) return;
      this.#playbackRate = rate;
      this.#queueChange("ratechange");
    }
    #queueChange(type: "ratechange" | "volumechange"): void {
      timers.setTimeout(() => this.dispatchEvent(events.trusted(new Event(type))));
    }
    #unsupported(method: string): void {
      options.reportUnsupported?.(`HTMLMediaElement's ${method}() method`);
    }
    load(): void {
      this.#unsupported("load");
    }
    play(): undefined {
      this.#unsupported("play");
      return undefined;
    }
    pause(): void {
      this.#unsupported("pause");
    }
    canPlayType(type: string): "" {
      element(this);
      if (!arguments.length) throw new TypeError("A media type is required");
      void `${type}`;
      return "";
    }
    addTextTrack(kind: string, label = "", language = ""): undefined {
      if (!["subtitles", "captions", "descriptions", "chapters", "metadata"].includes(`${kind}`))
        throw new TypeError("Invalid text track kind");
      void `${label}`;
      void `${language}`;
      this.#unsupported("addTextTrack");
      return undefined;
    }
  }

  class HTMLAudioElement extends HTMLMediaElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLAudioElement, new.target);
      super(key, record, wrapHandle);
    }

    override get [Symbol.toStringTag](): string {
      return "HTMLAudioElement";
    }
  }

  class HTMLVideoElement extends HTMLMediaElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLVideoElement, new.target);
      super(key, record, wrapHandle);
    }

    override get [Symbol.toStringTag](): string {
      return "HTMLVideoElement";
    }
    get width(): number {
      return Math.max(0, reflectedLong(element(this), "width", 0));
    }
    set width(value: number) {
      const converted = +value >>> 0;
      Element.prototype.setAttribute.call(
        this,
        "width",
        String(converted <= 0x7fffffff ? converted : 0),
      );
    }
    get height(): number {
      return Math.max(0, reflectedLong(element(this), "height", 0));
    }
    set height(value: number) {
      const converted = +value >>> 0;
      Element.prototype.setAttribute.call(
        this,
        "height",
        String(converted <= 0x7fffffff ? converted : 0),
      );
    }
    get videoWidth(): number {
      element(this);
      return 0;
    }
    get videoHeight(): number {
      element(this);
      return 0;
    }
    get poster(): string {
      return reflectedResourceURL(element(this), "poster");
    }
    set poster(value: string) {
      Element.prototype.setAttribute.call(this, "poster", `${value}`.toWellFormed());
    }
    get playsInline(): boolean {
      return attribute(element(this), "playsinline") !== null;
    }
    set playsInline(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "playsinline", Boolean(value));
    }
  }

  function Audio(...args: [src?: string]): HTMLAudioElement {
    const audio = createElementRecord("audio", html.NS.HTML, null) as HTMLAudioElement;
    Element.prototype.setAttribute.call(audio, "preload", "auto");
    if (args[0] !== undefined) Element.prototype.setAttribute.call(audio, "src", `${args[0]}`);
    return audio;
  }
  Object.defineProperty(Audio, "prototype", { value: HTMLAudioElement.prototype, writable: false });

  class HTMLTrackElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLTrackElement, new.target);
      super(key, record, wrapHandle);
    }

    declare static readonly NONE: 0;
    declare static readonly LOADING: 1;
    declare static readonly LOADED: 2;
    declare static readonly ERROR: 3;
    declare readonly NONE: 0;
    declare readonly LOADING: 1;
    declare readonly LOADED: 2;
    declare readonly ERROR: 3;

    static {
      Object.defineProperties(this, trackStateDescriptors);
      Object.defineProperties(this.prototype, trackStateDescriptors);
    }

    get [Symbol.toStringTag](): string {
      return "HTMLTrackElement";
    }
    get kind(): string {
      return attribute(element(this), "kind") ?? "";
    }
    set kind(value: string) {
      Element.prototype.setAttribute.call(this, "kind", `${value}`);
    }
    get src(): string {
      return reflectedResourceURL(element(this), "src");
    }
    set src(value: string) {
      Element.prototype.setAttribute.call(this, "src", `${value}`.toWellFormed());
    }
    get srclang(): string {
      return attribute(element(this), "srclang") ?? "";
    }
    set srclang(value: string) {
      Element.prototype.setAttribute.call(this, "srclang", `${value}`);
    }
    get label(): string {
      return attribute(element(this), "label") ?? "";
    }
    set label(value: string) {
      Element.prototype.setAttribute.call(this, "label", `${value}`);
    }
    get default(): boolean {
      return attribute(element(this), "default") !== null;
    }
    set default(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "default", Boolean(value));
    }
    get readyState(): number {
      element(this);
      return HTMLTrackElement.NONE;
    }
  }

  class HTMLSourceElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLSourceElement, new.target);
      super(key, record, wrapHandle);
    }

    get src(): string {
      return reflectedResourceURL(element(this), "src");
    }
    set src(value: string) {
      Element.prototype.setAttribute.call(this, "src", `${value}`.toWellFormed());
    }
    get type(): string {
      return attribute(element(this), "type") ?? "";
    }
    set type(value: string) {
      Element.prototype.setAttribute.call(this, "type", `${value}`);
    }
    get srcset(): string {
      return attribute(element(this), "srcset") ?? "";
    }
    set srcset(value: string) {
      Element.prototype.setAttribute.call(this, "srcset", `${value}`.toWellFormed());
    }
    get sizes(): string {
      return attribute(element(this), "sizes") ?? "";
    }
    set sizes(value: string) {
      Element.prototype.setAttribute.call(this, "sizes", `${value}`);
    }
    get media(): string {
      return attribute(element(this), "media") ?? "";
    }
    set media(value: string) {
      Element.prototype.setAttribute.call(this, "media", `${value}`);
    }
  }

  class HTMLParamElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLParamElement, new.target);
      super(key, record, wrapHandle);
    }

    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      Element.prototype.setAttribute.call(this, "name", `${value}`);
    }
    get value(): string {
      return attribute(element(this), "value") ?? "";
    }
    set value(value: string) {
      Element.prototype.setAttribute.call(this, "value", `${value}`);
    }
    get type(): string {
      return attribute(element(this), "type") ?? "";
    }
    set type(value: string) {
      Element.prototype.setAttribute.call(this, "type", `${value}`);
    }
    get valueType(): string {
      return attribute(element(this), "valuetype") ?? "";
    }
    set valueType(value: string) {
      Element.prototype.setAttribute.call(this, "valuetype", `${value}`);
    }
  }

  class HTMLPictureElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLPictureElement, new.target);
      super(key, record, wrapHandle);
    }
  }

  class HTMLCanvasElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLCanvasElement, new.target);
      super(key, record, wrapHandle);
    }

    get [Symbol.toStringTag](): string {
      return "HTMLCanvasElement";
    }
    get width(): number {
      const value = reflectedLong(element(this), "width", 300);
      return value < 0 ? 300 : value;
    }
    set width(value: number) {
      this.#setDimension("width", value, 300);
    }
    get height(): number {
      const value = reflectedLong(element(this), "height", 150);
      return value < 0 ? 150 : value;
    }
    set height(value: number) {
      this.#setDimension("height", value, 150);
    }
    #setDimension(name: "width" | "height", value: number, fallback: number): void {
      const converted = +value >>> 0;
      Element.prototype.setAttribute.call(
        this,
        name,
        String(converted <= 0x7fffffff ? converted : fallback),
      );
    }
    #reportUnsupported(method: string): void {
      options.reportUnsupported?.(
        `HTMLCanvasElement's ${method}() method: without installing the canvas npm package`,
      );
    }
    getContext(contextId: string, ..._options: unknown[]): null {
      if (!arguments.length) throw new TypeError("A canvas context identifier is required");
      void `${contextId}`;
      this.#reportUnsupported("getContext");
      return null;
    }
    toDataURL(type?: string, _quality?: unknown): string | null {
      if (type !== undefined) void `${type}`;
      this.#reportUnsupported("toDataURL");
      return null;
    }
    toBlob(callback: (blob: NodeBlob | null) => void, type?: string, _quality?: unknown): void {
      if (typeof callback !== "function") throw new TypeError("A canvas blob callback is required");
      if (type !== undefined) void `${type}`;
      this.#reportUnsupported("toBlob");
    }
  }

  class HTMLImageElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLImageElement, new.target);
      super(key, record, wrapHandle);
    }

    get loading(): string {
      return reflectedLoading(element(this));
    }
    set loading(value: string) {
      Element.prototype.setAttribute.call(this, "loading", `${value}`);
    }
    get decoding(): string {
      const value = asciiLower(attribute(element(this), "decoding") ?? "");
      return value === "sync" || value === "async" ? value : "auto";
    }
    set decoding(value: string) {
      Element.prototype.setAttribute.call(this, "decoding", `${value}`);
    }
    get referrerPolicy(): string {
      return reflectedReferrerPolicy(element(this));
    }
    set referrerPolicy(value: string) {
      Element.prototype.setAttribute.call(this, "referrerpolicy", `${value}`);
    }
    get src(): string {
      return reflectedResourceURL(element(this), "src");
    }
    set src(value: string) {
      this.setAttribute("src", `${value}`.toWellFormed());
    }
    get alt(): string {
      return attribute(element(this), "alt") ?? "";
    }
    set alt(value: string) {
      this.setAttribute("alt", `${value}`);
    }
    get sizes(): string {
      return attribute(element(this), "sizes") ?? "";
    }
    set sizes(value: string) {
      this.setAttribute("sizes", `${value}`);
    }
    get useMap(): string {
      return attribute(element(this), "usemap") ?? "";
    }
    set useMap(value: string) {
      this.setAttribute("usemap", `${value}`);
    }
    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      this.setAttribute("name", `${value}`);
    }
    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      this.setAttribute("align", `${value}`);
    }
    get srcset(): string {
      return attribute(element(this), "srcset") ?? "";
    }
    set srcset(value: string) {
      this.setAttribute("srcset", `${value}`.toWellFormed());
    }
    get crossOrigin(): string | null {
      return attribute(element(this), "crossorigin");
    }
    set crossOrigin(value: string | null) {
      if (value == null) this.removeAttribute("crossorigin");
      else this.setAttribute("crossorigin", `${value}`);
    }
    get isMap(): boolean {
      return attribute(element(this), "ismap") !== null;
    }
    set isMap(value: boolean) {
      this.toggleAttribute("ismap", Boolean(value));
    }
    get lowsrc(): string {
      return reflectedResourceURL(element(this), "lowsrc");
    }
    set lowsrc(value: string) {
      this.setAttribute("lowsrc", `${value}`.toWellFormed());
    }
    get longDesc(): string {
      return reflectedResourceURL(element(this), "longdesc");
    }
    set longDesc(value: string) {
      this.setAttribute("longdesc", `${value}`.toWellFormed());
    }
    get border(): string {
      return attribute(element(this), "border") ?? "";
    }
    set border(value: string | null) {
      this.setAttribute("border", value === null ? "" : `${value}`);
    }
    get hspace(): number {
      return reflectedSpacing(this, "hspace");
    }
    set hspace(value: number) {
      setReflectedSpacing(this, "hspace", value);
    }
    get vspace(): number {
      return reflectedSpacing(this, "vspace");
    }
    set vspace(value: number) {
      setReflectedSpacing(this, "vspace", value);
    }
    get width(): number {
      return Number(attribute(element(this), "width")) >>> 0;
    }
    set width(value: number) {
      this.setAttribute("width", String(+value >>> 0));
    }
    get height(): number {
      return Number(attribute(element(this), "height")) >>> 0;
    }
    set height(value: number) {
      this.setAttribute("height", String(+value >>> 0));
    }
    get naturalWidth(): number {
      return 0;
    }
    get naturalHeight(): number {
      return 0;
    }
    get currentSrc(): string {
      return "";
    }
    get complete(): boolean {
      return !attribute(element(this), "src");
    }
  }

  function Image(...dimensions: [width?: number, height?: number]): HTMLImageElement {
    const image = createElementRecord("img", html.NS.HTML, null) as HTMLImageElement;
    if (dimensions.length > 0) image.setAttribute("width", String(dimensions[0]));
    if (dimensions.length > 1) image.setAttribute("height", String(dimensions[1]));
    return image;
  }
  Object.defineProperty(Image, "prototype", { value: HTMLImageElement.prototype, writable: false });

  function findElementById(root: Raw.ParentNode, id: string): Element | null {
    if (!id) return null;
    const match = firstAttributeInOrdinaryTree({ root, name: id, skipPackedText });
    return match ? wrapElement(match) : null;
  }

  function resetDocumentIds(): void {
    earlyDocumentId = undefined;
    documentIdIndex = undefined;
    dirtyDocumentIds = undefined;
    documentIdLookups = 0;
  }
  function invalidateDocumentId(id: string | null): void {
    if (earlyDocumentId?.id === id) earlyDocumentId = undefined;
    if (!id || !documentIdIndex) return;
    // A removed/renamed member must not stay strongly reachable while its key awaits repair.
    documentIdIndex.delete(id);
    (dirtyDocumentIds ??= new Set()).add(id);
    // High-cardinality edit batches fall back to ordinary index admission, with bounded key retention.
    if (dirtyDocumentIds.size > 128) {
      resetDocumentIds();
    }
  }
  function invalidateDocumentIdsIn(node: Raw.ChildNode): void {
    earlyDocumentId = undefined;
    if (!documentIdIndex || !tree.isElementNode(node)) return;
    invalidateDocumentId(attribute(node, "id"));
    // The finite affected ordinary subtree determines every ID whose first match could change.
    for (const child of descendants(node)) {
      if (!documentIdIndex) return;
      if (tree.isElementNode(child)) invalidateDocumentId(attribute(child, "id"));
    }
  }
  function findDocumentElementById(id: string): Element | null {
    if (!id) return null;
    if (!documentIdIndex) {
      if (earlyDocumentId?.id === id && earlyDocumentId.revision === revision) {
        const known = earlyDocumentId.node.deref();
        if (known) return wrapElement(known);
      }
      // A few lookups can be cheaper than scanning and indexing the entire document.
      if (++documentIdLookups < 4) return findElementById(source, id);
      const early = firstAttributeInOrdinaryTree({
        root: source,
        name: id,
        maxVisits: 64,
        skipPackedText,
      });
      if (early) {
        earlyDocumentId = { id, node: new WeakRef(early), revision };
        return wrapElement(early);
      }
      earlyDocumentId = undefined;
      const index = new Map<string, Raw.Element>();
      const pending = source.childNodes.toReversed();
      // Bulk index construction shares the lookup's ordinary tree order without per-node yields.
      while (pending.length) {
        const node = pending.pop();
        if (!node || !tree.isElementNode(node)) continue;
        const key = attribute(node, "id");
        if (key && !index.has(key)) index.set(key, node);
        if (skipPackedText && packedLeafText(node) !== undefined) continue;
        for (let position = node.childNodes.length - 1; position >= 0; position--) {
          const child = node.childNodes[position];
          if (child) pending.push(child);
        }
      }
      documentIdIndex = index;
    }
    if (dirtyDocumentIds?.delete(id)) {
      const match = findElementById(source, id);
      if (match) documentIdIndex.set(id, element(match));
      else documentIdIndex.delete(id);
      return match;
    }
    const match = documentIdIndex.get(id);
    return match ? wrapElement(match) : null;
  }

  class DocumentFragment extends Node {
    constructor(key: symbol = token, record: Raw.DocumentFragment = tree.createDocumentFragment()) {
      super(key, record);
    }
    getElementById(id: string): Element | null {
      const record = raw(this);
      if (record.nodeName !== "#document-fragment" || !("childNodes" in record))
        throw new TypeError("Expected a DocumentFragment");
      if (arguments.length < 1) throw new TypeError("An ID is required");
      return findElementById(record, String(id));
    }
    get children(): HTMLCollection {
      return childElements(this, raw(this) as Raw.DocumentFragment);
    }
    get childElementCount(): number {
      return this.children.length;
    }
    get firstElementChild(): Element | null {
      return edgeElement(raw(this) as Raw.DocumentFragment, false);
    }
    get lastElementChild(): Element | null {
      return edgeElement(raw(this) as Raw.DocumentFragment, true);
    }
    querySelector(selector: string): Element | null {
      if (arguments.length < 1) throw new TypeError("1 argument required");
      return query(this, domString(selector));
    }
    querySelectorAll(selector: string): NodeList<Element> {
      if (arguments.length < 1) throw new TypeError("1 argument required");
      return queryAll(this, domString(selector));
    }
  }

  function canHostShadow(host: Raw.Element): boolean {
    if (host.namespaceURI !== html.NS.HTML) return false;
    const name = elementLocalName(host);
    return (
      (/^(?:article|aside|blockquote|body|div|footer|h[1-6]|header|main|nav|p|section|span)$/.test(
        name,
      ) ||
        validCustomName(name)) &&
      !(customStates.get(host) ?? definitionForElement(host))?.disableShadow
    );
  }

  function installShadowRoot(
    handle: Element,
    host: Raw.Element,
    fragment: Raw.DocumentFragment,
    settings: ShadowSettings,
  ): ShadowRoot {
    const realm = owningRealm(host);
    if (realm !== token) {
      const foreign = realmTreeOperations.get(realm);
      if (!foreign) throw new Error("A shadow host must have an owning realm");
      return foreign.installShadowRoot(host, fragment, settings) as ShadowRoot;
    }
    shadowSettings.set(fragment, settings);
    hasClonableShadows ||= settings.clonable;
    const { mode, delegatesFocus } = settings;
    const shadow = new ShadowRoot(token, fragment, handle, mode, delegatesFocus);
    shadowHosts.set(fragment, host);
    shadowRoots.set(host, fragment);
    computedStyleRevision++;
    if (customStates.get(host) || constructingCustomElements.has(host))
      internalsVisibleShadows.add(fragment);
    hasShadowRoots = true;
    events.linkShadow(shadow, handle, mode === "closed");
    return shadow;
  }

  function attachParsedShadow(template: Raw.Element): Raw.DocumentFragment | undefined {
    if (template.namespaceURI !== html.NS.HTML || template.tagName !== "template") return;
    const mode = asciiLower(attribute(template, "shadowrootmode") ?? "");
    if (mode !== "open" && mode !== "closed") return;
    const host = parentElementRecord(template);
    const fragment = templateContent(template);
    if (!host || !fragment || shadowRoots.has(host) || !canHostShadow(host)) return;

    declarativeShadows.add(fragment);
    internalsVisibleShadows.add(fragment);
    if (asciiLower(attribute(template, "shadowrootslotassignment") ?? "") === "manual")
      manualShadowRoots.add(fragment);
    installShadowRoot(wrapElement(host), host, fragment, {
      mode,
      delegatesFocus: attribute(template, "shadowrootdelegatesfocus") !== null,
      clonable: attribute(template, "shadowrootclonable") !== null,
      serializable: attribute(template, "shadowrootserializable") !== null,
    });
    // The parser keeps its template stack entry and writes into the associated fragment.
    tree.detachNode(template);
    return fragment;
  }

  type GetHTMLOptions = {
    serializableShadowRoots?: boolean;
    shadowRoots?: Iterable<ShadowRoot>;
  };

  function serializeWithShadows(node: Raw.ParentNode, options?: GetHTMLOptions | null): string {
    const includeSerializable = Boolean(options?.serializableShadowRoots);
    const requested = options?.shadowRoots;
    const roots = new Set<Raw.Node>();
    if (requested !== undefined) {
      for (const root of requested) {
        const record = nodeRecord(root)?.node;
        if (!record || !shadowHosts.has(record)) throw new TypeError("Expected a ShadowRoot");
        roots.add(record);
      }
    }
    if (!includeSerializable && !roots.size)
      return serialize(node, customIsValues && customElementSerialization);

    return serialize(node, {
      treeAdapter: {
        ...customElementSerialization.treeAdapter,
        getChildNodes(parent) {
          const children = tree.getChildNodes(parent);
          if (!tree.isElementNode(parent)) return children;
          const shadow = shadowRoots.get(parent);
          if (!shadow) return children;
          const settings = shadowSettings.get(shadow);
          if (!settings || !(roots.has(shadow) || (includeSerializable && settings.serializable)))
            return children;

          const attrs: { name: string; value: string }[] = [
            { name: "shadowrootmode", value: settings.mode },
          ];
          if (settings.delegatesFocus) attrs.push({ name: "shadowrootdelegatesfocus", value: "" });
          if (settings.serializable) attrs.push({ name: "shadowrootserializable", value: "" });
          if (manualShadowRoots.has(shadow))
            attrs.push({ name: "shadowrootslotassignment", value: "manual" });
          if (settings.clonable) attrs.push({ name: "shadowrootclonable", value: "" });
          // This serialization-only template does not change the host or shadow tree.
          const template = tree.createElement("template", html.NS.HTML, attrs) as Raw.Template;
          tree.setTemplateContent(template, shadow);
          return [template, ...children];
        },
      },
    });
  }

  function cloneShadowTree(source: Raw.ParentNode, target: Raw.ParentNode) {
    if (!tree.isElementNode(source) || !tree.isElementNode(target)) return;
    const original = shadowRoots.get(source);
    if (!original) return;
    const settings = shadowSettings.get(original);
    if (!settings?.clonable) return;
    const copy = tree.createDocumentFragment();
    if (manualShadowRoots.has(original)) manualShadowRoots.add(copy);
    if (declarativeShadows.has(original)) declarativeShadows.add(copy);
    if (internalsVisibleShadows.has(original)) internalsVisibleShadows.add(copy);
    installShadowRoot(wrapElement(target), target, copy, settings);
    return { source: original, target: copy };
  }

  type AdoptedStyleSheet = ReturnType<ReturnType<typeof createStyles>["adopted"]>[number];

  class ShadowRoot extends DocumentFragment {
    constructor(
      key: symbol,
      record: Raw.DocumentFragment,
      readonly host: Element,
      readonly mode: "open" | "closed",
      readonly delegatesFocus: boolean,
    ) {
      super(key, record);
    }
    get clonable(): boolean {
      return shadowSettings.get(raw(this))?.clonable ?? false;
    }
    get serializable(): boolean {
      return shadowSettings.get(raw(this))?.serializable ?? false;
    }
    get slotAssignment(): "named" | "manual" {
      return manualShadowRoots.has(raw(this)) ? "manual" : "named";
    }
    get styleSheets() {
      return styles().list(raw(this) as Raw.DocumentFragment);
    }
    get adoptedStyleSheets(): AdoptedStyleSheet[] {
      return styles().adopted(raw(this) as Raw.DocumentFragment);
    }
    set adoptedStyleSheets(sheets: Iterable<AdoptedStyleSheet>) {
      styles().setAdopted(raw(this) as Raw.DocumentFragment, sheets);
    }
    get activeElement(): Element | null {
      const root = raw(this);
      return activeElementInRoot(root);
    }
    get innerHTML(): string {
      const record = raw(this) as Raw.DocumentFragment;
      return xmlDocumentFor(record)
        ? serializeXML(record.childNodes, { requireWellFormed: true, DOMException })
        : serialize(record, customIsValues && customElementSerialization);
    }
    set innerHTML(value: string | null) {
      const record = raw(this) as Raw.DocumentFragment;
      const context = element(this.host);
      const { fragment, effects } = parseElementMarkup(
        context,
        value === null ? "" : domString(value),
      );
      replaceChildren(record, fragment.childNodes, effects);
      if (customDefinitions && ownerRecord(record) === source && !connected(context))
        updateCustomSubtree(record);
    }
    getHTML(options?: GetHTMLOptions | null): string {
      return serializeWithShadows(raw(this) as Raw.DocumentFragment, options);
    }
    setHTMLUnsafe(markup: string): void {
      if (arguments.length === 0) throw new TypeError("HTML is required");
      const record = raw(this) as Raw.DocumentFragment;
      const fragment = parseUnsafeMarkup(element(this.host), `${markup}`);
      replaceChildren(record, fragment.content.childNodes);
      for (const shadow of fragment.shadows) reconcileSlots(shadow);
    }
  }

  function nodeBoundaryRecord(node: Node) {
    const record = nodeRecord(node);
    if (!record) throw new TypeError("Expected a Node for the range boundary");
    return {
      node: record.node,
      realm: hasAdditionalDocuments ? owningRealm(record.node) : record.realm,
    };
  }

  function boundaryLength(node: Raw.Node): number {
    if ("childNodes" in node) return node.childNodes.length;
    return isCharacterData(node) ? dataOf(node).length : 0;
  }

  function boundary(node: Raw.Node, offset: number): Point {
    if (tree.isDocumentTypeNode(node))
      throw new DOMException("A doctype cannot be a range boundary", "InvalidNodeTypeError");
    return { node, offset: checkedOffset(offset, boundaryLength(node)) };
  }

  function edgeBoundary(node: Raw.Node, after: boolean): Point {
    const parent = treeParent(node, false);
    if (!parent) throw new DOMException("Selected node has no parent", "InvalidNodeTypeError");
    return {
      node: parent,
      offset: parent.childNodes.findIndex((child) => child === node) + Number(after),
    };
  }

  function commonAncestor(start: Raw.Node, end: Raw.Node): Raw.Node {
    const ancestors = new Set<Raw.Node>();
    for (let node: Raw.Node | null = start; node; node = treeParent(node, false))
      ancestors.add(node);
    for (let node: Raw.Node | null = end; node; node = treeParent(node, false)) {
      if (ancestors.has(node)) return node;
    }
    throw new Error("A range must have a common ancestor");
  }

  function nextAfterBoundary(point: Point, root: Raw.Node): Raw.Node | null {
    if ("childNodes" in point.node) {
      const first = point.node.childNodes[point.offset];
      if (first) return first;
    }
    for (let node = point.node; node !== root;) {
      const owner = treeParent(node, false);
      if (!owner) return null;
      const index = owner.childNodes.findIndex((child) => child === node);
      const next = owner.childNodes[index + 1];
      if (next) return next;
      node = owner;
    }
    return null;
  }

  function rangeText(start: Point, end: Point): string {
    if (start.node === end.node && isCharacterData(start.node)) {
      return isTextData(start.node) ? dataOf(start.node).slice(start.offset, end.offset) : "";
    }
    const ancestor = commonAncestor(start.node, end.node);
    if (!("childNodes" in ancestor)) return "";
    const first = isTextData(start.node) ? start.node : nextAfterBoundary(start, ancestor);
    const last = isCharacterData(end.node) ? end.node : nextAfterBoundary(end, ancestor);
    if (!first) return "";
    const parts: string[] = [];
    let active = false;
    for (const node of descendants(ancestor)) {
      if (node === first) active = true;
      if (node === last) {
        if (active && isTextData(node) && node === end.node)
          parts.push(dataOf(node).slice(0, end.offset));
        break;
      }
      if (active && isTextData(node))
        parts.push(node === start.node ? dataOf(node).slice(start.offset) : dataOf(node));
    }
    return parts.join("");
  }

  type ContentSlice =
    | { kind: "whole"; node: Raw.ChildNode }
    | { kind: "data"; node: DataNode; offset: number; count: number }
    | { kind: "branch"; node: Raw.Element; children: ContentSlice[] };

  function boundaryBranches(node: Raw.Node, ancestor: Raw.Node): Map<Raw.ParentNode, Raw.Node> {
    const branches = new Map<Raw.ParentNode, Raw.Node>();
    for (let current = node; current !== ancestor;) {
      const owner = treeParent(current, false);
      if (!owner) throw new Error("A range boundary must descend from its common ancestor");
      branches.set(owner, current);
      current = owner;
    }
    return branches;
  }

  function selectionSlices(
    ancestor: Raw.ParentNode,
    { start, end }: RangePoints,
    allowDoctype: boolean,
    Exception: typeof DOMException,
  ): { slices: ContentSlice[]; collapse: Point } {
    const leading = boundaryBranches(start.node, ancestor);
    const trailing = boundaryBranches(end.node, ancestor);
    const slices: ContentSlice[] = [];
    const pending = [{ owner: ancestor, output: slices }];
    let collapse = start;
    // Only the two boundary paths need descent. Fully selected branches are single entries.
    while (pending.length) {
      const entry = pending.pop();
      if (!entry) break;
      const { owner, output } = entry;
      const first = leading.get(owner);
      const last = trailing.get(owner);
      const from =
        owner === start.node
          ? start.offset
          : first
            ? owner.childNodes.findIndex((node) => node === first)
            : 0;
      const to =
        owner === end.node
          ? end.offset
          : last
            ? owner.childNodes.findIndex((node) => node === last) + 1
            : owner.childNodes.length;
      if (owner === ancestor && first) collapse = { node: owner, offset: from + 1 };
      for (let index = from; index < to; index++) {
        const node = owner.childNodes[index];
        if (!node) continue;
        if (node !== first && node !== last) {
          if (!allowDoctype && tree.isDocumentTypeNode(node))
            throw new Exception("A fragment cannot contain a doctype", "HierarchyRequestError");
          output.push({ kind: "whole", node });
        } else if (isCharacterData(node)) {
          const offset = node === start.node ? start.offset : 0;
          const endOffset = node === end.node ? end.offset : dataOf(node).length;
          output.push({ kind: "data", node, offset, count: endOffset - offset });
        } else if (tree.isElementNode(node)) {
          const children: ContentSlice[] = [];
          output.push({ kind: "branch", node, children });
          pending.push({ owner: node, output: children });
        }
      }
    }
    return { slices, collapse };
  }

  function applyContentSlices(
    slices: ContentSlice[],
    target: Raw.DocumentFragment | null,
    mode: ContentMode,
  ): void {
    const pending: { slice: ContentSlice; target: Raw.ParentNode | null }[] = [];
    const reactions: (() => void)[] = [];
    function enqueue(entries: ContentSlice[], owner: Raw.ParentNode | null): void {
      for (let index = entries.length - 1; index >= 0; index--) {
        const slice = entries[index];
        if (slice) pending.push({ slice, target: owner });
      }
    }
    enqueue(slices, target);
    // The plan contains one entry per selected node or partial boundary branch.
    while (pending.length) {
      const entry = pending.pop();
      if (!entry) break;
      const { slice, target } = entry;
      const { node } = slice;
      if (slice.kind === "branch") {
        const copy = target ? cloneRawNode(node) : null;
        if (target && copy && tree.isElementNode(copy)) {
          initializeCopiedTree(copy, ownerRecord(target));
          tree.appendChild(target, copy);
        }
        enqueue(slice.children, copy && tree.isElementNode(copy) ? copy : null);
      } else if (slice.kind === "data") {
        if (target) {
          const copy = cloneRawNode(slice.node);
          const value = dataOf(slice.node).slice(slice.offset, slice.offset + slice.count);
          if (tree.isTextNode(copy)) {
            copy.value = value;
            tree.appendChild(target, copy);
          } else if (tree.isCommentNode(copy)) {
            copy.data = value;
            tree.appendChild(target, copy);
          }
        }
        if (mode !== "clone") replaceData(slice.node, slice.offset, slice.count, "");
      } else if (mode === "clone") {
        const copy = cloneRawTree(
          slice.node,
          true,
          hasClonableShadows ? cloneShadowTree : undefined,
        );
        if (target && "parentNode" in copy) {
          initializeCopiedTree(copy, ownerRecord(target));
          tree.appendChild(target, copy);
        }
      } else {
        if (hasCustomElements) reactions.push(...customDisconnectReactions([slice.node]));
        detachWithRecord(slice.node);
        disconnectResourcesIn(slice.node);
        advanceRevision();
        if (target) {
          detachedOwners.delete(slice.node);
          tree.appendChild(target, slice.node);
        }
      }
    }
    for (const reaction of reactions) reaction();
  }

  function editRangeContents(
    points: RangePoints,
    mode: ContentMode,
    Exception: typeof DOMException,
  ): Raw.DocumentFragment | null {
    const { start, end } = points;
    const target = mode === "delete" ? null : tree.createDocumentFragment();
    if (target) setOwner(target, ownerRecord(start.node));
    if (start.node === end.node && start.offset === end.offset) return target;
    if (start.node === end.node && isCharacterData(start.node)) {
      applyContentSlices(
        [
          {
            kind: "data",
            node: start.node,
            offset: start.offset,
            count: end.offset - start.offset,
          },
        ],
        target,
        mode,
      );
      return target;
    }
    const ancestor = commonAncestor(start.node, end.node);
    if (!("childNodes" in ancestor)) return target;
    const { slices, collapse } = selectionSlices(ancestor, points, mode === "delete", Exception);
    if (mode !== "clone") {
      setRangePoints(points, collapse, collapse);
    }
    applyContentSlices(slices, target, mode);
    return target;
  }

  function insertRangeNode(
    points: RangePoints,
    handle: object,
    Exception: typeof DOMException,
  ): void {
    const moving = nodeRecord(handle);
    if (!moving) throw new TypeError("Expected a Node to insert");
    const { start } = points;
    const text = isTextData(start.node);
    const target = text
      ? treeParent(start.node, false)
      : "childNodes" in start.node
        ? start.node
        : null;
    if (!target || moving.node === start.node)
      throw new Exception("Invalid start node", "HierarchyRequestError");
    if (moving.realm !== token) hasAdditionalDocuments = true;
    let reference: Raw.Node | null = text ? start.node : (target.childNodes[start.offset] ?? null);
    insertionPlan(target, moving.node, reference, attrRecords?.has(handle) ?? false, Exception);
    if (text) {
      const remainder = Text.prototype.splitText.call(wrap(start.node) as Text, start.offset);
      reference = raw(remainder);
    }
    const { before, added } = insertionPlan(target, moving.node, reference, false, Exception);
    let end = before ? target.childNodes.indexOf(before) : target.childNodes.length;
    if (
      "parentNode" in moving.node &&
      moving.node.parentNode === target &&
      target.childNodes.indexOf(moving.node) < end
    )
      end--;
    end += added.length;
    const collapsed =
      points.start.node === points.end.node && points.start.offset === points.end.offset;
    Node.prototype.insertBefore.call(wrap(target), wrap(moving.node), before ? wrap(before) : null);
    if (collapsed) setRangePoints(points, points.start, { node: target, offset: end });
  }

  rangeInserters.set(token, insertRangeNode);
  rangeEditors.set(token, editRangeContents);

  class AbstractRange {
    readonly #points: RangePoints;

    constructor(key: symbol, points: RangePoints) {
      if (key !== token) throw new TypeError("Illegal constructor");
      this.#points = points;
    }

    get startContainer(): Node {
      return wrap(this.#points.start.node);
    }
    get startOffset(): number {
      return this.#points.start.offset;
    }
    get endContainer(): Node {
      return wrap(this.#points.end.node);
    }
    get endOffset(): number {
      return this.#points.end.offset;
    }
    get collapsed(): boolean {
      const { start, end } = this.#points;
      return start.node === end.node && start.offset === end.offset;
    }
    get [Symbol.toStringTag](): string {
      return "AbstractRange";
    }
  }

  class StaticRange extends AbstractRange {
    constructor(init: {
      startContainer: Node;
      startOffset: number;
      endContainer: Node;
      endOffset: number;
    }) {
      if (init == null || (typeof init !== "object" && typeof init !== "function"))
        throw new TypeError("StaticRange requires a boundary dictionary");
      const endContainer = init.endContainer;
      const end = nodeBoundaryRecord(endContainer).node;
      const endOffset = init.endOffset;
      if (endOffset === undefined) throw new TypeError("StaticRange endOffset is required");
      const lastOffset = +endOffset >>> 0;
      const startContainer = init.startContainer;
      const start = nodeBoundaryRecord(startContainer).node;
      const startOffset = init.startOffset;
      if (startOffset === undefined) throw new TypeError("StaticRange startOffset is required");
      const firstOffset = +startOffset >>> 0;
      if (
        tree.isDocumentTypeNode(start) ||
        tree.isDocumentTypeNode(end) ||
        attrRecords?.has(startContainer) ||
        attrRecords?.has(endContainer)
      ) {
        throw new DOMException(
          "A doctype or attribute cannot be a static range boundary",
          "InvalidNodeTypeError",
        );
      }
      super(token, {
        start: { node: start, offset: firstOffset },
        end: { node: end, offset: lastOffset },
      });
    }
    override get [Symbol.toStringTag](): string {
      return "StaticRange";
    }
  }

  function copyRangeContents(receiver: object, mode: "clone" | "extract"): DocumentFragment {
    const points = rangePoints.get(receiver);
    if (!points) throw new TypeError("Expected a Range");
    const owner = ownerRecord(points.start.node);
    const realm = documentRealms.get(owner) ?? token;
    const edit = rangeEditors.get(realm);
    if (!edit) throw new Error("A range boundary must have an editing realm");
    const fragment = edit(points, mode, DOMException);
    if (!fragment) throw new Error("Copying a range must create a fragment");
    return initializeCopiedTree(fragment, owner) as DocumentFragment;
  }

  class Range extends AbstractRange {
    declare static readonly START_TO_START: 0;
    declare static readonly START_TO_END: 1;
    declare static readonly END_TO_END: 2;
    declare static readonly END_TO_START: 3;
    declare readonly START_TO_START: 0;
    declare readonly START_TO_END: 1;
    declare readonly END_TO_END: 2;
    declare readonly END_TO_START: 3;

    static {
      Object.defineProperties(this, rangeConstantDescriptors);
      Object.defineProperties(this.prototype, rangeConstantDescriptors);
    }

    readonly #points: RangePoints;
    #realm = token;
    #unregister: () => void;

    constructor(key?: symbol, root = source) {
      if (key !== undefined && key !== token) throw new TypeError("Illegal constructor");
      const points = { start: { node: root, offset: 0 }, end: { node: root, offset: 0 } };
      super(token, points);
      this.#points = points;
      this.#unregister = registerRange(token, this.#points);
      rangePoints.set(this, this.#points);
    }
    #setRealm(realm: symbol): void {
      if (this.#realm === realm) return;
      this.#unregister();
      this.#unregister = registerRange(realm, this.#points);
      this.#realm = realm;
    }
    #wrap(node: Raw.Node): Node {
      if (this.#realm === token) return wrap(node);
      const foreign = realmWrappers.get(this.#realm);
      if (!foreign) throw new Error("A range boundary must have a wrapping realm");
      return foreign(node) as Node;
    }
    get commonAncestorContainer(): Node {
      return this.#wrap(commonAncestor(this.#points.start.node, this.#points.end.node));
    }
    #setStart(point: Point, realm: symbol): void {
      const order = comparePoints(point, this.#points.end);
      const end = order === undefined || order > 0 ? point : this.#points.end;
      setRangePoints(this.#points, point, end);
      this.#setRealm(realm);
    }
    #setEnd(point: Point, realm: symbol): void {
      const order = comparePoints(this.#points.start, point);
      const start = order === undefined || order > 0 ? point : this.#points.start;
      setRangePoints(this.#points, start, point);
      this.#setRealm(realm);
    }
    setStart(node: Node, offset: number): void {
      if (arguments.length < 2) throw new TypeError("A node and offset are required");
      const record = nodeBoundaryRecord(node);
      this.#setStart(boundary(record.node, offset), record.realm);
    }
    setEnd(node: Node, offset: number): void {
      if (arguments.length < 2) throw new TypeError("A node and offset are required");
      const record = nodeBoundaryRecord(node);
      this.#setEnd(boundary(record.node, offset), record.realm);
    }
    setStartBefore(node: Node): void {
      const record = nodeBoundaryRecord(node);
      this.#setStart(edgeBoundary(record.node, false), record.realm);
    }
    setStartAfter(node: Node): void {
      const record = nodeBoundaryRecord(node);
      this.#setStart(edgeBoundary(record.node, true), record.realm);
    }
    setEndBefore(node: Node): void {
      const record = nodeBoundaryRecord(node);
      this.#setEnd(edgeBoundary(record.node, false), record.realm);
    }
    setEndAfter(node: Node): void {
      const record = nodeBoundaryRecord(node);
      this.#setEnd(edgeBoundary(record.node, true), record.realm);
    }
    collapse(toStart = false): void {
      const point = toStart ? this.#points.start : this.#points.end;
      setRangePoints(this.#points, point, point);
    }
    selectNode(node: Node): void {
      const record = nodeBoundaryRecord(node);
      const start = edgeBoundary(record.node, false);
      setRangePoints(this.#points, start, { node: start.node, offset: start.offset + 1 });
      this.#setRealm(record.realm);
    }
    selectNodeContents(node: Node): void {
      const record = nodeBoundaryRecord(node);
      const start = boundary(record.node, 0);
      setRangePoints(this.#points, start, {
        node: record.node,
        offset: boundaryLength(record.node),
      });
      this.#setRealm(record.realm);
    }
    cloneRange(): Range {
      const clone = new Range();
      clone.#points.start = this.#points.start;
      clone.#points.end = this.#points.end;
      clone.#setRealm(this.#realm);
      return clone;
    }
    detach(): void {
      // Retained for compatibility. The live range remains usable.
    }
    compareBoundaryPoints(how: number, sourceRange: Range): number {
      const peer = rangePoints.get(sourceRange);
      if (!peer || arguments.length < 2)
        throw new TypeError("A comparison mode and Range are required");
      const mode = Number(how) & 0xffff;
      if (mode > Range.END_TO_START)
        throw new DOMException("Unsupported boundary comparison mode", "NotSupportedError");
      const { start, end } = this.#points;
      const left = mode === Range.START_TO_START || mode === Range.END_TO_START ? start : end;
      const right =
        mode === Range.START_TO_START || mode === Range.START_TO_END ? peer.start : peer.end;
      const order = comparePoints(left, right);
      if (order === undefined)
        throw new DOMException("Ranges are in different trees", "WrongDocumentError");
      return Math.sign(order);
    }
    #comparePoint(point: Point): number {
      const { start, end } = this.#points;
      if ((comparePoints(point, start) ?? 0) < 0) return -1;
      return (comparePoints(point, end) ?? 0) > 0 ? 1 : 0;
    }
    comparePoint(node: Node, offset: number): number {
      if (arguments.length < 2) throw new TypeError("A node and offset are required");
      const record = nodeBoundaryRecord(node).node;
      if (treeRoot(record) !== treeRoot(this.#points.start.node))
        throw new DOMException("Node and range are in different trees", "WrongDocumentError");
      return this.#comparePoint(boundary(record, offset));
    }
    isPointInRange(node: Node, offset: number): boolean {
      if (arguments.length < 2) throw new TypeError("A node and offset are required");
      const record = nodeBoundaryRecord(node).node;
      return (
        treeRoot(record) === treeRoot(this.#points.start.node) &&
        this.#comparePoint(boundary(record, offset)) === 0
      );
    }
    intersectsNode(node: Node): boolean {
      const record = nodeBoundaryRecord(node).node;
      const { start, end } = this.#points;
      if (treeRoot(record) !== treeRoot(start.node)) return false;
      if (!treeParent(record, false)) return true;
      const before = edgeBoundary(record, false);
      return (
        (comparePoints(before, end) ?? 0) < 0 &&
        (comparePoints({ node: before.node, offset: before.offset + 1 }, start) ?? 0) > 0
      );
    }
    override get [Symbol.toStringTag](): string {
      return "Range";
    }
    override toString(): string {
      return this.collapsed ? "" : rangeText(this.#points.start, this.#points.end);
    }

    #edit(mode: ContentMode): Raw.DocumentFragment | null {
      const edit = rangeEditors.get(this.#realm);
      if (!edit) throw new Error("A range boundary must have an editing realm");
      return edit(this.#points, mode, DOMException);
    }
    deleteContents(): void {
      this.#edit("delete");
    }
    cloneContents(): DocumentFragment {
      return copyRangeContents(this, "clone");
    }
    extractContents(): DocumentFragment {
      return copyRangeContents(this, "extract");
    }

    insertNode(node: Node): void {
      const insert = rangeInserters.get(this.#realm);
      if (!insert) throw new Error("A range boundary must have an insertion realm");
      insert(this.#points, node, DOMException);
    }
    surroundContents(newParent: Node): void {
      const { start, end } = this.#points;
      const ancestor = commonAncestor(start.node, end.node);
      const first = boundaryBranches(start.node, ancestor).get(ancestor as Raw.ParentNode);
      const last = boundaryBranches(end.node, ancestor).get(ancestor as Raw.ParentNode);
      if ((first && !isTextData(first)) || (last && !isTextData(last)))
        throw new DOMException("The range partially contains a non-text node", "InvalidStateError");
      const record = nodeBoundaryRecord(newParent).node;
      if (
        isDocumentRecord(record) ||
        tree.isDocumentTypeNode(record) ||
        (record.nodeName === "#document-fragment" && "childNodes" in record)
      )
        throw new DOMException("Invalid parent node type", "InvalidNodeTypeError");
      const contents = this.extractContents();
      if (newParent.hasChildNodes()) newParent.replaceChildren();
      this.insertNode(newParent);
      newParent.appendChild(contents);
      this.selectNode(newParent);
    }

    createContextualFragment(markup: string): DocumentFragment {
      const points = rangePoints.get(this);
      if (!points) throw new TypeError("Illegal invocation");
      if (arguments.length < 1) throw new TypeError("A markup argument is required");
      const node = points.start.node;
      const candidate = tree.isElementNode(node)
        ? node
        : "parentNode" in node
          ? node.parentNode
          : null;
      const context =
        candidate &&
        tree.isElementNode(candidate) &&
        (candidate.tagName !== "html" || candidate.namespaceURI !== html.NS.HTML)
          ? candidate
          : tree.createElement("body", html.NS.HTML, []);
      const text = domString(markup);
      const fragment = xmlDocumentFor(node)
        ? parseXMLFragment({ context: candidate, markup: text, url: url.href, DOMException })
        : parseOwnedHTMLFragment({
            context,
            markup: text,
            options: detailsParserOptions(text, inertParsing),
          });
      return initializeCopiedTree(fragment, ownerRecord(node)) as DocumentFragment;
    }
  }

  class Selection {
    #range: Range | null = null;
    #backward = false;

    constructor(key: symbol) {
      if (key !== token) throw new TypeError("Illegal constructor");
    }

    get [Symbol.toStringTag](): string {
      return "Selection";
    }
    get anchorNode(): Node | null {
      return (this.#backward ? this.#range?.endContainer : this.#range?.startContainer) ?? null;
    }
    get anchorOffset(): number {
      return (this.#backward ? this.#range?.endOffset : this.#range?.startOffset) ?? 0;
    }
    get focusNode(): Node | null {
      return (this.#backward ? this.#range?.startContainer : this.#range?.endContainer) ?? null;
    }
    get focusOffset(): number {
      return (this.#backward ? this.#range?.startOffset : this.#range?.endOffset) ?? 0;
    }
    get isCollapsed(): boolean {
      return this.#range?.collapsed ?? true;
    }
    get rangeCount(): number {
      return Number(this.#range !== null);
    }
    get type(): string {
      if (!this.#range) return "None";
      return this.#range.collapsed ? "Caret" : "Range";
    }

    readonly #notifyChange = () => queueDocumentSelectionChange(source);

    #associate(range: Range | null, backward = false): void {
      const previous = this.#range;
      const sameDirection = this.#backward === backward;
      this.#range = range;
      this.#backward = backward;
      if (previous === range) return;
      const prior = previous && rangePoints.get(previous);
      if (prior) prior.observers?.delete(this.#notifyChange);
      const points = range && rangePoints.get(range);
      if (points) (points.observers ??= new Set()).add(this.#notifyChange);
      if (
        sameDirection &&
        prior &&
        points &&
        prior.start.node === points.start.node &&
        prior.start.offset === points.start.offset &&
        prior.end.node === points.end.node &&
        prior.end.offset === points.end.offset
      )
        return;
      this.#notifyChange();
    }
    #select(anchor: Point, focus: Point): void {
      const backward = (comparePoints(anchor, focus) ?? 0) > 0;
      const start = backward ? focus : anchor;
      const end = backward ? anchor : focus;
      const range = new Range(token);
      range.setStart(wrap(start.node), start.offset);
      range.setEnd(wrap(end.node), end.offset);
      this.#associate(range, backward);
    }
    getRangeAt(index: number): Range {
      if (arguments.length === 0) throw new TypeError("A range index is required");
      if (Number(index) >>> 0 !== 0 || !this.#range)
        throw new DOMException("Invalid range index", "IndexSizeError");
      return this.#range;
    }
    addRange(range: Range): void {
      const points = rangePoints.get(range);
      if (!points) throw new TypeError("Expected a Range");
      if (!this.#range && treeRoot(points.start.node) === source) this.#associate(range);
    }
    removeRange(range: Range): void {
      if (!rangePoints.has(range)) throw new TypeError("Expected a Range");
      if (range !== this.#range) throw new DOMException("Range is not selected", "NotFoundError");
      this.#associate(null);
    }
    removeAllRanges(): void {
      this.#associate(null);
    }
    empty(): void {
      this.removeAllRanges();
    }
    collapse(node: Node | null, offset = 0): void {
      if (arguments.length === 0) throw new TypeError("A node is required");
      if (node == null) {
        this.removeAllRanges();
        return;
      }
      const record = nodeBoundaryRecord(node).node;
      const point = boundary(record, offset);
      if (treeRoot(record) === source) this.#select(point, point);
    }
    setPosition(node: Node | null, offset = 0): void {
      if (arguments.length === 0) throw new TypeError("A node is required");
      this.collapse(node, offset);
    }
    collapseToStart(): void {
      if (!this.#range) throw new DOMException("Selection is empty", "InvalidStateError");
      const point = { node: raw(this.#range.startContainer), offset: this.#range.startOffset };
      this.#select(point, point);
    }
    collapseToEnd(): void {
      if (!this.#range) throw new DOMException("Selection is empty", "InvalidStateError");
      const point = { node: raw(this.#range.endContainer), offset: this.#range.endOffset };
      this.#select(point, point);
    }
    extend(node: Node, offset = 0): void {
      const record = nodeBoundaryRecord(node).node;
      if (treeRoot(record) !== source) return;
      const anchor = this.anchorNode;
      if (!anchor) throw new DOMException("Selection is empty", "InvalidStateError");
      const focus = boundary(record, offset);
      const anchorRecord = raw(anchor);
      this.#select(
        treeRoot(anchorRecord) === source
          ? { node: anchorRecord, offset: this.anchorOffset }
          : focus,
        focus,
      );
    }
    setBaseAndExtent(
      anchorNode: Node,
      anchorOffset: number,
      focusNode: Node,
      focusOffset: number,
    ): void {
      if (arguments.length < 4) throw new TypeError("Two nodes and two offsets are required");
      const anchor = boundary(nodeBoundaryRecord(anchorNode).node, anchorOffset);
      const focus = boundary(nodeBoundaryRecord(focusNode).node, focusOffset);
      if (treeRoot(anchor.node) === source && treeRoot(focus.node) === source)
        this.#select(anchor, focus);
    }
    selectAllChildren(node: Node): void {
      const record = nodeBoundaryRecord(node).node;
      const start = boundary(record, 0);
      if (treeRoot(record) !== source) return;
      const offset = "childNodes" in record ? record.childNodes.length : 0;
      this.#select(start, { node: record, offset });
    }
    deleteFromDocument(): void {
      this.#range?.deleteContents();
    }
    containsNode(node: Node, allowPartialContainment = false): boolean {
      const record = nodeBoundaryRecord(node).node;
      if (!this.#range || treeRoot(record) !== source) return false;
      const start = { node: raw(this.#range.startContainer), offset: this.#range.startOffset };
      const end = { node: raw(this.#range.endContainer), offset: this.#range.endOffset };
      const startsBefore = (comparePoints(start, { node: record, offset: 0 }) ?? 0) < 0;
      const endsAfter =
        (comparePoints(end, { node: record, offset: boundaryLength(record) }) ?? 0) > 0;
      return allowPartialContainment ? startsBefore || endsAfter : startsBefore && endsAfter;
    }
    toString(): string {
      return this.#range?.toString() ?? "";
    }
  }

  let selection: Selection | undefined;
  function documentSelection(): Selection | null {
    return options.detachedDocument ? null : (selection ??= new Selection(token));
  }

  const selectLists = new WeakMap<
    Raw.Element,
    { realm: symbol; revision: number; members: Raw.Element[] }
  >();

  function selectMembers(select: Raw.Element): readonly Raw.Element[] {
    const realm = hasAdditionalDocuments ? owningRealm(select) : token;
    const treeRevision = realm === token ? revision : realmTreeOperations.get(realm)?.revision();
    const previous = selectLists.get(select);
    if (previous?.realm === realm && previous.revision === treeRevision) return previous.members;
    const members = [...optionMembers(select)];
    if (treeRevision !== undefined) {
      selectLists.set(select, { realm, revision: treeRevision, members });
    }
    if (
      members.length !== previous?.members.length ||
      members.some((option, index) => option !== previous?.members[index])
    ) {
      normalizeSelection(select, members);
    }
    return members;
  }

  function selectDisplaySize(select: Raw.Element): number {
    const size = attribute(select, "size")?.match(/^\s*\+?(\d+)/)?.[1];
    return size === undefined ? (attribute(select, "multiple") === null ? 1 : 4) : Number(size);
  }

  function normalizeSelection(select: Raw.Element, members: readonly Raw.Element[]): void {
    if (attribute(select, "multiple") !== null) return;
    let selected: Raw.Element | undefined;
    for (const option of members) {
      if (!optionSelected(option)) continue;
      if (selected) setOptionSelected(selected, false);
      selected = option;
    }
    if (selected || selectDisplaySize(select) !== 1) return;
    const first = members.find((option) => !optionIsDisabled(option));
    if (first) setOptionSelected(first, true);
  }

  function optionIsDisabled(option: Raw.Element): boolean {
    const parent = parentElementRecord(option);
    return (
      attribute(option, "disabled") !== null ||
      (parent?.namespaceURI === html.NS.HTML &&
        parent.tagName === "optgroup" &&
        attribute(parent, "disabled") !== null)
    );
  }

  function optionSelect(option: Raw.Element): Raw.Element | null {
    for (let parent = parentElementRecord(option); parent; parent = parentElementRecord(parent)) {
      if (parent.namespaceURI !== html.NS.HTML) continue;
      if (parent.tagName === "select") return parent;
      if (parent.tagName === "option" || parent.tagName === "datalist" || parent.tagName === "hr")
        break;
    }
    return null;
  }

  function updateOptionSelection(option: Raw.Element, selected: boolean, dirty = false): void {
    const select = optionSelect(option);
    const members = select ? selectMembers(select) : [];
    setOptionSelected(option, selected, dirty);
    if (!select || !members.includes(option)) return;
    if (selected && attribute(select, "multiple") === null) {
      for (const peer of members)
        if (peer !== option && optionSelected(peer)) setOptionSelected(peer, false);
    }
    normalizeSelection(select, members);
  }

  function optionText(option: Raw.Element): string {
    let text = "";
    const pending = option.childNodes.toReversed();
    while (pending.length) {
      const child = pending.pop();
      if (child && tree.isTextNode(child)) text += child.value;
      else if (
        child &&
        tree.isElementNode(child) &&
        !(
          child.tagName === "script" &&
          (child.namespaceURI === html.NS.HTML || child.namespaceURI === html.NS.SVG)
        )
      ) {
        for (let index = child.childNodes.length - 1; index >= 0; index--) {
          const next = child.childNodes[index];
          if (next) pending.push(next);
        }
      }
    }
    return text.replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
  }

  function optionValue(option: Raw.Element): string {
    return attribute(option, "value") ?? optionText(option);
  }

  class HTMLLabelElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLLabelElement, new.target);
      super(key, record, wrapHandle);
    }

    get htmlFor(): string {
      return attribute(element(this), "for") ?? "";
    }
    set htmlFor(value: string) {
      Element.prototype.setAttribute.call(this, "for", `${value}`);
    }
    get control(): HTMLElement | null {
      const node = element(this);
      const control = labelControl(node, treeRoot(node));
      return control ? (wrapElement(control) as HTMLElement) : null;
    }
    get form(): HTMLFormElement | null {
      const node = element(this);
      const control = labelControl(node, treeRoot(node));
      if (!control || htmlChildNamed(control, "meter", "progress")) return null;
      const form = formOwner(control);
      return form ? (wrapElement(form) as HTMLFormElement) : null;
    }
  }

  class HTMLLegendElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLLegendElement, new.target);
      super(key, record, wrapHandle);
    }

    get form(): HTMLFormElement | null {
      const parent = element(this).parentNode;
      const form = parent && htmlChildNamed(parent, "fieldset") ? formOwner(parent) : null;
      return form ? (wrapElement(form) as HTMLFormElement) : null;
    }
    get align(): string {
      return attribute(element(this), "align") ?? "";
    }
    set align(value: string) {
      Element.prototype.setAttribute.call(this, "align", `${value}`);
    }
  }

  function numericAttribute(node: Raw.Element, name: string, fallback: number): number {
    const value = floatingPrefix(attribute(node, name));
    return Number.isFinite(value) ? value : fallback;
  }

  function finiteDouble(value: number): number {
    const number = +value;
    if (!Number.isFinite(number)) throw new TypeError("Expected a finite number");
    return number;
  }

  function meterBounds(node: Raw.Element): [min: number, max: number] {
    const min = numericAttribute(node, "min", 0);
    return [min, Math.max(min, numericAttribute(node, "max", 1))];
  }

  class HTMLMeterElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLMeterElement, new.target);
      super(key, record, wrapHandle);
    }

    get labels(): NodeList<Element> {
      return labelsFor(element(this));
    }
    get min(): number {
      return numericAttribute(element(this), "min", 0);
    }
    set min(value: number) {
      Element.prototype.setAttribute.call(this, "min", String(finiteDouble(value)));
    }
    get max(): number {
      return meterBounds(element(this))[1];
    }
    set max(value: number) {
      Element.prototype.setAttribute.call(this, "max", String(finiteDouble(value)));
    }
    get value(): number {
      const node = element(this);
      const [min, max] = meterBounds(node);
      return Math.min(max, Math.max(min, numericAttribute(node, "value", 0)));
    }
    set value(value: number) {
      Element.prototype.setAttribute.call(this, "value", String(finiteDouble(value)));
    }
    get low(): number {
      const node = element(this);
      const [min, max] = meterBounds(node);
      return Math.min(max, Math.max(min, numericAttribute(node, "low", min)));
    }
    set low(value: number) {
      Element.prototype.setAttribute.call(this, "low", String(finiteDouble(value)));
    }
    get high(): number {
      const node = element(this);
      const [min, max] = meterBounds(node);
      const low = Math.min(max, Math.max(min, numericAttribute(node, "low", min)));
      return Math.min(max, Math.max(low, numericAttribute(node, "high", max)));
    }
    set high(value: number) {
      Element.prototype.setAttribute.call(this, "high", String(finiteDouble(value)));
    }
    get optimum(): number {
      const node = element(this);
      const [min, max] = meterBounds(node);
      return Math.min(max, Math.max(min, numericAttribute(node, "optimum", min / 2 + max / 2)));
    }
    set optimum(value: number) {
      Element.prototype.setAttribute.call(this, "optimum", String(finiteDouble(value)));
    }
  }

  function progressMaximum(node: Raw.Element): number {
    const max = numericAttribute(node, "max", 1);
    return max > 0 ? max : 1;
  }

  function progressValue(node: Raw.Element, max: number): number {
    return Math.min(max, Math.max(0, numericAttribute(node, "value", 0)));
  }

  class HTMLProgressElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLProgressElement, new.target);
      super(key, record, wrapHandle);
    }

    get labels(): NodeList<Element> {
      return labelsFor(element(this));
    }
    get max(): number {
      return progressMaximum(element(this));
    }
    set max(value: number) {
      const number = finiteDouble(value);
      if (number > 0) Element.prototype.setAttribute.call(this, "max", String(number));
    }
    get value(): number {
      const node = element(this);
      return progressValue(node, progressMaximum(node));
    }
    set value(value: number) {
      Element.prototype.setAttribute.call(this, "value", String(finiteDouble(value)));
    }
    get position(): number {
      const node = element(this);
      if (attribute(node, "value") === null) return -1;
      const max = progressMaximum(node);
      return progressValue(node, max) / max;
    }
  }

  class HTMLDataListElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLDataListElement, new.target);
      super(key, record, wrapHandle);
    }

    #options: HTMLCollection | undefined;
    get options(): HTMLCollection {
      const node = element(this);
      return (this.#options ??= liveElementCollection(node, () =>
        Array.from(descendants(node)).filter((child) => htmlChildNamed(child, "option")),
      ));
    }
  }

  class HTMLOptGroupElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLOptGroupElement, new.target);
      super(key, record, wrapHandle);
    }

    get disabled(): boolean {
      return attribute(element(this), "disabled") !== null;
    }
    set disabled(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "disabled", Boolean(value));
    }
    get label(): string {
      return attribute(element(this), "label") ?? "";
    }
    set label(value: string) {
      Element.prototype.setAttribute.call(this, "label", `${value}`);
    }
  }

  class HTMLOptionElement extends HTMLElement {
    constructor(
      key: symbol | undefined = undefined,
      record?: Raw.Element,
      wrapHandle?: (target: Node) => Node,
    ) {
      if (key !== token) return constructHTMLElement(HTMLOptionElement, new.target);
      super(key, record, wrapHandle);
    }

    get label(): string {
      const node = element(this);
      return attribute(node, "label") ?? optionText(node);
    }
    set label(value: string) {
      Element.prototype.setAttribute.call(this, "label", `${value}`);
    }
    get selected(): boolean {
      const option = element(this);
      const select = optionSelect(option);
      if (select) selectMembers(select);
      return optionSelected(option);
    }
    set selected(value: boolean) {
      updateOptionSelection(element(this), Boolean(value), true);
    }
    get defaultSelected(): boolean {
      return this.hasAttribute("selected");
    }
    set defaultSelected(value: boolean) {
      this.toggleAttribute("selected", Boolean(value));
    }
    get disabled(): boolean {
      return this.hasAttribute("disabled");
    }
    set disabled(value: boolean) {
      this.toggleAttribute("disabled", Boolean(value));
    }
    get text(): string {
      return optionText(element(this));
    }
    set text(value: string) {
      this.textContent = String(value);
    }
    get value(): string {
      return optionValue(element(this));
    }
    set value(value: string) {
      this.setAttribute("value", value);
    }
    get index(): number {
      const option = element(this);
      const select = optionSelect(option);
      return select ? selectMembers(select).indexOf(option) : 0;
    }
    get form(): HTMLFormElement | null {
      const select = optionSelect(element(this));
      const owner = select && formOwner(select);
      return owner ? (wrapElement(owner) as HTMLFormElement) : null;
    }
  }

  function Option(
    text = "",
    value?: string,
    defaultSelected = false,
    selected = false,
  ): HTMLOptionElement {
    const option = document.createElement("option") as HTMLOptionElement;
    option.text = String(text);
    if (value !== undefined) option.value = String(value);
    option.defaultSelected = Boolean(defaultSelected);
    setOptionSelected(element(option), Boolean(selected));
    return option;
  }
  Option.prototype = HTMLOptionElement.prototype;

  function addSelectOption(
    select: Raw.Element,
    value: ElementHandle,
    before: ElementHandle | number | null | undefined,
  ): void {
    const option = nodeRecord(value)?.node;
    if (!option || !htmlChildNamed(option, "option", "optgroup"))
      throw new TypeError("Expected an option or optgroup");
    const candidate = before == null ? undefined : nodeRecord(before as ElementHandle)?.node;
    const reference =
      candidate && tree.isElementNode(candidate) && candidate.namespaceURI === html.NS.HTML
        ? candidate
        : before == null
          ? undefined
          : selectMembers(select)[+before | 0];
    if (reference) {
      let ancestor = reference.parentNode;
      while (ancestor && ancestor !== select)
        ancestor = "parentNode" in ancestor ? ancestor.parentNode : null;
      if (!ancestor) throw new DOMException("Reference is outside the select", "NotFoundError");
    }
    if (option === reference) return;
    const parent = reference?.parentNode ?? select;
    Node.prototype.insertBefore.call(
      wrap(parent),
      wrapElement(option),
      reference ? wrapElement(reference) : null,
    );
  }

  function removeSelectOption(select: Raw.Element, index: number): void {
    const option = selectMembers(select)[+index | 0];
    if (option?.parentNode)
      Node.prototype.removeChild.call(wrap(option.parentNode), wrapElement(option));
  }

  function appendBlankOptions(select: Raw.Element, count: number): void {
    if (!count) return;
    const owner = ownerRecord(select);
    const realm = documentRealms.get(owner) ?? token;
    const fragment = tree.createDocumentFragment();
    for (let index = 0; index < count; index++) {
      const option = tree.createElement("option", html.NS.HTML, []);
      if (realm !== token) rememberCreationRealm({ root: option, realm, isForeignTransfer: true });
      tree.appendChild(fragment, option);
    }
    const handle = owned(new DocumentFragment(token, fragment), owner);
    Node.prototype.insertBefore.call(wrapElement(select), handle, null);
  }

  function resizeSelectOptions(select: Raw.Element, value: number): void {
    const length = +value >>> 0;
    const options = selectMembers(select);
    if (length > options.length) {
      if (length <= 100_000) appendBlankOptions(select, length - options.length);
      return;
    }
    for (let index = options.length - 1; index >= length; index--) {
      const option = options[index];
      if (option?.parentNode)
        Node.prototype.removeChild.call(wrap(option.parentNode), wrapElement(option));
    }
  }

  function setSelectOption(select: Raw.Element, index: number, value: unknown): void {
    const options = selectMembers(select);
    const previous = options[index];
    if (value == null) {
      if (previous?.parentNode)
        Node.prototype.removeChild.call(wrap(previous.parentNode), wrapElement(previous));
      return;
    }
    const option = typeof value === "object" ? nodeRecord(value)?.node : undefined;
    if (!option || !htmlChildNamed(option, "option")) throw new TypeError("Expected an option");
    if (previous?.parentNode) {
      Node.prototype.replaceChild.call(
        wrap(previous.parentNode),
        wrapElement(option),
        wrapElement(previous),
      );
      return;
    }
    appendBlankOptions(select, index - options.length);
    Node.prototype.insertBefore.call(wrapElement(select), wrapElement(option), null);
  }

  function namedSelectOption(select: Raw.Element, key: string): Element | null {
    if (!key) return null;
    const option = selectMembers(select).find(
      (node) => attribute(node, "id") === key || attribute(node, "name") === key,
    );
    return option ? wrapElement(option) : null;
  }

  class HTMLOptionsCollection extends HTMLCollection {
    readonly #owner: HTMLSelectElement;

    constructor(key: symbol, owner: HTMLSelectElement) {
      if (key !== token) throw new TypeError("Illegal constructor");
      const select = element(owner);
      super(
        key,
        {
          length: () => selectMembers(select).length,
          at(index) {
            const option = selectMembers(select)[index];
            return option && wrapElement(option);
          },
        },
        (name) => namedSelectOption(select, name) ?? undefined,
        (index, value) => setSelectOption(select, index, value),
      );
      this.#owner = owner;
    }
    override get length(): number {
      return selectMembers(element(this.#owner)).length;
    }
    override set length(value: number) {
      resizeSelectOptions(element(this.#owner), value);
    }
    get selectedIndex(): number {
      return selectMembers(element(this.#owner)).findIndex(optionSelected);
    }
    set selectedIndex(value: number) {
      setSelectIndex(element(this.#owner), value);
    }
    override item(index: number): Element | null {
      if (!arguments.length) throw new TypeError("An index is required");
      return super.item(+index >>> 0);
    }
    override namedItem(name: string): Element | null {
      if (!arguments.length) throw new TypeError("A name is required");
      return namedSelectOption(element(this.#owner), `${name}`);
    }
    add(option: ElementHandle, before?: ElementHandle | number | null): void {
      addSelectOption(element(this.#owner), option, before);
    }
    remove(index: number): void {
      if (!arguments.length) throw new TypeError("An index is required");
      removeSelectOption(element(this.#owner), index);
    }
    override get [Symbol.toStringTag](): string {
      return "HTMLOptionsCollection";
    }
  }

  function setSelectIndex(select: Raw.Element, value: number): void {
    const index = +value | 0;
    const members = selectMembers(select);
    for (let position = 0; position < members.length; position++) {
      const option = members[position];
      if (option) setOptionSelected(option, index === position, index === position);
    }
  }

  class HTMLSelectElement extends HTMLElement {
    [index: number]: Element | null | undefined;
    declare [Symbol.iterator]: () => IterableIterator<Element>;
    constructor(key: symbol | undefined = undefined, node?: Raw.Element) {
      if (key !== token) return constructHTMLElement(HTMLSelectElement, new.target);
      super(
        key,
        node,
        node
          ? (target) =>
              new Proxy(target, {
                get(target, property, receiver): unknown {
                  const index = indexedProperty(property);
                  if (index !== undefined) {
                    const option = selectMembers(node)[index];
                    return option && wrapElement(option);
                  }
                  return Reflect.get(target, property, receiver);
                },
                has(target, property) {
                  const index = indexedProperty(property);
                  if (index !== undefined) return index < selectMembers(node).length;
                  return Reflect.has(target, property);
                },
                set(target, property, value, receiver) {
                  const index = indexedProperty(property);
                  if (index === undefined) return Reflect.set(target, property, value, receiver);
                  setSelectOption(node, index, value);
                  return true;
                },
              })
          : undefined,
      );
    }
    get length(): number {
      return selectMembers(element(this)).length;
    }
    set length(value: number) {
      resizeSelectOptions(element(this), value);
    }
    get name(): string {
      return attribute(element(this), "name") ?? "";
    }
    set name(value: string) {
      Element.prototype.setAttribute.call(this, "name", `${value}`);
    }
    get disabled(): boolean {
      return attribute(element(this), "disabled") !== null;
    }
    set disabled(value: boolean) {
      Element.prototype.toggleAttribute.call(this, "disabled", Boolean(value));
    }
    get size(): number {
      return Math.max(0, reflectedLong(element(this), "size", 0));
    }
    set size(value: number) {
      const converted = +value >>> 0;
      Element.prototype.setAttribute.call(
        this,
        "size",
        String(converted <= 0x7fffffff ? converted : 0),
      );
    }
    get type(): "select-one" | "select-multiple" {
      return attribute(element(this), "multiple") === null ? "select-one" : "select-multiple";
    }
    get labels(): NodeList<Element> {
      return labelsFor(element(this));
    }
    get required(): boolean {
      return this.hasAttribute("required");
    }
    set required(value: boolean) {
      this.toggleAttribute("required", Boolean(value));
    }

    get willValidate(): boolean {
      return validationCandidate(element(this));
    }
    get validity(): ValidityState {
      return validityFor(element(this));
    }
    get validationMessage(): string {
      return validationMessageFor(element(this));
    }
    setCustomValidity(message: string): void {
      if (arguments.length === 0) throw new TypeError("A validation message is required");
      setValidationMessage(element(this), message);
    }
    checkValidity(): boolean {
      return checkControlValidity(this);
    }
    reportValidity(): boolean {
      return this.checkValidity();
    }

    #selectedOptions: HTMLCollection | undefined;
    get selectedOptions(): HTMLCollection {
      if (this.#selectedOptions) return this.#selectedOptions;
      const select = element(this);
      let previousMembers: readonly Raw.Element[] | undefined;
      let previousSelection = -1;
      let selected: Raw.Element[] = [];
      function current(): Raw.Element[] {
        const members = selectMembers(select);
        if (members !== previousMembers || previousSelection !== optionSelectionRevision) {
          selected = members.filter(optionSelected);
          previousMembers = members;
          previousSelection = optionSelectionRevision;
        }
        return selected;
      }
      this.#selectedOptions = new HTMLCollection(token, {
        length: () => current().length,
        at(index) {
          const option = current()[index];
          return option && wrapElement(option);
        },
      });
      return this.#selectedOptions;
    }

    #options: OptionsCollection | undefined;
    get multiple(): boolean {
      return this.hasAttribute("multiple");
    }
    set multiple(value: boolean) {
      this.toggleAttribute("multiple", Boolean(value));
    }
    get selectedIndex(): number {
      return selectMembers(element(this)).findIndex(optionSelected);
    }
    set selectedIndex(value: number) {
      setSelectIndex(element(this), value);
    }
    get value(): string {
      const selected = selectMembers(element(this)).find(optionSelected);
      return selected ? optionValue(selected) : "";
    }
    set value(value: string) {
      const select = element(this);
      const string = `${value}`;
      setSelectIndex(
        select,
        selectMembers(select).findIndex((option) => optionValue(option) === string),
      );
    }
    get form(): HTMLFormElement | null {
      const owner = formOwner(element(this));
      return owner ? (wrapElement(owner) as HTMLFormElement) : null;
    }
    add(option: Element, before?: Element | number | null): void {
      addSelectOption(element(this), option, before);
    }
    override remove(index?: number): void {
      if (arguments.length === 0) super.remove();
      else removeSelectOption(element(this), index ?? 0);
    }
    item(index: number): Element | null {
      if (!arguments.length) throw new TypeError("An index is required");
      const option = selectMembers(element(this))[+index >>> 0];
      return option ? wrapElement(option) : null;
    }
    namedItem(name: string): Element | null {
      if (!arguments.length) throw new TypeError("A name is required");
      return namedSelectOption(element(this), `${name}`);
    }
    get options(): OptionsCollection {
      return (this.#options ??= new HTMLOptionsCollection(token, this));
    }
  }

  let cachedDocumentBase: { revision: number; fallback: string; url: string } | undefined;

  function resolveDocumentBase(owner: Raw.Document, fallback: string): string {
    for (const candidate of descendants(owner)) {
      if (!htmlChildNamed(candidate, "base")) continue;
      const href = attribute(candidate, "href");
      if (href === null) continue;
      const base = parseDocumentURL({
        value: href,
        base: fallback,
        encoding: documentEncoding(owner),
      });
      return base && base.protocol !== "data:" && base.protocol !== "javascript:"
        ? base.href
        : fallback;
    }
    return fallback;
  }

  function documentEncoding(owner: Raw.Document = source): string {
    if (owner !== source) {
      const realm = documentRealms.get(owner);
      if (realm !== undefined && realm !== token) {
        const read = realmTreeOperations.get(realm)?.documentEncoding;
        if (read) return read(owner);
      }
    }
    return detachedSettings?.get(owner)?.encoding ?? options.encoding ?? "UTF-8";
  }

  function parseElementURL(node: Raw.Element, value: string, search?: string): URL | null {
    const owner = ownerRecord(node);
    return parseDocumentURL({
      value,
      base: baseURL(owner),
      encoding: documentEncoding(owner),
      ...(search === undefined ? {} : { search }),
    });
  }

  function baseURL(
    owner: Raw.Document = source,
    kind: "document" | "fallback" = "document",
  ): string {
    if (owner !== source) {
      const realm = documentRealms.get(owner);
      if (realm !== undefined && realm !== token) {
        const resolve = realmTreeOperations.get(realm)?.baseURL;
        if (resolve) return resolve(owner, kind);
      }
    }
    const fallback =
      (owner === source ? options.inheritedBase : detachedSettings?.get(owner)?.url) ?? url.href;
    if (kind === "fallback") return fallback;
    if (owner !== source) return resolveDocumentBase(owner, fallback);
    if (cachedDocumentBase?.revision === revision && cachedDocumentBase.fallback === fallback)
      return cachedDocumentBase.url;
    const base = resolveDocumentBase(owner, fallback);
    cachedDocumentBase = { revision, fallback, url: base };
    return base;
  }
  function bodyRecord(owner: Raw.Document = source): Raw.Element | undefined {
    const root = owner.childNodes.find(tree.isElementNode);
    if (!root || !htmlChildNamed(root, "html")) return;
    for (const child of root.childNodes) {
      if (
        tree.isElementNode(child) &&
        child.namespaceURI === html.NS.HTML &&
        (child.tagName === "body" || child.tagName === "frameset")
      )
        return child;
    }
    return undefined;
  }

  function titleRecord(owner: Raw.Document, root: Raw.Element): Raw.Element | undefined {
    if (elementLocalName(root) === "svg") {
      return root.childNodes.find(
        (child): child is Raw.Element =>
          tree.isElementNode(child) &&
          child.namespaceURI === html.NS.SVG &&
          elementLocalName(child) === "title",
      );
    }
    for (const child of descendants(owner)) {
      if (htmlChildNamed(child, "title")) return child;
    }
    return undefined;
  }

  type MarkupWriter = (markup: string, endOfInput: boolean) => void;
  let writtenDocument: { writer: MarkupWriter | undefined } | undefined;

  function createElementRecord(
    name: string,
    namespace: string | null,
    prefix: string | null,
    is: string | null = null,
  ): Element {
    // parse5's enum lists its parser namespaces, but its adapter stores arbitrary namespace strings.
    const record = tree.createElement(name, (namespace ?? "") as html.NS, []);
    if (prefix !== null) setRawElementPrefix(record, prefix);
    if (is !== null && namespace === html.NS.HTML)
      (customIsValues ??= new WeakMap()).set(record, is);
    if (
      (prefix === null ? name : name.slice(prefix.length + 1)) === "template" &&
      namespace === html.NS.HTML
    ) {
      Object.assign(record, { content: tree.createDocumentFragment() });
    }
    return wrapElement(record);
  }

  class DocumentType extends Node {
    get name(): string {
      return this.#doctype().name;
    }
    get publicId(): string {
      return this.#doctype().publicId;
    }
    get systemId(): string {
      return this.#doctype().systemId;
    }
    #doctype(): Raw.DocumentType {
      const node = raw(this);
      if (!tree.isDocumentTypeNode(node)) throw new TypeError("Expected a DocumentType");
      return node;
    }
    before(...nodes: (Node | string)[]): void {
      editSiblings(this, this.#doctype(), "before", nodes);
    }
    after(...nodes: (Node | string)[]): void {
      editSiblings(this, this.#doctype(), "after", nodes);
    }
    replaceWith(...nodes: (Node | string)[]): void {
      editSiblings(this, this.#doctype(), "replace", nodes);
    }
    remove(): void {
      const owner = this.parentNode;
      if (owner) owner.removeChild(this);
    }
  }

  function intrinsicDocumentFactory(
    receiver: object,
    method: DocumentFactory,
    args: readonly unknown[],
  ): object {
    const factory = documentFactoryDescriptors[method]?.value;
    if (typeof factory !== "function") throw new Error("Missing intrinsic Document factory");
    return Reflect.apply(factory, receiver, args);
  }

  function foreignImplementationFactory(
    receiver: object,
    method: ImplementationFactory,
    args: IArguments,
  ): object | undefined {
    const metadata = implementationOwners.get(receiver);
    if (!metadata) throw new TypeError("Expected a DOMImplementation");
    if (metadata.realm === token) return undefined;
    const operations = realmTreeOperations.get(metadata.realm);
    if (!operations) throw new Error("An implementation must have a creation realm");
    return operations.implementationFactory(receiver, method, Array.from(args));
  }

  function foreignDocumentFactory(
    receiver: Document,
    method: DocumentFactory,
    args: IArguments,
  ): object | undefined {
    const owner = raw(receiver);
    if (!isDocumentRecord(owner)) throw new TypeError("Expected a Document");
    const realm = documentRealms.get(owner);
    if (realm === undefined || realm === token) return undefined;
    const operations = realmTreeOperations.get(realm);
    if (!operations) throw new Error("A document must have a creation realm");
    return operations.documentFactory(receiver, method, Array.from(args));
  }

  class DOMImplementation {
    constructor(key: symbol, owner: Document) {
      if (key !== token) throw new TypeError("Illegal constructor");
      implementationOwners.set(this, { owner: ownerRecord(raw(owner)), realm: token });
    }
    hasFeature(): boolean {
      return true;
    }
    createDocumentType(name: string, publicId: string, systemId: string): DocumentType {
      const foreign = foreignImplementationFactory(this, "createDocumentType", arguments);
      if (foreign) return foreign as DocumentType;
      if (arguments.length < 3)
        throw new TypeError("A name, public ID, and system ID are required");
      const qualifiedName = String(name);
      if (/[\0\t\n\f\r >]/u.test(qualifiedName))
        throw new DOMException("Invalid doctype name", "InvalidCharacterError");
      return owned(
        new DocumentType(token, {
          nodeName: "#documentType",
          parentNode: null,
          name: qualifiedName,
          publicId: String(publicId),
          systemId: String(systemId),
        }),
        implementationOwners.get(this)?.owner ?? source,
      );
    }
    createDocument(
      namespace: string | null,
      qualifiedName: string | null,
      doctype: DocumentType | null = null,
    ): XMLDocument {
      const foreign = foreignImplementationFactory(this, "createDocument", arguments);
      if (foreign) return foreign as XMLDocument;
      if (arguments.length < 2) throw new TypeError("A namespace and qualified name are required");
      const ns = nullableNamespace(namespace);
      const contentType =
        ns === html.NS.HTML
          ? "application/xhtml+xml"
          : ns === html.NS.SVG
            ? "image/svg+xml"
            : "application/xml";
      const xml = new XMLDocument(token, tree.createDocument(), {
        ...defaultDetachedSettings,
        contentType,
      });
      const name = qualifiedName === null ? "" : String(qualifiedName);
      const root = name
        ? (intrinsicDocumentFactory(xml, "createElementNS", [ns, name]) as Element)
        : null;
      if (doctype !== null) {
        if (!tree.isDocumentTypeNode(raw(doctype))) throw new TypeError("Expected a DocumentType");
        insertNodeRecord(ownerRecord(raw(xml)), raw(doctype), null, false);
      }
      if (root) insertNodeRecord(ownerRecord(raw(xml)), raw(root), null, false);
      return xml;
    }
    createHTMLDocument(title?: string): Document {
      const foreign = foreignImplementationFactory(this, "createHTMLDocument", arguments);
      if (foreign) return foreign as Document;
      const record = parse("<!doctype html><html><head></head><body></body></html>", inertParsing);
      const result = new Document(token, record, {
        ...defaultDetachedSettings,
        isXML: false,
        contentType: "text/html",
      });
      if (title !== undefined) {
        const root = record.childNodes.find(tree.isElementNode);
        const head = root?.childNodes.find((node) => htmlChildNamed(node, "head"));
        if (!head || !tree.isElementNode(head))
          throw new Error("A new HTML document must have a head");
        const titleNode = tree.createElement("title", html.NS.HTML, []);
        tree.appendChild(titleNode, tree.createTextNode(String(title)));
        tree.appendChild(head, titleNode);
      }
      return result;
    }
  }

  const implementationFactoryDescriptors = Object.getOwnPropertyDescriptors(
    DOMImplementation.prototype,
  );

  let xpathVersions: WeakMap<Raw.Document, { value: number }> | undefined;
  function queueMutation(change: Parameters<typeof queueObserverMutation>[0]): void {
    const version = xpathVersions?.get(actualOwnerRecord(change.target));
    if (version) version.value++;
    queueObserverMutation(change);
  }

  function observeXPathVersion(owner: Raw.Document): () => number {
    const realm = documentRealms.get(owner);
    const foreign = realm && realm !== token && realmTreeOperations.get(realm);
    if (foreign) return foreign.observeXPathVersion(owner);
    const versions = (xpathVersions ??= new WeakMap());
    let version = versions.get(owner);
    if (!version) {
      version = { value: 0 };
      versions.set(owner, version);
    }
    const state = version;
    return () => state.value;
  }

  function xpathXMLLanguage(node: Node): string | null {
    const owner = attrOwners?.get(node);
    let current: Raw.Node | null = owner ?? raw(node);
    // Parent links are acyclic and stop at the document or fragment boundary.
    while (current) {
      if (tree.isElementNode(current)) {
        const language = findAttributeNS(current, html.NS.XML, "lang");
        if (language) return language.value;
      }
      current = "parentNode" in current ? current.parentNode : null;
    }
    return null;
  }

  let xpathBinding: ReturnType<typeof createXPath<Node>> | undefined;
  function xpath() {
    return (xpathBinding ??= createXPath<Node>({
      Exception: DOMException,
      isNode: (node): node is Node =>
        typeof node === "object" && node !== null && records.has(node),
      isHTML: (node) => !xmlDocumentFor(raw(node)),
      reportResolverError: (resolver, error) =>
        reportCallbackException(resolver, error, reportRuntimeError),
      makeTypeError(message) {
        const Exception: TypeErrorConstructor = Reflect.get(window, "TypeError") ?? TypeError;
        return new Exception(message);
      },
      nodeName(node) {
        const attr = attrRecords?.get(node);
        if (attr) {
          return {
            namespace: attr.namespace || null,
            localName: attr.name,
            attribute: true,
            htmlOwner: attrOwners?.get(node)?.namespaceURI === html.NS.HTML,
          };
        }
        const record = nodeRecord(node)?.node;
        if (!record || !tree.isElementNode(record)) return undefined;
        return {
          namespace: record.namespaceURI || null,
          localName: elementLocalName(record),
          attribute: false,
          htmlOwner: record.namespaceURI === html.NS.HTML,
        };
      },
      shadowRoot(node) {
        const root = treeRoot(attrOwners?.get(node) ?? raw(node));
        return shadowHosts.has(root) ? wrap(root) : undefined;
      },
      xmlLanguage: xpathXMLLanguage,
      observeVersion: (node) => observeXPathVersion(actualOwnerRecord(raw(node))),
    }));
  }

  function documentNamedWrapper(target: Node, owner: Raw.Document): Node {
    const initiallyEmpty =
      owner === source && options.canKeepInitialDocumentNamesEmpty ? namedRevision : -1;
    const collections = new Map<string, WeakRef<HTMLCollection>>();
    const collected = new FinalizationRegistry<{ name: string; ref: WeakRef<HTMLCollection> }>(
      ({ name, ref }) => {
        if (collections.get(name) === ref) collections.delete(name);
      },
    );
    function names(): Map<string, Raw.Element[]> {
      const indices = (documentNameIndices ??= new WeakMap());
      const known = indices.get(owner);
      if (known) return known;
      const next = new Map<string, Raw.Element[]>();
      if (initiallyEmpty !== namedRevision) {
        for (const node of descendants(owner)) {
          if (!isDocumentNamedElement(node)) continue;
          const localName = elementLocalName(node);
          const name = attribute(node, "name");
          const id =
            localName === "object" || (localName === "img" && name) ? attribute(node, "id") : null;
          for (const key of new Set([id, name])) {
            if (!key) continue;
            const entries = next.get(key);
            if (entries) entries.push(node);
            else next.set(key, [node]);
          }
        }
      }
      indices.set(owner, next);
      return next;
    }
    function visible(key: PropertyKey): key is string {
      return typeof key === "string" && !Object.hasOwn(target, key) && names().has(key);
    }
    function resolve(key: string): object | undefined {
      const entries = names().get(key);
      if (!entries) return undefined;
      if (entries.length === 1) {
        const node = entries[0];
        if (!node) return undefined;
        if (elementLocalName(node) === "iframe") return frameWindow(node) ?? wrapElement(node);
        return wrapElement(node);
      }
      const known = collections.get(key)?.deref();
      if (known) return known;
      const collection = new HTMLCollection(token, {
        length: () => names().get(key)?.length ?? 0,
        at(position) {
          const node = names().get(key)?.[position];
          return node ? wrapElement(node) : undefined;
        },
      });
      // Live handed-out collections must retain identity; dead entries disappear after collection.
      const ref = new WeakRef(collection);
      collections.set(key, ref);
      collected.register(collection, { name: key, ref });
      return collection;
    }
    return new Proxy(target, {
      get(target, key, receiver) {
        return visible(key) ? resolve(key) : Reflect.get(target, key, receiver);
      },
      has(target, key) {
        return visible(key) || Reflect.has(target, key);
      },
      ownKeys(target) {
        const named = [...names().keys()].filter((key) => !Object.hasOwn(target, key));
        return [...named, ...Reflect.ownKeys(target)];
      },
      getOwnPropertyDescriptor(target, key) {
        return visible(key)
          ? { value: resolve(key), writable: false, enumerable: true, configurable: true }
          : Reflect.getOwnPropertyDescriptor(target, key);
      },
      set(target, key, value, receiver) {
        // Web IDL [[Set]] ignores named values and follows ordinary descriptors;
        // [[DefineOwnProperty]] rejects writes to supported names on this receiver.
        return Reflect.set(target, key, value, receiver);
      },
      defineProperty(target, key, descriptor) {
        if (key !== "location" && typeof key === "string" && names().has(key)) return false;
        return Reflect.defineProperty(target, key, descriptor);
      },
      deleteProperty(target, key) {
        return visible(key) ? false : Reflect.deleteProperty(target, key);
      },
      preventExtensions: () => false,
    });
  }

  class Document extends Node {
    get designMode(): string {
      return designModeDocuments.has(ownerRecord(raw(this))) ? "on" : "off";
    }
    set designMode(value: string) {
      const mode = asciiLower(`${value}`);
      const record = ownerRecord(raw(this));
      if (mode === "off") {
        if (designModeDocuments.delete(record)) advanceRevision();
      } else if (mode === "on" && !designModeDocuments.has(record)) {
        designModeDocuments.add(record);
        advanceRevision();
        const currentSelection = Document.prototype.getSelection.call(this);
        if (currentSelection?.rangeCount) {
          const range = currentSelection.getRangeAt(0);
          Range.prototype.setStart.call(range, this, 0);
          Range.prototype.setEnd.call(range, this, 0);
        }
        const root = record.childNodes.find(tree.isElementNode);
        if (root) updateFocus(wrapElement(root), true);
      }
    }
    createExpression(
      ...args: Parameters<
        InstanceType<ReturnType<typeof xpath>["XPathEvaluator"]>["createExpression"]
      >
    ) {
      raw(this);
      return new (xpath().XPathEvaluator)().createExpression(...args);
    }
    createNSResolver(node: Node): Node {
      raw(this);
      return new (xpath().XPathEvaluator)().createNSResolver(node);
    }
    evaluate(
      ...args: Parameters<InstanceType<ReturnType<typeof xpath>["XPathEvaluator"]>["evaluate"]>
    ) {
      raw(this);
      return new (xpath().XPathEvaluator)().evaluate(...args);
    }
    #detachedMarkup: string | undefined;

    static parseHTMLUnsafe(markup: string): Document {
      if (arguments.length === 0) throw new TypeError("HTML is required");
      const settings = {
        isXML: false,
        contentType: "text/html",
        encoding: "UTF-8",
        url: "about:blank",
      };
      const record = parseInertDocument(`${markup}`, settings, true);
      return new Document(token, record, settings);
    }

    #implementation: DOMImplementation | undefined;
    #forms: HTMLCollection | undefined;
    #links: HTMLCollection | undefined;
    #anchors: HTMLCollection | undefined;
    #images: HTMLCollection | undefined;
    #scripts: HTMLCollection | undefined;
    #embeds: HTMLCollection | undefined;
    #applets: HTMLCollection | undefined;

    #elementsByHTMLName(name: string): HTMLCollection {
      return new HTMLCollection(
        token,
        descendantMembers(ownerRecord(raw(this)), (node) => htmlChildNamed(node, name)),
      );
    }

    get images(): HTMLCollection {
      return (this.#images ??= this.#elementsByHTMLName("img"));
    }

    get scripts(): HTMLCollection {
      return (this.#scripts ??= this.#elementsByHTMLName("script"));
    }

    get embeds(): HTMLCollection {
      return (this.#embeds ??= this.#elementsByHTMLName("embed"));
    }

    get plugins(): HTMLCollection {
      return (this.#embeds ??= this.#elementsByHTMLName("embed"));
    }

    get applets(): HTMLCollection {
      return (this.#applets ??= new HTMLCollection(token, []));
    }

    get links(): HTMLCollection {
      return (this.#links ??= new HTMLCollection(
        token,
        descendantMembers(
          ownerRecord(raw(this)),
          (node) => htmlChildNamed(node, "a", "area") && attribute(node, "href") !== null,
        ),
      ));
    }

    get anchors(): HTMLCollection {
      return (this.#anchors ??= new HTMLCollection(
        token,
        descendantMembers(
          ownerRecord(raw(this)),
          (node) => htmlChildNamed(node, "a") && attribute(node, "name") !== null,
        ),
      ));
    }

    get forms(): HTMLCollection {
      return (this.#forms ??= this.#elementsByHTMLName("form"));
    }

    constructor(
      key?: symbol,
      record: Raw.Document = tree.createDocument(),
      settings = defaultDetachedSettings,
    ) {
      if (key !== undefined && key !== token) throw new TypeError("Illegal constructor");
      super(token, record, (target) => documentNamedWrapper(target, record));
      documentRealms.set(record, token);
      Object.defineProperty(this, "location", documentLocationDescriptor);
      if (record === source ? sourceIsXML : settings.isXML) xmlDocuments.add(record);
      if (record !== source) {
        hasAdditionalDocuments = true;
        (detachedSettings ??= new WeakMap()).set(record, settings);
      }
    }
    get implementation(): DOMImplementation {
      return (this.#implementation ??= new DOMImplementation(token, this));
    }
    get compatMode(): "CSS1Compat" | "BackCompat" {
      return ownerRecord(raw(this)).mode === html.DOCUMENT_MODE.QUIRKS
        ? "BackCompat"
        : "CSS1Compat";
    }
    get children(): HTMLCollection {
      return childElements(this, ownerRecord(raw(this)));
    }
    get childElementCount(): number {
      return this.children.length;
    }
    get firstElementChild(): Element | null {
      return edgeElement(ownerRecord(raw(this)), false);
    }
    get lastElementChild(): Element | null {
      return edgeElement(ownerRecord(raw(this)), true);
    }
    open(): this {
      if (xmlDocumentFor(raw(this)))
        throw new DOMException("Cannot open an XML document", "InvalidStateError");
      replaceChildren(ownerRecord(raw(this)), []);
      if (this !== document) {
        this.#detachedMarkup = "";
        return this;
      }
      writtenDocument = { writer: undefined };
      didBindBody = false;
      didScanStyles = false;
      didScanFrames = false;
      cancelScheduledLoads();
      loadGeneration++;
      documentLoadStopped = false;
      readyState = "loading";
      return this;
    }
    write(...parts: string[]): void {
      const markup = parts.map((part) => `${part}`).join("");
      if (xmlDocumentFor(raw(this)))
        throw new DOMException("Cannot write an XML document", "InvalidStateError");
      if (this !== document) {
        if (this.#detachedMarkup === undefined) this.open();
        this.#detachedMarkup = (this.#detachedMarkup ?? "") + markup;
        return;
      }
      if (currentScript) {
        const parent = currentScript.parentNode;
        if (!parent || !markup) return;
        // jsdom parses each call in a div and inserts its children immediately after the script.
        const context = tree.createElement("div", html.NS.HTML, []);
        const { fragment } = parseElementMarkup(context, markup);
        const next = parent.childNodes[parent.childNodes.indexOf(currentScript) + 1] ?? null;
        insertNodeRecord(parent, fragment, next, false);
        return;
      }
      if (!writtenDocument) Document.prototype.open.call(this);
      const session = writtenDocument;
      if (!session) throw new Error("An open document must have a write session");
      if (!session.writer) {
        // Install the writer before parsing author input, so reentrant close/open sees this session.
        session.writer = parseMarkup(
          "",
          {
            scriptingEnabled: options.runScripts === "dangerously",
            sourceCodeLocationInfo: false,
          },
          false,
        );
      }
      if (!session.writer) throw new Error("An HTML document must have a streaming parser");
      session.writer(markup, false);
    }

    writeln(...parts: string[]): void {
      Document.prototype.write.call(this, ...parts, "\n");
    }
    close(): void {
      if (this !== document) {
        const markup = this.#detachedMarkup;
        if (markup === undefined) return;
        this.#detachedMarkup = undefined;
        const owner = ownerRecord(raw(this));
        const settings = detachedSettings?.get(owner);
        if (!settings) return;
        const parsed = parseInertDocument(markup, settings, declarativeShadowDocuments.has(owner));
        owner.mode = parsed.mode;
        replaceChildren(owner, parsed.childNodes);
        return;
      }
      const session = writtenDocument;
      if (!session) return;
      writtenDocument = undefined;
      if (session.writer) session.writer("", true);
      else
        parseMarkup("", {
          scriptingEnabled: options.runScripts === "dangerously",
          sourceCodeLocationInfo: false,
        });
    }
    get adoptedStyleSheets(): AdoptedStyleSheet[] {
      return styles().adopted(ownerRecord(raw(this)));
    }
    set adoptedStyleSheets(sheets: Iterable<AdoptedStyleSheet>) {
      styles().setAdopted(ownerRecord(raw(this)), sheets);
    }
    get styleSheets() {
      return styles().list(ownerRecord(raw(this)));
    }
    get hidden(): boolean {
      return !options.pretendToBeVisual;
    }
    get visibilityState(): "prerender" | "visible" {
      return options.pretendToBeVisual ? "visible" : "prerender";
    }
    get readyState(): "loading" | "interactive" | "complete" {
      return this === document ? readyState : "complete";
    }
    get URL(): string {
      return detachedSettings?.get(ownerRecord(raw(this)))?.url ?? url.href;
    }
    get documentURI(): string {
      return detachedSettings?.get(ownerRecord(raw(this)))?.url ?? url.href;
    }
    get referrer(): string {
      return this === document ? referrer : "";
    }
    get location(): Location | null {
      return this === document && !options.detachedDocument ? getLocation() : null;
    }
    set location(value: string) {
      if (this.location) this.location.href = value;
    }
    get defaultView(): Window | null {
      return options.detachedDocument || this !== document ? null : window;
    }
    get contentType(): string {
      return (
        detachedSettings?.get(ownerRecord(raw(this)))?.contentType ??
        options.contentType ??
        "text/html"
      );
    }
    get characterSet(): string {
      return documentEncoding(ownerRecord(raw(this)));
    }
    get charset(): string {
      return this.characterSet;
    }
    get inputEncoding(): string {
      return this.characterSet;
    }
    get cookie(): string {
      return this === document ? (options.readCookie?.(url.href) ?? "") : "";
    }
    set cookie(value: string) {
      if (this === document) options.writeCookie?.(String(value), url.href);
    }
    get activeElement(): Element | null {
      return activeElementInRoot(raw(this)) ?? this.body;
    }
    hasFocus(): boolean {
      return focusedDocuments.has(ownerRecord(raw(this)));
    }
    get lastModified(): string {
      const record = raw(this);
      if (!isDocumentRecord(record)) throw new TypeError("Expected a Document");
      const timestamp =
        record === source ? options.lastModifiedMs : detachedSettings?.get(record)?.lastModifiedMs;
      const date =
        timestamp !== undefined && Number.isFinite(timestamp) ? new Date(timestamp) : new Date();
      const twoDigits = (value: number) => String(value).padStart(2, "0");
      const day = twoDigits(date.getDate());
      const month = twoDigits(date.getMonth() + 1);
      const year = String(date.getFullYear()).padStart(4, "0");
      const hours = twoDigits(date.getHours());
      const minutes = twoDigits(date.getMinutes());
      const seconds = twoDigits(date.getSeconds());
      return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
    }
    get documentElement(): Element | null {
      const root = ownerRecord(raw(this)).childNodes.find(tree.isElementNode);
      return root ? wrapElement(root) : null;
    }
    get dir(): string {
      const root = ownerRecord(raw(this)).childNodes.find(tree.isElementNode);
      return root && htmlChildNamed(root, "html") ? reflectedDirection(root) : "";
    }
    set dir(value: string) {
      const direction = `${value}`;
      const root = ownerRecord(raw(this)).childNodes.find(tree.isElementNode);
      if (root && htmlChildNamed(root, "html")) {
        Element.prototype.setAttribute.call(wrapElement(root), "dir", direction);
      }
    }
    get rootElement(): Element | null {
      const root = ownerRecord(raw(this)).childNodes.find(tree.isElementNode);
      return root?.namespaceURI === html.NS.SVG && elementLocalName(root) === "svg"
        ? wrapElement(root)
        : null;
    }
    get body(): HTMLElement | null {
      const record = bodyRecord(ownerRecord(raw(this)));
      return record ? (wrapElement(record) as HTMLElement) : null;
    }
    set body(value: HTMLElement | null) {
      raw(this);
      const candidate = value && nodeRecord(value)?.node;
      if (
        value !== null &&
        (!candidate || !tree.isElementNode(candidate) || candidate.namespaceURI !== html.NS.HTML)
      )
        throw new TypeError("Expected an HTMLElement body");
      if (
        !candidate ||
        !tree.isElementNode(candidate) ||
        candidate.namespaceURI !== html.NS.HTML ||
        (elementLocalName(candidate) !== "body" && elementLocalName(candidate) !== "frameset")
      )
        throw new DOMException("Expected an HTML body or frameset", "HierarchyRequestError");
      const owner = ownerRecord(raw(this));
      const existing = bodyRecord(owner);
      if (existing === candidate) return;
      const root = owner.childNodes.find(tree.isElementNode);
      if (!root) throw new DOMException("Document has no root element", "HierarchyRequestError");
      const parent = wrapElement(root);
      if (existing)
        Node.prototype.replaceChild.call(parent, wrapElement(candidate), wrapElement(existing));
      else Node.prototype.appendChild.call(parent, wrapElement(candidate));
    }
    get title(): string {
      const owner = ownerRecord(raw(this));
      const root = owner.childNodes.find(tree.isElementNode);
      const title = root && titleRecord(owner, root);
      return title
        ? childTextContent(title)
            .replace(/[\t\n\f\r ]+/g, " ")
            .replace(/^ | $/g, "")
        : "";
    }
    set title(value: string) {
      const text = `${value}`;
      const owner = ownerRecord(raw(this));
      const root = owner.childNodes.find(tree.isElementNode);
      if (!root) return;

      const isSVG = elementLocalName(root) === "svg";
      if (!isSVG && root.namespaceURI !== html.NS.HTML) return;
      const existing = titleRecord(owner, root);
      if (existing) {
        setChildTextContent(existing, text);
        return;
      }

      const parent = isSVG ? root : root.childNodes.find((child) => htmlChildNamed(child, "head"));
      if (!parent) return;
      const title = isSVG
        ? Document.prototype.createElementNS.call(this, html.NS.SVG, "title")
        : Document.prototype.createElement.call(this, "title");
      const firstChild = isSVG ? parent.childNodes[0] : undefined;
      Node.prototype.insertBefore.call(
        wrapElement(parent),
        title,
        firstChild ? wrap(firstChild) : null,
      );
      setChildTextContent(element(title), text);
    }
    get head(): HTMLElement | null {
      const root = ownerRecord(raw(this)).childNodes.find(tree.isElementNode);
      const head = root?.childNodes.find((child) => htmlChildNamed(child, "head"));
      return head ? (wrapElement(head) as HTMLElement) : null;
    }
    get doctype(): DocumentType | null {
      const doctype = ownerRecord(raw(this)).childNodes.find(tree.isDocumentTypeNode);
      return doctype ? (wrap(doctype) as DocumentType) : null;
    }
    get currentScript(): Element | null {
      return this === document && currentScript ? wrapElement(currentScript) : null;
    }
    adoptNode<T extends Node>(node: T): T {
      const record = nodeRecord(node);
      if (!record) throw new TypeError("Expected a Node to adopt");
      if (isDocumentRecord(record.node))
        throw new DOMException("Cannot adopt a document", "NotSupportedError");
      if (shadowHosts.has(record.node))
        throw new DOMException("Cannot adopt a shadow root", "HierarchyRequestError");
      const owner = raw(this);
      if (!isDocumentRecord(owner)) throw new TypeError("Expected a Document");
      hasAdditionalDocuments = true;
      const previousOwner = ownerRecord(record.node);
      const previousRealm = documentRealms.get(previousOwner) ?? token;
      const destinationRealm = documentRealms.get(owner) ?? token;
      if (previousRealm !== destinationRealm) {
        realmTreeOperations.get(previousRealm)?.invalidateQueryIndices();
        rememberCreationRealm({ root: record.node, realm: record.realm, isForeignTransfer: true });
      }
      const attributeOwner = attrOwners?.get(node);
      if (attributeOwner) {
        const attribute = attrRecords?.get(node);
        const remove = realmTreeOperations.get(record.realm)?.removeAttribute;
        if (!attribute || !remove)
          throw new Error("An attached attribute must have an owner realm");
        remove(attributeOwner, attribute);
      } else if ("parentNode" in record.node && record.node.parentNode) {
        const remove = realmTreeOperations.get(previousRealm)?.remove;
        if (!remove) throw new Error("A node must have a removal realm");
        remove(record.node);
      }
      setOwner(record.node, owner);
      if (parserFormOwners) transferParserAssociationScope(previousOwner, owner);
      if (previousOwner !== owner) {
        adoptAssociatedSubtrees(record.node, previousOwner, owner);
        if (hasCustomElements)
          for (const reaction of customAdoptionReactions(record.node, previousOwner, owner))
            reaction();
      }
      return node;
    }
    importNode<T extends Node>(node: T, deep = false): T {
      const record = nodeRecord(node)?.node;
      if (!record) throw new TypeError("Expected a Node to import");
      if ((record.nodeName === "#document" && "mode" in record) || shadowHosts.has(record))
        throw new DOMException("Cannot import a document or shadow root", "NotSupportedError");
      const attr = attrRecords?.get(node);
      const owner = ownerRecord(raw(this));
      if (attr) {
        const copy: Node = owned(wrapAttribute({ ...attr }), owner);
        return copy as T;
      }
      const copy = cloneRawTree(
        record,
        Boolean(deep),
        hasClonableShadows ? cloneShadowTree : undefined,
      );
      return initializeCopiedTree(copy, owner) as T;
    }
    createDocumentFragment(): DocumentFragment {
      const foreign = foreignDocumentFactory(this, "createDocumentFragment", arguments);
      if (foreign) return foreign as DocumentFragment;
      return owned(new DocumentFragment(), ownerRecord(raw(this)));
    }
    createNodeIterator(
      root: Node,
      whatToShow = 0xffffffff,
      filter: IteratorFilter<Node> | null = null,
    ) {
      return traversal().iterator(traversalOptions(root, whatToShow, filter));
    }
    createTreeWalker(
      root: Node,
      whatToShow = 0xffffffff,
      filter: IteratorFilter<Node> | null = null,
    ) {
      return traversal().walker(traversalOptions(root, whatToShow, filter));
    }
    createEvent(type: string): InstanceType<typeof Event> {
      if (arguments.length < 1) throw new TypeError("An event interface is required");
      switch (asciiLower(String(type))) {
        case "event":
        case "events":
        case "htmlevents":
        case "svgevents":
          return events.legacy(new Event(""));
        case "beforeunloadevent":
          return events.legacy(events.createBeforeUnloadEvent());
        case "devicemotionevent":
          return events.legacy(new DeviceMotionEvent(""));
        case "deviceorientationevent":
          return events.legacy(new DeviceOrientationEvent(""));
        case "customevent":
          return events.legacy(new CustomEvent(""));
        case "uievent":
        case "uievents":
          return events.legacy(new UIEvent(""));
        case "focusevent":
          return events.legacy(new FocusEvent(""));
        case "mouseevent":
        case "mouseevents":
          return events.legacy(new MouseEvent(""));
        case "touchevent":
          return events.legacy(new TouchEvent(""));
        case "keyboardevent":
          return events.legacy(new KeyboardEvent(""));
        case "messageevent":
          return events.legacy(new MessageEvent(""));
        case "compositionevent":
          return events.legacy(new CompositionEvent(""));
        case "hashchangeevent":
          return events.legacy(new HashChangeEvent(""));
        case "storageevent":
          return events.legacy(new StorageEvent(""));
        default:
          throw new DOMException("Unsupported event interface", "NotSupportedError");
      }
    }
    getSelection(): Selection | null {
      return this === document ? documentSelection() : null;
    }
    createRange(): Range {
      const foreign = foreignDocumentFactory(this, "createRange", arguments);
      if (foreign) return foreign as Range;
      return new Range(token, ownerRecord(raw(this)));
    }
    createElement(name: string, settings?: { is?: string } | string): Element {
      const foreign = foreignDocumentFactory(this, "createElement", arguments);
      if (foreign) return foreign as Element;
      if (arguments.length < 1) throw new TypeError("An element name is required");
      const value = String(name);
      const isXML = xmlDocumentFor(raw(this));
      const localName = isXML ? value : asciiLower(value);
      if (!validElementName(localName))
        throw new DOMException("Invalid element name", "InvalidCharacterError");
      const owner = ownerRecord(raw(this));
      const contentType = detachedSettings?.get(owner)?.contentType ?? options.contentType;
      const namespace = !isXML || contentType === "application/xhtml+xml" ? html.NS.HTML : null;
      const handle = owned(
        createElementRecord(localName, namespace, null, customOption(settings)),
        owner,
      );
      return this === document ? constructDocumentCustomElement(handle) : handle;
    }
    createElementNS(
      namespace: string | null,
      qualifiedName: string,
      settings?: { is?: string } | string,
    ): Element {
      const foreign = foreignDocumentFactory(this, "createElementNS", arguments);
      if (foreign) return foreign as Element;
      if (arguments.length < 2) throw new TypeError("A namespace and qualified name are required");
      const ns = nullableNamespace(namespace);
      const qualified = String(qualifiedName);
      const { prefix } = extractName(ns, qualified, "element");
      const handle = owned(
        createElementRecord(qualified, ns, prefix, customOption(settings)),
        ownerRecord(raw(this)),
      );
      return this === document ? constructDocumentCustomElement(handle) : handle;
    }
    createAttribute(name: string): Attr {
      const foreign = foreignDocumentFactory(this, "createAttribute", arguments);
      if (foreign) return foreign as Attr;
      if (arguments.length < 1) throw new TypeError("An attribute name is required");
      const value = String(name);
      const isXML = xmlDocumentFor(raw(this));
      const localName = isXML ? value : asciiLower(value);
      if (!validAttributeName(localName))
        throw new DOMException("Invalid attribute name", "InvalidCharacterError");
      return owned(wrapAttribute({ name: localName, value: "" }), ownerRecord(raw(this)));
    }
    createAttributeNS(namespace: string | null, qualifiedName: string): Attr {
      const foreign = foreignDocumentFactory(this, "createAttributeNS", arguments);
      if (foreign) return foreign as Attr;
      if (arguments.length < 2) throw new TypeError("A namespace and qualified name are required");
      const ns = nullableNamespace(namespace);
      const { name, prefix } = extractName(ns, String(qualifiedName), "attribute");
      return owned(
        wrapAttribute({
          name,
          value: "",
          ...(ns === null ? {} : { namespace: ns }),
          ...(prefix === null ? {} : { prefix }),
        }),
        ownerRecord(raw(this)),
      );
    }
    createTextNode(data: string): Text {
      const foreign = foreignDocumentFactory(this, "createTextNode", arguments);
      if (foreign) return foreign as Text;
      if (arguments.length < 1) throw new TypeError("Data is required");
      return owned(new Text(String(data)), ownerRecord(raw(this)));
    }
    createComment(data: string): Comment {
      const foreign = foreignDocumentFactory(this, "createComment", arguments);
      if (foreign) return foreign as Comment;
      if (arguments.length < 1) throw new TypeError("Data is required");
      return owned(new Comment(String(data)), ownerRecord(raw(this)));
    }
    createCDATASection(data: string): CDATASection {
      const foreign = foreignDocumentFactory(this, "createCDATASection", arguments);
      if (foreign) return foreign as CDATASection;
      if (arguments.length < 1) throw new TypeError("Data is required");
      if (!xmlDocumentFor(raw(this)))
        throw new DOMException("CDATA is unavailable in HTML documents", "NotSupportedError");
      const value = String(data);
      if (value.includes("]]>"))
        throw new DOMException(
          "CDATA cannot contain its closing delimiter",
          "InvalidCharacterError",
        );
      return owned(
        new CDATASection(token, createXMLData(value, { kind: "cdata" })),
        ownerRecord(raw(this)),
      );
    }
    createProcessingInstruction(target: string, data: string): ProcessingInstruction {
      const foreign = foreignDocumentFactory(this, "createProcessingInstruction", arguments);
      if (foreign) return foreign as ProcessingInstruction;
      if (arguments.length < 2) throw new TypeError("A target and data are required");
      const name = String(target);
      const value = String(data);
      if (!isXMLName(name))
        throw new DOMException("Invalid processing instruction target", "InvalidCharacterError");
      if (value.includes("?>"))
        throw new DOMException(
          "Processing instruction data cannot contain its closing delimiter",
          "InvalidCharacterError",
        );
      return owned(
        new ProcessingInstruction(
          token,
          createXMLData(value, { kind: "instruction", target: name }),
        ),
        ownerRecord(raw(this)),
      );
    }
    getElementById(id: string): Element | null {
      const record = raw(this);
      if (!isDocumentRecord(record)) throw new TypeError("Expected a Document");
      if (arguments.length < 1) throw new TypeError("An ID is required");
      const key = String(id);
      return record === source ? findDocumentElementById(key) : findElementById(record, key);
    }
    getElementsByName(name: string): NodeList<Element> {
      if (arguments.length < 1) throw new TypeError("A name is required");
      const key = String(name);
      return new NodeList(
        token,
        descendantMembers(
          ownerRecord(raw(this)),
          (node) => node.namespaceURI === html.NS.HTML && attribute(node, "name") === key,
        ),
      );
    }
    getElementsByTagName(name: string): HTMLCollection {
      if (arguments.length < 1) throw new TypeError("A tag name is required");
      return elementsByTag(ownerRecord(raw(this)), String(name));
    }
    getElementsByTagNameNS(namespace: string | null, localName: string): HTMLCollection {
      if (arguments.length < 2) throw new TypeError("A namespace and local name are required");
      return elementsByNamespace(
        ownerRecord(raw(this)),
        namespace == null ? null : String(namespace),
        String(localName),
      );
    }
    getElementsByClassName(names: string): HTMLCollection {
      if (arguments.length < 1) throw new TypeError("Class names are required");
      return elementsByClass(ownerRecord(raw(this)), String(names));
    }
    querySelector(selector: string): Element | null {
      if (arguments.length < 1) throw new TypeError("1 argument required");
      return query(this, domString(selector));
    }
    querySelectorAll(selector: string): NodeList<Element> {
      if (arguments.length < 1) throw new TypeError("1 argument required");
      return queryAll(this, domString(selector));
    }
  }

  function isXMLParseError(error: unknown): error is DOMException {
    return error instanceof HostDOMException && error.name === "SyntaxError";
  }

  function xmlParserError(message: string): Raw.Element {
    const node = tree.createElement(
      "parsererror",
      "http://www.mozilla.org/newlayout/xml/parsererror.xml" as html.NS,
      [],
    );
    tree.insertText(node, message);
    return node;
  }

  function parseInertDocument(
    markup: string,
    settings: DetachedDocumentSettings,
    allowDeclarativeShadows = false,
  ): Raw.Document {
    const record = settings.isXML
      ? tree.createDocument()
      : parse(markup, detailsParserOptions(markup, parserFormOptions(markup, inertParsing)));
    if (settings.isXML) parseXML({ document: record, markup, url: settings.url });
    markScriptsInert(record);
    if (allowDeclarativeShadows) {
      declarativeShadowDocuments.add(record);
      if (/shadowrootmode/i.test(markup)) {
        for (const shadow of materializeParsedShadows(record)) reconcileSlots(shadow);
      }
    }
    return record;
  }

  const documentFactoryDescriptors = Object.getOwnPropertyDescriptors(Document.prototype);

  class XMLSerializer {
    constructor() {
      xmlSerializerInstances.add(this);
    }
    serializeToString(node: Node): string {
      if (!xmlSerializerInstances.has(this)) throw new TypeError("Illegal invocation");
      const record = nodeRecord(node);
      if (!record) throw new TypeError("Expected a Node");
      if (attrRecords?.has(node)) return "";
      try {
        return serializeXMLNode(record.node);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        throw new DOMException(error.message, "InvalidStateError");
      }
    }
    get [Symbol.toStringTag](): string {
      return "XMLSerializer";
    }
  }

  function parseDOMDocument(markup: string, contentType: string): Document {
    const isXML = contentType !== "text/html";
    const settings = { isXML, contentType, encoding: "UTF-8", url: url.href };
    let record: Raw.Document;
    try {
      record = parseInertDocument(isXML ? markup.toWellFormed() : markup, settings);
    } catch (error) {
      if (!isXMLParseError(error)) throw error;
      record = tree.createDocument();
      tree.appendChild(record, xmlParserError(error.message));
    }
    return new Document(token, record, settings);
  }

  class DOMParser {
    constructor() {
      domParserOwners.set(this, parseDOMDocument);
    }
    parseFromString(input: string, type: string): Document {
      const parseOwned = domParserOwners.get(this);
      if (!parseOwned) throw new TypeError("Illegal invocation");
      if (arguments.length < 2) throw new TypeError("Expected markup and a content type");
      const markup = domString(input);
      const contentType = domString(type);
      const isXML = contentType !== "text/html";
      if (
        isXML &&
        !["text/xml", "application/xml", "application/xhtml+xml", "image/svg+xml"].includes(
          contentType,
        )
      ) {
        throw new TypeError("Invalid DOMParser content type");
      }
      return parseOwned(markup, contentType) as Document;
    }
    get [Symbol.toStringTag](): string {
      return "DOMParser";
    }
  }

  class XMLDocument extends Document {
    constructor(key: symbol, record: Raw.Document, settings?: DetachedDocumentSettings) {
      if (key !== token) throw new TypeError("Illegal constructor");
      super(key, record, settings);
    }
  }

  function unforgeableDescriptor(prototype: object, name: string): PropertyDescriptor {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor) throw new Error(`Missing ${name} descriptor`);
    descriptor.configurable = false;
    descriptor.enumerable = true;
    if ("value" in descriptor) descriptor.writable = false;
    Reflect.deleteProperty(prototype, name);
    return descriptor;
  }

  const documentLocationDescriptor = unforgeableDescriptor(Document.prototype, "location");

  const document: Document = options.isXML
    ? new XMLDocument(token, source)
    : new Document(token, source);
  class ErrorEvent extends Event {
    readonly message: string;
    readonly filename: string;
    readonly lineno: number;
    readonly colno: number;
    readonly error: unknown;
    constructor(
      type: string,
      init?: {
        cancelable?: boolean;
        bubbles?: boolean;
        composed?: boolean;
        message?: string;
        filename?: string;
        lineno?: number;
        colno?: number;
        error?: unknown;
      },
    ) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      super(type, init);
      errorEventRecords.add(this);
      this.message = init?.message ?? "";
      this.filename = init?.filename ?? "";
      this.lineno = init?.lineno ?? 0;
      this.colno = init?.colno ?? 0;
      this.error = init?.error ?? null;
    }
  }

  let reportingError = false;
  function reportRuntimeError(cause: unknown): void {
    if (!options.reportScriptError) {
      queueMicrotask(() => {
        throw cause;
      });
      return;
    }
    if (closed) return;
    if (reportingError) {
      options.reportScriptError(cause);
      return;
    }
    const value = typeof cause === "object" && cause !== null ? cause : {};
    const message =
      "message" in value && typeof value.message === "string"
        ? value.message
        : "Uncaught exception";
    const stack = "stack" in value && typeof value.stack === "string" ? value.stack : "";
    const frame = /(?:^|\n)\s+at (?:[^\n]+? \()?(.+?):(\d+):(\d+)\)?/.exec(stack);
    const error = new ErrorEvent("error", {
      cancelable: true,
      message,
      filename: frame?.[1] ?? url.href,
      lineno: Number(frame?.[2] ?? 0),
      colno: Number(frame?.[3] ?? 0),
      error: cause,
    });
    reportingError = true;
    try {
      if (window.dispatchEvent(error)) options.reportScriptError(cause);
    } finally {
      reportingError = false;
    }
  }

  type EventInit = NonNullable<ConstructorParameters<typeof Event>[1]>;

  class HashChangeEvent extends Event {
    readonly #oldURL: string;
    readonly #newURL: string;
    constructor(
      type: string,
      init: (EventInit & { oldURL?: string; newURL?: string }) | undefined = undefined,
    ) {
      if (arguments.length === 0) throw new TypeError("An event type is required");
      super(type, init);
      this.#newURL = init?.newURL === undefined ? "" : String(init.newURL).toWellFormed();
      this.#oldURL = init?.oldURL === undefined ? "" : String(init.oldURL).toWellFormed();
    }
    get oldURL(): string {
      return this.#oldURL;
    }
    get newURL(): string {
      return this.#newURL;
    }
    override get [Symbol.toStringTag](): string {
      return "HashChangeEvent";
    }
  }

  function dispatchHistoryEvents(state: unknown, previous: URL, next: URL): void {
    if (closed) return;
    window.dispatchEvent(events.trusted(new PopStateEvent("popstate", { state })));
    const previousHash = previous.href.indexOf("#");
    const nextHash = next.href.indexOf("#");
    const previousFragment = previousHash === -1 ? "" : previous.href.slice(previousHash);
    const nextFragment = nextHash === -1 ? "" : next.href.slice(nextHash);
    if (previousFragment !== nextFragment)
      window.dispatchEvent(
        events.trusted(
          new HashChangeEvent("hashchange", { oldURL: previous.href, newURL: next.href }),
        ),
      );
  }

  function fragmentTarget(fragment: string): Raw.Element | null {
    const exact = firstElementWithID(source, fragment);
    if (exact) return exact;
    for (const node of descendants(source)) {
      if (
        tree.isElementNode(node) &&
        node.namespaceURI === html.NS.HTML &&
        node.tagName === "a" &&
        attribute(node, "name") === fragment
      )
        return node;
    }
    return null;
  }

  function hiddenUntilFound(node: Raw.Element): boolean {
    return (
      node.namespaceURI === html.NS.HTML &&
      asciiLower(attribute(node, "hidden") ?? "") === "until-found"
    );
  }

  function revealFragment(fragment: string): void {
    if (!fragment) return;
    const ancestors: { node: Raw.Element; type: "hidden" | "details" }[] = [];
    let target = fragmentTarget(fragment);
    if (!target && fragment.includes("%")) {
      const bytes = fragment.replace(/%([a-f\d]{2})/gi, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
      if (bytes !== fragment)
        target = fragmentTarget(Buffer.from(bytes, "latin1").toString("utf8"));
    }
    for (let node = target; node;) {
      const parent = assignedSlot(node) ?? treeParent(node, false);
      if (
        !parent ||
        (parent === node.parentNode && tree.isElementNode(parent) && shadowRoots.has(parent))
      )
        break;
      if (hiddenUntilFound(node)) ancestors.push({ node, type: "hidden" });
      if (
        tree.isElementNode(parent) &&
        parent.namespaceURI === html.NS.HTML &&
        parent.tagName === "details" &&
        attribute(parent, "open") === null &&
        node !== firstDetailsSummary(parent)
      )
        ancestors.push({ node: parent, type: "details" });
      node = tree.isElementNode(parent) ? parent : (shadowHosts.get(parent) ?? null);
    }
    // Snapshot the ancestors before a beforematch handler can move a target.
    for (const { node: ancestor, type } of ancestors) {
      if (!connected(ancestor)) return;
      const handle = wrapElement(ancestor);
      if (type === "details") {
        if (attribute(ancestor, "open") !== null) return;
        Element.prototype.setAttribute.call(handle, "open", "");
        continue;
      }
      if (!hiddenUntilFound(ancestor)) return;
      Node.prototype.dispatchEvent.call(
        handle,
        events.trusted(new Event("beforematch", { bubbles: true })),
      );
      if (!connected(ancestor) || !hiddenUntilFound(ancestor)) return;
      Element.prototype.removeAttribute.call(handle, "hidden");
    }
  }

  function navigateLocation(next: URL, replace = false): void {
    if (closed || next.href === url.href) return;
    if (next.protocol === "javascript:") {
      if (options.runScripts !== "dangerously" || !context) return;
      const scriptContext = context;
      timers.setTimeout(() => {
        if (closed) return;
        const encoded = Buffer.from(next.href.slice("javascript:".length)).toString("latin1");
        const bytes = encoded.replace(/%([a-f\d]{2})/gi, (_, hex: string) =>
          String.fromCharCode(Number.parseInt(hex, 16)),
        );
        let result: unknown;
        try {
          result = evaluateClassicScript({
            context: scriptContext,
            source: Buffer.from(bytes, "latin1").toString("utf8"),
            url: next.href,
            lineOffset: 0,
          });
        } catch (cause) {
          reportRuntimeError(cause);
        }
        if (typeof result === "string") {
          options.reportUnsupported?.("string results from 'javascript:' URLs");
        }
      });
      return;
    }
    const previous = url;
    const sameDocument = previous.href.split("#", 1)[0] === next.href.split("#", 1)[0];
    if (!sameDocument) {
      options.reportUnsupported?.("navigation to another Document");
      return;
    }
    const session = navigation();
    if (replace) {
      session.history.replaceState(null, "", next.href);
      session.cancelTraversal();
    } else session.history.pushState(null, "", next.href);
    timers.setTimeout(() => dispatchHistoryEvents(null, previous, next));
    revealFragment(next.hash.slice(1));
  }

  const locationKey = Symbol();
  let locationInstance: Location | undefined;

  function locationURL(receiver: Location): URL {
    if (receiver !== locationInstance) throw new TypeError("Expected a Location");
    return url;
  }

  function locationInput(value: string): string {
    if (typeof value === "symbol") throw new TypeError("Cannot convert a Symbol to a string");
    return String(value).toWellFormed();
  }

  function changeLocationComponent(
    receiver: Location,
    component: "protocol" | "host" | "hostname" | "port" | "pathname" | "search" | "hash",
    value: string,
  ): void {
    const next = new URL(locationURL(receiver).href);
    const input = locationInput(value);
    if (component === "protocol" && !/^[a-z][a-z\d+.-]*(?::|$)/i.test(input))
      throw new TypeError(`Could not parse the URL after setting the procol to "${input}"`);
    next[component] = component === "hash" && input === "" ? "#" : input;
    if (component === "protocol" && next.protocol !== "http:" && next.protocol !== "https:") return;
    navigateLocation(next);
  }

  function parseLocationTarget(
    receiver: Location,
    value: string,
    mode: "href" | "assign" | "replace",
  ): URL {
    const current = locationURL(receiver);
    const input = locationInput(value);
    const parsed = parseDocumentURL({
      value: input,
      base: baseURL(),
      encoding: documentEncoding(),
    });
    if (parsed) return parsed;
    if (mode === "href") throw new TypeError(`Could not parse "${input}" as a URL`);
    throw new DOMException(
      `Could not resolve the given string "${input}" relative to the base URL "${current.href}"`,
      "SyntaxError",
    );
  }

  class Location {
    constructor(key: symbol) {
      if (key !== locationKey) throw new TypeError("Illegal constructor");
    }
    get [Symbol.toStringTag](): string {
      return "Location";
    }
    get href(): string {
      return locationURL(this).href;
    }
    set href(value: string) {
      navigateLocation(parseLocationTarget(this, value, "href"));
    }
    assign(value: string): void {
      if (arguments.length === 0) throw new TypeError("A URL is required");
      navigateLocation(parseLocationTarget(this, value, "assign"));
    }
    replace(value: string): void {
      if (arguments.length === 0) throw new TypeError("A URL is required");
      navigateLocation(parseLocationTarget(this, value, "replace"), true);
    }
    reload(): void {
      locationURL(this);
      if (!closed) options.reportUnsupported?.("navigation to another Document");
    }
    get origin(): string {
      return locationURL(this).origin;
    }
    get protocol(): string {
      return locationURL(this).protocol;
    }
    set protocol(value: string) {
      changeLocationComponent(this, "protocol", value);
    }
    get host(): string {
      return locationURL(this).host;
    }
    set host(value: string) {
      changeLocationComponent(this, "host", value);
    }
    get hostname(): string {
      return locationURL(this).hostname;
    }
    set hostname(value: string) {
      changeLocationComponent(this, "hostname", value);
    }
    get port(): string {
      return locationURL(this).port;
    }
    set port(value: string) {
      changeLocationComponent(this, "port", value);
    }
    get pathname(): string {
      return locationURL(this).pathname;
    }
    set pathname(value: string) {
      changeLocationComponent(this, "pathname", value);
    }
    get search(): string {
      return locationURL(this).search;
    }
    set search(value: string) {
      changeLocationComponent(this, "search", value);
    }
    get hash(): string {
      return locationURL(this).hash;
    }
    set hash(value: string) {
      changeLocationComponent(this, "hash", value);
    }
    toString(): string {
      return locationURL(this).href;
    }
  }

  function getLocation(): Location {
    if (locationInstance) return locationInstance;
    const instance = new Location(locationKey);
    for (const name of Object.getOwnPropertyNames(Location.prototype)) {
      if (name === "constructor") continue;
      Object.defineProperty(instance, name, unforgeableDescriptor(Location.prototype, name));
    }
    return (locationInstance = instance);
  }
  let top: unknown;
  const consoleMethods =
    "assert clear count countReset debug dir dirxml error group groupCollapsed groupEnd info log table time timeLog timeEnd trace warn".split(
      " ",
    );
  let browserConsole: Record<string, (...args: unknown[]) => void> | undefined;
  function getConsole() {
    return (browserConsole ??= Object.fromEntries(
      consoleMethods.map((name) => [
        name,
        (...args: unknown[]) => options.emitConsole?.(name, args),
      ]),
    ));
  }

  class PopStateEvent extends Event {
    readonly #state: unknown;
    readonly #hasUAVisualTransition: boolean;
    constructor(
      type: string,
      init:
        | (EventInit & { state?: unknown; hasUAVisualTransition?: boolean })
        | undefined = undefined,
    ) {
      if (arguments.length === 0) throw new TypeError("An event type is required");
      super(type, init);
      this.#hasUAVisualTransition = Boolean(init?.hasUAVisualTransition);
      this.#state = init?.state ?? null;
    }
    get state(): unknown {
      return this.#state;
    }
    get hasUAVisualTransition(): boolean {
      return this.#hasUAVisualTransition;
    }
    override get [Symbol.toStringTag](): string {
      return "PopStateEvent";
    }
  }

  let historyBinding: ReturnType<typeof createHistory> | undefined;
  function navigation() {
    return (historyBinding ??= createHistory({
      readURL: () => url,
      readBaseURL: baseURL,
      parseURL: (value, base) => parseDocumentURL({ value, base, encoding: documentEncoding() }),
      activate: (next) => {
        url = next;
      },
      dispatchTraversal: dispatchHistoryEvents,
      reload: () => getLocation().reload(),
      Exception: DOMException,
      isClosed: () => closed,
      queueTraversal: (callback) => {
        timers.setTimeout(callback);
      },
    }));
  }

  function callSocketTransport<T>(operation: () => T): T {
    try {
      return operation();
    } catch (cause) {
      // Transport errors implement the same Web API but are constructed in the host realm.
      if (cause instanceof HostDOMException && !(cause instanceof DOMException))
        throw new DOMException(cause.message, cause.name);
      throw cause;
    }
  }

  function createWindowSocketClass(): SocketConstructor {
    let transport: SocketTransportConstructor | undefined;

    function getTransport(): SocketTransportConstructor {
      if (transport) return transport;
      const controller = (socketAbort ??= new AbortController());
      if (closed) controller.abort();
      return (transport =
        options.createWebSocket?.({
          baseURL,
          origin: documentOrigin,
          signal: controller.signal,
          DOMException,
        }) ?? globalThis.WebSocket);
    }

    class WebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readonly #socket: SocketTransport;
      #readyState: number = WebSocket.CONNECTING;
      #binaryType: SocketTransport["binaryType"] = "blob";

      constructor(url: string | URL, protocols: string | string[] | undefined = undefined) {
        if (arguments.length < 1) throw new TypeError("A WebSocket URL is required");
        super();
        this.#socket = callSocketTransport(() => {
          const Transport = getTransport();
          return new Transport(url, protocols);
        });
        // The public binaryType is applied when the queued message is delivered.
        this.#socket.binaryType = "arraybuffer";
        const origin = new URL(this.#socket.url).origin;
        this.#socket.addEventListener("open", () =>
          this.#queue(() => {
            if (this.#readyState !== WebSocket.CONNECTING) return;
            this.#readyState = WebSocket.OPEN;
            this.#dispatch(new Event("open"));
          }),
        );
        this.#socket.addEventListener("error", () =>
          this.#queue(() => {
            this.#readyState = WebSocket.CLOSED;
            this.#dispatch(new Event("error"));
          }),
        );
        this.#socket.addEventListener("message", ({ data }) =>
          this.#queue(() => {
            if (this.#readyState !== WebSocket.OPEN) return;
            this.#dispatch(new MessageEvent("message", { data: this.#messageData(data), origin }));
          }),
        );
        this.#socket.addEventListener("close", ({ code, reason, wasClean }) =>
          this.#queue(() => {
            this.#readyState = WebSocket.CLOSED;
            this.#dispatch(new CloseEvent("close", { code, reason, wasClean }));
          }),
        );
      }

      #messageData(data: unknown): unknown {
        if (!types.isArrayBuffer(data)) return data;
        if (this.#binaryType === "blob") return new NodeBlob([data]);
        return data instanceof realmArrayBuffer ? data : copyBytesToWindow(new Uint8Array(data));
      }

      #queue(deliver: () => void): void {
        if (!closed) timers.setTimeout(deliver);
      }

      #dispatch(event: InstanceType<typeof Event>): void {
        EventTarget.prototype.dispatchEvent.call(this, events.trusted(event));
      }

      declare readonly CONNECTING: number;
      declare readonly OPEN: number;
      declare readonly CLOSING: number;
      declare readonly CLOSED: number;

      get readyState() {
        return closed ? this.#socket.readyState : this.#readyState;
      }
      get url() {
        return this.#socket.url;
      }
      get protocol() {
        return this.#socket.protocol;
      }
      get extensions() {
        return this.#socket.extensions;
      }
      get bufferedAmount() {
        return this.#socket.bufferedAmount;
      }
      get binaryType() {
        return this.#binaryType;
      }
      set binaryType(value: SocketTransport["binaryType"]) {
        const type = `${value}`;
        if (type === "blob" || type === "arraybuffer") this.#binaryType = type;
      }
      send(data: Parameters<SocketTransport["send"]>[0]): void {
        if (arguments.length < 1) throw new TypeError("WebSocket data is required");
        if (this.readyState === WebSocket.CONNECTING)
          throw new DOMException("Sent before connected.", "InvalidStateError");
        callSocketTransport(() => this.#socket.send(data));
      }
      close(code: number | undefined = undefined, reason?: string): void {
        callSocketTransport(() => this.#socket.close(code, reason));
        if (this.#readyState !== WebSocket.CLOSED) this.#readyState = WebSocket.CLOSING;
      }

      get onopen(): Handler | null {
        return handlers.get(this, "open");
      }
      set onopen(handler: Handler | null) {
        handlers.set(this, "open", handler);
      }
      get onerror(): Handler | null {
        return handlers.get(this, "error");
      }
      set onerror(handler: Handler | null) {
        handlers.set(this, "error", handler);
      }
      get onmessage(): Handler | null {
        return handlers.get(this, "message");
      }
      set onmessage(handler: Handler | null) {
        handlers.set(this, "message", handler);
      }
      get onclose(): Handler | null {
        return handlers.get(this, "close");
      }
      set onclose(handler: Handler | null) {
        handlers.set(this, "close", handler);
      }

      get [Symbol.toStringTag](): string {
        return "WebSocket";
      }
    }
    for (const key of Object.getOwnPropertyNames(WebSocket.prototype)) {
      if (key !== "constructor")
        Object.defineProperty(WebSocket.prototype, key, { enumerable: true });
    }
    for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"] as const) {
      const descriptor = {
        value: WebSocket[key],
        enumerable: true,
        writable: false,
        configurable: false,
      };
      Object.defineProperty(WebSocket, key, descriptor);
      Object.defineProperty(WebSocket.prototype, key, descriptor);
    }
    return WebSocket;
  }

  let channelInterfaces: ReturnType<typeof createMessageChannels> | undefined;
  function channels(): ReturnType<typeof createMessageChannels> {
    return (channelInterfaces ??= createMessageChannels({
      events,
      handlers,
      DOMException,
      TypeError: context ? Reflect.get(context, "TypeError") : TypeError,
      isClosed: () => closed,
      ...(context ? { realm: context } : {}),
    }));
  }

  function closeWindow(): void {
    if (closed) return;
    closed = true;
    styleBinding?.closeComputed();
    stopActiveParser?.();
    stopActiveParser = undefined;
    cancelScheduledLoads();
    cachedNodeListFactory = undefined;
    advanceRevision();
    blobURLs?.close();
    channelInterfaces?.close();
    timers.close();
    resourceTimingOverflow = undefined;
    resourceObservers?.clear();
    frameCallbacks?.clear();
    cancelResourceRequests();
    socketAbort?.abort();
    for (const node of frameStates.keys()) closeFrame(node);
    if (frameCount) refreshFrameIndices();
    storageBinding?.close();
    options.frameClosed?.();
    mediaQueries?.clear();
    notifyFrameMedia.delete(window);
    events.clear(window);
    events.clear(document);
  }

  let pluginInterfaces: ReturnType<typeof createNavigatorPlugins> | undefined;
  function navigatorPlugins() {
    return (pluginInterfaces ??= createNavigatorPlugins());
  }

  const navigatorKey = Symbol();
  const languages = Object.freeze(["en-US", "en"]);
  class Navigator {
    constructor(key: symbol) {
      if (key !== navigatorKey) throw new TypeError("Illegal constructor");
    }
    get appCodeName(): string {
      return "Mozilla";
    }
    get appName(): string {
      return "Netscape";
    }
    get appVersion(): string {
      return "4.0";
    }
    get product(): string {
      return "Gecko";
    }
    get productSub(): string {
      return "20030107";
    }
    get vendor(): string {
      return "Apple Computer, Inc.";
    }
    get vendorSub(): string {
      return "";
    }
    get [Symbol.toStringTag](): string {
      return "Navigator";
    }
    get hardwareConcurrency(): number {
      return cpus().length;
    }
    javaEnabled(): boolean {
      return false;
    }
    get plugins() {
      return navigatorPlugins().plugins();
    }
    get mimeTypes() {
      return navigatorPlugins().mimeTypes();
    }
    get pdfViewerEnabled(): boolean {
      return false;
    }
    get userAgent(): string {
      return options.userAgent ?? "";
    }
    get language(): string {
      return "en-US";
    }
    get languages(): readonly string[] {
      return languages;
    }
    get platform(): string {
      return "";
    }
    get onLine(): boolean {
      return true;
    }
    get cookieEnabled(): boolean {
      return true;
    }
  }
  let navigator: Navigator | undefined;

  type WindowErrorHandler = (
    this: Window,
    message: string | InstanceType<typeof Event>,
    filename?: string,
    lineno?: number,
    colno?: number,
    error?: unknown,
  ) => unknown;
  let frameId = 0;
  let frameTimer = 0;
  let frameCallbacks: Map<number, (time: number) => void> | undefined;
  function requestAnimationFrame(callback: (time: number) => void): number {
    if (typeof callback !== "function") throw new TypeError("Expected an animation frame callback");
    if (closed) return 0;
    const id = ++frameId;
    (frameCallbacks ??= new Map()).set(id, callback);
    if (!frameTimer)
      frameTimer = timers.setTimeout(() => {
        frameTimer = 0;
        const callbacks = frameCallbacks;
        if (!callbacks) return;
        const timestamp = relativeHighResolutionTime(windowStarted);
        const frame = Array.from(callbacks);
        for (const [id, handler] of frame) {
          if (closed) break;
          if (!callbacks.delete(id)) continue;
          try {
            handler(timestamp);
          } catch (cause) {
            reportCallbackException(handler, cause, reportRuntimeError);
          }
        }
      }, 16);
    return id;
  }

  function cancelAnimationFrame(id: number): void {
    frameCallbacks?.delete(Number(id));
  }

  type StorageEventInit = NonNullable<ConstructorParameters<typeof Event>[1]> & {
    key?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    url?: string;
    storageArea?: object | null;
  };

  function storageEventData(init?: StorageEventInit) {
    const key = init?.key;
    const newValue = init?.newValue;
    const oldValue = init?.oldValue;
    const storageArea = init?.storageArea ?? null;
    if (storageArea !== null && !isStorage(storageArea))
      throw new TypeError("Expected a Storage object");
    const url = init?.url;
    return {
      key: key == null ? null : String(key),
      newValue: newValue == null ? null : String(newValue),
      oldValue: oldValue == null ? null : String(oldValue),
      storageArea,
      url: url === undefined ? "" : String(url).toWellFormed(),
    };
  }

  class StorageEvent extends Event {
    #data: ReturnType<typeof storageEventData>;
    constructor(type: string, init: StorageEventInit | undefined = undefined) {
      if (arguments.length === 0) throw new TypeError("An event type is required");
      super(type, init);
      this.#data = storageEventData(init);
    }
    override get [Symbol.toStringTag](): string {
      return "StorageEvent";
    }
    get key(): string | null {
      return this.#data.key;
    }
    get oldValue(): string | null {
      return this.#data.oldValue;
    }
    get newValue(): string | null {
      return this.#data.newValue;
    }
    get url(): string {
      return this.#data.url;
    }
    get storageArea(): object | null {
      return this.#data.storageArea;
    }
    initStorageEvent(
      type: string,
      bubbles = false,
      cancelable = false,
      key: string | null = null,
      oldValue: string | null = null,
      newValue: string | null = null,
      url = "",
      storageArea: object | null = null,
    ): void {
      if (arguments.length === 0) throw new TypeError("An event type is required");
      const data = storageEventData({ key, oldValue, newValue, url, storageArea });
      if (this.eventPhase !== 0) return;
      super.initEvent(type, bubbles, cancelable);
      this.#data = data;
    }
  }

  let storageBinding: ReturnType<typeof createStorage> | undefined;
  function storage() {
    return (storageBinding ??= createStorage({
      origin: windowOrigin,
      href: initialDocumentURL,
      notify(change) {
        timers.setTimeout(() => {
          if (closed) return;
          window.dispatchEvent(
            events.trusted(
              new StorageEvent("storage", { ...change, storageArea: storage().get(change.kind) }),
            ),
          );
        });
      },
      quota: options.storageQuota ?? 5_000_000,
      QuotaExceededError,
      areas: sharedAreas(),
      subscription: frameStorage,
    }));
  }

  function windowStorage(kind: "local" | "session") {
    if (documentOrigin() === "null")
      throw new DOMException(`${kind}Storage is not available for opaque origins`, "SecurityError");
    return storage().get(kind);
  }

  let nodeFilter: Readonly<typeof nodeFilterConstants> | undefined;
  const performanceKey = Symbol();
  const performanceEntryKey = Symbol();
  type TextResourceLoader = NonNullable<WindowSettings["loadTextResource"]>;
  let resourceTimings: PerformanceResourceTiming[] | undefined;
  let resourceTimingLimit = 250;
  let resourceTimingOverflow: PerformanceResourceTiming[] | undefined;
  let droppedResourceTimings = 0;
  const performanceObserverKey = Symbol();
  let resourceObservers: Set<ResourceObserverState> | undefined;
  let performanceObserverTaskQueued = false;
  type ResourceObserverState = {
    records: PerformanceResourceTiming[];
    notify: () => void;
  };

  class PerformanceEntry {
    readonly #name: string;
    readonly #startTime: number;
    readonly #duration: number;

    constructor(key: symbol, name: string, startTime: number, duration: number) {
      if (key !== performanceEntryKey) throw new TypeError("Illegal constructor");
      this.#name = name;
      this.#startTime = startTime;
      this.#duration = duration;
    }
    get name(): string {
      return this.#name;
    }
    get entryType(): string {
      return "resource";
    }
    get startTime(): number {
      return this.#startTime;
    }
    get duration(): number {
      return this.#duration;
    }
    get [Symbol.toStringTag](): string {
      return "PerformanceEntry";
    }
    toJSON() {
      return {
        name: this.name,
        entryType: this.entryType,
        startTime: this.startTime,
        duration: this.duration,
      };
    }
  }

  class PerformanceResourceTiming extends PerformanceEntry {
    readonly #initiator: string;
    constructor(key: symbol, name: string, startTime: number, duration: number, initiator: string) {
      super(key, name, startTime, duration);
      this.#initiator = initiator;
    }
    get initiatorType(): string {
      return this.#initiator;
    }
    get responseEnd(): number {
      return this.startTime + this.duration;
    }
    override get [Symbol.toStringTag](): string {
      return "PerformanceResourceTiming";
    }
    override toJSON() {
      return {
        ...super.toJSON(),
        initiatorType: this.initiatorType,
        responseEnd: this.responseEnd,
      };
    }
  }

  class PerformanceObserverEntryList {
    readonly #entries: PerformanceResourceTiming[];

    constructor(key: symbol, entries: PerformanceResourceTiming[]) {
      if (key !== performanceObserverKey) throw new TypeError("Illegal constructor");
      this.#entries = entries.toSorted((a, b) => a.startTime - b.startTime);
    }
    getEntries(): PerformanceResourceTiming[] {
      return realmArray.from(this.#entries);
    }
    getEntriesByType(type: string): PerformanceResourceTiming[] {
      if (arguments.length === 0) throw new TypeError("An entry type is required");
      return `${type}` === "resource" ? realmArray.from(this.#entries) : realmArray.of();
    }
    getEntriesByName(name: string, type?: string): PerformanceResourceTiming[] {
      if (arguments.length === 0) throw new TypeError("An entry name is required");
      const requested = `${name}`;
      return type === undefined || `${type}` === "resource"
        ? realmArray.from(this.#entries.filter((entry) => entry.name === requested))
        : realmArray.of();
    }
    get [Symbol.toStringTag](): string {
      return "PerformanceObserverEntryList";
    }
  }

  type PerformanceObserverOptions = {
    entryTypes?: Iterable<string>;
    type?: string;
    buffered?: boolean;
  };
  type PerformanceObserverCallback = (
    entries: PerformanceObserverEntryList,
    observer: PerformanceObserver,
    options: { droppedEntriesCount?: number },
  ) => void;
  let supportedPerformanceEntryTypes: readonly string[] | undefined;

  class PerformanceObserver {
    #mode: "single" | "multiple" | undefined;
    #reportDropped = false;
    readonly #state: ResourceObserverState;

    constructor(callback: PerformanceObserverCallback) {
      if (typeof callback !== "function") throw new TypeError("Expected an observer callback");
      this.#state = { records: [], notify: () => this.#notify(callback) };
    }
    static get supportedEntryTypes(): readonly string[] {
      return (supportedPerformanceEntryTypes ??= Object.freeze(realmArray.of("resource")));
    }
    get [Symbol.toStringTag](): string {
      return "PerformanceObserver";
    }
    observe(options?: PerformanceObserverOptions | null): void {
      const state = this.#state;
      if (options != null && Object(options) !== options)
        throw new TypeError("Expected an observer options dictionary");
      const buffered = options?.buffered;
      const entryTypes = options?.entryTypes;
      if (entryTypes !== undefined && Object(entryTypes) !== entryTypes)
        throw new TypeError("Expected an iterable object for entryTypes");
      const types = entryTypes === undefined ? undefined : [...entryTypes].map((type) => `${type}`);
      const type = options?.type;
      const requested = type === undefined ? undefined : `${type}`;
      if (types === undefined && requested === undefined)
        throw new TypeError("An entry type is required");
      if (types !== undefined && (requested !== undefined || buffered !== undefined))
        throw new TypeError("entryTypes cannot be combined with type or buffered");
      const mode = types === undefined ? "single" : "multiple";
      if (this.#mode && this.#mode !== mode)
        throw new DOMException(
          "Cannot change performance observer mode",
          "InvalidModificationError",
        );
      this.#mode = mode;
      this.#reportDropped = true;
      if (closed || (types ? !types.includes("resource") : requested !== "resource")) return;
      (resourceObservers ??= new Set()).add(state);
      if (buffered && resourceTimings?.length) {
        for (const entry of resourceTimings) state.records.push(entry);
        queuePerformanceObserverTask();
      }
    }
    disconnect(): void {
      resourceObservers?.delete(this.#state);
      this.#state.records = [];
    }
    takeRecords(): PerformanceResourceTiming[] {
      const records = this.#state.records;
      this.#state.records = [];
      return realmArray.from(records);
    }
    #notify(callback: PerformanceObserverCallback): void {
      const { records } = this.#state;
      if (!records.length) return;
      this.#state.records = [];
      const options = this.#reportDropped ? { droppedEntriesCount: droppedResourceTimings } : {};
      this.#reportDropped = false;
      const list = new PerformanceObserverEntryList(performanceObserverKey, records);
      try {
        Reflect.apply(callback, this, [list, this, options]);
      } catch (cause) {
        reportCallbackException(callback, cause, reportRuntimeError);
      }
    }
  }

  function queuePerformanceObserverTask(): void {
    if (performanceObserverTaskQueued) return;
    performanceObserverTaskQueued = true;
    timers.setTimeout(() => {
      performanceObserverTaskQueued = false;
      if (resourceTimingOverflow) {
        queuePerformanceObserverTask();
        return;
      }
      if (!resourceObservers) return;
      for (const observer of [...resourceObservers]) {
        if (closed) return;
        observer.notify();
      }
    });
  }

  function flushResourceTimingOverflow(): void {
    const entries = resourceTimingOverflow;
    if (!entries) return;
    let index = 0;
    try {
      while (!closed && index < entries.length) {
        const pendingBefore = entries.length - index;
        if ((resourceTimings?.length ?? 0) >= resourceTimingLimit) {
          const target = (windowPerformance ??= new Performance(performanceKey));
          EventTarget.prototype.dispatchEvent.call(
            target,
            events.trusted(new Event("resourcetimingbufferfull")),
          );
        }
        if (closed) return;
        const room = resourceTimingLimit - (resourceTimings?.length ?? 0);
        if (room <= 0) return;
        const end = Math.min(entries.length, index + room);
        const buffer = (resourceTimings ??= []);
        for (; index < end; index++) {
          const entry = entries[index];
          if (entry) buffer.push(entry);
        }
        if (entries.length - index >= pendingBefore) return;
      }
    } finally {
      if (!closed) droppedResourceTimings += entries.length - index;
      resourceTimingOverflow = undefined;
    }
  }

  function addResourceTiming(entry: PerformanceResourceTiming): void {
    if (!resourceTimingOverflow && (resourceTimings?.length ?? 0) < resourceTimingLimit) {
      (resourceTimings ??= []).push(entry);
    } else {
      if (!resourceTimingOverflow) {
        resourceTimingOverflow = [];
        timers.setTimeout(flushResourceTimingOverflow);
      }
      resourceTimingOverflow.push(entry);
    }
    if (!resourceObservers?.size) return;
    for (const observer of resourceObservers) observer.records.push(entry);
    queuePerformanceObserverTask();
  }

  function recordResourceTiming(url: string, startTime: number, initiator: string): void {
    if (closed) return;
    const duration = relativeHighResolutionTime(windowStarted) - startTime;
    addResourceTiming(
      new PerformanceResourceTiming(performanceEntryKey, url, startTime, duration, initiator),
    );
  }

  function loadTimedTextResource(
    load: TextResourceLoader,
    request: Parameters<TextResourceLoader>[0],
    initiator: string,
  ): ReturnType<TextResourceLoader> {
    const startTime = relativeHighResolutionTime(windowStarted);
    const onResponseComplete = () => {
      if (!request.signal.aborted) recordResourceTiming(request.url, startTime, initiator);
    };
    return load({ ...request, onHTTPErrorResponse: onResponseComplete }).then((resource) => {
      onResponseComplete();
      return resource;
    });
  }

  class Performance extends EventTarget {
    constructor(key: symbol) {
      super();
      if (key !== performanceKey) throw new TypeError("Illegal constructor");
      performanceStarts.set(this, windowStarted);
    }
    get [Symbol.toStringTag](): string {
      return "Performance";
    }
    get timeOrigin(): number {
      return monotonicClock.timeOrigin + performanceStart(this);
    }
    now(): number {
      return relativeHighResolutionTime(performanceStart(this));
    }
    getEntries(): PerformanceResourceTiming[] {
      performanceStart(this);
      return resourceTimings?.toSorted((a, b) => a.startTime - b.startTime) ?? [];
    }
    getEntriesByType(type: string): PerformanceResourceTiming[] {
      performanceStart(this);
      return `${type}` === "resource" ? Performance.prototype.getEntries.call(this) : [];
    }
    getEntriesByName(name: string, type?: string): PerformanceResourceTiming[] {
      const requested = `${name}`;
      const entries = Performance.prototype.getEntries.call(this);
      return type === undefined || `${type}` === "resource"
        ? entries.filter((entry) => entry.name === requested)
        : [];
    }
    get onresourcetimingbufferfull(): Handler | null {
      performanceStart(this);
      return handlers.get(this, "resourcetimingbufferfull");
    }
    set onresourcetimingbufferfull(handler: Handler | null) {
      performanceStart(this);
      handlers.set(this, "resourcetimingbufferfull", handler);
    }
    setResourceTimingBufferSize(maxSize: number): void {
      performanceStart(this);
      if (arguments.length === 0) throw new TypeError("A resource timing buffer size is required");
      resourceTimingLimit = Number(maxSize) >>> 0;
    }
    clearResourceTimings(): void {
      performanceStart(this);
      resourceTimings = undefined;
    }
    toJSON(): { timeOrigin: number } {
      return { timeOrigin: monotonicClock.timeOrigin + performanceStart(this) };
    }
  }
  let windowPerformance: Performance | undefined;

  const cryptoKey = Symbol();
  class Crypto {
    constructor(key: symbol) {
      if (key !== cryptoKey) throw new TypeError("Illegal constructor");
      cryptoInstances.add(this);
    }
    get [Symbol.toStringTag](): string {
      return "Crypto";
    }
    getRandomValues<T extends ArrayBufferView>(array: T): T {
      if (!cryptoInstances.has(this)) throw new TypeError("Expected a Crypto");
      if (!ArrayBuffer.isView(array)) throw new TypeError("Expected an ArrayBufferView");
      const buffer: ArrayBufferLike = Reflect.get(
        types.isDataView(array) ? DataView.prototype : typedArrayPrototype,
        "buffer",
        array,
      );
      if (types.isSharedArrayBuffer(buffer)) throw new TypeError("Expected an unshared buffer");
      if (Reflect.get(ArrayBuffer.prototype, "detached", buffer))
        throw new TypeError("Expected an attached buffer");
      const tag: string = Reflect.get(typedArrayPrototype, Symbol.toStringTag, array);
      if (!integerArrayTags.has(tag))
        throw new DOMException(
          "getRandomValues() only accepts integer typed arrays",
          "TypeMismatchError",
        );
      const byteLength: number = Reflect.get(typedArrayPrototype, "byteLength", array);
      if (byteLength > 65536)
        throw new QuotaExceededError(
          `getRandomValues() cannot generate more than 65536 bytes of random values; ${byteLength} bytes were requested`,
        );
      const byteOffset: number = Reflect.get(typedArrayPrototype, "byteOffset", array);
      randomFillSync(new Uint8Array(buffer, byteOffset, byteLength));
      return array;
    }
    randomUUID(): string {
      if (!cryptoInstances.has(this)) throw new TypeError("Expected a Crypto");
      return randomUUID();
    }
  }
  let crypto: Crypto | undefined;

  const screenKey = Symbol();
  class Screen {
    constructor(key: symbol) {
      if (key !== screenKey) throw new TypeError("Illegal constructor");
    }
    get [Symbol.toStringTag](): string {
      return "Screen";
    }
    get availWidth(): number {
      return 0;
    }
    get availHeight(): number {
      return 0;
    }
    get width(): number {
      return 0;
    }
    get height(): number {
      return 0;
    }
    get colorDepth(): number {
      return 24;
    }
    get pixelDepth(): number {
      return 24;
    }
  }
  let screen: Screen | undefined;

  function postMessage(message: unknown, targetOrigin: string): void {
    if (arguments.length < 2)
      throw new TypeError("'postMessage' requires 2 arguments: 'message' and 'targetOrigin'");
    if (typeof targetOrigin === "symbol")
      throw new TypeError("Cannot convert a Symbol to a string");
    const target = String(targetOrigin);
    // The pinned jsdom contract accepts an explicit origin or a wildcard.
    if (target === "/") return;
    if (target !== "*") {
      const parsed = URL.parse(target);
      if (!parsed)
        throw new DOMException(
          `Failed to execute 'postMessage' on 'Window': Invalid target origin '${target}' in a call to 'postMessage'.`,
          "SyntaxError",
        );
      if (parsed.origin !== documentOrigin()) return;
    }
    timers.setTimeout(() => {
      window.dispatchEvent(events.createPostedMessage(message));
    });
  }

  let abortInterfaces: ReturnType<typeof events.createAbortInterfaces> | undefined;

  const mediaQueryKey = Symbol();
  type MediaQueryListener = Parameters<InstanceType<typeof EventTarget>["addEventListener"]>[1];
  type MediaQueryState = ReturnType<typeof parseMediaQuery> & { previous: boolean };
  const mediaQueryStates = new WeakMap<MediaQueryList, MediaQueryState>();
  let mediaQueries: Set<WeakRef<MediaQueryList>> | undefined;
  let mediaQueryFinalizer: FinalizationRegistry<WeakRef<MediaQueryList>> | undefined;

  function frameViewportDimension(axis: "width" | "height"): number | undefined {
    // jsdom frames expose the default headless viewport independently of their container.
    if (options.jsdomCompatibility) return undefined;
    const frame = options.frameElement && nodeRecord(options.frameElement)?.node;
    if (!frame || !tree.isElementNode(frame) || frame.tagName !== "iframe") return undefined;
    const value = attribute(frame, axis)?.trim();
    if (!value || !/^\d+$/.test(value)) return axis === "width" ? 300 : 150;
    return Number(value);
  }

  function mediaViewport() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      resolution: window.devicePixelRatio,
    };
  }

  function notifyMediaQueries(): void {
    const viewport = mediaViewport();
    for (const reference of mediaQueries ?? []) {
      const query = reference.deref();
      const state = query && mediaQueryStates.get(query);
      if (!query || !state) continue;
      const matches = state.matches(viewport);
      if (state.previous === matches) continue;
      state.previous = matches;
      EventTarget.prototype.dispatchEvent.call(
        query,
        events.trusted(new MediaQueryListEvent("change", { media: state.media, matches })),
      );
    }
  }

  class MediaQueryListEvent extends Event {
    readonly #media: string;
    readonly #matches: boolean;
    constructor(
      type: string,
      init?: {
        bubbles?: boolean;
        cancelable?: boolean;
        composed?: boolean;
        media?: string;
        matches?: boolean;
      },
    ) {
      if (arguments.length === 0) throw new TypeError("Expected an event type");
      super(type, init);
      this.#media = init?.media === undefined ? "" : `${init.media}`;
      this.#matches = Boolean(init?.matches);
    }
    get media(): string {
      return this.#media;
    }
    get matches(): boolean {
      return this.#matches;
    }
    override get [Symbol.toStringTag](): string {
      return "MediaQueryListEvent";
    }
  }

  class MediaQueryList extends EventTarget {
    constructor(key: symbol, query: ReturnType<typeof parseMediaQuery>) {
      super();
      if (key !== mediaQueryKey) throw new TypeError("Illegal constructor");
      mediaQueryStates.set(this, { ...query, previous: query.matches(mediaViewport()) });
    }
    #state(): MediaQueryState {
      const state = mediaQueryStates.get(this);
      if (!state) throw new TypeError("Expected a MediaQueryList");
      return state;
    }
    get media(): string {
      return this.#state().media;
    }
    get matches(): boolean {
      return this.#state().matches(mediaViewport());
    }
    get onchange(): Handler | null {
      return handlers.get(this, "change");
    }
    set onchange(handler: Handler | null) {
      handlers.set(this, "change", handler);
    }
    addListener(listener: MediaQueryListener): void {
      EventTarget.prototype.addEventListener.call(this, "change", listener);
    }
    removeListener(listener: MediaQueryListener): void {
      EventTarget.prototype.removeEventListener.call(this, "change", listener);
    }
    get [Symbol.toStringTag](): string {
      return "MediaQueryList";
    }
  }

  function convertBase64(
    value: string,
    convert: (value: string) => string,
    operation: "decoded" | "encoded",
  ): string {
    try {
      return convert(value);
    } catch {
      // The jsdom facade reports malformed input and failed coercion as the same DOM exception.
      throw new DOMException(
        `The string to be ${operation} contains invalid characters.`,
        "InvalidCharacterError",
      );
    }
  }

  class BarProp {
    #brand = true;

    constructor(key: symbol) {
      if (key !== token) throw new TypeError("Illegal constructor");
    }
    get visible(): boolean {
      return this.#brand;
    }
    get [Symbol.toStringTag](): string {
      return "BarProp";
    }
  }

  class External {
    #brand = true;

    constructor(key: symbol) {
      if (key !== token) throw new TypeError("Illegal constructor");
    }
    AddSearchProvider(): undefined {
      if (!this.#brand) throw new TypeError("Expected an External");
      return undefined;
    }
    IsSearchProviderInstalled(): undefined {
      if (!this.#brand) throw new TypeError("Expected an External");
      return undefined;
    }
    get [Symbol.toStringTag](): string {
      return "External";
    }
  }

  function windowControl(receiver: unknown) {
    const target = receiver == null ? window : receiver;
    const control = typeof target === "object" && target !== null && windowControls.get(target);
    if (!control) throw new TypeError("Expected a Window");
    return control;
  }

  function cancelResourceRequests(): void {
    const controller = resourceAbort;
    if (!controller) return;
    controller.abort();
    // Node keeps the calling Window alive through an abort reason's lazy stack.
    // A page-supplied formatter can throw after cancellation has completed.
    try {
      void controller.signal.reason.stack;
    } catch {}
  }

  function stopWindow(): void {
    const stoppingLoad = readyState !== "complete" && !documentLoadStopped;
    if (stoppingLoad) {
      stopActiveParser?.();
      stopActiveParser = undefined;
      documentLoadStopped = true;
      cancelScheduledLoads();
    }
    cancelResourceRequests();
    resourceAbort = undefined;
    if (stoppingLoad) options.frameClosed?.();
  }

  class WindowMembers extends EventTarget {
    // Window receives hundreds of descriptors after these fields. Start in
    // dictionary mode so V8 does not build a long chain of property transitions.
    #bindings = WindowMembers.#prepareBindings(this);
    static #prepareBindings(bindings: object): void {
      const [first, second] = windowShapeKeys;
      Object.defineProperty(bindings, first, { value: true, configurable: true });
      Object.defineProperty(bindings, second, { value: true, configurable: true });
      Reflect.deleteProperty(bindings, first);
      Reflect.deleteProperty(bindings, second);
    }
    get [Symbol.toStringTag](): string {
      return "Window";
    }
    declare name: string;
    declare status: string;
    declare BarProp: typeof BarProp;
    declare External: typeof External;
    declare external: External;
    declare locationbar: BarProp;
    declare menubar: BarProp;
    declare personalbar: BarProp;
    declare scrollbars: BarProp;
    declare statusbar: BarProp;
    declare toolbar: BarProp;
    declare HTMLDocument: typeof Document;
    declare TextEncoder: ReturnType<typeof createTextEncoding>["TextEncoder"];
    declare TextDecoder: ReturnType<typeof createTextEncoding>["TextDecoder"];
    declare TextEncoderStream: ReturnType<typeof createTextEncoding>["TextEncoderStream"];
    declare TextDecoderStream: ReturnType<typeof createTextEncoding>["TextDecoderStream"];
    declare webkitURL: ReturnType<typeof createBlobURLs>["URL"];
    readonly [index: number]: ChildRealm["window"] | undefined;
    declare innerWidth: number;
    declare innerHeight: number;
    declare outerWidth: number;
    declare outerHeight: number;
    declare devicePixelRatio: number;
    declare scrollX: number;
    declare scrollY: number;
    declare pageXOffset: number;
    declare pageYOffset: number;
    declare screenX: number;
    declare screenY: number;
    declare screenLeft: number;
    declare screenTop: number;
    declare screen: Screen;
    declare readonly performance: Performance;
    readonly Performance = Performance;
    readonly PerformanceEntry = PerformanceEntry;
    readonly PerformanceResourceTiming = PerformanceResourceTiming;
    readonly PerformanceObserver = PerformanceObserver;
    readonly PerformanceObserverEntryList = PerformanceObserverEntryList;
    declare readonly crypto: Crypto;
    readonly Crypto = Crypto;
    readonly QuotaExceededError = QuotaExceededError;
    readonly Screen = Screen;
    get CSS() {
      return styles().css();
    }
    get CSSRule() {
      return styles().CSSRule;
    }
    get CSSRuleList() {
      return styles().CSSRuleList;
    }
    get CSSStyleRule() {
      return styles().CSSStyleRule;
    }
    get CSSNestedDeclarations() {
      return styles().CSSNestedDeclarations;
    }
    get CSSImportRule() {
      return styles().CSSImportRule;
    }
    get CSSGroupingRule() {
      return styles().CSSGroupingRule;
    }
    get CSSConditionRule() {
      return styles().CSSConditionRule;
    }
    get CSSScopeRule() {
      return styles().CSSScopeRule;
    }
    get CSSContainerRule() {
      return styles().CSSContainerRule;
    }
    get CSSSupportsRule() {
      return styles().CSSSupportsRule;
    }
    get CSSMediaRule() {
      return styles().CSSMediaRule;
    }
    get CSSPropertyRule() {
      return styles().CSSPropertyRule;
    }
    get CSSPositionTryDescriptors() {
      return styles().CSSPositionTryDescriptors;
    }
    get CSSPositionTryRule() {
      return styles().CSSPositionTryRule;
    }
    get CSSFunctionRule() {
      return styles().CSSFunctionRule;
    }
    get CSSFunctionDescriptors() {
      return styles().CSSFunctionDescriptors;
    }
    get CSSFunctionDeclarations() {
      return styles().CSSFunctionDeclarations;
    }
    get CSSFontFaceDescriptors() {
      return styles().CSSFontFaceDescriptors;
    }
    get CSSFontFeatureValuesRule() {
      return styles().CSSFontFeatureValuesRule;
    }
    get CSSFontFaceRule() {
      return styles().CSSFontFaceRule;
    }
    get CSSKeyframesRule() {
      return styles().CSSKeyframesRule;
    }
    get CSSKeyframeRule() {
      return styles().CSSKeyframeRule;
    }
    get CSSPageRule() {
      return styles().CSSPageRule;
    }
    get CSSCounterStyleRule() {
      return styles().CSSCounterStyleRule;
    }
    get CSSNamespaceRule() {
      return styles().CSSNamespaceRule;
    }
    get CSSStartingStyleRule() {
      return styles().CSSStartingStyleRule;
    }
    get CSSLayerBlockRule() {
      return styles().CSSLayerBlockRule;
    }
    get CSSLayerStatementRule() {
      return styles().CSSLayerStatementRule;
    }
    get CSSStyleDeclaration() {
      return styles().CSSStyleDeclaration;
    }
    get CSSStyleProperties() {
      return styles().CSSStyleProperties;
    }
    get StyleSheet() {
      return styles().StyleSheet;
    }
    readonly DOMException = DOMException;
    readonly atob = (value: string): string => convertBase64(value, decodeBase64, "decoded");
    readonly btoa = (value: string): string => convertBase64(value, encodeBase64, "encoded");
    get WebSocket(): SocketConstructor {
      return (socketClass ??= createWindowSocketClass());
    }
    get MediaList() {
      return styles().MediaList;
    }
    get StyleSheetList() {
      return styles().StyleSheetList;
    }
    get CSSStyleSheet() {
      return styles().CSSStyleSheet;
    }
    readonly StorageEvent = StorageEvent;
    get Storage() {
      return storage().Storage;
    }
    get localStorage() {
      return windowStorage("local");
    }
    get sessionStorage() {
      return windowStorage("session");
    }
    readonly ErrorEvent = ErrorEvent;
    declare requestAnimationFrame: typeof requestAnimationFrame | undefined;
    declare cancelAnimationFrame: typeof cancelAnimationFrame | undefined;
    declare onerror: WindowErrorHandler | null;
    readonly postMessage = postMessage;
    readonly fetch = fetchFromWindow;
    get Request() {
      return requestConstructor();
    }
    get Response() {
      return globalThis.Response;
    }
    get Headers() {
      return globalThis.Headers;
    }
    get ReadableStream() {
      return globalThis.ReadableStream;
    }
    get WritableStream() {
      return globalThis.WritableStream;
    }
    get TransformStream() {
      return globalThis.TransformStream;
    }
    get XMLHttpRequest() {
      return xhr().XMLHttpRequest;
    }
    get XMLHttpRequestEventTarget() {
      return xhr().XMLHttpRequestEventTarget;
    }
    get XMLHttpRequestUpload() {
      return xhr().XMLHttpRequestUpload;
    }
    get ProgressEvent() {
      return xhr().ProgressEvent;
    }
    get XPathEvaluator() {
      return xpath().XPathEvaluator;
    }
    get XPathExpression() {
      return xpath().XPathExpression;
    }
    get XPathResult() {
      return xpath().XPathResult;
    }
    readonly XPathException = XPathException;
    get Plugin() {
      return navigatorPlugins().Plugin;
    }
    get MimeType() {
      return navigatorPlugins().MimeType;
    }
    get PluginArray() {
      return navigatorPlugins().PluginArray;
    }
    get MimeTypeArray() {
      return navigatorPlugins().MimeTypeArray;
    }
    readonly Navigator = Navigator;
    get navigator(): Navigator {
      return (navigator ??= new Navigator(navigatorKey));
    }
    get top(): unknown {
      return top;
    }
    get location(): Location {
      return getLocation();
    }
    set location(value: string) {
      getLocation().href = value;
    }
    declare origin: string;
    declare event: InstanceType<typeof Event> | undefined;
    declare readonly frameElement: object | null;
    declare eval: (source: string) => unknown;
    get console(): ReturnType<typeof getConsole> {
      return getConsole();
    }
    readonly queueMicrotask = (callback: () => void): void => {
      if (typeof callback !== "function") throw new TypeError("A microtask callback is required");
      queueMicrotask(() => {
        if (closed) return;
        try {
          callback();
        } catch (cause) {
          reportCallbackException(callback, cause, reportRuntimeError);
        }
      });
    };
    readonly setTimeout = timers.setTimeout;
    readonly setInterval = timers.setInterval;
    readonly clearTimeout = timers.cancel;
    readonly clearInterval = timers.cancel;
    readonly Window = Window;
    get Location(): typeof Location {
      getLocation();
      return Location;
    }
    readonly HashChangeEvent = HashChangeEvent;
    get document(): Document {
      return document;
    }
    readonly CustomElementRegistry = CustomElementRegistry;
    readonly DOMStringMap = DOMStringMap;
    declare readonly SVGElement: typeof SVGElement;
    declare readonly SVGGraphicsElement: typeof SVGGraphicsElement;
    declare readonly SVGStringList: typeof SVGStringList;
    declare readonly SVGSVGElement: typeof SVGSVGElement;
    declare readonly SVGNumber: typeof SVGNumber;
    declare readonly SVGRect: typeof SVGRect;
    declare readonly SVGAnimatedRect: typeof SVGAnimatedRect;
    declare readonly SVGPreserveAspectRatio: typeof SVGPreserveAspectRatio;
    declare readonly SVGAnimatedPreserveAspectRatio: typeof SVGAnimatedPreserveAspectRatio;
    declare readonly SVGAnimatedString: typeof SVGAnimatedString;
    declare readonly SVGDefsElement: typeof SVGDefsElement;
    declare readonly SVGGElement: typeof SVGGElement;
    declare readonly SVGSwitchElement: typeof SVGSwitchElement;
    declare readonly SVGSymbolElement: typeof SVGSymbolElement;
    declare readonly SVGDescElement: typeof SVGDescElement;
    declare readonly SVGMetadataElement: typeof SVGMetadataElement;
    declare readonly SVGTitleElement: typeof SVGTitleElement;
    get customElements(): CustomElementRegistry {
      return (customRegistry ??= new CustomElementRegistry(token));
    }
    readonly Event = Event;
    readonly BeforeUnloadEvent = BeforeUnloadEvent;
    readonly DeviceMotionEvent = DeviceMotionEvent;
    readonly DeviceMotionEventAcceleration = DeviceMotionEventAcceleration;
    readonly DeviceMotionEventRotationRate = DeviceMotionEventRotationRate;
    readonly DeviceOrientationEvent = DeviceOrientationEvent;
    readonly SubmitEvent = SubmitEvent;
    readonly ToggleEvent = ToggleEvent;
    get FormData() {
      return formDataConstructor();
    }
    readonly FormDataEvent = FormDataEvent;
    get Blob() {
      return NodeBlob;
    }
    get FileReader() {
      return fileReader();
    }
    get FileList() {
      return filesAPI().FileList;
    }
    get DataTransfer() {
      return filesAPI().DataTransfer;
    }
    get DataTransferItem() {
      return filesAPI().DataTransferItem;
    }
    get DataTransferItemList() {
      return filesAPI().DataTransferItemList;
    }
    get File() {
      return NodeFile;
    }
    get URL() {
      return blobs().URL;
    }
    readonly URLSearchParams = URLSearchParams;
    readonly ValidityState = ValidityState;
    readonly CustomEvent = CustomEvent;
    readonly UIEvent = UIEvent;
    readonly FocusEvent = FocusEvent;
    readonly MouseEvent = MouseEvent;
    readonly WheelEvent = WheelEvent;
    readonly TouchEvent = TouchEvent;
    readonly PointerEvent = PointerEvent;
    readonly KeyboardEvent = KeyboardEvent;
    get MessageChannel() {
      return channels().MessageChannel;
    }
    get MessagePort() {
      return channels().MessagePort;
    }
    readonly MessageEvent = MessageEvent;
    readonly CompositionEvent = CompositionEvent;
    readonly InputEvent = InputEvent;
    readonly CloseEvent = CloseEvent;
    readonly TransitionEvent = TransitionEvent;
    readonly PageTransitionEvent = PageTransitionEvent;
    readonly BlobEvent = BlobEvent;
    readonly PromiseRejectionEvent = PromiseRejectionEvent;
    readonly EventTarget = EventTarget;
    readonly Node = Node;
    readonly NodeList = NodeList;
    readonly HTMLCollection = HTMLCollection;
    readonly HTMLOptionsCollection = HTMLOptionsCollection;
    readonly HTMLFormControlsCollection = HTMLFormControlsCollection;
    readonly RadioNodeList = RadioNodeList;
    get MutationObserver() {
      return observers().MutationObserver;
    }
    get MutationRecord() {
      return observers().MutationRecord;
    }
    readonly Element = Element;
    readonly Attr = Attr;
    readonly NamedNodeMap = NamedNodeMap;
    readonly HTMLElement = HTMLElement;
    readonly CustomStateSet = CustomStateSet;
    get ElementInternals() {
      installInternalsAria();
      return ElementInternals;
    }
    readonly HTMLSelectElement = HTMLSelectElement;
    readonly HTMLLabelElement = HTMLLabelElement;
    readonly HTMLLegendElement = HTMLLegendElement;
    readonly HTMLDataListElement = HTMLDataListElement;
    readonly HTMLMeterElement = HTMLMeterElement;
    readonly HTMLProgressElement = HTMLProgressElement;
    readonly HTMLOptGroupElement = HTMLOptGroupElement;
    readonly HTMLOptionElement = HTMLOptionElement;
    readonly Option = Option as typeof Option & {
      new (...args: Parameters<typeof Option>): HTMLOptionElement;
    };
    readonly HTMLImageElement = HTMLImageElement;
    readonly HTMLCanvasElement = HTMLCanvasElement;
    readonly HTMLEmbedElement = HTMLEmbedElement;
    readonly HTMLObjectElement = HTMLObjectElement;
    readonly HTMLSourceElement = HTMLSourceElement;
    readonly HTMLTrackElement = HTMLTrackElement;
    readonly HTMLMediaElement = HTMLMediaElement;
    readonly HTMLAudioElement = HTMLAudioElement;
    readonly HTMLVideoElement = HTMLVideoElement;
    declare readonly Audio: typeof Audio & {
      new (...args: Parameters<typeof Audio>): HTMLAudioElement;
    };
    readonly HTMLParamElement = HTMLParamElement;
    readonly HTMLPictureElement = HTMLPictureElement;
    declare readonly Image: typeof Image & {
      new (...args: Parameters<typeof Image>): HTMLImageElement;
    };
    readonly HTMLAnchorElement = HTMLAnchorElement;
    readonly HTMLAreaElement = HTMLAreaElement;
    readonly HTMLMapElement = HTMLMapElement;
    get AbortController() {
      return (abortInterfaces ??= events.createAbortInterfaces(timers.setTimeout)).AbortController;
    }
    get AbortSignal() {
      return (abortInterfaces ??= events.createAbortInterfaces(timers.setTimeout)).AbortSignal;
    }
    readonly HTMLScriptElement = HTMLScriptElement;
    readonly HTMLHtmlElement = HTMLHtmlElement;
    readonly HTMLHeadElement = HTMLHeadElement;
    readonly HTMLBaseElement = HTMLBaseElement;
    readonly HTMLMetaElement = HTMLMetaElement;
    readonly HTMLModElement = HTMLModElement;
    readonly HTMLDataElement = HTMLDataElement;
    readonly HTMLTimeElement = HTMLTimeElement;
    readonly HTMLDirectoryElement = HTMLDirectoryElement;
    readonly HTMLFontElement = HTMLFontElement;
    declare readonly HTMLMarqueeElement: typeof HTMLMarqueeElement;
    readonly HTMLTitleElement = HTMLTitleElement;
    readonly HTMLDetailsElement = HTMLDetailsElement;
    readonly HTMLDialogElement = HTMLDialogElement;
    readonly HTMLBodyElement = HTMLBodyElement;
    readonly HTMLFrameSetElement = HTMLFrameSetElement;
    readonly HTMLInputElement = HTMLInputElement;
    readonly HTMLTextAreaElement = HTMLTextAreaElement;
    readonly HTMLOutputElement = HTMLOutputElement;
    readonly HTMLFormElement = HTMLFormElement;
    readonly HTMLFieldSetElement = HTMLFieldSetElement;
    readonly HTMLButtonElement = HTMLButtonElement;
    declare readonly DOMTokenList: typeof DOMTokenList;
    readonly HTMLDivElement = HTMLDivElement;
    readonly HTMLUnknownElement = HTMLUnknownElement;
    readonly HTMLSlotElement = HTMLSlotElement;
    readonly HTMLParagraphElement = HTMLParagraphElement;
    readonly HTMLTableElement = HTMLTableElement;
    readonly HTMLTableCaptionElement = HTMLTableCaptionElement;
    readonly HTMLTableColElement = HTMLTableColElement;
    readonly HTMLTableSectionElement = HTMLTableSectionElement;
    readonly HTMLTableRowElement = HTMLTableRowElement;
    readonly HTMLTableCellElement = HTMLTableCellElement;
    readonly HTMLSpanElement = HTMLSpanElement;
    readonly HTMLHeadingElement = HTMLHeadingElement;
    readonly HTMLUListElement = HTMLUListElement;
    readonly HTMLOListElement = HTMLOListElement;
    readonly HTMLLIElement = HTMLLIElement;
    readonly HTMLDListElement = HTMLDListElement;
    readonly HTMLMenuElement = HTMLMenuElement;
    readonly HTMLPreElement = HTMLPreElement;
    readonly HTMLBRElement = HTMLBRElement;
    readonly HTMLHRElement = HTMLHRElement;
    readonly HTMLQuoteElement = HTMLQuoteElement;
    readonly DOMParser = DOMParser;
    readonly DOMRectReadOnly = DOMRectReadOnly;
    readonly DOMRect = DOMRect;
    readonly XMLSerializer = XMLSerializer;
    readonly HTMLTemplateElement = HTMLTemplateElement;
    readonly HTMLFrameElement = HTMLFrameElement;
    readonly HTMLIFrameElement = HTMLIFrameElement;
    get frames(): this {
      return this;
    }
    get length(): number {
      return frameCount;
    }
    get parent(): object {
      return options.frameParent ?? this;
    }
    readonly HTMLLinkElement = HTMLLinkElement;
    readonly HTMLStyleElement = HTMLStyleElement;
    readonly MediaQueryList = MediaQueryList;
    readonly MediaQueryListEvent = MediaQueryListEvent;
    matchMedia(query: string): MediaQueryList {
      if (arguments.length === 0) throw new TypeError("A media query is required");
      const list = new MediaQueryList(mediaQueryKey, parseMediaQuery(`${query}`));
      if (!mediaQueries) {
        mediaQueries = new Set();
        mediaQueryFinalizer = new FinalizationRegistry((ref) => mediaQueries?.delete(ref));
        EventTarget.prototype.addEventListener.call(window, "resize", notifyMediaQueries);
        if (options.frameElement) {
          let pending = false;
          notifyFrameMedia.set(window, () => {
            if (pending) return;
            pending = true;
            timers.setTimeout(() => {
              pending = false;
              notifyMediaQueries();
            });
          });
        }
      }
      const reference = new WeakRef(list);
      mediaQueries.add(reference);
      mediaQueryFinalizer?.register(list, reference);
      return list;
    }
    getComputedStyle(node: Element, pseudoElement: unknown = undefined) {
      const record = element(node);
      if (closed) styles().closeComputed();
      const text = pseudoElement == null ? "" : domString(pseudoElement);
      const pseudo = text.startsWith(":") ? styles().computedPseudoTarget(text) : undefined;
      return styles().liveView(
        record,
        () => {
          if (closed || pseudo === null) return;
          const scope = styleScope(record);
          if (!scope || !isDocumentRecord(treeRoot(record, true))) return;
          const owner = actualOwnerRecord(record);
          const realm = documentRealms.get(owner);
          const foreign = realm && realm !== token && realmTreeOperations.get(realm)?.computedStyle;
          if (pseudo)
            return foreign
              ? foreign(record, scope, pseudo)
              : styles().pseudoStyle(record, scope, pseudo);
          return foreign ? foreign(record, scope) : styles().computedStyle(record, scope);
        },
        pseudo,
      );
    }
    readonly DocumentFragment = DocumentFragment;
    readonly ShadowRoot = ShadowRoot;
    readonly AbstractRange = AbstractRange;
    readonly StaticRange = StaticRange;
    readonly Range = Range;
    readonly Selection = Selection;
    getSelection(): Selection | null {
      return documentSelection();
    }
    get NodeIterator() {
      return traversal().NodeIterator;
    }
    get TreeWalker() {
      return traversal().TreeWalker;
    }
    get NodeFilter() {
      return (nodeFilter ??= Object.freeze({ ...nodeFilterConstants }));
    }
    readonly PopStateEvent = PopStateEvent;
    get history() {
      return navigation().history;
    }
    get History() {
      return navigation().History;
    }
    readonly CharacterData = CharacterData;
    readonly Text = Text;
    readonly Comment = Comment;
    readonly CDATASection = CDATASection;
    readonly ProcessingInstruction = ProcessingInstruction;
    readonly Document = Document;
    readonly XMLDocument = XMLDocument;
    readonly DocumentType = DocumentType;
    readonly DOMImplementation = DOMImplementation;
    get window(): this {
      return this;
    }
    get self(): this {
      return this;
    }
    stop(): void {
      windowControl(this).stop();
    }
    close(): void {
      windowControl(this).close();
    }
  }
  class Window extends EventTarget {
    constructor() {
      super();
      const Exception: TypeErrorConstructor = context
        ? Reflect.get(context, "TypeError")
        : TypeError;
      throw new Exception("Illegal constructor");
    }
    get [Symbol.toStringTag](): string {
      return "Window";
    }
  }

  function installWindowProperties(): void {
    let indexedRevision = -1;
    let index: Map<string, WeakRef<Raw.Element>[]> | undefined;
    function named(name: string): WeakRef<Raw.Element>[] | undefined {
      if (indexedRevision !== revision) {
        index = undefined;
        for (const node of descendants(source)) {
          if (!tree.isElementNode(node)) continue;
          const [id, elementName] = namesForWindow(node);
          // A closed child retains its document, but its frames no longer have browsing contexts.
          const name = closed && isFrame(node) ? null : elementName;
          if (!id && !name) continue;
          const ref = new WeakRef(node);
          if (id) add(id, ref);
          if (name && name !== id) add(name, ref);
        }
        indexedRevision = revision;
      }
      return index?.get(name);
    }
    function add(name: string, ref: WeakRef<Raw.Element>): void {
      const entries = index?.get(name);
      if (entries) entries.push(ref);
      else (index ??= new Map()).set(name, [ref]);
    }
    function resolve(name: string): object | undefined {
      const entries = named(name);
      if (!entries) return undefined;
      for (const entry of entries) {
        const node = entry.deref();
        if (!node || !isFrame(node) || attribute(node, "name") !== name) continue;
        if (!frameStates.has(node)) startFrame(node);
        const state = frameStates.get(node);
        if (state) return state.realm.window;
      }
      if (entries.length === 1) {
        const node = entries[0]?.deref();
        return node ? wrapElement(node) : undefined;
      }
      return new HTMLCollection(token, {
        length: () => named(name)?.length ?? 0,
        at(position) {
          const node = named(name)?.[position]?.deref();
          return node ? wrapElement(node) : undefined;
        },
      });
    }

    const target: object = Object.create(EventTarget.prototype, {
      [Symbol.toStringTag]: { value: "WindowProperties", configurable: true },
    });
    const visibleName = (key: PropertyKey): key is string =>
      typeof key === "string" && !Reflect.has(target, key);
    const properties = new Proxy(target, {
      has(target, key) {
        return Reflect.has(target, key) || (visibleName(key) && named(key) !== undefined);
      },
      get(target, key, receiver) {
        return visibleName(key) ? resolve(key) : Reflect.get(target, key, receiver);
      },
      getOwnPropertyDescriptor(target, key) {
        if (visibleName(key)) {
          const value = resolve(key);
          if (value) return { value, writable: true, configurable: true, enumerable: false };
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
      defineProperty: () => false,
      deleteProperty: () => false,
      setPrototypeOf: () => false,
      preventExtensions: () => false,
    });
    Object.setPrototypeOf(Window.prototype, properties);
  }

  interface HTMLElement extends HandlerProperties<GlobalHandlerName, Handler> {}
  interface SVGElement extends HandlerProperties<GlobalHandlerName, Handler> {}
  interface Document extends HandlerProperties<
    GlobalHandlerName | (typeof documentHandlerEvents)[number],
    Handler
  > {}
  interface Window extends WindowMembers {}
  interface WindowMembers
    extends
      HandlerProperties<Exclude<GlobalHandlerName, "error"> | WindowHandlerName, Handler>,
      UnsupportedWindowMethods {}

  nodeHandlerTables.set(token, { handlers, ownerRecord });
  Object.defineProperty(Element.prototype, "webkitMatchesSelector", { enumerable: true });
  Object.defineProperty(CharacterData.prototype, "previousElementSibling", { enumerable: true });
  Object.defineProperty(CharacterData.prototype, "nextElementSibling", { enumerable: true });
  Object.defineProperty(HTMLIFrameElement.prototype, "getSVGDocument", { enumerable: true });
  if (options.jsdomCompatibility) {
    Reflect.deleteProperty(HTMLElement.prototype, "inert");
    Reflect.deleteProperty(WindowMembers.prototype, "matchMedia");
  }
  Object.defineProperty(HTMLElement.prototype, "nonce", { enumerable: true });
  Object.defineProperty(SVGElement.prototype, "nonce", { enumerable: true });
  // These prototypes receive the complete global event handler descriptor table.
  for (const prototype of [HTMLElement.prototype, SVGElement.prototype, Document.prototype]) {
    const [first, second] = windowShapeKeys;
    Object.defineProperty(prototype, first, { value: true, configurable: true });
    Object.defineProperty(prototype, second, { value: true, configurable: true });
    Reflect.deleteProperty(prototype, first);
    Reflect.deleteProperty(prototype, second);
  }
  installInterfaceTable(HTMLElement.prototype, globalHandlerDescriptors);
  installInterfaceTable(SVGElement.prototype, globalHandlerDescriptors);
  installInterfaceTable(Document.prototype, documentHandlerDescriptors);
  installInterfaceTable(HTMLBodyElement.prototype, bodyHandlerDescriptors);
  installInterfaceTable(HTMLFrameSetElement.prototype, bodyHandlerDescriptors);
  installInterfaceTable(Element.prototype, elementAriaDescriptors);
  installAriaReferences(Element.prototype, false);
  const childUnscopables = ["before", "after", "replaceWith", "remove"];
  const parentUnscopables = ["prepend", "append", "replaceChildren"];
  for (const [prototype, names] of [
    [Element.prototype, ["slot", ...childUnscopables, ...parentUnscopables]],
    [CharacterData.prototype, childUnscopables],
    [DocumentType.prototype, childUnscopables],
    [Document.prototype, parentUnscopables],
    [DocumentFragment.prototype, parentUnscopables],
  ] as const) {
    Object.defineProperty(prototype, Symbol.unscopables, {
      value: Object.assign(
        Object.create(null),
        Object.fromEntries(names.map((name) => [name, true])),
      ),
      configurable: true,
    });
  }
  installWindowProperties();
  const nativeGetComputedStyle = WindowMembers.prototype.getComputedStyle;
  const windowMemberDescriptors = Object.getOwnPropertyDescriptors(WindowMembers.prototype);
  // Allocate with the public prototype from the outset. Switching a populated
  // member holder's prototype makes subsequent global descriptor installation costly.
  const bindings = construct(WindowMembers, [], Window) as WindowMembers;
  const context =
    options.runScripts === undefined ? null : createScriptRealm(bindings, reportRuntimeError);
  const window: Window = context ?? bindings;
  // The private member holder is never the public prototype. Install globals
  // together instead of repeatedly deleting the holder's prototype properties.
  const globals: PropertyDescriptorMap = {};
  for (const [name, descriptor] of Object.entries(windowMemberDescriptors)) {
    if (name === "constructor" || Object.hasOwn(window, name)) continue;
    descriptor.enumerable = name === "XPathException" || !/^[A-Z]/.test(name);
    globals[name] = descriptor;
  }
  if (options.pretendToBeVisual) {
    globals.requestAnimationFrame = {
      value: requestAnimationFrame,
      writable: true,
      enumerable: true,
      configurable: true,
    };
    globals.cancelAnimationFrame = {
      value: cancelAnimationFrame,
      writable: true,
      enumerable: true,
      configurable: true,
    };
  }
  Object.defineProperties(window, globals);
  if (context) {
    const realmObject: ObjectConstructor = Reflect.get(context, "Object");
    realmObjectPrototypes.set(realmObject.prototype, token);
    const realmFunction: FunctionConstructor = Reflect.get(context, "Function");
    const realmArray: ArrayConstructor = Reflect.get(context, "Array");
    installCollectionIterators(realmArray.prototype);
    Object.setPrototypeOf(NodeList.prototype, realmObject.prototype);
    Object.setPrototypeOf(HTMLCollection.prototype, realmObject.prototype);
    Object.setPrototypeOf(EventTarget.prototype, realmObject.prototype);
    Object.setPrototypeOf(Event.prototype, realmObject.prototype);
    Object.setPrototypeOf(CustomStateSet.prototype, realmObject.prototype);
    Object.setPrototypeOf(CustomStateSet, realmFunction.prototype);
    Object.setPrototypeOf(EventTarget, realmFunction.prototype);
    Object.setPrototypeOf(Event, realmFunction.prototype);
    Object.setPrototypeOf(Image, realmFunction.prototype);
    Object.setPrototypeOf(Audio, realmFunction.prototype);
  }
  for (const name of unsupportedWindowMethods) {
    window[name] = function () {
      options.reportUnsupported?.(`Window's ${name}() method`);
      return undefined;
    };
  }
  const textEncoding = createTextEncoding({
    Uint8Array: context ? Reflect.get(context, "Uint8Array") : Uint8Array,
    TypeError: context ? Reflect.get(context, "TypeError") : TypeError,
    RangeError: context ? Reflect.get(context, "RangeError") : RangeError,
    Object: context ? Reflect.get(context, "Object") : Object,
    Function: context ? Reflect.get(context, "Function") : Function,
    String: context ? Reflect.get(context, "String") : String,
  });
  let status = "";
  let windowName = "";
  Object.defineProperties(window, {
    HTMLDocument: { value: Document, configurable: true, writable: true },
    DOMTokenList: { value: DOMTokenList, configurable: true, writable: true },
    HTMLMarqueeElement: { value: HTMLMarqueeElement, configurable: true, writable: true },
    SVGElement: { value: SVGElement, configurable: true, writable: true },
    SVGGraphicsElement: { value: SVGGraphicsElement, configurable: true, writable: true },
    SVGStringList: { value: SVGStringList, configurable: true, writable: true },
    SVGSVGElement: { value: SVGSVGElement, configurable: true, writable: true },
    SVGNumber: { value: SVGNumber, configurable: true, writable: true },
    SVGRect: { value: SVGRect, configurable: true, writable: true },
    SVGAnimatedRect: { value: SVGAnimatedRect, configurable: true, writable: true },
    SVGPreserveAspectRatio: { value: SVGPreserveAspectRatio, configurable: true, writable: true },
    SVGAnimatedPreserveAspectRatio: {
      value: SVGAnimatedPreserveAspectRatio,
      configurable: true,
      writable: true,
    },
    SVGAnimatedString: { value: SVGAnimatedString, configurable: true, writable: true },
    SVGDefsElement: { value: SVGDefsElement, configurable: true, writable: true },
    SVGGElement: { value: SVGGElement, configurable: true, writable: true },
    SVGSwitchElement: { value: SVGSwitchElement, configurable: true, writable: true },
    SVGSymbolElement: { value: SVGSymbolElement, configurable: true, writable: true },
    SVGDescElement: { value: SVGDescElement, configurable: true, writable: true },
    SVGMetadataElement: { value: SVGMetadataElement, configurable: true, writable: true },
    SVGTitleElement: { value: SVGTitleElement, configurable: true, writable: true },
    BarProp: { value: BarProp, configurable: true, writable: true },
    External: { value: External, configurable: true, writable: true },
    TextEncoder: {
      value: textEncoding.TextEncoder,
      configurable: true,
      writable: true,
    },
    TextDecoder: {
      value: textEncoding.TextDecoder,
      configurable: true,
      writable: true,
    },
    TextEncoderStream: {
      value: textEncoding.TextEncoderStream,
      configurable: true,
      writable: true,
    },
    TextDecoderStream: {
      value: textEncoding.TextDecoderStream,
      configurable: true,
      writable: true,
    },
    webkitURL: { value: blobs().URL, configurable: true, writable: true },
    name: {
      configurable: true,
      enumerable: true,
      get: () => windowName,
      set(value: string) {
        windowName = `${value}`;
      },
    },
    status: {
      configurable: true,
      enumerable: true,
      get: () => status,
      set(value: string) {
        status = `${value}`;
      },
    },
  });
  Object.defineProperty(window, "Image", { value: Image, configurable: true, writable: true });
  Object.defineProperty(window, "Audio", { value: Audio, configurable: true, writable: true });
  const realmArray: ArrayConstructor = context ? Reflect.get(context, "Array") : Array;
  Object.defineProperty(HTMLSelectElement.prototype, Symbol.iterator, {
    value: realmArray.prototype.values,
    configurable: true,
    writable: true,
  });
  const realmSet: SetConstructor = context ? Reflect.get(context, "Set") : Set;
  const realmSetValues = realmSet.prototype.values;
  const realmSetEntries = realmSet.prototype.entries;
  for (const name of ["entries", "keys", "values", "forEach", Symbol.iterator] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(realmArray.prototype, name);
    if (descriptor) {
      Object.defineProperty(DOMTokenList.prototype, name, {
        ...descriptor,
        enumerable: typeof name === "string",
      });
    }
  }
  const realmJSON: JSON = context ? Reflect.get(context, "JSON") : JSON;
  const realmJSONParse: (text: string) => unknown = realmJSON.parse;
  const realmArrayBuffer: ArrayBufferConstructor = context
    ? Reflect.get(context, "ArrayBuffer")
    : ArrayBuffer;
  const registryPromise: PromiseConstructor = context ? Reflect.get(context, "Promise") : Promise;
  windowObjects.add(window);
  windowControls.set(window, { close: closeWindow, stop: stopWindow, navigate: navigateLocation });
  const embeddingFrame = options.frameElement && nodeRecord(options.frameElement)?.node;
  if (embeddingFrame && tree.isElementNode(embeddingFrame))
    focusFrameOwners.set(source, embeddingFrame);
  if (!options.detachedDocument) documentViews.set(source, window);
  if (!context) installHostGlobals(window);
  function defineReplaceable(name: string, get: () => unknown): void {
    const enumerable = !/^[A-Z]/.test(name);
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable,
      get,
      set(value: unknown) {
        Object.defineProperty(window, name, {
          configurable: true,
          enumerable,
          writable: true,
          value,
        });
      },
    });
  }
  const nativeViewportReaders = new Map<string, () => number>();
  for (const [name, value] of Object.entries(viewportDefaults)) {
    const read = () => {
      if (name === "innerWidth") return frameViewportDimension("width") ?? value;
      if (name === "innerHeight") return frameViewportDimension("height") ?? value;
      return value;
    };
    if (name === "innerWidth" || name === "innerHeight" || name === "devicePixelRatio")
      nativeViewportReaders.set(name, read);
    defineReplaceable(name, read);
  }
  function hasNativeViewportReaders(): boolean {
    for (const [name, read] of nativeViewportReaders) {
      const descriptor = Object.getOwnPropertyDescriptor(window, name);
      if (descriptor?.get !== read && typeof descriptor?.value !== "number") return false;
    }
    return true;
  }
  let external: External | undefined;
  defineReplaceable("external", () => (external ??= new External(token)));
  for (const name of browserBarNames) {
    let bar: BarProp | undefined;
    defineReplaceable(name, () => (bar ??= new BarProp(token)));
  }
  defineReplaceable("screen", () => (screen ??= new Screen(screenKey)));
  for (const name of ["localStorage", "sessionStorage"]) {
    const descriptor = windowMemberDescriptors[name];
    if (!descriptor) throw new Error(`Missing Window ${name} descriptor`);
    Object.defineProperty(window, name, { ...descriptor, enumerable: true });
  }
  for (const name of ["self", "frames", "parent", "length"]) {
    const get = windowMemberDescriptors[name]?.get;
    if (!get) throw new Error(`Missing Window ${name} getter`);
    defineReplaceable(name, () => Reflect.apply(get, window, []));
  }
  Object.defineProperties(window, {
    window: { get: () => window, enumerable: true, configurable: false },
    document: { get: () => document, enumerable: true, configurable: false },
    top: { get: () => top, enumerable: true, configurable: false },
  });
  defineReplaceable("origin", () => windowOrigin);
  defineReplaceable("event", events.currentEvent);
  for (const name of [
    "Request",
    "URL",
    "AbortController",
    "AbortSignal",
    "Response",
    "Headers",
    "MutationObserver",
    "FileReader",
  ]) {
    const descriptor = windowMemberDescriptors[name];
    if (!descriptor?.get) throw new Error(`Missing Window ${name} getter`);
    const get = descriptor.get;
    defineReplaceable(name, () => Reflect.apply(get, window, []));
  }
  Object.defineProperty(window, "frameElement", {
    configurable: true,
    enumerable: true,
    get: () => options.frameElement ?? null,
  });
  if (options.runScripts === "dangerously" && !options.detachedDocument) {
    reflectedWindowAttributes.set(source, (type, value, initial) => {
      if (!initial || !handlers.has(window, type)) handlers.attribute(window, type, value);
    });
  }
  windowHandlerTables.set(window, handlers);
  installInterfaceTable(window, windowHandlerDescriptors);
  Object.defineProperty(window, "performance", {
    configurable: true,
    enumerable: true,
    get: () => (windowPerformance ??= new Performance(performanceKey)),
  });
  Object.defineProperty(window, "crypto", {
    configurable: true,
    enumerable: true,
    get: () => (crypto ??= new Crypto(cryptoKey)),
  });
  Object.defineProperty(window, "location", {
    configurable: false,
    enumerable: true,
    get: getLocation,
    set(value: string) {
      getLocation().href = value;
    },
  });
  defineReplaceable("console", getConsole);
  // Interface and namespace bindings are non-enumerable, including lazy constructors.
  finalizeWindowInterfaces(window, Node.prototype, context !== null);
  top = options.frameTop ?? window;
  parent.set(document, window);
  if (options.frameParent) storage();
  function scriptKeyword(value: string): string {
    return asciiLower(value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, ""));
  }

  function hasClassicScriptType(script: Raw.Element): boolean {
    const type = attribute(script, "type");
    if (type !== null) return type === "" || classicScriptTypes.has(scriptKeyword(type));
    const language = script.namespaceURI === html.NS.HTML ? attribute(script, "language") : null;
    if (language === null || language === "") return true;
    return classicScriptTypes.has(asciiLower(`text/${language}`));
  }

  function allowsLegacyScriptEvent(script: Raw.Element): boolean {
    if (script.namespaceURI !== html.NS.HTML) return true;
    const event = attribute(script, "event"),
      target = attribute(script, "for");
    if (event === null || target === null) return true;
    const name = scriptKeyword(event);
    return scriptKeyword(target) === "window" && (name === "onload" || name === "onload()");
  }

  function canRunScript(script: Raw.Element): boolean {
    if (
      !context ||
      closed ||
      options.runScripts !== "dangerously" ||
      (script.namespaceURI !== html.NS.HTML && script.namespaceURI !== html.NS.SVG) ||
      elementLocalName(script) !== "script" ||
      startedScripts.has(script)
    )
      return false;
    if (!hasClassicScriptType(script)) return false;
    // Disconnected fragments and templates are outside the active document.
    return treeRoot(script, true) === source;
  }

  function evaluateScript(
    script: Raw.Element,
    code: string,
    filename: string,
    lineOffset: number,
  ): boolean {
    if (!context || closed) return false;
    const previous = currentScript;
    currentScript = script;
    try {
      evaluateClassicScript({ context, source: code, url: filename, lineOffset });
    } catch (cause) {
      reportRuntimeError(cause);
    } finally {
      currentScript = previous;
    }
    return true;
  }

  async function runExternalScript(
    script: Raw.Element,
    src: string,
    executeAfter?: Promise<void>,
  ): Promise<void> {
    const loadScript = options.loadTextResource;
    if (!loadScript) return;
    const handle = wrapElement(script);
    const target = parseElementURL(script, src);
    const signal = (resourceAbort ??= new AbortController()).signal;
    let response: Awaited<ReturnType<typeof loadScript>>;
    try {
      if (!target || !src) throw new TypeError("Invalid script URL");
      response = await loadTimedTextResource(
        loadScript,
        {
          kind: "script",
          fallbackEncoding: documentEncoding(ownerRecord(script)),
          ...(attribute(script, "charset") === null
            ? {}
            : { charset: attribute(script, "charset") ?? "" }),
          url: target.href,
          referrer: url.href,
          element: handle,
          signal,
        },
        "script",
      );
    } catch (cause) {
      if (executeAfter && !signal.aborted) await executeAfter;
      if (closed || signal.aborted) return;
      handle.dispatchEvent(new Event("error"));
      options.reportResourceError?.("script", target?.href ?? src, cause);
      return;
    }
    if (signal.aborted) return;
    if (executeAfter) await executeAfter;
    if (closed) return;
    if (!evaluateScript(script, response.code, response.url, 0)) return;
    // Resource completion follows evaluation's promise continuation. Once
    // execution started, document destruction does not cancel its load event.
    await Promise.resolve();
    handle.dispatchEvent(events.trusted(new Event("load")));
  }

  function startScript(
    script: Raw.Element,
    executeAfter?: Promise<void>,
  ): Promise<void> | undefined {
    if (!canRunScript(script)) return;
    const src =
      script.namespaceURI === html.NS.SVG
        ? (attribute(script, "href") ??
          findAttributeNS(script, html.NS.XLINK, "href")?.value ??
          null)
        : attribute(script, "src");
    if (src !== null) {
      startedScripts.add(script);
      if (!allowsLegacyScriptEvent(script) || !options.loadTextResource) return;
      return runExternalScript(script, src, executeAfter);
    }
    const text = script.childNodes.filter(tree.isTextNode);
    const code = options.isXML
      ? script.childNodes
          .map((node) =>
            tree.isTextNode(node)
              ? node.value
              : tree.isCommentNode(node) && xmlSpecial(node)?.kind === "cdata"
                ? node.data
                : "",
          )
          .join("")
      : text.map((node) => node.value).join("");
    if (!code) return;
    startedScripts.add(script);
    if (!allowsLegacyScriptEvent(script)) return;
    const lineOffset = (text[0]?.sourceCodeLocation?.startLine ?? 1) - 1;
    evaluateScript(script, code, url.href, lineOffset);
  }

  function trackResource(
    pending: Promise<void> | undefined,
    phase: "parser" | "stylesheet" | "load" = "parser",
  ): void {
    if (!pending) return;
    let resources: Set<Promise<void>>;
    if (phase === "stylesheet") resources = pendingStylesheets ??= new Set();
    else if (phase === "load") resources = pendingLoadResources ??= new Set();
    else resources = pendingResources ??= new Set();
    resources.add(pending);
    void pending.then(
      () => resources.delete(pending),
      (error: unknown) => {
        resources.delete(pending);
        if (options.reportScriptError) options.reportScriptError(error);
        else
          queueMicrotask(() => {
            throw error;
          });
      },
    );
  }

  function isInactiveAlternateStylesheet(node: Raw.Element): boolean {
    if (
      node.tagName !== "link" ||
      explicitlyEnabledStylesheets?.has(node) ||
      !attribute(node, "title")
    )
      return false;
    return asciiLower(attribute(node, "rel") ?? "")
      .split(/[\t\n\f\r ]+/)
      .includes("alternate");
  }

  function enableStylesheetLink(node: Raw.Element): void {
    (explicitlyEnabledStylesheets ??= new WeakSet()).add(node);
    const sheet = styleBinding?.sheet(node);
    if (sheet) sheet.disabled = false;
    startStyle(node);
  }

  function trackStylesheet(pending: Promise<void>, owner: Raw.Element): void {
    trackResource(pending, "stylesheet");
    if (
      !parserStylesheetOwners?.has(owner) ||
      attribute(owner, "disabled") !== null ||
      isInactiveAlternateStylesheet(owner)
    )
      return;
    const media = attribute(owner, "media");
    if (media && !parseMediaQuery(media).matches(mediaViewport())) return;
    const blockers = (pendingBlockingStylesheets ??= new Set());
    blockers.add(pending);
    const release = () => blockers.delete(pending);
    void pending.then(release, release);
  }

  let orderedScripts: Promise<void> | undefined;
  function activateInsertedScript(script: Raw.Element): void {
    const ordered = scriptAsyncCleared.has(script) && attribute(script, "async") === null;
    const pending = startScript(script, ordered ? orderedScripts : undefined);
    if (ordered && pending) {
      orderedScripts = pending;
      const release = () => {
        if (orderedScripts === pending) orderedScripts = undefined;
      };
      void pending.then(release, release);
    }
    trackResource(pending, "load");
  }

  function connected(node: Raw.Element): boolean {
    return treeRoot(node, true) === source;
  }

  function startStyle(node: Raw.Element): void {
    const loader = options.loadTextResource;
    if (closed || !loader || node.namespaceURI !== html.NS.HTML || node.tagName !== "link") return;
    const href = attribute(node, "href");
    const isStylesheet = asciiLower(attribute(node, "rel") ?? "")
      .split(/[\t\n\f\r ]+/)
      .includes("stylesheet");
    const target = href && isStylesheet ? parseElementURL(node, href) : null;
    if (!target) {
      removeLinkedStylesheet(node);
      return;
    }
    const previous = linkRequests?.get(node);
    if (!connected(node) || attribute(node, "disabled") !== null) {
      if (previous && previous.url !== target.href) {
        linkRequests?.delete(node);
        previous.abort.abort();
      }
      return;
    }
    if (previous?.url === target.href && !previous.abort.signal.aborted) return;
    const requests = (linkRequests ??= new WeakMap());
    const request = { url: target.href, abort: new AbortController() };
    requests.set(node, request);
    previous?.abort.abort();
    const signal = AbortSignal.any([
      request.abort.signal,
      (resourceAbort ??= new AbortController()).signal,
    ]);
    const handle = wrapElement(node);
    const active = () =>
      !closed && !signal.aborted && requests.get(node) === request && connected(node);
    const pending = loadTimedTextResource(
      loader,
      {
        kind: "stylesheet",
        ...(attribute(node, "charset") === null
          ? {}
          : { charset: attribute(node, "charset") ?? "" }),
        fallbackEncoding: documentEncoding(ownerRecord(node)),
        url: target.href,
        referrer: url.href,
        element: handle,
        signal,
      },
      "link",
    ).then(
      ({ code, url: stylesheetURL, encoding }) => {
        if (!active()) return;
        const sheet = styles().applySheet(node, code, stylesheetURL, encoding);
        sheet.disabled =
          attribute(node, "disabled") !== null || isInactiveAlternateStylesheet(node);
        handle.dispatchEvent(new Event("load"));
      },
      (cause: unknown) => {
        const report = active();
        if (signal.aborted && requests.get(node) === request) requests.delete(node);
        if (!report) return;
        handle.dispatchEvent(new Event("error"));
        options.reportResourceError?.("stylesheet", target.href, cause);
      },
    );
    trackStylesheet(pending, node);
  }

  function* shadowIncludingElements(root: Raw.Node): Iterable<Raw.Element> {
    const pending: Raw.Element[] = [];
    function pushChildren(children: Raw.ChildNode[]): void {
      for (let index = children.length - 1; index >= 0; index--) {
        const child = children[index];
        if (child && tree.isElementNode(child)) pending.push(child);
      }
    }

    if (tree.isElementNode(root)) pending.push(root);
    else if ("childNodes" in root) pushChildren(root.childNodes);

    while (pending.length) {
      const node = pending.pop();
      if (!node) break;
      pushChildren(node.childNodes);
      const shadow = shadowRoots.get(node);
      if (shadow) pushChildren(shadow.childNodes);
      yield node;
    }
  }

  function scanInsertedStyles(root: Raw.Element): void {
    if (!connected(root)) return;
    for (const node of shadowIncludingElements(root)) {
      if (node.tagName === "style" && connected(node)) styles().applyInline(node);
      if (node.tagName === "link") startStyle(node);
    }
  }

  function isFrame(node: Raw.Element): boolean {
    return (
      node.namespaceURI === html.NS.HTML &&
      (elementLocalName(node) === "frame" || elementLocalName(node) === "iframe")
    );
  }

  function refreshFrameIndices(): void {
    let index = 0;
    function defineFrameIndex(node: Raw.Element, state: FrameState): void {
      Object.defineProperty(window, index++, {
        configurable: true,
        enumerable: true,
        get: frameIndexGetter(node, state),
      });
    }
    if (frameStates.size === 1) {
      // A single frame needs a connectivity check but no tree-order traversal.
      const first = frameStates.entries().next();
      if (!first.done && treeRoot(first.value[0]) === source)
        defineFrameIndex(first.value[0], first.value[1]);
    } else if (frameStates.size > 1) {
      for (const node of descendants(source)) {
        if (!tree.isElementNode(node)) continue;
        const state = frameStates.get(node);
        if (state) defineFrameIndex(node, state);
      }
    }
    while (frameCount > index) Reflect.deleteProperty(window, --frameCount);
    frameCount = index;
  }

  function closeFrame(node: Raw.Element): boolean {
    const state = frameStates.get(node);
    if (!state) return false;
    frameStates.delete(node);
    state.abort?.abort();
    closeFrameRealm(state.realm);
    state.complete();
    return true;
  }

  function removeLinkedStylesheet(node: Raw.Element): void {
    const request = linkRequests?.get(node);
    linkRequests?.delete(node);
    styleBinding?.removeLinkedSheet(node);
    request?.abort.abort();
  }

  function disconnectResourcesIn(root: Raw.ChildNode): void {
    if ((!frameStates.size && !linkRequests) || !tree.isElementNode(root)) return;
    let frameRemoved = false;
    for (const node of shadowIncludingElements(root)) {
      if (closeFrame(node)) frameRemoved = true;
      if (node.tagName === "link") removeLinkedStylesheet(node);
    }
    if (frameRemoved) refreshFrameIndices();
  }

  function frameWindow(node: Raw.Element): ChildRealm["window"] | null {
    return frameStates.get(node)?.realm.window ?? null;
  }

  function frameSVGDocument(node: Raw.Element): object | null {
    const state = frameStates.get(node);
    const origin = state?.svgOrigin;
    return state && origin && origin !== "null" && origin === documentOrigin()
      ? state.realm.window.document
      : null;
  }

  function startFrame(node: Raw.Element, reload = false, deferIndex = false): void {
    const depth = options.frameDepth ?? 0;
    if (closed || depth >= 32 || !isFrame(node) || !connected(node)) return;
    const srcdoc = node.tagName === "iframe" ? attribute(node, "srcdoc") : null;
    const href = attribute(node, "src") ?? "about:blank";
    const signature = srcdoc === null ? "src:" + href : "srcdoc:" + srcdoc;
    if (!reload && frameStates.get(node)?.signature === signature) return;
    closeFrame(node);

    let complete = () => {};
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const loader = options.loadTextResource;
    const base = baseURL();
    const hasNavigation = srcdoc === null && href !== "about:blank" && href !== "";
    const target = hasNavigation && loader ? parseElementURL(node, href) : null;
    const abort = target ? new AbortController() : undefined;
    storage();
    const handle = wrapElement(node);
    const childOptions: WindowInput = {
      ...options,
      lastModifiedMs: undefined,
      markup: srcdoc ?? "",
      includeNodeLocations: false,
      isXML: false,
      contentType: "text/html",
      url: srcdoc === null ? "about:blank" : "about:srcdoc",
      referrer: url.href,
      frameParent: window,
      frameElement: handle,
      frameTop: top,
      frameDepth: depth + 1,
      inheritedOrigin: documentOrigin(),
      inheritedBase: base,
      storageAreas: sharedAreas,
      frameClosed: complete,
      frameLoaded: () => {
        if (closed || abort?.signal.aborted) return;
        if (!hasNavigation || loader) handle.dispatchEvent(new Event("load"));
        complete();
      },
    };
    const state: FrameState = {
      realm:
        srcdoc !== null
          ? createChildWindow(childOptions)
          : new InitialFrameRealm(
              hasNavigation
                ? { ...childOptions, frameLoaded: () => {}, frameClosed: () => {} }
                : childOptions,
              hasNavigation ? "navigation" : "blank",
              sharedAreas(),
            ),
      signature,
      abort,
      complete,
    };
    frameStates.set(node, state);
    const indexed = frameIndexTargets.get(node)?.deref();
    indexed?.set(node, state);
    if (!deferIndex && treeRoot(node) === source) refreshFrameIndices();
    trackFrameLoad((pendingLoadResources ??= new Set()), pending);
    if (!abort || !target || !loader) {
      if (hasNavigation) complete();
      return;
    }

    const signal = AbortSignal.any([
      abort.signal,
      (resourceAbort ??= new AbortController()).signal,
    ]);
    void loadTimedTextResource(
      loader,
      {
        kind: "frame",
        url: target.href,
        fallbackEncoding: documentEncoding(ownerRecord(node)),
        fallbackOrigin: documentOrigin(),
        referrer: url.href,
        element: handle,
        signal,
      },
      node.tagName,
    )
      .then(({ code, url: loadedURL, document: metadata }) => {
        if (signal.aborted || closed || frameStates.get(node) !== state) {
          complete();
          return;
        }
        closeFrameRealm(state.realm);
        const { inheritedOrigin: _origin, inheritedBase: _base, ...loaded } = childOptions;
        state.realm = createChildWindow({
          ...loaded,
          ...metadata,
          frameFailed,
          markup: code,
          url: loadedURL,
        });
        if (metadata?.contentType === "image/svg+xml") {
          const svgOrigin = URL.parse(loadedURL)?.origin;
          if (svgOrigin) state.svgOrigin = svgOrigin;
        }
      })
      .catch(frameFailed);
    function frameFailed(cause: unknown): void {
      try {
        if (!signal.aborted && !closed && frameStates.get(node) === state) {
          handle.dispatchEvent(new Event("error"));
          options.reportResourceError?.("frame", target!.href, cause);
        }
      } finally {
        complete();
      }
    }
  }

  let parsedRadioRecords: WeakSet<Raw.Element> | undefined;
  let needsParserRadioScan = options.mayHaveMarkupRadios ?? false;

  function initializeParsedRadios(): void {
    if (!needsParserRadioScan) return;
    const seen = (parsedRadioRecords ??= new WeakSet());
    const checked: Raw.Element[] = [];
    for (const node of descendants(source)) {
      if (
        !tree.isElementNode(node) ||
        !isInput(node) ||
        inputType(node) !== "radio" ||
        seen.has(node)
      )
        continue;
      seen.add(node);
      if (checkedness(node)) checked.push(node);
    }
    for (const node of checked) setChecked(node, true);
  }

  function insertedElementIsCheckedRadio(node: Raw.Element): boolean {
    if (!isInput(node) || inputType(node) !== "radio") return false;
    parsedRadioRecords?.add(node);
    return checkedness(node) && (connected(node) || formOwner(node) !== null);
  }

  function finishInsertedContent(roots: readonly Raw.ChildNode[], parent: Raw.ParentNode): void {
    // Capture the eligible descendants before scripts can mutate or remove later entries.
    const active: Raw.Element[] = [];
    const checked: Raw.Element[] = [];
    let hasStyles = false;
    const scriptsEnabled = options.runScripts === "dangerously";
    for (const root of roots) {
      if (!tree.isElementNode(root)) continue;
      for (const node of shadowIncludingElements(root)) {
        if (insertedElementIsCheckedRadio(node)) checked.push(node);
        if (node.tagName === "style" || node.tagName === "link") hasStyles = true;
        if (isFrame(node) || (scriptsEnabled && elementLocalName(node) === "script"))
          active.push(node);
      }
    }
    // Snapshot checked defaults across every root before normalization changes a later root.
    for (const node of checked) setChecked(node, true);
    if (hasStyles) for (const root of roots) if (tree.isElementNode(root)) scanInsertedStyles(root);
    // Children-changed steps precede post-connection steps of newly inserted descendants.
    if (tree.isElementNode(parent)) activateInsertedScript(parent);
    for (const node of active) {
      if (!connected(node)) continue;
      if (isFrame(node)) startFrame(node);
      else activateInsertedScript(node);
    }
  }

  let didScanFrames = false;
  let didScanStyles = false;
  let didBindBody = false;
  function bindBodyHandlers(): void {
    if (didBindBody || options.runScripts !== "dangerously" || closed) return;
    const body = bodyRecord();
    if (!body) return;
    didBindBody = true;
    wrapElement(body);
  }

  function startParsedFrames(nodes: Iterable<Raw.Node>): void {
    let pendingIndex = false;
    function flushIndex(): void {
      if (!pendingIndex) return;
      pendingIndex = false;
      refreshFrameIndices();
    }
    try {
      for (const node of nodes) {
        if (!tree.isElementNode(node) || !isFrame(node)) continue;
        const href = attribute(node, "src");
        const hasInlineDocument = node.tagName === "iframe" && attribute(node, "srcdoc") !== null;
        // Neither a blank frame nor an unloaded navigation can run an observer
        // synchronously. Publish the preceding indices before the next active frame.
        const deferIndex =
          !hasInlineDocument &&
          (!options.loadTextResource || href === null || href === "" || href === "about:blank");
        if (!deferIndex) flushIndex();
        startFrame(node, false, deferIndex);
        pendingIndex ||= deferIndex;
      }
    } finally {
      flushIndex();
    }
  }

  function scanParsedFrames(): void {
    if (!didScanFrames && options.hasMarkupFrames && !closed)
      startParsedFrames(descendants(source));
  }

  let parsedDetailsTasksScheduled = false;
  let didFinishInitialInput = false;
  function finishLoading(
    deferred?: { start: () => void; done: Promise<void> },
    schedule?: FrameLoadSlot,
  ): void {
    if (documentLoadStopped || closed) return;
    const generation = loadGeneration;
    const current = () => !closed && !documentLoadStopped && generation === loadGeneration;
    const keepsEmptyNames = !didFinishInitialInput && options.canKeepInitialDocumentNamesEmpty;
    didFinishInitialInput = true;
    advanceRevision({ namesChanged: !keepsEmptyNames });
    initializeParsedRadios();
    if (options.hasMarkupDetails) {
      if (!parsedDetailsTasksScheduled) {
        parsedDetailsTasksScheduled = true;
        for (const node of detailsTree(source)) queueParsedDetailsToggle(node);
      }
      reconcileInsertedDetails(source.childNodes, source);
    }
    needsParserRadioScan = false;
    scanParsedFrames();
    didScanFrames = true;
    bindBodyHandlers();
    if (!didScanStyles && options.hasMarkupStyles && !closed) {
      didScanStyles = true;
      styles().initialize();
      if (options.loadTextResource) {
        for (const child of descendants(source)) {
          if (tree.isElementNode(child) && child.tagName === "link") startStyle(child);
        }
      }
    }
    function completeLoad(): void {
      if (!current() || readyState === "complete") return;
      if (pendingResources?.size || pendingLoadResources?.size || pendingStylesheets?.size) {
        void Promise.allSettled([
          ...(pendingResources ?? []),
          ...(pendingLoadResources ?? []),
          ...(pendingStylesheets ?? []),
        ]).then(completeLoad);
        return;
      }
      readyState = "complete";
      document.dispatchEvent(new Event("readystatechange"));
      if (!current()) return;
      // Dispatch at Window with the legacy Document target.
      window.dispatchEvent(events.trusted(new Event("load"), document));
      if (current() && !pageShowing && !options.detachedDocument) {
        pageShowing = true;
        const event = new PageTransitionEvent("pageshow", { bubbles: true, cancelable: true });
        window.dispatchEvent(events.trusted(event, document));
      }
      if (current()) options.frameLoaded?.();
    }

    function contentLoaded(): void {
      if (!current()) return;
      document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
      if (current()) completeLoad();
    }

    function enterInteractive(): void {
      if (!current()) return;
      if (readyState === "complete") {
        deferred?.start();
        return;
      }
      if (readyState !== "loading") return;
      if (pendingResources?.size) {
        void Promise.allSettled(pendingResources).then(enterInteractive);
        return;
      }
      readyState = "interactive";
      document.dispatchEvent(new Event("readystatechange"));
      if (!current()) return;
      if (!deferred) {
        contentLoaded();
        return;
      }
      function runDeferred(): void {
        if (!current() || !deferred) return;
        if (pendingBlockingStylesheets?.size) {
          void Promise.allSettled(pendingBlockingStylesheets).then(runDeferred);
          return;
        }
        deferred.start();
        void deferred.done.then(contentLoaded);
      }
      runDeferred();
    }
    if (schedule) {
      frameLoadSlot = schedule;
      schedule.run = enterInteractive;
    } else {
      const tasks = (loadImmediates ??= new Set());
      const task = setImmediate(() => {
        tasks.delete(task);
        enterInteractive();
      });
      tasks.add(task);
    }
  }

  function liveParserAdapter(
    adapter: TreeAdapter<Raw.DefaultTreeAdapterMap>,
    isInTemplate: () => boolean,
  ): TreeAdapter<Raw.DefaultTreeAdapterMap> {
    function insertionParent(parent: Raw.ParentNode): Raw.ParentNode {
      return tree.isElementNode(parent) &&
        parent.namespaceURI === html.NS.HTML &&
        parent.tagName === "template" &&
        "content" in parent
        ? adapter.getTemplateContent(parent)
        : parent;
    }

    function canInsert(parent: Raw.ParentNode, node: Raw.ChildNode): boolean {
      // Reactions may give a newly created element a parent before parse5 attaches it.
      if (node.parentNode || wouldCreateCycle(parent, node)) return false;
      if (!isDocumentRecord(parent)) return true;
      if (tree.isTextNode(node)) return false;
      return !tree.isElementNode(node) || !parent.childNodes.some(tree.isElementNode);
    }

    function createElement(
      tagName: string,
      namespace: html.NS,
      attrs: AttributeRecord[],
    ): Raw.Element {
      const node = adapter.createElement(tagName, namespace, attrs);
      if (tagName === "script" && namespace === html.NS.HTML) scriptAsyncCleared.add(node);
      if (
        !customDefinitions ||
        isInTemplate() ||
        namespace !== html.NS.HTML ||
        !definitionForElement(node)
      )
        return node;
      // Constructors see an empty detached element; token attributes react before insertion.
      node.attrs = [];
      const is = attrs.find((attr) => attr.name === "is" && !attr.namespace)?.value;
      if (is !== undefined) (customIsValues ??= new WeakMap()).set(node, is);
      const handle = constructDocumentCustomElement(wrapElement(node));
      const result = element(handle);
      for (const attr of attrs)
        setAttributeValue(handle, findAttributeNS(result, attr.namespace ?? null, attr.name), attr);
      return result;
    }

    function inserted(node: Raw.ChildNode): void {
      advanceRevision({ namesChanged: containsDocumentNames(node) });
      if (hasFormLifecycleCallbacks) refreshCustomFormLifecycle([node]);
      if (tree.isElementNode(node) && customStates.get(node)?.connected && connected(node))
        updateCustomSubtree(node, true);
    }

    return {
      ...adapter,
      createElement,
      setTemplateContent(template, content) {
        adapter.setTemplateContent(template, content);
        (exposedTemplateHosts ??= new WeakMap()).set(content, template);
        setOwner(content, templateOwner(ownerRecord(template)));
      },
      setDocumentType(document, name, publicId, systemId) {
        // parse5's default setter appends directly and can rewrite an existing doctype.
        // Author mutations between open() and write() still constrain parser insertion.
        if (
          document.childNodes.some(
            (node) => tree.isElementNode(node) || tree.isDocumentTypeNode(node),
          )
        )
          throw new DOMException(
            `Invalid insertion of ${name} node in #document node.`,
            "HierarchyRequestError",
          );
        adapter.setDocumentType(document, name, publicId, systemId);
        advanceRevision();
      },
      appendChild(parent, node) {
        parent = insertionParent(parent);
        if (!canInsert(parent, node)) return;
        adapter.appendChild(parent, node);
        inserted(node);
      },
      insertBefore(parent, node, reference) {
        const target = insertionParent(parent);
        if (target !== parent) {
          this.appendChild(target, node);
          return;
        }
        if (reference.parentNode !== parent || !canInsert(parent, node)) return;
        adapter.insertBefore(parent, node, reference);
        inserted(node);
      },
      insertText(parent, text) {
        parent = insertionParent(parent);
        if (!isDocumentRecord(parent)) {
          adapter.insertText(parent, text);
          if (invalidateStyleSource(parent))
            advanceRevision({ namesChanged: false, idsChanged: false });
        }
      },
      insertTextBefore(parent, text, reference) {
        const target = insertionParent(parent);
        if (target !== parent) {
          this.insertText(target, text);
          return;
        }
        if (!isDocumentRecord(parent) && reference.parentNode === parent) {
          adapter.insertTextBefore(parent, text, reference);
          if (invalidateStyleSource(parent))
            advanceRevision({ namesChanged: false, idsChanged: false });
        }
      },
    };
  }

  function parseMarkup(
    markup: string,
    parserOptions: { scriptingEnabled: boolean; sourceCodeLocationInfo: boolean },
    endOfInput = true,
  ): MarkupWriter | undefined {
    const generation = loadGeneration;
    const parsing = () => !closed && !documentLoadStopped && generation === loadGeneration;
    if (!parsing()) return;
    needsParserRadioScan = !endOfInput || /<input[\t\n\f\r />]/i.test(markup);
    if (options.isXML) {
      const onScript = (script: Raw.Element) => {
        advanceRevision();
        return startScript(script);
      };
      try {
        const pending = parseXML({
          document: source,
          markup,
          url: url.href,
          ...(customDefinitions
            ? { createElement: liveParserAdapter(tree, () => false).createElement }
            : {}),
          ...(customDefinitions || parserOptions.scriptingEnabled ? { active: parsing } : {}),
          ...(parserOptions.scriptingEnabled ? { onScript } : {}),
        });
        if (pending) {
          void pending
            .then(() => {
              if (parsing()) finishLoading();
            })
            .catch((error: unknown) => {
              if (!parsing()) return;
              if (isXMLParseError(error)) {
                options.reportXMLParsingError?.(error);
                finishLoading();
              } else if (options.frameFailed) options.frameFailed(error);
              else options.reportScriptError?.(error);
            });
          return;
        }
      } catch (error) {
        if (!options.frameParent || !isXMLParseError(error)) throw error;
        replaceChildren(source, [xmlParserError(error.message)]);
      }
      finishLoading();
      return;
    }
    let parsedFrames: Raw.Element[] | undefined;
    let parsedStylesheets: Raw.Element[] | undefined;
    const collectStylesheets =
      parserOptions.scriptingEnabled &&
      options.loadTextResource !== undefined &&
      (!endOfInput || /<(?:link|style)[\t\n\f\r />]/i.test(markup));
    const settings =
      !endOfInput || collectStylesheets || /<(?:iframe|frame)[\t\n\f\r />]/i.test(markup)
        ? {
            ...parserOptions,
            treeAdapter: {
              ...tree,
              createElement(...args: Parameters<typeof tree.createElement>): Raw.Element {
                const node = tree.createElement(...args);
                if (isFrame(node)) (parsedFrames ??= []).push(node);
                if (
                  collectStylesheets &&
                  node.namespaceURI === html.NS.HTML &&
                  (node.tagName === "style" || node.tagName === "link")
                )
                  (parsedStylesheets ??= []).push(node);
                return node;
              },
            },
          }
        : parserOptions;

    function registerParsedFrames(): void {
      const batch = parsedFrames;
      parsedFrames = undefined;
      if (!batch) return;
      startParsedFrames(batch);
    }

    function registerParsedStylesheets(): void {
      const batch = parsedStylesheets;
      parsedStylesheets = undefined;
      if (!batch) return;
      for (const node of batch) {
        if (!connected(node)) continue;
        (parserStylesheetOwners ??= new WeakSet()).add(node);
        if (node.tagName === "style") styles().applyInline(node);
        else startStyle(node);
      }
    }

    async function waitForScriptStylesheets(): Promise<void> {
      // Imported sheets can add blockers as their parent sheet finishes.
      while (parsing() && pendingBlockingStylesheets?.size)
        await Promise.allSettled(pendingBlockingStylesheets);
    }

    const parsedShadows: Raw.DocumentFragment[] | undefined =
      declarativeShadowDocuments.has(source) && (!endOfInput || /shadowrootmode/i.test(markup))
        ? []
        : undefined;
    const parserSettings = detailsParserOptions(
      markup,
      parserFormOptions(markup, settings, !endOfInput),
      !endOfInput,
    );
    let parser: Parser<Raw.DefaultTreeAdapterMap> | undefined;
    const parserAdapter = liveParserAdapter(
      parserSettings.treeAdapter ?? tree,
      () => (parser?.openElements.tmplCount ?? 0) > 0,
    );
    const liveParserSettings = { ...parserSettings, treeAdapter: parserAdapter };

    let asynchronousParser = false;
    let deferredStart: (() => void) | undefined;
    let lastDeferred: Promise<void> | undefined;
    function scheduleDeferred(script: Raw.Element): void {
      if (!deferredStart) {
        const gate = Promise.withResolvers<void>();
        const signal = (resourceAbort ??= new AbortController()).signal;
        const release = () => gate.resolve();
        signal.addEventListener("abort", release, { once: true });
        deferredStart = () => {
          signal.removeEventListener("abort", release);
          gate.resolve();
        };
        lastDeferred = gate.promise;
      }
      // Fetch immediately, then execute after parsing and all preceding deferred scripts.
      const pending = startScript(script, lastDeferred);
      if (pending) lastDeferred = Promise.allSettled([pending]).then(() => {});
    }

    let streamEnded = endOfInput;
    function finishParsedMarkup(): void {
      if (streamEnded && stopActiveParser === stop) stopActiveParser = undefined;
      if (!parsing()) return;
      cachedDocumentBase = undefined;
      if (parsedShadows) for (const root of parsedShadows) reconcileSlots(root);
      registerParsedStylesheets();
      registerParsedFrames();
      if (customDefinitions) updateCustomSubtree(source);
      didScanFrames = true;
      if (!streamEnded) {
        advanceRevision();
        initializeParsedRadios();
        reconcileInsertedDetails(source.childNodes, source);
        bindBodyHandlers();
        return;
      }
      finishLoading(
        deferredStart && lastDeferred ? { start: deferredStart, done: lastDeferred } : undefined,
      );
    }

    function handleParsedScript(script: Raw.Element): void {
      // parse5 mutates the raw tree directly. Invalidate live queries before running script.
      advanceRevision();
      initializeParsedRadios();
      if (options.hasMarkupDetails) reconcileInsertedDetails(source.childNodes, source);
      bindBodyHandlers();
      registerParsedStylesheets();
      registerParsedFrames();
      if (customDefinitions) updateCustomSubtree(source);
      if (attribute(script, "src") !== null) {
        if (attribute(script, "async") !== null) {
          trackResource(startScript(script), "load");
          return;
        }
        if (
          attribute(script, "defer") !== null &&
          options.loadTextResource &&
          canRunScript(script)
        ) {
          scheduleDeferred(script);
          return;
        }
      }
      let pending: Promise<void> | undefined;
      if (pendingBlockingStylesheets?.size && canRunScript(script)) {
        const ready = waitForScriptStylesheets();
        pending =
          attribute(script, "src") !== null
            ? startScript(script, ready)
            : ready.then(() => (parsing() ? startScript(script) : undefined));
      } else if (asynchronousParser && canRunScript(script)) {
        // Once a blocking resource has yielded to the host, preserve a microtask boundary before
        // each following script. Constructors encountered during resumption can queue work here.
        pending = Promise.resolve().then(() => (parsing() ? startScript(script) : undefined));
      } else pending = startScript(script);
      if (!parsing()) {
        parser?.tokenizer.pause();
        return;
      }
      if (!pending) return;
      asynchronousParser = true;
      parser?.tokenizer.pause();
      const resume = () => {
        if (!parsing()) return;
        try {
          parser?.tokenizer.resume(finishParsedMarkup);
        } catch (error) {
          if (options.frameFailed) options.frameFailed(error);
          else options.reportScriptError?.(error);
        }
      };
      void pending.then(resume, (error: unknown) => {
        if (options.reportScriptError) options.reportScriptError(error);
        else
          queueMicrotask(() => {
            throw error;
          });
        resume();
      });
    }

    parsedDetailsTasksScheduled = true;
    const parseSVGScripts =
      parserOptions.scriptingEnabled && (!endOfInput || /<svg[\t\n\f\r />]/i.test(markup));
    parser = new Parser<Raw.DefaultTreeAdapterMap>(
      parsedShadows || parseSVGScripts || /<style[\t\n\f\r />]/i.test(markup) || !endOfInput
        ? {
            ...liveParserSettings,
            treeAdapter: {
              ...parserAdapter,
              onItemPush(node) {
                parserAdapter.onItemPush?.(node);
                if (!parsedShadows) return;
                const root = attachParsedShadow(node);
                if (root) parsedShadows.push(root);
              },
              onItemPop(node, newTop) {
                parserAdapter.onItemPop?.(node, newTop);
                if (
                  node.tagName === "style" &&
                  node.namespaceURI === html.NS.HTML &&
                  connected(node)
                ) {
                  (parserStylesheetOwners ??= new WeakSet()).add(node);
                  styles().applyInline(node);
                }
                if (
                  parseSVGScripts &&
                  node.namespaceURI === html.NS.SVG &&
                  node.tagName === "script"
                )
                  handleParsedScript(node);
              },
            },
          }
        : liveParserSettings,
      source,
      null,
      handleParsedScript,
    );
    const currentParser = parser;
    const stop = () => currentParser.tokenizer.pause();
    stopActiveParser = stop;
    const write: MarkupWriter = (chunk, last) => {
      if (!parsing() || streamEnded) return;
      streamEnded = last;
      if (!last) needsParserRadioScan = true;
      currentParser.tokenizer.write(chunk, last, finishParsedMarkup);
    };
    // The initial input belongs to this parser even when it is already the final chunk.
    parser.tokenizer.write(markup, endOfInput, finishParsedMarkup);
    return write;
  }

  return {
    window,
    context,
    closeWindow,
    finishLoading,
    parseMarkup,
    serialize: () =>
      options.isXML
        ? serializeXML(source.childNodes)
        : serialize(source, customIsValues && customElementSerialization),
    reconfigure(settings: { url?: string | undefined; windowTop?: unknown }): void {
      if ("windowTop" in settings) top = settings.windowTop;
      if ("url" in settings) {
        const next = URL.parse(String(settings.url));
        if (!next) throw new TypeError(`Could not parse "${settings.url}" as a URL`);
        url = next;
        historyBinding?.reconfigure(next);
      }
    },
    nodeLocation(node: unknown) {
      if (!(node instanceof Node)) throw new TypeError("Expected a Node from this Window");
      return raw(node).sourceCodeLocation;
    },
  };
}
