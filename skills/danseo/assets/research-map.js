// Canonical map projection: existing records become selectable elements; no domain writes.
(() => {
  'use strict';
  const t = window.DanseoText ?? (text => text);
  const kind = { cites: t('Cites'), extends: t('Extends'), compares: t('Compares'), 'related-to': t('Related'), 'reading-order': t('Suggested reading order') };
  function backgroundEdges(background) {
    const concept = 'concept:' + background.concept_id;
    return [
      { id: 'concept-need:' + background.id, source: 'paper:' + background.paper_id, target: concept, type: 'concept-need', recordId: background.id, label: t('Explore concept') },
      ...background.readings.map(reading => ({
        id: 'background-reading:' + background.id + ':' + reading.paper_id, source: concept, target: 'paper:' + reading.paper_id,
        type: 'background-reading', recordId: background.id + ':' + reading.paper_id, paperId: reading.paper_id, label: t('Background reading')
      }))
    ].map(data => ({ group: 'edges', data: { ...data, backgroundId: background.id, origin: background.origin, state: background.status, category: 'ai' } }));
  }
  // Recipe-tier concepts (training, data, evaluation) fold out of the opening map, with readings nothing else uses.
  // Graph nodes (build) and paper cards (mountPapers) both read this, so a card never exists without its node.
  function folded(data) {
    const concepts = new Set((data.concepts ?? []).filter(item => item.tier === 'recipe').map(item => item.id));
    // With no concept pill left to draw, the map falls back to the plain topic layout and keeps every paper.
    const drawsConcepts = (data.backgrounds ?? []).some(background => !concepts.has(background.concept_id));
    if (!drawsConcepts) return { concepts, papers: new Set() };
    const kept = new Set([data.start, ...data.relations.flatMap(relation => [relation.source, relation.target])]);
    for (const background of data.backgrounds ?? []) {
      if (concepts.has(background.concept_id)) continue;
      kept.add(background.paper_id);
      for (const reading of background.readings) kept.add(reading.paper_id);
    }
    const papers = new Set((data.backgrounds ?? []).filter(background => concepts.has(background.concept_id))
      .flatMap(background => background.readings.map(reading => reading.paper_id)).filter(id => !kept.has(id)));
    return { concepts, papers };
  }
  function build(data, scene, backgroundId) {
    const elements = [], project = data.mode === 'project-application';
    const addNode = (type, item, index, count, column) => {
      let position;
      if (scene === 'background') {
        position = { x: 140 + column * 330, y: 100 + index * 165 };
      } else if (scene === 'context') {
        const cols = Math.min(3, count), row = Math.floor(index / cols), col = row % 2 ? cols - 1 - index % cols : index % cols;
        position = { x: 110 + col * 240, y: 70 + row * 155 };
      } else if (project) position = { x: column === 0 ? 150 : 510, y: 100 + index * 165 };
      else position = count === 2 ? { x: 170 + index * 380, y: 190 } : { x: 360 + Math.cos(index / count * 2 * Math.PI) * 245, y: 230 + Math.sin(index / count * 2 * Math.PI) * 165 };
      const focal = type === 'paper' && data.focal_paper_id === item.id;
      const stateLabel = type === 'concept' ? t('\nConcept') : type === 'paper' ? '\n' + (item.publication?.date.slice(0, 4) ?? t('Publication year unknown')) + (item.review_status === 'needs-recheck' ? '\n' + t('Evidence needs rechecking') : '') : type === 'application' ? '\n' + item.decision.status + ' · ' + (item.decision.action ?? t('Unspecified')) : '';
      const prefix = scene === 'context' ? String(index + 1).padStart(2, '0') + '  ' : scene === 'background' && focal ? t('Focal paper') + '\n' : '';
      elements.push({ group: 'nodes', data: { id: type + ':' + item.id, recordId: item.id, type, focal, label: prefix + (item.short_title ?? item.title) + stateLabel, state: item.review_status ?? item.decision?.status ?? 'context' }, position });
    };
    if (scene === 'background') {
      const background = data.backgrounds.find(item => item.id === backgroundId);
      const concept = data.concepts.find(item => item.id === background.concept_id);
      addNode('paper', data.papers.find(item => item.id === background.paper_id), 0, 1, 0);
      addNode('concept', concept, 0, 1, 1);
      background.readings.forEach((reading, i, all) => {
        addNode('paper', data.papers.find(item => item.id === reading.paper_id), i, all.length, 2);
      });
      elements.push(...backgroundEdges(background));
    } else if (scene === 'context') {
      data.project_context.items.forEach((item, i, all) => addNode('topic', item, i, all.length));
      data.project_context.links.forEach((link, i) => elements.push({ group: 'edges', data: { id: 'context:' + i, source: 'topic:' + link.source, target: 'topic:' + link.target, type: 'context-link', recordId: String(i), label: '', origin: 'ai', state: 'proposed' } }));
    } else {
      const hidden = project ? { concepts: new Set(), papers: new Set() } : folded(data);
      data.papers.filter(item => !hidden.papers.has(item.id)).forEach((item, i, all) => addNode('paper', item, i, all.length, 0));
      if (project) {
        data.applications.forEach((item, i, all) => {
          addNode('application', item, i, all.length, 1);
          for (const paper of data.papers) {
            const refs = item.claim_refs.filter(ref => ref.paper_id === paper.id);
            if (refs.length) elements.push({ group: 'edges', data: { id: 'reference:' + item.id + ':' + paper.id, source: 'paper:' + paper.id, target: 'application:' + item.id, type: 'reference', recordId: item.id, paperId: paper.id, label: t('Evidence reference · ') + refs.length + t(' claims'), origin: 'reference', state: item.decision.status } });
          }
        });
      } else {
        data.relations.forEach((relation, i) => elements.push({ group: 'edges', data: { id: 'relation:' + relation.id, source: 'paper:' + relation.source, target: 'paper:' + relation.target, type: 'relation', recordId: relation.id, label: String(i + 1).padStart(2, '0') + ' · ' + kind[relation.kind] + (relation.needs_recheck ? ' · ' + (relation.origin === 'ai' ? t('Suggested connection') : t('Source record')) + t(' · recheck') : ''), origin: relation.origin, state: relation.needs_recheck ? 'needs-recheck' : relation.status } }));
        const linkedConcepts = new Set((data.backgrounds ?? []).map(item => item.concept_id));
        data.concepts?.filter(item => linkedConcepts.has(item.id) && !hidden.concepts.has(item.id)).forEach((item, i, all) => addNode('concept', item, i, all.length));
        for (const background of data.backgrounds ?? []) {
          if (hidden.concepts.has(background.concept_id)) continue;
          elements.push(...backgroundEdges(background));
        }
      }
    }
    return elements;
  }
  function mount(container, data, scene, onSelect, onFilter = () => {}, backgroundId, paperState, venueRanks) {
    if (typeof cytoscape !== 'function') return null;
    if (data.mode === 'paper-relations' && scene !== 'background') return mountPapers(container, data, scene, onSelect, onFilter, paperState, venueRanks);
    const cy = cytoscape({ container, elements: build(data, scene, backgroundId), layout: { name: 'preset', fit: true, padding: 32 }, minZoom: .25, maxZoom: 2.2,
      style: [
        { selector: 'node', style: { shape: 'round-rectangle', width: 176, height: 74, 'background-color': '#ffffff', 'border-width': 1.5, 'border-color': '#9aa9c5', label: 'data(label)', color: '#202631', 'font-family': 'Malgun Gothic, Noto Sans KR, sans-serif', 'font-size': 18, 'font-weight': 600, 'text-wrap': 'wrap', 'text-max-width': 152, 'text-valign': 'center', 'text-halign': 'center', padding: 8 } },
        { selector: 'node[type="application"]', style: { 'background-color': '#edf1ff', 'border-color': '#315be8' } },
        { selector: 'node[type="concept"]', style: { shape: 'ellipse', 'background-color': '#f4effa', 'border-color': '#7c659d' } },
        { selector: 'node[?focal]', style: { height: 98, 'underlay-shape': 'round-rectangle', 'underlay-opacity': 1, 'underlay-color': '#27416b', 'underlay-padding': 4 } },
        { selector: 'edge', style: { width: 2, 'curve-style': 'bezier', 'control-point-step-size': 110, 'target-arrow-shape': 'triangle', 'arrow-scale': 1, 'line-color': '#89958b', 'target-arrow-color': '#89958b', label: 'data(label)', 'font-family': 'Malgun Gothic, sans-serif', 'font-size': 13, 'text-background-color': '#f7f8fb', 'text-background-opacity': 1, 'text-background-padding': 5, 'text-rotation': 'none', color: '#606b7d' } },
        { selector: 'edge[origin="source"][state="source-checked"]', style: { 'line-color': '#245641', 'target-arrow-color': '#245641' } },
        { selector: 'edge[origin="ai"]', style: { 'line-color': '#7c659d', 'target-arrow-color': '#7c659d', 'line-style': 'dashed', color: '#6f508d' } },
        { selector: 'edge[state="needs-recheck"]', style: { 'line-color': '#a77d2e', 'target-arrow-color': '#a77d2e', 'line-style': 'dashed' } },
        { selector: 'edge[type="reference"]', style: { 'line-color': '#64776c', 'target-arrow-color': '#64776c', 'line-style': 'dotted' } },
        { selector: '.active', style: { 'border-width': 3, 'border-color': '#315be8', 'background-color': '#edf1ff', width: 4 } },
        { selector: 'node.active', style: { width: 176 } },
        { selector: 'edge.active', style: { width: 4 } }
      ] });
    let interacted = false;
    const fit = () => { cy.resize(); cy.fit(undefined, 32); if (cy.zoom() > 1.25) cy.zoom({level:1.25,renderedPosition:{x:cy.width()/2,y:cy.height()/2}}); };
    const wheel = () => { interacted = true; };
    container.addEventListener('wheel', wheel, { passive: true });
    cy.on('mousedown touchstart', () => { interacted = true; });
    cy.on('tap', 'node, edge', event => onSelect(event.target.data()));
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { cy.resize(); if (!interacted) fit(); }) : null;
    observer?.observe(container); fit();
    return { fit: () => { interacted = true; fit(); }, zoom: factor => { interacted = true; cy.zoom({ level: Math.max(.25, Math.min(2.2, cy.zoom() * factor)), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); }, select(type, id, paperId) {
      cy.elements().removeClass('active');
      cy.elements().filter(item => item.data('type') === type && (type === 'reference' ? id === item.data('recordId') + ':' + item.data('paperId') && item.data('paperId') === paperId : item.data('recordId') === id)).addClass('active');
    }, destroy: () => { observer?.disconnect(); container.removeEventListener('wheel', wheel); cy.destroy(); } };
  }
  // First-map geometry: each concept sits in the topic column of its readings, with those papers indented below it.
  const tree = Object.freeze({
    indent: 24,          // readings sit this far right of their concept
    gap: 14,             // vertical space between stacked cards
    groupGap: 30,        // extra space before the next concept group
    conceptHeight: 52,
    line: 12,            // tree line x, measured from the column's left edge
    bus: -32,            // above the focal badge, which starts 22px above the top card
    headingTop: -102,    // leave room for a two-line heading above both routing lanes
    maxColumn: 560       // a topic stack taller than this wraps into a second column
  });
  // Where lines run, measured left of a card's column edge. Each kind keeps its own lane so lines do not merge.
  const route = Object.freeze({
    needGutter: 20,      // concept-need lines (focal paper → concept)
    linkGutter: 9,       // citations and links to a reading drawn under another concept
    linkLane: 12,        // links rise this far above the concept-need lane before crossing columns
    focalOutline: 7      // the focal card's outline extends this far beyond the card
  });
  const view = Object.freeze({ firstMapMinZoom: .72, narrowWidth: 520, narrowZoom: .8, padding: 108 });
  // Positions each card: plain papers first in their topic column, then each concept with its readings indented below.
  function conceptLayout(plan, paperOrder, nodeSizes) {
    const { width } = window.DanseoGraph.card;
    const topicOf = window.DanseoGraph.topicOf;
    // Citation-scaled cards are left-aligned, so the column step grows with the widest card to keep gutters clear.
    const column = Math.max(window.DanseoGraph.card.column, ...[...nodeSizes.values()].map(size => size.width + 32));
    const columns = new Map();
    for (const paper of paperOrder) {
      if (!columns.has(topicOf(paper))) columns.set(topicOf(paper), { papers: [], groups: [] });
      columns.get(topicOf(paper)).papers.push(paper.id);
    }
    for (const conceptId of plan.order) {
      columns.get(plan.topics.get(conceptId)).groups.push({ concept: 'concept:' + conceptId, papers: plan.groups.get(conceptId) });
    }
    const groupHeight = group => tree.conceptHeight + group.papers.reduce((sum, id) => sum + nodeSizes.get(id).height + tree.gap, tree.gap);
    const sizes = new Map(), positions = {}, headings = [];
    let slot = 0;
    for (const [title, { papers: ids, groups }] of columns) {
      let x = slot * column, y = 0;
      headings.push({ title, x, y: tree.headingTop });
      const place = (id, key, size, offset) => {
        positions[key] = { x: x + offset, y: y + size.height / 2 };
        sizes.set(id, size);
        y += size.height + tree.gap;
      };
      // Cards share the column's left edge so gutters stay straight when citation counts change card widths.
      for (const id of ids.filter(id => !plan.owner.has(id))) {
        place('paper:' + id, id, nodeSizes.get(id), (nodeSizes.get(id).width - width) / 2);
      }
      for (const group of groups) {
        // One crowded topic wraps into another column under the same heading instead of shrinking the whole map.
        // A single group never splits.
        const overflows = y > 0 && y + tree.groupGap + groupHeight(group) > tree.maxColumn;
        if (overflows) { slot += 1; x = slot * column; y = 0; }
        if (y > 0) y += tree.groupGap - tree.gap;
        place(group.concept, group.concept, { width, height: tree.conceptHeight }, 0);
        for (const id of group.papers) {
          const size = nodeSizes.get(id);
          // Indented cards keep the citation scale but never shrink below a one-word title (e.g. "Normalization").
          const cardWidth = Math.max(size.width - tree.indent, width - tree.indent);
          place('paper:' + id, id, { width: cardWidth, height: size.height, indent: tree.indent }, (cardWidth - width) / 2 + tree.indent);
        }
      }
      slot += 1;
    }
    return { positions, headings, sizes };
  }
  // Orthogonal routes run through column gutters and a shared lane above the columns, never across cards.
  function bends(edge) {
    const source = edge.source(), target = edge.target(), a = source.position(), b = target.position();
    // The column's left edge: indented readings and the focal outline are measured back to it.
    const columnEdge = node => node.position('x') - node.width() / 2 - (node.data('indent') ?? 0);
    const outline = node => node.data('focal') ? route.focalOutline : 0;
    if (edge.data('type') === 'background-reading' && !edge.data('free')) {
      return [[columnEdge(target) + tree.line, b.y]];
    }
    // A source can sit below another card. Leave its column sideways before changing rows.
    const need = edge.data('type') === 'concept-need';
    const gutter = need ? route.needGutter : route.linkGutter;
    const from = columnEdge(source) - gutter - outline(source);
    const to = columnEdge(target) - gutter - outline(target);
    // Same column: stay in one gutter, using the outer x so the line also clears a focal outline.
    if (Math.abs(columnEdge(source) - columnEdge(target)) < 1) {
      const x = Math.min(from, to);
      return [[x, a.y], [x, b.y]];
    }
    const lane = need ? tree.bus : tree.bus - route.linkLane;
    return [[from, a.y], [from, lane], [to, lane], [to, b.y]];
  }
  function routeEdge(edge) {
    const s = edge.source().position(), e = edge.target().position();
    const dx = e.x - s.x, dy = e.y - s.y, length = Math.hypot(dx, dy);
    if (length < 1) return;
    const points = bends(edge), weights = [], distances = [];
    for (const [x, y] of points) {
      weights.push(((x - s.x) * dx + (y - s.y) * dy) / (length * length));
      distances.push(((y - s.y) * dx - (x - s.x) * dy) / length);
    }
    const style = { 'curve-style': 'round-segments', 'segment-radius': 6, 'edge-distances': 'node-position', 'segment-weights': weights, 'segment-distances': distances };
    // Tree lines leave the concept's lower edge at the gutter.
    if (edge.data('type') === 'background-reading' && !edge.data('free')) style['source-endpoint'] = (points[0][0] - s.x) + 'px ' + edge.source().height() / 2 + 'px';
    edge.style(style);
  }
  function mountPapers(container, data, scene, onSelect, onFilter, paperState, venueRanks) {
    const presentation = window.DanseoGraph;
    const elements = build(data, scene);
    const hasCitationCounts = data.papers.some(paper => paper.citations !== undefined);
    const nodeSizes = new Map(data.papers.map(paper => [
      paper.id,
      presentation.nodeDimensions(hasCitationCounts ? paper.citations?.count ?? 0 : undefined)
    ]));
    const relations = new Map(data.relations.map(item => [item.id, item]));
    const plan = presentation.conceptPlan(data);
    const concepts = elements.filter(item => item.data.type === 'concept')
      .sort((a, b) => plan.order.indexOf(a.data.recordId) - plan.order.indexOf(b.data.recordId));
    const hiddenPapers = folded(data).papers;
    const shownPapers = data.papers.filter(paper => !hiddenPapers.has(paper.id));
    const paperOrder = concepts.length
      ? [data.papers.find(paper => paper.id === data.start), ...shownPapers.filter(paper => paper.id !== data.start)]
      : shownPapers;
    const layout = concepts.length ? conceptLayout(plan, paperOrder, nodeSizes) : presentation.topicLayout(paperOrder);
    // The concept a reading card hangs under, for tree lines; other links to it become free routes.
    const treeParent = paperId => plan.owner.has(paperId) ? 'concept:' + plan.owner.get(paperId) : undefined;
    for (const item of elements) {
      if (item.data.type === 'concept') {
        item.position = paperState?.positions[item.data.id] ?? layout.positions[item.data.id];
        Object.assign(item.data, layout.sizes?.get(item.data.id) ?? { width: 168, height: 62 });
      } else if (item.group === 'nodes') {
        item.position = paperState?.positions[item.data.id] ?? layout.positions[item.data.recordId];
        Object.assign(item.data, layout.sizes?.get(item.data.id) ?? nodeSizes.get(item.data.recordId));
      } else if (item.data.type === 'background-reading' && concepts.length && treeParent(item.data.target.slice('paper:'.length)) !== item.data.source) {
        // A reading placed under another concept or topic keeps a free curve instead of a misleading tree line.
        item.data.free = true;
      } else if (item.data.type === 'relation') {
        const relation = relations.get(item.data.recordId);
        item.data.category = presentation.category(relation);
        item.data.number = String(data.relations.indexOf(relation) + 1).padStart(2, '0');
        item.data.label = String(data.relations.indexOf(relation) + 1).padStart(2, '0') + ' · ' + presentation.kindNames[relation.kind];
      }
    }
    container.classList.add('paper-map');
    const cy = cytoscape({ container, elements, layout: { name: 'preset' }, minZoom: .25, maxZoom: 2.5, wheelSensitivity: .2, boxSelectionEnabled: false,
      style: [
        { selector: 'node', style: { shape: 'roundrectangle', width: 'data(width)', height: 'data(height)', 'background-opacity': 0, 'border-width': 0, label: '', 'overlay-opacity': 0 } },
        { selector: 'node[type="concept"]', style: { shape: 'round-rectangle' } },
        ...presentation.edgeStyles(),
        { selector: 'edge[type="concept-need"]', style: { 'control-point-step-size': 80, 'line-dash-pattern': [10, 6] } },
        { selector: 'edge[type="background-reading"]', style: { 'control-point-step-size': 80, 'line-dash-pattern': [4, 4] } },
        { selector: 'edge[type="concept-need"].faded, edge[type="background-reading"].faded', style: { opacity: 1 } },
        { selector: 'edge[type="concept-need"].connected, edge[type="background-reading"].connected', style: { width: 2 } },
        { selector: 'edge[type="background-reading"][!free]', style: { 'target-arrow-shape': 'none', 'line-style': 'solid', 'line-color': '#b8acd0', width: 1.5 } }
      ]
    });
    const layer = document.createElement('div'); layer.className = 'graph-decorations'; layer.setAttribute('aria-hidden', 'true');
    const world = document.createElement('div'); world.className = 'graph-world'; layer.append(world); container.append(layer);
    const cards = new Map();
    for (const paper of shownPapers) {
      const venueRank = venueRanks?.get(paper.id);
      const card = presentation.paperCard({
        id: paper.id,
        title: paper.title,
        short_title: paper.short_title,
        reviewStatus: paper.review_status,
        dateLabel: (paper.publication?.date.slice(0, 4) ?? t('First publication year unverified')) + (concepts.length && plan.alsoRead(paper.id) ? ' · ' + t('Also read') : ''),
        venueRank,
        focal: data.focal_paper_id === paper.id
      }, layout.sizes?.get('paper:' + paper.id) ?? nodeSizes.get(paper.id));
      cards.set('paper:' + paper.id, card); world.append(card);
    }
    concepts.forEach((item, index) => {
      const card = document.createElement('div'); card.className = 'graph-concept';
      const title = data.concepts.find(concept => concept.id === item.data.recordId).title;
      const label = document.createElement('span'); label.textContent = title;
      const order = document.createElement('b'); order.className = 'graph-concept-order'; order.textContent = String(index + 1);
      card.append(order, label); card.title = title;
      if (plan.unread.has(item.data.recordId)) {
        // A required concept whose primary reading could not be secured: shown, but marked as a gap.
        const text = document.createElement('span'); text.className = 'graph-concept-gap';
        card.append(text); text.textContent = t('No reading secured');
        card.classList.add('is-unread'); card.title = title + ' · ' + t('No reading secured');
      }
      card.style.width = item.data.width + 'px'; card.style.height = item.data.height + 'px';
      cards.set(item.data.id, card); world.append(card);
    });
    presentation.drawTopics(world, layout.headings);
    // Measure after the cards are in the document, and again once web fonts settle.
    presentation.fitTitles(cards.values());
    document.fonts?.ready.then(() => presentation.fitTitles(cards.values()));
    if (concepts.length) {
      cy.edges().forEach(routeEdge);
      cy.on('position', 'node', event => event.target.connectedEdges().forEach(routeEdge));
    }
    const host = document.createElement('div');
    if (concepts.length) (container.nextElementSibling ?? container).after(host); else container.before(host);
    let selection = null;
    const explorer = presentation.explorer(host, () => {
      if (selection?.type === 'relation' && !presentation.matchesRelation(relations.get(selection.id), explorer.filters)) {
        selection = null; onSelect({ type:'overview', recordId:'all' });
      }
      applyDisplay(); onFilter(edge => presentation.matchesRelation(edge, explorer.filters));
    }, paperState?.filters);
    function freeEdgeIsRelevant(edge) {
      switch (selection?.type) {
        case 'concept': return edge.data('source') === 'concept:' + selection.id;
        case 'paper': return edge.data('target') === 'paper:' + selection.id;
        case 'background-reading': return edge.data('recordId') === selection.id;
        case 'concept-need': return edge.data('backgroundId') === selection.id;
        default: return false;
      }
    }
    function applyDisplay() {
      // On a first map the focal paper cites most readings; one summary replaces that fan of identical lines.
      const summarized = concepts.length && explorer.filters.mode === 'focus' && selection?.type === 'paper' && selection.id === data.focal_paper_id
        // Only outgoing relations fan out identically; follow-up papers that cite the focal paper keep their lines.
        ? data.relations.filter(edge => edge.source === selection.id && presentation.matchesRelation(edge, explorer.filters))
        : [];
      cy.edges('[type="relation"]').forEach(edge => {
        const relation = relations.get(edge.data('recordId'));
        edge.toggleClass('display-hidden', summarized.includes(relation) || !presentation.shownRelation(relation, explorer.filters, selection));
      });
      // A link to a reading drawn under another concept appears only while its concept, paper or path is selected.
      cy.edges('[type="background-reading"][?free]').forEach(edge => edge.toggleClass('display-hidden', !freeEdgeIsRelevant(edge)));
      explorer.update(data.papers, data.relations, selection, summarized.length);
      cy.elements().removeClass('selected connected faded');
      const item = selection && cy.getElementById(selection.type + ':' + selection.id);
      if (item?.length) {
        item.addClass('selected');
        let eligible = item.connectedEdges().filter(edge => !edge.hasClass('display-hidden'));
        if (selection.type === 'paper') {
          // A paper's concept readings stay outlined even when their free link is hidden,
          // the same way summarized relations keep their emphasis without a line.
          const ownBackgrounds = new Set(eligible.filter('[type="concept-need"]').map(edge => edge.data('backgroundId')));
          eligible = eligible.union(cy.edges('[type="background-reading"]').filter(edge => ownBackgrounds.has(edge.data('backgroundId'))));
        }
        // Summarized relations lose their lines, not their emphasis: related papers stay outlined.
        const summaryNodes = cy.edges('[type="relation"]').filter(edge => summarized.includes(relations.get(edge.data('recordId')))).connectedNodes();
        const connected = item.isNode() ? item.union(eligible).union(eligible.connectedNodes()).union(summaryNodes) : item.connectedNodes().union(item);
        connected.difference(item).addClass('connected');
        cy.elements().difference(connected).addClass('faded');
      }
      sync();
    }
    let frame = null, interacted = !!paperState;
    const sync = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const pan = cy.pan(); world.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${cy.zoom()})`;
        for (const [id, card] of cards) presentation.syncCard(card, cy.getElementById(id));
      });
    };
    const fit = ({ initial = false } = {}) => {
      cy.resize(); cy.fit(cy.nodes(), concepts.length ? view.padding : 60);
      if (initial && concepts.length && cy.width() < view.narrowWidth && cy.zoom() < view.narrowZoom) {
        // A phone opens on the start paper at a readable size.
        const node = cy.getElementById('paper:' + data.start), start = node.position(), zoom = view.narrowZoom;
        const centerY = Math.max(cy.height() / 4, (node.height() / 2 - tree.headingTop + tree.gap) * zoom);
        cy.viewport({ zoom, pan: { x: cy.width() * .3 - start.x * zoom, y: centerY - start.y * zoom } });
      } else if (initial && concepts.length && cy.zoom() < view.firstMapMinZoom) {
        // A large first map opens readable at its top-left (focal paper and first concepts); "Fit all" still shows everything.
        const box = cy.nodes().boundingBox(), zoom = view.firstMapMinZoom;
        cy.viewport({ zoom, pan: { x: view.padding - box.x1 * zoom, y: view.padding - box.y1 * zoom } });
      } else if (cy.zoom() > 1) {
        cy.zoom({ level: 1, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
      }
      sync();
    };
    const wheel = () => { interacted = true; };
    container.addEventListener('wheel', wheel, { passive: true });
    cy.on('mousedown touchstart', wheel);
    cy.on('render', sync);
    cy.on('tap', 'node, edge', event => onSelect(event.target.data()));
    cy.on('tap', event => { if (event.target === cy) onSelect({ type: 'overview', recordId: 'all' }); });
    cy.on('mouseover', 'node, edge', event => { event.target.addClass('hovered'); container.style.cursor = 'pointer'; sync(); });
    cy.on('mouseout', 'node, edge', event => { event.target.removeClass('hovered'); container.style.cursor = ''; sync(); });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (interacted) cy.resize(); else fit({ initial: true }); }) : null;
    observer?.observe(container); applyDisplay();
    if (paperState) {
      cy.zoom(paperState.zoom); cy.pan(paperState.pan); sync();
      onFilter(edge => presentation.matchesRelation(edge, explorer.filters));
    } else fit({ initial: true });
    return {
      snapshot: () => ({ filters: { ...explorer.filters }, zoom: cy.zoom(), pan: { ...cy.pan() }, positions: Object.fromEntries(cy.nodes().map(item => [item.id(), { ...item.position() }])) }),
      fit: () => { interacted = true; fit(); },
      zoom: factor => { interacted = true; cy.zoom({ level: Math.max(.25, Math.min(2.5, cy.zoom() * factor)), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); },
      select(type, id) {
        selection = type && id ? {type,id} : null;
        if (type === 'relation' && relations.has(id)) explorer.reveal(relations.get(id));
        applyDisplay();
      },
      destroy() {
        observer?.disconnect(); container.removeEventListener('wheel', wheel);
        if (frame !== null) cancelAnimationFrame(frame);
        cy.destroy();
        explorer.destroy(); host.remove(); layer.remove(); container.classList.remove('paper-map'); container.style.cursor = '';
      }
    };
  }
  window.DanseoMap = { build, mount, folded };
})();
