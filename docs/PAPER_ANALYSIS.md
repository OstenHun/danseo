# Analyze a paper and resume reading

Summary: Link a selected PDF edition to a shared Paper card and topic Markdown analysis. Resume answers and notes; only currently source-supported comparison candidates proceed to the next stage.

<a id="처음-열기"></a>

<a id="원문을-읽고-답-쓰기"></a>

<a id="새-대화와-판본-변경"></a>

<a id="주장-검토와-4단계-입력"></a>

<a id="의존성과-확인-범위"></a>

## Open for the first time

Read the paper number, selection round, actual edition, PDF path and SHA-256 from `topic sources --dir <topic-folder>` → `ready`. Pending/refused drafts and missing/changed PDFs are ineligible. Every invocation repeats stage-2 title, author and edition checks.

Find a same-edition Paper in the specified private workspace. If absent, prepare it in the existing native card format and register it in `workspace.json` → `records`. A Paper-only workspace may use `projects: []`. Preserve existing cards, claim IDs, body text and user notes; never overwrite another edition. Do not update global skill installations.

```sh
node dist/cli.js topic analysis-open --dir <topic-folder> --id 2 --workspace <card-workspace> --paper <Paper-ID>
```

For the first connection, provide workspace and ID together. `source.version` must equal `ready.file.edition`, and the PDF at `source.path` must hash to the collected PDF. Identical bytes may be linked at another path; matching hashes do not establish claim support.

Output includes the topic question, selection reason, PDF/edition, Paper connection, full analysis document and document hash. Find paths in `topic show` → `analyses` or `analysis-list`. Unreadable/damaged documents mark that paper `needs-recheck` with a reason while other papers remain queryable. Lists are navigational; `analysis-open` verifies current sources. Reopening the same edition alone does not write a file.

## Read sources and write answers

Use the [skill output-language rule](../skills/danseo/SKILL.md#output-language): an explicit language request wins, otherwise preserve the current work's chosen language, or use the new request's language. Source language does not choose answer language. Fixed document headings are English; supplied answer text is preserved.

Write one short paragraph on research question, method and main results. Then explain topic-relevant sections/tables: compared objects, conditions, values, units, samples, models and actual PDF page/section/table numbers. Read the PDF page when columns or footnotes are ambiguous. Use a section if no relevant table exists; distinguish paper limitations from unread scope.

Store author-reported statements, `conditions`, `limits` and `locators` in Paper `claims`. Keep topic answers, AI interpretation, user notes and open questions in the topic analysis document. Do not mix author claims, AI interpretation, project measurements and adoption decisions. Manual card changes follow that workspace's existing save/review procedure; this CLI does not summarize or overwrite cards automatically.

Prepare a private answer JSON file. This synthetic example is not a real paper result; replace prose with requested-language content while retaining keys/IDs.

```json
{
  "overview": "One paragraph on the research question, comparison method and main findings.",
  "question": "How did the two methods evaluate their results?",
  "answer": "Describe the subjects, conditions, results and units verified in this edition. Keep unsupported scope unknown.",
  "interpretation": "AI interpretation: state what this topic can answer and which conditions do not transfer.",
  "remaining_questions": "Record further questions or unknowns, or explicitly state that none remain.",
  "resume": "Record the next PDF page, section or table and what to check.",
  "claim_ids": ["c1"],
  "comparison_claims": ["c1"]
}
```

```sh
node dist/cli.js topic analysis-save --dir <topic-folder> --id 2 --sha <opened-document-hash> --input <answer-JSON>
```

Answers append to the same document. The first answer for each edition requires `overview`; later answers may omit it. `claim_ids` names actual Paper claims used in this answer. `comparison_claims` is the complete current topic candidate list; preserve previous candidates or withdraw them with an empty array. Both are checked against current Paper IDs. Being a candidate is not review completion. The CLI checks JSON/references, not factuality, numerical meaning or reading quality.

## New chats and edition changes

```sh
node dist/cli.js topic analysis-open --dir <same-topic-folder> --id 2
```

In a new process, read previous answers, user notes, open questions and reading position before appending. A → B → A still uses one document per paper. Another topic reuses shared Paper claims with its own separate answers.

When stage 2 selects a different ready edition, explicitly connect that edition's Paper. The same analysis document gains a new edition section/history while preserving earlier answers/Paper. New-edition comparison candidates start empty; add only newly checked claims. A file change alone is not edition verification.

Saving uses a topic lock, opened-document hash and a final pre-replacement check. Preserve the original in a content-hashed `.bak`. Reopen changed editor notes; do not overwrite damaged documents, differing backups or linked files. This does not cover every race with uncooperative editors at final replacement. Handle leftover locks only after stopping other Danseo processes and comparing originals.

## Claim reviews and stage-4 input

Use existing frozen claim-input/result formats in the [review JSON contract](CLAIM_REVIEWS.md). A reviewer actually reads the PDF pages, compares statements/conditions/locations, and records verdicts, reasons, evidence and required changes. Self-checking is not independent review.

```sh
node dist/cli.js topic comparison-input --dir <topic-folder>
```

`claims` contains only this topic's selected candidates whose latest review is `supported` and valid for current content. Whole-Paper `source-checked` is insufficient. Changes to PDF, edition/URL, linked text, statement, conditions, limits or locators put claims in `held`. Partial support, contradictions, insufficient/unchecked evidence, required changes, damaged review files and distinct same-time reviews are also held. Restoring old content does not revive old support when a newer review exists; only content matching the latest review can use that review.

Selections, source records and draft consent are read under one topic lock; PDF processing begins after releasing it. Concurrent Danseo saves return `EDIT_BUSY`; retry after saving finishes. Analysis open/save reuses its held lock. Reviewed PDF hashes must directly match the selected PDF hash, preventing a different PDF swapped at the same path from inheriting the selected file's review.

Each claim carries Paper/claim ID, full conditions/locations, PDF edition/hash/path, topic analysis path/hash and verdict. `held` explains next checks. Output includes private paths/review metadata; do not publish it unchanged in PRs or shared materials. Stage 4 regenerates this input to verify freshness. This stage does not itself construct criteria, graphs or paper relations.

## Dependencies and verification scope

`sourceCollection` provides the same revalidation as `topic sources`; the `topic.json`/`sources.json` storage contracts remain unchanged. Changes to upstream contracts require resume, draft-exclusion, changed-evidence and package checks. Earlier branch/PR details remain in Git history.

Current scope is listed under [PTP-011](../TASKS.md#ptp-011--논문별-분석과-재개); detailed execution records stay local. New CLI-process resumption differs from a person continuing in a new chat. CI does not establish macOS folder-permission UX, reader understanding or learning benefit.
