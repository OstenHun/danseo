import type { Card, Workspace } from '../../dist/core/index.js';
import type { ClaimReview } from '../../dist/core/reviews.js';
import type { sourceCollection } from '../../dist/core/collection.js';
import type { selectedTopic, SelectedPaper } from '../../dist/core/topic.js';
import type { comparisonInput, listAnalysisDocuments } from '../../dist/core/analysis.js';
import type { Comparison } from '../../dist/core/comparison.js';

export type FixtureKey = 'A' | 'B';
export type Collection = Awaited<ReturnType<typeof sourceCollection>>;
export type FixtureFile = Pick<Collection['ready'][number]['file'], 'edition' | 'path'>;
export type FixtureClaim = NonNullable<Extract<Card['data'], { type: 'paper' }>['claims']>[number];
export type FixturePaper = {
  id: string;
  path: string;
  data: Omit<Extract<Card['data'], { type: 'paper' }>, 'source' | 'claims'> & {
    schema_version: 'draft-2';
    source: { version: string; path: string; url: string; text_path?: string };
    claims: FixtureClaim[];
  };
  save(): void;
};
export type FixtureConfig = {
  schema_version: 'workspace-1';
  records: string[];
  projects: Workspace['projects'];
  claim_reviews: NonNullable<Workspace['claim_reviews']>;
  relations?: string;
};
export type FixtureAnswer = {
  overview?: string;
  question: string;
  answer: string;
  interpretation: string;
  remaining_questions: string;
  resume: string;
  claim_ids: string[];
  comparison_claims: string[];
};
export type FixtureDocument = {
  question: string;
  paper: SelectedPaper;
  file: Collection['ready'][number]['file'];
  document: string;
  document_sha256: string;
  markdown: string;
  binding: {
    round: number;
    edition: string;
    pdf_sha256: string;
    workspace: string;
    paper_id: string;
    answered: boolean;
    comparison_claims: string[];
  };
  scope: string;
};
export type FixtureReviewResult = {
  input_sha256: string;
  reviewer: string;
  review_type: 'independent-source-review';
  reviewed_at: string;
  claims: Pick<
    ClaimReview,
    'paper_id' | 'claim_id' | 'verdict' | 'reason' | 'evidence' | 'required_changes'
  >[];
  source_checks: { paper_id: string; pdf_sha256: string }[];
};

// Only successful commands have a response contract. run() remains available
// for intentionally malformed CLI requests and exposes the real process result.
export type TopicState = Awaited<ReturnType<typeof selectedTopic>> & {
  searches: { round: number; query: string; papers: Omit<SelectedPaper, 'round'>[] }[];
};

export type TopicOutputs = {
  init: TopicState;
  search: TopicState;
  import: TopicState;
  select: TopicState;
  unselect: TopicState;
  show: TopicState & { analyses: Awaited<ReturnType<typeof listAnalysisDocuments>> };
  collect: Collection;
  sources: Collection;
  decide: Collection;
  unavailable: Collection;
  'analysis-open': FixtureDocument;
  'analysis-save': FixtureDocument;
  'analysis-list': Awaited<ReturnType<typeof listAnalysisDocuments>>;
  'comparison-input': Awaited<ReturnType<typeof comparisonInput>>;
  compare: Comparison;
};

export type FixtureSourceBook = {
  version: 1;
  rows: { key: string; round: number; files: Collection['rows'][number]['files'] }[];
};
