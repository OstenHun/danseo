import type { Comparison } from '../core/comparison.js';
import type { Card } from '../core/index.js';
import type { ElementDefinition } from 'cytoscape';

export type ComparisonPaper = Comparison['papers'][number] & { id: string };
export type ReadyPaper = ComparisonPaper & Required<Pick<ComparisonPaper, 'paper_id' | 'source' | 'document' | 'document_sha256'>>;
export type ComparisonView = Omit<Comparison, 'mode' | 'papers'> & {
  mode: 'research-comparison';
  papers: ComparisonPaper[];
};
export type ComparisonSelection = 'paper' | 'criterion' | 'relation';
export type MapSelectionType = ComparisonSelection | 'application' | 'topic' | 'grouping' | 'reference' | 'context-link';
export type MapSelection = { type: MapSelectionType; recordId: string; paperId?: string };
export type MapElement = ElementDefinition & { data: MapSelection & { id: string; label: string } };

// Structural contracts for the shared map's existing non-comparison projections.
type MapItem = { id: string; title: string; short_title?: string };
type PaperItem = MapItem & { review_status: string };
type ApplicationItem = MapItem & Pick<Extract<Card['data'], { type: 'application' }>, 'claim_refs'> & {
  decision: { status: string; action?: string };
};
type Context = { items: MapItem[]; links: { source: string; target: string }[] };
export type LegacyMapData = {
  mode: string;
  papers: PaperItem[];
  applications?: ApplicationItem[];
  relations?: Comparison['relations'];
  project_context?: Context;
};
export type MapData = ComparisonView | LegacyMapData;
export type MapScene = 'context' | 'comparison' | 'evidence';
export type MapController = {
  fit(): void;
  zoom(factor: number): void;
  select(type: MapSelectionType, id: string, paperId?: string): void;
  destroy(): void;
};
export type MapAPI = {
  build(data: MapData, scene: MapScene): MapElement[];
  mount(container: HTMLElement, data: MapData, scene: MapScene, onSelect: (selection: MapSelection) => void): MapController | null;
};

declare global {
  const cytoscape: typeof import('cytoscape');
  interface Window { DanseoMap: MapAPI }
}
