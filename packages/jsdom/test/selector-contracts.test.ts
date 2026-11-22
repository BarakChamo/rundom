// Pins selector conversion, structural pseudo-classes, and repeated-query freshness.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("Selector contracts", () => {
  it("discards invalid forgiving branches while retaining valid alternatives and live matching", () => {
    // Given: invalid branches are contained by :is() and :where().
    const { window } = new JSDOM(
      '<style>p:is(,.ok,:unknown){color:green}</style><p class="ok"></p>',
    );
    try {
      const p = window.document.querySelector("p");
      if (!p) throw new Error("Expected forgiving fixture");
      // When/Then: empty and malformed branches do not poison valid alternatives.
      for (const selector of [
        ":is(,.ok,:unknown)",
        ":where(.5, .ok,)",
        ":is(:is(:unknown),.ok)",
        ":is(::before,.ok)",
      ])
        expect(p.matches(selector)).toBe(true);
      expect(p.matches(":is()")).toBe(false);
      expect(p.matches(":where(, .5, :unknown)")).toBe(false);
      expect(window.getComputedStyle(p).color).toBe("rgb(0, 128, 0)");
      p.className = "";
      expect(p.matches(":is(,.ok,:unknown)")).toBe(false);
      expect(() => p.matches(":not(.ok,:unknown)")).toThrow("Unknown pseudo-class");
    } finally {
      window.close();
    }
  });
  it("contains nested relational invalidity at the nearest forgiving list", () => {
    // Given: nested :has() is invalid but a surrounding forgiving list discards it.
    const { window } = new JSDOM('<main><p class="ok"></p></main>');
    try {
      const main = window.document.querySelector("main");
      if (!main) throw new Error("Expected relational fixture");
      // When/Then: a valid sibling branch survives while invalid branches never match.
      expect(main.matches(":has(:is(:has(*),.ok))")).toBe(true);
      expect(main.matches(":has(:where(:has(*)))")).toBe(false);
      expect(() => main.matches(":has(:has(*))")).toThrow("Nested :has()");
    } finally {
      window.close();
    }
  });
  for (const method of ["querySelector", "querySelectorAll"] as const) {
    for (const context of ["document", "element", "fragment"] as const) {
      it(`requires ${method}'s argument on a ${context}`, () => {
        // Given: every ParentNode implementation supports selector queries.
        const { window } = new JSDOM("<undefined></undefined>");
        try {
          const root =
            context === "document"
              ? window.document
              : context === "element"
                ? window.document.body
                : window.document.createDocumentFragment();
          if (!root) throw new Error("Expected selector receiver");
          // When: omission differs from an explicitly supplied undefined.
          // Then: omission throws while explicit undefined is converted to a tag selector.
          expect(() => Reflect.apply(root[method], root, [])).toThrow("1 argument required");
          expect(() => Reflect.apply(root[method], root, [Symbol("selector")])).toThrow("Symbol");
          expect(() => Reflect.apply(root[method], root, [undefined])).not.toThrow();
        } finally {
          window.close();
        }
      });
    }
  }
  for (const method of ["matches", "closest"] as const) {
    it(`requires ${method}'s argument before converting the selector`, () => {
      // Given: an element used as a selector receiver.
      const { window } = new JSDOM("<undefined></undefined>");
      try {
        const node = window.document.body;
        if (!node) throw new Error("Expected body");
        // When/Then: Web IDL conversion rejects omission and Symbol inputs.
        expect(() => Reflect.apply(node[method], node, [])).toThrow("1 argument required");
        expect(() => Reflect.apply(node[method], node, [Symbol()])).toThrow("Symbol");
      } finally {
        window.close();
      }
    });
  }
  it("matches class tokens across ASCII whitespace and ignores substring matches", () => {
    // Given: overlapping class names and both CSS and non-CSS whitespace.
    const { window } = new JSDOM("<main><p id=match></p><p id=prefix></p><p id=nbsp></p></main>");
    try {
      window.document.getElementById("match")?.setAttribute("class", "foobar\tfoo\nbar");
      window.document.getElementById("prefix")?.setAttribute("class", "foobar");
      window.document.getElementById("nbsp")?.setAttribute("class", "foo\u00a0bar");
      // When/Then: the complete token and an escaped selector both find the same element.
      expect(Array.from(window.document.querySelectorAll(".foo"), (node) => node?.id)).toEqual([
        "match",
      ]);
      expect(window.document.querySelector(".f\\6f o")?.id).toBe("match");
      expect(window.document.querySelector(".foo\\ bar")).toBeNull();
    } finally {
      window.close();
    }
  });

  it("keeps scope distinct across roots, escaped pseudo names, and XML mode", () => {
    // Given: repeated selectors on different scopes and namespace modes.
    const { window } = new JSDOM("<section><i></i></section><article><b></b></article>");
    try {
      const body = window.document.body;
      if (!body) throw new Error("Expected body");
      const [a, b] = body.children;
      if (!a || !b) throw new Error("Expected two roots");
      const xml = new window.DOMParser().parseFromString(
        "<Root><Item/><item/></Root>",
        "application/xml",
      );
      // When/Then: compiling a selector for one root never captures it for another.
      for (let round = 0; round < 3; round++) {
        expect(window.document.querySelector(":scope > head")?.localName).toBe("head");
        expect(a.matches(":scope")).toBe(true);
        expect(a.querySelector(":scope > *")?.localName).toBe("i");
        expect(b.querySelector(":scope > *")?.localName).toBe("b");
        expect(a.querySelector(":sco\\70 e > *")?.localName).toBe("i");
        expect(b.querySelector(":sco\\70 e > *")?.localName).toBe("b");
        expect(xml.querySelectorAll("Item").length).toBe(1);
        expect(xml.querySelectorAll("item").length).toBe(1);
      }
    } finally {
      window.close();
    }
  });
  it("reevaluates relational selectors, checked state, and static lists after mutation", () => {
    // Given: repeated selectors whose compiled predicates can outlive tree state.
    const { window } = new JSDOM("<section><input type=checkbox><p></p></section>");
    try {
      const section = window.document.querySelector("section"),
        input = window.document.querySelector("input");
      if (!section || !(input instanceof window.HTMLInputElement))
        throw new Error("Expected form subtree");
      const first = window.document.querySelectorAll("section:has(input:checked)");
      for (const checked of [true, false, true]) {
        // When: state changes without changing selector text.
        input.checked = checked;
        // Then: results reflect current state; previously returned lists stay static.
        expect(section.matches(":has(input:checked)")).toBe(checked);
        expect(window.document.querySelectorAll("section:has(input:checked)").length).toBe(
          Number(checked),
        );
      }
      expect(first.length).toBe(0);
      const p = section.querySelector("p");
      if (!p) throw new Error("Expected paragraph");
      for (const active of [true, false, true]) {
        p.className = active ? "active" : "";
        expect(section.matches(":has(> .active)")).toBe(active);
        expect(input.matches(":has(+ .active)")).toBe(active);
      }
    } finally {
      window.close();
    }
  });
  it("anchors relational paths without constraining nested complex selectors", () => {
    // Given: a candidate whose matching ancestor is outside the :has() subject.
    const { window } = new JSDOM(
      "<main class=outside><section id=subject><p class=leaf></p></section><i class=next></i><b class=last></b></main>",
    );
    try {
      const subject = window.document.getElementById("subject");
      if (!subject) throw new Error("Expected subject");
      // When/Then: implicit descendants are anchored, but :is() remains an ordinary complex selector.
      expect(subject.matches(":has(.outside .leaf)")).toBe(false);
      expect(subject.matches(":has(.leaf:is(.outside .leaf))")).toBe(true);
      expect(subject.matches(":has(+ .next:is(main > .next) + .last)")).toBe(true);
      expect(subject.querySelector(":has(:scope .leaf)")).toBe(null);
      expect(subject.querySelector(".outside:has(:scope) .leaf")?.className).toBe("leaf");
    } finally {
      window.close();
    }
  });
  it("uses CSS identifier preprocessing and excludes pseudo-elements from element queries", () => {
    // Given: IDs that distinguish escaped code points from literal invalid Unicode.
    const { window } = new JSDOM("<p id=hello></p><span></span>");
    try {
      const span = window.document.querySelector("span");
      if (!span) throw new Error("Expected span");
      // When/Then: CSS escapes decode with replacement and consumed whitespace.
      expect(window.document.querySelector("#hel\\6C o")?.id).toBe("hello");
      for (const [id, selector] of [
        ["zero�", "#zero\\0"],
        ["surrogate�", "#surrogate\\d800"],
        ["eof�", "#eof\\"],
        [" ", "# "],
      ]) {
        if (id === undefined || selector === undefined) throw new Error("Expected escape pair");
        span.id = id;
        expect(window.document.querySelector(selector)).toBe(span);
      }
      for (const selector of ["", "div,", "div,/**/", ".5cm", "..test", ".foo..quux"]) {
        expect(() => window.document.querySelector(selector)).toThrow(window.DOMException);
      }
      for (const selector of ["p::before", "p:after", "::selection", "::slotted(p)"]) {
        expect(window.document.querySelector(selector)).toBe(null);
      }
    } finally {
      window.close();
    }
  });
  it("matches link and target state without exposing non-hyperlink elements", () => {
    // Given: ordinary links, a non-hyperlink link element, and a fragment target.
    const { window } = new JSDOM("<link href=/style><a href=/next></a><p id=target></p>", {
      url: "https://example.org/#target",
    });
    try {
      // When/Then: state predicates read current URL and DOM attributes.
      expect(window.document.querySelectorAll(":link").length).toBe(1);
      expect(window.document.querySelector(":visited")).toBe(null);
      expect(window.document.querySelector(":target")?.id).toBe("target");
      window.location.hash = "other";
      expect(window.document.querySelector(":target")).toBe(null);
    } finally {
      window.close();
    }
  });
  it("serializes attribute flags with CSSOM spacing and matches comments consistently", () => {
    // Given: a selector with a comment beside its case-sensitivity flag.
    const { window } = new JSDOM('<style>[foo="bar"/**/i] {color:red}</style><p foo=BAR></p>');
    try {
      const sheet = window.document.styleSheets[0],
        p = window.document.querySelector("p");
      if (!sheet || !p) throw new Error("Expected styled paragraph");
      const rule = sheet.cssRules[0];
      if (!(rule instanceof window.CSSStyleRule)) throw new Error("Expected style rule");
      // When/Then: selector queries, cascade, and CSSOM use the same valid syntax.
      expect(p.matches(String.raw`[foo="bar" \69]`)).toBe(true);
      expect(() => p.matches('[foo="bar" İ]')).toThrow();
      expect(p.matches('[foo="bar"/**/i]')).toBe(true);
      expect(rule.selectorText).toBe('[foo="bar" i]');
      expect(window.getComputedStyle(p).color).toBe("rgb(255, 0, 0)");
    } finally {
      window.close();
    }
  });
  it("updates placeholder and option pseudo-classes from live control state", () => {
    // Given: empty controls with placeholders and an option selected by default.
    const { window } = new JSDOM(
      "<input placeholder><textarea placeholder></textarea><select><option>A</option><option>B</option></select>",
    );
    try {
      const input = window.document.querySelector("input"),
        textarea = window.document.querySelector("textarea"),
        select = window.document.querySelector("select");
      if (
        !(input instanceof window.HTMLInputElement) ||
        !(textarea instanceof window.HTMLTextAreaElement) ||
        !(select instanceof window.HTMLSelectElement)
      )
        throw new Error("Expected controls");
      // When/Then: changing values and selection changes both queries and stylesheet predicates.
      expect(input.matches(":placeholder-shown")).toBe(true);
      input.value = "Ada";
      expect(input.matches(":placeholder-shown")).toBe(false);
      textarea.value = "Notes";
      expect(textarea.matches(":placeholder-shown")).toBe(false);
      textarea.value = "";
      expect(textarea.matches(":placeholder-shown")).toBe(true);
      expect(select.querySelector(":checked")?.textContent).toBe("A");
      select.selectedIndex = 1;
      expect(select.querySelector(":checked")?.textContent).toBe("B");
    } finally {
      window.close();
    }
  });
  it("reflects heading offsets with an unsigned setter and clamped getter", () => {
    // Given: the reflected range is narrower than the Web IDL unsigned input.
    const { window } = new JSDOM("<h1></h1>");
    try {
      const heading = window.document.querySelector("h1");
      if (!(heading instanceof window.HTMLElement)) throw new Error("Expected heading");
      // When/Then: reflection clamps reads, retains valid stored inputs, and defaults oversized setters.
      heading.headingOffset = 9;
      expect(heading.getAttribute("headingoffset")).toBe("9");
      expect(heading.headingOffset).toBe(8);
      heading.headingOffset = -1;
      expect(heading.getAttribute("headingoffset")).toBe("0");
      expect(heading.headingOffset).toBe(0);
      expect(() => Reflect.set(heading, "headingOffset", 1n)).toThrow("BigInt");
    } finally {
      window.close();
    }
  });
  it("matches headings by native namespace and current computed level", () => {
    // Given: offset ancestors, a reset boundary, and a prefixed HTML heading.
    const { window } = new JSDOM(
      "<main headingoffset=2><h1></h1><section headingreset headingoffset=1><h2></h2></section><p role=heading aria-level=1></p></main>",
    );
    try {
      const h1 = window.document.querySelector("h1"),
        h2 = window.document.querySelector("h2");
      if (!(h1 instanceof window.HTMLElement) || !h2) throw new Error("Expected headings");
      // When/Then: native heading semantics ignore ARIA and honor cumulative offsets.
      expect(h1.matches(":heading(3)")).toBe(true);
      expect(h2.matches(":heading(3, 4)")).toBe(true);
      expect(window.document.querySelector("p")?.matches(":heading")).toBe(false);
      h1.headingOffset = 7;
      expect(h1.matches(":heading(9)")).toBe(true);
      h1.headingReset = true;
      h1.headingOffset = 1;
      expect(h1.matches(":heading(2)")).toBe(true);
      const prefixed = window.document.createElementNS("http://www.w3.org/1999/xhtml", "h:h4");
      expect(prefixed.matches(":heading(4)")).toBe(true);
      expect(window.document.createElementNS("urn:other", "h1").matches(":heading")).toBe(false);
    } finally {
      window.close();
    }
  });
  for (const selector of [
    ":heading()",
    ":heading(1.0)",
    ":heading(odd)",
    ":heading(2n)",
    ":heading(1,)",
    ":dir()",
    ":dir(ltr,rtl)",
    ":dir('ltr')",
  ]) {
    it(`rejects invalid functional selector ${selector}`, () => {
      // Given/When: invalid functional syntax at the public selector boundary.
      const { window } = new JSDOM("");
      try {
        // Then: the platform reports a selector syntax error.
        expect(() => window.document.querySelector(selector)).toThrow(window.DOMException);
      } finally {
        window.close();
      }
    });
  }
  it("matches direction from live values, first strong text, and inherited direction", () => {
    // Given: automatic direction excludes nested directional boundaries and script text.
    const { window } = new JSDOM(
      "<main dir=rtl><div id=auto dir=auto><script>Latin</script><span dir=ltr>Latin</span>123 אב</div><input type=tel><textarea dir=auto></textarea><bdi>123 אב</bdi></main>",
    );
    try {
      const auto = window.document.getElementById("auto"),
        input = window.document.querySelector("input"),
        textarea = window.document.querySelector("textarea");
      if (
        !auto ||
        !(input instanceof window.HTMLInputElement) ||
        !(textarea instanceof window.HTMLTextAreaElement)
      )
        throw new Error("Expected directional controls");
      // When/Then: selectors observe mutable values and text without stale results.
      expect(auto.matches(":dir(rtl)")).toBe(true);
      auto.textContent = "123 Latin";
      expect(auto.matches(":dir(ltr)")).toBe(true);
      expect(input.matches(":dir(ltr)")).toBe(true);
      input.type = "text";
      expect(input.matches(":dir(rtl)")).toBe(true);
      input.dir = "auto";
      input.value = "اب";
      expect(input.matches(":dir(rtl)")).toBe(true);
      textarea.value = "Latin";
      expect(textarea.matches(":dir(ltr)")).toBe(true);
      textarea.value = "اب";
      expect(textarea.matches(":dir(rtl)")).toBe(true);
      expect(window.document.querySelector("bdi")?.matches(":dir(rtl)")).toBe(true);
      expect(window.document.querySelector(":dir(auto)")).toBe(null);
    } finally {
      window.close();
    }
  });
});
