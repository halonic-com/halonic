# studio.engine-contract

- Status: active
- Since: unreleased
- Source: HAL-14219 (B1 step 4 PR 3, plan approved by Liam there); design note D3, D6 and D8 on HAL-14206; `studio.remote-engine`, `studio.engine-service`

The window's own engine (`studio.engine-service`) and the background engine as the window reaches it through the shell (`studio.remote-engine`) shall behave the same for what the window asks of them. Each shall start a run of a workflow with its input and record it with a `manual` trigger. Each shall run a routine now and record its run with a `manual` trigger that names the routine's key. Each shall list the runs that wait for a person. Each shall take the first answer to a wait step and refuse a later answer for the same step. Each shall cancel a run that waits, which then ends as failed and no longer waits.

## Examples

- Given Acme's `review` workflow waits at its step `review`,
  when the window starts it, through either engine,
  then the run waits at `review` and its trigger is `manual`.
- Given Acme's routine `support/nightly` runs `review`,
  when the person presses Run now, through either engine,
  then the run's trigger is `manual` and names `support/nightly`.
- Given a run of `review` waits,
  when the person approves it and then rejects the same wait step,
  then the approval completes the run and the rejection is refused, through either engine.
