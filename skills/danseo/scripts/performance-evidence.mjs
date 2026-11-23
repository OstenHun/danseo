import { fail, hash, object, text, list, oneOf } from './view-core.mjs';

// ---------------------------------------------------------------------------
// Text matching
// ---------------------------------------------------------------------------

const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

const normalize = (value) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();

// True when the page holds the quote as whole words. Case and spacing are ignored.
function containsExcerpt(page, quote) {
  const escapedQuote = normalize(quote).replace(REGEX_SPECIAL_CHARACTERS, '\\$&');
  const wholeQuote = new RegExp(`(?<![\\p{L}\\p{N}_])${escapedQuote}(?![\\p{L}\\p{N}_])`, 'iu');
  return wholeQuote.test(normalize(page));
}

// ---------------------------------------------------------------------------
// Known metrics and comparison wording
// ---------------------------------------------------------------------------

const HIGHER_IS_BETTER = [
  'accuracy',
  'factscore',
  'f1',
  'em',
  'exact match',
  'bleu',
  'rouge',
  'rouge-1',
  'rouge-2',
  'rouge-l',
  'precision',
  'recall',
  'auroc',
  'auc',
];
const LOWER_IS_BETTER = ['loss', 'perplexity', 'latency', 'error rate', 'wer', 'cer'];
const metricDirections = new Map([
  ...HIGHER_IS_BETTER.map((metric) => [metric, 'higher']),
  ...LOWER_IS_BETTER.map((metric) => [metric, 'lower']),
]);

// A two-word metric such as "exact match" may be split by any whitespace.
const METRIC_NAMES = [...metricDirections.keys()]
  .map((metric) => metric.replaceAll(' ', '\\s+'))
  .join('|');

// "higher accuracy", "lower than": a direction word next to a measure. A method
// description such as "higher-order" or "lower bound" has no measure after it.
const DIRECTION_OF_MEASURE = new RegExp(
  `\\b(?:higher|lower)\\s+(?:than|score|performance|${METRIC_NAMES})\\b`,
  'iu',
);

// Korean words for surpass, superior, excellent, rival, outstanding, exceed,
// ahead (앞선, 앞서) and better.
const KOREAN_SUPERIORITY = /능가|우월|우수|필적|뛰어나|뛰어넘|앞선|앞서|더\s*(?:낫|나은|좋)/;
// Korean "consistent" followed by performance or improvement.
const KOREAN_CONSISTENT_GAIN = /일관(?:된|되게).*?(?:성능|향상)/;
// A Korean measure (performance, accuracy, precision, efficiency, score) followed
// by a change (improve, raise, lower, pull up, maximize).
const KOREAN_MEASURE_CHANGE = /(?:성능|정확도|정밀도|효율|점수).*?(?:향상|개선|높|낮|끌어올|극대)/;
const ENGLISH_SUPERIORITY =
  /outperform|surpass|superior|state.of.the.art|\b(?:better|best|faster|slower|improv\w*)\b/;

const COMPARATIVE_WORDING = new RegExp(
  [KOREAN_SUPERIORITY, KOREAN_CONSISTENT_GAIN, KOREAN_MEASURE_CHANGE, ENGLISH_SUPERIORITY]
    .map((pattern) => pattern.source)
    .join('|'),
  'iu',
);

// A migration tripwire, not a semantic classifier. It reads words rather than
// meaning, which is why evidence v2 also requires a review of every displayed field.
export const performanceSignal = (sentence) =>
  DIRECTION_OF_MEASURE.test(sentence) || COMPARATIVE_WORDING.test(sentence);

// ---------------------------------------------------------------------------
// Displayed fields that need a performance review
// ---------------------------------------------------------------------------

function addClaimFields(add, claim, base) {
  add(`${base}/statement`, claim.statement, claim.evidence);
  for (const key of ['conditions', 'limitations'])
    claim[key].forEach((sentence, index) =>
      add(`${base}/${key}/${index}`, sentence, claim.evidence),
    );
  // A stale review stays in the record but is no longer displayed. The path keeps
  // each review's position in the full list.
  const displayedReviews = (claim.reviews ?? []).filter((review) => review.state !== 'stale');
  for (const review of displayedReviews) {
    const position = claim.reviews.indexOf(review);
    add(`${base}/reviews/${position}/reason`, review.reason, claim.evidence);
    add(`${base}/reviews/${position}/scope`, review.scope, claim.evidence);
  }
}

function addPaperFields(add, paper, base) {
  const paperSourceIds = paper.claims.flatMap((claim) => claim.evidence);
  if (paper.short_title) add(`${base}/short_title`, paper.short_title, paperSourceIds);
  if (paper.topic) add(`${base}/topic`, paper.topic, paperSourceIds);
  if (paper.reading_reason) add(`${base}/reading_reason`, paper.reading_reason, paperSourceIds);
  (paper.notes ?? []).forEach((note, index) => add(`${base}/notes/${index}`, note, paperSourceIds));
  paper.claims.forEach((claim, index) => addClaimFields(add, claim, `${base}/claims/${index}`));
}

// Sources of the claims a relation cites. An unknown paper or claim adds none.
function relationSourceIds(candidate, relation) {
  return relation.evidence_refs.flatMap((ref) => {
    const paper = candidate.papers.find((entry) => entry.id === ref.paper_id);
    const claim = paper?.claims.find((entry) => entry.id === ref.claim_id);
    return claim?.evidence ?? [];
  });
}

function addConceptFields(add, candidate, concept, base) {
  const readingSourceIds = (candidate.backgrounds ?? [])
    .filter((background) => background.concept_id === concept.id)
    .flatMap((background) => background.readings.flatMap((reading) => reading.evidence));
  add(`${base}/title`, concept.title, readingSourceIds);
  add(`${base}/summary`, concept.summary, readingSourceIds);
}

function addBackgroundFields(add, candidate, background, base) {
  add(
    `${base}/rationale`,
    background.rationale,
    background.readings.flatMap((reading) => reading.evidence),
  );
  background.readings.forEach((reading, index) => {
    const readingBase = `${base}/readings/${index}`;
    add(`${readingBase}/rationale`, reading.rationale, reading.evidence);
    // The return question leads back to the paper, so the paper's sources count too.
    const paperSourceIds = candidate.papers
      .find((paper) => paper.id === background.paper_id)
      .claims.flatMap((claim) => claim.evidence);
    add(`${readingBase}/return_question`, reading.return_question, [
      ...reading.evidence,
      ...paperSourceIds,
    ]);
  });
}

// Maps the JSON pointer of every displayed sentence to its text and to the
// sources a table comparison written there may use.
export function performanceFields(candidate) {
  const fields = new Map();
  const add = (path, value, sourceIds) => fields.set(path, { value, sourceIds });
  add(
    '/title',
    candidate.title,
    candidate.sources.map((source) => source.id),
  );
  candidate.papers.forEach((paper, index) => addPaperFields(add, paper, `/papers/${index}`));
  candidate.relations.forEach((relation, index) => {
    const sourceIds = relationSourceIds(candidate, relation);
    add(`/relations/${index}/rationale`, relation.rationale, sourceIds);
  });
  candidate.sources.forEach((source, index) =>
    add(`/sources/${index}/scope`, source.scope, [source.id]),
  );
  (candidate.concepts ?? []).forEach((concept, index) =>
    addConceptFields(add, candidate, concept, `/concepts/${index}`),
  );
  (candidate.backgrounds ?? []).forEach((background, index) =>
    addBackgroundFields(add, candidate, background, `/backgrounds/${index}`),
  );
  return fields;
}

export function performancePlan(candidate) {
  return [...performanceFields(candidate)].map(([path, field]) => ({
    path,
    text_sha256: hash(field.value),
    kind: 'unresolved',
    reason: '',
    comparison: null,
  }));
}

// ---------------------------------------------------------------------------
// Reading a source table
// ---------------------------------------------------------------------------

const TABLE_FIELDS = [
  'id',
  'source_id',
  'page',
  'quote',
  'header',
  'footer',
  'columns',
  'conditions',
  'review',
];
const ZONED_TIMESTAMP = /T.*(?:Z|[+-]\d\d:\d\d)$/;
const DECIMAL_NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const MISSING_CELL_MARKS = ['-', '—'];
// The smallest normal double. A nonzero value below it has already lost digits.
const SMALLEST_NORMAL_DOUBLE = 2.2250738585072014e-308;
// A double keeps every decimal of up to 15 significant digits.
const MAX_SIGNIFICANT_DIGITS = 15;
// The source's own words for the direction of a metric, in English and Korean.
const DIRECTION_PHRASES = {
  higher: ['higher is better', '높을수록 좋음'],
  lower: ['lower is better', '낮을수록 좋음'],
};

const nonEmptyLines = (block) => block.split(/\r?\n/).map(normalize).filter(Boolean);
const rowKey = (condition, method) => JSON.stringify([condition, method]);

function verifyTableReview(review) {
  object(review, ['checked_by', 'checked_at', 'scope'], 'table review');
  for (const key of ['checked_by', 'scope']) text(review[key], key);
  const isZonedTimestamp =
    typeof review.checked_at === 'string' &&
    ZONED_TIMESTAMP.test(review.checked_at) &&
    Number.isFinite(Date.parse(review.checked_at));
  if (!isZonedTimestamp) fail('Table review needs a zoned timestamp');
}

// A metric outside the built-in list needs the source's own sentence naming that
// one metric and its direction, so a direction cannot be borrowed from another metric.
function sourceStatesDirection(column, metric, page) {
  const quote =
    typeof column.direction_quote === 'string'
      ? normalize(column.direction_quote).toLowerCase()
      : '';
  const acceptedForms = DIRECTION_PHRASES[column.direction].flatMap((phrase) => [
    `${metric} ${phrase}`,
    `${metric}: ${phrase}`,
  ]);
  const quoteWithoutFinalPeriod = quote.replace(/[.]$/, '');
  return acceptedForms.includes(quoteWithoutFinalPeriod) && containsExcerpt(page, quote);
}

function verifyColumn(column, table, page, seenLabels) {
  const columnFields = Object.hasOwn(column, 'direction_quote')
    ? ['label', 'metric', 'direction', 'direction_quote']
    : ['label', 'metric', 'direction'];
  object(column, columnFields, 'column');
  text(column.label, 'label');
  text(column.metric, 'metric');
  oneOf(column.direction, ['higher', 'lower'], 'direction');
  const header = normalize(table.header);
  const isInHeader =
    header.includes(normalize(column.label)) && header.includes(normalize(column.metric));
  if (seenLabels.has(column.label) || !isInHeader) fail('Duplicate or unanchored column/metric');
  seenLabels.add(column.label);
  const metric = normalize(column.metric).toLowerCase();
  const knownDirection = metricDirections.get(metric);
  if (knownDirection && column.direction !== knownDirection)
    fail(`${column.metric}: metric direction contradicts its definition`);
  if (!knownDirection && !sourceStatesDirection(column, metric, page))
    fail('Unknown metric needs an exact single-metric direction quote');
}

// Two complete header rows bind each metric to its column, not just somewhere
// in the header. Unsupported merged/interleaved headers must not be guessed.
function verifyHeaderRows(headerLines, columns) {
  const cellsOf = (line) => normalize(line.replace(/^Method\s*/i, '').replace(/[()]/g, ' '));
  const labels = columns.map((column) => normalize(column.label)).join(' ');
  const metrics = columns.map((column) => normalize(column.metric)).join(' ');
  if (
    headerLines.length !== 2 ||
    cellsOf(headerLines[0]) !== labels ||
    cellsOf(headerLines[1]) !== metrics
  )
    fail('Preserve every source header column and its metric in order (two header rows required)');
}

function declaredConditions(table) {
  const conditions = new Set();
  for (const condition of table.conditions) {
    text(condition, 'condition');
    if (conditions.has(normalize(condition))) fail('Duplicate condition');
    conditions.add(normalize(condition));
  }
  return conditions;
}

// Splits "method value value ..." by the declared column count, so a method name
// may contain spaces.
function splitRow(table, line) {
  const tokens = line.split(' ');
  const cells = tokens.slice(-table.columns.length);
  const method = tokens.slice(0, -table.columns.length).join(' ');
  const isCell = (token) => DECIMAL_NUMBER.test(token) || MISSING_CELL_MARKS.includes(token);
  // A method name ending in a number or a dash cannot be told apart from a cell,
  // which would hide a missing value.
  const methodEndsLikeCell = isCell(method.split(' ').at(-1));
  if (
    !method ||
    methodEndsLikeCell ||
    cells.length !== table.columns.length ||
    cells.some((cell) => !isCell(cell))
  )
    fail(`${table.id}: unsupported or omitted table row/column: ${line}`);
  return { method, cells };
}

// True when Number() cannot hold the decimal as written: it overflows, falls
// below the normal range, rounds a nonzero value to zero, or has too many digits.
function exceedsNumericPrecision(cell, value) {
  if (!Number.isFinite(value)) return true;
  if (value !== 0 && Math.abs(value) < SMALLEST_NORMAL_DOUBLE) return true;
  if (value === 0 && /[1-9]/.test(cell)) return true;
  const significantDigits = cell.replace(/[-.]/g, '').replace(/^0+/, '');
  return significantDigits.length > MAX_SIGNIFICANT_DIGITS;
}

// Reads every row between the header and the footer. Each row belongs to the
// condition heading above it.
function readRows(table, bodyLines, conditions) {
  const rows = new Map();
  const conditionsInSource = new Set();
  const conditionsWithRows = new Set();
  let condition = null;
  for (const line of bodyLines) {
    if (conditions.has(line)) {
      if (conditionsInSource.has(line)) fail('Repeated table condition');
      condition = line;
      conditionsInSource.add(line);
      continue;
    }
    if (!condition) fail('Table row has no condition header');
    const { method, cells } = splitRow(table, line);
    const key = rowKey(condition, method);
    if (rows.has(key)) fail('Duplicate method within condition');
    const values = cells.map((cell) => (MISSING_CELL_MARKS.includes(cell) ? null : Number(cell)));
    const hasImpreciseValue = values.some(
      (value, index) => value !== null && exceedsNumericPrecision(cells[index], value),
    );
    if (hasImpreciseValue) fail('Table value exceeds supported numeric precision');
    rows.set(key, values);
    conditionsWithRows.add(condition);
  }
  const everyConditionHasRows = [...conditions].every((declared) =>
    conditionsWithRows.has(declared),
  );
  if (conditionsInSource.size !== conditions.size || !everyConditionHasRows)
    fail('Every declared condition needs source rows');
  return rows;
}

// Supports rectangular numeric tables with section headers and a trailing caption.
// All row lines in the supplied contiguous block are parsed; cells cannot be hand-picked.
export function readTable(table, pages) {
  object(table, TABLE_FIELDS, 'performance table');
  for (const key of ['id', 'source_id', 'quote', 'header', 'footer'])
    text(table[key], `table.${key}`);
  if (!Number.isSafeInteger(table.page) || table.page < 1) fail('Table needs a PDF page number');
  const page = pages.get(table.source_id)?.get(table.page);
  if (!page || !containsExcerpt(page, table.quote))
    fail(`${table.id}: table block missing from source page`);
  verifyTableReview(table.review);

  const lines = nonEmptyLines(table.quote);
  const headerLines = nonEmptyLines(table.header);
  const footerLines = nonEmptyLines(table.footer);
  const startsWithHeader = lines.slice(0, headerLines.length).join('\n') === headerLines.join('\n');
  const endsWithFooter = lines.slice(-footerLines.length).join('\n') === footerLines.join('\n');
  if (!startsWithHeader || !endsWithFooter)
    fail(`${table.id}: preserve complete header and caption/footnotes at block boundaries`);

  list(table.columns, 'columns');
  list(table.conditions, 'conditions');
  if (!table.columns.length || !table.conditions.length)
    fail('Table columns and conditions cannot be empty');
  const seenLabels = new Set();
  for (const column of table.columns) verifyColumn(column, table, page, seenLabels);
  verifyHeaderRows(headerLines, table.columns);
  const conditions = declaredConditions(table);

  const bodyLines = lines.slice(headerLines.length, lines.length - footerLines.length);
  return { table, rows: readRows(table, bodyLines, conditions) };
}

// ---------------------------------------------------------------------------
// Reporting a comparison
// ---------------------------------------------------------------------------

const AHEAD = 'Ahead';
const TIE = 'Tie';
const BEHIND = 'Behind';
const NOT_REPORTED = 'Not reported';
const SCOPE_CAVEAT =
  'These numbers compare only the stated table scope; ' +
  'they do not establish statistical significance or superiority under other conditions.';

// One method and baseline per condition. A condition is compared only once.
function comparisonPairs(table, comparison) {
  list(comparison.pairs, 'pairs');
  const pairs = new Map();
  for (const pair of comparison.pairs) {
    object(pair, ['condition', 'method', 'baseline'], 'comparison pair');
    for (const key of ['condition', 'method', 'baseline']) text(pair[key], key);
    if (
      !table.conditions.includes(pair.condition) ||
      pairs.has(pair.condition) ||
      pair.method === pair.baseline
    )
      fail('Invalid or duplicate comparison condition/method');
    pairs.set(pair.condition, pair);
  }
  if (!pairs.size) fail('Comparison needs an explicit condition scope');
  return pairs;
}

function cellOutcome(methodValue, baselineValue, direction) {
  if (methodValue === null || baselineValue === null) return NOT_REPORTED;
  if (methodValue === baselineValue) return TIE;
  const methodIsHigher = methodValue > baselineValue;
  return methodIsHigher === (direction === 'higher') ? AHEAD : BEHIND;
}

// Writes the display text for a comparison. The text states every compared cell,
// so a loss or a missing value cannot be left out of the sentence.
export function comparisonText(parsed, comparison) {
  object(comparison, ['table_id', 'pairs', 'assertion'], 'comparison');
  const { table, rows } = parsed;
  if (comparison.table_id !== table.id) fail('Comparison table mismatch');
  const pairs = comparisonPairs(table, comparison);
  oneOf(comparison.assertion, ['report', 'all-better'], 'assertion');

  const outcomes = [];
  const details = [];
  for (const [condition, pair] of pairs) {
    const methodValues = rows.get(rowKey(normalize(condition), pair.method));
    const baselineValues = rows.get(rowKey(normalize(condition), pair.baseline));
    if (!methodValues || !baselineValues) {
      const missingRow = `${table.id}: missing comparison method under ${condition}`;
      fail(`${missingRow}; preserve row labels including footnote marks`);
    }
    table.columns.forEach((column, index) => {
      const outcome = cellOutcome(methodValues[index], baselineValues[index], column.direction);
      outcomes.push(outcome);
      const betterWhen = column.direction === 'higher' ? 'higher is' : 'lower is';
      const measure = `${condition} / ${column.label} (${column.metric}, ${betterWhen} better)`;
      const methodCell = `${pair.method} ${methodValues[index] ?? NOT_REPORTED}`;
      const baselineCell = `${pair.baseline} ${baselineValues[index] ?? NOT_REPORTED}`;
      details.push(`${measure}: ${methodCell} vs ${baselineCell} — ${outcome}`);
    });
  }

  const count = (wanted) => outcomes.filter((outcome) => outcome === wanted).length;
  const wins = count(AHEAD);
  const ties = count(TIE);
  const losses = count(BEHIND);
  const missing = count(NOT_REPORTED);
  if (comparison.assertion === 'all-better' && (losses || ties || missing)) {
    const exceptions = details.filter((detail) => !detail.endsWith(`— ${AHEAD}`)).join('; ');
    const shortfall = `${losses} losses, ${ties} ties, ${missing} missing`;
    fail(`${table.id}: all-better contradicted: ${shortfall}; ${exceptions}`);
  }

  const location = `${table.source_id}, p. ${table.page}, ${table.id}`;
  const scope = `${pairs.size} conditions × ${table.columns.length} metrics`;
  const totals = `ahead ${wins}, tied ${ties}, behind ${losses}, not reported ${missing}`;
  return [
    `Table comparison (${location}): reviewed scope ${scope}: ${totals}.`,
    `${details.join('; ')}.`,
    `Table conditions and footnotes: ${normalize(table.footer)}.`,
    SCOPE_CAVEAT,
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Evidence gate for performance
// ---------------------------------------------------------------------------

// Evidence v1 has no per-field reviews, so it cannot pass. The message lists the
// fields the tripwire caught to show where the review should start.
function rejectVersion1Evidence(fields) {
  const flaggedPaths = [...fields]
    .filter(([, field]) => performanceSignal(field.value))
    .map(([path]) => path);
  const reviewScope = flaggedPaths.join(', ') || 'all displayed fields require review';
  fail(`Performance claim screening requires evidence v2 (use --performance-plan): ${reviewScope}`);
}

function verifyTableComparison(entry, field, tables) {
  const parsed = tables.get(entry.comparison?.table_id);
  if (!parsed || !field.sourceIds.includes(parsed.table.source_id))
    fail(`${entry.path}: table must be linked to this claim/relation source`);
  if (field.value !== comparisonText(parsed, entry.comparison)) {
    const remedy = 'separate method explanation and do not append a broader claim';
    fail(`${entry.path}: use exact source-derived performance text; ${remedy}`);
  }
}

function verifyPerformanceReview(entry, fields, covered, tables) {
  object(entry, ['path', 'text_sha256', 'kind', 'reason', 'comparison'], 'performance review');
  const field = fields.get(entry.path);
  if (!field || covered.has(entry.path)) fail('Unknown or duplicate performance review path');
  if (hash(field.value) !== entry.text_sha256) fail(`${entry.path}: stale performance review`);
  text(entry.reason, 'performance review reason');
  oneOf(entry.kind, ['non-performance', 'table-comparison'], 'performance review kind');
  if (entry.kind === 'table-comparison') verifyTableComparison(entry, field, tables);
  else if (entry.comparison !== null || performanceSignal(field.value))
    fail(`${entry.path}: comparative performance wording cannot be exempted as non-performance`);
  covered.add(entry.path);
}

export function verifyPerformance(candidate, evidence, pages) {
  const fields = performanceFields(candidate);
  if (evidence.version === 1) rejectVersion1Evidence(fields);
  list(evidence.tables, 'tables');
  list(evidence.performance, 'performance');
  const tables = new Map();
  for (const table of evidence.tables) {
    if (tables.has(table.id)) fail('Duplicate performance table');
    tables.set(table.id, readTable(table, pages));
  }
  const covered = new Set();
  let tableComparisons = 0;
  for (const entry of evidence.performance) {
    verifyPerformanceReview(entry, fields, covered, tables);
    if (entry.kind === 'table-comparison') tableComparisons++;
  }
  for (const path of fields.keys())
    if (!covered.has(path)) fail(`${path}: missing performance screening (use --performance-plan)`);
  return {
    performance_fields: tableComparisons,
    performance_screening: 'all-listed-fields',
    performance_tables: tables.size,
  };
}
