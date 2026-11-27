// Pins insertion/removal observability with each optional DOM feature both present and absent.
import { describe, expect, it } from "vitest";
import { JSDOM } from "../src/jsdom.js";

function page(markup = "<!doctype html><body><main id=host></main>", scripts = false) {
  const dom = new JSDOM(markup, scripts ? { runScripts: "dangerously" } : {});
  const document = dom.window.document;
  const host = document.getElementById("host");
  if (!host) throw new Error("The fixture must have a host");
  return { dom, window: dom.window, document, host };
}

function narrow<T>(value: unknown, type: abstract new (...args: never[]) => T): T {
  if (!(value instanceof type)) throw new Error(`Expected ${type.name}`);
  return value;
}

describe("Node insertion and removal fast path", () => {
  it("reports ordered child-list records with siblings when an observer exists", async () => {
    // Given: an observed host with one existing child.
    const { dom, window, document, host } = page();
    const first = host.appendChild(document.createElement("p"));
    const observer = new window.MutationObserver(() => {});
    observer.observe(host, { childList: true, subtree: true });
    // When: elements and text are appended, inserted, removed and replaced by text.
    const last = host.appendChild(document.createElement("span"));
    const middle = host.insertBefore(document.createTextNode("t"), last);
    host.removeChild(first);
    host.textContent = "x";
    // Then: every operation yields one record in operation order with exact siblings.
    const records = observer.takeRecords();
    expect(
      records.map((record) => [
        record.addedNodes.length,
        record.removedNodes.length,
        record.previousSibling,
        record.nextSibling,
      ]),
    ).toEqual([
      [1, 0, first, null],
      [1, 0, first, last],
      [0, 1, null, middle],
      [1, 2, null, null],
    ]);
    expect(records[0]?.addedNodes[0]).toBe(last);
    expect(records[3]?.removedNodes[1]).toBe(last);
    observer.disconnect();
    await Promise.resolve();
    dom.window.close();
  });

  it("starts recording only after an observer exists", () => {
    // Given: mutations made while no observer is registered.
    const { dom, window, document, host } = page();
    const early = host.appendChild(document.createElement("span"));
    host.removeChild(early);
    const observer = new window.MutationObserver(() => {});
    // When: an observer registers and one more child is appended.
    observer.observe(host, { childList: true });
    const late = host.appendChild(document.createElement("b"));
    // Then: only the observed mutation is recorded.
    const records = observer.takeRecords();
    expect(records.length).toBe(1);
    expect(records[0]?.addedNodes[0]).toBe(late);
    observer.disconnect();
    dom.window.close();
  });

  it("orders custom connected and disconnected callbacks around moves", () => {
    // Given: a defined custom element that logs its lifecycle.
    const { dom, window } = page(
      "<!doctype html><body><main id=host></main><p id=other></p>",
      true,
    );
    window.eval(
      "globalThis.log=[];customElements.define('x-life',class extends HTMLElement{connectedCallback(){log.push('c:'+this.parentNode.id)}disconnectedCallback(){log.push('d')}})",
    );
    // When: it is appended, moved to another parent and removed.
    window.eval(
      "const e=document.createElement('x-life');host.append(e);other.appendChild(e);e.remove();",
    );
    // Then: each connection change produces callbacks in mutation order.
    expect(window.eval("log.join()")).toBe("c:host,d,c:other,d");
    dom.window.close();
  });

  it("upgrades and connects elements inserted before any definition exists", () => {
    // Given: an undefined custom element inserted without a registry in use.
    const { dom, window } = page(undefined, true);
    window.eval("globalThis.log=[];host.append(document.createElement('x-late'))");
    // When: the definition appears later.
    window.eval(
      "customElements.define('x-late',class extends HTMLElement{connectedCallback(){log.push('c')}})",
    );
    // Then: the upgrade connects the already inserted element once.
    expect(window.eval("log.join()")).toBe("c");
    dom.window.close();
  });

  it("moves live range boundaries on insertion and removal", () => {
    // Given: a live range positioned after the host's second child.
    const { dom, document, host } = page();
    const a = host.appendChild(document.createElement("a"));
    host.appendChild(document.createElement("b"));
    const range = document.createRange();
    range.setStart(host, 2);
    range.setEnd(host, 2);
    // When: a child is inserted before the boundary and an earlier child is removed.
    host.insertBefore(document.createElement("i"), a);
    host.removeChild(a);
    // Then: the boundary offset follows the same child position.
    expect([range.startContainer, range.startOffset]).toEqual([host, 2]);
    dom.window.close();
  });

  it("creates ranges with correct boundaries after unobserved mutations", () => {
    // Given: several insertions and removals before any range exists.
    const { dom, document, host } = page();
    for (let index = 0; index < 3; index++) host.appendChild(document.createElement("i"));
    const first = host.firstChild;
    if (!first) throw new Error("Expected a child");
    host.removeChild(first);
    // When: a range selects the host contents.
    const range = document.createRange();
    range.selectNodeContents(host);
    // Then: it spans exactly the remaining children.
    expect(range.endOffset).toBe(2);
    dom.window.close();
  });

  it("runs inserted scripts and applies inserted styles while plain elements stay inert", () => {
    // Given: a scripted page.
    const { dom, window, document, host } = page(undefined, true);
    const script = document.createElement("script");
    script.textContent = "globalThis.ran=(globalThis.ran||0)+1";
    const style = document.createElement("style");
    style.textContent = "#host span{color:rgb(1, 2, 3)}";
    const plain = document.createElement("div");
    plain.textContent = "globalThis.ran=99";
    // When: a script, a style and a plain element are inserted.
    host.append(plain, script, style);
    const span = host.appendChild(document.createElement("span"));
    // Then: only the script executes and the style affects later elements.
    expect(window.eval("ran")).toBe(1);
    expect(window.getComputedStyle(span).color).toBe("rgb(1, 2, 3)");
    // When: the style element is removed.
    host.removeChild(style);
    // Then: the rule no longer applies.
    expect(window.getComputedStyle(span).color).not.toBe("rgb(1, 2, 3)");
    dom.window.close();
  });

  it("connects and disconnects inserted frames, including nested ones", () => {
    // Given: a frame directly and a frame nested inside a wrapper.
    const { dom, window, document, host } = page();
    const frame = narrow(document.createElement("iframe"), window.HTMLIFrameElement);
    const wrapper = document.createElement("div");
    wrapper.appendChild(document.createElement("iframe"));
    // When: both are connected.
    host.append(frame, wrapper);
    // Then: both receive browsing contexts and Window indices.
    expect(frame.contentWindow).not.toBeNull();
    expect(window.length).toBe(2);
    // When: the wrapper is removed.
    host.removeChild(wrapper);
    // Then: only the direct frame remains indexed.
    expect(window.length).toBe(1);
    dom.window.close();
  });

  it("updates document named access for named descendants but not unnamed elements", () => {
    // Given: a nested named image and an element whose name does not contribute.
    const { dom, document, host } = page();
    const named = document as unknown as Record<string, unknown>;
    const wrapper = document.createElement("div");
    const image = wrapper.appendChild(document.createElement("img"));
    image.setAttribute("name", "pic");
    const span = document.createElement("span");
    span.setAttribute("name", "nope");
    expect(named.pic).toBeUndefined();
    // When: both are inserted.
    host.append(wrapper, span);
    // Then: only the image becomes a named property.
    expect(named.pic).toBe(image);
    expect(named.nope).toBeUndefined();
    // When: the wrapper is removed.
    host.removeChild(wrapper);
    // Then: the name disappears.
    expect(named.pic).toBeUndefined();
    dom.window.close();
  });

  it("normalizes radio groups, exclusive details and selected options on insertion", () => {
    // Given: a checked radio, an open named details and a select with a selected option.
    const { dom, window, document } = page(
      "<!doctype html><body><main id=host><form id=f><input type=radio name=g checked id=r1></form><details name=d open id=d1></details><select id=s><option selected>a</option></select></main>",
    );
    const form = narrow(document.getElementById("f"), window.HTMLFormElement);
    const radio = narrow(document.createElement("input"), window.HTMLInputElement);
    radio.type = "radio";
    radio.name = "g";
    radio.defaultChecked = true;
    const details = narrow(document.createElement("details"), window.HTMLDetailsElement);
    details.setAttribute("name", "d");
    details.open = true;
    const option = narrow(document.createElement("option"), window.HTMLOptionElement);
    option.defaultSelected = true;
    const select = narrow(document.getElementById("s"), window.HTMLSelectElement);
    // When: the new checked/open/selected elements are inserted.
    form.appendChild(radio);
    document.getElementById("host")?.appendChild(details);
    select.appendChild(option);
    // Then: each feature's insertion normalization runs.
    expect(narrow(document.getElementById("r1"), window.HTMLInputElement).checked).toBe(false);
    expect(radio.checked).toBe(true);
    expect(details.open).toBe(false);
    expect(select.selectedIndex).toBe(1);
    dom.window.close();
  });

  it("keeps getElementById current across appends, removals and innerHTML replacement", () => {
    // Given: a warmed document ID index.
    const { dom, document, host } = page();
    for (let index = 0; index < 8; index++) document.getElementById("host");
    const a = document.createElement("p");
    a.id = "x";
    // When: elements with that ID come and go through each mutation path.
    host.appendChild(a);
    const afterAppend = document.getElementById("x");
    host.removeChild(a);
    const afterRemove = document.getElementById("x");
    host.innerHTML = "<div><p id=x>new</p></div>";
    const afterReplace = document.getElementById("x");
    host.innerHTML = "";
    // Then: every lookup reflects the current tree.
    expect(afterAppend).toBe(a);
    expect(afterRemove).toBeNull();
    expect(afterReplace?.textContent).toBe("new");
    expect(document.getElementById("x")).toBeNull();
    dom.window.close();
  });

  it("drops nested names and IDs when innerHTML replaces a wide list", () => {
    // Given: a warmed ID index and a list whose items hide a nested named form and an ID.
    const { dom, document, host } = page();
    const named = document as unknown as Record<string, unknown>;
    const rows = Array.from({ length: 40 }, (_, index) => `<li data-row=${index}>${index}</li>`);
    host.innerHTML = `<ul>${rows.join("")}<li><div><form name=deep></form><b id=inner></b></div></li></ul>`;
    for (let index = 0; index < 8; index++) document.getElementById("inner");
    expect(named.deep).toBeInstanceOf(document.defaultView?.HTMLFormElement);
    // When: the list is replaced by markup without those descendants.
    host.innerHTML = rows.join("");
    // Then: neither the nested name nor the nested ID remains reachable.
    expect(named.deep).toBeUndefined();
    expect(document.getElementById("inner")).toBeNull();
    dom.window.close();
  });

  it("clears parser form association only when a control leaves without its form", () => {
    // Given: a control associated by the parser with a form that is not its ancestor.
    const { dom, window, document, host } = page(
      "<!doctype html><body><main id=host><div><form id=f></div><input id=i></main>",
    );
    const input = narrow(document.getElementById("i"), window.HTMLInputElement);
    const form = document.getElementById("f");
    expect(input.form).toBe(form);
    // When: the control is removed and reinserted.
    input.remove();
    host.appendChild(input);
    // Then: the parser association does not survive the removal.
    expect(input.form).toBeNull();
    dom.window.close();
  });
});
