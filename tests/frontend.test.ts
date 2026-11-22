import type { MapAPI, LegacyMapData } from '../dist/web/browser-types.js';
import { required } from './helpers/analysis-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script, runInNewContext } from 'node:vm';
import ts from 'typescript';

test('browser contracts accept unavailable papers and reject misspelled fields and selections', () => {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.browser.json');
  assert.ok(configPath, 'Expected TypeScript configuration');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const probe = resolve('src/web/type-probe.ts').replaceAll('\\', '/');
  function diagnostics(source: string) {
    const host = ts.createCompilerHost(parsed.options);
    const original = host.getSourceFile;
    host.getSourceFile = (file, language, ...rest) =>
      file === probe
        ? ts.createSourceFile(file, source, language)
        : original(file, language, ...rest);
    const program = ts.createProgram([...parsed.fileNames, probe], parsed.options, host);
    return ts.getPreEmitDiagnostics(program);
  }
  const positive = `import type { ComparisonPaper, MapController, MapSelection } from './browser-types.js';
    const paper: ComparisonPaper = { id: 'unavailable:1', key: 'A', number: 1, title: 'Not prepared' };
    const selected: MapSelection = { type: 'grouping', recordId: 'criterion' };
    declare const controller: MapController;
    controller.select('criterion', selected.recordId);
    paper.source?.sha256;`;
  assert.deepEqual(
    diagnostics(positive).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
    [],
  );
  const invalid = diagnostics(
    positive +
      `
    paper.soruce;
    controller.select('criteria', 'id');
    paper.source.sha256;
  `,
  );
  assert.deepEqual(invalid.map((d) => d.code).sort(), [18048, 2551, 2345].sort());
});

test('generated browser entries parse as classic scripts and keep shared map projections', () => {
  const script = readFileSync(new URL('../dist/web/research-map.js', import.meta.url), 'utf8');
  new Script(readFileSync(new URL('../dist/web/comparison.js', import.meta.url), 'utf8'));
  const context: { window: { DanseoMap?: MapAPI } } = { window: {} };
  runInNewContext(script, context);
  const { build, mount } = required(context.window.DanseoMap);
  const paper = { id: 'p', title: 'Paper', review_status: 'draft' };
  const application = {
    id: 'a',
    title: 'Application',
    decision: { status: 'defer' },
    claim_refs: [{ paper_id: 'p', claim_id: 'c' }],
  };
  const project: LegacyMapData = {
    mode: 'project-application',
    papers: [paper],
    applications: [application],
    project_context: {
      items: [{ id: 't', title: 'Topic' }],
      links: [{ source: 't', target: 't' }],
    },
  };
  assert.deepEqual(
    Array.from(build(project, 'evidence'), (item) => item.data.type),
    ['paper', 'application', 'reference'],
  );
  assert.deepEqual(
    Array.from(build(project, 'context'), (item) => item.data.type),
    ['topic', 'context-link'],
  );
  const relations = build(
    {
      mode: 'existing-research-mode',
      papers: [paper],
      relations: [
        {
          id: 'r',
          source: 'p',
          target: 'p2',
          kind: 'cites',
          origin: 'source',
          status: 'source-checked',
          needs_recheck: true,
          origin_label: 'Synthetic source',
          current_dependencies: null,
          rationale: 'Synthetic citation',
          evidence_refs: [],
          created_by: 'synthetic fixture',
          snapshots: { source: 'p', target: 'p2' },
        },
      ],
    },
    'evidence',
  );
  assert.equal(required(relations[1]).data.state, 'needs-recheck');
  // With Cytoscape absent, mount must return before accessing the DOM container.
  const unusedContainer = {} as HTMLElement;
  assert.equal(
    mount(unusedContainer, project, 'evidence', () => {}),
    null,
    'missing Cytoscape keeps the list fallback usable',
  );
});
