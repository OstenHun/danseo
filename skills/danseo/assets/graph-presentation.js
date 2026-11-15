// Shared visual grammar. Adapters retain ownership of records, layout and navigation.
(() => {
  'use strict';
  const card = Object.freeze({ width: 208, height: 144, column: 260, row: 196 });
  const kindNames = Object.freeze({ cites: '인용', extends: '방법 확장', compares: '비교', 'related-to': '관련성', 'reading-order': '읽기 순서' });
  const colors = Object.freeze({ source: '#326952', ai: '#7662a6', stale: '#a77832', pending: '#7b8493' });
  const reviewNames = { draft: '논문 검토 중', 'source-checked': '논문 대조 기록', 'needs-recheck': '논문 재확인' };
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
    top.append(element('span', 'graph-paper-type', '논문'), element('span', 'graph-paper-review', reviewNames[paper.reviewStatus] ?? '논문 상태 미확인'));
    const title = element('p', 'graph-paper-title', paper.title);
    const date = element('p', 'graph-paper-date', paper.dateLabel);
    const meta = element('div', 'graph-paper-meta');
    meta.append(element('span', 'graph-paper-id', paper.id));
    node.append(top, title, date, meta);
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
      // The list/detail owns the full relation name; a short number fits between cards.
      { selector: 'edge.selected', style: { width: 3, label: 'data(number)', 'font-size': 13, 'font-family': 'Segoe UI, Malgun Gothic, sans-serif', color: '#394457', 'text-background-color': '#ffffff', 'text-background-opacity': 1, 'text-background-padding': '4px', 'text-border-width': 1, 'text-border-color': '#dce1eb', 'text-border-opacity': 1, 'text-rotation': 'none' } }
    ];
  }
  window.DanseoGraph = Object.freeze({ card, kindNames, category, paperCard, syncCard, edgeStyles, freePositions });
})();
