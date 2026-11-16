(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const data = JSON.parse(byId('candidate').textContent);
  const projectMode = data.mode === 'project-application';
  const papers = new Map(data.papers.map(paper => [paper.id, paper]));
  const sources = new Map(data.sources.map(source => [source.id, source]));
  const items = projectMode ? data.applications : data.papers;
  const prefix = projectMode ? '#application=' : '#paper=';
  const topics = new Map((data.project_context?.items ?? []).map(item => [item.id, item]));
  const paperName = id => papers.get(id).short_title ?? papers.get(id).title;
  let scene = projectMode && data.map_view === 'context' ? 'context' : projectMode ? 'applications' : 'papers';
  let map, selectedType = projectMode ? 'application' : 'paper';
  const reviewLabels = { draft: 'Source review incomplete · draft', 'source-checked': 'Card source-check record · source-checked', 'needs-recheck': 'Card needs rechecking · needs-recheck' };
  const kindLabels = { cites: 'Cites', extends: 'Extends', compares: 'Compares', 'related-to': 'Related connection', 'reading-order': 'Suggested reading order' };
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
    if (!evidenceIds.length) { parent.append(node('p', 'empty-note', 'No linked source location · source coverage is not inferred.')); return; }
    for (const id of evidenceIds) {
      const source = sources.get(id), detail = node('details', 'source');
      detail.append(node('summary', '', source.title + (source.verification === 'agent-checked' ? ' · Agent-reported check scope' : data.version === 2 ? ' · No source check in this run' : ' · Source unchecked')),
        p('Location: ' + source.locator), p('Check scope: ' + source.scope),
        p('Check status is declared by the recorder. It does not establish full-paper reading, independent review or reproduction.'));
      if (source.url !== null) {
        const link = node('a', '', 'Open original source ↗'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link);
      } else detail.append(p('No external link recorded · use the specified local original.'));
      parent.append(detail);
    }
  }
  function appendPaperSources(parent, paper) {
    const linked = new Map();
    for (const claim of paper.claims) for (const id of claim.evidence) {
      const source = sources.get(id);
      if (source.url !== null) {
        if (!linked.has(source.url)) linked.set(source.url, { source, locators: new Set() });
        linked.get(source.url).locators.add(source.locator);
      }
    }
    if (!linked.size) return;
    const reading = section('Read the paper', 'paper-source-links');
    for (const { source, locators } of linked.values()) {
      const link = node('a', 'map-item', 'Open original source ↗');
      link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', paper.title + ' · ' + source.title + ' · open original source · new tab');
      reading.append(link, node('p', 'section-note', 'Read at: ' + [...locators].join(' / ')));
    }
    parent.append(reading);
  }
  function claims(parent, refs) {
    for (const ref of refs) {
      const paper = papers.get(ref.paper_id), claim = paper.claims.find(c => c.id === ref.claim_id);
      const block = node('div', 'claim');
      block.append(node('p', 'claim-id', paper.id + ' / ' + claim.id), node('h4', '', paper.title), badge(reviewLabels[paper.review_status], paper.review_status === 'needs-recheck'), p('Edition: ' + (paper.edition ?? 'Not recorded')), p(claim.statement));
      if (claim.conditions.length) { const conditions = section('Paper conditions'); paragraphs(conditions, claim.conditions, ''); block.append(conditions); }
      if (claim.limitations.length) { const limitations = section('Paper limits'); paragraphs(limitations, claim.limitations, ''); block.append(limitations); }
      if (!claim.conditions.length && !claim.limitations.length) block.append(node('p', 'empty-note', 'No separate conditions or limits are recorded. Read the relation rationale and original card context together.'));
      evidence(block, claim.evidence); parent.append(block);
      for (const review of claim.reviews ?? []) {
        const record = node('div', 'review-record');
        record.append(badge('Claim review · ' + review.verdict + (review.state === 'stale' ? ' · Needs rechecking' : review.state === 'unknown' ? ' · Current validity unknown' : ''), review.state !== 'current'), p(review.reason));
        const more = node('details'); more.append(node('summary', '', 'Source evidence and review record'), p(review.scope), p(review.reviewer + ' · ' + review.reviewed_at + ' · ' + review.review_type)); record.append(more); block.append(record);
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
    map?.destroy(); scene = nextScene; nav.clear(); byId('items').replaceChildren(); byId('map-links').replaceChildren();
    byId('research-map').className = scene === 'context' ? 'context-map' : '';
    const listed = scene === 'context' ? data.project_context.items : projectMode ? [...data.papers, ...items] : items;
    for (const [i, item] of listed.entries()) {
      const type = scene === 'context' ? 'topic' : data.papers.includes(item) ? 'paper' : 'application';
      const li = node('li'), a = localLink(type, item.id, item.short_title ?? item.title, 'map-item'); li.append(a); byId('items').append(li); nav.set(type + ':' + item.id, a);
    }
    byId('count').textContent = listed.length + ' items';
    byId('node-kind').textContent = scene === 'context' ? 'Concepts' : projectMode ? 'Projects · papers' : 'Paper';
    byId('map-node-navigation').setAttribute('aria-label', scene === 'context' ? 'Concept list' : projectMode ? 'Projects and papers' : 'Paper list');
    byId('map-heading').textContent = scene === 'context' ? data.project_context.title : projectMode ? 'Current question and paper evidence' : 'Connections between papers';
    byId('map-notice').textContent = scene === 'context' ? data.project_context.notice : projectMode ? 'Dashed lines are claim references recorded in an Application. They do not establish causal or performance inheritance.' : 'Check relation types and both endpoints before selecting an edge or the corresponding record in the list.';
    byId('map-legend').textContent = scene === 'context' ? 'Purple dashed lines · AI-proposed reading order. Opening an item does not record understanding.' : projectMode ? 'Dashed lines · project evidence references. Paper review and project decisions are separate.' : 'Green solid · source-check record / purple dashed · AI proposal / amber dashed · recheck';
    const links = scene === 'context' ? data.project_context.links : projectMode ? items.flatMap(app => data.papers.filter(paper => app.claim_refs.some(ref => ref.paper_id === paper.id)).map(paper => ({ app, paper }))) : data.relations;
    byId('map-links').append(node('h3', '', scene === 'context' ? 'Suggested order and connection rationale' : projectMode ? 'Corresponding evidence references' : 'Corresponding relations'));
    if (!links.length) byId('map-links').append(node('p', 'empty-note', 'No registered relations · disconnected items are still shown.'));
    links.forEach((item, index) => {
      let type, id, title, sub;
      if (scene === 'context') { type = 'context-link'; id = String(index); title = topics.get(item.source).title + ' → ' + topics.get(item.target).title; sub = item.label + ' · AI-proposed reading order'; }
      else if (projectMode) { type = 'reference'; id = item.app.id + ':' + item.paper.id; title = paperName(item.paper.id) + ' → ' + item.app.title; sub = item.app.claim_refs.filter(ref => ref.paper_id === item.paper.id).length + ' claims · compare with project conditions'; }
      else { type = 'relation'; id = item.id; title = paperName(item.source) + ' → ' + paperName(item.target) + ' · ' + kindLabels[item.kind]; sub = (item.origin === 'ai' ? 'AI proposal' : 'Source-based record') + ' · ' + item.status + (item.needs_recheck ? ' · Needs rechecking' : ''); }
      const a = localLink(type, id, undefined, 'map-link'), body = node('span', '', title); body.append(node('span', 'link-subtitle', sub)); a.append(node('span', 'index', String(index + 1).padStart(2, '0')), body); byId('map-links').append(a); nav.set(type + ':' + id, a);
    });
    map = window.DanseoMap?.mount(byId('research-map'), data, scene, item => { const id = item.type === 'reference' ? item.recordId + ':' + item.paperId : item.recordId; location.hash = '#' + item.type + '=' + encodeURIComponent(id); }, matches => {
      for (const relation of data.relations ?? []) { const link = nav.get('relation:' + relation.id); if (link) link.hidden = !matches(relation); }
    });
    byId('map-status').textContent = map ? 'Drag nodes · pan background · wheel/buttons to zoom · fit all' : 'Unable to load the map. Use the corresponding records below to navigate.';
    for (const button of byId('scene-controls').children) button.setAttribute('aria-pressed', String(button.scene === scene));
  }
  if (projectMode && data.project_context) for (const [value, title] of [['context', data.project_context.title], ['applications', 'Project–paper connections']]) {
    const button = node('button', '', title); button.type = 'button'; button.scene = value;
    button.addEventListener('click', () => { location.hash = value === 'context' ? '#topic=' + encodeURIComponent(data.project_context.start) : '#application=' + encodeURIComponent(data.start); }); byId('scene-controls').append(button);
  }
  if (!projectMode) byId('scene-controls').append(localLink('overview', 'all', 'Relation overview', 'map-item'));
  for (const item of data.provenance ?? []) byId('provenance').append(p(item.name + ' · SHA-256 ' + item.sha256));
  let selected;
  function select(id, focus = false, onlyPaper) {
    if (scene === 'context') mountMap(projectMode ? 'applications' : 'papers');
    const item = items.find(item => item.id === id) ?? items.find(item => item.id === data.start);
    selected = item.id; const index = items.indexOf(item);
    selectedType = projectMode ? 'application' : 'paper'; highlight(selectedType, selected);
    byId('position').textContent = (projectMode ? 'APPLICATION · ' : 'PAPER · ') + item.id;
    byId('item-title').textContent = item.title;
    const meta = byId('metadata'), content = byId('content'); meta.replaceChildren(); content.replaceChildren();
    if (projectMode) {
      if (onlyPaper) {
        byId('item-title').textContent = paperName(onlyPaper) + ' · evidence linked to this question';
        meta.append(badge(reviewLabels[papers.get(onlyPaper).review_status], papers.get(onlyPaper).review_status === 'needs-recheck'));
      }
      meta.append(badge('Project decision · ' + item.decision.status), badge('Planned action · ' + (item.decision.action ?? 'Unspecified')));
      const context = section('Project conditions'); paragraphs(context, data.project.conditions, 'Project conditions not recorded');
      if (item.conditions_comparison?.length) { const comparison = section('Differences between paper and project conditions', 'trace-comparison'); paragraphs(comparison, item.conditions_comparison, ''); context.append(comparison); }
      const refs = section('Application evidence · paper claims and conditions'); claims(refs, item.claim_refs.filter(ref => !onlyPaper || ref.paper_id === onlyPaper));
      const interpretation = section('Reading for the project · AI interpretation', 'interpretation'); interpretation.append(p(item.interpretation));
      const observation = section('Project observations', 'observation'); paragraphs(observation, item.observations, 'No observations recorded · execution and results are unknown.');
      const checks = section('Next checks · AI proposals', 'checks'); paragraphs(checks, item.next_checks, 'No next-check proposals recorded');
      const decision = section('Adoption decision record', 'decision');
      decision.append(p('Status: ' + item.decision.status + ' · action: ' + (item.decision.action ?? 'Unspecified')), p(item.decision.rationale), node('p', 'section-note', 'Project adoption does not establish source verification or experiment reproduction.'));
      content.append(context, refs, interpretation, observation, checks, decision);
    } else {
      meta.append(badge(reviewLabels[item.review_status], item.review_status === 'needs-recheck'), badge('Edition · ' + (item.edition ?? 'Not recorded')));
      appendPaperSources(content, item);
      const incident = data.relations.filter(r => r.source === item.id || r.target === item.id);
      const connections = section('Connections for this paper');
      if (!incident.length) connections.append(node('p', 'empty-note', 'No linked relations recorded · this does not establish that no relations exist.'));
      for (const relation of incident) connections.append(localLink('relation', relation.id, paperName(relation.source) + ' → ' + paperName(relation.target) + ' · ' + kindLabels[relation.kind], 'map-item'));
      content.append(connections);
      if (item.notes?.length) { const notes = section('Card conditions, comparisons and interpretations'); appendNotes(notes, item.notes); content.append(notes); }
      const own = section('Claims and source locations for this paper');
      if (!item.claims.length) own.append(node('p', 'empty-note', 'No claims recorded'));
      claims(own, item.claims.map(claim => ({ paper_id: item.id, claim_id: claim.id }))); content.append(own);
    }
    byId('previous').disabled = index === 0; byId('next').disabled = index === items.length - 1;
    byId('current-count').textContent = (index + 1) + ' / ' + items.length;
    byId('announcement').textContent = byId('item-title').textContent + ' selected';
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
    byId('position').textContent = 'PAPER · ' + paper.id; byId('item-title').textContent = paper.title;
    meta.append(badge(reviewLabels[paper.review_status], paper.review_status === 'needs-recheck'), badge('Edition · ' + (paper.edition ?? 'Not recorded')));
    appendPaperSources(content, paper);
    const connected = section('Application records linked by this project');
    const linked = items.filter(app => app.claim_refs.some(ref => ref.paper_id === id));
    if (!linked.length) connected.append(node('p', 'empty-note', 'No application referencing this paper is included in the input scope.'));
    for (const app of linked) connected.append(localLink('reference', app.id + ':' + id, app.title + ' · ' + app.decision.status + ' · ' + app.claim_refs.filter(ref => ref.paper_id === id).length + ' claims', 'map-item'));
    content.append(connected);
    const own = section('Claims and source locations for this paper'); claims(own, paper.claims.map(claim => ({paper_id:id,claim_id:claim.id}))); if (!paper.claims.length) own.append(node('p','empty-note','No claims recorded')); content.append(own);
    if (paper.notes?.length) { const notes = section('Card conditions, comparisons and interpretations'); appendNotes(notes, paper.notes); content.append(notes); }
    selected = id; selectedType = 'paper'; byId('previous').disabled = true; byId('next').disabled = true; byId('current-count').textContent = 'Paper and application connections'; highlight('paper', id);
    byId('announcement').textContent = paper.title + ' selected'; if (focus) byId('item-title').focus(); return true;
  }
  function showTopic(id, focus, relationIndex) {
    const relation = relationIndex === undefined ? null : data.project_context.links[relationIndex];
    const topic = topics.get(relation ? relation.target : id); if (!topic) return false;
    if (scene !== 'context') mountMap('context'); selected = topic.id; selectedType = relation ? 'context-link' : 'topic';
    const content = byId('content'), meta = byId('metadata'); content.replaceChildren(); meta.replaceChildren();
    byId('position').textContent = 'PROJECT CONTEXT · ' + topic.id; byId('item-title').textContent = relation ? topics.get(relation.source).title + ' → ' + topic.title : topic.title;
    meta.append(badge('AI learning guidance · not an understanding record'));
    if (relation) {
      content.append(p(relation.label), node('p', 'origin-note', data.project_context.notice), localLink('topic', relation.source, 'Starting concept · ' + topics.get(relation.source).title, 'map-item'), localLink('topic', relation.target, 'Destination concept · ' + topic.title, 'map-item'), node('h3', '', topic.title + ' · destination concept explanation'));
    }
    content.append(node('p', 'lead', topic.summary)); topic.body.forEach(value => content.append(p(value)));
    const example = section('Explore an example', 'example'); example.append(p(topic.example)); content.append(example);
    const refs = section((relation ? topic.title + ' · destination concept' : 'This concept') + ' · linked paper evidence'); claims(refs, topic.claim_refs); if (!topic.claim_refs.length) refs.append(node('p', 'empty-note', 'This item provides background. No paper claims are invented to fill it.')); content.append(refs);
    const app = data.applications.find(app => app.id === data.start);
    if (topic.claim_refs.length && app.conditions_comparison?.length) { const comparison = section('Distinguish project and source conditions', 'trace-comparison'); paragraphs(comparison, app.conditions_comparison, ''); content.append(comparison); }
    content.append(localLink('application', data.start, 'View project decisions and all evidence'));
    const index = data.project_context.items.indexOf(topic); byId('previous').disabled = !!relation || index === 0; byId('next').disabled = !!relation || index === topics.size - 1; byId('current-count').textContent = relation ? 'Select the starting or destination concept to continue reading' : (index + 1) + ' / ' + topics.size;
    highlight(relation ? 'context-link' : 'topic', relation ? String(relationIndex) : topic.id);
    byId('announcement').textContent = byId('item-title').textContent + ' selected'; if (focus) byId('item-title').focus(); return true;
  }
  function showRelation(id, focus) {
    const relation = data.relations?.find(relation => relation.id === id); if (!relation) return false;
    select(relation.source, false);
    const meta = byId('metadata'), content = byId('content'); meta.replaceChildren(); content.replaceChildren();
    byId('position').textContent = 'RELATION · ' + relation.id; byId('item-title').textContent = kindLabels[relation.kind];
    meta.append(badge((relation.origin === 'ai' ? 'AI proposal' : 'Source-based record') + ' · ' + relation.origin), badge('Record status · ' + relation.status));
    if (relation.needs_recheck) meta.append(badge('Needs rechecking · a previous check is not treated as currently valid.', true));
    const direction = section('Relation direction'); direction.append(p(paperName(relation.source) + ' → ' + paperName(relation.target))); content.append(direction);
    const reason = section('Why these records are connected'); reason.append(p(relation.rationale)); content.append(reason);
    const refs = section('Source claims linked to this relation'); claims(refs, relation.evidence_refs); if (!relation.evidence_refs.length) refs.append(node('p', 'empty-note', 'No linked claim evidence · relation meaning remains unverified.')); content.append(refs);
    const history = node('details', 'source'); history.append(node('summary', '', 'Relation authorship and source-check record'), p(relation.created_by)); if (relation.review) history.append(p(relation.review.checked_by + ' · ' + relation.review.checked_at)); content.append(history);
    selectedType = 'relation'; selected = id; byId('previous').disabled = true; byId('next').disabled = true; byId('current-count').textContent = 'Selected relation matches the map'; highlight('relation', id); byId('announcement').textContent = byId('item-title').textContent + ' selected'; if (focus) byId('item-title').focus(); return true;
  }
  function showOverview(focus) {
    const content = byId('content'), meta = byId('metadata'); content.replaceChildren(); meta.replaceChildren();
    byId('position').textContent = 'RELATION OVERVIEW'; byId('item-title').textContent = 'From relations to source evidence';
    meta.append(badge(data.papers.length + ' papers · ' + data.relations.length + ' relations'));
    content.append(p('Select an edge or the corresponding relation below to inspect the claims and conditions connecting the two papers.'));
    content.append(p('Select a paper to highlight its relations. Open the relation overview or press Escape to clear the selection.'));
    content.append(node('p', 'origin-note', 'Whole-paper status, individual claim checks and relation-check records are separate.'));
    selectedType = 'overview'; byId('previous').disabled = true; byId('next').disabled = true; byId('current-count').textContent = 'Explore the map and evidence together'; highlight('', '');
    if (focus) byId('item-title').focus();
  }
  function followHash(focus = false) {
    const match = /^#([a-z-]+)=(.*)$/.exec(location.hash); let id; try { id = match ? decodeURIComponent(match[2]) : ''; } catch { id = ''; }
    const type = match?.[1];
    if (type === 'topic' && showTopic(id, focus)) return;
    if (type === 'context-link' && /^\d+$/.test(id) && data.project_context?.links[Number(id)] && showTopic('', focus, Number(id))) return;
    if (type === 'relation' && showRelation(id, focus)) return;
    if (type === 'reference' && projectMode) {
      const [appId, paperId, extra] = id.split(':'), app = items.find(item => item.id === appId);
      if (!extra && app?.claim_refs.some(ref => ref.paper_id === paperId)) { select(appId, focus, paperId); highlight('reference', id, paperId); return; }
    }
    if (type === 'paper' && projectMode && showProjectPaper(id, focus)) return;
    if (type === (projectMode ? 'application' : 'paper') && items.some(item => item.id === id)) { select(id, focus); return; }
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
