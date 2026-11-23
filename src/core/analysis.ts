import { randomUUID } from 'node:crypto';
import { readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Ajv } from 'ajv';
import { parseDocument } from 'yaml';
import { DanseoError, getCard, loadWorkspace, type Card } from './index.js';
import { sourceCollection } from './collection.js';
import { selectedTopic, type SelectedPaper } from './topic.js';
import { exists, workspaceLock, writableFile } from './storage.js';
import { sha256 } from './source-pdf.js';
import { canonical } from './claim-state.js';
import { loadClaimReviews, type ClaimReview } from './reviews.js';

type Source = Awaited<ReturnType<typeof sourceCollection>>['ready'][number];
type Revision = {
  round: number;
  edition: string;
  pdf_sha256: string;
  workspace: string;
  paper_id: string;
  answered: boolean;
  comparison_claims: string[];
};
type Session = { version: 1; key: string; revisions: Revision[] };
type Document = { raw: string; body: string; state: Session; sha256: string };
const text = { type: 'string', pattern: '\\S', maxLength: 65536 };
const ids = {
  type: 'array',
  uniqueItems: true,
  maxItems: 1000,
  items: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$' },
};
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const validateSession = new Ajv().compile<Session>(
  object({
    version: { const: 1 },
    key: text,
    revisions: {
      type: 'array',
      minItems: 1,
      maxItems: 1000,
      items: object({
        round: { type: 'integer', minimum: 1 },
        edition: text,
        pdf_sha256: digest,
        workspace: text,
        paper_id: ids.items,
        answered: { type: 'boolean' },
        comparison_claims: ids,
      }),
    },
  }),
);
type Answer = {
  overview?: string;
  question: string;
  answer: string;
  interpretation: string;
  remaining_questions: string;
  resume: string;
  claim_ids: string[];
  comparison_claims: string[];
};
const validateAnswer = new Ajv().compile<Answer>(
  object(
    {
      overview: { ...text, maxLength: 2000 },
      question: text,
      answer: text,
      interpretation: text,
      remaining_questions: text,
      resume: text,
      claim_ids: ids,
      comparison_claims: ids,
    },
    [
      'question',
      'answer',
      'interpretation',
      'remaining_questions',
      'resume',
      'claim_ids',
      'comparison_claims',
    ],
  ),
);
const help = `danseo topic <action> --dir <topic-folder>
  analysis-open --id N [--workspace <cards-folder> --paper <Paper ID>]
  analysis-save --id N --sha <document SHA-256> --input <answer JSON>
  analysis-list
  comparison-input
First open needs a registered native Paper with source.version and source.path matching ready.
The agent reads the actual PDF and writes the card; these commands do not summarize it.
Each paper has one Markdown document per topic; replies append and preserve notes.
comparison-input includes only current supported claim reviews, never whole-card status alone.`;
function invalid(message: string): never {
  throw new DanseoError('ANALYSIS', message);
}
const nameFor = (key: string) => `analysis-${sha256(Buffer.from(key))}.md`;

async function readDocument(root: string, key: string): Promise<Document | undefined> {
  const path = join(root, nameFor(key));
  if (!(await exists(path))) return;
  const bytes = await readFile(await writableFile(root, path));
  if (bytes.length > 2 * 1024 * 1024)
    invalid('The analysis document exceeds 2 MiB. Preserve it and check its scope.');
  const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!match)
    invalid(
      'The analysis document has no connection metadata. Preserve the original and check it.',
    );
  const doc = parseDocument(match[1]!, { uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length)
    invalid('The analysis document connection metadata is damaged.');
  const state: unknown = doc.toJS({ maxAliasCount: 0 });
  if (!validateSession(state) || state.key !== key)
    invalid('The paper and analysis document connection metadata do not match.');
  return { raw, body: raw.slice(match[0].length), state, sha256: sha256(bytes) };
}

async function saveDocument(
  root: string,
  key: string,
  state: Session,
  body: string,
  before?: Document,
) {
  if (!validateSession(state))
    invalid(
      'Check the new analysis metadata format and revision-history limit. The existing document was preserved.',
    );
  const path = join(root, nameFor(key));
  const bytes = `---\n${JSON.stringify(state, null, 2)}\n---\n${body}`;
  if (Buffer.byteLength(bytes) > 2 * 1024 * 1024)
    invalid('The analysis document exceeds 2 MiB. Preserve the existing document.');
  async function checkCurrent() {
    const current = await readDocument(root, key);
    if (current?.sha256 !== before?.sha256)
      invalid('The analysis document changed. Reopen it to check the notes and answers.');
  }
  await checkCurrent();
  if (before) {
    const backup = join(root, `${nameFor(key)}.${before.sha256}.bak`);
    if (await exists(backup)) {
      if (sha256(await readFile(await writableFile(root, backup))) !== before.sha256)
        invalid('The existing analysis backup differs. Compare it with the original.');
    } else await writeFile(backup, before.raw, { flag: 'wx', mode: 0o600 });
  }
  const temp = join(root, `.analysis-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
    await checkCurrent();
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
  return (await readDocument(root, key))!;
}

function currentRevision(doc: Document) {
  return doc.state.revisions.at(-1)!;
}
function sameSource(revision: Revision, source: Source) {
  return (
    revision.round === source.paper.round &&
    revision.edition === source.file.edition &&
    revision.pdf_sha256 === source.file.sha256
  );
}
async function boundPaper(revision: Revision, source: Source) {
  const workspace = await loadWorkspace(revision.workspace);
  const card = getCard(workspace, revision.paper_id, 'paper');
  if (card.data.type !== 'paper') invalid('A Paper card is required.');
  const src = card.data.source;
  if (
    src.version !== source.file.edition ||
    !src.path ||
    sha256(await readFile(resolve(dirname(card.path), src.path))) !== source.file.sha256
  )
    invalid(
      'The Paper edition or original PDF differs from the available source. Check the paper source again.',
    );
  return { workspace, card };
}
async function readySource(root: string, number: number) {
  // analysis-open/save already hold the topic lock until their document save finishes.
  const collection = await sourceCollection(root, true);
  const source = collection.ready.find((candidate) => candidate.paper.number === number);
  if (!source)
    invalid(
      'No source is ready for analysis. Check the PDF, edition and draft consent with topic sources.',
    );
  return { source, question: collection.question };
}
function context(root: string, source: Source, question: string, document: Document) {
  return {
    question,
    paper: source.paper,
    file: source.file,
    document: join(root, nameFor(source.paper.key)),
    document_sha256: document.sha256,
    markdown: document.raw,
    binding: currentRevision(document),
    scope: 'agent-reading-required',
  };
}

/** Topic navigation only; opening the document still rechecks the collected PDF. */
export async function listAnalysisDocuments(root: string, papers: SelectedPaper[]) {
  const rows = [];
  for (const paper of papers) {
    const identity = { number: paper.number, key: paper.key, round: paper.round };
    try {
      const document = await readDocument(root, paper.key);
      rows.push({
        ...identity,
        state: document ? 'available' : 'not-started',
        document: document ? join(root, nameFor(paper.key)) : null,
        ...(document
          ? { binding: currentRevision(document), document_sha256: document.sha256 }
          : {}),
      });
    } catch (error) {
      rows.push({
        ...identity,
        state: 'needs-recheck',
        document: join(root, nameFor(paper.key)),
        reason: (error as Error).message,
      });
    }
  }
  return rows;
}

function replyBlock(input: Answer, revision: Revision) {
  const refs =
    input.claim_ids.map((id) => `- ${revision.paper_id}/${id}`).join('\n') ||
    'No claims are linked. Check what the source can support.';
  return `\n## ${input.question}\n\n${
    input.overview
      ? `### Brief overview

${input.overview}\n\n`
      : ''
  }### Answer to the topic question

${input.answer}

### AI interpretation

${input.interpretation}

### Paper evidence

${refs}

### Open questions

${input.remaining_questions}

### Resume reading at

${input.resume}\n`;
}

function comparisonHoldReason(
  warnings: string[],
  claimExists: boolean,
  reviews: ClaimReview[],
  card: Card,
) {
  if (warnings.length) return 'Check review-record integrity again.';
  if (!claimExists) return 'The claim was deleted.';

  // Older reviews cannot replace a stale or negative latest verdict.
  const newest = reviews[0];
  if (!newest) return 'No source-check record';
  const newestTime = Date.parse(newest.reviewed_at);
  const conflictingReview = reviews
    .slice(1)
    .some(
      (review) =>
        Date.parse(review.reviewed_at) === newestTime && canonical(review) !== canonical(newest),
    );
  if (conflictingReview) return 'Multiple reviews have the same timestamp.';
  if (newest.state !== 'current') return newest.stale_reason;
  if (newest.verdict !== 'supported') return newest.verdict;
  if (newest.required_changes.length) return 'Required review fixes remain.';
  if (card.data.type === 'paper' && card.data.review.status === 'needs-recheck')
    return 'Paper needs rechecking';
}

type ComparisonPaper = {
  key: string;
  number: number;
  title: string;
  paper_id?: string;
  workspace?: string;
  card_sha256?: string;
  document?: string;
  document_sha256?: string;
  source?: Source['file'];
};

// A paper or claim left out of the comparison, with the reason.
type HeldItem =
  | {
      key: string;
      document: string;
      reason: string;
      paper_id?: undefined;
      claim_id?: undefined;
      warnings?: undefined;
    }
  | {
      key: string;
      reason: string;
      document?: undefined;
      paper_id?: undefined;
      claim_id?: undefined;
      warnings?: undefined;
    }
  | {
      key: string;
      paper_id: string;
      claim_id: string;
      reason: string;
      warnings: string[];
      document?: undefined;
    };

// Splits one paper's comparison candidates into included claims and held items with a reason.
// Both lists keep the order of revision.comparison_claims.
function partitionCandidateClaims(
  key: string,
  revision: Revision,
  card: Card,
  reviews: Awaited<ReturnType<typeof loadClaimReviews>>,
  file: Source['file'],
  document: { path: string; sha256: string },
) {
  const held: HeldItem[] = [];
  const included = [];
  const claims = card.data.type === 'paper' ? (card.data.claims ?? []) : [];
  if (!revision.comparison_claims.length) {
    held.push({ key, reason: 'No candidate claims for comparison' });
  }
  for (const claimId of revision.comparison_claims) {
    const claim = claims.find((candidate) => candidate.id === claimId);
    const entries = reviews.claims[claimId] ?? [];
    const reason = comparisonHoldReason(reviews.warnings, Boolean(claim), entries, card);
    if (reason) {
      held.push({
        key,
        paper_id: revision.paper_id,
        claim_id: claimId,
        reason,
        warnings: reviews.warnings,
      });
      continue;
    }
    included.push({
      key,
      paper_id: revision.paper_id,
      claim_id: claimId,
      claim,
      source: {
        edition: file.edition,
        path: file.path,
        sha256: file.sha256,
      },
      document: document.path,
      document_sha256: document.sha256,
      review: entries[0],
    });
  }
  return { held, included };
}

export async function comparisonInput(root: string) {
  const collection = await sourceCollection(root);
  const included = [];
  const held: HeldItem[] = [];
  const papers: ComparisonPaper[] = [];
  for (const row of collection.rows) {
    const paper = row.paper;
    const entry: ComparisonPaper = { key: paper.key, number: paper.number, title: paper.title };
    papers.push(entry);
    const documentPath = join(root, nameFor(paper.key));
    let doc: Document | undefined;
    try {
      doc = await readDocument(root, paper.key);
    } catch (error) {
      held.push({ key: paper.key, document: documentPath, reason: (error as Error).message });
      continue;
    }
    if (!doc) {
      held.push({ key: paper.key, reason: 'No analysis document' });
      continue;
    }
    const revision = currentRevision(doc);
    const source = row.ready ? { paper, file: row.ready } : undefined;
    if (!source || !sameSource(revision, source)) {
      held.push({ key: paper.key, reason: 'Recheck the source, edition and selection round' });
      continue;
    }
    let bound: Awaited<ReturnType<typeof boundPaper>>;
    try {
      bound = await boundPaper(revision, source);
    } catch (error) {
      held.push({ key: paper.key, reason: (error as Error).message });
      continue;
    }
    const { card, workspace } = bound;
    Object.assign(entry, {
      paper_id: revision.paper_id,
      workspace: revision.workspace,
      card_sha256: card.sha256,
      document: documentPath,
      document_sha256: doc.sha256,
      source: source.file,
    });
    const reviews = await loadClaimReviews(workspace, card, source.file.sha256);
    const partitioned = partitionCandidateClaims(paper.key, revision, card, reviews, source.file, {
      path: documentPath,
      sha256: doc.sha256,
    });
    held.push(...partitioned.held);
    included.push(...partitioned.included);
  }
  return {
    version: 1,
    question: collection.question,
    papers,
    claims: included,
    held,
    scope: 'current-supported-claims-only; no-comparison-relations',
  };
}

const analysisOptions = Object.fromEntries(
  ['dir', 'id', 'workspace', 'paper', 'sha', 'input'].map((k) => [k, { type: 'string' as const }]),
);
const optionsByAnalysisAction: Record<string, string[]> = {
  'analysis-open': ['id', 'workspace', 'paper'],
  'analysis-save': ['id', 'sha', 'input'],
  'analysis-list': [],
  'comparison-input': [],
};

// Returns the parsed options and the checked topic folder.
function parseAnalysisArguments(action: string, args: string[]) {
  const { values } = parseArgs({ args, options: analysisOptions });
  if (
    !values.dir ||
    !Object.hasOwn(optionsByAnalysisAction, action) ||
    Object.entries(values).some(
      ([k, value]) =>
        !value?.trim() || (k !== 'dir' && !optionsByAnalysisAction[action]!.includes(k)),
    )
  )
    invalid(help);
  return { values, dir: values.dir };
}
type AnalysisOptions = ReturnType<typeof parseAnalysisArguments>['values'];

// The new edition section that opening a paper for a topic edition appends to its document.
function editionSection(
  doc: Document | undefined,
  source: Source,
  question: string,
  revision: Revision,
) {
  return (
    (doc?.body ??
      `# ${source.paper.title}

Summary: Continue topic answers and open questions in this paper document. Shared claims, conditions and source locations belong to the linked Paper card.
`) +
    `
## Analysis edition: ${source.file.edition}\n\nPDF SHA-256: ${source.file.sha256}

Topic question: ${question}

Selection reason: ${source.paper.note ?? source.paper.reason}\n\nPaper: ${revision.paper_id}\n`
  );
}

// An edition keeps the Paper it was first connected to.
function checkPaperConnection(current: Revision | undefined, revision: Revision, source: Source) {
  if (!revision.workspace || !revision.paper_id)
    invalid(
      'For the first analysis, connect the shared card workspace with --workspace and --paper. Follow docs/PAPER_ANALYSIS.md to prepare the card.',
    );
  if (
    current &&
    sameSource(current, source) &&
    (current.workspace !== revision.workspace || current.paper_id !== revision.paper_id)
  )
    invalid('Preserve the existing Paper connection for this edition.');
}

async function openAnalysis(
  root: string,
  values: AnalysisOptions,
  source: Source,
  question: string,
  doc: Document | undefined,
) {
  const current = doc ? currentRevision(doc) : undefined;
  if (!!values.workspace !== !!values.paper)
    invalid('Specify the card workspace and Paper ID together.');
  const revision: Revision = {
    round: source.paper.round,
    edition: source.file.edition,
    pdf_sha256: source.file.sha256,
    workspace: values.workspace ? await realpath(values.workspace) : (current?.workspace ?? ''),
    paper_id: values.paper ?? current?.paper_id ?? '',
    answered: false,
    comparison_claims: [],
  };
  checkPaperConnection(current, revision, source);
  await boundPaper(revision, source);
  if (doc && sameSource(current!, source)) return doc;
  const state: Session = doc
    ? { ...doc.state, revisions: [...doc.state.revisions, revision] }
    : { version: 1, key: source.paper.key, revisions: [revision] };
  const body = editionSection(doc, source, question, revision);
  return saveDocument(root, source.paper.key, state, body, doc);
}

function parseAnswer(bytes: Buffer) {
  if (bytes.length > 512 * 1024) invalid('The answer JSON exceeds 512 KiB.');
  const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!validateAnswer(input))
    invalid(
      'Check the answer JSON overview, answer, AI interpretation, open questions, reading position and claim IDs.',
    );
  if (input.overview && /\n\s*\n/.test(input.overview))
    invalid('Write the overview as one short paragraph.');
  return input;
}

async function saveAnswer(
  root: string,
  values: AnalysisOptions,
  source: Source,
  doc: Document | undefined,
) {
  if (!doc || !sameSource(currentRevision(doc), source))
    invalid(
      'Open the current edition with analysis-open first to check existing answers and notes.',
    );
  if (values.sha !== doc.sha256 || !values.input)
    invalid('Reopen the analysis document and provide its current SHA-256 and answer JSON.');
  const input = parseAnswer(await readFile(values.input));
  const revision = currentRevision(doc);
  if (!revision.answered && !input.overview)
    invalid(
      'The first answer for this edition needs a short overview of the research question, method and main results.',
    );
  const { card } = await boundPaper(revision, source);
  checkReferences(input, card);
  const state = structuredClone(doc.state);
  const saved = state.revisions.at(-1)!;
  saved.answered = true;
  saved.comparison_claims = input.comparison_claims;
  return saveDocument(root, source.paper.key, state, doc.body + replyBlock(input, revision), doc);
}

export async function runAnalysis([action = '', ...args]: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(help);
    return;
  }
  const { values, dir } = parseAnalysisArguments(action, args);
  const root = await realpath(dir);
  const unlock = ['analysis-open', 'analysis-save'].includes(action)
    ? await workspaceLock(root)
    : undefined;
  try {
    if (action === 'analysis-list') {
      console.log(
        JSON.stringify(
          await listAnalysisDocuments(root, (await selectedTopic(root)).selected),
          null,
          2,
        ),
      );
      return;
    }
    if (action === 'comparison-input') {
      console.log(JSON.stringify(await comparisonInput(root), null, 2));
      return;
    }
    const id = Number(values.id);
    if (!Number.isSafeInteger(id) || id < 1) invalid(help);
    const { source, question } = await readySource(root, id);
    const doc = await readDocument(root, source.paper.key);
    const document =
      action === 'analysis-open'
        ? await openAnalysis(root, values, source, question, doc)
        : await saveAnswer(root, values, source, doc);
    console.log(JSON.stringify(context(root, source, question, document), null, 2));
  } finally {
    await unlock?.();
  }
}

function checkReferences(input: Answer, card: Card) {
  const claims = card.data.type === 'paper' ? (card.data.claims ?? []) : [];
  if (
    [...input.claim_ids, ...input.comparison_claims].some(
      (id) => !claims.some((claim) => claim.id === id),
    )
  )
    invalid('Use actual claim IDs from the linked Paper for answers and comparison candidates.');
}
