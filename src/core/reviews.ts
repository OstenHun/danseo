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

const string = { type: 'string', minLength: 1, maxLength: 8192, pattern: '\\S' };
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
export function validReviewTime(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! && !/T24:/.test(value);
}
async function readRegistered(root: string, entry: string) {
  const file = resolve(root, entry), rel = relative(root, file);
  requireValue(!isAbsolute(entry) && rel !== '..' && !rel.startsWith(`..${sep}`), 'Register review files with relative paths inside the workspace.');
  const actual = relative(await realpath(root), await realpath(file));
  requireValue(!isAbsolute(actual) && actual !== '..' && !actual.startsWith(`..${sep}`), 'The review file points outside the workspace.');
  const info = await stat(file);
  requireValue(info.isFile() && info.size <= 2 * 1024 * 1024, 'Check the review JSON file size and format.');
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
      requireValue(sha(resultBytes) === registration.result_sha256, 'The review-result file differs from its registered hash.');
      const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inputBytes));
      const result: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(resultBytes));
      requireValue(inputValid(input) && resultValid(result), 'Unsupported claim-review JSON format.');
      const frozen = input as ReviewInput, review = result as Result;
      requireValue(sha(inputBytes) === review.input_sha256, 'The frozen input hash differs from the review result.');
      requireValue(validReviewTime(review.reviewed_at), 'Use a real calendar date with Z or a UTC offset for the review time, with at most three fractional digits (milliseconds).');
      const expected = frozen.papers.flatMap(p => p.claims.map(c => JSON.stringify([p.paper_id,c.id])));
      const received = review.claims.map(c => JSON.stringify([c.paper_id,c.claim_id]));
      requireValue(new Set(expected).size === expected.length && new Set(received).size === received.length && JSON.stringify(expected.sort()) === JSON.stringify(received.sort()), 'Review claim IDs are missing, duplicated or unexpected.');
      requireValue(new Set(frozen.papers.map(p=>p.paper_id)).size===frozen.papers.length, 'Paper IDs are duplicated in the review input.');
      for(const p of frozen.papers){
        const checks=review.source_checks.filter(s=>s.paper_id===p.paper_id);
        requireValue(checks.length===1 && checks[0]!.pdf_sha256===p.source.pdf_sha256,'The reviewer source hash differs from the frozen input.');
      }
      requireValue(review.claims.every(c=>c.verdict==='insufficient_evidence'||c.evidence.length),'The verdict has no source-evidence location.');
      records.push({input:frozen,result:review,result_sha256:sha(resultBytes)});
    } catch(error){warnings.push(`Review record ${index+1} could not be connected. ${(error as Error).message}`);}
  }
  return {records,warnings};
}

/** Optional, explicit review records. Reading them never changes Paper or relation status. */
export async function loadClaimReviews(ws: Workspace, card: Card, selectedPdfSha256: string) {
  const output: { claims: Record<string, ClaimReview[]>; warnings: string[]; registered: number } = { claims: Object.create(null), warnings: [], registered: ws.claim_reviews?.length ?? 0 };
  if (card.data.type !== 'paper') return output;
  const paper = card.data, verified=await readVerifiedReviews(ws);
  output.warnings.push(...verified.warnings);
  for(const {input:frozen,result:review,result_sha256} of verified.records){
      const snapshots = frozen.papers.filter(p => p.paper_id === paper.id);
      const snapshot = snapshots[0]; if (!snapshot) continue;
      let staleReason = canonical({version:paper.source.version??null,url:paper.source.url??null}) !== canonical({version:snapshot.source.version??null,url:snapshot.source.url??null}) ? 'The source edition or URL changed after review.' : '';
      if (snapshot.source.pdf_sha256 !== selectedPdfSha256) staleReason ||= 'The reviewed PDF differs from the source hash selected in this topic.';
      try {
        requireValue(paper.source.path, 'The original PDF path is missing.');
        if (sha(await readFile(resolve(dirname(card.path), paper.source.path!))) !== snapshot.source.pdf_sha256) staleReason ||= 'The original PDF changed after review.';
        if (Boolean(paper.source.text_path) !== Boolean(snapshot.source.text_sha256)) staleReason ||= 'Both the linked source-text hash and review-input hash are required.';
        else if (paper.source.text_path && sha(await readFile(resolve(dirname(card.path), paper.source.text_path))) !== snapshot.source.text_sha256) staleReason ||= 'The linked source text changed after review.';
      } catch { staleReason ||= 'Unable to verify the current original-file hash.'; }
      // Build entries only after the entire registration is validated; never leave partial badges.
      const entries: [string, ClaimReview][] = [];
      for (const judged of review.claims.filter(c => c.paper_id === paper.id)) {
        const current = paper.claims?.find(c => c.id === judged.claim_id);
        if (!current) continue;
        const before = snapshot.claims.find(c => c.id === judged.claim_id)!;
        const changed = claimFingerprint(current)!==claimFingerprint(before);
        const reason = staleReason || (changed ? 'The claim statement or source locations differ from the reviewed version.' : '');
        requireValue(judged.verdict === 'insufficient_evidence' || judged.evidence.length, 'The verdict has no source-evidence location.');
        entries.push([judged.claim_id, { ...judged, state: reason ? 'stale' : 'current', ...(reason ? { stale_reason: reason } : {}), run_id: frozen.run_id, reviewer: review.reviewer, reviewed_at: review.reviewed_at, review_type: review.review_type, input_sha256: review.input_sha256, result_sha256, source: { url: snapshot.source.url, version: snapshot.source.version } }]);
      }
      for (const [id, entry] of entries) (output.claims[id] ??= []).push(entry);
  }
  for (const entries of Object.values(output.claims)) entries.sort((a,b) => Date.parse(b.reviewed_at) - Date.parse(a.reviewed_at));
  return output;
}
