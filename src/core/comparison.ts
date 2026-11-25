import { readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Ajv } from 'ajv';
import { parseDocument } from 'yaml';
import { comparisonInput } from './analysis.js';
import { DanseoError, getCard, loadWorkspace, type Card } from './index.js';
import {
  canonical,
  claimFingerprint,
  readSourceState,
  sourceFingerprint,
  relationFingerprint,
  type RelationContent,
  type RelationDependencies,
} from './dependencies.js';
import { writableFile } from './storage.js';
import { validReviewTime } from './reviews.js';

export type Relation = RelationContent & {
  status: 'proposed' | 'source-checked';
  created_by: string;
  snapshots: { source: string; target: string; dependencies?: RelationDependencies };
  review?: { checked_by: string; checked_at: string };
};

type ComparisonInput = Awaited<ReturnType<typeof comparisonInput>>;
type ComparisonConfig = {
  version: 1;
  question: string;
  criteria: {
    id: string;
    title: string;
    rationale: string;
    refs: { key: string; claim_id: string }[];
  }[];
};

const ajv = new Ajv({ allErrors: true });
const relationSchema = new URL('../../schemas/relations.schema.json', import.meta.url);
const relationValid = ajv.compile(JSON.parse(await readFile(relationSchema, 'utf8')));
const criterionText = { type: 'string', pattern: '\\S', maxLength: 2000 };
const configValid = ajv.compile<ComparisonConfig>({
  type: 'object',
  additionalProperties: false,
  required: ['version', 'question', 'criteria'],
  properties: {
    version: { const: 1 },
    question: { type: 'string', pattern: '\\S' },
    criteria: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'rationale', 'refs'],
        properties: {
          id: { ...criterionText, pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$' },
          title: criterionText,
          rationale: criterionText,
          refs: {
            type: 'array',
            maxItems: 1000,
            uniqueItems: true,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['key', 'claim_id'],
              properties: { key: criterionText, claim_id: criterionText },
            },
          },
        },
      },
    },
  },
});

function invalid(message: string): never {
  throw new DanseoError('COMPARISON', message);
}

async function readSmall(path: string) {
  const bytes = await readFile(path);
  if (bytes.length > 2 * 1024 * 1024) invalid('Each comparison input file must be at most 2 MiB.');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
}

type EvidenceRef = Relation['evidence_refs'][number];
type SourceState = Awaited<ReturnType<typeof readSourceState>>;

// A source relation needs evidence from the source paper and the checker identity and time.
function rejectUncheckedSourceRelation(relation: Relation) {
  if (
    relation.status === 'source-checked' &&
    (relation.origin !== 'source' ||
      relation.kind === 'reading-order' ||
      !relation.review ||
      !validReviewTime(relation.review.checked_at) ||
      !relation.evidence_refs.some((ref) => ref.paper_id === relation.source))
  ) {
    invalid(
      'A source relation requires checked evidence from the source paper and the checker identity and time.',
    );
  }
}

function originLabel(relation: Relation) {
  if (relation.origin === 'ai') return 'AI proposal';
  return relation.status === 'source-checked' ? 'Source relation' : 'Source proposal · unchecked';
}

function claimIndex(cards: Map<string, Card>) {
  return [...cards.values()].map((card) => ({
    paper_id: card.data.id,
    claims: card.data.type === 'paper' ? (card.data.claims ?? []) : [],
  }));
}
type ClaimIndex = ReturnType<typeof claimIndex>;

function missingRefs(refs: EvidenceRef[], papers: ClaimIndex) {
  return refs.filter(
    (ref) =>
      !papers
        .find((paper) => paper.paper_id === ref.paper_id)
        ?.claims.some((claim) => claim.id === ref.claim_id),
  );
}

// A missing claim is allowed only when the relation pinned it before, so it was withdrawn.
function rejectUnregisteredRefs(
  relation: Relation,
  refs: EvidenceRef[],
  missing: EvidenceRef[],
  prior: RelationDependencies | undefined,
) {
  const refersOutsideEndpoints = refs.some(
    (ref) => ![relation.source, relation.target].includes(ref.paper_id),
  );
  if (
    refersOutsideEndpoints ||
    missing.some(
      (ref) =>
        prior &&
        !prior.claims.some((old) => old.paper_id === ref.paper_id && old.claim_id === ref.claim_id),
    )
  ) {
    invalid('The relation references an unregistered claim.');
  }
}

function currentDependencies(
  relation: Relation,
  refs: EvidenceRef[],
  endpoints: Card[],
  sourceStates: SourceState[],
  papers: ClaimIndex,
): RelationDependencies {
  return {
    format: 'relation-dependencies-1',
    relation_sha256: relationFingerprint(relation),
    sources: endpoints.map((card, index) => ({
      paper_id: card.data.id,
      sha256: sourceFingerprint(sourceStates[index]!),
    })),
    claims: refs.map((ref) => {
      const paper = papers.find((paper) => paper.paper_id === ref.paper_id)!;
      const claim = paper.claims.find((claim) => claim.id === ref.claim_id)!;
      return { ...ref, sha256: claimFingerprint(claim) };
    }),
  };
}

const sameDependencies = (a: unknown[], b: unknown[]) =>
  canonical(a.map(canonical).sort()) === canonical(b.map(canonical).sort());

function dependenciesStale(
  refs: EvidenceRef[],
  prior: RelationDependencies | undefined,
  sourceStates: SourceState[],
  currentRefs: Set<string>,
  current: RelationDependencies,
) {
  return (
    sourceStates.some((state) => !state.available) ||
    refs.some((ref) => !currentRefs.has(canonical([ref.paper_id, ref.claim_id]))) ||
    !prior ||
    prior.relation_sha256 !== current.relation_sha256 ||
    !sameDependencies(prior.sources, current.sources) ||
    !sameDependencies(prior.claims, current.claims)
  );
}

export async function relationState(
  relation: Relation,
  cards: Map<string, Card>,
  currentRefs: Set<string>,
) {
  const source = cards.get(relation.source);
  const target = cards.get(relation.target);
  if (!source || !target || source === target) {
    invalid('Check both Paper endpoints and the relation direction.');
  }
  rejectUncheckedSourceRelation(relation);

  const papers = claimIndex(cards);
  // Only explicit qualified refs establish dependencies.
  const refs = relation.evidence_refs;
  const label = originLabel(relation);
  const prior = relation.snapshots.dependencies;
  const missing = missingRefs(refs, papers);
  rejectUnregisteredRefs(relation, refs, missing, prior);
  // A previously pinned claim can be withdrawn without blocking unrelated evidence.
  if (missing.length) {
    return {
      ...relation,
      origin_label: label,
      needs_recheck: true,
      current_dependencies: null,
    };
  }

  const endpoints = [source, target];
  const sourceStates = await Promise.all(endpoints.map(readSourceState));
  const current = currentDependencies(relation, refs, endpoints, sourceStates, papers);
  const stale = dependenciesStale(refs, prior, sourceStates, currentRefs, current);
  return {
    ...relation,
    origin_label: label,
    needs_recheck: stale,
    current_dependencies: current,
  };
}
async function readComparisonConfig(root: string, input: ComparisonInput) {
  const path = await writableFile(root, join(root, 'comparison.json'));
  const config: unknown = JSON.parse(await readSmall(path));
  if (!configValid(config)) {
    invalid(
      'Check the question, criteria, AI grouping rationale and claim references in comparison.json.',
    );
  }
  if (config.question !== input.question) {
    invalid('The comparison question differs from the current topic. Rebuild it for this topic.');
  }
  if (new Set(config.criteria.map((criterion) => criterion.id)).size !== config.criteria.length) {
    invalid('Comparison criterion IDs are duplicated.');
  }
  const selectedKeys = new Set(input.papers.map((paper) => paper.key));
  for (const criterion of config.criteria) {
    if (criterion.refs.some((ref) => !selectedKeys.has(ref.key))) {
      invalid('Comparison can include only papers selected in this topic.');
    }
  }
  return config;
}

async function loadSelectedCards(papers: ComparisonInput['papers']) {
  const cards = new Map<string, Card>();
  const workspaces = new Set<string>();
  for (const paper of papers) {
    if (!paper.workspace || !paper.paper_id) continue;
    const card = getCard(await loadWorkspace(paper.workspace), paper.paper_id, 'paper');
    if (card.sha256 !== paper.card_sha256) {
      invalid('A card changed while preparing the comparison. Reopen it.');
    }
    if (cards.has(paper.paper_id)) {
      invalid('Comparison Paper IDs are duplicated. Check stable IDs for separate editions.');
    }
    cards.set(paper.paper_id, card);
    workspaces.add(paper.workspace);
  }
  return { cards, workspaces };
}

async function readComparisonRelations(
  workspaces: Set<string>,
  cards: Map<string, Card>,
  currentRefs: Set<string>,
) {
  const relations = [];
  const heldRelations: {
    id: string;
    reason: string;
    current_dependencies: RelationDependencies | null;
  }[] = [];
  const seenIds = new Set<string>();

  for (const workspace of workspaces) {
    const manifest = JSON.parse(await readSmall(join(workspace, 'workspace.json')));
    if (!manifest.relations) continue;
    if (typeof manifest.relations !== 'string')
      invalid('Specify one relation file in workspace.relations.');

    const path = await writableFile(workspace, resolve(workspace, manifest.relations));
    const document = parseDocument(await readSmall(path), { uniqueKeys: true });
    if (document.errors.length || document.warnings.length)
      invalid('Unable to read the relation YAML.');
    const data = document.toJS({ maxAliasCount: 0 });
    if (!relationValid(data)) invalid('Expected relations-1 format.');

    for (const relation of (data as { relations: Relation[] }).relations) {
      // A shared workspace can also contain relations belonging to other topics.
      if (!cards.has(relation.source) || !cards.has(relation.target)) continue;
      if (seenIds.has(relation.id)) invalid('Relation IDs are duplicated.');
      seenIds.add(relation.id);

      const state = await relationState(relation, cards, currentRefs);
      if (state.needs_recheck) {
        heldRelations.push({
          id: relation.id,
          reason: 'Recheck the relation or its source and claim evidence',
          current_dependencies: state.current_dependencies,
        });
      } else {
        relations.push(state);
      }
    }
  }
  return { relations, heldRelations };
}

/** Fresh projection, scoped to the selected topic. No saved graph is authoritative. */
export async function buildComparison(root: string) {
  const topicRoot = await realpath(root);
  const input = await comparisonInput(topicRoot);
  const config = await readComparisonConfig(topicRoot, input);
  const { cards, workspaces } = await loadSelectedCards(input.papers);

  const currentRefs = new Set(
    input.claims.map((claim) => canonical([claim.paper_id, claim.claim_id])),
  );
  const criteria = config.criteria.map((criterion) => ({
    ...criterion,
    origin: 'ai' as const,
    groups: input.papers.map((paper) => ({
      key: paper.key,
      claims: input.claims.filter(
        (claim) =>
          claim.key === paper.key &&
          criterion.refs.some((ref) => ref.key === claim.key && ref.claim_id === claim.claim_id),
      ),
    })),
  }));
  const { relations, heldRelations } = await readComparisonRelations(
    workspaces,
    cards,
    currentRefs,
  );

  return {
    version: 1,
    mode: 'research-comparison',
    question: input.question,
    papers: input.papers,
    criteria,
    relations,
    claims: input.claims,
    held: input.held,
    held_relations: heldRelations,
    generated_at: new Date().toISOString(),
    scope: 'current-supported-claims; AI-grouped-criteria; no-ranking',
  };
}

export type Comparison = Awaited<ReturnType<typeof buildComparison>>;

export async function runComparison(args: string[]) {
  const help =
    'danseo topic compare --dir <topic-folder> [--port 0]\nReads comparison.json and current analysis/reviews. Loopback, read-only; Ctrl+C stops.';
  if (args.includes('--help') || args.includes('-h')) {
    console.log(help);
    return;
  }
  const { values } = parseArgs({
    args: args.slice(1),
    options: { dir: { type: 'string' }, port: { type: 'string' }, json: { type: 'boolean' } },
  });
  if (!values.dir || (values.port !== undefined && !/^\d+$/.test(values.port))) invalid(help);
  const root = await realpath(values.dir);
  if (values.json) {
    console.log(JSON.stringify(await buildComparison(root), null, 2));
    return;
  }
  const port = Number(values.port ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) invalid(help);
  const { serveComparison } = await import('../web/comparison-server.js');
  await serveComparison(root, port);
}
