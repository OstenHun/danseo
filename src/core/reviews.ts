import { readFile, stat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { Ajv } from 'ajv';
import type { Card, Workspace } from './index.js';
import { claimFingerprint, canonical } from './claim-state.js';

type Evidence = { pdf_page: number; section: string; note: string };
type Verdict = 'supported' | 'partially_supported' | 'contradicted' | 'insufficient_evidence';
export type FrozenPaper = {
  paper_id: string;
  card_sha256: string;
  source: {
    version?: string;
    url?: string | null;
    pdf_sha256: string;
    text_sha256?: string | null;
  };
  claims: { id: string; statement: string; locators: unknown[] }[];
};
export type ReviewInput = { run_id: string; papers: FrozenPaper[] };
type Result = {
  input_sha256: string;
  reviewer: string;
  review_type: string;
  reviewed_at: string;
  claims: {
    paper_id: string;
    claim_id: string;
    verdict: Verdict;
    reason: string;
    evidence: Evidence[];
    required_changes: string[];
  }[];
  source_checks: { paper_id: string; pdf_sha256: string }[];
};
export type ClaimReview = Result['claims'][number] & {
  state: 'current' | 'stale';
  stale_reason?: string;
  run_id: string;
  reviewer: string;
  reviewed_at: string;
  review_type: string;
  input_sha256: string;
  result_sha256: string;
  source: { version?: string; url?: string | null };
};

const string = { type: 'string', minLength: 1, maxLength: 8192, pattern: '\\S' };
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const list = (items: object) => ({ type: 'array', maxItems: 1000, items });
const object = (properties: object, required: string[]) => ({
  type: 'object',
  properties,
  required,
});
const ajv = new Ajv({ strict: true });
const inputValid = ajv.compile(
  object(
    {
      run_id: string,
      papers: list(
        object(
          {
            paper_id: string,
            card_sha256: digest,
            source: object(
              {
                version: string,
                url: { anyOf: [string, { type: 'null' }] },
                pdf_sha256: digest,
                text_sha256: { anyOf: [digest, { type: 'null' }] },
              },
              ['pdf_sha256'],
            ),
            claims: list(
              object({ id: string, statement: string, locators: list({ type: 'object' }) }, [
                'id',
                'statement',
                'locators',
              ]),
            ),
          },
          ['paper_id', 'card_sha256', 'source', 'claims'],
        ),
      ),
    },
    ['run_id', 'papers'],
  ),
);
const resultValid = ajv.compile(
  object(
    {
      input_sha256: digest,
      reviewer: string,
      reviewed_at: string,
      review_type: { enum: ['independent-source-review', 'same-reviewer-delta'] },
      claims: list(
        object(
          {
            paper_id: string,
            claim_id: string,
            verdict: {
              enum: ['supported', 'partially_supported', 'contradicted', 'insufficient_evidence'],
            },
            reason: string,
            evidence: list(
              object({ pdf_page: { type: 'integer', minimum: 1 }, section: string, note: string }, [
                'pdf_page',
                'section',
                'note',
              ]),
            ),
            required_changes: list(string),
          },
          ['paper_id', 'claim_id', 'verdict', 'reason', 'evidence', 'required_changes'],
        ),
      ),
      source_checks: list(
        object({ paper_id: string, pdf_sha256: digest }, ['paper_id', 'pdf_sha256']),
      ),
    },
    ['input_sha256', 'reviewer', 'review_type', 'reviewed_at', 'claims', 'source_checks'],
  ),
);

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

export function validReviewTime(value: string) {
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! && !/T24:/.test(value);
}

async function readRegistered(root: string, entry: string) {
  const file = resolve(root, entry);
  const rel = relative(root, file);
  requireValue(
    !isAbsolute(entry) && rel !== '..' && !rel.startsWith(`..${sep}`),
    'Register review files with relative paths inside the workspace.',
  );
  const actual = relative(await realpath(root), await realpath(file));
  requireValue(
    !isAbsolute(actual) && actual !== '..' && !actual.startsWith(`..${sep}`),
    'The review file points outside the workspace.',
  );
  const info = await stat(file);
  requireValue(
    info.isFile() && info.size <= 2 * 1024 * 1024,
    'Check the review JSON file size and format.',
  );
  return readFile(file);
}

function verifyReviewedClaims(frozen: ReviewInput, review: Result) {
  const expectedClaims = frozen.papers.flatMap((paper) =>
    paper.claims.map((claim) => JSON.stringify([paper.paper_id, claim.id])),
  );
  const receivedClaims = review.claims.map((claim) =>
    JSON.stringify([claim.paper_id, claim.claim_id]),
  );
  const expectedIds = new Set(expectedClaims);
  const receivedIds = new Set(receivedClaims);
  requireValue(
    expectedIds.size === expectedClaims.length &&
      receivedIds.size === receivedClaims.length &&
      expectedIds.size === receivedIds.size &&
      receivedClaims.every((id) => expectedIds.has(id)),
    'Review claim IDs are missing, duplicated or unexpected.',
  );

  const paperIds = new Set(frozen.papers.map((paper) => paper.paper_id));
  requireValue(
    paperIds.size === frozen.papers.length,
    'Paper IDs are duplicated in the review input.',
  );
  for (const paper of frozen.papers) {
    const checks = review.source_checks.filter((check) => check.paper_id === paper.paper_id);
    requireValue(
      checks.length === 1 && checks[0]?.pdf_sha256 === paper.source.pdf_sha256,
      'The reviewer source hash differs from the frozen input.',
    );
  }
  requireValue(
    review.claims.every(
      (claim) => claim.verdict === 'insufficient_evidence' || claim.evidence.length,
    ),
    'The verdict has no source-evidence location.',
  );
}

async function readReviewRegistration(
  root: string,
  registration: NonNullable<Workspace['claim_reviews']>[number],
) {
  const inputBytes = await readRegistered(root, registration.input);
  const resultBytes = await readRegistered(root, registration.result);
  const resultHash = sha(resultBytes);
  requireValue(
    resultHash === registration.result_sha256,
    'The review-result file differs from its registered hash.',
  );

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const input: unknown = JSON.parse(decoder.decode(inputBytes));
  const result: unknown = JSON.parse(decoder.decode(resultBytes));
  requireValue(inputValid(input) && resultValid(result), 'Unsupported claim-review JSON format.');
  const frozen = input as ReviewInput;
  const review = result as Result;
  requireValue(
    sha(inputBytes) === review.input_sha256,
    'The frozen input hash differs from the review result.',
  );
  requireValue(
    validReviewTime(review.reviewed_at),
    'Use a real calendar date with Z or a UTC offset for the review time, with at most three fractional digits (milliseconds).',
  );
  verifyReviewedClaims(frozen, review);

  return { input: frozen, result: review, result_sha256: resultHash };
}

/** Shared hash/format checks. Invalid registrations never supply a historical baseline. */
export async function readVerifiedReviews(ws: Workspace) {
  const records: { input: ReviewInput; result: Result; result_sha256: string }[] = [];
  const warnings: string[] = [];
  for (const [index, registration] of (ws.claim_reviews ?? []).entries()) {
    try {
      records.push(await readReviewRegistration(ws.path, registration));
    } catch (error) {
      warnings.push(
        `Review record ${index + 1} could not be connected. ${(error as Error).message}`,
      );
    }
  }
  return { records, warnings };
}

type PaperSource = Extract<Card['data'], { type: 'paper' }>['source'];

// The first reason found wins. Every check still runs so a failed read is reported the same way.
async function originalFileStaleReason(
  cardPath: string,
  current: PaperSource,
  frozen: FrozenPaper['source'],
) {
  let reason = '';
  try {
    requireValue(current.path, 'The original PDF path is missing.');
    const original = await readFile(resolve(dirname(cardPath), current.path));
    if (sha(original) !== frozen.pdf_sha256) reason ||= 'The original PDF changed after review.';
    if (Boolean(current.text_path) !== Boolean(frozen.text_sha256)) {
      reason ||= 'Both the linked source-text hash and review-input hash are required.';
    } else if (current.text_path) {
      const sourceText = await readFile(resolve(dirname(cardPath), current.text_path));
      if (sha(sourceText) !== frozen.text_sha256)
        reason ||= 'The linked source text changed after review.';
    }
  } catch {
    reason ||= 'Unable to verify the current original-file hash.';
  }
  return reason;
}

async function sourceStaleReason(
  cardPath: string,
  current: PaperSource,
  frozen: FrozenPaper['source'],
  selectedPdfSha256: string,
) {
  const currentEdition = { version: current.version ?? null, url: current.url ?? null };
  const reviewedEdition = { version: frozen.version ?? null, url: frozen.url ?? null };
  let reason =
    canonical(currentEdition) !== canonical(reviewedEdition)
      ? 'The source edition or URL changed after review.'
      : '';
  if (frozen.pdf_sha256 !== selectedPdfSha256) {
    reason ||= 'The reviewed PDF differs from the source hash selected in this topic.';
  }
  const fileReason = await originalFileStaleReason(cardPath, current, frozen);
  return reason || fileReason;
}

type PaperData = Extract<Card['data'], { type: 'paper' }>;
type VerifiedReview = Awaited<ReturnType<typeof readVerifiedReviews>>['records'][number];

async function addRecordReviews(
  claims: Record<string, ClaimReview[]>,
  card: Card,
  paper: PaperData,
  { input, result: review, result_sha256 }: VerifiedReview,
  selectedPdfSha256: string,
) {
  const snapshot = input.papers.find((paperSnapshot) => paperSnapshot.paper_id === paper.id);
  if (!snapshot) return;

  const staleReason = await sourceStaleReason(
    card.path,
    paper.source,
    snapshot.source,
    selectedPdfSha256,
  );
  for (const judgment of review.claims) {
    if (judgment.paper_id !== paper.id) continue;
    const current = paper.claims?.find((claim) => claim.id === judgment.claim_id);
    if (!current) continue;
    // The validated claim IDs guarantee that this review has a matching frozen claim.
    const frozen = snapshot.claims.find((claim) => claim.id === judgment.claim_id)!;
    const changed = claimFingerprint(current) !== claimFingerprint(frozen);
    const reason =
      staleReason ||
      (changed ? 'The claim statement or source locations differ from the reviewed version.' : '');

    (claims[judgment.claim_id] ??= []).push({
      ...judgment,
      state: reason ? 'stale' : 'current',
      ...(reason ? { stale_reason: reason } : {}),
      run_id: input.run_id,
      reviewer: review.reviewer,
      reviewed_at: review.reviewed_at,
      review_type: review.review_type,
      input_sha256: review.input_sha256,
      result_sha256,
      source: { url: snapshot.source.url, version: snapshot.source.version },
    });
  }
}

/** Optional, explicit review records. Reading them never changes Paper or relation status. */
export async function loadClaimReviews(ws: Workspace, card: Card, selectedPdfSha256: string) {
  const output: { claims: Record<string, ClaimReview[]>; warnings: string[]; registered: number } =
    {
      claims: Object.create(null),
      warnings: [],
      registered: ws.claim_reviews?.length ?? 0,
    };
  if (card.data.type !== 'paper') return output;

  const paper = card.data;
  const verified = await readVerifiedReviews(ws);
  output.warnings.push(...verified.warnings);
  for (const record of verified.records) {
    await addRecordReviews(output.claims, card, paper, record, selectedPdfSha256);
  }
  for (const reviews of Object.values(output.claims)) {
    reviews.sort((a, b) => Date.parse(b.reviewed_at) - Date.parse(a.reviewed_at));
  }
  return output;
}
