# Claim-level source review JSON

Summary: Freeze claims and PDFs, register review hashes, and check current evidence against them. Reviewers read original pages and judge meaning; registration does not change whole-card status.

<a id="고정-입력"></a>

<a id="검토-결과"></a>

<a id="등록과-확인"></a>

## Frozen input

Write UTF-8 JSON at a relative path inside the workspace. `card_sha256` records the card bytes at that time; claim validity is assessed per claim content. Replace hash placeholders with real 64-character lowercase SHA-256 values. Copy Paper `source.version`, `source.url` and each complete `claims` object; compute the actual PDF hash. Omitting conditions, limits or extension fields makes the snapshot differ from the current claim. Include `text_sha256` when `text_path` is connected.

```json
{
  "run_id": "source-review-001",
  "papers": [{
    "paper_id": "paper-a",
    "card_sha256": "<card SHA-256>",
    "source": {"version": "actual edition", "url": "https://example.org/a", "pdf_sha256": "<PDF SHA-256>"},
    "claims": [{"id": "c1", "statement": "Author-reported result", "conditions": "Evaluation conditions", "locators": [{"type": "pdf-page-range", "start": 3, "end": 3}, {"type": "table", "value": "1"}]}]
  }]
}
```

## Review result

`input_sha256` hashes the frozen input bytes. `source_checks` contains hashes of PDFs actually read by the reviewer. Give exactly one verdict per input claim. Use `independent-source-review` for independent review and `same-reviewer-delta` for the same reviewer's follow-up. A label alone does not establish independence. Write review reasons and notes in the requested language; preserve quoted source text and all machine identifiers.

```json
{
  "input_sha256": "<input SHA-256>",
  "reviewer": "actual reviewer",
  "review_type": "independent-source-review",
  "reviewed_at": "2026-11-11T00:00:00Z",
  "claims": [{
    "paper_id": "paper-a", "claim_id": "c1", "verdict": "supported",
    "reason": "Describe the actual comparison with the source.",
    "evidence": [{"pdf_page": 3, "section": "Table 1", "note": "Compared result, unit, sample and condition."}],
    "required_changes": []
  }],
  "source_checks": [{"paper_id": "paper-a", "pdf_sha256": "<PDF SHA-256>"}]
}
```

Verdicts: `supported`, `partially_supported`, `contradicted`, `insufficient_evidence`. All except the last require PDF page, section and comparison note. Reviewer, reason, location and note cannot be whitespace-only. `reviewed_at` needs a real calendar date and ISO 8601 `Z` or explicit UTC offset, with at most three fractional digits matching millisecond comparison precision. Damaged UTF-8 input/results are held. Never record support for unread evidence. Keep results inside the workspace without overwriting earlier files.

## Registration and validation

Preserve existing records/projects in `workspace.json` and add this optional field. Hash the actual saved result bytes.

```json
{
  "claim_reviews": [{"input": "reviews/input.json", "result": "reviews/result.json", "result_sha256": "<result SHA-256>"}]
}
```

`topic comparison-input` compares input, result, PDF and current claims. A newer negative, required-change or changed-evidence verdict prevents fallback to earlier support. Duplicate timestamps remain held until resolved. JSON/hash agreement does not certify semantic judgment or independent review. See [analysis and resumption](PAPER_ANALYSIS.md).
