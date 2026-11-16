import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { hash, fail, object, text, list } from './view-core.mjs';
import { verifyPerformance } from './performance-evidence.mjs';

// A bounded evidence gate, not a natural-language truth classifier.
export function overviewFor(candidate) {
  const relations = candidate.relations ?? [];
  const checked = relations.filter(r => r.origin === 'source' && r.status === 'source-checked' && !r.needs_recheck);
  const ai = relations.filter(r => r.origin === 'ai');
  const pending = relations.length - checked.length - ai.length;
  return {
    description: `논문 ${candidate.papers.length}편 · 원문 확인 관계 ${checked.length}개 · AI 제안 ${ai.length}개 · 미확인 관계 ${pending}개.`,
    view_reason: '원문 확인 관계와 AI 제안을 구분해 선택합니다. AI 제안은 저자가 주장한 관계로 취급하지 않습니다.',
    scope: '입력에 포함된 논문과 관계만 표시합니다. 원문 확인 범위와 미확인 사항은 각 근거의 scope에서 확인합니다. 원문 확인은 논문 재현이나 사용자 이해를 뜻하지 않습니다.',
  };
}

const units = { records: '레코드', documents: '문서', pairs: '쌍' };
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
  return `원문 수량 (${binding.source_id}, p. ${binding.page}): ${binding.items.map(i => `${i.value}개 ${units[i.unit]}`).join(', ')}.`;
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

export function verifyEvidence(candidate, evidence, directory) {
  if (candidate.version !== 2 || candidate.mode !== 'paper-relations') fail('Evidence gate requires version 2 paper-relations');
  for (const r of candidate.relations) {
    if (r.origin === 'ai' && (r.status !== 'proposed' || r.review !== null)) fail(`${r.id}: AI relation must remain proposed with review:null`);
  }
  for (const [key, value] of Object.entries(overviewFor(candidate))) {
    if (candidate[key] !== value) fail(`${key}: regenerate the canonical overview with --overview`);
  }
  if (![1, 2].includes(evidence.version)) fail('Unsupported evidence version');
  object(evidence, evidence.version === 2 ? ['version', 'sources', 'counts', 'tables', 'performance'] : ['version', 'sources', 'counts'], 'evidence');
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
    const parts = binding.path.split('/');
    const paper = candidate.papers[Number(parts[2])];
    const claims = parts[3] === 'claims' ? [paper.claims[Number(parts[4])]] : paper.claims;
    if (!candidate.sources.some(s => s.id === binding.source_id) || !claims.some(c => c.evidence.includes(binding.source_id))) fail(`${binding.path}: source must be linked to the displayed paper/claim`);
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
  return { checks: 'canonical-overview-source-counts-and-performance', count_fields: covered.size, source_files: sources.size, ...performance, source_semantics: 'not-certified', visual_review: 'not-run' };
}
