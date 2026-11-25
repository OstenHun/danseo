import { mkdir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { Ajv } from 'ajv';
import { DanseoError } from './index.js';
import { bibliographicIdentity, parseRis } from './ris.js';
import { exists, replaceTopicJson, workspaceLock, writableFile } from './storage.js';

type Paper = {
  key: string;
  title: string;
  authors: string;
  year: number;
  source: string;
  edition: string | null;
  doi?: string;
  arxiv?: string;
  reason: string;
  scope: 'abstract' | 'full-text' | 'bibliography';
};
type Search = { query: string; papers: Paper[] };
type Choice = { key: string; round: number; note?: string; edition?: string };
type Topic = { version: 1; question: string; searches: Search[]; selected: Choice[] };
type CatalogEntry = { number: number; round: number; paper: Paper };
export type SelectedPaper = Paper & { number: number; round: number; note?: string };

const topicHelp = `Usage: danseo topic <action> --dir <topic-folder>
  init --question <original question>
  search --input <JSON file containing query and papers>
  import --input <UTF-8 RIS file>
  select --ids <stable numbers, comma-separated> [--round <shown search round>] [--note <reader's reason>] [--edition <expected edition for one imported paper>]
  unselect --ids <stable numbers, comma-separated>
  show
  compare [--port 0 | --json]       Current topic comparison (comparison.json)
  sources | collect | unavailable | decide   See danseo topic collect --help
All actions return JSON. Search uses candidates verified by the chat agent.`;
const ajv = new Ajv();
const nonblank = { type: 'string', pattern: '\\S' };
const maxSearchCandidates = 5;
const searchSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['query', 'papers'],
  properties: {
    query: nonblank,
    papers: {
      type: 'array',
      // Both input and saved topics use this schema. Only bibliography rounds can be larger.
      anyOf: [
        { maxItems: maxSearchCandidates },
        { items: { type: 'object', properties: { scope: { const: 'bibliography' } } } },
      ],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'title', 'authors', 'year', 'source', 'edition', 'reason', 'scope'],
        if: { properties: { scope: { const: 'bibliography' } } },
        else: { properties: { edition: nonblank } },
        properties: {
          key: nonblank,
          title: nonblank,
          authors: nonblank,
          year: { type: 'integer', minimum: 1, maximum: 9999 },
          source: { type: 'string', format: 'paper-url' },
          edition: { anyOf: [nonblank, { type: 'null' }] },
          doi: nonblank,
          arxiv: nonblank,
          reason: nonblank,
          scope: { enum: ['abstract', 'full-text', 'bibliography'] },
        },
      },
    },
  },
};
ajv.addFormat('paper-url', (value: string) => {
  try {
    const url = new URL(value);
    return /^https?:\/\//i.test(value) && !/\s/.test(value) && !url.username && !url.password;
  } catch {
    return false;
  }
});
const validSearch = ajv.compile<Search>(searchSchema);
const validTopic = ajv.compile<Topic>({
  type: 'object',
  additionalProperties: false,
  required: ['version', 'question', 'searches', 'selected'],
  properties: {
    version: { const: 1 },
    question: nonblank,
    searches: { type: 'array', items: searchSchema },
    selected: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'round'],
        properties: {
          key: nonblank,
          round: { type: 'integer', minimum: 1 },
          note: nonblank,
          edition: nonblank,
        },
      },
    },
  },
});

function invalid(message: string): never {
  throw new DanseoError('TOPIC', message);
}
async function readUtf8(file: string, format: 'JSON' | 'RIS') {
  let raw: Buffer;
  try {
    raw = await readFile(file);
  } catch (error) {
    throw new DanseoError(
      'TOPIC_FILE',
      `Unable to read file: ${file} (${(error as NodeJS.ErrnoException).code})`,
      3,
    );
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    return invalid(`Check that this is valid UTF-8 ${format}: ${file}`);
  }
}

async function readJson(file: string): Promise<unknown> {
  const text = await readUtf8(file, 'JSON');
  try {
    return JSON.parse(text);
  } catch {
    return invalid(`Check that this is valid UTF-8 JSON: ${file}`);
  }
}

function topicArxivIds(topic: Topic) {
  const papers = topic.searches.flatMap((search) => search.papers);
  const importedKeys = new Set(
    papers.filter((paper) => paper.scope === 'bibliography').map((paper) => paper.key),
  );
  const ids = new Map<string, string>();
  for (const paper of papers) {
    if (!importedKeys.has(paper.key)) continue;
    const id = bibliographicIdentity(paper).arxiv;
    if (!id) continue;
    const previous = ids.get(paper.key);
    if (previous && previous !== id)
      invalid('Different arXiv works are recorded under the same RIS-linked paper.');
    ids.set(paper.key, id);
  }
  return ids;
}

// A number is assigned on first appearance. The selection points to the edition shown when chosen.
function overview(topic: Topic) {
  const catalog = new Map<string, CatalogEntry>();
  const sourceKeys = new Map<string, string>();
  const searches = topic.searches.map((search, index) => {
    const seen = new Set<string>();
    const papers = search.papers.map((paper) => {
      const url = new URL(paper.source).href;
      if (seen.has(paper.key) || (sourceKeys.has(url) && sourceKeys.get(url) !== paper.key))
        invalid(
          'Duplicate paper or source registered under another number. Check the existing key.',
        );
      seen.add(paper.key);
      sourceKeys.set(url, paper.key);
      const number = catalog.get(paper.key)?.number ?? catalog.size + 1;
      catalog.set(paper.key, { number, round: index + 1, paper });
      return { number, ...paper };
    });
    return { round: index + 1, query: search.query, papers };
  });
  const arxivIds = topicArxivIds(topic);
  const selected = topic.selected.map((choice) => {
    const paper = searches[choice.round - 1]?.papers.find((row) => row.key === choice.key);
    if (!paper)
      invalid('The selected edition is no longer connected correctly to its search record.');
    if (choice.edition !== undefined && (paper.scope !== 'bibliography' || paper.edition !== null))
      invalid('An expected edition can only fill an unknown imported edition.');
    const arxiv = paper.arxiv ?? arxivIds.get(choice.key);
    return {
      ...paper,
      ...(arxiv ? { arxiv } : {}),
      edition: choice.edition ?? paper.edition,
      round: choice.round,
      note: choice.note,
    };
  });
  if (new Set(selected.map((row) => row.key)).size !== selected.length)
    invalid('Duplicate selection records.');
  return { catalog, result: { question: topic.question, searches, selected } };
}

function selectionRound(topic: Topic, roundInput: string | undefined) {
  const round = roundInput === undefined ? undefined : Number(roundInput);
  if (
    round !== undefined &&
    (!Number.isSafeInteger(round) || round < 1 || round > topic.searches.length)
  ) {
    invalid('The search round is not registered.');
  }
  return round;
}

function addChoice(
  topic: Topic,
  entry: CatalogEntry,
  number: number,
  round: number | undefined,
  note: string | undefined,
  expectedEdition: string | undefined,
) {
  const { key, edition, source, scope } = entry.paper;
  const existing = topic.selected.find((choice) => choice.key === key);
  if (existing) {
    if (expectedEdition !== undefined && expectedEdition !== existing.edition)
      invalid('Unselect the paper before setting a different expected edition.');
    return;
  }
  if (expectedEdition !== undefined && (scope !== 'bibliography' || edition !== null))
    invalid('An expected edition can only fill an unknown imported edition.');

  if (
    round === undefined &&
    topic.searches.some((search) =>
      search.papers.some(
        (paper) => paper.key === key && (paper.edition !== edition || paper.source !== source),
      ),
    )
  ) {
    invalid(
      `This candidate has a different source or edition. Specify --round for the displayed candidate ${number}.`,
    );
  }
  topic.selected.push({ key, round: round ?? entry.round, note, edition: expectedEdition });
}

function updateSelection(
  topic: Topic,
  catalog: ReadonlyMap<string, CatalogEntry>,
  action: 'select' | 'unselect',
  {
    ids,
    note,
    round: roundInput,
    edition,
  }: {
    ids?: string;
    note?: string;
    round?: string;
    edition?: string;
  },
) {
  if (!ids || !/^\d+(,\d+)*$/.test(ids) || (note !== undefined && !note.trim())) invalid(topicHelp);

  const round = selectionRound(topic, roundInput);

  const byNumber = new Map([...catalog.values()].map((entry) => [entry.number, entry]));
  const numbers = new Set(ids.split(',').map(Number));
  if (edition !== undefined && (!edition.trim() || numbers.size !== 1))
    invalid('Specify a non-empty expected edition for one imported paper.');
  for (const number of numbers) {
    const entry = byNumber.get(number);
    if (!entry) invalid(`Unregistered paper number: ${number}`);

    const { key } = entry.paper;
    const shown =
      round === undefined
        ? entry.paper
        : topic.searches[round - 1]!.papers.find((paper) => paper.key === key);
    if (!shown) {
      invalid(`Paper number absent from the specified round: ${number}`);
    }
    if (action === 'unselect') {
      topic.selected = topic.selected.filter((choice) => choice.key !== key);
      continue;
    }
    addChoice(topic, { ...entry, paper: shown }, number, round, note, edition?.trim());
  }
}

async function readTopic(root: string): Promise<Topic> {
  const path = join(root, 'topic.json');
  if (!(await exists(path)))
    invalid(`No saved topic exists. Check the topic folder or start with init: ${root}`);
  const data = await readJson(await writableFile(root, path));
  if (!validTopic(data)) invalid('Check the topic-file format and version.');
  return data;
}

export async function selectedTopic(root: string) {
  const { question, selected } = overview(await readTopic(root)).result;
  return { question, selected };
}

export async function runTopic(args: string[]) {
  try {
    return await executeTopic(args);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!(error instanceof DanseoError) && code && /^E[A-Z]+$/.test(code)) {
      throw new DanseoError(
        'TOPIC_FILE',
        `Unable to access the topic file: ${(error as Error).message}`,
        3,
      );
    }
    throw error;
  }
}

const analysisActions = ['analysis-open', 'analysis-save', 'analysis-list', 'comparison-input'];
const collectionActions = ['sources', 'collect', 'unavailable', 'decide'];

const optionsByTopicAction: Record<string, string[]> = {
  init: ['question'],
  search: ['input'],
  import: ['input'],
  select: ['ids', 'note', 'round', 'edition'],
  unselect: ['ids'],
  show: [],
};

function parseTopicOptions(args: string[]) {
  return parseArgs({
    args,
    options: {
      dir: { type: 'string' },
      question: { type: 'string' },
      input: { type: 'string' },
      ids: { type: 'string' },
      note: { type: 'string' },
      round: { type: 'string' },
      edition: { type: 'string' },
    },
  }).values;
}

// Returns the action, its options and the checked topic folder.
function parseTopicArguments(args: string[]) {
  const [action, ...rest] = args;
  const values = parseTopicOptions(rest);
  if (
    !action ||
    !Object.hasOwn(optionsByTopicAction, action) ||
    !values.dir?.trim() ||
    Object.keys(values).some((key) => key !== 'dir' && !optionsByTopicAction[action]!.includes(key))
  )
    invalid(topicHelp);
  return { action, values, dir: values.dir };
}

async function createTopic(path: string, question: string): Promise<Topic> {
  if (await exists(path)) invalid('This topic already exists. Reopen it with show.');
  return { version: 1, question: question.trim(), searches: [], selected: [] };
}

async function showTopic(root: string, result: ReturnType<typeof overview>['result']) {
  const { listAnalysisDocuments } = await import('./analysis.js');
  console.log(
    JSON.stringify(
      {
        ...result,
        analyses: await listAnalysisDocuments(root, result.selected),
      },
      null,
      2,
    ),
  );
}

function addSearch(topic: Topic, search: unknown, action: 'search' | 'import') {
  if (!validSearch(search)) invalid(ajv.errorsText(validSearch.errors));
  if (
    action === 'search' &&
    search.papers.some(
      (paper) =>
        paper.scope === 'bibliography' || paper.doi !== undefined || paper.arxiv !== undefined,
    )
  )
    invalid('Use topic import to add an RIS bibliography and its identifiers.');
  if (!isDeepStrictEqual(topic.searches.at(-1), search)) topic.searches.push(search);
}

type BibliographicIdentity = ReturnType<typeof bibliographicIdentity>;

function sameWorkIdentifier(imported: BibliographicIdentity, known: BibliographicIdentity) {
  return (
    (imported.doi !== undefined && imported.doi === known.doi) ||
    (imported.arxiv !== undefined && imported.arxiv === known.arxiv)
  );
}

// Keep every matching key: an alias shared by two existing works must still be rejected.
class BibliographyIndex {
  private readonly keysByAlias = new Map<string, Set<string>>();
  private readonly historyByKey = new Map<string, BibliographicIdentity[]>();

  private aliases(identity: BibliographicIdentity) {
    const aliases = ['source:' + identity.source];
    if (identity.doi) aliases.push('doi:' + identity.doi);
    if (identity.arxiv) aliases.push('arxiv:' + identity.arxiv);
    return aliases;
  }

  add(identity: BibliographicIdentity) {
    const history = this.historyByKey.get(identity.key);
    if (history) history.push(identity);
    else this.historyByKey.set(identity.key, [identity]);
    for (const alias of this.aliases(identity)) {
      const keys = this.keysByAlias.get(alias);
      if (keys) keys.add(identity.key);
      else this.keysByAlias.set(alias, new Set([identity.key]));
    }
  }

  match(identity: BibliographicIdentity, record: number) {
    const matches = new Set<string>();
    if (this.historyByKey.has(identity.key)) matches.add(identity.key);
    for (const alias of this.aliases(identity)) {
      for (const key of this.keysByAlias.get(alias) ?? []) matches.add(key);
    }
    if (matches.size > 1) invalid(`RIS record ${record}: identifiers conflict across papers.`);
    const key = matches.values().next().value ?? identity.key;
    return { key, history: this.historyByKey.get(key) ?? [] };
  }
}

function knownIdentifier(
  identities: BibliographicIdentity[],
  field: 'doi' | 'arxiv',
  record: number,
) {
  const values = new Set(
    identities.map((identity) => identity[field]).filter((value) => value !== undefined),
  );
  if (values.size > 1) invalid(`RIS record ${record}: identifiers conflict for the same paper.`);
  return values.values().next().value;
}

function linkImportedPaper(paper: Paper, index: BibliographyIndex, record: number) {
  const imported = bibliographicIdentity(paper);
  const { key, history } = index.match(imported, record);
  const sameSource = history.filter((known) => known.source === imported.source);
  if (
    sameSource.length &&
    !sameSource.some((known) => known.title === imported.title) &&
    !history.some((known) => sameWorkIdentifier(imported, known))
  )
    invalid(`RIS record ${record}: the source is already registered for a different paper title.`);
  const identities = [imported, ...history];
  const doi = knownIdentifier(identities, 'doi', record);
  const arxiv = knownIdentifier(identities, 'arxiv', record);
  paper.key = key;
  if (doi && !paper.doi) paper.doi = doi;
  if (arxiv && !paper.arxiv) paper.arxiv = arxiv;
}

async function importSearch(input: string, topic: Topic) {
  const papers = parseRis(await readUtf8(input, 'RIS'));
  const index = new BibliographyIndex();
  for (const search of topic.searches) {
    for (const paper of search.papers) index.add(bibliographicIdentity(paper));
  }
  const firstRecord = new Map<string, number>();
  for (const [offset, paper] of papers.entries()) {
    const record = offset + 1;
    linkImportedPaper(paper, index, record);
    const earlier = firstRecord.get(paper.key);
    if (earlier !== undefined)
      invalid(`RIS records ${earlier} and ${record} describe the same paper.`);
    firstRecord.set(paper.key, record);
    index.add(bibliographicIdentity(paper));
  }
  return { query: 'Imported RIS bibliography', papers };
}

async function readSearchInput(
  action: 'search' | 'import',
  input: string | undefined,
  topic: Topic,
) {
  if (!input) invalid(topicHelp);
  return action === 'search' ? readJson(input) : importSearch(input, topic);
}

// Help and argument checks run synchronously when called, before the first await.
async function runTopicAction(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(topicHelp);
    return;
  }
  const { action, values, dir } = parseTopicArguments(args);
  let question = '';
  if (action === 'init') {
    if (!values.question?.trim()) invalid(topicHelp);
    question = values.question;
    await mkdir(dir, { recursive: true });
  }
  const root = await realpath(dir);
  const path = join(root, 'topic.json');
  const unlock = action === 'show' ? undefined : await workspaceLock(root);
  try {
    const topic = action === 'init' ? await createTopic(path, question) : await readTopic(root);
    const current = overview(topic);
    if (action === 'show') {
      await showTopic(root, current.result);
      return;
    }
    if (action === 'search' || action === 'import')
      addSearch(topic, await readSearchInput(action, values.input, topic), action);
    if (action === 'select' || action === 'unselect') {
      updateSelection(topic, current.catalog, action, values);
    }
    const { result } = overview(topic);
    await replaceTopicJson(root, path, topic);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await unlock?.();
  }
}

// Actions owned by other modules are loaded only when requested.
async function executeTopic(args: string[]) {
  const action = args[0] ?? '';
  if (action === 'compare') return (await import('./comparison.js')).runComparison(args);
  if (analysisActions.includes(action)) return (await import('./analysis.js')).runAnalysis(args);
  if (collectionActions.includes(action))
    return (await import('./collection.js')).runCollection(args);
  return runTopicAction(args);
}
