# Product scope

Summary: Reuse paper evidence in project decisions through shared records, an agent skill and local evidence views. Keep author claims and project decisions separate; future goals are not shipped features.

## Problem and intended users

Researchers, CS learners and developers need to revisit paper evidence when asking an existing agent for implementation, experiment advice or related-work comparison. Repeated summaries can lose conditions or transfer results into a different project incorrectly. General demand and sustained usefulness remain unmeasured.

## Target environment

Local PC and laptop use in desktop browsers. Design, optimization and verification target this environment only.

## Core flow

Find/select papers → collect verified editions with draft consent → analyze into shared Paper and topic records → compare current supported claims → return to original evidence or export project context. Standalone relationship HTML is another supported view, not a hosted application.

## Requirements and status

| ID | Requirement | Current scope |
| --- | --- | --- |
| M1 | Share Paper evidence across project-specific Applications | File-based records and references; project decisions remain separate |
| M2 | Preserve edition, locators, check scope and source/AI/observation/decision distinctions | Schemas, review snapshots and evidence views; source truth still needs actual reading |
| M3 | Create/edit cards with persistent, safe round-trip storage | Future work; the shipped comparison viewer is read-only |
| M4 | Compare research and explore recorded relations | Topic comparison and standalone maps with evidence/provenance; no inferred source inheritance |
| M5 | Reuse an existing agent | Markdown/JSON export and portable skill; no bundled model service |
| M6 | Reuse external-tool material | Explicit native files now; additional import formats require separate selection/validation |

The core workflow must remain usable with manually prepared records. A self-running web agent or paid model API is not required. Fixed guidance is English; generated research prose follows [requested language](../skills/danseo/SKILL.md#output-language).

## Boundaries

No custom search engine/OCR/parser, automatic novelty judgment, automatic experiments/submissions, accounts/payments/multiuser sync, cloud storage, universal ontology, graph database or MCP server is included. Real-time Zotero/PaperQA integrations need separate work after core validation. Native file collection may use existing dependencies without becoming an autonomous research service.

Research comparisons preserve questions, comparators and evaluation conditions. Experiment advice preserves task/model/input-output constraints and prior results. Each target project owns novelty claims, external scores and decisions; do not force one experiment metric across projects.

## Acceptance and evaluation

Verify actual read/save/export/reference behavior for the applicable requirement. Evaluate source reachability, wrong transfer, missing conditions, time and maintenance cost using the [evaluation plan](../evals/README.md), with baseline/targets fixed before comparison. Do not promise improvements before measuring them. Separate skill answer quality, graph navigation benefit and user understanding; an agent that never saw the graph does not establish a graph effect.

Record format compatibility, edition changes and actual new-user installation need continued evidence. See [structure](STRUCTURE.md), [card model](CARD_MODEL.md), [runtime support](RUNTIME_SUPPORT.md), [current roadmap](../TASKS.md) and [distribution boundaries](OPEN_SOURCE.md).
