import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hash } from './view-core.mjs';
import { validateCandidate } from './render-research-view.mjs';
import { run } from './render-verified-research-view.mjs';
import { overviewFor, completionEvidenceHash } from './research-evidence.mjs';
import { performancePlan } from './performance-evidence.mjs';

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'danseo-complete-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const candidate = JSON.parse(
    readFileSync(new URL('../assets/paper-relations.v2.example.json', import.meta.url), 'utf8'),
  );
  candidate.papers = candidate.papers.slice(0, 2);
  candidate.relations = candidate.relations.slice(0, 1);
  const evidence = {
    version: 2,
    sources: [],
    counts: [],
    tables: [],
    performance: [],
    source_checks: [],
    claim_checks: [],
    publication_checks: [],
  };
  const review = {
    verdict: 'supported',
    reason: 'Synthetic passage matches this test claim.',
    scope: 'Only the displayed synthetic passage.',
    reviewer: 'test fixture',
    reviewed_at: '2026-11-17T00:00:00Z',
    review_type: 'agent-self-check',
    state: 'current',
  };
  for (const paper of candidate.papers) {
    const id = paper.claims[0].evidence[0];
    const source = candidate.sources.find((source) => source.id === id);
    source.url = 'https://example.org/source/' + id;
    source.verification = 'agent-checked';
    paper.publication = { date: '2017-06-12', edition_date: '2023-08-02', source_id: id };
    paper.review_status = 'draft';
    paper.claims[0].reviews = [{ ...review }];
    const quote = paper.claims[0].statement;
    const html =
      '<!doctype html><html><body><p>' +
      quote +
      '</p><p>First public: 12 Jun 2017.</p><p>Edition: 2 Aug 2023.</p></body></html>';
    const file = id + '.html';
    writeFileSync(path.join(dir, file), html);
    evidence.source_checks.push({
      source_id: id,
      url: source.url,
      format: 'html',
      document_path: file,
      document_sha256: hash(html),
      page: null,
      quote,
    });
    evidence.claim_checks.push({
      paper_id: paper.id,
      claim_id: paper.claims[0].id,
      source_id: id,
      quote,
    });
    for (const [kind, date, dateQuote] of [
      ['first-publication', '2017-06-12', '12 Jun 2017'],
      ['edition', '2023-08-02', '2 Aug 2023'],
    ]) {
      evidence.source_checks.push({
        source_id: id,
        url: source.url,
        format: 'html',
        document_path: file,
        document_sha256: hash(html),
        page: null,
        quote: dateQuote,
      });
      evidence.publication_checks.push({
        paper_id: paper.id,
        source_id: id,
        kind,
        date,
        quote: dateQuote,
      });
    }
  }
  candidate.sources = candidate.sources.filter((source) =>
    candidate.papers.some((paper) =>
      paper.claims.some((claim) => claim.evidence.includes(source.id)),
    ),
  );
  const relation = candidate.relations[0];
  Object.assign(relation, {
    origin: 'source',
    status: 'source-checked',
    needs_recheck: false,
    review: { checked_by: 'test fixture', checked_at: '2026-11-17T00:00:00Z' },
  });
  Object.assign(candidate, overviewFor(candidate));
  const input = path.join(dir, 'candidate.json'),
    sidecar = path.join(dir, 'evidence.json'),
    output = path.join(dir, 'view.html');
  const save = (bind = true) => {
    evidence.performance = performancePlan(candidate).map((field) => ({
      ...field,
      kind: 'non-performance',
      reason: 'Synthetic method and date fixture; no measured comparison.',
      comparison: null,
    }));
    const bytes = JSON.stringify(candidate);
    if (bind)
      evidence.completion = {
        candidate_sha256: hash(bytes),
        evidence_sha256: completionEvidenceHash(evidence),
        checked_by: 'test fixture',
        checked_at: '2026-11-17T00:00:00Z',
        scope: 'Displayed synthetic claims, relations and publication metadata only.',
      };
    writeFileSync(input, bytes);
    writeFileSync(sidecar, JSON.stringify(evidence));
  };
  save();
  return {
    candidate,
    evidence,
    input,
    sidecar,
    output,
    save,
    args: (action) => [
      input,
      '--evidence',
      sidecar,
      ...(action === 'check' ? ['--check'] : ['--out', output]),
      '--complete',
    ],
  };
}

test('source-complete output checks displayed passages without pretending whole-paper draft became verified', (t) => {
  const f = fixture(t),
    before = readFileSync(f.input);
  const receipt = run(f.args('out'));
  assert.equal(receipt.delivery, 'source-complete');
  assert.match(
    readFileSync(f.output, 'utf8'),
    /Recorded source checks complete for the displayed claims/,
  );
  assert.match(
    readFileSync(f.output, 'utf8'),
    /Displayed synthetic claims, relations and publication metadata only\./,
  );
  assert.deepEqual(readFileSync(f.input), before);
  assert.ok(f.candidate.papers.every((paper) => paper.review_status === 'draft'));
});

for (const [name, change, expected] of [
  [
    'publication missing',
    (f) => {
      delete f.candidate.papers[0].publication;
    },
    /publication/,
  ],
  [
    'claim review missing',
    (f) => {
      f.candidate.papers[0].claims[0].reviews = [];
    },
    /supported passage review/,
  ],
  [
    'contradicted current claim',
    (f) => {
      f.candidate.papers[0].claims[0].reviews.push({
        ...f.candidate.papers[0].claims[0].reviews[0],
        verdict: 'contradicted',
      });
    },
    /supported passage review/,
  ],
  [
    'stale relation',
    (f) => {
      f.candidate.relations[0].needs_recheck = true;
      Object.assign(f.candidate, overviewFor(f.candidate));
    },
    /stale relation/,
  ],
  [
    'original not checked',
    (f) => {
      f.candidate.sources[0].verification = 'not-checked';
    },
    /directly checked/,
  ],
  [
    'archived original missing',
    (f) => {
      f.evidence.source_checks = [];
    },
    /archived original/,
  ],
  [
    'claim passage binding missing',
    (f) => {
      f.evidence.claim_checks = [];
    },
    /claim passage bindings/,
  ],
  [
    'claim quote not inspected',
    (f) => {
      f.evidence.claim_checks[0].quote = 'Uninspected passage';
    },
    /archived source_check quote/,
  ],
  [
    'date passage binding missing',
    (f) => {
      f.evidence.publication_checks = [];
    },
    /date passage bindings/,
  ],
  [
    'invented date linked only to another date',
    (f) => {
      f.candidate.papers[0].publication.date = '2018-06-12';
      f.evidence.publication_checks[0].date = '2018-06-12';
    },
    /does not match its archived quote/,
  ],
  [
    'passage review after completion',
    (f) => {
      f.candidate.papers[0].claims[0].reviews[0].reviewed_at = '2027-01-01T00:00:00Z';
    },
    /after completion/,
  ],
])
  test(`complete delivery rejects ${name} before writing output`, (t) => {
    const f = fixture(t);
    change(f);
    f.save();
    assert.throws(() => run(f.args('out')), expected);
    assert.equal(existsSync(f.output), false);
  });

test('changing the candidate or archived-evidence bindings requires renewed completion', (t) => {
  const f = fixture(t);
  f.candidate.papers[0].publication.date = '2018';
  f.save(false);
  assert.throws(() => run(f.args('check')), /candidate changed/);
  f.save();
  f.evidence.source_checks[0].quote = 'Class';
  assert.notEqual(completionEvidenceHash(f.evidence), f.evidence.completion.evidence_sha256);
  f.save(false);
  assert.throws(() => run(f.args('check')), /evidence changed/);
});

test('an exploratory output stays available but cannot silently discard a completion record', (t) => {
  const f = fixture(t);
  assert.throws(() => run(f.args('out').slice(0, -1)), /requires --complete/);
  delete f.evidence.completion;
  writeFileSync(f.sidecar, JSON.stringify(f.evidence));
  const receipt = run(f.args('out').slice(0, -1));
  assert.equal(receipt.delivery, 'exploration');
  assert.match(readFileSync(f.output, 'utf8'), /Exploration view/);
});

test('publication metadata validates precision, leap days, ordering and registered evidence', (t) => {
  const f = fixture(t),
    publication = f.candidate.papers[0].publication;
  for (const date of ['2017', '2017-06', '2024-02-29']) {
    Object.assign(publication, { date, edition_date: null });
    validateCandidate(f.candidate);
  }
  for (const date of [
    '2017-02-29',
    '2024-04-31',
    '2024-00',
    '2024-13',
    '2024-01-00',
    'June 2017',
  ]) {
    publication.date = date;
    assert.throws(() => validateCandidate(f.candidate), /calendar date|expected YYYY/);
  }
  Object.assign(publication, { date: '2017-06-12', edition_date: '2017' });
  validateCandidate(f.candidate);
  publication.edition_date = '2016';
  assert.throws(() => validateCandidate(f.candidate), /precedes/);
  publication.edition_date = null;
  publication.source_id = 'missing';
  assert.throws(() => validateCandidate(f.candidate), /registered/);
  delete f.candidate.papers[0].publication;
  validateCandidate(f.candidate);
});

test('complete dates cannot be later than the observed source check', (t) => {
  const f = fixture(t);
  f.evidence.completion.checked_at = '2016-01-01T00:00:00Z';
  writeFileSync(f.sidecar, JSON.stringify(f.evidence));
  assert.throws(() => run(f.args('out')), /publication date is after/);
  assert.equal(existsSync(f.output), false);
});

test('a publication binding cannot use a different claim-only quote from the same original', (t) => {
  const f = fixture(t);
  f.evidence.publication_checks[0].quote = f.candidate.papers[0].claims[0].statement;
  f.save();
  assert.throws(() => run(f.args('out')), /date does not match/);
  assert.equal(existsSync(f.output), false);
});

test('date-only publication values retain timezone and precision uncertainty at day/month/year boundaries', (t) => {
  for (const [date, checkedAt] of [
    ['2017-06-12', '2017-06-12T08:00:00+09:00'],
    ['2017-06', '2017-06-01T08:00:00+09:00'],
    ['2017', '2017-01-01T08:00:00+09:00'],
  ]) {
    const f = fixture(t);
    for (const paper of f.candidate.papers) {
      paper.publication.date = date;
      paper.publication.edition_date = null;
      paper.claims[0].reviews[0].reviewed_at = checkedAt;
    }
    f.evidence.publication_checks = f.evidence.publication_checks
      .filter((check) => check.kind === 'first-publication')
      .map((check) => ({ ...check, date }));
    f.candidate.relations[0].review.checked_at = checkedAt;
    f.save();
    f.evidence.completion.checked_at = checkedAt;
    writeFileSync(f.sidecar, JSON.stringify(f.evidence));
    assert.equal(run(f.args('check')).delivery, 'source-complete');
  }
});

test('a future completion timestamp cannot bypass the date and review boundaries', (t) => {
  const f = fixture(t);
  f.evidence.completion.checked_at = '2099-01-01T00:00:00Z';
  writeFileSync(f.sidecar, JSON.stringify(f.evidence));
  assert.throws(() => run(f.args('out')), /recorded source check cannot be in the future/);
  assert.equal(existsSync(f.output), false);
});
