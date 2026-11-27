// Pins that flat CSS-in-JS stylesheet text builds the same CSSOM through the flat scanner as through the general parser.
import { describe, expect, it } from "vitest";
import { JSDOM, VirtualConsole } from "@run-dom/jsdom";

type TestWindow = JSDOM["window"];
type TestRuleList = InstanceType<TestWindow["CSSStyleSheet"]>["cssRules"];

const emotion = [
  ".css-1abc{display:flex;padding:6px 16px;}",
  ".css-1abc:hover{background-color:rgba(25, 118, 210, 0.04);text-decoration:none}",
  ".css-k008qs{display:-webkit-box;display:-webkit-flex;display:-ms-flexbox;display:flex;}",
  '.css-2ulfj5{margin:0;font-family:"Roboto","Helvetica","Arial",sans-serif;font-weight:400;font-size:1rem;line-height:1.5;letter-spacing:0.00938em;}',
  ".css-x{transition:background-color 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;}",
  ".css-x::before{content:\"\";position:absolute;inset:0}.css-x::after{content:''}",
  ".css-x{width:calc(100% - 32px);transform:translate(14px, -9px) scale(0.75);}",
  ".css-x>:not(style)~:not(style){margin-top:8px;}",
  ".css-x.Mui-disabled{color:rgba(0, 0, 0, 0.26);pointer-events:none;cursor:default;}",
  ".css-x .MuiTouchRipple-root{display:block}.css-x:focus-visible{outline:2px solid #1976d2}",
  "@media (min-width:600px){.css-x{padding-left:24px;padding-right:24px;}}",
  "@media (max-width: 899.95px){.css-y{display:none}}.css-z{color:red}",
  ":root{--mui-palette-primary-main:#1976d2;--spaced: 1px  2px ;--empty:;}",
  ".a{color:red!important;margin:0 ! important;--v: 1 !important;padding:0 !important }",
];
const antd = [
  ":where(.css-dev-only-do-not-override-1x).ant-btn{outline:none;position:relative;display:inline-flex;gap:8px;}",
  ".ant-btn:not(:disabled):focus-visible{outline:4px solid #91caff;outline-offset:1px;transition:outline-offset 0s,outline 0s;}",
  "[class^=\"ant-btn\"] [class*=' ant-btn'],.ant-btn >span{box-sizing:border-box;display:inline-block}",
  ":where(.css-1x){font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;}",
  ".ant-btn-icon-only.ant-btn-compact-item{flex:none}.ant-btn[disabled]{cursor:not-allowed}",
];
const handWritten = [
  "\n  .a {\n    color: red;\n    margin : 0 auto\n  }\n\n  .b, .c > d { }\n",
  ".a{\r\n color: red;\r\n}\r\n\f.b\t{\tcolor:\tblue\t}",
  ".a{}",
  "* { box-sizing: border-box }  a:nth-child(2n+1) { color: green }",
  ':is(.a, .b) > .c ~ .d + .e { font: 12px/1.5 "Segoe UI", sans-serif }',
  '.é{color:red}.a{font-family:"微软雅黑";content:"→"}',
  ".a{color:red }.b{color:red\u000b}",
  ".a..b{color:red}.ok{color:blue}",
  "a|b{color:red}",
];
const adversarial = [
  '.a{content:"}"}',
  '.a::after{content:"{"}',
  '[title="a{b}"]{color:red}',
  ".a{content:\"semi;colon\"}.b{content:'bang!'}",
  "/* x */.a{color:red}",
  ".a{color:/*x*/red}",
  ".a/**/{color:red}",
  "/*! keep */.a{color:red}",
  ".\\31 a{color:red}",
  '.a{content:"\\201C"}',
  ".a\\:hover{color:red}",
  ".a{color red;margin:0}",
  ".a{;color:red}",
  ".a{color:red;;margin:0}",
  ".a{1x:2;color:red}",
  ".a{color:;margin:}",
  ".a{:red}",
  ".a{color:red",
  ".a{color:red;",
  '.a{color:"red',
  ".a{color:rgba(0,0,0}",
  ".a{width:calc(1px;}",
  ".a{width:calc(1px));color:red}",
  "}.a{color:red}",
  ".a{color:red}}",
  ".a",
  ".a{color:red} .b",
  "{color:red}",
  "@media (hover: none){.a{color:red}}",
  "@media screen and (min-width:600px){.a{color:red}}",
  "@media (min-width:600px){.a{color:red}",
  "@supports (display:grid){.a{display:grid}}",
  "@font-face{font-family:x;src:url(x.woff)}",
  "@layer a{.a{color:red}}",
  "@keyframes k{from{opacity:0}to{opacity:1}}",
  ".a{color:red;&:hover{color:blue}}",
  ".a{.b{color:red}}",
  "& .a{color:red}",
  ".a{color:red; .b &{color:blue}}",
  ".a{background:url(x.png)}",
  '.a{background:url( "x.png" )}',
  ".a{background:URL(a(b))}",
  "<!-- .a{color:red} -->",
  "-->.a{color:red}",
  ".a{color:red !IMPORTANT}",
  ".a{color:red !ie}",
  ".a{color:red!important x}",
  ".a{*zoom:1;_height:1px;-webkit-x:1}",
  ".a{--:1;--1:2;---x:3}",
  `.a{width:${"(".repeat(130)}1${")".repeat(130)}}`,
  '.a{content:"a\nb"}',
  ".a!{color:red}",
  ":hover(){color:red}",
];
const large = Array.from(
  { length: 48 },
  (_, index) =>
    `.css-${index.toString(36)}x{display:flex;align-items:center;padding:${index}px 16px;color:rgba(0, 0, 0, 0.87);}`,
).join("");
const corpus = [...emotion, ...antd, ...handWritten, ...adversarial, large];

type RuleShape = {
  type: string;
  cssText: string;
  selectorText?: string;
  style?: string[][];
  rules?: RuleShape[];
};

function shape(window: TestWindow, rules: TestRuleList): RuleShape[] {
  const result: RuleShape[] = [];
  // Rule lists are finite CSSOM snapshots of the parsed source.
  for (let index = 0; index < rules.length; index++) {
    const rule = rules.item(index);
    if (!rule) continue;
    const entry: RuleShape = { type: rule.constructor.name, cssText: rule.cssText };
    if (rule instanceof window.CSSStyleRule) {
      const { style } = rule;
      entry.selectorText = rule.selectorText;
      entry.style = Array.from({ length: style.length }, (_, item) => {
        const name = style.item(item);
        return [name, style.getPropertyValue(name), style.getPropertyPriority(name)];
      });
    }
    if (rule instanceof window.CSSGroupingRule || rule instanceof window.CSSKeyframesRule)
      entry.rules = shape(window, rule.cssRules);
    result.push(entry);
  }
  return result;
}

function observe(text: string) {
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error: Error & { cause?: unknown }) => {
    errors.push(error.cause instanceof Error ? error.cause.message : error.message);
  });
  const { window } = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    virtualConsole,
  });
  const { head } = window.document;
  const style = window.document.createElement("style");
  if (!head || !(style instanceof window.HTMLStyleElement))
    throw new Error("Expected a style element");
  style.textContent = text;
  head.append(style);
  const element = style.sheet ? shape(window, style.sheet.cssRules) : null;
  const constructed = new window.CSSStyleSheet();
  constructed.replaceSync(text);
  const target = new window.CSSStyleSheet();
  let inserted: string;
  try {
    target.insertRule(text);
    inserted = JSON.stringify(shape(window, target.cssRules));
  } catch (error) {
    inserted = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  window.close();
  return { element, constructed: shape(window, constructed.cssRules), inserted, errors };
}

describe("flat stylesheet scanner", () => {
  for (const text of corpus) {
    it(`builds the general parser's CSSOM for ${JSON.stringify(text.slice(0, 48))}`, () => {
      // Given: stylesheet text, and the same text behind a leading comment. The scanner rejects
      // comments, while the general parser discards top-level comments without other effect.
      // When: both texts are parsed through a style element, replaceSync and insertRule
      const scanned = observe(text);
      const general = observe(`/**/${text}`);
      // Then: rule structure, serialization, priorities, insertRule outcome and diagnostics match
      expect(scanned).toEqual(general);
    });
  }

  it("keeps independent rule objects for repeated flat text", () => {
    // Given: one Emotion rule inserted into two sheets
    const { window } = new JSDOM();
    const first = new window.CSSStyleSheet();
    const second = new window.CSSStyleSheet();
    // When: the same text is parsed twice
    first.replaceSync(".css-r{color:red}");
    second.replaceSync(".css-r{color:red}");
    const [mutated, untouched] = [first.cssRules[0], second.cssRules[0]];
    if (!(mutated instanceof window.CSSStyleRule) || !(untouched instanceof window.CSSStyleRule))
      throw new Error("Expected style rules");
    mutated.style.color = "blue";
    // Then: each sheet owns its own mutable rule
    expect(mutated).not.toBe(untouched);
    expect(untouched.style.color).toBe("red");
    window.close();
  });
});
