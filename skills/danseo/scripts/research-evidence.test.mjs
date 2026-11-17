import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { overviewFor, countMentions, countText, verifyEvidence } from './research-evidence.mjs';
import { run } from './render-verified-research-view.mjs';
import { run as legacyRun } from './render-research-view.mjs';
import { hash } from './view-core.mjs';
import { performancePlan } from './performance-evidence.mjs';

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'danseo-evidence-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const candidate = JSON.parse(readFileSync(new URL('../assets/paper-relations.v2.example.json', import.meta.url), 'utf8'));
  Object.assign(candidate, overviewFor(candidate));
  const pdf = Buffer.from('%PDF-1.7\nSynthetic test bytes, not a real research paper.');
  const quote = '17 records (15 documents, 60 pairs)';
  const pages = JSON.stringify({pdf_sha256: hash(pdf), pages: [{page: 2, text: quote}]});
  writeFileSync(path.join(dir, 'source.pdf'), pdf); writeFileSync(path.join(dir, 'pages.json'), pages);
  const binding = {path: '/papers/0/claims/0/conditions/0', source_id: 'S.1', page: 2, quote, items: countMentions(quote)};
  const evidence = {version: 2, sources: [{id: 'S.1', document_path: 'source.pdf', document_sha256: hash(pdf), text_path: 'pages.json', text_sha256: hash(pages)}], counts: [binding], tables: [], performance: []};
  candidate.papers[0].claims[0].conditions[0] = countText(binding);
  evidence.performance = performancePlan(candidate).map(x => ({...x,kind:'non-performance',reason:'Synthetic count/method fixture, no performance comparison',comparison:null}));
  const input = path.join(dir, 'candidate.json'), sidecar = path.join(dir, 'evidence.json'), output = path.join(dir, 'view.html');
  const save = () => { writeFileSync(input, JSON.stringify(candidate)); writeFileSync(sidecar, JSON.stringify(evidence)); };
  save(); return {dir, candidate, evidence, binding, input, sidecar, output, save};
}

test('source-bound counts render; receipt never certifies semantics; no overwrite', t => {
  const f = fixture(t);
  const receipt = run([f.input, '--evidence', f.sidecar, '--out', f.output]);
  assert.equal(receipt.count_fields, 1); assert.equal(receipt.source_semantics, 'not-certified');
  assert.match(readFileSync(f.output, 'utf8'), /17 Records, 15 Documents, 60 Pairs/);
  const before = hash(readFileSync(f.output));
  assert.throws(() => run([f.input, '--evidence', f.sidecar, '--out', f.output]), /EEXIST/);
  assert.equal(hash(readFileSync(f.output)), before);
});

for (const key of ['description', 'view_reason', 'scope']) test(`contradictory ${key} blocks output`, t => {
  const f = fixture(t); f.candidate[key] = '원문 기반 확장 관계'; f.save();
  assert.throws(() => run([f.input, '--evidence', f.sidecar, '--out', f.output]), new RegExp(key));
  assert.equal(existsSync(f.output), false);
});

test('overview updates when state changes; AI cannot claim source-checked', t => {
  const f = fixture(t); assert.match(f.candidate.description, /source-checked relations: 0/);
  f.candidate.relations[0].needs_recheck = false;
  assert.throws(() => verifyEvidence(f.candidate, f.evidence, f.dir), /description/);
  Object.assign(f.candidate, overviewFor(f.candidate));
  f.candidate.relations[1].status = 'source-checked';
  assert.throws(() => verifyEvidence(f.candidate, f.evidence, f.dir), /AI relation/);
});

test('summary-only promotion blocks verified output without modifying inputs', t => {
  const f = fixture(t);
  for (const mutate of [
    c => c.papers[0].review_status = 'source-checked',
    c => c.sources[0].verification = 'agent-checked',
    c => c.relations[0].needs_recheck = false,
  ]) {
    const original = structuredClone(f.candidate);
    mutate(f.candidate); Object.assign(f.candidate, overviewFor(f.candidate)); f.save();
    const before = hash(readFileSync(f.input));
    assert.throws(() => run([f.input, '--evidence', f.sidecar, '--out', f.output]), /archived original/);
    assert.equal(hash(readFileSync(f.input)), before);
    assert.equal(existsSync(f.output), false);
    Object.assign(f.candidate, original);
  }
});

test('original HTML checks bind URL, bytes and excerpt; summaries and stale files fail', t => {
  const f = fixture(t), source = f.candidate.sources[0];
  const html = '<!doctype html><html><body>Original method passage.</body></html>';
  writeFileSync(path.join(f.dir, 'original.html'), html);
  source.verification = 'agent-checked';
  f.evidence.source_checks = [{source_id:source.id,url:source.url,format:'html',document_path:'original.html',document_sha256:hash(html),page:null,quote:'Original method passage.'}];
  assert.equal(verifyEvidence(f.candidate, f.evidence, f.dir).original_source_checks, 1);
  for (const mutate of [
    e => e.source_checks[0].url = 'https://example.org/wrong',
    e => e.source_checks[0].quote = 'Missing passage',
    e => e.source_checks[0].document_sha256 = '0'.repeat(64),
    e => e.source_checks[0].document_path = '../original.html',
    e => e.source_checks[0].page = 1,
  ]) { const e=structuredClone(f.evidence); mutate(e); assert.throws(() => verifyEvidence(f.candidate,e,f.dir)); }
  for (const hidden of ['<!-- > Original method passage. -->', '<head><title>Original method passage.</title></head>', '<noscript>Original method passage.</noscript>']) {
    const hiddenHtml = `<html>${hidden}<body>Unrelated passage.</body></html>`;
    writeFileSync(path.join(f.dir, 'original.html'), hiddenHtml);
    f.evidence.source_checks[0].document_sha256 = hash(hiddenHtml);
    assert.throws(() => verifyEvidence(f.candidate, f.evidence, f.dir), /quote missing/);
  }
  const summary = 'Verifier-authored summary with Original method passage.';
  writeFileSync(path.join(f.dir, 'original.html'), summary);
  f.evidence.source_checks[0].document_sha256 = hash(summary);
  assert.throws(() => verifyEvidence(f.candidate, f.evidence, f.dir), /not summary text/);
});

test('original PDF checks reuse hashed page extraction and reject wrong pages', t => {
  const f = fixture(t);
  f.candidate.sources[0].verification = 'agent-checked';
  f.evidence.source_checks = [{source_id:'S.1',url:f.candidate.sources[0].url,format:'pdf',document_path:'source.pdf',document_sha256:f.evidence.sources[0].document_sha256,page:2,quote:f.binding.quote}];
  assert.equal(verifyEvidence(f.candidate,f.evidence,f.dir).original_source_checks,1);
  f.candidate.sources[0].url = null;
  f.evidence.source_checks[0].url = null;
  assert.equal(verifyEvidence(f.candidate,f.evidence,f.dir).original_source_checks,1);
  f.evidence.source_checks[0].page = 1;
  assert.throws(() => verifyEvidence(f.candidate,f.evidence,f.dir),/original PDF page/);
});

test('current checked relations require every linked claim source; historical rechecks stay usable', t => {
  const f = fixture(t);
  assert.doesNotThrow(() => verifyEvidence(f.candidate, f.evidence, f.dir));
  const relation = f.candidate.relations[0];
  relation.needs_recheck = false;
  Object.assign(f.candidate, overviewFor(f.candidate));
  const html = '<html><body>Synthetic original passage.</body></html>';
  writeFileSync(path.join(f.dir, 'original.html'), html);
  f.candidate.sources[1].url = 'https://example.org/boundary';
  f.evidence.source_checks = f.candidate.sources.map(source => ({
    source_id: source.id, url: source.url, format: 'html', document_path: 'original.html',
    document_sha256: hash(html), page: null, quote: 'Synthetic original passage.',
  }));
  assert.doesNotThrow(() => verifyEvidence(f.candidate, f.evidence, f.dir));
  const originalReferences = relation.evidence_refs;
  const targetClaim = f.candidate.papers.find(paper => paper.id === relation.target).claims[0];
  relation.evidence_refs = [{paper_id: relation.target, claim_id: targetClaim.id}];
  assert.throws(() => verifyEvidence(f.candidate, f.evidence, f.dir), /asserting source paper/);
  relation.evidence_refs = originalReferences;
  const originalSource = relation.source;
  relation.source = f.candidate.papers[2].id;
  assert.throws(() => verifyEvidence(f.candidate, f.evidence, f.dir), /asserting source paper/);
  relation.source = originalSource;
  f.evidence.source_checks = [];
  assert.throws(() => verifyEvidence(f.candidate, f.evidence, f.dir), /archived original/);
  relation.evidence_refs = [];
  assert.throws(() => verifyEvidence(f.candidate, f.evidence, f.dir), /original claim references/);
});

for (const bad of ['17개 레코드=15개 문서, 60개 쌍', '17개 레코드는 15개 문서와 같다', '15 records (17 documents, 60 pairs)']) test(`incorrect count wording fails: ${bad}`, t => {
  const f = fixture(t); f.candidate.papers[0].claims[0].conditions[0] = bad; f.save();
  assert.throws(() => run([f.input, '--evidence', f.sidecar, '--out', f.output]), /source-derived/);
  assert.equal(existsSync(f.output), false);
});

test('missing evidence cannot pass; new count elsewhere requires its own binding', t => {
  const f = fixture(t); f.evidence.counts = [];
  assert.throws(() => verifyEvidence(f.candidate, f.evidence, f.dir), /needs source-bound/);
  f.evidence.counts = [f.binding]; f.candidate.papers[1].notes.push('17 records');
  assert.throws(() => verifyEvidence(f.candidate, f.evidence, f.dir), /notes\/0/);
});

test('tampered quote, page, unit, value, file and path fail', t => {
  const f = fixture(t);
  for (const mutate of [
    e => e.counts[0].quote = '18 records (15 documents, 60 pairs)',
    e => e.counts[0].page = 3,
    e => e.counts[0].items[0].value = 18,
    e => e.counts[0].items[0].unit = 'documents',
    e => e.sources[0].document_sha256 = '0'.repeat(64),
    e => e.sources[0].text_path = '../pages.json',
    e => e.sources[0].text_path = path.resolve(f.dir, 'pages.json'),
    e => e.counts.push(e.counts[0]),
  ]) { const e = structuredClone(f.evidence); mutate(e); assert.throws(() => verifyEvidence(f.candidate, e, f.dir)); }
  writeFileSync(path.join(f.dir, 'pages.json'), '{}');
  assert.throws(() => verifyEvidence(f.candidate, f.evidence, f.dir), /hash mismatch/);
});

test('legacy relation output is blocked; structure-only remains explicit; project output works', t => {
  const f = fixture(t);
  assert.equal(legacyRun([f.input, '--check']).checks, 'structure-only');
  assert.throws(() => legacyRun([f.input, '--out', f.output]), /requires render-verified/);
  assert.equal(existsSync(f.output), false);
  const project = new URL('../assets/project-application.v2.example.json', import.meta.url);
  assert.equal(legacyRun([project, '--out', f.output]).ok, true);
});

test('count parser handles supported Korean and English forms without hardcoded counts', () => {
  assert.deepEqual(countMentions('1,234 records (900 documents, 5000 pairs)'), [{unit:'records', value:1234},{unit:'documents', value:900},{unit:'pairs', value:5000}]);
  assert.deepEqual(countMentions('202개 레코드=200개 문서, 808개 (i*,j) 쌍'), [{unit:'records', value:202},{unit:'documents', value:200},{unit:'pairs', value:808}]);
});

test('source quotes cannot truncate numeric tokens', t => {
  const f = fixture(t);
  for (const [source, quote] of [['117 records','17 records'], ['1,234 records','234 records'], ['17 recordsExtra','17 records']]) {
    const pages=JSON.stringify({pdf_sha256:f.evidence.sources[0].document_sha256,pages:[{page:2,text:source}]});
    writeFileSync(path.join(f.dir,'pages.json'),pages);f.evidence.sources[0].text_sha256=hash(pages);
    f.binding.quote=quote;f.binding.items=countMentions(quote);
    f.candidate.papers[0].claims[0].conditions[0]=countText(f.binding);
    assert.throws(()=>verifyEvidence(f.candidate,f.evidence,f.dir),/complete tokens/);
  }
});
