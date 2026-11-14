# Decision: say that routines start on time only while `halonic routines watch` runs

- Task: HAL-9091
- Approval: Liam approves this change on HAL-9091 (https://paperclip.halonic.com/HAL/issues/HAL-9091#comment-30d490d7-12dc-4481-844a-833e5d79a39a): "I approve the change as described in the task: the dim line under `halonic routines` and the `routines watch` step in `init --example`." A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

`halonic routines` ends its list with one dim line: "Routines start on time only while
`halonic routines watch` is running." `init --example` adds a `halonic routines watch` step to its
next steps when the copy has routines.

The requirement `cli.commands.routines.list` gains this line, and the three goldens that print it
(`init/golden/example.txt`, `routines/golden/acme-routines.txt`,
`routines/golden/acme-routines-two-hubs.txt`) are updated. No test was weakened or skipped.

## Why

After `init --example acme` the user sees "1 routine" and "Next 16 Nov 09:00 · Never ran" with no
hint that nothing fires unless the watcher runs (HAL-9080 gap 5).

## Covers

- cli.commands.routines.list
- apps/cli/src/commands/init/golden/example.txt
- apps/cli/src/commands/routines/golden/acme-routines.txt
- apps/cli/src/commands/routines/golden/acme-routines-two-hubs.txt
