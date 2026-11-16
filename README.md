<div align="center">

<h1>Danseo</h1>

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="assets/brand/banner-compact-dark.svg">
  <source media="(max-width: 640px)" srcset="assets/brand/banner-compact-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/banner-dark.svg">
  <img src="assets/brand/banner-light.svg" alt="Danseo — research evidence, project decisions." width="100%">
</picture>

**Bring research evidence into project decisions.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node.js 22 or 24 LTS](https://img.shields.io/badge/node-22%20%7C%2024%20LTS-43853d.svg)
![Development preview](https://img.shields.io/badge/status-development_preview-orange.svg)

English · [한국어](README.ko.md) · [Install the skill](#install-the-skill) · [Quick start](#quick-start) · [Project structure](#project-structure) · [Documentation](docs/README.md) · [Contributing](CONTRIBUTING.md)

</div>

Summary: A development preview that connects paper discovery, source collection, analysis, and comparison in local files, using your existing AI agent, a CLI, and evidence-linked research views.

## Overview

A paper summary alone rarely gives you enough context to use a method in a project. You also need the evaluation conditions, exact source locations, and a record of why you chose to apply, test, or defer it.

Danseo (단서, “clue” in Korean) keeps that context available for your next conversation. Paper records hold reusable research evidence; Application records hold project-specific decisions. Multiple projects can reference the same paper without sharing the same adoption decision.

- **Keep discovery resumable.** Save search rounds, stable paper numbers, and the source and edition shown when you selected a paper.
- **Read against the source.** Connect PDFs, paper claims, answers, and notes while preserving conditions, limitations, and unread areas.
- **Explore the evidence.** Select papers or comparison criteria to inspect source locations and distinguish source relationships from AI proposals.
- **Use your existing agent.** The agent searches, downloads authorized sources, reads papers, and prepares comparisons. Danseo connects and checks the resulting files; it does not call a model.

| Stage | What Danseo records |
| --- | --- |
| Discover and select | Search rounds, stable numbers, sources, editions, and reasons for selection |
| Collect sources | Managed PDF copies or existing-file links, identity checks, and explicit consent for draft editions |
| Analyze and resume | Shared Paper cards, topic-specific Markdown answers and notes, follow-up questions, and reading positions |
| Compare research | Currently supported claims, evaluation conditions, limitations, source locations, and reasons for AI proposals |

The CLI workflow and standalone skill views are separate entry points: use the skill for a paper-relationship HTML, or build the full CLI to manage a topic from discovery through a read-only comparison view.

<a id="skill-설치"></a>

## Install the skill

**For standalone paper-relationship HTML, you need Node.js 22 or 24 and the complete `skills/danseo` folder.** No npm package installation, build, or server is required. Use an installed, signed-in agent such as Codex, Claude Code, or Antigravity CLI with access to your paper files and permission to run Node commands. A folder path pasted into an ordinary web chat is not sufficient.

### 1. Download the source

```sh
git clone https://github.com/OstenHun/danseo.git
cd danseo
node --version
```

Without Git, use **Code → Download ZIP**, extract it, and open a terminal in the folder containing `README.md` and `skills/`. Install the **entire `danseo` skill folder**: copying only `SKILL.md` omits the generators, references, and design assets.

### 2. Install for your agent

These are personal installation locations used across projects. `~` means your home directory. The Argon instructions refer to using an Argon model through **Antigravity CLI (`agy`)**.

| Agent | Installation folder | Invoke in a new chat |
| --- | --- | --- |
| Codex | `~/.agents/skills/danseo` | `$danseo` or the skill picker |
| Claude Code | `~/.claude/skills/danseo` | `/danseo` |
| Argon · Antigravity CLI | `~/.gemini/config/skills/danseo` | `/danseo` |

Host instructions: [Codex](https://developers.openai.com/codex/skills/) · [Claude Code](https://code.claude.com/docs/en/skills) · [Antigravity](https://antigravity.google/docs/skills/). Use `agy models` to check available Argon model names before selecting one.

Expand the example for your operating system and choose **one destination**. The examples preserve existing installations. If you already use `~/.codex/skills/danseo` or a project-specific installation, check the path your agent actually loads before adding another copy.

<details>
<summary><strong>Windows · PowerShell</strong></summary>

Run from the repository root. The default is Codex; replace the destination line for Claude Code or Argon.

```powershell
$danseoTarget = Join-Path $HOME '.agents/skills/danseo'
# Claude Code: Join-Path $HOME '.claude/skills/danseo'
# Argon (agy): Join-Path $HOME '.gemini/config/skills/danseo'

if (Test-Path -LiteralPath $danseoTarget) { throw "Check the existing installation: $danseoTarget" }
New-Item -ItemType Directory -Force -Path (Split-Path $danseoTarget -Parent) | Out-Null
Copy-Item -LiteralPath './skills/danseo' -Destination $danseoTarget -Recurse -ErrorAction Stop
node --test "$danseoTarget/scripts/research-evidence.test.mjs"
```

</details>

<details>
<summary><strong>macOS / Linux · Bash or Zsh</strong></summary>

Run from the repository root. The default is Codex; replace the destination line for Claude Code or Argon.

```sh
danseo_target="$HOME/.agents/skills/danseo"
# Claude Code: danseo_target="$HOME/.claude/skills/danseo"
# Argon (agy): danseo_target="$HOME/.gemini/config/skills/danseo"

if [ -e "$danseo_target" ] || [ -L "$danseo_target" ]; then
  printf 'Check the existing installation: %s\n' "$danseo_target"
else
  mkdir -p "$(dirname "$danseo_target")" &&
    cp -R ./skills/danseo "$danseo_target" &&
    node --test "$danseo_target/scripts/research-evidence.test.mjs"
fi
```

</details>

A test result of `fail 0` confirms the bundled validator regression checks. It does not confirm that your model discovered the skill or read a paper correctly.

### 3. Check in a new chat

Start a new chat, select Danseo using the invocation above, and try the [graph prompt below](#generate-a-paper-relationship-graph). If it is missing, restart the app or CLI and check that `SKILL.md`, `scripts/`, `references/`, and `assets/` are in the same installed folder. You can also ask the agent to read the installed `SKILL.md` by its absolute path. If it loads a different copy, specify the intended path.

GitHub changes do not automatically update your installed copy. To update, download the latest source, back up the existing skill outside the host's skill search paths, then copy and check the complete folder again.

<a id="논문-그래프-생성-요청"></a>

## Generate a paper-relationship graph

Use the same request with any of the three agents. Replace the example paths with **actual absolute paths on your computer**. Select `$danseo` in Codex or `/danseo` in Claude Code or Antigravity first, or prefix your request with that invocation.

```text
Use the Danseo skill to create a standalone HTML relationship graph for these papers.
Paper folder: C:/research/my-topic/papers
Research question: How does each paper connect retrieved evidence to answers and evaluate it?
Output folder: C:/research/my-topic/output
Write the explanations in English.
```

On macOS or Linux, use a real path such as `/Users/me/research/my-topic/papers` or `/home/me/research/my-topic/papers`. Your agent must be able to read the PDFs. Finding additional papers also requires search and download tools.

The default workflow is **check sources and editions → write relationships and evidence → separate source records from AI proposals → check the overview and quantities → generate shared HTML → inspect the rendered view**. Source relationships retain page or section locations; suggested connections remain proposals. Keep the candidate JSON and evidence files alongside the HTML so later revisions can reuse the same generator. See [source verification](skills/danseo/references/relation-verification.md), [overview and quantity checks](skills/danseo/references/evidence-gate.md), and [performance verification](skills/danseo/references/performance-verification.md).

Views use short paper names, topic grouping, and connections around the selected paper by default. You can filter evidence status and relationship types, or show all connections. Full titles and relationship data remain in the details; topic grouping is identified as AI editorial interpretation. Danseo targets local PC and laptop use. Verify the desktop view before delivery.

Select a paper or edge to inspect evidence, conditions, and source/AI labels. Correct the source or input after a failed check. If browser tools are unavailable, the agent must report that visual inspection was not performed. **Passing automated checks does not certify every relationship interpretation.**

To review an existing graph:

```text
Recheck the existing candidate JSON and evidence files against the original PDFs.
Output folder: C:/research/my-topic/output
Correct any mixing of source relationships and AI proposals, or mismatched record,
document, or pair counts. Preserve the previous output and create a new HTML file.
Report what you actually inspected in the rendered view.
```

<a id="빠른-시작"></a>

## Quick start

### Build the full CLI

Use the full CLI to manage topic history, Paper cards, project decisions, analysis, and comparisons. The standalone graph skill above does not require this build.

Requires **Node.js 22 or 24 LTS and npm**; Node 24 is recommended for development. Run from the downloaded source folder:

```sh
npm ci
npm run build
node ./dist/cli.js validate --workspace ./examples/minimal --json
```

The synthetic example reports `ok: true`, 3 records, 2 projects, and an expected `draft` warning. Validation checks structure and references. See [runtime support](docs/RUNTIME_SUPPORT.md) and the [English CLI guide](docs/CLI.en.md).

### Start with your own topic

Give your agent the absolute Danseo folder and a private topic directory. Discovery also requires the agent's search tools.

```text
Read skills/danseo/SKILL.md in this Danseo folder.
Find papers for my research question in my private topic directory.
Show the sources, editions, and reasons so I can choose.
```

1. Select candidates, then ask the agent to collect their original sources.
2. Ask a question about a selected paper; retain the answer and exact source locations.
3. Ask the agent to compare papers using the checked evidence.

In a new chat, provide the same tool, skill, and topic directory. The [English end-to-end guide](docs/CLI.en.md#find-collect-analyze-and-compare) covers discovery → collection → analysis → comparison. See the detailed English [analysis](docs/PAPER_ANALYSIS.md) and [comparison](docs/RESEARCH_COMPARISON.md) references.

<details>
<summary><strong>Connect existing cards and projects</strong></summary>

Paper records hold claims and sources; Application records hold project-specific decisions. Register explicit cards and projects using [the synthetic workspace](examples/minimal/workspace.json), then give your agent the [four connection values](docs/CLI.en.md#connect-your-own-workspace).

`validate` checks structure and references; `list` and `show` read cards. `export` includes the selected question and full linked cards as Markdown or JSON, preserving content, comments, extension fields, and source locations. `--out` creates new files only.

```sh
node ./dist/cli.js export --workspace ./examples/minimal --project demo --application app-demo --include-drafts --format markdown
```

The fixture is a draft, so it requires `--include-drafts`. This option does not change review status. See the [card model](docs/CARD_MODEL.md).

</details>

## Project structure

Danseo is one TypeScript/Node.js package plus a portable agent skill. The CLI and read-only comparison app share the file-based core; the skill includes its own standalone HTML generators and assets.

```text
src/
  cli.ts                 Commands, options, output, and exit codes
  core/                  Cards, topics, source collection, analysis, reviews, and comparison
  web/                   Read-only comparison server and browser UI
  views/                 Shared map presentation and reading styles
schemas/                 Card, workspace, and relationship schemas
skills/danseo/           Agent instructions, references, standalone generators, and assets
examples/minimal/        Synthetic workspace for validation and export
scripts/                 TypeScript build and documentation tools
tests/                   TypeScript regression tests, helpers, and package checks
docs/                    Usage guides, data formats and evidence-check contracts
```

A topic folder keeps selections, collected-source records, and topic-specific analysis. A separate `workspace.json` registers reusable cards, projects, claim-review inputs/results, and optional relationships. The same Paper can support separate answers in different topics. Author claims, AI interpretations, project observations, and adoption decisions remain distinct.

Private papers and records belong outside shared product source. `work/`, `workspaces/`, and `private/` are local-only areas excluded from distribution. Exports include full card text and absolute local paths; inspect them before sharing.

## Status and limitations

Version `0.1.0-dev.1` is a development preview. The CLI and file formats may change.

- **Included:** discovery records, source collection, topic-specific analysis and resumption, evidence-linked comparison, existing-card export, and standalone relationship HTML.
- **Not included:** a card editor, a separate learning-HTML skill, automatic experiments or submissions, or an MCP server. The research comparison app targets desktop browsers.
- **Language:** fixed viewer controls, diagnostics, skill instructions and active usage references are English. Agent-authored research prose follows your explicit language request; otherwise it preserves the current work's chosen language, or uses your request language for new work. Original titles, quotations, identifiers and saved records are preserved. There is no language switch. [Output-language rules](skills/danseo/SKILL.md#output-language). Explicit Korean README editions and synthetic research content are preserved; internal work records stay local.

Danseo itself needs no model key, database, or permanent server and makes no outbound requests. `topic compare` runs a read-only loopback server only while you use the view; stop it with Ctrl+C. Your agent's search, downloads, and model transmissions follow that agent's settings and permissions.

Structural checks and source-support reviews do not establish experiment reproduction or reader understanding. See [runtime support](docs/RUNTIME_SUPPORT.md), the [roadmap](TASKS.md) and [distribution boundaries](docs/OPEN_SOURCE.md).

## Documentation

| Goal | Start here | Language |
| --- | --- | --- |
| Install and request a standalone graph | [Skill installation](#install-the-skill) · [Graph prompt](#generate-a-paper-relationship-graph) | English |
| Manage a topic from discovery to comparison | [CLI and agent guide](docs/CLI.en.md) | English |
| Understand the bundled skill | [Skill overview](skills/danseo/README.md) | English |
| Inspect analysis, reviews, and comparison formats | [Documentation index](docs/README.md) | English |
| Use logos and banners | [Brand assets](assets/brand/README.md) | English |

## Contributing and license

Bug reproductions, clearer documentation, synthetic examples, and reports from other environments are welcome. Read [CONTRIBUTING](CONTRIBUTING.md) and [SECURITY](SECURITY.md). Do not attach private papers, research notes, or model logs to public reports.

Code, documentation, the skill, and synthetic examples use the [MIT License](LICENSE). Papers, datasets, and user-supplied material retain their own terms. See [third-party notices](THIRD_PARTY_NOTICES.md) for dependencies and [brand assets](assets/brand/README.md) for artwork.
