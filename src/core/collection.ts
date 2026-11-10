import { randomUUID } from 'node:crypto';
import { open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import { Ajv } from 'ajv';
import { DanseoError } from './index.js';
import { exists, workspaceLock, writableFile } from './storage.js';
import { selectedTopic, type SelectedPaper } from './topic.js';
import { pdfBytes, sha256, verifyPdf, type Edition } from './source-pdf.js';

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
    if (!isAbsolute(file.path)) invalid('기존 원문 경로가 손상되었습니다.');
    return file.path;
  }
  if (file.path !== managedName(file.sha256)) invalid('주제 원문 경로가 손상되었습니다.');
  return join(root, file.path);
}
async function readBook(root: string, path: string): Promise<Book> {
  if (!await exists(path)) return { version: 1, rows: [] };
  const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(await writableFile(root, path))));
  if (!valid(data)) invalid('원문 목록의 형식과 버전을 확인하세요.');
  const selections = new Set<string>();
  for (const row of data.rows) {
    const id = JSON.stringify([row.key, row.round]);
    if (selections.has(id)) invalid('중복된 선택 기록입니다.');
    selections.add(id);
    const hashes = new Set<string>();
    for (const file of row.files) {
      filePath(root, file);
      if (hashes.has(file.sha256) || file.draft !== (file.decision !== null)) invalid('원문 판본 기록이 손상되었습니다.');
      hashes.add(file.sha256);
    }
  }
  return data;
}
async function saveBook(root: string, path: string, book: Book) {
  const temp = join(root, `.topic-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, JSON.stringify(book, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temp, path);
  } finally { await rm(temp, { force: true }); }
}
async function currentFile(root: string, file: FileRecord) {
  const path = filePath(root, file);
  try { return await realpath(path) === path && sha256(await pdfBytes(path)) === file.sha256; }
  catch { return false; }
}
const findRow = (book: Book, paper: SelectedPaper) => book.rows.find(row => row.key === paper.key && row.round === paper.round);

async function report(root: string, book: Book, topic: Awaited<ReturnType<typeof selectedTopic>>) {
  const rows = [];
  for (const paper of topic.selected) {
    const row = findRow(book, paper);
    const files = [];
    for (const file of row?.files ?? []) {
      const status = await currentFile(root, file)
        ? file.decision ?? 'ready' : 'needs-recheck';
      files.push({ ...file, path: filePath(root, file), status });
    }
    const ready = files.findLast(f => f.status === 'ready') ?? files.findLast(f => f.status === 'accepted');
    const next = ready ? '분석 가능' : files.some(f => f.status === 'pending') ? '이 초고로 분석할까요?'
      : files.some(f => f.status === 'needs-recheck') ? '파일이 사라지거나 바뀌었습니다. 원문을 다시 등록하세요.'
      : '출판본 PDF를 제공하거나 이 논문만 다시 시도하세요.';
    rows.push({ paper, files, failure: row?.failure, next, ready });
  }
  return { question: topic.question, rows, ready: rows.flatMap(row => row.ready ? [{ paper: row.paper, file: row.ready }] : []) };
}

type Input = { path: string; existing: boolean; url?: string };
async function collect(root: string, row: Row, paper: SelectedPaper, input: Input, evidence: Edition) {
  const inputPath = await realpath(input.path);
  const bytes = await pdfBytes(inputPath);
  const hash = sha256(bytes);
  const prior = row.files.find(f => f.sha256 === hash);
  if (prior && (prior.edition !== evidence.edition || prior.draft !== evidence.draft)) {
    throw Error('같은 파일에 서로 다른 판본 또는 초고 구분이 지정되었습니다.');
  }
  const keepPrior = prior && await currentFile(root, prior);
  const storedPath = keepPrior ? filePath(root, prior) : input.existing ? inputPath : join(root, managedName(hash));
  let created = false;
  try {
    if (!input.existing && !keepPrior && !await exists(storedPath)) {
      // Only remove a partial file if this writer created it.
      const handle = await open(storedPath, 'wx', 0o600);
      created = true;
      try { await handle.writeFile(bytes); } finally { await handle.close(); }
    }
    if (await realpath(storedPath) !== storedPath) throw Error('원문 경로가 변경되었습니다.');
    const saved = await pdfBytes(storedPath);
    if (sha256(saved) !== hash) throw Error('저장 위치의 파일 내용이 다릅니다. 기존 파일을 확인하세요.');
    await verifyPdf(saved, paper, evidence);
    const file: FileRecord = keepPrior ? prior : { ...evidence,
      path: input.existing ? inputPath : managedName(hash), sha256: hash,
      origin: input.existing ? 'existing' : input.url ? 'public' : 'provided',
      source: input.url ?? inputPath, decision: evidence.draft ? prior?.decision ?? 'pending' : null
    };
    if (prior) row.files[row.files.indexOf(prior)] = file;
    else row.files.push(file);
    delete row.failure;
    return created ? storedPath : undefined;
  } catch (error) {
    if (created) await rm(storedPath, { force: true });
    throw error;
  }
}

const options = Object.fromEntries(['dir', 'id', 'round', 'pdf', 'existing', 'url', 'kind', 'edition', 'proof', 'page', 'reason', 'sha', 'answer']
  .map(name => [name, { type: 'string' as const }]));
const allowed: Record<string, string[]> = {
  sources: [], collect: ['id','round','pdf','existing','url','kind','edition','proof','page'],
  unavailable: ['id','round','reason','url'], decide: ['id','round','sha','answer']
};
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
      if (!paper) invalid('현재 선택한 논문 번호와 선택 회차를 확인하세요.');
      const row: Row = findRow(book, paper) ?? { key: paper.key, round: paper.round, files: [] };
      if (!book.rows.includes(row)) book.rows.push(row);
      let created: string | undefined;
      if (action === 'unavailable') {
        if (!v.reason) invalid(help);
        row.failure = { source: v.url ?? paper.source, reason: v.reason };
      } else if (action === 'decide') {
        const file = row.files.find(f => f.draft && f.sha256 === v.sha);
        if (!file || !['accept', 'decline'].includes(v.answer ?? '')) invalid('표시한 초고의 해시와 응답을 확인하세요.');
        if (!await currentFile(root, file)) invalid('초고 파일이 바뀌었습니다. 다시 확인하세요.');
        file.decision = v.answer === 'accept' ? 'accepted' : 'declined';
      } else {
        const page = Number(v.page ?? 1);
        if (!!v.pdf === !!v.existing || !v.edition || !v.proof || !Number.isSafeInteger(page) || page < 1 ||
            !['published','draft'].includes(v.kind ?? '')) invalid(help);
        const source = v.existing ?? v.pdf!;
        try {
          created = await collect(root, row, paper, { path: source, existing: !!v.existing, url: v.url },
            { edition: v.edition, proof: v.proof, page, draft: v.kind === 'draft' });
        } catch (error) {
          row.failure = { source: v.url ?? source, reason: (error as Error).message };
        }
      }
      try { await saveBook(root, path, book); }
      catch (error) { if (created) await rm(created, { force: true }); throw error; }
    }
    console.log(JSON.stringify(await report(root, book, topic), null, 2));
  } finally { await unlock?.(); }
}
