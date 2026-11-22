import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction, runInNewContext } from 'node:vm';
import cytoscape from 'cytoscape';

type Paper = {id?: string; title?: string; short_title?: string; topic?: string};
type Relation = {id: string; source: string; target: string; kind: string; origin: string; status: string; needs_recheck?: boolean};
type Filters = {category: string; kind: string; mode: string};
type Selection = {type: string; id: string} | null;
interface Presentation {
  card: {width: number; height: number};
  topicLayout(papers: Paper[]): {positions: Record<string, {x: number; y: number}>; headings: {title: string; x: number; y: number}[]};
  shortTitle(paper: Paper): string;
  shownRelation(relation: Relation, filters: Filters, selection: Selection): boolean;
  matchesRelation(relation: Relation, filters: Filters): boolean;
  relationState(relation: Relation): string;
  conceptPlan(data: PlanInput): {order: string[]; readings: Map<string, string[]>; topics: Map<string, string>; owner: Map<string, string>; unread: Set<string>; alsoRead(paperId: string): boolean};
}
type PlanInput = {start: string; papers: Paper[]; concepts?: {id: string; title?: string; tier?: string}[];
  backgrounds?: {concept_id: string; paper_id: string; readings: {paper_id: string}[]}[]};
const asset = (name: string) => readFileSync(new URL('../skills/danseo/assets/' + name, import.meta.url), 'utf8');
const scope = {window: {} as {DanseoGraph: Presentation}};
runInNewContext(asset('graph-presentation.js'), scope);
const view = scope.window.DanseoGraph;

test('explorer preserves filter controls and counts without rebuilding hidden selection lists', () => {
  let created = 0, changes = 0;
  class Element {
    className = ''; textContent = ''; value = ''; removed = false;
    children: Element[] = [];
    attributes = new Map<string, string>();
    listeners = new Map<string, () => void>();
    constructor() { created++; }
    append(...nodes: Element[]) { this.children.push(...nodes); }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    addEventListener(name: string, listener: () => void) { this.listeners.set(name, listener); }
    remove() { this.removed = true; }
  }
  interface Explorer {
    filters: Filters;
    update(papers: Paper[], relations: Relation[], selection: Selection): void;
    reset(): void; reveal(relation: Relation): void; destroy(): void;
  }
  const context = {window: {} as {DanseoGraph: {explorer(host: Element, onChange: () => void): Explorer}}, document: {createElement: () => new Element()}};
  runInNewContext(asset('graph-presentation.js'), context);
  const host = new Element(), explorer = context.window.DanseoGraph.explorer(host, () => { changes++; });
  const root = host.children[0]!, controls = root.children[0]!, status = root.children[2]!;
  const selects = controls.children.map(label => label.children[1]!);
  assert.equal(status.attributes.get('aria-live'), 'polite');
  const papers = [{id: 'a'}, {id: 'b'}];
  const source: Relation = {id: 's', source: 'a', target: 'b', kind: 'cites', origin: 'source', status: 'source-checked'};
  const ai = {...source, id: 'ai', kind: 'reading-order', origin: 'ai', status: 'proposed'};
  const mountedCount = created;
  explorer.update(papers, [source, ai], null);
  assert.match(status.textContent, /map connections: 0.*select a paper/);
  selects[0]!.value = 'source'; selects[0]!.listeners.get('change')!();
  explorer.update(papers, [source, ai], {type: 'paper', id: 'a'});
  assert.match(status.textContent, /filtered relations: 1 \/ 2 · map connections: 1$/);
  explorer.reveal(ai);
  assert.equal(selects[0]!.value, 'all');
  assert.equal(selects[1]!.value, 'all');
  explorer.update(papers, [source, ai], {type: 'relation', id: 'ai'});
  assert.match(status.textContent, /filtered relations: 2 \/ 2 · map connections: 1$/);
  selects[2]!.value = 'all'; selects[2]!.listeners.get('change')!();
  explorer.update(papers, [source, ai], null);
  assert.match(status.textContent, /map connections: 2$/);
  explorer.reset();
  assert.deepEqual(selects.map(select => select.value), ['all', 'all', 'focus']);
  assert.equal(changes, 4);
  assert.equal(created, mountedCount, 'Selection and filter updates only update counts, without allocating duplicate navigation');
  assert.equal(root.children[0], controls, 'Existing keyboard-focusable controls remain mounted');
  explorer.destroy(); assert.ok(root.removed);
});

test('twelve papers have deterministic nonoverlapping topic positions and unknown topics remain visible', () => {
  const papers = Array.from({length: 12}, (_, i) => ({id: 'p' + i, topic: ['검색', '융합', '추론', '검증'][i % 4]!}));
  const layout = view.topicLayout(papers);
  assert.equal(Object.keys(layout.positions).length, 12);
  assert.equal(layout.headings.length, 4);
  assert.equal(JSON.stringify(layout), JSON.stringify(view.topicLayout(papers)));
  const positions = Object.values(layout.positions);
  for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
    const a = positions[i]!, b = positions[j]!;
    assert.ok(Math.abs(a.x - b.x) >= view.card.width || Math.abs(a.y - b.y) >= view.card.height);
  }
  assert.equal(view.topicLayout([{id: 'isolated'}]).headings[0]!.title, 'Uncategorized');
  assert.equal(Object.keys(view.topicLayout([]).positions).length, 0);
  const longTitle = '검색 결과 근거의 답변 인용과 충실도 평가';
  const wrapped = view.topicLayout([{id: 'wrapped', topic: longTitle}]);
  assert.equal(wrapped.headings[0]!.title, longTitle);
  assert.ok(wrapped.headings[0]!.y + 48 + 12 <= wrapped.positions.wrapped!.y - view.card.height / 2);
  const fiveTopics = view.topicLayout(Array.from({length: 12}, (_, i) => ({id: 'p' + i, topic: '주제 ' + i % 5})));
  assert.equal(new Set(fiveTopics.headings.map(h => h.y)).size, 1, 'Five topics fit one row instead of shrinking every card for a second tier');
});

test('focus, kind and provenance filters never promote AI or stale evidence', () => {
  const source: Relation = {id: 's', source: 'a', target: 'b', kind: 'cites', origin: 'source', status: 'source-checked'};
  const ai = {...source, id: 'ai', kind: 'reading-order', origin: 'ai', status: 'proposed'};
  const filters = {category: 'all', kind: 'all', mode: 'focus'};
  assert.ok(!view.shownRelation(source, filters, null));
  assert.ok(view.shownRelation(source, filters, {type: 'paper', id: 'b'}));
  assert.ok(!view.shownRelation(source, filters, {type: 'paper', id: 'isolated'}));
  assert.ok(view.shownRelation(ai, filters, {type: 'relation', id: 'ai'}));
  assert.ok(!view.shownRelation(source, filters, {type: 'relation', id: 'ai'}));
  assert.ok(view.shownRelation(source, {...filters, mode: 'all'}, null));
  assert.ok(!view.matchesRelation(ai, {...filters, category: 'source'}));
  assert.ok(!view.matchesRelation(source, {...filters, kind: 'reading-order'}));
  assert.ok(view.matchesRelation({...ai, needs_recheck: true}, {...filters, category: 'stale'}));
  assert.equal(view.relationState({...ai, needs_recheck: true}), 'Suggested connection · recheck');
  assert.equal(view.relationState({...source, needs_recheck: true}), 'Source record · recheck');
  assert.equal(ai.status, 'proposed');
});

test('short aliases retain the full title and fallback does not invent acronyms', () => {
  const paper = {title: 'Dense Passage Retrieval for Open-Domain Question Answering', short_title: 'DPR'};
  assert.equal(view.shortTitle(paper), 'DPR');
  assert.match(paper.title, /Dense Passage/);
  assert.equal(view.shortTitle({title: 'Self-RAG: Learning to Retrieve'}), 'Self-RAG');
  assert.equal(view.shortTitle({title: 'Long descriptive title without a colon'}), 'Long descriptive title without a colon');
});

test('concept plan numbers start-paper concepts first, skips recipe concepts and gives each reading one owner', () => {
  const papers = [{id: 'F', topic: 'Core'}, {id: 'a', topic: 'RNN'}, {id: 'b', topic: 'RNN'}, {id: 'c', topic: 'Attention'}, {id: 'd', topic: 'Attention'}];
  const background = (concept_id: string, paper_id: string, readings: string[]) => ({concept_id, paper_id, readings: readings.map(id => ({paper_id: id}))});
  const plan = view.conceptPlan({start: 'F', papers,
    concepts: [{id: 'later'}, {id: 'rnn'}, {id: 'attn'}, {id: 'train', tier: 'recipe'}, {id: 'gap'}],
    backgrounds: [background('later', 'a', ['c']), background('rnn', 'F', ['a', 'b']), background('attn', 'F', ['b', 'c', 'd']),
      background('train', 'F', ['d']), background('gap', 'F', [])]});
  // Concepts the focal paper needs come first; recipe concepts get no number.
  assert.deepEqual(plan.order, ['rnn', 'attn', 'gap', 'later']);
  // "attn" has two Attention readings against one RNN reading, so its column is Attention.
  assert.equal(plan.topics.get('attn'), 'Attention');
  // "b" already hangs under "rnn"; "attn" keeps only its Attention readings, and "later" finds "c" taken.
  assert.equal(plan.owner.get('b'), 'rnn');
  assert.equal(plan.owner.get('c'), 'attn');
  assert.equal(plan.owner.get('d'), 'attn');
  assert.ok(!plan.alsoRead('a'));
  assert.ok(plan.alsoRead('b'));
  // "c" is the second reading of "attn" (after "b"), so it is labelled "Also read" there.
  assert.ok(plan.alsoRead('c'));
  // A concept with no reading stays as a gap in the start paper's column.
  assert.ok(plan.unread.has('gap'));
  assert.equal(plan.topics.get('gap'), 'Core');
});

test('concept plan keeps the earlier reading topic on a tie', () => {
  const plan = view.conceptPlan({start: 'F', papers: [{id: 'F', topic: 'Core'}, {id: 'x', topic: 'One'}, {id: 'y', topic: 'Two'}],
    concepts: [{id: 'k'}], backgrounds: [{concept_id: 'k', paper_id: 'F', readings: [{paper_id: 'y'}, {paper_id: 'x'}]}]});
  assert.equal(plan.topics.get('k'), 'Two');
  assert.equal(plan.owner.get('y'), 'k');
  assert.ok(!plan.owner.has('x'));
});

test('a map whose only concepts are recipe-tier keeps every paper as both a card and a graph node', () => {
  let cy: cytoscape.Core | undefined;
  const cards: string[] = [];
  const element = () => ({style: {}, classList: {add() {}, remove() {}, toggle() {}}, append() {}, setAttribute() {}, remove() {}, querySelector: () => null});
  const container = {...element(), before() {}, after() {}, addEventListener() {}, removeEventListener() {}};
  // Frames run immediately so card positions are synced against their graph nodes, as in a browser.
  const context = {window: {} as {DanseoGraph: Presentation; DanseoMap: {mount(...args: unknown[]): {destroy(): void}}},
    document: {createElement: element}, requestAnimationFrame: (callback: () => void) => { callback(); return 1; }, cancelAnimationFrame() {},
    cytoscape: (options: unknown) => (cy = cytoscape({...JSON.parse(JSON.stringify(options)), container: undefined, headless: true, styleEnabled: true}))};
  runInNewContext(asset('graph-presentation.js'), context);
  context.window.DanseoGraph = Object.assign({}, context.window.DanseoGraph, {drawTopics() {},
    paperCard: (paper: {id: string}) => { cards.push(paper.id); return element(); },
    explorer: () => ({filters: {category: 'all', kind: 'all', mode: 'focus'}, update() {}, destroy() {}, reveal() {}})});
  runInNewContext(asset('research-map.js'), context);
  const data = {version: 2, mode: 'paper-relations', start: 'F', focal_paper_id: 'F', relations: [],
    papers: ['F', 'r'].map(id => ({id, title: id, short_title: id, topic: 'Test', claims: []})),
    concepts: [{id: 'train', title: 'Training', summary: 's', tier: 'recipe'}],
    backgrounds: [{id: 'bg', concept_id: 'train', paper_id: 'F', origin: 'ai', status: 'proposed', rationale: 'r', readings: [{paper_id: 'r'}]}]};
  let map: {destroy(): void} | undefined;
  try {
    map = context.window.DanseoMap.mount(container, data, 'papers', () => {}, () => {});
    assert.deepEqual(cards.sort(), ['F', 'r']);
    for (const id of cards) assert.equal(cy?.getElementById('paper:' + id).length, 1, id + ' has a graph node');
  } finally {if (map) map.destroy(); else cy?.destroy();}
});

test('selecting the focal paper folds its outgoing citations but keeps follow-up papers that cite it', () => {
  let cy: cytoscape.Core | undefined;
  const created: {className: string; textContent: string}[] = [];
  const element = () => {
    const node = {className: '', textContent: '', style: {}, classList: {add() {}, remove() {}},
      append() {}, setAttribute() {}, addEventListener() {}, remove() {}, querySelector: () => null};
    created.push(node);
    return node;
  };
  const container = {...element(), before() {}, after() {}, addEventListener() {}, removeEventListener() {}};
  const context = {window: {} as {DanseoGraph: Presentation; DanseoMap: {mount(...args: unknown[]): {select(type: string, id: string): void; destroy(): void}}},
    document: {createElement: element}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    cytoscape: (options: unknown) => (cy = cytoscape({...JSON.parse(JSON.stringify(options)), container: undefined, headless: true, styleEnabled: true}))};
  runInNewContext(asset('graph-presentation.js'), context);
  context.window.DanseoGraph = Object.assign({}, context.window.DanseoGraph, {paperCard: element, drawTopics() {}});
  // Cytoscape's style parser expects native objects from its own JS realm.
  compileFunction(asset('research-map.js'), Object.keys(context))(...Object.values(context));
  const data = {version: 2, mode: 'paper-relations', start: 'F', focal_paper_id: 'F',
    papers: ['F', 'prior', 'later'].map(id => ({id, title: id, short_title: id, topic: id === 'later' ? 'Other' : 'Test', claims: []})),
    relations: [{id: 'out', source: 'F', target: 'prior', kind: 'cites', origin: 'source', status: 'source-checked'},
      {id: 'in', source: 'later', target: 'F', kind: 'cites', origin: 'source', status: 'source-checked'}],
    concepts: [{id: 'k', title: 'K', summary: 's'}, {id: 'later-k', title: 'Later', summary: 's'}],
    backgrounds: [{id: 'bg', concept_id: 'k', paper_id: 'F', origin: 'ai', status: 'proposed', rationale: 'r', readings: [{paper_id: 'prior'}]},
      {id: 'follow', concept_id: 'later-k', paper_id: 'prior', origin: 'ai', status: 'proposed', rationale: 'r', readings: [{paper_id: 'later'}]}]};
  let map: {select(type: string, id: string): void; destroy(): void} | undefined;
  try {
    map = context.window.DanseoMap.mount(container, data, 'papers', () => {}, () => {});
    map.select('paper', 'F');
    assert.ok(cy?.getElementById('relation:out').hasClass('display-hidden'));
    assert.ok(!cy?.getElementById('relation:in').hasClass('display-hidden'));
    const status = created.find(node => node.className === 'graph-explorer-status')!;
    assert.match(status.textContent, /map connections: 1 · Focal paper relations shown only in the list: 1\./);
    map.select('paper', 'prior');
    assert.match(status.textContent, /map connections: 1$/);
    // Decode the first Cytoscape bend in model coordinates: the lower paper
    // must enter the column gutter horizontally before passing any other card.
    const edge = cy!.getElementById('concept-need:follow');
    const from = edge.source().position(), to = edge.target().position();
    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
    const weight = parseFloat(edge.style('segment-weights')), distance = parseFloat(edge.style('segment-distances'));
    assert.ok(Math.abs(dy * weight + dx / length * distance) < .01, 'first bend stays level with the source');
    assert.ok(from.x + dx * weight - dy / length * distance < cy!.getElementById('concept:k').boundingBox().x1, 'first bend clears the column');
    const weights = edge.style('segment-weights').split(/\s+/).map(Number);
    const distances = edge.style('segment-distances').split(/\s+/).map(parseFloat);
    const laneY = from.y + dy * weights[1]! + dx / length * distances[1]!;
    assert.ok(laneY < -22 && laneY > -54, 'cross-column lane clears the focal badge and two-line heading');
  } finally {if (map) map.destroy(); else cy?.destroy();}
});

test('real Cytoscape selection updates neighbors after source and AI filtering', () => {
  let cy!: cytoscape.Core, change!: () => void, filters!: Filters;
  const element = () => ({style: {}, classList: {add() {}, remove() {}}, append() {}, setAttribute() {}, remove() {}, querySelector: () => null});
  const container = {...element(), before() {}, addEventListener() {}, removeEventListener() {}};
  const context = {window: {} as {DanseoGraph: Presentation; DanseoMap: {mount(...args: unknown[]): {select(type: string, id: string): void; destroy(): void}}},
    document: {createElement: element}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    cytoscape: (options: unknown) => (cy = cytoscape({...JSON.parse(JSON.stringify(options)), container: undefined, headless: true, styleEnabled: true}))};
  runInNewContext(asset('graph-presentation.js'), context);
  context.window.DanseoGraph = Object.assign({}, context.window.DanseoGraph, {paperCard: element, drawTopics() {}, explorer: (_host: unknown, onChange: () => void) => {
    change = onChange; filters = {category: 'all', kind: 'all', mode: 'focus'};
    return {filters, update() {}, destroy() {}, reveal() {}};
  }});
  runInNewContext(asset('research-map.js'), context);
  const data = {version: 2, mode: 'paper-relations', papers: ['a', 'b', 'c'].map(id => ({id, title: id, short_title: id, topic: 'Test', claims: []})),
    relations: [{id: 's', source: 'a', target: 'b', kind: 'cites', origin: 'source', status: 'source-checked'},
      {id: 'ai', source: 'a', target: 'c', kind: 'reading-order', origin: 'ai', status: 'proposed'}]};
  let map: ReturnType<typeof context.window.DanseoMap.mount> | undefined;
  try {
    map = context.window.DanseoMap.mount(container, data, 'papers', () => {});
    map.select('paper', 'a');
    assert.ok(cy.getElementById('paper:c').hasClass('connected'));
    filters.category = 'source'; change();
    assert.ok(!cy.getElementById('paper:c').hasClass('connected'));
    assert.ok(cy.getElementById('paper:c').hasClass('faded'));
    assert.ok(cy.getElementById('paper:b').hasClass('connected'));
    filters.category = 'ai'; change();
    assert.ok(cy.getElementById('paper:c').hasClass('connected'));
    assert.ok(!cy.getElementById('paper:b').hasClass('connected'));
  } finally {if (map) map.destroy(); else cy?.destroy();}
});
