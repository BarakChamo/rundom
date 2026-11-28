// Parses anchor positioning functions while preserving the surrounding property's value grammar.
import { createRequire } from "node:module";
import type { CssNode } from "css-tree";

const require = createRequire(import.meta.url);
const inset = /^(?:top|bottom|left|right|inset(?:-(?:block|inline)(?:-(?:start|end))?)?)$/;
const sizable =
  /^(?:(?:min-|max-)?(?:width|height|inline-size|block-size)|margin(?:-(?:top|right|bottom|left|(?:block|inline)(?:-(?:start|end))?))?)$/;
const side = /^(?:inside|outside|left|right|top|bottom|start|end|self-start|self-end|center)$/;
const size = /^(?:width|height|block|inline|self-block|self-inline)$/;

export function acceptsAnchors(property: string): boolean {
  return inset.test(property) || sizable.test(property);
}

/** Returns serialized components only when all anchors and the enclosing property accept the value. */
export function anchorComponents(property: string, source: string): string[] | undefined {
  if (!acceptsAnchors(property)) return;
  const css: typeof import("css-tree") = require("./css-runtime.cjs").cssTree;
  let value: CssNode;
  try {
    value = css.parse(source, { context: "value" });
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return;
  }
  if (value.type !== "Value") return;
  // Each validated anchor is a length. Check ancestors against that type while
  // retaining the actual tokens for CSSOM serialization, including nested fallbacks.
  const serialized = new WeakMap<CssNode, string>();
  let valid = true;
  function text(node: CssNode): string {
    const known = serialized.get(node);
    if (known !== undefined) return known;
    if (
      node.type === "Function" &&
      node.name.toLowerCase() === "calc" &&
      node.children.size === 3
    ) {
      const [left, operator, right] = node.children.toArray();
      if (left && operator?.type === "Operator" && right) {
        if (
          operator.value.trim() === "/" &&
          right.type === "Number" &&
          Number(right.value) !== 0 &&
          Number.isFinite(1 / Number(right.value))
        )
          return `calc(${Number((1 / Number(right.value)).toPrecision(15))} * ${text(left)})`;
        if (
          operator.value.trim() === "+" &&
          serialized.has(left) &&
          (right.type === "Percentage" || right.type === "Dimension")
        )
          return `calc(${text(right)} + ${text(left)})`;
      }
    }
    return css.generate(node, {
      decorator(handlers) {
        return {
          ...handlers,
          node(child) {
            const replacement = serialized.get(child);
            if (replacement !== undefined)
              handlers.node.call(this, { type: "Raw", value: replacement });
            else if (child.type === "Operator" && child.value === ",")
              handlers.node.call(this, { type: "Raw", value: ", " });
            else if (child.type === "Operator" && (child.value === "*" || child.value === "/"))
              handlers.node.call(this, { type: "Raw", value: ` ${child.value} ` });
            else handlers.node.call(this, child);
          },
        };
      },
    });
  }
  css.walk(value, {
    visit: "Function",
    leave(node, item) {
      if (!valid || !/^anchor(?:-size)?$/i.test(node.name)) return;
      const isSize = node.name.toLowerCase() === "anchor-size";
      if (!isSize && !inset.test(property)) {
        valid = false;
        return;
      }
      const args = node.children.toArray();
      const comma = args.findIndex((part) => part.type === "Operator" && part.value === ",");
      const head = comma < 0 ? args : args.slice(0, comma);
      const tail = comma < 0 ? [] : args.slice(comma + 1);
      const name = head.find(
        (part) => part.type === "Identifier" && css.ident.decode(part.name).startsWith("--"),
      );
      const axis = head.filter((part) => part !== name);
      const dimension = axis[0];
      let axisText = "";
      let fallback = tail[0];
      if (
        isSize &&
        head.length === 1 &&
        !name &&
        comma < 0 &&
        dimension &&
        css.lexer.matchType("length-percentage", dimension).error === null
      ) {
        fallback = dimension;
      } else if (dimension) {
        const keyword =
          dimension.type === "Identifier" ? css.ident.decode(dimension.name).toLowerCase() : "";
        if ((isSize ? size : side).test(keyword)) axisText = keyword;
        else if (!isSize && css.lexer.matchType("percentage", dimension).error === null)
          axisText = text(dimension);
        else {
          valid = false;
          return;
        }
      }
      if (
        axis.length > 1 ||
        (!isSize && !dimension) ||
        (comma >= 0 && (!head.length || tail.length !== 1))
      ) {
        valid = false;
        return;
      }
      let fallbackText = "";
      if (fallback) {
        if (css.lexer.matchType("length-percentage", fallback).error !== null) {
          valid = false;
          return;
        }
        fallbackText =
          fallback.type === "Number" && Number(fallback.value) === 0 ? "0px" : text(fallback);
      }
      const prefix = [name && text(name), axisText].filter(Boolean).join(" ");
      const display = `${isSize ? "anchor-size" : "anchor"}(${prefix}${fallbackText ? (prefix ? ", " : "") + fallbackText : ""})`;
      const length: CssNode = { type: "Dimension", value: "1", unit: "px" };
      serialized.set(length, display);
      item.data = length;
    },
  });
  if (!valid || css.lexer.matchProperty(property, value).error !== null) return;
  return value.children.toArray().map((node) => {
    const inner =
      node.type === "Function" &&
      node.name === "calc" &&
      node.children.size === 1 &&
      node.children.first;
    return inner && serialized.has(inner) ? text(inner) : text(node);
  });
}
