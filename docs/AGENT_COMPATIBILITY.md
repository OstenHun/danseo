# Agent connection and compatibility

Summary: Agents with file and shell tools can explicitly read Danseo's skill and call its CLI. Connection, automatic skill discovery, source reading and answer quality require different evidence.

<a id="독립-논문-그래프의-기본-구성"></a>

<a id="연결-방식"></a>

<a id="확인한-범위"></a>

<a id="확인-순서"></a>

<a id="별도-검증이-필요한-것"></a>

## Standalone graph defaults

The [view contract](../skills/danseo/references/research-view.md) owns shared generators, topic layout, short names and reading checks. Source/AI and performance evidence procedures apply across hosts. A documented procedure does not guarantee every future model follows it.

## Connection methods

| Environment | Connection | Boundary |
| --- | --- | --- |
| Local coding agent | Tool path, workspace, project ID, skill path and CLI | Host file/shell permission required |
| Ordinary chat | Person supplies Markdown evidence bundle, current question and necessary sources | Do not assume access to local paths |
| Custom agent host | Forward JSON/Markdown/exit codes as tool results | Host owns APIs/model SDKs/permissions |

See [first-run values](CLI.md#first-run) and [setup](CLI.en.md#connect-your-own-workspace). Begin with explicit [skill](../skills/danseo/SKILL.md) reading; do not assume global installation or automatic discovery. Repository updates do not replace installed skills. Standalone research guidance follows candidate `language` (`ko`/`en`, default `en`); CLI/native comparison guidance remains English. [Generated prose](../skills/danseo/SKILL.md#output-language) follows the requested language. No live language selector or content translation service is bundled.

## Observed scope

The [companion skills](../README.md#companion-skills-and-output-language) use English instructions and requested-language explanations. `danseo-reading` owns learning questions and concept views; `paper-to-project` owns paper/project condition comparisons. Learning views explicitly support `language: en | ko`; omission preserves their legacy Korean UI. Other prose languages use English fixed controls. Each complete folder is independently usable; host discovery still needs a separate check.

In a prepared installation/build/data environment, two local agents called CLI and read cards. One accessed original text; another failed to read a PDF and made some unsupported source/CLI claims. This is not a provider/model ranking. Private prompts/responses/authentication are not shareable examples.

Public reproducibility uses [synthetic records](../examples/minimal/workspace.json), automated tests and CI. New-device onboarding, automatic discovery, human usability and independently scored answer quality remain unverified.

## Verification order

1. Execution: inspect actual exit code/stdout/stderr and draft inclusion.
2. Evidence reading: current question section, Application/Paper conditions, limits and unknowns.
3. Original sources: actual edition/page/table/section; separate text and visual coverage.
4. Answer agreement: retain each claim ID's scope, sample, metric and method.

URL access is not PDF reading; access failure does not prove no evidence and should not be repeated unchanged. Distinguish a full file supplied by the host from the selected question section in export.

## Checks still requiring separate evidence

- Automatic discovery: isolate host installation/version/settings.
- New-user setup: observe first use without relying on old builds, paths or login.
- Usefulness: compare identical inputs/budgets with independent scoring using the [evaluation plan](../evals/README.md).
- Requested-language compliance: inspect actual host-generated prose; preserving supplied Korean/English text in a renderer does not prove model compliance.

CLI performs no model calls or external transmission. Each host owns provider settings, tool permissions and material transfer.
