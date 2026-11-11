import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import type { Card } from './index.js';

// Object key order and the order of locator/ref sets do not change their meaning.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
// Conditions, limits and extension fields are reviewed meaning too. Old narrow snapshots fail closed.
export { claimFingerprint } from './claim-state.js';
export type SourceState = { version: string | null; url: string | null; pdf_sha256: string | null; text_sha256: string | null; available: boolean };
export const sourceFingerprint = (source: {version?:string|null;url?:string|null;pdf_sha256?:string|null;text_sha256?:string|null}) => fingerprint({version:source.version??null,url:source.url??null,pdf_sha256:source.pdf_sha256??null,text_sha256:source.text_sha256??null});
async function hashFile(path: string) {
  const digest=createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
export async function readSourceState(card: Card): Promise<SourceState> {
  if(card.data.type!=='paper') throw new Error('Paper source required');
  const s=card.data.source;
  const state: SourceState={version:s.version??null,url:s.url??null,pdf_sha256:null,text_sha256:null,available:true};
  try {
    if(s.path) state.pdf_sha256=await hashFile(resolve(dirname(card.path),s.path));
    if(s.text_path) state.text_sha256=await hashFile(resolve(dirname(card.path),s.text_path));
  } catch { state.available=false; }
  return state;
}
export type RelationContent = {id:string;source:string;target:string;kind:string;origin:string;rationale:string;evidence_refs:{paper_id:string;claim_id:string}[]};
// A literal claim ID in the rationale is also an explicit dependency, not an inferred scientific relation.
export function referencedClaims(r:RelationContent,papers:{paper_id:string;claims:{id:string}[]}[]) {
  const refs=new Map(r.evidence_refs.map(ref=>[canonical([ref.paper_id,ref.claim_id]),ref]));
  const mentioned=new Set(r.rationale.match(/[A-Za-z0-9][A-Za-z0-9._-]*/g)??[]);
  for(const token of [...mentioned])mentioned.add(token.replace(/\.+$/,''));
  for(const p of papers)if([r.source,r.target].includes(p.paper_id))for(const c of p.claims)if(mentioned.has(c.id)){
    const ref={paper_id:p.paper_id,claim_id:c.id};refs.set(canonical([ref.paper_id,ref.claim_id]),ref);
  }
  return [...refs.values()];
}
export type RelationDependencies = {format:'relation-dependencies-1';relation_sha256:string;sources:{paper_id:string;sha256:string}[];claims:{paper_id:string;claim_id:string;sha256:string}[]};
export const relationFingerprint = (r:RelationContent) => fingerprint({id:r.id,source:r.source,target:r.target,kind:r.kind,origin:r.origin,rationale:r.rationale,evidence_refs:r.evidence_refs.map(canonical).sort()});
