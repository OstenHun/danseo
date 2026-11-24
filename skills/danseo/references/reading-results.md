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

The gate screens the map's prose for performance claims. Each screened field, called "displayed" in the tables below, is an object and never a bare string. This is the whole list:

| File | Write as `{text, performance}` | Keep as plain values |
| --- | --- | --- |
| Reading result | `paper.short_title`, each entry of `paper.notes`, `paper.topic`, `paper.reading_reason`; each source's `scope`; each claim's `statement` and each entry of its `conditions` and `limitations`; each review's `reason` and `scope` | `paper.title` and `paper.edition`; a source's `title`, `locator` and `url`; every `quote`, date and ID; reviewer names and times; everything inside `tables` |
| Map plan | `title`; each shared source's `scope`; each relation's `rationale`; each concept's `title` and `summary`; each background's `rationale`; each background reading's `rationale` and `return_question` | `completion` and every other relation, concept and background field |

```json
{
  "text": "The method retrieves passages in two passes.",
  "performance": { "kind": "non-performance", "reason": "Describes the procedure only." }
}
```

The `reason` says why that field makes no performance claim. A field that only names a location or a check, such as a source `scope`, still needs one, and a short reason is enough.

Comparative wording cannot be marked `non-performance`. The gate looks for words of surpassing or superiority, "better", "best", "faster", "state of the art", a Korean measure word followed by a change such as improving, and "higher" or "lower" followed by "than", "score", "performance" or a known metric name. Its error quotes the wording it matched. See the [performance checks](performance-verification.md#blocking-and-limits) for what to do then, including the one case where rewording is right. The word list is a tripwire and not a definition: a sentence that compares results needs a table comparison even when no word is caught, as in "accuracy is higher".

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

Record only dates, passages and verdicts you established from the archived original.

A reading result uses its own sources or a shared source from the map plan, for quoted passages, tables, citation counts and venue ranks. It cannot use a source that another paper's reading result defines: that would attach the other paper's date, passage or table to this one.

## Sources, pages and quotes

You write sources and passages. The assembler turns them into the evidence file's `sources`, `source_checks`, `claim_checks` and `publication_checks`; never write those yourself.

### A source is one place you read

The map shows a source by its `locator` and `scope`. It does not show the quote or the page of a passage, so the `locator` is how a reader finds the passage behind a claim. One entry can cover a few nearby places, as the example does with `p. 1 header · p. 2 §3 · p. 3 Table 1`, and every claim citing it then shows that whole locator. When a paper has many cited places, give each section, table or figure its own entry with a precise `locator`, for example `p. 3 · §3.1 Encoder`. Several entries may name the same archived files in `archive`, and different claims may cite one entry with different passages.

- `url` is the public address of the original. A source whose HTML archive you quote must have one. A local PDF may use null.
- `verification` is `agent-checked` only when the entry has an archive and backs at least one quoted passage, in a claim or in `publication`. Otherwise use `not-checked`.

### The page belongs to the passage

Each passage carries its own `page`: `claims[].evidence[].page`, `publication.first_publication.page`, `publication.edition.page` and a table's `page`. A source has no page field.

- PDF archive: the `page` number of the `pages.json` entry that contains the quote.
- HTML archive: null for a claim or date passage. A table cannot come from an HTML archive: it needs a PDF archive and its page number.

### How a claim or date quote is matched

- The quote must be one continuous run of text from that page of `pages.json`, or from the saved HTML outside its `head`, scripts and styles. It cannot continue onto the next page.
- Copy it from `pages.json` or the saved file, not from a rendered page. Differences in line breaks and spacing are ignored. Letter case, punctuation and hyphenation must match.
- In HTML, each tag counts as a space and character entities are not decoded: text saved as `A &amp; B` must be quoted as `A &amp; B`.
- Start and end the quote at whole words and whole numbers. The gate rejects most quotes that cut a word or a number, but not every one, so a passing check does not show that the quote is whole.
- A claim quotes one passage from each source it cites. To cite two places, use two source entries.

A table's `quote` is matched by the [table format](performance-verification.md#evidence-v2-additions) rules instead, which ignore letter case.

### Dates

`publication.source_id` names the one source that states both dates. Write each `date` as `YYYY`, `YYYY-MM` or `YYYY-MM-DD` and quote the passage that states it. The gate reads these written forms in the quote: `2017-06-12` or `2017/06/12`, `12 Jun 2017`, `June 12, 2017`, `June 2017` and `2017년 6월 12일` (12 June 2017), with month names in full or as three letters. A year-only date needs the year as a whole word. A quote may be more precise than the date you record, never less. The gate compares a date with its quote only in the complete check; the plain check accepts a date its quote does not state. The [completion rules](evidence-gate.md#finish-source-checking-before-normal-delivery) say which dates a complete map needs.

### Tables that fit

A table can fit only when it has one line of column labels, one line of metrics in the same order, condition headings, rows of the form `method value value` and a caption line after the rows. The [table format](performance-verification.md#evidence-v2-additions) has further limits, for example on a method name that ends in a separate number and on values with more than 15 significant digits. A table with merged or multi-level headers, exponents such as `3.3 · 10^18` or value ranges does not fit. Do not reshape such a table or pick rows from it. A sentence that compares its results then has no supported form: treat it as an unsupported claim under step 5 of the [default procedure](performance-verification.md#default-procedure).

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
node <skill>/scripts/render-verified-research-view.mjs candidate.json --evidence evidence.json --check

# After declaring completion in map.json, assemble with --write again, then:
node <skill>/scripts/render-verified-research-view.mjs candidate.json --evidence evidence.json --check --complete
node <skill>/scripts/render-verified-research-view.mjs candidate.json --evidence evidence.json --out view.html --complete
```

`--check` reports problems without writing. `--write` writes `candidate.json`, `evidence.json` and `assembly.json` beside `map.json`. It replaces its own earlier output only while those files are unchanged, and refuses to replace a file that was there before or was edited since; move that file or use another directory. Then continue with the [evidence gate](evidence-gate.md) from its verified check. The plain gate check works before completion is declared. After declaring completion and assembling again, run `--check --complete`, then save with `--out`. The gate does not overwrite an existing HTML file. Leave `--complete` out only for an explicitly partial exploration.

An error in an input's shape starts with the input file and field, for example `readings/two-pass.json: claim C.Method.statement: missing performance judgment`. Fix that reading result and assemble again. A value the [view contract](research-view.md#prepare-candidate-input) rejects, such as an unknown verdict or relation endpoint, is reported in candidate terms without a file name, for example `claim.review.verdict: expected ...`. When the gate fails, correct the reading result or map plan and assemble again; do not edit `candidate.json` or `evidence.json` by hand, because the completion record binds both files.

## What is checked where

- The assembler checks the input shape, that every displayed field has a judgment, that IDs do not collide, that each paper uses its own or shared sources, that paths stay inside the directory and that a completion declaration names the current content. Its receipt reports `evidence_gate: not-run`.
- The gate checks hashes, quotes on their pages, dates in their quotes, table rows, performance wording and completion. A claim with no review assembles, and the complete check then rejects it.
- The complete check needs at least the following. For every paper: a `publication` whose first date is quoted from an `agent-checked` source, at least one claim, and a `review_status` other than `needs-recheck`. For every claim: at least one passage, every cited source `agent-checked`, and at least one review, with every review `supported` and timed (with a timezone) no later than the declaration's `checked_at`. Relations and background readings have their own requirements; the [completion rules](evidence-gate.md#finish-source-checking-before-normal-delivery) are the full list.
- Neither step establishes that a passage supports a claim. That remains your source check.

## Limits

- Record or pair counts that need a [count binding](evidence-gate.md#evidence-format) are not supported in reading results. In a paper's `notes` and `reading_reason`, a claim's `statement`, `conditions` and `limitations`, and concept and background text, the gate treats a number followed by "record", "records", "pair" or "pairs", or by the Korean `레코드` or `기록` (record) or `쌍` (pair), as such a count. A Korean counter word such as `개` or a short parenthesis may stand between the number and the unit. A document count alone is not one, and a table-comparison report may repeat a count from its own table block. The assembler writes `counts: []`, so the gate rejects any other such sentence. Report the sentence instead of rewording the number away.
- The skill does not extract page text from a PDF. Prepare `pages.json` with the host's tools and keep the text as extracted.
- The format is version 1 and may change before a formal release.
