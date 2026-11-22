# Distribution and private-data boundaries

Summary: Distribute the Danseo source, portable skill and synthetic examples. Keep private papers, workspaces, raw logs and internal development records local; inspect exported content before sharing.

## What belongs in the repository

Standalone research orientation uses the installed host's search and primary-source access. See [orientation scope](../skills/danseo/references/paper-orientation.md) and [checked-state evidence](../skills/danseo/references/evidence-gate.md#original-source-checks). Downloaded research originals, extraction files and provider logs remain local. The original-source gate binds submitted bytes and excerpts; it does not certify publisher authenticity or an agent's interpretation.

- Product source, schemas, build/test tools and public usage documentation.
- Complete portable `skills/danseo`, `skills/danseo-reading` and `skills/paper-to-project` folders with their required references, generators and assets.
- Synthetic fixtures, examples and an evaluation plan with no private answer keys.
- License, dependency attribution, contribution and security guidance.

Use [source installation](../README.md#install-the-skill). The package is marked `private: true`; do not replace these instructions with an unrelated npm package of the same name. The npm `files` allowlist controls tarball contents; verify the actual archive with `npm run test:package`.

## First-install research views

Copy the complete skill folders from the same source revision. The [candidate contract](../skills/danseo/references/research-view.md#prepare-candidate-input) and [verified generation loop](../skills/danseo/references/evidence-gate.md#default-generation-workflow) cover required v2 fields, validator feedback and evidence for inputs with or without count/performance claims. English instructions serve all hosts; agent prose and fixed standalone controls follow the request language. Regenerate existing HTML to receive graph and evidence-reader changes. Updating source does not update existing global skill copies automatically.

Fresh isolated English and Korean Claude sessions on Windows/Node 24.22.3 generated verified HTML from synthetic teaching text, with no test-harness candidate corrections. A separate session repaired the previously malformed English draft using actual validator feedback. This is finite workflow evidence, not proof of automatic skill discovery, every host/model, another physical PC, scientific truth or learning outcomes. Portable regressions and actual tarball checks remain separately reproducible with [runtime checks](RUNTIME_SUPPORT.md#verification-and-actual-evidence).

## What stays local

Private PDFs, research records, learner responses, absolute-path handoffs, credentials, raw provider/browser logs, review packets and dated implementation notes belong outside distributed source. `work/`, `workspaces/` and `private/` are local-only ignored areas. Do not copy another project's authoritative records into this repository.

Git ignore rules do not remove already tracked content. Inspect files and package contents before publishing. Changing current documents does not erase prior Git commits; history removal is a separate action.

## Sharing research output

Exports may contain full card text and absolute paths. Inspect them before sharing and verify source permissions. A public paper URL does not automatically grant rights to redistribute its PDF. Distinguish synthetic demonstrations from actual paper results and source checking from reproduction or understanding.

Keep author claims, AI interpretations, project observations and adoption decisions distinct. The [skill](../skills/danseo/SKILL.md) owns source procedures; [runtime support](RUNTIME_SUPPORT.md) and [contribution checks](../CONTRIBUTING.md) describe supported execution and verification.

## Reports and contributions

Use [CONTRIBUTING](../CONTRIBUTING.md) for reproducible synthetic reports and [SECURITY](../SECURITY.md) for private vulnerability reporting. Do not attach private originals or raw model logs to public issues.
