# Documentation

Summary: English guides cover installation, workflows, formats and evidence checks. Standalone research UI supports Korean/English; prose follows the request. Internal execution records stay local.

[Project overview](../README.md) · [한국어 안내](README.ko.md)

## Start here

| Guide | Purpose |
| --- | --- |
| [Install the skill](../README.md#install-the-skill) | Complete portable folder, host paths and first request |
| [CLI setup](CLI.en.md) | Build and connect private topics/workspaces |
| [Full CLI reference](CLI.md) | Commands, inputs, outputs and limits |
| [Topic workflow](TOPIC_WORKFLOW.md) | Discovery → collection → analysis → comparison |
| [Skill overview](../skills/danseo/README.md) | Portable and CLI paths |

## Research records and views

- [Paper analysis](PAPER_ANALYSIS.md): answers, notes, editions and resumption.
- [Claim review JSON](CLAIM_REVIEWS.md): frozen inputs, results, hashes and current support.
- [Research comparison](RESEARCH_COMPARISON.md): criteria, provenance filters and local read-only evidence viewer.
- [Card model](CARD_MODEL.md) and [repository boundaries](STRUCTURE.md): records, ownership and storage.
- [Standalone view contract](../skills/danseo/references/research-view.md): candidate formats and rendered checks.
- [Reading results](../skills/danseo/references/reading-results.md): per-paper reading files assembled into the candidate and evidence files.
- [Source verification](../skills/danseo/references/relation-verification.md), [overview/count gate](../skills/danseo/references/evidence-gate.md) and [performance verification](../skills/danseo/references/performance-verification.md): source/AI distinctions, counts, table conditions and exceptions.

## Language and permissions

Standalone research and learning labels support candidate `language` (`ko`/`en`). Omitted language uses English UI in both views. CLI/native comparison labels, diagnostics and active skill instructions remain English. Agent-authored prose follows the [requested-language rule](../skills/danseo/SKILL.md#output-language); original titles, quotations, IDs and saved records are preserved. Other requested prose languages use English controls. There is no live language selector or content translation service. Korean README editions remain available.

The repository provides [three complete skills](../README.md#companion-skills-and-output-language): research records/maps, paper learning, and project application decisions. A local read-only comparison viewer is optional; no card editor is bundled. Keep private papers, workspaces, learner answers, raw logs and internal execution/review notes local. Public examples are synthetic; tests do not prove reader understanding or usefulness.

## Development and contribution

- [Contributing](../CONTRIBUTING.md) and [runtime support](RUNTIME_SUPPORT.md): builds, tests, packaging and supported execution.
- [Agent compatibility](AGENT_COMPATIBILITY.md): integration boundaries and remaining checks.
- [Product scope](PRD.md), [current roadmap](../TASKS.md) and [evaluation plan](../evals/README.md): shipped behavior, future work and unmeasured benefits.
- [Distribution boundaries](OPEN_SOURCE.md) and [security](../SECURITY.md): public/private material and reporting.
- [Brand assets](../assets/brand/README.md) and [third-party notices](../THIRD_PARTY_NOTICES.md): artwork and attribution.
