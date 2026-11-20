import { mkdir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { Ajv } from 'ajv';
import { DanseoError } from './index.js';
import { exists, replaceTopicJson, workspaceLock, writableFile } from './storage.js';

type Paper = {
  key: string; title: string; authors: string; year: number; source: string;
  edition: string; reason: string; scope: 'abstract' | 'full-text';
};
type Search = { query: string; papers: Paper[] };
type Choice = { key: string; round: number; note?: string };
type Topic = { version: 1; question: string; searches: Search[]; selected: Choice[] };
type CatalogEntry = { number: number; round: number; paper: Paper };
export type SelectedPaper = Paper & { number: number; round: number; note?: string };

const topicHelp = `Usage: danseo topic <action> --dir <topic-folder>
  init --question <original question>
  search --input <JSON file containing query and papers>
  select --ids <stable numbers, comma-separated> [--round <shown search round>] [--note <reader's reason>]
  unselect --ids <stable numbers, comma-separated>
  show
  compare [--port 0 | --json]       Current topic comparison (comparison.json)
  sources | collect | unavailable | decide   See danseo topic collect --help
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
    throw new DanseoError('TOPIC_FILE', `Unable to read file: ${file} (${(error as NodeJS.ErrnoException).code})`, 3);
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { return invalid(`Check that this is valid UTF-8 JSON: ${file}`); }
}

// A number is assigned on first appearance. The selection points to the edition shown when chosen.
function overview(topic: Topic) {
  const catalog = new Map<string, CatalogEntry>();
  const sourceKeys = new Map<string, string>();
  const searches = topic.searches.map((search, index) => {
    const seen = new Set<string>();
    const papers = search.papers.map(paper => {
      const url = new URL(paper.source).href;
      if (seen.has(paper.key) || (sourceKeys.has(url) && sourceKeys.get(url) !== paper.key))
        invalid('Duplicate paper or source registered under another number. Check the existing key.');
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
    if (!paper) invalid('The selected edition is no longer connected correctly to its search record.');
    return { ...paper, round: choice.round, note: choice.note };
  });
  if (new Set(selected.map(row => row.key)).size !== selected.length) invalid('Duplicate selection records.');
  return { catalog, result: { question: topic.question, searches, selected } };
}

function updateSelection(
  topic: Topic,
  catalog: ReadonlyMap<string, CatalogEntry>,
  action: 'select' | 'unselect',
  { ids, note, round: roundInput }: { ids?: string; note?: string; round?: string },
) {
  if (!ids || !/^\d+(,\d+)*$/.test(ids) || (note !== undefined && !note.trim())) invalid(topicHelp);

  const round = roundInput === undefined ? undefined : Number(roundInput);
  if (round !== undefined && (!Number.isSafeInteger(round) || round < 1 || round > topic.searches.length)) {
    invalid('The search round is not registered.');
  }

  const byNumber = new Map([...catalog.values()].map(entry => [entry.number, entry]));
  for (const number of new Set(ids.split(',').map(Number))) {
    const entry = byNumber.get(number);
    if (!entry) invalid(`Unregistered paper number: ${number}`);

    const { key, edition, source } = entry.paper;
    if (round !== undefined && !topic.searches[round - 1]!.papers.some(paper => paper.key === key)) {
      invalid(`Paper number absent from the specified round: ${number}`);
    }
    if (action === 'unselect') {
      topic.selected = topic.selected.filter(choice => choice.key !== key);
      continue;
    }
    if (topic.selected.some(choice => choice.key === key)) continue;

    if (round === undefined && topic.searches.some(search => search.papers.some(paper =>
      paper.key === key && (paper.edition !== edition || paper.source !== source)))) {
      invalid(`This candidate has a different source or edition. Specify --round for the displayed candidate ${number}.`);
    }
    topic.selected.push({ key, round: round ?? entry.round, note });
  }
}

async function readTopic(root: string): Promise<Topic> {
  const path = join(root, 'topic.json');
  if (!await exists(path)) invalid(`No saved topic exists. Check the topic folder or start with init: ${root}`);
  const data = await readJson(await writableFile(root, path));
  if (!validTopic(data)) invalid('Check the topic-file format and version.');
  return data;
}

export async function selectedTopic(root: string) {
  const { question, selected } = overview(await readTopic(root)).result;
  return { question, selected };
}

export async function runTopic(args: string[]) {
  try { return await executeTopic(args); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!(error instanceof DanseoError) && code && /^E[A-Z]+$/.test(code)) {
      throw new DanseoError('TOPIC_FILE', `Unable to access the topic file: ${(error as Error).message}`, 3);
    }
    throw error;
  }
}

async function executeTopic(args: string[]) {
  if (args[0] === 'compare') {
    const { runComparison } = await import('./comparison.js');
    return runComparison(args);
  }
  if (['analysis-open', 'analysis-save', 'analysis-list', 'comparison-input'].includes(args[0] ?? '')) {
    const { runAnalysis } = await import('./analysis.js');
    return runAnalysis(args);
  }
  if (['sources', 'collect', 'unavailable', 'decide'].includes(args[0] ?? '')) {
    const { runCollection } = await import('./collection.js');
    return runCollection(args);
  }
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
      if (await exists(path)) invalid('This topic already exists. Reopen it with show.');
      topic = { version: 1, question: values.question!.trim(), searches: [], selected: [] };
    } else {
      topic = await readTopic(root);
    }
    const current = overview(topic);
    if (action === 'show') {
      const { listAnalysisDocuments } = await import('./analysis.js');
      console.log(JSON.stringify({ ...current.result, analyses: await listAnalysisDocuments(root, current.result.selected) }, null, 2)); return;
    }
    if (action === 'search') {
      if (!values.input) invalid(topicHelp);
      const search = await readJson(values.input);
      if (!validSearch(search)) invalid(ajv.errorsText(validSearch.errors));
      if (!isDeepStrictEqual(topic.searches.at(-1), search)) topic.searches.push(search);
    }
    if (action === 'select' || action === 'unselect') {
      updateSelection(topic, current.catalog, action, values);
    }
    const { result } = overview(topic);
    await replaceTopicJson(root, path, topic);
    console.log(JSON.stringify(result, null, 2));
  } finally { await unlock?.(); }
}
