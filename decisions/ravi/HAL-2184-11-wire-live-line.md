# Decision: other output goes above the live line

- Requirement: `cli.progress` (`apps/cli/requirements/progress.md`)
- Task: HAL-2184; the second note of the review of #757 on HAL-2618 ("clear the live line before
  any other output goes to the same stream")
- Approval: the maintainer approves this note in review

## What changes

A live line is drawn without a newline, so a warning, error or result written while it shows
would start in the middle of it, and the line's next draw would erase that output. `cli.progress`
now says any other line is written above the live line: the live line is erased, the line
written, and the live line drawn again below it. When the command ends, the live line is taken
away, even when a step forgot to end it, so it never stays on the screen after the prompt comes
back. One example is added.

Both streams count, not only stderr: when stdout is a terminal too, it shares the screen with the
live line. cli-output 1.5 doesn't say how other output and the live line meet. It is a detail of
the approved line, so the team decides it (board, HAL-2282).

## Tests

No guard was weakened. The existing examples keep their tests. The hand-moved clock moved from
`progress.test.ts` to `src/test/manual-clock.ts` unchanged, so `runCli`'s tests can use it too.
New tests cover writing around the line, a line already cleared, closing it for good, a result
printed through `runCli` while a step's line shows, and no live line with `--json` or in CI.
