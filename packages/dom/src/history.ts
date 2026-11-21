// Owns same-document history entries and URL rewrite rules.
type HistoryContext = {
  readURL: () => URL;
  readBaseURL: () => string;
  parseURL: (value: string, base: string) => URL | null;
  activate: (url: URL) => void;
  dispatchTraversal: (state: unknown, previous: URL, next: URL) => void;
  isClosed: () => boolean;
  reload: () => void;
  Exception: typeof DOMException;
  queueTraversal: (callback: () => void) => void;
};

function canRewrite(current: URL, next: URL): boolean {
  if (
    current.protocol !== next.protocol ||
    current.username !== next.username ||
    current.password !== next.password ||
    current.host !== next.host
  )
    return false;
  if (current.protocol === "http:" || current.protocol === "https:") return true;
  return current.pathname === next.pathname && current.search === next.search;
}

/** Creates the History interface and the entry list for one Window. */
export function createHistory(context: HistoryContext) {
  type Entry = { url: URL; state: unknown };
  const entries: Entry[] = [{ url: context.readURL(), state: null }];
  let index = 0;
  let traversalGeneration = 0;
  const token = Symbol();

  function assertActive(): void {
    if (context.isClosed())
      throw new context.Exception(
        "History belongs to a document that is not fully active",
        "SecurityError",
      );
  }

  function update(state: unknown, target: string | null | undefined, replace: boolean): void {
    assertActive();
    const active = context.readURL();
    const value = target == null ? "" : String(target);
    const base = value === "" ? active.href : context.readBaseURL();
    const method = replace ? "replaceState" : "pushState";
    const next = value === "" ? active : context.parseURL(value, base);
    if (!next)
      throw new context.Exception(
        `Could not parse url argument "${value}" to ${method}() against base URL "${base}".`,
        "SecurityError",
      );
    if (!canRewrite(active, next))
      throw new context.Exception(
        `${method}() cannot update history to the URL ${next.href}.`,
        "SecurityError",
      );

    const entry = { url: next, state };
    if (replace) entries[index] = entry;
    else {
      traversalGeneration++;
      entries.splice(index + 1, entries.length, entry);
      index++;
    }
    context.activate(next);
  }

  class History {
    constructor(key: symbol) {
      if (key !== token) throw new TypeError("Illegal constructor");
    }
    get length(): number {
      assertActive();
      return entries.length;
    }
    get state(): unknown {
      assertActive();
      return entries[index]?.state;
    }
    pushState(state: unknown, title: string, target?: string | null): void {
      if (arguments.length < 2) throw new TypeError("pushState requires two arguments");
      String(title);
      update(state, target, false);
    }
    replaceState(state: unknown, title: string, target?: string | null): void {
      if (arguments.length < 2) throw new TypeError("replaceState requires two arguments");
      String(title);
      update(state, target, true);
    }
    go(delta = 0): void {
      assertActive();
      const offset = Number(delta) | 0;
      if (offset === 0) {
        context.reload();
        return;
      }
      const generation = traversalGeneration;
      context.queueTraversal(() => {
        if (generation !== traversalGeneration) return;
        const target = index + offset;
        const entry = entries[target];
        if (!entry) return;
        const previous = context.readURL();
        index = target;
        context.activate(entry.url);
        context.dispatchTraversal(entry.state, previous, entry.url);
      });
    }
    back(): void {
      this.go(-1);
    }
    forward(): void {
      this.go(1);
    }
  }

  return {
    History,
    history: new History(token),
    cancelTraversal(): void {
      traversalGeneration++;
    },
    reconfigure(url: URL): void {
      const entry = entries[index];
      if (entry) entry.url = url;
    },
  };
}
