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
    if (!node) throw new Error('Missing interface element: ' + id);
    return node;
  }
  function input(id: string): HTMLInputElement {
    const node = element(id);
    if (!(node instanceof HTMLInputElement)) throw new Error('Expected an input element: ' + id);
    return node;
  }
  function button(id: string): HTMLButtonElement {
    const node = element(id);
    if (!(node instanceof HTMLButtonElement)) throw new Error('Expected a button element: ' + id);
    return node;
  }
  function text<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    value: string,
    className?: string,
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    return node;
  }

  const sourceOnly = input('source-only');
  const refreshButton = button('refresh');
  const labels: Record<string, string> = {
    cites: 'Cites',
    extends: 'Extends',
    compares: 'Compares',
    'related-to': 'Related',
    'reading-order': 'Reading order',
  };
  let data: View | undefined;
  let map: MapController | null | undefined;
  let selection: { type: SelectionType; id: string } | undefined;

  function visibleRelations(view: View): View['relations'] {
    return view.relations.filter(
      (relation) =>
        !sourceOnly.checked ||
        (relation.origin === 'source' &&
          relation.status === 'source-checked' &&
          !relation.needs_recheck),
    );
  }
  function ready(paper: Paper): paper is ReadyPaper {
    return !!(paper.paper_id && paper.source && paper.document && paper.document_sha256);
  }
  function link(
    label: string,
    paper: ReadyPaper,
    kind: 'pdf' | 'analysis',
    page?: number,
  ): HTMLAnchorElement {
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
    if (!claims.length) column.append(text('p', 'No checked evidence for this criterion'));
    for (const row of claims) {
      const { claim, review } = row;
      // The server emits only supported rows. Optional inferred fields still
      // require a real check before constructing links or dereferencing support.
      if (!claim || !review || !ready(paper))
        throw new Error('Unable to verify the source and review details for the current evidence.');
      const article = text('div', '', 'claim');
      article.append(
        text('p', claim.statement),
        text('p', 'Conditions · ' + (claim.conditions ?? 'Not recorded')),
        text('p', 'Limits · ' + (claim.limits ?? 'Not recorded')),
      );
      const locators = claim.locators
        .map((locator) =>
          locator.type === 'pdf-page-range'
            ? `PDF pages ${locator.start}–${locator.end}`
            : `${locator.type} ${locator.value ?? ''}`,
        )
        .join(' · ');
      article.append(
        text('p', row.source.edition + ' · ' + locators, 'metadata'),
        text(
          'p',
          'Claim ' + row.paper_id + '/' + row.claim_id + ' · currently source-supported',
          'metadata',
        ),
      );
      const checkedPages = [...new Set(review.evidence.map((item) => item.pdf_page))];
      for (const item of review.evidence)
        article.append(
          text('p', `Source check · PDF page ${item.pdf_page} · ${item.section}`, 'metadata'),
        );
      const links = text('div', '', 'evidence-links');
      links.append(
        link(
          'Open this edition PDF',
          paper,
          'pdf',
          claim.locators.find((locator) => locator.type === 'pdf-page-range')?.start ??
            checkedPages[0],
        ),
        link('Topic analysis document', paper, 'analysis'),
      );
      for (const page of checkedPages)
        links.append(link(`Checked PDF page ${page}`, paper, 'pdf', page));
      article.append(links);
      column.append(article);
    }
    return column;
  }
  function paperById(view: View, id: string): Paper {
    const paper = view.papers.find((item) => item.paper_id === id);
    if (!paper) throw new Error('Missing relation paper: ' + id);
    return paper;
  }
  function criterionClaims(criterion: View['criteria'][number], paper: Paper): ClaimRow[] {
    const group = criterion.groups.find((item) => item.key === paper.key);
    if (!group) throw new Error('Missing criterion paper: ' + paper.key);
    return group.claims;
  }
  function emptyDetails(): void {
    element('details').replaceChildren(
      text('h2', 'Select a comparison criterion'),
      text('p', 'Select a paper, criterion or relation to inspect currently available evidence.'),
    );
  }
  function show(type: SelectionType, id: string, focus = true): void {
    const view = data;
    if (!view) return;
    const panel = element('details');
    panel.replaceChildren();
    selection = { type, id };
    if (type === 'relation') {
      const relation = visibleRelations(view).find((item) => item.id === id);
      if (!relation) {
        selection = undefined;
        emptyDetails();
        return;
      }
      panel.append(
        text('h2', (labels[relation.kind] ?? relation.kind) + ' · ' + relation.origin_label),
        text(
          'p',
          paperById(view, relation.source).title + ' → ' + paperById(view, relation.target).title,
        ),
        text('p', relation.rationale),
        text(
          'p',
          'Created by · ' +
            relation.created_by +
            (relation.review
              ? ' / ' +
                (relation.status === 'source-checked' ? 'Source check' : 'Previous source check') +
                ' · ' +
                relation.review.checked_by +
                ' · ' +
                relation.review.checked_at
              : ''),
          'metadata',
        ),
      );
      const columns = text('div', '', 'evidence-columns');
      for (const paper of view.papers.filter((item) =>
        [relation.source, relation.target].includes(item.paper_id ?? ''),
      )) {
        columns.append(
          evidence(
            paper,
            view.claims.filter(
              (claim) =>
                claim.key === paper.key &&
                relation.evidence_refs.some(
                  (ref) => ref.paper_id === claim.paper_id && ref.claim_id === claim.claim_id,
                ),
            ),
          ),
        );
      }
      panel.append(columns);
    } else if (type === 'criterion') {
      const criterion = view.criteria.find((item) => item.id === id);
      if (!criterion) {
        selection = undefined;
        emptyDetails();
        return;
      }
      panel.append(
        text('h2', criterion.title),
        text('p', 'AI grouping · ' + criterion.rationale, 'badge'),
      );
      const columns = text('div', '', 'evidence-columns');
      for (const paper of view.papers)
        columns.append(evidence(paper, criterionClaims(criterion, paper)));
      panel.append(columns);
    } else {
      const paper = view.papers.find((item) => item.id === id);
      if (!paper) {
        selection = undefined;
        emptyDetails();
        return;
      }
      panel.append(text('h2', paper.title));
      for (const criterion of view.criteria)
        panel.append(
          text('h3', criterion.title),
          text('p', 'AI grouping · ' + criterion.rationale, 'badge'),
          evidence(paper, criterionClaims(criterion, paper)),
        );
    }
    document
      .querySelectorAll<HTMLButtonElement>('[data-selection]')
      .forEach((node) =>
        node.setAttribute('aria-pressed', String(node.dataset.selection === type + ':' + id)),
      );
    map?.select(type, id);
    if (focus) panel.focus();
  }
  function mapSelected(item: MapSelection): void {
    if (item.type === 'grouping') show('criterion', item.recordId);
    else if (item.type === 'paper' || item.type === 'criterion' || item.type === 'relation')
      show(item.type, item.recordId);
  }
  function choices<T extends { id: string }>(
    id: string,
    items: T[],
    type: SelectionType,
    label: (item: T) => string,
  ): void {
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
    if (selection?.type === 'relation' && !relations.some((item) => item.id === selection?.id)) {
      selection = undefined;
      emptyDetails();
    }
    choices('papers', view.papers, 'paper', (paper) => paper.number + '. ' + paper.title);
    choices('criteria', view.criteria, 'criterion', (criterion) => criterion.title);
    choices(
      'relations',
      relations,
      'relation',
      (relation) =>
        relation.origin_label +
        ' · ' +
        (labels[relation.kind] ?? relation.kind) +
        ' · ' +
        paperById(view, relation.source).number +
        ' → ' +
        paperById(view, relation.target).number,
    );
    element('empty-relations').textContent = relations.length
      ? ''
      : sourceOnly.checked
        ? 'No currently valid source relations.' +
          (view.relations.length
            ? ' Clear the filter to inspect unchecked relations and proposals.'
            : '')
        : 'No research relations are currently available.';
    element('status').textContent =
      `Papers: ${view.papers.length} · criteria: ${view.criteria.length} · research relations: ${relations.length}. Checked against current files.`;
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
    element('status').textContent = 'Checking current evidence.';
    element('empty-relations').textContent = '';
    try {
      const response = await fetch('data', { cache: 'no-store' });
      if (!response.ok) throw new Error(await response.text());
      // Trusted same-origin server contract; this annotation is not JSON validation.
      const received: Comparison = await response.json();
      const view: View = {
        ...received,
        mode: 'research-comparison',
        papers: received.papers.map((paper) => ({
          ...paper,
          id: paper.paper_id ?? 'unavailable:' + paper.number,
        })),
      };
      data = view;
      element('question').textContent = view.question;
      document.title = view.question + ' · Danseo';
      for (const held of view.held)
        element('held').append(
          text(
            'p',
            (held.paper_id ?? held.key) +
              (held.claim_id ? '/' + held.claim_id : '') +
              ' · ' +
              held.reason,
          ),
        );
      for (const held of view.held_relations)
        element('held').append(text('p', held.id + ' · ' + held.reason));
      if (!element('held').childNodes.length) element('held').append(text('p', 'No held evidence'));
      render(view);
    } catch (error) {
      clearEvidence();
      element('status').textContent = 'Unable to display current evidence.';
      element('error').textContent = error instanceof Error ? error.message : String(error);
      element('error').hidden = false;
    } finally {
      refreshButton.disabled = false;
    }
  }
  sourceOnly.onchange = () => {
    if (data) render(data);
  };
  refreshButton.onclick = refresh;
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void refresh();
  });
  void refresh();
})();
