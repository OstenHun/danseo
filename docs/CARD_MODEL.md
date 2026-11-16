# Shared card model

Summary: Separate shared paper evidence from project-specific decisions using stable IDs. The current format is draft-2; original claims, interpretations, observations and adoption remain distinct.

This guide describes the current format. Earlier alternatives and internal design notes are not additional schema requirements. [card.schema.json](../schemas/card.schema.json) owns machine validation; [CLI](CLI.md) owns workspace connection and [claim reviews](CLAIM_REVIEWS.md) owns per-claim currency.

<a id="첫-버전-최소안"></a>

<a id="다중-주장표다른-수치-적용"></a>

<a id="최소-단위"></a>

<a id="상태를-섞지-않기"></a>

<a id="사용처별-조건"></a>

<a id="검증할-계약"></a>

<a id="구조화와-본문의-경계--2026-10-21-검토안"></a>

<a id="원문-위치와-본문-연결"></a>

<a id="참고한-오픈소스와-표준"></a>

<a id="다음-작은-결정"></a>

<a id="기록-단위와-화면-모양의-구분"></a>

## Minimum first version

| Record | Initial data | When used as evidence | Body |
| --- | --- | --- | --- |
| Paper | ID, first Markdown heading, source URL/path, review.status=draft | Actual edition, claim IDs/statements/locators and current review state | Conditions, limits, labeled AI interpretation, check history and original-record links |
| Application | ID, project_id, actual claim_refs, decision.status=proposed | Connected claims, project context and decision rationale | Current question, observations, existing experiments and next checks |

`schema_version`, type and stable IDs are metadata rather than repetitive user forms. Use the first Markdown heading as the record title; do not duplicate labels or invent unknown bibliography. An unread Paper may omit/have empty claims but is not reviewed evidence. Applications require actual claim IDs from selected Papers. Saving unfinished work differs from exporting reviewed evidence.

Current Paper represents one source edition with locators inside claims; no mandatory separate source/evidence entity or mapping arrays. Multiple pages/sections remain distinct locators rather than inferred co-location. Keep editions separate; revisit version/many-to-many evidence design when actual consumers need it. Stable compatibility/migration policy remains undecided until external consumers or a formal version exist.

Claims contain **author-reported content**. Optional conditions/limits are strings; labeled AI interpretation stays in body, observations in Application. `question`, `context_refs` and `reference_base` are not mandatory Application fields. Actual Markdown links explain context without a promise of role-based automatic collection. `decision.action` is optional until known; status remains proposed/accepted, with actual decision evidence required for accepted.

## Multiple claims, tables and conflicting values

Several claims may reference a table; one claim may have multiple locators. Identify which value belongs to which table. Do not merge ambiguous page/table mappings. Keep different experiments as separate conditioned claims. Preserve both reported values and locations for discrepancies; do not select a winner or average automatically. Numeric comparisons require structured value/unit/denominator/condition/evidence design if later needed.

Whole-card state does not certify every claim. Current claim-level review is an external frozen-input/result registration, not an added claim state inside the card. See [analysis](PAPER_ANALYSIS.md) and [review JSON](CLAIM_REVIEWS.md) for the implemented current-validity path. Earlier proposals in Git history predate this feature.

<a id="이전-확인-이력과-현재-검토-상태"></a>

## History and current review state

`review.status` describes source checking of the registered edition, current claims and evidence connections, not universal truth, reproduction, understanding or adoption:

- `draft`: source checking is incomplete; optionally record a short reason.
- `source-checked`: recorded claims/evidence/conditions were checked in that edition with scope/date/checker history.
- `needs-recheck`: edition, claim, locator or evidence agreement changed; preserve previous history.

Keep a short **when / who / edition and coverage / original-record link** history in the body. Copying/conversion is not a new check. Changed mappings may remain draft despite prior reviews. Unchanged edition/claims/evidence with clear check coverage may reuse history; do not require a full reread on every query or wording edit. Return to needed source portions for new claims/numbers/methods/conflicts/editions. A review button is not new source evidence. Unknown checker/coverage stays unknown. Application proposed/accepted remains a separate decision state.

## Source text and locators

Use exact locator variants from the schema: `pdf-page-range` (1-based start/end), or a `section`, `table` or `figure` locator with value text. Do not invent a page/section correspondence. Optional `source.text_path` connects prepared page-aligned text rather than proving extraction fidelity.

Source-text JSON requires `source_url`, `version`, `pdf_sha256`, `extractor` and `pages`; each page has a positive 1-based `page` and nonempty `text`. Its version is the source edition, not a separate schema-version label. URL/version must match Paper and page numbers must be unique. Check the actual [workspace loader](../src/core/index.ts) and [synthetic example](../examples/minimal/workspace.json). PDF hashes are preparer declarations in this export path. Invalid connected text fails export; absent text only warns. Reading metadata is not original visual verification.

## State and content boundaries

Source status: draft/source-checked/needs-recheck. Content kind: author report/AI interpretation/project observation. Decision action: apply/adapt/test/defer with separate proposed/accepted. Missing action is unknown. None establishes understanding or reproduction.

The implemented standalone relation kinds are cites/extends/compares/related-to/reading-order, with source/AI origin and explicit direction. Earlier candidate kinds in Git history are proposals, not the current relation contract. Follow [comparison](RESEARCH_COMPARISON.md) and [standalone view](../skills/danseo/references/research-view.md).

For research comparison, retain question, comparator, population, split, metric/denominator and unknowns. For experiment advice, retain task/model/mode, exact input/output constraints, intervention, prior success/failure and external results versus local inference. Do not require irrelevant model/training fields for every paper or equate missing conditions.

## Validation and representation

Schemas check structure, references, locations and valid status combinations, not source truth, novelty or URL meaning. Unreadable paths remain unknown. Existing preservation/project-separation/edition/broken-reference checks and later evaluations are linked from PTP-001 and [TASKS](../TASKS.md). Evaluator answers do not belong in agent inputs.

Store machine-identifiable/filterable links in fields and human explanations in Markdown; natural-language field values remain possible. Export both fields and full bodies conservatively so conditions/limits/unknowns are not lost. Any future selective-body export needs stable identifiers, reference integrity and omission checks first.

“Card” describes a record, not a rectangular UI tile or fixed text length. Paper is a research record; Application is a project application note. Views may combine their connected contents. Layout benefits remain hypotheses; data separation does not prove a particular screen design is useful.
