# Decision: the CLI says when a run's answers came from the test model

- Approval: HAL-16187 (C684 finding 4) asks whether the CLI should say Sample answers as Studio's chip does; the team decided yes on the task, reusing the board-approved chip wording, and the maintainer (Liam) approves this note in review
- Kind: user-visible

## What changes

When every model call of a run went to the built-in test model (a `type: mock` provider), the
CLI now says so, as Studio's Sample answers chip does. `halonic run`, `runs send` and `runs show`
print one dim line after the steps: "On Sample answers: the built-in test model wrote this run's
answers, not a real model." `halonic runs` adds "· Sample answers" to the run's row, and the
`--json` output gains a `sampleAnswers` true/false field. The new requirement
`cli.sample-answers` and its test file cover it.

The four golden files below only gain the new line or the new field. Nothing is weakened or
removed: no existing line of a golden file, no test and no requirement sentence changed.

## Covers

- apps/cli/src/commands/run/golden/support-reply-approved.txt
- apps/cli/src/commands/run/golden/support-reply-waiting.txt
- apps/cli/src/commands/runs/golden/month-spend.txt
- apps/cli/src/commands/runs/golden/support-reply-output.txt
