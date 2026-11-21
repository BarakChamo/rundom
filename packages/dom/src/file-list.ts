// Owns live FileList and DataTransfer item stores without reading from disk.
type Files = { read: () => readonly File[]; clear: () => void };
const fileStores = new WeakMap<object, Files>();

function indexed<T extends object, Entry>(target: T, read: () => readonly Entry[]): T {
  const index = (key: PropertyKey) =>
    typeof key === "string" && /^(0|[1-9]\d*)$/.test(key) && Number(key) < 0xffffffff
      ? Number(key)
      : undefined;
  return new Proxy(target, {
    get(target, key, receiver) {
      const position = index(key);
      return position === undefined ? Reflect.get(target, key, receiver) : read()[position];
    },
    has(target, key) {
      const position = index(key);
      return position === undefined ? Reflect.has(target, key) : position < read().length;
    },
    ownKeys(target) {
      return [
        ...Array.from({ length: read().length }, (_, position) => String(position)),
        ...Reflect.ownKeys(target),
      ];
    },
    getOwnPropertyDescriptor(target, key) {
      const position = index(key);
      if (position === undefined) return Reflect.getOwnPropertyDescriptor(target, key);
      const value = read()[position];
      return value === undefined
        ? undefined
        : { value, enumerable: true, configurable: true, writable: false };
    },
    defineProperty(target, key, descriptor) {
      return index(key) === undefined && Reflect.defineProperty(target, key, descriptor);
    },
    preventExtensions: () => false,
  });
}

/** Creates Window-local file and drag-data interfaces with shared FileList branding. */
export function createFileLists(
  queue: (callback: () => void) => void,
  DOMException: typeof globalThis.DOMException,
) {
  const token = Symbol();
  class FileList {
    readonly [index: number]: File | undefined;
    constructor(key: symbol | undefined = undefined, store?: Files) {
      if (key !== token || !store) throw new TypeError("Illegal constructor");
      const list = indexed(this, store.read);
      fileStores.set(list, store);
      return list;
    }
    get length(): number {
      return storeOf(this).read().length;
    }
    item(index: number): File | null {
      if (arguments.length === 0) throw new TypeError("Expected an index");
      return storeOf(this).read()[Number(index) >>> 0] ?? null;
    }
    *[Symbol.iterator](): IterableIterator<File> {
      yield* storeOf(this).read();
    }
    get [Symbol.toStringTag](): string {
      return "FileList";
    }
  }

  function storeOf(list: FileList): Files {
    const store = fileStores.get(list);
    if (!store) throw new TypeError("Expected a FileList");
    return store;
  }

  const disabledItems = new WeakSet<DataTransferItem>();

  class DataTransferItem {
    readonly #data: string | File;
    readonly #type: string;
    constructor(key: symbol, data: string | File, type: string) {
      if (key !== token) throw new TypeError("Illegal constructor");
      this.#data = data;
      this.#type = type;
    }
    get kind(): "" | "string" | "file" {
      if (disabledItems.has(this)) return "";
      return typeof this.#data === "string" ? "string" : "file";
    }
    get type(): string {
      return disabledItems.has(this) ? "" : this.#type;
    }
    getAsFile(): File | null {
      return disabledItems.has(this) || typeof this.#data === "string" ? null : this.#data;
    }
    getAsString(callback: ((data: string) => void) | null): void {
      const data = this.#data;
      if (!disabledItems.has(this) && typeof data === "string" && typeof callback === "function")
        queue(() => callback(data));
    }
    get [Symbol.toStringTag](): string {
      return "DataTransferItem";
    }
  }

  type Entry = { item: DataTransferItem; data: string | File };
  const itemStores = new WeakMap<object, Entry[]>();
  function entriesOf(list: DataTransferItemList): Entry[] {
    const entries = itemStores.get(list);
    if (!entries) throw new TypeError("Illegal invocation");
    return entries;
  }
  function makeEntry(data: string | File, type: string): Entry {
    return { item: new DataTransferItem(token, data, type), data };
  }

  function removeEntry(entries: Entry[], index: number): void {
    const entry = entries[index];
    if (!entry) return;
    disabledItems.add(entry.item);
    entries.splice(index, 1);
  }

  class DataTransferItemList {
    readonly [index: number]: DataTransferItem | undefined;
    constructor(key: symbol, entries: Entry[]) {
      if (key !== token) throw new TypeError("Illegal constructor");
      const list = indexed(this, () => entries.map(({ item }) => item));
      itemStores.set(list, entries);
      return list;
    }
    get length(): number {
      return entriesOf(this).length;
    }
    add(file: File): DataTransferItem;
    add(data: string, type: string): DataTransferItem;
    add(data: File | string, type?: string): DataTransferItem {
      if (arguments.length === 0 || (arguments.length === 1 && !(data instanceof File))) {
        throw new TypeError("Expected a File or string and type");
      }
      const entries = entriesOf(this);
      const format =
        arguments.length === 1 && data instanceof File ? data.type : String(type).toLowerCase();
      const value = arguments.length === 1 ? data : String(data);
      if (
        typeof value === "string" &&
        entries.some((entry) => typeof entry.data === "string" && entry.item.type === format)
      ) {
        throw new DOMException("A string item with this type already exists", "NotSupportedError");
      }
      const entry = makeEntry(value, format);
      entries.push(entry);
      return entry.item;
    }
    remove(index: number): void {
      if (arguments.length === 0) throw new TypeError("Expected an index");
      removeEntry(entriesOf(this), Number(index) >>> 0);
    }
    clear(): void {
      const entries = entriesOf(this);
      for (const entry of entries) disabledItems.add(entry.item);
      entries.length = 0;
    }
    *[Symbol.iterator](): IterableIterator<DataTransferItem> {
      for (const { item } of entriesOf(this)) yield item;
    }
    get [Symbol.toStringTag](): string {
      return "DataTransferItemList";
    }
  }

  function normalizedFormat(type: string): string {
    return String(type)
      .replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
      .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  }

  function formatName(type: string): string {
    const name = normalizedFormat(type);
    return name === "text" ? "text/plain" : name === "url" ? "text/uri-list" : name;
  }

  class DataTransfer {
    readonly #entries: Entry[] = [];
    readonly items = new DataTransferItemList(token, this.#entries);
    readonly files = new FileList(token, {
      read: () => this.#entries.flatMap(({ data }) => (typeof data === "string" ? [] : [data])),
      clear: () => {
        for (let index = this.#entries.length - 1; index >= 0; index--) {
          if (typeof this.#entries[index]?.data !== "string") removeEntry(this.#entries, index);
        }
      },
    });
    #typeEntries: Entry[] = [];
    #types: readonly string[] = Object.freeze([]);
    dropEffect = "none";
    effectAllowed = "none";
    get types(): readonly string[] {
      if (
        this.#typeEntries.length === this.#entries.length &&
        this.#entries.every((entry, index) => this.#typeEntries[index] === entry)
      )
        return this.#types;
      const types = this.#entries.flatMap(({ item, data }) =>
        typeof data === "string" ? [item.type] : [],
      );
      if (this.files.length) types.push("Files");
      this.#typeEntries = this.#entries.slice();
      return (this.#types = Object.freeze(types));
    }
    getData(format: string): string {
      const type = formatName(format).split(";", 1)[0];
      const entry = this.#entries.find(
        ({ item, data }) => typeof data === "string" && item.type === type,
      );
      const data = typeof entry?.data === "string" ? entry.data : "";
      return normalizedFormat(format) === "url"
        ? (data
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => line && !line.startsWith("#")) ?? "")
        : data;
    }
    setData(format: string, data: string): void {
      const type = formatName(format);
      const index = this.#entries.findIndex(
        ({ item, data }) => typeof data === "string" && item.type === type,
      );
      const entry = makeEntry(String(data), type);
      if (index < 0) this.#entries.push(entry);
      else {
        const previous = this.#entries[index];
        if (previous) disabledItems.add(previous.item);
        this.#entries[index] = entry;
      }
    }
    clearData(format?: string): void {
      const type = format === undefined ? undefined : formatName(format);
      for (let index = this.#entries.length - 1; index >= 0; index--) {
        const entry = this.#entries[index];
        if (typeof entry?.data === "string" && (type === undefined || entry.item.type === type))
          removeEntry(this.#entries, index);
      }
    }
    setDragImage(_image: object, _x: number, _y: number): void {}
    get [Symbol.toStringTag](): string {
      return "DataTransfer";
    }
  }

  return {
    FileList,
    DataTransfer,
    DataTransferItem,
    DataTransferItemList,
    empty(): FileList {
      return new FileList(token, { read: () => [], clear: () => {} });
    },
    check(value: FileList): void {
      storeOf(value);
    },
    clear(value: FileList): void {
      storeOf(value).clear();
    },
  };
}
