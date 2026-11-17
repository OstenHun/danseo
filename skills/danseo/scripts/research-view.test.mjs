import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidate, renderCandidate } from './render-research-view.mjs';
import { performancePlan, performanceFields } from './performance-evidence.mjs';
import { overviewFor, verifyEvidence } from './research-evidence.mjs';
import { languageScript } from './view-language.mjs';
// Minimal DOM host for exercising the shipped browser script's observable contracts.
// Layout, native fragment scrolling and CSP still require the real browser checks.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function openView(data, initialHash, { script, elementIds, navigation, prefix, title, mapApi }) {
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
  runInNewContext(languageScript(data.language) + readFileSync(script, 'utf8'), {
    document, location, window: { DanseoMap: mapApi, addEventListener(name, handler) { handlers.set(name, handler); } }
  });
  return { elements, location, get activeElement() { return document.activeElement; }, select(id) { elements.get(navigation).children.find(item => item.children[0].href === prefix + encodeURIComponent(id)).children[0].click(); } };
}

const elementIds = ['candidate','skip','items','count','position','item-title','metadata','content','previous','next','current-count','announcement','map-heading','map-notice','map-legend','map-status','scene-controls','map-links','provenance','research-map','map-node-navigation','node-kind','fit-map','zoom-in','zoom-out'];
const fixture = (mode, version = 1) => JSON.parse(readFileSync(new URL('../assets/' + mode + (version === 2 ? '.v2' : '') + '.example.json', import.meta.url), 'utf8'));
const openPaper = (data, id) => openView(data, '#paper=' + id, {script:new URL('../assets/research-view.js',import.meta.url),elementIds,navigation:'items',prefix:data.mode==='project-application'?'#application=':'#paper=',title:'item-title'}).elements.get('content');

test('paper details show distinct sourced publication and edition dates without a publication-like draft badge', () => {
  for (const language of ['en', 'ko']) {
    const data = fixture('paper-relations', 2); data.language = language;
    data.papers[0].publication = { date: '2017-06-12', edition_date: '2023-08-02', source_id: data.sources[0].id };
    const view = openView(data, '#paper=' + data.papers[0].id, {script:new URL('../assets/research-view.js',import.meta.url),elementIds,navigation:'items',prefix:'#paper=',title:'item-title'});
    const metadata = view.elements.get('metadata').textContent;
    assert.match(metadata, /2017-06-12/); assert.match(metadata, /2023-08-02/);
    assert.doesNotMatch(metadata, /draft|review in progress|검토 중/);
    assert.ok(metadata.includes(language === 'ko' ? '최초 공개' : 'First published'));
  }
});

test('Korean completed coverage and a single authorship notice are rendered as visible UI text', () => {
  const data = fixture('paper-relations', 2); data.language = 'ko';
  const html = renderCandidate(data, { complete: true, completionScope: 'Only <selected> source passages, not full papers.' });
  assert.match(html, /<p class="description source-coverage">수록한 주장과 원문 관계의 대조 완료 기록이 있습니다\.<\/p>/);
  assert.match(html, /Only &lt;selected&gt; source passages, not full papers\./);
  assert.equal((html.match(/class="description authorship"/g) ?? []).length, 1);
  const view = openView(data, '#paper=' + data.papers[0].id, {script:new URL('../assets/research-view.js',import.meta.url),elementIds,navigation:'items',prefix:'#paper=',title:'item-title'});
  assert.doesNotMatch(view.elements.get('content').textContent, /AI가 기록한|AI 해설|AI 제안/);
});

test('stale Paper warnings survive draft-badge removal in legacy project and evidence-reference paths', () => {
  const data = fixture('project-application', 1);
  const paper = data.papers[0]; paper.review_status = 'needs-recheck';
  const open = hash => openView(data, hash, {script:new URL('../assets/research-view.js',import.meta.url),elementIds,navigation:'items',prefix:'#application=',title:'item-title'});
  for (const hash of ['#paper=' + paper.id, '#application=' + data.start, '#reference=' + data.start + ':' + paper.id]) {
    const view = open(hash);
    assert.match(view.elements.get('metadata').textContent + view.elements.get('content').textContent, /Evidence needs rechecking/);
  }
});

test('local-only publication evidence retains its title, locator and scope without inventing a file URL', () => {
  const data = fixture('paper-relations', 2);
  const paper = data.papers[0];
  data.sources.push({ id:'S.local-dates',title:'Local edition cover',url:null,locator:'Cover, PDF p.1',scope:'Checked cover date only.',verification:'agent-checked' });
  paper.publication = {date:'2017',edition_date:null,source_id:'S.local-dates'};
  paper.short_title = 'Synthetic conference label · 2019';
  const view = openView(data, '#paper=' + paper.id, {script:new URL('../assets/research-view.js',import.meta.url),elementIds,navigation:'items',prefix:'#paper=',title:'item-title'});
  const metadata = view.elements.get('metadata').textContent;
  assert.match(metadata,/First published · 2017/);
  assert.match(metadata,/Local edition cover/); assert.match(metadata,/Cover, PDF p.1/); assert.match(metadata,/Checked cover date only/);
  assert.doesNotMatch(metadata,/2019|file:/);
});
test('v2 authoring errors remain failures until required provenance and notes shapes are repaired', () => {
  const data = fixture('paper-relations', 2), provenance = data.provenance;
  delete data.provenance;
  assert.throws(() => validateCandidate(data), /missing provenance/);
  data.provenance = provenance;
  data.papers[0].notes = 'A paragraph is not an array.';
  assert.throws(() => validateCandidate(data), /paper.notes: expected array/);
  data.papers[0].notes = [data.papers[0].notes];
  validateCandidate(data);
});

test('relation reading separates AI references, absent evidence and source records in both languages', () => {
  for (const language of ['en', 'ko']) for (const origin of ['ai', 'source']) for (const linked of [true, false]) {
    const data = fixture('paper-relations', 2); data.language = language;
    const relation = data.relations[0];
    relation.origin = origin; relation.status = 'proposed'; relation.review = null;
    if (!linked) relation.evidence_refs = [];
    const saved = JSON.stringify(data);
    const view = openView(data, '#relation=' + relation.id, {script:new URL('../assets/research-view.js',import.meta.url),elementIds,navigation:'items',prefix:'#paper=',title:'item-title'});
    const content = view.elements.get('content'), evidence = content.children[2];
    assert.equal(evidence.children[0].textContent, language === 'ko' ? '원문 근거' : 'Source evidence');
    const aiReference = language === 'ko' ? '이 주장을 바탕으로 추천한 연결' : 'These claims inform a reading suggestion';
    assert.equal(evidence.textContent.includes(aiReference), origin === 'ai' && linked);
    if (!linked) {
      assert.equal(evidence.children.length, 2);
      assert.ok(evidence.textContent.includes(language === 'ko' ? '원문에서 확인된 관계로 사용하지 마세요.' : 'Do not use'));
      assert.equal(evidence.children[1].textContent.includes(language === 'ko' ? '추천' : 'suggestion'), origin === 'ai');
    }
    assert.match(view.elements.get('position').textContent, /01 · /);
    const history = content.children.at(-1);
    assert.equal(history.tagName, 'DETAILS'); assert.equal(history.children[0].tagName, 'SUMMARY');
    assert.ok(history.textContent.includes(relation.created_by));
    assert.equal(JSON.stringify(data), saved);
  }
});
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

const backgroundFixture = () => {
  const data = fixture('paper-relations', 2);
  data.sources.find(source => source.id === data.papers[1].claims[0].evidence[0]).url = 'https://example.org/background';
  data.concepts = [{ id: data.papers[0].id, title: 'Shared representation', summary: 'An AI explanation of a concept, not a paper or an origin claim.' }];
  data.backgrounds = [{ id: 'B.Explore', paper_id: data.papers[0].id, concept_id: data.concepts[0].id,
    origin: 'ai', status: 'proposed', rationale: 'Explore this concept only if it helps with the current question.',
    readings: [{ paper_id: data.papers[1].id, rationale: 'Selected for its focused explanation, not as the first invention.',
      evidence: [...data.papers[1].claims[0].evidence], return_question: 'What does the current paper change about this shared idea?' }] }];
  return data;
};
const openBackground = (data, hash = '#paper=' + data.start, mapApi) => openView(data, hash, {
  script: new URL('../assets/research-view.js', import.meta.url), elementIds, navigation: 'items', prefix: '#paper=', title: 'item-title', mapApi,
});

for (const version of [1, 2]) for (const language of ['en', 'ko']) {
  test(`bare paper maps select start without stealing focus; explicit routes remain intact (v${version}, ${language})`, () => {
    const data = fixture('paper-relations', version);
    data.language = language;
    data.start = data.papers[1].id;
    const initial = openBackground(data, '');
    assert.equal(initial.elements.get('item-title').textContent, data.papers[1].title);
    assert.notEqual(initial.activeElement, initial.elements.get('item-title'));
    const overview = openBackground(data, '#overview=all');
    assert.notEqual(overview.elements.get('item-title').textContent, data.papers[1].title);
    const linked = openBackground(data, '#paper=' + encodeURIComponent(data.papers[0].id));
    assert.equal(linked.elements.get('item-title').textContent, data.papers[0].title);
    const invalid = openBackground(data, '#paper=unknown');
    assert.equal(invalid.elements.get('item-title').textContent, overview.elements.get('item-title').textContent);
  });
}
const linksIn = element => element.children.filter(child => typeof child !== 'string').flatMap(child => [
  ...(child.tagName === 'A' ? [child] : []), ...linksIn(child),
]);

test('relation list and details use the same source, suggestion and stale labels in both languages', () => {
  for (const language of ['en', 'ko']) for (const [origin, status, stale, english, korean] of [
    ['ai', 'proposed', false, 'Suggested connection', '추천 연결'],
    ['source', 'proposed', false, 'Source relation not checked', '원문 관계 미확인'],
    ['source', 'source-checked', false, 'Source-checked relation', '원문 확인 관계'],
    ['source', 'source-checked', true, 'Source relation not checked', '원문 관계 미확인'],
  ]) {
    const data = backgroundFixture();
    data.language = language;
    const relation = data.relations[0];
    Object.assign(relation, { origin, status, needs_recheck: stale });
    const view = openBackground(data, '#relation=' + relation.id);
    const label = language === 'ko' ? korean : english;
    const link = linksIn(view.elements.get('map-links')).find(link => link.href === '#relation=' + relation.id);
    assert.ok(link.textContent.includes(label));
    assert.equal(view.elements.get('metadata').children[0].textContent, label);
    assert.equal(view.elements.get('metadata').children[0].className, stale ? 'badge warning' : 'badge');
  }
});

test('concept background references are explicit, local to a paper and always AI proposals', () => {
  validateCandidate(backgroundFixture());
  const invalid = [
    data => { delete data.concepts; }, data => { data.version = 1; },
    data => { data.concepts.push(data.concepts[0]); },
    data => { data.backgrounds[0].concept_id = 'missing'; },
    data => { data.backgrounds[0].paper_id = 'missing'; },
    data => { data.backgrounds.push({ ...data.backgrounds[0], id: 'B.Other' }); },
    data => { data.backgrounds[0].origin = 'source'; },
    data => { data.backgrounds[0].status = 'source-checked'; },
    data => { data.backgrounds[0].required = true; },
    data => { data.backgrounds[0].readings = []; },
    data => { data.backgrounds[0].readings.push(data.backgrounds[0].readings[0]); },
    data => { data.backgrounds[0].readings[0].paper_id = data.papers[0].id; },
    data => { data.backgrounds[0].readings[0].evidence = ['missing']; },
    data => { data.backgrounds[0].readings[0].evidence = data.papers[0].claims[0].evidence; },
  ];
  for (const change of invalid) { const data = backgroundFixture(); change(data); assert.throws(() => validateCandidate(data)); }
});

test('the distributed background example validates and renders with separate concepts', () => {
  const data = JSON.parse(readFileSync(new URL('../assets/paper-backgrounds.v2.example.json', import.meta.url), 'utf8'));
  validateCandidate(data);
  assert.ok(renderCandidate(data).includes('backgrounds'));
  const view = openBackground(data, '#background=' + data.backgrounds[0].id);
  assert.equal(view.elements.get('item-title').textContent, data.concepts[0].title);
  assert.ok(view.elements.get('content').textContent.includes(data.backgrounds[0].readings[0].rationale));
});

test('Korean UI follows the declared language without translating research or source data', () => {
  const data = backgroundFixture(); data.language = 'ko';
  data.papers[0].title = 'Read the paper';
  data.papers[0].notes = ['Cites'];
  data.sources[0].title = 'Open original source ↗';
  const saved = JSON.stringify(data); validateCandidate(data);
  const html = renderCandidate(data);
  assert.match(html, /<html lang="ko">/);
  assert.ok(html.includes('본문으로 건너뛰기'));
  assert.ok(html.includes('aria-label="확대"'));
  assert.ok(html.includes('이전 기록'));
  const view = openBackground(data, '#paper=' + data.start), content = view.elements.get('content');
  assert.equal(view.elements.get('item-title').textContent, 'Read the paper');
  assert.ok(content.textContent.includes('Cites'));
  assert.ok(content.textContent.includes('논문 원문'));
  assert.ok(linksIn(content).some(link => link.textContent === '배경 펼치기 · ' + data.concepts[0].title));
  linksIn(content).find(link => link.href === '#background=B.Explore').click();
  assert.equal(view.elements.get('map-heading').textContent, '개념 배경 · ' + data.concepts[0].title);
  assert.ok(view.elements.get('map-notice').textContent.includes('원문의 인용 관계나 필수 선수 조건을 뜻하지 않습니다.'));
  const source = linksIn(content).find(link => link.href === 'https://example.org/background');
  assert.equal(source.textContent, '원문 열기 ↗');
  assert.ok(source.attributes.get('aria-label').endsWith(' · 원문 열기 · 새 탭'));
  assert.ok(content.textContent.includes(data.backgrounds[0].readings[0].return_question));
  linksIn(content).find(link => link.href.startsWith('#background-paper=')).click();
  assert.ok(content.textContent.includes('돌아와 비교하기'));
  linksIn(content).find(link => link.href === '#paper=' + data.start).click();
  assert.equal(view.elements.get('map-heading').textContent, '논문 사이의 연결');
  assert.equal(JSON.stringify(data), saved);
});

test('Korean overview is gated; unsupported language fails and English remains the default', () => {
  const data = backgroundFixture();
  assert.match(renderCandidate(data), /<html lang="en">/);
  const oldOverview = overviewFor(data);
  data.language = 'en'; assert.deepEqual(overviewFor(data), oldOverview);
  data.language = 'ko'; Object.assign(data, overviewFor(data));
  assert.match(data.description, /^논문 /);
  assert.match(data.scope, /이해 완료를 뜻하지 않습니다/);
  const performance = performancePlan(data).map(entry => ({ ...entry, kind: 'non-performance', reason: 'Synthetic language regression.' }));
  const evidence = {version:2,sources:[],counts:[],tables:[],performance};
  verifyEvidence(data,evidence,'.');
  assert.throws(() => verifyEvidence({...data,...oldOverview},evidence,'.'), /canonical/);
  for (const language of ['fr', '', null, 'ko"><script>']) assert.throws(() => validateCandidate({...data,language}), /candidate.language/);
});

test('project research UI and message placeholders preserve supplied content in Korean', () => {
  for (const version of [1,2]) {
    const data = fixture('project-application', version); data.language = 'ko';
    const html = renderCandidate(data), content = openPaper(data, data.papers[0].id);
    assert.ok(html.includes('프로젝트 적용'));
    assert.ok(content.textContent.includes('논문 원문'));
    assert.ok(content.textContent.includes(data.papers[0].claims[0].statement));
  }
  const scope = {window:{}}; runInNewContext(languageScript('ko'),scope);
  assert.equal(scope.window.DanseoText('{title} selected',{title:'Read the paper {title} <b>'}), 'Read the paper {title} <b> 선택됨');
  assert.equal(scope.window.DanseoText('{count} items',{count:0}), '0개 항목');
  assert.equal(scope.window.DanseoText('Unknown phrase'), 'Unknown phrase');
});

test('optional background navigation returns to the original paper without resetting its background camera', () => {
  const data = backgroundFixture(); validateCandidate(data);
  let mounts = 0, restored;
  const savedPaperState = { filters: { category: 'source', kind: 'cites', mode: 'all' }, zoom: .8, pan: {x:10,y:20}, positions: {} };
  const mapApi = { mount(_host, _data, scene, _select, _filter, _background, paperState) {
    mounts++; if (scene === 'papers') restored = paperState;
    return { destroy() {}, select() {}, snapshot() { return savedPaperState; } };
  } };
  const view = openBackground(data, '#paper=' + data.start, mapApi), content = view.elements.get('content');
  assert.ok(content.textContent.includes('Concept background'));
  linksIn(content).find(link => link.href === '#background=B.Explore').click();
  assert.equal(view.elements.get('item-title').textContent, data.concepts[0].title);
  assert.ok(view.elements.get('map-notice').textContent.includes('not citations or required prerequisites'));
  assert.ok(content.textContent.includes(data.sources.find(source => source.id === data.backgrounds[0].readings[0].evidence[0]).locator));
  const originalSource = linksIn(content).find(link => link.href === 'https://example.org/background');
  assert.equal(originalSource.target, '_blank'); assert.equal(originalSource.rel, 'noopener noreferrer');
  assert.equal(view.activeElement.id, 'item-title');
  const backgroundMounts = mounts;
  linksIn(content).find(link => link.href.startsWith('#background-paper=')).click();
  assert.equal(mounts, backgroundMounts);
  assert.equal(view.elements.get('item-title').textContent, data.papers[1].title);
  assert.equal(content.children[0].className, 'research-section paper-source-links');
  assert.ok(content.textContent.includes(data.backgrounds[0].readings[0].return_question));
  assert.equal(view.elements.get('previous').disabled, true);
  linksIn(content).find(link => link.href === '#paper=' + data.start).click();
  assert.equal(view.elements.get('item-title').textContent, data.papers[0].title);
  assert.equal(view.elements.get('map-heading').textContent, 'Connections between papers');
  assert.equal(restored, savedPaperState);
  linksIn(content).find(link => link.href === '#background=B.Explore').click();
  view.location.hash = '#overview=all';
  assert.equal(view.elements.get('announcement').textContent, 'From relations to source evidence selected');
});

test('background deep links reopen only registered readings and preserve missing-location uncertainty', () => {
  const data = backgroundFixture(), background = data.backgrounds[0];
  background.readings[0].evidence = []; validateCandidate(data);
  const view = openBackground(data, '#background=' + background.id);
  assert.ok(view.elements.get('content').textContent.includes('No linked source location'));
  const resumed = openBackground(data, '#background-paper=' + encodeURIComponent(background.id + ':' + data.papers[1].id));
  assert.equal(resumed.elements.get('item-title').textContent, data.papers[1].title);
  assert.ok(resumed.elements.get('content').textContent.includes('Return to current paper'));
  const invalid = openBackground(data, '#background-paper=' + encodeURIComponent(background.id + ':' + data.papers[2].id));
  assert.equal(invalid.elements.get('item-title').textContent, 'From relations to source evidence');
});

test('background projection keeps concept and paper namespaces distinct and leaves citation/reading-order data unchanged', () => {
  const data = backgroundFixture(), scope = { window: {} };
  runInNewContext(readFileSync(new URL('../assets/research-map.js', import.meta.url), 'utf8'), scope);
  const original = JSON.stringify(data.relations);
  const elements = scope.window.DanseoMap.build(data, 'background', data.backgrounds[0].id);
  const nodes = elements.filter(item => item.group === 'nodes');
  assert.equal(nodes.length, 3); assert.equal(new Set(nodes.map(item => item.data.id)).size, 3);
  assert.ok(nodes.filter(item => item.data.type === 'paper').every(item => item.data.label.includes('Publication year unknown')));
  assert.equal(nodes.filter(item => item.data.type === 'concept').length, 1);
  assert.ok(elements.filter(item => item.group === 'edges').every(item => item.data.origin === 'ai' && item.data.state === 'proposed'));
  assert.equal(JSON.stringify(data.relations), original);
  const undatedPapers = scope.window.DanseoMap.build(data, 'papers').filter(item => item.group === 'nodes');
  assert.ok(undatedPapers.every(item => item.data.type === 'paper' && item.data.label.includes('Publication year unknown')));
  data.papers[0].publication = {date:'2017-06-12',edition_date:'2023-08-02',source_id:data.sources[0].id};
  const dated = scope.window.DanseoMap.build(data, 'background', data.backgrounds[0].id);
  assert.match(dated.find(item => item.data.recordId === data.papers[0].id).data.label, /2017/);
  assert.ok(dated.every(item => !/AI|draft|Paper review/.test(item.data.label)));
});

test('all new concept/background prose is screened without changing the old canonical overview', () => {
  const data = backgroundFixture(); validateCandidate(data); Object.assign(data, overviewFor(data));
  const entries = performancePlan(data).map(entry => ({ ...entry, kind: 'non-performance', reason: 'Synthetic non-performance description.' }));
  const evidence = { version: 2, sources: [], counts: [], tables: [], performance: entries };
  verifyEvidence(data, evidence, '.');
  const paths = ['/concepts/0/title', '/concepts/0/summary', '/backgrounds/0/rationale', '/backgrounds/0/readings/0/rationale', '/backgrounds/0/readings/0/return_question'];
  for (const path of paths) {
    assert.ok(performanceFields(data).has(path));
    assert.throws(() => verifyEvidence(data, { ...evidence, performance: entries.filter(entry => entry.path !== path) }, '.'), /missing performance screening/);
  }
  const previous = fixture('paper-relations', 2);
  assert.deepEqual(overviewFor(previous), overviewFor({ ...previous, concepts: [], backgrounds: [] }));
  assert.match(data.description, /Concept backgrounds: 1/);
});

test('new concept/background text cannot bypass source-bound record and pair counts', () => {
  for (const change of [
    data => { data.concepts[0].summary = '17 records'; },
    data => { data.backgrounds[0].rationale = '17 pairs'; },
    data => { data.backgrounds[0].readings[0].return_question = 'Compare 17 records'; },
  ]) {
    const data = backgroundFixture(); change(data); validateCandidate(data); Object.assign(data, overviewFor(data));
    const performance = performancePlan(data).map(entry => ({ ...entry, kind: 'non-performance', reason: 'Synthetic coverage alone does not validate counts.' }));
    assert.throws(() => verifyEvidence(data, { version: 2, sources: [], counts: [], tables: [], performance }, '.'), /record\/pair count statement needs source-bound evidence/);
  }
  const data = backgroundFixture(); Object.assign(data, overviewFor(data));
  const performance = performancePlan(data).map(entry => ({ ...entry, kind: 'non-performance', reason: 'Synthetic screening.' }));
  const binding = {path:'/backgrounds/0/readings/0/rationale',source_id:data.papers[0].claims[0].evidence[0],page:1,quote:'17 records',items:[{unit:'records',value:17}]};
  assert.throws(() => verifyEvidence(data, {version:2,sources:[],counts:[binding],tables:[],performance}, '.'), /source must be linked/);
});
