// Shared visual grammar. Adapters retain ownership of records, layout and navigation.
(() => {
  'use strict';
  const card = Object.freeze({ width: 184, height: 108, column: 216, row: 132 });
  const kindNames = Object.freeze({ cites: '인용', extends: '방법 확장', compares: '비교', 'related-to': '관련성', 'reading-order': '읽기 순서' });
  const colors = Object.freeze({ source: '#326952', ai: '#7662a6', stale: '#a77832', pending: '#7b8493' });
  const reviewNames = { draft: '논문 검토 중', 'source-checked': '논문 대조 기록', 'needs-recheck': '논문 재확인' };
  function shortTitle(paper) {
    const title = paper.short_title || paper.title;
    const prefix = title.split(/[:：]/)[0].trim();
    return !paper.short_title && prefix.length > 0 && prefix.length <= 28 ? prefix : title;
  }
  function topicLayout(papers) {
    const groups = new Map();
    for (const paper of papers) {
      const topic = paper.topic || '주제 미분류';
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
    if (state === 'stale') return (edge.origin === 'ai' ? 'AI 제안' : '원문 기록') + ' · 재확인';
    return state === 'ai' ? 'AI 제안' : state === 'source' ? '원문 대조' : '원문 미확인';
  }
  // Both adapters use the same controls and touch/keyboard alternative to a tiny canvas.
  function explorer(host, onChange, onSelect, detailId) {
    const root = element('div', 'graph-explorer'), controls = element('div', 'graph-explorer-controls');
    const filters = { category: 'all', kind: 'all', mode: 'focus' };
    const selects = {};
    for (const [key, label, choices] of [
      ['category', '근거 상태', [['all','모든 상태'],['source','원문 대조'],['ai','AI 제안'],['stale','재확인'],['pending','원문 미확인']]],
      ['kind', '관계 종류', [['all','모든 종류'], ...Object.entries(kindNames)]],
      ['mode', '연결선', [['focus','선택한 연결만'],['all','전체 연결']]]
    ]) {
      const field = element('label', ''), select = element('select', '');
      field.append(element('span', '', label)); select.setAttribute('aria-label', label);
      for (const [value, title] of choices) { const option = element('option', '', title); option.value = value; select.append(option); }
      select.value = filters[key]; selects[key] = select;
      select.addEventListener('change', () => { filters[key] = select.value; onChange(); });
      field.append(select); controls.append(field);
    }
    const status = element('p', 'graph-explorer-status'); status.setAttribute('aria-live','polite');
    const note = element('p', 'graph-topic-note', '주제 묶음은 편집상 해석이며 인용·계승 순서를 뜻하지 않습니다. 논문을 선택해 연결을 펼치세요.');
    const mobile = element('div', 'graph-mobile');
    root.append(controls, note, status, mobile); host.append(root);
    function update(papers, edges, selection) {
      const activeKey = document.activeElement?.dataset?.explorerKey;
      const focusTargets = new Map();
      const eligible = edges.filter(edge => matchesRelation(edge, filters));
      const shown = edges.filter(edge => shownRelation(edge, filters, selection));
      status.textContent = `논문 ${papers.length}편 · 필터 관계 ${eligible.length} / ${edges.length}개 · 지도 연결선 ${shown.length}개` + (!selection && filters.mode === 'focus' ? ' · 논문 선택 후 표시' : '');
      mobile.replaceChildren();
      const groups = new Map();
      for (const paper of papers) { const key = paper.topic || '주제 미분류'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(paper); }
      const names = new Map(papers.map(p => [p.id, shortTitle(p)]));
      const topicList = element('div', 'graph-topic-list');
      for (const [title, group] of groups) {
        const section = element('section','graph-topic-section'); section.append(element('h3','',title));
        const list = element('div','graph-topic-buttons');
        for (const paper of group) {
          const button = element('button','',shortTitle(paper)); button.type='button'; button.title=paper.title;
          button.dataset.explorerKey = 'paper:' + paper.id; focusTargets.set(button.dataset.explorerKey, button);
          button.setAttribute('aria-pressed',String(selection?.type === 'paper' && selection.id === paper.id));
          button.addEventListener('click',()=>onSelect('paper',paper.id)); list.append(button);
        }
        section.append(list); topicList.append(section);
      }
      mobile.append(topicList);
      const chosen = selection?.type === 'relation' ? eligible.find(edge => edge.id === selection.id) : null;
      if (chosen) {
        const pair = element('div','graph-pair ' + category(chosen));
        pair.append(element('strong','',names.get(chosen.source)),element('span','',`↓ ${kindNames[chosen.kind]} · ${relationState(chosen)}`),element('strong','',names.get(chosen.target)));
        pair.tabIndex=-1; pair.setAttribute('aria-label','선택한 관계'); focusTargets.set('relation:' + chosen.id,pair);
        const jump = element('button','','선택한 근거 보기 ↓'); jump.type='button';
        jump.addEventListener('click',()=>document.getElementById(detailId)?.focus()); pair.append(jump);
        mobile.append(pair);
      }
      const links = selection?.type === 'paper' ? eligible.filter(e=>e.source===selection.id||e.target===selection.id) : filters.mode === 'all' ? eligible : [];
      if (selection?.type === 'paper') mobile.append(element('h3','',names.get(selection.id) + ' · 연결 ' + links.length + '개'));
      for (const edge of links) {
        const button = element('button','graph-mobile-relation',`${names.get(edge.source)} → ${names.get(edge.target)} · ${kindNames[edge.kind]}`);
        button.type='button'; button.append(element('small','',relationState(edge)));
        button.dataset.explorerKey='relation:' + edge.id; focusTargets.set(button.dataset.explorerKey,button);
        button.addEventListener('click',()=>onSelect('relation',edge.id)); mobile.append(button);
      }
      if (activeKey) focusTargets.get(activeKey)?.focus({preventScroll:true});
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
    top.append(element('span', 'graph-paper-type', '논문'), element('span', 'graph-paper-review', reviewNames[paper.reviewStatus] ?? '논문 상태 미확인'));
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
