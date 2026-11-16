# Decision: the CLI names the cause when a run fails to start

- Task: HAL-11004
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11004 (follow-up to HAL-10967, whose cli-output 3.4 wording for known causes the board approved; no new wording)
- Kind: user-visible

## What changes

When `run.failed` carries `sandboxReason` on a sandbox start failure, line 1 of cli-output 3.4 ends
with "didn't start: reason". When it carries `harnessCause` (not installed or signed out) on a
harness start failure, the CLI prints the approved known-cause rows. Without these fields, and for
older logs, the plain line prints as before.

The requirement `cli.run-failed-start-and-memory` gains these cases. No test was weakened or skipped.

## Why

The engine and events already carry the cause (halonic#3147), but the CLI dropped it, so a user saw
the same plain line for every start failure.

## Covers

- cli.run-failed-start-and-memory
