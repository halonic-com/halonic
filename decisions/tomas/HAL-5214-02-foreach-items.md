# Decision: a run's child runs end with it

- Requirements: `engine.budget-composite-stops` (`packages/core/engine/requirements/budget-composite-stops.md`)
- Task: HAL-5214, findings of the 11 Nov code review
- Approval: Liam approves this note in his review of this pull request on
  HAL-5214
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:aUpYggRllL38n8D9FtqUfMS2Phz9gyJfGq6wqqnJ56QVbcxKEBulM1wYdxdGdfJ5OKUqqEoS8+r1WvkYNgk+Bg==

## What changes

When a run ends, the local executor now cancels every child run it started and hasn't heard end,
all the way down (the new `engine.child-runs-end-with-run`). Before, a cancel reached only the
child a `workflow` state waits on, and a run that failed left its `foreach` items' child runs
going, with their harness calls. A `cancel-child` effect (HAL-6090) now ends a child the same
way, so it also reaches that child's own `foreach` items.

`engine.budget-composite-stops` said that when one `foreach` item's child run stops for the
budget, the other items' child runs each stop at their next model call or harness run, because
they spend from the same budget. They are now cancelled with the run, at once, with
`reason: "cancelled"`: a harness run going on no longer runs on to its end first. The first
child and the run still fail with `reason: "budget"`, and the run's error is unchanged. The
requirement's sentence and its third example now say so.

## Tests

No test was weakened. In `local-runs-composite-budget.test.ts`, the test for that example now
expects the second child run to be cancelled with the new error, instead of stopped for the
budget. It makes the same number of `expect` calls.

## Covers

- engine.budget-composite-stops
