import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { hash, fail, object, text, list } from './view-core.mjs';
import { verifyPerformance, performanceFields } from './performance-evidence.mjs';

// A bounded evidence gate, not a natural-language truth classifier.
export function overviewFor(candidate) {
  const relations = candidate.relations ?? [];
  const checked = relations.filter(r => r.origin === 'source' && r.status === 'source-checked' && !r.needs_recheck);
  const ai = relations.filter(r => r.origin === 'ai');
  const pending = relations.length - checked.length - ai.length;
  const backgroundCount = candidate.backgrounds?.length ?? 0;
  if (candidate.language === 'ko') return {
    description: `논문 ${candidate.papers.length}편 · 원문 확인 연결 ${checked.length}개 · AI 제안 ${ai.length}개 · 미확인 연결 ${pending}개.` + (backgroundCount ? ` 개념 배경 ${backgroundCount}개 · AI 선정 자료 ${candidate.backgrounds.reduce((n, b) => n + b.readings.length, 0)}개.` : ''),
    view_reason: '원문 확인 연결과 AI 제안을 나누어 살펴보세요. AI 제안을 저자가 주장한 연결로 취급하지 않습니다.',
    scope: '입력된 논문과 연결만 표시합니다. 원문 범위와 미확인 부분은 각 근거에서 확인하세요. 원문 확인은 재현이나 독자의 이해 완료를 뜻하지 않습니다.',
  };
  const backgroundNotice = backgroundCount ? ` Concept backgrounds: ${backgroundCount} · AI-selected readings: ${candidate.backgrounds.reduce((n, b) => n + b.readings.length, 0)}.` : '';
  return {
    description: `Papers: ${candidate.papers.length} · source-checked relations: ${checked.length} · AI proposals: ${ai.length} · unchecked relations: ${pending}.` + backgroundNotice,
    view_reason: 'Select source-checked relations and AI proposals separately. AI proposals are not treated as relations asserted by the authors.',
    scope: 'Only input papers and relations are shown. Check each evidence scope for source coverage and unknowns. Source checking does not establish reproduction or reader understanding.',
  };
}

const units = { records: 'Records', documents: 'Documents', pairs: 'Pairs' };
const normalize = value => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
function containsQuote(page, quote) {
  const haystack = normalize(page), needle = normalize(quote);
  // A substring must not turn 117 into 17 or 1,234 into 234.
  const token = /[\p{L}\p{N}.,]/u;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    const before = haystack[at - 1], after = haystack[at + needle.length];
    if (!(token.test(needle[0]) && before && token.test(before)) && !(token.test(needle.at(-1)) && after && /[\p{L}\p{N}]/u.test(after))) return true;
    at = haystack.indexOf(needle, at + 1);
  }
  return false;
}
export function countMentions(value) {
  const result = [];
  // Explicitly supported numeric count forms only. No claims about arbitrary quantities.
  const pattern = /(?<![\w.,])([0-9]+(?:,[0-9]{3})*)\s*(?:개\s*)?(?:\([^)]{1,30}\)\s*)?(records?\b|documents?\b|pairs?\b|레코드|기록|문서|(?:질의\s*)?쌍)/giu;
  for (const match of normalize(value).matchAll(pattern)) {
    const raw = match[2].toLowerCase();
    const unit = /record|레코드|기록/.test(raw) ? 'records' : /document|문서/.test(raw) ? 'documents' : 'pairs';
    const number = Number(match[1].replaceAll(',', ''));
    if (!Number.isSafeInteger(number)) fail('Count exceeds safe integer range');
    result.push({ unit, value: number });
  }
  return result;
}

export function countText(binding) {
  return `Source count (${binding.source_id}, p. ${binding.page}): ${binding.items.map(i => `${i.value} ${units[i.unit]}`).join(', ')}.`;
}

function visibleCountFields(candidate) {
  const fields = new Map();
  candidate.papers.forEach((paper, p) => {
    (paper.notes ?? []).forEach((value, n) => fields.set(`/papers/${p}/notes/${n}`, value));
    paper.claims.forEach((claim, c) => {
      const base = `/papers/${p}/claims/${c}`;
      fields.set(`${base}/statement`, claim.statement);
      for (const key of ['conditions', 'limitations']) claim[key].forEach((value, i) => fields.set(`${base}/${key}/${i}`, value));
    });
  });
  for (const [pointer, field] of performanceFields(candidate)) {
    if (/^\/(?:concepts|backgrounds)\//.test(pointer)) fields.set(pointer, field.value);
  }
  return fields;
}

function localFile(base, relative, expectedHash) {
  text(relative, 'source path');
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) fail('Source path must stay inside the evidence directory');
  const resolved = realpathSync(path.resolve(base, relative));
  const rel = path.relative(realpathSync(base), resolved);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) fail('Source path escapes evidence directory');
  const info = statSync(resolved);
  if (!info.isFile() || info.size > 32 * 1024 * 1024) fail('Expected source file under 32 MiB');
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) fail('Expected SHA-256');
  const bytes = readFileSync(resolved);
  if (hash(bytes) !== expectedHash) fail(`Source hash mismatch: ${relative}`);
  return bytes;
}

function verifySourceChecks(candidate, evidence, directory, pdfSources) {
  const checks = evidence.source_checks ?? [];
  list(checks, 'source_checks');
  const originals = new Set();
  for (const check of checks) {
    object(check, ['source_id', 'url', 'format', 'document_path', 'document_sha256', 'page', 'quote'], 'source_check');
    const source = candidate.sources.find(s => s.id === check.source_id);
    if (!source || check.url !== source.url || (check.format === 'html' && !source.url)) fail('source_check: exact registered original URL required (local PDFs may use null)');
    text(check.quote, 'source_check.quote');
    const bytes = localFile(directory, check.document_path, check.document_sha256);
    if (check.format === 'pdf') {
      const registered = evidence.sources.find(s => s.id === source.id);
      if (!registered || registered.document_sha256 !== check.document_sha256 || bytes.subarray(0, 5).toString() !== '%PDF-') fail('source_check: original PDF must match registered page extraction');
      const page = pdfSources.get(source.id)?.get(check.page);
      if (!page || !containsQuote(page, check.quote)) fail('source_check: quote missing from original PDF page');
    } else if (check.format === 'html') {
      const html = bytes.toString('utf8');
      if (check.page !== null || !/<(?:!doctype\s+html|html)[\s>]/i.test(html)) fail('source_check: expected original HTML with page:null, not summary text');
      // Match body text, excluding obvious non-content. CSS visibility and the
      // remote publisher's identity still need separate inspection.
      const body = html.replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(head|script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<[^>]*>/g, ' ');
      if (!containsQuote(body, check.quote)) fail('source_check: quote missing from original HTML');
    } else fail('source_check: format must be html or pdf');
    originals.add(source.id);
  }
  const requireOriginal = (id, at) => {
    if (!originals.has(id)) fail(`${at}: checked state requires archived original source_checks; summaries stay not-checked/draft/proposed (or retain historical status with needs_recheck:true)`);
  };
  for (const source of candidate.sources) if (source.verification === 'agent-checked') requireOriginal(source.id, source.id);
  const claimSources = (paper, claimId) => paper?.claims.find(c => c.id === claimId)?.evidence ?? [];
  for (const paper of candidate.papers) if (paper.review_status === 'source-checked') {
    if (!paper.claims.length) fail(`${paper.id}: whole-paper source-checked requires original claim evidence; use draft for passage-only checks`);
    for (const claim of paper.claims) {
      if (!claim.evidence.length) fail(`${paper.id}/${claim.id}: checked paper requires original claim evidence`);
      claim.evidence.forEach(id => requireOriginal(id, `${paper.id}/${claim.id}`));
    }
  }
  for (const relation of candidate.relations) if (relation.status === 'source-checked' && !relation.needs_recheck) {
    if (!relation.evidence_refs.length) fail(`${relation.id}: checked relation needs original claim references`);
    if (!relation.evidence_refs.some(ref => ref.paper_id === relation.source)) fail(`${relation.id}: checked relation requires evidence from its asserting source paper`);
    for (const ref of relation.evidence_refs) {
      const sourceIds = claimSources(candidate.papers.find(p => p.id === ref.paper_id), ref.claim_id);
      if (!sourceIds.length) fail(`${relation.id}: checked relation needs original claim evidence`);
      sourceIds.forEach(id => requireOriginal(id, relation.id));
    }
  }
  return originals.size;
}

export function verifyEvidence(candidate, evidence, directory) {
  if (candidate.version !== 2 || candidate.mode !== 'paper-relations') fail('Evidence gate requires version 2 paper-relations');
  for (const r of candidate.relations) {
    if (r.origin === 'ai' && (r.status !== 'proposed' || r.review !== null)) fail(`${r.id}: AI relation must remain proposed with review:null`);
  }
  for (const [key, value] of Object.entries(overviewFor(candidate))) {
    if (candidate[key] !== value) fail(`${key}: regenerate the canonical overview with --overview`);
  }
  if (![1, 2].includes(evidence.version)) fail('Unsupported evidence version');
  object(evidence, [...(evidence.version === 2 ? ['version', 'sources', 'counts', 'tables', 'performance'] : ['version', 'sources', 'counts']), ...(Object.hasOwn(evidence, 'source_checks') ? ['source_checks'] : [])], 'evidence');
  list(evidence.sources, 'sources'); list(evidence.counts, 'counts');
  const sources = new Map();
  for (const source of evidence.sources) {
    object(source, ['id', 'document_path', 'document_sha256', 'text_path', 'text_sha256'], 'source');
    if (typeof source.id !== 'string' || !/^[A-Za-z0-9._-]+$/.test(source.id) || sources.has(source.id)) fail('Invalid or duplicate source id');
    const pdf = localFile(directory, source.document_path, source.document_sha256);
    if (pdf.subarray(0, 5).toString() !== '%PDF-') fail('Expected original PDF');
    const pages = JSON.parse(localFile(directory, source.text_path, source.text_sha256).toString('utf8').replace(/^\uFEFF/, ''));
    if (pages.pdf_sha256 !== source.document_sha256 || !Array.isArray(pages.pages)) fail('Page text must identify the original PDF hash');
    const byPage = new Map();
    for (const page of pages.pages) {
      if (!Number.isSafeInteger(page.page) || page.page < 1 || typeof page.text !== 'string' || byPage.has(page.page)) fail('Invalid or duplicate source page');
      byPage.set(page.page, page.text);
    }
    sources.set(source.id, byPage);
  }
  const fields = visibleCountFields(candidate);
  const covered = new Set();
  // These paths only defer the whole-field count format. verifyPerformance below
  // must validate the exact generated report and its source before any success.
  const reports = new Map((Array.isArray(evidence.performance) ? evidence.performance : []).filter(e => e?.kind === 'table-comparison').map(e => [e.path, e.comparison?.table_id]));
  for (const binding of evidence.counts) {
    object(binding, ['path', 'source_id', 'page', 'quote', 'items'], 'count binding');
    if (!fields.has(binding.path) || covered.has(binding.path)) fail('Invalid or duplicate count field path');
    const allowedSources = performanceFields(candidate).get(binding.path)?.sourceIds ?? [];
    if (!candidate.sources.some(s => s.id === binding.source_id) || !allowedSources.includes(binding.source_id)) fail(`${binding.path}: source must be linked to the displayed paper/claim or concept background`);
    text(binding.quote, 'quote'); list(binding.items, 'items');
    if (!binding.items.length) fail('Count items cannot be empty');
    for (const item of binding.items) {
      object(item, ['unit', 'value'], 'count item');
      if (!Object.hasOwn(units, item.unit) || !Number.isSafeInteger(item.value) || item.value < 0) fail('Invalid count unit/value');
    }
    const page = sources.get(binding.source_id)?.get(binding.page);
    if (!page || !containsQuote(page, binding.quote)) fail(`${binding.path}: quote missing from declared source page (complete tokens required)`);
    const extracted = countMentions(binding.quote);
    if (JSON.stringify(extracted) !== JSON.stringify(binding.items.map(({unit, value}) => ({unit, value})))) fail(`${binding.path}: count values/units differ from source quote`);
    if (!reports.has(binding.path) && fields.get(binding.path) !== countText(binding)) fail(`${binding.path}: use the exact source-derived count text (no equality or paraphrase)`);
    covered.add(binding.path);
  }
  for (const [pointer, value] of fields) {
    // The regression concerns dataset record/pair totals. A retrieval setting
    // such as top-5 documents is not necessarily expressed as a literal count
    // in the source; do not silently reinterpret it as a dataset total.
    if (countMentions(value).some(i => i.unit !== 'documents') && !covered.has(pointer) && !reports.has(pointer)) fail(`${pointer}: record/pair count statement needs source-bound evidence`);
  }
  const performance = verifyPerformance(candidate, evidence, sources);
  for (const [pointer, tableId] of reports) {
    if (!fields.has(pointer)) continue;
    const mentions = countMentions(fields.get(pointer));
    if (!mentions.length) continue;
    const table = evidence.tables.find(t => t.id === tableId);
    const sourceCounts = countMentions(table.quote);
    if (mentions.some(i => !sourceCounts.some(s => s.unit === i.unit && s.value === i.value))) fail(`${pointer}: table report count differs from its source block`);
    covered.add(pointer);
  }
  const originalChecks = verifySourceChecks(candidate, evidence, directory, sources);
  return { checks: 'canonical-overview-source-counts-and-performance', count_fields: covered.size, source_files: sources.size, original_source_checks: originalChecks, ...performance, source_semantics: 'not-certified', visual_review: 'not-run' };
}
