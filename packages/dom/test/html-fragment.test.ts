// Pins canonical fragment transfer and the complete custom-adapter fallback protocol.
import { expect, it } from "vitest";
import {
  defaultTreeAdapter as tree,
  html,
  parseFragment,
  serialize,
  type DefaultTreeAdapterTypes as Raw,
} from "parse5";
import { createOwnedElementAdapter, parseOwnedHTMLFragment } from "../src/html-fragment.js";

it.each([
  { tag: "div", ns: html.NS.HTML, markup: '<p data-v="é">one😀<b>two</b><!--end-->' },
  { tag: "tbody", ns: html.NS.HTML, markup: "<tr><td>one<td>two<tr><td>three" },
  { tag: "table", ns: html.NS.HTML, markup: "foster<b><tr><td>one</td></tr></b>" },
  { tag: "select", ns: html.NS.HTML, markup: "<optgroup><option>a<option>b</optgroup><input>" },
  { tag: "template", ns: html.NS.HTML, markup: "<template><p>nested</p></template><i>end" },
  {
    tag: "svg",
    ns: html.NS.SVG,
    markup: "<title>λ</title><foreignObject><p>html</p></foreignObject>",
  },
  {
    tag: "math",
    ns: html.NS.MATHML,
    markup: "<mi>x</mi><annotation-xml encoding='text/html'><p>html",
  },
  { tag: "div", ns: html.NS.HTML, markup: "<b><p>one</b>two</p>" },
])("preserves fragment semantics in $tag context", ({ tag, ns, markup }) => {
  // Given/When: the canonical parser and project handoff parse equivalent independent contexts.
  const actual = parseOwnedHTMLFragment({
    context: tree.createElement(tag, ns, []),
    markup,
    options: { scriptingEnabled: false },
  });
  const expected = parseFragment(tree.createElement(tag, ns, []), markup, {
    scriptingEnabled: false,
  });
  // Then: tokenization/recovery/namespaces/order stay equal and each ordinary edge has its current parent.
  expect(serialize(actual)).toBe(serialize(expected));
  const pending: Raw.ParentNode[] = [actual];
  while (pending.length) {
    const parent = pending.pop();
    if (!parent) break;
    for (const child of parent.childNodes) {
      expect(child.parentNode === parent).toBe(true);
      if ("childNodes" in child) pending.push(child);
    }
  }
});

it("retains custom adapter detach/append order and observable donor-array state", () => {
  function adapter() {
    const calls: string[] = [],
      donors: Raw.ChildNode[][] = [];
    return {
      calls,
      donors,
      tree: {
        ...tree,
        createElement(...args: Parameters<typeof tree.createElement>) {
          const node = tree.createElement(...args);
          if (args[0] === "html") donors.push(node.childNodes);
          return node;
        },
        detachNode(node: Raw.ChildNode) {
          calls.push("detach:" + node.nodeName);
          tree.detachNode(node);
        },
        appendChild(parent: Raw.ParentNode, node: Raw.ChildNode) {
          calls.push("append:" + parent.nodeName + ":" + node.nodeName);
          tree.appendChild(parent, node);
        },
      },
    };
  }
  // Given: custom adapters can observe both parser-time and final handoff mutations.
  const first = adapter(),
    second = adapter(),
    markup = "<b><p>one</b>two</p><i>end</i>";
  const actual = parseOwnedHTMLFragment({
    context: tree.createElement("div", html.NS.HTML, []),
    markup,
    options: { treeAdapter: first.tree, scriptingEnabled: false },
  });
  const expected = parseFragment(tree.createElement("div", html.NS.HTML, []), markup, {
    treeAdapter: second.tree,
    scriptingEnabled: false,
  });
  // Then: the optimized entry keeps the existing complete callback protocol for custom storage.
  expect(serialize(actual)).toBe(serialize(expected));
  expect(first.calls).toEqual(second.calls);
  expect(first.donors.map((nodes) => nodes.length)).toEqual(
    second.donors.map((nodes) => nodes.length),
  );
  expect(first.donors.every((nodes) => nodes.length === 0)).toBe(true);
});

it("transfers a 65,534-row table fragment with complete order and ownership", () => {
  // Given: the standard table-span scale exceeds argument-spread and ordinary small-list assumptions.
  const count = 65534,
    markup = "<tr><td>".repeat(count - 1) + '<tr id="last"><td>';
  const fragment = parseOwnedHTMLFragment({
    context: tree.createElement("tbody", html.NS.HTML, []),
    markup,
    options: { scriptingEnabled: false },
  });
  // Then: no row is skipped, duplicated or left attached to the private parser root.
  expect(fragment.childNodes.length).toBe(count);
  expect(fragment.childNodes.every((node) => node.parentNode === fragment)).toBe(true);
  const last = fragment.childNodes.at(-1);
  if (!last || !tree.isElementNode(last)) throw new Error("Expected final table row");
  expect(tree.getAttrList(last)).toEqual([{ name: "id", value: "last" }]);
}, 20000);

it("preserves project metadata callbacks while transferring canonical storage", () => {
  const actualTags: string[] = [],
    expectedTags: string[] = [];
  const actualAdapter = createOwnedElementAdapter({
    adapter: tree,
    onElement: (node) => actualTags.push(node.tagName),
  });
  const expectedAdapter = {
    ...tree,
    createElement(...args: Parameters<typeof tree.createElement>) {
      const node = tree.createElement(...args);
      expectedTags.push(node.tagName);
      return node;
    },
  };
  const markup =
    "<details open><summary>one</summary><p>two</p></details><template><b>three</b></template>";
  const actual = parseOwnedHTMLFragment({
    context: tree.createElement("div", html.NS.HTML, []),
    markup,
    options: { treeAdapter: actualAdapter, scriptingEnabled: false },
  });
  const expected = parseFragment(tree.createElement("div", html.NS.HTML, []), markup, {
    treeAdapter: expectedAdapter,
    scriptingEnabled: false,
  });
  expect(serialize(actual)).toBe(serialize(expected));
  expect(actualTags).toEqual(expectedTags);
});
