# Evaluation plan

Summary: Evaluate product behavior, agent use of cards and skills, and human graph exploration separately. Private pilots are exploratory evidence. Fix inputs, budgets, and scoring before each evaluation.

## Questions

1. Can a reader or agent reach the relevant evidence and conditions more accurately with the same source material?
2. Does the workflow reduce unsuitable transfer of paper results, repeated failed suggestions, and omitted evaluation conditions?
3. Does a graph help people explore relationships compared with cards and comparison tables alone?
4. Do repeated-use benefits outweigh the time needed to create and maintain cards?

## Comparison conditions

**A:** existing notes, original sources, and usable search. **B:** the same material plus shared cards and a skill. **C:** B plus graph or comparison views. A/B compares agent advice; B/C initially compares human exploration. Do not weaken the baseline by reducing its search budget while giving the other condition more prepared evidence. Without separate ablations, do not attribute effects to cards or skills alone.

Record the same paper set, questions, model/settings, and tool/reading budget, then repeat with new run IDs. Control order and learning effects when participants see the same answer repeatedly, or use equivalent unseen tasks. Separate preparation tasks from evaluation tasks and freeze the evaluation after card preparation. AI-only grading is not independent human review.

## Cases and measures

Research comparisons should cover shared and differing evaluation conditions, unsupported novelty claims, and the design of the next comparison. Experiment advice should cover transfer across task/model conditions, prior failures, and excessive causal interpretation of observations. External evaluation submissions and paper reproduction are separate tasks.

Record source-evidence fit, important omitted conditions, incorrect claims or transfers, task completion time, reading/model costs, and card creation and maintenance time. Set baselines, targets, repetitions, and stop conditions in the advance plan; this document does not report measured results.

## Existing evidence and evaluation material

Private pilots have limits in reading budget, sample size, and AI scoring. Do not reuse them as public performance figures for this project. Preserve originals and detailed conditions separately from shared examples.

Publicly shareable synthetic evaluation fixtures and checks may be added here. Keep private rubrics, raw agent responses, costs, and failure logs under `work/evals/` and review publication separately. Evaluator-only answers must stay outside agent-facing workspaces.
