import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { hash, fail, object, text, list } from './view-core.mjs';
import { verifyPerformance, performanceFields } from './performance-evidence.mjs';

// A bounded evidence gate, not a natural-language truth classifier.

const normalize = (value) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Canonical overview
// ---------------------------------------------------------------------------

// The overview is written into the candidate, not the page, so its Korean text stays
// out of the browser language pack.
const koreanOverview = JSON.parse(
  readFileSync(new URL('../assets/research-overview.ko.json', import.meta.url), 'utf8'),
);
const uiText = (language, text) =>
  language === 'ko' && Object.hasOwn(koreanOverview, text) ? koreanOverview[text] : text;
const uiFormat = (language, text, values) =>
  uiText(language, text).replace(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );

const isCurrentSourceCheckedRelation = (relation) =>
  relation.origin === 'source' && relation.status === 'source-checked' && !relation.needs_recheck;

export function overviewFor(candidate) {
  const relations = candidate.relations ?? [];
  const checkedCount = relations.filter(isCurrentSourceCheckedRelation).length;
  const suggestedCount = relations.filter((relation) => relation.origin === 'ai').length;
  const uncheckedCount = relations.length - checkedCount - suggestedCount;
  const backgroundCount = candidate.backgrounds?.length ?? 0;
  const countReadings = () =>
    candidate.backgrounds.reduce((total, background) => total + background.readings.length, 0);

  const language = candidate.language;
  const relationCounts = uiFormat(
    language,
    'Papers: {papers} · source-checked relations: {checked} · suggested connections: {suggested} · unchecked relations: {unchecked}.',
    {
      papers: candidate.papers.length,
      checked: checkedCount,
      suggested: suggestedCount,
      unchecked: uncheckedCount,
    },
  );
  const backgroundCounts = backgroundCount
    ? ' ' +
      uiFormat(language, 'Concept backgrounds: {backgrounds} · Suggested readings: {readings}.', {
        backgrounds: backgroundCount,
        readings: countReadings(),
      })
    : '';
  return {
    description: relationCounts + backgroundCounts,
    view_reason: uiText(
      language,
      'Explore source-checked relations and suggested connections separately.',
    ),
    scope: uiText(
      language,
      'Only input papers and relations are shown. ' +
        'Check each evidence scope for source coverage and unknowns. ' +
        'Source checking does not establish reproduction or reader understanding.',
    ),
  };
}

// ---------------------------------------------------------------------------
// Quotes and counts
// ---------------------------------------------------------------------------

// A quote must begin and end on a token boundary, so a substring cannot turn
// 117 into 17 or 1,234 into 234.
const NUMBER_OR_WORD_CHARACTER = /[\p{L}\p{N}.,]/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

function containsQuote(pageText, quote) {
  const haystack = normalize(pageText);
  const needle = normalize(quote);
  const startsWithTokenCharacter = NUMBER_OR_WORD_CHARACTER.test(needle[0]);
  const endsWithTokenCharacter = NUMBER_OR_WORD_CHARACTER.test(needle.at(-1));

  let position = haystack.indexOf(needle);
  while (position !== -1) {
    const before = haystack[position - 1];
    const after = haystack[position + needle.length];
    const cutsTokenAtStart =
      startsWithTokenCharacter && before && NUMBER_OR_WORD_CHARACTER.test(before);
    const cutsTokenAtEnd = endsWithTokenCharacter && after && LETTER_OR_DIGIT.test(after);
    if (!cutsTokenAtStart && !cutsTokenAtEnd) return true;
    position = haystack.indexOf(needle, position + 1);
  }
  return false;
}

const COUNT_UNIT_LABELS = { records: 'Records', documents: 'Documents', pairs: 'Pairs' };

// Explicitly supported numeric count forms only. No claims about arbitrary quantities.
const NOT_INSIDE_A_NUMBER_OR_WORD = '(?<![\\w.,])';
const COUNT_VALUE = '([0-9]+(?:,[0-9]{3})*)';
// The Korean counter is a generic counter word. The Korean units mean record (two words),
// document and (query) pair, in that order.
const OPTIONAL_KOREAN_COUNTER = '(?:개\\s*)?';
const OPTIONAL_PARENTHESIZED_NOTE = '(?:\\([^)]{1,30}\\)\\s*)?';
const COUNT_UNIT_WORD = '(records?\\b|documents?\\b|pairs?\\b|레코드|기록|문서|(?:질의\\s*)?쌍)';
const COUNT_MENTION = new RegExp(
  NOT_INSIDE_A_NUMBER_OR_WORD +
    COUNT_VALUE +
    '\\s*' +
    OPTIONAL_KOREAN_COUNTER +
    OPTIONAL_PARENTHESIZED_NOTE +
    COUNT_UNIT_WORD,
  'giu',
);

function countUnit(unitWord) {
  if (/record|레코드|기록/.test(unitWord)) return 'records';
  if (/document|문서/.test(unitWord)) return 'documents';
  return 'pairs';
}

export function countMentions(value) {
  const mentions = [];
  for (const [, digits, unitWord] of normalize(value).matchAll(COUNT_MENTION)) {
    const number = Number(digits.replaceAll(',', ''));
    if (!Number.isSafeInteger(number)) fail('Count exceeds safe integer range');
    mentions.push({ unit: countUnit(unitWord.toLowerCase()), value: number });
  }
  return mentions;
}

export function countText(binding) {
  const counts = binding.items
    .map((item) => `${item.value} ${COUNT_UNIT_LABELS[item.unit]}`)
    .join(', ');
  return `Source count (${binding.source_id}, p. ${binding.page}): ${counts}.`;
}

function visibleCountFields(candidate) {
  const fields = new Map();
  candidate.papers.forEach((paper, paperIndex) => {
    const paperPath = `/papers/${paperIndex}`;
    if (paper.reading_reason) fields.set(`${paperPath}/reading_reason`, paper.reading_reason);
    (paper.notes ?? []).forEach((note, noteIndex) =>
      fields.set(`${paperPath}/notes/${noteIndex}`, note),
    );
    paper.claims.forEach((claim, claimIndex) => {
      const claimPath = `${paperPath}/claims/${claimIndex}`;
      fields.set(`${claimPath}/statement`, claim.statement);
      for (const key of ['conditions', 'limitations'])
        claim[key].forEach((value, index) => fields.set(`${claimPath}/${key}/${index}`, value));
    });
  });
  const performanceByPath = performanceFields(candidate);
  for (const [pointer, field] of performanceByPath) {
    if (/^\/(?:concepts|backgrounds)\//.test(pointer)) fields.set(pointer, field.value);
  }
  return { fields, performanceByPath };
}

// ---------------------------------------------------------------------------
// Local source files
// ---------------------------------------------------------------------------

const MAX_SOURCE_FILE_BYTES = 32 * 1024 * 1024;
const SHA256_HEX = /^[a-f0-9]{64}$/;

// Resolves symlinks before comparing, so a link inside the evidence directory
// cannot point at a file outside it.
function resolveInsideDirectory(directory, relativePath) {
  text(relativePath, 'source path');
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..'))
    fail('Source path must stay inside the evidence directory');
  const resolved = realpathSync(path.resolve(directory, relativePath));
  const fromDirectory = path.relative(realpathSync(directory), resolved);
  const escapes =
    fromDirectory === '..' ||
    fromDirectory.startsWith(`..${path.sep}`) ||
    path.isAbsolute(fromDirectory);
  if (escapes) fail('Source path escapes evidence directory');
  return resolved;
}

// Returns the real path of a regular file below the directory. Shared with the
// reading assembler, which must hash a file before any expected hash exists.
export function confinedFilePath(directory, relativePath) {
  const resolved = resolveInsideDirectory(directory, relativePath);
  const info = statSync(resolved);
  if (!info.isFile() || info.size > MAX_SOURCE_FILE_BYTES)
    fail('Expected source file under 32 MiB');
  return resolved;
}

function localFile(directory, relativePath, expectedHash) {
  const resolved = confinedFilePath(directory, relativePath);
  if (!SHA256_HEX.test(expectedHash)) fail('Expected SHA-256');
  const bytes = readFileSync(resolved);
  if (hash(bytes) !== expectedHash) fail(`Source hash mismatch: ${relativePath}`);
  return bytes;
}

const startsWithPdfMarker = (bytes) => bytes.subarray(0, 5).toString() === '%PDF-';

// ---------------------------------------------------------------------------
// Archived original source checks
// ---------------------------------------------------------------------------

const SOURCE_CHECK_FIELDS = [
  'source_id',
  'url',
  'format',
  'document_path',
  'document_sha256',
  'page',
  'quote',
];
const HTML_DOCUMENT_MARKER = /<(?:!doctype\s+html|html)[\s>]/i;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const HTML_NON_CONTENT_BLOCK = /<(head|script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const HTML_TAG = /<[^>]*>/g;

// Match body text, excluding obvious non-content. CSS visibility and the
// remote publisher's identity still need separate inspection.
function htmlBodyText(html) {
  return html.replace(HTML_COMMENT, '').replace(HTML_NON_CONTENT_BLOCK, '').replace(HTML_TAG, ' ');
}

function verifyPdfSourceCheck(check, source, bytes, evidence, pagesBySource) {
  const registered = evidence.sources.find((entry) => entry.id === source.id);
  const matchesRegisteredPdf =
    registered &&
    registered.document_sha256 === check.document_sha256 &&
    startsWithPdfMarker(bytes);
  if (!matchesRegisteredPdf)
    fail('source_check: original PDF must match registered page extraction');
  const pageText = pagesBySource.get(source.id)?.get(check.page);
  if (!pageText || !containsQuote(pageText, check.quote))
    fail(`source_check ${source.id}: quote missing from original PDF page`);
}

function verifyHtmlSourceCheck(check, bytes) {
  const html = bytes.toString('utf8');
  if (check.page !== null || !HTML_DOCUMENT_MARKER.test(html))
    fail('source_check: expected original HTML with page:null, not summary text');
  if (!containsQuote(htmlBodyText(html), check.quote))
    fail('source_check: quote missing from original HTML');
}

function archivedOriginalSourceIds(candidate, evidence, directory, pagesBySource) {
  const checks = evidence.source_checks ?? [];
  list(checks, 'source_checks');
  const originals = new Set();
  for (const check of checks) {
    object(check, SOURCE_CHECK_FIELDS, 'source_check');
    const source = candidate.sources.find((entry) => entry.id === check.source_id);
    const htmlWithoutUrl = check.format === 'html' && !source?.url;
    if (!source || check.url !== source.url || htmlWithoutUrl)
      fail('source_check: exact registered original URL required (local PDFs may use null)');
    text(check.quote, 'source_check.quote');
    const bytes = localFile(directory, check.document_path, check.document_sha256);
    if (check.format === 'pdf') verifyPdfSourceCheck(check, source, bytes, evidence, pagesBySource);
    else if (check.format === 'html') verifyHtmlSourceCheck(check, bytes);
    else fail('source_check: format must be html or pdf');
    originals.add(source.id);
  }
  return originals;
}

function requireOriginalsForCheckedSources(candidate, requireOriginal) {
  for (const source of candidate.sources)
    if (source.verification === 'agent-checked') requireOriginal(source.id, source.id);
}

function requireOriginalsForCheckedPapers(candidate, requireOriginal) {
  for (const paper of candidate.papers) {
    if (paper.review_status !== 'source-checked') continue;
    if (!paper.claims.length)
      fail(
        `${paper.id}: whole-paper source-checked requires original claim evidence; ` +
          'use draft for passage-only checks',
      );
    for (const claim of paper.claims) {
      const at = `${paper.id}/${claim.id}`;
      if (!claim.evidence.length) fail(`${at}: checked paper requires original claim evidence`);
      claim.evidence.forEach((sourceId) => requireOriginal(sourceId, at));
    }
  }
}

function requireOriginalsForCheckedRelations(candidate, requireOriginal) {
  const claimSourceIds = ({ paper_id, claim_id }) => {
    const paper = candidate.papers.find((entry) => entry.id === paper_id);
    return paper?.claims.find((claim) => claim.id === claim_id)?.evidence ?? [];
  };
  for (const relation of candidate.relations) {
    if (relation.status !== 'source-checked' || relation.needs_recheck) continue;
    if (!relation.evidence_refs.length)
      fail(`${relation.id}: checked relation needs original claim references`);
    const citesItsOwnPaper = relation.evidence_refs.some((ref) => ref.paper_id === relation.source);
    if (!citesItsOwnPaper)
      fail(`${relation.id}: checked relation requires evidence from its asserting source paper`);
    for (const ref of relation.evidence_refs) {
      const sourceIds = claimSourceIds(ref);
      if (!sourceIds.length) fail(`${relation.id}: checked relation needs original claim evidence`);
      sourceIds.forEach((sourceId) => requireOriginal(sourceId, relation.id));
    }
  }
}

function verifySourceChecks(candidate, evidence, directory, pagesBySource) {
  const originals = archivedOriginalSourceIds(candidate, evidence, directory, pagesBySource);
  const requireOriginal = (sourceId, at) => {
    if (!originals.has(sourceId))
      fail(
        `${at}: checked state requires archived original source_checks; ` +
          'summaries stay not-checked/draft/proposed ' +
          '(or retain historical status with needs_recheck:true)',
      );
  };
  requireOriginalsForCheckedSources(candidate, requireOriginal);
  requireOriginalsForCheckedPapers(candidate, requireOriginal);
  requireOriginalsForCheckedRelations(candidate, requireOriginal);
  return originals.size;
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

// Completion describes only the displayed evidence, not an entire paper or scientific truth.
export function completionEvidenceHash(evidence) {
  const { completion, ...sourceEvidence } = evidence;
  return hash(JSON.stringify(sourceEvidence));
}

const ZONED_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/;
const isZonedTime = (value) =>
  typeof value === 'string' && ZONED_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
// Full names and three-letter abbreviations both map to the month number.
const MONTH_NUMBERS = new Map(
  MONTH_NAMES.flatMap((name, index) => [
    [name, index + 1],
    [name.slice(0, 3), index + 1],
  ]),
);

const ISO_OR_SLASH_DATE = /\b([1-9]\d{3})[-/](\d{1,2})(?:[-/](\d{1,2}))?\b/g;
// Korean dates write year, month and optional day, each followed by its unit word.
const KOREAN_DATE = /([1-9]\d{3})년\s*(\d{1,2})월(?:\s*(\d{1,2})일)?/g;
const DAY_MONTH_YEAR = /\b(\d{1,2})\s+([A-Za-z]+)\s+([1-9]\d{3})\b/g;
const MONTH_DAY_YEAR = /\b([A-Za-z]+)\s+(?:(\d{1,2}),?\s+)?([1-9]\d{3})\b/g;

function isoDate(year, month, day) {
  const parts = [year, String(month).padStart(2, '0')];
  if (day) parts.push(String(day).padStart(2, '0'));
  return parts.join('-');
}

function datesWrittenIn(quote) {
  const dates = [];
  for (const [, year, month, day] of quote.matchAll(ISO_OR_SLASH_DATE))
    dates.push(isoDate(year, month, day));
  for (const [, year, month, day] of quote.matchAll(KOREAN_DATE))
    dates.push(isoDate(year, month, day));
  for (const [, day, monthName, year] of quote.matchAll(DAY_MONTH_YEAR)) {
    const month = MONTH_NUMBERS.get(monthName.toLowerCase());
    if (month) dates.push(isoDate(year, month, day));
  }
  for (const [, monthName, day, year] of quote.matchAll(MONTH_DAY_YEAR)) {
    const month = MONTH_NUMBERS.get(monthName.toLowerCase());
    if (month) dates.push(isoDate(year, month, day));
  }
  return dates;
}

// A year-only date needs the year as a whole word. A month or day needs a
// recognized written date at that precision or finer.
function quoteHasDate(quote, date) {
  const isYearOnly = date.length === 4;
  if (isYearOnly) return new RegExp(`\\b${date}\\b`).test(quote);
  return datesWrittenIn(quote).some(
    (written) => written === date || written.startsWith(date + '-'),
  );
}

// The first calendar day that a YYYY, YYYY-MM or YYYY-MM-DD date covers.
function calendarStart(date) {
  if (date.length === 4) return date + '-01-01';
  if (date.length === 7) return date + '-01';
  return date;
}

// Bibliographic dates have no timezone: the earliest possible civil midnight
// (UTC+14) is the latest instant at which the date can already have begun.
function earliestPossibleStart(date) {
  return Date.parse(calendarStart(date) + 'T00:00:00+14:00');
}

const CLOCK_TOLERANCE_MS = 60_000;

function verifyCompletionRecord(completion, evidence, candidateHash) {
  object(
    completion,
    ['candidate_sha256', 'evidence_sha256', 'checked_by', 'checked_at', 'scope'],
    'completion',
  );
  if (completion.candidate_sha256 !== candidateHash)
    fail('completion: candidate changed since source checking; recheck and bind the final input');
  if (completion.evidence_sha256 !== completionEvidenceHash(evidence))
    fail('completion: evidence changed since source checking; recheck the final archives');
  text(completion.checked_by, 'completion.checked_by');
  text(completion.scope, 'completion.scope');
  if (!isZonedTime(completion.checked_at)) fail('completion: observed zoned check time required');
  if (Date.parse(completion.checked_at) > Date.now() + CLOCK_TOLERANCE_MS)
    fail('completion: recorded source check cannot be in the future (one-minute clock tolerance)');
}

const claimSourceKey = (paperId, claimId, sourceId) => JSON.stringify([paperId, claimId, sourceId]);
const paperDateKey = (paperId, kind) => JSON.stringify([paperId, kind]);
const passageKey = (sourceId, quote) => JSON.stringify([sourceId, normalize(quote)]);

function bindClaimChecks(candidate, claimChecks, requireArchivedPassage) {
  const bound = new Set();
  for (const check of claimChecks) {
    object(check, ['paper_id', 'claim_id', 'source_id', 'quote'], 'claim_check');
    const paper = candidate.papers.find((entry) => entry.id === check.paper_id);
    const claim = paper?.claims.find((entry) => entry.id === check.claim_id);
    if (!claim?.evidence.includes(check.source_id))
      fail('claim_check: source must belong to the exact displayed paper/claim');
    requireArchivedPassage(check.source_id, check.quote);
    const key = claimSourceKey(check.paper_id, check.claim_id, check.source_id);
    if (bound.has(key)) fail('claim_check: duplicate claim/source binding');
    bound.add(key);
  }
  return bound;
}

// Strict comparison on purpose: a lookup table would coerce a non-string kind.
function publicationField(kind) {
  if (kind === 'first-publication') return 'date';
  if (kind === 'edition') return 'edition_date';
  return null;
}

function bindPublicationChecks(candidate, publicationChecks, requireArchivedPassage) {
  const bound = new Set();
  for (const check of publicationChecks) {
    object(check, ['paper_id', 'source_id', 'kind', 'date', 'quote'], 'publication_check');
    const paper = candidate.papers.find((entry) => entry.id === check.paper_id);
    const field = publicationField(check.kind);
    const matchesRegisteredMetadata =
      field &&
      paper?.publication &&
      check.source_id === paper.publication.source_id &&
      check.date === paper.publication[field];
    if (!matchesRegisteredMetadata)
      fail('publication_check: bind the exact paper, date kind and registered metadata source');
    requireArchivedPassage(check.source_id, check.quote);
    if (!quoteHasDate(normalize(check.quote), check.date))
      fail(`${paper.id}: publication date does not match its archived quote`);
    const key = paperDateKey(paper.id, check.kind);
    if (bound.has(key)) fail('publication_check: duplicate date binding');
    bound.add(key);
  }
  return bound;
}

function verifyPublicationDates(paper, boundDates, completion) {
  const dates = [
    ['first-publication', paper.publication.date],
    ['edition', paper.publication.edition_date],
  ];
  for (const [kind, date] of dates) {
    if (date === null) continue;
    if (!boundDates.has(paperDateKey(paper.id, kind)))
      fail(`${paper.id}: complete delivery requires publication date passage bindings`);
    if (earliestPossibleStart(date) > Date.parse(completion.checked_at))
      fail(`${paper.id}: publication date is after the recorded source check`);
  }
}

function verifyClaimCompletion(paper, claim, boundClaims, completion, requireCheckedOriginal) {
  const at = `${paper.id}/${claim.id}`;
  if (!claim.evidence.length) fail(`${at}: claim has no original evidence`);
  claim.evidence.forEach(requireCheckedOriginal);
  const hasEveryPassageBinding = claim.evidence.every((sourceId) =>
    boundClaims.has(claimSourceKey(paper.id, claim.id, sourceId)),
  );
  if (!hasEveryPassageBinding) fail(`${at}: complete delivery requires claim passage bindings`);

  const currentReviews = claim.reviews?.filter((review) => review.state === 'current') ?? [];
  const everyCurrentReviewSupports = currentReviews.every(
    (review) => review.verdict === 'supported' && isZonedTime(review.reviewed_at),
  );
  if (!currentReviews.length || !everyCurrentReviewSupports)
    fail(
      `${at}: complete delivery requires a current supported passage review ` +
        'without unresolved conflicting reviews',
    );
  const completedAt = Date.parse(completion.checked_at);
  if (currentReviews.some((review) => Date.parse(review.reviewed_at) > completedAt))
    fail(`${at}: passage review is after completion`);
}

function verifyPaperCompletion(paper, boundClaims, boundDates, completion, requireCheckedOriginal) {
  if (!paper.publication)
    fail(`${paper.id}: complete delivery requires source-linked publication metadata`);
  requireCheckedOriginal(paper.publication.source_id);
  verifyPublicationDates(paper, boundDates, completion);
  if (paper.review_status === 'needs-recheck')
    fail(`${paper.id}: resolve stale paper evidence before complete delivery`);
  if (!paper.claims.length)
    fail(`${paper.id}: complete delivery requires at least one source-backed claim`);
  for (const claim of paper.claims)
    verifyClaimCompletion(paper, claim, boundClaims, completion, requireCheckedOriginal);
}

function verifyRelationCompletion(relation, completion) {
  if (relation.needs_recheck)
    fail(`${relation.id}: resolve stale relation evidence before complete delivery`);
  if (relation.origin === 'source' && relation.status !== 'source-checked')
    fail(`${relation.id}: check the source relation before complete delivery`);
  const reviewedAfterCompletion =
    relation.origin === 'source' &&
    Date.parse(relation.review.checked_at) > Date.parse(completion.checked_at);
  if (reviewedAfterCompletion) fail(`${relation.id}: relation review is after completion`);
  if (relation.origin === 'ai' && !relation.evidence_refs.length)
    fail(`${relation.id}: complete AI proposals need checked supporting claims`);
}

function verifyBackgroundCompletion(background, requireCheckedOriginal) {
  for (const reading of background.readings) {
    if (!reading.evidence.length)
      fail(`${background.id}: complete background reading needs original evidence`);
    reading.evidence.forEach(requireCheckedOriginal);
  }
}

export function verifyCompletion(candidate, evidence, candidateHash) {
  const completion = evidence.completion;
  verifyCompletionRecord(completion, evidence, candidateHash);

  const sourceChecks = evidence.source_checks ?? [];
  const archivedSourceIds = new Set(sourceChecks.map((check) => check.source_id));
  const archivedPassages = new Set(
    sourceChecks.map((check) => passageKey(check.source_id, check.quote)),
  );
  const requireArchivedPassage = (sourceId, quote) => {
    text(quote, 'completion passage quote');
    if (!archivedPassages.has(passageKey(sourceId, quote)))
      fail(`${sourceId}: completion passage must match an archived source_check quote`);
  };
  const isAgentChecked = (sourceId) =>
    candidate.sources.find((entry) => entry.id === sourceId)?.verification === 'agent-checked';
  const requireCheckedOriginal = (sourceId) => {
    if (!archivedSourceIds.has(sourceId) || !isAgentChecked(sourceId))
      fail(`${sourceId}: complete delivery requires a directly checked archived original`);
  };

  list(evidence.claim_checks, 'claim_checks');
  list(evidence.publication_checks, 'publication_checks');
  const boundClaims = bindClaimChecks(candidate, evidence.claim_checks, requireArchivedPassage);
  const boundDates = bindPublicationChecks(
    candidate,
    evidence.publication_checks,
    requireArchivedPassage,
  );

  for (const paper of candidate.papers)
    verifyPaperCompletion(paper, boundClaims, boundDates, completion, requireCheckedOriginal);
  for (const relation of candidate.relations) verifyRelationCompletion(relation, completion);
  for (const background of candidate.backgrounds ?? [])
    verifyBackgroundCompletion(background, requireCheckedOriginal);
}

// ---------------------------------------------------------------------------
// Evidence gate
// ---------------------------------------------------------------------------

const OPTIONAL_EVIDENCE_FIELDS = [
  'source_checks',
  'claim_checks',
  'publication_checks',
  'completion',
];
const SOURCE_ID = /^[A-Za-z0-9._-]+$/;

function requireProposedAiRelations(candidate) {
  for (const relation of candidate.relations) {
    const isAi = relation.origin === 'ai';
    if (isAi && (relation.status !== 'proposed' || relation.review !== null))
      fail(`${relation.id}: AI relation must remain proposed with review:null`);
  }
}

function requireCanonicalOverview(candidate) {
  for (const [key, value] of Object.entries(overviewFor(candidate))) {
    if (candidate[key] !== value) fail(`${key}: regenerate the canonical overview with --overview`);
  }
}

function verifyEvidenceShape(evidence) {
  if (![1, 2].includes(evidence.version)) fail('Unsupported evidence version');
  const requiredFields =
    evidence.version === 2
      ? ['version', 'sources', 'counts', 'tables', 'performance']
      : ['version', 'sources', 'counts'];
  const presentOptionalFields = OPTIONAL_EVIDENCE_FIELDS.filter((key) =>
    Object.hasOwn(evidence, key),
  );
  object(evidence, [...requiredFields, ...presentOptionalFields], 'evidence');
  list(evidence.sources, 'sources');
  list(evidence.counts, 'counts');
}

function pageTexts(extraction) {
  const textByPage = new Map();
  for (const page of extraction.pages) {
    const isValidPage =
      Number.isSafeInteger(page.page) &&
      page.page >= 1 &&
      typeof page.text === 'string' &&
      !textByPage.has(page.page);
    if (!isValidPage) fail('Invalid or duplicate source page');
    textByPage.set(page.page, page.text);
  }
  return textByPage;
}

// Returns Map<source id, Map<page number, page text>> after checking each
// original PDF and its page-aligned text extraction against their hashes.
function loadSourcePages(sources, directory) {
  const pagesBySource = new Map();
  for (const source of sources) {
    object(
      source,
      ['id', 'document_path', 'document_sha256', 'text_path', 'text_sha256'],
      'source',
    );
    const isNewValidId =
      typeof source.id === 'string' && SOURCE_ID.test(source.id) && !pagesBySource.has(source.id);
    if (!isNewValidId) fail('Invalid or duplicate source id');
    const pdf = localFile(directory, source.document_path, source.document_sha256);
    if (!startsWithPdfMarker(pdf)) fail('Expected original PDF');
    const extraction = JSON.parse(
      localFile(directory, source.text_path, source.text_sha256)
        .toString('utf8')
        .replace(/^\uFEFF/, ''),
    );
    if (extraction.pdf_sha256 !== source.document_sha256 || !Array.isArray(extraction.pages))
      fail('Page text must identify the original PDF hash');
    pagesBySource.set(source.id, pageTexts(extraction));
  }
  return pagesBySource;
}

// These paths only defer the whole-field count format. verifyPerformance
// must validate the exact generated report and its source before any success.
function tableReportsByPath(evidence) {
  const entries = Array.isArray(evidence.performance) ? evidence.performance : [];
  return new Map(
    entries
      .filter((entry) => entry?.kind === 'table-comparison')
      .map((entry) => [entry.path, entry.comparison?.table_id]),
  );
}

function verifyCountItems(items) {
  list(items, 'items');
  if (!items.length) fail('Count items cannot be empty');
  for (const item of items) {
    object(item, ['unit', 'value'], 'count item');
    const isValidItem =
      Object.hasOwn(COUNT_UNIT_LABELS, item.unit) &&
      Number.isSafeInteger(item.value) &&
      item.value >= 0;
    if (!isValidItem) fail('Invalid count unit/value');
  }
}

// Returns the set of field paths whose counts are bound to a source quote.
function verifyCountBindings(candidate, evidence, countFields, pagesBySource, tableReports) {
  const { fields, performanceByPath } = countFields;
  const covered = new Set();
  for (const binding of evidence.counts) {
    object(binding, ['path', 'source_id', 'page', 'quote', 'items'], 'count binding');
    if (!fields.has(binding.path) || covered.has(binding.path))
      fail('Invalid or duplicate count field path');

    const linkedSourceIds = performanceByPath.get(binding.path)?.sourceIds ?? [];
    const isRegistered = candidate.sources.some((source) => source.id === binding.source_id);
    if (!isRegistered || !linkedSourceIds.includes(binding.source_id))
      fail(
        `${binding.path}: source must be linked to the displayed paper/claim or concept background`,
      );

    text(binding.quote, 'quote');
    verifyCountItems(binding.items);

    const pageText = pagesBySource.get(binding.source_id)?.get(binding.page);
    if (!pageText || !containsQuote(pageText, binding.quote))
      fail(`${binding.path}: quote missing from declared source page (complete tokens required)`);

    const quotedCounts = JSON.stringify(countMentions(binding.quote));
    const declaredCounts = JSON.stringify(
      binding.items.map(({ unit, value }) => ({ unit, value })),
    );
    if (quotedCounts !== declaredCounts)
      fail(`${binding.path}: count values/units differ from source quote`);

    const isTableReport = tableReports.has(binding.path);
    if (!isTableReport && fields.get(binding.path) !== countText(binding))
      fail(`${binding.path}: use the exact source-derived count text (no equality or paraphrase)`);
    covered.add(binding.path);
  }
  return covered;
}

// The regression concerns dataset record/pair totals. A retrieval setting
// such as top-5 documents is not necessarily expressed as a literal count
// in the source; do not silently reinterpret it as a dataset total.
function requireBindingsForCountStatements(fields, covered, tableReports) {
  for (const [pointer, value] of fields) {
    const statesRecordOrPairCount = countMentions(value).some(
      (mention) => mention.unit !== 'documents',
    );
    if (statesRecordOrPairCount && !covered.has(pointer) && !tableReports.has(pointer))
      fail(`${pointer}: record/pair count statement needs source-bound evidence`);
  }
}

// A table report may repeat counts from its table block (for example a
// footnote). Each one must appear in that block with the same unit and value.
function verifyTableReportCounts(evidence, fields, tableReports, covered) {
  for (const [pointer, tableId] of tableReports) {
    if (!fields.has(pointer)) continue;
    const reportedCounts = countMentions(fields.get(pointer));
    if (!reportedCounts.length) continue;
    const table = evidence.tables.find((entry) => entry.id === tableId);
    const sourceCounts = countMentions(table.quote);
    const isInSourceBlock = (reported) =>
      sourceCounts.some(
        (source) => source.unit === reported.unit && source.value === reported.value,
      );
    if (!reportedCounts.every(isInSourceBlock))
      fail(`${pointer}: table report count differs from its source block`);
    covered.add(pointer);
  }
}

export function verifyEvidence(candidate, evidence, directory) {
  if (candidate.version !== 2 || candidate.mode !== 'paper-relations')
    fail('Evidence gate requires version 2 paper-relations');
  requireProposedAiRelations(candidate);
  requireCanonicalOverview(candidate);
  verifyEvidenceShape(evidence);

  const pagesBySource = loadSourcePages(evidence.sources, directory);
  const countFields = visibleCountFields(candidate);
  const tableReports = tableReportsByPath(evidence);
  const covered = verifyCountBindings(
    candidate,
    evidence,
    countFields,
    pagesBySource,
    tableReports,
  );
  requireBindingsForCountStatements(countFields.fields, covered, tableReports);

  const performance = verifyPerformance(candidate, evidence, pagesBySource);
  verifyTableReportCounts(evidence, countFields.fields, tableReports, covered);
  const originalChecks = verifySourceChecks(candidate, evidence, directory, pagesBySource);

  return {
    checks: 'canonical-overview-source-counts-and-performance',
    count_fields: covered.size,
    source_files: pagesBySource.size,
    original_source_checks: originalChecks,
    ...performance,
    source_semantics: 'not-certified',
    visual_review: 'not-run',
  };
}
