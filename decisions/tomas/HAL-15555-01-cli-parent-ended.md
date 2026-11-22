# Decision: halonic runs show says a child run was cancelled because the run that started it ended

- Task: HAL-15555
- Approval: HAL-15555; Liam reviews this pull request and signs this note as the CTO (a team decision under HAL-2282: the CLI takes the run page's approved words from HAL-12411, UX check R9 on HAL-12390)
- Kind: user-visible

## What changes

`halonic runs show <child>` for a child run the engine cancelled because the run that started it
ended (its `run.parent-ended` cause, since #4340) said "Mail triage was cancelled in the step
Read the email. Nothing after it ran.", as if someone had cancelled it. It now says what Studio's
run page says:

- in a step: "✕ Mail triage was cancelled because the run that started it ended. Nothing after
  the step Read the email ran."
- between steps: "✕ … ended. The step Classify didn't start."
- before any step: "✕ Mail triage was cancelled because the run that started it ended."

Under it, indented, in place of the run page's **Open run**: "See the run that started it:
halonic runs show 4f2a1b", with the user's `--dir`. The receipt follows as before. A log written
before the cause, and a child of a run the person cancelled (which gets no cause), keep the plain
line.

## Why

Nina's C589 on #4340 (HAL-15545): the CLI and Studio told the same run's end differently. The
CLI reads the engine's typed cause, as the run page does, and never the error text.

## Tests

No test was weakened or removed. New tests cover the three lines and the parent line in
`runs.test.ts`, and `runs show` on stored child runs (in a step, between steps, before any step,
with `--dir`, and an older log without the cause) in `show-failed.test.ts`.

## Covers

- cli.commands.runs.show
