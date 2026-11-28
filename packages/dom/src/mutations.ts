// Queues Window-local DOM mutation records without retaining observed targets.
import type { DefaultTreeAdapterTypes as Raw } from "parse5";
import { reportCallbackException } from "./script-realm.js";

type ObserveOptions = {
  childList?: boolean;
  attributes?: boolean;
  characterData?: boolean;
  subtree?: boolean;
  attributeOldValue?: boolean;
  characterDataOldValue?: boolean;
  attributeFilter?: Iterable<string>;
};

type Registration = {
  childList: boolean;
  attributes: boolean;
  characterData: boolean;
  subtree: boolean;
  attributeOldValue: boolean;
  characterDataOldValue: boolean;
  filter?: Set<string>;
};
type Change =
  | {
      type: "attributes";
      target: Raw.Node;
      name: string;
      namespace?: string;
      oldValue: string | null;
    }
  | { type: "characterData"; target: Raw.Node; oldValue: string }
  | {
      type: "childList";
      target: Raw.Node;
      added: readonly Raw.ChildNode[];
      removed: readonly Raw.ChildNode[];
      previous?: Raw.ChildNode;
      next?: Raw.ChildNode;
    };

function registration(options: ObserveOptions): Registration {
  const attributes =
    options.attributes === undefined
      ? options.attributeOldValue !== undefined || options.attributeFilter !== undefined
      : Boolean(options.attributes);
  const characterData =
    options.characterData === undefined
      ? options.characterDataOldValue !== undefined
      : Boolean(options.characterData);
  const childList = Boolean(options.childList);
  if (!attributes && !characterData && !childList)
    throw new TypeError("At least one mutation observation type is required");
  if (!attributes && (options.attributeOldValue || options.attributeFilter !== undefined))
    throw new TypeError("Attribute options require attributes to be observed");
  if (!characterData && options.characterDataOldValue)
    throw new TypeError("characterDataOldValue requires characterData to be observed");
  return {
    attributes,
    characterData,
    childList,
    subtree: Boolean(options.subtree),
    attributeOldValue: Boolean(options.attributeOldValue),
    characterDataOldValue: Boolean(options.characterDataOldValue),
    ...(options.attributeFilter === undefined
      ? {}
      : { filter: new Set(Array.from(options.attributeFilter, String)) }),
  };
}

function matches(settings: Registration, change: Change, ancestor: boolean): boolean {
  if (!settings[change.type] || (ancestor && !settings.subtree)) return false;
  return (
    change.type !== "attributes" ||
    !settings.filter ||
    (change.namespace === undefined && settings.filter.has(change.name))
  );
}

type RegisteredObserver = {
  transients: Map<Raw.Node, Set<Registration>>;
  enqueue: (change: Change, includeOldValue: boolean) => void;
  deliver: () => void;
};

const observed = new WeakMap<Raw.Node, Map<RegisteredObserver, Registration>>();
const transientObserved = new WeakMap<Raw.Node, Map<RegisteredObserver, Set<Registration>>>();
const scheduled = new Set<RegisteredObserver>();
const afterObservers = new Map<object, () => void>();
let pending = false;
let registrationCount = 0;

const registrationCleanup = new FinalizationRegistry<{
  targets: Set<WeakRef<Raw.Node>>;
  reference: WeakRef<Raw.Node>;
}>(({ targets, reference }) => {
  if (targets.delete(reference)) registrationCount--;
});

export function mutationObserversActive(): boolean {
  return registrationCount !== 0;
}

/** Installs the interfaces that construct records and invoke callbacks in a Window's realm. */
export function createMutationObservers<Node, Nodes>(context: {
  raw: (node: Node) => Raw.Node;
  wrap: (node: Raw.Node) => Node;
  list: (nodes: readonly Raw.Node[]) => Nodes;
  report: (cause: unknown) => void;
}) {
  const token = Symbol();

  /** Narrows a getter receiver to a record, rejecting foreign receivers as the Web IDL brand check does. */
  function changeOf(receiver: unknown): MutationRecord {
    if (!MutationRecord.is(receiver)) throw new TypeError("Illegal invocation");
    return receiver;
  }

  // Members are prototype accessors as in jsdom; node lists are built on first read and kept.
  class MutationRecord {
    readonly #change: Change;
    readonly #target: Node;
    readonly #previousSibling: Node | null;
    readonly #nextSibling: Node | null;
    readonly #includeOldValue: boolean;
    #addedNodes: Nodes | undefined;
    #removedNodes: Nodes | undefined;
    constructor(key: symbol, change: Change, includeOldValue: boolean) {
      if (key !== token) throw new TypeError("Illegal constructor");
      this.#change = change;
      this.#target = context.wrap(change.target);
      this.#previousSibling =
        change.type === "childList" && change.previous ? context.wrap(change.previous) : null;
      this.#nextSibling =
        change.type === "childList" && change.next ? context.wrap(change.next) : null;
      this.#includeOldValue = includeOldValue;
    }
    static is(value: unknown): value is MutationRecord {
      return typeof value === "object" && value !== null && #change in value;
    }
    static {
      for (const name of [
        "type",
        "target",
        "addedNodes",
        "removedNodes",
        "previousSibling",
        "nextSibling",
        "attributeName",
        "attributeNamespace",
        "oldValue",
      ])
        Object.defineProperty(this.prototype, name, { enumerable: true });
      Object.defineProperty(this.prototype, Symbol.toStringTag, {
        value: "MutationRecord",
        configurable: true,
      });
    }
    get type(): Change["type"] {
      return changeOf(this).#change.type;
    }
    get target(): Node {
      return changeOf(this).#target;
    }
    get addedNodes(): Nodes {
      const record = changeOf(this);
      const change = record.#change;
      return (record.#addedNodes ??= context.list(change.type === "childList" ? change.added : []));
    }
    get removedNodes(): Nodes {
      const record = changeOf(this);
      const change = record.#change;
      return (record.#removedNodes ??= context.list(
        change.type === "childList" ? change.removed : [],
      ));
    }
    get previousSibling(): Node | null {
      return changeOf(this).#previousSibling;
    }
    get nextSibling(): Node | null {
      return changeOf(this).#nextSibling;
    }
    get attributeName(): string | null {
      const change = changeOf(this).#change;
      return change.type === "attributes" ? change.name : null;
    }
    get attributeNamespace(): string | null {
      const change = changeOf(this).#change;
      return change.type === "attributes" ? (change.namespace ?? null) : null;
    }
    get oldValue(): string | null {
      const record = changeOf(this);
      const change = record.#change;
      return record.#includeOldValue && change.type !== "childList" ? change.oldValue : null;
    }
  }

  type State = RegisteredObserver & {
    records: MutationRecord[];
    targets: Set<WeakRef<Raw.Node>>;
  };
  const states = new WeakMap<MutationObserver, State>();
  function stateFor(observer: MutationObserver): State {
    const state = states.get(observer);
    if (!state) throw new TypeError("Illegal invocation");
    return state;
  }

  class MutationObserver {
    constructor(callback: (records: MutationRecord[], observer: MutationObserver) => unknown) {
      if (typeof callback !== "function")
        throw new TypeError("Expected a mutation observer callback");
      const targets = new Set<WeakRef<Raw.Node>>();
      const state: State = {
        targets,
        records: [],
        transients: new Map(),
        enqueue(change, includeOldValue) {
          state.records.push(new MutationRecord(token, change, includeOldValue));
        },
        deliver: () => {
          const records = state.records;
          state.records = [];
          if (!records.length) return;
          try {
            callback.call(this, records, this);
          } catch (cause) {
            reportCallbackException(callback, cause, context.report);
          }
        },
      };
      states.set(this, state);
    }
    observe(target: Node, options: ObserveOptions = {}): void {
      const node = context.raw(target);
      const settings = registration(options);
      const state = stateFor(this);
      let registrations = observed.get(node);
      if (!registrations) observed.set(node, (registrations = new Map()));
      const previous = registrations.get(state);
      if (previous) clearTransients(state, previous);
      else {
        const reference = new WeakRef(node);
        state.targets.add(reference);
        registrationCleanup.register(node, { targets: state.targets, reference }, reference);
        registrationCount++;
      }
      registrations.set(state, settings);
    }
    disconnect(): void {
      const state = stateFor(this);
      for (const reference of state.targets) {
        const target = reference.deref();
        if (target) observed.get(target)?.delete(state);
        if (registrationCleanup.unregister(reference)) registrationCount--;
      }
      state.targets.clear();
      clearTransients(state);
      state.records.length = 0;
      scheduled.delete(state);
    }
    takeRecords(): MutationRecord[] {
      const state = stateFor(this);
      const records = state.records;
      state.records = [];
      return records;
    }
  }

  return { MutationObserver, MutationRecord };
}

function clearTransients(observer: RegisteredObserver, source?: Registration): void {
  for (const [node, registrations] of observer.transients) {
    if (source) registrations.delete(source);
    if (source && registrations.size) continue;
    transientObserved.get(node)?.delete(observer);
    observer.transients.delete(node);
    registrationCount--;
  }
}

function* registrationsFor(node: Raw.Node): Iterable<[RegisteredObserver, Registration]> {
  yield* observed.get(node) ?? [];
  const transient = transientObserved.get(node);
  if (transient) {
    for (const [observer, sources] of transient)
      for (const source of sources) yield [observer, source];
  }
}

export function retainRemovedSubtree(root: Raw.Node, previousParent: Raw.Node): void {
  if (!registrationCount) return;
  for (
    let node: Raw.Node | null = previousParent;
    node;
    node = "parentNode" in node ? node.parentNode : null
  ) {
    for (const [observer, settings] of registrationsFor(node)) {
      if (!settings.subtree) continue;
      let sources = observer.transients.get(root);
      if (!sources) {
        sources = new Set();
        observer.transients.set(root, sources);
        registrationCount++;
        let observers = transientObserved.get(root);
        if (!observers) transientObserved.set(root, (observers = new Map()));
        observers.set(observer, sources);
      }
      sources.add(settings);
      scheduled.add(observer);
    }
  }
  if (scheduled.size) schedule();
}

function deliver(): void {
  pending = false;
  const batch = Array.from(scheduled);
  const callbacks = [...afterObservers.values()];
  scheduled.clear();
  afterObservers.clear();
  for (const observer of batch) {
    clearTransients(observer);
    observer.deliver();
  }
  for (const callback of callbacks) callback();
}

function schedule(): void {
  if (pending) return;
  pending = true;
  queueMicrotask(deliver);
}

export function queueMutation(change: Change): void {
  if (!registrationCount) return;
  let recipients: Map<RegisteredObserver, boolean> | undefined;
  // Parent links are acyclic and terminate at the tree root.
  for (
    let node: Raw.Node | null = change.target;
    node;
    node = "parentNode" in node ? node.parentNode : null
  ) {
    if (!observed.has(node) && !transientObserved.has(node)) continue;
    for (const [observer, settings] of registrationsFor(node)) {
      if (!matches(settings, change, node !== change.target)) continue;
      const oldValue =
        change.type === "attributes"
          ? settings.attributeOldValue
          : change.type === "characterData" && settings.characterDataOldValue;
      recipients ??= new Map();
      recipients.set(observer, Boolean(recipients.get(observer) || oldValue));
    }
  }
  if (!recipients) return;
  for (const [observer, includeOldValue] of recipients) {
    observer.enqueue(change, includeOldValue);
    scheduled.add(observer);
  }
  if (scheduled.size) schedule();
}

export function queueAfterObservers(key: object, callback: () => void): void {
  afterObservers.set(key, callback);
  schedule();
}
