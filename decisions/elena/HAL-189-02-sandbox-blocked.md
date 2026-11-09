# Decision: a `sandbox.blocked` run log event

- Approval: stack 1b of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), approved by Liam on [HAL-1967](/HAL/issues/HAL-1967); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-189

## What changes

The run log gains one event, `sandbox.blocked`, with `state`, `agent`, `block` and `count`.
`block` is a file, a site, or `others`. `sandboxBlockedView(block, home)` makes the logged copy
of a file or site block. Nothing is renamed or removed. The `events.run-log-contract` example
that lists the events added since the reference now names it, and the type test that pins the
list gains it.

The home-folder shortening that `sandboxOpenedView` used moves, unchanged, to its own internal
file, so both views write `~` the same way. Its tests stay as they are.

## Why

A person needs to see why a sandboxed step is stuck: which file or site was refused. A program
in a retry loop can be refused thousands of times, so the log has to stay bounded:

- `count` is the running total of refused accesses to that target in the step so far. The
  engine (plan stack 4e) writes a target's first block at once with `count: 1`, and one more
  event with the total at the end of the step, only when the total is above 1 (Liam's review).
  A later event replaces an earlier count; it doesn't add to it. Two events for one target, with
  `count` 1 and then 7, mean 7 refused accesses, not 8 (Liam's review on HAL-2125).
- A step's log names at most 100 targets (`maxBlockedTargetsPerStep`). Blocks of any further
  target are counted in `others` events, whose `count` is a running total in the same way.

HAL-1708's "named once with a count" log line reads these events.

`SandboxBlock` is copied from the `Sandbox` port, the way `SandboxStrength` is, because the API
types packages stand alone. Paths in the home folder start with `~`, as in `sandbox.opened`.

Each event opens a timeline entry of its own; the first block and the total aren't paired,
because that would change the `events.timeline-entry-id` table. The run summary doesn't change:
the blocks belong to a step, and Studio reads them from the step's events. Older logs have no such
event and read as before.

No test was weakened or removed.

## Covers

- events.run-log-contract
- events.sandbox-blocked
- packages/core/events/src/run-event.test.ts
