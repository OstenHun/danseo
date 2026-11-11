import { pdf } from '../tests/helpers/source-pdf.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Script } from 'node:vm';

assert.ok(process.env.npm_execpath, 'Run this check with npm run test:package');
const root = process.cwd();
const scratch = mkdtempSync(path.join(tmpdir(), 'danseo-package-'));
const consumer = path.join(scratch, 'consumer');
mkdirSync(consumer);
const npm = (args, cwd = root) => execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const [pack] = JSON.parse(npm(['pack', '--json', '--pack-destination', scratch]));
assert.ok(pack.files.some(file => file.path === 'dist/cli.js'));
assert.ok(pack.files.every(file => !/^(work|workspaces|private|outputs|node_modules)\//.test(file.path)));
assert.ok(pack.files.every(file => !/(^|\/)(?:\.git|\.env(?:\..*)?|\.npmrc|\.aws|\.codex)(?:\/|$)|\.(?:pem|key|pfx|p12|bundle|har|jsonl|pdf|log)$/i.test(file.path)), 'Private files must not be packaged');
npm(['install', '--prefix', consumer, '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund', path.join(scratch, pack.filename)], consumer);
const installed = path.join(consumer, 'node_modules', 'danseo');
const manifest = JSON.parse(readFileSync(path.join(installed, 'package.json'), 'utf8'));
assert.equal(manifest.bin.danseo, 'dist/cli.js');
const cli = (...args) => execFileSync(process.execPath, [path.join(installed, manifest.bin.danseo), ...args], { cwd: consumer, encoding: 'utf8' });
assert.match(cli('--help'), /danseo/);
const workspace = path.join(installed, 'examples', 'minimal');
const validation = JSON.parse(cli('validate', '--workspace', workspace, '--json'));
assert.equal(validation.ok, true);
assert.equal(validation.records, 3);
assert.equal(validation.projects, 2);
assert.match(cli('export', '--workspace', workspace, '--project', 'demo', '--application', 'app-demo', '--include-drafts', '--format', 'markdown'), /app-demo/);
console.log(`Installed ${pack.filename}: help, synthetic validation and export passed (${process.version}/${process.platform}).`);

// Exercise the installed CLI from a consumer outside the source tree.
const topicDir = path.join(consumer, '한글 주제 폴더');
const topic = (...args) => JSON.parse(cli('topic', ...args, '--dir', topicDir));
const candidate = key => ({ key, title: `Synthetic ${key}`, authors: 'Example', year: 2025,
  source: `https://example.org/${key}`, edition: 'v1', reason: `Reason ${key}`, scope: 'abstract' });
topic('init', '--question', 'Synthetic package question');
const batchFile = path.join(consumer, 'batch.json');
const batch = papers => writeFileSync(batchFile, JSON.stringify({ query: 'Synthetic search', papers }));
batch(['a', 'b', 'c'].map(candidate));
topic('search', '--input', batchFile);
const firstChoice = topic('select', '--round', '1', '--ids', '1').selected[0];
batch([{ ...candidate('a'), edition: 'v2', source: 'https://example.org/a/v2' }, candidate('d'), candidate('b')]);
topic('search', '--input', batchFile);
topic('select', '--round', '2', '--ids', '4');
const resumed = topic('show');
assert.deepEqual(resumed.selected[0], firstChoice);
assert.deepEqual(resumed.selected.map(paper => paper.number), [1, 4]);
assert.deepEqual(resumed.selected.map(paper => paper.source), ['https://example.org/a', 'https://example.org/d']);
assert.equal(resumed.searches.length, 2);
assert.deepEqual(topic('sources').rows.map(row => row.paper), resumed.selected);
assert.deepEqual(topic('sources').ready, []);
console.log('Installed topic: select, additional search and fresh-process resume passed.');

const provided = path.join(consumer, '직접 제공한 논문.pdf');
writeFileSync(provided, pdf('Synthetic a', 'Example', 'v1'));
const collect = () => topic('collect', '--id','1','--round','1','--kind','published','--pdf',provided,'--edition','v1','--proof','v1');
const saved = collect().ready[0];
assert.ok(saved);
assert.deepEqual(readFileSync(saved.file.path),readFileSync(provided));
assert.deepEqual(topic('sources').ready,[saved]);
assert.deepEqual(collect().ready,[saved]);
assert.equal(readdirSync(topicDir).filter(file => file.endsWith('.pdf')).length,1);
console.log(`Installed CLI PDF verified: Korean + space paths, fresh-process reopen, same digest/path and one copy (${process.version}/${process.platform}).`);

const cardsDir = path.join(consumer, '공통 카드');
mkdirSync(cardsDir);
const cardPath = path.join(cardsDir, 'paper.md');
const claims = [{ id: 'c1', statement: 'Synthetic author result', conditions: 'Synthetic evaluation only',
  locators: [{ type: 'pdf-page-range', start: 1, end: 1 }] }, { id: 'c2', statement: 'Unreviewed result',
  locators: [{ type: 'pdf-page-range', start: 1, end: 1 }] }];
const data = { schema_version: 'draft-2', type: 'paper', id: 'paper-a',
  source: { version: 'v1', path: saved.file.path }, review: { status: 'draft' }, claims };
writeFileSync(cardPath, `---\n${JSON.stringify(data)}\n---\n# Synthetic a\n\nPreserved card notes.\n`);
const config = { schema_version: 'workspace-1', records: ['paper.md'], projects: [], claim_reviews: [] };
const configPath = path.join(cardsDir, 'workspace.json');
const put = (file, value) => writeFileSync(file, JSON.stringify(value));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
put(configPath, config);
let document = topic('analysis-open', '--id', '1', '--workspace', cardsDir, '--paper', 'paper-a');
const payload = path.join(consumer, 'answer.json');
put(payload, { overview: 'Synthetic question, method and result.', question: 'How was it evaluated?',
  answer: 'Synthetic condition, PDF p.1.', interpretation: 'AI interpretation only.', remaining_questions: 'Not evaluated.',
  resume: 'PDF p.1', claim_ids: ['c1', 'c2'], comparison_claims: ['c1', 'c2'] });
document = topic('analysis-save', '--id', '1', '--sha', document.document_sha256, '--input', payload);
assert.equal(topic('analysis-open', '--id', '1').document_sha256, document.document_sha256);
assert.equal(topic('show').analyses[0].document, document.document);
const inputPath = path.join(cardsDir, 'input.json'), resultPath = path.join(cardsDir, 'result.json');
put(inputPath, { run_id: 'synthetic', papers: [{ paper_id: 'paper-a', card_sha256: sha(readFileSync(cardPath)),
  source: { version: 'v1', pdf_sha256: saved.file.sha256 }, claims: claims.slice(0, 1) }] });
put(resultPath, { input_sha256: sha(readFileSync(inputPath)), reviewer: 'synthetic fixture', review_type: 'independent-source-review',
  reviewed_at: '2026-11-10T00:00:00Z', claims: [{ paper_id: 'paper-a', claim_id: 'c1', verdict: 'supported', reason: 'Synthetic only.',
    evidence: [{ pdf_page: 1, section: 'Synthetic', note: 'Fixture only.' }], required_changes: [] }],
  source_checks: [{ paper_id: 'paper-a', pdf_sha256: saved.file.sha256 }] });
config.claim_reviews.push({ input: 'input.json', result: 'result.json', result_sha256: sha(readFileSync(resultPath)) }); put(configPath, config);
assert.deepEqual(topic('comparison-input').claims.map(c => c.claim_id), ['c1']);
put(path.join(topicDir, 'comparison.json'), { version: 1, question: 'Synthetic package question', criteria: [{
  id: 'evaluation', title: '평가 조건', rationale: 'Synthetic AI grouping only', refs: [{ key: 'a', claim_id: 'c1' }]
}] });
const comparison = topic('compare', '--json');
assert.deepEqual(comparison.criteria[0].groups.map(group => group.claims.length), [1, 0]);
assert.equal(comparison.relations.length, 0);
// Load from the installed package: assets must not fall back to source-tree files.
const { serveComparison } = await import(pathToFileURL(path.join(installed, 'dist/web/comparison-server.js')).href);
const originalLog = console.log;
let comparisonUrl, comparisonServer;
try {
  console.log = value => { comparisonUrl = JSON.parse(value).url; };
  comparisonServer = await serveComparison(topicDir);
} finally { console.log = originalLog; }
try {
  for (const asset of ['', 'comparison.js', 'comparison.css', 'reader-base.css', 'research-map.js', 'cytoscape.min.js', 'data']) {
    const response = await fetch(comparisonUrl + asset);
    assert.equal(response.status, 200, asset);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.byteLength, asset);
    if (asset !== 'data') {
      assert.deepEqual(bytes, readFileSync(path.join(root, 'dist/web', asset || 'comparison.html')), 'installed asset matches current build: ' + asset);
      if (asset.endsWith('.js')) new Script(bytes.toString('utf8'), { filename: asset });
    }
  }
  assert.deepEqual(Buffer.from(await (await fetch(comparisonUrl + `file/1/pdf/${saved.file.sha256}`)).arrayBuffer()), readFileSync(saved.file.path));
} finally { await new Promise(resolve => comparisonServer.close(resolve)); }
console.log(`Installed comparison: current claims, missing side, all local assets and exact PDF passed (${process.version}/${process.platform}).`);
data.claims[0].conditions = 'Changed condition';
writeFileSync(cardPath, `---\n${JSON.stringify(data)}\n---\n# Synthetic a\n`);
assert.equal(topic('comparison-input').claims.length, 0);
assert.equal(topic('compare', '--json').criteria[0].groups[0].claims.length, 0);
console.log(`Installed analysis: one document, fresh-process resume, current supported candidate only, condition invalidation (${process.version}/${process.platform}).`);
