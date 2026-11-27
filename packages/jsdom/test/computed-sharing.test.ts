// Pins computed styles of sibling elements, which may share completed cascade frames.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

type Window = JSDOM["window"];

function withWindow(markup: string, run: (window: Window) => void): void {
  const { window } = new JSDOM(`<!doctype html>${markup}`);
  try {
    run(window);
  } finally {
    window.close();
  }
}

// Reads every match in document order, so later siblings meet frames built for earlier ones.
function readAll(window: Window, selector: string, property: string): string[] {
  return [...window.document.querySelectorAll(selector)].map((node) =>
    window.getComputedStyle(node).getPropertyValue(property),
  );
}

describe("getComputedStyle on sibling elements with equal inputs", () => {
  it("should return a fresh declaration object for each call on equal siblings", () => {
    // Given: two identical list rows
    withWindow(
      `<style>.row{color:rgb(1, 2, 3)}</style><ul><li class=row></li><li class=row></li></ul>`,
      (window) => {
        const [first, second] = window.document.querySelectorAll("li");
        // When: both rows are read twice
        const a = window.getComputedStyle(first!);
        const b = window.getComputedStyle(second!);
        // Then: every call returns its own object with the shared value
        expect(a).not.toBe(b);
        expect(window.getComputedStyle(second!)).not.toBe(b);
        expect([a.color, b.color]).toEqual(["rgb(1, 2, 3)", "rgb(1, 2, 3)"]);
      },
    );
  });

  it.each([
    [
      "class",
      `<li class=row></li><li class="row hot"></li>`,
      "li",
      "color",
      ["rgb(1, 2, 3)", "rgb(9, 0, 0)"],
    ],
    [
      "id",
      `<li class=row></li><li class=row id=k></li>`,
      "li",
      "color",
      ["rgb(1, 2, 3)", "rgb(0, 9, 0)"],
    ],
    [
      "attribute",
      `<li class=row></li><li class=row data-x=1></li>`,
      "li",
      "color",
      ["rgb(1, 2, 3)", "rgb(0, 0, 9)"],
    ],
    [
      "inline style",
      `<li class=row style="color: rgb(5, 5, 5)"></li><li class=row style="color: rgb(6, 6, 6)"></li>`,
      "li",
      "color",
      ["rgb(5, 5, 5)", "rgb(6, 6, 6)"],
    ],
    [
      "tag",
      `<li class=row></li><div class=row></div><span class=row></span>`,
      ".row",
      "display",
      ["list-item", "block", "inline"],
    ],
    [
      "hidden attribute",
      `<li class=row></li><li class=row hidden></li>`,
      "li",
      "display",
      ["list-item", "none"],
    ],
    [
      "lang attribute",
      `<li class=row></li><li class=row lang=fr></li>`,
      "li",
      "font-style",
      ["normal", "italic"],
    ],
    [
      "dir attribute",
      `<li class=row></li><li class=row dir=rtl></li>`,
      "li",
      "direction",
      ["ltr", "rtl"],
    ],
    [
      "input type",
      `<input class=row type=hidden><input class=row type=hidden><input class=row type=hidden>`,
      "input",
      "display",
      ["none", "none", "none"],
    ],
    [
      "adjacent sibling",
      `<li class=row></li><li class=row></li><li class=row></li>`,
      "li",
      "margin-left",
      ["0px", "3px", "3px"],
    ],
    [
      "nth-child",
      `<li class=row></li><li class=row></li><li class=row></li>`,
      "li",
      "background-color",
      ["rgba(0, 0, 0, 0)", "rgb(8, 8, 8)", "rgba(0, 0, 0, 0)"],
    ],
    ["first-child", `<li class=row></li><li class=row></li>`, "li", "padding-top", ["2px", "0px"]],
    ["empty", `<li class=row>x</li><li class=row></li>`, "li", "padding-left", ["0px", "4px"]],
    ["has", `<li class=row><b></b></li><li class=row></li>`, "li", "opacity", ["0.5", "1"]],
    [
      "checked state",
      `<input type=checkbox checked><input type=checkbox>`,
      "input",
      "margin-left",
      ["7px", "0px"],
    ],
    [
      "disabled state",
      `<button disabled></button><button></button>`,
      "button",
      "opacity",
      ["0.25", "1"],
    ],
  ])(
    "should keep %s differences between siblings",
    (_route, items, selector, property, expected) => {
      // Given: siblings that differ only by one cascade input
      const sheet = `<style>.row{color:rgb(1, 2, 3)}.hot{color:rgb(9, 0, 0)}#k{color:rgb(0, 9, 0)}[data-x="1"]{color:rgb(0, 0, 9)}
      :lang(fr){font-style:italic}.row + .row{margin-left:3px}.row:nth-child(2n){background-color:rgb(8, 8, 8)}
      .row:first-child{padding-top:2px}.row:empty{padding-left:4px}.row:has(b){opacity:0.5}
      input:checked{margin-left:7px}button:disabled{opacity:0.25}</style>`;
      withWindow(`${sheet}<ul>${items}</ul>`, (window) => {
        // When: they are read in document order
        // Then: each sibling reports its own computed value
        expect(readAll(window, selector, property)).toEqual(expected);
      });
    },
  );

  it("should not let a hidden input share a text input's display", () => {
    // Given: a text input followed by an equal hidden input
    withWindow(`<ul><input class=row><input class=row type=hidden></ul>`, (window) => {
      // When: both are read in document order
      const [text, hidden] = readAll(window, "input", "display");
      // Then: only the hidden input is not displayed
      expect([text === "none", hidden]).toEqual([false, "none"]);
    });
  });

  it("should give each sibling its own random() draw", () => {
    // Given: identical siblings whose width draws a random value per element
    withWindow(
      `<style>.q{width:random(1px, 100000px)}</style><ul>${"<li class=q></li>".repeat(4)}</ul>`,
      (window) => {
        // When: every sibling is read
        const widths = readAll(window, "li", "width");
        // Then: the draws are independent (four equal draws are vanishingly unlikely)
        expect(new Set(widths).size).toBeGreaterThan(1);
      },
    );
  });

  it("should substitute attr() from each sibling's own attribute", () => {
    // Given: identical siblings whose width reads their own data attribute
    withWindow(
      `<style>li{width:attr(data-w type(<length>))}</style><ul><li data-w=3px></li><li data-w=5px></li></ul>`,
      (window) => {
        // When / Then: each sibling reports its own attribute value
        expect(readAll(window, "li", "width")).toEqual(["3px", "5px"]);
      },
    );
  });
});

describe("getComputedStyle on siblings after mutations", () => {
  const sheet = `<style id=s>.row{color:rgb(1, 2, 3)}.hot{color:rgb(9, 0, 0)}.box.hot .row{color:rgb(0, 5, 0)}
    @media (min-width: 1200px){.row{padding-top:6px}}</style>`;
  const markup = `${sheet}<div class=box><ul><li class=row></li><li class=row></li></ul></div>`;

  it.each<
    [string, (window: Window, rows: InstanceType<Window["Element"]>[]) => void, string, string[]]
  >([
    [
      "class change on the first sibling",
      (_w, [first]) => first!.classList.add("hot"),
      "color",
      ["rgb(9, 0, 0)", "rgb(1, 2, 3)"],
    ],
    [
      "class change on the second sibling",
      (_w, [, second]) => second!.classList.add("hot"),
      "color",
      ["rgb(1, 2, 3)", "rgb(9, 0, 0)"],
    ],
    [
      "inline style on the second sibling",
      (_w, [, second]) =>
        (second as InstanceType<Window["HTMLElement"]>).style.setProperty("color", "rgb(4, 4, 4)"),
      "color",
      ["rgb(1, 2, 3)", "rgb(4, 4, 4)"],
    ],
    [
      "ancestor class change",
      (w) => w.document.querySelector(".box")!.classList.add("hot"),
      "color",
      ["rgb(0, 5, 0)", "rgb(0, 5, 0)"],
    ],
    [
      "rule insertion",
      (w) =>
        (w.document.styleSheets[0] as InstanceType<Window["CSSStyleSheet"]>).insertRule(
          "li:last-child{color:rgb(2, 2, 2)}",
          0,
        ),
      "color",
      ["rgb(1, 2, 3)", "rgb(2, 2, 2)"],
    ],
    [
      "rule insertion that wins",
      (w) =>
        (w.document.styleSheets[0] as InstanceType<Window["CSSStyleSheet"]>).insertRule(
          "ul li:last-child{color:rgb(2, 2, 2)}",
          3,
        ),
      "color",
      ["rgb(1, 2, 3)", "rgb(2, 2, 2)"],
    ],
    [
      "rule deletion",
      (w) => (w.document.styleSheets[0] as InstanceType<Window["CSSStyleSheet"]>).deleteRule(0),
      "color",
      ["rgb(0, 0, 0)", "rgb(0, 0, 0)"],
    ],
    [
      "sheet disabling",
      (w) => {
        (w.document.styleSheets[0] as InstanceType<Window["CSSStyleSheet"]>).disabled = true;
      },
      "color",
      ["rgb(0, 0, 0)", "rgb(0, 0, 0)"],
    ],
    [
      "sheet removal",
      (w) => w.document.getElementById("s")!.remove(),
      "color",
      ["rgb(0, 0, 0)", "rgb(0, 0, 0)"],
    ],
    [
      "sheet addition",
      (w) => {
        const style = w.document.createElement("style");
        style.textContent = "li + li.row{color:rgb(3, 3, 3)}";
        w.document.head!.append(style);
      },
      "color",
      ["rgb(1, 2, 3)", "rgb(3, 3, 3)"],
    ],
    [
      "sibling insertion",
      (w, [first]) => {
        const row = w.document.createElement("li");
        row.className = "row hot";
        first!.before(row);
      },
      "color",
      ["rgb(1, 2, 3)", "rgb(1, 2, 3)"],
    ],
    [
      "media environment change",
      (w) => {
        w.innerWidth = 1400;
        w.dispatchEvent(new w.Event("resize"));
      },
      "padding-top",
      ["6px", "6px"],
    ],
  ])("should follow a %s", (_route, mutate, property, expected) => {
    // Given: two equal rows read once, so the second may share the first row's frame
    withWindow(markup, (window) => {
      const rows = [...window.document.querySelectorAll("li")];
      readAll(window, "li", "color");
      readAll(window, "li", "padding-top");
      // When: one cascade input changes
      mutate(window, rows);
      // Then: both original rows report their current values
      expect(rows.map((row) => window.getComputedStyle(row).getPropertyValue(property))).toEqual(
        expected,
      );
    });
  });

  it("should follow focus moving between siblings", () => {
    // Given: focusable rows with a focus rule, all read once
    withWindow(
      `<style>li{color:rgb(1, 2, 3)}li:focus{color:rgb(9, 9, 9)}</style><ul><li tabindex=0></li><li tabindex=0></li></ul>`,
      (window) => {
        const rows = [...window.document.querySelectorAll("li")];
        readAll(window, "li", "color");
        // When: the second row receives focus
        (rows[1] as InstanceType<Window["HTMLElement"]>).focus();
        // Then: only the focused row matches the focus rule
        expect(readAll(window, "li", "color")).toEqual(["rgb(1, 2, 3)", "rgb(9, 9, 9)"]);
      },
    );
  });

  it("should keep slotted and part styles for siblings in shadow trees", () => {
    // Given: two hosts whose shadow trees slot equal rows and expose a part
    withWindow(
      `<style>::part(p){color:rgb(6, 6, 6)} .row{color:rgb(1, 2, 3)}</style><div id=a><li class=row></li></div><div id=b><li class=row></li><li class=row></li></div>`,
      (window) => {
        for (const id of ["a", "b"]) {
          const root = window.document.getElementById(id)!.attachShadow({ mode: "open" });
          root.innerHTML = `<style>::slotted(.row){padding-left:4px}</style><span part=p></span><span></span><slot></slot>`;
        }
        // When: light and shadow siblings are read in order
        const spans = ["a", "b"].flatMap((id) => [
          ...window.document.getElementById(id)!.shadowRoot!.querySelectorAll("span"),
        ]);
        // Then: slotted rows and parts follow their own scopes
        expect(readAll(window, "li", "padding-left")).toEqual(["4px", "4px", "4px"]);
        expect(spans.map((span) => window.getComputedStyle(span).color)).toEqual([
          "rgb(6, 6, 6)",
          "rgb(0, 0, 0)",
          "rgb(6, 6, 6)",
          "rgb(0, 0, 0)",
        ]);
      },
    );
  });

  it("should follow a sibling adopted into another document and back", () => {
    // Given: two equal rows read once
    withWindow(
      `<style>.row{color:rgb(1, 2, 3)}</style><ul><li class=row></li><li class=row></li></ul>`,
      (window) => {
        const rows = [...window.document.querySelectorAll("li")];
        readAll(window, "li", "color");
        const other = window.document.implementation.createHTMLDocument("");
        // When: the second row moves to a document without the sheet, then returns
        other.body!.append(other.adoptNode(rows[1]!));
        const away = window.getComputedStyle(rows[1]!).color;
        window.document.querySelector("ul")!.append(rows[1]!);
        // Then: it loses and regains the sheet's color
        expect([away, window.getComputedStyle(rows[1]!).color]).toEqual(["", "rgb(1, 2, 3)"]);
      },
    );
  });
});
