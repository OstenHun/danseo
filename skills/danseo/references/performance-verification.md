# Check performance claims against tables

Summary: Bind performance claims to source tables. Preserve computed scope, ties, losses and missing results; block missing, overstated or stale evidence before HTML output.

<a id="기본-절차"></a>

<a id="evidence-v2-추가-계약"></a>

<a id="차단과-한계"></a>

## Default procedure

Without a separate verification request, inspect view titles, short paper names/topics, relation rationales, linked claims/conditions/limits/notes, current review reasons/scopes and source.scope. Exact paper titles and stale historical reviews are preserved, excluded from current performance conclusions. Claims include nonnumeric comparisons such as consistently outperforms, comparable or improves performance. Combining methods does not establish gains under every condition.

1. Run `node <skill>/scripts/render-verified-research-view.mjs candidate.json --performance-plan`. Preserve every path/text_sha256. Do not automatically exempt all fields as non-performance.
2. For a performance statement, reread original table pages. Check generator/model size, train/evaluation splits, dataset, metric/direction, comparator, reproduced versus cited results, missing values, ties, errors/significance and footnotes. Do not mix one generator's rows with another metric's columns. Retain table exceptions even when prose says always better.
3. Put the entire continuous table block, complete header and caption/footnotes in evidence v2 `tables`. Do not remove unfavorable rows/columns or change values/symbols. Preserve nearby prose conditions in review scope and separate condition fields.
4. Use `kind: table-comparison` with the comparison contract below and exact `comparisonText()` output. Separate mixed method/performance prose: retain method rationale and move computed performance text into conditions/notes without deleting valid conditions/limits. These deterministic reports are English; adjacent agent-authored prose follows the requested language.
5. Mark non-performance fields `non-performance`, `comparison: null` with a reason. Do not force ambiguous exemptions or reword to evade detection. Preserve unsupported claims in the original draft, stop final HTML generation and report needed evidence. Refresh fields/hashes after changes and rerun.

## Evidence v2 additions

Use version 2 from the [overview/count contract](evidence-gate.md), adding `tables` and `performance`. Every field still needs review when no performance claim exists. New generation rejects v1; existing HTML remains unchanged.

Each table:

```json
{
  "id": "Table1", "source_id": "S.1", "page": 2,
  "quote": "Task-A Task-B\nAccuracy Accuracy\nGenerator-A\nBaseline 70 67.3\nMethod 74 67.2\nTable 1. Test split; no significance test.",
  "header": "Task-A Task-B\nAccuracy Accuracy",
  "footer": "Table 1. Test split; no significance test.",
  "columns": [
    {"label":"Task-A","metric":"Accuracy","direction":"higher"},
    {"label":"Task-B","metric":"Accuracy","direction":"higher"}
  ],
  "conditions": ["Generator-A"],
  "review": {"checked_by":"actual reviewer","checked_at":"2026-11-16T00:00:00Z","scope":"Actual original table, full headers, rows and footnotes read"}
}
```

This is synthetic; use actual checker/time/excerpts. quote must be a continuous part of the hash-fixed extracted source page; header/footer must begin/end that block. Supported headers have one line of all column names and one line of metrics in the same order. All items must match, preventing borrowed metrics/directions. Numeric rows follow a condition heading as `method value value ...`. All numeric rows are read; mismatched columns, duplicates or partial deletion fail. Values must be finite decimals of at most 15 significant digits or missing `-`/`—`. Nonzero absolute values below 2.2250738585072014e-308, or values lost to zero during Number conversion, are rejected. Method labels ending in a separate number token, such as GPT 4, are rejected because they cannot be distinguished from missing cells. Do not simplify unsupported exponents, uncertainty ranges or merged multi-level tables to force a pass.

Accuracy, FactScore, F1, EM, Exact Match, BLEU, ROUGE, Precision, Recall and AUROC/AUC must be higher-is-better; Loss, Perplexity, Latency, Error Rate and WER/CER lower-is-better. Other metrics need exact source `direction_quote` naming one metric and its direction, such as `QualityX: higher is better` (supported Korean wording is also accepted; colon/final period optional). Mixed multi-metric direction sentences are not allowed. Leave unclear definitions unknown.

Each performance item:

```json
{
  "path":"/papers/0/claims/0/conditions/0",
  "text_sha256":"<exact displayed text SHA-256>",
  "kind":"table-comparison",
  "reason":"Same-generator comparison; retain the Task-B exception",
  "comparison":{
    "table_id":"Table1",
    "pairs":[{"condition":"Generator-A","method":"Method","baseline":"Baseline"}],
    "assertion":"report"
  }
}
```

`pairs` defines actual comparison scope. Use exact row labels including footnotes such as `Self-RAG*`. Compare all columns under each selected condition. Narrowed scope must remain explicit in the final sentence. `all-better` fails on any tie, loss or missing result. Normally use `report` to retain results/exceptions. Different evaluation conditions across papers do not form one superiority comparison.

`readTable(table, pages)` in `performance-evidence.mjs` accepts `Map<source_id, Map<page, text>>`; `comparisonText(parsed, comparison)` returns display text. `performancePlan(candidate)` lists paths/hashes only; it neither classifies nor approves performance. Numbers are parsed from original rows, not a separately submitted numeric array.

## Blocking and limits

Immediately before saving, validate all target reviews, current hashes, source links, excerpts, row/column consistency, same-condition calculations and exact display text. Any loss/tie/missing result blocks all-condition superiority. Known comparison phrases cannot be exempted as non-performance.

Original extraction, block boundaries, condition classification and meaningful comparison scope still need agent source inspection. This is neither an all-language performance classifier nor a forged PDF/extraction detector. Wrong exemptions or selectively narrowed scope remain review errors. Requiring every field reduces omissions but preserves `source_semantics:not-certified`. Mean improvement does not imply gains in every condition or statistical significance.
