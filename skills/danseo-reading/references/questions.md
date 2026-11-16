# Choosing paper questions

Summary: Choose source-grounded questions that reveal the reader's explanation of a paper. Adapt them to the paper and purpose; do not use this guide as a mandatory quiz checklist.

## Start from the learning purpose

For orientation, focus on explaining the problem, main idea, representative evidence and limitations in the reader's own words. For implementation, inspect inputs/outputs, variables, assumptions, a small worked example and reproduction details. For research review, examine comparison criteria, alternative explanations, evidence gaps and follow-up questions. The purpose may change during the session.

Give a new reader definitions, distinctions between terms, a figure explanation or a small calculation/example before asking for critique. Move from that entry point to concrete judgments. Do not ceremonially ask again about something the reader has already explained well.

Select only useful questions. Connect an actual source location to a judgment rather than asking for memorized terminology.

| Purpose | Possible question | Source to inspect |
| --- | --- | --- |
| Problem | What difficulty does this paper address, and what does its framing leave outside scope? | Motivation, problem definition, existing limitations |
| Basic concepts | Can you explain a key term with a small example? How does it differ from a similar concept? | Definitions, background and notation |
| Contribution | What is new and what is reused? | Contribution statement and actual method/results |
| Method | What happens to one input? What role does this variable or assumption play? | Algorithm, equations, design or diagram |
| Evidence | Which result most directly supports the main conclusion? Under what comparison conditions or proof assumptions? | Tables, figures, evaluation setup or proof |
| Critique | What else could explain the result? Which explanations does this comparison exclude or leave open? | Controls, baselines and discussion |
| Limits and transfer | If one assumption changes, which conclusion must be checked first? | Scope, assumptions and limitations |
| Synthesis | How has the reader's explanation changed? What remains open or worth testing in a project? | The actual learner response and relevant evidence |

A question such as “If this input doubled in Figure 2, which stage would change?” needs an actual Figure 2 and a defensible hypothetical. Never invent figure numbers, measurements or ablations to sound specific. Narrow the question or request the necessary source when evidence is insufficient.

## Adapt to the paper type

- Theory: definitions, theorem assumptions, the key proof step and counterexamples after removing assumptions. Do not require experiments.
- Systems/methods: design choices, inputs/outputs, alternatives and resource conditions. Do not grade guessed implementation details absent from the paper.
- Experiments: controls, splits, metrics and uncertainty. Do not turn correlation into causation or compare numbers from incompatible conditions.
- Surveys: scope, selection criteria, classification evidence and possible omissions. Do not assume every paper proposes an algorithm.

## Example prompts for adversarial-attack papers

These are question candidates, not facts or answers about any particular paper. Use them only when the paper supplies the relevant definitions/results.

- What information does the attacker have, what can they change and what constrains attack size or attempts?
- How is success measured? What do clean and attacked performance each establish?
- Would the comparison still hold with a different information or compute budget? If the paper does not answer, what would need checking?

After a definition check, prefer a changed-condition explanation to repeating the same answer. Treat outcomes outside the inspected source as learner hypotheses, not conclusions proved by the paper.
