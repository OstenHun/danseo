import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import type { Card } from './index.js';

import { canonical, claimFingerprint } from './claim-state.js';

export { canonical, claimFingerprint };

export const fingerprint = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
export type SourceState = {
  version: string | null;
  url: string | null;
  pdf_sha256: string | null;
  text_sha256: string | null;
  available: boolean;
};

export const sourceFingerprint = (source: {
  version?: string | null;
  url?: string | null;
  pdf_sha256?: string | null;
  text_sha256?: string | null;
}) =>
  fingerprint({
    version: source.version ?? null,
    url: source.url ?? null,
    pdf_sha256: source.pdf_sha256 ?? null,
    text_sha256: source.text_sha256 ?? null,
  });

async function hashFile(path: string) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
export async function readSourceState(card: Card): Promise<SourceState> {
  if (card.data.type !== 'paper') throw new Error('Paper source required');
  const s = card.data.source;
  const state: SourceState = {
    version: s.version ?? null,
    url: s.url ?? null,
    pdf_sha256: null,
    text_sha256: null,
    available: true,
  };
  try {
    if (s.path) state.pdf_sha256 = await hashFile(resolve(dirname(card.path), s.path));
    if (s.text_path) state.text_sha256 = await hashFile(resolve(dirname(card.path), s.text_path));
  } catch {
    state.available = false;
  }
  return state;
}
export type RelationContent = {
  id: string;
  source: string;
  target: string;
  kind: string;
  origin: string;
  rationale: string;
  evidence_refs: { paper_id: string; claim_id: string }[];
};
export type RelationDependencies = {
  format: 'relation-dependencies-1';
  relation_sha256: string;
  sources: { paper_id: string; sha256: string }[];
  claims: { paper_id: string; claim_id: string; sha256: string }[];
};

export const relationFingerprint = (relation: RelationContent) =>
  fingerprint({
    id: relation.id,
    source: relation.source,
    target: relation.target,
    kind: relation.kind,
    origin: relation.origin,
    rationale: relation.rationale,
    // Evidence references form a set. Ordinary arrays keep their original order.
    evidence_refs: relation.evidence_refs.map(canonical).sort(),
  });
