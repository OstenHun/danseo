// Shared visual grammar. Adapters retain ownership of records, layout and navigation.
(() => {
  'use strict';
  const t = window.DanseoText ?? ((text, values = {}) => text.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match));
  const card = Object.freeze({ width: 184, height: 108, column: 216, row: 132 });
  const kindNames = Object.freeze({ cites: t('Cites'), extends: t('Method extension'), compares: t('Compares'), 'related-to': t('Relatedness'), 'reading-order': t('Reading order') });
  const colors = Object.freeze({ source: '#326952', ai: '#7662a6', stale: '#a77832', pending: '#7b8493' });
  const reviewNames = { draft: t('Paper review in progress'), 'source-checked': t('Paper source-check record'), 'needs-recheck': t('Paper needs rechecking') };
  function shortTitle(paper) {
    const title = paper.short_title || paper.title;
    const prefix = title.split(/[:：]/)[0].trim();
    return !paper.short_title && prefix.length > 0 && prefix.length <= 28 ? prefix : title;
  }
  function topicLayout(papers) {
    const groups = new Map();
    for (const paper of papers) {
      const topic = paper.topic || t('Uncategorized');
      if (!groups.has(topic)) groups.set(topic, []);
      groups.get(topic).push(paper);
    }
    const positions = {}, headings = [];
    const columns = Math.min(5, Math.max(1, groups.size));
    const rows = Math.max(1, ...[...groups.values()].map(group => group.length));
    [...groups].forEach(([title, group], i) => {
      const x = (i % columns) * card.column, y = Math.floor(i / columns) * (rows * card.row + 100);
      headings.push({ title, x, y: y - 114 });
      group.forEach((paper, index) => {
        // Ungrouped legacy inputs remain compact without inventing a topic.
        positions[paper.id] = groups.size === 1
          ? { x: index % Math.min(4, group.length) * card.column, y: Math.floor(index / Math.min(4, group.length)) * card.row }
          : { x, y: y + index * card.row };
      });
    });
    return { positions, headings };
  }
  function drawTopics(world, headings) {
    world.querySelectorAll('.graph-topic').forEach(item => item.remove());
    for (const heading of headings) {
      const label = element('div', 'graph-topic', heading.title);
      label.style.left = (heading.x - card.width / 2) + 'px'; label.style.top = heading.y + 'px';
      world.append(label);
    }
  }
  function matchesRelation(edge, filters) {
    return (filters.kind === 'all' || filters.kind === edge.kind) && (filters.category === 'all' || filters.category === category(edge));
  }
  function shownRelation(edge, filters, selection) {
    return matchesRelation(edge, filters) && (filters.mode === 'all' || (selection?.type === 'relation' ? edge.id === selection.id : selection?.type === 'paper' && (edge.source === selection.id || edge.target === selection.id)));
  }
  function relationState(edge) {
    const state = category(edge);
    if (state === 'stale') return (edge.origin === 'ai' ? t('AI proposal') : t('Source record')) + t(' · recheck');
    return state === 'ai' ? t('AI proposal') : state === 'source' ? t('Source check') : t('Source unchecked');
  }
  // Shared filters and counts; adapters own graph selection and keyboard navigation.
  function explorer(host, onChange, initialFilters = {}) {
    const root = element('div', 'graph-explorer'), controls = element('div', 'graph-explorer-controls');
    const filters = { category: 'all', kind: 'all', mode: 'focus', ...initialFilters };
    const selects = {};
    for (const [key, label, choices] of [
      ['category', t('Evidence status'), [['all',t('All statuses')],['source',t('Source check')],['ai',t('AI proposal')],['stale',t('Recheck')],['pending',t('Source unchecked')]]],
      ['kind', t('Relation type'), [['all',t('All types')], ...Object.entries(kindNames)]],
      ['mode', t('Connections'), [['focus',t('Selected connections')],['all',t('All connections')]]]
    ]) {
      const field = element('label', ''), select = element('select', '');
      field.append(element('span', '', label)); select.setAttribute('aria-label', label);
      for (const [value, title] of choices) { const option = element('option', '', title); option.value = value; select.append(option); }
      select.value = filters[key]; selects[key] = select;
      select.addEventListener('change', () => { filters[key] = select.value; onChange(); });
      field.append(select); controls.append(field);
    }
    const status = element('p', 'graph-explorer-status'); status.setAttribute('aria-live','polite');
    const note = element('p', 'graph-topic-note', t('Topic groups are editorial interpretations, not citation or method-extension order. Select a paper to show its connections.'));
    root.append(controls, note, status); host.append(root);
    function update(papers, edges, selection) {
      const eligible = edges.filter(edge => matchesRelation(edge, filters));
      const shown = edges.filter(edge => shownRelation(edge, filters, selection));
      status.textContent = t('Papers: {papers} · filtered relations: {eligible} / {total} · map connections: {shown}', { papers: papers.length, eligible: eligible.length, total: edges.length, shown: shown.length }) + (!selection && filters.mode === 'focus' ? t(' · select a paper to show connections') : '');
    }
    return { filters, update, reset() { filters.category='all'; filters.kind='all'; filters.mode='focus'; for(const key of Object.keys(selects))selects[key].value=filters[key]; onChange(); }, reveal(edge) { if (!matchesRelation(edge,filters)) { filters.category='all'; filters.kind='all'; selects.category.value='all'; selects.kind.value='all'; onChange(); } }, destroy() { root.remove(); } };
  }
  function freePositions(count) {
    const radius = Math.max(260, count * 52);
    return Array.from({ length: count }, (_, index) => {
      if (count === 1) return { x: 0, y: 0 };
      if (count === 2) return { x: index * 340, y: 0 };
      const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * .65 };
    });
  }
  function category(edge) {
    if (edge.stale || edge.needs_recheck || edge.status === 'needs-recheck') return 'stale';
    if (edge.origin === 'ai') return 'ai';
    return edge.status === 'source-checked' ? 'source' : 'pending';
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function paperCard(paper) {
    const node = element('article', 'graph-paper');
    node.dataset.paperId = paper.id;
    node.style.width = card.width + 'px';
    node.style.height = card.height + 'px';
    const top = element('div', 'graph-paper-top');
    top.append(element('span', 'graph-paper-type', t('Paper')), element('span', 'graph-paper-review', reviewNames[paper.reviewStatus] ?? t('Paper status unknown')));
    const title = element('p', 'graph-paper-title', shortTitle(paper));
    title.title = paper.title;
    const date = element('p', 'graph-paper-date', paper.dateLabel);
    node.append(top, title, date);
    node.classList.toggle('is-undated', paper.undated === true);
    return node;
  }
  function syncCard(cardElement, graphNode) {
    const position = graphNode.position();
    cardElement.hidden = graphNode.hasClass('hidden');
    cardElement.style.transform = `translate(${position.x - card.width / 2}px,${position.y - card.height / 2}px)`;
    for (const state of ['selected', 'connected', 'faded', 'hovered']) cardElement.classList.toggle('is-' + state, graphNode.hasClass(state));
  }
  function edgeStyles() {
    return [
      { selector: 'edge', style: { width: 1.8, 'line-color': colors.pending, 'target-arrow-color': colors.pending, 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'control-point-step-size': 64, 'arrow-scale': .9, 'overlay-opacity': 0, label: '' } },
      ...Object.entries(colors).map(([state, color]) => ({ selector: `edge[category="${state}"]`, style: { 'line-color': color, 'target-arrow-color': color, 'line-style': state === 'source' ? 'solid' : state === 'stale' ? 'dotted' : 'dashed' } })),
      { selector: 'edge.connected, edge.hovered', style: { width: 3 } },
      { selector: 'edge.faded', style: { opacity: .16 } },
      { selector: 'edge.display-hidden', style: { display: 'none' } },
      // The list/detail owns the full relation name; a short number fits between cards.
      { selector: 'edge.selected', style: { width: 3, label: 'data(number)', 'font-size': 13, 'font-family': 'Segoe UI, Malgun Gothic, sans-serif', color: '#394457', 'text-background-color': '#ffffff', 'text-background-opacity': 1, 'text-background-padding': '4px', 'text-border-width': 1, 'text-border-color': '#dce1eb', 'text-border-opacity': 1, 'text-rotation': 'none' } }
    ];
  }
  window.DanseoGraph = Object.freeze({ card, kindNames, category, paperCard, syncCard, edgeStyles, freePositions, shortTitle, topicLayout, drawTopics, matchesRelation, shownRelation, relationState, explorer });
})();
