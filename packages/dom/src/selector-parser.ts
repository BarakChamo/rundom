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
    }
  | { readonly kind: "pseudo"; readonly name: string }
  | { readonly kind: "nth"; readonly name: string; readonly a: number; readonly b: number }
  | { readonly kind: "list"; readonly name: string; readonly list: readonly DirectComplex[] };

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

function parseText(text: string): DirectSelector | undefined {
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
        const part = pseudo(depth);
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
    if (test) {
      space();
      const literal = read(quoted)?.[0];
      const word = literal === undefined ? read(identifier)?.[0] : undefined;
      if (literal === undefined && word === undefined) return undefined;
      value = literal === undefined ? (word ?? "") : literal.slice(1, -1);
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
    return { kind: "attr", name: attributeName, operator: test, value, flag };
  }
  function pseudo(depth: number): DirectSimple | undefined {
    const pseudoName = read(identifier)?.[0].toLowerCase();
    if (!pseudoName) return undefined;
    pseudos.add(pseudoName);
    if (text[at] !== "(")
      return directPseudoClasses.has(pseudoName) ? { kind: "pseudo", name: pseudoName } : undefined;
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
