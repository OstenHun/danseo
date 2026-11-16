# Documentation

Summary: Start with the English README and CLI guide. This index separates current workflows from detailed formats and historical plans, and labels references that remain in Korean.

English · [한국어](README.ko.md) · [Project overview](../README.md)

## Start here

| Guide | Purpose | Language |
| --- | --- | --- |
| [Install the skill](../README.md#install-the-skill) | Install the complete portable skill for your agent | English |
| [CLI and agent guide](CLI.en.md) | Source installation, private workspaces, discovery → collection → analysis → comparison | English |
| [Skill overview](../skills/danseo/README.md) | Evidence reading and standalone relationship HTML | English |
| [Contributing](../CONTRIBUTING.md) · [Security](../SECURITY.md) | Development checks, private-material boundaries, and reporting | English |
| [Evaluation plan](../evals/README.md) | Separate product behavior from practical benefits | English |
| [Brand assets](../assets/brand/README.md) · [Third-party notices](../THIRD_PARTY_NOTICES.md) | Artwork, dependency notices, and licenses | English |

The skill instructions, application labels, some diagnostics, and fixtures still contain Korean. The published source includes the research skill and a read-only comparison app; a card editor and separate learning-HTML skill are outside this candidate.

## Detailed workflow references

These references are currently **in Korean**.

- [Full CLI reference](CLI.md): commands, workspace configuration, errors, and outputs.
- [Paper analysis and resumption](PAPER_ANALYSIS.md): follow-up questions in the same document, Paper reuse across topics, and current comparison claims.
- [Research comparison](RESEARCH_COMPARISON.md): paper/criterion selection, source evidence, AI reasons, and relationship provenance filters.
- [Claim-level reviews](CLAIM_REVIEWS.md): pinned inputs, results, PDF hashes, and source-support judgments.
- [Research skill](../skills/danseo/SKILL.md): agent source-reading and verification procedures.
- [Agent compatibility](AGENT_COMPATIBILITY.md): tested integrations and remaining checks.
- [Default graph presentation](GRAPH_DEFAULTS.md) · [Performance evidence](PERFORMANCE_EVIDENCE.md): graph defaults, source-table conditions, exceptions, and scoped verification.

## Developing Danseo

These references are currently **in Korean**.

- [Runtime support](RUNTIME_SUPPORT.md): supported/recommended versions, checks, updates, and end-of-support criteria.
- [Naming](NAMING.md): the meaning of Danseo, identifiers, and name-conflict search scope.
- [Task list](../TASKS.md): canonical development tracking; preserve `PTP-*` identifiers.
- [Card model](CARD_MODEL.md) · [Repository structure](STRUCTURE.md): data formats, ownership, and storage boundaries.
- [PRD](PRD.md): requirements and future scope, which extend beyond implemented features.
- [Topic workflow](TOPIC_WORKFLOW.md): discovery, source collection, analysis, and comparisons.
- [Project setup](PROJECT_SETUP.md) · [Distribution records](OPEN_SOURCE.md): operating and publication history.

## Design and historical records

The [reuse review](REUSE.md), [technical direction](TECH_DIRECTION.md), [proposed usage flow](USAGE_FLOW.md), [bootstrap record](BOOTSTRAP.md), and [CLI implementation record](CLI_IMPLEMENTATION.md) are preserved in Korean. Read each with its date and unverified scope. Historical statements about missing features or undecided licensing may not describe the current source.

Distribution and task records also preserve dated private or unreleased snapshots alongside later public-transition entries. Read their dates before interpreting an older status as current.

References to `work/` identify private local evidence excluded from distribution. Public reproduction material consists of [synthetic examples](../examples/minimal/workspace.json) and tests. Private experiments are not public evaluation results.
