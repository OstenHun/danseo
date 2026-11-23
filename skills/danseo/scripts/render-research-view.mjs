import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fail,
  object,
  text,
  list,
  oneOf,
  ids,
  unique,
  httpUrl,
  escape,
  cspHash,
  inlineAssets,
  runView,
  cliEntry,
} from './view-core.mjs';
import { uiText, languageScript } from './view-language.mjs';

const paragraphs = (value, at) => {
  list(value, at);
  value.forEach((item, i) => text(item, `${at}[${i}]`));
};
// The last instant of a year, a month or a day, as written.
function periodEnd(value, year, month, date) {
  if (value.length === 4) return Date.UTC(year + 1, 0, 1) - 1;
  if (value.length === 7) return Date.UTC(year, month, 1) - 1;
  return date.getTime();
}
function publicationDate(value, at) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}(?:-\d{2}(?:-\d{2})?)?$/.test(value))
    fail(`${at}: expected YYYY, YYYY-MM or YYYY-MM-DD`);
  const [year, month = 1, day = 1] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    fail(`${at}: invalid calendar date`);
  const end = periodEnd(value, year, month, date);
  return { start: date.getTime(), end };
}
function validateVenueRank(ranking, at, sources) {
  const category = ranking?.category !== undefined;
  object(
    ranking,
    [
      'venue',
      'scheme',
      'edition',
      'rank',
      'top_tier',
      'venue_source_id',
      'source_id',
      ...(category ? ['category'] : []),
    ],
    at,
  );
  for (const key of ['venue', 'scheme', 'edition', 'rank']) text(ranking[key], `${at}.${key}`);
  if (category) text(ranking.category, `${at}.category`);
  if (typeof ranking.top_tier !== 'boolean') fail(`${at}.top_tier: expected boolean`);
  for (const key of ['venue_source_id', 'source_id']) {
    if (!sources.has(ranking[key])) fail(`${at}.${key}: source must be registered`);
  }
}
function venueRankKey({ venue, scheme, edition, category = '' }) {
  return JSON.stringify(
    [venue, scheme, edition, category].map((value) => value.trim().toLowerCase()),
  );
}

// Fields of the candidate itself; version 2 adds scope, provenance and mode-specific fields.
function candidateFields(data, projectMode, enhanced) {
  return [
    'version',
    'mode',
    'title',
    'description',
    'view_reason',
    'start',
    'papers',
    'sources',
    ...(Object.hasOwn(data, 'language') ? ['language'] : []),
    ...(projectMode ? ['project', 'applications'] : ['relations']),
    ...(enhanced
      ? [
          'scope',
          'provenance',
          ...(projectMode
            ? ['map_view', 'project_context']
            : ['concepts', 'backgrounds', 'focal_paper_id'].filter((key) =>
                Object.hasOwn(data, key),
              )),
        ]
      : []),
  ];
}
function validateProvenance(data) {
  text(data.scope, 'scope');
  list(data.provenance, 'provenance');
  for (const item of data.provenance) {
    object(item, ['name', 'sha256'], 'provenance');
    text(item.name, 'provenance.name');
    if (typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256))
      fail('provenance.sha256: expected SHA-256');
  }
}
function validateSource(source) {
  object(source, ['id', 'title', 'url', 'locator', 'scope', 'verification'], `source.${source.id}`);
  for (const key of ['title', 'locator', 'scope']) text(source[key], `source.${source.id}.${key}`);
  if (source.url !== null) httpUrl(source.url, `source.${source.id}.url`);
  oneOf(source.verification, ['not-checked', 'agent-checked'], `source.${source.id}.verification`);
}

function validatePublication(paper, sources) {
  object(paper.publication, ['date', 'edition_date', 'source_id'], `paper.${paper.id}.publication`);
  const published = publicationDate(paper.publication.date, `paper.${paper.id}.publication.date`);
  if (paper.publication.edition_date !== null) {
    const edition = publicationDate(
      paper.publication.edition_date,
      `paper.${paper.id}.publication.edition_date`,
    );
    if (edition.end < published.start)
      fail(`paper.${paper.id}: edition date precedes first publication`);
  }
  if (!sources.has(paper.publication.source_id))
    fail(`paper.${paper.id}: publication source must be registered`);
}
function validateCitations(paper, sources) {
  const at = `paper.${paper.id}.citations`;
  const citations = paper.citations;
  object(citations, ['count', 'checked_on', 'source_id'], at);
  if (!Number.isSafeInteger(citations.count) || citations.count < 0)
    fail(`${at}.count: expected a nonnegative safe integer`);
  publicationDate(citations.checked_on, `${at}.checked_on`);
  if (citations.checked_on.length !== 10) fail(`${at}.checked_on: expected YYYY-MM-DD`);
  if (!sources.has(citations.source_id))
    fail(`${at}.source_id: citation source must be registered`);
}
// Extra rankings need a representative one, and no venue, scheme, edition and category twice.
function validateAdditionalVenueRanks(paper, sources) {
  const at = `paper.${paper.id}.additional_venue_ranks`;
  list(paper.additional_venue_ranks, at);
  if (paper.additional_venue_ranks.length && !paper.venue_rank)
    fail(`${at}: expected a representative venue_rank`);
  const seen = new Set(paper.venue_rank ? [venueRankKey(paper.venue_rank)] : []);
  paper.additional_venue_ranks.forEach((rank, index) => {
    const entry = `${at}[${index}]`;
    validateVenueRank(rank, entry, sources);
    const key = venueRankKey(rank);
    if (seen.has(key)) fail(`${entry}: duplicate venue, scheme, edition and category`);
    seen.add(key);
  });
}
// Optional paper fields, checked in the order they appear here.
function validatePaperDetails(paper, sources) {
  if (Object.hasOwn(paper, 'publication')) validatePublication(paper, sources);
  if (Object.hasOwn(paper, 'citations')) validateCitations(paper, sources);
  if (Object.hasOwn(paper, 'venue_rank'))
    validateVenueRank(paper.venue_rank, `paper.${paper.id}.venue_rank`, sources);
  if (Object.hasOwn(paper, 'additional_venue_ranks')) validateAdditionalVenueRanks(paper, sources);
  if (Object.hasOwn(paper, 'reading_reason'))
    text(paper.reading_reason, `paper.${paper.id}.reading_reason`);
  if (Object.hasOwn(paper, 'topic')) {
    text(paper.topic, 'paper.topic');
    if (paper.topic.length > 40) fail('paper.topic: maximum 40 characters');
  }
}
function validateReview(review) {
  object(
    review,
    ['verdict', 'reason', 'scope', 'reviewer', 'reviewed_at', 'review_type', 'state'],
    'claim.review',
  );
  oneOf(
    review.verdict,
    ['supported', 'partially_supported', 'contradicted', 'insufficient_evidence'],
    'claim.review.verdict',
  );
  oneOf(review.state, ['current', 'stale', 'unknown'], 'claim.review.state');
  for (const key of ['reason', 'scope', 'reviewer', 'reviewed_at', 'review_type'])
    text(review[key], `claim.review.${key}`);
}
function validateClaim(claim, enhanced, sources) {
  object(
    claim,
    ['id', 'statement', 'conditions', 'limitations', 'evidence', ...(enhanced ? ['reviews'] : [])],
    `claim.${claim.id}`,
  );
  if (enhanced) {
    list(claim.reviews, 'claim.reviews');
    for (const review of claim.reviews) validateReview(review);
  }
  text(claim.statement, `claim.${claim.id}.statement`);
  paragraphs(claim.conditions, `claim.${claim.id}.conditions`);
  paragraphs(claim.limitations, `claim.${claim.id}.limitations`);
  ids(claim.evidence, sources, `claim.${claim.id}.evidence`);
}
const optionalPaperFields = [
  'topic',
  'publication',
  'citations',
  'reading_reason',
  'venue_rank',
  'additional_venue_ranks',
];
// Records the paper's claim IDs in claims before checking each claim.
function validatePaper(paper, enhanced, sources, claims) {
  object(
    paper,
    [
      'id',
      'title',
      'edition',
      'review_status',
      'claims',
      ...(enhanced ? ['short_title', 'notes'] : []),
      ...optionalPaperFields.filter((key) => Object.hasOwn(paper, key)),
    ],
    `paper.${paper.id}`,
  );
  validatePaperDetails(paper, sources);
  if (enhanced) {
    text(paper.short_title, 'paper.short_title');
    paragraphs(paper.notes, 'paper.notes');
  }
  text(paper.title, `paper.${paper.id}.title`);
  if (paper.edition !== null) text(paper.edition, `paper.${paper.id}.edition`);
  oneOf(
    paper.review_status,
    ['draft', 'source-checked', 'needs-recheck'],
    `paper.${paper.id}.review_status`,
  );
  claims.set(paper.id, unique(paper.claims, `paper.${paper.id}.claims`));
  for (const claim of paper.claims) validateClaim(claim, enhanced, sources);
}

// Returns a checker for lists of paper/claim references: known claims, no duplicates.
function referenceChecker(claims) {
  return (values, at) => {
    list(values, at);
    const seen = new Set();
    for (const ref of values) {
      object(ref, ['paper_id', 'claim_id'], at);
      if (!claims.get(ref.paper_id)?.has(ref.claim_id))
        fail(`${at}: unknown paper/claim reference`);
      const key = JSON.stringify([ref.paper_id, ref.claim_id]);
      if (seen.has(key)) fail(`${at}: duplicate paper/claim reference`);
      seen.add(key);
    }
  };
}

function validateApplication(app, enhanced, refs) {
  object(
    app,
    [
      'id',
      'title',
      'claim_refs',
      'interpretation',
      'observations',
      'next_checks',
      'decision',
      ...(enhanced ? ['conditions_comparison'] : []),
    ],
    `application.${app.id}`,
  );
  if (enhanced) paragraphs(app.conditions_comparison, 'application.conditions_comparison');
  text(app.title, 'application.title');
  text(app.interpretation, 'application.interpretation');
  refs(app.claim_refs, 'application.claim_refs');
  if (!app.claim_refs.length) fail('application.claim_refs: at least one reference required');
  paragraphs(app.observations, 'application.observations');
  paragraphs(app.next_checks, 'application.next_checks');
  object(app.decision, ['status', 'action', 'rationale'], 'decision');
  oneOf(app.decision.status, ['proposed', 'accepted'], 'decision.status');
  oneOf(app.decision.action, [null, 'apply', 'adapt', 'test', 'defer'], 'decision.action');
  text(app.decision.rationale, 'decision.rationale');
}
// A context item may cite only claims that the starting application links.
function validateContextItem(topic, refs, allowed) {
  object(topic, ['id', 'title', 'summary', 'body', 'example', 'claim_refs'], 'context.item');
  for (const key of ['title', 'summary', 'example']) text(topic[key], `context.item.${key}`);
  paragraphs(topic.body, 'context.item.body');
  refs(topic.claim_refs, 'context.item.claim_refs');
  for (const ref of topic.claim_refs)
    if (!allowed.has(JSON.stringify([ref.paper_id, ref.claim_id])))
      fail('context.item: claim not linked by this project');
}
function validateContextLinks(context, topics) {
  list(context.links, 'context.links');
  const seen = new Set();
  for (const link of context.links) {
    object(link, ['source', 'target', 'label'], 'context.link');
    text(link.label, 'context.link.label');
    if (!topics.has(link.source) || !topics.has(link.target) || link.source === link.target)
      fail('context.link: invalid endpoints');
    const pair = JSON.stringify([link.source, link.target]);
    if (seen.has(pair)) fail('context.link: duplicate');
    seen.add(pair);
  }
}
function validateProjectContext(data, applications, refs) {
  const context = data.project_context;
  object(context, ['title', 'notice', 'start', 'items', 'links'], 'project_context');
  text(context.title, 'project_context.title');
  text(context.notice, 'project_context.notice');
  const topics = unique(context.items, 'project_context.items');
  if (!topics.has(context.start)) fail('project_context.start: unknown item');
  const allowed = new Set(
    applications
      .get(data.start)
      .claim_refs.map((ref) => JSON.stringify([ref.paper_id, ref.claim_id])),
  );
  for (const topic of context.items) validateContextItem(topic, refs, allowed);
  validateContextLinks(context, topics);
}
function validateProjectMode(data, enhanced, refs) {
  object(data.project, ['id', 'title', 'question', 'conditions'], 'project');
  unique([data.project], 'project');
  text(data.project.title, 'project.title');
  text(data.project.question, 'project.question');
  paragraphs(data.project.conditions, 'project.conditions');
  const applications = unique(data.applications, 'applications');
  if (!applications.size || !applications.has(data.start))
    fail('start: expected an application id');
  for (const app of data.applications) validateApplication(app, enhanced, refs);
  if (!enhanced) return;
  oneOf(data.map_view, ['applications', 'context'], 'map_view');
  if (data.project_context === null) {
    if (data.map_view === 'context') fail('context map needs project_context');
  } else validateProjectContext(data, applications, refs);
}

const relationFields = [
  'id',
  'source',
  'target',
  'kind',
  'origin',
  'status',
  'needs_recheck',
  'rationale',
  'created_by',
  'review',
  'evidence_refs',
];
function validateRelationReview(relation) {
  object(relation.review, ['checked_by', 'checked_at'], 'relation.review');
  text(relation.review.checked_by, 'relation.review.checked_by');
  if (
    typeof relation.review.checked_at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      relation.review.checked_at,
    ) ||
    !Number.isFinite(Date.parse(relation.review.checked_at))
  )
    fail('relation.review.checked_at: expected timestamp with timezone');
}
function validateRelation(relation, papers, refs) {
  object(relation, relationFields, `relation.${relation.id}`);
  if (
    !papers.has(relation.source) ||
    !papers.has(relation.target) ||
    relation.source === relation.target
  )
    fail('relation: invalid endpoints');
  oneOf(
    relation.kind,
    ['cites', 'extends', 'compares', 'related-to', 'reading-order'],
    'relation.kind',
  );
  oneOf(relation.origin, ['source', 'ai'], 'relation.origin');
  oneOf(relation.status, ['proposed', 'source-checked'], 'relation.status');
  if (typeof relation.needs_recheck !== 'boolean') fail('relation.needs_recheck: expected boolean');
  text(relation.rationale, 'relation.rationale');
  text(relation.created_by, 'relation.created_by');
  refs(relation.evidence_refs, 'relation.evidence_refs');
  if (relation.review !== null) validateRelationReview(relation);
  if (relation.status === 'source-checked' && (!relation.review || !relation.evidence_refs.length))
    fail('source-checked relation requires review and evidence_refs');
}
function validateConcept(concept) {
  object(
    concept,
    ['id', 'title', 'summary', ...(Object.hasOwn(concept, 'tier') ? ['tier'] : [])],
    'concept',
  );
  text(concept.title, 'concept.title');
  text(concept.summary, 'concept.summary');
  // Optional reading priority; absent means a core-method concept, as in maps made before tiers existed.
  if (Object.hasOwn(concept, 'tier'))
    oneOf(concept.tier, ['method', 'claims', 'recipe'], 'concept.tier');
}
// A suggested reading is another paper whose own claims back the cited evidence.
function validateReading(reading, background, papers, sources, seen) {
  object(reading, ['paper_id', 'rationale', 'evidence', 'return_question'], 'background.reading');
  if (
    !papers.has(reading.paper_id) ||
    reading.paper_id === background.paper_id ||
    seen.has(reading.paper_id)
  )
    fail('background.reading: invalid or duplicate paper');
  seen.add(reading.paper_id);
  text(reading.rationale, 'background.reading.rationale');
  text(reading.return_question, 'background.reading.return_question');
  ids(reading.evidence, sources, 'background.reading.evidence');
  const allowed = new Set(papers.get(reading.paper_id).claims.flatMap((claim) => claim.evidence));
  if (reading.evidence.some((id) => !allowed.has(id)))
    fail('background.reading: evidence must belong to the representative paper');
}
function validateBackground(background, papers, concepts, sources, pairs) {
  object(
    background,
    ['id', 'paper_id', 'concept_id', 'origin', 'status', 'rationale', 'readings'],
    'background',
  );
  if (!papers.has(background.paper_id) || !concepts.has(background.concept_id))
    fail('background: unknown paper or concept');
  const pair = JSON.stringify([background.paper_id, background.concept_id]);
  if (pairs.has(pair)) fail('background: duplicate paper/concept pair');
  pairs.add(pair);
  oneOf(background.origin, ['ai'], 'background.origin');
  oneOf(background.status, ['proposed'], 'background.status');
  text(background.rationale, 'background.rationale');
  list(background.readings, 'background.readings');
  const seen = new Set();
  for (const reading of background.readings)
    validateReading(reading, background, papers, sources, seen);
}
function validateConceptMap(data, papers, sources) {
  if (!Object.hasOwn(data, 'concepts') || !Object.hasOwn(data, 'backgrounds'))
    fail('Provide concepts and backgrounds together');
  const concepts = unique(data.concepts, 'concepts');
  unique(data.backgrounds, 'backgrounds');
  for (const concept of concepts.values()) validateConcept(concept);
  const pairs = new Set();
  for (const background of data.backgrounds)
    validateBackground(background, papers, concepts, sources, pairs);
}
function validateRelationsMode(data, papers, sources, refs) {
  if (!papers.has(data.start)) fail('start: expected a paper id');
  if (Object.hasOwn(data, 'focal_paper_id') && data.focal_paper_id !== data.start)
    fail('focal_paper_id: expected the registered starting paper id');
  unique(data.relations, 'relations');
  for (const relation of data.relations) validateRelation(relation, papers, refs);
  if (Object.hasOwn(data, 'concepts') || Object.hasOwn(data, 'backgrounds'))
    validateConceptMap(data, papers, sources);
}

export function validateCandidate(data) {
  oneOf(data?.mode, ['project-application', 'paper-relations'], 'mode');
  const projectMode = data.mode === 'project-application';
  const enhanced = data.version === 2;
  object(data, candidateFields(data, projectMode, enhanced), 'candidate');
  if (Object.hasOwn(data, 'language')) oneOf(data.language, ['en', 'ko'], 'candidate.language');
  if (![1, 2].includes(data.version)) fail('candidate.version: expected 1 or 2');
  if (enhanced) validateProvenance(data);
  for (const key of ['title', 'description', 'view_reason']) text(data[key], key);
  const papers = unique(data.papers, 'papers'),
    sources = unique(data.sources, 'sources');
  if (!papers.size) fail('papers: at least one paper required');
  for (const source of data.sources) validateSource(source);
  const claims = new Map();
  for (const paper of data.papers) validatePaper(paper, enhanced, sources, claims);
  const refs = referenceChecker(claims);
  if (projectMode) validateProjectMode(data, enhanced, refs);
  else validateRelationsMode(data, papers, sources, refs);
  return data;
}

const directory = path.dirname(fileURLToPath(import.meta.url));
export function renderCandidate(candidate, { complete = false, completionScope = null } = {}) {
  validateCandidate(candidate);
  return renderValidatedCandidate(candidate, complete, completionScope);
}

// The first-map summary: the focal paper, then counts of key and recipe concepts and papers to read.
// English needs "1 key concept" but "2 key concepts"; translations map both keys.
function firstMapSummary(candidate, ui, hasBackgrounds) {
  const counted = (one, many, count) =>
    ui(count === 1 ? one : many).replace('{count}', String(count));
  const focal = candidate.papers.find((paper) => paper.id === candidate.focal_paper_id);
  // Recipe-tier concepts are counted separately, matching the fold under the map legend.
  const recipeIds = new Set(
    (candidate.concepts ?? []).filter((item) => item.tier === 'recipe').map((item) => item.id),
  );
  const linkedIds = new Set((candidate.backgrounds ?? []).map((item) => item.concept_id));
  const recipeCount = [...linkedIds].filter((id) => recipeIds.has(id)).length;
  const keyCount = linkedIds.size - recipeCount;
  const readingCount = new Set(
    (candidate.backgrounds ?? []).flatMap((item) =>
      item.readings.map((reading) => reading.paper_id),
    ),
  ).size;
  const focalLabel = focal
    ? escape(focal.title) +
      (focal.publication ? ' (' + escape(focal.publication.date.slice(0, 4)) + ')' : '')
    : null;
  if (!hasBackgrounds) return '';
  return [
    ...(focalLabel ? [focalLabel] : []),
    counted('{count} key concept', '{count} key concepts', keyCount),
    ...(recipeCount
      ? [
          counted(
            '{count} training and evaluation concept',
            '{count} training and evaluation concepts',
            recipeCount,
          ),
        ]
      : []),
    counted('{count} paper to read', '{count} papers to read', readingCount),
  ].join(' · ');
}

function goalHtml(candidate, ui, project) {
  const label = project
    ? escape(candidate.project.title) + ' · ' + escape(candidate.project.id)
    : ui('View scope');
  const body = project
    ? escape(candidate.project.question)
    : escape(
        candidate.scope ?? ui('Explore all input papers and their recorded relations together.'),
      );
  return `<p class="goal"><span>${label}</span>${body}</p>`;
}

// First maps lead with what the reader will find; the full authorship and coverage text moves into the scope fold.
function overviewHtml(candidate, ui, { project, hasBackgrounds, complete, completionScope }) {
  const description = `<p class="description">${escape(candidate.description)}</p>`;
  const coverage = !project
    ? `<p class="description source-coverage">${ui(complete ? 'Recorded source checks complete for the displayed claims and source relations.' : 'Exploration view: source checks may be incomplete. Read the evidence status before using a claim or relation.')}</p>`
    : '';
  const sourceScope = complete
    ? `<details class="source-check-scope"><summary>${ui('Read the recorded source-check scope')}</summary><p>${escape(completionScope)}</p></details>`
    : '';
  const goal = goalHtml(candidate, ui, project);
  const summary = firstMapSummary(candidate, ui, hasBackgrounds);
  const authorship = `<p class="description authorship">${ui('Prepared with an AI agent. Source relations and reading suggestions are distinguished.')}</p>`;
  const firstMapNote = `<p class="first-map-note">${ui('Prepared with an AI agent')} · ${ui(complete ? 'Source checks recorded for the displayed claims' : 'Exploration view · some source checks may be unfinished')}</p>`;
  return hasBackgrounds
    ? `<p class="first-map-summary">${summary}</p>${firstMapNote}<details class="first-map-overview"><summary>${ui('Map scope and coverage')}</summary>${authorship}${coverage}${description}${goal}${sourceScope}</details>`
    : authorship + description + coverage + sourceScope + goal;
}

function pageHtml({ candidate, ui, project, hasBackgrounds, overview, style, script, json }) {
  const sceneControls = '<div class="scene-controls" id="scene-controls"></div>';
  return `<!doctype html>
<html lang="${candidate.language ?? 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${cspHash(script)}'; style-src 'sha256-${cspHash(style)}'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><title>${escape(candidate.title)} · Danseo</title><style>${style}</style></head>
<body class="${project ? 'project-application' : 'paper-relations' + (hasBackgrounds ? ' first-map' : '')}"><a class="skip" id="skip" href="#item-title">${ui('Skip to content')}</a>
<header class="topbar"><span class="brand">Danseo<span class="brand-dot">.</span></span><span class="product">${ui('RESEARCH DESK')}</span><span class="local">${project ? ui('From papers to projects') : ui('Connections between papers')}</span></header>
<main><section class="page-heading" aria-labelledby="page-title"><p class="eyebrow">${project ? ui('PROJECT APPLICATION') : ui('PAPER RELATIONS')} <span>${project ? ui('Application decisions') : ui('Paper relation map')}</span></p><h1 id="page-title">${escape(candidate.title)}</h1>${overview}${project && candidate.scope ? `<p class="description">${escape(candidate.scope)}</p>` : ''}</section>
<div class="research-workspace"><section class="map-area" aria-label="${ui('Map and record list')}"><div class="map-toolbar"><h2 id="map-heading">${ui('Connections')}</h2><div class="map-controls"><button type="button" id="zoom-out" aria-label="${ui('Zoom out')}">−</button><button type="button" id="zoom-in" aria-label="${ui('Zoom in')}">+</button><button type="button" id="fit-map">${ui('Fit all')}</button></div></div>${hasBackgrounds ? '' : sceneControls}<p class="map-notice" id="map-notice"></p><p class="map-legend" id="map-legend"></p><div id="research-map" role="img" aria-label="${ui('Pan and zoom the relation map. Use the matching record list below for keyboard navigation.')}"></div><p id="map-status" class="map-status" aria-live="polite"></p>${hasBackgrounds ? sceneControls : ''}<section class="map-records" aria-label="${ui('Records shown on the map')}"><nav id="map-node-navigation" aria-label="${project ? ui('Projects and papers') : ui('Paper list')}"><p class="nav-heading"><span id="node-kind">${project ? ui('Projects · papers') : ui('Paper')}</span> <span id="count"></span></p><ol id="items" class="map-items"></ol></nav><div id="map-links"></div></section><details class="composition-note"><summary>${ui('View scope and rationale')}</summary><p>${escape(candidate.view_reason)}</p><p>${escape(candidate.scope ?? ui('Only records declared in the input are shown.'))}</p><div id="provenance"></div></details></section>
<article class="lesson research detail-area" aria-labelledby="item-title"><div class="lesson-header"><p class="eyebrow" id="position"></p><h2 id="item-title" tabindex="-1"></h2><div id="metadata" class="metadata"></div></div><div id="content"></div><div class="controls"><button id="previous" type="button">${ui('← Previous record')}</button><span id="current-count"></span><button id="next" type="button">${ui('Next record →')}</button></div></article></div>
<footer><span>${ui('Danseo · view derived from research records')}</span><span>${ui('Source verification, project adoption and experiment reproduction are separate.')}</span></footer></main>
<noscript><p class="no-script">${ui('JavaScript is required to explore records. You can read the original candidate JSON directly.')}</p></noscript>
<p id="announcement" class="sr-only" aria-live="polite"></p><script type="application/json" id="candidate">${json}</script><script>${script}</script></body></html>`;
}

function renderValidatedCandidate(candidate, complete = false, completionScope = null) {
  if (complete) text(completionScope, 'completion scope');
  const {
    style,
    script: assetsScript,
    json,
  } = inlineAssets(
    candidate,
    [
      path.join(directory, '../assets/reader-base.css'),
      path.join(directory, '../assets/research-view.css'),
      path.join(directory, '../assets/graph-presentation.css'),
    ],
    [
      path.join(directory, '../assets/cytoscape.min.js'),
      path.join(directory, '../assets/graph-presentation.js'),
      path.join(directory, '../assets/research-map.js'),
      path.join(directory, '../assets/research-view.js'),
    ],
    1,
  );
  const script = languageScript(candidate.language) + assetsScript;
  const ui = (value) => escape(uiText(candidate.language, value));
  const project = candidate.mode === 'project-application';
  const hasBackgrounds = Boolean(candidate.backgrounds?.length);
  const overview = overviewHtml(candidate, ui, {
    project,
    hasBackgrounds,
    complete,
    completionScope,
  });
  return pageHtml({ candidate, ui, project, hasBackgrounds, overview, style, script, json });
}
export const run = (args) =>
  runView(
    args,
    validateCandidate,
    (data) => {
      if (data.mode === 'paper-relations' && args[1] === '--out')
        fail(
          'Paper relation output requires render-verified-research-view.mjs --evidence; --check here is structure-only',
        );
      return renderValidatedCandidate(data);
    },
    (data) => ({
      representation: data.mode,
      papers: data.papers.length,
      applications: data.applications?.length ?? 0,
      relations: data.relations?.length ?? 0,
    }),
  );
cliEntry(import.meta.url, run);
