import { readFile, stat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { Ajv } from 'ajv';
import type { Card, Workspace } from './index.js';
import { claimFingerprint, canonical } from './claim-state.js';

type Evidence = { pdf_page: number; section: string; note: string };
type Verdict = 'supported' | 'partially_supported' | 'contradicted' | 'insufficient_evidence';
export type FrozenPaper = { paper_id: string; card_sha256: string; source: { version?: string; url?: string | null; pdf_sha256: string; text_sha256?: string | null }; claims: { id: string; statement: string; locators: unknown[] }[] };
export type ReviewInput = { run_id: string; papers: FrozenPaper[] };
type Result = { input_sha256: string; reviewer: string; review_type: string; reviewed_at: string; claims: { paper_id: string; claim_id: string; verdict: Verdict; reason: string; evidence: Evidence[]; required_changes: string[] }[]; source_checks: { paper_id: string; pdf_sha256: string }[] };
export type ClaimReview = Result['claims'][number] & { state: 'current' | 'stale'; stale_reason?: string; run_id: string; reviewer: string; reviewed_at: string; review_type: string; input_sha256: string; result_sha256: string; source: { version?: string; url?: string | null } };

const string = { type: 'string', minLength: 1, maxLength: 8192 };
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const list = (items: object) => ({ type: 'array', maxItems: 1000, items });
const object = (properties: object, required: string[]) => ({ type: 'object', properties, required });
const ajv = new Ajv({ strict: true });
const inputValid = ajv.compile(object({
  run_id: string,
  papers: list(object({ paper_id: string, card_sha256: digest,
    source: object({ version: string, url: { anyOf: [string, { type: 'null' }] }, pdf_sha256: digest, text_sha256: { anyOf: [digest, { type: 'null' }] } }, ['pdf_sha256']),
    claims: list(object({ id: string, statement: string, locators: list({ type: 'object' }) }, ['id','statement','locators']))
  }, ['paper_id','card_sha256','source','claims']))
}, ['run_id','papers']));
const resultValid = ajv.compile(object({
  input_sha256: digest, reviewer: string, reviewed_at: string,
  review_type: { enum: ['independent-source-review','same-reviewer-delta'] },
  claims: list(object({ paper_id: string, claim_id: string, verdict: { enum: ['supported','partially_supported','contradicted','insufficient_evidence'] }, reason: string,
    evidence: list(object({ pdf_page: { type: 'integer', minimum: 1 }, section: string, note: string }, ['pdf_page','section','note'])),
    required_changes: list(string)
  }, ['paper_id','claim_id','verdict','reason','evidence','required_changes'])),
  source_checks: list(object({ paper_id: string, pdf_sha256: digest }, ['paper_id','pdf_sha256']))
}, ['input_sha256','reviewer','review_type','reviewed_at','claims','source_checks']));

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const requireValue = (value: unknown, message: string) => { if (!value) throw new Error(message); };
async function readRegistered(root: string, entry: string) {
  const file = resolve(root, entry), rel = relative(root, file);
  requireValue(!isAbsolute(entry) && rel !== '..' && !rel.startsWith(`..${sep}`), '검토 파일은 workspace 안의 상대 경로로 등록하세요.');
  const actual = relative(await realpath(root), await realpath(file));
  requireValue(!isAbsolute(actual) && actual !== '..' && !actual.startsWith(`..${sep}`), '검토 파일이 workspace 밖을 가리킵니다.');
  const info = await stat(file);
  requireValue(info.isFile() && info.size <= 2 * 1024 * 1024, '검토 JSON 파일 크기 또는 형식을 확인하세요.');
  return readFile(file);
}

/** Shared hash/format checks. Invalid registrations never supply a historical baseline. */
export async function readVerifiedReviews(ws: Workspace) {
  const records: {input:ReviewInput;result:Result;result_sha256:string}[]=[];
  const warnings:string[]=[];
  for (const [index, registration] of (ws.claim_reviews ?? []).entries()) {
    try {
      const inputBytes = await readRegistered(ws.path, registration.input);
      const resultBytes = await readRegistered(ws.path, registration.result);
      requireValue(sha(resultBytes) === registration.result_sha256, '등록한 검토 결과 해시와 파일이 다릅니다.');
      const input: unknown = JSON.parse(inputBytes.toString('utf8').replace(/^\uFEFF/, ''));
      const result: unknown = JSON.parse(resultBytes.toString('utf8').replace(/^\uFEFF/, ''));
      requireValue(inputValid(input) && resultValid(result), '지원하는 주장 검토 JSON 형식이 아닙니다.');
      const frozen = input as ReviewInput, review = result as Result;
      requireValue(sha(inputBytes) === review.input_sha256, '고정 입력 해시가 검토 결과와 다릅니다.');
      requireValue(Number.isFinite(Date.parse(review.reviewed_at)), '검토 시각을 확인하세요.');
      const expected = frozen.papers.flatMap(p => p.claims.map(c => JSON.stringify([p.paper_id,c.id])));
      const received = review.claims.map(c => JSON.stringify([c.paper_id,c.claim_id]));
      requireValue(new Set(expected).size === expected.length && new Set(received).size === received.length && JSON.stringify(expected.sort()) === JSON.stringify(received.sort()), '검토 주장 ID에 누락·중복·다른 항목이 있습니다.');
      requireValue(new Set(frozen.papers.map(p=>p.paper_id)).size===frozen.papers.length, '논문 ID가 검토 입력에서 중복됩니다.');
      for(const p of frozen.papers){
        const checks=review.source_checks.filter(s=>s.paper_id===p.paper_id);
        requireValue(checks.length===1 && checks[0]!.pdf_sha256===p.source.pdf_sha256,'검토자의 원문 해시가 고정 입력과 다릅니다.');
      }
      requireValue(review.claims.every(c=>c.verdict==='insufficient_evidence'||c.evidence.length),'판정의 원문 근거 위치가 없습니다.');
      records.push({input:frozen,result:review,result_sha256:sha(resultBytes)});
    } catch(error){warnings.push(`검토 기록 ${index+1}을 연결하지 못했습니다. ${(error as Error).message}`);}
  }
  return {records,warnings};
}

/** Optional, explicit review records. Reading them never changes Paper or relation status. */
export async function loadClaimReviews(ws: Workspace, card: Card) {
  const output: { claims: Record<string, ClaimReview[]>; warnings: string[]; registered: number } = { claims: Object.create(null), warnings: [], registered: ws.claim_reviews?.length ?? 0 };
  if (card.data.type !== 'paper') return output;
  const paper = card.data, verified=await readVerifiedReviews(ws);
  output.warnings.push(...verified.warnings);
  for(const {input:frozen,result:review,result_sha256} of verified.records){
      const snapshots = frozen.papers.filter(p => p.paper_id === paper.id);
      const snapshot = snapshots[0]; if (!snapshot) continue;
      let staleReason = canonical({version:paper.source.version??null,url:paper.source.url??null}) !== canonical({version:snapshot.source.version??null,url:snapshot.source.url??null}) ? '검토 이후 원문 판본 또는 URL이 바뀌었습니다.' : '';
      try {
        requireValue(paper.source.path, '원본 PDF 경로가 없습니다.');
        if (sha(await readFile(resolve(dirname(card.path), paper.source.path!))) !== snapshot.source.pdf_sha256) staleReason ||= '검토 이후 원본 PDF가 바뀌었습니다.';
        if (snapshot.source.text_sha256 && (!paper.source.text_path || sha(await readFile(resolve(dirname(card.path), paper.source.text_path))) !== snapshot.source.text_sha256)) staleReason ||= '검토 이후 연결 원문 텍스트가 바뀌었습니다.';
      } catch { staleReason ||= '원본 파일의 현재 해시를 확인하지 못했습니다.'; }
      // Build entries only after the entire registration is validated; never leave partial badges.
      const entries: [string, ClaimReview][] = [];
      for (const judged of review.claims.filter(c => c.paper_id === paper.id)) {
        const current = paper.claims?.find(c => c.id === judged.claim_id);
        if (!current) continue;
        const before = snapshot.claims.find(c => c.id === judged.claim_id)!;
        const changed = claimFingerprint(current)!==claimFingerprint(before);
        const reason = staleReason || (changed ? '검토한 주장 문장 또는 원문 위치와 다릅니다.' : '');
        requireValue(judged.verdict === 'insufficient_evidence' || judged.evidence.length, '판정의 원문 근거 위치가 없습니다.');
        entries.push([judged.claim_id, { ...judged, state: reason ? 'stale' : 'current', ...(reason ? { stale_reason: reason } : {}), run_id: frozen.run_id, reviewer: review.reviewer, reviewed_at: review.reviewed_at, review_type: review.review_type, input_sha256: review.input_sha256, result_sha256, source: { url: snapshot.source.url, version: snapshot.source.version } }]);
      }
      for (const [id, entry] of entries) (output.claims[id] ??= []).push(entry);
  }
  for (const entries of Object.values(output.claims)) entries.sort((a,b) => Date.parse(b.reviewed_at) - Date.parse(a.reviewed_at));
  return output;
}
