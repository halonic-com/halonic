# Decision: accept the watch tests' run-to-run expect count on the parity test's pull request

- Task: HAL-6254
- Approval: Liam approves this note in review on [HAL-6254](/HAL/issues/HAL-6254)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ktvj36qoxcL9O6Gil7y6DHBdzfFeMIxL+th9kh6tiIRTJkZ2uBd0bJ0nu9wGwFHLvawFDfI3Fxt+SG1+2vP3Cw==

## What changes

Nothing in the watch tests. This pull request adds one new test file, `apps/cli/src/run-facts-parity.test.ts`, and changes no other file in `apps/cli`.

## Why

The requirement guard flags `cli.commands.routines.watch`: 232 `expect` calls on the pull request against 243 on the merge base. Because the pull request changes a file in `apps/cli`, the guard compares the count of every requirement in that package.

The count drifts between runs without a code change. Two of the watch tests poll: "gives up on a run whose step kept failing for an hour" (HAL-5294) and "starts a routine when it's due and fires its run's timer". On the unchanged head, three local runs gave 237, 232 and 236. [HAL-5568](/HAL/issues/HAL-5568) records the same drift (221 vs 232, then 222 vs 227). The new parity test doesn't import or run any watch code, and no watch test was edited or skipped.

Rerunning the failed guard job doesn't help: it reads the head's and the merge base's saved result files again, so it compares 232 with 243 every time.

## Tests

No test was weakened or skipped. The parity test adds 30 tests of its own.

## Covers

- cli.commands.routines.watch
