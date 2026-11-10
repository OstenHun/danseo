import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { Ajv } from 'ajv';
import { DanseoError } from './index.js';
import { exists, workspaceLock, writableFile } from './storage.js';

type Paper = {
  key: string; title: string; authors: string; year: number; source: string;
  edition: string; reason: string; scope: 'abstract' | 'full-text';
};
type Search = { query: string; papers: Paper[] };
type Choice = { key: string; round: number; note?: string };
type Topic = { version: 1; question: string; searches: Search[]; selected: Choice[] };

const topicHelp = `Usage: danseo topic <action> --dir <topic-folder>
  init --question <original question>
  search --input <JSON file containing query and papers>
  select --ids <stable numbers, comma-separated> [--round <shown search round>] [--note <reader's reason>]
  unselect --ids <stable numbers, comma-separated>
  show
All actions return JSON. Search uses candidates verified by the chat agent.`;
const ajv = new Ajv();
const nonblank = { type: 'string', pattern: '\\S' };
const searchSchema = { type: 'object', additionalProperties: false, required: ['query', 'papers'], properties: {
  query: nonblank, papers: { type: 'array', maxItems: 5, items: {
    type: 'object', additionalProperties: false,
    required: ['key', 'title', 'authors', 'year', 'source', 'edition', 'reason', 'scope'],
    properties: {
      key: nonblank, title: nonblank, authors: nonblank, year: { type: 'integer', minimum: 1, maximum: 9999 },
      source: { type: 'string', format: 'paper-url' }, edition: nonblank, reason: nonblank,
      scope: { enum: ['abstract', 'full-text'] }
    }
  } }
} };
ajv.addFormat('paper-url', (value: string) => {
  try {
    const url = new URL(value);
    return /^https?:\/\//i.test(value) && !/\s/.test(value) && !url.username && !url.password;
  } catch { return false; }
});
const validSearch = ajv.compile<Search>(searchSchema);
const validTopic = ajv.compile<Topic>({ type: 'object', additionalProperties: false,
  required: ['version', 'question', 'searches', 'selected'], properties: {
    version: { const: 1 }, question: nonblank, searches: { type: 'array', items: searchSchema },
    selected: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['key', 'round'], properties: { key: nonblank, round: { type: 'integer', minimum: 1 }, note: nonblank } } }
  }
});

function invalid(message: string): never { throw new DanseoError('TOPIC', message); }
async function readJson(file: string): Promise<unknown> {
  let raw: Buffer;
  try { raw = await readFile(file); }
  catch (error) {
    throw new DanseoError('TOPIC_FILE', `파일을 읽을 수 없습니다: ${file} (${(error as NodeJS.ErrnoException).code})`, 3);
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { return invalid(`올바른 UTF-8 JSON 파일인지 확인하세요: ${file}`); }
}

// A number is assigned on first appearance. The selection points to the edition shown when chosen.
function overview(topic: Topic) {
  const catalog = new Map<string, { number: number; round: number; paper: Paper }>();
  const sourceKeys = new Map<string, string>();
  const searches = topic.searches.map((search, index) => {
    const seen = new Set<string>();
    const papers = search.papers.map(paper => {
      const url = new URL(paper.source).href;
      if (seen.has(paper.key) || (sourceKeys.has(url) && sourceKeys.get(url) !== paper.key))
        invalid('중복된 논문 또는 다른 번호에 등록된 출처입니다. 기존 key를 확인하세요.');
      seen.add(paper.key);
      sourceKeys.set(url, paper.key);
      const number = catalog.get(paper.key)?.number ?? catalog.size + 1;
      catalog.set(paper.key, { number, round: index + 1, paper });
      return { number, ...paper };
    });
    return { round: index + 1, query: search.query, papers };
  });
  const selected = topic.selected.map(choice => {
    const paper = searches[choice.round - 1]?.papers.find(row => row.key === choice.key);
    if (!paper) invalid('선택한 판본과 검색 기록의 연결이 손상되었습니다.');
    return { ...paper, round: choice.round, note: choice.note };
  });
  if (new Set(selected.map(row => row.key)).size !== selected.length) invalid('중복 선택 기록입니다.');
  return { catalog, result: { question: topic.question, searches, selected } };
}

export async function runTopic(args: string[]) {
  try { return await executeTopic(args); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!(error instanceof DanseoError) && code && /^E[A-Z]+$/.test(code)) {
      throw new DanseoError('TOPIC_FILE', `주제 파일에 접근할 수 없습니다: ${(error as Error).message}`, 3);
    }
    throw error;
  }
}

async function executeTopic(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) { console.log(topicHelp); return; }
  const [action, ...rest] = args;
  const { values } = parseArgs({ args: rest, options: {
    dir: { type: 'string' }, question: { type: 'string' }, input: { type: 'string' },
    ids: { type: 'string' }, note: { type: 'string' }, round: { type: 'string' }
  } });
  const options: Record<string, string[]> = { init: ['question'], search: ['input'], select: ['ids', 'note', 'round'], unselect: ['ids'], show: [] };
  if (!action || !Object.hasOwn(options, action) || !values.dir?.trim() ||
      Object.keys(values).some(key => key !== 'dir' && !options[action]!.includes(key))) invalid(topicHelp);
  if (action === 'init') {
    if (!values.question?.trim()) invalid(topicHelp);
    await mkdir(values.dir, { recursive: true });
  }
  const root = await realpath(values.dir);
  const path = join(root, 'topic.json');
  const unlock = action === 'show' ? undefined : await workspaceLock(root);
  try {
    let topic: Topic;
    if (action === 'init') {
      if (await exists(path)) invalid('이미 생성한 주제입니다. show로 다시 여세요.');
      topic = { version: 1, question: values.question!.trim(), searches: [], selected: [] };
    } else {
      if (!await exists(path)) invalid(`저장된 주제가 없습니다. 주제 폴더를 확인하거나 init으로 시작하세요: ${root}`);
      const data = await readJson(await writableFile(root, path));
      if (!validTopic(data)) invalid('주제 파일의 형식 또는 버전을 확인하세요.');
      topic = data;
    }
    const current = overview(topic);
    if (action === 'show') { console.log(JSON.stringify(current.result, null, 2)); return; }
    if (action === 'search') {
      if (!values.input) invalid(topicHelp);
      const search = await readJson(values.input);
      if (!validSearch(search)) invalid(ajv.errorsText(validSearch.errors));
      if (!isDeepStrictEqual(topic.searches.at(-1), search)) topic.searches.push(search);
    }
    if (action === 'select' || action === 'unselect') {
      if (!values.ids || !/^\d+(,\d+)*$/.test(values.ids) || (values.note !== undefined && !values.note.trim())) invalid(topicHelp);
      const round = values.round === undefined ? undefined : Number(values.round);
      if (round !== undefined && (!Number.isSafeInteger(round) || round < 1 || round > topic.searches.length))
        invalid('등록되지 않은 검색 회차입니다.');
      const byNumber = new Map([...current.catalog.values()].map(row => [row.number, row]));
      for (const number of new Set(values.ids.split(',').map(Number))) {
        const row = byNumber.get(number);
        if (!row) invalid(`등록되지 않은 논문 번호: ${number}`);
        if (round !== undefined && !topic.searches[round - 1]!.papers.some(paper => paper.key === row.paper.key))
          invalid(`지정한 회차에 없는 논문 번호: ${number}`);
        if (action === 'unselect') topic.selected = topic.selected.filter(choice => choice.key !== row.paper.key);
        else if (!topic.selected.some(choice => choice.key === row.paper.key)) {
          if (round === undefined && topic.searches.some(search => search.papers.some(paper =>
            paper.key === row.paper.key && (paper.edition !== row.paper.edition || paper.source !== row.paper.source))))
            invalid(`출처나 판본이 다른 후보입니다. ${number}번을 본 --round를 지정하세요.`);
          topic.selected.push({ key: row.paper.key, round: round ?? row.round, note: values.note });
        }
      }
    }
    const { result } = overview(topic);
    const temp = join(root, `.topic-${randomUUID()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(topic, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      await rename(temp, path);
    } finally { await rm(temp, { force: true }); }
    console.log(JSON.stringify(result, null, 2));
  } finally { await unlock?.(); }
}
