# Decision: the Worker starts runs, so its 501 answers become 202 and 409

- Requirements: `runtime.serve`, `cloudflare-live.webhooks`, `cloudflare-live.fixture`
- Task: HAL-16198, part b of the plan on HAL-13210
- Approval: HAL-16198, Liam's review; Liam reviews and signs this note
- Kind: internal

## What changes

The Worker's API now starts, sends events to and cancels runs with its own executor
(`workerExecutor`, HAL-16012), from the run-definitions index of the snapshot it serves
(HAL-16011). The new requirement `runtime.worker-runs` says how. `runsNotAvailable` is retired.

- `runtime.serve` said no run is started yet, so a signed webhook delivery answered 501 and kept
  its delivery id. Now the delivery starts the routine's run and answers 202, and the same delivery
  again answers 409, as on `halonic serve`. The checks before the start (signature, time window,
  replay refusal, one neutral answer) are unchanged.
- `cloudflare-live.webhooks` had two pending checks that passed only on 501 and were written to fail
  the day the Worker starts runs, "so they are changed to 202 and 409 when the Worker starts runs".
  This is that day: the checks now expect 202 for a signed delivery and 409 for the same delivery id
  again. A Worker that answers 501, or that starts a run for a repeated delivery, fails them.
- `cloudflare-live.fixture` now deploys the workflow the routine starts (`handle-order`, which ends
  at its first state and calls no model), so the live delivery has a run to start.

Nothing is weakened: every check still asserts a status, and the replay check is stricter than before.

## Why

Part b of the S0 plan (HAL-13210): the Worker's start route uses the Worker's executor. The live
suite runs on this change, so its pending checks have to move with it, which the plan had left to
part d.

## Covers

- `runtime.serve`
- `cloudflare-live.webhooks`
- `cloudflare-live.fixture`
