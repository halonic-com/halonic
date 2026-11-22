# Decision: the Acme review step drops "Sample: the test model writes this reply to any email."

- Approval: decided by the team in the first-run build plan (first-run-flow 10.2 R5, after the board's yes on HAL-7993); the maintainer (Liam) approves this note in review
- Kind: internal
- Task: HAL-13435

## What changes

The `review` wait step in the Acme sample's `support-reply` workflow ends with "Approving finishes
the run. Nothing is sent." and no longer with "Sample: the test model writes this reply to any
email." first. The Inbox card shows the step's description, and once someone picks a real model in
first run that sentence is false. On the Sample answers path the card's **Sample answers** chip
says it instead. This reverses the line added in HAL-5975.

The three golden files print that step's body, so they follow. They also pin the workspace's
`definitionsVersion`, a hash of the definitions, which changes with the text. Nothing else in them
changes. No requirement or test was changed, weakened or removed.

## Covers

- apps/cli/src/commands/run/golden/support-reply-approved.txt
- apps/cli/src/commands/run/golden/support-reply-waiting.txt
- apps/cli/src/commands/runs/golden/support-reply-output.txt
