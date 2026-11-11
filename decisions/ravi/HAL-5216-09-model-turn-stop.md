# Decision: a cancel stops a run's model call too

- Approval: the plan was approved by Liam on [HAL-5556](/HAL/issues/HAL-5556) for finding 658 on [HAL-5216](/HAL/issues/HAL-5216); Liam approves this note in review
- Kind: internal
- Signature: pending
- Task: HAL-5216

## What changes

`engine.local-run-cancel` said a model call going on finishes and the run takes its result no
more. It now says the cancel stops the run's model calls as it stops its harness calls, as the
new `engine.model-call-stop` describes. Connector calls still finish. Every other promise and
example stays as it was. No test was removed or weakened.

## Why

A cancelled run, or an engine that stopped, kept paying for a model call for up to the adapter's
own time limit (10 minutes), and nothing could end it sooner. Liam's conditions on HAL-5556 are
met:

- One generic registry: `LiveHarnessCalls` became `LiveCalls`, which takes its stop messages. The
  harness and the model calls each have their own.
- A stop is not a failure: a stopped model call tries no other model, and the run records
  nothing it gives.
- Listener clean-up: the host's `abortOnStop` removes its listener on the stop once the call
  has settled.

One change from the plan: core code can't make an `AbortSignal` (it sees the Web types but not
their values), so the bridge from the engine's `StopSignal` lives in the host, as the executor
option `abortOnStop`. The CLI passes it. Without it, the engine still stops the call: it drops the
answer and records nothing.

## Covers

- engine.local-run-cancel
