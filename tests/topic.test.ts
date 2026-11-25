import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import type { SelectedPaper } from '../dist/core/topic.js';
import type { TopicOutputs } from './helpers/fixture-types.js';
import { parseJson, required } from './helpers/analysis-fixture.js';
import { runNode } from './helpers/run-node.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
function topicFixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'danseo-topic-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  function run(action: string, ...args: string[]) {
    return runNode([cli, 'topic', action, '--dir', dir, ...args]);
  }
  function ok<Action extends keyof TopicOutputs>(
    action: Action,
    ...args: string[]
  ): TopicOutputs[Action] {
    const result = run(action, ...args);
    assert.equal(result.status, 0, result.stderr);
    return parseJson<TopicOutputs[Action]>(result.stdout);
  }
  const input = join(dir, 'batch.json');
  const saveBatch = (papers: unknown) =>
    writeFileSync(input, JSON.stringify({ query: 'test query', papers }));
  ok('init', '--question', 'research question');
  return { dir, input, saveBatch, ok, run };
}
function paper(key: string): Omit<SelectedPaper, 'number' | 'round'> {
  return {
    key,
    title: key,
    authors: 'Author',
    year: 2025,
    source: 'https://example.org/' + key,
    edition: 'v1',
    reason: 'reason for ' + key,
    scope: 'abstract',
  };
}

test('fresh CLI invocations preserve selected edition, reason, stable numbers and both search rounds', (t) => {
  const { input, saveBatch, ok, run } = topicFixture(t);
  const a = paper('a'),
    b = paper('b'),
    c = paper('c');
  saveBatch([a, b, c]);
  ok('search', '--input', input);
  const firstChoice = required(
    ok('select', '--round', '1', '--ids', '3', '--note', 'my reason').selected[0],
  );
  const revised = { ...c, edition: 'v2', source: c.source + '/v2', reason: 'another reason' };
  saveBatch([revised, paper('d'), b]);
  const second = ok('search', '--input', input);
  assert.deepEqual(
    required(second.searches[1]).papers.map((p) => p.number),
    [3, 4, 2],
  );
  assert.equal(ok('search', '--input', input).searches.length, 2);
  ok('select', '--round', '2', '--ids', '3,4');
  const reopened = ok('show');
  assert.deepEqual(reopened.selected[0], firstChoice);
  assert.equal(firstChoice.source, c.source);
  assert.equal(firstChoice.note, 'my reason');
  assert.equal(required(reopened.selected[1]).number, 4);
  assert.equal(run('init', '--question', 'other').status, 2);
  assert.deepEqual(ok('unselect', '--ids', '4').selected, [firstChoice]);
  ok('unselect', '--ids', '3');
  assert.match(run('select', '--ids', '3').stderr, /--round/);
  assert.equal(ok('select', '--round', '1', '--ids', '3').selected.at(0)?.source, c.source);
});

test('RIS import adds bibliography to the topic and keeps expected editions with the selection', (t) => {
  const { input, saveBatch, ok, run } = topicFixture(t);
  const existing = {
    ...paper('existing'),
    title: 'Synthetic proceedings paper',
    source: 'https://example.org/published',
  };
  saveBatch([existing]);
  ok('search', '--input', input);
  writeFileSync(
    input,
    '\uFEFF' +
      [
        'TY  - CONF',
        'T1  - null',
        'TT  - Synthetic proceedings',
        '      paper',
        'A1  - Reader, Alice',
        'A1  - Writer, Beatriz',
        'PY  - 2024',
        'UR  - https://example.org/published',
        'DO  - https://doi.org/10.99999/Synthetic',
        'ER  -',
        '',
        'TY  - JOUR',
        'T1  - Synthetic preprint',
        'A1  - Reader, Alice',
        'PY  - 2025',
        'UR  - https://arxiv.org/abs/9999.99999',
        'ER  -',
      ].join('\r\n'),
  );
  const imported = ok('import', '--input', input);
  const [published, draft] = required(imported.searches[1]).papers;
  assert.deepEqual(published, {
    ...existing,
    number: 1,
    title: 'Synthetic proceedings paper',
    authors: 'Alice Reader; Beatriz Writer',
    year: 2024,
    edition: null,
    doi: '10.99999/synthetic',
    reason: 'Imported bibliography',
    scope: 'bibliography',
  });
  assert.equal(draft?.arxiv, '9999.99999');
  assert.equal(draft?.edition, null);
  assert.equal(ok('import', '--input', input).searches.length, 2);
  assert.equal(
    run('select', '--ids', '1', '--round', '1', '--edition', 'Conference 2024').status,
    2,
  );
  assert.equal(
    run('select', '--ids', '1,2', '--round', '2', '--edition', 'Conference 2024').status,
    2,
  );
  ok('select', '--ids', '1', '--round', '2', '--edition', 'Conference 2024');
  assert.equal(
    run('select', '--ids', '1', '--round', '2', '--edition', 'Another edition').status,
    2,
  );
  const restored = ok('show');
  assert.equal(restored.selected[0]?.edition, 'Conference 2024');
  assert.equal(required(restored.searches[1]).papers[0]?.edition, null);
  assert.equal(required(restored.searches[0]).papers[0]?.edition, existing.edition);
});

test('an incomplete RIS does not save any of its candidates', (t) => {
  const { dir, input, run } = topicFixture(t);
  const before = readFileSync(join(dir, 'topic.json'));
  const record = [
    'TY  - JOUR',
    'TT  - Synthetic record',
    'A1  - Reader, Alice',
    'PY  - 2025',
    'DO  - 10.99999/fixture',
    'ER  -',
  ];
  writeFileSync(input, [...record, '', ...record.slice(0, -1)].join('\n'));
  const result = run('import', '--input', input);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid RIS record structure/);
  assert.deepEqual(readFileSync(join(dir, 'topic.json')), before);
});

test('RIS identifiers keep an existing number across source changes and reject conflicting records', (t) => {
  const { dir, input, saveBatch, ok, run } = topicFixture(t);
  const existing = { ...paper('local-a'), title: 'Synthetic identifier case' };
  saveBatch([existing]);
  ok('search', '--input', input);
  ok('select', '--ids', '1', '--round', '1');
  const ris = (doi: string, ...urls: string[]) =>
    writeFileSync(
      input,
      [
        'TY  - JOUR',
        'T1  - Synthetic identifier case',
        'A1  - Reader, Alice',
        'PY  - 2025',
        'DO  - ' + doi,
        ...urls.map((url) => 'UR  - ' + url),
        'ER  -',
      ].join('\n'),
    );
  const doi = '10.99999/first';
  ris(doi, existing.source, 'https://arxiv.org/abs/9999.11111');
  assert.equal(ok('import', '--input', input).searches[1]?.papers[0]?.number, 1);
  const differentSource = 'https://example.org/revised';
  ris(doi, differentSource, 'https://arxiv.org/pdf/9999.11111v2');
  const restored = ok('import', '--input', input);
  assert.equal(restored.searches[2]?.papers[0]?.number, 1);
  assert.equal(restored.selected[0]?.source, existing.source);
  assert.equal(restored.selected[0]?.edition, existing.edition);

  const saved = readFileSync(join(dir, 'topic.json'));
  ris('10.99999/different', existing.source);
  assert.match(run('import', '--input', input).stderr, /identifiers conflict/);
  ris('', 'https://arxiv.org/abs/9999.11111', 'https://arxiv.org/pdf/9999.22222v2');
  assert.match(run('import', '--input', input).stderr, /conflicting arXiv/);
  ris(doi, 'https://example.org/landing https://arxiv.org/abs/9999.22222');
  assert.match(run('import', '--input', input).stderr, /invalid HTTP/);
  ris('', existing.source);
  writeFileSync(input, readFileSync(input, 'utf8').replace(existing.title, 'Another paper'));
  assert.match(run('import', '--input', input).stderr, /different paper title/);
  assert.deepEqual(readFileSync(join(dir, 'topic.json')), saved);
});

test('RIS prefers the primary title and equates percent-encoded DOI URLs with plain DOI tags', (t) => {
  const { input, ok } = topicFixture(t);
  writeFileSync(
    input,
    [
      'TY  - JOUR',
      'TI  - Synthetic primary title',
      'TT  - Synthetic translated title',
      'AU  - Reader, Alice',
      'PY  - 2025',
      'DO  - 10.99999/<fixture>',
      'UR  - https://doi.org/10.99999/%3Cfixture%3E',
      'ER  -',
    ].join('\n'),
  );
  const imported = required(ok('import', '--input', input).searches[0]?.papers[0]);
  assert.equal(imported.title, 'Synthetic primary title');
  assert.equal(imported.doi, '10.99999/<fixture>');
  assert.equal(imported.source, 'https://doi.org/10.99999/%3Cfixture%3E');
});

test('the first RIS round links existing JSON candidates by their DOI and arXiv URLs', (t) => {
  const { input, saveBatch, ok } = topicFixture(t);
  saveBatch([
    { ...paper('old-doi'), source: 'https://doi.org/10.99999/Stable' },
    { ...paper('old-arxiv'), source: 'https://arxiv.org/abs/9999.11111' },
  ]);
  ok('search', '--input', input);
  const record = ['TY  - JOUR', 'T1  - Synthetic record', 'A1  - Reader, Alice', 'PY  - 2025'];
  writeFileSync(
    input,
    [
      ...record,
      'DO  - 10.99999/stable',
      'UR  - https://example.org/publisher',
      'ER  -',
      ...record,
      'UR  - https://arxiv.org/pdf/9999.11111v2.pdf',
      'ER  -',
    ].join('\n'),
  );
  const imported = required(ok('import', '--input', input).searches[1]).papers;
  assert.deepEqual(
    imported.map((candidate) => candidate.number),
    [1, 2],
  );
  assert.equal(imported[1]?.edition, 'arXiv:9999.11111v2');
});

test('a matching identifier across a paper history permits a revised title at the same URL', (t) => {
  const { input, saveBatch, ok } = topicFixture(t);
  const older = { ...paper('same-paper'), title: 'Working title' };
  saveBatch([older]);
  ok('search', '--input', input);
  saveBatch([{ ...older, source: 'https://doi.org/10.99999/revised', title: 'Final title' }]);
  ok('search', '--input', input);
  writeFileSync(
    input,
    [
      'TY  - JOUR',
      'T1  - Final title',
      'A1  - Reader, Alice',
      'PY  - 2025',
      'DO  - 10.99999/revised',
      'UR  - ' + older.source,
      'ER  -',
    ].join('\n'),
  );
  assert.equal(ok('import', '--input', input).searches[2]?.papers[0]?.number, 1);
});

test('an invalid batch, multi-select, or competing writer leaves the topic intact', (t) => {
  const { dir, input, saveBatch, ok, run } = topicFixture(t);
  saveBatch([paper('a')]);
  ok('search', '--input', input);
  const before = readFileSync(join(dir, 'topic.json'));
  const assertFailure = (action: string, ...args: string[]) => {
    assert.notEqual(run(action, ...args).status, 0);
    assert.deepEqual(readFileSync(join(dir, 'topic.json')), before);
  };
  assertFailure('select', '--ids', '1,99');
  writeFileSync(input, '{broken');
  const broken = run('search', '--input', input);
  assert.match(broken.stderr, /TOPIC:.*UTF-8 JSON/);
  assert.deepEqual(readFileSync(join(dir, 'topic.json')), before);
  for (const invalid of [
    [paper('a'), paper('a')],
    [{ ...paper('b'), source: 'invalid URL' }],
    [{ ...paper('b'), edition: null }],
    [{ ...paper('b'), source: paper('a').source }],
    ['a', 'b', 'c', 'd', 'e', 'f'].map(paper),
  ]) {
    saveBatch(invalid);
    assertFailure('search', '--input', input);
  }
  writeFileSync(join(dir, 'workspace.json.danseo-lock'), '');
  assertFailure('select', '--ids', '1');
});

test('malformed UTF-8 in input or saved metadata is rejected without replacing the topic', (t) => {
  const { dir, input, saveBatch, ok, run } = topicFixture(t);
  saveBatch([paper('a')]);
  ok('search', '--input', input);
  ok('select', '--round', '1', '--ids', '1');
  const file = join(dir, 'topic.json');
  const before = readFileSync(file);
  const malformed = (text: string) => {
    const bytes = Buffer.from(text);
    bytes[bytes.indexOf('reason for a')] = 0xff;
    return bytes;
  };
  writeFileSync(input, malformed(JSON.stringify({ query: 'next', papers: [paper('a')] })));
  const badInput = run('search', '--input', input);
  assert.equal(badInput.status, 2);
  assert.match(badInput.stderr, /UTF-8 JSON/);
  assert.deepEqual(readFileSync(file), before);
  const damaged = malformed(before.toString('utf8'));
  writeFileSync(file, damaged);
  const badSaved = run('unselect', '--ids', '1');
  assert.equal(badSaved.status, 2);
  assert.match(badSaved.stderr, /UTF-8 JSON/);
  assert.deepEqual(readFileSync(file), damaged);
});

test('filesystem access failures use exit 3 and release the writer lock after a read error', (t) => {
  const { dir, input, run, ok, saveBatch } = topicFixture(t);
  const missingDir = run('show', '--dir', join(dir, 'missing'));
  assert.equal(missingDir.status, 3, missingDir.stderr);
  assert.match(missingDir.stderr, /TOPIC_FILE/);
  const missingInput = run('search', '--input', input);
  assert.equal(missingInput.status, 3, missingInput.stderr);
  const before = readFileSync(join(dir, 'topic.json'));
  const blockedDir = join(dir, 'file');
  writeFileSync(blockedDir, 'not a directory');
  const notDirectory = run('init', '--dir', join(blockedDir, 'child'), '--question', 'test');
  assert.equal(notDirectory.status, 3, notDirectory.stderr);
  assert.match(notDirectory.stderr, /TOPIC_FILE/);
  assert.deepEqual(readFileSync(join(dir, 'topic.json')), before);
  saveBatch([paper('a')]);
  assert.equal(ok('search', '--input', input).searches.length, 1);
});
