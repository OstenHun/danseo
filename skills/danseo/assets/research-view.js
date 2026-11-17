(() => {
  'use strict';
  const t = window.DanseoText ?? (text => text);
  const byId = id => document.getElementById(id);
  const data = JSON.parse(byId('candidate').textContent);
  const projectMode = data.mode === 'project-application';
  const papers = new Map(data.papers.map(paper => [paper.id, paper]));
  const sources = new Map(data.sources.map(source => [source.id, source]));
  const concepts = new Map((data.concepts ?? []).map(item => [item.id, item]));
  const backgrounds = new Map((data.backgrounds ?? []).map(item => [item.id, item]));
  const items = projectMode ? data.applications : data.papers;
  const prefix = projectMode ? '#application=' : '#paper=';
  const topics = new Map((data.project_context?.items ?? []).map(item => [item.id, item]));
  const paperName = id => papers.get(id).short_title ?? papers.get(id).title;
  let scene = projectMode && data.map_view === 'context' ? 'context' : projectMode ? 'applications' : 'papers';
  let map, activeBackground, paperMapState, selectedType = projectMode ? 'application' : 'paper';
  const reviewLabels = { draft: t('Source review incomplete · draft'), 'source-checked': t('Card source-check record · source-checked'), 'needs-recheck': t('Card needs rechecking · needs-recheck') };
  const kindLabels = { cites: t('Cites'), extends: t('Extends'), compares: t('Compares'), 'related-to': t('Related connection'), 'reading-order': t('Suggested reading order') };
  function node(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  const p = value => node('p', '', value);
  function section(title, cls = '') { const el = node('section', 'research-section ' + cls); el.append(node('h3', '', title)); return el; }
  function badge(value, warning = false) { return node('span', warning ? 'badge warning' : 'badge', value); }
  function paragraphs(parent, values, empty) {
    if (!values.length) parent.append(node('p', 'empty-note', empty));
    else for (const value of values) parent.append(p(value));
  }
  function evidence(parent, evidenceIds) {
    if (!evidenceIds.length) { parent.append(node('p', 'empty-note', t('No linked source location · source coverage is not inferred.'))); return; }
    for (const id of evidenceIds) {
      const source = sources.get(id), detail = node('details', 'source');
      detail.append(node('summary', '', source.title + (source.verification === 'agent-checked' ? t(' · Agent-reported check scope') : data.version === 2 ? t(' · No source check in this run') : t(' · Source unchecked'))),
        p(t('Location: ') + source.locator), p(t('Check scope: ') + source.scope),
        p(t('Check status is declared by the recorder. It does not establish full-paper reading, independent review or reproduction.')));
      if (source.url !== null) {
        const link = node('a', '', t('Open original source ↗')); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link);
      } else detail.append(p(t('No external link recorded · use the specified local original.')));
      parent.append(detail);
    }
  }
  function appendPaperSources(parent, paper) {
    appendSourceLinks(parent, paper.title, paper.claims.flatMap(claim => claim.evidence));
  }
  function appendSourceLinks(parent, paperTitle, evidenceIds) {
    const linked = new Map();
    for (const id of evidenceIds) {
      const source = sources.get(id);
      if (source.url !== null) {
        if (!linked.has(source.url)) linked.set(source.url, { source, locators: new Set() });
        linked.get(source.url).locators.add(source.locator);
      }
    }
    if (!linked.size) return;
    const reading = section(t('Read the paper'), 'paper-source-links');
    for (const { source, locators } of linked.values()) {
      const link = node('a', 'map-item', t('Open original source ↗'));
      link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', t('{paper} · {source} · open original source · new tab', { paper: paperTitle, source: source.title }));
      reading.append(link, node('p', 'section-note', t('Read at: {locations}', { locations: [...locators].join(' / ') })));
    }
    parent.append(reading);
  }
  function claims(parent, refs) {
    for (const ref of refs) {
      const paper = papers.get(ref.paper_id), claim = paper.claims.find(c => c.id === ref.claim_id);
      const block = node('div', 'claim');
      block.append(node('p', 'claim-id', paper.id + ' / ' + claim.id), node('h4', '', paper.title), badge(reviewLabels[paper.review_status], paper.review_status === 'needs-recheck'), p(t('Edition: ') + (paper.edition ?? t('Not recorded'))), p(claim.statement));
      if (claim.conditions.length) { const conditions = section(t('Paper conditions')); paragraphs(conditions, claim.conditions, ''); block.append(conditions); }
      if (claim.limitations.length) { const limitations = section(t('Paper limits')); paragraphs(limitations, claim.limitations, ''); block.append(limitations); }
      if (!claim.conditions.length && !claim.limitations.length) block.append(node('p', 'empty-note', t('No separate conditions or limits are recorded. Read the relation rationale and original card context together.')));
      evidence(block, claim.evidence); parent.append(block);
      for (const review of claim.reviews ?? []) {
        const record = node('div', 'review-record');
        record.append(badge(t('Claim review · ') + review.verdict + (review.state === 'stale' ? t(' · Needs rechecking') : review.state === 'unknown' ? t(' · Current validity unknown') : ''), review.state !== 'current'), p(review.reason));
        const more = node('details'); more.append(node('summary', '', t('Source evidence and review record')), p(review.scope), p(review.reviewer + ' · ' + review.reviewed_at + ' · ' + review.review_type)); record.append(more); block.append(record);
      }
    }
  }
  function appendNotes(parent, notes) {
    for (const note of notes) {
      const lines = note.split('\n'), heading = /^## +(.+)$/.exec(lines[0]), block = node('section','paper-note-section');
      if (heading) block.append(node('h4','',heading[1]));
      block.append(node('p','paper-note',heading ? lines.slice(1).join('\n').trim() : note)); parent.append(block);
    }
  }
  const nav = new Map();
  function localLink(type, id, title, cls) { const a = node('a', cls, title); a.href = '#' + type + '=' + encodeURIComponent(id); return a; }
  function mountMap(nextScene) {
    activeBackground = undefined;
    map?.destroy(); scene = nextScene; nav.clear(); byId('items').replaceChildren(); byId('map-links').replaceChildren();
    byId('research-map').className = scene === 'context' ? 'context-map' : '';
    const listed = scene === 'context' ? data.project_context.items : projectMode ? [...data.papers, ...items] : items;
    for (const [i, item] of listed.entries()) {
      const type = scene === 'context' ? 'topic' : data.papers.includes(item) ? 'paper' : 'application';
      const li = node('li'), a = localLink(type, item.id, item.short_title ?? item.title, 'map-item'); li.append(a); byId('items').append(li); nav.set(type + ':' + item.id, a);
    }
    byId('count').textContent = t('{count} items', { count: listed.length });
    byId('node-kind').textContent = scene === 'context' ? t('Concepts') : projectMode ? t('Projects · papers') : t('Paper');
    byId('map-node-navigation').setAttribute('aria-label', scene === 'context' ? t('Concept list') : projectMode ? t('Projects and papers') : t('Paper list'));
    byId('map-heading').textContent = scene === 'context' ? data.project_context.title : projectMode ? t('Current question and paper evidence') : t('Connections between papers');
    byId('map-notice').textContent = scene === 'context' ? data.project_context.notice : projectMode ? t('Dashed lines are claim references recorded in an Application. They do not establish causal or performance inheritance.') : t('Check relation types and both endpoints before selecting an edge or the corresponding record in the list.');
    byId('map-legend').textContent = scene === 'context' ? t('Purple dashed lines · AI-proposed reading order. Opening an item does not record understanding.') : projectMode ? t('Dashed lines · project evidence references. Paper review and project decisions are separate.') : t('Green solid · source-check record / purple dashed · AI proposal / amber dashed · recheck');
    const links = scene === 'context' ? data.project_context.links : projectMode ? items.flatMap(app => data.papers.filter(paper => app.claim_refs.some(ref => ref.paper_id === paper.id)).map(paper => ({ app, paper }))) : data.relations;
    byId('map-links').append(node('h3', '', scene === 'context' ? t('Suggested order and connection rationale') : projectMode ? t('Corresponding evidence references') : t('Corresponding relations')));
    if (!links.length) byId('map-links').append(node('p', 'empty-note', t('No registered relations · disconnected items are still shown.')));
    links.forEach((item, index) => {
      let type, id, title, sub;
      if (scene === 'context') { type = 'context-link'; id = String(index); title = topics.get(item.source).title + ' → ' + topics.get(item.target).title; sub = item.label + t(' · AI-proposed reading order'); }
      else if (projectMode) { type = 'reference'; id = item.app.id + ':' + item.paper.id; title = paperName(item.paper.id) + ' → ' + item.app.title; sub = item.app.claim_refs.filter(ref => ref.paper_id === item.paper.id).length + t(' claims · compare with project conditions'); }
      else { type = 'relation'; id = item.id; title = paperName(item.source) + ' → ' + paperName(item.target) + ' · ' + kindLabels[item.kind]; sub = (item.origin === 'ai' ? t('AI proposal') : t('Source-based record')) + ' · ' + item.status + (item.needs_recheck ? t(' · Needs rechecking') : ''); }
      const a = localLink(type, id, undefined, 'map-link'), body = node('span', '', title); body.append(node('span', 'link-subtitle', sub)); a.append(node('span', 'index', String(index + 1).padStart(2, '0')), body); byId('map-links').append(a); nav.set(type + ':' + id, a);
    });
    map = window.DanseoMap?.mount(byId('research-map'), data, scene, item => { const id = item.type === 'reference' ? item.recordId + ':' + item.paperId : item.recordId; location.hash = '#' + item.type + '=' + encodeURIComponent(id); }, matches => {
      for (const relation of data.relations ?? []) { const link = nav.get('relation:' + relation.id); if (link) link.hidden = !matches(relation); }
    }, undefined, paperMapState);
    byId('map-status').textContent = map ? t('Drag nodes · pan background · wheel/buttons to zoom · fit all') : t('Unable to load the map. Use the corresponding records below to navigate.');
    for (const button of byId('scene-controls').children) button.setAttribute('aria-pressed', String(button.scene === scene));
  }
  const backgroundNotice = t('Optional background · AI selection, not a citation, first-invention claim or required reading. The map is limited to registered items, not an exhaustive prerequisite map.');
  function mountBackground(background) {
    if (scene === 'background' && activeBackground === background.id) return;
    if (scene === 'papers') paperMapState = map?.snapshot?.();
    map?.destroy(); scene = 'background'; activeBackground = background.id; nav.clear();
    byId('items').replaceChildren(); byId('map-links').replaceChildren(); byId('research-map').className = '';
    const concept = concepts.get(background.concept_id);
    const addItem = (type, id, key, title) => {
      const li = node('li'), link = localLink(type, id, title, 'map-item'); li.append(link); byId('items').append(li); nav.set(key, link);
    };
    addItem('paper', background.paper_id, 'paper:' + background.paper_id, t('Current paper · ') + paperName(background.paper_id));
    addItem('background', background.id, 'concept:' + concept.id, t('Concept · ') + concept.title);
    for (const reading of background.readings) addItem('background-paper', background.id + ':' + reading.paper_id, 'paper:' + reading.paper_id, t('Representative reading · ') + paperName(reading.paper_id));
    byId('count').textContent = t('{count} items', { count: background.readings.length + 2 });
    byId('node-kind').textContent = t('Papers and concept'); byId('map-node-navigation').setAttribute('aria-label', t('Concept background items'));
    byId('map-heading').textContent = t('Concept background · ') + concept.title;
    byId('map-notice').textContent = backgroundNotice;
    byId('map-legend').textContent = t('Paper rectangles · concept ellipse / dashed lines · AI learning connections');
    byId('map-links').append(localLink('paper', background.paper_id, t('Return to paper relationships · ') + paperName(background.paper_id), 'map-item'));
    map = window.DanseoMap?.mount(byId('research-map'), data, scene, item => {
      if (item.type === 'paper' && item.recordId === background.paper_id) location.hash = '#paper=' + encodeURIComponent(background.paper_id);
      else if (item.type === 'paper' || item.type === 'background-reading') location.hash = '#background-paper=' + encodeURIComponent(background.id + ':' + (item.paperId ?? item.recordId));
      else location.hash = '#background=' + encodeURIComponent(background.id);
    }, () => {}, background.id);
    byId('map-status').textContent = map ? t('Drag nodes · pan background · wheel/buttons to zoom · fit all') : t('Unable to load the map. Use the matching concept background items to navigate.');
  }
  function appendConceptChoices(parent, paper) {
    const linked = [...backgrounds.values()].filter(item => item.paper_id === paper.id);
    if (!linked.length) return;
    const sectionNode = section(t('Concepts to explore · AI proposals'));
    sectionNode.append(node('p', 'origin-note', backgroundNotice));
    for (const item of linked) sectionNode.append(localLink('background', item.id, t('Explore background · ') + concepts.get(item.concept_id).title, 'map-item'));
    parent.append(sectionNode);
  }
  function showBackground(id, focus) {
    const background = backgrounds.get(id); if (!background) return false;
    const concept = concepts.get(background.concept_id); mountBackground(background);
    const content = byId('content'), meta = byId('metadata'); content.replaceChildren(); meta.replaceChildren();
    byId('position').textContent = t('CONCEPT BACKGROUND · ') + id; byId('item-title').textContent = concept.title;
    meta.append(badge(t('AI explanation and representative selection · proposed')));
    content.append(node('p', 'origin-note', backgroundNotice), p(concept.summary));
    const reason = section(t('Why explore this concept from ') + paperName(background.paper_id)); reason.append(p(background.rationale)); content.append(reason);
    for (const reading of background.readings) {
      const block = section(t('Representative reading · ') + paperName(reading.paper_id));
      block.append(p(reading.rationale), localLink('background-paper', id + ':' + reading.paper_id, t('Read selected background · ') + paperName(reading.paper_id), 'map-item'));
      appendSourceLinks(block, papers.get(reading.paper_id).title, reading.evidence);
      for (const sourceId of reading.evidence) { const source = sources.get(sourceId); if (source.url === null) block.append(p(t('Read at: ') + source.locator)); }
      evidence(block, reading.evidence);
      block.append(p(t('Return and compare · AI question: ') + reading.return_question)); content.append(block);
    }
    content.append(localLink('paper', background.paper_id, t('Return to current paper · ') + paperName(background.paper_id), 'map-item'));
    selectedType = 'background'; selected = id; byId('previous').disabled = true; byId('next').disabled = true; byId('current-count').textContent = t('Explore only what you need');
    highlight('concept', concept.id); byId('announcement').textContent = t('{title} background selected', { title: concept.title });
    if (focus) byId('item-title').focus(); return true;
  }
  function showBackgroundPaper(compositeId, focus) {
    const [backgroundId, paperId, extra] = compositeId.split(':'), background = backgrounds.get(backgroundId);
    const reading = background?.readings.find(item => item.paper_id === paperId);
    if (extra || !reading) return false;
    mountBackground(background); select(paperId, focus, undefined, { background, reading });
    byId('previous').disabled = true; byId('next').disabled = true; byId('current-count').textContent = t('Optional background reading');
    return true;
  }
  if (projectMode && data.project_context) for (const [value, title] of [['context', data.project_context.title], ['applications', t('Project–paper connections')]]) {
    const button = node('button', '', title); button.type = 'button'; button.scene = value;
    button.addEventListener('click', () => { location.hash = value === 'context' ? '#topic=' + encodeURIComponent(data.project_context.start) : '#application=' + encodeURIComponent(data.start); }); byId('scene-controls').append(button);
  }
  if (!projectMode) byId('scene-controls').append(localLink('overview', 'all', t('Relation overview'), 'map-item'));
  for (const item of data.provenance ?? []) byId('provenance').append(p(item.name + ' · SHA-256 ' + item.sha256));
  let selected;
  function select(id, focus = false, onlyPaper, backgroundReading) {
    if (scene === 'context') mountMap(projectMode ? 'applications' : 'papers');
    const item = items.find(item => item.id === id) ?? items.find(item => item.id === data.start);
    selected = item.id; const index = items.indexOf(item);
    selectedType = projectMode ? 'application' : 'paper'; highlight(selectedType, selected);
    byId('position').textContent = (projectMode ? t('APPLICATION · ') : t('PAPER · ')) + item.id;
    byId('item-title').textContent = item.title;
    const meta = byId('metadata'), content = byId('content'); meta.replaceChildren(); content.replaceChildren();
    if (projectMode) {
      if (onlyPaper) {
        byId('item-title').textContent = paperName(onlyPaper) + t(' · evidence linked to this question');
        meta.append(badge(reviewLabels[papers.get(onlyPaper).review_status], papers.get(onlyPaper).review_status === 'needs-recheck'));
      }
      meta.append(badge(t('Project decision · ') + item.decision.status), badge(t('Planned action · ') + (item.decision.action ?? t('Unspecified'))));
      const context = section(t('Project conditions')); paragraphs(context, data.project.conditions, t('Project conditions not recorded'));
      if (item.conditions_comparison?.length) { const comparison = section(t('Differences between paper and project conditions'), 'trace-comparison'); paragraphs(comparison, item.conditions_comparison, ''); context.append(comparison); }
      const refs = section(t('Application evidence · paper claims and conditions')); claims(refs, item.claim_refs.filter(ref => !onlyPaper || ref.paper_id === onlyPaper));
      const interpretation = section(t('Reading for the project · AI interpretation'), 'interpretation'); interpretation.append(p(item.interpretation));
      const observation = section(t('Project observations'), 'observation'); paragraphs(observation, item.observations, t('No observations recorded · execution and results are unknown.'));
      const checks = section(t('Next checks · AI proposals'), 'checks'); paragraphs(checks, item.next_checks, t('No next-check proposals recorded'));
      const decision = section(t('Adoption decision record'), 'decision');
      decision.append(p(t('Status: ') + item.decision.status + t(' · action: ') + (item.decision.action ?? t('Unspecified'))), p(item.decision.rationale), node('p', 'section-note', t('Project adoption does not establish source verification or experiment reproduction.')));
      content.append(context, refs, interpretation, observation, checks, decision);
    } else {
      meta.append(badge(reviewLabels[item.review_status], item.review_status === 'needs-recheck'), badge(t('Edition · ') + (item.edition ?? t('Not recorded'))));
      appendPaperSources(content, item);
      if (backgroundReading) {
        const { background, reading } = backgroundReading, returning = section(t('Return and compare · AI question'));
        returning.append(p(reading.return_question), localLink('paper', background.paper_id, t('Return to current paper · ') + paperName(background.paper_id), 'map-item'), localLink('background', background.id, t('Return to concept background · ') + concepts.get(background.concept_id).title, 'map-item'));
        content.append(returning);
      } else appendConceptChoices(content, item);
      const incident = data.relations.filter(r => r.source === item.id || r.target === item.id);
      const connections = section(t('Connections for this paper'));
      if (!incident.length) connections.append(node('p', 'empty-note', t('No linked relations recorded · this does not establish that no relations exist.')));
      for (const relation of incident) connections.append(localLink('relation', relation.id, paperName(relation.source) + ' → ' + paperName(relation.target) + ' · ' + kindLabels[relation.kind], 'map-item'));
      content.append(connections);
      if (item.notes?.length) { const notes = section(t('Card conditions, comparisons and interpretations')); appendNotes(notes, item.notes); content.append(notes); }
      const own = section(t('Claims and source locations for this paper'));
      if (!item.claims.length) own.append(node('p', 'empty-note', t('No claims recorded')));
      claims(own, item.claims.map(claim => ({ paper_id: item.id, claim_id: claim.id }))); content.append(own);
    }
    byId('previous').disabled = index === 0; byId('next').disabled = index === items.length - 1;
    byId('current-count').textContent = (index + 1) + ' / ' + items.length;
    byId('announcement').textContent = t('{title} selected', { title: byId('item-title').textContent });
    if (focus) byId('item-title').focus();
  }
  function highlight(type, id, paperId) {
    for (const [key, a] of nav) { if (key === type + ':' + id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }
    map?.select(type, id, paperId);
  }
  function showProjectPaper(id, focus) {
    const paper = papers.get(id); if (!paper) return false;
    if (scene !== 'applications') mountMap('applications');
    const content = byId('content'), meta = byId('metadata'); content.replaceChildren(); meta.replaceChildren();
    byId('position').textContent = t('PAPER · ') + paper.id; byId('item-title').textContent = paper.title;
    meta.append(badge(reviewLabels[paper.review_status], paper.review_status === 'needs-recheck'), badge(t('Edition · ') + (paper.edition ?? t('Not recorded'))));
    appendPaperSources(content, paper);
    const connected = section(t('Application records linked by this project'));
    const linked = items.filter(app => app.claim_refs.some(ref => ref.paper_id === id));
    if (!linked.length) connected.append(node('p', 'empty-note', t('No application referencing this paper is included in the input scope.')));
    for (const app of linked) connected.append(localLink('reference', app.id + ':' + id, app.title + ' · ' + app.decision.status + ' · ' + app.claim_refs.filter(ref => ref.paper_id === id).length + t(' claims'), 'map-item'));
    content.append(connected);
    const own = section(t('Claims and source locations for this paper')); claims(own, paper.claims.map(claim => ({paper_id:id,claim_id:claim.id}))); if (!paper.claims.length) own.append(node('p','empty-note',t('No claims recorded'))); content.append(own);
    if (paper.notes?.length) { const notes = section(t('Card conditions, comparisons and interpretations')); appendNotes(notes, paper.notes); content.append(notes); }
    selected = id; selectedType = 'paper'; byId('previous').disabled = true; byId('next').disabled = true; byId('current-count').textContent = t('Paper and application connections'); highlight('paper', id);
    byId('announcement').textContent = t('{title} selected', { title: paper.title }); if (focus) byId('item-title').focus(); return true;
  }
  function showTopic(id, focus, relationIndex) {
    const relation = relationIndex === undefined ? null : data.project_context.links[relationIndex];
    const topic = topics.get(relation ? relation.target : id); if (!topic) return false;
    if (scene !== 'context') mountMap('context'); selected = topic.id; selectedType = relation ? 'context-link' : 'topic';
    const content = byId('content'), meta = byId('metadata'); content.replaceChildren(); meta.replaceChildren();
    byId('position').textContent = t('PROJECT CONTEXT · ') + topic.id; byId('item-title').textContent = relation ? topics.get(relation.source).title + ' → ' + topic.title : topic.title;
    meta.append(badge(t('AI learning guidance · not an understanding record')));
    if (relation) {
      content.append(p(relation.label), node('p', 'origin-note', data.project_context.notice), localLink('topic', relation.source, t('Starting concept · ') + topics.get(relation.source).title, 'map-item'), localLink('topic', relation.target, t('Destination concept · ') + topic.title, 'map-item'), node('h3', '', topic.title + t(' · destination concept explanation')));
    }
    content.append(node('p', 'lead', topic.summary)); topic.body.forEach(value => content.append(p(value)));
    const example = section(t('Explore an example'), 'example'); example.append(p(topic.example)); content.append(example);
    const refs = section((relation ? topic.title + t(' · destination concept') : t('This concept')) + t(' · linked paper evidence')); claims(refs, topic.claim_refs); if (!topic.claim_refs.length) refs.append(node('p', 'empty-note', t('This item provides background. No paper claims are invented to fill it.'))); content.append(refs);
    const app = data.applications.find(app => app.id === data.start);
    if (topic.claim_refs.length && app.conditions_comparison?.length) { const comparison = section(t('Distinguish project and source conditions'), 'trace-comparison'); paragraphs(comparison, app.conditions_comparison, ''); content.append(comparison); }
    content.append(localLink('application', data.start, t('View project decisions and all evidence')));
    const index = data.project_context.items.indexOf(topic); byId('previous').disabled = !!relation || index === 0; byId('next').disabled = !!relation || index === topics.size - 1; byId('current-count').textContent = relation ? t('Select the starting or destination concept to continue reading') : (index + 1) + ' / ' + topics.size;
    highlight(relation ? 'context-link' : 'topic', relation ? String(relationIndex) : topic.id);
    byId('announcement').textContent = t('{title} selected', { title: byId('item-title').textContent }); if (focus) byId('item-title').focus(); return true;
  }
  function showRelation(id, focus) {
    const relation = data.relations?.find(relation => relation.id === id); if (!relation) return false;
    if (scene === 'background') mountMap('papers');
    select(relation.source, false);
    const meta = byId('metadata'), content = byId('content'); meta.replaceChildren(); content.replaceChildren();
    const number = String(data.relations.findIndex(item => item.id === id) + 1).padStart(2, '0');
    byId('position').textContent = t('RELATION {number} · ', { number }) + relation.id; byId('item-title').textContent = kindLabels[relation.kind];
    meta.append(badge((relation.origin === 'ai' ? t('AI proposal') : t('Source-based record')) + ' · ' + relation.origin), badge(t('Record status · ') + relation.status));
    if (relation.needs_recheck) meta.append(badge(t('Needs rechecking · a previous check is not treated as currently valid.'), true));
    const direction = section(t('Relation direction')); direction.append(p(paperName(relation.source) + ' → ' + paperName(relation.target))); content.append(direction);
    const reason = section(t('Why these records are connected')); reason.append(p(relation.rationale)); content.append(reason);
    const refs = section(t('Source evidence'));
    if (relation.origin === 'ai' && relation.evidence_refs.length) refs.append(node('p', 'section-note', t('These claims informed an AI proposal. They do not source-confirm the relationship itself.')));
    if (relation.evidence_refs.length) claims(refs, relation.evidence_refs);
    else refs.append(node('p', 'empty-note', t(relation.origin === 'ai' ? 'This AI proposal has no linked source evidence. Do not use it as a source-confirmed relationship.' : 'No source evidence is linked. Do not use this as a source-confirmed relationship.')));
    content.append(refs);
    const history = node('details', 'source'); history.append(node('summary', '', t('Relation authorship and source-check record')), p(relation.created_by)); if (relation.review) history.append(p(relation.review.checked_by + ' · ' + relation.review.checked_at)); content.append(history);
    selectedType = 'relation'; selected = id; byId('previous').disabled = true; byId('next').disabled = true; byId('current-count').textContent = t('Selected relation matches the map'); highlight('relation', id); byId('announcement').textContent = t('{title} selected', { title: byId('item-title').textContent }); if (focus) byId('item-title').focus(); return true;
  }
  function showOverview(focus) {
    if (scene === 'background') mountMap('papers');
    const content = byId('content'), meta = byId('metadata'); content.replaceChildren(); meta.replaceChildren();
    byId('position').textContent = t('RELATION OVERVIEW'); byId('item-title').textContent = t('From relations to source evidence');
    meta.append(badge(data.papers.length + t(' papers · ') + data.relations.length + t(' relations')));
    content.append(p(t('Select an edge or the corresponding relation below to inspect the claims and conditions connecting the two papers.')));
    content.append(p(t('Select a paper to highlight its relations. Open the relation overview or press Escape to clear the selection.')));
    content.append(node('p', 'origin-note', t('Whole-paper status, individual claim checks and relation-check records are separate.')));
    selectedType = 'overview'; byId('previous').disabled = true; byId('next').disabled = true; byId('current-count').textContent = t('Explore the map and evidence together'); highlight('', '');
    byId('announcement').textContent = t('{title} selected', { title: byId('item-title').textContent });
    if (focus) byId('item-title').focus();
  }
  function followHash(focus = false) {
    const match = /^#([a-z-]+)=(.*)$/.exec(location.hash); let id; try { id = match ? decodeURIComponent(match[2]) : ''; } catch { id = ''; }
    const type = match?.[1];
    if (type === 'background' && showBackground(id, focus)) return;
    if (type === 'background-paper' && showBackgroundPaper(id, focus)) return;
    if (type === 'topic' && showTopic(id, focus)) return;
    if (type === 'context-link' && /^\d+$/.test(id) && data.project_context?.links[Number(id)] && showTopic('', focus, Number(id))) return;
    if (type === 'relation' && showRelation(id, focus)) return;
    if (type === 'reference' && projectMode) {
      const [appId, paperId, extra] = id.split(':'), app = items.find(item => item.id === appId);
      if (!extra && app?.claim_refs.some(ref => ref.paper_id === paperId)) { select(appId, focus, paperId); highlight('reference', id, paperId); return; }
    }
    if (type === 'paper' && projectMode && showProjectPaper(id, focus)) return;
    if (type === (projectMode ? 'application' : 'paper') && items.some(item => item.id === id)) { if (scene === 'background') mountMap('papers'); select(id, focus); return; }
    if (projectMode && data.map_view === 'context') showTopic(data.project_context.start, focus); else if (!projectMode) showOverview(focus); else select(data.start, focus);
  }
  for (const [button, offset] of [['previous', -1], ['next', 1]]) byId(button).addEventListener('click', () => {
    const sequence = selectedType === 'topic' ? data.project_context.items : items;
    const item = sequence[sequence.findIndex(item => item.id === selected) + offset]; if (item) location.hash = (selectedType === 'topic' ? '#topic=' : prefix) + encodeURIComponent(item.id);
  });
  byId('skip').addEventListener('click', event => { event.preventDefault(); byId('item-title').focus(); });
  byId('fit-map').addEventListener('click', () => map?.fit()); byId('zoom-in').addEventListener('click', () => map?.zoom(1.2)); byId('zoom-out').addEventListener('click', () => map?.zoom(1 / 1.2));
  // Explorer controls keep their focus; the explicit evidence button moves to detail.
  window.addEventListener('hashchange', () => followHash(!document.activeElement?.closest?.('.graph-explorer')));
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || projectMode || event.defaultPrevented || selectedType === 'overview') return;
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"], dialog')) return;
    location.hash = '#overview=all';
  });
  mountMap(scene); followHash();
})();
