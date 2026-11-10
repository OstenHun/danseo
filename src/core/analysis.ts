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
import { loadClaimReviews } from './reviews.js';

type Source = Awaited<ReturnType<typeof sourceCollection>>['ready'][number];
type Revision = { round: number; edition: string; pdf_sha256: string; workspace: string; paper_id: string; answered: boolean; comparison_claims: string[] };
type Session = { version: 1; key: string; revisions: Revision[] };
type Document = { raw: string; body: string; state: Session; sha256: string };
const text = { type: 'string', pattern: '\\S', maxLength: 65536 };
const ids = { type: 'array', uniqueItems: true, maxItems: 1000, items: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$' } };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) =>
  ({ type: 'object', properties, required, additionalProperties: false });
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const validateSession = new Ajv().compile<Session>(object({ version: { const: 1 }, key: text,
  revisions: { type: 'array', minItems: 1, maxItems: 1000, items: object({ round: { type: 'integer', minimum: 1 },
    edition: text, pdf_sha256: digest, workspace: text, paper_id: ids.items, answered: { type: 'boolean' }, comparison_claims: ids }) } }));
type Answer = { overview?: string; question: string; answer: string; interpretation: string; remaining_questions: string; resume: string; claim_ids: string[]; comparison_claims: string[] };
const validateAnswer = new Ajv().compile<Answer>(object({ overview: { ...text, maxLength: 2000 }, question: text, answer: text,
  interpretation: text, remaining_questions: text, resume: text, claim_ids: ids, comparison_claims: ids },
  ['question', 'answer', 'interpretation', 'remaining_questions', 'resume', 'claim_ids', 'comparison_claims']));
const help = `danseo topic <action> --dir <topic-folder>
  analysis-open --id N [--workspace <cards-folder> --paper <Paper ID>]
  analysis-save --id N --sha <document SHA-256> --input <answer JSON>
  analysis-list
  comparison-input
First open needs a registered native Paper with source.version and source.path matching ready.
The agent reads the actual PDF and writes the card; these commands do not summarize it.
Each paper has one Markdown document per topic; replies append and preserve notes.
comparison-input includes only current supported claim reviews, never whole-card status alone.`;
function invalid(message: string): never { throw new DanseoError('ANALYSIS', message); }
const nameFor = (key: string) => `analysis-${sha256(Buffer.from(key))}.md`;

async function readDocument(root: string, key: string): Promise<Document | undefined> {
  const path = join(root, nameFor(key));
  if (!await exists(path)) return;
  const bytes = await readFile(await writableFile(root, path));
  if (bytes.length > 2 * 1024 * 1024) invalid('분석 문서가 2 MiB를 넘습니다. 기존 문서를 보존하고 범위를 확인하세요.');
  const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!match) invalid('분석 문서의 연결 정보가 없습니다. 원본을 보존하고 확인하세요.');
  const doc = parseDocument(match[1]!, { uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length) invalid('분석 문서의 연결 정보가 손상되었습니다.');
  const state: unknown = doc.toJS({ maxAliasCount: 0 });
  if (!validateSession(state) || state.key !== key) invalid('논문과 분석 문서의 연결 정보가 다릅니다.');
  return { raw, body: raw.slice(match[0].length), state, sha256: sha256(bytes) };
}

async function saveDocument(root: string, key: string, state: Session, body: string, before?: Document) {
  const path = join(root, nameFor(key));
  const bytes = `---\n${JSON.stringify(state, null, 2)}\n---\n${body}`;
  if (Buffer.byteLength(bytes) > 2 * 1024 * 1024) invalid('분석 문서가 2 MiB를 넘습니다. 기존 문서를 보존하세요.');
  async function checkCurrent() {
    const current = await readDocument(root, key);
    if (current?.sha256 !== before?.sha256) invalid('분석 문서가 바뀌었습니다. 다시 열어 메모와 답을 확인하세요.');
  }
  await checkCurrent();
  if (before) {
    const backup = join(root, `${nameFor(key)}.${before.sha256}.bak`);
    if (await exists(backup)) {
      if (sha256(await readFile(await writableFile(root, backup))) !== before.sha256) invalid('기존 분석 백업이 다릅니다. 원본을 비교하세요.');
    } else await writeFile(backup, before.raw, { flag: 'wx', mode: 0o600 });
  }
  const temp = join(root, `.analysis-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
    await checkCurrent();
    await rename(temp, path);
  } finally { await rm(temp, { force: true }); }
  return (await readDocument(root, key))!;
}

function currentRevision(doc: Document) { return doc.state.revisions.at(-1)!; }
function sameSource(revision: Revision, source: Source) {
  return revision.round === source.paper.round && revision.edition === source.file.edition && revision.pdf_sha256 === source.file.sha256;
}
async function boundPaper(revision: Revision, source: Source) {
  const workspace = await loadWorkspace(revision.workspace);
  const card = getCard(workspace, revision.paper_id, 'paper');
  if (card.data.type !== 'paper') invalid('Paper 카드가 필요합니다.');
  const src = card.data.source;
  if (src.version !== source.file.edition || !src.path || sha256(await readFile(resolve(dirname(card.path), src.path))) !== source.file.sha256)
    invalid('Paper의 판본·원본 PDF가 분석 가능한 원문과 다릅니다. 해당 논문의 원문을 다시 확인하세요.');
  return { workspace, card };
}
async function readySource(root: string, number: number) {
  const collection = await sourceCollection(root);
  const source = collection.ready.find(s => s.paper.number === number);
  if (!source) invalid('분석 가능한 원문이 없습니다. topic sources에서 PDF·판본·초고 응답을 다시 확인하세요.');
  return { source, question: collection.question };
}
function context(root: string, source: Source, question: string, document: Document) {
  return { question, paper: source.paper, file: source.file, document: join(root, nameFor(source.paper.key)),
    document_sha256: document.sha256, markdown: document.raw, binding: currentRevision(document),
    scope: 'agent-reading-required' };
}

/** Topic navigation only; opening the document still rechecks the collected PDF. */
export async function listAnalysisDocuments(root: string, papers: SelectedPaper[]) {
  const rows = [];
  for (const paper of papers) {
    const document = await readDocument(root, paper.key);
    rows.push({ number: paper.number, key: paper.key, round: paper.round, document: document ? join(root, nameFor(paper.key)) : null,
      ...(document ? { binding: currentRevision(document), document_sha256: document.sha256 } : {}) });
  }
  return rows;
}

function replyBlock(input: Answer, revision: Revision) {
  const refs = input.claim_ids.map(id => `- ${revision.paper_id}/${id}`).join('\n') || '연결한 주장 없음. 원문으로 답할 수 있는 범위를 확인하세요.';
  return `\n## ${input.question}\n\n${input.overview ? `### 짧은 개요\n\n${input.overview}\n\n` : ''}### 주제 질문에 대한 답\n\n${input.answer}\n\n### AI 해석\n\n${input.interpretation}\n\n### Paper 근거\n\n${refs}\n\n### 남은 질문\n\n${input.remaining_questions}\n\n### 다음에 읽을 위치\n\n${input.resume}\n`;
}

async function comparisonInput(root: string) {
  const collection = await sourceCollection(root);
  const included = [], held = [];
  for (const paper of (await selectedTopic(root)).selected) {
    const doc = await readDocument(root, paper.key);
    if (!doc) { held.push({ key: paper.key, reason: '분석 문서 없음' }); continue; }
    const revision = currentRevision(doc);
    const source = collection.ready.find(s => s.paper.key === paper.key);
    if (!source || !sameSource(revision, source)) { held.push({ key: paper.key, reason: '원문·판본·선택 회차 재확인 필요' }); continue; }
    let bound: Awaited<ReturnType<typeof boundPaper>>;
    try { bound = await boundPaper(revision, source); }
    catch (error) { held.push({ key: paper.key, reason: (error as Error).message }); continue; }
    const { card, workspace } = bound;
    const reviews = await loadClaimReviews(workspace, card);
    const claims = card.data.type === 'paper' ? card.data.claims ?? [] : [];
    if (!revision.comparison_claims.length) held.push({ key: paper.key, reason: '비교 후보 주장 없음' });
    for (const claimId of revision.comparison_claims) {
      const claim = claims.find(c => c.id === claimId);
      // The newest recorded verdict wins, including stale or negative verdicts.
      const entries = reviews.claims[claimId] ?? [];
      const review = entries[0];
      const tied = review && entries.slice(1).some(entry => Date.parse(entry.reviewed_at) === Date.parse(review.reviewed_at) && canonical(entry) !== canonical(review));
      const reason = reviews.warnings.length ? '검토 기록의 무결성을 다시 확인하세요.' : !claim ? '주장이 삭제되었습니다.' : tied ? '같은 시각의 검토가 중복됩니다.'
        : !review ? '원문 대조 기록 없음' : review.state !== 'current' ? review.stale_reason
        : review.verdict !== 'supported' ? review.verdict : review.required_changes.length ? '검토의 필수 수정이 남았습니다.'
        : card.data.type === 'paper' && card.data.review.status === 'needs-recheck' ? 'Paper 재확인 필요' : undefined;
      if (reason) { held.push({ key: paper.key, paper_id: revision.paper_id, claim_id: claimId, reason, warnings: reviews.warnings }); continue; }
      included.push({ key: paper.key, paper_id: revision.paper_id, claim_id: claimId, claim,
        source: { edition: source.file.edition, path: source.file.path, sha256: source.file.sha256 },
        document: join(root, nameFor(paper.key)), document_sha256: doc.sha256, review });
    }
  }
  return { version: 1, question: collection.question, claims: included, held, scope: 'current-supported-claims-only; no-comparison-relations' };
}

export async function runAnalysis([action = '', ...args]: string[]) {
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return; }
  const { values: v } = parseArgs({ args, options: Object.fromEntries(['dir', 'id', 'workspace', 'paper', 'sha', 'input'].map(k => [k, { type: 'string' as const }])) });
  const allowed: Record<string, string[]> = { 'analysis-open': ['id', 'workspace', 'paper'], 'analysis-save': ['id', 'sha', 'input'], 'analysis-list': [], 'comparison-input': [] };
  if (!v.dir || !Object.hasOwn(allowed, action) || Object.entries(v).some(([k, value]) => !value?.trim() || k !== 'dir' && !allowed[action]!.includes(k))) invalid(help);
  const root = await realpath(v.dir);
  const unlock = ['analysis-open', 'analysis-save'].includes(action) ? await workspaceLock(root) : undefined;
  try {
    if (action === 'analysis-list') { console.log(JSON.stringify(await listAnalysisDocuments(root, (await selectedTopic(root)).selected), null, 2)); return; }
    if (action === 'comparison-input') { console.log(JSON.stringify(await comparisonInput(root), null, 2)); return; }
    const id = Number(v.id);
    if (!Number.isSafeInteger(id) || id < 1) invalid(help);
    const { source, question } = await readySource(root, id);
    let doc = await readDocument(root, source.paper.key);
    if (action === 'analysis-open') {
      const current = doc ? currentRevision(doc) : undefined;
      if (!!v.workspace !== !!v.paper) invalid('카드 저장 위치와 Paper ID를 함께 지정하세요.');
      const revision: Revision = { round: source.paper.round, edition: source.file.edition, pdf_sha256: source.file.sha256,
        workspace: v.workspace ? await realpath(v.workspace) : current?.workspace ?? '', paper_id: v.paper ?? current?.paper_id ?? '', answered: false, comparison_claims: [] };
      if (!revision.workspace || !revision.paper_id) invalid('처음 분석할 때 --workspace와 --paper로 공통 카드 위치를 연결하세요. 카드 작성은 docs/PAPER_ANALYSIS.md를 따릅니다.');
      if (current && sameSource(current, source) && (current.workspace !== revision.workspace || current.paper_id !== revision.paper_id)) invalid('같은 판본의 기존 Paper 연결을 보존하세요.');
      await boundPaper(revision, source);
      if (!doc || !sameSource(current!, source)) {
        const state: Session = doc ? { ...doc.state, revisions: [...doc.state.revisions, revision] } : { version: 1, key: source.paper.key, revisions: [revision] };
        const body = (doc?.body ?? `# ${source.paper.title}\n\n요약: 이 주제의 질문에 대한 답과 남은 질문을 같은 논문 문서에서 이어간다. 공통 주장·조건·원문 위치는 연결한 Paper 카드를 따른다.\n`)
          + `\n## 분석 판본: ${source.file.edition}\n\nPDF SHA-256: ${source.file.sha256}\n\n주제 질문: ${question}\n\n선택 이유: ${source.paper.note ?? source.paper.reason}\n\nPaper: ${revision.paper_id}\n`;
        doc = await saveDocument(root, source.paper.key, state, body, doc);
      }
    } else {
      if (!doc || !sameSource(currentRevision(doc), source)) invalid('현재 판본을 analysis-open으로 먼저 열어 기존 답과 메모를 확인하세요.');
      if (v.sha !== doc.sha256 || !v.input) invalid('분석 문서를 다시 열고 현재 SHA-256과 답 JSON을 지정하세요.');
      const bytes = await readFile(v.input);
      if (bytes.length > 512 * 1024) invalid('답 JSON이 512 KiB를 넘습니다.');
      const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!validateAnswer(input)) invalid('답 JSON의 개요·답·AI 해석·남은 질문·재개 위치·주장 ID를 확인하세요.');
      if (input.overview && /\n\s*\n/.test(input.overview)) invalid('전체 개요는 짧은 한 문단으로 적으세요.');
      const revision = currentRevision(doc);
      if (!revision.answered && !input.overview) invalid('이 판본의 첫 답에는 연구 질문·방법·주요 결과의 짧은 개요가 필요합니다.');
      const { card } = await boundPaper(revision, source);
      checkReferences(input, card);
      const state = structuredClone(doc.state);
      const saved = state.revisions.at(-1)!;
      saved.answered = true;
      saved.comparison_claims = input.comparison_claims;
      doc = await saveDocument(root, source.paper.key, state, doc.body + replyBlock(input, revision), doc);
    }
    console.log(JSON.stringify(context(root, source, question, doc!), null, 2));
  } finally { await unlock?.(); }
}

function checkReferences(input: Answer, card: Card) {
  const claims = card.data.type === 'paper' ? card.data.claims ?? [] : [];
  if (input.claim_ids.some(id => !claims.some(c => c.id === id)) || input.comparison_claims.some(id => !input.claim_ids.includes(id)))
    invalid('답과 비교 후보에는 연결한 Paper의 실제 주장 ID를 사용하세요.');
}
