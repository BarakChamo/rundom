// Pins that stylesheet blocks built without cssstyle store, cascade and expose exactly what the cssstyle path does.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";
import { JSDOM as ReferenceJSDOM } from "jsdom";

// A leading declaration that the lean builder declines and the cssstyle path drops, so the block
// behind it takes the general path while storing the same entries.
const decline = "rundom-decline: 1 !important; ";

const keywords: Record<string, readonly string[]> = {
  display: [
    "block",
    "inline",
    "inline-block",
    "flex",
    "inline-flex",
    "grid",
    "inline-grid",
    "none",
    "contents",
    "flow-root",
  ],
  position: ["static", "relative", "absolute", "fixed", "sticky"],
  "box-sizing": ["border-box", "content-box"],
  "align-items": ["flex-start", "flex-end", "center", "baseline", "stretch"],
  "align-self": ["auto", "flex-start", "flex-end", "center", "baseline", "stretch"],
  "align-content": ["flex-start", "flex-end", "center", "space-between", "space-around", "stretch"],
  "justify-content": [
    "flex-start",
    "flex-end",
    "center",
    "space-between",
    "space-around",
    "space-evenly",
  ],
  "flex-direction": ["row", "row-reverse", "column", "column-reverse"],
  "flex-wrap": ["nowrap", "wrap", "wrap-reverse"],
  overflow: ["hidden", "visible", "auto", "scroll"],
  "overflow-x": ["hidden", "visible", "auto", "scroll"],
  "overflow-y": ["hidden", "visible", "auto", "scroll"],
  visibility: ["visible", "hidden", "collapse"],
  cursor: ["pointer", "default", "auto", "text", "move", "not-allowed"],
  "pointer-events": ["auto", "none"],
  "user-select": ["none", "auto", "text"],
  "font-style": ["normal", "italic"],
  "font-weight": ["normal", "bold", "300", "400", "500", "600", "700"],
  "text-overflow": ["ellipsis", "clip"],
  "object-fit": ["contain", "cover", "fill", "none"],
};
const lengths = [
  "0",
  "1px",
  "8px",
  "0.5em",
  "1.5rem",
  "50%",
  "100vh",
  "-4px",
  "12.25px",
  ".5em",
  "0.875rem",
  "0.02857em",
  "-0.00938em",
  "1.4375rem",
  "1234.5px",
];
const lengthProperties = [
  "width",
  "min-width",
  "max-height",
  "margin-bottom",
  "padding-top",
  "right",
  "bottom",
  "max-width",
  "height",
  "min-height",
  "margin-top",
  "padding-left",
  "top",
  "left",
  "font-size",
  "line-height",
  "letter-spacing",
];
const others = [
  "border-top-left-radius: 4px",
  "border-bottom-right-radius: 50%",
  "border-top-right-radius: -2px",
  "transition-duration: 0.25s",
  "transition-duration: 250ms",
  "transition-duration: -1s",
  "transition-delay: -0.5s",
  "transition-delay: 0s",
  "transition-property: background-color",
  "transition-property: all",
  "transition-property: none",
  "transition-property: inherit",
  "transition-behavior: allow-discrete",
  "text-align: left",
  "display: table-cell",
  "overflow: clip",
  "width: auto",
  "max-width: none",
  "margin-left: auto",
  "line-height: 1.5",
  "z-index: 10",
  "z-index: -1",
  "color: #fff",
  "color: #1976d2",
  "color: rgba(0, 0, 0, 0.87)",
  "color: rgb(255,0,0)",
  "background-color: rgba(25, 118, 210, 0.04)",
  "background-color: transparent",
  "color: red",
  "padding: 0",
  "padding: 8px 16px",
  "padding: 6px 8px 4px",
  "padding: 1px 2px 1px",
  "padding: 1px 2px 3px 2px",
  "margin: 0 auto",
  "margin: -8px",
  "border-radius: 4px",
  "border-radius: 4px 8px",
  "border-radius: 50%",
  "transition: background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms",
  "transition: opacity 200ms, transform 200ms",
  'font-family: "Roboto","Helvetica","Arial",sans-serif',
  "font-family: Inter, system-ui",
  "--gap: 8px",
  "--brand-color: #1976d2",
  "DISPLAY: flex",
  "display: FLEX",
  "display: flex !important",
  "width: 10000000px",
  "padding: -1px",
];
const declarations = [
  ...Object.entries(keywords).flatMap(([name, values]) => values.map((v) => `${name}: ${v}`)),
  ...lengthProperties.flatMap((name) => lengths.map((value) => `${name}: ${value}`)),
  ...others,
];
// Whole blocks as CSS-in-JS emits them, plus every declaration on its own.
const blocks = [
  ...declarations,
  'display: flex; align-items: center; padding: 8px 16px; color: rgba(0, 0, 0, 0.87); font-family: "Roboto","Helvetica","Arial",sans-serif; font-size: 0.875rem; border-radius: 4px; transition: background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
  "position: relative; display: inline-flex; box-sizing: border-box; cursor: pointer; user-select: none; margin: 0; padding: 0",
  "padding-top: 1px; padding: 2px",
  "padding: 2px; padding-top: 1px",
  "color: red; color: blue",
  "width: 1px; width: 2px !important; width: 3px",
];

/** Every name a block touches: its declared names plus the longhands the general path indexes. */
function touchedNames(window: JSDOM["window"], rule: CSSStyleRule, block: string): string[] {
  const names = new Set(
    block
      .split(";")
      .map((part) => part.split(":")[0]!.trim().toLowerCase())
      .filter(Boolean),
  );
  for (let index = 0; index < rule.style.length; index++) names.add(rule.style.item(index));
  void window;
  return [...names];
}

describe("lean stylesheet declarations", () => {
  it("computes every block exactly as the cssstyle path computes it", () => {
    // Given: each block in a private sheet, once as is and once behind a declined declaration
    const rules = blocks.map((block, i) => `.l${i}{${block}}.f${i}{${decline}${block}}`).join("");
    const markup = blocks.map((_, i) => `<div class="l${i}"></div><div class="f${i}"></div>`);
    const { window } = new JSDOM(`<style>${rules}</style><main>${markup.join("")}</main>`);
    try {
      const computed = blocks.map((_, i) => [
        window.getComputedStyle(window.document.querySelector(`.l${i}`)!),
        window.getComputedStyle(window.document.querySelector(`.f${i}`)!),
      ]);
      // When: the computed values are read before the sheet is exposed, then the rules
      const reads = computed.map(([lean, general]) => ({ lean, general }));
      const cssRules = window.document.styleSheets[0]!.cssRules;
      for (const [i, block] of blocks.entries()) {
        const lean = cssRules[2 * i] as CSSStyleRule;
        const general = cssRules[2 * i + 1] as CSSStyleRule;
        // Then: computed values, public text, indices and per-name reads agree
        for (const name of touchedNames(window, general, block)) {
          expect(reads[i]!.lean!.getPropertyValue(name), `${block} computed ${name}`).toBe(
            reads[i]!.general!.getPropertyValue(name),
          );
          expect(lean.style.getPropertyValue(name), `${block} ${name}`).toBe(
            general.style.getPropertyValue(name),
          );
          expect(lean.style.getPropertyPriority(name), `${block} ${name}!`).toBe(
            general.style.getPropertyPriority(name),
          );
        }
        expect(lean.style.cssText, block).toBe(general.style.cssText);
        expect(lean.cssText.replace(/^\.l\d+/, ""), block).toBe(
          general.cssText.replace(/^\.f\d+/, ""),
        );
        expect([...lean.style], block).toEqual([...general.style]);
        expect(lean.style.length, block).toBe(general.style.length);
      }
    } finally {
      window.close();
    }
  }, 60_000);

  it("applies CSSOM mutations after a lean read as on the cssstyle path", () => {
    // Given: a Material UI rule read once through getComputedStyle in two documents, one lean
    const block = blocks.at(-6)!;
    const run = (prefix: string) => {
      const { window } = new JSDOM(
        `<style>.a{${prefix}${block}}.b{display:block}</style><div class="a b" id="x"></div>`,
      );
      const target = window.document.getElementById("x")!;
      const observed = ["display", "color", "padding", "margin", "border-radius", "transition"];
      const computedText = () => {
        const style = window.getComputedStyle(target);
        return observed.map((name) => style.getPropertyValue(name)).join("|");
      };
      const first = computedText();
      const sheet = window.document.styleSheets[0]!;
      const rule = sheet.cssRules[0] as CSSStyleRule;
      // When: the rule is edited through every CSSOM entry point
      const steps: string[] = [first];
      const read = () => {
        steps.push(computedText(), rule.style.cssText, String(rule.style.length));
      };
      rule.style.setProperty("padding", "4px");
      read();
      rule.style.setProperty("color", "red", "important");
      read();
      rule.style.removeProperty("display");
      read();
      rule.style.cssText = "margin: 0 auto; border-radius: 2px";
      read();
      sheet.insertRule(`.a{${block}}`, 0);
      read();
      sheet.deleteRule(1);
      read();
      window.close();
      return steps.map((step) => step.replaceAll("rundom-decline", ""));
    };
    // Then: each step reads identically
    expect(run("")).toEqual(run(decline));
  }, 60_000);

  it("computes single declarations as jsdom computes them", () => {
    // Given: every single declaration in a sheet, in RunDOM and in jsdom 31.0.1
    // RunDOM already differed from jsdom on these before lean blocks existed; they take the
    // cssstyle path (or a computed path the lean blocks do not touch) either way.
    const knownDifferences = new Set([
      "line-height: 50%",
      "transition-duration: -1s",
      "transition: opacity 200ms, transform 200ms",
    ]);
    const single = declarations.filter(
      (text) => !/!important|^--|^[A-Z]/.test(text) && !knownDifferences.has(text),
    );
    const rules = single.map((text, i) => `.s${i}{${text}}`).join("");
    const markup = `<style>${rules}</style>${single.map((_, i) => `<p class="s${i}"></p>`).join("")}`;
    const ours = new JSDOM(markup).window;
    const theirs = new ReferenceJSDOM(markup).window;
    try {
      for (const [i, text] of single.entries()) {
        const name = text.split(":")[0]!.trim();
        // When: the declared property is read from getComputedStyle
        const read = (window: typeof ours | typeof theirs) =>
          window.getComputedStyle(window.document.querySelector(`.s${i}`)!).getPropertyValue(name);
        // Then: both report the same value
        expect(read(ours), text).toBe(read(theirs));
      }
    } finally {
      ours.close();
      theirs.close();
    }
  }, 60_000);
});
