# Relationship HTML overview and count gate

Summary: Derive overviews from relation states and bind counts to source files, pages and excerpts. Only passing candidates can be saved; meaning and rendering need separate checks.

<a id="기본-생성-흐름"></a>

<a id="evidence-형식"></a>

<a id="검사-범위와-한계"></a>

## Default generation workflow

Claude, Argon and Codex use the same Node generator. First perform [source verification](relation-verification.md); this gate does not replace it.

1. Prepare a version-2 `paper-relations` candidate using the [complete example's field shapes](../assets/paper-relations.v2.example.json), not its synthetic records. Root `scope` and `provenance` are required; hash actual input files as `{name,sha256}` provenance entries. Paper `notes`, Claim `conditions`/`limitations` and `reviews` are arrays (`[]` if unrecorded). Separate checked source relations from AI proposals (`origin: ai`, `status: proposed`, `review: null`). Run `node <skill>/scripts/render-research-view.mjs candidate.json --check` and resolve structural errors before the following steps.
2. Set the standalone candidate's `language` to match the request (`ko` or `en`), then update `description`, `view_reason`, `scope` from `node <skill>/scripts/render-verified-research-view.mjs candidate.json --overview`. Regenerate after status or language changes. These deterministic structural notices follow `language`, defaulting to English for old inputs. Preserve valid old overview conditions/exclusions in Paper notes or source.scope, in the requested prose language, without overwriting the original candidate.
3. Prepare evidence v2 and [performance reviews](performance-verification.md). Put recognized counts in separate conditions/notes using exact `countText` output. Preserve experimental conditions, limits, metrics and directions in adjacent fields. Never remove numbers or spell them out to evade checks.
4. Run `node <skill>/scripts/render-verified-research-view.mjs candidate.json --evidence evidence.json --check`. Return to the named field and source on failure.
5. For normal delivery, finish the displayed-source checks and bind completion as described below, then run the same candidate/evidence with `--out new-view.html --complete`. Checks rerun immediately before saving; existing files are not overwritten.
6. Read actual source/AI labels, counts, evidence selection and text. Do not deliver failed results as complete; state remaining checks.

When the originals are archived in the output directory, steps 1 to 3 can come from per-paper [reading results](reading-results.md): the bundled assembler writes the candidate, overview, hashes, performance reviews and completion binding from what you recorded for each paper, replacing the binding snippet below. Continue from step 4 with the files it writes.

Use actual command results during this loop. A failed command does not create a passing output: fix the named field against the input contract/source, rerun structural checks after candidate edits, regenerate affected overview/performance reviews, then rerun the verified check and save. Preserve uncertainty rather than inventing missing provenance, evidence, checker names or timestamps. Stop and report the diagnostic when a required source or execution capability is unavailable. Do not substitute `renderCandidate()` or manual HTML for a blocked verified save.

`render-research-view.mjs --check` checks structure only. Its relationship `--out` route is blocked; use the verified generator above. `project-application` keeps its existing command. Pure `renderCandidate()` is a library function, not a verified-output API.

## Evidence format

### Finish source checking before normal delivery

`--complete` applies to `--check` or `--out`, as the last argument. It requires source-linked publication metadata for every Paper, a current supported passage review for every displayed Claim, archived and directly checked originals for their evidence, source-checked source-origin relations, and no stale relation or Paper evidence. Background readings and interpretive relations must reference checked supporting material; their origin remains a suggestion. Do not promote an interpretation into a source relation or mark a whole Paper checked merely because the selected passages were checked.

Add evidence `claim_checks` entries `{paper_id,claim_id,source_id,quote}` for each displayed claim/evidence-source pair. Add `publication_checks` entries `{paper_id,source_id,kind,date,quote}` for each Paper's date: `kind` is `first-publication` or `edition`, and `date` equals that exact metadata field. Each quote must match a corresponding archived `source_checks` quote for the same source. Date quotes must actually contain the recorded date at its declared precision; ISO/slash dates, English month names and Korean year/month/day are recognized. Preserve the original quotation rather than rewriting it to satisfy the matcher. The date must not be later than the observed check time, and passage/relation reviews must not postdate completion. These explicit bindings make the inspected passages traceable; matching text is still not a semantic truth check.

Calendar-only dates have no timezone. The future-date check rejects only dates whose earliest possible period start at UTC+14 is after the observed check instant; it must not reject a KST morning just because UTC is still on the previous day. The completion timestamp itself cannot be in the future, allowing one minute of clock skew. The generated header attributes completion to the recorded source checks and exposes the actual `completion.scope` in an expandable reading view. This is the checking agent's recorded work, not an independent scientific certificate or the reader's own completed reading.

After actually rereading the relevant original passages, checking each claim/relation meaning and publication/version history, bind the final candidate and evidence with optional evidence `completion`:

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { hash } from './view-core.mjs';
import { completionEvidenceHash } from './research-evidence.mjs';
const bytes = readFileSync('candidate.json');
const evidence = JSON.parse(readFileSync('evidence.json', 'utf8'));
evidence.completion = {
  candidate_sha256: hash(bytes),
  evidence_sha256: completionEvidenceHash(evidence),
  checked_by: '<actual checking agent>',
  checked_at: '<observed ISO time with timezone>',
  scope: '<actually checked claims, relations, dates and excluded material>'
};
writeFileSync('evidence.json', JSON.stringify(evidence));
```

The imports above are relative examples. Keep the helper with the candidate in an authorized output directory and replace the imports with the actual installed script paths; do not add a helper to the installed skill folder. This binds a completed check; running the snippet is not a source check. Changing candidate text or evidence bindings requires rereading the affected material and renewing completion. The gate rechecks archive hashes and excerpts before writing. It checks the existence/consistency of the submitted source and review records; date interpretation, claim meaning and publisher authenticity still require the actual original-source inspection.

If a necessary original remains unavailable, keep the truthful states and explain the missing checks. An explicitly partial delivery can use the existing command without `--complete` and without a completion record; its HTML and receipt identify it as exploration. Never silently fall back after a failed complete check, erase a completion record to bypass a failure, or describe exploratory output as finished. Existing exploratory candidates remain compatible. Incomplete source access is not a reason to invent a date, archive, quotation or review.

All paths are relative below the evidence.json directory, including resolved symlinks. Hash actual PDF/extracted JSON bytes. Each source file must be at most 32 MiB; larger files are unsupported here.

```json
{
  "version": 2,
  "sources": [{
    "id": "S.Example",
    "document_path": "source.pdf",
    "document_sha256": "<64 lowercase hex characters>",
    "text_path": "pages.json",
    "text_sha256": "<64 lowercase hex characters>"
  }],
  "counts": [{
    "path": "/papers/0/claims/0/conditions/0",
    "source_id": "S.Example",
    "page": 2,
    "quote": "17 records (15 documents, 60 pairs)",
    "items": [
      {"unit": "records", "value": 17},
      {"unit": "documents", "value": 15},
      {"unit": "pairs", "value": 60}
    ]
  }]
}
```

Counts in table-report footnotes are checked against the actual block's excerpt, units and values without also forcing the general countText sentence. General count sentences retain exact-format requirements.

Add `tables` and `performance` arrays from the [performance contract](performance-verification.md). Review all performance-plan fields even without performance claims. Old v1 evidence is rejected for new HTML. The example is synthetic. Obtain exact count display text with `research-evidence.mjs` → `countText(binding)` rather than composing it manually; `countMentions(quote)` extracts units/values. Added equations or interpretations fail exact matching.

The candidate's `sources` and the evidence file's `sources` serve different purposes. Candidate sources describe the material actually read; provenance hashes can identify supplied Markdown or other authorized input. Evidence sources bind count/table/performance checks to original PDFs and page-aligned text. Do not add an evidence source for every candidate source by default. If inspection finds no count bindings, tables or performance claims, use `sources: []`, `counts: []`, `tables: []`, and review every `--performance-plan` entry as `non-performance` with its actual reason (and `comparison: null`). This still requires source inspection and a verified check. Do not wrap non-PDF material as a fake PDF or invent page text to pass. Real counts or performance claims still require the applicable source-bound evidence; missing originals remain a blocker.

Extracted JSON is `{"pdf_sha256":"<original PDF hash>","pages":[{"page":2,"text":"..."}]}`. Checks cover PDF-hash linkage, page number, whitespace-normalized excerpt inclusion and ordered count values/units. source_id must be linked through candidate sources and the claim's evidence (or a claim on that Paper for notes). Never infer missing units/values/sources. With no counts, use an empty counts array. Performance sources must be connected through sources/tables with every target field reviewed.

## Scope and limits

- Automatic count targets: Paper notes and claim statement/conditions/limitations containing Arabic-number records/pairs or their supported Korean equivalents. Documents mentioned in the same field are also checked. A documents-only retrieval setting, such as top 5 documents, needs agent source checking. Comma thousands and parenthesized pair markers are supported; arbitrary quantities, written-out Korean numbers and natural-language equivalence are not certified.
- Performance checks validate field reviews and table calculations, not general semantics. Overview checks cover three structural summary fields, not arbitrary titles/rationales/claims. Checked states additionally require original-source records below; verifying their meaning remains the source-check workflow's responsibility.
- Hashes detect later source/extraction changes; excerpt checks establish agreement with submitted extracted text. Trustworthy extraction and actual PDF content need original-page inspection. This is not a detector for an agent forging both sources and hashes.
- Receipts retain `source_semantics:not-certified`, `visual_review:not-run`. Never report these as semantic/visual completion; attach separate evidence.

Run `node --test <skill>/scripts/research-evidence.test.mjs` for development regressions. Distinguish synthetic tests from real-paper runs. Canonical overview notices follow `language`; deterministic count/comparison evidence reports remain English. Agent-authored research prose follows the requested language and is preserved by the renderer.

## Original source checks

For verified saves, an `agent-checked` candidate source, a `source-checked` Paper, or a current `source-checked` relation (`needs_recheck:false`) requires archived original evidence. Add optional `source_checks` to evidence v2 (omit it or use `[]` for unchecked work):

```json
{
  "source_checks": [{
    "source_id": "S.Example",
    "url": "https://example.org/original",
    "format": "html",
    "document_path": "original.html",
    "document_sha256": "<actual SHA-256>",
    "page": null,
    "quote": "An exact short body-text fragment from the inspected original."
  }]
}
```

Save the actual downloaded original HTML bytes, not a model-written wrapper or summary, under the evidence directory. The exact registered URL, confined local path, file hash, HTML marker and excerpt must agree. Choose a contiguous body-text fragment without intervening markup/entities; comments and head/script/style/noscript/template blocks are excluded. CSS visibility still needs rendered inspection. Candidate source `locator` records the actual section; the quote must support the linked claim/relation, which still needs semantic inspection. For `format:pdf`, use the original PDF path/hash already registered in evidence `sources`, an actual integer `page` and its page-aligned excerpt. A supplied local original PDF may use matching `url:null`; do not invent a remote URL. Do not fake a PDF or HTML file to satisfy this gate.

All evidence source IDs referenced by a current checked relation, or any claim on a checked Paper, need these records; empty claim evidence cannot establish checked status. A current checked relation must reference a claim from its asserting/source Paper; another paper's archive alone cannot establish that citation, extension or comparison. New Papers remain `draft` when only selected passages were checked. A historical checked relation may retain its history with `needs_recheck:true`; it is not counted as a current checked connection. Existing unchecked maps need no new records. Older checked candidates may need original evidence or an honest derived status correction before a new verified save; structural-only validation still accepts their original shape.

The gate detects missing/stale/mismatched submitted evidence. It cannot prove that an agent fetched the file from its claimed publisher, that a chosen quote supports the interpretation, or that a whole paper was read. Do not manufacture receipts or call this semantic certification. Preserve summary-only inputs as `not-checked`/`draft`/`proposed`; do not lower evidence requirements or silently alter candidate files to pass.
