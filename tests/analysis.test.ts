import type { FixtureSourceBook, TopicOutputs } from './helpers/fixture-types.js';
import type { ReviewInput } from '../dist/core/reviews.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  appendFileSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { runNode } from './helpers/run-node.js';
import {
  setup,
  answer,
  required,
  parseJson,
  type AnalysisFixture,
} from './helpers/analysis-fixture.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const read = (path: string) => readFileSync(path, 'utf8');
test('A→B→fresh A appends to one document, preserves notes, and reuses a Paper in another topic', (t) => {
  const f = setup(t),
    { topic, ok, open, save, a, b } = f;
  const cardBytes = readFileSync(a.path),
    selection = readFileSync(join(topic, 'topic.json'));
  const first = save(open());
  const other = save(open(topic, '2', b), answer({ question: 'B only question' }), topic, '2');
  const otherBytes = readFileSync(other.document);
  // A Korean user note must survive reopening and appending: "User note: recheck the sample."
  const note = '사용자 메모: 표본을 다시 보기.';
  appendFileSync(first.document, `\n${note}\n`);
  const reopened = ok(topic, 'analysis-open', '--id', '1');
  assert.ok(reopened.markdown.includes(note));
  const before = readFileSync(reopened.document);
  assert.equal(ok(topic, 'analysis-open', '--id', '1').document_sha256, reopened.document_sha256);
  assert.deepEqual(readFileSync(reopened.document), before);
  const followed = save(
    reopened,
    answer({ overview: undefined, question: 'Who were the evaluation subjects?' }),
  );
  assert.match(followed.markdown, /How was the result evaluated/);
  assert.match(followed.markdown, /Who were the evaluation subjects/);
  assert.ok(followed.markdown.includes(note));
  assert.deepEqual(readFileSync(other.document), otherBytes);
  assert.equal(readdirSync(topic).filter((x) => /^analysis-.*\.md$/.test(x)).length, 2);
  assert.equal(required(ok(topic, 'show').analyses[0]).document, followed.document);
  const listed = required(required(ok(topic, 'analysis-list')[0]));
  assert.ok('binding' in listed && listed.binding);
  assert.equal(listed.binding.paper_id, a.id);
  // Non-ASCII path; the Korean means "another topic".
  const second = join(f.root, '다른 주제');
  f.topicAt(second, 'What are the limitations?');
  f.collect(second, 'A');
  const secondDoc = save(open(second), answer({ question: 'Different topic answer' }), second);
  assert.equal(secondDoc.binding.paper_id, a.id);
  assert.notEqual(secondDoc.document, first.document);
  assert.doesNotMatch(secondDoc.markdown, /Who were the evaluation subjects/);
  assert.deepEqual(readFileSync(a.path), cardBytes);
  assert.deepEqual(readFileSync(join(topic, 'topic.json')), selection);
});

test('changed, missing, pending and declined PDFs never start analysis', (t) => {
  const f = setup(t);
  const source = f.a.data.source.path,
    bytes = readFileSync(source);
  writeFileSync(source, 'changed');
  assert.match(
    f.run(f.topic, 'analysis-open', '--id', '1', '--workspace', f.workspace, '--paper', f.a.id)
      .stderr,
    /No source is ready for analysis/,
  );
  assert.equal(readdirSync(f.topic).filter((x) => x.startsWith('analysis-')).length, 0);
  writeFileSync(source, bytes);
  const draft = f.collect(f.topic, 'A', 'Preprint v2', 'draft');
  // Remove the publication in a fixture copy: only an unapproved draft remains.
  const bookPath = join(f.topic, 'sources.json'),
    book = parseJson<FixtureSourceBook>(read(bookPath));
  required(book.rows.find((r) => r.key === 'A')).files = required(
    book.rows.find((r) => r.key === 'A'),
  ).files.filter((x) => x.draft);
  f.json(bookPath, book);
  const file = required(
    required(draft.rows.find((r) => r.paper.key === 'A')).files.find((x) => x.draft),
  );
  const c = f.card('A', file);
  assert.notEqual(
    f.run(f.topic, 'analysis-open', '--id', '1', '--workspace', f.workspace, '--paper', c.id)
      .status,
    0,
  );
  f.ok(f.topic, 'decide', '--id', '1', '--round', '1', '--sha', file.sha256, '--answer', 'decline');
  assert.notEqual(
    f.run(f.topic, 'analysis-open', '--id', '1', '--workspace', f.workspace, '--paper', c.id)
      .status,
    0,
  );
  f.ok(f.topic, 'decide', '--id', '1', '--round', '1', '--sha', file.sha256, '--answer', 'accept');
  const doc = f.open(f.topic, '1', c);
  rmSync(source);
  assert.equal(doc.binding.edition, 'Preprint v2');
});

test('a revised edition preserves the old answer and removes previous comparison candidates', (t) => {
  const f = setup(t),
    doc = f.save(f.open());
  f.review();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 1);
  f.ok(
    f.topic,
    'search',
    '--input',
    f.json(join(f.root, 'new-search.json'), {
      query: 'new edition',
      papers: [
        {
          key: 'A',
          title: 'Paper A',
          authors: 'Alice Reader',
          year: 2025,
          source: 'https://example.com/A2',
          edition: 'Journal 2025',
          reason: 'New edition',
          scope: 'abstract',
        },
      ],
    }),
  );
  f.ok(f.topic, 'unselect', '--ids', '1');
  f.ok(f.topic, 'select', '--ids', '1', '--round', '2');
  const newer = f.collect(f.topic, 'A', 'Journal 2025', 'published', '2');
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  assert.notEqual(f.run(f.topic, 'analysis-open', '--id', '1').status, 0);
  const file = required(newer.ready.find((x) => x.paper.key === 'A')).file,
    c = f.card('A', file);
  const next = f.open(f.topic, '1', c);
  assert.equal(next.document, doc.document);
  assert.match(next.markdown, /Journal 2024/);
  assert.match(next.markdown, /Journal 2025/);
  assert.match(next.markdown, /How was the result evaluated/);
  assert.deepEqual(next.binding.comparison_claims, []);
  assert.match(read(f.a.path), /Journal 2024/);
});

test('concurrent memo edits, bad references, and malformed documents preserve original bytes', (t) => {
  const f = setup(t),
    doc = f.open();
  const noOverview = f.json(join(f.root, 'no-overview.json'), answer({ overview: undefined }));
  assert.match(
    f.run(
      f.topic,
      'analysis-save',
      '--id',
      '1',
      '--sha',
      doc.document_sha256,
      '--input',
      noOverview,
    ).stderr,
    /short overview/,
  );
  appendFileSync(doc.document, '\nNew user memo\n');
  const before = readFileSync(doc.document);
  const input = f.json(join(f.root, 'input.json'), answer());
  assert.match(
    f.run(f.topic, 'analysis-save', '--id', '1', '--sha', doc.document_sha256, '--input', input)
      .stderr,
    /Reopen the analysis document/,
  );
  assert.deepEqual(readFileSync(doc.document), before);
  const latest = f.ok(f.topic, 'analysis-open', '--id', '1');
  f.json(input, answer({ claim_ids: ['missing'], comparison_claims: ['missing'] }));
  assert.notEqual(
    f.run(f.topic, 'analysis-save', '--id', '1', '--sha', latest.document_sha256, '--input', input)
      .status,
    0,
  );
  assert.deepEqual(readFileSync(doc.document), before);
  writeFileSync(doc.document, 'Broken metadata\nUser notes');
  assert.notEqual(f.run(f.topic, 'analysis-open', '--id', '1').status, 0);
  assert.equal(read(doc.document), 'Broken metadata\nUser notes');
});

test('only current source-supported candidates pass; conditions, statement and locators invalidate review', (t) => {
  const fixture = setup(t);
  fixture.save(fixture.open());
  fixture.review();

  const initial = fixture.ok(fixture.topic, 'comparison-input');
  assert.deepEqual(
    initial.claims.map((claim) => claim.claim_id),
    ['c1'],
  );
  assert.equal(
    required(initial.held.find((claim) => claim.claim_id === 'c2')).reason,
    'No source-check record',
  );

  const claim = required(fixture.a.data.claims[0]);
  const reviewedClaim = structuredClone(claim);
  const changes = [
    {
      field: 'statement',
      apply: () => {
        claim.statement += ' changed';
      },
    },
    {
      field: 'conditions',
      apply: () => {
        claim.conditions += ' changed';
      },
    },
    {
      field: 'locator',
      apply: () => {
        const locator = required(claim.locators[0]);
        locator.start = 2;
        locator.end = 2;
      },
    },
  ];

  for (const { field, apply } of changes) {
    apply();
    fixture.a.save();

    const report = fixture.ok(fixture.topic, 'comparison-input');
    assert.equal(report.claims.length, 0, field);
    assert.match(
      required(report.held.find((claim) => claim.claim_id === 'c1')).reason,
      /differ/,
      field,
    );

    Object.assign(claim, structuredClone(reviewedClaim));
    fixture.a.save();
  }
  assert.equal(fixture.ok(fixture.topic, 'comparison-input').claims.length, 1);

  appendFileSync(fixture.a.data.source.path, '\nchanged');
  assert.equal(fixture.ok(fixture.topic, 'comparison-input').claims.length, 0);
});

test('latest negative, same-time conflict, pending required changes and damaged review do not revive older support', (t) => {
  const fixture = setup(t);
  fixture.save(fixture.open());
  fixture.review();

  fixture.review(fixture.a, 'contradicted', '2026-11-10T13:00:00Z');
  assert.equal(
    fixture.ok(fixture.topic, 'comparison-input').claims.length,
    0,
    'latest verdict is negative',
  );

  fixture.review(fixture.a, 'supported', '2026-11-10T22:00:00+09:00');
  assert.equal(
    fixture.ok(fixture.topic, 'comparison-input').claims.length,
    0,
    'the two reviews represent the same instant',
  );

  fixture.review(fixture.a, 'supported', '2026-11-10T14:00:00Z', ['Check units']);
  assert.equal(
    fixture.ok(fixture.topic, 'comparison-input').claims.length,
    0,
    'required fixes remain',
  );

  const latest = fixture.review(fixture.a, 'supported', '2026-11-10T15:00:00Z');
  assert.equal(fixture.ok(fixture.topic, 'comparison-input').claims.length, 1);
  appendFileSync(latest.resultPath, 'broken');
  assert.equal(
    fixture.ok(fixture.topic, 'comparison-input').claims.length,
    0,
    'the registered result is damaged',
  );
});

test('review source hash, input hash, and exact reviewed claim set must agree', (t) => {
  const f = setup(t);
  f.save(f.open());
  const r = f.review();
  const verify = () => {
    f.json(r.resultPath, r.result);
    required(f.config.claim_reviews[0]).result_sha256 = hash(readFileSync(r.resultPath));
    f.saveConfig();
  };
  required(r.result.source_checks[0]).pdf_sha256 = '0'.repeat(64);
  verify();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  required(r.result.source_checks[0]).pdf_sha256 = hash(readFileSync(f.a.data.source.path));
  r.result.claims.push(structuredClone(required(r.result.claims[0])));
  verify();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  r.result.claims.pop();
  r.result.input_sha256 = '0'.repeat(64);
  verify();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
});

test('duplicate latest support cannot conceal a third same-instant contradicted verdict', (t) => {
  const f = setup(t);
  f.save(f.open());
  f.review();
  f.config.claim_reviews.push(structuredClone(required(f.config.claim_reviews[0])));
  f.saveConfig();
  f.review(f.a, 'contradicted', '2026-11-10T21:00:00+09:00');
  const report = f.ok(f.topic, 'comparison-input');
  assert.equal(report.claims.length, 0);
  assert.match(required(report.held.find((h) => h.claim_id === 'c1')).reason, /duplicat|Multiple/);
});

test('connected extracted text requires matching review hash and becomes stale when changed or absent', (t) => {
  const f = setup(t);
  f.save(f.open());
  const textPath = join(f.workspace, 'source-text.json');
  const bytes = Buffer.from('source extraction');
  writeFileSync(textPath, bytes);
  f.a.data.source.text_path = 'source-text.json';
  f.a.save();
  const r = f.review();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  const input = parseJson<ReviewInput>(read(r.inputPath));
  function pin(value: string | null) {
    required(input.papers[0]).source.text_sha256 = value;
    f.json(r.inputPath, input);
    r.result.input_sha256 = hash(readFileSync(r.inputPath));
    f.json(r.resultPath, r.result);
    required(f.config.claim_reviews[0]).result_sha256 = hash(readFileSync(r.resultPath));
    f.saveConfig();
  }
  pin(null);
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  pin(hash(bytes));
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 1);
  writeFileSync(textPath, 'changed');
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  rmSync(textPath);
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  writeFileSync(textPath, bytes);
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 1);
  delete f.a.data.source.text_path;
  f.a.save();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
});

test('later stale review keeps A→B→A on hold and empty candidates withdraw prior input', (t) => {
  const f = setup(t);
  f.save(f.open());
  f.review();
  const statement = required(f.a.data.claims[0]).statement;
  required(f.a.data.claims[0]).statement += ' revision B';
  f.a.save();
  f.review(f.a, 'supported', '2026-11-10T13:00:00Z');
  required(f.a.data.claims[0]).statement = statement;
  f.a.save();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
  const doc = f.ok(f.topic, 'analysis-open', '--id', '1');
  f.save(doc, answer({ overview: undefined, comparison_claims: [] }));
  const report = f.ok(f.topic, 'comparison-input');
  assert.equal(report.claims.length, 0);
  assert.equal(
    required(report.held.find((x) => x.key === 'A')).reason,
    'No candidate claims for comparison',
  );
});

test('a new answer cites only its evidence while preserving earlier topic comparison candidates', (t) => {
  const f = setup(t);
  const first = f.save(f.open(), answer({ claim_ids: ['c1'], comparison_claims: ['c1'] }));
  const second = f.save(
    first,
    answer({
      overview: undefined,
      question: 'A separate question',
      claim_ids: ['c2'],
      comparison_claims: ['c1', 'c2'],
    }),
  );
  assert.deepEqual(second.binding.comparison_claims, ['c1', 'c2']);
  assert.match(
    required(second.markdown.split('## A separate question')[1]),
    new RegExp(`${f.a.id}/c2`),
  );
  assert.doesNotMatch(
    required(second.markdown.split('## A separate question')[1]),
    new RegExp(`${f.a.id}/c1`),
  );
});

test('a damaged B document keeps topic selections and healthy A comparison input available', (t) => {
  const f = setup(t);
  f.save(f.open());
  f.review();
  const b = f.open(f.topic, '2', f.b);
  writeFileSync(b.document, 'Damaged B; preserve notes');
  const show = f.ok(f.topic, 'show');
  assert.equal(show.selected.length, 2);
  assert.equal(required(show.analyses.find((x) => x.key === 'B')).state, 'needs-recheck');
  assert.equal(
    required(f.ok(f.topic, 'analysis-list').find((x) => x.key === 'A')).state,
    'available',
  );
  const comparison = f.ok(f.topic, 'comparison-input');
  assert.deepEqual(
    comparison.claims.map((x) => x.claim_id),
    ['c1'],
  );
  assert.match(required(comparison.held.find((x) => x.key === 'B')).reason, /connection metadata/);
  assert.notEqual(f.run(f.topic, 'analysis-open', '--id', '2').status, 0);
  assert.equal(read(b.document), 'Damaged B; preserve notes');
});

test('review timestamps without a timezone cannot decide the newest verdict', (t) => {
  const f = setup(t);
  f.save(f.open());
  f.review(f.a, 'supported', '2026-11-10T12:00:00');
  const report = f.ok(f.topic, 'comparison-input');
  assert.equal(report.claims.length, 0);
  assert.match(
    required(required(report.held.find((x) => x.claim_id === 'c1')).warnings).join(' '),
    /UTC offset/,
  );
});

test('revision limit is validated before publishing or backing up a replacement', (t) => {
  const f = setup(t),
    doc = f.open();
  const raw = read(doc.document),
    match = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  assert.ok(match);
  const state = parseJson<{ revisions: { round: number }[] }>(required(match[1])!);
  state.revisions = Array.from({ length: 1000 }, () =>
    structuredClone(required(state.revisions[0])),
  );
  required(state.revisions.at(-1)).round = 2;
  writeFileSync(
    doc.document,
    `---\n${JSON.stringify(state)}\n---\n` + raw.slice(required(match[0]).length),
  );
  const before = readFileSync(doc.document),
    files = readdirSync(f.topic);
  const result = f.run(
    f.topic,
    'analysis-open',
    '--id',
    '1',
    '--workspace',
    f.workspace,
    '--paper',
    f.a.id,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /revision-history limit/);
  assert.deepEqual(readFileSync(doc.document), before);
  assert.deepEqual(readdirSync(f.topic), files);
});

test('a mismatched existing backup refuses saving without changing the document', (t) => {
  const f = setup(t),
    doc = f.open();
  const before = readFileSync(doc.document);
  writeFileSync(doc.document + '.' + doc.document_sha256 + '.bak', 'different backup');
  const input = f.json(join(f.root, 'backup-answer.json'), answer());
  const result = f.run(
    f.topic,
    'analysis-save',
    '--id',
    '1',
    '--sha',
    doc.document_sha256,
    '--input',
    input,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /backup differs/);
  assert.deepEqual(readFileSync(doc.document), before);
});

test('comparison uses one selection snapshot when a second process reselects another analyzed paper', (t) => {
  const f = setup(t);
  f.save(f.open());
  f.review();
  f.save(f.open(f.topic, '2', f.b), answer(), f.topic, '2');
  f.review(f.b);
  f.ok(f.topic, 'unselect', '--ids', '2');
  const hook = join(f.root, 'selection-hook.mjs');
  writeFileSync(
    hook,
    `
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
`,
  );
  const proc = runNode([
    '--import',
    pathToFileURL(hook).href,
    cli,
    'topic',
    'comparison-input',
    '--dir',
    f.topic,
  ]);
  assert.equal(proc.status, 0, proc.stderr);
  const report = parseJson<TopicOutputs['comparison-input']>(proc.stdout);
  assert.deepEqual(
    report.claims.map((x) => x.key),
    ['A'],
  );
  assert.ok(!report.held.some((x) => x.key === 'B'));
  assert.equal(f.ok(f.topic, 'show').selected.length, 2);
  assert.deepEqual(
    f.ok(f.topic, 'comparison-input').claims.map((x) => x.key),
    ['A', 'B'],
  );
});

function compareWithPreload(f: AnalysisFixture, source: string) {
  const path = join(f.root, 'source-state-hook.mjs');
  writeFileSync(path, source);
  const proc = runNode([
    '--import',
    pathToFileURL(path).href,
    cli,
    'topic',
    'comparison-input',
    '--dir',
    f.topic,
  ]);
  assert.equal(proc.status, 0, proc.stderr);
  return parseJson<TopicOutputs['comparison-input']>(proc.stdout);
}
function pinResult(f: AnalysisFixture, review: ReturnType<AnalysisFixture['review']>) {
  f.json(review.resultPath, review.result);
  required(f.config.claim_reviews.at(-1)).result_sha256 = hash(readFileSync(review.resultPath));
  f.saveConfig();
}

test('a replacement PDF review cannot be exported with the earlier selected digest', (t) => {
  const f = setup(t);
  f.save(f.open());
  const source = f.a.data.source.path,
    original = readFileSync(source);
  const replacement = Buffer.from(
    original.toString().replace('%%EOF', '% different verified bytes\n%%EOF'),
  );
  writeFileSync(source, replacement);
  f.review();
  writeFileSync(source, original);
  try {
    const report = compareWithPreload(
      f,
      `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const original = fs.readFile;
let reads = 0;
fs.readFile = async function(file, ...args) {
  const bytes = await original(file, ...args);
  if (String(file) === ${JSON.stringify(source)} && ++reads === 2) await fs.writeFile(file, Buffer.from(${JSON.stringify([...replacement])}));
  return bytes;
};
syncBuiltinESMExports();
`,
    );
    assert.deepEqual(readFileSync(source), replacement);
    assert.equal(report.claims.length, 0);
    assert.match(
      required(report.held.find((x) => x.claim_id === 'c1')).reason,
      /source hash selected/,
    );
  } finally {
    writeFileSync(source, original);
  }
});

test('collection and draft consent are captured under one metadata lock, released before PDF work', (t) => {
  const f = setup(t);
  f.save(f.open());
  f.review();
  const draft = f.collect(f.topic, 'B', 'Preprint v2', 'draft');
  const file = required(
    required(draft.rows.find((row) => row.paper.key === 'B')).files.find((file) => file.draft),
  );
  const bookPath = join(f.topic, 'sources.json'),
    book = parseJson<FixtureSourceBook>(read(bookPath));
  required(book.rows.find((row) => row.key === 'B')).files = required(
    book.rows.find((row) => row.key === 'B'),
  ).files.filter((file) => file.draft);
  f.json(bookPath, book);
  f.ok(f.topic, 'decide', '--id', '2', '--round', '1', '--sha', file.sha256, '--answer', 'accept');
  const b = f.card('B', file);
  f.save(f.open(f.topic, '2', b), answer(), f.topic, '2');
  f.review(b);
  const observed = join(f.root, 'writer-result.json');
  const report = compareWithPreload(
    f,
    `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { spawnSync } from 'node:child_process';
const original = fs.readFile;
let attempted = false;
const bookPath = await fs.realpath(${JSON.stringify(bookPath)});
fs.readFile = async function(path, ...args) {
  const bytes = await original(path, ...args);
  if (!attempted && String(path) === bookPath) {
    attempted = true;
    const result = spawnSync(process.execPath, [${JSON.stringify(cli)}, 'topic', 'decide', '--dir', ${JSON.stringify(f.topic)}, '--id', '2', '--round', '1', '--sha', ${JSON.stringify(file.sha256)}, '--answer', 'decline'], { encoding: 'utf8' });
    await fs.writeFile(${JSON.stringify(observed)}, JSON.stringify({status: result.status, stderr: result.stderr}));
  }
  return bytes;
};
syncBuiltinESMExports();
`,
  );
  assert.match(
    parseJson<{ status: number | null; stderr: string }>(read(observed)).stderr,
    /EDIT_BUSY/,
  );
  assert.deepEqual(
    report.claims.map((x) => x.key),
    ['A', 'B'],
  );
  f.ok(f.topic, 'decide', '--id', '2', '--round', '1', '--sha', file.sha256, '--answer', 'decline');
  assert.deepEqual(
    f.ok(f.topic, 'comparison-input').claims.map((x) => x.key),
    ['A'],
  );
  assert.ok(!readdirSync(f.topic).includes('workspace.json.danseo-lock'));
});

test('invalid calendar dates and sub-millisecond timestamps cannot override source reviews', (t) => {
  const f = setup(t);
  f.save(f.open());
  const review = f.review();
  for (const value of [
    '2026-02-30T23:59:00Z',
    '2026-02-29T12:00:00Z',
    '2026-04-31T12:00:00Z',
    '2026-11-10T12:00:00.123456Z',
    '2026-11-10T24:00:00Z',
  ]) {
    review.result.reviewed_at = value;
    pinResult(f, review);
    assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0, value);
  }
  review.result.reviewed_at = '2024-02-29T23:59:00.123+09:00';
  pinResult(f, review);
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 1);
});

test('source-support registration needs nonblank reviewer, reasons and evidence notes', (t) => {
  const f = setup(t);
  f.save(f.open());
  const review = f.review();
  review.result.reviewer = ' ';
  required(review.result.claims[0]).reason = ' ';
  required(required(review.result.claims[0]).evidence[0]).section = ' ';
  required(required(review.result.claims[0]).evidence[0]).note = ' ';
  pinResult(f, review);
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
});

test('invalid UTF-8 is held even when the registered result byte digest is correct', (t) => {
  const f = setup(t);
  f.save(f.open());
  const review = f.review();
  required(required(review.result.claims[0]).evidence[0]).note = 'UTF8_MARK';
  const bytes = Buffer.from(JSON.stringify(review.result)),
    start = bytes.indexOf('UTF8_MARK');
  const damaged = Buffer.concat([
    bytes.subarray(0, start),
    Buffer.from([255]),
    bytes.subarray(start + 9),
  ]);
  writeFileSync(review.resultPath, damaged);
  required(f.config.claim_reviews[0]).result_sha256 = hash(damaged);
  f.saveConfig();
  assert.equal(f.ok(f.topic, 'comparison-input').claims.length, 0);
});

test('topic locks and symlink documents are refused without touching linked files', (t) => {
  const f = setup(t),
    doc = f.open();
  const original = readFileSync(doc.document);
  writeFileSync(join(f.topic, 'workspace.json.danseo-lock'), '');
  assert.match(f.run(f.topic, 'analysis-open', '--id', '1').stderr, /EDIT_BUSY/);
  rmSync(join(f.topic, 'workspace.json.danseo-lock'));
  const target = join(f.root, 'external.md');
  writeFileSync(target, original);
  rmSync(doc.document);
  try {
    symlinkSync(target, doc.document);
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'EPERM') {
      t.diagnostic('Symlink creation unavailable on this Windows user. Lock checked.');
      return;
    }
    throw e;
  }
  assert.notEqual(f.run(f.topic, 'analysis-open', '--id', '1').status, 0);
  assert.deepEqual(readFileSync(target), original);
});
