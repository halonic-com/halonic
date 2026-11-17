# Decision: a budget stop logs its figures in the run's cause, and the CLI words it from them

- Approval: HAL-12012, decided by Liam on that task (from HAL-12008). Liam reviews this pull request, so he signs the note.
- Kind: user-visible
- Task: HAL-12012

## What changes

- `engine.budget-stops` adds to its source and examples that the `run.failed` of a budget stop carries the typed cause `{ kind: "limit_reached", code: "budget.run" | "budget.month", detail: { limit, spent, currency } }`, with the numbers unrounded, and that a parent keeps its child's cause. No event field is new: `cause` is the one `events.run-failed-cause` already has.
- `engine.budget-stop-message` adds that an amount above zero never reads as `0.00`: below 0.0001 it has the decimals its first digit needs, and one example for it.

- `cli.run-failure` says `budget` is worded from that cause first, in the budget's currency and with the reset day, and from the engine's error text (the HAL-12007 reading) for a log written before the cause. Only a budget stop with neither keeps the general lines.

## Why

The `run.failed` event didn't say which budget stopped a run, its limit or its spend, so the CLI could only print the general "can't tell the cause yet" lines, and a tiny limit read as `0.00`. Nothing a run did before changes; an older log without the cause keeps the budget lines, read from its error text.

## Covers

- engine.budget-stops
- engine.budget-stop-message
- cli.run-failure
