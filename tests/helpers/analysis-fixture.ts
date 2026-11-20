import type { TestContext } from 'node:test';
import type { ClaimReview, ReviewInput } from '../../dist/core/reviews.js';
import type { SelectedPaper } from '../../dist/core/topic.js';
import type { FixtureAnswer, FixtureClaim, FixtureConfig, FixtureDocument, FixtureFile, FixtureKey, FixturePaper, FixtureReviewResult, TopicOutputs } from './fixture-types.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { pdf } from './source-pdf.js';

// Dynamic JSON is a fixture-owned boundary, not a runtime schema validator.
export function parseJson<T>(text: string): T {
  const value: unknown = JSON.parse(text);
  return value as T;
}

export function required<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined, 'Expected fixture value is missing');
  return value;
}

const cli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export const claim = (id: string, value = id): FixtureClaim => ({ id, statement: 'Reported result ' + value, conditions: 'One test set, percent accuracy', limits: 'No transfer evaluation',
  locators: [{ type: 'pdf-page-range', start: 1, end: 1 }, { type: 'table', value: '1' }] });
export const answer = (overrides: Partial<FixtureAnswer> = {}): FixtureAnswer => ({ overview: 'The study asks a question, compares two methods, and reports a result.',
  question: 'How was the result evaluated?', answer: 'A held-out test set; Table 1, PDF p.1. Result is reported in percent.',
  interpretation: 'AI interpretation: this is limited to the reported test set.', remaining_questions: 'Other model sizes are unknown.',
  resume: 'PDF p.1, Table 1 footnote', claim_ids: ['c1', 'c2'], comparison_claims: ['c1', 'c2'], ...overrides });

export const comparisonTopicQuestion = 'How did the two studies evaluate results?';

export function setup(t: Pick<TestContext, 'after'>) {
  const root = mkdtempSync(join(tmpdir(), '단서 분석 test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const topic = join(root, '주제 하나'), workspace = join(root, '공통 카드');
  mkdirSync(workspace);
  // The writer also supports deliberately invalid inputs in negative tests.
  const json = (path: string, value: unknown): string => { writeFileSync(path, JSON.stringify(value, null, 2)); return path; };
  const config: FixtureConfig = { schema_version: 'workspace-1', records: [], projects: [], claim_reviews: [] };
  const configPath = join(workspace, 'workspace.json');
  const saveConfig = () => json(configPath, config);
  saveConfig();
  function run(dir: string, action: string, ...args: string[]) { return spawnSync(process.execPath, [cli, 'topic', action, '--dir', dir, ...args], { encoding: 'utf8' }); }
  function ok<Action extends keyof TopicOutputs>(dir: string, action: Action, ...args: string[]): TopicOutputs[Action] {
    const result = run(dir, action, ...args);
    assert.equal(result.status, 0, result.stderr);
    // Same CLI contract as the fixture under test; not runtime JSON validation.
    const value: unknown = JSON.parse(result.stdout);
    return value as TopicOutputs[Action];
  }
  const papers: Omit<SelectedPaper, 'number' | 'round'>[] = ['A', 'B'].map(key => ({ key, title: 'Paper ' + key, authors: 'Alice Reader', year: 2024,
    source: 'https://example.com/' + key, edition: 'Journal 2024', reason: 'Compare methods', scope: 'abstract' }));
  function topicAt(dir: string, question = comparisonTopicQuestion) {
    ok(dir, 'init', '--question', question);
    ok(dir, 'search', '--input', json(join(root, 'search.json'), { query: question, papers }));
    ok(dir, 'select', '--ids', '1,2', '--note', 'Reader-selected methods');
  }
  topicAt(topic);
  function collect(dir: string, key: FixtureKey, edition = 'Journal 2024', kind: 'published' | 'draft' = 'published', round = '1') {
    const source = join(root, key + edition + '.pdf');
    writeFileSync(source, pdf('Paper ' + key, 'Alice Reader', edition));
    return ok(dir, 'collect', '--id', key === 'A' ? '1' : '2', '--round', round, '--existing', source,
      '--edition', edition, '--proof', edition, '--kind', kind);
  }
  function card(key: FixtureKey, file: FixtureFile, claims: FixtureClaim[] = [claim('c1'), claim('c2')]): FixturePaper {
    const id = 'paper-' + key + '-' + hash(Buffer.from(file.edition)).slice(0, 8);
    const path = join(workspace, id + '.md');
    const data: FixturePaper['data'] = { schema_version: 'draft-2', type: 'paper', id,
      source: { version: file.edition, path: file.path, url: 'https://example.com/' + key }, review: { status: 'draft' }, claims };
    const save = () => writeFileSync(path, `---\n${stringify(data)}---\n# Paper ${key}\n\nUser card notes preserved.\n`);
    save(); if (!config.records.includes(id + '.md')) config.records.push(id + '.md'); saveConfig();
    return { id, path, data, save };
  }
  collect(topic, 'B');
  collect(topic, 'A');
  const ready = ok(topic, 'sources').ready;
  const sourceA = ready.find(row => row.paper.key === 'A');
  const sourceB = ready.find(row => row.paper.key === 'B');
  assert.ok(sourceA && sourceB, 'Both fixture PDFs must be ready');
  const a = card('A', sourceA.file);
  const b = card('B', sourceB.file);
  function open(dir = topic, id = '1', paper = a) { return ok(dir, 'analysis-open', '--id', id, '--workspace', workspace, '--paper', paper.id); }
  function save(doc: Pick<FixtureDocument, 'document_sha256'>, value = answer(), dir = topic, id = '1') {
    return ok(dir, 'analysis-save', '--id', id, '--sha', doc.document_sha256, '--input', json(join(root, 'answer.json'), value));
  }
  function review(paper = a, verdict: ClaimReview['verdict'] = 'supported', date = '2026-11-10T12:00:00Z', changes: string[] = []) {
    const n = config.claim_reviews.length;
    const source = paper.data.source;
    const inputPath = join(workspace, 'input-' + n + '.json');
    const resultPath = join(workspace, 'result-' + n + '.json');
    const input: ReviewInput = { run_id: 'run-' + n, papers: [{ paper_id: paper.id, card_sha256: hash(readFileSync(paper.path)),
      source: { version: source.version, url: source.url, pdf_sha256: hash(readFileSync(source.path)) }, claims: paper.data.claims.filter(c => c.id === 'c1') }] };
    json(inputPath, input);
    const result: FixtureReviewResult = { input_sha256: hash(readFileSync(inputPath)), reviewer: 'fixture reviewer', review_type: 'independent-source-review', reviewed_at: date,
      claims: [{ paper_id: paper.id, claim_id: 'c1', verdict, reason: 'Fixture only, not a real semantic verdict',
        evidence: [{ pdf_page: 1, section: 'Table 1', note: 'Fixture page inspected' }], required_changes: changes }],
      source_checks: [{ paper_id: paper.id, pdf_sha256: hash(readFileSync(source.path)) }] };
    json(resultPath, result);
    config.claim_reviews.push({ input: 'input-' + n + '.json', result: 'result-' + n + '.json', result_sha256: hash(readFileSync(resultPath)) }); saveConfig();
    return { inputPath, resultPath, result };
  }
  return { root, topic, workspace, config, saveConfig, json, run, ok, a, b, open, save, review, collect, card, topicAt };
}

export type AnalysisFixture = ReturnType<typeof setup>;
