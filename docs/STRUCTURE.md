# Repository and data boundaries

Summary: One package holds CLI, core, schemas, skill and comparison viewer. Private topics, originals and analysis stay outside public code; editors and adapters are excluded.

Current implementation comprises CLI/core, comparison server/UI and shared map. `workspace.json` owns card/project/review/relation connections; topic folders own discovery, selection, collection and analysis. Later editing/import proposals are not distributed features. See [CLI](CLI.md), [analysis](PAPER_ANALYSIS.md) and [comparison](RESEARCH_COMPARISON.md).

<a id="저장소-구성"></a>

<a id="논문-자료-공간과-원문-보관--최소안"></a>

<a id="등록요약인덱스템플릿"></a>

<a id="긴-논문을-정리하는-흐름--설계안"></a>

<a id="로컬-실행과-배포의-차이"></a>

## Repository layout

```text
danseo/
├─ README.md / AGENTS.md / TASKS.md
├─ docs/                   # Usage guides, formats and evidence-check contracts
├─ src/
│  ├─ cli.ts               # Commands, options, output, exit codes
│  ├─ core/                # Cards, topics, sources, analysis, reviews, relations
│  ├─ web/                 # Read-only comparison server and browser UI
│  └─ views/               # Shared map and reading styles
├─ schemas/                # Card/workspace/relation JSON Schema
├─ scripts/                # TypeScript build/documentation tools
├─ skills/danseo/           # Research instructions, generators and assets
├─ skills/danseo-reading/   # Learning questions, source feedback and concept views
├─ skills/paper-to-project/ # Paper/project comparisons and application guidance
├─ examples/minimal/       # Runnable synthetic workspace
├─ evals/                  # Evaluation plan; answers/runs remain private
├─ tests/                  # TypeScript regressions, helpers, package checks
├─ workspaces/             # Private local data, Git-excluded
└─ work/                   # Private work records and execution evidence
```

No separate package/permanent service is required. CLI owns options/output, core owns file/model rules, and the comparison server exposes a read-only loopback view. Build outputs: `build-tools/`, `dist/`, `build/`; development tools/tests are not distributed. See [build contracts](../CONTRIBUTING.md#editing-shared-test-fixtures).

Docs/TASKS/evals are shareable product material/plans, not private logs, original papers or answer keys. The npm files allowlist includes built assets, schemas, skill, synthetic examples and public docs/brand/notices, rather than every repository file. Verify the actual tarball and installed CLI.

<a id="원본은-하나만"></a>

## One authoritative source

- This repository owns product code, common formats and distributed skill.
- Target projects own questions, source review, learning and experiment records.
- Existing global skills stay unchanged until an explicit installation/update; there is no automatic sync.
- Graphs/comparisons derive from cards; do not manually maintain parallel data.js/graph.json truth.
- Personal prototypes are references, not whole folders to copy with private paths/data.

<a id="개인-workspace-초안"></a>

## Private workspace sketch

```text
workspace/
├─ papers/<paper-id>.md
├─ projects/<project-id>/project.md
├─ projects/<project-id>/applications/<card-id>.md
└─ relations.yaml
```

Frontmatter and body hold one record's structure/explanation. Round-trip preservation belongs to PTP-001. Any future cache/index is disposable derived data; paths/IDs/external references remain a draft compatibility contract.

## Paper storage and original files

The paper library is a local workspace, not a separate GitHub repository/database/server. Papers may be shared across projects. Registering a URL or existing PDF/Zotero attachment does not require downloading. Use explicit imports when offline access/edition retention matters; optional `sources/<paper-id>/<version>.pdf` is a layout suggestion, not a reason to create empty folders or move originals automatically.

Detailed source checks need actual access to relevant edition text/tables/figures. Successful registration or an existing PDF does not establish reading/review. URL-only unread sources remain unchecked; no-download workflows cannot promise offline access or link durability. [Zotero's stored/linked attachments](https://www.zotero.org/support/attaching_files) illustrate this separation; direct integration is unimplemented.

## Registration, summaries, indexes and templates

1. Register title/source with a stable ID and draft status; metadata generation is a design direction, not an included card editor.
2. Add relevant claims/locators/conditions/limits when a question needs them. Bulk summarizing the whole library is not a prerequisite.
3. Link project questions, existing experiments and decisions through Applications without forcing one for every paper.

A proposed index derives IDs/titles/sources/status/references; people should not maintain a second index manually. Begin with scans if implemented, adding disposable caches only when needed. No indexer, embeddings/vector DB/full-text chunk store is included. Revisit when keyword/filter navigation actually fails.

Small Paper/Application Markdown templates can guide conditions, history, question, observations, rationale and next checks. Never invent facts to fill blanks or add a template engine. Current required fields belong to [CARD_MODEL](CARD_MODEL.md#minimum-first-version) and schemas.

## Reading long papers: design guidance

Keep full originals; summaries guide returns to sources rather than replacing them. Existing agents/Markdown suffice without adding a required automatic PDF-processing dependency.

1. Identify edition/access coverage and locations of problem, method, experiments, results, limits and appendices. A location guide is not completed reading.
2. Read meaningful section/experiment units; keep table headers, units, footnotes and metric definitions together. Inspect equations/figures on original pages. Preserve neighboring context when splitting sections.
3. Record used claims/locators with conditions, comparators, limits and unknowns. Keep conflicts; do not smooth failed extraction or uncertain numbers into facts.
4. Cross-check main text/appendix and table/prose values, samples, models and setup; distinguish condition differences from unresolved discrepancies.
5. Write a short conclusion/limits guide with source locations. Avoid repeated summaries of summaries; return to evidence for numbers/methods and show read/unread scope.

An optional Paper body can use overview → conditions/evidence → limits/conflicts → check scope/history, without mandatory new overview/coverage fields. Registration-only records need not fill every section. A full-review request includes appendices and cannot be completed with unverified scope. [Review states](CARD_MODEL.md#history-and-current-review-state) remain separate.

Agents choose relevant sections from the overview, then read evidence/conditions. Missing answers require source return. Split over-limit material with explicit omissions/remaining checks. Accuracy/cost/optimal length remain unmeasured. [Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/) motivates distinguishing accepted context length from information use under its studied conditions, not general claims about all current models. [Docling's model](https://docling-project.github.io/docling/concepts/docling_document/) is a possible future importer reference; adoption/extraction accuracy is unverified.

## Local execution versus deployment

File-writing proposals require explicit local workspace access; this does not imply cloud hosting. Cross-device access, authentication and public APIs are separate scope. Develop with native Windows PowerShell and supported CI; see [runtime support](RUNTIME_SUPPORT.md). Never require a maintainer's private runtime/path. Standalone research UI supports Korean/English via candidate `language`; CLI/native comparison guidance remains English. Supplied/generated research prose follows the [output-language rule](../skills/danseo/SKILL.md#output-language).
