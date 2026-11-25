# Decision: halonic routines' last line names halonic serve

- Task: HAL-18602
- Approval: HAL-18602; team wording on an approved line of command output (HAL-2282), follow-up from HAL-18499; the reviewer signs this note as the CTO
- Kind: user-visible

## What changes

The dim line under the `halonic routines` list reads "Routines start on time only while this
workspace is open in Halonic Studio, or while `halonic serve` or `halonic routines watch` is
running." (was "… open in Halonic Studio or `halonic routines watch` is running.").

The requirement `cli.commands.routines.list` says the new words, its two golden files take the
new last line, and the four list tests expect it. `README.md` and `apps/cli/README.md` quote it.
No test was weakened or skipped.

## Why

Since #6097 (HAL-18499), `halonic serve` starts the workspace's routines too, so a line that
names only Studio and `routines watch` tells a user running `serve` that their routines won't
start, which is wrong.

## Covers

- cli.commands.routines.list
- apps/cli/src/commands/routines/golden/acme-routines.txt
- apps/cli/src/commands/routines/golden/acme-routines-two-hubs.txt
- apps/cli/src/commands/routines/list.test.ts
- apps/cli/src/commands/routines/list-cant-start.test.ts
- apps/cli/src/commands/routines/list-not-live.test.ts
- apps/cli/src/commands/routines/list-trust.test.ts
