# Current scope and roadmap

Summary: Danseo provides file-based discovery, source collection, paper analysis, comparison and standalone evidence views. Editing and usefulness evaluation remain separate future work.

## Available workflows

- Topic discovery and stable selections: [CLI reference](docs/CLI.md).
- Source collection, edition checks and draft consent: [collection](docs/CLI.md#collect-selected-originals).
- Shared Paper records, topic answers and resumption: [analysis](docs/PAPER_ANALYSIS.md).
- Read-only research comparison: [comparison](docs/RESEARCH_COMPARISON.md).
- Standalone HTML with source, count and performance checks: [view contract](skills/danseo/references/research-view.md).
- Paper-node source shortcuts in standalone HTML: [open the registered original and read its recorded locations](skills/danseo/references/research-view.md#open-the-original-from-a-paper-node).
- English fixed guidance and requested-language prose: [language rules](skills/danseo/SKILL.md#output-language).

## Next areas

- Card editing and safe write round-trips require a separately scoped implementation; they are not included in the public viewer.
- Import adapters should follow actual demand after the core data contract is validated.
- Evaluate source reachability, incorrect transfer, missing conditions, time and maintenance cost separately from functional tests. See [evaluation plan](evals/README.md).
- Observe new-user setup and host instruction compliance before claiming usability or learning benefits.

## Development checks

Use the [contribution guide](CONTRIBUTING.md) and current PR Checks. Detailed execution logs, model-review records and dated work notes stay in local ignored work storage. Public status describes supported behavior, not every development step.

<a id="ptp-011--논문별-분석과-재개"></a>
## PTP-011: paper analysis

Implemented workflow: [analysis contract](docs/PAPER_ANALYSIS.md). Product regressions cover resumption, edition changes, preserved notes, stale reviews and unsupported-claim exclusion. This is not proof of human reading quality.

<a id="ptp-012--연구-비교"></a>
## PTP-012: research comparison

Implemented workflow: [comparison contract](docs/RESEARCH_COMPARISON.md). Tests cover current support, missing evidence, relation dependencies, provenance filters, scoped PDF access and installed assets. Human usefulness and native permission UX need separate evidence.
