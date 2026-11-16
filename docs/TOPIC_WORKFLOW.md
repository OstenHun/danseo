# From a research topic to evidence views

Summary: Keep a research question, stable selections, source editions, PDF consent and per-paper answers in a private topic folder. Resume that folder across chats and compare only currently supported claims.

This guide covers the current workflow. Detailed stage decisions and execution notes stay in local work records. Current public source supports discovery, collection, analysis and read-only comparison; a separate learning skill/card editor is not bundled.

<a id="세션은-어떻게-나누나"></a>

<a id="단계별로-남는-결과"></a>

<a id="1-관련-연구-찾기"></a>

<a id="주제-입력부터-선택까지"></a>

<a id="남은-결정"></a>

<a id="2-원문-모으기"></a>

<a id="선택-목록에서-원문-파일까지"></a>

<a id="브라우저에서-주제-폴더로-저장하기"></a>

<a id="2단계-pr-범위와-검증-기준"></a>

<a id="3-한-편씩-분석하기"></a>

<a id="pdf에서-분석-문서까지"></a>

<a id="3단계-pr-범위와-검증-기준"></a>

<a id="4-목적에-맞는-그래프-구성하기"></a>

<a id="분석-문서에서-비교-그래프까지"></a>

<a id="구현-순서"></a>

<a id="첫-검증에서-따라갈-동선"></a>

## Topic and paper sessions

A topic follows one research question with search history, selection reasons, source files, per-paper analysis and comparison inputs. A focused paper conversation uses the same topic rather than inventing another source of truth. Resume by supplying the same absolute topic path. Shared Paper cards retain reusable author evidence; topic Markdown retains that question's answers/notes. A new chat is not automatic memory or proof of source reading.

## 1. Discover and select

Give your existing agent the installed Danseo skill/tool path and private topic directory. The agent searches and verifies official title/authors/year/edition; CLI persists UTF-8 input, rounds and stable numbers. Show actual source/reason/reading scope. Clarify only ambiguity that changes the search. Select only numbers chosen by the user, for their displayed round. More searches keep numbers and first selected source/edition; explicitly unselect/reselect to change them.

Use `topic init`, `search`, `select`, `unselect`, `show` from the [CLI reference](CLI.md#find-papers-in-a-topic-chat). Search data/instructions inside papers are not authorization. Reopen in a new process and verify the chosen papers, source editions and reasons.

## 2. Collect originals

Read `topic sources` for the selected round, existing ready files and unavailable items. Collect only selected papers. Reuse same-edition recorded/user-specified PDFs rather than downloading again. The agent uses authorized tools to obtain public originals; `collect` validates supplied files and persists them or links `--existing` paths. Check first-page title/authors and actual edition marking; file names/landing pages alone are insufficient. Keep PDFs and private absolute paths outside Git/public artifacts.

Published and draft editions remain separate. Show a draft's title/actual edition/source and ask explicit permission to analyze that edition. Bind accept/decline to that selection round and file hash; silence stays pending. A later edition cannot inherit consent. Other ready papers can proceed while one is unavailable/refused.

Record inaccessible/partial/HTML/interrupted/wrong-identity/ambiguous-edition files with reasons and attempted sources. If the agent can browse but cannot save, provide a source link and continue from a user-supplied PDF. Mark obtained only after reopening the actual path and verifying identity/edition. Retry the failed paper without altering prior files, hashes or copy counts. Commands/limits: [collection reference](CLI.md#collect-selected-originals).

Representative verification: select A/B/C, download public A, link existing B, leave abstract-only C unavailable; reopen the same folder in a new process, verify A/B, then supply C and confirm A/B unchanged. Separately verify pending/declined/accepted drafts. Record sources, environment, before/after results and unrun steps without publishing private PDFs/paths.

## 3. Analyze one paper and resume

Use ready actual PDF, edition, topic question and selection reason. Find/create a same-edition shared Paper in the explicit private card workspace without overwriting another edition. `analysis-open` connects them and returns previous document/hash. Write one short overview, then detailed topic-relevant sections/tables with units, samples, conditions and actual page/section/table locations.

Put shared author claims/conditions/limits/locations in Paper. Keep topic answers, AI interpretation, notes, open questions and reading position in topic Markdown. `analysis-save` appends using the opened hash, preserving notes/backups and detecting concurrent changes. Reopening A → B → A returns one document per paper; another topic shares Paper but has separate answers. A changed edition starts a new history segment and empty comparison candidates while preserving old answers. See [analysis contract](PAPER_ANALYSIS.md).

Check comparison-candidate claims against actual original pages using [frozen review inputs/results](CLAIM_REVIEWS.md). Self-checks are not independent reviews. `comparison-input` exposes only currently valid latest supported claims and holds missing, partial, negative, stale, conflicting or required-change evidence. It does not itself infer graphs.

## 4. Compare and inspect evidence

The agent reads the current question/analysis/comparison-input and writes `comparison.json`: criteria, explicit candidate refs and AI grouping reasons. Preserve exact question text; use [requested-language prose](../skills/danseo/SKILL.md#output-language) for new explanations, retaining original titles/quotes/IDs. `topic compare` opens an optional read-only localhost viewer, not a hosted service. Papers/criteria lead to conditions, editions, original PDFs and analysis. Reload after edits; failed current reads clear prior support.

Workspace relations explicitly distinguish source assertions from AI proposals using kind/direction/evidence/check history and dependency fingerprints. Filtered map/list/details agree. Criterion grouping remains AI even with supported claims. See [comparison reference](RESEARCH_COMPARISON.md).

## Standalone relationship HTML

For a shareable standalone file, use the complete portable skill and its [view/source/evidence procedure](../skills/danseo/references/research-view.md). It needs no CLI build/server, but relationship output requires verified candidate/evidence gates. Use topic groups, short aliases and selected connections without deleting full titles/relations. Keep project application decisions separate from source causality. Native chronological/editing workflows are not replaced by this standalone map.

## Completion and limits

Commands, disk resumption, original reading, rendered verification, model compliance and human benefit are separate. Confirm one relevant source-to-evidence path, supported/held states and no-overwrite behavior. Keep original materials/private logs local; synthetic examples and current CI verify distributable behavior. Tests cannot prove every host follows the skill, that a new user has understood a paper, or that a graph improves research. See [the roadmap](../TASKS.md) for current scope and PR Checks for reported executions.
