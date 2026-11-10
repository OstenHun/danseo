import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
function topicFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'danseo-topic-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  function run(action, ...args) {
    return spawnSync(process.execPath, [cli, 'topic', action, '--dir', dir, ...args], { encoding: 'utf8' });
  }
  function ok(action, ...args) {
    const result = run(action, ...args);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  const input = join(dir, 'batch.json');
  const saveBatch = papers => writeFileSync(input, JSON.stringify({ query: 'test query', papers }));
  ok('init', '--question', 'research question');
  return { dir, input, saveBatch, ok, run };
}
function paper(key) {
  return { key, title: key, authors: 'Author', year: 2025, source: 'https://example.org/' + key,
    edition: 'v1', reason: 'reason for ' + key, scope: 'abstract' };
}

test('fresh CLI invocations preserve selected edition, reason, stable numbers and both search rounds', t => {
  const { input, saveBatch, ok, run } = topicFixture(t);
  const a = paper('a'), b = paper('b'), c = paper('c');
  saveBatch([a, b, c]);
  ok('search', '--input', input);
  const [firstChoice] = ok('select', '--round', '1', '--ids', '3', '--note', 'my reason').selected;
  const revised = { ...c, edition: 'v2', source: c.source + '/v2', reason: 'another reason' };
  saveBatch([revised, paper('d'), b]);
  const second = ok('search', '--input', input);
  assert.deepEqual(second.searches[1].papers.map(p => p.number), [3, 4, 2]);
  assert.equal(ok('search', '--input', input).searches.length, 2);
  ok('select', '--round', '2', '--ids', '3,4');
  const reopened = ok('show');
  assert.deepEqual(reopened.selected[0], firstChoice);
  assert.equal(firstChoice.source, c.source);
  assert.equal(firstChoice.note, 'my reason');
  assert.equal(reopened.selected[1].number, 4);
  assert.equal(run('init', '--question', 'other').status, 2);
  assert.deepEqual(ok('unselect', '--ids', '4').selected, [firstChoice]);
  ok('unselect', '--ids', '3');
  assert.match(run('select', '--ids', '3').stderr, /--round/);
  assert.equal(ok('select', '--round', '1', '--ids', '3').selected[0].source, c.source);
});

test('an invalid batch, multi-select, or competing writer leaves the topic intact', t => {
  const { dir, input, saveBatch, ok, run } = topicFixture(t);
  saveBatch([paper('a')]);
  ok('search', '--input', input);
  const before = readFileSync(join(dir, 'topic.json'));
  const assertFailure = (...args) => {
    assert.notEqual(run(...args).status, 0);
    assert.deepEqual(readFileSync(join(dir, 'topic.json')), before);
  };
  assertFailure('select', '--ids', '1,99');
  writeFileSync(input, '{broken');
  const broken = run('search', '--input', input);
  assert.match(broken.stderr, /TOPIC:.*UTF-8 JSON/);
  assert.deepEqual(readFileSync(join(dir, 'topic.json')), before);
  for (const invalid of [[paper('a'), paper('a')], [{ ...paper('b'), source: 'invalid URL' }],
    [{ ...paper('b'), source: paper('a').source }], ['a','b','c','d','e','f'].map(paper)]) {
    saveBatch(invalid);
    assertFailure('search', '--input', input);
  }
  writeFileSync(join(dir, 'workspace.json.danseo-lock'), '');
  assertFailure('select', '--ids', '1');
});

test('malformed UTF-8 in input or saved metadata is rejected without replacing the topic', t => {
  const { dir, input, saveBatch, ok, run } = topicFixture(t);
  saveBatch([paper('a')]);
  ok('search', '--input', input);
  ok('select', '--round', '1', '--ids', '1');
  const file = join(dir, 'topic.json');
  const before = readFileSync(file);
  const malformed = text => {
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

test('filesystem access failures use exit 3 and release the writer lock after a read error', t => {
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
