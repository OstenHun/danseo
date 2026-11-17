# Verify paper relations against sources

Summary: Recheck candidate relations and linked claims against original sources, separate direct relations from AI interpretations, and verify final structure and rendering. Access failures remain explicit.

<a id="적용과-완료-기준"></a>

<a id="1-입력과-근거-고정"></a>

<a id="2-후보-작성-뒤-원문에-재대조"></a>

<a id="3-판정과-상태-반영"></a>

<a id="4-검증-기록과-생성"></a>

## Scope and completion

Apply this without a separate verification request. Existing drafts, another model's audit and review statuses are inputs, not substitutes. The current agent rereads sources in a verification step separate from drafting; this is self-checking, not independent review. This procedure grants no new model/subscription/installation/transmission permission.

Complete only when each relation has a checked/corrected/unknown outcome and final candidate/rendering agree. No relations is a valid result. Do not invent inaccessible evidence or expand into reading every paper end-to-end. Before saving relationship HTML, also run the [overview/count gate](evidence-gate.md). Machine checks do not replace semantic comparison.

For comparative performance claims in rationales or linked claims, apply the [table/exception procedure](performance-verification.md). Check ties, losses and missing values before saying a method wins across every generator/dataset. Preserve footnotes and evaluation conditions. Missing table evidence/field review blocks HTML generation.

## 1. Freeze inputs and evidence

Use specified editions, PDFs or official full text and the candidate. Compute actual local SHA-256; record URL, edition and verified locations for web text. Preserve drafts and create derived candidates only in authorized locations. Write existing cards/workspaces only within the requested scope.

For every relation, follow endpoint Paper IDs, direction, kind, rationale and evidence_refs into claims, conditions, limits and locators. Linked claims are also review targets. An existing quotation does not by itself support a claim.

## 2. Recheck after drafting

Compare each relation with the original. Reuse source locations where appropriate without skipping per-relation meaning checks:

- **Cites:** verify in-text citation and bibliography identity. Co-citation/title similarity does not establish a citation between the two papers.
- **Extends:** check what the author explicitly extends from that particular paper. Shared problems, metrics, evaluation protocols or datasets, extending a third paper's benchmark, or later chronology do not establish direct inheritance. Keep conceptual-extension interpretations as AI proposals.
- **Compares:** verify actual subjects, sections and tables. Do not rank results with different models/data/metrics/splits/baselines as if conditions match. Check conditions before reconciling text/table differences; preserve unresolved discrepancies.
- **Linked claims:** check subject/object, target/non-target or treatment/control, increase/decrease and concentration direction, denominator, units and conditions. For notation, distinguish sets, variables, metrics and objectives using definitions/equations. Reading an overview does not verify the whole claim.
- **Reading order/similarity:** connect actual claim references and reasons while retaining AI origin. Do not promote them to author prerequisites or reader understanding. Keep empty references with an explanation instead of inventing claims.

Preserve short excerpts with actual sections/pages. Inspect PDF pages or official same-edition full text for ambiguous columns, equations or extraction. Do not join broken extracts into invented direct quotations. Distinguish whitespace normalization from correcting source content. Matching quotations, hashes and structures do not replace meaning checks.

For long claims, check each key clause. For statements that benefits concentrate in one group, record **final wording → original group/direction → same-condition values or excerpt** together. A positive effect in another group does not establish concentration direction. After verifying equations/numbers, separately judge whether final prose accurately conveys them.

When rationale uses mathematical notation, record **symbol → actual final rationale wording → original definition/page/equation → agreement** in a short table. Correct category mistakes such as calling a set an objective, then update the final-wording column. Correct definitions in an audit do not excuse incorrect candidate prose. Remove unsupported symbol meanings or mark them unknown.

## 3. Apply outcomes and status

- A supplied source pack, search snippet, translated summary or previous agent's report is secondary material. Original URLs and accurate quotations inside it do not prove that this agent opened the originals. For summary-only input, sources stay `not-checked`, new Papers stay `draft`, and source-origin relations stay `proposed` with `review:null` and `needs_recheck:true`. Never turn a secondary source into a fabricated original snapshot. Archive the actual inspected original and bind checked states using [source_checks](evidence-gate.md#original-source-checks).
- New directly verified relations may use `origin: source`, `status: source-checked`, with actual claims/locators, checker and observed check time. Use a clock/command result exactly; do not guess or round a timestamp. Without observed time, keep `status: proposed`, `review: null` and disclose incomplete metadata.
- Interpretive relations use `origin: ai`, `status: proposed`, `review: null`. Evidence references alone do not promote them. Remove unsupported relations that are not defensible interpretations rather than retaining everything as AI.
- Correct/remove wrong claims or conditions in derived candidates. Inaccessible new claims remain unknown, not source-checked; access failure is not contradiction.
- Preserve review history. For new errors/insufficient evidence, adjust derived status/rationale and record why. Access failure alone does not make an old review false. If retaining prior source-checked status after an incomplete current check, set `needs_recheck: true` and report current scope. Clear it only after actual rechecking/resolving related warnings, retaining this run's evidence. Original-workspace history/dependency changes follow existing contracts and scope.
- Apply the same outcomes to root description/view_reason/scope, Paper notes and claim statements/conditions/limitations. An AI relation in details must not become confirmed source inheritance in the overview. Relation checking never promotes whole-Paper draft or reader understanding.

## 4. Record and generate

For file output, reuse or create short `verification.md` beside the candidate. For workspace-only relation updates, use the existing authorized task-record folder; do not force standalone output. No new core schema/mandatory JSON form is needed. Include:

- Edition, path/URL, available actual hashes and final candidate hash.
- Relation/claim IDs, pages/sections/tables, short excerpts, direct/AI outcome and reason, errors/fixes/unknowns.
- Actual checker/time and text/visual coverage; distinguish self-check from independent review.
- Structural result, actual HTML reading or why unavailable; separate semantic, structural and visual completion.

Write agent-authored explanations in the [requested language](../SKILL.md#output-language); retain original quotes/IDs. Reread the saved final candidate against every recorded correction/outcome and its claims, relations and overview. An updated audit with stale candidate errors fails. Then record the final candidate hash.

For workspace-only storage, inspect installed help and run supported structural/relation checks without adding HTML. For standalone HTML, run the bundled check/generator without adding unknown fields or redesigning styles. Inspect actual nodes, selection, source/AI statuses and evidence panel using [rendered checks](research-view.md#generation-and-reading). If browser access is unavailable, report generation complete and visual review not run. Deliver useful partial results with explicit unknowns rather than blanket verification claims.

Final responses briefly link fixes, source relations/AI proposals, unknowns, output and verification record. This workflow exposes errors; it does not guarantee infallibility or enforcement across every host.
