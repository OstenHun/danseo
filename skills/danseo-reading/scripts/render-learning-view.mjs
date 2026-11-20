import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, object, text, list, oneOf, ids, unique as sharedUnique, httpUrl, escape, cspHash, inlineAssets, runView, cliEntry } from './view-core.mjs';

import { uiText, languageScript } from './view-language.mjs';

const unique = (items, at) => sharedUnique(items, at, /^[a-z][a-z0-9-]{0,63}$/);

export function validateCandidate(data) {
  object(data, ['version', 'title', 'description', 'goal', 'view', 'view_reason', 'start', 'reading_order', 'concepts', 'relations', 'sources', ...(Object.hasOwn(data, 'language') ? ['language'] : [])], 'candidate');
  if (Object.hasOwn(data, 'language')) oneOf(data.language, ['en', 'ko'], 'candidate.language');
  if (data.version !== 1) fail('candidate.version: expected 1');
  for (const key of ['title', 'description', 'goal', 'view_reason']) text(data[key], `candidate.${key}`);
  oneOf(data.view, ['path', 'map'], 'candidate.view');
  list(data.concepts, 'concepts'); list(data.sources, 'sources'); list(data.relations, 'relations');
  if (!data.concepts.length) fail('concepts: at least one concept required');
  const concepts = unique(data.concepts, 'concepts'), sources = unique(data.sources, 'sources');
  for (const source of data.sources) {
    object(source, ['id', 'title', 'url', 'locator', 'scope', 'verification'], `source.${source.id}`);
    for (const key of ['title', 'url', 'locator', 'scope']) text(source[key], `source.${source.id}.${key}`);
    httpUrl(source.url, `source.${source.id}`);
    oneOf(source.verification, ['not-checked', 'agent-checked'], `source.${source.id}.verification`);
  }
  for (const concept of data.concepts) {
    object(concept, ['id', 'title', 'summary', 'body', 'example', 'evidence'], `concept.${concept.id}`);
    for (const key of ['title', 'summary', 'example']) text(concept[key], `concept.${concept.id}.${key}`);
    list(concept.body, `concept.${concept.id}.body`);
    if (!concept.body.length) fail(`concept.${concept.id}.body: at least one paragraph required`);
    concept.body.forEach((paragraph, i) => text(paragraph, `concept.${concept.id}.body[${i}]`));
    ids(concept.evidence, sources, `concept.${concept.id}.evidence`);
  }
  ids(data.reading_order, concepts, 'reading_order');
  if (data.reading_order.length !== concepts.size) fail('reading_order: include every concept exactly once');
  if (!concepts.has(data.start)) fail('start: unknown concept');
  if (data.view === 'map' && !data.relations.length) fail('map: meaningful relations required; use path for order-only content');
  const seen = new Set();
  data.relations.forEach((relation, i) => {
    object(relation, ['from', 'to', 'label', 'origin', 'evidence'], `relation[${i}]`);
    if (!concepts.has(relation.from) || !concepts.has(relation.to) || relation.from === relation.to) fail(`relation[${i}]: invalid endpoints`);
    text(relation.label, `relation[${i}].label`);
    oneOf(relation.origin, ['ai', 'source'], `relation[${i}].origin`);
    ids(relation.evidence, sources, `relation[${i}].evidence`);
    if (relation.origin === 'source' && (!relation.evidence.length || relation.evidence.some(id => sources.get(id).verification !== 'agent-checked'))) {
      fail(`relation[${i}]: source relation needs agent-checked evidence`);
    }
    const signature = JSON.stringify([relation.from, relation.to, relation.label]);
    if (seen.has(signature)) fail(`relation[${i}]: duplicate relation`);
    seen.add(signature);
  });
  return data;
}

const directory = path.dirname(fileURLToPath(import.meta.url));

export function renderCandidate(candidate) {
  validateCandidate(candidate);
  return renderValidatedCandidate(candidate);
}

function renderValidatedCandidate(candidate) {
  const { style, script: assetsScript, json } = inlineAssets(candidate, [path.join(directory, '../assets/learning-view.css')], path.join(directory, '../assets/learning-view.js'), 1);
  const language = candidate.language ?? 'ko'; // Preserve existing learning candidates.
  const script = languageScript(language) + assetsScript;
  const ui = value => escape(uiText(language, value));
  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${cspHash(script)}'; style-src 'sha256-${cspHash(style)}'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><title>${escape(candidate.title)} · Danseo</title><style>${style}</style></head>
<body><a class="skip" id="skip" href="#concept-title">${ui("Skip to learning content")}</a>
<header class="topbar"><span class="brand">Danseo<span class="brand-dot">.</span></span><span class="product">READING ROOM</span><span class="local">${ui("Read concepts with paper evidence")}</span></header>
<main><section class="page-heading" aria-labelledby="page-title"><p class="eyebrow">LEARNING NOTES <span>${ui("Learning guide")}</span></p><h1 id="page-title">${escape(candidate.title)}</h1><p class="description">${escape(candidate.description)}</p><p class="goal"><span>${ui("What to explain")}</span>${escape(candidate.goal)}</p></section>
<div class="workspace"><nav class="outline" aria-label="${ui("Suggested learning order")}"><p class="nav-heading">${ui("Learning order")} <span id="count"></span></p><p class="nav-note">${ui("This order is an AI suggestion.")}</p><ol id="concepts"></ol><div class="view-note"><span id="view-label"></span><p>${escape(candidate.view_reason)}</p></div></nav>
<article class="lesson" aria-labelledby="concept-title"><div class="lesson-header"><p id="position" class="eyebrow"></p><h2 id="concept-title" tabindex="-1"></h2><p id="summary" class="lead"></p></div><section id="connections" class="connections" aria-labelledby="connections-title"></section><section id="explanation" aria-label="${ui("Concept explanation")}"></section><section class="example" aria-labelledby="example-title"><h3 id="example-title">${ui("Explore a learning example")}</h3><p id="example"></p></section><section class="evidence" aria-labelledby="evidence-title"><h3 id="evidence-title">${ui("Continue with the original source")}</h3><div id="sources"></div></section><div class="controls"><button id="previous" type="button">${ui("← Previous concept")}</button><span id="current-count"></span><button id="next" type="button">${ui("Next concept →")}</button></div><p class="learning-note">${ui("These explanations are AI learning guidance. Opening or selecting a concept does not record understanding.")}</p></article></div>
<footer><span>${ui("Danseo · A derived learning view")}</span><span>${ui("Source checking, reader understanding and experiment reproduction are separate.")}</span></footer></main>
<noscript><p class="no-script">${ui("Concept navigation requires JavaScript. You can read the content in the original candidate JSON.")}</p></noscript>
<p class="sr-only" id="announcement" aria-live="polite"></p><script type="application/json" id="candidate">${json}</script><script>${script}</script></body></html>`;
}

export const run = args => runView(args, validateCandidate, renderValidatedCandidate, data => ({ representation: data.view, concepts: data.concepts.length, relations: data.relations.length }));
cliEntry(import.meta.url, run);
