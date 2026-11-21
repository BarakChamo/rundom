// Exercises XML stylesheet text and selector specificity through the public CSSOM.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

const namespace = "http://www.w3.org/1999/xhtml";

describe("Window stylesheet source and cascade", () => {
  for (const prefix of ["", "h:"]) {
    it(`applies CDATA stylesheet text with namespace prefix '${prefix}'`, () => {
      // Given: XML styles contain mixed text, CDATA, comments, and processing instructions.
      const dom = new JSDOM(
        `<${prefix}html xmlns${prefix ? ":h" : ""}="${namespace}"><${prefix}head><${prefix}style>p { <![CDATA[color: rgb(0, 128, 0)]]>; }<!--p { color:red }--><?ignore p { color: red }?></${prefix}style></${prefix}head><${prefix}body><${prefix}p id="target">Text</${prefix}p></${prefix}body></${prefix}html>`,
        { contentType: "application/xhtml+xml" },
      );
      try {
        const w = dom.window,
          target = w.document.getElementById("target");
        if (!target) throw new Error("Expected a styled XML paragraph");
        // When: the stylesheet is read through computed style.
        // Then: only Text and CDATA contribute CSS, independent of the element prefix.
        expect(w.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
        expect(w.document.styleSheets.length).toBe(1);
      } finally {
        dom.window.close();
      }
    });
  }

  it("recomputes an XML stylesheet after its CDATA node changes", () => {
    // Given: an applied stylesheet whose entire source is CDATA.
    const dom = new JSDOM(
      `<html xmlns="${namespace}"><head><style><![CDATA[p { color: red }]]></style></head><body><p id="target"/></body></html>`,
      { contentType: "application/xhtml+xml" },
    );
    try {
      const w = dom.window,
        target = w.document.getElementById("target"),
        cdata = w.document.querySelector("style")?.firstChild;
      if (!target || !cdata) throw new Error("Expected a CDATA stylesheet and target");
      expect(w.getComputedStyle(target).color).toBe("rgb(255, 0, 0)");
      // When: a character-data mutation changes the CSS source.
      cdata.nodeValue = "p { color: green }";
      // Then: computed style sees the new rule.
      expect(w.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
    } finally {
      dom.window.close();
    }
  });

  for (const selector of [
    ":is(.selected, #absent)",
    ":not(.other, #absent)",
    ":has(.inside, #absent)",
    ":is(:not(#absent), .other)",
  ]) {
    it(`uses the most specific argument of ${selector}`, () => {
      // Given: an unmatched ID argument outranks a later class selector.
      const dom = new JSDOM(
        `<style>${selector} { color: green }.selected { color: red }</style><p id=target class=selected><i class=inside></i></p>`,
      );
      try {
        const w = dom.window,
          target = w.document.getElementById("target");
        if (!target) throw new Error("Expected a cascade target");
        // When: a matching list pseudo-class participates in the cascade.
        // Then: specificity comes from its most specific argument, even an unmatched one.
        expect(w.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
      } finally {
        dom.window.close();
      }
    });
  }

  it("keeps where specificity at zero through nested ID selectors", () => {
    // Given: a zero-specificity pseudo-class appears after a type selector.
    const dom = new JSDOM(
      `<style>p { color: green }:where(:is(#target)) { color: red }</style><p id=target>Text</p>`,
    );
    try {
      const w = dom.window,
        target = w.document.getElementById("target");
      if (!target) throw new Error("Expected a cascade target");
      // When: both selectors match.
      // Then: the type selector still wins.
      expect(w.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
    } finally {
      dom.window.close();
    }
  });
  it("does not carry a large class count into the ID specificity column", () => {
    // Given: over a thousand repeated classes compete with a single ID selector.
    const dom = new JSDOM(
      `<style>#target { color: green }${".x".repeat(1001)} { color: red }</style><p id=target class=x>Text</p>`,
    );
    try {
      const w = dom.window,
        target = w.document.getElementById("target");
      if (!target) throw new Error("Expected a cascade target");
      // When: both rules match.
      // Then: independent specificity components keep the ID rule ahead.
      expect(w.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
    } finally {
      dom.window.close();
    }
  });

  it("keeps inline style ahead of even the strongest author selector", () => {
    // Given: repeated IDs raise author specificity without changing its cascade origin.
    const dom = new JSDOM(
      `<style>#target#target { color: red }</style><p id=target style="color: green">Text</p>`,
    );
    try {
      const w = dom.window,
        target = w.document.getElementById("target");
      if (!target) throw new Error("Expected a cascade target");
      // When: the author selector and inline style both apply.
      // Then: inline style keeps its higher cascade priority.
      expect(w.getComputedStyle(target).color).toBe("rgb(0, 128, 0)");
    } finally {
      dom.window.close();
    }
  });

  it("treats whitespace Text and CDATA as content for empty matching", () => {
    // Given: XML elements start empty, with only comments, or with CDATA text.
    const dom = new JSDOM(
      `<html xmlns="${namespace}"><head><style><![CDATA[p {color:red} p:empty {color:green}]]></style></head><body><p id="blank"><!--comment--></p><p id="data"><![CDATA[ ]]></p></body></html>`,
      { contentType: "application/xhtml+xml" },
    );
    try {
      const w = dom.window,
        blank = w.document.getElementById("blank"),
        data = w.document.getElementById("data");
      if (!blank || !data) throw new Error("Expected XML empty-selector targets");
      expect(blank.matches(":empty")).toBe(true);
      expect(data.matches(":empty")).toBe(false);
      // When: an initially empty element gains a whitespace text node.
      blank.appendChild(w.document.createTextNode(" "));
      // Then: both DOM querying and stylesheet matching follow jsdom's empty contract.
      expect(blank.matches(":empty")).toBe(false);
      expect(w.getComputedStyle(blank).color).toBe("rgb(255, 0, 0)");
    } finally {
      dom.window.close();
    }
  });
  it("publishes repeated cssText assignments while identical property writes stay silent", () => {
    // Given: an inline block with author whitespace and a mutation observer.
    const dom = new JSDOM('<p style="background:   red"></p>');
    try {
      const w = dom.window,
        node = w.document.querySelector("p");
      if (!(node instanceof w.HTMLElement)) throw new Error("Expected an HTML style owner");
      const observer = new w.MutationObserver(() => {});
      observer.observe(node, { attributes: true, attributeOldValue: true });
      // When: cssText reparses equivalent declarations, then a property repeats its current value.
      node.style.cssText = "background:red";
      node.style.cssText = "background:red";
      node.style.setProperty("background", "red");
      // Then: both cssText writes publish canonical attributes, with no extra property mutation.
      const records = observer.takeRecords();
      expect(records.map((record) => record.oldValue)).toEqual([
        "background:   red",
        "background: red;",
      ]);
      expect(node.getAttribute("style")).toBe("background: red;");
      observer.disconnect();
    } finally {
      dom.window.close();
    }
  });

  it("distinguishes undefined property values from null's empty-string conversion", () => {
    // Given: a declaration with an existing color.
    const dom = new JSDOM("<p></p>");
    try {
      const w = dom.window,
        node = w.document.querySelector("p");
      if (!(node instanceof w.HTMLElement)) throw new Error("Expected an HTML style owner");
      node.style.color = "white";
      // When: Web IDL receives explicit undefined, then null.
      Reflect.apply(node.style.setProperty, node.style, ["color", undefined]);
      // Then: invalid text is ignored, whereas null requests removal.
      expect(node.style.color).toBe("white");
      Reflect.apply(node.style.setProperty, node.style, ["color", null]);
      expect(node.style.color).toBe("");
    } finally {
      dom.window.close();
    }
  });

  it("recovers a declaration list after nested qualified rules and intervening at-rules", () => {
    // Given: cssText is a declaration-list boundary rather than a nested style-rule block.
    const dom = new JSDOM("<p></p>");
    try {
      const w = dom.window,
        node = w.document.querySelector("p");
      if (!(node instanceof w.HTMLElement)) throw new Error("Expected an HTML style owner");
      // When: recovery encounters a qualified rule followed by at-rules and declarations.
      node.style.cssText =
        "color: blue; &.d {color: peru} @media screen {color:red} @layer {color:black} color:pink; background:orange;";
      // Then: it discards the first following declaration while preserving later valid ones.
      expect(node.style.cssText).toBe("color: blue; background: orange;");
      node.style.cssText = "color: blue; @media screen {color:red} color:orange;";
      expect(node.style.cssText).toBe("color: orange;");
    } finally {
      dom.window.close();
    }
  });
});
