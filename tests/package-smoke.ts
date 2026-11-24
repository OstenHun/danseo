import { pdf } from './helpers/source-pdf.js';
import { parseJson, required } from './helpers/analysis-fixture.js';
import type { FixtureClaim, FixtureConfig, TopicOutputs } from './helpers/fixture-types.js';
import type { SelectedPaper } from '../dist/core/topic.js';
import type { serveComparison as ServeComparison } from '../dist/web/comparison-server.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Script } from 'node:vm';

const npmPath = process.env.npm_execpath;
assert.ok(npmPath, 'Run this check with npm run test:package');
const root = process.cwd();
const scratch = mkdtempSync(path.join(tmpdir(), 'danseo-package-'));
const consumer = path.join(scratch, 'consumer');
mkdirSync(consumer);
const npm = (args: string[], cwd = root) =>
  execFileSync(process.execPath, [npmPath, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
type Pack = { filename: string; files: { path: string }[] };
const pack = required(parseJson<Pack[]>(npm(['pack', '--json', '--pack-destination', scratch]))[0]);
assert.ok(pack.files.some((file) => file.path === 'dist/cli.js'));
for (const skill of ['danseo', 'danseo-reading', 'paper-to-project']) {
  assert.ok(pack.files.some((file) => file.path === `skills/${skill}/SKILL.md`));
}
assert.ok(pack.files.every((file) => !/(^|\/)local-connection\.json$/.test(file.path)));
assert.ok(
  pack.files.every(
    (file) =>
      !/^(work|workspaces|private|outputs|node_modules|tests|scripts|build|build-tools)\//.test(
        file.path,
      ),
  ),
);
assert.ok(
  pack.files.every(
    (file) =>
      !/(^|\/)(?:\.git|\.env(?:\..*)?|\.npmrc|\.aws|\.codex)(?:\/|$)|\.(?:pem|key|pfx|p12|bundle|har|jsonl|pdf|log)$/i.test(
        file.path,
      ),
  ),
  'Private files must not be packaged',
);
npm(
  [
    'install',
    '--prefix',
    consumer,
    '--prefer-offline',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    path.join(scratch, pack.filename),
  ],
  consumer,
);
const installed = path.join(consumer, 'node_modules', 'danseo');
const manifest = parseJson<{ bin: { danseo: string } }>(
  readFileSync(path.join(installed, 'package.json'), 'utf8'),
);
assert.equal(manifest.bin.danseo, 'dist/cli.js');
const cli = (...args: string[]) =>
  execFileSync(process.execPath, [path.join(installed, manifest.bin.danseo), ...args], {
    cwd: consumer,
    encoding: 'utf8',
  });
assert.match(cli('--help'), /danseo/);
const workspace = path.join(installed, 'examples', 'minimal');
const validation = parseJson<{ ok: boolean; records: number; projects: number }>(
  cli('validate', '--workspace', workspace, '--json'),
);
assert.equal(validation.ok, true);
assert.equal(validation.records, 3);
assert.equal(validation.projects, 2);
assert.match(
  cli(
    'export',
    '--workspace',
    workspace,
    '--project',
    'demo',
    '--application',
    'app-demo',
    '--include-drafts',
    '--format',
    'markdown',
  ),
  /app-demo/,
);
console.log(
  `Installed ${pack.filename}: help, synthetic validation and export passed (${process.version}/${process.platform}).`,
);

// Copy only the installed skill to reproduce the README folder-only installation.
const standalone = path.join(scratch, 'standalone-skill');
cpSync(path.join(installed, 'skills/danseo'), standalone, { recursive: true });
execFileSync(
  process.execPath,
  ['--test', path.join(standalone, 'scripts/publication-ready.test.mjs')],
  { cwd: scratch, stdio: 'pipe' },
);
console.log(
  'Installed source-complete delivery: date/claim passage bindings, stale evidence and no-write regressions passed.',
);
execFileSync(
  process.execPath,
  ['--test', path.join(standalone, 'scripts/assemble-readings.test.mjs')],
  { cwd: scratch, stdio: 'pipe' },
);
console.log(
  'Installed reading-result assembly: bundled examples pass the complete check from the skill folder alone.',
);
for (const file of [
  'SKILL.md',
  'assets/graph-presentation.js',
  'assets/graph-presentation.css',
  'assets/research-map.js',
  'assets/research-view.js',
  'scripts/render-research-view.mjs',
]) {
  assert.deepEqual(
    readFileSync(path.join(standalone, file)),
    readFileSync(path.join(root, 'skills/danseo', file)),
  );
}
const portableInput = path.join(consumer, 'graph.json'),
  portableEvidence = path.join(consumer, 'evidence.json');
const portableOutput = path.join(consumer, 'graph.html');
const portable = parseJson<{ papers: { topic?: string }[] } & Record<string, unknown>>(
  readFileSync(path.join(standalone, 'assets/paper-relations.v2.example.json'), 'utf8'),
);
// A long Korean topic must render intact; it means
// "answer citation and faithfulness evaluation of retrieved evidence". The repeated letter is one Hangul syllable.
required(portable.papers[0]).topic = '검색 결과 근거의 답변 인용과 충실도 평가';
const renderPortable = (...args: string[]) =>
  execFileSync(
    process.execPath,
    [path.join(standalone, 'scripts/render-verified-research-view.mjs'), portableInput, ...args],
    { cwd: consumer, encoding: 'utf8' },
  );
writeFileSync(portableInput, JSON.stringify(portable));
Object.assign(portable, parseJson<Record<string, unknown>>(renderPortable('--overview')));
writeFileSync(portableInput, JSON.stringify(portable));
// This public synthetic fixture contains only method context; real inputs must be screened individually.
const performance = parseJson<Record<string, unknown>[]>(renderPortable('--performance-plan')).map(
  (x) => ({
    ...x,
    kind: 'non-performance',
    reason: 'Reviewed synthetic method-only fixture',
    comparison: null,
  }),
);
writeFileSync(
  portableEvidence,
  JSON.stringify({ version: 2, sources: [], counts: [], tables: [], performance }),
);
const portableReceipt = parseJson<{ ok: boolean; source_semantics: string }>(
  renderPortable('--evidence', portableEvidence, '--out', portableOutput),
);
assert.equal(portableReceipt.ok, true);
assert.equal(portableReceipt.source_semantics, 'not-certified');
const portableHtml = readFileSync(portableOutput, 'utf8');
assert.match(portableHtml, /Selected connections/);
assert.match(portableHtml, /Uncategorized/);
assert.match(portableHtml, /검색 결과 근거의 답변 인용과 충실도 평가/);
required(portable.papers[0]).topic = '가'.repeat(41);
writeFileSync(portableInput, JSON.stringify(portable));
assert.throws(
  () => renderPortable('--evidence', portableEvidence, '--check'),
  /maximum 40 characters/,
);
console.log(
  'Installed folder-only skill: exact shared assets, verified HTML and long-topic boundary passed.',
);

const standaloneReading = path.join(scratch, 'standalone-reading');
cpSync(path.join(installed, 'skills/danseo-reading'), standaloneReading, { recursive: true });
for (const file of [
  'scripts/view-core.mjs',
  'scripts/view-language.mjs',
  'assets/research-language.ko.json',
]) {
  assert.deepEqual(
    readFileSync(path.join(standaloneReading, file)),
    readFileSync(path.join(standalone, file)),
  );
}
for (const language of ['en', 'ko']) {
  const learning = parseJson<{ language: string; title: string }>(
    readFileSync(path.join(standaloneReading, 'assets/learning-view.example.json'), 'utf8'),
  );
  learning.language = language;
  // A source title is never translated; the Korean means "source title".
  learning.title = '원문 제목 · original title';
  const input = path.join(consumer, `learning-${language}.json`),
    output = path.join(consumer, `learning-${language}.html`);
  writeFileSync(input, JSON.stringify(learning));
  const receipt = parseJson<{ ok: boolean }>(
    execFileSync(
      process.execPath,
      [path.join(standaloneReading, 'scripts/render-learning-view.mjs'), input, '--out', output],
      { cwd: consumer, encoding: 'utf8' },
    ),
  );
  assert.equal(receipt.ok, true);
  const html = readFileSync(output, 'utf8');
  assert.ok(html.includes(`<html lang="${language}">`));
  assert.ok(html.includes(language === 'ko' ? '추천 학습 순서' : 'Suggested learning order'));
  assert.deepEqual(
    parseJson<unknown>(required(html.match(/id="candidate">(.*?)<\/script>/s)?.[1])),
    learning,
  );
  new Script(required([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1]));
}
assert.ok(
  readFileSync(path.join(installed, 'skills/paper-to-project/references/application-card.md'))
    .byteLength > 0,
);
console.log(
  'All three skills packaged; standalone learning en/ko, exact payload and shared language assets passed.',
);

// Exercise the installed CLI from a consumer outside the source tree.
// Non-ASCII paths here and below: "Korean topic folder", "directly provided paper" and
// "shared cards".
const topicDir = path.join(consumer, '한글 주제 폴더');
function topic<Action extends keyof TopicOutputs>(
  action: Action,
  ...args: string[]
): TopicOutputs[Action] {
  return parseJson<TopicOutputs[Action]>(cli('topic', action, ...args, '--dir', topicDir));
}
const candidate = (key: string): Omit<SelectedPaper, 'number' | 'round'> => ({
  key,
  title: `Synthetic ${key}`,
  authors: 'Example',
  year: 2025,
  source: `https://example.org/${key}`,
  edition: 'v1',
  reason: `Reason ${key}`,
  scope: 'abstract',
});
topic('init', '--question', 'Synthetic package question');
const batchFile = path.join(consumer, 'batch.json');
const batch = (papers: ReturnType<typeof candidate>[]) =>
  writeFileSync(batchFile, JSON.stringify({ query: 'Synthetic search', papers }));
batch(['a', 'b', 'c'].map(candidate));
topic('search', '--input', batchFile);
const firstChoice = required(topic('select', '--round', '1', '--ids', '1').selected[0]);
batch([
  { ...candidate('a'), edition: 'v2', source: 'https://example.org/a/v2' },
  candidate('d'),
  candidate('b'),
]);
topic('search', '--input', batchFile);
topic('select', '--round', '2', '--ids', '4');
const resumed = topic('show');
assert.deepEqual(resumed.selected[0], firstChoice);
assert.deepEqual(
  resumed.selected.map((paper) => paper.number),
  [1, 4],
);
assert.deepEqual(
  resumed.selected.map((paper) => paper.source),
  ['https://example.org/a', 'https://example.org/d'],
);
assert.equal(resumed.searches.length, 2);
assert.deepEqual(
  topic('sources').rows.map((row) => row.paper),
  resumed.selected,
);
assert.deepEqual(topic('sources').ready, []);
console.log('Installed topic: select, additional search and fresh-process resume passed.');

const provided = path.join(consumer, '직접 제공한 논문.pdf');
writeFileSync(provided, pdf('Synthetic a', 'Example', 'v1'));
const collect = () =>
  topic(
    'collect',
    '--id',
    '1',
    '--round',
    '1',
    '--kind',
    'published',
    '--pdf',
    provided,
    '--edition',
    'v1',
    '--proof',
    'v1',
  );
const saved = collect().ready[0];
assert.ok(saved);
assert.deepEqual(readFileSync(saved.file.path), readFileSync(provided));
assert.deepEqual(topic('sources').ready, [saved]);
assert.deepEqual(collect().ready, [saved]);
assert.equal(readdirSync(topicDir).filter((file) => file.endsWith('.pdf')).length, 1);
console.log(
  `Installed CLI PDF verified: Korean + space paths, fresh-process reopen, same digest/path and one copy (${process.version}/${process.platform}).`,
);

const cardsDir = path.join(consumer, '공통 카드');
mkdirSync(cardsDir);
const cardPath = path.join(cardsDir, 'paper.md');
const claims: FixtureClaim[] = [
  {
    id: 'c1',
    statement: 'Synthetic author result',
    conditions: 'Synthetic evaluation only',
    locators: [{ type: 'pdf-page-range', start: 1, end: 1 }],
  },
  {
    id: 'c2',
    statement: 'Unreviewed result',
    locators: [{ type: 'pdf-page-range', start: 1, end: 1 }],
  },
];
const data = {
  schema_version: 'draft-2',
  type: 'paper',
  id: 'paper-a',
  source: { version: 'v1', path: saved.file.path },
  review: { status: 'draft' },
  claims,
};
writeFileSync(
  cardPath,
  `---\n${JSON.stringify(data)}\n---\n# Synthetic a\n\nPreserved card notes.\n`,
);
const config: FixtureConfig = {
  schema_version: 'workspace-1',
  records: ['paper.md'],
  projects: [],
  claim_reviews: [],
};
const configPath = path.join(cardsDir, 'workspace.json');
const put = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value));
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
put(configPath, config);
let document = topic('analysis-open', '--id', '1', '--workspace', cardsDir, '--paper', 'paper-a');
const payload = path.join(consumer, 'answer.json');
put(payload, {
  overview: 'Synthetic question, method and result.',
  question: 'How was it evaluated?',
  answer: 'Synthetic condition, PDF p.1.',
  interpretation: 'AI interpretation only.',
  remaining_questions: 'Not evaluated.',
  resume: 'PDF p.1',
  claim_ids: ['c1', 'c2'],
  comparison_claims: ['c1', 'c2'],
});
document = topic(
  'analysis-save',
  '--id',
  '1',
  '--sha',
  document.document_sha256,
  '--input',
  payload,
);
assert.equal(topic('analysis-open', '--id', '1').document_sha256, document.document_sha256);
assert.equal(required(topic('show').analyses[0]).document, document.document);
const inputPath = path.join(cardsDir, 'input.json'),
  resultPath = path.join(cardsDir, 'result.json');
put(inputPath, {
  run_id: 'synthetic',
  papers: [
    {
      paper_id: 'paper-a',
      card_sha256: sha(readFileSync(cardPath)),
      source: { version: 'v1', pdf_sha256: saved.file.sha256 },
      claims: claims.slice(0, 1),
    },
  ],
});
put(resultPath, {
  input_sha256: sha(readFileSync(inputPath)),
  reviewer: 'synthetic fixture',
  review_type: 'independent-source-review',
  reviewed_at: '2026-11-10T00:00:00Z',
  claims: [
    {
      paper_id: 'paper-a',
      claim_id: 'c1',
      verdict: 'supported',
      reason: 'Synthetic only.',
      evidence: [{ pdf_page: 1, section: 'Synthetic', note: 'Fixture only.' }],
      required_changes: [],
    },
  ],
  source_checks: [{ paper_id: 'paper-a', pdf_sha256: saved.file.sha256 }],
});
config.claim_reviews.push({
  input: 'input.json',
  result: 'result.json',
  result_sha256: sha(readFileSync(resultPath)),
});
put(configPath, config);
assert.deepEqual(
  topic('comparison-input').claims.map((c) => c.claim_id),
  ['c1'],
);
put(path.join(topicDir, 'comparison.json'), {
  version: 1,
  question: 'Synthetic package question',
  criteria: [
    {
      id: 'evaluation',
      title: 'Evaluation conditions',
      rationale: 'Synthetic AI grouping only',
      refs: [{ key: 'a', claim_id: 'c1' }],
    },
  ],
});
const comparison = topic('compare', '--json');
assert.deepEqual(
  required(comparison.criteria[0]).groups.map((group) => group.claims.length),
  [1, 0],
);
assert.equal(comparison.relations.length, 0);
// Load from the installed package: assets must not fall back to source-tree files.
// The installed copy has the same declaration contract; its runtime path stays
// outside the checkout so the source server cannot hide a packaging failure.
const installedModule: { serveComparison: typeof ServeComparison } = await import(
  pathToFileURL(path.join(installed, 'dist/web/comparison-server.js')).href
);
const { serveComparison } = installedModule;
const originalLog = console.log;
let comparisonUrl: string | undefined;
let comparisonServer: Awaited<ReturnType<typeof ServeComparison>>;
try {
  console.log = (value: unknown) => {
    assert.equal(typeof value, 'string');
    comparisonUrl = parseJson<{ url: string }>(String(value)).url;
  };
  comparisonServer = await serveComparison(topicDir);
} finally {
  console.log = originalLog;
}
try {
  assert.ok(comparisonUrl, 'Installed server must report its URL');
  for (const asset of [
    '',
    'comparison.js',
    'comparison.css',
    'reader-base.css',
    'research-map.js',
    'cytoscape.min.js',
    'data',
  ]) {
    const response: Response = await fetch(comparisonUrl + asset);
    assert.equal(response.status, 200, asset);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.byteLength, asset);
    if (asset !== 'data') {
      assert.deepEqual(
        bytes,
        readFileSync(path.join(root, 'dist/web', asset || 'comparison.html')),
        'installed asset matches current build: ' + asset,
      );
      if (asset.endsWith('.js')) new Script(bytes.toString('utf8'), { filename: asset });
    }
  }
  assert.deepEqual(
    Buffer.from(
      await (await fetch(comparisonUrl + `file/1/pdf/${saved.file.sha256}`)).arrayBuffer(),
    ),
    readFileSync(saved.file.path),
  );
} finally {
  await new Promise<void>((resolve, reject) =>
    comparisonServer.close((error) => (error ? reject(error) : resolve())),
  );
}
console.log(
  `Installed comparison: current claims, missing side, all local assets and exact PDF passed (${process.version}/${process.platform}).`,
);
required(data.claims[0]).conditions = 'Changed condition';
writeFileSync(cardPath, `---\n${JSON.stringify(data)}\n---\n# Synthetic a\n`);
assert.equal(topic('comparison-input').claims.length, 0);
const invalidatedCriterion = required(topic('compare', '--json').criteria[0]);
assert.equal(required(invalidatedCriterion.groups[0]).claims.length, 0);
console.log(
  `Installed analysis: one document, fresh-process resume, current supported candidate only, condition invalidation (${process.version}/${process.platform}).`,
);
