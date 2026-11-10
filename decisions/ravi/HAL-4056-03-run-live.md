# Decision: `halonic run` lines up its step lines by the workflow, not by the steps that ran

- Requirement: `cli.run-live` (`apps/cli/requirements/run-live.md`)
- Task: HAL-4056; plan approved by the maintainer on HAL-4064 (PR 3, "Columns")
- Approval: the maintainer approves this note in review
- Kind: internal

`halonic run` now prints each step's ✓ line as soon as the step ends (cli-output 3.4, "Live, in a
terminal"). A line that is already printed can't be widened later, so the plan takes the column
widths from the workflow's definition: each step's name, and the agent that runs it. Until now
they came from every line of the run, the last one included.

That last line is the wait step's, "you approved at 14:01" or "waiting for you since 14:01", and
it made the agent column as wide as itself, though nothing comes after it on its own line. So
the time on the ✓ lines moves left, next to the agent, and both golden files now line it up the
same way:

```text
before:  ✓ Read the email        Writer                        1 s
after:   ✓ Read the email        Writer   1 s
```

Only the spaces between the agent and the time change, in the colour and `NO_COLOR` sections.
The words, the step column and the `--json` sections stay the same. `halonic runs show` keeps its
widths from the run log and doesn't change. No requirement or test was changed or removed.

## Covers

- apps/cli/src/commands/run/golden/support-reply-waiting.txt
- apps/cli/src/commands/run/golden/support-reply-approved.txt
