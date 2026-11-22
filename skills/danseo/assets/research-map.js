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
      data.papers.forEach((item, i, all) => addNode('paper', item, i, all.length, 0));
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
        data.concepts?.filter(item => linkedConcepts.has(item.id)).forEach((item, i, all) => addNode('concept', item, i, all.length));
        for (const background of data.backgrounds ?? []) elements.push(...backgroundEdges(background));
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
  function mountPapers(container, data, scene, onSelect, onFilter, paperState, venueRanks) {
    const presentation = window.DanseoGraph;
    const elements = build(data, scene);
    const hasCitationCounts = data.papers.some(paper => paper.citations !== undefined);
    const nodeSizes = new Map(data.papers.map(paper => [
      paper.id,
      presentation.nodeDimensions(hasCitationCounts ? paper.citations?.count ?? 0 : undefined)
    ]));
    const relations = new Map(data.relations.map(item => [item.id, item]));
    const startConcepts = new Set((data.backgrounds ?? []).filter(background => background.paper_id === data.start).map(background => background.concept_id));
    const concepts = elements.filter(item => item.data.type === 'concept')
      .sort((a, b) => Number(startConcepts.has(b.data.recordId)) - Number(startConcepts.has(a.data.recordId)));
    const paperOrder = concepts.length
      ? [data.papers.find(paper => paper.id === data.start), ...data.papers.filter(paper => paper.id !== data.start)]
      : data.papers;
    const layout = presentation.topicLayout(paperOrder);
    if (concepts.length) {
      const { column, row } = presentation.card;
      const paperPositions = Object.values(layout.positions);
      const right = Math.max(...paperPositions.map(position => position.x));
      const columns = Math.min(concepts.length, Math.max(2, Math.round(right / column) + 1));
      const conceptRow = 110;
      const insertHeight = Math.ceil(concepts.length / columns) * conceptRow;
      for (const position of paperPositions) if (position.y > 0) position.y += insertHeight;
      for (const heading of layout.headings) if (heading.y > 0) heading.y += insertHeight;
      concepts.forEach((item, index) => {
        layout.positions[item.data.id] = {
          x: (index % columns) * column,
          y: row + Math.floor(index / columns) * conceptRow
        };
      });
    }
    for (const item of elements) {
      if (item.data.type === 'concept') {
        item.position = paperState?.positions[item.data.id] ?? layout.positions[item.data.id];
        Object.assign(item.data, { width: 168, height: 62 });
      } else if (item.group === 'nodes') {
        item.position = paperState?.positions[item.data.id] ?? layout.positions[item.data.recordId];
        Object.assign(item.data, nodeSizes.get(item.data.recordId));
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
        { selector: 'node[type="concept"]', style: { shape: 'ellipse' } },
        ...presentation.edgeStyles(),
        { selector: 'edge[type="concept-need"]', style: { 'control-point-step-size': 80, 'line-dash-pattern': [10, 6] } },
        { selector: 'edge[type="background-reading"]', style: { 'control-point-step-size': 80, 'line-dash-pattern': [4, 4] } },
        { selector: 'edge[type="concept-need"].faded, edge[type="background-reading"].faded', style: { opacity: 1 } }
      ]
    });
    const layer = document.createElement('div'); layer.className = 'graph-decorations'; layer.setAttribute('aria-hidden', 'true');
    const world = document.createElement('div'); world.className = 'graph-world'; layer.append(world); container.append(layer);
    const cards = new Map();
    for (const paper of data.papers) {
      const venueRank = venueRanks?.get(paper.id);
      const card = presentation.paperCard({
        id: paper.id,
        title: paper.title,
        short_title: paper.short_title,
        reviewStatus: paper.review_status,
        dateLabel: paper.publication?.date.slice(0, 4) ?? t('First publication year unverified'),
        venueRank,
        focal: data.focal_paper_id === paper.id
      }, nodeSizes.get(paper.id));
      cards.set('paper:' + paper.id, card); world.append(card);
    }
    for (const item of concepts) {
      const card = document.createElement('div'); card.className = 'graph-concept';
      const title = data.concepts.find(concept => concept.id === item.data.recordId).title;
      const label = document.createElement('span'); label.textContent = title;
      card.append(label); card.title = title;
      card.style.width = item.data.width + 'px'; card.style.height = item.data.height + 'px';
      cards.set(item.data.id, card); world.append(card);
    }
    presentation.drawTopics(world, layout.headings);
    const host = document.createElement('div');
    if (concepts.length) (container.nextElementSibling ?? container).after(host); else container.before(host);
    let selection = null;
    const explorer = presentation.explorer(host, () => {
      if (selection?.type === 'relation' && !presentation.matchesRelation(relations.get(selection.id), explorer.filters)) {
        selection = null; onSelect({ type:'overview', recordId:'all' });
      }
      applyDisplay(); onFilter(edge => presentation.matchesRelation(edge, explorer.filters));
    }, paperState?.filters);
    function applyDisplay() {
      cy.edges('[type="relation"]').forEach(edge => edge.toggleClass('display-hidden', !presentation.shownRelation(relations.get(edge.data('recordId')), explorer.filters, selection)));
      explorer.update(data.papers, data.relations, selection);
      cy.elements().removeClass('selected connected faded');
      const item = selection && cy.getElementById(selection.type + ':' + selection.id);
      if (item?.length) {
        item.addClass('selected');
        let eligible = item.connectedEdges().filter(edge => !edge.hasClass('display-hidden'));
        if (selection.type === 'paper') {
          const ownBackgrounds = new Set(eligible.filter('[type="concept-need"]').map(edge => edge.data('backgroundId')));
          eligible = eligible.union(cy.edges('[type="background-reading"]').filter(edge => ownBackgrounds.has(edge.data('backgroundId'))));
        }
        const connected = item.isNode() ? item.union(eligible).union(eligible.connectedNodes()) : item.connectedNodes().union(item);
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
      cy.resize(); cy.fit(cy.nodes(), 60);
      if (initial && concepts.length && cy.width() < 520 && cy.zoom() < .8) {
        const start = cy.getElementById('paper:' + data.start).position();
        cy.viewport({ zoom: .8, pan: { x: cy.width() * .3 - start.x * .8, y: cy.height() / 4 - start.y * .8 } });
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
  window.DanseoMap = { build, mount };
})();
