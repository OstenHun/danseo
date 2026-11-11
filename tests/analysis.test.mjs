import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stringify } from 'yaml';
import test from 'node:test';
import { pdf } from './helpers/source-pdf.mjs';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFileSync(path, 'utf8');
const claim = (id, value = id) => ({ id, statement: 'Reported result ' + value, conditions: 'One test set, percent accuracy', limits: 'No transfer evaluation',
  locators: [{ type: 'pdf-page-range', start: 1, end: 1 }, { type: 'table', value: '1' }] });
const answer = (overrides = {}) => ({ overview: 'The study asks a question, compares two methods, and reports a result.',
  question: 'How was the result evaluated?', answer: 'A held-out test set; Table 1, PDF p.1. Result is reported in percent.',
  interpretation: 'AI interpretation: this is limited to the reported test set.', remaining_questions: 'Other model sizes are unknown.',
  resume: 'PDF p.1, Table 1 footnote', claim_ids: ['c1', 'c2'], comparison_claims: ['c1', 'c2'], ...overrides });

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), '단서 분석 test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const topic = join(root, '주제 하나'), workspace = join(root, '공통 카드');
  mkdirSync(workspace);
  const json = (path, value) => { writeFileSync(path, JSON.stringify(value, null, 2)); return path; };
  const config = { schema_version: 'workspace-1', records: [], projects: [], claim_reviews: [] };
  const configPath = join(workspace, 'workspace.json');
  const saveConfig = () => json(configPath, config);
  saveConfig();
  function run(dir, action, ...args) { return spawnSync(process.execPath, [cli, 'topic', action, '--dir', dir, ...args], { encoding: 'utf8' }); }
  function ok(dir, action, ...args) {
    const p = run(dir, action, ...args); assert.equal(p.status, 0, p.stderr); return JSON.parse(p.stdout);
  }
  const papers = ['A', 'B'].map(key => ({ key, title: 'Paper ' + key, authors: 'Alice Reader', year: 2024,
    source: 'https://example.com/' + key, edition: 'Journal 2024', reason: 'Compare methods', scope: 'abstract' }));
  function topicAt(dir, question = 'How did the two studies evaluate results?') {
    ok(dir, 'init', '--question', question);
    ok(dir, 'search', '--input', json(join(root, 'search.json'), { query: question, papers }));
    ok(dir, 'select', '--ids', '1,2', '--note', 'Reader-selected methods');
  }
  topicAt(topic);
  function collect(dir, key, edition = 'Journal 2024', kind = 'published', round = '1') {
    const source = join(root, key + edition + '.pdf');
    writeFileSync(source, pdf('Paper ' + key, 'Alice Reader', edition));
    return ok(dir, 'collect', '--id', key === 'A' ? '1' : '2', '--round', round, '--existing', source,
      '--edition', edition, '--proof', edition, '--kind', kind);
  }
  function card(key, file, claims = [claim('c1'), claim('c2')]) {
    const id = 'paper-' + key + '-' + hash(Buffer.from(file.edition)).slice(0, 8);
    const path = join(workspace, id + '.md');
    const data = { schema_version: 'draft-2', type: 'paper', id,
      source: { version: file.edition, path: file.path, url: 'https://example.com/' + key }, review: { status: 'draft' }, claims };
    const save = () => writeFileSync(path, `---\n${stringify(data)}---\n# Paper ${key}\n\nUser card notes preserved.\n`);
    save(); if (!config.records.includes(id + '.md')) config.records.push(id + '.md'); saveConfig();
    return { id, path, data, save };
  }
  const sources = collect(topic, 'B'); collect(topic, 'A');
  const ready = ok(topic, 'sources').ready;
  const a = card('A', ready.find(r => r.paper.key === 'A').file);
  const b = card('B', ready.find(r => r.paper.key === 'B').file);
  function open(dir = topic, id = '1', paper = a) { return ok(dir, 'analysis-open', '--id', id, '--workspace', workspace, '--paper', paper.id); }
  function save(doc, value = answer(), dir = topic, id = '1') {
    return ok(dir, 'analysis-save', '--id', id, '--sha', doc.document_sha256, '--input', json(join(root, 'answer.json'), value));
  }
  function review(paper = a, verdict = 'supported', date = '2026-11-10T12:00:00Z', changes = []) {
    const n = config.claim_reviews.length;
    const source = paper.data.source;
    const inputPath = join(workspace, 'input-' + n + '.json');
    const resultPath = join(workspace, 'result-' + n + '.json');
    json(inputPath, { run_id: 'run-' + n, papers: [{ paper_id: paper.id, card_sha256: hash(readFileSync(paper.path)),
      source: { version: source.version, url: source.url, pdf_sha256: hash(readFileSync(source.path)) }, claims: paper.data.claims.filter(c => c.id === 'c1') }] });
    const result = { input_sha256: hash(readFileSync(inputPath)), reviewer: 'fixture reviewer', review_type: 'independent-source-review', reviewed_at: date,
      claims: [{ paper_id: paper.id, claim_id: 'c1', verdict, reason: 'Fixture only, not a real semantic verdict',
        evidence: [{ pdf_page: 1, section: 'Table 1', note: 'Fixture page inspected' }], required_changes: changes }],
      source_checks: [{ paper_id: paper.id, pdf_sha256: hash(readFileSync(source.path)) }] };
    json(resultPath, result);
    config.claim_reviews.push({ input: 'input-' + n + '.json', result: 'result-' + n + '.json', result_sha256: hash(readFileSync(resultPath)) }); saveConfig();
    return { inputPath, resultPath, result };
  }
  return { root, topic, workspace, config, saveConfig, json, run, ok, a, b, open, save, review, collect, card, topicAt };
}

test('A→B→fresh A appends to one document, preserves notes, and reuses a Paper in another topic', t => {
  const f = setup(t), { topic, ok, open, save, a, b } = f;
  const cardBytes = readFileSync(a.path), selection = readFileSync(join(topic, 'topic.json'));
  const first = save(open());
  const other = save(open(topic, '2', b), answer({ question: 'B only question' }), topic, '2');
  const otherBytes = readFileSync(other.document);
  appendFileSync(first.document, '\n사용자 메모: 표본을 다시 보기.\n');
  const reopened = ok(topic, 'analysis-open', '--id', '1');
  assert.match(reopened.markdown, /사용자 메모/);
  const before = readFileSync(reopened.document);
  assert.equal(ok(topic, 'analysis-open', '--id', '1').document_sha256, reopened.document_sha256);
  assert.deepEqual(readFileSync(reopened.document), before);
  const followed = save(reopened, answer({ overview: undefined, question: 'Who were the evaluation subjects?' }));
  assert.match(followed.markdown, /How was the result evaluated/);
  assert.match(followed.markdown, /Who were the evaluation subjects/);
  assert.match(followed.markdown, /사용자 메모/);
  assert.deepEqual(readFileSync(other.document), otherBytes);
  assert.equal(readdirSync(topic).filter(x => /^analysis-.*\.md$/.test(x)).length, 2);
  assert.equal(ok(topic, 'show').analyses[0].document, followed.document);
  assert.equal(ok(topic, 'analysis-list')[0].binding.paper_id, a.id);
  const second = join(f.root, '다른 주제'); f.topicAt(second, 'What are the limitations?'); f.collect(second, 'A');
  const secondDoc = save(open(second), answer({ question: 'Different topic answer' }), second);
  assert.equal(secondDoc.binding.paper_id, a.id);
  assert.notEqual(secondDoc.document, first.document);
  assert.doesNotMatch(secondDoc.markdown, /Who were the evaluation subjects/);
  assert.deepEqual(readFileSync(a.path), cardBytes);
  assert.deepEqual(readFileSync(join(topic, 'topic.json')), selection);
});

test('changed, missing, pending and declined PDFs never start analysis', t => {
  const f = setup(t);
  const source = f.a.data.source.path, bytes = readFileSync(source);
  writeFileSync(source, 'changed');
  assert.match(f.run(f.topic, 'analysis-open', '--id', '1', '--workspace', f.workspace, '--paper', f.a.id).stderr, /분석 가능한 원문/);
  assert.equal(readdirSync(f.topic).filter(x => x.startsWith('analysis-')).length, 0);
  writeFileSync(source, bytes);
  const draft = f.collect(f.topic, 'A', 'Preprint v2', 'draft');
  // Remove the publication in a fixture copy: only an unapproved draft remains.
  const bookPath = join(f.topic, 'sources.json'), book = JSON.parse(read(bookPath));
  book.rows.find(r => r.key === 'A').files = book.rows.find(r => r.key === 'A').files.filter(x => x.draft);
  f.json(bookPath, book);
  const file = draft.rows.find(r => r.paper.key === 'A').files.find(x => x.draft);
  const c = f.card('A', file);
  assert.notEqual(f.run(f.topic, 'analysis-open', '--id', '1', '--workspace', f.workspace, '--paper', c.id).status, 0);
  f.ok(f.topic, 'decide', '--id', '1', '--round', '1', '--sha', file.sha256, '--answer', 'decline');
  assert.notEqual(f.run(f.topic, 'analysis-open', '--id', '1', '--workspace', f.workspace, '--paper', c.id).status, 0);
  f.ok(f.topic, 'decide', '--id', '1', '--round', '1', '--sha', file.sha256, '--answer', 'accept');
  const doc = f.open(f.topic, '1', c);
  rmSync(source);
  assert.equal(doc.binding.edition, 'Preprint v2');
});

test('a revised edition preserves the old answer and removes previous comparison candidates', t => {
  const f = setup(t), doc = f.save(f.open()); f.review();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 1);
  f.ok(f.topic, 'search', '--input', f.json(join(f.root, 'new-search.json'), { query: 'new edition', papers: [{
    key: 'A', title: 'Paper A', authors: 'Alice Reader', year: 2025, source: 'https://example.com/A2', edition: 'Journal 2025', reason: 'New edition', scope: 'abstract'
  }] }));
  f.ok(f.topic, 'unselect', '--ids', '1'); f.ok(f.topic, 'select', '--ids', '1', '--round', '2');
  const newer = f.collect(f.topic, 'A', 'Journal 2025', 'published', '2');
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  assert.notEqual(f.run(f.topic, 'analysis-open', '--id', '1').status, 0);
  const file = newer.ready.find(x => x.paper.key === 'A').file, c = f.card('A', file);
  const next = f.open(f.topic, '1', c);
  assert.equal(next.document, doc.document);
  assert.match(next.markdown, /Journal 2024/); assert.match(next.markdown, /Journal 2025/);
  assert.match(next.markdown, /How was the result evaluated/);
  assert.deepEqual(next.binding.comparison_claims, []);
  assert.match(read(f.a.path), /Journal 2024/);
});

test('concurrent memo edits, bad references, and malformed documents preserve original bytes', t => {
  const f = setup(t), doc = f.open();
  const noOverview = f.json(join(f.root, 'no-overview.json'), answer({ overview: undefined }));
  assert.match(f.run(f.topic, 'analysis-save', '--id', '1', '--sha', doc.document_sha256, '--input', noOverview).stderr, /짧은 개요/);
  appendFileSync(doc.document, '\nNew user memo\n');
  const before = readFileSync(doc.document);
  const input = f.json(join(f.root, 'input.json'), answer());
  assert.match(f.run(f.topic, 'analysis-save', '--id', '1', '--sha', doc.document_sha256, '--input', input).stderr, /다시 열고/);
  assert.deepEqual(readFileSync(doc.document), before);
  const latest = f.ok(f.topic, 'analysis-open', '--id', '1');
  f.json(input, answer({ claim_ids: ['missing'], comparison_claims: ['missing'] }));
  assert.notEqual(f.run(f.topic, 'analysis-save', '--id', '1', '--sha', latest.document_sha256, '--input', input).status, 0);
  assert.deepEqual(readFileSync(doc.document), before);
  writeFileSync(doc.document, 'Broken metadata\nUser notes');
  assert.notEqual(f.run(f.topic, 'analysis-open', '--id', '1').status, 0);
  assert.equal(read(doc.document), 'Broken metadata\nUser notes');
});

test('only current source-supported candidates pass; conditions, statement and locators invalidate review', t => {
  const f = setup(t); f.save(f.open()); f.review();
  let result = f.ok(f.topic, 'comparison-input');
  assert.deepEqual(result.claims.map(x => x.claim_id), ['c1']);
  assert.equal(result.held.find(x => x.claim_id === 'c2').reason, '원문 대조 기록 없음');
  const c = f.a.data.claims[0], original = structuredClone(c);
  for (const change of [() => c.statement += ' changed', () => c.conditions += ' changed', () => c.locators[0].start = c.locators[0].end = 2]) {
    change(); f.a.save();
    result = f.ok(f.topic, 'comparison-input'); assert.equal(result.claims.length, 0);
    assert.match(result.held.find(x => x.claim_id === 'c1').reason, /다릅니다/);
    Object.assign(c, structuredClone(original)); f.a.save();
  }
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 1);
  appendFileSync(f.a.data.source.path, '\nchanged');
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
});

test('latest negative, same-time conflict, pending required changes and damaged review do not revive older support', t => {
  const f = setup(t); f.save(f.open()); f.review();
  f.review(f.a, 'contradicted', '2026-11-10T13:00:00Z');
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  f.review(f.a, 'supported', '2026-11-10T22:00:00+09:00');
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  f.review(f.a, 'supported', '2026-11-10T14:00:00Z', ['Check units']);
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  const r = f.review(f.a, 'supported', '2026-11-10T15:00:00Z');
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 1);
  appendFileSync(r.resultPath, 'broken');
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
});

test('review source hash, input hash, and exact reviewed claim set must agree', t => {
  const f = setup(t); f.save(f.open()); const r = f.review();
  const verify = () => { f.json(r.resultPath, r.result); f.config.claim_reviews[0].result_sha256 = hash(readFileSync(r.resultPath)); f.saveConfig(); };
  r.result.source_checks[0].pdf_sha256 = '0'.repeat(64); verify();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  r.result.source_checks[0].pdf_sha256 = hash(readFileSync(f.a.data.source.path));
  r.result.claims.push(structuredClone(r.result.claims[0])); verify();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  r.result.claims.pop(); r.result.input_sha256 = '0'.repeat(64); verify();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
});

test('duplicate latest support cannot conceal a third same-instant contradicted verdict', t => {
  const f = setup(t); f.save(f.open()); f.review();
  f.config.claim_reviews.push(structuredClone(f.config.claim_reviews[0])); f.saveConfig();
  f.review(f.a, 'contradicted', '2026-11-10T21:00:00+09:00');
  const report = f.ok(f.topic, 'comparison-input');
  assert.equal(report.claims.length, 0);
  assert.match(report.held.find(h => h.claim_id === 'c1').reason, /중복/);
});

test('connected extracted text requires matching review hash and becomes stale when changed or absent', t => {
  const f = setup(t); f.save(f.open());
  const textPath = join(f.workspace, 'source-text.json');
  const bytes = Buffer.from('source extraction'); writeFileSync(textPath, bytes);
  f.a.data.source.text_path = 'source-text.json'; f.a.save();
  const r = f.review();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  const input = JSON.parse(read(r.inputPath));
  function pin(value) {
    input.papers[0].source.text_sha256 = value; f.json(r.inputPath, input);
    r.result.input_sha256 = hash(readFileSync(r.inputPath)); f.json(r.resultPath, r.result);
    f.config.claim_reviews[0].result_sha256 = hash(readFileSync(r.resultPath)); f.saveConfig();
  }
  pin(null); assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  pin(hash(bytes)); assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 1);
  writeFileSync(textPath, 'changed'); assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  rmSync(textPath); assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  writeFileSync(textPath, bytes); assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 1);
  delete f.a.data.source.text_path; f.a.save(); assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
});

test('later stale review keeps A→B→A on hold and empty candidates withdraw prior input', t => {
  const f = setup(t); f.save(f.open()); f.review();
  const statement = f.a.data.claims[0].statement;
  f.a.data.claims[0].statement += ' revision B'; f.a.save();
  f.review(f.a, 'supported', '2026-11-10T13:00:00Z');
  f.a.data.claims[0].statement = statement; f.a.save();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  const doc = f.ok(f.topic, 'analysis-open', '--id', '1');
  f.save(doc, answer({ overview: undefined, comparison_claims: [] }));
  const report = f.ok(f.topic, 'comparison-input');
  assert.equal(report.claims.length, 0);
  assert.equal(report.held.find(x => x.key === 'A').reason, '비교 후보 주장 없음');
});

test('a new answer cites only its evidence while preserving earlier topic comparison candidates', t => {
  const f = setup(t);
  const first = f.save(f.open(), answer({ claim_ids: ['c1'], comparison_claims: ['c1'] }));
  const second = f.save(first, answer({ overview: undefined, question: 'A separate question', claim_ids: ['c2'], comparison_claims: ['c1', 'c2'] }));
  assert.deepEqual(second.binding.comparison_claims, ['c1', 'c2']);
  assert.match(second.markdown.split('## A separate question')[1], new RegExp(`${f.a.id}/c2`));
  assert.doesNotMatch(second.markdown.split('## A separate question')[1], new RegExp(`${f.a.id}/c1`));
});

test('a damaged B document keeps topic selections and healthy A comparison input available', t => {
  const f = setup(t); f.save(f.open()); f.review();
  const b = f.open(f.topic, '2', f.b); writeFileSync(b.document, 'Damaged B; preserve notes');
  const show = f.ok(f.topic, 'show');
  assert.equal(show.selected.length, 2);
  assert.equal(show.analyses.find(x => x.key === 'B').state, 'needs-recheck');
  assert.equal(f.ok(f.topic, 'analysis-list').find(x => x.key === 'A').state, 'available');
  const comparison = f.ok(f.topic, 'comparison-input');
  assert.deepEqual(comparison.claims.map(x => x.claim_id), ['c1']);
  assert.match(comparison.held.find(x => x.key === 'B').reason, /연결 정보/);
  assert.notEqual(f.run(f.topic, 'analysis-open', '--id', '2').status, 0);
  assert.equal(read(b.document), 'Damaged B; preserve notes');
});

test('review timestamps without a timezone cannot decide the newest verdict', t => {
  const f = setup(t); f.save(f.open());
  f.review(f.a, 'supported', '2026-11-10T12:00:00');
  const report = f.ok(f.topic, 'comparison-input');
  assert.equal(report.claims.length, 0);
  assert.match(report.held.find(x => x.claim_id === 'c1').warnings.join(' '), /UTC 오프셋/);
});

test('revision limit is validated before publishing or backing up a replacement', t => {
  const f = setup(t), doc = f.open();
  const raw = read(doc.document), match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  const state = JSON.parse(match[1]);
  state.revisions = Array.from({ length: 1000 }, () => structuredClone(state.revisions[0]));
  state.revisions.at(-1).round = 2;
  writeFileSync(doc.document, `---\n${JSON.stringify(state)}\n---\n` + raw.slice(match[0].length));
  const before = readFileSync(doc.document), files = readdirSync(f.topic);
  const result = f.run(f.topic, 'analysis-open', '--id', '1', '--workspace', f.workspace, '--paper', f.a.id);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /판본 이력 한도/);
  assert.deepEqual(readFileSync(doc.document), before);
  assert.deepEqual(readdirSync(f.topic), files);
});

test('a mismatched existing backup refuses saving without changing the document', t => {
  const f = setup(t), doc = f.open();
  const before = readFileSync(doc.document);
  writeFileSync(doc.document + '.' + doc.document_sha256 + '.bak', 'different backup');
  const input = f.json(join(f.root, 'backup-answer.json'), answer());
  const result = f.run(f.topic, 'analysis-save', '--id', '1', '--sha', doc.document_sha256, '--input', input);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /백업이 다릅니다/);
  assert.deepEqual(readFileSync(doc.document), before);
});

test('comparison uses one selection snapshot when a second process reselects another analyzed paper', t => {
  const f = setup(t); f.save(f.open()); f.review();
  f.save(f.open(f.topic, '2', f.b), answer(), f.topic, '2'); f.review(f.b);
  f.ok(f.topic, 'unselect', '--ids', '2');
  const hook = join(f.root, 'selection-hook.mjs');
  writeFileSync(hook, `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { spawnSync } from 'node:child_process';
const read = fs.readFile;
let selected = false;
fs.readFile = async function(file, ...args) {
  const bytes = await read(file, ...args);
  if (!selected && String(file) === ${JSON.stringify(f.a.data.source.path)}) {
    selected = true;
    const proc = spawnSync(process.execPath, [${JSON.stringify(cli)}, 'topic', 'select', '--dir', ${JSON.stringify(f.topic)}, '--ids', '2', '--round', '1'], { encoding: 'utf8' });
    if (proc.status !== 0) throw Error(proc.stderr);
  }
  return bytes;
};
syncBuiltinESMExports();
`);
  const proc = spawnSync(process.execPath, ['--import', pathToFileURL(hook).href, cli, 'topic', 'comparison-input', '--dir', f.topic], { encoding: 'utf8' });
  assert.equal(proc.status, 0, proc.stderr);
  const report = JSON.parse(proc.stdout);
  assert.deepEqual(report.claims.map(x => x.key), ['A']);
  assert.ok(!report.held.some(x => x.key === 'B'));
  assert.equal(f.ok(f.topic, 'show').selected.length, 2);
  assert.deepEqual(f.ok(f.topic, 'comparison-input').claims.map(x => x.key), ['A', 'B']);
});

test('topic locks and symlink documents are refused without touching linked files', t => {
  const f = setup(t), doc = f.open();
  const original = readFileSync(doc.document);
  writeFileSync(join(f.topic, 'workspace.json.danseo-lock'), '');
  assert.match(f.run(f.topic, 'analysis-open', '--id', '1').stderr, /EDIT_BUSY/);
  rmSync(join(f.topic, 'workspace.json.danseo-lock'));
  const target = join(f.root, 'external.md'); writeFileSync(target, original); rmSync(doc.document);
  try { symlinkSync(target, doc.document); }
  catch (e) { if (e.code === 'EPERM') { t.diagnostic('Symlink creation unavailable on this Windows user. Lock checked.'); return; } throw e; }
  assert.notEqual(f.run(f.topic, 'analysis-open', '--id', '1').status, 0);
  assert.deepEqual(readFileSync(target), original);
});
