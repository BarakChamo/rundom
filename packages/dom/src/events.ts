// Owns event dispatch state and listener delivery for each Window.
import { Blob } from "node:buffer";
import { addAbortListener } from "node:events";
import { reportCallbackException } from "./script-realm.js";

type Options =
  | boolean
  | { capture?: boolean; once?: boolean; passive?: boolean; signal?: AbortSignal };
function listenerOptions(options: Options | undefined): Exclude<Options, boolean> | undefined {
  return options !== null && (typeof options === "object" || typeof options === "function")
    ? options
    : undefined;
}

type Entry = {
  listener: object;
  once: boolean;
  passive: boolean;
  signal: AbortSignal | undefined;
  removed: boolean;
  abortCleanup?: Disposable;
  reportError: ((cause: unknown) => void) | undefined;
};

type ListenerList = { entries: Entry[]; shared: boolean };

// Dispatch keeps the current array, so the next edit must leave that snapshot intact.
function writableEntries(list: ListenerList): Entry[] {
  if (list.shared) {
    list.entries = list.entries.slice();
    list.shared = false;
  }
  return list.entries;
}

function signalAborted(signal: AbortSignal): boolean {
  return Reflect.get(AbortSignal.prototype, "aborted", signal);
}

function removeEntry(list: ListenerList, entry: Entry, index = list.entries.indexOf(entry)): void {
  if (entry.removed) return;
  entry.removed = true;
  if (index !== -1) writableEntries(list).splice(index, 1);
  entry.abortCleanup?.[Symbol.dispose]();
  delete entry.abortCleanup;
}

function watchAbort(signal: AbortSignal, listeners: ListenerList, entry: Entry): Disposable {
  const list = new WeakRef(listeners);
  const reference = new WeakRef(entry);
  return addAbortListener(signal, () => {
    const currentList = list.deref();
    const currentEntry = reference.deref();
    if (currentList && currentEntry && signalAborted(signal))
      removeEntry(currentList, currentEntry);
  });
}

type DispatchState = {
  target: object | null;
  current: object | null;
  path: readonly object[];
  closedMembership: Map<object, object[]> | undefined;
  relatedTarget: object | null | undefined;
  phase: number;
  stopped: boolean;
  immediate: boolean;
  passive: boolean;
};

const emptyPath: readonly object[] = Object.freeze([]);

// DOM wrappers keep their identity when adopted, so dispatch records follow the objects.
const parent = new WeakMap<object, object>();
const shadowParents = new WeakMap<object, { host: object; closed: boolean }>();
type ListenerPhases = { capture?: ListenerList; bubble?: ListenerList };
const listeners = new WeakMap<object, Map<string, ListenerPhases>>();
type EventRecord = {
  state: DispatchState | null;
  timestamp: number;
  trust: boolean | undefined;
  canceled: boolean;
  /** An event can be stopped before it has ever acquired dispatch state. */
  stoppedEarly: boolean;
  /** Set by legacy document.createEvent until initEvent runs. */
  uninitialized: boolean;
  mouse: boolean;
  related: object | undefined;
};

/** Returns its argument from `new`, so a subclass can add private fields to an existing object. */
class Identity {
  constructor(target: object) {
    return target;
  }
}

// One module-level private slot brands events from every Window, so cross-realm borrowing and
// adoption keep working; a private field is far cheaper to add and read than a WeakMap entry.
class EventSlot extends Identity {
  readonly #record: EventRecord;
  constructor(target: object, record: EventRecord) {
    super(target);
    this.#record = record;
  }
  static read(value: unknown): EventRecord | undefined {
    return typeof value === "object" && value !== null && #record in value
      ? value.#record
      : undefined;
  }
}

/** Shared brands survive cross-realm borrowing and adoption; missing metadata is an invalid receiver. */
function eventRecord(event: unknown): EventRecord {
  const record = EventSlot.read(event);
  if (!record) throw new TypeError("Expected a DOM Event");
  return record;
}

function eventCanceled(event: object): boolean {
  return eventRecord(event).canceled;
}

function shadowRootFor(target: object): object | undefined {
  for (let node: object | undefined = target; node; node = parent.get(node)) {
    if (shadowParents.has(node)) return node;
  }
  return undefined;
}

function closedRootsFor(target: object): object[] {
  const roots: object[] = [];
  for (let root = shadowRootFor(target); root;) {
    const boundary = shadowParents.get(root);
    if (!boundary) break;
    if (boundary.closed) roots.push(root);
    root = shadowRootFor(boundary.host);
  }
  return roots;
}

function retarget(target: object, against: object): object {
  let candidate = target;
  for (;;) {
    const root = shadowRootFor(candidate);
    const boundary = root && shadowParents.get(root);
    if (!boundary) return candidate;
    for (
      let node: object | undefined = against;
      node;
      node = parent.get(node) ?? shadowParents.get(node)?.host
    ) {
      if (node === root) return candidate;
    }
    candidate = boundary.host;
  }
}

function setRelatedTarget(event: object, target: object | null): void {
  eventRecord(event).related = target ?? undefined;
}

type EventContext = { current: object | undefined };
const eventContexts = new WeakMap<object, EventContext>();

function bindEventContext(target: object): void {
  if (eventContexts.has(target)) return;
  for (
    let prototype: object | null = Object.getPrototypeOf(target);
    prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    const context = eventContexts.get(prototype);
    if (context) {
      eventContexts.set(target, context);
      return;
    }
  }
}

const legacyTargets = new WeakMap<object, object>();
// A false entry is a trusted dispatch that has been prepared but has yet to start.

const beforeUnloadStates = new WeakMap<object, { value: string; cancel: () => void }>();

/** Applies the nullable DOMString result of an onbeforeunload handler. */
export function applyBeforeUnloadResult(event: object, result: unknown): void {
  if (result == null) return;
  const value = `${result}`;
  const state = beforeUnloadStates.get(event);
  if (!state) return;
  state.cancel();
  if (state.value === "") state.value = value;
}

function beforeUnloadState(event: object) {
  const state = beforeUnloadStates.get(event);
  if (!state) throw new TypeError("Expected a BeforeUnloadEvent");
  return state;
}

const phaseDescriptors: PropertyDescriptorMap = {
  NONE: { value: 0, enumerable: true },
  CAPTURING_PHASE: { value: 1, enumerable: true },
  AT_TARGET: { value: 2, enumerable: true },
  BUBBLING_PHASE: { value: 3, enumerable: true },
};

const keyLocationDescriptors: PropertyDescriptorMap = {
  DOM_KEY_LOCATION_STANDARD: { value: 0, enumerable: true },
  DOM_KEY_LOCATION_LEFT: { value: 1, enumerable: true },
  DOM_KEY_LOCATION_RIGHT: { value: 2, enumerable: true },
  DOM_KEY_LOCATION_NUMPAD: { value: 3, enumerable: true },
};

const wheelModeDescriptors: PropertyDescriptorMap = {
  DOM_DELTA_PIXEL: { value: 0, enumerable: true },
  DOM_DELTA_LINE: { value: 1, enumerable: true },
  DOM_DELTA_PAGE: { value: 2, enumerable: true },
};

const modifierNames = [
  "AltGraph",
  "CapsLock",
  "Fn",
  "FnLock",
  "Hyper",
  "NumLock",
  "ScrollLock",
  "Super",
  "Symbol",
  "SymbolLock",
] as const;
type ModifierOptions = {
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
} & Partial<Record<`modifier${(typeof modifierNames)[number]}`, boolean>>;

const extendedModifierOptions = modifierNames.map((name) => ({
  name,
  option: `modifier${name}` as const,
}));

function modifierState(init?: ModifierOptions): Set<string> | undefined {
  if (!init) return undefined;
  let active = updateModifiers(undefined, init);
  for (const { name, option } of extendedModifierOptions) {
    if (init[option]) (active ??= new Set()).add(name);
  }
  return active;
}

function updateModifiers(
  state: Set<string> | undefined,
  basic: ModifierOptions,
): Set<string> | undefined {
  state?.delete("Control");
  state?.delete("Shift");
  state?.delete("Alt");
  state?.delete("Meta");
  if (basic.ctrlKey) (state ??= new Set()).add("Control");
  if (basic.shiftKey) (state ??= new Set()).add("Shift");
  if (basic.altKey) (state ??= new Set()).add("Alt");
  if (basic.metaKey) (state ??= new Set()).add("Meta");
  return state;
}

function finiteNumber(value: number | undefined, fallback = 0): number {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(result)) throw new TypeError("Event coordinates must be finite");
  return result;
}

/** Creates a Window's Event and EventTarget interfaces over shared dispatch records. */
export function createEvents(
  eventTime: () => number,
  reportError?: (cause: unknown) => void,
  Exception: typeof DOMException = DOMException,
  activation?: (
    path: readonly object[],
    event: { readonly bubbles: boolean; readonly offsetX: number; readonly offsetY: number },
  ) => ((canceled: boolean) => void) | undefined,
  assignedSlot?: (target: object) => object | undefined,
  isDefaultPassiveTarget?: (target: object) => boolean,
  isWindow?: (target: object) => boolean,
  defaultTarget?: () => object,
) {
  type Listener = ((event: Event) => void) | { handleEvent(event: Event): void };
  const eventContext: EventContext = { current: undefined };

  const trustGetter = {
    get isTrusted(): boolean {
      return eventRecord(this).trust === true;
    },
  };
  const trustDescriptor = {
    ...Object.getOwnPropertyDescriptor(trustGetter, "isTrusted"),
    configurable: false,
  };

  let cancelBeforeUnload: (event: Event) => void;
  class Event {
    declare readonly isTrusted: boolean;
    declare static readonly NONE: 0;
    declare static readonly CAPTURING_PHASE: 1;
    declare static readonly AT_TARGET: 2;
    declare static readonly BUBBLING_PHASE: 3;
    declare readonly NONE: 0;
    declare readonly CAPTURING_PHASE: 1;
    declare readonly AT_TARGET: 2;
    declare readonly BUBBLING_PHASE: 3;

    static {
      cancelBeforeUnload = (event) => {
        eventRecord(event).canceled = true;
      };
      Object.defineProperties(this, phaseDescriptors);
      Object.defineProperties(this.prototype, phaseDescriptors);
    }

    #type: string;
    #bubbles: boolean;
    #cancelable: boolean;
    readonly #composed: boolean;

    constructor(
      type: string,
      init?: { bubbles?: boolean; cancelable?: boolean; composed?: boolean },
    ) {
      if (arguments.length === 0) throw new TypeError("Event requires a type");
      this.#type = String(type);
      this.#bubbles = Boolean(init?.bubbles);
      this.#cancelable = Boolean(init?.cancelable);
      this.#composed = Boolean(init?.composed);
      new EventSlot(this, {
        state: null,
        timestamp: eventTime(),
        trust: undefined,
        canceled: false,
        stoppedEarly: false,
        uninitialized: false,
        mouse: false,
        related: undefined,
      });
      Object.defineProperty(this, "isTrusted", trustDescriptor);
    }
    initEvent(type: string, bubbles = false, cancelable = false): void {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      const name = String(type);
      const record = EventSlot.read(this);
      if (record?.state?.current) return;
      this.#type = name;
      this.#bubbles = Boolean(bubbles);
      this.#cancelable = Boolean(cancelable);
      if (!record) throw new TypeError("Expected a DOM Event");
      record.canceled = false;
      record.trust = undefined;
      record.state = null;
      record.stoppedEarly = false;
      record.uninitialized = false;
    }
    get [Symbol.toStringTag](): string {
      return "Event";
    }
    get type(): string {
      return this.#type;
    }
    get bubbles(): boolean {
      return this.#bubbles;
    }
    get cancelable(): boolean {
      return this.#cancelable;
    }
    get composed(): boolean {
      return this.#composed;
    }
    get defaultPrevented(): boolean {
      return eventCanceled(this);
    }
    get timeStamp(): number {
      return eventRecord(this).timestamp;
    }
    get returnValue(): boolean | string {
      return !eventCanceled(this);
    }
    set returnValue(value: boolean | string) {
      if (!value) this.preventDefault();
    }

    get target(): EventTarget | null {
      return (EventSlot.read(this)?.state?.target as EventTarget | undefined) ?? null;
    }
    get currentTarget(): EventTarget | null {
      return (EventSlot.read(this)?.state?.current as EventTarget | undefined) ?? null;
    }
    get srcElement(): EventTarget | null {
      return this.target;
    }
    get eventPhase(): number {
      return EventSlot.read(this)?.state?.phase ?? 0;
    }
    composedPath(): EventTarget[] {
      const state = EventSlot.read(this)?.state;
      if (!state?.current) return [];
      const membership = state.closedMembership;
      if (!membership) return state.path.slice() as EventTarget[];
      const visibleRoots = membership.get(state.current);
      return state.path.filter(
        (item) => membership.get(item)?.every((root) => visibleRoots?.includes(root)) ?? true,
      ) as EventTarget[];
    }
    stopPropagation(): void {
      const record = EventSlot.read(this);
      if (record?.state) record.state.stopped = true;
      else if (record) record.stoppedEarly = true;
    }
    stopImmediatePropagation(): void {
      const record = EventSlot.read(this);
      if (record?.state) record.state.immediate = record.state.stopped = true;
      else if (record) record.stoppedEarly = true;
    }
    get cancelBubble(): boolean {
      const record = EventSlot.read(this);
      return record?.state?.stopped ?? record?.stoppedEarly ?? false;
    }
    set cancelBubble(value: boolean) {
      if (value) this.stopPropagation();
    }
    preventDefault(): void {
      if (!this.#cancelable) return;
      const record = eventRecord(this);
      if (!record.state?.passive) record.canceled = true;
    }
  }

  type EventInit = { bubbles?: boolean; cancelable?: boolean; composed?: boolean };
  const eventConstructionKey = Symbol("event construction");

  class CloseEvent extends Event {
    readonly #wasClean: boolean;
    readonly #code: number;
    readonly #reason: string;
    constructor(
      type: string,
      init?: EventInit & { wasClean?: boolean; code?: number; reason?: string },
    ) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      const eventType = `${type}`;
      validateEventDictionary(init);
      super(eventType, init);
      this.#code = +(init?.code ?? 0) & 0xffff;
      const reason = init?.reason;
      this.#reason = reason === undefined ? "" : `${reason}`.toWellFormed();
      this.#wasClean = Boolean(init?.wasClean);
    }
    get code(): number {
      return this.#code;
    }
    get reason(): string {
      return this.#reason;
    }
    get wasClean(): boolean {
      return this.#wasClean;
    }
    override get [Symbol.toStringTag](): string {
      return "CloseEvent";
    }
  }

  class TransitionEvent extends Event {
    readonly #elapsedTime: number;
    readonly #propertyName: string;
    readonly #pseudoElement: string;
    constructor(
      type: string,
      init?: EventInit & { elapsedTime?: number; propertyName?: string; pseudoElement?: string },
    ) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      const eventType = `${type}`;
      validateEventDictionary(init);
      super(eventType, init);
      const elapsedTime = +(init?.elapsedTime ?? 0);
      if (!Number.isFinite(elapsedTime))
        throw new TypeError("Transition elapsedTime must be finite");
      this.#elapsedTime = elapsedTime;
      const propertyName = init?.propertyName;
      this.#propertyName = propertyName === undefined ? "" : `${propertyName}`;
      const pseudoElement = init?.pseudoElement;
      this.#pseudoElement = pseudoElement === undefined ? "" : `${pseudoElement}`;
    }
    get elapsedTime(): number {
      return this.#elapsedTime;
    }
    get propertyName(): string {
      return this.#propertyName;
    }
    get pseudoElement(): string {
      return this.#pseudoElement;
    }
    override get [Symbol.toStringTag](): string {
      return "TransitionEvent";
    }
  }

  class PageTransitionEvent extends Event {
    readonly #persisted: boolean;
    constructor(type: string, init?: EventInit & { persisted?: boolean }) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      const eventType = `${type}`;
      validateEventDictionary(init);
      super(eventType, init);
      this.#persisted = Boolean(init?.persisted);
    }
    get persisted(): boolean {
      return this.#persisted;
    }
    override get [Symbol.toStringTag](): string {
      return "PageTransitionEvent";
    }
  }

  class BlobEvent extends Event {
    readonly #data: Blob;
    readonly #timecode: number;
    constructor(type: string, init: EventInit & { data: Blob; timecode?: number }) {
      if (arguments.length < 2) throw new TypeError("A BlobEvent type and dictionary are required");
      const eventType = `${type}`;
      validateEventDictionary(init);
      super(eventType, init);
      const data = init?.data;
      if (!(data instanceof Blob)) throw new TypeError("BlobEvent data must be a Blob");
      // The native getter rejects objects that merely inherit Blob.prototype.
      Reflect.get(Blob.prototype, "size", data);
      this.#data = data;
      const timecode = init.timecode;
      this.#timecode = timecode === undefined ? NaN : +timecode;
      if (timecode !== undefined && !Number.isFinite(this.#timecode))
        throw new TypeError("BlobEvent timecode must be finite");
    }
    get data(): Blob {
      return this.#data;
    }
    get timecode(): number {
      return this.#timecode;
    }
    override get [Symbol.toStringTag](): string {
      return "BlobEvent";
    }
  }

  class PromiseRejectionEvent extends Event {
    readonly #promise: object;
    readonly #reason: unknown;
    constructor(type: string, init: EventInit & { promise: object; reason?: unknown }) {
      if (arguments.length < 2)
        throw new TypeError("A PromiseRejectionEvent type and dictionary are required");
      const eventType = `${type}`;
      validateEventDictionary(init);
      super(eventType, init);
      const promise = init?.promise;
      if (promise == null || (typeof promise !== "object" && typeof promise !== "function"))
        throw new TypeError("PromiseRejectionEvent promise must be an object");
      this.#promise = promise;
      this.#reason = init.reason;
    }
    get promise(): object {
      return this.#promise;
    }
    get reason(): unknown {
      return this.#reason;
    }
    override get [Symbol.toStringTag](): string {
      return "PromiseRejectionEvent";
    }
  }

  class BeforeUnloadEvent extends Event {
    constructor(key: symbol, type: string) {
      if (key !== eventConstructionKey) throw new TypeError("Illegal constructor");
      super(type);
      beforeUnloadStates.set(this, { value: "", cancel: () => cancelBeforeUnload(this) });
    }
    override get returnValue(): string {
      return beforeUnloadState(this).value;
    }
    override set returnValue(value: string) {
      beforeUnloadState(this).value = `${value}`;
    }
    override get [Symbol.toStringTag](): string {
      return "BeforeUnloadEvent";
    }
  }

  type AccelerationInit = { x?: number | null; y?: number | null; z?: number | null };
  type RotationInit = { alpha?: number | null; beta?: number | null; gamma?: number | null };

  function nullableReading(value: number | null | undefined): number | null {
    return value == null ? null : finiteNumber(value);
  }

  function validateEventDictionary(value: unknown): void {
    if (value != null && typeof value !== "object" && typeof value !== "function")
      throw new TypeError("Event initialization options must be an object");
  }

  class DeviceMotionEventAcceleration {
    readonly #x: number | null;
    readonly #y: number | null;
    readonly #z: number | null;
    constructor(key: symbol, init: AccelerationInit | null) {
      if (key !== eventConstructionKey) throw new TypeError("Illegal constructor");
      validateEventDictionary(init);
      this.#x = nullableReading(init?.x);
      this.#y = nullableReading(init?.y);
      this.#z = nullableReading(init?.z);
    }
    get x() {
      return this.#x;
    }
    get y() {
      return this.#y;
    }
    get z() {
      return this.#z;
    }
    get [Symbol.toStringTag](): string {
      return "DeviceMotionEventAcceleration";
    }
  }

  class DeviceMotionEventRotationRate {
    readonly #alpha: number | null;
    readonly #beta: number | null;
    readonly #gamma: number | null;
    constructor(key: symbol, init: RotationInit | null) {
      if (key !== eventConstructionKey) throw new TypeError("Illegal constructor");
      validateEventDictionary(init);
      this.#alpha = nullableReading(init?.alpha);
      this.#beta = nullableReading(init?.beta);
      this.#gamma = nullableReading(init?.gamma);
    }
    get alpha() {
      return this.#alpha;
    }
    get beta() {
      return this.#beta;
    }
    get gamma() {
      return this.#gamma;
    }
    get [Symbol.toStringTag](): string {
      return "DeviceMotionEventRotationRate";
    }
  }

  class DeviceMotionEvent extends Event {
    readonly #acceleration;
    readonly #accelerationIncludingGravity;
    readonly #rotationRate;
    readonly #interval;

    constructor(
      type: string,
      init?: EventInit & {
        acceleration?: AccelerationInit | null;
        accelerationIncludingGravity?: AccelerationInit | null;
        rotationRate?: RotationInit | null;
        interval?: number;
      },
    ) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      validateEventDictionary(init);
      super(type, init);
      const acceleration = init?.acceleration;
      const gravity = init?.accelerationIncludingGravity;
      const rotation = init?.rotationRate;
      this.#acceleration =
        acceleration === undefined
          ? null
          : new DeviceMotionEventAcceleration(eventConstructionKey, acceleration);
      this.#accelerationIncludingGravity =
        gravity === undefined
          ? null
          : new DeviceMotionEventAcceleration(eventConstructionKey, gravity);
      this.#rotationRate =
        rotation === undefined
          ? null
          : new DeviceMotionEventRotationRate(eventConstructionKey, rotation);
      this.#interval = finiteNumber(init?.interval);
    }

    get acceleration() {
      return this.#acceleration;
    }
    get accelerationIncludingGravity() {
      return this.#accelerationIncludingGravity;
    }
    get rotationRate() {
      return this.#rotationRate;
    }
    get interval() {
      return this.#interval;
    }
    override get [Symbol.toStringTag](): string {
      return "DeviceMotionEvent";
    }
  }

  class DeviceOrientationEvent extends Event {
    readonly #alpha;
    readonly #beta;
    readonly #gamma;
    readonly #absolute;

    constructor(type: string, init?: EventInit & RotationInit & { absolute?: boolean }) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      validateEventDictionary(init);
      super(type, init);
      this.#alpha = nullableReading(init?.alpha);
      this.#beta = nullableReading(init?.beta);
      this.#gamma = nullableReading(init?.gamma);
      this.#absolute = Boolean(init?.absolute);
    }

    get alpha() {
      return this.#alpha;
    }
    get beta() {
      return this.#beta;
    }
    get gamma() {
      return this.#gamma;
    }
    get absolute() {
      return this.#absolute;
    }
    override get [Symbol.toStringTag](): string {
      return "DeviceOrientationEvent";
    }
  }

  type UIEventInit = EventInit & { detail?: number; view?: object | null; which?: number };

  class CustomEvent extends Event {
    #detail: unknown;
    constructor(type: string, init?: EventInit & { detail?: unknown }) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      super(type, init);
      this.#detail = init?.detail ?? null;
    }
    get detail(): unknown {
      return this.#detail;
    }
    initCustomEvent(
      type: string,
      bubbles = false,
      cancelable = false,
      detail: unknown = null,
    ): void {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      if (EventSlot.read(this)?.state?.current) return;
      super.initEvent(type, bubbles, cancelable);
      this.#detail = detail;
    }
    override get [Symbol.toStringTag](): string {
      return "CustomEvent";
    }
  }

  class UIEvent extends Event {
    #detail: number;
    #view: object | null;
    readonly #which: number;
    constructor(type: string, init?: UIEventInit) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      validateEventDictionary(init);
      super(type, init);
      this.#detail = Number(init?.detail) | 0;
      this.#view = init?.view ?? null;
      if (this.#view !== null && !isWindow?.(this.#view))
        throw new TypeError("Event view must be a Window");
      this.#which = Number(init?.which) >>> 0;
    }
    get detail(): number {
      return this.#detail;
    }
    get view(): object | null {
      return this.#view;
    }
    get which(): number {
      return this.#which;
    }
    initUIEvent(
      type: string,
      bubbles = false,
      cancelable = false,
      view: object | null = null,
      detail = 0,
    ): void {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      if (view !== null && !isWindow?.(view)) throw new TypeError("Event view must be a Window");
      if (EventSlot.read(this)?.state?.current) return;
      super.initEvent(type, bubbles, cancelable);
      this.#view = view;
      this.#detail = Number(detail) | 0;
    }
    override get [Symbol.toStringTag](): string {
      return "UIEvent";
    }
  }

  function relatedTargetOf(event: Event): EventTarget | null {
    const record = EventSlot.read(event);
    const state = record?.state;
    return (
      (state?.relatedTarget === undefined
        ? (record?.related as EventTarget | undefined)
        : (state.relatedTarget as EventTarget | null)) ?? null
    );
  }

  class FocusEvent extends UIEvent {
    constructor(type: string, init?: UIEventInit & { relatedTarget?: EventTarget | null }) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      super(type, init);
      setRelatedTarget(this, init?.relatedTarget ?? null);
    }
    get relatedTarget(): EventTarget | null {
      return relatedTargetOf(this);
    }
    override get [Symbol.toStringTag](): string {
      return "FocusEvent";
    }
  }

  type MouseEventInit = UIEventInit &
    ModifierOptions &
    Partial<
      Record<
        | "screenX"
        | "screenY"
        | "clientX"
        | "clientY"
        | "movementX"
        | "movementY"
        | "button"
        | "buttons",
        number
      >
    > & { relatedTarget?: EventTarget | null };

  function mouseData(init?: MouseEventInit) {
    return {
      screenX: finiteNumber(init?.screenX),
      screenY: finiteNumber(init?.screenY),
      clientX: finiteNumber(init?.clientX),
      clientY: finiteNumber(init?.clientY),
      movementX: finiteNumber(init?.movementX),
      movementY: finiteNumber(init?.movementY),
      button: (Number(init?.button) << 16) >> 16,
      buttons: Number(init?.buttons) & 0xffff,
    };
  }

  class MouseEvent extends UIEvent {
    readonly #mouse: ReturnType<typeof mouseData>;
    #modifiers: Set<string> | undefined;
    constructor(type: string, init?: MouseEventInit) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      super(type, init);
      this.#mouse = mouseData(init);
      const record = eventRecord(this);
      record.related = init?.relatedTarget ?? undefined;
      record.mouse = true;
      this.#modifiers = modifierState(init);
    }
    get screenX() {
      return this.#mouse.screenX;
    }
    get screenY() {
      return this.#mouse.screenY;
    }
    get clientX() {
      return this.#mouse.clientX;
    }
    get clientY() {
      return this.#mouse.clientY;
    }
    get movementX() {
      return this.#mouse.movementX;
    }
    get movementY() {
      return this.#mouse.movementY;
    }
    get button() {
      return this.#mouse.button;
    }
    get buttons() {
      return this.#mouse.buttons;
    }
    get relatedTarget() {
      return relatedTargetOf(this);
    }
    get ctrlKey(): boolean {
      return this.#modifiers?.has("Control") ?? false;
    }
    get shiftKey(): boolean {
      return this.#modifiers?.has("Shift") ?? false;
    }
    get altKey(): boolean {
      return this.#modifiers?.has("Alt") ?? false;
    }
    get metaKey(): boolean {
      return this.#modifiers?.has("Meta") ?? false;
    }
    getModifierState(key: string): boolean {
      if (arguments.length < 1) throw new TypeError("A modifier key is required");
      const name = String(key);
      return this.#modifiers?.has(name) ?? false;
    }
    get x(): number {
      return this.clientX;
    }
    get y(): number {
      return this.clientY;
    }
    get pageX(): number {
      return this.clientX;
    }
    get pageY(): number {
      return this.clientY;
    }
    get offsetX(): number {
      return this.pageX;
    }
    get offsetY(): number {
      return this.pageY;
    }
    initMouseEvent(
      type: string,
      bubbles = false,
      cancelable = false,
      view: object | null = null,
      detail = 0,
      screenX = 0,
      screenY = 0,
      clientX = 0,
      clientY = 0,
      ctrlKey = false,
      altKey = false,
      shiftKey = false,
      metaKey = false,
      button = 0,
      relatedTarget: EventTarget | null = null,
    ): void {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      const data = mouseData({
        screenX: +screenX >> 0,
        screenY: +screenY >> 0,
        clientX: +clientX >> 0,
        clientY: +clientY >> 0,
        button,
      });
      if (EventSlot.read(this)?.state?.current) return;
      super.initUIEvent(type, bubbles, cancelable, view, detail);
      Object.assign(this.#mouse, {
        screenX: data.screenX,
        screenY: data.screenY,
        clientX: data.clientX,
        clientY: data.clientY,
        button: data.button,
      });
      setRelatedTarget(this, relatedTarget);
      this.#modifiers = updateModifiers(this.#modifiers, { ctrlKey, altKey, shiftKey, metaKey });
    }
    override get [Symbol.toStringTag](): string {
      return "MouseEvent";
    }
  }

  type WheelEventInit = MouseEventInit & {
    deltaX?: number;
    deltaY?: number;
    deltaZ?: number;
    deltaMode?: number;
  };

  class WheelEvent extends MouseEvent {
    declare static readonly DOM_DELTA_PIXEL: 0;
    declare static readonly DOM_DELTA_LINE: 1;
    declare static readonly DOM_DELTA_PAGE: 2;
    declare readonly DOM_DELTA_PIXEL: 0;
    declare readonly DOM_DELTA_LINE: 1;
    declare readonly DOM_DELTA_PAGE: 2;

    static {
      Object.defineProperties(this, wheelModeDescriptors);
      Object.defineProperties(this.prototype, wheelModeDescriptors);
    }

    readonly #delta;
    constructor(type: string, init?: WheelEventInit | null) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      super(type, init ?? undefined);
      this.#delta = {
        x: finiteNumber(init?.deltaX),
        y: finiteNumber(init?.deltaY),
        z: finiteNumber(init?.deltaZ),
        mode: Number(init?.deltaMode) >>> 0,
      };
    }
    get deltaX(): number {
      return this.#delta.x;
    }
    get deltaY(): number {
      return this.#delta.y;
    }
    get deltaZ(): number {
      return this.#delta.z;
    }
    get deltaMode(): number {
      return this.#delta.mode;
    }
    override get [Symbol.toStringTag](): string {
      return "WheelEvent";
    }
  }

  type TouchEventInit = UIEventInit &
    ModifierOptions & {
      touches?: Iterable<unknown>;
      targetTouches?: Iterable<unknown>;
      changedTouches?: Iterable<unknown>;
    };

  function copyTouches(value: Iterable<unknown> | undefined): unknown[] {
    if (value === undefined) return [];
    if (value === null || (typeof value !== "object" && typeof value !== "function"))
      throw new TypeError("Expected an iterable touch list");
    return [...value];
  }

  class TouchEvent extends UIEvent {
    readonly #touch;
    constructor(type: string, init?: TouchEventInit | null) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      super(type, init ?? undefined);
      this.#touch = {
        changed: copyTouches(init?.changedTouches),
        target: copyTouches(init?.targetTouches),
        all: copyTouches(init?.touches),
        altKey: Boolean(init?.altKey),
        ctrlKey: Boolean(init?.ctrlKey),
        metaKey: Boolean(init?.metaKey),
        shiftKey: Boolean(init?.shiftKey),
      };
    }
    get touches(): unknown[] {
      return this.#touch.all;
    }
    get targetTouches(): unknown[] {
      return this.#touch.target;
    }
    get changedTouches(): unknown[] {
      return this.#touch.changed;
    }
    get altKey(): boolean {
      return this.#touch.altKey;
    }
    get ctrlKey(): boolean {
      return this.#touch.ctrlKey;
    }
    get metaKey(): boolean {
      return this.#touch.metaKey;
    }
    get shiftKey(): boolean {
      return this.#touch.shiftKey;
    }
    override get [Symbol.toStringTag](): string {
      return "TouchEvent";
    }
  }

  type PointerEventInit = MouseEventInit &
    Partial<
      Record<
        | "pointerId"
        | "width"
        | "height"
        | "pressure"
        | "tangentialPressure"
        | "tiltX"
        | "tiltY"
        | "twist"
        | "altitudeAngle"
        | "azimuthAngle"
        | "persistentDeviceId",
        number
      >
    > & {
      pointerType?: string;
      isPrimary?: boolean;
      coalescedEvents?: Iterable<PointerEvent>;
      predictedEvents?: Iterable<PointerEvent>;
    };

  function pointerData(init?: PointerEventInit) {
    return {
      pointerId: Number(init?.pointerId) | 0,
      width: finiteNumber(init?.width, 1),
      height: finiteNumber(init?.height, 1),
      pressure: finiteNumber(Math.fround(init?.pressure ?? 0)),
      tangentialPressure: finiteNumber(Math.fround(init?.tangentialPressure ?? 0)),
      tiltX: init?.tiltX === undefined ? undefined : Number(init.tiltX) | 0,
      tiltY: init?.tiltY === undefined ? undefined : Number(init.tiltY) | 0,
      twist: Number(init?.twist) | 0,
      altitudeAngle:
        init?.altitudeAngle === undefined ? undefined : finiteNumber(init.altitudeAngle),
      azimuthAngle: init?.azimuthAngle === undefined ? undefined : finiteNumber(init.azimuthAngle),
      pointerType: init?.pointerType === undefined ? "" : String(init.pointerType),
      isPrimary: Boolean(init?.isPrimary),
      persistentDeviceId: Number(init?.persistentDeviceId) | 0,
      coalescedEvents: Array.from(init?.coalescedEvents ?? []),
      predictedEvents: Array.from(init?.predictedEvents ?? []),
    };
  }

  class PointerEvent extends MouseEvent {
    readonly #pointer: ReturnType<typeof pointerData>;
    constructor(type: string, init?: PointerEventInit) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      super(type, init);
      this.#pointer = pointerData(init);
    }
    get pointerId() {
      return this.#pointer.pointerId;
    }
    get width() {
      return this.#pointer.width;
    }
    get height() {
      return this.#pointer.height;
    }
    get pressure() {
      return this.#pointer.pressure;
    }
    get tangentialPressure() {
      return this.#pointer.tangentialPressure;
    }
    get tiltX() {
      return this.#pointer.tiltX;
    }
    get tiltY() {
      return this.#pointer.tiltY;
    }
    get twist() {
      return this.#pointer.twist;
    }
    get altitudeAngle() {
      return this.#pointer.altitudeAngle;
    }
    get azimuthAngle() {
      return this.#pointer.azimuthAngle;
    }
    get pointerType() {
      return this.#pointer.pointerType;
    }
    get isPrimary() {
      return this.#pointer.isPrimary;
    }
    get persistentDeviceId() {
      return this.#pointer.persistentDeviceId;
    }
    getCoalescedEvents(): PointerEvent[] {
      return this.#pointer.coalescedEvents.slice();
    }
    getPredictedEvents(): PointerEvent[] {
      return this.#pointer.predictedEvents.slice();
    }
    override get [Symbol.toStringTag](): string {
      return "PointerEvent";
    }
  }

  type KeyboardEventInit = UIEventInit &
    ModifierOptions & {
      key?: string;
      code?: string;
      location?: number;
      repeat?: boolean;
      isComposing?: boolean;
      charCode?: number;
      keyCode?: number;
    };

  class KeyboardEvent extends UIEvent {
    readonly #keyboard: Required<
      Pick<
        KeyboardEventInit,
        "key" | "code" | "location" | "repeat" | "isComposing" | "charCode" | "keyCode"
      >
    >;
    #modifiers: Set<string> | undefined;
    declare static readonly DOM_KEY_LOCATION_STANDARD: 0;
    declare static readonly DOM_KEY_LOCATION_LEFT: 1;
    declare static readonly DOM_KEY_LOCATION_RIGHT: 2;
    declare static readonly DOM_KEY_LOCATION_NUMPAD: 3;
    declare readonly DOM_KEY_LOCATION_STANDARD: 0;
    declare readonly DOM_KEY_LOCATION_LEFT: 1;
    declare readonly DOM_KEY_LOCATION_RIGHT: 2;
    declare readonly DOM_KEY_LOCATION_NUMPAD: 3;

    static {
      Object.defineProperties(this, keyLocationDescriptors);
      Object.defineProperties(this.prototype, keyLocationDescriptors);
    }
    constructor(type: string, init?: KeyboardEventInit) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      super(type, init);
      this.#keyboard = {
        key: init?.key === undefined ? "" : String(init.key),
        code: init?.code === undefined ? "" : String(init.code),
        location: Number(init?.location) >>> 0,
        repeat: Boolean(init?.repeat),
        isComposing: Boolean(init?.isComposing),
        charCode: Number(init?.charCode) >>> 0,
        keyCode: Number(init?.keyCode) >>> 0,
      };
      this.#modifiers = modifierState(init);
    }
    get key() {
      return this.#keyboard.key;
    }
    get code() {
      return this.#keyboard.code;
    }
    get location() {
      return this.#keyboard.location;
    }
    get repeat() {
      return this.#keyboard.repeat;
    }
    get isComposing() {
      return this.#keyboard.isComposing;
    }
    get charCode() {
      return this.#keyboard.charCode;
    }
    get keyCode() {
      return this.#keyboard.keyCode;
    }
    get ctrlKey(): boolean {
      return this.#modifiers?.has("Control") ?? false;
    }
    get shiftKey(): boolean {
      return this.#modifiers?.has("Shift") ?? false;
    }
    get altKey(): boolean {
      return this.#modifiers?.has("Alt") ?? false;
    }
    get metaKey(): boolean {
      return this.#modifiers?.has("Meta") ?? false;
    }
    getModifierState(key: string): boolean {
      if (arguments.length < 1) throw new TypeError("A modifier key is required");
      const name = String(key);
      return this.#modifiers?.has(name) ?? false;
    }
    initKeyboardEvent(
      type: string,
      bubbles = false,
      cancelable = false,
      view: object | null = null,
      key = "",
      location = 0,
      ctrlKey = false,
      altKey = false,
      shiftKey = false,
      metaKey = false,
    ): void {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      if (EventSlot.read(this)?.state?.current) return;
      super.initUIEvent(type, bubbles, cancelable, view, 0);
      this.#keyboard.key = String(key);
      this.#keyboard.location = Number(location) >>> 0;
      this.#modifiers = updateModifiers(this.#modifiers, { ctrlKey, altKey, shiftKey, metaKey });
    }
    override get [Symbol.toStringTag](): string {
      return "KeyboardEvent";
    }
  }

  type MessageEventInit = EventInit & {
    data?: unknown;
    origin?: string;
    lastEventId?: string;
    source?: object | null;
    ports?: Iterable<object>;
  };

  function messageData(init?: MessageEventInit, preserveUndefined = false) {
    return {
      data: preserveUndefined ? init?.data : (init?.data ?? null),
      origin: init?.origin === undefined ? "" : String(init.origin).toWellFormed(),
      lastEventId: init?.lastEventId === undefined ? "" : String(init.lastEventId),
      source: init?.source ?? null,
      ports: Object.freeze(Array.from(init?.ports ?? [])),
    };
  }

  const postedMessage = Symbol();
  class MessageEvent extends Event {
    #message: ReturnType<typeof messageData>;
    constructor(type: string, init?: MessageEventInit, key?: symbol) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      super(type, init);
      this.#message = messageData(init, key === postedMessage);
    }
    get data() {
      return this.#message.data;
    }
    get origin() {
      return this.#message.origin;
    }
    get lastEventId() {
      return this.#message.lastEventId;
    }
    get source() {
      return this.#message.source;
    }
    get ports() {
      return this.#message.ports;
    }
    initMessageEvent(
      type: string,
      bubbles = false,
      cancelable = false,
      data: unknown = null,
      origin = "",
      lastEventId = "",
      source: object | null = null,
      ports: Iterable<object> = [],
    ): void {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      if (EventSlot.read(this)?.state?.current) return;
      const next = messageData({ data, origin, lastEventId, source, ports });
      super.initEvent(type, bubbles, cancelable);
      this.#message = next;
    }
    override get [Symbol.toStringTag](): string {
      return "MessageEvent";
    }
  }

  class InputEvent extends UIEvent {
    readonly #data: string | null;
    readonly #inputType: string;
    readonly #isComposing: boolean;
    constructor(
      type: string,
      init?: UIEventInit & { data?: string | null; inputType?: string; isComposing?: boolean },
    ) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      super(`${type}`, init);
      const data = init?.data;
      this.#data = data == null ? null : `${data}`;
      const inputType = init?.inputType;
      this.#inputType = inputType === undefined ? "" : `${inputType}`;
      this.#isComposing = Boolean(init?.isComposing);
    }
    get data(): string | null {
      return this.#data;
    }
    get inputType(): string {
      return this.#inputType;
    }
    get isComposing(): boolean {
      return this.#isComposing;
    }
    override get [Symbol.toStringTag](): string {
      return "InputEvent";
    }
  }

  class CompositionEvent extends UIEvent {
    #data: string;
    constructor(type: string, init?: UIEventInit & { data?: string }) {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      super(type, init);
      this.#data = init?.data === undefined ? "" : String(init.data);
    }
    get data(): string {
      return this.#data;
    }
    initCompositionEvent(
      type: string,
      bubbles = false,
      cancelable = false,
      view: object | null = null,
      data = "",
    ): void {
      if (arguments.length < 1) throw new TypeError("An event type is required");
      if (EventSlot.read(this)?.state?.current) return;
      super.initUIEvent(type, bubbles, cancelable, view, 0);
      this.#data = String(data);
    }
    override get [Symbol.toStringTag](): string {
      return "CompositionEvent";
    }
  }

  function invoke(
    target: object,
    event: Event,
    type: string,
    state: DispatchState,
    capture: boolean,
    inShadow: boolean,
  ): void {
    const phases = listeners.get(target)?.get(type);
    const list = capture ? phases?.capture : phases?.bubble;
    if (!list?.entries.length) return;
    const snapshot = list.entries;
    list.shared = true;
    const context = inShadow ? undefined : eventContexts.get(target);
    for (const entry of snapshot) {
      if (state.immediate) break;
      if (entry.removed) continue;
      if (entry.signal && signalAborted(entry.signal)) {
        removeEntry(list, entry);
        continue;
      }
      if (entry.once) removeEntry(list, entry);
      state.passive = entry.passive;
      const previous = context?.current;
      if (context) context.current = event;
      try {
        if (typeof entry.listener === "function") Reflect.apply(entry.listener, target, [event]);
        else {
          const method: unknown = Reflect.get(entry.listener, "handleEvent");
          if (typeof method !== "function")
            throw new TypeError("EventListener.handleEvent is not callable");
          Reflect.apply(method, entry.listener, [event]);
        }
      } catch (cause) {
        if (entry.reportError) reportCallbackException(entry.listener, cause, entry.reportError);
        else
          queueMicrotask(() => {
            throw cause;
          });
      } finally {
        if (context) context.current = previous;
        state.passive = false;
      }
    }
  }

  function hasPathListeners(path: readonly object[], type: string): boolean {
    for (const node of path) {
      const phases = listeners.get(node)?.get(type);
      if (phases?.capture?.entries.length || phases?.bubble?.entries.length) return true;
    }
    return false;
  }

  class EventTarget {
    addEventListener(type: string, listener: Listener | null, options?: Options): void {
      if (this === undefined || this === null) {
        const target = defaultTarget?.();
        if (!target) throw new TypeError("Expected an EventTarget");
        return Reflect.apply(EventTarget.prototype.addEventListener, target, arguments);
      }
      const settings = listenerOptions(options);
      const capture = Boolean(settings ? settings.capture : options);
      const once = Boolean(settings?.once);
      const passive = settings?.passive;
      const signal = settings?.signal;
      if (signal !== undefined && signalAborted(signal)) return;
      if (!listener) return;
      bindEventContext(this);
      let byType = listeners.get(this);
      if (!byType) listeners.set(this, (byType = new Map()));
      let phases = byType.get(type);
      if (!phases) byType.set(type, (phases = {}));
      const phase = capture ? "capture" : "bubble";
      const list = (phases[phase] ??= { entries: [], shared: false });
      for (const entry of list.entries) {
        if (entry.listener !== listener) continue;
        if (!entry.signal || !signalAborted(entry.signal)) return;
        removeEntry(list, entry);
        break;
      }
      const entry: Entry = {
        listener,
        once,
        passive:
          passive === undefined
            ? (type === "touchstart" ||
                type === "touchmove" ||
                type === "wheel" ||
                type === "mousewheel") &&
              isDefaultPassiveTarget?.(this) === true
            : Boolean(passive),
        signal,
        removed: false,
        reportError,
      };
      if (signal) entry.abortCleanup = watchAbort(signal, list, entry);
      writableEntries(list).push(entry);
    }

    removeEventListener(type: string, listener: Listener | null, options?: Options): void {
      if (this === undefined || this === null) {
        const target = defaultTarget?.();
        if (!target) throw new TypeError("Expected an EventTarget");
        return Reflect.apply(EventTarget.prototype.removeEventListener, target, arguments);
      }
      const settings = listenerOptions(options);
      const capture = Boolean(settings ? settings.capture : options);
      const phases = listeners.get(this)?.get(type);
      const list = capture ? phases?.capture : phases?.bubble;
      if (!list) return;
      const entry = list.entries.find((entry) => entry.listener === listener);
      if (entry) removeEntry(list, entry);
    }

    dispatchEvent(event: Event): boolean {
      if (this === undefined || this === null) {
        const target = defaultTarget?.();
        if (!target) throw new TypeError("Expected an EventTarget");
        return Reflect.apply(EventTarget.prototype.dispatchEvent, target, arguments);
      }
      const record = eventRecord(event);
      if (record.uninitialized)
        throw new Exception("Event is not initialized", "InvalidStateError");
      const previousState = record.state;
      if (previousState?.current)
        throw new Exception("Event is already being dispatched", "InvalidStateError");
      const trust = record.trust;
      if (trust === false) record.trust = true;
      else if (trust === true) record.trust = undefined;
      const legacyTarget = trust === false ? legacyTargets.get(event) : undefined;
      if (legacyTarget) legacyTargets.delete(event);
      const target = legacyTarget ?? this;
      const related = record.related;
      const initialRelated = related && retarget(related, this);
      if (initialRelated === this && related !== this) {
        if (previousState) previousState.stopped = previousState.immediate = false;
        else record.stoppedEarly = false;
        return !eventCanceled(event);
      }
      const adjustedRelated = initialRelated ? [initialRelated] : undefined;
      const path: object[] = [this];
      let targets: object[] | undefined;
      let hasClosedRoot = false;
      let hasShadowPath = false;
      let adjustedTarget = target;
      let clearTarget = false;
      let originalRoot: object | undefined;
      let current: object = this;
      // initEvent is ignored while dispatching, so the type cannot change below.
      const type = event.type;
      const isLoad = type === "load";
      // Snapshot the path before any listener can change the tree.
      for (;;) {
        const slot = assignedSlot?.(current);
        const direct = slot ?? parent.get(current);
        if (direct) {
          // A Document has no event parent for load, including synthetic dispatch.
          if (isLoad && isWindow?.(direct)) break;
          current = direct;
        } else {
          const boundary = shadowParents.get(current);
          if (!boundary) break;
          hasShadowPath = true;
          hasClosedRoot ||= boundary.closed;
          originalRoot ??= shadowRootFor(this);
          if (!event.composed && current === originalRoot) {
            clearTarget = true;
            break;
          }
          if (shadowRootFor(adjustedTarget) === current) {
            if (related && retarget(related, boundary.host) === boundary.host) {
              clearTarget = true;
              break;
            }
            targets ??= Array<object>(path.length).fill(target);
            adjustedTarget = boundary.host;
          }
          current = boundary.host;
        }
        path.push(current);
        targets?.push(adjustedTarget);
        if (related) adjustedRelated?.push(retarget(related, current));
      }
      const lastRelated = adjustedRelated?.at(-1);
      if (lastRelated && shadowRootFor(lastRelated)) clearTarget = true;
      const shadowItems = hasShadowPath
        ? path.map((item) => shadowRootFor(item) !== undefined)
        : undefined;
      const closedMembership = hasClosedRoot
        ? new Map(path.map((item) => [item, closedRootsFor(item)]))
        : undefined;
      const state: DispatchState = {
        target,
        current: null,
        path,
        closedMembership,
        relatedTarget: undefined,
        phase: 0,
        stopped: previousState?.stopped ?? record.stoppedEarly,
        immediate: false,
        passive: false,
      };
      record.stoppedEarly = false;
      record.state = state;
      const finishActivation =
        type === "click" && record.mouse ? activation?.(path, event as MouseEvent) : undefined;
      // With no listener on the path after pre-activation, no author code can run before the
      // dispatch completes: propagation would only rewrite state that is reset below, so it is
      // skipped by starting stopped (the flag is cleared below). Related targets keep the full
      // walk because their final value comes from it.
      if (!related && !hasPathListeners(path, type)) state.stopped = true;
      for (let index = path.length - 1; index > 0 && !state.stopped; index--) {
        const ancestor = path[index];
        if (!ancestor) continue;
        state.target = targets?.[index] ?? target;
        if (adjustedRelated) state.relatedTarget = adjustedRelated[index] ?? null;
        state.phase = state.target === ancestor ? 2 : 1;
        state.current = ancestor;
        invoke(ancestor, event, type, state, true, shadowItems?.[index] ?? false);
      }
      if (!state.stopped) {
        state.target = target;
        if (initialRelated) state.relatedTarget = initialRelated;
        state.phase = 2;
        state.current = this;
        invoke(this, event, type, state, true, shadowItems?.[0] ?? false);
        if (!state.stopped) invoke(this, event, type, state, false, shadowItems?.[0] ?? false);
      }
      if (event.bubbles || targets) {
        for (let index = 1; index < path.length && !state.stopped; index++) {
          const ancestor = path[index];
          if (!ancestor) continue;
          state.target = targets?.[index] ?? target;
          const atTarget = state.target === ancestor;
          if (!atTarget && !event.bubbles) continue;
          if (adjustedRelated) state.relatedTarget = adjustedRelated[index] ?? null;
          state.phase = atTarget ? 2 : 3;
          state.current = ancestor;
          invoke(ancestor, event, type, state, false, shadowItems?.[index] ?? false);
        }
      }
      state.target = clearTarget ? null : adjustedTarget;
      if (related) {
        const finalRelated = clearTarget ? null : (state.relatedTarget ?? null);
        setRelatedTarget(event, finalRelated);
        state.relatedTarget = finalRelated;
      }
      state.current = null;
      state.phase = 0;
      state.path = emptyPath;
      state.closedMembership = undefined;
      state.stopped = state.immediate = false;
      finishActivation?.(eventCanceled(event));
      return !eventCanceled(event);
    }
  }

  for (const name of ["addEventListener", "removeEventListener", "dispatchEvent"]) {
    Object.defineProperty(EventTarget.prototype, name, { enumerable: true });
  }

  function createAbortInterfaces(scheduleTimeout: (callback: () => void, delay: number) => number) {
    const NativeSignal = globalThis.AbortSignal;
    const NativeController = globalThis.AbortController;
    const NativeEvent = globalThis.Event;
    const nativeAdd = NativeSignal.prototype.addEventListener;
    const nativeRemove = NativeSignal.prototype.removeEventListener;
    const nativeDispatch = NativeSignal.prototype.dispatchEvent;
    const retainedSignals = new WeakSet<AbortSignal>();
    const keepSignalAlive = () => {};
    const defaultReason = () => new Exception("This operation was aborted", "AbortError");

    // Native composite signals retain active subscriptions through Node’s listener hooks.
    function updateSignalRetention(signal: AbortSignal): void {
      if (!retainedSignals.has(signal) || signal.aborted) return;
      const phases = listeners.get(signal)?.get("abort");
      if (phases?.capture?.entries.length || phases?.bubble?.entries.length)
        Reflect.apply(nativeAdd, signal, ["abort", keepSignalAlive, { once: true }]);
      else Reflect.apply(nativeRemove, signal, ["abort", keepSignalAlive]);
    }

    type AbortHandler = (event: globalThis.Event) => unknown;
    const abortHandlers = new WeakMap<
      AbortSignal,
      { handler: AbortHandler; listener: (event: Event) => void }
    >();

    class AbortSignal extends NativeSignal {
      static override abort(reason?: unknown): AbortSignal {
        return wrapSignal(NativeSignal.abort(reason === undefined ? defaultReason() : reason));
      }
      static override timeout(milliseconds: number): AbortSignal {
        const delay = Math.trunc(+milliseconds);
        if (!Number.isFinite(delay) || delay < 0 || delay >= 2 ** 64)
          throw new TypeError("Timeout must be an unsigned long long");
        const controller = new AbortController();
        const signal = controller.signal;
        scheduleTimeout(
          () => controller.abort(new Exception("The operation timed out.", "TimeoutError")),
          delay,
        );
        return signal;
      }
      static override any(signals: globalThis.AbortSignal[]): AbortSignal {
        const signal = wrapSignal(NativeSignal.any(signals));
        retainedSignals.add(signal);
        return signal;
      }
      override addEventListener(
        type: string,
        listener: Listener | Parameters<typeof nativeAdd>[1] | null,
        options?: Options,
      ): void {
        // Node supplies symbol-keyed options for its internal abort subscriptions.
        if (
          options &&
          typeof options === "object" &&
          Object.getOwnPropertySymbols(options).length
        ) {
          Reflect.apply(nativeAdd, this, [type, listener, options]);
          return;
        }
        Reflect.apply(EventTarget.prototype.addEventListener, this, [type, listener, options]);
        if (type === "abort") updateSignalRetention(this);
      }
      override removeEventListener(
        type: string,
        listener: Listener | Parameters<typeof nativeAdd>[1] | null,
        options?: Options,
      ): void {
        Reflect.apply(nativeRemove, this, [type, listener, options]);
        Reflect.apply(EventTarget.prototype.removeEventListener, this, [type, listener, options]);
        if (type === "abort") updateSignalRetention(this);
      }
      override dispatchEvent(event: Event | globalThis.Event): boolean {
        if (event instanceof NativeEvent && event.type === "abort" && event.isTrusted) {
          const result = Reflect.apply(nativeDispatch, this, [event]);
          const abort = new Event("abort");
          eventRecord(abort).trust = false;
          Reflect.apply(EventTarget.prototype.dispatchEvent, this, [abort]);
          return result;
        }
        const result = Reflect.apply(EventTarget.prototype.dispatchEvent, this, [event]);
        if (event.type === "abort") updateSignalRetention(this);
        return result;
      }
      override get onabort(): AbortHandler | null {
        return abortHandlers.get(this)?.handler ?? null;
      }
      override set onabort(value: AbortHandler | null) {
        const existing = abortHandlers.get(this);
        if (typeof value !== "function") {
          if (existing) this.removeEventListener("abort", existing.listener);
          abortHandlers.delete(this);
        } else if (existing) {
          existing.handler = value;
        } else {
          const slot = {
            handler: value,
            listener: (event: Event) => {
              const handler = slot.handler;
              Reflect.apply(handler, this, [event]);
            },
          };
          abortHandlers.set(this, slot);
          this.addEventListener("abort", slot.listener);
        }
      }
    }

    function wrapSignal(signal: globalThis.AbortSignal): AbortSignal {
      if (Object.getPrototypeOf(signal) !== AbortSignal.prototype)
        Object.setPrototypeOf(signal, AbortSignal.prototype);
      return signal as AbortSignal;
    }

    class AbortController extends NativeController {
      override get signal(): AbortSignal {
        return wrapSignal(super.signal);
      }
      override abort(reason?: unknown): void {
        super.abort(reason === undefined ? defaultReason() : reason);
      }
    }

    // Bundling deconflicts these names against the native constructors above.
    Object.defineProperty(AbortSignal, "name", { value: "AbortSignal", configurable: true });
    Object.defineProperty(AbortController, "name", {
      value: "AbortController",
      configurable: true,
    });
    eventContexts.set(AbortSignal.prototype, eventContext);
    return { AbortController, AbortSignal };
  }

  eventContexts.set(EventTarget.prototype, eventContext);

  return {
    Event,
    BeforeUnloadEvent,
    CloseEvent,
    TransitionEvent,
    PageTransitionEvent,
    BlobEvent,
    PromiseRejectionEvent,
    DeviceMotionEvent,
    DeviceMotionEventAcceleration,
    DeviceMotionEventRotationRate,
    DeviceOrientationEvent,
    createBeforeUnloadEvent(): BeforeUnloadEvent {
      return new BeforeUnloadEvent(eventConstructionKey, "");
    },
    CustomEvent,
    UIEvent,
    FocusEvent,
    MouseEvent,
    WheelEvent,
    TouchEvent,
    PointerEvent,
    KeyboardEvent,
    MessageEvent,
    createPostedMessage(data: unknown): MessageEvent {
      const event = new MessageEvent("message", { data }, postedMessage);
      eventRecord(event).trust = false;
      return event;
    },
    CompositionEvent,
    InputEvent,
    EventTarget,
    createAbortInterfaces,
    currentEvent: () => eventContext.current as Event | undefined,
    parent,
    relatedTargetOf,
    linkShadow(root: EventTarget, host: EventTarget, closed: boolean): void {
      shadowParents.set(root, { host, closed });
    },
    trusted<T extends Event>(event: T, legacyTarget?: object): T {
      eventRecord(event).trust = false;
      if (legacyTarget) legacyTargets.set(event, legacyTarget);
      return event;
    },
    legacy<T extends Event>(event: T): T {
      eventRecord(event).uninitialized = true;
      return event;
    },
    hasListeners(target: EventTarget): boolean {
      const byType = listeners.get(target);
      if (!byType) return false;
      for (const { capture, bubble } of byType.values()) {
        if (capture?.entries.length || bubble?.entries.length) return true;
      }
      return false;
    },
    clear(target: EventTarget): void {
      const byType = listeners.get(target);
      if (!byType) return;
      listeners.delete(target);
      for (const { capture, bubble } of byType.values()) {
        for (const list of [capture, bubble]) {
          if (!list) continue;
          while (list.entries.length) {
            const entry = list.entries.at(-1);
            if (entry) removeEntry(list, entry, list.entries.length - 1);
          }
        }
      }
    },
  };
}
