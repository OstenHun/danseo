// Shared visual grammar. Adapters retain ownership of records, layout and navigation.
(() => {
  'use strict';
  const t = window.DanseoText ?? ((text, values = {}) => text.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match));
  const card = Object.freeze({ width: 184, height: 108, column: 216, row: 132 });
  const kindNames = Object.freeze({ cites: t('Cites'), extends: t('Method extension'), compares: t('Compares'), 'related-to': t('Relatedness'), 'reading-order': t('Reading order') });
  const colors = Object.freeze({ source: '#326952', ai: '#7662a6', stale: '#a77832', pending: '#7b8493' });
  function shortTitle(paper) {
    const title = paper.short_title || paper.title;
    const prefix = title.split(/[:：]/)[0].trim();
    return !paper.short_title && prefix.length > 0 && prefix.length <= 28 ? prefix : title;
  }
  const topicOf = paper => paper.topic || t('Uncategorized');
  // The topic most of the readings share. A tie keeps the topic of the earlier reading.
  function winningTopic(topics, fallback) {
    const counts = new Map();
    for (const topic of topics) counts.set(topic, (counts.get(topic) ?? 0) + 1);
    let best = fallback, bestCount = 0;
    for (const [topic, count] of counts) if (count > bestCount) { best = topic; bestCount = count; }
    return best;
  }
  // Decides, for a first map, which concepts are drawn, in what order, and under which concept each reading sits.
  // The map layout and the detail panel both read this plan, so pill numbers and "Concept N" labels always agree.
  function conceptPlan(data) {
    const backgrounds = data.backgrounds ?? [];
    const papers = new Map(data.papers.map(paper => [paper.id, paper]));
    const linked = new Set(backgrounds.map(background => background.concept_id));
    const startConcepts = new Set(backgrounds.filter(background => background.paper_id === data.start).map(background => background.concept_id));
    // Recipe-tier concepts (training, data, evaluation) fold off the map, so they take no number.
    const order = (data.concepts ?? [])
      .filter(concept => linked.has(concept.id) && concept.tier !== 'recipe')
      .map(concept => concept.id)
      .sort((a, b) => Number(startConcepts.has(b)) - Number(startConcepts.has(a)));
    const startPaper = papers.get(data.start) ?? data.papers[0];
    const startTopic = startPaper ? topicOf(startPaper) : t('Uncategorized');
    const readings = new Map(), topics = new Map(), groups = new Map(), owner = new Map(), unread = new Set();
    for (const conceptId of order) {
      const ids = backgrounds.filter(background => background.concept_id === conceptId)
        .flatMap(background => background.readings.map(reading => reading.paper_id))
        .filter((id, index, all) => papers.has(id) && all.indexOf(id) === index);
      readings.set(conceptId, ids);
      // A concept without readings stays visible in the start paper's column as a recorded gap.
      if (!ids.length) unread.add(conceptId);
      const candidates = ids.filter(id => id !== data.start);
      const topic = winningTopic(candidates.map(id => topicOf(papers.get(id))), startTopic);
      topics.set(conceptId, topic);
      // A reading is drawn under the first concept that claims it from the same topic column.
      const own = candidates.filter(id => !owner.has(id) && topicOf(papers.get(id)) === topic);
      for (const id of own) owner.set(id, conceptId);
      groups.set(conceptId, own);
    }
    // The first listed reading is where to start; any other reading is labelled "Also read".
    const alsoRead = paperId => owner.has(paperId) && readings.get(owner.get(paperId))[0] !== paperId;
    return { order, readings, topics, groups, owner, unread, alsoRead };
  }
  function topicLayout(papers) {
    const groups = new Map();
    for (const paper of papers) {
      const topic = topicOf(paper);
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
    if (state === 'stale') return (edge.origin === 'ai' ? t('Suggested connection') : t('Source record')) + t(' · recheck');
    return state === 'ai' ? t('Suggested connection') : state === 'source' ? t('Source check') : t('Source unchecked');
  }
  // Shared filters and counts; adapters own graph selection and keyboard navigation.
  function explorer(host, onChange, initialFilters = {}) {
    const root = element('div', 'graph-explorer'), controls = element('div', 'graph-explorer-controls');
    const filters = { category: 'all', kind: 'all', mode: 'focus', ...initialFilters };
    const selects = {};
    for (const [key, label, choices] of [
      ['category', t('Evidence status'), [['all',t('All statuses')],['source',t('Source check')],['ai',t('Suggested connection')],['stale',t('Recheck')],['pending',t('Source unchecked')]]],
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
    function update(papers, edges, selection, foldedCount = 0) {
      const eligible = edges.filter(edge => matchesRelation(edge, filters));
      const shown = edges.filter(edge => shownRelation(edge, filters, selection));
      const drawn = shown.length - foldedCount;
      const summary = foldedCount ? t('Focal paper relations shown only in the list: {count}. Select another paper to see its connections.', { count: foldedCount }) : '';
      status.textContent = t('Papers: {papers} · filtered relations: {eligible} / {total} · map connections: {shown}', { papers: papers.length, eligible: eligible.length, total: edges.length, shown: drawn }) + (!selection && filters.mode === 'focus' ? t(' · select a paper to show connections') : '') + (summary ? ' · ' + summary : '');
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
  function nodeDimensions(citations) {
    if (citations === undefined) return { width: card.width, height: card.height };
    const citationCap = 150_000;
    const fraction = Math.sqrt(Math.min(citations, citationCap) / citationCap);
    // Leave at least 12 pixels between the largest nodes in the topic grid.
    return { width: 156 + 48 * fraction, height: card.height + 12 * fraction };
  }
  const icoreScale = {
    grades: new Map([
      ['A*', 'Flagship conference in its field'],
      ['A', 'Excellent conference in its field'],
      ['B', 'Good to very good conference'],
      ['C', 'Ranked conference meeting basic peer-review standards']
    ]),
    otherGrades: new Map([
      ['Australasian B', 'Regional B designation for an Australasian conference'],
      ['Australasian C', 'Regional C designation for an Australasian conference'],
      ['Unranked', 'The register lists this conference without an assigned rank']
    ]),
    description: 'ICORE ranks apply to full papers published in the main conference track.',
    sourceUrl: 'https://www.core.edu.au/conference-portal',
    sourceLabel: 'Open official ICORE rank definitions ↗'
  };
  const jcrScale = {
    grades: new Map([
      ['Q1', 'Top 25% of the category by JIF rank'],
      ['Q2', 'Above 25% through 50% by JIF rank'],
      ['Q3', 'Above 50% through 75% by JIF rank'],
      ['Q4', 'Below the top 75% by JIF rank']
    ]),
    description: 'JCR divides a journal’s Journal Impact Factor (JIF) rank by the number of journals in its subject category. Quartiles can differ by category.',
    sourceUrl: 'https://supportcenter.clarivate.com/s/article/Journal-Citation-Reports-Quartile-rankings-and-other-metrics?language=en_US',
    sourceLabel: 'Open Clarivate’s quartile definitions ↗'
  };
  const norwegianScale = {
    grades: new Map([
      ['Level 2', 'Academic publication venue approved at the highest level'],
      ['Level 1', 'Approved academic publication venue meeting the basic criteria']
    ]),
    otherGrades: new Map([
      ['Level 0', 'Not approved as an academic publication venue']
    ]),
    linkObservedGrades: true,
    sourceUrl: 'https://kanalregister.hkdir.no/en/informasjonsartikler/levels-and-changes-in-levels',
    sourceLabel: 'Open official Norwegian Register level definitions ↗'
  };
  const isIcore = scheme => /^(?:CORE|ICORE)$/i.test(scheme);
  const isJcr = scheme => /^JCR$/i.test(scheme);
  function venueRankScale(scheme) {
    if (isIcore(scheme)) return icoreScale;
    if (isJcr(scheme)) return jcrScale;
    if (/^Norwegian Register$/i.test(scheme)) return norwegianScale;
  }
  function linkedVenueRank(ranking, sources) {
    if (!ranking) return undefined;
    const venueUrl = sources.get(ranking.venue_source_id)?.url;
    const rankingUrl = sources.get(ranking.source_id)?.url;
    if (!venueUrl || !rankingUrl) return undefined;
    const scale = venueRankScale(ranking.scheme);
    if (scale === icoreScale) {
      const source = new URL(rankingUrl);
      if (venueUrl === rankingUrl || source.origin !== 'https://portal.core.edu.au' ||
          !/^\/conf-ranks\/\d+\/?$/.test(source.pathname) ||
          !(scale.grades.has(ranking.rank) || scale.otherGrades.has(ranking.rank))) return undefined;
      return { ...ranking, top_tier: ranking.rank === 'A*' };
    }
    if (scale === jcrScale) {
      if (!scale.grades.has(ranking.rank)) return undefined;
      return { ...ranking, top_tier: false };
    }
    if (scale === norwegianScale) return { ...ranking, top_tier: ranking.rank === 'Level 2' };
    return ranking;
  }
  function venueBadge(ranking, { includeScheme = true } = {}) {
    const badge = element('span', 'graph-venue-rank');
    if (!ranking) {
      badge.dataset.grade = 'unverified';
      badge.append(element('span', 'graph-venue-grade', t('Rank unverified')));
      badge.title = t('Rank unverified');
      return badge;
    }
    const { scheme, rank, top_tier: topTier } = ranking;
    const scale = venueRankScale(scheme);
    if (scale?.otherGrades?.has(rank)) badge.dataset.grade = 'status';
    else if (scale?.grades.has(rank)) badge.dataset.grade = rank;
    else if (topTier) badge.dataset.grade = 'top-tier';
    if (includeScheme) badge.append(element('span', 'graph-venue-scheme', scheme + ' '));
    badge.append(element('span', 'graph-venue-grade', rank));
    badge.title = scheme + ' ' + ranking.edition + ' · ' + rank;
    return badge;
  }
  function paperCard(paper, { width, height }) {
    const node = element('article', 'graph-paper');
    node.dataset.paperId = paper.id;
    node.style.width = width + 'px';
    node.style.height = height + 'px';
    const top = element('div', 'graph-paper-top');
    top.append(venueBadge(paper.venueRank));
    if (paper.reviewStatus === 'needs-recheck') {
      top.append(element('span', 'graph-paper-review', t('Recheck')));
    }
    const title = element('p', 'graph-paper-title', shortTitle(paper));
    title.title = paper.title;
    const date = element('p', 'graph-paper-date', paper.dateLabel);
    date.title = paper.dateLabel;
    node.append(top, title, date);
    if (paper.focal) {
      node.classList.toggle('is-focal', true);
      node.append(element('span', 'graph-focal-label', t('Focal paper')));
    }
    node.classList.toggle('is-undated', paper.undated === true);
    return node;
  }
  // Long single words ("Language", "Normalization") can overflow a two-line title; step the size down
  // until the title fits, keeping the ellipsis only as a last resort. The full title stays in the tooltip and detail.
  function fitTitles(cardElements) {
    for (const cardElement of cardElements) {
      const title = cardElement.querySelector('.graph-paper-title');
      if (!title) continue;
      title.style.fontSize = '';
      for (const size of [18, 16, 15]) {
        if (title.scrollHeight <= title.clientHeight + 1) break;
        title.style.fontSize = size + 'px';
      }
    }
  }
  function syncCard(cardElement, graphNode) {
    const position = graphNode.position();
    cardElement.hidden = graphNode.hasClass('hidden');
    cardElement.style.transform = `translate(${position.x - graphNode.width() / 2}px,${position.y - graphNode.height() / 2}px)`;
    for (const state of ['selected', 'connected', 'faded', 'hovered']) cardElement.classList.toggle('is-' + state, graphNode.hasClass(state));
  }
  function edgeStyles() {
    return [
      { selector: 'edge', style: { width: 1.8, 'line-color': colors.pending, 'target-arrow-color': colors.pending, 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'control-point-step-size': 64, 'arrow-scale': .9, 'overlay-opacity': 0, label: '' } },
      ...Object.entries(colors).map(([state, color]) => ({ selector: `edge[category="${state}"]`, style: { 'line-color': color, 'target-arrow-color': color, 'line-style': state === 'source' ? 'solid' : state === 'stale' ? 'dotted' : 'dashed' } })),
      { selector: 'edge.connected, edge.hovered', style: { width: 3 } },
      { selector: 'edge.faded', style: { opacity: .16 } },
      { selector: 'edge.display-hidden', style: { display: 'none' } },
      // Keep the route continuous; relation numbers belong in the list and reader.
      { selector: 'edge.selected', style: { width: 2.6, label: '' } }
    ];
  }
  window.DanseoGraph = Object.freeze({ card, kindNames, category, nodeDimensions, paperCard, fitTitles, topicOf, conceptPlan, syncCard, edgeStyles, freePositions, shortTitle, topicLayout, drawTopics, matchesRelation, shownRelation, relationState, explorer, venueRankScale, linkedVenueRank, venueBadge, isJcr });
})();
