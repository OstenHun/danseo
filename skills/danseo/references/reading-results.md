# Assemble reading results into a map

Summary: Record each paper's reading in one file and let the assembler build the candidate and evidence files. The evidence gate still decides whether the map can be saved.

## When to use it

Use this path when the originals behind the displayed claims are saved in the output directory, as a PDF with page-aligned text or as the downloaded HTML. You write what you read and judged. The assembler hashes the files, works out where each sentence lands in the candidate, computes the table-comparison text and the overview, and writes `candidate.json` and `evidence.json`. Do not write a helper script for those steps.

[Source verification](relation-verification.md) comes first and the [evidence gate](evidence-gate.md) comes after. The assembler makes no judgment and certifies nothing. A hand-written candidate and evidence pair still works with the gate.

## Run directory

Keep one map in one directory. Every path in the map plan and in the reading results is relative to the directory that holds `map.json`, and cannot leave it.

```text
map.json                      map plan (you write)
readings/<paper>.json         one reading result for each paper (you write)
sources/<paper>.pdf           archived original
sources/<paper>.pages.json    {"pdf_sha256": "...", "pages": [{"page": 1, "text": "..."}]}
sources/<paper>.html          archived original HTML, when there is no PDF
candidate.json                written by the assembler
evidence.json                 written by the assembler
assembly.json                 written by the assembler: hashes of the files it wrote
```

Start from the synthetic [reading result](../assets/reading-result.example.json) and [map plan](../assets/map-plan.example.json). They show field shapes, not real research.

## Displayed text carries its performance judgment

The gate screens the map's prose for performance claims. Each screened field, called "displayed" in the tables below, is an object and never a bare string. Paper titles, source titles and locators, IDs, dates and quotes stay plain values.

```json
{
  "text": "The method retrieves passages in two passes.",
  "performance": { "kind": "non-performance", "reason": "Describes the procedure only." }
}
```

Give the actual reason for each field. Comparative wording cannot be marked `non-performance`; see the [performance checks](performance-verification.md).

For a result taken from a source table, leave `text` out. The assembler writes the exact report from the table rows:

```json
{
  "performance": {
    "kind": "table-comparison",
    "reason": "Same-generator rows; keeps the Task-B exception.",
    "comparison": {
      "table_id": "TwoPass.Table1",
      "pairs": [{ "condition": "Generator-A", "method": "Method", "baseline": "Baseline" }],
      "assertion": "report"
    }
  }
}
```

## Reading result

One file for one paper. `version` is 1.

| Field | Content |
| --- | --- |
| `paper` | `id`, `title`, `edition` (or null), `review_status`, displayed `short_title` and `notes`. Optional displayed `topic` and `reading_reason`. Optional `citations`, `venue_rank` and `additional_venue_ranks`, copied as in the [view contract](research-view.md#prepare-candidate-input). |
| `sources` | The candidate source fields `id`, `title`, `url`, `locator`, displayed `scope` and `verification`, plus `archive`. |
| `sources[].archive` | `{"format": "pdf", "document_path", "text_path"}`, `{"format": "html", "document_path"}`, or null for a source that backs no quoted passage, such as a citation index entry. |
| `publication` | `source_id`, `first_publication` and `edition`, each `{"date", "page", "quote"}`. Use `edition: null` when the selected edition's date is not established, and `publication: null` when no date was checked. |
| `claims` | `id`, displayed `statement`, `conditions` and `limitations`, `evidence` and `reviews`. |
| `claims[].evidence` | One `{"source_id", "page", "quote"}` for each source that backs the claim. `page` is the PDF page number, or null for HTML. |
| `claims[].reviews` | Your support verdicts for this reading: `verdict`, displayed `reason` and `scope`, `reviewer`, `reviewed_at`, `review_type`. Leave the list empty until you have compared the wording with the passage. |
| `tables` | Complete source tables in the [table format](performance-verification.md#evidence-v2-additions). Use an `id` no other paper uses. |

Quote the passage that states each date, as described in the [completion rules](evidence-gate.md#finish-source-checking-before-normal-delivery). Record only dates, passages and verdicts you established from the archived original.

A reading result uses its own sources or a shared source from the map plan, for quoted passages, tables, citation counts and venue ranks. It cannot use a source that another paper's reading result defines: that would attach the other paper's date, passage or table to this one.

## Map plan

`map.json` holds what spans papers. `version` is 1.

| Field | Content |
| --- | --- |
| `title` | Displayed map title or question. |
| `language` | `en` or `ko`. |
| `start`, `focal_paper_id` | As in the [view contract](research-view.md#prepare-candidate-input). `focal_paper_id` is optional. |
| `readings` | Reading result paths. Their order is the paper order. |
| `sources` | Sources shared by several papers, in the reading-result source shape. Use `[]` when there are none. |
| `relations` | Candidate relations, with a displayed `rationale`. |
| `concepts`, `backgrounds` | Optional [concept backgrounds](research-view.md#optional-concept-backgrounds). Concept `title` and `summary`, background `rationale`, and reading `rationale` and `return_question` are displayed text. |
| `completion` | null until the source checks for everything displayed are finished, then the declaration below. |

Paper, source and table IDs must be unique across the map. The assembler does not rename them.

### Declare completion

Assemble with `completion: null` until the check is clean. Finish the [source checks for normal delivery](evidence-gate.md#finish-source-checking-before-normal-delivery) against that final wording, then copy `content_sha256` from the assembler receipt into the declaration:

```json
{
  "checked_by": "<actual checking agent>",
  "checked_at": "<observed ISO time with timezone>",
  "scope": "<actually checked claims, relations, dates and excluded material>",
  "content_sha256": "<content_sha256 from the receipt>"
}
```

The value identifies the assembled wording and every evidence binding, including the hashes of the archived files. If the plan, a reading result or an archived file changes afterwards, or an updated skill computes a different sentence, the assembler refuses the old declaration: reread what changed and declare again. Copying a new value without rereading is not a source check.

## Commands

```sh
node <skill>/scripts/assemble-readings.mjs map.json --check
node <skill>/scripts/assemble-readings.mjs map.json --write
node <skill>/scripts/render-verified-research-view.mjs candidate.json --evidence evidence.json --check --complete
```

`--check` reports problems without writing. `--write` writes `candidate.json`, `evidence.json` and `assembly.json` beside `map.json`. It replaces its own earlier output only while those files are unchanged, and refuses to replace a file that was there before or was edited since; move that file or use another directory. Then continue with the [evidence gate](evidence-gate.md) from its verified check: use `--complete` after declaring completion, or the plain check for an explicitly partial exploration.

An error in an input's shape starts with the input file and field, for example `readings/two-pass.json: claim C.Method.statement: missing performance judgment`. Fix that reading result and assemble again. A value the [view contract](research-view.md#prepare-candidate-input) rejects, such as an unknown verdict or relation endpoint, is reported in candidate terms without a file name, for example `claim.review.verdict: expected ...`. When the gate fails, correct the reading result or map plan and assemble again; do not edit `candidate.json` or `evidence.json` by hand, because the completion record binds both files.

## What is checked where

- The assembler checks the input shape, that every displayed field has a judgment, that IDs do not collide, that each paper uses its own or shared sources, that paths stay inside the directory and that a completion declaration names the current content. Its receipt reports `evidence_gate: not-run`.
- The gate checks hashes, quotes on their pages, dates in their quotes, table rows, performance wording and completion. A claim with no review assembles, and the complete check then rejects it.
- Neither step establishes that a passage supports a claim. That remains your source check.

## Limits

- Record or pair counts that need a [count binding](evidence-gate.md#evidence-format) are not supported in reading results. The assembler writes `counts: []`, so the gate rejects such a sentence. Report the sentence instead of rewording the number away.
- The skill does not extract page text from a PDF. Prepare `pages.json` with the host's tools and keep the text as extracted.
- A claim binds one passage for each source.
- The format is version 1 and may change before a formal release.
