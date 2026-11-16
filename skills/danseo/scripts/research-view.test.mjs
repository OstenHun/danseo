import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidate, renderCandidate } from './render-research-view.mjs';
// Minimal DOM host for exercising the shipped browser script's observable contracts.
// Layout, native fragment scrolling and CSP still require the real browser checks.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function openView(data, initialHash, { script, elementIds, navigation, prefix, title }) {
  const elements = new Map(), handlers = new Map();
  let hash = initialHash;
  const location = {
    get hash() { return hash; },
    set hash(value) {
      if (value === hash) return;
      hash = value;
      handlers.get('hashchange')?.();
    }
  };
  const document = { activeElement: null, getElementById: id => elements.get(id) };
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = new Map(); this.events = new Map(); this.disabled = false; }
    set id(value) { this._id = value; elements.set(value, this); }
    get id() { return this._id; }
    set textContent(value) { this.children = [String(value)]; }
    get textContent() { return this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(name, handler) { this.events.set(name, handler); }
    focus() { document.activeElement = this; }
    click() {
      if (this.disabled) return;
      let prevented = false;
      this.events.get('click')?.({ preventDefault() { prevented = true; } });
      if (!prevented && this.href?.startsWith('#')) location.hash = this.href;
    }
  }
  document.createElement = tag => new Element(tag);
  for (const id of elementIds) {
    const element = new Element(['previous', 'next'].includes(id) ? 'button' : id === 'skip' ? 'a' : 'div'); element.id = id;
  }
  elements.get('candidate').textContent = JSON.stringify(data);
  elements.get('skip').href = '#' + title;
  runInNewContext(readFileSync(script, 'utf8'), {
    document, location, window: { addEventListener(name, handler) { handlers.set(name, handler); } }
  });
  return { elements, location, get activeElement() { return document.activeElement; }, select(id) { elements.get(navigation).children.find(item => item.children[0].href === prefix + encodeURIComponent(id)).children[0].click(); } };
}

const elementIds = ['candidate','skip','items','count','position','item-title','metadata','content','previous','next','current-count','announcement','map-heading','map-notice','map-legend','map-status','scene-controls','map-links','provenance','research-map','map-node-navigation','node-kind','fit-map','zoom-in','zoom-out'];
const fixture = (mode, version = 1) => JSON.parse(readFileSync(new URL('../assets/' + mode + (version === 2 ? '.v2' : '') + '.example.json', import.meta.url), 'utf8'));
const openPaper = (data, id) => openView(data, '#paper=' + id, {script:new URL('../assets/research-view.js',import.meta.url),elementIds,navigation:'items',prefix:data.mode==='project-application'?'#application=':'#paper=',title:'item-title'}).elements.get('content');
for (const mode of ['paper-relations', 'project-application']) for (const version of [1, 2]) {
  test(`${mode} v${version}: paper opens exact registered URLs and retains all locations before collapsed evidence`, () => {
    const data = fixture(mode, version), paper = data.papers[0];
    const source = data.sources.find(item => item.id === paper.claims[0].evidence[0]);
    source.url = 'https://example.org/paper.pdf?edition=2#original';
    const second = {...source, id: source.id + '.second', locator:'Section 4 · Table 2'};
    data.sources.push(second);
    paper.claims[0].evidence.push(second.id);
    const additional = {...source,id:source.id+'.other',url:'https://example.org/other.pdf',locator:'Appendix A'};
    data.sources.push(additional);paper.claims[0].evidence.push(additional.id);
    validateCandidate(data);renderCandidate(data);
    const reading = openPaper(data, paper.id).children[0];
    assert.equal(reading.className,'research-section paper-source-links');
    const links = reading.children.filter(child=>child.tagName==='A');
    assert.deepEqual(links.map(link=>link.href),[source.url,additional.url]);
    assert.ok(reading.textContent.includes(source.locator));assert.ok(reading.textContent.includes(second.locator));
    assert.ok(reading.textContent.includes(additional.locator));
    for (const link of links) {assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');assert.match(link.attributes.get('aria-label'),/new tab/);}
  });
  test(`${mode} v${version}: missing URLs and unreferenced sources never invent a paper shortcut`, () => {
    const data = fixture(mode, version), paper=data.papers[0];
    data.sources.forEach(source=>{source.url=null;});
    data.sources.push({id:'unused',title:'Unreferenced source',url:'https://example.org/unused',locator:'Section 1',scope:'Synthetic fixture',verification:'not-checked'});
    validateCandidate(data);
    assert.ok(!openPaper(data,paper.id).textContent.includes('Read the paper'));
    const isolated=data.papers.find(item=>item.claims.length===0);assert.ok(isolated);
    assert.ok(!openPaper(data,isolated.id).textContent.includes('Read the paper'));
  });
}
test('paper shortcuts preserve URL and dangling-evidence validation', () => {
  for (const url of ['javascript:alert(1)','file:///secret','https://user:password@example.org']) {
    const data=fixture('paper-relations');data.sources[0].url=url;assert.throws(()=>validateCandidate(data));
  }
  const data=fixture('paper-relations');data.papers[0].claims[0].evidence=['missing'];assert.throws(()=>validateCandidate(data));
});
