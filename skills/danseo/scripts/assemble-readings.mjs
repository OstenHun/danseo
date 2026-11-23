// Assembles per-paper reading results into the candidate and evidence files
// that render-verified-research-view.mjs checks.
//
// The reader decides what a passage supports, which dates a source states and
// whether a sentence reports performance. This script only links those
// decisions: it hashes the archived files, works out where each sentence lands
// in the candidate, computes the exact table-comparison text and writes the
// two files. It does not replace the evidence gate.
import { lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cliEntry, fail, hash, list, object, oneOf, text } from './view-core.mjs';
import { comparisonText, performancePlan, readTable } from './performance-evidence.mjs';
import { completionEvidenceHash, confinedFilePath, overviewFor } from './research-evidence.mjs';
import { validateCandidate } from './render-research-view.mjs';

const FORMAT_VERSION = 1;
const CANDIDATE_FILE = 'candidate.json';
const EVIDENCE_FILE = 'evidence.json';
// Records what the last --write produced, so a later run can tell its own
// output from a file someone else put there or changed.
const RECEIPT_FILE = 'assembly.json';

// ---------------------------------------------------------------------------
// Reading input files
// ---------------------------------------------------------------------------

// Names the input file in every error, so the reader knows which paper's
// reading result to reopen.
function inFile(fileName, work) {
  try {
    return work();
  } catch (error) {
    throw new Error(`${fileName}: ${error.message}`);
  }
}

function readJsonFile(directory, relativePath) {
  const bytes = readFileSync(confinedFilePath(directory, relativePath));
  try {
    return { bytes, data: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) };
  } catch (error) {
    return fail(`invalid JSON (${error.message})`);
  }
}

function requireVersion(data, at) {
  if (data?.version !== FORMAT_VERSION) fail(`${at}.version: expected ${FORMAT_VERSION}`);
}

function optionalFields(value, names) {
  return names.filter((name) => Object.hasOwn(value ?? {}, name));
}

// ---------------------------------------------------------------------------
// Assembly state
// ---------------------------------------------------------------------------

function newAssembly(directory, mapName) {
  return {
    directory,
    mapName,
    // source id -> { entry, definedIn, archive } in registration order
    sources: new Map(),
    // source id -> Map<page number, page text>, for PDF originals
    pagesBySource: new Map(),
    // table id -> { table, definedIn, parsed }
    tables: new Map(),
    // paper id -> file that defines it
    paperFiles: new Map(),
    // JSON pointer into the candidate -> { kind, reason, comparison }
    performanceByPath: new Map(),
    sourceCheckKeys: new Set(),
    evidence: {
      sources: [],
      tables: [],
      source_checks: [],
      claim_checks: [],
      publication_checks: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Sources and archived originals
// ---------------------------------------------------------------------------

const SOURCE_FIELDS = ['id', 'title', 'url', 'locator', 'scope', 'verification', 'archive'];

function readArchive(assembly, sourceId, archive) {
  if (archive === null) return null;
  oneOf(archive?.format, ['pdf', 'html'], `source ${sourceId}.archive.format`);
  const isPdf = archive.format === 'pdf';
  const fields = isPdf ? ['format', 'document_path', 'text_path'] : ['format', 'document_path'];
  object(archive, fields, `source ${sourceId}.archive`);

  const documentBytes = readFileSync(confinedFilePath(assembly.directory, archive.document_path));
  const hashed = {
    format: archive.format,
    document_path: archive.document_path,
    document_sha256: hash(documentBytes),
  };
  if (!isPdf) return hashed;

  const textBytes = readFileSync(confinedFilePath(assembly.directory, archive.text_path));
  const extraction = JSON.parse(textBytes.toString('utf8').replace(/^\uFEFF/, ''));
  list(extraction?.pages, `${archive.text_path}: pages`);
  assembly.pagesBySource.set(
    sourceId,
    new Map(extraction.pages.map((page) => [page.page, page.text])),
  );
  assembly.evidence.sources.push({
    id: sourceId,
    document_path: archive.document_path,
    document_sha256: hashed.document_sha256,
    text_path: archive.text_path,
    text_sha256: hash(textBytes),
  });
  return hashed;
}

function registerSources(assembly, sources, fileName) {
  list(sources, 'sources');
  for (const entry of sources) {
    object(entry, SOURCE_FIELDS, 'source');
    text(entry.id, 'source.id');
    const earlier = assembly.sources.get(entry.id);
    if (earlier) fail(`source ${entry.id} is already defined in ${earlier.definedIn}`);
    const archive = readArchive(assembly, entry.id, entry.archive);
    assembly.sources.set(entry.id, { entry, definedIn: fileName, archive });
  }
}

function registerTables(assembly, tables, fileName) {
  list(tables, 'tables');
  for (const table of tables) {
    text(table?.id, 'table.id');
    const earlier = assembly.tables.get(table.id);
    if (earlier) fail(`table ${table.id} is already defined in ${earlier.definedIn}`);
    assembly.tables.set(table.id, { table, definedIn: fileName, parsed: null });
    assembly.evidence.tables.push(table);
  }
}

function parsedTable(assembly, tableId) {
  const registered = assembly.tables.get(tableId);
  if (!registered) fail(`unknown table ${tableId}`);
  registered.parsed ??= readTable(registered.table, assembly.pagesBySource);
  return registered.parsed;
}

// A reading result may use its own sources and the shared sources of the map
// plan. A source that another paper's reading result defines would attach that
// paper's date, passage or table to this one.
function usableSource(assembly, fileName, sourceId, at) {
  const source = assembly.sources.get(sourceId);
  if (!source) fail(`${at}: unknown source ${sourceId}`);
  const isShared = source.definedIn === assembly.mapName;
  if (!isShared && source.definedIn !== fileName)
    fail(
      `${at}: source ${sourceId} belongs to ${source.definedIn}; use this paper's own sources ` +
        `or a shared source from ${assembly.mapName}`,
    );
  return source;
}

// Records that the reader quoted this passage from the archived original.
function addSourceCheck(assembly, fileName, sourceId, passage, at) {
  const source = usableSource(assembly, fileName, sourceId, at);
  if (!source.archive)
    fail(`${at}: source ${sourceId} has no archived original, so it cannot back a passage`);
  text(passage.quote, `${at}.quote`);
  const key = JSON.stringify([sourceId, passage.page, passage.quote]);
  if (assembly.sourceCheckKeys.has(key)) return;
  assembly.sourceCheckKeys.add(key);
  assembly.evidence.source_checks.push({
    source_id: sourceId,
    url: source.entry.url,
    format: source.archive.format,
    document_path: source.archive.document_path,
    document_sha256: source.archive.document_sha256,
    page: passage.page,
    quote: passage.quote,
  });
}

// ---------------------------------------------------------------------------
// Displayed text and its performance judgment
// ---------------------------------------------------------------------------

// Every sentence the map displays arrives as {text, performance}. Keeping the
// judgment beside its sentence means it cannot be forgotten or attached to the
// wrong field, and the reader never writes a candidate path by hand.
// A table comparison carries no text: the exact report is computed from the
// source table, because the gate rejects any other wording.
function screenedText(assembly, pointer, value, at) {
  if (typeof value === 'string')
    fail(`${at}: write {"text", "performance"}; a displayed sentence needs a performance judgment`);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${at}: expected {"text", "performance"}`);
  if (!Object.hasOwn(value, 'performance')) fail(`${at}: missing performance judgment`);

  const judgment = value.performance;
  oneOf(judgment?.kind, ['non-performance', 'table-comparison'], `${at}.performance.kind`);
  const isComparison = judgment.kind === 'table-comparison';
  object(value, isComparison ? ['performance'] : ['text', 'performance'], at);
  object(
    judgment,
    isComparison ? ['kind', 'reason', 'comparison'] : ['kind', 'reason'],
    `${at}.performance`,
  );
  text(judgment.reason, `${at}.performance.reason`);

  let displayed;
  if (isComparison) {
    const table = parsedTable(assembly, judgment.comparison?.table_id);
    displayed = comparisonText(table, judgment.comparison);
  } else {
    text(value.text, `${at}.text`);
    displayed = value.text;
  }
  assembly.performanceByPath.set(pointer, {
    kind: judgment.kind,
    reason: judgment.reason,
    comparison: isComparison ? judgment.comparison : null,
  });
  return displayed;
}

function screenedList(assembly, pointer, values, at) {
  list(values, at);
  return values.map((value, index) =>
    screenedText(assembly, `${pointer}/${index}`, value, `${at}[${index}]`),
  );
}

// ---------------------------------------------------------------------------
// One paper's reading result
// ---------------------------------------------------------------------------

const READING_FIELDS = ['version', 'paper', 'sources', 'publication', 'claims', 'tables'];
const PAPER_FIELDS = ['id', 'title', 'edition', 'review_status', 'short_title', 'notes'];
const OPTIONAL_SCREENED_PAPER_FIELDS = ['topic', 'reading_reason'];
// Passed through unchanged: the map displays them but the gate does not screen them.
const OPTIONAL_PLAIN_PAPER_FIELDS = ['citations', 'venue_rank', 'additional_venue_ranks'];
const CLAIM_FIELDS = ['id', 'statement', 'conditions', 'limitations', 'evidence', 'reviews'];
const REVIEW_FIELDS = ['verdict', 'reason', 'scope', 'reviewer', 'reviewed_at', 'review_type'];

function checkReadingShape(reading) {
  object(reading, READING_FIELDS, 'reading');
  requireVersion(reading, 'reading');
  object(
    reading.paper,
    [
      ...PAPER_FIELDS,
      ...optionalFields(reading.paper, OPTIONAL_SCREENED_PAPER_FIELDS),
      ...optionalFields(reading.paper, OPTIONAL_PLAIN_PAPER_FIELDS),
    ],
    'paper',
  );
  text(reading.paper.id, 'paper.id');
  list(reading.claims, 'claims');
}

// Returns the candidate's {date, edition_date, source_id} and records the
// passage that states each date.
function assemblePublication(assembly, paper, publication) {
  object(publication, ['source_id', 'first_publication', 'edition'], 'publication');
  const dates = [['first-publication', publication.first_publication, 'first_publication']];
  if (publication.edition !== null) dates.push(['edition', publication.edition, 'edition']);
  for (const [kind, dated, field] of dates) {
    const at = `publication.${field}`;
    object(dated, ['date', 'page', 'quote'], at);
    addSourceCheck(assembly, paper.file, publication.source_id, dated, at);
    assembly.evidence.publication_checks.push({
      paper_id: paper.id,
      source_id: publication.source_id,
      kind,
      date: dated.date,
      quote: dated.quote,
    });
  }
  return {
    date: publication.first_publication.date,
    edition_date: publication.edition?.date ?? null,
    source_id: publication.source_id,
  };
}

// Returns the claim's evidence source ids and records each quoted passage.
function assembleClaimEvidence(assembly, paper, claim, at) {
  list(claim.evidence, `${at}.evidence`);
  const sourceIds = [];
  claim.evidence.forEach((passage, index) => {
    const passageAt = `${at}.evidence[${index}]`;
    object(passage, ['source_id', 'page', 'quote'], passageAt);
    // The gate binds one passage to each claim and source.
    if (sourceIds.includes(passage.source_id))
      fail(`${passageAt}: quote one passage per source for each claim`);
    sourceIds.push(passage.source_id);
    addSourceCheck(assembly, paper.file, passage.source_id, passage, passageAt);
    assembly.evidence.claim_checks.push({
      paper_id: paper.id,
      claim_id: claim.id,
      source_id: passage.source_id,
      quote: passage.quote,
    });
  });
  return sourceIds;
}

// A reading result holds only the reviews made for this reading, so each one
// is current. An empty list means the passage has not been judged yet.
function assembleReviews(assembly, claimPath, reviews, at) {
  list(reviews, `${at}.reviews`);
  return reviews.map((review, index) => {
    const reviewAt = `${at}.reviews[${index}]`;
    const reviewPath = `${claimPath}/reviews/${index}`;
    object(review, REVIEW_FIELDS, reviewAt);
    return {
      verdict: review.verdict,
      reason: screenedText(assembly, `${reviewPath}/reason`, review.reason, `${reviewAt}.reason`),
      scope: screenedText(assembly, `${reviewPath}/scope`, review.scope, `${reviewAt}.scope`),
      reviewer: review.reviewer,
      reviewed_at: review.reviewed_at,
      review_type: review.review_type,
      state: 'current',
    };
  });
}

function assembleClaim(assembly, paper, claim, claimPath) {
  object(claim, CLAIM_FIELDS, 'claim');
  text(claim.id, 'claim.id');
  const at = `claim ${claim.id}`;
  return {
    id: claim.id,
    statement: screenedText(assembly, `${claimPath}/statement`, claim.statement, `${at}.statement`),
    conditions: screenedList(
      assembly,
      `${claimPath}/conditions`,
      claim.conditions,
      `${at}.conditions`,
    ),
    limitations: screenedList(
      assembly,
      `${claimPath}/limitations`,
      claim.limitations,
      `${at}.limitations`,
    ),
    evidence: assembleClaimEvidence(assembly, paper, claim, at),
    reviews: assembleReviews(assembly, claimPath, claim.reviews, at),
  };
}

// Citation counts and venue ranks name a source without quoting a passage.
// They follow the same ownership rule as quoted sources. The view contract
// checks their shape later, so anything that is not an id is skipped here.
function unquotedSourceReferences(paper) {
  const additionalRanks = Array.isArray(paper.additional_venue_ranks)
    ? paper.additional_venue_ranks
    : [];
  const ranks = [paper.venue_rank, ...additionalRanks];
  const sourceIds = [
    paper.citations?.source_id,
    ...ranks.flatMap((rank) => [rank?.venue_source_id, rank?.source_id]),
  ];
  return sourceIds.filter((sourceId) => typeof sourceId === 'string');
}

function assemblePaper(assembly, reading, paperIndex, fileName) {
  const input = reading.paper;
  const owner = { id: input.id, file: fileName };
  const paperPath = `/papers/${paperIndex}`;
  for (const table of reading.tables)
    usableSource(assembly, fileName, table.source_id, `table ${table.id}`);
  for (const sourceId of unquotedSourceReferences(input))
    usableSource(assembly, fileName, sourceId, 'paper');
  const paper = {
    id: input.id,
    title: input.title,
    edition: input.edition,
    review_status: input.review_status,
    claims: reading.claims.map((claim, claimIndex) =>
      assembleClaim(assembly, owner, claim, `${paperPath}/claims/${claimIndex}`),
    ),
    short_title: screenedText(
      assembly,
      `${paperPath}/short_title`,
      input.short_title,
      'paper.short_title',
    ),
    notes: screenedList(assembly, `${paperPath}/notes`, input.notes, 'paper.notes'),
  };
  for (const field of optionalFields(input, OPTIONAL_SCREENED_PAPER_FIELDS))
    paper[field] = screenedText(assembly, `${paperPath}/${field}`, input[field], `paper.${field}`);
  for (const field of optionalFields(input, OPTIONAL_PLAIN_PAPER_FIELDS))
    paper[field] = input[field];
  if (reading.publication !== null)
    paper.publication = assemblePublication(assembly, owner, reading.publication);
  return paper;
}

// ---------------------------------------------------------------------------
// The map plan: text that spans papers
// ---------------------------------------------------------------------------

const MAP_FIELDS = [
  'version',
  'title',
  'language',
  'start',
  'readings',
  'sources',
  'relations',
  'completion',
];
const OPTIONAL_MAP_FIELDS = ['focal_paper_id', 'concepts', 'backgrounds'];

function checkMapShape(map) {
  object(map, [...MAP_FIELDS, ...optionalFields(map, OPTIONAL_MAP_FIELDS)], 'map');
  requireVersion(map, 'map');
  oneOf(map.language, ['en', 'ko'], 'map.language');
  list(map.readings, 'readings');
  if (!map.readings.length) fail('readings: list at least one reading result');
  map.readings.forEach((readingPath, index) => text(readingPath, `readings[${index}]`));
  if (new Set(map.readings).size !== map.readings.length) fail('readings: duplicate path');
  list(map.relations, 'relations');
  if (map.completion !== null)
    object(map.completion, ['checked_by', 'checked_at', 'scope', 'content_sha256'], 'completion');
}

// Identifies what a completion declaration covers: the assembled wording and
// every evidence binding, including the hashes of the archived files. It
// changes when an input changes and also when a newer assembler computes a
// different sentence from the same inputs. Provenance is left out because it
// hashes map.json, which holds the declaration itself.
function contentHash(candidate, evidenceBeforeCompletion) {
  const { provenance, ...displayed } = candidate;
  return hash(JSON.stringify({ candidate: displayed, evidence: evidenceBeforeCompletion }));
}

// A declaration made for earlier content must not be carried onto changed
// content: the reader has to reread what changed and declare again.
function requireCurrentDeclaration(completion, contentSha256) {
  if (completion.content_sha256 !== contentSha256)
    fail(
      'completion: the assembled wording or evidence differs from the content this ' +
        'declaration names. Reread what changed, then declare completion again with ' +
        `content_sha256 ${contentSha256}`,
    );
}

function plainObject(value, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${at}: expected object`);
  return value;
}

function assembleSources(assembly) {
  return [...assembly.sources.values()].map(({ entry, definedIn }, index) =>
    inFile(definedIn, () => ({
      id: entry.id,
      title: entry.title,
      url: entry.url,
      locator: entry.locator,
      scope: screenedText(assembly, `/sources/${index}/scope`, entry.scope, `source ${entry.id}`),
      verification: entry.verification,
    })),
  );
}

function assembleRelations(assembly, relations) {
  return relations.map((relation, index) => {
    const at = `relations[${index}]`;
    return {
      ...plainObject(relation, at),
      rationale: screenedText(
        assembly,
        `/relations/${index}/rationale`,
        relation.rationale,
        `${at}.rationale`,
      ),
    };
  });
}

function assembleConcepts(assembly, concepts) {
  list(concepts, 'concepts');
  return concepts.map((concept, index) => {
    const at = `concepts[${index}]`;
    const conceptPath = `/concepts/${index}`;
    return {
      ...plainObject(concept, at),
      title: screenedText(assembly, `${conceptPath}/title`, concept.title, `${at}.title`),
      summary: screenedText(assembly, `${conceptPath}/summary`, concept.summary, `${at}.summary`),
    };
  });
}

function assembleBackgroundReading(assembly, reading, readingPath, at) {
  return {
    ...plainObject(reading, at),
    rationale: screenedText(
      assembly,
      `${readingPath}/rationale`,
      reading.rationale,
      `${at}.rationale`,
    ),
    return_question: screenedText(
      assembly,
      `${readingPath}/return_question`,
      reading.return_question,
      `${at}.return_question`,
    ),
  };
}

function assembleBackgrounds(assembly, backgrounds) {
  list(backgrounds, 'backgrounds');
  return backgrounds.map((background, index) => {
    const at = `backgrounds[${index}]`;
    const backgroundPath = `/backgrounds/${index}`;
    list(plainObject(background, at).readings, `${at}.readings`);
    return {
      ...background,
      rationale: screenedText(
        assembly,
        `${backgroundPath}/rationale`,
        background.rationale,
        `${at}.rationale`,
      ),
      readings: background.readings.map((reading, readingIndex) =>
        assembleBackgroundReading(
          assembly,
          reading,
          `${backgroundPath}/readings/${readingIndex}`,
          `${at}.readings[${readingIndex}]`,
        ),
      ),
    };
  });
}

// ---------------------------------------------------------------------------
// Candidate and evidence
// ---------------------------------------------------------------------------

// The gate wants one review for every path in the performance plan. Each one
// was collected beside its sentence; this joins them and adds the text hashes.
function performanceReviews(assembly, candidate) {
  const plan = performancePlan(candidate);
  const reviews = plan.map((entry) => {
    const judgment = assembly.performanceByPath.get(entry.path);
    if (!judgment) fail(`${entry.path}: the reading format carries no judgment for this field`);
    return { ...entry, ...judgment };
  });
  const planned = new Set(plan.map((entry) => entry.path));
  for (const pointer of assembly.performanceByPath.keys())
    if (!planned.has(pointer)) fail(`${pointer}: this judgment matches no displayed field`);
  return reviews;
}

function loadReadings(assembly, map) {
  return map.readings.map((readingPath) =>
    inFile(readingPath, () => {
      const { bytes, data: reading } = readJsonFile(assembly.directory, readingPath);
      checkReadingShape(reading);
      const earlier = assembly.paperFiles.get(reading.paper.id);
      if (earlier) fail(`paper ${reading.paper.id} is already defined in ${earlier}`);
      assembly.paperFiles.set(reading.paper.id, readingPath);
      registerSources(assembly, reading.sources, readingPath);
      registerTables(assembly, reading.tables, readingPath);
      return { readingPath, reading, sha256: hash(bytes) };
    }),
  );
}

function readMapPlan(directory, mapName) {
  return inFile(mapName, () => {
    const file = readJsonFile(directory, mapName);
    checkMapShape(file.data);
    return file;
  });
}

// The candidate's map-level fields come from the map plan and its papers from
// the reading results. The order of the keys is part of the output: it decides
// the bytes of candidate.json, and the completion record names their hash.
function assembleCandidate(assembly, map, mapBytes, readings) {
  const { mapName } = assembly;
  const papers = readings.map(({ readingPath, reading }, paperIndex) =>
    inFile(readingPath, () => assemblePaper(assembly, reading, paperIndex, readingPath)),
  );
  const sources = assembleSources(assembly);
  const candidate = inFile(mapName, () => ({
    version: 2,
    mode: 'paper-relations',
    title: screenedText(assembly, '/title', map.title, 'title'),
    start: map.start,
    ...(Object.hasOwn(map, 'focal_paper_id') ? { focal_paper_id: map.focal_paper_id } : {}),
    papers,
    sources,
    relations: assembleRelations(assembly, map.relations),
    ...(Object.hasOwn(map, 'concepts')
      ? { concepts: assembleConcepts(assembly, map.concepts) }
      : {}),
    ...(Object.hasOwn(map, 'backgrounds')
      ? { backgrounds: assembleBackgrounds(assembly, map.backgrounds) }
      : {}),
    provenance: [
      { name: mapName, sha256: hash(mapBytes) },
      ...readings.map(({ readingPath, sha256 }) => ({ name: readingPath, sha256 })),
    ],
    language: map.language,
  }));
  // description, view_reason and scope are derived from the relation states.
  Object.assign(candidate, overviewFor(candidate));
  validateCandidate(candidate);
  return candidate;
}

// Everything except the performance reviews was collected while the papers
// were assembled.
function assembleEvidence(assembly, candidate) {
  return {
    version: 2,
    sources: assembly.evidence.sources,
    counts: [],
    tables: assembly.evidence.tables,
    performance: performanceReviews(assembly, candidate),
    source_checks: assembly.evidence.source_checks,
    claim_checks: assembly.evidence.claim_checks,
    publication_checks: assembly.evidence.publication_checks,
  };
}

// Binding records a check the reader already finished; it is not a check.
function bindCompletion(assembly, evidence, declaration, candidateJson, contentSha256) {
  inFile(assembly.mapName, () => requireCurrentDeclaration(declaration, contentSha256));
  evidence.completion = {
    candidate_sha256: hash(candidateJson),
    evidence_sha256: completionEvidenceHash(evidence),
    checked_by: declaration.checked_by,
    checked_at: declaration.checked_at,
    scope: declaration.scope,
  };
}

export function assemble(mapFile) {
  const directory = path.dirname(path.resolve(mapFile));
  const mapName = path.basename(mapFile);
  const assembly = newAssembly(directory, mapName);
  const { bytes: mapBytes, data: map } = readMapPlan(directory, mapName);

  // First register every source and table, so a sentence in any file can
  // report a comparison from any registered table. Shared sources come first
  // because a reading result may refer to them.
  inFile(mapName, () => registerSources(assembly, map.sources, mapName));
  const readings = loadReadings(assembly, map);

  const candidate = assembleCandidate(assembly, map, mapBytes, readings);
  const evidence = assembleEvidence(assembly, candidate);
  const candidateJson = JSON.stringify(candidate, null, 2) + '\n';
  const contentSha256 = contentHash(candidate, evidence);
  if (map.completion !== null)
    bindCompletion(assembly, evidence, map.completion, candidateJson, contentSha256);
  const evidenceJson = JSON.stringify(evidence, null, 2) + '\n';

  return {
    directory,
    mapName,
    mapBytes,
    contentSha256,
    candidate,
    evidence,
    candidateJson,
    evidenceJson,
  };
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

const OUTPUT_HASH_FIELDS = [
  [CANDIDATE_FILE, 'candidate_sha256'],
  [EVIDENCE_FILE, 'evidence_sha256'],
];

// Returns the bytes of a regular file, or null when nothing is there. A link
// or directory in an output position is never followed or replaced.
function regularFileBytes(file) {
  const info = lstatSync(file, { throwIfNoEntry: false });
  if (!info) return null;
  if (!info.isFile())
    fail(`${path.basename(file)} is not a regular file; move it or use another directory`);
  return readFileSync(file);
}

const SHA256_HEX = /^[a-f0-9]{64}$/;
const isHash = (value) => typeof value === 'string' && SHA256_HEX.test(value);

// The receipt the last assembly in this directory left, or null. Any other
// file with this name is someone else's and is not replaced.
function readReceipt(directory) {
  const bytes = regularFileBytes(path.join(directory, RECEIPT_FILE));
  if (bytes === null) return null;
  try {
    const receipt = JSON.parse(bytes.toString('utf8'));
    object(receipt, ['candidate_sha256', 'evidence_sha256', 'replaced'], RECEIPT_FILE);
    object(receipt.replaced, ['candidate_sha256', 'evidence_sha256'], RECEIPT_FILE);
    for (const [, hashField] of OUTPUT_HASH_FIELDS) {
      const replaced = receipt.replaced[hashField];
      if (!isHash(receipt[hashField]) || (replaced !== null && !isHash(replaced)))
        fail('expected SHA-256 values');
    }
    return receipt;
  } catch {
    return fail(`${RECEIPT_FILE} is not an assembly receipt; move it or use another directory`);
  }
}

// Hand-written inputs use the names candidate.json and evidence.json too.
// Replace a file only while it is byte for byte what an assembly here wrote:
// the last output, or the output before it when the last write was cut short
// between files. Returns the hashes now on disk.
function replaceableOutputHashes(directory) {
  const receipt = readReceipt(directory);
  const onDisk = {};
  for (const [name, hashField] of OUTPUT_HASH_FIELDS) {
    const bytes = regularFileBytes(path.join(directory, name));
    onDisk[hashField] = bytes === null ? null : hash(bytes);
    const ownHashes = [receipt?.[hashField], receipt?.replaced[hashField]];
    if (bytes !== null && !ownHashes.includes(onDisk[hashField]))
      fail(`${name} is not what the last assembly here wrote; move it or use another directory`);
  }
  return onDisk;
}

// Writes every file completely before moving any into place, so a failed
// write leaves the earlier files as they were.
function writeTogether(directory, files) {
  const pending = [];
  for (const [name, content] of files) {
    const target = path.join(directory, name);
    const temporary = `${target}.${process.pid}.tmp`;
    try {
      writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      // EEXIST means the name already belonged to someone else. After any
      // other failure the partial file is ours to remove.
      if (error.code !== 'EEXIST') rmSync(temporary, { force: true });
      for (const earlier of pending) rmSync(earlier.temporary, { force: true });
      throw error;
    }
    pending.push({ temporary, target });
  }
  for (const { temporary, target } of pending) renameSync(temporary, target);
}

// What the command prints: the sizes and hashes of the assembled files. It says
// plainly that the evidence gate has not run.
function summaryOf(assembled) {
  const { candidate, evidence } = assembled;
  const tableComparisons = evidence.performance.filter(
    (entry) => entry.kind === 'table-comparison',
  );
  return {
    ok: true,
    map_sha256: hash(assembled.mapBytes),
    content_sha256: assembled.contentSha256,
    papers: candidate.papers.length,
    sources: candidate.sources.length,
    relations: candidate.relations.length,
    performance_reviews: evidence.performance.length,
    table_comparisons: tableComparisons.length,
    completion: evidence.completion ? 'bound' : 'not-bound',
    checks: 'reading-shape-and-identifiers',
    evidence_gate: 'not-run',
    candidate_sha256: hash(assembled.candidateJson),
    evidence_sha256: hash(assembled.evidenceJson),
  };
}

function writeOutputs(assembled, summary) {
  const assemblyReceipt = {
    candidate_sha256: summary.candidate_sha256,
    evidence_sha256: summary.evidence_sha256,
    replaced: replaceableOutputHashes(assembled.directory),
  };
  // The receipt goes first: if a later move fails, it already names both the
  // new and the replaced files, so the next run can finish the job.
  writeTogether(assembled.directory, [
    [RECEIPT_FILE, JSON.stringify(assemblyReceipt, null, 2) + '\n'],
    [CANDIDATE_FILE, assembled.candidateJson],
    [EVIDENCE_FILE, assembled.evidenceJson],
  ]);
}

export function run(args) {
  const [mapFile, action] = args;
  if (args.length !== 2 || !['--check', '--write'].includes(action))
    fail('Expected map.json --check | map.json --write');
  const assembled = assemble(mapFile);
  const summary = summaryOf(assembled);
  if (action === '--write') {
    writeOutputs(assembled, summary);
    summary.candidate = path.join(assembled.directory, CANDIDATE_FILE);
    summary.evidence = path.join(assembled.directory, EVIDENCE_FILE);
  }
  return summary;
}
cliEntry(import.meta.url, run);
