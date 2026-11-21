// Pins combined DOM mutation validation and the ordering of post-connection script work.
import { describe, expect, it } from "vitest";
import { JSDOM } from "../src/jsdom.js";

function scriptedWindow() {
  return new JSDOM("<!doctype html><body>", { runScripts: "dangerously" });
}

describe("JSDOM combined insertion", () => {
  for (const method of ["append", "prepend"] as const) {
    it(`validates all ${method} arguments before inserting either document element`, () => {
      // Given: an empty document and two proposed roots.
      const dom = new JSDOM();
      const d = new dom.window.Document();
      const a = d.createElement("a"),
        b = d.createElement("b");
      // When: both are inserted in one call.
      // Then: the document remains empty after hierarchy validation fails.
      expect(() => d[method](a, b)).toThrow("Invalid document children");
      expect(d.childNodes.length).toBe(0);
      dom.window.close();
    });
  }

  it("replaces a document's existing doctype and root with one element", () => {
    // Given: an ordinary document containing both constrained children.
    const dom = new JSDOM("<!doctype html><title>old</title>");
    const d = dom.window.document,
      root = d.createElement("replacement");
    // When: replaceChildren selects a new root.
    d.replaceChildren(root);
    // Then: validation disregards all children that the operation removes.
    expect([...d.childNodes]).toEqual([root]);
    dom.window.close();
  });

  it("inserts the entire script list before executing the first script", () => {
    // Given: the first script adds code to a later, initially empty script.
    const dom = scriptedWindow();
    const w = dom.window,
      d = w.document;
    w.eval("globalThis.happened=[]");
    const a = d.createElement("script"),
      b = d.createElement("script"),
      c = d.createElement("script");
    Object.assign(w, { later: c });
    a.textContent =
      "later.appendChild(new Text(\"happened.push('later')\"));happened.push('first')";
    b.textContent = "happened.push('second')";
    // When: one append inserts all three.
    if (!d.body) throw new Error("The fixture must have a body");
    d.body.append(a, b, c);
    // Then: changing the connected empty script prepares it reentrantly.
    expect(w.eval("JSON.stringify(happened)")).toBe(JSON.stringify(["later", "first", "second"]));
    dom.window.close();
  });

  for (const frameFirst of [true, false]) {
    it(`runs nested frame setup and script preparation in order with frameFirst=${frameFirst}`, () => {
      // Given: a detached container with a script and frame in a specified order.
      const dom = scriptedWindow();
      const w = dom.window,
        d = w.document;
      const div = d.createElement("div"),
        frame = d.createElement("iframe"),
        script = d.createElement("script");
      Object.assign(w, { frame });
      script.textContent = "globalThis.sawFrame=frame.contentWindow!==null";
      div.append(...(frameFirst ? [frame, script] : [script, frame]));
      // When: the whole subtree is connected.
      if (!d.body) throw new Error("The fixture must have a body");
      d.body.appendChild(div);
      // Then: post-connection work follows tree order after structural insertion.
      expect(w.eval("sawFrame")).toBe(frameFirst);
      expect(w.eval("frame.contentWindow!==null")).toBe(true);
      dom.window.close();
    });
  }

  it("runs script descendants when their shadow host becomes connected", () => {
    // Given: a detached host containing an unstarted script in its shadow tree.
    const dom = scriptedWindow();
    const w = dom.window,
      d = w.document;
    const host = d.createElement("div"),
      root = host.attachShadow({ mode: "open" });
    const script = d.createElement("script");
    script.textContent = "globalThis.shadowRan=true";
    root.appendChild(script);
    // When: the host is connected.
    if (!d.body) throw new Error("The fixture must have a body");
    d.body.appendChild(host);
    // Then: post-connection traverses the shadow tree too.
    expect(w.eval("globalThis.shadowRan")).toBe(true);
    dom.window.close();
  });

  it("finishes both scripts before invoking their connected reactions", () => {
    // Given: customized script elements record both execution and connection.
    const dom = scriptedWindow();
    const w = dom.window;
    // When: one append connects both custom elements.
    w.eval(
      `globalThis.order=[];class S1 extends HTMLScriptElement {connectedCallback(){order.push('connected1')}};class S2 extends HTMLScriptElement {connectedCallback(){order.push('connected2')}};customElements.define('x-s1',S1,{extends:'script'});customElements.define('x-s2',S2,{extends:'script'});const a=new S1(),b=new S2();a.textContent="order.push('script1')";b.textContent="order.push('script2')";document.body.append(a,b);`,
    );
    // Then: the enclosing mutation reaction boundary surrounds all post-connection work.
    expect(w.eval("JSON.stringify(order)")).toBe(
      JSON.stringify(["script1", "script2", "connected1", "connected2"]),
    );
    dom.window.close();
  });
});
