// Implements Navigator's legacy plugin interfaces for a Window without a PDF viewer.
function requireArgument(count: number): void {
  if (count === 0) throw new TypeError("A lookup argument is required");
}

/** Creates the Window-local plugin constructors and stable empty collections. */
export function createNavigatorPlugins() {
  const key = Symbol();

  function illegalInvocation(): never {
    throw new TypeError("Illegal invocation");
  }

  class Plugin {
    readonly [index: number]: MimeType | undefined;
    constructor() {
      throw new TypeError("Illegal constructor");
    }
    get name(): string {
      return illegalInvocation();
    }
    get description(): string {
      return illegalInvocation();
    }
    get filename(): string {
      return illegalInvocation();
    }
    get length(): number {
      return illegalInvocation();
    }
    item(_index: number): MimeType | null {
      return illegalInvocation();
    }
    namedItem(_name: string): MimeType | null {
      return illegalInvocation();
    }
    get [Symbol.toStringTag](): string {
      return "Plugin";
    }
  }

  class MimeType {
    constructor() {
      throw new TypeError("Illegal constructor");
    }
    get type(): string {
      return illegalInvocation();
    }
    get description(): string {
      return illegalInvocation();
    }
    get suffixes(): string {
      return illegalInvocation();
    }
    get enabledPlugin(): Plugin {
      return illegalInvocation();
    }
    get [Symbol.toStringTag](): string {
      return "MimeType";
    }
  }

  class PluginArray {
    readonly [index: number]: Plugin | undefined;
    #empty = 0;
    constructor(token: symbol) {
      if (token !== key) throw new TypeError("Illegal constructor");
    }
    get length(): number {
      return this.#empty;
    }
    item(index: number): Plugin | null {
      if (!(#empty in this)) return illegalInvocation();
      requireArgument(arguments.length);
      void (+index >>> 0);
      return null;
    }
    namedItem(name: string): Plugin | null {
      if (!(#empty in this)) return illegalInvocation();
      requireArgument(arguments.length);
      void `${name}`;
      return null;
    }
    refresh(): void {
      if (!(#empty in this)) illegalInvocation();
    }
    get [Symbol.toStringTag](): string {
      return "PluginArray";
    }
  }

  class MimeTypeArray {
    readonly [index: number]: MimeType | undefined;
    #empty = 0;
    constructor(token: symbol) {
      if (token !== key) throw new TypeError("Illegal constructor");
    }
    get length(): number {
      return this.#empty;
    }
    item(index: number): MimeType | null {
      if (!(#empty in this)) return illegalInvocation();
      requireArgument(arguments.length);
      void (+index >>> 0);
      return null;
    }
    namedItem(name: string): MimeType | null {
      if (!(#empty in this)) return illegalInvocation();
      requireArgument(arguments.length);
      void `${name}`;
      return null;
    }
    get [Symbol.toStringTag](): string {
      return "MimeTypeArray";
    }
  }

  let plugins: PluginArray | undefined;
  let mimeTypes: MimeTypeArray | undefined;
  return {
    Plugin,
    MimeType,
    PluginArray,
    MimeTypeArray,
    plugins: () => (plugins ??= new PluginArray(key)),
    mimeTypes: () => (mimeTypes ??= new MimeTypeArray(key)),
  };
}
