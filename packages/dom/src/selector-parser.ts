// Parses the common unescaped ASCII selector grammar without loading the CSS library; other syntax is left to the general adapter.

/** One simple selector inside a compound. Names are ASCII; pseudo-class names are lowercase. */
export type DirectSimple =
  | { readonly kind: "type"; readonly name: string }
  | { readonly kind: "id" | "class"; readonly name: string }
  | {
      readonly kind: "attr";
      readonly name: string;
      readonly operator: string | null;
      readonly value: string;
      readonly flag: string | null;
      /** Whether the value was written as a string rather than an identifier. */
      readonly quoted?: boolean;
    }
  | { readonly kind: "pseudo"; readonly name: string }
  | {
      readonly kind: "nth";
      readonly name: string;
      readonly a: number;
      readonly b: number;
    }
  | {
      readonly kind: "list";
      readonly name: string;
      readonly list: readonly DirectComplex[];
    };

/** Compounds in source order; `combinators[i]` joins `compounds[i]` and `compounds[i + 1]`. */
export type DirectComplex = {
  readonly compounds: readonly (readonly DirectSimple[])[];
  readonly combinators: readonly string[];
};

/** A fully parsed selector list plus every pseudo-class name it uses at any depth. */
export type DirectSelector = {
  readonly list: readonly DirectComplex[];
  readonly pseudos: ReadonlySet<string>;
};

/**
 * Argument-free pseudo-classes accepted by this grammar. Every name here is also accepted by the
 * reference selector grammar inside :not(), so direct parses never need that validation.
 */
export const directPseudoClasses: ReadonlySet<string> = new Set([
  "first-child",
  "last-child",
  "only-child",
  "first-of-type",
  "last-of-type",
  "only-of-type",
  "empty",
  "root",
  "checked",
  "enabled",
  "disabled",
  "link",
  "any-link",
  "visited",
  "required",
  "optional",
  "read-write",
  "read-only",
  "defined",
  "target",
  "placeholder-shown",
  "in-range",
  "out-of-range",
  "indeterminate",
  "default",
  "valid",
  "invalid",
  "focus",
  "focus-within",
  "focus-visible",
]);
const nthPseudoClasses = new Set([
  "nth-child",
  "nth-last-child",
  "nth-of-type",
  "nth-last-of-type",
]);
const listPseudoClasses = new Set(["not", "is", "where"]);

const identifier = /-?[a-zA-Z_][\w-]*/y;
const name = /[a-zA-Z_][\w-]*/y;
const operator = /[~|^$*]?=/y;
const quoted = /"[^"\\\n]*"|'[^'\\\n]*'/y;
const nth = /(odd|even)|([+-]?\d{0,9})n(?:([+-])(\d{1,9}))?|([+-]?\d{1,9})/iy;
const outsideGrammar = /[^\t\n\x20-\x7e]/;
const cache = new Map<string, DirectSelector | null>();

/** Parses a whole selector list, or returns undefined for syntax outside the direct grammar. */
export function parseDirectSelector(text: string): DirectSelector | undefined {
  if (text.length > 4096) return undefined;
  const known = cache.get(text);
  if (known !== undefined) return known ?? undefined;
  const parsed = outsideGrammar.test(text) ? undefined : parseText(text);
  if (cache.size >= 256) cache.clear();
  cache.set(text, parsed ?? null);
  return parsed;
}

// Names outside the matching grammar that the reference selector grammar accepts and serializes
// unchanged (lowercased); selector-canonical.test.ts compares each one with the reference engine.
const canonicalOnlyPseudoClasses = new Set([
  "hover",
  "active",
  "scope",
  "autofill",
  "user-valid",
  "user-invalid",
  "fullscreen",
  "modal",
  "open",
  "popover-open",
]);
const canonicalPseudoElements = new Set([
  "before",
  "after",
  "first-line",
  "first-letter",
  "placeholder",
  "marker",
  "backdrop",
  "selection",
  "file-selector-button",
]);
const legacyPseudoElements = new Set(["before", "after", "first-line", "first-letter"]);
const canonicalCache = new Map<string, string | null>();

/**
 * Serializes a selector list exactly as the pinned reference grammar does, or returns undefined
 * when the list is outside the direct grammar (extended with user-action pseudo-classes and
 * trailing pseudo-elements). Any list this accepts is valid in the reference grammar.
 */
export function canonicalDirectSelector(text: string): string | undefined {
  if (text.length > 4096) return undefined;
  const known = canonicalCache.get(text);
  if (known !== undefined) return known ?? undefined;
  const parsed = outsideGrammar.test(text) ? undefined : parseText(text, true);
  const result = parsed && serializeList(parsed.list);
  if (canonicalCache.size >= 256) canonicalCache.clear();
  canonicalCache.set(text, result ?? null);
  return result;
}

function serializeList(list: readonly DirectComplex[]): string | undefined {
  const parts: string[] = [];
  for (const complex of list) {
    let text = "";
    for (let index = 0; index < complex.compounds.length; index++) {
      const compound = serializeCompound(complex.compounds[index]!);
      if (compound === undefined) return undefined;
      const combinator = complex.combinators[index - 1];
      text +=
        combinator === undefined
          ? compound
          : combinator === " "
            ? ` ${compound}`
            : ` ${combinator} ${compound}`;
    }
    parts.push(text);
  }
  return parts.join(", ");
}

function serializeCompound(compound: readonly DirectSimple[]): string | undefined {
  let text = "";
  for (const part of compound) {
    switch (part.kind) {
      case "type":
        if (part.name !== "*" || compound.length === 1) text += part.name;
        break;
      case "id":
        text += `#${part.name}`;
        break;
      case "class":
        text += `.${part.name}`;
        break;
      case "attr":
        if (part.quoted && part.value.includes("\t")) return undefined;
        text += `[${part.name}`;
        if (part.operator)
          text +=
            part.operator + (part.quoted ? `"${part.value.replaceAll('"', '\\"')}"` : part.value);
        text += part.flag ? ` ${part.flag}]` : "]";
        break;
      case "pseudo":
        // Pseudo-element names keep their own leading colon.
        text += `:${part.name}`;
        break;
      case "nth":
        text += `:${part.name}(${serializeNth(part.a, part.b)})`;
        break;
      case "list": {
        const inner = serializeList(part.list);
        if (inner === undefined) return undefined;
        text += `:${part.name}(${inner})`;
      }
    }
  }
  return text;
}

function serializeNth(a: number, b: number): string {
  if (a === 0) return String(b);
  const step = a === 1 ? "n" : a === -1 ? "-n" : `${a}n`;
  return b === 0 ? step : b > 0 ? `${step}+${b}` : `${step}${b}`;
}

function parseText(text: string, canonical = false): DirectSelector | undefined {
  let at = 0;
  const pseudos = new Set<string>();
  function space(): boolean {
    const start = at;
    while (text[at] === " " || text[at] === "\t" || text[at] === "\n") at++;
    return at > start;
  }
  function read(pattern: RegExp): RegExpExecArray | undefined {
    pattern.lastIndex = at;
    const match = pattern.exec(text);
    if (match) at = pattern.lastIndex;
    return match ?? undefined;
  }
  // Nesting depth is bounded so hostile input cannot exhaust the stack.
  function list(depth: number): DirectComplex[] | undefined {
    if (depth > 32) return undefined;
    const complexes: DirectComplex[] = [];
    for (;;) {
      space();
      const parsed = complex(depth);
      if (!parsed) return undefined;
      complexes.push(parsed);
      space();
      if (text[at] !== ",") return complexes;
      at++;
    }
  }
  function complex(depth: number): DirectComplex | undefined {
    const compounds: DirectSimple[][] = [];
    const combinators: string[] = [];
    // Each iteration consumes at least one compound character.
    for (;;) {
      const parts = compound(depth);
      if (!parts) return undefined;
      compounds.push(parts);
      const spaced = space();
      const next = text[at];
      // A pseudo-element ends its complex selector.
      if (parts.at(-1)!.name.startsWith(":"))
        return next === undefined || next === "," ? { compounds, combinators } : undefined;
      if (next === ">" || next === "+" || next === "~") {
        at++;
        space();
        combinators.push(next);
      } else if (spaced && next !== undefined && next !== "," && next !== ")")
        combinators.push(" ");
      else return { compounds, combinators };
    }
  }
  function compound(depth: number): DirectSimple[] | undefined {
    const parts: DirectSimple[] = [];
    if (text[at] === "*") {
      at++;
      parts.push({ kind: "type", name: "*" });
    } else {
      const type = read(name)?.[0];
      if (type) parts.push({ kind: "type", name: type });
    }
    for (;;) {
      if (canonical && parts.at(-1)?.name.startsWith(":")) return parts;
      const next = text[at];
      if (next === "#" || next === ".") {
        at++;
        const value = read(identifier)?.[0];
        if (!value) return undefined;
        parts.push({ kind: next === "#" ? "id" : "class", name: value });
      } else if (next === "[") {
        at++;
        const part = attribute();
        if (!part) return undefined;
        parts.push(part);
      } else if (next === ":") {
        at++;
        const part = canonical && text[at] === ":" ? pseudoElement(depth) : pseudo(depth);
        if (!part) return undefined;
        parts.push(part);
      } else return parts.length ? parts : undefined;
    }
  }
  function attribute(): DirectSimple | undefined {
    space();
    const attributeName = read(name)?.[0];
    if (!attributeName) return undefined;
    space();
    const test = read(operator)?.[0] ?? null;
    let value = "";
    let flag: string | null = null;
    let isString = false;
    if (test) {
      space();
      const literal = read(quoted)?.[0];
      const word = literal === undefined ? read(identifier)?.[0] : undefined;
      if (literal === undefined && word === undefined) return undefined;
      value = literal === undefined ? (word ?? "") : literal.slice(1, -1);
      isString = literal !== undefined;
      space();
      const modifier = read(identifier)?.[0];
      if (modifier !== undefined) {
        if (!/^[is]$/i.test(modifier)) return undefined;
        flag = modifier.toLowerCase();
        space();
      }
    }
    if (text[at] !== "]") return undefined;
    at++;
    return {
      kind: "attr",
      name: attributeName,
      operator: test,
      value,
      flag,
      quoted: isString,
    };
  }
  function pseudoElement(depth: number): DirectSimple | undefined {
    at++;
    const elementName = read(identifier)?.[0].toLowerCase();
    if (depth > 0 || !elementName || !canonicalPseudoElements.has(elementName)) return undefined;
    return { kind: "pseudo", name: `:${elementName}` };
  }
  function pseudo(depth: number): DirectSimple | undefined {
    const pseudoName = read(identifier)?.[0].toLowerCase();
    if (!pseudoName) return undefined;
    pseudos.add(pseudoName);
    if (text[at] !== "(") {
      if (directPseudoClasses.has(pseudoName)) return { kind: "pseudo", name: pseudoName };
      if (!canonical) return undefined;
      if (canonicalOnlyPseudoClasses.has(pseudoName)) return { kind: "pseudo", name: pseudoName };
      return depth === 0 && legacyPseudoElements.has(pseudoName)
        ? { kind: "pseudo", name: `:${pseudoName}` }
        : undefined;
    }
    at++;
    space();
    let part: DirectSimple | undefined;
    if (nthPseudoClasses.has(pseudoName)) {
      const match = read(nth);
      if (!match) return undefined;
      const [, keyword, coefficient, sign, offset, integer] = match;
      let a = 0;
      let b = Number(integer ?? 0);
      if (keyword) {
        a = 2;
        b = keyword.toLowerCase() === "odd" ? 1 : 0;
      } else if (coefficient !== undefined) {
        a =
          coefficient === "" || coefficient === "+"
            ? 1
            : coefficient === "-"
              ? -1
              : Number(coefficient);
        b = offset === undefined ? 0 : Number(`${sign}${offset}`);
      }
      part = { kind: "nth", name: pseudoName, a, b };
    } else if (listPseudoClasses.has(pseudoName)) {
      const inner = list(depth + 1);
      if (!inner) return undefined;
      part = { kind: "list", name: pseudoName, list: inner };
    } else return undefined;
    space();
    if (text[at] !== ")") return undefined;
    at++;
    return part;
  }
  const parsed = list(0);
  return parsed && at === text.length ? { list: parsed, pseudos } : undefined;
}
