import { randomUUID } from 'node:crypto';
import { readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import { Ajv } from 'ajv';
import { DanseoError } from './index.js';
import { exists, replaceTopicJson, workspaceLock, writableFile } from './storage.js';
import { selectedTopic, type SelectedPaper } from './topic.js';
import { editionKey, pdfBytes, sha256, verifyPdf, type Edition } from './source-pdf.js';

type Origin = 'public' | 'provided' | 'existing';
type FileRecord = Edition & {
  path: string;
  sha256: string;
  origin: Origin;
  source: string;
  decision: 'pending' | 'accepted' | 'declined' | null;
};
type Failure = { source: string; reason: string };
type Row = { key: string; round: number; files: FileRecord[]; failure?: Failure };
type Book = { version: 1; rows: Row[] };

const str = { type: 'string', pattern: '\\S' };
const integer = { type: 'integer', minimum: 1 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const fileSchema = object({
  edition: str,
  proof: str,
  page: integer,
  draft: { type: 'boolean' },
  path: str,
  sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  origin: { enum: ['public', 'provided', 'existing'] },
  source: str,
  decision: { enum: [null, 'pending', 'accepted', 'declined'] },
});
const rowSchema = object(
  {
    key: str,
    round: integer,
    files: { type: 'array', items: fileSchema },
    failure: object({ source: str, reason: str }),
  },
  ['key', 'round', 'files'],
);
const valid = new Ajv().compile<Book>(
  object({ version: { const: 1 }, rows: { type: 'array', items: rowSchema } }),
);
const help = `danseo topic <action> --dir <topic-folder>
  sources
  collect --id N --round N (--pdf <downloaded/provided PDF> | --existing <file to link>)
          [--url <public source URL>] --kind published|draft --edition <actual label>
          --proof <edition marking in the PDF> [--page N]
  unavailable --id N --round N --reason <reason> [--url <attempted source>]
  decide --id N --round N --sha <shown draft SHA-256> --answer accept|decline
Fetch the public PDF with the chat agent, then register its local file and URL.
Each action returns JSON. Inspect rows and ready; failed acquisition stays in the topic.`;
function invalid(message: string): never {
  throw new DanseoError('SOURCE', message);
}
const managedName = (hash: string) => `source-${hash}.pdf`;
function filePath(root: string, file: FileRecord) {
  if (file.origin === 'existing') {
    if (!isAbsolute(file.path)) invalid('The existing source path is damaged.');
    return file.path;
  }
  if (
    file.path !== managedName(file.sha256) &&
    !new RegExp('^source-' + file.sha256 + '-[a-f0-9-]{36}\\.pdf$').test(file.path)
  )
    invalid('The topic source path is damaged.');
  return join(root, file.path);
}
async function readBook(root: string, path: string): Promise<Book> {
  if (!(await exists(path))) return { version: 1, rows: [] };
  const data: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(
      await readFile(await writableFile(root, path)),
    ),
  );
  if (!valid(data)) invalid('Check the source-list format and version.');
  const selections = new Set<string>();
  for (const row of data.rows) {
    const id = JSON.stringify([row.key, row.round]);
    if (selections.has(id)) invalid('The selection records contain duplicates.');
    selections.add(id);
    const hashes = new Set<string>();
    for (const file of row.files) {
      filePath(root, file);
      if (hashes.has(file.sha256) || file.draft !== (file.decision !== null))
        invalid('The source edition record is damaged.');
      hashes.add(file.sha256);
    }
  }
  return data;
}
async function matchesHash(path: string, hash: string) {
  try {
    return (await realpath(path)) === path && sha256(await pdfBytes(path)) === hash;
  } catch {
    return false;
  }
}
const currentFile = (root: string, file: FileRecord) =>
  matchesHash(filePath(root, file), file.sha256);
async function stillVerified(root: string, paper: SelectedPaper, file: FileRecord) {
  const path = filePath(root, file);
  try {
    if ((await realpath(path)) !== path) return false;
    const bytes = await pdfBytes(path);
    if (sha256(bytes) !== file.sha256) return false;
    await verifyPdf(bytes, paper, file);
    return true;
  } catch {
    return false;
  }
}
const findRow = (book: Book, paper: SelectedPaper) =>
  book.rows.find((row) => row.key === paper.key && row.round === paper.round);

function nextStep(ready: boolean, files: { status: string }[]) {
  if (ready) return 'Ready for analysis';
  if (files.some((file) => file.status === 'pending')) return 'Analyze this draft edition?';
  if (files.some((file) => file.status === 'needs-recheck'))
    return 'Check and register the source file and edition evidence again.';
  return 'Provide the published PDF or retry this paper only.';
}

async function report(root: string, book: Book, topic: Awaited<ReturnType<typeof selectedTopic>>) {
  const rows = [];
  for (const paper of topic.selected) {
    const row = findRow(book, paper);
    const files = [];
    for (const file of row?.files ?? []) {
      const status = (await stillVerified(root, paper, file))
        ? (file.decision ?? 'ready')
        : 'needs-recheck';
      files.push({ ...file, path: filePath(root, file), status });
    }
    const ready =
      files.findLast((file) => file.status === 'ready') ??
      files.findLast((file) => file.status === 'accepted');
    const next = nextStep(Boolean(ready), files);
    rows.push({ paper, files, failure: row?.failure, next, ready });
  }
  return {
    question: topic.question,
    rows,
    ready: rows.flatMap((row) => (row.ready ? [{ paper: row.paper, file: row.ready }] : [])),
  };
}

type Input = { path: string; existing: boolean; url?: string };

function originOf(input: Input): Origin {
  if (input.existing) return 'existing';
  return input.url ? 'public' : 'provided';
}

function putRecord(row: Row, previous: FileRecord | undefined, file: FileRecord) {
  if (previous) row.files[row.files.indexOf(previous)] = file;
  else row.files.push(file);
}

// The same bytes cannot be registered as another edition or moved from draft to published.
function rejectConflictingRecord(previous: FileRecord | undefined, evidence: Edition) {
  if (
    previous &&
    (editionKey(previous.edition) !== editionKey(evidence.edition) ||
      (previous.draft && !evidence.draft))
  ) {
    throw Error('The same file has conflicting edition or publication classifications.');
  }
}

// A draft keeps the consent already given for the same bytes; a new draft waits for consent.
function verifiedRecord(
  input: Input,
  inputPath: string,
  copyName: string,
  hash: string,
  evidence: Edition,
  previous: FileRecord | undefined,
): FileRecord {
  return {
    ...evidence,
    path: input.existing ? inputPath : copyName,
    sha256: hash,
    origin: originOf(input),
    source: input.url ?? inputPath,
    decision: evidence.draft ? (previous?.decision ?? 'pending') : null,
  };
}

// Uses an already verified copy of the same edition in this row, replacing a record with the
// same hash. Draft consent stays with the row that holds it.
function linkVerifiedCopy(row: Row, candidate: FileRecord) {
  if (row.files.includes(candidate)) return;
  const local = row.files.find((file) => file.sha256 === candidate.sha256);
  const reused = {
    ...candidate,
    decision: candidate.draft ? (local?.decision ?? 'pending') : null,
  };
  putRecord(row, local, reused);
}

type ManagedCopy = { name: string; path: string; created?: string };

// Writes the verified bytes into the topic folder unless an identical file is already there.
// Sets copy.created as soon as a new file exists, so the caller can remove it if a later
// check fails.
async function writeManagedCopy(root: string, bytes: Buffer, hash: string, copy: ManagedCopy) {
  if (await exists(copy.path)) {
    // Preserve any changed or interrupted copy and publish the verified bytes separately.
    if (!(await matchesHash(copy.path, hash))) {
      copy.name = `source-${hash}-${randomUUID()}.pdf`;
      copy.path = join(root, copy.name);
    }
  }
  if (await exists(copy.path)) return;
  const temp = join(root, `.topic-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
    await rename(temp, copy.path);
    copy.created = copy.path;
  } finally {
    await rm(temp, { force: true });
  }
}

async function collect(
  root: string,
  book: Book,
  row: Row,
  paper: SelectedPaper,
  input: Input,
  evidence: Edition,
) {
  const inputPath = await realpath(input.path);
  const bytes = await pdfBytes(inputPath);
  const hash = sha256(bytes);
  const previous = row.files.find((file) => file.sha256 === hash);
  const sameEdition = (file: FileRecord) =>
    editionKey(file.edition) === editionKey(evidence.edition);
  // Reclassifying a registered published file as a draft is allowed.
  const correctingToDraft = previous && !previous.draft && evidence.draft;
  if (!correctingToDraft) rejectConflictingRecord(previous, evidence);
  // Compare the candidate before reusing another copy of the same edition.
  await verifyPdf(bytes, paper, evidence);
  if (correctingToDraft && (await currentFile(root, previous))) {
    Object.assign(previous, evidence, { decision: 'pending' });
    delete row.failure;
    return;
  }
  const reusable = (candidate: FileRecord) =>
    sameEdition(candidate) && candidate.draft === evidence.draft;
  const related = [row, ...book.rows.filter((other) => other !== row && other.key === row.key)];
  for (const candidate of related.flatMap((relatedRow) => relatedRow.files)) {
    if (!reusable(candidate) || !(await stillVerified(root, paper, candidate))) continue;
    linkVerifiedCopy(row, candidate);
    delete row.failure;
    return;
  }
  const name = managedName(hash);
  const copy: ManagedCopy = { name, path: input.existing ? inputPath : join(root, name) };
  try {
    if (!input.existing) await writeManagedCopy(root, bytes, hash, copy);
    if ((await realpath(copy.path)) !== copy.path) throw Error('The source path changed.');
    const saved = await pdfBytes(copy.path);
    if (sha256(saved) !== hash)
      throw Error('The destination file has different contents. Check the existing file.');
    await verifyPdf(saved, paper, evidence);
    const file = verifiedRecord(input, inputPath, copy.name, hash, evidence, previous);
    putRecord(row, previous, file);
    delete row.failure;
    return copy.created;
  } catch (error) {
    if (copy.created) await rm(copy.created, { force: true });
    throw error;
  }
}

const options = Object.fromEntries(
  [
    'dir',
    'id',
    'round',
    'pdf',
    'existing',
    'url',
    'kind',
    'edition',
    'proof',
    'page',
    'reason',
    'sha',
    'answer',
  ].map((name) => [name, { type: 'string' as const }]),
);
const allowed: Record<string, string[]> = {
  sources: [],
  collect: ['id', 'round', 'pdf', 'existing', 'url', 'kind', 'edition', 'proof', 'page'],
  unavailable: ['id', 'round', 'reason', 'url'],
  decide: ['id', 'round', 'sha', 'answer'],
};
/** Stage-3 boundary: re-read selections, consent, PDF bytes and edition markings. */
export async function sourceCollection(root: string, alreadyLocked = false) {
  const unlock = alreadyLocked ? undefined : await workspaceLock(root);
  const snapshot = await (async () => {
    try {
      return {
        book: await readBook(root, join(root, 'sources.json')),
        topic: await selectedTopic(root),
      };
    } finally {
      await unlock?.();
    }
  })();
  // Release the metadata lock before parsing PDFs. Writers may then start the next snapshot.
  return report(root, snapshot.book, snapshot.topic);
}
// A source URL must be http(s) and carry no credentials.
function checkSourceUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid(help);
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) invalid(help);
}

// Returns the parsed options and the checked topic folder.
function parseCollectionArguments(action: string, args: string[]) {
  const { values } = parseArgs({ args, options });
  if (
    !values.dir ||
    Object.entries(values).some(
      ([k, value]) => !value?.trim() || (k !== 'dir' && !allowed[action]?.includes(k)),
    )
  )
    invalid(help);
  if (values.url) checkSourceUrl(values.url);
  return { values, dir: values.dir };
}
type CollectionOptions = ReturnType<typeof parseCollectionArguments>['values'];

// Finds the selected paper and its source row, adding an empty row on first use.
function selectionRow(
  topic: Awaited<ReturnType<typeof selectedTopic>>,
  book: Book,
  values: CollectionOptions,
) {
  const paper = topic.selected.find(
    (selected) => selected.number === Number(values.id) && selected.round === Number(values.round),
  );
  if (!paper) invalid('Check the currently selected paper number and selection round.');
  const row: Row = findRow(book, paper) ?? { key: paper.key, round: paper.round, files: [] };
  if (!book.rows.includes(row)) book.rows.push(row);
  return { paper, row };
}

function markUnavailable(row: Row, paper: SelectedPaper, values: CollectionOptions) {
  if (!values.reason) invalid(help);
  row.failure = { source: values.url ?? paper.source, reason: values.reason };
}

function draftToDecide(row: Row, values: CollectionOptions) {
  const file = row.files.find((candidate) => candidate.draft && candidate.sha256 === values.sha);
  if (!file || !['accept', 'decline'].includes(values.answer ?? ''))
    invalid('Check the displayed draft hash and response.');
  return file;
}

// editionEvidence has already checked that exactly one of --pdf and --existing is given.
function collectInput(values: CollectionOptions) {
  const source = values.existing ?? values.pdf!;
  const input: Input = { path: source, existing: !!values.existing, url: values.url };
  return { source, input };
}

function editionEvidence(values: CollectionOptions): Edition {
  const page = Number(values.page ?? 1);
  if (
    !!values.pdf === !!values.existing ||
    !values.edition ||
    !values.proof ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !['published', 'draft'].includes(values.kind ?? '')
  )
    invalid(help);
  return { edition: values.edition, proof: values.proof, page, draft: values.kind === 'draft' };
}

export async function runCollection([action = '', ...args]: string[]): Promise<undefined> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(help);
    return;
  }
  const { values, dir } = parseCollectionArguments(action, args);
  const root = await realpath(dir);
  const path = join(root, 'sources.json');
  const unlock = action === 'sources' ? undefined : await workspaceLock(root);
  try {
    const topic = await selectedTopic(root);
    const book = await readBook(root, path);
    if (action !== 'sources') {
      const { paper, row } = selectionRow(topic, book, values);
      let created: string | undefined;
      if (action === 'unavailable') {
        markUnavailable(row, paper, values);
      } else if (action === 'decide') {
        const file = draftToDecide(row, values);
        if (!(await stillVerified(root, paper, file)))
          invalid('Check the draft file and edition again.');
        file.decision = values.answer === 'accept' ? 'accepted' : 'declined';
      } else {
        const evidence = editionEvidence(values);
        const { source, input } = collectInput(values);
        try {
          created = await collect(root, book, row, paper, input, evidence);
        } catch (error) {
          row.failure = { source: values.url ?? source, reason: (error as Error).message };
        }
      }
      try {
        await replaceTopicJson(root, path, book);
      } catch (error) {
        if (created) await rm(created, { force: true });
        throw error;
      }
    }
    console.log(JSON.stringify(await report(root, book, topic), null, 2));
  } finally {
    await unlock?.();
  }
}
