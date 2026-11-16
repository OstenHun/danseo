# Topic research comparison graph

Summary: Group current source-supported claims by criteria. Select papers or criteria to inspect conditions, editions, PDFs and analysis, keeping source relations separate from AI proposals.

<a id="열기와-재개"></a>

<a id="비교-기준과-상세-선택"></a>

<a id="원문-관계와-ai-제안"></a>

<a id="경계와-확인-범위"></a>

<a id="재사용-출처"></a>

<a id="프런트-개발과-타입-검사"></a>

## Open and resume

Prepare stage-3 [analysis documents](PAPER_ANALYSIS.md), shared Papers and claim reviews. The agent reads the topic question and `comparison-input`, then writes `comparison.json` in the topic folder. Criteria/grouping rationales are AI interpretation; the CLI neither reads papers nor infers criteria. Follow the [requested-language rule](../skills/danseo/SKILL.md#output-language) for generated prose. Fixed controls are English; the viewer preserves record text.

```sh
node dist/cli.js topic comparison-input --dir /my/topic
node dist/cli.js topic compare --dir /my/topic
```

Open the returned `url` in a desktop browser. The read-only server binds only to `127.0.0.1`; stop it with Ctrl+C. Default `--port 0` chooses an available port. URLs change each run. No data is sent to an external server/model. `--json` prints the current graph and exits.

Reopening or selecting **Reload current evidence** rereads selections, PDFs, analysis documents, claim reviews and relations. Failure clears previous evidence and displays the reason. External edits are not watched; reload after editing. PDF/document links recheck selection and hashes instead of silently substituting another edition.

## Criteria and detail selection

This synthetic example is a format reference. `question` must match the topic question exactly, including its language; `key` is a selected paper key and `claim_id` a candidate recorded in its topic analysis. Papers from another topic are rejected. Replace generated titles/rationales with requested-language prose.

```json
{
  "version": 1,
  "question": "How did the two studies evaluate results?",
  "criteria": [{
    "id": "evaluators",
    "title": "Evaluators and judgment methods",
    "rationale": "Compare the roles and scales of human preferences and model answer evaluation.",
    "refs": [{"key": "paper-a", "claim_id": "evaluation"}, {"key": "paper-b", "claim_id": "evaluation"}]
  }]
}
```

Use at most 30 criteria. A side without currently valid supported claims displays **No checked evidence for this criterion**. Unchecked, partial, contradicted, required-change, damaged-review or changed evidence is excluded. Do not fill missing evidence with another topic's answers or unrelated claims.

Initial nodes represent papers and criteria. Paper selection shows evidence per criterion; criterion selection shows each paper's statements, conditions, limits, editions and PDF page/section/table locations. List buttons select the same records as the map and support Tab/Enter/Space. PDFs and analysis open in separate tabs; Markdown is shown as source text. Never rank values from different samples/scales together.

## Source relations and AI proposals

Set workspace `relations` to one YAML/JSON file following [relations-1](../schemas/relations.schema.json). It must be inside the workspace; external/linked paths are not read. Display only recorded relations and selected topic papers.

- Preserve `source/target/kind/origin/status/rationale/created_by/snapshots/evidence_refs` and optional `review`. For `cites/extends/compares`, direction runs from the asserting paper to the cited/extended/compared paper. Do not create symmetric relations.
- `source-checked` requires `origin: source`, actual claim evidence from the source endpoint, checker identity and a timestamp with timezone. AI proposals and reading order never become source relations automatically.
- `snapshots.dependencies` uses a `relation-dependencies-1` fingerprint covering both editions/files, relation type/direction/rationale, complete explicitly referenced claims including conditions/limits, and current support. Legacy records without fingerprints or with deleted evidence are held individually. Old abbreviated fingerprints and some extension-field fingerprints using locale-specific sorting require rechecking. `held_relations.current_dependencies` is only a candidate to record after actual rechecking, not proof of checking/adoption. If null, repair missing evidence first; do not copy it automatically to silence warnings.
- Even when two tables have source support, grouping them is AI judgment. Criterion links display **AI grouping**; paper relations display **Source relation** or **AI proposal** with their rationale.

**Source-checked relations only** retains currently valid `source/source-checked` research relations. Navigational papers/criteria and AI grouping links remain. Apply the same filter to map/list/details and clear hidden proposal details. Explain zero results; clearing the filter restores proposals. Changed sources/claims/locations/relations hold affected results.

## Boundaries and verification scope

Reuse stage-3 selection rounds, editions, PDF hashes and latest per-claim review rules. The viewer creates no verdicts and edits no Papers/documents. Source support describes recorded comparison scope; it does not certify reproduction, understanding or learning benefit.

The server returns only currently validated PDFs/documents, never arbitrary paths. Per-run random URLs, Host/Origin/method restrictions, no-store, CSP and text output constrain cross-site requests, traversal and HTML execution. They do not isolate malicious local programs running with the same user privileges.

Current scope is listed under PTP-012 in [the roadmap](../TASKS.md). Regressions are in `tests/comparison.test.ts`; actual execution is reported in PR Checks. macOS permission UX, screen readers and human analysis benefits need separate checks.

## Reused sources

Selected local development components were reused: `research-map.ts`, `reader-base.css`, `dependencies.ts`, `relations.schema.json`. Comparison adds a projection while preserving existing scenes. The map/evidence-panel structure follows the existing [Figma draft](https://www.figma.com/design/IQKRYDlSKcOV0Bltv7qO6C?node-id=11-2) and Fieldnotes tokens; no Figma layers were changed.

## Frontend development and type checks

The controller is `src/web/comparison.ts`; the shared map is `src/views/research-map.ts`. `src/web/browser-types.d.ts` references the core `Comparison` and Cytoscape types. Selected papers may lack ready sources/analysis: a screen ID alone never permits a PDF link. Type annotations are not runtime JSON validation; preserve server-side file/source/review checks.

`npm run build` first runs the NodeNext server build and separate strict browser check, then emits only two classic-script entries and copies HTML/CSS/installed Cytoscape assets. Browser output has no Node imports or ESM markers; keep Cytoscape → map → controller `defer` order. Do not maintain duplicate source JavaScript.

`npm test` includes type rejection for misspelled fields, invalid selection kinds and unavailable source access, plus classic-script syntax and existing map-scene checks. `npm run test:package` rebuilds and compares installed asset bytes with current outputs. Passing tests is separate from rendered reading and human usability evaluation.
