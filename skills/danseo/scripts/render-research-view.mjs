import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, object, text, list, oneOf, ids, unique, httpUrl, escape, cspHash, inlineAssets, runView, cliEntry } from './view-core.mjs';

const paragraphs = (value, at) => { list(value, at); value.forEach((v, i) => text(v, `${at}[${i}]`)); };
export function validateCandidate(data) {
  oneOf(data?.mode, ['project-application', 'paper-relations'], 'mode');
  const projectMode = data.mode === 'project-application';
  const enhanced = data.version === 2;
  object(data, ['version', 'mode', 'title', 'description', 'view_reason', 'start', 'papers', 'sources', ...(projectMode ? ['project', 'applications'] : ['relations']), ...(enhanced ? ['scope', 'provenance', ...(projectMode ? ['map_view', 'project_context'] : [])] : [])], 'candidate');
  if (![1, 2].includes(data.version)) fail('candidate.version: expected 1 or 2');
  if (enhanced) {
    text(data.scope, 'scope'); list(data.provenance, 'provenance');
    for (const item of data.provenance) {
      object(item, ['name', 'sha256'], 'provenance'); text(item.name, 'provenance.name');
      if (typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) fail('provenance.sha256: expected SHA-256');
    }
  }
  for (const key of ['title', 'description', 'view_reason']) text(data[key], key);
  const papers = unique(data.papers, 'papers'), sources = unique(data.sources, 'sources');
  if (!papers.size) fail('papers: at least one paper required');
  for (const source of data.sources) {
    object(source, ['id', 'title', 'url', 'locator', 'scope', 'verification'], `source.${source.id}`);
    for (const key of ['title', 'locator', 'scope']) text(source[key], `source.${source.id}.${key}`);
    if (source.url !== null) httpUrl(source.url, `source.${source.id}.url`);
    oneOf(source.verification, ['not-checked', 'agent-checked'], `source.${source.id}.verification`);
  }
  const claims = new Map();
  for (const paper of data.papers) {
    object(paper, ['id', 'title', 'edition', 'review_status', 'claims', ...(enhanced ? ['short_title', 'notes'] : []), ...(Object.hasOwn(paper, 'topic') ? ['topic'] : [])], `paper.${paper.id}`);
    if (Object.hasOwn(paper, 'topic')) { text(paper.topic, 'paper.topic'); if (paper.topic.length > 40) fail('paper.topic: maximum 40 characters'); }
    if (enhanced) { text(paper.short_title, 'paper.short_title'); paragraphs(paper.notes, 'paper.notes'); }
    text(paper.title, `paper.${paper.id}.title`);
    if (paper.edition !== null) text(paper.edition, `paper.${paper.id}.edition`);
    oneOf(paper.review_status, ['draft', 'source-checked', 'needs-recheck'], `paper.${paper.id}.review_status`);
    claims.set(paper.id, unique(paper.claims, `paper.${paper.id}.claims`));
    for (const claim of paper.claims) {
      object(claim, ['id', 'statement', 'conditions', 'limitations', 'evidence', ...(enhanced ? ['reviews'] : [])], `claim.${claim.id}`);
      if (enhanced) {
        list(claim.reviews, 'claim.reviews');
        for (const review of claim.reviews) {
          object(review, ['verdict', 'reason', 'scope', 'reviewer', 'reviewed_at', 'review_type', 'state'], 'claim.review');
          oneOf(review.verdict, ['supported', 'partially_supported', 'contradicted', 'insufficient_evidence'], 'claim.review.verdict');
          oneOf(review.state, ['current', 'stale', 'unknown'], 'claim.review.state');
          for (const key of ['reason', 'scope', 'reviewer', 'reviewed_at', 'review_type']) text(review[key], `claim.review.${key}`);
        }
      }
      text(claim.statement, `claim.${claim.id}.statement`);
      paragraphs(claim.conditions, `claim.${claim.id}.conditions`);
      paragraphs(claim.limitations, `claim.${claim.id}.limitations`);
      ids(claim.evidence, sources, `claim.${claim.id}.evidence`);
    }
  }
  function refs(values, at) {
    list(values, at);
    const seen = new Set();
    for (const ref of values) {
      object(ref, ['paper_id', 'claim_id'], at);
      if (!claims.get(ref.paper_id)?.has(ref.claim_id)) fail(`${at}: unknown paper/claim reference`);
      const key = JSON.stringify([ref.paper_id, ref.claim_id]);
      if (seen.has(key)) fail(`${at}: duplicate paper/claim reference`);
      seen.add(key);
    }
  }
  if (projectMode) {
    object(data.project, ['id', 'title', 'question', 'conditions'], 'project');
    unique([data.project], 'project'); text(data.project.title, 'project.title'); text(data.project.question, 'project.question');
    paragraphs(data.project.conditions, 'project.conditions');
    const applications = unique(data.applications, 'applications');
    if (!applications.size || !applications.has(data.start)) fail('start: expected an application id');
    for (const app of data.applications) {
      object(app, ['id', 'title', 'claim_refs', 'interpretation', 'observations', 'next_checks', 'decision', ...(enhanced ? ['conditions_comparison'] : [])], `application.${app.id}`);
      if (enhanced) paragraphs(app.conditions_comparison, 'application.conditions_comparison');
      text(app.title, 'application.title'); text(app.interpretation, 'application.interpretation');
      refs(app.claim_refs, 'application.claim_refs');
      if (!app.claim_refs.length) fail('application.claim_refs: at least one reference required');
      paragraphs(app.observations, 'application.observations'); paragraphs(app.next_checks, 'application.next_checks');
      object(app.decision, ['status', 'action', 'rationale'], 'decision');
      oneOf(app.decision.status, ['proposed', 'accepted'], 'decision.status');
      oneOf(app.decision.action, [null, 'apply', 'adapt', 'test', 'defer'], 'decision.action');
      text(app.decision.rationale, 'decision.rationale');
    }
    if (enhanced) {
      oneOf(data.map_view, ['applications', 'context'], 'map_view');
      if (data.project_context === null) { if (data.map_view === 'context') fail('context map needs project_context'); }
      else {
        const context = data.project_context;
        object(context, ['title', 'notice', 'start', 'items', 'links'], 'project_context');
        text(context.title, 'project_context.title'); text(context.notice, 'project_context.notice');
        const topics = unique(context.items, 'project_context.items');
        if (!topics.has(context.start)) fail('project_context.start: unknown item');
        const allowed = new Set(applications.get(data.start).claim_refs.map(ref => JSON.stringify([ref.paper_id, ref.claim_id])));
        for (const topic of context.items) {
          object(topic, ['id', 'title', 'summary', 'body', 'example', 'claim_refs'], 'context.item');
          for (const key of ['title', 'summary', 'example']) text(topic[key], `context.item.${key}`);
          paragraphs(topic.body, 'context.item.body'); refs(topic.claim_refs, 'context.item.claim_refs');
          for (const ref of topic.claim_refs) if (!allowed.has(JSON.stringify([ref.paper_id, ref.claim_id]))) fail('context.item: claim not linked by this project');
        }
        list(context.links, 'context.links'); const seen = new Set();
        for (const link of context.links) {
          object(link, ['source', 'target', 'label'], 'context.link'); text(link.label, 'context.link.label');
          if (!topics.has(link.source) || !topics.has(link.target) || link.source === link.target) fail('context.link: invalid endpoints');
          const pair = JSON.stringify([link.source, link.target]); if (seen.has(pair)) fail('context.link: duplicate'); seen.add(pair);
        }
      }
    }
  } else {
    if (!papers.has(data.start)) fail('start: expected a paper id');
    unique(data.relations, 'relations');
    for (const relation of data.relations) {
      object(relation, ['id', 'source', 'target', 'kind', 'origin', 'status', 'needs_recheck', 'rationale', 'created_by', 'review', 'evidence_refs'], `relation.${relation.id}`);
      if (!papers.has(relation.source) || !papers.has(relation.target) || relation.source === relation.target) fail('relation: invalid endpoints');
      oneOf(relation.kind, ['cites', 'extends', 'compares', 'related-to', 'reading-order'], 'relation.kind');
      oneOf(relation.origin, ['source', 'ai'], 'relation.origin');
      oneOf(relation.status, ['proposed', 'source-checked'], 'relation.status');
      if (typeof relation.needs_recheck !== 'boolean') fail('relation.needs_recheck: expected boolean');
      text(relation.rationale, 'relation.rationale'); text(relation.created_by, 'relation.created_by');
      refs(relation.evidence_refs, 'relation.evidence_refs');
      if (relation.review !== null) {
        object(relation.review, ['checked_by', 'checked_at'], 'relation.review');
        text(relation.review.checked_by, 'relation.review.checked_by');
        if (typeof relation.review.checked_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(relation.review.checked_at) || !Number.isFinite(Date.parse(relation.review.checked_at))) fail('relation.review.checked_at: expected timestamp with timezone');
      }
      if (relation.status === 'source-checked' && (!relation.review || !relation.evidence_refs.length)) fail('source-checked relation requires review and evidence_refs');
    }
  }
  return data;
}

const directory = path.dirname(fileURLToPath(import.meta.url));
export function renderCandidate(candidate) {
  validateCandidate(candidate);
  const { style, script, json } = inlineAssets(candidate, [path.join(directory, '../assets/reader-base.css'), path.join(directory, '../assets/research-view.css'), path.join(directory, '../assets/graph-presentation.css')], [path.join(directory, '../assets/cytoscape.min.js'), path.join(directory, '../assets/graph-presentation.js'), path.join(directory, '../assets/research-map.js'), path.join(directory, '../assets/research-view.js')], 1);
  const project = candidate.mode === 'project-application';
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${cspHash(script)}'; style-src 'sha256-${cspHash(style)}'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><title>${escape(candidate.title)} · Danseo</title><style>${style}</style></head>
<body class="${project ? 'project-application' : 'paper-relations'}"><a class="skip" id="skip" href="#item-title">본문으로 이동</a>
<header class="topbar"><span class="brand">Danseo<span class="brand-dot">.</span></span><span class="product">RESEARCH DESK</span><span class="local">${project ? '논문에서 프로젝트로' : '논문 사이의 연결'}</span></header>
<main><section class="page-heading" aria-labelledby="page-title"><p class="eyebrow">${project ? 'PROJECT APPLICATION' : 'PAPER RELATIONS'} <span>${project ? '적용 판단' : '논문 관계 지도'}</span></p><h1 id="page-title">${escape(candidate.title)}</h1><p class="description">${escape(candidate.description)}</p><p class="goal"><span>${project ? escape(candidate.project.title) + ' · ' + escape(candidate.project.id) : '화면의 범위'}</span>${project ? escape(candidate.project.question) : escape(candidate.scope ?? '입력에 포함된 논문 전체와 저장된 관계를 함께 보고 선택합니다.')}</p>${project && candidate.scope ? `<p class="description">${escape(candidate.scope)}</p>` : ''}</section>
<div class="research-workspace"><section class="map-area" aria-label="연결 구조와 기록 목록"><div class="map-toolbar"><h2 id="map-heading">연결 구조</h2><div class="map-controls"><button type="button" id="zoom-out" aria-label="지도 축소">−</button><button type="button" id="zoom-in" aria-label="지도 확대">+</button><button type="button" id="fit-map">전체 보기</button></div></div><div class="scene-controls" id="scene-controls"></div><p class="map-notice" id="map-notice"></p><div id="research-map" role="img" aria-label="이동과 확대가 가능한 관계 지도. 아래 같은 기록 목록으로 키보드 탐색할 수 있습니다."></div><p id="map-status" class="map-status" aria-live="polite"></p><p class="map-legend" id="map-legend"></p><section class="map-records" aria-label="지도와 같은 기록"><nav id="map-node-navigation" aria-label="${project ? '프로젝트와 논문' : '논문 목록'}"><p class="nav-heading"><span id="node-kind">${project ? '프로젝트·논문' : '논문'}</span> <span id="count"></span></p><ol id="items" class="map-items"></ol></nav><div id="map-links"></div></section><details class="composition-note"><summary>화면의 범위와 구성 이유</summary><p>${escape(candidate.view_reason)}</p><p>${escape(candidate.scope ?? '입력에 선언된 기록만 표시합니다.')}</p><div id="provenance"></div></details></section>
<article class="lesson research detail-area" aria-labelledby="item-title"><div class="lesson-header"><p class="eyebrow" id="position"></p><h2 id="item-title" tabindex="-1"></h2><div id="metadata" class="metadata"></div></div><div id="content"></div><div class="controls"><button id="previous" type="button">← 이전 기록</button><span id="current-count"></span><button id="next" type="button">다음 기록 →</button></div></article></div>
<footer><span>Danseo · 연구 기록의 파생 화면</span><span>원문 확인 · 프로젝트 채택 · 실험 재현은 별개입니다.</span></footer></main>
<noscript><p class="no-script">기록 탐색에는 JavaScript가 필요합니다. 원본 candidate JSON에서 내용을 읽을 수 있습니다.</p></noscript>
<p id="announcement" class="sr-only" aria-live="polite"></p><script type="application/json" id="candidate">${json}</script><script>${script}</script></body></html>`;
}
export const run = args => runView(args, validateCandidate, data => {
  if (data.mode === 'paper-relations' && args[1] === '--out') fail('Paper relation output requires render-verified-research-view.mjs --evidence; --check here is structure-only');
  return renderCandidate(data);
}, data => ({ representation: data.mode, papers: data.papers.length, applications: data.applications?.length ?? 0, relations: data.relations?.length ?? 0 }));
cliEntry(import.meta.url, run);
