# Danseo

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="assets/brand/banner-compact-dark.svg">
  <source media="(max-width: 640px)" srcset="assets/brand/banner-compact-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/banner-dark.svg">
  <img src="assets/brand/banner-light.svg" alt="Danseo — research evidence, project decisions." width="100%">
</picture>

**Bring research evidence into project decisions.**

Danseo (단서) means “clue” in Korean: a clue from research to inform your next project decision. See [the name and identifiers](docs/NAMING.md).

Summary: Keep paper choices, source PDFs, answers and comparison evidence in local files with your existing AI agent. A development preview with a CLI and a read-only research comparison view.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node.js 22 or 24 LTS](https://img.shields.io/badge/node-22%20%7C%2024%20LTS-43853d.svg)
![Development preview](https://img.shields.io/badge/status-development_preview-orange.svg)

[한국어 — default](README.md) · English · [Quick start](#quick-start) · [Setup and workflow](docs/CLI.en.md) · [Contributing](CONTRIBUTING.md)

## Why Danseo?

A paper summary rarely tells you everything needed to use a method in a project. You also need the evaluation conditions, the source location, and a record of why you chose to apply, test, or defer it.

Danseo keeps shared research records separate from project decisions. Multiple projects can reference the same claim while making different decisions about it.

```text
Paper        Claims, conditions, source locations, review status
   ↓ claim IDs
Application  Project question and application decision
   ↓ validate → export
Agent        Read evidence → compare conditions → revisit sources
```

## Quick start

Requires **Node.js 22.x or 24.x LTS and npm**. Use the latest 24.x patch for a new installation. Run from a downloaded source directory. There is no published npm package yet; do not install an unrelated package with the same name. The [runtime policy](docs/RUNTIME_SUPPORT.md) separates supported versions, the recommended version, and actual verification.

This is a short synthetic demo. The [English setup guide](docs/CLI.en.md) covers source installation, private workspaces, agent connection and source-access failures. The [Korean reference](docs/CLI.md) covers the full format.

```sh
npm ci
npm run build
node ./dist/cli.js validate --workspace ./examples/minimal --json
node ./dist/cli.js export --workspace ./examples/minimal --project demo --application app-demo --include-drafts --format markdown
```

Validation reports `ok: true`, 3 records, 2 projects, and a draft warning. The fixture is synthetic, so the warning is expected. `--include-drafts` permits exploratory export without changing its review status. Validation checks structure and references, not scientific truth or reproducibility. Some CLI messages and the fixture are currently in Korean.

### Find and revisit papers for your topic

Give an existing AI agent the absolute tool directory, `skills/danseo/SKILL.md`, and a private topic directory. The agent needs file and shell access; finding papers also requires its own search tools.

```text
Read skills/danseo/SKILL.md in this Danseo directory.
Find papers for my research question using the private topic directory I provide.
Show sources, editions and recommendation reasons so I can choose.
```

Continue with “Collect the sources I chose”, “Read paper 1 and answer this question”, or “Compare these papers using the evidence checked so far”. Supply the same tool, skill and topic directory in a new chat. The [English workflow guide](docs/CLI.en.md#find-collect-analyze-and-compare) explains each step and its prerequisites.

## What works today

| Command or feature | Purpose |
| --- | --- |
| `validate` | Check schemas, IDs, claim references, and project paths |
| `list` / `show` | Find project records and read original cards |
| `export` | Export an Application and linked Papers as Markdown or JSON |
| Evidence preservation | Keep original content, comments, extension fields, hashes, paths, and review status |
| Agent skill | Guide evidence reading, condition comparison, and source verification |
| Find and select | Save search rounds, stable numbers, and each selection's source, edition and reason |
| Collect sources | Store a managed copy of an agent-supplied PDF or link an existing file; check title, authors and edition; record preprint consent |
| Analyze and resume | Link shared Paper cards to topic-specific Markdown answers and notes; append answers and resume in a fresh process |
| `topic compare` | Use claims with current source-support reviews in a read-only graph of conditions, sources and AI reasons |

**Your agent performs search, downloads, reading and comparison-criteria writing.** Comparison requires Paper cards, claim-review files and `comparison.json`, prepared by the agent using the [bundled skill](skills/danseo/SKILL.md). The CLI does not independently verify a paper's claims.

The CLI needs no model key, database or permanent server and makes no outbound requests. Topic commands write selection, source and analysis records in the specified private directory. Only `topic compare` starts a local read-only server; stop it with Ctrl+C. The existing card export's `--out` creates a new file only. Agent search, downloads and model calls follow that agent's capabilities and permissions.

## Use your own research

Create a private workspace using [the synthetic example](examples/minimal/workspace.json). Register explicit card paths and projects. Follow the [English setup guide](docs/CLI.en.md#connect-your-own-workspace) for the four agent connection values and commands, reusing existing setup when available. The [skill](skills/danseo/SKILL.md) guides your agent through reading the bundle, the current project question, and any necessary sources before making a recommendation. The skill and some CLI messages are currently in Korean; the English guide explains the required evidence-reading flow.

Paper records describe research claims and sources. Application records describe project decisions. Keep author claims, AI interpretations, project observations, and adoption decisions distinct.

**Before sharing:** exports include full card content and local absolute paths. Review them before sharing with another person or an external AI service. Your agent's provider and permissions determine whether it sends that material externally.

## Status and roadmap

Version `0.1.0-dev.1` is a development preview. The schema and CLI may change.

- This candidate: find → collect → analyze and resume → compare, existing card validation and export, the agent skill and synthetic examples.
- Not included in this source: the card editor and a separate learning-HTML generation skill. Features in a local development copy are not part of this candidate.
- Separate evaluation: human use across new chats, understanding and learning effects. Desktop use is in scope; mobile support and testing are excluded.

Automatic PDF summaries, a built-in LLM, autonomous experiments, site submissions and an MCP server are not included. CI for main `d5fbc4b` passed on Windows and Ubuntu with Node 22/24 and macOS with Node 24. Node 26 is a non-blocking compatibility preview. The repository is currently private. See [release preparation](docs/OPEN_SOURCE.md), [runtime evidence](docs/RUNTIME_SUPPORT.md), and [tasks](TASKS.md) for the candidate's checks and remaining transition steps.

Korean remains the primary documentation language. The bundled skill, UI and some diagnostics are in Korean; the [English guide](docs/CLI.en.md) covers installation and the four-step workflow.

## Contributing and license

The editable design source, logo, banners, and social preview are listed in [brand assets](assets/brand/README.md).

Bug reproductions, documentation improvements, synthetic examples, and platform reports are welcome. Read [CONTRIBUTING](CONTRIBUTING.md) and [SECURITY](SECURITY.md). Do not attach private research, documents, or model logs to public reports.

Project code, documentation, skill, and synthetic examples use the [MIT License](LICENSE). Papers, datasets, and user-supplied material retain their own terms. See [third-party notices](THIRD_PARTY_NOTICES.md) for dependencies.
