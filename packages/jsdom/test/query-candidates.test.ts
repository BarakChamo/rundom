// Preserves observable query semantics when a derived candidate index narrows tree traversal.
import { describe, expect, it } from "vitest";
import { JSDOM } from "@run-dom/jsdom";

describe("Query candidates", () => {
  it("invalidates detached candidates before resource cleanup can reenter queries", () => {
    // Given: cleanup may synchronously call a replaceable child Window operation.
    const { window } = new JSDOM("<!doctype html><iframe></iframe>");
    try {
      const frame = window.document.querySelector("iframe");
      if (!(frame instanceof window.HTMLIFrameElement) || !frame.contentWindow)
        throw new Error("Expected child Window");
      expect(window.document.querySelectorAll("iframe").length).toBe(1);
      const child = frame.contentWindow,
        close = child.close;
      let observed = -1;
      child.close = () => {
        observed = window.document.querySelectorAll("iframe").length;
        close.call(child);
      };
      // When/Then: the indexed view agrees with the already-detached raw tree.
      frame.remove();
      expect(observed).toBe(0);
    } finally {
      window.close();
    }
  });
  it("shares Unicode preprocessing between candidates and matching", () => {
    // Given: CSS replaces null and unpaired surrogate code points before matching.
    const { window } = new JSDOM('<!doctype html><p id="x�"></p>');
    try {
      // When/Then: indexing cannot remove the element that the normalized predicate matches.
      for (const selector of ["#x\ud800", "#x\0"])
        expect(window.document.querySelectorAll(selector).length).toBe(1);
    } finally {
      window.close();
    }
  });
  it("retains late matches and mutations in a tree larger than the index budget", () => {
    // Given: large trees must remain correct when a derived view reaches its memory bound.
    const { window } = new JSDOM(
      "<!doctype html><main>" + "<p></p>".repeat(20000) + "<button></button></main>",
    );
    try {
      expect(window.document.querySelectorAll("button").length).toBe(1);
      const button = window.document.querySelector("button");
      if (!button) throw new Error("Expected late button");
      // When/Then: linear fallback preserves current arbitrary attributes and removal.
      button.setAttribute("role", "tab");
      expect(window.document.querySelectorAll("[role]").length).toBe(1);
      button.remove();
      expect(window.document.querySelectorAll("button,[role]").length).toBe(0);
    } finally {
      window.close();
    }
  });
  it("keeps escaped literal separators distinct from namespace syntax", () => {
    // Given: HTML parsing can produce attribute names containing a literal vertical bar.
    const { window } = new JSDOM('<!doctype html><p data|key="yes"></p>');
    try {
      // When/Then: the escaped separator belongs to the attribute name.
      expect(window.document.querySelectorAll(String.raw`[data\|key]`).length).toBe(1);
      expect(window.document.querySelectorAll(String.raw`p[data\|key]`).length).toBe(1);
    } finally {
      window.close();
    }
  });
  it("retains tree order, duplicate IDs, independent lists, and arbitrary attribute changes", () => {
    // Given: overlapping selector branches must return each element once in tree order.
    const { window } = new JSDOM(
      '<!doctype html><main><i id="same" class="A" role="button"></i><button id="same"></button><p></p></main>',
    );
    try {
      const main = window.document.querySelector("main");
      if (!main) throw new Error("Expected query fixture");
      const first = main.querySelectorAll("button,[role],#same,.A");
      expect(Array.from(first, (node) => node?.localName)).toEqual(["i", "button"]);
      expect(main.querySelectorAll("#same").length).toBe(2);
      const p = main.querySelector("p");
      if (!p) throw new Error("Expected paragraph");
      // When/Then: changes unrelated to existing tree revision attributes still affect candidates.
      p.setAttribute("role", "button");
      expect(main.querySelectorAll("[role]").length).toBe(2);
      p.removeAttribute("role");
      expect(main.querySelectorAll("[role]").length).toBe(1);
      p.className = "A";
      expect(main.querySelectorAll(".A").length).toBe(2);
      main.prepend(p);
      expect(main.querySelector(".A")).toBe(p);
      expect(first.length).toBe(2);
      main.replaceChildren(p);
      expect(main.querySelectorAll("button,[role],#same,.A").length).toBe(1);
    } finally {
      window.close();
    }
  });
  it("reevaluates control state without requiring a topology or attribute change", () => {
    // Given: checkedness and indeterminateness are private control state.
    const { window } = new JSDOM('<!doctype html><main><input type="checkbox"></main>');
    try {
      const main = window.document.querySelector("main"),
        input = window.document.querySelector("input");
      if (!main || !(input instanceof window.HTMLInputElement)) throw new Error("Expected input");
      expect(main.querySelector("input:checked")).toBe(null);
      // When/Then: only candidate membership may be reused, never selector results.
      input.checked = true;
      expect(main.querySelector("input:checked")).toBe(input);
      input.checked = false;
      expect(main.querySelector("input:checked")).toBe(null);
      input.indeterminate = true;
      expect(main.querySelector("[type]:indeterminate")).toBe(input);
      expect(main.querySelector(":is(:unknown,input):indeterminate")).toBe(input);
    } finally {
      window.close();
    }
  });
  it("isolates fragment, shadow, template, and mixed-namespace candidates", () => {
    // Given: each ParentNode query searches its own ordinary subtree.
    const { window } = new JSDOM(
      '<!doctype html><main><template><button></button></template><svg><linearGradient id="SVG"></linearGradient></svg></main>',
    );
    try {
      const main = window.document.querySelector("main");
      if (!main) throw new Error("Expected main");
      const shadow = main.attachShadow({ mode: "open" });
      shadow.innerHTML = "<button></button>";
      const fragment = window.document.createDocumentFragment();
      fragment.append(window.document.createElement("button"));
      // When/Then: neither attached shadow trees nor template contents leak into document results.
      expect(main.querySelector("button")).toBe(null);
      expect(shadow.querySelector("button")?.localName).toBe("button");
      expect(fragment.querySelectorAll("button").length).toBe(1);
      expect(main.querySelector("linearGradient")?.id).toBe("SVG");
      const xml = new window.DOMParser().parseFromString(
        "<Root><Item/><item/></Root>",
        "application/xml",
      );
      expect(xml.querySelectorAll("Item").length).toBe(1);
      expect(xml.querySelectorAll("item").length).toBe(1);
    } finally {
      window.close();
    }
  });
  it("keeps original wrappers fresh after adoption and cross-Window mutations", () => {
    // Given: wrappers preserve their original prototype after adoption into another Window.
    const a = new JSDOM('<!doctype html><main><p role="button"></p></main>'),
      b = new JSDOM("<!doctype html><body></body>");
    try {
      const main = a.window.document.querySelector("main");
      if (!main) throw new Error("Expected main");
      expect(main.querySelectorAll("[role]").length).toBe(1);
      b.window.document.body?.append(main);
      // When/Then: the destination's changes remain visible through the old query methods.
      const child = b.window.document.createElement("button");
      main.append(child);
      expect(main.querySelectorAll("button,[role]").length).toBe(2);
      child.setAttribute("role", "tab");
      expect(main.querySelectorAll("[role]").length).toBe(2);
      const original = main.querySelector("p");
      if (!original) throw new Error("Expected original wrapper");
      expect(b.window.document.querySelectorAll("[role]").length).toBe(2);
      original.removeAttribute("role");
      expect(b.window.document.querySelectorAll("[role]").length).toBe(1);
      original.setAttribute("role", "tab");
      child.remove();
      expect(main.querySelectorAll("button,[role]").length).toBe(1);
    } finally {
      a.window.close();
      b.window.close();
    }
  });
});

describe("Query lookup reuse", () => {
  it("keeps diverse selectors ordered before and after attribute and topology edits", () => {
    // Given: different lookups search one stable root before a write invalidates all derived work.
    const { window: w } = new JSDOM(
      '<main><i id="dup" class="a" data-key="x"></i><b id="dup" class="b"></b><i class="b"></i></main>',
    );
    try {
      const main = w.document.querySelector("main");
      if (!main) throw new Error("Expected main");
      const [first, second, third] = [...main.children];
      if (!first || !second || !third) throw new Error("Expected members");
      for (let round = 0; round < 4; round++) {
        expect([...main.querySelectorAll(".a")]).toEqual([first]);
        expect([...main.querySelectorAll(".b")]).toEqual([second, third]);
        expect([...main.querySelectorAll("[data-key]")]).toEqual([first]);
        expect([...main.querySelectorAll("#dup")]).toEqual([first, second]);
        expect([...main.querySelectorAll("b,.a,i.b")]).toEqual([first, second, third]);
        expect(main.querySelector(".missing")).toBeNull();
      }
      const retained = main.querySelectorAll(".b");
      // When/Then: no admitted lookup can outlive writes, and retained public results stay static.
      first.className = "b";
      second.removeAttribute("id");
      third.setAttribute("data-key", "y");
      main.prepend(third);
      for (let round = 0; round < 4; round++) {
        expect([...main.querySelectorAll(".a")]).toEqual([]);
        expect([...main.querySelectorAll(".b")]).toEqual([third, first, second]);
        expect([...main.querySelectorAll("[data-key]")]).toEqual([third, first]);
        expect([...main.querySelectorAll("#dup")]).toEqual([first]);
        expect(main.querySelector(".b")).toBe(third);
      }
      expect([...retained]).toEqual([second, third]);
    } finally {
      w.close();
    }
  });

  it("preserves independent roots and snapshots through many-root lookup churn", () => {
    // Given: more independent roots than the lookup retention budget remain observable DOM trees.
    const { window: w } = new JSDOM(
      "<main>" + '<section><i class="a"></i><b data-key="x"></b></section>'.repeat(40) + "</main>",
    );
    try {
      const roots = [...w.document.querySelectorAll("section")];
      for (let round = 0; round < 4; round++)
        for (const root of roots) {
          const [first, second] = [...root.children];
          expect([...root.querySelectorAll(".a")]).toEqual([first]);
          expect([...root.querySelectorAll("[data-key]")]).toEqual([second]);
          expect([...root.querySelectorAll("i,b")]).toEqual([first, second]);
          expect([...root.querySelectorAll("b,.a")]).toEqual([first, second]);
        }
      // When/Then: eviction and subsequent edits do not change lookup semantics or snapshot isolation.
      const root = roots[0];
      if (!root) throw new Error("Expected root");
      const old = root.querySelectorAll(".a");
      root.replaceChildren(w.document.createElement("b"));
      expect(root.querySelectorAll(".a").length).toBe(0);
      expect(root.querySelectorAll("b").length).toBe(1);
      expect(old.length).toBe(1);
    } finally {
      w.close();
    }
  });
});
