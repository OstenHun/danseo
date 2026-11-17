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
5. Run the same candidate/evidence with `--out new-view.html`. Checks rerun immediately before saving; existing files are not overwritten.
6. Read actual source/AI labels, counts, evidence selection and text. Do not deliver failed results as complete; state remaining checks.

Use actual command results during this loop. A failed command does not create a passing output: fix the named field against the input contract/source, rerun structural checks after candidate edits, regenerate affected overview/performance reviews, then rerun the verified check and save. Preserve uncertainty rather than inventing missing provenance, evidence, checker names or timestamps. Stop and report the diagnostic when a required source or execution capability is unavailable. Do not substitute `renderCandidate()` or manual HTML for a blocked verified save.

`render-research-view.mjs --check` checks structure only. Its relationship `--out` route is blocked; use the verified generator above. `project-application` keeps its existing command. Pure `renderCandidate()` is a library function, not a verified-output API.

## Evidence format

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
- Performance checks validate field reviews and table calculations, not general semantics. Overview checks cover three structural summary fields, not arbitrary titles/rationales/claims. Verifying origin/status remains the source-check workflow's responsibility.
- Hashes detect later source/extraction changes; excerpt checks establish agreement with submitted extracted text. Trustworthy extraction and actual PDF content need original-page inspection. This is not a detector for an agent forging both sources and hashes.
- Receipts retain `source_semantics:not-certified`, `visual_review:not-run`. Never report these as semantic/visual completion; attach separate evidence.

Run `node --test <skill>/scripts/research-evidence.test.mjs` for development regressions. Distinguish synthetic tests from real-paper runs. Canonical overview notices follow `language`; deterministic count/comparison evidence reports remain English. Agent-authored research prose follows the requested language and is preserved by the renderer.
