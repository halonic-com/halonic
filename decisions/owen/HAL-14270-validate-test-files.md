# Decision: `validate` checks what a workflow test names

- Approval: Liam asked for this on HAL-14270 (/HAL/issues/HAL-14270), from Nina's check C337 on HAL-14257 (rows 12–14, code row C18); a team decision that builds on the approved C336 wording; Owen wrote it, so Liam signs
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:s+pfaqBz1Z60ajRvyQSCfLYE5CauWAt6OWs8rGH9WSdfl4xoqdDJZcSkwefWcdq0RqNBhyn6lchSYS6OrpDfBQ==

## What changes

`validate` now checks a workflow test against its workflow, where it said "No problems" before (new requirement `workspace.test-references`): a mocked agent the workflow's runs don't call is an error with "Did you mean", a mocked reply that isn't one of a `choice` agent's options is a warning, and an `expect.final` or `expect.states` step the workflow doesn't have is an error with "Did you mean". "Did you mean" follows the CLI's rule for commands, now shared as `std.near-match`.

Because `halonic test` stops when `validate` finds an error, a test that names a step its workflow doesn't have now stops before any test runs, with exit 2 and "See them with: halonic validate", instead of running and failing with exit 1. The third example of `cli.commands.test.run-tests` says so now, and its test in `apps/cli/src/commands/test/command.test.ts` checks the new outcome. The sentences `test` prints for an unknown step stay, and `apps/cli/src/output/test-report.test.ts` still checks them.

## Why

In Nina's check, a misspelled mock key or a reply outside the options made `test` fail with a message that doesn't name the cause, or with none. `validate` already knows every name involved, so it can say it before any test runs.

## Tests

No test was skipped or weakened: one CLI test expects the new outcome for the same mistake. `packages/core/workspace/src/checks/workflow-tests.test.ts` covers each case with its code, line and message, and `apps/cli/src/commands/validate/acme-mistakes.test.ts` makes rows 12–14 on a copy of Acme and checks the line and exit code of each. The test-runner test for scripted replies the runs never ask for mocked an agent its workflow doesn't use, which `validate` now refuses; it now gives the writer of the draft workflow two replies more than the run asks for, and checks the same failure. The workspace parity tests pass with no new allowed difference.

## Covers

- cli.commands.test.run-tests
- apps/cli/src/commands/test/command.test.ts
