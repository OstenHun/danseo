import { readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Ajv } from 'ajv';
import { parseDocument } from 'yaml';
import { comparisonInput } from './analysis.js';
import { DanseoError, getCard, loadWorkspace, type Card } from './index.js';
import { canonical, claimFingerprint, readSourceState, sourceFingerprint, relationFingerprint,
  type RelationContent, type RelationDependencies } from './dependencies.js';
import { writableFile } from './storage.js';
import { validReviewTime } from './reviews.js';

export type Relation = RelationContent & { status: 'proposed' | 'source-checked'; created_by: string;
  snapshots: { source: string; target: string; dependencies?: RelationDependencies };
  review?: { checked_by: string; checked_at: string } };
const ajv = new Ajv({ allErrors: true });
const relationValid = ajv.compile(JSON.parse(await readFile(new URL('../../schemas/relations.schema.json', import.meta.url), 'utf8')));
const text = { type: 'string', pattern: '\\S', maxLength: 2000 };
const configValid = ajv.compile<{ version: 1; question: string; criteria: { id: string; title: string; rationale: string;
  refs: { key: string; claim_id: string }[] }[] }>({ type: 'object', additionalProperties: false,
  required: ['version', 'question', 'criteria'], properties: { version: { const: 1 }, question: { type: 'string', pattern: '\\S' },
    criteria: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'object', additionalProperties: false,
      required: ['id', 'title', 'rationale', 'refs'], properties: { id: { ...text, pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$' },
        title: text, rationale: text, refs: { type: 'array', maxItems: 1000, uniqueItems: true, items: { type: 'object',
          additionalProperties: false, required: ['key', 'claim_id'], properties: { key: text, claim_id: text } } } } } } } });
function invalid(message: string): never { throw new DanseoError('COMPARISON', message); }
async function readSmall(path: string) {
  const bytes = await readFile(path);
  if (bytes.length > 2 * 1024 * 1024) invalid('Each comparison input file must be at most 2 MiB.');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
}

// Reuse relations-1 and its dependency fingerprints; never manufacture a source relation from similarity.
export async function relationState(relation: Relation, cards: Map<string, Card>, currentRefs: Set<string>) {
  const source = cards.get(relation.source), target = cards.get(relation.target);
  if (!source || !target || source === target) invalid('Check both Paper endpoints and the relation direction.');
  if (relation.status === 'source-checked' && (relation.origin !== 'source' || relation.kind === 'reading-order'
    || !relation.review || !validReviewTime(relation.review.checked_at)
    || !relation.evidence_refs.some(ref => ref.paper_id === relation.source))) invalid('A source relation requires checked evidence from the source paper and the checker identity and time.');
  const inputs = [...cards.values()].map(card => ({ paper_id: card.data.id, claims: card.data.type === 'paper' ? card.data.claims ?? [] : [] }));
  // Only explicit qualified refs establish dependencies; ordinary words in a rationale are not claim IDs.
  const refs = relation.evidence_refs;
  const originLabel = relation.origin === 'ai' ? 'AI proposal' : relation.status === 'source-checked' ? 'Source relation' : 'Source proposal · unchecked';
  const prior = relation.snapshots.dependencies;
  const missing = refs.filter(ref => !inputs.find(p => p.paper_id === ref.paper_id)?.claims.some(c => c.id === ref.claim_id));
  if (refs.some(ref => ![relation.source, relation.target].includes(ref.paper_id))
    || missing.some(ref => prior && !prior.claims.some(old => old.paper_id === ref.paper_id && old.claim_id === ref.claim_id))) invalid('The relation references an unregistered claim.');
  // A previously pinned claim can be withdrawn. Hold that relationship without blocking unrelated evidence.
  if (missing.length) return { ...relation, origin_label: originLabel, needs_recheck: true, current_dependencies: null };
  const sourceStates = await Promise.all([source, target].map(readSourceState));
  const current: RelationDependencies = { format: 'relation-dependencies-1', relation_sha256: relationFingerprint(relation),
    sources: [source, target].map((card, i) => ({ paper_id: card.data.id, sha256: sourceFingerprint(sourceStates[i]!) })),
    claims: refs.map(ref => ({ ...ref, sha256: claimFingerprint(inputs.find(p => p.paper_id === ref.paper_id)!.claims.find(c => c.id === ref.claim_id)!) })) };
  const same = (a: unknown[], b: unknown[]) => canonical(a.map(canonical).sort()) === canonical(b.map(canonical).sort());
  const stale = sourceStates.some(state => !state.available) || refs.some(ref => !currentRefs.has(canonical([ref.paper_id, ref.claim_id])))
    || !prior || prior.relation_sha256 !== current.relation_sha256 || !same(prior.sources, current.sources) || !same(prior.claims, current.claims);
  return { ...relation, origin_label: originLabel, needs_recheck: stale, current_dependencies: current };
}

/** Fresh projection, scoped to the selected topic. No saved graph is authoritative. */
export async function buildComparison(root: string) {
  root = await realpath(root);
  const input = await comparisonInput(root);
  const config: unknown = JSON.parse(await readSmall(await writableFile(root, join(root, 'comparison.json'))));
  if (!configValid(config)) invalid('Check the question, criteria, AI grouping rationale and claim references in comparison.json.');
  if (config.question !== input.question) invalid('The comparison question differs from the current topic. Rebuild it for this topic.');
  if (new Set(config.criteria.map(c => c.id)).size !== config.criteria.length) invalid('Comparison criterion IDs are duplicated.');
  const selected = new Set(input.papers.map(p => p.key));
  if (config.criteria.some(c => c.refs.some(ref => !selected.has(ref.key)))) invalid('Comparison can include only papers selected in this topic.');
  const cards = new Map<string, Card>(), roots = new Set<string>();
  for (const paper of input.papers) {
    if (!paper.workspace || !paper.paper_id) continue;
    const card = getCard(await loadWorkspace(paper.workspace), paper.paper_id, 'paper');
    if (card.sha256 !== paper.card_sha256) invalid('A card changed while preparing the comparison. Reopen it.');
    if (cards.has(paper.paper_id)) invalid('Comparison Paper IDs are duplicated. Check stable IDs for separate editions.');
    cards.set(paper.paper_id, card); roots.add(paper.workspace);
  }
  const currentRefs = new Set(input.claims.map(c => canonical([c.paper_id, c.claim_id])));
  const criteria = config.criteria.map(criterion => ({ ...criterion, origin: 'ai' as const,
    groups: input.papers.map(paper => ({ key: paper.key, claims: input.claims.filter(claim => claim.key === paper.key
      && criterion.refs.some(ref => ref.key === claim.key && ref.claim_id === claim.claim_id)) })) }));
  const relations = [], heldRelations: { id: string; reason: string; current_dependencies: RelationDependencies | null }[] = [];
  const seen = new Set<string>();
  for (const workspace of roots) {
    const manifest = JSON.parse(await readSmall(join(workspace, 'workspace.json')));
    if (!manifest.relations) continue;
    if (typeof manifest.relations !== 'string') invalid('Specify one relation file in workspace.relations.');
    const doc = parseDocument(await readSmall(await writableFile(workspace, resolve(workspace, manifest.relations))), { uniqueKeys: true });
    if (doc.errors.length || doc.warnings.length) invalid('Unable to read the relation YAML.');
    const data = doc.toJS({ maxAliasCount: 0 });
    if (!relationValid(data)) invalid('Expected relations-1 format.');
    for (const relation of (data as { relations: Relation[] }).relations) {
      // Other topics' relations stay outside this view, even in a shared workspace.
      if (!cards.has(relation.source) || !cards.has(relation.target)) continue;
      if (seen.has(relation.id)) invalid('Relation IDs are duplicated.');
      seen.add(relation.id);
      const state = await relationState(relation, cards, currentRefs);
      if (state.needs_recheck) heldRelations.push({ id: relation.id, reason: 'Recheck the relation or its source and claim evidence', current_dependencies: state.current_dependencies });
      else relations.push(state);
    }
  }
  return { version: 1, mode: 'research-comparison', question: input.question, papers: input.papers, criteria, relations,
    claims: input.claims, held: input.held, held_relations: heldRelations, generated_at: new Date().toISOString(),
    scope: 'current-supported-claims; AI-grouped-criteria; no-ranking' };
}
export type Comparison = Awaited<ReturnType<typeof buildComparison>>;

export async function runComparison(args: string[]) {
  const help = 'danseo topic compare --dir <topic-folder> [--port 0]\nReads comparison.json and current analysis/reviews. Loopback, read-only; Ctrl+C stops.';
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return; }
  const { values } = parseArgs({ args: args.slice(1), options: { dir: { type: 'string' }, port: { type: 'string' }, json: { type: 'boolean' } } });
  if (!values.dir || values.port !== undefined && !/^\d+$/.test(values.port)) invalid(help);
  const root = await realpath(values.dir);
  if (values.json) { console.log(JSON.stringify(await buildComparison(root), null, 2)); return; }
  const port = Number(values.port ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) invalid(help);
  const { serveComparison } = await import('../web/comparison-server.js');
  await serveComparison(root, port);
}
