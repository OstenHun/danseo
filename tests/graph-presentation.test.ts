import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
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
}
const asset = (name: string) => readFileSync(new URL('../skills/danseo/assets/' + name, import.meta.url), 'utf8');
const scope = {window: {} as {DanseoGraph: Presentation}};
runInNewContext(asset('graph-presentation.js'), scope);
const view = scope.window.DanseoGraph;

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
  assert.equal(view.topicLayout([{id: 'isolated'}]).headings[0]!.title, '주제 미분류');
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
  assert.equal(view.relationState({...ai, needs_recheck: true}), 'AI 제안 · 재확인');
  assert.equal(view.relationState({...source, needs_recheck: true}), '원문 기록 · 재확인');
  assert.equal(ai.status, 'proposed');
});

test('short aliases retain the full title and fallback does not invent acronyms', () => {
  const paper = {title: 'Dense Passage Retrieval for Open-Domain Question Answering', short_title: 'DPR'};
  assert.equal(view.shortTitle(paper), 'DPR');
  assert.match(paper.title, /Dense Passage/);
  assert.equal(view.shortTitle({title: 'Self-RAG: Learning to Retrieve'}), 'Self-RAG');
  assert.equal(view.shortTitle({title: 'Long descriptive title without a colon'}), 'Long descriptive title without a colon');
});

test('real Cytoscape selection updates neighbors after source and AI filtering', () => {
  let cy!: cytoscape.Core, change!: () => void, filters!: Filters;
  const element = () => ({style: {}, classList: {add() {}, remove() {}}, append() {}, setAttribute() {}, remove() {}});
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
  const map = context.window.DanseoMap.mount(container, data, 'papers', () => {});
  try {
    map.select('paper', 'a');
    assert.ok(cy.getElementById('paper:c').hasClass('connected'));
    filters.category = 'source'; change();
    assert.ok(!cy.getElementById('paper:c').hasClass('connected'));
    assert.ok(cy.getElementById('paper:c').hasClass('faded'));
    assert.ok(cy.getElementById('paper:b').hasClass('connected'));
    filters.category = 'ai'; change();
    assert.ok(cy.getElementById('paper:c').hasClass('connected'));
    assert.ok(!cy.getElementById('paper:b').hasClass('connected'));
  } finally {map.destroy();}
});
