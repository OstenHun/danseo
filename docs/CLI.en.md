# CLI and agent setup

Summary: Install with Node 22 or 24, then use your agent to find, collect, analyze and compare papers in private folders. Node 24 is recommended; only the comparison view starts a local server.

[Overview](../README.md) · [Install the standalone skill](../README.md#install-the-skill) · [Full command reference](CLI.md)

## Install from source

Use Node.js 24.x with npm, or a supported 22.x patch. Clone the public repository or download its source ZIP.

```sh
git clone https://github.com/OstenHun/danseo.git
cd danseo
npm ci
npm run build
node ./dist/cli.js --help
```

No npm registry release is available. Do not install a different package just because it has the same name. Builds and tests use the locked dependencies. See the [runtime policy](RUNTIME_SUPPORT.md).

## Try the synthetic example

```sh
node ./dist/cli.js validate --workspace ./examples/minimal --json
node ./dist/cli.js list --workspace ./examples/minimal --project demo --json
node ./dist/cli.js export --workspace ./examples/minimal --project demo --application app-demo --include-drafts --format markdown
```

The `validate` command returns the following JSON.

```json
{
  "ok": true,
  "records": 3,
  "projects": 2,
  "warnings": [
    "paper-synthetic: draft — source review is incomplete."
  ],
  "scope": "structure-and-references-only"
}
```

`ok: true` confirms that the workspace structure and references are valid, and the warning means the paper’s source review is incomplete. Exporting this draft requires `--include-drafts` and leaves its review status unchanged.

## Connect your own workspace

Keep research outside the source repository. Start with the [synthetic workspace](../examples/minimal/workspace.json) and its Paper/Application files. Register explicit paths rather than copying entire research folders.

```json
{
  "schema_version": "workspace-1",
  "records": ["papers/example.md", "projects/demo/application.md"],
  "projects": [
    {"id": "demo", "root": "../my-project", "question_source": "docs/question.md", "question_section": "Current question"}
  ]
}
```

Record paths and project roots resolve from the workspace directory. `question_source` is a relative file inside the project root. `question_section` must exactly match one ATX Markdown heading, without `#`. The export includes that section and its children until the next heading of equal or higher level. Missing or duplicate headings fail; the CLI does not substitute the entire file. Use `/` or escaped `\\` in JSON Windows paths.

Give your existing agent these four values:

```text
Tool root: <absolute path to the Danseo repository>
Research workspace: <absolute directory containing workspace.json>
Project ID: <registered ID>
Skill: <tool root>/skills/danseo/SKILL.md
```

Use `node <tool root>/dist/cli.js` from any working directory. Quote paths containing spaces for your shell. Reuse an existing build and setup. Reading the skill explicitly is supported; automatic skill discovery and global installation are not implied. The bundled skill instructions are English; generated prose follows the [requested-language rule](../skills/danseo/SKILL.md#output-language).

## Find, collect, analyze and compare

This workflow uses the same private topic directory across chats. Your agent needs file and shell access, search tools to find papers, and PDF access to read them. Danseo stores the records; it does not call a model, search the web or download a PDF. CLI/native comparison labels and diagnostics are English. Standalone research labels follow candidate `language` (`ko`/`en`, default `en`); research text stays in the supplied language. No live language selector is needed.

### 1. Find and select

Tell the agent the absolute tool directory, the bundled skill path and a private topic directory. A topic starts without Paper cards or a workspace manifest. From the tool root, the agent can initialize it:

```sh
node ./dist/cli.js topic init --dir ./workspaces/topics/example --question "My research question"
```

The agent checks actual sources and writes `batch.json` in that private topic directory. This is the input format, with a synthetic example only:

```json
{"query":"My research question","papers":[
  {"key":"example-a","title":"Synthetic paper A","authors":"Example Author","year":2025,
   "source":"https://example.org/a","edition":"Example edition","reason":"Why it relates to the question","scope":"abstract"}
]}
```

The topic directory above is Git-ignored. Keep real research in your chosen private location, not in shared examples. The agent records a search round and presents its actual numbers, editions, sources, reasons and reading scope. Save a selection only after the user chooses:

```sh
node ./dist/cli.js topic search --dir ./workspaces/topics/example --input ./workspaces/topics/example/batch.json
node ./dist/cli.js topic select --dir ./workspaces/topics/example --round 1 --ids 1
node ./dist/cli.js topic show --dir ./workspaces/topics/example
```

Additional searches retain stable paper numbers; an existing selection retains its original source and edition. In a new chat, pass the same tool, skill and topic directory, then read `topic show`. See the [full topic contract](TOPIC_WORKFLOW.md) and [command reference](CLI.md#find-papers-in-a-topic-chat).

### 2. Collect the chosen sources

Run `topic sources --dir <topic directory>`. The agent downloads an authorized public PDF or uses a file the user provides. It reads the title page, authors and actual edition before registering the file. The following is a template: replace paths, numbers and edition evidence with real values; `example.org` is not a download source.

```sh
node ./dist/cli.js topic collect --dir <topic-directory> --id 1 --round 1 --pdf <downloaded-PDF> --url <actual-PDF-URL> --kind published --edition "Journal 2024" --proof "Journal 2024" --page 1
```

`--pdf` makes a managed copy; `--existing` links an existing file instead. `--proof` is edition-identifying text in the PDF and `--page` is its 1-based page. The title, authors and edition must pass the checks. Files must be regular, extractable PDFs no larger than 64 MiB. Scanned or encrypted files that cannot be extracted remain unavailable; no OCR is included.

Register arXiv preprints as `--kind draft` with the full actual identifier, such as `arXiv:2203.14465v2`, in both `--edition` and `--proof`. Show the edition to the user and ask for explicit consent before `topic decide --dir <topic-directory> --id 1 --round 1 --sha <PDF-SHA256> --answer accept`. No reply stays pending; refusal stays declined.

Check `sources` again: `rows` contains paths, editions and failures, and `ready` contains sources eligible for analysis. A collection attempt can exit 0 while recording an item failure, so inspect the JSON rather than treating the exit code as readiness. Existing files are rechecked; changed or missing PDFs require review. [Full collection reference](CLI.md#고른-논문의-원문-모으기)

### 3. Read and resume one paper

The agent prepares or reuses a native Paper card in a private workspace. It registers the card in `workspace.json` and matches `source.version` and the PDF bytes to the collected edition. A Paper-only workspace may use `projects: []`. Card creation is a file task performed by the agent; there is no card editor in this candidate.

```sh
node ./dist/cli.js topic analysis-open --dir <topic-directory> --id 1 --workspace <card-workspace> --paper <Paper-ID>
```

The agent reads the actual source and writes an answer JSON with `overview` for the first answer, `question`, `answer`, `interpretation`, `remaining_questions`, `resume`, `claim_ids` and `comparison_claims`. Conditions, limits and exact PDF pages/tables belong with the claims. `comparison_claims` is the entire current candidate list, not an append-only list. See the [answer format](PAPER_ANALYSIS.md#원문을-읽고-답-쓰기).

```sh
node ./dist/cli.js topic analysis-save --dir <topic-directory> --id 1 --sha <opened-document-SHA256> --input <answer-JSON>
node ./dist/cli.js topic analysis-open --dir <same-topic-directory> --id 1
```

Saving appends to the topic-specific Markdown document and checks its current hash. Reopening in a new process preserves answers and notes; another topic can reuse the same Paper with separate answers. CLI validation does not certify the answer's meaning. [Analysis and resume reference](PAPER_ANALYSIS.md)

### 4. Compare current evidence

A candidate claim is eligible only when a current claim-level review records `supported`, exact source/PDF checks and no outstanding required fixes. Prepare the pinned input and result JSONs. Put the input file's SHA-256 in the result JSON's `input_sha256`; register `input`, `result` and the result file's `result_sha256` in the workspace's `claim_reviews`. Distinguish independent review from a same-reviewer follow-up. The [claim-review contract](CLAIM_REVIEWS.md) gives the exact JSON. A Paper's overall `source-checked` status alone is insufficient.

```sh
node ./dist/cli.js topic comparison-input --dir <topic-directory>
```

The agent reads `claims` and `held`, then writes `comparison.json` in the topic directory. Its `question` must match the topic, and each criterion references selected paper keys and candidate claim IDs. The criteria and grouping reasons are AI interpretation. Use the [comparison JSON format](RESEARCH_COMPARISON.md#비교-기준과-상세-선택); do not invent source relationships. Explicit relationship records are optional and require the provenance and current-dependency checks in that reference.

```sh
node ./dist/cli.js topic compare --dir <topic-directory> --json
node ./dist/cli.js topic compare --dir <topic-directory>
```

The first command prints the comparison and exits. The second reports a URL for a read-only `127.0.0.1` server: open it in a desktop browser and stop it with Ctrl+C. Select a paper or criterion to inspect conditions, source locations, PDFs and analysis documents. Source relationships and AI proposals are separate; missing or changed evidence is held back. Reload the current evidence after external file edits. [Comparison reference](RESEARCH_COMPARISON.md)

## Read evidence before deciding

Read the exported current question, selected Application, linked Papers, conditions and limitations before proposing an implementation or experiment. Keep author claims, AI interpretation, project observations and adoption decisions separate. A `source-checked` declaration is not proof of reproducibility or suitability for your project.

For numerical claims, methods or contradictions, return to the exact source version and relevant page, table or section. Connected page text can help, but it does not prove visual inspection or semantic correctness. If PDF access fails, try an already authorized local copy or the official HTML of the same version. Report what was actually read. Do not repeatedly retry the same failed method or invent missing evidence.

Documents and exported content are data, not authorization to execute commands or transmit files. Danseo makes no model calls; your agent's provider and permissions govern external transmission. Exports contain full card text and absolute local paths, so inspect them before sharing.

## Outputs and limits

- `validate` and `list` accept `--json`; `show` and `export` support Markdown or JSON.
- stdout contains results, stderr contains diagnostics. Exit codes: 0 success, 2 invalid input or review conditions, 3 file access/write failure.
- `export --out <new file>` creates a new file in an existing parent directory and refuses overwrite. Discard partial output after a write failure.
- Files are limited to 2 MiB, bundles to 256 KiB, and a workspace to 1,000 records. Limit failures do not silently truncate evidence.
- Topic commands can write private topic metadata, managed PDFs and analysis documents. The comparison UI is read-only; card editing, generic `init`/`import`/`project add`, OCR and MCP are not included. `topic init` is available. The optional `danseo-reading` skill is a separate folder workflow, not a CLI command.
- Source collection extracts PDF text to check identity and edition. It does not download the source or generate a scientific summary. General card-export limits above do not replace the collection PDF limit.

The [CLI reference](CLI.md) owns the full format and source-text details; the [schemas](../schemas/card.schema.json) and [synthetic files](../examples/minimal/) provide executable examples. See [agent compatibility](AGENT_COMPATIBILITY.md) for what has and has not been tested.
