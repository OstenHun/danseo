# Personal learning records

Summary: Keep source, resume state and actual attempts in one authorized personal record per paper. Preserve verbatim learner responses and distinguish them from AI explanations across edits and editions.

## Location and identity

Reuse an existing canonical learning record. The default new path is `<personal-workspace>/learning/<record-key>/reading.md`. A `record-key` is one directory component, starts with `paper-`, contains only lowercase English letters, digits and hyphens, and is at most 64 characters; for example `paper-demo`. Choose a shorter authorized location if the full path exceeds environment limits. Preserve the original Paper ID, including its case, dots or underscores, separately in the record.

Reject slash, backslash, absolute paths and `..` in the key. Verify the actual parent and link/junction target stay within the authorized personal workspace. If the key exists, compare its source before reusing it; do not combine different papers. Ask when the connection is ambiguous. For an unregistered paper, write `Paper ID: unregistered` and the exact source location, adding a link if it is registered later. Do not automatically move folders or copy original sources.

Do not register this file in the manifest or Paper schema. This is an agent record convention, not a new storage API or automatic backup implementation.

## Minimal format

Use only needed fields. Never fill missing learner answers with AI answers. Preserve quotations and actual responses verbatim. The following is a reusable template, not an actual attempt; write its headings and prose in the requested language.

```markdown
# Reading <paper title>

Summary: <What can currently be explained and what remains open; say when no attempt has been made.>

## Source and purpose

- Paper ID / canonical record: <existing connection or unregistered>
- Edition / source: <verified file, URL and edition, or unknown>
- Purpose: <orientation, implementation preparation, research review, etc.>
- Learner-reported reading scope: <actual statement or unknown>
- Agent-inspected source scope: <actual sections/pages; state partial access>

## Current resume point

<Latest attempt, pending check, one next check and required source>

## Explanations and issues

- Learner explanation: <link to an actual attempt, or none yet>
- AI explanation: <needed explanation, not attributed to the learner or treated as understanding evidence>
- Issue and evidence: <difference/limitation and actual source location>

## Attempt history

### <timestamp or distinct attempt ID> — <target>

- Edition and inspected scope at the time: <evidence used>
- Question: <what was actually asked>
- Verbatim learner response: <actual quotation or no response>
- Help provided: <answer-first, explanation, hint, or answer not provided first in this session>
- Feedback and source location: <correct parts, gaps, corrections, alternative reading, not assessable>
- Changed-case check: <new question/actual response, or pending>
```

## Update and resume

Keep the current resume point as the single next-action reference, updated briefly from actual attempts. Link attempts from explanatory sections instead of copying answers twice. An AI-edited sentence belongs under AI explanation. New explanations and post-correction answers are new attempts; never replace older responses.

Record meaningful questions, corrections or stopping points rather than transcribing every message. Re-read before writing and preserve/compare concurrent changes instead of overwriting them.

When an edition changes, record the new edition and affected questions. Do not overwrite past feedback with a judgment about the new edition. Neither outside assistance nor complete understanding can be guaranteed; record only observed response conditions and scope.

When stopping without saving permission, return the last question, inspected source, gaps and one next check in chat only. Another chat needs that handoff or the existing record to resume. Never claim a nonexistent file/history was created.
