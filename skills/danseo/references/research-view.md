# Research views by purpose

Summary: Standalone views show project decisions or paper relations with their evidence, conditions and recheck states. Input validation does not certify meaning and never changes original records.

<a id="실제-작업을-먼저-확인하기"></a>

<a id="화면과-생성-경로-선택"></a>

<a id="입력-만들기"></a>

<a id="프로젝트-적용"></a>

<a id="논문-관계"></a>

<a id="v2--실제-질문과-기존-문맥을-보존하기"></a>

## Start with the actual task

Read the request, specified workspace question/Papers/Applications/relations and existing views/task records before choosing a view. Identify connection units and one representative path using real IDs. Separate proposals, automated checks and user adoption. Running a similarly named synthetic example does not validate the actual task.

Check the current question, relation endpoints/meaning, actual record counts, overall structure and evidence reached after selection. One Application should center its question/evidence, not a fabricated multi-item list. Concepts are not Papers; reading order is neither citation/prerequisite evidence nor understanding. Dates do not create relations.

## Choose a view and generation path

- **Paper relationships:** reuse an installed CLI's supported map/list/evidence interface when available; check actual help. The portable generator does not add native map/edit commands. Keep native workflows when source history, chronological/free placement or editing is required; do not insert a separate per-paper reader by default.
- **Project connections:** follow question → Application → referenced Paper/Claim and condition differences. Adoption is not a sequential workflow. A learning-oriented project may reuse its registered concepts, explanations and paper references. Do not invent concepts/Applications to fill the format.
- **Standalone HTML:** use the bundled generator. Initial layout is a scoped map, matching node/relation list and separate evidence panel. Project references are dashed and distinct from source causality. Preserve multiple relations between the same papers. Map/list select the same evidence without resetting positions/zoom. There is no date axis; do not substitute this view for requested chronology.
- **Learning:** a separately installed learning workflow may own dialogue/practice; this repository bundles one research skill. Preserve existing concept units/connection meanings. v2 project context derives an existing concept map linked to an actual Application; it adds no Learning entity/core schema and does not require project records for learning-only requests.

Desktop views combine topic maps and matching lists. Default edges follow the selected paper/relation; status/type filters and **All connections** expose full scope. Preserve full relation lists and details. Filtering out a selected relation returns to overview without stealing filter focus; an explicit evidence button moves to details.

For new multi-paper inputs, use recognizable `short_title`, preserving original full `title`. Review question/method-specific optional `topic` (at most 40 characters). Groups are editorial interpretation, not author classifications/inheritance. Without adequate grounds, omit topic; the fixed label is **Uncategorized**. Do not require a classifier or equal group sizes; old inputs remain readable.

Verify actual counts, aliases and groups; follow paper → relation → source. Sample status/type filters, empty results, all-connections and keyboard focus. Default reading verification is local desktop at normal size, including overlap/clipping and Korean word wrapping in requested-language prose. Generation or matching asset hashes do not replace rendered/source-semantic checks. Report visual review not run when a browser is unavailable.

Keep selected routes continuous without a floating number badge; the matching relation number remains in the list and reader. Unselected paper titles retain full contrast, with borders distinguishing selection. In the relation reader, direction and reason lead to source evidence; AI reference claims are not source confirmation of the relationship. An empty evidence list has one explicit notice, with authorship/check metadata available in keyboard-operable details.

## Open the original from a paper node

Select a paper node or its matching list entry, then use **Open original source ↗** under **Read the paper** at the top of its details. Project-application views use the same shortcut when a paper is selected. **Read at** lists the registered sections, pages or figures to find in the source; it does not automatically jump to those locations.

The shortcut opens the exact registered source URL linked by the paper's `claims[].evidence` in a new tab. Repeated URLs share one link while retaining every distinct locator. Null URLs are omitted without inferring an address from the title or DOI. If no linked source has an external URL, the shortcut section is omitted; use the existing evidence details for the recorded local-original guidance and check scope.

Credential-free HTTP(S) URL validation and rejection of unregistered evidence still run before generation. A link does not establish full-paper verification, availability or reader understanding. This applies to standalone research HTML, not the CLI comparison app. Regenerate existing HTML with the updated skill to include it; global installations are managed separately.

## Prepare candidate input

Use existing authorized CLI/export/graph data and full text. Distinguish recorded history from source checks in this run. Examples are synthetic references: [project application v2](../assets/project-application.v2.example.json), [paper relations v2](../assets/paper-relations.v2.example.json). New views use v2; v1 `.example.json` files test compatibility. Node 22/24 and the complete skill folder suffice, without external npm packages, sibling skills, repository code or a server.

Apply [output language](../SKILL.md#output-language) to both the generated prose and standalone interface. Set optional root `language` to `ko` or `en` before generating the canonical overview. Korean requests use `ko`; omitted language preserves the legacy English interface. This applies to paper-relations and project-application inputs, including v1. Original titles, quotations, IDs, status values and saved content stay unchanged. The renderer translates only its fixed UI phrases, including accessible names and announcements; it neither detects nor translates supplied prose. Diagnostics, deterministic performance reports and the native CLI comparison remain English. There is no live language switch. Existing HTML must be regenerated with the updated complete skill folder.

v1 common fields are required; unknown fields fail unless explicitly supported:

| Field | Contract |
| --- | --- |
| `version`, `mode` | 1 or extended 2; `project-application` or `paper-relations` |
| `title`, `description`, `view_reason` | Nonempty question/scope/layout-rationale text |
| `start` | Actual starting Application/Paper ID |
| `papers` | At least one Paper, preserving original IDs |
| `sources` | `{id,title,url,locator,scope,verification}`; credential-free HTTP(S) URL or null for local material; precise page/section/table/figure locator; actual reading scope/checker/unknowns; verification `not-checked` or `agent-checked`, never whole-paper certification |

Paper: `{id,title,edition,review_status,claims}`; unknown edition is null, review status preserves `draft|source-checked|needs-recheck`. Claim: `{id,statement,conditions,limitations,evidence}`. Statement is the recorded author claim; conditions/limitations are text arrays from the source body, evidence links source IDs. Missing conditions/limits are empty arrays, not a conclusion that none exist. Preserve locator labels/pages/ranges when converting to strings; never turn AI interpretation into an author claim.

Optional Paper `publication` is `{date,edition_date,source_id}`. `date` is the earliest source-confirmed public availability, not a later conference or revision date. `edition_date` is the date of the selected edition, or null when unknown. Both accept `YYYY`, `YYYY-MM` or `YYYY-MM-DD` at the precision actually established. Link a registered original metadata source through `source_id`; inspect its submission/version history instead of guessing from a title or treating the latest revision as first publication. Main and concept-background nodes show the first-publication year; details retain the recorded precision, edition date and source link. Legacy inputs without this field remain readable with an explicitly unknown publication year.

Do not append conference years to `short_title` as a substitute for date metadata. Preserve supplied original titles, but author new short labels as names and let `publication` provide the date. A title can contain a year without establishing a first-publication date. Local-only metadata sources (`url:null`) retain their title, locator and checked scope in the detail panel without an invented URL.

For a paper-relation map, record optional `citations: {count, checked_on, source_id}` from a bibliographic index entry matched to that paper. Use a nonnegative integer and a full calendar date (`YYYY-MM-DD`). Compare a single index across a map where practical, and record the matched edition in the source scope. Keep an observed zero and omit an unavailable count. When counts are present, the map scales nodes from 156 × 108 to 204 × 120 px using a fixed square-root scale capped at 150,000 citations. An unavailable count uses the minimum size, and maps without counts use the standard 184 × 108 px size. Counts above the cap retain their exact value in the reader.

Optional `venue_rank: {venue, scheme, edition, rank, top_tier, venue_source_id, source_id}` connects a verified publication venue to the official ranking for the relevant discipline. Use the proceedings, journal, or publisher record for `venue_source_id` and an official ranking entry for `source_id`. Both registered sources need a public URL. Check the title, authors, track, and final publication venue before linking a preprint to a venue rank. Omit the field when the venue, applicability, or grade is unknown. The offline view can check the shape and source links. The agent preparing the input must verify that the sources actually support the match and the stated grade.

For computing conferences, use the latest published ICORE edition unless the user requests a specific historical edition. Record the edition separately from the paper's publication year. For `ICORE` and historical `CORE`, confirm that the paper was published as a full paper in the main track. Link the individual official entry at `https://portal.core.edu.au/conf-ranks/<id>/` and retain its grade. The view colors `A*`, `A`, `B`, and `C` and explains each grade in the guide. It keeps the distinct `Australasian B`, `Australasian C`, and `Unranked` designations when an official entry supports them.

For journals, use `JCR` for a JIF quartile confirmed from Clarivate or an official publisher record reporting it. Record the JCR data year and, when the source reports it, set the optional `venue_rank.category` to the subject category for that quartile. Use the category relevant to the map when several are available. The paper details show that category or say that the category is unreported. The view colors `Q1`–`Q4` and explains all four quartiles using [Clarivate's definitions](https://supportcenter.clarivate.com/s/article/Journal-Citation-Reports-Quartile-rankings-and-other-metrics?language=en_US). Other JCR values display as **Rank unverified**.

For the `Norwegian Register`, verify the publication channel's grade for the edition year on its official entry. When a verified entry appears on a map, the guide explains both approved levels and links to the [official definitions](https://kanalregister.hkdir.no/en/informasjonsartikler/levels-and-changes-in-levels). When an entry has `Level 0`, the guide explains that the register has not approved the venue. The guide also links to the ranking sources for grades represented on the map.

Keep the original scheme, edition and grade for other schemes. The guide lists the grades represented on the map with their sources. Set `top_tier: true` only if the authoritative source supports that description. A venue rank describes the venue. Show **Rank unverified** when a grade cannot be established from publication and ranking sources.

The skill's agent checks the sources while preparing a new map. The renderer checks the input and embeds the matching guide and agent-recorded grades in the HTML automatically. The built-in guide uses a separate scale for each scheme. Each generated map displays the saved edition offline. Regenerate the map to reflect new evidence or changes to the built-in guide.

Add the new source scopes to the evidence gate's performance screening plan. Use `not-checked` for catalog references without a supported archived original. Keep the paper-passage and publication-date evidence bindings intact.

`review_status` describes the saved Paper record, not publication draft status or academic peer review. It stays in the input for compatibility and is not a node badge. Current passage reviews and archived originals describe what was actually checked. State AI authorship once for the view and keep source relationships distinct from suggested readings without repeating authorship on each concept.

Make original card conditions/limits available on representative-claim and project-reference reading paths, not only separate Paper notes. Distinguish card commentary/review scope from author claims. IDs begin with an English letter/digit and contain letters/digits/dot/underscore/hyphen. Claim IDs are Paper-local; always reference `{paper_id,claim_id}`. Keep input order; do not sort relation direction by dates.

### Optional concept backgrounds

For v2 `paper-relations` only, add `concepts` and `backgrounds` together when a reading question reveals a useful background concept. Both are optional arrays; existing v1/v2 inputs remain supported. A previous generator rejects these new fields, so new inputs require the updated complete skill folder. No core Paper/Application/Relation schema is changed. See the [synthetic example](../assets/paper-backgrounds.v2.example.json).

| Record | Fields and meaning |
| --- | --- |
| Concept | `{id,title,summary}`; a distinct concept with an AI explanation, never a fabricated Paper |
| Background | `{id,paper_id,concept_id,origin,status,rationale,readings}`; current paper, concept, and why exploring it may help. `origin` must be `ai`, `status` must be `proposed` |
| Representative reading | `{paper_id,rationale,evidence,return_question}`; a different registered Paper, why it was selected for this purpose, selected source IDs, and an AI question for comparison after returning to the current paper |

IDs are unique within each record kind. A paper/concept pair appears once, and its reading list has at least one distinct Paper. Selected evidence must be registered on a claim of that representative Paper; do not borrow another paper's URL or manufacture a locator. An empty evidence list preserves missing-location uncertainty. Keep the source's recorded edition, reading scope and verification limits. Representative selection is not a historical first-invention claim, an author citation, or evidence of exhaustive coverage.

The current paper offers **Explore background** choices. Selecting one opens a focused map of the current Paper → Concept → representative Papers, with distinct concept/visual identity and explicit AI labels. Returning restores the relation map's filters, zoom, pan and node positions within the current page session. A background Paper keeps its original source shortcut and adds **Return to current paper** plus the comparison question. Hash links reopen the selected background context without completing or marking a reading; reloading does not persist the previous map camera or filters. Only the registered selection is expanded; there is no recursive reference crawl or full-paper requirement.

Keep the three meanings separate:

- **Actual citation:** existing `relations` with `kind:cites`, pointing from the citing Paper to its cited Paper. Record the checked edition and source location; preserve an unspecified cited subversion as unknown.
- **Concept background:** `concepts/backgrounds`, including the task-specific selection reason and selected reading locations. The focused map is an AI learning aid, not a citation graph.
- **Suggested order:** existing `kind:reading-order`, normally `origin:ai`, `status:proposed`, `review:null`, pointing from earlier reading to later reading for this task. It does not assert chronology, historical priority or strict prerequisites.

New concept/background prose participates in the existing source-count and performance screening. Regenerate the canonical overview and performance plan after adding it; missing or stale reviews still prevent HTML generation. A passing gate is not a source-semantic or reader-understanding certificate.

### Project application

Add only `project` and `applications` to common fields:

- `project:{id,title,question,conditions}`; conditions is a string array. One view represents one project; generate separately for different projects.
- Application: `{id,title,claim_refs,interpretation,observations,next_checks,decision}`. At least one claim_ref may span multiple Papers. Interpretation is AI reading for the project, observations are recorded project facts and next_checks are proposals. Do not invent observations/checks; empty proposal arrays are valid.
- `decision:{status,action,rationale}` preserves `proposed|accepted`; action is `apply|adapt|test|defer` or null if unspecified. Display an unrecorded rationale as such. Accepted+defer and accepted+null action are valid; adoption is not experiment success.

### Paper relations

Add only `relations`. Relation: `{id,source,target,kind,origin,status,needs_recheck,rationale,created_by,review,evidence_refs}`. Omit snapshots from derived views; do not update originals.

- Map native `recorded_status` to candidate `status`, native `stale` to `needs_recheck`. Copying display status alone loses prior checks. Resolve unavailable freshness evidence rather than guessing.
- kind: `cites|extends|compares|related-to|reading-order`. Preserve source → target. First three run from the asserting paper toward its cited/extended/compared target; reading order runs earlier → later. Preserve stored related-to direction without automatic reverse edges.
- origin: `source|ai`; status: recorded `proposed|source-checked`; needs_recheck: boolean. Preserve all independently. Stale source-checked is not currently valid; AI+recheck must show both.
- Preserve evidence_refs and every linked Claim's locator/scope, including evidence used only by a relation. Empty arrays are allowed.
- review: original `{checked_by,checked_at}` or null. Time is ISO with timezone. Source-checked needs a review and at least one evidence_ref. Never invent checker/time/location to pass validation. Validate native semantic constraints separately with supported CLI commands.

## v2: preserve actual questions and context

Keep v1 fields and add the following. This is not a general layout/HTML DSL. Use actual authorized local material; never copy private records into distributed examples.

| Location | Additional fields |
| --- | --- |
| Root | `scope`: included/excluded scope; `provenance`: `{name,sha256}` original-byte hashes, not proof of truth/meaning |
| Paper | `short_title`; `notes`: a string array preserving card check scope, conditions, limits, comparison and AI interpretation with labels; use `[]` when none, never a single string |
| Claim | `reviews`: `{verdict,reason,scope,reviewer,reviewed_at,review_type,state}`; verdict `supported\|partially_supported\|contradicted\|insufficient_evidence`, state `current\|stale\|unknown`; preserve original pages/sections/edition/warnings; empty if none, without invented review |
| Application | `conditions_comparison`: project/source differences and non-transferable limits, linked to existing body or empty |
| Project root | `map_view`: `applications\|context`; `project_context`: object below or null; context only for an actual learning/question connection request |

`project_context:{title,notice,start,items,links}`. Items: `{id,title,summary,body,example,claim_refs}` using existing concept/question units, explanations and examples; body is a string array. References are a subset of actual Paper/Claim connections in the current Application. Do not fabricate evidence for background concepts. Links: `{source,target,label}`, preserving existing AI-proposed order/endpoints/reasons. notice explicitly labels AI order and absence of understanding certification. This is not source causality.

Use current native loader/API review-validity results. If export lacks them and no validity path is available, preserve `unknown`; do not invent a hash checker to claim current status. Preserve historical reviews without turning them into new checks. Show whole-Paper draft, per-claim review, relation review and project decision separately. Retain conditions/limits/disagreements in default reading; checker/time/full history may expand in details. Do not copy private learner answers into context or review packets.

<a id="생성과-검수"></a>

## Generation and reading

For relations, use the [verified overview/count path](evidence-gate.md). These commands save project-application mode only, creating a new .html without overwriting:

```text
node <skill>/scripts/render-research-view.mjs candidate.json --check
node <skill>/scripts/render-research-view.mjs candidate.json --out new-view.html
```

`--check` reads CSS/JS and renders in memory. Resolve input/reference/missing-installation errors; structural success is not source accuracy or visual reading. Receipts retain `structure-only`, `visual_review:not-run`. No input/card/relation/snapshot/learner-state writes, embedded instruction execution or automatic source downloads occur.

First follow one actual-ID task. Compare counts, endpoints/types/references/conditions and original hashes; map/list must choose identical evidence. Synthetic tests do not replace this check. Read actual desktop output at 1280×800 or 1440×900, 100% size, including titles/body/conditions/limits/status/locations. Check relevant record switching, incoming/outgoing direction, recheck badges, empty observations, isolated papers, evidence expansion, keyboard skip and hash reopen. Fix initial errors before delivery. Distinguish structure, rendering and user evaluation. Design and verify PC and laptop desktop browser workflows only.
