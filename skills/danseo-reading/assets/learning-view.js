(() => {
  'use strict';
  const t = window.DanseoText;
  const data = JSON.parse(document.getElementById('candidate').textContent);
  const concepts = new Map(data.concepts.map(concept => [concept.id, concept]));
  const sources = new Map(data.sources.map(source => [source.id, source]));
  const hashPrefix = '#concept=';
  const byId = id => document.getElementById(id);
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function conceptLink(id, className, selected) {
    const link = node('a', className, concepts.get(id).title);
    link.href = hashPrefix + id;
    if (selected) link.setAttribute('aria-current', 'true');
    return link;
  }
  function sourceLink(id) {
    const source = sources.get(id), link = node('a', '', source.title + ' ↗');
    link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    return link;
  }
  const nav = new Map();
  for (const [i, id] of data.reading_order.entries()) {
    const item = node('li'), link = node('a', 'concept-link');
    link.href = hashPrefix + id;
    link.append(node('span', 'index', String(i + 1).padStart(2, '0')), node('span', '', concepts.get(id).title));
    item.append(link); byId('concepts').append(item); nav.set(id, link);
  }
  byId('count').textContent = t('{count} concepts', { count: data.concepts.length });
  byId('view-label').textContent = data.view === 'map' ? t("Follow the connections") : t("Read in order");
  let selected;
  function select(id, focus = false) {
    if (!concepts.has(id)) id = data.start;
    selected = id;
    const concept = concepts.get(id), index = data.reading_order.indexOf(id);
    for (const [key, link] of nav) {
      if (key === id) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    }
    byId('position').textContent = t('CONCEPT {number}', { number: String(index + 1).padStart(2, '0') });
    byId('concept-title').textContent = concept.title;
    byId('summary').textContent = concept.summary;
    byId('explanation').replaceChildren(...concept.body.map(paragraph => node('p', 'body-paragraph', paragraph)));
    byId('example').textContent = concept.example;
    const connections = byId('connections'); connections.replaceChildren();
    const relations = data.relations.filter(relation => relation.from === id || relation.to === id);
    if (data.view === 'map' || relations.length) {
      const heading = node('h3', '', t("Connections for this concept")); heading.id = 'connections-title';
      connections.append(heading, node('p', 'section-note', t("Arrows show concept relationships, separately from the suggested reading order.")));
      if (!relations.length) connections.append(node('p', 'empty-relations', t("No relationships are registered for this concept. Missing relationships are not inferred.")));
      for (const relation of relations) {
        const row = node('div', 'relation');
        const meaning = node('div', 'relation-meaning', relation.label);
        meaning.append(node('span', 'direction', '→'), node('span', 'origin', relation.origin === 'ai' ? t("AI-suggested connection") : t("Connection checked against the source by an agent")));
        row.append(conceptLink(relation.from, 'relation-node', relation.from === id), meaning, conceptLink(relation.to, 'relation-node', relation.to === id));
        if (relation.evidence.length) {
          const evidence = node('p', 'relation-evidence', t("Relationship evidence: "));
          for (const source of relation.evidence) evidence.append(sourceLink(source));
          row.append(evidence);
        }
        connections.append(row);
      }
    }
    const sourceArea = byId('sources'); sourceArea.replaceChildren();
    if (!concept.evidence.length) sourceArea.append(node('p', 'no-evidence', t("No source evidence is linked to this explanation. Read it as AI background guidance.")));
    const sourceKinds = new Map(concept.evidence.map(sourceId => [sourceId, t("Concept evidence")]));
    for (const relation of relations) for (const sourceId of relation.evidence) {
      if (!sourceKinds.has(sourceId)) sourceKinds.set(sourceId, t("Relationship evidence"));
    }
    for (const [sourceId, kind] of sourceKinds) {
      const source = sources.get(sourceId), details = node('details', 'source');
      details.append(node('summary', '', source.title + ' · ' + kind + (source.verification === 'agent-checked' ? ' · ' + t('Agent-checked scope available') : ' · ' + t('Source not checked'))), node('p', '', source.locator), node('p', '', source.scope), node('p', '', source.verification === 'agent-checked' ? t("An agent checked the stated scope. This does not mean independent review, a full-paper review or reproduction.") : t("Source not checked. A link alone is not evidence of source reading.")), sourceLink(sourceId));
      sourceArea.append(details);
    }
    byId('previous').disabled = index === 0;
    byId('next').disabled = index === data.reading_order.length - 1;
    byId('current-count').textContent = (index + 1) + ' / ' + data.reading_order.length;
    byId('announcement').textContent = t('{title} selected. Concept {number}.', { title: concept.title, number: index + 1 });
    if (focus) byId('concept-title').focus();
  }
  function move(offset) {
    const index = data.reading_order.indexOf(selected) + offset;
    if (index >= 0 && index < data.reading_order.length) location.hash = hashPrefix + data.reading_order[index];
  }
  byId('previous').addEventListener('click', () => move(-1));
  byId('next').addEventListener('click', () => move(1));
  const hashId = () => location.hash.startsWith(hashPrefix) ? location.hash.slice(hashPrefix.length) : data.start;
  byId('skip').addEventListener('click', event => {
    event.preventDefault();
    byId('concept-title').focus();
  });
  window.addEventListener('hashchange', () => select(hashId(), true));
  select(hashId());
})();
