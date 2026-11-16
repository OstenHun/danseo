# Danseo research skill

Summary: Use your existing agent to read evidence, manage research records through the CLI, and generate standalone relationship HTML. The skill adds no model service or automatic global installation.

## What is included

[SKILL.md](SKILL.md) is the canonical agent procedure. It connects discovery, source collection, analysis, claim review, comparison, and source verification. The instructions, detailed usage references and [CLI guide](../../docs/CLI.en.md) are in English.

`agents/openai.yaml` provides display metadata, not an autonomous agent or model configuration.

Fixed viewer controls and diagnostics are English. [Agent-authored prose](SKILL.md#output-language) follows an explicit language request, otherwise the current work's language or the new request's language. Original titles, quotes, identifiers and saved records remain unchanged. The renderer displays supplied text; it does not translate or detect languages and has no language switch.

## Install and connect

For standalone relationship HTML, use Node.js 22 or 24 and the **complete skill folder**, including `scripts/`, `references/`, and `assets/`. No npm installation, Danseo build, or server is needed for this path. Follow the [installation guide](../../README.md#install-the-skill) for host-specific destinations, duplicate-installation checks, updates, and a first prompt.

For topic and card management, build the Danseo CLI separately and follow [CLI and agent setup](../../docs/CLI.en.md). Reuse existing connection values and private records. Do not automatically replace global installations or copy private research into product source.

## Evidence workflow

Find the relevant cards and project question, check the edition, current conditions, and existing experiments, then revisit necessary sources before recommending an application decision and a minimal next action. Missing information in a card is not proof that the research does not exist.

Preserve the recorded reading scope and source-recheck conditions. Keep author claims, AI interpretations, project observations, and adoption decisions distinct. The skill neither extends execution permissions nor guarantees model performance.

## Standalone research HTML

The bundled generators support paper relationships and project-application views using common assets. For relationship mode, perform [source verification](references/relation-verification.md), then pass the [overview and quantity checks](references/evidence-gate.md) before saving. Performance comparisons also follow the [table-condition and exception procedure](references/performance-verification.md). Follow the same evidence gates in every output language.

The [research-view contract](references/research-view.md) describes input formats. Automated checks, source-meaning review, actual rendered reading, and user understanding are separate evidence. The full CLI's read-only topic comparison app is a separate workflow; it is not a card editor or a separate learning-HTML skill.
