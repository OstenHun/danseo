import { fail, hash, object, text, list, oneOf } from './view-core.mjs';

const norm = s => s.normalize('NFKC').replace(/\s+/g, ' ').trim();
const containsExcerpt = (page, quote) => {
  const escaped = norm(quote).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(norm(page));
};
// A migration tripwire, not a semantic classifier. V2 requires explicit coverage too.
const metricDirections = new Map([
  ...['accuracy', 'factscore', 'f1', 'em', 'exact match', 'bleu', 'rouge', 'rouge-1', 'rouge-2', 'rouge-l', 'precision', 'recall', 'auroc', 'auc'].map(m => [m, 'higher']),
  ...['loss', 'perplexity', 'latency', 'error rate', 'wer', 'cer'].map(m => [m, 'lower']),
]);
const metricSignal = new RegExp(`\\b(?:higher|lower)\\s+(?:than|score|performance|${[...metricDirections.keys()].map(m => m.replaceAll(' ', '\\s+')).join('|')})\\b`, 'iu');
export const performanceSignal = s => metricSignal.test(s) || /능가|우월|우수|필적|뛰어나|뛰어넘|앞선|앞서|더\s*(?:낫|나은|좋)|일관(?:된|되게).*?(?:성능|향상)|(?:성능|정확도|정밀도|효율|점수).*?(?:향상|개선|높|낮|끌어올|극대)|outperform|surpass|superior|state.of.the.art|\b(?:better|best|faster|slower|improv\w*)\b/iu.test(s);

export function performanceFields(candidate) {
  const fields = new Map();
  const add = (p, s, sourceIds) => fields.set(p, { value: s, sourceIds });
  add('/title', candidate.title, candidate.sources.map(s => s.id));
  candidate.papers.forEach((paper, p) => {
    const all = paper.claims.flatMap(c => c.evidence);
    if (paper.short_title) add(`/papers/${p}/short_title`, paper.short_title, all);
    if (paper.topic) add(`/papers/${p}/topic`, paper.topic, all);
    if (paper.reading_reason) add(`/papers/${p}/reading_reason`, paper.reading_reason, all);
    (paper.notes ?? []).forEach((s, n) => add(`/papers/${p}/notes/${n}`, s, all));
    paper.claims.forEach((claim, c) => {
      const base = `/papers/${p}/claims/${c}`;
      add(`${base}/statement`, claim.statement, claim.evidence);
      for (const key of ['conditions', 'limitations']) claim[key].forEach((s, i) => add(`${base}/${key}/${i}`, s, claim.evidence));
      (claim.reviews ?? []).filter(r => r.state !== 'stale').forEach(r => {
        const i = claim.reviews.indexOf(r);
        add(`${base}/reviews/${i}/reason`, r.reason, claim.evidence);
        add(`${base}/reviews/${i}/scope`, r.scope, claim.evidence);
      });
    });
  });
  candidate.relations.forEach((r, i) => {
    const ids = r.evidence_refs.flatMap(ref => candidate.papers.find(p => p.id === ref.paper_id)?.claims.find(c => c.id === ref.claim_id)?.evidence ?? []);
    add(`/relations/${i}/rationale`, r.rationale, ids);
  });
  candidate.sources.forEach((s, i) => add(`/sources/${i}/scope`, s.scope, [s.id]));
  (candidate.concepts ?? []).forEach((concept, i) => {
    const ids = (candidate.backgrounds ?? []).filter(b => b.concept_id === concept.id).flatMap(b => b.readings.flatMap(r => r.evidence));
    add(`/concepts/${i}/title`, concept.title, ids);
    add(`/concepts/${i}/summary`, concept.summary, ids);
  });
  (candidate.backgrounds ?? []).forEach((background, i) => {
    add(`/backgrounds/${i}/rationale`, background.rationale, background.readings.flatMap(r => r.evidence));
    background.readings.forEach((reading, j) => {
      add(`/backgrounds/${i}/readings/${j}/rationale`, reading.rationale, reading.evidence);
      const returnSources = candidate.papers.find(p => p.id === background.paper_id).claims.flatMap(c => c.evidence);
      add(`/backgrounds/${i}/readings/${j}/return_question`, reading.return_question, [...reading.evidence, ...returnSources]);
    });
  });
  return fields;
}

export function performancePlan(candidate) {
  return [...performanceFields(candidate)].map(([path, f]) => ({ path, text_sha256: hash(f.value), kind: 'unresolved', reason: '', comparison: null }));
}

// Supports rectangular numeric tables with section headers and a trailing caption.
// All row lines in the supplied contiguous block are parsed; cells cannot be hand-picked.
export function readTable(table, pages) {
  object(table, ['id', 'source_id', 'page', 'quote', 'header', 'footer', 'columns', 'conditions', 'review'], 'performance table');
  for (const k of ['id', 'source_id', 'quote', 'header', 'footer']) text(table[k], `table.${k}`);
  if (!Number.isSafeInteger(table.page) || table.page < 1) fail('Table needs a PDF page number');
  const page = pages.get(table.source_id)?.get(table.page);
  if (!page || !containsExcerpt(page, table.quote)) fail(`${table.id}: table block missing from source page`);
  object(table.review, ['checked_by', 'checked_at', 'scope'], 'table review');
  for (const k of ['checked_by', 'scope']) text(table.review[k], k);
  if (typeof table.review.checked_at !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(table.review.checked_at) || !Number.isFinite(Date.parse(table.review.checked_at))) fail('Table review needs a zoned timestamp');
  const lines = table.quote.split(/\r?\n/).map(norm).filter(Boolean);
  const header = table.header.split(/\r?\n/).map(norm).filter(Boolean);
  const footer = table.footer.split(/\r?\n/).map(norm).filter(Boolean);
  if (lines.slice(0, header.length).join('\n') !== header.join('\n') || lines.slice(-footer.length).join('\n') !== footer.join('\n')) fail(`${table.id}: preserve complete header and caption/footnotes at block boundaries`);
  list(table.columns, 'columns'); list(table.conditions, 'conditions');
  if (!table.columns.length || !table.conditions.length) fail('Table columns and conditions cannot be empty');
  const labels = new Set(), conditions = new Set();
  for (const col of table.columns) {
    object(col, Object.hasOwn(col, 'direction_quote') ? ['label', 'metric', 'direction', 'direction_quote'] : ['label', 'metric', 'direction'], 'column');
    text(col.label, 'label'); text(col.metric, 'metric'); oneOf(col.direction, ['higher', 'lower'], 'direction');
    if (labels.has(col.label) || !norm(table.header).includes(norm(col.label)) || !norm(table.header).includes(norm(col.metric))) fail('Duplicate or unanchored column/metric');
    labels.add(col.label);
    const metric = norm(col.metric).toLowerCase();
    const known = metricDirections.get(metric);
    if (known && col.direction !== known) fail(`${col.metric}: metric direction contradicts its definition`);
    if (!known) {
      const quote = typeof col.direction_quote === 'string' ? norm(col.direction_quote).toLowerCase() : '';
      const tails = col.direction === 'higher' ? ['higher is better', '높을수록 좋음'] : ['lower is better', '낮을수록 좋음'];
      const forms = tails.flatMap(tail => [`${metric} ${tail}`, `${metric}: ${tail}`]);
      if (!forms.includes(quote.replace(/[.]$/, '')) || !containsExcerpt(page, quote)) fail('Unknown metric needs an exact single-metric direction quote');
    }
  }
  // Two complete header rows bind each metric to its column, not just somewhere
  // in the header. Unsupported merged/interleaved headers must not be guessed.
  const headerCells = s => norm(s.replace(/^Method\s*/i, '').replace(/[()]/g, ' '));
  if (header.length !== 2 || headerCells(header[0]) !== table.columns.map(c => norm(c.label)).join(' ') || headerCells(header[1]) !== table.columns.map(c => norm(c.metric)).join(' ')) fail('Preserve every source header column and its metric in order (two header rows required)');
  for (const c of table.conditions) { text(c, 'condition'); if (conditions.has(norm(c))) fail('Duplicate condition'); conditions.add(norm(c)); }
  const rows = new Map(); let condition = null; const seen = new Set();
  for (const line of lines.slice(header.length, lines.length - footer.length)) {
    if (conditions.has(line)) { if (seen.has(line)) fail('Repeated table condition'); condition = line; seen.add(line); continue; }
    if (!condition) fail('Table row has no condition header');
    const tokens = line.split(' '), cells = tokens.slice(-table.columns.length), method = tokens.slice(0, -table.columns.length).join(' ');
    const number = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
    const lastMethodToken = method.split(' ').at(-1);
    if (!method || number.test(lastMethodToken) || ['-', '—'].includes(lastMethodToken) || cells.length !== table.columns.length || cells.some(s => !number.test(s) && !['-', '—'].includes(s))) fail(`${table.id}: unsupported or omitted table row/column: ${line}`);
    const key = JSON.stringify([condition, method]);
    if (rows.has(key)) fail('Duplicate method within condition');
    const values = cells.map(s => ['-', '—'].includes(s) ? null : Number(s));
    if (values.some((v, i) => v !== null && (!Number.isFinite(v) || (v !== 0 && Math.abs(v) < 2.2250738585072014e-308) || (v === 0 && /[1-9]/.test(cells[i])) || cells[i].replace(/[-.]/g, '').replace(/^0+/, '').length > 15))) fail('Table value exceeds supported numeric precision');
    rows.set(key, values);
  }
  if (seen.size !== conditions.size || [...conditions].some(c => ![...rows.keys()].some(k => JSON.parse(k)[0] === c))) fail('Every declared condition needs source rows');
  return { table, rows };
}

export function comparisonText(parsed, comparison) {
  object(comparison, ['table_id', 'pairs', 'assertion'], 'comparison');
  const {table, rows} = parsed;
  if (comparison.table_id !== table.id) fail('Comparison table mismatch');
  list(comparison.pairs, 'pairs');
  const pairs = new Map();
  for (const pair of comparison.pairs) {
    object(pair, ['condition', 'method', 'baseline'], 'comparison pair');
    for (const k of ['condition', 'method', 'baseline']) text(pair[k], k);
    if (!table.conditions.includes(pair.condition) || pairs.has(pair.condition) || pair.method === pair.baseline) fail('Invalid or duplicate comparison condition/method');
    pairs.set(pair.condition, pair);
  }
  if (!pairs.size) fail('Comparison needs an explicit condition scope');
  oneOf(comparison.assertion, ['report', 'all-better'], 'assertion');
  let wins = 0, ties = 0, losses = 0, missing = 0; const details = [];
  for (const condition of pairs.keys()) {
    const pair = pairs.get(condition);
    const a = rows.get(JSON.stringify([norm(condition), pair.method]));
    const b = rows.get(JSON.stringify([norm(condition), pair.baseline]));
    if (!a || !b) fail(`${table.id}: missing comparison method under ${condition}; preserve row labels including footnote marks`);
    table.columns.forEach((col, i) => {
      let result;
      if (a[i] === null || b[i] === null) { missing++; result = 'Not reported'; }
      else if (a[i] === b[i]) { ties++; result = 'Tie'; }
      else if ((a[i] > b[i]) === (col.direction === 'higher')) { wins++; result = 'Ahead'; }
      else { losses++; result = 'Behind'; }
      details.push(`${condition} / ${col.label} (${col.metric}, ${col.direction === 'higher' ? 'higher is' : 'lower is'} better): ${pair.method} ${a[i] ?? 'Not reported'} vs ${pair.baseline} ${b[i] ?? 'Not reported'} — ${result}`);
    });
  }
  if (comparison.assertion === 'all-better' && (losses || ties || missing)) fail(`${table.id}: all-better contradicted: ${losses} losses, ${ties} ties, ${missing} missing; ${details.filter(s => !s.endsWith('— Ahead')).join('; ')}`);
  return `Table comparison (${table.source_id}, p. ${table.page}, ${table.id}): reviewed scope ${pairs.size} conditions × ${table.columns.length} metrics: ahead ${wins}, tied ${ties}, behind ${losses}, not reported ${missing}. ${details.join('; ')}. Table conditions and footnotes: ${norm(table.footer)}. These numbers compare only the stated table scope; they do not establish statistical significance or superiority under other conditions.`;
}

export function verifyPerformance(candidate, evidence, pages) {
  const fields = performanceFields(candidate);
  if (evidence.version === 1) {
    const flagged = [...fields].filter(([, f]) => performanceSignal(f.value));
    fail(`Performance claim screening requires evidence v2 (use --performance-plan): ${flagged.map(([p]) => p).join(', ') || 'all displayed fields require review'}`);
  }
  list(evidence.tables, 'tables'); list(evidence.performance, 'performance');
  const tables = new Map();
  for (const table of evidence.tables) { if (tables.has(table.id)) fail('Duplicate performance table'); tables.set(table.id, readTable(table, pages)); }
  const covered = new Set(); let count = 0;
  for (const entry of evidence.performance) {
    object(entry, ['path', 'text_sha256', 'kind', 'reason', 'comparison'], 'performance review');
    const field = fields.get(entry.path);
    if (!field || covered.has(entry.path)) fail('Unknown or duplicate performance review path');
    if (hash(field.value) !== entry.text_sha256) fail(`${entry.path}: stale performance review`);
    text(entry.reason, 'performance review reason');
    oneOf(entry.kind, ['non-performance', 'table-comparison'], 'performance review kind');
    if (entry.kind === 'non-performance') {
      if (entry.comparison !== null || performanceSignal(field.value)) fail(`${entry.path}: comparative performance wording cannot be exempted as non-performance`);
    } else {
      const parsed = tables.get(entry.comparison?.table_id);
      if (!parsed || !field.sourceIds.includes(parsed.table.source_id)) fail(`${entry.path}: table must be linked to this claim/relation source`);
      const expected = comparisonText(parsed, entry.comparison);
      if (field.value !== expected) fail(`${entry.path}: use exact source-derived performance text; separate method explanation and do not append a broader claim`);
      count++;
    }
    covered.add(entry.path);
  }
  for (const p of fields.keys()) if (!covered.has(p)) fail(`${p}: missing performance screening (use --performance-plan)`);
  return { performance_fields: count, performance_screening: 'all-listed-fields', performance_tables: tables.size };
}
