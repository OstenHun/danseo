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
  path: string; sha256: string; origin: Origin; source: string;
  decision: 'pending' | 'accepted' | 'declined' | null;
};
type Failure = { source: string; reason: string };
type Row = { key: string; round: number; files: FileRecord[]; failure?: Failure };
type Book = { version: 1; rows: Row[] };

const str = { type: 'string', pattern: '\\S' };
const integer = { type: 'integer', minimum: 1 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) =>
  ({ type: 'object', properties, required, additionalProperties: false });
const fileSchema = object({
  edition: str, proof: str, page: integer, draft: { type: 'boolean' }, path: str,
  sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, origin: { enum: ['public', 'provided', 'existing'] },
  source: str, decision: { enum: [null, 'pending', 'accepted', 'declined'] }
});
const rowSchema = object({ key: str, round: integer, files: { type: 'array', items: fileSchema },
  failure: object({ source: str, reason: str }) }, ['key', 'round', 'files']);
const valid = new Ajv().compile<Book>(object({ version: { const: 1 }, rows: { type: 'array', items: rowSchema } }));
const help = `danseo topic <action> --dir <topic-folder>
  sources
  collect --id N --round N (--pdf <downloaded/provided PDF> | --existing <file to link>)
          [--url <public source URL>] --kind published|draft --edition <actual label>
          --proof <edition marking in the PDF> [--page N]
  unavailable --id N --round N --reason <reason> [--url <attempted source>]
  decide --id N --round N --sha <shown draft SHA-256> --answer accept|decline
Fetch the public PDF with the chat agent, then register its local file and URL.
Each action returns JSON. Inspect rows and ready; failed acquisition stays in the topic.`;
function invalid(message: string): never { throw new DanseoError('SOURCE', message); }
const managedName = (hash: string) => `source-${hash}.pdf`;
function filePath(root: string, file: FileRecord) {
  if (file.origin === 'existing') {
    if (!isAbsolute(file.path)) invalid('The existing source path is damaged.');
    return file.path;
  }
  if (file.path !== managedName(file.sha256) && !new RegExp('^source-' + file.sha256 + '-[a-f0-9-]{36}\\.pdf$').test(file.path)) invalid('The topic source path is damaged.');
  return join(root, file.path);
}
async function readBook(root: string, path: string): Promise<Book> {
  if (!await exists(path)) return { version: 1, rows: [] };
  const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(await writableFile(root, path))));
  if (!valid(data)) invalid('Check the source-list format and version.');
  const selections = new Set<string>();
  for (const row of data.rows) {
    const id = JSON.stringify([row.key, row.round]);
    if (selections.has(id)) invalid('The selection records contain duplicates.');
    selections.add(id);
    const hashes = new Set<string>();
    for (const file of row.files) {
      filePath(root, file);
      if (hashes.has(file.sha256) || file.draft !== (file.decision !== null)) invalid('The source edition record is damaged.');
      hashes.add(file.sha256);
    }
  }
  return data;
}
async function matchesHash(path: string, hash: string) {
  try { return await realpath(path) === path && sha256(await pdfBytes(path)) === hash; }
  catch { return false; }
}
const currentFile = (root: string, file: FileRecord) => matchesHash(filePath(root, file), file.sha256);
async function stillVerified(root: string, paper: SelectedPaper, file: FileRecord) {
  const path = filePath(root, file);
  try {
    if (await realpath(path) !== path) return false;
    const bytes = await pdfBytes(path);
    if (sha256(bytes) !== file.sha256) return false;
    await verifyPdf(bytes, paper, file);
    return true;
  } catch { return false; }
}
const findRow = (book: Book, paper: SelectedPaper) => book.rows.find(row => row.key === paper.key && row.round === paper.round);

async function report(root: string, book: Book, topic: Awaited<ReturnType<typeof selectedTopic>>) {
  const rows = [];
  for (const paper of topic.selected) {
    const row = findRow(book, paper);
    const files = [];
    for (const file of row?.files ?? []) {
      const status = await stillVerified(root, paper, file)
        ? file.decision ?? 'ready' : 'needs-recheck';
      files.push({ ...file, path: filePath(root, file), status });
    }
    const ready = files.findLast(f => f.status === 'ready') ?? files.findLast(f => f.status === 'accepted');
    const next = ready ? 'Ready for analysis' : files.some(f => f.status === 'pending') ? 'Analyze this draft edition?'
      : files.some(f => f.status === 'needs-recheck') ? 'Check and register the source file and edition evidence again.'
      : 'Provide the published PDF or retry this paper only.';
    rows.push({ paper, files, failure: row?.failure, next, ready });
  }
  return { question: topic.question, rows, ready: rows.flatMap(row => row.ready ? [{ paper: row.paper, file: row.ready }] : []) };
}

type Input = { path: string; existing: boolean; url?: string };
async function collect(root: string, book: Book, row: Row, paper: SelectedPaper, input: Input, evidence: Edition) {
  const inputPath = await realpath(input.path);
  const bytes = await pdfBytes(inputPath);
  const hash = sha256(bytes);
  const previous = row.files.find(f => f.sha256 === hash);
  const sameEdition = (f: FileRecord) => editionKey(f.edition) === editionKey(evidence.edition);
  const correctingToDraft = previous && !previous.draft && evidence.draft;
  if (previous && !correctingToDraft && (!sameEdition(previous) || (previous.draft && !evidence.draft))) {
    throw Error('The same file has conflicting edition or publication classifications.');
  }
  // Compare the candidate before reusing another copy of the same edition.
  await verifyPdf(bytes, paper, evidence);
  if (correctingToDraft && await currentFile(root, previous)) {
    Object.assign(previous, evidence, { decision: 'pending' });
    delete row.failure;
    return;
  }
  const related = [row, ...book.rows.filter(r => r !== row && r.key === row.key)];
  for (const candidate of related.flatMap(r => r.files)) {
    if (!sameEdition(candidate) || candidate.draft !== evidence.draft || !await stillVerified(root, paper, candidate)) continue;
    if (!row.files.includes(candidate)) {
      const local = row.files.find(f => f.sha256 === candidate.sha256);
      const reused = { ...candidate, decision: candidate.draft ? local?.decision ?? 'pending' : null };
      if (local) row.files[row.files.indexOf(local)] = reused;
      else row.files.push(reused);
    }
    delete row.failure;
    return;
  }
  let name = managedName(hash);
  let path = input.existing ? inputPath : join(root,name);
  let created: string | undefined;
  try {
    if (!input.existing) {
      if (await exists(path)) {
        // Preserve any changed or interrupted copy and publish the verified bytes separately.
        if (!await matchesHash(path, hash)) {
          name = `source-${hash}-${randomUUID()}.pdf`;
          path = join(root,name);
        }
      }
      if (!await exists(path)) {
        const temp = join(root, `.topic-${randomUUID()}.tmp`);
        try {
          await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
          await rename(temp,path);
          created = path;
        } finally { await rm(temp, { force: true }); }
      }
    }
    if (await realpath(path) !== path) throw Error('The source path changed.');
    const saved = await pdfBytes(path);
    if (sha256(saved) !== hash) throw Error('The destination file has different contents. Check the existing file.');
    await verifyPdf(saved, paper, evidence);
    const file: FileRecord = { ...evidence, path: input.existing ? inputPath : name, sha256: hash,
      origin: input.existing ? 'existing' : input.url ? 'public' : 'provided',
      source: input.url ?? inputPath, decision: evidence.draft ? previous?.decision ?? 'pending' : null
    };
    if (previous) row.files[row.files.indexOf(previous)] = file;
    else row.files.push(file);
    delete row.failure;
    return created;
  } catch (error) { if (created) await rm(created, { force: true }); throw error; }
}

const options = Object.fromEntries(['dir', 'id', 'round', 'pdf', 'existing', 'url', 'kind', 'edition', 'proof', 'page', 'reason', 'sha', 'answer']
  .map(name => [name, { type: 'string' as const }]));
const allowed: Record<string, string[]> = {
  sources: [], collect: ['id','round','pdf','existing','url','kind','edition','proof','page'],
  unavailable: ['id','round','reason','url'], decide: ['id','round','sha','answer']
};
/** Stage-3 boundary: re-read selections, consent, PDF bytes and edition markings. */
export async function sourceCollection(root: string, alreadyLocked = false) {
  const unlock = alreadyLocked ? undefined : await workspaceLock(root);
  const snapshot = await (async () => {
    try { return { book: await readBook(root, join(root, 'sources.json')), topic: await selectedTopic(root) }; }
    finally { await unlock?.(); }
  })();
  // Release the metadata lock before parsing PDFs. Writers may then start the next snapshot.
  return report(root, snapshot.book, snapshot.topic);
}
export async function runCollection([action = '', ...args]: string[]) {
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return; }
  const { values: v } = parseArgs({ args, options });
  if (!v.dir || Object.entries(v).some(([k, value]) => !value?.trim() || (k !== 'dir' && !allowed[action]?.includes(k)))) invalid(help);
  if (v.url) {
    let url: URL;
    try { url = new URL(v.url); } catch { return invalid(help); }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) invalid(help);
  }
  const root = await realpath(v.dir);
  const path = join(root, 'sources.json');
  const unlock = action === 'sources' ? undefined : await workspaceLock(root);
  try {
    const topic = await selectedTopic(root);
    const book = await readBook(root, path);
    if (action !== 'sources') {
      const paper = topic.selected.find(p => p.number === Number(v.id) && p.round === Number(v.round));
      if (!paper) invalid('Check the currently selected paper number and selection round.');
      const row: Row = findRow(book, paper) ?? { key: paper.key, round: paper.round, files: [] };
      if (!book.rows.includes(row)) book.rows.push(row);
      let created: string | undefined;
      if (action === 'unavailable') {
        if (!v.reason) invalid(help);
        row.failure = { source: v.url ?? paper.source, reason: v.reason };
      } else if (action === 'decide') {
        const file = row.files.find(f => f.draft && f.sha256 === v.sha);
        if (!file || !['accept', 'decline'].includes(v.answer ?? '')) invalid('Check the displayed draft hash and response.');
        if (!await stillVerified(root, paper, file)) invalid('Check the draft file and edition again.');
        file.decision = v.answer === 'accept' ? 'accepted' : 'declined';
      } else {
        const page = Number(v.page ?? 1);
        if (!!v.pdf === !!v.existing || !v.edition || !v.proof || !Number.isSafeInteger(page) || page < 1 ||
            !['published','draft'].includes(v.kind ?? '')) invalid(help);
        const source = v.existing ?? v.pdf!;
        try {
          created = await collect(root, book, row, paper, { path: source, existing: !!v.existing, url: v.url },
            { edition: v.edition, proof: v.proof, page, draft: v.kind === 'draft' });
        } catch (error) {
          row.failure = { source: v.url ?? source, reason: (error as Error).message };
        }
      }
      try { await replaceTopicJson(root, path, book); }
      catch (error) { if (created) await rm(created, { force: true }); throw error; }
    }
    console.log(JSON.stringify(await report(root, book, topic), null, 2));
  } finally { await unlock?.(); }
}
