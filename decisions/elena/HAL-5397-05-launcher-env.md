# Decision: pin the harness program's environment in cli.local-harness-host

- Task: HAL-5397
- Approval: Elena, owner of the CLI requirements, approves this edit on HAL-10766 (2026-11-16); Liam signs this note with the pull request
- Kind: internal

## What changes

`cli.local-harness-host` gains one sentence and one example: a harness program gets only the variables on a fixed list of names (`PATH`, the locale, `TZ` and the Windows system variables) plus its run's own, built from that list and never from the CLI's environment minus some entries, so a variable the list doesn't know, such as a token, never reaches it. The example starts a program on this computer with a token in the CLI's environment and checks the program doesn't see it. `programEnvironment` is exported for the new test; its behaviour doesn't change. Nothing in the requirement was removed or weakened.

## Why

HAL-5397 N9: agents start through `sandbox-host` with only the profile environment, and a token in the parent environment must not reach the harness. The code already did this; the requirement now says so, so a later change can't quietly go back to "the parent's environment minus some entries".

## Tests

None skipped or weakened. `apps/cli/src/harness-program-environment.test.ts` is new and runs the real launcher.

## Covers

- cli.local-harness-host
