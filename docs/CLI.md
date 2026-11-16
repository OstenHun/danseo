# CLI reference

Summary: Record discovery, collection and analysis, then compare or export current evidence on Node 22/24. Danseo has no model; only the optional local comparison viewer starts a read-only server.

For installation and a complete first topic, see the [setup guide](CLI.en.md). For answers and continued reading, see [paper analysis](PAPER_ANALYSIS.md). `analysis-open/save/list` connects Papers to topic documents; `comparison-input` prepares currently supported claims for stage 4.

<a id="주제-채팅에서-논문-찾기"></a>

<a id="페이지별-원문-텍스트-연결"></a>

## Find papers in a topic chat

Give a search-capable agent the tool's `skills/danseo/SKILL.md` and a private topic folder. Ask it to find papers, select displayed numbers or refine conditions. In a new chat, name the same folder to restore selections/sources. `topic.json` stores the topic without requiring Paper cards or `workspace.json`. The agent searches; the CLI persists rounds and selections.

```powershell
node ./dist/cli.js topic init --dir ./workspaces/topics/example --question 'My research question'
node ./dist/cli.js topic search --dir ./workspaces/topics/example --input ./workspaces/topics/example/batch.json
node ./dist/cli.js topic select --dir ./workspaces/topics/example --round 1 --ids 1
node ./dist/cli.js topic show --dir ./workspaces/topics/example
```

Synthetic `batch.json` (keep private search inputs in a Git-excluded topic folder):

```json
{"query":"Question used for this search","papers":[
  {"key":"example-a","title":"Synthetic paper A","authors":"Example author","year":2025,
   "source":"https://example.org/a","edition":"Example edition 1","reason":"Relevance to the research question","scope":"abstract"}
]}
```

Include 3–5 verified candidates when available; fewer or empty searches are valid with the search question. A new input appends a round. An immediate identical retry returns the same round; repeating it after a different search creates a new round. Paper numbers are stable within the topic.

`show.searches` contains candidates per round; `selected` contains all selections. Specify the displayed `--round` when a paper has multiple sources/editions. Reselecting an already-selected number preserves its first selected edition/source/note. To change it, `unselect --ids` then select the intended round. Start by explicitly reading the [skill](../skills/danseo/SKILL.md).

<a id="고른-논문의-원문-모으기"></a>

## Collect selected originals

Ask the agent to collect selected originals in the same folder. `topic sources` restores selected sources/rounds, ready files and missing files. The agent downloads public PDFs with its own tools. Open user-specified existing files in place; store new managed files in the topic folder.

In these examples, `$topic` is the private topic folder. Take title/authors from the selection and verify the cover, edition marking and official source page before supplying actual values.

```powershell
node ./dist/cli.js topic sources --dir $topic
node ./dist/cli.js topic collect --dir $topic --id 1 --round 1 --pdf ./download.pdf --url https://example.org/paper.pdf --kind published --edition 'Journal 2024' --proof 'Journal 2024'
node ./dist/cli.js topic collect --dir $topic --id 2 --round 1 --existing ./owned.pdf --kind draft --edition 'Preprint v2' --proof 'Preprint v2'
node ./dist/cli.js topic unavailable --dir $topic --id 3 --round 1 --reason 'Only the abstract is accessible' --url https://example.org/abstract
```

`--proof` is the exact edition-identifying text; `--page` is its 1-based PDF page (default 1). Published editions must appear in that marking. Register arXiv PDFs with `--kind draft`, using the complete actual identifier such as `arXiv:2203.14465v2` in edition/proof. Hold unreadable identity, files over 64 MiB, encrypted/scanned sources or other extraction failures with reasons. PDFs must be regular files.

`rows` shows paths, hashes, editions and failures. Show draft source/edition and ask explicit consent in the requested language. Use `decide` only for an explicit answer: refusal is `decline`, silence remains `pending`. Decisions bind to the selection round and file hash.

```powershell
node ./dist/cli.js topic decide --dir $topic --id 2 --round 1 --sha <displayed-draft-hash> --answer accept
node ./dist/cli.js topic collect --dir $topic --id 3 --round 1 --pdf ./late.pdf --kind published --edition 'Journal 2024' --proof 'Journal 2024'
```

In a new chat/process, `sources.ready` restores eligible editions/reasons. Missing/changed files become `needs-recheck`; inspect `rows[].failure`. A recorded collection attempt may return JSON/exit 0 with a failure reason: inspect the content. If the folder itself is unwritable, recording also fails; report the reason, obtain appropriate storage access and retry only that item. `sources.json` and managed `source-<SHA-256>.pdf` remain private.

<a id="첫-실행"></a>

## First run

This section owns connection inputs and initial commands. Start here when supported Node 22/24 and the build are ready; otherwise read [installation](#installation-and-build).

Give the agent these four values, reusing existing handoff/project instructions rather than asking again:

```text
Tool root: <absolute repository path>
Research workspace: <absolute folder containing workspace.json>
Project ID: <registered ID>
Skill: <tool-root>/skills/danseo/SKILL.md
```

Run from the tool root; substitute actual paths/workspace/project for private data and quote spaces for your shell. Check `node ./dist/cli.js --help` on first use or version changes.

1. Validate structure/connections and find the relevant Application/review status:

   ```powershell
   node ./dist/cli.js validate --workspace ./examples/minimal --json
   node ./dist/cli.js list --workspace ./examples/minimal --project demo --json
   ```

2. Choose an Application matching the question, rather than blindly selecting the first item:

   ```powershell
   node ./dist/cli.js export --workspace ./examples/minimal --project demo --application app-demo --include-drafts --format markdown
   ```

   This fixture is draft, hence `--include-drafts`. Use it for exploratory draft/needs-recheck inclusion only; disclose status without promoting it. `show` is useful for a separate record check, not a mandatory precursor to export, which already includes full records.

3. Read `Current question (selected section)`, its location and hashes **before judgment**. Do not substitute the entire file or an old snapshot. Follow [source-return rules](../skills/danseo/SKILL.md#judgment-and-returning-to-sources). Successful export alone does not answer the question.

The skill reuses these values and commands without rereading the README. For chats without shell access, a person supplies the bundle and current question together.

<a id="설치와-빌드"></a>

## Installation and build

Use supported Node/npm for initial preparation; Node 24 is the recommended development version. Do not rebuild just to read an existing prepared evaluation. There is no published npm release to install by name; do not substitute an unrelated package.

```powershell
npm ci
npm run build
```

`npm run danseo -- <command>` also works, but npm adds stdout banners; use `node <absolute-tool-root>/dist/cli.js` for agent automation. Local package installation exposes the `danseo` bin; global installation is unnecessary. Danseo is the product name; `danseo` identifies CLI/package/skill. Use the current help for supported command names; earlier working names are not command aliases.

<a id="개인-자료-연결"></a>

## Connect private records

Create `workspace.json` in your chosen private folder. Never commit private paths to product source. Replace these examples with actual files:

```json
{
  "schema_version": "workspace-1",
  "records": ["papers/example.md", "projects/demo/application.md"],
  "projects": [
    {"id": "demo", "root": "../my-project", "question_source": "docs/question.md", "question_section": "Current question"}
  ]
}
```

`records` and project `root` may be absolute or workspace-relative; existing external cards can be referenced without moving/copying them. `question_source` must be relative inside the project root. `question_section` is exact ATX heading text without `#`; include its nested sections until the next equal/higher heading. Ignore fenced-code headings; reject absent/duplicate headings. No slug or partial matching is used. Preserve the actual heading's language when configuring it. JSON Windows paths use `/` or escaped backslashes. Project IDs must match `Application.project_id`.

Only explicit records are read: no recursive folder search, source download or recursive Markdown-link traversal. URLs/links are not content-verified by the CLI; the agent checks them as needed. `workspace.json` owns connections; the question-source document owns richer project context.

<a id="명령과-출력"></a>

## Commands and output

| Command | Behavior |
| --- | --- |
| `validate --workspace PATH --json` | Check schema, IDs, references, page ranges and project/question paths; warn on draft |
| `list --workspace PATH [--project ID] --json` | List connected records; project filter excludes other applications |
| `show --workspace PATH --paper ID` | Preserve the raw Paper; also supports `--application ID` |
| `export --workspace PATH --project ID --application ID` | Export full Application and referenced Papers, each Paper once |

`show/export` support `--format markdown` (default) or `json`; `--json` is shorthand. Show JSON contains raw/path/source_directory/sha256/parsed data. Export records contain content/source_path/source_directory/sha256. Resolve relative links from original record locations. Existing Korean or English research text is not translated.

Export defaults to source-checked Papers. `--include-drafts` includes draft/needs-recheck for exploration without changing status. Even source-checked is the recorder's declaration; CLI does not verify the truth of past checks. `bundle-2.question` includes selected text, source path, section, 1-based lines and full/excerpt SHA-256. Legacy workspaces lacking question_section can validate/list but export fails with `QUESTION_SECTION_REQUIRED`; no full-file fallback. Missing/duplicate/malformed input fails rather than returning a partial bundle. Exit codes: 0 success, 2 validation/usage, 3 input/output failure. `--out` creates a new file only. Bundles exceeding 256 KiB fail without truncation.

## Page-aligned source text

Optional Paper `source.text_path` points to UTF-8 JSON with matching source URL/edition, declared original PDF SHA-256, extraction metadata and 1-based page/text entries. Use the [card model](CARD_MODEL.md) contract. An explicit source text that is missing or invalid fails selected-Paper export without partial output; absent text_path only warns. Validate checks card/question structure/references; selected-Paper export checks text files.

The prepared PDF hash is a declaration: this export path does not reopen the PDF to prove text agreement. Record text/visual access and extraction fidelity separately. Page numbers alone or mixed table columns are not successful reading. Use existing tools/original pages as needed. Claim conditions/limits and semantic agreement remain agent responsibilities.

<a id="agent와-skill의-기본-구성"></a>

## Agent and skill configuration

[SKILL.md](../skills/danseo/SKILL.md) provides the portable workflow; `agents/openai.yaml` provides display metadata/default prompt. No autonomous agent process or model preset is bundled. Your selected agent/model calls the CLI. Reuse [first-run inputs](#first-run); manually merge them into existing project instructions for repeated use. Danseo needs no model key or background server; the agent's external-model settings remain separate.

Install the complete `skills/danseo` folder in the host's documented location. Do not automatically replace an existing same-name global skill. Repository changes do not establish global registration or automatic discovery. Follow the [output-language rule](../skills/danseo/SKILL.md#output-language); fixed UI/diagnostics are English, generated research prose follows the user's request.

<a id="개발-검증"></a>

## Development checks

`npm test` uses public synthetic fixtures in temporary Unicode/space-containing paths to check reading, validation, export and failures. Preserve raw bodies/comments/unknown fields and strict UTF-8. This is not a YAML round-trip editor. Private execution evidence stays under local `work`, outside distribution. Tests cannot certify host model instruction compliance, user understanding or study benefit.
