import test, { type TestContext } from 'node:test';
import { parseJson, required } from './helpers/analysis-fixture.js';
import type { buildBundle, listCards } from '../dist/core/index.js';
type Bundle = Awaited<ReturnType<typeof buildBundle>>;
type CliError = { error: { code: string } };
type Validation = { warnings: string[] };
type SourceText = {
  source_url: string;
  version: string;
  pdf_sha256: string;
  extractor: string;
  pages: { page: number; text: string }[];
};
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { selectQuestion } from '../dist/core/index.js';
import { runNode } from './helpers/run-node.js';

const cli = resolve('dist/cli.js');
const fixture = resolve('examples/minimal');
function run(ws: string, args: string[]) {
  return runNode([cli, ...args, '--workspace', ws]);
}
async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'danseo-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ws = join(root, '한글 자료 space');
  await cp(fixture, ws, { recursive: true });
  return ws;
}
async function edit(ws: string, file: string, transform: (source: string) => string) {
  const path = join(ws, file);
  await writeFile(path, transform(await readFile(path, 'utf8')));
}
const exportArgs = ['export', '--project', 'demo', '--application', 'app-demo', '--include-drafts'];

test('fresh workspace: validate/list/show/export retain raw evidence and isolate projects', async (t) => {
  const ws = await setup(t);
  const validation = run(ws, ['validate', '--json']);
  assert.equal(validation.status, 0, validation.stderr);
  assert.equal(parseJson<Validation>(validation.stdout).warnings.length, 1);
  const list = run(ws, ['list', '--project', 'demo', '--json']);
  assert.deepEqual(
    parseJson<ReturnType<typeof listCards>>(list.stdout).map((x) => x.id),
    ['paper-synthetic', 'app-demo'],
  );
  const original = await readFile(join(ws, 'papers/synthetic.md'), 'utf8');
  assert.equal(run(ws, ['show', '--paper', 'paper-synthetic']).stdout, original);
  const result = run(ws, [...exportArgs, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const bundle = parseJson<Bundle>(result.stdout);
  assert.equal(bundle.records.length, 2); // one paper despite two claim refs
  assert.equal(required(bundle.records[1]).content, original);
  assert.equal(
    bundle.records.some((x) => x.id === 'app-other'),
    false,
  );
  assert.equal(await readFile(join(ws, 'papers/synthetic.md'), 'utf8'), original);
  assert.equal(bundle.project.question_source, join(ws, 'projects/demo/question.md'));
  assert.equal(required(bundle.records[0]).source_directory, join(ws, 'projects/demo'));
});

test('drafts require explicit opt-in; no partial stdout or output file on failure', async (t) => {
  const ws = await setup(t);
  const result = run(ws, ['export', '--project', 'demo', '--application', 'app-demo', '--json']);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(parseJson<CliError>(result.stderr).error.code, 'UNCHECKED_SOURCE');
});

test('output is exclusively created, preserving an existing file and source cards', async (t) => {
  const ws = await setup(t);
  const output = join(ws, 'context.md');
  assert.equal(run(ws, [...exportArgs, '--out', output]).status, 0);
  const before = await readFile(output);
  assert.equal(run(ws, [...exportArgs, '--out', output]).status, 3);
  assert.deepEqual(await readFile(output), before);
  const source = join(ws, 'papers/synthetic.md');
  const sourceBefore = await readFile(source);
  assert.equal(run(ws, [...exportArgs, '--out', source]).status, 3);
  assert.deepEqual(await readFile(source), sourceBefore);
});

const invalidCards: [string, string, (source: string) => string, string][] = [
  [
    'broken claim',
    'projects/demo/application.md',
    (s) => s.replace('C-DEMO-01', 'MISSING'),
    'CLAIM_REF',
  ],
  [
    'duplicate claim',
    'papers/synthetic.md',
    (s) => s.replace('id: C-DEMO-02', 'id: C-DEMO-01'),
    'DUPLICATE_CLAIM',
  ],
  [
    'duplicate YAML key',
    'papers/synthetic.md',
    (s) => s.replace('id: paper-synthetic', 'id: paper-synthetic\nid: overwritten'),
    'YAML',
  ],
  [
    'missing locator',
    'papers/synthetic.md',
    (s) => s.replace('locators:', 'missing_locators:'),
    'SCHEMA',
  ],
  [
    'wrong status',
    'papers/synthetic.md',
    (s) => s.replace('status: draft', 'status: approved'),
    'SCHEMA',
  ],
  ['unsupported schema', 'papers/synthetic.md', (s) => s.replace('draft-2', 'draft-999'), 'SCHEMA'],
  [
    'checked without version',
    'papers/synthetic.md',
    (s) =>
      s.replace('status: draft', 'status: source-checked').replace('  version: synthetic-v1\n', ''),
    'CHECKED_WITHOUT_EVIDENCE',
  ],
  [
    'inverted pages',
    'papers/synthetic.md',
    (s) =>
      s.replace(
        'type: table\n        value: "1"',
        'type: pdf-page-range\n        start: 5\n        end: 2',
      ),
    'PAGE_RANGE',
  ],
];
for (const [name, file, transform, code] of invalidCards)
  test(name, async (t) => {
    const ws = await setup(t);
    await edit(ws, file, transform);
    const result = run(ws, ['validate', '--json']);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(parseJson<CliError>(result.stderr).error.code, code);
  });

test('missing file and project mismatch are distinct failures', async (t) => {
  const ws = await setup(t);
  assert.equal(
    parseJson<CliError>(
      run(ws, ['export', '--project', 'other', '--application', 'app-demo', '--json']).stderr,
    ).error.code,
    'PROJECT_MISMATCH',
  );
  await rm(join(ws, 'projects/demo/question.md'));
  const result = run(ws, ['validate', '--json']);
  assert.equal(result.status, 3);
  assert.equal(parseJson<CliError>(result.stderr).error.code, 'PROJECT_PATH');
});

test('manifest duplicates, missing files and no accidental recursive discovery', async (t) => {
  const ws = await setup(t);
  await writeFile(join(ws, 'papers/ignored.md'), 'broken unrelated file');
  assert.equal(run(ws, ['validate']).status, 0);
  await cp(join(ws, 'papers/synthetic.md'), join(ws, 'papers/copy.md'));
  await edit(ws, 'workspace.json', (s) =>
    s.replace('"papers/synthetic.md",', '"papers/synthetic.md", "papers/copy.md",'),
  );
  assert.equal(
    parseJson<CliError>(run(ws, ['validate', '--json']).stderr).error.code,
    'DUPLICATE_ID',
  );
  await rm(join(ws, 'papers/copy.md'));
  assert.equal(run(ws, ['validate']).status, 3);
});

test('unknown fields, comments, BOM, CRLF and embedded fences survive export', async (t) => {
  const ws = await setup(t);
  await edit(
    ws,
    'papers/synthetic.md',
    (s) => '\uFEFF' + s.replaceAll('\n', '\r\n') + '\r\n```\r\n자료 안의 코드\r\n```\r\n',
  );
  const raw = await readFile(join(ws, 'papers/synthetic.md'), 'utf8');
  const output = run(ws, [...exportArgs, '--json']);
  assert.equal(output.status, 0, output.stderr);
  assert.equal(parseJson<Bundle>(output.stdout).records.at(1)?.content, raw);
  const md = run(ws, exportArgs);
  assert.ok(md.stdout.includes('````markdown'));
  assert.ok(md.stdout.includes(raw));
});

test('question path cannot escape the declared project root', async (t) => {
  const ws = await setup(t);
  await edit(ws, 'workspace.json', (s) => s.replace('"question.md"', '"../other/question.md"'));
  assert.equal(
    parseJson<CliError>(run(ws, ['validate', '--json']).stderr).error.code,
    'QUESTION_PATH',
  );
});

test('large bundles fail without truncating or writing', async (t) => {
  const ws = await setup(t);
  await edit(ws, 'papers/synthetic.md', (s) => s + '\n' + '긴 본문'.repeat(50000));
  const result = run(ws, [...exportArgs, '--json']);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(parseJson<CliError>(result.stderr).error.code, 'BUNDLE_TOO_LARGE');
});

test('source-checked can export but is never a proof of scientific truth', async (t) => {
  const ws = await setup(t);
  await edit(ws, 'papers/synthetic.md', (s) =>
    s.replace('status: draft', 'status: source-checked'),
  );
  const result = run(ws, ['export', '--project', 'demo', '--application', 'app-demo', '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    parseJson<Bundle>(result.stdout).warnings.some(
      (w) => w.includes('source-checked') || w.includes('draft'),
    ),
    false,
  );
  assert.equal(parseJson<Bundle>(result.stdout).source_texts.length, 0);
});

test('invalid and irrelevant options fail explicitly', async (t) => {
  const ws = await setup(t);
  for (const args of [
    ['show'],
    ['list', '--paper', 'paper-synthetic'],
    ['validate', '--format', 'xml'],
    ['export', '--project', 'demo'],
    ['list', '--project', 'missing'],
  ])
    assert.equal(run(ws, args).status, 2);
});

test('question selection preserves exact nested section, fences and provenance, excludes siblings', async (t) => {
  const ws = await setup(t);
  const content =
    '# Private\r\nDO NOT SHARE\r\n\r\n## Target ##\r\nbody\r\n### Child\r\nchild\r\n```md\r\n## Target\r\n```\r\n~~~\r\n# Fake\r\n~~~\r\n## Other\r\nOTHER PRIVATE\r\n';
  await writeFile(join(ws, 'projects/demo/question.md'), content);
  await edit(ws, 'workspace.json', (s) => s.replace('합성 프로젝트 질문', 'Target'));
  const r = run(ws, [...exportArgs, '--json']);
  assert.equal(r.status, 0, r.stderr);
  const q = parseJson<Bundle>(r.stdout).question;
  assert.equal(q.start_line, 4);
  assert.equal(q.end_line, 13);
  assert.equal(
    q.content,
    content.slice(content.indexOf('## Target ##'), content.indexOf('## Other')),
  );
  assert.match(q.sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(q.sha256, q.source_sha256);
  assert.ok(!r.stdout.includes('DO NOT SHARE'));
  assert.ok(!r.stdout.includes('OTHER PRIVATE'));
  const md = run(ws, exportArgs);
  assert.equal(md.status, 0, md.stderr);
  assert.ok(md.stdout.includes('````text'));
});

test('missing, ambiguous or absent question selector never falls back to whole file', async (t) => {
  const ws = await setup(t);
  for (const content of [
    '# Missing\nprivate',
    '# 합성 프로젝트 질문\nA\n# 합성 프로젝트 질문\nB',
  ]) {
    await writeFile(join(ws, 'projects/demo/question.md'), content);
    const r = run(ws, [...exportArgs, '--json', '--out', join(ws, 'must-not-exist.md')]);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.equal(parseJson<CliError>(r.stderr).error.code, 'QUESTION_SECTION');
    await assert.rejects(readFile(join(ws, 'must-not-exist.md')));
  }
  await edit(ws, 'workspace.json', (s) =>
    s.replace(/,?\s*"question_section": "합성 프로젝트 질문"/, ''),
  );
  const r = run(ws, [...exportArgs, '--json']);
  assert.equal(r.status, 2, r.stderr);
  assert.equal(parseJson<CliError>(r.stderr).error.code, 'QUESTION_SECTION_REQUIRED');
  assert.equal(r.stdout, '');
  assert.equal(
    selectQuestion('\uFEFF---\n# Target\n---\n# Real\ntext\n', 'Real').content,
    '# Real\ntext\n',
  );
});

async function sourceFixture(ws: string) {
  await edit(ws, 'papers/synthetic.md', (s) =>
    s.replace('  version: synthetic-v1', '  text_path: pages.json\n  version: synthetic-v1'),
  );
  const raw = await readFile(join(ws, 'papers/synthetic.md'), 'utf8');
  const match = required(/  url: (.+)/.exec(raw));
  const url = required(match[1]).replaceAll('"', '');
  const source: SourceText = {
    source_url: url,
    version: 'synthetic-v1',
    pdf_sha256: 'a'.repeat(64),
    extractor: 'synthetic fixture',
    pages: [{ page: 1, text: 'column A | column B\n1 | 2\n```data\n' }],
  };
  await writeFile(join(ws, 'papers/pages.json'), JSON.stringify(source));
  return source;
}

test('page text carries version, one-based pages, extraction caveat and hashes in both formats', async (t) => {
  const ws = await setup(t);
  const source = await sourceFixture(ws);
  const r = run(ws, [...exportArgs, '--json']);
  assert.equal(r.status, 0, r.stderr);
  const text = required(parseJson<Bundle>(r.stdout).source_texts[0]);
  assert.equal(text.version, source.version);
  assert.equal(required(text.pages[0]).text, required(source.pages[0]).text);
  assert.match(required(text.pages[0]).sha256, /^[a-f0-9]{64}$/);
  assert.match(text.notice, /visual verification/);
  const md = run(ws, exportArgs);
  assert.equal(md.status, 0, md.stderr);
  assert.ok(md.stdout.includes('PDF page 1 (1-based)'));
});

const invalidSources: [string, (source: SourceText) => SourceText, string][] = [
  ['version mismatch', (s) => ({ ...s, version: 'other-version' }), 'SOURCE_TEXT_VERSION'],
  [
    'URL mismatch',
    (s) => ({ ...s, source_url: 'https://example.org/another.pdf' }),
    'SOURCE_TEXT_VERSION',
  ],
  ['duplicate pages', (s) => ({ ...s, pages: [...s.pages, ...s.pages] }), 'SOURCE_TEXT_PAGE'],
  ['zero-based page', (s) => ({ ...s, pages: [{ page: 0, text: 'wrong' }] }), 'SOURCE_TEXT_SCHEMA'],
  ['empty extraction', (s) => ({ ...s, pages: [{ page: 1, text: '' }] }), 'SOURCE_TEXT_SCHEMA'],
];
for (const [name, change, code] of invalidSources)
  test(`source text rejects ${name} with no partial output`, async (t) => {
    const ws = await setup(t);
    const source = await sourceFixture(ws);
    await writeFile(join(ws, 'papers/pages.json'), JSON.stringify(change(source)));
    const r = run(ws, [...exportArgs, '--json']);
    assert.equal(r.status, 2, r.stderr);
    assert.equal(r.stdout, '');
    assert.equal(parseJson<CliError>(r.stderr).error.code, code);
  });
