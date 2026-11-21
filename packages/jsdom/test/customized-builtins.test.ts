// Exercises built-in custom-element construction without resetting native wrapper state on upgrades.
import { JSDOM } from "@run-dom/jsdom";
import { describe, expect, it } from "vitest";

const families = [
  ["a", "HTMLAnchorElement", "relList"],
  ["main", "HTMLElement", "classList"],
  ["input", "HTMLInputElement", "value"],
  ["canvas", "HTMLCanvasElement", "width"],
  ["area", "HTMLAreaElement", "relList"],
  ["link", "HTMLLinkElement", "sizes"],
  ["output", "HTMLOutputElement", "htmlFor"],
  ["tr", "HTMLTableRowElement", "cells"],
  ["tbody", "HTMLTableSectionElement", "rows"],
  ["table", "HTMLTableElement", "tBodies"],
  ["dialog", "HTMLDialogElement", "returnValue"],
  ["audio", "HTMLAudioElement", "volume"],
  ["video", "HTMLVideoElement", "volume"],
] as const;

describe("Customized built-in construction", () => {
  for (const [tag, interfaceName, property] of families) {
    for (const mode of ["new", "createElement", "upgrade", "clone"] as const) {
      it(`constructs ${tag} through ${mode} while retaining its native interface state`, () => {
        // Given: native interfaces carry cached objects or mutable state before an existing-node upgrade.
        const dom = new JSDOM("", { runScripts: "outside-only" });
        try {
          // When: a registered subclass constructs, upgrades, or clones the built-in.
          const result = dom.window.eval(`(() => {
            const tag=${JSON.stringify(tag)}, property=${JSON.stringify(property)}, mode=${JSON.stringify(mode)};
            const Base=${interfaceName};
            let before, existing;
            if (mode==='upgrade') {
              existing=document.createElement(tag,{is:'x-native'});
              if (property==='volume') existing[property]=0.4;
              if (property==='returnValue') existing[property]='before';
              before=existing[property];
              document.body.appendChild(existing);
            }
            class Custom extends Base { constructor() { super(); this.constructed=true; } }
            customElements.define('x-native',Custom,{extends:tag});
            let node;
            if(mode==='new')node=new Custom();
            else if(mode==='upgrade')node=existing;
            else node=document.createElement(tag,{is:'x-native'});
            if(mode==='clone')node=node.cloneNode(true);
            const state=node[property];
            return [node instanceof Custom,node instanceof Base,node.constructed===true,
              node.localName,node.ownerDocument===document,
              mode!=='upgrade'||state===before,
              typeof state!=='object'||state===node[property]];
          })()`);
          // Then: the wrapper stays valid, preserves its identity/state, and keeps stable cached views.
          expect(result).toEqual([true, true, true, tag, true, true, true]);
        } finally {
          dom.window.close();
        }
      });
    }
  }
  it("uses the destination registry for imports and clones of adopted elements", () => {
    // Given: two Windows define different constructors for the same customized built-in name.
    const first = new JSDOM("", { runScripts: "outside-only" }),
      second = new JSDOM("", { runScripts: "outside-only" });
    try {
      first.window.eval(
        `globalThis.First=class First extends HTMLAnchorElement {};customElements.define('x-cross',First,{extends:'a'});`,
      );
      second.window.eval(
        `globalThis.Second=class Second extends HTMLAnchorElement {};customElements.define('x-cross',Second,{extends:'a'});`,
      );
      const original = first.window.document.createElement("a", { is: "x-cross" });
      const imported = second.window.document.importNode(original, true);
      second.window.document.adoptNode(original);
      // When: import creates a new node and adoption preserves the original before cloning it.
      const cloned = original.cloneNode();
      const a = Reflect.get(first.window, "First"),
        b = Reflect.get(second.window, "Second");
      // Then: new nodes use the destination document registry and the adopted original retains identity.
      expect(original.constructor).toBe(a);
      expect(imported.constructor).toBe(b);
      expect(cloned.constructor).toBe(b);
      expect(cloned.ownerDocument).toBe(second.window.document);
    } finally {
      first.window.close();
      second.window.close();
    }
  });
  it("rejects a mismatched built-in interface before reading the custom prototype", () => {
    // Given: a constructor extending HTMLElement is registered as a button.
    const dom = new JSDOM("", { runScripts: "outside-only" });
    try {
      const result = dom.window.eval(`(() => {
        let reads=0;
        const Custom=new Proxy(class extends HTMLElement {}, {get(target,key,receiver){if(key==='prototype')reads++;return Reflect.get(target,key,receiver);}});
        customElements.define('x-wrong',Custom,{extends:'button'});reads=0;
        try {new Custom();return ['no exception',reads];}catch(error){return [error.name,reads];}
      })()`);
      // When/Then: interface validation throws before observable prototype access.
      expect(result).toEqual(["TypeError", 0]);
    } finally {
      dom.window.close();
    }
  });

  it("retains the custom prototype after a constructor throws after super", () => {
    // Given: an existing built-in is upgraded by a constructor that throws after obtaining this.
    const dom = new JSDOM("", { runScripts: "outside-only" });
    const errors: unknown[] = [];
    dom.virtualConsole.on("jsdomError", (error) => errors.push(error));
    try {
      const result = dom.window.eval(`(() => {
        const node=document.createElement('video',{is:'x-throw'});document.body.appendChild(node);
        class Custom extends HTMLVideoElement {constructor(){super();throw new Error('constructor failed');}}
        customElements.define('x-throw',Custom,{extends:'video'});
        return [node instanceof Custom,node instanceof HTMLVideoElement,node.localName];
      })()`);
      // When/Then: failed upgrade state does not undo the prototype already installed by super().
      expect(result).toEqual([true, true, "video"]);
      expect(errors).toHaveLength(1);
    } finally {
      dom.window.close();
    }
  });
  for (const mode of ["cloneContents", "extractContents"] as const) {
    it(`invokes custom constructors in tree order for Range.${mode}`, () => {
      // Given: range boundaries partially select ancestors and fully select a sibling.
      const dom = new JSDOM("", { runScripts: "outside-only" });
      try {
        const result = dom.window.eval(`(() => {
          let logs=[];
          class Custom extends HTMLElement {constructor(){super();logs.push(this.id);}}
          customElements.define('x-range',Custom);
          document.body.innerHTML='<x-range><x-range id="outer"><x-range id="inner"><span id="start"></span></x-range></x-range><x-range id="sibling"></x-range><span id="end"></span></x-range>';
          logs=[];const range=document.createRange();range.setStart(document.getElementById('start'),0);range.setEnd(document.getElementById('end'),0);
          const fragment=range.${mode}();
          return [logs,fragment.querySelector('#outer') instanceof Custom,fragment.querySelector('#inner') instanceof Custom];
        })()`);
        // When/Then: copied branches construct before their descendants; extracted full nodes move unchanged.
        expect(result).toEqual([
          mode === "cloneContents" ? ["outer", "inner", "sibling"] : ["outer", "inner"],
          true,
          true,
        ]);
      } finally {
        dom.window.close();
      }
    });
  }
});
