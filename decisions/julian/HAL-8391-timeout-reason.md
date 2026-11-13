# Decision: a program still starting when the time limit runs out ends as a timeout

- Approval: HAL-8391 asked for this fix and a requirement example; the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-8391

## What changes

`sandbox-host.start` already said a session whose time limit runs out ends its programs with the
reason `timeout`. One example is added: that holds for a program that is still starting when the
limit runs out. No example was removed or weakened.

## Why

If the limit ran out while a program was still being started (a slow Windows runner), the program
joined an already closed session and was stopped with the reason `stopped`. The session now keeps
why it closed and gives that reason to a program that was still starting. This was the cause of the
flaky Windows test.

## Covers

- sandbox-host.start
