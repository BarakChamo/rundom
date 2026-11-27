// Pins insertion steps for deep subtrees built bottom-up, top-down, removed, re-inserted and moved.
import { describe, expect, it } from "vitest";
import { JSDOM } from "../src/jsdom.js";

const depth = 40;

type TestWindow = JSDOM["window"];
type TestDocument = TestWindow["document"];
type TestElement = ReturnType<TestDocument["createElement"]>;
type TestNode = Parameters<TestElement["appendChild"]>[0];

function narrow<T>(value: unknown, type: abstract new (...args: never[]) => T): T {
  if (!(value instanceof type)) throw new Error(`Expected ${type.name}`);
  return value;
}

function page(scripts = false) {
  const dom = new JSDOM(
    "<!doctype html><body><main id=host></main>",
    scripts ? { runScripts: "dangerously" } : {},
  );
  const { window } = dom;
  const host = window.document.getElementById("host");
  if (!host) throw new Error("The fixture must have a host");
  return { window, document: window.document, host };
}

// Wraps leaf in depth detached divs, appending each child to its parent before the parent has one.
function bottomUp(document: TestDocument, leaf: TestNode) {
  const inner = document.createElement("div");
  inner.appendChild(leaf);
  let root = inner;
  for (let level = 1; level < depth; level++) {
    const parent = document.createElement("div");
    parent.appendChild(root);
    root = parent;
  }
  return { root, inner };
}

// Appends depth connected divs one below the other and returns the deepest.
function topDown(parent: TestElement): TestElement {
  const document = parent.ownerDocument;
  if (!document) throw new Error("An element must have a node document");
  let node = parent;
  for (let level = 0; level < depth; level++)
    node = node.appendChild(document.createElement("div"));
  return node;
}

function radio(window: TestWindow, name: string, checked: boolean) {
  const input = narrow(window.document.createElement("input"), window.HTMLInputElement);
  input.type = "radio";
  input.name = name;
  input.checked = checked;
  return input;
}

describe("Node insertion steps for deep subtrees", () => {
  it("normalizes a radio group when a deep checked radio joins a detached form", () => {
    // Given: a detached form holding a checked radio, and a second checked radio built deep bottom-up.
    const { window, document } = page();
    const form = document.createElement("form");
    const first = form.appendChild(radio(window, "r", true));
    const second = radio(window, "r", true);
    const { root } = bottomUp(document, second);
    // When: the deep subtree is inserted into the detached form.
    form.appendChild(root);
    // Then: the inserted checked radio unchecks the earlier group member.
    expect([first.checked, second.checked]).toEqual([false, true]);
    window.close();
  });

  it("normalizes a radio added under a removed subtree when it is re-inserted", () => {
    // Given: a connected form and a deep subtree that was inserted and removed again.
    const { window, document, host } = page();
    const form = host.appendChild(document.createElement("form"));
    const first = form.appendChild(radio(window, "r", true));
    const { root, inner } = bottomUp(document, document.createElement("span"));
    form.appendChild(root);
    root.remove();
    // When: a checked radio is added deep inside the removed subtree, which then returns.
    const second = inner.appendChild(radio(window, "r", true));
    form.appendChild(root);
    // Then: insertion still sees the new radio and normalizes the group.
    expect([first.checked, second.checked]).toEqual([false, true]);
    window.close();
  });

  it("applies a deep style element once connected and drops it on removal", () => {
    // Given: a style element wrapped deep in a detached subtree.
    const { window, document, host } = page();
    const style = document.createElement("style");
    style.textContent = "#target { color: rgb(1, 2, 3); }";
    const { root, inner } = bottomUp(document, style);
    const target = inner.appendChild(document.createElement("p"));
    target.id = "target";
    expect(document.styleSheets.length).toBe(0);
    // When: the subtree is connected, removed and connected again.
    host.appendChild(root);
    const connected = [document.styleSheets.length, window.getComputedStyle(target).color];
    root.remove();
    const removed = document.styleSheets.length;
    host.appendChild(root);
    // Then: the sheet follows connection.
    expect(connected).toEqual([1, "rgb(1, 2, 3)"]);
    expect(removed).toBe(0);
    expect(window.getComputedStyle(target).color).toBe("rgb(1, 2, 3)");
    window.close();
  });

  it("applies a style added by innerHTML inside a previously inserted detached subtree", () => {
    // Given: a deep subtree that already went through insertion while detached.
    const { window, document, host } = page();
    const { root, inner } = bottomUp(document, document.createElement("span"));
    document.createElement("section").appendChild(root);
    // When: markup adds a style deep inside it and the subtree is connected.
    inner.innerHTML = "<style>#host { color: rgb(4, 5, 6); }</style>";
    host.appendChild(root);
    // Then: the style element becomes active.
    expect(document.styleSheets.length).toBe(1);
    expect(window.getComputedStyle(host).color).toBe("rgb(4, 5, 6)");
    window.close();
  });

  it("runs a deep script from a fragment only once the fragment content is connected", () => {
    // Given: a script built deep bottom-up inside a fragment.
    const { window, document, host } = page(true);
    const script = document.createElement("script");
    script.textContent = "window.ran = (window.ran ?? 0) + 1;";
    const { root } = bottomUp(document, script);
    const fragment = document.createDocumentFragment();
    fragment.appendChild(root);
    const ran = () => (window as unknown as { ran?: number }).ran;
    expect(ran()).toBeUndefined();
    // When: the fragment is inserted top-down below deep connected content.
    topDown(host).appendChild(fragment);
    // Then: the script runs exactly once.
    expect(ran()).toBe(1);
    window.close();
  });

  it("starts a deep iframe only when connected, including through a shadow root", () => {
    // Given: an iframe deep in a detached tree, and one added later to a shadow root inside it.
    const { window, document, host } = page();
    const frame = narrow(document.createElement("iframe"), window.HTMLIFrameElement);
    const { root, inner } = bottomUp(document, frame);
    document.createElement("section").appendChild(root);
    const shadowed = narrow(document.createElement("iframe"), window.HTMLIFrameElement);
    inner.attachShadow({ mode: "open" }).appendChild(shadowed);
    expect([frame.contentWindow, shadowed.contentWindow]).toEqual([null, null]);
    // When: the subtree is connected.
    host.appendChild(root);
    // Then: both frames have browsing contexts.
    expect(frame.contentWindow).not.toBeNull();
    expect(shadowed.contentWindow).not.toBeNull();
    window.close();
  });

  it("connects deep custom elements in tree order and only when connected", () => {
    // Given: custom elements nested deep in a detached subtree built bottom-up.
    const { window, document, host } = page();
    const log: string[] = [];
    window.customElements.define(
      "x-probe",
      class extends window.HTMLElement {
        connectedCallback() {
          log.push(`connected ${this.id}`);
        }
        disconnectedCallback() {
          log.push(`disconnected ${this.id}`);
        }
      },
    );
    const outer = document.createElement("x-probe");
    outer.id = "outer";
    const inner = document.createElement("x-probe");
    inner.id = "inner";
    outer.appendChild(bottomUp(document, inner).root);
    const { root } = bottomUp(document, outer);
    document.createElement("section").appendChild(root);
    expect(log).toEqual([]);
    // When: the subtree is connected, removed and moved to deep connected content.
    host.appendChild(root);
    root.remove();
    topDown(host).appendChild(root);
    // Then: callbacks follow tree order on every connection.
    expect(log).toEqual([
      "connected outer",
      "connected inner",
      "disconnected outer",
      "disconnected inner",
      "connected outer",
      "connected inner",
    ]);
    window.close();
  });

  it("keeps ID lookups and named properties current for deep insertion, removal and moves", () => {
    // Given: an indexed document and a deep detached subtree holding an ID and a named image.
    const { window, document, host } = page();
    for (let count = 0; count < 6; count++) document.getElementById("missing");
    const image = document.createElement("img");
    image.setAttribute("name", "deepimage");
    const { root, inner } = bottomUp(document, image);
    const marked = inner.appendChild(document.createElement("p"));
    marked.id = "deep";
    const named = () => (document as unknown as Record<string, unknown>)["deepimage"];
    expect([document.getElementById("deep"), named()]).toEqual([null, undefined]);
    // When: the subtree is connected, removed and moved below deep connected content.
    host.appendChild(root);
    const inserted = [document.getElementById("deep"), named()];
    root.remove();
    const removed = [document.getElementById("deep"), named()];
    topDown(host).appendChild(root);
    // Then: each lookup reflects the current tree.
    expect(inserted).toEqual([marked, image]);
    expect(removed).toEqual([null, undefined]);
    expect([document.getElementById("deep"), named()]).toEqual([marked, image]);
    window.close();
  });

  it("finds an ID added to a removed deep subtree after it is re-inserted", () => {
    // Given: an indexed document and a deep subtree that was connected and removed.
    const { window, document, host } = page();
    for (let count = 0; count < 6; count++) document.getElementById("late");
    const { root, inner } = bottomUp(document, document.createElement("span"));
    host.appendChild(root);
    root.remove();
    // When: a parentless element gets an ID, joins the removed subtree, and the subtree returns.
    const late = document.createElement("p");
    late.id = "late";
    inner.appendChild(late);
    host.appendChild(root);
    // Then: the document index finds it.
    expect(document.getElementById("late")).toBe(late);
    window.close();
  });

  it("closes a duplicate open details element built deep in a detached tree", () => {
    // Given: a detached container with an open named details element.
    const { window, document } = page();
    const container = document.createElement("section");
    const first = container.appendChild(
      narrow(document.createElement("details"), window.HTMLDetailsElement),
    );
    first.name = "group";
    first.open = true;
    const second = narrow(document.createElement("details"), window.HTMLDetailsElement);
    second.name = "group";
    second.open = true;
    // When: a deep subtree holding a second open member is inserted.
    container.appendChild(bottomUp(document, second).root);
    // Then: the inserted duplicate closes.
    expect([first.open, second.open]).toEqual([true, false]);
    window.close();
  });

  it("records one child-list mutation per deep insertion", () => {
    // Given: a subtree observer on the host.
    const { window, document, host } = page();
    const observer = new window.MutationObserver(() => {});
    observer.observe(host, { childList: true, subtree: true });
    // When: a deep bottom-up subtree is inserted and a child is appended deep top-down.
    const { root } = bottomUp(document, document.createElement("span"));
    host.appendChild(root);
    const leaf = topDown(root);
    // Then: every insertion under the host is recorded once with its target.
    const records = observer.takeRecords();
    expect(records.length).toBe(1 + depth);
    expect(records[0]?.addedNodes[0]).toBe(root);
    expect(records.at(-1)?.addedNodes[0]).toBe(leaf);
    observer.disconnect();
    window.close();
  });

  it("applies style and ID lookups after a deep subtree moves to another document", () => {
    // Given: a deep subtree with a style and an ID built in another Window's document.
    const source = page();
    const destination = page();
    const style = source.document.createElement("style");
    style.textContent = "#moved { color: rgb(7, 8, 9); }";
    const { root, inner } = bottomUp(source.document, style);
    const moved = inner.appendChild(source.document.createElement("p"));
    moved.id = "moved";
    source.host.appendChild(root);
    // When: the subtree is appended into the destination document.
    destination.host.appendChild(root);
    // Then: the destination sees the style and ID; the source no longer does.
    expect(destination.document.styleSheets.length).toBe(1);
    expect(destination.document.getElementById("moved")).toBe(moved);
    expect(destination.window.getComputedStyle(moved).color).toBe("rgb(7, 8, 9)");
    expect(source.document.styleSheets.length).toBe(0);
    expect(source.document.getElementById("moved")).toBeNull();
    source.window.close();
    destination.window.close();
  });

  it("keeps the first inline URL base when a scanned subtree moves to another Window", () => {
    // Given: parsed inline URL styles that one Window's insertion already scanned while detached.
    const first = new JSDOM('<base href="https://a.test/first/">', { url: "https://a.test/" });
    const second = new JSDOM('<base href="https://b.test/first/">', { url: "https://b.test/" });
    const wrapper = first.window.document.createElement("div");
    wrapper.innerHTML = '<p style="background-image: url(image.png)">x</p>';
    const styled = wrapper.firstElementChild;
    if (!styled) throw new Error("The markup must produce an element");
    const { root } = bottomUp(first.window.document, wrapper);
    first.window.document.createElement("section").appendChild(root);
    // When: the subtree joins the second document and both bases change.
    second.window.document.documentElement?.appendChild(root);
    second.window.document.querySelector("base")?.setAttribute("href", "https://b.test/second/");
    first.window.document.querySelector("base")?.setAttribute("href", "https://a.test/second/");
    // Then: the declaration keeps the base captured at its first insertion, as in jsdom.
    expect(second.window.getComputedStyle(styled).getPropertyValue("background-image")).toBe(
      'url("https://a.test/first/image.png")',
    );
    first.window.close();
    second.window.close();
  });

  it("rejects inserting a childless shadow host or template into its own contents", () => {
    // Given: a childless shadow host and a childless template, each with deep content of its own.
    const { window, document } = page();
    const host = document.createElement("div");
    const shadowLeaf = topDown(
      host.attachShadow({ mode: "open" }).appendChild(document.createElement("p")),
    );
    const template = narrow(document.createElement("template"), window.HTMLTemplateElement);
    const contentLeaf = topDown(template.content.appendChild(document.createElement("p")));
    // When/Then: each is inserted below its own content and the cycle is rejected.
    expect(() => shadowLeaf.appendChild(host)).toThrow(
      "Cannot insert an ancestor into its descendant",
    );
    expect(() => contentLeaf.appendChild(template)).toThrow(
      "Cannot insert an ancestor into its descendant",
    );
    window.close();
  });
});
