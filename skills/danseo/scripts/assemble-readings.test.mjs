import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hash } from './view-core.mjs';
import { assemble, run as assembleRun } from './assemble-readings.mjs';
import { performancePlan } from './performance-evidence.mjs';
import { run as verifiedRun } from './render-verified-research-view.mjs';

const asset = (name) => JSON.parse(readFileSync(new URL(`../assets/${name}`, import.meta.url)));
const nonPerformance = (text) => ({
  text,
  performance: { kind: 'non-performance', reason: 'Synthetic fixture text with no result.' },
});

// Builds page text that contains every passage a reading quotes, so the
// synthetic "PDF" agrees with its reading result.
function quotedPages(reading) {
  const linesByPage = new Map();
  const add = (page, quote) => linesByPage.set(page, [...(linesByPage.get(page) ?? []), quote]);
  const { first_publication: first, edition } = reading.publication;
  add(first.page, first.quote);
  if (edition) add(edition.page, edition.quote);
  for (const claim of reading.claims)
    for (const passage of claim.evidence) add(passage.page, passage.quote);
  for (const table of reading.tables) add(table.page, table.quote);
  return [...linesByPage].map(([page, lines]) => ({ page, text: lines.join('\n') }));
}

function writeSyntheticPdf(directory, archive, pages) {
  const pdf = Buffer.from(`%PDF-1.7\nSynthetic fixture for ${archive.document_path}.`);
  writeFileSync(path.join(directory, archive.document_path), pdf);
  writeFileSync(
    path.join(directory, archive.text_path),
    JSON.stringify({ pdf_sha256: hash(pdf), pages }),
  );
}

// One run directory holding the bundled synthetic example: a paper with a
// first-publication date, an edition date and a performance table.
function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'danseo-assemble-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, 'readings'));
  mkdirSync(path.join(directory, 'sources'));
  const reading = asset('reading-result.example.json');
  const map = asset('map-plan.example.json');
  writeSyntheticPdf(directory, reading.sources[0].archive, quotedPages(reading));

  const mapFile = path.join(directory, 'map.json');
  const candidateFile = path.join(directory, 'candidate.json');
  const evidenceFile = path.join(directory, 'evidence.json');
  const save = () => {
    writeFileSync(path.join(directory, 'readings/two-pass.json'), JSON.stringify(reading));
    writeFileSync(mapFile, JSON.stringify(map));
  };
  save();
  const write = () => assembleRun([mapFile, '--write']);
  // What a reader does after the final source check: name the checked content.
  const declareCompletion = () => {
    map.completion = null;
    save();
    map.completion = {
      checked_by: 'synthetic example',
      checked_at: '2026-11-22T11:00:00+09:00',
      scope: 'The displayed synthetic claims and publication dates. No real paper was read.',
      content_sha256: assembleRun([mapFile, '--check']).content_sha256,
    };
    save();
  };
  return {
    directory,
    reading,
    map,
    mapFile,
    candidateFile,
    evidenceFile,
    save,
    write,
    declareCompletion,
    writeComplete: () => {
      declareCompletion();
      return write();
    },
    gate: (...flags) => verifiedRun([candidateFile, '--evidence', evidenceFile, ...flags]),
  };
}

test('a paper with two date kinds and a performance table passes the complete check', (t) => {
  const f = fixture(t);
  const readingBefore = readFileSync(path.join(f.directory, 'readings/two-pass.json'));
  assert.equal(f.write().completion, 'not-bound');
  const receipt = f.writeComplete();
  assert.equal(receipt.completion, 'bound');
  assert.equal(receipt.table_comparisons, 1);
  assert.equal(receipt.evidence_gate, 'not-run');

  const gate = f.gate('--check', '--complete');
  assert.equal(gate.delivery, 'source-complete');
  assert.equal(gate.performance_tables, 1);
  assert.equal(gate.performance_fields, 1);
  assert.equal(gate.source_files, 1);

  const candidate = JSON.parse(readFileSync(f.candidateFile, 'utf8'));
  const evidence = JSON.parse(readFileSync(f.evidenceFile, 'utf8'));
  assert.deepEqual(candidate.papers[0].publication, {
    date: '2021-03-04',
    edition_date: '2022-05-06',
    source_id: 'S.TwoPass',
  });
  assert.deepEqual(
    evidence.publication_checks.map((check) => check.kind),
    ['first-publication', 'edition'],
  );
  // The reader never wrote this sentence: it is computed from the table rows.
  assert.match(candidate.papers[0].claims[1].statement, /ahead 2, tied 0, behind 2/);
  // Every displayed field got the judgment written beside it.
  assert.equal(evidence.performance.length, performancePlan(candidate).length);
  assert.deepEqual(readFileSync(path.join(f.directory, 'readings/two-pass.json')), readingBefore);
});

test('a reading that lost one performance judgment is rejected by name', (t) => {
  const f = fixture(t);
  delete f.reading.claims[0].statement.performance;
  f.save();
  assert.throws(
    () => f.write(),
    /readings\/two-pass\.json: claim C\.Method\.statement: missing performance judgment/,
  );
  assert.equal(existsSync(f.candidateFile), false);
  assert.equal(existsSync(f.evidenceFile), false);
});

test('the gate still rejects assembled evidence that lost a performance review', (t) => {
  const f = fixture(t);
  f.writeComplete();
  const evidence = JSON.parse(readFileSync(f.evidenceFile, 'utf8'));
  evidence.performance.pop();
  writeFileSync(f.evidenceFile, JSON.stringify(evidence));
  assert.throws(() => f.gate('--check', '--complete'), /missing performance screening/);
});

test('a claim without its support verdict assembles but cannot be completed', (t) => {
  const f = fixture(t);
  f.reading.claims[0].reviews = [];
  f.save();
  // The assembler binds the declaration without judging it; the gate refuses it.
  f.writeComplete();
  assert.throws(
    () => f.gate('--check', '--complete'),
    /P\.TwoPass\/C\.Method: complete delivery requires a current supported passage review/,
  );
  // Without a completion declaration the same reading is a valid exploration.
  f.map.completion = null;
  f.save();
  assert.equal(f.write().completion, 'not-bound');
  assert.equal(f.gate('--check').delivery, 'exploration');
});

test('each displayed sentence needs the {text, performance} shape', (t) => {
  const f = fixture(t);
  const statement = () => f.reading.claims[0].statement;
  const comparison = structuredClone(f.reading.claims[1].statement);
  for (const [change, expected] of [
    [() => (f.reading.claims[0].statement = 'A bare sentence.'), /write \{"text", "performance"\}/],
    [() => delete statement().performance.reason, /statement\.performance: missing reason/],
    [() => (statement().performance.kind = 'exempt'), /performance\.kind: expected/],
    // A comparison must not carry hand-written text next to the computed report.
    [
      () => (f.reading.claims[1].statement = { ...comparison, text: 'Always ahead.' }),
      /claim C\.Result\.statement: unknown field text/,
    ],
    [
      () => (f.reading.claims[1].statement.performance.comparison.table_id = 'Missing'),
      /unknown table Missing/,
    ],
  ]) {
    const original = structuredClone(f.reading);
    change();
    f.save();
    assert.throws(() => assemble(f.mapFile), expected);
    Object.assign(f.reading, original);
  }
});

// A second paper archived as HTML, a checked relation, a concept background
// and a map-level source, to exercise every path the map plan contributes.
function addPriorPaper(f) {
  const quote = 'Earlier work retrieves passages in a single pass.';
  const html = `<!doctype html><html><body><p>${quote}</p><p>Published 2019.</p></body></html>`;
  writeFileSync(path.join(f.directory, 'sources/prior.html'), html);
  const prior = {
    version: 1,
    paper: {
      id: 'P.Prior',
      title: 'A synthetic single-pass baseline',
      edition: null,
      review_status: 'draft',
      short_title: nonPerformance('Single-pass baseline'),
      notes: [],
      reading_reason: nonPerformance('Shows the procedure the two-pass method starts from.'),
      citations: { count: 12, checked_on: '2026-11-20', source_id: 'S.Index' },
    },
    sources: [
      {
        id: 'S.Prior',
        title: 'A synthetic single-pass baseline (HTML)',
        url: 'https://example.org/synthetic-single-pass',
        locator: '§2',
        scope: nonPerformance('Synthetic source. One method sentence and the year were read.'),
        verification: 'agent-checked',
        archive: { format: 'html', document_path: 'sources/prior.html' },
      },
    ],
    publication: {
      source_id: 'S.Prior',
      first_publication: { date: '2019', page: null, quote: 'Published 2019.' },
      edition: null,
    },
    claims: [
      {
        id: 'C.1',
        statement: nonPerformance('The baseline retrieves passages in a single pass.'),
        conditions: [nonPerformance('A synthetic setting.')],
        limitations: [],
        evidence: [{ source_id: 'S.Prior', page: null, quote }],
        reviews: [
          {
            verdict: 'supported',
            reason: nonPerformance('The quoted sentence states the single-pass procedure.'),
            scope: nonPerformance('Only the quoted sentence.'),
            reviewer: 'synthetic example',
            reviewed_at: '2026-11-22T10:00:00+09:00',
            review_type: 'agent-self-check',
          },
        ],
      },
    ],
    tables: [],
  };
  writeFileSync(path.join(f.directory, 'readings/prior.json'), JSON.stringify(prior));
  f.map.readings.push('readings/prior.json');
  f.map.sources = [
    {
      id: 'S.Index',
      title: 'Synthetic citation index entry',
      url: 'https://example.org/index/single-pass',
      locator: 'Citation count field',
      scope: nonPerformance('Synthetic index entry matched to the baseline record.'),
      verification: 'not-checked',
      archive: null,
    },
  ];
  f.map.relations = [
    {
      id: 'R.Cites',
      source: 'P.TwoPass',
      target: 'P.Prior',
      kind: 'cites',
      origin: 'source',
      status: 'source-checked',
      needs_recheck: false,
      rationale: nonPerformance('The two-pass paper cites the single-pass procedure it extends.'),
      created_by: 'synthetic example',
      review: { checked_by: 'synthetic example', checked_at: '2026-11-22T10:30:00+09:00' },
      evidence_refs: [{ paper_id: 'P.TwoPass', claim_id: 'C.Method' }],
    },
  ];
  f.map.concepts = [
    {
      id: 'K.Passes',
      title: nonPerformance('Retrieval passes'),
      summary: nonPerformance('How many times the method queries the index.'),
      tier: 'method',
    },
  ];
  f.map.backgrounds = [
    {
      id: 'B.Passes',
      paper_id: 'P.TwoPass',
      concept_id: 'K.Passes',
      origin: 'ai',
      status: 'proposed',
      rationale: nonPerformance('The single-pass paper introduces the procedure.'),
      readings: [
        {
          paper_id: 'P.Prior',
          rationale: nonPerformance('Read its method section first.'),
          evidence: ['S.Prior'],
          return_question: nonPerformance('What does the second pass add?'),
        },
      ],
    },
  ];
  f.save();
  return prior;
}

test('two papers, a relation and a concept background assemble into one complete map', (t) => {
  const f = fixture(t);
  addPriorPaper(f);
  const receipt = f.writeComplete();
  assert.deepEqual(
    [receipt.papers, receipt.sources, receipt.relations],
    [2, 3, 1],
    'papers, sources and relations',
  );

  const output = path.join(f.directory, 'view.html');
  const gate = f.gate('--out', output, '--complete');
  assert.equal(gate.delivery, 'source-complete');
  assert.equal(gate.original_source_checks, 2);
  assert.match(readFileSync(output, 'utf8'), /Single-pass baseline/);

  const candidate = JSON.parse(readFileSync(f.candidateFile, 'utf8'));
  const evidence = JSON.parse(readFileSync(f.evidenceFile, 'utf8'));
  assert.equal(candidate.papers[1].citations.count, 12);
  assert.equal(candidate.papers[1].publication.edition_date, null);
  assert.match(candidate.description, /source-checked relations: 1/);
  assert.deepEqual(
    candidate.provenance.map((entry) => entry.name),
    ['map.json', 'readings/two-pass.json', 'readings/prior.json'],
  );
  // Only PDF originals carry page-aligned text; the HTML original is bound by its checks.
  assert.deepEqual(
    evidence.sources.map((source) => source.id),
    ['S.TwoPass'],
  );
  // Shared sources from the map plan come first, then each reading's own.
  assert.deepEqual(
    candidate.sources.map((source) => source.id),
    ['S.Index', 'S.TwoPass', 'S.Prior'],
  );
  const screenedPaths = evidence.performance.map((entry) => entry.path);
  for (const pointer of [
    '/relations/0/rationale',
    '/concepts/0/summary',
    '/backgrounds/0/readings/0/return_question',
    '/sources/0/scope',
    '/papers/1/reading_reason',
  ])
    assert.ok(screenedPaths.includes(pointer), pointer);
});

test("a reading cannot borrow another paper's source for its date, passage or table", (t) => {
  const f = fixture(t);
  addPriorPaper(f);
  const borrowed = /two-pass\.json: .*source S\.Prior belongs to readings\/prior\.json/;
  for (const change of [
    // The prior paper's year as this paper's first publication.
    () =>
      (f.reading.publication = {
        source_id: 'S.Prior',
        first_publication: { date: '2019', page: null, quote: 'Published 2019.' },
        edition: null,
      }),
    () =>
      f.reading.claims[0].evidence.push({
        source_id: 'S.Prior',
        page: null,
        quote: 'Earlier work retrieves passages in a single pass.',
      }),
    () => (f.reading.tables[0].source_id = 'S.Prior'),
    // Sources named without a quote follow the same rule.
    () =>
      (f.reading.paper.citations = {
        count: 3,
        checked_on: '2026-11-20',
        source_id: 'S.Prior',
      }),
    () =>
      (f.reading.paper.venue_rank = {
        venue: 'Synthetic venue',
        scheme: 'Synthetic scheme',
        edition: '2026',
        rank: 'A',
        top_tier: true,
        venue_source_id: 'S.TwoPass',
        source_id: 'S.Prior',
      }),
  ]) {
    const original = structuredClone(f.reading);
    change();
    f.save();
    assert.throws(() => assemble(f.mapFile), borrowed);
    Object.assign(f.reading, original);
  }
  f.save();
  assert.equal(assembleRun([f.mapFile, '--check']).ok, true);
});

test('a judgment missing from the map plan names the plan and field', (t) => {
  const f = fixture(t);
  addPriorPaper(f);
  delete f.map.relations[0].rationale.performance;
  f.save();
  assert.throws(
    () => f.write(),
    /map\.json: relations\[0\]\.rationale: missing performance judgment/,
  );
});

test('identifier collisions name the file that defined the identifier first', (t) => {
  const f = fixture(t);
  const prior = addPriorPaper(f);
  const savePrior = () =>
    writeFileSync(path.join(f.directory, 'readings/prior.json'), JSON.stringify(prior));
  for (const [change, expected] of [
    [
      () => (prior.sources[0].id = 'S.TwoPass'),
      /prior\.json: source S\.TwoPass is already defined in readings\/two-pass\.json/,
    ],
    [
      () => (prior.tables = [structuredClone(f.reading.tables[0])]),
      /prior\.json: table TwoPass\.Table1 is already defined in readings\/two-pass\.json/,
    ],
    [
      () => (prior.paper.id = 'P.TwoPass'),
      /prior\.json: paper P\.TwoPass is already defined in readings\/two-pass\.json/,
    ],
  ]) {
    const original = structuredClone(prior);
    change();
    savePrior();
    assert.throws(() => assemble(f.mapFile), expected);
    Object.assign(prior, original);
  }
});

test('a passage needs an archived original and a claim binds one passage per source', (t) => {
  const f = fixture(t);
  const passage = f.reading.claims[0].evidence[0];
  f.reading.claims[0].evidence.push({ ...passage, quote: 'Another passage.' });
  f.save();
  assert.throws(() => assemble(f.mapFile), /evidence\[1\]: quote one passage per source/);
  f.reading.claims[0].evidence.pop();
  f.reading.sources[0].archive = null;
  f.save();
  assert.throws(() => assemble(f.mapFile), /source S\.TwoPass has no archived original/);
});

test('input paths cannot leave the run directory', (t) => {
  // A path with ".." is refused before any file is opened, so nothing outside
  // the fixture directory needs to exist.
  const f = fixture(t);
  f.reading.sources[0].archive.document_path = '../outside.pdf';
  f.save();
  assert.throws(() => assemble(f.mapFile), /two-pass\.json: Source path must stay inside/);
  f.reading.sources[0].archive.document_path = path.join(f.directory, 'sources/two-pass.pdf');
  f.save();
  assert.throws(() => assemble(f.mapFile), /two-pass\.json: Source path must stay inside/);
  f.map.readings = ['../outside.json'];
  f.save();
  assert.throws(() => assemble(f.mapFile), /Source path must stay inside/);
});

test('writing replaces only files the last assembly wrote and nobody changed', (t) => {
  const f = fixture(t);
  const receiptFile = path.join(f.directory, 'assembly.json');
  const handWritten = JSON.stringify({ title: 'Hand-written file' });
  const refused = (name) => new RegExp(`${name} is not what the last assembly here wrote`);

  // Files that were there before any assembly.
  writeFileSync(f.candidateFile, handWritten);
  assert.equal(assembleRun([f.mapFile, '--check']).ok, true);
  assert.throws(() => f.write(), refused('candidate\\.json'));
  assert.equal(readFileSync(f.candidateFile, 'utf8'), handWritten);
  rmSync(f.candidateFile);
  writeFileSync(f.evidenceFile, handWritten);
  assert.throws(() => f.write(), refused('evidence\\.json'));
  assert.equal(existsSync(f.candidateFile), false);
  rmSync(f.evidenceFile);
  // A file that only resembles a receipt is someone else's too.
  const lookalike = { candidate_sha256: 'x', evidence_sha256: 'y', memo: 'keep' };
  for (const notAReceipt of [handWritten, JSON.stringify(lookalike), 'not JSON']) {
    writeFileSync(receiptFile, notAReceipt);
    assert.throws(() => f.write(), /assembly\.json is not an assembly receipt/);
    assert.equal(readFileSync(receiptFile, 'utf8'), notAReceipt);
  }
  rmSync(receiptFile);

  // Its own untouched output is replaced.
  const first = f.write();
  f.reading.paper.notes.push(nonPerformance('A note added after the first assembly.'));
  f.save();
  const second = f.write();
  assert.notEqual(second.candidate_sha256, first.candidate_sha256);
  assert.equal(f.gate('--check').delivery, 'exploration');

  // Either file edited by hand after the assembly is kept.
  for (const file of [f.evidenceFile, f.candidateFile]) {
    const assembled = readFileSync(file);
    writeFileSync(file, handWritten);
    assert.throws(() => f.write(), refused(path.basename(file).replace('.', '\\.')));
    assert.equal(readFileSync(file, 'utf8'), handWritten);
    writeFileSync(file, assembled);
    assert.equal(f.write().ok, true);
  }
});

test('a write that cannot finish leaves the earlier pair in place', (t) => {
  const f = fixture(t);
  f.write();
  const before = [f.candidateFile, f.evidenceFile].map((file) => readFileSync(file));
  f.reading.paper.notes.push(nonPerformance('A note that the failed write would add.'));
  f.save();
  // Occupy the temporary name of the second file, so its write fails.
  const occupied = `${f.evidenceFile}.${process.pid}.tmp`;
  writeFileSync(occupied, 'not ours');
  assert.throws(() => f.write(), /EEXIST/);
  assert.deepEqual(
    [f.candidateFile, f.evidenceFile].map((file) => readFileSync(file)),
    before,
  );
  for (const name of ['candidate.json', 'assembly.json'])
    assert.equal(existsSync(path.join(f.directory, `${name}.${process.pid}.tmp`)), false, name);
  assert.equal(readFileSync(occupied, 'utf8'), 'not ours');
  rmSync(occupied);
  assert.equal(f.write().ok, true);
});

test('a write cut short between files can be finished by the next run', (t) => {
  const f = fixture(t);
  f.write();
  const earlier = [f.candidateFile, f.evidenceFile].map((file) => readFileSync(file));
  f.reading.paper.notes.push(nonPerformance('A note added by the second assembly.'));
  f.save();
  const second = f.write();
  const receiptFile = path.join(f.directory, 'assembly.json');
  const secondReceipt = readFileSync(receiptFile);

  // The receipt is moved first, then candidate.json, then evidence.json.
  // Putting earlier files back beside the second receipt reproduces a stop
  // after each of those moves.
  const stoppedAfter = {
    'candidate.json': () => writeFileSync(f.evidenceFile, earlier[1]),
    'assembly.json': () => {
      writeFileSync(f.candidateFile, earlier[0]);
      writeFileSync(f.evidenceFile, earlier[1]);
    },
  };
  for (const [lastMovedFile, restoreEarlierFiles] of Object.entries(stoppedAfter)) {
    writeFileSync(receiptFile, secondReceipt);
    restoreEarlierFiles();
    const retried = f.write();
    assert.equal(retried.candidate_sha256, second.candidate_sha256, lastMovedFile);
    assert.equal(f.gate('--check').delivery, 'exploration', lastMovedFile);
  }
});

test('a completion declaration covers only the content it names', (t) => {
  const f = fixture(t);
  f.writeComplete();
  const assembledBefore = readFileSync(f.candidateFile);
  const stale = /map\.json: completion: .* differs from the content this declaration names/;

  // Changing a displayed sentence after the declaration.
  f.reading.claims[0].statement.text = 'The method retrieves passages in three passes.';
  f.save();
  assert.throws(() => f.write(), stale);
  assert.deepEqual(readFileSync(f.candidateFile), assembledBefore);

  // Changing an archived original after the declaration.
  f.reading.claims[0].statement.text =
    'The method retrieves passages in two passes and reranks the second pass.';
  f.save();
  assert.equal(f.write().completion, 'bound');
  const pagesFile = path.join(f.directory, f.reading.sources[0].archive.text_path);
  const extraction = JSON.parse(readFileSync(pagesFile, 'utf8'));
  extraction.pages.push({ page: 9, text: 'A page added later.' });
  writeFileSync(pagesFile, JSON.stringify(extraction));
  assert.throws(() => f.write(), stale);

  // Rereading and declaring again binds the new inputs.
  assert.equal(f.writeComplete().completion, 'bound');
  assert.equal(f.gate('--check', '--complete').delivery, 'source-complete');
});
