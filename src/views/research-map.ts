// Canonical map projection: existing records become selectable elements; no domain writes.
(() => {
  'use strict';
  type MapData = import('../web/browser-types.js').MapData;
  type MapScene = import('../web/browser-types.js').MapScene;
  type MapElement = import('../web/browser-types.js').MapElement;
  type MapSelection = import('../web/browser-types.js').MapSelection;
  type MapController = import('../web/browser-types.js').MapController;
  type NodeItem = { id: string; title: string; short_title?: string; review_status?: string; decision?: { status: string; action?: string } };
  const kind: Record<string, string> = { cites: 'Cites', extends: 'Extends', compares: 'Compares', 'related-to': 'Related', 'reading-order': 'AI reading order' };
  function isComparison(data: MapData): data is import('../web/browser-types.js').ComparisonView {
    return data.mode === 'research-comparison';
  }
  function build(data: MapData, scene: MapScene): MapElement[] {
    const elements: MapElement[] = [];
    const project = data.mode === 'project-application';
    const addNode = (type: 'paper' | 'criterion' | 'application' | 'topic', item: NodeItem, index: number, count: number, column?: number): MapElement => {
      let position;
      if (scene === 'context') {
        const cols = Math.min(3, count);
        const row = Math.floor(index / cols);
        const col = row % 2 ? cols - 1 - index % cols : index % cols;
        position = { x: 110 + col * 240, y: 70 + row * 155 };
      } else if (project) position = { x: column === 0 ? 150 : 510, y: 100 + index * 165 };
      else position = count === 2 ? { x: 170 + index * 380, y: 190 } : { x: 360 + Math.cos(index / count * 2 * Math.PI) * 245, y: 230 + Math.sin(index / count * 2 * Math.PI) * 165 };
      const stateLabel = data.mode === 'research-comparison' ? '' : type === 'paper' ? '\nPaper review · ' + item.review_status : type === 'application' ? '\n' + item.decision?.status + ' · ' + (item.decision?.action ?? 'Unspecified') : '';
      const node: MapElement = { group: 'nodes', data: { id: type + ':' + item.id, recordId: item.id, type, label: (scene === 'context' ? String(index + 1).padStart(2, '0') + '  ' : '') + (item.short_title ?? item.title) + stateLabel, state: item.review_status ?? item.decision?.status ?? 'context' }, position };
      elements.push(node);
      return node;
    };
    if (isComparison(data)) {
      data.papers.forEach((item, i, all) => {
        const node = addNode('paper', item, i, all.length);
        node.position = { x: 150, y: 90 + i * 170 };
      });
      data.criteria.forEach((item, i, all) => {
        const node = addNode('criterion', item, i, all.length);
        node.position = { x: 520, y: 90 + i * 170 };
        item.groups.forEach(group => {
          const paper = data.papers.find(p => p.key === group.key);
          if (!paper) throw new Error('The comparison criterion has no matching paper.');
          if (group.claims.length) elements.push({ group: 'edges', data: { id: 'group:' + item.id + ':' + paper.id,
            source: 'paper:' + paper.id, target: 'criterion:' + item.id, type: 'grouping', recordId: item.id,
            label: '', origin: 'ai', state: 'proposed' } });
        });
      });
      const edgesByDirection = new Map<string, number>();
      for (const relation of data.relations) {
        const direction = JSON.stringify([relation.source, relation.target]);
        const peerIndex = edgesByDirection.get(direction) ?? 0;
        edgesByDirection.set(direction, peerIndex + 1);
        elements.push({ group: 'edges', data: {
          id: 'relation:' + relation.id, source: 'paper:' + relation.source, target: 'paper:' + relation.target,
          type: 'relation', recordId: relation.id, label: (kind[relation.kind] ?? relation.kind) + ' · ' + relation.origin_label,
          bend: 180 + 240 * peerIndex, label_offset_y: peerIndex % 2 ? 20 : -20,
          origin: relation.origin, state: relation.status } });
      }
    } else if (scene === 'context') {
      if (!data.project_context) throw new Error('Project context is missing.');
      data.project_context.items.forEach((item, i, all) => addNode('topic', item, i, all.length));
      data.project_context.links.forEach((link, i) => elements.push({ group: 'edges', data: { id: 'context:' + i, source: 'topic:' + link.source, target: 'topic:' + link.target, type: 'context-link', recordId: String(i), label: '', origin: 'ai', state: 'proposed' } }));
    } else {
      data.papers.forEach((item, i, all) => addNode('paper', item, i, all.length, 0));
      if (data.mode === 'project-application') {
        if (!data.applications) throw new Error('The project application list is missing.');
        data.applications.forEach((item, i, all) => {
          addNode('application', item, i, all.length, 1);
          for (const paper of data.papers) {
            const refs = item.claim_refs.filter(ref => ref.paper_id === paper.id);
            if (refs.length) elements.push({ group: 'edges', data: { id: 'reference:' + item.id + ':' + paper.id, source: 'paper:' + paper.id, target: 'application:' + item.id, type: 'reference', recordId: item.id, paperId: paper.id, label: 'Evidence reference · ' + refs.length + ' claims', origin: 'reference', state: item.decision.status } });
          }
        });
      } else {
        if (!data.relations) throw new Error('The paper relation list is missing.');
        data.relations.forEach((relation, i) => elements.push({ group: 'edges', data: { id: 'relation:' + relation.id, source: 'paper:' + relation.source, target: 'paper:' + relation.target, type: 'relation', recordId: relation.id, label: String(i + 1).padStart(2, '0') + ' · ' + kind[relation.kind] + (relation.needs_recheck ? ' · ' + (relation.origin === 'ai' ? 'AI proposal' : 'Source record') + ' · recheck' : ''), origin: relation.origin, state: relation.needs_recheck ? 'needs-recheck' : relation.status } }));
      }
    }
    return elements;
  }
  function isSelection(value: unknown): value is MapSelection {
    return typeof value === 'object' && value !== null && 'type' in value && 'recordId' in value
      && typeof value.recordId === 'string'
      && typeof value.type === 'string'
      && ['paper', 'criterion', 'relation', 'application', 'topic', 'grouping', 'reference', 'context-link'].includes(value.type)
      && (!('paperId' in value) || typeof value.paperId === 'string');
  }
  function mount(container: HTMLElement, data: MapData, scene: MapScene, onSelect: (selection: MapSelection) => void): MapController | null {
    if (typeof cytoscape !== 'function') return null;
    const comparisonStyle: import('cytoscape').StylesheetJson = data.mode === 'research-comparison' ? [
      { selector: 'edge[type="relation"]', style: { 'curve-style': 'unbundled-bezier', 'control-point-distances': 'data(bend)', 'control-point-weights': 0.5, 'text-margin-y': (edge: import('cytoscape').EdgeSingular) => Number(edge.data('label_offset_y')) } }
    ] : [];
    const cy = cytoscape({ container, elements: build(data, scene), layout: { name: 'preset', fit: true, padding: 32 }, minZoom: .25, maxZoom: 2.2,
      style: [
        { selector: 'node', style: { shape: 'round-rectangle', width: 176, height: 74, 'background-color': '#ffffff', 'border-width': 1.5, 'border-color': '#9aa9c5', label: 'data(label)', color: '#202631', 'font-family': 'Malgun Gothic, Noto Sans KR, sans-serif', 'font-size': 18, 'font-weight': 600, 'text-wrap': 'wrap', 'text-max-width': '152px', 'text-valign': 'center', 'text-halign': 'center', padding: '8px' } },
        { selector: 'node[type="application"]', style: { 'background-color': '#edf1ff', 'border-color': '#315be8' } },
        { selector: 'node[type="criterion"]', style: { 'background-color': '#edf1ff', 'border-color': '#315be8' } },
        { selector: 'edge', style: { width: 2, 'curve-style': 'bezier', 'control-point-step-size': 110, 'target-arrow-shape': 'triangle', 'arrow-scale': 1, 'line-color': '#89958b', 'target-arrow-color': '#89958b', label: 'data(label)', 'font-family': 'Malgun Gothic, sans-serif', 'font-size': 13, 'text-background-color': '#f7f8fb', 'text-background-opacity': 1, 'text-background-padding': '5px', 'text-rotation': 'none', color: '#606b7d' } },
        { selector: 'edge[origin="source"][state="source-checked"]', style: { 'line-color': '#245641', 'target-arrow-color': '#245641' } },
        { selector: 'edge[origin="ai"]', style: { 'line-color': '#7c659d', 'target-arrow-color': '#7c659d', 'line-style': 'dashed', color: '#6f508d' } },
        { selector: 'edge[state="needs-recheck"]', style: { 'line-color': '#a77d2e', 'target-arrow-color': '#a77d2e', 'line-style': 'dashed' } },
        { selector: 'edge[type="reference"]', style: { 'line-color': '#64776c', 'target-arrow-color': '#64776c', 'line-style': 'dotted' } },
        { selector: '.active', style: { 'border-width': 3, 'border-color': '#315be8', 'background-color': '#edf1ff', width: 4 } },
        { selector: 'node.active', style: { width: 176 } },
        { selector: 'edge.active', style: { width: 4 } },
        ...comparisonStyle
      ] });
    let interacted = false;
    const fit = (): void => {
      cy.resize();
      cy.fit(undefined, 32);
      if (cy.zoom() > 1.25) cy.zoom({ level: 1.25, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    };
    const wheel = () => { interacted = true; };
    container.addEventListener('wheel', wheel, { passive: true });
    cy.on('mousedown touchstart', () => { interacted = true; });
    cy.on('tap', 'node, edge', event => {
      // Cytoscape data() is untyped; forward only our selectable element contract.
      const value: unknown = event.target.data();
      if (isSelection(value)) onSelect(value);
    });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { cy.resize(); if (!interacted) fit(); }) : null;
    observer?.observe(container);
    fit();
    return {
      fit: () => { interacted = true; fit(); },
      zoom(factor) {
        interacted = true;
        cy.zoom({ level: Math.max(.25, Math.min(2.2, cy.zoom() * factor)),
          renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
      },
      select(type, id, paperId) {
        cy.elements().removeClass('active');
        cy.elements().filter(item => item.data('type') === type && (type === 'reference'
          ? id === item.data('recordId') + ':' + item.data('paperId') && item.data('paperId') === paperId
          : item.data('recordId') === id)).addClass('active');
      },
      destroy() {
        observer?.disconnect();
        container.removeEventListener('wheel', wheel);
        cy.destroy();
      }
    };
  }
  window.DanseoMap = { build, mount };
})();
