import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import type { SelectedPaper } from '../dist/core/topic.js';
import type { TopicOutputs, FixtureSourceBook } from './helpers/fixture-types.js';
import { parseJson, required } from './helpers/analysis-fixture.js';

import { pdf } from './helpers/source-pdf.js';
import { runNode } from './helpers/run-node.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

function fixture(t: TestContext) {
  // Non-ASCII path; the Korean means "Danseo source".
  const dir = mkdtempSync(join(tmpdir(), '단서 원문 collection-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  function run(...args: string[]) {
    return runNode([cli, 'topic', ...args, '--dir', dir]);
  }
  function ok<Action extends keyof TopicOutputs>(
    action: Action,
    ...args: string[]
  ): TopicOutputs[Action] {
    const proc = run(action, ...args);
    assert.equal(proc.status, 0, proc.stderr);
    return parseJson<TopicOutputs[Action]>(proc.stdout);
  }
  function batch(papers: unknown) {
    const path = join(dir, 'query.json');
    writeFileSync(path, JSON.stringify({ query: 'example', papers }));
    ok('search', '--input', path);
  }
  const path = join(dir, 'download');
  function collect(
    id: string,
    edition = 'Journal 2024',
    extra: string[] = [],
    kind: 'published' | 'draft' = 'published',
    round = '1',
  ) {
    return ok(
      'collect',
      '--id',
      id,
      '--round',
      round,
      '--edition',
      edition,
      '--proof',
      edition,
      '--kind',
      kind,
      ...(extra.length ? extra : ['--pdf', path]),
    );
  }
  const copies = () => readdirSync(dir).filter((name) => /^source-.*\.pdf$/.test(name));
  ok('init', '--question', 'A research question');
  return { dir, path, run, ok, batch, collect, copies };
}
const paper = (key: string) =>
  ({
    key,
    title: 'Paper ' + key,
    authors: 'Alice Reader',
    edition: 'Journal 2024',
    source: 'https://example.com/' + key,
    year: 2024,
    reason: 'Compare ' + key,
    scope: 'abstract',
  }) satisfies Omit<SelectedPaper, 'number' | 'round'>;

test('local HTTP download, reuse and later supply preserve the selected round and earlier bytes', async (t) => {
  const { dir, path, ok, run, batch, collect, copies } = fixture(t);
  batch(['A', 'B', 'C', 'D'].map(paper));
  const emptyFiles = readdirSync(dir);
  assert.deepEqual(ok('sources').rows, []);
  assert.notEqual(run('collect', '--id', '1', '--round', '1').status, 0);
  assert.deepEqual(readdirSync(dir), emptyFiles);
  ok('select', '--ids', '1,2,3', '--round', '1', '--note', 'Reader choice');
  batch([{ ...paper('A'), edition: 'Journal 2025', source: 'https://example.com/A2' }]);
  const topicBefore = readFileSync(join(dir, 'topic.json'));
  const server = createServer((req, res) =>
    res.end(
      req.url === '/A' ? pdf('Paper A', 'Alice Reader', 'Journal 2024') : '<html>Abstract</html>',
    ),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = 'http://127.0.0.1:' + address.port;
  async function download(suffix: string) {
    writeFileSync(path, Buffer.from(await (await fetch(url + suffix)).arrayBuffer()));
  }
  await download('/A');
  const a = required(collect('1', undefined, ['--pdf', path, '--url', url + '/A']).ready[0]);
  assert.equal(a.paper.edition, 'Journal 2024');
  assert.equal(a.paper.note, 'Reader choice');
  assert.equal(a.file.origin, 'public');
  const existing = join(dir, 'already-owned.pdf');
  writeFileSync(existing, pdf('Paper B', 'Alice Reader', 'Journal 2024'));
  const previous = collect('2', undefined, ['--existing', existing]).ready;
  const linked = statSync(required(previous[1]).file.path, { bigint: true });
  const original = statSync(existing, { bigint: true });
  assert.deepEqual([linked.dev, linked.ino], [original.dev, original.ino]);
  assert.deepEqual(collect('2', undefined, ['--existing', existing]).ready, previous);
  await download('/C');
  const missing = required(collect('3', undefined, ['--pdf', path, '--url', url + '/C']).rows[2]);
  const failure = required(missing.failure);
  assert.match(failure.reason, /PDF/);
  assert.equal(failure.source, url + '/C');
  assert.equal(copies().length, 1);
  assert.deepEqual(ok('sources').ready, previous);
  writeFileSync(path, pdf('Paper C', 'Alice Reader', 'Journal 2024'));
  const supplied = collect('3');
  assert.equal(required(supplied.ready[2]).file.origin, 'provided');
  assert.deepEqual(supplied.ready.slice(0, 2), previous);
  assert.deepEqual(supplied, ok('sources'));
  assert.equal(copies().length, 2);
  assert.deepEqual(readFileSync(join(dir, 'topic.json')), topicBefore);
  writeFileSync(existing, 'changed');
  const changedRow = required(ok('sources').rows[1]);
  assert.equal(required(changedRow.files[0]).status, 'needs-recheck');
  rmSync(a.file.path);
  assert.deepEqual(
    ok('sources').ready.map((x) => x.paper.key),
    ['C'],
  );
  assert.notEqual(
    run('unavailable', '--id', '4', '--round', '1', '--reason', 'not selected').status,
    0,
  );
});

test('draft consent binds to the actual bytes and round, then yields to the publication', (t) => {
  const { path, batch, ok, collect, run } = fixture(t);
  batch([paper('A')]);
  ok('select', '--ids', '1');
  const put = (edition: string) => {
    writeFileSync(path, pdf('Paper A', 'Alice Reader', edition));
    return collect('1', edition, [], 'draft');
  };
  const decide = (hash: string, answer: 'accept' | 'decline') =>
    ok('decide', '--id', '1', '--round', '1', '--sha', hash, '--answer', answer);
  const pending = put('Preprint v1');
  assert.equal(pending.ready.length, 0);
  const pendingRow = required(pending.rows[0]);
  const hash = required(pendingRow.files[0]).sha256;
  assert.equal(decide(hash, 'decline').ready.length, 0);
  const declinedRow = required(ok('sources').rows[0]);
  assert.equal(required(declinedRow.files[0]).decision, 'declined');
  assert.equal(required(decide(hash, 'accept').ready[0]).file.edition, 'Preprint v1');
  const revised = put('Preprint v2');
  const revisedRow = required(revised.rows[0]);
  assert.equal(required(revisedRow.files[1]).decision, 'pending');
  assert.equal(required(revised.ready[0]).file.sha256, hash);
  assert.notEqual(
    run('decide', '--id', '1', '--round', '2', '--sha', hash, '--answer', 'accept').status,
    0,
  );
  writeFileSync(path, pdf('Paper A', 'Alice Reader', 'Journal 2024'));
  assert.equal(required(collect('1').ready[0]).file.edition, 'Journal 2024');
  batch([{ ...paper('A'), edition: 'v3' }]);
  ok('unselect', '--ids', '1');
  ok('select', '--ids', '1', '--round', '2');
  assert.deepEqual(ok('sources').ready, []);
});

test('mismatched identity, unknown edition, interrupted and missing files stay retryable', (t) => {
  const { path, dir, batch, ok, collect, copies, run } = fixture(t);
  batch([paper('A')]);
  ok('select', '--ids', '1');
  for (const bytes of [
    pdf('Different title', 'Alice Reader', 'Journal 2024'),
    pdf('Paper A', 'Other Author', 'Journal 2024'),
    pdf('Paper A', 'Alice Reader', 'Journal 2025'),
    pdf('Paper A', 'Alice Reader', 'Journal 2024').subarray(0, -90),
    Buffer.from('%PDF-1.4\ngarbage\n%%EOF'),
  ]) {
    writeFileSync(path, bytes);
    const result = collect('1');
    assert.equal(result.ready.length, 0);
    const failedRow = required(result.rows[0]);
    assert.ok(required(failedRow.failure).reason);
    assert.deepEqual(copies(), []);
  }
  rmSync(path);
  const missingFile = required(collect('1').rows[0]);
  assert.ok(required(missingFile.failure).reason);
  const waiting = ok(
    'unavailable',
    '--id',
    '1',
    '--round',
    '1',
    '--reason',
    'PDF download permission denied',
  );
  const waitingRow = required(waiting.rows[0]);
  assert.equal(required(waitingRow.failure).reason, 'PDF download permission denied');
  writeFileSync(join(dir, 'sources.json'), '{}');
  assert.notEqual(run('unavailable', '--id', '1', '--round', '1', '--reason', 'retry').status, 0);
  assert.equal(readFileSync(join(dir, 'sources.json'), 'utf8'), '{}');
});

test('published files need matching full identity and an edition without a draft marking', (t) => {
  const { batch, ok, path, collect } = fixture(t);
  const examples = [
    { selected: paper('A'), title: 'Paper A: A Replication' },
    { selected: { ...paper('B'), authors: 'Ann Lee' }, author: 'Joann Leeman' },
    { selected: { ...paper('C'), edition: 'Version 1.0' }, actual: 'Version 10' },
    { selected: { ...paper('D'), edition: 'Draft v1' } },
    { selected: paper('E'), mark: 'Author accepted manuscript Journal 2024' },
  ];
  batch(examples.map((x) => x.selected));
  ok('select', '--ids', '1,2,3,4,5');
  for (const [i, x] of examples.entries()) {
    const edition = x.actual ?? x.selected.edition;
    writeFileSync(
      path,
      pdf(x.title ?? x.selected.title, x.author ?? x.selected.authors, x.mark ?? edition),
    );
    const result = collect(String(i + 1), edition);
    assert.equal(result.ready.length, 0);
    const failedRow = required(result.rows[i]);
    assert.ok(required(failedRow.failure).reason);
  }
});

test('edition reuse keeps the original path, and retry repairs changed managed data without erasing it', (t) => {
  const { batch, ok, path, collect, copies } = fixture(t);
  batch([paper('A')]);
  ok('select', '--ids', '1');
  const original = pdf('Paper A', 'Alice Reader', 'Journal 2024');
  writeFileSync(path, original);
  const file = required(collect('1').ready[0]).file;
  writeFileSync(path, Buffer.concat([original, Buffer.from('\n')]));
  assert.deepEqual(required(collect('1').ready[0]).file, file);
  assert.equal(copies().length, 1);
  writeFileSync(file.path, 'externally edited');
  assert.deepEqual(ok('sources').ready, []);
  writeFileSync(path, original);
  const repaired = required(collect('1').ready[0]).file;
  assert.equal(repaired.sha256, file.sha256);
  assert.notEqual(repaired.path, file.path);
  assert.equal(readFileSync(file.path, 'utf8'), 'externally edited');
  assert.deepEqual(required(ok('sources').ready[0]).file, repaired);
});

test('standalone repository stamps, title containing Abstract and punctuated bylines', (t) => {
  const { batch, ok, path, collect } = fixture(t);
  const first = { ...paper('A'), title: 'Abstract Interpretation', authors: "Amy O'Connor" };
  const second = { ...paper('2203.14465'), source: 'https://arxiv.org/abs/2203.14465v2' };
  batch([first, second]);
  ok('select', '--ids', '1,2');
  writeFileSync(
    path,
    pdf(first.title, first.authors, ['Journal 2024', 'Abstract', 'Based on arXiv:2203.14465v2']),
  );
  assert.equal(collect('1').ready.length, 1);
  writeFileSync(path, pdf(second.title, second.authors, 'arXiv:2305.20050v1'));
  const mismatchedRow = required(collect('2', 'arXiv:2305.20050v1', [], 'draft').rows[1]);
  assert.ok(required(mismatchedRow.failure).reason);
});

test('the collected draft must match a secondary arXiv identifier imported with a DOI', (t) => {
  const { dir, ok, path, collect, copies } = fixture(t);
  const input = join(dir, 'references.ris');
  const record = [
    'TY  - CONF',
    'TT  - Synthetic paper',
    'A1  - Reader, Alice',
    'PY  - 2025',
    'DO  - 10.99999/synthetic',
  ];
  for (const round of ['1', '2', '3']) {
    const urls = [`UR  - https://example.org/published/${round}`];
    if (round === '2') urls.push('UR  - https://arxiv.org/abs/9999.11111');
    writeFileSync(input, [...record, ...urls, 'ER  -'].join('\n'));
    ok('import', '--input', input);
  }
  for (const round of ['1', '3']) {
    const selected = required(ok('select', '--ids', '1', '--round', round).selected[0]);
    assert.equal(selected.source, `https://example.org/published/${round}`);
    assert.equal(selected.edition, null);
    const otherWork = 'arXiv:9999.22222v2';
    writeFileSync(
      path,
      pdf('Synthetic paper', 'Alice Reader', otherWork + ' [cs.CL] 1 January 2025'),
    );
    const rejected = required(
      collect('1', otherWork, ['--existing', path], 'draft', round).rows[0],
    );
    assert.deepEqual(rejected.files, []);
    assert.match(required(rejected.failure).reason, /exact arXiv paper ID/);
    assert.deepEqual(copies(), []);
    const expectedWork = 'arXiv:9999.11111v2';
    writeFileSync(
      path,
      pdf('Synthetic paper', 'Alice Reader', expectedWork + ' [cs.CL] 1 January 2025'),
    );
    const registered = required(
      collect('1', expectedWork, ['--existing', path], 'draft', round).rows[0],
    );
    assert.equal(required(registered.files[0]).status, 'pending');
    ok('unselect', '--ids', '1');
  }
});

test('published headers and footer draft markings are checked independently of the paper title', (t) => {
  const { batch, ok, path, collect, dir } = fixture(t);
  const a = { ...paper('A'), title: 'How Lawyers Draft Contracts' };
  batch([a]);
  ok('select', '--ids', '1');
  writeFileSync(
    path,
    pdf(['Proceedings of X', a.title], a.authors, [
      'Journal 2024',
      'Abstract',
      'We compare a preprint with the final article',
      'Based on',
      'arXiv:2203.14465v2',
    ]),
  );
  const published = collect('1');
  assert.equal(published.ready.length, 1);
  writeFileSync(
    path,
    pdf(['Proceedings of X - Author accepted manuscript', a.title], a.authors, 'Journal 2024'),
  );
  assert.ok(required(collect('1').rows[0]).failure);
  writeFileSync(
    path,
    pdf(a.title, a.authors, ['Journal 2024', 'Abstract', 'Findings', 'Author accepted manuscript']),
  );
  assert.ok(required(collect('1').rows[0]).failure);
  const draftRow = required(collect('1', 'Author accepted manuscript', [], 'draft').rows[0]);
  const draft = required(draftRow.files[1]);
  // An earlier build could record a cropped publication quote from these exact bytes.
  const ledger = join(dir, 'sources.json');
  const data = parseJson<FixtureSourceBook>(readFileSync(ledger, 'utf8'));
  const savedRow = required(data.rows[0]);
  Object.assign(required(savedRow.files[1]), {
    edition: 'Journal 2024',
    proof: 'Journal 2024',
    draft: false,
    decision: null,
  });
  writeFileSync(ledger, JSON.stringify(data));
  const staleRow = required(ok('sources').rows[0]);
  assert.equal(required(staleRow.files[1]).status, 'needs-recheck');
  const correctedRow = required(collect('1', 'Author accepted manuscript', [], 'draft').rows[0]);
  const corrected = required(correctedRow.files[1]);
  assert.equal(corrected.sha256, draft.sha256);
  assert.equal(corrected.decision, 'pending');
  const reusedRow = required(collect('1', 'AUTHOR ACCEPTED MANUSCRIPT', [], 'draft').rows[0]);
  assert.deepEqual(required(reusedRow.files[1]), corrected);
});

test('a proceedings footer emitted before the title supplies evidence without becoming the title', (t) => {
  const { batch, ok, path, collect, copies } = fixture(t);
  const selected = { ...paper('A'), title: 'Paper A with a Long Title' };
  const versionWarning = 'This is not the version of record';
  const titleWithSameWords = { ...paper('B'), title: versionWarning };
  batch([selected, titleWithSameWords]);
  ok('select', '--ids', '1,2');
  const venue = 'Proceedings of Journal 2024, pages 20-30';
  const publication = [
    'Example City, June 2 - June 7, 2024.',
    'Copyright 2024 Association for Computational Linguistics',
    '20',
  ];
  const footer = [venue, ...publication];
  const existing = ['--existing', path];

  writeFileSync(path, pdf(['Different Paper', selected.title], selected.authors, [], footer));
  const mismatch = required(collect('1', selected.edition, existing).rows[0]);
  assert.match(required(mismatch.failure).reason, /first-page title differs/);
  assert.deepEqual(mismatch.files, []);

  for (const unexpectedFooter of [
    [...footer, 'A Replication of'],
    [...footer, versionWarning],
    [venue, versionWarning, ...publication],
  ]) {
    writeFileSync(path, pdf(selected.title, selected.authors, [], unexpectedFooter));
    const clutter = required(collect('1', selected.edition, existing).rows[0]);
    assert.match(required(clutter.failure).reason, /first-page title differs/);
    assert.deepEqual(clutter.files, []);
  }

  writeFileSync(
    path,
    pdf(
      selected.title,
      selected.authors,
      [],
      ['Proceedings of Journal 2024 - Author accepted manuscript, pages 20-30', ...publication],
    ),
  );
  const draft = required(collect('1', selected.edition, existing).rows[0]);
  assert.match(required(draft.failure).reason, /Register a substitute draft/);
  assert.deepEqual(draft.files, []);

  const footerWarnings = [
    pdf(selected.title, selected.authors, [], footer, versionWarning),
    pdf(selected.title, selected.authors, [], footer, `20  ${versionWarning}`),
    pdf(
      selected.title,
      selected.authors,
      [],
      [],
      `Proceedings of Journal 2024 - ${versionWarning}, pages 20-30`,
    ),
    pdf(
      selected.title,
      selected.authors,
      selected.edition,
      [],
      `${versionWarning}, June 2, 2024. Copyright 2024 Association for Computational Linguistics`,
    ),
    pdf(
      selected.title,
      selected.authors,
      selected.edition,
      [],
      [
        `${versionWarning}. Example City, June 2 - June 7, 2024.`,
        'Copyright 2024 Association for Computational Linguistics',
      ],
    ),
    pdf(
      selected.title,
      selected.authors,
      [],
      [`Proceedings of Journal 2024 - ${versionWarning}, pages 20-30`, ...publication],
    ),
    pdf(
      selected.title,
      selected.authors,
      [],
      [venue, `${versionWarning}. Example City, June 2 - June 7, 2024.`, ...publication.slice(1)],
    ),
  ];
  for (const bytes of footerWarnings) {
    writeFileSync(path, bytes);
    const row = required(collect('1', selected.edition, existing).rows[0]);
    assert.match(required(row.failure).reason, /Register a substitute draft/);
    assert.deepEqual(row.files, []);
  }

  writeFileSync(
    path,
    pdf(
      ['Paper A with a', 'Long Title'],
      selected.authors,
      ['Abstract', 'A separate manuscript uses this sentence:', versionWarning],
      footer,
    ),
  );
  assert.equal(
    required(collect('1', selected.edition, existing).ready[0]).file.path,
    realpathSync(path),
  );
  assert.deepEqual(copies(), []);

  writeFileSync(
    path,
    pdf(titleWithSameWords.title, titleWithSameWords.authors, [], footer, versionWarning),
  );
  const sameTitleWarning = required(collect('2', titleWithSameWords.edition, existing).rows[1]);
  assert.match(required(sameTitleWarning.failure).reason, /Register a substitute draft/);
  assert.deepEqual(sameTitleWarning.files, []);

  writeFileSync(path, pdf(titleWithSameWords.title, titleWithSameWords.authors, [], footer));
  const titleRow = required(collect('2', titleWithSameWords.edition, existing).rows[1]);
  assert.equal(required(titleRow.files[0]).status, 'ready');
});

test('footer draft markings next to publication text or a page number are found', (t) => {
  const { batch, ok, path, collect } = fixture(t);
  const selected = { ...paper('A'), title: 'Paper A with a Long Title' };
  batch([selected]);
  ok('select', '--ids', '1');
  const versionWarning = 'This is not the version of record';
  const lateFooters = [
    // The version notice counts anywhere in a footer line.
    `Example City, June 2 - June 7, 2024. ${versionWarning}`,
    `June 2, 2024. Copyright 2024 Association for Computational Linguistics. ${versionWarning}`,
    `Proceedings of Journal 2024, pages 20-30. ${versionWarning}`,
    `Example City, ${versionWarning}, June 2, 2024.`,
    `Proceedings of Journal 2024 (${versionWarning}), pages 20-30`,
    `Proceedings of Journal 2024 -- ${versionWarning}, pages 20-30`,
    `Proceedings of Journal 2024 ${versionWarning}, pages 20-30`,
    'Journal 2024 - This is not the version-of-record',
    'this is not the version of record',
    // Other labels count when they fill a phrase of the footer line.
    '20  Author accepted manuscript',
    "Journal 2024 | Author's accepted manuscript",
    'Journal 2024 | Draft v2',
    'Journal 2024 (Draft)',
    'Preprint.',
    'Preprint. Under review.',
    // Publisher sentences count at the start of a phrase.
    "This is the author's version of the work. It is posted here for your personal use.",
    'This is the authors version of the work. It is posted here for your personal use.',
  ];
  for (const lateFooter of lateFooters) {
    writeFileSync(path, pdf(selected.title, selected.authors, selected.edition, [], lateFooter));
    const row = required(collect('1', selected.edition, ['--existing', path]).rows[0]);
    assert.match(required(row.failure).reason, /Register a substitute draft/, lateFooter);
    assert.deepEqual(row.files, []);
  }

  // The venue named in this footer is also the only edition proof on the page.
  writeFileSync(
    path,
    pdf(
      selected.title,
      selected.authors,
      [],
      [],
      'Preprint submitted to Journal 2024 November 25, 2026',
    ),
  );
  const submitted = required(collect('1', selected.edition, ['--existing', path]).rows[0]);
  assert.match(required(submitted.failure).reason, /Register a substitute draft/);

  // A marking in a header above the title still marks the copy.
  const headers = [
    `Proceedings of X - ${versionWarning}`,
    'Proceedings of X - This is not the version-of-record',
    'Proceedings of X - Authors manuscript',
  ];
  for (const header of headers) {
    writeFileSync(path, pdf([header, selected.title], selected.authors, selected.edition));
    const row = required(collect('1', selected.edition, ['--existing', path]).rows[0]);
    assert.match(required(row.failure).reason, /Register a substitute draft/, header);
  }
});

test('prose and footnotes in the footer band do not count as draft markings', (t) => {
  const { batch, ok, path, collect } = fixture(t);
  const footers = [
    // Wrapped body text reaching the footer band starts in lower case.
    [
      'preprint. We then fine-tune the released draft on each task - under review',
      'conditions, the final article (draft v2) matches the earlier one.',
    ],
    // A footnote after its marker, and a publication line without a marking.
    [
      '1 Code and the draft annotation guidelines are available online.',
      'Proceedings of Journal 2024, pages 20-30. Example City, June 2, 2024.',
    ],
    // A label word that only starts a sentence or footnote.
    [
      '1 Under review conditions, accuracy fell.',
      'Results hold. Under review conditions, the model wins.',
    ],
    ['We test it. Draft-free decoding is faster.', '2 Preprint: https://arxiv.org/abs/1810.04805'],
    // Published journal footers with dates, a licence and parentheses.
    [
      'Received 12 March 2024; Accepted 5 May 2024; Published 1 June 2024',
      '(c) 2024 The Author(s). Published by Example Press. This is an open access article.',
    ],
  ];
  const selected = footers.map((_, index) => paper(String(index + 1)));
  batch(selected);
  ok('select', '--ids', selected.map((_, index) => index + 1).join(','));
  for (const [index, lateFooter] of footers.entries()) {
    const current = required(selected[index]);
    writeFileSync(path, pdf(current.title, current.authors, current.edition, [], lateFooter));
    const row = required(
      collect(String(index + 1), current.edition, ['--existing', path]).rows[index],
    );
    assert.equal(required(row.files[0]).status, 'ready', lateFooter.join(' / '));
  }
});

test('a complete attribution notice before the title preserves title and byline checks', (t) => {
  const { batch, ok, path, collect } = fixture(t);
  const selected = { ...paper('A'), authors: 'Alice Reader; Bob Writer' };
  batch([selected]);
  ok('select', '--ids', '1');
  const notice = [
    'Provided proper attribution is provided, Example Press hereby grants permission to',
    'reproduce the tables and figures in this paper solely for use in journalistic or',
    'scholarly works.',
  ];

  writeFileSync(
    path,
    pdf([...notice, selected.title + ' extended'], selected.authors, selected.edition),
  );
  assert.match(required(collect('1').rows[0]?.failure).reason, /first-page title differs/);

  writeFileSync(
    path,
    pdf([...notice, selected.title], 'Alice Reader and Chris Writer', selected.edition),
  );
  assert.match(
    required(collect('1').rows[0]?.failure).reason,
    /Unable to match the first-page authors/,
  );

  writeFileSync(
    path,
    pdf([...notice, selected.title], 'Alice Reader and Bob Writer', selected.edition),
  );
  assert.equal(collect('1').ready.length, 1);
});

test('revised metadata in another selection round can replace an unsuitable cached edition', (t) => {
  const { batch, ok, path, collect } = fixture(t);
  const a = paper('A');
  batch([a]);
  ok('select', '--ids', '1');
  writeFileSync(path, pdf(a.title, a.authors, 'Journal 2024'));
  assert.equal(collect('1').ready.length, 1);
  const revised = { ...a, authors: 'Revised Byline' };
  batch([revised]);
  ok('unselect', '--ids', '1');
  ok('select', '--ids', '1', '--round', '2');
  writeFileSync(path, pdf(a.title, revised.authors, 'Journal 2024'));
  const newEdition = ok(
    'collect',
    '--id',
    '1',
    '--round',
    '2',
    '--pdf',
    path,
    '--kind',
    'published',
    '--edition',
    'JOURNAL 2024',
    '--proof',
    'Journal 2024',
  );
  assert.equal(required(newEdition.ready[0]).paper.authors, revised.authors);
});
