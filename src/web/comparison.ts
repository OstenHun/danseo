/* Research strings are text, never HTML. Loaded after the shared DanseoMap. */
(() => {
  'use strict';
  type Comparison = import('../core/comparison.js').Comparison;
  type View = import('./browser-types.js').ComparisonView;
  type Paper = import('./browser-types.js').ComparisonPaper;
  type ReadyPaper = import('./browser-types.js').ReadyPaper;
  type SelectionType = import('./browser-types.js').ComparisonSelection;
  type MapSelection = import('./browser-types.js').MapSelection;
  type MapController = import('./browser-types.js').MapController;
  type ClaimRow = Comparison['claims'][number];

  function element(id: string): HTMLElement {
    const node = document.getElementById(id);
    if (!node) throw new Error('화면 요소가 없습니다: ' + id);
    return node;
  }
  function input(id: string): HTMLInputElement {
    const node = element(id);
    if (!(node instanceof HTMLInputElement)) throw new Error('입력 요소가 아닙니다: ' + id);
    return node;
  }
  function button(id: string): HTMLButtonElement {
    const node = element(id);
    if (!(node instanceof HTMLButtonElement)) throw new Error('버튼 요소가 아닙니다: ' + id);
    return node;
  }
  function text<K extends keyof HTMLElementTagNameMap>(tag: K, value: string, className?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    return node;
  }

  const sourceOnly = input('source-only');
  const refreshButton = button('refresh');
  const labels: Record<string, string> = { cites: '인용', extends: '확장', compares: '비교', 'related-to': '관련', 'reading-order': '읽기 순서' };
  let data: View | undefined;
  let map: MapController | null | undefined;
  let selection: { type: SelectionType; id: string } | undefined;

  function visibleRelations(view: View): View['relations'] {
    return view.relations.filter(relation => !sourceOnly.checked || relation.origin === 'source'
      && relation.status === 'source-checked' && !relation.needs_recheck);
  }
  function ready(paper: Paper): paper is ReadyPaper {
    return !!(paper.paper_id && paper.source && paper.document && paper.document_sha256);
  }
  function link(label: string, paper: ReadyPaper, kind: 'pdf' | 'analysis', page?: number): HTMLAnchorElement {
    const digest = kind === 'pdf' ? paper.source.sha256 : paper.document_sha256;
    const anchor = text('a', label);
    anchor.href = `file/${paper.number}/${kind}/${digest}${page ? '#page=' + page : ''}`;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }
  function evidence(paper: Paper, claims: ClaimRow[]): HTMLElement {
    const column = text('article', '', 'evidence-column');
    column.append(text('h3', paper.title));
    if (!claims.length) column.append(text('p', '이 기준으로 확인한 근거 없음'));
    for (const row of claims) {
      const { claim, review } = row;
      // The server emits only supported rows. Optional inferred fields still
      // require a real check before constructing links or dereferencing support.
      if (!claim || !review || !ready(paper)) throw new Error('현재 근거의 원문·검토 정보를 확인할 수 없습니다.');
      const article = text('div', '', 'claim');
      article.append(text('p', claim.statement), text('p', '조건 · ' + (claim.conditions ?? '기록 없음')),
        text('p', '한계 · ' + (claim.limits ?? '기록 없음')));
      const locators = claim.locators.map(locator => locator.type === 'pdf-page-range'
        ? `PDF ${locator.start}–${locator.end}쪽` : `${locator.type} ${locator.value ?? ''}`).join(' · ');
      article.append(text('p', row.source.edition + ' · ' + locators, 'metadata'),
        text('p', '주장 ' + row.paper_id + '/' + row.claim_id + ' · 현재 원문 지지', 'metadata'));
      const checkedPages = [...new Set(review.evidence.map(item => item.pdf_page))];
      for (const item of review.evidence) article.append(text('p', `원문 대조 · PDF ${item.pdf_page}쪽 · ${item.section}`, 'metadata'));
      const links = text('div', '', 'evidence-links');
      links.append(link('해당 판본 PDF 열기', paper, 'pdf', claim.locators.find(locator => locator.type === 'pdf-page-range')?.start ?? checkedPages[0]),
        link('주제별 분석 문서', paper, 'analysis'));
      for (const page of checkedPages) links.append(link(`PDF 대조 ${page}쪽`, paper, 'pdf', page));
      article.append(links);
      column.append(article);
    }
    return column;
  }
  function paperById(view: View, id: string): Paper {
    const paper = view.papers.find(item => item.paper_id === id);
    if (!paper) throw new Error('관계의 논문이 없습니다: ' + id);
    return paper;
  }
  function criterionClaims(criterion: View['criteria'][number], paper: Paper): ClaimRow[] {
    const group = criterion.groups.find(item => item.key === paper.key);
    if (!group) throw new Error('비교 기준의 논문이 없습니다: ' + paper.key);
    return group.claims;
  }
  function emptyDetails(): void {
    element('details').replaceChildren(text('h2', '비교 기준을 선택하세요'),
      text('p', '논문·기준·관계를 선택하면 현재 확인 가능한 근거를 보여줍니다.'));
  }
  function show(type: SelectionType, id: string, focus = true): void {
    const view = data;
    if (!view) return;
    const panel = element('details');
    panel.replaceChildren();
    selection = { type, id };
    if (type === 'relation') {
      const relation = visibleRelations(view).find(item => item.id === id);
      if (!relation) { selection = undefined; emptyDetails(); return; }
      panel.append(text('h2', (labels[relation.kind] ?? relation.kind) + ' · ' + relation.origin_label),
        text('p', paperById(view, relation.source).title + ' → ' + paperById(view, relation.target).title),
        text('p', relation.rationale), text('p', '작성 · ' + relation.created_by + (relation.review
          ? ' / ' + (relation.status === 'source-checked' ? '원문 대조' : '이전 대조 기록') + ' · ' + relation.review.checked_by + ' · ' + relation.review.checked_at : ''), 'metadata'));
      const columns = text('div', '', 'evidence-columns');
      for (const paper of view.papers.filter(item => [relation.source, relation.target].includes(item.paper_id ?? ''))) {
        columns.append(evidence(paper, view.claims.filter(claim => claim.key === paper.key
          && relation.evidence_refs.some(ref => ref.paper_id === claim.paper_id && ref.claim_id === claim.claim_id))));
      }
      panel.append(columns);
    } else if (type === 'criterion') {
      const criterion = view.criteria.find(item => item.id === id);
      if (!criterion) { selection = undefined; emptyDetails(); return; }
      panel.append(text('h2', criterion.title), text('p', 'AI 분류 · ' + criterion.rationale, 'badge'));
      const columns = text('div', '', 'evidence-columns');
      for (const paper of view.papers) columns.append(evidence(paper, criterionClaims(criterion, paper)));
      panel.append(columns);
    } else {
      const paper = view.papers.find(item => item.id === id);
      if (!paper) { selection = undefined; emptyDetails(); return; }
      panel.append(text('h2', paper.title));
      for (const criterion of view.criteria) panel.append(text('h3', criterion.title),
        text('p', 'AI 분류 · ' + criterion.rationale, 'badge'), evidence(paper, criterionClaims(criterion, paper)));
    }
    document.querySelectorAll<HTMLButtonElement>('[data-selection]').forEach(node =>
      node.setAttribute('aria-pressed', String(node.dataset.selection === type + ':' + id)));
    map?.select(type, id);
    if (focus) panel.focus();
  }
  function mapSelected(item: MapSelection): void {
    if (item.type === 'grouping') show('criterion', item.recordId);
    else if (item.type === 'paper' || item.type === 'criterion' || item.type === 'relation') show(item.type, item.recordId);
  }
  function choices<T extends { id: string }>(id: string, items: T[], type: SelectionType, label: (item: T) => string): void {
    const holder = element(id);
    holder.replaceChildren();
    for (const item of items) {
      const choice = text('button', label(item));
      choice.type = 'button';
      choice.dataset.selection = type + ':' + item.id;
      choice.setAttribute('aria-pressed', 'false');
      choice.onclick = () => show(type, item.id);
      holder.append(choice);
    }
  }
  function render(view: View): void {
    const relations = visibleRelations(view);
    if (selection?.type === 'relation' && !relations.some(item => item.id === selection?.id)) {
      selection = undefined;
      emptyDetails();
    }
    choices('papers', view.papers, 'paper', paper => paper.number + '. ' + paper.title);
    choices('criteria', view.criteria, 'criterion', criterion => criterion.title);
    choices('relations', relations, 'relation', relation => relation.origin_label + ' · ' + (labels[relation.kind] ?? relation.kind)
      + ' · ' + paperById(view, relation.source).number + ' → ' + paperById(view, relation.target).number);
    element('empty-relations').textContent = relations.length ? '' : sourceOnly.checked ? '현재 유효한 원문 관계가 없습니다.'
      + (view.relations.length ? ' 필터를 풀면 미대조 관계·제안을 확인할 수 있습니다.' : '') : '현재 확인 가능한 연구 간 관계가 없습니다.';
    element('status').textContent = `논문 ${view.papers.length}편 · 기준 ${view.criteria.length}개 · 연구 간 관계 ${relations.length}개. 현재 파일로 확인했습니다.`;
    map?.destroy();
    map = window.DanseoMap.mount(element('map'), { ...view, relations }, 'comparison', mapSelected);
    if (selection) show(selection.type, selection.id, false);
  }
  function clearEvidence(): void {
    // Failed reads and projection errors cannot retain old support.
    data = undefined;
    selection = undefined;
    emptyDetails();
    map?.destroy();
    map = undefined;
    for (const id of ['papers', 'criteria', 'relations', 'held']) element(id).replaceChildren();
    element('empty-relations').textContent = '';
  }
  async function refresh(): Promise<void> {
    refreshButton.disabled = true;
    element('error').hidden = true;
    clearEvidence();
    element('status').textContent = '현재 근거를 확인하는 중입니다.';
    element('empty-relations').textContent = '';
    try {
      const response = await fetch('data', { cache: 'no-store' });
      if (!response.ok) throw new Error(await response.text());
      // Trusted same-origin server contract; this annotation is not JSON validation.
      const received: Comparison = await response.json();
      const view: View = { ...received, mode: 'research-comparison',
        papers: received.papers.map(paper => ({ ...paper, id: paper.paper_id ?? 'unavailable:' + paper.number })) };
      data = view;
      element('question').textContent = view.question;
      document.title = view.question + ' · Danseo';
      for (const held of view.held) element('held').append(text('p', (held.paper_id ?? held.key)
        + (held.claim_id ? '/' + held.claim_id : '') + ' · ' + held.reason));
      for (const held of view.held_relations) element('held').append(text('p', held.id + ' · ' + held.reason));
      if (!element('held').childNodes.length) element('held').append(text('p', '보류한 근거 없음'));
      render(view);
    } catch (error) {
      clearEvidence();
      element('status').textContent = '현재 근거를 표시할 수 없습니다.';
      element('error').textContent = error instanceof Error ? error.message : String(error);
      element('error').hidden = false;
    } finally {
      refreshButton.disabled = false;
    }
  }
  sourceOnly.onchange = () => { if (data) render(data); };
  refreshButton.onclick = refresh;
  window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
  void refresh();
})();
