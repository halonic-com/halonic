# Decision: a run that reaches a unit's limit of its customer's plan waits for continue

- Task: HAL-13220
- Approval: /HAL/issues/HAL-13220 (Owen's plan, approved with changes by Liam on the task, 25 Nov)
- Kind: user-visible

## What changes

- New requirement `engine.plan-limit-wait`. With a meter set, a step whose paid call the meter
  refuses with `plan.<unit>` or `plan.member.<unit>` no longer fails the run: the engine stores
  `run.limit-waiting` with the stop and the refused input, and none of the refused decision's
  events. `continue` decides that input again from the unchanged run, so the step starts from its
  beginning, and asks the limits again for the run's own principal. A run nobody continues fails
  with the reason `budget` 7 days later, through one `Scheduler` timer.
- `budget.run`, `budget.month`, `plan.none`, `plan.suspended`, `plan.member-removed` and a step's
  own `harness.max-*` limits stay final. When a unit's limit and the monthly budget are both
  reached, the run fails with `budget.month`.
- `engine.meter-checks` changes to match: its examples that expected `plan.cost` to fail the run
  now use `plan.suspended`, which still does, and its text points to the new requirement. The two
  tests in `local-runs-meter.test.ts` change the same way; what they check is otherwise the same.
- A starting run whose first step is refused keeps its `run.started` and waits; `continue` goes on
  from there with the same decision a start makes after `run.started`.

## Decided on purpose

- **A waiting run keeps its concurrency slot.** It hasn't ended, so the meter's count of running
  runs still includes it until it continues or fails after 7 days. A customer at a unit's limit
  with many waiting runs can therefore also be refused new starts with `plan.concurrency`.
- **A waiting child run doesn't tell its parent**, which stays running; `continue` goes to the
  child.
- **The refused input is kept in the log** (`run.limit-waiting`'s `input`), because the refused
  decision isn't stored and `continue` has to decide it again. It holds what the log already holds
  elsewhere (a model's answer, a person's sent event), never a key.
- **Out of scope:** `plan.concurrency` (asked only before a run starts, so nothing can wait), and a
  model call cut off partway by a reservation, left to the reservation work.

## Covers

- engine.meter-checks
- packages/core/engine/src/run/local-runs-meter.test.ts
