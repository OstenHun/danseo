import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stringify } from 'yaml';
import test from 'node:test';
import { pdf } from './source-pdf.mjs';

const cli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFileSync(path, 'utf8');
const claim = (id, value = id) => ({ id, statement: 'Reported result ' + value, conditions: 'One test set, percent accuracy', limits: 'No transfer evaluation',
  locators: [{ type: 'pdf-page-range', start: 1, end: 1 }, { type: 'table', value: '1' }] });
const answer = (overrides = {}) => ({ overview: 'The study asks a question, compares two methods, and reports a result.',
  question: 'How was the result evaluated?', answer: 'A held-out test set; Table 1, PDF p.1. Result is reported in percent.',
  interpretation: 'AI interpretation: this is limited to the reported test set.', remaining_questions: 'Other model sizes are unknown.',
  resume: 'PDF p.1, Table 1 footnote', claim_ids: ['c1', 'c2'], comparison_claims: ['c1', 'c2'], ...overrides });

export function setup(t) {
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
