// Parses the size property through the native width grammar, keeping it separate from page-descriptor keywords.
import { createRequire } from "node:module";
import type { CssNode } from "css-tree";
const require = createRequire(import.meta.url);

/** Parses one or two width values; page names and invalid declarations have no value to publish. */
export function parseSizeDeclaration(value: string): string | undefined {
  const text = value.trim();
  if (/^(?:initial|inherit|unset|revert(?:-layer|-rule)?)$/i.test(text)) return text.toLowerCase();
  const css: Pick<typeof import("css-tree"), "parse" | "generate"> & {
    lexer: { match(syntax: string, ast: CssNode): { error: unknown } };
  } = require("./css-runtime.cjs").cssTree;
  try {
    if (/var\(/i.test(text)) {
      const { parsePropertyValue }: { parsePropertyValue(name: string, value: string): unknown } =
        require("./css-runtime.cjs").cssStyle;
      return parsePropertyValue("width", text) === undefined ? undefined : text;
    }
    const ast = css.parse(text, { context: "value" });
    if (css.lexer.match("<'width'>{1,2}", ast).error !== null) return;
    if (ast.type !== "Value") return;
    return ast.children
      .toArray()
      .map((node) => {
        if (node.type === "Identifier") return node.name.toLowerCase();
        if (node.type === "Dimension") return `${Number(node.value)}${node.unit.toLowerCase()}`;
        if (node.type === "Number" && Number(node.value) === 0) return "0px";
        return css.generate(node);
      })
      .join(" ");
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return;
  }
}
