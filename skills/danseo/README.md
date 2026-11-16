# Danseo research skill

Summary: Use your existing agent to read evidence, manage research records through the CLI, and generate standalone relationship HTML. The skill adds no model service or automatic global installation.

## What is included

[SKILL.md](SKILL.md) is the canonical agent procedure. It connects discovery, source collection, analysis, claim review, comparison, and source verification. The instructions, detailed usage references and [CLI guide](../../docs/CLI.en.md) are in English.

`agents/openai.yaml` provides display metadata, not an autonomous agent or model configuration.

Optional companion skills are distributed alongside this folder: `danseo-reading` for learning questions/concept views, and `paper-to-project` for application decisions. Install each complete folder separately when needed. Their instructions are English; their explanations follow the request language.

Standalone research HTML uses `language: "ko"` or `"en"` for fixed controls and guidance. Set it to match the request before generating; omitted language keeps the legacy English UI. [Agent-authored prose](SKILL.md#output-language) follows the requested language. Original titles, quotes, identifiers and saved records remain unchanged. The renderer does not detect or translate research content and has no live language switch. CLI/native comparison controls and diagnostics remain English.

## Install and connect

For standalone relationship HTML, use Node.js 22 or 24 and the **complete skill folder**, including `scripts/`, `references/`, and `assets/`. No npm installation, Danseo build, or server is needed for this path. Follow the [installation guide](../../README.md#install-the-skill) for host-specific destinations, duplicate-installation checks, updates, and a first prompt.

For topic and card management, build the Danseo CLI separately and follow [CLI and agent setup](../../docs/CLI.en.md). Reuse existing connection values and private records. Do not automatically replace global installations or copy private research into product source.

## Evidence workflow

Find the relevant cards and project question, check the edition, current conditions, and existing experiments, then revisit necessary sources before recommending an application decision and a minimal next action. Missing information in a card is not proof that the research does not exist.

Preserve the recorded reading scope and source-recheck conditions. Keep author claims, AI interpretations, project observations, and adoption decisions distinct. The skill neither extends execution permissions nor guarantees model performance.

## Standalone research HTML

The bundled generators support paper relationships and project-application views using common assets. For relationship mode, perform [source verification](references/relation-verification.md), then pass the [overview and quantity checks](references/evidence-gate.md) before saving. Performance comparisons also follow the [table-condition and exception procedure](references/performance-verification.md). Follow the same evidence gates in every output language.

The [research-view contract](references/research-view.md) describes input formats. Automated checks, source-meaning review, actual rendered reading, and user understanding are separate evidence. The full CLI's read-only topic comparison app is a separate workflow; it is not a card editor or a separate learning-HTML skill.

Select a paper node or its matching list entry to find **Read the paper** at the top of its details. **Open original source ↗** opens a registered URL in a new tab, with all recorded reading locations shown alongside it. Missing URLs are not inferred. See [source shortcuts and scope](references/research-view.md#open-the-original-from-a-paper-node). Regenerate existing HTML after updating the skill.

Optional [concept backgrounds](references/research-view.md#optional-concept-backgrounds) open a separate map from the current paper to a concept and selected background papers. Selection reasons, reading locations and a return question guide a bounded detour. Actual citations, AI-selected background and suggested reading order remain separate. See the [synthetic input](assets/paper-backgrounds.v2.example.json); new fields require the updated complete skill folder.
