# engine.budget-stops

- Status: active
- Since: 0.1.0
- Source: HAL-186 implementation plan, step 6; task HAL-3788; the kernel sets `budget` itself (HAL-1728); subscription calls never count (HAL-2311, HAL-2461)

When a step decides on a model call or a harness run and the workspace has a budget, the kernel shall first work out what the run and the month have spent, from the run store's summaries: the run spend is the `cost` of its top-level run and of every child run under it, and the month spend is the `cost` of every run that started in the same calendar month (UTC). A call paid for by the person's subscription is never in a summary's `cost`, so it never counts. When the run spend is at or over `perRun`, or the month spend is at or over `monthly`, the kernel shall store the decided events followed by a `run.failed` with the reason `budget`, ask for no call, and tell the run's parent, if it has one. When a child run fails with the reason `budget`, its parent's `run.failed` shall have the reason `budget` too. Without a budget, or below it, the decision is stored as it is.

## Examples

- Given a monthly budget of 0.50 EUR and an earlier run this month that cost 0.60 EUR,
  when a `reply` run starts,
  then it fails in `draft` with the reason `budget` before its model call is made.
- Given the same budget and an earlier run that cost 0.60 EUR last month, or this month but paid by the person's subscription,
  when a `reply` run starts,
  then it completes.
- Given a run budget of 0.50 EUR and a run whose first call cost 0.60 EUR,
  when it reaches its second task state,
  then it fails there with the reason `budget`.
- Given a child run whose first call cost 0.60 EUR and a run budget of 0.50 EUR,
  when the child reaches its second task state,
  then the child and its parent fail with the reason `budget`.
- Given a parent that cost 0.25 EUR and two child runs under it that cost 0.25 EUR and 0.125 EUR,
  when the run spend of a child is worked out,
  then it is 0.625 EUR.
