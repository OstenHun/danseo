// Canonical map projection: existing records become selectable elements; no domain writes.
(() => {
  'use strict';
  const kind = { cites: 'Cites', extends: 'Extends', compares: 'Compares', 'related-to': 'Related', 'reading-order': 'AI reading order' };
  function build(data, scene) {
    const elements = [], project = data.mode === 'project-application';
    const addNode = (type, item, index, count, column) => {
      let position;
      if (scene === 'context') {
        const cols = Math.min(3, count), row = Math.floor(index / cols), col = row % 2 ? cols - 1 - index % cols : index % cols;
        position = { x: 110 + col * 240, y: 70 + row * 155 };
      } else if (project) position = { x: column === 0 ? 150 : 510, y: 100 + index * 165 };
      else position = count === 2 ? { x: 170 + index * 380, y: 190 } : { x: 360 + Math.cos(index / count * 2 * Math.PI) * 245, y: 230 + Math.sin(index / count * 2 * Math.PI) * 165 };
      const stateLabel = type === 'paper' ? '\nPaper review · ' + item.review_status : type === 'application' ? '\n' + item.decision.status + ' · ' + (item.decision.action ?? 'Unspecified') : '';
      elements.push({ group: 'nodes', data: { id: type + ':' + item.id, recordId: item.id, type, label: (scene === 'context' ? String(index + 1).padStart(2, '0') + '  ' : '') + (item.short_title ?? item.title) + stateLabel, state: item.review_status ?? item.decision?.status ?? 'context' }, position });
    };
    if (scene === 'context') {
      data.project_context.items.forEach((item, i, all) => addNode('topic', item, i, all.length));
      data.project_context.links.forEach((link, i) => elements.push({ group: 'edges', data: { id: 'context:' + i, source: 'topic:' + link.source, target: 'topic:' + link.target, type: 'context-link', recordId: String(i), label: '', origin: 'ai', state: 'proposed' } }));
    } else {
      data.papers.forEach((item, i, all) => addNode('paper', item, i, all.length, 0));
      if (project) {
        data.applications.forEach((item, i, all) => {
          addNode('application', item, i, all.length, 1);
          for (const paper of data.papers) {
            const refs = item.claim_refs.filter(ref => ref.paper_id === paper.id);
            if (refs.length) elements.push({ group: 'edges', data: { id: 'reference:' + item.id + ':' + paper.id, source: 'paper:' + paper.id, target: 'application:' + item.id, type: 'reference', recordId: item.id, paperId: paper.id, label: 'Evidence reference · ' + refs.length + ' claims', origin: 'reference', state: item.decision.status } });
          }
        });
      } else data.relations.forEach((relation, i) => elements.push({ group: 'edges', data: { id: 'relation:' + relation.id, source: 'paper:' + relation.source, target: 'paper:' + relation.target, type: 'relation', recordId: relation.id, label: String(i + 1).padStart(2, '0') + ' · ' + kind[relation.kind] + (relation.needs_recheck ? ' · ' + (relation.origin === 'ai' ? 'AI proposal' : 'Source record') + ' · recheck' : ''), origin: relation.origin, state: relation.needs_recheck ? 'needs-recheck' : relation.status } }));
    }
    return elements;
  }
  function mount(container, data, scene, onSelect, onFilter = () => {}) {
    if (typeof cytoscape !== 'function') return null;
    if (data.mode === 'paper-relations') return mountPapers(container, data, scene, onSelect, onFilter);
    const cy = cytoscape({ container, elements: build(data, scene), layout: { name: 'preset', fit: true, padding: 32 }, minZoom: .25, maxZoom: 2.2,
      style: [
        { selector: 'node', style: { shape: 'round-rectangle', width: 176, height: 74, 'background-color': '#ffffff', 'border-width': 1.5, 'border-color': '#9aa9c5', label: 'data(label)', color: '#202631', 'font-family': 'Malgun Gothic, Noto Sans KR, sans-serif', 'font-size': 18, 'font-weight': 600, 'text-wrap': 'wrap', 'text-max-width': 152, 'text-valign': 'center', 'text-halign': 'center', padding: 8 } },
        { selector: 'node[type="application"]', style: { 'background-color': '#edf1ff', 'border-color': '#315be8' } },
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
  function mountPapers(container, data, scene, onSelect, onFilter) {
    const presentation = window.DanseoGraph;
    const elements = build(data, scene);
    const relations = new Map(data.relations.map(item => [item.id, item]));
    const layout = presentation.topicLayout(data.papers);
    for (const item of elements) {
      if (item.group === 'nodes') {
        item.position = layout.positions[item.data.recordId];
      } else {
        const relation = relations.get(item.data.recordId);
        item.data.category = presentation.category(relation);
        item.data.number = String(data.relations.indexOf(relation) + 1).padStart(2, '0');
        item.data.label = String(data.relations.indexOf(relation) + 1).padStart(2, '0') + ' · ' + presentation.kindNames[relation.kind];
      }
    }
    container.classList.add('paper-map');
    const cy = cytoscape({ container, elements, layout: { name: 'preset' }, minZoom: .25, maxZoom: 2.5, wheelSensitivity: .2, boxSelectionEnabled: false,
      style: [
        { selector: 'node', style: { shape: 'roundrectangle', width: presentation.card.width, height: presentation.card.height, 'background-opacity': 0, 'border-width': 0, label: '', 'overlay-opacity': 0 } },
        ...presentation.edgeStyles()
      ]
    });
    const layer = document.createElement('div'); layer.className = 'graph-decorations'; layer.setAttribute('aria-hidden', 'true');
    const world = document.createElement('div'); world.className = 'graph-world'; layer.append(world); container.append(layer);
    const cards = new Map();
    for (const paper of data.papers) {
      const card = presentation.paperCard({ id: paper.id, title: paper.title, short_title: paper.short_title, reviewStatus: paper.review_status, dateLabel: 'Date not provided' });
      cards.set(paper.id, card); world.append(card);
    }
    presentation.drawTopics(world, layout.headings);
    const host = document.createElement('div'); container.before(host);
    let selection = null;
    const explorer = presentation.explorer(host, () => {
      if (selection?.type === 'relation' && !presentation.matchesRelation(relations.get(selection.id), explorer.filters)) {
        selection = null; onSelect({ type:'overview', recordId:'all' });
      }
      applyDisplay(); onFilter(edge => presentation.matchesRelation(edge, explorer.filters));
    }, (type,id) => onSelect({type,recordId:id}), 'item-title');
    function applyDisplay() {
      cy.edges().forEach(edge => edge.toggleClass('display-hidden', !presentation.shownRelation(relations.get(edge.data('recordId')), explorer.filters, selection)));
      explorer.update(data.papers, data.relations, selection);
      cy.elements().removeClass('selected connected faded');
      const item = selection && cy.getElementById(selection.type + ':' + selection.id);
      if (item?.length) {
        item.addClass('selected');
        const eligible = item.connectedEdges().filter(edge => !edge.hasClass('display-hidden'));
        const connected = item.isNode() ? item.union(eligible).union(eligible.connectedNodes()) : item.connectedNodes().union(item);
        connected.difference(item).addClass('connected');
        cy.elements().difference(connected).addClass('faded');
      }
      sync();
    }
    let frame = null, interacted = false;
    const sync = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const pan = cy.pan(); world.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${cy.zoom()})`;
        for (const [id, card] of cards) presentation.syncCard(card, cy.getElementById('paper:' + id));
      });
    };
    const fit = () => { cy.resize(); cy.fit(cy.nodes(), 60); if (cy.zoom() > 1) cy.zoom({ level: 1, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); sync(); };
    const wheel = () => { interacted = true; };
    container.addEventListener('wheel', wheel, { passive: true });
    cy.on('mousedown touchstart', wheel);
    cy.on('render', sync);
    cy.on('tap', 'node, edge', event => onSelect(event.target.data()));
    cy.on('tap', event => { if (event.target === cy) onSelect({ type: 'overview', recordId: 'all' }); });
    cy.on('mouseover', 'node, edge', event => { event.target.addClass('hovered'); container.style.cursor = 'pointer'; sync(); });
    cy.on('mouseout', 'node, edge', event => { event.target.removeClass('hovered'); container.style.cursor = ''; sync(); });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { cy.resize(); if (!interacted) fit(); }) : null;
    observer?.observe(container); applyDisplay(); fit();
    return {
      fit: () => { interacted = true; fit(); },
      zoom: factor => { interacted = true; cy.zoom({ level: Math.max(.25, Math.min(2.5, cy.zoom() * factor)), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); },
      select(type, id) {
        selection = ['paper','relation'].includes(type) ? {type,id} : null;
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
