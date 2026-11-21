// Exercises parser reentry in isolated processes so a cyclic tree cannot stall the test runner.
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const entry = new URL("../dist/jsdom.js", import.meta.url).href;

function parseAndAssert(markup: string, assertions: string): void {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
    import assert from 'node:assert/strict';
    import { JSDOM } from ${JSON.stringify(entry)};
    const dom = new JSDOM(${JSON.stringify(markup)}, { runScripts: 'dangerously' });
    const w = dom.window, d = w.document;
    ${assertions}
    dom.window.close();
  `,
    ],
    { encoding: "utf8", timeout: 5000 },
  );
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
}

describe("JSDOM parser reentry", () => {
  for (const [name, formatting, relocation] of [
    ["ordinary ancestors", "", "fb.appendChild(ca)"],
    ["formatting reconstruction", "<i>", "fb.appendChild(ca)"],
    [
      "shadow hosts",
      "",
      "var host=document.createElement('span');fb.appendChild(host);host.attachShadow({mode:'open'}).appendChild(ca)",
    ],
    [
      "template hosts",
      "",
      "var host=document.createElement('template');fb.appendChild(host);host.content.appendChild(ca)",
    ],
  ]) {
    it(`drops adoption-agency insertions that would cycle through ${name}`, () => {
      // Given: script relocates the parser's common ancestor under its furthest block.
      const markup = `<div id=ca><b>${formatting}<p id=fb><script>window.fb=document.getElementById('fb');window.ca=document.getElementById('ca');document.body.appendChild(fb);${relocation}</script></b></div>`;
      // When: the parser resumes adoption-agency reconstruction.
      // Then: the invalid insertion is dropped and both subtrees remain disconnected.
      parseAndAssert(
        markup,
        `assert.equal(d.body.innerHTML, '');${formatting ? "" : "assert.equal(w.fb.parentNode,null);"}assert.equal(w.fb.isConnected,false);assert.equal(w.ca.isConnected,false);assert.equal(w.ca.contains(w.fb),false);`,
      );
    });
  }

  it("preserves the parent chosen by an attribute reaction before parser insertion", () => {
    // Given: the token's attribute reaction moves its element to head.
    const markup = `<script>customElements.define('x-a',class extends HTMLElement {static observedAttributes=['x'];attributeChangedCallback(){window.el=this;document.head.appendChild(this)}})</script><body><x-a x=1><p>y</p></x-a>`;
    // When: parsing proceeds into the element's children.
    // Then: the element stays in head with the following content.
    parseAndAssert(
      markup,
      `assert.equal(w.el.parentNode,d.head);assert.equal(d.body.innerHTML,'');assert.equal(w.el.innerHTML,'<p>y</p>');`,
    );
  });

  for (const kind of ["shadow", "template"]) {
    it(`drops a parser insertion when construction moves its parent into a ${kind} root`, () => {
      // Given: construction makes the element a host-including ancestor of body.
      const relocation =
        kind === "shadow"
          ? "root.appendChild(window.b)"
          : "var t=document.createElement('template');root.appendChild(t);t.content.appendChild(window.b)";
      const markup = `<script>customElements.define('x-a',class extends HTMLElement {constructor(){super();window.el=this;window.b=document.body;var root=this.attachShadow({mode:'open'});${relocation}}})</script><body><x-a><p>x</p></x-a>`;
      // When: the parser attempts insertion into its remembered body.
      // Then: the dropped element still receives subsequent parser content.
      parseAndAssert(
        markup,
        `assert.equal(d.body,null);assert.equal(w.el.parentNode,null);assert.equal(w.b.innerHTML,'');assert.equal(w.el.innerHTML,'<p>x</p>');`,
      );
    });
  }
  it("redirects foster-parented elements and text into template contents", () => {
    // Given: script moves the on-stack table under an ordinary template element.
    const markup = `<table><tr><script>window.tmpl=document.createElement('template');document.body.appendChild(tmpl);tmpl.appendChild(document.querySelector('table'))</script><b id=fostered>x</b>FOSTERTEXT`;
    // When: the parser foster-parents the following element and text.
    // Then: the existing table stays in place and only new content enters the contents.
    parseAndAssert(
      markup,
      `assert.equal(w.tmpl.querySelector('table').parentNode,w.tmpl);assert.equal(w.tmpl.querySelector('#fostered'),null);assert.equal(w.tmpl.content.firstChild.localName,'b');assert.equal(w.tmpl.content.textContent,'xFOSTERTEXT');`,
    );
  });

  it("constructs before token attributes, connection, and children become observable", () => {
    // Given: a defined custom element records each parser lifecycle boundary.
    const markup = `<script>window.steps=[];customElements.define('x-a',class extends HTMLElement {static observedAttributes=['x'];constructor(){super();steps.push(['construct',this.hasAttributes(),this.isConnected,this.childNodes.length])}attributeChangedCallback(){steps.push(['attribute',this.getAttribute('x'),this.isConnected,this.childNodes.length])}connectedCallback(){steps.push(['connect',this.getAttribute('x'),this.isConnected,this.childNodes.length])}})</script><body><x-a x=1><p>y</p></x-a>`;
    // When: the parser creates and inserts its token.
    // Then: construction, attribute reaction, and connection precede the child token.
    parseAndAssert(
      markup,
      `assert.equal(JSON.stringify(w.steps),JSON.stringify([['construct',false,false,0],['attribute','1',false,0],['connect','1',true,0]]));assert.equal(d.querySelector('x-a').innerHTML,'<p>y</p>');`,
    );
  });

  it("leaves custom elements in parsed template contents inert", () => {
    // Given: the registry already defines an element encountered inside a template.
    const markup = `<script>window.constructed=0;customElements.define('x-a',class extends HTMLElement {constructor(){super();constructed++}})</script><body><template><x-a x=1>y</x-a></template>`;
    // When: the live parser processes the inert contents.
    // Then: no constructor executes and token content remains available for later adoption.
    parseAndAssert(
      markup,
      `assert.equal(w.constructed,0);assert.equal(d.querySelector('template').content.firstChild.outerHTML,'<x-a x="1">y</x-a>');`,
    );
  });
  it("initializes parsed custom form callbacks for ancestor and later explicit form owners", () => {
    // Given: custom controls construct synchronously before their parser insertion.
    const markup = `<script>customElements.define('x-face',class extends HTMLElement {static formAssociated=true;constructor(){super();this.internals=this.attachInternals();this.owners=[];this.disabled=[]}formAssociatedCallback(form){this.owners.push(form?.id??null)}formDisabledCallback(value){this.disabled.push(value)}})</script><body><fieldset disabled><form id=first><x-face id=a></x-face></form></fieldset><x-face id=b form=second></x-face><form id=second></form>`;
    // When: the parser inserts a control and later inserts its explicit form target.
    // Then: association and inherited disabled callbacks observe both transitions once.
    parseAndAssert(
      markup,
      `const a=d.querySelector('#a'),b=d.querySelector('#b');assert.equal(JSON.stringify(a.owners),'["first"]');assert.equal(JSON.stringify(a.disabled),'[true]');assert.equal(JSON.stringify(b.owners),'["second"]');assert.equal(a.internals.form.id,'first');assert.equal(b.internals.form.id,'second');`,
    );
  });
  it("associates an adopted custom control when its foreign document parses a later form", () => {
    // Given: a form-associated control comes from a different Window's registry.
    // When: another live parser adopts it before encountering its explicit form target.
    // Then: document-scoped lifecycle bookkeeping includes the foreign control.
    parseAndAssert(
      "",
      `w.eval(\`customElements.define('x-face',class extends HTMLElement {static formAssociated=true;constructor(){super();this.internals=this.attachInternals();this.owners=[]}formAssociatedCallback(form){this.owners.push(form?.id??null)}})\`);const foreign=d.createElement('x-face');foreign.setAttribute('form','later');const other=new JSDOM('<body><script>document.body.appendChild(foreign)</script><form id=later></form>',{runScripts:'dangerously',beforeParse(window){Object.assign(window,{foreign})}});assert.equal(foreign.internals.form,other.window.document.querySelector('form'));assert.equal(JSON.stringify(foreign.owners),'["later"]');other.window.close();`,
    );
  });
});
