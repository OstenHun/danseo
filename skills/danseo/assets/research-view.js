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
  const reviewLabels = { draft: '원문 검토 미완료 · draft', 'source-checked': '카드 원문 대조 기록 · source-checked', 'needs-recheck': '카드 재확인 필요 · needs-recheck' };
  const kindLabels = { cites: '인용함', extends: '확장함', compares: '비교함', 'related-to': '관련 연결', 'reading-order': '추천 읽기 순서' };
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
    if (!evidenceIds.length) { parent.append(node('p', 'empty-note', '연결된 원문 위치 없음 · 원문 확인 범위를 추정하지 않습니다.')); return; }
    for (const id of evidenceIds) {
      const source = sources.get(id), detail = node('details', 'source');
      detail.append(node('summary', '', source.title + (source.verification === 'agent-checked' ? ' · Agent 확인 범위 있음' : data.version === 2 ? ' · 이번 원문 대조 미실행' : ' · 원문 미확인')),
        p('위치: ' + source.locator), p('확인 범위: ' + source.scope),
        p('확인 상태는 기록자의 선언입니다. 논문 전체 확인·독립 검토·재현을 뜻하지 않습니다.'));
      if (source.url !== null) {
        const link = node('a', '', '원문 열기 ↗'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link);
      } else detail.append(p('외부 링크 미기재 · 지정된 로컬 원본 위치를 사용합니다.'));
      parent.append(detail);
    }
  }
  function claims(parent, refs) {
    for (const ref of refs) {
      const paper = papers.get(ref.paper_id), claim = paper.claims.find(c => c.id === ref.claim_id);
      const block = node('div', 'claim');
      block.append(node('p', 'claim-id', paper.id + ' / ' + claim.id), node('h4', '', paper.title), badge(reviewLabels[paper.review_status], paper.review_status === 'needs-recheck'), p('판본: ' + (paper.edition ?? '미기재')), p(claim.statement));
      if (claim.conditions.length) { const conditions = section('논문 조건'); paragraphs(conditions, claim.conditions, ''); block.append(conditions); }
      if (claim.limitations.length) { const limitations = section('논문 한계'); paragraphs(limitations, claim.limitations, ''); block.append(limitations); }
      if (!claim.conditions.length && !claim.limitations.length) block.append(node('p', 'empty-note', '개별 조건·한계 필드는 미등록입니다. 관계 이유와 원래 카드의 문맥을 함께 읽습니다.'));
      evidence(block, claim.evidence); parent.append(block);
      for (const review of claim.reviews ?? []) {
        const record = node('div', 'review-record');
        record.append(badge('주장 검토 · ' + review.verdict + (review.state === 'stale' ? ' · 재확인 필요' : review.state === 'unknown' ? ' · 현재성 미확인' : ''), review.state !== 'current'), p(review.reason));
        const more = node('details'); more.append(node('summary', '', '원문 근거와 검토 기록'), p(review.scope), p(review.reviewer + ' · ' + review.reviewed_at + ' · ' + review.review_type)); record.append(more); block.append(record);
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
    byId('count').textContent = listed.length + '개 항목';
    byId('node-kind').textContent = scene === 'context' ? '개념' : projectMode ? '프로젝트·논문' : '논문';
    byId('map-node-navigation').setAttribute('aria-label', scene === 'context' ? '개념 목록' : projectMode ? '프로젝트와 논문' : '논문 목록');
    byId('map-heading').textContent = scene === 'context' ? data.project_context.title : projectMode ? '현재 질문과 논문 근거' : '논문 사이의 연결';
    byId('map-notice').textContent = scene === 'context' ? data.project_context.notice : projectMode ? '점선은 Application에 기록된 주장 참조입니다. 방법의 인과·성능 계승을 뜻하지 않습니다.' : '선택 전에 관계의 종류·양 끝을 함께 보고, 연결선이나 같은 기록 목록을 선택하세요.';
    byId('map-legend').textContent = scene === 'context' ? '보라 점선 · AI가 제안한 읽기 순서. 클릭·열람은 이해 완료로 저장하지 않습니다.' : projectMode ? '점선 · 프로젝트의 근거 참조. Paper 검토와 프로젝트 판단은 별개입니다.' : '녹색 실선 · 원문 대조 기록 / 보라 점선 · AI 제안 / 황토 점선 · 재확인';
    const links = scene === 'context' ? data.project_context.links : projectMode ? items.flatMap(app => data.papers.filter(paper => app.claim_refs.some(ref => ref.paper_id === paper.id)).map(paper => ({ app, paper }))) : data.relations;
    byId('map-links').append(node('h3', '', scene === 'context' ? '제안된 순서와 연결 이유' : projectMode ? '같은 근거 연결 목록' : '같은 관계 목록'));
    if (!links.length) byId('map-links').append(node('p', 'empty-note', '등록된 관계 없음 · 연결이 없는 항목도 그대로 표시합니다.'));
    links.forEach((item, index) => {
      let type, id, title, sub;
      if (scene === 'context') { type = 'context-link'; id = String(index); title = topics.get(item.source).title + ' → ' + topics.get(item.target).title; sub = item.label + ' · AI 읽기 순서 제안'; }
      else if (projectMode) { type = 'reference'; id = item.app.id + ':' + item.paper.id; title = paperName(item.paper.id) + ' → ' + item.app.title; sub = item.app.claim_refs.filter(ref => ref.paper_id === item.paper.id).length + '개 주장 · 프로젝트 조건과 대조'; }
      else { type = 'relation'; id = item.id; title = paperName(item.source) + ' → ' + paperName(item.target) + ' · ' + kindLabels[item.kind]; sub = (item.origin === 'ai' ? 'AI 제안' : '원문 기반 기록') + ' · ' + item.status + (item.needs_recheck ? ' · 재확인 필요' : ''); }
      const a = localLink(type, id, undefined, 'map-link'), body = node('span', '', title); body.append(node('span', 'link-subtitle', sub)); a.append(node('span', 'index', String(index + 1).padStart(2, '0')), body); byId('map-links').append(a); nav.set(type + ':' + id, a);
    });
    map = window.DanseoMap?.mount(byId('research-map'), data, scene, item => { const id = item.type === 'reference' ? item.recordId + ':' + item.paperId : item.recordId; location.hash = '#' + item.type + '=' + encodeURIComponent(id); });
    byId('map-status').textContent = map ? '노드 드래그 · 배경 이동 · 휠/버튼 확대 · 전체 보기' : '지도를 불러오지 못했습니다. 아래 같은 기록 목록으로 탐색할 수 있습니다.';
    for (const button of byId('scene-controls').children) button.setAttribute('aria-pressed', String(button.scene === scene));
  }
  if (projectMode && data.project_context) for (const [value, title] of [['context', data.project_context.title], ['applications', '프로젝트–논문 연결']]) {
    const button = node('button', '', title); button.type = 'button'; button.scene = value;
    button.addEventListener('click', () => { location.hash = value === 'context' ? '#topic=' + encodeURIComponent(data.project_context.start) : '#application=' + encodeURIComponent(data.start); }); byId('scene-controls').append(button);
  }
  if (!projectMode) byId('scene-controls').append(localLink('overview', 'all', '전체 관계 개요', 'map-item'));
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
        byId('item-title').textContent = paperName(onlyPaper) + ' · 이 질문에 연결한 근거';
        meta.append(badge(reviewLabels[papers.get(onlyPaper).review_status], papers.get(onlyPaper).review_status === 'needs-recheck'));
      }
      meta.append(badge('프로젝트 판단 · ' + item.decision.status), badge('실행 방향 · ' + (item.decision.action ?? '미지정')));
      const context = section('프로젝트의 조건'); paragraphs(context, data.project.conditions, '프로젝트 조건 미기재');
      if (item.conditions_comparison?.length) { const comparison = section('논문 조건과 이 프로젝트의 차이', 'trace-comparison'); paragraphs(comparison, item.conditions_comparison, ''); context.append(comparison); }
      const refs = section('적용 근거 · 논문 주장과 조건'); claims(refs, item.claim_refs.filter(ref => !onlyPaper || ref.paper_id === onlyPaper));
      const interpretation = section('프로젝트로 옮겨 읽기 · AI 해석', 'interpretation'); interpretation.append(p(item.interpretation));
      const observation = section('프로젝트 관찰', 'observation'); paragraphs(observation, item.observations, '관찰 기록 없음 · 실행 여부와 결과는 미확인입니다.');
      const checks = section('다음 확인 · AI 제안', 'checks'); paragraphs(checks, item.next_checks, '기록된 다음 확인 제안 없음');
      const decision = section('채택 결정 기록', 'decision');
      decision.append(p('상태: ' + item.decision.status + ' · 방향: ' + (item.decision.action ?? '미지정')), p(item.decision.rationale), node('p', 'section-note', '프로젝트 채택은 원문 확인이나 실험 재현의 증명이 아닙니다.'));
      content.append(context, refs, interpretation, observation, checks, decision);
    } else {
      meta.append(badge(reviewLabels[item.review_status], item.review_status === 'needs-recheck'), badge('판본 · ' + (item.edition ?? '미기재')));
      const incident = data.relations.filter(r => r.source === item.id || r.target === item.id);
      const connections = section('이 논문의 연결');
      if (!incident.length) connections.append(node('p', 'empty-note', '연결된 관계 기록 없음 · 관계가 없다는 결론은 아닙니다.'));
      for (const relation of incident) connections.append(localLink('relation', relation.id, paperName(relation.source) + ' → ' + paperName(relation.target) + ' · ' + kindLabels[relation.kind], 'map-item'));
      content.append(connections);
      if (item.notes?.length) { const notes = section('카드에 기록된 조건·비교·해석'); appendNotes(notes, item.notes); content.append(notes); }
      const own = section('이 논문의 주장과 원문 위치');
      if (!item.claims.length) own.append(node('p', 'empty-note', '기록된 주장 없음'));
      claims(own, item.claims.map(claim => ({ paper_id: item.id, claim_id: claim.id }))); content.append(own);
    }
    byId('previous').disabled = index === 0; byId('next').disabled = index === items.length - 1;
    byId('current-count').textContent = (index + 1) + ' / ' + items.length;
    byId('announcement').textContent = byId('item-title').textContent + ' 선택';
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
    meta.append(badge(reviewLabels[paper.review_status], paper.review_status === 'needs-recheck'), badge('판본 · ' + (paper.edition ?? '미기재')));
    const connected = section('이 프로젝트에서 연결한 적용 기록');
    const linked = items.filter(app => app.claim_refs.some(ref => ref.paper_id === id));
    if (!linked.length) connected.append(node('p', 'empty-note', '이 논문을 참조하는 적용 기록이 입력 범위에 없습니다.'));
    for (const app of linked) connected.append(localLink('reference', app.id + ':' + id, app.title + ' · ' + app.decision.status + ' · ' + app.claim_refs.filter(ref => ref.paper_id === id).length + '개 주장', 'map-item'));
    content.append(connected);
    const own = section('이 논문의 주장과 원문 위치'); claims(own, paper.claims.map(claim => ({paper_id:id,claim_id:claim.id}))); if (!paper.claims.length) own.append(node('p','empty-note','기록된 주장 없음')); content.append(own);
    if (paper.notes?.length) { const notes = section('카드의 조건·비교·해석'); appendNotes(notes, paper.notes); content.append(notes); }
    selected = id; selectedType = 'paper'; byId('previous').disabled = true; byId('next').disabled = true; byId('current-count').textContent = '논문과 적용 기록 연결'; highlight('paper', id);
    byId('announcement').textContent = paper.title + ' 선택'; if (focus) byId('item-title').focus(); return true;
  }
  function showTopic(id, focus, relationIndex) {
    const relation = relationIndex === undefined ? null : data.project_context.links[relationIndex];
    const topic = topics.get(relation ? relation.target : id); if (!topic) return false;
    if (scene !== 'context') mountMap('context'); selected = topic.id; selectedType = relation ? 'context-link' : 'topic';
    const content = byId('content'), meta = byId('metadata'); content.replaceChildren(); meta.replaceChildren();
    byId('position').textContent = 'PROJECT CONTEXT · ' + topic.id; byId('item-title').textContent = relation ? topics.get(relation.source).title + ' → ' + topic.title : topic.title;
    meta.append(badge('AI 학습 안내 · 이해 상태 아님'));
    if (relation) {
      content.append(p(relation.label), node('p', 'origin-note', data.project_context.notice), localLink('topic', relation.source, '출발 개념 · ' + topics.get(relation.source).title, 'map-item'), localLink('topic', relation.target, '도착 개념 · ' + topic.title, 'map-item'), node('h3', '', topic.title + ' · 도착 개념의 설명'));
    }
    content.append(node('p', 'lead', topic.summary)); topic.body.forEach(value => content.append(p(value)));
    const example = section('예로 살펴보기', 'example'); example.append(p(topic.example)); content.append(example);
    const refs = section((relation ? topic.title + ' · 도착 개념' : '이 개념') + '과 연결한 논문 근거'); claims(refs, topic.claim_refs); if (!topic.claim_refs.length) refs.append(node('p', 'empty-note', '이 항목은 배경 설명입니다. 연결된 논문 주장을 만들어 채우지 않습니다.')); content.append(refs);
    const app = data.applications.find(app => app.id === data.start);
    if (topic.claim_refs.length && app.conditions_comparison?.length) { const comparison = section('현재 프로젝트와 원문 조건 구분', 'trace-comparison'); paragraphs(comparison, app.conditions_comparison, ''); content.append(comparison); }
    content.append(localLink('application', data.start, '프로젝트의 판단과 전체 근거 보기'));
    const index = data.project_context.items.indexOf(topic); byId('previous').disabled = !!relation || index === 0; byId('next').disabled = !!relation || index === topics.size - 1; byId('current-count').textContent = relation ? '출발·도착 개념을 선택해 이어 읽기' : (index + 1) + ' / ' + topics.size;
    highlight(relation ? 'context-link' : 'topic', relation ? String(relationIndex) : topic.id);
    byId('announcement').textContent = byId('item-title').textContent + ' 선택'; if (focus) byId('item-title').focus(); return true;
  }
  function showRelation(id, focus) {
    const relation = data.relations?.find(relation => relation.id === id); if (!relation) return false;
    select(relation.source, false);
    const meta = byId('metadata'), content = byId('content'); meta.replaceChildren(); content.replaceChildren();
    byId('position').textContent = 'RELATION · ' + relation.id; byId('item-title').textContent = kindLabels[relation.kind];
    meta.append(badge((relation.origin === 'ai' ? 'AI 제안' : '원문 기반 기록') + ' · ' + relation.origin), badge('기록 상태 · ' + relation.status));
    if (relation.needs_recheck) meta.append(badge('재확인 필요 · 이전 확인을 현재 유효로 보지 않습니다.', true));
    const direction = section('관계 방향'); direction.append(p(paperName(relation.source) + ' → ' + paperName(relation.target))); content.append(direction);
    const reason = section('왜 연결했는가'); reason.append(p(relation.rationale)); content.append(reason);
    const refs = section('이 관계에 연결된 원문 주장'); claims(refs, relation.evidence_refs); if (!relation.evidence_refs.length) refs.append(node('p', 'empty-note', '연결된 주장 근거 없음 · 관계의 의미는 미확인입니다.')); content.append(refs);
    const history = node('details', 'source'); history.append(node('summary', '', '관계 작성·원문 대조 기록'), p(relation.created_by)); if (relation.review) history.append(p(relation.review.checked_by + ' · ' + relation.review.checked_at)); content.append(history);
    selectedType = 'relation'; selected = id; byId('previous').disabled = true; byId('next').disabled = true; byId('current-count').textContent = '지도와 같은 관계 선택'; highlight('relation', id); byId('announcement').textContent = byId('item-title').textContent + ' 선택'; if (focus) byId('item-title').focus(); return true;
  }
  function showOverview(focus) {
    const content = byId('content'), meta = byId('metadata'); content.replaceChildren(); meta.replaceChildren();
    byId('position').textContent = 'RELATION OVERVIEW'; byId('item-title').textContent = '관계에서 원문 근거로';
    meta.append(badge(data.papers.length + '편 · ' + data.relations.length + '개 관계'));
    content.append(p('지도의 연결선이나 아래 같은 관계 목록을 선택하면, 두 논문의 어떤 주장과 조건 때문에 연결했는지 확인할 수 있습니다.'));
    content.append(p('논문을 선택하면 연결된 관계가 강조됩니다. 전체 관계 개요나 Escape로 선택을 해제할 수 있습니다.'));
    content.append(node('p', 'origin-note', 'Paper 전체의 확인 상태, 개별 주장 대조와 관계의 대조 기록은 서로 다릅니다.'));
    selectedType = 'overview'; byId('previous').disabled = true; byId('next').disabled = true; byId('current-count').textContent = '지도와 근거를 함께 탐색'; highlight('', '');
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
  window.addEventListener('hashchange', () => followHash(true));
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || projectMode || event.defaultPrevented || selectedType === 'overview') return;
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"], dialog')) return;
    location.hash = '#overview=all';
  });
  mountMap(scene); followHash();
})();
