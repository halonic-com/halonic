# Decision: Ctrl C says so when it couldn't cancel the run

- Requirement: `cli.run` (`apps/cli/requirements/run.md`)
- Task: HAL-4356; the direction decided by Liam in his review of #1371 on HAL-4349
- Approval: the maintainer approves this note in review
- Kind: internal

Since HAL-3963, a stopped follow says whether the cancel worked. `halonic run` still said "The
run <run-id> was cancelled after the step Classify it. Nothing after it ran." when it didn't.
That wasn't true: the run stays in the store and goes on the next time the workspace's engine
opens.

When the cancel didn't work, the line after "Stopped." is now:

> The run 01JD8Q wasn't cancelled, only no longer followed, so it may go on. See where it is:
> halonic runs show 01JD8Q

It says this whatever step the run was at, including before any step finished, because "Stopped."
alone would hide that the run goes on. There is no cancel command yet, so it points to `runs show`.
"May go on" rather than "goes on", because a run that ended just before the cancel came also
reports a cancel that didn't work. A cancelled run says what it said before.

The requirement gains one sentence and one example. Nothing else in it changes. Today only
`halonic run` follows through `followUntilStopped`, so only it gives this line. `runs send` gets
it once it moves onto that shared helper (HAL-4025).

This is wording on behaviour the board already approved (cli-output 1.5), which the team decides
(board, HAL-2282), so the note is internal. The designer checked and approved the words on
HAL-4369.

## Covers

- cli.run
- apps/cli/requirements/run.md
